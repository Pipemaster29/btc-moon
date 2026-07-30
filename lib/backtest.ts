/**
 * Backtest de estratégias ancoradas nas fases da lua.
 *
 * O ponto delicado aqui não é calcular retorno, é não se enganar com ele. O
 * Bitcoin multiplicou por milhares desde 2011, então praticamente qualquer
 * regra que fique comprada parte do tempo mostra lucro. Por isso todo
 * resultado é comparado contra duas referências:
 *
 *  - comprar e segurar no mesmo período;
 *  - o mesmo número de operações, com a mesma duração e o mesmo stop, mas com
 *    datas de entrada sorteadas (a hipótese nula: a lua não informa nada).
 */

import type { Candle } from "./bitstamp";
import type { MoonPhase, MoonPhaseName } from "./moon";

const DAY = 86400;

/** Duração média do mês sinódico, em dias. */
export const SYNODIC_MONTH = 29.530588861;

export interface StrategyParams {
  /** Fase que dispara a entrada. */
  phase: MoonPhaseName;
  /** Dias de deslocamento em relação à fase; negativo antecipa a compra. */
  entryOffsetDays: number;
  /** Dias de permanência na posição. */
  holdingDays: number;
  /** Stop loss em fração do preço de entrada; 0 desliga. */
  stopLossPct: number;
}

export interface Trade {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  /** Retorno fracionário da operação. */
  return: number;
  stopped: boolean;
}

export interface BacktestResult {
  trades: Trade[];
  /** Capital final partindo de 1. */
  finalEquity: number;
  totalReturn: number;
  cagr: number;
  meanTradeReturn: number;
  medianTradeReturn: number;
  winRate: number;
  maxDrawdown: number;
  /** Sharpe anualizado dos retornos diários da estratégia. */
  sharpe: number;
  tradeCount: number;
  /** Fração do período com posição aberta. */
  timeInMarket: number;
}

/** Índice auxiliar: número do dia (UTC) → posição no vetor de candles. */
function buildDayIndex(candles: Candle[]): Map<number, number> {
  const index = new Map<number, number>();
  candles.forEach((candle, i) => {
    index.set(Math.floor(candle.time / DAY), i);
  });
  return index;
}

/**
 * Primeiro candle em ou após o dia pedido. Cobre buracos na série sem
 * "pular" a operação inteira quando falta um dia isolado.
 */
function findCandleAtOrAfter(
  candles: Candle[],
  dayIndex: Map<number, number>,
  day: number,
  maxLookahead = 5,
): number | null {
  for (let d = day; d <= day + maxLookahead; d++) {
    const i = dayIndex.get(d);
    if (i !== undefined) return i;
  }
  return null;
}

/**
 * Simula uma operação: entra no fechamento do candle `entryIdx` e sai após
 * `holdingDays`, ou antes se o stop for tocado.
 *
 * O stop é avaliado contra a mínima do candle e assume execução no preço
 * exato do stop. Em um gap de abertura abaixo dele a saída real seria pior,
 * então esta é a hipótese otimista — vale lembrar disso ao ler os números.
 */
function simulateTrade(
  candles: Candle[],
  entryIdx: number,
  params: StrategyParams,
): Trade | null {
  const entry = candles[entryIdx];
  if (!entry) return null;

  const entryPrice = entry.close;
  const stopPrice =
    params.stopLossPct > 0 ? entryPrice * (1 - params.stopLossPct) : 0;

  const lastIdx = Math.min(entryIdx + params.holdingDays, candles.length - 1);
  if (lastIdx <= entryIdx) return null;

  for (let i = entryIdx + 1; i <= lastIdx; i++) {
    const candle = candles[i];

    if (stopPrice > 0 && candle.low <= stopPrice) {
      return {
        entryTime: entry.time,
        exitTime: candle.time,
        entryPrice,
        exitPrice: stopPrice,
        return: stopPrice / entryPrice - 1,
        stopped: true,
      };
    }
  }

  const exit = candles[lastIdx];
  return {
    entryTime: entry.time,
    exitTime: exit.time,
    entryPrice,
    exitPrice: exit.close,
    return: exit.close / entryPrice - 1,
    stopped: false,
  };
}

/**
 * Curva de capital diária. Marcar a posição todo dia — e não só na saída — é
 * o que permite medir drawdown de verdade, incluindo o que acontece no meio
 * de uma operação.
 */
