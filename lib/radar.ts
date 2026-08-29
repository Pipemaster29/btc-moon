/**
 * O estado on-chain de uma moeda vigiada, num único retrato.
 *
 * Reúne o que os scripts imprimem no terminal — saldos, gás, estrutura do
 * supply, transferências grandes — num formato que a página consegue renderizar.
 * Tudo aqui é leitura pública sem chave, então roda no servidor sem segredo
 * nenhum configurado.
 *
 * Os alertas não comparam com uma leitura anterior de propósito. Guardar estado
 * exigiria banco, e o que interessa é observável no instante: uma carteira que
 * deveria estar parada e apareceu com gás está armada agora, tenha sido
 * abastecida há um minuto ou há um dia.
 */

import {
  balancesOf,
  blocosPara,
  blockNumber,
  gasOf,
  toUnits,
  tokenInfo,
  transfersBetween,
  CHAINS,
  type Chain,
} from "./onchain";
import { depthOn, pairsOfToken } from "./dexscreener";
import { precoBinance } from "./binance";
import { findToken, labelOf, type WalletRole, type WatchedToken } from "./watchlist";

/** Abaixo disso a carteira não paga nem uma transferência. */
const GAS_FLOOR = 0.001;

export interface WalletState {
  address: string;
  label: string;
  role: WalletRole;
  verified: boolean;
  amount: number;
  valueUsd: number;
  pctSupply: number;
  /** Saldo do ativo de gás da rede. */
  gas: number;
  /** Carteira comum, com saldo, sem gás: fisicamente impedida de mover. */
  stuck: boolean;
  /** Estava parada e agora tem gás — pode mover a qualquer momento. */
  armed: boolean;
}

export interface SupplySlice {
  role: WalletRole | "unmapped";
  label: string;
  note: string;
  amount: number;
  valueUsd: number;
  pct: number;
}

export interface BigTransfer {
  amount: number;
  valueUsd: number;
  from: string;
  to: string;
  fromLabel: string;
  toLabel: string;
  block: number;
}

export type AlertLevel = "danger" | "warning" | "info";

export interface Alert {
  level: AlertLevel;
  title: string;
  detail: string;
}

export interface RadarSnapshot {
  symbol: string;
  tokenSymbol: string;
  contract: string;
  chain: Chain;
  /** Ativo que paga gás nesta rede: BNB na BNB Chain, ETH na Base. */
  gasSymbol: string;
  /** Explorador da rede, para os links de endereço. */
  explorer: string;
  supply: number;
  priceUsd: number;
  /**
   * De onde saiu o preço.
   *
   * Existe porque as duas origens não valem o mesmo e a tela precisa dizer qual
   * é: o preço da pool é o que a rede realmente pratica; o do perpétuo é o que
   * uma corretora marca, e para moeda sem pool é o único que existe.
   */
  priceSource: "pool" | "perpétuo" | "nenhum";
  liquidityUsd: number;
  volume24h: number;
  pools: number;
  fdv: number;
  wallets: WalletState[];
  supplyBreakdown: SupplySlice[];
  mapped: number;
  unmapped: number;
  /** Oferta que pode virar venda: fora de trava e fora de paralisia. */
  sellable: number;
  bigTransfers: BigTransfer[];
  transfersScanned: number;
  windowHours: number;
  alerts: Alert[];
  takenAt: number;
}

const ROLE_META: Record<WalletRole, { label: string; note: string }> = {
  lock: { label: "Travado por cronograma", note: "tem data para liberar" },
  multisig: {
    label: "Cofre multi-assinatura",
    note: "sai quando os signatários concordarem",
  },
  dormant: { label: "Parado sem gás", note: "não consegue mover" },
  exchange: { label: "Em corretora", note: "custódia ou oferta pronta" },
  treasury: { label: "Distribuidora", note: "de onde saem os repasses" },
  operational: { label: "Operacional", note: "ativa, com gás" },
  router: { label: "Roteamento", note: "carrega token até o livro" },
};

/**
 * Monta o retrato. Lança se a moeda não tiver contrato configurado — o chamador
 * decide o que mostrar nesse caso.
 */
