/**
 * Estratégia de janela: observar os dias que antecedem uma fase da lua,
 * comprar na queda se ela vier e no dia da fase se não vier.
 *
 * A diferença para a ordem limitada pura é o *fallback*: aqui todo sinal vira
 * operação. Sem isso, metade das comparações fica contaminada — uma regra que
 * só opera quando o mercado cai está escolhendo um subconjunto de períodos, e
 * não apenas um preço melhor.
 */

import type { Candle } from "./bitstamp";
import type { MoonPhase, MoonPhaseName } from "./moon";

const DAY = 86400;

/** Como a entrada aconteceu, para separar o efeito do preço do efeito da data. */
export type EntryKind = "dip" | "fallback";

export interface WindowTrade {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  return: number;
  entryKind: EntryKind;
  exitKind: "target" | "stop" | "time";
}

export interface WindowParams {
  phase: MoonPhaseName;
  /** Dias antes da fase em que a observação começa. */
  lookbackDays: number;
  /** Queda, em fração, que dispara a compra dentro da janela. */
  dipPct: number;
  /** Alta, em fração, que dispara a venda depois da entrada. */
  risePct: number;
  /** Prazo máximo da posição, contado da entrada. */
  maxHoldDays: number;
  /** Stop loss em fração do preço de entrada; 0 desliga. */
  stopLossPct: number;
}

export interface WindowResult {
  trades: WindowTrade[];
  totalReturn: number;
  cagr: number;
  winRate: number;
  maxDrawdown: number;
  meanTradeReturn: number;
  tradeCount: number;
  /** Quantas entradas vieram de uma queda de verdade. */
  dipEntries: number;
  /** Quantas caíram no fallback do dia da fase. */
  fallbackEntries: number;
  /** Retorno médio separado por tipo de entrada. */
  meanReturnOnDip: number;
  meanReturnOnFallback: number;
  targetExits: number;
  stopExits: number;
  timeExits: number;
}

function buildDayIndex(candles: Candle[]): Map<number, number> {
  const index = new Map<number, number>();
  candles.forEach((candle, i) => index.set(Math.floor(candle.time / DAY), i));
  return index;
}

function findAtOrAfter(
  dayIndex: Map<number, number>,
  day: number,
  lookahead = 5,
): number | null {
  for (let d = day; d <= day + lookahead; d++) {
    const i = dayIndex.get(d);
    if (i !== undefined) return i;
  }
  return null;
}

// ---------------------------------------------------------------- estatística

export interface DayStat {
  /** Deslocamento em dias em relação à fase; negativo é antes. */
  offset: number;
  /** Proporção de vezes em que o dia fechou em queda. */
  downRate: number;
  meanReturn: number;
  /** Movimento médio em módulo — a "volatilidade" típica do dia. */
  meanAbsReturn: number;
  sampleSize: number;
}

export interface WindowProfile {
  byDay: DayStat[];
  /** Quedas máximas dentro da janela, em relação ao preço de referência. */
  dipQuantiles: { p25: number; median: number; mean: number; p75: number };
  /** Altas máximas na janela posterior, em relação ao preço da fase. */
  riseQuantiles: { p25: number; median: number; mean: number; p75: number };
  /** Proporção das janelas em que houve alguma queda. */
  anyDipRate: number;
  eventCount: number;
}

function quantiles(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(Math.floor(sorted.length * q), sorted.length - 1)];
  return {
    p25: at(0.25),
    median: at(0.5),
    mean: sorted.reduce((s, v) => s + v, 0) / sorted.length,
    p75: at(0.75),
  };
}

/**
 * Descreve como o preço se comporta na janela ao redor da fase.
 *
 * `lookbackDays` dias antes servem de referência para a queda; `forwardDays`
 * dias depois, para a alta. As quedas são medidas contra o fechamento do
 * primeiro dia da janela, que é a informação disponível a quem começa a
 * observar ali.
 */
