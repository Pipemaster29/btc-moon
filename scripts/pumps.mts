/**
 * O que acontece depois de um pump?
 *
 * A tese é que altas violentas em moedas de baixa liquidez são manipuladas e
 * revertem. Diferente da lua, isso tem mecanismo: não há fluxo comprador
 * genuíno sustentando o preço, e quem organizou a alta precisa vender nela.
 *
 * O universo inclui moedas DESLISTADAS. Sem elas a análise mediria só quem
 * sobreviveu, e as que morreram são exatamente as que mais caíram — o viés
 * apontaria na direção contrária à conclusão.
 *
 * Rode com: npm run pumps
 */

import { readFile } from "node:fs/promises";
import { makeRandom } from "../lib/backtest";

interface Bar {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  takerBuy: number;
  delta: number;
}

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const signed = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;

const series: Record<string, Bar[]> = JSON.parse(
  await readFile(".cache/alts-daily.json", "utf8"),
);

const symbols = Object.keys(series);
const totalDays = Object.values(series).reduce((s, v) => s + v.length, 0);

console.log(`\n${"=".repeat(94)}`);
console.log("DEPOIS DO PUMP — o que o preço faz");
console.log("=".repeat(94));
console.log(`\n  ${symbols.length} perpétuos · ${totalDays.toLocaleString("pt-BR")} dias · 2023 até hoje`);

// Moedas cuja série termina bem antes do fim do período foram deslistadas.
const lastTime = Math.max(...Object.values(series).map((b) => b[b.length - 1].time));
const dead = symbols.filter((s) => {
  const bars = series[s];
  return lastTime - bars[bars.length - 1].time > 60 * 86400;
});
console.log(`  ${dead.length} já não são negociados (deslistados ou mortos)`);

const HORIZONS = [1, 3, 7, 14, 30];

/** Mediana do volume nos 20 dias anteriores, para medir o excesso do dia. */
function volumeBaseline(bars: Bar[], index: number): number {
  const window = bars.slice(Math.max(index - 20, 0), index);
  if (window.length === 0) return 0;
  const v = window.map((b) => b.volume).sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
}

interface Pump {
  symbol: string;
  index: number;
  dayReturn: number;
  volumeRatio: number;
}

function findPumps(minGain: number, minVolumeRatio: number): Pump[] {
  const out: Pump[] = [];

  for (const symbol of symbols) {
    const bars = series[symbol];
    for (let i = 21; i < bars.length; i++) {
      const dayReturn = bars[i].close / bars[i - 1].close - 1;
      if (dayReturn < minGain) continue;

      const base = volumeBaseline(bars, i);
      if (base <= 0) continue;
      const volumeRatio = bars[i].volume / base;
      if (volumeRatio < minVolumeRatio) continue;

      out.push({ symbol, index: i, dayReturn, volumeRatio });
    }
  }

  return out;
}

function forward(symbol: string, index: number, horizon: number): number | null {
  const bars = series[symbol];
  const later = bars[index + horizon];
  if (!later) return null;
  return later.close / bars[index].close - 1;
}

/** Retorno médio de qualquer dia, que é a referência a bater. */
const baseline = new Map<number, number>();
for (const h of HORIZONS) {
  const values: number[] = [];
  for (const symbol of symbols) {
    const bars = series[symbol];
    for (let i = 21; i < bars.length; i++) {
      const f = forward(symbol, i, h);
      if (f !== null) values.push(f);
    }
  }
  baseline.set(h, values.reduce((s, v) => s + v, 0) / values.length);
}

console.log(`\n${"─".repeat(94)}`);
console.log("RETORNO APÓS O PUMP, POR INTENSIDADE");
console.log("─".repeat(94));
console.log("\n  critério do dia            n     +1d      +3d      +7d     +14d     +30d");

for (const [gain, vol] of [
  [0.15, 2],
  [0.2, 3],
  [0.3, 3],
  [0.5, 4],
  [0.8, 5],
] as [number, number][]) {
  const pumps = findPumps(gain, vol);
  if (pumps.length === 0) continue;

  const row = HORIZONS.map((h) => {
    const values = pumps
      .map((p) => forward(p.symbol, p.index, h))
      .filter((v): v is number => v !== null);
    if (values.length === 0) return "—".padStart(8);
    return signed(values.reduce((s, v) => s + v, 0) / values.length).padStart(8);
  });

  console.log(
    `  +${pct(gain).padEnd(6)} e ${vol}x volume  ${String(pumps.length).padStart(5)} ${row.join(" ")}`,
  );
}

