/**
 * Ainda existe alguém capaz de empurrar esta moeda?
 *
 * A assimetria por tamanho diz que moeda pequena e derretida sobe 20% em uma
 * semana a cada cinco, contra uma queda de 20% a cada vinte e seis. Mas isso é
 * uma estatística do passado recente, e ela só continua valendo enquanto houver
 * QUEM empurre. Se o operador foi embora, a moeda pequena não vira nada — ela só
 * fica parada, e a cauda seca junto com o interesse.
 *
 * Três coisas precisam existir ao mesmo tempo, e cada uma cobre uma parte do
 * mecanismo:
 *
 *   PERPÉTUO   é onde o preço destas moedas se forma. Sem open interest não há
 *              alavanca: a BTW andou 58% em nove horas com o saldo das
 *              corretoras parado, e isso só é possível porque o open interest
 *              valia mil vezes a pool à vista.
 *   LIVRO      pool que não gira não absorve nem entrega. Sem ela o movimento
 *              do perpétuo não tem onde se ancorar, e a moeda vira preço de
 *              tela.
 *   OFERTA     supply fora das corretoras é munição que ainda não foi gasta.
 *              Quando quase tudo já está em corretora, a distribuição
 *              aconteceu — foi o caso da BLUAI, com só 24,9% em mãos privadas.
 *   EMISSÃO    supply que ainda vai ser criado é vento contra. Um contrato de
 *              alocação soltando meio ponto percentual por mês é uma venda
 *              programada de que ninguém avisou, e todo comprador está do outro
 *              lado dela.
 *
 * A CONCENTRAÇÃO ERA O BURACO DESTE ARQUIVO, e ele estava anotado aqui como
 * impossível: "fora de corretora" não separa um dono com 80% de dez mil donos
 * com 80%, e são situações opostas — a primeira tem operador, a segunda tem
 * público. A ressalva dizia que saber qual é exigiria a lista de maiores
 * detentores, que nó público não entrega.
 *
 * Ela agora entra, por outro caminho: a gênese. Nas primeiras horas de vida do
 * token não existe mercado, e as poucas transferências que existem são a
 * distribuição inicial — `npm run genese` varre essa janela e segue o rastro até
 * quem segura hoje. É barato onde a varredura da vida inteira é impossível: as
 * 34 moedas com contrato somam 167 milhões de logs.
 *
 * O custo de não ter isso era real e mensurável. No JCT, seis endereços seguram
 * 99,9% do supply; este módulo lia esse mesmo número como munição intacta e o
 * painel emitiu COMPRA. Agora a concentração é descontada antes do teste de
 * oferta, e uma moeda com dono reprova em vez de passar.
 *
 * A EMISSÃO ERA O SEGUNDO BURACO, e ele estava escondido dentro do primeiro. A
 * concentração diz quanto supply está parado numa mão só, mas trata "parado" e
 * "saindo" como a mesma coisa — e para quem compra são opostos. Medido na C
 * (Chainbase): três contratos guardavam 35,4% do supply em março e 23,1% em
 * setembro. São 123 milhões de tokens que viraram oferta em seis meses enquanto
 * a leitura de gênese os contava como moeda travada.
 *
 * `npm run vesting` amostra o saldo desses contratos mês a mês e devolve o
 * ritmo. Aqui ele vira o quarto teste.
 *
 * O que continua fora: quantos donos existem de verdade. Endereço de gênese
 * esvaziado diz que o supply foi adiante, não que ele se pulverizou. Este módulo
 * mede CAPACIDADE, não intenção.
 */

import { pairsOfToken } from "./dexscreener";
import { balancesOf, tokenInfo, toUnits, type Chain } from "./onchain";
import { CARTEIRAS_CEX } from "./lifecycle";
import { CONCENTRADA } from "./detentores";
import { RITMO_RELEVANTE } from "./vesting";

