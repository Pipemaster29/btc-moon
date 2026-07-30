/**
 * Candles históricos de BTC/USD via API pública da Bitstamp.
 *
 * A Bitstamp foi escolhida em vez da Binance por dois motivos:
 *  - histórico desde 2011, contra 2017 da Binance;
 *  - a API da Binance bloqueia por geolocalização, o que quebraria em
 *    produção na Vercel (região padrão iad1, nos EUA).
 */

export interface Candle {
  /** Início do período, em segundos desde a época Unix (UTC). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = "1h" | "4h" | "1d" | "1w";

interface TimeframeConfig {
  /** Passo aceito pela Bitstamp, em segundos. `null` = derivado por agregação. */
  step: number | null;
  /** Quantos dias de histórico buscar. `null` = tudo desde o início. */
  historyDays: number | null;
  label: string;
}

/**
 * O histórico de cada timeframe é limitado ao que dá para buscar em poucas
 * requisições: a Bitstamp devolve no máximo 1000 velas por chamada, então 1h
 * desde 2012 exigiria ~123 requisições. Timeframes altos cobrem todo o período.
 */
export const TIMEFRAMES: Record<Timeframe, TimeframeConfig> = {
  "1h": { step: 3600, historyDays: 90, label: "1H" },
  "4h": { step: 14400, historyDays: 365, label: "4H" },
  "1d": { step: 86400, historyDays: null, label: "1D" },
  "1w": { step: null, historyDays: null, label: "1S" },
};

/** Primeira vela disponível na Bitstamp (agosto de 2011). */
const HISTORY_START = Math.floor(Date.UTC(2011, 7, 18) / 1000);

const MAX_LIMIT = 1000;
const BASE_URL = "https://www.bitstamp.net/api/v2/ohlc/btcusd/";

interface BitstampCandle {
  timestamp: string;
  open: string;
  high: string;
  low: string;
  close: string;
  volume: string;
}

function parseCandle(raw: BitstampCandle): Candle {
  return {
    time: Number(raw.timestamp),
    open: Number(raw.open),
    high: Number(raw.high),
    low: Number(raw.low),
    close: Number(raw.close),
    volume: Number(raw.volume),
  };
}

async function fetchPage(step: number, start: number): Promise<Candle[]> {
  const url = `${BASE_URL}?step=${step}&limit=${MAX_LIMIT}&start=${start}`;
  const res = await fetch(url, { next: { revalidate: 3600 } });

  if (!res.ok) {
    throw new Error(`Bitstamp respondeu ${res.status} para step=${step}`);
  }

  const body: { data?: { ohlc?: BitstampCandle[] } } = await res.json();
  return (body.data?.ohlc ?? []).map(parseCandle);
}

/**
 * Busca candles paginando até cobrir o intervalo pedido.
 *
 * A Bitstamp devolve as velas em ordem crescente a partir de `start`, então
 * cada página recomeça logo após a última vela recebida.
 */
async function fetchRange(step: number, from: number): Promise<Candle[]> {
  const candles: Candle[] = [];
  let cursor = from;

  // Teto de segurança: evita laço infinito se a API parar de avançar.
  for (let page = 0; page < 200; page++) {
    const batch = await fetchPage(step, cursor);
    if (batch.length === 0) break;

    // A primeira vela da página seguinte repete a última da anterior.
    const fresh = candles.length > 0 ? batch.filter((c) => c.time > cursor) : batch;
    candles.push(...fresh);

    if (batch.length < MAX_LIMIT) break;

    const last = batch[batch.length - 1].time;
    if (last <= cursor) break;
    cursor = last;
  }

  return candles;
}

/** Agrega velas menores em períodos maiores (usado para o semanal). */
export function aggregate(candles: Candle[], bucketSeconds: number): Candle[] {
  const buckets = new Map<number, Candle>();

  for (const candle of candles) {
    const key = Math.floor(candle.time / bucketSeconds) * bucketSeconds;
    const existing = buckets.get(key);

    if (!existing) {
      buckets.set(key, { ...candle, time: key });
      continue;
    }

    existing.high = Math.max(existing.high, candle.high);
    existing.low = Math.min(existing.low, candle.low);
    existing.close = candle.close;
    existing.volume += candle.volume;
  }

  return [...buckets.values()].sort((a, b) => a.time - b.time);
}

export async function getCandles(timeframe: Timeframe): Promise<Candle[]> {
  const config = TIMEFRAMES[timeframe];

  // O semanal é derivado do diário: a Bitstamp não tem passo de 7 dias.
  if (config.step === null) {
    const daily = await getCandles("1d");
    return aggregate(daily, 7 * 86400);
  }

  const from =
    config.historyDays === null
      ? HISTORY_START
      : Math.floor(Date.now() / 1000) - config.historyDays * 86400;

  return fetchRange(config.step, from);
}
