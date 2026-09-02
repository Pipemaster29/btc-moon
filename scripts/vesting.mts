/**
 * Acha os contratos de alocação de cada moeda e mede se eles estão esvaziando.
 *
 * A ideia toda está em `lib/vesting.ts`. Aqui fica o custo, que é o que decide
 * se o método serve para lote ou só para uma moeda por vez:
 *
 *   1. Achar o nascimento do contrato: ~25 leituras (busca binária no `getCode`).
 *   2. Achar a emissão: varredura filtrada por `from = 0x0`. O filtro é o que
 *      torna isso possível — sem ele, a vida inteira de um token movimentado são
 *      milhões de logs; com ele, são as poucas transferências que criaram supply.
 *      A varredura PARA assim que o supply está explicado, e o passo DOBRA a cada
 *      rodada: em quase toda moeda a emissão inteira acontece no bloco de
 *      criação, e passo fixo pagaria o caso raro em toda moeda. Medido na BNB
 *      Chain, onde o bloco dura 0,45 s: uma semana são 1,34 milhão de blocos, ou
 *      268 faixas de cinco mil, para achar um mint que estava na primeira.
 *   3. Amostrar saldo em sete alturas de bloco: sete `balanceOf` por cofre.
 *
 * Rode com: npm run vesting C
 *           npm run vesting          (todas as que têm contrato e nó de arquivo)
 */

import {
  balanceAt,
  balancesOf,
  birthBlock,
  blockAtTime,
  blockNumber,
  blockTime,
  blocosPara,
  isContract,
  scanTransfers,
  tokenInfo,
  toUnits,
  CHAINS,
} from "../lib/onchain";
import { CARTEIRAS_CEX } from "../lib/lifecycle";
import { ATIVAS, findToken, type WatchedToken } from "../lib/watchlist";
import { ritmoMensal, textoVeredito, type Arquivo, type Cofre, type Vesting } from "../lib/vesting";
import { lerDetentores } from "../lib/detentores";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const ZERO = "0x0000000000000000000000000000000000000000";

/** Só entra na lista de cofres quem recebeu pelo menos isto da emissão. */
const CORTE = 0.01;

/** Quantas amostras mensais de saldo. Sete dão seis intervalos para a reta. */
const AMOSTRAS = 7;

/** Onde parar de procurar emissão: supply explicado. */
const EXPLICADO = 0.995;

/**
 * Teto de faixas por moeda.
 *
 * A varredura da emissão para sozinha quando acha o supply, e em quase toda
 * moeda isso é no primeiro dia. O teto existe para o caso contrário — token que
 * minta continuamente — em que procurar até o fim da vida custaria horas por uma
 * resposta que já se sabe: a emissão não acabou.
 */
const TETO_FAIXAS = 3_000;

