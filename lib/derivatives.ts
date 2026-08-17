/**
 * Preço, open interest e CVD do mercado de futuros da Binance.
 *
 * Os três sinais vêm dos arquivos públicos do Binance Data Vision, que não
 * exigem chave e — ao contrário da API REST — não são bloqueados por região.
 *
 * O CVD não vem pronto: as klines trazem o volume total e a parcela executada
 * por compradores agressivos (`taker_buy_volume`). O que sobra é a parcela dos
 * vendedores agressivos, e a diferença entre as duas é o delta do período.
 */

export interface DerivBar {
  /** Início do dia, em segundos desde a época (UTC). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  /** Volume comprado por agressão no período. */
  takerBuy: number;
  /** takerBuy − takerSell: saldo de agressão do período. */
  delta: number;
  /** Soma acumulada dos deltas — o CVD propriamente dito. */
  cvd: number;
  /** Open interest em BTC no fim do dia; NaN quando não há dado. */
  openInterest: number;
}

/**
 * Converte o CSV de klines de futuros em barras com delta de agressão.
 *
 * O CVD acumulado não é calculado aqui: ele depende da ordem global das barras,
 * e este parser roda por arquivo.
 */
export function parseKlines(csv: string): Omit<DerivBar, "cvd" | "openInterest">[] {
  const bars: Omit<DerivBar, "cvd" | "openInterest">[] = [];

  for (const line of csv.split("\n")) {
    const row = line.trim();
    if (!row || row.startsWith("open_time")) continue;

    const cols = row.split(",");
    if (cols.length < 11) continue;

    const openTime = Number(cols[0]);
    const volume = Number(cols[5]);
    const takerBuy = Number(cols[9]);
    if (!Number.isFinite(openTime) || !Number.isFinite(volume)) continue;

    // Alguns arquivos antigos vêm com o tempo em microssegundos.
    const ms = openTime > 1e14 ? openTime / 1000 : openTime;

    bars.push({
      time: Math.floor(ms / 1000),
      open: Number(cols[1]),
      high: Number(cols[2]),
      low: Number(cols[3]),
      close: Number(cols[4]),
      volume,
      takerBuy,
      // O restante do volume foi executado por vendedores agressivos.
      delta: takerBuy - (volume - takerBuy),
    });
  }

  return bars.sort((a, b) => a.time - b.time);
}

/**
 * Uma leitura do painel de posicionamento da Binance, a cada 5 minutos.
 *
 * As três razões medem coisas distintas e é fácil confundi-las. `accountRatio`
 * conta CABEÇAS entre todos os clientes; `topTraderAccountRatio` conta cabeças
 * só entre as maiores contas; e `topTraderPositionRatio` pesa pelo TAMANHO da
 * posição dessas contas. A divergência entre as duas últimas é justamente o que
 * separa "muitas baleias compradas" de "muito dinheiro comprado".
 */
export interface PositioningSnapshot {
  time: number;
  openInterest: number;
  openInterestValue: number;
  /** Contas grandes compradas ÷ vendidas, por cabeça. */
  topTraderAccountRatio: number;
  /** Posição comprada ÷ vendida das contas grandes, por tamanho. */
  topTraderPositionRatio: number;
  /** Todas as contas compradas ÷ vendidas, por cabeça. */
  accountRatio: number;
  /** Volume agressor comprador ÷ vendedor. */
  takerRatio: number;
}

/** Todas as leituras do arquivo diário de métricas. */
export function parsePositioning(csv: string): PositioningSnapshot[] {
  const out: PositioningSnapshot[] = [];

  for (const line of csv.split("\n")) {
    const row = line.trim();
    if (!row || row.startsWith("create_time")) continue;

    const cols = row.split(",");
    if (cols.length < 8) continue;

    const time = Date.parse(`${cols[0].replace(" ", "T")}Z`) / 1000;
    if (!Number.isFinite(time)) continue;

    out.push({
      time,
      openInterest: Number(cols[2]),
      openInterestValue: Number(cols[3]),
      topTraderAccountRatio: Number(cols[4]),
      topTraderPositionRatio: Number(cols[5]),
      accountRatio: Number(cols[6]),
      takerRatio: Number(cols[7]),
    });
  }

  return out;
}

/**
 * Open interest de fechamento do dia, a partir do arquivo de métricas de 5 em
 * 5 minutos. Usa a última leitura, que é a que corresponde ao candle diário.
 */
export function parseOpenInterest(csv: string): number {
  const snapshots = parsePositioning(csv);
  const last = snapshots[snapshots.length - 1];
  return last ? last.openInterest : NaN;
}

/** Acumula o delta para formar o CVD e junta o open interest de cada dia. */
export function assemble(
  bars: Omit<DerivBar, "cvd" | "openInterest">[],
  openInterestByDay: Map<number, number>,
): DerivBar[] {
  let cvd = 0;
  return bars.map((b) => {
    cvd += b.delta;
    return {
      ...b,
      cvd,
      openInterest: openInterestByDay.get(Math.floor(b.time / 86400)) ?? NaN,
    };
  });
}

// ------------------------------------------------------------------- regimes

/** Os quatro cenários da combinação preço × open interest × CVD. */
export type Regime =
  | "bullish"
  | "short-covering"
  | "bearish"
  | "long-liquidation"
  | "none";

export const REGIME_LABEL: Record<Regime, string> = {
  bullish: "Alta forte (preço↑ OI↑ CVD↑)",
  "short-covering": "Recompra de shorts (preço↑ OI↓ CVD↑)",
  bearish: "Baixa forte (preço↓ OI↑ CVD↓)",
  "long-liquidation": "Saída de comprados (preço↓ OI↓ CVD↓)",
  none: "Sem combinação clara",
};

/**
 * Classifica uma barra comparando cada série com `lookback` dias atrás.
 *
 * A comparação é feita contra uma janela, e não contra o dia anterior, porque
 * o infográfico descreve tendências — e um único dia de OI ou CVD é ruído
 * demais para caracterizar quem está no controle.
 */
export function classify(
  bars: DerivBar[],
  index: number,
  lookback: number,
): Regime {
  const now = bars[index];
  const before = bars[index - lookback];
  if (!now || !before) return "none";
  if (!Number.isFinite(now.openInterest) || !Number.isFinite(before.openInterest)) {
    return "none";
  }

  const priceUp = now.close > before.close;
  const oiUp = now.openInterest > before.openInterest;
  const cvdUp = now.cvd > before.cvd;

  if (priceUp && oiUp && cvdUp) return "bullish";
  if (priceUp && !oiUp && cvdUp) return "short-covering";
  if (!priceUp && oiUp && !cvdUp) return "bearish";
  if (!priceUp && !oiUp && !cvdUp) return "long-liquidation";
  return "none";
}
