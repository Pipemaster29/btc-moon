/**
 * O ALGORITMO DE PREVISÃO: uma nota por moeda — a chance de ela bater o mercado
 * nos próximos 7 dias — e a chance de o BTC estar mais alto em 30. Pedido do
 * usuário em 10/11: "um algoritmo, estilo gráfico, que tente ver quais moedas
 * vão subir, e para onde o BTC vai".
 *
 * O QUE ELE É: oito entradas que o projeto já tinha medido uma a uma (os
 * retornos de 1, 7, 14 e 45 dias, o fluxo comprador, a agitação, o
 * financiamento e o surto de volume), cada uma virando POSTO dentro do universo
 * do dia, somadas com oito pesos. Os pesos saem de uma regressão linear com
 * penalidade, ajustada uma vez sobre 03/2024–06/2025, e o teste é sobre o que
 * veio depois (`docs/preregistro-previsao.md`, escrito antes de qualquer
 * número). Sem árvore e sem rede: oito pesos cabem numa linha e se leem.
 *
 * UM MOTOR SÓ, como nos robôs: a medição (`scripts/medir-previsao.mts`) e o ao
 * vivo (`scripts/previsao.mts`) chamam `entradasDaMoeda`, `postosDe` e `notaDe`
 * daqui. O ao vivo não ajusta nada — lê os pesos que a medição gravou.
 *
 * Puro e sem `node:`: a página o importa.
 */

/** As oito entradas, na ordem dos pesos. */
export const ENTRADAS = ["r1", "r7", "r14", "r45", "fluxo", "agitacao", "financiamento", "surto"] as const;
export type Entrada = (typeof ENTRADAS)[number];

export const NOME_DA_ENTRADA: Record<Entrada, string> = {
  r1: "retorno de 1 dia",
  r7: "retorno de 7 dias",
  r14: "retorno de 14 dias",
  r45: "retorno de 45 dias",
  fluxo: "fluxo comprador (7 dias)",
  agitacao: "agitação (30 dias)",
  financiamento: "financiamento (7 dias)",
  surto: "surto de volume",
};

/** A régua do universo: a mesma dos robôs. Dólares de volume médio por dia, em 7 dias. */
export const VOLUME_MINIMO = 20e6;
/** Dias de vela que uma moeda precisa ter antes da decisão: os 45 do retorno mais longo e o dia de base. */
export const DIAS_MINIMOS = 46;
/** O horizonte da previsão das moedas, em dias. */
export const HORIZONTE = 7;

/**
 * A série diária de uma moeda, em dias UTC seguidos a partir de `d0` (o número
 * do dia desde 1970). `c` é o fechamento; `qv`, o volume em DÓLARES; `tb`, a
 * parte dele comprada a mercado; `fr`, a SOMA do financiamento cobrado no dia
 * (fração do nocional — soma, e não média, porque há moeda que cobra de 4 em 4
 * horas e moeda de 8 em 8). Dia sem dado é NaN.
 */
export interface SerieDiaria {
  symbol: string;
  d0: number;
  c: number[];
  qv: number[];
  tb: number[];
  fr: number[];
}

/**
 * As oito entradas de uma moeda para a decisão do dia `d`, só com o que existe
 * até o fechamento de `d − 1`, e o volume médio de 7 dias. Nulo quando falta
 * vela na janela — moeda sem leitura fica fora do universo, não entra com zero.
 * O financiamento é a exceção: sem cobrança lida, a entrada dele é nula e a
 * moeda fica (o posto dela vira o do meio).
 */
export function entradasDaMoeda(s: SerieDiaria, d: number): { x: (number | null)[]; volume: number } | null {
  const i = d - 1 - s.d0;
  if (i < DIAS_MINIMOS - 1 || i >= s.c.length) return null;
  const c = (k: number) => s.c[i - k];
  for (const k of [0, 1, 7, 14, 45]) if (!(c(k) > 0)) return null;
  let qv7 = 0;
  let tb7 = 0;
  for (let k = 0; k < 7; k++) {
    const q = s.qv[i - k];
    const t = s.tb[i - k];
    if (!(q > 0) || !Number.isFinite(t)) return null;
    qv7 += q;
    tb7 += t;
  }
  let qv30 = 0;
  const rets: number[] = [];
  for (let k = 0; k < 30; k++) {
    const q = s.qv[i - k];
    if (!(q > 0) || !(c(k) > 0) || !(c(k + 1) > 0)) return null;
    qv30 += q;
    rets.push(c(k) / c(k + 1) - 1);
  }
  const m = rets.reduce((a, b) => a + b, 0) / rets.length;
  const agitacao = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / (rets.length - 1));
  let fr = 0;
  let nfr = 0;
  for (let k = 0; k < 7; k++) {
    const f = s.fr[i - k];
    if (Number.isFinite(f)) {
      fr += f;
      nfr++;
    }
  }
  return {
    x: [c(0) / c(1) - 1, c(0) / c(7) - 1, c(0) / c(14) - 1, c(0) / c(45) - 1, tb7 / qv7, agitacao, nfr > 0 ? fr / nfr : null, qv7 / 7 / (qv30 / 30)],
    volume: qv7 / 7,
  };
}

