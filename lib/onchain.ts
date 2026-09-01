/**
 * Leitura da BNB Smart Chain sem chave de API.
 *
 * Os nós públicos servem duas coisas com limitações bem diferentes, e a diferença
 * decide o que este monitor consegue ou não fazer:
 *
 *   `eth_call`  — só no bloco mais recente. Estado antigo exige nó de arquivo,
 *                 que nenhum endpoint gratuito entrega. Ou seja: dá para saber
 *                 o saldo de AGORA, nunca o de ontem.
 *   `eth_getLogs` — funciona, mas só nos últimos ~8 mil blocos (cerca de uma
 *                 hora) e em faixas de no máximo 5 mil por chamada.
 *
 * A consequência prática é que não existe backfill: o histórico se constrói para
 * frente, salvando um retrato a cada rodada. Por isso `scripts/wallets.mts`
 * persiste os saldos em disco em vez de recalculá-los do zero.
 *
 * Os dataseed da própria Binance recusam `eth_getLogs` ("limit exceeded") em
 * qualquer faixa, então a ordem dos endpoints abaixo não é arbitrária: os que
 * servem log vêm primeiro.
 */

/**
 * As redes suportadas.
 *
 * Cada uma tem limitações próprias que mudam o que dá para observar, e tratá-las
 * como intercambiáveis quebraria em silêncio: um `eth_getLogs` de 5 mil blocos
 * cobre 37 minutos de BNB Chain e 167 minutos de Base, porque uma fecha bloco a
 * cada 0,45 s e a outra a cada 2 s.
 */
export type Chain = "bsc" | "base" | "ethereum" | "solana";

export interface ChainConfig {
  /** Nome do ativo que paga gás — muda o texto dos alertas. */
  gasSymbol: string;
  endpoints: string[];
  /** Servem `eth_getLogs` em qualquer profundidade. Vazio quando não há. */
  archiveLog: string[];
  /** Servem `eth_call` em qualquer profundidade. Vazio quando não há. */
  archiveState: string[];
  /** Faixa máxima aceita por chamada de `eth_getLogs`. */
  maxLogSpan: number;
  /** Profundidade até onde os nós públicos ainda respondem. */
  prunedDepth: number;
  secondsPerBlock: number;
  explorer: string;
}

