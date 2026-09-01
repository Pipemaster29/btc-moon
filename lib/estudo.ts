/**
 * O estudo de cada moeda — como ELA se move, e não como o grupo se move.
 *
 * Tudo neste projeto até aqui mede o conjunto: os estágios foram calibrados
 * sobre 12.060 observações de 64 moedas juntas, e o viés sai de uma régua só
 * para todas. Isso responde "o que costuma acontecer com moeda manipulada" e
 * não responde "o que costuma acontecer com ESTA".
 *
 * E a diferença aparece assim que se olha. A BULLA está 37% abaixo de uma máxima
 * de 169 dias e subiu 368% desde o fundo; o JCT está 79% abaixo e subiu 2%. A
 * régua do grupo dá o mesmo estágio às duas.
 *
 * ---------------------------------------------------------------------------
 * O QUE DÁ PARA APRENDER DE UMA MOEDA SÓ, e o que não dá.
 *
 * A tentação é treinar um modelo por moeda. Não dá: são de 150 a 500 dias de
 * histórico por moeda, e qualquer coisa com mais de dois parâmetros decora a
 * amostra. O que cabe é MEDIR poucas coisas com disciplina, e dizer quando a
 * medida não sustenta afirmação.
 *
 * As três que cabem:
 *
 *   MEMÓRIA     o retorno de amanhã tem relação com o de hoje? Autocorrelação
 *               por defasagem. É a pergunta mais útil que existe sobre uma série
 *               de preço, porque separa moeda que CONTINUA de moeda que DEVOLVE —
 *               e as duas pedem operações opostas na mesma leitura de estágio.
 *   ASSIMETRIA  a cauda de alta e a de queda não têm o mesmo tamanho. O projeto
 *               já usa isso no grupo (5,6 para 1 nas pequenas e derretidas);
 *               por moeda, é o que diz se comprar a cauda faz sentido NELA.
 *   REGIME      volatilidade e amplitude típicas, que dizem o tamanho normal de
 *               um movimento. Sem isso "caiu 15%" não significa nada: é rotina
 *               numa e é evento em outra.
 *
 * Cada uma vem com o número de observações e com o corte de significância já
 * corrigido pelo número de defasagens testadas. Medida sem esse par não é
 * medida — é anedota com decimal.
 */

import { velas, type Vela } from "./binance";
import { velasGate } from "./gate";

/** Defasagens testadas na memória, em dias. */
const LAGS = [1, 2, 3, 5, 7, 10, 14, 21];

/** Abaixo disto não há amostra para afirmar coisa alguma sobre a moeda. */
const MINIMO_DIAS = 60;

export interface Memoria {
  lag: number;
  /** Correlação entre o retorno de t e o de t+lag. */
  r: number;
  n: number;
  /** |r| dividido pelo erro padrão: quantos desvios do acaso. */
  sigmas: number;
}

export type Perfil = "devolve" | "continua" | "sem memória";

export interface Estudo {
  symbol: string;
  ticker: string;
  dias: number;
  de: string;
  ate: string;

  /** Desvio padrão dos retornos diários, em fração. */
  volDiaria: number;
  /** A mesma, anualizada e em pontos percentuais — a escala que se lê. */
  volAnual: number;
  /** Maior alta e maior queda de um dia na amostra. */
  maiorAlta: number;
  maiorQueda: number;

  memoria: Memoria[];
  perfil: Perfil;
  /** A defasagem com o maior |r|, que é a que sustenta o perfil. */
  melhorLag: Memoria | null;

  /** Fração das janelas de 7 dias que subiram mais de 20%. */
  sobe20: number;
  /** Fração que caiu mais de 20%. */
  cai20: number;
  /** sobe20 ÷ cai20: acima de 1 a cauda é a favor de quem compra. */
  assimetria: number;
  janelas7d: number;

  veredito: string;
  medidoEm: number;
}

// ------------------------------------------------------------------ estatística

function correlacao(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const ma = a.slice(0, n).reduce((s, x) => s + x, 0) / n;
  const mb = b.slice(0, n).reduce((s, x) => s + x, 0) / n;
  let num = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    va += x * x;
    vb += y * y;
  }
  return va === 0 || vb === 0 ? 0 : num / Math.sqrt(va * vb);
}

/**
 * O corte de significância, já corrigido pelas defasagens testadas.
 *
 * O erro padrão de uma autocorrelação sob a hipótese de nada é 1/√n. Testando
 * oito defasagens, o corte de 5% vira 5%/8 = 0,6%, que é 2,73 desvios. Sem essa
 * correção, uma em cada vinte defasagens passa por acaso — e são oito por moeda
 * vezes setenta moedas, ou seja, vinte e oito falsos positivos garantidos.
 */
const SIGMAS_MINIMO = 2.73;

// ---------------------------------------------------------------------- leitura

/** O histórico diário mais longo que existir para o símbolo. */
async function historico(symbol: string): Promise<Vela[]> {
  const binance = await velas(symbol, "1d", 1500).catch(() => []);
  if (binance.length >= MINIMO_DIAS) return binance;
  // Moeda que só a Gate lista fica sem estudo nenhum se não tentarmos aqui.
  const gate = await velasGate(symbol, 1000).catch(() => []);
  return gate.length > binance.length ? gate : binance;
}

