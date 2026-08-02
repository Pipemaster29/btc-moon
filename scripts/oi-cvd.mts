/**
 * Os quatro cenários de OI × CVD × preço, medidos.
 *
 * Ao contrário da lua, estes sinais têm mecanismo: o open interest mede quanto
 * capital está posicionado e o CVD mede de que lado está a agressão. A pergunta
 * é se a leitura do infográfico se confirma nos dados.
 *
 * O teste de significância usa ROTAÇÃO: desliza a série de regimes no tempo em
 * relação aos retornos. Isso preserva a autocorrelação das duas séries — que é
 * alta, porque janelas de retorno futuro se sobrepõem — e destrói apenas o
 * alinhamento entre elas. Embaralhar os dias daria erros padrão pequenos demais.
 *
 * Rode com: npm run oi-cvd
 */

import { readFile } from "node:fs/promises";
import { makeRandom } from "../lib/backtest";
import { classify, REGIME_LABEL, type DerivBar, type Regime } from "../lib/derivatives";

const pct = (v: number) => `${(v * 100).toFixed(2)}%`;
const signed = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;

const bars: DerivBar[] = JSON.parse(await readFile(".cache/btcusdt-daily.json", "utf8"));

const first = new Date(bars[0].time * 1000).toISOString().slice(0, 10);
const last = new Date(bars[bars.length - 1].time * 1000).toISOString().slice(0, 10);

console.log(`\n${"=".repeat(94)}`);
console.log("PREÇO × OPEN INTEREST × CVD — os quatro cenários");
console.log("=".repeat(94));
console.log(`\n  ${bars.length} dias de BTCUSDT perpétuo na Binance: ${first} → ${last}`);

const REGIMES: Regime[] = [
  "bullish",
  "short-covering",
  "bearish",
  "long-liquidation",
];
const HORIZONS = [1, 3, 7, 14];
const LOOKBACKS = [3, 5, 7];

function forwardReturn(index: number, horizon: number): number | null {
  const now = bars[index];
  const later = bars[index + horizon];
  if (!now || !later) return null;
  return later.close / now.close - 1;
}

/** Retorno médio de cada regime, por horizonte. */
function meansByRegime(labels: Regime[], horizon: number) {
  const sums = new Map<Regime, { total: number; count: number }>();
  for (const r of REGIMES) sums.set(r, { total: 0, count: 0 });

  for (let i = 0; i < bars.length; i++) {
    const regime = labels[i];
    if (regime === "none") continue;
    const fwd = forwardReturn(i, horizon);
    if (fwd === null) continue;
    const bucket = sums.get(regime)!;
    bucket.total += fwd;
    bucket.count++;
  }

  return sums;
}

for (const lookback of LOOKBACKS) {
  const labels: Regime[] = bars.map((_, i) => classify(bars, i, lookback));

  const counts = new Map<Regime, number>();
  for (const r of REGIMES) counts.set(r, labels.filter((l) => l === r).length);
  const classified = [...counts.values()].reduce((s, v) => s + v, 0);

  console.log(`\n${"─".repeat(94)}`);
  console.log(`COMPARANDO CONTRA ${lookback} DIAS ATRÁS`);
  console.log("─".repeat(94));
  console.log(
    `\n  ${classified} dias classificados (${pct(classified / bars.length)} do total)\n`,
  );

  // Retorno médio de todos os dias, que é a referência a bater.
  const baselines = new Map<number, number>();
  for (const h of HORIZONS) {
    const values: number[] = [];
    for (let i = 0; i < bars.length; i++) {
      const fwd = forwardReturn(i, h);
      if (fwd !== null) values.push(fwd);
    }
    baselines.set(h, values.reduce((s, v) => s + v, 0) / values.length);
  }

  console.log("  cenário                                    n      +1d      +3d      +7d     +14d");
  for (const regime of REGIMES) {
    const row: string[] = [];
    let n = 0;
    for (const h of HORIZONS) {
      const bucket = meansByRegime(labels, h).get(regime)!;
      n = bucket.count;
      row.push(signed(bucket.count === 0 ? 0 : bucket.total / bucket.count).padStart(8));
    }
    console.log(`  ${REGIME_LABEL[regime].padEnd(40)} ${String(n).padStart(4)} ${row.join(" ")}`);
  }

  const baseRow = HORIZONS.map((h) => signed(baselines.get(h)!).padStart(8)).join(" ");
  console.log(`  ${"QUALQUER DIA (referência)".padEnd(40)} ${String(bars.length).padStart(4)} ${baseRow}`);
}

