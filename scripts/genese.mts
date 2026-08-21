/**
 * Quem recebeu o supply antes de existir mercado.
 *
 * É a única forma barata de descobrir as carteiras do operador. A lista de
 * maiores detentores não existe em nó público, e reconstruí-la varrendo a vida
 * inteira do token custa horas. Mas o começo é diferente: nas primeiras horas
 * não há mercado, o volume é baixo, e as transferências que existem são a
 * DISTRIBUIÇÃO — supply saindo do contrato para as carteiras que vão operá-lo.
 *
 * Achar o bloco de nascimento é o truque. Não existe chamada para "quando este
 * contrato foi criado", mas existe `eth_getCode`, que devolve vazio antes da
 * criação e o bytecode depois. Uma busca binária sobre isso acha o bloco exato
 * em ~25 leituras, contra milhares de varreduras às cegas.
 *
 * Só funciona onde há nó de arquivo para ESTADO, porque a busca binária pergunta
 * "havia código aqui?" em blocos antigos. Na BNB Chain há; na Base e na Ethereum
 * não, e essas moedas ficam de fora até existir outra fonte.
 *
 * ESTADO: o método funciona e o custo não fecha para lote. Medido na BTW, ele
 * acha o bloco de nascimento (19/12/2025) e os dois contratos que receberam 99%
 * e 1% do supply. Mas os dois hoje têm ZERO — eram passagem — e seguir o rastro
 * até o dono exige varrer mais do que um dia de blocos, que é o alcance que
 * cabe no orçamento de tempo.
 *
 * O gargalo é o nó de arquivo: ele entrega uma faixa a cada 1,5 a 3,4 segundos.
 * Com quatro milhões de blocos por salto — as três semanas em que a distribuição
 * de fato acontece — são sete minutos por salto e mais de sete horas para as
 * vinte e cinco moedas. E nem todas respondem: no AKE, 41 das 41 faixas da
 * gênese falharam.
 *
 * Fica no repositório porque a parte difícil está resolvida e validada: achar o
 * nascimento por busca binária sobre `eth_getCode` custa ~25 leituras, contra
 * varrer às cegas. O que falta é throughput, e isso vem de um indexador com
 * chave ou de rodar uma moeda por vez sem pressa.
 *
 * Rode com: npm run genese BTW
 *           npm run genese            (todas as da BNB Chain com motor)
 */

import {
  balancesOf,
  blockNumber,
  blockTime,
  gasOf,
  isContract,
  scanTransfers,
  tokenInfo,
  toUnits,
  CHAINS,
  type Chain,
} from "../lib/onchain";
import { ATIVAS, findToken, type WatchedToken } from "../lib/watchlist";

/** Quantos blocos varrer a partir do nascimento, sem filtro. */
const JANELA = 20_000;

/**
 * Quantos saltos seguir depois da gênese.
 *
 * Na BTW os dois endereços que receberam todo o supply no nascimento hoje têm
 * ZERO — eram contratos de passagem. Parar na gênese acharia a porta e não a
 * casa. Seguir o rastro é barato porque a varredura FILTRADA por endereço aceita
 * faixas de cinco mil blocos, contra quinhentos da varredura aberta: dez vezes
 * menos requisições para cobrir o mesmo período.
 */
const SALTOS = 2;

/**
 * Até onde seguir cada salto, em blocos a partir do nascimento.
 *
 * Duzentos mil blocos são pouco mais de um dia na BNB Chain, e é onde a
 * distribuição inicial acontece — o supply sai dos contratos de passagem para as
 * carteiras que vão operá-lo antes de existir mercado.
 *
 * O número saiu de medição, não de gosto. O nó de arquivo entrega uma faixa a
 * cada 1,5 a 3,4 segundos, muito abaixo do que eu supunha: a primeira tentativa
 * usava quatro milhões de blocos, o que dá oitocentas faixas e sete minutos POR
 * SALTO, e o lote de vinte e cinco moedas passaria de sete horas. Com duzentos
 * mil, cada moeda sai em torno de três minutos e meio.
 */
const ALCANCE = 200_000;

/** Só entra na lista quem recebeu pelo menos isto do supply. */
const CORTE = 0.005;

