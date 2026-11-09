/**
 * A RÉGUA DOS DOIS JUÍZES DAS BALEIAS, num lugar só: a reconstrução para trás
 * (`scripts/medir-baleias.mts`) e a coleta para frente
 * (`scripts/medir-baleias-ao-vivo.mts`) aplicam o MESMO critério do
 * pré-registro (`docs/preregistro-baleias.md`), e até 09/11 cada uma tinha a
 * sua cópia da estatística. A terceira emenda já teve de consertar uma delas (a
 * escolha dos dias que não se sobrepõem); com duas cópias, o próximo conserto
 * numa deixaria a outra julgando por outra régua sem ninguém ver.
 *
 * Puro e sem `node:`.
 */

const DIA = 86_400_000;

/** Os postos de uma série, com o empate levando a média dos postos. */
export function postos(xs: readonly number[]): number[] {
  const ordem = xs.map((x, i) => [x, i] as const).sort((p, q) => p[0] - q[0]);
  const r = new Array<number>(xs.length);
  for (let i = 0; i < ordem.length; ) {
    let j = i;
    while (j + 1 < ordem.length && ordem[j + 1][0] === ordem[i][0]) j++;
    for (let k = i; k <= j; k++) r[ordem[k][1]] = (i + j) / 2 + 1;
    i = j + 1;
  }
  return r;
}

/** A correlação de postos (Spearman); NaN quando uma das séries é constante. */
export function spearman(x: readonly number[], y: readonly number[]): number {
  const rx = postos(x);
  const ry = postos(y);
  const n = x.length;
  const mx = rx.reduce((s, v) => s + v, 0) / n;
  const my = ry.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx > 0 && dy > 0 ? num / Math.sqrt(dx * dy) : NaN;
}

export const media = (xs: readonly number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

export function desvio(xs: readonly number[]): number {
  const m = media(xs);
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1));
}

/** O t da média contra zero; NaN com menos de 3 pontos. */
export const tDe = (xs: readonly number[]) => (xs.length > 2 ? (media(xs) / desvio(xs)) * Math.sqrt(xs.length) : NaN);

/**
 * Os dias que não se sobrepõem num horizonte de h dias: o primeiro e, daí em
 * diante, cada um a h dias ou mais do último escolhido — escolhidos pela DATA,
 * e não pela posição na lista, para um dia sem sinal não encurtar o passo
 * (terceira emenda).
 */
export function naoSobrepostos<T extends { d: number }>(xs: readonly T[], h: number): T[] {
  const out: T[] = [];
  for (const x of xs) if (out.length === 0 || x.d - out[out.length - 1].d >= h * DIA) out.push(x);
  return out;
}

/** O que o critério lê de um sinal no horizonte de 7 dias. */
export interface LeituraDoSinal {
  t: number;
  icMedio: number;
  icMetades: [number, number];
  quintosMetades: [number, number];
}

/**
 * O critério dos sinais 1 a 3, como o pré-registro o escreveu e a terceira
 * emenda o detalhou: |t| ≥ 2,5 (Bonferroni de 5% com quatro sinais), a
 * correlação média do mesmo lado nas duas metades, e a diferença entre os
 * quintos com o mesmo sinal nas duas metades E do lado da correlação.
 */
export function vereditoDoSinal(r: LeituraDoSinal): { passa: boolean; texto: string } {
  const passa =
    Math.abs(r.t) >= 2.5 &&
    Math.sign(r.icMetades[0]) === Math.sign(r.icMetades[1]) &&
    Math.sign(r.quintosMetades[0]) === Math.sign(r.quintosMetades[1]) &&
    Math.sign(r.quintosMetades[0]) === Math.sign(r.icMedio);
  return { passa, texto: passa ? `tem vantagem, ${r.icMedio > 0 ? "a favor das baleias" : "ao contrário das baleias"}` : "sem vantagem medida" };
}

/** O critério do sinal 4 (o suporte): |t| ≥ 2,5, o mesmo lado nas duas metades, e pelo menos 30 eventos em 10 moedas. */
export function vereditoDoSuporte(s: { t: number; media: number; metades: [number, number]; eventos: number; moedas: number }): { passa: boolean; texto: string } {
  const amostra = s.eventos >= 30 && s.moedas >= 10;
  const passa = amostra && Math.abs(s.t) >= 2.5 && Math.sign(s.metades[0]) === Math.sign(s.metades[1]);
  return {
    passa,
    texto: !amostra ? "amostra insuficiente" : passa ? (s.media > 0 ? "tem vantagem: segura como suporte" : "tem vantagem ao contrário: o preço rompe") : "sem vantagem medida",
  };
}
