/**
 * O JUIZ DAS BALEIAS, PARA FRENTE (a segunda emenda de `docs/preregistro-baleias.md`):
 * os mesmos quatro sinais e o mesmo critério, sobre a primeira leitura completa de
 * cada dia UTC do ao vivo (`data/baleias-hl-AAAA-MM.jsonl`, desde a primeira gravada) — as
 * posições lidas direto, sem reconstrução e sem o viés do ranking.
 *
 * O retorno entra no FECHAMENTO do dia da leitura (a leitura sai de madrugada;
 * entrar depois dela é não olhar o futuro) e sai no fechamento h dias depois,
 * menos a mediana do mesmo retorno dos perpétuos da Hyperliquid com US$ 1 milhão
 * de volume no dia — as velas diárias vêm da própria Hyperliquid, sem chave.
 *
 * Com menos de 90 dias de leituras, diz "amostra insuficiente" e não grava nada.
 *
 * Rode com: npx tsx scripts/medir-baleias-ao-vivo.mts
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { fluxoEntre, type LinhaDiariaDasContas, type MedicaoBaleias, type SinalMedido } from "../lib/hyperliquid";

const DIA = 86_400_000;
const DIAS_MINIMOS = 90;
const HORIZONTES = [1, 3, 7];
const MINIMO_MOEDAS_NO_DIA = 10;

/** Uma linha do histórico diário do ao vivo (`scripts/baleias-hl.mts`). */
interface Linha {
  t: number;
  m: string;
  p: number;
  c: number;
  v: number;
  k: number | null;
  ke: number | null;
  cc: number | null;
}

const linhas: Linha[] = [];
for (const arq of (await readdir("data").catch(() => [] as string[])).filter((a) => /^baleias-hl-\d{4}-\d{2}\.jsonl$/.test(a))) {
  for (const l of (await readFile(`data/${arq}`, "utf8")).split("\n")) if (l.trim()) linhas.push(JSON.parse(l) as Linha);
}
const porDia = new Map<number, Map<string, Linha>>();
for (const l of linhas) {
  const d = Math.floor(l.t / DIA) * DIA;
  const m = porDia.get(d) ?? new Map<string, Linha>();
  m.set(l.m, l);
  porDia.set(d, m);
}
// A mesma leitura conta a conta (`data/baleias-hl-contas-AAAA-MM.jsonl`): o fluxo sai dela.
const contasPorDia = new Map<number, LinhaDiariaDasContas>();
for (const arq of (await readdir("data").catch(() => [] as string[])).filter((a) => /^baleias-hl-contas-\d{4}-\d{2}\.jsonl$/.test(a))) {
  for (const l of (await readFile(`data/${arq}`, "utf8")).split("\n")) {
    if (!l.trim()) continue;
    const x = JSON.parse(l) as LinhaDiariaDasContas;
    contasPorDia.set(Math.floor(x.t / DIA) * DIA, x);
  }
}
const dias = [...porDia.keys()].sort((x, y) => x - y);
console.log(`${dias.length} dias de leituras diárias${dias.length ? `, de ${new Date(dias[0]).toISOString().slice(0, 10)} a ${new Date(dias[dias.length - 1]).toISOString().slice(0, 10)}` : ""}`);
if (dias.length < DIAS_MINIMOS) {
  console.log(`amostra insuficiente: ${dias.length} de ${DIAS_MINIMOS} dias — o critério só é lido com ${DIAS_MINIMOS} (docs/preregistro-baleias.md, segunda emenda)`);
  process.exit(0);
}

// ------------------------------------------------------------------ as velas

const moedas = [...new Set(linhas.map((l) => l.m))];
const meta = (await (await fetch("https://api.hyperliquid.xyz/info", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "meta" }) })).json()) as { universe: { name: string }[] };
const todas = [...new Set([...meta.universe.map((u) => u.name), ...moedas])];
const CACHE = ".cache/hl/velas-ao-vivo";
await mkdir(CACHE, { recursive: true });
/** Por moeda, pela abertura do dia: [fechamento, volume em dólar]. */
const velas = new Map<string, Map<number, [number, number]>>();
for (const moeda of todas) {
  const arq = `${CACHE}/${encodeURIComponent(moeda)}.json`;
  let vs: { t: number; c: string; v: string }[] | null = null;
  if (existsSync(arq) && Date.now() - JSON.parse(await readFile(arq, "utf8")).em < DIA) vs = JSON.parse(await readFile(arq, "utf8")).vs;
  if (!vs) {
    const r = await fetch("https://api.hyperliquid.xyz/info", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "candleSnapshot", req: { coin: moeda, interval: "1d", startTime: dias[0] - 10 * DIA, endTime: Date.now() } }),
    });
    if (!r.ok) continue;
    vs = (await r.json()) as { t: number; c: string; v: string }[];
    await writeFile(arq, JSON.stringify({ em: Date.now(), vs }));
    // O teto da API: 1.200 de peso por minuto, e cada pedido destes pesa ~20.
    await new Promise((res) => setTimeout(res, 1200));
  }
  velas.set(moeda, new Map(vs.map((v) => [v.t, [Number(v.c), Number(v.v) * Number(v.c)] as [number, number]])));
}
const fechamento = (m: string, d: number) => velas.get(m)?.get(d)?.[0];

