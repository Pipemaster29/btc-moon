/**
 * A medição que sustenta os robôs, refeita do zero e com o MESMO motor que roda
 * ao vivo (`lib/robos.ts`).
 *
 * A pesquisa que escolheu as regras foi feita fora do repositório, numa
 * bancada que testou dezenas de ideias (a tabela está no topo de
 * `lib/robos.ts`). O que fica aqui é a conferência: baixa as velas de 1 h e o
 * financiamento de TODOS os perpétuos USDT que o Data Vision já publicou desde
 * 01/2024 — inclusive os deslistados, sem os quais o vendido pareceria pior e o
 * comprado melhor —, roda cada robô como se ele estivesse ligado desde então, e
 * imprime o resultado dentro e fora da amostra, por trimestre e sem a melhor
 * moeda. Grava `data/robos-medicao.json`, que a tela desenha ao lado do ao vivo.
 *
 * CUSTA: ~30 mil arquivos na primeira vez (~430 MB compactados, 10 a 25
 * minutos), guardados em `.cache/robos/`. Daí em diante, só os meses novos.
 *
 * Rode com: npm run medir-robos
 *           npm run medir-robos -- --simbolos BTCUSDT,MYXUSDT   (só para testar o caminho)
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { unzipSync, strFromU8 } from "fflate";
import {
  CAPITAL_ROBO,
  CUSTO_ATRASO,
  DIA,
  ESCORREGADA_STOP,
  HORA,
  MOMENTO_ANTERIOR,
  NOCIONAL_MINIMO,
  ROBOS,
  decidir,
  fechar,
  marcar,
  novoEstado,
  percorrer,
  valorDaPosicao,
  type EstadoRobo,
  type LinhaMedida,
  type LinhaRanking,
  type Medicao,
  type MedicaoRobo,
  type Robo,
  type TradeRobo,
} from "../lib/robos";

const INICIO_DADOS = Date.parse("2024-01-01T00:00:00Z");
/** Uma semana depois do começo dos dados: o ranking de 30 dias só fica completo depois. */
const INICIO = Date.parse("2024-01-08T00:00:00Z");
/** O corte entre dentro e fora da amostra da pesquisa. */
const CORTE = Date.parse("2025-07-01T00:00:00Z");
const CACHE = ".cache/robos";
const S3 = "https://s3-ap-northeast-1.amazonaws.com/data.binance.vision";
const DV = "https://data.binance.vision/";

const args = process.argv.slice(2);
const soSimbolos = (() => {
  const i = args.indexOf("--simbolos");
  return i >= 0 ? new Set(args[i + 1].split(",")) : null;
})();

// ------------------------------------------------------------------ download

/**
 * Teto de requisições ao Data Vision. A web usa 8 (`lib/datavision.ts`), e lá
 * a demora vira lista vazia numa função de dez segundos. Aqui é script com
 * nova tentativa: 24 em paralelo, medido na pesquisa, baixou os ~30 mil
 * arquivos com zero falha.
 */
const TETO = 24;
let emVoo = 0;
const fila: (() => void)[] = [];
async function comVaga<T>(f: () => Promise<T>): Promise<T> {
  if (emVoo >= TETO) await new Promise<void>((r) => fila.push(r));
  emVoo++;
  try {
    return await f();
  } finally {
    emVoo--;
    fila.shift()?.();
  }
}

/** 404 é "não existe"; falha depois das tentativas é "não consegui" — e as duas são contadas separadas. */
let falhas = 0;
async function baixar(url: string): Promise<Uint8Array | null> {
  return comVaga(async () => {
    for (let tentativa = 1; tentativa <= 4; tentativa++) {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return new Uint8Array(await res.arrayBuffer());
      } catch {
        await new Promise((r) => setTimeout(r, 1000 * tentativa));
      }
    }
    falhas++;
    return null;
  });
}

