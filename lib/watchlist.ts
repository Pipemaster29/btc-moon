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

/**
 * O papel de uma carteira, que decide se o saldo dela conta como oferta.
 *
 * A distinção importa mais do que o tamanho: um bilhão travado num contrato e um
 * bilhão numa carteira com gás são o mesmo número e riscos opostos. É a soma dos
 * papéis, não a do supply, que diz quanto pode ser vendido.
 */
export type WalletRole =
  /** Contrato que segura o token; só sai se quem administra mandar. */
  | "lock"
  /** Carteira que distribui — origem dos repasses. */
  | "treasury"
  /** Custódia de corretora. */
  | "exchange"
  /** Carteira ativa, com gás e histórico. */
  | "operational"
  /** Tem saldo mas nunca gastou e não tem gás: não consegue mover. */
  | "dormant";

export interface WatchedWallet {
  address: string;
  label: string;
  role: WalletRole;
  /** true quando o rótulo foi conferido; false quando veio de terceiros. */
  verified: boolean;
}

export interface WatchedToken {
  /** Símbolo do perpétuo na Binance de futuros. */
  symbol: string;
  chain: string;
  /** Contrato ERC-20/BEP-20; vazio quando a moeda não vive nesta rede. */
  contract: string;
  /** Bloco da primeira transferência — o começo da vida do token. */
  firstBlock: number;
  wallets: WatchedWallet[];
}