/** O retorno de h dias a partir do fechamento do dia `d`, menos a mediana das moedas com US$ 1 mi de volume nele. */
function relativos(d: number, h: number): Map<string, number> {
  const brutos = new Map<string, number>();
  for (const [m, vs] of velas) {
    const v = vs.get(d);
    const fim = vs.get(d + h * DIA)?.[0];
    if (!v || !(v[0] > 0) || v[1] < 1e6 || fim === undefined || !(fim > 0)) continue;
    brutos.set(m, fim / v[0] - 1);
  }
  const o = [...brutos.values()].sort((x, y) => x - y);
  if (o.length < MINIMO_MOEDAS_NO_DIA) return new Map();
  const meio = o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2;
  return new Map([...brutos].map(([m, r]) => [m, r - meio]));
}

// ------------------------------------------------------------------ os sinais

const sinais: Record<"consenso" | "espertas" | "fluxo", Map<number, Map<string, number>>> = { consenso: new Map(), espertas: new Map(), fluxo: new Map() };
for (const d of dias) {
  const hoje = porDia.get(d)!;
  const k = new Map<string, number>();
  const ke = new Map<string, number>();
  for (const [m, l] of hoje) {
    if (l.k !== null) k.set(m, l.k);
    if (l.ke !== null) ke.set(m, l.ke);
  }
  sinais.consenso.set(d, k);
  sinais.espertas.set(d, ke);
  // O fluxo de 3 dias: as contas lidas nas duas datas, ao preço de hoje (`fluxoEntre`,
  // a mesma função do ao vivo, e a régua da terceira emenda). Sem as duas leituras
  // conta a conta, o dia fica sem fluxo — o histórico por moeda soma o universo
  // inteiro de cada dia e não sabe quem estava nas duas.
  const u = contasPorDia.get(d);
  const u3 = contasPorDia.get(d - 3 * DIA);
  sinais.fluxo.set(d, u && u3 ? fluxoEntre(u3.u, u.u, new Map(Object.entries(u.p))) : new Map());
}

// ------------------------------------------------------------------ a estatística (a mesma de `medir-baleias`)

