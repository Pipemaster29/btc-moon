/**
 * Entrada na mecha: comprar a queda intradiária, não o fechamento.
 *
 * A ideia é a de quem observa o mercado esperando o dia de liquidação — aquele
 * candle de pavio longo em que o preço afunda e volta. A ordem fica parada no
 * book a uma distância da máxima corrente da janela e executa quando a mínima
 * do dia a alcança. Nada aqui olha o fechamento para decidir entrar, e nada
 * olha para frente: uma ordem em repouso teria sido executada de qualquer jeito.
 *
 * A saída segue a mesma lógica — uma ordem limitada de venda executa na máxima
 * de algum dia seguinte. Só a saída por prazo usa o fechamento, porque aí não
 * há ordem esperando, é uma decisão de encerrar.
 */

import type { Candle } from "./bitstamp";
import type { MoonPhase, MoonPhaseName } from "./moon";
import type { Direction } from "./backtest";

const DAY = 86400;

export interface WickParams {
  phase: MoonPhaseName;
  /** Dias antes da fase em que a observação começa. */
  lookbackDays: number;
  /**
   * Distância da ordem até o extremo corrente da janela. Comprado, é o quanto
   * o preço precisa cair abaixo da máxima; vendido, o quanto precisa subir
   * acima da mínima.
   */
  dipPct: number;
  /** Movimento a favor, sobre o preço de entrada, que dispara a saída. */
  targetPct: number;
  /** Stop loss contra a posição; 0 desliga. */
  stopPct: number;
  /** Dias após a fase em que a posição é encerrada, se ainda estiver aberta. */
  exitAfterPhaseDays: number;
  /** Entra a mercado no dia da fase quando a ordem não executa. */
  fallback: boolean;
  /** Direção da aposta. Ausente equivale a comprada. */
  direction?: Direction;
}

export type ExitReason = "target" | "stop" | "deadline";

export interface WickTrade {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  return: number;
  /** Verdadeiro quando a ordem limitada executou; falso quando foi fallback. */
  onWick: boolean;
  exitReason: ExitReason;
  /** Dias entre a entrada e a fase; negativo = entrou antes. */
  entryOffset: number;
}

export interface WickResult {
  trades: WickTrade[];
  totalReturn: number;
  cagr: number;
  winRate: number;
  maxDrawdown: number;
  tradeCount: number;
  wickEntries: number;
  fallbackEntries: number;
  missedWindows: number;
  meanReturnOnWick: number;
  meanReturnOnFallback: number;
  exits: Record<ExitReason, number>;
}

