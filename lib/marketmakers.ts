/**
 * AS CARTEIRAS DOS MARKET MAKERS — Wintermute, DWF Labs, GSR, Amber,
 * Cumberland, Jump, Auros e Galaxy —, pedidas pelo usuário em 09/11: "colocar
 * principalmente baleias market maker como Wintermute e outras. Pesquise quais
 * carteiras são e coloque elas".
 *
 * DE ONDE VEM CADA ENDEREÇO, e a régua é a da armadilha nº 1: rótulo errado
 * inverte a leitura, então nenhum endereço entrou de memória nem de notícia
 * solta. Duas fontes, as duas sem chave:
 *
 *   oficial    a própria firma publicou. Só a DWF Labs: Andrei Grachev, sócio,
 *              anunciou em 06/05/2025 no X a carteira "que vai guardar os tokens
 *              que compramos no mercado secundário" (x.com/ag_dwf/status/
 *              1919672605822390687), e duas agências reproduzem o mesmo
 *              endereço. `verificado: true`.
 *   etherscan  a etiqueta pública do Etherscan, lida do conjunto aberto
 *              `dawsbot/eth-labels` (commit d9b21ae, raspado do label cloud do
 *              Etherscan). É rótulo de terceiro — `verificado: false`, como a
 *              `watchlist.ts` marca o que não foi conferido. A Wintermute aparece
 *              lá sob a etiqueta própria ("Wintermute 1" a "5"); as outras, sob
 *              "fund" com o nome da firma.
 *
 * O que ficou DE FORA, de propósito: os endereços de depósito que o Etherscan
 * marca como da firma ("Jump Trading: Binance Deposit") — quem controla esses é
 * a corretora, e o saldo neles é zero o tempo todo; os da Alameda (29, fechada
 * desde 11/2022); e as carteiras do ataque de 2022 à Wintermute. Flow Traders,
 * B2C2, Keyrock, Selini e Kairon não têm endereço publicado nem etiqueta
 * pública; o que circula delas é "provável" de analista, e não entra.
 *
 * CONFERIDO ON-CHAIN EM 09/11/2026, endereço por endereço, nas três redes: todos
 * existem, e todos menos um são carteiras comuns com transações na Ethereum
 * (de 23 a 415.741) e, quase todos, na BNB Chain e na Base. Carteira comum é uma
 * CHAVE, e a mesma chave controla o mesmo endereço em toda rede EVM — por isso
 * o rótulo da Ethereum vale na BNB Chain e na Base. A exceção é a "Wintermute
 * 1", um contrato que só existe na Ethereum (`redes`).
 *
 * O QUE ELAS GUARDAM, MEDIDO NO MESMO DIA: quase nada on-chain. Nas 36 moedas da
 * lista com contrato, 15 tinham saldo em alguma destas carteiras, e o maior era
 * 0,2% do supply (Wintermute 4 na ZAMA). O estoque de um market maker mora na
 * corretora; o que a cadeia mostra é o MOVIMENTO — o projeto mandando token
 * para a firma, a firma mandando para a corretora. É isso que o monitor vigia
 * (`scripts/monitor.mts`), e é por isso que o saldo entra no histórico: "market
 * maker recebendo token antecede queda?" ainda não tem medição nenhuma.
 *
 * E NA HYPERLIQUID nenhuma delas opera pelo mesmo endereço: as 21 deram conta
 * vazia em 09/11. Lá os market makers são as contas que o critério das
 * execuções separa (`lib/hyperliquid.ts`), anônimas — a única com nome é a que
 * se chama "Auros" no ranking, nome que a própria conta escolheu.
 *
 * Puro e sem `node:`: a página o importa.
 */

import type { Chain } from "./onchain";
import type { WatchedWallet } from "./watchlist";

export type FonteDoRotulo = "oficial" | "etherscan";

export interface CarteiraDeMarketMaker {
  endereco: string;
  firma: string;
  /** O rótulo como a fonte escreve, para conferir na origem. */
  rotulo: string;
  fonte: FonteDoRotulo;
  /** As redes em que o endereço é desta firma: todas as EVM para carteira comum, só a do rótulo para contrato. */
  redes: Chain[];
}

const EVM: Chain[] = ["ethereum", "bsc", "base"];

