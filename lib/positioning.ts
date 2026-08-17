/**
 * A leitura do perpétuo: quem está de que lado, onde estão as liquidações e o
 * quanto o contrato descolou do mercado à vista.
 *
 * O veredito no fim é o ponto. Vender moeda manipulada só é bom negócio quando
 * o varejo está comprado contra o dinheiro grande e existe um bolsão de
 * liquidação de comprados abaixo do preço — liquidar aqueles comprados gera
 * venda a mercado que empurra na mesma direção. Quando a configuração está
 * invertida, entrar vendido é virar o combustível do squeeze, e é justamente aí
 * que a intuição de "a moeda é um golpe, então vai cair" custa caro.
 */

import { fetchCsv, dailyKlineUrl, metricsUrl, recentDays } from "./datavision";
import { parseKlines, parsePositioning, type PositioningSnapshot } from "./derivatives";
import { clusters, liquidationMap, reconstructPositions, type LiquidationLevel } from "./liquidation";
import { depthOn, pairsOfToken } from "./dexscreener";
import { findToken } from "./watchlist";

export interface DailyRow {
  date: string;
  close: number;
  change: number;
  volumeUsd: number;
  openInterestValue: number;
  openInterestChange: number;
  accountRatio: number;
  whaleRatio: number;
  takerRatio: number;
}

export type Verdict = "sell" | "wait" | "avoid" | "unclear";

export interface Basis {
  perp: number;
  spot: number;
  /** perp ÷ spot − 1. */
  basis: number;
  liquidityUsd: number;
  openInterestValue: number;
}

export interface PositioningSnapshotView {
  symbol: string;
  price: number;
  rows: DailyRow[];
  accountRatio: number;
  whaleRatio: number;
  takerRatio: number;
  openInterestValue: number;
  above: LiquidationLevel[];
  below: LiquidationLevel[];
  aboveTotal: number;
  belowTotal: number;
  longNotional: number;
  shortNotional: number;
  readings: number;
  basis: Basis | null;
  verdict: Verdict;
  verdictTitle: string;
  verdictDetail: string;
}

const DAYS = 14;

/**
 * Monta a leitura de um símbolo. Devolve nulo quando a Binance não publica nada
 * para ele — símbolo novo demais ou inexistente no mercado de futuros.
 */
