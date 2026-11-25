/**
 * O estudo de uma moeda no ciclo do BTC (26/11/2026), a pedido, sobre a HBAR:
 * as pancadas (`lib/pancadas.ts`) contra o BTC e contra as outras altcoins,
 * o teste de "comprar depois da pancada" nas 30, o caminho depois do fundo de
 * 2022, e as ORDENS da moeda nas datas do BTC — data, preço, quantidade —, à
 * vista e com a vendida 1x, para conferir se é realista.
 *
 * Usa as velas de `.cache/ciclo-alt/` (rode antes `npx tsx
 * scripts/ciclo-altcoins.mts`). Grava `data/estudo-<moeda>.json`.
 *
 * Rode com: npx tsx scripts/estudar-moeda.mts HBAR
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { getCandles } from "../lib/bitstamp";
import { agendaDaPublicada, diasDasVelas, financiamentoDiario, quedaMaxima, simularComVendida, simularExposicao } from "../lib/cicloBtc";
import { estudarPancadas, porMes, resumoDosEventos, testarPancada, type DiaMoeda } from "../lib/pancadas";

const MOEDA = (process.argv[2] ?? "HBAR").toUpperCase();
const CACHE = ".cache/ciclo-alt";
if (!existsSync(`${CACHE}/${MOEDA}.json`)) throw new Error(`sem velas de ${MOEDA}: rode scripts/ciclo-altcoins.mts com ela na lista`);
const ler = (m: string): DiaMoeda[] => JSON.parse(readFileSync(`${CACHE}/${m}.json`, "utf8"));
const v = ler(MOEDA);
const outras = readdirSync(CACHE).map((f) => f.replace(".json", "")).filter((m) => m !== MOEDA);
const data = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const pct = (x: number) => `${x >= 0 ? "+" : ""}${(x * 100).toFixed(1)}%`;
const mediana = (a: number[]) => {
  const s = a.filter(Number.isFinite).sort((x, y) => x - y);
  return s.length ? s[Math.floor(s.length / 2)] : NaN;
};

// 1. A forma: a moeda, o BTC no mesmo período das altcoins (desde 08/2017) e a mediana das outras.
const btc = diasDasVelas(await getCandles("1d"));
const btcAlt = btc.filter((d) => d.t >= Date.UTC(2017, 7, 17) / 1000);
const est = estudarPancadas(v);
const estBtc = estudarPancadas(btcAlt);
const estOutras = outras.map((m) => ({ moeda: m, e: estudarPancadas(ler(m)) }));
const campos = ["volDia", "assimetria", "curtose", "segurar", "semOs10Melhores", "diasAcima20", "porAno", "outraEm60", "base60", "devolveEm90"] as const;
const medianaOutras = Object.fromEntries(campos.map((k) => [k, mediana(estOutras.map((o) => o.e[k]))]));
const posto = (k: (typeof campos)[number]) => [...estOutras.map((o) => o.e[k]), est[k]].sort((a, b) => b - a).indexOf(est[k]) + 1;
const postos = { assimetria: posto("assimetria"), porAno: posto("porAno"), curtose: posto("curtose"), de: estOutras.length + 1 };

console.log(`\n${MOEDA}: ${est.dias} dias desde ${data(v[0].t)}`);
const linha = (n: string, e: Record<string, number>) =>
  console.log(
    `  ${n.padEnd(18)} vol ${(e.volDia * 100).toFixed(1)}%/dia  assimetria ${e.assimetria.toFixed(2)}  pancadas ${e.porAno.toFixed(1)}/ano  outra em 60 d ${(e.outraEm60 * 100).toFixed(0)}% (base ${(e.base60 * 100).toFixed(0)}%)  segurar ${e.segurar.toFixed(2)}x, sem os 10 melhores dias ${e.semOs10Melhores.toFixed(3)}x`,
  );
linha(MOEDA, est as unknown as Record<string, number>);
linha("BTC (desde 08/2017)", estBtc as unknown as Record<string, number>);
linha(`mediana das ${outras.length}`, medianaOutras);
console.log(`  posto de ${MOEDA} entre ${postos.de}: assimetria ${postos.assimetria}º, pancadas por ano ${postos.porAno}º`);
console.log(`  as ${est.pancadas.length} semanas de pancada somam ${est.logPancadas.toFixed(2)} em log; a vida inteira, ${est.logTotal.toFixed(2)}: fora delas, ${Math.exp(est.logTotal - est.logPancadas).toFixed(3)}x`);

// 2. Comprar depois da pancada: nas 30 moedas, com o ataque.
const todas = [{ moeda: MOEDA, v }, ...outras.map((m) => ({ moeda: m, v: ler(m) }))];
const regra = [7, 30, 60, 90].map((k) => ({ k, ...resumoDosEventos(testarPancada(todas, k)), moeda: resumoDosEventos(testarPancada([{ moeda: MOEDA, v }], k)) }));
const ev30 = testarPancada(todas, 30);
const corte = Date.UTC(2022, 0, 1) / 1000;
const ordenados = [...ev30].sort((a, b) => b.x - a.x);
const referencia: number[] = [];
for (const o of todas) for (let i = 0; i + 30 < o.v.length; i += 7) referencia.push(o.v[i + 30].fecho / o.v[i].fecho - 1);
const ataque = {
  ate2021: resumoDosEventos(ev30.filter((e) => e.t < corte)),
  desde2022: resumoDosEventos(ev30.filter((e) => e.t >= corte)),
  semOs10: resumoDosEventos(ordenados.slice(10)),
  porMes: porMes(ev30),
  referencia: { media: referencia.reduce((a, b) => a + b, 0) / referencia.length, mediana: mediana(referencia) },
};
console.log("\ncomprar no fechamento da pancada (todas as moedas):");
for (const r of regra) console.log(`  ${String(r.k).padStart(2)} d: ${r.n} eventos, mediana ${pct(r.mediana)}, média ${pct(r.media)}, positivas ${(r.positivas * 100).toFixed(0)}% | ${MOEDA}: mediana ${pct(r.moeda.mediana)}, ${r.moeda.n} eventos`);
console.log(
  `  30 d, ataque: até 2021 média ${pct(ataque.ate2021.media)} (mediana ${pct(ataque.ate2021.mediana)}); 2022 em diante ${pct(ataque.desde2022.media)} (${pct(ataque.desde2022.mediana)}); sem os 10 melhores ${pct(ataque.semOs10.media)}; por mês ${pct(ataque.porMes.media)} (t ${ataque.porMes.t.toFixed(2)}); um dia qualquer ${pct(ataque.referencia.media)}`,
);

// 3. O caminho depois do fundo de 2022: quanto tempo até a primeira pancada, e o que houve no meio.
const fundo22 = Date.UTC(2022, 10, 21) / 1000;
const janela22 = v.filter((d) => Math.abs(d.t - fundo22) <= 180 * 86_400);
let fundo = janela22[0];
for (const d of janela22) if (d.baixa < fundo.baixa) fundo = d;
const primeira = est.pancadas.find((p) => p.ate > fundo.t) ?? null;
let entreMin = Infinity;
let entreMax = 0;
for (const d of v) if (d.t > fundo.t && primeira && d.t < primeira.de) {
  entreMin = Math.min(entreMin, d.baixa);
  entreMax = Math.max(entreMax, d.alta);
}
const depoisDoFundo = { fundo: { t: fundo.t, preco: fundo.baixa }, primeira: primeira ? { de: primeira.de, ate: primeira.ate, precoDe: primeira.precoDe, precoAte: primeira.precoAte } : null, dias: primeira ? Math.round((primeira.de - fundo.t) / 86_400) : null, entreMin, entreMax };
console.log(`\ndepois do fundo de 2022 (${data(fundo.t)} a ${fundo.baixa}): a primeira pancada começou ${depoisDoFundo.dias} dias depois; no meio, de ${entreMin} a ${entreMax}`);

// 4. As ordens da moeda nas datas do BTC — à vista e com a vendida 1x.
const fin = JSON.parse(readFileSync("data/btc-financiamento-diario.json", "utf8")) as { antes: number; dias: [number, number][] };
const taxa = financiamentoDiario(fin.dias.map(([t, r]) => ({ t: t * 1000, r })), fin.antes);
const pub = simularComVendida(btc, undefined, undefined, taxa);
const aVista = simularExposicao(v, agendaDaPublicada(pub, true), () => 0, 0.001, v[0].t);
const comVendida = simularExposicao(v, agendaDaPublicada(pub), taxa, 0.001, v[0].t);
const segurar = simularExposicao(v, [{ t: v[0].t, alvo: 1 }], () => 0, 0.001, v[0].t);
console.log(`\n${MOEDA} nas datas do BTC, US$ 10 mil em ${data(v[0].t)}: à vista ${(aVista.final / 1e4).toFixed(1)}x, com vendida ${(comVendida.final / 1e4).toFixed(1)}x, segurar ${(segurar.final / 1e4).toFixed(2)}x`);
for (const o of comVendida.operacoes) console.log(`  ${data(o.t)}  ${o.de} → ${o.alvo}  a ${o.preco}  patrimônio US$ ${Math.round(o.patrimonio)}`);

let ath = v[0];
for (const d of v) if (d.alta > ath.alta) ath = d;
writeFileSync(
  `data/estudo-${MOEDA.toLowerCase()}.json`,
  JSON.stringify(
    {
      moeda: MOEDA,
      geradoEm: new Date().toISOString(),
      desde: v[0].t,
      ate: v.at(-1)!.t,
      preco: v.at(-1)!.fecho,
      maxima: { t: ath.t, preco: ath.alta },
      estudo: { ...est, pancadas: est.pancadas },
      btc: { ...estBtc, pancadas: estBtc.pancadas.length },
      medianaOutras,
      outras: outras.length,
      postos,
      regra,
      ataque,
      depoisDoFundo,
      ordens: {
        aVista: { final: aVista.final, queda: quedaMaxima(aVista.curva), operacoes: aVista.operacoes },
        comVendida: { final: comVendida.final, queda: quedaMaxima(comVendida.curva), operacoes: comVendida.operacoes, liquidada: comVendida.curva.some((p) => p.patrimonio === 0) },
        segurar: { final: segurar.final, queda: quedaMaxima(segurar.curva) },
      },
    },
    null,
    1,
  ),
);
console.log(`\ngravado data/estudo-${MOEDA.toLowerCase()}.json`);
