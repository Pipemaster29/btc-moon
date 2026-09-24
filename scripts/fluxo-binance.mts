/**
 * O que entra e o que sai da carteira quente da Binance, moeda por moeda — e
 * POR QUAL PORTA.
 *
 * O fluxo on-chain é a última pista de "smart money" não medida aqui. O resto
 * foi: em 23/09, sobre 319 mil moeda-dias dos 528 perpétuos, a razão de posição
 * dos top traders contra o varejo separou +0,39 p.p. com p = 0,21 — acaso —, e
 * nenhum sinal técnico virou trade com vantagem (`npm run medir-sinais`).
 *
 * AS DUAS PORTAS, e confundi-las inverteu uma leitura. A carteira `0x73D8…46Db`
 * é o contrato quente da Binance na BNB Chain. Medido em 23/09 sobre três
 * horas: 97% das transferências que entram e 93% das que saem têm UMA
 * contraparte, o contrato `0x6aba…1b90`, em 194 tokens. Seguindo a TAKE, o
 * padrão é sempre o mesmo, dentro da mesma transação: a pool da PancakeSwap (ou
 * um roteador) manda para o `0x6aba`, e ele repassa para a quente — 3.699 vezes
 * em meia hora. É o EXECUTOR DE SWAP: cliente compra pelo app, a Binance compra
 * na pool, a moeda cai na custódia. O sentido inverso é cliente vendendo.
 *
 * Então há duas coisas diferentes aqui, e elas dizem coisas opostas:
 *
 *   COMPRA/VENDA NA DEX   passa pelo executor. É varejo da Binance comprando ou
 *                         vendendo on-chain — a moeda ENTRA na custódia quando
 *                         alguém COMPRA.
 *   DEPÓSITO/SAQUE        chega ou sai direto. É o fluxo clássico de corretora:
 *                         depositar costuma ser para vender.
 *
 * E a porta direta foi conferida, não suposta. Os US$ 8,0 mi de B2 que chegaram
 * por ela em 19/09 vieram de 24 carteiras comuns, nenhuma da Binance. Na AKE,
 * os dois maiores remetentes eram contratos — e as 145 transferências deles têm
 * a mesma forma: uma transferência só, CONTRATO→QUENTE, assinada pelo mesmo
 * operador (`0x1dfb…`). É a varredura de endereço de depósito. Depósito.
 *
 * O ERRO QUE ISTO CONSERTA: em 23/09 a TAKE subiu +221% e US$ 8,75 mi dela
 * "entraram" nesta carteira em 24 horas. Lido sem separar as portas, parecia
 * holder correndo para a corretora — distribuição. Era o contrário: quase tudo
 * passou pelo executor, ou seja, cliente da Binance COMPRANDO no meio do pump.
 *
 * SÓ EXISTE PARA FRENTE, e o motivo foi medido: o único nó gratuito que serve
 * log sem endereço de contrato na BNB Chain guarda uma janela rolante de ~100
 * horas (bloco mais antigo servido em 23/09: 19/09 07:51). O comentário de
 * `lib/onchain.ts` dizia "desde 2025-11-10" — era verdade em 02/09 e deixou de
 * ser. Buraco maior que isso no gravador é dado perdido para sempre.
 *
 * SÓ AS MOEDAS COM PERPÉTUO NA BINANCE são gravadas: são as que dá para operar e
 * para medir depois, e o resto é quase tudo lixo — das 368 moedas que tocaram a
 * carteira em 24 horas, 174 não tinham pool de US$ 20 mil.
 *
 * AS MOEDAS EM VISTA SAEM DAQUI. Todo perpétuo identificado que não está na
 * lista entra no painel sozinho (`lib/emvista.ts`, com a medição que sustenta
 * isso), e quando entra um novo o Telegram avisa — no fim da rodada, depois de
 * o estado estar gravado.
 *
 * Rode com: npm run fluxo-binance
 *           npm run fluxo-binance -- --semear 96   (só sem estado: grava o passado que o nó ainda tem)
 */

import { appendFile, readFile, writeFile } from "node:fs/promises";
import {
  balancesOf,
  blockNumber,
  blockTime,
  blocosPara,
  CHAINS,
  movimentosDaCarteira,
  tokenInfo,
  toUnits,
  type Movimento,
} from "../lib/onchain";
import { cotacoes } from "../lib/binance";
import { resumirFluxo, type EstadoFluxo, type IdentificacaoFluxo } from "../lib/fluxo";
import { avisadasDepois, emVistaDe, MAX_AVISOS, novasEmVista, textoEmVista, textoLigado } from "../lib/emvista";
import { escapeMarkdown, sendTelegram, telegramFromEnv } from "../lib/telegram";

