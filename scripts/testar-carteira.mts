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
  STOP,
  remarcar,
  rodar,
  type Carteira,
  type Emissao,
  type Passo,
} from "../lib/carteira";

const T0 = Date.parse("2026-01-01T00:00:00Z") / 1000;
const h = (n: number) => T0 + n * 3600;

let falhas = 0;
function confere(nome: string, ok: boolean, obtido: string): void {
  if (!ok) falhas++;
  console.log(`  ${nome.padEnd(52)} ${obtido.padEnd(22)} ${ok ? "ok" : "← FALHOU"}`);
}

function caso(nome: string, es: Emissao[]) {
  const c = rodar(es, T0 * 1000);
  const exposto = c.abertas.reduce((s, p) => s + p.valor * (1 + p.retorno), 0);
  const bate = Math.abs(c.caixa + exposto - c.patrimonio) < 1e-6;
  console.log(
    `${nome.padEnd(34)} patrim ${c.patrimonio.toFixed(2).padStart(8)} · abertas ${c.abertas.length} · ` +
      `fechadas ${c.encerradas} ${c.fechadas.map((f) => f.motivo).join(",")} ${bate ? "" : "· SOMA NÃO BATE"}`,
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
  console.log(`  ${nome.padEnd(44)} ${got.padEnd(11)} ${got === esperado ? "ok" : `← ESPERADO ${esperado}`}`);
}
// o mesmo do lado vendido, onde os sinais invertem
for (const [nome, v, esperado] of casos) {
  const got = ate(v, "short");
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

console.log("\n--- o perpétuo desmentindo o retrato (a HEI de 13/09) ---");
{
  // O BUG MAIS CARO QUE A CARTEIRA TINHA, e ele vivia na costura entre dois
  // freios. A âncora recusava o caminho de velas quando o preço do retrato e o
  // do perpétuo discordavam além de 0,8–1,25 — "não é base de mercado, é outra
  // moeda". E aí o motor caía no teste de ponta E USAVA O MESMO PREÇO RECUSADO
  // para marcar, disparar stop e alvo, e abrir posição.
  //
  // A HEI, 13/09 às 00h20: retrato em US$ 0,1933 com o perpétuo em US$ 0,11606,
  // razão 1,67. Fechou no ALVO a +205,1% da margem — sendo que o alvo é +40% de
  // preço, que a 3x é +120%. Foi o maior ganho do livro e o preço nunca existiu
  // na praça em que esta carteira opera. Medido: 225 das 43.156 linhas com vela
  // para comparar estão fora da faixa, 211 delas da HEI.
  const velasBoas: Passo[] = [0, 1, 2, 3].map((i) => ({
    abriuEm: h(i) * 1000,
    fechouEm: h(i + 1) * 1000,
    abertura: 1,
    maxima: 1.01,
    minima: 0.99,
    fechamento: 1,
  }));
  const mentira: Emissao[] = [
    { t: h(1), s: "X", preco: 1, vies: "long", forca: 3, fund: 0 },
    { t: h(2), s: "X", preco: 1, vies: "long", forca: 3, fund: 0 },
    // A pool imprime +67% enquanto o perpétuo não saiu de 1,00.
    { t: h(3), s: "X", preco: 1.67, vies: "long", forca: 3, fund: 0 },
  ];

  // Sem vela para conferir, o motor não tem como saber e o alvo dispara — é o
  // modo cego dele, e está certo que seja assim. Serve de contraste: é isto que
  // acontecia COM vela também.
  const cego = rodar(mentira, T0 * 1000);
  confere(
    "sem vela para conferir, o alvo dispara (o contraste)",
    cego.fechadas[0]?.motivo === "alvo",
    `${cego.fechadas[0]?.motivo ?? "aberta"}`,
  );

  const comVela = rodar(mentira, T0 * 1000, new Map([["X", velasBoas]]));
  confere(
    "o perpétuo desmente e o alvo NÃO dispara (era +205%)",
    comVela.encerradas === 0 && comVela.abertas.length === 1,
    `${comVela.encerradas} saída(s), ${comVela.abertas.length} aberta(s)`,
  );
  confere(
    "a linha desmentida é contada e substituída pelo perpétuo",
    comVela.diagnostico?.desmentidas === 1 &&
      comVela.diagnostico?.substituidas === 1 &&
      Math.abs((comVela.abertas[0]?.precoAtual ?? 0) - 1) < 1e-9,
    `${comVela.diagnostico?.desmentidas} desmentida(s), marcada a ${comVela.abertas[0]?.precoAtual}`,
  );

  // E o preço derivado do perpétuo NÃO abre posição: ele é bom para não deixar
  // uma posição de pé congelada no escuro, e não para começar uma.
  const soMentira: Emissao[] = [
    { t: h(1), s: "Y", preco: 1, vies: "observar", forca: null, fund: 0 },
    { t: h(2), s: "Y", preco: 1, vies: "observar", forca: null, fund: 0 },
    { t: h(3), s: "Y", preco: 1.67, vies: "long", forca: 3, fund: 0 },
  ];
  const naoAbre = rodar(soMentira, T0 * 1000, new Map([["Y", velasBoas]]));
  confere(
    "preço derivado marca, mas não abre posição",
    naoAbre.abertas.length === 0,
    `${naoAbre.abertas.length} aberta(s)`,
  );
}

console.log("\n--- stop antes de liquidação quando o preço CAMINHOU (a SIREN) ---");
{
  // A SIREN, 09/09 às 22h. A vela abriu em 0,02805 — bem acima do stop em
  // 0,021487 — e desceu até 0,01745, abaixo também da liquidação em 0,019243.
  // O motor testava liquidação ANTES de stop dentro da vela, sob o argumento de
  // que a vela não diz em que ordem o preço passou, e fechou a −100%.
  //
  // O argumento vale entre stop e alvo, que ficam em lados OPOSTOS da entrada.
  // Não vale entre stop e liquidação, que ficam do mesmo lado, um atrás do
  // outro: preço dentro de uma barra é contínuo, e vindo de cima ele cruzou o
  // stop no caminho. A ordem parada foi servida em −25%, a −76% da margem.
  // Vinte e quatro pontos de margem inventados na pior linha do livro.
  const es: Emissao[] = [
    { t: h(0), s: "X", preco: 1, vies: "long", forca: 3, fund: 0 },
    { t: h(3), s: "X", preco: 0.85, vies: "long", forca: 3, fund: 0 },
  ];
  const comoASiren: Passo[] = [
    { abriuEm: h(0) * 1000, fechouEm: h(1) * 1000, abertura: 1, maxima: 1.01, minima: 0.99, fechamento: 1 },
    // Abre em 0,98, MUITO acima do stop em 0,75, e mergulha a 0,62 — abaixo da
    // liquidação, que com o custo de entrada fica em 0,6713.
    { abriuEm: h(1) * 1000, fechouEm: h(2) * 1000, abertura: 0.98, maxima: 0.99, minima: 0.62, fechamento: 0.85 },
    { abriuEm: h(2) * 1000, fechouEm: h(3) * 1000, abertura: 0.85, maxima: 0.86, minima: 0.84, fechamento: 0.85 },
  ];
  const r = rodar(es, T0 * 1000, new Map([["X", comoASiren]]));
  const f = r.fechadas[0];
  confere(
    "caminhou até a liquidação: sai no STOP (era −100%)",
    f?.motivo === "stop" && Math.abs((f?.precoSaida ?? 0) - (1 - STOP)) < 1e-9,
    `${f?.motivo} a ${f?.precoSaida?.toFixed(4)} · ${((f?.retorno ?? 0) * 100).toFixed(1)}%`,
  );

  // E o contrário continua valendo, que é o que impede este conserto de virar um
  // presente: quando a vela ABRE já além da liquidação houve salto, ninguém foi
  // servido no stop, e quem fechou foi a corretora. É o caso que o bloco de
  // cima já trava, repetido aqui do lado do seu oposto para os dois lerem juntos.
  const comSalto: Passo[] = comoASiren.map((v, i) =>
    i === 1 ? { ...v, abertura: 0.6, maxima: 0.6, minima: 0.55 } : v,
  );
  const liq = rodar(es, T0 * 1000, new Map([["X", comSalto]]));
  confere(
    "saltou por cima do stop e da liquidação: LIQUIDADA",
    liq.fechadas[0]?.motivo === "liquidada" && liq.fechadas[0]?.retorno === -1,
    `${liq.fechadas[0]?.motivo} a ${((liq.fechadas[0]?.retorno ?? 0) * 100).toFixed(0)}%`,
  );
}

console.log("\n--- o financiamento cobrado quando a corretora cobra ---");
{
  // Não é contínuo, e era assim que estava modelado. A Binance liquida
  // financiamento às 00:00, 08:00 e 16:00 UTC, de quem está com a posição de pé
  // NAQUELE instante. Medido nas 104 posições da carteira, o agregado empata —
  // 722,95 períodos contra 723 — e cada linha erra: até 0,89 de período, com 42
  // das 104 vivendo menos de oito horas, que é a faixa em que o contínuo cobra
  // uma fração de algo que na vida real é zero ou um.
  const dia = Date.parse("2026-01-01T00:00:00Z") / 1000;
  const em = (hh: number, mm: number) => dia + hh * 3600 + mm * 60;
  const taxa = 0.001;

  // Abre às 08h10 e fecha às 15h50: nenhuma marca no meio, nada a pagar. O
  // modelo contínuo cobrava 7,67/8 de período — 0,288% da margem a 3x.
  const entreMarcas = rodar(
    [
      { t: em(8, 10), s: "X", preco: 1, vies: "long", forca: 3, fund: taxa },
      { t: em(15, 50), s: "X", preco: 1, vies: "observar", forca: null, fund: taxa },
    ],
    dia * 1000,
  );
  confere(
    "7h40 inteiramente entre marcas não paga nada",
    entreMarcas.fechadas[0]?.funding === 0,
    `${((entreMarcas.fechadas[0]?.funding ?? -1) * 100).toFixed(3)}% da margem`,
  );

  // Abre às 07h50 e fecha às 08h10: vinte minutos que ATRAVESSAM a marca das
  // 08h, e a corretora cobra o período inteiro. O contínuo cobrava 0,33/8.
  const cruzaMarca = rodar(
    [
      { t: em(7, 50), s: "X", preco: 1, vies: "long", forca: 3, fund: taxa },
      { t: em(8, 10), s: "X", preco: 1, vies: "observar", forca: null, fund: taxa },
    ],
    dia * 1000,
  );
  confere(
    "20 min atravessando a marca pagam um período inteiro",
    Math.abs((cruzaMarca.fechadas[0]?.funding ?? 0) - taxa * ALAVANCAGEM) < 1e-12,
    `${((cruzaMarca.fechadas[0]?.funding ?? 0) * 100).toFixed(3)}% da margem`,
  );
}

console.log("\n--- o impacto de mercado, que o custo fixo não sabia medir ---");
{
  // O topo de `lib/carteira.ts` listava PROFUNDIDADE como não modelada e citava
  // uma pool à vista de dois mil dólares. Mas a carteira é perpétuo: quem serve
  // a ordem dela é o livro da Binance. O termo é `σ × √(Q/V)`, com a amplitude
  // da própria barra e o volume que ela negociou.
  const es: Emissao[] = [{ t: h(1), s: "X", preco: 1, vies: "long", forca: 3, fund: 0 }];
  const barra = (dolares?: number): Passo[] => [
    {
      abriuEm: h(1) * 1000,
      fechouEm: h(2) * 1000,
      abertura: 1,
      maxima: 1.05,
      minima: 0.95,
      fechamento: 1,
      dolares,
    },
  ];
  const grossa = rodar(es, T0 * 1000, new Map([["X", barra(1e9)]]));
  const rala = rodar(es, T0 * 1000, new Map([["X", barra(1e4)]]));
  const cega = rodar(es, T0 * 1000, new Map([["X", barra(undefined)]]));

  const custoFixo = 2 * 0.0015 * ALAVANCAGEM;
  confere(
    "barra rala custa mais que barra grossa",
    (rala.abertas[0]?.custo ?? 0) > (grossa.abertas[0]?.custo ?? 0),
    `${((rala.abertas[0]?.custo ?? 0) * 100).toFixed(3)}% vs ${((grossa.abertas[0]?.custo ?? 0) * 100).toFixed(3)}%`,
  );
  confere(
    "barra grossa fica perto do custo fixo",
    Math.abs((grossa.abertas[0]?.custo ?? 0) - custoFixo) < 5e-4,
    `${((grossa.abertas[0]?.custo ?? 0) * 100).toFixed(4)}% contra ${(custoFixo * 100).toFixed(2)}%`,
  );
  // Barra sem volume é "não consegui medir", não "não houve impacto": o custo
  // fixo fica sozinho — o comportamento anterior — e a contagem diz quantas.
  confere(
    "barra sem volume não inventa impacto, e é contada",
    Math.abs((cega.abertas[0]?.custo ?? 0) - custoFixo) < 1e-12 &&
      cega.diagnostico?.semImpacto === 1 &&
      cega.diagnostico?.comImpacto === 0,
    `custo ${((cega.abertas[0]?.custo ?? 0) * 100).toFixed(2)}%, ${cega.diagnostico?.semImpacto} sem medida`,
  );
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
  const dois = rodar(es, T0 * 1000, undefined, 2);
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

console.log(falhas === 0 ? "\ntudo passou" : `\n${falhas} caso(s) FALHARAM`);
process.exitCode = falhas === 0 ? 0 : 1;