export const CHAINS: Record<Chain, ChainConfig> = {
  bsc: {
    gasSymbol: "BNB",
    // Os dataseed da própria Binance recusam `eth_getLogs` em qualquer faixa,
    // então os que servem log vêm primeiro.
    endpoints: [
      "https://bsc-rpc.publicnode.com",
      "https://bsc.publicnode.com",
      "https://bsc-dataseed.binance.org",
      "https://bsc-dataseed1.defibit.io",
      "https://bsc-dataseed1.ninicoin.io",
    ],
    // Dos doze nós públicos testados, um único devolve log antigo e outro
    // devolve estado antigo. Fazem coisas diferentes e não se substituem.
    archiveLog: ["https://bsc.rpc.blxrbdn.com"],
    archiveState: ["https://bsc-mainnet.public.blastapi.io"],
    maxLogSpan: 5000,
    prunedDepth: 8000,
    secondsPerBlock: 0.45,
    explorer: "https://bscscan.com",
  },
  // A Ethereum tinha o pior conjunto de endpoints do arquivo, e os dois defeitos
  // eram invisíveis de fora. Vale registrar os dois, porque o segundo é o modo
  // de falha que este projeto mais teme.
  //
  // `rpc.flashbots.net` NÃO ACEITA `eth_call` — devolve "rpc method is not
  // whitelisted" para qualquer chamada de contrato. Como o rodízio de `callRpc`
  // é cego, um terço de toda leitura de saldo, símbolo ou supply da rede caía
  // nele, errava, esperava a espera progressiva e só então tentava outro. Não
  // aparecia como falha porque a troca de endpoint escondia o custo.
  //
  // Pior: ele devolve LISTA VAZIA para `eth_getLogs` fora dos ~8.192 blocos mais
  // recentes. Medido: 18.706 transferências de USDT numa janela de 200 blocos a
  // 8 mil de profundidade, e ZERO na mesma janela a 12 mil. Não é erro, é
  // silêncio — e `prunedDepth` dizia 20.000, então varredura nenhuma na faixa de
  // 8 a 20 mil blocos tinha como saber que estava lendo o vazio. É exatamente a
  // confusão entre "não achei" e "não consegui" que já custou quatro leituras
  // erradas aqui.
  //
  // `ethereum-rpc.publicnode.com` recusa `eth_getLogs` em QUALQUER faixa
  // ("Archive requests require a personal token") e também qualquer estado
  // antigo. Serve bem o bloco mais recente, e é só para isso que ele fica.
  //
  // Os três de arquivo abaixo foram conferidos um contra o outro em quatro
  // janelas do histórico da HEI: 0, 160, 55 e 276 logs, os três de acordo em
  // todas. Nó que mente devolveria zero em alguma.
  ethereum: {
    gasSymbol: "ETH",
    endpoints: [
      "https://ethereum-rpc.publicnode.com",
      "https://rpc.mevblocker.io",
      "https://eth.drpc.org",
      "https://eth.api.onfinality.io/public",
    ],
    archiveLog: [
      "https://rpc.mevblocker.io",
      "https://eth.api.onfinality.io/public",
      // O drpc entra por último: serve arquivo, mas o plano gratuito estoura o
      // tempo em faixa movimentada.
      "https://eth.drpc.org",
    ],
    archiveState: ["https://rpc.mevblocker.io", "https://eth.drpc.org"],
    // Os dois primeiros recusam faixa acima de 10 mil blocos; o onfinality
    // aceita mais, mas o teto tem de caber no mais restrito do rodízio.
    maxLogSpan: 10_000,
    // Só vale quando `archiveLog` está vazio, e não está mais. Fica no valor
    // real dos nós comuns, que é a janela do flashbots.
    prunedDepth: 8_000,
    secondsPerBlock: 12,
    explorer: "https://etherscan.io",
  },
  // A Solana entra na lista de redes sem nenhum endpoint, e isso é proposital.
  //
  // Tudo neste módulo fala JSON-RPC de EVM: `eth_call`, `eth_getLogs`, saldo
  // guardado num mapa dentro do contrato. Na Solana o saldo de um dono mora
  // numa CONTA DE TOKEN separada, que se descobre por `getTokenAccountsByOwner`,
  // e as transferências saem de instruções dentro de transações em vez de logs
  // indexados por tópico. Não é uma questão de trocar a URL: é outro adaptador.
  //
  // Deixar a rede declarada com as listas vazias mantém a tipagem honesta — uma
  // moeda pode dizer que vive aqui — e faz qualquer tentativa de leitura falhar
  // alto, na primeira chamada, em vez de devolver zero e passar por saldo.
  solana: {
    gasSymbol: "SOL",
    endpoints: [],
    archiveLog: [],
    archiveState: [],
    maxLogSpan: 0,
    prunedDepth: 0,
    secondsPerBlock: 0.4,
    explorer: "https://solscan.io",
  },
  base: {
    gasSymbol: "ETH",
    // `mainnet.base.org` aceita faixas maiores que os demais e é o único que
    // não recusa log fora da janela recente.
    endpoints: [
      "https://mainnet.base.org",
      "https://base.drpc.org",
      "https://base-rpc.publicnode.com",
    ],
    archiveLog: ["https://mainnet.base.org"],
    archiveState: [],
    maxLogSpan: 10_000,
    prunedDepth: 100_000,
    secondsPerBlock: 2,
    explorer: "https://basescan.org",
  },
};

/**
 * Teto de vazão dos endpoints de arquivo, medido: ~4,6 requisições por segundo,
 * e concorrência acima de 16 não melhora nada. Agrupar chamadas em lote também
 * não ajuda, porque o limite conta requisições, não conexões.
 */
export const ARCHIVE_CONCURRENCY = 16;

export const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

let cursor = 0;
let nextId = 1;

interface RpcResponse {
  result?: unknown;
  error?: { message: string };
}

/**
 * Chamada JSON-RPC com troca de endpoint em caso de falha.
 *
 * Um erro devolvido pelo nó (faixa grande demais, estado podado) também dispara
 * a troca: outro endpoint pode ter política diferente para a mesma pergunta.
 */
