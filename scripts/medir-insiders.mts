/**
 * CRIADOR OU VC DEPOSITANDO EM CORRETORA ANTECEDE QUEDA? A medição do
 * pré-registro (`docs/preregistro-insiders.md`), sobre os eventos que
 * `scripts/insiders.mts` gravou em `data/insiders.json`.
 *
 * O retorno é o do perpétuo da Binance, do fechamento do dia do evento ao
 * fechamento h dias depois, MENOS a mediana do mesmo retorno de todos os
 * perpétuos USDT com vela nas duas pontas — senão "caiu depois do depósito"
 * mediria o mercado caindo. As velas são as de 1 h do Data Vision que a medição
 * dos robôs já guarda em `.cache/robos/` (`npm run medir-robos` as baixa); o
 * fechamento do dia é o da vela das 23 h UTC.
 *
 * Moeda com faixa perdida na leitura fica fora, contada: transferência que não
 * foi lida é depósito que não foi visto, e o evento que falta não é "dia sem
 * depósito".
 *
 * Rode com: npx tsx scripts/medir-insiders.mts
 */

import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { media, tDe } from "../lib/juizBaleias";
import type { ArquivoInsiders, Evento, MedicaoInsiders } from "../lib/insiders";

const DIA = 86_400_000;
const HORA = 3_600_000;
const HORIZONTES = [1, 3, 7];
const CACHE = ".cache/robos";

const arquivo = JSON.parse(await readFile("data/insiders.json", "utf8")) as ArquivoInsiders;
const foraDaMedicao: Record<string, string> = { ...arquivo.fora };
const eventos: (Evento & { symbol: string })[] = [];
const moedas: string[] = [];
for (const [symbol, l] of Object.entries(arquivo.moedas)) {
  if (l.faixasPerdidas > 0) {
    foraDaMedicao[symbol] = `${l.faixasPerdidas} faixas de bloco que nenhum nó entregou`;
    continue;
  }
  if (!existsSync(`${CACHE}/${symbol}`)) {
    foraDaMedicao[symbol] = "sem perpétuo com velas no cache";
    continue;
  }
  moedas.push(symbol);
  for (const e of l.eventos) eventos.push({ ...e, symbol });
}
console.log(`${moedas.length} moedas na medição (${moedas.map((m) => m.replace(/USDT$/, "")).join(", ")}); fora: ${Object.entries(foraDaMedicao).map(([k, v]) => `${k.replace(/USDT$/, "")} (${v})`).join("; ") || "nenhuma"}`);
console.log(`${eventos.filter((e) => e.tipo === "corretora").length} eventos de depósito em corretora e ${eventos.filter((e) => e.tipo === "marketmaker").length} de entrega a market maker, antes de exigir o retorno`);

// ------------------------------------------------------------------ os fechamentos

/** Os dias de que a medição precisa: o do evento e os h dias depois. */
const dias = new Set<number>();
for (const e of eventos) {
  dias.add(e.dia);
  for (const h of HORIZONTES) dias.add(e.dia + h * DIA);
}
const meses = new Map<string, number[]>();
for (const d of dias) {
  const mes = new Date(d).toISOString().slice(0, 7);
  meses.set(mes, [...(meses.get(mes) ?? []), d]);
}
/** dia → símbolo → fechamento (o da vela das 23 h UTC). Só os dias precisos: o cache inteiro são 843 MB. */
const fechamentos = new Map<number, Map<string, number>>();
for (const d of dias) fechamentos.set(d, new Map());
const simbolos = (await readdir(CACHE, { withFileTypes: true })).filter((x) => x.isDirectory()).map((x) => x.name);
for (const symbol of simbolos) {
  for (const [mes, ds] of meses) {
    const arq = `${CACHE}/${symbol}/${mes}.json`;
    if (!existsSync(arq)) continue;
    const { velas } = JSON.parse(await readFile(arq, "utf8")) as { velas: number[][] };
    const alvo = new Map(ds.map((d) => [d + 23 * HORA, d]));
    for (const v of velas) {
      const d = alvo.get(v[0]);
      if (d !== undefined && v[4] > 0 && Number.isFinite(v[4])) fechamentos.get(d)?.set(symbol, v[4]);
    }
  }
}

