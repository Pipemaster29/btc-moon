/**
 * "E se a gente operasse BTC, as top 100, talvez ouro?" — medido.
 *
 * É a pergunta mais natural que se faz sobre este projeto, e ela merece número
 * em vez de opinião, porque a intuição por trás dela é boa: mais universo é mais
 * amostra, e amostra é exatamente o que falta para o placar concluir qualquer
 * coisa. O `lib/garimpo.ts` já foi por esse caminho uma vez e achou o sinal mais
 * forte do repositório nos 526 perpétuos.
 *
 * A resposta é NÃO, e o motivo não é dogma: o sinal que sustenta este painel é
 * uma FUNÇÃO DO TAMANHO da moeda, e ele morre antes de chegar nas top 100.
 *
 * ===================================================== O QUE ESTE SCRIPT MEDE
 *
 *   1. O SINAL POR FAIXA — a mesma medição do `aferir-garimpo` ("subiu ≥25% num
 *      dia, o que acontece em 7 dias?"), separada por market cap. Cada faixa é
 *      comparada com a referência DELA MESMA, senão a comparação mediria o
 *      mercado e não o gatilho.
 *   2. AS CANDIDATAS CITADAS — BTC, ETH, SOL e os dois ouros, com quantas vezes
 *      o gatilho sequer disparou e quantos desvios de um dia o stop de 25%
 *      representa em cada uma.
 *   3. A CORRELAÇÃO — porque "usar BTC" tem uma segunda leitura, melhor que a
 *      primeira: não como posição, como FATOR. Se estas moedas forem beta de
 *      cripto, as doze posições abertas são uma aposta de tamanho doze, e o BTC
 *      serviria de hedge. Tem controle contra pares conhecidos, senão um
 *      resultado de correlação baixa não se distingue de código quebrado.
 *   4. A COBERTURA — quanto das faixas onde o sinal VIVE a watchlist já cobre.
 *      É aqui que sobra espaço, e ele é lateral, não para cima.
 *
 * ================================================= O QUE ELE ACHOU EM 02/10
 *
 * O sinal decai monotonicamente com o tamanho e chega a zero:
 *
 *   faixa             moedas  vol/dia  stop em σ   mediana 7d   vs refer.   a favor
 *   até 30 mi           189     5,9%      4,3       −18,28%    −17,37 p.p.  107/122
 *   30 a 100 mi         167     5,0%      5,0       −12,38%    −11,86 p.p.   76/87
 *   100 a 300 mi         71     4,5%      5,5       − 7,63%    − 7,47 p.p.   18/28
 *   300 mi a 1 bi        41     4,9%      5,1       − 2,98%    − 2,87 p.p.    7/12
 *   1 a 10 bi            39     4,1%      6,2       − 0,02%    + 0,07 p.p.    9/14
 *   acima de 10 bi       12     2,9%      8,6       + 9,77%    + 9,73 p.p.    0/1
 *
 * A faixa de 1 a 10 bilhões é onde as top 100 moram, e lá o efeito é +0,07 p.p.
 * com 34 observações: ele não enfraquece, ele ACABA. A última linha tem n=2 e
 * não mede nada — está aí para isso ficar explícito.
 *
 * (As contagens de moedas por faixa andam alguns números de uma execução para
 * outra, porque o universo da Binance muda e o market cap vem do preço do dia.
 * É por isso que isto é script e não tabela: rodar de novo é conferir.)
 *
 * E o gatilho não dispara nessas moedas. Em 199 dias de vela diária:
 *
 *   BTCUSDT    US$ 1.698 bi · vol/dia 2,00% · stop de 25% = 12,5 σ · 0 dias ≥25%
 *   ETHUSDT    US$   326 bi · vol/dia 2,75% · stop de 25% =  9,1 σ · 0 dias ≥25%
 *   BNBUSDT    US$   102 bi · vol/dia 2,01% · stop de 25% = 12,4 σ · 0 dias ≥25%
 *   SOLUSDT    US$    70 bi · vol/dia 2,92% · stop de 25% =  8,6 σ · 0 dias ≥25%
 *   PAXGUSDT   US$   1,8 bi · vol/dia 1,36% · stop de 25% = 18,4 σ · 0 dias ≥25%
 *   XAUTUSDT   US$   2,9 bi · vol/dia 1,28% · stop de 25% = 19,5 σ · 0 dias ≥25%
 *
 * ZERO. Não é "o sinal é fraco nelas", é que a condição de entrada nunca
 * acontece — nenhuma delas subiu 25% num dia em duzentos dias.
 *
 * O OURO MERECE PARÁGRAFO PRÓPRIO, porque o problema dele é de outra natureza.
 * O mapa de saída inteiro desta carteira é calibrado em volatilidade: o stop de
 * −25% existe porque são "~3 desvios de UM DIA" nestas moedas, e a medição
 * acima confirma (4,2 σ na faixa de baixo). No ouro são 18 a 19 desvios. Stop e
 * alvo nunca disparariam, e toda posição sairia por prazo ou por "painel
 * mudou" — a carteira mediria as minhas regras de saída e não o painel, que é
 * exatamente o que ela existe para não fazer.
 *
 * ====================================== E "USAR BTC COMO FATOR" TAMBÉM NÃO
 *
 * Esta era a hipótese boa, e ela foi REFUTADA pela medição — fica escrito
 * porque hipótese derrubada é resultado:
 *
 *   controle   ETH×BTC r = 0,90 · ETH×SOL 0,83 · BTC×XRP 0,85 · BTC×PAXG 0,51
 *   as 29 moedas da carteira contra o BTC:  r mediano 0,08
 *                                           ZERO delas acima de 0,30
 *                                           sobreposição mediana de 199 dias
 *   entre si (406 pares):                   r médio 0,04
 *
 * O controle é o que dá direito de acreditar nisso: o mesmo código mede 0,90
 * entre ETH e BTC. Então o 0,08 é das moedas, não do código.
 *
 * ESTAS MOEDAS NÃO SÃO BETA DE CRIPTO, e isso se lê sozinho dado o resto do
 * projeto: moeda manipulada segue o manipulador dela, não o mercado. Não há o
 * que proteger com BTC — não há exposição comum para proteger.
 *
 * E A NOTÍCIA BOA ESTÁ AÍ DENTRO: com ρ médio de 0,04, as 12 posições abertas
 * valem 8,2 apostas independentes, e não 1. Isso FORTALECE a conclusão
 * desconfortável do `lib/placar.ts`. "Nenhum viés separa da referência" sobre
 * amostra correlacionada seria evidência fraca, porque o n efetivo seria uma
 * fração do n contado. Sobre amostra quase independente, é evidência forte.
 *
 * ========================================== ONDE SOBRA ESPAÇO, ENTÃO: AO LADO
 *
 * Nas duas faixas em que o sinal vive existem 356 perpétuos e a watchlist cobre
 * 54 — 16% da faixa de baixo e 14% da seguinte. É o mesmo "14%" que o
 * `lib/garimpo.ts` já anotava para o universo inteiro, agora separado por faixa,
 * e é a direção em que expandir significa mais do mesmo sinal em vez de outro.
 *
 * COM UMA RESSALVA QUE JÁ ESTÁ MEDIDA E NÃO MUDA: `lib/garimpo.ts` mostra que
 * VENDER esse sinal perde dinheiro em toda largura de stop testada, porque o
 * caminho estopa a posição antes da deriva. Expandir de lado dá mais AMOSTRA,
 * que é o que o placar precisa. Não dá lucro, e este arquivo não finge que dá.
 *
 * CUSTO: duas requisições por símbolo nos ~528 perpétuos, mais velas diárias das
 * moedas da carteira para a correlação. Leva de dois a quatro minutos.
 *
 * Precisa dos dados do robô em `data/`: rode `npm run dados` antes.
 *
 * Rode com: npm run aferir-tamanho
 */

