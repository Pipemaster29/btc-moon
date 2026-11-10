/**
 * A PREVISÃO DE HOJE: a nota de cada moeda do universo, com os pesos que a
 * medição gravou (`data/previsao-medicao.json`), e a leitura do BTC. Grava
 * `data/previsao.json` (na branch `dados`). Não ajusta nada: os pesos e o
 * modelo são os medidos — um motor só, como nos robôs (`lib/previsao.ts`).
 *
 * UMA VEZ POR DIA UTC: as entradas são de fechamentos diários, e a nota só muda
 * quando um dia fecha. Nas outras rodadas o script sai na hora.
 *
 * O CUSTO: uma vela diária por perpétuo USDT de moeda (~530 pedidos, 50 velas
 * cada) e o financiamento de 7 dias só das que passam na régua de volume
 * (~130). "Não consegui" não vira "não achei": com menos de 90% das moedas
 * respondendo, não grava — o posto de cada entrada é contra o universo, e meio
 * universo dá outro ranking.
 *
 * Rode com: npm run previsao   (`-- --agora` refaz mesmo já tendo a de hoje)
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { getCandles } from "../lib/bitstamp";
import { ENTRADAS, entradasDaMoeda, entradasDoBtc, notaDe, prever, universoDoDia, VOLUME_MINIMO, type ArquivoPrevisao, type MedicaoPrevisao, type MoedaPrevista, type SerieDiaria } from "../lib/previsao";

const ARQUIVO = "data/previsao.json";
const MEDICAO = "data/previsao-medicao.json";
const DIA = 86_400_000;
const BASE = "https://www.binance.com";

if (!existsSync(MEDICAO)) {
  console.log(`previsão: sem ${MEDICAO} — rode npm run medir-previsao`);
  process.exit(0);
}
const medicao = JSON.parse(await readFile(MEDICAO, "utf8")) as MedicaoPrevisao;
const hoje = Math.floor(Date.now() / DIA);
if (existsSync(ARQUIVO) && !process.argv.includes("--agora")) {
  try {
    const a = JSON.parse(await readFile(ARQUIVO, "utf8")) as ArquivoPrevisao;
    if (a.dia === hoje * DIA) {
      console.log("previsão: a de hoje já existe — a próxima sai quando o dia UTC virar");
      process.exit(0);
    }
  } catch {
    // Arquivo ilegível é refeito: ele é recálculo, não estado.
  }
}

async function pegar<T>(caminho: string): Promise<T | null> {
  for (let tentativa = 0; tentativa < 3; tentativa++) {
    try {
      const res = await fetch(`${BASE}${caminho}`, { signal: AbortSignal.timeout(20_000) });
      if (res.ok) return (await res.json()) as T;
      // 418 e 429 são a Binance pedindo para parar: insistir piora.
      if (res.status === 418 || res.status === 429) return null;
    } catch {
      // tenta de novo
    }
    await new Promise((r) => setTimeout(r, 800 * (tentativa + 1)));
  }
  return null;
}

async function emParalelo<T>(itens: readonly T[], n: number, f: (x: T) => Promise<void>): Promise<void> {
  const fila = [...itens];
  await Promise.all(
    Array.from({ length: n }, async () => {
      for (;;) {
        const x = fila.shift();
        if (x === undefined) return;
        await f(x);
      }
    }),
  );
}

// ------------------------------------------------------------------ as moedas

const info = await pegar<{ symbols: { symbol: string; contractType: string; status: string; quoteAsset: string }[] }>("/fapi/v1/exchangeInfo");
if (!info) {
  console.log("previsão: a Binance não devolveu a lista de perpétuos — nada gravado");
  process.exit(0);
}
// Só perpétuo USDT de moeda, negociando: os de ação e de metal (`TRADIFI_PERPETUAL`) não entram, como nos robôs.
const simbolos = info.symbols.filter((s) => s.status === "TRADING" && s.contractType === "PERPETUAL" && s.quoteAsset === "USDT").map((s) => s.symbol);
const series: SerieDiaria[] = [];
await emParalelo(simbolos, 8, async (symbol) => {
  const k = await pegar<(string | number)[][]>(`/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=1d&limit=50`);
  if (!k) return;
  // O dia de hoje ainda está aberto: só os fechados entram.
  const fechados = k.filter((v) => Math.floor(Number(v[0]) / DIA) < hoje);
  if (fechados.length === 0) return;
  const d0 = Math.floor(Number(fechados[0][0]) / DIA);
  const n = hoje - d0;
  const s: SerieDiaria = { symbol, d0, c: new Array(n).fill(NaN), qv: new Array(n).fill(NaN), tb: new Array(n).fill(NaN), fr: new Array(n).fill(NaN) };
  for (const v of fechados) {
    const i = Math.floor(Number(v[0]) / DIA) - d0;
    s.c[i] = Number(v[4]);
    s.qv[i] = Number(v[7]);
    s.tb[i] = Number(v[10]);
  }
  series.push(s);
});
if (series.length < 0.9 * simbolos.length) {
  console.log(`previsão: só ${series.length} de ${simbolos.length} perpétuos responderam — nada gravado, o ranking é contra o universo inteiro`);
  process.exit(0);
}

// O financiamento só das que passam na régua de volume: são elas que entram no universo.
const noUniverso = series.filter((s) => (entradasDaMoeda(s, hoje)?.volume ?? 0) >= VOLUME_MINIMO);
let semFinanciamento = 0;
await emParalelo(noUniverso, 8, async (s) => {
  const f = await pegar<{ fundingTime: number; fundingRate: string }[]>(`/fapi/v1/fundingRate?symbol=${encodeURIComponent(s.symbol)}&startTime=${(hoje - 8) * DIA}&limit=200`);
  if (!f) {
    semFinanciamento++;
    return;
  }
  for (const x of f) {
    const i = Math.floor(Number(x.fundingTime) / DIA) - s.d0;
    const taxa = Number(x.fundingRate);
    if (i >= 0 && i < s.fr.length && Number.isFinite(taxa)) s.fr[i] = (Number.isFinite(s.fr[i]) ? s.fr[i] : 0) + taxa;
  }
});

const pesos = medicao.moedas.pesos;
const linhas = universoDoDia(series, hoje);
const porSimbolo = new Map(series.map((s) => [s.symbol, s]));
const comNota = linhas.map((l) => ({ l, nota: notaDe(l.p, pesos) })).sort((a, b) => b.nota - a.nota);
const moedas: MoedaPrevista[] = comNota.map(({ l, nota }, posicao) => {
  const s = porSimbolo.get(l.symbol) as SerieDiaria;
  return {
    symbol: l.symbol,
    nota,
    // O décimo dentro do universo de hoje: 9 é o de cima.
    decimo: Math.min(9, Math.floor(((comNota.length - 1 - posicao) * 10) / comNota.length)),
    preco: s.c[s.c.length - 1],
    volume: l.volume,
    x: l.x,
    contribuicao: ENTRADAS.map((_, k) => pesos[k] * l.p[k]),
  };
});

// ------------------------------------------------------------------ o BTC

let btc: ArquivoPrevisao["btc"] = null;
try {
  const velas = (await getCandles("1d")).filter((v) => (v.time + 86_400) * 1000 <= Date.now());
  const fech = velas.map((v) => v.close);
  const i = fech.length - 1;
  // O índice de medo da véspera: o de hoje sai junto com a decisão.
  const res = await fetch("https://api.alternative.me/fng/?limit=3", { signal: AbortSignal.timeout(20_000) });
  const fng = (await res.json()) as { data: { value: string; timestamp: string }[] };
  const ontem = new Date(velas[i].time * 1000).toISOString().slice(0, 10);
  const doDia = fng.data.find((x) => new Date(Number(x.timestamp) * 1000).toISOString().slice(0, 10) === ontem);
  const x = doDia ? entradasDoBtc(fech, i, Math.max(...fech), Number(doDia.value)) : null;
  if (x) btc = { preco: fech[i], p30: prever(medicao.btc.modelo, x), taxaBase: medicao.btc.taxaBase, x, medoDe: ontem };
  else console.log("previsão: sem o índice de medo da véspera — o BTC fica sem leitura");
} catch (e) {
  console.log(`previsão: o BTC ficou sem leitura (${(e as Error).message})`);
}

const saida: ArquivoPrevisao = { geradoEm: Date.now(), dia: hoje * DIA, moedas, listadas: simbolos.length, btc };
await mkdir("data", { recursive: true });
await writeFile(ARQUIVO, `${JSON.stringify(saida)}\n`);
console.log(
  `previsão: ${moedas.length} moedas no universo de ${simbolos.length} perpétuos${semFinanciamento ? ` (${semFinanciamento} sem o financiamento)` : ""} · ` +
    `nota mais alta: ${moedas.slice(0, 6).map((m) => m.symbol.replace(/USDT$/, "")).join(", ")} · mais baixa: ${moedas.slice(-6).map((m) => m.symbol.replace(/USDT$/, "")).join(", ")}` +
    (btc ? ` · BTC US$ ${btc.preco.toFixed(0)}, modelo ${(btc.p30 * 100).toFixed(0)}% contra ${(btc.taxaBase * 100).toFixed(0)}% da taxa-base` : ""),
);
