/**
 * Baixa do Data Vision o open interest (em contratos) e a razão
 * comprado/vendido dos maiores traders de cada perpétuo, UM VALOR POR DIA: a
 * última linha (23:55 UTC) do arquivo diário de métricas. É o que
 * `docs/preregistro-oi.md` pede, e nada mais.
 *
 * Os dias de cada moeda saem dos meses de vela que `npm run medir-robos` já
 * guardou em `.cache/robos/` — rode aquele antes. O arquivo diário que não
 * existe (404) vira `null` e não é pedido de novo; o que falhou por rede não é
 * gravado, e a próxima rodada tenta de novo.
 *
 * CUSTA: ~400 mil arquivos pequenos na primeira vez (1 a 2 horas), guardados em
 * `.cache/oi/`. Rode com: npx tsx scripts/baixar-oi.mts
 */

import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { strFromU8, unzipSync } from "fflate";

const DV = "https://data.binance.vision/data/futures/um/daily/metrics";
const CACHE_VELAS = ".cache/robos";
const CACHE = ".cache/oi";
const DE = Date.parse("2023-12-01T00:00:00Z");
const ATE = Date.parse("2026-09-30T00:00:00Z");
const DIA = 86_400_000;
const TETO = 32;

/** dia → [contratos em aberto, razão dos maiores traders]; null quando o arquivo do dia não existe. */
type Serie = Record<string, [number, number] | null>;

let emVoo = 0;
const fila: (() => void)[] = [];
async function comVaga<T>(f: () => Promise<T>): Promise<T> {
  if (emVoo >= TETO) await new Promise<void>((r) => fila.push(r));
  emVoo++;
  try {
    return await f();
  } finally {
    emVoo--;
    fila.shift()?.();
  }
}

let falhas = 0;
/** O valor do dia, `null` para 404, `undefined` para "não consegui". */
async function dia(symbol: string, d: string): Promise<[number, number] | null | undefined> {
  return comVaga(async () => {
    for (let tentativa = 1; tentativa <= 4; tentativa++) {
      try {
        const res = await fetch(`${DV}/${symbol}/${symbol}-metrics-${d}.zip`, { signal: AbortSignal.timeout(30_000) });
        if (res.status === 404) return null;
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const arqs = unzipSync(new Uint8Array(await res.arrayBuffer()));
        for (const nome of Object.keys(arqs)) {
          const linhas = strFromU8(arqs[nome]).trim().split("\n");
          // A última linha com número: a de 23:55, ou a mais tarde que o dia teve.
          for (let k = linhas.length - 1; k > 0; k--) {
            const p = linhas[k].split(",");
            const oi = Number(p[2]);
            const top = Number(p[5]);
            if (Number.isFinite(oi) && oi > 0) return [oi, Number.isFinite(top) ? top : NaN];
          }
        }
        return null;
      } catch {
        await new Promise((r) => setTimeout(r, 500 * tentativa));
      }
    }
    falhas++;
    return undefined;
  });
}

await mkdir(CACHE, { recursive: true });
// Só as pastas: `corretora.json`, a tabela de regras da Binance, mora junto.
const simbolos = (await readdir(CACHE_VELAS, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
let feitos = 0;
let pedidos = 0;
await Promise.all(
  simbolos.map(async (symbol) => {
    const meses = new Set<string>();
    for (const arq of await readdir(`${CACHE_VELAS}/${symbol}`)) {
      const m = JSON.parse(await readFile(`${CACHE_VELAS}/${symbol}/${arq}`, "utf8")) as { velas: unknown[] };
      if (m.velas.length > 0) meses.add(arq.slice(0, 7));
    }
    const caminho = `${CACHE}/${symbol}.json`;
    const serie: Serie = existsSync(caminho) ? JSON.parse(await readFile(caminho, "utf8")) : {};
    const faltam: string[] = [];
    for (let t = DE; t <= ATE; t += DIA) {
      const d = new Date(t).toISOString().slice(0, 10);
      if (meses.has(d.slice(0, 7)) && !(d in serie)) faltam.push(d);
    }
    pedidos += faltam.length;
    const lidos = await Promise.all(faltam.map((d) => dia(symbol, d)));
    faltam.forEach((d, k) => {
      if (lidos[k] !== undefined) serie[d] = lidos[k] as [number, number] | null;
    });
    await writeFile(caminho, JSON.stringify(serie));
    if (++feitos % 50 === 0) console.log(`  ${feitos}/${simbolos.length} moedas · ${pedidos} dias pedidos · ${falhas} falhas`);
  }),
);
console.log(`${simbolos.length} moedas, ${pedidos} dias pedidos nesta rodada, ${falhas} não baixaram (rode de novo)`);