async function callRpc(
  pool: string[],
  method: string,
  params: unknown[],
  attempts: number,
): Promise<unknown> {
  let lastError = "sem resposta";

  for (let attempt = 0; attempt < attempts; attempt++) {
    const url = pool[cursor % pool.length];
    cursor++;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
        signal: AbortSignal.timeout(30_000),
      });

      // Nós sobrecarregados às vezes respondem texto puro em vez de JSON;
      // deixar o parser estourar derrubaria a varredura inteira.
      const text = await res.text();
      let body: RpcResponse;
      try {
        body = JSON.parse(text) as RpcResponse;
      } catch {
        lastError = text.slice(0, 60);
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }

      if (body.error) {
        lastError = body.error.message;
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
        continue;
      }
      if (body.result === undefined) {
        lastError = "resposta vazia";
        continue;
      }
      return body.result;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
    }
  }

  throw new Error(`${method}: ${lastError}`);
}

async function rpc(chain: Chain, method: string, params: unknown[]): Promise<unknown> {
  const pool = CHAINS[chain].endpoints;
  return callRpc(pool, method, params, pool.length * 2);
}

/**
 * Os nós que servem log, que não são os mesmos que servem estado.
 *
 * A distinção existia só dentro de `scanTransfers`, e a falta dela em
 * `transfersBetween` era um buraco de verdade: na Ethereum o primeiro endpoint
 * da lista comum recusa `eth_getLogs` sempre, e o rodízio cego pagava uma
 * tentativa perdida por faixa. Agora as duas varreduras entram pela mesma porta.
 */
function logPool(chain: Chain): string[] {
  const config = CHAINS[chain];
  return config.archiveLog.length > 0 ? config.archiveLog : config.endpoints;
}

/** Endereço de 20 bytes no formato de 32 bytes usado nos tópicos de evento. */
export function padAddress(address: string): string {
  return `0x${address.toLowerCase().slice(2).padStart(64, "0")}`;
}

/** Volta um tópico de 32 bytes ao endereço de 20. */
export function unpadAddress(topic: string): string {
  return `0x${topic.slice(-40)}`;
}

export async function blockNumber(chain: Chain): Promise<number> {
  return Number(BigInt((await rpc(chain, "eth_blockNumber", [])) as string));
}

export async function blockTime(chain: Chain, block: number): Promise<number> {
  const header = (await rpc(chain, "eth_getBlockByNumber", [
    `0x${block.toString(16)}`,
    false,
  ])) as { timestamp: string };
  return Number(BigInt(header.timestamp));
}

async function call(chain: Chain, to: string, data: string): Promise<string> {
  return (await rpc(chain, "eth_call", [{ to, data }, "latest"])) as string;
}

// --------------------------------------------------------------- multicall
//
// Uma requisição no lugar de N, e o ganho não é de velocidade — é de leitura
// que chega.
//
// Ler o saldo de dezessete carteiras de corretora custava dezessete `eth_call`.
// Vezes trinta e três moedas, vezes duas passagens (o float da vida e o motor),
// dá mais de mil chamadas por retrato — em nós públicos gratuitos, que é onde
// a demora vira tempo esgotado e o tempo esgotado vira saldo zero. O modo de
// falha é o de sempre aqui: some sem erro, e zero se lê como "não tem".
//
// O Multicall3 está no MESMO endereço em toda rede EVM, o que é justamente o
// que torna isto barato de manter. Se ele não estiver lá, ou o nó recusar, cada
// função cai sozinha no caminho antigo.

/** Multicall3 — mesmo endereço na BNB Chain, na Base e na Ethereum. */
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

/**
 * Quantas chamadas cabem numa só. Cem é conservador de propósito: a resposta
 * inteira trafega numa resposta JSON-RPC, e nó público corta resposta grande
 * antes de recusar o pedido.
 */
const MULTICALL_LOTE = 100;

const hexWord = (n: number): string => n.toString(16).padStart(64, "0");

/**
 * `aggregate3((address,bool,bytes)[])` codificado à mão.
 *
 * Sem biblioteca de ABI porque é a única chamada estruturada do projeto inteiro,
 * e trazer uma dependência de dois megabytes para codificar uma tupla seria
 * pagar caro por pouco.
 */
