/**
 * OS ROBÔS: carteiras fictícias que não seguem o painel, e operam qualquer
 * perpétuo da Binance com uma regra só — medida antes de ligar.
 *
 * A carteira do `lib/carteira.ts` segue as calls do painel, e o placar dela diz
 * há semanas que essas calls não têm vantagem: cinco semanas entre US$ 1.000 e
 * US$ 1.100, e mais tamanho só piora (escala 1,5x → +1,1%; 2x → −7,1%, na
 * tabela de regimes de 07/10). O pedido foi "o melhor robô possível, qualquer
 * moeda, de olho nas manipuladas". Este arquivo é a resposta, e ela saiu de
 * medição, não de gosto.
 *
 * O QUE FOI MEDIDO, sobre velas de 1 h e o financiamento real de 676 perpétuos
 * USDT — INCLUSIVE os 152 deslistados, sem os quais o vendido pareceria pior e
 * o comprado melhor do que são —, de 01/2024 a 09/2026, com custo por liquidez
 * e o stop testado dentro da vela. Dentro da amostra é até 06/2025; fora, de
 * 07/2025 em diante. Média por trade, sobre o nocional, líquida:
 *
 *   ideia                                    dentro      fora
 *   surfar a vela de +20% em 1 h             −0,2% a −2%  +1% a +2,4%   não passa
 *   vender o pump depois do topo             −1% a −4%    −1% a −5%     perde nas duas
 *   comprar o tombo de −8% em 1 h            +0,2% a +1,4% −0,6% a −1,6% vira
 *   tendência nas 20/60 mais líquidas        −0,3% a −7%  ~0, uma monstra  não passa
 *   financiamento extremo, qualquer lado     ±             ±             não passa
 *   vender a listagem nova 72 h depois       +5,0%        +2,5%         fraco: Sharpe 0,5 fora
 *   VENDER AS QUE MAIS CAÍRAM EM 14 DIAS     +1,5% a +3%  +1% a +2,5%   passa nas duas
 *   COMPRAR AS QUE MAIS SUBIRAM EM 30 DIAS   −1% a −2%    +2% a +8%     só fora
 *
 * Nenhuma perna sozinha é boa carteira. A vendida é quase toda BETA — vender
 * qualquer altcoin líquida com stop largo deu lucro em 2024–2026, porque elas
 * sangraram; as perdedoras somam um a dois pontos por cima disso — e cai 40% a
 * 60% quando as alts sobem juntas. A comprada perde devagar e ganha de uma vez,
 * nas monstras. JUNTAS elas se protegem: quando o mercado de alts despenca, a
 * vendida paga; quando aparece uma MYX, a comprada paga. A regra de 07/10
 * (compra em 30 dias) foi positiva nas duas metades em todas as 26 variações
 * atacadas na primeira bancada — custo 2x e 3x, entrada 1 h e 3 h atrasada,
 * decisão às 11 h ou 17 h, k de 3 e de 10, volume de 5 e de 50 milhões,
 * rastro de 20% e 40%, stops, prazos e janelas.
 *
 * O CUSTO DA VIDA REAL, medido em 08/10 e cobrado desde então: o stop
 * escorrega como no minuto do disparo (`ESCORREGADA_STOP`), a entrada paga o
 * atraso até o primeiro retrato (`CUSTO_ATRASO`), ordem abaixo de US$ 5 não
 * existe (`NOCIONAL_MINIMO`). Só isso levou a regra de 07/10, a 4%, de +600%
 * para +416% na janela inteira (dentro +104% → +89%, fora +226% → +160%): é o
 * que a medição antiga dava de presente.
 *
 * E COM O CUSTO DENTRO, a compra passou a olhar 45 dias e a dobrar a aposta
 * na que anda +40% (`COMPRA_MOMENTO`, com a medição ao lado). Medido no livro
 * inteiro com ESTE motor (`npm run medir-robos`), US$ 1.000 em 08/01/2024 e o
 * patrimônio em 30/09/2026:
 *
 *   tamanho por posição    inteira    dentro    fora     queda máx   Sharpe
 *   2% do patrimônio        +524%       —        —        −26%       2,09
 *   3%  ← "Momento"       +1.254%     +73%     +638%     −37%       2,09
 *   4%                    +2.606%       —        —        −46%       2,09
 *   4,5% ← "Momento turbo" +3.675%    +115%   +1.510%    −51%       2,09
 *   6%                    +8.109%       —        —        −65%       2,10
 *   a regra de 07/10, 4%    +416%      +89%     +160%     −36%       1,36
 *
 * O Sharpe não muda com o tamanho: tamanho escolhe o RISCO, não a vantagem. O
 * Momento e o turbo ficaram perto da queda máxima que tinham antes (−37% contra
 * −36%; −51% contra −48%), e a 4,5% o caixa já recusa 10 entradas (198 a 6%).
 *
 * NA MESMA QUEDA MÁXIMA, a regra nova faz +1.254% contra +416%, e sem as cinco
 * melhores moedas o fora da amostra vai de −38% para +71%. MAS O DENTRO DA
 * AMOSTRA VAI DE +89% PARA +73%: no mesmo risco, antes de 07/2025 a regra nova
 * rende menos. A melhora é das altas que passaram a durar meses — se elas
 * voltarem a durar semanas, a de 30 dias volta a ser a melhor das duas.
 *
 * O QUE ISSO NÃO É, e é a ressalva que manda: o lucro vem de POUCAS MOEDAS.
 * Tirando as cinco que mais deram ao Momento (RAVE, TUT, BEAT, LAB, LSK), a
 * janela inteira cai de +1.254% para +242% e o fora, de +638% para +71%. A
 * pirâmide entrou em 344 de 1.066 compras, e foram essas que fizeram o lucro da
 * perna: US$ 36 mil, contra US$ 23 mil perdidos nas outras 722. É o formato de
 * qualquer seguidor de tendência — perde pouco quase sempre e ganha muito de
 * vez em quando —, e a tese só continua de pé enquanto continuarem aparecendo
 * monstras. Dos US$ 13.516 que a perna comprada fez, US$ 8.053 vieram de moedas
 * que hoje estão no painel de manipuladas: é a intuição de que "as manipuladas
 * têm mais potencial", medida — e é também o risco concentrado.
 *
 * O "Caça-monstra" é essa intuição sozinha: só a perna comprada, mais
 * concentrada e aceitando moeda menor. Fora da amostra, +189%; dentro, −3%,
 * com queda de −37%; sem as suas cinco melhores, +11% fora e −23% dentro. Ele
 * existe na arena para a pergunta "e se eu só comprasse as manipuladas que
 * disparam?" ter resposta na tela, ao vivo.
 *
 * Os números citados na perna vendida e no universo, abaixo, são da PRIMEIRA
 * bancada, com posições de 0,7% do patrimônio e sem o custo da vida real: o
 * que conta neles é a ordem entre as variações, não o nível. Os da perna
 * comprada são da bancada realista, a 4%.
 *
 * ESTE ARQUIVO NÃO IMPORTA NADA DE `node:` — a página o importa para desenhar
 * e remarcar, como `lib/carteira.ts`.
 */

