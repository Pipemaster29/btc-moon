/**
 * Quatro formas de investir US$ 1.000 por mês em Bitcoin.
 *
 *  1. aporte mensal em data sorteada, sem análise nenhuma;
 *  2. o mesmo aporte, operando a queda na janela da lua cheia com alavancagem;
 *  3. a mesma coisa, mas ancorada em datas sorteadas em vez da lua;
 *  4. comprar 364 dias após o topo do ciclo e vender 1060 dias depois.
 *
 * Rode com: npm run compare
 */

import { getCandles, type Candle } from "../lib/bitstamp";
import { moonPhasesBetween } from "../lib/moon";
import { makeRandom } from "../lib/backtest";
import {
  simulate,
  simulateDCA,
  type LadderConfig,
  type PortfolioResult,
  type StrategyHooks,
} from "../lib/portfolio";

const usd = (v: number) =>
  `$${Math.round(v).toLocaleString("pt-BR")}`;
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

const START = "2021-01-01";
const MONTHLY = 1000;
const LEVERAGE = 3;
const WINDOW_BEFORE = 8;
const WINDOW_AFTER = 9;
/** Queda no dia que dispara a compra — o "candle vermelho" da regra. */
const RED_CANDLE = 0.05;

const ladder: LadderConfig = {
  firstTargetPct: 0.2,
  firstTakeFraction: 0.9,
  breakevenPct: 0.01,
  rungPct: 0.2,
  stopPct: 0.1,
};

const all = await getCandles("1d");
const candles = all.filter((c) => c.time >= Date.parse(`${START}T00:00:00Z`) / 1000);
const phases = moonPhasesBetween(
  new Date(candles[0].time * 1000),
  new Date(candles[candles.length - 1].time * 1000),
);

const firstDay = new Date(candles[0].time * 1000).toISOString().slice(0, 10);
const lastDay = new Date(candles[candles.length - 1].time * 1000).toISOString().slice(0, 10);
const months = new Set(
  candles.map((c) => new Date(c.time * 1000).toISOString().slice(0, 7)),
).size;

console.log(`\n${"=".repeat(96)}`);
console.log(`US$ ${MONTHLY} POR MÊS — ${firstDay} até ${lastDay}`);
console.log("=".repeat(96));
console.log(`\n  ${months} aportes · US$ ${(months * MONTHLY).toLocaleString("pt-BR")} depositados no total`);
console.log(`  BTC: ${usd(candles[0].close)} → ${usd(candles[candles.length - 1].close)}\n`);

// ------------------------------------------------------ 1. aporte sem critério
const dcaRuns: number[] = [];
for (let seed = 0; seed < 500; seed++) {
  dcaRuns.push(simulateDCA(candles, MONTHLY, makeRandom(1000 + seed)).multiple);
}
dcaRuns.sort((a, b) => a - b);
const dcaMedian = dcaRuns[Math.floor(dcaRuns.length / 2)];
const deposited = months * MONTHLY;

console.log("─".repeat(96));
console.log("1. APORTE MENSAL EM DATA SORTEADA (sem alavancagem, sem análise)");
console.log("─".repeat(96));
console.log(`\n  500 sorteios de calendário para não depender de um dia de sorte:`);
console.log(`    mediana : ${dcaMedian.toFixed(2)}x  →  ${usd(dcaMedian * deposited)}`);
console.log(
  `    faixa   : ${dcaRuns[Math.floor(dcaRuns.length * 0.05)].toFixed(2)}x a ${dcaRuns[Math.floor(dcaRuns.length * 0.95)].toFixed(2)}x`,
);

// --------------------------------------------- 2. a regra da lua com alavanca
/** Índices dos candles em que ocorre a fase. */
function phaseIndexes(): number[] {
  const byDay = new Map<number, number>();
  candles.forEach((c, i) => byDay.set(Math.floor(c.time / 86400), i));
  const out: number[] = [];
  for (const p of phases) {
    if (p.phase !== "full") continue;
    const day = Math.floor(p.date.getTime() / 1000 / 86400);
    for (let d = day; d <= day + 3; d++) {
      const i = byDay.get(d);
      if (i !== undefined) {
        out.push(i);
        break;
      }
    }
  }
  return out;
}