async function listar(prefixo: string): Promise<{ chaves: string[]; prefixos: string[] }> {
  const chaves: string[] = [];
  const prefixos: string[] = [];
  let marcador = "";
  for (;;) {
    const url = `${S3}?delimiter=/&prefix=${encodeURIComponent(prefixo)}&marker=${encodeURIComponent(marcador)}`;
    const corpo = await baixar(url);
    if (!corpo) break;
    const t = new TextDecoder().decode(corpo);
    for (const m of t.matchAll(/<Key>([^<]+\.zip)<\/Key>/g)) chaves.push(m[1]);
    for (const m of t.matchAll(/<Prefix>([^<]+)<\/Prefix>/g)) if (m[1] !== prefixo) prefixos.push(m[1]);
    const prox = t.match(/<NextMarker>([^<]+)<\/NextMarker>/);
    if (t.includes("<IsTruncated>true</IsTruncated>") && prox) marcador = prox[1];
    else break;
  }
  return { chaves, prefixos };
}

function linhasCsv(zip: Uint8Array): string[][] {
  const arqs = unzipSync(zip);
  const out: string[][] = [];
  for (const nome of Object.keys(arqs)) {
    for (const ln of strFromU8(arqs[nome]).split("\n")) {
      if (!ln || ln.charCodeAt(0) < 48 || ln.charCodeAt(0) > 57) continue; // cabeçalho
      out.push(ln.split(","));
    }
  }
  return out;
}

/**
 * Um mês de uma moeda: velas [abertura, o, h, l, c, volume em dólar] e
 * financiamento [instante, taxa]. Guardado em JSON por mês, para o mês novo não
 * obrigar a rebaixar os velhos.
 */
interface Mes {
  velas: number[][];
  funding: number[][];
}

async function mesDe(symbol: string, mes: string, temVelas: boolean, temFunding: boolean): Promise<Mes | null> {
  const arq = `${CACHE}/${symbol}/${mes}.json`;
  if (existsSync(arq)) return JSON.parse(await readFile(arq, "utf8")) as Mes;
  const [zk, zf] = await Promise.all([
    temVelas ? baixar(`${DV}data/futures/um/monthly/klines/${symbol}/1h/${symbol}-1h-${mes}.zip`) : null,
    temFunding ? baixar(`${DV}data/futures/um/monthly/fundingRate/${symbol}/${symbol}-fundingRate-${mes}.zip`) : null,
  ]);
  // Falha de rede não vira mês vazio no cache: devolve nulo e a próxima rodada tenta de novo.
  if ((temVelas && !zk) || (temFunding && !zf)) return null;
  const m: Mes = {
    velas: zk ? linhasCsv(zk).map((p) => [Number(p[0]), Number(p[1]), Number(p[2]), Number(p[3]), Number(p[4]), Number(p[7])]) : [],
    funding: zf ? linhasCsv(zf).map((p) => [Number(p[0]), Number(p[2])]) : [],
  };
  await mkdir(`${CACHE}/${symbol}`, { recursive: true });
  await writeFile(arq, JSON.stringify(m));
  return m;
}

// ------------------------------------------------------------------ a matriz

console.log("listando os perpétuos que o Data Vision já publicou…");
const raiz = await listar("data/futures/um/monthly/klines/");
let simbolos = raiz.prefixos.map((p) => p.split("/").slice(-2)[0]).filter((s) => s.endsWith("USDT"));
if (soSimbolos) simbolos = simbolos.filter((s) => soSimbolos.has(s));

// Ações, índices e metais em perpétuo não são moeda: fora.
const info = (await (await fetch("https://www.binance.com/fapi/v1/exchangeInfo")).json()) as {
  symbols: { symbol: string; contractType: string; status: string }[];
};
const tradfi = new Set(info.symbols.filter((s) => s.contractType === "TRADIFI_PERPETUAL").map((s) => s.symbol));
const negociando = new Set(info.symbols.filter((s) => s.status === "TRADING").map((s) => s.symbol));
simbolos = simbolos.filter((s) => !tradfi.has(s));
console.log(`${simbolos.length} perpétuos USDT de moeda`);

