/**
 * Quem está sendo MEXIDO agora: a fila do salto de open interest.
 *
 * É a resposta à reclamação que a motivou — "não conseguimos identificar um
 * scam pump" —, e ela é honesta nos dois sentidos. Existe sinal: depois de um
 * salto de 25% no open interest de um dia, a moeda sobe 20% ou mais em dois dias
 * com chance de 26,0% contra base de 7,1%, e o intervalo de 95% não encosta na
 * base. É o único sinal deste projeto que separa para CIMA.
 *
 * E não é call: o retorno mediano desses mesmos casos é −1,6% contra +0,3% da
 * base. A chance de pump triplica e a conta não acompanha, porque três quartos
 * dos casos sangram. A medição inteira está em `lib/antecipar.ts` e se refaz com
 * `npm run aferir-antecipar`.
 *
 * O que a fila mostra:
 *
 *   salto    open interest do último dia fechado ÷ o do dia anterior
 *   dia      qual dia fechou com esse salto
 *   no dia   quanto o PREÇO andou nesse mesmo dia
 *   preço    onde está agora
 *   24h      o que já andou
 *
 * A leitura que interessa é salto ALTO com "no dia" BAIXO: alguém montando
 * posição sem empurrar o preço. Quando os dois estão altos, o movimento já
 * começou e a fila do garimpo é que se aplica — e ela diz para não comprar.
 *
 * CUSTO: o mesmo do `npm run estagio`. A série de open interest vem na resposta
 * que `circulante` já buscava.
 *
 * Rode com: npm run antecipar
 */

import { lerVida, type Vida } from "../lib/lifecycle";
import { getOverview } from "../lib/overview";
import { ATIVAS } from "../lib/watchlist";
import {
  SALTO_DE_OI,
  SALTO_DE_OI_FRACO,
  vereditoDaAntecipacao,
} from "../lib/antecipar";

const overview = await getOverview();
const preco = new Map(overview.map((r) => [r.symbol, r.price]));
const var24 = new Map(overview.map((r) => [r.symbol, r.change24h]));

const vidas = (
  await Promise.all(ATIVAS.map((t) => lerVida(t, preco.get(t.symbol) ?? 0).catch(() => null)))
).filter((v): v is Vida => v !== null);

const comOi = vidas
  .filter((v) => v.antecipacao !== null)
  .sort((a, b) => (b.antecipacao?.salto ?? 0) - (a.antecipacao?.salto ?? 0));

/** Preço com quatro dígitos significativos: sem isto o 0,059493679999 da LAB
 *  desalinha a tabela inteira. */
const cot = (v: number | undefined) =>
  v === undefined || !Number.isFinite(v) || v <= 0 ? "—" : v.toPrecision(4);

const pct = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v)
    ? "—"
    : `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(0)}%`;

console.log(
  `\n${vidas.length} moedas lidas · ${vidas.length - comOi.length} sem série de open interest\n`,
);
console.log("moeda         salto        dia     no dia      preço      24h");
console.log("".padEnd(70, "-"));

for (const v of comOi) {
  const a = v.antecipacao!;
  console.log(
    v.ticker.padEnd(13) +
      pct(a.salto).padStart(6) +
      `  ${a.dia}` +
      pct(a.moveuNoDia).padStart(10) +
      cot(preco.get(v.symbol)).padStart(12) +
      pct(var24.get(v.symbol) ?? null).padStart(9),
  );
}

const fortes = comOi.filter((v) => (v.antecipacao?.salto ?? 0) >= SALTO_DE_OI_FRACO);

console.log(`\n${"=".repeat(70)}`);
if (fortes.length === 0) {
  console.log(
    `Nenhuma moeda com salto de open interest acima de ${(SALTO_DE_OI_FRACO * 100).toFixed(0)}% ` +
      `no último dia fechado.\nA fila vazia é resposta: hoje ninguém está montando posição ` +
      `grande nesta lista.`,
  );
} else {
  console.log(
    `${fortes.length} com salto acima de ${(SALTO_DE_OI_FRACO * 100).toFixed(0)}% · ` +
      `${fortes.filter((v) => (v.antecipacao?.salto ?? 0) >= SALTO_DE_OI).length} acima de ` +
      `${(SALTO_DE_OI * 100).toFixed(0)}%, que é o corte medido`,
  );
  console.log("=".repeat(70));
  for (const v of fortes) {
    const frase = vereditoDaAntecipacao(v.antecipacao);
    if (frase) console.log(`\n${v.ticker} · ${frase}`);
  }
}

console.log(
  `\n${"─".repeat(70)}\n` +
    "A chance de pump triplica e o RETORNO MEDIANO fica negativo (−1,6% contra\n" +
    "+0,3% da base): três quartos dos casos sangram e um quarto explode. É fila de\n" +
    "investigação, igual à do garimpo — o passo seguinte é `npm run radar TICKER`.\n" +
    "São 31 dias de open interest, que é tudo o que a Binance guarda.",
);
