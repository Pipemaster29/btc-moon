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
 * COM O CUSTO DENTRO, a regra foi melhorada duas vezes no mesmo dia, cada peça
 * com a medição ao lado da constante que a liga:
 *
 *   manhã de 08/10: a compra olha 45 dias e dobra a aposta na que anda +40%
 *                   (`COMPRA_45`);
 *   tarde de 08/10: a compra SAI no dia em que a moeda deixa as 10 que mais
 *                   sobem (`COMPRA_MOMENTO`), e o tamanho segue a agitação do
 *                   próprio patrimônio (`ALVO_MOMENTO`).
 *   09/10:          cada VENDA tem o tamanho pela volatilidade da própria
 *                   moeda (`VENDA_MOMENTO`).
 *
 * Medido no livro inteiro com ESTE motor (`npm run medir-robos`), US$ 1.000 em
 * 08/01/2024 e o patrimônio em 30/09/2026. As duas primeiras linhas são do
 * motor de antes das regras da corretora (`RegrasDaMoeda`); as outras, com
 * elas — a margem de manutenção de cada moeda, a liquidação da margem isolada
 * com o financiamento saindo dela, o lote e o mínimo de cada ordem:
 *
 *   regra                        inteira    dentro    fora     queda máx   Sharpe
 *   07/10, 30 dias, 4%             +416%      +89%     +160%     −36%       1,36
 *   manhã de 08/10, 3%           +1.254%      +73%     +638%     −37%       2,09
 *   tarde de 08/10, 4%           +4.502%     +188%   +1.367%     −36%       2,38
 *   hoje, 4,25% ← "Momento"      +5.928%     +216%   +1.565%     −36%       2,54
 *   hoje, 6,375% ← "turbo"      +10.307%     +244%   +2.633%     −46%       2,45
 *
 * E o tamanho, na regra de hoje: 2% +1.591% (−22%), 3% +3.204% (−29%), 4%
 * +5.329% (−34%), 4,25% +5.928% (−36%), 5% +6.858% (−39%), 6% +9.395% (−44%),
 * 6,375% +10.307% (−46%), 7% +11.490% (−48%), 8% +14.246% (−53%). O Sharpe
 * fica em 2,53–2,54 de 3% a 4,25% e cai depois (2,40 a 2,47), quando o caixa
 * começa a recusar entrada: 12 recusas a 5%, 27 a 6,375%, 90 a 8%. Tamanho
 * escolhe o risco, não a vantagem. O Momento ficou na queda máxima da regra
 * anterior (−36%), e o turbo é 1,5x ele, na queda do turbo anterior (−46%).
 *
 * NA MESMA QUEDA MÁXIMA, a regra de hoje faz +5.928% contra +4.502% da tarde
 * de 08/10, com o Sharpe subindo nas duas metades. Por trimestre ela ganha em
 * 9 de 11 (perde 2024T1, −19%, e 2026T3, −10%), mas contra a regra anterior a
 * melhora NÃO é de todo trimestre: 6 de 11 — está medida em `VENDA_MOMENTO`.
 *
 * O QUE ISSO NÃO É, e é a ressalva que manda: o lucro vem de POUCAS MOEDAS.
 * Tirando as cinco que mais deram ao Momento (TUT, BEAT, LAB, RAVE, LSK), a
 * janela inteira cai de +5.928% para +833% e o fora, de +1.565% para +116%;
 * o dentro quase não muda (+216% → +224%). A pirâmide entrou em 311 de 1.090
 * compras, e foram essas que fizeram o lucro da perna: US$ 159 mil, contra US$
 * 89 mil perdidos nas outras 779. É o formato de qualquer seguidor de
 * tendência — perde pouco quase sempre e ganha muito de vez em quando —, e a
 * tese só continua de pé enquanto continuarem aparecendo monstras. Dos US$
 * 69.981 que a perna comprada fez, US$ 49.407 vieram de moedas que hoje estão
 * no painel de manipuladas: é a intuição de que "as manipuladas têm mais
 * potencial", medida — e é também o risco concentrado.
 *
 * O "Fluxo" é OUTRO LIVRO (`VENDA_FLUXO`, com a medição ao lado): vende as
 * moedas em que a venda a mercado dominou a semana, em par com ETH. Rende
 * menos que o Momento e quase não anda junto com ele (correlação 0,10).
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
 * comprada e do alvo de volatilidade são da bancada realista, a 3% e a 4%; os
 * da tabela acima, deste motor.
 *
 * ESTE ARQUIVO NÃO IMPORTA NADA DE `node:` — a página o importa para desenhar
 * e remarcar, como `lib/carteira.ts`.
 */

// ------------------------------------------------------------------ as regras

export type LadoRobo = "long" | "short";

export type MotivoRobo = "stop" | "rastro" | "prazo" | "liquidada" | "sumiu" | "posto";

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
  /**
   * A SAÍDA POR POSTO: na decisão do dia, a posição sai quando a moeda deixou
   * as `saidaPosto` primeiras do ranking da perna — parou de ser das que mais
   * sobem (ou caem). Ausente: só stop, rastro e prazo.
   */
  saidaPosto?: number;
  /**
   * O CRITÉRIO do ranking. "retorno" (o padrão) é o momento: as que mais
   * subiram ou caíram na janela. "fluxo" é a fração do volume da janela que foi
   * COMPRA A MERCADO (taker buy): no vendido, as de menor fração — onde quem
   * vendeu a mercado mais dominou.
   */
  criterio?: "retorno" | "fluxo";
  /**
   * O HEDGE: cada posição da perna abre junto uma do OUTRO lado em `symbol`, do
   * mesmo nocional, com margem isolada própria nesta alavancagem, e as duas
   * saem juntas. O par aposta que a moeda vai PIOR que o hedge, não que o
   * mercado cai. Não combina com pirâmide.
   */
  hedge?: { symbol: string; alavancagem: number };
  /**
   * O TAMANHO PELA VOLATILIDADE DA MOEDA: cada posição da perna tem o tamanho
   * multiplicado pela mediana do desvio diário das elegíveis do dia ÷ o desvio
   * da própria moeda (`LinhaRanking.vol`), entre `minimo` e `maximo`. A moeda
   * duas vezes mais agitada que a do meio entra com metade do tamanho. Sem a
   * leitura do desvio, o tamanho normal. Ausente: todas do mesmo tamanho.
   */
  porVolatilidade?: { minimo: number; maximo: number };
}

/**
 * O ALVO DE VOLATILIDADE: o tamanho de cada entrada nova é multiplicado por
 * alvo ÷ desvio dos retornos diários do PATRIMÔNIO do robô nos últimos
 * `janelaDias` dias, entre `minimo` e `maximo`. Patrimônio agitado, posição
 * menor; calmo, maior. Com menos dias de curva do que a janela, 1.
 */
export interface AlvoVolatilidade {
  /** Volatilidade ANUAL perseguida, em fração (0,6 = 60% ao ano). */
  anual: number;
  janelaDias: number;
  minimo: number;
  maximo: number;
}

