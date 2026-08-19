/**
 * Um ciclo de vigilância: lê a cadeia, compara com a rodada anterior, alerta.
 *
 * Feito para ser chamado por um agendador, não para ficar rodando em laço. Cada
 * execução é independente e a memória vive em disco, então reiniciar não perde
 * estado e não existe processo para cair de madrugada.
 *
 * A cadência tem um limite duro: os nós públicos só servem log da última hora.
 * Rodar mais espaçado que isso deixa buracos em que uma transferência passa sem
 * ser vista, então 15 minutos é o alvo e 30 o teto.
 *
 * Rode com: npm run monitor
 *           npm run monitor -- --dry     (não envia, só mostra)
 *           npm run monitor -- --test    (manda uma mensagem de teste)
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  balancesOf,
  blockNumber,
  gasOf,
  toUnits,
  tokenInfo,
  transfersBetween,
  CHAINS,
} from "../lib/onchain";
import { depthOn, pairsOfToken } from "../lib/dexscreener";
import { WATCHLIST, labelOf, type WatchedToken } from "../lib/watchlist";
import { detect, type Alert, type Observation, type TransferSeen, type WalletMemory } from "../lib/alerts";
import {
  escapeMarkdown,
  markdownCode,
  markdownLink,
  sendTelegram,
  telegramFromEnv,
} from "../lib/telegram";
import { isFreshAddress } from "../lib/onchain";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
const testOnly = args.includes("--test");

const STATE = ".cache/monitor.json";
/** Um alerta já enviado não repete dentro desta janela. */
const QUIET_HOURS = 6;

interface State {
  wallets: Record<string, Record<string, WalletMemory>>;
  /** fingerprint → quando foi enviado, em segundos. */
  fired: Record<string, number>;
  lastBlock: number;
}

async function loadState(): Promise<State> {
  try {
    return JSON.parse(await readFile(STATE, "utf8")) as State;
  } catch {
    return { wallets: {}, fired: {}, lastBlock: 0 };
  }
}

const telegram = telegramFromEnv();

if (testOnly) {
  if (!telegram) {
    console.error("TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID não estão definidos.");
    process.exit(1);
  }
  const ok = await sendTelegram(
    telegram,
    escapeMarkdown("✅ Radar BTW conectado. Os alertas chegam por aqui."),
  );
  console.log(ok ? "Mensagem de teste enviada." : "Falhou — confira token e chat_id.");
  process.exit(ok ? 0 : 1);
}

if (!telegram && !dryRun) {
  console.error(
    "Telegram não configurado. Defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID,\n" +
      "ou rode com --dry para só ver os alertas no terminal.",
  );
  process.exit(1);
}

const state = await loadState();
const now = Math.floor(Date.now() / 1000);

/** O alerta viaja junto com a rede de origem, que decide o explorador do link. */
interface Pending {
  alert: Alert;
  explorer: string;
}

const pending: Pending[] = [];

for (const token of WATCHLIST.filter((t) => t.contract)) {
  const found = await inspect(token, state, now);
  const explorer = CHAINS[token.chain].explorer;
  pending.push(...found.map((alert) => ({ alert, explorer })));
}

// ------------------------------------------------------------------ envio
//
// Teto por rodada. Se algo disparar dezenas de alertas de uma vez, mandar todos
// é o mesmo que não mandar nenhum: o celular vira uma parede de notificação e o
// mais grave se perde no meio. Os mais graves passam, o resto vira uma linha.
const MAX_PER_CYCLE = 6;
const overflow = pending.length - MAX_PER_CYCLE;
const sending = pending.slice(0, MAX_PER_CYCLE);

if (pending.length === 0) {
  console.log("Nada digno de alerta neste ciclo.");
} else {
  console.log(`${pending.length} alertas:\n`);
  for (const { alert, explorer } of pending) {
    console.log(`  [${alert.severity}] ${alert.title}`);
    console.log(`      ${alert.detail}`);
    for (const address of alert.addresses) {
      console.log(`      ${explorer}/address/${address}`);
    }
    console.log("");
  }

  let delivered = 0;

  if (telegram && !dryRun) {
    if (overflow > 0) {
      await sendTelegram(
        telegram,
        escapeMarkdown(
          `⚠️ ${pending.length} alertas nesta rodada — mostrando os ${MAX_PER_CYCLE} mais graves. ` +
            `Volume assim costuma ser distribuição em andamento, não ruído.`,
        ),
      );
    }
    // Uma mensagem por alerta em vez de um bloco só: no celular a notificação
    // mostra as primeiras linhas, e um alerta crítico enterrado no meio de um
    // texto longo perde justamente a urgência que o torna útil.
    for (const { alert, explorer } of sending) {
      // O endereço vai em bloco de código, que o Telegram copia com um toque,
      // seguido do link para o explorador — conferir na fonte é o primeiro
      // passo depois de receber um aviso destes.
      const links = alert.addresses.map(
        (address) =>
          `${markdownCode(address)}\n${markdownLink("ver no explorador", `${explorer}/address/${address}`)}`,
      );

      const text = [
        `*${escapeMarkdown(alert.title)}*`,
        "",
        escapeMarkdown(alert.detail),
        ...(links.length ? ["", ...links] : []),
      ].join("\n");

      if (await sendTelegram(telegram, text)) {
        state.fired[alert.fingerprint] = now;
        delivered++;
      }
    }

    // Contagem real, não uma frase otimista: dizer "enviados" sem conferir
    // esconderia exatamente o caso em que o Telegram recusou a mensagem e o
    // alerta se perdeu em silêncio.
    console.log(
      delivered === sending.length
        ? `${delivered} enviados ao Telegram.`
        : `⚠ ${delivered} de ${sending.length} enviados — ${sending.length - delivered} FALHARAM.`,
    );
  }
}

