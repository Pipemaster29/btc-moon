/**
 * Os casos-limite do motor da carteira, sem tocar em rede.
 *
 * Cada um destes QUEBROU de verdade antes de virar teste, e o primeiro quebrou
 * feio: uma linha de preço de lixo — o JCT foi gravado a 2,9e-27 — fazia mil
 * dólares virarem 1,3e+28, porque a posição fechava no stop a −100%, REABRIA no
 * preço de lixo e fechava no alvo com ganho de 3,5e+28%.
 *
 * Não há framework de teste aqui, e não faz falta: o motor é uma função pura
 * sobre uma lista de emissões, então o teste é chamá-la e olhar o número.
 *
 * Rode com: npm run testar-carteira
 */
import {
  ALAVANCAGEM,
  ALVO,
  CAPITAL_INICIAL,
  RISCO_POR_FORCA,
  RISCO_TOTAL_MAXIMO,
  REGRAS,
  REGRAS_ANTERIORES,
  STOP,
  remarcar,
  rodar,
  type Carteira,
  type Emissao,
  type Passo,
} from "../lib/carteira";
import { eventosNovos, chavesDepois, textoDoEvento, JANELA_REENVIO_MS } from "../lib/avisos";
import { escapeMarkdown } from "../lib/telegram";
import { avisadasDepois, emVistaDe, INICIO_ADIANTE, medirAdiante, novasEmVista, presasPorPosicao, somarAdiante, textoEmVista, textoLigado } from "../lib/emvista";
import type { EstadoFluxo } from "../lib/fluxo";
import { WATCHLIST } from "../lib/watchlist";
import { depthOn, precoArbitrado, unidadesDoContrato, type Pair } from "../lib/dexscreener";
import { ARQUIVO_HISTORICO, arquivoDoHistorico } from "../lib/historico";

const T0 = Date.parse("2026-01-01T00:00:00Z") / 1000;
const h = (n: number) => T0 + n * 3600;

let falhas = 0;
function confere(nome: string, ok: boolean, obtido: string): void {
  if (!ok) falhas++;
  console.log(`  ${nome.padEnd(52)} ${obtido.padEnd(22)} ${ok ? "ok" : "← FALHOU"}`);
}

// O PORTÃO VALE PARA TODA SEÇÃO, e não valia. Estes casos, os limiares e o
// moedor imprimiam "← ESPERADO" ou "SOMA NÃO BATE" e deixavam o código de saída
// em zero: o arquivo prometia ser portão e só metade dele era. Um limiar de stop
// quebrado passava num `npm run testar-carteira && ...` sem ninguém ler a linha.
function caso(nome: string, es: Emissao[]) {
  const c = rodar(es, T0 * 1000);
  const exposto = c.abertas.reduce((s, p) => s + p.valor * (1 + p.retorno), 0);
  const bate = Math.abs(c.caixa + exposto - c.patrimonio) < 1e-6;
  const sano = Number.isFinite(c.patrimonio) && c.patrimonio > 0 && c.patrimonio < 1.5 * CAPITAL_INICIAL;
  if (!bate || !sano) falhas++;
  console.log(
    `${nome.padEnd(34)} patrim ${c.patrimonio.toFixed(2).padStart(8)} · abertas ${c.abertas.length} · ` +
      `fechadas ${c.encerradas} ${c.fechadas.map((f) => f.motivo).join(",")} ${bate ? "" : "· SOMA NÃO BATE"}` +
      `${sano ? "" : " · PATRIMÔNIO FORA DO PLAUSÍVEL"}`,
  );
}

// 1. moeda some do retrato depois de aberta — a posição pode ficar presa?
caso("moeda deslistada, 20 dias depois", [
  { t: h(0), s: "X", preco: 1, vies: "long", forca: 2 },
  { t: h(1), s: "Y", preco: 1, vies: null },
  ...Array.from({ length: 25 }, (_, i) => ({ t: h(24 * (i + 1)), s: "Y", preco: 1, vies: null }) as Emissao),
]);

// 2. preço de lixo — o JCT foi gravado a 2,9e-27
caso("preço vira lixo (2.9e-27)", [
  { t: h(0), s: "X", preco: 1, vies: "long", forca: 2 },
  { t: h(1), s: "X", preco: 2.9e-27, vies: "long", forca: 2 },
]);

// 3. gap maior que o stop
caso("gap de -80% entre retratos", [
  { t: h(0), s: "X", preco: 1, vies: "long", forca: 3 },
  { t: h(1), s: "X", preco: 0.2, vies: "long", forca: 3 },
]);

// 4. short com preço indo a zero (ganho limitado a +100%)
caso("short e o preço vai a quase zero", [
  { t: h(0), s: "X", preco: 1, vies: "short", forca: 3 },
  { t: h(1), s: "X", preco: 0.0001, vies: "short", forca: 3 },
]);

// 5. muitas calls de uma vez — o teto de exposição segura?
caso("40 calls no mesmo instante", [
  ...Array.from({ length: 40 }, (_, i) => ({ t: h(0), s: `M${i}`, preco: 1, vies: "long", forca: 3 }) as Emissao),
]);

// 6. viés vira null (leitura falhou) — deve fechar ou não?
caso("viés vira null no retrato seguinte", [
  { t: h(0), s: "X", preco: 1, vies: "long", forca: 2 },
  { t: h(1), s: "X", preco: 1.05, vies: null },
]);

// --- O MOEDOR: moeda em queda contínua com o painel insistindo em "long".
// Sem a trava de call queimada, a carteira estopa e RECOMPRA no mesmo retrato,
// onze vezes seguidas, perdendo 17% do patrimônio na mesma leitura errada.
{
  const es: Emissao[] = [];
  let preco = 1;
  for (let i = 0; i < 12; i++) {
    es.push({ t: h(i), s: "X", preco, vies: "long", forca: 3, fund: 0 });
    preco *= 0.72;
  }
  const c = rodar(es, T0 * 1000);
  if (c.encerradas !== 1) falhas++;
  console.log(
    `\nqueda contínua com "long" fixo:  ${c.encerradas} stop(s), patrimônio ${c.patrimonio.toFixed(2)} ` +
      `${c.encerradas === 1 ? "ok" : "← DEVERIA SER 1"}`,
  );
}

// --- OS LIMIARES, que são de PREÇO e já foram comparados contra margem por
// engano. Cada linha abaixo trava um número que a documentação promete.
console.log("\n--- os limiares disparam onde a documentação diz? ---");
function ate(varPreco: number, lado: "long" | "short" = "long") {
  const p1 = 1;
  const p2 = lado === "long" ? p1 * (1 + varPreco) : p1 * (1 - varPreco);
  const c = rodar(
    [
      { t: h(0), s: "X", preco: p1, vies: lado, forca: 2, fund: 0 },
      { t: h(1), s: "X", preco: p2, vies: lado, forca: 2, fund: 0 },
    ],
    T0 * 1000,
  );
  return c.fechadas[0]?.motivo ?? "aberta";
}
const casos: [string, number, string][] = [
  ["preço -24% (antes do stop de 25%)", -0.24, "aberta"],
  ["preço -26% (depois do stop)", -0.26, "stop"],
  ["preço +39% (antes do alvo de 40%)", 0.39, "aberta"],
  ["preço +41% (depois do alvo)", 0.41, "alvo"],
  ["preço -34% (depois da liquidação a 33,2%)", -0.34, "liquidada"],
];
for (const [nome, v, esperado] of casos) {
  const got = ate(v);
  if (got !== esperado) falhas++;
  console.log(`  ${nome.padEnd(44)} ${got.padEnd(11)} ${got === esperado ? "ok" : `← ESPERADO ${esperado}`}`);
}
// o mesmo do lado vendido, onde os sinais invertem
for (const [nome, v, esperado] of casos) {
  const got = ate(v, "short");
  if (got !== esperado) falhas++;
  console.log(`  vendido: ${nome.padEnd(35)} ${got.padEnd(11)} ${got === esperado ? "ok" : `← ESPERADO ${esperado}`}`);
}

console.log("\n--- o caso que preocupa: lixo e volta ---");
const c = rodar(
  [
    { t: h(0), s: "X", preco: 1, vies: "long", forca: 2 },
    { t: h(1), s: "X", preco: 2.9e-27, vies: "long", forca: 2 },
    { t: h(2), s: "X", preco: 1.02, vies: "long", forca: 2 },
  ],
  T0 * 1000,
);
console.log("patrimônio:", c.patrimonio.toFixed(2), "· fechadas:", c.encerradas);
for (const f of c.fechadas) {
  console.log(`  ${f.motivo}: entrou a ${f.precoEntrada}, saiu a ${f.precoSaida}, retorno ${(f.retorno * 100).toFixed(0)}%`);
}
for (const p of c.abertas) console.log(`  aberta a ${p.precoEntrada}, agora ${p.precoAtual}, retorno ${(p.retorno * 100).toFixed(0)}%`);

