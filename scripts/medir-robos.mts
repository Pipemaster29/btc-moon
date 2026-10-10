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
  JANELA_VOLATILIDADE_DIAS,
  MOMENTO_ANTERIOR,
  NOCIONAL_MINIMO,
  REGRAS_PADRAO,
  ROBOS,
  coeficienteDeImpacto,
  decidir,
  desvioDiario,
  fechar,
  lerRegrasDaCorretora,
  marcar,
  margemTotal,
  novoEstado,
  percorrer,
  valorDaPosicao,
  type DegrausDaCorretora,
  type EstadoRobo,
  type LinhaMedida,
  type LinhaRanking,
  type Medicao,
  type MedicaoRobo,
  type RegrasDaMoeda,
  type Robo,
  type SimboloDaCorretora,
  type TradeRobo,
} from "../lib/robos";
import {
  ESTATISTICAS_DA_FICHA,
  bootstrapEstacionario,
  correlacao,
  fichaDe,
  momentos,
  paridadeDeRisco,
  pboCSCV,
  porMes,
  quantil,
  retornosDiarios,
  sharpeDeflacionado,
  sharpeDiario,
  sharpeMaximoEsperado,
  sharpeProbabilistico,
  trilhaMinima,
  varianciaDoSharpeNulo,
  walkForward,
  type CapacidadeMedida,
  type FichaMedida,
  type FundoMedido,
  type MedicaoQuant,
  type ValidacaoLivro,
} from "../lib/quant";

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
 * Um mês de uma moeda: velas [abertura, o, h, l, c, volume em dólar, volume em
 * dólar comprado A MERCADO (taker buy)] e financiamento [instante, taxa].
 * Guardado em JSON por mês, para o mês novo não obrigar a rebaixar os velhos.
 * O mês gravado antes de 08/10 não tem a sétima coluna e é baixado de novo:
 * sem ela o robô Fluxo não tem ranking.
 */
interface Mes {
  velas: number[][];
  funding: number[][];
}

async function mesDe(symbol: string, mes: string, temVelas: boolean, temFunding: boolean): Promise<Mes | null> {
  const arq = `${CACHE}/${symbol}/${mes}.json`;
  if (existsSync(arq)) {
    const m = JSON.parse(await readFile(arq, "utf8")) as Mes;
    if (m.velas.length === 0 || m.velas[0].length >= 7) return m;
  }
  const [zk, zf] = await Promise.all([
    temVelas ? baixar(`${DV}data/futures/um/monthly/klines/${symbol}/1h/${symbol}-1h-${mes}.zip`) : null,
    temFunding ? baixar(`${DV}data/futures/um/monthly/fundingRate/${symbol}/${symbol}-fundingRate-${mes}.zip`) : null,
  ]);
  // Falha de rede não vira mês vazio no cache: devolve nulo e a próxima rodada tenta de novo.
  if ((temVelas && !zk) || (temFunding && !zf)) return null;
  const m: Mes = {
    velas: zk ? linhasCsv(zk).map((p) => [Number(p[0]), Number(p[1]), Number(p[2]), Number(p[3]), Number(p[4]), Number(p[7]), Number(p[10])]) : [],
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
  /** Volume em dólar comprado a mercado (taker buy) em cada hora. */
  tb: Float64Array;
  /** Somas acumuladas de `qv` e `tb` (índice i = soma das horas 0..i−1), para a janela do fluxo sair em O(1). */
  qvAc: Float64Array;
  tbAc: Float64Array;
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
      tb: new Float64Array(T),
      qvAc: new Float64Array(T + 1),
      tbAc: new Float64Array(T + 1),
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
        s.tb[i] = Number.isFinite(v[6]) ? v[6] : 0;
      }
      // O instante do arquivo vem com milissegundos de atraso (…00001); a
      // cobrança é a da hora cheia, e é nela que a posição precisa estar.
      for (const f of m.funding) {
        const i = Math.floor((f[0] - INICIO_DADOS) / HORA);
        if (i >= 0 && i < T && Number.isFinite(f[1])) s.fr[i] = (Number.isNaN(s.fr[i]) ? 0 : s.fr[i]) + f[1];
      }
    }
    for (let i = 0; i < T; i++) if (s.c[i] > 0) { s.nasce = i; break; }
    for (let i = 0; i < T; i++) {
      s.qvAc[i + 1] = s.qvAc[i] + s.qv[i];
      s.tbAc[i + 1] = s.tbAc[i] + s.tb[i];
    }
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

// ------------------------------------------------------------------ a corretora

/**
 * As regras da Binance DE HOJE — nocional mínimo, passo da quantidade e os
 * degraus da margem de manutenção (`lerRegrasDaCorretora`) —, aplicadas à
 * janela inteira: a Binance não publica o histórico da tabela. Ficam no cache
 * com a data, para a medição não mudar de uma rodada para outra sem ninguém
 * pedir; `--corretora-nova` baixa de novo. Moeda deslistada ou sem degrau usa
 * `REGRAS_PADRAO`, a tabela mais dura das comuns.
 */
const ARQ_CORRETORA = `${CACHE}/corretora.json`;
interface CacheCorretora {
  em: string;
  simbolos: SimboloDaCorretora[];
  degraus: DegrausDaCorretora[];
}
async function baixarJson<T>(url: string): Promise<T | null> {
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (res.ok) return (await res.json()) as T;
    } catch {
      // tenta de novo
    }
    await new Promise((r) => setTimeout(r, 1000 * tentativa));
  }
  return null;
}
let corretora: CacheCorretora | null = null;
if (existsSync(ARQ_CORRETORA) && !args.includes("--corretora-nova")) {
  corretora = JSON.parse(await readFile(ARQ_CORRETORA, "utf8")) as CacheCorretora;
} else {
  const [ei, tb] = await Promise.all([
    baixarJson<{ symbols: SimboloDaCorretora[] }>("https://www.binance.com/fapi/v1/exchangeInfo"),
    baixarJson<{ data?: { brackets?: DegrausDaCorretora[] } }>("https://www.binance.com/bapi/futures/v1/friendly/future/common/brackets"),
  ]);
  // Sem a tabela a medição NÃO roda com a régua antiga em silêncio: para.
  if (!ei?.symbols?.length || !tb?.data?.brackets?.length) {
    console.error("a Binance não devolveu o exchangeInfo ou a tabela de degraus — sem as regras da corretora a medição não roda");
    process.exit(1);
  }
  corretora = { em: new Date().toISOString().slice(0, 10), simbolos: ei.symbols, degraus: tb.data.brackets };
  await mkdir(CACHE, { recursive: true });
  await writeFile(ARQ_CORRETORA, JSON.stringify(corretora));
}
const regrasDaCorretora = lerRegrasDaCorretora(corretora.simbolos, corretora.degraus);
const regrasDe = (symbol: string): RegrasDaMoeda => regrasDaCorretora.get(symbol) ?? REGRAS_PADRAO;
console.log(
  `regras da corretora de ${corretora.em}: ${regrasDaCorretora.size} símbolos com degraus; ` +
    `${series.filter((s) => !regrasDaCorretora.has(s.symbol)).length} das ${series.length} moedas medidas usam a tabela padrão`,
);

