/**
 * Os sinais de gráfico e de derivativos, medidos sobre TODOS os perpétuos.
 *
 * A pergunta veio de fora e é a de sempre: "dá para achar oportunidade com RSI,
 * resistência, modelo estatístico, OI, smart money?". Nada disso tinha sido
 * medido aqui — o `parametros.mts` testou rompimentos, e só sobre as ~70 moedas
 * da lista. Este script mede sobre os 528 perpétuos USDT da Binance, até mil dias
 * de cada, e responde do jeito que o projeto exige.
 *
 * COMO CADA SINAL É LIDO, e cada escolha fecha um jeito de o resultado mentir:
 *
 *   EXCESSO SOBRE O MESMO DIA   o retorno de 7 dias menos a mediana de TODAS as
 *                               moedas naquele dia. Sem isso, "comprar RSI < 30"
 *                               mediria o mercado subindo, não o sinal.
 *   UM EVENTO POR EPISÓDIO      depois de disparar, a moeda fica 7 dias fora. RSI
 *                               abaixo de 30 dura dias seguidos e contaria a
 *                               mesma queda cinco vezes.
 *   AS DUAS METADES             o efeito tem de aparecer antes e depois do corte.
 *   MOEDAS A FAVOR              mediana puxada por duas moedas é o modo mais
 *                               comum de um resultado mentir aqui.
 *   COMO TRADE                  com stop, custo e funding. O garimpo já mostrou
 *                               um sinal que acerta a direção e perde dinheiro:
 *                               o caminho estopa antes de a reversão vir.
 *
 * O QUE SAIU EM 23/09, sobre 319 mil moeda-dias:
 *
 *   - Sinal de COMPRA clássico não funciona. RSI < 30 −0,03 p.p.; perto do
 *     suporte +0,02; tendência de EMA −0,15. Rompimento de máxima de 20 dias
 *     PERDE −0,84 p.p. (195 de 498 moedas a favor), volume 3x na alta −2,2, e
 *     funding ≤ −0,1% — o "combustível de squeeze" — −4,9 p.p.: quem está
 *     vendido costuma ter razão.
 *   - O que tem efeito está no lado de VENDER O EXAGERO: RSI > 80 +3,2 p.p.,
 *     pump de 25% num dia +8,5 (236 de 334 moedas). Como trade, quase tudo dá
 *     zero ou negativo: o squeeze estopa antes.
 *   - "Vender RSI > 80 em moeda de 30 a 100 milhões" parecia a exceção, +2,5%
 *     por trade com stop. Atacado, caiu: mediana de −8%, +0,04 R por trade,
 *     negativo com a faixa em 20–150 ou 100–200 mi, e o trimestre de agora
 *     negativo. É sobreajuste de faixa, e a seção 3 imprime isso a cada rodada.
 *   - Smart money (top traders comprando com o varejo vendendo): +0,39 p.p.,
 *     p = 0,21. Acaso. OI e razões de posição só existem para 30 dias.
 *
 * A seção 4 mede o fluxo on-chain da carteira quente da Binance, que o
 * `npm run fluxo-binance` grava a cada retrato, em DUAS PORTAS que dizem coisas
 * opostas: varejo comprando/vendendo na DEX pelo executor de swap, e depósito/
 * saque direto. Diz "amostra insuficiente" até que haja amostra.
 *
 * Rode com: npm run medir-sinais               (usa o cache de até 20 horas)
 *           npm run medir-sinais -- --recoletar
 */

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";

const BASE = "https://www.binance.com";
const CACHE = ".cache/sinais/universo.json";
const DIA = 86_400_000;

// ------------------------------------------------------------------ coleta

type Kline = [number, string, string, string, string, string, number, string];
interface Funding { fundingTime: number; fundingRate: string }
interface OiHist { timestamp: number; sumOpenInterestValue: string; CMCCirculatingSupply?: string }
interface Razao { timestamp: number; longShortRatio: string }
interface Taker { timestamp: number; buySellRatio: string }
interface Bruto { onboard: number; k: Kline[]; f: Funding[]; oi: OiHist[]; top: Razao[]; glob: Razao[]; tak: Taker[] }

