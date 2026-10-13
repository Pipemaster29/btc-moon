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
  OURO_TOKENIZADO,
  REGRAS_PADRAO,
  ROBOS,
  casarComPerpetuos,
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
  type LadoRobo,
  type Perna,
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

// ------------------------------------------------------------------ as grandes

/**
 * O UNIVERSO DAS GRANDES (`RegrasRobo.capMinima`): quantas unidades de cada
 * perpétuo circulam, do retrato semanal da CoinMarketCap
 * (`scripts/baixar-grandes.mts`). O market cap de cada decisão é essa
 * quantidade vezes o fechamento do perpétuo na véspera — o número que o ao
 * vivo lê na hora —, com a quantidade do último retrato FECHADO antes da
 * decisão: o de um domingo é o fechamento dele, 23:59 UTC, e só vale da
 * meia-noite seguinte em diante.
 *
 * CASADO PELO PREÇO A CADA RETRATO (a armadilha nº 1): o símbolo da
 * CoinMarketCap vira `XUSDT`, `1000XUSDT` ou `1000000XUSDT`, e só vale se o
 * fechamento do perpétuo naquela hora estiver entre 0,8 e 1,25 do preço do
 * retrato vezes o multiplicador. Conferido em 13/10 sobre os 150 domingos:
 * 4.976 de 6.768 moeda-semanas acima de US$ 2 bi casaram; as outras não têm
 * perpétuo na Binance (LEO, CRO, OKB, MNT, os embrulhados e os de staking,
 * PI) ou não o tinham naquela semana (HYPE até 05/2025, TAO até 04/2024, TON
 * até 08/2024), e a RAY da Binance, a 3,5% do preço da Raydium, é outra moeda.
 *
 * Fora: as stablecoins (a etiqueta da CoinMarketCap) e o ouro tokenizado —
 * como as ações e os metais lá em cima, não é moeda.
 *
 * Um retrato vale por 8 dias: moeda que saiu das 300 primeiras, ou semana que
 * não baixou, vira "sem leitura" — e sem leitura a moeda fica fora do
 * universo, não dentro.
 */
const VALIDADE_DO_RETRATO = 8 * DIA;
/** Por perpétuo, em ordem: desde quando vale (a meia-noite seguinte ao retrato) e quantas unidades DO PERPÉTUO circulam. */
const unidadesDe = new Map<string, { desde: number; unidades: number }[]>();
const usaGrandes = ROBOS.some((r) => r.regras.capMinima !== undefined) || args.includes("--grandes");
if (usaGrandes) {
  const { baixarGrandes, CACHE_GRANDES } = await import("./baixar-grandes.mjs");
  const { readdir } = await import("node:fs/promises");
  const { falhas } = await baixarGrandes();
  if (falhas > 0) console.log(`ATENÇÃO: ${falhas} retrato(s) da CoinMarketCap não baixaram — as semanas deles ficam sem universo`);
  const doSimbolo = new Map(series.map((s) => [s.symbol, s]));
  let casadas = 0;
  let grandes = 0;
  for (const arq of (await readdir(CACHE_GRANDES)).filter((a) => a.endsWith(".json")).sort()) {
    const desde = Date.parse(`${arq.slice(0, 10)}T00:00:00Z`) + DIA;
    // O fechamento do domingo é o da vela das 23 h: índice da hora anterior à meia-noite seguinte.
    const i = Math.floor((desde - INICIO_DADOS) / HORA) - 1;
    if (i < 0 || i >= T) continue;
    const lista = JSON.parse(await readFile(`${CACHE_GRANDES}/${arq}`, "utf8")) as import("./baixar-grandes.mjs").MoedaDoRetrato[];
    // O mesmo casamento do ao vivo (`casarComPerpetuos`), com o fechamento do domingo no lugar do preço de agora.
    const daSemana = casarComPerpetuos(lista, (symbol) => doSimbolo.get(symbol)?.c[i]);
    grandes += lista.filter((m) => !m.estavel && !OURO_TOKENIZADO.has(m.symbol.toUpperCase()) && m.marketCap >= 2e9).length;
    for (const [symbol, { unidades, marketCap }] of daSemana) {
      if (marketCap >= 2e9) casadas++;
      const xs = unidadesDe.get(symbol) ?? [];
      xs.push({ desde, unidades });
      unidadesDe.set(symbol, xs);
    }
  }
  console.log(`universo das grandes: ${unidadesDe.size} perpétuos com market cap lido; ${casadas} de ${grandes} moeda-semanas acima de US$ 2 bi casaram com um perpétuo pelo preço`);
}

/** O market cap de um perpétuo na decisão do instante `t`, ao preço `preco` do perpétuo; nulo sem retrato válido. */
function marketCapEm(symbol: string, t: number, preco: number): number | null {
  const xs = unidadesDe.get(symbol);
  if (!xs) return null;
  let lo = 0;
  let hi = xs.length - 1;
  let k = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (xs[m].desde <= t) {
      k = m;
      lo = m + 1;
    } else hi = m - 1;
  }
  if (k < 0 || t - xs[k].desde > VALIDADE_DO_RETRATO) return null;
  return xs[k].unidades * preco;
}

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
      // Só quando algum robô lê: a linha sem o campo é a mesma de antes para os outros.
      ...(usaGrandes ? { marketCap: marketCapEm(s.symbol, INICIO_DADOS + i * HORA, c) } : {}),
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
/** As janelas que a exploração das grandes (`estudarGrandes`) lê e nenhum robô publicado lê. */
const JANELAS_DAS_GRANDES = args.includes("--grandes") ? [3, 7, 14, 30, 45, 60, 90, 120] : [];
const JANELAS_TODAS = [
  ...new Set([...todosOsRobos.flatMap((r) => r.regras.pernas.flatMap((p) => [p.janelaDias, ...(p.saidaPosto ? [p.janelaDias] : [])])), ...JANELAS_DAS_GRANDES]),
].sort((a, b) => a - b);
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
/** A que `simular` chama: `linhasDoDia`, ou ela com o open interest junto no estudo `--oi`. */
let linhasComOI = linhasDoDia;

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
  /** O custo do atraso da entrada, em fração do nocional; o padrão é `CUSTO_ATRASO`. Só o ataque o muda. */
  custoAtraso?: number;
  /** A escorregada do stop (`EstadoRobo.escorregada`); o padrão é `ESCORREGADA_STOP`. Só o ataque a muda. */
  escorregada?: number;
}

/** O que uma hora de um robô precisa saber além do estado dele. */
interface Contexto {
  janelaVol: number;
  comCorretora: boolean;
  excluir?: Set<string>;
  /** O símbolo do hedge fica no ranking mesmo no "sem as 5": é dele que sai o preço do par. */
  hedges: Set<string>;
  extra: Extra;
}

const vela = (s: Serie, i: number, t: number) => ({ t, o: s.o[i], h: s.h[i], l: s.l[i], c: s.c[i] });
const cobrancaDe = (s: Serie, i: number, t: number) => (Number.isNaN(s.fr[i]) ? [] : [{ t, taxa: s.fr[i] }]);

/**
 * UMA HORA de um robô: na abertura da vela da meia-noite, a decisão do dia com
 * o fechamento da anterior — a entrada na abertura dela, PAGANDO o custo medido
 * do atraso (`CUSTO_ATRASO`), porque o ao vivo entra no primeiro retrato depois
 * da meia-noite e não nela —; depois, a vela de cada posição aberta, com o stop
 * escorregando como medido no minuto do disparo (`ESCORREGADA_STOP`, dentro de
 * `percorrer`); e a marcação no fechamento.
 */
function umaHora(e: EstadoRobo, i: number, ctx: Contexto): void {
  const t = INICIO_DADOS + i * HORA;
  if (t % DIA === 0) {
    let linhas = linhasComOI(i, ctx.janelaVol, ctx.comCorretora).filter((l) => !ctx.excluir?.has(l.symbol) || ctx.hedges.has(l.symbol));
    if (ctx.extra.y) {
      // O desvio de quem não tem 45 dias de série é o do meio do dia: moeda nova não sai de graça.
      const vols = linhas.map((l) => l.vol).filter((v): v is number => typeof v === "number" && v > 0);
      const meio = vols.length > 0 ? quantil(vols, 0.5) : NaN;
      const y = ctx.extra.y;
      linhas = linhas.map((l) => {
        const s = porSimbolo.get(l.symbol)!;
        const v = volumeMedio7(s, i);
        return { ...l, impacto: coeficienteDeImpacto(y, typeof l.vol === "number" && l.vol > 0 ? l.vol : meio, Number.isFinite(v) && v > 0 ? v : l.volume) };
      });
    }
    decidir(e, linhas, (symbol) => porSimbolo.get(symbol)?.o[i], t, painel ?? undefined, ctx.extra.custoAtraso ?? CUSTO_ATRASO);
  }
  for (const p of [...e.abertas]) {
    const s = porSimbolo.get(p.symbol)!;
    const sh = p.hedge ? porSimbolo.get(p.hedge.symbol) : undefined;
    const hedge = sh ? { velas: [vela(sh, i, t)], cobrancas: cobrancaDe(sh, i, t) } : undefined;
    const saida = percorrer(p, [vela(s, i, t)], cobrancaDe(s, i, t), e, hedge);
    if (saida) fechar(e, p, saida);
  }
  marcar(e, t + HORA);
  if (ctx.extra.viradas && (t + HORA) % DIA === 0) ctx.extra.viradas.push({ t: t + HORA, caixa: e.caixa, patrimonio: e.patrimonio });
}

/** As horas (índices) de `de` a `ate`, cortadas no fim dos dados. */
const horasDe = (de: number, ate: number): [number, number] => [Math.floor((de - INICIO_DADOS) / HORA), Math.min(fim, Math.floor((ate - INICIO_DADOS) / HORA))];
const hedgesDe = (r: Robo) => new Set(r.regras.pernas.flatMap((p) => (p.hedge ? [p.hedge.symbol] : [])));

/** Roda um robô de `de` a `ate` (milissegundos), do zero, hora a hora (`umaHora`). */
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
  if (extra.escorregada !== undefined) e.escorregada = extra.escorregada;
  const ctx: Contexto = { janelaVol, comCorretora, excluir, hedges: hedgesDe(r), extra };
  const [i0, i1] = horasDe(de, ate);
  for (let i = i0; i <= i1; i++) umaHora(e, i, ctx);
  return e;
}

/**
 * O FUNDO HORA A HORA: as subcontas lado a lado, cada uma com o seu robô, e o
 * patrimônio do fundo como a soma das cotas de cada uma vezes o patrimônio dela
 * — o mesmo fundo da mesa de risco (`paridadeDeRisco`: inverso do desvio de 90
 * dias de cada livro, refeito no primeiro dia de cada mês, só com o caixa
 * livre), mas simulado junto, para que uma regra do FUNDO possa mexer nos robôs
 * antes da decisão de cada dia.
 *
 * Com `alvo`, a regra é o alvo de volatilidade do fundo inteiro (rodada 2 do
 * loop, `docs/preregistro-alvo-fundo.md`): a cada meia-noite, o tamanho base dos
 * dois livros é multiplicado por alvo ÷ (desvio dos retornos diários do fundo
 * nos `janelaDias` dias anteriores × √365), entre os limites; com menos de 20
 * dias de curva, 1. O alvo próprio do Momento continua valendo dentro dele.
 */
