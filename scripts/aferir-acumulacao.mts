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
 * ============================================== AS TRÊS CORREÇÕES QUE ISTO TRAZ
 *
 * A primeira versão usava a metodologia do `placar` e do `aferir-garimpo` — a do
 * projeto inteiro — e ela tem três buracos que ninguém tinha medido. Os três
 * foram tapados aqui, e o resultado de tapar cada um está escrito, porque
 * conserto sem antes-e-depois é fé.
 *
 * 1. A REFERÊNCIA GLOBAL CONFUNDE EVENTO COM MARÉ. Comparar o desfecho do grupo
 *    com a mediana de TODAS as observações do período supõe que os eventos estão
 *    espalhados no tempo — e eles não estão: salto de volume acontece em dia de
 *    mercado agitado, e mercado agitado é seguido de queda geral. A correção é o
 *    EXCESSO: de cada observação se subtrai a mediana do retorno à frente de
 *    todas as moedas que começam NO MESMO DIA. É o fator de mercado, casado por
 *    data.
 *
 *    MEDIDO, O CONSERTO MUDA POUCO, e isso é notícia boa sobre o projeto: no
 *    salto ≥10x a separação vai de −5,68 p.p. (global) para −5,41% (excesso), e
 *    no ≥40x de −11,28 para −10,96. O atalho global não estava mentindo aqui.
 *    Testado também contra o achado principal do garimpo, na janela de 200 dias
 *    dele: −11,82 p.p. pela régua global contra −11,01% de excesso. Também
 *    aguenta.
 *
 * 2. O MESMO EVENTO ERA CONTADO VÁRIAS VEZES. Um salto de volume não dura um
 *    dia: o MOVR fez 182x em 27/08 e ainda 112x, 22x e 24x nos três dias
 *    seguintes. Cada um desses dias virava uma observação, todas do MESMO evento
 *    e com janelas à frente sobrepostas — o `n` inflava e a precisão aparente
 *    junto. A correção é um período de carência: depois de um evento, a moeda só
 *    volta a contar 14 dias depois.
 *
 *    MEDIDO: o `n` do salto ≥10x cai de 7.497 para 2.570 — ou seja, DOIS TERÇOS
 *    das observações eram repetição —, e o efeito encolhe de −5,41% para −4,79%
 *    de excesso. Continua de pé, com um terço da amostra que se dizia ter.
 *
 * 3. MEDIANA SEM INTERVALO NÃO DIZ SE É RUÍDO. O projeto usa a concordância
 *    entre moedas para isso, e ela é boa, mas não dá tamanho de incerteza. Aqui
 *    entra um BOOTSTRAP POR MOEDA: reamostra moedas inteiras, não observações,
 *    porque é a moeda que é a unidade independente — as observações de uma mesma
 *    moeda se parecem entre si, e reamostrá-las uma a uma daria intervalo
 *    estreito demais.
 *
 *    MEDIDO: todo intervalo desta medição exclui o zero, inclusive o do corte
 *    mais escasso (≥40x com preço parado, n=148): −9,21% [−11,93, −4,71].
 *
 * =================================================== O QUE SAIU, DEPOIS DE TUDO
 *
 * O SALTO DE VOLUME PREVÊ QUEDA, e mais quanto maior o salto. Com carência de 14
 * dias e excesso sobre o mercado do dia, o salto ≥40x mede −10,45% em sete dias
 * e o ≥10x mede −4,79%. A versão otimista da tese — volume recorde COM o preço
 * parado no dia — mede −9,21% no corte de 40x. Ela é a menos ruim das leituras e
 * continua bem abaixo de zero.
 *
 * A PRESSÃO COMPRADORA NÃO EXISTE COMO LEITURA AQUI, e esta é a parte que mais
 * economiza trabalho de quem vier depois. A tese diz "houve COMPRA pesada"; no
 * perpétuo toda negociação tem os dois lados, e a fração agressiva compradora
 * fica presa em 0,5 mesmo nos dias de volume recorde: p10 = 0,479, mediana =
 * 0,496, p90 = 0,510 sobre 7.627 dias de salto ≥10x. Cortar em "compra ≥55%"
 * deixa SETE observações no universo inteiro — não dá nem para medir.
 *
 * E ESTAR BARATO NÃO CONSERTA O DIA. Depois de um salto, toda faixa de preço
 * contra o VWAP de 90 dias fica abaixo do mercado do dia, e a faixa mais barata
 * de todas — 50% ou mais abaixo do VWAP — é a pior: preço muito abaixo do que o
 * dinheiro pagou não é desconto, é a moeda ainda caindo.
 *
 * O TAMANHO DO EFEITO DEPENDE DA JANELA, e isto vale para o garimpo também. A
 * mesma faixa de alta de 25 a 50% mede −11,01% de excesso nos últimos 200 dias e
 * −6,93% sobre os quatro anos inteiros. Mesmo sinal, metade do tamanho. Quem usa
 * o número de 200 dias como constante está usando o regime recente.
 *
 * O VIÉS DE SOBREVIVÊNCIA CORRE A FAVOR DA CONCLUSÃO: o universo é quem está
 * listado HOJE, então as moedas que tiveram volume recorde e foram deslistadas
 * depois — as de pior desfecho — ficaram de fora da conta.
 *
 * O QUE ISTO NÃO MEDE: quem compra DEPOIS que a poeira baixa. Toda observação
 * aqui entra no dia do salto. Uma tese de acumulação que só compre semanas
 * depois, sobre a faixa já formada, é outra medição e não está feita.
 *
 * A LEITURA POR MOEDA que sai disto está em `lib/acumulacao.ts` e aparece na
 * coluna `volume` do painel. `npm run acumulacao` imprime a fila inteira.
 *
 * CUSTO: uma requisição de velas por símbolo, ~530 no total.
 *
 * Rode com: npm run aferir-acumulacao
 */

