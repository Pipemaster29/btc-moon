/**
 * O que acontece nos 8 dias antes da lua cheia, olhando só máximas e mínimas.
 *
 * Caracteriza a janela pela amplitude intradiária e pela profundidade das
 * quedas, monta a estratégia de comprar na mecha a partir desses números e
 * testa se a âncora lunar acrescenta alguma coisa.
 *
 * Rode com: npm run wick
 */

import { getCandles, type Candle } from "../lib/bitstamp";
import { moonPhasesBetween, type MoonPhase } from "../lib/moon";
import { buyAndHold, makeRandom } from "../lib/backtest";
import {
  phaseIndexes,
  profileWicks,
  runWickStrategy,
  runWickStrategyAt,
  type WickParams,
} from "../lib/wick";

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const mult = (v: number) => `${(1 + v).toFixed(2)}x`;
const day = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

const START_YEAR = 2018;
const LOOKBACK = 8;
const FORWARD = 6;

const all = await getCandles("1d");
const candles = all.filter((c) => c.time >= Date.UTC(START_YEAR, 0, 1) / 1000);
const phasesFor = (c: Candle[]): MoonPhase[] =>
  moonPhasesBetween(new Date(c[0].time * 1000), new Date(c[c.length - 1].time * 1000));
const phases = phasesFor(candles);

const profile = profileWicks(candles, phases, "full", LOOKBACK, FORWARD);

console.log(`\n${"=".repeat(88)}`);
console.log(`OS ${LOOKBACK} DIAS ANTES DA LUA CHEIA — só máximas e mínimas, ${START_YEAR}+`);
console.log("=".repeat(88));
console.log(`\n  ${profile.eventCount} luas cheias\n`);
console.log("   dia   amplitude   mecha p/ baixo   mecha p/ cima   dias >5%   maior amplitude");
for (const d of profile.byDay) {
  if (d.sampleSize === 0) continue;
  const marker = d.offset === 0 ? "  ← lua cheia" : "";
  console.log(
    `  ${String(d.offset).padStart(4)}   ${pct(d.meanRange).padStart(9)}   ${pct(d.meanDownWick).padStart(14)}   ${pct(d.meanUpWick).padStart(13)}   ${pct(d.volatileRate).padStart(8)}   ${pct(d.maxRange).padStart(14)}${marker}`,
  );
}

const ranges = profile.byDay.filter((d) => d.sampleSize > 0);
const widest = [...ranges].sort((a, b) => b.meanRange - a.meanRange)[0];
const deepest = [...ranges].sort((a, b) => a.meanDownWick - b.meanDownWick)[0];
console.log(`\n  dia mais volátil : ${widest.offset} (amplitude média ${pct(widest.meanRange)})`);
console.log(`  mecha mais funda : ${deepest.offset} (${pct(deepest.meanDownWick)})`);

console.log(`\n  QUEDA MÁXIMA da janela, medida contra a máxima corrente:`);
const q = profile.dipQuantiles;
console.log(
  `    mediana ${pct(q.median)} | média ${pct(q.mean)} | quartis ${pct(q.p25)} a ${pct(q.p75)}`,
);
console.log(`    as 10% piores janelas afundam ${pct(q.deep)} ou mais`);
console.log(`\n  ALTA MÁXIMA nos ${FORWARD} dias após a fase, contra o fundo da janela:`);
const r = profile.riseQuantiles;
console.log(`    mediana ${pct(r.median)} | média ${pct(r.mean)} | quartis ${pct(r.p25)} a ${pct(r.p75)}`);

// ------------------------------------------------------------------ a regra
console.log(`\n${"=".repeat(88)}`);
console.log("A ESTRATÉGIA — ordem limitada na mecha, alvo na alta, stop para as liquidações");
console.log("=".repeat(88));

const bh = buyAndHold(candles);
console.log(`\n  Comprar e segurar no período: ${mult(bh.totalReturn)} (CAGR ${pct(bh.cagr)})\n`);

// Os parâmetros vêm da caracterização, não de uma busca por retorno.
const dip = Math.abs(profile.dipQuantiles.median);
const target = profile.riseQuantiles.median / 2;
// O stop precisa ser medido a partir do PREÇO DE ENTRADA, não da máxima da
// janela: entrando já 9% abaixo do topo, o que resta até o fundo das piores
// janelas é bem menos do que a queda total.
const stop = Math.abs((1 + profile.dipQuantiles.deep) / (1 - dip) - 1);

const derived: WickParams = {
  phase: "full",
  lookbackDays: LOOKBACK,
  dipPct: dip,
  targetPct: target,
  stopPct: stop,
  exitAfterPhaseDays: FORWARD,
  fallback: false,
};

console.log("  Parâmetros medidos, sem otimizar:");
console.log(`    compra ${pct(dip)} abaixo da máxima corrente (mediana das quedas)`);
console.log(`    vende a +${pct(target)} (metade da alta mediana — alvo alcançável)`);
console.log(
  `    stop em ${pct(stop)} abaixo da entrada — é o que ainda resta de queda`,
);
console.log(
  `      nas 10% piores janelas, que afundam ${pct(profile.dipQuantiles.deep)} no total`,
);
console.log(`    encerra ${FORWARD} dias após a lua cheia se nada disparar\n`);

