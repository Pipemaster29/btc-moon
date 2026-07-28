export interface PricePoint {
  timestamp: number;
  price: number;
}

export interface BitcoinAnalysis {
  prices: PricePoint[];
  currentPrice: number;
  sma7: number;
  sma30: number;
  ema12: number;
  volatility: number;
  rsi14: number;
}

const COINGECKO_MARKET_CHART_URL =
  "https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=90&interval=daily";

export async function fetchBitcoinPrices(): Promise<PricePoint[]> {
  const res = await fetch(COINGECKO_MARKET_CHART_URL, {
    next: { revalidate: 300 },
  });

  if (!res.ok) {
    throw new Error(`CoinGecko request failed: ${res.status}`);
  }

  const data: { prices: [number, number][] } = await res.json();
  return data.prices.map(([timestamp, price]) => ({ timestamp, price }));
}

export function simpleMovingAverage(prices: number[], window: number): number {
  const slice = prices.slice(-window);
  return slice.reduce((sum, p) => sum + p, 0) / slice.length;
}

export function exponentialMovingAverage(prices: number[], window: number): number {
  const k = 2 / (window + 1);
  return prices.slice(-window * 3).reduce((ema, price, i) => (i === 0 ? price : price * k + ema * (1 - k)), prices[0]);
}

export function volatility(prices: number[]): number {
  const returns = prices.slice(1).map((p, i) => Math.log(p / prices[i]));
  const mean = returns.reduce((sum, r) => sum + r, 0) / returns.length;
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / returns.length;
  return Math.sqrt(variance) * Math.sqrt(365) * 100;
}

export function relativeStrengthIndex(prices: number[], window = 14): number {
  const changes = prices.slice(-(window + 1)).slice(1).map((p, i) => p - prices.slice(-(window + 1))[i]);
  const gains = changes.filter((c) => c > 0);
  const losses = changes.filter((c) => c < 0).map((c) => Math.abs(c));

  const avgGain = gains.reduce((s, g) => s + g, 0) / window;
  const avgLoss = losses.reduce((s, l) => s + l, 0) / window;

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export async function getBitcoinAnalysis(): Promise<BitcoinAnalysis> {
  const prices = await fetchBitcoinPrices();
  const values = prices.map((p) => p.price);

  return {
    prices,
    currentPrice: values[values.length - 1],
    sma7: simpleMovingAverage(values, 7),
    sma30: simpleMovingAverage(values, 30),
    ema12: exponentialMovingAverage(values, 12),
    volatility: volatility(values),
    rsi14: relativeStrengthIndex(values, 14),
  };
}