function postos(xs: number[]): number[] {
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
function spearman(x: number[], y: number[]): number {
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
const media = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;
const desvio = (xs: number[]) => Math.sqrt(xs.reduce((s, v) => s + (v - media(xs)) ** 2, 0) / (xs.length - 1));
const tDe = (xs: number[]) => (xs.length > 2 ? (media(xs) / desvio(xs)) * Math.sqrt(xs.length) : NaN);
/** Os dias que não se sobrepõem num horizonte de h dias: o primeiro e, daí em diante, cada um a h dias ou mais do último escolhido — dia sem leitura não encurta o passo. */
function naoSobrepostos<T extends { d: number }>(xs: T[], h: number): T[] {
  const out: T[] = [];
  for (const x of xs) if (out.length === 0 || x.d - out[out.length - 1].d >= h * DIA) out.push(x);
  return out;
}
const corte = dias[Math.floor(dias.length / 2)];

const resultados: SinalMedido[] = [];
const vereditos: MedicaoBaleias["vereditos"] = [];
for (const s of ["consenso", "espertas", "fluxo"] as const) {
  for (const h of HORIZONTES) {
    const ics: { d: number; ic: number; q: number }[] = [];
    let moedasNoDia = 0;
    for (const d of dias) {
      const r = relativos(d, h);
      const pares = [...(sinais[s].get(d) ?? [])].filter(([m]) => r.has(m)).map(([m, v]) => [v, r.get(m) as number] as const);
      if (pares.length < MINIMO_MOEDAS_NO_DIA) continue;
      const ic = spearman(pares.map((p) => p[0]), pares.map((p) => p[1]));
      if (!Number.isFinite(ic)) continue;
      const ord = [...pares].sort((p, q) => p[0] - q[0]);
      const n5 = Math.max(1, Math.floor(ord.length / 5));
      ics.push({ d, ic, q: media(ord.slice(-n5).map((p) => p[1])) - media(ord.slice(0, n5).map((p) => p[1])) });
      moedasNoDia += pares.length;
    }
    if (ics.length < 3) {
      console.log(`${s} ${h} d: sem dias com ${MINIMO_MOEDAS_NO_DIA} moedas`);
      continue;
    }
    const a = ics.filter((x) => x.d < corte);
    const b = ics.filter((x) => x.d >= corte);
    const r: SinalMedido = {
      sinal: s,
      horizonte: h,
      icMedio: media(ics.map((x) => x.ic)),
      t: tDe(naoSobrepostos(ics, h).map((x) => x.ic)),
      dias: ics.length,
      moedasPorDia: moedasNoDia / ics.length,
      icMetades: [media(a.map((x) => x.ic)), media(b.map((x) => x.ic))],
      quintos: media(ics.map((x) => x.q)),
      quintosMetades: [media(a.map((x) => x.q)), media(b.map((x) => x.q))],
    };
    resultados.push(r);
    if (h === 7) {
      const ok = Math.abs(r.t) >= 2.5 && Math.sign(r.icMetades[0]) === Math.sign(r.icMetades[1]) && Math.sign(r.quintosMetades[0]) === Math.sign(r.quintosMetades[1]) && Math.sign(r.quintosMetades[0]) === Math.sign(r.icMedio);
      vereditos.push({ sinal: s, passa: ok, texto: ok ? `tem vantagem, ${r.icMedio > 0 ? "a favor das baleias" : "ao contrário das baleias"}` : "sem vantagem medida" });
    }
    console.log(`${s} ${h} d: IC ${r.icMedio.toFixed(3)} (t ${r.t.toFixed(2)}, ${r.dias} dias) · metades ${r.icMetades.map((x) => x.toFixed(3)).join(" e ")} · quintos ${(r.quintos * 100).toFixed(2)} p.p.`);
  }
}

// O suporte: o preço volta a até 3% do custo médio das baleias compradas, vindo de 5 fechamentos mais de 5% acima.
const eventos: { d: number; m: string; r: number }[] = [];
const ultimo = new Map<string, number>();
for (const d of dias) {
  const r7 = relativos(d, 7);
  for (const [m, l] of porDia.get(d)!) {
    if (l.cc === null || !(l.cc > 0) || !r7.has(m)) continue;
    const f = fechamento(m, d);
    if (f === undefined || Math.abs(f / l.cc - 1) > 0.03) continue;
    let deCima = true;
    for (let k = 1; k <= 5; k++) {
      const x = fechamento(m, d - k * DIA);
      if (x === undefined || !(x > 1.05 * l.cc)) {
        deCima = false;
        break;
      }
    }
    const u = ultimo.get(m);
    if (!deCima || (u !== undefined && d - u < 7 * DIA)) continue;
    ultimo.set(m, d);
    eventos.push({ d, m, r: r7.get(m) as number });
  }
}
const rs = eventos.map((e) => e.r);
const sa = eventos.filter((e) => e.d < corte).map((e) => e.r);
const sb = eventos.filter((e) => e.d >= corte).map((e) => e.r);
const nMoedas = new Set(eventos.map((e) => e.m)).size;
const okSup = Math.abs(tDe(rs)) >= 2.5 && Math.sign(media(sa)) === Math.sign(media(sb)) && rs.length >= 30 && nMoedas >= 10;
vereditos.push({ sinal: "suporte", passa: okSup, texto: rs.length < 30 || nMoedas < 10 ? "amostra insuficiente" : okSup ? (media(rs) > 0 ? "tem vantagem: segura como suporte" : "tem vantagem ao contrário: o preço rompe") : "sem vantagem medida" });
console.log(`suporte 7 d: ${rs.length} eventos em ${nMoedas} moedas, média ${rs.length ? (media(rs) * 100).toFixed(2) : "—"} p.p. (t ${tDe(rs).toFixed(2)})`);

const medicao: MedicaoBaleias = {
  geradoEm: Date.now(),
  janela: { de: dias[0], ate: dias[dias.length - 1], corte },
  contas: { lidas: 0, altaFrequencia: 0, semArquivo: 0 },
  grupos: [
    {
      id: "VIVO",
      nome: `ao vivo, desde ${new Date(dias[0]).toISOString().slice(0, 10)} (US$ 5 mi ou mais, sem market makers)`,
      contas: 0,
      coberturaMediana: 0,
      sinais: resultados,
      suporte: { eventos: rs.length, moedas: nMoedas, media: rs.length ? media(rs) : NaN, t: tDe(rs), metades: [sa.length ? media(sa) : NaN, sb.length ? media(sb) : NaN], porMetade: [sa.length, sb.length] },
    },
  ],
  vereditos,
};
await writeFile("data/baleias-medicao.json", `${JSON.stringify(medicao)}\n`);
console.log("data/baleias-medicao.json gravado");
