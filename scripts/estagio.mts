/**
 * A lista inteira, classificada por onde cada moeda está na própria vida.
 *
 * Rode com: npm run estagio
 */

import { lerVida, lerVies, type Estagio, type Vida, type Vies } from "../lib/lifecycle";
import { getOverview } from "../lib/overview";
import { ATIVAS } from "../lib/watchlist";

const overview = await getOverview();
const preco = new Map(overview.map((r) => [r.symbol, r.price]));
const linha = new Map(overview.map((r) => [r.symbol, r]));

const vidas = (
  await Promise.all(
    ATIVAS.map((t) => lerVida(t, preco.get(t.symbol) ?? 0).catch(() => null)),
  )
).filter((v): v is Vida => v !== null);

// A ordem dos estágios é a do ciclo, não alfabética: lida de cima para baixo,
// a tabela conta a história de uma moeda do começo ao fim.
const ORDEM: Estagio[] = [
  "nunca subiu",
  "subindo",
  "no topo",
  "caindo do topo",
  "ressuscitando",
  "em queda longa",
  "exausta",
  "de lado",
];

const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;

for (const estagio of ORDEM) {
  const grupo = vidas.filter((v) => v.estagio === estagio);
  if (grupo.length === 0) continue;

  console.log(`\n${"=".repeat(78)}\n${estagio.toUpperCase()}  (${grupo.length})\n${"=".repeat(78)}`);
  console.log(`moeda        preço      topo   dias   queda   desde fundo  amplitude  CEX%   perp/pool  atenção`);

  for (const v of grupo.sort((a, b) => b.altaDesdeFundo - a.altaDesdeFundo)) {
    const o = linha.get(v.symbol);
    console.log(
      `${v.ticker.padEnd(12)} ${v.preco.toPrecision(4).padStart(9)} ${v.picoEm.slice(5)} ` +
        `${String(v.diasDesdePico).padStart(5)} ${pct(v.queda).padStart(7)} ${pct(v.altaDesdeFundo).padStart(12)} ` +
        `${v.amplitude.toFixed(1).padStart(9)}x ${(v.floatCex === null ? "—" : (v.floatCex * 100).toFixed(2)).padStart(6)} ` +
        `${(o ? `${o.perpDominance.toFixed(0)}x` : "—").padStart(10)} ${o ? o.score : 0}`,
    );
  }
}

// ------------------------------------------------------- o cruzamento
const leituras = vidas.map((v) => {
  const o = linha.get(v.symbol);
  return {
    vida: v,
    score: o?.score ?? 0,
    leitura: lerVies(v, {
      moveKind: o?.moveKind ?? null,
      moveChange: o?.moveChange ?? 0,
      whaleExiting: o?.whaleExiting ?? false,
      perpDominance: o?.perpDominance ?? 0,
      accountRatio: o?.accountRatio ?? 0,
      whaleRatio: o?.whaleRatio ?? 0,
      oiChange72h: o?.oiChange72h ?? NaN,
      openInterestUsd: o?.openInterestUsd ?? 0,
      motores: 0,
      motoresMedidos: 0,
    }),
  };
});

const TITULO: Record<Vies, string> = {
  short: "CANDIDATAS A VENDER",
  long: "CANDIDATAS A COMPRAR",
  evitar: "NÃO MEXER",
  observar: "SÓ OBSERVAR",
};

for (const vies of ["short", "long", "evitar"] as Vies[]) {
  const grupo = leituras
    .filter((x) => x.leitura.vies === vies)
    .sort((a, b) => b.leitura.forca - a.leitura.forca || b.score - a.score);
  if (grupo.length === 0) continue;

  console.log(`\n${"=".repeat(78)}\n${TITULO[vies]}  (${grupo.length})\n${"=".repeat(78)}`);
  for (const { vida, leitura, score } of grupo) {
    console.log(`\n${vida.ticker} · ${vida.estagio} · força ${leitura.forca}/3${score >= 35 ? ` · atenção ${score}` : ""}`);
    console.log(`  ${leitura.titulo}`);
    console.log(`  ${leitura.porque}`);
  }
}

const observando = leituras.filter((x) => x.leitura.vies === "observar");
console.log(`\n${"=".repeat(78)}`);
console.log(`só observar (${observando.length}): ${observando.map((x) => x.vida.ticker).join(", ")}`);