// ------------------------------------------------------------------ as regras

export type LadoRobo = "long" | "short";

export type MotivoRobo = "stop" | "rastro" | "prazo" | "liquidada" | "sumiu";

/** Uma perna do robô: de que lado, como escolhe e como sai. */
export interface Perna {
  lado: LadoRobo;
  /**
   * A janela do ranking, em DIAS: compra as que mais subiram, ou vende as que
   * mais caíram, nesta janela.
   */
  janelaDias: number;
  /** Quantas moedas entram por dia — as k primeiras do ranking. */
  k: number;
  /** Stop inicial, em variação de PREÇO contra a entrada. */
  stop: number;
  /**
   * O rastro: a ordem de stop acompanha o melhor preço desde a entrada, a esta
   * distância (variação de PREÇO). Nulo: só o stop inicial.
   */
  rastro: number | null;
  /** Prazo máximo, em HORAS. */
  prazoH: number;
  /**
   * Alavancagem da margem isolada. Não muda o tamanho — quem manda nele é o
   * nocional (`RegrasRobo.tamanho`) —, muda quanto de margem sai do caixa e
   * onde fica a liquidação, que precisa estar além do stop: a 3x ela fica a
   * −32,8% de preço (stop de 25%); a 2x, a +49,5% (stop de 45%).
   */
  alavancagem: number;
  /**
   * A PIRÂMIDE: quando o preço anda `niveis[i]` a favor desde a entrada, a
   * posição ganha uma parcela de `tamanho` × o tamanho normal, no mesmo lado.
   * A parcela vira parte da MESMA posição — preço médio, margem e liquidação
   * refeitos, como numa conta de verdade —, e sai junto, pelo mesmo stop.
   * Ausente: sem pirâmide.
   */
  piramide?: { niveis: number[]; tamanho: number };
}

export interface RegrasRobo {
  /**
   * O NOCIONAL de cada posição, em fração do patrimônio na hora da entrada.
   * Fração do patrimônio e não da margem: a 4%, uma conta de US$ 1.000 abre
   * posições de US$ 40, com US$ 13 a US$ 20 de margem conforme a perna.
   */
  tamanho: number;
  /** Volume mínimo do perpétuo no dia anterior, em dólar. */
  volumeMinimo: number;
  /** Quantos dias de perpétuo a moeda precisa ter para entrar no ranking. */
  idadeMinimaDias: number;
  pernas: Perna[];
}

export interface Robo {
  id: string;
  nome: string;
  /** Uma frase, para a tela. */
  descricao: string;
  regras: RegrasRobo;
}

/** Com quanto cada robô começa — o mesmo da carteira, para as curvas se lerem juntas. */
export const CAPITAL_ROBO = 1000;

/**
 * Taxa de taker da Binance, por lado, sobre o nocional. A escorregada vem por
 * cima, pela liquidez (`custoPorLado`).
 */
export const TAXA = 0.0005;

/** Margem de manutenção, como a da carteira: abaixo disto a corretora liquida. */
export const MANUTENCAO = 0.005;

/**
 * QUANTO O STOP ESCORREGA, em fração do resto da vela de 1 h além do nível.
 *
 * Medido em VELAS DE 1 MINUTO do Data Vision, sobre 500 saídas sorteadas que
 * a vela de 1 h dava "no nível": em NENHUMA o preço pulou o nível de um minuto
 * para o outro — o "no nível" está certo nisso. O que a vela de 1 h não vê é o
 * minuto do disparo: dentro dele o preço passa do nível em média 1,13%
 * (mediana 0,52%, p90 2,6%, p99 9,3%), e uma ordem a mercado sai em algum
 * ponto desse caminho. Cobrar um quarto dele dá ~0,28% por saída, e o resto
 * médio da vela de 1 h além do nível era 4,53%: um quarto de 1,13 dividido
 * por 4,53 é 0,06. Proporcional à vela de propósito — a escorregada de uma
 * queda de 40% numa hora não é a de uma vela que encostou no stop.
 *
 * Vale também para a parcela da pirâmide, do outro lado: ordem de compra
 * disparada numa alta também sai acima do gatilho.
 */
export const ESCORREGADA_STOP = 0.06;

/**
 * O custo do ATRASO DA ENTRADA, em fração do nocional — só na MEDIÇÃO.
 *
 * A medição entra na abertura da meia-noite; o ao vivo, no primeiro retrato
 * depois dela. Medido em velas de 1 minuto sobre 500 entradas do livro: entrar
 * 1 a 5 minutos depois custa +0,06%; 15 minutos, +0,12%; 30, +0,03% (mediana
 * +0,18%). E pareado trade a trade, entrar 1 h depois NÃO piora em média
 * (+0,14%). Os 0,1% cobrados aqui são o medido aos 15 minutos. No ao vivo não
 * se cobra: lá o atraso é de verdade, e o preço já é o de quando o retrato roda.
 */