function simularFundo(
  robos: Robo[],
  de: number,
  ate: number,
  opcoes: { alvo?: { anual: number; janelaDias: number; minimo: number; maximo: number }; excluir?: (Set<string> | undefined)[] } = {},
): { curva: { t: number; patrimonio: number }[]; estados: EstadoRobo[]; escalas: number[] } {
  const estados = robos.map((r) => novoEstado({ ...r, regras: { ...r.regras } }, de));
  const bases = robos.map((r) => r.regras.tamanho);
  const ctxs: Contexto[] = robos.map((r, j) => ({ janelaVol: JANELA_VOLATILIDADE_DIAS, comCorretora: true, excluir: opcoes.excluir?.[j], hedges: hedgesDe(r), extra: {} }));
  const n = robos.length;
  let cotas = robos.map(() => 1 / n);
  const doFundo: number[] = [];
  const dosLivros: number[][] = robos.map(() => []);
  const curva: { t: number; patrimonio: number }[] = [{ t: de, patrimonio: CAPITAL_ROBO }];
  const escalas: number[] = [];
  const desvio = (vals: readonly number[], janela: number): number => {
    const rs: number[] = [];
    for (let k = Math.max(1, vals.length - janela); k < vals.length; k++) if (vals[k - 1] > 0) rs.push(vals.at(k)! / vals.at(k - 1)! - 1);
    return rs.length >= 20 ? momentos(rs).desvio : NaN;
  };
  let mes = -1;
  const [i0, i1] = horasDe(de, ate);
  for (let i = i0; i <= i1; i++) {
    const t = INICIO_DADOS + i * HORA;
    if (t % DIA === 0) {
      const vs = estados.map((e) => e.patrimonio);
      const fundo = cotas.reduce((a, q, j) => a + q * vs[j], 0);
      doFundo.push(fundo);
      vs.forEach((v, j) => dosLivros[j].push(v));
      const d = new Date(t);
      const m = d.getUTCFullYear() * 12 + d.getUTCMonth();
      if (m !== mes) {
        mes = m;
        // Os pesos do mês: o inverso do desvio de 90 dias de cada livro (iguais sem 20 dias de passado).
        const desvios = dosLivros.map((vals) => desvio(vals, 90));
        const brutos = desvios.every((x) => x > 0) ? desvios.map((x) => 1 / x) : desvios.map(() => 1);
        const soma = brutos.reduce((a, b) => a + b, 0);
        const pesos = brutos.map((b) => b / soma);
        // Só o caixa livre sai de uma subconta; o que veio vai para quem faltava, na proporção.
        const valores = cotas.map((q, j) => q * vs[j]);
        const quer = valores.map((v, j) => v - pesos[j] * fundo);
        const pode = quer.map((q, j) => (q > 0 ? Math.min(q, valores[j] * Math.min(1, Math.max(0, estados[j].caixa / Math.max(1e-9, estados[j].patrimonio)))) : 0));
        const veio = pode.reduce((a, b) => a + b, 0);
        const faltava = quer.reduce((a, q) => a + (q < 0 ? -q : 0), 0);
        const novos = valores.map((v, j) => (quer[j] > 0 ? v - pode[j] : faltava > 0 ? v + (-quer[j] * veio) / faltava : v));
        cotas = novos.map((v, j) => v / vs[j]);
      }
      // O alvo do fundo: a escala do dia, lida só do passado do próprio fundo.
      let escala = 1;
      if (opcoes.alvo) {
        const a = opcoes.alvo;
        const sd = desvio(doFundo, a.janelaDias);
        if (sd > 0) escala = Math.min(a.maximo, Math.max(a.minimo, a.anual / (sd * Math.sqrt(365))));
      }
      escalas.push(escala);
      estados.forEach((e, j) => (e.regras = { ...e.regras, tamanho: bases[j] * escala }));
    }
    estados.forEach((e, j) => umaHora(e, i, ctxs[j]));
    curva.push({ t: t + HORA, patrimonio: cotas.reduce((a, q, j) => a + q * estados[j].patrimonio, 0) });
  }
  return { curva, estados, escalas };
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

if (args.includes("--oi") || args.includes("--oi-invertido")) {
  await estudarOI(args.includes("--oi-invertido"));
  process.exit(0);
}
if (args.includes("--tamanho")) {
  estudarTamanho();
  process.exit(0);
}
if (args.includes("--alvo-fundo")) {
  estudarAlvoFundo();
  process.exit(0);
}
if (args.includes("--piramide")) {
  await estudarPiramide();
  process.exit(0);
}
if (args.includes("--placebo")) {
  estudarPlacebo();
  process.exit(0);
}
if (args.includes("--reentrada")) {
  estudarReentrada();
  process.exit(0);
}
if (args.includes("--grandes")) {
  estudarGrandes();
  process.exit(0);
}

/**
 * O ROBÔ DAS GRANDES (13/10, o pedido: "um bot usando só moeda grande, de US$
 * 2 bi para cima — as regras você define e vai testando, mas realista"). A
 * EXPLORAÇÃO, só no DESENHO (08/01/2024 a 31/03/2026): a reserva de 04–09/2026
 * fica fechada até a regra escolhida estar escrita em
 * `docs/preregistro-grandes.md`. Toda variação rodada aqui soma tentativas.
 *
 * O universo é o de CADA DIA (`marketCapEm`): as moedas que valiam US$ 2 bi ou
 * mais naquela meia-noite, com perpétuo, US$ 20 milhões de volume e 14 dias de
 * série. As referências ao lado são o BTC comprado e parado e a cesta das
 * grandes em pesos iguais, refeita todo dia e sem custo — o que um índice das
 * grandes teria feito.
 *
 * As famílias, com o mesmo motor, custo e regras da corretora dos outros
 * robôs, a 10% do patrimônio por posição:
 *
 *   controle     o Momento publicado, só nas grandes;
 *   tendência    compra as 3 que mais subiram em N dias, SE subiram, e vende
 *                as 3 que mais caíram, SE caíram (`Perna.minimo` = 0) — no
 *                mercado que só cai, fica vendido; no que só sobe, comprado —,
 *                com saída quando deixam as 6 primeiras e o tamanho pela
 *                volatilidade de cada moeda (o BTC, menos agitado, entra maior);
 *   só comprada  a perna comprada da tendência, sozinha: em dia sem ninguém
 *                subindo, fica em caixa;
 *   momento      a tendência sem o limiar: compra as 3 do topo e vende as 3
 *                do fundo mesmo que todas subam ou todas caiam;
 *   reversão     o contrário (`Perna.inverso`): compra as que mais caíram e
 *                vende as que mais subiram, por até 7 dias.
 */
function estudarGrandes(): void {
  const FIM_DESENHO = Date.parse("2026-04-01T00:00:00Z");
  const desenho: [string, number, number][] = [
    ["desenho", INICIO, FIM_DESENHO],
    ["1ª metade", INICIO, CORTE],
    ["2ª metade", CORTE, FIM_DESENHO],
  ];
  const aoMes = (ret: number, de: number, ate: number) => (1 + ret) ** (30.4375 / ((ate - de) / DIA)) - 1;
  const quedaDe = (curva: readonly { t: number; patrimonio: number }[]) => {
    let pico = 0;
    let q = 0;
    for (const p of curva) {
      if (p.patrimonio > pico) pico = p.patrimonio;
      if (pico > 0) q = Math.min(q, p.patrimonio / pico - 1);
    }
    return q;
  };
  type Medida = { ret: number; mes: number; queda: number; sharpe: number };
  const medida = (curva: { t: number; patrimonio: number }[], de: number, ate: number): Medida => {
    const ret = curva[curva.length - 1].patrimonio / curva[0].patrimonio - 1;
    return { ret, mes: aoMes(ret, de, ate), queda: quedaDe(curva), sharpe: sharpeDe(curva) };
  };
  const fmt = (m: Medida) => `${pct(m.ret).padStart(8)} (${pct(m.mes)}/mês, queda ${pct(m.queda)}, Sharpe ${m.sharpe.toFixed(2)})`;
  const CAP = 2e9;
  const eGrande = (l: LinhaRanking) => typeof l.marketCap === "number" && l.marketCap >= CAP && l.volume >= 20e6;

  // O universo, trimestre a trimestre: quantas grandes operáveis havia em média
  // por dia, e em quantos dias o ranking de 60 dias (14 dias de idade e a série
  // cobrindo a janela) ficou abaixo das 20 moedas com que a saída por posto
  // aceita ler (`MINIMO_NO_RANKING`).
  console.log("\n== O UNIVERSO: grandes com perpétuo e US$ 20 mi de volume, média por dia");
  const porTrimestre = new Map<string, { dias: number; soma: number; nomes: Set<string>; abaixoDe20: number }>();
  const [d0, d1] = horasDe(INICIO, FIM);
  // O menor número de grandes casadas num dia, sem a régua de volume: é a conta que o ao vivo faz
  // para desconfiar da lista (`lerGrandes` em `scripts/robos.mts`).
  let menorCasadas = Infinity;
  for (let i = d0; i <= d1; i++) {
    const t = INICIO_DADOS + i * HORA;
    if (t % DIA !== 0) continue;
    const todas = linhasDoDia(i, JANELA_VOLATILIDADE_DIAS, true);
    menorCasadas = Math.min(menorCasadas, todas.filter((l) => typeof l.marketCap === "number" && l.marketCap >= CAP).length);
    const g = todas.filter(eGrande);
    const no60 = g.filter((l) => typeof l.retorno[60] === "number" && (l.idadeDias === null || l.idadeDias >= 14)).length;
    const d = new Date(t);
    const q = `${d.getUTCFullYear()}T${Math.floor(d.getUTCMonth() / 3) + 1}`;
    const x = porTrimestre.get(q) ?? { dias: 0, soma: 0, nomes: new Set<string>(), abaixoDe20: 0 };
    x.dias++;
    x.soma += g.length;
    if (no60 < 20) x.abaixoDe20++;
    for (const l of g) x.nomes.add(l.symbol.replace(/USDT$/, ""));
    porTrimestre.set(q, x);
  }
  for (const [q, x] of porTrimestre) {
    console.log(`${q}: ${(x.soma / x.dias).toFixed(1)} por dia, ${x.nomes.size} no trimestre · ${x.abaixoDe20} de ${x.dias} dias com menos de 20 no ranking de 60 dias`);
  }
  console.log(`o dia com menos grandes casadas (sem a régua de volume) teve ${menorCasadas}`);

  // As referências: o BTC parado e a cesta das grandes em pesos iguais, marcadas de hora em hora.
  const referencias = (de: number, ate: number) => {
    const [i0, i1] = horasDe(de, ate);
    const btc = porSimbolo.get("BTCUSDT")!;
    const base = btc.c[i0 - 1];
    const curvaBTC: { t: number; patrimonio: number }[] = [];
    const curvaCesta: { t: number; patrimonio: number }[] = [];
    let valor = CAPITAL_ROBO;
    let cesta: { s: Serie; abertura: number }[] = [];
    let valorNaVirada = CAPITAL_ROBO;
    for (let i = i0; i <= i1; i++) {
      const t = INICIO_DADOS + i * HORA;
      if (t % DIA === 0) {
        valorNaVirada = valor;
        cesta = linhasDoDia(i, JANELA_VOLATILIDADE_DIAS, true)
          .filter(eGrande)
          .map((l) => ({ s: porSimbolo.get(l.symbol)!, abertura: porSimbolo.get(l.symbol)!.c[i - 1] }))
          .filter((x) => x.abertura > 0);
      }
      const rs = cesta.map((x) => x.s.c[i] / x.abertura).filter((r) => Number.isFinite(r) && r > 0);
      if (rs.length > 0) valor = valorNaVirada * (rs.reduce((a, b) => a + b, 0) / rs.length);
      curvaCesta.push({ t: t + HORA, patrimonio: valor });
      const c = btc.c[i];
      if (c > 0) curvaBTC.push({ t: t + HORA, patrimonio: (CAPITAL_ROBO * c) / base });
    }
    return { btc: [{ t: de, patrimonio: CAPITAL_ROBO }, ...curvaBTC], cesta: [{ t: de, patrimonio: CAPITAL_ROBO }, ...curvaCesta] };
  };
  console.log("\n== AS REFERÊNCIAS, sem custo e sem alavancagem");
  const refs = desenho.map(([, de, ate]) => referencias(de, ate));
  console.log(`${"BTC comprado e parado".padEnd(34)} ` + refs.map((r, k) => `${desenho[k][0]} ${fmt(medida(r.btc, desenho[k][1], desenho[k][2]))}`).join(" · "));
  console.log(`${"cesta das grandes, pesos iguais".padEnd(34)} ` + refs.map((r, k) => `${desenho[k][0]} ${fmt(medida(r.cesta, desenho[k][1], desenho[k][2]))}`).join(" · "));

  // As variações.
  const UNIVERSO_GRANDES = { volumeMinimo: 20e6, idadeMinimaDias: 14, capMinima: CAP };
  const porVol = { minimo: 0.25, maximo: 2 };
  const comprada = (janelaDias: number, extra: Partial<Perna> = {}): Perna => ({
    lado: "long", janelaDias, k: 3, stop: 0.2, rastro: null, prazoH: 90 * 24, alavancagem: 3, ...extra,
  });
  const vendida = (janelaDias: number, extra: Partial<Perna> = {}): Perna => ({
    lado: "short", janelaDias, k: 3, stop: 0.2, rastro: null, prazoH: 90 * 24, alavancagem: 2, ...extra,
  });
  const robo = (id: string, pernas: Perna[], tamanho = 0.1): Robo => ({
    id: `grandes·${id}`,
    nome: "Grandes",
    descricao: id,
    regras: { tamanho, ...UNIVERSO_GRANDES, pernas },
  });
  const variantes: [string, Robo][] = [["controle: o Momento publicado", { ...MOMENTO, id: "grandes·momento", regras: { ...MOMENTO.regras, capMinima: CAP } }]];
  for (const N of [14, 30, 60]) {
    for (const rastro of [null, 0.2]) {
      const t: Partial<Perna> = { minimo: 0, saidaPosto: 6, porVolatilidade: porVol, rastro };
      const r = rastro ? ", rastro 20%" : "";
      variantes.push([`tendência L/S ${N} d${r}`, robo(`tendencia${N}${r}`, [comprada(N, t), vendida(N, t)])]);
      variantes.push([`tendência só comprada ${N} d${r}`, robo(`so-comprada${N}${r}`, [comprada(N, t)])]);
    }
    const m: Partial<Perna> = { saidaPosto: 6, porVolatilidade: porVol };
    variantes.push([`momento L/S ${N} d, sem limiar`, robo(`momento${N}`, [comprada(N, m), vendida(N, m)])]);
  }
  for (const N of [3, 7, 14]) {
    const r: Partial<Perna> = { inverso: true, saidaPosto: 6, prazoH: 7 * 24, stop: 0.15, porVolatilidade: porVol };
    variantes.push([`reversão L/S ${N} d`, robo(`reversao${N}`, [comprada(N, r), vendida(N, r)])]);
  }
  // RODADA 2, escrita depois de ler a 1ª: a tendência melhorou com a janela (14
  // dias −1%, 30 −3%, 60 +26%), e o lucro veio da vendida — as altcoins grandes
  // sangraram contra o BTC. O platô da janela (45, 90 e 120 ao lado dos 60), cinco
  // moedas por perna em vez de três, e a vendida da tendência em PAR com ETH
  // comprado do mesmo tamanho (o desenho do Fluxo: aposta que a fraca vai pior
  // que o ETH, não que o mercado cai). ETH e não BTC: o BTC pede US$ 100 por
  // ordem, e a 10% de uma conta de US$ 1.000 o lote de 0,001 BTC só passa disso
  // com o BTC acima de US$ 100 mil.
  const t3: Partial<Perna> = { minimo: 0, saidaPosto: 6, porVolatilidade: porVol };
  for (const N of [45, 90, 120]) variantes.push([`tendência L/S ${N} d`, robo(`tendencia${N}`, [comprada(N, t3), vendida(N, t3)])]);
  const t5: Partial<Perna> = { minimo: 0, k: 5, saidaPosto: 10, porVolatilidade: porVol };
  for (const N of [45, 60, 90]) variantes.push([`tendência L/S ${N} d, 5 por perna`, robo(`tendencia${N}-k5`, [comprada(N, t5), vendida(N, t5)])]);
  for (const N of [60, 90]) {
    // O par não leva o tamanho pela volatilidade: o hedge tem o nocional da perna, e o Fluxo mediu que a regra piora o par.
    const par: Partial<Perna> = { minimo: 0, saidaPosto: 6, hedge: { symbol: "ETHUSDT", alavancagem: 2 } };
    variantes.push([`vendida da tendência ${N} d, par com ETH`, robo(`par${N}`, [vendida(N, par)])]);
  }
  // RODADA 4, a última, depois da bancada (a tendência POR MOEDA também não tem
  // o que pegar: −10% a +12% nas janelas de 14 a 90 dias): o alvo de
  // volatilidade do PATRIMÔNIO, a correção conhecida do momento e a peça que
  // mais melhorou o Momento, com os valores dele (60% ao ano, 40 dias) — sem
  // ajuste aqui —, nas duas candidatas, 45 e 60 dias.
  for (const N of [45, 60]) {
    const r = robo(`tendencia${N}-alvo`, [comprada(N, t3), vendida(N, t3)]);
    variantes.push([`tendência L/S ${N} d, alvo de volatilidade`, { ...r, regras: { ...r.regras, alvoVolatilidade: MOMENTO.regras.alvoVolatilidade } }]);
  }

  // RODADA 3, A BANCADA (só para decidir se vale a regra no motor): a tendência
  // POR MOEDA, como a dos fundos de tendência — cada grande do dia comprada se
  // o retorno de N dias é positivo e vendida se é negativo, o peso pelo inverso
  // do desvio de 45 dias, a soma dos pesos em módulo igual a 1 (sem
  // alavancagem), refeita toda meia-noite e cobrando 0,2% por lado sobre o que
  // girou (a régua do motor, 0,10%, mais o atraso, 0,10%). Contas diárias, sem
  // stop, sem regra da corretora: não é o robô, é a pergunta "há o que pegar?".
  if (args.includes("--bancada")) {
    console.log("\n== BANCADA: a tendência por moeda nas grandes, pesos pelo inverso do desvio, refeita todo dia");
    const fechamento = (s: Serie, i: number) => s.c[i - 1];
    for (const N of [14, 30, 60, 90]) {
      for (const lados of ["os dois lados", "só comprada", "só o BTC"] as const) {
        const porJanela = desenho.map(([, de, ate]) => {
          const [i0, i1] = horasDe(de, ate);
          let pesos = new Map<string, number>();
          let valor = CAPITAL_ROBO;
          const curva: { t: number; patrimonio: number }[] = [{ t: de, patrimonio: valor }];
          for (let i = i0; i <= i1; i++) {
            const t = INICIO_DADOS + i * HORA;
            if (t % DIA !== 0) continue;
            // O dia que passou rende com os pesos da véspera.
            let r = 0;
            for (const [symbol, w] of pesos) {
              const s = porSimbolo.get(symbol)!;
              const a = fechamento(s, i - 24);
              const b = fechamento(s, i);
              if (a > 0 && b > 0) r += w * (b / a - 1);
            }
            // Os pesos novos, com o que se sabia na meia-noite.
            const linhas = linhasDoDia(i, JANELA_VOLATILIDADE_DIAS, true).filter(
              (l) => eGrande(l) && typeof l.retorno[N] === "number" && typeof l.vol === "number" && l.vol > 0 && (l.idadeDias === null || l.idadeDias >= 14),
            );
            const escolhidas = linhas.filter((l) => (lados === "só o BTC" ? l.symbol === "BTCUSDT" : lados === "só comprada" ? (l.retorno[N] as number) > 0 : true));
            const brutos = new Map(escolhidas.map((l) => [l.symbol, Math.sign(l.retorno[N] as number) / (l.vol as number)]));
            const soma = [...brutos.values()].reduce((a, w) => a + Math.abs(w), 0);
            // Só comprada: o peso total é o das que sobem entre todas as grandes — sem nenhuma subindo, caixa.
            const total = lados === "só comprada" ? [...brutos.values()].reduce((a, w) => a + Math.abs(w), 0) / Math.max(1e-12, linhas.reduce((a, l) => a + 1 / (l.vol as number), 0)) : 1;
            const novos = new Map([...brutos].map(([s, w]) => [s, soma > 0 ? (w / soma) * total : 0]));
            let giro = 0;
            for (const s of new Set([...pesos.keys(), ...novos.keys()])) giro += Math.abs((novos.get(s) ?? 0) - (pesos.get(s) ?? 0));
            valor *= 1 + r - 0.002 * giro;
            pesos = novos;
            curva.push({ t, patrimonio: valor });
          }
          return curva;
        });
        console.log(`${`${N} d, ${lados}`.padEnd(24)} ` + porJanela.map((c, k) => `${desenho[k][0]} ${fmt(medida(c, desenho[k][1], desenho[k][2]))}`).join(" · "));
      }
    }
    return;
  }

  console.log(`\n== DESENHO (08/01/2024 a 31/03/2026) — ${variantes.length} variações; a reserva ainda não foi rodada`);
  // O CRITÉRIO, escrito antes da rodada 4: entre as variações com as DUAS
  // metades do desenho positivas, a de maior Sharpe no desenho. A escolha é do
  // código, e é ela que vai a `docs/preregistro-grandes.md` antes da reserva.
  const elegiveis: { nome: string; sharpe: number }[] = [];
  for (const [nome, r] of variantes) {
    const es = desenho.map(([, de, ate]) => simular(r, de, ate));
    const ms = es.map((e, k) => medida(e.curva, desenho[k][1], desenho[k][2]));
    if (ms[1].ret > 0 && ms[2].ret > 0) elegiveis.push({ nome, sharpe: ms[0].sharpe });
    const moedas = [...porMoeda(es[0]).entries()].sort((a, b) => b[1] - a[1]);
    const top5 = new Set(moedas.slice(0, 5).map(([s]) => s));
    const s5 = simular(r, INICIO, FIM_DESENHO, top5);
    const trades = es[0].fechadas;
    const soma = (lado: LadoRobo) => trades.filter((t) => t.lado === lado).reduce((a, t) => a + t.resultado, 0);
    const dias = trades.length > 0 ? trades.reduce((a, t) => a + (t.fechadaEm - t.abertaEm) / DIA, 0) / trades.length : 0;
    const motivos = new Map<string, number>();
    for (const t of trades) motivos.set(t.motivo, (motivos.get(t.motivo) ?? 0) + 1);
    // O custo pago, aproximado: os dois lados pela régua, o atraso da entrada e o da saída por posto; o par paga em dobro.
    const custo = trades.reduce(
      (a, t) => a + t.nocional * (2 * (t.custoLado ?? 0) + CUSTO_ATRASO * (t.motivo === "posto" ? 2 : 1)) * (t.hedge ? 2 : 1),
      0,
    );
    console.log(
      `${nome.padEnd(34)} ` + ms.map((m, k) => `${desenho[k][0]} ${fmt(m)}`).join(" · ") +
        ` · sem as 5 ${pct(s5.patrimonio / CAPITAL_ROBO - 1)} · ${trades.length} trades de ${dias.toFixed(1)} dias, comprada US$ ${soma("long").toFixed(0)}, vendida US$ ${soma("short").toFixed(0)}, custo US$ ${custo.toFixed(0)}` +
        (es[0].recusadas ? ` · ${es[0].recusadas} recusadas` : "") +
        ` · saídas: ${[...motivos.entries()].sort((a, b) => b[1] - a[1]).map(([m, n]) => `${m} ${n}`).join(", ")}` +
        ` · melhores: ${moedas.slice(0, 3).map(([s, v]) => `${s.replace(/USDT$/, "")} ${v >= 0 ? "+" : ""}${v.toFixed(0)}`).join(", ")}`,
    );
  }
  const escolhida = elegiveis.sort((a, b) => b.sharpe - a.sharpe)[0];
  console.log(
    escolhida
      ? `\n${elegiveis.length} de ${variantes.length} com as duas metades positivas; escolhida pelo critério: ${escolhida.nome} (Sharpe ${escolhida.sharpe.toFixed(2)} no desenho)`
      : "\nnenhuma variação tem as duas metades positivas",
  );
}

/**
 * A RECOMPRA LOGO DEPOIS DA SAÍDA (13/10, visto ao vivo): o Momento saiu da
 * STRK e da GTC pelo rastro em 12/10 e comprou as duas de novo na decisão de
 * 13/10, porque elas continuavam entre as 5 que mais subiram em 45 dias. Para
 * quem olha, é entrar de novo na furada da véspera. Diagnóstico, não regra: no
 * publicado, a entrada que volta à mesma moeda até 3 dias depois de uma saída
 * por stop, rastro ou posto rende diferente das outras?
 */
function estudarReentrada(): void {
  const e = simular(MOMENTO, INICIO, FIM);
  const trades = [...e.fechadas].sort((a, b) => a.abertaEm - b.abertaEm);
  const saidas = new Map<string, number[]>();
  for (const t of trades) if (t.motivo === "stop" || t.motivo === "rastro" || t.motivo === "posto") saidas.set(`${t.lado}:${t.symbol}`, [...(saidas.get(`${t.lado}:${t.symbol}`) ?? []), t.fechadaEm]);
  const soma = (ts: readonly TradeRobo[]) => ts.reduce((a, t) => a + t.resultado, 0);
  for (const lado of ["long", "short"] as const) {
    const ts = trades.filter((t) => t.lado === lado);
    const volta = (t: TradeRobo) => (saidas.get(`${lado}:${t.symbol}`) ?? []).some((s) => s <= t.abertaEm && t.abertaEm - s <= 3 * DIA);
    const re = ts.filter(volta);
    const novas = ts.filter((t) => !volta(t));
    const linha = (nome: string, xs: TradeRobo[]) => {
      const o = xs.map((t) => t.resultado / t.margem).sort((a, b) => a - b);
      return `${nome}: ${xs.length} trades, ${pct(xs.filter((t) => t.resultado > 0).length / Math.max(1, xs.length))} no lucro, mediana ${pct(quantil(o, 0.5))} da margem, média ${pct(o.reduce((a, b) => a + b, 0) / Math.max(1, o.length))} da margem, soma US$ ${soma(xs).toFixed(0)}`;
    };
    console.log(`\n== ${lado === "long" ? "comprada" : "vendida"}`);
    console.log(linha("recompra até 3 dias depois de stop, rastro ou posto", re));
    console.log(linha("as outras entradas", novas));
  }
}

/** Um número em [0, 1) fixado por (semente, dia, janela, moeda): o mesmo sorteio sempre que a conta for refeita. */
function sortear(semente: number, i: number, janela: number, symbol: string): number {
  let h = 2_166_136_261 ^ semente;
  for (const ch of `${i}:${janela}:${symbol}`) h = Math.imul(h ^ ch.charCodeAt(0), 16_777_619);
  let t = (h + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
}

/**
 * O PLACEBO (13/10, a pergunta do usuário: "é lógica ou sorte?"). O Momento com
 * a ESCOLHA sorteada e a gestão igual: a cada dia, a perna sorteada pega as k
 * moedas ao acaso entre as MESMAS elegíveis (volume, idade, série que cubra a
 * janela) — o retorno da janela de cada linha vira um número sorteado, fixado
 * por (semente, dia, moeda) —, e todo o resto é o mesmo motor: stop, rastro,
 * pirâmide, prazo, alvo de volatilidade, vendida pela volatilidade, custo e
 * regras da corretora.
 *
 * Sem a saída por posto, dos dois lados da comparação: ela lê o ranking do
 * momento, e numa moeda sorteada fecharia a posição no dia seguinte — seria
 * outra gestão, não a mesma com outra escolha. A régua é o publicado sem ela
 * (a `c45·v14·pir·alvo·vol` da grade); o publicado vai junto, para o registro.
 *
 * E A MESMA QUANTIDADE DE ENTRADAS, no mesmo dia: o momento repete as mesmas
 * moedas por dias seguidos e abre poucas novas; o sorteio puro abriria cinco
 * novas todo dia e seria outra exposição. A perna sorteada abre, a cada dia,
 * tantas quantas o real abriu nela naquele dia, ao acaso entre as elegíveis
 * que ainda não estão abertas.
 *
 * O critério, escrito antes de rodar: a escolha tem valor se o real fica acima
 * de 95% dos sorteios na janela inteira E nas duas metades.
 */
function estudarPlacebo(): void {
  const SEMENTES = 40;
  const semPosto: Robo = {
    ...MOMENTO,
    id: "momento·sem-posto",
    regras: {
      ...MOMENTO.regras,
      pernas: MOMENTO.regras.pernas.map((p) => {
        const c = { ...p };
        delete c.saidaPosto;
        return c;
      }),
    },
  };
  const janelaDe = (lado: "long" | "short") => semPosto.regras.pernas.find((p) => p.lado === lado)!.janelaDias;
  const ladoDaJanela = new Map(semPosto.regras.pernas.map((p) => [p.janelaDias, p.lado]));
  const original = linhasDoDia;
  // O sorteio da rodada e o robô que está rodando: a moeda já aberta vai para o
  // fim do ranking sorteado (continua elegível, e a mediana do desvio da
  // vendida não muda), para que as k entradas do dia sejam k moedas novas.
  let sorteio: { semente: number; janelas: number[]; estado: EstadoRobo } | null = null;
  linhasComOI = (i: number, janelaVol: number, comCorretora: boolean) => {
    const linhas = original(i, janelaVol, comCorretora);
    const s = sorteio;
    if (!s) return linhas;
    const abertas = new Set(s.estado.abertas.map((p) => p.symbol));
    return linhas.map((l) => {
      const retorno = { ...l.retorno };
      for (const j of s.janelas) {
        const r = retorno[j];
        if (typeof r !== "number" || !Number.isFinite(r)) continue;
        retorno[j] = abertas.has(l.symbol) ? (ladoDaJanela.get(j) === "long" ? -1 : 2) : sortear(s.semente, i, j, l.symbol);
      }
      return { ...l, retorno };
    });
  };

  const periodos: [string, number, number][] = [
    ["inteira", INICIO, FIM],
    ["dentro (até 06/2025)", INICIO, CORTE],
    ["fora (07/2025 em diante)", CORTE, FIM],
  ];
  /** O patrimônio no último ponto da curva até `t`. */
  const valorEm = (e: EstadoRobo, t: number) => {
    let v = e.curva[0].patrimonio;
    for (const p of e.curva) {
      if (p.t > t) break;
      v = p.patrimonio;
    }
    return v;
  };
  const retornos = (e: EstadoRobo) => periodos.map(([, de, ate]) => valorEm(e, ate) / valorEm(e, de) - 1);

  // A anatomia do publicado: quantas acerta, quanto ganha a que acerta, de onde vem o lucro.
  const pub = simular(MOMENTO, INICIO, FIM);
  const trades = pub.fechadas;
  const ganhos = trades.filter((t) => t.resultado > 0);
  const perdas = trades.filter((t) => t.resultado <= 0);
  const soma = (ts: readonly TradeRobo[]) => ts.reduce((a, t) => a + t.resultado, 0);
  const moedas = [...porMoeda(pub).entries()].sort((a, b) => b[1] - a[1]);
  const total = moedas.reduce((a, [, v]) => a + v, 0);
  const top5 = moedas.slice(0, 5).reduce((a, [, v]) => a + v, 0);
  console.log(`\n== O PUBLICADO, 01/2024 a 09/2026: ${pct(pub.patrimonio / CAPITAL_ROBO - 1)}, Sharpe ${sharpeDe(pub.curva).toFixed(2)}`);
  for (const lado of ["long", "short"] as const) {
    const ts = trades.filter((t) => t.lado === lado);
    const g = ts.filter((t) => t.resultado > 0);
    const ordenados = ts.map((t) => t.resultado).sort((a, b) => a - b);
    console.log(
      `${lado === "long" ? "comprada" : "vendida "}: ${ts.length} trades, ${pct(g.length / Math.max(1, ts.length))} no lucro · ` +
        `ganho médio US$ ${(soma(g) / Math.max(1, g.length)).toFixed(0)} · perda média US$ ${(soma(ts.filter((t) => t.resultado <= 0)) / Math.max(1, ts.length - g.length)).toFixed(0)} · ` +
        `mediana US$ ${ordenados[Math.floor(ordenados.length / 2)]?.toFixed(0)} · soma US$ ${soma(ts).toFixed(0)}`,
    );
  }
  console.log(
    `no lucro: ${ganhos.length} de ${trades.length} (${pct(ganhos.length / trades.length)}); os 10 melhores trades fizeram US$ ${soma([...trades].sort((a, b) => b.resultado - a.resultado).slice(0, 10)).toFixed(0)} de US$ ${total.toFixed(0)}; ` +
      `as 5 melhores moedas (${moedas.slice(0, 5).map(([s]) => s.replace(/USDT$/, "")).join(", ")}), US$ ${top5.toFixed(0)}; perdas somadas US$ ${soma(perdas).toFixed(0)}`,
  );
  // Quanto cinco dias dizem: as janelas de 5 dias seguidas do publicado.
  const dias = diaria(pub);
  for (const n of [5, 30]) {
    const rs: number[] = [];
    for (let k = n; k < dias.length; k++) rs.push(dias[k].patrimonio / dias[k - n].patrimonio - 1);
    const o = [...rs].sort((a, b) => a - b);
    console.log(
      `janelas de ${n} dias: ${pct(rs.filter((r) => r < 0).length / rs.length)} no prejuízo · mediana ${pct(quantil(o, 0.5))} · ` +
        `10% piores abaixo de ${pct(quantil(o, 0.1))} · 10% melhores acima de ${pct(quantil(o, 0.9))}`,
    );
  }

  console.log(`\n== O PLACEBO: a mesma gestão, a escolha sorteada, ${SEMENTES} sorteios por configuração (sem a saída por posto)`);
  const real = simular(semPosto, INICIO, FIM);
  const rReal = retornos(real);
  const entradasDe = (e: EstadoRobo) => [...e.fechadas, ...e.abertas];
  // Quantas o real abriu em cada perna, em cada dia: o sorteio abre o mesmo número.
  const contagem = new Map<string, number>();
  for (const p of entradasDe(real)) contagem.set(`${p.lado}:${p.abertaEm}`, (contagem.get(`${p.lado}:${p.abertaEm}`) ?? 0) + 1);
  console.log(`${"publicado".padEnd(22)} ${retornos(pub).map((r, k) => `${periodos[k][0]} ${pct(r)}`).join(" · ")}`);
  console.log(
    `${"publicado sem posto".padEnd(22)} ${rReal.map((r, k) => `${periodos[k][0]} ${pct(r)}`).join(" · ")} · Sharpe ${sharpeDe(real.curva).toFixed(2)} · ${entradasDe(real).length} entradas  ← a régua`,
  );
  const rodar = (janelas: number[], semente: number): EstadoRobo => {
    const e = novoEstado({ ...semPosto, regras: { ...semPosto.regras } }, INICIO);
    const ctx: Contexto = { janelaVol: JANELA_VOLATILIDADE_DIAS, comCorretora: true, hedges: hedgesDe(semPosto), extra: {} };
    sorteio = { semente, janelas, estado: e };
    const [i0, i1] = horasDe(INICIO, FIM);
    for (let i = i0; i <= i1; i++) {
      const t = INICIO_DADOS + i * HORA;
      if (t % DIA === 0) {
        e.regras = {
          ...semPosto.regras,
          pernas: semPosto.regras.pernas.map((p) => (janelas.includes(p.janelaDias) ? { ...p, k: contagem.get(`${p.lado}:${t}`) ?? 0 } : p)),
        };
      }
      umaHora(e, i, ctx);
    }
    sorteio = null;
    return e;
  };
  const configuracoes: [string, number[]][] = [
    ["compra sorteada", [janelaDe("long")]],
    ["venda sorteada", [janelaDe("short")]],
    ["as duas sorteadas", [janelaDe("long"), janelaDe("short")]],
  ];
  for (const [nome, janelas] of configuracoes) {
    const porPeriodo: number[][] = periodos.map(() => []);
    const sharpes: number[] = [];
    const entradas: number[] = [];
    for (let s = 1; s <= SEMENTES; s++) {
      const e = rodar(janelas, s);
      retornos(e).forEach((r, k) => porPeriodo[k].push(r));
      sharpes.push(sharpeDe(e.curva));
      entradas.push(entradasDe(e).length);
    }
    const partes = porPeriodo.map((rs, k) => {
      const o = [...rs].sort((a, b) => a - b);
      const acima = rs.filter((r) => r >= rReal[k]).length;
      return `${periodos[k][0]}: mediana ${pct(quantil(o, 0.5))} (5% a 95%: ${pct(quantil(o, 0.05))} a ${pct(quantil(o, 0.95))}), ${acima} de ${rs.length} no real ou acima, p = ${((1 + acima) / (1 + rs.length)).toFixed(3)}`;
    });
    const o = [...sharpes].sort((a, b) => a - b);
    console.log(
      `${nome.padEnd(22)} ${partes.join(" · ")} · Sharpe mediano ${quantil(o, 0.5).toFixed(2)}, o maior ${o[o.length - 1].toFixed(2)} · ` +
        `entradas, mediana ${quantil([...entradas].sort((a, b) => a - b), 0.5)}`,
    );
  }
  linhasComOI = original;
}

/** O robô com a parcela da pirâmide `P` vezes o tamanho normal (nas pernas que têm pirâmide) e o tamanho base ×L. */
function comParcela(r: Robo, P: number, L: number): Robo {
  return {
    ...r,
    id: `${r.id}·parcela${P}·x${L}`,
    regras: {
      ...r.regras,
      tamanho: r.regras.tamanho * L,
      pernas: r.regras.pernas.map((p) => (p.piramide ? { ...p, piramide: { ...p.piramide, tamanho: P } } : p)),
    },
  };
}

/**
 * A rodada 3 do loop (`docs/preregistro-piramide.md`), como está escrita lá: a
 * parcela da pirâmide do Momento a 1,5x, 2x e 3x o tamanho normal, cada uma
 * com o tamanho base ×1, ×1,25 e ×1,5, julgadas no DESENHO pelo teto de 50% de
 * queda e contra a campeã da rodada 1 (Momento ×1,5, parcela 1). Só a escolhida
 * vai à reserva e, passando, ao ataque — custo de entrada 4x e escorregada do
 * stop dobrada, cada um contra a campeã no mesmo ataque.
 */
async function estudarPiramide(): Promise<void> {
  const FIM_DESENHO = Date.parse("2026-04-01T00:00:00Z");
  const TETO = -0.5;
  // O mesmo N de `TENTATIVAS_DA_PESQUISA`, que é declarada depois daqui: 300 mais as 14 da rodada 1, as 3 da 2 e as 9 desta.
  const TENTATIVAS = 300 + 14 + 3 + 9;
  const desenho: [string, number, number][] = [
    ["desenho", INICIO, FIM_DESENHO],
    ["1ª metade", INICIO, CORTE],
    ["2ª metade", CORTE, FIM_DESENHO],
  ];
  const aoMes = (ret: number, de: number, ate: number) => (1 + ret) ** (30.4375 / ((ate - de) / DIA)) - 1;
  const quedaDe = (curva: readonly { t: number; patrimonio: number }[]) => {
    let pico = 0;
    let q = 0;
    for (const p of curva) {
      if (p.patrimonio > pico) pico = p.patrimonio;
      if (pico > 0) q = Math.min(q, p.patrimonio / pico - 1);
    }
    return q;
  };
  type Medida = { ret: number; mes: number; queda: number; sharpe: number; recusadas: number };
  const medida = (e: EstadoRobo, de: number, ate: number): Medida => {
    const ret = e.curva[e.curva.length - 1].patrimonio / e.curva[0].patrimonio - 1;
    return { ret, mes: aoMes(ret, de, ate), queda: quedaDe(e.curva), sharpe: sharpeDe(e.curva), recusadas: e.recusadas };
  };
  const fmt = (m: Medida) => `${pct(m.ret).padStart(9)} (${pct(m.mes)} ao mês, queda ${pct(m.queda)}, Sharpe ${m.sharpe.toFixed(2)})`;
  const nome = (P: number, L: number) => `parcela ${P} · ×${L}`.padEnd(18);
  const top5 = new Set([...porMoeda(simular(MOMENTO, INICIO, FIM_DESENHO)).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s]) => s));
  /** Quanto da perna comprada veio das posições que ganharam a parcela — o mecanismo, fora do critério. */
  const mecanismo = (e: EstadoRobo) => {
    const compras = e.fechadas.filter((t) => t.lado === "long");
    const com = compras.filter((t) => (t.parcelas ?? 1) > 1);
    const soma = (ts: TradeRobo[]) => ts.reduce((a, t) => a + t.resultado, 0);
    return `parcela em ${com.length} de ${compras.length} compras, que fizeram US$ ${soma(com).toFixed(0)} de US$ ${soma(compras).toFixed(0)}`;
  };

  console.log(`\n== DESENHO (08/01/2024 a 31/03/2026) — a reserva ainda não foi rodada; teto de queda 50%, de hora em hora; sem as 5: ${[...top5].join(", ")}`);
  const PARCELAS = [1.5, 2, 3];
  const BASES = [1, 1.25, 1.5];
  const elegiveis: { P: number; L: number; mes: number }[] = [];
  let campeaDesenho: Medida | null = null;
  for (const P of [1, ...PARCELAS]) {
    for (const L of BASES) {
      const r = comParcela(MOMENTO, P, L);
      const es = desenho.map(([, de, ate]) => simular(r, de, ate));
      const ms = es.map((e, k) => medida(e, desenho[k][1], desenho[k][2]));
      const s5 = medida(simular(r, INICIO, FIM_DESENHO, top5), INICIO, FIM_DESENHO);
      const ok = ms.every((m) => m.queda >= TETO) && s5.ret > 0;
      if (P === 1 && L === 1.5) campeaDesenho = ms[0];
      if (ok && P !== 1) elegiveis.push({ P, L, mes: ms[0].mes });
      console.log(
        `${nome(P, L)} ` + ms.map((m, k) => `${desenho[k][0]} ${fmt(m)}`).join(" · ") +
          ` · sem as 5 ${pct(s5.ret)} · ${ms[0].recusadas} recusadas · ${mecanismo(es[0])} → ` +
          (P === 1 ? (L === 1.5 ? "a campeã" : "referência (rodada 1)") : ok ? "elegível" : "fora do teto"),
      );
    }
  }
  const campea = comParcela(MOMENTO, 1, 1.5);
  const escolhida = elegiveis.sort((a, b) => b.mes - a.mes)[0];
  const venceDesenho = !!escolhida && escolhida.mes > campeaDesenho!.mes;
  console.log(
    !escolhida
      ? "\nnenhuma cabe no teto: REPROVA sem chegar à reserva"
      : `\nescolhida: parcela ${escolhida.P}, ×${escolhida.L} (${pct(escolhida.mes)} ao mês) · ${venceDesenho ? "supera a campeã no desenho" : `NÃO supera a campeã (${pct(campeaDesenho!.mes)} ao mês): REPROVA sem chegar à reserva`}`,
  );

  console.log("\n== RESERVA (01/04/2026 a 30/09/2026)");
  const campeaReserva = medida(simular(campea, FIM_DESENHO, FIM), FIM_DESENHO, FIM);
  console.log(`${"campeã".padEnd(18)} ${fmt(campeaReserva)}`);
  let aprovada = false;
  if (escolhida && venceDesenho) {
    const robo = comParcela(MOMENTO, escolhida.P, escolhida.L);
    const r = medida(simular(robo, FIM_DESENHO, FIM), FIM_DESENHO, FIM);
    const passaReserva = r.queda >= TETO && r.mes >= campeaReserva.mes;
    console.log(`${nome(escolhida.P, escolhida.L)} ${fmt(r)} ← escolhida: ${passaReserva ? "passa na reserva" : "REPROVADA na reserva"}`);
    if (passaReserva) {
      console.log("\n== O ATAQUE, no desenho: cada um contra a campeã no mesmo ataque");
      const ataques: [string, Extra][] = [
        ["custo de entrada 4x", { custoAtraso: 4 * CUSTO_ATRASO }],
        ["escorregada dobrada", { escorregada: 2 * ESCORREGADA_STOP }],
      ];
      let aguenta = true;
      for (const [rotulo, extra] of ataques) {
        const c = medida(simular(campea, INICIO, FIM_DESENHO, undefined, undefined, JANELA_VOLATILIDADE_DIAS, true, extra), INICIO, FIM_DESENHO);
        const v = medida(simular(robo, INICIO, FIM_DESENHO, undefined, undefined, JANELA_VOLATILIDADE_DIAS, true, extra), INICIO, FIM_DESENHO);
        const ok = v.queda >= TETO && v.mes > c.mes;
        aguenta &&= ok;
        console.log(`${rotulo.padEnd(20)} campeã ${fmt(c)} · escolhida ${fmt(v)} → ${ok ? "aguenta" : "NÃO aguenta"}`);
      }
      aprovada = aguenta;
    }
    console.log(`\n→ ${aprovada ? "APROVADA" : "REPROVADA"}`);
  }

  // As tentativas somadas: o deflacionado da escolhida (e da campeã) na janela inteira.
  const medicao = JSON.parse(await readFile("data/robos-medicao.json", "utf8")) as Medicao;
  const grade = medicao.quant?.validacao.find((v) => v.id === "momento")?.desvioDosSharpes.grade ?? 0;
  const deflacionadoDe = (robo: Robo) => {
    const { r } = retornosDiarios(diaria(simular(robo, INICIO, FIM)));
    const variancia = Math.max((grade / Math.sqrt(365)) ** 2, varianciaDoSharpeNulo(r.length));
    return `Sharpe ${(sharpeDiario(r) * Math.sqrt(365)).toFixed(2)}, régua ${(sharpeMaximoEsperado(TENTATIVAS, variancia) * Math.sqrt(365)).toFixed(2)}, DSR ${sharpeDeflacionado(r, TENTATIVAS, variancia).toFixed(4)}`;
  };
  console.log(`\n== deflacionado com ${TENTATIVAS} tentativas, 01/2024 a 09/2026`);
  console.log(`${"campeã".padEnd(18)} ${deflacionadoDe(campea)}`);
  if (escolhida) console.log(`${nome(escolhida.P, escolhida.L)} ${deflacionadoDe(comParcela(MOMENTO, escolhida.P, escolhida.L))}`);

  if (aprovada && escolhida) {
    // A META: a escolhida em tempo real — a grade com a parcela dela, o walk-forward de 365 dias.
    const variantes = GRADES.find((g) => g.livro.id === MOMENTO.id)!.variantes;
    const colunas: number[][] = [];
    let datas: number[] = [];
    for (const v of variantes) {
      const d = retornosDiarios(diaria(simular(comParcela(v, escolhida.P, escolhida.L), INICIO, FIM)));
      colunas.push(d.r);
      datas = d.datas;
    }
    const wf = walkForward(Array.from({ length: datas.length }, (_, t) => colunas.map((c) => c[t])), datas, 365, 180);
    const f = fichaDe(wf.r, wf.datas);
    const de = wf.datas[0] - DIA;
    console.log(
      `\n== em tempo real (walk-forward de 365 dias na grade com a parcela ${escolhida.P}, ×${escolhida.L}): desde ${new Date(de).toISOString().slice(0, 10)} ` +
        `${pct(f.retorno)} (${pct(aoMes(f.retorno, de, wf.datas[wf.datas.length - 1]))} ao mês, queda diária ${pct(f.quedaMaxima)}, Sharpe ${f.sharpe.toFixed(2)})`,
    );
  }

  console.log("\n== RESERVA das outras (registro, depois da decisão)");
  for (const P of [1, ...PARCELAS]) {
    for (const L of BASES) {
      if ((P === 1 && L === 1.5) || (escolhida && venceDesenho && P === escolhida.P && L === escolhida.L)) continue;
      console.log(`${nome(P, L)} ${fmt(medida(simular(comParcela(MOMENTO, P, L), FIM_DESENHO, FIM), FIM_DESENHO, FIM))}`);
    }
  }
}

