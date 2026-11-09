/**
 * Baixa o HISTÓRICO DAS BALEIAS DA HYPERLIQUID que `scripts/medir-baleias.mts`
 * mede, do jeito que `docs/preregistro-baleias.md` fixou antes de qualquer
 * download: as contas do ranking público de 09/11/2026 com US$ 1 bilhão ou mais
 * de volume na vida (o universo A, que traz as que quebraram) e as com US$ 5
 * milhões ou mais de patrimônio hoje (o B, enviesado a favor); para cada uma, as
 * posições de agora e as execuções de perpétuo desde 01/04/2026; e a vela
 * diária de cada perpétuo.
 *
 * O TETO DA API: 1.200 de peso por minuto por endereço de IP. A leitura das
 * posições pesa 2; a das execuções, 20 mais 1 a cada 20 que vierem (até 2.000
 * por página); a das velas, 20 mais 1 a cada 60. O script gasta até 1.000 por
 * minuto e espera o minuto virar quando passaria — e no 429 espera e tenta de
 * novo, sem contar a conta como lida.
 *
 * Tudo vai para `.cache/hl/`, uma conta por arquivo: rodar de novo só baixa o
 * que falta. Conta que não se leu NÃO vira arquivo — "não consegui" não pode
 * virar "não tinha posição".
 *
 * Rode com: npx tsx scripts/baixar-baleias.mts
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { lerExecucoes, lerRanking, type HistoricoDaConta } from "../lib/hyperliquid";

const API = "https://api.hyperliquid.xyz/info";
const CACHE = ".cache/hl";
const RANKING = `${CACHE}/ranking-2026-11-09.json`;
/** 40 dias antes da primeira decisão (11/05): os 30 dias do lucro e do custo das baleias, mais folga. */
export const INICIO_HISTORICO = Date.parse("2026-04-01T00:00:00Z");
/** As velas começam antes, para os 7 dias de "vindo de cima" do suporte e a mediana do volume. */
const INICIO_VELAS = Date.parse("2026-03-01T00:00:00Z");
/** Os universos do pré-registro. */
export const VOLUME_VIDA_A = 1e9;
export const PATRIMONIO_B = 5e6;
/** 2.000 execuções em menos disto, em milissegundos, é mais de 300 por dia: alta frequência, fora. */
const JANELA_ALTA_FREQUENCIA = (2000 / 300) * 86_400_000;
/** Mais execuções que isto num fluxo da conta e o histórico dela começa onde a leitura parou (`desde`). */
const TETO_POR_FLUXO = 10_000;

// ------------------------------------------------------------------ o teto de peso

const ORCAMENTO_POR_MINUTO = 1000;
let gasto = 0;
let inicioDoMinuto = Date.now();
async function pagar(peso: number): Promise<void> {
  for (;;) {
    const agora = Date.now();
    if (agora - inicioDoMinuto >= 60_000) {
      inicioDoMinuto = agora;
      gasto = 0;
    }
    if (gasto + peso <= ORCAMENTO_POR_MINUTO) {
      gasto += peso;
      return;
    }
    await new Promise((r) => setTimeout(r, 60_000 - (agora - inicioDoMinuto) + 50));
  }
}

let falhas = 0;
/** POST na API com o peso pago antes; o peso a mais pelo tamanho da resposta é pago depois. */
async function pedir<T>(corpo: object, peso: number, porItem = 0): Promise<T | null> {
  for (let tentativa = 1; tentativa <= 6; tentativa++) {
    await pagar(peso);
    try {
      const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(120_000) });
      if (res.status === 429) {
        // O teto foi batido mesmo com a conta: espera o minuto inteiro.
        gasto = ORCAMENTO_POR_MINUTO;
        await new Promise((r) => setTimeout(r, 60_000));
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const j = (await res.json()) as T;
      if (porItem > 0 && Array.isArray(j)) await pagar(Math.floor(j.length / porItem));
      return j;
    } catch (e) {
      if (process.env.DEPURAR) console.error(`pedido ${(corpo as { type?: string }).type} falhou (tentativa ${tentativa}): ${(e as Error).message}`);
      await new Promise((r) => setTimeout(r, 2000 * tentativa));
    }
  }
  falhas++;
  return null;
}

