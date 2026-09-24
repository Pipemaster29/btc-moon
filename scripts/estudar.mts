/**
 * O estudo de cada moeda, medido e gravado.
 *
 * Roda `lib/estudo.ts` sobre a lista inteira e deixa o resultado em
 * `data/estudos.json`, que é o que a página lê. O cálculo é barato — uma
 * requisição de velas por moeda — mas é histórico, não muda de minuto em
 * minuto, e não tem por que ser refeito a cada visita.
 *
 * Rode com: npm run estudar
 *           npm run estudar BTW AKE          (só as pedidas)
 *           npm run estudar -- --em-vista    (só as em vista, sem tocar nas da lista)
 *
 * AS EM VISTA ENTRAM (`lib/emvista.ts`), e precisam: o estudo tira a direção
 * da leitura quando a moeda CONTINUA o movimento em vez de devolvê-lo
 * (`contradizAFase` em `lib/lifecycle.ts`), e isso vale para 8 das 70 da lista
 * no estudo de 03/09. Sem estudo, a em vista recebia a call que a lista não
 * receberia. Elas vêm do estado do fluxo que o `npm run dados` traz; a que
 * entrar depois fica sem estudo até a próxima rodada deste script.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { estudar, type Estudo } from "../lib/estudo";
import { ATIVAS, findToken, type WatchedToken } from "../lib/watchlist";
import { getEmVista } from "../lib/emvista";

const CAMINHO = "data/estudos.json";

const soEmVista = process.argv.includes("--em-vista");
const pedidos = process.argv.slice(2).filter((a) => !a.startsWith("--")).map((s) => s.toUpperCase());
const emVista = await getEmVista().catch(() => []);
const achar = (s: string) => findToken(s) ?? emVista.find((t) => t.symbol === s);
const alvos: WatchedToken[] = soEmVista
  ? emVista
  : pedidos.length
    ? pedidos.map((p) => achar(p) ?? achar(`${p}USDT`)).filter((t): t is WatchedToken => Boolean(t))
    : [...ATIVAS, ...emVista];
if (soEmVista && emVista.length === 0) {
  console.error("nenhuma moeda em vista: rode `npm run dados` antes, para trazer o estado do fluxo");
  process.exit(1);
}

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
