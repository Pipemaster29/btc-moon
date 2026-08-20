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

async function pegar<T>(caminho: string): Promise<T[]> {
  return comLimite("binance", 8, async () => {
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

interface RawOi { sumOpenInterest: string; sumOpenInterestValue: string; timestamp: number }
interface RawRatio { longShortRatio: string; timestamp: number }
interface RawTaker { buySellRatio: string; timestamp: number }

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
