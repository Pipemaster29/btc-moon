/**
 * Os casos-limite do gerador de caminhos, sem tocar em rede.
 *
 * O motor da carteira já tem o portão dele (`npm run testar-carteira`) e este
 * não o repete: aqui o que se testa é a FÁBRICA DE HISTÓRICO, que é onde os
 * modos de falha deste repositório reaparecem com roupa nova.
 *
 * O pior deles é o mais silencioso: um Monte Carlo que costura PREÇO em vez de
 * RETORNO produz um salto de escala em cada emenda, e esse salto vira stop e
 * alvo que nunca existiram. Não dá erro, não dá aviso, e a distribuição sai
 * plausível — só que medindo o corte da fita em vez de medindo o mercado. O
 * caso 2 existe para isso, e prova a ausência do salto contra a maior variação
 * que a amostra de verdade contém.
 *
 * Rode com: npm run testar-simulacao
 */
import { SALTO_ABSURDO, rodar, type Emissao } from "../lib/carteira";
import {
  VAO_MAXIMO,
  faixaBinomial,
  montarGrade,
  quantil,
  semente,
  sortearSerie,
} from "../lib/simulacao";

const T0 = Date.parse("2026-01-01T00:00:00Z") / 1000;
const m = (n: number) => T0 + n * 1200; // retratos de 20 min, a cadência real

let falhas = 0;
function confere(nome: string, ok: boolean, obtido: string): void {
  if (!ok) falhas++;
  console.log(`  ${nome.padEnd(58)} ${obtido.padEnd(26)} ${ok ? "ok" : "← FALHOU"}`);
}

/**
 * Uma grade de brinquedo: duas moedas com call, uma sem.
 *
 * AS SÉRIES TÊM DERIVA FORTE DE PROPÓSITO, e é isso que dá dente ao caso da
 * emenda. Numa série que só oscila em torno de um nível fixo, costurar PREÇO em
 * vez de RETORNO quase não saltaria e o teste passaria por acaso. Com a A subindo
 * onze vezes e a B caindo a um quinto ao longo da fita, dois blocos quaisquer
 * estão em patamares muito diferentes: se a costura fosse de preço, o salto
 * apareceria em ordens de grandeza, enquanto o maior passo real segue perto de
 * 2%. É a diferença entre um teste que prova e um que acompanha.
 */
function historico(passos = 120): Emissao[] {
  const es: Emissao[] = [];
  for (let i = 0; i < passos; i++) {
    es.push({
      t: m(i),
      s: "A",
      preco: Math.exp(i * 0.006) * (1 + 0.02 * Math.sin(i / 3)),
      vies: i % 5 ? "long" : "observar",
      forca: 2,
    });
    es.push({
      t: m(i),
      s: "B",
      preco: 5 * Math.exp(-i * 0.004) * (1 + 0.03 * Math.cos(i / 4)),
      vies: i % 7 ? "short" : "observar",
      forca: 1,
    });
    es.push({ t: m(i), s: "C", preco: 2 * (1 + 0.01 * Math.sin(i / 2)), vies: "observar", forca: 0 });
  }
  return es;
}

console.log("\nA GRADE\n");

{
  const g = montarGrade(historico(), T0 * 1000);
  confere(
    "moeda que nunca teve call direcional fica de fora",
    g.moedas.join(",") === "A,B",
    `moedas: ${g.moedas.join(",")}`,
  );
  confere("a cadência sai da mediana dos vãos", g.dtMediano === 1200, `${g.dtMediano}s`);
  confere("sem buraco grande, um segmento só", g.segmentos.length === 1, `${g.segmentos.length} segmento(s)`);
  confere(
    "o primeiro retrato não vira retorno (não há de onde medir)",
    g.instantes[0].obs.length === 0 && g.instantes[1].obs.length === 2,
    `${g.instantes[0].obs.length} e ${g.instantes[1].obs.length}`,
  );
}

{
  // UM BURACO DE DOZE HORAS NO MEIO. Bloco que o atravessasse carregaria doze
  // horas de financiamento para dentro de uma janela de vinte minutos.
  const es = historico(60);
  const depois = historico(60).map((e) => ({ ...e, t: e.t + 12 * 3600 + 60 * 1200 }));
  const g = montarGrade([...es, ...depois], T0 * 1000);
  confere(
    `vão acima de ${VAO_MAXIMO / 3600}h parte a grade em dois segmentos`,
    g.segmentos.length === 2,
    `${g.segmentos.length} segmento(s)`,
  );
  let lancou = false;
  try {
    sortearSerie(g, { horizonte: 86_400, bloco: 90 * 3600, comecaEm: T0 * 1000 }, semente(1));
  } catch {
    lancou = true;
  }
  confere(
    "bloco que não cabe em segmento nenhum RECLAMA em vez de sortear torto",
    lancou,
    lancou ? "lançou" : "passou calado",
  );
}

