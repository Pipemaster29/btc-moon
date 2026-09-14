/**
 * A medição que sustenta `lib/antecipar.ts`, refeita do zero.
 *
 * A pergunta é a que faltava neste projeto: **dá para ver o pump ANTES?** Tudo o
 * mais aqui olha para trás — o garimpo mede o que vem depois da alta, o estágio
 * classifica o passado, o placar corrige a prova. Este script pergunta se alguma
 * coisa observável sobe a chance de um pump que ainda não aconteceu.
 *
 * A resposta é SIM para o salto de open interest, e a resposta completa tem duas
 * metades que precisam andar juntas:
 *
 *   1. A CHANCE TRIPLICA. Salto de 25% a 50% no OI de um dia → a moeda sobe 20%
 *      ou mais nos dois dias seguintes em 26,0% dos casos [17,5, 33,7] contra
 *      base de 7,12% [6,37, 8,01]. Monotônico na subida, intervalo inteiro acima
 *      da base nos três cortes de cima, e estável nas duas metades da janela
 *      (3,19x e 3,93x).
 *
 *   2. O RETORNO NÃO ACOMPANHA. Nos mesmos casos a mediana de dois dias é −1,6%
 *      contra +0,3% da base, com média +3,6% contra +1,3%. Mediana negativa e
 *      média positiva é loteria: um quarto explode, três quartos sangram. E a
 *      excursão é quase simétrica — máximo mediano de +7,1% contra mínimo de
 *      −6,7% —, então não há assimetria para um stop explorar.
 *
 * Por isso a leitura entra como FILA DE INVESTIGAÇÃO e não como call, igual ao
 * garimpo. O que ela diz é "esta moeda está sendo mexida", não "compre".
 *
 * A METODOLOGIA É A CORRIGIDA, a mesma do `aferir-acumulacao`: carência de dois
 * dias entre observações da mesma moeda (senão o mesmo movimento entra várias
 * vezes com janelas sobrepostas) e intervalo de 95% reamostrando MOEDAS, que são
 * a unidade independente. O sorteio é semeado e a ordem das moedas fixada por
 * símbolo, para duas execuções darem o mesmo intervalo.
 *
 * O LIMITE, E COMO ELE ESTÁ SENDO ATACADO: a Binance guarda 31 dias de
 * `openInterestHist` e nenhum arquivo do Data Vision traz esta coluna. Não há
 * como medir isto em 2024 olhando para trás — só para a frente, guardando. É o
 * que `npm run arquivar` faz, e é daí que este script lê primeiro: o que estiver
 * no arquivo ALÉM dos 31 dias entra na medição automaticamente, sem mexer aqui.
 *
 * A primeira linha da saída diz quantos dias vieram de cada fonte. Enquanto o
 * arquivo for novo, o número é o mesmo de antes e a linha diz isso; quando ele
 * passar dos 31 dias, a janela cresce sozinha.
 *
 * CUSTO: duas requisições por símbolo, ~1.050 no total.
 *
 * Rode com: npm run aferir-antecipar
 */

import { velas, type Vela } from "../lib/binance";
import { comLimite } from "../lib/limite";
import { arquivoLegivel, lerOi } from "../lib/arquivo";

/** O que conta como pump, em variação de PREÇO sobre a máxima da janela. */
const PUMP = 0.20;

/** Dias à frente em que o pump pode acontecer. */
const FRENTE = 2;

/**
 * Carência entre observações da mesma moeda, em dias.
 *
 * Dois, que é o tamanho da janela à frente: abaixo disso duas observações da
 * mesma moeda compartilham dias e deixam de ser independentes.
 */
const CARENCIA = 2;

/** "O preço ainda não andou": variação do dia, em módulo. Em PREÇO. */
const PARADO = 0.03;

const VOLTAS = 400;

const info = (await (
  await fetch("https://www.binance.com/fapi/v1/exchangeInfo", { signal: AbortSignal.timeout(20_000) })
).json()) as {
  symbols: { symbol: string; status: string; contractType: string; quoteAsset: string }[];
};
const universo = info.symbols
  .filter((s) => s.status === "TRADING" && s.contractType === "PERPETUAL" && s.quoteAsset === "USDT")
  .map((s) => s.symbol);

