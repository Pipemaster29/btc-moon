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
import { type LiveStat } from "./gate";
import { perpSeries } from "./perp";
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

/**
 * O movimento dominante das últimas 24 horas, lido no presente.
 *
 * O `rise` acima olha dias fechados do Data Vision e por isso enxerga só até
 * ontem. Este olha a leitura viva, e classifica tanto alta quanto queda — que
 * é onde a confusão mais cara acontece.
 *
 * As quedas, em particular, têm três origens que ninguém distingue no gráfico:
 *
 *   DESALAVANCAGEM  o open interest em moeda cai junto com o preço. Comprado
 *                   alavancado foi encerrado. A queda inteira mora no perpétuo
 *                   e não deixa rastro na rede, porque moeda nenhuma trocou de
 *                   mão de verdade.
 *   LIVRO VAZIO     o open interest fica de pé, e quase ninguém é liquidado. O
 *                   preço cai porque a COMPRA sumiu, não porque apareceu venda.
 *                   É o que sobra quando uma alta movida a squeeze fica sem
 *                   vendidos para espremer.
 *   DISTRIBUIÇÃO    o open interest fica de pé e o preço cai porque alguém
 *                   entregou moeda de verdade. Esta é a única das três que
 *                   aparece no saldo das corretoras na rede.
 */
export type MoveKind =
  | "squeeze"
  | "alavancagem"
  | "oferta"
  | "desalavancagem"
  | "livro vazio"
  | "distribuicao"
  | "misto";

export interface MoveRead {
  kind: MoveKind;
  direction: "alta" | "queda";
  priceFrom: number;
  priceTo: number;
  priceChange: number;
  oiChange: number;
  /** oiChange ÷ priceChange. */
  ratio: number;
  longLiqUsd: number;
  shortLiqUsd: number;
  /** Open interest em dólar no fim do movimento — a escala do mercado. */
  openInterestUsd: number;
  /** Liquidado NA DIREÇÃO do movimento ÷ open interest: quanto dele foi forçado.
   *  Numa queda só contam os comprados; vendido liquidado durante uma queda é o
   *  rastro do squeeze que a precedeu, não parte dela. */
  forcedShare: number;
  note: string;
}

/**
 * As contas grandes desmontando posição comprada perto do topo.
 *
 * A razão comprado÷vendido não serve para isto: ela some quando a posição
 * líquida passa perto de zero, e aí "caiu 30% do pico" vira ruído — no GPS
 * chegou a marcar −371%. O que mede de verdade é quanto do LIVRO elas
 * largaram: (pico da posição líquida − posição agora) ÷ open interest.
 *
 * Quatro condições, e as quatro precisam valer:
 *
 *   1. as baleias estavam de fato compradas no pico (≥8% do open interest),
 *      senão não há posição para desmontar;
 *   2. largaram pelo menos 3% do livro;
 *   3. houve alta de pelo menos 15% até esse pico — o sinal é sair do topo de
 *      uma subida, não ficar de lado num mercado parado;
 *   4. o preço ainda não quebrou (a menos de 10% da máxima da janela). Depois
 *      que caiu, o aviso não serve para nada.
 *
 * O placar medido em 5 dias de dado da Gate, sobre BTW, GPS, PRL e LAB, com
 * DOGE, SOL e XRP de controle: 6 episódios, 4 seguidos de queda maior que 8%
 * em 24 horas, 2 seguidos de alta — os dois no GPS, um dia antes do topo real.
 * Zero disparos nos controles. É aviso, não veredito, e a amostra é pequena.
 */
export interface WhaleExit {
  /** Fração do open interest que as contas grandes largaram desde o pico. */
  share: number;
  /** Posição líquida no pico e agora, em moeda. */
  peakNet: number;
  net: number;
  /** Quanto o preço subiu até o pico da posição. */
  rally: number;
  /** Distância do preço atual até a máxima da janela. */
  fromHigh: number;
  /** A alta que precedeu era frágil — squeeze ou alavancagem. */
  fragile: boolean;
}

/** A leitura viva do perpétuo — hoje, não ontem. */
export interface LiveRead {
  price: number;
  openInterest: number;
  openInterestUsd: number;
  accountRatio: number;
  whaleRatio: number;
  longLiqUsd24h: number;
  shortLiqUsd24h: number;
  move: MoveRead | null;
  /** Nulo quando as contas grandes não estão saindo de nada. */
  whaleExit: WhaleExit | null;
  updatedAt: number;
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
  /** Nulo quando a Gate não lista o par. */
  live: LiveRead | null;
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

