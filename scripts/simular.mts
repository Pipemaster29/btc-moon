/**
 * Mil caminhos da carteira, para responder hoje o que o relógio só responde em
 * setenta dias.
 *
 * A carteira real tem 64 posições fechadas em 14,2 dias e marca −9,35%. Esse
 * número não distingue estratégia de azar: o intervalo de 95% da média por
 * posição vai de −14,8% a +6,1%, e 84% do prejuízo vem de três posições. Este
 * script reamostra o histórico em blocos contíguos, roda o MOTOR DE VERDADE da
 * carteira sobre cada caminho sintético e devolve distribuições em vez de
 * pontos. O porquê de cada escolha está no cabeçalho de `lib/simulacao.ts`.
 *
 * SÃO QUATRO PERGUNTAS, e só a primeira é sobre dinheiro:
 *
 *   1. RUÍNA      em quantos dos caminhos a conta afunda? É para isto que a
 *                 carteira fictícia existe, e é o que 14 dias não respondem.
 *   2. ESCOLHA    o painel escolhendo a moeda bate o painel escolhendo uma moeda
 *                 QUALQUER? É a pergunta do `lib/placar.ts`, feita em dólares, e
 *                 com os dois cenários pareados sobre os mesmos blocos.
 *   3. TAMANHO    a régua de 3%/2%/1% e o teto agregado de 25% aguentam? O
 *                 `escala` do `rodar` multiplica o orçamento de risco e nada
 *                 mais, então dá para varrer o tamanho sem mexer em regra.
 *   4. ROBUSTEZ   a resposta muda com o tamanho do bloco? Se mudar muito, a
 *                 conclusão é sobre os 14 dias de amostra e não sobre a carteira.
 *
 * NÃO FAZ REQUISIÇÃO NENHUMA: só lê `data/historico-*.jsonl`. Leva uns oito
 * minutos na régua padrão.
 *
 * Rode com: npm run simular [--caminhos=400] [--dias=90] [--sweep=150]
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import {
  rodar,
  CAPITAL_INICIAL,
  RISCO_TOTAL_MAXIMO,
  EXPOSICAO_MAXIMA,
  type Emissao,
} from "../lib/carteira";
import {
  montarGrade,
  sortearSerie,
  semente,
  quantil,
  faixaBinomial,
  type Sorteio,
} from "../lib/simulacao";

/** A mesma data de `scripts/carteira.mts`: antes dela não há `forca` gravada. */
const COMECO = Date.parse("2026-09-02T20:00:00Z");

/**
 * Semente base, fixa no código.
 *
 * Mesmo motivo pelo qual `COMECO` é fixo: rodar duas vezes tem de dar o mesmo
 * número. Uma probabilidade de ruína que oscila entre execuções não é medição,
 * é ruído com cara de resultado.
 */
const SEMENTE = 20260917;

/** Bloco padrão. Meio do caminho do sweep, e umas 23 vezes a cadência dos retratos. */
const BLOCO = 48 * 3600;

const arg = (nome: string, padrao: number) => {
  const achado = process.argv.find((a) => a.startsWith(`--${nome}=`));
  const n = achado ? Number(achado.split("=")[1]) : NaN;
  return Number.isFinite(n) && n > 0 ? n : padrao;
};

const CAMINHOS = Math.round(arg("caminhos", 400));
const DIAS = Math.round(arg("dias", 90));
const SWEEP = Math.round(arg("sweep", 150));

/** Onde a curva é medida, em dias. O último é o horizonte. */
const MARCOS = [30, 60, DIAS].filter((d, i, a) => d <= DIAS && a.indexOf(d) === i);

// ------------------------------------------------------------------- a leitura

const dir = "data";
const arquivos = (await readdir(dir)).filter((f) => /^historico-\d{4}-\d{2}\.jsonl$/.test(f));

