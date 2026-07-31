/**
 * Caracterização da janela pré-lua-cheia e a estratégia derivada dela.
 *
 * Primeiro descreve o comportamento do preço nos dias que antecedem a fase;
 * depois usa esses números para montar a regra "compra na queda, ou no dia da
 * lua cheia se a queda não vier"; por fim testa se a lua contribui com algo.
 *
 * Rode com: npm run window
 */

import { getCandles, type Candle } from "../lib/bitstamp";
import { moonPhasesBetween, type MoonPhase } from "../lib/moon";
import { buyAndHold, makeRandom } from "../lib/backtest";
import {
  phaseAnchors,
  profileWindow,
  runWindowStrategy,
  runWindowStrategyAt,
  type WindowParams,
} from "../lib/window";

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const mult = (v: number) => `${(1 + v).toFixed(2)}x`;

const START_YEAR = 2018;
const LOOKBACK = 10;
const FORWARD = 14;

const all = await getCandles("1d");
const candles = all.filter((c) => c.time >= Date.UTC(START_YEAR, 0, 1) / 1000);
const phasesFor = (c: Candle[]): MoonPhase[] =>
  moonPhasesBetween(new Date(c[0].time * 1000), new Date(c[c.length - 1].time * 1000));
const phases = phasesFor(candles);

console.log(`\n${"=".repeat(92)}`);
console.log(`OS ${LOOKBACK} DIAS ANTES DA LUA CHEIA — ${START_YEAR} até hoje`);
console.log("=".repeat(92));

const profile = profileWindow(candles, phases, "full", LOOKBACK, FORWARD);

console.log(`\n  ${profile.eventCount} luas cheias analisadas\n`);
console.log("   dia   % de quedas   retorno médio   movimento médio   n");
for (const d of profile.byDay) {
  if (d.sampleSize === 0) continue;
  const bar = "▇".repeat(Math.round(d.downRate * 24));
  const marker = d.offset === 0 ? " ← lua cheia" : "";
  console.log(
    `  ${String(d.offset).padStart(4)}   ${pct(d.downRate).padStart(10)}   ${pct(d.meanReturn).padStart(13)}   ${pct(d.meanAbsReturn).padStart(15)}  ${String(d.sampleSize).padStart(3)}  ${bar}${marker}`,
  );
}

const down = profile.byDay.filter((d) => d.sampleSize > 0);
const mostDown = [...down].sort((a, b) => b.downRate - a.downRate)[0];
const leastDown = [...down].sort((a, b) => a.downRate - b.downRate)[0];
// Com ~107 eventos, o erro padrão de uma proporção perto de 50% é ~4,8 pontos.
const se = Math.sqrt(0.25 / profile.eventCount);
console.log(`\n  mais quedas: dia ${mostDown.offset} (${pct(mostDown.downRate)})`);
console.log(`  menos quedas: dia ${leastDown.offset} (${pct(leastDown.downRate)})`);
console.log(`  erro padrão de cada proporção: ±${(se * 100).toFixed(1)} pontos`);
console.log(
  `  faixa esperada só por acaso: ${pct(0.5 - 2 * se)} a ${pct(0.5 + 2 * se)}`,
);

console.log(`\n  QUEDA MÁXIMA dentro dos ${LOOKBACK} dias (vs. preço do dia -${LOOKBACK}):`);
console.log(
  `    mediana ${pct(profile.dipQuantiles.median)} | média ${pct(profile.dipQuantiles.mean)} | quartis ${pct(profile.dipQuantiles.p25)} a ${pct(profile.dipQuantiles.p75)}`,
);
console.log(`    houve alguma queda em ${pct(profile.anyDipRate)} das janelas`);

console.log(`\n  ALTA MÁXIMA nos ${FORWARD} dias seguintes (vs. preço da lua cheia):`);
console.log(
  `    mediana ${pct(profile.riseQuantiles.median)} | média ${pct(profile.riseQuantiles.mean)} | quartis ${pct(profile.riseQuantiles.p25)} a ${pct(profile.riseQuantiles.p75)}`,
);

// ------------------------------------------------------------------ a regra
console.log(`\n${"=".repeat(92)}`);
console.log("A ESTRATÉGIA — comprar na queda; se não vier, comprar na lua cheia");
console.log("=".repeat(92));

const bh = buyAndHold(candles);
console.log(`\n  Comprar e segurar: ${mult(bh.totalReturn)} (CAGR ${pct(bh.cagr)})\n`);

// Os alvos saem da própria caracterização, e não de uma busca por retorno.
const dipTarget = Math.abs(profile.dipQuantiles.median);
const riseTarget = profile.riseQuantiles.median;

const derived: WindowParams = {
  phase: "full",
  lookbackDays: LOOKBACK,
  dipPct: dipTarget,
  risePct: riseTarget,
  maxHoldDays: FORWARD,
  stopLossPct: 0.08,
};

