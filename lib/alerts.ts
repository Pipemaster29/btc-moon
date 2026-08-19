/**
 * Detecção do que merece acordar alguém.
 *
 * Um alerta que dispara à toa é pior do que nenhum: depois de três falsos o
 * aviso vira ruído e o verdadeiro passa batido. Por isso cada regra aqui foi
 * escolhida por ter MECANISMO — algo que precisa acontecer antes da venda — e
 * não por ser fácil de medir.
 *
 * A hierarquia é por antecedência, não por tamanho:
 *
 *   GÁS CHEGANDO      minutos de aviso. Uma carteira sem BNB não consegue mover
 *                     token nenhum; abastecer é passo obrigatório antes de
 *                     vender, e ninguém abastece por acaso uma carteira que
 *                     está parada há semanas com milhões dentro.
 *   TRANSFERÊNCIA DE  ~15 minutos de aviso. No movimento de 16/08 saíram 66 e
 *   TESTE             120 BTW antes dos 8 e 12 milhões, com 13 e 16 minutos de
 *                     intervalo. Quem vai mover US$ 4 milhões confere o
 *                     endereço antes — e esse teste é visível.
 *   TRAVA SE MEXENDO  84,94% do supply está em contrato. Qualquer saída dali é
 *                     o evento mais grave possível para o preço.
 *   FRIA → QUENTE     horas de aviso. Carteira fria não vende; ela abastece a
 *                     quente, que vende.
 *   ENTRADA EM        a venda em si, chegando ao livro.
 *   CORRETORA
 *
 * O que NÃO virou regra: queda de preço, volume alto, variação de open interest
 * isolada. São consequências, não avisos — quando aparecem, já aconteceu.
 */

import type { WalletRole } from "./watchlist";

/** Abaixo disso a carteira não paga nem uma transferência. */
export const GAS_FLOOR = 0.001;

/**
 * Quanto tempo cada tipo de alerta fica em silêncio depois de disparar.
 *
 * Não pode ser um número só, e errar isso cala o monitor sem quebrar nada — foi
 * o que aconteceu: seis horas para tudo, e uma carteira que movimentou US$ 1,9
 * milhão às 8h55 ficou muda até as 14h55 mesmo movimentando de novo.
 *
 * Os dois grupos precisam de janelas opostas:
 *
 *   POR TRANSFERÊNCIA  a identidade já é única por evento, mas a varredura
 *                      cobre 3 horas e o mesmo evento reaparece em dezenas de
 *                      ciclos. Precisa de janela MAIOR que a varredura.
 *   POR SALDO          a identidade é a carteira mais a ordem de grandeza, e o
 *                      saldo muda a cada movimento. Janela longa aqui significa
 *                      engolir movimentos novos e legítimos.
 */
export const QUIET_MINUTES: Record<AlertKind, number> = {
  // Estado, não evento: enquanto durar, repetir não acrescenta nada.
  "gas-arrived": 360,
  "cycle-top": 360,
  // Por transferência — maior que as 3 horas de varredura.
  "hot-to-cold": 240,
  "cold-to-hot": 240,
  "large-transfer": 240,
  "test-transfer": 240,
  "fresh-recipient": 240,
  // Estrutura do perpétuo: muda devagar e o aviso vale enquanto a perna durar.
  squeeze: 120,
  unwind: 120,
  "whale-exit": 180,
  // Por saldo — curta, para não calar movimento novo.
  "exchange-inflow": 45,
  "exchange-outflow": 45,
  "balance-drop": 45,
  "lock-outflow": 45,
};

export type AlertKind =
  | "gas-arrived"
  | "test-transfer"
  | "lock-outflow"
  | "cold-to-hot"
  | "hot-to-cold"
  | "exchange-inflow"
  | "exchange-outflow"
  | "balance-drop"
  | "fresh-recipient"
  | "large-transfer"
  | "cycle-top"
  | "squeeze"
  | "unwind"
  | "whale-exit";

export type Severity = "critical" | "high" | "medium";

