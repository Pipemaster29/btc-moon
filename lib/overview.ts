/**
 * A triagem: todas as moedas vigiadas numa leitura só, barata o bastante para
 * caber numa página.
 *
 * O painel completo de uma moeda custa perto de trinta requisições — catorze
 * dias de arquivo da Binance, saldo de cada carteira, varredura de logs. Com
 * quarenta moedas isso vira mil e duzentas, e a página nunca abre. Então a
 * triagem lê só o que responde a pergunta "esta merece atenção agora?": o
 * perpétuo ao vivo da Gate e a profundidade à vista do DexScreener, duas
 * chamadas por moeda.
 *
 * O detalhe de cada uma continua existindo inteiro — só que sob demanda, em
 * /radar/[symbol], para uma moeda de cada vez.
 */

import { perpSeries } from "./perp";
import { depthOn, pairsOfToken } from "./dexscreener";
import { ATIVAS, type WatchedToken } from "./watchlist";
import { lerVida, lerVies, type Leitura, type Vida } from "./lifecycle";
import { readLiveFromStats, type MoveKind } from "./positioning";

export interface OverviewRow {
  symbol: string;
  /** Nome curto, sem o sufixo do par. */
  ticker: string;
  chain: string;
  contract: string;
  hasWallets: boolean;
  note?: string;

  price: number;
  change24h: number;
  liquidityUsd: number;
  volume24h: number;
  /** volume ÷ liquidez: pool que não gira não absorve venda. */
  turnover: number;
  fdv: number;

  openInterestUsd: number;
  /** Open interest da Binance, a praça grande. Zero quando ela não lista. */
  openInterestBinance: number;
  /** OI em dólar ÷ liquidez à vista: o quanto o preço se forma no perpétuo. */
  perpDominance: number;
  accountRatio: number;
  whaleRatio: number;

  moveKind: MoveKind | null;
  moveChange: number;
  /** Contas grandes desmontando comprado perto do topo. */
  whaleExiting: boolean;
  whaleExitShare: number;
  /** Variação do open interest em 72h — o parâmetro que passou no teste. */
  oiChange72h: number;

  /** Quanto isto merece ser olhado agora, de 0 a 100. */
  score: number;
  reasons: string[];
}

/**
 * A nota não é previsão. É ordenação: com quarenta moedas na tela, alguma
 * ordem tem de existir, e ordenar por preço ou por tamanho colocaria em cima
 * justamente as que não estão fazendo nada.
 *
 * Cada parcela vale pelo que ela antecede, não pelo que ela descreve. Por isso
 * a saída da baleia pesa mais que a variação do preço: a variação já aconteceu.
 */
function score(row: Omit<OverviewRow, "score" | "reasons">): { score: number; reasons: string[] } {
  let total = 0;
  const reasons: string[] = [];

  if (row.whaleExiting) {
    total += 35;
    reasons.push(`baleias largaram ${(row.whaleExitShare * 100).toFixed(1)}% do livro`);
  }

  if (row.moveKind === "squeeze") {
    total += 25;
    reasons.push(`alta forçada de ${(row.moveChange * 100).toFixed(0)}%`);
  } else if (row.moveKind === "alavancagem") {
    total += 20;
    reasons.push(`alta a crédito de ${(row.moveChange * 100).toFixed(0)}%`);
  } else if (row.moveKind === "distribuicao") {
    total += 20;
    reasons.push(`queda com posição de pé — alguém entregou moeda`);
  } else if (row.moveKind === "livro vazio") {
    total += 10;
    reasons.push(`queda por falta de compra`);
  }

  // Quando o perpétuo é muito maior que a pool à vista, o preço não é formado
  // por quem compra a moeda — é formado por quem aposta nela. Foi a condição
  // que fez a BTW andar 58% em nove horas com o saldo das corretoras parado.
  //
  // Os limiares foram refeitos junto com a troca da fonte do open interest. Na
  // escala da Gate a BTW media 31x e o corte alto era 20; medida na Binance ela
  // mede 1250x, e o mesmo corte marcaria praticamente a lista inteira. Os
  // valores abaixo vêm da distribuição real: 1250x na BTW, 342x no JCT, 165x no
  // BASED, depois uma queda longa até 25x na AKE e 3x na TAG.
  if (row.perpDominance >= 100) {
    total += 20;
    reasons.push(`perpétuo vale ${row.perpDominance.toFixed(0)}x a pool à vista`);
  } else if (row.perpDominance >= 25) {
    total += 10;
    reasons.push(`perpétuo vale ${row.perpDominance.toFixed(0)}x a pool`);
  }

  // Varejo de um lado e dinheiro grande do outro é a divergência que precede
  // cascata; sem extremo nenhum, o posicionamento não diz nada.
  if (row.accountRatio > 0 && row.whaleRatio > 0) {
    if (row.accountRatio > 1.5 && row.whaleRatio < 1) {
      total += 15;
      reasons.push(`varejo comprado contra dinheiro grande vendido`);
    } else if (row.accountRatio < 0.7 && row.whaleRatio > 1.2) {
      total += 15;
      reasons.push(`varejo vendido contra dinheiro grande comprado — risco de squeeze`);
    }
  }

  if (row.turnover > 0 && row.turnover < 0.05 && row.liquidityUsd > 0) {
    total += 5;
    reasons.push(`pool quase sem giro`);
  }

  return { score: Math.min(total, 100), reasons };
}

