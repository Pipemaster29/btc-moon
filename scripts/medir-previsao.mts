/**
 * A MEDIÇÃO DO ALGORITMO DE PREVISÃO (`docs/preregistro-previsao.md`): ajusta os
 * oito pesos das moedas sobre o desenho, testa na validação e na reserva, e
 * mede o modelo do BTC contra a taxa-base. Grava `data/previsao-medicao.json` —
 * os pesos e o modelo que o ao vivo usa, e os números que a tela mostra.
 *
 * As velas das moedas são as de 1 h do Data Vision que a medição dos robôs
 * guarda em `.cache/robos/` (`npm run medir-robos` as baixa), somadas em dias
 * UTC e guardadas em `.cache/diarios.json`: ler os 843 MB de novo a cada rodada
 * custa um minuto e meio. Dia com menos de 20 velas de hora é dia sem dado.
 *
 * Rode com: npm run medir-previsao   (`-- --refazer` remonta os dias a partir das velas)
 */

import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { getCandles } from "../lib/bitstamp";
import { media, naoSobrepostos, spearman, tDe } from "../lib/juizBaleias";
import {
  ajustarLogistica,
  ENTRADAS,
  entradasDoBtc,
  HORIZONTE,
  HORIZONTE_BTC,
  NOME_DA_ENTRADA,
  notaDe,
  postosDe,
  prever,
  ridge,
  universoDoDia,
  type JanelaMedida,
  type Logistica,
  type MedicaoPrevisao,
  type SerieDiaria,
} from "../lib/previsao";

const DIA = 86_400_000;
const CACHE = ".cache/robos";
const DIARIOS = ".cache/diarios.json";
const dia = (iso: string) => Math.floor(Date.parse(`${iso}T00:00:00Z`) / DIA);
const iso = (d: number) => new Date(d * DIA).toISOString().slice(0, 10);

// ------------------------------------------------------------------ os dias

async function montarDias(): Promise<SerieDiaria[]> {
  const out: SerieDiaria[] = [];
  const simbolos = (await readdir(CACHE, { withFileTypes: true })).filter((x) => x.isDirectory()).map((x) => x.name);
  for (const symbol of simbolos) {
    const porDia = new Map<number, { c: number; n: number; qv: number; tb: number; fr: number; nfr: number }>();
    const cel = (d: number) => {
      let x = porDia.get(d);
      if (!x) porDia.set(d, (x = { c: NaN, n: 0, qv: 0, tb: 0, fr: 0, nfr: 0 }));
      return x;
    };
    for (const arq of (await readdir(`${CACHE}/${symbol}`)).filter((a) => a.endsWith(".json")).sort()) {
      const m = JSON.parse(await readFile(`${CACHE}/${symbol}/${arq}`, "utf8")) as { velas: number[][]; funding: number[][] };
      for (const v of m.velas) {
        const x = cel(Math.floor(v[0] / DIA));
        x.c = v[4];
        x.n++;
        x.qv += v[5];
        x.tb += v[6];
      }
      for (const f of m.funding) {
        if (!Number.isFinite(f[1])) continue;
        const x = cel(Math.floor(f[0] / DIA));
        x.fr += f[1];
        x.nfr++;
      }
    }
    if (porDia.size === 0) continue;
    const ds = [...porDia.keys()].sort((a, b) => a - b);
    const d0 = ds[0];
    const n = ds[ds.length - 1] - d0 + 1;
    const s: SerieDiaria = { symbol, d0, c: new Array(n).fill(NaN), qv: new Array(n).fill(NaN), tb: new Array(n).fill(NaN), fr: new Array(n).fill(NaN) };
    for (const [d, x] of porDia) {
      const i = d - d0;
      // Dia com menos de 20 velas é dia sem dado: o fechamento seria o do meio do dia.
      if (x.n >= 20 && x.c > 0) {
        s.c[i] = x.c;
        s.qv[i] = x.qv;
        s.tb[i] = x.tb;
      }
      if (x.nfr > 0) s.fr[i] = x.fr;
    }
    out.push(s);
  }
  return out;
}