// ------------------------------------------------------------------ o universo

export async function universo(): Promise<{ a: Set<string>; b: Set<string> }> {
  const contas = lerRanking(JSON.parse(await readFile(RANKING, "utf8")));
  return {
    a: new Set(contas.filter((c) => c.volumeVida >= VOLUME_VIDA_A).map((c) => c.endereco)),
    b: new Set(contas.filter((c) => c.patrimonio >= PATRIMONIO_B).map((c) => c.endereco)),
  };
}

/** Os nomes de todos os perpétuos, os fora de negociação inclusive: execução neles mexe na posição. */
async function perpetuos(): Promise<{ nomes: Set<string>; ativos: string[] }> {
  const arq = `${CACHE}/meta.json`;
  type Meta = { universe: { name: string; isDelisted?: boolean }[] };
  let meta: Meta | null = existsSync(arq) ? (JSON.parse(await readFile(arq, "utf8")) as Meta) : null;
  if (!meta) {
    meta = await pedir<Meta>({ type: "meta" }, 20);
    if (!meta?.universe?.length) throw new Error("a Hyperliquid não devolveu a lista de perpétuos");
    await writeFile(arq, JSON.stringify(meta));
  }
  // As fora de negociação também: 56 de 235 em 09/11, e quem esteve nelas na janela esteve.
  return { nomes: new Set(meta.universe.map((u) => u.name)), ativos: meta.universe.map((u) => u.name) };
}

// ------------------------------------------------------------------ uma conta

/** Uma execução como a API devolve: só o que a leitura precisa para ordenar e não repetir. */
type Bruta = { time: number; tid?: number; oid?: number; coin?: string };

/** Por tempo e, no mesmo milissegundo, pelo id da negociação: a ordem em que a posição andou. */
const naOrdem = (x: Bruta, y: Bruta) => x.time - y.time || Number(x.tid ?? 0) - Number(y.tid ?? 0);

/**
 * UM FLUXO DE EXECUÇÕES DE UMA CONTA, DE HOJE PARA TRÁS: as 2.000 mais recentes
 * (`recente`) e depois janelas lidas INTEIRAS (`porTempo`, páginas para a frente
 * dentro delas, sem repetir), da largura que dá ~1.500 pela densidade vista, até
 * 01/04 ou até o teto. O `desde` é o começo da janela mais velha lida inteira:
 * dali até hoje não falta execução DESTE fluxo.
 *
 * A primeira versão lia de 01/04 para a frente e parava em 10 mil — supondo que a
 * API só guardava as 10 mil mais recentes. Ela guarda mais, e a leitura errada
 * deixava sem o trecho recente justamente as contas ativas (a `0x3f5f…` tinha
 * tudo de 07/04 a 27/06 e nada depois). Ver a emenda em `docs/preregistro-baleias.md`.
 */