// ------------------------------------------------------------------ o ranking

/** Volume das 24 h que terminam no fechamento da vela `i`. */
function volume24(s: Serie, i: number): number {
  let v = 0;
  for (let k = Math.max(0, i - 23); k <= i; k++) v += s.qv[k];
  return v;
}

/**
 * As linhas do ranking na decisão da hora `i` (meia-noite UTC): fechamento da
 * vela anterior. O fluxo de cada janela é a fração do volume em dólar das
 * últimas 24·d horas que foi compra a mercado — a mesma conta que o ao vivo faz
 * com as velas diárias —, e só existe quando a série cobre a janela inteira.
 */
function ranking(i: number, janelas: number[], janelasFluxo: number[] = [], janelaVol = 0, comCorretora = true): LinhaRanking[] {
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
    const linha: LinhaRanking = {
      symbol: s.symbol,
      retorno,
      volume: volume24(s, j),
      // Moeda cuja primeira vela é o começo dos dados já existia antes: idade desconhecida, e maior.
      idadeDias: s.nasce === 0 && s.c[0] > 0 ? null : (j - s.nasce) / 24,
      ...(comCorretora ? { corretora: regrasDe(s.symbol) } : {}),
    };
    if (janelasFluxo.length > 0) {
      const fluxo: Record<number, number | null> = {};
      for (const d of janelasFluxo) {
        const ini = j + 1 - 24 * d;
        const qv = ini >= s.nasce && ini >= 0 ? s.qvAc[j + 1] - s.qvAc[ini] : NaN;
        const tb = ini >= s.nasce && ini >= 0 ? s.tbAc[j + 1] - s.tbAc[ini] : NaN;
        fluxo[d] = qv > 0 && Number.isFinite(tb) ? tb / qv : null;
      }
      linha.fluxo = fluxo;
    }
    // O desvio diário da `Perna.porVolatilidade`: os fechamentos de 24 em 24 h
    // até a véspera, a mesma conta que o ao vivo faz com as velas diárias.
    if (janelaVol > 0) {
      const fechamentos: number[] = [];
      for (let k = janelaVol; k >= 0; k--) {
        const h = j - 24 * k;
        fechamentos.push(h >= 0 && h >= s.nasce ? s.c[h] : NaN);
      }
      linha.vol = desvioDiario(fechamentos);
    }
    out.push(linha);
  }
  return out;
}

// ------------------------------------------------------------------ as variações

const MOMENTO = ROBOS.find((r) => r.id === "momento")!;
const FLUXO = ROBOS.find((r) => r.id === "fluxo")!;

/**
 * A GRADE DE VARIAÇÕES de cada livro: as peças que a pesquisa de fato mexeu,
 * nos valores que ela mediu, todas combinadas entre si. É dela que saem os
 * testes de sobreajuste (`lib/quant.ts`): o PBO e o walk-forward escolhem
 * DENTRO dela, e o Sharpe deflacionado usa o espalhamento dela. A regra
 * publicada é uma das combinações.
 *
 * Momento, 144: janela da compra 30/45/60 dias × janela da venda 7/14/21 × saída
 * por posto (sem, top 10) × pirâmide (sem, +40%) × alvo de volatilidade (sem,
 * 60%/40 d) × vendida pela volatilidade (sem, ¼–2x), todas a 4,25%.
 * Fluxo, 108: janela 5/7/10/14 dias × k 3/5/7 × prazo 7/14/21 dias × stop
 * 30/45/60%, todas a 3%.
 */
function gradeDoMomento(): Robo[] {
  const compra = MOMENTO.regras.pernas.find((p) => p.lado === "long")!;
  const venda = MOMENTO.regras.pernas.find((p) => p.lado === "short")!;
  const out: Robo[] = [];
  for (const jc of [30, 45, 60])
    for (const jv of [7, 14, 21])
      for (const posto of [false, true])
        for (const piramide of [false, true])
          for (const alvo of [false, true])
            for (const pv of [false, true]) {
              const c = { ...compra, janelaDias: jc };
              if (!posto) delete c.saidaPosto;
              if (!piramide) delete c.piramide;
              const v = { ...venda, janelaDias: jv };
              if (!pv) delete v.porVolatilidade;
              const regras = { ...MOMENTO.regras, pernas: [c, v] };
              if (!alvo) delete regras.alvoVolatilidade;
              out.push({ ...MOMENTO, id: `momento·c${jc}·v${jv}${posto ? "·posto" : ""}${piramide ? "·pir" : ""}${alvo ? "·alvo" : ""}${pv ? "·vol" : ""}`, regras });
            }
  return out;
}
function gradeDoFluxo(): Robo[] {
  const venda = FLUXO.regras.pernas[0];
  const out: Robo[] = [];
  for (const janelaDias of [5, 7, 10, 14])
    for (const k of [3, 5, 7])
      for (const prazo of [7, 14, 21])
        for (const stop of [0.3, 0.45, 0.6])
          out.push({
            ...FLUXO,
            id: `fluxo·j${janelaDias}·k${k}·p${prazo}·s${stop * 100}`,
            regras: { ...FLUXO.regras, pernas: [{ ...venda, janelaDias, k, prazoH: prazo * 24, stop }] },
          });
  return out;
}
const GRADES: { livro: Robo; variantes: Robo[] }[] = [
  { livro: MOMENTO, variantes: gradeDoMomento() },
  { livro: FLUXO, variantes: gradeDoFluxo() },
];

// ------------------------------------------------------------------ a simulação

const porSimbolo = new Map(series.map((s) => [s.symbol, s]));

/**
 * TODAS as janelas que algum robô ou variação lê, de retorno e de fluxo: o
 * ranking de cada dia sai uma vez com todas e serve a todos. Linha com janela
 * a mais não muda nada — cada perna lê só a dela —, e o desvio de 45 dias vai
 * junto sempre: só a perna com `porVolatilidade` o lê.
 */
const todosOsRobos = [...ROBOS, MOMENTO_ANTERIOR, ...GRADES.flatMap((g) => g.variantes)];
const JANELAS_TODAS = [...new Set(todosOsRobos.flatMap((r) => r.regras.pernas.flatMap((p) => [p.janelaDias, ...(p.saidaPosto ? [p.janelaDias] : [])])))].sort((a, b) => a - b);
const JANELAS_FLUXO_TODAS = [...new Set(todosOsRobos.flatMap((r) => r.regras.pernas.filter((p) => p.criterio === "fluxo").map((p) => p.janelaDias)))].sort((a, b) => a - b);

/**
 * O ranking de cada dia, guardado: a mesma conta servia a ~400 simulações e
 * era dois terços do tempo de cada uma (2,9 s de 4,1 s no Momento). Só a
 * combinação de sempre (desvio de 45 dias, com as regras da corretora) é
 * guardada; as dos platôs saem na hora.
 */