export const CUSTO_ATRASO = 0.001;

/**
 * O menor nocional que a Binance aceita numa ordem de perpétuo USDT, em
 * dólares (US$ 5 na maioria; BTC e ETH pedem mais, e nunca são escolhidos com
 * esta régua de momento). Abaixo dele a ordem é recusada — aqui também.
 */
export const NOCIONAL_MINIMO = 5;

/**
 * A perna comprada ATÉ 08/10: as 5 que mais subiram em 30 dias, sem pirâmide.
 * Fica exportada para a medição imprimir o antes ao lado do depois.
 *
 * TRINTA DIAS E NÃO SETE: com 7 dias o livro caía de Sharpe 1,59 para
 * 0,68–0,71 na bancada. RASTRO DE 30%: com 20% o livro inteiro caía para +17%
 * (Sharpe 0,68), porque as monstras recuam 20% várias vezes no caminho e o
 * rastro curto as vende no primeiro tranco.
 */
const COMPRA_ANTERIOR: Perna = {
  lado: "long",
  janelaDias: 30,
  k: 5,
  stop: 0.25,
  rastro: 0.3,
  prazoH: 30 * 24,
  alavancagem: 3,
};

/**
 * A perna comprada desde 08/10: as 5 que mais subiram em 45 DIAS, com UMA
 * parcela a mais quando a posição anda +40%.
 *
 * Medido na bancada com o modelo REALISTA (stop escorregando, entrada com o
 * custo do atraso), a 4% por posição, janela inteira · dentro · fora, e "sem as
 * 5 melhores" de fora — o número que reprovava o livro antigo:
 *
 *                                inteira    dentro     fora    sem as 5, fora
 *   30 d, sem pirâmide (antiga)   +415%      +87%      +160%       −35%
 *   45 d                         +1.128%     +84%      +511%      +102%
 *   45 d + pirâmide em +40%      +2.692%    +105%    +1.147%      +139%
 *
 * A JANELA É PLATÔ, NÃO PICO: de 35 a 55 dias tudo ganha de 30 fora da amostra
 * (+249% a +511%) e o "sem as 5, fora" fica positivo em todas (+21% a +102%);
 * 25 dias perde fora (+61%) e ganha dentro (+163%). A leitura honesta: dentro
 * da amostra 45 dias EMPATA com 30; a melhora é toda de 07/2025 em diante,
 * onde as altas destas moedas passaram a durar meses (a MYX, a RAVE).
 *
 * A PIRÂMIDE TAMBÉM: parcela em +30%, +40% ou +50% dá dentro +104%, +105% e
 * +102% e fora +1.466%, +1.147% e +1.043%; meia parcela, +92% e +787%. É o
 * dinheiro indo para onde a tendência está provada — e é ela, não a janela,
 * que melhora o dentro da amostra. O custo é a queda máxima: −37% → −47% no
 * mesmo tamanho, e é por isso que o Momento passou de 4% para 3% (abaixo).
 *
 * ATACADA com mais custo do que o medido, e positiva nas três janelas e no
 * "sem as 5, fora" em todos:
 *
 *                                inteira    dentro     fora    sem as 5, fora
 *   entrada a 0,4% (4x o medido) +1.949%     +80%      +945%      +102%
 *   escorregada do stop dobrada  +1.997%     +96%      +883%       +96%
 *   entrada 1 h atrasada         +2.046%     +97%      +916%      +112%
 *
 * O que foi medido junto e NÃO entrou: rastro de 40% em cima disto (fora
 * melhora, dentro piora: +105% → +69%); o stop pela marcação em vez do último
 * negócio (fora dobra, dentro piora: +105% → +95% — e o stop da Binance é pelo
 * último negócio, salvo pedido); financiamento negativo como filtro de compra
 * (perde nas duas: −0,6% dentro); postos de 30 e 60 dias somados; prazo de 60
 * ou 90 dias (dentro piora); duas ou três parcelas (+30/+60%, +30/+60/+100%),
 * que na janela de 30 dias não melhoram o dentro sobre uma só (+107% e +109%
 * contra +110%) e aumentam a queda máxima (−45% e −49% contra −42%).
 */
const COMPRA_MOMENTO: Perna = {
  ...COMPRA_ANTERIOR,
  janelaDias: 45,
  piramide: { niveis: [0.4], tamanho: 1 },
};

/**
 * A perna vendida: as 5 que mais caíram em 14 dias, por 14 dias.
 *
 * Perdedora continua perdendo nestas moedas, e é o mesmo achado do resto do
 * projeto por outro lado: "comprar a derretida piora quanto mais fundo a queda"
 * (`npm run aferir-garimpo`). Por decil do retorno de 14 dias, vendendo e
 * segurando 14 dias: o decil que mais caiu rende +3,1% dentro e +1,4% fora; o
 * do meio, +0,2% e +0,8%; o que mais subiu, +0,1% e −2,2% — esse é o squeeze.
 *
 * SEM RASTRO: com rastro de 25% o livro piora (+42,6% contra +52,8%). Stop de
 * 45% e não 50% porque a 2x a liquidação fica em +49,5%, e o stop precisa vir
 * antes dela; 30% a 50% são todos positivos nas duas metades.
 */
const VENDA_MOMENTO: Perna = {
  lado: "short",
  janelaDias: 14,
  k: 5,
  stop: 0.45,
  rastro: null,
  prazoH: 14 * 24,
  alavancagem: 2,
};