/**
 * A rodada 2 do loop (`docs/preregistro-alvo-fundo.md`), como está escrita lá:
 * o fundo inteiro com o alvo de volatilidade de 40%, 60% ou 80% ao ano,
 * simulado com as subcontas lado a lado (`simularFundo`), julgado no DESENHO
 * pelo teto de 50% de queda e contra a campeã da rodada 1 (Momento ×1,5); um
 * controle sem alvo tem de reproduzir o fundo ×1 da rodada 1 antes de tudo.
 */
function estudarAlvoFundo(): void {
  const FIM_DESENHO = Date.parse("2026-04-01T00:00:00Z");
  const TETO = -0.5;
  const desenho: [string, number, number][] = [
    ["desenho", INICIO, FIM_DESENHO],
    ["1ª metade", INICIO, CORTE],
    ["2ª metade", CORTE, FIM_DESENHO],
  ];
  const aoMes = (ret: number, de: number, ate: number) => (1 + ret) ** (30.4375 / ((ate - de) / DIA)) - 1;
  const quedaDe = (curva: readonly { t: number; patrimonio: number }[]) => {
    let pico = 0;
    let q = 0;
    for (const p of curva) {
      if (p.patrimonio > pico) pico = p.patrimonio;
      if (pico > 0) q = Math.min(q, p.patrimonio / pico - 1);
    }
    return q;
  };
  type Medida = { ret: number; mes: number; queda: number; sharpe: number; recusadas: number; escala?: number };
  const medida = (curva: { t: number; patrimonio: number }[], de: number, ate: number, recusadas = 0, escalas?: number[]): Medida => {
    const ret = curva[curva.length - 1].patrimonio / curva[0].patrimonio - 1;
    const escala = escalas && escalas.length > 0 ? escalas.reduce((a, b) => a + b, 0) / escalas.length : undefined;
    return { ret, mes: aoMes(ret, de, ate), queda: quedaDe(curva), sharpe: sharpeDe(curva), recusadas, ...(escala !== undefined ? { escala } : {}) };
  };
  const fmt = (m: Medida) =>
    `${pct(m.ret).padStart(9)} (${pct(m.mes)} ao mês, queda ${pct(m.queda)}, Sharpe ${m.sharpe.toFixed(2)}${m.escala !== undefined ? `, escala média ${m.escala.toFixed(2)}` : ""})`;
  const top5De = (e: EstadoRobo) => new Set([...porMoeda(e).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s]) => s));
  const sem5 = [top5De(simular(MOMENTO, INICIO, FIM_DESENHO)), top5De(simular(FLUXO, INICIO, FIM_DESENHO))];
  const livros = [MOMENTO, FLUXO];
  const doFundo = (de: number, ate: number, alvo?: number, excluir?: Set<string>[]): Medida => {
    const f = simularFundo(livros, de, ate, { ...(alvo ? { alvo: { anual: alvo, janelaDias: 40, minimo: 0.25, maximo: 2 } } : {}), ...(excluir ? { excluir } : {}) });
    return medida(f.curva, de, ate, f.estados.reduce((a, e) => a + e.recusadas, 0), alvo ? f.escalas : undefined);
  };

  // O CONTROLE: sem alvo, o fundo lado a lado tem de ser o fundo ×1 da rodada 1 (+684,5%, −20,7%).
  console.log("\n== CONTROLE: o fundo sem alvo, simulado lado a lado");
  const controle = desenho.map(([, de, ate]) => doFundo(de, ate));
  console.log(controle.map((m, k) => `${desenho[k][0]} ${fmt(m)}`).join(" · "));
  const reproduz = Math.abs(controle[0].ret - 6.845) < 0.01 && Math.abs(controle[0].queda - -0.207) < 0.002;
  console.log(reproduz ? "reproduz o fundo ×1 da rodada 1: a simulação lado a lado confere" : "NÃO reproduz o fundo ×1 da rodada 1 — a rodada para aqui, antes de julgar");
  if (!reproduz) return;

  console.log("\n== DESENHO (08/01/2024 a 31/03/2026) — a reserva ainda não foi rodada; teto de queda 50%, de hora em hora");
  const campea = escaladoMomento(1.5);
  const cd = simular(campea, INICIO, FIM_DESENHO);
  const campeaDesenho = medida(cd.curva, INICIO, FIM_DESENHO, cd.recusadas);
  console.log(`${"campeã (Momento ×1,5)".padEnd(22)} ${fmt(campeaDesenho)}`);
  const alvos = [0.4, 0.6, 0.8];
  const elegiveis: { alvo: number; mes: number }[] = [];
  for (const alvo of alvos) {
    const ms = desenho.map(([, de, ate]) => doFundo(de, ate, alvo));
    const s5 = doFundo(INICIO, FIM_DESENHO, alvo, sem5);
    const ok = ms.every((m) => m.queda >= TETO) && s5.ret > 0;
    if (ok) elegiveis.push({ alvo, mes: ms[0].mes });
    console.log(
      `${`fundo, alvo ${alvo * 100}%`.padEnd(22)} ` + ms.map((m, k) => `${desenho[k][0]} ${fmt(m)}`).join(" · ") +
        ` · sem as 5 ${pct(s5.ret)} · ${ms[0].recusadas} recusadas → ${ok ? "elegível" : "fora do teto"}`,
    );
  }
  const escolhida = elegiveis.sort((a, b) => b.mes - a.mes)[0];
  const venceDesenho = escolhida && escolhida.mes > campeaDesenho.mes;
  console.log(
    !escolhida
      ? "\nnenhuma cabe no teto: REPROVA sem chegar à reserva"
      : `\nescolhida: alvo de ${escolhida.alvo * 100}% (${pct(escolhida.mes)} ao mês) · ${venceDesenho ? "supera a campeã no desenho" : `NÃO supera a campeã (${pct(campeaDesenho.mes)} ao mês): REPROVA sem chegar à reserva`}`,
  );

  console.log("\n== RESERVA (01/04/2026 a 30/09/2026)");
  const cr = simular(campea, FIM_DESENHO, FIM);
  const campeaReserva = medida(cr.curva, FIM_DESENHO, FIM, cr.recusadas);
  console.log(`${"campeã (Momento ×1,5)".padEnd(22)} ${fmt(campeaReserva)}`);
  if (escolhida && venceDesenho) {
    const r = doFundo(FIM_DESENHO, FIM, escolhida.alvo);
    const aprovada = r.queda >= TETO && r.mes >= campeaReserva.mes;
    console.log(`${`fundo, alvo ${escolhida.alvo * 100}%`.padEnd(22)} ${fmt(r)} ← escolhida: ${aprovada ? "APROVADA" : "REPROVADA na reserva"}`);
  }
  console.log("(registro, depois da decisão)");
  for (const alvo of alvos) {
    if (escolhida && venceDesenho && alvo === escolhida.alvo) continue;
    console.log(`${`fundo, alvo ${alvo * 100}%`.padEnd(22)} ${fmt(doFundo(FIM_DESENHO, FIM, alvo))}`);
  }
  console.log(`${"fundo sem alvo".padEnd(22)} ${fmt(doFundo(FIM_DESENHO, FIM))}`);
}