export async function getPositioning(
  symbol: string,
): Promise<PositioningSnapshotView | null> {
  const days = recentDays(DAYS);

  const [klineParts, metricParts] = await Promise.all([
    Promise.all(days.map((d) => fetchCsv(dailyKlineUrl(symbol, "1d", d)))),
    Promise.all(days.map((d) => fetchCsv(metricsUrl(symbol, d)))),
  ]);

  const bars = klineParts
    .filter((c): c is string => c !== null)
    .flatMap(parseKlines)
    .sort((a, b) => a.time - b.time);

  if (bars.length === 0) return null;

  const byDay = new Map<string, PositioningSnapshot[]>();
  const snapshots: PositioningSnapshot[] = [];

  for (const [i, csv] of metricParts.entries()) {
    if (!csv) continue;
    const parsed = parsePositioning(csv);
    byDay.set(days[i], parsed);
    snapshots.push(...parsed);
  }

  snapshots.sort((a, b) => a.time - b.time);
  const latest = snapshots[snapshots.length - 1];
  if (!latest || latest.openInterest <= 0) return null;

  // -------------------------------------------------------------- tabela
  const rows: DailyRow[] = [];
  let previousOi = NaN;

  for (const [i, bar] of bars.entries()) {
    const date = new Date(bar.time * 1000).toISOString().slice(0, 10);
    const last = byDay.get(date)?.slice(-1)[0];
    const previous = bars[i - 1];

    rows.push({
      date,
      close: bar.close,
      change: previous ? bar.close / previous.close - 1 : 0,
      volumeUsd: bar.volume * bar.close,
      openInterestValue: last?.openInterestValue ?? NaN,
      openInterestChange:
        last && Number.isFinite(previousOi) && previousOi > 0
          ? last.openInterest / previousOi - 1
          : NaN,
      accountRatio: last?.accountRatio ?? NaN,
      whaleRatio: last?.topTraderPositionRatio ?? NaN,
      takerRatio: last?.takerRatio ?? NaN,
    });

    if (last) previousOi = last.openInterest;
  }

  // ------------------------------------------------- mapa de liquidação
  const price = latest.openInterestValue / latest.openInterest;
  const positions = reconstructPositions(snapshots);
  const map = liquidationMap(positions, price);
  const { above, below } = clusters(map);

  const aboveTotal = above.reduce((s, l) => s + l.notional, 0);
  const belowTotal = below.reduce((s, l) => s + l.notional, 0);

  // ------------------------------------------------------ base perp/spot
  const token = findToken(symbol);
  let basis: Basis | null = null;

  if (token?.contract) {
    try {
      const depth = depthOn(await pairsOfToken(token.contract), token.chain);
      if (depth && depth.priceUsd > 0) {
        basis = {
          perp: price,
          spot: depth.priceUsd,
          basis: price / depth.priceUsd - 1,
          liquidityUsd: depth.liquidityUsd,
          openInterestValue: latest.openInterestValue,
        };
      }
    } catch {
      // Sem a base o painel ainda vale pelo posicionamento.
    }
  }

  const call = decide(latest, belowTotal, aboveTotal);

  return {
    symbol,
    price,
    rows,
    accountRatio: latest.accountRatio,
    whaleRatio: latest.topTraderPositionRatio,
    takerRatio: latest.takerRatio,
    openInterestValue: latest.openInterestValue,
    above,
    below,
    aboveTotal,
    belowTotal,
    longNotional: positions
      .filter((p) => p.side === "long")
      .reduce((s, p) => s + p.notional, 0),
    shortNotional: positions
      .filter((p) => p.side === "short")
      .reduce((s, p) => s + p.notional, 0),
    readings: snapshots.length,
    basis,
    ...call,
  };
}

function decide(
  latest: PositioningSnapshot,
  belowTotal: number,
  aboveTotal: number,
): { verdict: Verdict; verdictTitle: string; verdictDetail: string } {
  const retailLong = latest.accountRatio > 1.5;
  const retailShort = latest.accountRatio < 0.7;
  const whalesShort = latest.topTraderPositionRatio < 1;
  const whalesLong = latest.topTraderPositionRatio > 1.2;

  if (retailLong && whalesShort && belowTotal > aboveTotal) {
    return {
      verdict: "sell",
      verdictTitle: "Configuração completa para vender",
      verdictDetail:
        `Varejo comprado (${latest.accountRatio.toFixed(2)}), dinheiro grande vendido ` +
        `(${latest.topTraderPositionRatio.toFixed(2)}) e o bolsão de liquidação maior por baixo. ` +
        `É a combinação que antecede cascata: liquidar os comprados gera venda a mercado ` +
        `que empurra o preço na mesma direção.`,
    };
  }

  if (retailLong && whalesShort) {
    return {
      verdict: "wait",
      verdictTitle: "Divergência sem gatilho abaixo",
      verdictDetail:
        `Varejo comprado contra dinheiro grande vendido, mas o bolsão maior de liquidação ` +
        `está por cima. Falta o combustível que transformaria a divergência em queda.`,
    };
  }

  if (retailShort && whalesLong) {
    return {
      verdict: "avoid",
      verdictTitle: "Não vender — a configuração está invertida",
      verdictDetail:
        `O varejo já está vendido (${latest.accountRatio.toFixed(2)}) e o dinheiro grande ` +
        `comprado (${latest.topTraderPositionRatio.toFixed(2)}). Entrar vendido agora é somar-se ` +
        `à multidão que serve de combustível para o squeeze — a moeda ser um golpe não impede ` +
        `que ela suba primeiro.`,
    };
  }

  return {
    verdict: "unclear",
    verdictTitle: "Sem alinhamento claro",
    verdictDetail:
      `Varejo em ${latest.accountRatio.toFixed(2)} e dinheiro grande em ` +
      `${latest.topTraderPositionRatio.toFixed(2)}. Nenhum dos dois extremos, então o ` +
      `posicionamento não diz nada de útil hoje.`,
  };
}