// Esquece os silêncios vencidos, para o arquivo não crescer sem fim.
for (const [key, when] of Object.entries(state.fired)) {
  if (now - when > QUIET_HOURS * 3600 * 4) delete state.fired[key];
}

await mkdir(".cache", { recursive: true });
await writeFile(STATE, JSON.stringify(state, null, 2));

// --------------------------------------------------------------------- token

async function inspect(
  token: WatchedToken,
  state: State,
  now: number,
): Promise<Alert[]> {
  const addresses = token.wallets.map((w) => w.address);

  const [info, head, pairs, balances, gas] = await Promise.all([
    tokenInfo(token.chain, token.contract),
    blockNumber(token.chain),
    pairsOfToken(token.contract),
    balancesOf(token.chain, token.contract, addresses),
    gasOf(token.chain, addresses),
  ]);

  const depth = depthOn(pairs, token.chain);
  const price = depth?.priceUsd ?? 0;

  const current: Observation[] = token.wallets.map((wallet) => {
    const key = wallet.address.toLowerCase();
    return {
      address: wallet.address,
      label: wallet.label,
      role: wallet.role,
      balance: toUnits(balances.get(key) ?? BigInt(0), info.decimals),
      bnb: Number(gas.get(key) ?? BigInt(0)) / 1e18,
    };
  });

  // ---------------------------------------------------------- transferências
  //
  // A janela é definida em TEMPO, não em blocos, porque as redes têm ritmos
  // diferentes: 5 mil blocos são 37 minutos na BNB Chain e 167 na Base.
  //
  // Três horas cobrem com folga o pior atraso observado do agendamento do
  // GitHub — que pede 10 minutos e entrega 31 em média, chegando a 42. Menos do
  // que isso deixaria uma transferência escapar entre dois ciclos atrasados;
  // muito mais só traria evento velho e mais dados para trafegar.
  const config = CHAINS[token.chain];
  const WINDOW_HOURS = 3;
  const span = Math.min(
    Math.round((WINDOW_HOURS * 3600) / config.secondsPerBlock),
    config.prunedDepth,
  );
  const from = Math.max(head - span, 0);
  const transfers: TransferSeen[] = [];

  try {
    const raw = await transfersBetween(token.chain, token.contract, from, head);
    const bigEnough = raw.filter(
      (t) => toUnits(t.value, info.decimals) * price >= 100,
    );

    // Só os destinos que importam vão para a checagem de carteira nova: são
    // chamadas RPC extras e não vale gastá-las com poeira.
    const relevant = bigEnough.filter((t) =>
      token.wallets.some((w) => w.address.toLowerCase() === t.from.toLowerCase()),
    );

    const freshness = new Map<string, boolean>();
    await Promise.all(
      [...new Set(relevant.map((t) => t.to.toLowerCase()))].map(async (to) => {
        freshness.set(to, await isFreshAddress(token.chain, to));
      }),
    );

    for (const t of bigEnough) {
      transfers.push({
        from: t.from,
        to: t.to,
        amount: toUnits(t.value, info.decimals),
        block: t.block,
        fromLabel: labelOf(token, t.from),
        toLabel: labelOf(token, t.to),
        toIsFresh: freshness.get(t.to.toLowerCase()) ?? false,
      });
    }
  } catch (error) {
    console.error(`Logs indisponíveis para ${token.symbol}: ${(error as Error).message}`);
  }

  const previous = state.wallets[token.symbol] ?? {};

  const alerts = detect({
    symbol: info.symbol,
    gasSymbol: CHAINS[token.chain].gasSymbol,
    previous,
    current,
    transfers,
    priceUsd: price,
    liquidityUsd: depth?.liquidityUsd ?? 0,
  }).filter((alert) => {
    const last = state.fired[alert.fingerprint];
    return !last || now - last > QUIET_HOURS * 3600;
  });

  // A memória é gravada mesmo quando nada dispara: é ela que transforma o
  // próximo ciclo numa comparação em vez de um retrato solto.
  state.wallets[token.symbol] = Object.fromEntries(
    current.map((w) => [w.address.toLowerCase(), { balance: w.balance, bnb: w.bnb }]),
  );
  state.lastBlock = head;

  const known = Object.keys(previous).length;
  console.log(
    `${token.symbol}: ${current.length} carteiras · ${transfers.length} transferências · ` +
      (known ? `${alerts.length} alertas` : "primeira leitura, sem comparação"),
  );

  return known ? alerts : [];
}
