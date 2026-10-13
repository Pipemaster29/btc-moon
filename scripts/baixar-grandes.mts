/**
 * Baixa o UNIVERSO DAS GRANDES: o retrato semanal das maiores moedas por
 * market cap da CoinMarketCap, de 12/2023 até hoje, um arquivo por domingo em
 * `.cache/grandes/`. É a lista do robô "Grandes" (`lib/robos.ts`): as moedas
 * com US$ 2 bilhões ou mais de market cap NAQUELA semana.
 *
 * POR QUE O RETRATO DE CADA SEMANA, E NÃO A LISTA DE HOJE. Escolher pelas
 * grandes de hoje é escolher as que deram certo: a moeda que valia US$ 3 bi em
 * 2024 e derreteu não estaria na lista, e a que era pequena em 2024 e explodiu
 * estaria nela desde o começo. A medição precisa da lista que alguém teria em
 * mãos em cada dia, e é o que este retrato é.
 *
 * SEM CHAVE: é o endereço público que a página de retratos históricos da
 * CoinMarketCap usa (`data-api/v3/cryptocurrency/listings/historical`), e cada
 * data custa uma requisição. Conferido em 13/10: 52 moedas acima de US$ 2 bi em
 * 10/01/2024, 56 em 15/06/2025 e 60 em 28/09/2026, stablecoins incluídas (a
 * etiqueta "stablecoin" vem junto, e o robô as tira).
 *
 * Guarda só o que a medição usa: id, símbolo, nome, se é stablecoin, preço,
 * market cap e volume de 24 h, das 300 primeiras. Data que falhou por rede não
 * é gravada, e a próxima rodada tenta de novo.
 *
 * Rode com: npx tsx scripts/baixar-grandes.mts
 */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";

const CACHE = ".cache/grandes";
const DIA = 86_400_000;
/** O primeiro domingo de 12/2023: a decisão de 01/01/2024 já tem um retrato de antes dela. */
const DE = Date.parse("2023-12-03T00:00:00Z");
const URL = "https://api.coinmarketcap.com/data-api/v3/cryptocurrency/listings/historical";

export interface MoedaDoRetrato {
  id: number;
  symbol: string;
  name: string;
  estavel: boolean;
  preco: number;
  marketCap: number;
  volume24h: number;
}

interface Bruta {
  id: number;
  symbol: string;
  name: string;
  tags?: string[];
  quotes?: { price?: number; marketCap?: number; volume24h?: number }[];
}

async function retrato(data: string): Promise<MoedaDoRetrato[] | null> {
  for (let tentativa = 1; tentativa <= 4; tentativa++) {
    try {
      const res = await fetch(`${URL}?date=${data}&limit=300&start=1&convertId=2781`, {
        headers: { "User-Agent": "Mozilla/5.0" },
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as { data?: Bruta[] };
      if (!Array.isArray(j.data) || j.data.length === 0) throw new Error("sem lista");
      return j.data.map((d) => ({
        id: d.id,
        symbol: d.symbol,
        name: d.name,
        estavel: (d.tags ?? []).includes("stablecoin"),
        preco: Number(d.quotes?.[0]?.price),
        marketCap: Number(d.quotes?.[0]?.marketCap),
        volume24h: Number(d.quotes?.[0]?.volume24h),
      }));
    } catch (e) {
      if (tentativa === 4) {
        console.log(`${data}: não consegui (${e})`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 2000 * tentativa));
    }
  }
  return null;
}

await mkdir(CACHE, { recursive: true });
const hoje = Date.now();
let novos = 0;
let falhas = 0;
for (let t = DE; t <= hoje; t += 7 * DIA) {
  const data = new Date(t).toISOString().slice(0, 10);
  const arq = `${CACHE}/${data}.json`;
  if (existsSync(arq)) continue;
  const r = await retrato(data);
  if (!r) {
    falhas++;
    continue;
  }
  await writeFile(arq, JSON.stringify(r));
  novos++;
  // Uma por segundo: é o endereço de uma página pública, não uma API paga.
  await new Promise((res) => setTimeout(res, 1000));
}
console.log(`${novos} retratos novos em ${CACHE}${falhas ? `, ${falhas} falharam (rode de novo)` : ""}`);
