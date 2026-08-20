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

export function comLimite<T>(servico: string, teto: number, tarefa: () => Promise<T>): Promise<T> {
  let fila = filas.get(servico);
  if (!fila) {
    fila = { emVoo: 0, teto, espera: [] };
    filas.set(servico, fila);
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
