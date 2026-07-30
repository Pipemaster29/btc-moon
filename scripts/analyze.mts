/**
 * Análise lunar do Bitcoin: correlação, varredura de parâmetros e validação.
 *
 * Rode com: npx tsx scripts/analyze.mts
 */

import { getCandles } from "../lib/bitstamp";
import { moonPhasesBetween } from "../lib/moon";
import {
  buyAndHold,
  deflatedSignificanceTest,
  gridSearch,
  locateInNull,
  monteCarloNull,
  returnsByLunarDay,
  runBacktest,
  type GridResult,
  type StrategyParams,
} from "../lib/backtest";

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const mult = (v: number) => `${(1 + v).toFixed(1)}x`;

function describe(params: StrategyParams): string {
  const phaseLabel = params.phase === "full" ? "cheia" : params.phase === "new" ? "nova" : params.phase;
  const offset =
    params.entryOffsetDays === 0
      ? "no dia"
      : params.entryOffsetDays > 0
        ? `+${params.entryOffsetDays}d`
        : `${params.entryOffsetDays}d`;
  const stop = params.stopLossPct === 0 ? "sem stop" : `stop ${pct(params.stopLossPct)}`;
  return `lua ${phaseLabel} ${offset}, segura ${params.holdingDays}d, ${stop}`;
}

const candles = await getCandles("1d");
const from = new Date(candles[0].time * 1000);
const to = new Date(candles[candles.length - 1].time * 1000);
const phases = moonPhasesBetween(from, to);

console.log(`\n${"=".repeat(72)}`);
console.log(`DADOS: ${candles.length} velas diárias`);
console.log(`  ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)}`);
console.log(`  ${phases.length} mudanças de fase lunar`);

const bh = buyAndHold(candles);
console.log(`\nCOMPRAR E SEGURAR: ${mult(bh.totalReturn)} | CAGR ${pct(bh.cagr)} | DD máx ${pct(bh.maxDrawdown)} | Sharpe ${bh.sharpe.toFixed(2)}`);

// ---------------------------------------------------------------- correlação
console.log(`\n${"=".repeat(72)}`);
console.log("RETORNO MÉDIO DIÁRIO POR DIA DO CICLO LUNAR (0 = lua nova)\n");

const byDay = returnsByLunarDay(candles, phases);
const overallMean = byDay.reduce((s, d) => s + d.meanReturn * d.sampleSize, 0) /
  byDay.reduce((s, d) => s + d.sampleSize, 0);

console.log(`  média geral: ${pct(overallMean)}/dia\n`);
console.log("  dia    média      acima?   n     barra");
for (const d of byDay) {
  const excess = d.meanReturn - overallMean;
  const bars = Math.round(Math.abs(excess) * 4000);
  const bar = excess >= 0 ? "+".repeat(Math.min(bars, 30)) : "-".repeat(Math.min(bars, 30));
  const marker = d.lunarDay === 0 ? " ← nova" : d.lunarDay === 15 ? " ← cheia" : "";
  console.log(
    `  ${String(d.lunarDay).padStart(3)}  ${pct(d.meanReturn).padStart(7)}  ${pct(excess).padStart(8)}  ${String(d.sampleSize).padStart(4)}  ${bar}${marker}`,
  );
}

const best = [...byDay].sort((a, b) => b.meanReturn - a.meanReturn)[0];
const worst = [...byDay].sort((a, b) => a.meanReturn - b.meanReturn)[0];
console.log(`\n  melhor dia: ${best.lunarDay} (${pct(best.meanReturn)}/dia)`);
console.log(`  pior dia:   ${worst.lunarDay} (${pct(worst.meanReturn)}/dia)`);

// -------------------------------------------------------------- grid search
console.log(`\n${"=".repeat(72)}`);

const grid = {
  phases: ["full", "new", "first-quarter", "last-quarter"] as const,
  entryOffsets: [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7],
  holdingDays: [1, 2, 3, 5, 7, 10, 12, 14, 17, 20, 25, 29],
  stopLosses: [0, 0.02, 0.03, 0.05, 0.08, 0.1, 0.15, 0.2],
};

const combos =
  grid.phases.length * grid.entryOffsets.length * grid.holdingDays.length * grid.stopLosses.length;
console.log(`VARREDURA: ${combos.toLocaleString("pt-BR")} combinações`);

const t0 = Date.now();
const results = gridSearch(candles, phases, { ...grid, phases: [...grid.phases] });
console.log(`  concluída em ${Date.now() - t0}ms\n`);

console.log("TOP 10 POR RETORNO TOTAL:\n");
console.log("   retorno    CAGR    DD máx  acerto  ops  tempo   estratégia");
for (const r of results.slice(0, 10)) {
  const m = r.result;
  console.log(
    `  ${mult(m.totalReturn).padStart(8)} ${pct(m.cagr).padStart(7)} ${pct(m.maxDrawdown).padStart(8)} ${pct(m.winRate).padStart(6)} ${String(m.tradeCount).padStart(4)} ${pct(m.timeInMarket).padStart(6)}   ${describe(r.params)}`,
  );
}

