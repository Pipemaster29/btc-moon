/**
 * Busca e descompacta os arquivos públicos do Binance Data Vision.
 *
 * A descompactação é em JavaScript puro em vez de chamar o binário `unzip`,
 * porque o mesmo código roda no servidor da web, onde não existe binário
 * nenhum. O ganho de lado: os scripts deixam de depender de um programa
 * externo estar instalado.
 *
 * Nenhum destes arquivos exige chave, e — ao contrário da API REST da Binance —
 * eles não são bloqueados por região.
 */

import { strFromU8, unzipSync } from "fflate";

const KLINE_MONTHLY = "https://data.binance.vision/data/futures/um/monthly/klines";
const KLINE_DAILY = "https://data.binance.vision/data/futures/um/daily/klines";
const METRICS_DAILY = "https://data.binance.vision/data/futures/um/daily/metrics";

/**
 * Teto de requisições simultâneas ao Data Vision.
 *
 * Sem ele, quarenta e duas moedas pedindo dez arquivos cada disparam 420
 * requisições ao mesmo tempo. O servidor não recusa com erro: ele demora, e o
 * `AbortSignal.timeout` transforma a demora em `null` — que quem chama lê como
 * "esse dia não existe". O sintoma foi dezesseis moedas aparecendo sem
 * histórico nenhum, tendo cada uma cento e cinquenta dias publicados.
 *
 * É o modo de falha mais traiçoeiro possível: silencioso, intermitente, e
 * indistinguível de dado ausente de verdade.
 */
const TETO = 8;
let emVoo = 0;
const fila: (() => void)[] = [];

async function comVaga<T>(tarefa: () => Promise<T>): Promise<T> {
  if (emVoo >= TETO) await new Promise<void>((r) => fila.push(r));
  emVoo++;
  try {
    return await tarefa();
  } finally {
    emVoo--;
    fila.shift()?.();
  }
}

export function monthlyKlineUrl(symbol: string, interval: string, month: string): string {
  return `${KLINE_MONTHLY}/${symbol}/${interval}/${symbol}-${interval}-${month}.zip`;
}

/**
 * Klines de um único dia.
 *
 * O arquivo mensal só é publicado depois que o mês fecha, então acompanhar o
 * presente exige os diários — sem eles, todo dia 1º o painel fica cego até o
 * mês seguinte.
 */
export function dailyKlineUrl(symbol: string, interval: string, date: string): string {
  return `${KLINE_DAILY}/${symbol}/${interval}/${symbol}-${interval}-${date}.zip`;
}

export function metricsUrl(symbol: string, date: string): string {
  return `${METRICS_DAILY}/${symbol}/${symbol}-metrics-${date}.zip`;
}

/**
 * Baixa um zip e devolve o CSV de dentro.
 *
 * Devolve nulo em duas situações que significam coisas diferentes e ambas são
 * normais: 404 quando o arquivo daquele dia não existe (símbolo novo, dia ainda
 * não publicado), e falha de rede depois das tentativas. Quem chama trata as
 * duas como "não tenho esse dia" — o que importa é que uma lacuna não pode
 * derrubar o painel inteiro.
 */
export async function fetchCsv(url: string, attempts = 3): Promise<string | null> {
  return comVaga(() => baixar(url, attempts));
}

async function baixar(url: string, attempts: number): Promise<string | null> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(20_000),
        // Os arquivos são imutáveis depois de publicados, então cachear por uma
        // hora não corre risco de servir dado velho.
        next: { revalidate: 3600 },
      });

      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const buffer = new Uint8Array(await res.arrayBuffer());
      if (buffer.length < 100) throw new Error("resposta truncada");

      const files = unzipSync(buffer);
      const name = Object.keys(files)[0];
      if (!name) throw new Error("zip vazio");

      return strFromU8(files[name]);
    } catch {
      if (attempt === attempts) return null;
      await new Promise((r) => setTimeout(r, 300 * attempt));
    }
  }
  return null;
}

/** Os últimos N dias no formato AAAA-MM-DD, do mais antigo ao mais recente. */
export function recentDays(count: number): string[] {
  const out: string[] = [];
  const cursor = new Date();
  cursor.setUTCDate(cursor.getUTCDate() - count);
  for (let i = 0; i < count; i++) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}