function equityCurve(candles: Candle[], trades: Trade[]): number[] {
  const dayIndex = buildDayIndex(candles);
  const curve = new Array<number>(candles.length).fill(1);
  let equity = 1;
  let cursor = 0;

  for (const trade of trades) {
    const entryIdx = dayIndex.get(Math.floor(trade.entryTime / DAY));
    const exitIdx = dayIndex.get(Math.floor(trade.exitTime / DAY));
    if (entryIdx === undefined || exitIdx === undefined) continue;

    // Fora de posição o capital fica parado.
    for (let i = cursor; i <= entryIdx && i < curve.length; i++) {
      curve[i] = equity;
    }

    for (let i = entryIdx + 1; i <= exitIdx; i++) {
      const price = i === exitIdx ? trade.exitPrice : candles[i].close;
      curve[i] = equity * (price / trade.entryPrice);
    }

    equity *= 1 + trade.return;
    cursor = exitIdx + 1;
  }

  for (let i = cursor; i < curve.length; i++) curve[i] = equity;
  return curve;
}

function maxDrawdown(curve: number[]): number {
  let peak = curve[0] ?? 1;
  let worst = 0;

  for (const value of curve) {
    if (value > peak) peak = value;
    const drawdown = value / peak - 1;
    if (drawdown < worst) worst = drawdown;
  }

  return worst;
}

function sharpeRatio(curve: number[]): number {
  const returns: number[] = [];
  for (let i = 1; i < curve.length; i++) {
    if (curve[i - 1] > 0) returns.push(curve[i] / curve[i - 1] - 1);
  }
  if (returns.length < 2) return 0;

  const mean = returns.reduce((s, r) => s + r, 0) / returns.length;
  const variance =
    returns.reduce((s, r) => s + (r - mean) ** 2, 0) / returns.length;
  const sd = Math.sqrt(variance);

  return sd === 0 ? 0 : (mean / sd) * Math.sqrt(365);
}

function summarize(candles: Candle[], trades: Trade[]): BacktestResult {
  const curve = equityCurve(candles, trades);
  const finalEquity = curve[curve.length - 1] ?? 1;

  const returns = trades.map((t) => t.return).sort((a, b) => a - b);
  const median =
    returns.length === 0
      ? 0
      : returns.length % 2 === 1
        ? returns[(returns.length - 1) / 2]
        : (returns[returns.length / 2 - 1] + returns[returns.length / 2]) / 2;

  const daysHeld = trades.reduce(
    (sum, t) => sum + (t.exitTime - t.entryTime) / DAY,
    0,
  );
  const spanDays =
    candles.length > 1
      ? (candles[candles.length - 1].time - candles[0].time) / DAY
      : 1;
  const years = spanDays / 365.25;

  return {
    trades,
    finalEquity,
    totalReturn: finalEquity - 1,
    cagr: years > 0 && finalEquity > 0 ? finalEquity ** (1 / years) - 1 : 0,
    meanTradeReturn:
      trades.length === 0
        ? 0
        : trades.reduce((s, t) => s + t.return, 0) / trades.length,
    medianTradeReturn: median,
    winRate:
      trades.length === 0
        ? 0
        : trades.filter((t) => t.return > 0).length / trades.length,
    maxDrawdown: maxDrawdown(curve),
    sharpe: sharpeRatio(curve),
    tradeCount: trades.length,
    timeInMarket: spanDays > 0 ? daysHeld / spanDays : 0,
  };
}

/** Backtest da estratégia lunar. */
export function runBacktest(
  candles: Candle[],
  phases: MoonPhase[],
  params: StrategyParams,
): BacktestResult {
  const dayIndex = buildDayIndex(candles);
  const trades: Trade[] = [];
  let lastExitTime = 0;

  for (const phase of phases) {
    if (phase.phase !== params.phase) continue;

    const targetDay =
      Math.floor(phase.date.getTime() / 1000 / DAY) + params.entryOffsetDays;
    const entryIdx = findCandleAtOrAfter(candles, dayIndex, targetDay);
    if (entryIdx === null) continue;

    // Uma posição por vez: janelas longas podem alcançar a fase seguinte.
    if (candles[entryIdx].time < lastExitTime) continue;

    const trade = simulateTrade(candles, entryIdx, params);
    if (!trade) continue;

    trades.push(trade);
    lastExitTime = trade.exitTime;
  }

  return summarize(candles, trades);
}

/** Comprar no primeiro candle e segurar até o último. */
export function buyAndHold(candles: Candle[]): BacktestResult {
  if (candles.length < 2) return summarize(candles, []);

  const first = candles[0];
  const last = candles[candles.length - 1];

  return summarize(candles, [
    {
      entryTime: first.time,
      exitTime: last.time,
      entryPrice: first.close,
      exitPrice: last.close,
      return: last.close / first.close - 1,
      stopped: false,
    },
  ]);
}

/**
 * Retorno médio do Bitcoin por dia do ciclo lunar.
 *
 * Cada candle é rotulado com a idade da lua (0 = lua nova) e agrupado em 30
 * caixas. Se a lua não tiver relação com o preço, todas as caixas devem
 * flutuar em torno da média geral.
 */
