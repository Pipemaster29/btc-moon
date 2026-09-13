/**
 * "Volume explodiu e o preço não andou" é acumulação? Medido: não.
 *
 * A tese chega pronta de todo canal de cripto e é a seguinte: quando o volume
 * vai ao topo histórico e o preço fica parado, alguém grande está comprando sem
 * empurrar a cotação, e isso antecede alta. O MOVR entrou na watchlist com
 * exatamente esse argumento em cima, então ele foi medido antes de virar leitura
 * de tela — é a regra do AGENTS.md, e ela existe porque metade das teses boas
 * deste projeto morreu na medição.
 *
 * A METODOLOGIA É A DO `lib/placar.ts` e a do `aferir-garimpo`, de propósito:
 * mediana do retorno à frente contra a referência de TODAS as observações do
 * universo, mais a concordância entre moedas. A referência existe porque em
 * período de queda geral qualquer grupo tem mediana negativa; a concordância
 * existe porque mediana boa concentrada em poucas moedas é ruído com cara de
 * descoberta.
 *
 * O QUE SAIU, sobre 512 perpétuos e ~354 mil observações (13/09/2026):
 *
 *   salto de volume   preço no dia   n      7d       vs ref      moedas a favor
 *   ≥10x da mediana   livre          7.497  −6,96%   −5,68 p.p.  116/472
 *   ≥10x              |dia| ≤5%      1.885  −5,33%   −4,05 p.p.  120/377
 *   ≥20x              livre          3.495  −9,82%   −8,54 p.p.   88/415
 *   ≥20x              |dia| ≤5%        645  −7,85%   −6,57 p.p.   74/256
 *   ≥40x              livre          1.500  −12,56%  −11,28 p.p.  69/326
 *   ≥40x              |dia| ≤5%        185  −10,70%  −9,42 p.p.   32/123
 *
 * A referência de 7 dias é −1,28%. Ou seja: o salto de volume prevê queda, não
 * alta, e prevê MAIS queda quanto maior o salto — monotônico em toda a escala,
 * igual em 14, 30, 60 e 90 dias, com a concordância entre moedas indo contra a
 * tese em todas as faixas (só 26% das moedas batem a referência no corte de
 * 40x). É o mesmo formato do achado do garimpo, e tem a mesma força.
 *
 * O FILTRO DE "PREÇO PARADO" NÃO SALVA A TESE, SÓ SUAVIZA. Comparando as linhas
 * duas a duas, exigir que o dia tenha andado menos de 5% melhora o desfecho em
 * 1,6 a 2,6 p.p. — e o desfecho continua 4 a 9 p.p. ABAIXO da referência. Quer
 * dizer que a parte "sem mexer no preço" é menos ruim que a parte "com pump
 * junto", e que nenhuma das duas é boa. A leitura de que o preço parado é sinal
 * positivo é o que a medição desmente.
 *
 * O VIÉS DE SOBREVIVÊNCIA CORRE A FAVOR DA CONCLUSÃO: o universo é quem está
 * listado HOJE, então as moedas que tiveram volume recorde e foram deslistadas
 * depois — as de pior desfecho — ficaram de fora da conta.
 *
 * O QUE ISTO NÃO MEDE: quem compra DEPOIS que a poeira baixa. Toda observação
 * aqui entra no dia do salto. Uma tese de acumulação que só compre semanas
 * depois, sobre a faixa já formada, é outra medição e não está feita.
 *
 * CUSTO: uma requisição de velas por símbolo, ~530 no total.
 *
 * Rode com: npm run aferir-acumulacao
 */

import { velas, type Vela } from "../lib/binance";
import { comLimite } from "../lib/limite";

/** Horizontes à frente, em dias. */
const HORIZONTES = [7, 14, 30, 60, 90];

/**
 * A base de comparação do volume: mediana dos 90 dias anteriores.
 *
 * Mediana e não média porque é justamente o dia atípico que se está medindo, e
 * média contaminada pelo próprio pico anterior encolheria o salto até sumir.
 * A janela de 90 dias é o que o gráfico de quem olha chama de "volume normal".
 */
const BASE = 90;

/** Saltos testados, em múltiplos da mediana de volume. */
const SALTOS = [10, 20, 40];

/**
 * "O preço não andou": variação do dia, em módulo, do abre ao fecha.
 *
 * Em PREÇO e não em margem — a distinção que já quebrou a carteira deste
 * projeto duas vezes. `null` na tabela significa sem filtro nenhum.
 */
const ACHATADOS: (number | null)[] = [null, 0.05];

