/**
 * A MEDIÇÃO DAS BALEIAS DA HYPERLIQUID, como está em `docs/preregistro-baleias.md`
 * (fixado por sha256 antes de qualquer download): os quatro sinais — consenso
 * das baleias, consenso das espertas, fluxo das baleias e o suporte no custo das
 * compras delas — contra o retorno relativo de 1, 3 e 7 dias, de 11/05/2026 a
 * 01/11/2026, nos universos A (o principal, que traz as contas que quebraram), B
 * (as ricas de hoje, enviesado a favor) e os dois juntos.
 *
 * Lê só o cache de `scripts/baixar-baleias.mts` (`.cache/hl/`): sem rede.
 *
 * Rode com: npx tsx scripts/medir-baleias.mts
 */

import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { agregar, depois, MINIMOS, type HistoricoDaConta, type MedicaoBaleias, type PosicaoDeBaleia, type SinalMedido } from "../lib/hyperliquid";
import { media, naoSobrepostos, spearman, tDe, vereditoDoSinal, vereditoDoSuporte } from "../lib/juizBaleias";
import { INICIO_HISTORICO, universo, type VelaDiaria } from "./baixar-baleias.mjs";

const DIA = 86_400_000;
const CACHE = ".cache/hl";
const PRIMEIRA = Date.parse("2026-05-11T00:00:00Z");
const ULTIMA = Date.parse("2026-11-01T00:00:00Z");
const CORTE = Date.parse("2026-08-07T00:00:00Z");
const HORIZONTES = [1, 3, 7];
const VOLUME_MINIMO = 1e6;
const MINIMO_MOEDAS_NO_DIA = 10;

// ------------------------------------------------------------------ os dados

const { a, b } = await universo();
const historicos = new Map<string, HistoricoDaConta>();
const deAltaFrequencia = new Set<string>();
/**
 * A CONTA SÓ ENTRA SE FECHAR (a emenda de `docs/preregistro-baleias.md`): em
 * toda moeda com evento no histórico, a posição depois do último evento tem de
 * ser a de agora. Não fechar é execução faltando — a API às vezes não entrega
 * parte das fatias de TWAP de quem as usa muito —, e a reconstrução dessa conta
 * mentiria nas datas de antes do buraco.
 */
const naoFecham = new Set<string>();
const fecha = (h: HistoricoDaConta): boolean => {
  const ultimo = new Map<string, number>();
  for (const x of h.execucoes) ultimo.set(x.moeda, depois(x));
  for (const [moeda, s] of ultimo) {
    const agora = h.atuais[moeda] ?? 0;
    if (Math.abs(s - agora) > 1e-6 * Math.max(1, Math.abs(agora))) return false;
  }
  return true;
};
for (const e of new Set([...a, ...b])) {
  const arq = `${CACHE}/contas/${e}.json`;
  if (!existsSync(arq)) continue;
  const h = JSON.parse(await readFile(arq, "utf8")) as HistoricoDaConta;
  if (h.altaFrequencia) {
    deAltaFrequencia.add(e);
    continue;
  }
  if (!fecha(h)) {
    naoFecham.add(e);
    continue;
  }
  historicos.set(e, h);
}
const altaFrequencia = deAltaFrequencia.size;
console.log(`a reconstrução fecha em ${historicos.size} contas e não fecha em ${naoFecham.size} (com execução, ${[...historicos.values()].filter((h) => h.execucoes.length > 0).length} das que fecham)`);

