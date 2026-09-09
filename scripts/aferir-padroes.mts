/**
 * As figuras de vela, medidas sobre os 528 perpétuos da Binance.
 *
 * Existe porque uma lição sobre leitura de velas entrou em `conhecimento/` e a
 * regra deste repositório é que nada entra sem medição. A lição afirma coisas
 * concretas e testáveis — o martelo mostra compradores retomando o controle, a
 * estrela cadente mostra exaustão, o engolfo mostra um lado dominando, e
 * **contexto importa mais do que a figura**. Este script é onde cada uma dessas
 * frases vira número ou vira "não se sustenta".
 *
 * A METODOLOGIA É A DO `lib/placar.ts` E A DO `aferir-garimpo`, de propósito,
 * para os resultados serem comparáveis com o resto do projeto:
 *
 *   MEDIANA do retorno à frente, e não média — uma moeda que fez 40x envenena
 *   qualquer média neste universo.
 *   REFERÊNCIA de TODAS as observações, porque num período de queda geral
 *   qualquer grupo tem mediana negativa e isso não é informação.
 *   CONCORDÂNCIA entre moedas, porque mediana boa concentrada em poucas moedas é
 *   ruído com cara de descoberta. É o teste que mais candidato mata aqui.
 *   ESTABILIDADE nas duas metades da janela, que separa efeito de regime.
 *   SENSIBILIDADE ao corte, que é específica deste script: as definições de
 *   figura têm cortes de convenção, e um resultado que só aparece num corte é
 *   calibragem, não descoberta.
 *
 * CUSTO: uma requisição por símbolo, 200 dias de velas diárias. Uns cinco
 * segundos com o teto de concorrência de `lib/limite.ts`.
 *
 * Rode com: npm run aferir-padroes
 */

import { mkdir, writeFile } from "node:fs/promises";
import { velas } from "../lib/binance";
import {
  DIRECAO,
  contextoDe,
  padroesDe,
  type Contexto,
  type Padrao,
  type VelaOHLC,
} from "../lib/padroes";

/** Horizonte em velas diárias. 7 é onde o resto do projeto mede. */
const HORIZONTE = 7;

/** Amostra mínima para um número virar afirmação. A mesma do aferir-garimpo. */
const MINIMO = 30;