console.log(`  Parâmetros vindos da caracterização, sem otimizar:`);
console.log(`    comprar se cair ${pct(dipTarget)} (mediana das quedas)`);
console.log(`    vender se subir ${pct(riseTarget)} (mediana das altas)`);
console.log(`    prazo ${FORWARD}d, stop 8%\n`);

const result = runWindowStrategy(candles, phases, derived);
console.log(
  `  Resultado: ${mult(result.totalReturn)} | CAGR ${pct(result.cagr)} | acerto ${pct(result.winRate)} | ${result.tradeCount} ops`,
);
console.log(
  `    entradas na queda: ${result.dipEntries} (retorno médio ${pct(result.meanReturnOnDip)})`,
);
console.log(
  `    entradas no fallback: ${result.fallbackEntries} (retorno médio ${pct(result.meanReturnOnFallback)})`,
);
console.log(
  `    saídas — alvo: ${result.targetExits} | stop: ${result.stopExits} | prazo: ${result.timeExits}`,
);

// -------------------------------------------------- a lua importa nessa regra?
console.log(`\n${"=".repeat(92)}`);
console.log("A ÂNCORA LUNAR IMPORTA?");
console.log("=".repeat(92));
console.log("\n  A MESMA regra — mesma janela, mesma queda, mesmo alvo, mesmo stop —");
console.log("  ancorada em datas sorteadas em vez das luas cheias. 4.000 cenários.\n");

function nullTest(params: WindowParams, label: string) {
  const anchors = phaseAnchors(candles, phases, params.phase);
  const real = runWindowStrategyAt(candles, anchors, params);
  const random = makeRandom(4242);
  const samples: number[] = [];

  for (let trial = 0; trial < 4000; trial++) {
    const fake: number[] = [];
    for (let i = 0; i < anchors.length; i++) {
      fake.push(
        params.lookbackDays +
          1 +
          Math.floor(random() * (candles.length - params.lookbackDays - params.maxHoldDays - 2)),
      );
    }
    fake.sort((a, b) => a - b);
    samples.push(runWindowStrategyAt(candles, fake, params).totalReturn);
  }

  samples.sort((a, b) => a - b);
  const beaten = samples.filter((s) => s < real.totalReturn).length;
  const pValue = (samples.filter((s) => s >= real.totalReturn).length + 1) / (samples.length + 1);

  console.log(`  ${label}`);
  console.log(`    com a lua      : ${mult(real.totalReturn)}`);
  console.log(`    sorteado (med.): ${mult(samples[Math.floor(samples.length / 2)])}`);
  console.log(
    `    faixa 5–95%    : ${mult(samples[Math.floor(samples.length * 0.05)])} a ${mult(samples[Math.floor(samples.length * 0.95)])}`,
  );
  console.log(`    percentil      : ${pct(beaten / samples.length)}`);
  console.log(
    `    p-valor        : ${pValue.toFixed(4)} ${pValue < 0.05 ? "← significativo" : "← não significativo"}\n`,
  );
}

nullTest(derived, "parâmetros da caracterização");

// ------------------------------------------------------------ fora da amostra
console.log("=".repeat(92));
console.log("FORA DA AMOSTRA — caracteriza na primeira metade, aplica na segunda");
console.log("=".repeat(92));

const split = Math.floor(candles.length / 2);
const train = candles.slice(0, split);
const test = candles.slice(split);
const trainPhases = phasesFor(train);
const testPhases = phasesFor(test);

const trainProfile = profileWindow(train, trainPhases, "full", LOOKBACK, FORWARD);
const oosParams: WindowParams = {
  ...derived,
  dipPct: Math.abs(trainProfile.dipQuantiles.median),
  risePct: trainProfile.riseQuantiles.median,
};

console.log(`\n  corte em ${new Date(test[0].time * 1000).toISOString().slice(0, 10)}`);
console.log(
  `  medido no treino: queda ${pct(oosParams.dipPct)}, alta ${pct(oosParams.risePct)}`,
);
console.log(
  `  (na amostra inteira seria: queda ${pct(dipTarget)}, alta ${pct(riseTarget)})\n`,
);

const inTrain = runWindowStrategy(train, trainPhases, oosParams);
const inTest = runWindowStrategy(test, testPhases, oosParams);
const testBH = buyAndHold(test);

console.log(`  no treino : ${mult(inTrain.totalReturn)} (segurar: ${mult(buyAndHold(train).totalReturn)})`);
console.log(`  no teste  : ${mult(inTest.totalReturn)} (segurar: ${mult(testBH.totalReturn)})`);
console.log(
  `    entradas na queda ${inTest.dipEntries} (${pct(inTest.meanReturnOnDip)}) | fallback ${inTest.fallbackEntries} (${pct(inTest.meanReturnOnFallback)})\n`,
);
