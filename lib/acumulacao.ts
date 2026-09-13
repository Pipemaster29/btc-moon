/**
 * O evento de volume de cada moeda, e o que ele vale — que é menos que zero.
 *
 * Isto existe porque a pergunta chega toda semana, e chegou de novo com o MOVR:
 * "o volume foi ao topo histórico e o preço não andou, isso não é acumulação?".
 * A leitura fica aqui para a pergunta ter resposta na tela, com o número medido
 * ao lado, em vez de ser respondida de novo toda vez.
 *
 * ================================================== O QUE FOI MEDIDO, E DEU NÃO
 *
 * `npm run aferir-acumulacao` refaz tudo isto do zero. Sobre 512 perpétuos e 354
 * mil observações, com a metodologia do placar — mediana à frente contra a
 * referência de TODAS as observações, mais a concordância entre moedas:
 *
 * 1. O SALTO DE VOLUME PREVÊ QUEDA, e mais quanto maior o salto. Salto ≥40x a
 *    mediana de 90 dias, com o dia andando menos de 5%: mediana de −10,70% em 7
 *    dias contra referência de −1,28%, e 32 de 123 moedas a favor. Monotônico de
 *    10x a 40x e igual em 14, 30, 60 e 90 dias.
 *
 * 2. "O PREÇO NÃO ANDOU" SUAVIZA E NÃO INVERTE. Exigir que o dia tenha andado
 *    menos de 5% melhora o desfecho em 1,6 a 2,6 p.p. e ele continua 4 a 9 p.p.
 *    abaixo da referência. É menos ruim, não é bom.
 *
 * 3. PRESSÃO COMPRADORA NÃO SE MEDE AQUI, e este é o achado que mais economiza
 *    trabalho. No perpétuo toda negociação tem os dois lados, e a fração agressiva
 *    compradora nos dias de salto fica colada em 0,5: p10 = 0,479, mediana =
 *    0,496, p90 = 0,510 sobre 7.627 dias de salto. Cortar em "compra ≥55%" deixa
 *    SETE observações no universo inteiro. Ou seja: "houve compra pesada" não é
 *    uma leitura que este dado sustente — nem a favor nem contra. O campo
 *    `pressao` existe para mostrar o quanto ele é sempre 0,5, e não para decidir
 *    nada.
 *
 * 4. PREÇO BARATO CONTRA O VWAP TAMBÉM NÃO SALVA. O desconto contra o preço médio
 *    que o dinheiro pagou nos últimos 90 dias separa entre −0,97 e +0,25 p.p. em
 *    sete dias sobre 354 mil observações — cara ou coroa, com as duas pontas
 *    ruins. E DEPOIS de um salto de volume, TODA faixa de desconto fica de 3,4 a
 *    7,9 p.p. abaixo da referência: a mais barata delas, 30 a 50% abaixo do VWAP,
 *    mede −4,69% em 7 dias contra −1,28%. Estar barato não conserta o evento.
 *
 * ==================================================== ENTÃO PARA QUE SERVE ISTO
 *
 * Pelo mesmo motivo do garimpo: **fila de investigação, não call**. O evento de
 * volume é um fato — alguém movimentou quarenta vezes o normal num dia — e saber
 * em que moeda isso aconteceu, quando, e onde o preço ficou depois é informação
 * de contexto. O que está medido é que COMPRAR por causa disso perde. As duas
 * coisas cabem na mesma tela e é assim que elas ficam.
 *
 * CUSTO ZERO DE REQUISIÇÃO: roda sobre as barras que `lerVida` já carregou.
 */

/** O mínimo que uma barra precisa ter. Serve `Vela` e serve `DerivBar`. */
export interface BarraDeVolume {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  takerBuy: number;
}

/**
 * A janela que define "volume normal", em dias.
 *
 * Noventa porque é o que o gráfico de quem olha chama de normal, e porque a
 * série que `lerVida` entrega tem 180 — dá exatamente noventa de base mais
 * noventa de observação. Mediana e não média: é o dia atípico que se está
 * medindo, e a média contaminada pelo pico anterior encolheria o salto até ele
 * sumir.
 */
export const BASE_DE_VOLUME = 90;

/**
 * Até onde procurar o evento, em dias.
 *
 * Sessenta é a janela em que um evento ainda é o assunto da moeda. Mais atrás e
 * a tela estaria falando de coisa que já terminou; menos e o caso que motivou
 * isto ficaria de fora — o salto do MOVR foi em 27/08, dezessete dias antes de
 * ele entrar na lista.
 */
export const JANELA_DO_EVENTO = 60;

export interface Acumulacao {
  /** Volume do maior dia do evento ÷ mediana dos 90 dias anteriores a ele. */
  salto: number;
  /** Quando foi o dia do salto, em segundos. */
  quando: number;
  /** Dias entre o salto e a última barra. */
  diasDesde: number;
  /** Quanto o preço andou NO dia do salto, do abre ao fecha. Variação de PREÇO. */
  moveuNoDia: number;
  /** Preço de hoje ÷ fechamento do dia do salto − 1. Variação de PREÇO. */
  desdeEntao: number;
  /**
   * Fração agressiva compradora no dia do salto, ou NULO quando não foi medida.
   *
   * Fica sempre perto de 0,5 e está aqui para mostrar isso. Ver o item 3 do
   * cabeçalho antes de tentar ler qualquer coisa neste número.
   *
   * O NULO É O PONTO DELICADO. A Gate não separa o agressor e devolve `takerBuy`
   * ZERADO — e zero aqui significaria "ninguém comprou", que é o oposto de "não
   * sei". O BP, que só negocia lá, saía desta coluna com 0,000 e parecia a moeda
   * mais vendida da lista quando na verdade era a única sem a medição. É a
   * armadilha nº 2 do AGENTS.md, e ela entrou por uma porta nova.
   */
  pressao: number | null;
  /** Volume do último dia ÷ mediana de 90 dias: o volume voltou? */
  agora: number;
  /**
   * Preço ÷ VWAP de 90 dias − 1: caro ou barato contra o que o dinheiro pagou.
   *
   * Medido e sem vantagem (item 4). Serve para dizer se quem negociou no período
   * está ganhando ou perdendo, que é fato, não previsão.
   */
  desconto: number;
}

