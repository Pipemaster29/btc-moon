/**
 * Painel de posicionamento para símbolos escolhidos.
 *
 * Mostra o que a Binance publica sobre quem está de que lado: open interest,
 * razão comprado/vendido entre todas as contas, entre as maiores contas, e
 * — o que mais interessa — a razão ponderada pelo TAMANHO das posições dessas
 * contas grandes.
 *
 * Rode com: npm run watch BTWUSDT PRLUSDT
 */

import { monthlyKlineUrl, metricsUrl } from "../lib/datavision";
import {
  parseKlines,
  parsePositioning,
  type PositioningSnapshot,
} from "../lib/derivatives";
import { cachedCsv } from "./cache.mjs";

const CACHE = ".cache/watch";

const symbols = process.argv.slice(2).map((s) => s.toUpperCase());
if (symbols.length === 0) {
  console.error("uso: npm run watch BTWUSDT PRLUSDT");
  process.exit(1);
}

const signed = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
const money = (v: number) =>
  v >= 1e6 ? `$${(v / 1e6).toFixed(1)}M` : `$${(v / 1e3).toFixed(0)}k`;

/** Últimos N dias no formato AAAA-MM-DD, do mais antigo ao mais recente. */
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

/** Meses cobertos pelos últimos dias, sem repetir. */
function monthsOf(days: string[]): string[] {
  return [...new Set(days.map((d) => d.slice(0, 7)))];
}

const DAYS = 21;
const days = recentDays(DAYS);

for (const symbol of symbols) {
  console.log(`\n${"=".repeat(92)}`);
  console.log(`${symbol}`);
  console.log("=".repeat(92));

  // ------------------------------------------------------------- preço
  const klineParts: string[] = [];
  for (const month of monthsOf(days)) {
    const csv = await cachedCsv(monthlyKlineUrl(symbol, "1d", month), `${CACHE}/k-${symbol}-${month}.csv`);
    if (csv) klineParts.push(csv);
  }

  if (klineParts.length === 0) {
    console.log(`\n  sem dados de preço — o símbolo existe na Binance de futuros?`);
    continue;
  }

  const bars = klineParts.flatMap(parseKlines).sort((a, b) => a.time - b.time);

  // -------------------------------------------------------- posicionamento
  const byDay = new Map<string, PositioningSnapshot[]>();
  for (const date of days) {
    const csv = await cachedCsv(metricsUrl(symbol, date), `${CACHE}/m-${symbol}-${date}.csv`);
    if (csv) byDay.set(date, parsePositioning(csv));
  }

  console.log(
    `\n  data         fechamento    variação    volume      OI (US$)   OI var   contas   baleias   $ baleias   agressão`,
  );

  let previousOi = NaN;

  for (const bar of bars.slice(-DAYS)) {
    const date = new Date(bar.time * 1000).toISOString().slice(0, 10);
    const snaps = byDay.get(date);
    const last = snaps?.[snaps.length - 1];

    const prevBar = bars[bars.indexOf(bar) - 1];
    const change = prevBar ? bar.close / prevBar.close - 1 : 0;
    const notional = bar.volume * bar.close;

    const oiChange =
      last && Number.isFinite(previousOi) && previousOi > 0
        ? last.openInterest / previousOi - 1
        : NaN;

    const cells = last
      ? [
          money(last.openInterestValue).padStart(11),
          (Number.isFinite(oiChange) ? signed(oiChange) : "—").padStart(7),
          last.accountRatio.toFixed(2).padStart(7),
          last.topTraderAccountRatio.toFixed(2).padStart(8),
          last.topTraderPositionRatio.toFixed(2).padStart(10),
          last.takerRatio.toFixed(2).padStart(10),
        ]
      : ["—".padStart(11), "—".padStart(7), "—".padStart(7), "—".padStart(8), "—".padStart(10), "—".padStart(10)];

    console.log(
      `  ${date}  ${bar.close.toPrecision(6).padStart(11)}  ${signed(change).padStart(9)}  ${money(notional).padStart(9)}  ${cells.join("  ")}`,
    );

    if (last) previousOi = last.openInterest;
  }

  // ----------------------------------------------------------- leitura
  const withData = bars.slice(-DAYS).filter((b) => {
    const date = new Date(b.time * 1000).toISOString().slice(0, 10);
    return byDay.has(date);
  });

  const latestDate = new Date(withData[withData.length - 1]?.time * 1000)
    .toISOString()
    .slice(0, 10);
  const latest = byDay.get(latestDate)?.slice(-1)[0];

  if (latest) {
    console.log(`\n  LEITURA DE HOJE (${latestDate}):`);
    console.log(
      `    contas em geral    ${latest.accountRatio.toFixed(2)} — ${latest.accountRatio > 1 ? "maioria comprada" : "maioria vendida"}`,
    );
    console.log(
      `    baleias por cabeça ${latest.topTraderAccountRatio.toFixed(2)} — ${latest.topTraderAccountRatio > 1 ? "mais baleias compradas" : "mais baleias vendidas"}`,
    );
    console.log(
      `    baleias por tamanho ${latest.topTraderPositionRatio.toFixed(2)} — ${latest.topTraderPositionRatio > 1 ? "dinheiro grande comprado" : "dinheiro grande vendido"}`,
    );

    // O varejo de um lado e o dinheiro grande do outro é o padrão clássico
    // que antecede liquidações em cascata.
    const retailLong = latest.accountRatio > 1.5;
    const whalesShort = latest.topTraderPositionRatio < 1;
    if (retailLong && whalesShort) {
      console.log(
        `\n    ⚠ varejo comprado (${latest.accountRatio.toFixed(2)}) contra dinheiro grande vendido (${latest.topTraderPositionRatio.toFixed(2)})`,
      );
    }
    if (latest.accountRatio < 0.7 && latest.topTraderPositionRatio > 1.2) {
      console.log(`\n    ⚠ varejo vendido contra dinheiro grande comprado — risco de squeeze`);
    }
  }

  const covered = byDay.size;
  console.log(
    `\n  ${bars.length} dias de preço · ${covered} dias com painel de posicionamento`,
  );
  if (bars.length < 90) {
    console.log(
      `  ATENÇÃO: histórico curto demais para qualquer backtest. Serve para acompanhar, não para validar estratégia.`,
    );
  }
}
