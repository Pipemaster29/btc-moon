/**
 * O que estas moedas têm em comum, medido em vez de suposto.
 *
 * A lista foi montada por reconhecimento — alguém olhou e disse "estas são
 * manipuladas". Este script pergunta o que, exatamente, elas compartilham: quais
 * variáveis ficam apertadas no grupo (e portanto são características) e quais
 * ficam espalhadas (e portanto são acidente de cada moeda).
 *
 * A leitura útil não é a média, é a DISPERSÃO. Uma variável em que todas as
 * moedas caem na mesma faixa descreve a espécie; uma em que elas se espalham por
 * ordens de grandeza descreve indivíduos. Só a primeira serve para reconhecer a
 * próxima.
 *
 * Rode com: npm run assinatura
 */

import { getPanorama, type PanoramaRow } from "../lib/overview";

const rows = await getPanorama();

interface Variavel {
  nome: string;
  unidade: string;
  valor: (r: PanoramaRow) => number | null;
  /** Um valor que seria normal num ativo comum, para servir de contraste. */
  normal: string;
}

const variaveis: Variavel[] = [
  {
    nome: "amplitude do ciclo",
    unidade: "x",
    valor: (r) => r.vida?.amplitude ?? null,
    normal: "1,5 a 3x num ativo com mercado",
  },
  {
    nome: "float circulante",
    unidade: "%",
    valor: (r) => (r.vida?.floatToken == null ? null : r.vida.floatToken * 100),
    normal: "60 a 100% num token maduro",
  },
  {
    nome: "perpétuo ÷ pool",
    unidade: "x",
    valor: (r) => (r.perpDominance > 0 ? r.perpDominance : null),
    normal: "abaixo de 5x quando o preço se forma à vista",
  },
  {
    nome: "open interest ÷ market cap",
    unidade: "%",
    valor: (r) =>
      r.vida?.marketCap && r.vida.marketCap > 0
        ? (r.openInterestUsd / r.vida.marketCap) * 100
        : null,
    normal: "1 a 5% num ativo grande",
  },
  {
    nome: "queda desde o topo",
    unidade: "%",
    valor: (r) => (r.vida ? r.vida.queda * 100 : null),
    normal: "—",
  },
  {
    nome: "giro da pool",
    unidade: "x/dia",
    valor: (r) => (r.liquidityUsd > 0 ? r.volume24h / r.liquidityUsd : null),
    normal: "0,1 a 1x/dia",
  },
];

const LISTA = new Set(
  "TAC SYN UB BAS BP STABLE DEXE VVV BLUAI UAI BEAT HANA BR US CC CYS LAB SLX AGT SKYAI BTW GWEI VELVET ZEREBRO TAG".split(" "),
);

const grupo = rows.filter((r) => LISTA.has(r.ticker));
const resto = rows.filter((r) => !LISTA.has(r.ticker));

const quantil = (xs: number[], q: number) => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(s.length * q))];
};
const fmt = (v: number) =>
  Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);

console.log(
  `\n${grupo.length} moedas da lista com dados · ${resto.length} demais do radar como contraste\n`,
);
console.log(`variável                        n    p25   mediana     p75   dispersão  o normal seria`);
console.log("-".repeat(112));

for (const v of variaveis) {
  const xs = grupo.map(v.valor).filter((x): x is number => x !== null && Number.isFinite(x));
  if (xs.length < 4) continue;

  const p25 = quantil(xs, 0.25);
  const p50 = quantil(xs, 0.5);
  const p75 = quantil(xs, 0.75);
  // Dispersão relativa: quanto o quartil de cima é maior que o de baixo. Perto
  // de 1 significa que todas as moedas estão na mesma faixa.
  const disp = p25 !== 0 ? p75 / p25 : NaN;

  console.log(
    `${v.nome.padEnd(28)} ${String(xs.length).padStart(4)} ${fmt(p25).padStart(7)} ` +
      `${fmt(p50).padStart(9)} ${fmt(p75).padStart(7)}   ${(Number.isFinite(disp) ? fmt(disp) + "x" : "—").padStart(9)}   ${v.normal}`,
  );
}

// ------------------------------------------------------- moeda por moeda
console.log(`\n--- a lista, moeda por moeda ---`);
console.log(`moeda      amplitude  float  perp/pool  OI/mcap   market cap   queda   estágio`);
for (const r of grupo.sort((a, b) => (b.vida?.amplitude ?? 0) - (a.vida?.amplitude ?? 0))) {
  const v = r.vida;
  const mcap = v?.marketCap ?? 0;
  console.log(
    `${r.ticker.padEnd(10)} ${(v ? v.amplitude.toFixed(1) + "x" : "—").padStart(9)} ` +
      `${(v?.floatToken == null ? "—" : (v.floatToken * 100).toFixed(0) + "%").padStart(6)} ` +
      `${(r.perpDominance > 0 ? r.perpDominance.toFixed(0) + "x" : "—").padStart(10)} ` +
      `${(mcap > 0 ? ((r.openInterestUsd / mcap) * 100).toFixed(0) + "%" : "—").padStart(8)} ` +
      `${(mcap > 0 ? "US$ " + (mcap / 1e6).toFixed(0) + " mi" : "—").padStart(12)} ` +
      `${(v ? (v.queda * 100).toFixed(0) + "%" : "—").padStart(7)}   ${v?.estagio ?? "sem histórico"}`,
  );
}