export const MARKET_MAKERS: CarteiraDeMarketMaker[] = [
  // Wintermute — etiqueta própria no Etherscan. A 4 é a que mais opera: 170.589
  // transações na Ethereum, 18.143 na BNB Chain e 20.723 na Base em 09/11, e a
  // única com saldo relevante nas moedas da lista.
  { endereco: "0x0000006daea1723962647b7e189d311d757fb793", firma: "Wintermute", rotulo: "Wintermute 1", fonte: "etherscan", redes: ["ethereum"] },
  { endereco: "0x000002cba8dfb0a86a47a415592835e17fac080a", firma: "Wintermute", rotulo: "Wintermute 2", fonte: "etherscan", redes: EVM },
  { endereco: "0x5cddebd8a7b3bc60156550187bf5465b1c3290f5", firma: "Wintermute", rotulo: "Wintermute 3", fonte: "etherscan", redes: EVM },
  { endereco: "0xf8191d98ae98d2f7abdfb63a9b0b812b93c873aa", firma: "Wintermute", rotulo: "Wintermute 4", fonte: "etherscan", redes: EVM },
  { endereco: "0xce84449a8ebec019ac110a4b6662e55d0fd9f228", firma: "Wintermute", rotulo: "Wintermute 5", fonte: "etherscan", redes: EVM },
  { endereco: "0xdbf5e9c5206d0db70a90108bf936da60221dc080", firma: "Wintermute", rotulo: "Wintermute: 0xdbf…080", fonte: "etherscan", redes: EVM },
  // DWF Labs — a primeira é a publicada pela própria firma.
  { endereco: "0xf0984860f1f31a784c0ff0bb4d1322e377f97631", firma: "DWF Labs", rotulo: "DWF Labs: compras no mercado secundário (oficial)", fonte: "oficial", redes: EVM },
  { endereco: "0xd4b69e8d62c880e9dd55d419d5e07435c3538342", firma: "DWF Labs", rotulo: "DWF Labs: 0xD4B…342", fonte: "etherscan", redes: EVM },
  { endereco: "0xddacad3b1edee8e2f5b2e84f658202534fcb0374", firma: "DWF Labs", rotulo: "DWF Labs: 0xddA…374", fonte: "etherscan", redes: EVM },
  { endereco: "0x53c902a9ef069f3b85e5e71f918c4d582f3063fa", firma: "DWF Labs", rotulo: "DWFLabs: 0x53c…3Fa", fonte: "etherscan", redes: EVM },
  { endereco: "0xd8d6ffe342210057bf4dcc31da28d006f253cef0", firma: "GSR", rotulo: "GSR: 0xD8D…EF0", fonte: "etherscan", redes: EVM },
  { endereco: "0xa337321a3b9909aec6e7053ef8e8fdb24e4614f2", firma: "Amber Group", rotulo: "Amber Group: 0xA33…4F2", fonte: "etherscan", redes: EVM },
  { endereco: "0xe11970f2f3de9d637fb786f2d869f8fea44195ac", firma: "Amber Group", rotulo: "Amber Group", fonte: "etherscan", redes: EVM },
  { endereco: "0x87b49a99cbce4a9030e67919b776aa97d538adda", firma: "Cumberland", rotulo: "Cumberland: 0x87b…Dda", fonte: "etherscan", redes: EVM },
  { endereco: "0xad6eaa735d9df3d7696fd03984379dae02ed8862", firma: "Cumberland", rotulo: "Cumberland: 0xad6…862", fonte: "etherscan", redes: EVM },
  { endereco: "0xf584f8728b874a6a5c7a8d4d387c9aae9172d621", firma: "Jump Trading", rotulo: "Jump Trading", fonte: "etherscan", redes: EVM },
  { endereco: "0xff0cefdbd6bf757cc0cc361ddfbde432186ccaa6", firma: "Auros", rotulo: "Auros Global", fonte: "etherscan", redes: EVM },
  { endereco: "0x15abb66ba754f05cbc0165a64a11cded1543de48", firma: "Galaxy Digital", rotulo: "Galaxy Digital: 0x15a…E48", fonte: "etherscan", redes: EVM },
  { endereco: "0x33566c9d8be6cf0b23795e0d380e112be9d75836", firma: "Galaxy Digital", rotulo: "Galaxy Digital: OTC", fonte: "etherscan", redes: EVM },
  { endereco: "0x46f34c24a7ba7a2ac6dd76c3f09b32d41c144d08", firma: "Galaxy Digital", rotulo: "Galaxy Digital: 0x46f…d08", fonte: "etherscan", redes: EVM },
  { endereco: "0x4adf44961a7cbe8ee46b2bf04e7198e879677825", firma: "Galaxy Digital", rotulo: "Galaxy Digital: 0x4AD…825", fonte: "etherscan", redes: EVM },
];

/** As carteiras de market maker de uma rede. */
export function marketMakersNaRede(chain: Chain): CarteiraDeMarketMaker[] {
  return MARKET_MAKERS.filter((m) => m.redes.includes(chain));
}

/** A firma de um endereço, ou nulo. */
export function firmaDe(endereco: string): string | null {
  const e = endereco.toLowerCase();
  return MARKET_MAKERS.find((m) => m.endereco === e)?.firma ?? null;
}

/**
 * As carteiras de uma moeda com as dos market makers da rede dela junto, como
 * carteiras mapeadas de papel "marketmaker". Endereço que a moeda já mapeia
 * fica com o rótulo da moeda: quem mapeou à mão olhou aquela moeda.
 */
export function comMarketMakers(wallets: readonly WatchedWallet[], chain: Chain): WatchedWallet[] {
  const ja = new Set(wallets.map((w) => w.address.toLowerCase()));
  return [
    ...wallets,
    ...marketMakersNaRede(chain)
      .filter((m) => !ja.has(m.endereco))
      .map((m) => ({ address: m.endereco, label: m.rotulo.startsWith(m.firma) ? m.rotulo : `${m.firma}: ${m.rotulo}`, role: "marketmaker" as const, verified: m.fonte === "oficial" })),
  ];
}

/**
 * O saldo somado por firma, em fração do supply, a partir dos saldos lidos
 * (endereço em minúsculas → unidades inteiras do contrato). Firma sem saldo não
 * aparece. `supply` nas mesmas unidades.
 */
export function porFirma(saldos: ReadonlyMap<string, bigint>, supply: bigint, chain: Chain): Record<string, number> {
  const out: Record<string, number> = {};
  const zero = BigInt(0);
  if (supply <= zero) return out;
  for (const m of marketMakersNaRede(chain)) {
    const v = saldos.get(m.endereco) ?? zero;
    if (v <= zero) continue;
    // Em bigint até o fim da divisão: supply de 10^27 unidades não cabe em número com precisão.
    out[m.firma] = (out[m.firma] ?? 0) + Number((v * BigInt(1_000_000_000)) / supply) / 1e9;
  }
  return out;
}