const baseRow = HORIZONS.map((h) => signed(baseline.get(h)!).padStart(8)).join(" ");
console.log(`  ${"QUALQUER DIA".padEnd(23)} ${String(totalDays).padStart(5)} ${baseRow}`);

// ------------------------------------------------------------------ o teste
console.log(`\n${"─".repeat(94)}`);
console.log("O EFEITO É REAL OU É O MERCADO INTEIRO CAINDO?");
console.log("─".repeat(94));

const PUMP_GAIN = 0.3;
const PUMP_VOL = 3;
const HORIZON = 7;
const pumps = findPumps(PUMP_GAIN, PUMP_VOL);

const observed = (() => {
  const v = pumps
    .map((p) => forward(p.symbol, p.index, HORIZON))
    .filter((x): x is number => x !== null);
  return v.reduce((s, x) => s + x, 0) / v.length;
})();

// Sorteia dias DENTRO DAS MESMAS MOEDAS: assim o teste não confunde o efeito
// do pump com o fato de altcoins caírem em geral.
const random = makeRandom(31415);
const samples: number[] = [];
for (let t = 0; t < 4000; t++) {
  let total = 0;
  let count = 0;
  for (const p of pumps) {
    const bars = series[p.symbol];
    const i = 21 + Math.floor(random() * (bars.length - 21 - HORIZON));
    const f = forward(p.symbol, i, HORIZON);
    if (f !== null) {
      total += f;
      count++;
    }
  }
  if (count > 0) samples.push(total / count);
}
samples.sort((a, b) => a - b);

const below = samples.filter((s) => s < observed).length;
const percentile = below / samples.length;
const p = 2 * Math.min(percentile, 1 - percentile);

console.log(`\n  ${pumps.length} pumps de +${pct(PUMP_GAIN)} com ${PUMP_VOL}x de volume · horizonte ${HORIZON} dias\n`);
console.log(`    depois do pump          : ${signed(observed)}`);
console.log(`    dia sorteado nas mesmas moedas: ${signed(samples[Math.floor(samples.length / 2)])}`);
console.log(
  `    faixa 5–95%             : ${signed(samples[Math.floor(samples.length * 0.05)])} a ${signed(samples[Math.floor(samples.length * 0.95)])}`,
);
console.log(`    percentil               : ${pct(percentile)}`);
console.log(`    p-valor                 : ${p.toFixed(4)} ${p < 0.05 ? "← significativo" : "← não significativo"}`);

// --------------------------------------------------------- vendido de fato
console.log(`\n${"─".repeat(94)}`);
console.log("VENDIDO NO PUMP — alavancagem baixa, liquidação longe");
console.log("─".repeat(94));
console.log(`
  Vende no fechamento do dia do pump. Sem stop apertado: a proteção é a
  alavancagem baixa, que empurra a liquidação para longe. Com 2x ela fica 50%
  acima da entrada; com 3x, 33%.
`);
console.log("  alav.  liquida em   ops   liquidadas    retorno médio   mediana   acerto");

for (const leverage of [1, 2, 3]) {
  const results: number[] = [];
  let liquidated = 0;

  for (const pump of pumps) {
    const bars = series[pump.symbol];
    const entry = bars[pump.index].close;
    const liqPrice = entry * (1 + 1 / leverage);

    let exitPrice = entry;
    let wiped = false;
    const last = Math.min(pump.index + HORIZON, bars.length - 1);
    if (last <= pump.index) continue;

    for (let i = pump.index + 1; i <= last; i++) {
      if (bars[i].high >= liqPrice) {
        wiped = true;
        break;
      }
      exitPrice = bars[i].close;
    }

    if (wiped) {
      liquidated++;
      results.push(-1);
    } else {
      results.push((1 - exitPrice / entry) * leverage);
    }
  }

  const mean = results.reduce((s, v) => s + v, 0) / results.length;
  const sorted = [...results].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const wins = results.filter((v) => v > 0).length / results.length;

  console.log(
    `  ${`${leverage}x`.padStart(4)}   ${pct(1 / leverage).padStart(9)}  ${String(results.length).padStart(4)}   ${String(liquidated).padStart(10)}   ${signed(mean).padStart(13)}  ${signed(median).padStart(8)}  ${pct(wins).padStart(6)}`,
  );
}

console.log(`
  Nada aqui cobra funding, corretagem nem custo de aluguel — e vender moeda
  manipulada costuma ser caro nos três. O resultado real fica abaixo destes.
`);
