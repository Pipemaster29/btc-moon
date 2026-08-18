/**
 * Ciclo de vigilância da BTW, rodando dentro do Supabase.
 *
 * Existe em vez de um agendador externo por uma razão de cadência: os nós
 * públicos da BSC só servem log da última hora, e quanto mais curto o intervalo
 * entre leituras menor a chance de uma transferência passar sem ser vista. O
 * `pg_cron` desta mesma base dispara de 10 em 10 minutos — seis vezes mais
 * frequente do que caberia no plano gratuito do GitHub Actions.
 *
 * As REGRAS DE DETECÇÃO não moram aqui. Elas vêm de `lib/alerts.ts` do
 * repositório, enviado junto no deploy sem uma linha alterada, porque duas
 * cópias das regras acabariam divergindo — e a que diverge silenciosamente é
 * sempre a que está em produção. Este arquivo é só o encanamento: ler a cadeia,
 * ler o estado anterior, chamar `detect`, avisar, gravar o novo estado.
 */

import { detect } from "./alerts.ts";
import type { Observation, TransferSeen, WalletMemory } from "./alerts.ts";
import { WATCHLIST, labelOf } from "./watchlist.ts";
import type { WatchedToken } from "./watchlist.ts";

const RPC = [
  "https://bsc-rpc.publicnode.com",
  "https://bsc.publicnode.com",
  "https://bsc-dataseed.binance.org",
  "https://bsc-dataseed1.defibit.io",
];

const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const MAX_LOG_SPAN = 5000;
/** Um alerta já enviado não repete dentro desta janela. */
const QUIET_HOURS = 6;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BOT_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
const CHAT_ID = Deno.env.get("TELEGRAM_CHAT_ID");

let cursor = 0;

async function rpc(method: string, params: unknown[]): Promise<unknown> {
  let lastError = "sem resposta";

  for (let attempt = 0; attempt < RPC.length * 2; attempt++) {
    const url = RPC[cursor++ % RPC.length];
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(20_000),
      });
      // Nó sobrecarregado às vezes responde texto puro; deixar o parser
      // estourar derrubaria o ciclo inteiro.
      const text = await res.text();
      const body = JSON.parse(text) as { result?: unknown; error?: { message: string } };
      if (body.error) {
        lastError = body.error.message;
        continue;
      }
      if (body.result !== undefined) return body.result;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }
  throw new Error(`${method}: ${lastError}`);
}

const pad = (a: string) => a.toLowerCase().slice(2).padStart(64, "0");
const toUnits = (v: bigint, decimals: number) =>
  Number((v * 1_000_000n) / 10n ** BigInt(decimals)) / 1_000_000;

async function call(to: string, data: string): Promise<string> {
  return (await rpc("eth_call", [{ to, data }, "latest"])) as string;
}

// --------------------------------------------------------------------- REST

/** Consulta PostgREST direto, sem SDK — menos peça para dar errado. */
async function db(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      authorization: `Bearer ${SERVICE_KEY}`,
      "content-type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

// ----------------------------------------------------------------- Telegram

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, (c) => `\\${c}`);
}

