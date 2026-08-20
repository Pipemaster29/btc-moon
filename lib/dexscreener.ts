/**
 * Preço e liquidez de mercado à vista, pela API pública do DexScreener.
 *
 * Sem chave, sem bloqueio por região — o que resolve o mesmo problema que a
 * Bitstamp resolveu para o bitcoin. Aqui interessa menos o preço e mais a
 * LIQUIDEZ: é comparando o tamanho das posições com a profundidade das pools
 * que se enxerga se uma moeda pode ou não ser vendida pelo preço da tela.
 */

import { comLimite } from "./limite";

const BASE = "https://api.dexscreener.com/latest/dex";

export interface Pair {
  chain: string;
  dex: string;
  address: string;
  baseSymbol: string;
  quoteSymbol: string;
  priceUsd: number;
  /** Dólares dos dois lados da pool somados. */
  liquidityUsd: number;
  volume24h: number;
  buys24h: number;
  sells24h: number;
  change24h: number;
  /** Valor de todo o supply ao preço atual. */
  fdv: number;
  marketCap: number;
}

interface RawPair {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: { symbol?: string };
  quoteToken?: { symbol?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  volume?: { h24?: number };
  txns?: { h24?: { buys?: number; sells?: number } };
  priceChange?: { h24?: number };
  fdv?: number;
  marketCap?: number;
}

function normalize(raw: RawPair): Pair {
  return {
    chain: raw.chainId ?? "",
    dex: raw.dexId ?? "",
    address: raw.pairAddress ?? "",
    baseSymbol: raw.baseToken?.symbol ?? "",
    quoteSymbol: raw.quoteToken?.symbol ?? "",
    priceUsd: Number(raw.priceUsd ?? 0),
    liquidityUsd: raw.liquidity?.usd ?? 0,
    volume24h: raw.volume?.h24 ?? 0,
    buys24h: raw.txns?.h24?.buys ?? 0,
    sells24h: raw.txns?.h24?.sells ?? 0,
    change24h: raw.priceChange?.h24 ?? 0,
    fdv: raw.fdv ?? 0,
    marketCap: raw.marketCap ?? 0,
  };
}

async function get(path: string): Promise<RawPair[]> {
  return comLimite("dexscreener", 6, async () => {
    const res = await fetch(`${BASE}/${path}`, {
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) throw new Error(`DexScreener respondeu ${res.status}`);
    const body = (await res.json()) as { pairs?: RawPair[] | null };
    return body.pairs ?? [];
  });
}

/** Todas as pools de um token, da mais líquida para a menos. */
export async function pairsOfToken(address: string): Promise<Pair[]> {
  const pairs = (await get(`tokens/${address}`)).map(normalize);
  return pairs.sort((a, b) => b.liquidityUsd - a.liquidityUsd);
}

/** Busca por símbolo, para descobrir o contrato de uma moeda pelo nome. */
export async function searchPairs(query: string): Promise<Pair[]> {
  const pairs = (await get(`search?q=${encodeURIComponent(query)}`)).map(normalize);
  return pairs.sort((a, b) => b.liquidityUsd - a.liquidityUsd);
}

export interface TokenDepth {
  priceUsd: number;
  /** Variação de 24h da pool mais funda, em fração. */
  change24h: number;
  /** Liquidez somada de todas as pools da rede. */
  liquidityUsd: number;
  volume24h: number;
  fdv: number;
  marketCap: number;
  pairs: number;
}

/**
 * Consolida as pools de uma rede em uma única leitura de profundidade.
 *
 * O preço vem da pool mais líquida, e não da média: pools rasas têm preço
 * facilmente empurrado por poucos dólares, e a média deixaria esse ruído entrar.
 */
export function depthOn(pairs: Pair[], chain: string): TokenDepth | null {
  const local = pairs.filter((p) => p.chain === chain && p.liquidityUsd > 0);
  if (local.length === 0) return null;

  const deepest = local[0];
  return {
    change24h: deepest.change24h / 100,
    priceUsd: deepest.priceUsd,
    liquidityUsd: local.reduce((sum, p) => sum + p.liquidityUsd, 0),
    volume24h: local.reduce((sum, p) => sum + p.volume24h, 0),
    fdv: deepest.fdv,
    marketCap: deepest.marketCap,
    pairs: local.length,
  };
}
