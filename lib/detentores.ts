/**
 * Quem realmente segura cada moeda — a pergunta que o motor não sabia responder.
 *
 * O `lib/motor.ts` mede quanto do circulante está FORA das corretoras e chama
 * isso de oferta que ainda não foi gasta. O próprio arquivo avisa, em letra
 * grande, o que essa conta não distingue:
 *
 *   "'Fora de corretora' não separa um dono com 80% de dez mil donos com 80%,
 *    e são situações opostas — a primeira tem operador, a segunda tem público."
 *
 * E a diferença não é teórica. Medido: no JCT, SEIS endereços seguram 99,9% do
 * supply. O motor lia esse mesmo 99,9% como "quase toda a munição intacta" e o
 * painel emitiu COMPRA na moeda — que depois imprimiu preço de 2,9e-27. Uma
 * moeda em que seis carteiras têm tudo não tem float público; tem dono.
 *
 * A lista de maiores detentores não existe em nó público, e reconstruí-la
 * varrendo a vida do token custa caro demais — medido, as 34 moedas com contrato
 * somam 167 milhões de logs e 278 mil faixas. Mas a GÊNESE é barata: nas
 * primeiras horas não existe mercado, e as poucas transferências que existem são
 * a distribuição inicial. É isso que `npm run genese` varre, e é o resultado
 * dele que este módulo lê.
 *
 * O QUE ISTO NÃO É: a lista completa de detentores. É o rastro do supply desde o
 * nascimento até quem o segura HOJE, que responde "existe um operador?" sem
 * responder "quantos donos existem". Endereço de gênese esvaziado significa que
 * o supply foi adiante, não que ele se pulverizou.
 */

import { readFile } from "node:fs/promises";

const CAMINHO = "data/detentores.json";

export interface DonoDaGenese {
  endereco: string;
  /**
   * Fração do supply que ele recebeu na distribuição inicial.
   *
   * PODE PASSAR DE 1, E PASSAR NÃO É ERRO. O valor recebido é histórico e o
   * supply que divide é o de HOJE, então uma moeda que queimou parte do que
   * emitiu devolve fração acima de um. A BASED é o exemplo do repositório: no
   * bloco de nascimento o endereço 0x1924… recebeu do zero 202,67% do supply
   * atual e devolveu ao zero 60,80% mil e duzentos blocos depois, o que dá os
   * 141,87% que a página imprime. Os dois números estão certos; o que mudou
   * entre a emissão e hoje foi o denominador.
   *
   * Normalizar pelo supply da época exigiria `totalSupply` no bloco da gênese,
   * que é uma leitura de estado antigo por moeda — dá para fazer e ainda não
   * foi feito. Enquanto não for, quem lê este campo precisa saber que ele é
   * "quanto do supply de hoje", e não "quanto da emissão".
   */
  recebeu: number;
  /** Fração do supply que ele ainda segura. Esta é de hoje sobre hoje. */
  hoje: number;
  contrato: boolean;
}

export interface Detentores {
  symbol: string;
  chain: string;
  /** Bloco em que o contrato passou a existir, por busca binária. */
  nascimento: number;
  nasceuEm: string;
  /** Quantas transferências existiram na janela da gênese. */
  transferencias: number;
  /** Faixas de log que falharam: acima de zero, a leitura está incompleta. */
  faixasPerdidas: number;
  donos: DonoDaGenese[];
  /**
   * Fração do supply que os donos da gênese ainda seguram, somada.
   *
   * É o número que interessa. Acima de 0,5 a moeda tem operador; perto de zero
   * o supply já saiu das mãos originais — o que não garante que ele se
   * pulverizou, só que não está mais onde nasceu.
   */
  concentracao: number;
  medidoEm: number;
}

export interface Arquivo {
  moedas: Record<string, Detentores>;
}

/**
 * Acima disto a moeda tem dono, não float.
 *
 * O corte é grosso de propósito e não foi calibrado contra retorno nenhum — não
 * há amostra para isso. Ele separa os casos que a medição mostrou serem
 * qualitativamente diferentes. Com a janela ancorada no primeiro evento, as 17
 * moedas de Ethereum e Base leem: BTW 100,0% · JCT 99,9% · CAP 84,5% · ZAMA
 * 70,6% · MORPHO 51,5% de um lado; C 29,0% · VVV 28,6% · POWER 21,8% · HEMI
 * 12,1% · e sete em 0% do outro.
 */
export const CONCENTRADA = 0.5;

let cache: Arquivo | null = null;

/** O arquivo gravado por `npm run genese`. Vazio quando ele nunca rodou. */
export async function lerDetentores(): Promise<Arquivo> {
  if (cache) return cache;
  try {
    const dado = JSON.parse(await readFile(CAMINHO, "utf8")) as Arquivo;
    cache = dado?.moedas ? dado : { moedas: {} };
  } catch {
    cache = { moedas: {} };
  }
  return cache;
}

/** Só o número de concentração, ou nulo quando a moeda nunca foi varrida. */
export async function concentracaoDe(symbol: string): Promise<number | null> {
  const arquivo = await lerDetentores();
  const d = arquivo.moedas[symbol];
  if (!d) return null;
  // Leitura incompleta não vira número: faixa perdida some do total somado e
  // faria a concentração parecer MENOR do que é, que é o erro perigoso aqui.
  if (d.faixasPerdidas > 0) return null;
  // Janela vazia é o mesmo erro por outro caminho, e mais traiçoeiro porque não
  // parece falha. A C nasceu em abril de 2025 e só distribuiu em julho: as
  // primeiras 20 mil quadras não tinham transferência nenhuma, e o arquivo
  // gravou concentração ZERO numa moeda em que três contratos seguravam 23% do
  // supply. Zero e "não medi" precisam ser coisas diferentes.
  //
  // A CAUSA DAQUELE CASO FOI CONSERTADA e este guard fica. `npm run genese`
  // agora ancora a janela no PRIMEIRO EVENTO em vez do nascimento do contrato,
  // e a C — cuja primeira transferência vem 2.349 horas, 98 dias, depois de o
  // contrato existir — passou a ler 29,0% com 12 transferências. O guard
  // continua porque a âncora só existe onde há explorador: nas 20 moedas da BSC
  // a janela ainda começa no nascimento e este caso pode voltar. Onde ele
  // voltar, quem responde é `npm run vesting`, que procura a emissão na vida
  // toda.
  if (d.transferencias === 0) return null;
  return d.concentracao;
}