export interface RegrasRobo {
  /**
   * O NOCIONAL de cada posição, em fração do patrimônio na hora da entrada.
   * Fração do patrimônio e não da margem: a 4%, uma conta de US$ 1.000 abre
   * posições de US$ 40, com US$ 13 a US$ 20 de margem conforme a perna.
   * Com alvo de volatilidade, é o tamanho BASE, antes do multiplicador.
   */
  tamanho: number;
  /** Volume mínimo do perpétuo no dia anterior, em dólar. */
  volumeMinimo: number;
  /** Quantos dias de perpétuo a moeda precisa ter para entrar no ranking. */
  idadeMinimaDias: number;
  pernas: Perna[];
  alvoVolatilidade?: AlvoVolatilidade;
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

// ------------------------------------------------------------------ a corretora

/**
 * Um degrau da tabela de alavancagem da Binance: até que nocional ele vale, e
 * o que ele exige da posição. A tabela é pública e sem chave
 * (`/bapi/futures/v1/friendly/future/common/brackets`), e é ela que decide
 * onde a corretora liquida.
 */
export interface Degrau {
  /** Teto do degrau, em nocional da posição (dólares). */
  ate: number;
  /** Margem de manutenção, em fração do NOCIONAL. */
  manutencao: number;
  /** O desconto da manutenção no degrau (`cumFastMaintenanceAmount`), em dólares. */
  desconto: number;
  /** A maior alavancagem que a corretora aceita numa posição deste tamanho. */
  alavancagemMaxima: number;
}

/**
 * O que a Binance exige de uma ordem e de uma posição numa moeda: o nocional
 * mínimo (`MIN_NOTIONAL`), o passo da quantidade numa ordem a mercado
 * (`MARKET_LOT_SIZE`, em unidades da moeda; 0 se desconhecido) e os degraus
 * da margem de manutenção.
 *
 * ATÉ 09/10 O MOTOR USAVA 0,5% DE MANUTENÇÃO PARA TODA MOEDA. Na tabela de
 * 09/10, das 525 moedas, 149 pedem 5% no primeiro degrau e 203 pedem 2,5% —
 * e as que fizeram o lucro do Momento (TUT, BEAT, RAVE, MYX, AKE) pedem 5% até
 * US$ 10 mil e 10% daí até US$ 60 mil. Vendida a 2x numa delas, a corretora
 * liquida em +42,9%, ANTES do stop de 45%; o motor antigo deixava a posição
 * viva até o stop. Com 5% em toda moeda e nada mais mudado, o Momento perdia
 * 242 vendidas para a liquidação (+5.969% → +4.404%) e o Fluxo 175. Com a
 * tabela de cada moeda, a margem que põe a liquidação depois do stop
 * (`alavancagemSegura`: 1.266 de 1.298 vendidas do Momento, 1,86x em média) e a
 * reposição dela (`reporMargem`), nenhuma — e +5.969% → +5.928%.
 */
export interface RegrasDaMoeda {
  /** Nocional mínimo da ordem, em dólares. */
  nocionalMinimo: number;
  /** Passo da quantidade, em unidades da moeda; 0 sem passo conhecido. */
  passo: number;
  degraus: Degrau[];
}

/**
 * As regras de uma moeda que a tabela não tem — na medição, as deslistadas. É
 * a tabela das manipuladas de 2025–2026 (TUT, BEAT, RAVE, MYX, AKE), a mais
 * dura das comuns: errar para o lado de liquidar cedo.
 */
export const REGRAS_PADRAO: RegrasDaMoeda = {
  nocionalMinimo: NOCIONAL_MINIMO,
  passo: 0,
  degraus: [
    { ate: 10_000, manutencao: 0.05, desconto: 0, alavancagemMaxima: 10 },
    { ate: 60_000, manutencao: 0.1, desconto: 500, alavancagemMaxima: 5 },
    { ate: 70_000, manutencao: 0.125, desconto: 2_000, alavancagemMaxima: 4 },
    { ate: 250_000, manutencao: 0.1667, desconto: 4_919, alavancagemMaxima: 3 },
    { ate: 2_500_000, manutencao: 0.25, desconto: 25_744, alavancagemMaxima: 2 },
    { ate: 5_000_000, manutencao: 0.5, desconto: 650_744, alavancagemMaxima: 1 },
  ],
};

/**
 * A FOLGA entre o stop e a liquidação, em variação de PREÇO, que a margem de
 * cada posição precisa garantir na entrada. Com ela, a vendida a 2x de uma
 * moeda de 0,5% de manutenção continua a 2x (liquidação a +49,3%, stop a
 * 45%), e a de 5% recebe margem a mais até a liquidação ir a +49%: é o que se
 * faz numa conta de verdade, acrescentando margem à posição isolada.
 */
export const FOLGA_LIQUIDACAO = 0.04;

/** O degrau em que cai uma posição deste nocional. */
export function degrauPara(degraus: readonly Degrau[], nocional: number): Degrau {
  for (const d of degraus) if (nocional < d.ate) return d;
  return degraus[degraus.length - 1];
}

/**
 * O preço de liquidação da margem ISOLADA, pela fórmula da Binance:
 * comprado (N − M − desconto) ÷ (Q × (1 − manutenção)), vendido
 * (N + M + desconto) ÷ (Q × (1 + manutenção)), com N o nocional da entrada,
 * Q a quantidade e M a margem que sobra na posição — a inicial menos o
 * financiamento pago, porque na margem isolada a cobrança sai dela.
 */
export function liquidacaoIsolada(lado: LadoRobo, precoEntrada: number, nocional: number, margem: number, d: Degrau): number {
  const q = nocional / precoEntrada;
  return lado === "long"
    ? Math.max(0, (nocional - margem - d.desconto) / (q * (1 - d.manutencao)))
    : (nocional + margem + d.desconto) / (q * (1 + d.manutencao));
}

/**
 * A alavancagem da posição: a da perna, a não ser que a corretora liquide
 * antes do stop (mais a `FOLGA_LIQUIDACAO`) ou não aceite esse tamanho nessa
 * alavancagem — aí a menor das duas. Fração, não inteiro: na Binance a
 * alavancagem é inteira, e o resto vem de margem acrescentada à posição.
 */
export function alavancagemSegura(lado: LadoRobo, stop: number, alavancagem: number, nocional: number, degraus: readonly Degrau[]): number {
  const d = degrauPara(degraus, nocional);
  const c = d.desconto / nocional;
  const minimoInverso =
    lado === "long" ? 1 - c - (1 - stop - FOLGA_LIQUIDACAO) * (1 - d.manutencao) : (1 + stop + FOLGA_LIQUIDACAO) * (1 + d.manutencao) - 1 - c;
  const teto = minimoInverso > 0 ? 1 / minimoInverso : Infinity;
  return Math.max(1, Math.min(alavancagem, d.alavancagemMaxima, teto));
}

/** Os campos que se leem do `exchangeInfo` de um símbolo. */
export interface SimboloDaCorretora {
  symbol: string;
  filters?: { filterType: string; notional?: string; stepSize?: string }[];
}

/** Os campos que se leem da tabela de degraus de um símbolo. */
export interface DegrausDaCorretora {
  symbol: string;
  riskBrackets?: {
    bracketNotionalCap: number;
    bracketMaintenanceMarginRate: number;
    cumFastMaintenanceAmount: number;
    maxOpenPosLeverage: number;
  }[];
}

/**
 * As regras de cada símbolo a partir do `exchangeInfo` e da tabela de degraus.
 * Símbolo sem degrau legível fica FORA do mapa — quem consulta usa
 * `REGRAS_PADRAO`, a tabela mais dura, e não uma régua inventada mais branda.
 */
export function lerRegrasDaCorretora(
  simbolos: readonly SimboloDaCorretora[],
  tabela: readonly DegrausDaCorretora[],
): Map<string, RegrasDaMoeda> {
  const porSimbolo = new Map(tabela.map((t) => [t.symbol, t.riskBrackets ?? []]));
  const out = new Map<string, RegrasDaMoeda>();
  for (const s of simbolos) {
    const degraus = (porSimbolo.get(s.symbol) ?? [])
      .map((b) => ({
        ate: Number(b.bracketNotionalCap),
        manutencao: Number(b.bracketMaintenanceMarginRate),
        desconto: Number(b.cumFastMaintenanceAmount),
        alavancagemMaxima: Number(b.maxOpenPosLeverage),
      }))
      .filter((d) => d.ate > 0 && d.manutencao > 0 && d.manutencao < 1 && Number.isFinite(d.desconto) && d.alavancagemMaxima >= 1)
      .sort((a, b) => a.ate - b.ate);
    if (degraus.length === 0) continue;
    const f = new Map((s.filters ?? []).map((x) => [x.filterType, x]));
    const minimo = Number(f.get("MIN_NOTIONAL")?.notional);
    const passo = Number(f.get("MARKET_LOT_SIZE")?.stepSize ?? f.get("LOT_SIZE")?.stepSize);
    out.set(s.symbol, {
      nocionalMinimo: Number.isFinite(minimo) && minimo > 0 ? minimo : NOCIONAL_MINIMO,
      passo: Number.isFinite(passo) && passo > 0 ? passo : 0,
      degraus,
    });
  }
  return out;
}

/**
 * O nocional que a corretora aceita: a quantidade cai para o passo de baixo
 * (`MARKET_LOT_SIZE`), e abaixo do mínimo a ordem não existe — zero.
 */
export function nocionalAceito(nocional: number, preco: number, r: RegrasDaMoeda): number {
  const passo = r.passo > 0 ? r.passo * preco : 0;
  const n = passo > 0 ? Math.floor(nocional / passo + 1e-9) * passo : nocional;
  return n >= r.nocionalMinimo ? n : 0;
}

/**
 * A perna comprada de 07/10: as 5 que mais subiram em 30 dias, sem pirâmide.
 * É a do Caça-monstra (com k 3), onde nada do que veio depois passou.
 *
 * TRINTA DIAS E NÃO SETE: com 7 dias o livro caía de Sharpe 1,59 para
 * 0,68–0,71 na bancada. RASTRO DE 30%: com 20% o livro inteiro caía para +17%
 * (Sharpe 0,68), porque as monstras recuam 20% várias vezes no caminho e o
 * rastro curto as vende no primeiro tranco.
 */
const COMPRA_30: Perna = {
  lado: "long",
  janelaDias: 30,
  k: 5,
  stop: 0.25,
  rastro: 0.3,
  prazoH: 30 * 24,
  alavancagem: 3,
};

/**
 * A perna comprada da manhã de 08/10: as 5 que mais subiram em 45 DIAS, com
 * UMA parcela a mais quando a posição anda +40%. É a base da de agora.
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
const COMPRA_45: Perna = {
  ...COMPRA_30,
  janelaDias: 45,
  piramide: { niveis: [0.4], tamanho: 1 },
};

/**
 * A perna comprada desde a tarde de 08/10: a de 45 dias com SAÍDA POR POSTO —
 * a posição sai no dia em que a moeda deixa as 10 que mais subiram em 45 dias.
 * A monstra que parou de ser monstra devolvia o ganho até o rastro de 30% a
 * pegar, ou ficava parada até o prazo, prendendo margem.
 *
 * Medido na bancada realista, a 3% por posição e sem o alvo de volatilidade:
 *
 *                       inteira   dentro    fora    sem as 5, fora   queda máx   Sharpe
 *   sem saída por posto  +1.256%    +72%     +639%       +108%          −37%      2,08
 *   top 5                +1.742%   +117%     +735%       +138%          −31%      2,27
 *   top 7                +1.980%   +129%     +789%       +147%          −28%      2,36
 *   top 10 ← esta        +1.555%   +109%     +675%       +117%          −28%      2,22
 *   top 15               +1.336%    +86%     +660%       +114%          −32%      2,12
 *   top 20               +1.307%    +83%     +656%       +114%          −34%      2,11
 *   top 40               +1.265%    +84%     +639%       +109%          −34%      2,09
 *
 * PLATÔ, NÃO PICO: de 5 a 40 tudo ganha da regra sem saída em todas as
 * colunas, e a queda máxima cai junto. O 7 mediu melhor e é o pico; o 10 fica
 * no meio do platô, com vizinho bom dos dois lados.
 *
 * O que foi medido junto e NÃO entrou: a mesma saída na vendida (fora das 10,
 * 20 ou 40 que mais caíram: piora as três janelas, +1.090% a +1.127%); sair
 * em 3, 5, 7 ou 10 dias sem lucro (melhora o dentro e a queda, e o fora fica
 * igual ou pior — não passa sozinha); comprar só perto da máxima da janela
 * (−50% a −90% do resultado: nestas moedas a que já corrigiu continua); ranking
 * por retorno ÷ volatilidade (+642%); comprar só com o BTC acima da média de 50
 * ou 100 dias (+640% e +291%); vender só com ele abaixo (o dentro vira −15%);
 * pirâmide na vendida em −20% ou −30% (o dentro cai para +44% a +61% e a queda
 * vai a −52%); stop de 20% ou 30%; volume mínimo de 10 ou 50 milhões.
 */
const COMPRA_MOMENTO: Perna = { ...COMPRA_45, saidaPosto: 10 };

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
const VENDA_14: Perna = {
  lado: "short",
  janelaDias: 14,
  k: 5,
  stop: 0.45,
  rastro: null,
  prazoH: 14 * 24,
  alavancagem: 2,
};

/**
 * A VENDIDA DO MOMENTO desde 09/10: a de 14 dias, com o tamanho de cada
 * posição pela volatilidade da própria moeda (`porVolatilidade`, ¼ a 2x): a
 * mediana do desvio diário de 45 dias das elegíveis ÷ o desvio da moeda. A
 * moeda duas vezes mais agitada que a do meio é vendida com metade do tamanho.
 *
 * Medido com ESTE motor e as regras da corretora sobre a regra da tarde de
 * 08/10, na mesma queda máxima (−36%: 4,25% com a regra, 4% sem):
 *
 *                       inteira    dentro          fora            sem as 5: inteira · dentro · fora
 *   sem (08/10)         +4.502%   +188% (1,43)   +1.367% (3,27)     +633% · +195% · +104%
 *   com ← esta          +5.928%   +216% (1,56)   +1.565% (3,39)     +833% · +224% · +116%
 *
 * (entre parênteses, o Sharpe de cada metade). No MESMO tamanho, 4%, a regra
 * faz +5.329% com queda de −34%: mais lucro e menos queda juntos.
 *
 * PLATÔ — a janela do desvio, a 4,25%: 30 dias +5.562% (Sharpe dentro 1,54,
 * fora 3,33), 45 dias +5.928% (1,56 e 3,39), 60 dias +5.134% (1,44 e 3,38),
 * contra 1,43 e 3,27 da regra anterior. Com 14 dias o dentro empata (1,44) e
 * com 21 piora (1,40): desvio de poucos dias é ruído. Os limites: ½ a 2x
 * +5.878%, ¼ a 1,5x +5.919%, ¼ a 3x +5.908%. O resto deste comentário foi
 * medido no motor de antes das regras da corretora, a régua da rodada: ATAQUE,
 * contra a regra anterior no mesmo ataque, custo de entrada 4x +4.443% contra
 * +3.466% (Sharpe dentro 1,37 contra 1,28; fora 3,27 contra 3,15); escorregada
 * do stop dobrada +4.618% contra +3.686% (1,50 contra 1,41; 3,21 contra 3,11).
 *
 * O QUE ELA NÃO É. Não é "a moeda agitada é venda ruim": por quartil do
 * desvio na entrada, as vendidas mais agitadas tiveram o MELHOR resultado
 * médio por margem (+8,7%) — e o maior número de stops (72 de 284). A regra
 * reparte o risco entre as vendidas em vez de concentrá-lo nas que mais
 * pulam. E não melhora todo trimestre: contra a regra anterior ganha em 6 de
 * 11 (5 no motor antigo). A vendida perde muito menos em 2026T2 (−18% do
 * patrimônio → −6%) e em 2024T1 (−28% → −24%), e mais em 2025T3 (−15% → −23%)
 * e 2026T1 (+29% → +20%); a comprada, com o patrimônio maior, faz o resto.
 *
 * Medido na mesma rodada e REPROVADO, sobre a regra anterior a 4%:
 *
 *   tamanho pela volatilidade na COMPRADA   +1.848%: as monstras são as moedas
 *                                           mais agitadas, e o lucro mora nelas
 *   só a comprada, sem a vendida            dentro +17%, queda −51%: a vendida
 *                                           perde US$ 8 mil na soma e segura 2024
 *   vendida com ½ ou ¾ do tamanho           dentro +118% e +161%
 *   vendida trocada pelo par do Fluxo       fora +2.022% a +2.194%, dentro +91% a
 *                                           +138%, queda −41% a −46%
 *   o par do Fluxo como terceira perna      escolhendo antes: +1.568% a +3.830%;
 *                                           depois: +4.239% a +5.022%, queda −36%
 *                                           a −38% — o caixa não comporta os dois
 *                                           livros, e a vendida perde as melhores
 *                                           moedas para o par
 *   fluxo como filtro (7 ou 14 dias)        comprada fora das 10% a 30% mais
 *                                           vendidas a mercado: +3.888% a +4.515%;
 *                                           vendida só nas mais vendidas: +2.237% a
 *                                           +4.206%
 *   não comprar depois de um dia de alta    15% a 40%: +1.724% a +2.614% — é nesse
 *                                           dia que a monstra começa; na vendida,
 *                                           depois de um dia de queda: +3.373% a
 *                                           +4.828%
 *   k da comprada 3, 4, 6, 7                +1.780%, +3.637%, +4.174%, +3.388%
 *   k da vendida 3, 4, 6, 7                 +4.424% (dentro +132%), +4.855%
 *                                           (empata), +2.809%, +2.671%
 *   janela da vendida 7, 10, 21, 30 dias    +1.835%, +2.925%, +3.547%, +2.375%
 */
const VENDA_MOMENTO: Perna = { ...VENDA_14, porVolatilidade: { minimo: 0.25, maximo: 2 } };

/**
 * O ALVO DE VOLATILIDADE do Momento: 60% ao ano, medido nos últimos 40 dias do
 * patrimônio, com o tamanho entre ¼ e 2x o base.
 *
 * Medir a agitação do PRÓPRIO patrimônio e encolher a aposta nela — e crescer
 * na calmaria — é a correção conhecida do momento (Barroso e Santa-Clara,
 * 2015). Aqui ela foi medida, sobre a perna comprada com saída por posto, a 3%:
 *
 *                            inteira   dentro    fora    sem as 5, fora   queda máx   Sharpe
 *   sem alvo                  +1.555%   +109%     +675%       +117%          −28%      2,22
 *   60%, 40 dias ← este       +3.063%   +160%   +1.007%       +147%          −31%      2,42
 *   60%, 30 dias              +2.442%   +158%     +888%       +161%          −32%      2,29
 *   60%, 60 dias              +2.079%   +142%     +758%       +136%          −30%      2,24
 *   50% e 80%, 40 dias        Sharpe 2,41 nos dois: o alvo só muda o tamanho médio
 *
 * O SHARPE é o número que importa aqui, porque o alvo também aumenta o tamanho
 * médio, e tamanho sozinho não muda o Sharpe (2,08 a 2,11 de 2% a 6%). Ele
 * sobe de 2,22 para 2,24–2,42 em todas as janelas de 30 a 60 dias, dentro
 * (1,35 → 1,42–1,48) e fora (3,02 → 3,07–3,35). O teto de 2x e o piso de ¼
 * quase não mordem: 1,5x mede 2,35, 3x mede 2,42, piso de ½ é igual ao de ¼.
 *
 * Os dois juntos, ATACADOS, a 3%:
 *
 *                            inteira   dentro    fora    sem as 5, fora
 *   entrada a 0,4% (4x)       +2.411%   +132%     +888%       +120%
 *   escorregada dobrada       +2.454%   +150%     +831%       +112%
 *   entrada 1 h atrasada      +2.577%   +154%     +860%       +132%
 *   entrada 3 h atrasada      +1.906%   +122%     +744%        +49%
 *
 * No Caça-monstra o alvo NÃO passou: na mesma queda máxima ele melhora o
 * dentro (−4% → +3%) e piora o fora (+189% → +163%). No Fluxo também não, do
 * mesmo jeito: na mesma queda (−22%: 2% com ele, 3% sem), dentro +90% → +104%
 * com o Sharpe igual (1,55 e 1,56), fora +91% → +84% com o Sharpe caindo de
 * 1,65 para 1,51. O Sharpe da janela inteira subia (1,60 → 1,68) por mudar a
 * aposta de lugar entre as metades, não por melhorar nenhuma delas. (Medido
 * antes das regras da corretora; com elas é pior ainda para o alvo: a 2% de
 * base o ETH do par fica abaixo do mínimo de US$ 20 sempre que o alvo encolhe
 * a aposta, e o fora cai para +37%.)
 */
const ALVO_MOMENTO: AlvoVolatilidade = { anual: 0.6, janelaDias: 40, minimo: 0.25, maximo: 2 };

/**
 * A PERNA DO FLUXO: vende as 5 moedas em que a VENDA A MERCADO mais dominou o
 * volume dos últimos 7 dias (a menor fração de compra agressora, `criterio:
 * "fluxo"`), cada uma em PAR com uma compra de ETH do mesmo nocional, por 14
 * dias, stop de 45%. A aposta é que elas vão pior que o ETH — não que o mercado
 * cai.
 *
 * Saiu de uma rodada de livros DIFERENTES do momento (08/10), na bancada
 * realista (os números deste comentário são dela; os deste motor estão no
 * fim). As famílias que NÃO passaram foram medidas como toda a rodada, a 3%
 * com o alvo de volatilidade do Momento ligado; o fluxo, daqui para baixo, a
 * 3% e sem o alvo, como o robô publicado:
 *
 *   coletar o financiamento na hora da cobrança   desde 07/2025 o preço cai o que a
 *                                                 cobrança paga: ≈0% por evento fora
 *                                                 (e +0,4% a +1,2% dentro era olhar o
 *                                                 futuro nas moedas de cobrança horária)
 *   carry: vender quem paga financiamento alto    −57% a −73% (é vender o momento)
 *   comprar quem recebe financiamento             +23% a −13%; sem as 5, negativo
 *   reversão de 1 e 3 dias, nos dois lados        −36% a −87%
 *   loteria (vender o maior dia de 30 dias)       dentro +14%, fora −23%
 *   vender a listagem nova 1, 3 ou 7 dias depois  dentro +20% a +62%, fora negativo
 *   vender a divergência preço sobe e fluxo vende −19% a −30%
 *   tamanho médio do negócio, volume que acorda   não passa em nenhuma direção
 *   comprar o fluxo comprador                     fora +62% a +215%, dentro −6% a −36%
 *   fluxo somado ao momento num score só          dilui o momento: +392% contra +611%
 *
 * O fluxo vendedor SOZINHO passa — +73% a +107%, positivo dentro, fora e sem as
 * 5 melhores — mas com Sharpe de 0,6 a 0,8. E ele escolhe moedas diferentes das
 * da vendida do Momento: 13% de sobreposição. O que o fez virar livro foi o
 * HEDGE, que tira o mercado da conta:
 *
 *                                     inteira   dentro     fora   sem as 5, fora   Sharpe
 *   fluxo vendedor, sem hedge          +107%      +54%      +34%        +12%          0,78
 *   + compra de BTC                    +281%     +186%      +31%        +11%          1,24
 *   + compra de ETH  ← este            +271%      +90%      +93%        +64%          1,22
 *   + cesta das 10 maiores altcoins    +242%      +92%      +63%         +8%          1,11
 *   vendida do Momento + ETH (controle) +115%     +91%       +8%        −10%          0,86
 *
 * O BTC sozinho, nas mesmas datas, fez +59% dentro (ele foi de 43 mil a 107 mil):
 * o hedge de BTC infla 2024. O de ETH é o equilibrado. E o controle diz que o
 * lucro é do FLUXO, não do hedge: a vendida do Momento com o mesmo ETH faz +8%
 * fora, e −10% sem as 5 melhores. (A bancada marca o hedge só na saída: a
 * queda e o Sharpe dela são os de um vendido SEM hedge enquanto a posição está
 * aberta. Este motor marca as duas metades de hora em hora, e é daí que vêm a
 * queda de −22% e o Sharpe de 1,60 do fim, contra −35% e 1,22 aqui.)
 *
 * PLATÔ — cada peça mexida sozinha, todas positivas nas três janelas e no "sem
 * as 5": janela de 5, 10 e 14 dias (+99%, +176%, +143%); prazo de 7 e 21 dias
 * (+114%, +252%); k 3 e 7 (+172%, +236%); stop de 30% e 60% (+211%, +268%);
 * volume de 10 e 50 milhões (+239%, +147%); hedge de 0,5, 0,75 e 1,25 do
 * nocional (+195%, +236%, +298%). ATAQUE: custo de entrada 4x +224%, escorregada
 * dobrada +266%, entrada 1 h e 3 h atrasada +260% e +259%, custo do hedge a 0,3%
 * por lado +209%. Ganha em 8 de 11 trimestres; perde 2024T1 (−9%), 2024T3 (−12%)
 * e 2026T2 (−2%).
 *
 * MEDIDO COM ESTE MOTOR e as regras da corretora, a 3% por posição e sem o
 * alvo de volatilidade (que aqui não passou — ver `ALVO_MOMENTO`): +260% na
 * janela inteira (queda máxima −22%, Sharpe 1,60), +90% dentro e +89% fora;
 * sem as 5 melhores, +214% inteira, +86% dentro e +69% fora. Ganha em 8 de 11
 * trimestres. 1.571 pares, nenhum hedge liquidado; dos US$ 2.584 que fizeram,
 * US$ 1.722 vieram da perna vendida e US$ 862 do ETH. Sem as regras da
 * corretora eram +262%: o par quase não sente a margem de manutenção, porque
 * a 2x as duas metades ficam longe da liquidação.
 *
 * O QUE ELE É E O QUE NÃO É: rende bem menos que o Momento (Sharpe 1,60 contra
 * 2,42). A virtude é outra, e está medida. O lucro dele não mora em cinco
 * moedas: sem as 5 melhores sobram 82% do lucro, no Momento 14%. E ele anda
 * por outro caminho: correlação diária de 0,10 com o Momento de 09/10 (0,16
 * com o de 08/10) e −0,24 com o Caça-monstra; nos 99 dias em que o Momento
 * caiu mais de 3% (−4,6% na média), o Fluxo fez −0,6%. Se as monstras pararem de aparecer, o Momento
 * seca e este não depende delas.
 *
 * Medido em 09/10 e REPROVADO neste livro: o tamanho pela volatilidade da
 * moeda, que passou na vendida do Momento (Sharpe 1,60 → 1,34, +175% a 3%);
 * sair quando a moeda deixa as 20, 40 ou 80 de menor fluxo (+126%, +141% e
 * +219%: a pressão vendedora para de aparecer e o efeito continua); e hedge
 * maior que o nocional. O beta das vendidas do Fluxo contra o ETH é 1,00 na
 * mediana dos 30 dias antes da entrada e 1,06 durante a posição (0,80 a 1,31
 * entre os quartis): o 1 para 1 já é o neutro, e o 1,25 da bancada (+298%
 * contra +271%) é ETH comprado a mais, que rendeu porque o ETH subiu no fora.
 */
const VENDA_FLUXO: Perna = {
  lado: "short",
  janelaDias: 7,
  k: 5,
  stop: 0.45,
  rastro: null,
  prazoH: 14 * 24,
  alavancagem: 2,
  criterio: "fluxo",
  // A 2x, a liquidação do ETH fica a −49,5%. Em 34 das 990 janelas de 14 dias
  // de 2024–2026 ele caiu mais que os −32,8% da de 3x (a pior, −42,6% a partir
  // de 28/01/2026); nenhuma chegou aos −49,5%.
  hedge: { symbol: "ETHUSDT", alavancagem: 2 },
};

/**
 * Volume mínimo de US$ 20 milhões no dia: é onde o custo por lado fica entre
 * 0,10% e 0,15% e a posição de dezenas de dólares não move o livro. Com 5
 * milhões o livro rende MAIS (+64,5% contra +52,8%) e com 50 milhões, menos
 * (+45,9%) — o corte não está no ponto ótimo de propósito: moeda de US$ 5
 * milhões por dia é onde a escorregada real mais se afasta da estimada.
 */
const UNIVERSO = { volumeMinimo: 20e6, idadeMinimaDias: 14 };

/**
 * O tamanho base do Momento, antes do alvo de volatilidade; o turbo usa 1,5x.
 * 4,25% e não 4%: com a vendida pela volatilidade (`VENDA_MOMENTO`) a queda
 * máxima a 4% caiu para −34%, e 4,25% a devolve aos −36% da regra anterior —
 * a comparação entre regras é sempre na mesma queda. A tabela inteira está no
 * topo do arquivo.
 */
const TAMANHO_MOMENTO = 0.0425;

export const ROBOS: Robo[] = [
  {
    id: "momento",
    nome: "Momento",
    descricao:
      "Compra as 5 que mais subiram em 45 dias (dobra a aposta nas que sobem +40% e sai das que deixam o top 10) e vende as 5 que mais caíram em 14, menos nas mais agitadas, todo dia, em qualquer perpétuo com US$ 20 mi de volume. A aposta encolhe quando o patrimônio fica agitado.",
    regras: { tamanho: TAMANHO_MOMENTO, ...UNIVERSO, pernas: [COMPRA_MOMENTO, VENDA_MOMENTO], alvoVolatilidade: ALVO_MOMENTO },
  },
  {
    id: "turbo",
    nome: "Momento turbo",
    descricao: "O mesmo livro com 1,5x o tamanho — a resposta medida para \"e se arriscasse mais?\".",
    regras: { tamanho: 1.5 * TAMANHO_MOMENTO, ...UNIVERSO, pernas: [COMPRA_MOMENTO, VENDA_MOMENTO], alvoVolatilidade: ALVO_MOMENTO },
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
      pernas: [{ ...COMPRA_30, k: 3 }],
    },
  },
  {
    id: "fluxo",
    nome: "Fluxo",
    descricao:
      "Vende as 5 moedas em que a venda a mercado mais dominou nos últimos 7 dias e compra ETH do mesmo tamanho para cada uma: aposta que elas vão pior que o ETH, não que o mercado cai. 14 dias, stop de 45%.",
    // 3%: cada par prende margem nas DUAS metades, e acima disso o caixa
    // começa a recusar entrada — a 3,5% são 59 recusas e Sharpe 1,55; a 4%,
    // 199 e 1,54. E abaixo dele a Binance não deixa: o ETH pede US$ 20 por
    // ordem, e a 2% de uma conta de US$ 1.000 o hedge fica abaixo disso assim
    // que a conta passa um centavo de US$ 1.000 para baixo (o lote do ETH, de
    // 0,001, arredonda para baixo) — medido, o robô não abriu um par sequer.
    // A 2,5%, 33 recusas e Sharpe 1,57. Sem o alvo de volatilidade do Momento, que aqui
    // NÃO passou (ver `ALVO_MOMENTO`).
    regras: { tamanho: 0.03, ...UNIVERSO, pernas: [VENDA_FLUXO] },
  },
];