// ---------------------------------------------------------------------------
// O QUE VEM ABAIXO QUEBROU DE VERDADE E ESTAVA NO CÓDIGO EM 04/09.
//
// Cada bloco tem a reprodução do estrago e o número que ele produzia, para o
// teste continuar dizendo o que está protegendo mesmo depois que ninguém se
// lembrar do bug.
// ---------------------------------------------------------------------------

console.log("\n--- o lixo abrindo posição, que o teste acima não pegava ---");
{
  // O teste "lixo e volta" abria a posição ANTES do lixo chegar, e aí
  // `abertas.has` barrava a reabertura. Basta a moeda AINDA NÃO estar aberta
  // quando a linha de lixo chega: a fase de abertura lia `e.preco` cru, sem
  // passar pelo freio do `SALTO_ABSURDO` que a fase de marcação já usava.
  // Antes do conserto isto fechava em US$ 1,4e+28.
  const r = rodar(
    [
      { t: h(0), s: "X", preco: 1, vies: "observar", forca: 2 },
      { t: h(1), s: "X", preco: 2.9e-27, vies: "long", forca: 2 },
      { t: h(2), s: "X", preco: 1.02, vies: "long", forca: 2 },
    ],
    T0 * 1000,
  );
  confere(
    "lixo chega com a moeda fechada (era 1,4e+28)",
    r.patrimonio < 1100 && r.abertas.every((p) => p.precoEntrada > 0.5),
    `patrim ${r.patrimonio.toExponential(3)}`,
  );
}

console.log("\n--- a leitura ausente descongelando a call queimada ---");
{
  // O moedor de novo, agora com um retrato SEM leitura entre os stops. A trava
  // solta a call quando `vies !== lado`, e `null !== "long"` é verdadeiro — um
  // único retrato mudo bastava. Antes do conserto: 12 stops e US$ 814,23.
  const es: Emissao[] = [];
  let preco = 1;
  for (let i = 0; i < 12; i++) {
    es.push({ t: h(i * 2), s: "X", preco, vies: "long", forca: 3, fund: 0 });
    preco *= 0.72;
    es.push({ t: h(i * 2 + 1), s: "X", preco, vies: null, forca: null, fund: 0 });
  }
  const r = rodar(es, T0 * 1000);
  confere(
    "queda contínua com um retrato mudo (era 12 stops)",
    r.encerradas === 1,
    `${r.encerradas} saída(s), ${r.patrimonio.toFixed(2)}`,
  );

  // E o contrário tem de continuar valendo: leitura DE VERDADE do outro lado
  // solta a call, senão a trava viraria banimento permanente da moeda.
  const solta = rodar(
    [
      { t: h(0), s: "X", preco: 1, vies: "long", forca: 3, fund: 0 },
      { t: h(1), s: "X", preco: 0.7, vies: "long", forca: 3, fund: 0 },
      { t: h(2), s: "X", preco: 0.7, vies: "short", forca: 3, fund: 0 },
      { t: h(3), s: "X", preco: 0.7, vies: "long", forca: 3, fund: 0 },
    ],
    T0 * 1000,
  );
  confere(
    "leitura do outro lado ainda descongela",
    solta.abertas.length === 1,
    `${solta.abertas.length} aberta(s)`,
  );
}

console.log("\n--- o caminho entre os retratos, com velas ---");
{
  // Preço nas duas pontas em 1, e no meio ele foi a 0,70 e voltou. Só nas
  // pontas a carteira nunca vê nada; com o caminho, o stop de 25% executou.
  const emissoes: Emissao[] = [
    { t: h(0), s: "X", preco: 1, vies: "long", forca: 3, fund: 0 },
    { t: h(6), s: "X", preco: 1, vies: "long", forca: 3, fund: 0 },
  ];
  const mergulho: Passo[] = [1, 2, 3, 4, 5, 6].map((i) => ({
    abriuEm: h(i - 1) * 1000,
    fechouEm: h(i) * 1000,
    abertura: i === 3 ? 0.9 : 1,
    maxima: 1.02,
    minima: i === 3 ? 0.7 : 0.98,
    fechamento: 1,
  }));

  const pontas = rodar(emissoes, T0 * 1000);
  const caminho = rodar(emissoes, T0 * 1000, new Map([["X", mergulho]]));
  confere("só nas pontas: mergulho invisível", pontas.encerradas === 0, `${pontas.encerradas} saída(s)`);
  confere(
    "com o caminho: stop executa no nível, não na mínima",
    caminho.fechadas[0]?.motivo === "stop" &&
      Math.abs((caminho.fechadas[0]?.precoSaida ?? 0) - (1 - STOP)) < 1e-9,
    `${caminho.fechadas[0]?.motivo} a ${caminho.fechadas[0]?.precoSaida.toFixed(4)}`,
  );

  // Vela que ABRE do outro lado do nível é salto: ninguém foi servido no nível,
  // e o preenchimento é na abertura — pior que o stop, melhor que o alvo. A
  // janela precisa ir até o retrato, senão a âncora é medida contra uma vela
  // distante e o caminho inteiro é recusado (o que também está certo, e é o que
  // o caso "outra escala" logo abaixo trava).
  //
  // O salto para em −28%: passado o stop de 25% e AQUÉM da liquidação, que a 3x
  // fica em −32,9% de preço. Um pouco mais fundo e quem fecha é a corretora, não
  // a ordem — que é o caso logo abaixo.
  const salto: Passo[] = [1, 2, 3, 4, 5, 6].map((i) => ({
    abriuEm: h(i - 1) * 1000,
    fechouEm: h(i) * 1000,
    abertura: i === 3 ? 0.72 : 1,
    maxima: 1.02,
    minima: i === 3 ? 0.7 : 0.98,
    fechamento: 1,
  }));
  const comSalto = rodar(emissoes, T0 * 1000, new Map([["X", salto]]));
  confere(
    "salto por cima do stop preenche na abertura",
    comSalto.fechadas[0]?.motivo === "stop" &&
      Math.abs((comSalto.fechadas[0]?.precoSaida ?? 0) - 0.72) < 1e-9,
    `${comSalto.fechadas[0]?.motivo} a ${(comSalto.fechadas[0]?.precoSaida ?? 0).toFixed(4)}`,
  );

  // Salto mais fundo que a liquidação: a corretora não espera a regra de saída,
  // e a margem inteira se perde mesmo que o preço volte na mesma vela.
  const saltoFundo: Passo[] = salto.map((v, i) =>
    i === 2 ? { ...v, abertura: 0.6, minima: 0.55 } : v,
  );
  const comLiquidacao = rodar(emissoes, T0 * 1000, new Map([["X", saltoFundo]]));
  confere(
    "salto por cima da liquidação perde a margem inteira",
    comLiquidacao.fechadas[0]?.motivo === "liquidada" &&
      comLiquidacao.fechadas[0]?.retorno === -1,
    `${comLiquidacao.fechadas[0]?.motivo} a ${((comLiquidacao.fechadas[0]?.retorno ?? 0) * 100).toFixed(0)}%`,
  );

  // Mergulho CONTÍNUO até além da liquidação: a vela abre na entrada e desce
  // a 0,55. O preço cruzou o stop (0,75) antes da liquidação (~0,67), e a ordem
  // parada lá executa primeiro — liquidar aqui era o motor até 24/09.
  const mergulhoFundo: Passo[] = mergulho.map((v, i) => (i === 2 ? { ...v, abertura: 1, minima: 0.55 } : v));
  const semSaltar = rodar(emissoes, T0 * 1000, new Map([["X", mergulhoFundo]]));
  confere(
    "mergulho contínuo além da liquidação: o stop, que está antes, executa",
    semSaltar.fechadas[0]?.motivo === "stop" && Math.abs((semSaltar.fechadas[0]?.precoSaida ?? 0) - (1 - STOP)) < 1e-9,
    `${semSaltar.fechadas[0]?.motivo} a ${(semSaltar.fechadas[0]?.precoSaida ?? 0).toFixed(4)}`,
  );

  // A ÂNCORA: as velas vêm do perpétuo e o preço do retrato prefere a pool. Um
  // desalinhamento pequeno é base de mercado e tem de ser CORRIGIDO, não
  // recusado — senão a moeda com pool viva perderia o caminho justamente por
  // ter pool viva. Aqui a pool marca 5% acima, e o stop precisa sair no nível
  // da escala da carteira, não na do perpétuo.
  const cincoPorCento: Passo[] = mergulho.map((v) => ({
    ...v,
    abertura: v.abertura / 1.05,
    maxima: v.maxima / 1.05,
    minima: v.minima / 1.05,
    fechamento: v.fechamento / 1.05,
  }));
  const ancorado = rodar(emissoes, T0 * 1000, new Map([["X", cincoPorCento]]));
  confere(
    "base de 5% entre praças é corrigida, não recusada",
    ancorado.fechadas[0]?.motivo === "stop" &&
      Math.abs((ancorado.fechadas[0]?.precoSaida ?? 0) - (1 - STOP)) < 1e-9,
    `${ancorado.fechadas[0]?.motivo} a ${(ancorado.fechadas[0]?.precoSaida ?? 0).toFixed(4)}`,
  );

  // O alvo, do outro lado, e no nível.
  const subida: Passo[] = [
    { abriuEm: h(0) * 1000, fechouEm: h(1) * 1000, abertura: 1.01, maxima: 1.6, minima: 1, fechamento: 1 },
  ];
  const comAlvo = rodar(emissoes, T0 * 1000, new Map([["X", subida]]));
  confere(
    "alvo intrabar executa no nível",
    comAlvo.fechadas[0]?.motivo === "alvo" &&
      Math.abs((comAlvo.fechadas[0]?.precoSaida ?? 0) - (1 + ALVO)) < 1e-9,
    `${comAlvo.fechadas[0]?.motivo} a ${comAlvo.fechadas[0]?.precoSaida.toFixed(4)}`,
  );

  // Vela de OUTRA MOEDA — escala 40 vezes fora — tem de ser recusada inteira em
  // vez de inventar stop. É o mesmo julgamento do SALTO_ABSURDO.
  const outraMoeda: Passo[] = mergulho.map((v) => ({
    ...v,
    abertura: v.abertura * 40,
    maxima: v.maxima * 40,
    minima: v.minima * 40,
    fechamento: v.fechamento * 40,
  }));
  const recusado = rodar(emissoes, T0 * 1000, new Map([["X", outraMoeda]]));
  confere(
    "vela de outra escala é recusada, não corrigida",
    recusado.encerradas === 0,
    `${recusado.encerradas} saída(s)`,
  );

  // A VELA QUE CONTÉM A ENTRADA contém também os minutos antes dela. Aqui a
  // posição abre em h(0) e a vela que fecha em h(1) mergulhou a 0,70 — mas ela
  // abriu meia hora ANTES da posição existir, então esse mergulho não é dela.
  // Sem o `abriuEm` a carteira estopava por um movimento anterior à entrada, que
  // é uma perda inventada — pior do que uma perda não vista.
  const antesDaEntrada: Passo[] = [
    { abriuEm: (h(0) - 1800) * 1000, fechouEm: h(1) * 1000, abertura: 1, maxima: 1.02, minima: 0.7, fechamento: 1 },
    { abriuEm: h(1) * 1000, fechouEm: h(2) * 1000, abertura: 1, maxima: 1.02, minima: 0.98, fechamento: 1 },
  ];
  const semHeranca = rodar(emissoes, T0 * 1000, new Map([["X", antesDaEntrada]]));
  confere(
    "vela aberta antes da entrada não estopa a posição",
    semHeranca.encerradas === 0,
    `${semHeranca.encerradas} saída(s)`,
  );
}