import { velas, type Vela } from "../lib/binance";
import { comLimite } from "../lib/limite";

/** Horizontes à frente, em dias. */
const HORIZONTES = [7, 14, 30];

/**
 * A janela que define "volume normal", em dias.
 *
 * Noventa porque é o que o gráfico de quem olha chama de normal. Mediana e não
 * média: é o dia atípico que se está medindo, e a média contaminada pelo pico
 * anterior encolheria o salto até ele sumir.
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

/**
 * Carência entre eventos da MESMA moeda, em dias.
 *
 * Catorze porque é o maior horizonte que entra na conclusão: abaixo disso duas
 * observações da mesma moeda compartilham dias de janela à frente e deixam de
 * ser independentes. Ver o buraco nº 2 no cabeçalho.
 */
const CARENCIA = 14;

/** Moedas mínimas num dia para ele ter fator de mercado. Menos que isso não é maré. */
const MOEDAS_PARA_MARE = 30;

/** Voltas do bootstrap. 300 estabiliza o intervalo na segunda casa. */
const VOLTAS = 300;

/**
 * O sorteio do bootstrap é SEMEADO, e isso não é preciosismo.
 *
 * Este script existe para alguém rodar de novo e conferir o número que está
 * escrito no cabeçalho, no README e na tela. Com `Math.random` o intervalo se
 * mexia na segunda casa a cada execução, e aí não dá para saber se a diferença
 * é o mercado que andou ou o sorteio que caiu diferente — que é exatamente a
 * dúvida que a conferência deveria eliminar. Semeado, duas execuções no mesmo
 * dia dão o mesmo intervalo, e qualquer mudança é dado novo.
 */
