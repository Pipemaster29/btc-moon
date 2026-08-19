/**
 * Em que estágio do ciclo a moeda está, e o que falta para o topo.
 *
 * Isto não é um sinal de compra ou venda. É a montagem, em ordem, dos eventos
 * que precederam o topo do LAB e o da BTW — com o tempo de antecedência medido
 * de cada um, para que dê para saber se ainda há aviso pela frente ou se já
 * passou.
 *
 * A ordem importa mais que qualquer indicador isolado, porque ela é MECÂNICA e
 * não estatística:
 *
 *   1. APERTO        o float sai das corretoras e o livro seca. No LAB o saldo
 *                    somado caiu 95% em duas semanas (11,21M → 0,57M) enquanto
 *                    o preço ia de US$ 4,61 para US$ 15,65. Com o livro seco,
 *                    pouco dinheiro move muito preço.
 *   2. ALTA A        a subida final vem de posição alavancada ou de vendidos
 *      CRÉDITO       sendo espremidos, não de compra à vista. Na BTW de 19/08:
 *                    +58% de preço com o open interest parado e US$ 223 mil de
 *                    vendidos liquidados.
 *   3. SAÍDA DA      as contas grandes desmontam comprado com o preço ainda na
 *      BALEIA        máxima. Na BTW foi às 09h UTC, na hora exata do topo:
 *                    posição líquida de 1,33M para 0,87M em sessenta minutos.
 *   4. A OFERTA      o gatilho. Para vender numa corretora é preciso DEPOSITAR
 *      VOLTA         antes, então o saldo volta a subir. No LAB isso foi um
 *                    round trip de um dia: +10,01M em 02/06 (o dia da máxima
 *                    de US$ 24,40) e −10,07M no dia seguinte. Um por cento do
 *                    supply indo e voltando marcou o topo exato.
 *
 * O estágio 4 é o de melhor relação risco/retorno para entrar vendido, e é o
 * único que é obrigatório: os três primeiros descrevem intenção, o quarto é a
 * mecânica da venda acontecendo. Entrar vendido no estágio 2 é apostar contra
 * um squeeze em andamento — que foi como muita gente virou o combustível dele.
 *
 * O que este módulo NÃO faz: dizer o tamanho da posição, o preço de entrada ou
 * onde fica o stop. Moeda manipulada de float baixo sobe 60% em nove horas, e
 * já fez isso duas vezes nesta semana.
 */

import type { RadarSnapshot } from "./radar";
import type { LiveRead } from "./positioning";

export type Estagio = "aperto" | "alta a crédito" | "saída da baleia" | "oferta voltando" | "fora do ciclo";

export interface SinalDeCiclo {
  id: string;
  label: string;
  /** Está acontecendo agora. */
  ativo: boolean;
  /** Quanto de antecedência este sinal deu quando foi medido. */
  antecedencia: string;
  detalhe: string;
}

export interface LeituraDeCiclo {
  estagio: Estagio;
  sinais: SinalDeCiclo[];
  /** Quantos dos quatro estágios estão marcados. */
  marcados: number;
  titulo: string;
  detalhe: string;
}

/**
 * Monta a leitura a partir do que já foi calculado. Não faz chamada de rede:
 * recebe o retrato on-chain e a leitura viva do perpétuo prontos.
 */