/**
 * O posto de cada valor dentro da lista, de −0,5 (o menor) a +0,5 (o maior),
 * com o empate levando a média. Nulo vira 0 — o meio —, para a moeda sem aquela
 * leitura não ser empurrada para nenhum lado.
 */
export function postosDe(valores: readonly (number | null)[]): number[] {
  const com = valores.map((v, i) => [v, i] as const).filter((p): p is readonly [number, number] => p[0] !== null && Number.isFinite(p[0]));
  const out = new Array<number>(valores.length).fill(0);
  if (com.length < 2) return out;
  const ordem = [...com].sort((p, q) => p[0] - q[0]);
  for (let a = 0; a < ordem.length; ) {
    let b = a;
    while (b + 1 < ordem.length && ordem[b + 1][0] === ordem[a][0]) b++;
    for (let k = a; k <= b; k++) out[ordem[k][1]] = ((a + b) / 2) / (ordem.length - 1) - 0.5;
    a = b + 1;
  }
  return out;
}

/** Uma moeda do universo do dia, com as entradas em valor e em posto. */
export interface LinhaDoDia {
  symbol: string;
  x: (number | null)[];
  p: number[];
  volume: number;
}

/** O universo de um dia: as moedas com leitura e volume, e as oito entradas de cada uma já em posto. */
export function universoDoDia(series: readonly SerieDiaria[], d: number): LinhaDoDia[] {
  const lidas: { symbol: string; x: (number | null)[]; volume: number }[] = [];
  for (const s of series) {
    const e = entradasDaMoeda(s, d);
    if (e && e.volume >= VOLUME_MINIMO) lidas.push({ symbol: s.symbol, ...e });
  }
  const postos = ENTRADAS.map((_, k) => postosDe(lidas.map((l) => l.x[k])));
  return lidas.map((l, i) => ({ ...l, p: ENTRADAS.map((_, k) => postos[k][i]) }));
}

/** A nota: a soma dos pesos pelos postos. */
export function notaDe(p: readonly number[], pesos: readonly number[]): number {
  let s = 0;
  for (let k = 0; k < pesos.length; k++) s += pesos[k] * p[k];
  return s;
}

/**
 * Os pesos da regressão com penalidade: resolve (XᵀX + λI)w = Xᵀy, com λ igual a
 * `fracao` do traço médio de XᵀX — a penalidade na escala do dado, para não
 * depender de quantas linhas há. Sem intercepto: postos e alvo têm média zero
 * por construção.
 */
export function ridge(X: readonly (readonly number[])[], y: readonly number[], fracao: number): number[] {
  const k = X[0]?.length ?? 0;
  const A = Array.from({ length: k }, () => new Array<number>(k + 1).fill(0));
  for (let n = 0; n < X.length; n++) {
    const x = X[n];
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) A[i][j] += x[i] * x[j];
      A[i][k] += x[i] * y[n];
    }
  }
  let traco = 0;
  for (let i = 0; i < k; i++) traco += A[i][i];
  const lambda = (fracao * traco) / k;
  for (let i = 0; i < k; i++) A[i][i] += lambda;
  // Eliminação de Gauss com pivô: oito por oito.
  for (let i = 0; i < k; i++) {
    let piv = i;
    for (let r = i + 1; r < k; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    [A[i], A[piv]] = [A[piv], A[i]];
    if (Math.abs(A[i][i]) < 1e-12) continue;
    for (let r = 0; r < k; r++) {
      if (r === i) continue;
      const f = A[r][i] / A[i][i];
      for (let j = i; j <= k; j++) A[r][j] -= f * A[i][j];
    }
  }
  return A.map((linha, i) => (Math.abs(linha[i]) < 1e-12 ? 0 : linha[k] / linha[i]));
}

// ------------------------------------------------------------------ o BTC