console.log("\n--- o preço do retrato tem de ser o do perpétuo daquela hora ---");
{
  // A FORMA EXATA DA HEI. A pool rasa devolvia de vez em quando 1,6 a 2 vezes o
  // preço do perpétuo, e o retrato alternava entre os dois. Abaixo do salto de
  // dez vezes, o motor aceitava: `ancora` recusava o caminho por ser "outra
  // moeda", e o teste de ponta usava o mesmo preço para fechar no alvo —
  // US$ 142 de lucro que o perpétuo nunca tocou.
  const plana: Passo[] = [1, 2, 3, 4, 5, 6].map((i) => ({
    abriuEm: h(i - 1) * 1000,
    fechouEm: h(i) * 1000,
    abertura: 1,
    maxima: 1.02,
    minima: 0.98,
    fechamento: 1,
  }));
  const hei: Emissao[] = [
    { t: h(0), s: "X", preco: 1, vies: "long", forca: 3, fund: 0 },
    { t: h(2), s: "X", preco: 1.7, vies: "long", forca: 3, fund: 0 },
    { t: h(4), s: "X", preco: 1, vies: "long", forca: 3, fund: 0 },
  ];
  const semJuiz = rodar(hei, T0 * 1000);
  confere("sem velas: o preço alheio fecha no alvo (o defeito)", semJuiz.fechadas[0]?.motivo === "alvo", `${semJuiz.fechadas[0]?.motivo ?? "nada"}`);
  const comJuiz = rodar(hei, T0 * 1000, new Map([["X", plana]]));
  confere("com velas: o preço alheio não fecha nada", comJuiz.encerradas === 0 && comJuiz.abertas.length === 1, `${comJuiz.encerradas} saída(s)`);
  confere("e é contado", comJuiz.foraDoPerpetuo === 1, `${comJuiz.foraDoPerpetuo ?? 0} linha(s)`);
  // A outra ponta: o mesmo preço alheio também não ABRE posição.
  const abre = rodar([{ t: h(1), s: "X", preco: 1.7, vies: "long", forca: 3, fund: 0 }], T0 * 1000, new Map([["X", plana]]));
  confere("o preço alheio não abre posição", abre.abertas.length === 0, `${abre.abertas.length} aberta(s)`);
  // E um movimento de verdade, forte, dentro da hora, passa: o preço está
  // entre a mínima e a máxima da vela, que é o que o juiz olha.
  const pump: Passo[] = plana.map((v, i) => (i === 1 ? { ...v, maxima: 1.9, fechamento: 1.8 } : v));
  const real = rodar([{ t: h(1) + 1800, s: "X", preco: 1.85, vies: "long", forca: 3, fund: 0 }], T0 * 1000, new Map([["X", pump]]));
  confere("pump de verdade dentro da hora passa", real.abertas.length === 1 && !real.foraDoPerpetuo, `${real.abertas.length} aberta(s)`);
  // O preço da série do perpétuo pode vir com uma hora de atraso: na TAKE de
  // 23/09 o retrato das 06:00 levava o fechamento das 05:00, abaixo da mínima
  // das 06:00. Cabe na vela anterior, então passa.
  const disparada: Passo[] = plana.map((v, i) => (i === 2 ? { ...v, abertura: 1.4, minima: 1.4, maxima: 1.6, fechamento: 1.5 } : v));
  const atrasado = rodar([{ t: h(2) + 60, s: "X", preco: 1, vies: "long", forca: 3, fund: 0 }], T0 * 1000, new Map([["X", disparada]]));
  confere("preço de uma hora atrás passa", atrasado.abertas.length === 1 && !atrasado.foraDoPerpetuo, `${atrasado.abertas.length} aberta(s)`);

  // A ÂNCORA PELA BASE MEDIDA. Moeda sem pool: o retrato grava o último negócio
  // (desde 24/09). A posição estopou dentro da vela de h1 e, 40 minutos depois
  // de h2, a moeda já disparava a 1,4. Contra o fechamento da última vela (1,0),
  // a razão é 1,4: âncora recusada, caminho descartado, e o stop que aconteceu
  // não acontece. Com `pp` no retrato a base é 1 e o caminho vale.
  const estopouEDisparou: Passo[] = [
    { abriuEm: h(0) * 1000, fechouEm: h(1) * 1000, abertura: 1, maxima: 1.02, minima: 0.98, fechamento: 1 },
    { abriuEm: h(1) * 1000, fechouEm: h(2) * 1000, abertura: 1, maxima: 1.02, minima: 0.7, fechamento: 1 },
    { abriuEm: h(2) * 1000, fechouEm: h(3) * 1000, abertura: 1, maxima: 1.45, minima: 1, fechamento: 1.4 },
  ];
  const semBase: Emissao[] = [
    { t: h(0), s: "X", preco: 1, vies: "long", forca: 3, fund: 0 },
    { t: h(2) + 2400, s: "X", preco: 1.4, vies: "long", forca: 3, fund: 0 },
  ];
  const comBase: Emissao[] = semBase.map((e) => ({ ...e, pp: e.preco }));
  const cego = rodar(semBase, T0 * 1000, new Map([["X", estopouEDisparou]]));
  confere("sem a base: pump depois do stop apaga o stop (o defeito)", cego.encerradas === 0, `${cego.encerradas} saída(s)`);
  const ancoradoPelaBase = rodar(comBase, T0 * 1000, new Map([["X", estopouEDisparou]]));
  confere(
    "com a base medida: o stop dentro da vela executa",
    ancoradoPelaBase.fechadas[0]?.motivo === "stop" && Math.abs((ancoradoPelaBase.fechadas[0]?.precoSaida ?? 0) - (1 - STOP)) < 1e-9,
    `${ancoradoPelaBase.fechadas[0]?.motivo ?? "nada"} a ${(ancoradoPelaBase.fechadas[0]?.precoSaida ?? 0).toFixed(4)}`,
  );
}