const CARTEIRA = "0x73D8bD54F7Cf5FAb43fE4Ef40A62D390644946Db";
const ESTADO = "data/fluxo-binance.json";
const RESUMO = "data/fluxo-binance-resumo.json";

/**
 * Os executores de swap da Binance: o que passa por eles é compra e venda de
 * cliente na DEX, não depósito nem saque. Medido em 23/09 — ver o topo.
 *
 * Se a Binance trocar de executor, o novo cairia calado na porta de depósito e o
 * sinal mudaria de significado sem nada quebrar. Por isso toda janela grava a
 * contraparte dominante e se ela é conhecida, e `npm run auditar-dados` reprova
 * a janela em que uma desconhecida passa de metade das transferências.
 */
const EXECUTORES = new Set(["0x6aba0315493b7e6989041c91181337b662fb1b90"]);

/**
 * Janela da primeira execução, e o teto de qualquer uma.
 *
 * O teto é orçamento de requisição (armadilha nº 8): doze horas de BNB Chain são
 * 96 mil blocos, 48 faixas por direção, perto de oito minutos no nó de arquivo —
 * o que cabe no passo de fechamento do workflow. Buraco maior vira LACUNA gravada.
 * O `--semear` vai até 96 horas porque o nó guarda ~100.
 */
const JANELA_INICIAL_H = 1;
const JANELA_MAX_H = 12;
const SEMEAR_MAX_H = 96;

/** Blocos de folga atrás da ponta, para não gravar bloco que ainda pode reorganizar. */
const FOLGA = 15;

/** Pool mínima para a moeda contar como moeda, e não como airdrop de lixo. */
const POOL_MINIMA = 20_000;

/**
 * Quando reconferir a identificação de uma moeda. O perpétuo pode ser listado
 * depois de ela aparecer aqui, e um "sem perpétuo" gravado para sempre a
 * esconderia justamente quando ela passasse a interessar.
 */
const RECONFERIR_DIAS = 7;

const DIA = 86_400_000;

async function lerEstado(): Promise<EstadoFluxo | null> {
  try {
    return JSON.parse(await readFile(ESTADO, "utf8")) as EstadoFluxo;
  } catch {
    return null;
  }
}

interface ParDex {
  baseToken?: { address?: string };
  priceUsd?: string;
  liquidity?: { usd?: number };
  marketCap?: number;
}