function encodeAggregate3(calls: { target: string; data: string }[]): string {
  const itens = calls.map((c) => {
    const bytes = c.data.slice(2);
    const preenchido = bytes.padEnd(Math.ceil(bytes.length / 64) * 64, "0");
    // (address target, bool allowFailure, bytes callData): o terceiro campo é
    // dinâmico, então guarda um deslocamento fixo de 96 bytes daqui.
    return (
      padAddress(c.target).slice(2) + hexWord(1) + hexWord(96) + hexWord(bytes.length / 2) + preenchido
    );
  });

  let deslocamento = 32 * itens.length;
  let cabeca = "";
  for (const item of itens) {
    cabeca += hexWord(deslocamento);
    deslocamento += item.length / 2;
  }

  // 0x82ad56cb = aggregate3; o primeiro word é o deslocamento do array.
  return `0x82ad56cb${hexWord(32)}${hexWord(itens.length)}${cabeca}${itens.join("")}`;
}

/** Devolve o retorno de cada chamada, ou nulo para a que reverteu. */
function decodeAggregate3(hex: string, esperados: number): (string | null)[] {
  const raw = hex.slice(2);
  const total = Number(BigInt(`0x${raw.slice(64, 128)}`));
  if (total !== esperados) throw new Error("multicall devolveu outra quantidade");

  const out: (string | null)[] = [];
  for (let i = 0; i < total; i++) {
    const inicio = Number(BigInt(`0x${raw.slice(128 + i * 64, 192 + i * 64)}`)) * 2 + 128;
    const ok = BigInt(`0x${raw.slice(inicio, inicio + 64)}`) === BigInt(1);
    const dados = Number(BigInt(`0x${raw.slice(inicio + 64, inicio + 128)}`)) * 2 + inicio;
    const tamanho = Number(BigInt(`0x${raw.slice(dados, dados + 64)}`));
    const corpo = raw.slice(dados + 64, dados + 64 + tamanho * 2);
    out.push(ok && corpo.length > 0 ? `0x${corpo}` : null);
  }
  return out;
}

/**
 * Roda as chamadas em lote. Lança se o Multicall3 não responder — quem chama
 * decide se cai para o caminho de uma requisição por item.
 */
async function multicall(
  chain: Chain,
  calls: { target: string; data: string }[],
): Promise<(string | null)[]> {
  const out: (string | null)[] = [];
  for (let i = 0; i < calls.length; i += MULTICALL_LOTE) {
    const lote = calls.slice(i, i + MULTICALL_LOTE);
    const hex = await call(chain, MULTICALL3, encodeAggregate3(lote));
    if (!hex || hex === "0x") throw new Error("Multicall3 não respondeu nesta rede");
    out.push(...decodeAggregate3(hex, lote.length));
  }
  return out;
}

// ------------------------------------------------------------------- ERC-20

export interface TokenInfo {
  address: string;
  symbol: string;
  decimals: number;
  totalSupply: bigint;
}

/** Decodifica uma string ABI, aceitando o formato antigo de bytes32 fixos. */
function decodeString(hex: string): string {
  const raw = hex.slice(2);
  if (raw.length === 64) {
    return Buffer.from(raw, "hex").toString("utf8").replace(/\0+$/, "");
  }
  const length = Number(BigInt(`0x${raw.slice(64, 128)}`));
  return Buffer.from(raw.slice(128, 128 + length * 2), "hex").toString("utf8");
}

export async function tokenInfo(chain: Chain, address: string): Promise<TokenInfo> {
  const SELETORES = ["0x95d89b41", "0x313ce567", "0x18160ddd"];

  let symbol: string | null = null;
  let decimals: string | null = null;
  let supply: string | null = null;

  try {
    [symbol, decimals, supply] = await multicall(
      chain,
      SELETORES.map((data) => ({ target: address, data })),
    );
  } catch {
    // Sem lote, três requisições — e um contrato que não responde continua
    // estourando aqui, como antes.
  }

  if (symbol === null || decimals === null || supply === null) {
    [symbol, decimals, supply] = await Promise.all(
      SELETORES.map((data) => call(chain, address, data)),
    );
  }

  return {
    address,
    symbol: decodeString(symbol),
    decimals: Number(BigInt(decimals)),
    totalSupply: BigInt(supply),
  };
}

/**
 * Saldo do token para vários endereços, no bloco mais recente.
 *
 * Uma requisição para o conjunto todo, via Multicall3. Só cai para uma por
 * endereço quando o lote falha, que é o que acontece em rede sem o contrato.
 */
