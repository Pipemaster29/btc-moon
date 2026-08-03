/**
 * Simulador de carteira com aporte mensal, alavancagem e saída em degraus.
 *
 * O que ele modela, e que os backtests anteriores ignoravam:
 *
 *  - aporte periódico, que é como as pessoas de fato investem;
 *  - alavancagem, com liquidação quando o preço anda 1/L contra a posição;
 *  - realização parcial no primeiro alvo, deixando um resto correr;
 *  - stop que sobe em degraus conforme o lucro avança.
 *
 * Todas as porcentagens de alvo e stop são sobre o CAPITAL, já contando a
 * alavancagem. Um stop de 10% com 3x corresponde a 3,33% de movimento no preço.
 */

import type { Candle } from "./bitstamp";

const DAY = 86400;

export interface Position {
  entryTime: number;
  entryPrice: number;
  /** Capital próprio alocado, em dólares. */
  margin: number;
  leverage: number;
  /** Fração da posição ainda aberta. */
  remaining: number;
  /** Preço em que a posição é encerrada por perda. */
  stopPrice: number;
  /** Quantos degraus de lucro já foram alcançados. */
  rungsHit: number;
  /** Ganho já realizado nas saídas parciais, em dólares. */
  realized: number;
}

export interface PortfolioTrade {
  entryTime: number;
  exitTime: number;
  entryPrice: number;
  exitPrice: number;
  margin: number;
  /** Resultado em dólares, já líquido da margem aplicada. */
  profit: number;
  /** Retorno sobre a margem, contando a alavancagem. */
  returnOnMargin: number;
  reason: "stop" | "deadline" | "liquidation";
  rungsHit: number;
}

export interface PortfolioResult {
  trades: PortfolioTrade[];
  /** Total aportado ao longo do período. */
  deposited: number;
  /** Valor final: caixa mais posições marcadas a mercado. */
  finalValue: number;
  /** Múltiplo sobre o total aportado. */
  multiple: number;
  /** Retorno anualizado sobre o capital aportado. */
  cagr: number;
  /** Maior queda do valor da carteira em relação ao topo anterior. */
  maxDrawdown: number;
  tradeCount: number;
  liquidations: number;
  /** Fração do tempo com o dinheiro parado em caixa. */
  idleShare: number;
}

export interface LadderConfig {
  /** Ganho sobre o capital que dispara a primeira realização. */
  firstTargetPct: number;
  /** Fração da posição vendida no primeiro alvo. */
  firstTakeFraction: number;
  /** Stop, sobre o capital, após a primeira realização. */
  breakevenPct: number;
  /** Tamanho de cada degrau seguinte de lucro. */
  rungPct: number;
  /** Stop inicial, sobre o capital. */
  stopPct: number;
}

/** Preço correspondente a um ganho percentual sobre o capital. */
function priceAtGain(entry: number, gain: number, leverage: number): number {
  return entry * (1 + gain / leverage);
}

/**
 * Processa um dia para uma posição aberta.
 *
 * A ordem de verificação é deliberadamente pessimista: liquidação, depois stop,
 * só então os alvos. No candle diário não há como saber o que veio primeiro, e
 * supor o contrário inflaria o resultado exatamente nos dias mais violentos.
 */
function stepPosition(
  position: Position,
  candle: Candle,
  ladder: LadderConfig,
): { closed: true; exitPrice: number; reason: PortfolioTrade["reason"] } | { closed: false } {
  const { entryPrice, leverage } = position;

  // Com alavancagem L o capital zera quando o preço cai 1/L.
  const liquidationPrice = entryPrice * (1 - 1 / leverage);
  if (candle.low <= liquidationPrice) {
    return { closed: true, exitPrice: liquidationPrice, reason: "liquidation" };
  }

  if (candle.low <= position.stopPrice) {
    return { closed: true, exitPrice: position.stopPrice, reason: "stop" };
  }

  // Primeiro alvo: realiza a maior parte e trava o prejuízo em quase zero.
  if (position.rungsHit === 0) {
    const target = priceAtGain(entryPrice, ladder.firstTargetPct, leverage);
    if (candle.high >= target) {
      position.realized +=
        position.margin * position.remaining * ladder.firstTakeFraction * ladder.firstTargetPct;
      position.remaining *= 1 - ladder.firstTakeFraction;
      position.stopPrice = priceAtGain(entryPrice, ladder.breakevenPct, leverage);
      position.rungsHit = 1;
    }
  }

  // Degraus seguintes: o resto corre e o stop sobe atrás dele.
  while (true) {
    const nextGain = ladder.firstTargetPct + ladder.rungPct * position.rungsHit;
    const nextPrice = priceAtGain(entryPrice, nextGain, leverage);
    if (position.rungsHit === 0 || candle.high < nextPrice) break;

    position.rungsHit++;
    const lockedGain = nextGain - ladder.rungPct;
    position.stopPrice = priceAtGain(entryPrice, lockedGain, leverage);
  }

  return { closed: false };
}