export interface Motor {
  /** Fração do circulante fora de corretoras e fora das pools. */
  privado: number | null;
  /**
   * Fração do supply que os donos da gênese ainda seguram. Nulo quando a moeda
   * nunca foi varrida por `npm run genese`.
   */
  concentracao: number | null;
  /** `privado` menos o que está concentrado: a oferta que é mesmo de público. */
  privadoPublico: number | null;
  /** Circulante parado em carteira de corretora. */
  emCorretora: number | null;
  /** Circulante dentro das pools de liquidez. */
  emPool: number | null;
  /** Quantas pools com liquidez existem na rede da moeda. */
  pools: number;
  /**
   * Ritmo de saída dos contratos de alocação, em pp do supply por mês. Nulo
   * quando a moeda nunca foi medida por `npm run vesting`.
   */
  emissao: number | null;
  /** Os testes. Oferta e emissão são nulos quando não deu para medir. */
  temPerpetuo: boolean;
  temLivro: boolean;
  temOferta: boolean | null;
  semEmissao: boolean | null;
  /** Quantos passaram, entre os que deram para medir. */
  motores: number;
  /** Quantos deram para medir — nem sempre três. */
  medidos: number;
  resumo: string;
}

/** Abaixo disso o perpétuo não move o preço à vista. */
const OI_MINIMO = 500_000;
/** Pool menor que isto não absorve nada. */
const POOL_MINIMA = 50_000;
/** Giro diário mínimo para a pool ser considerada viva. */
const GIRO_MINIMO = 0.05;
/** Abaixo disso a oferta já foi entregue ao mercado. */
const PRIVADO_MINIMO = 0.4;

