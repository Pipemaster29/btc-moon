import { getCandles } from "./bitstamp";

export interface BitcoinAnalysis {
  currentPrice: number;
  /** Fechamento do dia anterior, base da variação diária mostrada ao vivo. */
  previousClose: number;
  sma7: number;
  sma30: number;
  ema12: number;
  volatility: number;
  rsi14: number;
}

export function simpleMovingAverage(prices: number[], window: number): number {
  const slice = prices.slice(-window);
  return slice.reduce((sum, p) => sum + p, 0) / slice.length;
}

export function exponentialMovingAverage(prices: number[], window: number): number {
  const k = 2 / (window + 1);
  // Semente com a média simples do período inicial, depois suavização recursiva.
  const seedLength = Math.min(window, prices.length);
  let ema = simpleMovingAverage(prices.slice(0, seedLength), seedLength);

  for (const price of prices.slice(seedLength)) {
    ema = price * k + ema * (1 - k);
  }

  return ema;
}

/** Desvio padrão dos retornos logarítmicos, anualizado e em pontos percentuais. */
export function volatility(prices: number[]): number {
  const returns = prices.slice(1).map((p, i) => Math.log(p / prices[i]));
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(365) * 100;
}

/** RSI de Wilder, com suavização exponencial dos ganhos e perdas. */
export function relativeStrengthIndex(prices: number[], window = 14): number {
  if (prices.length < window + 1) return 50;

  const changes = prices.slice(1).map((p, i) => p - prices[i]);
  const initial = changes.slice(0, window);

  let avgGain =
    initial.filter((c) => c > 0).reduce((s, c) => s + c, 0) / window;
  let avgLoss =
    initial.filter((c) => c < 0).reduce((s, c) => s + Math.abs(c), 0) / window;

  for (const change of changes.slice(window)) {
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;
    avgGain = (avgGain * (window - 1) + gain) / window;
    avgLoss = (avgLoss * (window - 1) + loss) / window;
  }

  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}

export async function getBitcoinAnalysis(): Promise<BitcoinAnalysis> {
  const candles = await getCandles("1d");
  const closes = candles.map((c) => c.close);
  // A volatilidade usa só o último ano; a série inteira desde 2011 diluiria
  // o regime atual no de anos muito mais voláteis.
  const recentCloses = closes.slice(-365);

  return {
    currentPrice: closes[closes.length - 1],
    previousClose: closes[closes.length - 2] ?? closes[closes.length - 1],
    sma7: simpleMovingAverage(closes, 7),
    sma30: simpleMovingAverage(closes, 30),
    ema12: exponentialMovingAverage(closes, 12),
    volatility: volatility(recentCloses),
    rsi14: relativeStrengthIndex(closes, 14),
  };
}