/** Marca os dias em que a ordem pode ficar no book, e o prazo de cada janela. */
function buildWindows(anchors: number[]) {
  const open = new Set<number>();
  const deadlineByDay = new Map<number, number>();
  const windowByDay = new Map<number, number>();

  anchors.forEach((anchor, w) => {
    for (let i = Math.max(anchor - WINDOW_BEFORE, 0); i <= anchor; i++) {
      open.add(i);
      deadlineByDay.set(i, Math.min(anchor + WINDOW_AFTER, candles.length - 1));
      windowByDay.set(i, w);
    }
  });

  return { open, deadlineByDay, windowByDay };
}

function makeHooks(anchors: number[]): StrategyHooks {
  const { open, deadlineByDay, windowByDay } = buildWindows(anchors);

  return {
    limitPrice({ index, previousIndex }) {
      if (!open.has(index) || previousIndex < 0) return null;
      // Ordem parada 5% abaixo do fechamento anterior: executa no dia em que o
      // mercado cai o suficiente, sem precisar prever qual dia será.
      return candles[previousIndex].close * (1 - RED_CANDLE);
    },
    windowId(index) {
      return windowByDay.get(index) ?? -1;
    },
    deadlineIndex(entryIndex) {
      return deadlineByDay.get(entryIndex) ?? entryIndex + WINDOW_AFTER;
    },
    allocation: 1,
    leverage: LEVERAGE,
    ladder,
    maxReentries: 2,
    reentryDropPct: 0.1,
  };
}

const moonAnchors = phaseIndexes();
const moon = simulate(candles, makeHooks(moonAnchors), MONTHLY);

function report(label: string, r: PortfolioResult) {
  console.log(`\n  ${label}`);
  console.log(
    `    ${r.multiple.toFixed(2)}x  →  ${usd(r.finalValue)} sobre ${usd(r.deposited)} aportados`,
  );
  console.log(
    `    ${r.tradeCount} operações · ${r.liquidations} liquidações · ${pct(r.idleShare)} do tempo em caixa`,
  );
  console.log(`    queda máxima da carteira: ${pct(r.maxDrawdown)}`);

  const wins = r.trades.filter((t) => t.profit > 0).length;
  const stops = r.trades.filter((t) => t.reason === "stop").length;
  const runners = r.trades.filter((t) => t.rungsHit > 1).length;
  console.log(
    `    ${wins} terminaram no lucro · ${stops} saíram no stop · ${runners} passaram do primeiro alvo`,
  );
  console.log(
    `      (um stop pode dar lucro: sai em ${pct(ladder.breakevenPct)} depois de realizar ${pct(ladder.firstTakeFraction)})`,
  );
}

console.log(`\n${"─".repeat(96)}`);
console.log(`2. QUEDA DE ${pct(RED_CANDLE)} NA JANELA DA LUA CHEIA, ${LEVERAGE}x ALAVANCADO`);
console.log("─".repeat(96));
console.log(`
  Ordem parada ${pct(RED_CANDLE)} abaixo do fechamento anterior, ativa de ${WINDOW_BEFORE} dias antes
  até o dia da lua cheia. Sai até ${WINDOW_AFTER} dias depois. Stop ${pct(ladder.stopPct)}, primeiro alvo
  ${pct(ladder.firstTargetPct)} realizando ${pct(ladder.firstTakeFraction)} e movendo o stop para ${pct(ladder.breakevenPct)}; o resto sobe em
  degraus de ${pct(ladder.rungPct)}. Percentuais já contando a alavancagem.`);
report("com a lua cheia", moon);

// ------------------------------------------- 3. a mesma regra em datas falsas
const rng = makeRandom(777);
const randomRuns: number[] = [];
for (let t = 0; t < 200; t++) {
  const fake: number[] = [];
  for (let i = 0; i < moonAnchors.length; i++) {
    fake.push(
      WINDOW_BEFORE + Math.floor(rng() * (candles.length - WINDOW_BEFORE - WINDOW_AFTER - 1)),
    );
  }
  fake.sort((a, b) => a - b);
  randomRuns.push(simulate(candles, makeHooks(fake), MONTHLY).multiple);
}
randomRuns.sort((a, b) => a - b);
const beaten = randomRuns.filter((v) => v < moon.multiple).length / randomRuns.length;

console.log(`\n${"─".repeat(96)}`);
console.log("3. A MESMA REGRA, ANCORADA EM DATAS SORTEADAS");
console.log("─".repeat(96));
console.log(`\n  200 calendários falsos, mesma quantidade de janelas:`);
console.log(`    mediana : ${randomRuns[Math.floor(randomRuns.length / 2)].toFixed(2)}x`);
console.log(
  `    faixa   : ${randomRuns[Math.floor(randomRuns.length * 0.05)].toFixed(2)}x a ${randomRuns[Math.floor(randomRuns.length * 0.95)].toFixed(2)}x`,
);
console.log(`    a lua ficou no percentil ${pct(beaten)}`);