export interface SignalContext {
  index: number;
  candle: Candle;
  /** Índice do candle anterior, ou -1 no primeiro dia. */
  previousIndex: number;
}

export interface StrategyHooks {
  /**
   * Preço limite de compra para o dia, ou null se não há ordem no book.
   * A ordem executa quando a mínima do candle a alcança.
   */
  limitPrice(ctx: SignalContext): number | null;
  /**
   * Identifica a janela de oportunidade a que o dia pertence. Ao trocar de
   * janela o estado de reentrada é zerado — sem isso, a exigência de queda
   * adicional criada por um stop se arrastava para as janelas seguintes e
   * bloqueava quase todas as entradas.
   */
  windowId(index: number): number;
  /** Dia em que uma posição aberta deve ser encerrada de qualquer forma. */
  deadlineIndex(entryIndex: number): number;
  /** Fração do caixa aplicada em cada entrada. */
  allocation: number;
  leverage: number;
  ladder: LadderConfig;
  /** Quantas reentradas são permitidas depois de um stop, na mesma janela. */
  maxReentries: number;
  /** Queda adicional, no preço, exigida para a reentrada. */
  reentryDropPct: number;
}

/**
 * Roda a carteira dia a dia.
 *
 * O aporte entra no primeiro pregão de cada mês e fica em caixa até que um
 * sinal apareça — dinheiro parado não rende nada aqui, o que é conservador e
 * evita creditar juros que a estratégia não teria.
 */
