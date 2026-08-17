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

const ENDPOINTS = [
  "https://bsc-rpc.publicnode.com",
  "https://bsc.publicnode.com",
  "https://bsc-dataseed.binance.org",
  "https://bsc-dataseed1.defibit.io",
  "https://bsc-dataseed1.ninicoin.io",
];

/** Faixa máxima aceita por chamada de `eth_getLogs`. */
export const MAX_LOG_SPAN = 5000;

/** Profundidade aproximada até onde os nós públicos ainda respondem. */
export const PRUNED_DEPTH = 8000;

/** Um bloco a cada ~0,45 s desde a atualização de finalidade rápida da BSC. */
export const SECONDS_PER_BLOCK = 0.45;

/** Assinatura do evento `Transfer(address,address,uint256)`. */
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
async function rpc(method: string, params: unknown[]): Promise<unknown> {
  let lastError = "sem resposta";

  for (let attempt = 0; attempt < ENDPOINTS.length * 2; attempt++) {
    const url = ENDPOINTS[cursor % ENDPOINTS.length];
    cursor++;

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: nextId++, method, params }),
        signal: AbortSignal.timeout(20_000),
      });

      const body = (await res.json()) as RpcResponse;
      if (body.error) {
        lastError = body.error.message;
        continue;
      }
      if (body.result === undefined) {
        lastError = "resposta vazia";
        continue;
      }
      return body.result;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  throw new Error(`${method}: ${lastError}`);
}

/** Endereço de 20 bytes no formato de 32 bytes usado nos tópicos de evento. */
export function padAddress(address: string): string {
  return `0x${address.toLowerCase().slice(2).padStart(64, "0")}`;
}

/** Volta um tópico de 32 bytes ao endereço de 20. */
export function unpadAddress(topic: string): string {
  return `0x${topic.slice(-40)}`;
}

export async function blockNumber(): Promise<number> {
  return Number(BigInt((await rpc("eth_blockNumber", [])) as string));
}

export async function blockTime(block: number): Promise<number> {
  const header = (await rpc("eth_getBlockByNumber", [
    `0x${block.toString(16)}`,
    false,
  ])) as { timestamp: string };
  return Number(BigInt(header.timestamp));
}

async function call(to: string, data: string): Promise<string> {
  return (await rpc("eth_call", [{ to, data }, "latest"])) as string;
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

export async function tokenInfo(address: string): Promise<TokenInfo> {
  const [symbol, decimals, supply] = await Promise.all([
    call(address, "0x95d89b41"),
    call(address, "0x313ce567"),
    call(address, "0x18160ddd"),
  ]);

  return {
    address,
    symbol: decodeString(symbol),
    decimals: Number(BigInt(decimals)),
    totalSupply: BigInt(supply),
  };
}

/** Saldo do token para vários endereços, no bloco mais recente. */
export async function balancesOf(
  token: string,
  holders: string[],
): Promise<Map<string, bigint>> {
  const entries = await Promise.all(
    holders.map(async (holder) => {
      const data = `0x70a08231${padAddress(holder).slice(2)}`;
      return [holder.toLowerCase(), BigInt(await call(token, data))] as const;
    }),
  );
  return new Map(entries);
}

/** Distingue carteira de contrato — trocas usam ambos, e o rótulo muda a leitura. */
export async function isContract(address: string): Promise<boolean> {
  const code = (await rpc("eth_getCode", [address, "latest"])) as string;
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
  token: string,
  fromBlock: number,
  toBlock: number,
): Promise<Transfer[]> {
  const out: Transfer[] = [];

  for (let start = fromBlock; start <= toBlock; start += MAX_LOG_SPAN) {
    const end = Math.min(start + MAX_LOG_SPAN - 1, toBlock);

    const logs = (await rpc("eth_getLogs", [
      {
        fromBlock: `0x${start.toString(16)}`,
        toBlock: `0x${end.toString(16)}`,
        address: token,
        topics: [TRANSFER_TOPIC],
      },
    ])) as RawLog[];

    for (const log of logs) {
      // Transferências com tópicos faltando vêm de contratos que emitem o
      // evento fora do padrão; não dá para lê-las com segurança.
      if (log.topics.length < 3) continue;

      out.push({
        block: Number(BigInt(log.blockNumber)),
        txHash: log.transactionHash,
        from: unpadAddress(log.topics[1]),
        to: unpadAddress(log.topics[2]),
        value: BigInt(log.data === "0x" ? "0x0" : log.data),
      });
    }
  }

  return out.sort((a, b) => a.block - b.block);
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