// ------------------------------------------------------------- 4. o ciclo
console.log(`\n${"─".repeat(96)}`);
console.log("4. COMPRAR 364 DIAS APÓS O TOPO DO CICLO, 3x, VENDER 1060 DIAS DEPOIS");
console.log("─".repeat(96));

const TOPS = ["2013-12-04", "2017-12-17", "2021-11-10", "2025-10-06"];
const findIndex = (series: Candle[], iso: string) => {
  const target = Date.parse(`${iso}T00:00:00Z`) / 1000;
  return series.findIndex((c) => c.time >= target);
};

console.log("\n    topo         compra       preço      venda        preço    resultado 3x");
let cycleEquity = 1;
let cycleTrades = 0;

for (const top of TOPS) {
  const topIdx = findIndex(all, top);
  if (topIdx < 0) continue;
  const buyIdx = findIndex(all, new Date(Date.parse(`${top}T00:00:00Z`) + 364 * 86400000).toISOString().slice(0, 10));
  if (buyIdx < 0) {
    console.log(`    ${top}   compra em ${new Date(Date.parse(`${top}T00:00:00Z`) + 364 * 86400000).toISOString().slice(0, 10)} — ainda no futuro`);
    continue;
  }
  const sellTime = all[buyIdx].time + 1060 * 86400;
  const sellIdx = all.findIndex((c) => c.time >= sellTime);
  if (sellIdx < 0) {
    console.log(`    ${top}   compra ${new Date(all[buyIdx].time * 1000).toISOString().slice(0, 10)} — venda ainda no futuro`);
    continue;
  }

  const entry = all[buyIdx].close;
  const exit = all[sellIdx].close;

  // Sem stop, 3x é liquidado se o preço cair 1/3 abaixo da entrada.
  let liquidated = false;
  let lowest = Infinity;
  for (let i = buyIdx; i <= sellIdx; i++) {
    if (all[i].low < lowest) lowest = all[i].low;
    if (all[i].low <= entry * (1 - 1 / 3)) {
      liquidated = true;
      break;
    }
  }

  const gross = liquidated ? -1 : (exit / entry - 1) * 3;
  cycleEquity *= 1 + gross;
  cycleTrades++;

  console.log(
    `    ${top}   ${new Date(all[buyIdx].time * 1000).toISOString().slice(0, 10)}  ${usd(entry).padStart(9)}   ${new Date(all[sellIdx].time * 1000).toISOString().slice(0, 10)}  ${usd(exit).padStart(9)}   ${liquidated ? "LIQUIDADO" : `${gross >= 0 ? "+" : ""}${(gross * 100).toFixed(0)}%`}`,
  );
  console.log(`      queda máxima no caminho: ${pct(lowest / entry - 1)}`);
}

console.log(`
    Compondo os ${cycleTrades} ciclos em sequência: ${cycleEquity.toFixed(2)}x — a liquidação de 2014
    zera o capital e nada do que vem depois recupera. Sem ela, os dois ciclos
    seguintes teriam multiplicado por ${(59.98 * 21.14).toFixed(0)}x.

    É aqui que "sem stop loss" cobra o preço: 3x liquida com 33% de queda, e o
    ciclo de 2014-2015 teve 42,5%. A regra não sobrevive à própria premissa.`);

// ------------------------------------------------------------------ resumo
console.log(`\n${"=".repeat(96)}`);
console.log("RESUMO");
console.log("=".repeat(96));
console.log(`\n  aportando ${usd(MONTHLY)} por mês, ${usd(deposited)} no total:\n`);
console.log(`    aporte sorteado, à vista     ${dcaMedian.toFixed(2)}x   ${usd(dcaMedian * deposited)}`);
console.log(`    janela da lua, ${LEVERAGE}x           ${moon.multiple.toFixed(2)}x   ${usd(moon.finalValue)}`);
console.log(
  `    mesma regra, datas sorteadas ${randomRuns[Math.floor(randomRuns.length / 2)].toFixed(2)}x   (mediana de 200)`,
);
console.log(`
  A estratégia de ciclo não entra nesta conta porque não é um aporte mensal:
  ela concentra tudo em uma única entrada a cada quatro anos.
`);
