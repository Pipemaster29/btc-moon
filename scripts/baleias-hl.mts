/**
 * AS BALEIAS DA HYPERLIQUID AO VIVO: lê as posições das contas do ranking
 * público com US$ 5 milhões ou mais de patrimônio, sem os market makers, e
 * grava, por moeda, quem está comprado e vendido, o consenso, o das espertas, o
 * fluxo desde a leitura anterior, o custo médio e onde as baleias seriam
 * liquidadas (`lib/hyperliquid.ts`). Grava `data/baleias-hl.json` — a leitura de
 * agora, que a página mostra — e, uma vez por dia UTC, uma linha por moeda em
 * `data/baleias-hl-AAAA-MM.jsonl`: o histórico SEM o viés da reconstrução, para
 * a medição de daqui para frente.
 *
 * O MARKET MAKER SAI PELAS EXECUÇÕES, COMO NA MEDIÇÃO. A posição de quem faz
 * centenas de execuções por dia é estoque, não opinião, e o giro do patrimônio
 * não separa: em 09/11, a conta com US$ 156 milhões vendidos em BTC tinha US$ 182
 * milhões de patrimônio e giro de 3,2x no mês — e 10 mil execuções num dia. Ela
 * sozinha fazia o "consenso das baleias" do BTC. Cada conta é classificada pelas
 * 2.000 execuções mais recentes (mais de 300 por dia: market maker, fora), a
 * classificação fica guardada por 30 dias, e conta sem classificação não entra
 * — "não sei se é market maker" não vira baleia. A primeira classificação vem
 * de `data/baleias-classes.json` (no `main`), gravado em 09/11 para as 750
 * contas do universo; daí em diante, até 40 por rodada, as sem classificação
 * primeiro e depois as mais velhas.
 *
 * O FLUXO É DAS MESMAS CONTAS, AO MESMO PREÇO (`fluxoEntre`): a leitura guarda a
 * posição de cada conta em unidades, e a seguinte compara só as contas lidas
 * nas duas, ao preço de agora. E a primeira leitura completa de cada dia vai
 * também, conta a conta, para `data/baleias-hl-contas-AAAA-MM.jsonl` — é dele
 * que o juiz tira o fluxo de 3 dias.
 *
 * US$ 5 MILHÕES, e não 1: é o universo B da medição (737 contas em 09/11), todo
 * classificado pelo download, e a leitura cabe em um a dois minutos — a de US$ 1
 * milhão eram ~2.500 contas sem classificação nenhuma.
 *
 * DE QUATRO EM QUATRO HORAS: mais cedo que isso o script sai sem fazer nada.
 * "Não consegui" não vira "não achei": sem o ranking, sem os preços ou com mais
 * de 10% das contas sem leitura, não grava — uma conta não lida pareceria uma
 * baleia saindo da moeda.
 *
 * Rode com: npm run baleias  (`-- --agora` ignora as quatro horas; `-- --limite N` lê só N contas;
 *           `-- --classificar N` classifica até N contas na rodada, em vez de 40;
 *           `-- --semente` grava a classificação em data/baleias-classes.json)
 */

import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import {
  casarComBinance,
  fluxoEntre,
  lerMarketMakers,
  lerMoedas,
  lerPosicoes,
  lerRanking,
  type ArquivoBaleias,
  type LinhaDiariaDasContas,
  type PosicaoAoVivo,
  type UnidadesPorConta,
} from "../lib/hyperliquid";
import { criarPedidor } from "./hl-api.mjs";

const RANKING = "https://stats-data.hyperliquid.xyz/Mainnet/leaderboard";
const ARQUIVO = "data/baleias-hl.json";
const SEMENTE = "data/baleias-classes.json";
const INTERVALO = 4 * 3_600_000;
const DIA = 86_400_000;
/** O universo ao vivo: patrimônio de US$ 5 milhões ou mais no ranking — o B da medição. */
const PATRIMONIO_MINIMO = 5e6;
/** 2.000 execuções em menos disto é mais de 300 por dia: market maker. A mesma régua da medição. */
const JANELA_ALTA_FREQUENCIA = (2000 / 300) * DIA;
/**
 * A classificação vale 30 dias; até 40 contas por rodada são (re)classificadas.
 * Cada uma pesa até 120 no teto de 1.000 por minuto que o script se dá (as 2.000
 * execuções mais recentes: 20 + 1 a cada 20), então 40 são até ~5 minutos de
 * rodada — e as 750 da semente, vencendo juntas, voltam em ~3 dias de rodadas
 * de quatro em quatro horas, valendo a classificação velha enquanto isso.
 */
const VALIDADE_DA_CLASSE = 30 * DIA;
const CLASSIFICACOES_POR_RODADA = 40;