/**
 * Volume mínimo de US$ 20 milhões no dia: é onde o custo por lado fica entre
 * 0,10% e 0,15% e a posição de dezenas de dólares não move o livro. Com 5
 * milhões o livro rende MAIS (+64,5% contra +52,8%) e com 50 milhões, menos
 * (+45,9%) — o corte não está no ponto ótimo de propósito: moeda de US$ 5
 * milhões por dia é onde a escorregada real mais se afasta da estimada.
 */
const UNIVERSO = { volumeMinimo: 20e6, idadeMinimaDias: 14 };

export const ROBOS: Robo[] = [
  {
    id: "momento",
    nome: "Momento",
    descricao:
      "Compra as 5 que mais subiram em 45 dias (e dobra a aposta nas que sobem +40%) e vende as 5 que mais caíram em 14, todo dia, em qualquer perpétuo com US$ 20 mi de volume.",
    regras: { tamanho: 0.03, ...UNIVERSO, pernas: [COMPRA_MOMENTO, VENDA_MOMENTO] },
  },
  {
    id: "turbo",
    nome: "Momento turbo",
    descricao: "O mesmo livro com 1,5x o tamanho — a resposta medida para \"e se arriscasse mais?\".",
    regras: { tamanho: 0.045, ...UNIVERSO, pernas: [COMPRA_MOMENTO, VENDA_MOMENTO] },
  },
  {
    id: "caca-monstra",
    nome: "Caça-monstra",
    descricao:
      "Só compra: as 3 que mais subiram em 30 dias, aceitando moeda de US$ 5 mi de volume, e deixa correr no rastro de 30%.",
    // A janela de 45 dias e a pirâmide foram medidas aqui também e NÃO
    // entraram: fora da amostra melhoram (+188% → +554%), dentro pioram
    // (−4% → −17%). O Caça-monstra é a tese pura, e ela continua sendo isso.
    regras: {
      tamanho: 0.04,
      volumeMinimo: 5e6,
      idadeMinimaDias: 14,
      pernas: [{ ...COMPRA_ANTERIOR, k: 3 }],
    },
  },
];

/** O Momento como foi publicado até 08/10, para a medição ler o antes ao lado do depois. */
export const MOMENTO_ANTERIOR: Robo = {
  id: "momento-anterior",
  nome: "Momento até 08/10",
  descricao: "30 dias, sem pirâmide, 4% por posição.",
  regras: { tamanho: 0.04, ...UNIVERSO, pernas: [COMPRA_ANTERIOR, VENDA_MOMENTO] },
};

// ------------------------------------------------------------------ o estado

export interface PosicaoRobo {
  symbol: string;
  lado: LadoRobo;
  /** Quando entrou, em milissegundos. */
  abertaEm: number;
  precoEntrada: number;
  /** Dólares controlados. */
  nocional: number;
  /** Dólares que saíram do caixa (nocional ÷ alavancagem). */
  margem: number;
  /** Custo por lado, em fração do nocional, fixado na entrada pela liquidez de então. */
  custoLado: number;
  /**
   * Preço do stop fixo: o inicial, ou o que a parcela da pirâmide subiu para
   * dentro da liquidação nova (`acrescentar`). O rastro anda por cima dele.
   */
  stop: number;
  /** Distância do rastro, em variação de preço; nulo sem rastro. */
  rastro: number | null;
  /** Preço de liquidação nominal da margem isolada. */
  liquidacao: number;
  /**
   * O melhor preço desde a entrada ATÉ A VELA ANTERIOR — máxima para comprado,
   * mínima para vendido. O rastro de uma vela é o que estava parado quando ela
   * abriu: subir o nível com a máxima da própria vela estoparia a posição por
   * um recuo que pode ter vindo ANTES da máxima.
   */
  melhor: number;
  /** Quando o prazo vence, em milissegundos. */
  prazoAte: number;
  /** Financiamento acumulado em DÓLARES; positivo é custo. */
  funding: number;
  /** Abertura (ms) da última vela de 1 h já percorrida; antes da entrada, nenhuma. */
  ultimaVela: number;
  /** Até quando o financiamento já foi cobrado, em milissegundos. */
  fundingAte: number;
  /** Último preço visto. */
  precoAtual: number;
  /** A moeda está no painel de manipuladas (lista ou em vista) na hora da entrada. */
  manipulada?: boolean;
  /**
   * As parcelas da pirâmide que ainda podem entrar: o preço que dispara cada uma
   * e o tamanho dela em múltiplos do tamanho normal. Ausente: sem pirâmide (e
   * toda posição aberta antes de 08/10).
   */
  piramide?: { precos: number[]; tamanho: number };
  /** Quantas parcelas a posição tem; ausente é uma. */
  parcelas?: number;
  /**
   * Custo de entrada além da taxa e da escorregada, em DÓLARES. Na medição é o
   * do atraso (`CUSTO_ATRASO`); no ao vivo, zero.
   */
  custoExtra?: number;
}

export interface TradeRobo {
  symbol: string;
  lado: LadoRobo;
  abertaEm: number;
  fechadaEm: number;
  precoEntrada: number;
  precoSaida: number;
  nocional: number;
  margem: number;
  /** Resultado em dólares, com custo e financiamento dentro. */
  resultado: number;
  /** Financiamento pago em dólares (negativo: recebido). */
  funding: number;
  motivo: MotivoRobo;
  manipulada?: boolean;
  /** Quantas parcelas a posição chegou a ter, quando foi mais de uma. */
  parcelas?: number;
}

