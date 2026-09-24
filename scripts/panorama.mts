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
import { fundings, velas } from "../lib/binance";
import { getEmVista, presasPorPosicao } from "../lib/emvista";
import type { EstadoFluxo } from "../lib/fluxo";
import { ESTUDOS_DO_ROBO, estudar, type Estudo, type EstudosDoRobo } from "../lib/estudo";
import { ATIVAS } from "../lib/watchlist";
import { arquivoDoHistorico } from "../lib/historico";

const DIR = "data";
const ATUAL = `${DIR}/panorama.json`;
/**
 * Um arquivo por pedaço de tempo, e não um só: num arquivo único o histórico
 * passaria dos 100 MB que o GitHub aceita em semanas, e cada clone ficaria mais
 * pesado que o projeto inteiro. Era um por mês; desde outubro é um por
 * quinzena, porque o mês com as em vista chegaria a 101 MB — a medição mora em
 * `lib/historico.ts`.
 */
function historicoDe(quando: number): string {
  return `${DIR}/${arquivoDoHistorico(quando)}`;
}

/** Só o que vale guardar por moeda por execução — o resto se recalcula. */
interface PontoHistorico {
  t: number;
  s: string;
  preco: number;
  /**
   * O último negócio do perpétuo no instante do retrato. `preco / pp` é a base
   * pool–perpétuo daquele momento, e é por ela que a carteira ancora as velas
   * de 1h desde 24/09 — antes, a âncora era o fechamento da última vela, que
   * num pump dentro da hora fica mais de 25% longe do preço de agora e fazia o
   * caminho ser recusado justo quando ele importa.
   */
  pp?: number;
  liq: number;
  oi: number;
  dom: number;
  varejo: number;
  baleias: number;
  perna: string | null;
  saida: number;
  estagio: string | null;
  vies: string | null;
  /**
   * Taxa de financiamento POR PERÍODO, como a Binance publica. O período não é
   * gravado, e nestas moedas quase sempre é de 4 h, não de 8 (`intervalosDeFunding`).
   */
  fund: number | null;
  /**
   * Força da call, de 0 a 3. Existe para a carteira poder dimensionar a posição.
   *
   * O `nota` ao lado não serve para isso: ele ordena a tela por "merece olhada
   * agora" e sobe com squeeze em andamento, que é exatamente onde o painel diz
   * para NÃO entrar. Confundir os dois faria a carteira apostar mais alto justo
   * onde a leitura é de ficar de fora.
   */
  forca: number | null;
  nota: number;
  /**
   * O motor, `[testes que passam, testes medidos]` (`lib/motor.ts`), desde
   * 24/09. Não era gravado, e por isso "motor cheio sobe mais?" não tinha como
   * ser medido: 34 das 115 moedas estavam com 3/3 ou 4/4 naquele dia, e só 3
   * delas com call. O placar agrupa por ele quando a amostra existir.
   */
  mot?: [number, number];
  floatCex: number | null;
  /** Circulante ÷ supply total. */
  floatTk: number | null;
  /** Circulante × preço — o tamanho real da moeda. */
  mcap: number | null;
  /** Maior unlock dos últimos 21 dias, em fração. */
  unlock: number | null;
  /**
   * Só nas em vista: a moeda entrou sozinha, pela carteira da Binance. Gravado
   * na LINHA, e não deduzido depois, porque o conjunto em vista muda — uma que
   * sair dele ou for escrita na lista não pode mudar de origem para trás, e é
   * por este campo que a carteira separa as calls de cada origem.
   */
  origem?: "carteira-binance";
}

const t0 = Date.now();
// A lista curada e as em vista (`lib/emvista.ts`), lidas do estado do gravador
// de fluxo que o `dados.sh baixar` acabou de trazer. Sem ele, só a lista — e o
// retrato diz quantas entraram, para a ausência não ficar calada.
const emVista = await getEmVista().catch(() => []);
// OS ESTUDOS QUE FALTAM ÀS EM VISTA, feitos aqui e não à mão.
//
// O estudo tira a direção da leitura quando a moeda CONTINUA o movimento em vez
// de devolvê-lo (`contradizAFase`), e caiu em 6 das 39 em vista estudadas em
// 24/09. A moeda que entra em vista depois ficava sem ele até alguém rodar
// `npm run estudar` — e sem ele, recebia a call que a regra tiraria. Uma
// requisição de velas por moeda, só para as que faltam, no máximo dez por
// retrato; a sem amostra é tentada de novo depois de um dia.
//
// E "sem amostra" só quando a série VEIO e é curta. `estudar` devolve nulo
// também quando a Binance não respondeu, e aí a moeda ficava um dia inteiro
// sem estudo por um soluço de rede (armadilha nº 2). Nulo com série vazia é
// "não consegui" e tenta de novo em uma hora.
{
  const lerJsonLocal = <T,>(f: string) => readFile(f, "utf8").then((t) => JSON.parse(t) as T).catch(() => null);
  const deMao = (await lerJsonLocal<{ moedas?: Record<string, Estudo> }>(`${DIR}/estudos.json`))?.moedas ?? {};
  const robo: EstudosDoRobo = (await lerJsonLocal<EstudosDoRobo>(`${DIR}/${ESTUDOS_DO_ROBO}`)) ?? { moedas: {}, semAmostra: {} };
  robo.moedas ??= {};
  robo.semAmostra ??= {};
  robo.semResposta ??= {};
  const semResposta = robo.semResposta;
  const faltam = emVista
    .filter((t) => !deMao[t.symbol] && !robo.moedas[t.symbol])
    .filter((t) => !(Date.now() - (robo.semAmostra[t.symbol] ?? 0) < 86_400_000))
    .filter((t) => !(Date.now() - (semResposta[t.symbol] ?? 0) < 3_600_000))
    .slice(0, 10);
  let mudas = 0;
  if (faltam.length > 0) {
    for (const t of faltam) {
      const e = await estudar(t.symbol).catch(() => null);
      if (e) {
        robo.moedas[t.symbol] = e;
        delete robo.semAmostra[t.symbol];
        delete semResposta[t.symbol];
      } else if ((await velas(t.symbol, "1d", 5).catch(() => [])).length > 0) {
        robo.semAmostra[t.symbol] = Date.now();
        delete semResposta[t.symbol];
      } else {
        semResposta[t.symbol] = Date.now();
        mudas++;
      }
    }
    await writeFile(`${DIR}/${ESTUDOS_DO_ROBO}`, `${JSON.stringify(robo)}\n`);
    console.log(
      `estudos das em vista: ${faltam.filter((t) => robo.moedas[t.symbol]).length} de ${faltam.length} feitos agora` +
        (mudas > 0 ? ` · ${mudas} sem resposta da Binance, tentadas de novo em uma hora` : ""),
    );
  }
}