export function simulate(
  candles: Candle[],
  hooks: StrategyHooks,
  monthlyDeposit: number,
): PortfolioResult {
  let cash = 0;
  let deposited = 0;
  let position: Position | null = null;
  let deadline = -1;
  let reentriesLeft = 0;
  let lastStopPrice = 0;
  let currentWindow = -1;

  const trades: PortfolioTrade[] = [];
  const equityCurve: number[] = [];
  let idleDays = 0;
  let lastMonth = -1;

  for (let i = 0; i < candles.length; i++) {
    const candle = candles[i];
    const month = new Date(candle.time * 1000).getUTCMonth();

    if (month !== lastMonth) {
      cash += monthlyDeposit;
      deposited += monthlyDeposit;
      lastMonth = month;
    }

    if (position) {
      const step = stepPosition(position, candle, hooks.ladder);

      if (step.closed) {
        const priceMove = step.exitPrice / position.entryPrice - 1;
        const openGain = position.margin * position.remaining * priceMove * position.leverage;
        const profit = position.realized + openGain;

        cash += position.margin + profit;
        trades.push({
          entryTime: position.entryTime,
          exitTime: candle.time,
          entryPrice: position.entryPrice,
          exitPrice: step.exitPrice,
          margin: position.margin,
          profit,
          returnOnMargin: profit / position.margin,
          reason: step.reason,
          rungsHit: position.rungsHit,
        });

        // Só um stop autoriza tentar de novo na mesma janela.
        if (step.reason === "stop") {
          lastStopPrice = step.exitPrice;
          reentriesLeft =
            reentriesLeft === 0 ? hooks.maxReentries : reentriesLeft - 1;
        } else {
          lastStopPrice = 0;
          reentriesLeft = 0;
        }
        position = null;
      } else if (i >= deadline) {
        const priceMove = candle.close / position.entryPrice - 1;
        const openGain = position.margin * position.remaining * priceMove * position.leverage;
        const profit = position.realized + openGain;

        cash += position.margin + profit;
        trades.push({
          entryTime: position.entryTime,
          exitTime: candle.time,
          entryPrice: position.entryPrice,
          exitPrice: candle.close,
          margin: position.margin,
          profit,
          returnOnMargin: profit / position.margin,
          reason: "deadline",
          rungsHit: position.rungsHit,
        });
        position = null;
        reentriesLeft = 0;
        lastStopPrice = 0;
      }
    }

    if (!position && cash > 0) {
      const window = hooks.windowId(i);
      if (window !== currentWindow) {
        currentWindow = window;
        reentriesLeft = 0;
        lastStopPrice = 0;
      }

      const wanted = hooks.limitPrice({ index: i, candle, previousIndex: i - 1 });
      // Depois de um stop, a reentrada exige uma queda adicional — a ideia é
      // não recomprar no mesmo nível que acabou de falhar.
      const limit =
        wanted !== null && lastStopPrice > 0 && reentriesLeft > 0
          ? Math.min(wanted, lastStopPrice * (1 - hooks.reentryDropPct))
          : lastStopPrice > 0 && reentriesLeft === 0
            ? null // já esgotou as tentativas nesta janela
            : wanted;

      if (limit !== null && candle.low <= limit) {
        const margin = cash * hooks.allocation;
        if (margin > 0) {
          cash -= margin;
          position = {
            entryTime: candle.time,
            entryPrice: limit,
            margin,
            leverage: hooks.leverage,
            remaining: 1,
            stopPrice: priceAtGain(limit, -hooks.ladder.stopPct, hooks.leverage),
            rungsHit: 0,
            realized: 0,
          };
          deadline = hooks.deadlineIndex(i);
        }
      }
    }

    if (!position) idleDays++;

    const openValue = position
      ? position.margin +
        position.realized +
        position.margin *
          position.remaining *
          (candle.close / position.entryPrice - 1) *
          position.leverage
      : 0;
    equityCurve.push(cash + Math.max(openValue, 0));
  }

  const finalValue = equityCurve[equityCurve.length - 1] ?? 0;

  let peak = 0;
  let worst = 0;
  for (const v of equityCurve) {
    if (v > peak) peak = v;
    if (peak > 0) {
      const dd = v / peak - 1;
      if (dd < worst) worst = dd;
    }
  }

  const years = (candles[candles.length - 1].time - candles[0].time) / DAY / 365.25;

  return {
    trades,
    deposited,
    finalValue,
    multiple: deposited > 0 ? finalValue / deposited : 0,
    // Aporte contínuo não tem um capital único: esta é a taxa que levaria o
    // total aportado ao valor final no mesmo prazo, uma medida aproximada.
    cagr: years > 0 && deposited > 0 ? (finalValue / deposited) ** (1 / years) - 1 : 0,
    maxDrawdown: worst,
    tradeCount: trades.length,
    liquidations: trades.filter((t) => t.reason === "liquidation").length,
    idleShare: idleDays / candles.length,
  };
}

/**
 * Aporte mensal comprando à vista, sem alavancagem nem análise.
 *
 * A data de compra dentro do mês é sorteada, para representar quem investe sem
 * critério nenhum de momento.
 */
export function simulateDCA(
  candles: Candle[],
  monthlyDeposit: number,
  random: () => number,
): { deposited: number; finalValue: number; multiple: number; buys: number } {
  let deposited = 0;
  let btc = 0;
  let buys = 0;

  const byMonth = new Map<string, Candle[]>();
  for (const c of candles) {
    const key = new Date(c.time * 1000).toISOString().slice(0, 7);
    const list = byMonth.get(key);
    if (list) list.push(c);
    else byMonth.set(key, [c]);
  }

  for (const days of byMonth.values()) {
    const pick = days[Math.floor(random() * days.length)];
    // Compra a mercado, no fechamento do dia sorteado.
    btc += monthlyDeposit / pick.close;
    deposited += monthlyDeposit;
    buys++;
  }

  const finalValue = btc * candles[candles.length - 1].close;
  return { deposited, finalValue, multiple: finalValue / deposited, buys };
}
