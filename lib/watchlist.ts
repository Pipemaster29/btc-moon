/**
 * As moedas e as carteiras sob observação.
 *
 * Este arquivo é a única coisa que precisa ser editada para acompanhar outra
 * moeda: contrato, símbolo do perpétuo e as carteiras que importam. O resto dos
 * scripts lê daqui.
 *
 * Sobre os rótulos: os nomes de corretora vieram de quem montou a lista, não de
 * uma verificação em cadeia. Isso muda a leitura — token parado numa carteira
 * fria de corretora é custódia de clientes, enquanto o mesmo saldo numa carteira
 * de projeto é oferta pronta para ser vendida. Rótulo errado inverte a conclusão,
 * então `verificado` marca o que foi conferido on-chain e o que ainda é palpite.
 */

export interface WatchedWallet {
  address: string;
  label: string;
  /** true quando o rótulo foi conferido; false quando veio de terceiros. */
  verified: boolean;
}

export interface WatchedToken {
  /** Símbolo do perpétuo na Binance de futuros. */
  symbol: string;
  chain: string;
  /** Contrato ERC-20/BEP-20; vazio quando a moeda não vive nesta rede. */
  contract: string;
  wallets: WatchedWallet[];
}

export const WATCHLIST: WatchedToken[] = [
  {
    symbol: "BTWUSDT",
    chain: "bsc",
    // Bitway Token, confirmado on-chain: símbolo BTW, 18 decimais,
    // 10 bilhões de supply.
    contract: "0x444045B0EE1ee319A660a5E3d604CA0ffA35ACaA",
    wallets: [
      {
        address: "0x26209d9f0Dc3aC0129C3FB1bADaBFeb9eE728c66",
        label: "Bitget (fria)",
        verified: false,
      },
      {
        address: "0x73D8bD54F7Cf5FAb43fE4Ef40A62D390644946Db",
        // Tem código: é contrato, não carteira comum. Uma carteira de
        // corretora não seria — o rótulo original provavelmente está errado.
        label: "Binance (contrato)",
        verified: false,
      },
      {
        address: "0x4982085C9e2F89F2eCb8131Eca71aFAD896e89CB",
        label: "MEXC",
        verified: false,
      },
      {
        address: "0x7FcBd9d429932A11884Cb5CE9c61055b369F56F7",
        label: "Binance",
        verified: false,
      },
      {
        address: "0x1AB4973a48dc892Cd9971ECE8e01DcC7688f8F23",
        label: "Bitget (quente)",
        verified: false,
      },
    ],
  },
  {
    symbol: "PRLUSDT",
    chain: "bsc",
    // O PRL negociado com volume é o Perle, que vive na Solana — fora do
    // alcance da leitura on-chain daqui. O contrato BSC de mesmo símbolo é
    // outro projeto (Parallel Token, US$ 445 mil de FDV e quatro negócios por
    // dia): usá-lo mediria a moeda errada. Sem contrato, este símbolo é
    // acompanhado só pelo lado dos derivativos.
    contract: "",
    wallets: [],
  },
];

export function findToken(symbol: string): WatchedToken | undefined {
  return WATCHLIST.find((t) => t.symbol === symbol.toUpperCase());
}

/** Rótulo de um endereço, ou o próprio endereço abreviado. */
export function labelOf(token: WatchedToken, address: string): string {
  const known = token.wallets.find(
    (w) => w.address.toLowerCase() === address.toLowerCase(),
  );
  if (known) return known.label;
  return `${address.slice(0, 8)}…${address.slice(-4)}`;
}