export async function getRadar(symbol: string): Promise<RadarSnapshot | null> {
  const token = findToken(symbol);
  if (!token?.contract) return null;

  const config = CHAINS[token.chain];
  const addresses = token.wallets.map((w) => w.address);

  const [info, head, pairs, balances, gasBalances, perpPrice] = await Promise.all([
    tokenInfo(token.chain, token.contract),
    blockNumber(token.chain),
    pairsOfToken(token.contract),
    balancesOf(token.chain, token.contract, addresses),
    gasOf(token.chain, addresses),
    // Emenda para moeda que não tem pool. Sem ela o painel inteiro nascia
    // zerado — ver o comentário sobre a origem do preço logo abaixo.
    precoBinance(token.symbol).catch(() => null),
  ]);

  const depth = depthOn(pairs, token.chain);

  // O PREÇO NÃO PODE DEPENDER SÓ DA POOL, e isto era um buraco silencioso.
  //
  // Tudo em dólar nesta página sai de uma multiplicação por `price`, e `price`
  // vinha exclusivamente do DexScreener. Moeda com contrato de verdade mas sem
  // par em DEX — a HEI é isso: 72 milhões de tokens na Ethereum, negociada só em
  // corretora — caía com preço 0. E aí o valor de cada carteira era US$ 0, o FDV
  // era US$ 0, o piso de "transferência grande" nunca era alcançado porque toda
  // transferência valia zero, e a página mostrava um retrato de moeda sem
  // valor nenhum. Nada disso aparecia como erro.
  //
  // O perpétuo cobre o caso: é onde essas moedas negociam. A pool continua
  // mandando quando existe, porque é o preço que a própria rede pratica.
  const price = depth?.priceUsd || perpPrice || 0;
  const priceSource: RadarSnapshot["priceSource"] = depth?.priceUsd
    ? "pool"
    : perpPrice
      ? "perpétuo"
      : "nenhum";
  const supply = toUnits(info.totalSupply, info.decimals);

  // Contrato não paga o próprio gás — quem o chama paga. O sinal de paralisia
  // só faz sentido para carteira comum, e `lock` é onde estão os contratos.
  const wallets: WalletState[] = token.wallets.map((wallet) => {
    const key = wallet.address.toLowerCase();
    const amount = toUnits(balances.get(key) ?? BigInt(0), info.decimals);
    const fuel = Number(gasBalances.get(key) ?? BigInt(0)) / 1e18;
    const isEoa = wallet.role !== "lock";

    return {
      address: wallet.address,
      label: wallet.label,
      role: wallet.role,
      verified: wallet.verified,
      amount,
      valueUsd: amount * price,
      pctSupply: supply > 0 ? amount / supply : 0,
      gas: fuel,
      stuck: isEoa && amount > 0 && fuel < GAS_FLOOR,
      armed: isEoa && wallet.role === "dormant" && amount > 0 && fuel >= GAS_FLOOR,
    };
  });

  // ------------------------------------------------------ estrutura do supply
  const byRole = new Map<WalletRole, number>();
  for (const w of wallets) byRole.set(w.role, (byRole.get(w.role) ?? 0) + w.amount);

  const mapped = wallets.reduce((sum, w) => sum + w.amount, 0);
  const unmapped = Math.max(0, supply - mapped);

  const supplyBreakdown: SupplySlice[] = [
    ...([...byRole.entries()] as [WalletRole, number][])
      .sort((a, b) => b[1] - a[1])
      .map(([role, amount]) => ({
        role,
        label: ROLE_META[role].label,
        note: ROLE_META[role].note,
        amount,
        valueUsd: amount * price,
        pct: supply > 0 ? amount / supply : 0,
      })),
    {
      role: "unmapped" as const,
      label: "Não mapeado",
      note: "todo o resto do mercado",
      amount: unmapped,
      valueUsd: unmapped * price,
      pct: supply > 0 ? unmapped / supply : 0,
    },
  ];

  // Cofre multi-assinatura conta como oferta disponível. Não tem cronograma que
  // o segure: basta o número de assinaturas combinar, e no caso da BTW são duas
  // pessoas para 72,92% do supply. Tratá-lo como travado era o erro que fazia a
  // oferta parecer dez vezes menor do que é.
  const sellable =
    (byRole.get("exchange") ?? 0) +
    (byRole.get("treasury") ?? 0) +
    (byRole.get("operational") ?? 0) +
    (byRole.get("multisig") ?? 0) +
    unmapped;

  // -------------------------------------------------- movimentação recente
  // A janela é definida em TEMPO e não em blocos. Usar `maxLogSpan` direto
  // dava três horas na Base e trinta e sete minutos na BNB Chain para a mesma
  // linha de código — e a página anunciava as duas como "movimentação recente",
  // deixando a comparação entre moedas de redes diferentes sem sentido.
  const JANELA_HORAS = 3;
  const from = Math.max(head - blocosPara(token.chain, JANELA_HORAS), 0);
  const windowHours = ((head - from) * config.secondsPerBlock) / 3600;

  let scanned = 0;
  let bigTransfers: BigTransfer[] = [];

  try {
    const transfers = await transfersBetween(token.chain, token.contract, from, head);
    scanned = transfers.length;

    // Só o que é grande perto da pool. Abaixo disso é fluxo de varejo e
    // enterra o sinal em ruído.
    const floor = depth ? Math.max(depth.liquidityUsd * 0.05, 5000) : 25_000;

    bigTransfers = transfers
      .map((t) => {
        const amount = toUnits(t.value, info.decimals);
        return {
          amount,
          valueUsd: amount * price,
          from: t.from,
          to: t.to,
          fromLabel: labelOf(token, t.from),
          toLabel: labelOf(token, t.to),
          block: t.block,
        };
      })
      .filter((t) => t.valueUsd >= floor)
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
  } catch {
    // Sem os logs a página ainda vale pelos saldos; a contagem zerada avisa.
  }

  return {
    symbol: token.symbol,
    tokenSymbol: info.symbol,
    contract: token.contract,
    chain: token.chain,
    gasSymbol: config.gasSymbol,
    explorer: config.explorer,
    supply,
    priceUsd: price,
    priceSource,
    liquidityUsd: depth?.liquidityUsd ?? 0,
    volume24h: depth?.volume24h ?? 0,
    pools: depth?.pairs ?? 0,
    fdv: supply * price,
    wallets,
    supplyBreakdown,
    mapped,
    unmapped,
    sellable,
    bigTransfers,
    transfersScanned: scanned,
    windowHours,
    alerts: buildAlerts(
      token,
      wallets,
      sellable,
      price,
      depth?.liquidityUsd ?? 0,
      config.gasSymbol,
    ),
    takenAt: Date.now(),
  };
}