export interface LunarDayStat {
  lunarDay: number;
  meanReturn: number;
  medianReturn: number;
  sampleSize: number;
  positiveRate: number;
}

export function returnsByLunarDay(
  candles: Candle[],
  phases: MoonPhase[],
): LunarDayStat[] {
  const newMoons = phases
    .filter((p) => p.phase === "new")
    .map((p) => p.date.getTime() / 1000)
    .sort((a, b) => a - b);

  if (newMoons.length === 0) return [];

  const buckets: number[][] = Array.from({ length: 30 }, () => []);
  let moonCursor = 0;

  for (let i = 1; i < candles.length; i++) {
    const time = candles[i].time;

    while (
      moonCursor + 1 < newMoons.length &&
      newMoons[moonCursor + 1] <= time
    ) {
      moonCursor++;
    }
    if (newMoons[moonCursor] > time) continue;

    const age = (time - newMoons[moonCursor]) / DAY;
    if (age >= SYNODIC_MONTH) continue;

    const dailyReturn = candles[i].close / candles[i - 1].close - 1;
    buckets[Math.floor(age)].push(dailyReturn);
  }

  return buckets.map((values, lunarDay) => {
    if (values.length === 0) {
      return {
        lunarDay,
        meanReturn: 0,
        medianReturn: 0,
        sampleSize: 0,
        positiveRate: 0,
      };
    }

    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    return {
      lunarDay,
      meanReturn: values.reduce((s, v) => s + v, 0) / values.length,
      medianReturn:
        sorted.length % 2 === 1
          ? sorted[mid]
          : (sorted[mid - 1] + sorted[mid]) / 2,
      sampleSize: values.length,
      positiveRate: values.filter((v) => v > 0).length / values.length,
    };
  });
}

/** Gerador determinístico, para os resultados serem reproduzíveis. */
export function makeRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0x100000000;
  };
}

export interface MonteCarloResult {
  /** Retorno total de cada simulação com entradas sorteadas. */
  samples: number[];
  /** Fração das simulações que a estratégia lunar superou. */
  percentile: number;
  /** Proporção de sorteios que igualaram ou bateram a lua — o p-valor. */
  pValue: number;
  meanSample: number;
  medianSample: number;
  p05: number;
  p95: number;
}

/**
 * Hipótese nula: as mesmas operações, sorteando as datas de entrada.
 *
 * Isto controla exatamente o que a comparação com buy-and-hold não controla —
 * número de operações, duração e tempo exposto ao mercado são idênticos. O que
 * sobra de diferença é atribuível ao momento da entrada, que é justamente o
 * que a estratégia afirma saber escolher.
 */
export function monteCarloNull(
  candles: Candle[],
  params: StrategyParams,
  tradeCount: number,
  trials: number,
  seed = 12345,
): MonteCarloResult {
  const random = makeRandom(seed);
  const samples: number[] = [];
  const latestEntry = candles.length - params.holdingDays - 1;

  for (let trial = 0; trial < trials; trial++) {
    const entries: number[] = [];
    for (let t = 0; t < tradeCount; t++) {
      entries.push(Math.floor(random() * latestEntry));
    }
    entries.sort((a, b) => a - b);

    let equity = 1;
    let lastExitIdx = -1;

    for (const entryIdx of entries) {
      if (entryIdx <= lastExitIdx) continue;
      const trade = simulateTrade(candles, entryIdx, params);
      if (!trade) continue;
      equity *= 1 + trade.return;
      lastExitIdx = entryIdx + params.holdingDays;
    }

    samples.push(equity - 1);
  }

  samples.sort((a, b) => a - b);
  return {
    samples,
    percentile: 0,
    pValue: 1,
    meanSample: samples.reduce((s, v) => s + v, 0) / samples.length,
    medianSample: samples[Math.floor(samples.length / 2)],
    p05: samples[Math.floor(samples.length * 0.05)],
    p95: samples[Math.floor(samples.length * 0.95)],
  };
}

/** Posição de um valor dentro da distribuição nula. */
export function locateInNull(
  strategyReturn: number,
  mc: MonteCarloResult,
): MonteCarloResult {
  const beaten = mc.samples.filter((s) => s < strategyReturn).length;
  const atLeastAsGood = mc.samples.filter((s) => s >= strategyReturn).length;

  return {
    ...mc,
    percentile: beaten / mc.samples.length,
    pValue: (atLeastAsGood + 1) / (mc.samples.length + 1),
  };
}

export interface GridResult {
  params: StrategyParams;
  result: BacktestResult;
}

export interface Grid {
  phases: MoonPhaseName[];
  entryOffsets: number[];
  holdingDays: number[];
  stopLosses: number[];
}

