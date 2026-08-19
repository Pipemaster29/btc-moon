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

/**
 * De onde veio a alta — e é isso que decide quanto ela dura.
 *
 * Duas altas com o mesmo gráfico têm origens opostas e destinos opostos:
 *
 *   OFERTA       o float sai das corretoras e o livro seca. O preço sobe porque
 *                não há o que vender. Enquanto a oferta ficar fora, se sustenta.
 *                Foi o LAB: saldo nas corretoras caiu 97% e o preço fez 79x.
 *   ALAVANCAGEM  o open interest explode enquanto o float não se mexe. A alta é
 *                dinheiro emprestado comprando de quem está vendido, e acaba
 *                quando os vendidos acabam. Foi o GPS: OI +115% num dia contra
 *                preço +51%, com o saldo das corretoras parado — e −33% depois.
 *
 * A razão entre o crescimento do OI e o do preço separa as duas.
 */
export type RiseKind = "oferta" | "alavancagem" | "misto" | "sem alta";

export interface RiseQuality {
  kind: RiseKind;
  /** Variação do preço na janela. */
  priceChange: number;
  /** Variação do open interest na janela. */
  oiChange: number;
  /** oiChange ÷ priceChange: acima de 1,5 a alta é movida a crédito. */
  ratio: number;
  note: string;
}

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
  rise: RiseQuality;
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

  const rise = classifyRise(rows);
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
    rise,
    ...call,
  };
}

/**
 * Classifica a alta pelos últimos dias com dado completo.
 *
 * Usa três dias e não um: um único dia de OI é ruído, e a natureza da alta se
 * revela no acumulado. Abaixo de 10% de alta não classifica — sem subida, a
 * pergunta não faz sentido.
 */
function classifyRise(rows: DailyRow[]): RiseQuality {
  const validas = rows.filter((r) => Number.isFinite(r.openInterestValue));
  if (validas.length < 4) {
    return { kind: "sem alta", priceChange: 0, oiChange: 0, ratio: 0, note: "dados insuficientes" };
  }

  const fim = validas[validas.length - 1];
  const ini = validas[Math.max(0, validas.length - 4)];
  const priceChange = fim.close / ini.close - 1;
  const oiChange = fim.openInterestValue / ini.openInterestValue - 1;

  if (priceChange < 0.1) {
    return {
      kind: "sem alta",
      priceChange,
      oiChange,
      ratio: 0,
      note: "sem subida relevante no período para classificar",
    };
  }

  const ratio = oiChange / priceChange;

  if (ratio >= 1.5) {
    return {
      kind: "alavancagem",
      priceChange,
      oiChange,
      ratio,
      note:
        `O open interest cresceu ${(oiChange * 100).toFixed(0)}% contra ${(priceChange * 100).toFixed(0)}% de preço — ` +
        `a alta é dinheiro emprestado, não oferta escasseando. Esse tipo se desfaz quando ` +
        `os vendidos que alimentam o squeeze acabam, e a queda costuma ser tão rápida quanto a subida.`,
    };
  }

  if (ratio <= 0.5) {
    return {
      kind: "oferta",
      priceChange,
      oiChange,
      ratio,
      note:
        `O preço subiu ${(priceChange * 100).toFixed(0)}% com o open interest quase parado ` +
        `(${(oiChange * 100).toFixed(0)}%). A alta não veio de crédito — é compatível com float ` +
        `saindo do livro, que é o tipo que se sustenta enquanto a oferta ficar fora.`,
    };
  }

  return {
    kind: "misto",
    priceChange,
    oiChange,
    ratio,
    note: `Preço e open interest cresceram em proporção parecida; não dá para separar as duas origens.`,
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