// E as que saíram de vista com posição aberta, até a posição fechar
// (`presasPorPosicao`). Os dois arquivos são os que o `baixar` trouxe; sem
// eles, nada é segurado — e o prazo de 14 dias da carteira continua valendo.
const lerJson = <T,>(f: string) => readFile(f, "utf8").then((t) => JSON.parse(t) as T).catch(() => null);
const [carteiraAntes, panoramaAntes, estadoFluxo] = await Promise.all([
  lerJson<{ abertas?: { symbol: string }[] }>("data/carteira.json"),
  lerJson<{ moedas?: Parameters<typeof presasPorPosicao>[2] }>(ATUAL),
  lerJson<EstadoFluxo>("data/fluxo-binance.json"),
]);
const presas = presasPorPosicao(
  (carteiraAntes?.abertas ?? []).map((p) => p.symbol),
  new Set([...ATIVAS, ...emVista].map((t) => t.symbol)),
  panoramaAntes?.moedas ?? [],
  estadoFluxo,
);
if (presas.length > 0) console.log(`fora de vista, seguradas por posição aberta: ${presas.map((t) => t.symbol).join(", ")}`);
const linhas = await getPanorama([...ATIVAS, ...emVista, ...presas]);
// Uma requisição para os 895 perpétuos, e não uma por moeda.
const taxas = await fundings();
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

// Linha sem preço não entra no histórico. A série existe para ser medida
// depois, e um zero ali vira divisão por zero em toda conta de retorno.
const comPreco = linhas.filter((r) => r.price > 0);

const pontos: PontoHistorico[] = comPreco.map((r) => ({
  t: Math.floor(agora / 1000),
  s: r.ticker,
  preco: Number(r.price.toPrecision(6)),
  ...(r.perpPrice > 0 ? { pp: Number(r.perpPrice.toPrecision(6)) } : {}),
  liq: Math.round(r.liquidityUsd),
  oi: Math.round(r.openInterestUsd),
  dom: Number(r.perpDominance.toFixed(1)),
  varejo: Number(r.accountRatio.toFixed(3)),
  baleias: Number(r.whaleRatio.toFixed(3)),
  perna: r.moveKind,
  saida: Number(r.whaleExitShare.toFixed(4)),
  estagio: r.vida?.estagio ?? null,
  vies: r.leitura?.vies ?? null,
  fund: taxas.get(r.symbol) ?? null,
  forca: r.leitura?.forca ?? null,
  nota: r.score,
  ...(r.motor ? { mot: [r.motor.motores, r.motor.medidos] as [number, number] } : {}),
  floatCex: r.vida?.floatCex === null || r.vida?.floatCex === undefined
    ? null
    : Number(r.vida.floatCex.toFixed(5)),
  floatTk: r.vida?.floatToken == null ? null : Number(r.vida.floatToken.toFixed(4)),
  mcap: r.vida?.marketCap == null ? null : Math.round(r.vida.marketCap),
  unlock: (() => {
    const recentes = (r.vida?.unlocks ?? []).filter(
      (u) => agora - u.quando <= 21 * 86400_000,
    );
    return recentes.length
      ? Number(Math.max(...recentes.map((u) => u.variacao)).toFixed(4))
      : null;
  })(),
  ...(r.origem ? { origem: r.origem } : {}),
}));

const historico = historicoDe(agora);
await appendFile(historico, pontos.map((p) => JSON.stringify(p)).join("\n") + "\n");

const porVies = (v: string) => linhas.filter((r) => r.leitura?.vies === v).length;
console.log(
  `${linhas.length} moedas em ${levou.toFixed(1)}s (${linhas.filter((r) => r.origem).length} em vista, de ${emVista.length}) · ` +
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