/**
 * O Momento como foi publicado na manhã de 08/10 — 45 dias e pirâmide, sem
 * saída por posto nem alvo de volatilidade, a 3% —, para a medição ler o antes
 * ao lado do depois.
 */
export const MOMENTO_ANTERIOR: Robo = {
  id: "momento-anterior",
  nome: "Momento anterior",
  descricao: "A regra de 08/10: vendida do mesmo tamanho em toda moeda, 4% por posição.",
  regras: { tamanho: 0.04, ...UNIVERSO, pernas: [COMPRA_MOMENTO, VENDA_14], alvoVolatilidade: ALVO_MOMENTO },
};

// ------------------------------------------------------------------ o estado

/** A perna de hedge de um par (`Perna.hedge`): a outra metade da posição, com margem isolada própria. */
export interface PernaHedge {
  symbol: string;
  lado: LadoRobo;
  precoEntrada: number;
  /** Dólares — o mesmo nocional da perna principal na entrada. */
  nocional: number;
  /** Dólares que saíram do caixa por esta perna. */
  margem: number;
  /** Custo por lado, em fração do nocional. */
  custoLado: number;
  liquidacao: number;
  /** Financiamento acumulado em DÓLARES; positivo é custo. */
  funding: number;
  fundingAte: number;
  precoAtual: number;
  /**
   * Quando a corretora liquidou o hedge: ele leva a margem dele, e o par segue
   * só com a perna principal até ela sair.
   */
  liquidadaEm?: number;
  /** As regras da corretora para o símbolo do hedge na entrada; ausente, a liquidação fica fixa (como antes de 09/10). */
  corretora?: RegrasDaMoeda;
}

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
  /**
   * A saída por posto com que a posição entrou: o ranking de `janelaDias` e as
   * `n` primeiras. Mora na posição como o stop e o rastro — a que entrou antes
   * da regra não sai por ela. Ausente: sem saída por posto.
   */
  posto?: { janelaDias: number; n: number; criterio?: "retorno" | "fluxo" };
  /**
   * SÓ NO AO VIVO: quanto o livro de ofertas da Binance cobraria na hora da
   * entrada, por lado, em fração do nocional — meio spread mais o impacto de
   * uma ordem a mercado deste tamanho. Não entra na conta: fica ao lado do
   * custo do modelo (`custoLado` menos a `TAXA`) para conferir a régua.
   */
  livro?: number;
  /**
   * As regras da corretora na entrada (`RegrasDaMoeda`): com elas a
   * liquidação é recalculada a cada vela com a margem que sobra depois do
   * financiamento, e a parcela da pirâmide respeita o degrau do novo tamanho.
   * Ausente (posição aberta antes de 09/10), a liquidação fica a da entrada.
   */
  corretora?: RegrasDaMoeda;
  /** A outra metade do par, quando a perna tem hedge. */
  hedge?: PernaHedge;
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
  /** O custo do livro na entrada (`PosicaoRobo.livro`), quando foi medido. */
  livro?: number;
  /** O custo por lado que o modelo cobrou (`PosicaoRobo.custoLado`). */
  custoLado?: number;
  /**
   * A metade de hedge do par, quando houve. O `resultado` e a `margem` acima já
   * somam as duas metades; aqui fica a parte do hedge, para a tela separar.
   */
  hedge?: { symbol: string; precoEntrada: number; precoSaida: number; resultado: number; funding: number; liquidada?: boolean };
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
  /**
   * A fração do volume em dólar de cada janela (dias → fração) que foi compra a
   * mercado (taker buy); nulo sem série que cubra a janela. Só os robôs com
   * perna de critério "fluxo" precisam dela.
   */
  fluxo?: Record<number, number | null>;
  /** As regras da corretora para a moeda; ausente, o motor antigo (0,5% de manutenção, US$ 5 de mínimo, sem passo). */
  corretora?: RegrasDaMoeda;
  /**
   * O desvio dos retornos diários, de fechamento a fechamento, nos últimos
   * `JANELA_VOLATILIDADE_DIAS` dias, em fração de PREÇO (`desvioDiario`). Só
   * os robôs com perna `porVolatilidade` precisam dele.
   */
  vol?: number | null;
}

