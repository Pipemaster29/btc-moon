/**
 * O padrão "cai antes da lua cheia, sobe na lua cheia ou depois".
 *
 * Mede exatamente isso: a queda do topo até o fundo na janela anterior à fase,
 * e a subida daquele fundo até o topo da janela posterior.
 *
 * A medição sozinha não diz nada, e o motivo é sutil: procurar o topo, depois o
 * fundo, depois o topo seguinte SEMPRE encontra uma queda seguida de subida.
 * É assim que a série é recortada, não uma propriedade da data escolhida. Por
 * isso cada número aparece ao lado do mesmo cálculo feito em datas sorteadas.
 *
 * Rode com: npm run pattern
 */

import { getCandles } from "../lib/bitstamp";
import { moonPhasesBetween } from "../lib/moon";
import { makeRandom } from "../lib/backtest";

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;

const START_YEAR = 2018;
const PRE = 10;
const POST = 10;

const all = await getCandles("1d");
const candles = all.filter((c) => c.time >= Date.UTC(START_YEAR, 0, 1) / 1000);
const phases = moonPhasesBetween(
  new Date(candles[0].time * 1000),
  new Date(candles[candles.length - 1].time * 1000),
);

const dayIndex = new Map<number, number>();
candles.forEach((c, i) => dayIndex.set(Math.floor(c.time / 86400), i));

interface Measurement {
  /** Queda do topo até o fundo, dentro da janela anterior. */
  drop: number;
  /** Subida do fundo até o topo da janela posterior. */
  rise: number;
  /** Retorno de quem comprasse no fechamento do dia da fase e vendesse no topo. */
  fromPhaseClose: number;
  /** Dias entre o fundo e a fase; negativo = fundo veio antes. */
  troughOffset: number;
}

function measure(anchorIdx: number): Measurement | null {
  const start = anchorIdx - PRE;
  const end = anchorIdx + POST;
  if (start < 0 || end >= candles.length) return null;

  // Topo da janela anterior, e o fundo que vem DEPOIS dele: é essa sequência
  // que o olho identifica como "caiu antes da lua cheia".
  let peakIdx = start;
  for (let i = start; i <= anchorIdx; i++) {
    if (candles[i].high > candles[peakIdx].high) peakIdx = i;
  }

  let troughIdx = peakIdx;
  for (let i = peakIdx; i <= anchorIdx; i++) {
    if (candles[i].low < candles[troughIdx].low) troughIdx = i;
  }

  // Topo da janela posterior, contado a partir do fundo.
  let postPeakIdx = anchorIdx;
  for (let i = anchorIdx; i <= end; i++) {
    if (candles[i].high > candles[postPeakIdx].high) postPeakIdx = i;
  }

  const drop = candles[troughIdx].low / candles[peakIdx].high - 1;
  const rise = candles[postPeakIdx].high / candles[troughIdx].low - 1;

  return {
    drop,
    rise,
    fromPhaseClose: candles[postPeakIdx].high / candles[anchorIdx].close - 1,
    troughOffset: troughIdx - anchorIdx,
  };
}

function summarize(label: string, anchors: number[]) {
  const m = anchors.map(measure).filter((x): x is Measurement => x !== null);
  const avg = (f: (x: Measurement) => number) =>
    m.reduce((s, x) => s + f(x), 0) / m.length;
  const med = (f: (x: Measurement) => number) => {
    const v = m.map(f).sort((a, b) => a - b);
    return v[Math.floor(v.length / 2)];
  };

  return {
    label,
    n: m.length,
    dropMean: avg((x) => x.drop),
    dropMedian: med((x) => x.drop),
    riseMean: avg((x) => x.rise),
    riseMedian: med((x) => x.rise),
    fromCloseMean: avg((x) => x.fromPhaseClose),
    troughOffsetMean: avg((x) => x.troughOffset),
    anyDrop: m.filter((x) => x.drop < 0).length / m.length,
    anyRise: m.filter((x) => x.rise > 0).length / m.length,
  };
}

const fullMoonAnchors: number[] = [];
for (const p of phases) {
  if (p.phase !== "full") continue;
  const i = dayIndex.get(Math.floor(p.date.getTime() / 1000 / 86400));
  if (i !== undefined) fullMoonAnchors.push(i);
}