console.log("\n--- linha descartada não apaga o caminho; a régua do salto vence ---");
{
  // Achado na revisão do PR #6: a linha descartada pelo juiz deixava a posição
  // "sem preço", e o financiamento cobrado ali andava o relógio dela — o
  // retrato seguinte pulava as velas do intervalo e o stop que aconteceu nelas
  // sumia. Long a 1,0 em h0, vela de h1 com mínima 0,7 (stop em 0,75), linha
  // de pool alheia a 1,7 em h2 e um minuto, linha boa a 1,0 em h4.
  const velas: Passo[] = [0, 1, 2, 3, 4, 5].map((i) => ({
    abriuEm: h(i) * 1000,
    fechouEm: h(i + 1) * 1000,
    abertura: 1,
    maxima: 1.02,
    minima: i === 1 ? 0.7 : 0.98,
    fechamento: 1,
  }));
  const es: Emissao[] = [
    { t: h(0), s: "X", preco: 1, vies: "long", forca: 3, fund: 0 },
    { t: h(2) + 60, s: "X", preco: 1.7, vies: "long", forca: 3, fund: 0 },
    { t: h(4), s: "X", preco: 1, vies: "long", forca: 3, fund: 0 },
  ];
  const c = rodar(es, T0 * 1000, new Map([["X", velas]]));
  confere(
    "stop dentro da vela sobrevive à linha descartada",
    c.fechadas[0]?.motivo === "stop" && Math.abs((c.fechadas[0]?.precoSaida ?? 0) - (1 - STOP)) < 1e-9,
    `${c.fechadas[0]?.motivo ?? "nada"}, ${c.foraDoPerpetuo ?? 0} descartada`,
  );

  // A régua do salto de dez vezes vence em um dia: a moeda que volta depois
  // de um dia sem leitura, 95% abaixo, é mercado; a mesma queda em dez
  // minutos é lixo.
  const volta = rodar(
    [
      { t: h(0), s: "Y", preco: 1, vies: "long", forca: 3, fund: 0 },
      { t: h(30), s: "Y", preco: 0.05, vies: "long", forca: 3, fund: 0 },
    ],
    T0 * 1000,
  );
  confere("depois de um dia fora, 95% abaixo é preço", volta.encerradas === 1, `${volta.fechadas[0]?.motivo ?? "nada"}`);
  const lixo = rodar(
    [
      { t: h(0), s: "Y", preco: 1, vies: "long", forca: 3, fund: 0 },
      { t: h(0) + 600, s: "Y", preco: 0.05, vies: "long", forca: 3, fund: 0 },
    ],
    T0 * 1000,
  );
  confere("em dez minutos, 95% abaixo é lixo", lixo.encerradas === 0 && lixo.abertas.length === 1, `${lixo.encerradas} saída(s)`);
}

console.log("\n--- quem entra quando o orçamento de risco acaba ---");
{
  // 40 calls de força 1 (0,5% cada = 20%) chegando ANTES de 10 de força 3
  // (1,5% cada): o teto de 25% estoura no meio do lote. Antes do conserto, a
  // ordem do arquivo decidia — 3 das 10 fortes entravam se elas viessem por
  // último, e 10 de 10 se viessem primeiro. Mesmas calls, livros opostos.
  const fracas: Emissao[] = Array.from({ length: 40 }, (_, i) => ({
    t: h(0), s: `FRACA${i}`, preco: 1, vies: "long", forca: 1, fund: 0,
  }));
  const fortes: Emissao[] = Array.from({ length: 10 }, (_, i) => ({
    t: h(0), s: `FORTE${i}`, preco: 1, vies: "long", forca: 3, fund: 0,
  }));

  const conta = (es: Emissao[]) => {
    const r = rodar(es, T0 * 1000);
    const s = r.abertas.map((p) => p.symbol);
    return {
      fortes: s.filter((x) => x.startsWith("FORTE")).length,
      fracas: s.filter((x) => x.startsWith("FRACA")).length,
      risco: r.maiorRiscoAberto,
    };
  };
  const depois = conta([...fracas, ...fortes]);
  const antes = conta([...fortes, ...fracas]);

  // O ESPERADO SAI DAS CONSTANTES, e não de um número escrito aqui: quantas
  // fortes cabem é o teto agregado dividido pelo risco de uma força 3. Travar
  // "10 de 10" amarrava o teste à régua da época, e ele reprovou quando o
  // tamanho da aposta dobrou — sem nada ter piorado, só passando a caber menos.
  //
  // Que uma FRACA entre depois de a última forte não caber está certo e não é
  // exceção: com 8 fortes somando 24%, sobra 1% de orçamento, e 1% é exatamente
  // uma força 1. Recusar isso deixaria orçamento parado sem motivo.
  const cabemFortes = Math.min(10, Math.floor(RISCO_TOTAL_MAXIMO / RISCO_POR_FORCA[3] + 1e-9));
  confere(
    "as fortes enchem o orçamento antes de qualquer fraca",
    depois.fortes === cabemFortes,
    `${depois.fortes} de ${cabemFortes} que cabem · ${depois.fracas} fracas na sobra`,
  );
  confere(
    "a ordem do lote não muda mais o livro",
    depois.fortes === antes.fortes && depois.fracas === antes.fracas,
    `${depois.fortes}/${depois.fracas} vs ${antes.fortes}/${antes.fracas}`,
  );
  confere(
    "o teto de risco agregado é respeitado",
    depois.risco <= RISCO_TOTAL_MAXIMO + 1e-9,
    `${(depois.risco * 100).toFixed(1)}% de ${(RISCO_TOTAL_MAXIMO * 100).toFixed(0)}%`,
  );
}

console.log("\n--- o tamanho da aposta como parâmetro ---");
{
  const es: Emissao[] = [
    { t: h(0), s: "X", preco: 1, vies: "long", forca: 2, fund: 0 },
    { t: h(1), s: "X", preco: 1.5, vies: "long", forca: 2, fund: 0 },
  ];
  const um = rodar(es, T0 * 1000);
  const dois = rodar(es, T0 * 1000, undefined, { ...REGRAS, escala: 2 });
  // Dobrar o orçamento tem de dobrar o RESULTADO em dólar, e não mexer no
  // retorno sobre a margem — que é o que diz que só o tamanho mudou.
  const g1 = um.fechadas[0], g2 = dois.fechadas[0];
  confere(
    "escala 2x dobra o resultado em dólar",
    g1 != null && g2 != null && Math.abs(g2.resultado / g1.resultado - 2) < 1e-6,
    `US$ ${g1?.resultado.toFixed(2)} → US$ ${g2?.resultado.toFixed(2)}`,
  );
  confere(
    "escala não mexe no retorno sobre a margem",
    g1 != null && g2 != null && Math.abs(g2.retorno - g1.retorno) < 1e-9,
    `${((g1?.retorno ?? 0) * 100).toFixed(1)}% em ambas`,
  );
  confere(
    "a queda máxima é medida e não é positiva",
    um.quedaMaxima <= 0 && Number.isFinite(um.quedaMaxima),
    `${(um.quedaMaxima * 100).toFixed(2)}%`,
  );
  confere(
    "a curva tem pontos e o pico >= capital inicial",
    um.curva.length > 0 && um.pico >= CAPITAL_INICIAL,
    `${um.curva.length} pontos, pico ${um.pico.toFixed(2)}`,
  );
}