function sorteio(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mediana = (xs: number[]): number => {
  if (xs.length === 0) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const pct = (v: number) =>
  Number.isFinite(v) ? `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(2)}%` : "—";
const pp = (v: number) => (Number.isFinite(v) ? `${(v * 100).toFixed(2)} p.p.` : "—");

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

// ------------------------------------------------- o fator de mercado por data
//
// A mediana do retorno à frente de TODAS as moedas que começam no MESMO dia. É
// o que separa "este evento foi ruim" de "esta semana foi ruim para tudo".

const mercado = new Map<number, Map<number, number>>();
for (const h of HORIZONTES) {
  const porDia = new Map<number, number[]>();
  for (const v of series.values()) {
    for (let i = 0; i + h < v.length; i++) {
      const a = v[i].close, b = v[i + h].close;
      if (a > 0 && b > 0) porDia.set(v[i].time, [...(porDia.get(v[i].time) ?? []), b / a - 1]);
    }
  }
  const m = new Map<number, number>();
  for (const [t, xs] of porDia) if (xs.length >= MOEDAS_PARA_MARE) m.set(t, mediana(xs));
  mercado.set(h, m);
}

// ---------------------------------------------- a referência global, a régua antiga
//
// Fica na tela ao lado da nova de propósito: é assim que se vê que as duas
// concordam, e o dia em que pararem de concordar a tela avisa.

const refGlobal = new Map<number, number>();
for (const h of HORIZONTES) {
  const todas: number[] = [];
  for (const v of series.values()) {
    for (let i = BASE; i + h < v.length; i++) {
      const a = v[i].close, b = v[i + h].close;
      if (a > 0 && b > 0) todas.push(b / a - 1);
    }
  }
  refGlobal.set(h, mediana(todas));
}
console.log(
  "referência global (régua antiga): " +
    HORIZONTES.map((h) => `${h}d ${pct(refGlobal.get(h)!)}`).join(" · "),
);
console.log(
  "fator de mercado por data: " +
    HORIZONTES.map((h) => `${h}d em ${mercado.get(h)!.size} dias`).join(" · "),
);

// ------------------------------------------------------------------- a medição

interface Obs {
  s: string;
  t: number;
  bruto: Map<number, number>;
  excesso: Map<number, number>;
}

/** Um filtro sobre o dia `i` da série `v`, além do salto e do achatamento. */
type Extra = (v: Vela[], i: number) => boolean;

function observar(
  saltoMin: number,
  achatado: number | null,
  extra?: Extra,
  carencia = CARENCIA,
): Obs[] {
  const obs: Obs[] = [];
  for (const [s, v] of series) {
    let bloqueadoAte = -1;
    for (let i = BASE; i + HORIZONTES[0] < v.length; i++) {
      if (i < bloqueadoAte) continue;
      const base = mediana(v.slice(i - BASE, i).map((k) => k.volume));
      // `Number.isFinite` e não `> 0`: NaN fura os dois lados de uma comparação.
      if (!Number.isFinite(base) || base <= 0) continue;
      if (v[i].volume / base < saltoMin) continue;
      if (achatado !== null) {
        const andou = Math.abs(v[i].close / v[i].open - 1);
        if (!Number.isFinite(andou) || andou > achatado) continue;
      }
      if (extra && !extra(v, i)) continue;

      const bruto = new Map<number, number>();
      const excesso = new Map<number, number>();
      for (const h of HORIZONTES) {
        if (i + h >= v.length) continue;
        const a = v[i].close, b = v[i + h].close;
        if (!(a > 0 && b > 0)) continue;
        const r = b / a - 1;
        bruto.set(h, r);
        const mkt = mercado.get(h)!.get(v[i].time);
        if (mkt !== undefined) excesso.set(h, r - mkt);
      }
      if (bruto.size > 0) {
        obs.push({ s, t: v[i].time, bruto, excesso });
        bloqueadoAte = i + carencia;
      }
    }
  }
  return obs;
}

/**
 * Intervalo de 95% reamostrando MOEDAS, não observações.
 *
 * A unidade independente é a moeda: duas observações da mesma moeda se parecem
 * entre si, e reamostrar observação a observação daria um intervalo estreito
 * demais — o erro clássico de tratar dado agrupado como independente.
 */
function intervalo(obs: Obs[], h: number): [number, number] {
  const porMoeda = new Map<string, number[]>();
  for (const o of obs) {
    const x = o.excesso.get(h);
    if (x !== undefined) porMoeda.set(o.s, [...(porMoeda.get(o.s) ?? []), x]);
  }
  // ORDENADO POR SÍMBOLO, e isto é o que faltava para a semente valer: o `Map`
  // de séries é preenchido na ordem em que a rede responde, então `values()`
  // saía numa ordem diferente a cada execução e o sorteio semeado escolhia
  // moedas diferentes com a mesma sequência de números. A mediana não mudava, o
  // intervalo mudava na segunda casa — e um intervalo que se mexe sozinho é
  // exatamente o que impede alguém de conferir o número escrito.
  const moedas = [...porMoeda.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([, xs]) => xs);
  if (moedas.length < 5) return [NaN, NaN];

  // A semente sai do próprio grupo, então cada linha da tabela tem o seu
  // sorteio e todas são reprodutíveis.
  const proximo = sorteio(moedas.length * 7919 + obs.length);
  const meds: number[] = [];
  for (let b = 0; b < VOLTAS; b++) {
    const amostra: number[] = [];
    for (let k = 0; k < moedas.length; k++) {
      amostra.push(...moedas[Math.floor(proximo() * moedas.length)]);
    }
    meds.push(mediana(amostra));
  }
  meds.sort((a, b) => a - b);
  return [meds[Math.floor(VOLTAS * 0.025)], meds[Math.floor(VOLTAS * 0.975)]];
}

/** A linha de resultado de um grupo: régua antiga, excesso, intervalo e moedas. */
function linha(cabeca: string, obs: Obs[]): string {
  const partes: string[] = [];
  for (const h of HORIZONTES) {
    const br = obs.map((o) => o.bruto.get(h)).filter((x): x is number => x !== undefined);
    const ex = obs.map((o) => o.excesso.get(h)).filter((x): x is number => x !== undefined);
    const [lo, hi] = intervalo(obs, h);
    const moedas = new Set(obs.filter((o) => o.excesso.has(h)).map((o) => o.s)).size;
    partes.push(
      `${String(h).padStart(2)}d  global ${pp(mediana(br) - refGlobal.get(h)!).padStart(11)}` +
        ` · excesso ${pct(mediana(ex)).padStart(8)}` +
        ` [${(lo * 100).toFixed(2)}, ${(hi * 100).toFixed(2)}] · ${moedas} moedas`,
    );
  }
  return `${cabeca} · n=${String(obs.length).padStart(5)}\n    ${partes.join("\n    ")}`;
}

console.log(
  `\n${"=".repeat(78)}\n1. A DERIVA DO EVENTO — salto contra a mediana de ${BASE} dias, ` +
    `carência de ${CARENCIA} dias\n${"=".repeat(78)}`,
);

for (const salto of SALTOS) {
  for (const achatado of ACHATADOS) {
    console.log(
      linha(
        `≥${String(salto).padStart(2)}x · ` +
          (achatado === null ? "preço livre" : `|dia| ≤${(achatado * 100).toFixed(0)}%`),
        observar(salto, achatado),
      ),
    );
  }
}

console.log(
  "\n  'global' é a separação pela régua antiga do projeto; 'excesso' é contra o\n" +
    "  mercado do MESMO dia, e entre colchetes vai o intervalo de 95% reamostrando\n" +
    "  moedas. As duas réguas concordam, e todo intervalo exclui o zero.",
);

// ---------------------------------------- 2. o que a carência muda

console.log(`\n${"=".repeat(78)}\n2. O QUE A CARÊNCIA MUDA\n${"=".repeat(78)}`);

for (const salto of [10, 40]) {
  const h = 7;
  const excessoDe = (obs: Obs[]) =>
    pct(mediana(obs.map((o) => o.excesso.get(h)).filter((x): x is number => x !== undefined)));
  const semCarencia = observar(salto, null, undefined, 1);
  const comCarencia = observar(salto, null);
  console.log(
    `  ≥${salto}x · sem carência n=${String(semCarencia.length).padStart(5)} excesso ${excessoDe(semCarencia)}` +
      ` · com carência de ${CARENCIA}d n=${String(comCarencia.length).padStart(5)} excesso ${excessoDe(comCarencia)}`,
  );
}
console.log(
  "  Dois terços das observações eram o MESMO evento contado em dias seguidos.\n" +
    "  O efeito encolhe e continua de pé.",
);

// ------------------------------------------- 3. a estabilidade no tempo

console.log(`\n${"=".repeat(78)}\n3. ESTABILIDADE: as duas metades da janela\n${"=".repeat(78)}`);

{
  const todos = observar(10, null);
  const tempos = todos.map((o) => o.t).sort((a, b) => a - b);
  const corte = tempos[Math.floor(tempos.length / 2)];
  const h = 7;
  for (const [nome, filtro] of [
    ["primeira metade", (o: Obs) => o.t < corte],
    ["segunda metade ", (o: Obs) => o.t >= corte],
  ] as [string, (o: Obs) => boolean][]) {
    const g = todos.filter(filtro);
    const ex = g.map((o) => o.excesso.get(h)).filter((x): x is number => x !== undefined);
    const [lo, hi] = intervalo(g, h);
    console.log(
      `  ≥10x · ${nome} · n=${String(g.length).padStart(4)} · excesso 7d ${pct(mediana(ex))} ` +
        `[${(lo * 100).toFixed(2)}, ${(hi * 100).toFixed(2)}]`,
    );
  }
  console.log(`  (corte em ${new Date(corte * 1000).toISOString().slice(0, 10)})`);
}

// ------------------------------------------- 4. a pressão compradora não existe

console.log(`\n${"=".repeat(78)}\n4. A PRESSÃO COMPRADORA NÃO SE MEDE AQUI\n${"=".repeat(78)}`);

{
  const ps: number[] = [];
  for (const v of series.values()) {
    for (let i = BASE; i < v.length; i++) {
      const base = mediana(v.slice(i - BASE, i).map((k) => k.volume));
      if (!Number.isFinite(base) || base <= 0) continue;
      if (v[i].volume / base < 10 || !(v[i].volume > 0) || !(v[i].takerBuy > 0)) continue;
      ps.push(v[i].takerBuy / v[i].volume);
    }
  }
  const ord = [...ps].sort((a, b) => a - b);
  const q = (f: number) => ord[Math.floor(ord.length * f)]?.toFixed(3) ?? "—";
  console.log(
    `  ${ord.length.toLocaleString("pt-BR")} dias de salto ≥10x: ` +
      `p10 ${q(0.1)} · mediana ${q(0.5)} · p90 ${q(0.9)}`,
  );
  const agressiva = (v: Vela[], i: number) =>
    v[i].volume > 0 && v[i].takerBuy > 0 && v[i].takerBuy / v[i].volume >= 0.55;
  console.log(
    `  corte "compra ≥55%": ${observar(10, null, agressiva, 1).length} observações no universo inteiro.`,
  );
  console.log(
    "  Não é que a tese esteja errada nesse corte: é que ela não tem em que ser\n" +
      "  medida. No perpétuo toda negociação tem os dois lados.",
  );
}

// ------------------------------------ 5. estar barato não conserta o dia

console.log(
  `\n${"=".repeat(78)}\n5. PREÇO CONTRA O VWAP DE ${BASE} DIAS, DEPOIS DE UM SALTO ≥10x\n${"=".repeat(78)}`,
);

/** VWAP da janela: o preço médio que o dinheiro pagou nos `n` dias antes de `i`. */
function vwap(v: Vela[], i: number, n: number): number {
  let precoVezesVolume = 0;
  let volumeTotal = 0;
  for (let k = Math.max(0, i - n); k < i; k++) {
    const tipico = (v[k].high + v[k].low + v[k].close) / 3;
    if (!Number.isFinite(tipico) || !Number.isFinite(v[k].volume)) continue;
    precoVezesVolume += tipico * v[k].volume;
    volumeTotal += v[k].volume;
  }
  return volumeTotal > 0 ? precoVezesVolume / volumeTotal : NaN;
}

const FAIXAS: [string, number, number][] = [
  ["50%+ abaixo    ", -1, -0.5],
  ["30 a 50% abaixo", -0.5, -0.3],
  ["15 a 30% abaixo", -0.3, -0.15],
  ["0 a 15% abaixo ", -0.15, 0],
  ["0 a 15% acima  ", 0, 0.15],
  ["15%+ acima     ", 0.15, 99],
];
for (const [nome, lo, hi] of FAIXAS) {
  const naFaixa: Extra = (v, i) => {
    const w = vwap(v, i, BASE);
    if (!Number.isFinite(w) || w <= 0) return false;
    const d = v[i].close / w - 1;
    return d >= lo && d < hi;
  };
  console.log(linha(nome, observar(10, null, naFaixa)));
}

console.log(
  `\n${"─".repeat(78)}\n` +
    "Negativo em toda linha significa que o salto de volume prevê QUEDA, e mais\n" +
    "quanto maior o salto. O filtro de preço parado suaviza e não inverte; estar\n" +
    "barato contra o VWAP também não. Acumulação silenciosa não aparece como\n" +
    "vantagem em nenhum corte, com nenhuma das duas réguas.",
);
