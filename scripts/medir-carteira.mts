/**
 * A bancada da gestão da carteira: qualquer lista de regimes sobre as MESMAS
 * calls e o MESMO caminho de velas, com as colunas que decidem se uma regra
 * entra (`docs/preregistro-carteira.md`).
 *
 * `npm run carteira` imprime a tabela de regimes a cada retrato, mas ela é a
 * do que já está decidido. Aqui é onde se pergunta: os vizinhos de cada número
 * (platô, e não pico), "sem as 3 melhores moedas" e a janela POSTERIOR — a
 * carteira começando do zero em 29/09, depois da data em que as ideias de
 * setembro foram olhadas.
 *
 * As velas ficam em `.cache/carteira/velas.json` (uma requisição por moeda na
 * primeira vez; `--velas-novas` baixa de novo). Não grava nada em `data/`.
 *
 * Rode com: npm run dados && npm run medir-carteira
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { rodar, CAPITAL_INICIAL, REGRAS, type Carteira, type Emissao, type Passo, type Regras } from "../lib/carteira";
import { intervalosDeFunding, velasDesde } from "../lib/binance";
import { ATIVAS } from "../lib/watchlist";
import { ARQUIVO_HISTORICO } from "../lib/historico";

/** O mesmo começo de `scripts/carteira.mts`. */
const COMECO = Date.parse("2026-09-02T20:00:00Z");
/** As ideias de setembro foram olhadas até 28/09: daqui em diante é dado que elas não viram. */
const POSTERIOR = Date.parse("2026-09-29T00:00:00Z");
const CACHE = ".cache/carteira";
const args = process.argv.slice(2);

const emissoes: Emissao[] = [];
for (const f of (await readdir("data")).filter((f) => ARQUIVO_HISTORICO.test(f)).sort()) {
  for (const linha of (await readFile(`data/${f}`, "utf8")).split("\n")) {
    if (!linha.trim()) continue;
    try {
      emissoes.push(JSON.parse(linha) as Emissao);
    } catch {
      // linha truncada: como em `scripts/carteira.mts`
    }
  }
}

const porTicker = new Map(ATIVAS.map((t) => [t.symbol.replace(/USDT$/, ""), t.symbol]));
for (const e of emissoes) if (e.origem && !porTicker.has(e.s)) porTicker.set(e.s, `${e.s}USDT`);
const candidatas = new Set(
  emissoes
    .filter((e) => e.t * 1000 >= COMECO && (e.vies === "long" || e.vies === "short") && e.forca != null && porTicker.has(e.s))
    .map((e) => e.s),
);

// O período do financiamento de cada moeda, como no script da carteira. Sem a
// resposta da Binance a bancada PARA: com 8 h no lugar de 4 h o custo de
// carregar muda e a tabela deixa de ser a do publicado.
const intervalos = await intervalosDeFunding();
if (!intervalos) throw new Error("a Binance não devolveu os períodos de financiamento — rode de novo");
for (const e of emissoes) if (candidatas.has(e.s)) e.fh = intervalos.get(porTicker.get(e.s)!) ?? 8;

await mkdir(CACHE, { recursive: true });
const ARQ = `${CACHE}/velas.json`;
let caminho = new Map<string, Passo[]>();
if (existsSync(ARQ) && !args.includes("--velas-novas")) {
  caminho = new Map(Object.entries(JSON.parse(await readFile(ARQ, "utf8")) as Record<string, Passo[]>));
} else {
  let semVelas = 0;
  await Promise.all(
    [...candidatas].map(async (ticker) => {
      const { velas: v } = await velasDesde(porTicker.get(ticker)!, "1h", COMECO - 3_600_000).catch(() => ({ velas: [] }));
      if (v.length === 0) {
        semVelas++;
        return;
      }
      caminho.set(
        ticker,
        v
          .filter((x) => (x.time + 3600) * 1000 >= COMECO)
          .map((x) => ({ abriuEm: x.time * 1000, fechouEm: (x.time + 3600) * 1000, abertura: x.open, maxima: x.high, minima: x.low, fechamento: x.close })),
      );
    }),
  );
  console.log(`velas: ${caminho.size} de ${candidatas.size} moedas · ${semVelas} sem série`);
  await writeFile(ARQ, JSON.stringify(Object.fromEntries(caminho)));
}

// As velas e as emissões terminam no mesmo instante: vela além da última
// emissão não muda nada, mas a última emissão é o fim da janela.
const FIM = emissoes.reduce((m, e) => Math.max(m, e.t * 1000), 0);
const MEIO = COMECO + (FIM - COMECO) / 2;
const antesDoMeio = emissoes.filter((e) => e.t * 1000 < MEIO);

/** O retorno tirando as `n` moedas que mais deram dinheiro (ver `semAMelhor` em `scripts/carteira.mts`). */
function semAsMelhores(x: Carteira, n: number): number {
  const porMoeda = new Map<string, number>();
  for (const f of x.fechadas) porMoeda.set(f.symbol, (porMoeda.get(f.symbol) ?? 0) + f.resultado);
  for (const p of x.abertas) porMoeda.set(p.symbol, (porMoeda.get(p.symbol) ?? 0) + p.valor * p.retorno);
  const ganhos = [...porMoeda.values()].filter((v) => v > 0).sort((a, b) => b - a).slice(0, n);
  return (x.patrimonio - ganhos.reduce((a, b) => a + b, 0)) / CAPITAL_INICIAL - 1;
}

