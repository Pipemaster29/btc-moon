/**
 * O mercado de perpétuo agora, e não ontem.
 *
 * O Binance Data Vision só publica o arquivo de um dia depois que o dia fecha.
 * Isso deixa um buraco de até 24 horas em que o painel inteiro está lendo
 * história e não o presente — e é exatamente dentro desse buraco que os
 * movimentos acontecem. A BTW subiu 60% e caiu 50% num único dia sem que nada
 * disso existisse para o sistema.
 *
 * A API pública da Gate cobre o buraco: sem chave, sem bloqueio por região, e
 * com uma coisa que a Binance não publica em arquivo nenhum — o VALOR
 * LIQUIDADO de cada lado, a cada cinco minutos. Saber que US$ 380 mil de
 * vendidos foram liquidados durante a alta e só US$ 37 mil de comprados durante
 * a queda é a diferença entre "a moeda foi distribuída" e "acabou o combustível
 * do squeeze".
 *
 * A ressalva honesta: a Gate é uma praça pequena. O open interest dela na BTW é
 * ~9 milhões de moedas contra ~262 milhões na Binance. Os NÍVEIS não são
 * comparáveis; a ESTRUTURA — quem está de que lado, quem está sendo liquidado,
 * para onde o open interest se move — é a mesma, porque é o mesmo livro de
 * arbitragem ligando as duas. Use a Gate para direção e proporção, nunca para
 * tamanho absoluto.
 */

const BASE = "https://api.gateio.ws/api/v4/futures/usdt";

export type Interval = "5m" | "15m" | "30m" | "1h" | "4h";

export interface LiveStat {
  /** Início do período, em segundos desde a época (UTC). */
  time: number;
  price: number;
  /** Open interest em MOEDA. Em dólar não serve: numa queda de 40% o valor cai
   *  40% mesmo sem nenhuma posição ter sido encerrada. */
  openInterest: number;
  openInterestUsd: number;
  /** Valor de comprados liquidados à força no período. */
  longLiqUsd: number;
  shortLiqUsd: number;
  /** Contas compradas ÷ vendidas, por cabeça — o varejo. */
  accountRatio: number;
  /** Volume agressor comprador ÷ vendedor. */
  takerRatio: number;
  /** Posição comprada ÷ vendida das contas grandes, por tamanho. */
  whaleRatio: number;
  /** Posição comprada das contas grandes, EM MOEDA. */
  whaleLong: number;
  whaleShort: number;
  /** whaleLong − whaleShort: o que elas realmente carregam. */
  whaleNet: number;
}

/** BTWUSDT → BTW_USDT. */
export function gateContract(symbol: string): string {
  const upper = symbol.toUpperCase();
  return upper.endsWith("USDT") ? `${upper.slice(0, -4)}_USDT` : upper;
}

interface RawStat {
  time: number;
  mark_price: number;
  open_interest: number;
  open_interest_usd: number;
  long_liq_usd: number;
  short_liq_usd: number;
  lsr_account: number;
  lsr_taker: number;
  top_lsr_size: number;
  top_long_size: number;
  top_short_size: number;
}

/**
 * As últimas `limit` leituras do símbolo, da mais antiga para a mais recente.
 *
 * Devolve lista vazia quando a Gate não lista o contrato ou a rede falha — o
 * painel continua valendo pelo histórico do Data Vision, só perde o dia de hoje.
 */
export async function liveStats(
  symbol: string,
  interval: Interval = "1h",
  limit = 100,
): Promise<LiveStat[]> {
  const url =
    `${BASE}/contract_stats?contract=${gateContract(symbol)}` +
    `&interval=${interval}&limit=${Math.min(limit, 100)}`;

  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15_000),
      // Uma leitura a cada 5 minutos é a granularidade da fonte; cachear por
      // dois minutos não perde nada e evita bater na API a cada visita.
      next: { revalidate: 120 },
    });
    if (!res.ok) return [];

    const raw = (await res.json()) as RawStat[];
    if (!Array.isArray(raw)) return [];

    return raw
      .map((r) => {
        const price = Number(r.mark_price);
        const usd = Number(r.open_interest_usd);
        const moedas = price > 0 ? usd / price : 0;
        // As posições das contas grandes vêm em CONTRATOS, e o multiplicador
        // muda por par. Ele sai da própria resposta: moedas ÷ contratos.
        const mult = r.open_interest > 0 ? moedas / Number(r.open_interest) : 0;
        const whaleLong = Number(r.top_long_size) * mult || 0;
        const whaleShort = Number(r.top_short_size) * mult || 0;
        return {
          time: Number(r.time),
          price,
          // Vem em contratos, e o multiplicador varia por par. Dividir o valor
          // pelo preço dá a contagem em moeda sem depender do multiplicador.
          openInterest: moedas,
          openInterestUsd: usd,
          longLiqUsd: Number(r.long_liq_usd) || 0,
          shortLiqUsd: Number(r.short_liq_usd) || 0,
          accountRatio: Number(r.lsr_account) || 0,
          takerRatio: Number(r.lsr_taker) || 0,
          whaleRatio: Number(r.top_lsr_size) || 0,
          whaleLong,
          whaleShort,
          whaleNet: whaleLong - whaleShort,
        };
      })
      .filter((s) => Number.isFinite(s.time) && s.price > 0 && s.openInterest > 0)
      .sort((a, b) => a.time - b.time);
  } catch {
    return [];
  }
}
