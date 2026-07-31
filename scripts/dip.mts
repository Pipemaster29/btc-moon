/**
 * A ideia da "queda dentro da janela lunar".
 *
 * Em vez de comprar a mercado no dia da fase, coloca uma ordem limitada abaixo
 * do preço e só entra se a queda vier. Sai por alvo, por stop ou por prazo.
 *
 * A pergunta não é se isso dá lucro — comprar quedas num ativo que subiu muito
 * dá lucro. É se a JANELA LUNAR importa: a mesma regra, com as mesmas ordens
 * limitadas, ancorada em datas sorteadas, chega no mesmo lugar?
 *
 * Rode com: npm run dip
 */

import { getCandles, type Candle } from "../lib/bitstamp";
import { moonPhasesBetween, type MoonPhase } from "../lib/moon";
import {
  buyAndHold,
  locateInNull,
  monteCarloNull,
  runBacktest,
  type StrategyParams,
} from "../lib/backtest";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const mult = (v: number) => {
  const x = 1 + v;
  return x >= 100 ? `${Math.round(x).toLocaleString("pt-BR")}x` : `${x.toFixed(2)}x`;
};

const START_YEAR = 2018;

const allCandles = await getCandles("1d");
const candles = allCandles.filter((c) => c.time >= Date.UTC(START_YEAR, 0, 1) / 1000);
const phases = moonPhasesBetween(
  new Date(candles[0].time * 1000),
  new Date(candles[candles.length - 1].time * 1000),
);

const bh = buyAndHold(candles);

console.log(`\n${"=".repeat(94)}`);
console.log(`ENTRADA POR ORDEM LIMITADA — ${START_YEAR} até hoje (${candles.length} dias)`);
console.log("=".repeat(94));
console.log(`\n  Comprar e segurar: ${mult(bh.totalReturn)} | CAGR ${pct(bh.cagr)} | DD ${pct(bh.maxDrawdown)}\n`);

// A referência: entrar a mercado no dia da lua cheia.
const market: StrategyParams = {
  phase: "full",
  entryOffsetDays: 0,
  holdingDays: 14,
  stopLossPct: 0.08,
  direction: "long",
};
const marketResult = runBacktest(candles, phases, market);
console.log(
  `  A mercado na lua cheia (14d, stop 8%): ${mult(marketResult.totalReturn)} | ${marketResult.tradeCount} ops\n`,
);

interface Row {
  params: StrategyParams;
  label: string;
  result: ReturnType<typeof runBacktest>;
}

const rows: Row[] = [];

for (const discount of [0.01, 0.02, 0.03, 0.05, 0.08]) {
  for (const windowDays of [3, 5, 7, 10]) {
    for (const takeProfit of [0, 0.03, 0.05, 0.08, 0.12]) {
      for (const stopLoss of [0.05, 0.08, 0.12]) {
        const params: StrategyParams = {
          phase: "full",
          entryOffsetDays: 0,
          holdingDays: 14,
          stopLossPct: stopLoss,
          direction: "long",
          entryDiscountPct: discount,
          entryWindowDays: windowDays,
          takeProfitPct: takeProfit,
        };
        rows.push({
          params,
          label: `queda ${pct(discount)} em ${windowDays}d, alvo ${takeProfit === 0 ? "—" : pct(takeProfit)}, stop ${pct(stopLoss)}`,
          result: runBacktest(candles, phases, params),
        });
      }
    }
  }
}

rows.sort((a, b) => b.result.totalReturn - a.result.totalReturn);

console.log(`  ${rows.length} variantes testadas. TOP 12:\n`);
console.log("    retorno   CAGR    acerto  ops  exec.  estratégia");
for (const row of rows.slice(0, 12)) {
  const r = row.result;
  console.log(
    `  ${mult(r.totalReturn).padStart(9)} ${pct(r.cagr).padStart(7)} ${pct(r.winRate).padStart(7)} ${String(r.tradeCount).padStart(4)} ${pct(r.fillRate).padStart(6)}  ${row.label}`,
  );
}

