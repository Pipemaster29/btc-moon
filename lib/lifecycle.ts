/**
 * Em que ponto da própria vida cada moeda está.
 *
 * O ciclo de `lib/setup.ts` responde "o topo está sendo montado agora?" olhando
 * horas. Este responde outra pergunta, de escala maior: esta moeda **já
 * aconteceu**? Porque a maior parte de uma lista de moedas manipuladas, em
 * qualquer momento, é composta de cadáveres — subiram, foram distribuídas e não
 * voltam. Tratá-las como oportunidade é o erro mais caro possível, tanto
 * comprando quanto vendendo: quem vende uma moeda que já caiu 80% está pagando
 * financiamento para capturar os últimos 20%.
 *
 * As duas medidas que separam tudo são independentes uma da outra:
 *
 *   QUEDA DESDE O TOPO  onde o preço está em relação à máxima do período.
 *   ALTA DESDE O FUNDO  onde está em relação à mínima DEPOIS daquela máxima.
 *
 * Uma moeda 60% abaixo do topo pode estar morta ou pode ter triplicado desde o
 * fundo — são estados opostos e a queda sozinha não os distingue. A BULLA está
 * 37% abaixo de uma máxima de 169 dias atrás e subiu 368% desde o fundo; o JCT
 * está 79% abaixo e subiu 2%. Só o primeiro número os igualaria.
 *
 * A amplitude do ciclo (máxima ÷ mínima) responde uma terceira coisa: se a
 * moeda chegou a ter um pump. Abaixo de três vezes não houve ciclo nenhum para
 * classificar, e forçar um estágio ali seria inventar história.
 */

import { fetchCsv, monthlyKlineUrl, dailyKlineUrl, recentDays } from "./datavision";
import { parseKlines } from "./derivatives";
import { balancesOf, tokenInfo, toUnits, type Chain } from "./onchain";
import { circulante, velas, type Circulante } from "./binance";
import { lerTecnica, type Tecnica } from "./tecnica";
import type { WatchedToken } from "./watchlist";

/**
 * As carteiras de corretora, que são as mesmas para qualquer token.
 *
 * Isto vale mais do que parece: são endereços externos, e endereço externo tem
 * o MESMO valor em toda rede EVM. Ou seja, dá para medir quanto do supply de
 * qualquer moeda está em corretora — na BNB Chain, na Base ou na Ethereum —
 * sem conhecer nenhuma carteira do projeto. É o único número on-chain
 * disponível para as quarenta moedas cujos donos ainda não foram mapeados.
 */
export const CARTEIRAS_CEX = [
  "0xF977814e90dA44bFA03b6295A0616a897441aceC",
  "0x73D8bD54F7Cf5FAb43fE4Ef40A62D390644946Db",
  "0x7FcBd9d429932A11884Cb5CE9c61055b369F56F7",
  "0x26209d9f0Dc3aC0129C3FB1bADaBFeb9eE728c66",
  "0x1AB4973a48dc892Cd9971ECE8e01DcC7688f8F23",
  "0x4982085C9e2F89F2eCb8131Eca71aFAD896e89CB",
];

export type Estagio =
  | "nunca subiu"
  | "subindo"
  | "no topo"
  | "caindo do topo"
  | "ressuscitando"
  | "exausta"
  | "em queda longa"
  | "de lado";

export interface Vida {
  symbol: string;
  ticker: string;
  estagio: Estagio;
  /** Máxima do período e quando foi. */
  pico: number;
  picoEm: string;
  diasDesdePico: number;
  /** preço ÷ pico − 1. */
  queda: number;
  /** preço ÷ mínima depois do pico − 1. */
  altaDesdeFundo: number;
  /** pico ÷ mínima do período: houve ciclo? */
  amplitude: number;
  preco: number;
  dias: number;
  /** Fração do supply parada em carteira de corretora. Nulo quando não dá para afirmar. */
  floatCex: number | null;
  /** O contrato lido representa a moeda inteira? Nulo quando não dá para saber. */
  contratoRepresenta: boolean | null;
  /** Supply circulante segundo o CoinMarketCap. */
  circulante: number | null;
  /**
   * Circulante × preço: o tamanho REAL da moeda.
   *
   * Não confundir com FDV, que multiplica o supply total e por isso conta como
   * valor o que ainda nem circula. Numa moeda com 27% de float, os dois números
   * diferem por quase quatro vezes, e é o market cap que diz quanto de valor
   * existe para ser destruído.
   */
  marketCap: number | null;
  /** Unlocks detectados na janela de 30 dias. */
  unlocks: { quando: number; variacao: number }[];
  /**
   * Circulante ÷ supply total: quanto da moeda realmente anda.
   *
   * É a condição de partida que todas as manipuladas compartilham. Com 27% do
   * supply circulando, como na BTW, três quartos da moeda são promessa de oferta
   * futura — e cada unlock converte um pedaço dessa promessa em oferta real.
   */
  floatToken: number | null;
  /**
   * Estrutura de preço: resistência mais próxima, distância da média, tendência.
   *
   * Entra como CONTEXTO e fica fora de `lerVies` de propósito. Passou pelo mesmo
   * crivo dos outros parâmetros e não sobreviveu em nenhuma configuração:
   * rompimento de tendência de baixa deu 24 casos em 6.236 — raro demais para
   * medir. Afrouxando para "fechou acima da máxima de 20 dias", a amostra subiu
   * para 237 e o efeito apareceu INVERTIDO — −5,2 pontos percentuais em sete
   * dias, ou seja, o rompimento falha — com p = 0,076 e 10 de 21 moedas
   * concordando, que é cara ou coroa. Dentro dos estágios também não separou.
   *
   * O resultado mais revelador é o mais silencioso: o giro de tendência de
   * verdade — romper a máxima vindo de dez dias abaixo da média — aconteceu TRÊS
   * vezes em 6.236 observações. Estas moedas não revertem tendência de baixa;
   * elas espetam e devolvem.
   *
   * Serve para saber onde há vendedor à frente e o quanto o preço esticou, o que
   * ajuda a decidir ONDE entrar. Não ajuda a decidir SE entrar.
   */
  tecnica: Tecnica | null;
  /**
   * O preço em que a leitura se inverte, e no que ela vira.
   *
   * Faltava, e a falta era concreta: o painel dizia "comprar" sem dizer até
   * onde. Como os estágios são definidos por limiares fechados sobre queda desde
   * o topo e alta desde o fundo, o preço que cruza esses limiares é uma conta,
   * não um palpite.
   *
   * A fronteira que importa é uma só, e ela serve aos dois lados: uma moeda
   * vira "ressuscitando" quando sobe 80% desde o fundo, e ressuscitando é venda
   * enquanto exausta é compra. Ou seja, o mesmo preço que encerra a compra é o
   * que abre a venda — não é um alvo escolhido, é onde a régua muda de lado.
   *
   * Isto NÃO é alvo de lucro nem stop. É o ponto em que esta leitura deixa de
   * valer; o que fazer com a posição continua sendo decisão de quem opera.
   */
  virada: { preco: number; para: Estagio; distancia: number } | null;
  veredito: string;
}

