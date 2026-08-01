/**
 * Os grandes eventos cripto caem perto da lua cheia?
 *
 * Para cada evento mede-se a distância até a lua cheia mais próxima. Se as
 * datas não tiverem relação com a lua, essas distâncias se espalham
 * uniformemente entre 0 e meia lunação, com média de 7,38 dias.
 *
 * Rode com: npm run events
 */

import { moonPhasesBetween } from "../lib/moon";
import { makeRandom, SYNODIC_MONTH } from "../lib/backtest";
import { EVENT_KIND_LABEL, MARKET_EVENTS, eventTime, type EventKind } from "../lib/events";

const DAY = 86400;
const HALF_LUNATION = SYNODIC_MONTH / 2;
/** Distância média esperada quando as datas não têm relação com a lua. */
const EXPECTED_MEAN = HALF_LUNATION / 2;

const from = new Date("2012-01-01T00:00:00Z");
const to = new Date("2026-12-31T00:00:00Z");
const phases = moonPhasesBetween(from, to);

const fullMoons = phases
  .filter((p) => p.phase === "full")
  .map((p) => p.date.getTime() / 1000)
  .sort((a, b) => a - b);

const newMoons = phases
  .filter((p) => p.phase === "new")
  .map((p) => p.date.getTime() / 1000)
  .sort((a, b) => a - b);

/** Distância em dias até a data mais próxima da lista. */
function distanceTo(times: number[], target: number): number {
  let best = Infinity;
  for (const t of times) {
    const d = Math.abs(t - target) / DAY;
    if (d < best) best = d;
  }
  return best;
}

const rows = MARKET_EVENTS.map((e) => {
  const t = eventTime(e);
  return {
    event: e,
    toFull: distanceTo(fullMoons, t),
    toNew: distanceTo(newMoons, t),
  };
});

console.log(`\n${"=".repeat(84)}`);
console.log("DISTÂNCIA DE CADA EVENTO ATÉ A LUA CHEIA MAIS PRÓXIMA");
console.log("=".repeat(84));
console.log(`\n  ${rows.length} eventos · meia lunação = ${HALF_LUNATION.toFixed(2)} dias\n`);
console.log("  data         evento                                    →lua cheia  →lua nova");
for (const r of rows.sort((a, b) => a.toFull - b.toFull)) {
  const bar = "▇".repeat(Math.round(r.toFull * 1.6));
  console.log(
    `  ${r.event.date}   ${r.event.label.slice(0, 40).padEnd(40)} ${r.toFull.toFixed(1).padStart(6)}d ${r.toNew.toFixed(1).padStart(9)}d  ${bar}`,
  );
}

const meanFull = rows.reduce((s, r) => s + r.toFull, 0) / rows.length;
const meanNew = rows.reduce((s, r) => s + r.toNew, 0) / rows.length;

console.log(`\n  distância média até a lua cheia: ${meanFull.toFixed(2)} dias`);
console.log(`  distância média até a lua nova : ${meanNew.toFixed(2)} dias`);
console.log(`  esperado sem relação alguma    : ${EXPECTED_MEAN.toFixed(2)} dias`);

// ------------------------------------------------------------------ o teste
console.log(`\n${"=".repeat(84)}`);
console.log("TESTE — as datas se concentram perto da lua cheia?");
console.log("=".repeat(84));

const TRIALS = 20000;
const random = makeRandom(31072026);
const spanStart = Date.parse("2013-01-01T00:00:00Z") / 1000;
const spanEnd = Date.parse("2026-07-01T00:00:00Z") / 1000;

const samples: number[] = [];
for (let t = 0; t < TRIALS; t++) {
  let total = 0;
  for (let i = 0; i < rows.length; i++) {
    const when = spanStart + random() * (spanEnd - spanStart);
    total += distanceTo(fullMoons, when);
  }
  samples.push(total / rows.length);
}
samples.sort((a, b) => a - b);

// Concentração significaria distância MENOR que o acaso.
const below = samples.filter((s) => s <= meanFull).length;
const pValue = (below + 1) / (samples.length + 1);

console.log(`\n  ${TRIALS.toLocaleString("pt-BR")} conjuntos de ${rows.length} datas sorteadas\n`);
console.log(`  observado nos eventos reais : ${meanFull.toFixed(2)} dias`);
console.log(`  sorteado (mediana)          : ${samples[Math.floor(samples.length / 2)].toFixed(2)} dias`);
console.log(
  `  faixa 5–95% do acaso        : ${samples[Math.floor(samples.length * 0.05)].toFixed(2)} a ${samples[Math.floor(samples.length * 0.95)].toFixed(2)} dias`,
);
console.log(`\n  p-valor (concentração) : ${pValue.toFixed(4)} ${pValue < 0.05 ? "← significativo" : "← não significativo"}`);
console.log(
  `  leitura: ${(below / samples.length * 100).toFixed(1)}% dos sorteios ficaram tão ou mais perto da lua cheia`,
);

// --------------------------------------------------------------- por tipo
console.log(`\n${"=".repeat(84)}`);
console.log("POR TIPO DE EVENTO");
console.log("=".repeat(84) + "\n");

const kinds = [...new Set(MARKET_EVENTS.map((e) => e.kind))] as EventKind[];
for (const kind of kinds) {
  const subset = rows.filter((r) => r.event.kind === kind);
  const m = subset.reduce((s, r) => s + r.toFull, 0) / subset.length;
  console.log(
    `  ${EVENT_KIND_LABEL[kind].padEnd(24)} n=${String(subset.length).padStart(2)}  média ${m.toFixed(2)}d`,
  );
}

const near3 = rows.filter((r) => r.toFull <= 3).length;
console.log(`\n  eventos a até 3 dias da lua cheia: ${near3} de ${rows.length} (${((near3 / rows.length) * 100).toFixed(0)}%)`);
console.log(`  esperado por acaso: ${((3 / HALF_LUNATION) * 100).toFixed(0)}%\n`);

// ------------------------------------------------- subgrupo escolhido depois
console.log("=".repeat(84));
console.log("O SUBGRUPO DAS QUEBRAS — e por que ele merece desconfiança");
console.log("=".repeat(84));

const crashes = rows.filter((r) => r.event.kind === "crash");
const crashMean = crashes.reduce((s, r) => s + r.toFull, 0) / crashes.length;

const crashSamples: number[] = [];
const rng2 = makeRandom(981234);
for (let t = 0; t < TRIALS; t++) {
  let total = 0;
  for (let i = 0; i < crashes.length; i++) {
    total += distanceTo(fullMoons, spanStart + rng2() * (spanEnd - spanStart));
  }
  crashSamples.push(total / crashes.length);
}
crashSamples.sort((a, b) => a - b);
const crashP =
  (crashSamples.filter((s) => s <= crashMean).length + 1) / (crashSamples.length + 1);

console.log(`\n  ${crashes.length} quebras · distância média ${crashMean.toFixed(2)}d (esperado ${EXPECTED_MEAN.toFixed(2)}d)`);
console.log(`  p-valor isolado: ${crashP.toFixed(4)}`);
console.log(`
  Este p-valor NÃO vale como evidência. O subgrupo foi escolhido depois de
  olhar os resultados, justamente por parecer o mais promissor — são quatro
  categorias, e testar a melhor delas é o mesmo erro de escolher a melhor de
  milhares de estratégias. Corrigindo pelas 4 categorias, o limiar de 5% vira
  ${(0.05 / 4).toFixed(4)}.
`);
