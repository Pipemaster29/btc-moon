/**
 * A estratégia de mecha nas duas direções.
 *
 * Comprada: espera a queda dentro da janela e compra na ordem parada abaixo da
 * máxima corrente. Vendida: espera a alta e vende na ordem parada acima da
 * mínima corrente. Tudo o mais é espelhado — alvo, stop e prazo.
 *
 * Rode com: npm run short
 */

import { getCandles, type Candle } from "../lib/bitstamp";
import { moonPhasesBetween, type MoonPhase } from "../lib/moon";
import { buyAndHold, makeRandom, type Direction } from "../lib/backtest";
import {
  phaseIndexes,
  profileWicks,
  runWickStrategy,
  runWickStrategyAt,
  type WickParams,
  type WickResult,
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

console.log(`\n${"=".repeat(90)}`);
console.log(`A JANELA VISTA DOS DOIS LADOS — ${LOOKBACK} dias antes da lua cheia, ${START_YEAR}+`);
console.log("=".repeat(90));
console.log(`\n  ${profile.eventCount} luas cheias\n`);

const d = profile.dipQuantiles;
const ral = profile.rallyQuantiles;
console.log("  MOVIMENTO MÁXIMO dentro da janela, contra o extremo corrente:");
console.log(`    queda (interessa a quem compra) : mediana ${pct(d.median)} | extremo ${pct(d.deep)}`);
console.log(`    alta  (interessa a quem vende)  : mediana ${pct(ral.median)} | extremo ${pct(ral.deep)}`);

const r = profile.riseQuantiles;
const da = profile.dropAfterQuantiles;
console.log(`\n  MOVIMENTO MÁXIMO nos ${FORWARD} dias após a fase:`);
console.log(`    alta  a partir do fundo da janela : mediana ${pct(r.median)}`);
console.log(`    queda a partir do topo da janela  : mediana ${pct(da.median)}`);

console.log(`
  Repare na assimetria: a alta típica dentro da janela (${pct(ral.median)}) é maior
  que a queda típica (${pct(d.median)}). Num ativo que subiu, é o esperado — e já
  antecipa que a ordem de venda vai executar mais vezes que a de compra.
`);

// ---------------------------------------------------------------- estratégias
const bh = buyAndHold(candles);

function build(direction: Direction): WickParams {
  const entry = direction === "long" ? Math.abs(d.median) : ral.median;
  const extreme = direction === "long" ? d.deep : ral.deep;
  // O stop mede o que ainda resta de movimento contrário depois da entrada.
  const stop =
    direction === "long"
      ? Math.abs((1 + extreme) / (1 - entry) - 1)
      : Math.abs((1 + extreme) / (1 + entry) - 1);
  const target =
    direction === "long" ? r.median / 2 : Math.abs(da.median) / 2;

  return {
    phase: "full",
    lookbackDays: LOOKBACK,
    dipPct: entry,
    targetPct: target,
    stopPct: stop,
    exitAfterPhaseDays: FORWARD,
    fallback: false,
    direction,
  };
}

const longParams = build("long");
const shortParams = build("short");

function report(label: string, params: WickParams, res: WickResult) {
  console.log(`\n  ${label}`);
  console.log(
    `    entra ${pct(params.dipPct)} ${params.direction === "long" ? "abaixo da máxima" : "acima da mínima"} corrente · alvo ${pct(params.targetPct)} · stop ${pct(params.stopPct)}`,
  );
  console.log(
    `    ${mult(res.totalReturn)} | CAGR ${pct(res.cagr)} | acerto ${pct(res.winRate)} | DD ${pct(res.maxDrawdown)}`,
  );
  console.log(
    `    ${res.tradeCount} ops · ${res.missedWindows} janelas sem entrada · alvo ${res.exits.target} / stop ${res.exits.stop} / prazo ${res.exits.deadline}`,
  );
}

console.log("=".repeat(90));
console.log("AS DUAS ESTRATÉGIAS, PARÂMETROS MEDIDOS E NÃO OTIMIZADOS");
console.log("=".repeat(90));
console.log(`\n  Comprar e segurar no período: ${mult(bh.totalReturn)} (CAGR ${pct(bh.cagr)})`);

const longRes = runWickStrategy(candles, phases, longParams);
const shortRes = runWickStrategy(candles, phases, shortParams);
report("COMPRADO — espera a queda", longParams, longRes);
report("VENDIDO — espera a alta", shortParams, shortRes);

console.log("\n  primeiras 8 operações vendidas:");
console.log("    entrada       saída         entrada      saída       retorno   motivo");
for (const t of shortRes.trades.slice(0, 8)) {
  console.log(
    `    ${day(t.entryTime)}    ${day(t.exitTime)}    ${`$${t.entryPrice.toFixed(0)}`.padStart(8)}   ${`$${t.exitPrice.toFixed(0)}`.padStart(8)}   ${pct(t.return).padStart(8)}   ${t.exitReason}`,
  );
}

// ------------------------------------------------------- variando a distância
console.log(`\n${"=".repeat(90)}`);
console.log("VARIANDO A DISTÂNCIA DA ORDEM");
console.log("=".repeat(90));
console.log("\n    distância   comprado                      vendido");
console.log("                retorno  ops  acerto        retorno  ops  acerto");
for (const dist of [0.02, 0.03, 0.05, 0.07, 0.09, 0.12]) {
  const l = runWickStrategy(candles, phases, { ...longParams, dipPct: dist });
  const sh = runWickStrategy(candles, phases, { ...shortParams, dipPct: dist });
  console.log(
    `    ${pct(dist).padStart(8)}   ${mult(l.totalReturn).padStart(7)} ${String(l.tradeCount).padStart(4)} ${pct(l.winRate).padStart(7)}       ${mult(sh.totalReturn).padStart(7)} ${String(sh.tradeCount).padStart(4)} ${pct(sh.winRate).padStart(7)}`,
  );
}

// ----------------------------------------------------------- a lua acrescenta?
console.log(`\n${"=".repeat(90)}`);
console.log("A ÂNCORA LUNAR ACRESCENTA ALGUMA COISA, NAS DUAS DIREÇÕES?");
console.log("=".repeat(90));
console.log("\n  A mesma regra em datas sorteadas. 4.000 cenários por direção.\n");

const anchors = phaseIndexes(candles, phases, "full");

function nullTest(label: string, params: WickParams, res: WickResult, seed: number) {
  const rng = makeRandom(seed);
  const samples: number[] = [];
  for (let t = 0; t < 4000; t++) {
    const fake: number[] = [];
    for (let i = 0; i < anchors.length; i++) {
      fake.push(
        LOOKBACK + 1 + Math.floor(rng() * (candles.length - LOOKBACK - FORWARD - 2)),
      );
    }
    fake.sort((a, b) => a - b);
    samples.push(runWickStrategyAt(candles, fake, params).totalReturn);
  }
  samples.sort((a, b) => a - b);
  const beaten = samples.filter((s) => s < res.totalReturn).length;
  const p = (samples.filter((s) => s >= res.totalReturn).length + 1) / (samples.length + 1);

  console.log(`  ${label}`);
  console.log(`    com a lua cheia   : ${mult(res.totalReturn)}`);
  console.log(`    sorteado (mediana): ${mult(samples[Math.floor(samples.length / 2)])}`);
  console.log(
    `    faixa 5–95%       : ${mult(samples[Math.floor(samples.length * 0.05)])} a ${mult(samples[Math.floor(samples.length * 0.95)])}`,
  );
  console.log(`    percentil         : ${pct(beaten / samples.length)}`);
  console.log(
    `    p-valor           : ${p.toFixed(4)} ${p < 0.05 ? "← significativo" : "← não significativo"}\n`,
  );
}

nullTest("COMPRADO", longParams, longRes, 80808);
nullTest("VENDIDO", shortParams, shortRes, 12121);

console.log("=".repeat(90));
console.log(`
  A venda a descoberto não paga funding nem aluguel nesta simulação. Em BTC o
  funding costuma ser positivo, ou seja, quem está vendido paga — o resultado
  real do lado vendido seria pior do que o mostrado aqui.
`);