function buildDayIndex(candles: Candle[]): Map<number, number> {
  const index = new Map<number, number>();
  candles.forEach((c, i) => index.set(Math.floor(c.time / DAY), i));
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

// ------------------------------------------------------------ caracterização

export interface IntradayDayStat {
  offset: number;
  /** Amplitude do dia (máxima − mínima) sobre o fechamento anterior. */
  meanRange: number;
  /** Quanto a mínima furou abaixo do fechamento anterior. */
  meanDownWick: number;
  /** Quanto a máxima passou acima do fechamento anterior. */
  meanUpWick: number;
  /** Proporção de dias com amplitude acima de 5%. */
  volatileRate: number;
  /** Maior amplitude observada nesse deslocamento. */
  maxRange: number;
  sampleSize: number;
}

export interface WickProfile {
  byDay: IntradayDayStat[];
  /**
   * Queda máxima da janela medida contra a máxima corrente. Como são valores
   * negativos, `deep` é o décimo percentil da ordenação — as quedas mais
   * profundas, e não as mais rasas.
   */
  dipQuantiles: {
    p25: number;
    median: number;
    mean: number;
    p75: number;
    deep: number;
  };
  /** Alta máxima após a fase, medida contra o fundo da janela. */
  riseQuantiles: { p25: number; median: number; mean: number; p75: number };
  /**
   * Espelho de `dipQuantiles` para a venda: alta máxima da janela contra a
   * mínima corrente. `deep` aqui é o percentil 90 — as altas mais violentas,
   * que são o risco de quem está vendido.
   */
  rallyQuantiles: {
    p25: number;
    median: number;
    mean: number;
    p75: number;
    deep: number;
  };
  /** Queda máxima após a fase, medida contra o topo da janela. */
  dropAfterQuantiles: { p25: number; median: number; mean: number; p75: number };
  eventCount: number;
}

function quantiles(values: number[]) {
  const v = [...values].sort((a, b) => a - b);
  const at = (q: number) => v[Math.min(Math.floor(v.length * q), v.length - 1)];
  return {
    p25: at(0.25),
    median: at(0.5),
    mean: v.reduce((s, x) => s + x, 0) / v.length,
    p75: at(0.75),
    // Extremo inferior da distribuição: para quedas, as mais profundas.
    deep: at(0.1),
  };
}

/**
 * Descreve a janela usando só máximas e mínimas.
 *
 * A queda é medida contra a máxima corrente da janela — e não contra um preço
 * fixo do primeiro dia — porque é assim que a oportunidade aparece para quem
 * está observando: o preço faz um topo e depois afunda a partir dele.
 */
export function profileWicks(
  candles: Candle[],
  phases: MoonPhase[],
  phase: MoonPhaseName,
  lookbackDays: number,
  forwardDays: number,
): WickProfile {
  const dayIndex = buildDayIndex(candles);
  const offsets = Array.from({ length: lookbackDays + 1 }, (_, i) => i - lookbackDays);
  const buckets = new Map<number, Candle[]>(offsets.map((o) => [o, []]));
  const prevCloses = new Map<number, number[]>(offsets.map((o) => [o, []]));

  const dips: number[] = [];
  const rises: number[] = [];
  const rallies: number[] = [];
  const dropsAfter: number[] = [];
  let events = 0;

  for (const p of phases) {
    if (p.phase !== phase) continue;

    const phaseDay = Math.floor(p.date.getTime() / 1000 / DAY);
    const phaseIdx = findAtOrAfter(dayIndex, phaseDay);
    if (phaseIdx === null) continue;
    if (phaseIdx - lookbackDays < 1) continue;
    if (phaseIdx + forwardDays >= candles.length) continue;

    events++;

    for (const offset of offsets) {
      const i = phaseIdx + offset;
      if (i < 1) continue;
      buckets.get(offset)!.push(candles[i]);
      prevCloses.get(offset)!.push(candles[i - 1].close);
    }

    // Maior afundamento da janela contra a máxima corrente.
    let runningHigh = candles[phaseIdx - lookbackDays].high;
    let worst = 0;
    for (let i = phaseIdx - lookbackDays; i <= phaseIdx; i++) {
      const c = candles[i];
      if (c.high > runningHigh) runningHigh = c.high;
      const dip = c.low / runningHigh - 1;
      if (dip < worst) worst = dip;
    }
    dips.push(worst);

    // Maior alta depois da fase, contra o fundo da janela.
    let lowest = Infinity;
    for (let i = phaseIdx - lookbackDays; i <= phaseIdx; i++) {
      if (candles[i].low < lowest) lowest = candles[i].low;
    }
    let highest = -Infinity;
    for (let i = phaseIdx + 1; i <= phaseIdx + forwardDays; i++) {
      if (candles[i].high > highest) highest = candles[i].high;
    }
    if (Number.isFinite(lowest) && Number.isFinite(highest)) {
      rises.push(highest / lowest - 1);
    }

    // Espelho para a venda: maior alta da janela contra a mínima corrente.
    let runningLow = candles[phaseIdx - lookbackDays].low;
    let bestRally = 0;
    for (let i = phaseIdx - lookbackDays; i <= phaseIdx; i++) {
      const c = candles[i];
      if (c.low < runningLow) runningLow = c.low;
      const rally = c.high / runningLow - 1;
      if (rally > bestRally) bestRally = rally;
    }
    rallies.push(bestRally);

    // E a maior queda depois da fase, contra o topo da janela.
    let windowHigh = -Infinity;
    for (let i = phaseIdx - lookbackDays; i <= phaseIdx; i++) {
      if (candles[i].high > windowHigh) windowHigh = candles[i].high;
    }
    let lowestAfter = Infinity;
    for (let i = phaseIdx + 1; i <= phaseIdx + forwardDays; i++) {
      if (candles[i].low < lowestAfter) lowestAfter = candles[i].low;
    }
    if (Number.isFinite(windowHigh) && Number.isFinite(lowestAfter)) {
      dropsAfter.push(lowestAfter / windowHigh - 1);
    }
  }

  const byDay: IntradayDayStat[] = offsets.map((offset) => {
    const bars = buckets.get(offset)!;
    const bases = prevCloses.get(offset)!;
    if (bars.length === 0) {
      return {
        offset,
        meanRange: 0,
        meanDownWick: 0,
        meanUpWick: 0,
        volatileRate: 0,
        maxRange: 0,
        sampleSize: 0,
      };
    }

    const ranges = bars.map((c, i) => (c.high - c.low) / bases[i]);
    const downWicks = bars.map((c, i) => Math.min(c.low / bases[i] - 1, 0));
    const upWicks = bars.map((c, i) => Math.max(c.high / bases[i] - 1, 0));

    return {
      offset,
      meanRange: ranges.reduce((s, v) => s + v, 0) / ranges.length,
      meanDownWick: downWicks.reduce((s, v) => s + v, 0) / downWicks.length,
      meanUpWick: upWicks.reduce((s, v) => s + v, 0) / upWicks.length,
      volatileRate: ranges.filter((r) => r > 0.05).length / ranges.length,
      maxRange: Math.max(...ranges),
      sampleSize: bars.length,
    };
  });

  const rallyQ = quantiles(rallies);

  return {
    byDay,
    dipQuantiles: quantiles(dips),
    // Para altas, o extremo perigoso está no topo da distribuição.
    rallyQuantiles: {
      ...rallyQ,
      deep: [...rallies].sort((a, b) => a - b)[
        Math.min(Math.floor(rallies.length * 0.9), rallies.length - 1)
      ],
    },
    dropAfterQuantiles: quantiles(dropsAfter),
    riseQuantiles: quantiles(rises),
    eventCount: events,
  };
}

// ----------------------------------------------------------------- estratégia

/**
 * Roda a estratégia a partir de uma lista de índices-âncora.
 *
 * Receber as âncoras de fora é o que permite rodar exatamente o mesmo código
 * sobre datas sorteadas — sem isso não há como saber se a lua contribui.
 */
export function runWickStrategyAt(
  candles: Candle[],
  anchors: number[],
  params: WickParams,
): WickResult {
  const trades: WickTrade[] = [];
  let missed = 0;
  let lastExitIdx = -1;

  for (const phaseIdx of anchors) {
    const start = phaseIdx - params.lookbackDays;
    const deadline = Math.min(
      phaseIdx + params.exitAfterPhaseDays,
      candles.length - 1,
    );
    if (start < 1 || deadline <= phaseIdx) continue;
    if (start <= lastExitIdx) continue;

    const direction = params.direction ?? "long";

    // A ordem persegue o extremo corrente da janela: comprada, fica abaixo da
    // máxima e sobe junto com ela; vendida, fica acima da mínima e desce junto.
    let runningHigh = candles[start].high;
    let runningLow = candles[start].low;
    let entryIdx: number | null = null;
    let entryPrice = 0;
    let onWick = false;

    for (let i = start; i <= phaseIdx; i++) {
      const c = candles[i];

      if (direction === "long") {
        const limit = runningHigh * (1 - params.dipPct);
        if (c.low <= limit) {
          entryIdx = i;
          entryPrice = limit;
          onWick = true;
          break;
        }
      } else {
        const limit = runningLow * (1 + params.dipPct);
        if (c.high >= limit) {
          entryIdx = i;
          entryPrice = limit;
          onWick = true;
          break;
        }
      }

      if (c.high > runningHigh) runningHigh = c.high;
      if (c.low < runningLow) runningLow = c.low;
    }

    if (entryIdx === null) {
      if (!params.fallback) {
        missed++;
        continue;
      }
      entryIdx = phaseIdx;
      entryPrice = candles[phaseIdx].close;
      onWick = false;
    }

    // Alvo e stop trocam de lado conforme a direção.
    const target =
      direction === "long"
        ? entryPrice * (1 + params.targetPct)
        : entryPrice * (1 - params.targetPct);
    const stop =
      params.stopPct > 0
        ? direction === "long"
          ? entryPrice * (1 - params.stopPct)
          : entryPrice * (1 + params.stopPct)
        : 0;

    let exitIdx = deadline;
    let exitPrice = candles[deadline].close;
    let exitReason: ExitReason = "deadline";

    // O stop já vale no próprio dia da entrada: num candle de liquidação a
    // mínima costuma vir depois do preenchimento, e ignorar isso deixaria o
    // resultado otimista justamente nos piores dias.
    for (let i = entryIdx; i <= deadline; i++) {
      const c = candles[i];

      const stopHit =
        stop > 0 && (direction === "long" ? c.low <= stop : c.high >= stop);
      if (stopHit) {
        exitIdx = i;
        exitPrice = stop;
        exitReason = "stop";
        break;
      }

      // O alvo só é avaliado a partir do dia seguinte: no dia da entrada não dá
      // para saber se o extremo a favor veio antes ou depois do que executou a
      // entrada, e supor que veio depois seria a leitura otimista.
      const targetHit =
        i > entryIdx &&
        (direction === "long" ? c.high >= target : c.low <= target);
      if (targetHit) {
        exitIdx = i;
        exitPrice = target;
        exitReason = "target";
        break;
      }
    }

    trades.push({
      entryTime: candles[entryIdx].time,
      exitTime: candles[exitIdx].time,
      entryPrice,
      exitPrice,
      return:
        direction === "long"
          ? exitPrice / entryPrice - 1
          : 1 - exitPrice / entryPrice,
      onWick,
      exitReason,
      entryOffset: entryIdx - phaseIdx,
    });
    lastExitIdx = exitIdx;
  }

  return summarize(candles, trades, missed);
}

function summarize(
  candles: Candle[],
  trades: WickTrade[],
  missed: number,
): WickResult {
  let equity = 1;
  const curve: number[] = [1];
  for (const t of trades) {
    equity *= Math.max(1 + t.return, 0);
    curve.push(equity);
  }

  let peak = 1;
  let worst = 0;
  for (const v of curve) {
    if (v > peak) peak = v;
    const dd = v / peak - 1;
    if (dd < worst) worst = dd;
  }

  const spanDays =
    candles.length > 1
      ? (candles[candles.length - 1].time - candles[0].time) / DAY
      : 1;
  const years = spanDays / 365.25;

  const onWick = trades.filter((t) => t.onWick);
  const onFallback = trades.filter((t) => !t.onWick);
  const mean = (v: WickTrade[]) =>
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
    tradeCount: trades.length,
    wickEntries: onWick.length,
    fallbackEntries: onFallback.length,
    missedWindows: missed,
    meanReturnOnWick: mean(onWick),
    meanReturnOnFallback: mean(onFallback),
    exits: {
      target: trades.filter((t) => t.exitReason === "target").length,
      stop: trades.filter((t) => t.exitReason === "stop").length,
      deadline: trades.filter((t) => t.exitReason === "deadline").length,
    },
  };
}

/** Índices dos candles correspondentes a cada ocorrência da fase. */
export function phaseIndexes(
  candles: Candle[],
  phases: MoonPhase[],
  phase: MoonPhaseName,
): number[] {
  const dayIndex = buildDayIndex(candles);
  const out: number[] = [];
  for (const p of phases) {
    if (p.phase !== phase) continue;
    const i = findAtOrAfter(dayIndex, Math.floor(p.date.getTime() / 1000 / DAY));
    if (i !== null) out.push(i);
  }
  return out;
}

export function runWickStrategy(
  candles: Candle[],
  phases: MoonPhase[],
  params: WickParams,
): WickResult {
  return runWickStrategyAt(
    candles,
    phaseIndexes(candles, phases, params.phase),
    params,
  );
}