let series: SerieDiaria[];
if (existsSync(DIARIOS) && !process.argv.includes("--refazer")) {
  // NaN não existe em JSON: é gravado como nulo e volta como NaN.
  series = (JSON.parse(await readFile(DIARIOS, "utf8")) as SerieDiaria[]).map((s) => ({ ...s, c: s.c.map((v) => v ?? NaN), qv: s.qv.map((v) => v ?? NaN), tb: s.tb.map((v) => v ?? NaN), fr: s.fr.map((v) => v ?? NaN) }));
} else {
  console.log("somando as velas de 1 h em dias…");
  series = await montarDias();
  await writeFile(DIARIOS, JSON.stringify(series));
}
const ultimoDia = Math.max(...series.map((s) => s.d0 + s.c.length - 1));
console.log(`${series.length} moedas, dias até ${iso(ultimoDia)}`);

// ------------------------------------------------------------------ as moedas

const JANELAS = [
  { nome: "desenho", de: dia("2024-03-01"), ate: dia("2025-06-30") },
  { nome: "validação", de: dia("2025-07-01"), ate: dia("2026-03-31") },
  { nome: "reserva", de: dia("2026-04-01"), ate: Math.min(dia("2026-10-24"), ultimoDia - HORIZONTE + 1) },
];

interface Ponto {
  symbol: string;
  p: number[];
  rel: number;
  /** O retorno de 7 dias sem tirar a mediana: "subiu ou não", que é o que o usuário pergunta. */
  abs: number;
}
/** O universo de cada dia com o alvo: o retorno de d−1 a d+6 menos a mediana do dia. */
const porDia = new Map<number, Ponto[]>();
const porSimbolo = new Map(series.map((s) => [s.symbol, s]));
let semAlvo = 0;
for (let d = JANELAS[0].de; d <= JANELAS[2].ate; d++) {
  const linhas = universoDoDia(series, d);
  const com: { symbol: string; p: number[]; r: number }[] = [];
  for (const l of linhas) {
    const s = porSimbolo.get(l.symbol) as SerieDiaria;
    const a = s.c[d - 1 - s.d0];
    const b = s.c[d - 1 + HORIZONTE - s.d0];
    if (!(a > 0) || !(b > 0)) {
      semAlvo++;
      continue;
    }
    com.push({ symbol: l.symbol, p: l.p, r: b / a - 1 });
  }
  if (com.length < 30) continue;
  const o = com.map((x) => x.r).sort((x, y) => x - y);
  const meio = o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
  porDia.set(d, com.map((x) => ({ symbol: x.symbol, p: x.p, rel: x.r - meio, abs: x.r })));
}
console.log(`${porDia.size} dias de decisão, ${Math.round([...porDia.values()].reduce((s, x) => s + x.length, 0) / porDia.size)} moedas por dia em média; ${semAlvo} moeda-dias sem o fechamento de 7 dias depois (deslistada), fora`);

// Os pesos: UMA regressão, sobre o desenho, com o alvo em posto.
const X: number[][] = [];
const y: number[] = [];
for (const [d, pontos] of porDia) {
  if (d < JANELAS[0].de || d > JANELAS[0].ate) continue;
  const alvo = postosDe(pontos.map((p) => p.rel));
  pontos.forEach((p, i) => {
    X.push(p.p);
    y.push(alvo[i]);
  });
}
const pesos = ridge(X, y, 0.1);
console.log(`\nos pesos (ajustados sobre ${X.length} moeda-dias do desenho):`);
ENTRADAS.forEach((e, k) => console.log(`  ${NOME_DA_ENTRADA[e].padEnd(28)} ${pesos[k] >= 0 ? "+" : ""}${pesos[k].toFixed(4)}`));