const emissoes: Emissao[] = [];
for (const f of arquivos.sort()) {
  for (const linha of (await readFile(`${dir}/${f}`, "utf8")).split("\n")) {
    if (!linha.trim()) continue;
    try {
      emissoes.push(JSON.parse(linha) as Emissao);
    } catch {
      // Linha truncada por escrita concorrente, como no `scripts/carteira.mts`.
    }
  }
}

const grade = montarGrade(emissoes, COMECO);
const diasUnicos = grade.duracao / 86_400;

/**
 * A DIREÇÃO DA PRÓPRIA JANELA, que é o confundidor que mata a leitura do avesso.
 *
 * O painel é majoritariamente comprado. Se os 14 dias de amostra forem de queda,
 * inverter o painel é vender um mercado que caiu — e o avesso ganha por ser
 * vendido, não por o painel estar errado. É o mesmo formato da tese de liquidez
 * que o README já enterra: ajuste de 0,71 no lead de 13 semanas e 0,72 em lead
 * ZERO. Sem este número ao lado, a tabela do avesso vira uma recomendação de
 * inverter as calls, que é exatamente o que ela NÃO demonstra.
 */
const acumulado = new Map<string, number>();
let nLong = 0;
let nShort = 0;
for (const inst of grade.instantes) {
  for (const o of inst.obs) {
    acumulado.set(o.s, (acumulado.get(o.s) ?? 1) * (1 + o.r));
    if (o.vies === "long") nLong++;
    else if (o.vies === "short") nShort++;
  }
}
const retornosDaJanela = [...acumulado.values()].map((v) => v - 1).sort((a, b) => a - b);
const medianaJanela = quantil(retornosDaJanela, 0.5);
const caíram = retornosDaJanela.filter((r) => r < 0).length;
const fracaoLong = nLong + nShort > 0 ? nLong / (nLong + nShort) : 0;
/** A janela empurra o avesso se ela tem direção e o painel aposta contra ela. */
const janelaEnviesada = Math.abs(medianaJanela) > 0.05 && Math.abs(fracaoLong - 0.5) > 0.1;

if (grade.instantes.length < 50) {
  console.error(
    `Grade com ${grade.instantes.length} instantes — pouco demais para reamostrar. ` +
      `Rode o \`npm run panorama\` mais algumas vezes.`,
  );
  process.exit(1);
}

// -------------------------------------------------------------------- o motor

interface Resultado {
  final: number;
  emMarcos: number[];
  mínimo: number;
  quedaMaxima: number;
  maiorRiscoAberto: number;
  maiorExposicao: number;
  fechadas: number;
}

function rodarCaminhos(n: number, opcoes: Omit<Sorteio, "horizonte" | "comecaEm">, escala: number, rotulo: string): Resultado[] {
  const saida: Resultado[] = [];
  for (let i = 0; i < n; i++) {
    // A SEMENTE DOS BLOCOS DEPENDE SÓ DO ÍNDICE, e a da permutação é outra: dois
    // cenários rodados com o mesmo `i` caem exatamente sobre os mesmos blocos, e
    // a diferença entre eles é só o que os distingue. Sem isso a comparação
    // painel-contra-controle mediria o sorteio junto.
    const serie = sortearSerie(
      grade,
      { ...opcoes, horizonte: DIAS * 86_400, comecaEm: COMECO },
      semente(SEMENTE + i),
      semente(SEMENTE + 1_000_000 + i),
    );
    const c = rodar(serie, COMECO, undefined, escala);

    const emMarcos = MARCOS.map((d) => {
      const limite = COMECO + d * 86_400_000;
      // O último ponto da curva ATÉ o marco. A curva é rala de propósito (um
      // ponto por hora), então o valor exato do instante não existe — e o ponto
      // anterior é a leitura honesta, não uma interpolação inventada.
      let v = CAPITAL_INICIAL;
      for (const ponto of c.curva) {
        if (ponto.t > limite) break;
        v = ponto.patrimonio;
      }
      return v;
    });

    saida.push({
      final: c.patrimonio,
      emMarcos,
      // A curva guarda um ponto por hora, então este mínimo é o mínimo HORÁRIO:
      // um vale de vinte minutos entre dois pontos não aparece. Erra para o
      // otimismo, como todo o resto desta simulação.
      mínimo: c.curva.reduce((m, p) => Math.min(m, p.patrimonio), CAPITAL_INICIAL),
      quedaMaxima: c.quedaMaxima,
      maiorRiscoAberto: c.maiorRiscoAberto,
      maiorExposicao: c.maiorExposicao,
      fechadas: c.fechadas.length,
    });

    if (i % 25 === 0 || i === n - 1) {
      process.stderr.write(`\r  ${rotulo}: ${i + 1}/${n}   `);
    }
  }
  process.stderr.write("\r" + " ".repeat(40) + "\r");
  return saida;
}

