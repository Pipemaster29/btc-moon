/**
 * Cache em disco para os arquivos do Data Vision.
 *
 * Os arquivos são imutáveis depois de publicados, então guardar o CSV já
 * descompactado evita rebaixar o mesmo zip a cada rodada — e as análises que
 * varrem centenas de dias ficam instantâneas na segunda execução.
 *
 * Só serve para script: a web usa `fetchCsv` direto, porque lá o cache é o do
 * próprio `fetch` e o disco é somente leitura.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { fetchCsv } from "../lib/datavision";

export async function cachedCsv(
  url: string,
  path: string,
  attempts = 3,
): Promise<string | null> {
  if (existsSync(path)) return readFile(path, "utf8");

  const csv = await fetchCsv(url, attempts);
  if (csv === null) return null;

  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, csv);
  return csv;
}