// O GIRO DO PATRIMÔNIO NÃO SEPARA MARKET MAKER, e fica aqui como registro: a
// primeira versão do ao vivo separava pelo volume do mês ÷ patrimônio, do
// ranking, e a conferência contra a regra das execuções reprovou a régua — a
// conta de US$ 182 milhões com 10 mil execuções num dia girava 3,2x no mês. O ao
// vivo passou a classificar pelas execuções, como a medição. Descritivo: não
// mexe em sinal nenhum.
{
  const { lerRanking } = await import("../lib/hyperliquid");
  const ranking = new Map(lerRanking(JSON.parse(await readFile(`${CACHE}/ranking-2026-11-09.json`, "utf8"))).map((c) => [c.endereco, c]));
  const lidas = [...historicos.keys(), ...deAltaFrequencia].filter((e) => (ranking.get(e)?.patrimonio ?? 0) >= 1e6);
  const giro = (e: string) => (ranking.get(e)!.volumeMes / ranking.get(e)!.patrimonio);
  console.log(`a régua de giro do ao vivo, nas ${lidas.length} contas lidas com US$ 1 mi ou mais (${lidas.filter((e) => deAltaFrequencia.has(e)).length} de alta frequência pelas execuções):`);
  for (const teto of [50, 100, 200, 500, 1000]) {
    const fora = lidas.filter((e) => giro(e) > teto);
    const certas = fora.filter((e) => deAltaFrequencia.has(e)).length;
    const perdidas = lidas.filter((e) => deAltaFrequencia.has(e) && giro(e) <= teto).length;
    console.log(`  giro acima de ${String(teto).padStart(4)}x no mês: ${fora.length} contas fora, ${certas} delas de alta frequência · ${perdidas} de alta frequência ficariam dentro`);
  }
}
const semArquivo = [...new Set([...a, ...b])].filter((e) => !existsSync(`${CACHE}/contas/${e}.json`)).length;

/** As velas por moeda, pela abertura do dia (ms): [o, h, l, c, volume em dólar]. */
const velas = new Map<string, Map<number, VelaDiaria>>();
for (const arq of await readdir(`${CACHE}/velas`)) {
  const moeda = decodeURIComponent(arq.replace(/\.json$/, ""));
  const vs = JSON.parse(await readFile(`${CACHE}/velas/${arq}`, "utf8")) as VelaDiaria[];
  velas.set(moeda, new Map(vs.map((v) => [v[0], v])));
}
/** O fechamento do dia que abriu em `t`. */
const fechamento = (moeda: string, t: number) => velas.get(moeda)?.get(t)?.[4];

const dias: number[] = [];
for (let d = PRIMEIRA; d <= ULTIMA; d += DIA) dias.push(d);
console.log(
  `contas: ${historicos.size} lidas (fora: ${altaFrequencia} de alta frequência, ${semArquivo} sem arquivo) · ${velas.size} moedas com vela · ${dias.length} decisões, de ${new Date(PRIMEIRA).toISOString().slice(0, 10)} a ${new Date(ULTIMA).toISOString().slice(0, 10)}`,
);

// ------------------------------------------------------------------ as posições de cada conta em cada dia

/** Os dias de que um sinal precisa: os das decisões, 3 antes (o fluxo) e 30 antes (as espertas e o custo). */
const todosOsDias = new Set<number>();
for (const d of dias) for (const k of [0, 3]) todosOsDias.add(d - k * DIA);
const diasDesc = [...todosOsDias].sort((x, y) => y - x);

/**
 * As posições (unidades) de cada conta em cada dia, numa varredura para trás só:
 * a posição numa data é o `antes` da primeira execução depois dela — andando das
 * mais novas para as mais velhas e gravando em cada virada de dia, o que fica
 * no mapa é justamente isso. Antes do `desde` da conta, não há leitura.
 */
const posicoes = new Map<string, Map<number, Map<string, number>>>();
for (const [e, h] of historicos) {
  const porDia = new Map<number, Map<string, number>>();
  const atual = new Map<string, number>(Object.entries(h.atuais));
  let k = h.execucoes.length - 1;
  for (const d of diasDesc) {
    if (d > h.ate) continue;
    while (k >= 0 && h.execucoes[k].t > d) {
      atual.set(h.execucoes[k].moeda, h.execucoes[k].antes);
      k--;
    }
    if (d < h.desde) break;
    porDia.set(d, new Map([...atual].filter(([, s]) => s !== 0)));
  }
  posicoes.set(e, porDia);
}

/**
 * O lucro realizado acumulado de cada conta e as compras de cada conta por
 * moeda e por dia, em somas acumuladas: as duas contas de 30 dias saem por
 * diferença, sem varrer as execuções a cada dia (são até 10 mil por conta).
 */