async function fluxoDaConta(
  endereco: string,
  recente: "userFills" | "userTwapSliceFills",
  porTempo: "userFillsByTime" | "userTwapSliceFillsByTime",
  extrair: (x: unknown) => Bruta,
): Promise<{ brutas: Bruta[]; recentes: Bruta[]; desde: number } | null> {
  const r = await pedir<unknown[]>({ type: recente, user: endereco }, 20, 20);
  if (!r) return null;
  const recentes = r.map(extrair).sort(naOrdem);
  const vistas = new Set<string>();
  const chave = (f: Bruta) => `${f.tid}:${f.oid}:${f.time}:${f.coin}`;
  let brutas: Bruta[] = [];
  const juntar = (xs: Bruta[]) => {
    // Uma a uma: a repetida pode vir no mesmo lote (a página que recomeça na última execução da anterior).
    const novas: Bruta[] = [];
    for (const f of xs) {
      const k = chave(f);
      if (vistas.has(k)) continue;
      vistas.add(k);
      novas.push(f);
    }
    brutas = [...novas, ...brutas].sort(naOrdem);
  };
  juntar(recentes);
  // Menos de uma página: é a vida inteira da conta neste fluxo.
  if (recentes.length < 2000) return { brutas, recentes, desde: INICIO_HISTORICO };
  let desde = recentes[0].time;
  let fim = recentes[0].time;
  // Execuções por milissegundo nas recentes: a largura da janela que dá ~1.500.
  let densidade = recentes.length / Math.max(1, recentes[recentes.length - 1].time - recentes[0].time);
  while (fim > INICIO_HISTORICO && brutas.length < TETO_POR_FLUXO) {
    // Inteira: a API devolve 422 para instante com fração de milissegundo.
    const largura = Math.round(Math.min(60 * 86_400_000, Math.max(3_600_000, 1500 / densidade)));
    const inicio = Math.max(INICIO_HISTORICO, fim - largura);
    const janela: Bruta[] = [];
    let de = inicio;
    for (;;) {
      const lote = await pedir<unknown[]>({ type: porTempo, user: endereco, startTime: de, endTime: fim }, 20, 20);
      if (!lote) return null;
      const xs = lote.map(extrair);
      janela.push(...xs);
      if (lote.length < 2000) break;
      const ultima = Math.max(...xs.map((x) => x.time));
      // A próxima página começa NA última (pode haver mais de uma no mesmo milissegundo); a chave tira a repetida.
      de = ultima > de ? ultima : ultima + 1;
    }
    juntar(janela);
    desde = inicio;
    fim = inicio;
    densidade = janela.length > 0 ? Math.max(janela.length / largura, densidade / 4) : densidade / 4;
  }
  return { brutas, recentes, desde };
}

/**
 * O HISTÓRICO DE UMA CONTA: as posições de agora, as execuções comuns e as
 * fatias de TWAP — que a API não põe em `userFills` (uma conta teve 2.000 fatias
 * em quatro horas, nenhuma no fluxo comum) —, juntas e na ordem em que a posição
 * andou. A alta frequência é medida nas 2.000 execuções comuns mais recentes: as
 * fatias de TWAP são a execução de uma ordem direcional, não giro de market maker.
 */
export async function baixarConta(endereco: string, nomes: Set<string>): Promise<HistoricoDaConta | null> {
  const estado = await pedir<{ assetPositions?: { position?: { coin?: string; szi?: string } }[] }>({ type: "clearinghouseState", user: endereco }, 2);
  if (!estado || !Array.isArray(estado.assetPositions)) return null;
  const ate = Date.now();
  const atuais: Record<string, number> = {};
  for (const p of estado.assetPositions) {
    const s = Number(p.position?.szi);
    if (p.position?.coin && Number.isFinite(s) && s !== 0) atuais[p.position.coin] = s;
  }
  const comuns = await fluxoDaConta(endereco, "userFills", "userFillsByTime", (x) => x as Bruta);
  if (!comuns) return null;
  const rec = comuns.recentes;
  if (rec.length >= 2000 && rec[rec.length - 1].time - rec[0].time < JANELA_ALTA_FREQUENCIA) {
    return { endereco, desde: rec[0].time, ate, execucoes: [], atuais, altaFrequencia: true };
  }
  const twap = await fluxoDaConta(endereco, "userTwapSliceFills", "userTwapSliceFillsByTime", (x) => (x as { fill: Bruta }).fill);
  if (!twap) return null;
  // As duas juntas, na ordem em que a posição andou; a mesma execução nos dois fluxos conta uma vez.
  const vistas = new Set<string>();
  const todas = [...comuns.brutas, ...twap.brutas].sort(naOrdem).filter((f) => {
    const k = `${f.tid}:${f.oid}:${f.time}:${f.coin}`;
    if (vistas.has(k)) return false;
    vistas.add(k);
    return true;
  });
  let desde = Math.max(comuns.desde, twap.desde);
  const { execucoes, ilegivelAte } = lerExecucoes(todas, nomes);
  if (Number.isFinite(ilegivelAte)) desde = Math.max(desde, ilegivelAte);
  // O que veio de antes do `desde` fica fora: ali um dos fluxos não foi lido, e a
  // posição que esse evento deixou pode ter mudado por execução que não veio (as
  // 2.000 fatias de TWAP mais recentes de uma conta eram de janeiro, e o LIT
  // dela foi fechado em fevereiro por execução comum, antes da janela).
  return { endereco, desde, ate, execucoes: execucoes.filter((e) => e.t >= desde), atuais, altaFrequencia: false };
}