export const ENTRADAS_BTC = ["media200", "r30", "r90", "queda", "medo"] as const;
export const NOME_DA_ENTRADA_BTC: Record<(typeof ENTRADAS_BTC)[number], string> = {
  media200: "preço ÷ média de 200 dias",
  r30: "retorno de 30 dias",
  r90: "retorno de 90 dias",
  queda: "queda desde a máxima histórica",
  medo: "índice de medo e ganância (véspera)",
};
/** O horizonte principal do BTC, em dias. */
export const HORIZONTE_BTC = 30;

/**
 * As cinco entradas do BTC no dia de índice `i` da série de fechamentos (a
 * decisão é depois do fechamento `i`). `maxima` é a máxima histórica dos
 * fechamentos até `i`; `medo`, o índice publicado no dia de `i` — que só vale a
 * partir do seguinte, e é por isso que quem chama passa o da véspera da decisão.
 * Nulo com menos de 200 dias ou sem o índice.
 */
export function entradasDoBtc(fech: readonly number[], i: number, maxima: number, medo: number | null): number[] | null {
  if (i < 200 || medo === null || !Number.isFinite(medo)) return null;
  let soma = 0;
  for (let k = 0; k < 200; k++) soma += fech[i - k];
  const c = fech[i];
  if (!(c > 0) || !(fech[i - 30] > 0) || !(fech[i - 90] > 0) || !(maxima > 0)) return null;
  return [c / (soma / 200) - 1, c / fech[i - 30] - 1, c / fech[i - 90] - 1, c / maxima - 1, medo / 100 - 0.5];
}

/** Um modelo logístico já ajustado: a média e o desvio de cada entrada no ajuste, os coeficientes e o intercepto. */
export interface Logistica {
  media: number[];
  desvio: number[];
  coef: number[];
  intercepto: number;
}

/**
 * Ajusta a regressão logística por descida de gradiente, com as entradas
 * padronizadas e uma penalidade leve (0,01) nos coeficientes — com cinco
 * entradas e alguns milhares de dias, o que ela evita é coeficiente fugindo
 * quando duas entradas andam juntas (os retornos de 30 e 90 dias).
 */
export function ajustarLogistica(X: readonly (readonly number[])[], y: readonly number[]): Logistica {
  const n = X.length;
  const k = X[0]?.length ?? 0;
  const media = new Array<number>(k).fill(0);
  const desvio = new Array<number>(k).fill(0);
  for (const x of X) for (let j = 0; j < k; j++) media[j] += x[j] / n;
  for (const x of X) for (let j = 0; j < k; j++) desvio[j] += (x[j] - media[j]) ** 2 / n;
  for (let j = 0; j < k; j++) desvio[j] = Math.sqrt(desvio[j]) || 1;
  const Z = X.map((x) => x.map((v, j) => (v - media[j]) / desvio[j]));
  const coef = new Array<number>(k).fill(0);
  let intercepto = 0;
  for (let passo = 0; passo < 400; passo++) {
    const g = new Array<number>(k).fill(0);
    let g0 = 0;
    for (let i = 0; i < n; i++) {
      let z = intercepto;
      for (let j = 0; j < k; j++) z += coef[j] * Z[i][j];
      const e = 1 / (1 + Math.exp(-z)) - y[i];
      g0 += e / n;
      for (let j = 0; j < k; j++) g[j] += (e * Z[i][j]) / n;
    }
    intercepto -= 0.5 * g0;
    for (let j = 0; j < k; j++) coef[j] -= 0.5 * (g[j] + 0.01 * coef[j]);
  }
  return { media, desvio, coef, intercepto };
}

/** A probabilidade que o modelo dá para as entradas `x`. */
export function prever(m: Logistica, x: readonly number[]): number {
  let z = m.intercepto;
  for (let j = 0; j < m.coef.length; j++) z += (m.coef[j] * (x[j] - m.media[j])) / m.desvio[j];
  return 1 / (1 + Math.exp(-z));
}

// ------------------------------------------------------------------ os arquivos

/** O que a medição diz de uma janela, para as moedas. */
export interface JanelaMedida {
  nome: string;
  de: number;
  ate: number;
  dias: number;
  moedasPorDia: number;
  /** A correlação de postos média do dia entre a nota e o retorno relativo, e o t contando um dia a cada 7. */
  ic: number;
  t: number;
  /** O décimo de cima menos o de baixo, em retorno relativo de 7 dias (fração). */
  decimos: number;
  /** As 10 de nota mais alta: o retorno relativo médio de 7 dias, a fração que bateu a mediana, e o mesmo sem as 5 moedas que mais contribuíram. */
  top10: number;
  top10Acerto: number;
  top10SemAs5: number;
}

