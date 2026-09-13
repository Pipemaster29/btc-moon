/**
 * Guarda hoje o open interest que a Binance apaga em 31 dias.
 *
 * É o coletor do arquivo. Roda no workflow junto do resto e faz uma coisa só:
 * pega os 31 dias que a Binance ainda serve para os 526 perpétuos, mais a vela
 * de cada dia, e faz `upsert` no Postgres. Quem já estava lá fica; o dia corrente
 * é reescrito até fechar.
 *
 * POR QUE ISTO IMPORTA MAIS DO QUE PARECE. O salto de open interest é o único
 * sinal deste projeto que separa para cima — 26,0% de chance de pump contra base
 * de 7,1%, com o intervalo inteiro acima dela. E ele está medido sobre 31 dias,
 * porque é tudo o que existe. Não dá para alargar a janela olhando para trás:
 * nenhum arquivo do Data Vision tem a coluna de open interest, e a API não serve
 * mais fundo. Só dá para alargar para a FRENTE, e só se alguém começar.
 *
 * Cada execução guarda uma sobreposição de 31 dias, então perder execuções por
 * um mês inteiro não abre buraco — o que sustenta rodar isto uma vez por dia e
 * não a cada 22 minutos.
 *
 * SEM CREDENCIAL ELE NÃO QUEBRA, AVISA. O projeto funciona inteiro sem esta
 * tabela; ela é um caminho a mais. Se `SUPABASE_SERVICE_ROLE_KEY` não estiver
 * definida, o script diz isso na primeira linha e sai com zero — porque falhar
 * o workflow por causa de um caminho opcional seria trocar um problema pequeno
 * por um grande.
 *
 * CUSTO: duas requisições por símbolo, ~1.050 no total, os mesmos do
 * `aferir-antecipar`.
 *
 * Rode com: npm run arquivar
 */

import { velas, type Vela } from "../lib/binance";
import { comLimite } from "../lib/limite";
import {
  anotarRun,
  arquivoDisponivel,
  cobertura,
  gravarOi,
  type DiaArquivado,
} from "../lib/arquivo";

const t0 = Date.now();

if (!arquivoDisponivel()) {
  console.log(
    "arquivo indisponível: falta SUPABASE_SERVICE_ROLE_KEY (ou NEXT_PUBLIC_SUPABASE_URL).\n" +
      "Nada foi gravado, e nada quebrou — o arquivo é um caminho a mais, não um requisito.",
  );
  process.exit(0);
}

const antes = await cobertura();
if (antes) {
  console.log(
    antes.dias === 0
      ? "arquivo vazio — esta é a primeira coleta"
      : `arquivo hoje: ${antes.dias} dias, de ${antes.de} a ${antes.ate}`,
  );
} else {
  console.log("arquivo: não consegui ler a cobertura atual (a gravação segue mesmo assim)");
}

const info = (await (
  await fetch("https://www.binance.com/fapi/v1/exchangeInfo", { signal: AbortSignal.timeout(20_000) })
).json()) as {
  symbols: { symbol: string; status: string; contractType: string; quoteAsset: string }[];
};
const universo = info.symbols
  .filter((s) => s.status === "TRADING" && s.contractType === "PERPETUAL" && s.quoteAsset === "USDT")
  .map((s) => s.symbol);

async function oiDiario(symbol: string): Promise<Map<string, number>> {
  return comLimite("binance", 24, async () => {
    try {
      const r = await fetch(
        `https://www.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=1d&limit=500`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (!r.ok) return new Map();
      const d = (await r.json()) as { sumOpenInterest: string; timestamp: number }[];
      if (!Array.isArray(d)) return new Map();
      return new Map(
        d.map((x) => [
          new Date(Number(x.timestamp)).toISOString().slice(0, 10),
          Number(x.sumOpenInterest),
        ]),
      );
    } catch {
      return new Map();
    }
  });
}

const linhas: DiaArquivado[] = [];
let semOi = 0;
await Promise.all(
  universo.map(async (symbol) => {
    const [vs, ois] = await Promise.all([
      comLimite("binance", 24, () => velas(symbol, "1d", 60).catch(() => [] as Vela[])),
      oiDiario(symbol),
    ]);
    if (ois.size === 0) {
      semOi++;
      return;
    }
    const porDia = new Map<string, Vela>();
    for (const v of vs) porDia.set(new Date(v.time * 1000).toISOString().slice(0, 10), v);

    for (const [dia, oi] of ois) {
      // `Number.isFinite` e não `> 0`: NaN passa pelos dois lados da comparação,
      // e um NaN gravado envenena toda medição que ler esta linha depois.
      if (!Number.isFinite(oi) || oi <= 0) continue;
      const v = porDia.get(dia);
      linhas.push({
        symbol,
        dia,
        open_interest: oi,
        abertura: v?.open ?? null,
        maxima: v?.high ?? null,
        minima: v?.low ?? null,
        fechamento: v?.close ?? null,
        volume: v?.volume ?? null,
      });
    }
  }),
);

const simbolos = new Set(linhas.map((l) => l.symbol)).size;
console.log(
  `${universo.length} perpétuos · ${simbolos} com open interest · ${semOi} sem · ` +
    `${linhas.length.toLocaleString("pt-BR")} linhas para gravar`,
);

const gravadas = await gravarOi(linhas);
const segundos = (Date.now() - t0) / 1000;

if (gravadas === null) {
  console.error("\nA GRAVAÇÃO FALHOU. Nada foi guardado nesta execução.");
  await anotarRun("oi_diario", 0, simbolos, segundos, "upsert falhou");
  process.exitCode = 1;
} else {
  await anotarRun("oi_diario", gravadas, simbolos, segundos);
  const depois = await cobertura();
  console.log(
    `\n${gravadas.toLocaleString("pt-BR")} linhas gravadas em ${segundos.toFixed(1)}s` +
      (depois && depois.dias > 0
        ? `\narquivo agora: ${depois.dias} dias, de ${depois.de} a ${depois.ate}` +
          (depois.dias > 31
            ? `\n→ ${depois.dias - 31} dias A MAIS do que a Binance serve. É esta a parte que não existia.`
            : "\n→ ainda dentro dos 31 dias que a Binance serve; a sobra começa a aparecer depois disso.")
        : ""),
  );
}
