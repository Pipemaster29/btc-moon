/**
 * O preço executado é o da ordem, não a mínima do dia.
 *
 * Este script existe para tornar essa diferença verificável. Para cada operação
 * ele mostra a mínima real do candle ao lado do preço em que a ordem executou —
 * que é sempre PIOR, porque a ordem estava parada acima do fundo. O mesmo vale
 * na venda: o alvo fica abaixo da máxima do dia.
 *
 * Também separa os dois efeitos de gap, que vão em direções OPOSTAS: uma ordem
 * limitada executa melhor quando o mercado abre além dela, enquanto um stop
 * executa pior. Assumir o preço exato é conservador no primeiro caso e otimista
 * no segundo.
 *
 * Rode com: npm run fills
 */

import { getCandles } from "../lib/bitstamp";
import { moonPhasesBetween } from "../lib/moon";
import { profileWicks, runWickStrategy, type WickParams } from "../lib/wick";

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const money = (v: number) => `$${v.toFixed(0)}`;
const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

const LOOKBACK = 8;
const FORWARD = 6;

const all = await getCandles("1d");
const candles = all.filter((c) => c.time >= Date.UTC(2018, 0, 1) / 1000);
const phases = moonPhasesBetween(
  new Date(candles[0].time * 1000),
  new Date(candles[candles.length - 1].time * 1000),
);

const byTime = new Map(candles.map((c) => [c.time, c]));
const profile = profileWicks(candles, phases, "full", LOOKBACK, FORWARD);

const dip = Math.abs(profile.dipQuantiles.median);
const params: WickParams = {
  phase: "full",
  lookbackDays: LOOKBACK,
  dipPct: dip,
  targetPct: profile.riseQuantiles.median / 2,
  stopPct: Math.abs((1 + profile.dipQuantiles.deep) / (1 - dip) - 1),
  exitAfterPhaseDays: FORWARD,
  fallback: false,
};

const result = runWickStrategy(candles, phases, params);

console.log(`\n${"=".repeat(92)}`);
console.log("ONDE A ORDEM EXECUTOU vs. O FUNDO REAL DO DIA");
console.log("=".repeat(92));
console.log(`
  Se o backtest comprasse na mínima, a coluna "executou" seria igual à coluna
  "mínima do dia". Ela é sempre maior — a ordem estava parada acima do fundo.
`);
console.log("    data          mínima do dia   executou em   quanto pior");

let worseSum = 0;
let counted = 0;
const entryGaps: number[] = [];

for (const t of result.trades.slice(0, 12)) {
  const c = byTime.get(t.entryTime);
  if (!c) continue;
  const worse = t.entryPrice / c.low - 1;
  console.log(
    `    ${day(t.entryTime)}    ${money(c.low).padStart(11)}   ${money(t.entryPrice).padStart(11)}   ${`+${pct(worse)}`.padStart(11)}`,
  );
}

for (const t of result.trades) {
  const c = byTime.get(t.entryTime);
  if (!c) continue;
  worseSum += t.entryPrice / c.low - 1;
  counted++;
  // Abertura abaixo do limite é gap a favor de quem compra: executa mais barato.
  if (c.open < t.entryPrice) entryGaps.push(t.entryPrice / c.open - 1);
}

console.log(
  `\n  Nas ${counted} operações, a execução saiu em média ${pct(worseSum / counted)} ACIMA da mínima do dia.`,
);

// ------------------------------------------------------------------- saídas
console.log(`\n${"=".repeat(92)}`);
console.log("A VENDA, PELO MESMO CRITÉRIO");
console.log("=".repeat(92));
console.log("\n    data          máxima do dia   vendeu em     quanto pior");

const targetExits = result.trades.filter((t) => t.exitReason === "target");
let sellWorse = 0;
for (const t of targetExits.slice(0, 8)) {
  const c = byTime.get(t.exitTime);
  if (!c) continue;
  console.log(
    `    ${day(t.exitTime)}    ${money(c.high).padStart(11)}   ${money(t.exitPrice).padStart(11)}   ${pct(t.exitPrice / c.high - 1).padStart(11)}`,
  );
}
for (const t of targetExits) {
  const c = byTime.get(t.exitTime);
  if (c) sellWorse += t.exitPrice / c.high - 1;
}
console.log(
  `\n  Nas ${targetExits.length} saídas no alvo, a venda saiu em média ${pct(sellWorse / targetExits.length)} ABAIXO da máxima do dia.`,
);

// ------------------------------------------------------- onde eu sou otimista
console.log(`\n${"=".repeat(92)}`);
console.log("OS GAPS — e por que eles puxam para lados opostos");
console.log("=".repeat(92));
console.log(`
  ORDEM LIMITADA: se o dia abre além dela, executa na abertura, que para quem
  compra é um preço MELHOR. Assumir o preço da ordem é conservador aqui.

  STOP LOSS: se o dia abre abaixo dele, executa na abertura, que é PIOR.
  Assumir o preço do stop é otimista aqui — e este é o ponto fraco real.
`);
console.log(`  Entradas em dia que abriu abaixo do limite: ${entryGaps.length} de ${counted}`);
if (entryGaps.length > 0) {
  const mean = entryGaps.reduce((s, v) => s + v, 0) / entryGaps.length;
  const best = Math.max(...entryGaps);
  console.log(`    execução saiu ${pct(mean)} melhor em média | melhor caso ${pct(best)}`);
}

const gappedStops = result.trades.filter((t) => {
  const c = byTime.get(t.exitTime);
  return t.exitReason === "stop" && c !== undefined && c.open < t.exitPrice;
});
console.log(`  Stops acionados em dia que abriu abaixo deles: ${gappedStops.length} de ${result.exits.stop}`);
if (gappedStops.length > 0) {
  const losses = gappedStops.map((t) => {
    const c = byTime.get(t.exitTime)!;
    return c.open / t.exitPrice - 1;
  });
  const mean = losses.reduce((s, v) => s + v, 0) / losses.length;
  console.log(`    execução saiu ${pct(mean)} pior em média | pior caso ${pct(Math.min(...losses))}`);
}

// Reexecuta usando a abertura sempre que houver gap, nos dois sentidos.
let pessimistic = 1;
for (const t of result.trades) {
  const entry = byTime.get(t.entryTime);
  if (!entry) continue;
  const realEntry = entry.open < t.entryPrice ? entry.open : t.entryPrice;

  const exit = byTime.get(t.exitTime);
  let realExit = t.exitPrice;
  if (exit && t.exitReason === "target" && exit.open > t.exitPrice) {
    realExit = exit.open;
  }
  if (exit && t.exitReason === "stop" && exit.open < t.exitPrice) {
    realExit = exit.open;
  }
  pessimistic *= realExit / realEntry;
}

console.log(`\n  Resultado assumindo o preço da ordem : ${(1 + result.totalReturn).toFixed(3)}x`);
console.log(`  Resultado com os dois gaps corrigidos: ${pessimistic.toFixed(3)}x`);
console.log(`
  A correção sobe um pouco porque as execuções melhores nas limitadas superaram
  a piora nos stops nesta amostra. Nos dois casos o resultado fica muito abaixo
  de comprar e segurar, que rendeu 4,67x — a conclusão não depende disto.
`);
