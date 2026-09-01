/**
 * O estudo de cada moeda, medido e gravado.
 *
 * Roda `lib/estudo.ts` sobre a lista inteira e deixa o resultado em
 * `data/estudos.json`, que é o que a página lê. O cálculo é barato — uma
 * requisição de velas por moeda — mas é histórico, não muda de minuto em
 * minuto, e não tem por que ser refeito a cada visita.
 *
 * Rode com: npm run estudar
 *           npm run estudar BTW AKE     (só as pedidas)
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { estudar, type Estudo } from "../lib/estudo";
import { ATIVAS, findToken, type WatchedToken } from "../lib/watchlist";

const CAMINHO = "data/estudos.json";

const pedidos = process.argv.slice(2).map((s) => s.toUpperCase());
const alvos: WatchedToken[] = pedidos.length
  ? pedidos
      .map((p) => findToken(p) ?? findToken(`${p}USDT`))
      .filter((t): t is WatchedToken => Boolean(t))
  : ATIVAS;

const arquivo: { moedas: Record<string, Estudo> } = await readFile(CAMINHO, "utf8")
  .then((t) => JSON.parse(t))
  .catch(() => ({ moedas: {} }));

const t0 = Date.now();
const resultados = await Promise.all(
  alvos.map(async (t) => ({ symbol: t.symbol, estudo: await estudar(t.symbol).catch(() => null) })),
);

let medidas = 0;
let semAmostra = 0;
for (const { symbol, estudo } of resultados) {
  if (estudo) {
    arquivo.moedas[symbol] = estudo;
    medidas++;
  } else {
    semAmostra++;
  }
}

await mkdir("data", { recursive: true });
await writeFile(CAMINHO, `${JSON.stringify(arquivo, null, 2)}\n`);

const perfis = { devolve: 0, continua: 0, "sem memória": 0 };
for (const e of Object.values(arquivo.moedas)) perfis[e.perfil]++;

console.log(
  `${medidas} moedas estudadas em ${((Date.now() - t0) / 1000).toFixed(1)}s · ` +
    `${semAmostra} sem amostra suficiente\n`,
);
console.log("moeda        dias   vol/dia   perfil        melhor lag        sobe20%  cai20%  assim.");
for (const e of Object.values(arquivo.moedas).sort((a, b) => b.assimetria - a.assimetria)) {
  const lag = e.melhorLag
    ? `${String(e.melhorLag.lag).padStart(2)}d r=${e.melhorLag.r.toFixed(2).padStart(5)} ${e.melhorLag.sigmas.toFixed(1)}σ`
    : "—";
  console.log(
    e.ticker.padEnd(12),
    String(e.dias).padStart(5),
    (e.volDiaria * 100).toFixed(1).padStart(8) + "%",
    e.perfil.padEnd(13),
    lag.padEnd(17),
    (e.sobe20 * 100).toFixed(1).padStart(7),
    (e.cai20 * 100).toFixed(1).padStart(7),
    (Number.isFinite(e.assimetria) ? e.assimetria.toFixed(2) : "∞").padStart(7),
  );
}

console.log(
  `\nperfis: ${perfis.devolve} devolvem · ${perfis.continua} continuam · ` +
    `${perfis["sem memória"]} sem memória`,
);
console.log(`${CAMINHO} gravado`);