export async function lerMotor(
  chain: Chain,
  contract: string,
  circulante: number | null,
  /** O contrato representa a moeda inteira? Sem isso, as frações mentem. */
  representa: boolean,
  openInterestUsd: number,
  liquidityUsd: number,
  volume24h: number,
  /**
   * Fração do supply ainda nas mãos de quem a recebeu na gênese.
   *
   * ESTE PARÂMETRO CONSERTA UM FALSO POSITIVO QUE O ARQUIVO PREVIA E NÃO
   * MEDIA. O teste de oferta pergunta quanto do circulante está fora das
   * corretoras e trata um número alto como munição intacta. No JCT esse número
   * é ~100% — e são SEIS endereços segurando 99,9%. O painel leu isso como
   * moeda cheia de oferta livre e emitiu COMPRA; a moeda depois imprimiu preço
   * de 2,9e-27.
   *
   * Com a concentração descontada, "privado" volta a significar o que ele diz
   * significar: supply em mãos que não são de um operador só.
   */
  concentracao: number | null = null,
  /**
   * Supply do contrato ÷ circulante, quando se sabe.
   *
   * Só entra no texto, e entra porque o texto estava enganando: "contrato não
   * representa a moeda" era dito igual para um fragmento de um milésimo e para
   * um contrato que guarda 89% do circulante e fica um ponto abaixo do corte.
   */
  cobertura: number | null = null,
  /**
   * Pontos percentuais do supply que os contratos de alocação soltam por mês.
   *
   * Vem de `npm run vesting`. Nulo quando a moeda nunca foi medida, e nulo NÃO é
   * zero: uma moeda não varrida não pode passar num teste que ninguém aplicou.
   */
  emissao: number | null = null,
): Promise<Motor> {
  const temPerpetuo = openInterestUsd >= OI_MINIMO;
  const giro = liquidityUsd > 0 ? volume24h / liquidityUsd : 0;
  const temLivro = liquidityUsd >= POOL_MINIMA && giro >= GIRO_MINIMO;

  let privado: number | null = null;
  let emCorretora: number | null = null;
  let emPool: number | null = null;
  let pools = 0;

  if (contract && circulante && circulante > 0 && representa) {
    try {
      const [info, pares] = await Promise.all([
        tokenInfo(chain, contract),
        pairsOfToken(contract),
      ]);
      const locais = pares.filter((p) => p.chain === chain && p.liquidityUsd > 0);
      pools = locais.length;

      const saldos = await balancesOf(chain, contract, [
        ...CARTEIRAS_CEX,
        ...locais.map((p) => p.address),
      ]);

      let cex = 0;
      let pool = 0;
      for (const a of CARTEIRAS_CEX) cex += toUnits(saldos.get(a.toLowerCase()) ?? BigInt(0), info.decimals);
      for (const p of locais) pool += toUnits(saldos.get(p.address.toLowerCase()) ?? BigInt(0), info.decimals);

      emCorretora = cex / circulante;
      emPool = pool / circulante;
      privado = Math.max(0, Math.min(1, 1 - emCorretora - emPool));
    } catch {
      // Sem os saldos sobram os dois primeiros testes, que já dizem bastante.
    }
  }

  // A oferta que é de PÚBLICO, e não do dono. Sem varredura de gênese não há o
  // que descontar e o número fica como antes — com a ressalva no resumo, porque
  // "não medi a concentração" e "a concentração é baixa" não são a mesma coisa.
  const privadoPublico =
    privado === null ? null : concentracao === null ? privado : Math.max(0, privado - concentracao);

  // Nulo quando não deu para medir, e isso NÃO conta como reprovado. Tratar
  // "não consegui ver" como "não tem" reprovaria em massa as moedas cujo
  // contrato é fragmento — que é uma limitação da leitura, não da moeda.
  const temOferta = privadoPublico === null ? null : privadoPublico >= PRIVADO_MINIMO;

  // Emissão abaixo do corte passa; acima, reprova. Não medida fica nula pelo
  // mesmo motivo dos outros: "não olhei" não é "não tem".
  const semEmissao = emissao === null ? null : emissao < RITMO_RELEVANTE;

  const testes = [temPerpetuo, temLivro, temOferta, semEmissao];
  const medidos = testes.filter((t) => t !== null).length;
  const motores = testes.filter((t) => t === true).length;

  const faltas: string[] = [];
  if (!temPerpetuo) faltas.push("sem perpétuo relevante");
  if (!temLivro) faltas.push(giro < GIRO_MINIMO ? "pool sem giro" : "pool pequena demais");
  if (temOferta === false) {
    faltas.push(
      concentracao !== null && concentracao >= CONCENTRADA
        ? `${(concentracao * 100).toFixed(0)}% do supply ainda está com quem o recebeu na gênese — ` +
          `é dono, não float`
        : `só ${((privadoPublico ?? 0) * 100).toFixed(0)}% do circulante fora de corretora`,
    );
  }
  if (semEmissao === false) {
    faltas.push(
      `os contratos de alocação soltam ${emissao!.toFixed(2)} pp do supply por mês — ` +
        `o comprador está do outro lado de uma venda programada`,
    );
  }
  if (concentracao === null && privado !== null) {
    faltas.push("concentração não varrida — rode `npm run genese`");
  }
  if (emissao === null && contract) {
    faltas.push("emissão não varrida — rode `npm run vesting`");
  }
  if (temOferta === null) {
    faltas.push(
      cobertura !== null && cobertura < 1
        ? `oferta não medida — o contrato guarda ${(cobertura * 100).toFixed(0)}% do circulante, ` +
          `abaixo do corte de 90%`
        : "oferta não medida — contrato não representa a moeda",
    );
  }

  return {
    privado,
    concentracao,
    privadoPublico,
    emCorretora,
    emPool,
    pools,
    emissao,
    temPerpetuo,
    temLivro,
    temOferta,
    semEmissao,
    motores,
    medidos,
    resumo:
      motores === medidos && medidos === 4
        ? "perpétuo, livro, oferta e nenhuma emissão pendente — a moeda ainda tem com que ser movida"
        : motores === medidos
          ? `${motores} de ${medidos} medidos passam · ${faltas.join(", ")}`
          : `${motores} de ${medidos} medidos · ${faltas.join(", ")}`,
  };
}
