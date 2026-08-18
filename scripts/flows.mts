/**
 * Para onde a moeda vai, e quem são os maiores donos.
 *
 * Duas perguntas, dois caminhos diferentes:
 *
 *   FLUXO   — todas as transferências que tocam as carteiras vigiadas, na vida
 *             inteira do token, filtradas por tópico. É exato.
 *   DONOS   — quem tem mais. Não existe forma exata e barata: replayar as ~19
 *             milhões de transferências do token levaria horas. O que se faz é
 *             montar um conjunto de candidatos (contrapartes das carteiras
 *             vigiadas mais quem se moveu nos últimos dias), consultar o saldo
 *             de cada um, e MEDIR a cobertura contra o supply. A cobertura
 *             impressa no fim diz quanto do total o ranking realmente explica —
 *             sem ela o número seria um chute com cara de precisão.
 *
 * O saldo histórico é ancorado: pega-se o saldo real no bloco inicial da
 * varredura e aplicam-se os deltas. Assim uma varredura parcial ainda produz
 * uma série correta, em vez de uma que começa do zero e mente.
 *
 * Rode com: npm run flows -- --days=2
 *           npm run flows -- --all      (vida inteira, ~50 min)
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  balanceAt,
  balancesOf,
  blockNumber,
  blockTime,
  isContract,
  scanTransfers,
  toUnits,
  tokenInfo,
  CHAINS,
  type Transfer,
} from "../lib/onchain";
import { depthOn, pairsOfToken } from "../lib/dexscreener";
import { WATCHLIST, findToken, labelOf, type WatchedToken } from "../lib/watchlist";

const args = process.argv.slice(2);
const flag = (name: string) => args.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const symbol = (args.find((a) => !a.startsWith("--")) ?? "BTWUSDT").toUpperCase();
const days = Number(flag("days") ?? 2);
const scanAll = args.includes("--all");
/** Janela sem filtro, para achar carteiras grandes que ninguém indicou. */
const wideDays = Number(flag("wide") ?? 2);

const token = findToken(symbol);
if (!token?.contract) {
  console.error(`${symbol} não tem contrato configurado.`);
  console.error(`disponíveis: ${WATCHLIST.filter((t) => t.contract).map((t) => t.symbol).join(", ")}`);
  process.exit(1);
}

const money = (v: number) =>
  v >= 1e9 ? `$${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M`
    : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}k` : `$${v.toFixed(0)}`;

const units = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(2)}M`
    : v >= 1e3 ? `${(v / 1e3).toFixed(1)}k` : v.toFixed(0);

// ------------------------------------------------------------------- cache

interface Cache {
  from: number;
  to: number;
  transfers: { b: number; h: string; f: string; t: string; v: string }[];
}

const CACHE = `.cache/flows-${symbol}.json`;

async function loadCache(): Promise<Cache | null> {
  try {
    return JSON.parse(await readFile(CACHE, "utf8")) as Cache;
  } catch {
    return null;
  }
}

const pack = (t: Transfer) => ({ b: t.block, h: t.txHash, f: t.from, t: t.to, v: t.value.toString() });
const unpack = (r: Cache["transfers"][number]): Transfer => ({
  block: r.b, txHash: r.h, from: r.f, to: r.t, value: BigInt(r.v),
});

// -------------------------------------------------------------------- scan

const head = await blockNumber(token.chain);
const info = await tokenInfo(token.chain, token.contract);
const wallets = token.wallets.map((w) => w.address);
const tracked = new Set(wallets.map((w) => w.toLowerCase()));

const wanted = scanAll
  ? token.firstBlock
  : Math.max(token.firstBlock, head - Math.round((days * 86400) / CHAINS[token.chain].secondsPerBlock));

console.log(`\n${"=".repeat(94)}`);
console.log(`${symbol} · ${info.symbol} · fluxos e maiores donos`);
console.log("=".repeat(94));
console.log(
  `\n  varrendo do bloco ${wanted} ao ${head} (${((head - wanted) * CHAINS[token.chain].secondsPerBlock / 86400).toFixed(1)} dias)`,
);

const cached = await loadCache();
let transfers: Transfer[] = [];