{
  // O PREÇO DE LIXO. O JCT foi gravado a 2,9e-27; se essa linha virasse retorno,
  // todo caminho que sorteasse o bloco dela ficaria envenenado — e o veneno é
  // multiplicativo, então ele não some no retrato seguinte.
  const es = historico(40);
  es.push({ t: m(20), s: "A", preco: 2.9e-27, vies: "long", forca: 2 });
  const g = montarGrade(es, T0 * 1000);
  const piorRetorno = Math.max(...g.instantes.flatMap((i) => i.obs.map((o) => Math.abs(o.r))));
  confere(
    "linha de lixo não vira retorno",
    piorRetorno < 1,
    `maior |retorno| na grade: ${(piorRetorno * 100).toFixed(1)}%`,
  );
}

console.log("\nO CAMINHO\n");

const g = montarGrade(historico(400), T0 * 1000);
const opcoes = { horizonte: 30 * 86_400, bloco: 12 * 3600, comecaEm: T0 * 1000 };

{
  // A EMENDA NÃO PODE SALTAR. É o caso que justifica o arquivo: costurar preço
  // em vez de retorno inventaria aqui um salto de escala por bloco.
  const serie = sortearSerie(g, opcoes, semente(7));
  const ultimo = new Map<string, number>();
  let maiorSalto = 1;
  for (const e of serie) {
    const antes = ultimo.get(e.s);
    if (antes !== undefined) maiorSalto = Math.max(maiorSalto, e.preco / antes, antes / e.preco);
    ultimo.set(e.s, e.preco);
  }
  const maiorReal = 1 + Math.max(...g.instantes.flatMap((i) => i.obs.map((o) => Math.abs(o.r))));
  // O que a costura de PREÇO teria produzido: a razão entre o maior e o menor
  // patamar da fita, que é o salto disponível em cada emenda.
  const patamares = [...g.precoInicial.keys()].map((s) => {
    const serieDa = historico(400).filter((e) => e.s === s).map((e) => e.preco);
    return Math.max(...serieDa) / Math.min(...serieDa);
  });
  confere(
    "nenhum salto de preço maior que o da amostra real",
    maiorSalto <= maiorReal + 1e-9,
    `salto ${maiorSalto.toFixed(4)} vs real ${maiorReal.toFixed(4)}`,
  );
  confere(
    "e a emenda de PREÇO teria saltado muito mais",
    Math.max(...patamares) > 5 * maiorReal,
    `patamares até ${Math.max(...patamares).toFixed(1)}x`,
  );
  confere(
    "e portanto nada perto do freio de lixo",
    maiorSalto < SALTO_ABSURDO,
    `${maiorSalto.toFixed(3)} < ${SALTO_ABSURDO}`,
  );
  confere(
    "todo preço gerado é finito e positivo",
    serie.every((e) => Number.isFinite(e.preco) && e.preco > 0),
    `${serie.length} emissões`,
  );
  const ts = serie.map((e) => e.t);
  confere(
    "o tempo só anda para a frente e para dentro do horizonte",
    ts.every((t, i) => i === 0 || t >= ts[i - 1]) && ts[ts.length - 1] <= T0 + opcoes.horizonte,
    `${((ts[ts.length - 1] - T0) / 86_400).toFixed(1)} de ${opcoes.horizonte / 86_400} dias`,
  );
}

{
  // REPRODUTIBILIDADE. Uma probabilidade de ruína que muda entre execuções não é
  // medição — é o mesmo motivo pelo qual `COMECO` é fixo no código.
  const a = sortearSerie(g, opcoes, semente(99));
  const b = sortearSerie(g, opcoes, semente(99));
  confere(
    "mesma semente, série idêntica",
    JSON.stringify(a) === JSON.stringify(b),
    `${a.length} emissões`,
  );
  const c = sortearSerie(g, opcoes, semente(100));
  confere("semente diferente, série diferente", JSON.stringify(a) !== JSON.stringify(c), "difere");
}