const T0 = INICIO_HISTORICO;
const indice = (t: number) => Math.floor((t - T0) / DIA);
const N_DIAS = indice(ULTIMA) + 2;
const lucroAcumulado = new Map<string, { t: number[]; s: number[] }>();
/** Por conta e moeda: soma acumulada, até o fim de cada dia, do nocional e das unidades compradas (lado B). */
const comprasAcumuladas = new Map<string, Map<string, { nocional: Float64Array; unidades: Float64Array }>>();
for (const [e, h] of historicos) {
  const t: number[] = [];
  const s: number[] = [];
  let acc = 0;
  for (const x of h.execucoes) {
    acc += x.lucroFechado - x.taxa;
    t.push(x.t);
    s.push(acc);
  }
  lucroAcumulado.set(e, { t, s });
  const porMoeda = new Map<string, { nocional: Float64Array; unidades: Float64Array }>();
  for (const x of h.execucoes) {
    if (x.lado !== "B") continue;
    const i = indice(x.t);
    if (i < 0 || i >= N_DIAS) continue;
    let c = porMoeda.get(x.moeda);
    if (!c) porMoeda.set(x.moeda, (c = { nocional: new Float64Array(N_DIAS), unidades: new Float64Array(N_DIAS) }));
    c.nocional[i] += x.preco * x.tamanho;
    c.unidades[i] += x.tamanho;
  }
  for (const c of porMoeda.values()) {
    for (let i = 1; i < N_DIAS; i++) {
      c.nocional[i] += c.nocional[i - 1];
      c.unidades[i] += c.unidades[i - 1];
    }
  }
  comprasAcumuladas.set(e, porMoeda);
}