const mediana = (xs: number[]): number => {
  if (xs.length === 0) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const pct = (v: number) =>
  Number.isFinite(v) ? `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(2)}%` : "—";

// ------------------------------------------------------------------- os dados

const t0 = Date.now();
const info = (await (
  await fetch("https://www.binance.com/fapi/v1/exchangeInfo", { signal: AbortSignal.timeout(20_000) })
).json()) as {
  symbols: { symbol: string; status: string; contractType: string; quoteAsset: string }[];
};
const universo = info.symbols
  .filter((s) => s.status === "TRADING" && s.contractType === "PERPETUAL" && s.quoteAsset === "USDT")
  .map((s) => s.symbol);

const series = new Map<string, Vela[]>();
let semSerie = 0;
await Promise.all(
  universo.map((s) =>
    comLimite("binance", 24, async () => {
      const v = await velas(s, "1d", 1500).catch(() => [] as Vela[]);
      // A janela de base são 90 dias e o horizonte mais curto são 7: menos de
      // 120 não sustenta nem uma observação honesta. Fora, e contado.
      if (v.length < BASE + 30) {
        semSerie++;
        return;
      }
      series.set(s, v);
    }),
  ),
);

console.log(
  `\n${universo.length} perpétuos · ${series.size} com série · ${semSerie} sem histórico ` +
    `suficiente · ${((Date.now() - t0) / 1000).toFixed(1)}s`,
);

// --------------------------------------------------- a referência do universo
//
// TODAS as observações possíveis, e não só as do grupo. Sem isto, mediana
// negativa em mercado caindo pareceria descoberta.

const referencia = new Map<number, number>();
{
  const bruto = new Map<number, number[]>(HORIZONTES.map((h) => [h, []]));
  for (const v of series.values()) {
    for (let i = BASE; i < v.length; i++) {
      for (const h of HORIZONTES) {
        if (i + h >= v.length) continue;
        const a = v[i].close, b = v[i + h].close;
        if (a > 0 && b > 0) bruto.get(h)!.push(b / a - 1);
      }
    }
  }
  for (const h of HORIZONTES) {
    referencia.set(h, mediana(bruto.get(h)!));
    console.log(
      `referência ${String(h).padStart(2)}d ${pct(referencia.get(h)!)} · ` +
        `${bruto.get(h)!.length.toLocaleString("pt-BR")} observações`,
    );
  }
}

// ------------------------------------------------------------------- a medição

interface Obs {
  s: string;
  fwd: Map<number, number>;
}

function observar(saltoMin: number, achatado: number | null): Obs[] {
  const obs: Obs[] = [];
  for (const [s, v] of series) {
    // A mediana móvel de volume, calculada uma vez por moeda.
    for (let i = BASE; i + HORIZONTES[0] < v.length; i++) {
      const base = mediana(v.slice(i - BASE, i).map((k) => k.volume));
      // `Number.isFinite` e não `> 0`: NaN fura os dois lados de uma comparação.
      if (!Number.isFinite(base) || base <= 0) continue;
      if (v[i].volume / base < saltoMin) continue;
      if (achatado !== null) {
        const andou = Math.abs(v[i].close / v[i].open - 1);
        if (!Number.isFinite(andou) || andou > achatado) continue;
      }
      const fwd = new Map<number, number>();
      for (const h of HORIZONTES) {
        if (i + h >= v.length) continue;
        const a = v[i].close, b = v[i + h].close;
        if (a > 0 && b > 0) fwd.set(h, b / a - 1);
      }
      if (fwd.size > 0) obs.push({ s, fwd });
    }
  }
  return obs;
}

console.log(
  `\nsalto de volume contra a mediana de ${BASE} dias · o que o preço faz depois\n` +
    `${"".padEnd(78, "-")}`,
);

for (const salto of SALTOS) {
  for (const achatado of ACHATADOS) {
    const obs = observar(salto, achatado);
    const cabeca =
      `≥${String(salto).padStart(2)}x · ` +
      (achatado === null ? "preço livre  " : `|dia| ≤${(achatado * 100).toFixed(0)}%   `) +
      `n=${String(obs.length).padStart(5)}`;
    const partes: string[] = [];
    for (const h of HORIZONTES) {
      const xs = obs.map((o) => o.fwd.get(h)).filter((x): x is number => x !== undefined);
      const med = mediana(xs);
      const ref = referencia.get(h)!;
      // Concordância entre MOEDAS: mediana boa vinda de três moedas é ruído.
      const porMoeda = new Map<string, number[]>();
      for (const o of obs) {
        const x = o.fwd.get(h);
        if (x !== undefined) porMoeda.set(o.s, [...(porMoeda.get(o.s) ?? []), x]);
      }
      const moedas = [...porMoeda.values()];
      const aFavor = moedas.filter((xs2) => mediana(xs2) > ref).length;
      partes.push(
        `${h}d ${pct(med)} (${((med - ref) * 100).toFixed(2)} p.p., ${aFavor}/${moedas.length})`,
      );
    }
    console.log(`${cabeca} · ${partes.join(" · ")}`);
  }
}

console.log(
  "\nO número entre parênteses é a separação contra a referência e quantas moedas\n" +
    "ficam acima dela. Negativo em toda linha significa que o salto de volume prevê\n" +
    "QUEDA, e mais queda quanto maior o salto. O filtro de preço parado suaviza e\n" +
    "não inverte: acumulação silenciosa não aparece como vantagem em nenhum corte.",
);
