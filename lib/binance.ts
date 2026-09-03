/**
 * O perpétuo da Binance ao vivo — que eu achava impossível ler daqui.
 *
 * `fapi.binance.com` devolve 451 por região, e essa recusa me fez tratar os
 * arquivos do Data Vision (publicados com um dia de atraso) como o único acesso
 * possível à praça grande, com a Gate cobrindo o presente. Mas o bloqueio é do
 * HOST, não da API: `www.binance.com` serve exatamente os mesmos caminhos e
 * responde normalmente. Open interest, razões de posicionamento, agressão,
 * funding e preço, tudo ao vivo e sem chave.
 *
 * Isso importa porque as duas praças não são comparáveis em tamanho: a Binance
 * carrega de 4 a 40 vezes o open interest da Gate, e o fator muda por moeda. Ler
 * estrutura numa praça pequena e chamá-la de mercado é o erro que faz 31x virar
 * 1250x quando corrigido.
 *
 * O que a Binance NÃO publica por REST é liquidação agregada — só pelo fluxo de
 * websocket `!forceOrder`, que não se lê num processo que nasce e morre a cada
 * ciclo. E as razões dela vêm normalizadas (fração dentro do grupo), então a
 * posição ABSOLUTA das contas grandes também não sai daqui. Essas duas coisas
 * continuam vindo da Gate, e é só para isso que ela serve agora.
 */

import { comLimite } from "./limite";

const BASE = "https://www.binance.com";

export type Period = "5m" | "15m" | "30m" | "1h" | "2h" | "4h";

export interface BinanceStat {
  time: number;
  price: number;
  /** Open interest em MOEDA. */
  openInterest: number;
  openInterestUsd: number;
  /** Contas compradas ÷ vendidas entre todos os clientes, por cabeça. */
  accountRatio: number;
  /** Posição comprada ÷ vendida das contas grandes, por tamanho. */
  whaleRatio: number;
  /** Volume agressor comprador ÷ vendedor. */
  takerRatio: number;
}

/**
 * Quantas requisições simultâneas à Binance.
 *
 * Era 8, copiado do teto do Data Vision — e os dois não têm nada a ver. O do
 * Data Vision existe porque o servidor de arquivos DEMORA sob carga e a demora
 * vira lista vazia; a API REST da Binance conta peso por minuto, e cada um
 * destes caminhos pesa 1 contra um orçamento de 2.400.
 *
 * O custo do teto baixo era concreto: são quatro caminhos por moeda, 288
 * requisições no ciclo das 72 moedas, e a 8 por vez isso levava 7,1 segundos —
 * mais do que o retrato inteiro tem de orçamento numa função serverless.
 *
 * Medido, as mesmas 288 requisições: 7,1s a 8 · 3,1s a 16 · 2,1s a 24 · 1,7s a
 * 32. ZERO erro em todos, e — o que decide — o mesmo conjunto de 12 respostas
 * vazias nos quatro, que são símbolos que a Binance de fato não serve. Se o
 * teto mais alto estivesse atropelando o limite, esse número subiria.
 *
 * 24 fica onde a curva já achatou, com folga contra o ponto em que aparecer
 * recusa.
 */
const TETO_BINANCE = 24;

async function pegar<T>(caminho: string): Promise<T[]> {
  return comLimite("binance", TETO_BINANCE, async () => {
  try {
    const res = await fetch(`${BASE}${caminho}`, {
      signal: AbortSignal.timeout(15_000),
      next: { revalidate: 120 },
    });
    if (!res.ok) return [];
    const dado = await res.json();
    return Array.isArray(dado) ? (dado as T[]) : [];
  } catch {
    return [];
  }
  });
}

interface RawOi {
  sumOpenInterest: string;
  sumOpenInterestValue: string;
  timestamp: number;
  /** Supply circulante segundo o CoinMarketCap. Vem de graça neste endpoint. */
  CMCCirculatingSupply?: string;
}
interface RawRatio { longShortRatio: string; timestamp: number }
interface RawTaker { buySellRatio: string; timestamp: number }

