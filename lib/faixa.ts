/**
 * Quando dois preços são da MESMA moeda: a razão entre eles fica dentro desta
 * faixa.
 *
 * É a mesma pergunta em sete lugares — a âncora das velas da carteira, o juiz
 * de cada linha do histórico, a base medida no retrato, o árbitro da pool na
 * leitura, a base da marcação ao vivo e as duas auditorias —, e ela estava
 * escrita sete vezes. Mexer numa só deixaria o retrato, a carteira e a
 * auditoria discordando sobre qual preço é de verdade: a armadilha nº 7.
 *
 * A faixa sai da medição: nas 16 posições de 04/09 a razão pool–perpétuo ficou
 * entre 0,96 e 1,08; em 24/09, 73 de 75 moedas a menos de 2% e a mais longe a
 * 10%. O que caiu fora foi sempre outra coisa — pool rasa (HEI, 1,6–2x), pool
 * parada (CAP, 1,45x), pool alheia (AIOT, 0,37x). "Razão de 1,4 não é base de
 * mercado, é outra moeda."
 *
 * Sem dependência nenhuma de propósito: `lib/carteira.ts` roda no navegador.
 */
export const FAIXA_MESMA_MOEDA = { min: 0.8, max: 1.25 } as const;

export function mesmaMoeda(razao: number): boolean {
  return Number.isFinite(razao) && razao >= FAIXA_MESMA_MOEDA.min && razao <= FAIXA_MESMA_MOEDA.max;
}
