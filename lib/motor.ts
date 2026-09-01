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
 *
 * O QUE ISTO NÃO MEDE, e a distinção importa: concentração. "Fora de corretora"
 * não separa um dono com 80% de dez mil donos com 80%, e são situações opostas —
 * a primeira tem operador, a segunda tem público. Saber qual é exige a lista de
 * maiores detentores, que nenhum nó público entrega e que só sairia varrendo a
 * distribuição inicial de cada moeda, uma a uma. Enquanto isso não existe, este
 * módulo mede CAPACIDADE, não intenção.
 */

import { pairsOfToken } from "./dexscreener";
import { balancesOf, tokenInfo, toUnits, type Chain } from "./onchain";
import { CARTEIRAS_CEX } from "./lifecycle";

export interface Motor {
  /** Fração do circulante fora de corretoras e fora das pools. */
  privado: number | null;
  /** Circulante parado em carteira de corretora. */
  emCorretora: number | null;
  /** Circulante dentro das pools de liquidez. */
  emPool: number | null;
  /** Quantas pools com liquidez existem na rede da moeda. */
  pools: number;
  /** Os três testes. O de oferta é nulo quando não deu para medir. */
  temPerpetuo: boolean;
  temLivro: boolean;
  temOferta: boolean | null;
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
   * Supply do contrato ÷ circulante, quando se sabe.
   *
   * Só entra no texto, e entra porque o texto estava enganando: "contrato não
   * representa a moeda" era dito igual para um fragmento de um milésimo e para
   * um contrato que guarda 89% do circulante e fica um ponto abaixo do corte.
   */
  cobertura: number | null = null,
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

  // Nulo quando não deu para medir, e isso NÃO conta como reprovado. Tratar
  // "não consegui ver" como "não tem" reprovaria em massa as moedas cujo
  // contrato é fragmento — que é uma limitação da leitura, não da moeda.
  const temOferta = privado === null ? null : privado >= PRIVADO_MINIMO;

  const testes = [temPerpetuo, temLivro, temOferta];
  const medidos = testes.filter((t) => t !== null).length;
  const motores = testes.filter((t) => t === true).length;

  const faltas: string[] = [];
  if (!temPerpetuo) faltas.push("sem perpétuo relevante");
  if (!temLivro) faltas.push(giro < GIRO_MINIMO ? "pool sem giro" : "pool pequena demais");
  if (temOferta === false) {
    faltas.push(`só ${((privado ?? 0) * 100).toFixed(0)}% do circulante fora de corretora`);
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
    emCorretora,
    emPool,
    pools,
    temPerpetuo,
    temLivro,
    temOferta,
    motores,
    medidos,
    resumo:
      motores === medidos && medidos === 3
        ? "perpétuo, livro e oferta — a moeda ainda tem com que ser movida"
        : motores === medidos
          ? `${motores} de ${medidos} medidos passam · ${faltas.join(", ")}`
          : `${motores} de ${medidos} medidos · ${faltas.join(", ")}`,
  };
}
