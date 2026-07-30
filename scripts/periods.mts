/**
 * A análise lunar por período.
 *
 * O Bitcoin de 2011 é outro ativo: ilíquido, minúsculo e com retornos que não
 * se repetiram. Recortar a série por ano de início mostra se alguma conclusão
 * depende daquela fase inicial.
 *
 * Rode com: npm run periods
 */

import { getCandles, type Candle } from "../lib/bitstamp";
import { moonPhasesBetween } from "../lib/moon";
import {
  buyAndHold,
  deflatedSignificanceTest,
  gridSearch,
  locateInNull,
  monteCarloNull,
  runBacktest,
  type Grid,
  type StrategyParams,
} from "../lib/backtest";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const mult = (v: number) => {
  const x = 1 + v;
  return x >= 100 ? `${Math.round(x).toLocaleString("pt-BR")}x` : `${x.toFixed(1)}x`;
};

const GRID: Grid = {
  phases: ["full", "new", "first-quarter", "last-quarter"],
  entryOffsets: [-7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7],
  holdingDays: [1, 2, 3, 5, 7, 10, 12, 14, 17, 20, 25, 29],
  stopLosses: [0, 0.02, 0.03, 0.05, 0.08, 0.1, 0.15, 0.2],
};

const COMBOS =
  GRID.phases.length * GRID.entryOffsets.length * GRID.holdingDays.length * GRID.stopLosses.length;

/** A ideia original: comprar na lua cheia, segurar duas semanas, stop de 8%. */
const USER_IDEA: StrategyParams = {
  phase: "full",
  entryOffsetDays: 0,
  holdingDays: 14,
  stopLossPct: 0.08,
};

const START_YEARS = [2011, 2016, 2018, 2019, 2020];
const TRIALS = 300;

const allCandles = await getCandles("1d");

interface PeriodReport {
  label: string;
  candles: number;
  years: number;
  bhReturn: number;
  bhCagr: number;
  bhDrawdown: number;
  ideaReturn: number;
  ideaCagr: number;
  ideaTrades: number;
  ideaPValue: number;
  bestReturn: number;
  bestLabel: string;
  bestCagr: number;
  nullMedian: number;
  nullMax: number;
  deflatedP: number;
  beatenBy: number;
}

function describe(p: StrategyParams): string {
  const phase =
    p.phase === "full" ? "cheia" : p.phase === "new" ? "nova" : p.phase === "first-quarter" ? "crescente" : "minguante";
  const offset = p.entryOffsetDays === 0 ? "no dia" : p.entryOffsetDays > 0 ? `+${p.entryOffsetDays}d` : `${p.entryOffsetDays}d`;
  return `lua ${phase} ${offset}, ${p.holdingDays}d, ${p.stopLossPct === 0 ? "sem stop" : pct(p.stopLossPct)}`;
}

function analyzePeriod(startYear: number, candles: Candle[]): PeriodReport {
  const phases = moonPhasesBetween(
    new Date(candles[0].time * 1000),
    new Date(candles[candles.length - 1].time * 1000),
  );

  const bh = buyAndHold(candles);
  const idea = runBacktest(candles, phases, USER_IDEA);

  const ideaMc = locateInNull(
    idea.totalReturn,
    monteCarloNull(candles, USER_IDEA, idea.tradeCount, 3000),
  );

  const ranked = gridSearch(candles, phases, GRID);
  const best = ranked[0];

  const deflated = deflatedSignificanceTest(candles, phases, GRID, TRIALS);

  const spanYears =
    (candles[candles.length - 1].time - candles[0].time) / 86400 / 365.25;

  return {
    label: `${startYear}→hoje`,
    candles: candles.length,
    years: spanYears,
    bhReturn: bh.totalReturn,
    bhCagr: bh.cagr,
    bhDrawdown: bh.maxDrawdown,
    ideaReturn: idea.totalReturn,
    ideaCagr: idea.cagr,
    ideaTrades: idea.tradeCount,
    ideaPValue: ideaMc.pValue,
    bestReturn: best.result.totalReturn,
    bestLabel: describe(best.params),
    bestCagr: best.result.cagr,
    nullMedian: deflated.medianNull,
    nullMax: deflated.maxNull,
    deflatedP: deflated.pValue,
    beatenBy: deflated.nullBests.filter((v) => v >= deflated.actualBest).length,
  };
}

const reports: PeriodReport[] = [];

for (const year of START_YEARS) {
  const cutoff = Date.UTC(year, 0, 1) / 1000;
  const slice = allCandles.filter((c) => c.time >= cutoff);
  if (slice.length < 400) continue;

  process.stdout.write(`  analisando ${year}… `);
  const t0 = Date.now();
  reports.push(analyzePeriod(year, slice));
  console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

console.log(`\n${"=".repeat(88)}`);
console.log("COMPRAR E SEGURAR, POR PERÍODO DE ENTRADA");
console.log("=".repeat(88));
console.log("\n  período      anos    retorno       ganho      CAGR    queda máx");
for (const r of reports) {
  console.log(
    `  ${r.label.padEnd(11)} ${r.years.toFixed(1).padStart(5)} ${mult(r.bhReturn).padStart(10)} ${pct(r.bhReturn).padStart(11)} ${pct(r.bhCagr).padStart(9)} ${pct(r.bhDrawdown).padStart(11)}`,
  );
}

console.log(`\n${"=".repeat(88)}`);
console.log("A IDEIA ORIGINAL — comprar na lua cheia, segurar 14 dias, stop 8%");
console.log("=".repeat(88));
console.log("\n  período      estratégia    segurar      CAGR   ops   p-valor   veredito");
for (const r of reports) {
  const verdict = r.ideaPValue < 0.05 ? "significativo" : "não significativo";
  const vsBh = r.ideaReturn > r.bhReturn ? "✓ bate segurar" : "✗ perde p/ segurar";
  console.log(
    `  ${r.label.padEnd(11)} ${mult(r.ideaReturn).padStart(11)} ${mult(r.bhReturn).padStart(10)} ${pct(r.ideaCagr).padStart(9)} ${String(r.ideaTrades).padStart(5)} ${r.ideaPValue.toFixed(3).padStart(9)}   ${verdict}  ${vsBh}`,
  );
}

console.log(`\n${"=".repeat(88)}`);
console.log(`TESTE DECISIVO — melhor de ${COMBOS.toLocaleString("pt-BR")} combinações vs. calendários lunares falsos`);
console.log("=".repeat(88));
console.log(`\n  ${TRIALS} luas falsas por período. A pergunta: a lua real produz uma campeã melhor?\n`);
console.log("  período      lua real    falsa(mediana)  falsa(máx)   bateram   p-valor   veredito");
for (const r of reports) {
  const verdict = r.deflatedP < 0.05 ? "SIGNIFICATIVO" : "sem sinal";
  console.log(
    `  ${r.label.padEnd(11)} ${mult(r.bestReturn).padStart(10)} ${mult(r.nullMedian).padStart(15)} ${mult(r.nullMax).padStart(12)} ${`${r.beatenBy}/${TRIALS}`.padStart(9)} ${r.deflatedP.toFixed(3).padStart(9)}   ${verdict}`,
  );
}

console.log("\n  melhor combinação de cada período:");
for (const r of reports) {
  console.log(`    ${r.label.padEnd(11)} ${r.bestLabel} → ${mult(r.bestReturn)} (CAGR ${pct(r.bestCagr)})`);
}
console.log("");
