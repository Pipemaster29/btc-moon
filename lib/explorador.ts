/**
 * O explorador de blocos como fonte de log, onde ele existe e é gratuito.
 *
 * ISTO EXISTE PARA DESTRAVAR A VARREDURA DE GÊNESE, que é o buraco mais caro do
 * projeto hoje: `data/detentores.json` tem 7 moedas e 37 têm contrato, então a
 * concentração — o número que existe por causa do JCT, onde seis endereços
 * seguravam 99,9% do supply e o painel emitiu COMPRA — está medida em 6 de 72.
 *
 * O gargalo nunca foi o método. `scripts/genese.mts` acha o bloco de nascimento
 * por busca binária sobre `eth_getCode` em ~25 leituras, e isso funciona. O
 * gargalo é ler os LOGS da janela: sem filtro de carteira, `scanTransfers` anda
 * de 500 em 500 blocos porque faixa maior estoura o tempo limite do nó, e uma
 * janela de gênese de três semanas são milhares de requisições — sete minutos
 * por salto, mais de sete horas para vinte e cinco moedas.
 *
 * O explorador faz o mesmo trabalho em UMA requisição por mil eventos.
 *
 * ============================================== O QUE FOI TESTADO, E O QUE NÃO
 *
 * Medido em 05/09, contra os endereços de verdade:
 *
 *   ethereum   eth.blockscout.com     responde, sem chave     ✓
 *   base       base.blockscout.com    responde, sem chave     ✓
 *   bsc        bsc.blockscout.com     404 — não existe        ✗
 *
 * E para a BSC não há saída gratuita, o que foi verificado e não presumido:
 *
 *   Etherscan V2   chain 56 e 8453 são PAGOS; só a Ethereum está no tier grátis
 *   Routescan      responde `chain not supported` para a 56
 *   nós públicos   `bsc-dataseed` → "limit exceeded"; `bsc.drpc.org` → "ranges
 *                  over 10000 blocks are not supported on free plan";
 *                  `publicnode` → "Archive requests require a personal token"
 *
 * Das 30 moedas que faltam varrer, 20 estão na BSC, 9 na Ethereum e 1 na Base.
 * Então isto alcança 10 delas — um terço — e as outras vinte continuam
 * dependendo do caminho lento. Está escrito assim de propósito: metade do
 * problema resolvida é melhor do que nenhuma, e fingir que resolveu tudo seria
 * pior do que não ter feito.
 *
 * SEM CHAVE DE API, e isso não é detalhe de estilo. A primeira linha do
 * README promete "tudo é lido de fontes públicas, sem nenhuma chave de API", e o
 * Blockscout mantém essa promessa de pé — o Etherscan a quebraria por 9 moedas,
 * e ainda cobraria pelas outras 21.
 */

// SÓ TIPO, e não valor: `lib/onchain.ts` importa este arquivo, e um import de
// runtime nos dois sentidos é ciclo. `import type` some na compilação, então o
// ciclo não existe em execução.
import type { Chain, Transfer } from "./onchain";

/**
 * O endereço dentro de um tópico de log, sem o preenchimento de 32 bytes.
 *
 * Copiado de `lib/onchain.ts` em vez de importado, e são duas linhas: importar o
 * valor de lá criaria o ciclo que o `import type` acima existe para evitar.
 */
function semPreenchimento(topico: string): string {
  return `0x${topico.slice(-40)}`;
}

/**
 * Instâncias públicas do Blockscout, por rede.
 *
 * Só entram as que foram TESTADAS respondendo sem chave. A BSC não tem instância
 * pública — `bsc.blockscout.com` devolve 404 —, e é por ausência aqui, e não por
 * um `if` espalhado no código, que ela cai no caminho antigo.
 */
const BLOCKSCOUT: Partial<Record<Chain, string>> = {
  ethereum: "https://eth.blockscout.com",
  base: "https://base.blockscout.com",
};

/** `Transfer(address,address,uint256)`. */
const TOPICO_TRANSFER =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/**
 * Quantos eventos o Blockscout devolve por resposta.
 *
 * Não é escolha nossa: é o teto dele, medido. Importa porque a paginação depende
 * de saber quando a página veio CHEIA — página cheia significa que há mais, e
 * página curta significa que acabou.
 */
const POR_PAGINA = 1000;