import { readdir, readFile } from "node:fs/promises";
import { ARQUIVO_HISTORICO } from "../lib/historico";
import { velas } from "../lib/binance";
import { comLimite } from "../lib/limite";
import { ATIVAS } from "../lib/watchlist";

const TETO = 24;

/** Dias à frente, o mesmo horizonte da tabela do `lib/garimpo.ts`. */
const HORIZONTE = 7;
/** A alta de um dia que serve de gatilho, idem. */
const GATILHO = 0.25;
/** O stop da carteira, em variação de PREÇO — para virar desvios por faixa. */
const STOP = 0.25;

const mediana = (xs: number[]): number => {
  if (xs.length === 0) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const pct = (v: number) =>
  Number.isFinite(v) ? `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(2)}%` : "—";
const pp = (v: number) =>
  Number.isFinite(v) ? `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(2)} p.p.` : "—";
const quantil = (a: number[], f: number) => {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(s.length * f))];
};

// --------------------------------------------------------------- o universo

const info = (await (
  await fetch("https://www.binance.com/fapi/v1/exchangeInfo", { signal: AbortSignal.timeout(20_000) })
).json()) as { symbols: { symbol: string; status: string; contractType: string; quoteAsset: string }[] };

const universo = info.symbols
  .filter((s) => s.status === "TRADING" && s.contractType === "PERPETUAL" && s.quoteAsset === "USDT")
  .map((s) => s.symbol);