const mesMin = "2024-01";
const T = Math.floor((Date.now() - INICIO_DADOS) / HORA) + 1;

interface Serie {
  symbol: string;
  o: Float64Array;
  h: Float64Array;
  l: Float64Array;
  c: Float64Array;
  qv: Float64Array;
  /** Taxa do financiamento cobrado na abertura de cada hora; NaN sem cobrança. */
  fr: Float64Array;
  /** Índice da primeira vela; -1 sem nenhuma. */
  nasce: number;
}

let feitas = 0;
const series: Serie[] = [];
await Promise.all(
  simbolos.map(async (symbol) => {
    const [kl, fl] = await Promise.all([
      listar(`data/futures/um/monthly/klines/${symbol}/1h/`),
      listar(`data/futures/um/monthly/fundingRate/${symbol}/`),
    ]);
    const mesesK = new Set(kl.chaves.map((k) => k.slice(-11, -4)).filter((m) => m >= mesMin));
    const mesesF = new Set(fl.chaves.map((k) => k.slice(-11, -4)).filter((m) => m >= mesMin));
    const meses = [...new Set([...mesesK, ...mesesF])].sort();
    if (mesesK.size === 0) return;
    const s: Serie = {
      symbol,
      o: new Float64Array(T).fill(NaN),
      h: new Float64Array(T).fill(NaN),
      l: new Float64Array(T).fill(NaN),
      c: new Float64Array(T).fill(NaN),
      qv: new Float64Array(T),
      fr: new Float64Array(T).fill(NaN),
      nasce: -1,
    };
    for (const mes of meses) {
      const m = await mesDe(symbol, mes, mesesK.has(mes), mesesF.has(mes));
      if (!m) continue;
      for (const v of m.velas) {
        const i = Math.floor((v[0] - INICIO_DADOS) / HORA);
        if (i < 0 || i >= T) continue;
        s.o[i] = v[1];
        s.h[i] = v[2];
        s.l[i] = v[3];
        s.c[i] = v[4];
        s.qv[i] = v[5];
      }
      // O instante do arquivo vem com milissegundos de atraso (…00001); a
      // cobrança é a da hora cheia, e é nela que a posição precisa estar.
      for (const f of m.funding) {
        const i = Math.floor((f[0] - INICIO_DADOS) / HORA);
        if (i >= 0 && i < T && Number.isFinite(f[1])) s.fr[i] = (Number.isNaN(s.fr[i]) ? 0 : s.fr[i]) + f[1];
      }
    }
    for (let i = 0; i < T; i++) if (s.c[i] > 0) { s.nasce = i; break; }
    if (s.nasce < 0) return;
    series.push(s);
    feitas++;
    if (feitas % 100 === 0) console.log(`  ${feitas} moedas carregadas`);
  }),
);
series.sort((a, b) => a.symbol.localeCompare(b.symbol));
if (falhas > 0) {
  console.log(`\nATENÇÃO: ${falhas} arquivo(s) não baixaram depois de 4 tentativas — rode de novo antes de confiar no resultado.\n`);
}
let fim = 0;
for (const s of series) for (let i = T - 1; i >= 0; i--) if (s.c[i] > 0) { fim = Math.max(fim, i); break; }
const deslistadas = series.filter((s) => !negociando.has(s.symbol)).length;
console.log(`${series.length} moedas com vela, ${deslistadas} já deslistadas · até ${new Date(INICIO_DADOS + fim * HORA).toISOString().slice(0, 13)}h`);

// As do painel de manipuladas, se `npm run dados` trouxe o retrato: só para a conta de quanto veio delas.
const painel = await readFile("data/panorama.json", "utf8")
  .then((t) => new Set((JSON.parse(t) as { moedas: { symbol: string }[] }).moedas.map((m) => m.symbol)))
  .catch(() => null);

// ------------------------------------------------------------------ o ranking

