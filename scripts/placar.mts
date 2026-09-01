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
}

const obs: Obs[] = [];
for (const serie of porMoeda.values()) {
  let j = 0;
  for (const p of serie) {
    // Os dois ponteiros andam juntos porque a série está ordenada: procurar do
    // começo a cada ponto seria quadrático, e são 21 mil pontos.
    while (j < serie.length && serie[j].t < p.t + HORIZONTE * 3600) j++;
    if (j >= serie.length) break;
    obs.push({ ...p, fwd: serie[j].preco / p.preco - 1 });
  }
}

const mediana = (xs: number[]): number => {
  if (xs.length === 0) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const pct = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(2)}%` : "—");

const janela = {
  de: new Date(Math.min(...pontos.map((p) => p.t)) * 1000).toISOString().slice(0, 16),
  ate: new Date(Math.max(...pontos.map((p) => p.t)) * 1000).toISOString().slice(0, 16),
};

console.log(
  `${obs.length} emissões com ${HORIZONTE}h à frente · ${porMoeda.size} moedas · ${janela.de} → ${janela.ate}\n`,
);

/**
 * A referência: TODAS as observações juntas.
 *
 * Sem ela nenhum número abaixo significa coisa alguma. Se o mercado inteiro caiu
 * 0,5% no período, um viés que "mede −0,5%" não errou nem acertou — ele
 * descreveu o mercado. O que interessa é a distância até esta linha.
 */
const referencia = mediana(obs.map((o) => o.fwd));
console.log(`referência (todas as moedas, todo o período): ${pct(referencia)} em ${HORIZONTE}h\n`);

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
 * O veredito, e ele é deliberadamente duro.
 *
 * Um viés só vale alguma coisa se separar da referência E a separação vier da
 * maioria das moedas. Os dois cortes são frouxos — meio ponto percentual e 60%
 * das moedas — porque a amostra é curta; mesmo assim quase nada passa, e isso é
 * o resultado, não uma falha da régua.
 */
const SEPARACAO_MINIMA = 0.005;
const CONCORDANCIA_MINIMA = 0.6;

console.log("=== veredito ===");
const vereditos: { vies: string; n: number; delta: number; concordancia: number; passa: boolean }[] = [];
for (const v of ["short", "long", "evitar", "observar"]) {
  const g = obs.filter((o) => o.vies === v);
  if (g.length < 100) continue;
  const med = mediana(g.map((o) => o.fwd));
  // Short ganha caindo, os demais ganham subindo.
  const delta = v === "short" ? referencia - med : med - referencia;

  const porM = new Map<string, number[]>();
  for (const o of g) {
    const l = porM.get(o.s) ?? [];
    l.push(o.fwd);
    porM.set(o.s, l);
  }
  const medianas = [...porM.values()].map(mediana);
  const aFavor = medianas.filter((m) => (v === "short" ? m < referencia : m > referencia)).length;
  const concordancia = aFavor / medianas.length;
  const passa = delta >= SEPARACAO_MINIMA && concordancia >= CONCORDANCIA_MINIMA;

  vereditos.push({ vies: v, n: g.length, delta, concordancia, passa });
  console.log(
    `  ${v.padEnd(9)} separa ${(delta >= 0 ? "+" : "−")}${(Math.abs(delta) * 100).toFixed(2)} p.p. a favor · ` +
      `${(concordancia * 100).toFixed(0)}% das moedas concordam · ${g.length} emissões · ` +
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
      moedas: porMoeda.size,
      referencia,
      vereditos,
    },
    null,
    2,
  )}\n`,
);
console.log(`\ndata/placar.json gravado`);