/**
 * Teto de voltas por varredura.
 *
 * Uma janela de gênese tem poucos milhares de eventos por construção — nas
 * primeiras horas do token não existe mercado. Se passar disto, ou a janela está
 * errada ou a moeda não é o objeto de estudo, e as duas merecem parar em vez de
 * varrer para sempre.
 *
 * DEZ, e não sessenta como no primeiro desenho, porque dez é a cota do
 * explorador por janela (ver o bloco do 429 abaixo). Um teto acima da cota não é
 * generosidade: é gastar a cota das próximas moedas do lote para depois falhar
 * do mesmo jeito. Medido com a janela ancorada de 72h, 15 das 17 moedas de
 * Ethereum e Base cabem em UMA volta, então dez sobra.
 */
const MAXIMO_DE_VOLTAS = 10;

/**
 * Quantas vezes insistir quando o Blockscout responde 429, e quanto esperar.
 *
 * NÃO É PRECAUÇÃO, é conserto de defeito medido. Paginando a janela de sete dias
 * da VVV o explorador levou 429 na 11ª requisição, e o efeito não era um erro na
 * tela: `completo` virava falso, `scanTransfers` caía para o nó, e a moeda que o
 * explorador leria em oito requisições passava a custar 605 faixas de 500 blocos.
 * A leitura não ficava errada — ficava lenta em silêncio, que é o jeito mais
 * caro de falhar neste projeto.
 *
 * SÃO DOIS 429 DIFERENTES E SÓ UM TEM CONSERTO, e descobrir isso é o que dá
 * forma a estas constantes. Medido em 05/09 contra o base.blockscout.com:
 *
 *   20 requisições em paralelo      4 levaram 429; uma sequencial logo em
 *                                   seguida devolveu 200 — rajada, passa sozinho
 *   paginar a VVV, sequencial       as 10 primeiras voltas passam; da 11ª em
 *                                   diante, 429 fixo, com `x-ratelimit-remaining:
 *                                   0` e `x-ratelimit-reset: 2299479`
 *
 * Aquele `reset` está em MILISSEGUNDOS: são 38 MINUTOS. Insistir contra isso não
 * é paciência, é desperdício — nove tentativas espaçadas de 3s levaram nove 429
 * seguidos, e o `reset` só andou os 27 segundos que eu esperei. A cota é de dez
 * requisições por janela, e ela é do IP, então cada volta gasta em cima do que
 * as PRÓXIMAS MOEDAS do lote vão precisar.
 *
 * Então: rajada se insiste, cota se rende na hora. `remaining: 0` com `reset`
 * longe é resposta definitiva, e o retorno tem de ser imediato para a varredura
 * cair no nó em vez de ficar meia hora batendo numa porta fechada.
 *
 * O `Retry-After` tem preferência quando vem, porque ele sabe o que nós não
 * sabemos. O Blockscout não manda (medido: `retry-after=null` nos nove).
 */
const TENTATIVAS_APOS_429 = 4;
const ESPERA_MINIMA_MS = 2000;
const CRESCIMENTO_DA_ESPERA = 1.5;

/** Acima disto, `x-ratelimit-reset` é cota esgotada e não rajada. */
const RESET_QUE_VALE_ESPERAR_MS = 15_000;