export async function balancesOf(
  chain: Chain,
  token: string,
  holders: string[],
): Promise<Map<string, bigint>> {
  if (holders.length === 0) return new Map();

  const dados = holders.map((holder) => ({
    target: token,
    data: `0x70a08231${padAddress(holder).slice(2)}`,
  }));

  try {
    const retornos = await multicall(chain, dados);
    return new Map(
      holders.map(
        (holder, i) => [holder.toLowerCase(), BigInt(retornos[i] ?? "0x0")] as const,
      ),
    );
  } catch {
    const entries = await Promise.all(
      holders.map(async (holder, i) => {
        return [holder.toLowerCase(), BigInt(await call(chain, token, dados[i].data))] as const;
      }),
    );
    return new Map(entries);
  }
}

/**
 * Saldo do ativo de gás de vários endereços, em unidades inteiras (wei).
 *
 * Interessa como combustível, não como riqueza: sem gás uma carteira não paga
 * transação, e portanto não consegue mover token nenhum por mais que segure. Uma
 * carteira cheia de token e vazia de gás está travada, e o momento em que
 * alguém a abastece é o aviso de que vão movimentá-la.
 *
 * O próprio Multicall3 expõe `getEthBalance`, então o lote também serve aqui.
 */
export async function gasOf(
  chain: Chain,
  addresses: string[],
): Promise<Map<string, bigint>> {
  if (addresses.length === 0) return new Map();

  try {
    // 0x4d2301cc = getEthBalance(address), no próprio Multicall3.
    const retornos = await multicall(
      chain,
      addresses.map((address) => ({
        target: MULTICALL3,
        data: `0x4d2301cc${padAddress(address).slice(2)}`,
      })),
    );
    return new Map(
      addresses.map(
        (address, i) => [address.toLowerCase(), BigInt(retornos[i] ?? "0x0")] as const,
      ),
    );
  } catch {
    const entries = await Promise.all(
      addresses.map(async (address) => {
        const wei = (await rpc(chain, "eth_getBalance", [address, "latest"])) as string;
        return [address.toLowerCase(), BigInt(wei)] as const;
      }),
    );
    return new Map(entries);
  }
}

/** Distingue carteira de contrato — trocas usam ambos, e o rótulo muda a leitura. */
export async function isContract(chain: Chain, address: string): Promise<boolean> {
  const code = (await rpc(chain, "eth_getCode", [address, "latest"])) as string;
  return code !== "0x" && code.length > 2;
}

// -------------------------------------------------------------------- logs

export interface Transfer {
  block: number;
  txHash: string;
  from: string;
  to: string;
  value: bigint;
}

interface RawLog {
  blockNumber: string;
  transactionHash: string;
  topics: string[];
  data: string;
}

/**
 * Transferências do token entre dois blocos, quebradas em faixas aceitáveis.
 *
 * Não filtra por carteira via tópico de propósito: um pump se enxerga melhor
 * vendo TODAS as transferências do token do que só as das carteiras conhecidas —
 * é assim que aparece a carteira nova que ninguém estava vigiando.
 */
export async function transfersBetween(
  chain: Chain,
  token: string,
  fromBlock: number,
  toBlock: number,
): Promise<Transfer[]> {
  const out: Transfer[] = [];
  const span = CHAINS[chain].maxLogSpan;
  const pool = logPool(chain);

  for (let start = fromBlock; start <= toBlock; start += span) {
    const end = Math.min(start + span - 1, toBlock);

    const logs = (await callRpc(
      pool,
      "eth_getLogs",
      [
        {
          fromBlock: `0x${start.toString(16)}`,
          toBlock: `0x${end.toString(16)}`,
          address: token,
          topics: [TRANSFER_TOPIC],
        },
      ],
      pool.length * 2,
    )) as RawLog[];

    for (const log of logs) {
      const transfer = decodeTransfer(log);
      if (transfer) out.push(transfer);
    }
  }

  return out.sort((a, b) => a.block - b.block);
}

/** Um log cru de Transfer virando evento tipado, ou nulo se estiver malformado. */
function decodeTransfer(log: RawLog): Transfer | null {
  // Transferências com tópicos faltando vêm de contratos que emitem o evento
  // fora do padrão; não dá para lê-las com segurança.
  if (log.topics.length < 3) return null;

  return {
    block: Number(BigInt(log.blockNumber)),
    txHash: log.transactionHash,
    from: unpadAddress(log.topics[1]),
    to: unpadAddress(log.topics[2]),
    value: BigInt(log.data === "0x" ? "0x0" : log.data),
  };
}