async function temCodigo(chain: Chain, address: string, bloco: number): Promise<boolean> {
  const config = CHAINS[chain];
  const res = await fetch(config.archiveState[0], {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_getCode",
      params: [address, `0x${bloco.toString(16)}`],
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json()) as { result?: string };
  return Boolean(body.result && body.result !== "0x");
}

/** O bloco em que o contrato passou a existir, por busca binária. */
async function blocoDeNascimento(chain: Chain, address: string, topo: number): Promise<number> {
  let baixo = 1;
  let alto = topo;
  while (alto - baixo > 1) {
    const meio = Math.floor((baixo + alto) / 2);
    if (await temCodigo(chain, address, meio)) alto = meio;
    else baixo = meio;
  }
  return alto;
}

async function mapear(token: WatchedToken) {
  const config = CHAINS[token.chain];
  if (config.archiveState.length === 0) {
    console.log(`${token.symbol}: ${token.chain} não tem nó de arquivo para estado`);
    return;
  }

  const head = await blockNumber(token.chain);
  const info = await tokenInfo(token.chain, token.contract);
  const supply = toUnits(info.totalSupply, info.decimals);

  const nascimento = await blocoDeNascimento(token.chain, token.contract, head);
  const quando = new Date((await blockTime(token.chain, nascimento)) * 1000);

  console.log(
    `\n=== ${token.symbol} · ${info.symbol} · supply ${(supply / 1e9).toFixed(2)} bi ===`,
  );
  console.log(`nasceu no bloco ${nascimento} em ${quando.toISOString().slice(0, 16)} UTC`);

  const { transfers, failed } = await scanTransfers({
    chain: token.chain,
    token: token.contract,
    fromBlock: nascimento,
    toBlock: nascimento + JANELA,
  });

  const horas = (JANELA * config.secondsPerBlock) / 3600;
  console.log(
    `${transfers.length} transferências nas primeiras ${horas.toFixed(1)}h · ${failed} faixas falharam`,
  );

  // Saldo líquido de cada endereço no fim da janela: recebeu menos enviou.
  const liquido = new Map<string, number>();
  for (const t of transfers) {
    const v = toUnits(t.value, info.decimals);
    const de = t.from.toLowerCase();
    const para = t.to.toLowerCase();
    liquido.set(para, (liquido.get(para) ?? 0) + v);
    liquido.set(de, (liquido.get(de) ?? 0) - v);
  }

  let candidatos = [...liquido.entries()]
    .filter(([a, v]) => v / supply >= CORTE && a !== "0x0000000000000000000000000000000000000000")
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  if (candidatos.length === 0) {
    console.log("nenhum endereço recebeu mais de 0,5% do supply nesta janela");
    return;
  }

  // Segue o rastro enquanto os donos da gênese estiverem vazios.
  const vistos = new Set(candidatos.map(([a]) => a));
  for (let salto = 1; salto <= SALTOS; salto++) {
    const origens = candidatos.map(([a]) => a);
    const saldoAtual = await balancesOf(token.chain, token.contract, origens);
    const guardado = origens.reduce(
      (s2, a) => s2 + toUnits(saldoAtual.get(a) ?? BigInt(0), info.decimals),
      0,
    );

    // Se ainda seguram o supply, chegamos. Se esvaziaram, o dono está adiante.
    if (guardado / supply >= 0.3) break;

    const { transfers: saidas } = await scanTransfers({
      chain: token.chain,
      token: token.contract,
      fromBlock: nascimento,
      toBlock: Math.min(nascimento + ALCANCE, head),
      involving: origens,
    });

    const recebido = new Map<string, number>();
    for (const t of saidas) {
      if (!origens.includes(t.from.toLowerCase())) continue;
      const para = t.to.toLowerCase();
      if (vistos.has(para)) continue;
      recebido.set(para, (recebido.get(para) ?? 0) + toUnits(t.value, info.decimals));
    }

    const proximos = [...recebido.entries()]
      .filter(([, v]) => v / supply >= CORTE)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    if (proximos.length === 0) break;
    for (const [a] of proximos) vistos.add(a);
    candidatos = proximos;
    console.log(`salto ${salto}: ${proximos.length} endereços receberam do nível anterior`);
  }

  const enderecos = candidatos.map(([a]) => a);
  const [agora, gas] = await Promise.all([
    balancesOf(token.chain, token.contract, enderecos),
    gasOf(token.chain, enderecos),
  ]);

  console.log(`\nendereço                                      recebeu    hoje   %supply  contrato   gás`);
  for (const [addr, inicial] of candidatos) {
    const hoje = toUnits(agora.get(addr) ?? BigInt(0), info.decimals);
    const contrato = await isContract(token.chain, addr);
    console.log(
      `${addr}  ${(inicial / supply * 100).toFixed(2).padStart(8)}% ` +
        `${(hoje / supply * 100).toFixed(2).padStart(7)}% ${(hoje / 1e6).toFixed(0).padStart(8)}M ` +
        `${String(contrato).padStart(9)} ${(Number(gas.get(addr) ?? BigInt(0)) / 1e18).toFixed(3).padStart(7)}`,
    );
  }

  const aindaTem = candidatos.reduce(
    (s, [a]) => s + toUnits(agora.get(a) ?? BigInt(0), info.decimals),
    0,
  );
  console.log(
    `\nos ${candidatos.length} maiores da gênese ainda seguram ${(aindaTem / supply * 100).toFixed(1)}% do supply`,
  );
}

const pedidos = process.argv.slice(2).map((s) => s.toUpperCase());
const alvos = pedidos.length
  ? pedidos.map((p) => findToken(p) ?? findToken(`${p}USDT`)).filter((t): t is WatchedToken => Boolean(t))
  : ATIVAS.filter((t) => t.contract && CHAINS[t.chain].archiveState.length > 0);

for (const token of alvos) {
  await mapear(token).catch((e: Error) => console.log(`${token.symbol}: ${e.message.slice(0, 70)}`));
}