const linhasGuardadas = new Map<number, LinhaRanking[]>();
function linhasDoDia(i: number, janelaVol: number, comCorretora: boolean): LinhaRanking[] {
  const padrao = janelaVol === JANELA_VOLATILIDADE_DIAS && comCorretora;
  if (padrao) {
    const g = linhasGuardadas.get(i);
    if (g) return g;
  }
  const l = ranking(i, JANELAS_TODAS, JANELAS_FLUXO_TODAS, janelaVol, comCorretora);
  if (padrao) linhasGuardadas.set(i, l);
  return l;
}

/**
 * O volume diário MÉDIO dos 7 dias até a véspera da hora `i`, em dólar — a
 * régua do impacto. O de 24 h sozinho é o dia do pump, e é justo o dia em que
 * a moeda entra no ranking: medido sobre ele, o impacto sairia menor do que é.
 */
function volumeMedio7(s: Serie, i: number): number {
  const j = i - 1;
  const ini = Math.max(0, s.nasce, j + 1 - 7 * 24);
  const horas = j + 1 - ini;
  if (horas < 24) return NaN;
  return ((s.qvAc[j + 1] - s.qvAc[ini]) / horas) * 24;
}

/** O que a medição de capacidade e o fundo pedem a mais de uma simulação. */
interface Extra {
  /** Com quanto o robô começa; o padrão é `CAPITAL_ROBO`. */
  capital?: number;
  /** O Y da lei da raiz quadrada (`coeficienteDeImpacto`); sem ele, impacto zero. */
  y?: number;
  /** Onde guardar o caixa e o patrimônio de cada virada de dia: o fundo confere se a transferência cabia. */
  viradas?: { t: number; caixa: number; patrimonio: number }[];
}

/**
 * Roda um robô de `de` a `ate` (milissegundos), do zero. A decisão é na
 * abertura da vela da meia-noite, com o fechamento da anterior; a entrada é na
 * abertura dela, PAGANDO o custo medido do atraso (`CUSTO_ATRASO`), porque o
 * ao vivo entra no primeiro retrato depois da meia-noite e não nela. O stop
 * escorrega como medido no minuto do disparo (`ESCORREGADA_STOP`), dentro de
 * `percorrer`.
 */