/** Preço, pool somada e market cap pela DexScreener, trinta tokens por requisição. */
async function dex(tokens: string[]): Promise<Map<string, { preco: number; pool: number; mcap: number | null }>> {
  const out = new Map<string, { preco: number; pool: number; mcap: number | null }>();
  for (let i = 0; i < tokens.length; i += 30) {
    const lote = tokens.slice(i, i + 30);
    try {
      const res = await fetch(`https://api.dexscreener.com/tokens/v1/bsc/${lote.join(",")}`, {
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) continue;
      const pares = (await res.json()) as ParDex[];
      for (const p of Array.isArray(pares) ? pares : []) {
        const tk = p.baseToken?.address?.toLowerCase();
        if (!tk || !lote.includes(tk)) continue;
        const pool = p.liquidity?.usd ?? 0;
        const atual = out.get(tk);
        // O preço é o da pool MAIS FUNDA: pool rasa desalinhada é como o JCT
        // chegou a 2,9e-27 no histórico.
        if (!atual || pool > atual.pool) {
          out.set(tk, { preco: Number(p.priceUsd), pool: (atual?.pool ?? 0) + pool, mcap: p.marketCap ?? atual?.mcap ?? null });
        } else {
          atual.pool += pool;
        }
      }
    } catch {
      // Sem preço a moeda fica sem identificação nesta rodada e é reconferida na próxima.
    }
  }
  return out;
}

/** Fechamento diário do perpétuo, para marcar janela de dia passado no preço daquele dia. */
const velasDiarias = new Map<string, Map<number, number>>();
async function fechamentoDoDia(perp: string, dia: number): Promise<number | null> {
  if (!velasDiarias.has(perp)) {
    const m = new Map<number, number>();
    try {
      const res = await fetch(`https://www.binance.com/fapi/v1/klines?symbol=${perp}&interval=1d&limit=10`, {
        signal: AbortSignal.timeout(15_000),
      });
      const k = (await res.json()) as [number, string, string, string, string][];
      if (Array.isArray(k)) for (const x of k) m.set(x[0], Number(x[4]));
    } catch {
      // sem vela, sem preço: a linha não é gravada, e a contagem diz quantas
    }
    velasDiarias.set(perp, m);
  }
  return velasDiarias.get(perp)!.get(dia) ?? null;
}

/**
 * O último bloco de antes de `ts`, buscado só entre `lo` e `hi`. É o
 * `blockAtTime` do `lib/onchain.ts` sem partir do bloco 1: cortar uma janela na
 * meia-noite custa ~17 chamadas em vez de ~27.
 */
async function blocoAntesDe(ts: number, lo: number, hi: number): Promise<number> {
  while (hi - lo > 1) {
    const meio = Math.floor((lo + hi) / 2);
    if ((await blockTime("bsc", meio)) < ts) lo = meio;
    else hi = meio;
  }
  return lo;
}

// ------------------------------------------------------------------ resumo

/**
 * O resumo que a página lê, refeito do bruto a cada rodada. Lê o mês corrente e
 * o anterior porque a janela de sete dias atravessa a virada de mês.
 */
async function gravarResumo() {
  const agora = Date.now();
  const meses = [new Date(agora - 8 * DIA), new Date(agora)].map((d) => d.toISOString().slice(0, 7));
  const textos: string[] = [];
  for (const mes of new Set(meses)) {
    textos.push(await readFile(`data/fluxo-binance-${mes}.jsonl`, "utf8").catch(() => ""));
  }
  const r = resumirFluxo(textos, agora, CHAINS.bsc.secondsPerBlock);
  await writeFile(RESUMO, `${JSON.stringify(r, null, 1)}\n`);
  const lidos = r.dias.filter((d) => d.cobertura >= 0.9 && d.falhas === 0).length;
  console.log(`${RESUMO}: ${r.moedas.length} moedas · ${lidos} de ${r.dias.length} dias lidos inteiros e sem falha`);
}

if (process.argv.includes("--resumo")) {
  await gravarResumo();
  process.exit(0);
}

// ------------------------------------------------------------------ rodada

const iSemear = process.argv.indexOf("--semear");
const semear = iSemear >= 0 ? Number(process.argv[iSemear + 1]) : null;
const antes = await lerEstado();
if (semear !== null && (antes || !(semear > 0) || semear > SEMEAR_MAX_H)) {
  console.error(
    antes
      ? "o histórico já começou: semear agora gravaria janelas antes das que existem"
      : `--semear aceita de 1 a ${SEMEAR_MAX_H} horas (o nó guarda ~100)`,
  );
  process.exit(1);
}
const estado: EstadoFluxo = antes ?? { ultimoBloco: 0, tokens: {} };
const ponta = (await blockNumber("bsc")) - FOLGA;
let de = antes ? antes.ultimoBloco + 1 : ponta - blocosPara("bsc", semear ?? JANELA_INICIAL_H);
let lacuna: { de: number; ate: number } | null = null;
const teto = blocosPara("bsc", semear ?? JANELA_MAX_H);
if (ponta - de > teto) {
  lacuna = { de, ate: ponta - teto };
  de = ponta - teto + 1;
}
if (de > ponta) {
  console.log("nada novo desde a última execução");
  process.exit(0);
}

// A JANELA É CORTADA NA MEIA-NOITE UTC. Cada linha é somada ao dia em que a
// janela termina, e uma janela das 21h às 2h punha no dia seguinte três horas
// que eram do anterior. A medição compara o fluxo de um dia com o preço a partir
// do fechamento DAQUELE dia; fluxo no dia errado vira olhar o futuro ou atrasar
// o sinal, conforme o lado.
const cortes: [number, number][] = [];
{
  const tDe = await blockTime("bsc", de);
  const tAte = await blockTime("bsc", ponta);
  let inicio = de;
  for (let meiaNoite = Math.floor((tDe * 1000) / DIA) * DIA + DIA; meiaNoite <= tAte * 1000; meiaNoite += DIA) {
    const b = await blocoAntesDe(meiaNoite / 1000, inicio, ponta);
    if (b >= inicio) cortes.push([inicio, b]);
    inicio = b + 1;
  }
  cortes.push([inicio, ponta]);
}

const perps = await cotacoes();
const agora = Date.now();
const hoje = Math.floor(agora / DIA) * DIA;
const resumo = new Map<string, { cmp: number; vnd: number; dep: number; saq: number; mcap: number | null }>();

interface Agregado {
  cmp: bigint;
  vnd: bigint;
  dep: bigint;
  saq: bigint;
  depositantes: Set<string>;
  sacadores: Set<string>;
}

for (const [i, [a, b]] of cortes.entries()) {
  if (i === 0 && lacuna) console.log(`LACUNA de ${lacuna.ate - lacuna.de + 1} blocos gravada`);
  console.log(`janela ${i + 1}/${cortes.length}: ${b - a + 1} blocos (${(((b - a + 1) * 0.45) / 3600).toFixed(1)} h)`);
  const [entrando, saindo] = await Promise.all([
    movimentosDaCarteira("bsc", CARTEIRA, a, b, "entrando"),
    movimentosDaCarteira("bsc", CARTEIRA, a, b, "saindo"),
  ]);

  const porToken = new Map<string, Agregado>();
  const porContraparte = new Map<string, number>();
  const somar = (ms: Movimento[], lado: "E" | "S") => {
    for (const m of ms) {
      porContraparte.set(m.contraparte, (porContraparte.get(m.contraparte) ?? 0) + 1);
      const g = porToken.get(m.token) ?? {
        cmp: BigInt(0), vnd: BigInt(0), dep: BigInt(0), saq: BigInt(0),
        depositantes: new Set<string>(), sacadores: new Set<string>(),
      };
      const naDex = EXECUTORES.has(m.contraparte);
      if (lado === "E" && naDex) g.cmp += m.value;
      else if (lado === "S" && naDex) g.vnd += m.value;
      else if (lado === "E") { g.dep += m.value; g.depositantes.add(m.contraparte); }
      else { g.saq += m.value; g.sacadores.add(m.contraparte); }
      porToken.set(m.token, g);
    }
  };
  somar(entrando.movimentos, "E");
  somar(saindo.movimentos, "S");

  // IDENTIFICAÇÃO, só para quem é novo ou venceu. A regra é a do projeto
  // (armadilha nº 1): símbolo igual não basta, o preço da pool tem de bater com
  // o do perpétuo. Homônimo fica 30% ou 30.000% fora.
  const aConferir = [...porToken.keys()].filter((tk) => {
    const id = estado.tokens[tk];
    return !id || agora - id.conferidoEm > RECONFERIR_DIAS * DIA;
  });
  const precosDex = await dex(aConferir);
  // A RECONFERÊNCIA SUBSTITUÍA O OBJETO INTEIRO, e com ele iam embora a
  // primeira e a última passagem. A primeira voltava como "agora", e a
  // conferência das em vista (`medirAdiante`) empurrava o começo da moeda uma
  // semana a cada semana, perdendo o dia da reconferência toda vez. Achado na
  // revisão do PR #6. O que é da passagem fica; o que é da identificação muda.
  const reconferir = (tk: string, novo: Omit<IdentificacaoFluxo, "vistoEm" | "primeiroVisto" | "perpVisto">) => {
    const antes = estado.tokens[tk];
    const perpVisto = novo.perp ?? antes?.perp ?? antes?.perpVisto;
    estado.tokens[tk] = {
      ...novo,
      ...(antes?.vistoEm !== undefined ? { vistoEm: antes.vistoEm } : {}),
      ...(antes?.primeiroVisto !== undefined ? { primeiroVisto: antes.primeiroVisto } : {}),
      ...(perpVisto ? { perpVisto } : {}),
    };
  };
  await Promise.all(
    aConferir.map(async (tk) => {
      const d = precosDex.get(tk);
      if (!d || d.pool < POOL_MINIMA || !(d.preco > 0)) {
        reconferir(tk, { symbol: "", decimals: 18, perp: null, mult: 1, conferidoEm: agora });
        return;
      }
      let info: Awaited<ReturnType<typeof tokenInfo>>;
      try {
        info = await tokenInfo("bsc", tk);
      } catch {
        return; // não respondeu ERC-20 hoje; tenta de novo na próxima rodada
      }
      const base = info.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
      let perp: string | null = null;
      let mult = 1;
      for (const [s, k] of [[`${base}USDT`, 1], [`1000${base}USDT`, 1000], [`1000000${base}USDT`, 1e6]] as const) {
        const c = perps.get(s);
        if (!c) continue;
        const razao = (d.preco * k) / c.preco;
        if (razao > 0.85 && razao < 1.15) {
          perp = s;
          mult = k;
          break;
        }
      }
      reconferir(tk, { symbol: info.symbol, decimals: info.decimals, perp, mult, conferidoEm: agora });
    }),
  );

  const t = await blockTime("bsc", b);
  // A última passagem de cada token: é ela que tira da vista a moeda que a
  // Binance parou de movimentar (`VALIDADE_DIAS` em `lib/emvista.ts`). O token
  // que não respondeu ERC-20 nesta rodada ainda não tem identificação, e fica.
  for (const tk of porToken.keys()) {
    const id = estado.tokens[tk];
    if (!id) continue;
    id.vistoEm = Math.max(id.vistoEm ?? 0, t * 1000);
    // O `conferidoEm` é teto para a primeira passagem de quem foi identificado
    // antes deste campo existir: sem ele, as 41 de 23/09 ganhariam como
    // "primeira vez" a primeira rodada do código novo e perderiam dias da
    // conferência para frente.
    id.primeiroVisto ??= Math.min(id.conferidoEm, t * 1000);
  }
  const dia = Math.floor((t * 1000) / DIA) * DIA;
  const aoVivo = dia === hoje;
  const comPerp = [...porToken.keys()].filter((tk) => estado.tokens[tk]?.perp);
  const mcaps = await dex(comPerp);
  const saldos = new Map<string, bigint>();
  // Saldo só da janela de hoje: o de um dia passado exigiria estado antigo, que
  // o nó gratuito não serve. Nulo é "não li", e fica nulo na linha.
  if (aoVivo) {
    await Promise.all(
      comPerp.map(async (tk) => {
        try {
          const s = (await balancesOf("bsc", tk, [CARTEIRA])).get(CARTEIRA.toLowerCase());
          if (s !== undefined) saldos.set(tk, s);
        } catch {
          // fica nulo
        }
      }),
    );
  }

  const [maior, nMaior] = [...porContraparte].sort((x, y) => y[1] - x[1])[0] ?? ["", 0];
  const total = entrando.movimentos.length + saindo.movimentos.length;
  const linhas: string[] = [
    JSON.stringify({
      t,
      janela: { de: a, ate: b },
      falhas: { entrando: entrando.falhas, saindo: saindo.falhas },
      lacuna: i === 0 ? lacuna : null,
      logs: { entrando: entrando.movimentos.length, saindo: saindo.movimentos.length },
      tokens: porToken.size,
      comPerp: comPerp.length,
      // A sentinela do executor: quem dominou a janela, e se é conhecido.
      maior: { addr: maior, fracao: total ? Number((nMaior / total).toFixed(3)) : 0, conhecido: EXECUTORES.has(maior) },
    }),
  ];
  let semPreco = 0;
  for (const tk of comPerp) {
    const id = estado.tokens[tk];
    const g = porToken.get(tk)!;
    const cot = perps.get(id.perp!);
    const precoPerp = aoVivo ? cot?.preco ?? null : await fechamentoDoDia(id.perp!, dia);
    if (!precoPerp) {
      semPreco++;
      continue;
    }
    const preco = precoPerp / id.mult;
    const usd = (v: bigint) => Math.round(toUnits(v, id.decimals) * preco);
    // Market cap de hoje escalado pelo preço daquele dia: o supply circulante não
    // muda em quatro dias o bastante para pesar; o preço muda.
    const m = mcaps.get(tk)?.mcap ?? null;
    const mcap = m !== null && cot ? Math.round(m * (precoPerp / cot.preco)) : m;
    const linha = {
      t, s: id.perp, tk, px: Number(preco.toPrecision(6)),
      cmp: usd(g.cmp), vnd: usd(g.vnd), dep: usd(g.dep), saq: usd(g.saq),
      nDep: g.depositantes.size, nSaq: g.sacadores.size,
      saldo: saldos.has(tk) ? usd(saldos.get(tk)!) : null, mcap,
    };
    linhas.push(JSON.stringify(linha));
    const r = resumo.get(id.perp!) ?? { cmp: 0, vnd: 0, dep: 0, saq: 0, mcap };
    r.cmp += linha.cmp;
    r.vnd += linha.vnd;
    r.dep += linha.dep;
    r.saq += linha.saq;
    r.mcap = mcap;
    resumo.set(id.perp!, r);
  }

  const mes = new Date(t * 1000).toISOString().slice(0, 7);
  await appendFile(`data/fluxo-binance-${mes}.jsonl`, `${linhas.join("\n")}\n`);
  // O estado avança JANELA A JANELA: se a rodada morrer no meio de um --semear, a
  // próxima continua de onde parou em vez de regravar o que já está no arquivo.
  estado.ultimoBloco = b;
  await writeFile(ESTADO, `${JSON.stringify(estado)}\n`);
  console.log(
    `  ${porToken.size} tokens · ${comPerp.length - semPreco} gravados · ` +
      `contraparte dominante com ${((nMaior / (total || 1)) * 100).toFixed(0)}% das transferências` +
      (EXECUTORES.has(maior) ? " (o executor)" : ` · ATENÇÃO: ${maior} NÃO é executor conhecido`) +
      (entrando.falhas + saindo.falhas > 0 ? ` · ${entrando.falhas + saindo.falhas} FAIXA(S) NÃO LIDA(S)` : ""),
  );
}

const fmt = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v / 1e3).toFixed(0)} mil`;
const peso = (r: { cmp: number; vnd: number; dep: number; saq: number }) => Math.abs(r.cmp - r.vnd) + Math.abs(r.dep - r.saq);
const mais = [...resumo].sort((x, y) => peso(y[1]) - peso(x[1]));
console.log(`\n${"perpétuo".padEnd(14)} ${"compra líq. na DEX".padStart(20)} ${"depósito líquido".padStart(18)}   (US$ · % do market cap)`);
for (const [s, r] of mais.slice(0, 12)) {
  const pc = (v: number) => (r.mcap ? ` ${((v / r.mcap) * 100).toFixed(2)}%` : "");
  console.log(`${s.padEnd(14)} ${`${fmt(r.cmp - r.vnd)}${pc(r.cmp - r.vnd)}`.padStart(20)} ${`${fmt(r.dep - r.saq)}${pc(r.dep - r.saq)}`.padStart(18)}`);
}

console.log("");
await gravarResumo();

// ------------------------------------------------------------------ em vista
//
// Depois de tudo gravado, e por último: uma falha do Telegram não pode custar
// a janela lida. A memória das anunciadas mora no próprio estado, então se o
// push desta rodada perder a corrida o aviso sai de novo na seguinte — o mesmo
// lado de erro escolhido para os avisos da carteira: repetir é melhor do que
// calar.
{
  const atuais = emVistaDe(estado, Date.now());
  const { primeira, novas } = novasEmVista(estado, atuais);
  const telegram = telegramFromEnv();
  const anteriores = estado.emVista?.avisadas ?? [];
  console.log(`em vista: ${atuais.length} moeda(s)${primeira ? " · primeira vez" : ` · ${novas.length} nova(s)`}`);
  if (telegram && primeira && atuais.length > 0) {
    // Primeira vez: uma mensagem com o conjunto, e não quarenta avisos de uma vez.
    if (await sendTelegram(telegram, escapeMarkdown(textoLigado(atuais)))) {
      estado.emVista = { avisadas: avisadasDepois([], atuais, atuais.map((x) => x.symbol)) };
    }
  } else if (telegram && novas.length > 0) {
    const enviadas: string[] = [];
    for (const n of novas.slice(0, MAX_AVISOS)) {
      const cot = perps.get(n.symbol);
      const texto = textoEmVista(n, { preco: cot?.preco ?? null, variacao24h: cot?.variacao24h ?? null, fluxo: resumo.get(n.symbol) ?? null });
      if (await sendTelegram(telegram, escapeMarkdown(texto))) enviadas.push(n.symbol);
    }
    const resto = novas.slice(MAX_AVISOS);
    if (resto.length > 0) {
      const texto = `…e mais ${resto.length} moeda(s) em vista: ${resto.map((x) => x.symbol.replace(/USDT$/, "")).join(", ")}.`;
      if (await sendTelegram(telegram, escapeMarkdown(texto))) enviadas.push(...resto.map((x) => x.symbol));
    }
    estado.emVista = { avisadas: avisadasDepois(anteriores, atuais, enviadas) };
  } else if (estado.emVista) {
    // Nada a avisar, mas quem saiu de vista sai da memória também.
    estado.emVista = { avisadas: avisadasDepois(anteriores, atuais, []) };
  }
  await writeFile(ESTADO, `${JSON.stringify(estado)}\n`);
}
