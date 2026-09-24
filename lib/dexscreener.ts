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
  /**
   * A moeda consultada é a BASE desta pool — então o preço e a liquidez são
   * dela. Só `pairsOfToken` sabe dizer; na busca por nome fica indefinido.
   *
   * O endereço de um token devolve também as pools em que ele é a moeda de
   * PAGAMENTO, e nessas o `priceUsd` é o da OUTRA moeda. Medido em 23/09: das
   * 78 moedas com contrato, 35 aparecem como pagamento em alguma pool, e em
   * duas a mais funda era essa — a AIOT lia o preço da AIT (0,01846 contra
   * 0,05025 do perpétuo, 2,7 vezes, abaixo do freio de 100 vezes) e a liquidez
   * de US$ 15,3 mi em vez de 1,5 mi.
   */
  propria?: boolean;
}

interface RawPair {
  chainId?: string;
  dexId?: string;
  pairAddress?: string;
  baseToken?: { symbol?: string; address?: string };
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

/**
 * Uma chamada ao DexScreener, com nova tentativa quando a recusa for temporária.
 *
 * A insistência não é zelo: sem ela a BTW apareceu no painel com liquidez zero,
 * volume zero, FDV zero e domínio do perpétuo zero — um retrato de moeda morta
 * numa moeda com US$ 1,1 bilhão de market cap e mil negócios por dia na pool.
 * A pool sempre esteve lá; o que faltou foi a resposta, engolida por um 429 em
 * meio ao retrato de 68 moedas e devolvida como lista vazia.
 *
 * Vazio e falha PRECISAM ser coisas diferentes, e é a quarta vez que essa
 * confusão custa uma leitura errada aqui. Quando as tentativas se esgotam, esta
 * função lança — quem chama decide se marca a moeda como caída ou se segue sem
 * pool, mas ninguém mais recebe silêncio no lugar de dado.
 */
async function get(path: string): Promise<RawPair[]> {
  return comLimite("dexscreener", 6, async () => {
    let ultimoErro: unknown;

    for (let tentativa = 0; tentativa < 3; tentativa++) {
      if (tentativa > 0) {
        await new Promise((r) => setTimeout(r, 800 * 2 ** (tentativa - 1)));
      }
      try {
        const res = await fetch(`${BASE}/${path}`, {
          signal: AbortSignal.timeout(20_000),
        });
        // 429 e 5xx passam; 404 e outros 4xx são resposta definitiva.
        if (res.status !== 429 && res.status < 500 && !res.ok) {
          throw new Error(`DexScreener respondeu ${res.status}`);
        }
        if (!res.ok) {
          ultimoErro = new Error(`DexScreener respondeu ${res.status}`);
          continue;
        }
        const body = (await res.json()) as { pairs?: RawPair[] | null };
        return body.pairs ?? [];
      } catch (e) {
        ultimoErro = e;
      }
    }

    throw ultimoErro instanceof Error ? ultimoErro : new Error("DexScreener não respondeu");
  });
}

/** Todas as pools de um token, da mais líquida para a menos. */
export async function pairsOfToken(address: string): Promise<Pair[]> {
  const alvo = address.toLowerCase();
  // Todas continuam na lista: o saldo do token numa pool em que ele é o
  // pagamento é saldo de verdade, e o `lib/motor.ts` conta essas também.
  const pairs = (await get(`tokens/${address}`)).map((raw) => ({
    ...normalize(raw),
    propria: raw.baseToken?.address?.toLowerCase() === alvo,
  }));
  return pairs.sort((a, b) => b.liquidityUsd - a.liquidityUsd);
}

/** Busca por símbolo, para descobrir o contrato de uma moeda pelo nome. */
export async function searchPairs(query: string): Promise<Pair[]> {
  const pairs = (await get(`search?q=${encodeURIComponent(query)}`)).map(normalize);
  return pairs.sort((a, b) => b.liquidityUsd - a.liquidityUsd);
}

/**
 * O preço de referência de uma moeda que tem pool e perpétuo: a pool quando ela
 * é a mesma moeda que o perpétuo, o perpétuo quando não há pool ou quando ela
 * sai de 0,8–1,25 dele.
 *
 * A faixa é a da âncora da carteira ("razão de 1,4 não é base de mercado, é
 * outra moeda"), e a medição que a sustenta está em `lib/overview.ts`: das 75
 * moedas com pool e perpétuo em 24/09, 73 ficam a menos de 2% e a mais longe a
 * 10%. Fora dela ficaram a pool rasa da HEI (1,6–2x), a pool parada da CAP
 * (1,45x) e a pool alheia da AIOT (0,37x) — todas lidas como preço até aqui.
 *
 * `precoPerp` tem de ser o de AGORA (o último negócio), não o fechamento de
 * uma hora atrás: num pump, a pool certa sairia da faixa contra um perpétuo
 * velho.
 */
export function precoArbitrado(
  precoPool: number | null | undefined,
  precoPerp: number | null | undefined,
): { preco: number; fonte: "pool" | "perpétuo" | "nenhum"; razao: number | null } {
  const pool = precoPool != null && precoPool > 0 && Number.isFinite(precoPool) ? precoPool : 0;
  const perp = precoPerp != null && precoPerp > 0 && Number.isFinite(precoPerp) ? precoPerp : 0;
  const razao = pool > 0 && perp > 0 ? pool / perp : null;
  if (pool > 0 && (razao === null || (razao >= 0.8 && razao <= 1.25))) return { preco: pool, fonte: "pool", razao };
  if (perp > 0) return { preco: perp, fonte: "perpétuo", razao };
  return { preco: 0, fonte: "nenhum", razao };
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
  // Só as pools em que a moeda é a base: nas outras o preço é de outra moeda
  // (ver `propria`). Indefinido passa, que é a busca por nome de sempre.
  const local = pairs.filter((p) => p.chain === chain && p.liquidityUsd > 0 && p.propria !== false);
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