// ------------------------------------------------------------------ arquivo

export interface ScanOptions {
  chain: Chain;
  token: string;
  fromBlock: number;
  toBlock: number;
  /**
   * Restringe a varredura a transferências que tocam estes endereços.
   *
   * Sem o filtro, um token movimentado devolve milhares de eventos por faixa —
   * dezenas de milhões na vida inteira, inviável de trafegar. Com ele, são
   * algumas dezenas. O custo é que cada faixa vira DUAS consultas: tópicos são
   * posicionais e combinam com E, então remetente e destinatário não cabem na
   * mesma pergunta.
   */
  involving?: string[];
  /**
   * Só quem RECEBE. Metade do custo de `involving`, que consulta os dois lados.
   *
   * Existe porque "chegou moeda na corretora" é uma pergunta de um lado só, e
   * pagar pelo outro é desperdício num nó que já responde no limite.
   */
  receiving?: string[];
  onProgress?: (done: number, total: number, found: number) => void;
}

export interface ScanResult {
  transfers: Transfer[];
  /** Faixas que nenhuma tentativa conseguiu ler. */
  failed: number;
}

/**
 * Faixa sem filtro de carteira.
 *
 * Um token movimentado devolve milhares de eventos em 5 mil blocos, e a
 * resposta chega a estourar o tempo limite do nó. Faixas curtas trocam mais
 * requisições por respostas que cabem — e requisição que retorna vale mais do
 * que faixa larga que falha.
 */
const UNFILTERED_SPAN = 500;

/**
 * Varre transferências de um token em qualquer profundidade da cadeia.
 *
 * Os eventos voltam ordenados e sem repetição: as duas consultas por faixa se
 * sobrepõem quando remetente e destinatário estão ambos na lista vigiada, e
 * contar duas vezes a mesma transferência estragaria qualquer saldo derivado.
 */
export async function scanTransfers(options: ScanOptions): Promise<ScanResult> {
  const { chain, token, fromBlock, toBlock, involving, onProgress } = options;
  const config = CHAINS[chain];

  const padded = involving?.map(padAddress) ?? [];
  const recebendo = options.receiving?.map(padAddress) ?? [];
  const filters: (string[] | null)[][] = recebendo.length
    ? [[null, recebendo]]
    : padded.length
      ? [[padded], [null, padded]]
      : [[]];

  // Sem filtro a resposta de uma faixa cheia estoura o tempo limite do nó, então
  // faixas sem filtro são curtas mesmo custando mais requisições.
  const span = padded.length || recebendo.length ? config.maxLogSpan : UNFILTERED_SPAN;

  const starts: number[] = [];
  for (let start = fromBlock; start <= toBlock; start += span) {
    starts.push(start);
  }

  const found = new Map<string, Transfer>();
  let done = 0;
  let next = 0;
  let failed = 0;

  async function worker(): Promise<void> {
    while (next < starts.length) {
      const start = starts[next++];
      const end = Math.min(start + span - 1, toBlock);

      for (const tail of filters) {
        // Uma faixa perdida não pode derrubar a varredura inteira: numa
        // varredura de milhares de faixas, alguma sempre falha, e abortar
        // desperdiça tudo o que já foi lido.
        try {
          const logs = (await callRpc(
            logPool(chain),
            "eth_getLogs",
            [
              {
                fromBlock: `0x${start.toString(16)}`,
                toBlock: `0x${end.toString(16)}`,
                address: token,
                topics: [TRANSFER_TOPIC, ...tail],
              },
            ],
            6,
          )) as RawLog[];

          for (const log of logs) {
            const transfer = decodeTransfer(log);
            if (!transfer) continue;
            // Hash sozinho não identifica: uma transação pode emitir vários
            // Transfer. Tópicos e valor juntos separam os eventos irmãos.
            found.set(`${log.transactionHash}|${log.topics.join("")}|${log.data}`, transfer);
          }
        } catch {
          failed++;
        }
      }

      done++;
      onProgress?.(done, starts.length, found.size);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(ARCHIVE_CONCURRENCY, starts.length) }, worker),
  );

  return {
    transfers: [...found.values()].sort((a, b) => a.block - b.block),
    failed,
  };
}

