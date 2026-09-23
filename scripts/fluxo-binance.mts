/**
 * O que entra e o que sai da carteira quente da Binance, moeda por moeda.
 *
 * DEPÓSITO EM CORRETORA É A ÚNICA PISTA DE "SMART MONEY" QUE AINDA NÃO FOI
 * MEDIDA AQUI, e ela não pode ser medida para trás. Todo o resto foi: em 23/09,
 * sobre 319 mil moeda-dias dos 528 perpétuos, a razão de posição dos top
 * traders contra o varejo separou +0,39 p.p. com p = 0,21 — acaso —, e nenhum
 * sinal técnico virou trade com vantagem (ver `npm run medir-sinais`). O fluxo
 * on-chain é diferente: ele diz quem está MOVENDO a moeda para vender, e não
 * quem está apostando. Mas o histórico dele só existe varrendo a cadeia, e a
 * varredura de 24 horas desta carteira leva vinte minutos no único nó gratuito
 * que responde. Então o histórico se constrói para frente: cada execução grava
 * o intervalo desde a anterior.
 *
 * O CASO QUE MOTIVOU: a TAKE subiu +221% em 23/09, com o open interest de
 * US$ 4 mi para 18 mi em quatro horas e o funding virando para −0,42% a cada 8h.
 * Nas mesmas 24 horas entraram US$ 8,75 mi dela nesta carteira, vindos de 28
 * endereços — 12,6% do market cap. Oferta correndo para a corretora no meio do
 * pump é a assinatura de distribuição. Se isso antecipa a queda é a pergunta, e
 * ela só se responde com semanas deste arquivo.
 *
 * POR QUE ESTA CARTEIRA: `0x73D8…46Db` é o contrato quente da Binance na BNB
 * Chain, o mesmo que `lib/watchlist.ts` já marca como corretora. Medido em
 * 23/09, ela recebe perto de dez mil transferências de 127 tokens a cada 37
 * minutos. E ela guarda boa parte do que circula de várias moedas pequenas —
 * 70% da LYN, 59% da TRADOOR, 53% da STAR —, que é a condição de manipulação
 * que o projeto persegue.
 *
 * SÓ AS MOEDAS COM PERPÉTUO NA BINANCE são gravadas, por dois motivos. São as
 * que dá para operar, e são as que dá para MEDIR depois, porque a série diária
 * delas existe. E o resto é quase tudo lixo: das 368 moedas que tocaram a
 * carteira em 24 horas, 174 não tinham pool de US$ 20 mil.
 *
 * Rode com: npm run fluxo-binance
 */

import { appendFile, readFile, writeFile } from "node:fs/promises";
import {
  balancesOf,
  blockNumber,
  blockTime,
  blocosPara,
  movimentosDaCarteira,
  tokenInfo,
  toUnits,
  type Movimento,
} from "../lib/onchain";
import { cotacoes } from "../lib/binance";

const CARTEIRA = "0x73D8bD54F7Cf5FAb43fE4Ef40A62D390644946Db";
const ESTADO = "data/fluxo-binance.json";

/**
 * Janela da primeira execução, e o teto de qualquer uma.
 *
 * O teto é orçamento de requisição (armadilha nº 8): doze horas de BNB Chain
 * são 96 mil blocos, 48 faixas por direção, perto de oito minutos no nó de
 * arquivo. Um buraco maior do que isso — o workflow parado, o repositório sem
 * execução por um dia — vira LACUNA gravada, e não uma varredura de horas que
 * estouraria o passo do workflow.
 */
const JANELA_INICIAL_H = 1;
const JANELA_MAX_H = 12;

/** Blocos de folga atrás da ponta, para não gravar bloco que ainda pode reorganizar. */
const FOLGA = 15;

/** Pool mínima para a moeda contar como moeda, e não como airdrop de lixo. */
const POOL_MINIMA = 20_000;

/**
 * Quando reconferir a identificação de uma moeda.
 *
 * O perpétuo de uma moeda pode ser listado depois de ela aparecer aqui, e um
 * "sem perpétuo" gravado para sempre a esconderia justamente quando ela passar
 * a interessar.
 */