export const HORA = 3_600_000;
export const DIA = 24 * HORA;

/**
 * A janela do desvio de `Perna.porVolatilidade`, em DIAS. De 30 a 60 dias a
 * regra melhora o Momento nas duas metades; com 14 e 21 o desvio é ruído e o
 * dentro da amostra piora (ver `VENDA_MOMENTO`). 45 é o meio do platô.
 */
export const JANELA_VOLATILIDADE_DIAS = 45;

/**
 * O desvio padrão dos retornos diários a partir dos fechamentos diários, do
 * mais velho ao mais novo (o último é o da véspera da decisão). Dia sem
 * fechamento entra como NaN e anula os dois retornos que tocam nele. Com
 * menos de dois terços dos retornos da janela, nulo: desvio de poucos dias é
 * ruído, e "não consegui ler" não pode virar posição maior ou menor.
 */
export function desvioDiario(fechamentos: readonly number[]): number | null {
  const rs: number[] = [];
  for (let k = 1; k < fechamentos.length; k++) {
    const a = fechamentos[k - 1];
    const b = fechamentos[k];
    if (a > 0 && b > 0 && Number.isFinite(a) && Number.isFinite(b)) rs.push(b / a - 1);
  }
  if (rs.length < 2 || rs.length < Math.round((2 / 3) * (fechamentos.length - 1))) return null;
  const m = rs.reduce((s, r) => s + r, 0) / rs.length;
  const v = Math.sqrt(rs.reduce((s, r) => s + (r - m) ** 2, 0) / (rs.length - 1));
  return Number.isFinite(v) ? v : null;
}

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
export function valorDaPosicao(p: PosicaoRobo, preco: number, precoHedge?: number): number {
  const v = p.margem + p.nocional * aFavor(p, preco) - p.nocional * p.custoLado - p.funding - (p.custoExtra ?? 0);
  // As duas metades de um par têm margens isoladas: cada uma tem o próprio piso.
  const h = p.hedge ? valorDoHedge(p.hedge, precoHedge !== undefined && precoHedge > 0 ? precoHedge : p.hedge.precoAtual) : 0;
  return (Number.isFinite(v) ? Math.max(0, v) : 0) + h;
}

