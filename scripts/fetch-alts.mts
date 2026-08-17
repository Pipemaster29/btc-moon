/**
 * Baixa candles diários de um universo grande de perpétuos da Binance.
 *
 * O ponto crítico aqui é o VIÉS DE SOBREVIVÊNCIA. Uma análise de pump and dump
 * que só olha moedas ainda listadas mede o subconjunto que sobreviveu — e são
 * justamente as que despencaram e sumiram que carregam o efeito. O Data Vision
 * mantém os arquivos das moedas deslistadas, então o universo aqui inclui LUNA,
 * FTT, SRM e todas as outras que morreram.
 *
 * Rode com: npm run fetch-alts
 */

import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { parseKlines } from "../lib/derivatives";

const run = promisify(execFile);

const CACHE_DIR = ".cache/alts";
const OUTPUT = ".cache/alts-daily.json";
const LISTING =
  "https://s3-ap-northeast-1.amazonaws.com/data.binance.vision?delimiter=/&prefix=data/futures/um/monthly/klines/&max-keys=2000";
const CONCURRENCY = 10;
const START = { year: 2023, month: 1 };
/** Amostra do universo: baixar os 932 símbolos inteiros levaria horas. */
const SAMPLE_SIZE = 260;

async function fetchCsv(url: string, key: string, attempts = 3): Promise<string | null> {
  const cached = `${CACHE_DIR}/${key}`;
  if (existsSync(cached)) return readFile(cached, "utf8");

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const buffer = Buffer.from(await res.arrayBuffer());
      if (buffer.length < 100) throw new Error("truncado");

      const zipPath = `${cached}.zip`;
      await writeFile(zipPath, buffer);
      const { stdout } = await run("unzip", ["-p", zipPath], {
        maxBuffer: 64 * 1024 * 1024,
      });
      await writeFile(cached, stdout);
      return stdout;
    } catch {
      if (attempt === attempts) return null;
      await new Promise((r) => setTimeout(r, 300 * attempt));
    }
  }
  return null;
}

async function pool<T>(items: T[], limit: number, task: (item: T) => Promise<void>) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: limit }, async () => {
      while (cursor < items.length) await task(items[cursor++]);
    }),
  );
}

await mkdir(CACHE_DIR, { recursive: true });

// ------------------------------------------------------------ universo
const xml = await (await fetch(LISTING)).text();
const symbols = [
  ...xml.matchAll(/<Prefix>data\/futures\/um\/monthly\/klines\/([A-Z0-9]+)\/<\/Prefix>/g),
].map((m) => m[1]);

console.log(`${symbols.length} símbolos no Data Vision (inclui deslistados)`);

// Amostra determinística, para a análise ser reproduzível.
const sample = symbols
  .map((s, i) => ({ s, k: (i * 2654435761) % 4294967296 }))
  .sort((a, b) => a.k - b.k)
  .slice(0, SAMPLE_SIZE)
  .map((x) => x.s)
  .sort();

console.log(`Amostrando ${sample.length} deles\n`);

const today = new Date();
const months: string[] = [];
for (let y = START.year; y <= today.getUTCFullYear(); y++) {
  for (let m = 1; m <= 12; m++) {
    if (y === START.year && m < START.month) continue;
    if (y === today.getUTCFullYear() && m > today.getUTCMonth() + 1) continue;
    months.push(`${y}-${String(m).padStart(2, "0")}`);
  }
}

const jobs: { symbol: string; month: string }[] = [];
for (const symbol of sample) for (const month of months) jobs.push({ symbol, month });

console.log(`Baixando até ${jobs.length.toLocaleString("pt-BR")} arquivos…`);

const bySymbol = new Map<string, string[]>();
let done = 0;
let found = 0;

await pool(jobs, CONCURRENCY, async ({ symbol, month }) => {
  const url = `https://data.binance.vision/data/futures/um/monthly/klines/${symbol}/1d/${symbol}-1d-${month}.zip`;
  const csv = await fetchCsv(url, `${symbol}-${month}.csv`);
  done++;
  if (done % 1000 === 0) console.log(`  ${done}/${jobs.length} · ${found} encontrados`);
  if (!csv) return;
  found++;
  const list = bySymbol.get(symbol);
  if (list) list.push(csv);
  else bySymbol.set(symbol, [csv]);
});

console.log(`  ${found} arquivos existiam\n`);

// -------------------------------------------------------------- montagem
const series: Record<string, ReturnType<typeof parseKlines>> = {};
for (const [symbol, parts] of bySymbol) {
  const bars = parts.flatMap(parseKlines).sort((a, b) => a.time - b.time);
  // Séries curtas demais não permitem medir nada depois de um pump.
  if (bars.length >= 60) series[symbol] = bars;
}

await writeFile(OUTPUT, JSON.stringify(series));

const total = Object.values(series).reduce((s, v) => s + v.length, 0);
console.log(`${Object.keys(series).length} símbolos com histórico útil · ${total.toLocaleString("pt-BR")} dias no total`);
console.log(`Gravado em ${OUTPUT}`);