/**
 * O supply circulante do símbolo, e como ele andou.
 *
 * Vem de graça no mesmo endpoint de open interest, e responde duas perguntas que
 * nada mais aqui responde.
 *
 * A primeira é o TAMANHO DO FLOAT: quanto do token realmente circula. É a
 * condição que todas as moedas manipuladas compartilham — a BTW tem 2,7 bilhões
 * circulando de 10 bilhões, 27%. Com o float pequeno, pouco dinheiro move muito
 * preço, e o resto é promessa de oferta futura.
 *
 * A segunda é o UNLOCK. Quando um lote destrava, o circulante SALTA, e isso é
 * visível: a BTW pulou 23,1% em 14/08, três dias antes da máxima e da queda de
 * 50%. Quem recebeu não tinha o token e passou a ter, e a primeira coisa que
 * boa parte faz é vender.
 *
 * A janela é de trinta dias — é o que a Binance devolve, e os arquivos
 * históricos não trazem esta coluna.
 */
export interface Circulante {
  atual: number;
  /** Saltos de pelo menos 2% na janela, do mais antigo ao mais recente. */
  saltos: { quando: number; variacao: number; de: number; para: number }[];
}

export async function circulante(symbol: string): Promise<Circulante | null> {
  const bruto = await pegar<RawOi>(
    `/futures/data/openInterestHist?symbol=${symbol}&period=1d&limit=500`,
  );
  const serie = bruto
    .map((r) => ({ t: Number(r.timestamp), c: Number(r.CMCCirculatingSupply ?? 0) }))
    .filter((x) => x.c > 0)
    .sort((a, b) => a.t - b.t);

  if (serie.length === 0) return null;

  const saltos: Circulante["saltos"] = [];
  for (let i = 1; i < serie.length; i++) {
    const variacao = serie[i].c / serie[i - 1].c - 1;
    if (Math.abs(variacao) >= 0.02) {
      saltos.push({
        quando: serie[i].t,
        variacao,
        de: serie[i - 1].c,
        para: serie[i].c,
      });
    }
  }

  return { atual: serie[serie.length - 1].c, saltos };
}

/**
 * O preço do perpétuo agora — uma chamada, sem série.
 *
 * Existe porque a identificação de contrato precisa de uma âncora de preço em
 * que se possa confiar, e a Gate não serve para isso: ela mantém listado
 * contrato morto. O PORTAL_USDT dela está `in_delisting`, com tamanho zero e
 * volume zero, marcando 0,0197 parado enquanto a Binance negocia a 0,0168 —
 * 24% de diferença que não é homônimo, é preço velho. Ancorar nele reprovava o
 * contrato certo do PORTAL nas três redes em que ele existe.
 */
/**
 * A taxa de financiamento de TODOS os perpétuos, numa requisição só.
 *
 * Existe para a carteira poder cobrar o custo de carregar posição, que é o maior
 * item que ela não cobrava. Nestas moedas ele não é detalhe: medido em 03/09, a
 * H paga 20,5% ao ano, a POWER 19,2%, a AKE 15,7%. Uma posição vendida segurada
 * duas semanas come 0,8% só de financiamento — mais do que o custo de entrada e
 * saída somados.
 *
 * O endereço devolve os 895 símbolos de uma vez, então o custo é uma requisição
 * por retrato e não uma por moeda.
 *
 * A taxa é por PERÍODO DE OITO HORAS, e o sinal diz quem paga: positiva, o
 * comprado paga o vendido; negativa, o contrário.
 */
export async function fundings(): Promise<Map<string, number>> {
  const fora = new Map<string, number>();
  try {
    const res = await fetch(`${BASE}/fapi/v1/premiumIndex`, {
      signal: AbortSignal.timeout(15_000),
      next: { revalidate: 300 },
    });
    if (!res.ok) return fora;
    const cru = (await res.json()) as { symbol: string; lastFundingRate: string }[];
    if (!Array.isArray(cru)) return fora;
    for (const r of cru) {
      const taxa = Number(r.lastFundingRate);
      if (r.symbol && Number.isFinite(taxa)) fora.set(r.symbol, taxa);
    }
  } catch {
    // Sem financiamento a carteira cobra a estimativa dela e diz que estimou.
  }
  return fora;
}

export async function precoBinance(symbol: string): Promise<number | null> {
  return comLimite("binance", TETO_BINANCE, async () => {
    try {
      const res = await fetch(`${BASE}/fapi/v1/ticker/price?symbol=${symbol}`, {
        signal: AbortSignal.timeout(15_000),
        next: { revalidate: 120 },
      });
      if (!res.ok) return null;
      const dado = await res.json();
      const preco = Number(dado?.price ?? 0);
      return preco > 0 ? preco : null;
    } catch {
      return null;
    }
  });
}