let emVoo = 0;
const fila: (() => void)[] = [];
async function pegar<T>(caminho: string): Promise<T[]> {
  // Oito por vez, e não os 24 do `lib/binance.ts`: aqui são 3.200 requisições
  // numa rajada, e os caminhos de `/futures/data` têm teto próprio por IP.
  while (emVoo >= 8) await new Promise<void>((r) => fila.push(r));
  emVoo++;
  try {
    for (let t = 0; t < 5; t++) {
      try {
        const res = await fetch(BASE + caminho, { signal: AbortSignal.timeout(30_000) });
        if (res.status === 429 || res.status === 418) {
          await new Promise((s) => setTimeout(s, 10_000 * (t + 1)));
          continue;
        }
        if (!res.ok) return [];
        const d = await res.json();
        return Array.isArray(d) ? (d as T[]) : [];
      } catch {
        await new Promise((s) => setTimeout(s, 1500 * (t + 1)));
      }
    }
    return [];
  } finally {
    emVoo--;
    fila.shift()?.();
  }
}

async function coletar(): Promise<Record<string, Bruto>> {
  const recoletar = process.argv.includes("--recoletar");
  try {
    const idade = Date.now() - (await stat(CACHE)).mtimeMs;
    if (!recoletar && idade < 20 * 3_600_000) {
      console.log(`usando o cache de ${(idade / 3_600_000).toFixed(1)} h (--recoletar para refazer)`);
      return JSON.parse(await readFile(CACHE, "utf8")) as Record<string, Bruto>;
    }
  } catch {
    // sem cache: coleta
  }
  const res = await fetch(`${BASE}/fapi/v1/exchangeInfo`, { signal: AbortSignal.timeout(30_000) });
  const info = (await res.json()) as { symbols: { symbol: string; contractType: string; quoteAsset: string; status: string; onboardDate: number }[] };
  const perps = info.symbols.filter((s) => s.contractType === "PERPETUAL" && s.quoteAsset === "USDT" && s.status === "TRADING");
  console.log(`coletando ${perps.length} perpétuos…`);
  const out: Record<string, Bruto> = {};
  await Promise.all(
    perps.map(async (p) => {
      const s = p.symbol;
      const [k, f, oi, top, glob, tak] = await Promise.all([
        pegar<Kline>(`/fapi/v1/klines?symbol=${s}&interval=1d&limit=1000`),
        pegar<Funding>(`/fapi/v1/fundingRate?symbol=${s}&limit=1000`),
        pegar<OiHist>(`/futures/data/openInterestHist?symbol=${s}&period=1d&limit=30`),
        pegar<Razao>(`/futures/data/topLongShortPositionRatio?symbol=${s}&period=1d&limit=30`),
        pegar<Razao>(`/futures/data/globalLongShortAccountRatio?symbol=${s}&period=1d&limit=30`),
        pegar<Taker>(`/futures/data/takerlongshortRatio?symbol=${s}&period=1d&limit=30`),
      ]);
      out[s] = { onboard: p.onboardDate, k, f, oi, top, glob, tak };
    }),
  );
  const semVelas = Object.values(out).filter((b) => b.k.length === 0).length;
  // "Não consegui" não pode virar "não houve": moeda sem vela sai da medição e
  // a contagem aparece.
  if (semVelas > 0) console.log(`  ${semVelas} perpétuo(s) sem vela — fora da medição`);
  await mkdir(".cache/sinais", { recursive: true });
  await writeFile(CACHE, JSON.stringify(out));
  return out;
}

// ------------------------------------------------------------------ série

interface Vela { t: number; o: number; h: number; l: number; c: number; v: number }
interface Ponto {
  s: string; i: number; t: number; c: number;
  ret1: number; ret3: number; rsi: number; z: number; vol20: number;
  max20: number; min20: number; volRel: number; ema20: number; ema50: number;
  res: number | null; sup: number | null;
  fund: number | null; oi3: number | null; top3: number | null; glob3: number | null;
  taker: number | null; topNivel: number | null; globNivel: number | null;
  mcap: number | null; fwd3: number | null; fwd7: number | null;
}

/** RSI de Wilder — o mesmo de `lib/bitcoin.ts`. */
function rsiSerie(c: number[], n = 14): number[] {
  const out = new Array<number>(c.length).fill(NaN);
  let g = 0, p = 0;
  for (let i = 1; i <= n && i < c.length; i++) {
    const d = c[i] - c[i - 1];
    if (d > 0) g += d; else p -= d;
  }
  g /= n; p /= n;
  if (c.length > n) out[n] = p === 0 ? 100 : 100 - 100 / (1 + g / p);
  for (let i = n + 1; i < c.length; i++) {
    const d = c[i] - c[i - 1];
    g = (g * (n - 1) + Math.max(d, 0)) / n;
    p = (p * (n - 1) + Math.max(-d, 0)) / n;
    out[i] = p === 0 ? 100 : 100 - 100 / (1 + g / p);
  }
  return out;
}
function ema(c: number[], n: number): number[] {
  const k = 2 / (n + 1);
  const out: number[] = [];
  let e = c[0];
  for (const x of c) { e = x * k + e * (1 - k); out.push(e); }
  return out;
}