  const [klineParts, metricParts, live] = await Promise.all([
    Promise.all(days.map((d) => fetchCsv(dailyKlineUrl(symbol, "1d", d)))),
    Promise.all(days.map((d) => fetchCsv(metricsUrl(symbol, d)))),
    perpSeries(symbol, "1h", 100),
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
    live: readLiveFromStats(live),
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

/**
 * Só a perna atual do perpétuo, sem montar o painel inteiro.
 *
 * É o que o monitor precisa: ele roda a cada poucos minutos e não tem uso para
 * o mapa de liquidação nem para os catorze dias de histórico.
 */
export async function currentMove(
  symbol: string,
): Promise<{ move: MoveRead | null; whaleExit: WhaleExit | null }> {
  const live = readLiveFromStats(await perpSeries(symbol, "1h", 100));
  return { move: live?.move ?? null, whaleExit: live?.whaleExit ?? null };
}

/**
 * Lê o movimento dominante das últimas 24 horas.
 *
 * O trecho relevante é da ponta ao fundo — se o topo veio antes do fundo, a
 * perna atual é de queda; se veio depois, é de alta. Isso escolhe sozinho a
 * perna mais recente sem precisar de janela fixa.
 */
export function readLiveFromStats(stats: LiveStat[]): LiveRead | null {
  if (stats.length < 6) return null;

  const janela = stats.slice(-24);
  const ultimo = janela[janela.length - 1];

  let topo = 0;
  let fundo = 0;
  for (const [i, s] of janela.entries()) {
    if (s.price > janela[topo].price) topo = i;
    if (s.price < janela[fundo].price) fundo = i;
  }

  const queda = topo < fundo;
  const [de, ate] = queda ? [topo, fundo] : [fundo, topo];
  const trecho = janela.slice(de, ate + 1);

  const longLiq = trecho.reduce((s, r) => s + r.longLiqUsd, 0);
  const shortLiq = trecho.reduce((s, r) => s + r.shortLiqUsd, 0);

  return {
    price: ultimo.price,
    openInterest: ultimo.openInterest,
    openInterestUsd: ultimo.openInterestUsd,
    accountRatio: ultimo.accountRatio,
    whaleRatio: ultimo.whaleRatio,
    longLiqUsd24h: janela.reduce((s, r) => s + r.longLiqUsd, 0),
    shortLiqUsd24h: janela.reduce((s, r) => s + r.shortLiqUsd, 0),
    whaleExit: detectWhaleExit(janela),
    move: classifyMove(
      janela[de],
      janela[ate],
      queda ? "queda" : "alta",
      longLiq,
      shortLiq,
    ),
    updatedAt: ultimo.time * 1000,
  };
}

/**
 * As contas grandes largando posição comprada enquanto o preço ainda está no
 * topo. Devolve nulo quando qualquer uma das quatro condições falha.
 */
export function detectWhaleExit(janela: LiveStat[]): WhaleExit | null {
  if (janela.length < 8) return null;

  const atual = janela[janela.length - 1];
  let pico = janela[0];
  let iPico = 0;
  for (const [i, s] of janela.entries()) {
    if (s.whaleNet > pico.whaleNet) {
      pico = s;
      iPico = i;
    }
  }

  if (pico.openInterest <= 0 || atual.openInterest <= 0) return null;
  if (pico.whaleNet / pico.openInterest < 0.08) return null;

  const share = (pico.whaleNet - atual.whaleNet) / atual.openInterest;
  if (share < 0.03) return null;

  const antes = janela.slice(0, iPico + 1);
  const fundo = antes.reduce((a, b) => (b.price < a.price ? b : a), antes[0]);
  const rally = pico.price / fundo.price - 1;
  if (rally < 0.15) return null;

  const maxima = Math.max(...janela.map((s) => s.price));
  const fromHigh = 1 - atual.price / maxima;
  if (fromHigh > 0.1) return null;

  // Tentei também exigir que o open interest tivesse parado de crescer — a
  // ideia de que a saída só marca o fim quando ninguém repõe a posição. Mediu
  // pior: cortou um acerto da BTW junto com os erros do GPS e o placar foi de
  // 3 em 6 para 2 em 4. Ficou de fora, e fica registrado para não ser tentado
  // de novo.

  // A alta que precedeu era a crédito? Squeeze e alavancagem são as duas
  // formas frágeis; saída de baleia depois de alta orgânica é só realização.
  const trecho = janela.slice(janela.indexOf(fundo), iPico + 1);
  const shortLiq = trecho.reduce((s, r) => s + r.shortLiqUsd, 0);
  const longLiq = trecho.reduce((s, r) => s + r.longLiqUsd, 0);
  const oiRatio = (pico.openInterest / fundo.openInterest - 1) / rally;

  return {
    share,
    peakNet: pico.whaleNet,
    net: atual.whaleNet,
    rally,
    fromHigh,
    fragile: (shortLiq >= 3 * longLiq && shortLiq > 0) || oiRatio >= 1.5,
  };
}

/** Abaixo disso o movimento é ruído e não vale classificar. */
const MOVE_FLOOR = 0.1;

function classifyMove(
  de: LiveStat,
  ate: LiveStat,
  direction: "alta" | "queda",
  longLiqUsd: number,
  shortLiqUsd: number,
): MoveRead | null {
  const priceChange = ate.price / de.price - 1;
  if (Math.abs(priceChange) < MOVE_FLOOR) return null;

  // A variação do open interest tem de vir da praça que forma o preço. Medida
  // na Gate, a mesma perna da BTW dava outro número — é praça pequena e o
  // arbitrador a puxa em vez de ela puxar o mercado.
  const oiDe = de.oiBinance ?? de.openInterest;
  const oiAte = ate.oiBinance ?? ate.openInterest;
  const oiChange = oiAte / oiDe - 1;
  const ratio = oiChange / priceChange;
  // Liquidação é número da Gate, então a fração forçada divide por open
  // interest DA GATE. Dividir pelo da Binance daria uma fração quarenta vezes
  // menor e nenhum movimento pareceria forçado.
  const forcado = direction === "queda" ? longLiqUsd : shortLiqUsd;
  const forcedShare = ate.openInterestUsd > 0 ? forcado / ate.openInterestUsd : 0;

  const base = {
    direction,
    priceFrom: de.price,
    priceTo: ate.price,
    priceChange,
    oiChange,
    ratio,
    longLiqUsd,
    shortLiqUsd,
    openInterestUsd: ate.oiBinanceUsd ?? ate.openInterestUsd,
    forcedShare,
  };

  const p = (v: number) => `${(v * 100).toFixed(0)}%`;
  const usd = (v: number) =>
    v >= 1e6 ? `US$ ${(v / 1e6).toFixed(1)} mi` : `US$ ${(v / 1e3).toFixed(0)} mil`;

  if (direction === "alta") {
    // Vendido sendo liquidado em massa enquanto o open interest quase não
    // cresce: a compra que sobe o preço é forçada, não voluntária. Acaba
    // quando acabam os vendidos, e aí não sobra bid nenhum embaixo.
    if (shortLiqUsd >= 3 * longLiqUsd && shortLiqUsd > 0 && ratio < 1) {
      return {
        ...base,
        kind: "squeeze",
        note:
          `Preço +${p(priceChange)} com open interest ${p(oiChange)} e ${usd(shortLiqUsd)} de ` +
          `vendidos liquidados. Quem comprou foi obrigado a comprar. Esse tipo de alta não ` +
          `deixa comprador voluntário embaixo do preço: quando os vendidos acabam, o bid some junto.`,
      };
    }
    if (ratio >= 1.5) {
      return {
        ...base,
        kind: "alavancagem",
        note:
          `Open interest +${p(oiChange)} contra preço +${p(priceChange)} — a alta é posição nova ` +
          `alavancada, e desfaz na mesma velocidade com que se montou.`,
      };
    }
    if (ratio <= 0.5) {
      return {
        ...base,
        kind: "oferta",
        note:
          `Preço +${p(priceChange)} com open interest quase parado (${p(oiChange)}). Compatível ` +
          `com float saindo do livro — o tipo que se sustenta enquanto a oferta ficar fora.`,
      };
    }
    return { ...base, kind: "misto", note: `Preço e open interest subiram em proporção parecida.` };
  }

  // ------------------------------------------------------------------ queda
  if (ratio >= 0.6) {
    return {
      ...base,
      kind: "desalavancagem",
      note:
        `Open interest ${p(oiChange)} contra preço ${p(priceChange)}: a maior parte da queda é ` +
        `posição sendo encerrada, com ${usd(longLiqUsd)} de comprados liquidados. Aconteceu tudo ` +
        `no perpétuo — não há por que procurar rastro na rede.`,
    };
  }

  if (ratio <= 0.25) {
    // Posição de pé e quase ninguém liquidado. Não sumiu dinheiro do
    // perpétuo nem apareceu moeda para vender: sumiu a COMPRA.
    if (forcedShare < 0.02) {
      return {
        ...base,
        kind: "livro vazio",
        note:
          `O preço caiu ${p(priceChange)} com o open interest praticamente intacto (${p(oiChange)}) ` +
          `e só ${usd(longLiqUsd)} de comprados liquidados — ${(forcedShare * 100).toFixed(1)}% do ` +
          `open interest. Ninguém foi liquidado e ninguém encerrou posição: o que sumiu foi a compra. ` +
          `É a queda de quem subiu por squeeze e ficou sem vendidos para espremer.`,
      };
    }
    return {
      ...base,
      kind: "distribuicao",
      note:
        `Preço ${p(priceChange)} com o open interest de pé (${p(oiChange)}). As posições não foram ` +
        `desfeitas, então a venda veio de moeda de verdade — e isso aparece no saldo das corretoras ` +
        `na rede. Vale conferir de onde ela veio.`,
    };
  }

  return {
    ...base,
    kind: "misto",
    note: `Parte posição encerrada, parte venda à vista: open interest ${p(oiChange)} contra preço ${p(priceChange)}.`,
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