if (cached && cached.from <= wanted && cached.to >= head - 20_000) {
  transfers = cached.transfers.map(unpack).filter((t) => t.block >= wanted);
  console.log(`  cache cobre o período · ${transfers.length} transferências`);
} else {
  const from = cached ? Math.min(cached.from, wanted) : wanted;
  const chunks = Math.ceil((head - from) / 5000);
  console.log(`  ${chunks} faixas × 2 consultas · estimativa ${(chunks * 2 / 4.6 / 60).toFixed(0)} min\n`);

  let lastPrint = 0;
  const scan = await scanTransfers({
    chain: token.chain,
    token: token.contract,
    fromBlock: from,
    toBlock: head,
    involving: wallets,
    onProgress: (done, total, found) => {
      const now = Date.now();
      if (now - lastPrint < 5000 && done < total) return;
      lastPrint = now;
      const pct = ((done / total) * 100).toFixed(1);
      process.stdout.write(`\r  ${done}/${total} faixas (${pct}%) · ${found} transferências   `);
    },
  });
  console.log(scan.failed ? `\n  ${scan.failed} faixas falharam` : "");

  // Junta com o que já existia, sem duplicar.
  const merged = new Map<string, Transfer>();
  for (const t of [...(cached?.transfers.map(unpack) ?? []), ...scan.transfers]) {
    merged.set(`${t.txHash}|${t.from}|${t.to}|${t.value}`, t);
  }
  const all = [...merged.values()].sort((a, b) => a.block - b.block);

  await mkdir(".cache", { recursive: true });
  await writeFile(
    CACHE,
    JSON.stringify({ from, to: head, transfers: all.map(pack) } satisfies Cache),
  );

  transfers = all.filter((t) => t.block >= wanted);
  console.log(`  ${transfers.length} transferências no período · cache em ${CACHE}`);
}

// ------------------------------------------------------------------ preço
const depth = depthOn(await pairsOfToken(token.contract), token.chain);
const price = depth?.priceUsd ?? 0;

// ------------------------------------------------- linha do tempo dos saldos
console.log(`\n${"─".repeat(94)}`);
console.log("SALDO DAS CARTEIRAS VIGIADAS AO LONGO DO TEMPO");
console.log("─".repeat(94));

const anchor = new Map<string, bigint>();
await Promise.all(
  wallets.map(async (w) => {
    anchor.set(w.toLowerCase(), await balanceAt(token.chain, token.contract, w, wanted));
  }),
);

// Divide o período em fatias e mostra o saldo no fim de cada uma.
const SLICES = 12;
const step = Math.max(1, Math.floor((head - wanted) / SLICES));
const marks = Array.from({ length: SLICES + 1 }, (_, i) => wanted + i * step);
const times = new Map<number, number>();
await Promise.all(marks.map(async (b) => times.set(b, await blockTime(token.chain, Math.min(b, head)))));

const running = new Map(anchor);
const rows: { when: string; total: number; each: number[] }[] = [];
let cursor = 0;

for (const mark of marks) {
  while (cursor < transfers.length && transfers[cursor].block <= mark) {
    const t = transfers[cursor++];
    const f = t.from.toLowerCase();
    const to = t.to.toLowerCase();
    if (tracked.has(f)) running.set(f, (running.get(f) ?? BigInt(0)) - t.value);
    if (tracked.has(to)) running.set(to, (running.get(to) ?? BigInt(0)) + t.value);
  }
  const each = wallets.map((w) => toUnits(running.get(w.toLowerCase()) ?? BigInt(0), info.decimals));
  rows.push({
    when: new Date((times.get(mark) ?? 0) * 1000).toISOString().slice(0, 16).replace("T", " "),
    total: each.reduce((s, v) => s + v, 0),
    each,
  });
}

const header = token.wallets.map((w) => w.label.slice(0, 9).padStart(10)).join("");
console.log(`\n  quando            ${header}${"TOTAL".padStart(12)}`);
for (const row of rows) {
  console.log(
    `  ${row.when}  ${row.each.map((v) => units(v).padStart(10)).join("")}${units(row.total).padStart(12)}`,
  );
}

// Confere o fim da série contra o saldo real: se divergir, a varredura perdeu
// eventos e todo o resto do relatório fica suspeito.
const live = await balancesOf(token.chain, token.contract, wallets);
const liveTotal = wallets.reduce(
  (s, w) => s + toUnits(live.get(w.toLowerCase()) ?? BigInt(0), info.decimals), 0,
);
const drift = rows[rows.length - 1].total - liveTotal;
console.log(
  `\n  conferência: reconstruído ${units(rows[rows.length - 1].total)} · real ${units(liveTotal)} · diferença ${units(Math.abs(drift))}` +
    (Math.abs(drift) > liveTotal * 0.001 ? "  ⚠ varredura incompleta" : "  ✓"),
);

// ------------------------------------------------------------ contrapartes
console.log(`\n${"─".repeat(94)}`);
console.log("PARA ONDE FOI E DE ONDE VEIO");
console.log("─".repeat(94));

interface Flow { out: bigint; in: bigint; count: number }
const flows = new Map<string, Flow>();

for (const t of transfers) {
  const f = t.from.toLowerCase();
  const to = t.to.toLowerCase();
  const fromTracked = tracked.has(f);
  const toTracked = tracked.has(to);
  // Movimento interno entre carteiras vigiadas não é contraparte externa.
  if (fromTracked === toTracked) continue;

  const other = fromTracked ? to : f;
  const flow = flows.get(other) ?? { out: BigInt(0), in: BigInt(0), count: 0 };
  if (fromTracked) flow.out += t.value;
  else flow.in += t.value;
  flow.count++;
  flows.set(other, flow);
}

const ranked = [...flows.entries()]
  .map(([address, f]) => ({ address, ...f, net: f.out - f.in, gross: f.out + f.in }))
  .sort((a, b) => (b.gross > a.gross ? 1 : -1))
  .slice(0, 20);