/**
 * Pivô com três velas de cada lado, como em `lib/tecnica.ts` — e só CONFIRMADO:
 * no dia i só existem os pivôs até i − 3. Usar o pivô de ontem seria olhar três
 * dias à frente para desenhar a resistência.
 */
const LADO = 3;

function montar(s: string, b: Bruto): { velas: Vela[]; pts: Ponto[] } {
  const agora = Date.now();
  const velas: Vela[] = b.k
    .map((x) => ({ t: x[0], o: +x[1], h: +x[2], l: +x[3], c: +x[4], v: +x[7] }))
    // Vela ainda aberta mediria o futuro do próprio dia.
    .filter((x) => x.t + DIA <= agora && x.c > 0);
  if (velas.length < 60) return { velas, pts: [] };
  const c = velas.map((x) => x.c);
  const r = rsiSerie(c), e20 = ema(c, 20), e50 = ema(c, 50);

  const fund = new Map<number, number[]>();
  for (const x of b.f) {
    const d = Math.floor(x.fundingTime / DIA) * DIA;
    const l = fund.get(d) ?? [];
    l.push(+x.fundingRate);
    fund.set(d, l);
  }
  const porDia = <T extends { timestamp: number }>(arr: T[], ler: (x: T) => number) =>
    new Map(arr.map((x) => [Math.floor(x.timestamp / DIA) * DIA, ler(x)]));
  const oi = porDia(b.oi, (x) => +x.sumOpenInterestValue);
  const top = porDia(b.top, (x) => +x.longShortRatio);
  const glob = porDia(b.glob, (x) => +x.longShortRatio);
  const tak = porDia(b.tak, (x) => +x.buySellRatio);
  const em3 = (m: Map<number, number>, t: number) => {
    const a = m.get(t), z = m.get(t - 3 * DIA);
    return a && z ? a / z - 1 : null;
  };
  // Market cap pelo circulante de HOJE vezes o preço de cada dia. É aproximação,
  // e ela erra para cima no passado de moeda que desbloqueou supply desde então.
  const ultOi = b.oi[b.oi.length - 1];
  const circulante = ultOi?.CMCCirculatingSupply ? +ultOi.CMCCirculatingSupply : 0;

  const topos: number[] = [], fundos: number[] = [];
  for (let i = LADO; i < velas.length - LADO; i++) {
    let mx = true, mn = true;
    for (let j = i - LADO; j <= i + LADO; j++) {
      if (j === i) continue;
      if (velas[j].h >= velas[i].h) mx = false;
      if (velas[j].l <= velas[i].l) mn = false;
    }
    if (mx) topos.push(i);
    if (mn) fundos.push(i);
  }

  const pts: Ponto[] = [];
  for (let i = 50; i < velas.length; i++) {
    const w = c.slice(i - 19, i + 1);
    const m = w.reduce((a, x) => a + x, 0) / 20;
    const sd = Math.sqrt(w.reduce((a, x) => a + (x - m) ** 2, 0) / 20);
    const lr: number[] = [];
    for (let j = i - 19; j <= i; j++) lr.push(Math.log(c[j] / c[j - 1]));
    const ml = lr.reduce((a, x) => a + x, 0) / 20;
    const vol20 = Math.sqrt(lr.reduce((a, x) => a + (x - ml) ** 2, 0) / 19);
    let max20 = -Infinity, min20 = Infinity, vm = 0;
    for (let j = i - 20; j < i; j++) { max20 = Math.max(max20, velas[j].h); min20 = Math.min(min20, velas[j].l); vm += velas[j].v; }
    vm /= 20;
    let res: number | null = null, sup: number | null = null;
    for (const j of topos) if (j <= i - LADO && velas[j].h > c[i] && (res === null || velas[j].h < res)) res = velas[j].h;
    for (const j of fundos) if (j <= i - LADO && velas[j].l < c[i] && (sup === null || velas[j].l > sup)) sup = velas[j].l;
    const t = velas[i].t;
    const f = fund.get(t);
    pts.push({
      s, i, t, c: c[i], ret1: c[i] / c[i - 1] - 1, ret3: c[i] / c[i - 3] - 1, rsi: r[i],
      z: sd > 0 ? (c[i] - m) / sd : 0, vol20, max20, min20, volRel: vm > 0 ? velas[i].v / vm : NaN,
      ema20: e20[i], ema50: e50[i], res, sup,
      fund: f ? f.reduce((a, x) => a + x, 0) / f.length : null,
      oi3: em3(oi, t), top3: em3(top, t), glob3: em3(glob, t), taker: tak.get(t) ?? null,
      topNivel: top.get(t) ?? null, globNivel: glob.get(t) ?? null,
      mcap: circulante > 0 ? circulante * c[i] : null,
      fwd3: i + 3 < velas.length ? c[i + 3] / c[i] - 1 : null,
      fwd7: i + 7 < velas.length ? c[i + 7] / c[i] - 1 : null,
    });
  }
  return { velas, pts };
}