export function lerCiclo(
  radar: RadarSnapshot | null,
  live: LiveRead | null,
): LeituraDeCiclo {
  const sinais: SinalDeCiclo[] = [];

  // ------------------------------------------------------- 1. aperto
  // Sem série histórica na página, o que dá para medir é o ESTADO: quanta
  // oferta destravada existe contra a liquidez. Não é o aperto em si — é a
  // condição que faz o aperto funcionar quando ele vier.
  const razaoOferta =
    radar && radar.liquidityUsd > 0 ? (radar.sellable * radar.priceUsd) / radar.liquidityUsd : 0;
  sinais.push({
    id: "aperto",
    label: "Livro fino contra oferta destravada",
    ativo: razaoOferta > 50,
    antecedencia: "dias a semanas",
    detalhe: radar
      ? `A oferta que pode virar venda vale ${razaoOferta.toFixed(0)}x a liquidez à vista. ` +
        `No LAB o saldo somado das corretoras caiu 95% em duas semanas antes do topo — é o ` +
        `aperto que faz pouco dinheiro mover muito preço.`
      : `Sem retrato on-chain para esta moeda.`,
  });

  // -------------------------------------------- 2. a alta veio a crédito
  const altaFragil =
    live?.move?.direction === "alta" &&
    (live.move.kind === "squeeze" || live.move.kind === "alavancagem");
  sinais.push({
    id: "credito",
    label: "Alta movida a crédito, não a compra",
    ativo: Boolean(altaFragil),
    antecedencia: "horas",
    detalhe: live?.move
      ? live.move.note
      : `Sem leitura do perpétuo — a praça não lista o par.`,
  });

  // ------------------------------------------------- 3. saída da baleia
  const saida = live?.whaleExit ?? null;
  sinais.push({
    id: "baleia",
    label: "Contas grandes desmontando comprado no topo",
    ativo: Boolean(saida?.fragile),
    antecedencia: "0 a 48 horas",
    detalhe: saida
      ? `Largaram ${(saida.share * 100).toFixed(1)}% do livro depois de uma alta de ` +
        `${(saida.rally * 100).toFixed(0)}%, com o preço ainda a ${(saida.fromHigh * 100).toFixed(0)}% ` +
        `da máxima. Placar medido: 3 acertos em 6 num horizonte de 24h, 5 em 6 no de 48h.`
      : `As contas grandes não estão saindo de posição comprada agora.`,
  });

  // ------------------------------------------------- 4. a oferta volta
  //
  // Este é o gatilho, e ele é o único que a página sozinha não enxerga: exige
  // a série do saldo das corretoras, que vive no estado do monitor. Fica aqui
  // declarado assim mesmo, porque um checklist com o item mais importante
  // omitido é pior que nenhum checklist.
  const leque = radar
    ? radar.wallets.filter((w) => w.role === "dormant" && w.amount > 0)
    : [];
  const armadas = leque.filter((w) => w.armed);
  sinais.push({
    id: "retorno",
    label: "Oferta voltando para as corretoras",
    ativo: armadas.length > 0,
    antecedencia: "o gatilho — minutos a horas",
    detalhe:
      leque.length > 0
        ? `${leque.length} carteiras paradas com saldo, ${armadas.length} já com gás para mover. ` +
          `Para vender numa corretora é preciso depositar antes; no LAB esse depósito foi de 1% ` +
          `do supply e caiu no dia exato da máxima. O alerta de saldo voltando roda no monitor, ` +
          `que guarda a série — esta página só vê o instante.`
        : `Nenhuma carteira parada com saldo aguardando gás.`,
  });

  // ------------------------------------------------------------ estágio
  const marcados = sinais.filter((s) => s.ativo).length;
  let estagio: Estagio = "fora do ciclo";
  if (sinais[3].ativo) estagio = "oferta voltando";
  else if (sinais[2].ativo) estagio = "saída da baleia";
  else if (sinais[1].ativo) estagio = "alta a crédito";
  else if (sinais[0].ativo) estagio = "aperto";

  const textos: Record<Estagio, [string, string]> = {
    aperto: [
      "Fase de preparação",
      "O livro está fino contra a oferta que existe, que é a condição para o resto acontecer. " +
        "Ainda não há alta a crédito nem baleia saindo. Vender aqui é apostar contra uma subida " +
        "que sequer começou.",
    ],
    "alta a crédito": [
      "Alta frágil em andamento — o pior momento para entrar vendido",
      "A subida é squeeze ou alavancagem, ou seja, vai acabar. Mas entrar vendido no meio dela é " +
        "virar o combustível: a BTW fez +58% em nove horas e o GPS +76% em quatro dias, os dois " +
        "com esta mesma leitura antes de cair.",
    ],
    "saída da baleia": [
      "Dinheiro grande saindo com o preço ainda em cima",
      "O aviso mais adiantado que este sistema tem, e o mais falível: acerta a direção mas costuma " +
        "chegar cedo — no GPS falou três vezes e o preço subiu 10% antes de cair 32%. Serve para " +
        "parar de comprar; para vender, o estágio seguinte é o que confirma.",
    ],
    "oferta voltando": [
      "Gatilho armado — oferta a caminho do livro",
      "Carteira parada com saldo e com gás pode mover a qualquer momento, e o passo seguinte de " +
        "quem vai vender é depositar na corretora. É o estágio de melhor relação risco/retorno " +
        "para estar vendido, porque é o único que é mecanicamente obrigatório.",
    ],
    "fora do ciclo": [
      "Nenhum estágio do ciclo marcado",
      "Nem livro apertado, nem alta a crédito, nem baleia saindo. O padrão que derrubou LAB, BTW e " +
        "GPS não está montado aqui.",
    ],
  };

  return { estagio, sinais, marcados, titulo: textos[estagio][0], detalhe: textos[estagio][1] };
}
