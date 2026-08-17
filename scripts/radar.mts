/**
 * Radar de moeda manipulada: derivativos + mapa de liquidação.
 *
 * Junta as três coisas que o `watch` mostrava separadas e acrescenta a que
 * faltava — onde estão as liquidações. Nenhuma delas vem pronta: o open interest
 * e a razão de agressão são públicos, e o mapa é deduzido deles em
 * `lib/liquidation.ts`.
 *
 * A leitura que interessa para vender é a combinação: varejo comprado, dinheiro
 * grande vendido, e um bolsão de liquidação de comprados logo abaixo do preço.
 * Quando os três coincidem, o caminho de menor resistência é para baixo, porque
 * liquidar aqueles comprados gera venda a mercado que empurra na mesma direção.
 *
 * Rode com: npm run radar BTWUSDT PRLUSDT
 */

import { dailyKlineUrl, metricsUrl } from "../lib/datavision";
import {
  parseKlines,
  parsePositioning,
  type PositioningSnapshot,
} from "../lib/derivatives";
import { cachedCsv } from "./cache.mjs";
import { clusters, liquidationMap, reconstructPositions } from "../lib/liquidation";
import { depthOn, pairsOfToken } from "../lib/dexscreener";
import { WATCHLIST, findToken } from "../lib/watchlist";

const CACHE = ".cache/radar";
const DAYS = 14;

const symbols = process.argv.slice(2).map((s) => s.toUpperCase());
const targets = symbols.length ? symbols : WATCHLIST.map((t) => t.symbol);

const signed = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
const money = (v: number) =>
  v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `$${(v / 1e3).toFixed(0)}k` : `$${v.toFixed(0)}`;