function medir(nome: string, de: number, ate: number, mapa: Map<number, Ponto[]> = porDia, w: number[] = pesos): JanelaMedida & { ics: { d: number; ic: number }[] } {
  const ics: { d: number; ic: number }[] = [];
  const qs: number[] = [];
  const picks: { symbol: string; rel: number }[] = [];
  let moedas = 0;
  let dias = 0;
  for (const [d, pontos] of mapa) {
    if (d < de || d > ate) continue;
    const notas = pontos.map((p) => notaDe(p.p, w));
    const ic = spearman(notas, pontos.map((p) => p.rel));
    if (!Number.isFinite(ic)) continue;
    dias++;
    moedas += pontos.length;
    ics.push({ d: d * DIA, ic });
    const ord = pontos.map((p, i) => ({ p, n: notas[i] })).sort((a, b) => a.n - b.n);
    const n10 = Math.max(1, Math.floor(ord.length / 10));
    qs.push(media(ord.slice(-n10).map((x) => x.p.rel)) - media(ord.slice(0, n10).map((x) => x.p.rel)));
    for (const x of ord.slice(-10)) picks.push({ symbol: x.p.symbol, rel: x.p.rel });
  }
  // Sem as 5 moedas que mais contribuíram para as 10 de cima: o resultado não pode ser de cinco nomes.
  const contrib = new Map<string, number>();
  for (const p of picks) contrib.set(p.symbol, (contrib.get(p.symbol) ?? 0) + p.rel);
  const as5 = new Set([...contrib].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s]) => s));
  const sem = picks.filter((p) => !as5.has(p.symbol));
  return {
    nome,
    de: de * DIA,
    ate: ate * DIA,
    dias,
    moedasPorDia: dias ? moedas / dias : 0,
    ic: media(ics.map((x) => x.ic)),
    t: tDe(naoSobrepostos(ics, HORIZONTE).map((x) => x.ic)),
    decimos: media(qs),
    top10: media(picks.map((p) => p.rel)),
    top10Acerto: picks.filter((p) => p.rel > 0).length / picks.length,
    top10SemAs5: sem.length ? media(sem.map((p) => p.rel)) : NaN,
    ics,
  };
}