function simular(
  robo: Robo,
  de: number,
  ate: number,
  excluir?: Set<string>,
  tamanho?: number,
  /** A janela do desvio de `Perna.porVolatilidade`, em dias — só para medir o platô dela. */
  janelaVol = JANELA_VOLATILIDADE_DIAS,
  /** Falso: o motor de antes de 09/10, sem as regras da corretora — só para medir o que elas custam. */
  comCorretora = true,
  extra: Extra = {},
): EstadoRobo {
  const r: Robo = tamanho === undefined ? robo : { ...robo, regras: { ...robo.regras, tamanho } };
  const e = novoEstado(r, de, extra.capital);
  // O símbolo do hedge fica no ranking mesmo no "sem as 5": é dele que sai o preço do par.
  const hedges = new Set(r.regras.pernas.flatMap((p) => (p.hedge ? [p.hedge.symbol] : [])));
  const i0 = Math.floor((de - INICIO_DADOS) / HORA);
  const i1 = Math.min(fim, Math.floor((ate - INICIO_DADOS) / HORA));
  const vela = (s: Serie, i: number, t: number) => ({ t, o: s.o[i], h: s.h[i], l: s.l[i], c: s.c[i] });
  const cobrancaDe = (s: Serie, i: number, t: number) => (Number.isNaN(s.fr[i]) ? [] : [{ t, taxa: s.fr[i] }]);
  for (let i = i0; i <= i1; i++) {
    const t = INICIO_DADOS + i * HORA;
    if (t % DIA === 0) {
      let linhas = linhasDoDia(i, janelaVol, comCorretora).filter((l) => !excluir?.has(l.symbol) || hedges.has(l.symbol));
      if (extra.y) {
        // O desvio de quem não tem 45 dias de série é o do meio do dia: moeda nova não sai de graça.
        const vols = linhas.map((l) => l.vol).filter((v): v is number => typeof v === "number" && v > 0);
        const meio = vols.length > 0 ? quantil(vols, 0.5) : NaN;
        const y = extra.y;
        linhas = linhas.map((l) => {
          const s = porSimbolo.get(l.symbol)!;
          const v = volumeMedio7(s, i);
          return { ...l, impacto: coeficienteDeImpacto(y, typeof l.vol === "number" && l.vol > 0 ? l.vol : meio, Number.isFinite(v) && v > 0 ? v : l.volume) };
        });
      }
      decidir(e, linhas, (symbol) => porSimbolo.get(symbol)?.o[i], t, painel ?? undefined, CUSTO_ATRASO);
    }
    for (const p of [...e.abertas]) {
      const s = porSimbolo.get(p.symbol)!;
      const sh = p.hedge ? porSimbolo.get(p.hedge.symbol) : undefined;
      const hedge = sh ? { velas: [vela(sh, i, t)], cobrancas: cobrancaDe(sh, i, t) } : undefined;
      const saida = percorrer(p, [vela(s, i, t)], cobrancaDe(s, i, t), e, hedge);
      if (saida) fechar(e, p, saida);
    }
    marcar(e, t + HORA);
    if (extra.viradas && (t + HORA) % DIA === 0) extra.viradas.push({ t: t + HORA, caixa: e.caixa, patrimonio: e.patrimonio });
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
  for (const p of e.abertas) m.set(p.symbol, (m.get(p.symbol) ?? 0) + valorDaPosicao(p, p.precoAtual) - margemTotal(p));
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
/** Os estados de cada robô em cada janela (na ordem de `janelas`), com e sem as 5 melhores: a mesa lê deles. */
const estados = new Map<string, { janelas: EstadoRobo[]; sem5: EstadoRobo[] }>();
for (const robo of [...ROBOS, MOMENTO_ANTERIOR]) {
  console.log(`\n== ${robo.nome} — ${robo.descricao}`);
  const linhas: LinhaMedida[] = [];
  let inteira: EstadoRobo | null = null;
  const porJanela: EstadoRobo[] = [];
  for (const [nome, de, ate] of janelas) {
    const e = simular(robo, de, ate);
    porJanela.push(e);
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
  const sem5Estados = janelas.map(([, de, ate]) => simular(robo, de, ate, top5));
  const sem5 = sem5Estados.map((x) => x.patrimonio / CAPITAL_ROBO - 1);
  estados.set(robo.id, { janelas: porJanela, sem5: sem5Estados });
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
  if (robo.regras.pernas.some((p) => p.hedge)) {
    const pares = e.fechadas.filter((t) => t.hedge);
    const doHedge = pares.reduce((a, t) => a + (t.hedge?.resultado ?? 0), 0);
    const total = pares.reduce((a, t) => a + t.resultado, 0);
    const liquidados = pares.filter((t) => t.hedge?.liquidada).length;
    console.log(`pares: ${pares.length}, que fizeram US$ ${total.toFixed(0)} — US$ ${(total - doHedge).toFixed(0)} na perna vendida e US$ ${doHedge.toFixed(0)} no hedge · ${liquidados} hedge(s) liquidado(s)`);
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

// O QUE AS REGRAS DA CORRETORA CUSTAM: cada robô no motor de antes de 09/10
// (0,5% de manutenção em toda moeda, liquidação fixa, sem passo nem mínimo
// por símbolo) contra o publicado, e quanto da margem cada lado precisou a mais.
console.log(`\n== as regras da corretora (tabela de ${corretora.em}), robô a robô`);
const doRealismo: NonNullable<NonNullable<Medicao["realismo"]>["corretora"]>["robos"] = [];
for (const robo of ROBOS) {
  let semRegras = NaN;
  for (const com of [false, true]) {
    const es = janelas.map(([, de, ate]) => simular(robo, de, ate, undefined, undefined, undefined, com));
    const liq = es[0].fechadas.filter((t) => t.motivo === "liquidada").length;
    if (!com) semRegras = es[0].patrimonio / CAPITAL_ROBO - 1;
    else {
      const vendidas = es[0].fechadas.filter((t) => t.lado === "short" && !t.hedge);
      const alvo = Math.max(0, ...robo.regras.pernas.filter((p) => p.lado === "short" && !p.hedge).map((p) => p.alavancagem));
      doRealismo.push({
        id: robo.id,
        semRegras,
        comRegras: es[0].patrimonio / CAPITAL_ROBO - 1,
        liquidadas: liq,
        vendidas: vendidas.length,
        comMargemAMais: vendidas.filter((t) => t.nocional / t.margem < alvo - 0.005).length,
      });
    }
    console.log(
      `${(robo.nome + (com ? " · com as regras" : " · sem")).padEnd(34)} ` +
        janelas.map(([j], k) => `${j.split(" ")[0]} ${pct(es[k].patrimonio / CAPITAL_ROBO - 1)}`).join(" · ") +
        `  queda máx ${pct(es[0].quedaMaxima)}  Sharpe ${sharpeDe(es[0].curva).toFixed(2)}  ${liq} liquidada(s) · ${es[0].recusadas} recusada(s)`,
    );
    if (com) {
      for (const lado of ["long", "short"] as const) {
        const ts = es[0].fechadas.filter((t) => t.lado === lado && !t.hedge);
        if (ts.length === 0) continue;
        const alav = ts.map((t) => t.nocional / t.margem);
        const alvo = Math.max(...robo.regras.pernas.filter((p) => p.lado === lado).map((p) => p.alavancagem));
        const menor = alav.filter((x) => x < alvo - 0.005).length;
        console.log(`    ${lado === "long" ? "compradas" : "vendidas"}: ${menor} de ${ts.length} com margem a mais (alavancagem média ${(alav.reduce((x, y) => x + y, 0) / alav.length).toFixed(2)}x, alvo ${alvo}x)`);
      }
    }
  }
}

// A escala do tamanho, medida sobre o mesmo livro: é a resposta a "e se arriscasse mais?".
console.log("\n== o tamanho, no livro do Momento (janela inteira)");
for (const tam of [0.02, 0.03, 0.035, 0.04, 0.0425, 0.05, 0.06, 0.06375, 0.07, 0.08]) {
  const e = simular(ROBOS[0], INICIO, FIM, undefined, tam);
  console.log(`${String(+(tam * 100).toFixed(3)).padStart(5)}% por posição  ${pct(e.patrimonio / CAPITAL_ROBO - 1).padStart(9)}  queda máx ${pct(e.quedaMaxima)}  Sharpe ${sharpeDe(e.curva).toFixed(2)}${e.recusadas ? ` · ${e.recusadas} recusadas` : ""}`);
}

// A vendida pela volatilidade da moeda (`VENDA_MOMENTO`): o platô da janela do
// desvio e dos limites, cada metade com o próprio Sharpe. A regra anterior, na
// mesma queda máxima, está no bloco "Momento anterior" acima.
console.log("\n== a vendida pela volatilidade da moeda, no Momento");
const linhaVol = (nome: string, robo: Robo, janelaVol?: number) => {
  const es = janelas.map(([, de, ate]) => simular(robo, de, ate, undefined, undefined, janelaVol));
  console.log(
    `${nome.padEnd(20)} ` +
      janelas.map(([j], k) => `${j.split(" ")[0]} ${pct(es[k].patrimonio / CAPITAL_ROBO - 1)} (Sharpe ${sharpeDe(es[k].curva).toFixed(2)})`).join(" · ") +
      `  queda máx ${pct(es[0].quedaMaxima)}`,
  );
};
for (const dias of [14, 21, 30, 45, 60]) linhaVol(`desvio de ${dias} dias`, ROBOS[0], dias);
for (const [minimo, maximo] of [[0.5, 2], [0.25, 1.5], [0.25, 3]] as const) {
  const m = ROBOS[0];
  const pernas = m.regras.pernas.map((p) => (p.porVolatilidade ? { ...p, porVolatilidade: { minimo, maximo } } : p));
  linhaVol(`limites ${minimo} a ${maximo}`, { ...m, regras: { ...m.regras, pernas } });
}

// E a do Fluxo, que é outro livro: o tamanho dele se escolhe pela própria queda.
const fluxoRobo = ROBOS.find((r) => r.id === "fluxo");
if (fluxoRobo) {
  console.log("\n== o tamanho, no livro do Fluxo (janela inteira)");
  for (const tam of [0.02, 0.025, 0.03, 0.035, 0.04, 0.05, 0.06]) {
    const e = simular(fluxoRobo, INICIO, FIM, undefined, tam);
    console.log(`${(tam * 100).toFixed(1)}% por posição  ${pct(e.patrimonio / CAPITAL_ROBO - 1).padStart(9)}  queda máx ${pct(e.quedaMaxima)}  Sharpe ${sharpeDe(e.curva).toFixed(2)}${e.recusadas ? ` · ${e.recusadas} recusadas` : ""}`);
  }
  // O alvo de volatilidade do Momento, medido aqui e reprovado. Ele aumenta a
  // aposta quando o patrimônio está calmo, então a comparação justa é na MESMA
  // queda máxima: 2% com ele chega aos −22% dos 3% sem. Cada metade com a
  // própria queda e o próprio Sharpe, e sem as 5 melhores de cada versão.
  console.log("\n== o alvo de volatilidade do Momento, no livro do Fluxo (na mesma queda máxima)");
  const comAlvo: Robo = {
    ...fluxoRobo,
    regras: { ...fluxoRobo.regras, tamanho: 0.02, alvoVolatilidade: ROBOS.find((r) => r.id === "momento")?.regras.alvoVolatilidade },
  };
  for (const [nome, r] of [["publicado", fluxoRobo], ["com o alvo, 2%", comAlvo]] as const) {
    const es = janelas.map(([, de, ate]) => simular(r, de, ate));
    const top = new Set([...porMoeda(es[0]).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s]) => s));
    const sem = janelas.map(([, de, ate]) => simular(r, de, ate, top).patrimonio / CAPITAL_ROBO - 1);
    console.log(
      `${nome.padEnd(15)} ` +
        janelas
          .map(([j], k) => `${j.split(" ")[0]} ${pct(es[k].patrimonio / CAPITAL_ROBO - 1)} (queda ${pct(es[k].quedaMaxima)}, Sharpe ${sharpeDe(es[k].curva).toFixed(2)})`)
          .join(" · ") +
        ` · sem as 5: ` +
        janelas.map(([j], k) => `${j.split(" ")[0]} ${pct(sem[k])}`).join(" · "),
    );
  }
}

// ------------------------------------------------------------------ a mesa

/**
 * O QUE UMA MESA DE FUNDO PERGUNTA ANTES DE PÔR DINHEIRO NUMA ESTRATÉGIA, com
 * as funções de `lib/quant.ts`: a ficha de risco de cada robô contra o BTC; se
 * o Sharpe sobrevive à quantidade de ideias testadas até achá-lo; se escolher
 * a regra pelo passado teria escolhido bem; quanto dinheiro cada livro aguenta
 * com o impacto de mercado dentro; e o que os livros fazem juntos, repartidos
 * por risco como num fundo multiestratégia.
 *
 * AS TENTATIVAS DA PESQUISA, contadas por baixo: os comentários de
 * `lib/robos.ts` registram ~240 variações medidas e reprovadas ou escolhidas
 * (as ideias da primeira bancada, as janelas, os postos, os alvos, os filtros,
 * a rodada de livros diferentes, os platôs e os ataques), e a primeira bancada
 * testou outras sem anotar. 300 é o N do Sharpe deflacionado "da pesquisa".
 */
const TENTATIVAS_DA_PESQUISA = 300;
const SEMENTE = 20_261_010;
const AMOSTRAS = 2000;
/** Blocos de 20 dias em média: um mês de memória, o tamanho de uma alta de monstra. */
const BLOCO_MEDIO = 20;

/** A curva de um ponto por virada de dia (00:00 UTC), a partir da horária do motor. */
function diaria(e: EstadoRobo): { t: number; patrimonio: number }[] {
  const out: { t: number; patrimonio: number }[] = [];
  let prox = 0;
  for (const p of e.curva) if (p.t >= prox) { out.push(p); prox = p.t + DIA; }
  return out;
}
const retornosDe = (e: EstadoRobo) => retornosDiarios(diaria(e));

const btc = porSimbolo.get("BTCUSDT");
/** O fechamento do BTC na virada `t`: o da vela de 1 h que termina nela. */
const fechamentoBTC = (t: number) => {
  const i = Math.round((t - INICIO_DADOS) / HORA) - 1;
  return btc && i >= 0 ? btc.c[i] : NaN;
};
const retornoBTC = (datas: readonly number[]) => datas.map((t) => fechamentoBTC(t) / fechamentoBTC(t - DIA) - 1);
const intervaloDe = (xs: number[]): [number, number, number] => [quantil(xs, 0.025), quantil(xs, 0.5), quantil(xs, 0.975)];

function trades(e: EstadoRobo): NonNullable<FichaMedida["trades"]> {
  const ts = e.fechadas;
  const ganhos = ts.filter((t) => t.resultado > 0);
  const perdas = ts.filter((t) => t.resultado < 0);
  const soma = (xs: TradeRobo[]) => xs.reduce((a, t) => a + t.resultado, 0);
  const media = (xs: number[]) => (xs.length > 0 ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
  const curva = diaria(e);
  const patrimonioMedio = media(curva.map((p) => p.patrimonio));
  const anos = (e.atualizadoEm - e.comecouEm) / (365 * DIA);
  const giro = ts.reduce((a, t) => a + 2 * (t.nocional + (t.hedge ? t.nocional : 0)), 0);
  return {
    n: ts.length,
    positivos: ts.length > 0 ? ganhos.length / ts.length : NaN,
    ganhoMedio: media(ganhos.map((t) => t.resultado / t.nocional)),
    perdaMedia: media(perdas.map((t) => t.resultado / t.nocional)),
    fatorDeLucro: soma(perdas) < 0 ? soma(ganhos) / -soma(perdas) : NaN,
    duracaoMediaDias: media(ts.map((t) => (t.fechadaEm - t.abertaEm) / DIA)),
    giroAnual: patrimonioMedio > 0 && anos > 0 ? giro / patrimonioMedio / anos : NaN,
  };
}

function fichaMedida(id: string, r: number[], datas: number[], e?: EstadoRobo): FichaMedida {
  const [sharpe, cagr, queda] = bootstrapEstacionario(r, ESTATISTICAS_DA_FICHA, AMOSTRAS, BLOCO_MEDIO, SEMENTE);
  return {
    id,
    ficha: fichaDe(r, datas, id === "btc" ? undefined : retornoBTC(datas)),
    intervalo: {
      amostras: AMOSTRAS,
      blocoMedio: BLOCO_MEDIO,
      sharpe: intervaloDe(sharpe),
      cagr: intervaloDe(cagr),
      queda: intervaloDe(queda),
      sharpeNegativo: sharpe.filter((x) => !(x > 0)).length / sharpe.length,
    },
    probabilistico: sharpeProbabilistico(r, 0),
    trilhaMinimaDias: trilhaMinima(r, 0, 0.95),
    trilhaMinimaDiasSharpe1: trilhaMinima(r, 1 / Math.sqrt(365), 0.95),
    meses: porMes(r, datas),
    ...(e ? { trades: trades(e) } : {}),
  };
}

const f2 = (v: number) => (Number.isFinite(v) ? v.toFixed(2) : "—");

// O FUNDO: Momento e Fluxo em subcontas, pelo inverso da volatilidade de 90 dias, refeito todo dia 1º.
const COMPONENTES = [MOMENTO, FLUXO];
const JANELA_FUNDO = 90;
const iCorte = (datas: readonly number[]) => datas.findIndex((t) => t > CORTE);
type Virada = { t: number; caixa: number; patrimonio: number };
/** Um livro do fundo numa janela, guardando o caixa de cada virada: é dele que sai a transferência. */
function livroDoFundo(robo: Robo, de: number, ate: number, excluir?: Set<string>, tamanho?: number): { e: EstadoRobo; viradas: Virada[] } {
  const viradas: Virada[] = [];
  const e = simular(robo, de, ate, excluir, tamanho, undefined, true, { viradas });
  return { e, viradas };
}
function fundoDe(livros: { e: EstadoRobo; viradas: Virada[] }[], historico?: number[][]) {
  const rs = livros.map((l) => retornosDe(l.e));
  // As séries precisam cobrir os mesmos dias; a de menos dias manda.
  const n = Math.min(...rs.map((x) => x.r.length));
  const datas = rs[0].datas.slice(rs[0].datas.length - n);
  // O caixa livre de cada livro na virada que ABRE cada dia (o começo da janela é todo caixa).
  const livre = livros.map((l) => {
    const porT = new Map(l.viradas.map((v) => [v.t, v.patrimonio > 0 ? v.caixa / v.patrimonio : 0]));
    return datas.map((t) => porT.get(t - DIA) ?? (t - DIA === l.e.comecouEm ? 1 : 0));
  });
  return paridadeDeRisco(rs.map((x) => x.r.slice(x.r.length - n)), datas, JANELA_FUNDO, 20, historico, livre);
}
/** As cinco moedas que mais deram ao robô na janela inteira (as do "sem as 5"). */
const semAs5De = (id: string): string[] => medidos.find((m) => m.id === id)?.semAs5?.symbols ?? [];
function historicoAntesDoCorte(): number[][] {
  return COMPONENTES.map((c) => {
    const { datas, r } = retornosDe(estados.get(c.id)!.janelas[0]);
    return r.slice(0, iCorte(datas));
  });
}
const linhaDoFundo = (janela: string, r: number[], datas: number[]) => {
  const f = fichaDe(r, datas);
  return { janela, retorno: f.retorno, quedaMaxima: f.quedaMaxima, sharpe: f.sharpe };
};

console.log("\n== o fundo: Momento e Fluxo em paridade de risco (90 dias, todo dia 1º, só com o caixa livre)");
const livrosPorJanela = janelas.map(([, de, ate]) => COMPONENTES.map((c) => livroDoFundo(c, de, ate)));
const livrosSem5 = janelas.map(([, de, ate]) => COMPONENTES.map((c) => livroDoFundo(c, de, ate, new Set(semAs5De(c.id)))));
const fundoJanelas = livrosPorJanela.map((ls, k) => fundoDe(ls, k === 2 ? historicoAntesDoCorte() : undefined));
const fundoSem5 = livrosSem5.map((ls, k) => fundoDe(ls, k === 2 ? historicoAntesDoCorte() : undefined));
const fundoInteira = fundoJanelas[0];
const linhasFundo = janelas.map(([nome], k) => linhaDoFundo(nome, fundoJanelas[k].r, fundoJanelas[k].datas));
const semAs5Fundo = fundoSem5.map((f) => f.r.reduce((a, x) => a * (1 + x), 1) - 1);
for (const [k, l] of linhasFundo.entries()) {
  console.log(`${l.janela.padEnd(26)} ${pct(l.retorno).padStart(9)}  queda máx ${pct(l.quedaMaxima)} (diária)  Sharpe ${f2(l.sharpe)} · sem as 5 de cada livro ${pct(semAs5Fundo[k])}`);
}
// Coube a transferência? A subconta que dá dinheiro só dá o que tem livre; o resto fica para o mês seguinte.
const limitados = fundoInteira.pesos.filter((p) => p.depois.some((w, j) => Math.abs(w - p.pesos[j]) > 1e-9)).length;
let maiorFracao = 0;
for (const reb of fundoInteira.pesos) {
  for (let j = 0; j < COMPONENTES.length; j++) {
    const sai = reb.antes[j] - reb.pesos[j];
    if (!(sai > 0)) continue;
    const v = livrosPorJanela[0][j].viradas.find((x) => x.t === reb.t);
    const livre = v && v.patrimonio > 0 ? (reb.antes[j] * v.caixa) / v.patrimonio : reb.t === INICIO ? reb.antes[j] : 0;
    maiorFracao = Math.max(maiorFracao, livre > 0 ? sai / livre : Infinity);
  }
}
console.log(
  `${fundoInteira.pesos.length} rebalanceamentos; o maior acerto pedia ${pct(maiorFracao).replace("+", "")} do caixa livre da subconta que dava` +
    (limitados > 0 ? ` · em ${limitados} o caixa livre não cobria, e o acerto ficou pela metade até o mês seguinte` : " · todos couberam no caixa livre"),
);
console.log(
  "pesos (Momento / Fluxo): " +
    fundoInteira.pesos
      .filter((_, k) => k % 6 === 0)
      .map((p) => `${new Date(p.t).toISOString().slice(0, 7)} ${(p.pesos[0] * 100).toFixed(0)}/${(p.pesos[1] * 100).toFixed(0)}`)
      .join(" · "),
);
// Na mesma queda do Momento: os livros com mais tamanho, cada um na sua subconta.
const alavancado: FundoMedido["alavancado"] = [];
for (const fator of [1.5, 2]) {
  const ls = janelas.map(([, de, ate]) => COMPONENTES.map((c) => livroDoFundo(c, de, ate, undefined, c.regras.tamanho * fator)));
  const recusadas = ls[0].reduce((a, l) => a + l.e.recusadas, 0);
  const fs = ls.map((x, k) => fundoDe(x, k === 2 ? historicoAntesDoCorte() : undefined));
  const linhas = janelas.map(([nome], k) => linhaDoFundo(nome, fs[k].r, fs[k].datas));
  alavancado.push({ fator, linhas, recusadas });
  console.log(
    `livros a ${fator}x o tamanho: ` + linhas.map((l) => `${l.janela.split(" ")[0]} ${pct(l.retorno)} (queda ${pct(l.quedaMaxima)}, Sharpe ${f2(l.sharpe)})`).join(" · ") + ` · ${recusadas} recusadas`,
  );
}
const fundo: FundoMedido = {
  componentes: COMPONENTES.map((c) => c.id),
  janelaDias: JANELA_FUNDO,
  linhas: linhasFundo,
  semAs5: semAs5Fundo,
  pesos: fundoInteira.pesos.map((p) => ({ t: p.t, pesos: p.pesos.map((w) => Math.round(w * 1e4) / 1e4) })),
  curva: [
    { t: fundoInteira.datas[0] - DIA, patrimonio: CAPITAL_ROBO },
    ...fundoInteira.r.reduce<{ t: number; patrimonio: number }[]>((acc, x, k) => {
      const antes = acc.length > 0 ? acc[acc.length - 1].patrimonio : CAPITAL_ROBO;
      acc.push({ t: fundoInteira.datas[k], patrimonio: antes * (1 + x) });
      return acc;
    }, []),
  ].map((p) => ({ t: p.t, patrimonio: Math.round(p.patrimonio * 100) / 100 })),
  transferencias: { rebalanceamentos: fundoInteira.pesos.length, semCaixa: limitados, maiorFracaoDoCaixa: maiorFracao },
  alavancado,
};

// A FICHA DE RISCO de cada robô, do fundo e do BTC, na janela inteira.
console.log("\n== a ficha de risco (janela inteira, curva diária; entre colchetes, o intervalo de 95% do bootstrap)");
const fichas: FichaMedida[] = [];
const seriesDiarias = new Map<string, { datas: number[]; r: number[] }>();
for (const robo of ROBOS) {
  const e = estados.get(robo.id)!.janelas[0];
  const d = retornosDe(e);
  seriesDiarias.set(robo.id, d);
  fichas.push(fichaMedida(robo.id, d.r, d.datas, e));
}
seriesDiarias.set("fundo", { datas: fundoInteira.datas, r: fundoInteira.r });
fichas.push(fichaMedida("fundo", fundoInteira.r, fundoInteira.datas));
{
  const datas = seriesDiarias.get(MOMENTO.id)!.datas;
  const r = retornoBTC(datas);
  seriesDiarias.set("btc", { datas, r });
  fichas.push(fichaMedida("btc", r, datas));
}
for (const f of fichas) {
  const x = f.ficha;
  const iv = f.intervalo!;
  console.log(
    `${f.id.padEnd(13)} CAGR ${pct(x.cagr).padStart(8)} [${pct(iv.cagr[0])} a ${pct(iv.cagr[2])}]  vol ${pct(x.volAnual).replace("+", "")}  ` +
      `Sharpe ${f2(x.sharpe)} [${f2(iv.sharpe[0])} a ${f2(iv.sharpe[2])}]  Sortino ${f2(x.sortino)}  Calmar ${f2(x.calmar)}  ` +
      `queda ${pct(x.quedaMaxima)} [${pct(iv.queda[0])} a ${pct(iv.queda[2])}], ${x.maiorTempoSubmerso} d debaixo do pico  ` +
      `VaR95 ${pct(x.var95).replace("+", "")} CVaR95 ${pct(x.cvar95).replace("+", "")}  assim. ${f2(x.assimetria)} curtose ${f2(x.curtose)}  ` +
      `meses positivos ${pct(x.mesesPositivos).replace("+", "")}` +
      (x.beta !== undefined ? `  beta ${f2(x.beta)} corr ${f2(x.correlacao ?? NaN)} alfa ${pct(x.alfaAnual ?? NaN)}` : "") +
      `  PSR ${(f.probabilistico ?? NaN).toFixed(4)}  trilha mínima ${Number.isFinite(f.trilhaMinimaDias ?? NaN) ? Math.ceil(f.trilhaMinimaDias as number) : "∞"} d`,
  );
  if (f.trades) {
    const t = f.trades;
    console.log(
      `${"".padEnd(13)} ${t.n} trades, ${pct(t.positivos).replace("+", "")} no positivo, ganho médio ${pct(t.ganhoMedio)} e perda média ${pct(t.perdaMedia)} do nocional, ` +
        `fator de lucro ${f2(t.fatorDeLucro)}, ${t.duracaoMediaDias.toFixed(1)} d por trade, giro de ${t.giroAnual.toFixed(0)}x o patrimônio ao ano`,
    );
  }
}
const idsCorrelacao = [...ROBOS.map((r) => r.id), "fundo", "btc"];
const matrizCorrelacao = idsCorrelacao.map((a) => idsCorrelacao.map((b) => Math.round(correlacao(seriesDiarias.get(a)!.r, seriesDiarias.get(b)!.r) * 1000) / 1000));
console.log("correlações diárias: " + idsCorrelacao.map((a, i) => `${a} [${matrizCorrelacao[i].map((x) => x.toFixed(2)).join(" ")}]`).join(" · "));
// Os piores dias do BTC na janela, e o que cada um fez neles.
const datasBase = seriesDiarias.get("btc")!.datas;
const piores = datasBase.map((t, k) => ({ t, k })).sort((a, b) => seriesDiarias.get("btc")!.r[a.k] - seriesDiarias.get("btc")!.r[b.k]).slice(0, 6);
const estresse = piores.map(({ t, k }) => ({
  dia: t - DIA,
  retornos: Object.fromEntries(idsCorrelacao.map((id) => [id, Math.round(seriesDiarias.get(id)!.r[k] * 1e4) / 1e4])),
}));
console.log("os piores dias do BTC: " + estresse.map((x) => `${new Date(x.dia).toISOString().slice(0, 10)} BTC ${pct(x.retornos.btc)} Momento ${pct(x.retornos.momento)} Fluxo ${pct(x.retornos.fluxo)} fundo ${pct(x.retornos.fundo)}`).join(" · "));

// O SOBREAJUSTE: cada livro na grade dele.
const validacao: ValidacaoLivro[] = [];
/** A série do walk-forward de 365 dias de cada livro: o fundo em tempo real sai delas. */
const emTempoReal = new Map<string, { datas: number[]; r: number[] }>();
for (const { livro, variantes } of GRADES) {
  console.log(`\n== o sobreajuste do ${livro.nome}: ${variantes.length} variações da grade`);
  const colunas: number[][] = [];
  let datasGrade: number[] = [];
  for (const [k, v] of variantes.entries()) {
    const d = retornosDe(simular(v, INICIO, FIM));
    colunas.push(d.r);
    datasGrade = d.datas;
    if ((k + 1) % 36 === 0) console.log(`  ${k + 1} de ${variantes.length}`);
  }
  const T = datasGrade.length;
  const matriz = Array.from({ length: T }, (_, t) => colunas.map((c) => c[t]));
  const diarios = colunas.map((c) => sharpeDiario(c));
  const publicada = variantes.findIndex((v) => JSON.stringify(v.regras) === JSON.stringify(livro.regras));
  if (publicada < 0) throw new Error(`a regra publicada do ${livro.nome} não está na grade`);
  const rPub = colunas[publicada];
  const desvioGrade = momentos(diarios).desvio;
  const varianciaUsada = Math.max(desvioGrade ** 2, varianciaDoSharpeNulo(T));
  const sharpes = diarios.map((x) => x * Math.sqrt(365));
  const ordem = [...sharpes].sort((a, b) => a - b);
  const posicao = ordem.length - ordem.indexOf(sharpes[publicada]);
  const deflacionado = [variantes.length, TENTATIVAS_DA_PESQUISA].map((n) => ({
    tentativas: n,
    regua: sharpeMaximoEsperado(n, varianciaUsada) * Math.sqrt(365),
    dsr: sharpeDeflacionado(rPub, n, varianciaUsada),
  }));
  const pbo = pboCSCV(matriz, 16);
  const wfs: ValidacaoLivro["walkForward"] = [];
  for (const treino of [365, null]) {
    const wf = walkForward(matriz, datasGrade, treino, 180);
    if (treino === 365) emTempoReal.set(livro.id, { datas: wf.datas, r: wf.r });
    const i0 = datasGrade.indexOf(wf.datas[0]);
    const composto = (xs: readonly number[]) => xs.reduce((a, x) => a * (1 + x), 1) - 1;
    const totais = colunas.map((c) => composto(c.slice(i0))).sort((a, b) => a - b);
    let trocas = 0;
    for (let q = 1; q < wf.escolhas.length; q++) if (wf.escolhas[q].variante !== wf.escolhas[q - 1].variante) trocas++;
    wfs.push({
      treinoDias: treino,
      de: wf.datas[0] - DIA,
      retorno: composto(wf.r),
      sharpe: sharpeDiario(wf.r) * Math.sqrt(365),
      retornoPublicada: composto(rPub.slice(i0)),
      sharpePublicada: sharpeDiario(rPub.slice(i0)) * Math.sqrt(365),
      retornoMediana: totais[Math.floor(totais.length / 2)],
      trocas,
      trimestres: wf.escolhas.length,
    });
  }
  const grade =
    livro.id === "momento"
      ? "janela da compra 30/45/60 dias × da venda 7/14/21 × saída por posto × pirâmide × alvo de volatilidade × vendida pela volatilidade"
      : "janela 5/7/10/14 dias × k 3/5/7 × prazo 7/14/21 dias × stop 30/45/60%";
  validacao.push({
    id: livro.id,
    grade,
    variantes: variantes.length,
    sharpes: ordem.map((x) => Math.round(x * 1000) / 1000),
    sharpePublicada: sharpes[publicada],
    posicaoDaPublicada: posicao,
    desvioDosSharpes: { grade: desvioGrade * Math.sqrt(365), nulo: Math.sqrt(varianciaDoSharpeNulo(T)) * Math.sqrt(365) },
    deflacionado,
    pbo,
    walkForward: wfs,
  });
  console.log(
    `Sharpe da grade: mínimo ${f2(ordem[0])}, mediana ${f2(quantil(ordem, 0.5))}, máximo ${f2(ordem[ordem.length - 1])} · a publicada ${f2(sharpes[publicada])}, ${posicao}ª de ${variantes.length}`,
  );
  console.log(
    `espalhamento dos Sharpes: ${f2(desvioGrade * Math.sqrt(365))} ao ano na grade, ${f2(Math.sqrt(varianciaDoSharpeNulo(T) * 365))} o do acaso em ${T} dias — a régua usa o maior`,
  );
  for (const d of deflacionado) console.log(`deflacionado com ${d.tentativas} tentativas: régua de Sharpe ${f2(d.regua)} ao ano, DSR ${d.dsr.toFixed(4)}`);
  console.log(
    `PBO ${pbo.pbo.toFixed(3)} em ${pbo.particoes} partições · a escolhida dentro faz Sharpe ${f2(pbo.sharpeForaDaEscolhida)} fora (mediana), perde fora em ${pct(pbo.perdaFora).replace("+", "")} · inclinação fora/dentro ${f2(pbo.inclinacao)}`,
  );
  for (const w of wfs) {
    console.log(
      `walk-forward (${w.treinoDias === null ? "passado inteiro" : `${w.treinoDias} dias`}) desde ${new Date(w.de).toISOString().slice(0, 10)}: ${pct(w.retorno)} (Sharpe ${f2(w.sharpe)}) ` +
        `contra a publicada ${pct(w.retornoPublicada)} (Sharpe ${f2(w.sharpePublicada)}) e a variação do meio ${pct(w.retornoMediana)} · ${w.trocas} troca(s) em ${w.trimestres} trimestres`,
    );
  }
}

// O FUNDO EM TEMPO REAL: os dois livros com a variação que o passado escolheria, juntos.
{
  const ms = emTempoReal.get(MOMENTO.id);
  const fl = emTempoReal.get(FLUXO.id);
  if (ms && fl && ms.datas.length === fl.datas.length && ms.datas[0] === fl.datas[0]) {
    const fr = paridadeDeRisco([ms.r, fl.r], ms.datas, JANELA_FUNDO, 20);
    const i0 = fundoInteira.datas.indexOf(ms.datas[0]);
    const linha = (id: string, r: number[]) => {
      const f = fichaDe(r, ms.datas);
      return { id, retorno: f.retorno, quedaMaxima: f.quedaMaxima, sharpe: f.sharpe };
    };
    fundo.tempoReal = {
      de: ms.datas[0] - DIA,
      linhas: [
        linha("momento", ms.r),
        linha("fluxo", fl.r),
        linha("fundo", fr.r),
        ...(i0 >= 0 ? [linha("fundo publicado", fundoInteira.r.slice(i0, i0 + ms.r.length))] : []),
      ],
    };
    console.log(
      `\n== o fundo em tempo real (cada livro com a variação que o walk-forward de 365 dias escolheria) desde ${new Date(ms.datas[0] - DIA).toISOString().slice(0, 10)}: ` +
        fundo.tempoReal.linhas.map((l) => `${l.id} ${pct(l.retorno)} (queda ${pct(l.quedaMaxima)}, Sharpe ${f2(l.sharpe)})`).join(" · "),
    );
  }
}

// A CAPACIDADE: o mesmo livro com mais dinheiro, o impacto pela raiz quadrada e as regras da corretora.
console.log("\n== a capacidade: o mesmo livro com mais dinheiro (impacto Y × σ × √(ordem ÷ volume de 7 dias))");
const capacidade: CapacidadeMedida[] = [];
for (const robo of COMPONENTES) {
  for (const y of [1, 0.5]) {
    const linhas: CapacidadeMedida["linhas"] = [];
    for (const capital of [1e3, 1e5, 1e6, 5e6, 2e7, 1e8]) {
      if (y !== 1 && (capital === 1e3 || capital === 1e8)) continue;
      const e = simular(robo, INICIO, FIM, undefined, undefined, undefined, true, { capital, y });
      const part: number[] = [];
      const imp: number[] = [];
      for (const t of e.fechadas) {
        const s = porSimbolo.get(t.symbol);
        const i = Math.round((t.abertaEm - INICIO_DADOS) / HORA);
        if (!s) continue;
        const adv = volumeMedio7(s, i);
        if (!(adv > 0)) continue;
        const x = t.nocional / (t.parcelas ?? 1) / adv;
        part.push(x);
        const vol = linhasDoDia(i, JANELA_VOLATILIDADE_DIAS, true).find((l) => l.symbol === t.symbol)?.vol;
        if (typeof vol === "number" && vol > 0) imp.push(y * vol * Math.sqrt(x));
      }
      const l = {
        capital,
        retorno: e.patrimonio / capital - 1,
        sharpe: sharpeDe(e.curva),
        quedaMaxima: e.quedaMaxima,
        participacao: quantil(part, 0.5),
        impacto: imp.length > 0 ? imp.reduce((a, b) => a + b, 0) / imp.length : NaN,
        recusadas: e.recusadas,
      };
      linhas.push(l);
      console.log(
        `${robo.nome.padEnd(8)} Y ${y}  US$ ${capital.toLocaleString("pt-BR").padStart(12)}  ${pct(l.retorno).padStart(10)}  Sharpe ${f2(l.sharpe)}  queda ${pct(l.quedaMaxima)}  ` +
          `ordem = ${(l.participacao * 100).toFixed(3)}% do volume diário (mediana), impacto médio ${(l.impacto * 100).toFixed(2)}% por lado · ${l.recusadas} recusadas`,
      );
    }
    capacidade.push({ id: robo.id, y, linhas });
  }
}

const quant: MedicaoQuant = {
  tentativasDaPesquisa: TENTATIVAS_DA_PESQUISA,
  fichas,
  correlacoes: { ids: idsCorrelacao, matriz: matrizCorrelacao },
  validacao,
  capacidade,
  fundo,
  estresse,
};

if (soSimbolos) {
  console.log("\n--simbolos: medição parcial, data/robos-medicao.json NÃO gravado");
} else {
  const m: Medicao = {
    geradoEm: Date.now(),
    universo: { moedas: series.length, deslistadas, de: INICIO, ate: FIM },
    robos: medidos,
    referencias,
    realismo: {
      escorregadaStop: ESCORREGADA_STOP,
      custoAtraso: CUSTO_ATRASO,
      nocionalMinimo: NOCIONAL_MINIMO,
      corretora: { em: corretora.em, robos: doRealismo },
    },
    quant,
  };
  await writeFile("data/robos-medicao.json", `${JSON.stringify(m)}\n`);
  console.log("\ndata/robos-medicao.json gravado");
}