function buildAlerts(
  token: WatchedToken,
  wallets: WalletState[],
  sellable: number,
  price: number,
  liquidityUsd: number,
  /** O ativo que paga gás nesta rede. Era "BNB" cravado no texto, e o painel
   *  dizia isso na Ethereum e na Base, onde quem paga é ETH. */
  gasSymbol: string,
): Alert[] {
  const alerts: Alert[] = [];
  const money = (v: number) =>
    v >= 1e6 ? `US$ ${(v / 1e6).toFixed(1)} mi` : `US$ ${(v / 1e3).toFixed(0)} mil`;

  // O aviso mais forte: uma carteira classificada como parada que tem com que
  // pagar a transação. Note o que ele NÃO diz — sem uma leitura anterior
  // guardada não dá para afirmar que o gás acabou de chegar, só que ele está
  // lá. Afirmar o abastecimento seria inventar um evento a partir de um estado.
  const armed = wallets.filter((w) => w.armed);
  if (armed.length > 0) {
    alerts.push({
      level: "danger",
      title: `${armed.length} carteira${armed.length > 1 ? "s" : ""} parada${armed.length > 1 ? "s" : ""} com gás disponível`,
      detail:
        `${armed.map((w) => w.label).join(", ")} — somando ${money(armed.reduce((s, w) => s + w.valueUsd, 0))}. ` +
        `Tem ${gasSymbol} para pagar transação, então pode mover a qualquer momento. ` +
        `Abastecer é o passo obrigatório antes de vender, e costuma preceder a venda em minutos.`,
    });
  }

  const stuck = wallets.filter((w) => w.stuck);
  if (stuck.length > 0) {
    alerts.push({
      level: "info",
      title: `${money(stuck.reduce((s, w) => s + w.valueUsd, 0))} imobilizados por falta de gás`,
      detail:
        `${stuck.length} carteiras comuns com saldo e sem ${gasSymbol}. Não conseguem mover nada ` +
        `até alguém abastecê-las — é o que este painel vigia.`,
    });
  }

  if (liquidityUsd > 0) {
    const ratio = (sellable * price) / liquidityUsd;
    if (ratio > 50) {
      alerts.push({
        level: "warning",
        title: `Oferta destravada vale ${ratio.toFixed(0)}x a liquidez à vista`,
        detail:
          `${money(sellable * price)} podem virar venda contra uma pool de ${money(liquidityUsd)}. ` +
          `O preço de tela não é um preço em que esse volume tenha como sair.`,
      });
    }
  }

  const unverified = token.wallets.filter((w) => !w.verified).length;
  if (unverified > 0) {
    alerts.push({
      level: "info",
      title: `${unverified} rótulos não conferidos`,
      detail:
        `Vieram de terceiros e não foram confirmados on-chain. Token parado numa carteira ` +
        `de corretora é custódia de clientes; o mesmo saldo numa carteira de projeto é oferta.`,
    });
  }

  return alerts;
}