// ------------------------------------------------------------------- o resumo

const COL = 32;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const dol = (x: number) => `US$ ${x.toFixed(0)}`;

function distribuicao(xs: number[]) {
  const o = [...xs].sort((a, b) => a - b);
  return {
    p5: quantil(o, 0.05),
    p25: quantil(o, 0.25),
    p50: quantil(o, 0.5),
    p75: quantil(o, 0.75),
    p95: quantil(o, 0.95),
    media: o.reduce((s, x) => s + x, 0) / o.length,
  };
}

function proporcao(xs: Resultado[], teste: (r: Resultado) => boolean) {
  const k = xs.filter(teste).length;
  const [lo, hi] = faixaBinomial(k, xs.length);
  return { p: k / xs.length, lo, hi, k, n: xs.length };
}

function resumir(rs: Resultado[]) {
  return {
    n: rs.length,
    final: distribuicao(rs.map((r) => r.final)),
    marcos: MARCOS.map((d, i) => ({ dias: d, ...distribuicao(rs.map((r) => r.emMarcos[i])) })),
    quedaMaxima: distribuicao(rs.map((r) => r.quedaMaxima)),
    riscoAberto: distribuicao(rs.map((r) => r.maiorRiscoAberto)),
    exposicao: distribuicao(rs.map((r) => r.maiorExposicao)),
    fechadas: distribuicao(rs.map((r) => r.fechadas)),
    perde: proporcao(rs, (r) => r.final < CAPITAL_INICIAL),
    metade: proporcao(rs, (r) => r.mínimo < CAPITAL_INICIAL * 0.5),
    quarto: proporcao(rs, (r) => r.mínimo < CAPITAL_INICIAL * 0.25),
  };
}

function linha(rotulo: string, r: ReturnType<typeof resumir>) {
  const m = r.final;
  return (
    `  ${rotulo.padEnd(COL)} ${dol(m.p5).padStart(9)} ${dol(m.p25).padStart(9)} ` +
    `${dol(m.p50).padStart(9)} ${dol(m.p75).padStart(9)} ${dol(m.p95).padStart(9)}   ` +
    `${pct(r.metade.p).padStart(6)}`
  );
}

// ------------------------------------------------------------------ a execução

console.log(`\nSIMULAÇÃO DA CARTEIRA — ${CAMINHOS} caminhos de ${DIAS} dias\n`);
console.log(
  `  amostra única: ${diasUnicos.toFixed(1)} dias, ${grade.instantes.length} retratos, ` +
    `${grade.moedas.length} moedas, cadência de ${(grade.dtMediano / 60).toFixed(1)} min`,
);
console.log(
  `  segmentos contínuos: ${grade.segmentos.length} | bloco padrão: ${BLOCO / 3600}h | ` +
    `reuso de cada dia real: ${(DIAS / diasUnicos).toFixed(1)}x`,
);
console.error("");

