/**
 * Encontra, para cada ticker, o contrato certo e onde ele é negociado.
 *
 * O problema que este script resolve custou caro para aprender: buscar um
 * ticker pelo nome devolve o mercado inteiro de homônimos. "AKE" traz doze
 * tokens chamados AKEDO na Solana; "GPS" traz um impostor na BNB Chain com
 * US$ 3 milhões de FDV. Escolher o de maior liquidez erra, e erra em silêncio —
 * a análise inteira roda em cima da moeda errada sem nada parecer estranho.
 *
 * São dois testes, e os dois são necessários.
 *
 * O PREÇO TEM QUE BATER COM O DO DERIVATIVO. Entre o mesmo ativo a arbitragem
 * não deixa a diferença passar de um dígito percentual; um homônimo fica 30%,
 * 300% ou 30.000% fora. É barato e quase impossível de burlar, porque exigiria
 * que o impostor tivesse mercado à vista arbitrado com o perpétuo — momento em
 * que ele deixaria de ser impostor.
 *
 * O SUPPLY DO CONTRATO NÃO PODE SER MENOR QUE O CIRCULANTE. Este terceiro teste
 * nasceu de uma falha dos outros dois: token com ponte negocia em paridade com o
 * original e gira normalmente, então passa nos dois primeiros — mas o contrato
 * dele guarda uma fração da moeda. O ZEREBRO passou: 1,15 milhão de tokens no
 * contrato da Base contra 1.000 milhões circulando. Não dá para circular mais do
 * que existe, e quando isso aparece o contrato é implantação secundária. A
 * comparação é de um lado só: contrato MAIOR que o circulante é normal e é o
 * próprio objeto de estudo — significa supply preso.
 *
 * A POOL TEM QUE GIRAR. O VVV aparece com US$ 775 milhões de liquidez e
 * ZERO de volume em 24 horas; o CYS com US$ 452 milhões, também zero. São pools
 * decorativas — alguém deposita o próprio token contra uma ponta qualquer só
 * para o número aparecer grande no agregador. Liquidez sem giro não absorve
 * venda nenhuma, e usá-la como escala faria todo limiar de alerta nascer
 * errado. Pool de verdade tem rotatividade: a do UB na BSC gira 1,15x o próprio
 * tamanho por dia.
 *
 * Rode com: npm run descobrir UAI UB APR ...
 *           npm run descobrir C=chainbase     (busca pelo nome do projeto)
 *           npm run descobrir                 (usa a lista inteira)
 *
 * A forma `TICKER=nome` existe porque ticker curto derrota a busca: procurar
 * "C" no DexScreener devolve o mercado inteiro e nenhum candidato sobrevive à
 * filtragem. Buscar "chainbase" acha o token na primeira tentativa.
 */

import { liveStats, gateContract } from "../lib/gate";
import { circulante } from "../lib/binance";
import { tokenInfo, toUnits } from "../lib/onchain";
import { fetchCsv, metricsUrl, dailyKlineUrl, recentDays } from "../lib/datavision";
import { parseKlines } from "../lib/derivatives";
import type { Chain } from "../lib/onchain";

/** Redes que a leitura on-chain daqui alcança. */
const REDES: Record<string, Chain> = {
  bsc: "bsc",
  base: "base",
  ethereum: "ethereum",
};

/** Acima disso não é o mesmo ativo — é homônimo. */
const TOLERANCIA = 0.1;

/** Volume diário mínimo como fração da pool. Abaixo disso a liquidez é enfeite. */
const GIRO_MINIMO = 0.01;

/** Pool menor que isto não dá escala para nada; a moeda vive noutro lugar. */
const LIQUIDEZ_MINIMA = 10_000;

/**
 * O supply do contrato não pode ser menor que o circulante.
 *
 * Terceiro teste, e ele estava documentado sem estar implementado — o que
 * custou três identificações erradas na Base. Não dá para circular mais do que
 * existe, então contrato menor que o circulante é ponte ou implantação
 * secundária. A margem de 10% cobre a defasagem do circulante, publicado por
 * terceiro e sempre um passo atrás da rede.
 */
const COERENCIA_MINIMA = 0.9;

interface Candidato {
  chain: string;
  address: string;
  name: string;
  price: number;
  liquidityUsd: number;
  volume24h: number;
  pools: number;
}

/**
 * Devolve nulo quando a BUSCA falhou, e lista vazia quando ela funcionou e não
 * achou nada. A diferença importa: tratar rede fora como "esta moeda não tem par
 * EVM" registraria uma conclusão errada com cara de conclusão certa — foi o que
 * aconteceu ao reconferir as moedas da Base com o DexScreener fora do ar.
 */
