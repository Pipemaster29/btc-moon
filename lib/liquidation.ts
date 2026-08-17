/**
 * Estimativa de onde estão as liquidações, a partir do open interest.
 *
 * Não existe fonte gratuita das posições reais — o Coinglass vende exatamente
 * isso. O que a Binance publica de graça, a cada 5 minutos, é o open interest
 * total e a razão de agressão. Dá para reconstruir o resto por dedução:
 *
 *   1. Quando o OI SOBE, posições novas nasceram naquele instante. O preço da
 *      leitura é a entrada delas.
 *   2. Quem estava agredindo diz de que lado veio a iniciativa. `takerRatio`
 *      acima de 1 significa comprador agressivo — os novos comprados são os
 *      alavancados, e são eles que têm preço de liquidação.
 *   3. Quando o OI CAI, posições morreram. Sem saber quais, a baixa é rateada
 *      proporcionalmente entre as que estavam abertas.
 *
 * O resultado é um mapa de calor aproximado: quanto valor foi aberto perto de
 * cada preço e onde ele seria liquidado em cada alavancagem. Aproximado é a
 * palavra — o modelo supõe que a alavancagem se distribui pelos níveis usuais,
 * e essa suposição não é verificável de fora.
 */

import type { PositioningSnapshot } from "./derivatives";

/** Alavancagens comuns no varejo, com o peso estimado de cada uma. */
export const LEVERAGE_MIX: { leverage: number; weight: number }[] = [
  { leverage: 5, weight: 0.15 },
  { leverage: 10, weight: 0.3 },
  { leverage: 20, weight: 0.3 },
  { leverage: 25, weight: 0.15 },
  { leverage: 50, weight: 0.1 },
];

/**
 * Margem de manutenção. Moedas pequenas usam faixas mais duras que o bitcoin;
 * 2,5% é o degrau baixo típico de um perpétuo de baixa liquidez.
 */
export const MAINTENANCE_MARGIN = 0.025;

export interface OpenPosition {
  entry: number;
  /** Valor nocional em dólares ainda aberto. */
  notional: number;
  side: "long" | "short";
}

export interface LiquidationLevel {
  price: number;
  /** Nocional que seria liquidado se o preço chegasse aqui. */
  notional: number;
  side: "long" | "short";
}

/**
 * Preço em que uma posição é liquidada.
 *
 * A margem de manutenção antecipa a liquidação: ela dispara antes de a perda
 * consumir o colateral inteiro, e ignorá-la coloca o gatilho longe demais.
 */
export function liquidationPrice(
  entry: number,
  leverage: number,
  side: "long" | "short",
  maintenance = MAINTENANCE_MARGIN,
): number {
  const move = 1 / leverage - maintenance;
  return side === "long" ? entry * (1 - move) : entry * (1 + move);
}

/**
 * Reconstrói as posições ainda abertas a partir da série de open interest.
 *
 * As leituras precisam vir ordenadas no tempo e ser do mesmo símbolo.
 */
export function reconstructPositions(
  snapshots: PositioningSnapshot[],
): OpenPosition[] {
  const open: OpenPosition[] = [];
  let previous = NaN;

  for (const snap of snapshots) {
    const price = snap.openInterest > 0 ? snap.openInterestValue / snap.openInterest : NaN;
    if (!Number.isFinite(price) || price <= 0) continue;

    if (!Number.isFinite(previous)) {
      previous = snap.openInterest;
      continue;
    }

    const delta = snap.openInterest - previous;
    previous = snap.openInterest;

    if (delta > 0) {
      // A razão de agressão reparte o nocional novo entre os dois lados. Se ela
      // vier zerada ou inválida, o padrão é meio a meio.
      const ratio = Number.isFinite(snap.takerRatio) && snap.takerRatio > 0
        ? snap.takerRatio
        : 1;
      const longShare = ratio / (1 + ratio);
      const notional = delta * price;

      open.push({ entry: price, notional: notional * longShare, side: "long" });
      open.push({ entry: price, notional: notional * (1 - longShare), side: "short" });
    } else if (delta < 0) {
      // Fechamentos são rateados: sem saber quais posições morreram, tirar
      // proporcionalmente é a única escolha que não inventa informação.
      const total = open.reduce((sum, p) => sum + p.notional, 0);
      if (total <= 0) continue;
      const survival = Math.max(0, 1 + (delta * price) / total);
      for (const position of open) position.notional *= survival;
    }
  }

  return open.filter((p) => p.notional > 0);
}

/**
 * Agrupa as liquidações projetadas em faixas de preço.
 *
 * Cada posição aberta é espalhada pelas alavancagens de `LEVERAGE_MIX`, porque
 * não há como saber a de cada uma — o que existe é a distribuição típica.
 */
export function liquidationMap(
  positions: OpenPosition[],
  currentPrice: number,
  bins = 40,
  range = 0.6,
): LiquidationLevel[] {
  const low = currentPrice * (1 - range);
  const high = currentPrice * (1 + range);
  const width = (high - low) / bins;
  if (width <= 0) return [];

  const buckets = new Map<string, LiquidationLevel>();

  for (const position of positions) {
    for (const { leverage, weight } of LEVERAGE_MIX) {
      const price = liquidationPrice(position.entry, leverage, position.side);
      if (price <= low || price >= high) continue;

      // Um comprado cujo preço de liquidação está ACIMA do mercado já foi
      // liquidado — assim como um vendido com liquidação abaixo. Deixá-los no
      // mapa infla bolsões que não existem mais, e é o erro que faz o modelo
      // enxergar liquidez parada onde já houve estouro.
      if (position.side === "long" && price >= currentPrice) continue;
      if (position.side === "short" && price <= currentPrice) continue;

      const bin = Math.floor((price - low) / width);
      const key = `${position.side}:${bin}`;
      const existing = buckets.get(key);
      const notional = position.notional * weight * leverage;

      if (existing) existing.notional += notional;
      else {
        buckets.set(key, {
          price: low + (bin + 0.5) * width,
          notional,
          side: position.side,
        });
      }
    }
  }

  return [...buckets.values()].sort((a, b) => a.price - b.price);
}

/**
 * As maiores concentrações de cada lado.
 *
 * São elas que interessam para operar: o preço tende a ser puxado na direção do
 * bolsão grande, porque liquidar aquelas posições gera ordens a mercado que
 * empurram na mesma direção.
 *
 * Depois do filtro de níveis já rompidos, o lado da posição determina a direção:
 * todo comprado no mapa liquida abaixo do mercado, todo vendido acima.
 */
export function clusters(
  map: LiquidationLevel[],
  count = 3,
): { above: LiquidationLevel[]; below: LiquidationLevel[] } {
  const bySize = (a: LiquidationLevel, b: LiquidationLevel) => b.notional - a.notional;
  return {
    above: map.filter((l) => l.side === "short").sort(bySize).slice(0, count),
    below: map.filter((l) => l.side === "long").sort(bySize).slice(0, count),
  };
}