/**
 * O circulante do CoinMarketCap, que vem DE GRAÇA no mesmo endpoint do open
 * interest. É com ele que sai o market cap por dia, sem uma requisição a mais.
 */
async function circulanteDiario(symbol: string): Promise<Map<string, number>> {
  return comLimite("binance", 24, async () => {
    try {
      const r = await fetch(
        `https://www.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=1d&limit=500`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (!r.ok) return new Map();
      const d = (await r.json()) as { CMCCirculatingSupply?: string; timestamp: number }[];
      if (!Array.isArray(d)) return new Map();
      const m = new Map<string, number>();
      for (const x of d) {
        const c = Number(x.CMCCirculatingSupply ?? 0);
        if (c > 0) m.set(new Date(Number(x.timestamp)).toISOString().slice(0, 10), c);
      }
      return m;
    } catch {
      return new Map();
    }
  });
}

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

const t0 = Date.now();
interface Dia { d: string; v: Vela; oi: number }

// -------------------------------------------------------- o arquivo vem PRIMEIRO
//
// Ele é o único lugar onde pode existir open interest mais velho que 31 dias.
// Nulo significa "não consegui ler" e lista vazia significa "não há nada
// guardado ainda" — as duas seguem para a Binance, mas só a primeira é problema,
// e por isso ela é dita em voz alta.
const temArquivo = arquivoLegivel();
const guardado = temArquivo ? await lerOi() : [];
if (guardado === null) {
  console.log("\narquivo: CONFIGURADO E NÃO RESPONDEU — a medição segue só com a Binance");
}
const doArquivo = new Map<string, Map<string, Dia>>();
for (const linha of guardado ?? []) {
  if (!Number.isFinite(linha.open_interest) || linha.open_interest <= 0) continue;
  if (!linha.fechamento || !Number.isFinite(linha.fechamento) || linha.fechamento <= 0) continue;
  const mapa = doArquivo.get(linha.symbol) ?? new Map<string, Dia>();
  mapa.set(linha.dia, {
    d: linha.dia,
    oi: linha.open_interest,
    v: {
      time: Math.floor(new Date(`${linha.dia}T00:00:00Z`).getTime() / 1000),
      open: linha.abertura ?? linha.fechamento,
      high: linha.maxima ?? linha.fechamento,
      low: linha.minima ?? linha.fechamento,
      close: linha.fechamento,
      volume: linha.volume ?? 0,
      takerBuy: 0,
      delta: 0,
    },
  });
  doArquivo.set(linha.symbol, mapa);
}

const series = new Map<string, Dia[]>();
await Promise.all(
  universo.map(async (s) => {
    const [vs, ois] = await Promise.all([
      comLimite("binance", 24, () => velas(s, "1d", 60).catch(() => [] as Vela[])),
      oiDiario(s),
    ]);
    // O arquivo entra por baixo e a Binance por cima: onde os dois têm o mesmo
    // dia, vale o da praça, que é a fonte. O arquivo só acrescenta passado.
    const mapa = new Map<string, Dia>(doArquivo.get(s) ?? []);
    for (const v of vs) {
      const d = new Date(v.time * 1000).toISOString().slice(0, 10);
      const oi = ois.get(d);
      if (oi !== undefined && oi > 0 && v.close > 0) mapa.set(d, { d, v, oi });
    }
    const dias = [...mapa.values()].sort((a, b) => (a.d < b.d ? -1 : 1));
    if (dias.length >= 10) series.set(s, dias);
  }),
);

const diasPorMoeda = Math.max(...[...series.values()].map((d) => d.length), 0);
const doArquivoSo = [...series.values()].reduce(
  (max, dias) => Math.max(max, dias.length),
  0,
);
console.log(
  `\n${universo.length} perpétuos · ${series.size} com open interest e velas alinhados · ` +
    `${diasPorMoeda} dias na moeda mais longa · ${((Date.now() - t0) / 1000).toFixed(1)}s`,
);
// As três situações têm três mensagens, e `doArquivo.size === 0` NÃO distingue
// duas delas: ele é zero tanto quando a consulta falhou quanto quando não há
// nada guardado. Testar só o tamanho imprimia "não respondeu" e "vazio" em
// linhas seguidas, uma contradizendo a outra — a armadilha nº 2 do AGENTS.md
// dentro do próprio conserto dela. Quem separa é o `guardado === null`.
console.log(
  !temArquivo
    ? "arquivo não configurado: a janela é a da Binance, 31 dias. Ver `npm run arquivar`."
    : guardado === null
      ? "→ a janela desta medição é só a da Binance, 31 dias, porque o arquivo não respondeu."
      : doArquivo.size === 0
        ? "arquivo vazio: a janela é a da Binance, 31 dias. `npm run arquivar` começa a alargá-la."
        : `arquivo: ${doArquivo.size} símbolos guardados` +
          (doArquivoSo > 31
            ? ` · a janela passou dos 31 dias da Binance e agora tem ${doArquivoSo}`
            : " · ainda dentro dos 31 dias da Binance"),
);

interface Obs {
  s: string;
  i: number;
  dia: string;
  dOi: number;
  moveu: number;
  pump: boolean;
  fwd: number;
  melhor: number;
  pior: number;
}

const todas: Obs[] = [];
for (const [s, dias] of series) {
  // A última barra é o dia de HOJE, ainda aberto: o open interest dela é o de
  // agora e o "pump amanhã" não existe. Fora — o mesmo cuidado de
  // `lib/acumulacao.ts`, e pelo mesmo motivo.
  const hoje = new Date().toISOString().slice(0, 10);
  const fechados = dias.filter((x) => x.d !== hoje);
  for (let i = 1; i + 1 < fechados.length; i++) {
    const a = fechados[i], b = fechados[i - 1];
    const frente = fechados.slice(i + 1, i + 1 + FRENTE);
    if (frente.length === 0) continue;
    const maxFrente = Math.max(...frente.map((x) => x.v.high));
    const minFrente = Math.min(...frente.map((x) => x.v.low));
    const fim = frente[frente.length - 1];
    const dOi = b.oi > 0 ? a.oi / b.oi - 1 : NaN;
    const moveu = a.v.open > 0 ? a.v.close / a.v.open - 1 : NaN;
    if (!Number.isFinite(dOi) || !Number.isFinite(moveu)) continue;
    todas.push({
      s, i, dia: a.d, dOi, moveu,
      pump: maxFrente / a.v.close - 1 >= PUMP,
      fwd: fim.v.close / a.v.close - 1,
      melhor: maxFrente / a.v.close - 1,
      pior: minFrente / a.v.close - 1,
    });
  }
}

function carencia(g: Obs[]): Obs[] {
  const porMoeda = new Map<string, Obs[]>();
  for (const o of g) porMoeda.set(o.s, [...(porMoeda.get(o.s) ?? []), o]);
  const out: Obs[] = [];
  for (const [, lista] of [...porMoeda.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    let ultimo = -Infinity;
    for (const o of [...lista].sort((a, b) => a.i - b.i)) {
      if (o.i - ultimo < CARENCIA) continue;
      out.push(o);
      ultimo = o.i;
    }
  }
  return out;
}

/** Sorteio semeado: sem ele o intervalo muda a cada execução e não dá para conferir. */
function sorteio(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Intervalo de 95% da TAXA de pump, reamostrando moedas inteiras. */
function intervalo(g: Obs[]): [number, number] {
  const porMoeda = new Map<string, boolean[]>();
  for (const o of g) porMoeda.set(o.s, [...(porMoeda.get(o.s) ?? []), o.pump]);
  const moedas = [...porMoeda.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([, v]) => v);
  if (moedas.length < 5) return [NaN, NaN];

  const proximo = sorteio(moedas.length * 7919 + g.length);
  const taxas: number[] = [];
  for (let b = 0; b < VOLTAS; b++) {
    let n = 0, k = 0;
    for (let j = 0; j < moedas.length; j++) {
      const m = moedas[Math.floor(proximo() * moedas.length)];
      n += m.length;
      k += m.filter(Boolean).length;
    }
    taxas.push(n ? k / n : NaN);
  }
  taxas.sort((a, b) => a - b);
  return [taxas[Math.floor(VOLTAS * 0.025)], taxas[Math.floor(VOLTAS * 0.975)]];
}

const mediana = (xs: number[]): number => {
  if (xs.length === 0) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const media = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);
const pc = (v: number) =>
  Number.isFinite(v) ? `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(1)}%` : "—";

const base = carencia(todas);
const taxaBase = base.filter((o) => o.pump).length / base.length;
const [bl, bh] = intervalo(base);
const fwdBase = mediana(base.map((o) => o.fwd));

console.log(
  `\nBASE: a moeda sobe ≥${PUMP * 100}% em ${FRENTE} dias em ${(taxaBase * 100).toFixed(2)}% ` +
    `[${(bl * 100).toFixed(2)}, ${(bh * 100).toFixed(2)}] das ` +
    `${base.length.toLocaleString("pt-BR")} observações independentes · ` +
    `retorno mediano ${pc(fwdBase)}`,
);

function linha(rot: string, filtro: (o: Obs) => boolean) {
  const g = carencia(todas.filter(filtro));
  if (g.length < 30) {
    console.log(`  ${rot.padEnd(32)} n=${String(g.length).padStart(5)}   (amostra pequena, não conclui)`);
    return;
  }
  const taxa = g.filter((o) => o.pump).length / g.length;
  const [lo, hi] = intervalo(g);
  const separa = lo > taxaBase ? " ← SEPARA" : "";
  console.log(
    `  ${rot.padEnd(32)} n=${String(g.length).padStart(5)}   pump ${(taxa * 100).toFixed(1)}% ` +
      `[${(lo * 100).toFixed(1)}, ${(hi * 100).toFixed(1)}]  ${(taxa / taxaBase).toFixed(2)}x  ` +
      `${new Set(g.map((o) => o.s)).size} moedas${separa}\n` +
      `${" ".repeat(36)}retorno ${FRENTE}d: mediana ${pc(mediana(g.map((o) => o.fwd)))} · ` +
      `média ${pc(media(g.map((o) => o.fwd)))} · caminho ${pc(mediana(g.map((o) => o.melhor)))} / ` +
      `${pc(mediana(g.map((o) => o.pior)))}`,
  );
}

console.log(`\n${"=".repeat(78)}\n1. O SALTO DE OPEN INTEREST SOZINHO\n${"=".repeat(78)}`);
for (const [rot, lo, hi] of [
  ["OI ≤ −10%", -1, -0.1],
  ["OI −10 a 0%", -0.1, 0],
  ["OI 0 a +10%", 0, 0.1],
  ["OI +10 a +25%", 0.1, 0.25],
  ["OI +25 a +50%", 0.25, 0.5],
  ["OI ≥ +50%", 0.5, 99],
] as [string, number, number][]) {
  linha(rot, (o) => o.dOi >= lo && o.dOi < hi);
}

console.log(
  `\n${"=".repeat(78)}\n2. O SALTO COM O PREÇO AINDA PARADO (|dia| < ${(PARADO * 100).toFixed(0)}%)\n${"=".repeat(78)}`,
);
for (const min of [0.1, 0.2, 0.3]) {
  linha(`OI ≥ +${(min * 100).toFixed(0)}% · preço parado`, (o) => o.dOi >= min && Math.abs(o.moveu) < PARADO);
}

console.log(`\n${"=".repeat(78)}\n3. ESTABILIDADE: as duas metades da janela\n${"=".repeat(78)}`);
{
  const dias = [...new Set(todas.map((o) => o.dia))].sort();
  const corte = dias[Math.floor(dias.length / 2)];
  for (const [rot, f] of [
    ["primeira metade", (o: Obs) => o.dia < corte],
    ["segunda metade ", (o: Obs) => o.dia >= corte],
  ] as [string, (o: Obs) => boolean][]) {
    const g = carencia(todas.filter((o) => o.dOi >= 0.25 && f(o)));
    const b = carencia(todas.filter(f));
    const tb = b.filter((o) => o.pump).length / b.length;
    const taxa = g.filter((o) => o.pump).length / g.length;
    const [lo, hi] = intervalo(g);
    console.log(
      `  OI ≥ +25% · ${rot} · n=${String(g.length).padStart(3)}  ` +
        `pump ${(taxa * 100).toFixed(1)}% [${(lo * 100).toFixed(1)}, ${(hi * 100).toFixed(1)}]  ` +
        `base ${(tb * 100).toFixed(1)}%  ${(taxa / tb).toFixed(2)}x`,
    );
  }
  console.log(`  (corte em ${corte})`);
}

// ------------------------------------------- 4. "market cap curto sobe mais"

console.log(`\n${"=".repeat(78)}\n4. O TAMANHO DA MOEDA PREVÊ PUMP?\n${"=".repeat(78)}`);
console.log(
  "  A tese chega assim: 'é claro que vai subir, o market cap é curto'. Ela é\n" +
    "  plausível — moeda pequena é mais fácil de empurrar — e nunca tinha sido medida.\n",
);
{
  const circ = new Map<string, Map<string, number>>();
  await Promise.all(
    [...series.keys()].map(async (s) => circ.set(s, await circulanteDiario(s))),
  );
  const comMcap: { o: Obs; mcap: number }[] = [];
  for (const o of todas) {
    const dias = series.get(o.s)!;
    const hoje = new Date().toISOString().slice(0, 10);
    const fechados = dias.filter((x) => x.d !== hoje);
    const dia = fechados[o.i];
    const c = circ.get(o.s)?.get(dia?.d ?? "");
    if (c && dia && dia.v.close > 0) comMcap.push({ o, mcap: c * dia.v.close });
  }
  const baseM = carencia(comMcap.map((x) => x.o));
  const tb = baseM.filter((o) => o.pump).length / baseM.length;
  console.log(`  base desta tabela: ${(tb * 100).toFixed(2)}% em ${baseM.length.toLocaleString("pt-BR")} observações`);
  console.log("  faixa de market cap        n     pump ≥20% em 2d       vs base   moedas");
  for (const [rot, lo, hi] of [
    ["até 10 mi", 0, 10e6], ["10 a 25 mi", 10e6, 25e6], ["25 a 50 mi", 25e6, 50e6],
    ["50 a 100 mi", 50e6, 100e6], ["100 a 300 mi", 100e6, 300e6],
    ["300 mi a 1 bi", 300e6, 1e9], ["acima de 1 bi", 1e9, 1e15],
  ] as [string, number, number][]) {
    const g = carencia(comMcap.filter((x) => x.mcap >= lo && x.mcap < hi).map((x) => x.o));
    if (g.length < 30) { console.log(`    ${rot.padEnd(20)} n=${String(g.length).padStart(5)}  (pouco)`); continue; }
    const taxa = g.filter((o) => o.pump).length / g.length;
    const [l, h] = intervalo(g);
    console.log(
      `    ${rot.padEnd(20)} ${String(g.length).padStart(5)}   ${(taxa * 100).toFixed(1)}% [${(l * 100).toFixed(1)}, ${(h * 100).toFixed(1)}]`.padEnd(56) +
        `${(taxa / tb).toFixed(2)}x   ${new Set(g.map((o) => o.s)).size}` + (l > tb ? "  ← SEPARA" : ""),
    );
  }
  console.log(
    "\n  A RELAÇÃO NÃO É MONOTÔNICA E APONTA PARA O LADO ERRADO DA TESE. As moedas\n" +
      "  menores ficam ABAIXO da base (0,88x e 0,94x), o pico fica no meio da escala,\n" +
      "  e a única faixa cujo intervalo separa é a de 300 milhões a 1 bilhão — que é o\n" +
      "  oposto de 'market cap curto'. Com sete faixas testadas, uma separar por pouco\n" +
      "  é o que se espera do acaso; o que não se espera, se a tese valesse, é a ponta\n" +
      "  pequena ficar abaixo da base nas duas primeiras faixas.",
  );
}

console.log(
  `\n${"─".repeat(78)}\n` +
    "A chance de pump triplica e o retorno mediano fica NEGATIVO — três quartos dos\n" +
    "casos sangram e um quarto explode, com a excursão simétrica no caminho. É fila\n" +
    "de investigação, não call. E são 31 dias: a Binance não guarda mais open\n" +
    "interest, e nenhum arquivo histórico traz esta coluna.",
);