console.log(`universo: ${universo.length} perpétuos USDT em negociação`);

/**
 * Supply circulante do CoinMarketCap, que vem de graça no endpoint de open
 * interest — é a mesma fonte que `lib/binance.ts` usa, e é o número que
 * `lerVies` mede quando fala de tamanho.
 *
 * Devolve `null` quando não vem. Moeda sem supply não entra em faixa nenhuma, em
 * vez de cair na primeira: "não consegui" e "é pequena" são coisas diferentes.
 */
async function supply(symbol: string): Promise<number | null> {
  return comLimite("binance", TETO, async () => {
    try {
      const r = await fetch(
        `https://www.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=1d&limit=1`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (!r.ok) return null;
      const d = (await r.json()) as { CMCCirculatingSupply?: string }[];
      const s = Number(d?.[0]?.CMCCirculatingSupply);
      return Number.isFinite(s) && s > 0 ? s : null;
    } catch {
      return null;
    }
  });
}

interface Moeda {
  symbol: string;
  mcap: number | null;
  fechamentos: number[];
  /** Desvio padrão do retorno log diário. */
  vol: number;
}

/** Mínimo de velas para a moeda entrar: menos que isto não mede volatilidade. */
const MINIMO_VELAS = 60;

const dados: Moeda[] = [];
await Promise.all(
  universo.map(async (symbol) => {
    const [v, sup] = await Promise.all([velas(symbol, "1d", 200).catch(() => []), supply(symbol)]);
    if (v.length < MINIMO_VELAS) return;
    const fechamentos = v.map((x) => x.close).filter((c) => c > 0);
    if (fechamentos.length < MINIMO_VELAS) return;
    const rets: number[] = [];
    for (let i = 1; i < fechamentos.length; i++) {
      rets.push(Math.log(fechamentos[i] / fechamentos[i - 1]));
    }
    const m = rets.reduce((a, b) => a + b, 0) / rets.length;
    const vol = Math.sqrt(rets.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, rets.length - 1));
    dados.push({
      symbol,
      mcap: sup != null ? sup * fechamentos[fechamentos.length - 1] : null,
      fechamentos,
      vol,
    });
  }),
);
console.log(
  `com série de ${MINIMO_VELAS}+ dias: ${dados.length} · com market cap: ${dados.filter((d) => d.mcap != null).length}`,
);

// ------------------------------------------------- 1. o sinal por faixa

/**
 * As faixas, e elas não são arbitrárias: 30 e 100 milhões são os dois cortes que
 * `lerVies` já usa, medidos lá. O resto sobe por ordem de grandeza até onde as
 * top 100 moram.
 */
const FAIXAS: [string, number, number][] = [
  ["até 30 mi", 0, 30e6],
  ["30 a 100 mi", 30e6, 100e6],
  ["100 a 300 mi", 100e6, 300e6],
  ["300 mi a 1 bi", 300e6, 1e9],
  ["1 a 10 bi", 1e9, 10e9],
  ["acima de 10 bi", 10e9, Infinity],
];