export function profileWindow(
  candles: Candle[],
  phases: MoonPhase[],
  phase: MoonPhaseName,
  lookbackDays: number,
  forwardDays: number,
): WindowProfile {
  const dayIndex = buildDayIndex(candles);
  const offsets = Array.from(
    { length: lookbackDays + forwardDays + 1 },
    (_, i) => i - lookbackDays,
  );
  const buckets = new Map<number, number[]>(offsets.map((o) => [o, []]));

  const dips: number[] = [];
  const rises: number[] = [];
  let withDip = 0;
  let events = 0;

  for (const p of phases) {
    if (p.phase !== phase) continue;

    const phaseDay = Math.floor(p.date.getTime() / 1000 / DAY);
    const startIdx = findAtOrAfter(dayIndex, phaseDay - lookbackDays);
    const phaseIdx = findAtOrAfter(dayIndex, phaseDay);
    if (startIdx === null || phaseIdx === null) continue;
    if (phaseIdx + forwardDays >= candles.length) continue;

    events++;

    for (const offset of offsets) {
      const i = findAtOrAfter(dayIndex, phaseDay + offset, 0);
      if (i === null || i === 0) continue;
      buckets.get(offset)!.push(candles[i].close / candles[i - 1].close - 1);
    }

    // Maior queda da janela, contra o fechamento do primeiro dia observado.
    const reference = candles[startIdx].close;
    let lowest = Infinity;
    for (let i = startIdx + 1; i <= phaseIdx; i++) {
      if (candles[i].low < lowest) lowest = candles[i].low;
    }
    if (Number.isFinite(lowest)) {
      const dip = lowest / reference - 1;
      dips.push(dip);
      if (dip < 0) withDip++;
    }

    // Maior alta da janela seguinte, contra o fechamento do dia da fase.
    const phasePrice = candles[phaseIdx].close;
    let highest = -Infinity;
    for (let i = phaseIdx + 1; i <= phaseIdx + forwardDays; i++) {
      if (candles[i].high > highest) highest = candles[i].high;
    }
    if (Number.isFinite(highest)) rises.push(highest / phasePrice - 1);
  }

  const byDay: DayStat[] = offsets.map((offset) => {
    const values = buckets.get(offset)!;
    if (values.length === 0) {
      return { offset, downRate: 0, meanReturn: 0, meanAbsReturn: 0, sampleSize: 0 };
    }
    return {
      offset,
      downRate: values.filter((v) => v < 0).length / values.length,
      meanReturn: values.reduce((s, v) => s + v, 0) / values.length,
      meanAbsReturn: values.reduce((s, v) => s + Math.abs(v), 0) / values.length,
      sampleSize: values.length,
    };
  });

  return {
    byDay,
    dipQuantiles: quantiles(dips),
    riseQuantiles: quantiles(rises),
    anyDipRate: dips.length === 0 ? 0 : withDip / dips.length,
    eventCount: events,
  };
}

// ----------------------------------------------------------------- estratégia

/**
 * Executa a estratégia a partir de uma lista de dias-âncora.
 *
 * Receber as âncoras de fora permite rodar exatamente a mesma lógica sobre
 * datas sorteadas, que é o único jeito de saber se a lua contribui com algo.
 */