export interface Alert {
  kind: AlertKind;
  severity: Severity;
  /** Identidade do alerta, para não repetir o mesmo aviso a cada ciclo. */
  fingerprint: string;
  title: string;
  detail: string;
  valueUsd: number;
  /**
   * Endereços envolvidos, do mais relevante ao menos.
   *
   * Ficam fora do texto de propósito: quem envia decide como mostrá-los, e no
   * Telegram viram link para o explorador da rede. Enfiar o endereço no meio da
   * frase deixaria a mensagem ilegível no celular e sem como clicar.
   */
  addresses: string[];
}

/** O que ficou guardado da rodada anterior. */
export interface WalletMemory {
  balance: number;
  bnb: number;
}

export interface Observation {
  address: string;
  label: string;
  role: WalletRole;
  balance: number;
  bnb: number;
}

export interface TransferSeen {
  from: string;
  to: string;
  amount: number;
  block: number;
  /** Rótulo do remetente, quando conhecido. */
  fromLabel: string;
  toLabel: string;
  /** true quando o destino nunca enviou nada — carteira recém-criada. */
  toIsFresh: boolean;
}

/** Uma leitura passada do saldo somado das corretoras. */
export interface ExchangePoint {
  time: number;
  total: number;
}

/**
 * A perna atual do perpétuo, já classificada.
 *
 * Chega pronta de `lib/positioning`. O tipo é redeclarado aqui em vez de
 * importado porque este arquivo roda também fora do Next, e importar de lá
 * arrastaria o módulo inteiro de rede junto.
 */
export interface PerpMove {
  kind: string;
  direction: "alta" | "queda";
  priceChange: number;
  oiChange: number;
  longLiqUsd: number;
  shortLiqUsd: number;
  forcedShare: number;
  note: string;
}

/**
 * O histórico do aviso, dito na própria mensagem.
 *
 * Vai junto de propósito: este é o único alerta aqui que tenta antecipar o topo
 * em vez de descrever o que já aconteceu, e quem recebe às três da manhã
 * precisa saber o quanto pode confiar nele sem ter que lembrar de nada.
 */
const PLACAR_WHALE_EXIT =
  "Placar medido: 6 episódios em BTW, GPS, PRL e LAB, com DOGE e SOL de controle. Em 24 horas, 3 caíram mais de 8% e 3 subiram; em 48 horas, 5 caíram e 1 subiu. Ou seja, quando erra costuma ser por chegar cedo, não por estar errado — mas a amostra é de 5 dias. É aviso, não veredito.";

/** Contas grandes desmontando posição comprada perto do topo. */
export interface WhaleExitSeen {
  share: number;
  peakNet: number;
  net: number;
  rally: number;
  fromHigh: number;
  fragile: boolean;
}

export interface DetectInput {
  /** Símbolo da moeda, para o alerta dizer de qual se trata. */
  symbol: string;
  /**
   * Série do saldo agregado das corretoras, do mais antigo ao mais recente.
   *
   * É a única entrada que exige memória longa, e é a mais valiosa: o topo de um
   * pump não se anuncia no preço, se anuncia aqui.
   */
  exchangeHistory?: ExchangePoint[];
  /** Nome do ativo que paga gás na rede — "BNB", "ETH". */
  gasSymbol: string;
  previous: Record<string, WalletMemory>;
  current: Observation[];
  transfers: TransferSeen[];
  priceUsd: number;
  /** Liquidez à vista, que dá a escala do que é "grande" nesta moeda. */
  liquidityUsd: number;
  /** A perna atual do perpétuo. Ausente quando a praça não lista o par. */
  perp?: PerpMove | null;
  /** Contas grandes saindo de comprado. Ausente quando não estão. */
  whaleExit?: WhaleExitSeen | null;
}

const money = (v: number) =>
  v >= 1e6 ? `US$ ${(v / 1e6).toFixed(1)} mi`
    : v >= 1e3 ? `US$ ${(v / 1e3).toFixed(0)} mil`
      : `US$ ${v.toFixed(0)}`;