/**
 * Quantos blocos cobrem N horas nesta rede, respeitando o alcance real dos nós.
 *
 * O corte por `prunedDepth` descreve até onde os nós PÚBLICOS respondem, e
 * aplicá-lo sempre era um erro caro: na BNB Chain ele vale 8.000 blocos, ou uma
 * hora, então toda varredura que pedia três horas recebia uma — em silêncio, com
 * o código e a mensagem continuando a dizer três. Justamente na rede onde estão
 * quase todas as moedas vigiadas.
 *
 * Quando existe nó de arquivo, e na BNB Chain existe, o corte não se aplica:
 * `scanTransfers` já prefere o arquivo para log. Sem ele, o corte é real e
 * continua valendo.
 */
export function blocosPara(chain: Chain, horas: number): number {
  const config = CHAINS[chain];
  const desejado = Math.round((horas * 3600) / config.secondsPerBlock);
  if (config.archiveLog.length > 0) return desejado;
  return config.prunedDepth > 0 ? Math.min(desejado, config.prunedDepth) : desejado;
}

/** Saldo do token num bloco passado, via nó de arquivo. */
export async function balanceAt(
  chain: Chain,
  token: string,
  holder: string,
  block: number,
): Promise<bigint> {
  const config = CHAINS[chain];
  if (config.archiveState.length === 0) {
    throw new Error(`${chain} não tem nó de arquivo público para estado antigo`);
  }
  const data = `0x70a08231${padAddress(holder).slice(2)}`;
  const result = (await callRpc(
    config.archiveState,
    "eth_call",
    [{ to: token, data }, `0x${block.toString(16)}`],
    8,
  )) as string;
  return BigInt(result === "0x" ? "0x0" : result);
}

/**
 * O bloco mais próximo de um instante, por busca binária.
 *
 * A conta óbvia — dividir a diferença de tempo pelo tempo de bloco — só funciona
 * para o passado recente. A BSC rodava a 3 segundos por bloco e hoje roda a
 * 0,45: extrapolar um ano para trás com a taxa de hoje erra por meses, e foi
 * exatamente assim que uma varredura da "gênese" de um token de agosto de 2025
 * foi parar em fevereiro de 2026. A busca binária não depende de taxa nenhuma.
 */
export async function blockAtTime(chain: Chain, timestamp: number): Promise<number> {
  let baixo = 1;
  let alto = await blockNumber(chain);

  while (alto - baixo > 1) {
    const meio = Math.floor((baixo + alto) / 2);
    if ((await blockTime(chain, meio)) < timestamp) baixo = meio;
    else alto = meio;
  }
  return baixo;
}

/** Timestamp de vários blocos, para converter altura em data. */
export async function blockTimes(
  chain: Chain,
  blocks: number[],
): Promise<Map<number, number>> {
  const unique = [...new Set(blocks)];
  const entries = await Promise.all(
    unique.map(async (block) => [block, await blockTime(chain, block)] as const),
  );
  return new Map(entries);
}

/**
 * Converte um valor inteiro do token para número decimal legível.
 *
 * A divisão acontece ainda em bigint, com seis casas de folga: passar por
 * `Number` antes estoura a precisão em tokens de 18 decimais e supply bilionário.
 */
export function toUnits(value: bigint, decimals: number): number {
  const scale = BigInt(1_000_000);
  return Number((value * scale) / BigInt(10) ** BigInt(decimals)) / 1_000_000;
}

/**
 * Um endereço que nunca enviou nada.
 *
 * Carteira recém-criada é o destino clássico de quem quer quebrar a trilha
 * antes de distribuir: recebe, fica parada, e só se mexe na hora da venda. O
 * teste é o contador de transações — quem nunca enviou tem contador zero,
 * independentemente de quanto já recebeu.
 */
export async function isFreshAddress(chain: Chain, address: string): Promise<boolean> {
  try {
    const nonce = (await rpc(chain, "eth_getTransactionCount", [address, "latest"])) as string;
    return BigInt(nonce) === BigInt(0);
  } catch {
    // Na dúvida, não é novidade: um falso positivo aqui vira alerta à toa.
    return false;
  }
}
