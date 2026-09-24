/**
 * O nome do arquivo do histórico, e o padrão que os leitores reconhecem.
 *
 * UM POR MÊS ATÉ SETEMBRO, UM POR QUINZENA DESDE OUTUBRO, e a troca é medida.
 * O desenho mensal contava 42 moedas e 48 retratos por dia, ~12 MB por mês. Em
 * 24/09, com as em vista, foram 113 moedas por retrato, 41 retratos em 10,1 h
 * (um a cada ~15 min, pelo laço do workflow) e 284 bytes por linha: 3,12 MB
 * por dia, 97 MB num mês de 31 dias — 101 MB com o `pp` que o retrato passou a
 * gravar. O GitHub RECUSA arquivo acima de 100 MB, e a recusa não é de um
 * arquivo: o push inteiro volta, e com ele todo retrato, carteira e garimpo
 * seguinte, até alguém mexer.
 *
 * Por quinzena são até 16 dias, ~52 MB: cabe o dobro das moedas de hoje antes
 * de encostar no teto. A troca é na virada do mês para nenhum mês ficar com os
 * dois formatos — setembro fecha perto de 51 MB, acima do aviso de 50 MB do
 * GitHub e longe da recusa. `npm run auditar-dados` reprova arquivo acima de
 * 80 MB, para o próximo corte chegar antes do teto e não depois.
 *
 * Os leitores ordenam por tempo depois de ler, então a ordem dos arquivos não
 * importa: mensal e quinzenal convivem.
 */

export const ARQUIVO_HISTORICO = /^historico-\d{4}-\d{2}(-[12])?\.jsonl$/;

/** A partir de quando o arquivo é por quinzena: 1º de outubro de 2026, UTC. */
export const QUINZENAS_DESDE = Date.UTC(2026, 9, 1);

/** O arquivo em que a linha de `quando` (ms) mora. Só o nome, sem a pasta. */
export function arquivoDoHistorico(quando: number): string {
  const iso = new Date(quando).toISOString();
  const mes = iso.slice(0, 7);
  if (quando < QUINZENAS_DESDE) return `historico-${mes}.jsonl`;
  return `historico-${mes}-${Number(iso.slice(8, 10)) <= 15 ? 1 : 2}.jsonl`;
}