const mediana = (xs: number[]): number => {
  if (xs.length === 0) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const pct = (v: number) =>
  Number.isFinite(v) ? `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(2)}%` : "—";
const pp = (v: number) =>
  Number.isFinite(v) ? `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(2)} p.p.` : "—";

// ------------------------------------------------------------------- os dados

const info = (await (await fetch("https://www.binance.com/fapi/v1/exchangeInfo")).json()) as {
  symbols: { symbol: string; status: string; contractType: string; quoteAsset: string }[];
};
const universo = info.symbols.filter(
  (s) => s.status === "TRADING" && s.contractType === "PERPETUAL" && s.quoteAsset === "USDT",
);

const t0 = Date.now();
const series = new Map<string, VelaOHLC[]>();
let semSerie = 0;
await Promise.all(
  universo.map(async (s) => {
    const v = await velas(s.symbol, "1d", 200).catch(() => []);
    // Menos de 50 velas não sustenta a janela de 20 do contexto mais o
    // horizonte de 7 com folga para haver observação nenhuma.
    if (v.length < 50) {
      semSerie++;
      return;
    }
    series.set(s.symbol, v);
  }),
);

console.log(
  `\n${universo.length} perpétuos · ${series.size} com série de 200 dias · ` +
    `${semSerie} sem histórico suficiente · ${((Date.now() - t0) / 1000).toFixed(1)}s`,
);

// -------------------------------------------------------------- as observações

interface Obs {
  s: string;
  t: number;
  padroes: Padrao[];
  ctx: Contexto;
  fwd: number;
}

/** Todas as velas classificadas, com o retorno de 7 dias à frente. */
function observar(escala: number, perto: number): Obs[] {
  const out: Obs[] = [];
  for (const [s, v] of series) {
    for (let i = 21; i + HORIZONTE < v.length; i++) {
      const c = v[i].close;
      const f = v[i + HORIZONTE].close;
      if (!(c > 0) || !(f > 0)) continue;
      const ctx = contextoDe(v, i, perto);
      if (!ctx) continue;
      out.push({ s, t: v[i].time, padroes: padroesDe(v, i, escala), ctx, fwd: f / c - 1 });
    }
  }
  return out;
}

interface Resultado {
  nome: string;
  n: number;
  mediana: number;
  distancia: number;
  aFavor: number;
  moedas: number;
  /** A distância aponta para o lado que a figura AFIRMA? */
  noSentido: boolean | null;
}

/**
 * Mede um grupo contra a referência de todas as observações.
 *
 * `esperado` é a direção que a figura afirma, declarada em `DIRECAO` ANTES de
 * qualquer medição. Sem ela, mediana positiva confirmaria "é de alta" e mediana
 * negativa confirmaria "era armadilha" — o teste não teria como reprovar nada.
 */
function medir(
  nome: string,
  grupo: Obs[],
  todas: Obs[],
  esperado: "alta" | "baixa" | "nenhuma",
): Resultado {
  const ref = mediana(todas.map((o) => o.fwd));
  const med = mediana(grupo.map((o) => o.fwd));
  const distancia = med - ref;

  const porMoeda = new Map<string, number[]>();
  for (const o of grupo) {
    const l = porMoeda.get(o.s) ?? [];
    l.push(o.fwd);
    porMoeda.set(o.s, l);
  }
  // A favor é relativo à REFERÊNCIA e não a zero, e no sentido em que o grupo
  // de fato andou — é a concordância do efeito, não da tese.
  const meds = [...porMoeda.values()].filter((l) => l.length >= 2).map(mediana);
  const aFavor = meds.filter((m) => (distancia >= 0 ? m > ref : m < ref)).length;

  return {
    nome,
    n: grupo.length,
    mediana: med,
    distancia,
    aFavor,
    moedas: meds.length,
    noSentido:
      esperado === "nenhuma" ? null : esperado === "alta" ? distancia > 0 : distancia < 0,
  };
}

function linha(r: Resultado, marca = ""): void {
  if (r.n < MINIMO) {
    console.log(`${r.nome.padEnd(34)} ${String(r.n).padStart(6)}   (amostra pequena, não conclui)`);
    return;
  }
  // A concordância é o teste que mais mata candidato aqui: metade das moedas é
  // cara ou coroa, por melhor que a mediana pareça.
  const conc = r.moedas > 0 ? r.aFavor / r.moedas : 0;
  console.log(
    r.nome.padEnd(34),
    String(r.n).padStart(6),
    pct(r.mediana).padStart(10),
    pp(r.distancia).padStart(14),
    `${r.aFavor}/${r.moedas}`.padStart(11),
    `${(conc * 100).toFixed(0)}%`.padStart(6),
    r.noSentido === null ? "   —" : r.noSentido ? "  sim" : "  NÃO",
    marca,
  );
}

const CAB =
  "figura                                  n    mediana      vs referência   moedas a favor       no sentido?";

// ============================================================ 1. as figuras sós

const base = observar(1, 0.03);
const refGeral = mediana(base.map((o) => o.fwd));
console.log(
  `\n──────────────── 1. AS FIGURAS SOZINHAS ────────────────\n` +
    `retorno de ${HORIZONTE} dias à frente · ${base.length.toLocaleString("pt-BR")} observações de ` +
    `${series.size} moedas · referência ${pct(refGeral)}`,
);
console.log(CAB);

const FIGURAS = Object.keys(DIRECAO) as Padrao[];
const resultados: Resultado[] = [];
for (const p of FIGURAS) {
  const g = base.filter((o) => o.padroes.includes(p));
  const r = medir(p, g, base, DIRECAO[p]);
  resultados.push(r);
  linha(r);
}

// ================================================== 2. a figura MAIS o contexto

/**
 * A AFIRMAÇÃO MAIS INTERESSANTE DA LIÇÃO, e a razão de este script existir.
 *
 * *"Um martelo no meio do nada significa muito pouco. Uma engolfo de alta no
 * suporte principal com volume subindo é muito mais forte do que a mesma figura
 * no meio de um lateral aleatório. Contexto importa mais do que a figura."*
 *
 * É testável de forma direta: mede-se a figura sozinha e a figura dentro do
 * contexto que a lição diz que a potencializa. Se a segunda separar mais da
 * referência do que a primeira, a lição tem razão. Se não separar, ela é
 * folclore — e este projeto escreve o folclore junto com o resto.
 */
console.log(
  `\n──────────────── 2. A FIGURA MAIS O CONTEXTO ────────────────\n` +
    `"contexto importa mais que a figura" — a lição, virada em teste`,
);
console.log(CAB);

/** Cada combinação carrega o NOME do contexto, para o controle da seção 3 poder ser pareado. */
const COMBOS: [string, Padrao, string, (c: Contexto) => boolean][] = [
  ["martelo", "martelo", "", () => true],
  ["martelo + em suporte", "martelo", "em suporte", (c) => c.emSuporte],
  ["martelo + vem de queda", "martelo", "vem de queda (−20% em 7d)", (c) => c.vemDeQueda],
  ["martelo + volume alto", "martelo", "volume alto", (c) => c.volumeAlto],
  ["martelo + suporte + volume", "martelo", "em suporte + volume alto", (c) => c.emSuporte && c.volumeAlto],
  ["engolfo-alta", "engolfo-alta", "", () => true],
  ["engolfo-alta + em suporte", "engolfo-alta", "em suporte", (c) => c.emSuporte],
  ["engolfo-alta + volume alto", "engolfo-alta", "volume alto", (c) => c.volumeAlto],
  ["engolfo-alta + suporte + volume", "engolfo-alta", "em suporte + volume alto", (c) => c.emSuporte && c.volumeAlto],
  ["estrela-cadente", "estrela-cadente", "", () => true],
  ["estrela + em resistência", "estrela-cadente", "em resistência", (c) => c.emResistencia],
  ["estrela + vem de alta", "estrela-cadente", "vem de alta (+20% em 7d)", (c) => c.vemDeAlta],
  ["estrela + resistência + volume", "estrela-cadente", "em resistência + volume alto", (c) => c.emResistencia && c.volumeAlto],
  ["engolfo-baixa", "engolfo-baixa", "", () => true],
  ["engolfo-baixa + em resistência", "engolfo-baixa", "em resistência", (c) => c.emResistencia],
  ["engolfo-baixa + vem de alta", "engolfo-baixa", "vem de alta (+20% em 7d)", (c) => c.vemDeAlta],
  ["doji", "doji", "", () => true],
  ["doji + vem de alta", "doji", "vem de alta (+20% em 7d)", (c) => c.vemDeAlta],
  ["doji + vem de queda", "doji", "vem de queda (−20% em 7d)", (c) => c.vemDeQueda],
  ["expansao", "expansao", "", () => true],
  ["expansao + volume alto", "expansao", "volume alto", (c) => c.volumeAlto],
];

const comContexto: Resultado[] = [];
for (const [nome, padrao, , filtro] of COMBOS) {
  const g = base.filter((o) => o.padroes.includes(padrao) && filtro(o.ctx));
  const r = medir(nome, g, base, DIRECAO[padrao]);
  comContexto.push(r);
  linha(r, nome.includes("+") ? "" : "  ← a figura sozinha");
}

// ====================================================== 3. o contexto SOZINHO

/**
 * O CONTROLE QUE FALTARIA, e sem ele a seção 2 não conclui nada.
 *
 * Se "martelo + em suporte" separar da referência, ainda não se sabe se quem
 * separou foi o martelo ou o suporte. Medir o contexto SEM figura nenhuma
 * responde isso: se "em suporte" sozinho já dá a mesma distância, a figura não
 * acrescentou — ela só estava presente.
 *
 * É o mesmo raciocínio que o `lib/placar.ts` aplica ao comparar viés com a
 * referência em vez de com zero: sem o controle, atribui-se ao sinal o que era
 * do ambiente.
 */
console.log(
  `\n──────────────── 3. O CONTEXTO SOZINHO, sem figura nenhuma ────────────────\n` +
    `o controle: se o contexto sozinho já separa, a figura não acrescentou nada`,
);
console.log(CAB);

const CONTEXTOS: [string, (c: Contexto) => boolean][] = [
  ["em suporte", (c) => c.emSuporte],
  ["em resistência", (c) => c.emResistencia],
  ["volume alto", (c) => c.volumeAlto],
  ["vem de queda (−20% em 7d)", (c) => c.vemDeQueda],
  ["vem de alta (+20% em 7d)", (c) => c.vemDeAlta],
  ["em suporte + volume alto", (c) => c.emSuporte && c.volumeAlto],
  ["em resistência + volume alto", (c) => c.emResistencia && c.volumeAlto],
];
const soContexto: Resultado[] = [];
for (const [nome, filtro] of CONTEXTOS) {
  const g = base.filter((o) => filtro(o.ctx));
  const r = medir(nome, g, base, "nenhuma");
  soContexto.push(r);
  linha(r);
}

// ================================================ 4. sensibilidade ao corte

/**
 * O MESMO PADRÃO COM O CORTE FROUXO E COM O APERTADO.
 *
 * Os cortes de `lib/padroes.ts` são convenção — "pavio de dois corpos", "corpo
 * de 10% da amplitude" — e um corte escolhido depois de ver o resultado fabrica
 * qualquer conclusão. Se a distância muda de sinal entre os três, o que foi
 * medido foi a calibragem e não a figura.
 */
console.log(
  `\n──────────────── 4. SENSIBILIDADE AO CORTE ────────────────\n` +
    `os cortes das figuras são convenção; um efeito que só existe num deles é calibragem`,
);
console.log(
  "figura                             frouxo (0,7×)      convenção       apertado (1,4×)",
);
const ESCALAS: [string, number][] = [["frouxo", 0.7], ["convenção", 1], ["apertado", 1.4]];
const porEscala = new Map<number, Obs[]>();
for (const [, e] of ESCALAS) porEscala.set(e, e === 1 ? base : observar(e, 0.03));

const sensibilidade: Record<string, { escala: number; n: number; distancia: number }[]> = {};
for (const p of FIGURAS) {
  const celulas = ESCALAS.map(([, e]) => {
    const obs = porEscala.get(e) as Obs[];
    const g = obs.filter((o) => o.padroes.includes(p));
    const r = medir(p, g, obs, DIRECAO[p]);
    return { escala: e, n: r.n, distancia: r.n >= MINIMO ? r.distancia : NaN };
  });
  sensibilidade[p] = celulas;
  console.log(
    p.padEnd(30),
    ...celulas.map((c) =>
      Number.isFinite(c.distancia)
        ? `${pp(c.distancia)} (n=${c.n})`.padStart(21)
        : `n=${c.n}, sem amostra`.padStart(21),
    ),
  );
}

// ================================================== 5. estabilidade no tempo

/**
 * O EFEITO APARECE NAS DUAS METADES DA JANELA, separadamente?
 *
 * É o teste que separa efeito de regime. Um número que só existe numa metade é a
 * descrição daquele trimestre, não uma regularidade — e como a janela aqui são
 * 200 dias, cada metade é um trimestre de mercado bem diferente.
 */
console.log(
  `\n──────────────── 5. ESTABILIDADE: o efeito existe nas duas metades? ────────────────`,
);
console.log("figura                          primeira metade        segunda metade      concorda?");
const tempos = base.map((o) => o.t).sort((a, b) => a - b);
const corte = tempos[Math.floor(tempos.length / 2)];
const estabilidade: Record<string, { primeira: number; segunda: number; concorda: boolean }> = {};
for (const p of FIGURAS) {
  const partes = [base.filter((o) => o.t < corte), base.filter((o) => o.t >= corte)];
  const ds = partes.map((parte) => {
    const g = parte.filter((o) => o.padroes.includes(p));
    if (g.length < MINIMO) return NaN;
    return mediana(g.map((o) => o.fwd)) - mediana(parte.map((o) => o.fwd));
  });
  const concorda =
    Number.isFinite(ds[0]) && Number.isFinite(ds[1]) && Math.sign(ds[0]) === Math.sign(ds[1]);
  estabilidade[p] = { primeira: ds[0], segunda: ds[1], concorda };
  console.log(
    p.padEnd(30),
    (Number.isFinite(ds[0]) ? pp(ds[0]) : "sem amostra").padStart(18),
    (Number.isFinite(ds[1]) ? pp(ds[1]) : "sem amostra").padStart(20),
    concorda ? "        sim" : "        NÃO",
  );
}

// ======================================================= 6. o veredito

/**
 * OS QUATRO TESTES JUNTOS, e a figura só passa se passar em todos.
 *
 * Cada um sozinho deixa passar coisa demais: mediana boa com 40% de concordância
 * é uma moeda puxando o grupo; distância grande que troca de sinal entre as
 * metades é regime; efeito que só existe num corte é calibragem. Este projeto já
 * descartou tese por cada um desses motivos separadamente.
 *
 * O corte de concordância é 60%, o mesmo que o resto do projeto usa para dizer
 * que algo separou — abaixo disso é cara ou coroa, que é a frase com que o
 * AGENTS.md descarta os vieses do próprio painel (46% a 54%).
 */
const CONCORDANCIA_MINIMA = 0.6;
console.log(`\n──────────────── 6. O VEREDITO ────────────────`);
console.log("figura                          amostra  sentido  concordância  cortes  metades  passa?");

const veredito: Record<string, { passa: boolean; porque: string[] }> = {};
for (const p of FIGURAS) {
  const r = resultados.find((x) => x.nome === p) as Resultado;
  const porque: string[] = [];

  const temAmostra = r.n >= MINIMO;
  if (!temAmostra) porque.push(`amostra de ${r.n}, abaixo de ${MINIMO}`);

  const sentidoOk = DIRECAO[p] === "nenhuma" ? true : r.noSentido === true;
  if (!sentidoOk) porque.push(`a distância aponta para o lado contrário ao que a figura afirma`);

  const conc = r.moedas > 0 ? r.aFavor / r.moedas : 0;
  const concOk = temAmostra && conc >= CONCORDANCIA_MINIMA;
  if (temAmostra && !concOk) porque.push(`${(conc * 100).toFixed(0)}% das moedas concordam, abaixo de 60%`);

  const cs = sensibilidade[p].map((c) => c.distancia).filter(Number.isFinite);
  const cortesOk = cs.length === 3 && new Set(cs.map(Math.sign)).size === 1;
  if (!cortesOk) porque.push(`o efeito troca de sinal (ou some) entre os cortes`);

  const metadesOk = estabilidade[p].concorda;
  if (!metadesOk) porque.push(`não aparece nas duas metades da janela`);

  // "nenhuma" direção não tem como passar no teste de sentido — doji e expansão
  // são figuras de indecisão e de movimento, não de lado. Elas entram na tabela
  // para o número existir, mas não podem virar regra direcional.
  //
  // E ISSO PRECISA VIRAR MOTIVO ESCRITO, não só um `false` silencioso. A
  // expansão é o caso que obriga: ela passa em TUDO que é mensurável — amostra
  // de 10.515, 69% de concordância, estável nos cortes e nas duas metades, e
  // −1,83 p.p. de distância — e mesmo assim não vira regra, porque não diz um
  // lado. Um "não" sem motivo ao lado de números tão bons se lê como bug do
  // teste, e o `npm run auditar-dados` reprova o arquivo por isso.
  if (DIRECAO[p] === "nenhuma") {
    porque.push(
      `a figura não afirma um lado — separa da referência, mas não há regra direcional a extrair`,
    );
  }
  const passa =
    DIRECAO[p] !== "nenhuma" && temAmostra && sentidoOk && concOk && cortesOk && metadesOk;
  veredito[p] = { passa, porque };

  console.log(
    p.padEnd(30),
    (temAmostra ? `${r.n}` : `${r.n} ✗`).padStart(8),
    (DIRECAO[p] === "nenhuma" ? "n/a" : sentidoOk ? "sim" : "NÃO").padStart(8),
    (temAmostra ? `${(conc * 100).toFixed(0)}%${concOk ? "" : " ✗"}` : "—").padStart(13),
    (cortesOk ? "ok" : "✗").padStart(7),
    (metadesOk ? "ok" : "✗").padStart(8),
    passa ? "   PASSA" : "   não",
  );
}

const passaram = FIGURAS.filter((p) => veredito[p].passa);
console.log(
  `\n${passaram.length} de ${FIGURAS.length} figuras passaram nos quatro testes` +
    (passaram.length ? `: ${passaram.join(", ")}` : "."),
);

/**
 * A DECOMPOSIÇÃO, que é onde a lição é de fato julgada.
 *
 * A lição diz que "contexto importa MAIS que a figura". Isso são duas perguntas
 * e não uma, e medir só a primeira leva à conclusão errada:
 *
 *   quanto o CONTEXTO acrescenta à figura?   → mede se a lição acertou em dizer
 *                                              que a figura sozinha é fraca
 *   quanto a FIGURA acrescenta ao contexto?  → mede se a figura serve para
 *                                              ALGUMA coisa depois que o
 *                                              contexto já foi lido
 *
 * A segunda é a que decide se estas oito funções merecem existir. Se o contexto
 * sozinho já entrega a distância inteira, a figura é enfeite: ela estava
 * presente, não estava causando. É o mesmo controle que o `lib/placar.ts` faz ao
 * comparar o viés com a referência em vez de com zero.
 */
const decomposicao: {
  nome: string;
  soFigura: number;
  soContexto: number;
  juntos: number;
  ganhoDaFigura: number;
  n: number;
}[] = [];
console.log(
  `\n──────────────── 7. A DECOMPOSIÇÃO: quem estava causando? ────────────────\n` +
    `distância da referência, em p.p. — e a última coluna é a que julga a figura`,
);
console.log(
  "combinação                        só a figura   só o contexto      juntos   a figura acrescenta",
);
for (const [nome, padrao, ctxNome] of COMBOS.filter(([n]) => n.includes("+"))) {
  const juntos = comContexto.find((x) => x.nome === nome);
  const soFig = comContexto.find((x) => x.nome === padrao);
  const soCtx = soContexto.find((x) => x.nome === ctxNome);
  if (!juntos || !soFig || !soCtx || juntos.n < MINIMO) continue;

  // EM MÓDULO, porque o que se compara é quanto o grupo SEPARA da referência, e
  // separar para baixo é tão informativo quanto para cima. Comparar com sinal
  // faria "−4,80 vira −3,94" parecer melhora quando é perda de separação.
  const ganhoDaFigura = Math.abs(juntos.distancia) - Math.abs(soCtx.distancia);
  decomposicao.push({
    nome,
    soFigura: soFig.distancia,
    soContexto: soCtx.distancia,
    juntos: juntos.distancia,
    ganhoDaFigura,
    n: juntos.n,
  });
  console.log(
    nome.padEnd(33),
    pp(soFig.distancia).padStart(12),
    pp(soCtx.distancia).padStart(15),
    pp(juntos.distancia).padStart(12),
    `${pp(ganhoDaFigura)}`.padStart(14),
    ganhoDaFigura > 0 ? " " : "  ← a figura DILUIU o contexto",
  );
}
const diluiram = decomposicao.filter((d) => d.ganhoDaFigura <= 0).length;
console.log(
  `\na figura acrescentou NADA ou piorou em ${diluiram} das ${decomposicao.length} combinações medidas.`,
);

await mkdir("data", { recursive: true });
await writeFile(
  "data/padroes.json",
  `${JSON.stringify(
    {
      geradoEm: Date.now(),
      universo: universo.length,
      moedas: series.size,
      observacoes: base.length,
      horizonteDias: HORIZONTE,
      referencia: refGeral,
      concordanciaMinima: CONCORDANCIA_MINIMA,
      figuras: resultados,
      comContexto,
      soContexto,
      sensibilidade,
      estabilidade,
      veredito,
      decomposicao,
    },
    null,
    2,
  )}\n`,
);
console.log(`\ndata/padroes.json gravado`);
console.log(
  `\n────────────────────────────────────────────────────────────────────────────\n` +
    `Isto NÃO é um emissor de call. É o veredito de cada figura da lição de\n` +
    `conhecimento/01-velas.md, e o lugar onde ela é atualizada com o que foi\n` +
    `medido — inclusive quando o que foi medido é "não se sustenta".\n`,
);