/** A margem que a posição prende no caixa: as duas metades, quando é um par. */
export function margemTotal(p: PosicaoRobo): number {
  return p.margem + (p.hedge?.margem ?? 0);
}

/** O valor da metade de hedge a este preço, com o mesmo piso de zero; liquidada, zero. */
export function valorDoHedge(h: PernaHedge, preco: number): number {
  if (h.liquidadaEm !== undefined) return 0;
  const v = h.margem + h.nocional * aFavor(h, preco) - h.nocional * h.custoLado - h.funding;
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
export function cobrar(p: PosicaoRobo | PernaHedge, cobrancas: readonly Cobranca[], ate: number): void {
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
  /**
   * As velas e cobranças do símbolo do hedge, quando a posição é um par. Sem
   * elas o par NÃO anda: percorrer só a metade principal deixaria o hedge
   * parado num preço velho, e a saída o fecharia nesse preço.
   */
  hedge?: { velas: readonly VelaRobo[]; cobrancas: readonly Cobranca[] },
): Saida | null {
  const comprado = p.lado === "long";
  if (p.hedge && !hedge) return null;
  const velasHedge = new Map((hedge?.velas ?? []).map((v) => [v.t, v]));
  for (const v of velas) {
    if (v.t < p.abertaEm || v.t <= p.ultimaVela) continue;
    if (!(v.o > 0 && v.h > 0 && v.l > 0 && v.c > 0)) {
      return { preco: p.precoAtual, quando: v.t, motivo: "sumiu" };
    }
    // 0. A metade de hedge anda na mesma hora, ANTES: se a principal sair nesta
    //    vela, o hedge fecha no fechamento dela.
    if (p.hedge && hedge) andarHedge(p.hedge, velasHedge.get(v.t), hedge.cobrancas, v.t);
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
    // A liquidação anda com o financiamento: na margem isolada ele sai da margem.
    if (p.corretora) {
      if (e) reporMargem(e, p, ns);
      p.liquidacao = liquidacaoAgora(p);
    }
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
 * REPÕE A MARGEM ISOLADA do caixa até a liquidação voltar a ficar a
 * `FOLGA_LIQUIDACAO` além do stop de agora (`ns`) — o que se faz numa conta de
 * verdade (`/fapi/v1/positionMargin`), uma vez por hora. Sem caixa para tudo,
 * repõe o que der.
 *
 * Sem ela, com as regras da corretora, o Momento perdia 15 vendidas para a
 * liquidação, todas pelo FINANCIAMENTO: a vendida de uma moeda espremida paga
 * a taxa, a taxa sai da margem e a liquidação chega antes do stop. A DRIFT de
 * 02/04/2026 pagou 98% da margem em 4,8 dias e foi liquidada com o preço
 * CAINDO; a DEXE de 22/07/2026, 90% em 3,3 dias. Com ela: zero liquidações, e
 * +5.803% → +5.928% (dentro +212% → +216%, fora +1.552% → +1.565%).
 */
function reporMargem(e: EstadoRobo, p: PosicaoRobo, ns: number): void {
  if (!p.corretora) return;
  const comprado = p.lado === "long";
  const alvo = comprado ? ns - FOLGA_LIQUIDACAO * p.precoEntrada : ns + FOLGA_LIQUIDACAO * p.precoEntrada;
  const d = degrauPara(p.corretora.degraus, p.nocional);
  const q = p.nocional / p.precoEntrada;
  // A margem que sobra (depois do financiamento) para a liquidação estar no alvo.
  const precisa = comprado ? p.nocional - d.desconto - alvo * q * (1 - d.manutencao) : alvo * q * (1 + d.manutencao) - p.nocional - d.desconto;
  const falta = precisa - (p.margem - p.funding);
  if (!(falta > 0) || !(e.caixa > 0)) return;
  const poe = Math.min(falta, e.caixa);
  e.caixa -= poe;
  p.margem += poe;
}

/**
 * A liquidação de agora de uma posição com as regras da corretora: o degrau do
 * nocional e a margem que sobra depois do financiamento (positivo é custo).
 */
export function liquidacaoAgora(p: PosicaoRobo | PernaHedge): number {
  const degraus = p.corretora?.degraus ?? REGRAS_PADRAO.degraus;
  return liquidacaoIsolada(p.lado, p.precoEntrada, p.nocional, p.margem - p.funding, degrauPara(degraus, p.nocional));
}

/**
 * A metade de hedge numa vela: o financiamento até a abertura, a liquidação
 * dela (a corretora fecha SÓ o hedge, que leva a própria margem, e o par segue
 * com a metade principal) e o preço de fechamento. Vela do hedge que falta é
 * hora sem negócio registrado: o preço fica o último visto.
 */
function andarHedge(h: PernaHedge, v: VelaRobo | undefined, cobrancas: readonly Cobranca[], t: number): void {
  if (h.liquidadaEm !== undefined) return;
  cobrar(h, cobrancas, t);
  if (!v || !(v.o > 0 && v.h > 0 && v.l > 0 && v.c > 0)) return;
  if (h.corretora) h.liquidacao = liquidacaoAgora(h);
  const tocaLiq = h.lado === "long" ? v.l <= h.liquidacao : v.h >= h.liquidacao;
  if (tocaLiq) {
    h.liquidadaEm = t + HORA;
    h.precoAtual = h.liquidacao;
    return;
  }
  h.precoAtual = v.c;
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
  const bruto = e.regras.tamanho * patrimonioA(e) * (p.piramide?.tamanho ?? 1) * escalaDoTamanho(e, v.t);
  const nocional = p.corretora && preco > 0 ? nocionalAceito(bruto, preco, p.corretora) : bruto;
  const margem = nocional / alavancagem;
  // A posição inteira precisa caber, nessa alavancagem, no degrau do tamanho novo.
  const cabe = !p.corretora || alavancagem <= degrauPara(p.corretora.degraus, p.nocional + nocional).alavancagemMaxima;
  if (!(nocional >= NOCIONAL_MINIMO) || !(margem <= e.caixa) || !(preco > 0) || !cabe) {
    e.recusadas++;
    return;
  }
  e.caixa -= margem;
  const quantidade = p.nocional / p.precoEntrada + nocional / preco;
  p.nocional += nocional;
  p.margem += margem;
  p.precoEntrada = p.nocional / quantidade;
  if (p.corretora) {
    p.liquidacao = liquidacaoAgora(p);
  } else {
    const distLiq = 1 / alavancagem - MANUTENCAO;
    p.liquidacao = comprado ? p.precoEntrada * (1 - distLiq) : p.precoEntrada * (1 + distLiq);
  }
  p.stop = comprado ? Math.max(p.stop, p.liquidacao * 1.01) : Math.min(p.stop, p.liquidacao * 0.99);
  p.parcelas = (p.parcelas ?? 1) + 1;
}

/**
 * Fecha a posição e devolve o trade. Liquidada perde a margem inteira, e só
 * ela; nas outras saídas o resultado é a variação de preço sobre o nocional,
 * menos o custo dos dois lados e o financiamento — e também nunca passa da
 * margem, que é o teto da perda em margem isolada.
 */
export function fechar(
  e: EstadoRobo,
  p: PosicaoRobo,
  s: Saida,
  /** O preço do hedge na saída; sem ele, o último visto. */
  precoHedge?: number,
): TradeRobo {
  const bruto = p.nocional * aFavor(p, s.preco) - 2 * p.nocional * p.custoLado - p.funding - (p.custoExtra ?? 0);
  const principal = s.motivo === "liquidada" ? -p.margem : Math.max(-p.margem, bruto);
  // A metade de hedge sai junto, no mesmo instante — com o mesmo teto de perda.
  let hedge: TradeRobo["hedge"];
  let margemHedge = 0;
  if (p.hedge) {
    const h = p.hedge;
    const saida = h.liquidadaEm !== undefined ? h.liquidacao : precoHedge !== undefined && precoHedge > 0 ? precoHedge : h.precoAtual;
    const r =
      h.liquidadaEm !== undefined
        ? -h.margem
        : Math.max(-h.margem, h.nocional * aFavor(h, saida) - 2 * h.nocional * h.custoLado - h.funding);
    margemHedge = h.margem;
    hedge = {
      symbol: h.symbol,
      precoEntrada: h.precoEntrada,
      precoSaida: saida,
      resultado: r,
      funding: h.funding,
      ...(h.liquidadaEm !== undefined ? { liquidada: true } : {}),
    };
  }
  const resultado = principal + (hedge?.resultado ?? 0);
  e.caixa += p.margem + margemHedge + resultado;
  e.abertas = e.abertas.filter((x) => x !== p);
  const t: TradeRobo = {
    symbol: p.symbol,
    lado: p.lado,
    abertaEm: p.abertaEm,
    fechadaEm: s.quando,
    precoEntrada: p.precoEntrada,
    precoSaida: s.preco,
    nocional: p.nocional,
    margem: p.margem + margemHedge,
    resultado,
    funding: p.funding,
    motivo: s.motivo,
    ...(p.manipulada ? { manipulada: true } : {}),
    ...(p.parcelas && p.parcelas > 1 ? { parcelas: p.parcelas } : {}),
    ...(p.livro !== undefined ? { livro: p.livro, custoLado: p.custoLado } : {}),
    ...(hedge ? { hedge } : {}),
  };
  e.fechadas.unshift(t);
  return t;
}

/** Patrimônio a estes preços (o último visto de cada posição quando faltar). */
export function patrimonioA(e: EstadoRobo, precos?: ReadonlyMap<string, number>): number {
  let v = e.caixa;
  for (const p of e.abertas) {
    const preco = precos?.get(p.symbol);
    const precoHedge = p.hedge ? precos?.get(p.hedge.symbol) : undefined;
    v += valorDaPosicao(p, preco !== undefined && preco > 0 ? preco : p.precoAtual, precoHedge);
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
 * O multiplicador do tamanho pelo alvo de volatilidade (`AlvoVolatilidade`).
 *
 * O patrimônio de cada virada de dia (00:00 UTC) é o último ponto da curva até
 * ela; o desvio é o dos `janelaDias` retornos diários até HOJE — só o que se
 * sabia na hora da decisão. Muda uma vez por dia, como na pesquisa, e vale para
 * as entradas e para as parcelas da pirâmide.
 */
export function escalaDoTamanho(e: EstadoRobo, quando: number): number {
  const a = e.regras.alvoVolatilidade;
  if (!a) return 1;
  const hoje = Math.floor(quando / DIA) * DIA;
  const marcas: (number | null)[] = [];
  let k = e.curva.length - 1;
  for (let d = 0; d <= a.janelaDias; d++) {
    const limite = hoje - d * DIA;
    while (k >= 0 && e.curva[k].t > limite) k--;
    if (k < 0) break;
    // Ponto de mais de 3 h antes da virada é dia em que o robô não rodou: fica
    // de fora, em vez de repetir o patrimônio e virar um retorno zero que
    // acalma a conta e aumenta a aposta.
    marcas.push(limite - e.curva[k].t <= 3 * HORA ? e.curva[k].patrimonio : null);
  }
  if (marcas.length < a.janelaDias + 1) return 1;
  let soma = 0;
  let soma2 = 0;
  let n = 0;
  for (let d = 0; d < a.janelaDias; d++) {
    const x = marcas[d];
    const y = marcas[d + 1];
    if (x === null || y === null) continue;
    const r = x / y - 1;
    if (!Number.isFinite(r)) continue;
    soma += r;
    soma2 += r * r;
    n++;
  }
  if (n <= 5) return 1;
  const media = soma / n;
  const variancia = soma2 / n - media * media;
  const desvio = variancia > 0 ? Math.sqrt(variancia) : 0;
  const escala = desvio > 0 ? a.anual / Math.sqrt(365) / desvio : a.maximo;
  return Math.min(a.maximo, Math.max(a.minimo, escala));
}

/** O número que ordena a perna: o retorno da janela, ou a fração comprada a mercado (`Perna.criterio`). */
function criterioDe(perna: Pick<Perna, "janelaDias" | "criterio">, l: LinhaRanking): number | null | undefined {
  return perna.criterio === "fluxo" ? l.fluxo?.[perna.janelaDias] : l.retorno[perna.janelaDias];
}

/**
 * O ranking da perna num dia, da melhor para a pior — as que mais subiram
 * primeiro no comprado, as que mais caíram primeiro no vendido (ou, no
 * critério "fluxo", as de menor fração comprada a mercado primeiro no
 * vendido) —, entre as que passam no volume e na idade e têm série que cubra a
 * janela.
 */
export function ordenar(
  regras: RegrasRobo,
  perna: Pick<Perna, "lado" | "janelaDias" | "criterio">,
  linhas: readonly LinhaRanking[],
): LinhaRanking[] {
  const elegiveis = linhas.filter((l) => {
    const r = criterioDe(perna, l);
    return (
      r !== null &&
      r !== undefined &&
      Number.isFinite(r) &&
      Number.isFinite(l.volume) &&
      l.volume >= regras.volumeMinimo &&
      (l.idadeDias === null || l.idadeDias >= regras.idadeMinimaDias)
    );
  });
  const ordem = elegiveis.sort((a, b) => (criterioDe(perna, a) as number) - (criterioDe(perna, b) as number));
  return perna.lado === "long" ? ordem.reverse() : ordem;
}

/**
 * As k moedas da perna num dia: as primeiras do ranking (`ordenar`).
 *
 * Com menos de 4k moedas elegíveis o dia não seleciona nada — ranking de
 * poucas é sorteio, e a pesquisa nunca operou assim.
 */
export function selecionar(regras: RegrasRobo, perna: Perna, linhas: readonly LinhaRanking[]): LinhaRanking[] {
  // O símbolo do hedge não entra na própria perna: vender ETH contra ETH é zero.
  const ordem = ordenar(regras, perna, linhas).filter((l) => l.symbol !== perna.hedge?.symbol);
  if (ordem.length < 4 * perna.k) return [];
  return ordem.slice(0, perna.k);
}

/** Menos moedas do que isto no ranking e a saída por posto espera: é a régua da pesquisa. */
const MINIMO_NO_RANKING = 20;

/**
 * As saídas por posto do dia, ANTES das entradas — o dinheiro delas volta ao
 * caixa a tempo da seleção. Sai a posição cuja moeda está no ranking da janela
 * com que entrou e caiu para além das `n` primeiras. A que não está no ranking
 * (sem série, volume abaixo do mínimo, a Binance não respondeu) FICA: "não
 * consegui ler" não é "caiu".
 */
export function sairPorPosto(
  e: EstadoRobo,
  linhas: readonly LinhaRanking[],
  precoDe: (symbol: string) => number | undefined,
  quando: number,
  /** Ver `abrir`: o custo do atraso, só na medição — a saída também espera o primeiro retrato. */
  custoExtra = 0,
): TradeRobo[] {
  const saidas: TradeRobo[] = [];
  const postos = new Map<string, Map<string, number>>();
  for (const p of [...e.abertas]) {
    if (!p.posto) continue;
    const chave = `${p.lado}:${p.posto.janelaDias}`;
    let posto = postos.get(chave);
    if (!posto) {
      const ordem = ordenar(e.regras, { lado: p.lado, janelaDias: p.posto.janelaDias, criterio: p.posto.criterio }, linhas);
      posto = new Map(ordem.length >= MINIMO_NO_RANKING ? ordem.map((l, k) => [l.symbol, k]) : []);
      postos.set(chave, posto);
    }
    const k = posto.get(p.symbol);
    if (k === undefined || k < p.posto.n) continue;
    const preco = precoDe(p.symbol);
    if (preco === undefined || !(preco > 0) || !Number.isFinite(preco)) continue;
    if (custoExtra > 0) p.custoExtra = (p.custoExtra ?? 0) + custoExtra * (p.nocional + (p.hedge?.nocional ?? 0));
    saidas.push(fechar(e, p, { preco, quando, motivo: "posto" }, p.hedge ? precoDe(p.hedge.symbol) : undefined));
  }
  return saidas;
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
  /** O preço, o volume e as regras da corretora do símbolo do hedge, quando a perna tem hedge. */
  hedge?: { preco: number; volume: number; corretora?: RegrasDaMoeda },
  /** O multiplicador do tamanho desta moeda (`Perna.porVolatilidade`); 1 sem ele. */
  multiplicador = 1,
  /** As regras da corretora para a moeda (`RegrasDaMoeda`); ausentes, o motor de antes de 09/10. */
  corretora?: RegrasDaMoeda,
): PosicaoRobo | null {
  if (e.abertas.some((p) => p.symbol === symbol)) return null;
  if (!(preco > 0) || !Number.isFinite(preco)) {
    e.recusadas++;
    return null;
  }
  // Par sem o preço do hedge não abre pela metade: vendido sozinho é outra aposta.
  if (perna.hedge && !(hedge && hedge.preco > 0 && Number.isFinite(hedge.preco) && Number.isFinite(hedge.volume))) {
    e.recusadas++;
    return null;
  }
  const pat = patrimonioA(e);
  const mult = Number.isFinite(multiplicador) && multiplicador > 0 ? multiplicador : 1;
  const bruto = e.regras.tamanho * mult * pat * escalaDoTamanho(e, quando);
  // Com as regras da corretora: a quantidade no passo dela, o mínimo dela, e a
  // margem que põe a liquidação depois do stop (`alavancagemSegura`).
  const nocional = corretora ? nocionalAceito(bruto, preco, corretora) : bruto;
  const alavancagem = corretora ? alavancagemSegura(perna.lado, perna.stop, perna.alavancagem, nocional, corretora.degraus) : perna.alavancagem;
  const margem = nocional / alavancagem;
  // O hedge tem o mesmo nocional, no passo e no mínimo do símbolo dele; não tem stop, só o teto do degrau.
  const hc = hedge?.corretora;
  const nocionalHedge = perna.hedge && hedge ? (hc ? nocionalAceito(nocional, hedge.preco, hc) : nocional) : 0;
  const alavancagemHedge = perna.hedge ? Math.min(perna.hedge.alavancagem, hc ? degrauPara(hc.degraus, nocionalHedge).alavancagemMaxima : Infinity) : 1;
  const margemHedge = perna.hedge ? nocionalHedge / alavancagemHedge : 0;
  if (!(nocional >= NOCIONAL_MINIMO) || (perna.hedge && !(nocionalHedge >= NOCIONAL_MINIMO)) || margem + margemHedge > e.caixa) {
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
    liquidacao: corretora
      ? liquidacaoIsolada(perna.lado, preco, nocional, margem, degrauPara(corretora.degraus, nocional))
      : comprado
        ? preco * (1 - distLiq)
        : preco * (1 + distLiq),
    melhor: preco,
    prazoAte: quando + perna.prazoH * HORA,
    funding: 0,
    ultimaVela: 0,
    fundingAte: quando,
    precoAtual: preco,
    ...(manipulada ? { manipulada: true } : {}),
    ...(perna.piramide && !perna.hedge
      ? {
          piramide: {
            precos: perna.piramide.niveis.map((n) => (comprado ? preco * (1 + n) : preco * (1 - n))),
            tamanho: perna.piramide.tamanho,
          },
        }
      : {}),
    // O atraso da medição vale para as duas metades do par: as duas ordens esperam o retrato.
    ...(custoExtra > 0 ? { custoExtra: custoExtra * (nocional + nocionalHedge) } : {}),
    ...(corretora ? { corretora } : {}),
    ...(perna.saidaPosto
      ? { posto: { janelaDias: perna.janelaDias, n: perna.saidaPosto, ...(perna.criterio ? { criterio: perna.criterio } : {}) } }
      : {}),
  };
  if (perna.hedge && hedge) {
    const ladoH: LadoRobo = comprado ? "short" : "long";
    const distH = 1 / perna.hedge.alavancagem - MANUTENCAO;
    p.hedge = {
      symbol: perna.hedge.symbol,
      lado: ladoH,
      precoEntrada: hedge.preco,
      nocional: nocionalHedge,
      margem: margemHedge,
      custoLado: custoPorLado(hedge.volume),
      liquidacao: hc
        ? liquidacaoIsolada(ladoH, hedge.preco, nocionalHedge, margemHedge, degrauPara(hc.degraus, nocionalHedge))
        : ladoH === "long"
          ? hedge.preco * (1 - distH)
          : hedge.preco * (1 + distH),
      funding: 0,
      fundingAte: quando,
      precoAtual: hedge.preco,
      ...(hc ? { corretora: hc } : {}),
    };
  }
  e.caixa -= margem + margemHedge;
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
 *
 * Antes de escolher, saem as que deixaram o posto (`sairPorPosto`): é a mesma
 * decisão, com o mesmo ranking, e o caixa delas já serve às entradas do dia.
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
  sairPorPosto(e, linhas, precoDe, quando, custoExtra);
  const abertas: PosicaoRobo[] = [];
  const pernas = [...e.regras.pernas].sort((a, b) => a.janelaDias - b.janelaDias);
  for (const perna of pernas) {
    // O preço e o volume do hedge saem do mesmo retrato; sem a linha dele, o par não abre.
    const linhaHedge = perna.hedge ? linhas.find((l) => l.symbol === perna.hedge?.symbol) : undefined;
    const hedge = perna.hedge
      ? { preco: precoDe(perna.hedge.symbol) ?? NaN, volume: linhaHedge?.volume ?? NaN, corretora: linhaHedge?.corretora }
      : undefined;
    const tamanhoDe = multiplicadorPelaVolatilidade(e.regras, perna, linhas);
    for (const l of selecionar(e.regras, perna, linhas)) {
      const p = abrir(e, perna, l.symbol, precoDe(l.symbol) ?? NaN, quando, l.volume, manipuladas?.has(l.symbol) ?? false, custoExtra, hedge, tamanhoDe(l), l.corretora);
      if (p) abertas.push(p);
    }
  }
  e.ultimaDecisao = Math.floor(quando / DIA) * DIA;
  return abertas;
}

/**
 * O multiplicador de `Perna.porVolatilidade` para cada moeda do dia: a mediana
 * do desvio entre as elegíveis da perna (as mesmas de `ordenar`) ÷ o desvio da
 * moeda, entre os limites. Perna sem a regra, dia sem nenhum desvio lido ou
 * moeda sem o seu: 1.
 */
export function multiplicadorPelaVolatilidade(
  regras: RegrasRobo,
  perna: Perna,
  linhas: readonly LinhaRanking[],
): (l: LinhaRanking) => number {
  const pv = perna.porVolatilidade;
  if (!pv) return () => 1;
  const desvios = ordenar(regras, perna, linhas)
    .map((l) => l.vol)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);
  if (desvios.length === 0) return () => 1;
  const mediana = desvios[Math.floor(desvios.length / 2)];
  return (l) => {
    const v = l.vol;
    if (typeof v !== "number" || !Number.isFinite(v) || !(v > 0)) return 1;
    return Math.min(pv.maximo, Math.max(pv.minimo, mediana / v));
  };
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
  realismo?: {
    escorregadaStop: number;
    custoAtraso: number;
    nocionalMinimo: number;
    /**
     * As regras da Binance (`RegrasDaMoeda`): de que dia é a tabela de degraus e,
     * por robô, a janela inteira sem elas e com elas, as liquidações e as
     * vendidas que precisaram de margem a mais.
     */
    corretora?: {
      em: string;
      robos: { id: string; semRegras: number; comRegras: number; liquidadas: number; vendidas: number; comMargemAMais: number }[];
    };
  };
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