/** O retorno relativo de `symbol` de `d` a `d + h` dias; nulo sem as duas pontas ou com menos de 50 perpétuos na referência. */
function relativo(symbol: string, d: number, h: number): number | null {
  const a = fechamentos.get(d);
  const b = fechamentos.get(d + h * DIA);
  const pa = a?.get(symbol);
  const pb = b?.get(symbol);
  if (!a || !b || pa === undefined || pb === undefined) return null;
  const todos: number[] = [];
  for (const [s, x] of a) {
    const y = b.get(s);
    if (y !== undefined) todos.push(y / x - 1);
  }
  if (todos.length < 50) return null;
  todos.sort((x, y) => x - y);
  const meio = todos.length % 2 ? todos[(todos.length - 1) / 2] : (todos[todos.length / 2 - 1] + todos[todos.length / 2]) / 2;
  return pb / pa - 1 - meio;
}

// ------------------------------------------------------------------ a medição

const mediana = (xs: number[]) => {
  const o = [...xs].sort((x, y) => x - y);
  return o.length === 0 ? NaN : o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
};
const pp = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)} p.p.` : "—");

const medicao: MedicaoInsiders = { geradoEm: Date.now(), janela: { de: Math.min(...eventos.map((e) => e.dia), Date.now()), ate: Math.max(...eventos.map((e) => e.dia), 0) }, moedas, foraDaMedicao, eventos: [] };
for (const tipo of ["corretora", "marketmaker"] as const) {
  const doTipo = eventos.filter((e) => e.tipo === tipo).sort((x, y) => x.dia - y.dia);
  const horizontes: MedicaoInsiders["eventos"][number]["horizontes"] = [];
  let veredito = { passa: false, texto: "amostra insuficiente" };
  let n7 = 0;
  let moedas7 = 0;
  for (const h of HORIZONTES) {
    const com = doTipo.map((e) => ({ e, r: relativo(e.symbol, e.dia, h) })).filter((x): x is { e: (typeof doTipo)[number]; r: number } => x.r !== null);
    const rs = com.map((x) => x.r);
    const meio = Math.floor(com.length / 2);
    const metades: [number, number] = [meio > 0 ? media(rs.slice(0, meio)) : NaN, com.length - meio > 0 ? media(rs.slice(meio)) : NaN];
    // Sem a moeda com mais eventos: o resultado não pode ser de uma moeda só.
    const porMoeda = new Map<string, number>();
    for (const x of com) porMoeda.set(x.e.symbol, (porMoeda.get(x.e.symbol) ?? 0) + 1);
    const maior = [...porMoeda].sort((x, y) => y[1] - x[1])[0]?.[0];
    const semAMaior = com.filter((x) => x.e.symbol !== maior).map((x) => x.r);
    const linha = { dias: h, n: rs.length, media: rs.length ? media(rs) : NaN, mediana: mediana(rs), t: tDe(rs), metades, semAMaior: semAMaior.length ? media(semAMaior) : NaN };
    horizontes.push(linha);
    console.log(
      `${tipo === "corretora" ? "depósito em corretora" : "entrega a market maker"} · ${h} d: ${linha.n} eventos em ${porMoeda.size} moedas · média ${pp(linha.media)} · mediana ${pp(linha.mediana)} · t ${Number.isFinite(linha.t) ? linha.t.toFixed(2) : "—"} · metades ${pp(metades[0])} e ${pp(metades[1])} · sem ${maior?.replace(/USDT$/, "") ?? "—"} ${pp(linha.semAMaior)}`,
    );
    if (h === 7) {
      console.log(`    por moeda: ${[...porMoeda].sort((x, y) => y[1] - x[1]).map(([m, n]) => `${m.replace(/USDT$/, "")} ${n}`).join(", ") || "nenhuma"} · sem retorno (antes do perpétuo listar, ou depois do fim das velas): ${doTipo.length - com.length}`);
      n7 = linha.n;
      moedas7 = porMoeda.size;
      // O critério do pré-registro: 30 eventos em 8 moedas; |t| ≥ 2,5; o mesmo lado nas duas metades e sem a moeda com mais eventos.
      if (linha.n >= 30 && porMoeda.size >= 8) {
        const lado = Math.sign(linha.media);
        const passa = Math.abs(linha.t) >= 2.5 && Math.sign(metades[0]) === lado && Math.sign(metades[1]) === lado && Math.sign(linha.semAMaior) === lado;
        veredito = { passa, texto: passa ? (lado < 0 ? "tem vantagem: o preço cai depois, contra o mercado" : "tem vantagem ao contrário: o preço sobe depois, contra o mercado") : "sem vantagem medida" };
      }
    }
  }
  console.log(`  → ${veredito.texto.toUpperCase()} (${n7} eventos em ${moedas7} moedas no horizonte de 7 dias; o critério pede 30 em 8)`);
  medicao.eventos.push({ tipo, n: n7, moedas: moedas7, horizontes, veredito });
}
await writeFile("data/insiders-medicao.json", `${JSON.stringify(medicao)}\n`);
console.log("data/insiders-medicao.json gravado");