async function notify(title: string, detail: string): Promise<boolean> {
  if (!BOT_TOKEN || !CHAT_ID) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: `*${escapeMarkdown(title)}*\n\n${escapeMarkdown(detail)}`,
        parse_mode: "MarkdownV2",
        disable_web_page_preview: true,
      }),
      signal: AbortSignal.timeout(15_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// -------------------------------------------------------------------- ciclo

async function inspect(token: WatchedToken): Promise<number> {
  const addresses = token.wallets.map((w) => w.address);

  const [decimalsHex, head, pairsRes] = await Promise.all([
    call(token.contract, "0x313ce567"),
    rpc("eth_blockNumber", []).then((h) => Number(BigInt(h as string))),
    fetch(`https://api.dexscreener.com/latest/dex/tokens/${token.contract}`, {
      signal: AbortSignal.timeout(20_000),
    }).then((r) => r.json()),
  ]);

  const decimals = Number(BigInt(decimalsHex));

  // Preço e liquidez vêm da pool mais funda da rede: pools rasas têm preço
  // empurrado por poucos dólares e a média deixaria esse ruído entrar.
  const pairs = ((pairsRes as { pairs?: unknown[] }).pairs ?? [])
    .map((p) => p as { chainId?: string; priceUsd?: string; liquidity?: { usd?: number } })
    .filter((p) => p.chainId === token.chain && (p.liquidity?.usd ?? 0) > 0)
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));

  const price = Number(pairs[0]?.priceUsd ?? 0);
  const liquidityUsd = pairs.reduce((s, p) => s + (p.liquidity?.usd ?? 0), 0);

  const [balances, gas] = await Promise.all([
    Promise.all(
      addresses.map(async (a) =>
        [a.toLowerCase(), BigInt(await call(token.contract, `0x70a08231${pad(a)}`))] as const,
      ),
    ),
    Promise.all(
      addresses.map(async (a) =>
        [a.toLowerCase(), BigInt((await rpc("eth_getBalance", [a, "latest"])) as string)] as const,
      ),
    ),
  ]);

  const balanceMap = new Map(balances);
  const gasMap = new Map(gas);

  const current: Observation[] = token.wallets.map((w) => {
    const key = w.address.toLowerCase();
    return {
      address: w.address,
      label: w.label,
      role: w.role,
      balance: toUnits(balanceMap.get(key) ?? 0n, decimals),
      bnb: Number(gasMap.get(key) ?? 0n) / 1e18,
    };
  });

  // ---------------------------------------------------------- transferências
  const transfers: TransferSeen[] = [];
  try {
    const logs = (await rpc("eth_getLogs", [
      {
        fromBlock: `0x${Math.max(head - MAX_LOG_SPAN, 0).toString(16)}`,
        toBlock: `0x${head.toString(16)}`,
        address: token.contract,
        topics: [TRANSFER_TOPIC],
      },
    ])) as { blockNumber: string; topics: string[]; data: string }[];

    const decoded = logs
      .filter((l) => l.topics.length >= 3)
      .map((l) => ({
        from: `0x${l.topics[1].slice(-40)}`,
        to: `0x${l.topics[2].slice(-40)}`,
        amount: toUnits(BigInt(l.data === "0x" ? "0x0" : l.data), decimals),
        block: Number(BigInt(l.blockNumber)),
      }))
      .filter((t) => t.amount * price >= 100);

    // Checar carteira nova custa uma chamada por endereço; só vale gastá-las
    // com o que saiu de uma carteira vigiada.
    const tracked = new Set(addresses.map((a) => a.toLowerCase()));
    const toCheck = [
      ...new Set(decoded.filter((t) => tracked.has(t.from.toLowerCase())).map((t) => t.to.toLowerCase())),
    ];

    const fresh = new Map<string, boolean>();
    await Promise.all(
      toCheck.map(async (to) => {
        try {
          const n = (await rpc("eth_getTransactionCount", [to, "latest"])) as string;
          fresh.set(to, BigInt(n) === 0n);
        } catch {
          // Na dúvida não é novidade: falso positivo aqui vira alerta à toa.
          fresh.set(to, false);
        }
      }),
    );

    for (const t of decoded) {
      transfers.push({
        ...t,
        fromLabel: labelOf(token, t.from),
        toLabel: labelOf(token, t.to),
        toIsFresh: fresh.get(t.to.toLowerCase()) ?? false,
      });
    }
  } catch (error) {
    console.error(`logs indisponíveis: ${(error as Error).message}`);
  }

  // ------------------------------------------------------- estado anterior
  const previousRows = (await (
    await db(`monitor_state?token=eq.${token.symbol}&select=address,balance,bnb`)
  ).json()) as { address: string; balance: number; bnb: number }[];

  const previous: Record<string, WalletMemory> = {};
  for (const row of previousRows) {
    previous[row.address] = { balance: row.balance, bnb: row.bnb };
  }

  const silenced = new Set(
    (
      (await (
        await db(
          `monitor_alerts?fired_at=gte.${new Date(Date.now() - QUIET_HOURS * 3600_000).toISOString()}&select=fingerprint`,
        )
      ).json()) as { fingerprint: string }[]
    ).map((r) => r.fingerprint),
  );

  const alerts = detect({ previous, current, transfers, priceUsd: price, liquidityUsd })
    .filter((a) => !silenced.has(a.fingerprint));

  // A memória é gravada mesmo quando nada dispara: é ela que transforma o
  // próximo ciclo numa comparação em vez de um retrato solto.
  await db("monitor_state", {
    method: "POST",
    headers: { prefer: "resolution=merge-duplicates" },
    body: JSON.stringify(
      current.map((w) => ({
        token: token.symbol,
        address: w.address.toLowerCase(),
        balance: w.balance,
        bnb: w.bnb,
        updated_at: new Date().toISOString(),
      })),
    ),
  });

  // Primeira leitura não alerta: sem retrato anterior tudo pareceria mudança.
  if (previousRows.length === 0) {
    console.log(`${token.symbol}: primeira leitura, ${current.length} carteiras`);
    return 0;
  }

  let sent = 0;
  for (const alert of alerts) {
    if (await notify(alert.title, alert.detail)) sent++;
    await db("monitor_alerts", {
      method: "POST",
      headers: { prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        fingerprint: alert.fingerprint,
        token: token.symbol,
        kind: alert.kind,
        severity: alert.severity,
        title: alert.title,
        detail: alert.detail,
        value_usd: alert.valueUsd,
        fired_at: new Date().toISOString(),
      }),
    });
  }

  console.log(
    `${token.symbol}: ${current.length} carteiras · ${transfers.length} transferências · ${alerts.length} alertas · ${sent} enviados`,
  );
  return alerts.length;
}

Deno.serve(async (req: Request) => {
  const started = Date.now();
  const url = new URL(req.url);

  // Chamada de teste: prova que o Telegram está ligado sem esperar um evento.
  if (url.searchParams.get("test") === "1") {
    const ok = await notify(
      "✅ Radar BTW conectado",
      "Os alertas de carteira chegam por aqui. Ciclo a cada 10 minutos.",
    );
    return Response.json({ telegram: ok });
  }

  let total = 0;
  const errors: string[] = [];

  for (const token of WATCHLIST.filter((t) => t.contract)) {
    try {
      total += await inspect(token);
    } catch (error) {
      errors.push(`${token.symbol}: ${(error as Error).message}`);
    }
  }

  const ms = Date.now() - started;
  await db("monitor_runs", {
    method: "POST",
    body: JSON.stringify({ alerts: total, ms, errors: errors.join(" | ") || null }),
  });

  return Response.json({ alerts: total, ms, errors });
});
