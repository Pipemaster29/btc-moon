/**
 * Baixa o ÍNDICE DE MEDO E GANÂNCIA da alternative.me, de 02/2018 até hoje, num
 * arquivo só em `.cache/medo.json`: o termômetro de "mercado com medo" que a
 * medição dos robôs usa para cortar o histórico por regime (`npm run
 * medir-robos -- --regime`).
 *
 * SEM CHAVE: é o endereço público da própria página do índice
 * (`api.alternative.me/fng/?limit=0`), uma requisição para a série inteira.
 * Conferido em 05/11/2026: 3.196 dias, de 01/02/2018 a 05/11/2026, um valor de
 * 0 a 100 por dia, com o rótulo do próprio índice (medo extremo até 24, medo
 * de 25 a 44, neutro de 45 a 55, ganância de 56 a 75, ganância extrema de 76
 * para cima).
 *
 * O VALOR DE UM DIA SAI NA MEIA-NOITE UTC DELE. A resposta de 05/11/2026 às
 * 20h55 UTC trazia o valor de 05/11 com "time_until_update" de 3,1 h: o
 * próximo sai na meia-noite seguinte. A decisão da meia-noite de D pode correr
 * junto com a publicação do valor de D, então a medição usa o de D−1 — um dia
 * de atraso no pior caso, e nenhum de futuro.
 *
 * Data sem valor fica sem valor: "não consegui ler" não vira "neutro".
 *
 * Rode com: npx tsx scripts/baixar-medo.mts
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

export const ARQUIVO_MEDO = ".cache/medo.json";
const URL = "https://api.alternative.me/fng/?limit=0&format=json";
const DIA = 86_400_000;

/** O índice por dia: "AAAA-MM-DD" (o dia do timestamp, UTC) → valor de 0 a 100. */
export type SerieDoMedo = Record<string, number>;

async function buscar(): Promise<SerieDoMedo | null> {
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    try {
      const res = await fetch(URL, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { data?: { value?: string; timestamp?: string }[] };
      if (!Array.isArray(j.data) || j.data.length === 0) throw new Error("sem série");
      const out: SerieDoMedo = {};
      for (const d of j.data) {
        const v = Number(d.value);
        const t = Number(d.timestamp) * 1000;
        if (!Number.isFinite(v) || v < 0 || v > 100 || !Number.isFinite(t)) continue;
        out[new Date(t).toISOString().slice(0, 10)] = v;
      }
      return out;
    } catch (e) {
      if (tentativa === 4) {
        console.log(`medo e ganância: não consegui (${e})`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 2000 * tentativa));
    }
  }
  return null;
}

/**
 * A série do cache, baixada de novo quando o último dia dela é anterior a
 * ontem. Sem rede e sem cache, nulo — quem usa decide o que fazer sem ela.
 */
export async function baixarMedo(): Promise<SerieDoMedo | null> {
  let atual: SerieDoMedo | null = null;
  if (existsSync(ARQUIVO_MEDO)) atual = JSON.parse(await readFile(ARQUIVO_MEDO, "utf8")) as SerieDoMedo;
  const ontem = new Date(Date.now() - DIA).toISOString().slice(0, 10);
  const ultimo = atual ? Object.keys(atual).sort().at(-1) : undefined;
  if (atual && ultimo && ultimo >= ontem) return atual;
  const nova = await buscar();
  if (!nova) return atual;
  await mkdir(".cache", { recursive: true });
  await writeFile(ARQUIVO_MEDO, JSON.stringify(nova));
  return nova;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const s = await baixarMedo();
  const dias = s ? Object.keys(s).sort() : [];
  console.log(s ? `${dias.length} dias em ${ARQUIVO_MEDO}, de ${dias[0]} a ${dias.at(-1)}` : "sem a série");
}