// ------------------------------------------------------- teste de rotação
console.log(`\n${"=".repeat(94)}`);
console.log("TESTE DE ROTAÇÃO — o alinhamento entre regime e retorno é real?");
console.log("=".repeat(94));
console.log(`
  A série de regimes é deslizada no tempo por um deslocamento sorteado. Se os
  cenários realmente antecipam o movimento, o alinhamento verdadeiro precisa se
  destacar dos deslocados.
`);

const LOOKBACK = 5;
const HORIZON = 7;
const TRIALS = 5000;
const labels: Regime[] = bars.map((_, i) => classify(bars, i, LOOKBACK));

console.log(`  lookback ${LOOKBACK} dias · horizonte ${HORIZON} dias · ${TRIALS.toLocaleString("pt-BR")} rotações\n`);
console.log("  cenário                                observado    rotações   percentil   p-valor");

const random = makeRandom(20260801);

for (const regime of REGIMES) {
  const observed = (() => {
    const b = meansByRegime(labels, HORIZON).get(regime)!;
    return b.count === 0 ? 0 : b.total / b.count;
  })();

  const samples: number[] = [];
  for (let t = 0; t < TRIALS; t++) {
    const shift = 1 + Math.floor(random() * (bars.length - 2));
    let total = 0;
    let count = 0;
    for (let i = 0; i < bars.length; i++) {
      if (labels[(i + shift) % bars.length] !== regime) continue;
      const fwd = forwardReturn(i, HORIZON);
      if (fwd === null) continue;
      total += fwd;
      count++;
    }
    if (count > 0) samples.push(total / count);
  }
  samples.sort((a, b) => a - b);

  const below = samples.filter((s) => s < observed).length;
  const percentile = below / samples.length;
  // Bicaudal: interessa tanto ficar muito acima quanto muito abaixo do acaso.
  const p = 2 * Math.min(percentile, 1 - percentile);

  console.log(
    `  ${REGIME_LABEL[regime].padEnd(38)} ${signed(observed).padStart(9)} ${signed(samples[Math.floor(samples.length / 2)]).padStart(11)} ${pct(percentile).padStart(11)} ${p.toFixed(4).padStart(9)}${p < 0.05 ? " ←" : ""}`,
  );
}

console.log(`
  Com quatro cenários testados, o limiar de 5% corrigido vira ${(0.05 / 4).toFixed(4)}.
`);

// ------------------------------------------------------------------ estratégia
console.log("=".repeat(94));
console.log("COMO ESTRATÉGIA — comprado por 7 dias a cada sinal do cenário");
console.log("=".repeat(94));

/** Compra no fechamento do sinal e segura, sem sobrepor posições. */
function tradeRegime(
  labels: Regime[],
  regime: Regime,
  hold: number,
  from: number,
  to: number,
): { equity: number; trades: number } {
  let equity = 1;
  let trades = 0;
  let freeAt = from;

  for (let i = from; i < to - hold; i++) {
    if (labels[i] !== regime || i < freeAt) continue;
    const fwd = bars[i + hold].close / bars[i].close - 1;
    equity *= 1 + fwd;
    trades++;
    freeAt = i + hold;
  }

  return { equity, trades };
}

const split = Math.floor(bars.length / 2);
const splitDate = new Date(bars[split].time * 1000).toISOString().slice(0, 10);
const holdAll = bars[bars.length - 1].close / bars[0].close;
const holdTrain = bars[split].close / bars[0].close;
const holdTest = bars[bars.length - 1].close / bars[split].close;

console.log(`\n  Comprar e segurar: ${holdAll.toFixed(2)}x no período todo`);
console.log(`    ${holdTrain.toFixed(2)}x no treino · ${holdTest.toFixed(2)}x no teste`);
console.log(`  Corte fora da amostra em ${splitDate}\n`);
console.log("  cenário                                 tudo   ops     treino    teste   segurar(teste)");

for (const regime of REGIMES) {
  const all = tradeRegime(labels, regime, HORIZON, 0, bars.length);
  const tr = tradeRegime(labels, regime, HORIZON, 0, split);
  const te = tradeRegime(labels, regime, HORIZON, split, bars.length);
  console.log(
    `  ${REGIME_LABEL[regime].padEnd(38)} ${`${all.equity.toFixed(2)}x`.padStart(6)} ${String(all.trades).padStart(5)}   ${`${tr.equity.toFixed(2)}x`.padStart(7)}  ${`${te.equity.toFixed(2)}x`.padStart(7)}   ${`${holdTest.toFixed(2)}x`.padStart(8)}`,
  );
}

console.log(`
  A comparação que importa é treino contra teste: um sinal real mantém o sinal
  nas duas metades. O melhor cenário da primeira metade precisa continuar bom na
  segunda para não ser apenas o vencedor de uma escolha feita olhando os dados.
`);