export const WATCHLIST: WatchedToken[] = [
  {
    symbol: "BTWUSDT",
    chain: "bsc",
    // Bitway Token, confirmado on-chain: símbolo BTW, 18 decimais,
    // 10 bilhões de supply.
    contract: "0x444045B0EE1ee319A660a5E3d604CA0ffA35ACaA",
    // Primeira transferência em 2026-02-27, achada por busca binária sobre os
    // logs. O perpétuo só nasceu em junho: a moeda é mais velha que o pump.
    firstBlock: 83663846,
    wallets: [
      {
        address: "0x26209d9f0Dc3aC0129C3FB1bADaBFeb9eE728c66",
        label: "Bitget (fria)",
        role: "exchange",
        verified: false,
      },
      {
        address: "0x73D8bD54F7Cf5FAb43fE4Ef40A62D390644946Db",
        // Tem código: é contrato, não carteira comum. Uma carteira de
        // corretora não seria — o rótulo original provavelmente está errado.
        label: "Binance (contrato)",
        role: "exchange",
        verified: false,
      },
      {
        address: "0x4982085C9e2F89F2eCb8131Eca71aFAD896e89CB",
        label: "MEXC",
        role: "exchange",
        verified: false,
      },
      {
        address: "0x7FcBd9d429932A11884Cb5CE9c61055b369F56F7",
        label: "Binance",
        role: "exchange",
        verified: false,
      },
      {
        address: "0x1AB4973a48dc892Cd9971ECE8e01DcC7688f8F23",
        label: "Bitget (quente)",
        role: "exchange",
        verified: false,
      },
      // Estas duas não vieram da lista original: apareceram na varredura como
      // destino do movimento de 16/08. Receberam 12M e 8M em valores redondos,
      // cada uma precedida por uma transferência de teste, e desde então não
      // moveram nada. Estão sem BNB, então não CONSEGUEM mover — a chegada de
      // gás em qualquer uma delas é o aviso de que a venda vem a seguir.
      {
        address: "0x97673748476e5D7b0c3d944094aD7ce45fE90261",
        label: "novo 12M (16/08)",
        role: "dormant",
        verified: true,
      },
      {
        address: "0xd34E22fc32bFE217c112fB037361b612c54471d9",
        label: "novo 8M (16/08)",
        role: "dormant",
        verified: true,
      },

      // ------------------------------------------------------ o supply travado
      //
      // Estas explicam os 94% que faltavam. O supply nunca foi emitido por
      // evento `Transfer` — o contrato alocou tudo no construtor —, então
      // nenhuma varredura de log jamais as encontraria. Só apareceram porque
      // foram informadas, e os saldos foram conferidos on-chain.
      {
        address: "0x76D77531258b4DDDFA4087e97A6C89Bc0f0f1e50",
        // 10.805 bytes de código, `token()` aponta para o BTW e `owner()` para
        // outro contrato. É uma trava administrada: sai quando o dono mandar.
        label: "trava principal",
        role: "lock",
        verified: true,
      },
      {
        address: "0xcD3e5E5Ca176aF4958Ee33E346CC5eE93Eca73D7",
        // 171 bytes — tamanho de proxy mínimo. Segura US$ 414 milhões com
        // praticamente nenhuma lógica própria, o mesmo tamanho do dono do token
        // e do dono da trava principal: os três saíram da mesma fábrica.
        label: "trava (proxy)",
        role: "lock",
        verified: true,
      },
      {
        address: "0x7d455713A6e14967fA145c7F5204122aebfd9256",
        // É a origem da primeira transferência do token que existe em log.
        // Tem gás e 188 transações: é daqui que a distribuição sai.
        label: "distribuidora",
        role: "treasury",
        verified: true,
      },
      {
        address: "0x93dEb693b170d56BdDe1B0a5222B14c0F885d976",
        // 3.032 transações e 79 BNB de gás — a única do conjunto com folga
        // operacional de sobra.
        label: "operacional",
        role: "operational",
        verified: true,
      },
      {
        address: "0x61D8Cff69Ed737d7a937BbCf72E02CD1639ac9b4",
        label: "101M",
        role: "dormant",
        verified: true,
      },
      {
        address: "0x60aDd99bc0A85c5F67e16eF0c45fb600D50855ad",
        label: "96M",
        role: "dormant",
        verified: true,
      },
      {
        address: "0x87dC0E03e7AC509Cd4500B18a3D104BE1C9b1383",
        // 76 transações e BNB no saldo: mexe pouco, mas mexe. Chamar de parada
        // subestimaria a oferta que pode virar venda.
        label: "59M ativa",
        role: "operational",
        verified: true,
      },
      // Quatro carteiras com valores redondos, zero transações enviadas e zero
      // BNB. Foram carregadas e deixadas paradas — não conseguem mover nada.
      {
        address: "0x003a728D8a8d3c980481201B5Bf49576ed63689F",
        label: "25M parada",
        role: "dormant",
        verified: true,
      },
      {
        address: "0x41B0680F8Af499dBA032e54bCf074A82ba2B4040",
        label: "25M parada",
        role: "dormant",
        verified: true,
      },
      {
        address: "0xA006DEB36D74cFA4024400A74bE87ad66B545C9d",
        label: "25M parada",
        role: "dormant",
        verified: true,
      },
      {
        address: "0x539814c803a4207f2Ac7c54Cda80DDB7D1e8Dfc4",
        label: "20M parada",
        role: "dormant",
        verified: true,
      },
      // Estas quatro estão zeradas hoje. Ficam na lista porque saldo zero é
      // informação: se encherem, alguém voltou a movimentar.
      {
        address: "0x8549F3C2deF32734C27C57F16dc188f8C935Bf99",
        label: "contrato vazio",
        role: "dormant",
        verified: true,
      },
      {
        address: "0x71720eF192F5ae7fF616904feAE4a7EC272Ab2b4",
        label: "contrato vazio",
        role: "dormant",
        verified: true,
      },
      {
        address: "0x0f614ec11588e9cb53Ad3c45dE5DD71AdC8F6fDe",
        label: "contrato vazio",
        role: "dormant",
        verified: true,
      },
      {
        address: "0x729d894f658A12B562f372Bf5cB6C039a1531436",
        label: "carteira vazia",
        role: "dormant",
        verified: true,
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
    firstBlock: 0,
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