export async function estudar(symbol: string): Promise<Estudo | null> {
  const barras = await historico(symbol);
  if (barras.length < MINIMO_DIAS) return null;

  const fechamentos = barras.map((b) => b.close).filter((c) => c > 0);
  if (fechamentos.length < MINIMO_DIAS) return null;

  // Retorno logarítmico: é o que soma ao longo do tempo e o que a
  // autocorrelação pressupõe. Retorno simples enviesa a medida em cauda grossa,
  // e cauda grossa é a única coisa que estas moedas têm de sobra.
  const r: number[] = [];
  for (let i = 1; i < fechamentos.length; i++) r.push(Math.log(fechamentos[i] / fechamentos[i - 1]));

  const media = r.reduce((s, x) => s + x, 0) / r.length;
  const volDiaria = Math.sqrt(r.reduce((s, x) => s + (x - media) ** 2, 0) / r.length);

  // ------------------------------------------------------------------ memória
  const memoria: Memoria[] = LAGS.filter((lag) => r.length - lag >= 30).map((lag) => {
    const a = r.slice(0, r.length - lag);
    const b = r.slice(lag);
    const rho = correlacao(a, b);
    const n = a.length;
    return { lag, r: rho, n, sigmas: Math.abs(rho) * Math.sqrt(n) };
  });

  const melhorLag = memoria.length
    ? memoria.reduce((x, y) => (Math.abs(y.r) > Math.abs(x.r) ? y : x))
    : null;

  const perfil: Perfil =
    melhorLag && melhorLag.sigmas >= SIGMAS_MINIMO
      ? melhorLag.r < 0
        ? "devolve"
        : "continua"
      : "sem memória";

  // ----------------------------------------------------------------- assimetria
  // Janelas de sete dias sobrepostas: a amostra é curta e usar só janelas
  // disjuntas jogaria fora seis de cada sete observações. Sobrepostas elas não
  // são independentes, e é por isso que a assimetria entra como descrição e
  // nunca como teste de significância.
  let sobe = 0;
  let cai = 0;
  let janelas = 0;
  for (let i = 7; i < fechamentos.length; i++) {
    const v = fechamentos[i] / fechamentos[i - 7] - 1;
    janelas++;
    if (v >= 0.2) sobe++;
    if (v <= -0.2) cai++;
  }

  const sobe20 = janelas ? sobe / janelas : 0;
  const cai20 = janelas ? cai / janelas : 0;

  const ticker = symbol.replace(/USDT$/, "");
  const pct = (v: number) => `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(1)}%`;

  const veredito =
    perfil === "devolve"
      ? `Devolve: o retorno de um dia se inverte ${melhorLag!.lag} dia(s) depois ` +
        `(r = ${melhorLag!.r.toFixed(3)}, ${melhorLag!.sigmas.toFixed(1)}σ em ${melhorLag!.n} dias). ` +
        `Comprar força e vender fraqueza é operar contra ela.`
      : perfil === "continua"
        ? `Continua: o movimento se estende por ${melhorLag!.lag} dia(s) ` +
          `(r = ${melhorLag!.r.toFixed(3)}, ${melhorLag!.sigmas.toFixed(1)}σ em ${melhorLag!.n} dias). ` +
          `É a minoria destas moedas, e a única em que seguir o movimento tem base.`
        : `Sem memória: nenhuma das ${memoria.length} defasagens passa de ` +
          `${SIGMAS_MINIMO}σ depois de corrigir pelas tentativas. O retorno de amanhã não ` +
          `tem relação com o de hoje, e qualquer regra de continuação ou reversão nesta ` +
          `moeda estaria lendo ruído.`;

  return {
    symbol,
    ticker,
    dias: fechamentos.length,
    de: new Date(barras[0].time * 1000).toISOString().slice(0, 10),
    ate: new Date(barras[barras.length - 1].time * 1000).toISOString().slice(0, 10),
    volDiaria,
    volAnual: volDiaria * Math.sqrt(365) * 100,
    maiorAlta: Math.max(...r.map((x) => Math.exp(x) - 1)),
    maiorQueda: Math.min(...r.map((x) => Math.exp(x) - 1)),
    memoria,
    perfil,
    melhorLag,
    sobe20,
    cai20,
    assimetria: cai20 > 0 ? sobe20 / cai20 : sobe20 > 0 ? Infinity : 1,
    janelas7d: janelas,
    veredito: `${veredito} Volatilidade de ${(volDiaria * 100).toFixed(1)}% ao dia; ` +
      `em sete dias sobe 20% em ${(sobe20 * 100).toFixed(1)}% das janelas e cai 20% em ` +
      `${(cai20 * 100).toFixed(1)}%. Maior dia: ${pct(Math.max(...r.map((x) => Math.exp(x) - 1)))}; ` +
      `pior: ${pct(Math.min(...r.map((x) => Math.exp(x) - 1)))}.`,
    medidoEm: Date.now(),
  };
}

// ------------------------------------------------------------------ leitura

/**
 * O estudo já medido, de `data/estudos.json`.
 *
 * A página lê daqui em vez de calcular: são 1.500 velas por moeda e o resultado
 * é histórico, não muda de minuto em minuto. `npm run estudar` regrava.
 */
export async function lerEstudo(symbol: string): Promise<Estudo | null> {
  try {
    const { readFile } = await import("node:fs/promises");
    const arquivo = JSON.parse(await readFile("data/estudos.json", "utf8")) as {
      moedas: Record<string, Estudo>;
    };
    return arquivo.moedas?.[symbol] ?? null;
  } catch {
    return null;
  }
}