async function medir(token: WatchedToken): Promise<Vesting | null> {
  const config = CHAINS[token.chain];
  if (!token.contract || config.archiveState.length === 0) {
    console.log(`${token.symbol}: sem contrato ou sem nó de arquivo em ${token.chain}`);
    return null;
  }

  const [head, info] = await Promise.all([
    blockNumber(token.chain),
    tokenInfo(token.chain, token.contract),
  ]);
  const supply = toUnits(info.totalSupply, info.decimals);
  if (supply <= 0) {
    console.log(`${token.symbol}: supply zero no contrato`);
    return null;
  }

  // O nascimento é caro de achar e não muda nunca: se a gênese já o mediu, usa.
  const jaSabido = (await lerDetentores()).moedas[token.symbol];
  const nascimento =
    jaSabido?.chain === token.chain && jaSabido.nascimento > 0
      ? jaSabido.nascimento
      : await birthBlock(token.chain, token.contract, head);
  const nasceuEm = new Date((await blockTime(token.chain, nascimento)) * 1000);

  console.log(
    `\n=== ${token.symbol} · ${info.symbol} · supply ${(supply / 1e6).toFixed(1)}M · ` +
      `nasceu ${nasceuEm.toISOString().slice(0, 10)} ===`,
  );

  // ------------------------------------------------------- 1. a emissão
  const mintado = new Map<string, number>();
  let faixasPerdidas = 0;
  let faixas = 0;
  let cobertura = 0;
  let passo = Math.max(blocosPara(token.chain, 1), config.maxLogSpan);

  for (let de = nascimento; de <= head && faixas < TETO_FAIXAS; ) {
    // O passo dobra sem limite, e sem esta trava a última rodada pediria de uma
    // vez muito mais faixas do que o orçamento inteiro da moeda.
    const cabe = (TETO_FAIXAS - faixas) * config.maxLogSpan;
    const ate = Math.min(de + Math.min(passo, cabe) - 1, head);
    const { transfers, failed, semHistorico } = await scanTransfers({
      chain: token.chain,
      token: token.contract,
      fromBlock: de,
      toBlock: ate,
      sending: [ZERO],
    });
    faixasPerdidas += failed;
    faixas += Math.ceil((ate - de + 1) / config.maxLogSpan);

    // Antes do horizonte do nó não há o que insistir. Sem esta saída, a BLUAI
    // consumia o orçamento inteiro de faixas — vinte minutos — para devolver
    // "0% do supply explicado", que é indistinguível de uma moeda sem emissão.
    if (semHistorico > 0 && transfers.length === 0) {
      const dias = ((head - de) * config.secondsPerBlock) / 86_400;
      console.log(
        `o nó de log da ${token.chain} não guarda o bloco ${de} ` +
          `(${dias.toFixed(0)} dias atrás) — emissão não varrível aqui`,
      );
      // Grava o limite em vez de devolver nada. Assim o painel diz "não dá para
      // varrer aqui" no lugar de mandar rodar para sempre um comando que nunca
      // vai devolver número.
      return {
        symbol: token.symbol,
        chain: token.chain,
        contrato: token.contract,
        supply,
        nascimento,
        nasceuEm: nasceuEm.toISOString(),
        cobertura: 0,
        faixasPerdidas: failed,
        semHistorico: true,
        cofres: [],
        serie: [],
        travado: 0,
        liberado: 0,
        ritmo: 0,
        mesesRestantes: null,
        emCorretora: 0,
        medidoEm: Date.now(),
      };
    }

    for (const t of transfers) {
      if (t.from.toLowerCase() !== ZERO) continue;
      const para = t.to.toLowerCase();
      mintado.set(para, (mintado.get(para) ?? 0) + toUnits(t.value, info.decimals));
    }

    cobertura = [...mintado.values()].reduce((s, v) => s + v, 0) / supply;
    if (cobertura >= EXPLICADO) break;

    de = ate + 1;
    passo *= 2;
  }

  console.log(
    `emissão: ${mintado.size} destinos explicam ${(cobertura * 100).toFixed(1)}% do supply ` +
      `em ${faixas} faixas · ${faixasPerdidas} perdidas`,
  );

  const candidatos = [...mintado.entries()]
    .filter(([a, v]) => a !== ZERO && v / supply >= CORTE)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  if (candidatos.length === 0) {
    console.log("nenhum destino da emissão recebeu mais de 1% do supply");
  }

  // --------------------------------------------- 2. as alturas das amostras
  const agora = Date.now();
  const MES = 30 * 24 * 3600 * 1000;
  const instantes: number[] = [];
  for (let i = AMOSTRAS - 1; i >= 0; i--) {
    const quando = agora - i * MES;
    // Amostra antes do contrato existir não é zero, é nada: descartar é o certo.
    if (quando >= nasceuEm.getTime() + MES / 4) instantes.push(quando);
  }

  const enderecos = candidatos.map(([a]) => a);
  const blocos = new Map<number, number>();
  for (const instante of instantes) {
    blocos.set(instante, await blockAtTime(token.chain, Math.floor(instante / 1000)));
  }

  // --------------------------------------------- 3. o saldo em cada altura
  const serie: Vesting["serie"] = [];
  const porCofre = new Map<string, { data: string; travado: number }[]>();

  for (const instante of instantes) {
    const bloco = blocos.get(instante)!;
    const data = new Date(instante).toISOString().slice(0, 10);
    let soma = 0;
    for (const addr of enderecos) {
      const bruto = await balanceAt(token.chain, token.contract, addr, bloco).catch(
        () => BigInt(0),
      );
      const fracao = toUnits(bruto, info.decimals) / supply;
      soma += fracao;
      const lista = porCofre.get(addr) ?? [];
      lista.push({ data, travado: fracao });
      porCofre.set(addr, lista);
    }
    serie.push({ data, bloco, travado: soma });
    console.log(`  ${data}  bloco ${bloco}  ${(soma * 100).toFixed(2)}% do supply nos cofres`);
  }

  // ------------------------------------------- 4. corretoras e conclusões
  const saldosCex = await balancesOf(token.chain, token.contract, CARTEIRAS_CEX);
  let naCex = 0;
  for (const v of saldosCex.values()) naCex += toUnits(v, info.decimals);

  const cofres: Cofre[] = [];
  for (const [addr, recebeu] of candidatos) {
    const historico = porCofre.get(addr) ?? [];
    cofres.push({
      endereco: addr,
      contrato: await isContract(token.chain, addr),
      recebeu: recebeu / supply,
      hoje: historico.length ? historico[historico.length - 1].travado : 0,
      ritmo: ritmoMensal(historico),
    });
  }

  const travado = serie.length ? serie[serie.length - 1].travado : 0;
  const liberado = serie.length >= 2 ? (serie[0].travado - travado) * 100 : 0;
  const ritmo = ritmoMensal(serie);

  const resultado: Vesting = {
    symbol: token.symbol,
    chain: token.chain,
    contrato: token.contract,
    supply,
    nascimento,
    nasceuEm: nasceuEm.toISOString(),
    cobertura,
    faixasPerdidas,
    cofres,
    serie,
    travado,
    liberado,
    ritmo,
    mesesRestantes: ritmo > 0.01 ? (travado * 100) / ritmo : null,
    emCorretora: naCex / supply,
    medidoEm: Date.now(),
  };

  console.log(`\n${textoVeredito(resultado)}`);
  console.log(`corretoras conhecidas seguram ${(resultado.emCorretora * 100).toFixed(1)}% do supply`);
  for (const c of cofres) {
    console.log(
      `  ${c.endereco}  recebeu ${(c.recebeu * 100).toFixed(2).padStart(6)}%  ` +
        `hoje ${(c.hoje * 100).toFixed(2).padStart(6)}%  ` +
        `${c.ritmo >= 0 ? "solta" : "acumula"} ${Math.abs(c.ritmo).toFixed(2)} pp/mês  ` +
        `${c.contrato ? "contrato" : "carteira"}`,
    );
  }

  return resultado;
}

const pedidos = process.argv.slice(2).map((s) => s.toUpperCase());
const alvos = pedidos.length
  ? pedidos
      .map((p) => findToken(p) ?? findToken(`${p}USDT`))
      .filter((t): t is WatchedToken => Boolean(t))
  : ATIVAS.filter((t) => t.contract && CHAINS[t.chain].archiveState.length > 0);

const CAMINHO = "data/vesting.json";
const arquivo: Arquivo = await readFile(CAMINHO, "utf8")
  .then((t) => JSON.parse(t) as Arquivo)
  .catch(() => ({ moedas: {} }));

for (const token of alvos) {
  const achado = await medir(token).catch((e: Error) => {
    console.log(`${token.symbol}: ${e.message.slice(0, 90)}`);
    return null;
  });
  if (!achado) continue;
  arquivo.moedas[token.symbol] = achado;
  await mkdir("data", { recursive: true });
  // Grava a cada moeda: a varredura é longa e cair no meio dela não pode custar
  // o que já foi lido.
  await writeFile(CAMINHO, `${JSON.stringify(arquivo, null, 2)}\n`);
}