// ------------------------------------------------------------------ medir

const bruto = await coletar();
const todos: Ponto[] = [];
const velasDe = new Map<string, Vela[]>();
const fundDia = new Map<string, Map<number, number>>();
for (const [s, b] of Object.entries(bruto)) {
  const { velas, pts } = montar(s, b);
  velasDe.set(s, velas);
  todos.push(...pts);
  const m = new Map<number, number>();
  for (const x of b.f) {
    const d = Math.floor(x.fundingTime / DIA) * DIA;
    m.set(d, (m.get(d) ?? 0) + +x.fundingRate);
  }
  fundDia.set(s, m);
}

const mediana = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  if (!a.length) return NaN;
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const media = (xs: number[]) => (xs.length ? xs.reduce((a, x) => a + x, 0) / xs.length : NaN);
const pct = (x: number) => (Number.isFinite(x) ? `${x >= 0 ? "+" : ""}${(x * 100).toFixed(2)}%` : "—");

const ref7 = new Map<number, number>(), ref3 = new Map<number, number>();
{
  const a7 = new Map<number, number[]>(), a3 = new Map<number, number[]>();
  for (const p of todos) {
    if (p.fwd7 != null) (a7.get(p.t) ?? a7.set(p.t, []).get(p.t)!).push(p.fwd7);
    if (p.fwd3 != null) (a3.get(p.t) ?? a3.set(p.t, []).get(p.t)!).push(p.fwd3);
  }
  for (const [t, xs] of a7) ref7.set(t, mediana(xs));
  for (const [t, xs] of a3) ref3.set(t, mediana(xs));
}
const tempos = todos.filter((p) => p.fwd7 != null).map((p) => p.t).sort((a, b) => a - b);
const CORTE = tempos[Math.floor(tempos.length / 2)];
console.log(
  `\n${todos.length} moeda-dias · ${velasDe.size} perpétuos · corte das metades ${new Date(CORTE).toISOString().slice(0, 10)}`,
);

/** Normal aproximando a binomial: as moedas a favor são mais que cara ou coroa? */
function pBinomial(k: number, n: number): number {
  if (n === 0) return 1;
  const z = Math.abs(k - n / 2) / Math.sqrt(n / 4) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return Math.max(0, Math.min(1, 1 - erf));
}

/**
 * Uma operação: entra no fechamento, stop parado, sai em `h` dias. A saída do
 * stop é no nível, ou na abertura quando a vela salta por cima dele — a mesma
 * regra do caminho de velas da carteira. Sem alavancagem; 0,2% ida e volta; o
 * funding entra dia a dia, com o sinal de quem paga.
 */
function operar(p: Ponto, lado: 1 | -1, stop: number | null, h: number): { r: number; risco: number; parou: boolean } | null {
  const v = velasDe.get(p.s)!;
  if (p.i + h >= v.length) return null;
  const e = p.c;
  const f = fundDia.get(p.s)!;
  let fund = 0;
  for (let j = p.i + 1; j <= p.i + h; j++) {
    const x = v[j];
    // Positivo, o comprado paga e o vendido recebe.
    fund += -lado * (f.get(x.t) ?? 0);
    if (stop !== null) {
      if (lado === 1 && x.l <= e * (1 - stop)) return { r: Math.min(x.o, e * (1 - stop)) / e - 1 + fund - 0.002, risco: stop, parou: true };
      if (lado === -1 && x.h >= e * (1 + stop)) return { r: -(Math.max(x.o, e * (1 + stop)) / e - 1) + fund - 0.002, risco: stop, parou: true };
    }
  }
  return { r: lado * (v[p.i + h].c / e - 1) + fund - 0.002, risco: stop ?? 1, parou: false };
}
/** Stop em desvios diários da própria moeda, preso entre 5% e 50%. */
const stopSigma = (p: Ponto, k: number) => Math.min(0.5, Math.max(0.05, k * p.vol20));