/** O Momento com o tamanho base multiplicado — o turbo é ×1,5. */
function escaladoMomento(L: number): Robo {
  return { ...MOMENTO, id: `momento-x${L}`, regras: { ...MOMENTO.regras, tamanho: MOMENTO.regras.tamanho * L } };
}

/**
 * A rodada 1 do loop de melhoria (`docs/preregistro-tamanho.md`), como está
 * escrita lá: o Momento, o Fluxo e o fundo com o tamanho base multiplicado,
 * julgados no DESENHO pelo teto de 50% de queda do documento de objetivos, a
 * escolha pelo código, e só então a RESERVA. Depois da decisão, a escolhida em
 * tempo real — as grades rodadas no tamanho dela e o walk-forward de 365 dias.
 */
function estudarTamanho(): void {
  const FIM_DESENHO = Date.parse("2026-04-01T00:00:00Z");
  const TETO = -0.5;
  const desenho: [string, number, number][] = [
    ["desenho", INICIO, FIM_DESENHO],
    ["1ª metade", INICIO, CORTE],
    ["2ª metade", CORTE, FIM_DESENHO],
  ];
  const aoMes = (ret: number, de: number, ate: number) => (1 + ret) ** (30.4375 / ((ate - de) / DIA)) - 1;
  const escalado = (r: Robo, L: number): Robo => ({ ...r, id: `${r.id}x${L}`, regras: { ...r.regras, tamanho: r.regras.tamanho * L } });
  const quedaDe = (curva: readonly { t: number; patrimonio: number }[]) => {
    let pico = 0;
    let q = 0;
    for (const p of curva) {
      if (p.patrimonio > pico) pico = p.patrimonio;
      if (pico > 0) q = Math.min(q, p.patrimonio / pico - 1);
    }
    return q;
  };
  type Livro = { e: EstadoRobo; viradas: Virada[] };
  type Medida = { ret: number; mes: number; queda: number; sharpe: number; recusadas: number };
  const medida = (curva: readonly { t: number; patrimonio: number }[], de: number, ate: number, recusadas = 0): Medida => {
    const ret = curva[curva.length - 1].patrimonio / curva[0].patrimonio - 1;
    return { ret, mes: aoMes(ret, de, ate), queda: quedaDe(curva), sharpe: sharpeDe(curva as { t: number; patrimonio: number }[]), recusadas };
  };
  /**
   * O fundo de dois livros com as cotas marcadas HORA A HORA: os pesos de cada
   * dia 1º saem de `paridadeDeRisco` (inverso do desvio de 90 dias, só com o
   * caixa livre), e entre um dia 1º e o outro o patrimônio é a soma das cotas
   * de cada subconta vezes o patrimônio dela naquela hora — a curva em que a
   * queda do teto de 50% é medida.
   */
  const fundoHorario = (livros: Livro[]): { t: number; patrimonio: number }[] => {
    const rs = livros.map((l) => retornosDiarios(diaria(l.e)));
    const n = Math.min(...rs.map((x) => x.r.length));
    const datas = rs[0].datas.slice(rs[0].datas.length - n);
    const livre = livros.map((l) => {
      const porT = new Map(l.viradas.map((v) => [v.t, v.patrimonio > 0 ? v.caixa / v.patrimonio : 0]));
      return datas.map((t) => porT.get(t - DIA) ?? (t - DIA === l.e.comecouEm ? 1 : 0));
    });
    const f = paridadeDeRisco(rs.map((x) => x.r.slice(x.r.length - n)), datas, 90, 20, undefined, livre);
    const valores = livros.map((l) => new Map(l.e.curva.map((p) => [p.t, p.patrimonio])));
    const rebal = new Map(f.pesos.map((p) => [p.t, p.depois]));
    const curva: { t: number; patrimonio: number }[] = [];
    let cotas: number[] | null = null;
    for (const p of livros[0].e.curva) {
      const vs = valores.map((m) => m.get(p.t));
      if (vs.some((v) => v === undefined || !(v > 0))) continue;
      const v = vs as number[];
      const total: number = cotas ? cotas.reduce((a, q, j) => a + q * v[j], 0) : CAPITAL_ROBO;
      const depois = rebal.get(p.t);
      if (cotas === null || depois) {
        const pesos = depois ?? livros.map(() => 1 / livros.length);
        cotas = pesos.map((w, j) => (w * total) / v[j]);
      }
      curva.push({ t: p.t, patrimonio: total });
    }
    return curva;
  };
  const top5De = (e: EstadoRobo) => new Set([...porMoeda(e).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s]) => s));
  const fmt = (m: Medida) => `${pct(m.ret).padStart(9)} (${pct(m.mes)} ao mês, queda ${pct(m.queda)}, Sharpe ${m.sharpe.toFixed(2)})`;

  // Cada livro em cada L, nas três janelas do desenho e sem as 5 da versão ×1 dele no desenho.
  const tamanhos = { momento: [1, 1.25, 1.5, 1.75, 2, 2.5, 3], fluxo: [1, 1.25, 1.5, 2, 2.5, 3] };
  const familias = { momento: [1, 1.25, 1.5, 1.75, 2], fluxo: [1, 1.25, 1.5, 2], fundo: [1, 1.5, 2, 2.5, 3] };
  const base = { momento: MOMENTO, fluxo: FLUXO };
  const top5 = {
    momento: top5De(simular(MOMENTO, INICIO, FIM_DESENHO)),
    fluxo: top5De(simular(FLUXO, INICIO, FIM_DESENHO)),
  };
  const livros = new Map<string, { janelas: Livro[]; sem5: Livro }>();
  for (const id of ["momento", "fluxo"] as const) {
    for (const L of tamanhos[id]) {
      const r = escalado(base[id], L);
      livros.set(`${id}:${L}`, {
        janelas: desenho.map(([, de, ate]) => livroDoFundo(r, de, ate)),
        sem5: livroDoFundo(r, INICIO, FIM_DESENHO, top5[id]),
      });
    }
  }
  console.log("\n== DESENHO (08/01/2024 a 31/03/2026) — a reserva ainda não foi rodada; teto de queda 50%, de hora em hora");
  type Candidata = { familia: "momento" | "fluxo" | "fundo"; L: number; mes: number };
  const elegiveis: Candidata[] = [];
  for (const familia of ["momento", "fluxo", "fundo"] as const) {
    for (const L of familias[familia]) {
      let ms: Medida[];
      let sem5: Medida;
      if (familia === "fundo") {
        const m = livros.get(`momento:${L}`)!;
        const f = livros.get(`fluxo:${L}`)!;
        ms = desenho.map(([, de, ate], k) => medida(fundoHorario([m.janelas[k], f.janelas[k]]), de, ate, m.janelas[k].e.recusadas + f.janelas[k].e.recusadas));
        sem5 = medida(fundoHorario([m.sem5, f.sem5]), INICIO, FIM_DESENHO);
      } else {
        const l = livros.get(`${familia}:${L}`)!;
        ms = desenho.map(([, de, ate], k) => medida(l.janelas[k].e.curva, de, ate, l.janelas[k].e.recusadas));
        sem5 = medida(l.sem5.e.curva, INICIO, FIM_DESENHO);
      }
      const ok = ms.every((m) => m.queda >= TETO) && sem5.ret > 0;
      if (ok) elegiveis.push({ familia, L, mes: ms[0].mes });
      console.log(
        `${`${familia} ×${L}`.padEnd(14)} ` + ms.map((m, k) => `${desenho[k][0]} ${fmt(m)}`).join(" · ") +
          ` · sem as 5 ${pct(sem5.ret)} · ${ms[0].recusadas} recusadas → ${ok ? "elegível" : "fora do teto"}`,
      );
    }
  }
  const escolhida = elegiveis.sort((a, b) => b.mes - a.mes)[0];
  if (!escolhida) {
    console.log("\nnenhuma variante cabe no teto de 50%: REPROVA sem chegar à reserva");
    return;
  }
  console.log(`\nescolhida pelo critério: ${escolhida.familia} ×${escolhida.L} (${pct(escolhida.mes)} ao mês no desenho)`);

  console.log("\n== RESERVA (01/04/2026 a 30/09/2026)");
  const naReserva = (familia: Candidata["familia"], L: number): Medida => {
    if (familia === "fundo") {
      const m = livroDoFundo(escalado(MOMENTO, L), FIM_DESENHO, FIM);
      const f = livroDoFundo(escalado(FLUXO, L), FIM_DESENHO, FIM);
      return medida(fundoHorario([m, f]), FIM_DESENHO, FIM, m.e.recusadas + f.e.recusadas);
    }
    const e = simular(escalado(base[familia], L), FIM_DESENHO, FIM);
    return medida(e.curva, FIM_DESENHO, FIM, e.recusadas);
  };
  const ref = naReserva(escolhida.familia, 1);
  const res = naReserva(escolhida.familia, escolhida.L);
  const aprovada = res.queda >= TETO && res.mes >= ref.mes;
  console.log(`${`${escolhida.familia} ×1`.padEnd(14)} ${fmt(ref)}`);
  console.log(`${`${escolhida.familia} ×${escolhida.L}`.padEnd(14)} ${fmt(res)} ← escolhida: ${aprovada ? "APROVADA" : "REPROVADA na reserva"}`);
  console.log("\n(registro, depois da decisão)");
  for (const familia of ["momento", "fluxo", "fundo"] as const) {
    for (const L of familias[familia]) {
      if (familia === escolhida.familia && (L === escolhida.L || L === 1)) continue;
      console.log(`${`${familia} ×${L}`.padEnd(14)} ${fmt(naReserva(familia, L))}`);
    }
  }

  // A META: a escolhida em tempo real — as grades no tamanho dela, o walk-forward de 365 dias.
  console.log(`\n== em tempo real, no tamanho escolhido (×${escolhida.L}): o walk-forward de 365 dias das grades`);
  const emTempo = new Map<string, { datas: number[]; r: number[] }>();
  for (const { livro, variantes } of GRADES) {
    if (escolhida.familia !== "fundo" && livro.id !== escolhida.familia) continue;
    const colunas: number[][] = [];
    let datas: number[] = [];
    for (const v of variantes) {
      const d = retornosDiarios(diaria(simular(escalado(v, escolhida.L), INICIO, FIM)));
      colunas.push(d.r);
      datas = d.datas;
    }
    const matriz = Array.from({ length: datas.length }, (_, t) => colunas.map((c) => c[t]));
    const wf = walkForward(matriz, datas, 365, 180);
    emTempo.set(livro.id, { datas: wf.datas, r: wf.r });
    const f = fichaDe(wf.r, wf.datas);
    console.log(`${livro.nome.padEnd(8)} desde ${new Date(wf.datas[0] - DIA).toISOString().slice(0, 10)}: ${pct(f.retorno)} (${pct(aoMes(f.retorno, wf.datas[0] - DIA, wf.datas[wf.datas.length - 1]))} ao mês, queda diária ${pct(f.quedaMaxima)}, Sharpe ${f.sharpe.toFixed(2)})`);
  }
  if (escolhida.familia === "fundo") {
    const ms = emTempo.get(MOMENTO.id)!;
    const fl = emTempo.get(FLUXO.id)!;
    const fr = paridadeDeRisco([ms.r, fl.r], ms.datas, 90, 20);
    const f = fichaDe(fr.r, ms.datas);
    console.log(`fundo    desde ${new Date(ms.datas[0] - DIA).toISOString().slice(0, 10)}: ${pct(f.retorno)} (${pct(aoMes(f.retorno, ms.datas[0] - DIA, ms.datas[ms.datas.length - 1]))} ao mês, queda diária ${pct(f.quedaMaxima)}, Sharpe ${f.sharpe.toFixed(2)})`);
  }
}

