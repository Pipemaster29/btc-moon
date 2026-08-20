/**
 * Calcula o panorama e grava em disco, para a página não ter de calculá-lo.
 *
 * O motivo não é só velocidade. Montar o panorama leva vinte segundos — dez
 * arquivos do Data Vision por moeda, mais o saldo em corretora de cada uma — e
 * função serverless costuma ser cortada em dez. Ou seja, a página não estava
 * lenta: ela estava a um cold start de não abrir.
 *
 * O segundo motivo é o que este script deixa para trás. Cada execução acrescenta
 * uma linha por moeda ao histórico, e é ele que responde a pergunta que hoje não
 * tem resposta: os detectores funcionam? A Gate devolve cem horas de passado, e
 * é com essas cem horas que o placar da saída de baleia foi medido. Guardando um
 * ponto a cada execução, em uma semana há mais amostra do que a fonte inteira
 * oferece hoje.
 *
 * Rode com: npm run panorama
 */

import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { caidas, getPanorama } from "../lib/overview";

const DIR = "data";
const ATUAL = `${DIR}/panorama.json`;
/**
 * Um arquivo por mês.
 *
 * São 42 linhas por execução e 48 execuções por dia — perto de 400 KB por dia,
 * que num arquivo único viraria 150 MB em um ano e tornaria cada clone do
 * repositório mais pesado que o projeto inteiro. Quebrado por mês, cada pedaço
 * fecha em torno de 12 MB e o mês corrente é o único que muda.
 */
function historicoDoMes(quando: number): string {
  return `${DIR}/historico-${new Date(quando).toISOString().slice(0, 7)}.jsonl`;
}

/** Só o que vale guardar por moeda por execução — o resto se recalcula. */
interface PontoHistorico {
  t: number;
  s: string;
  preco: number;
  liq: number;
  oi: number;
  dom: number;
  varejo: number;
  baleias: number;
  perna: string | null;
  saida: number;
  estagio: string | null;
  vies: string | null;
  nota: number;
  floatCex: number | null;
}

const t0 = Date.now();
const linhas = await getPanorama();
const levou = (Date.now() - t0) / 1000;

await mkdir(DIR, { recursive: true });

const agora = Date.now();
const snapshot = { geradoEm: agora, levouSegundos: levou, moedas: linhas };

// Só regrava se mudou de verdade. O `geradoEm` muda sempre, então ele fica de
// fora da comparação — senão toda execução produziria um commit novo, e o
// histórico de um repositório vira lixo em poucos dias.
const anterior = await readFile(ATUAL, "utf8").catch(() => null);
const mudou =
  !anterior ||
  JSON.stringify(JSON.parse(anterior).moedas) !== JSON.stringify(linhas);

if (mudou) {
  await writeFile(ATUAL, `${JSON.stringify(snapshot, null, 2)}\n`);
}

const pontos: PontoHistorico[] = linhas.map((r) => ({
  t: Math.floor(agora / 1000),
  s: r.ticker,
  preco: Number(r.price.toPrecision(6)),
  liq: Math.round(r.liquidityUsd),
  oi: Math.round(r.openInterestUsd),
  dom: Number(r.perpDominance.toFixed(1)),
  varejo: Number(r.accountRatio.toFixed(3)),
  baleias: Number(r.whaleRatio.toFixed(3)),
  perna: r.moveKind,
  saida: Number(r.whaleExitShare.toFixed(4)),
  estagio: r.vida?.estagio ?? null,
  vies: r.leitura?.vies ?? null,
  nota: r.score,
  floatCex: r.vida?.floatCex === null || r.vida?.floatCex === undefined
    ? null
    : Number(r.vida.floatCex.toFixed(5)),
}));

const historico = historicoDoMes(agora);
await appendFile(historico, pontos.map((p) => JSON.stringify(p)).join("\n") + "\n");

const porVies = (v: string) => linhas.filter((r) => r.leitura?.vies === v).length;
console.log(
  `${linhas.length} moedas em ${levou.toFixed(1)}s · ` +
    `${porVies("short")} a vender · ${porVies("long")} a comprar · ` +
    `${linhas.filter((r) => r.vida?.estagio === "exausta").length} exaustas`,
);
console.log(
  `${ATUAL}: ${mudou ? "atualizado" : "sem mudança"} · ${historico}: +${pontos.length} pontos`,
);
if (caidas.length > 0) {
  console.log(`⚠️ sem dado nesta rodada: ${caidas.join(", ")}`);
}
const semVida = linhas.filter((r) => !r.vida).map((r) => r.ticker);
if (semVida.length > 0) {
  console.log(`sem histórico suficiente para classificar: ${semVida.join(", ")}`);
}