const RECONFERIR_DIAS = 7;

interface Identificacao {
  symbol: string;
  decimals: number;
  /** Símbolo do perpétuo (`TAKEUSDT`), ou nulo quando não há ou o preço não bate. */
  perp: string | null;
  /** Unidades do token por contrato: 1000 em `1000XUSDT`. */
  mult: number;
  conferidoEm: number;
}

interface Estado {
  ultimoBloco: number;
  tokens: Record<string, Identificacao>;
}

async function lerEstado(): Promise<Estado | null> {
  try {
    return JSON.parse(await readFile(ESTADO, "utf8")) as Estado;
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

const antes = await lerEstado();
const estado: Estado = antes ?? { ultimoBloco: 0, tokens: {} };

const ponta = (await blockNumber("bsc")) - FOLGA;
let de = antes ? antes.ultimoBloco + 1 : ponta - blocosPara("bsc", JANELA_INICIAL_H);
let lacuna: { de: number; ate: number } | null = null;
const teto = blocosPara("bsc", JANELA_MAX_H);
if (ponta - de > teto) {
  lacuna = { de, ate: ponta - teto };
  de = ponta - teto + 1;
}
if (de > ponta) {
  console.log("nada novo desde a última execução");
  process.exit(0);
}

console.log(`varrendo ${ponta - de + 1} blocos (${((ponta - de + 1) * 0.45 / 3600).toFixed(1)} h)` + (lacuna ? ` · LACUNA de ${lacuna.ate - lacuna.de + 1} blocos gravada` : ""));
const [entrando, saindo] = await Promise.all([
  movimentosDaCarteira("bsc", CARTEIRA, de, ponta, "entrando"),
  movimentosDaCarteira("bsc", CARTEIRA, de, ponta, "saindo"),
]);

interface Agregado { nE: number; nS: number; somaE: bigint; somaS: bigint; dep: Set<string>; saq: Set<string> }
const porToken = new Map<string, Agregado>();
function somar(ms: Movimento[], lado: "E" | "S") {
  for (const m of ms) {
    const g = porToken.get(m.token) ?? { nE: 0, nS: 0, somaE: BigInt(0), somaS: BigInt(0), dep: new Set<string>(), saq: new Set<string>() };
    if (lado === "E") { g.nE++; g.somaE += m.value; g.dep.add(m.contraparte); }
    else { g.nS++; g.somaS += m.value; g.saq.add(m.contraparte); }
    porToken.set(m.token, g);
  }
}
somar(entrando.movimentos, "E");
somar(saindo.movimentos, "S");

// IDENTIFICAÇÃO, só para quem é novo ou venceu. A regra é a do projeto
// (armadilha nº 1): símbolo igual não basta, o preço da pool tem de bater com o
// do perpétuo. Homônimo fica 30% ou 30.000% fora.
const perps = await cotacoes();
const agora = Date.now();
const aConferir = [...porToken.keys()].filter((tk) => {
  const id = estado.tokens[tk];
  return !id || agora - id.conferidoEm > RECONFERIR_DIAS * 86_400_000;
});
const precosDex = await dex(aConferir);
await Promise.all(
  aConferir.map(async (tk) => {
    const d = precosDex.get(tk);
    if (!d || d.pool < POOL_MINIMA || !(d.preco > 0)) {
      // Sem pool que valha, a identificação não gasta chamada de contrato.
      estado.tokens[tk] = { symbol: "", decimals: 18, perp: null, mult: 1, conferidoEm: agora };
      return;
    }
    let info: Awaited<ReturnType<typeof tokenInfo>>;
    try {
      info = await tokenInfo("bsc", tk);
    } catch {
      return; // não responde ERC-20 hoje; tenta de novo na próxima rodada
    }
    const base = info.symbol.toUpperCase().replace(/[^A-Z0-9]/g, "");
    let perp: string | null = null;
    let mult = 1;
    for (const [s, k] of [[`${base}USDT`, 1], [`1000${base}USDT`, 1000], [`1000000${base}USDT`, 1e6]] as const) {
      const c = perps.get(s);
      if (!c) continue;
      const razao = (d.preco * k) / c.preco;
      if (razao > 0.85 && razao < 1.15) { perp = s; mult = k; break; }
    }
    estado.tokens[tk] = { symbol: info.symbol, decimals: info.decimals, perp, mult, conferidoEm: agora };
  }),
);

// As moedas com perpétuo que se mexeram nesta janela: saldo e market cap de agora.
const comPerp = [...porToken.keys()].filter((tk) => estado.tokens[tk]?.perp);
const mcaps = await dex(comPerp);
const saldos = new Map<string, bigint>();
await Promise.all(
  comPerp.map(async (tk) => {
    try {
      const b = (await balancesOf("bsc", tk, [CARTEIRA])).get(CARTEIRA.toLowerCase());
      if (b !== undefined) saldos.set(tk, b);
    } catch {
      // Saldo nulo é "não li", e fica nulo na linha.
    }
  }),
);

// Em segundos, como o `t` do histórico do panorama — as duas séries se cruzam
// na medição. O relógio da máquina só entra se o nó não disser a hora do bloco.
const quando = await blockTime("bsc", ponta).catch(() => Math.round(agora / 1000));
const r = (x: number) => Math.round(x);
const linhas: string[] = [
  JSON.stringify({
    t: quando,
    janela: { de, ate: ponta },
    falhas: { entrando: entrando.falhas, saindo: saindo.falhas },
    lacuna,
    logs: { entrando: entrando.movimentos.length, saindo: saindo.movimentos.length },
    tokens: porToken.size,
    comPerp: comPerp.length,
  }),
];
const resumo: { s: string; liq: number; pctMcap: number | null }[] = [];
for (const tk of comPerp) {
  const id = estado.tokens[tk];
  const g = porToken.get(tk)!;
  const c = perps.get(id.perp!);
  if (!c) continue;
  const preco = c.preco / id.mult;
  const usd = (v: bigint) => toUnits(v, id.decimals) * preco;
  const ent = usd(g.somaE), sai = usd(g.somaS);
  const saldo = saldos.get(tk);
  const mcap = mcaps.get(tk)?.mcap ?? null;
  linhas.push(
    JSON.stringify({
      t: quando,
      s: id.perp,
      tk,
      px: Number(preco.toPrecision(6)),
      ent: r(ent),
      sai: r(sai),
      liq: r(ent - sai),
      nE: g.nE,
      nS: g.nS,
      dep: g.dep.size,
      saq: g.saq.size,
      saldo: saldo === undefined ? null : r(usd(saldo)),
      mcap: mcap === null ? null : r(mcap),
    }),
  );
  resumo.push({ s: id.perp!, liq: ent - sai, pctMcap: mcap ? (ent - sai) / mcap : null });
}

const mes = new Date(quando * 1000).toISOString().slice(0, 7);
await appendFile(`data/fluxo-binance-${mes}.jsonl`, `${linhas.join("\n")}\n`);
estado.ultimoBloco = ponta;
await writeFile(ESTADO, `${JSON.stringify(estado)}\n`);

console.log(
  `${porToken.size} tokens tocaram a carteira · ${comPerp.length} com perpétuo gravados · ` +
    `${entrando.movimentos.length} entradas, ${saindo.movimentos.length} saídas` +
    (entrando.falhas + saindo.falhas > 0 ? ` · ${entrando.falhas + saindo.falhas} FAIXA(S) NÃO LIDA(S)` : ""),
);
resumo.sort((a, b) => Math.abs(b.liq) - Math.abs(a.liq));
for (const x of resumo.filter((y) => Math.abs(y.liq) >= 1000).slice(0, 10)) {
  console.log(
    `  ${x.s.padEnd(14)} ${x.liq >= 0 ? "+" : "−"}US$ ${Math.abs(x.liq / 1e3).toFixed(0).padStart(6)} mil` +
      (x.pctMcap !== null ? `  (${(x.pctMcap * 100).toFixed(2)}% do market cap ${x.liq >= 0 ? "entrou" : "saiu"})` : ""),
  );
}