async function candidatos(ticker: string, busca = ticker): Promise<Candidato[] | null> {
  let body: { pairs?: unknown[] };
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/search?q=${encodeURIComponent(busca)}`,
      { signal: AbortSignal.timeout(20_000) },
    );
    if (!res.ok) return null;
    body = (await res.json()) as { pairs?: unknown[] };
  } catch {
    return null;
  }
  const porToken = new Map<string, Candidato>();

  for (const raw of body.pairs ?? []) {
    const p = raw as Record<string, never>;
    const chain = String(p.chainId ?? "");
    if (!(chain in REDES)) continue;

    const base = (p.baseToken ?? {}) as Record<string, string>;
    if ((base.symbol ?? "").toUpperCase() !== ticker.toUpperCase()) continue;

    const address = base.address ?? "";
    const price = Number(p.priceUsd ?? 0);
    if (!address || !(price > 0)) continue;

    const liq = Number((p.liquidity as Record<string, number> | undefined)?.usd ?? 0);
    const vol = Number((p.volume as Record<string, number> | undefined)?.h24 ?? 0);

    // Um token tem vários pares; o que interessa é a soma da liquidez dele e o
    // preço do par mais fundo, que é o menos manipulável.
    const atual = porToken.get(address);
    if (!atual) {
      porToken.set(address, {
        chain, address, name: base.name ?? "", price,
        liquidityUsd: liq, volume24h: vol, pools: 1,
      });
    } else {
      if (liq > atual.liquidityUsd) atual.price = price;
      atual.liquidityUsd += liq;
      atual.volume24h += vol;
      atual.pools += 1;
    }
  }

  return [...porToken.values()].sort((a, b) => b.volume24h - a.volume24h);
}

/** O preço de referência: o perpétuo, que é o que estamos lendo. */
async function precoPerp(ticker: string): Promise<{ price: number; oiUsd: number; fonte: string } | null> {
  const gate = await liveStats(`${ticker}USDT`, "1h", 3);
  if (gate.length > 0) {
    const u = gate[gate.length - 1];
    return { price: u.price, oiUsd: u.openInterestUsd, fonte: "Gate" };
  }
  // Sem a Gate, o fechamento de ontem da Binance ainda serve para o teste de
  // ordem de grandeza, mesmo sem valer para leitura ao vivo.
  const dias = recentDays(3);
  const csvs = await Promise.all(dias.map((d) => fetchCsv(dailyKlineUrl(`${ticker}USDT`, "1d", d))));
  const barras = csvs.filter((c): c is string => c !== null).flatMap(parseKlines).sort((a, b) => a.time - b.time);
  if (barras.length === 0) return null;
  return { price: barras[barras.length - 1].close, oiUsd: 0, fonte: "Binance (ontem)" };
}

async function temBinance(ticker: string): Promise<boolean> {
  const ontem = recentDays(2)[0];
  return (await fetchCsv(metricsUrl(`${ticker}USDT`, ontem))) !== null;
}

const LISTA = [
  "UAI", "UB", "BIANRENSHENG", "APR", "CC", "CAP", "BAS", "COLLECT", "ON", "EVAA",
  "RE", "MAGMA", "US", "AKE", "RIF", "MORPHO", "VVV", "JELLYJELLY", "ZAMA", "ALLO",
  "BP", "Q", "TAG", "BR", "AGT", "STABLE", "JST", "BLUAI", "BULLA", "BAN",
  "BASED", "VELVET", "JCT", "ARC", "EPIC", "B", "HANA", "XNY", "ZEREBRO", "BTW", "CYS",
];

// `TICKER` ou `TICKER=termo de busca`.
const pedidos = process.argv.slice(2).map((arg) => {
  const [tk, nome] = arg.replace("$", "").split("=");
  return { ticker: tk.toUpperCase(), busca: nome ?? tk.toUpperCase() };
});
const alvos = pedidos.length > 0 ? pedidos : LISTA.map((t) => ({ ticker: t, busca: t }));

const usd = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(1)}bi` : v >= 1e6 ? `${(v / 1e6).toFixed(1)}mi` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : v.toFixed(0);

console.log(`\nticker        perp       preço perp  erro  rede      liquidez   giro     OI   contrato`);
console.log("-".repeat(120));

const achados: { ticker: string; chain: string; address: string; liq: number; oi: number }[] = [];
const soPerp: string[] = [];
const nada: string[] = [];

for (const { ticker, busca } of alvos) {
  const [perp, bin, cands] = await Promise.all([
    precoPerp(ticker).catch(() => null),
    temBinance(ticker).catch(() => false),
    candidatos(ticker, busca).catch(() => null),
  ]);


  if (cands === null) {
    console.log(`${ticker.padEnd(13)} ${"?".padEnd(9)} ${"—".padStart(11)}   BUSCA FALHOU — não é conclusão, é rede fora`);
    continue;
  }

  const marca = perp ? (bin ? "Gate+Bnc" : perp.fonte === "Gate" ? "Gate" : "Binance") : "—";

  if (!perp) {
    nada.push(ticker);
    console.log(`${ticker.padEnd(13)} ${marca.padEnd(9)} ${"—".padStart(11)}   sem derivativo, sem referência de preço`);
    continue;
  }

  // O candidato certo é o que bate de preço; entre os que batem, o mais fundo.
  const batem = cands
    .map((c) => ({
      ...c,
      erro: Math.abs(c.price / perp.price - 1),
      giro: c.liquidityUsd > 0 ? c.volume24h / c.liquidityUsd : 0,
    }))
    .filter((c) => c.erro <= TOLERANCIA)
    .filter((c) => c.liquidityUsd >= LIQUIDEZ_MINIMA && c.giro >= GIRO_MINIMO)
    // Volume manda na escolha, não liquidez: é o número que não dá para inflar
    // depositando o próprio token contra si mesmo.
    .sort((a, b) => b.volume24h - a.volume24h);

  // Entre os que passam nos dois primeiros testes, o primeiro que também tiver
  // supply coerente com o circulante. Sem circulante publicado o teste não roda
  // e o candidato passa — melhor deixar entrar com ressalva do que barrar por
  // falta de dado de terceiro.
  const circ = await circulante(`${ticker}USDT`).catch(() => null);
  let escolhido: (typeof batem)[0] | undefined;
  let fragmento: (typeof batem)[0] | undefined;

  for (const c of batem) {
    if (!circ || circ.atual <= 0) {
      escolhido = c;
      break;
    }
    try {
      const info = await tokenInfo(c.chain as Chain, c.address);
      const total = toUnits(info.totalSupply, info.decimals);
      if (total / circ.atual >= COERENCIA_MINIMA) {
        escolhido = c;
        break;
      }
      if (!fragmento) fragmento = c;
    } catch {
      // Contrato que não responde não serve de qualquer jeito.
    }
  }

  if (!escolhido) {
    soPerp.push(ticker);
    const perto = cands[0];
    const giro = perto && perto.liquidityUsd > 0 ? perto.volume24h / perto.liquidityUsd : 0;
    const nota = fragmento
      ? `melhor candidato é fragmento — supply do contrato menor que o circulante`
      : !perto
      ? `nenhum par EVM${busca === ticker && ticker.length <= 2 ? " — ticker curto demais, tente TICKER=nome-do-projeto" : ""}`
      : Math.abs(perto.price / perp.price - 1) > TOLERANCIA
        ? `melhor candidato erra ${((perto.price / perp.price - 1) * 100).toFixed(0)}% no preço`
        : perto.liquidityUsd < LIQUIDEZ_MINIMA
          ? `pool de apenas ${usd(perto.liquidityUsd)}`
          : `pool de ${usd(perto.liquidityUsd)} sem giro (${(giro * 100).toFixed(2)}%/dia) — decorativa`;
    console.log(
      `${ticker.padEnd(13)} ${marca.padEnd(9)} ${perp.price.toPrecision(5).padStart(11)}   ` +
        `só perpétuo — ${nota}`,
    );
    continue;
  }

  achados.push({ ticker, chain: escolhido.chain, address: escolhido.address, liq: escolhido.liquidityUsd, oi: perp.oiUsd });
  console.log(
    `${ticker.padEnd(13)} ${marca.padEnd(9)} ${perp.price.toPrecision(5).padStart(11)} ` +
      `${(escolhido.erro * 100).toFixed(1).padStart(4)}%  ${escolhido.chain.padEnd(9)} ` +
      `${usd(escolhido.liquidityUsd).padStart(8)} ${escolhido.giro.toFixed(2).padStart(6)} ` +
      `${usd(perp.oiUsd).padStart(6)}  ${escolhido.address}`,
  );
}

console.log(`\n${achados.length} com contrato EVM confirmado · ${soPerp.length} só perpétuo · ${nada.length} sem nada`);
if (soPerp.length) console.log(`só perpétuo: ${soPerp.join(", ")}`);
if (nada.length) console.log(`sem derivativo: ${nada.join(", ")}`);

console.log(`\n--- entradas prontas para lib/watchlist.ts ---`);
for (const a of achados.sort((x, y) => y.oi - x.oi)) {
  console.log(`  {
    symbol: "${a.ticker}USDT",
    chain: "${a.chain}",
    contract: "${a.address}",
    firstBlock: 0,
    wallets: [],
  },`);
}
