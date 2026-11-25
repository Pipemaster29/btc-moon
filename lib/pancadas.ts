/**
 * As PANCADAS de uma moeda (26/11/2026), a pedido, sobre a HBAR: "ela parece que
 * trabalha com pancadas, uma subida enorme do nada, depois mini correções e
 * pancadas pra cima. Diferente do BTC".
 *
 * A definição veio antes da medição: pancada é o fechamento 50% ou mais acima
 * do de 7 dias antes, e uma pancada nova só conta 7 dias depois da anterior
 * (sem sobreposição). O resto é descrição da forma — e o que a forma NÃO dá:
 * comprar depois da pancada não tem vantagem medida (ver `testarPancada`).
 *
 * Unidades: `t` em SEGUNDOS; retornos e quedas em fração do PREÇO; `volDia`,
 * desvio do retorno logarítmico DIÁRIO.
 */

export interface DiaMoeda {
  t: number;
  alta: number;
  baixa: number;
  fecho: number;
}

export const PANCADA = { dias: 7, alta: 0.5 };

export interface Pancada {
  /** Índice do dia em que a pancada se confirmou (o fechamento ≥ +50% em 7 dias). */
  i: number;
  de: number;
  ate: number;
  precoDe: number;
  precoAte: number;
  depois30: number | null;
  depois90: number | null;
  /** A pior mínima nos 30 dias seguintes, contra o fechamento da pancada. */
  queda30: number | null;
}

export interface EstudoPancadas {
  dias: number;
  volDia: number;
  assimetria: number;
  curtose: number;
  segurar: number;
  semOs10Melhores: number;
  diasAcima20: number;
  pancadas: Pancada[];
  porAno: number;
  /** Fração das pancadas seguidas de OUTRA em até 60 dias. */
  outraEm60: number;
  /** A mesma chance a partir de um dia qualquer: a taxa-base. */
  base60: number;
  /** Fração das pancadas em que, 90 dias depois, o preço voltou abaixo do de antes dela. */
  devolveEm90: number;
  /** Soma dos retornos logarítmicos das semanas de pancada e da vida inteira. */
  logPancadas: number;
  logTotal: number;
}

const mediana = (a: number[]) => {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

export function acharPancadas(v: DiaMoeda[]): Pancada[] {
  const c = v.map((x) => x.fecho);
  const saida: Pancada[] = [];
  for (let i = PANCADA.dias; i < c.length; i++) {
    if (!(c[i] > 0 && c[i - PANCADA.dias] > 0)) continue;
    if (c[i] / c[i - PANCADA.dias] < 1 + PANCADA.alta) continue;
    if (saida.length && i - saida.at(-1)!.i < PANCADA.dias) continue;
    let q: number | null = null;
    if (i + 30 < c.length) {
      let m = Infinity;
      for (let j = i + 1; j <= i + 30; j++) m = Math.min(m, v[j].baixa);
      q = m / c[i] - 1;
    }
    saida.push({
      i,
      de: v[i - PANCADA.dias].t,
      ate: v[i].t,
      precoDe: c[i - PANCADA.dias],
      precoAte: c[i],
      depois30: i + 30 < c.length ? c[i + 30] / c[i] - 1 : null,
      depois90: i + 90 < c.length ? c[i + 90] / c[i] - 1 : null,
      queda30: q,
    });
  }
  return saida;
}

export function estudarPancadas(v: DiaMoeda[]): EstudoPancadas {
  const c = v.map((x) => x.fecho);
  const r: number[] = [];
  for (let i = 1; i < c.length; i++) if (c[i] > 0 && c[i - 1] > 0) r.push(Math.log(c[i] / c[i - 1]));
  const n = r.length;
  const mu = r.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(r.reduce((a, b) => a + (b - mu) ** 2, 0) / n);
  const total = r.reduce((a, b) => a + b, 0);
  const top10 = [...r].sort((a, b) => b - a).slice(0, 10).reduce((a, b) => a + b, 0);
  const P = acharPancadas(v);
  const idx = P.map((p) => p.i);
  const seguidas = P.filter((p) => p.i + 60 < c.length).map((p) => (idx.some((j) => j > p.i && j <= p.i + 60) ? 1 : 0));
  let base = 0;
  let nBase = 0;
  for (let i = 0; i + 60 < c.length; i++) {
    nBase++;
    if (idx.some((j) => j > i && j <= i + 60)) base++;
  }
  const devolve = P.filter((p) => p.i + 90 < c.length).map((p) => (c[p.i + 90] < p.precoDe ? 1 : 0));
  const media = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  return {
    dias: c.length,
    volDia: sd,
    assimetria: r.reduce((a, b) => a + ((b - mu) / sd) ** 3, 0) / n,
    curtose: r.reduce((a, b) => a + ((b - mu) / sd) ** 4, 0) / n,
    segurar: Math.exp(total),
    semOs10Melhores: Math.exp(total - top10),
    diasAcima20: r.filter((x) => x >= Math.log(1.2)).length,
    pancadas: P,
    porAno: P.length / (n / 365),
    outraEm60: media(seguidas),
    base60: nBase ? base / nBase : NaN,
    devolveEm90: media(devolve),
    logPancadas: P.reduce((a, p) => a + Math.log(p.precoAte / p.precoDe), 0),
    logTotal: total,
  };
}

/**
 * Comprar no fechamento da pancada e vender `k` dias depois, com `custo` por
 * lado, em várias moedas. Devolve cada evento, para o ataque: as metades, sem
 * os melhores e agrupado por mês — os eventos não são independentes, e um mês
 * de alta do mercado inteiro gera dezenas deles.
 */
export function testarPancada(moedas: { moeda: string; v: DiaMoeda[] }[], k: number, custo = 0.001): { moeda: string; t: number; x: number }[] {
  const ev: { moeda: string; t: number; x: number }[] = [];
  for (const { moeda, v } of moedas)
    for (const p of acharPancadas(v)) if (p.i + k < v.length) ev.push({ moeda, t: p.ate, x: (v[p.i + k].fecho / p.precoAte) * (1 - custo) ** 2 - 1 });
  return ev;
}

export function resumoDosEventos(ev: { t: number; x: number }[]): { n: number; media: number; mediana: number; positivas: number; t: number } {
  const n = ev.length;
  const xs = ev.map((e) => e.x);
  const m = xs.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / n);
  return { n, media: m, mediana: mediana(xs), positivas: xs.filter((x) => x > 0).length / n, t: m / (sd / Math.sqrt(n)) };
}

/** A média por mês-calendário da pancada, e o t disso: a régua honesta para eventos colados no tempo. */
export function porMes(ev: { t: number; x: number }[]): { meses: number; media: number; t: number; positivos: number } {
  const g = new Map<string, number[]>();
  for (const e of ev) {
    const k = new Date(e.t * 1000).toISOString().slice(0, 7);
    g.set(k, [...(g.get(k) ?? []), e.x]);
  }
  const mm = [...g.values()].map((a) => a.reduce((x, y) => x + y, 0) / a.length);
  const m = mm.reduce((a, b) => a + b, 0) / mm.length;
  const sd = Math.sqrt(mm.reduce((a, b) => a + (b - m) ** 2, 0) / mm.length);
  return { meses: mm.length, media: m, t: m / (sd / Math.sqrt(mm.length)), positivos: mm.filter((x) => x > 0).length / mm.length };
}