// ------------------------------------------------------------- filtro de RSI
console.log(`\n${"=".repeat(94)}`);
console.log("O FILTRO DE RSI AJUDA?");
console.log("=".repeat(94));
console.log("\n  Mesma regra, só entrando quando o RSI do dia do sinal está baixo.\n");
console.log("    RSI ≤    retorno   CAGR    acerto  ops  sinais usados");

const bestDip = rows[0].params;
for (const threshold of [100, 70, 60, 50, 45, 40, 35, 30]) {
  const params: StrategyParams = { ...bestDip, rsiThreshold: threshold };
  const r = runBacktest(candles, phases, params);
  const label = threshold === 100 ? "sem filtro" : `${threshold}`;
  console.log(
    `  ${label.padStart(10)} ${mult(r.totalReturn).padStart(9)} ${pct(r.cagr).padStart(7)} ${pct(r.winRate).padStart(7)} ${String(r.tradeCount).padStart(4)} ${pct(r.fillRate).padStart(9)}`,
  );
}

// --------------------------------------------- a janela lunar importa mesmo?
console.log(`\n${"=".repeat(94)}`);
console.log("A JANELA LUNAR IMPORTA?");
console.log("=".repeat(94));
console.log("\n  A mesma ordem limitada, o mesmo alvo, o mesmo stop — mas ancorados em");
console.log("  datas sorteadas em vez das fases da lua. 4.000 cenários por linha.\n");
console.log("    estratégia lunar   sorteio(mediana)   percentil   p-valor   regra");

function testNull(label: string, params: StrategyParams) {
  const result = runBacktest(candles, phases, params);
  const mc = locateInNull(
    result.totalReturn,
    monteCarloNull(candles, params, result.tradeCount, 4000),
  );
  console.log(
    `  ${mult(result.totalReturn).padStart(16)} ${mult(mc.medianSample).padStart(18)} ${pct(mc.percentile).padStart(11)} ${mc.pValue.toFixed(4).padStart(9)}   ${label}`,
  );
  return mc;
}

testNull("a mercado, sem queda", market);
testNull(rows[0].label, rows[0].params);
testNull(`${rows[1].label}`, rows[1].params);
testNull("melhor + RSI ≤ 45", { ...bestDip, rsiThreshold: 45 });

// ------------------------------------------------------------ fora da amostra
console.log(`\n${"=".repeat(94)}`);
console.log("FORA DA AMOSTRA");
console.log("=".repeat(94));

const split = Math.floor(candles.length / 2);
const train = candles.slice(0, split);
const test = candles.slice(split);
const splitDate = new Date(test[0].time * 1000).toISOString().slice(0, 10);

const phasesFor = (c: Candle[]): MoonPhase[] =>
  moonPhasesBetween(new Date(c[0].time * 1000), new Date(c[c.length - 1].time * 1000));

const trainPhases = phasesFor(train);
const testPhases = phasesFor(test);

const trainRanked = [...rows]
  .map((row) => ({ ...row, result: runBacktest(train, trainPhases, row.params) }))
  .sort((a, b) => b.result.totalReturn - a.result.totalReturn);

const champion = trainRanked[0];
const outOfSample = runBacktest(test, testPhases, champion.params);
const testBH = buyAndHold(test);

const testRanked = [...rows]
  .map((row) => ({ ...row, result: runBacktest(test, testPhases, row.params) }))
  .sort((a, b) => b.result.totalReturn - a.result.totalReturn);
const rank = testRanked.findIndex((r) => r.label === champion.label);

console.log(`\n  corte em ${splitDate}`);
console.log(`  campeã no treino: ${champion.label}`);
console.log(`    treino : ${mult(champion.result.totalReturn)}`);
console.log(`    teste  : ${mult(outOfSample.totalReturn)}  (segurar: ${mult(testBH.totalReturn)})`);
console.log(`    posição no teste: ${rank + 1}º de ${rows.length}\n`);