function dormir(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function temExplorador(chain: Chain): boolean {
  return BLOCKSCOUT[chain] !== undefined;
}

export interface LeituraDoExplorador {
  transfers: Transfer[];
  /** Quantas requisições foram feitas — para o relatório poder comparar. */
  requisicoes: number;
  /**
   * A varredura chegou ao fim da janela.
   *
   * FALSO NÃO É "não achou nada", é "não terminei de olhar", e as duas não podem
   * virar o mesmo número — é a armadilha nº 2 do AGENTS.md. Quem chama tem de
   * tratar `completo: false` como leitura que falhou, não como resultado.
   */
  completo: boolean;
  /** Por que parou, quando parou antes da hora. */
  porque?: string;
}

/**
 * As transferências de um token numa faixa, pelo explorador.
 *
 * Devolve `null` quando a rede não tem instância — o chamador cai no caminho de
 * sempre. Distinguir "esta rede não tem explorador" de "o explorador não achou
 * nada" é o mesmo cuidado de sempre com nulo.
 *
 * A PAGINAÇÃO É POR BLOCO E NÃO PELO PARÂMETRO `page`, e isso foi descoberto
 * testando: pedindo `page=2` o Blockscout devolve exatamente os mesmos mil
 * eventos da página 1. Confiar nele teria duplicado transferência em silêncio, e
 * saldo derivado de transferência duplicada é número errado que parece certo.
 * Então cada volta recomeça no bloco seguinte ao último visto.
 */
export async function transferenciasDoExplorador(
  chain: Chain,
  token: string,
  fromBlock: number,
  toBlock: number,
  opcoes: { maxVoltas?: number } = {},
): Promise<LeituraDoExplorador | null> {
  const host = BLOCKSCOUT[chain];
  if (!host) return null;

  const tetoDeVoltas = opcoes.maxVoltas ?? MAXIMO_DE_VOLTAS;
  const achados = new Map<string, Transfer>();
  let de = fromBlock;
  let requisicoes = 0;
  let ultimoFim = -1;

  for (let volta = 0; volta < tetoDeVoltas; volta++) {
    if (de > toBlock) break;

    const url =
      `${host}/api?module=logs&action=getLogs` +
      `&address=${token}&topic0=${TOPICO_TRANSFER}` +
      `&fromBlock=${de}&toBlock=${toBlock}`;

    const resposta = await pedir(url);
    requisicoes += resposta.requisicoes;
    if (!resposta.corpo) {
      return {
        transfers: [...achados.values()],
        requisicoes,
        completo: false,
        porque: resposta.porque,
      };
    }
    const bruto = resposta.corpo;

    const linhas = Array.isArray(bruto.result) ? (bruto.result as RawLog[]) : [];
    // Lista vazia com `status: "0"` é o jeito do Blockscout dizer "nenhum
    // resultado", e aqui isso É o fim da faixa — não é falha.
    if (linhas.length === 0) {
      return { transfers: [...achados.values()], requisicoes, completo: true };
    }

    let fim = de;
    for (const l of linhas) {
      const t = paraTransfer(l);
      if (!t) continue;
      // A chave é transação + índice do log: a mesma transação move o token mais
      // de uma vez, e colapsá-las por hash perderia transferência.
      achados.set(`${t.txHash}:${l.logIndex}`, t);
      if (t.block > fim) fim = t.block;
    }

    // Página curta é fim de faixa: não há o que buscar depois.
    if (linhas.length < POR_PAGINA) {
      return { transfers: [...achados.values()], requisicoes, completo: true };
    }

    // Quem pediu UMA volta pediu a primeira página, não a faixa inteira, e a
    // primeira página cheia quer dizer que há mais adiante. Sai por aqui em vez
    // de cair no aviso de "janela grande demais", que aqui seria mentira.
    if (volta + 1 >= tetoDeVoltas) {
      return {
        transfers: [...achados.values()],
        requisicoes,
        completo: false,
        porque: `parou nas ${tetoDeVoltas} voltas pedidas`,
      };
    }

    // MIL EVENTOS DENTRO DE UM BLOCO SÓ é o caso em que avançar perderia dado:
    // `fim + 1` pularia o resto do bloco. Numa janela de gênese isso não
    // acontece — não há mercado ainda —, mas se acontecer a leitura para e DIZ
    // que parou, em vez de devolver um número que parece completo.
    if (fim <= ultimoFim) {
      return {
        transfers: [...achados.values()],
        requisicoes,
        completo: false,
        porque: `o bloco ${fim} tem mais de ${POR_PAGINA} transferências e a paginação por bloco não alcança o resto`,
      };
    }

    ultimoFim = fim;
    de = fim + 1;
  }

  return {
    transfers: [...achados.values()],
    requisicoes,
    completo: false,
    porque: `passou de ${tetoDeVoltas} requisições — a janela é grande demais para ser gênese`,
  };
}

/**
 * Uma requisição ao explorador, insistindo quando ele diz "devagar".
 *
 * Devolve o corpo, ou o motivo de não ter corpo — nunca as duas coisas, e nunca
 * nenhuma das duas.
 */
async function pedir(
  url: string,
): Promise<{ corpo?: { status?: string; result?: unknown }; porque?: string; requisicoes: number }> {
  let requisicoes = 0;
  let ultimoPorque = "falha de rede";

  for (let tentativa = 0; tentativa <= TENTATIVAS_APOS_429; tentativa++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      requisicoes++;
      if (res.ok) return { corpo: await res.json(), requisicoes };

      ultimoPorque = `HTTP ${res.status}`;
      // 429 e 5xx são "tente de novo"; 4xx que não seja 429 é "não adianta".
      if (res.status !== 429 && res.status < 500) return { porque: ultimoPorque, requisicoes };

      // Cota esgotada não é rajada: sai na hora para a varredura cair no nó, em
      // vez de gastar meia hora — e o resto da cota do lote — batendo aqui.
      const restam = Number(res.headers.get("x-ratelimit-remaining"));
      const reabreEm = Number(res.headers.get("x-ratelimit-reset"));
      if (restam === 0 && Number.isFinite(reabreEm) && reabreEm > RESET_QUE_VALE_ESPERAR_MS) {
        return {
          porque: `cota do explorador esgotada, reabre em ${(reabreEm / 60_000).toFixed(0)} min`,
          requisicoes,
        };
      }

      if (tentativa === TENTATIVAS_APOS_429) break;

      const cabecalho = Number(res.headers.get("retry-after"));
      const espera =
        Number.isFinite(cabecalho) && cabecalho > 0
          ? cabecalho * 1000
          : ESPERA_MINIMA_MS * CRESCIMENTO_DA_ESPERA ** tentativa;
      await dormir(Math.min(espera, 15_000));
    } catch (e) {
      requisicoes++;
      ultimoPorque = e instanceof Error ? e.message : "falha de rede";
      if (tentativa === TENTATIVAS_APOS_429) break;
      await dormir(ESPERA_MINIMA_MS * CRESCIMENTO_DA_ESPERA ** tentativa);
    }
  }

  return { porque: ultimoPorque, requisicoes };
}

