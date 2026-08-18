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

export type AlertKind =
  | "gas-arrived"
  | "test-transfer"
  | "lock-outflow"
  | "cold-to-hot"
  | "exchange-inflow"
  | "balance-drop"
  | "fresh-recipient";

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

export interface DetectInput {
  /** Símbolo da moeda, para o alerta dizer de qual se trata. */
  symbol: string;
  /** Nome do ativo que paga gás na rede — "BNB", "ETH". */
  gasSymbol: string;
  previous: Record<string, WalletMemory>;
  current: Observation[];
  transfers: TransferSeen[];
  priceUsd: number;
  /** Liquidez à vista, que dá a escala do que é "grande" nesta moeda. */
  liquidityUsd: number;
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
    // Trava não deveria se mexer nunca, então qualquer saída conta.
    const dropFloor = isLock ? 0 : bigUsd;

    if (drop > 0 && drop * priceUsd >= dropFloor) {
      alerts.push({
        kind: isLock ? "lock-outflow" : "balance-drop",
        severity: isLock ? "critical" : "high",
        // Sem o saldo no identificador: ele muda a cada ciclo, e incluí-lo fazia
        // a deduplicação nunca casar — a mesma carteira alertava para sempre.
        fingerprint: `out:${wallet.address}:${magnitude(drop * priceUsd)}`,
        title: isLock
          ? `🔓 ${symbol} · A TRAVA SE MEXEU — ${wallet.label}`
          : `📤 ${symbol} · ${wallet.label} enviou ${units(drop)}`,
        detail: isLock
          ? `Saíram ${units(drop)} (${money(drop * priceUsd)}) de um contrato de trava. ` +
            `Era supply que não circulava e agora circula. É o evento mais grave possível para o preço.`
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

  // ------------------------------------------------- fria alimentando quente
  //
  // Carteira fria não vende. Quando ela abastece a quente, quem opera está
  // preparando estoque para distribuir — foi exatamente a sequência de 16/08,
  // com cerca de doze horas entre uma coisa e outra.
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

  // Mais grave primeiro, e entre iguais o maior valor.
  const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2 };
  return alerts.sort(
    (a, b) => rank[a.severity] - rank[b.severity] || b.valueUsd - a.valueUsd,
  );
}
