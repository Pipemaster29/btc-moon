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
 * "havia código aqui?" em blocos antigos. As três redes EVM da lista têm.
 *
 * ============================================ O GARGALO, E O QUE O DESTRAVOU
 *
 * A parte difícil sempre foi ler os LOGS da janela, não achar o nascimento. Sem
 * filtro de carteira `scanTransfers` anda de 500 em 500 blocos, porque faixa
 * maior estoura o tempo limite do nó, e o nó entrega uma faixa a cada 1,5 a 3,4
 * segundos. Uma janela de três semanas na Ethereum são 302 requisições: de sete
 * a dezessete minutos POR MOEDA, mais de sete horas para o lote. É por isso que
 * `data/detentores.json` tinha 7 moedas com 37 tendo contrato.
 *
 * `lib/explorador.ts` faz a mesma leitura em UMA requisição por mil eventos, e
 * só na Ethereum e na Base — a BSC não tem instância gratuita, o que está
 * verificado lá. Então 17 moedas ficaram baratas e 20 continuam caras, e é essa
 * diferença que define as duas janelas abaixo.
 *
 * Rode com: npm run genese BTW
 *           npm run genese            (todas as que têm nó de arquivo)
 */

import {
  balancesOf,
  birthBlock,
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
import { primeiroEventoPeloExplorador, temExplorador } from "../lib/explorador";
import { ATIVAS, findToken, type WatchedToken } from "../lib/watchlist";
import type { Arquivo, Detentores, DonoDaGenese } from "../lib/detentores";
import { mkdir, readFile, writeFile } from "node:fs/promises";

/**
 * A JANELA DE DISTRIBUIÇÃO, em horas — e ela não começa no nascimento.
 *
 * O número antigo era 20.000 BLOCOS, e blocos não são tempo: os mesmos 20 mil
 * são 2,5h na BNB Chain, 11,1h na Base e 66,7h na Ethereum. Um número, três
 * janelas, 27x de diferença entre as pontas, e nenhuma delas escolhida.
 *
 * E o começo estava errado junto. Medido em 05/09 nas 17 moedas de Ethereum e
 * Base, o atraso entre o contrato nascer e a PRIMEIRA transferência aparecer:
 *
 *   13 moedas    0,00h   o mint está na própria transação de deploy
 *   H           13,20h
 *   SYN         67,49h   ← a janela velha da Ethereum terminava em 66,7h
 *   HEI        ~110h     (4,6 dias)
 *   C           nada em 14 dias — ver a nota abaixo
 *
 * A SYN passava a 67,49h de uma janela de 66,7h. Uma hora e meia de margem
 * separava "concentração medida" de "concentração zero", e zero não pedia
 * desculpa: `mapear` grava zero como resultado legítimo. Três das dezessete
 * estavam gravadas ou seriam gravadas assim.
 *
 * Então a janela agora ancora no primeiro evento e não no nascimento, e o
 * primeiro evento sai de UMA requisição ao explorador — ele devolve em ordem
 * crescente, então a página truncada perde o fim e nunca o começo.
 *
 * As 72h saem do custo medido: com a janela ancorada, 15 das 17 moedas cabem em
 * uma requisição. Sete dias em vez de três levariam a VVV a 7.000 eventos e a H
 * a 9.486 — já é mercado, não é mais distribuição.
 */
const JANELA_HORAS = 72;

/*
 * NÃO EXISTE TETO PARA A PROCURA DO PRIMEIRO EVENTO, e a razão é que ele não
 * compraria nada. A sonda é UMA requisição qualquer que seja a largura da faixa,
 * porque o Blockscout devolve em ordem crescente e a primeira página começa no
 * primeiro evento. Procurar do nascimento até a cabeça da cadeia custa o mesmo
 * que procurar em três dias.
 *
 * O primeiro desenho tinha um teto de catorze dias, escolhido porque o maior
 * atraso que eu tinha medido era de 4,6 dias. Ele custou a leitura da C: o
 * contrato dela nasceu no bloco 28401211 da Base e a primeira transferência veio
 * no 32630340, quatro milhões de blocos e **98 dias** depois. O script dizia
 * "nenhuma transferência em 14 dias — o contrato pode não ser o que guarda o
 * supply", que era um palpite errado gerado por um limite que eu mesmo tinha
 * posto sem precisar.
 */

/**
 * A janela onde o explorador não alcança, em BLOCOS — e aqui blocos são a
 * unidade certa, porque o que limita é requisição e não tempo.
 *
 * São 40 faixas de 500 blocos, que é o que a varredura sem filtro paga em
 * poucos minutos por moeda. Na BNB Chain isso são 2,5h de janela contra as 72h
 * que a medição pede, e não há como fechar essa distância pelo nó: 72h da BSC
 * são 576 mil blocos, ou 1.152 faixas, ou mais de meia hora por moeda.
 *
 * FICA ESCRITO QUE ISTO É ORÇAMENTO E NÃO MEDIÇÃO — e o lote de 06/09 mostrou
 * que nem o orçamento resolve. Rodadas 16 moedas da BSC: em **15 delas as 41
 * faixas da janela FALHARAM** e nada foi lido; a 16ª (CYS) leu uma transferência
 * só. Não é lentidão, é ausência de fonte: o nó de log da BNB Chain guarda desde
 * 2025-11-10 e a gênese dessas moedas é anterior — a mesma falha de 41 de 41 que
 * o AGENTS.md já registrava na AKE, agora medida na lista inteira.
 *
 * Então a janela da BSC continua aqui porque ela vale para moeda nascida depois
 * daquela data, e nada mais. Enquanto não houver fonte de log gratuita para
 * aquela rede, essas moedas ficam SEM concentração — e `mapear` não grava linha
 * nenhuma quando a varredura não leu, porque zero gravado é pior que ausência.
 */
const JANELA_SEM_EXPLORADOR = 20_000;

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
 * Até onde seguir cada salto, em HORAS a partir do início da janela.
 *
 * Era `200_000` blocos, e o comentário que o justificava dizia "pouco mais de um
 * dia na BNB Chain" — o que é verdade lá e só lá. Os mesmos 200 mil blocos são
 * 111 horas na Base e **667 horas, vinte e sete dias, na Ethereum**.
 *
 * MINHA PRIMEIRA CORREÇÃO FOI PIOR QUE O DEFEITO, e fica escrito porque quase
 * passou. Eu troquei os 200 mil blocos por 25 horas, que era o que o comentário
 * dizia estar fazendo, e rodei o lote: o **JCT caiu de 99,9% para 0,0%**. É a
 * leitura que justifica este arquivo inteiro — seis endereços com 99,9% do
 * supply e o painel emitindo COMPRA — e eu a apaguei consertando um comentário.
 * O PORTAL caiu junto, de 8,5% para 0,0%.
 *
 * Aí eu medi, em vez de deduzir do texto. Quantas horas depois do primeiro
 * evento os donos de verdade chegam ao corte de 0,5% do supply:
 *
 *   JCT      6 endereços     262,6 · 263,4 · 263,6 · 263,7 · 263,9 · 288,8
 *   PORTAL   4 endereços      20,7 · 161,3 · 188,7 · 194,3
 *   BASED, RE, DOS, EPIC      nenhum, em 30 dias
 *
 * Onze a doze dias. O contrato de passagem do JCT segura o supply por mais de
 * dez dias antes de distribuir, e 25 horas param dentro do silêncio. As 336h
 * cobrem os 288,8 com folga, e a folga é barata: o salto é FILTRADO por
 * endereço e anda de 10 mil blocos por vez na Ethereum, o que dá 11 faixas.
 */
const ALCANCE_HORAS = 336;

/**
 * Teto de faixas por salto, que é o que segura a BNB Chain.
 *
 * As 336 horas medidas são 100 mil blocos na Ethereum e **2,7 MILHÕES na BSC**,
 * onde a faixa filtrada é de 5.000: 538 faixas por salto, vezes dois filtros,
 * vezes dois saltos. É o que travou a varredura da AKE por meia hora sem sair
 * do lugar.
 *
 * Quarenta faixas dão 200 mil blocos na BSC — exatamente o `ALCANCE` antigo, ou
 * 25 horas — e não chegam a limitar a Ethereum, onde as 336h cabem em 11. Então
 * o teto é o orçamento e as horas são a medição, e onde os dois brigam o
 * orçamento ganha e o relatório diz que ganhou.
 */
const FAIXAS_POR_SALTO = 40;

/** Só entra na lista quem recebeu pelo menos isto do supply. */
const CORTE = 0.005;

/** Para onde o supply vai quando é queimado, e de onde vem quando é criado. */
const ENDERECO_ZERO = "0x0000000000000000000000000000000000000000";

/*
 * A busca binária pelo nascimento vive em `lib/onchain.ts` (`birthBlock`), e não
 * aqui. Este arquivo tinha a sua própria cópia, e a cópia batia sempre no
 * PRIMEIRO nó de `archiveState`, sem rodízio e sem repetição.
 *
 * Custou uma varredura: `npm run genese SYN` morria em "The operation was
 * aborted due to timeout" antes de ler transferência nenhuma. A SYN nasceu no
 * bloco 13025432, de 2021, e o primeiro nó da Ethereum não responde a estado tão
 * fundo — o `callRpc` do `birthBlock` roda os três e acha o bloco sem reclamar.
 * Duas implementações da mesma coisa, e só a que ninguém usava tinha o conserto.
 */

function emBlocos(chain: Chain, horas: number): number {
  return Math.round((horas * 3600) / CHAINS[chain].secondsPerBlock);
}

/**
 * Onde a janela de distribuição começa e quantos blocos ela cobre.
 *
 * `descricao` sai daqui e não do chamador porque só aqui se sabe a diferença
 * entre os quatro casos, e eles não podem virar a mesma frase: "o mint veio no
 * deploy", "o mint veio N horas depois", "não deu para procurar" e "não existe
 * transferência nenhuma" produzem o MESMO início de janela e significam coisas
 * opostas. Quem lê o relatório precisa saber qual dos quatro foi.
 */
async function janelaDe(
  token: WatchedToken,
  nascimento: number,
  head: number,
): Promise<{ inicio: number; janela: number; ancorada: boolean; descricao: string }> {
  if (!temExplorador(token.chain)) {
    return {
      inicio: nascimento,
      janela: JANELA_SEM_EXPLORADOR,
      ancorada: false,
      descricao: "a partir do nascimento — SEM ÂNCORA, o explorador não alcança esta rede",
    };
  }

  const janela = emBlocos(token.chain, JANELA_HORAS);
  const sonda = await primeiroEventoPeloExplorador(token.chain, token.contract!, nascimento, head);

  if (!sonda || !sonda.leu) {
    // Não conseguiu olhar: cai no nascimento, mas DIZ que caiu.
    return {
      inicio: nascimento,
      janela,
      ancorada: false,
      descricao: `a partir do nascimento — SEM ÂNCORA, a sonda do 1º evento não terminou${
        sonda?.porque ? ` (${sonda.porque})` : ""
      }`,
    };
  }

  if (sonda.bloco === null) {
    // Olhou a vida inteira do contrato e não há transferência nenhuma. Aí não é
    // "concentração zero": um token com supply e sem um único `Transfer` desde
    // o nascimento não é o contrato que guarda esse supply.
    return {
      inicio: nascimento,
      janela,
      ancorada: false,
      descricao:
        "ATENÇÃO: nenhuma transferência desde o nascimento — este contrato não é o que guarda o supply",
    };
  }

  if (sonda.bloco === nascimento) {
    return { inicio: nascimento, janela, ancorada: true, descricao: "a partir do nascimento (o mint veio no deploy)" };
  }

  const atraso = ((sonda.bloco - nascimento) * CHAINS[token.chain].secondsPerBlock) / 3600;
  return {
    inicio: sonda.bloco,
    janela,
    ancorada: true,
    descricao: `a partir do 1º evento, ${atraso.toFixed(1)}h após o nascimento`,
  };
}

async function mapear(token: WatchedToken): Promise<Detentores | null> {
  const config = CHAINS[token.chain];
  if (config.archiveState.length === 0) {
    console.log(`${token.symbol}: ${token.chain} não tem nó de arquivo para estado`);
    return null;
  }

  const head = await blockNumber(token.chain);
  const info = await tokenInfo(token.chain, token.contract);
  const supply = toUnits(info.totalSupply, info.decimals);

  const nascimento = await birthBlock(token.chain, token.contract, head);
  const quando = new Date((await blockTime(token.chain, nascimento)) * 1000);

  console.log(
    `\n=== ${token.symbol} · ${info.symbol} · supply ${(supply / 1e9).toFixed(2)} bi ===`,
  );
  console.log(`nasceu no bloco ${nascimento} em ${quando.toISOString().slice(0, 16)} UTC`);

  // ONDE A JANELA COMEÇA. O nascimento do contrato só é o começo da distribuição
  // quando o mint está na transação de deploy, e isso é 13 de 17 e não 17 de 17.
  const { inicio, janela, ancorada, descricao } = await janelaDe(token, nascimento, head);
  const { transfers, failed } = await scanTransfers({
    chain: token.chain,
    token: token.contract,
    fromBlock: inicio,
    toBlock: Math.min(inicio + janela, head),
  });

  const horas = (janela * config.secondsPerBlock) / 3600;
  console.log(
    `${transfers.length} transferências em ${horas.toFixed(1)}h ${descricao} · ${failed} faixas falharam`,
  );

  // VARREDURA QUE NÃO LEU NADA NÃO VIRA LINHA NO ARQUIVO.
  //
  // Zero transferências COM faixas perdidas é "não consegui", e gravar isso como
  // `concentracao: 0` é a armadilha nº 2 escrita em disco. Medido no lote da BSC
  // de 06/09: 16 moedas varridas, e em 15 delas as 41 faixas da gênese falharam
  // — as mesmas 41 de 41 que o AGENTS.md já registrava na AKE. O nó de log da
  // BNB Chain guarda desde 2025-11-10, e a gênese dessas moedas é anterior.
  //
  // Nenhuma delas tinha o que dizer, e as 16 linhas de zero que iam para o
  // arquivo só serviriam para a moeda parecer medida.
  if (transfers.length === 0 && failed > 0) {
    console.log(
      `${token.symbol}: NÃO MEDIDA — as ${failed} faixas da janela falharam e nada foi lido. ` +
        `Não é concentração zero, é leitura que não aconteceu, e não vai para o arquivo.`,
    );
    return null;
  }

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
    .filter(([a, v]) => v / supply >= CORTE && a !== ENDERECO_ZERO)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);

  if (candidatos.length === 0) {
    console.log("nenhum endereço recebeu mais de 0,5% do supply nesta janela");
    // Zero concentração É um resultado, e vale gravar: quer dizer que ninguém
    // ficou com pedaço grande na distribuição. Descartar isso faria a moeda
    // parecer "nunca medida", que é outra coisa.
    return {
      symbol: token.symbol, chain: token.chain, nascimento,
      nasceuEm: quando.toISOString(), transferencias: transfers.length,
      faixasPerdidas: failed, ancorada, donos: [], concentracao: 0,
      medidoEm: Date.now(),
    };
  }

  // Segue o rastro enquanto os donos da gênese estiverem vazios.
  //
  // O alcance é o MENOR entre a medição e o orçamento, e o relatório diz qual
  // dos dois venceu: onde o orçamento vence, um rastro que morre pode ser
  // "não há mais ninguém" ou "acabou o dinheiro antes de chegar lá".
  const alcancePedido = emBlocos(token.chain, ALCANCE_HORAS);
  const alcanceQueCabe = FAIXAS_POR_SALTO * config.maxLogSpan;
  const alcance = Math.min(alcancePedido, alcanceQueCabe);
  if (alcance < alcancePedido) {
    console.log(
      `  rastro limitado pelo orçamento: ${((alcance * config.secondsPerBlock) / 3600).toFixed(0)}h ` +
        `das ${ALCANCE_HORAS}h que a medição pede`,
    );
  }
  //
  // E SEGUIR O RASTRO NÃO PODE DIMINUIR A CONCENTRAÇÃO. O laço trocava o nível
  // atual pelo seguinte sem comparar, e um nível que dispersa apagava um nível
  // que segurava. Apareceu quando o alcance passou de 25h para 336h e o rastro
  // começou a alcançar o que antes não alcançava:
  //
  //   C     29,0% → 0,1%    os donos da gênese seguram 29% HOJE, e o nível
  //   VVV   28,6% → 0,0%    seguinte, para onde parte foi, segura quase nada
  //
  // O corte de 0,3 que decide "chegamos" tinha a C em 0,29: hora e meia de
  // margem outra vez, do outro lado. Trinta e nove por cento de supply nas mãos
  // de quatro contratos é um fato medido; o nível seguinte é informação a mais,
  // não substituição. Então o laço guarda o MAIOR nível e não o último.
  const quantoSeguram = async (lista: [string, number][]): Promise<number> => {
    const enderecos = lista.map(([a]) => a);
    const saldo = await balancesOf(token.chain, token.contract, enderecos);
    return enderecos.reduce((s2, a) => s2 + toUnits(saldo.get(a) ?? BigInt(0), info.decimals), 0);
  };

  const vistos = new Set(candidatos.map(([a]) => a));
  let melhor = candidatos;
  let melhorSaldo = await quantoSeguram(candidatos);
  for (let salto = 1; salto <= SALTOS; salto++) {
    const origens = candidatos.map(([a]) => a);

    // Se ainda seguram o supply, chegamos. Se esvaziaram, o dono está adiante.
    if (melhorSaldo / supply >= 0.3) break;

    const { transfers: saidas } = await scanTransfers({
      chain: token.chain,
      token: token.contract,
      // Do INÍCIO DA JANELA, não do nascimento: onde o mint vem tarde, contar a
      // partir do nascimento gastaria o alcance inteiro antes de a distribuição
      // começar. Na C são 98 dias de blocos vazios antes do primeiro evento.
      fromBlock: inicio,
      toBlock: Math.min(inicio + alcance, head),
      involving: origens,
    });

    // LÍQUIDO, e não a soma do que entrou. Na gênese acima o número é
    // recebeu-menos-enviou; aqui era só somar, e a mesma palavra — `recebeu`,
    // que é o que vai para o arquivo e para a página da moeda — passou a nomear
    // duas contas diferentes conforme o endereço tivesse vindo de uma metade ou
    // da outra deste arquivo.
    //
    // NÃO VEIO DE DEFEITO MEDIDO: veio de ler as duas metades lado a lado, que é
    // a armadilha nº 7 do AGENTS.md ("um freio que existe numa metade do caminho
    // não existe"). Não tenho uma moeda em que a diferença apareça hoje.
    //
    // E o líquido daqui não é tão bom quanto o da gênese, o que vale dizer: a
    // varredura do salto é FILTRADA pelas origens, então ela vê o que sai delas
    // e o que volta para elas, e não vê o que o destino manda para um terceiro.
    // Fecha a ida-e-volta e não faz mais do que isso.
    const recebido = new Map<string, number>();
    for (const t of saidas) {
      const doOrigem = origens.includes(t.from.toLowerCase());
      const paraOrigem = origens.includes(t.to.toLowerCase());
      if (paraOrigem && !doOrigem) {
        const quemDevolveu = t.from.toLowerCase();
        if (!vistos.has(quemDevolveu) && quemDevolveu !== ENDERECO_ZERO) {
          recebido.set(
            quemDevolveu,
            (recebido.get(quemDevolveu) ?? 0) - toUnits(t.value, info.decimals),
          );
        }
        continue;
      }
      if (!doOrigem) continue;
      const para = t.to.toLowerCase();
      // O ZERO TAMBÉM AQUI, e não só na gênese. A armadilha nº 7 do AGENTS.md em
      // estado puro: o filtro existia numa metade do caminho e não na outra. A
      // BASED saiu assim na primeira rodada com a janela nova —
      //
      //   0x0000…0000   recebeu 60.80%   hoje 0.00%   contrato false
      //   "os 1 maiores da gênese ainda seguram 0.0% do supply"
      //
      // — porque o dono da gênese QUEIMOU 60,8% do supply, o rastro seguiu a
      // queima e chamou o endereço zero de dono. Não é dono, é destruição: o
      // saldo dele é zero por definição, então a concentração caía para 0,0% e o
      // painel lia a BASED como moeda sem ninguém segurando pedaço grande.
      if (vistos.has(para) || para === ENDERECO_ZERO) continue;
      recebido.set(para, (recebido.get(para) ?? 0) + toUnits(t.value, info.decimals));
    }

    const proximos = [...recebido.entries()]
      .filter(([, v]) => v / supply >= CORTE)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15);

    if (proximos.length === 0) break;
    for (const [a] of proximos) vistos.add(a);
    candidatos = proximos;

    const saldoDoNivel = await quantoSeguram(proximos);
    const venceu = saldoDoNivel > melhorSaldo;
    if (venceu) {
      melhor = proximos;
      melhorSaldo = saldoDoNivel;
    }
    console.log(
      `salto ${salto}: ${proximos.length} endereços receberam do nível anterior · ` +
        `seguram ${((saldoDoNivel / supply) * 100).toFixed(1)}% hoje` +
        (venceu ? "" : `, menos que o nível anterior (${((melhorSaldo / supply) * 100).toFixed(1)}%) — fica o anterior`),
    );
  }

  candidatos = melhor;
  const enderecos = candidatos.map(([a]) => a);
  const [agora, gas] = await Promise.all([
    balancesOf(token.chain, token.contract, enderecos),
    gasOf(token.chain, enderecos),
  ]);

  const donos: DonoDaGenese[] = [];
  console.log(`\nendereço                                      recebeu    hoje   %supply  contrato   gás`);
  for (const [addr, inicial] of candidatos) {
    const hoje = toUnits(agora.get(addr) ?? BigInt(0), info.decimals);
    const contrato = await isContract(token.chain, addr);
    donos.push({ endereco: addr, recebeu: inicial / supply, hoje: hoje / supply, contrato });
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

  return {
    symbol: token.symbol, chain: token.chain, nascimento,
    nasceuEm: quando.toISOString(), transferencias: transfers.length,
    faixasPerdidas: failed, ancorada, donos, concentracao: aindaTem / supply,
    medidoEm: Date.now(),
  };
}