console.log("\n--- a marcação ao vivo, que roda no navegador ---");
{
  const base = rodar(
    [{ t: h(0), s: "X", preco: 1, vies: "long", forca: 3, fund: 0.001 }],
    T0 * 1000,
  );
  const agora = h(0) * 1000 + 24 * 3_600_000;

  // O financiamento das horas desde o retrato. Sem ele a marcação viva mostrava
  // sistematicamente MAIS do que a posição valia, e sempre para o mesmo lado.
  const comFunding = remarcar(base, new Map([["X", 1]]), agora, new Map([["X", 0.001]]));
  const esperado = (24 / 8) * 0.001 * ALAVANCAGEM;
  confere(
    "24h paradas cobram o financiamento das 24h",
    Math.abs((comFunding.abertas[0]?.funding ?? 0) - esperado) < 1e-9,
    `${((comFunding.abertas[0]?.funding ?? 0) * 100).toFixed(2)}% da margem`,
  );

  // A margem isolada é o teto da perda. Sem a trava, `valor * (1 + retorno)`
  // virava dinheiro NEGATIVO e o patrimônio da tela ficava abaixo do caixa.
  const estourada = remarcar(base, new Map([["X", 0.5]]), agora);
  const p = estourada.abertas[0];
  confere(
    "queda de 50% não inventa dívida (para em −100%)",
    p?.retorno === -1 && p?.estourada === true && estourada.patrimonio >= estourada.caixa,
    `retorno ${((p?.retorno ?? 0) * 100).toFixed(0)}%, patrim ${estourada.patrimonio.toFixed(2)}`,
  );

  // A bandeira apaga quando o preço volta. Ela é remarcada por cima da marcação
  // anterior a cada quinze segundos, e uma bandeira que só liga ficaria acesa
  // para sempre depois do primeiro susto.
  const voltou = remarcar(estourada, new Map([["X", 1]]), agora);
  confere(
    "a bandeira de margem zerada apaga quando o preço volta",
    voltou.abertas[0]?.estourada === false && (voltou.abertas[0]?.retorno ?? -1) > -1,
    `estourada=${voltou.abertas[0]?.estourada}, retorno ${((voltou.abertas[0]?.retorno ?? 0) * 100).toFixed(0)}%`,
  );

  // Marcar duas vezes o MESMO instante tem de dar o mesmo número: o servidor
  // marca uma vez e o navegador remarca por cima a cada quinze segundos.
  const duasVezes = remarcar(comFunding, new Map([["X", 1]]), agora, new Map([["X", 0.001]]));
  confere(
    "remarcar duas vezes o mesmo instante não cobra duas vezes",
    Math.abs(duasVezes.patrimonio - comFunding.patrimonio) < 1e-9,
    `${duasVezes.patrimonio.toFixed(4)} vs ${comFunding.patrimonio.toFixed(4)}`,
  );

  // E a soma tem de continuar batendo depois de tudo isso.
  const bate = (x: Carteira) =>
    Math.abs(x.caixa + x.abertas.reduce((s, a) => s + a.valor * (1 + a.retorno), 0) - x.patrimonio) <
    1e-9;
  confere(
    "caixa + exposto = patrimônio depois de remarcar",
    bate(comFunding) && bate(estourada),
    `retorno total ${(comFunding.retorno * 100).toFixed(2)}% sobre ${CAPITAL_INICIAL}`,
  );
}

// ---------------------------------------------------------------------------
// O REGIME DE 23/09. Cada regra nova trava aqui o que a medição sustenta — e a
// armadilha nº 7 do AGENTS.md: um freio que existe numa metade do caminho não
// existe. A saída por tempo só funciona se a call queimar; sem isso, ela sai e
// reabre no mesmo lote.
// ---------------------------------------------------------------------------

console.log("\n--- sem reação: a posição que não anda sai, e não reabre ---");
{
  const dia = (d: number) => h(24 * d);
  // Parada um pouco abaixo da entrada por cinco dias, com o painel insistindo.
  const parada: Emissao[] = [0, 1, 2, 3, 4, 5].map((d) => ({
    t: dia(d), s: "X", preco: d === 0 ? 1 : 0.99, vies: "long", forca: 2, fund: 0,
  }));
  const r = rodar(parada, T0 * 1000);
  const saida = r.fechadas[0];
  confere(
    `sai "sem reação" no dia ${REGRAS.semReacaoDias}`,
    r.encerradas === 1 && saida?.motivo === "sem reação" && Math.abs((saida?.dias ?? 0) - (REGRAS.semReacaoDias ?? 0)) < 1e-9,
    `${saida?.motivo} aos ${saida?.dias.toFixed(1)} dias`,
  );
  // A armadilha: sem queimar a call, o mesmo lote reabriria e o relógio zeraria
  // — medido, o regime sem esta trava vai de +14,8% para +5,0%.
  confere("e não reabre com o mesmo viés", r.abertas.length === 0, `${r.abertas.length} aberta(s)`);

  // A favor, mesmo que pouco, ela fica: não é stop, é tempo.
  const andando = parada.map((e, i) => ({ ...e, preco: i === 0 ? 1 : 1.01 }));
  const fica = rodar(andando, T0 * 1000);
  confere("a favor, mesmo pouco, ela fica", fica.encerradas === 0 && fica.abertas.length === 1, `${fica.encerradas} saída(s)`);

  // Leitura nova do outro lado descongela, como no stop.
  const volta: Emissao[] = [
    ...parada.slice(0, 4),
    { t: dia(3) + 3600, s: "X", preco: 0.99, vies: "observar", forca: 0, fund: 0 },
    { t: dia(3) + 7200, s: "X", preco: 0.99, vies: "long", forca: 2, fund: 0 },
  ];
  const reabre = rodar(volta, T0 * 1000);
  confere("viés que sai e volta é call nova", reabre.abertas.length === 1, `${reabre.abertas.length} aberta(s)`);
}

console.log("\n--- o prazo queima a call (antes reabria no mesmo lote) ---");
{
  // Duas semanas a favor e o painel ainda comprado. No regime anterior a
  // posição saía por prazo e reabria no mesmo lote, pagando 0,9% da margem para
  // continuar onde estava — foi o que aconteceu com a PRL em 22/09.
  const es: Emissao[] = Array.from({ length: 16 }, (_, d) => ({
    t: h(24 * d), s: "X", preco: d === 0 ? 1 : 1.05, vies: "long", forca: 2, fund: 0,
  }));
  const r = rodar(es, T0 * 1000);
  confere(
    "sai por prazo e não reabre",
    r.fechadas[0]?.motivo === "prazo" && r.abertas.length === 0,
    `${r.fechadas.map((f) => f.motivo).join(",")} · ${r.abertas.length} aberta(s)`,
  );
  const antes = rodar(es, T0 * 1000, undefined, REGRAS_ANTERIORES);
  confere(
    "no regime anterior, reabria",
    antes.fechadas[0]?.motivo === "prazo" && antes.abertas.length === 1,
    `${antes.abertas.length} aberta(s)`,
  );
}

console.log("\n--- o vendido arrisca a fração dele ---");
{
  const r = rodar(
    [
      { t: h(0), s: "C", preco: 1, vies: "long", forca: 2, fund: 0 },
      { t: h(0), s: "V", preco: 1, vies: "short", forca: 2, fund: 0 },
    ],
    T0 * 1000,
  );
  const c = r.abertas.find((p) => p.symbol === "C");
  const v = r.abertas.find((p) => p.symbol === "V");
  // Um milésimo de folga, e não um bilionésimo: a vendida abre DEPOIS da
  // comprada no mesmo lote, quando o patrimônio já pagou a entrada dela (0,24
  // dólar). A régua é sobre o patrimônio do instante — o risco abaixo é exato.
  confere(
    `margem do vendido = ${REGRAS.fatorVendido} × a do comprado`,
    c != null && v != null && Math.abs(v.valor / c.valor - REGRAS.fatorVendido) < 1e-3,
    `${c?.valor.toFixed(2)} vs ${v?.valor.toFixed(2)}`,
  );
  confere(
    "e o risco gravado na posição é o mesmo",
    c?.risco != null && v?.risco != null && Math.abs(v.risco / c.risco - REGRAS.fatorVendido) < 1e-9,
    `${((c?.risco ?? 0) * 100).toFixed(2)}% vs ${((v?.risco ?? 0) * 100).toFixed(2)}%`,
  );
}

console.log("\n--- o freio de queda ---");
{
  // Uma queda grande de propósito: escala 6 faz a força 3 arriscar 18%, e o
  // stop dela leva a conta a ~−19% — dentro da faixa do freio.
  const regras = { ...REGRAS, escala: 6 };
  const es: Emissao[] = [
    { t: h(0), s: "X", preco: 1, vies: "long", forca: 3, fund: 0 },
    { t: h(1), s: "X", preco: 0.74, vies: "long", forca: 3, fund: 0 },
    { t: h(1), s: "Y", preco: 1, vies: "long", forca: 1, fund: 0 },
  ];
  const r = rodar(es, T0 * 1000, undefined, regras);
  const y = r.abertas.find((p) => p.symbol === "Y");
  const f = REGRAS.freio;
  // O patrimônio no instante em que Y abriu é o caixa de agora mais a margem
  // que saiu para ela; o pico é o capital inicial.
  const queda = y ? 1 - (r.caixa + y.valor) / CAPITAL_INICIAL : NaN;
  const esperado =
    f === null ? 1 : queda <= f.inicio ? 1 : queda >= f.fim ? f.piso : 1 - ((queda - f.inicio) / (f.fim - f.inicio)) * (1 - f.piso);
  const pedido = (REGRAS.riscoPorForca[1] ?? 0) * regras.escala;
  confere(
    "depois da queda, a call nova arrisca menos",
    y?.risco != null && Math.abs(y.risco - pedido * esperado) < 1e-9 && esperado < 1,
    `queda ${(queda * 100).toFixed(1)}% → ${(((y?.risco ?? 0) / pedido) * 100).toFixed(0)}% da régua`,
  );
  confere(
    "e a carteira grava o freio de agora",
    r.freio !== undefined && r.freio < 1,
    `freio ${((r.freio ?? 1) * 100).toFixed(0)}%`,
  );
}

