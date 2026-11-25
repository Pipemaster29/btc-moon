/**
 * As altcoins seguem as datas do ciclo do BTC? (25/11/2026, a pedido: "nessas
 * datas, existem algumas altcoins correlacionando? Que fazem topo e fundo perto
 * do bitcoin?")
 *
 * Duas perguntas, com as velas diárias à vista da Binance (sem chave, desde
 * 08/2017 — antes disso não há par USDT):
 *
 * 1. A DISTÂNCIA: para cada topo e fundo do BTC, o extremo da moeda num raio de
 *    180 dias, e quantos dias antes (−) ou depois (+) do BTC ele veio.
 * 2. A CARTEIRA: as decisões publicadas do BTC (`simularComVendida`: comprado,
 *    vendido 1x ou em caixa) aplicadas ao preço da moeda, contra segurar a
 *    moeda. O vendido recebe o financiamento do BTCUSDT, que é a suposição:
 *    o financiamento de cada moeda não foi baixado.
 *
 * Viés que não sai daqui: são moedas que EXISTEM hoje na Binance. As que
 * morreram no caminho (e no urso morrem muitas) não entram, e o "segurar"
 * delas teria sido zero.
 *
 * Grava `data/ciclo-altcoins.json`. Rode com: npx tsx scripts/ciclo-altcoins.mts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { getCandles } from "../lib/bitstamp";
import { diasDasVelas, financiamentoDiario, quedaMaxima, simularComVendida, simularExposicao, type DiaBtc } from "../lib/cicloBtc";

const MOEDAS = [
  "ETH", "BNB", "LTC", "XRP", "ADA", "TRX", "XLM", "LINK", "ETC", "NEO", "IOTA", "DASH", "ZEC", "QTUM", "BAT", "ICX", "ZRX", "ONT", "VET",
  "DOGE", "ATOM", "ALGO", "XTZ", "SOL", "AVAX", "DOT", "UNI", "FIL", "AAVE",
];
const DIA = 86_400;
const CACHE = ".cache/ciclo-alt";
mkdirSync(CACHE, { recursive: true });

async function velas(moeda: string): Promise<DiaBtc[] | null> {
  const arq = `${CACHE}/${moeda}.json`;
  const hoje = Math.floor(Date.now() / 1000 / DIA) * DIA;
  if (existsSync(arq)) {
    const c = JSON.parse(readFileSync(arq, "utf8")) as DiaBtc[];
    if (c.at(-1)!.t >= hoje - DIA) return c;
  }
  const saida: DiaBtc[] = [];
  let inicio = Date.UTC(2017, 7, 1);
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`https://www.binance.com/api/v3/klines?symbol=${moeda}USDT&interval=1d&limit=1000&startTime=${inicio}`);
    if (!res.ok) return saida.length ? saida : null;
    const lote = (await res.json()) as [number, string, string, string, string][];
    for (const k of lote) saida.push({ t: k[0] / 1000, alta: Number(k[2]), baixa: Number(k[3]), fecho: Number(k[4]) });
    if (lote.length < 1000) break;
    inicio = lote.at(-1)![0] + 1;
  }
  if (saida.length === 0) return null;
  writeFileSync(arq, JSON.stringify(saida));
  return saida;
}

// Os extremos do BTC (Bitstamp, máxima e mínima diárias). O fundo de 2026 é o
// de até hoje, não confirmado.
const EXTREMOS = [
  { tipo: "topo" as const, nome: "topo 12/2017", t: Date.UTC(2017, 11, 17) / 1000 },
  { tipo: "fundo" as const, nome: "fundo 12/2018", t: Date.UTC(2018, 11, 15) / 1000 },
  { tipo: "topo" as const, nome: "topo 11/2021", t: Date.UTC(2021, 10, 10) / 1000 },
  { tipo: "fundo" as const, nome: "fundo 11/2022", t: Date.UTC(2022, 10, 21) / 1000 },
  { tipo: "topo" as const, nome: "topo 10/2025", t: Date.UTC(2025, 9, 6) / 1000 },
  { tipo: "fundo" as const, nome: "fundo 11/2026 (até hoje)", t: Date.UTC(2026, 10, 21) / 1000 },
];
const RAIO = 180;

const btc = diasDasVelas(await getCandles("1d"));
const fin = JSON.parse(readFileSync("data/btc-financiamento-diario.json", "utf8")) as { antes: number; dias: [number, number][] };
const taxa = financiamentoDiario(
  fin.dias.map(([t, r]) => ({ t: t * 1000, r })),
  fin.antes,
);
// A exposição publicada do BTC, dia a dia: +1 comprado, −1 vendido, 0 caixa.
const pub = simularComVendida(btc, undefined, undefined, taxa);
const exposicao: { t: number; alvo: number }[] = [];
let anterior = NaN;
const abertas = new Set<number>();
for (const p of pub.pernas) for (let t = p.de; t < (p.ate ?? Infinity) && t <= btc.at(-1)!.t; t += DIA) abertas.add(t);
for (const l of pub.base.dias ?? []) {
  const alvo = l.comprado ? 1 : abertas.has(l.t) ? -1 : 0;
  if (alvo !== anterior) exposicao.push({ t: l.t, alvo });
  anterior = alvo;
}

const data = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const linhas: {
  moeda: string;
  desde: number;
  distancias: (number | null)[];
  quedas: (number | null)[];
  estrategia: number;
  soComprada: number;
  segurar: number;
  quedaEstrategia: number;
  quedaSegurar: number;
  liquidada: boolean;
}[] = [];
const fora: string[] = [];
for (const moeda of MOEDAS) {
  const v = await velas(moeda);
  if (!v || v.length < 365 * 3) {
    fora.push(moeda);
    continue;
  }
  const distancias = EXTREMOS.map((e) => {
    if (v[0].t > e.t - RAIO * DIA) return null; // a moeda não existia no raio inteiro
    const janela = v.filter((d) => Math.abs(d.t - e.t) <= RAIO * DIA);
    if (janela.length < RAIO) return null;
    let x = janela[0];
    for (const d of janela) if (e.tipo === "topo" ? d.alta > x.alta : d.baixa < x.baixa) x = d;
    return Math.round((x.t - e.t) / DIA);
  });
  // A queda do topo ao fundo seguinte, na moeda (fração do preço).
  const quedas = [0, 2, 4].map((i) => {
    const topo = EXTREMOS[i];
    const fundo = EXTREMOS[i + 1];
    if (v[0].t > topo.t - RAIO * DIA) return null;
    const max = Math.max(...v.filter((d) => Math.abs(d.t - topo.t) <= RAIO * DIA).map((d) => d.alta));
    const min = Math.min(...v.filter((d) => Math.abs(d.t - fundo.t) <= RAIO * DIA).map((d) => d.baixa));
    return min / max - 1;
  });
  const est = simularExposicao(v, exposicao, taxa, 0.001, v[0].t);
  const seg = simularExposicao(v, [{ t: v[0].t, alvo: 1 }], () => 0, 0.001, v[0].t);
  // A mesma data, sem a vendida: a parte que não liquida.
  const comprada = simularExposicao(v, exposicao.map((x) => ({ t: x.t, alvo: Math.max(0, x.alvo) })), taxa, 0.001, v[0].t);
  linhas.push({
    moeda,
    desde: v[0].t,
    distancias,
    quedas,
    estrategia: est.final / 10_000,
    soComprada: comprada.final / 10_000,
    segurar: seg.final / 10_000,
    quedaEstrategia: quedaMaxima(est.curva),
    quedaSegurar: quedaMaxima(seg.curva),
    liquidada: est.final === 0 || est.curva.some((p) => p.patrimonio === 0),
  });
}

// O BTC na mesma régua, para comparar: a mesma exposição desde 17/08/2017.
const inicioAlt = Date.UTC(2017, 7, 17) / 1000;
const btcEst = simularExposicao(btc, exposicao, taxa, 0.001, inicioAlt);
// O BTC só comprado nas mesmas datas, desde o começo de cada moeda: a régua de
// "valeu a pena trocar o BTC pela moeda?".
const soCompradaBtc = exposicao.map((x) => ({ t: x.t, alvo: Math.max(0, x.alvo) }));
const btcSoComprada = simularExposicao(btc, soCompradaBtc, taxa, 0.001, inicioAlt).final / 10_000;
const ganhamDoBtc = linhas.filter((l) => l.soComprada > simularExposicao(btc, soCompradaBtc, taxa, 0.001, l.desde).final / 10_000).map((l) => l.moeda);
console.log(`\nsó comprada, ganham do BTC só comprado no mesmo período: ${ganhamDoBtc.join(", ")} (${ganhamDoBtc.length} de ${linhas.length}); o BTC só comprado desde 08/2017: ${btcSoComprada.toFixed(1)}x`);
const btcSeg = simularExposicao(btc, [{ t: inicioAlt, alvo: 1 }], () => 0, 0.001, inicioAlt);

console.log(`\n${linhas.length} moedas lidas; fora (sem par ou menos de 3 anos): ${fora.join(", ") || "nenhuma"}`);
console.log("\ndias do extremo da moeda até o do BTC (− = antes), raio de 180 dias");
console.log(`  ${"".padEnd(6)} ${EXTREMOS.map((e) => e.nome.slice(0, 12).padStart(13)).join("")}   estratégia   segurar`);
for (const l of linhas)
  console.log(
    `  ${l.moeda.padEnd(6)} ${l.distancias.map((x) => (x === null ? "—" : String(x)).padStart(13)).join("")}  ${l.estrategia.toFixed(1).padStart(9)}x ${l.soComprada.toFixed(1).padStart(10)}x ${l.segurar.toFixed(1).padStart(8)}x${l.liquidada ? "  LIQUIDADA" : ""}`,
  );
const resumo = EXTREMOS.map((e, i) => {
  const xs = linhas.map((l) => l.distancias[i]).filter((x): x is number => x !== null).sort((a, b) => a - b);
  const perto = xs.filter((x) => Math.abs(x) <= 40).length;
  return { nome: e.nome, tipo: e.tipo, n: xs.length, mediana: xs.length ? xs[Math.floor(xs.length / 2)] : null, perto40: perto };
});
console.log("\npor extremo: mediana da distância e quantas a ±40 dias");
for (const r of resumo) console.log(`  ${r.nome.padEnd(26)} n ${String(r.n).padStart(2)}  mediana ${String(r.mediana).padStart(5)} d  a ±40 d: ${r.perto40} de ${r.n}`);
const batem = linhas.filter((l) => l.estrategia > l.segurar).length;
const batemComprada = linhas.filter((l) => l.soComprada > l.segurar).length;
const lucroComprada = linhas.filter((l) => l.soComprada > 1).length;
const medianaDe = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
console.log(`\nsó comprada nas datas do BTC: bate o segurar em ${batemComprada} de ${linhas.length}; com lucro em ${lucroComprada}; mediana ${medianaDe(linhas.map((l) => l.soComprada)).toFixed(1)}x contra ${medianaDe(linhas.map((l) => l.segurar)).toFixed(1)}x segurando`);
const lucro = linhas.filter((l) => l.estrategia > 1).length;
console.log(`\na carteira do BTC nas moedas: bate o segurar em ${batem} de ${linhas.length}; termina com lucro em ${lucro}; liquidadas: ${linhas.filter((l) => l.liquidada).map((l) => l.moeda).join(", ") || "nenhuma"}`);
console.log(`  o BTC na mesma régua desde ${data(inicioAlt)}: ${(btcEst.final / 10_000).toFixed(1)}x contra ${(btcSeg.final / 10_000).toFixed(1)}x segurando`);

writeFileSync(
  "data/ciclo-altcoins.json",
  JSON.stringify(
    {
      geradoEm: new Date().toISOString(),
      fonte: "Binance à vista, velas diárias USDT",
      raio: RAIO,
      extremos: EXTREMOS,
      linhas,
      resumo,
      soComprada: { batem: batemComprada, lucro: lucroComprada, mediana: medianaDe(linhas.map((l) => l.soComprada)), medianaSegurar: medianaDe(linhas.map((l) => l.segurar)) },
      comVendida: { batem, lucro, liquidadas: linhas.filter((l) => l.liquidada).map((l) => l.moeda) },
      fora,
      btc: { estrategia: btcEst.final / 10_000, soComprada: btcSoComprada, segurar: btcSeg.final / 10_000, desde: inicioAlt },
      ganhamDoBtc,
    },
    null,
    1,
  ),
);
console.log("\ngravado data/ciclo-altcoins.json");