function eventos(f: (p: Ponto) => boolean): Ponto[] {
  const ev: Ponto[] = [];
  const ult = new Map<string, number>();
  for (const p of todos) {
    if (p.fwd7 == null || !f(p)) continue;
    const u = ult.get(p.s);
    if (u !== undefined && p.i - u < 7) continue;
    ult.set(p.s, p.i);
    ev.push(p);
  }
  return ev;
}

// ------------------------------------------------ 1. cada sinal, no mesmo dia

interface Sinal { nome: string; lado: 1 | -1; f: (p: Ponto) => boolean }
const SINAIS: Sinal[] = [
  { nome: "RSI < 30 (sobrevendido)", lado: 1, f: (p) => p.rsi < 30 },
  { nome: "RSI < 20", lado: 1, f: (p) => p.rsi < 20 },
  { nome: "RSI > 70 (sobrecomprado)", lado: -1, f: (p) => p.rsi > 70 },
  { nome: "RSI > 80", lado: -1, f: (p) => p.rsi > 80 },
  { nome: "z20 < −2 (banda de baixo)", lado: 1, f: (p) => p.z < -2 },
  { nome: "z20 > +2 (banda de cima)", lado: -1, f: (p) => p.z > 2 },
  { nome: "rompe máxima de 20 dias", lado: 1, f: (p) => p.c > p.max20 },
  { nome: "perde mínima de 20 dias", lado: -1, f: (p) => p.c < p.min20 },
  { nome: "a menos de 3% da resistência", lado: -1, f: (p) => p.res !== null && p.res / p.c - 1 < 0.03 },
  { nome: "a menos de 3% do suporte", lado: 1, f: (p) => p.sup !== null && 1 - p.sup / p.c < 0.03 },
  { nome: "tendência: EMA20 > EMA50", lado: 1, f: (p) => p.ema20 > p.ema50 && p.c > p.ema20 },
  { nome: "pump de ≥ 25% no dia", lado: -1, f: (p) => p.ret1 >= 0.25 },
  { nome: "queda de ≥ 20% no dia", lado: 1, f: (p) => p.ret1 <= -0.2 },
  { nome: "volume 3x na alta", lado: 1, f: (p) => p.volRel >= 3 && p.ret1 > 0 },
  { nome: "volume 3x na queda", lado: -1, f: (p) => p.volRel >= 3 && p.ret1 < 0 },
  { nome: "funding ≥ +0,05%/8h", lado: -1, f: (p) => p.fund !== null && p.fund >= 0.0005 },
  { nome: "funding ≤ −0,05%/8h", lado: 1, f: (p) => p.fund !== null && p.fund <= -0.0005 },
  { nome: "funding ≤ −0,1%/8h", lado: 1, f: (p) => p.fund !== null && p.fund <= -0.001 },
  { nome: "OI +30% em 3d, preço +10%", lado: -1, f: (p) => p.oi3 !== null && p.oi3 >= 0.3 && p.ret3 >= 0.1 },
  { nome: "OI +30% em 3d, preço caindo", lado: 1, f: (p) => p.oi3 !== null && p.oi3 >= 0.3 && p.ret3 < 0 },
  { nome: "OI −20% em 3d (desalavancou)", lado: 1, f: (p) => p.oi3 !== null && p.oi3 <= -0.2 },
  { nome: "smart money compra, varejo vende", lado: 1, f: (p) => p.top3 !== null && p.glob3 !== null && p.top3 >= 0.1 && p.glob3 < 0 },
  { nome: "smart money vende, varejo compra", lado: -1, f: (p) => p.top3 !== null && p.glob3 !== null && p.top3 <= -0.1 && p.glob3 > 0 },
  { nome: "top traders ≥ 2x comprados", lado: 1, f: (p) => p.topNivel !== null && p.topNivel >= 2 },
  { nome: "varejo ≥ 3x comprado", lado: -1, f: (p) => p.globNivel !== null && p.globNivel >= 3 },
];