console.log("\n--- o stop móvel, que não está no regime mas o motor sabe fazer ---");
{
  // Medido e REPROVADO em 23/09, e continua no motor para a tabela do
  // `npm run carteira` continuar medindo. Então ele precisa estar certo.
  const regras = { ...REGRAS, rastro: { ativa: 0.1, distancia: 0.05 }, semReacaoDias: null };
  const emissoes: Emissao[] = [
    { t: h(0), s: "X", preco: 1, vies: "long", forca: 2, fund: 0 },
    { t: h(3), s: "X", preco: 1.15, vies: "long", forca: 2, fund: 0 },
  ];
  // Vela 1: sobe a 1,20 e recua a 1,12 — abaixo de 1,20 × 0,95 = 1,14. Se o
  // rastro subisse antes do teste, a posição sairia aqui por um recuo que pode
  // ter vindo ANTES da máxima. Vela 2: toca 1,13 com o rastro já em 1,14.
  const velas: Passo[] = [
    { abriuEm: h(0) * 1000, fechouEm: h(1) * 1000, abertura: 1, maxima: 1.2, minima: 1.12, fechamento: 1.16 },
    { abriuEm: h(1) * 1000, fechouEm: h(2) * 1000, abertura: 1.16, maxima: 1.17, minima: 1.13, fechamento: 1.15 },
    { abriuEm: h(2) * 1000, fechouEm: h(3) * 1000, abertura: 1.15, maxima: 1.16, minima: 1.14, fechamento: 1.15 },
  ];
  const r = rodar(emissoes, T0 * 1000, new Map([["X", velas]]), regras);
  const f = r.fechadas[0];
  confere(
    "o rastro não sobe no meio da vela que o empurrou",
    f != null && f.fechadaEm === h(2) * 1000,
    f ? `saiu às h${(f.fechadaEm / 1000 - T0) / 3600}` : "não saiu",
  );
  confere(
    "e sai no nível, como stop móvel",
    f?.motivo === "stop móvel" && Math.abs((f?.precoSaida ?? 0) - 1.14) < 1e-9,
    `${f?.motivo} a ${f?.precoSaida.toFixed(4)}`,
  );

  // Rastro acima da entrada: a posição não pode mais devolver capital, e não
  // ocupa o orçamento que existe para limitar perda.
  const trava = rodar(
    [{ t: h(0), s: "X", preco: 1, vies: "long", forca: 3, fund: 0 }, { t: h(1), s: "X", preco: 1.3, vies: "long", forca: 3, fund: 0 }],
    T0 * 1000,
    undefined,
    { ...regras, rastro: { ativa: 0.1, distancia: 0.1 } },
  );
  confere(
    "stop acima da entrada zera o risco comprometido",
    trava.abertas.length === 1 && trava.riscoAberto === 0,
    `stop em ${trava.abertas[0]?.nivelStop?.toFixed(3)} · risco ${((trava.riscoAberto ?? -1) * 100).toFixed(1)}%`,
  );
}

console.log("\n--- a marcação viva sinaliza a saída que o retrato vai fazer ---");
{
  const base = rodar([{ t: h(0), s: "X", preco: 1, vies: "long", forca: 2, fund: 0 }], T0 * 1000);
  const abaixo = remarcar(base, new Map([["X", 0.7]]), h(1) * 1000);
  confere(
    "abaixo do stop: sinaliza, não fecha",
    abaixo.abertas[0]?.saida === "stop" && abaixo.encerradas === 0,
    `saida=${abaixo.abertas[0]?.saida}`,
  );
  const parada = remarcar(base, new Map([["X", 0.99]]), h(24 * 4) * 1000);
  confere("sem reação depois do prazo: sinaliza", parada.abertas[0]?.saida === "sem reação", `saida=${parada.abertas[0]?.saida}`);
  const voltou = remarcar(abaixo, new Map([["X", 1.05]]), h(2) * 1000);
  confere("e a bandeira apaga quando o preço volta", voltou.abertas[0]?.saida === undefined, `saida=${voltou.abertas[0]?.saida}`);
}