const agora = Date.now();
let anterior: ArquivoBaleias | null = null;
if (existsSync(ARQUIVO)) {
  try {
    anterior = JSON.parse(await readFile(ARQUIVO, "utf8")) as ArquivoBaleias;
  } catch (e) {
    console.error(`baleias: ${ARQUIVO} existe e não se lê (${(e as Error).message}) — nada gravado`);
    process.exit(1);
  }
}
if (anterior && agora - anterior.geradoEm < INTERVALO && !process.argv.includes("--agora")) {
  console.log(`baleias: a leitura tem ${((agora - anterior.geradoEm) / 60_000).toFixed(0)} min — a próxima sai com 4 h`);
  process.exit(0);
}

// ------------------------------------------------------------------ o teto de peso

// O pedido com o teto de peso mora em `hl-api.mts`, o mesmo do download da medição.
const { pedir } = criarPedidor({ tentativas: 4, tempoLimiteMs: 30_000 });

// ------------------------------------------------------------------ o universo

let contas = anterior?.contas ?? [];
let espertas = new Set(anterior?.espertas ?? []);
let rankingEm = anterior?.rankingEm ?? 0;
let nomes: Record<string, string> = anterior?.nomes ?? {};
if (agora - rankingEm >= DIA || contas.length === 0) {
  try {
    const res = await fetch(RANKING, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const ranking = lerRanking(await res.json());
    const grandes = ranking.filter((c) => c.patrimonio >= PATRIMONIO_MINIMO);
    if (grandes.length < 200) throw new Error(`só ${grandes.length} contas grandes no ranking`);
    contas = grandes.map((c) => c.endereco);
    espertas = new Set(grandes.filter((c) => c.lucroMes > 0).map((c) => c.endereco));
    nomes = Object.fromEntries(grandes.filter((c) => c.nome).map((c) => [c.endereco, c.nome as string]));
    rankingEm = agora;
    console.log(`ranking: ${ranking.length} contas, ${contas.length} com US$ 5 mi ou mais, ${espertas.size} delas com lucro no mês`);
  } catch (e) {
    if (contas.length === 0) {
      console.log(`baleias: sem o ranking (${(e as Error).message}) e sem universo anterior — nada gravado`);
      process.exit(0);
    }
    console.log(`baleias: o ranking não veio (${(e as Error).message}) — segue com o universo de ${new Date(rankingEm).toISOString().slice(0, 16)}`);
  }
}

// ------------------------------------------------------------------ a classificação

/** Por conta: se é market maker (alta frequência) e quando isso foi visto. */
const classes: Record<string, { af: boolean; em: number }> = { ...(anterior?.classes ?? {}) };
if (!anterior?.classes && existsSync(SEMENTE)) {
  const s = JSON.parse(await readFile(SEMENTE, "utf8")) as { geradoEm: number; altaFrequencia: string[]; direcionais: string[] };
  for (const e of s.altaFrequencia) classes[e] = { af: true, em: s.geradoEm };
  for (const e of s.direcionais) classes[e] = { af: false, em: s.geradoEm };
  console.log(`classes semeadas por ${SEMENTE}: ${s.altaFrequencia.length} market makers, ${s.direcionais.length} direcionais`);
}
// `--classificar N`: até N contas nesta rodada, em vez de 40 — para semear o arquivo de uma vez.
// As sem classificação primeiro (estão fora da leitura até lá), depois as vencidas, a mais velha antes.
const porRodada = process.argv.includes("--classificar") ? Number(process.argv[process.argv.indexOf("--classificar") + 1]) : CLASSIFICACOES_POR_RODADA;
const aClassificar = contas
  .filter((e) => !classes[e] || agora - classes[e].em > VALIDADE_DA_CLASSE)
  .sort((x, y) => (classes[x]?.em ?? 0) - (classes[y]?.em ?? 0))
  .slice(0, Number.isFinite(porRodada) && porRodada > 0 ? porRodada : CLASSIFICACOES_POR_RODADA);
let classificadas = 0;
await Promise.all(
  Array.from({ length: 6 }, async () => {
    for (;;) {
      const e = aClassificar.shift();
      if (!e) return;
      // As 2.000 execuções mais recentes: se cabem em menos de 6,7 dias, é mais de 300 por dia.
      const f = await pedir<{ time: number }[]>({ type: "userFills", user: e }, 20, 20);
      if (!f) continue;
      // A ordem que a API devolve não importa: o que conta é o intervalo entre a mais velha e a mais nova.
      const intervalo = f.length > 0 ? Math.abs(f[0].time - f[f.length - 1].time) : Infinity;
      classes[e] = { af: f.length >= 2000 && intervalo < JANELA_ALTA_FREQUENCIA, em: agora };
      classificadas++;
    }
  }),
);
// `--semente`: grava a classificação em `data/baleias-classes.json` (no `main`), a semente da primeira rodada do workflow.
if (process.argv.includes("--semente")) {
  const doUniverso = contas.filter((e) => classes[e]);
  await mkdir("data", { recursive: true });
  await writeFile(
    SEMENTE,
    `${JSON.stringify({
      geradoEm: agora,
      regra: "mais de 300 execuções por dia nas 2.000 execuções comuns mais recentes",
      altaFrequencia: doUniverso.filter((e) => classes[e].af).sort(),
      direcionais: doUniverso.filter((e) => !classes[e].af).sort(),
    })}\n`,
  );
  console.log(`${SEMENTE} gravado: ${doUniverso.length} contas classificadas`);
}
const direcionais = contas.filter((e) => classes[e] && !classes[e].af);
const mms = contas.filter((e) => classes[e]?.af).length;
const semClasse = contas.length - direcionais.length - mms;

// ------------------------------------------------------------------ o mercado

const ctx = await pedir<[{ universe: { name: string }[] }, { markPx?: string; openInterest?: string }[]]>({ type: "metaAndAssetCtxs" }, 20);
if (!ctx) {
  console.log("baleias: a Hyperliquid não devolveu os preços — nada gravado");
  process.exit(0);
}
const precos = new Map<string, number>();
const openInterest = new Map<string, number>();
ctx[0].universe.forEach((u, i) => {
  const p = Number(ctx[1][i]?.markPx);
  const oi = Number(ctx[1][i]?.openInterest);
  if (p > 0 && Number.isFinite(p)) {
    precos.set(u.name, p);
    if (Number.isFinite(oi)) openInterest.set(u.name, oi * p);
  }
});
// O par na Binance, pelo preço (armadilha nº 1): sem a lista da Binance, a leitura sai sem o par, não sem as baleias.
let binance: Map<string, string> | undefined;
try {
  const res = await fetch("https://www.binance.com/fapi/v1/ticker/price", { signal: AbortSignal.timeout(20_000) });
  const tickers = (await res.json()) as { symbol: string; price: string }[];
  const pb = new Map(tickers.map((t) => [t.symbol, Number(t.price)]));
  binance = casarComBinance([...precos].map(([moeda, preco]) => ({ moeda, preco })), (s) => pb.get(s));
} catch {
  console.log("baleias: sem os preços da Binance — a leitura sai sem o par de cada moeda");
}

// ------------------------------------------------------------------ as contas

/**
 * Lê as posições de uma lista de contas, seis em paralelo. Resposta sem as
 * posições, ou com uma ilegível, é conta NÃO LIDA — não conta sem posição.
 * A mesma função lê as baleias e os market makers, para a regra não divergir.
 */
async function lerContas(lista: readonly string[]): Promise<{ posicoes: PosicaoAoVivo[]; unidades: UnidadesPorConta; lidas: number; semLeitura: number; comPosicao: number }> {
  const r = { posicoes: [] as PosicaoAoVivo[], unidades: {} as UnidadesPorConta, lidas: 0, semLeitura: 0, comPosicao: 0 };
  const aLer = [...lista];
  await Promise.all(
    Array.from({ length: 6 }, async () => {
      for (;;) {
        const conta = aLer.shift();
        if (!conta) return;
        const estado = await pedir<unknown>({ type: "clearinghouseState", user: conta }, 2);
        const ps = estado ? lerPosicoes(conta, estado) : null;
        if (!ps) {
          r.semLeitura++;
          continue;
        }
        r.lidas++;
        if (ps.length > 0) r.comPosicao++;
        r.posicoes.push(...ps);
        r.unidades[conta] = Object.fromEntries(ps.map((p) => [p.moeda, p.tamanho]));
      }
    }),
  );
  return r;
}

// `--limite N`: só as N primeiras contas, para conferir o caminho sem gastar o teto da API.
// Leitura parcial NÃO grava nada: gravada, ela viraria a leitura da página por quatro horas.
const limite = process.argv.includes("--limite") ? Number(process.argv[process.argv.indexOf("--limite") + 1]) : Infinity;
const parcial = Number.isFinite(limite) && limite > 0 && limite < direcionais.length;
const fila = parcial ? direcionais.slice(0, limite) : direcionais;
if (parcial) console.log(`baleias: --limite ${fila.length} — leitura parcial, só para conferir o caminho; nada será gravado`);
const { posicoes, unidades, lidas, semLeitura, comPosicao } = await lerContas(fila);
if (semLeitura > 0.1 * fila.length) {
  console.log(`baleias: ${semLeitura} de ${fila.length} contas sem leitura — nada gravado, para conta não lida não parecer baleia saindo`);
  process.exit(0);
}
/**
 * A leitura vale como o DIA do juiz só se o universo estiver classificado: com
 * mais de 5% das contas sem classificação (semente perdida, o ranking trazendo
 * centenas de contas novas de uma vez, a 40 por rodada), ela leria uma fração
 * do universo — e um dia vazio contaria como dia de leitura e começaria a
 * contagem dos 90 dias.
 */
const completa = !parcial && direcionais.length > 0 && semClasse <= 0.05 * contas.length;

// O fluxo só existe contra uma leitura que guardou as posições conta a conta (`fluxoEntre`).
const fluxo = anterior?.unidades ? fluxoEntre(anterior.unidades, unidades, precos) : undefined;
const moedas = lerMoedas(posicoes, espertas, precos, openInterest, fluxo, binance);

// OS MARKET MAKERS, à parte: as mesmas contas que ficaram fora do consenso, lidas
// para a tela mostrar o estoque delas (`lerMarketMakers`). 132 contas a 2 de peso
// cada — menos de um terço de minuto do teto. Conta deles sem leitura só fica
// fora desta seção: o consenso e o histórico não dependem dela.
const mm = parcial ? null : await lerContas(contas.filter((e) => classes[e]?.af));
const mmLidas = mm?.lidas ?? 0;
const mmSemLeitura = mm?.semLeitura ?? 0;
const doMercado = lerMarketMakers(mm?.posicoes ?? [], precos, nomes, binance);

if (parcial) {
  console.log(`baleias (parcial): ${lidas} lidas, ${semLeitura} sem leitura, ${comPosicao} com posição, ${moedas.length} moedas — nada gravado`);
  process.exit(0);
}

// ------------------------------------------------------------------ a gravação

const hoje = Math.floor(agora / DIA) * DIA;
let historicoAte = anterior?.historicoAte;
let historicoDesde = anterior?.historicoDesde;
await mkdir("data", { recursive: true });
if ((historicoAte === undefined || historicoAte < hoje) && completa) {
  // A primeira leitura completa de cada dia UTC vira uma linha por moeda: é o histórico do teste sem viés.
  const mes = new Date(hoje).toISOString().slice(0, 7);
  const linhas = moedas.map((m) =>
    JSON.stringify({
      t: agora,
      m: m.moeda,
      s: m.symbol,
      p: m.preco,
      oi: m.openInterest,
      c: Math.round(m.comprado),
      v: Math.round(m.vendido),
      nc: m.compradas,
      nv: m.vendidas,
      k: m.consenso,
      ke: m.consensoEspertas,
      f: m.fluxo,
      cc: m.custoComprado,
      cv: m.custoVendido,
    }),
  );
  if (linhas.length > 0) await appendFile(`data/baleias-hl-${mes}.jsonl`, `${linhas.join("\n")}\n`);
  // E a mesma leitura conta a conta, uma linha por dia: o fluxo de 3 dias do juiz sai dela.
  const doDia: LinhaDiariaDasContas = { t: agora, u: unidades, e: Object.keys(unidades).filter((c) => espertas.has(c)), p: Object.fromEntries(precos) };
  await appendFile(`data/baleias-hl-contas-${mes}.jsonl`, `${JSON.stringify(doDia)}\n`);
  historicoAte = hoje;
  historicoDesde ??= hoje;
}
const saida: ArquivoBaleias = {
  geradoEm: agora,
  rankingEm,
  contas,
  espertas: [...espertas],
  classes,
  marketMakers: mms,
  semClasse,
  lidas,
  semLeitura,
  ...(mmLidas > 0 ? { doMercado, mmLidas, mmSemLeitura } : {}),
  ...(Object.keys(nomes).length > 0 ? { nomes } : {}),
  comPosicao,
  moedas,
  unidades,
  ...(fluxo && anterior ? { fluxoDesde: anterior.geradoEm } : {}),
  ...(binance ? { pares: Object.fromEntries(binance) } : {}),
  ...(historicoAte !== undefined ? { historicoAte } : {}),
  ...(historicoDesde !== undefined ? { historicoDesde } : {}),
};
await writeFile(ARQUIVO, `${JSON.stringify(saida)}\n`);
const total = moedas.reduce((s, m) => s + m.comprado + m.vendido, 0);
console.log(
  `baleias: ${contas.length} contas no universo — ${mms} market makers fora, ${semClasse} sem classificação (${classificadas} classificadas nesta rodada) · ` +
    `${lidas} lidas (${semLeitura} sem leitura), ${comPosicao} com posição · market makers: ${mmLidas} lidos, US$ ${(doMercado.reduce((s, m) => s + m.comprado + m.vendido, 0) / 1e6).toFixed(0)} mi · US$ ${(total / 1e6).toFixed(0)} mi em ${moedas.length} moedas · ` +
    moedas
      .slice(0, 8)
      .map((m) => `${m.moeda} ${m.consenso === null ? "—" : (m.consenso >= 0 ? "+" : "") + m.consenso.toFixed(2)}`)
      .join(", "),
);