// TUDO É CALCULADO ANTES DE QUALQUER TABELA SAIR. Imprimir no meio do laço
// picotava as linhas com a barra de progresso, e uma tabela picotada é uma
// tabela que ninguém lê.
const painel = rodarCaminhos(CAMINHOS, { bloco: BLOCO }, 1, "painel");
const invertido = rodarCaminhos(CAMINHOS, { bloco: BLOCO, inverter: true }, 1, "avesso");
const embaralhado = rodarCaminhos(CAMINHOS, { bloco: BLOCO, permutar: true }, 1, "moeda trocada");

const escalas = [0.5, 1, 2, 3].map((escala) => ({
  escala,
  bruto: escala === 1 ? painel : rodarCaminhos(SWEEP, { bloco: BLOCO }, escala, `escala ${escala}x`),
}));
const blocos = [12, 24, 48, 96].map((horas) => ({
  horas,
  bruto: horas * 3600 === BLOCO ? painel : rodarCaminhos(SWEEP, { bloco: horas * 3600 }, 1, `bloco ${horas}h`),
}));

const rPainel = resumir(painel);
const rInvertido = resumir(invertido);
const rEmbaralhado = resumir(embaralhado);
const rEscalas = escalas.map((e) => ({ escala: e.escala, resumo: resumir(e.bruto) }));
const rBlocos = blocos.map((b) => ({ horas: b.horas, resumo: resumir(b.bruto) }));

/** Diferença pareada: mesmo índice, mesmos blocos, e só o cenário muda. */
function parear(a: Resultado[], b: Resultado[]) {
  const d = a.map((x, i) => x.final - b[i].final);
  const ganhos = d.filter((x) => x > 0).length;
  const [lo, hi] = faixaBinomial(ganhos, d.length);
  return { ...distribuicao(d), favoravel: ganhos / d.length, lo, hi, cobre50: lo <= 0.5 && hi >= 0.5 };
}
const vsAvesso = parear(painel, invertido);
const vsMoeda = parear(painel, embaralhado);

const cabecalho =
  `  ${"".padEnd(COL)} ${"p5".padStart(9)} ${"p25".padStart(9)} ${"mediana".padStart(9)} ` +
  `${"p75".padStart(9)} ${"p95".padStart(9)}   ${"P(−50%)".padStart(7)}`;

console.log(`\n1. ONDE A CONTA TERMINA, em ${DIAS} dias (começa em ${dol(CAPITAL_INICIAL)})\n`);
console.log(cabecalho);
console.log(linha("painel como ele é", rPainel));
console.log(linha("o avesso do painel", rInvertido));
console.log(linha("moeda trocada", rEmbaralhado));

console.log(`\n  perde dinheiro:        ${pct(rPainel.perde.p)} [${pct(rPainel.perde.lo)}–${pct(rPainel.perde.hi)}]`);
console.log(`  afunda abaixo de ${dol(500)}:  ${pct(rPainel.metade.p)} [${pct(rPainel.metade.lo)}–${pct(rPainel.metade.hi)}]`);
console.log(`  afunda abaixo de ${dol(250)}:  ${pct(rPainel.quarto.p)} [${pct(rPainel.quarto.lo)}–${pct(rPainel.quarto.hi)}]`);
console.log(`  queda máxima no caminho: mediana ${pct(rPainel.quedaMaxima.p50)}, p5 ${pct(rPainel.quedaMaxima.p5)}`);
console.log(`  posições fechadas por caminho: mediana ${rPainel.fechadas.p50.toFixed(0)}`);

console.log(`\n  a curva no meio do caminho (mediana):`);
for (let i = 0; i < MARCOS.length; i++) {
  console.log(
    `    ${String(MARCOS[i]).padStart(3)} dias   painel ${dol(rPainel.marcos[i].p50).padStart(9)}` +
      `   avesso ${dol(rInvertido.marcos[i].p50).padStart(9)}   moeda trocada ${dol(rEmbaralhado.marcos[i].p50).padStart(9)}`,
  );
}