/** Volume das 24 h que terminam no fechamento da vela `i`. */
function volume24(s: Serie, i: number): number {
  let v = 0;
  for (let k = Math.max(0, i - 23); k <= i; k++) v += s.qv[k];
  return v;
}

/** As linhas do ranking na decisão da hora `i` (meia-noite UTC): fechamento da vela anterior. */
function ranking(i: number, janelas: number[]): LinhaRanking[] {
  const out: LinhaRanking[] = [];
  const j = i - 1;
  for (const s of series) {
    const c = s.c[j];
    if (!(c > 0)) continue;
    const retorno: Record<number, number | null> = {};
    for (const d of janelas) {
      const a = s.c[j - 24 * d];
      retorno[d] = j - 24 * d >= 0 && a > 0 ? c / a - 1 : null;
    }
    // Moeda cuja primeira vela é o começo dos dados já existia antes: idade desconhecida, e maior.
    const idadeDias = s.nasce === 0 && s.c[0] > 0 ? null : (j - s.nasce) / 24;
    out.push({ symbol: s.symbol, retorno, volume: volume24(s, j), idadeDias });
  }
  return out;
}

// ------------------------------------------------------------------ a simulação

const porSimbolo = new Map(series.map((s) => [s.symbol, s]));

/**
 * Roda um robô de `de` a `ate` (milissegundos), do zero. A decisão é na
 * abertura da vela da meia-noite, com o fechamento da anterior; a entrada é na
 * abertura dela, PAGANDO o custo medido do atraso (`CUSTO_ATRASO`), porque o
 * ao vivo entra no primeiro retrato depois da meia-noite e não nela. O stop
 * escorrega como medido no minuto do disparo (`ESCORREGADA_STOP`), dentro de
 * `percorrer`.
 */
function simular(robo: Robo, de: number, ate: number, excluir?: Set<string>, tamanho?: number): EstadoRobo {
  const r: Robo = tamanho === undefined ? robo : { ...robo, regras: { ...robo.regras, tamanho } };
  const e = novoEstado(r, de);
  const janelas = [...new Set(r.regras.pernas.map((p) => p.janelaDias))];
  const i0 = Math.floor((de - INICIO_DADOS) / HORA);
  const i1 = Math.min(fim, Math.floor((ate - INICIO_DADOS) / HORA));
  for (let i = i0; i <= i1; i++) {
    const t = INICIO_DADOS + i * HORA;
    if (t % DIA === 0) {
      const linhas = ranking(i, janelas).filter((l) => !excluir?.has(l.symbol));
      decidir(e, linhas, (symbol) => porSimbolo.get(symbol)?.o[i], t, painel ?? undefined, CUSTO_ATRASO);
    }
    for (const p of [...e.abertas]) {
      const s = porSimbolo.get(p.symbol)!;
      const v = { t, o: s.o[i], h: s.h[i], l: s.l[i], c: s.c[i] };
      const cobrancas = Number.isNaN(s.fr[i]) ? [] : [{ t, taxa: s.fr[i] }];
      const saida = percorrer(p, [v], cobrancas, e);
      if (saida) fechar(e, p, saida);
    }
    marcar(e, t + HORA);
  }
  return e;
}

function sharpeDe(curva: { t: number; patrimonio: number }[]): number {
  const dias: number[] = [];
  let prox = curva[0]?.t ?? 0;
  for (const p of curva) {
    if (p.t >= prox) {
      dias.push(p.patrimonio);
      prox = p.t + DIA;
    }
  }
  const r: number[] = [];
  for (let k = 1; k < dias.length; k++) if (dias[k - 1] > 0) r.push(dias[k] / dias[k - 1] - 1);
  if (r.length < 2) return 0;
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const dp = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
  return dp > 0 ? (m / dp) * Math.sqrt(365) : 0;
}

function linhaDe(janela: string, e: EstadoRobo, de: number, ate: number): LinhaMedida {
  return {
    janela,
    de,
    ate,
    retorno: e.patrimonio / CAPITAL_ROBO - 1,
    quedaMaxima: e.quedaMaxima,
    sharpe: sharpeDe(e.curva),
    trades: e.fechadas.length + e.abertas.length,
  };
}

