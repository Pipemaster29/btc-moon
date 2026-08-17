/**
 * Baixa e monta a série diária de preço, open interest e CVD.
 *
 * São ~70 arquivos mensais de klines e ~2.000 diários de métricas, todos
 * pequenos. O resultado fica em cache no disco para os scripts de análise não
 * precisarem repetir o download.
 *
 * Rode com: npm run fetch-deriv
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { monthlyKlineUrl, metricsUrl } from "../lib/datavision";
import {
  assemble,
  parseKlines,
  parseOpenInterest,
  type DerivBar,
} from "../lib/derivatives";

const run = promisify(execFile);

const SYMBOL = "BTCUSDT";
const CACHE_DIR = ".cache/derivatives";
const OUTPUT = ".cache/btcusdt-daily.json";
const START = { year: 2021, month: 1 };
const CONCURRENCY = 6;

const failures = new Map<string, number>();

/**
 * Baixa e descompacta um zip do Data Vision, devolvendo o CSV.
 *
 * Faz novas tentativas porque a rede falha de forma intermitente sob
 * concorrência: sem isso, boa parte dos arquivos era descartada em silêncio e o
 * histórico saía cheio de buracos.
 */
async function fetchCsv(
  url: string,
  cacheKey: string,
  attempts = 4,
): Promise<string | null> {
  const cached = `${CACHE_DIR}/${cacheKey}`;
  if (existsSync(cached)) return readFile(cached, "utf8");

  const zipPath = `${cached}.zip`;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url);

      // 404 é resposta legítima: o arquivo não existe para aquela data.
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 100) throw new Error("resposta truncada");
      await writeFile(zipPath, buffer);

      // O zip do Data Vision tem sempre um único CSV dentro.
      const { stdout } = await run("unzip", ["-p", zipPath], {
        maxBuffer: 128 * 1024 * 1024,
      });
      await writeFile(cached, stdout);
      return stdout;
    } catch (error) {
      const reason = error instanceof Error ? error.message : "desconhecido";
      if (attempt === attempts) {
        failures.set(reason, (failures.get(reason) ?? 0) + 1);
        return null;
      }
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }

  return null;
}

/** Executa tarefas com limite de simultaneidade, para não afogar o servidor. */
async function pool<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let cursor = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await task(items[index]);
    }
  });
  await Promise.all(workers);
}

await mkdir(CACHE_DIR, { recursive: true });

const today = new Date();

// ------------------------------------------------------------------- klines
const months: string[] = [];
for (let y = START.year; y <= today.getUTCFullYear(); y++) {
  for (let m = 1; m <= 12; m++) {
    if (y === START.year && m < START.month) continue;
    if (y === today.getUTCFullYear() && m > today.getUTCMonth() + 1) continue;
    months.push(`${y}-${String(m).padStart(2, "0")}`);
  }
}

console.log(`Baixando ${months.length} meses de klines de futuros…`);
const klineParts = new Map<string, string>();
let klineOk = 0;

await pool(months, CONCURRENCY, async (month) => {
  const csv = await fetchCsv(monthlyKlineUrl(SYMBOL, "1d", month), `k-${month}.csv`);
  if (csv) {
    klineParts.set(month, csv);
    klineOk++;
  }
});
console.log(`  ${klineOk} de ${months.length} disponíveis`);

const bars = months
  .filter((m) => klineParts.has(m))
  .flatMap((m) => parseKlines(klineParts.get(m)!))
  .sort((a, b) => a.time - b.time);

console.log(`  ${bars.length} barras diárias`);

// ------------------------------------------------------------------ métricas
const days: string[] = [];
const cursor = new Date(Date.UTC(START.year, START.month - 1, 1));
while (cursor < today) {
  days.push(cursor.toISOString().slice(0, 10));
  cursor.setUTCDate(cursor.getUTCDate() + 1);
}

console.log(`\nBaixando ${days.length} dias de open interest…`);
const oiByDay = new Map<number, number>();
let oiOk = 0;
let done = 0;

await pool(days, CONCURRENCY, async (date) => {
  const csv = await fetchCsv(metricsUrl(SYMBOL, date), `m-${date}.csv`);
  done++;
  if (done % 250 === 0) process.stdout.write(`  ${done}/${days.length}\n`);
  if (!csv) return;

  const oi = parseOpenInterest(csv);
  if (Number.isFinite(oi)) {
    oiByDay.set(Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000 / 86400), oi);
    oiOk++;
  }
});
console.log(`  ${oiOk} de ${days.length} com dado de OI`);

// ------------------------------------------------------------------- junção
const series: DerivBar[] = assemble(bars, oiByDay).filter((b) =>
  Number.isFinite(b.openInterest),
);

await writeFile(OUTPUT, JSON.stringify(series));

const first = new Date(series[0].time * 1000).toISOString().slice(0, 10);
const last = new Date(series[series.length - 1].time * 1000).toISOString().slice(0, 10);
console.log(`\n${series.length} dias completos (preço + OI + CVD): ${first} → ${last}`);
console.log(`Gravado em ${OUTPUT}`);

if (failures.size > 0) {
  console.log("\nFalhas persistentes por motivo:");
  for (const [reason, count] of failures) console.log(`  ${reason}: ${count}`);
}