const result = runWickStrategy(candles, phases, derived);
console.log(`  Resultado: ${mult(result.totalReturn)} | CAGR ${pct(result.cagr)} | acerto ${pct(result.winRate)}`);
console.log(`    ${result.tradeCount} operações · ${result.missedWindows} janelas sem entrada`);
console.log(
  `    saídas — alvo: ${result.exits.target} | stop: ${result.exits.stop} | prazo: ${result.exits.deadline}`,
);
console.log(`    queda máxima do capital: ${pct(result.maxDrawdown)}\n`);

console.log("  primeiras 8 operações:");
console.log("    entrada       saída         entrada       saída        retorno   motivo   dia");
for (const t of result.trades.slice(0, 8)) {
  console.log(
    `    ${day(t.entryTime)}    ${day(t.exitTime)}    ${`$${t.entryPrice.toFixed(0)}`.padStart(9)}   ${`$${t.exitPrice.toFixed(0)}`.padStart(9)}   ${pct(t.return).padStart(8)}   ${t.exitReason.padEnd(8)} ${t.entryOffset}`,
  );
}

// -------------------------------------------------------- variações da regra
console.log(`\n${"=".repeat(88)}`);
console.log("VARIANDO A PROFUNDIDADE DA ENTRADA");
console.log("=".repeat(88));
console.log("\n    queda    ops   sem entrada   retorno   acerto   alvo/stop/prazo");
for (const d of [0.02, 0.03, 0.04, 0.05, 0.07, 0.09, 0.12]) {
  const res = runWickStrategy(candles, phases, { ...derived, dipPct: d });
  console.log(
    `    ${pct(d).padStart(6)}  ${String(res.tradeCount).padStart(4)}   ${String(res.missedWindows).padStart(10)}   ${mult(res.totalReturn).padStart(8)}   ${pct(res.winRate).padStart(6)}   ${res.exits.target}/${res.exits.stop}/${res.exits.deadline}`,
  );
}

// ------------------------------------------------- a âncora lunar acrescenta?
console.log(`\n${"=".repeat(88)}`);
console.log("A ÂNCORA LUNAR ACRESCENTA ALGUMA COISA?");
console.log("=".repeat(88));
console.log("\n  A MESMA regra — mesma ordem limitada, mesmo alvo, mesmo stop, mesma");
console.log("  janela — ancorada em datas sorteadas. 4.000 cenários.\n");

const anchors = phaseIndexes(candles, phases, "full");
const rng = makeRandom(80808);
const samples: number[] = [];

for (let t = 0; t < 4000; t++) {
  const fake: number[] = [];
  for (let i = 0; i < anchors.length; i++) {
    fake.push(
      LOOKBACK +
        1 +
        Math.floor(rng() * (candles.length - LOOKBACK - FORWARD - 2)),
    );
  }
  fake.sort((a, b) => a - b);
  samples.push(runWickStrategyAt(candles, fake, derived).totalReturn);
}
samples.sort((a, b) => a - b);

const beaten = samples.filter((s) => s < result.totalReturn).length;
const pValue = (samples.filter((s) => s >= result.totalReturn).length + 1) / (samples.length + 1);

console.log(`    com a lua cheia  : ${mult(result.totalReturn)}`);
console.log(`    sorteado (mediana): ${mult(samples[Math.floor(samples.length / 2)])}`);
console.log(
  `    faixa 5–95%       : ${mult(samples[Math.floor(samples.length * 0.05)])} a ${mult(samples[Math.floor(samples.length * 0.95)])}`,
);
console.log(`    percentil         : ${pct(beaten / samples.length)}`);
console.log(`    p-valor           : ${pValue.toFixed(4)} ${pValue < 0.05 ? "← significativo" : "← não significativo"}`);

// ------------------------------------------------------------ fora da amostra
console.log(`\n${"=".repeat(88)}`);
console.log("FORA DA AMOSTRA — mede na primeira metade, aplica na segunda");
console.log("=".repeat(88));

const split = Math.floor(candles.length / 2);
const train = candles.slice(0, split);
const test = candles.slice(split);
const trainPhases = phasesFor(train);
const testPhases = phasesFor(test);

const trainProfile = profileWicks(train, trainPhases, "full", LOOKBACK, FORWARD);
const oos: WickParams = {
  ...derived,
  dipPct: Math.abs(trainProfile.dipQuantiles.median),
  targetPct: trainProfile.riseQuantiles.median / 2,
  stopPct: Math.abs(
    (1 + trainProfile.dipQuantiles.deep) /
      (1 - Math.abs(trainProfile.dipQuantiles.median)) -
      1,
  ),
};

console.log(`\n  corte em ${day(test[0].time)}`);
console.log(
  `  medido no treino: queda ${pct(oos.dipPct)}, alvo ${pct(oos.targetPct)}, stop ${pct(oos.stopPct)}`,
);
console.log(`  (na amostra inteira: queda ${pct(dip)}, alvo ${pct(target)}, stop ${pct(stop)})\n`);

const inTrain = runWickStrategy(train, trainPhases, oos);
const inTest = runWickStrategy(test, testPhases, oos);
console.log(`  treino: ${mult(inTrain.totalReturn)}  (segurar: ${mult(buyAndHold(train).totalReturn)})`);
console.log(`  teste : ${mult(inTest.totalReturn)}  (segurar: ${mult(buyAndHold(test).totalReturn)})`);
console.log(
  `    ${inTest.tradeCount} ops · alvo ${inTest.exits.target} / stop ${inTest.exits.stop} / prazo ${inTest.exits.deadline}\n`,
);