const units = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(2)} bi`
    : v >= 1e6 ? `${(v / 1e6).toFixed(2)} mi`
      : v >= 1e3 ? `${(v / 1e3).toFixed(1)} mil`
        : v.toFixed(0);

/**
 * Ordem de grandeza do valor, para o identificador do alerta.
 *
 * Um movimento de US$ 30 mil e outro de US$ 3 milhões na mesma carteira são
 * eventos diferentes e os dois merecem aviso; dois de US$ 30 mil seguidos, não.
 * Agrupar por ordem de grandeza deixa o segundo passar e cala o repetido.
 */
function magnitude(valueUsd: number): number {
  return valueUsd > 0 ? Math.floor(Math.log10(valueUsd)) : 0;
}

export function detect(input: DetectInput): Alert[] {
  const { symbol, gasSymbol, previous, current, transfers, priceUsd, liquidityUsd } = input;
  const history = input.exchangeHistory ?? [];
  const alerts: Alert[] = [];

  // O que torna um movimento relevante é o tamanho dele contra o que o mercado
  // consegue absorver — ou seja, contra a LIQUIDEZ. Não contra o saldo de quem
  // enviou: uma corretora com US$ 6 milhões em carteira e uma pool de US$ 157
  // mil movimenta valores que são pequenos para ela e enormes para o preço.
  // Ancorar na carteira foi um erro que calou movimentos de 60% da pool inteira.
  //
  // Trinta por cento da pool é o ponto em que a venda não tem como passar
  // despercebida. O piso absoluto cobre moedas de liquidez ínfima, onde a
  // fração sozinha daria um limiar de poucos dólares.
  const bigUsd = Math.max(liquidityUsd * 0.3, 25_000);

  for (const wallet of current) {
    const before = previous[wallet.address.toLowerCase()];
    if (!before) continue;

    // ------------------------------------------------------- gás chegando
    if (
      before.bnb < GAS_FLOOR &&
      wallet.bnb >= GAS_FLOOR &&
      wallet.balance > 0 &&
      wallet.role !== "lock"
    ) {
      alerts.push({
        kind: "gas-arrived",
        severity: "critical",
        fingerprint: `gas:${wallet.address}`,
        title: `⛽ ${symbol} · ${wallet.label} foi abastecida com gás`,
        detail:
          `Estava com 0 ${gasSymbol} e agora tem ${wallet.bnb.toFixed(4)}. ` +
          `Segura ${units(wallet.balance)} (${money(wallet.balance * priceUsd)}) e agora CONSEGUE mover. ` +
          `Abastecer é o passo obrigatório antes de vender.`,
        valueUsd: wallet.balance * priceUsd,
        addresses: [wallet.address],
      });
    }

    // ------------------------------------------------------ saldo caindo
    const drop = before.balance - wallet.balance;
    const isLock = wallet.role === "lock";
    const isExchange = wallet.role === "exchange";
    // Trava não deveria se mexer nunca, então qualquer saída conta.
    const dropFloor = isLock ? 0 : bigUsd;

    if (drop > 0 && drop * priceUsd >= dropFloor) {
      alerts.push({
        kind: isLock ? "lock-outflow" : isExchange ? "exchange-outflow" : "balance-drop",
        severity: isLock ? "critical" : "high",
        // Sem o saldo no identificador: ele muda a cada ciclo, e incluí-lo fazia
        // a deduplicação nunca casar — a mesma carteira alertava para sempre.
        fingerprint: `out:${wallet.address}:${magnitude(drop * priceUsd)}`,
        title: isLock
          ? `🔓 ${symbol} · A TRAVA SE MEXEU — ${wallet.label}`
          : isExchange
            ? `📈 ${symbol} · ${units(drop)} SAÍRAM de ${wallet.label}`
            : `📤 ${symbol} · ${wallet.label} enviou ${units(drop)}`,
        detail: isLock
          ? `Saíram ${units(drop)} (${money(drop * priceUsd)}) de um contrato de trava. ` +
            `Era supply que não circulava e agora circula. É o evento mais grave possível para o preço.`
          : isExchange
            // Saída de corretora é o OPOSTO de entrada, e confundir os dois
            // inverte a leitura: token saindo do livro é oferta sendo retirada.
            // Quando isso é sistemático, o efeito é choque de oferta e o preço
            // sobe — foi o que aconteceu na BTW enquanto este aviso ainda
            // tratava toda saída de saldo como evento neutro.
            ? `${money(drop * priceUsd)} deixaram o livro de ${wallet.label}. ` +
              `Token saindo de corretora é oferta sendo RETIRADA do mercado — o contrário ` +
              `de token chegando para ser vendido. Retirada sistemática aperta a oferta e ` +
              `empurra o preço para cima; para quem está vendido, é o combustível do squeeze.`
            : `Saldo caiu de ${units(before.balance)} para ${units(wallet.balance)}. ` +
              `São ${money(drop * priceUsd)} saindo desta carteira.`,
        valueUsd: drop * priceUsd,
        addresses: [wallet.address],
      });
    }

    // ------------------------------------------- entrada em corretora
    const rise = wallet.balance - before.balance;

    if (wallet.role === "exchange" && rise * priceUsd >= bigUsd) {
      alerts.push({
        kind: "exchange-inflow",
        severity: "high",
        fingerprint: `in:${wallet.address}:${magnitude(rise * priceUsd)}`,
        title: `🏦 ${symbol} · ${units(rise)} entraram em ${wallet.label}`,
        detail:
          `${money(rise * priceUsd)} chegaram a uma carteira de corretora. ` +
          `Token indo para corretora costuma ser o passo anterior à venda no livro.`,
        valueUsd: rise * priceUsd,
        addresses: [wallet.address],
      });
    }
  }

  // ------------------------------------------------------ choque de oferta
  //
  // As regras acima olham uma carteira por vez, e isso esconde o movimento que
  // mais importa: o SALDO AGREGADO das corretoras. Uma saída aqui e uma entrada
  // ali se anulam no preço, mas quando o conjunto todo encolhe de forma
  // consistente, a oferta disponível para venda imediata está sendo retirada —
  // e é isso que produz alta por aperto em vez de queda por distribuição.
  //
  // Foi exatamente o que aconteceu na BTW: o painel avisava "possível venda" a
  // cada saída isolada enquanto o agregado encolhia e o preço dobrava.
  const antesCorretoras = current.reduce((sum, w) => {
    const before = previous[w.address.toLowerCase()];
    return w.role === "exchange" && before ? sum + before.balance : sum;
  }, 0);
  const agoraCorretoras = current.reduce(
    (sum, w) => (w.role === "exchange" && previous[w.address.toLowerCase()] ? sum + w.balance : sum),
    0,
  );

  const variacao = agoraCorretoras - antesCorretoras;
  const variacaoUsd = Math.abs(variacao) * priceUsd;

  // O agregado se move o tempo todo por ruído; só um deslocamento grande perto
  // da liquidez diz alguma coisa sobre o preço.
  if (antesCorretoras > 0 && variacaoUsd >= bigUsd * 2) {
    const saindo = variacao < 0;
    // A fração do saldo das corretoras é o denominador errado: 230 mil moedas
    // contra um agregado de 480 milhões arredonda para 0,0% e some, mesmo
    // valendo metade da pool à vista. O que decide se o movimento mexe no preço
    // é o tamanho dele contra a LIQUIDEZ, e é isso que a mensagem diz.
    const daPool = liquidityUsd > 0 ? variacaoUsd / liquidityUsd : 0;
    const escala =
      daPool >= 10
        ? `${daPool.toFixed(0)}x a liquidez à vista`
        : daPool >= 0.1
          ? `${(daPool * 100).toFixed(0)}% da liquidez à vista`
          : `${money(variacaoUsd)} contra ${money(liquidityUsd)} de pool`;

    // Saída de corretora tem DOIS significados opostos, e confundi-los foi o
    // erro de 19/08: o alerta chamou de "choque de oferta" — leitura altista —
    // uma retirada de 150 milhões que foi direto para cinco carteiras novas
    // sem gás, em pedaços iguais de 30 milhões.
    //
    //   PARA CUSTÓDIA   o token sai do livro e some por tempo indeterminado.
    //                   Aperta a oferta de verdade, e é altista.
    //   PARA ESTOQUE    o token sai para carteira nova ou parada, que não
    //                   consome nem custodia nada. Não sumiu — foi POSICIONADO,
    //                   e o passo seguinte é voltar para uma corretora para ser
    //                   vendido. É o oposto de altista.
    //
    // A diferença é observável: basta olhar para onde a saída foi parar.
    const paraEstoque = transfers
      .filter((t) => /corretora|binance|bitget|mexc|gate|okx/i.test(t.fromLabel))
      .filter((t) => t.toIsFresh || /leque|parad|dormant/i.test(t.toLabel))
      .reduce((sum, t) => sum + t.amount, 0);
    const estocando = saindo && paraEstoque >= Math.abs(variacao) * 0.5;

    alerts.push({
      kind: saindo ? "exchange-outflow" : "exchange-inflow",
      severity: "critical",
      fingerprint: `net:${saindo ? (estocando ? "stock" : "out") : "in"}:${magnitude(variacaoUsd)}`,
      title: estocando
        ? `🎯 ${symbol} · ${units(-variacao)} saíram das corretoras para carteiras novas`
        : saindo
          ? `🚀 ${symbol} · CHOQUE DE OFERTA — ${units(-variacao)} saíram das corretoras`
          : `⚓ ${symbol} · ${units(variacao)} entraram nas corretoras`,
      detail: estocando
        ? `Saíram ${units(-variacao)} das corretoras — ${escala} — e ${units(paraEstoque)} disso ` +
          `foram parar em endereços novos ou parados. Isso NÃO é aperto de oferta: carteira nova ` +
          `não custodia nem consome nada, ela guarda. Para virar venda numa corretora o token ` +
          `precisa VOLTAR, e é essa volta que marca o topo — no LAB ela foi de 1% do supply e ` +
          `caiu no dia exato da máxima. Vale vigiar o gás dessas carteiras: sem ele não movem.`
        : saindo
          ? `Saíram ${units(-variacao)} do saldo somado das corretoras — ${escala}. ` +
            `Oferta disponível para venda imediata está sendo retirada do mercado. ` +
            `É configuração de alta por aperto, não de distribuição — e o pior momento possível ` +
            `para estar vendido.`
          : `Entraram ${units(variacao)} no saldo somado das corretoras — ${escala}. ` +
            `Oferta se acumulando no livro é o que precede distribuição.`,
      valueUsd: variacaoUsd,
      addresses: [],
    });
  }

  // ---------------------------------------------------------- topo do ciclo
  //
  // Medido no LAB, que percorreu o ciclo inteiro: o saldo somado das corretoras
  // caiu 97% enquanto o preço multiplicava por 79, e o TOPO foi a REVERSÃO
  // desse saldo — de 0,36 para 5,87 milhões em quatro dias, com o preço indo de
  // US$ 14 para US$ 0,89.
  //
  // A mecânica é obrigatória, não coincidência: secar o livro faz pouco
  // dinheiro mover muito preço, mas VENDER exige devolver o token para a
  // corretora, e o depósito acontece antes da venda. Por isso a virada do saldo
  // antecede a queda em vez de segui-la.
  //
  // Duas condições, e as duas precisam valer. Um repique sem aperto anterior é
  // só ruído de fluxo; um aperto sem repique ainda é a fase de alta.
  if (history.length >= 4) {
    const recente = history.slice(-14);
    const minimo = Math.min(...recente.map((p) => p.total));
    const maximo = Math.max(...history.map((p) => p.total));
    const atual = history[history.length - 1].total;

    const houveAperto = maximo > 0 && minimo / maximo < 0.8;
    const repique = minimo > 0 ? atual / minimo - 1 : 0;

    if (houveAperto && repique >= 0.25) {
      alerts.push({
        kind: "cycle-top",
        severity: "critical",
        fingerprint: `top:${symbol}:${magnitude(atual * priceUsd)}`,
        title: `🔻 ${symbol} · POSSÍVEL TOPO — oferta voltando para as corretoras`,
        detail:
          `O saldo somado das corretoras encolheu ${((1 - minimo / maximo) * 100).toFixed(0)}% durante a alta e ` +
          `agora subiu ${(repique * 100).toFixed(0)}% desde o fundo. Vender exige devolver o token para a ` +
          `corretora antes, então essa virada costuma anteceder a distribuição. ` +
          `Foi este o sinal no topo do LAB, quatro dias antes de o preço cair de US$ 14 para US$ 0,89.`,
        valueUsd: atual * priceUsd,
        addresses: [],
      });
    }
  }

  // ------------------------------------------------- fria alimentando quente
  //
  // Carteira fria não vende. Quando ela abastece a quente, quem opera está
  // preparando estoque para distribuir — foi exatamente a sequência de 16/08,
  // com cerca de doze horas entre uma coisa e outra.
  // O sentido inverso — quente para fria — é o sinal oposto e some das outras
  // regras: os dois lados têm o mesmo papel, então o agregado das corretoras não
  // muda e nenhum alerta de saldo dispara. Mas tirar token do livro para a
  // custódia é retirar oferta vendável, que é justamente a mecânica do aperto.
  for (const t of transfers) {
    const fromHot = /quente|hot/i.test(t.fromLabel);
    const toCold = /fria|cold/i.test(t.toLabel);
    if (fromHot && toCold && t.amount * priceUsd >= bigUsd) {
      alerts.push({
        kind: "hot-to-cold",
        severity: "critical",
        fingerprint: `h2c:${t.block}:${Math.round(t.amount)}`,
        title: `🔒 ${symbol} · ${units(t.amount)} saíram do livro para a custódia`,
        detail:
          `${money(t.amount * priceUsd)} foram da carteira quente para a fria. ` +
          `Sai do que pode ser vendido agora e entra em custódia, que precisa voltar ` +
          `para a quente antes de virar venda. É retirada de oferta — a mecânica que ` +
          `aperta o livro e sustenta alta.`,
        valueUsd: t.amount * priceUsd,
        addresses: [t.from, t.to],
      });
    }
  }

  for (const t of transfers) {
    const fromCold = /fria|cold/i.test(t.fromLabel);
    const toHot = /quente|hot/i.test(t.toLabel);
    if (fromCold && toHot && t.amount * priceUsd >= bigUsd) {
      alerts.push({
        kind: "cold-to-hot",
        severity: "critical",
        fingerprint: `c2h:${t.block}:${Math.round(t.amount)}`,
        title: `🧊→🔥 ${symbol} · ${units(t.amount)} da carteira fria para a quente`,
        detail:
          `${money(t.amount * priceUsd)} mudaram de custódia fria para operacional. ` +
          `Carteira fria não vende; ela abastece a quente, que vende. ` +
          `Em 16/08 essa mesma sequência precedeu a distribuição em cerca de 12 horas.`,
        valueUsd: t.amount * priceUsd,
        addresses: [t.from, t.to],
      });
    }
  }

  // ------------------------------------------------ transferência de teste
  //
  // O sinal mais fino do conjunto. Vale pouco sozinho e muito em contexto:
  // uma quantia irrisória saindo de uma carteira que segura milhões, para um
  // endereço que nunca movimentou nada, é alguém conferindo o destino.
  const TEST_MAX_USD = 500;
  for (const t of transfers) {
    const value = t.amount * priceUsd;
    const fromTracked = t.fromLabel !== "" && !t.fromLabel.includes("…");
    if (!fromTracked || !t.toIsFresh) continue;
    if (value <= 0 || value > TEST_MAX_USD) continue;

    alerts.push({
      kind: "test-transfer",
      severity: "critical",
      fingerprint: `test:${t.from}:${t.to}`,
      title: `🧪 ${symbol} · possível transferência de teste de ${t.fromLabel}`,
      detail:
        `Apenas ${units(t.amount)} (${money(value)}) foram para um endereço que nunca ` +
        `enviou nada. Quem vai mover milhões confere o endereço antes. ` +
        `Em 16/08 o intervalo entre o teste e a transferência cheia foi de 13 a 16 minutos.`,
      valueUsd: value,
      addresses: [t.to, t.from],
    });
  }

  // ------------------------------------------------ transferência grande
  //
  // As regras acima só enxergam as carteiras da lista. Boa parte do fluxo passa
  // por endereços de depósito que ninguém mapeou — foi assim que uma sequência
  // de US$ 76 mil e US$ 99 mil passou batida: os dois lados estavam fora da
  // lista. Esta regra olha o token inteiro e fecha esse ponto cego.
  //
  // Só entram as que NÃO tocam carteira vigiada: quando tocam, a mudança de
  // saldo já gera aviso, e alertar duas vezes pelo mesmo evento é ruído.
  const watched = new Set(current.map((w) => w.address.toLowerCase()));

  // O mesmo dinheiro costuma passar por três ou quatro endereços em sequência
  // até chegar na corretora, e cada salto é uma transferência de valor idêntico.
  // São um evento econômico só: avisar de cada salto multiplicaria o alerta sem
  // acrescentar informação. Fica o primeiro, que é o mais próximo da origem.
  const seenAmount = new Set<string>();

  for (const t of [...transfers].sort((a, b) => a.block - b.block)) {
    const value = t.amount * priceUsd;
    if (value < bigUsd) continue;
    if (watched.has(t.from.toLowerCase()) || watched.has(t.to.toLowerCase())) continue;

    const hop = t.amount.toFixed(6);
    if (seenAmount.has(hop)) continue;
    seenAmount.add(hop);

    alerts.push({
      kind: "large-transfer",
      severity: "high",
      // Por transferência, não por carteira: cada uma é um evento distinto e a
      // janela de varredura sobrepõe ciclos, então o identificador precisa ser
      // estável para a mesma transferência não avisar quatro vezes.
      fingerprint: `big:${t.block}:${t.from}:${t.to}:${Math.round(t.amount)}`,
      title: `💸 ${symbol} · ${units(t.amount)} entre carteiras fora da lista`,
      detail:
        `${money(value)} mudaram de mãos entre dois endereços não mapeados — ` +
        `${Math.round((value / liquidityUsd) * 100)}% da liquidez à vista da moeda. ` +
        `Costuma ser roteamento por endereço de depósito a caminho de uma corretora.`,
      valueUsd: value,
      addresses: [t.from, t.to],
    });
  }

  // ----------------------------------------------- destino novo e grande
  for (const t of transfers) {
    const value = t.amount * priceUsd;
    const fromTracked = t.fromLabel !== "" && !t.fromLabel.includes("…");
    if (!fromTracked || !t.toIsFresh || value < bigUsd) continue;

    alerts.push({
      kind: "fresh-recipient",
      severity: "critical",
      fingerprint: `fresh:${t.from}:${t.to}:${Math.round(t.amount)}`,
      title: `🆕 ${symbol} · ${units(t.amount)} para carteira recém-criada`,
      detail:
        `${money(value)} saíram de ${t.fromLabel} para um endereço que nunca enviou nada. ` +
        `É o padrão de quebrar a trilha antes de distribuir — igual às duas carteiras de 16/08.`,
      valueUsd: value,
      addresses: [t.to, t.from],
    });
  }

  // -------------------------------------------------- o que o perpétuo diz
  //
  // As regras acima leem a rede, e a rede só enxerga moeda trocando de mão.
  // Boa parte do preço destas moedas não passa por lá: no dia 19/08 a BTW subiu
  // 60% e caiu 50% com o saldo das corretoras variando 0,5%. Quem olhasse só a
  // rede concluiria que não aconteceu nada.
  //
  // As duas regras abaixo cobrem justamente os movimentos que NÃO deixam rastro
  // on-chain — e a primeira delas é um aviso de topo, não de queda.
  const perp = input.perp;
  if (perp) {
    if (perp.kind === "squeeze") {
      alerts.push({
        kind: "squeeze",
        severity: "critical",
        fingerprint: `sqz:${symbol}:${magnitude(perp.shortLiqUsd)}`,
        title: `⚠️ ${symbol} · ALTA FORÇADA — ${money(perp.shortLiqUsd)} de vendidos liquidados`,
        detail:
          `Preço ${(perp.priceChange * 100).toFixed(0)}% com as posições abertas em ` +
          `${(perp.oiChange * 100).toFixed(0)}%: quem comprou foi obrigado a comprar, não quis. ` +
          `Squeeze não deixa comprador voluntário abaixo do preço — quando os vendidos acabam, ` +
          `o bid some junto e o preço volta sozinho, sem precisar de venda nenhuma. ` +
          `É o tipo de alta em que ficar comprado depois do estouro custa caro.`,
        valueUsd: perp.shortLiqUsd,
        addresses: [],
      });
    }

    if (perp.kind === "livro vazio" || perp.kind === "desalavancagem") {
      const vazio = perp.kind === "livro vazio";
      alerts.push({
        kind: "unwind",
        severity: "high",
        fingerprint: `unw:${symbol}:${perp.kind}:${magnitude(Math.abs(perp.priceChange) * 1e6)}`,
        title: vazio
          ? `📉 ${symbol} · queda de ${(perp.priceChange * 100).toFixed(0)}% sem venda — sumiu a compra`
          : `📉 ${symbol} · queda de ${(perp.priceChange * 100).toFixed(0)}% por desalavancagem`,
        detail:
          `${perp.note} Nada disso aparece no saldo das corretoras na rede, então não adianta ` +
          `procurar lá: a queda não passou por ela.`,
        valueUsd: perp.longLiqUsd,
        addresses: [],
      });
    }
  }

  // ------------------------------------------- baleia desmontando comprado
  //
  // Este é o único aviso aqui que tenta antecipar o TOPO em vez de descrever o
  // que já aconteceu, e por isso é o mais frágil. O placar medido está escrito
  // na mensagem de propósito: quem recebe precisa saber que são quatro acertos
  // em seis, e não uma sentença.
  //
  // Na BTW de 19/08 ele teria disparado às 09h UTC, com o preço em US$ 0,6999
  // — a máxima do dia. As baleias largaram 4,8% do livro naquela hora, o preço
  // ficou de lado por cinco horas e só então caiu 50%. O intervalo entre o
  // sinal e a queda é justamente o que o torna útil.
  //
  // O modo de errar dele é chegar cedo: no GPS falou três vezes em 17/08, o
  // preço subiu 10% e só caiu 32% no dia seguinte. Por isso a severidade é
  // "high" e não "critical" — quem age em cima disso precisa aguentar ficar
  // um dia parecendo errado.
  const exit = input.whaleExit;
  if (exit && exit.fragile) {
    alerts.push({
      kind: "whale-exit",
      severity: "high",
      fingerprint: `whx:${symbol}:${Math.round(exit.share * 100)}`,
      title: `🐋 ${symbol} · baleias largaram ${(exit.share * 100).toFixed(1)}% do livro no topo`,
      detail:
        `As contas grandes desmontaram ${units(exit.peakNet - exit.net)} de posição comprada ` +
        `depois de uma alta de ${(exit.rally * 100).toFixed(0)}%, e o preço ainda está a ` +
        `${(exit.fromHigh * 100).toFixed(0)}% da máxima — ou seja, saíram antes de quebrar. ` +
        `A alta que veio antes era a crédito (squeeze ou alavancagem), que é quando essa saída ` +
        `costuma marcar o fim. ` +
        `${PLACAR_WHALE_EXIT}`,
      valueUsd: (exit.peakNet - exit.net) * priceUsd,
      addresses: [],
    });
  }

  // Uma transferência entre duas carteiras vigiadas gera TRÊS avisos: o da
  // transferência em si, o saldo caindo de um lado e subindo do outro. É um
  // evento só, e os dois de saldo dizem menos do que o primeiro — que já explica
  // a direção. Ficam só quando não há alerta de transferência que os cubra.
  const explicados = new Set<string>();
  for (const a of alerts) {
    if (a.kind === "hot-to-cold" || a.kind === "cold-to-hot") {
      for (const addr of a.addresses) explicados.add(addr.toLowerCase());
    }
  }

  const enxutos = alerts.filter((a) => {
    const deSaldo =
      a.kind === "exchange-inflow" || a.kind === "exchange-outflow" || a.kind === "balance-drop";
    if (!deSaldo || a.addresses.length === 0) return true;
    return !explicados.has(a.addresses[0].toLowerCase());
  });

  // Mais grave primeiro, e entre iguais o maior valor.
  const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2 };
  return enxutos.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || b.valueUsd - a.valueUsd,
  );
}