// ------------------------------------------------------------------ as velas

/** A vela diária de um perpétuo: [abertura (ms), abertura, máxima, mínima, fechamento, volume em dólar]. */
export type VelaDiaria = [number, number, number, number, number, number];

async function baixarVelas(moeda: string): Promise<VelaDiaria[] | null> {
  const r = await pedir<{ t: number; o: string; h: string; l: string; c: string; v: string }[]>(
    { type: "candleSnapshot", req: { coin: moeda, interval: "1d", startTime: INICIO_VELAS, endTime: Date.now() } },
    20,
    60,
  );
  if (!r) return null;
  // O volume da vela é em unidades da moeda; em dólar, pelo fechamento.
  return r.map((v) => [v.t, Number(v.o), Number(v.h), Number(v.l), Number(v.c), Number(v.v) * Number(v.c)] as VelaDiaria).filter((v) => v.slice(1).every((x) => Number.isFinite(x)));
}

// ------------------------------------------------------------------ o laço

async function main(): Promise<void> {
  await mkdir(`${CACHE}/contas`, { recursive: true });
  await mkdir(`${CACHE}/velas`, { recursive: true });
  const { a, b } = await universo();
  const todas = [...new Set([...a, ...b])];
  const { nomes, ativos } = await perpetuos();
  console.log(`universo A (volume da vida ≥ US$ 1 bi): ${a.size} · B (patrimônio ≥ US$ 5 mi): ${b.size} · as duas juntas: ${todas.length} · ${nomes.size} perpétuos`);

  // As velas primeiro: são poucas e baratas, e a medição não anda sem elas.
  let velas = 0;
  for (const moeda of ativos) {
    const arq = `${CACHE}/velas/${encodeURIComponent(moeda)}.json`;
    if (existsSync(arq)) continue;
    const v = await baixarVelas(moeda);
    if (v) {
      await writeFile(arq, JSON.stringify(v));
      velas++;
    }
  }
  console.log(`${velas} moedas de velas novas`);

  const faltam = todas.filter((e) => !existsSync(`${CACHE}/contas/${e}.json`));
  console.log(`${faltam.length} contas para baixar`);
  let feitas = 0;
  let semLeitura = 0;
  const t0 = Date.now();
  // DOZE em paralelo: o que segura o ritmo é a DEMORA da API nas contas de muitas
  // execuções (uma leitura de 2.000 levou mais de um minuto em 09/11), não o teto
  // de peso — com quatro, o download inteiro passava de dez horas.
  const fila = [...faltam];
  await Promise.all(
    Array.from({ length: 12 }, async () => {
      for (;;) {
        const e = fila.shift();
        if (!e) return;
        const h = await baixarConta(e, nomes);
        if (h) await writeFile(`${CACHE}/contas/${e}.json`, JSON.stringify(h));
        else semLeitura++;
        feitas++;
        if (feitas % 50 === 0) {
          const min = (Date.now() - t0) / 60_000;
          console.log(`  ${feitas} de ${faltam.length} em ${min.toFixed(1)} min · ${semLeitura} sem leitura · faltam ~${((faltam.length - feitas) * (min / feitas)).toFixed(0)} min`);
        }
      }
    }),
  );
  console.log(`fim: ${feitas} contas lidas, ${semLeitura} sem leitura (rode de novo para tentar), ${falhas} pedidos que falharam depois de 6 tentativas`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) await main();