// A estratégia que o usuário descreveu, para comparar com o ótimo da varredura.
const userIdea: StrategyParams = {
  phase: "full",
  entryOffsetDays: 0,
  holdingDays: 14,
  stopLossPct: 0.08,
};
const userResult = runBacktest(candles, phases, userIdea);
console.log(`\nA IDEIA ORIGINAL (${describe(userIdea)}):`);
console.log(
  `  ${mult(userResult.totalReturn)} | CAGR ${pct(userResult.cagr)} | DD máx ${pct(userResult.maxDrawdown)} | acerto ${pct(userResult.winRate)} | ${userResult.tradeCount} ops`,
);

// ------------------------------------------------------- Monte Carlo (nulo)
console.log(`\n${"=".repeat(72)}`);
console.log("MONTE CARLO — 5.000 cenários com datas de entrada SORTEADAS");
console.log("(mesma quantidade de operações, mesma duração, mesmo stop)\n");

function testAgainstNull(label: string, gr: GridResult | { params: StrategyParams; result: typeof userResult }) {
  const mc = locateInNull(
    gr.result.totalReturn,
    monteCarloNull(candles, gr.params, gr.result.tradeCount, 5000),
  );
  console.log(`  ${label}`);
  console.log(`    ${describe(gr.params)}`);
  console.log(`    estratégia lunar : ${mult(gr.result.totalReturn)}`);
  console.log(`    sorteio (mediana): ${mult(mc.medianSample)}`);
  console.log(`    faixa 5%–95%     : ${mult(mc.p05)} a ${mult(mc.p95)}`);
  console.log(`    percentil        : ${pct(mc.percentile)}`);
  console.log(`    p-valor          : ${mc.pValue.toFixed(4)} ${mc.pValue < 0.05 ? "← significativo" : "← NÃO significativo"}`);
  console.log("");
}

testAgainstNull("MELHOR DA VARREDURA", results[0]);
testAgainstNull("A IDEIA ORIGINAL", { params: userIdea, result: userResult });

// ------------------------------------------------------------ out-of-sample
console.log("=".repeat(72));
console.log("TESTE FORA DA AMOSTRA");
console.log("(otimiza na primeira metade, aplica na segunda — sem espiar)\n");

const split = Math.floor(candles.length / 2);
const trainCandles = candles.slice(0, split);
const testCandles = candles.slice(split);
const splitDate = new Date(testCandles[0].time * 1000).toISOString().slice(0, 10);

const trainPhases = moonPhasesBetween(
  new Date(trainCandles[0].time * 1000),
  new Date(trainCandles[trainCandles.length - 1].time * 1000),
);
const testPhases = moonPhasesBetween(
  new Date(testCandles[0].time * 1000),
  new Date(testCandles[testCandles.length - 1].time * 1000),
);

const trainResults = gridSearch(trainCandles, trainPhases, { ...grid, phases: [...grid.phases] });
const champion = trainResults[0];
const outOfSample = runBacktest(testCandles, testPhases, champion.params);
const testBH = buyAndHold(testCandles);

console.log(`  corte em ${splitDate}`);
console.log(`  campeã no treino: ${describe(champion.params)}`);
console.log(`    no treino  : ${mult(champion.result.totalReturn)} (CAGR ${pct(champion.result.cagr)})`);
console.log(`    no teste   : ${mult(outOfSample.totalReturn)} (CAGR ${pct(outOfSample.cagr)})`);
console.log(`    segurar    : ${mult(testBH.totalReturn)} (CAGR ${pct(testBH.cagr)}) no mesmo período`);

const rankOutOfSample = gridSearch(testCandles, testPhases, { ...grid, phases: [...grid.phases] })
  .findIndex(
    (r) =>
      r.params.phase === champion.params.phase &&
      r.params.entryOffsetDays === champion.params.entryOffsetDays &&
      r.params.holdingDays === champion.params.holdingDays &&
      r.params.stopLossPct === champion.params.stopLossPct,
  );
console.log(`\n  a campeã do treino ficou em ${rankOutOfSample + 1}º de ${combos.toLocaleString("pt-BR")} no período de teste`);
console.log(`  (se a vantagem fosse real, ela deveria continuar perto do topo)\n`);

// ------------------------------------------- significância corrigida da busca
console.log("=".repeat(72));
console.log("TESTE DECISIVO — significância corrigida pela busca de parâmetros");
console.log("(repete as 5.760 combinações sobre calendários lunares deslocados)\n");

const trials = 300;
const t1 = Date.now();
const deflated = deflatedSignificanceTest(
  candles,
  phases,
  { ...grid, phases: [...grid.phases] },
  trials,
);
console.log(`  ${trials} calendários falsos, ${(combos * trials).toLocaleString("pt-BR")} backtests, ${((Date.now() - t1) / 1000).toFixed(1)}s\n`);
console.log(`  melhor com a lua VERDADEIRA : ${mult(deflated.actualBest)}`);
console.log(`  melhor com calendário falso :`);
console.log(`    mediana                   : ${mult(deflated.medianNull)}`);
console.log(`    máximo                    : ${mult(deflated.maxNull)}`);
console.log(`\n  percentil : ${pct(deflated.percentile)}`);
console.log(`  p-valor   : ${deflated.pValue.toFixed(4)} ${deflated.pValue < 0.05 ? "← significativo" : "← NÃO significativo"}`);
console.log(
  `\n  Leitura: ${(deflated.nullBests.filter((v) => v >= deflated.actualBest).length)} de ${trials} calendários inventados\n  produziram uma campeã igual ou melhor que a da lua real.\n`,
);