// ------------------------------------------------------ avisos no Telegram
//
// O que pode dar errado aqui é mandar DEMAIS (o passado recalculado virando
// enxurrada, o mesmo aviso duas vezes) ou mandar de MENOS (o aviso recusado que
// nunca é tentado de novo). Cada caso trava um dos dois.
console.log(`\navisos de trade`);
{
  const HORA = 3_600_000;
  const agora = Date.parse("2026-09-23T18:00:00Z");
  const base = (over: Partial<Carteira>): Carteira =>
    ({
      comecouEm: agora - 20 * 24 * HORA, atualizadoEm: agora, caixa: 900, patrimonio: 1000, retorno: 0,
      abertas: [], fechadas: [], acertos: 0, encerradas: 0, porMotivo: {}, porLado: {},
      pico: 1000, quedaMaxima: 0, maiorExposicao: 0, maiorRiscoAberto: 0, curva: [], ...over,
    }) as Carteira;
  const aberta = (symbol: string, abertaEm: number) => ({
    symbol, lado: "long" as const, abertaEm, precoEntrada: 0.1234, valor: 27.5, forca: 2, precoAtual: 0.13,
    retorno: 0.05, funding: 0, precoLiquidacao: 0.0829, ultimoFunding: abertaEm, ultimaTaxa: null, nivelStop: 0.0925,
  });
  const fechada = (symbol: string, abertaEm: number, fechadaEm: number) => ({
    symbol, lado: "short" as const, abertaEm, fechadaEm, precoEntrada: 1, precoSaida: 1.25, forca: 1,
    motivo: "stop" as const, retorno: -0.76, funding: -0.01, resultado: -4.2, dias: (fechadaEm - abertaEm) / (24 * HORA),
  });

  confere("sem carteira anterior: nada é avisado", eventosNovos(null, base({ abertas: [aberta("X", agora)] })).length === 0, "0");

  // Primeira vez (arquivo sem `avisos`): corte exato no retrato anterior.
  const ant1 = base({ atualizadoEm: agora - HORA });
  const atual1 = base({ abertas: [aberta("NOVA", agora - 30 * 60_000), aberta("VELHA", agora - 2 * HORA)] });
  const e1 = eventosNovos(ant1, atual1);
  confere("primeira vez: avisa só o que é depois do retrato anterior", e1.length === 1 && e1[0].tipo === "abriu" && e1[0].p.symbol === "NOVA", e1.map((e) => (e.tipo === "abriu" ? e.p.symbol : e.f.symbol)).join(","));

  // Com memória: o recusado de 3 h atrás volta; o já avisado e o de 10 h, não.
  const ant2 = base({ atualizadoEm: agora - HORA, avisos: { enviados: ["A|AVISADA|" + (agora - 2 * HORA)] } });
  const atual2 = base({
    abertas: [aberta("RECUSADA", agora - 3 * HORA), aberta("AVISADA", agora - 2 * HORA), aberta("ANTIGA", agora - 10 * HORA)],
  });
  const e2 = eventosNovos(ant2, atual2).map((e) => (e.tipo === "abriu" ? e.p.symbol : e.f.symbol));
  confere("reenvia o recusado dentro da janela, nunca o já avisado", e2.join(",") === "RECUSADA", e2.join(",") || "nada");
  confere(`janela de reenvio é de ${JANELA_REENVIO_MS / HORA} h`, !e2.includes("ANTIGA"), e2.includes("ANTIGA") ? "ANTIGA entrou" : "ANTIGA fora");

  // Abriu e fechou entre dois retratos: um aviso só, marcado como inteiro.
  const ant3 = base({ atualizadoEm: agora - HORA, avisos: { enviados: [] } });
  const atual3 = base({ fechadas: [fechada("RAPIDA", agora - 50 * 60_000, agora - 10 * 60_000)] });
  const e3 = eventosNovos(ant3, atual3);
  confere("abriu e fechou no intervalo: um aviso, com as duas horas", e3.length === 1 && e3[0].tipo === "fechou" && e3[0].inteira, e3.map((e) => e.tipo).join(","));

  // O passado recalculado (regra mudou) não vira enxurrada.
  const atual4 = base({ fechadas: Array.from({ length: 40 }, (_, i) => fechada(`T${i}`, agora - (100 + i) * HORA, agora - (50 + i) * HORA)) });
  confere("passado recalculado não vira aviso", eventosNovos(ant3, atual4).length === 0, `${eventosNovos(ant3, atual4).length}`);

  // A memória acumula e não repete.
  const chaves = chavesDepois(ant2, eventosNovos(ant2, atual2));
  const ant5 = base({ atualizadoEm: agora, avisos: { enviados: chaves } });
  confere("depois de avisado, o mesmo evento não sai de novo", eventosNovos(ant5, atual2).length === 0, `${chaves.length} chaves`);

  // O texto: diz que é fictícia, e o escape não deixa caractere reservado solto.
  const t = textoDoEvento(e1[0], 1139.4, "caindo do topo com motor intacto");
  confere("o aviso diz que é carteira fictícia", t.includes("Carteira fictícia · não é recomendação"), t.split("\n")[0]);
  const esc = escapeMarkdown(t);
  const solto = esc.replace(/\\./g, "").match(/[_*[\]()~`>#+\-=|{}.!]/);
  confere("MarkdownV2 sem caractere reservado solto", solto === null, solto ? `solto: ${solto[0]}` : "limpo");
}

// ------------------------------------------------------ moedas em vista
//
// Os dois modos de falha são os mesmos dos avisos, e mais um: a moeda que
// ENTRA sem dever. Aposentada voltando pela porta dos fundos, perpétuo não
// conferido, moeda que a Binance parou de movimentar há meses.
console.log(`\nmoedas em vista`);
{
  const DIA = 86_400_000;
  const agora = Date.parse("2026-09-23T18:00:00Z");
  const id = (perp: string | null, vistoEm?: number, conferidoEm = agora - DIA) => ({
    symbol: perp?.replace(/USDT$/, "") ?? "LIXO", decimals: 18, perp, mult: 1, conferidoEm, vistoEm,
  });
  // Uma aposentada montada à mão: a lista real de hoje não tem nenhuma, e o
  // caso não pode depender de alguém aposentar uma moeda para rodar.
  const naLista = WATCHLIST[0].symbol;
  const aposentada = "APOSENTADAUSDT";
  const lista = [
    ...WATCHLIST,
    { ...WATCHLIST[0], symbol: aposentada, aposentada: { desde: "2026-09-01", porque: "teste" } },
  ];
  const estado: EstadoFluxo = {
    ultimoBloco: 1,
    tokens: {
      "0xnova": id("NOVAUSDT", agora - DIA),
      "0xlista": id(naLista, agora),
      "0xaposentada": id(aposentada, agora),
      "0xsemperp": id(null, agora),
      "0xvelha": id("VELHAUSDT", agora - 31 * DIA),
      "0xsemdata": id("SEMDATAUSDT", Number.NaN, Number.NaN),
      "0xantiga": id("SEMVISTOUSDT", undefined, agora - 5 * DIA),
      "0xponte1": id("PONTEUSDT", agora - 3 * DIA),
      "0xponte2": id("PONTEUSDT", agora - DIA),
    },
  };
  const ev = emVistaDe(estado, agora, lista);
  const s = ev.map((t) => t.symbol).join(",");
  confere("fora: a lista, a aposentada, sem perpétuo", !ev.some((t) => t.symbol === naLista || t.symbol === aposentada), s);
  confere("fora: 31 dias sem passar, e data que não é número", !s.includes("VELHA") && !s.includes("SEMDATA"), s);
  confere("sem `vistoEm`, vale o `conferidoEm`", s.includes("SEMVISTO"), s);
  const ponte = ev.filter((t) => t.symbol === "PONTEUSDT");
  confere("dois contratos, um perpétuo: fica o visto por último", ponte.length === 1 && ponte[0].contract === "0xponte2", ponte.map((t) => t.contract).join(","));
  confere("toda em vista carrega a origem", ev.every((t) => t.origem === "carteira-binance"), `${ev.length} moedas`);

  const n1 = novasEmVista(estado, ev);
  confere("sem memória: primeira vez, nenhuma nova", n1.primeira && n1.novas.length === 0, JSON.stringify(n1.novas.length));
  const comMemoria = { ...estado, emVista: { avisadas: ["NOVAUSDT", "SAIUUSDT"] } };
  const n2 = novasEmVista(comMemoria, ev);
  confere("com memória: só as não anunciadas", !n2.primeira && !n2.novas.some((t) => t.symbol === "NOVAUSDT") && n2.novas.length === ev.length - 1, n2.novas.map((t) => t.symbol).join(","));
  const mem = avisadasDepois(["NOVAUSDT", "SAIUUSDT"], ev, ["PONTEUSDT"]);
  confere("a memória solta quem saiu de vista", mem.join(",") === "NOVAUSDT,PONTEUSDT", mem.join(","));

  const t = textoEmVista(ev[0], { preco: 0.01234, variacao24h: 0.42, fluxo: { cmp: 125_000, vnd: 40_000, dep: 1_500, saq: 0 } });
  confere("o aviso diz que não é recomendação", t.includes("não é recomendação"), t.split("\n")[0]);
  const semPreco = textoEmVista(ev[0], { preco: Number.NaN, fluxo: { cmp: Number.NaN, vnd: 0, dep: 0, saq: 0 } });
  confere("NaN não vira número no aviso", !semPreco.includes("NaN"), `${semPreco.split("\n").length} linhas`);
  for (const [nome, texto] of [["aviso", t], ["ligado", textoLigado(ev)]] as const) {
    const solto = escapeMarkdown(texto).replace(/\\./g, "").match(/[_*[\]()~`>#+\-=|{}.!]/);
    confere(`MarkdownV2 limpo (${nome})`, solto === null, solto ? `solto: ${solto[0]}` : "limpo");
  }
}

// ------------------------------------------ a tese das em vista, adiante
//
// A conferência só mede alguma coisa se não contar o que trouxe a moeda: o dia
// da chegada, o dia aberto, e quem saiu de vista não pode sumir da conta.
console.log(`\nem vista, adiante`);
{
  const DIA = 86_400_000;
  const d0 = INICIO_ADIANTE;
  // Série diária: `altas` são os índices (a partir de 1) com +30% no dia.
  const serie = (dias: number, altas: number[]) => {
    const v: { time: number; close: number }[] = [];
    let c = 1;
    for (let i = 0; i < dias; i++) {
      if (altas.includes(i)) c *= 1.3;
      v.push({ time: (d0 - 2 * DIA + i * DIA) / 1000, close: c });
    }
    return v;
  };
  const agora = d0 + 5 * DIA + 3_600_000; // o dia 5 está aberto
  const id = (perp: string, primeiroVisto: number | undefined, vistoEm: number) => ({
    symbol: perp, decimals: 18, perp, mult: 1, conferidoEm: vistoEm, vistoEm, primeiroVisto,
  });
  const estado: EstadoFluxo = {
    ultimoBloco: 1,
    tokens: {
      "0xa": id("ANTESUSDT", d0 - 3 * DIA, d0 + DIA), // já estava: conta desde o início
      "0xb": id("CHEGOUUSDT", d0 + 2 * DIA + 5_000, d0 + 2 * DIA + 5_000), // chegou no dia 2
      "0xc": id("SAIUUSDT", d0 - 20 * DIA, d0 - 20 * DIA), // saiu de vista no meio: fica
      "0xd": id(WATCHLIST[0].symbol, d0, d0), // na lista: fora dos dois grupos
    },
  };
  const series = new Map([
    ["ANTESUSDT", serie(10, [1, 3])], // dia 1 é antes do início; dia 3 (= d0+1) conta
    ["CHEGOUUSDT", serie(10, [4, 5])], // dia 4 = d0+2, a chegada; dia 5 = d0+3, conta
    ["SAIUUSDT", serie(10, [])],
    ["RESTOUSDT", serie(10, [2, 6, 7])], // d0 conta, d0+4 conta, d0+5 aberto
    [WATCHLIST[0].symbol, serie(10, [3, 4, 5])],
  ]);
  const bruto = medirAdiante(series, estado, agora);
  const a = somarAdiante(bruto);
  confere("antes do início não conta; depois conta", a.emVista.altas === 2, `${a.emVista.altas} altas`);
  // ANTES: d0..d0+4 = 5 dias; CHEGOU: d0+3..d0+4 = 2; SAIU: 5.
  confere("dia da chegada e dia aberto ficam fora", a.emVista.moedaDias === 12, `${a.emVista.moedaDias} moeda-dias`);
  confere("quem saiu de vista continua no grupo", bruto.moedas.emVista === 3, `${bruto.moedas.emVista} moedas`);
  confere("o resto: sem lista, sem carteira", bruto.moedas.resto === 1 && a.resto.altas === 2 && a.resto.moedaDias === 5, `${a.resto.altas}/${a.resto.moedaDias}`);
  const semEstado = medirAdiante(series, null, agora);
  confere("sem estado do fluxo, ninguém é em vista", semEstado.moedas.emVista === 0, `${semEstado.moedas.resto} no resto`);

  // ACUMULADO: 40 dias depois, as velas (30) já não cobrem o começo, e a conta
  // tem de continuar sendo "desde o início" e não virar janela móvel.
  const depois = d0 + 40 * DIA + 3_600_000;
  const recentes = new Map([["RESTOUSDT", serie(42, []).slice(-30)]]);
  const b = medirAdiante(recentes, estado, depois, WATCHLIST, bruto);
  const somaB = somarAdiante(b);
  confere("os dias fora das velas ficam do arquivo anterior", somaB.resto.altas === 2 && b.dias[new Date(d0).toISOString().slice(0, 10)] !== undefined, `${somaB.dias} dias, ${somaB.resto.altas} altas no resto`);
  // Uma rodada em que as velas de uma moeda não vieram lê MENOS: não apaga.
  const falha = medirAdiante(new Map([["SAIUUSDT", serie(10, [])]]), estado, agora, WATCHLIST, bruto);
  confere("leitura que falhou não apaga a que funcionou", somarAdiante(falha).emVista.moedaDias === 12, `${somarAdiante(falha).emVista.moedaDias} moeda-dias`);
  // A pool secou depois do dump e a reconferência deixou `perp` nulo: a moeda
  // continua sendo das em vista (`perpVisto`), e não passa a contar no resto.
  const secou: EstadoFluxo = {
    ...estado,
    tokens: { ...estado.tokens, "0xa": { ...estado.tokens["0xa"], perp: null, perpVisto: "ANTESUSDT" } },
  };
  const s2 = medirAdiante(series, secou, agora);
  confere("pool que secou não passa a contar no resto", s2.moedas.emVista === 3 && s2.moedas.resto === 1, `${s2.moedas.emVista} em vista, ${s2.moedas.resto} resto`);
  const outroComeco = medirAdiante(series, estado, agora, WATCHLIST, { ...bruto, desde: d0 - DIA });
  confere("arquivo de outro começo não se junta", somarAdiante(outroComeco).emVista.moedaDias === 12, "refeito do zero");
}

// --------------------------------- posição aberta segura a moeda no retrato
console.log(`\nsaiu de vista com posição aberta`);
{
  const linha = (ticker: string, origem?: string) => ({
    symbol: `${ticker}USDT`, ticker, chain: "bsc", contract: `0x${ticker.toLowerCase()}`, ...(origem ? { origem } : {}),
  });
  const anteriores = [linha("SAIU", "carteira-binance"), linha("AINDA", "carteira-binance"), linha("DALISTA"), linha("SEMPOSICAO", "carteira-binance")];
  const presas = presasPorPosicao(["SAIU", "AINDA", "DALISTA"], new Set(["AINDAUSDT"]), anteriores);
  const s = presas.map((t) => t.symbol).join(",");
  confere("segura a em vista que saiu com posição aberta", s === "SAIUUSDT", s || "nenhuma");
  confere("volta com contrato, rede e origem da linha anterior", presas[0]?.contract === "0xsaiu" && presas[0]?.origem === "carteira-binance", presas[0]?.contract ?? "—");
  // Uma leitura falha tirou a moeda do retrato anterior: sem o estado do fluxo,
  // ela não estaria mais em lugar nenhum para ser segurada.
  const estadoSegura: EstadoFluxo = {
    ultimoBloco: 1,
    tokens: { "0xsumiu": { symbol: "SUMIU", decimals: 18, perp: null, perpVisto: "SUMIUUSDT", mult: 1, conferidoEm: 1 } },
  };
  const doEstado = presasPorPosicao(["SUMIU"], new Set(), [], estadoSegura);
  confere("segura pelo estado do fluxo mesmo fora do retrato anterior", doEstado[0]?.contract === "0xsumiu", doEstado.map((t) => t.symbol).join(",") || "nenhuma");
}

// ------------------------------------------------ a pool de outra moeda
//
// O endereço de um token devolve também as pools em que ele é o PAGAMENTO, e
// nelas o preço é o da outra moeda. A AIOT entrou em vista lendo o preço da AIT
// — 2,7 vezes fora, abaixo do freio de 100 vezes — e a carteira abriu posição
// nele. Este caso é a forma exata daquilo.
console.log(`\npool de outra moeda`);
{
  const par = (propria: boolean | undefined, priceUsd: number, liquidityUsd: number): Pair => ({
    chain: "bsc", dex: "pancakeswap", address: "0x", baseSymbol: propria ? "AIOT" : "AIT", quoteSymbol: "WBNB",
    priceUsd, liquidityUsd, volume24h: 1, buys24h: 1, sells24h: 1, change24h: 0, fdv: 0, marketCap: 0, propria,
  });
  const d = depthOn([par(false, 0.01846, 13_809_865), par(true, 0.05025, 1_463_241)], "bsc");
  confere("o preço é o da pool em que a moeda é a base", d?.priceUsd === 0.05025, `${d?.priceUsd}`);
  confere("a liquidez não soma a pool alheia", d?.liquidityUsd === 1_463_241, `${d?.liquidityUsd}`);
  confere("só pool alheia: sem profundidade, não preço errado", depthOn([par(false, 0.01846, 1e6)], "bsc") === null, "null");
  confere("busca por nome (sem a marca) segue igual", depthOn([par(undefined, 2, 10)], "bsc")?.priceUsd === 2, "2");

  // O árbitro, que é a mesma regra no retrato, na página de detalhe e nos
  // alertas on-chain.
  const arb = (pool: number | null, perp: number | null) => precoArbitrado(pool, perp);
  confere("pool a 10% do perpétuo manda (a HEI de hoje)", arb(0.1321, 0.1459).fonte === "pool", arb(0.1321, 0.1459).fonte);
  confere("pool a 1,6x do perpétuo não manda (a HEI de 09/09)", arb(0.1836, 0.115).preco === 0.115, `${arb(0.1836, 0.115).preco}`);
  confere("sem pool, o perpétuo", arb(null, 0.05).fonte === "perpétuo", arb(null, 0.05).fonte);
  confere("sem nada, zero declarado", arb(0, null).fonte === "nenhum" && arb(0, null).preco === 0, arb(0, null).fonte);
  confere("NaN na pool não vira preço", arb(Number.NaN, 0.05).preco === 0.05, `${arb(Number.NaN, 0.05).preco}`);
  // Contrato de mil unidades: a pool é por token, o perpétuo por mil. Sem a
  // conversão, a razão de mil mandava o perpétuo, e o detalhe da 1000SHIB
  // avaliava cada token pelo preço de mil.
  const shib = precoArbitrado(0.0000056, 0.0056, unidadesDoContrato("1000SHIBUSDT"));
  confere("1000SHIB: a pool por token manda", shib.fonte === "pool" && shib.preco === 0.0000056, `${shib.fonte} ${shib.preco}`);
  const bob = precoArbitrado(null, 0.01876, unidadesDoContrato("1000000BOBUSDT"));
  confere("1000000BOB sem pool: o perpétuo POR TOKEN", Math.abs(bob.preco - 1.876e-8) < 1e-15, `${bob.preco}`);
  confere("moeda comum: uma unidade por contrato", unidadesDoContrato("TAKEUSDT") === 1 && unidadesDoContrato("4USDT") === 1, "1");
}

// ---------------------------------------------------------------------------
// O ARQUIVO DO HISTÓRICO: um por mês até setembro, um por quinzena desde
// outubro (`lib/historico.ts`) — o mês com as em vista chegaria a 101 MB, e o
// GitHub recusa o push inteiro acima de 100. As viradas e o padrão que os
// leitores reconhecem, que é onde um erro faria linhas sumirem da carteira.
{
  console.log("\no arquivo do histórico");
  const nome = (iso: string) => arquivoDoHistorico(Date.parse(iso));
  confere("30/09 23:59 ainda é o mensal", nome("2026-09-30T23:59:59Z") === "historico-2026-09.jsonl", nome("2026-09-30T23:59:59Z"));
  confere("01/10 00:00 abre a 1ª quinzena", nome("2026-10-01T00:00:00Z") === "historico-2026-10-1.jsonl", nome("2026-10-01T00:00:00Z"));
  confere("15/10 23:59 ainda é a 1ª", nome("2026-10-15T23:59:59Z") === "historico-2026-10-1.jsonl", nome("2026-10-15T23:59:59Z"));
  confere("16/10 00:00 abre a 2ª", nome("2026-10-16T00:00:00Z") === "historico-2026-10-2.jsonl", nome("2026-10-16T00:00:00Z"));
  confere("31/12 é a 2ª de dezembro", nome("2026-12-31T23:00:00Z") === "historico-2026-12-2.jsonl", nome("2026-12-31T23:00:00Z"));
  const aceitos = ["historico-2026-09.jsonl", "historico-2026-10-1.jsonl", "historico-2027-01-2.jsonl"];
  const recusados = ["historico-2026-10-3.jsonl", "historico-2026-10.json", "fluxo-binance-2026-09.jsonl", "historico-2026-1-1.jsonl"];
  confere("os leitores reconhecem mensal e quinzenal", aceitos.every((f) => ARQUIVO_HISTORICO.test(f)), aceitos.join(" "));
  confere("e nada além deles", !recusados.some((f) => ARQUIVO_HISTORICO.test(f)), recusados.filter((f) => ARQUIVO_HISTORICO.test(f)).join(" ") || "nenhum");
}

console.log(falhas === 0 ? "\ntudo passou" : `\n${falhas} caso(s) FALHARAM`);
process.exitCode = falhas === 0 ? 0 : 1;