/** O que `scripts/medir-previsao.mts` grava em `data/previsao-medicao.json` (no `main`, à mão). */
export interface MedicaoPrevisao {
  geradoEm: number;
  moedas: {
    pesos: number[];
    janelas: JanelaMedida[];
    /** Fora do desenho, por décimo da nota (0 = o de baixo): o retorno relativo médio e a fração que bateu a mediana. */
    decimos: { retorno: number; acerto: number; n: number }[];
    veredito: { passa: boolean; texto: string };
    /**
     * O que o critério não pergunta e a tela precisa dizer, medido fora do
     * desenho DEPOIS de ver o resultado: quanto as 10 de cima renderam em
     * retorno absoluto (bater a mediana não é subir), a correlação sem a
     * agitação e só com ela, e nos dias em que o mercado subiu e caiu.
     */
    diagnostico: {
      top10Absoluto: number;
      universoAbsoluto: number;
      medianaAbsoluta: number;
      top10Subiram: number;
      universoSubiu: number;
      icSemAgitacao: number;
      icSoAgitacao: number;
      icEmAlta: number;
      icEmBaixa: number;
      diasEmAlta: number;
      diasEmBaixa: number;
      maisEscolhidas: { symbol: string; fracao: number }[];
    };
    /**
     * A parte 3 do pré-registro, escrita depois de ver a parte 1: as sete
     * entradas sem a agitação, com tudo em posto DENTRO do terço de agitação do
     * dia. Responde se o modelo escolhe moeda, e não só se prefere moeda calma.
     */
    escolha: { pesos: number[]; janelas: JanelaMedida[]; top10Absoluto: number; top10Subiram: number; veredito: { passa: boolean; texto: string } };
  };
  btc: {
    de: number;
    ate: number;
    dias: number;
    taxaBase: number;
    brierModelo: number;
    brierBase: number;
    /** 1 − Brier do modelo ÷ Brier da taxa-base: acima de zero o modelo é melhor. E o intervalo de 95% do bootstrap em blocos. */
    ganho: number;
    intervalo: [number, number];
    ganhoMetades: [number, number];
    /** Por faixa da probabilidade prevista: quantos dias, a média prevista e a fração que subiu de verdade. */
    calibracao: { de: number; ate: number; n: number; previsto: number; subiu: number }[];
    /** O modelo ajustado com todo o dado, que o ao vivo usa. */
    modelo: Logistica;
    veredito: { passa: boolean; texto: string };
    /** O mesmo teste em 7 dias, só para o registro. */
    seteDias: { taxaBase: number; ganho: number };
  };
}

/** Uma moeda no ranking de agora. */
export interface MoedaPrevista {
  symbol: string;
  nota: number;
  /** O décimo da nota dentro do universo de hoje (0 = o de baixo, 9 = o de cima). */
  decimo: number;
  preco: number;
  volume: number;
  /** As oito entradas em valor e a contribuição de cada uma para a nota (peso × posto). */
  x: (number | null)[];
  contribuicao: number[];
}

/** O que `scripts/previsao.mts` grava em `data/previsao.json` (na branch `dados`). */
export interface ArquivoPrevisao {
  geradoEm: number;
  /** O dia UTC da decisão, em milissegundos: as entradas vão até o fechamento da véspera. */
  dia: number;
  moedas: MoedaPrevista[];
  /** Quantos perpétuos a Binance lista e quantos entraram no universo. */
  listadas: number;
  btc: { preco: number; p30: number; taxaBase: number; x: number[]; medoDe: string } | null;
}

export async function getPrevisao(): Promise<ArquivoPrevisao | null> {
  const { lerGuardado } = await import("./guardado");
  const g = await lerGuardado<ArquivoPrevisao>("previsao.json", (d) => (Array.isArray((d as ArquivoPrevisao)?.moedas) ? (d as ArquivoPrevisao) : null), 600);
  return g?.dado ?? null;
}

export async function getMedicaoPrevisao(): Promise<MedicaoPrevisao | null> {
  const { lerGuardado } = await import("./guardado");
  const g = await lerGuardado<MedicaoPrevisao>("previsao-medicao.json", (d) => (Array.isArray((d as MedicaoPrevisao)?.moedas?.pesos) ? (d as MedicaoPrevisao) : null), 3600);
  return g?.dado ?? null;
}
