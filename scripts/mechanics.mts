/**
 * Como a lua verdadeira e a lua falsa entram nos preços.
 *
 * As duas usam exatamente o mesmo motor e o mesmo espaço de 11.520 estratégias.
 * A única diferença é a lista de datas-âncora: uma vem do calendário lunar real,
 * a outra do mesmo calendário deslocado no tempo. Este script mostra as
 * operações concretas de cada uma, lado a lado.
 *
 * Rode com: npm run mechanics
 */

import { getCandles } from "../lib/bitstamp";
import { moonPhasesBetween } from "../lib/moon";
import {
  gridSearch,
  runBacktest,
  shiftPhases,
  SYNODIC_MONTH,
  type Grid,
  type StrategyParams,
} from "../lib/backtest";

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const usd = (v: number) => `$${v.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

const START_YEAR = 2018;
const all = await getCandles("1d");
const candles = all.filter((c) => c.time >= Date.UTC(START_YEAR, 0, 1) / 1000);
const realPhases = moonPhasesBetween(
  new Date(candles[0].time * 1000),
  new Date(candles[candles.length - 1].time * 1000),
);

const GRID: Grid = {
  phases: ["full", "new", "first-quarter", "last-quarter"],
  entryOffsets: [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7],
  holdingDays: [1, 2, 3, 5, 7, 10, 12, 14, 17, 20, 25, 29],
  stopLosses: [0, 0.02, 0.03, 0.05, 0.08, 0.1, 0.15, 0.2],
  directions: ["long", "short"],
};

const PHASE_PT: Record<string, string> = {
  full: "lua cheia",
  new: "lua nova",
  "first-quarter": "quarto crescente",
  "last-quarter": "quarto minguante",
};

function describe(p: StrategyParams): string {
  const offset =
    p.entryOffsetDays === 0
      ? "no próprio dia"
      : p.entryOffsetDays > 0
        ? `${p.entryOffsetDays} dias depois`
        : `${-p.entryOffsetDays} dias antes`;
  return `${p.direction === "short" ? "VENDE" : "COMPRA"} ${offset} da ${PHASE_PT[p.phase]}, segura ${p.holdingDays}d, stop ${p.stopLossPct === 0 ? "nenhum" : pct(p.stopLossPct)}`;
}

console.log(`\n${"=".repeat(90)}`);
console.log("COMO A ENTRADA ACONTECE");
console.log("=".repeat(90));
console.log(`
  O motor é um só. Para cada uma das 11.520 combinações ele:

    1. pega as datas de uma fase (ex.: todas as luas cheias);
    2. desloca cada data pelo parâmetro de antecedência (ex.: -3 dias);
    3. ENTRA A MERCADO no FECHAMENTO daquele dia — sem ordem limitada,
       sem esperar queda, sem filtro de indicador;
    4. sai quando o stop é tocado ou quando vence o prazo;
    5. nunca abre uma posição enquanto a anterior estiver aberta.

  A lua falsa passa exatamente pelos mesmos cinco passos. A ÚNICA coisa
  diferente é o passo 1: as datas vêm do calendário lunar deslocado.