function trimestres(e: EstadoRobo): { trimestre: string; retorno: number }[] {
  const ult = new Map<string, number>();
  for (const p of e.curva) {
    const d = new Date(p.t - 1);
    ult.set(`${d.getUTCFullYear()}T${Math.floor(d.getUTCMonth() / 3) + 1}`, p.patrimonio);
  }
  const out: { trimestre: string; retorno: number }[] = [];
  let antes = CAPITAL_ROBO;
  for (const [q, v] of [...ult.entries()].sort()) {
    out.push({ trimestre: q, retorno: v / antes - 1 });
    antes = v;
  }
  return out;
}

function porMoeda(e: EstadoRobo): Map<string, number> {
  const m = new Map<string, number>();
  for (const t of e.fechadas) m.set(t.symbol, (m.get(t.symbol) ?? 0) + t.resultado);
  for (const p of e.abertas) m.set(p.symbol, (m.get(p.symbol) ?? 0) + valorDaPosicao(p, p.precoAtual) - p.margem);
  return m;
}

const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
const FIM = INICIO_DADOS + (fim + 1) * HORA;
const janelas: [string, number, number][] = [
  ["inteira", INICIO, FIM],
  ["dentro (até 06/2025)", INICIO, CORTE],
  ["fora (07/2025 em diante)", CORTE, FIM],
];