const pp = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)} p.p.`;
const janelas = JANELAS.map((j) => medir(j.nome, j.de, j.ate));
const fora = medir("fora do desenho", JANELAS[1].de, JANELAS[2].ate);
console.log("");
for (const j of [...janelas, fora]) {
  console.log(
    `${j.nome.padEnd(16)} ${j.dias} dias · correlação ${j.ic >= 0 ? "+" : ""}${j.ic.toFixed(4)} (t ${j.t.toFixed(2)}) · décimo de cima − de baixo ${pp(j.decimos)} · as 10 de cima ${pp(j.top10)}, ${(j.top10Acerto * 100).toFixed(1)}% batem a mediana · sem as 5 ${pp(j.top10SemAs5)}`,
  );
}

// Por décimo da nota, fora do desenho: o que a tela mostra como "chance de bater o mercado".
const decimos = Array.from({ length: 10 }, () => ({ soma: 0, acertos: 0, n: 0 }));
for (const [d, pontos] of porDia) {
  if (d < JANELAS[1].de || d > JANELAS[2].ate) continue;
  const ord = pontos.map((p) => ({ rel: p.rel, n: notaDe(p.p, pesos) })).sort((a, b) => a.n - b.n);
  ord.forEach((x, i) => {
    const q = decimos[Math.min(9, Math.floor((i * 10) / ord.length))];
    q.soma += x.rel;
    q.acertos += x.rel > 0 ? 1 : 0;
    q.n++;
  });
}
console.log("\npor décimo da nota, fora do desenho (0 = o de baixo):");
decimos.forEach((q, i) => console.log(`  ${i}: ${pp(q.soma / q.n)} · ${((q.acertos / q.n) * 100).toFixed(1)}% batem a mediana · ${q.n} moeda-dias`));

const [, val, res] = janelas;
const passa =
  fora.ic > 0 && fora.t >= 2.5 && val.ic > 0 && res.ic > 0 && val.decimos > 0 && res.decimos > 0 && val.top10 > 0 && res.top10 > 0 && val.top10SemAs5 > 0 && res.top10SemAs5 > 0;
const porque: string[] = [];
if (!(fora.ic > 0 && fora.t >= 2.5)) porque.push(`a correlação fora do desenho não chega a t 2,5 (${fora.t.toFixed(2)})`);
if (!(val.ic > 0 && res.ic > 0)) porque.push("a correlação troca de sinal entre a validação e a reserva");
if (!(val.decimos > 0 && res.decimos > 0)) porque.push("o décimo de cima não bate o de baixo nas duas janelas");
if (!(val.top10 > 0 && res.top10 > 0)) porque.push("as 10 de cima não batem a mediana nas duas janelas");
else if (!(val.top10SemAs5 > 0 && res.top10SemAs5 > 0)) porque.push("sem as 5 moedas que mais contribuíram, as 10 de cima deixam de bater a mediana");
const vereditoMoedas = { passa, texto: passa ? "tem vantagem medida fora do desenho" : `sem vantagem medida: ${porque.join("; ")}` };
console.log(`\n→ MOEDAS: ${vereditoMoedas.texto.toUpperCase()}`);

// O DIAGNÓSTICO, que NÃO é o critério e foi escrito depois de ver o resultado: o
// peso que manda é o da agitação (−0,12, três vezes o segundo), e "bater a
// mediana" não é "subir". Três perguntas, fora do desenho: quanto as 10 de cima
// renderam em retorno ABSOLUTO; o que sobra sem a agitação; e se a correlação
// se mantém nas semanas em que o mercado sobe.
const k = ENTRADAS.indexOf("agitacao");
const semAgitacao = pesos.map((w, i) => (i === k ? 0 : w));
const soAgitacao = pesos.map((w, i) => (i === k ? w : 0));
const diag = { absTop: [] as number[], absTodos: [] as number[], medianas: [] as number[], icSem: [] as number[], icSo: [] as number[], icAlta: [] as number[], icBaixa: [] as number[], subiramTop: 0, picks: 0, subiramTodos: 0, todos: 0 };
const escolhidas = new Map<string, number>();
for (const [d, pontos] of porDia) {
  if (d < JANELAS[1].de || d > JANELAS[2].ate) continue;
  const notas = pontos.map((p) => notaDe(p.p, pesos));
  const ord = pontos.map((p, i) => ({ p, n: notas[i] })).sort((a, b) => a.n - b.n);
  const top = ord.slice(-10);
  for (const x of top) {
    diag.absTop.push(x.p.abs);
    diag.subiramTop += x.p.abs > 0 ? 1 : 0;
    diag.picks++;
    escolhidas.set(x.p.symbol, (escolhidas.get(x.p.symbol) ?? 0) + 1);
  }
  const abs = pontos.map((p) => p.abs);
  diag.absTodos.push(media(abs));
  diag.subiramTodos += abs.filter((v) => v > 0).length;
  diag.todos += abs.length;
  const o = [...abs].sort((x, y) => x - y);
  const med = o[Math.floor(o.length / 2)];
  diag.medianas.push(med);
  const rel = pontos.map((p) => p.rel);
  diag.icSem.push(spearman(pontos.map((p) => notaDe(p.p, semAgitacao)), rel));
  diag.icSo.push(spearman(pontos.map((p) => notaDe(p.p, soAgitacao)), rel));
  (med > 0 ? diag.icAlta : diag.icBaixa).push(spearman(notas, rel));
}
const pc = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;
const diagnostico = {
  top10Absoluto: media(diag.absTop),
  universoAbsoluto: media(diag.absTodos),
  medianaAbsoluta: media(diag.medianas),
  top10Subiram: diag.subiramTop / diag.picks,
  universoSubiu: diag.subiramTodos / diag.todos,
  icSemAgitacao: media(diag.icSem),
  icSoAgitacao: media(diag.icSo),
  icEmAlta: media(diag.icAlta),
  icEmBaixa: media(diag.icBaixa),
  diasEmAlta: diag.icAlta.length,
  diasEmBaixa: diag.icBaixa.length,
  maisEscolhidas: [...escolhidas].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([symbol, n]) => ({ symbol, fracao: n / (diag.picks / 10) })),
};
console.log("\no diagnóstico (fora do desenho; não é o critério):");
console.log(`  em retorno ABSOLUTO de 7 dias: as 10 de cima ${pc(diagnostico.top10Absoluto)} em média, ${(diagnostico.top10Subiram * 100).toFixed(1)}% subiram · o universo ${pc(diagnostico.universoAbsoluto)}, ${(diagnostico.universoSubiu * 100).toFixed(1)}% subiram · a mediana do dia ${pc(diagnostico.medianaAbsoluta)}`);
console.log(`  a correlação: tudo ${fora.ic.toFixed(4)} · sem a agitação ${diagnostico.icSemAgitacao.toFixed(4)} · só a agitação ${diagnostico.icSoAgitacao.toFixed(4)}`);
console.log(`  nos ${diagnostico.diasEmAlta} dias em que a mediana subiu: ${diagnostico.icEmAlta.toFixed(4)} · nos ${diagnostico.diasEmBaixa} em que caiu: ${diagnostico.icEmBaixa.toFixed(4)}`);
console.log(`  as mais escolhidas entre as 10 de cima: ${diagnostico.maisEscolhidas.map((x) => `${x.symbol.replace(/USDT$/, "")} ${(x.fracao * 100).toFixed(0)}%`).join(", ")}`);

// ------------------------------------------------------------------ a parte 3: escolher dentro do terço de agitação

// Escrita depois de ver a parte 1 (`docs/preregistro-previsao.md`): sem a entrada
// da agitação, com as entradas e o alvo em posto DENTRO do terço de agitação do
// dia, e o retorno contra a mediana do terço. "Calma bate agitada" fica de fora.
const SETE = ENTRADAS.map((_, i) => i).filter((i) => i !== k);
const porDia3 = new Map<number, Ponto[]>();
for (let d = JANELAS[0].de; d <= JANELAS[2].ate; d++) {
  const linhas = universoDoDia(series, d)
    .map((l) => {
      const sr = porSimbolo.get(l.symbol) as SerieDiaria;
      const a = sr.c[d - 1 - sr.d0];
      const b = sr.c[d - 1 + HORIZONTE - sr.d0];
      return a > 0 && b > 0 ? { l, r: b / a - 1 } : null;
    })
    .filter((x): x is { l: ReturnType<typeof universoDoDia>[number]; r: number } => x !== null)
    .sort((x, y) => (x.l.x[k] as number) - (y.l.x[k] as number));
  if (linhas.length < 30) continue;
  const pontos: Ponto[] = [];
  for (let t = 0; t < 3; t++) {
    const terco = linhas.slice(Math.floor((t * linhas.length) / 3), Math.floor(((t + 1) * linhas.length) / 3));
    const o = terco.map((x) => x.r).sort((x, y) => x - y);
    const meio = o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
    const postos = SETE.map((i) => postosDe(terco.map((x) => x.l.x[i])));
    terco.forEach((x, j) => pontos.push({ symbol: x.l.symbol, p: SETE.map((_, c) => postos[c][j]), rel: x.r - meio, abs: x.r }));
  }
  porDia3.set(d, pontos);
}
const X3: number[][] = [];
const y3: number[] = [];
for (const [d, pontos] of porDia3) {
  if (d < JANELAS[0].de || d > JANELAS[0].ate) continue;
  // O alvo em posto dentro do terço: os terços vêm em sequência, um terço de cada vez.
  const n = pontos.length;
  for (let t = 0; t < 3; t++) {
    const a = Math.floor((t * n) / 3);
    const b = Math.floor(((t + 1) * n) / 3);
    const alvo = postosDe(pontos.slice(a, b).map((p) => p.rel));
    for (let j = a; j < b; j++) {
      X3.push(pontos[j].p);
      y3.push(alvo[j - a]);
    }
  }
}
const pesos3 = ridge(X3, y3, 0.1);
console.log("\nPARTE 3 — escolher dentro do terço de agitação (sete entradas, sem a agitação):");
SETE.forEach((i, c) => console.log(`  ${NOME_DA_ENTRADA[ENTRADAS[i]].padEnd(28)} ${pesos3[c] >= 0 ? "+" : ""}${pesos3[c].toFixed(4)}`));
const janelas3 = JANELAS.map((j) => medir(j.nome, j.de, j.ate, porDia3, pesos3));
const fora3 = medir("fora do desenho", JANELAS[1].de, JANELAS[2].ate, porDia3, pesos3);
for (const j of [...janelas3, fora3]) {
  console.log(
    `${j.nome.padEnd(16)} ${j.dias} dias · correlação ${j.ic >= 0 ? "+" : ""}${j.ic.toFixed(4)} (t ${j.t.toFixed(2)}) · décimo de cima − de baixo ${pp(j.decimos)} · as 10 de cima ${pp(j.top10)}, ${(j.top10Acerto * 100).toFixed(1)}% batem a mediana do terço · sem as 5 ${pp(j.top10SemAs5)}`,
  );
}
const [, val3, res3] = janelas3;
const passa3 = fora3.ic > 0 && fora3.t >= 2.5 && val3.ic > 0 && res3.ic > 0 && val3.decimos > 0 && res3.decimos > 0 && val3.top10 > 0 && res3.top10 > 0 && val3.top10SemAs5 > 0 && res3.top10SemAs5 > 0;
// O retorno absoluto das 10 de cima da parte 3, fora do desenho.
const abs3: number[] = [];
for (const [d, pontos] of porDia3) {
  if (d < JANELAS[1].de || d > JANELAS[2].ate) continue;
  for (const x of pontos.map((p) => ({ p, n: notaDe(p.p, pesos3) })).sort((a, b) => a.n - b.n).slice(-10)) abs3.push(x.p.abs);
}
const porque3: string[] = [];
if (!(fora3.ic > 0 && fora3.t >= 2.5)) porque3.push(`a correlação fora do desenho não chega a t 2,5 (${fora3.t.toFixed(2)})`);
if (!(val3.ic > 0 && res3.ic > 0)) porque3.push("a correlação troca de sinal entre a validação e a reserva");
if (!(val3.decimos > 0 && res3.decimos > 0)) porque3.push("o décimo de cima não bate o de baixo nas duas janelas");
if (!(val3.top10 > 0 && res3.top10 > 0)) porque3.push("as 10 de cima não batem a mediana do terço nas duas janelas");
else if (!(val3.top10SemAs5 > 0 && res3.top10SemAs5 > 0)) porque3.push("sem as 5 moedas que mais contribuíram, as 10 de cima deixam de bater");
const escolha = { pesos: pesos3, janelas: [...janelas3, fora3], top10Absoluto: media(abs3), top10Subiram: abs3.filter((v) => v > 0).length / abs3.length, veredito: { passa: passa3, texto: passa3 ? "escolhe: tem vantagem medida fora do desenho" : `não escolhe: ${porque3.join("; ")}` } };
console.log(`  em retorno absoluto, as 10 de cima: ${pc(escolha.top10Absoluto)} por semana, ${(escolha.top10Subiram * 100).toFixed(1)}% subiram`);
console.log(`→ PARTE 3: ${escolha.veredito.texto.toUpperCase()}`);

// ------------------------------------------------------------------ o BTC

console.log("\nbaixando o diário do BTC na Bitstamp…");
const velas = (await getCandles("1d")).filter((v) => (v.time + 86_400) * 1000 <= Date.now());
const fech = velas.map((v) => v.close);
const datas = velas.map((v) => new Date(v.time * 1000).toISOString().slice(0, 10));
const medo = JSON.parse(await readFile(".cache/medo.json", "utf8")) as Record<string, number>;
const maximas: number[] = [];
fech.forEach((c, i) => maximas.push(Math.max(c, maximas[i - 1] ?? 0)));
/** As entradas de cada dia; nulo antes do índice de medo ou com menos de 200 dias. */
const entradas = fech.map((_, i) => entradasDoBtc(fech, i, maximas[i], medo[datas[i]] ?? null));
console.log(`${fech.length} dias, de ${datas[0]} a ${datas[datas.length - 1]}; com as cinco entradas desde ${datas[entradas.findIndex((e) => e !== null)]}`);

function testarBtc(h: number) {
  const subiu = (i: number) => (fech[i + h] > fech[i] ? 1 : 0);
  const inicio = datas.findIndex((d) => d >= "2020-01-01");
  const fim = Math.min(datas.findIndex((d) => d > "2026-10-24") === -1 ? fech.length : datas.findIndex((d) => d > "2026-10-24"), fech.length - h) - 1;
  const linhas: { i: number; p: number; base: number; y: number }[] = [];
  let modelo: Logistica | null = null;
  let anoDoModelo = "";
  for (let i = inicio; i <= fim; i++) {
    const x = entradas[i];
    if (!x) continue;
    // O modelo é refeito a cada virada de ano, só com os dias cujo desfecho já se conhecia nela.
    const ano = datas[i].slice(0, 4);
    if (ano !== anoDoModelo) {
      const corte = datas.findIndex((d) => d >= `${ano}-01-01`);
      const Xa: number[][] = [];
      const ya: number[] = [];
      for (let j = 0; j + h < corte; j++) {
        const e = entradas[j];
        if (e) {
          Xa.push(e);
          ya.push(subiu(j));
        }
      }
      modelo = ajustarLogistica(Xa, ya);
      anoDoModelo = ano;
    }
    // A taxa-base: a fração das janelas já fechadas até hoje que subiram, na mesma amostra do modelo.
    let n = 0;
    let s = 0;
    for (let j = 0; j + h <= i; j++) {
      if (entradas[j]) {
        n++;
        s += subiu(j);
      }
    }
    linhas.push({ i, p: prever(modelo as Logistica, x), base: s / n, y: subiu(i) });
  }
  const brier = (xs: typeof linhas, f: (l: (typeof linhas)[number]) => number) => media(xs.map((l) => (f(l) - l.y) ** 2));
  const ganhoDe = (xs: typeof linhas) => 1 - brier(xs, (l) => l.p) / brier(xs, (l) => l.base);
  // O bootstrap em blocos de 30 dias: dias vizinhos têm quase a mesma janela, e sorteá-los soltos daria um intervalo estreito demais.
  let semente = 12345;
  const sorteio = () => (semente = (semente * 1103515245 + 12345) % 2147483648) / 2147483648;
  const ganhos: number[] = [];
  const blocos = Math.ceil(linhas.length / 30);
  for (let b = 0; b < 2000; b++) {
    const xs: typeof linhas = [];
    for (let k = 0; k < blocos; k++) {
      const a = Math.floor(sorteio() * Math.max(1, linhas.length - 30));
      for (let j = a; j < a + 30 && j < linhas.length; j++) xs.push(linhas[j]);
    }
    ganhos.push(ganhoDe(xs));
  }
  ganhos.sort((a, b) => a - b);
  const meio = Math.floor(linhas.length / 2);
  return { linhas, brierModelo: brier(linhas, (l) => l.p), brierBase: brier(linhas, (l) => l.base), ganho: ganhoDe(linhas), intervalo: [ganhos[50], ganhos[1949]] as [number, number], metades: [ganhoDe(linhas.slice(0, meio)), ganhoDe(linhas.slice(meio))] as [number, number], taxaBase: media(linhas.map((l) => l.y)) };
}

const t30 = testarBtc(HORIZONTE_BTC);
const t7 = testarBtc(7);
const FAIXAS = [0, 0.4, 0.5, 0.6, 0.7, 1.0001];
const calibracao = FAIXAS.slice(0, -1).map((de, k) => {
  const xs = t30.linhas.filter((l) => l.p >= de && l.p < FAIXAS[k + 1]);
  return { de, ate: Math.min(1, FAIXAS[k + 1]), n: xs.length, previsto: xs.length ? media(xs.map((l) => l.p)) : NaN, subiu: xs.length ? media(xs.map((l) => l.y)) : NaN };
});
console.log(
  `30 dias, ${t30.linhas.length} dias de teste: o BTC subiu em ${(t30.taxaBase * 100).toFixed(1)}% das janelas · erro do modelo ${t30.brierModelo.toFixed(4)} contra ${t30.brierBase.toFixed(4)} da taxa-base · ganho ${(t30.ganho * 100).toFixed(1)}% [${(t30.intervalo[0] * 100).toFixed(1)}%, ${(t30.intervalo[1] * 100).toFixed(1)}%] · metades ${(t30.metades[0] * 100).toFixed(1)}% e ${(t30.metades[1] * 100).toFixed(1)}%`,
);
for (const c of calibracao) console.log(`  previu ${(c.de * 100).toFixed(0)}–${(c.ate * 100).toFixed(0)}%: ${c.n} dias, subiu em ${Number.isFinite(c.subiu) ? (c.subiu * 100).toFixed(1) : "—"}%`);
console.log(`7 dias (registro): subiu em ${(t7.taxaBase * 100).toFixed(1)}% · ganho ${(t7.ganho * 100).toFixed(1)}%`);
const passaBtc = t30.intervalo[0] > 0 && t30.metades[0] > 0 && t30.metades[1] > 0;
const vereditoBtc = { passa: passaBtc, texto: passaBtc ? "bate a taxa-base" : `não bate a taxa-base: ${t30.ganho <= 0 ? "erra mais que ela" : t30.intervalo[0] <= 0 ? "a diferença não se separa de zero" : "perde numa das metades do teste"}` };
console.log(`→ BTC: ${vereditoBtc.texto.toUpperCase()}`);

// O modelo que o ao vivo usa: ajustado com todo o dado cujo desfecho se conhece.
const Xt: number[][] = [];
const yt: number[] = [];
for (let j = 0; j + HORIZONTE_BTC < fech.length; j++) {
  const e = entradas[j];
  if (e) {
    Xt.push(e);
    yt.push(fech[j + HORIZONTE_BTC] > fech[j] ? 1 : 0);
  }
}

const limpa = (j: JanelaMedida & { ics?: unknown }): JanelaMedida => {
  const { ics: _ics, ...resto } = j;
  void _ics;
  return resto;
};
const medicao: MedicaoPrevisao = {
  geradoEm: Date.now(),
  moedas: { pesos, diagnostico, escolha: { ...escolha, janelas: escolha.janelas.map(limpa) }, janelas: [...janelas, fora].map(limpa), decimos: decimos.map((q) => ({ retorno: q.soma / q.n, acerto: q.acertos / q.n, n: q.n })), veredito: vereditoMoedas },
  btc: {
    de: Date.parse(datas[t30.linhas[0].i]),
    ate: Date.parse(datas[t30.linhas[t30.linhas.length - 1].i]),
    dias: t30.linhas.length,
    taxaBase: t30.taxaBase,
    brierModelo: t30.brierModelo,
    brierBase: t30.brierBase,
    ganho: t30.ganho,
    intervalo: t30.intervalo,
    ganhoMetades: t30.metades,
    calibracao,
    modelo: ajustarLogistica(Xt, yt),
    veredito: vereditoBtc,
    seteDias: { taxaBase: t7.taxaBase, ganho: t7.ganho },
  },
};
await writeFile("data/previsao-medicao.json", `${JSON.stringify(medicao)}\n`);
console.log("\ndata/previsao-medicao.json gravado");