export interface EstadoRobo {
  id: string;
  nome: string;
  descricao: string;
  regras: RegrasRobo;
  comecouEm: number;
  atualizadoEm: number;
  /** Dinheiro fora das posições (o que não é margem). */
  caixa: number;
  /** Caixa + margem + resultado aberto. */
  patrimonio: number;
  pico: number;
  /** Maior queda do pico, em fração; ≤ 0. */
  quedaMaxima: number;
  abertas: PosicaoRobo[];
  /** As encerradas, as mais recentes primeiro. */
  fechadas: TradeRobo[];
  /** Um ponto por hora no máximo. */
  curva: { t: number; patrimonio: number }[];
  /** O dia (00:00 UTC, em ms) da última seleção feita. */
  ultimaDecisao: number | null;
  /**
   * Dias em que nenhum retrato rodou e a seleção não aconteceu. As SAÍDAS
   * desses dias acontecem do mesmo jeito — o caminho de velas é percorrido
   * depois —, mas abrir no passado seria escolher olhando o que veio depois.
   */
  diasPerdidos: number;
  /** Seleções que não viraram posição por falta de caixa ou de preço. */
  recusadas: number;
}

// ------------------------------------------------------------------ o mercado

/** Uma vela de 1 h do perpétuo. */
export interface VelaRobo {
  /** Abertura, em milissegundos. */
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

/** Uma cobrança de financiamento: o instante e a taxa POR PERÍODO, como a Binance publica. */
export interface Cobranca {
  t: number;
  taxa: number;
}

/** O que o ranking de um dia precisa saber de cada moeda. */
export interface LinhaRanking {
  symbol: string;
  /** Retorno em cada janela (dias → fração); nulo sem série que cubra a janela. */
  retorno: Record<number, number | null>;
  /** Volume em dólar do dia anterior à decisão. */
  volume: number;
  /** Dias de perpétuo até a decisão; nulo é "mais velha que a série". */
  idadeDias: number | null;
}

export const HORA = 3_600_000;
export const DIA = 24 * HORA;

/**
 * Taxa mais escorregada, por lado, sobre o nocional — a mesma régua da
 * pesquisa: o livro mais raso escorrega mais. Com o volume mínimo de US$ 20
 * milhões, o custo fica entre 0,10% e 0,15% por lado.
 */
export function custoPorLado(volume: number): number {
  const esc = volume >= 50e6 ? 0.0005 : volume >= 10e6 ? 0.001 : volume >= 3e6 ? 0.002 : 0.004;
  return TAXA + esc;
}

// ------------------------------------------------------------------ o motor

/** Variação de preço a favor da posição. */
function aFavor(p: { lado: LadoRobo; precoEntrada: number }, preco: number): number {
  const v = preco / p.precoEntrada - 1;
  return p.lado === "long" ? v : -v;
}

/**
 * Quanto a posição vale AGORA, em dólares: margem mais o resultado a este
 * preço, menos o custo de entrada e o financiamento pagos. Nunca abaixo de
 * zero — a margem isolada é o teto da perda, e marcar negativo inventaria uma
 * dívida que a corretora não cobra.
 */
export function valorDaPosicao(p: PosicaoRobo, preco: number): number {
  const v = p.margem + p.nocional * aFavor(p, preco) - p.nocional * p.custoLado - p.funding - (p.custoExtra ?? 0);
  return Number.isFinite(v) ? Math.max(0, v) : 0;
}

/** O nível do stop que vale para a vela que está para ser percorrida. */
function nivelDoStop(p: PosicaoRobo): number {
  if (p.rastro === null) return p.stop;
  const rastro = p.lado === "long" ? p.melhor * (1 - p.rastro) : p.melhor * (1 + p.rastro);
  return p.lado === "long" ? Math.max(p.stop, rastro) : Math.min(p.stop, rastro);
}

export interface Saida {
  preco: number;
  quando: number;
  motivo: MotivoRobo;
}

/**
 * Cobra o financiamento das cobranças em (`fundingAte`, `ate`].
 *
 * O financiamento corre com o relógio, não com a vela: quem está posicionado no
 * instante da cobrança paga (ou recebe), e a cobrança do instante exato da
 * entrada não é dela. Taxa positiva, o comprado paga; negativa, o vendido —
 * e nas manipuladas é quase sempre o vendido: das 2,1 milhões de cobranças de
 * 2024 a 2026, 6.906 foram de −0,5% ou menos por período e 127 de +0,5% ou mais.
 * A LAB de 05 a 07/2026 pagou 132% do nocional a quem estava comprado.
 */
export function cobrar(p: PosicaoRobo, cobrancas: readonly Cobranca[], ate: number): void {
  for (const c of cobrancas) {
    if (c.t <= p.fundingAte || c.t > ate) continue;
    if (!Number.isFinite(c.taxa)) continue;
    p.funding += p.nocional * c.taxa * (p.lado === "long" ? 1 : -1);
  }
  if (ate > p.fundingAte) p.fundingAte = ate;
}

/**
 * Percorre as velas FECHADAS depois da última percorrida e devolve a saída, se
 * houve. É a mesma ordem da pesquisa, vela a vela:
 *
 *   1. o financiamento até a abertura dela — quem estava posicionado paga;
 *   2. a liquidação, só se a vela ABRIU além dela ou se ela vem antes do stop;
 *   3. o stop (ou o rastro), preenchido no nível — ou na abertura, se a vela
 *      saltou por cima dele: ordem parada não é servida num preço que não
 *      existiu;
 *   4. o prazo, no fechamento da vela em que ele vence;
 *   5. e só então o melhor preço anda, para valer da vela SEGUINTE em diante.
 *
 * Vela que abriu ANTES da entrada não entra: ela contém os minutos anteriores à
 * posição, e uma mínima de antes da entrada estoparia por um movimento que a
 * posição não viveu. Vela sem preço (moeda que parou de negociar) fecha a
 * posição no último preço visto, como "sumiu".
 */
export function percorrer(
  p: PosicaoRobo,
  velas: readonly VelaRobo[],
  cobrancas: readonly Cobranca[],
  /** O robô dono da posição: sem ele a pirâmide não tem de onde tirar a margem, e não entra. */
  e?: EstadoRobo,
): Saida | null {
  const comprado = p.lado === "long";
  for (const v of velas) {
    if (v.t < p.abertaEm || v.t <= p.ultimaVela) continue;
    if (!(v.o > 0 && v.h > 0 && v.l > 0 && v.c > 0)) {
      return { preco: p.precoAtual, quando: v.t, motivo: "sumiu" };
    }
    // 1. O financiamento da abertura desta vela é devido por quem estava
    //    posicionado nela — inclusive se for a vela da saída.
    cobrar(p, cobrancas, v.t);

    // 1b. A PIRÂMIDE, ANTES DO STOP. A vela não diz se a alta que dispara a
    //     parcela veio antes ou depois da queda que estopa; supor que veio
    //     antes é o pior caso — a parcela entra no alto e sai no stop.
    if (e && p.piramide) {
      while (p.piramide.precos.length > 0) {
        const gatilho = p.piramide.precos[0];
        if (comprado ? v.h < gatilho : v.l > gatilho) break;
        p.piramide.precos.shift();
        acrescentar(e, p, v, gatilho);
      }
    }

    const ns = nivelDoStop(p);
    const liq = p.liquidacao;
    // 2. Liquidação e stop estão do mesmo lado, e saindo da abertura o preço
    //    cruza primeiro o mais perto. A corretora só chega antes quando a vela
    //    abre além dela, ou quando ela está aquém do stop.
    const liqAntes = comprado ? liq >= ns : liq <= ns;
    const abriuAlem = comprado ? v.o <= liq : v.o >= liq;
    const tocaLiq = comprado ? v.l <= liq : v.h >= liq;
    if (tocaLiq && (liqAntes || abriuAlem)) {
      p.ultimaVela = v.t;
      return { preco: liq, quando: v.t + HORA, motivo: "liquidada" };
    }
    // 3. O stop, no nível ou na abertura se a vela saltou por cima.
    const tocaStop = comprado ? v.l <= ns : v.h >= ns;
    if (tocaStop) {
      // No nível, ou na abertura se a vela saltou por cima dele — e então a
      // escorregada medida no minuto do disparo (`ESCORREGADA_STOP`).
      const nivel = comprado ? Math.min(v.o, ns) : Math.max(v.o, ns);
      const preco = comprado ? nivel - ESCORREGADA_STOP * (nivel - v.l) : nivel + ESCORREGADA_STOP * (v.h - nivel);
      const doRastro = comprado ? ns > p.stop : ns < p.stop;
      p.ultimaVela = v.t;
      return { preco, quando: v.t + HORA, motivo: doRastro ? "rastro" : "stop" };
    }
    p.ultimaVela = v.t;
    p.precoAtual = v.c;
    // 4. O prazo vence no fechamento desta vela?
    if (v.t + HORA >= p.prazoAte) {
      return { preco: v.c, quando: v.t + HORA, motivo: "prazo" };
    }
    // 5. O melhor preço anda DEPOIS dos testes.
    p.melhor = comprado ? Math.max(p.melhor, v.h) : Math.min(p.melhor, v.l);
  }
  return null;
}

/**
 * A parcela da pirâmide entra na MESMA posição, como numa conta de verdade: o
 * preço de entrada vira o médio PONDERADO PELA QUANTIDADE (é ele que faz
 * nocional × variação dar o resultado exato das duas parcelas), a margem
 * soma, e a liquidação é refeita sobre o preço médio. O stop, o rastro e o
 * prazo continuam os da primeira parcela: as duas saem juntas.
 *
 * O preço é o do gatilho, ou a abertura se a vela já abriu além dele, mais a
 * mesma escorregada do stop — ordem a mercado disparada numa alta sai acima.
 * Sem caixa para a margem, ou abaixo do nocional mínimo, a parcela é recusada
 * e contada, e não volta: o gatilho foi consumido.
 *
 * A liquidação refeita SOBE com o preço médio, e passa o stop fixo: entrada em
 * 100 e parcela em 140 dão médio ~117 e liquidação ~78, acima do stop de 75.
 * Da vela seguinte em diante o rastro já está em 98 (30% abaixo da máxima que
 * disparou a parcela) e protege; o buraco é a própria vela da parcela, quando
 * ela salta o gatilho e despenca na mesma hora — a corretora liquidaria a
 * posição inteira antes do stop. Quem acrescenta numa conta de verdade move o
 * stop junto, e o motor faz o mesmo: ele sobe para 1% dentro da nova
 * liquidação. Perder ~97% da margem no lugar de 100% é quase a mesma coisa; o
 * que importa é o stop guardado nunca estar além da liquidação, que é o que a
 * auditoria confere em toda posição aberta.
 */
function acrescentar(e: EstadoRobo, p: PosicaoRobo, v: VelaRobo, gatilho: number): void {
  const comprado = p.lado === "long";
  const base = comprado ? Math.max(v.o, gatilho) : Math.min(v.o, gatilho);
  const preco = comprado ? base + ESCORREGADA_STOP * (v.h - base) : base - ESCORREGADA_STOP * (base - v.l);
  const alavancagem = p.nocional / p.margem;
  const nocional = e.regras.tamanho * patrimonioA(e) * (p.piramide?.tamanho ?? 1);
  const margem = nocional / alavancagem;
  if (!(nocional >= NOCIONAL_MINIMO) || !(margem <= e.caixa) || !(preco > 0)) {
    e.recusadas++;
    return;
  }
  e.caixa -= margem;
  const quantidade = p.nocional / p.precoEntrada + nocional / preco;
  p.nocional += nocional;
  p.margem += margem;
  p.precoEntrada = p.nocional / quantidade;
  const distLiq = 1 / alavancagem - MANUTENCAO;
  p.liquidacao = comprado ? p.precoEntrada * (1 - distLiq) : p.precoEntrada * (1 + distLiq);
  p.stop = comprado ? Math.max(p.stop, p.liquidacao * 1.01) : Math.min(p.stop, p.liquidacao * 0.99);
  p.parcelas = (p.parcelas ?? 1) + 1;
}

/**
 * Fecha a posição e devolve o trade. Liquidada perde a margem inteira, e só
 * ela; nas outras saídas o resultado é a variação de preço sobre o nocional,
 * menos o custo dos dois lados e o financiamento — e também nunca passa da
 * margem, que é o teto da perda em margem isolada.
 */
export function fechar(e: EstadoRobo, p: PosicaoRobo, s: Saida): TradeRobo {
  const bruto = p.nocional * aFavor(p, s.preco) - 2 * p.nocional * p.custoLado - p.funding - (p.custoExtra ?? 0);
  const resultado = s.motivo === "liquidada" ? -p.margem : Math.max(-p.margem, bruto);
  e.caixa += p.margem + resultado;
  e.abertas = e.abertas.filter((x) => x !== p);
  const t: TradeRobo = {
    symbol: p.symbol,
    lado: p.lado,
    abertaEm: p.abertaEm,
    fechadaEm: s.quando,
    precoEntrada: p.precoEntrada,
    precoSaida: s.preco,
    nocional: p.nocional,
    margem: p.margem,
    resultado,
    funding: p.funding,
    motivo: s.motivo,
    ...(p.manipulada ? { manipulada: true } : {}),
    ...(p.parcelas && p.parcelas > 1 ? { parcelas: p.parcelas } : {}),
  };
  e.fechadas.unshift(t);
  return t;
}

/** Patrimônio a estes preços (o último visto de cada posição quando faltar). */
export function patrimonioA(e: EstadoRobo, precos?: ReadonlyMap<string, number>): number {
  let v = e.caixa;
  for (const p of e.abertas) {
    const preco = precos?.get(p.symbol);
    v += valorDaPosicao(p, preco !== undefined && preco > 0 ? preco : p.precoAtual);
  }
  return v;
}

/**
 * Registra o patrimônio do instante: pico, queda máxima e um ponto por hora na
 * curva. Chamado depois das saídas e das entradas, quando a conta está inteira.
 */
export function marcar(e: EstadoRobo, quando: number, precos?: ReadonlyMap<string, number>): void {
  const pat = patrimonioA(e, precos);
  if (!Number.isFinite(pat)) return;
  e.patrimonio = pat;
  e.atualizadoEm = Math.max(e.atualizadoEm, quando);
  if (pat > e.pico) e.pico = pat;
  if (e.pico > 0) e.quedaMaxima = Math.min(e.quedaMaxima, pat / e.pico - 1);
  const ultimo = e.curva[e.curva.length - 1];
  if (!ultimo || quando - ultimo.t >= HORA) e.curva.push({ t: quando, patrimonio: pat });
  else ultimo.patrimonio = pat;
}

/**
 * As k moedas da perna num dia: as que mais subiram (comprado) ou mais caíram
 * (vendido) na janela, entre as que passam no volume e na idade.
 *
 * Com menos de 4k moedas elegíveis o dia não seleciona nada — ranking de
 * poucas é sorteio, e a pesquisa nunca operou assim.
 */
export function selecionar(regras: RegrasRobo, perna: Perna, linhas: readonly LinhaRanking[]): LinhaRanking[] {
  const elegiveis = linhas.filter((l) => {
    const r = l.retorno[perna.janelaDias];
    return (
      r !== null &&
      r !== undefined &&
      Number.isFinite(r) &&
      Number.isFinite(l.volume) &&
      l.volume >= regras.volumeMinimo &&
      (l.idadeDias === null || l.idadeDias >= regras.idadeMinimaDias)
    );
  });
  if (elegiveis.length < 4 * perna.k) return [];
  const ordem = [...elegiveis].sort(
    (a, b) => (a.retorno[perna.janelaDias] as number) - (b.retorno[perna.janelaDias] as number),
  );
  return perna.lado === "long" ? ordem.slice(-perna.k).reverse() : ordem.slice(0, perna.k);
}

/**
 * Abre a posição, se couber. O tamanho é `tamanho` × patrimônio de AGORA, e a
 * margem sai do caixa — sem caixa para ela, a seleção é recusada e contada.
 * Moeda já aberta não abre de novo: a mesma moeda aparece no ranking por dias
 * seguidos, e cada dia não é uma aposta nova.
 */
export function abrir(
  e: EstadoRobo,
  perna: Perna,
  symbol: string,
  preco: number,
  quando: number,
  volume: number,
  manipulada: boolean,
  /** Custo de entrada a mais, em fração do nocional: `CUSTO_ATRASO` na medição, zero no ao vivo. */
  custoExtra = 0,
): PosicaoRobo | null {
  if (e.abertas.some((p) => p.symbol === symbol)) return null;
  if (!(preco > 0) || !Number.isFinite(preco)) {
    e.recusadas++;
    return null;
  }
  const pat = patrimonioA(e);
  const nocional = e.regras.tamanho * pat;
  const margem = nocional / perna.alavancagem;
  if (!(nocional >= NOCIONAL_MINIMO) || margem > e.caixa) {
    e.recusadas++;
    return null;
  }
  const comprado = perna.lado === "long";
  const distLiq = 1 / perna.alavancagem - MANUTENCAO;
  const p: PosicaoRobo = {
    symbol,
    lado: perna.lado,
    abertaEm: quando,
    precoEntrada: preco,
    nocional,
    margem,
    custoLado: custoPorLado(volume),
    stop: comprado ? preco * (1 - perna.stop) : preco * (1 + perna.stop),
    rastro: perna.rastro,
    liquidacao: comprado ? preco * (1 - distLiq) : preco * (1 + distLiq),
    melhor: preco,
    prazoAte: quando + perna.prazoH * HORA,
    funding: 0,
    ultimaVela: 0,
    fundingAte: quando,
    precoAtual: preco,
    ...(manipulada ? { manipulada: true } : {}),
    ...(perna.piramide
      ? {
          piramide: {
            precos: perna.piramide.niveis.map((n) => (comprado ? preco * (1 + n) : preco * (1 - n))),
            tamanho: perna.piramide.tamanho,
          },
        }
      : {}),
    ...(custoExtra > 0 ? { custoExtra: custoExtra * nocional } : {}),
  };
  e.caixa -= margem;
  e.abertas.push(p);
  return p;
}

/**
 * A decisão do dia: cada perna escolhe as suas no ranking e abre o que couber.
 *
 * A PERNA DE JANELA MAIS CURTA ESCOLHE PRIMEIRO, e isto não é detalhe de
 * implementação: decide dinheiro. Uma moeda pode estar entre as que mais
 * subiram em 30 dias E entre as que mais caíram em 14 — é a manipulada no meio
 * do despejo, com a subida velha ainda na janela longa. A COAI em 29/10/2025:
 * comprada, estopou em −25%; vendida, rendeu +80% em 14 dias. A BEAT em
 * 01/01/2026, o mesmo desenho: −25% contra +76%. A primeira versão deste motor
 * deixava a comprada escolher primeiro e media +154% fora da amostra, contra
 * +210% da pesquisa, que fazia o contrário; a diferença inteira estava nessas
 * moedas. A informação mais recente manda.
 */
export function decidir(
  e: EstadoRobo,
  linhas: readonly LinhaRanking[],
  precoDe: (symbol: string) => number | undefined,
  quando: number,
  manipuladas?: ReadonlySet<string>,
  /** Ver `abrir`: o custo do atraso, só na medição. */
  custoExtra = 0,
): PosicaoRobo[] {
  const abertas: PosicaoRobo[] = [];
  const pernas = [...e.regras.pernas].sort((a, b) => a.janelaDias - b.janelaDias);
  for (const perna of pernas) {
    for (const l of selecionar(e.regras, perna, linhas)) {
      const p = abrir(e, perna, l.symbol, precoDe(l.symbol) ?? NaN, quando, l.volume, manipuladas?.has(l.symbol) ?? false, custoExtra);
      if (p) abertas.push(p);
    }
  }
  e.ultimaDecisao = Math.floor(quando / DIA) * DIA;
  return abertas;
}

export function novoEstado(r: Robo, comecouEm: number): EstadoRobo {
  return {
    id: r.id,
    nome: r.nome,
    descricao: r.descricao,
    regras: r.regras,
    comecouEm,
    atualizadoEm: comecouEm,
    caixa: CAPITAL_ROBO,
    patrimonio: CAPITAL_ROBO,
    pico: CAPITAL_ROBO,
    quedaMaxima: 0,
    abertas: [],
    fechadas: [],
    curva: [{ t: comecouEm, patrimonio: CAPITAL_ROBO }],
    ultimaDecisao: null,
    diasPerdidos: 0,
    recusadas: 0,
  };
}

// ------------------------------------------------------------------ o arquivo

/** Uma linha da medição, para a tela: o retorno de cada janela, com o risco ao lado. */
export interface LinhaMedida {
  janela: string;
  de: number;
  ate: number;
  retorno: number;
  quedaMaxima: number;
  sharpe: number;
  trades: number;
}

export interface MedicaoRobo {
  id: string;
  linhas: LinhaMedida[];
  /** Retorno por trimestre, na janela inteira. */
  trimestres: { trimestre: string; retorno: number }[];
  /** A janela inteira sem a moeda que mais deu dinheiro, e qual era. */
  semAMelhor: { symbol: string; retorno: number };
  /** Cada janela (na ordem de `linhas`) sem as cinco moedas que mais deram na inteira. */
  semAs5?: { symbols: string[]; retornos: number[] };
  /** Quanto da perna comprada veio de moedas do painel de manipuladas, em dólares, e o total. */
  daManipuladas?: { manipuladas: number; total: number };
  /**
   * Em quantas compras encerradas a pirâmide entrou, e o resultado em DÓLARES
   * das que ganharam a parcela e das que não ganharam. Só em robô com pirâmide.
   */
  piramide?: { compras: number; comParcela: number; resultadoCom: number; resultadoSem: number };
  /** A curva da janela inteira, um ponto por dia. */
  curva: { t: number; patrimonio: number }[];
}

export interface Medicao {
  geradoEm: number;
  universo: { moedas: number; deslistadas: number; de: number; ate: number };
  robos: MedicaoRobo[];
  /**
   * As regras anteriores medidas no MESMO modelo realista, para a tela ler o
   * antes ao lado do depois. Opcional porque a medição de 07/10 não tem.
   */
  referencias?: MedicaoRobo[];
  /** O que o modelo realista cobra, para a tela dizer. */
  realismo?: { escorregadaStop: number; custoAtraso: number; nocionalMinimo: number };
}

export interface ArquivoRobos {
  geradoEm: number;
  robos: EstadoRobo[];
  /** A memória do Telegram: o último dia (00:00 UTC, ms) resumido. */
  resumidoAte?: number;
}

/**
 * Os robôs gravados, pela mesma regra de camadas do resto da página
 * (`lib/guardado.ts`): em produção o GitHub raw da branch `dados` primeiro.
 */
export async function getRobos(): Promise<ArquivoRobos | null> {
  const { lerGuardado } = await import("./guardado");
  const g = await lerGuardado<ArquivoRobos>(
    "robos.json",
    (d) => (Array.isArray((d as ArquivoRobos)?.robos) ? (d as ArquivoRobos) : null),
    120,
  );
  return g?.dado ?? null;
}

/** A medição gravada à mão por `npm run medir-robos`, que mora no `main`. */
export async function getMedicaoRobos(): Promise<Medicao | null> {
  const { lerGuardado } = await import("./guardado");
  const g = await lerGuardado<Medicao>(
    "robos-medicao.json",
    (d) => (Array.isArray((d as Medicao)?.robos) ? (d as Medicao) : null),
    3600,
  );
  return g?.dado ?? null;
}