export function runWindowStrategyAt(
  candles: Candle[],
  anchorIndexes: number[],
  params: WindowParams,
): WindowResult {
  const trades: WindowTrade[] = [];
  let lastExitIdx = -1;

  for (const anchorIdx of anchorIndexes) {
    const startIdx = anchorIdx - params.lookbackDays;
    if (startIdx <= 0 || anchorIdx >= candles.length) continue;
    if (startIdx <= lastExitIdx) continue;

    const reference = candles[startIdx].close;
    const limitPrice = reference * (1 - params.dipPct);

    let entryIdx: number | null = null;
    let entryPrice = 0;
    let entryKind: EntryKind = "fallback";

    for (let i = startIdx + 1; i <= anchorIdx; i++) {
      if (candles[i].low <= limitPrice) {
        entryIdx = i;
        entryPrice = limitPrice;
        entryKind = "dip";
        break;
      }
    }

    // A queda não veio: compra a mercado no dia da fase.
    if (entryIdx === null) {
      entryIdx = anchorIdx;
      entryPrice = candles[anchorIdx].close;
      entryKind = "fallback";
    }

    const targetPrice = entryPrice * (1 + params.risePct);
    const stopPrice =
      params.stopLossPct > 0 ? entryPrice * (1 - params.stopLossPct) : 0;
    const lastIdx = Math.min(entryIdx + params.maxHoldDays, candles.length - 1);
    if (lastIdx <= entryIdx) continue;

    let exitIdx = lastIdx;
    let exitPrice = candles[lastIdx].close;
    let exitKind: WindowTrade["exitKind"] = "time";

    for (let i = entryIdx + 1; i <= lastIdx; i++) {
      const candle = candles[i];

      // Stop antes do alvo: no candle diário não dá para saber a ordem, e esta
      // é a leitura pessimista.
      if (stopPrice > 0 && candle.low <= stopPrice) {
        exitIdx = i;
        exitPrice = stopPrice;
        exitKind = "stop";
        break;
      }
      if (params.risePct > 0 && candle.high >= targetPrice) {
        exitIdx = i;
        exitPrice = targetPrice;
        exitKind = "target";
        break;
      }
    }

    trades.push({
      entryTime: candles[entryIdx].time,
      exitTime: candles[exitIdx].time,
      entryPrice,
      exitPrice,
      return: exitPrice / entryPrice - 1,
      entryKind,
      exitKind,
    });
    lastExitIdx = exitIdx;
  }

  return summarize(candles, trades);
}

function summarize(candles: Candle[], trades: WindowTrade[]): WindowResult {
  let equity = 1;
  const curve: number[] = [];
  for (const t of trades) {
    equity *= 1 + t.return;
    curve.push(equity);
  }

  let peak = 1;
  let worst = 0;
  for (const value of [1, ...curve]) {
    if (value > peak) peak = value;
    const dd = value / peak - 1;
    if (dd < worst) worst = dd;
  }

  const spanDays =
    candles.length > 1
      ? (candles[candles.length - 1].time - candles[0].time) / DAY
      : 1;
  const years = spanDays / 365.25;

  const onDip = trades.filter((t) => t.entryKind === "dip");
  const onFallback = trades.filter((t) => t.entryKind === "fallback");
  const mean = (v: WindowTrade[]) =>
    v.length === 0 ? 0 : v.reduce((s, t) => s + t.return, 0) / v.length;

  return {
    trades,
    totalReturn: equity - 1,
    cagr: years > 0 && equity > 0 ? equity ** (1 / years) - 1 : 0,
    winRate:
      trades.length === 0
        ? 0
        : trades.filter((t) => t.return > 0).length / trades.length,
    maxDrawdown: worst,
    meanTradeReturn: mean(trades),
    tradeCount: trades.length,
    dipEntries: onDip.length,
    fallbackEntries: onFallback.length,
    meanReturnOnDip: mean(onDip),
    meanReturnOnFallback: mean(onFallback),
    targetExits: trades.filter((t) => t.exitKind === "target").length,
    stopExits: trades.filter((t) => t.exitKind === "stop").length,
    timeExits: trades.filter((t) => t.exitKind === "time").length,
  };
}

/** Índices dos candles correspondentes a cada ocorrência da fase. */
export function phaseAnchors(
  candles: Candle[],
  phases: MoonPhase[],
  phase: MoonPhaseName,
): number[] {
  const dayIndex = buildDayIndex(candles);
  const anchors: number[] = [];

  for (const p of phases) {
    if (p.phase !== phase) continue;
    const i = findAtOrAfter(dayIndex, Math.floor(p.date.getTime() / 1000 / DAY));
    if (i !== null) anchors.push(i);
  }

  return anchors;
}

export function runWindowStrategy(
  candles: Candle[],
  phases: MoonPhase[],
  params: WindowParams,
): WindowResult {
  return runWindowStrategyAt(
    candles,
    phaseAnchors(candles, phases, params.phase),
    params,
  );
}
