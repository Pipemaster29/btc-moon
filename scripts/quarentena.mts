/**
 * As linhas do histórico que NÃO são o preço do perpétuo daquela hora, para o
 * placar não medir em cima delas.
 *
 * A carteira julga cada linha contra as velas de 1h (`foraDoPerpetuo`, em
 * `lib/carteira.ts`), e isso tirou dela três "alvos" da HEI que o perpétuo nunca
 * tocou. O placar mede as MESMAS emissões e não toca em rede — leva dois
 * segundos e roda a cada fechamento —, então ele não tem as velas para julgar.
 * Este script faz o julgamento uma vez e grava a lista; o placar só a lê.
 *
 * Medido em 24/09 sobre as 131 mil linhas de 20/08 a 24/09: 471 fora, todas
 * de quatro moedas — HEI 220 (pool rasa a 1,6–2x o perpétuo), CAP 143 (pool
 * parada em US$ 0,07056 com o perpétuo a 0,048), SYN 106 (pool alheia a 8,19)
 * e JCT 2 (o 2,9e-27). As da SYN e do JCT o placar já barrava pelo salto de
 * dez vezes; as outras 363 passavam.
 *
 * NÃO PRECISA RODAR SEMPRE. Desde 24/09 o retrato só grava preço de pool que
 * caiba em 0,8–1,25 do último negócio do perpétuo (`lib/overview.ts`), então
 * linha nova fora dele não nasce mais. Rode de novo se o histórico ganhar
 * linhas de antes desse conserto que ainda não foram julgadas.
 *
 * Rode com: npm run quarentena   (precisa de `npm run dados` antes)
 */

import { readdir, readFile, writeFile } from "node:fs/promises";
import { velas } from "../lib/binance";
import { foraDoPerpetuo, type Passo } from "../lib/carteira";
import { comLimite } from "../lib/limite";

interface Linha {
  t: number;
  s: string;
  preco: number;
}

const linhas: Linha[] = [];
for (const f of (await readdir("data")).filter((x) => /^historico-\d{4}-\d{2}\.jsonl$/.test(x)).sort()) {
  for (const l of (await readFile(`data/${f}`, "utf8")).split("\n")) {
    if (!l.trim()) continue;
    try {
      const o = JSON.parse(l) as Linha;
      if (Number.isFinite(o.t) && Number.isFinite(o.preco) && o.preco > 0) linhas.push(o);
    } catch {
      // linha truncada: fica de fora aqui como fica no placar
    }
  }
}
if (linhas.length === 0) {
  console.error("histórico vazio: rode `npm run dados` antes");
  process.exit(1);
}

// Laço, e não `Math.min(...)`: armadilha nº 9.
let inicio = Infinity;
for (const l of linhas) if (l.t < inicio) inicio = l.t;
const porMoeda = new Map<string, Linha[]>();
for (const l of linhas) {
  const a = porMoeda.get(l.s);
  if (a) a.push(l);
  else porMoeda.set(l.s, [l]);
}

const HORA = 3_600_000;
const fora: string[] = [];
const contagem: Record<string, { fora: number; julgadas: number }> = {};
let semSerie = 0;

await Promise.all(
  [...porMoeda.keys()].map((s) =>
    // Teto baixo de propósito: são até três páginas de 1.500 velas por moeda,
    // peso 10 cada na Binance, e o orçamento é de 2.400 por minuto.
    comLimite("quarentena", 4, async () => {
      const passos: Passo[] = [];
      let de = inicio * 1000 - 2 * HORA;
      for (let pagina = 0; pagina < 6; pagina++) {
        const lote = await velas(`${s}USDT`, "1h", 1500, de).catch(() => []);
        for (const x of lote) {
          passos.push({
            abriuEm: x.time * 1000,
            fechouEm: x.time * 1000 + HORA,
            abertura: x.open,
            maxima: x.high,
            minima: x.low,
            fechamento: x.close,
          });
        }
        if (lote.length < 1500) break;
        de = (lote[lote.length - 1].time + 3600) * 1000;
      }
      if (passos.length === 0) {
        semSerie++;
        return;
      }
      const c = (contagem[s] = { fora: 0, julgadas: 0 });
      const indice = new Set(passos.map((p) => p.abriuEm));
      for (const l of porMoeda.get(s)!) {
        const hora = Math.floor((l.t * 1000) / HORA) * HORA;
        if (!indice.has(hora) && !indice.has(hora - HORA)) continue;
        c.julgadas++;
        if (foraDoPerpetuo(l.preco, passos, l.t * 1000)) {
          c.fora++;
          fora.push(`${l.t}|${l.s}`);
        }
      }
    }),
  ),
);

const julgadas = Object.values(contagem).reduce((a, c) => a + c.julgadas, 0);
const porMoedaFora = Object.fromEntries(
  Object.entries(contagem)
    .filter(([, c]) => c.fora > 0)
    .sort((a, b) => b[1].fora - a[1].fora),
);
await writeFile(
  "data/quarentena.json",
  `${JSON.stringify({ geradoEm: Date.now(), linhas: linhas.length, julgadas, porMoeda: porMoedaFora, fora: fora.sort() }, null, 1)}\n`,
);
console.log(
  `${linhas.length} linhas · ${julgadas} julgadas contra as velas · ${fora.length} fora do perpétuo · ` +
    `${semSerie} moeda(s) sem série`,
);
for (const [s, c] of Object.entries(porMoedaFora)) console.log(`  ${s.padEnd(12)} ${c.fora} de ${c.julgadas}`);
console.log("data/quarentena.json gravado");