/** O acumulado até o instante `t` (inclusive), pela busca binária. */
function acumuladoAte(a: { t: number[]; s: number[] }, t: number): number {
  let lo = 0;
  let hi = a.t.length - 1;
  let k = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (a.t[m] <= t) {
      k = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  return k < 0 ? 0 : a.s[k];
}

/** O lucro realizado da conta nos 30 dias até `d`, só se o histórico cobre os 30 dias. */
function lucro30(e: string, h: HistoricoDaConta, d: number): number | null {
  if (h.desde > d - 30 * DIA) return null;
  const a = lucroAcumulado.get(e)!;
  return acumuladoAte(a, d) - acumuladoAte(a, d - 30 * DIA);
}

// ------------------------------------------------------------------ os sinais

type Sinal = Map<number, Map<string, number>>;

function sinaisDoGrupo(grupo: Set<string>) {
  const contas = [...grupo].filter((e) => historicos.has(e));
  const consenso: Sinal = new Map();
  const espertas: Sinal = new Map();
  const fluxo: Sinal = new Map();
  const custo = new Map<number, Map<string, number>>();
  const cobertura: number[] = [];
  for (const d of dias) {
    const elegiveis = new Set<string>();
    const preco = new Map<string, number>();
    for (const [moeda, vs] of velas) {
      const v = vs.get(d - DIA);
      if (v && v[4] > 0 && v[5] >= VOLUME_MINIMO) {
        elegiveis.add(moeda);
        preco.set(moeda, v[4]);
      }
    }
    const naData: PosicaoDeBaleia[] = [];
    const dasEspertas: PosicaoDeBaleia[] = [];
    const delta = new Map<string, number>();
    const brutoFluxo: PosicaoDeBaleia[] = [];
    let cobrem = 0;
    for (const e of contas) {
      const pd = posicoes.get(e)?.get(d);
      if (!pd) continue;
      cobrem++;
      const h = historicos.get(e)!;
      const l30 = lucro30(e, h, d);
      const p3 = posicoes.get(e)?.get(d - 3 * DIA);
      const moedas = new Set([...pd.keys(), ...(p3?.keys() ?? [])]);
      for (const moeda of moedas) {
        const p = preco.get(moeda);
        if (p === undefined) continue;
        const n = (pd.get(moeda) ?? 0) * p;
        if (n !== 0) {
          naData.push({ conta: e, moeda, nocional: n });
          if (l30 !== null && l30 > 0) dasEspertas.push({ conta: e, moeda, nocional: n });
        }
        if (p3) {
          const n3 = (p3.get(moeda) ?? 0) * p;
          if (Math.abs(n) >= MINIMOS.posicao || Math.abs(n3) >= MINIMOS.posicao) {
            delta.set(moeda, (delta.get(moeda) ?? 0) + (n - n3));
            if (n !== 0) brutoFluxo.push({ conta: e, moeda, nocional: n });
          }
        }
      }
    }
    cobertura.push(cobrem);
    const so = (m: Map<string, { consenso: number | null }>) => new Map([...m].filter(([moeda, x]) => x.consenso !== null && elegiveis.has(moeda)).map(([moeda, x]) => [moeda, x.consenso as number]));
    consenso.set(d, so(agregar(naData)));
    espertas.set(d, so(agregar(dasEspertas)));
    const f = new Map<string, number>();
    for (const [moeda, x] of agregar(brutoFluxo)) {
      if (x.consenso === null || !elegiveis.has(moeda)) continue;
      f.set(moeda, (delta.get(moeda) ?? 0) / (x.comprado + x.vendido));
    }
    fluxo.set(d, f);

    // O custo das compras: o preço médio das execuções de lado B nos 30 dias
    // (d − 30 d, d], das contas que cobrem os 30 dias. Os dias do acumulado
    // terminam na meia-noite seguinte: o dia de índice i cobre [T0 + i·DIA, T0 + (i+1)·DIA).
    const somaNocional = new Map<string, number>();
    const somaUnidades = new Map<string, number>();
    const fimJanela = indice(d) - 1;
    const inicioJanela = indice(d - 30 * DIA) - 1;
    for (const e of contas) {
      const h = historicos.get(e)!;
      if (h.desde > d - 30 * DIA || fimJanela < 0) continue;
      for (const [moeda, c] of comprasAcumuladas.get(e) ?? []) {
        const nocional = c.nocional[fimJanela] - (inicioJanela >= 0 ? c.nocional[inicioJanela] : 0);
        const unidades = c.unidades[fimJanela] - (inicioJanela >= 0 ? c.unidades[inicioJanela] : 0);
        if (!(unidades > 0)) continue;
        somaNocional.set(moeda, (somaNocional.get(moeda) ?? 0) + nocional);
        somaUnidades.set(moeda, (somaUnidades.get(moeda) ?? 0) + unidades);
      }
    }
    custo.set(d, new Map([...somaNocional].filter(([moeda]) => elegiveis.has(moeda)).map(([moeda, s]) => [moeda, s / (somaUnidades.get(moeda) as number)])));
  }
  return { consenso, espertas, fluxo, custo, cobertura };
}

// ------------------------------------------------------------------ o retorno relativo

/** O retorno de h dias a partir da meia-noite `d`, menos a mediana das moedas elegíveis do dia. */
const relativos = new Map<number, Map<number, Map<string, number>>>();
for (const h of HORIZONTES) {
  const porDia = new Map<number, Map<string, number>>();
  for (const d of dias) {
    const brutos = new Map<string, number>();
    for (const [moeda, vs] of velas) {
      const v = vs.get(d - DIA);
      const fim = fechamento(moeda, d + (h - 1) * DIA);
      if (!v || !(v[4] > 0) || v[5] < VOLUME_MINIMO || fim === undefined || !(fim > 0)) continue;
      brutos.set(moeda, fim / v[4] - 1);
    }
    const ordenados = [...brutos.values()].sort((x, y) => x - y);
    if (ordenados.length < MINIMO_MOEDAS_NO_DIA) continue;
    const meio = ordenados.length % 2 ? ordenados[(ordenados.length - 1) / 2] : (ordenados[ordenados.length / 2 - 1] + ordenados[ordenados.length / 2]) / 2;
    porDia.set(d, new Map([...brutos].map(([m, r]) => [m, r - meio])));
  }
  relativos.set(h, porDia);
}

// ------------------------------------------------------------------ a estatística

const pp = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)} p.p.`;

interface Resultado {
  dias: number;
  icMedio: number;
  t: number;
  icMetades: [number, number];
  quintos: number;
  quintosMetades: [number, number];
  moedasPorDia: number;
}

function medirSinal(sinal: Sinal, h: number): Resultado | null {
  const ics: { d: number; ic: number; q: number }[] = [];
  let moedas = 0;
  for (const d of dias) {
    const s = sinal.get(d);
    const r = relativos.get(h)?.get(d);
    if (!s || !r) continue;
    const pares = [...s].filter(([m]) => r.has(m)).map(([m, v]) => [v, r.get(m) as number] as const);
    if (pares.length < MINIMO_MOEDAS_NO_DIA) continue;
    const ic = spearman(pares.map((p) => p[0]), pares.map((p) => p[1]));
    if (!Number.isFinite(ic)) continue;
    // O quinto de cima menos o de baixo do sinal, em retorno relativo.
    const ord = [...pares].sort((p, q) => p[0] - q[0]);
    const n5 = Math.max(1, Math.floor(ord.length / 5));
    const q = media(ord.slice(-n5).map((p) => p[1])) - media(ord.slice(0, n5).map((p) => p[1]));
    ics.push({ d, ic, q });
    moedas += pares.length;
  }
  if (ics.length < 3) return null;
  // O t sobre os dias que não se sobrepõem (`lib/juizBaleias.ts`).
  const separados = naoSobrepostos(ics, h).map((x) => x.ic);
  const antes = ics.filter((x) => x.d < CORTE);
  const depois = ics.filter((x) => x.d >= CORTE);
  return {
    dias: ics.length,
    icMedio: media(ics.map((x) => x.ic)),
    t: tDe(separados),
    icMetades: [media(antes.map((x) => x.ic)), media(depois.map((x) => x.ic))],
    quintos: media(ics.map((x) => x.q)),
    quintosMetades: [media(antes.map((x) => x.q)), media(depois.map((x) => x.q))],
    moedasPorDia: moedas / ics.length,
  };
}

/** O suporte das baleias: o preço volta a até 3% do custo das compras, vindo de 5 fechamentos mais de 5% acima. */
function medirSuporte(custo: Map<number, Map<string, number>>) {
  const eventos: { d: number; moeda: string; r: number }[] = [];
  const ultimo = new Map<string, number>();
  for (const d of dias) {
    const c = custo.get(d);
    const r = relativos.get(7)?.get(d);
    if (!c || !r) continue;
    for (const [moeda, vwap] of c) {
      if (!(vwap > 0) || !r.has(moeda)) continue;
      const vespera = fechamento(moeda, d - DIA);
      if (vespera === undefined || Math.abs(vespera / vwap - 1) > 0.03) continue;
      let veioDeCima = true;
      for (let k = 2; k <= 6; k++) {
        const f = fechamento(moeda, d - k * DIA);
        if (f === undefined || !(f > 1.05 * vwap)) {
          veioDeCima = false;
          break;
        }
      }
      if (!veioDeCima) continue;
      const u = ultimo.get(moeda);
      if (u !== undefined && d - u < 7 * DIA) continue;
      ultimo.set(moeda, d);
      eventos.push({ d, moeda, r: r.get(moeda) as number });
    }
  }
  const rs = eventos.map((x) => x.r);
  const antes = eventos.filter((x) => x.d < CORTE).map((x) => x.r);
  const depois = eventos.filter((x) => x.d >= CORTE).map((x) => x.r);
  return { n: eventos.length, moedas: new Set(eventos.map((x) => x.moeda)).size, media: rs.length ? media(rs) : NaN, t: tDe(rs), metades: [antes.length ? media(antes) : NaN, depois.length ? media(depois) : NaN] as [number, number], porMetade: [antes.length, depois.length] };
}

// ------------------------------------------------------------------ o relatório

const grupos: [MedicaoBaleias["grupos"][number]["id"], string, Set<string>][] = [
  ["A", "A, volume da vida ≥ US$ 1 bi (o principal)", a],
  ["B", "B, patrimônio de hoje ≥ US$ 5 mi (enviesado a favor)", b],
  ["AB", "A e B juntos", new Set([...a, ...b])],
];
// `--seco`: confere que o caminho roda — cobertura, dias e moedas por sinal —
// SEM imprimir nenhum resultado. É para rodar com o download pela metade sem
// olhar o desfecho antes de os dados estarem completos.
if (process.argv.includes("--seco")) {
  for (const [, nome, grupo] of grupos) {
    const s = sinaisDoGrupo(grupo);
    const cob = [...s.cobertura].sort((x, y) => x - y);
    const moedasPorDia = (sinal: Sinal) => {
      const n = [...sinal.values()].map((m) => m.size).sort((x, y) => x - y);
      return n[Math.floor(n.length / 2)] ?? 0;
    };
    console.log(
      `${nome}: contas cobrindo o dia, mediana ${cob[Math.floor(cob.length / 2)]} (de ${cob[0]} a ${cob[cob.length - 1]}) · moedas por dia com sinal, mediana: ` +
        `consenso ${moedasPorDia(s.consenso)}, espertas ${moedasPorDia(s.espertas)}, fluxo ${moedasPorDia(s.fluxo)}, custo ${moedasPorDia(s.custo)}`,
    );
  }
  process.exit(0);
}

const medicao: MedicaoBaleias = {
  geradoEm: Date.now(),
  janela: { de: PRIMEIRA, ate: ULTIMA, corte: CORTE },
  contas: { lidas: historicos.size, altaFrequencia, semArquivo, naoFecham: naoFecham.size },
  grupos: [],
  vereditos: [],
};
const NOMES = { consenso: "consenso das baleias", espertas: "consenso das espertas", fluxo: "fluxo das baleias (3 d)" } as const;
for (const [id, nome, grupo] of grupos) {
  const s = sinaisDoGrupo(grupo);
  const cob = [...s.cobertura].sort((x, y) => x - y);
  const contas = [...grupo].filter((e) => historicos.has(e)).length;
  console.log(`\n== ${nome}: ${contas} contas lidas · contas cobrindo o dia: mediana ${cob[Math.floor(cob.length / 2)]}, de ${cob[0]} a ${cob[cob.length - 1]}`);
  const sinais: SinalMedido[] = [];
  for (const chave of ["consenso", "espertas", "fluxo"] as const) {
    const sinal = s[chave];
    for (const h of HORIZONTES) {
      const r = medirSinal(sinal, h);
      if (!r) {
        console.log(`${NOMES[chave].padEnd(25)} ${h} d: sem dias com ${MINIMO_MOEDAS_NO_DIA} moedas`);
        continue;
      }
      sinais.push({ sinal: chave, horizonte: h, ...r });
      let passa = "";
      if (h === 7 && id === "A") {
        // O critério do pré-registro, o mesmo do juiz para frente (`lib/juizBaleias.ts`).
        const { passa: ok, texto } = vereditoDoSinal(r);
        medicao.vereditos.push({ sinal: chave, passa: ok, texto });
        passa = ` → ${texto.toUpperCase()}`;
      }
      console.log(
        `${NOMES[chave].padEnd(25)} ${String(h).padStart(1)} d: IC médio ${r.icMedio.toFixed(3)} (t ${r.t.toFixed(2)}, ${r.dias} dias, ${r.moedasPorDia.toFixed(0)} moedas/dia) · metades ${r.icMetades.map((x) => x.toFixed(3)).join(" e ")} · ` +
          `quinto de cima − de baixo ${pp(r.quintos)} (metades ${r.quintosMetades.map(pp).join(" e ")})${passa}`,
      );
    }
  }
  const sup = medirSuporte(s.custo);
  let passaSup = "";
  if (id === "A") {
    const { passa: ok, texto } = vereditoDoSuporte({ ...sup, eventos: sup.n });
    medicao.vereditos.push({ sinal: "suporte", passa: ok, texto });
    passaSup = ` → ${texto.toUpperCase()}`;
  }
  console.log(
    `${"suporte das baleias".padEnd(25)} 7 d: ${sup.n} eventos em ${sup.moedas} moedas, retorno relativo médio ${pp(sup.media)} (t ${sup.t.toFixed(2)}) · metades ${sup.metades.map(pp).join(" e ")} (${sup.porMetade.join(" e ")} eventos)${passaSup}`,
  );
  medicao.grupos.push({
    id,
    nome,
    contas,
    coberturaMediana: cob[Math.floor(cob.length / 2)] ?? 0,
    sinais,
    suporte: { eventos: sup.n, moedas: sup.moedas, media: sup.media, t: sup.t, metades: sup.metades, porMetade: sup.porMetade as [number, number] },
  });
}

// Só com todas as contas lidas: medição parcial não vai para a página.
if (semArquivo === 0) {
  const { writeFile } = await import("node:fs/promises");
  await writeFile("data/baleias-reconstrucao.json", `${JSON.stringify(medicao)}\n`);
  console.log("\ndata/baleias-reconstrucao.json gravado — a página lê o juiz para frente, `data/baleias-medicao.json`");
} else {
  console.log(`\n${semArquivo} conta(s) ainda sem arquivo: medição PARCIAL, data/baleias-reconstrucao.json NÃO gravado`);
}