`);

// -------------------------------------------------------------- lua real
const realRanked = gridSearch(candles, realPhases, GRID);
const realBest = realRanked[0];

console.log("=".repeat(90));
console.log("LUA VERDADEIRA — a melhor das 11.520");
console.log("=".repeat(90));
console.log(`\n  ${describe(realBest.params)}`);
console.log(`  resultado: ${(1 + realBest.result.totalReturn).toFixed(1)}x em ${realBest.result.tradeCount} operações\n`);
console.log("  as 6 primeiras operações:");
console.log("    entrada       saída         preço entrada   preço saída   retorno   motivo");
for (const t of realBest.result.trades.slice(0, 6)) {
  console.log(
    `    ${day(t.entryTime)}    ${day(t.exitTime)}    ${usd(t.entryPrice).padStart(12)}  ${usd(t.exitPrice).padStart(12)}  ${pct(t.return).padStart(8)}   ${t.stopped ? "stop" : "prazo"}`,
  );
}

// De onde veio a data de entrada da primeira operação.
const firstTrade = realBest.result.trades[0];
const phaseName = realBest.params.phase;
const nearestPhase = realPhases
  .filter((p) => p.phase === phaseName)
  .map((p) => ({ p, d: Math.abs(p.date.getTime() / 1000 - firstTrade.entryTime) }))
  .sort((a, b) => a.d - b.d)[0];

console.log(`\n  Rastreando a primeira entrada:`);
console.log(`    ${PHASE_PT[phaseName]} em ${nearestPhase.p.date.toISOString().slice(0, 16).replace("T", " ")} UTC`);
console.log(
  `    ${realBest.params.entryOffsetDays >= 0 ? "+" : ""}${realBest.params.entryOffsetDays} dias  →  entra no fechamento de ${day(firstTrade.entryTime)} a ${usd(firstTrade.entryPrice)}`,
);

// -------------------------------------------------------------- lua falsa
console.log(`\n${"=".repeat(90)}`);
console.log("LUA FALSA — o mesmo calendário deslocado 9,4 dias");
console.log("=".repeat(90));

const SHIFT = 9.4;
const fakePhases = shiftPhases(realPhases, SHIFT);
const fakeRanked = gridSearch(candles, fakePhases, GRID);
const fakeBest = fakeRanked[0];

console.log(`\n  ${describe(fakeBest.params)}`);
console.log(`  resultado: ${(1 + fakeBest.result.totalReturn).toFixed(1)}x em ${fakeBest.result.tradeCount} operações\n`);
console.log("  as 6 primeiras operações:");
console.log("    entrada       saída         preço entrada   preço saída   retorno   motivo");
for (const t of fakeBest.result.trades.slice(0, 6)) {
  console.log(
    `    ${day(t.entryTime)}    ${day(t.exitTime)}    ${usd(t.entryPrice).padStart(12)}  ${usd(t.exitPrice).padStart(12)}  ${pct(t.return).padStart(8)}   ${t.stopped ? "stop" : "prazo"}`,
  );
}

// ------------------------------------------------- mesma regra, duas âncoras
console.log(`\n${"=".repeat(90)}`);
console.log("A MESMA REGRA NAS DUAS ÂNCORAS");
console.log("=".repeat(90));
console.log(`
  Fixando a estratégia vencedora da lua real e trocando só o calendário,
  fica claro que a regra não muda — muda a data em que ela dispara.
`);

const sameRuleOnFake = runBacktest(candles, fakePhases, realBest.params);
console.log(`  ${describe(realBest.params)}\n`);
console.log(`    com a lua real   : ${(1 + realBest.result.totalReturn).toFixed(2)}x  (${realBest.result.tradeCount} ops)`);
console.log(`    com a lua falsa  : ${(1 + sameRuleOnFake.totalReturn).toFixed(2)}x  (${sameRuleOnFake.tradeCount} ops)`);

console.log(`\n  primeiras entradas, lado a lado:`);
console.log("    lua real      lua falsa (+9,4d)   diferença");
for (let i = 0; i < 6; i++) {
  const a = realBest.result.trades[i];
  const b = sameRuleOnFake.trades[i];
  if (!a || !b) break;
  const diff = Math.round((b.entryTime - a.entryTime) / 86400);
  console.log(`    ${day(a.entryTime)}    ${day(b.entryTime)}          ${diff > 0 ? "+" : ""}${diff}d`);
}

console.log(`
  É por isso que o teste é justo: mesma quantidade de operações, mesma
  duração, mesmo stop, mesmo mercado. Só a data muda. Se a lua carregasse
  informação, deslocá-la destruiria o resultado — e não destrói.

  Deslocamento usado neste exemplo: ${SHIFT} dias de um ciclo de ${SYNODIC_MONTH.toFixed(2)}.
  No teste completo o deslocamento é sorteado a cada uma das 300 repetições.
`);
