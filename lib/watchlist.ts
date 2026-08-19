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

import type { Chain } from "./onchain";

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
  | "dormant"
  /** Carrega token entre as carteiras grandes e o livro das corretoras. */
  | "router";

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
  chain: Chain;
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

      // -------------------------------------------- a camada de roteamento
      //
      // Estes três carregam o token entre as carteiras grandes e o livro. Não
      // foram informados: apareceram varrendo as duas moedas e são os mesmos
      // endereços nas duas — no LAB e na BTW.
      //
      // O comportamento deles no LAB é o achado que mais vale. O 0x238a3588
      // dominou todas as janelas da acumulação (março a abril, preço 0,17 →
      // 0,77), SUMIU durante a alta vertical inteira (maio a julho, 4,76 →
      // 16,58) e voltou depois do colapso. O silêncio dele marcou o começo da
      // parte vertical, quando o preço passa a subir com pouco volume porque o
      // float já está travado.
      //
      // Na BTW ele aparece em TODAS as doze janelas, inclusive a mais recente.
      // Enquanto estiver assim, a fase é de preparação, não de marcação.
      {
        address: "0x238a358808379702088667322f80ac48bad5e6c4",
        label: "roteador principal",
        role: "router",
        verified: true,
      },
      {
        address: "0x278d858f05b94576c1e6f73285886876ff6ef8d2",
        label: "roteador 2",
        role: "router",
        verified: true,
      },
      {
        address: "0xb300000b72deaeb607a12d5f54773d1c19c7028d",
        label: "roteador 3",
        role: "router",
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
  {
    symbol: "GPSUSDT",
    // GoPlus Security. Vive na BASE, não na BNB Chain — o contrato de mesmo
    // símbolo na BSC é outro projeto, com 179 milhões de supply e US$ 3 milhões
    // de FDV. O da Base tem os 10 bilhões que batem com o token listado, e é
    // nele que as carteiras informadas seguram 87,9% do total.
    chain: "base",
    contract: "0x0C1dC73159e30c4b06170F2593D3118968a0DCa5",
    // Primeira transferência em 2025-02-21, achada por busca binária.
    firstBlock: 26660000,
    wallets: [
      {
        address: "0xF977814e90dA44bFA03b6295A0616a897441aceC",
        // Endereço amplamente conhecido como carteira da Binance: segura 30 mil
        // ETH na Base, 739 mil ETH na Ethereum e 6,4 milhões de BNB na BNB
        // Chain. O rótulo vem de fora, mas a escala é confirmada on-chain.
        label: "Binance",
        role: "exchange",
        verified: false,
      },

      // ---------------------------------------------------- os nove contratos
      //
      // Todos são CONTRATO com exatamente uma transação e zero ETH, segurando
      // de 1,7% a 16,3% cada. Somam 57,2% do supply. O padrão — alocações
      // redondas, imóveis, em código em vez de carteira — é de trava por
      // cronograma, e a saída de qualquer uma delas é o evento que importa.
      {
        address: "0x7bBbB6fb4DC48E7DF86D2a11f8cdF9a687091300",
        label: "trava 16,3%",
        role: "lock",
        verified: true,
      },
      {
        address: "0x7448817552B70F9E423710B704Aa1cE7c4218e7d",
        // Exatamente 1.600.000.000 — número redondo demais para ser acaso.
        label: "trava 16,0%",
        role: "lock",
        verified: true,
      },
      {
        address: "0x0b3c68A69205C2fffE5B10DF9994C306172fee43",
        label: "trava 8,0%",
        role: "lock",
        verified: true,
      },
      {
        address: "0xC2bcb8170fCf72040E03f0AfD937D27E6F178619",
        label: "trava 6,5%",
        role: "lock",
        verified: true,
      },
      {
        address: "0x9Df0A205BaE0E8A8866d73ED960EDfa17a56251B",
        label: "trava 2,4%",
        role: "lock",
        verified: true,
      },
      {
        address: "0xf1afc52B48d12D9DCf6f9527D35fF877e5826d81",
        label: "trava 2,3%",
        role: "lock",
        verified: true,
      },
      {
        address: "0x2075C84869bdb934164514Db0ea099C7B816868C",
        label: "trava 2,3%",
        role: "lock",
        verified: true,
      },
      {
        address: "0x01efc19badCAC4EDaE0d75c5F344AcD0F7311722",
        label: "trava 1,8%",
        role: "lock",
        verified: true,
      },
      {
        address: "0xDf79f254f0c7dec970A6a3df86Cf149bdb642F55",
        label: "trava 1,7%",
        role: "lock",
        verified: true,
      },

      // ------------------------------------------------ infraestrutura pesada
      //
      // Milhões de transações e milhares de ETH de gás: é corretora ou serviço
      // de custódia, não carteira de projeto. Qual delas, não dá para saber
      // pela cadeia.
      {
        address: "0xBaeD383EDE0e5d9d72430661f3285DAa77E9439F",
        label: "corretora (1,96M txs)",
        role: "exchange",
        verified: false,
      },
      {
        address: "0x0D0707963952f2fBA59dD06f2b425ace40b492Fe",
        label: "corretora (1,57M txs)",
        role: "exchange",
        verified: false,
      },
      {
        address: "0xf89d7b9c864f589bbF53a82105107622B35EaA40",
        // Zerada de GPS na Base, mas segura 101 milhões do token homônimo na
        // BSC. Fica na lista porque saldo zero é informação: se encher, alguém
        // voltou a movimentar.
        label: "zerada na Base",
        role: "dormant",
        verified: true,
      },
    ],
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