async function readOne(token: WatchedToken): Promise<OverviewRow | null> {
  const [stats, pairs] = await Promise.all([
    perpSeries(token.symbol, "1h", 100).catch(() => []),
    token.contract ? pairsOfToken(token.contract).catch(() => []) : Promise.resolve([]),
  ]);

  const depth = token.contract ? depthOn(pairs, token.chain) : null;
  const last = stats[stats.length - 1];

  // Sem perpétuo e sem pool não há o que mostrar — a moeda saiu do ar.
  if (!last && !depth) return null;

  const live = readLiveFromStats(stats);
  const price = depth?.priceUsd || last?.price || 0;
  const liquidityUsd = depth?.liquidityUsd ?? 0;
  // A praça grande manda; a Gate só cobre quem a Binance não lista. E agora vem
  // ao vivo em vez do arquivo de ontem: o bloqueio por região era do host
  // `fapi`, não da API, e `www.binance.com` serve os mesmos caminhos.
  const oiBnc = last?.oiBinanceUsd ?? 0;
  const oiUsd = oiBnc > 0 ? oiBnc : last?.openInterestUsd ?? 0;

  const base = {
    symbol: token.symbol,
    ticker: token.symbol.replace(/USDT$/, ""),
    chain: token.chain,
    contract: token.contract,
    hasWallets: token.wallets.length > 0,
    note: token.note,
    price,
    change24h: depth?.change24h ?? 0,
    liquidityUsd,
    volume24h: depth?.volume24h ?? 0,
    turnover: liquidityUsd > 0 ? (depth?.volume24h ?? 0) / liquidityUsd : 0,
    fdv: depth?.fdv ?? 0,
    openInterestUsd: oiUsd,
    openInterestBinance: oiBnc,
    perpDominance: liquidityUsd > 0 ? oiUsd / liquidityUsd : 0,
    accountRatio: last?.accountRatio ?? 0,
    whaleRatio: last?.whaleRatio ?? 0,
    moveKind: live?.move?.kind ?? null,
    moveChange: live?.move?.priceChange ?? 0,
    whaleExiting: Boolean(live?.whaleExit?.fragile),
    whaleExitShare: live?.whaleExit?.share ?? 0,
    oiChange72h: live?.oiChange72h ?? NaN,
  };

  return { ...base, ...score(base) };
}

/** A tabela inteira, já ordenada por quem merece olhar primeiro. */
/**
 * Moedas que não devolveram dado na última leitura.
 *
 * Existe porque uma moeda sumindo do painel em silêncio é indistinguível de uma
 * moeda que nunca esteve lá. Foi assim que a Chainbase desapareceu de um retrato
 * inteiro enquanto funcionava perfeitamente quando consultada sozinha — o teto
 * de concorrência conserta a causa, isto denuncia quando volta a acontecer.
 */
export const caidas: string[] = [];

export async function getOverview(): Promise<OverviewRow[]> {
  caidas.length = 0;
  const linhas = await Promise.all(
    ATIVAS.map(async (t) => {
      const r = await readOne(t).catch(() => null);
      if (!r) caidas.push(t.symbol.replace(/USDT$/, ""));
      return r;
    }),
  );
  return linhas
    .filter((r): r is OverviewRow => r !== null)
    .sort((a, b) => b.score - a.score || b.openInterestUsd - a.openInterestUsd);
}

/**
 * A triagem somada ao estágio de vida.
 *
 * Fica separada de `getOverview` porque custa outra ordem de grandeza: o
 * histórico de seis meses são dez arquivos por moeda. Quem só quer saber o que
 * está acontecendo agora não deve pagar por isso.
 */
export interface PanoramaRow extends OverviewRow {
  vida: Vida | null;
  leitura: Leitura | null;
}

export async function getPanorama(): Promise<PanoramaRow[]> {
  const linhas = await getOverview();
  const porSymbol = new Map(ATIVAS.map((t) => [t.symbol, t]));

  return Promise.all(
    linhas.map(async (row) => {
      const token = porSymbol.get(row.symbol);
      if (!token) return { ...row, vida: null, leitura: null };

      const vida = await lerVida(token, row.price).catch(() => null);
      if (!vida) return { ...row, vida: null, leitura: null };

      const leitura = lerVies(vida, {
        moveKind: row.moveKind,
        moveChange: row.moveChange,
        whaleExiting: row.whaleExiting,
        perpDominance: row.perpDominance,
        accountRatio: row.accountRatio,
        whaleRatio: row.whaleRatio,
        oiChange72h: row.oiChange72h,
      });
      return { ...row, vida, leitura };
    }),
  );
}
