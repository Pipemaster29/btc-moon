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
  /** Contrato que segura o token por cronograma, sem chave que libere antes. */
  | "lock"
  /**
   * Cofre multi-assinatura: sai quando N pessoas concordarem, e só isso.
   *
   * Separado de `lock` porque a diferença é tudo. Uma trava por cronograma tem
   * data; um cofre 2-de-3 tem apenas duas pessoas. Chamar os dois de travado
   * subestima a oferta disponível pelo pior fator possível.
   */
  | "multisig"
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
  /**
   * Quando preenchido, a moeda sai das análises sem sair da lista.
   *
   * Aposentar não é o mesmo que apagar, e a diferença importa. Apagar perderia
   * o contrato conferido, a rede e o histórico já coletado — e se a moeda
   * voltar a se mexer, tudo teria de ser redescoberto. Aposentada, ela some do
   * painel e do monitor, para de consumir requisição, e volta apagando uma
   * linha.
   *
   * A decisão é SEMPRE manual. O classificador tem o estágio "exausta", e seria
   * tentador aposentar sozinho quem cair nele — mas o backtest mostrou que
   * exausta é justamente a fase de melhor retorno adiante, e uma moeda que caiu
   * 80% pode estar morta ou pode estar na véspera de um segundo ciclo. Quem
   * decide isso é quem olha, não a regra.
   */
  aposentada?: { desde: string; porque: string };
  /**
   * Por que esta moeda é acompanhada só pelo perpétuo.
   *
   * Existe porque a explicação estava escrita na página, presa a um símbolo:
   * ao trocar a moeda, o texto continuaria falando da anterior. Aqui ela anda
   * junto de quem a explica.
   */
  note?: string;
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
        // NÃO é trava por cronograma. O `owner()` é um cofre Gnosis Safe que
        // exige apenas 2 de 3 assinaturas, e dois dos três signatários são a
        // carteira distribuidora e a "59M ativa" — ambas já nesta lista. Ou
        // seja: 72,92% do supply se move quando duas pessoas concordarem.
        label: "cofre 2-de-3 (72,9%)",
        role: "multisig",
        verified: true,
      },
      {
        address: "0xcD3e5E5Ca176aF4958Ee33E346CC5eE93Eca73D7",
        // Gnosis Safe de 4 de 6, confirmado por `getThreshold()` e
        // `getOwners()`. Os 171 bytes são o proxy padrão do Safe — o mesmo
        // tamanho do dono do token e do dono do cofre maior, porque os três SÃO
        // cofres Safe, não travas.
        label: "cofre 4-de-6 (12,0%)",
        role: "multisig",
        verified: true,
      },
      {
        address: "0x7d455713A6e14967fA145c7F5204122aebfd9256",
        // Origem da primeira transferência do token que existe em log, e
        // signatária dos TRÊS cofres: o de 72,9%, o de 12,0% e o que é dono do
        // contrato. É o endereço com mais poder sobre a moeda.
        label: "distribuidora · signatária",
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
        // Signatária dos três cofres, junto com a distribuidora. Mexe pouco em
        // saldo próprio, mas é uma das duas assinaturas que bastam para mover
        // 72,92% do supply.
        label: "59M · signatária",
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
      // Terceiro signatário dos cofres, sem saldo próprio relevante. Entra na
      // lista porque assinatura é poder mesmo sem saldo.
      {
        address: "0x7c86f7fe5843c226b7c7878656ea70d34ba8e37c",
        label: "signatária 3",
        role: "operational",
        verified: true,
      },
      // ------------------------------------------------ o leque de 19/08
      //
      // Entre 18h30 e 19h07 UTC de 19/08, logo depois da queda de 50%, saíram
      // 150 milhões de BTW (1,5% do supply, ~US$ 53 mi) da fria da Bitget,
      // passaram pela quente e foram para estes cinco endereços — 30 milhões
      // exatos em cada um.
      //
      // Os cinco eram novos, nunca enviaram nada e estão com ZERO BNB. Ou seja:
      // fisicamente impedidos de mover até alguém abastecê-los. É por isso que
      // entram como `dormant` e não como algo mais brando — nesse papel o
      // radar dispara o alerta de gás chegando, que é o que dá minutos de
      // aviso antes de qualquer movimento.
      //
      // O que isto NÃO prova: que vão vender. Retirada em pedaços iguais para
      // carteiras novas é o padrão de quem quebra a trilha antes de distribuir,
      // mas também é o que parece um cliente grande levando para custódia
      // própria. O LAB não fez leque nenhum antes do topo dele — fez uma
      // retirada única. O que decide é o que acontece depois: para vender numa
      // corretora, esses 150 milhões precisam VOLTAR para uma.
      {
        address: "0x8f5f8958d27adb5211f2f57201b6f7cfa325d3b1",
        label: "leque 1 (30M, 19/08)",
        role: "dormant",
        verified: true,
      },
      {
        address: "0x452e2fb2b0025cd9a59b906c34d3f2ee606d8d6e",
        label: "leque 2 (30M, 19/08)",
        role: "dormant",
        verified: true,
      },
      {
        address: "0xbd530e13774eb81626d744302e5a6b6f5e3f9c78",
        label: "leque 3 (30M, 19/08)",
        role: "dormant",
        verified: true,
      },
      {
        address: "0x492052ba92a3fe0385fe4dc29099f4e0ad11a25c",
        label: "leque 4 (30M, 19/08)",
        role: "dormant",
        verified: true,
      },
      {
        address: "0x9948b5257b9d9b5d06672ae2279e5785965236df",
        label: "leque 5 (30M, 19/08)",
        role: "dormant",
        verified: true,
      },
    ],
  },
  {
    // O BTW da Ethereum é OUTRO token, não uma ponte do da BNB Chain: supply
    // próprio de 1 bilhão, e nenhuma das carteiras que controlam o da BSC
    // aparece aqui. O que muda a leitura é a liquidez — US$ 39 milhões contra
    // US$ 110 mil na BSC, ou seja, o mercado à vista de verdade está aqui.
    //
    // Sem carteira mapeada, entra pelo lado do preço e da liquidez. O perpétuo
    // da Binance é o mesmo símbolo, então não há painel de derivativos próprio.
    symbol: "BTW-ETH",
    chain: "ethereum",
    contract: "0x41c9eE7a06FF69F0BF63Ec4B5A928279B26469EE",
    firstBlock: 0,
    wallets: [],
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
    note:
      "O PRL negociado com volume é o Perle, que vive na Solana — fora do alcance da leitura " +
      "on-chain daqui. O contrato BSC de mesmo símbolo é outro projeto, com US$ 445 mil de FDV " +
      "e quatro negócios por dia: usá-lo mediria a moeda errada.",
  },
  {
    // Akedo (AKE), na BNB Chain — conferido on-chain: símbolo AKE, 18 decimais,
    // 100 bilhões de supply. O preço à vista bate com o do perpétuo
    // (US$ 0,00869 contra US$ 0,00872), que é o teste que separa a moeda certa
    // de um homônimo: entre o mesmo ativo a arbitragem não deixa a diferença
    // passar de um dígito percentual.
    //
    // Registro do erro, porque ele é reincidente: procurei "AKE" no DexScreener,
    // vieram doze tokens chamados AKEDO na Solana, e eu tratei o de maior
    // liquidez como o certo — ele negociava 36% abaixo do perpétuo, que era
    // justamente o sinal de que NÃO era. A busca por nome devolve o mercado
    // inteiro de homônimos; o que identifica a moeda é o preço bater com o
    // derivativo que se está lendo.
    //
    // Escala contra a BTW: US$ 869 milhões de FDV e US$ 1,45 milhão de liquidez
    // à vista — dez vezes a pool da BTW. Ou seja, aqui o mercado à vista tem
    // peso de verdade, e o preço não é formado só no perpétuo.
    symbol: "AKEUSDT",
    chain: "bsc",
    contract: "0x2c3a8Ee94dDD97244a93Bc48298f97d2C412F7Db",
    firstBlock: 0,
    wallets: [
      // As carteiras de corretora são as mesmas entre tokens — o que muda é o
      // saldo. Conferidas agora: a Binance carrega 3,16% do supply e a MEXC
      // 0,06%; Bitget e a quente da Binance estão zeradas em AKE.
      {
        address: "0x73D8bD54F7Cf5FAb43fE4Ef40A62D390644946Db",
        label: "Binance (contrato)",
        role: "exchange",
        verified: true,
      },
      {
        address: "0x4982085C9e2F89F2eCb8131Eca71aFAD896e89CB",
        label: "MEXC",
        role: "exchange",
        verified: true,
      },
      {
        address: "0x1AB4973a48dc892Cd9971ECE8e01DcC7688f8F23",
        label: "Bitget (quente)",
        role: "exchange",
        verified: true,
      },
      {
        address: "0x26209d9f0Dc3aC0129C3FB1bADaBFeb9eE728c66",
        label: "Bitget (fria)",
        role: "exchange",
        verified: true,
      },
      {
        address: "0x7FcBd9d429932A11884Cb5CE9c61055b369F56F7",
        label: "Binance",
        role: "exchange",
        verified: true,
      },
    ],
  },
  // ------------------------------------------------------------------------
  // A lista de moedas manipuladas.
  //
  // Cada contrato aqui passou por dois testes, e os dois são necessários. O
  // PREÇO À VISTA bate com o do perpétuo dentro de 10% — entre o mesmo ativo a
  // arbitragem não deixa a diferença crescer, e um homônimo erra por dezenas ou
  // milhares de por cento. E a POOL GIRA pelo menos 1% do próprio tamanho por
  // dia: o VVV aparecia com US$ 775 milhões de liquidez e volume ZERO, que é
  // pool decorativa e não absorve venda nenhuma. Os dois testes juntos
  // corrigiram três identificações que o primeiro sozinho errava.
  //
  // Sem carteira mapeada ainda: o `wallets` vazio significa que a leitura
  // on-chain cobre preço, liquidez e transferências grandes, mas não sabe quem
  // é quem. Mapear exige os endereços — foi assim que a BTW ganhou as 31 dela.
  //
  // Regerar com: npm run descobrir
  // ------------------------------------------------------------------------
  {
    // OI pelo perpétuo · sem contrato principal conferido
    symbol: "VELVETUSDT",
    chain: "base",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: o contrato da Base é fragmento — guarda menos tokens do que o circulante. Descartados os fragmentos, o melhor candidato restante erra 97% no preço, então nenhum contrato mede a moeda inteira.",
  },
  {
    // liquidez 200k · giro 0.23x/dia · OI 2.5mi · preço bate em 2.3%
    symbol: "USUSDT",
    chain: "bsc",
    contract: "0x51f1AFC16E154d1601e61EcA21d8Af4897f1e840",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 3.9mi · giro 1.14x/dia · OI 2.2mi · preço bate em 1.5%
    symbol: "UBUSDT",
    chain: "bsc",
    contract: "0x40b8129B786D766267A7a118cF8C07E31CDB6Fde",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 15.8mi · giro 0.52x/dia · OI 2.0mi · preço bate em 2.6%
    symbol: "VVVUSDT",
    chain: "base",
    contract: "0xacfE6019Ed1A7Dc6f7B508C02d1b04ec88cC21bf",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 2.4mi · giro 0.34x/dia · OI 1.8mi · preço bate em 0.5%
    symbol: "TAGUSDT",
    chain: "bsc",
    contract: "0x208bF3E7dA9639f1Eaefa2DE78c23396B0682025",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 271k · giro 0.47x/dia · OI 1.7mi · preço bate em 0.7%
    symbol: "EVAAUSDT",
    chain: "bsc",
    contract: "0xaa036928c9c0Df07d525B55ea8EE690Bb5a628C1",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 16k · giro 1.12x/dia · OI 1.5mi · preço bate em 1.1%
    symbol: "CYSUSDT",
    chain: "bsc",
    contract: "0x0C69199C1562233640e0Db5Ce2c399A88eB507C7",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 1.3mi · giro 0.04x/dia · OI 1.4mi · preço bate em 2.2%
    symbol: "BRUSDT",
    chain: "bsc",
    contract: "0xFf7d6A96ae471BbCD7713aF9CB1fEeB16cf56B41",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 31k · giro 0.08x/dia · OI 1.1mi · preço bate em 6.7%
    symbol: "BASEDUSDT",
    chain: "ethereum",
    contract: "0x4f2b33840227DDD0e28da8d4185D6fa07ADfed87",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 67k · giro 1.46x/dia · OI 803k · preço bate em 1.3%
    symbol: "CAPUSDT",
    chain: "bsc",
    contract: "0x99991c6AAbba5a096f24f250b73580F5179b9999",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 1.0mi · giro 0.13x/dia · OI 789k · preço bate em 0.3%
    symbol: "BLUAIUSDT",
    chain: "bsc",
    contract: "0xed9Ae3DEF8d6F052971Bb8b6d1975FF267Cf9aaD",
    firstBlock: 0,
    wallets: [],
  },
  {
    // OI pelo perpétuo · sem contrato principal conferido
    symbol: "ZEREBROUSDT",
    chain: "base",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: o contrato da Base guarda 1.15 milhão de tokens contra 1.000 milhões circulando. É implantação secundária — foi o caso que fez nascer o terceiro teste.",
  },
  {
    // liquidez 17k · giro 1.26x/dia · OI 670k · preço bate em 1.0%
    symbol: "REUSDT",
    chain: "ethereum",
    contract: "0x526526528F35AC738177003b8773B402B8Df8143",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 1.2mi · giro 5.58x/dia · OI 630k · preço bate em 0.0%
    symbol: "HANAUSDT",
    chain: "bsc",
    contract: "0x6261963EbE9Ff014aAd10eCc3b0238D4D04E8353",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 1.3mi · giro 7.79x/dia · OI 601k · preço bate em 2.1%
    symbol: "ONUSDT",
    chain: "bsc",
    contract: "0x0e4F6209eD984b21EDEA43acE6e09559eD051D48",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 14k · giro 0.08x/dia · OI 426k · preço bate em 2.8%
    symbol: "JCTUSDT",
    chain: "ethereum",
    contract: "0xC477B6dfd26EC2460b3b92de18837Fd476Ea7549",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 57k · giro 0.48x/dia · OI 425k · preço bate em 1.0%
    symbol: "BULLAUSDT",
    chain: "bsc",
    contract: "0x595E21b20E78674F8a64C1566A20b2b316Bc3511",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 1.1mi · giro 0.35x/dia · OI 673k · preço bate em 0.6%
    symbol: "MORPHOUSDT",
    chain: "ethereum",
    contract: "0x58D97B57BB95320F9a05dC918Aef65434969c2B2",
    firstBlock: 0,
    wallets: [],
    note: "O contrato da Base guardava uma fração do circulante — era implantação secundária, e toda leitura de % do supply em cima dele nascia inflada. O contrato principal vive na Ethereum.",
  },
  {
    // liquidez 143k · giro 0.21x/dia · OI 388k · preço bate em 1.5%
    symbol: "EPICUSDT",
    chain: "ethereum",
    contract: "0x94314a14Df63779c99C0764a30e0CD22fA78fC0E",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 521k · giro 3.12x/dia · OI 361k · preço bate em 1.0%
    symbol: "ZAMAUSDT",
    chain: "ethereum",
    contract: "0xA12CC123ba206d4031D1c7f6223D1C2Ec249f4f3",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 759k · giro 0.02x/dia · OI 246k · preço bate em 0.0%
    symbol: "XNYUSDT",
    chain: "bsc",
    contract: "0xE3225e11Cab122F1a126A28997788E5230838ab9",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 926k · giro 2.68x/dia · OI 209k · preço bate em 0.3%
    symbol: "STABLEUSDT",
    chain: "bsc",
    contract: "0x011EBe7d75E2C9D1E0bD0be0bEf5C36f0A90075F",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 2.0mi · giro 0.38x/dia · OI 191k · preço bate em 0.7%
    symbol: "BASUSDT",
    chain: "bsc",
    contract: "0x0F0df6cB17ee5E883eddFEf9153fC6036BDB4e37",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 1.2mi · giro 1.08x/dia · OI 102k · preço bate em 0.9%
    symbol: "AGTUSDT",
    chain: "bsc",
    contract: "0x5dBde81fcE337FF4bcaaEe4Ca3466C00aeCaE274",
    firstBlock: 0,
    wallets: [],
  },
  // ------------------------------------------------------------------------
  // Moedas em que só o perpétuo entra.
  //
  // Não é falta de vontade: em cada uma o candidato on-chain reprovou num dos
  // dois testes. Ou o preço não bate com o do derivativo — e aí é homônimo — ou
  // a pool é pequena demais para significar coisa alguma. O `chain` é "bsc" só
  // para satisfazer o tipo; com `contract` vazio nada de rede é lido.
  //
  // Vale mais do que parece: posicionamento, mapa de liquidação, natureza da
  // alta e saída das baleias não dependem de contrato nenhum.
  // ------------------------------------------------------------------------
  {
    symbol: "UAIUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: pool de US$ 9 mil. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    symbol: "APRUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: pool de US$ 3 mil. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    symbol: "CCUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: melhor candidato erra 78% no preço. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    symbol: "COLLECTUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: pool de US$ 2 mil. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    symbol: "MAGMAUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: nenhum par em rede EVM. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    symbol: "RIFUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: melhor candidato erra 100% no preço. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    symbol: "JELLYJELLYUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: nenhum par em rede EVM. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    symbol: "ALLOUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: melhor candidato erra 19% no preço. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    symbol: "BPUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: melhor candidato erra 98% no preço. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    symbol: "QUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: nenhum par em rede EVM. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    symbol: "JSTUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: pool de US$ 43 — o JST de verdade vive na Tron. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    symbol: "BANUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: melhor candidato erra 90% no preço. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    symbol: "ARCUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: melhor candidato erra 100% no preço. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    symbol: "BUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: nenhum par em rede EVM. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    // liquidez 33k · giro 0.23x/dia · preço bate em 0,8%
    symbol: "CLOUSDT",
    chain: "bsc",
    contract: "0x81D3A238b02827F62B9f390f947D36d4A5bf89D2",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 875k · giro 16.41x/dia · preço bate em 0,3%
    symbol: "DOSUSDT",
    chain: "bsc",
    contract: "0xB0f09ea9ae0515C3551080D4a745C8115aA30e37",
    firstBlock: 0,
    wallets: [],
  },
  {
    // Chainbase. O ticker de uma letra derrotou a busca por nome — procurar
    // "C" no DexScreener devolve o mercado inteiro, e nenhum candidato passava.
    // Achado buscando "chainbase": preço bate em 0,2%, pool de 759k girando
    // 0,33x por dia.
    symbol: "CUSDT",
    chain: "bsc",
    contract: "0xc32cc70741c3A8433dCbcB5adE071c299B55FfC8",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 74k · giro 0.55x/dia · preço bate em 0,6%
    //
    // Cuidado com o vizinho: existe também POWRUSDT na Binance, que é a
    // Powerledger — projeto antigo, US$ 0,039 contra US$ 0,093 daqui. São moedas
    // diferentes com nome parecido, e trocar uma pela outra mediria a errada.
    symbol: "POWERUSDT",
    chain: "bsc",
    contract: "0x9dC44ae5BE187ECA9e2A67e33f27A4c91cEA1223",
    firstBlock: 0,
    wallets: [],
  },
  {
    // Ava AI. Identificada pelos três testes, mas vive na SOLANA: o mint
    // DKu9kykSfbN5LBfFXtNNDPaX35o4Fv6vJ9FKk7pZpump negocia a US$ 0,0141 contra
    // US$ 0,01416 do perpétuo — 0,4% de erro — com pool de US$ 1,63 milhão
    // girando 2,51x por dia. Fica registrado aqui para o dia em que existir
    // adaptador de Solana; hoje a leitura on-chain é toda EVM.
    //
    // Cuidado com os vizinhos, que são três e todos reais: AVAAI é esta;
    // EVAA é outra moeda, com US$ 2,4 milhões de volume contra US$ 108 milhões
    // desta; e AVAA não existe. Errar entre elas mede a moeda errada.
    symbol: "AVAAIUSDT",
    chain: "solana",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note:
      "A Ava AI vive na Solana, e a leitura on-chain daqui é de redes EVM. O mint foi " +
      "identificado (DKu9kyk…pZpump, preço batendo em 0,4% e pool girando 2,5x por dia), mas ler " +
      "saldo lá exige outro adaptador: SPL token guarda saldo em contas separadas em vez de num " +
      "mapa dentro do contrato. O lado dos derivativos vale por inteiro.",
  },
  {
    // liquidez 617k · giro 13.29x/dia · preço bate em 1,7%
    symbol: "HEMIUSDT",
    chain: "bsc",
    contract: "0x5fFD0EAdc186AF9512542d0d5e5eAFC65d5aFc5B",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 264k · giro 1.00x/dia · preço bate em 0,1%
    symbol: "TAUSDT",
    chain: "bsc",
    contract: "0x539AE81A166E5E80aEd211731563e549c411b140",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 125k · giro 0.10x/dia · preço bate em 1,9%
    symbol: "SYNUSDT",
    chain: "ethereum",
    contract: "0x0f2D719407FdBeFF09D87557AbB7232601FD9F29",
    firstBlock: 0,
    wallets: [],
  },
  {
    // liquidez 6.6mi · giro 0.54x/dia · preço bate em 1,4% — a maior pool das
    // que entraram nesta leva.
    symbol: "SKYAIUSDT",
    chain: "bsc",
    contract: "0x92aa03137385F18539301349dcfC9EbC923fFb10",
    firstBlock: 0,
    wallets: [],
  },
  // ------------------------------------------------------------------------
  // Desta leva, seis ficaram só no perpétuo: a busca por ticker e por nome não
  // achou par EVM nenhum que passasse nos três testes. Provavelmente vivem em
  // redes fora do alcance da leitura on-chain daqui, como a Solana.
  //
  // A LAB é caso à parte e vale registrar: o contrato dela na BNB Chain é
  // 0x7ec43Cf65F1663F820427C62A5780b8f2E25593A, e foi com ele que a assinatura
  // do topo foi medida — saldo somado das corretoras caindo 95% na subida e
  // devolvendo 1% do supply no dia exato da máxima, 02/06. Hoje ele não responde
  // mais e as pools sumiram, que é o que acontece quando o ciclo termina de
  // verdade. O histórico de preço continua servindo ao backtest pelo perpétuo.
  // ------------------------------------------------------------------------
  {
    symbol: "TACUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: nenhum par EVM na busca por ticker nem por nome. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    symbol: "DEXEUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: nenhum par EVM na busca por ticker nem por nome. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    symbol: "BEATUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: nenhum par EVM na busca por ticker nem por nome. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    symbol: "GWEIUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: nenhum par EVM na busca por ticker nem por nome. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    symbol: "SLXUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: nenhum par EVM na busca por ticker nem por nome. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    symbol: "LABUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: o contrato na BNB Chain não responde mais e as pools sumiram — ciclo encerrado. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  // ------------------------------------------------------------------------
  // Achadas pela peneira, não por indicação.
  //
  // `npm run peneira` mede amplitude do ciclo e open interest sobre market cap
  // em todos os perpétuos da Binance — 522 medidos em 23 segundos, dois números
  // por moeda. Cento e doze entram no perfil, e a peneira reconhece 26 das que
  // já estavam aqui, que é a validação dela.
  //
  // As quatro primeiras são o achado que a lista por indicação não produz:
  // moedas no perfil que AINDA NÃO CAÍRAM. Toda lista feita por reconhecimento
  // chega depois do estrago — as 26 conhecidas têm mediana de −62,7% do topo.
  //
  // O contrato está pendente porque o DexScreener estava fora no momento em que
  // entraram. Isso é diferente de "não tem par EVM": rodar `npm run descobrir`
  // de novo resolve, e o script agora distingue busca que falhou de busca que
  // não achou.
  // ------------------------------------------------------------------------
  {
    // amplitude 6.2x · OI 52% do market cap · 25mi de market cap · −39% do topo há 10 dias
    symbol: "ACEUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: melhor candidato erra 39% no preço. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    // amplitude 5.9x · OI 22% do market cap · 21mi de market cap · −21% do topo há 16 dias
    symbol: "TAKEUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: nenhum par em rede EVM. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    // amplitude 4.7x · OI 16% do market cap · 79mi de market cap · −27% do topo há 3 dias
    symbol: "BOMEUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: nenhum par em rede EVM — o BOME vive na Solana, fora do alcance da leitura on-chain daqui.",
  },
  {
    // amplitude 4.8x · OI 11% do market cap · 67mi de market cap · −9% do topo, topo é hoje
    symbol: "PROMUSDT",
    chain: "bsc",
    contract: "0xaF53d56ff99f1322515E54FdDE93FF8b3b7DAFd5",
    firstBlock: 0,
    wallets: [],
    note: "Achada pela peneira: amplitude 4.8x e open interest em 11% do market cap. Contrato conferido na BSC — preço bate com o perpétuo com 0.1% de erro e a pool gira 3.2x o próprio tamanho por dia.",
  },
  {
    // amplitude 200.4x · OI 48% do market cap · 21mi de market cap · −99% do topo há 155 dias
    symbol: "SIRENUSDT",
    chain: "bsc",
    contract: "0x997A58129890bBdA032231A52eD1ddC845fc18e1",
    firstBlock: 0,
    wallets: [],
    note: "Achada pela peneira: amplitude 200.4x e open interest em 48% do market cap. Contrato conferido na BSC — preço bate com o perpétuo com 1.2% de erro e a pool de US$ 2.3 milhões gira.",
  },
  {
    // amplitude 42.6x · OI 41% do market cap · 52mi de market cap · −82% do topo há 15 dias
    symbol: "TUTUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: nenhum par em rede EVM. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    // amplitude 30.3x · OI 37% do market cap · 27mi de market cap · −95% do topo há 28 dias
    symbol: "BANKUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: nenhum par em rede EVM. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
  {
    // amplitude 9.6x · OI 27% do market cap · 22mi de market cap · −76% do topo há 132 dias
    symbol: "BLESSUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: o melhor candidato é fragmento — o contrato guarda menos tokens do que o circulante, então é implantação secundária e mediria uma fração da moeda.",
  },
  {
    // amplitude 35.6x · OI 27% do market cap · 23mi de market cap · −96% do topo há 96 dias
    symbol: "BSBUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: o melhor candidato é fragmento — o contrato guarda menos tokens do que o circulante, então é implantação secundária e mediria uma fração da moeda.",
  },
  {
    // amplitude 12.1x · OI 26% do market cap · 27mi de market cap · −90% do topo há 78 dias
    symbol: "HOMEUSDT",
    chain: "bsc",
    contract: "",
    firstBlock: 0,
    wallets: [],
    note: "Só o perpétuo: nenhum par em rede EVM. Sem contrato conferido a leitura on-chain mediria outra moeda.",
  },
];

/**
 * As moedas que ainda são analisadas.
 *
 * Tudo que percorre a lista deve usar isto em vez de `WATCHLIST` direto, senão
 * aposentar não economiza requisição nenhuma.
 */
export const ATIVAS: WatchedToken[] = WATCHLIST.filter((t) => !t.aposentada);

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