const moon = summarize("LUA CHEIA", fullMoonAnchors);

console.log(`\n${"=".repeat(86)}`);
console.log(`O PADRÃO, MEDIDO — ${START_YEAR} até hoje, janela de ${PRE} dias antes e ${POST} depois`);
console.log("=".repeat(86));
console.log(`\n  ${moon.n} luas cheias\n`);
console.log(`  QUEDA (do topo até o fundo, antes da fase)`);
console.log(`    média ${pct(moon.dropMean)} | mediana ${pct(moon.dropMedian)}`);
console.log(`    houve queda em ${pct(moon.anyDrop)} das janelas`);
console.log(`\n  SUBIDA (do fundo até o topo, na fase ou depois)`);
console.log(`    média ${pct(moon.riseMean)} | mediana ${pct(moon.riseMedian)}`);
console.log(`    houve subida em ${pct(moon.anyRise)} das janelas`);
console.log(`\n  O fundo caiu em média ${moon.troughOffsetMean.toFixed(1)} dias da lua cheia`);
console.log(`  Comprando no FECHAMENTO da lua cheia e vendendo no topo: ${pct(moon.fromCloseMean)}`);

// ------------------------------------------------------------- o controle
console.log(`\n${"=".repeat(86)}`);
console.log("O MESMO CÁLCULO EM DATAS SORTEADAS");
console.log("=".repeat(86));
console.log("\n  Mesma janela, mesma conta — só a âncora muda. 200 conjuntos sorteados,");
console.log(`  cada um com ${moon.n} datas, para comparar com as ${moon.n} luas cheias.\n`);

const random = makeRandom(20260731);
const trials: ReturnType<typeof summarize>[] = [];

for (let t = 0; t < 200; t++) {
  const anchors: number[] = [];
  for (let i = 0; i < moon.n; i++) {
    anchors.push(PRE + Math.floor(random() * (candles.length - PRE - POST - 1)));
  }
  trials.push(summarize("aleatório", anchors));
}

const stat = (f: (s: ReturnType<typeof summarize>) => number) => {
  const v = trials.map(f).sort((a, b) => a - b);
  return {
    mean: v.reduce((s, x) => s + x, 0) / v.length,
    p05: v[Math.floor(v.length * 0.05)],
    p95: v[Math.floor(v.length * 0.95)],
  };
};

const dropStat = stat((s) => s.dropMean);
const riseStat = stat((s) => s.riseMean);
const closeStat = stat((s) => s.fromCloseMean);

console.log("                       lua cheia     datas sorteadas      faixa 5–95%");
console.log(
  `  queda média         ${pct(moon.dropMean).padStart(10)}  ${pct(dropStat.mean).padStart(15)}   ${pct(dropStat.p05)} a ${pct(dropStat.p95)}`,
);
console.log(
  `  subida média        ${pct(moon.riseMean).padStart(10)}  ${pct(riseStat.mean).padStart(15)}   ${pct(riseStat.p05)} a ${pct(riseStat.p95)}`,
);
console.log(
  `  do fechamento       ${pct(moon.fromCloseMean).padStart(10)}  ${pct(closeStat.mean).padStart(15)}   ${pct(closeStat.p05)} a ${pct(closeStat.p95)}`,
);

const dropRank = trials.filter((t) => t.dropMean < moon.dropMean).length / trials.length;
const riseRank = trials.filter((t) => t.riseMean < moon.riseMean).length / trials.length;
console.log(`\n  percentil da queda da lua cheia : ${pct(dropRank)}`);
console.log(`  percentil da subida da lua cheia: ${pct(riseRank)}`);

// -------------------------------------------------------- por que engana
console.log(`\n${"=".repeat(86)}`);
console.log("POR QUE O PADRÃO APARECE SEMPRE");
console.log("=".repeat(86));
console.log(`
  Procurar o topo, depois o fundo depois dele, depois o topo seguinte encontra
  uma queda seguida de subida em ${pct(moon.anyDrop)} das janelas — por construção.
  O mesmo recorte em qualquer data produz números praticamente idênticos.

  O que o gráfico mostra é real; o que ele não mostra são as luas cheias em que
  o preço subiu antes e caiu depois. Elas existem na mesma proporção, mas não
  chamam atenção quando se procura o padrão.
`);
