/**
 * A série do perpétuo, emendando as duas praças pelo que cada uma tem.
 *
 * BINANCE  é onde o preço se forma: de 4 a 40 vezes o open interest da Gate,
 *          com razão de posicionamento própria. Dela vêm tamanho, preço e
 *          posicionamento.
 * GATE     publica duas coisas que a Binance não expõe por REST: o valor
 *          LIQUIDADO de cada lado a cada período, e a posição ABSOLUTA das
 *          contas grandes. As razões da Binance vêm normalizadas dentro do
 *          grupo, então não dá para reconstruir posição absoluta a partir
 *          delas.
 *
 * As duas convivem no mesmo objeto em vez de uma sobrescrever a outra. Misturar
 * numerador de uma praça com denominador da outra é o erro silencioso que este
 * arquivo existe para impedir.
 */

import { liveStats, type Interval, type LiveStat } from "./gate";
import { binanceSeries, type Period } from "./binance";

export async function perpSeries(
  symbol: string,
  interval: Interval = "1h",
  limit = 100,
): Promise<LiveStat[]> {
  const [gate, binance] = await Promise.all([
    liveStats(symbol, interval, limit),
    binanceSeries(symbol, interval as Period, limit).catch(() => []),
  ]);

  if (binance.length === 0) return gate;

  const porTempo = new Map(binance.map((b) => [b.time, b]));

  // Quando a Gate não lista o par, a série vira só Binance — sem liquidação e
  // sem posição de baleia, mas com tamanho e posicionamento corretos, que é
  // mais do que não ter nada.
  if (gate.length === 0) {
    return binance.map((b) => ({
      time: b.time,
      price: b.price,
      openInterest: b.openInterest,
      openInterestUsd: b.openInterestUsd,
      longLiqUsd: 0,
      shortLiqUsd: 0,
      accountRatio: b.accountRatio,
      takerRatio: b.takerRatio,
      whaleRatio: b.whaleRatio,
      whaleLong: 0,
      whaleShort: 0,
      whaleNet: 0,
      oiBinance: b.openInterest,
      oiBinanceUsd: b.openInterestUsd,
      accountRatioBinance: b.accountRatio,
      whaleRatioBinance: b.whaleRatio,
    }));
  }

  return gate.map((g) => {
    const b = porTempo.get(g.time);
    if (!b) return g;
    return {
      ...g,
      // Preço e posicionamento passam a ser os da praça grande; o open interest
      // da Gate continua no campo dele, para as contas que dependem dele.
      price: b.price,
      accountRatio: b.accountRatio,
      whaleRatio: b.whaleRatio,
      takerRatio: b.takerRatio || g.takerRatio,
      oiBinance: b.openInterest,
      oiBinanceUsd: b.openInterestUsd,
      accountRatioBinance: b.accountRatio,
      whaleRatioBinance: b.whaleRatio,
    };
  });
}