console.log(`\n  ${ranked.length} maiores contrapartes de ${flows.size} no período\n`);
console.log(`  endereço                                       recebeu      devolveu       líquido   ops`);

for (const r of ranked) {
  const received = toUnits(r.out, info.decimals);
  const returned = toUnits(r.in, info.decimals);
  const net = received - returned;
  console.log(
    `  ${r.address}  ${units(received).padStart(11)}  ${units(returned).padStart(12)}  ${(net >= 0 ? "+" : "-") + units(Math.abs(net))}`.padEnd(96) +
      String(r.count).padStart(4),
  );
}

// ------------------------------------------------------------ maiores donos
console.log(`\n${"─".repeat(94)}`);
console.log("MAIORES DONOS");
console.log("─".repeat(94));

const candidates = new Set<string>(wallets.map((w) => w.toLowerCase()));
for (const address of flows.keys()) candidates.add(address);

// Janela sem filtro: pega quem se moveu recentemente sem passar pelas carteiras
// vigiadas. É o que evita que um dono grande e independente fique de fora.
const wideFrom = Math.max(token.firstBlock, head - Math.round((wideDays * 86400) / CHAINS[token.chain].secondsPerBlock));
console.log(`\n  ampliando com ${wideDays} dias sem filtro…`);
let lastWide = 0;
const wide = await scanTransfers({
  chain: token.chain,
  token: token.contract,
  fromBlock: wideFrom,
  toBlock: head,
  onProgress: (done, total, count) => {
    const now = Date.now();
    if (now - lastWide < 5000 && done < total) return;
    lastWide = now;
    process.stdout.write(`\r  ${done}/${total} faixas · ${count} eventos   `);
  },
});
console.log(wide.failed ? `\n  ${wide.failed} faixas falharam — a rede de candidatos ficou menor` : "");

// A janela sem filtro devolve dezenas de milhares de endereços, e consultar o
// saldo de todos levaria horas. Um dono grande necessariamente aparece em
// alguma transferência grande, então o maior valor que cada endereço tocou
// serve de peneira — barata e alinhada com o que se procura.
const biggest = new Map<string, bigint>();
for (const t of wide.transfers) {
  for (const side of [t.from.toLowerCase(), t.to.toLowerCase()]) {
    if (t.value > (biggest.get(side) ?? BigInt(0))) biggest.set(side, t.value);
  }
}

const SHORTLIST = 1200;
const shortlist = [...biggest.entries()]
  .sort((a, b) => (b[1] > a[1] ? 1 : -1))
  .slice(0, SHORTLIST);

for (const [address] of shortlist) candidates.add(address);
console.log(
  `  ${biggest.size} endereços ativos · ${shortlist.length} maiores mantidos para consulta`,
);

const ZERO = "0x0000000000000000000000000000000000000000";
candidates.delete(ZERO);
console.log(`  ${candidates.size} endereços candidatos · consultando saldos…`);

const list = [...candidates];
const balances = new Map<string, bigint>();
for (let i = 0; i < list.length; i += 40) {
  const slice = list.slice(i, i + 40);
  const got = await balancesOf(token.chain, token.contract, slice);
  for (const [k, v] of got) balances.set(k, v);
  process.stdout.write(`\r  ${Math.min(i + 40, list.length)}/${list.length}   `);
}
console.log("");

const supply = toUnits(info.totalSupply, info.decimals);
const holders = [...balances.entries()]
  .map(([address, balance]) => ({ address, amount: toUnits(balance, info.decimals) }))
  .filter((h) => h.amount > 0)
  .sort((a, b) => b.amount - a.amount)
  .slice(0, 20);

const covered = holders.reduce((s, h) => s + h.amount, 0);

console.log(`\n  #   endereço                                        saldo       valor   % supply   tipo`);

for (const [i, h] of holders.entries()) {
  const label = labelOf(token as WatchedToken, h.address);
  const known = label.includes("…") ? "" : `  ← ${label}`;
  const kind = await isContract(token.chain, h.address);
  console.log(
    `  ${String(i + 1).padStart(2)}  ${h.address}  ${units(h.amount).padStart(10)}  ${money(h.amount * price).padStart(10)}  ${((h.amount / supply) * 100).toFixed(3).padStart(8)}%   ${kind ? "contrato" : "carteira"}${known}`,
  );
}

console.log(`
  Os 20 somam ${units(covered)} de ${units(supply)} de supply — ${((covered / supply) * 100).toFixed(1)}%.
  O ranking cobre os candidatos descobertos, não a cadeia inteira: um dono que
  nunca tocou as carteiras vigiadas e ficou parado nos últimos ${wideDays} dias não
  aparece aqui. Use --wide=7 para ampliar a rede ao custo de mais tempo.`);

if (depth) {
  console.log(
    `\n  Referência: liquidez à vista total ${money(depth.liquidityUsd)}. Qualquer linha acima\n  dela é uma posição que não tem como sair pelo mercado à vista.`,
  );
}