console.log(`\n1. O SINAL "subiu ≥${GATILHO * 100}% num dia" → ${HORIZONTE} dias à frente, POR FAIXA DE TAMANHO`);
console.log(`   cada faixa contra a referência DELA — comparar com a referência geral mediria o mercado\n`);
console.log(
  `faixa            moedas  vol/dia  stop em σ    refer.   n(gatilho)   mediana    vs refer.   a favor`,
);

const resumo: { rotulo: string; delta: number; n: number; aFavor: number; comGatilho: number }[] = [];
for (const [rotulo, de, ate] of FAIXAS) {
  const grupo = dados.filter((d) => d.mcap != null && d.mcap >= de && d.mcap < ate);
  if (grupo.length === 0) {
    console.log(`${rotulo.padEnd(16)} ${"—".padStart(6)}`);
    continue;
  }

  const todos: number[] = [];
  const noGatilho: number[] = [];
  let aFavor = 0;
  let comGatilho = 0;

  for (const d of grupo) {
    const f = d.fechamentos;
    const meusNoGatilho: number[] = [];
    const meusTodos: number[] = [];
    for (let i = 1; i + HORIZONTE < f.length; i++) {
      const alta = f[i] / f[i - 1] - 1;
      const frente = f[i + HORIZONTE] / f[i] - 1;
      if (!Number.isFinite(alta) || !Number.isFinite(frente)) continue;
      todos.push(frente);
      meusTodos.push(frente);
      if (alta >= GATILHO) {
        noGatilho.push(frente);
        meusNoGatilho.push(frente);
      }
    }
    // A concordância é POR MOEDA e contra a própria moeda: mediana boa
    // concentrada em duas ou três moedas é ruído com cara de descoberta, e é a
    // armadilha que o `aferir-garimpo` documenta.
    if (meusNoGatilho.length > 0) {
      comGatilho++;
      if (mediana(meusNoGatilho) < mediana(meusTodos)) aFavor++;
    }
  }

  const ref = mediana(todos);
  const med = mediana(noGatilho);
  const volFaixa = mediana(grupo.map((d) => d.vol));
  resumo.push({ rotulo, delta: med - ref, n: noGatilho.length, aFavor, comGatilho });

  console.log(
    `${rotulo.padEnd(16)} ${String(grupo.length).padStart(6)} ` +
      `${`${(volFaixa * 100).toFixed(1)}%`.padStart(8)} ${(STOP / volFaixa).toFixed(1).padStart(10)} ` +
      `${pct(ref).padStart(9)} ${String(noGatilho.length).padStart(12)} ${pct(med).padStart(9)} ` +
      `${pp(med - ref).padStart(12)} ${`${aFavor}/${comGatilho}`.padStart(9)}`,
  );
}

// ------------------------------------------- 2. as candidatas, nominalmente

console.log(`\n2. AS CANDIDATAS, uma por uma — o gatilho sequer dispara nelas?`);
for (const s of ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "PAXGUSDT", "XAUTUSDT"]) {
  const d = dados.find((x) => x.symbol === s);
  if (!d) {
    console.log(`   ${s.padEnd(10)} fora do universo de perpétuos USDT em negociação`);
    continue;
  }
  const f = d.fechamentos;
  let n = 0;
  for (let i = 1; i < f.length; i++) if (f[i] / f[i - 1] - 1 >= GATILHO) n++;
  console.log(
    `   ${s.padEnd(10)} ${(d.mcap != null ? `US$ ${(d.mcap / 1e9).toFixed(1)} bi` : "sem mcap").padStart(14)} · ` +
      `vol/dia ${`${(d.vol * 100).toFixed(2)}%`.padStart(6)} · stop de 25% = ${`${(STOP / d.vol).toFixed(1)} σ`.padStart(6)} · ` +
      `dias ≥${GATILHO * 100}% em ${f.length - 1}: ${n}`,
  );
}
console.log(
  `   O stop de −25% existe porque são ~3 desvios de UM DIA nas moedas da lista.\n` +
    `   Acima de 10 σ ele nunca dispara, e o mapa de saída inteiro deixa de medir o painel.`,
);

// ----------------------------------- 3. a correlação, com controle

console.log(`\n3. "USAR BTC COMO FATOR" — estas moedas são beta de cripto?`);