function recentDays(count: number): string[] {
  const out: string[] = [];
  const cursor = new Date();
  cursor.setUTCDate(cursor.getUTCDate() - count);
  for (let i = 0; i < count; i++) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

const days = recentDays(DAYS);

for (const symbol of targets) {
  console.log(`\n${"=".repeat(92)}`);
  console.log(symbol);
  console.log("=".repeat(92));

  // --------------------------------------------------------------- preço
  const klineParts: string[] = [];
  for (const date of days) {
    const csv = await cachedCsv(dailyKlineUrl(symbol, "1d", date), `${CACHE}/k-${symbol}-${date}.csv`);
    if (csv) klineParts.push(csv);
  }

  if (klineParts.length === 0) {
    console.log(`\n  sem dados — o símbolo existe na Binance de futuros?`);
    continue;
  }

  const bars = klineParts.flatMap(parseKlines).sort((a, b) => a.time - b.time);

  // ------------------------------------------------------- posicionamento
  const snapshots: PositioningSnapshot[] = [];
  const byDay = new Map<string, PositioningSnapshot[]>();

  for (const date of days) {
    const csv = await cachedCsv(metricsUrl(symbol, date), `${CACHE}/m-${symbol}-${date}.csv`);
    if (!csv) continue;
    const parsed = parsePositioning(csv);
    byDay.set(date, parsed);
    snapshots.push(...parsed);
  }

  snapshots.sort((a, b) => a.time - b.time);

  console.log(`\n  data         fechamento   variação    volume     OI (US$)   OI var   contas  baleias $  agressão`);

  let previousOi = NaN;
  for (const [i, bar] of bars.slice(-DAYS).entries()) {
    const date = new Date(bar.time * 1000).toISOString().slice(0, 10);
    const last = byDay.get(date)?.slice(-1)[0];
    const prev = bars[bars.length - Math.min(bars.length, DAYS) + i - 1];
    const change = prev ? bar.close / prev.close - 1 : 0;

    const oiVar =
      last && Number.isFinite(previousOi) && previousOi > 0
        ? signed(last.openInterest / previousOi - 1)
        : "—";

    const cells = last
      ? [
          money(last.openInterestValue).padStart(11),
          oiVar.padStart(7),
          last.accountRatio.toFixed(2).padStart(7),
          last.topTraderPositionRatio.toFixed(2).padStart(9),
          last.takerRatio.toFixed(2).padStart(9),
        ]
      : ["—".padStart(11), "—".padStart(7), "—".padStart(7), "—".padStart(9), "—".padStart(9)];

    console.log(
      `  ${date}  ${bar.close.toPrecision(6).padStart(10)}  ${signed(change).padStart(9)}  ${money(bar.volume * bar.close).padStart(8)}  ${cells.join("  ")}`,
    );

    if (last) previousOi = last.openInterest;
  }

  // ------------------------------------------------------ mapa de liquidação
  const latest = snapshots[snapshots.length - 1];
  if (!latest || latest.openInterest <= 0) {
    console.log(`\n  sem métricas de open interest — mapa de liquidação indisponível.`);
    continue;
  }

  const price = latest.openInterestValue / latest.openInterest;
  const positions = reconstructPositions(snapshots);
  const map = liquidationMap(positions, price);
  const { above, below } = clusters(map);

  const longNotional = positions.filter((p) => p.side === "long").reduce((s, p) => s + p.notional, 0);
  const shortNotional = positions.filter((p) => p.side === "short").reduce((s, p) => s + p.notional, 0);

  // ------------------------------------------------------------ base perp/spot
  //
  // A diferença entre o perpétuo e o mercado à vista costuma ser de fração de
  // por cento, porque qualquer distância maior é fechada por arbitragem. Ela só
  // persiste quando arbitrar é impossível — e é impossível quando o open
  // interest é muito maior do que a pool à vista consegue absorver. Nesse caso a
  // base deixa de ser um desvio e passa a ser a medida de quanto o preço do
  // perpétuo está solto de qualquer referência.
  const watched = findToken(symbol);
  if (watched?.contract) {
    try {
      const depth = depthOn(await pairsOfToken(watched.contract), watched.chain);
      if (depth && depth.priceUsd > 0) {
        const basis = price / depth.priceUsd - 1;
        console.log(`\n${"─".repeat(92)}`);
        console.log("PERPÉTUO CONTRA MERCADO À VISTA");
        console.log("─".repeat(92));
        console.log(`\n    perpétuo na Binance : ${price.toPrecision(6)}`);
        console.log(`    à vista on-chain    : ${depth.priceUsd.toPrecision(6)}`);
        console.log(`    base                : ${signed(basis)}`);
        console.log(
          `    OI aberto           : ${money(latest.openInterestValue)} contra ${money(depth.liquidityUsd)} de liquidez à vista (${(latest.openInterestValue / depth.liquidityUsd).toFixed(0)}x)`,
        );

        if (Math.abs(basis) > 0.03) {
          console.log(`
    Uma base de ${signed(basis)} não sobrevive num mercado arbitrável. Ela persiste
    aqui porque fechar essa diferença exigiria negociar contra uma pool de
    ${money(depth.liquidityUsd)} — não há por onde. O preço do perpétuo não está ancorado em
    nada além do próprio livro da corretora.`);
        }
      }
    } catch (error) {
      console.log(`\n  base perp/spot indisponível: ${(error as Error).message}`);
    }
  }

  console.log(`\n${"─".repeat(92)}`);
  console.log(`MAPA DE LIQUIDAÇÃO ESTIMADO · preço ${price.toPrecision(6)}`);
  console.log("─".repeat(92));
  console.log(
    `\n  ${snapshots.length} leituras de 5 min · OI aberto reconstruído: ${money(longNotional)} comprado, ${money(shortNotional)} vendido\n`,
  );

  if (above.length === 0 && below.length === 0) {
    console.log(`  nenhum bolsão dentro de ±60% do preço.`);
  } else {
    console.log(`  ACIMA (liquida vendidos — combustível para squeeze de alta)`);
    for (const level of above) {
      console.log(
        `    ${level.price.toPrecision(6).padStart(11)}  ${signed(level.price / price - 1).padStart(7)}   ${money(level.notional).padStart(8)}`,
      );
    }
    if (above.length === 0) console.log(`    nenhum relevante`);

    console.log(`\n  ABAIXO (liquida comprados — combustível para cascata de queda)`);
    for (const level of below) {
      console.log(
        `    ${level.price.toPrecision(6).padStart(11)}  ${signed(level.price / price - 1).padStart(7)}   ${money(level.notional).padStart(8)}`,
      );
    }
    if (below.length === 0) console.log(`    nenhum relevante`);
  }

  const belowTotal = below.reduce((s, l) => s + l.notional, 0);
  const aboveTotal = above.reduce((s, l) => s + l.notional, 0);

  // ------------------------------------------------------------- veredito
  console.log(`\n${"─".repeat(92)}`);
  console.log("LEITURA");
  console.log("─".repeat(92));

  const retailLong = latest.accountRatio > 1.5;
  const whalesShort = latest.topTraderPositionRatio < 1;

  console.log(
    `\n    contas em geral     ${latest.accountRatio.toFixed(2)} — ${latest.accountRatio > 1 ? "maioria comprada" : "maioria vendida"}`,
  );
  console.log(
    `    baleias por tamanho ${latest.topTraderPositionRatio.toFixed(2)} — ${latest.topTraderPositionRatio > 1 ? "dinheiro grande comprado" : "dinheiro grande vendido"}`,
  );
  console.log(
    `    liquidações abaixo  ${money(belowTotal)} · acima ${money(aboveTotal)} — ${belowTotal > aboveTotal ? "mais combustível para queda" : "mais combustível para alta"}`,
  );

  const retailShort = latest.accountRatio < 0.7;
  const whalesLong = latest.topTraderPositionRatio > 1.2;

  if (retailLong && whalesShort && belowTotal > aboveTotal) {
    console.log(`
    ⚠ VENDER — os três alinhados: varejo comprado, dinheiro grande vendido e o
      bolsão de liquidação maior por baixo. É a configuração que antecede cascata.`);
  } else if (retailLong && whalesShort) {
    console.log(`
    ⚠ Varejo comprado contra dinheiro grande vendido, mas o bolsão maior está
      por cima. Divergência sem gatilho abaixo — esperar.`);
  } else if (retailShort && whalesLong) {
    // Este é o inverso exato da tese, e é o caso perigoso: o vendido novo vira
    // o combustível do squeeze em vez de lucrar com a queda.
    console.log(`
    ⚠ NÃO VENDER — a configuração está invertida. O varejo já está vendido
      (${latest.accountRatio.toFixed(2)}) e o dinheiro grande comprado (${latest.topTraderPositionRatio.toFixed(2)}). Entrar vendido
      agora é somar-se à multidão que serve de combustível para o squeeze.`);
  } else {
    console.log(`\n    Sem alinhamento claro hoje.`);
  }

  console.log(`
  O mapa é DEDUZIDO do open interest, não observado. Ele supõe uma distribuição
  típica de alavancagem, e nada garante que a desta moeda seja típica — num livro
  controlado, menos ainda. Serve para ordenar hipóteses, não para dimensionar risco.`);
}