const pedidos = process.argv.slice(2).map((s) => s.toUpperCase());
const alvos = pedidos.length
  ? pedidos.map((p) => findToken(p) ?? findToken(`${p}USDT`)).filter((t): t is WatchedToken => Boolean(t))
  : ATIVAS.filter((t) => t.contract && CHAINS[t.chain].archiveState.length > 0);

// O arquivo é ACUMULATIVO: cada execução acrescenta ou atualiza as moedas que
// pediu e não toca nas demais. Uma varredura completa custa horas, então
// reescrever tudo a cada vez apagaria trabalho caro por engano.
const CAMINHO = "data/detentores.json";
const arquivo: Arquivo = await readFile(CAMINHO, "utf8")
  .then((t) => JSON.parse(t) as Arquivo)
  .catch(() => ({ moedas: {} }));

for (const token of alvos) {
  const achado = await mapear(token).catch((e: Error) => {
    console.log(`${token.symbol}: ${e.message.slice(0, 70)}`);
    return null;
  });
  if (achado) {
    arquivo.moedas[token.symbol] = achado;
    await mkdir("data", { recursive: true });
    // Grava a cada moeda, e não no fim: a varredura leva horas e cair no meio
    // dela não pode custar o que já foi lido.
    await writeFile(CAMINHO, `${JSON.stringify(arquivo, null, 2)}\n`);
  }
}