const MESES = 6;

function mesesRecentes(): string[] {
  const out: string[] = [];
  const cursor = new Date();
  cursor.setUTCDate(1);
  cursor.setUTCMonth(cursor.getUTCMonth() - MESES + 1);
  for (let i = 0; i < MESES; i++) {
    out.push(cursor.toISOString().slice(0, 7));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

/**
 * O histórico diário — ao vivo primeiro, arquivo depois.
 *
 * A ORDEM É O CONSERTO. Antes daqui saía só a emenda de arquivo mensal com
 * arquivo diário, e essa emenda tem um buraco estrutural: o mensal só é
 * publicado quando o mês FECHA e o diário cobre poucos dias, então todo dia 24
 * faltam vinte dias no meio da série de todas as moedas — sem nada na estrutura
 * de dados dizendo que falta.
 *
 * A BTW mostrou o tamanho do prejuízo. A máxima dela, 0,77888, caiu exatamente
 * dentro do buraco: o estágio lia 0,54489 como topo, calculava queda de -23%
 * quando a real era -46%, e datava o topo três dias atrás quando ele foi na
 * semana anterior. Todo o dump que a gente passou dias estudando era invisível
 * para a classificação que deveria estudá-lo. A amplitude saía 32,9x em vez de
 * 47,0x, e amplitude é metade da assinatura de moeda manipulada.
 *
 * Moeda recém-listada nem existia: a DOS estreou no perpétuo em 11/08, não tem
 * um único arquivo mensal, e devolvia 4 barras — abaixo do mínimo de 10, então
 * o ciclo de vida inteiro vinha nulo e ela aparecia no painel sem estágio,
 * sem motor e sem leitura.
 *
 * Os arquivos continuam aqui como reserva, para símbolo que a Binance não sirva
 * ao vivo, e como emenda para o passado além das 1500 velas.
 */
async function historico(symbol: string) {
  const [aoVivo, mensais, diarios] = await Promise.all([
    velas(symbol, "1d", 1500).catch(() => []),
    Promise.all(mesesRecentes().map((m) => fetchCsv(monthlyKlineUrl(symbol, "1d", m)))),
    Promise.all(recentDays(4).map((d) => fetchCsv(dailyKlineUrl(symbol, "1d", d)))),
  ]);

  const porDia = new Map<number, ReturnType<typeof parseKlines>[0]>();
  for (const csv of [...mensais, ...diarios]) {
    if (!csv) continue;
    for (const bar of parseKlines(csv)) porDia.set(bar.time, bar);
  }
  // Ao vivo entra por último e manda: onde os dois existem, o da praça é o que
  // não tem defasagem de publicação.
  for (const v of aoVivo) porDia.set(v.time, v);

  return [...porDia.values()].sort((a, b) => a.time - b.time);
}

/**
 * O supply lido no contrato representa o token, ou só um pedaço dele?
 *
 * Esta checagem faltava e o buraco era grande. Os dois testes de identificação —
 * preço batendo com o perpétuo e pool girando — passam tranquilamente num
 * contrato que é PONTE ou implantação secundária, porque token com ponte negocia
 * em paridade com o original. O ZEREBRO passou nos dois: o contrato dele na Base
 * tem 1,15 milhão de tokens enquanto circulam 1.000 milhões, ou seja, o que eu
 * estava lendo é um milésimo da moeda.
 *
 * A consequência não era cosmética. Todo número "% do supply" sai de uma divisão
 * pelo supply do contrato, e num fragmento essa divisão infla o resultado em
 * ordens de grandeza. Foi assim que a CAP apareceu com 88,72% do supply em
 * corretora — era 88,72% de um pedaço, não da moeda.
 *
 * O desempate é o circulante do CoinMarketCap, que vem de graça no endpoint de
 * open interest da Binance. Mas a comparação é de UM LADO SÓ, e errar isso
 * inverte o sentido:
 *
 *   contrato MENOR que o circulante   impossível para o token verdadeiro — não
 *                                     dá para circular mais do que existe. Logo,
 *                                     o contrato é ponte ou implantação
 *                                     secundária, e o que se lê nele é uma
 *                                     fração da moeda.
 *   contrato MAIOR que o circulante   normal, e é o próprio objeto de estudo: a
 *                                     BTW tem 10 bilhões no contrato e 2,7
 *                                     circulando, ou seja, 73% preso. É a
 *                                     condição de float pequeno que torna a
 *                                     manipulação barata.
 *
 * Na primeira versão eu cortei os dois lados e suprimi o float de dezenove
 * moedas — inclusive BTW, AKE e TAG, onde o contrato está certo e o excedente é
 * justamente a informação que interessa.
 *
 * A margem de 10% abaixo de 1 cobre defasagem de atualização do circulante, que
 * é publicado por terceiro e anda um passo atrás da rede.
 */
const COERENTE_MIN = 0.9;

export interface FloatOnChain {
  /** Fração do supply em corretora. Nulo quando não dá para afirmar. */
  fracao: number | null;
  supplyContrato: number;
  supplyCirculante: number | null;
  /** supply do contrato ÷ circulante. Longe de 1 = contrato é fragmento. */
  coerencia: number | null;
}

async function floatEmCorretora(
  chain: Chain,
  contract: string,
  circ: Circulante | null,
): Promise<FloatOnChain | null> {
  try {
    const info = await tokenInfo(chain, contract);
    const supply = toUnits(info.totalSupply, info.decimals);
    if (!(supply > 0)) return null;

    const saldos = await balancesOf(chain, contract, CARTEIRAS_CEX);
    let total = 0;
    for (const v of saldos.values()) total += toUnits(v, info.decimals);

    const coerencia = circ && circ.atual > 0 ? supply / circ.atual : null;
    const representa = coerencia === null || coerencia >= COERENTE_MIN;

    return {
      fracao: representa ? total / supply : null,
      supplyContrato: supply,
      supplyCirculante: circ?.atual ?? null,
      coerencia,
    };
  } catch {
    return null;
  }
}

/**
 * Classifica uma moeda. `precoVivo` vem do perpétuo ou da pool, e existe porque
 * o Data Vision publica o dia só depois que ele fecha: sem essa emenda, uma
 * moeda que fez a máxima hoje aparece como se estivesse de lado.
 */
export async function lerVida(
  token: WatchedToken,
  precoVivo: number,
): Promise<Vida | null> {
  const [barras, circ] = await Promise.all([
    historico(token.symbol),
    circulante(token.symbol).catch(() => null),
  ]);
  const onchain = token.contract
    ? await floatEmCorretora(token.chain, token.contract, circ)
    : null;
  const floatCex = onchain?.fracao ?? null;

  if (barras.length < 10) return null;

  const ticker = token.symbol.replace(/USDT$/, "");
  const preco = precoVivo > 0 ? precoVivo : barras[barras.length - 1].close;

  // O preço de agora entra como candidato a máxima e a mínima: sem isso, uma
  // moeda em máxima histórica hoje mediria a queda contra ela mesma de ontem.
  let pico = barras[0].high;
  let picoTempo = barras[0].time;
  for (const b of barras) {
    if (b.high > pico) {
      pico = b.high;
      picoTempo = b.time;
    }
  }
  const agora = Math.floor(Date.now() / 1000);
  if (preco > pico) {
    pico = preco;
    picoTempo = agora;
  }

  const depois = barras.filter((b) => b.time > picoTempo);
  const fundo = Math.min(preco, ...depois.map((b) => b.low));
  const minimo = Math.min(preco, ...barras.map((b) => b.low));

  const queda = preco / pico - 1;
  const altaDesdeFundo = fundo > 0 ? preco / fundo - 1 : 0;
  const amplitude = minimo > 0 ? pico / minimo : 1;
  const diasDesdePico = Math.round((agora - picoTempo) / 86400);

  const metricas = {
    queda,
    altaDesdeFundo,
    amplitude,
    diasDesdePico,
    floatCex,
  };
  const { estagio, veredito } = classificar(metricas);

  return {
    symbol: token.symbol,
    ticker,
    estagio,
    pico,
    picoEm: new Date(picoTempo * 1000).toISOString().slice(0, 10),
    diasDesdePico,
    queda,
    altaDesdeFundo,
    amplitude,
    preco,
    dias: barras.length,
    floatCex,
    contratoRepresenta:
      onchain?.coerencia == null ? null : onchain.fracao !== null,
    circulante: circ?.atual ?? null,
    marketCap: circ ? circ.atual * preco : null,
    floatToken:
      onchain && circ && onchain.supplyContrato > 0
        ? Math.min(circ.atual / onchain.supplyContrato, 1)
        : null,
    unlocks: (circ?.saltos ?? []).map((s) => ({ quando: s.quando, variacao: s.variacao })),
    tecnica: lerTecnica(
      barras.map((b) => ({ close: b.close, high: b.high, low: b.low })),
    ),
    virada: calcularVirada(estagio, metricas, preco, fundo, pico),
    veredito,
  };
}

export interface Metricas {
  queda: number;
  altaDesdeFundo: number;
  amplitude: number;
  diasDesdePico: number;
  floatCex: number | null;
}

/**
 * A regra, isolada de qualquer busca de dado.
 *
 * Fica exportada e pura de propósito: é isso que permite rodá-la sobre o passado
 * dia a dia sem tocar na rede, que é a única forma de saber se ela vale alguma
 * coisa. Regra que só roda no presente não tem como ser testada.
 */
export function classificar(m: Metricas): { estagio: Estagio; veredito: string } {
  const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;
  const cex =
    m.floatCex === null
      ? ""
      : ` O float em corretora é ${(m.floatCex * 100).toFixed(2)}% do supply.`;

  // Sem pump não há ciclo. Vale dizer antes de qualquer outra coisa, porque
  // todos os estágios seguintes pressupõem que houve um.
  if (m.amplitude < 3) {
    return {
      estagio: "nunca subiu",
      veredito:
        `Máxima e mínima do período separadas por só ${m.amplitude.toFixed(1)}x — não houve pump ` +
        `para classificar. Pode ser a moeda antes do ciclo ou simplesmente uma moeda parada.${cex}`,
    };
  }

  if (m.diasDesdePico <= 2 && m.queda >= -0.15) {
    return {
      estagio: "no topo",
      veredito:
        `Máxima há ${m.diasDesdePico === 0 ? "menos de um dia" : `${m.diasDesdePico} dia(s)`} e o preço ` +
        `a ${pct(m.queda)} dela. É onde a distribuição acontece, se for acontecer — o lugar de olhar ` +
        `a saída das baleias e o retorno da oferta para as corretoras.${cex}`,
    };
  }

  if (m.diasDesdePico <= 10 && m.queda <= -0.15) {
    return {
      estagio: "caindo do topo",
      veredito:
        `Topou há ${m.diasDesdePico} dias e já devolveu ${pct(m.queda)}. A queda é recente, então ` +
        `ainda não dá para saber se foi só desalavancagem ou se a moeda acabou. O que decide é o ` +
        `saldo nas corretoras: se subiu, houve entrega.${cex}`,
    };
  }

  // Duas moedas com a mesma queda podem estar em estados opostos. Esta é a que
  // encontrou comprador de novo.
  if (m.altaDesdeFundo >= 0.8 && m.diasDesdePico >= 15) {
    return {
      estagio: "ressuscitando",
      veredito:
        `${pct(m.queda)} do topo de ${m.diasDesdePico} dias atrás, mas ${pct(m.altaDesdeFundo)} desde ` +
        `o fundo. Alguém está comprando de novo. Segundo ciclo costuma ser mais curto e mais violento ` +
        `que o primeiro, porque o float que sobrou é menor.${cex}`,
    };
  }

  if (m.queda <= -0.6 && m.diasDesdePico >= 20 && m.altaDesdeFundo < 0.5) {
    return {
      estagio: "exausta",
      veredito:
        `${pct(m.queda)} do topo, que foi há ${m.diasDesdePico} dias, e só ${pct(m.altaDesdeFundo)} ` +
        `desde o fundo — não apareceu comprador novo. O ciclo aconteceu e terminou. Vender aqui é ` +
        `pagar financiamento para capturar o que sobrou.${cex}`,
    };
  }

  if (m.queda <= -0.25) {
    return {
      estagio: "em queda longa",
      veredito:
        `${pct(m.queda)} do topo de ${m.diasDesdePico} dias, com ${pct(m.altaDesdeFundo)} desde o ` +
        `fundo. Nem morreu nem voltou.${cex}`,
    };
  }

  if (m.diasDesdePico <= 10) {
    return {
      estagio: "subindo",
      veredito:
        `A ${pct(m.queda)} de uma máxima de ${m.diasDesdePico} dias, ${pct(m.altaDesdeFundo)} acima ` +
        `do fundo. Ainda subindo — e é a fase em que ficar vendido custa mais caro.${cex}`,
    };
  }

  return {
    estagio: "de lado",
    veredito: `A ${pct(m.queda)} do topo, sem direção definida.${cex}`,
  };
}

/**
 * O cruzamento: onde a moeda está na vida × o que ela está fazendo agora.
 *
 * Esta função foi REESCRITA depois de ser medida, e duas das regras estavam
 * invertidas. Vale registrar como, porque o erro era plausível e passaria
 * despercebido para sempre sem o teste.
 *
 * O raciocínio original era narrativo: moeda exausta já foi distribuída, logo
 * não sobe; moeda ressuscitando encontrou comprador, logo sobe. Soa certo e é
 * falso. Em 6.236 observações de 38 moedas, caminhando dia a dia e medindo sete
 * dias à frente:
 *
 *   EXAUSTA        +8,23 pontos percentuais acima do resto · p = 0,000
 *                  16 de 22 moedas sobem · mediana +2,7% em 7d, +9,2% em 14d
 *   RESSUSCITANDO  −8,37 pontos percentuais abaixo do resto · p = 0,000
 *                  17 de 27 moedas caem · mediana −1,2% em 7d, −4,2% em 14d
 *   NO TOPO        −8,56 pontos percentuais abaixo do resto · p = 0,019
 *                  8 de 13 moedas caem · mediana −8,3% em 7d
 *
 * O mecanismo, visto depois: estas moedas revertem à média com violência. A que
 * acabou de derreter é a que mais quica, e a que já quicou 200% é a que
 * devolve. Comprar o que caiu e vender o que subiu — o oposto de seguir a
 * narrativa de cada uma.
 *
 * O que continua valendo do desenho original é a REGRA DE TEMPO, e ela não é
 * sobre direção: durante um squeeze não se vende, porque entrar vendido no meio
 * de uma alta forçada é virar o combustível dela. Isso é sobre QUANDO, e o teste
 * não o contradiz.
 *
 * O que NÃO foi medido, e por isso não sustenta regra forte: squeeze e saída de
 * baleia dependem de liquidação e posição absoluta, que só a Gate publica e só
 * por cem horas. O float em corretora exige nó de arquivo e não existe na Base.
 * Onde essas entradas aparecem abaixo, elas ajustam a força — nunca a direção.
 */
export type Vies = "short" | "long" | "evitar" | "observar";

export interface Leitura {
  vies: Vies;
  titulo: string;
  porque: string;
  /** Quanto a leitura se sustenta, de 0 a 3. */
  forca: number;
  /**
   * Onde esta leitura deixa de valer, em português.
   *
   * Existe porque uma recomendação sem prazo nem fronteira não é acionável: quem
   * lê "comprar" precisa saber até quando, e o painel não dizia. Os estágios têm
   * limiares fechados, então tanto a fronteira de preço quanto o horizonte medido
   * são conta e não opinião.
   */
  ateQuando: string;
}

export interface SinaisAgora {
  moveKind: string | null;
  moveChange: number;
  whaleExiting: boolean;
  perpDominance: number;
  accountRatio: number;
  whaleRatio: number;
  /** Variação do open interest em 72 horas. */
  oiChange72h: number;
  /** Open interest em dólar, para comparar com o tamanho da moeda. */
  openInterestUsd: number;
  /**
   * Quantos dos testes de "ainda há com que empurrar" passaram, e quantos deram
   * para medir. A compra numa moeda pequena e derretida depende de existir quem
   * a empurre — a assimetria de 5,5 para 1 é do passado recente, e ela seca
   * junto com o interesse.
   */
  motores: number;
  motoresMedidos: number;
}

/**
 * O preço que muda o estágio, achado pelos mesmos limiares que o definem.
 *
 * Só existe para as fases em que a fronteira é acionável. Em "no topo" ou
 * "caindo do topo" o estágio muda por passagem de TEMPO e não de preço, e
 * inventar um nível ali seria fingir precisão.
 */
function calcularVirada(
  estagio: Estagio,
  m: Metricas,
  preco: number,
  fundo: number,
  pico: number,
): Vida["virada"] {
  // A fronteira dos 80% desde o fundo separa compra de venda: acima dela a
  // moeda é "ressuscitando", que mede −1,2% em sete dias; abaixo, se caiu o
  // bastante, é "exausta", que mede +2,7%.
  if (estagio === "exausta" && fundo > 0) {
    const alvo = fundo * 1.8;
    if (alvo > preco) {
      return { preco: alvo, para: "ressuscitando", distancia: alvo / preco - 1 };
    }
  }

  if (estagio === "ressuscitando" && fundo > 0) {
    const alvo = fundo * 1.8;
    if (alvo < preco) {
      // Abaixo da fronteira ela deixa de ser venda: vira queda longa ou exausta,
      // conforme o quanto já caiu do topo.
      const para: Estagio = m.queda <= -0.6 && m.diasDesdePico >= 20 ? "exausta" : "em queda longa";
      return { preco: alvo, para, distancia: alvo / preco - 1 };
    }
  }

  if (estagio === "em queda longa" && fundo > 0) {
    const alvo = fundo * 1.8;
    if (alvo > preco) {
      return { preco: alvo, para: "ressuscitando", distancia: alvo / preco - 1 };
    }
  }

  if (estagio === "nunca subiu" && pico > 0) {
    // Sai de "nunca subiu" quando a amplitude do ciclo passa de 3x. Como o pico
    // acompanha o preço numa alta, o gatilho é o preço triplicar a mínima.
    const minimo = m.amplitude > 0 ? pico / m.amplitude : 0;
    const alvo = minimo * 3;
    if (alvo > preco) {
      return { preco: alvo, para: "subindo", distancia: alvo / preco - 1 };
    }
  }

  return null;
}

/**
 * O horizonte em que o efeito foi medido, e o que ele mediu.
 *
 * Sem isto, "comprar" fica sem prazo — e um efeito de sete dias lido como tese
 * de meses vira outra coisa. Os números vêm do backtest caminhado, e são
 * medianas do ativo: não têm custo de financiamento nem spread embutidos, e a
 * dispersão em volta delas é enorme.
 */
const HORIZONTE: Partial<Record<Estagio, string>> = {
  exausta: "a fase mede +2,7% em sete dias e +9,2% em catorze",
  ressuscitando: "a fase mede −1,2% em sete dias e −4,2% em catorze",
  "no topo": "a fase mede −8,3% em sete dias",
  "nunca subiu": "a fase mede +1,3% em sete dias, perto da referência",
};

function textoAteQuando(vida: Vida): string {
  const partes: string[] = [];

  const medida = HORIZONTE[vida.estagio];
  if (medida) partes.push(`O efeito foi medido em sete e catorze dias — ${medida}.`);

  if (vida.virada) {
    const sobe = vida.virada.distancia > 0;
    partes.push(
      `A leitura vira em US$ ${vida.virada.preco.toPrecision(4)}, ` +
        `${Math.abs(vida.virada.distancia * 100).toFixed(0)}% ${sobe ? "acima" : "abaixo"} daqui: ` +
        `nesse preço a moeda passa a ser "${vida.virada.para}", e a régua muda de lado. ` +
        `Não é alvo nem stop — é onde esta leitura deixa de valer.`,
    );
  } else {
    partes.push(
      `Esta fase muda por passagem de tempo, não por preço, então não há nível que a encerre. ` +
        `O retrato é refeito a cada trinta minutos e a leitura se corrige sozinha.`,
    );
  }

  return partes.join(" ");
}

function textoUnlock(u: { quando: number; variacao: number }): string {
  const dias = Math.round((Date.now() - u.quando) / 86400_000);
  return (
    `O supply circulante saltou ${(u.variacao * 100).toFixed(0)}% há ${dias} dia(s) — unlock. ` +
    `Quem recebeu não tinha o token e passou a ter, e boa parte vende com pressa; ` +
    `na BTW o salto foi de 23% três dias antes da máxima.`
  );
}

export function lerVies(vida: Vida, agora: SinaisAgora): Leitura {
  const forcada = agora.moveKind === "squeeze" || agora.moveKind === "alavancagem";

  // Open interest inflando: o único parâmetro que sobreviveu à busca.
  //
  // Nove candidatos foram testados sobre 4.948 observações com dados de
  // posicionamento — baleias reduzindo, varejo comprado, agressão vendedora,
  // divergência. Quase todos morreram: ou o efeito era pequeno demais, ou o p
  // não sobrevivia à correção por nove tentativas, ou — o caso mais traiçoeiro —
  // o p era ótimo e a concordância entre moedas era cara ou coroa, sinal de
  // resultado puxado por duas ou três moedas com muitas observações.
  //
  // O que sobrou foi este, e só DENTRO de duas fases:
  //
  //   caindo do topo  −16,3 p.p. em sete dias · p = 0,040 · 7 de 7 moedas
  //   ressuscitando    −6,7 p.p. em sete dias · p = 0,026 · 9 de 14 moedas
  //
  // O mecanismo se lê sozinho: uma moeda que já saiu do topo e cujo open
  // interest ESTÁ CRESCENDO tem gente montando posição nova, alavancada, contra
  // a tendência. Esse tipo de posição não sustenta preço — ela vira oferta
  // quando é desmontada.
  //
  // Fora dessas duas fases ele não acrescenta: em "no topo" mede 0,8 p.p. e em
  // "exausta" o p é 0,499. Por isso ele ajusta a força de duas regras em vez de
  // virar regra própria.
  const oiInflando = Number.isFinite(agora.oiChange72h) && agora.oiChange72h >= 0.2;

  // O tamanho da moeda, que faltava e mudava a resposta.
  //
  // A observação veio de fora: "a BULLA dá short mas tem 18 milhões de market
  // cap, não deve cair quase nada mais". Medido dentro de "ressuscitando", que é
  // exatamente onde os shorts estavam sendo chamados:
  //
  //   market cap ≥ 100 mi   −12,6% em sete dias contra −0,5% do resto da fase
  //                         −12,2 p.p. · p = 0,000 · 7 de 8 moedas concordando
  //   market cap ≤ 30 mi    +3,3% contra −1,9%
  //                         +5,2 p.p. · p = 0,000 · 8 de 12 moedas concordando
  //
  // Ou seja: dentro da MESMA fase, as grandes derretem e as pequenas sobem. Os
  // shorts que eu estava chamando — BULLA com 19 milhões, EVAA com 13,8 — eram
  // os do lado errado de um efeito forte e consistente. Uma moeda que já caiu
  // 90% e vale 19 milhões não tem de onde tirar mais 30%: sobra risco e falta
  // prêmio.
  //
  // Os dois cortes vêm dos limiares testados. A faixa entre 30 e 100 milhões não
  // foi medida, e por isso não decide nada — nela a leitura cai para o que os
  // outros sinais disserem.
  //
  // O tamanho NÃO é simétrico, e a mediana escondia isso. Medindo as caudas em
  // sete dias, que é o que importa numa moeda fácil de empurrar:
  //
  //   até 30 mi        21,2% das vezes sobe 20% · 8,5% cai 20% · assimetria 2,51
  //                    e a cauda de −35% é de só 2,2%
  //   100 a 300 mi     26,5% sobe 20% · 21,4% CAI 20% · assimetria 1,24
  //                    e a cauda de −35% é de 9,1%, quatro vezes maior
  //
  // Dentro de "exausta", que é a fase de compra, a separação é ainda mais
  // limpa: até 30 milhões dá 21,0% de altas de 20% contra 3,8% de quedas de
  // 20% — assimetria de 5,54. Moeda pequena que já caiu é fácil de empurrar
  // para cima e não tem de onde cair muito mais.
  //
  // As duas faixas se separam sozinhas, e cada uma serve a um lado: a de 100 a
  // 300 milhões é onde vender, a de até 30 é onde comprar. É a mesma medida
  // mudando de sinal conforme a direção — que é exatamente o oposto de tratar
  // "market cap baixo" como bom ou ruim em geral.
  const GRANDE = 100e6;
  const PEQUENA = 30e6;
  const mcap = vida.marketCap;
  const grande = mcap !== null && mcap >= GRANDE;
  const pequena = mcap !== null && mcap <= PEQUENA;
  const dinheiro = (v: number) =>
    v >= 1e9 ? `US$ ${(v / 1e9).toFixed(2)} bi` : `US$ ${(v / 1e6).toFixed(0)} mi`;

  // Unlock recente: oferta nova chegando por decreto, não por venda.
  //
  // Todas as moedas manipuladas partilham a mesma condição de partida — float
  // pequeno, maior parte do supply presa. Com o livro fino, pouco dinheiro move
  // muito preço, e é isso que torna a manipulação barata. O unlock desfaz
  // exatamente essa condição: o circulante salta, quem recebeu não tinha o
  // token e passa a ter, e quem recebe de graça vende com pressa.
  //
  // Na BTW o circulante subiu 23,1% em 14/08 — três dias antes da máxima e da
  // queda de 50%. O evento é observável e datável, e não depende de ler carteira
  // nenhuma: vem do supply circulante publicado a cada dia.
  //
  // Fica como AJUSTE DE FORÇA e não como regra própria, pelo mesmo motivo de
  // sempre: a janela de trinta dias que a Binance devolve dá poucos eventos, e
  // eu não tenho como medir o efeito com o rigor que os estágios receberam.
  const unlockRecente = vida.unlocks.find(
    (u) => u.variacao >= 0.05 && Date.now() - u.quando <= 21 * 86400_000,
  );
  const perpManda = agora.perpDominance >= 50;
  const floatAlto = vida.floatCex !== null && vida.floatCex >= 0.15;
  const floatBaixo = vida.floatCex !== null && vida.floatCex < 0.02;
  const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;

  // A regra de tempo vem antes de tudo, porque ela não discute direção: durante
  // uma alta forçada, vender é alimentar o squeeze, esteja a moeda no estágio
  // que estiver. O momento é depois que os vendidos acabam.
  const podeVender = !(forcada && agora.moveChange > 0);

  // ------------------------------------------------------------------ short
  if (vida.estagio === "no topo" && podeVender) {
    const comSaida = agora.whaleExiting;
    return {
      vies: "short",
      forca: comSaida || unlockRecente ? 3 : 2,
      ateQuando: textoAteQuando(vida),
      titulo: comSaida
        ? "Máxima fresca com dinheiro grande saindo"
        : "Máxima fresca — o estágio que mais cai",
      porque:
        `Topo de ${vida.diasDesdePico} dia(s), preço a ${pct(vida.queda)} dele. ` +
        (comSaida
          ? `As contas grandes estão desmontando comprado com o preço ainda em cima — a sequência ` +
            `exata da BTW em 19/08, saída às 09h e queda de 50% seis horas depois. `
          : "") +
        `Medido: das oito fases, esta é a de pior retorno adiante — mediana de −8,3% em sete dias, ` +
        `8,56 pontos abaixo do resto da amostra (p = 0,019), com 8 de 13 moedas concordando.` +
        (unlockRecente ? ` ${textoUnlock(unlockRecente)}` : ""),
    };
  }

  if (vida.estagio === "ressuscitando" && podeVender) {
    // Pequena demais: a fase é de queda, mas o tamanho inverte o resultado.
    if (pequena) {
      return {
        vies: "observar",
        forca: 1,
        ateQuando: textoAteQuando(vida),
        titulo: "Fase de devolver, mas pequena demais para valer o short",
        porque:
          `${pct(vida.altaDesdeFundo)} desde o fundo, e a fase mede −1,2% em sete dias. Mas com ` +
          `${dinheiro(mcap!)} de market cap ela está do lado errado do tamanho: dentro desta mesma ` +
          `fase, moedas abaixo de 30 milhões medem +3,3% contra −1,9% das demais — 5,2 pontos ` +
          `acima (p = 0,000), com 8 de 12 moedas concordando. Quem já caiu 90% e vale 19 milhões ` +
          `não tem de onde tirar mais 30%: sobra risco de squeeze e falta prêmio.`,
      };
    }

    return {
      vies: "short",
      forca: grande ? 3 : oiInflando || floatAlto ? 2 : 1,
      ateQuando: textoAteQuando(vida),
      titulo: grande
        ? "Segundo ciclo devolvendo, e com tamanho para cair"
        : oiInflando
          ? "Segundo ciclo devolvendo, e a alavancagem ainda subindo"
          : floatAlto
            ? "Segundo ciclo devolvendo, com a oferta já no livro"
            : "Segundo ciclo devolvendo",
      porque:
        `${pct(vida.altaDesdeFundo)} desde o fundo de ${vida.diasDesdePico} dias atrás. ` +
        `Ressuscitando é a segunda pior fase: mediana de −1,2% em sete dias e −4,2% em catorze, ` +
        `8,37 pontos abaixo do resto (p = 0,000), com 17 de 27 moedas concordando. Quem já quicou ` +
        `é quem devolve.` +
        (grande
          ? ` E o tamanho está a favor: com ${dinheiro(mcap!)}, ela cai na faixa que mede −12,6% ` +
            `em sete dias dentro desta fase, contra −0,5% das menores — 12,2 pontos de diferença ` +
            `(p = 0,000), com 7 de 8 moedas concordando.`
          : mcap !== null
            ? ` O market cap de ${dinheiro(mcap)} fica na faixa entre 30 e 100 milhões, que não foi ` +
              `medida — o tamanho aqui não decide nada.`
            : "") +
        (unlockRecente ? ` ${textoUnlock(unlockRecente)}` : "") +
        (oiInflando
          ? ` E o open interest subiu ${(agora.oiChange72h * 100).toFixed(0)}% em 72h: nesta fase, ` +
            `isso separou −6,7 pontos em sete dias (p = 0,026), com 9 de 14 moedas concordando.`
          : "") +
        (floatAlto
          ? ` E ${((vida.floatCex ?? 0) * 100).toFixed(0)}% do supply está parado em corretora, ` +
            `pronto para virar venda.`
          : ""),
    };
  }

  // A fase "caindo do topo" sozinha NÃO é de venda — mede +4,7% em sete dias, e
  // vender ali seria apostar contra a base. Ela só vira venda quando o open
  // interest está inflando, e aí a diferença é a maior de toda a busca.
  if (vida.estagio === "caindo do topo" && oiInflando && podeVender) {
    return {
      vies: "short",
      forca: 3,
      ateQuando: textoAteQuando(vida),
      titulo: "Já saiu do topo e ainda está montando alavancagem",
      porque:
        `${pct(vida.queda)} do topo de ${vida.diasDesdePico} dias, e o open interest subiu ` +
        `${(agora.oiChange72h * 100).toFixed(0)}% em 72 horas. Gente montando posição nova contra ` +
        `a tendência não sustenta preço — vira oferta quando desmonta. É a separação mais forte ` +
        `de toda a busca: mediana de −11,9% em sete dias contra +4,4% das outras da mesma fase, ` +
        `16,3 pontos de diferença (p = 0,040), com as 7 moedas da amostra concordando. ` +
        `Sem o open interest inflando esta fase mede +4,7% e não é de venda.`,
    };
  }

  // ------------------------------------------------------------------- long
  if (vida.estagio === "exausta") {
    // Sem motor não há assimetria. Uma moeda pequena e derretida sobe porque
    // alguém a empurra; se não há perpétuo com tamanho, nem livro que gire, nem
    // oferta fora das corretoras, o que resta é uma moeda barata e parada.
    if (agora.motoresMedidos > 0 && agora.motores === 0) {
      return {
        vies: "observar",
        forca: 1,
        ateQuando: textoAteQuando(vida),
        titulo: "Derretida, mas sem nada que a empurre",
        porque:
          `${pct(vida.queda)} do topo, e a fase normalmente compraria. Mas nenhum dos ` +
          `${agora.motoresMedidos} testes de capacidade passou: sem perpétuo com tamanho, sem pool ` +
          `que gire, sem oferta fora das corretoras. A assimetria de 5,5 para 1 que sustenta essa ` +
          `compra é do passado recente destas moedas, e ela seca junto com o interesse — moeda ` +
          `barata e parada continua barata e parada.`,
      };
    }

    // Pequena e exausta é a melhor assimetria de toda a amostra.
    // Unlock recente é a única coisa que segura esta regra. A reversão à média
    // pressupõe que a oferta parou de crescer; com lote novo destravando, ela
    // não parou.
    if (unlockRecente) {
      return {
        vies: "observar",
        forca: 1,
        ateQuando: textoAteQuando(vida),
        titulo: "Fase de quicar, mas com oferta nova entrando",
        porque:
          `${pct(vida.queda)} do topo, e a fase mede +2,7% em sete dias — normalmente compraria. ` +
          `${textoUnlock(unlockRecente)} Isso desfaz a premissa: a reversão à média supõe que a ` +
          `oferta parou de crescer, e ela não parou.`,
      };
    }
    return {
      vies: "long",
      forca: pequena || floatBaixo ? 3 : 2,
      ateQuando: textoAteQuando(vida),
      titulo: pequena
        ? "Pequena e derretida — a melhor assimetria da amostra"
        : "A que mais quica é a que acabou de derreter",
      porque:
        `${pct(vida.queda)} do topo de ${vida.diasDesdePico} dias e só ${pct(vida.altaDesdeFundo)} ` +
        `desde o fundo. Eu lia isso como cadáver e o dado diz que é a MELHOR fase adiante: ` +
        `mediana de +2,7% em sete dias e +9,2% em catorze, 8,23 pontos acima do resto ` +
        `(p = 0,000), com 16 de 22 moedas concordando. São ativos que revertem à média com ` +
        `violência, e vender aqui é apostar contra isso pagando financiamento.` +
        (pequena
          ? ` E o tamanho joga a favor: com ${dinheiro(mcap!)}, ela está na faixa em que 21,0% ` +
            `das semanas sobem mais de 20% contra 3,8% que caem mais de 20% — assimetria de 5,5 ` +
            `para 1, a melhor da amostra. Moeda pequena que já caiu é fácil de empurrar para cima ` +
            `e não tem de onde cair muito mais.`
          : "") +
        (floatBaixo
          ? ` Com só ${((vida.floatCex ?? 0) * 100).toFixed(2)}% do supply em corretora, ` +
            `quase não há oferta pronta para atrapalhar.`
          : ""),
    };
  }

  if (vida.estagio === "nunca subiu" && floatBaixo) {
    return {
      vies: "long",
      forca: 1,
      ateQuando: textoAteQuando(vida),
      titulo: "Antes do ciclo, com pouca oferta no livro",
      porque:
        `Amplitude de só ${vida.amplitude.toFixed(1)}x: o pump não aconteceu. Com ` +
        `${((vida.floatCex ?? 0) * 100).toFixed(2)}% do supply em corretora o livro está fino, ` +
        `que é a condição para pouco dinheiro mover muito preço. A fase mede +1,3% em sete dias, ` +
        `perto da referência — não é sinal de que vai acontecer, é de que pode.`,
    };
  }

  // ----------------------------------------------------------------- evitar
  if (forcada && agora.moveChange > 0) {
    return {
      vies: "evitar",
      forca: 2,
      ateQuando: textoAteQuando(vida),
      titulo: "Squeeze em andamento — espere ele acabar",
      porque:
        `A alta de ${pct(agora.moveChange)} é ${agora.moveKind}, e entrar vendido no meio dela é ` +
        `virar o combustível. Isto é sobre QUANDO, não sobre direção: a fase da moeda ` +
        `(${vida.estagio}) continua valendo, mas o momento de agir é depois que os vendidos ` +
        `acabam.` +
        (perpManda
          ? ` O open interest vale ${agora.perpDominance.toFixed(0)}x a pool à vista, ou seja, ` +
            `o preço aqui é feito por aposta e não por compra — o estouro pode ir longe.`
          : ""),
    };
  }

  // --------------------------------------------------------------- observar
  return {
    vies: "observar",
    forca: 0,
    ateQuando: textoAteQuando(vida),
    titulo: "Fase sem vantagem medida",
    porque:
      `${vida.estagio}: nas 6.236 observações medidas, esta fase não se separou da referência ` +
      `o bastante para sustentar um lado. O estágio diz onde a moeda está, não o que ela vai fazer.`,
  };
}