const mediana = (xs: number[]): number => {
  if (xs.length === 0) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};

/**
 * O maior evento de volume da janela, ou nulo quando não dá para afirmar.
 *
 * NULO É RESPOSTA, e é por isso que ele aparece em vez de um zero: moeda nova
 * não tem noventa dias de base, e devolver salto 1,0x para ela seria dizer
 * "volume normal" sobre uma medição que não aconteceu. É a armadilha nº 2 do
 * AGENTS.md, e ela já custou a concentração de dezesseis moedas da BSC.
 */
export function lerAcumulacao(barras: BarraDeVolume[]): Acumulacao | null {
  // Base mais um dia de evento. Abaixo disso não há o que comparar.
  if (barras.length < BASE_DE_VOLUME + 1) return null;

  const serie = [...barras].sort((a, b) => a.time - b.time);
  const ultima = serie[serie.length - 1];
  if (!(ultima.close > 0)) return null;

  // O evento: o maior salto dentro da janela, cada dia contra a mediana dos 90
  // dias que vieram ANTES DELE — e não contra a mediana de hoje, que já inclui o
  // próprio pico e o achataria.
  let salto = 0;
  let iSalto = -1;
  const comeco = Math.max(BASE_DE_VOLUME, serie.length - JANELA_DO_EVENTO);
  for (let i = comeco; i < serie.length; i++) {
    const base = mediana(serie.slice(i - BASE_DE_VOLUME, i).map((b) => b.volume));
    // `Number.isFinite` e não `> 0`: NaN passa por `<= 0` e por `>= 0`.
    if (!Number.isFinite(base) || base <= 0) continue;
    const razao = serie[i].volume / base;
    if (Number.isFinite(razao) && razao > salto) {
      salto = razao;
      iSalto = i;
    }
  }
  if (iSalto < 0) return null;

  const evento = serie[iSalto];

  // O VWAP dos 90 dias: o preço médio que o dinheiro pagou no período.
  let precoVezesVolume = 0;
  let volumeTotal = 0;
  for (const b of serie.slice(-BASE_DE_VOLUME)) {
    const tipico = (b.high + b.low + b.close) / 3;
    if (!Number.isFinite(tipico) || !Number.isFinite(b.volume)) continue;
    precoVezesVolume += tipico * b.volume;
    volumeTotal += b.volume;
  }
  const vwap = volumeTotal > 0 ? precoVezesVolume / volumeTotal : NaN;

  const baseAgora = mediana(serie.slice(-BASE_DE_VOLUME - 1, -1).map((b) => b.volume));

  return {
    salto,
    quando: evento.time,
    diasDesde: Math.round((ultima.time - evento.time) / 86_400),
    moveuNoDia: evento.open > 0 ? evento.close / evento.open - 1 : 0,
    desdeEntao: evento.close > 0 ? ultima.close / evento.close - 1 : 0,
    // `takerBuy` exatamente zero num dia com volume não existe em praça real:
    // é a Gate dizendo que não separa o agressor. Vira nulo, não vira 0,00.
    pressao:
      evento.volume > 0 && evento.takerBuy > 0 ? evento.takerBuy / evento.volume : null,
    agora: Number.isFinite(baseAgora) && baseAgora > 0 ? ultima.volume / baseAgora : NaN,
    desconto: Number.isFinite(vwap) && vwap > 0 ? ultima.close / vwap - 1 : NaN,
  };
}

/**
 * O corte acima do qual o dia deixa de ser dia movimentado e vira evento.
 *
 * Dez vezes a mediana. Abaixo disso a medição do `aferir-acumulacao` mal separa
 * da referência, e acima ela separa cada vez mais — para baixo.
 */
export const SALTO_NOTAVEL = 10;

/**
 * A frase que acompanha o número na tela.
 *
 * Ela é obrigatória e é o motivo de este módulo existir: o salto sozinho parece
 * descoberta, e a medição diz o contrário. Separar os dois em telas diferentes
 * seria entregar a metade que anima sem a metade que corrige.
 */
export function vereditoDoEvento(a: Acumulacao | null): string | null {
  if (!a || a.salto < SALTO_NOTAVEL) return null;

  const quanto = a.salto >= 40 ? "−10,70%" : a.salto >= 20 ? "−7,85%" : "−5,33%";
  const parado = Math.abs(a.moveuNoDia) <= 0.05;

  return (
    `${a.salto.toFixed(0)}x o volume normal há ${a.diasDesde} dias, com o preço ` +
    `${parado ? "parado no dia" : `andando ${(a.moveuNoDia * 100).toFixed(0)}% no dia`}. ` +
    `Medido sobre 512 perpétuos, comprar nesse dia rende ${quanto} em sete dias ` +
    `contra referência de −1,28%. O evento é fato; a leitura de acumulação não se ` +
    `sustenta na medição.`
  );
}
