/**
 * O painel corrigindo a própria prova.
 *
 * Todo parâmetro deste projeto foi medido — mas medido sobre ARQUIVO de preço da
 * Binance, caminhando dia a dia sobre uma reconstrução do que o classificador
 * TERIA dito. Nada nunca mediu o que ele REALMENTE disse. E as duas coisas se
 * separam: o painel ao vivo emite a cada trinta minutos, com preço de pool, open
 * interest da Gate e leitura on-chain que o backtest não tem.
 *
 * O `data/historico-AAAA-MM.jsonl` guarda exatamente isso — uma linha por moeda
 * por execução, com o viés, o estágio e a nota que estavam na tela naquele
 * instante. São 21 mil observações acumuladas e nunca lidas de volta. Este
 * script lê.
 *
 * A PERGUNTA É UMA SÓ: quem seguiu o painel ganhou alguma coisa? Ele responde
 * comparando cada emissão com o preço da própria série algumas horas depois, e
 * separa por viés, por estágio e POR MOEDA — porque mediana boa puxada por duas
 * moedas de muitas observações é o modo mais comum de um resultado mentir aqui.
 *
 * O QUE ELE NÃO É: um backtest. Não há custo de financiamento, nem spread, nem
 * tamanho de posição, e a janela é curta. Serve para saber se existe sinal, não
 * quanto ele renderia.
 *
 * Rode com: npm run placar
 *           npm run placar 48        (horizonte em horas, padrão 24)
 */

import { readdir, readFile, writeFile } from "node:fs/promises";

interface Ponto {
  t: number;
  s: string;
  preco: number;
  vies: string | null;
  estagio: string | null;
  nota: number;
  dom: number;
  floatCex: number | null;
  mcap: number | null;
}

/**
 * Preço abaixo disto não é cotação, é lixo.
 *
 * O JCT registrou 2,938e-27 numa execução e o histórico guardou como se fosse
 * preço. Uma observação dessas vira −100% de retorno e sozinha envenena
 * qualquer mediana. O corte é frouxo de propósito: moeda de verdade nesta lista
 * negocia acima de 1e-12.
 */
const PRECO_MINIMO = 1e-12;

const HORIZONTE = Number(process.argv[2] ?? 24);

const pontos: Ponto[] = [];
for (const f of (await readdir("data")).filter((x) => x.startsWith("historico-"))) {
  for (const linha of (await readFile(`data/${f}`, "utf8")).split("\n")) {
    if (!linha.trim()) continue;
    try {
      const p = JSON.parse(linha) as Ponto;
      if (p.preco > PRECO_MINIMO) pontos.push(p);
    } catch {
      // Linha truncada no meio de uma escrita: o arquivo é append de várias
      // execuções e uma linha perdida não vale abortar a leitura inteira.
    }
  }
}

const porMoeda = new Map<string, Ponto[]>();
for (const p of pontos) {
  const lista = porMoeda.get(p.s) ?? [];
  lista.push(p);
  porMoeda.set(p.s, lista);
}
for (const v of porMoeda.values()) v.sort((a, b) => a.t - b.t);

interface Obs extends Ponto {
  fwd: number;
  /** Retorno à frente MENOS o que as outras moedas fizeram no mesmo instante. */
  excesso: number;
}

/**
 * Todas as observações possíveis, uma por emissão. É daqui que sai o fator de
 * mercado, e é esta a lista que a régua ANTIGA usava inteira.
 */
interface Cru extends Ponto {
  fwd: number;
}
const crus: Cru[] = [];
for (const serie of porMoeda.values()) {
  let j = 0;
  for (const p of serie) {
    // Os dois ponteiros andam juntos porque a série está ordenada: procurar do
    // começo a cada ponto seria quadrático, e são 21 mil pontos.
    while (j < serie.length && serie[j].t < p.t + HORIZONTE * 3600) j++;
    if (j >= serie.length) break;
    crus.push({ ...p, fwd: serie[j].preco / p.preco - 1 });
  }
}

