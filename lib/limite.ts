/**
 * Um teto de requisições simultâneas por serviço.
 *
 * Sem isto, quarenta e três moedas lidas em paralelo viram quarenta e três
 * requisições ao mesmo tempo para cada API, e o modo de falha é o pior
 * possível: o servidor não recusa com erro, ele demora, o tempo limite estoura e
 * quem chama recebe lista vazia — que se lê como "essa moeda não tem dado". A
 * moeda simplesmente some do painel, sem erro em lugar nenhum.
 *
 * Já aconteceu duas vezes neste projeto. Primeiro com os arquivos da Binance,
 * onde dezesseis moedas apareceram sem histórico tendo cada uma cento e
 * cinquenta dias publicados. Depois com o DexScreener, onde a Chainbase sumiu do
 * retrato inteiro e funcionava perfeitamente quando consultada sozinha.
 *
 * Um teto por serviço, e não um global, porque eles têm limites diferentes e
 * são consultados em paralelo entre si de propósito.
 */

const filas = new Map<string, { emVoo: number; teto: number; espera: (() => void)[] }>();

/**
 * O teto vale por SERVIÇO, e quem chega primeiro o define.
 *
 * Chamar o mesmo serviço com tetos diferentes não é aceito em silêncio: o maior
 * ganha e passa a valer para todos. Ignorar o segundo valor deixaria o
 * comportamento depender da ordem em que os módulos são carregados, que é o
 * tipo de coisa que muda sozinha num refactor e ninguém percebe.
 */
export function comLimite<T>(servico: string, teto: number, tarefa: () => Promise<T>): Promise<T> {
  let fila = filas.get(servico);
  if (!fila) {
    fila = { emVoo: 0, teto, espera: [] };
    filas.set(servico, fila);
  } else if (teto > fila.teto) {
    // As vagas que acabaram de existir são liberadas agora. Contar pela
    // diferença, e não por `emVoo`, é o que evita soltar demais: quem é
    // liberado só incrementa `emVoo` no microtask seguinte.
    const novas = teto - fila.teto;
    fila.teto = teto;
    for (let i = 0; i < novas; i++) fila.espera.shift()?.();
  }

  const executar = async (): Promise<T> => {
    fila.emVoo++;
    try {
      return await tarefa();
    } finally {
      fila.emVoo--;
      fila.espera.shift()?.();
    }
  };

  if (fila.emVoo >= fila.teto) {
    return new Promise<void>((r) => fila.espera.push(r)).then(executar);
  }
  return executar();
}