const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

interface Linha {
  nome: string;
  inteira: number;
  sem1: number;
  sem3: number;
  queda: number;
  n: number;
  m1: number;
  m2: number;
  post: number;
  postSem1: number;
}

function medir(nome: string, regras: Regras): Linha {
  const t = rodar(emissoes, COMECO, caminho, regras);
  const p = rodar(emissoes, POSTERIOR, caminho, regras);
  return {
    nome,
    inteira: t.retorno,
    sem1: semAsMelhores(t, 1),
    sem3: semAsMelhores(t, 3),
    queda: t.quedaMaxima,
    n: t.encerradas,
    m1: rodar(antesDoMeio, COMECO, caminho, regras).retorno,
    m2: rodar(emissoes, MEIO, caminho, regras).retorno,
    post: p.retorno,
    postSem1: semAsMelhores(p, 1),
  };
}

const rf = REGRAS.riscoPorForca;
const GRUPOS: [string, [string, Regras][]][] = [
  ["publicado", [["publicado", REGRAS]]],
  [
    "1. filtro de varejo na entrada",
    [3, 3.5, 4, 5].map((v) => [`varejo ≤ ${v}`, { ...REGRAS, varejoMaxEntrada: v }] as [string, Regras]),
  ],
  ["2. stop", [0.15, 0.2, 0.3].map((s) => [`stop ${s * 100}%`, { ...REGRAS, stopComprado: s, stopVendido: s }] as [string, Regras])],
  [
    "3. deixar correr",
    [
      ...[0.15, 0.2, 0.3].map((d) => [`rastro liga +40%, ${d * 100}% atrás`, { ...REGRAS, alvo: null, rastro: { ativa: 0.4, distancia: d } }] as [string, Regras]),
      ["alvo 60%", { ...REGRAS, alvo: 0.6 }],
      ["alvo 80%", { ...REGRAS, alvo: 0.8 }],
    ],
  ],
  ["4. sem reação", [2, 4, 5].map((d) => [`sem reação ${d} d`, { ...REGRAS, semReacaoDias: d }] as [string, Regras])],
  [
    "5. o risco na força que paga",
    [
      ...[0.025, 0.03, 0.04].map((x) => [`força 2 a ${x * 100}%`, { ...REGRAS, riscoPorForca: { ...rf, 2: x } }] as [string, Regras]),
      ["força 1 a 0,5%", { ...REGRAS, riscoPorForca: { ...rf, 1: 0.005 } }],
    ],
  ],
  ["6. confirmar a entrada", [0.5, 1, 2].map((h) => [`entrada ${h} h`, { ...REGRAS, confirmacaoEntradaH: h }] as [string, Regras])],
];

// `--combinar a+b`: as variantes nomeadas, juntas — só para as que passaram sozinhas.
const k = args.indexOf("--combinar");
if (k >= 0) {
  const todas = new Map(GRUPOS.flatMap(([, vs]) => vs));
  const linhas: [string, Regras][] = [];
  for (const combo of args.slice(k + 1)) {
    let regras = REGRAS;
    for (const nome of combo.split("+")) {
      const v = todas.get(nome.trim());
      if (!v) throw new Error(`variante desconhecida: ${nome}`);
      // Só o que a variante muda em relação ao publicado entra na soma.
      const muda = Object.fromEntries(Object.entries(v).filter(([c, x]) => JSON.stringify(x) !== JSON.stringify(REGRAS[c as keyof Regras])));
      regras = { ...regras, ...muda };
    }
    linhas.push([combo, regras]);
  }
  GRUPOS.splice(1, GRUPOS.length - 1, ["combinações", linhas]);
}

console.log(
  `\n${emissoes.length} emissões · ${caminho.size} moedas com vela · de ${new Date(COMECO).toISOString().slice(0, 10)} a ${new Date(FIM).toISOString().slice(0, 16)} · ` +
    `meio ${new Date(MEIO).toISOString().slice(0, 10)} · posterior desde ${new Date(POSTERIOR).toISOString().slice(0, 10)}\n`,
);
console.log(
  `${"regime".padEnd(30)} ${"inteira".padStart(8)} ${"sem 1".padStart(8)} ${"sem 3".padStart(8)} ${"queda".padStart(8)} ${"n".padStart(4)} ` +
    `${"1ª met".padStart(8)} ${"2ª met".padStart(8)} ${"post".padStart(8)} ${"post s/1".padStart(9)}`,
);
for (const [grupo, variantes] of GRUPOS) {
  if (grupo !== "publicado") console.log(`\n${grupo}`);
  for (const [nome, regras] of variantes) {
    const l = medir(nome, regras);
    console.log(
      `${`  ${l.nome}`.padEnd(30)} ${pct(l.inteira).padStart(8)} ${pct(l.sem1).padStart(8)} ${pct(l.sem3).padStart(8)} ${pct(l.queda).padStart(8)} ${String(l.n).padStart(4)} ` +
        `${pct(l.m1).padStart(8)} ${pct(l.m2).padStart(8)} ${pct(l.post).padStart(8)} ${pct(l.postSem1).padStart(9)}`,
    );
  }
}