{
  // O PAREAMENTO. É o que dá poder à comparação com poucos caminhos: cenário e
  // controle têm de cair sobre os MESMOS blocos, senão a diferença entre eles
  // mistura o sorteio. Foi por isso que a permutação ganhou gerador próprio.
  const base = sortearSerie(g, opcoes, semente(5), semente(5000));
  const avesso = sortearSerie(g, { ...opcoes, inverter: true }, semente(5), semente(5000));
  const trocado = sortearSerie(g, { ...opcoes, permutar: true }, semente(5), semente(5000));

  const mesmoEsqueleto = (x: Emissao[], y: Emissao[]) =>
    x.length === y.length && x.every((e, i) => e.t === y[i].t && e.s === y[i].s && e.preco === y[i].preco);

  confere("o avesso anda sobre os mesmos blocos", mesmoEsqueleto(base, avesso), `${base.length} emissões`);
  confere("a moeda trocada também", mesmoEsqueleto(base, trocado), `${trocado.length} emissões`);

  const viradas = base.filter((e, i) => e.vies === "long" && avesso[i].vies === "short").length;
  const mantidas = base.filter((e, i) => e.vies !== "long" && e.vies !== "short" && e.vies === avesso[i].vies).length;
  confere(
    "toda call direcional vira do avesso",
    base.every((e, i) =>
      e.vies === "long" ? avesso[i].vies === "short"
      : e.vies === "short" ? avesso[i].vies === "long"
      : avesso[i].vies === e.vies,
    ),
    `${viradas} viradas, ${mantidas} intactas`,
  );
  confere(
    "e o que não é call NÃO vira (inventaria call que nunca saiu)",
    mantidas > 0 && avesso.every((e, i) => e.vies === "long" || e.vies === "short" || e.vies === base[i].vies),
    `${mantidas} intactas`,
  );
  confere(
    "a troca de moeda muda o viés de alguém",
    base.some((e, i) => e.vies !== trocado[i].vies),
    "muda",
  );

  // A MISTURA DE LADOS TEM DE SOBREVIVER À TROCA, e isto é o que torna o
  // controle de moeda imune à direção da janela. Se a permutação comesse calls
  // — porque a moeda espelho estava fora daquele retrato —, o controle passaria
  // a ter menos comprado que o painel e ganharia dele por ser mais vendido, que
  // é exatamente o confundidor que ele existe para não ter.
  const conta = (x: Emissao[], lado: string) => x.filter((e) => e.vies === lado).length;
  const difL = Math.abs(conta(base, "long") - conta(trocado, "long")) / Math.max(1, conta(base, "long"));
  const difS = Math.abs(conta(base, "short") - conta(trocado, "short")) / Math.max(1, conta(base, "short"));
  confere(
    "a troca de moeda preserva a mistura long/short",
    difL < 0.05 && difS < 0.05,
    `long ${conta(base, "long")}→${conta(trocado, "long")}, short ${conta(base, "short")}→${conta(trocado, "short")}`,
  );
}

{
  // E O MOTOR DE VERDADE TEM DE ACEITAR ISSO. A série sintética é do mesmo tipo
  // que o histórico grava, então a carteira roda em cima dela sem adaptação —
  // que é a razão de o gerador existir em vez de um simulador paralelo.
  const serie = sortearSerie(g, opcoes, semente(11));
  const c = rodar(serie, T0 * 1000);
  const exposto = c.abertas.reduce((s, p) => s + p.valor * (1 + p.retorno), 0);
  confere(
    "o motor real roda a série e a soma bate",
    Math.abs(c.caixa + exposto - c.patrimonio) < 1e-6 && Number.isFinite(c.patrimonio),
    `patrimônio ${c.patrimonio.toFixed(2)}, ${c.encerradas} fechadas`,
  );
  confere(
    "e o patrimônio fica num intervalo de gente",
    c.patrimonio > 0 && c.patrimonio < 10_000,
    `${c.patrimonio.toFixed(2)}`,
  );
}

console.log("\nAS CONTAS\n");

{
  const o = [1, 2, 3, 4, 5];
  confere("quantil na ponta e no meio", quantil(o, 0) === 1 && quantil(o, 1) === 5 && quantil(o, 0.5) === 3, "1 / 3 / 5");
  confere("quantil interpola", Math.abs(quantil(o, 0.125) - 1.5) < 1e-9, `${quantil(o, 0.125)}`);
  confere("quantil de lista de um", quantil([7], 0.3) === 7, "7");
  confere("quantil de lista vazia é NaN, não zero", Number.isNaN(quantil([], 0.5)), "NaN");
}

{
  // Wilson e não a normal de sempre: com k = 0 a normal devolve limite inferior
  // NEGATIVO, e probabilidade de ruína negativa na tela é pior que nenhuma.
  const [lo0, hi0] = faixaBinomial(0, 400);
  confere("zero ruína: o piso é zero e não negativo", lo0 === 0 && hi0 > 0 && hi0 < 0.02, `[0, ${(hi0 * 100).toFixed(2)}%]`);
  const [lo, hi] = faixaBinomial(40, 400);
  confere("o intervalo cobre a proporção observada", lo < 0.1 && hi > 0.1, `[${(lo * 100).toFixed(1)}%, ${(hi * 100).toFixed(1)}%]`);
  const [, hi1] = faixaBinomial(400, 400);
  confere("cem por cento não passa de cem por cento", hi1 <= 1, `${(hi1 * 100).toFixed(1)}%`);
  const estreito = faixaBinomial(4000, 40_000);
  confere(
    "cem vezes mais caminhos, intervalo dez vezes mais estreito",
    estreito[1] - estreito[0] < (hi - lo) / 3,
    `${((estreito[1] - estreito[0]) * 100).toFixed(2)} p.p. vs ${((hi - lo) * 100).toFixed(1)}`,
  );
}

console.log(falhas === 0 ? "\ntudo passou" : `\n${falhas} caso(s) FALHARAM`);
process.exitCode = falhas === 0 ? 0 : 1;