console.log(`\n2. O PAINEL SABE ALGUMA COISA? (diferença pareada, em dólares no fim)\n`);
console.log(
  `  A JANELA TEM DIREÇÃO: nos ${diasUnicos.toFixed(1)} dias de amostra a moeda mediana fez ` +
    `${pct(medianaJanela)}, ${caíram} de ${retornosDaJanela.length} caíram,`,
);
console.log(`  e ${pct(fracaoLong)} das calls do painel são compradas.`);
if (janelaEnviesada) {
  console.log(`  ENTÃO A LINHA DO AVESSO NÃO É ACHADO: inverter um painel ${fracaoLong > 0.5 ? "comprado" : "vendido"} numa janela que`);
  console.log(`  ${medianaJanela < 0 ? "caiu" : "subiu"} é ${fracaoLong > 0.5 ? (medianaJanela < 0 ? "vender o que caiu" : "comprar o que subiu") : "o inverso disso"} — a maior parte da diferença é a janela, não o painel.`);
  console.log(`  Quem preserva a mistura de lados, e portanto não ganha da direção da janela,`);
  console.log(`  é a comparação seguinte, contra MOEDA TROCADA. É ela que responde a pergunta.\n`);
} else {
  console.log(`  A janela não tem direção forte o bastante para explicar o avesso sozinha.\n`);
}

for (const [rotulo, d, oque, ressalva] of [
  [
    "contra o próprio avesso",
    vsAvesso,
    "a DIREÇÃO da call (mesma moeda, mesma força, mesmo instante)",
    janelaEnviesada ? "  ⚠ confundido com a direção da janela, acima. Não leia como \"inverta as calls\"." : "",
  ],
  [
    "contra moeda trocada",
    vsMoeda,
    "a ESCOLHA da moeda, com a MESMA mistura de lados",
    "  ⚠ moeda carrega volatilidade junto: perder aqui pode ser escolher errado OU\n    escolher volátil demais para um stop de 25% a 3x. Isto não separa os dois.",
  ],
] as const) {
  console.log(`  ${rotulo} — isola ${oque}`);
  console.log(
    `    mediana ${d.p50 >= 0 ? "+" : ""}${d.p50.toFixed(0)}   (p5 ${d.p5.toFixed(0)}, p95 ${d.p95.toFixed(0)})   ` +
      `painel ganha em ${pct(d.favoravel)} [${pct(d.lo)}–${pct(d.hi)}]`,
  );
  console.log(`    ${d.cobre50 ? "CARA OU COROA: o intervalo cobre 50%." : d.favoravel > 0.5 ? "SEPARA A FAVOR do painel." : "SEPARA CONTRA o painel."}`);
  if (ressalva) console.log(ressalva);
  console.log("");
}

console.log(`3. O TAMANHO DA APOSTA (escala multiplica só o orçamento de risco)\n`);
console.log(cabecalho);
for (const e of rEscalas) {
  console.log(linha(`${e.escala}x  (${pct(0.03 * e.escala)}/${pct(0.02 * e.escala)}/${pct(0.01 * e.escala)} por call)`, e.resumo));
}
console.log(`\n  risco agregado no pico, mediana dos caminhos (teto publicado: ${pct(RISCO_TOTAL_MAXIMO)}):`);
for (const e of rEscalas) {
  const prende = e.resumo.riscoAberto.p50 >= RISCO_TOTAL_MAXIMO - 1e-9;
  console.log(
    `    ${e.escala}x: ${pct(e.resumo.riscoAberto.p50).padStart(6)}   margem exposta ` +
      `${pct(e.resumo.exposicao.p50).padStart(6)} (teto ${pct(EXPOSICAO_MAXIMA)})` +
      `${prende ? "   ← o teto PRENDE" : ""}`,
  );
}
// O TETO AGREGADO TRANSFORMA A ESCALA NUMA OUTRA COISA, e isso precisa estar
// escrito ao lado da tabela para ninguém ler a linha de 3x como "apostar o
// triplo". Com o teto em 25% fixo, dobrar o orçamento por call não dobra o risco
// total: ele faz CABER METADE DAS CALLS, e as que cabem são as de força maior,
// porque o lote é percorrido em ordem de força. Da escala de 1x para cima o que
// está sendo testado é concentração, não tamanho.
console.log(`\n  ACIMA DE 1x A ESCALA DEIXA DE SER TAMANHO: o teto agregado é fixo, então dobrar`);
console.log(`  o orçamento por call faz caber metade das calls — e as que cabem são as de força`);
console.log(`  maior, porque o lote entra em ordem de força. De 1x para cima isto mede`);
console.log(`  concentração, não aposta maior.`);