const carteira = JSON.parse(await readFile("data/carteira.json", "utf8")) as {
  abertas: { symbol: string; lado: string }[];
  fechadas: { symbol: string }[];
};
const porTicker = new Map(ATIVAS.map((t) => [t.symbol.replace(/USDT$/, ""), t.symbol]));
const negociadas = [...new Set([...carteira.fechadas, ...carteira.abertas].map((p) => p.symbol))];

/** Retornos log diários por símbolo, indexados pelo carimbo da vela. */
const retornos = new Map<string, Map<number, number>>();
const paraCorrelacao = [
  ...new Set([
    ...negociadas.map((t) => porTicker.get(t)).filter((s): s is string => Boolean(s)),
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "XRPUSDT",
    "PAXGUSDT",
  ]),
];
await Promise.all(
  paraCorrelacao.map(async (sym) => {
    const v = await velas(sym, "1d", 200).catch(() => []);
    if (v.length < 40) return;
    const m = new Map<number, number>();
    for (let i = 1; i < v.length; i++) {
      if (v[i - 1].close > 0 && v[i].close > 0) m.set(v[i].time, Math.log(v[i].close / v[i - 1].close));
    }
    retornos.set(sym, m);
  }),
);

/** Mínimo de dias em comum para a correlação significar algo. */
const MINIMO_PARES = 20;

function correlacao(a?: Map<number, number>, b?: Map<number, number>): { r: number; n: number } {
  if (!a || !b) return { r: NaN, n: 0 };
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [t, x] of a) {
    const y = b.get(t);
    if (y !== undefined) {
      xs.push(x);
      ys.push(y);
    }
  }
  const n = xs.length;
  if (n < MINIMO_PARES) return { r: NaN, n };
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (!(sxx > 0) || !(syy > 0)) return { r: NaN, n };
  return { r: sxy / Math.sqrt(sxx * syy), n };
}

// O CONTROLE VEM PRIMEIRO, e não é cerimônia: um resultado de correlação baixa é
// indistinguível de código quebrado sem um par que a gente SAIBA ser alto.
console.log(`   controle (pares que a gente sabe serem altos — se estes derem baixo, o código está errado):`);
for (const [a, b] of [
  ["ETHUSDT", "BTCUSDT"],
  ["ETHUSDT", "SOLUSDT"],
  ["BTCUSDT", "XRPUSDT"],
  ["BTCUSDT", "PAXGUSDT"],
] as const) {
  const { r, n } = correlacao(retornos.get(a), retornos.get(b));
  console.log(`     ${a.padEnd(9)} × ${b.padEnd(9)} r = ${r.toFixed(2)}  (n = ${n} dias)`);
}

const comBtc: number[] = [];
const sobreposicao: number[] = [];
const simbolosCarteira = negociadas
  .map((t) => porTicker.get(t))
  .filter((s): s is string => Boolean(s) && retornos.has(s!));
for (const s of simbolosCarteira) {
  const { r, n } = correlacao(retornos.get("BTCUSDT"), retornos.get(s));
  if (Number.isFinite(r)) {
    comBtc.push(r);
    sobreposicao.push(n);
  }
}

const entreSi: number[] = [];
for (let i = 0; i < simbolosCarteira.length; i++) {
  for (let j = i + 1; j < simbolosCarteira.length; j++) {
    const { r } = correlacao(retornos.get(simbolosCarteira[i]), retornos.get(simbolosCarteira[j]));
    if (Number.isFinite(r)) entreSi.push(r);
  }
}

if (comBtc.length > 0) {
  console.log(
    `   as ${comBtc.length} moedas da carteira × BTC: r mediano ${quantil(comBtc, 0.5).toFixed(2)} ` +
      `(p10 ${quantil(comBtc, 0.1).toFixed(2)} · p90 ${quantil(comBtc, 0.9).toFixed(2)}) · ` +
      `sobreposição mediana ${quantil(sobreposicao, 0.5)} dias`,
  );
  console.log(
    `   acima de 0,30: ${comBtc.filter((r) => r > 0.3).length} de ${comBtc.length} — ` +
      `moeda manipulada segue o manipulador dela, não o mercado`,
  );
}
if (entreSi.length > 0) {
  const rho = entreSi.reduce((s, v) => s + v, 0) / entreSi.length;
  const n = carteira.abertas.length;
  const efetivas = n / (1 + (n - 1) * rho);
  console.log(`   entre si (${entreSi.length} pares): ρ médio ${rho.toFixed(2)}`);
  console.log(
    `   → não há exposição comum para o BTC proteger. E as ${n} posições abertas valem ` +
      `${efetivas.toFixed(1)} apostas independentes, o que FORTALECE o veredito do placar.`,
  );
}