console.log(`\n=== 1. cada sinal contra o mercado do mesmo dia ===`);
console.log(
  `${"sinal".padEnd(34)} ${"lado".padEnd(5)} ${"n".padStart(5)} | ${"7d".padStart(7)} ${"3d".padStart(7)} | ${"1ª met".padStart(7)} ${"2ª met".padStart(7)} | ${"moedas a favor".padStart(14)} ${"p".padStart(5)} | ${"trade 2σ".padStart(8)}`,
);
for (const sg of SINAIS) {
  const ev = eventos(sg.f);
  if (ev.length < 20) {
    console.log(`${sg.nome.padEnd(34)} ${ev.length} evento(s) — amostra pequena demais`);
    continue;
  }
  const exc = (p: Ponto) => sg.lado * (p.fwd7! - ref7.get(p.t)!);
  const e7 = ev.map(exc);
  const e3 = ev.filter((p) => p.fwd3 != null).map((p) => sg.lado * (p.fwd3! - ref3.get(p.t)!));
  const porMoeda = new Map<string, number[]>();
  ev.forEach((p, k) => (porMoeda.get(p.s) ?? porMoeda.set(p.s, []).get(p.s)!).push(e7[k]));
  const cm = [...porMoeda.values()].filter((x) => x.length >= 2).map(mediana);
  const aFavor = cm.filter((x) => x > 0).length;
  const tr = ev.map((p) => operar(p, sg.lado, stopSigma(p, 2), 7)).filter((x) => x !== null).map((x) => x.r);
  console.log(
    `${sg.nome.padEnd(34)} ${(sg.lado === 1 ? "long" : "short").padEnd(5)} ${String(ev.length).padStart(5)} | ` +
      `${pct(mediana(e7)).padStart(7)} ${pct(mediana(e3)).padStart(7)} | ` +
      `${pct(mediana(ev.filter((p) => p.t < CORTE).map(exc))).padStart(7)} ${pct(mediana(ev.filter((p) => p.t >= CORTE).map(exc))).padStart(7)} | ` +
      `${`${aFavor}/${cm.length}`.padStart(14)} ${pBinomial(aFavor, cm.length).toFixed(3).padStart(5)} | ${pct(media(tr)).padStart(8)}`,
  );
}
console.log(`positivo = o sinal acertou o lado. "trade 2σ": média por operação, stop de 2 desvios diários, 7 dias, custo e funding.`);
console.log(`funding tem ~1.000 pagamentos por moeda e OI/razões só 30 dias: esses sinais não têm a primeira metade.`);

// --------------------------------------- 2. vender o exagero, como trade

console.log(`\n=== 2. vender o exagero, como TRADE, por tamanho de moeda ===`);
const FAIXAS: [string, number, number][] = [["< 30 mi", 0, 30e6], ["30-100 mi", 30e6, 100e6], ["100-500 mi", 100e6, 500e6], ["> 500 mi", 500e6, Infinity]];
const VENDER: Sinal[] = [SINAIS[3], SINAIS[11], { nome: "pump ≥ 25% e RSI > 80", lado: -1, f: (p) => p.ret1 >= 0.25 && p.rsi > 80 }, { nome: "volume 3x na alta (vender)", lado: -1, f: (p) => p.volRel >= 3 && p.ret1 > 0 }];
console.log(`${"sinal".padEnd(30)} ${"faixa".padEnd(11)} ${"n".padStart(4)} | ${"7d exc".padStart(7)} | ${"sem stop".padStart(8)} ${"mediana".padStart(8)} | ${"stop 3σ".padStart(8)} ${"stop 2σ".padStart(8)} | ${"alta contra p90".padStart(15)}`);
for (const sg of VENDER) {
  const ev = eventos(sg.f);
  for (const [nome, lo, hi] of FAIXAS) {
    const e = ev.filter((p) => p.mcap !== null && p.mcap >= lo && p.mcap < hi);
    if (e.length < 25) continue;
    const sem = e.map((p) => operar(p, -1, null, 7)).filter((x) => x !== null).map((x) => x.r);
    const s3 = e.map((p) => operar(p, -1, stopSigma(p, 3), 7)).filter((x) => x !== null).map((x) => x.r);
    const s2 = e.map((p) => operar(p, -1, stopSigma(p, 2), 7)).filter((x) => x !== null).map((x) => x.r);
    // A maior alta CONTRA em 7 dias: é ela que mata o vendido sem stop.
    const mae = e
      .map((p) => {
        const v = velasDe.get(p.s)!;
        let m = 0;
        for (let j = p.i + 1; j <= Math.min(p.i + 7, v.length - 1); j++) m = Math.max(m, v[j].h / p.c - 1);
        return m;
      })
      .sort((a, b) => a - b);
    console.log(
      `${sg.nome.padEnd(30)} ${nome.padEnd(11)} ${String(e.length).padStart(4)} | ${pct(mediana(e.map((p) => -(p.fwd7! - ref7.get(p.t)!)))).padStart(7)} | ` +
        `${pct(media(sem)).padStart(8)} ${pct(mediana(sem)).padStart(8)} | ${pct(media(s3)).padStart(8)} ${pct(media(s2)).padStart(8)} | ${pct(mae[Math.floor(mae.length * 0.9)]).padStart(15)}`,
    );
  }
}

