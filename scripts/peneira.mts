/**
 * A assinatura aplicada a TODOS os perpétuos da Binance.
 *
 * Dois números bastam para reconhecer o perfil, e os dois saem de uma requisição
 * cada: amplitude do ciclo (máxima ÷ mínima em 200 dias) e open interest sobre
 * market cap. Medidos na lista conhecida, a mediana é 13,5x e 11,4% contra 1,5 a
 * 3x e 1 a 5% de um ativo com mercado de verdade.
 *
 * O que a peneira acha que a lista não tem: moedas no COMEÇO do ciclo. As 26
 * conhecidas já caíram — mediana de −62,7% do topo — porque foram apontadas
 * depois do estrago.
 *
 * Rode com: npm run peneira
 */

import { comLimite } from "../lib/limite";
import { ATIVAS } from "../lib/watchlist";

const BASE = "https://www.binance.com";

async function pegar<T>(caminho: string): Promise<T | null> {
  return comLimite("binance", 8, async () => {
    try {
      const r = await fetch(`${BASE}${caminho}`, { signal: AbortSignal.timeout(20_000) });
      if (!r.ok) return null;
      return (await r.json()) as T;
    } catch {
      return null;
    }
  });
}

interface Simbolo { symbol: string; status: string; contractType: string; quoteAsset: string }

const info = await pegar<{ symbols: Simbolo[] }>("/fapi/v1/exchangeInfo");
if (!info) {
  console.error("não consegui a lista de símbolos");
  process.exit(1);
}

const simbolos = info.symbols
  .filter((s) => s.status === "TRADING" && s.contractType === "PERPETUAL" && s.quoteAsset === "USDT")
  .map((s) => s.symbol);

console.log(`${simbolos.length} perpétuos de USDT na Binance · medindo…`);

interface Achado {
  symbol: string;
  amplitude: number;
  preco: number;
  mcap: number;
  oiUsd: number;
  oiSobreMcap: number;
  queda: number;
  diasDesdePico: number;
  circulante: number;
}

const t0 = Date.now();
let feitos = 0;

const achados = (
  await Promise.all(
    simbolos.map(async (symbol): Promise<Achado | null> => {
      const [velas, oi] = await Promise.all([
        pegar<string[][]>(`/fapi/v1/klines?symbol=${symbol}&interval=1d&limit=200`),
        pegar<Record<string, string>[]>(
          `/futures/data/openInterestHist?symbol=${symbol}&period=1d&limit=30`,
        ),
      ]);
      feitos++;
      if (feitos % 100 === 0) {
        process.stdout.write(`\r  ${feitos}/${simbolos.length} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      }
      if (!velas || velas.length < 40 || !oi || oi.length === 0) return null;

      const altas = velas.map((v) => Number(v[2]));
      const baixas = velas.map((v) => Number(v[3]));
      const fechamentos = velas.map((v) => Number(v[4]));
      const preco = fechamentos[fechamentos.length - 1];

      const maxima = Math.max(...altas);
      const minima = Math.min(...baixas.filter((x) => x > 0));
      if (!(minima > 0) || !(preco > 0)) return null;

      const iPico = altas.indexOf(maxima);
      const ultimo = oi[oi.length - 1];
      const circulante = Number(ultimo.CMCCirculatingSupply ?? 0);
      const oiUsd = Number(ultimo.sumOpenInterestValue ?? 0);
      if (!(circulante > 0) || !(oiUsd > 0)) return null;

      const mcap = circulante * preco;
      return {
        symbol,
        amplitude: maxima / minima,
        preco,
        mcap,
        oiUsd,
        oiSobreMcap: oiUsd / mcap,
        queda: preco / maxima - 1,
        diasDesdePico: velas.length - 1 - iPico,
        circulante,
      };
    }),
  )
).filter((x): x is Achado => x !== null);

console.log(`\r${achados.length} medidos em ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);

const AMPLITUDE = 4;
const OI_MCAP = 0.1;

const perfil = achados.filter((a) => a.amplitude >= AMPLITUDE && a.oiSobreMcap >= OI_MCAP);
const conhecidas = new Set(ATIVAS.map((t) => t.symbol));

const money = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(1)}bi` : v >= 1e6 ? `${(v / 1e6).toFixed(0)}mi` : `${(v / 1e3).toFixed(0)}k`;

console.log(
  `${perfil.length} de ${achados.length} entram no perfil (amplitude ≥ ${AMPLITUDE}x e OI ≥ ${OI_MCAP * 100}% do market cap)\n`,
);

const novas = perfil.filter((a) => !conhecidas.has(a.symbol));
const jaTem = perfil.filter((a) => conhecidas.has(a.symbol));

console.log(`--- ${novas.length} que NÃO estão no radar ---`);
console.log(`moeda          amplitude  OI/mcap   market cap    queda   dias do topo`);
for (const a of novas.sort((x, y) => y.oiSobreMcap - x.oiSobreMcap)) {
  console.log(
    `${a.symbol.replace("USDT", "").padEnd(14)} ${a.amplitude.toFixed(1).padStart(8)}x ` +
      `${(a.oiSobreMcap * 100).toFixed(0).padStart(6)}% ${money(a.mcap).padStart(11)} ` +
      `${(a.queda * 100).toFixed(0).padStart(7)}% ${String(a.diasDesdePico).padStart(11)}`,
  );
}

console.log(`\n--- ${jaTem.length} que já estão no radar ---`);
console.log(jaTem.map((a) => a.symbol.replace("USDT", "")).join(", "));

// As que ainda não caíram são as que interessam: a régua funciona antes do topo.
const cedo = novas.filter((a) => a.queda > -0.35);
if (cedo.length > 0) {
  console.log(`\n--- ${cedo.length} no perfil e AINDA NÃO caíram (menos de 35% do topo) ---`);
  for (const a of cedo.sort((x, y) => y.amplitude - x.amplitude)) {
    console.log(
      `${a.symbol.replace("USDT", "").padEnd(14)} ${a.amplitude.toFixed(1).padStart(8)}x ` +
        `${(a.oiSobreMcap * 100).toFixed(0).padStart(6)}% ${money(a.mcap).padStart(11)} ` +
        `${(a.queda * 100).toFixed(0).padStart(7)}% do topo, há ${a.diasDesdePico} dias`,
    );
  }
}
