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
  /** Fração do supply parada em carteira de corretora. Nulo sem contrato. */
  floatCex: number | null;
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
 * O histórico diário, emendando arquivo mensal com diário.
 *
 * Os dois são necessários: o mensal só sai depois que o mês fecha, e sem os
 * diários a série termina no último dia 31. A emenda por data resolve a
 * sobreposição sem duplicar vela.
 */
async function historico(symbol: string) {
  const [mensais, diarios] = await Promise.all([
    Promise.all(mesesRecentes().map((m) => fetchCsv(monthlyKlineUrl(symbol, "1d", m)))),
    Promise.all(recentDays(4).map((d) => fetchCsv(dailyKlineUrl(symbol, "1d", d)))),
  ]);

  const porDia = new Map<number, ReturnType<typeof parseKlines>[0]>();
  for (const csv of [...mensais, ...diarios]) {
    if (!csv) continue;
    for (const bar of parseKlines(csv)) porDia.set(bar.time, bar);
  }
  return [...porDia.values()].sort((a, b) => a.time - b.time);
}

async function floatEmCorretora(
  chain: Chain,
  contract: string,
): Promise<number | null> {
  try {
    const info = await tokenInfo(chain, contract);
    const supply = toUnits(info.totalSupply, info.decimals);
    if (!(supply > 0)) return null;

    const saldos = await balancesOf(chain, contract, CARTEIRAS_CEX);
    let total = 0;
    for (const v of saldos.values()) total += toUnits(v, info.decimals);
    return total / supply;
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
  const [barras, floatCex] = await Promise.all([
    historico(token.symbol),
    token.contract ? floatEmCorretora(token.chain, token.contract) : Promise.resolve(null),
  ]);

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

  const { estagio, veredito } = classificar({
    queda,
    altaDesdeFundo,
    amplitude,
    diasDesdePico,
    floatCex,
  });

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
      forca: comSaida ? 3 : 2,
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
        `8,56 pontos abaixo do resto da amostra (p = 0,019), com 8 de 13 moedas concordando.`,
    };
  }

  if (vida.estagio === "ressuscitando" && podeVender) {
    return {
      vies: "short",
      forca: oiInflando ? 3 : floatAlto ? 3 : 2,
      titulo: oiInflando
        ? "Segundo ciclo devolvendo, e a alavancagem ainda subindo"
        : floatAlto
          ? "Segundo ciclo devolvendo, com a oferta já no livro"
          : "Segundo ciclo devolvendo",
      porque:
        `${pct(vida.altaDesdeFundo)} desde o fundo de ${vida.diasDesdePico} dias atrás. ` +
        `Eu lia isso como força e o dado diz o contrário: ressuscitando é a segunda pior fase, ` +
        `mediana de −1,2% em sete dias e −4,2% em catorze, 8,37 pontos abaixo do resto ` +
        `(p = 0,000), com 17 de 27 moedas concordando. Quem já quicou é quem devolve.` +
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
    return {
      vies: "long",
      forca: floatBaixo ? 3 : 2,
      titulo: "A que mais quica é a que acabou de derreter",
      porque:
        `${pct(vida.queda)} do topo de ${vida.diasDesdePico} dias e só ${pct(vida.altaDesdeFundo)} ` +
        `desde o fundo. Eu lia isso como cadáver e o dado diz que é a MELHOR fase adiante: ` +
        `mediana de +2,7% em sete dias e +9,2% em catorze, 8,23 pontos acima do resto ` +
        `(p = 0,000), com 16 de 22 moedas concordando. São ativos que revertem à média com ` +
        `violência, e vender aqui é apostar contra isso pagando financiamento.` +
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
    titulo: "Fase sem vantagem medida",
    porque:
      `${vida.estagio}: nas 6.236 observações medidas, esta fase não se separou da referência ` +
      `o bastante para sustentar um lado. O estágio diz onde a moeda está, não o que ela vai fazer.`,
  };
}