/**
 * O teste pré-registrado em `docs/preregistro-oi.md`, como está escrito lá: as
 * três variantes no DESENHO, a escolha pelo critério fixado, e só então a
 * RESERVA. A escolha é do código, não de quem olha — a reserva só roda
 * depois dela. Precisa de `npx tsx scripts/baixar-oi.mts` antes.
 */
async function estudarOI(invertido = false): Promise<void> {
  const { readdir: ler } = await import("node:fs/promises");
  const pasta = ".cache/oi";
  const series = new Map<string, Record<string, [number, number] | null>>();
  for (const arq of await ler(pasta)) series.set(arq.replace(/\.json$/, ""), JSON.parse(await readFile(`${pasta}/${arq}`, "utf8")));
  const diaDe = (t: number) => new Date(t).toISOString().slice(0, 10);
  let comDado = 0;
  let semDado = 0;
  const variacao = (symbol: string, t: number, campo: 0 | 1, dias: number): number | null => {
    const s = series.get(symbol);
    // O valor da decisão da meia-noite de D é a última linha do arquivo de D−1.
    const agora = s?.[diaDe(t - DIA)];
    const antes = s?.[diaDe(t - DIA - dias * DIA)];
    const a = agora?.[campo];
    const b = antes?.[campo];
    if (typeof a === "number" && typeof b === "number" && Number.isFinite(a) && Number.isFinite(b) && b > 0) {
      comDado++;
      return a / b - 1;
    }
    semDado++;
    return null;
  };
  const compra = MOMENTO.regras.pernas.find((p) => p.lado === "long")!;
  const comFiltro = (id: string, filtroOI: NonNullable<Perna["filtroOI"]>): Robo => ({
    ...MOMENTO,
    id,
    regras: { ...MOMENTO.regras, pernas: MOMENTO.regras.pernas.map((p) => (p === compra ? { ...p, filtroOI } : p)) },
  });
  const variantes: [string, Robo][] = [
    ["OI 7 d", comFiltro("oi7", { campo: "oi", janelaDias: 7 })],
    ["OI 14 d", comFiltro("oi14", { campo: "oi", janelaDias: 14 })],
    ["Top traders 7 d", comFiltro("top7", { campo: "top", janelaDias: 7 })],
  ];
  // As linhas do dia com o open interest junto: só as variantes leem, e o publicado as ignora.
  const original = linhasDoDia;
  const cacheOI = new Map<number, LinhaRanking[]>();
  linhasComOI = (i: number, janelaVol: number, comCorretora: boolean) => {
    const g = cacheOI.get(i);
    if (g) return g;
    const linhas = original(i, janelaVol, comCorretora);
    const t = INICIO_DADOS + i * HORA;
    const out = linhas.map((l) => ({
      ...l,
      oi: { oi7: variacao(l.symbol, t, 0, 7), oi14: variacao(l.symbol, t, 0, 14), top7: variacao(l.symbol, t, 1, 7) },
    }));
    cacheOI.set(i, out);
    return out;
  };

  const FIM_DESENHO = Date.parse("2026-04-01T00:00:00Z");
  if (invertido) {
    // `docs/preregistro-oi-invertido.md`: uma variante, julgada SÓ na reserva,
    // porque a ideia nasceu do desenho do teste anterior.
    const robo = comFiltro("oi7-caindo", { campo: "oi", janelaDias: 7, caindo: true });
    console.log("\n== OI 7 d CAINDO — o juiz é a reserva (01/04 a 30/09/2026)");
    const pub = simular(MOMENTO, FIM_DESENHO, FIM);
    const top = new Set([...porMoeda(pub).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s]) => s));
    const pubSem = simular(MOMENTO, FIM_DESENHO, FIM, top);
    const v = simular(robo, FIM_DESENHO, FIM);
    const vSem = simular(robo, FIM_DESENHO, FIM, top);
    const fmt = (e: EstadoRobo) => `${pct(e.patrimonio / CAPITAL_ROBO - 1)} (Sharpe ${sharpeDe(e.curva).toFixed(2)}, queda ${pct(e.quedaMaxima)})`;
    console.log(`publicado        ${fmt(pub)} · sem as 5 (${[...top].join(", ")}): ${pct(pubSem.patrimonio / CAPITAL_ROBO - 1)}`);
    console.log(`OI 7 d caindo    ${fmt(v)} · sem as 5: ${pct(vSem.patrimonio / CAPITAL_ROBO - 1)}`);
    const ok1 = sharpeDe(v.curva) > sharpeDe(pub.curva);
    const ok2 = vSem.patrimonio >= pubSem.patrimonio;
    console.log(`${ok1 ? "✓" : "✗"} Sharpe maior · ${ok2 ? "✓" : "✗"} sem as 5 não pior → ${ok1 && ok2 ? "CANDIDATA (não ligada)" : "REPROVADA"}`);
    console.log("\n== o desenho, CONTAMINADO (a ideia nasceu dele), só para o registro");
    for (const [nome, de, ate] of [["desenho", INICIO, FIM_DESENHO], ["1ª metade", INICIO, CORTE], ["2ª metade", CORTE, FIM_DESENHO]] as const) {
      console.log(`${nome.padEnd(10)} publicado ${fmt(simular(MOMENTO, de, ate))} · caindo ${fmt(simular(robo, de, ate))}`);
    }
    return;
  }
  const desenho: [string, number, number][] = [
    ["desenho", INICIO, FIM_DESENHO],
    ["1ª metade", INICIO, CORTE],
    ["2ª metade", CORTE, FIM_DESENHO],
  ];
  const linha = (nome: string, es: EstadoRobo[], sem5: EstadoRobo) =>
    console.log(
      `${nome.padEnd(16)} ` +
        es.map((e, k) => `${desenho[k][0]} ${pct(e.patrimonio / CAPITAL_ROBO - 1)} (Sharpe ${sharpeDe(e.curva).toFixed(2)})`).join(" · ") +
        ` · sem as 5: ${pct(sem5.patrimonio / CAPITAL_ROBO - 1)} · queda ${pct(es[0].quedaMaxima)}`,
    );

  console.log("\n== DESENHO (08/01/2024 a 31/03/2026) — a reserva ainda não foi rodada");
  const base = desenho.map(([, de, ate]) => simular(MOMENTO, de, ate));
  const top5 = new Set([...porMoeda(base[0]).entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([s]) => s));
  const baseSem5 = simular(MOMENTO, INICIO, FIM_DESENHO, top5);
  linha("publicado", base, baseSem5);
  const sb = base.map((e) => sharpeDe(e.curva));
  const aprovadas: { nome: string; robo: Robo; sharpe: number }[] = [];
  for (const [nome, robo] of variantes) {
    const es = desenho.map(([, de, ate]) => simular(robo, de, ate));
    const sem5 = simular(robo, INICIO, FIM_DESENHO, top5);
    linha(nome, es, sem5);
    const sv = es.map((e) => sharpeDe(e.curva));
    const criterios = [
      ["Sharpe do desenho maior", sv[0] > sb[0]],
      ["nenhuma metade pior", sv[1] >= sb[1] && sv[2] >= sb[2]],
      ["sem as 5 não pior", sem5.patrimonio >= baseSem5.patrimonio],
    ] as const;
    console.log(`                 ${criterios.map(([c, ok]) => `${ok ? "✓" : "✗"} ${c}`).join(" · ")}`);
    if (criterios.every(([, ok]) => ok)) aprovadas.push({ nome, robo, sharpe: sv[0] });
  }

  // A cobertura: em quantas linhas (moeda-dia, as três variações juntas) o dado existia.
  console.log(`open interest lido em ${pct(comDado / Math.max(1, comDado + semDado))} das variações moeda-dia do desenho; o resto passou sem filtro`);
  const escolhida = aprovadas.sort((a, b) => b.sharpe - a.sharpe)[0];
  console.log(escolhida ? `\nescolhida pelo critério: ${escolhida.nome}` : "\nnenhuma passou no desenho: o filtro REPROVA sem chegar à reserva");

  console.log("\n== RESERVA (01/04/2026 a 30/09/2026)");
  const reserva = (r: Robo) => simular(r, FIM_DESENHO, FIM);
  const rb = reserva(MOMENTO);
  console.log(`publicado        ${pct(rb.patrimonio / CAPITAL_ROBO - 1)} (Sharpe ${sharpeDe(rb.curva).toFixed(2)}, queda ${pct(rb.quedaMaxima)})`);
  for (const [nome, robo] of variantes) {
    const e = reserva(robo);
    const marca = escolhida?.robo === robo ? (sharpeDe(e.curva) >= sharpeDe(rb.curva) ? " ← escolhida: APROVADA" : " ← escolhida: REPROVADA na reserva") : " (registro)";
    console.log(`${nome.padEnd(16)} ${pct(e.patrimonio / CAPITAL_ROBO - 1)} (Sharpe ${sharpeDe(e.curva).toFixed(2)}, queda ${pct(e.quedaMaxima)})${marca}`);
  }
}

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
 * testou outras sem anotar: 300 até 10/10. O loop de melhoria somou as suas —
 * 14 variantes na rodada 1, 3 na 2 e 9 na 3 (`docs/preregistro-*.md`) —, e o N
 * do Sharpe deflacionado "da pesquisa" passou a 326.
 */
const TENTATIVAS_DA_PESQUISA = 300 + 14 + 3 + 9;
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