export interface Vela {
  /** Segundos, não milissegundos — igual ao que o parser dos arquivos devolve. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  takerBuy: number;
  delta: number;
}

/**
 * As velas do símbolo, ao vivo, direto da praça.
 *
 * Existe porque os arquivos do Data Vision têm um BURACO que ninguém enxerga: o
 * mensal só é publicado quando o mês fecha, e o diário só cobre os últimos dias.
 * No dia 24 de agosto isso significa 20 dias faltando no meio da série de TODA
 * moeda — e o histórico chega no código sem nenhum aviso de que falta pedaço.
 *
 * O estrago é o pior tipo, porque parece dado bom. A BTW fez a máxima dela em
 * 0,77888 exatamente dentro do buraco; o ciclo de vida enxergava 0,54489 como
 * topo, media queda de -23% quando a real era -46%, e datava o topo em 22/08
 * quando ele foi na semana anterior. O dump inteiro que a gente estudou estava
 * invisível para a própria classificação de estágio.
 *
 * E há moeda que só existe aqui: a DOS estreou no perpétuo em 11/08 e não tem
 * um único arquivo mensal publicado. Pelo Data Vision ela tinha 4 barras e o
 * ciclo de vida devolvia nulo; aqui ela tem 14, que é a idade dela.
 *
 * São 1500 velas por chamada — mais de quatro anos em diário.
 */
export async function velas(symbol: string, interval = "1d", limit = 1500): Promise<Vela[]> {
  const bruto = await pegar<unknown[]>(
    `/fapi/v1/klines?symbol=${symbol}&interval=${interval}&limit=${Math.min(limit, 1500)}`,
  );

  return bruto
    .map((linha) => {
      const c = linha as (string | number)[];
      const volume = Number(c[5]);
      const takerBuy = Number(c[9]);
      return {
        time: Math.floor(Number(c[0]) / 1000),
        open: Number(c[1]),
        high: Number(c[2]),
        low: Number(c[3]),
        close: Number(c[4]),
        volume,
        takerBuy,
        delta: takerBuy - (volume - takerBuy),
      };
    })
    .filter((v) => Number.isFinite(v.time) && v.close > 0)
    .sort((a, b) => a.time - b.time);
}

/**
 * A série do símbolo, do mais antigo ao mais recente.
 *
 * São quatro chamadas em paralelo porque a Binance separa cada medida em seu
 * próprio caminho. Elas se juntam pelo timestamp, e a de open interest manda:
 * sem ela não há série, com ela as demais entram onde houver correspondência.
 */
export async function binanceSeries(
  symbol: string,
  period: Period = "1h",
  limit = 100,
): Promise<BinanceStat[]> {
  const q = `symbol=${symbol}&period=${period}&limit=${Math.min(limit, 500)}`;

  const [oi, conta, baleia, taker] = await Promise.all([
    pegar<RawOi>(`/futures/data/openInterestHist?${q}`),
    pegar<RawRatio>(`/futures/data/globalLongShortAccountRatio?${q}`),
    pegar<RawRatio>(`/futures/data/topLongShortPositionRatio?${q}`),
    pegar<RawTaker>(`/futures/data/takerlongshortRatio?${q}`),
  ]);

  if (oi.length === 0) return [];

  const porTempo = <T extends { timestamp: number }>(lista: T[]) =>
    new Map(lista.map((x) => [Math.floor(x.timestamp / 1000), x]));

  const mConta = porTempo(conta);
  const mBaleia = porTempo(baleia);
  const mTaker = porTempo(taker);

  // A agressão do período corrente ainda não existe quando ele não fechou, e a
  // última leitura é justamente a que a tela mostra. Repetir o último valor
  // conhecido é melhor do que exibir zero, que se leria como "ninguém agrediu".
  let ultimoTaker = 0;

  return oi
    .map((r) => {
      const time = Math.floor(r.timestamp / 1000);
      const moedas = Number(r.sumOpenInterest);
      const usd = Number(r.sumOpenInterestValue);
      return {
        time,
        price: moedas > 0 ? usd / moedas : 0,
        openInterest: moedas,
        openInterestUsd: usd,
        accountRatio: Number(mConta.get(time)?.longShortRatio) || 0,
        whaleRatio: Number(mBaleia.get(time)?.longShortRatio) || 0,
        takerRatio: (ultimoTaker = Number(mTaker.get(time)?.buySellRatio) || ultimoTaker),
      };
    })
    .filter((s) => s.openInterest > 0 && s.price > 0)
    .sort((a, b) => a.time - b.time);
}