// ------------------------------------ 3. o modelo que parecia bom, atacado

console.log(`\n=== 3. "vender RSI > 80 em moeda de 30 a 100 mi", atacado ===`);
function modelo(rsiMin: number, lo: number, hi: number, k: number, h: number) {
  const ev = eventos((p) => p.rsi > rsiMin && p.mcap !== null && p.mcap >= lo && p.mcap < hi);
  const tr = ev.map((p) => ({ p, o: operar(p, -1, stopSigma(p, k), h) })).filter((x) => x.o !== null) as { p: Ponto; o: { r: number; risco: number; parou: boolean } }[];
  return tr;
}
function linha(nome: string, tr: ReturnType<typeof modelo>) {
  const r = tr.map((x) => x.o.r);
  console.log(
    `  ${nome.padEnd(22)} n=${String(r.length).padStart(4)}  média ${pct(media(r)).padStart(7)}  mediana ${pct(mediana(r)).padStart(7)}  ` +
      `acerto ${((r.filter((x) => x > 0).length / (r.length || 1)) * 100).toFixed(0).padStart(3)}%  em R ${media(tr.map((x) => x.o.r / x.o.risco)).toFixed(2).padStart(5)}`,
  );
}
const base = modelo(80, 30e6, 100e6, 2, 7);
linha("o modelo", base);
for (const r of [70, 75, 85]) linha(`RSI > ${r}`, modelo(r, 30e6, 100e6, 2, 7));
for (const [lo, hi] of [[20e6, 150e6], [100e6, 200e6], [15e6, 30e6]]) linha(`faixa ${lo / 1e6}-${hi / 1e6} mi`, modelo(80, lo, hi, 2, 7));
for (const k of [1.5, 3]) linha(`stop ${k}σ`, modelo(80, 30e6, 100e6, k, 7));
const porTri = new Map<string, number[]>();
for (const x of base) {
  const d = new Date(x.p.t);
  const q = `${d.getUTCFullYear()}T${Math.floor(d.getUTCMonth() / 3) + 1}`;
  (porTri.get(q) ?? porTri.set(q, []).get(q)!).push(x.o.r);
}
console.log(`  por trimestre: ${[...porTri].sort().map(([q, xs]) => `${q} ${pct(media(xs))} (${xs.length})`).join(" · ")}`);
const porMoeda = new Map<string, number>();
for (const x of base) porMoeda.set(x.p.s, (porMoeda.get(x.p.s) ?? 0) + x.o.r);
console.log(`  moedas com soma positiva: ${[...porMoeda.values()].filter((v) => v > 0).length} de ${porMoeda.size}`);

// ------------------------------------------ 4. o fluxo on-chain da Binance