/** Varre o espaço de parâmetros e devolve tudo ordenado por retorno. */
export function gridSearch(
  candles: Candle[],
  phases: MoonPhase[],
  grid: Grid,
): GridResult[] {
  const results: GridResult[] = [];

  for (const phase of grid.phases) {
    for (const entryOffsetDays of grid.entryOffsets) {
      for (const holdingDays of grid.holdingDays) {
        for (const stopLossPct of grid.stopLosses) {
          const params = { phase, entryOffsetDays, holdingDays, stopLossPct };
          results.push({ params, result: runBacktest(candles, phases, params) });
        }
      }
    }
  }

  return results.sort((a, b) => b.result.totalReturn - a.result.totalReturn);
}

/**
 * Versão enxuta da varredura: devolve só o melhor retorno.
 *
 * Existe porque o teste de significância roda a varredura inteira centenas de
 * vezes, e montar o relatório completo de cada combinação dominaria o custo.
 */
function bestGridReturn(
  candles: Candle[],
  dayIndex: Map<number, number>,
  phases: MoonPhase[],
  grid: Grid,
): number {
  let best = -Infinity;

  for (const phase of grid.phases) {
    const phaseDates = phases
      .filter((p) => p.phase === phase)
      .map((p) => Math.floor(p.date.getTime() / 1000 / DAY));

    for (const entryOffsetDays of grid.entryOffsets) {
      for (const holdingDays of grid.holdingDays) {
        for (const stopLossPct of grid.stopLosses) {
          const params = { phase, entryOffsetDays, holdingDays, stopLossPct };
          let equity = 1;
          let lastExitTime = 0;

          for (const phaseDay of phaseDates) {
            const entryIdx = findCandleAtOrAfter(
              candles,
              dayIndex,
              phaseDay + entryOffsetDays,
            );
            if (entryIdx === null) continue;
            if (candles[entryIdx].time < lastExitTime) continue;

            const trade = simulateTrade(candles, entryIdx, params);
            if (!trade) continue;

            equity *= 1 + trade.return;
            lastExitTime = trade.exitTime;
          }

          if (equity - 1 > best) best = equity - 1;
        }
      }
    }
  }

  return best;
}

/** Desloca o calendário lunar inteiro, preservando suas irregularidades. */
export function shiftPhases(phases: MoonPhase[], shiftDays: number): MoonPhase[] {
  return phases.map((p) => ({
    phase: p.phase,
    date: new Date(p.date.getTime() + shiftDays * DAY * 1000),
  }));
}

export interface DeflatedTest {
  /** Melhor retorno da varredura no calendário lunar verdadeiro. */
  actualBest: number;
  /** Melhor retorno da varredura em cada calendário deslocado. */
  nullBests: number[];
  /** Fração dos calendários falsos que o verdadeiro superou. */
  percentile: number;
  pValue: number;
  medianNull: number;
  maxNull: number;
}

/**
 * Teste de significância corrigido para a busca de parâmetros.
 *
 * Comparar a campeã de 5.760 combinações contra uma única entrada aleatória
 * seria trapaça: o vencedor de uma busca grande parece extraordinário mesmo
 * quando não há sinal nenhum. O teste correto repete a busca inteira sobre
 * calendários lunares deslocados no tempo e pergunta se o calendário
 * verdadeiro produz um campeão melhor do que um calendário qualquer produz.
 */
export function deflatedSignificanceTest(
  candles: Candle[],
  realPhases: MoonPhase[],
  grid: Grid,
  trials: number,
  seed = 987654,
): DeflatedTest {
  const dayIndex = buildDayIndex(candles);
  const random = makeRandom(seed);

  const actualBest = bestGridReturn(candles, dayIndex, realPhases, grid);
  const nullBests: number[] = [];

  for (let trial = 0; trial < trials; trial++) {
    // Deslocamento uniforme dentro do mês sinódico: qualquer alinhamento é
    // possível, inclusive os que quase recuperam o calendário real.
    const shift = random() * SYNODIC_MONTH;
    const shifted = shiftPhases(realPhases, shift);
    nullBests.push(bestGridReturn(candles, dayIndex, shifted, grid));
  }

  nullBests.sort((a, b) => a - b);
  const beaten = nullBests.filter((v) => v < actualBest).length;
  const atLeastAsGood = nullBests.filter((v) => v >= actualBest).length;

  return {
    actualBest,
    nullBests,
    percentile: beaten / nullBests.length,
    pValue: (atLeastAsGood + 1) / (nullBests.length + 1),
    medianNull: nullBests[Math.floor(nullBests.length / 2)],
    maxNull: nullBests[nullBests.length - 1],
  };
}