const medidos: MedicaoRobo[] = [];
const referencias: MedicaoRobo[] = [];
for (const robo of [...ROBOS, MOMENTO_ANTERIOR]) {
  console.log(`\n== ${robo.nome} — ${robo.descricao}`);
  const linhas: LinhaMedida[] = [];
  let inteira: EstadoRobo | null = null;
  for (const [nome, de, ate] of janelas) {
    const e = simular(robo, de, ate);
    if (nome === "inteira") inteira = e;
    const l = linhaDe(nome, e, de, ate);
    linhas.push(l);
    console.log(
      `${nome.padEnd(26)} ${pct(l.retorno).padStart(9)}  queda máx ${pct(l.quedaMaxima).padStart(7)}  ` +
        `Sharpe ${l.sharpe.toFixed(2)}  ${l.trades} trades` + (e.recusadas ? ` · ${e.recusadas} recusada(s) por caixa` : ""),
    );
  }
  const e = inteira!;
  const motivos = new Map<string, number>();
  for (const t of e.fechadas) motivos.set(t.motivo, (motivos.get(t.motivo) ?? 0) + 1);
  console.log("saídas: " + [...motivos.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} ${n}`).join(" · "));
  const q = trimestres(e);
  console.log("por trimestre: " + q.map((x) => `${x.trimestre} ${pct(x.retorno)}`).join(" · "));
  const moedas = [...porMoeda(e).entries()].sort((a, b) => b[1] - a[1]);
  console.log("as que mais deram: " + moedas.slice(0, 8).map(([s, v]) => `${s.replace(/USDT$/, "")} ${v >= 0 ? "+" : ""}${v.toFixed(0)}`).join(", "));
  const melhor = moedas[0]?.[0] ?? "—";
  const sem1 = simular(robo, INICIO, FIM, new Set([melhor]));
  // AS CINCO MELHORES DA JANELA INTEIRA, tiradas de cada janela: é o teste que
  // mais reprova seguidor de tendência, porque o lucro dele mora na cauda.
  const top5 = new Set(moedas.slice(0, 5).map(([s]) => s));
  const sem5 = janelas.map(([, de, ate]) => simular(robo, de, ate, top5).patrimonio / CAPITAL_ROBO - 1);
  console.log(
    `sem a melhor (${melhor.replace(/USDT$/, "")}) ${pct(sem1.patrimonio / CAPITAL_ROBO - 1)} · ` +
      `sem as 5 melhores (${[...top5].map((s) => s.replace(/USDT$/, "")).join(", ")}): ` +
      janelas.map(([nome], k) => `${nome.split(" ")[0]} ${pct(sem5[k])}`).join(" · "),
  );
  let daManipuladas: MedicaoRobo["daManipuladas"];
  if (painel) {
    const compras = e.fechadas.filter((t) => t.lado === "long");
    const total = compras.reduce((a, t) => a + t.resultado, 0);
    const manip = compras.filter((t) => t.manipulada).reduce((a, t) => a + t.resultado, 0);
    daManipuladas = { manipuladas: manip, total };
    console.log(`perna comprada: US$ ${total.toFixed(0)}, dos quais US$ ${manip.toFixed(0)} em moedas do painel de manipuladas`);
  }
  // Em quantas compras a pirâmide de fato entrou, e quanto elas fizeram: o
  // lucro dela mora em poucas posições, como o do resto do livro.
  let piramide: MedicaoRobo["piramide"];
  if (robo.regras.pernas.some((p) => p.piramide)) {
    const compras = e.fechadas.filter((t) => t.lado === "long");
    const soma = (ts: TradeRobo[]) => ts.reduce((a, t) => a + t.resultado, 0);
    const com = compras.filter((t) => (t.parcelas ?? 1) > 1);
    const sem = compras.filter((t) => (t.parcelas ?? 1) === 1);
    piramide = { compras: compras.length, comParcela: com.length, resultadoCom: soma(com), resultadoSem: soma(sem) };
    console.log(
      `pirâmide: entrou em ${com.length} de ${compras.length} compras (${pct(com.length / Math.max(1, compras.length))}), ` +
        `que fizeram US$ ${soma(com).toFixed(0)}; as outras ${sem.length}, US$ ${soma(sem).toFixed(0)}`,
    );
  }
  // A curva da janela inteira, um ponto por dia, para a tela.
  const curva: { t: number; patrimonio: number }[] = [];
  let prox = 0;
  for (const p of e.curva) if (p.t >= prox) { curva.push({ t: p.t, patrimonio: Math.round(p.patrimonio * 100) / 100 }); prox = p.t + DIA; }
  (robo === MOMENTO_ANTERIOR ? referencias : medidos).push({
    id: robo.id,
    linhas,
    trimestres: q,
    semAMelhor: { symbol: melhor, retorno: sem1.patrimonio / CAPITAL_ROBO - 1 },
    semAs5: { symbols: [...top5], retornos: sem5 },
    ...(daManipuladas ? { daManipuladas } : {}),
    ...(piramide ? { piramide } : {}),
    curva,
  });
}

// A escala do tamanho, medida sobre o mesmo livro: é a resposta a "e se arriscasse mais?".
console.log("\n== o tamanho, no livro do Momento (janela inteira)");
for (const tam of [0.02, 0.03, 0.035, 0.04, 0.05, 0.06, 0.07, 0.08]) {
  const e = simular(ROBOS[0], INICIO, FIM, undefined, tam);
  console.log(`${(tam * 100).toFixed(1)}% por posição  ${pct(e.patrimonio / CAPITAL_ROBO - 1).padStart(9)}  queda máx ${pct(e.quedaMaxima)}  Sharpe ${sharpeDe(e.curva).toFixed(2)}${e.recusadas ? ` · ${e.recusadas} recusadas` : ""}`);
}

if (soSimbolos) {
  console.log("\n--simbolos: medição parcial, data/robos-medicao.json NÃO gravado");
} else {
  const m: Medicao = {
    geradoEm: Date.now(),
    universo: { moedas: series.length, deslistadas, de: INICIO, ate: FIM },
    robos: medidos,
    referencias,
    realismo: { escorregadaStop: ESCORREGADA_STOP, custoAtraso: CUSTO_ATRASO, nocionalMinimo: NOCIONAL_MINIMO },
  };
  await writeFile("data/robos-medicao.json", `${JSON.stringify(m)}\n`);
  console.log("\ndata/robos-medicao.json gravado");
}