console.log(`\n=== 4. fluxo on-chain da carteira quente da Binance ===`);
// DUAS PORTAS, e elas dizem coisas opostas (ver `scripts/fluxo-binance.mts`):
// a compra/venda de cliente na DEX passa pelo executor de swap; depósito e
// saque chegam direto. Somadas, a TAKE de 23/09 parecia holder depositando
// para vender, e era cliente comprando no meio do pump.
//
// OS LADOS FORAM ESCOLHIDOS ANTES DE HAVER DADO, e ficam escritos aqui para não
// serem escolhidos depois: depósito líquido grande → vender (o fluxo clássico
// de corretora); compra líquida grande de varejo na DEX → vender (o exagero
// devolve, que é o que as seções 1 e 2 medem); os espelhos → comprar.
interface JanelaFluxo { t: number; janela: { de: number; ate: number }; falhas: { entrando: number; saindo: number }; lacuna: unknown }
interface LinhaFluxo { t: number; s: string; cmp: number; vnd: number; dep: number; saq: number; mcap: number | null }
const arquivos = (await readdir("data").catch(() => [] as string[])).filter((f) => /^fluxo-binance-\d{4}-\d{2}\.jsonl$/.test(f));
const janelas: JanelaFluxo[] = [];
const fluxos: LinhaFluxo[] = [];
for (const f of arquivos) {
  for (const l of (await readFile(`data/${f}`, "utf8")).split("\n")) {
    if (!l.trim()) continue;
    try {
      const o = JSON.parse(l) as JanelaFluxo | LinhaFluxo;
      if ("janela" in o) janelas.push(o);
      else if ("cmp" in o) fluxos.push(o);
    } catch {
      // linha truncada
    }
  }
}
// COBERTURA POR DIA: só entra o dia lido quase inteiro e sem falha. Dia parcial
// soma fluxo de menos e deixaria o limiar mais difícil de cruzar em uns dias do
// que em outros; dia com faixa perdida é "não li", não "não entrou".
const dia = (t: number) => Math.floor((t * 1000) / DIA) * DIA;
const cobertura = new Map<number, number>();
const ruins = new Set<number>();
for (const j of janelas) {
  const d = dia(j.t);
  cobertura.set(d, (cobertura.get(d) ?? 0) + ((j.janela.ate - j.janela.de + 1) * 0.45) / 86_400);
  if (j.falhas.entrando + j.falhas.saindo > 0 || j.lacuna) ruins.add(d);
}
const validos = new Set([...cobertura].filter(([d, c]) => c >= 0.9 && !ruins.has(d)).map(([d]) => d));
const porDia = new Map<string, { s: string; t: number; dex: number; dep: number; mcap: number | null }>();
for (const x of fluxos) {
  const d = dia(x.t);
  if (!validos.has(d)) continue;
  const k = `${x.s}|${d}`;
  const g = porDia.get(k) ?? { s: x.s, t: d, dex: 0, dep: 0, mcap: x.mcap };
  g.dex += x.cmp - x.vnd;
  g.dep += x.dep - x.saq;
  porDia.set(k, g);
}
const pontoDe = new Map(todos.map((p) => [`${p.s}|${p.t}`, p]));
const LIMIAR = 0.01;
type Dia = { dex: number; dep: number; mcap: number | null };
const TESTES: [string, 1 | -1, (g: Dia) => boolean][] = [
  [`depósito líquido ≥ ${LIMIAR * 100}% do mcap → vender`, -1, (g) => g.mcap !== null && g.dep / g.mcap >= LIMIAR],
  [`saque líquido ≥ ${LIMIAR * 100}% do mcap → comprar`, 1, (g) => g.mcap !== null && g.dep / g.mcap <= -LIMIAR],
  [`varejo compra na DEX ≥ ${LIMIAR * 100}% do mcap → vender`, -1, (g) => g.mcap !== null && g.dex / g.mcap >= LIMIAR],
  [`varejo vende na DEX ≥ ${LIMIAR * 100}% do mcap → comprar`, 1, (g) => g.mcap !== null && g.dex / g.mcap <= -LIMIAR],
];
for (const [nome, lado, f] of TESTES) {
  const ev = [...porDia.values()].filter(f).map((g) => pontoDe.get(`${g.s}|${g.t}`)).filter((p): p is Ponto => p !== undefined && p.fwd7 != null);
  const moedas = new Set(ev.map((p) => p.s)).size;
  const exc = ev.map((p) => lado * (p.fwd7! - ref7.get(p.t)!));
  console.log(
    `  ${nome.padEnd(44)} ${String(ev.length).padStart(3)} evento(s) em ${String(moedas).padStart(2)} moeda(s)` +
      (ev.length >= 30 && moedas >= 10
        ? ` · 7d ${pct(mediana(exc))} · acerto ${((exc.filter((x) => x > 0).length / exc.length) * 100).toFixed(0)}%`
        : " · amostra insuficiente (precisa de 30 eventos em 10 moedas)"),
  );
}
console.log(
  `  ${cobertura.size} dia(s) com fluxo gravado · ${validos.size} lido(s) inteiro(s) e sem falha · ` +
    `o evento só conta 7 dias depois, quando o retorno à frente existe`,
);