const mediana = (xs: number[]): number => {
  if (xs.length === 0) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const pct = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(2)}%` : "—");

/**
 * O FATOR DE MERCADO, casado por INSTANTE.
 *
 * A régua antiga comparava cada emissão com a mediana de todo o período, e isso
 * supõe que as emissões estão espalhadas no tempo. Elas não estão: o painel emite
 * "comprar" em dezenas de moedas ao mesmo tempo, justamente nos dias em que a
 * lista inteira caiu. Comparar esse bloco com a mediana do mês atribui ao viés o
 * que era do mercado daquele dia.
 *
 * O retrato do panorama grava as ~72 moedas no MESMO carimbo de tempo, então a
 * mediana do retorno à frente dentro de um retrato é exatamente a maré daquele
 * instante. É a melhor referência que este dado permite, e ela não existia.
 */
const MOEDAS_PARA_MARE = 20;
const mare = new Map<number, number>();
{
  const porInstante = new Map<number, number[]>();
  for (const c of crus) porInstante.set(c.t, [...(porInstante.get(c.t) ?? []), c.fwd]);
  for (const [t, xs] of porInstante) {
    if (xs.length >= MOEDAS_PARA_MARE) mare.set(t, mediana(xs));
  }
}

/**
 * A CARÊNCIA, que é o conserto de maior efeito.
 *
 * O painel emite a cada 22 minutos e o horizonte é de 24 horas: a mesma call
 * aparece ~65 vezes por dia, e as 65 janelas à frente se sobrepõem quase
 * inteiramente. Não são 65 observações, é UMA — e contar 65 fazia o `n` parecer
 * vinte mil quando a amostra independente é de algumas centenas.
 *
 * A regra é a mais conservadora: dentro de cada moeda, uma observação só entra
 * quando o horizonte inteiro já passou desde a anterior, então as janelas não se
 * tocam. O custo está escrito junto: uma call que aparece e some dentro das 24h
 * pode não ser contada, e uma corrida longa do mesmo viés entra várias vezes —
 * que é o certo, porque quem seguiu o painel ficou posicionado o tempo todo.
 */
const obs: Obs[] = [];
let descartadasPorCarencia = 0;
for (const serie of porMoeda.values()) {
  const meus = crus.filter((c) => c.s === serie[0]?.s).sort((a, b) => a.t - b.t);
  let ultimoTomado = -Infinity;
  for (const c of meus) {
    if (c.t - ultimoTomado < HORIZONTE * 3600) {
      descartadasPorCarencia++;
      continue;
    }
    const m = mare.get(c.t);
    // Sem maré medida o instante não entra: um retrato com cinco moedas não diz
    // o que o mercado fez, e inventar zero ali seria pior que não usar.
    if (m === undefined) continue;
    obs.push({ ...c, excesso: c.fwd - m });
    ultimoTomado = c.t;
  }
}

const janela = {
  de: new Date(Math.min(...pontos.map((p) => p.t)) * 1000).toISOString().slice(0, 16),
  ate: new Date(Math.max(...pontos.map((p) => p.t)) * 1000).toISOString().slice(0, 16),
};

console.log(
  `${crus.length.toLocaleString("pt-BR")} emissões com ${HORIZONTE}h à frente · ` +
    `${porMoeda.size} moedas · ${janela.de} → ${janela.ate}`,
);
console.log(
  `${obs.length.toLocaleString("pt-BR")} observações INDEPENDENTES depois da carência de ` +
    `${HORIZONTE}h · ${descartadasPorCarencia.toLocaleString("pt-BR")} eram a mesma call ` +
    `repetida · maré medida em ${mare.size} retratos\n`,
);

/**
 * A referência: TODAS as observações juntas.
 *
 * Sem ela nenhum número abaixo significa coisa alguma. Se o mercado inteiro caiu
 * 0,5% no período, um viés que "mede −0,5%" não errou nem acertou — ele
 * descreveu o mercado. O que interessa é a distância até esta linha.
 *
 * Ela fica AO LADO do excesso, e não no lugar dele: é assim que dá para ver as
 * duas réguas concordando, e o dia em que discordarem a tela avisa.
 */
const referencia = mediana(obs.map((o) => o.fwd));
console.log(`referência global (régua antiga): ${pct(referencia)} em ${HORIZONTE}h`);
console.log(
  `mediana do excesso sobre a maré do instante: ${pct(mediana(obs.map((o) => o.excesso)))}\n`,
);

/**
 * Intervalo de 95% reamostrando MOEDAS, não observações.
 *
 * A moeda é a unidade independente: as emissões de uma mesma moeda se parecem
 * entre si, e reamostrar uma a uma daria um intervalo estreito demais — o erro
 * clássico de tratar dado agrupado como se fosse independente.
 *
 * O sorteio é SEMEADO e a ordem das moedas é fixada por símbolo, senão duas
 * execuções no mesmo dado dão intervalos diferentes e ninguém consegue conferir
 * o número que está na tela.
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

const VOLTAS = 400;

function intervalo(grupo: Obs[]): [number, number] {
  const porM = new Map<string, number[]>();
  for (const o of grupo) porM.set(o.s, [...(porM.get(o.s) ?? []), o.excesso]);
  const moedas = [...porM.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([, xs]) => xs);
  if (moedas.length < 5) return [NaN, NaN];

  const proximo = sorteio(moedas.length * 7919 + grupo.length);
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

/**
 * Concordância entre moedas: de quantas o efeito veio.
 *
 * É o teste que mais candidato mata neste projeto, e por isso ele está aqui:
 * uma mediana boa concentrada em duas moedas com centenas de observações é
 * ruído com cara de descoberta.
 */
function porGrupo(chave: (o: Obs) => string | null, titulo: string) {
  const grupos = new Map<string, Obs[]>();
  for (const o of obs) {
    const k = chave(o);
    if (k === null) continue;
    const g = grupos.get(k) ?? [];
    g.push(o);
    grupos.set(k, g);
  }

  console.log(`=== ${titulo} ===`);
  console.log("grupo              n     mediana   vs referência   moedas a favor   subiu");
  const linhas = [...grupos.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [k, g] of linhas) {
    const med = mediana(g.map((o) => o.fwd));
    const delta = med - referencia;

    const porM = new Map<string, number[]>();
    for (const o of g) {
      const l = porM.get(o.s) ?? [];
      l.push(o.fwd);
      porM.set(o.s, l);
    }
    // "A favor" é relativo à referência, não a zero: numa semana de queda geral
    // todo grupo tem mediana negativa e isso não é informação.
    const medianas = [...porM.values()].map(mediana);
    const aFavor = medianas.filter((m) => (delta >= 0 ? m > referencia : m < referencia)).length;
    const subiu = g.filter((o) => o.fwd > 0).length / g.length;

    console.log(
      k.padEnd(17),
      String(g.length).padStart(5),
      pct(med).padStart(10),
      (delta >= 0 ? "+" : "−") + (Math.abs(delta) * 100).toFixed(2).padStart(5) + " p.p.",
      `${String(aFavor).padStart(9)}/${medianas.length}`.padStart(15),
      (subiu * 100).toFixed(0).padStart(7) + "%",
    );
  }
  console.log();
}

porGrupo((o) => o.vies, "por viés emitido");
porGrupo((o) => o.estagio, "por estágio de vida");
porGrupo(
  (o) => (o.nota >= 60 ? "nota 60+" : o.nota >= 35 ? "nota 35-59" : "nota 0-34"),
  "por nota de atenção",
);

/**
 * O placar POR MOEDA.
 *
 * O agregado esconde o que interessa para operar: um viés que não separa no
 * conjunto pode separar em cinco moedas e inverter em outras cinco, e o total
 * dá zero. Quem escolhe uma moeda precisa saber se o painel acerta NELA.
 *
 * A ressalva é grande e vale repetir: são doze dias, e por moeda isso vira
 * poucas dezenas de emissões por viés. Nada aqui sustenta afirmação sozinho —
 * serve para saber onde olhar quando a amostra crescer.
 */
const placarPorMoeda: Record<
  string,
  { n: number; refMoeda: number; vieses: Record<string, { n: number; delta: number }> }
> = {};

const obsPorMoeda = new Map<string, Obs[]>();
for (const o of obs) {
  const l = obsPorMoeda.get(o.s) ?? [];
  l.push(o);
  obsPorMoeda.set(o.s, l);
}

for (const [s2, meus] of obsPorMoeda) {
  // Os cortes caíram de 20 e 10 para 8 e 4 junto com a carência: a contagem
  // antiga era de emissões repetidas, e 20 delas podiam ser uma call só.
  if (meus.length < 8) continue;
  // A referência de CADA moeda é ela mesma: comparar o viés dela com a mediana
  // do grupo mistura "o painel acertou" com "esta moeda andou diferente".
  const refMoeda = mediana(meus.map((o) => o.fwd));
  const vieses: Record<string, { n: number; delta: number }> = {};
  for (const v of ["short", "long", "evitar", "observar"]) {
    const g = meus.filter((o) => o.vies === v);
    if (g.length < 4) continue;
    const med = mediana(g.map((o) => o.fwd));
    vieses[v] = { n: g.length, delta: v === "short" ? refMoeda - med : med - refMoeda };
  }
  if (Object.keys(vieses).length) placarPorMoeda[s2] = { n: meus.length, refMoeda, vieses };
}

console.log("=== por moeda: o painel acerta NESTA? (separação contra a própria mediana) ===");
console.log("moeda        emiss.   short      long    observar");
const melhorDelta = (v: Record<string, { n: number; delta: number }>) =>
  Math.max(...Object.values(v).map((x) => x.delta));
const ordenado = Object.entries(placarPorMoeda).sort(
  (a, b) => melhorDelta(b[1].vieses) - melhorDelta(a[1].vieses),
);
const cel = (x?: { n: number; delta: number }) =>
  (x ? `${x.delta >= 0 ? "+" : "−"}${(Math.abs(x.delta) * 100).toFixed(2)}` : "—").padStart(9);
for (const [s2, d] of ordenado.slice(0, 14)) {
  console.log(
    s2.padEnd(12), String(d.n).padStart(6),
    cel(d.vieses.short), cel(d.vieses.long), cel(d.vieses.observar),
  );
}
console.log(`
${Object.keys(placarPorMoeda).length} moedas com emissões suficientes · em p.p. contra a mediana da própria moeda\n`);

/**
 * O veredito, e ele é deliberadamente duro.
 *
 * Um viés só vale alguma coisa se separar da referência E a separação vier da
 * maioria das moedas. Os dois cortes são frouxos — meio ponto percentual e 60%
 * das moedas — porque a amostra é curta; mesmo assim quase nada passa, e isso é
 * o resultado, não uma falha da régua.
 */
const SEPARACAO_MINIMA = 0.005;
const CONCORDANCIA_MINIMA = 0.6;

/**
 * A amostra mínima caiu de 100 para 30 junto com a carência.
 *
 * Não é afrouxar a régua: é que o `n` antigo contava a mesma call 65 vezes por
 * dia, então "100 emissões" podiam ser uma call e meia. Trinta observações
 * INDEPENDENTES é mais amostra do que aquelas cem, e quem decide se o número
 * significa alguma coisa agora é o intervalo, que aparece do lado.
 */
const AMOSTRA_MINIMA = 30;

console.log("=== veredito ===");
interface VereditoLinha {
  vies: string;
  n: number;
  delta: number;
  concordancia: number;
  passa: boolean;
  /** Separação a favor do viés, contra a maré do mesmo instante. */
  excesso: number;
  /** Intervalo de 95% do excesso do grupo, reamostrando moedas. */
  ic: [number, number];
}
const vereditos: VereditoLinha[] = [];
for (const v of ["short", "long", "evitar", "observar"]) {
  const g = obs.filter((o) => o.vies === v);
  if (g.length < AMOSTRA_MINIMA) continue;
  const med = mediana(g.map((o) => o.fwd));
  // Short ganha caindo, os demais ganham subindo.
  const delta = v === "short" ? referencia - med : med - referencia;

  const medExcesso = mediana(g.map((o) => o.excesso));
  const excesso = v === "short" ? -medExcesso : medExcesso;
  const [lo, hi] = intervalo(g);
  // O intervalo é do EXCESSO como medido; para o short, quem está a favor é o
  // lado negativo, então a virada de sinal vale para as duas pontas e elas
  // trocam de lugar.
  const ic: [number, number] = v === "short" ? [-hi, -lo] : [lo, hi];

  const porM = new Map<string, number[]>();
  for (const o of g) {
    const l = porM.get(o.s) ?? [];
    l.push(o.excesso);
    porM.set(o.s, l);
  }
  const medianas = [...porM.values()].map(mediana);
  const aFavor = medianas.filter((m) => (v === "short" ? m < 0 : m > 0)).length;
  const concordancia = aFavor / medianas.length;

  // A TERCEIRA EXIGÊNCIA É NOVA: o intervalo tem de ficar inteiro do lado
  // favorável. Sem ela, "separa +0,7 p.p." passava sem ninguém saber que o
  // intervalo ia de −3 a +4 — que é dizer nada com duas casas decimais.
  const passa =
    delta >= SEPARACAO_MINIMA &&
    concordancia >= CONCORDANCIA_MINIMA &&
    Number.isFinite(ic[0]) &&
    ic[0] > 0;

  vereditos.push({ vies: v, n: g.length, delta, concordancia, passa, excesso, ic });
  console.log(
    `  ${v.padEnd(9)} régua antiga ${(delta >= 0 ? "+" : "−")}${(Math.abs(delta) * 100).toFixed(2)} p.p. · ` +
      `excesso ${(excesso >= 0 ? "+" : "−")}${(Math.abs(excesso) * 100).toFixed(2)} p.p. ` +
      `[${(ic[0] * 100).toFixed(2)}, ${(ic[1] * 100).toFixed(2)}] · ` +
      `${(concordancia * 100).toFixed(0)}% das moedas · ${g.length} obs · ` +
      `${passa ? "PASSA" : "não passa"}`,
  );
}

const passaram = vereditos.filter((v) => v.passa);
console.log(
  passaram.length === 0
    ? `\nNENHUM viés separa da referência com concordância entre moedas nesta janela.\n` +
      `Isso não prova que o painel está errado — prova que ${janela.de.slice(0, 10)} a ` +
      `${janela.ate.slice(0, 10)} não é amostra para afirmar nada. Enquanto for assim, o painel\n` +
      `descreve o estado das moedas e não deve ser lido como recomendação.`
    : `\n${passaram.map((v) => v.vies).join(", ")} passou nos dois cortes. Amostra curta: confira de novo com mais dias.`,
);

await writeFile(
  "data/placar.json",
  `${JSON.stringify(
    {
      geradoEm: Date.now(),
      horizonte: HORIZONTE,
      janela,
      emissoes: obs.length,
      /** Emissões brutas antes da carência — o número que a régua antiga usava. */
      emissoesBrutas: crus.length,
      moedas: porMoeda.size,
      referencia,
      vereditos,
      porMoeda: placarPorMoeda,
    },
    null,
    2,
  )}\n`,
);
console.log(`\ndata/placar.json gravado`);