console.log(`\n4. A RESPOSTA DEPENDE DE ONDE A FITA FOI CORTADA?\n`);
console.log(cabecalho);
for (const b of rBlocos) console.log(linha(`bloco de ${b.horas}h`, b.resumo));
const medianas = rBlocos.map((b) => b.resumo.final.p50);
const amplitude = Math.max(...medianas) - Math.min(...medianas);
console.log(
  `\n  amplitude da mediana entre blocos: ${dol(amplitude)} — ` +
    `${amplitude > CAPITAL_INICIAL * 0.1 ? "GRANDE: a leitura é sobre os 14 dias de amostra, não sobre a carteira." : "pequena: a leitura não depende de onde a fita foi cortada."}`,
);

// ------------------------------------------------------------------- a ressalva

console.log(`\nO QUE ESTE NÚMERO NÃO É\n`);
console.log(`  · A amostra única são ${diasUnicos.toFixed(1)} DIAS. Um caminho de ${DIAS} dias reusa cada dia real`);
console.log(`    ${(DIAS / diasUnicos).toFixed(1)} vezes, e reamostragem nunca gera evento que não esteja na amostra.`);
console.log(`    O pior dia daqui é a lista caindo 5,6% na mediana; o dia que quebra uma conta`);
console.log(`    alavancada de verdade não está nos ${diasUnicos.toFixed(0)} dias. TODA RUÍNA ACIMA É PISO.`);
console.log(`  · Stop e alvo só são testados nas pontas dos retratos — não há velas sintéticas.`);
console.log(`    Medido nas 16 primeiras posições reais, as pontas escondem 2,1 p.p. de excursão`);
console.log(`    na mediana e 5,0 na pior, sempre a favor da carteira.`);
console.log(`  · Cada caminho começa com a conta vazia; a carteira real tem posições abertas.`);
console.log(`  · A janela de amostra tem direção própria (${pct(medianaJanela)} na moeda mediana). Toda`);
console.log(`    comparação entre lados herda essa direção — foi por isso que o avesso ganhou.`);
console.log(`  · Isto NÃO prevê padrão nenhum. Todo caminho aqui já estava na amostra que entrou.\n`);

// ------------------------------------------------------------------ o arquivo

await mkdir(dir, { recursive: true });
await writeFile(
  `${dir}/simulacao.json`,
  JSON.stringify(
    {
      geradoEm: Date.now(),
      comecouEm: COMECO,
      semente: SEMENTE,
      caminhos: CAMINHOS,
      caminhosSweep: SWEEP,
      dias: DIAS,
      marcos: MARCOS,
      bloco: BLOCO,
      amostra: {
        diasUnicos,
        retratos: grade.instantes.length,
        moedas: grade.moedas.length,
        segmentos: grade.segmentos.length,
        dtMediano: grade.dtMediano,
        reuso: DIAS / diasUnicos,
      },
      janela: {
        medianaRetorno: medianaJanela,
        caíram,
        moedas: retornosDaJanela.length,
        fracaoLong,
        enviesada: janelaEnviesada,
      },
      painel: rPainel,
      invertido: rInvertido,
      embaralhado: rEmbaralhado,
      pareado: { avesso: vsAvesso, moeda: vsMoeda },
      escalas: rEscalas,
      blocos: rBlocos,
    },
    null,
    2,
  ),
);
console.log(`gravado em ${dir}/simulacao.json\n`);