/**
 * O bloco da PRIMEIRA transferência do token numa faixa.
 *
 * Existe porque a janela de gênese não começa no nascimento do contrato: em 4
 * das 17 moedas medidas o mint vem depois, e numa delas quatro dias e meio
 * depois. Ver `scripts/genese.mts`, que é quem usa isto.
 *
 * UMA REQUISIÇÃO BASTA, e isso é propriedade do Blockscout e não sorte: ele
 * devolve os eventos em ordem CRESCENTE de bloco. Verificado em 05/09 na H,
 * pedindo catorze dias de uma vez — vieram mil linhas, todas ordenadas, e a
 * primeira era o bloco 25292076, que é exatamente o primeiro evento da moeda.
 * Então a página truncada perde o fim da faixa e nunca o começo dela.
 *
 * `null` de retorno é "esta rede não tem explorador". `bloco: null` com
 * `leu: true` é "olhei e a faixa está vazia mesmo". `leu: false` é "não
 * consegui olhar" — as três são coisas diferentes e o chamador precisa das três.
 */
export interface Sonda {
  bloco: number | null;
  leu: boolean;
  requisicoes: number;
  porque?: string;
}

export async function primeiroEventoPeloExplorador(
  chain: Chain,
  token: string,
  fromBlock: number,
  toBlock: number,
): Promise<Sonda | null> {
  const leitura = await transferenciasDoExplorador(chain, token, fromBlock, toBlock, {
    maxVoltas: 1,
  });
  if (!leitura) return null;

  if (leitura.transfers.length > 0) {
    return {
      bloco: Math.min(...leitura.transfers.map((t) => t.block)),
      leu: true,
      requisicoes: leitura.requisicoes,
    };
  }

  // Sem evento na página: só é "faixa vazia" se a leitura tiver terminado. Se
  // ela parou no meio, não sabemos nada — e dizer `bloco: null` aqui seria o
  // erro nº 2 do AGENTS.md, "não consegui" virando "não achei".
  return {
    bloco: null,
    leu: leitura.completo,
    requisicoes: leitura.requisicoes,
    porque: leitura.porque,
  };
}

interface RawLog {
  blockNumber: string;
  transactionHash: string;
  topics: string[];
  data: string;
  logIndex: string;
}

/**
 * Uma linha do explorador virando `Transfer`.
 *
 * Devolve nulo em vez de um objeto com zeros quando o log não tem a forma de um
 * `Transfer` — evento com menos de três tópicos é outra coisa que por acaso
 * compartilha o topic0, e deixá-lo virar uma transferência de valor zero
 * envenenaria o saldo derivado.
 */
function paraTransfer(l: RawLog): Transfer | null {
  if (!Array.isArray(l.topics) || l.topics.length < 3) return null;
  const block = Number.parseInt(l.blockNumber, 16);
  if (!Number.isFinite(block)) return null;
  let value: bigint;
  try {
    value = BigInt(l.data && l.data !== "0x" ? l.data : "0x0");
  } catch {
    return null;
  }
  return {
    block,
    txHash: l.transactionHash,
    from: semPreenchimento(l.topics[1]),
    to: semPreenchimento(l.topics[2]),
    value,
  };
}