// ----------------------------------- 4. onde sobra espaço

console.log(`\n4. A COBERTURA DAS FAIXAS ONDE O SINAL VIVE — é aqui que sobra espaço`);

/**
 * O market cap CIRCULANTE das moedas da lista.
 *
 * Vem do histórico e não do `panorama.json`, que guarda `fdv` — valor
 * totalmente diluído é outra coisa, e usá-lo jogaria moeda de float curto para
 * faixas acima da dela, que é justamente o erro que `lerVies` mede contra.
 */
const mcapDaLista = new Map<string, number>();
{
  // Todos os arquivos do histórico, pelo mesmo padrão que o resto do projeto usa
  // — desde outubro eles são partidos por quinzena, e um nome fixo de mês
  // deixaria a cobertura em branco sem erro nenhum. Fica o valor mais recente.
  const quando = new Map<string, number>();
  const arquivos = (await readdir("data")).filter((f) => ARQUIVO_HISTORICO.test(f)).sort();
  for (const arquivo of arquivos) {
    const texto = await readFile(`data/${arquivo}`, "utf8");
    for (const linha of texto.split("\n")) {
      if (!linha.trim()) continue;
      try {
        const e = JSON.parse(linha) as { s: string; t: number; mcap?: number | null };
        if (e.mcap != null && Number.isFinite(e.mcap) && e.mcap > 0) {
          const t = quando.get(e.s);
          if (t === undefined || e.t > t) {
            quando.set(e.s, e.t);
            mcapDaLista.set(e.s, e.mcap);
          }
        }
      } catch {
        // linha truncada por escrita concorrente
      }
    }
  }
  if (mcapDaLista.size === 0) {
    console.log("   (sem histórico em data/ — rode `npm run dados` antes; a cobertura fica em branco)");
  }
}

const naLista = (de: number, ate: number) =>
  ATIVAS.map((t) => t.symbol.replace(/USDT$/, "")).filter((tk) => {
    const v = mcapDaLista.get(tk);
    return v !== undefined && v >= de && v < ate;
  }).length;

console.log(`faixa            no universo   na watchlist   cobertura   sinal medido lá`);
let existemBoas = 0;
let cobertasBoas = 0;
for (const [i, [rotulo, de, ate]] of FAIXAS.entries()) {
  const noUniverso = dados.filter((d) => d.mcap != null && d.mcap >= de && d.mcap < ate).length;
  const minhas = naLista(de, ate);
  const r = resumo.find((x) => x.rotulo === rotulo);
  if (i < 2) {
    existemBoas += noUniverso;
    cobertasBoas += minhas;
  }
  console.log(
    `${rotulo.padEnd(16)} ${String(noUniverso).padStart(11)} ${String(minhas).padStart(14)} ` +
      `${`${noUniverso > 0 ? ((minhas / noUniverso) * 100).toFixed(0) : "—"}%`.padStart(11)}   ` +
      `${r ? `${pp(r.delta)} · ${r.aFavor}/${r.comGatilho} moedas` : "—"}`,
  );
}
console.log(
  `\n   Nas duas faixas em que o sinal vive existem ${existemBoas} perpétuos e a lista cobre ` +
    `${cobertasBoas} (${((cobertasBoas / existemBoas) * 100).toFixed(0)}%).`,
);
console.log(
  "   Expandir PARA O LADO é mais do mesmo sinal; expandir PARA CIMA é outro sinal, e a\n" +
    "   tabela 1 diz que ele não existe. Mas lib/garimpo.ts já mediu que VENDER este sinal\n" +
    "   perde em toda largura de stop: o lado dá mais AMOSTRA, que é o que o placar precisa,\n" +
    "   e não dá lucro.",
);
