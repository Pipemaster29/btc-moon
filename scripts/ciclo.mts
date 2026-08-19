/**
 * O ciclo de vida completo de uma moeda manipulada, carteira por carteira.
 *
 * Reconstrói, via nó de arquivo, o saldo de cada carteira de corretora ao longo
 * de toda a vida do token e cruza com preço, market cap e a fase em que o preço
 * estava. A pergunta que responde: quem se mexeu em cada trecho — na subida, na
 * queda e nas constâncias — e não só no topo.
 *
 * A separação entre quente e fria importa. Carteira quente é o livro: o que
 * está nela pode ser vendido agora. Fria é custódia: o que está nela precisa
 * primeiro atravessar a quente, e essa travessia é visível. Somar as duas
 * esconde justamente a transição que antecede a venda.
 *
 * O market cap aparece em duas versões porque a diferença entre elas é o ponto:
 * o FDV supõe que todo o supply é vendável, e num token com 85% travado isso é
 * ficção. O circulante usa só o que não está travado.
 *
 * Rode com: npm run ciclo LAB
 *           npm run ciclo BTW
 */

import { balanceAt, blockNumber, blockTime, toUnits, CHAINS } from "../lib/onchain";
import { fetchCsv, monthlyKlineUrl, dailyKlineUrl, recentDays } from "../lib/datavision";
import { parseKlines } from "../lib/derivatives";

/** Quente é o livro; fria é custódia. A distinção muda a leitura. */
const CARTEIRAS: { nome: string; addr: string; tipo: "quente" | "fria" }[] = [
  { nome: "Binance ctr", addr: "0x73D8bD54F7Cf5FAb43fE4Ef40A62D390644946Db", tipo: "quente" },
  { nome: "MEXC", addr: "0x4982085C9e2F89F2eCb8131Eca71aFAD896e89CB", tipo: "quente" },
  { nome: "Bitget qte", addr: "0x1AB4973a48dc892Cd9971ECE8e01DcC7688f8F23", tipo: "quente" },
  { nome: "Binance", addr: "0x7FcBd9d429932A11884Cb5CE9c61055b369F56F7", tipo: "quente" },
  { nome: "Bitget fria", addr: "0x26209d9f0Dc3aC0129C3FB1bADaBFeb9eE728c66", tipo: "fria" },
];

const TOKENS: Record<string, {
  contract: string; symbol: string; meses: string[]; supply: number; travado: number;
}> = {
  LAB: {
    contract: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A",
    symbol: "LABUSDT",
    meses: ["2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"],
    supply: 0.99e9,
    // Não mapeei a estrutura de trava do LAB; sem isso o circulante seria um
    // chute com cara de precisão, então fica só o FDV.
    travado: 0,
  },
  BTW: {
    contract: "0x444045B0EE1ee319A660a5E3d604CA0ffA35ACaA",
    symbol: "BTWUSDT",
    meses: ["2026-06", "2026-07"],
    supply: 10e9,
    // 84,94% em dois contratos de trava, conferido on-chain.
    travado: 0.8494,
  },
};

const nome = (process.argv[2] ?? "BTW").toUpperCase();
const alvo = TOKENS[nome];
if (!alvo) {
  console.error(`tokens: ${Object.keys(TOKENS).join(", ")}`);
  process.exit(1);
}

const csvs = await Promise.all([
  ...alvo.meses.map((m) => fetchCsv(monthlyKlineUrl(alvo.symbol, "1d", m))),
  ...recentDays(45).map((d) => fetchCsv(dailyKlineUrl(alvo.symbol, "1d", d))),
]);
const bars = [
  ...new Map(
    csvs.filter((c): c is string => c !== null).flatMap(parseKlines).map((b) => [b.time, b]),
  ).values(),
].sort((a, b) => a.time - b.time);

if (bars.length === 0) {
  console.error(`sem preço para ${alvo.symbol}`);
  process.exit(1);
}

const head = await blockNumber("bsc");
const tHead = await blockTime("bsc", head);
const seg = CHAINS.bsc.secondsPerBlock;
const blocoDe = (ts: number) => Math.round(head - (tHead - ts) / seg);

const PONTOS = 22;
const passo = Math.max(1, Math.floor(bars.length / PONTOS));
const amostra = bars.filter((_, i) => i % passo === 0);
const topo = bars.reduce((a, b) => (b.high > a.high ? b : a));

const money = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(2)}B` : v >= 1e6 ? `${(v / 1e6).toFixed(0)}M` : `${(v / 1e3).toFixed(0)}k`;

console.log(`\n${"=".repeat(104)}`);
console.log(`${nome} · ciclo completo por carteira · ${bars.length} dias`);
console.log("=".repeat(104));
console.log(
  `\n  data         preço      FDV${alvo.travado ? "   circul." : "        "}   ${CARTEIRAS.map((c) => c.nome.padStart(11)).join("")}   QUENTE     FRIA`,
);

interface Linha { time: number; preco: number; quente: number; fria: number }
const serie: Linha[] = [];

for (const bar of amostra) {
  const bloco = blocoDe(bar.time);
  if (bloco < 1 || bloco > head) continue;

  const saldos: number[] = [];
  let falhou = false;
  for (const c of CARTEIRAS) {
    try {
      saldos.push(toUnits(await balanceAt("bsc", alvo.contract, c.addr, bloco), 18));
    } catch {
      falhou = true;
      break;
    }
  }
  if (falhou) continue;

  const quente = saldos.filter((_, i) => CARTEIRAS[i].tipo === "quente").reduce((a, b) => a + b, 0);
  const fria = saldos.filter((_, i) => CARTEIRAS[i].tipo === "fria").reduce((a, b) => a + b, 0);
  serie.push({ time: bar.time, preco: bar.close, quente, fria });

  const fdv = bar.close * alvo.supply;
  const circ = alvo.travado ? bar.close * alvo.supply * (1 - alvo.travado) : NaN;
  const dia = new Date(bar.time * 1000).toISOString().slice(0, 10);

  console.log(
    `  ${dia}  ${bar.close.toPrecision(4).padStart(9)}  ${money(fdv).padStart(7)}` +
      `${alvo.travado ? money(circ).padStart(9) : "         "}   ` +
      `${saldos.map((v) => `${(v / 1e6).toFixed(1)}M`.padStart(11)).join("")}` +
      `  ${`${(quente / 1e6).toFixed(1)}M`.padStart(8)} ${`${(fria / 1e6).toFixed(1)}M`.padStart(8)}` +
      `${bar.time === topo.time ? "  ← TOPO" : ""}`,
  );
}

// ------------------------------------------------------------------- fases
//
// A fase vem do preço, e o que se lê é o que as carteiras fizeram DENTRO dela.
// Classificar pelo saldo seria circular.
console.log(`\n${"─".repeat(104)}`);
console.log("O QUE AS CORRETORAS FIZERAM EM CADA FASE");
console.log("─".repeat(104));
console.log(`\n  período                     preço          fase        quente      fria`);

for (let i = 1; i < serie.length; i++) {
  const a = serie[i - 1], b = serie[i];
  const varPreco = b.preco / a.preco - 1;
  const fase = varPreco > 0.25 ? "SUBIDA" : varPreco < -0.25 ? "QUEDA" : "constância";
  const dq = a.quente > 0 ? (b.quente / a.quente - 1) * 100 : 0;
  const df = a.fria > 0 ? (b.fria / a.fria - 1) * 100 : 0;
  const dia = (t: number) => new Date(t * 1000).toISOString().slice(5, 10);

  console.log(
    `  ${dia(a.time)} → ${dia(b.time)}   ${`${varPreco > 0 ? "+" : ""}${(varPreco * 100).toFixed(0)}%`.padStart(8)}   ${fase.padEnd(12)}` +
      `${`${dq > 0 ? "+" : ""}${dq.toFixed(0)}%`.padStart(9)} ${`${df > 0 ? "+" : ""}${df.toFixed(0)}%`.padStart(9)}`,
  );
}

// --------------------------------------------------------------- agregado
const porFase = new Map<string, { n: number; quente: number; fria: number }>();
for (let i = 1; i < serie.length; i++) {
  const a = serie[i - 1], b = serie[i];
  const v = b.preco / a.preco - 1;
  const fase = v > 0.25 ? "SUBIDA" : v < -0.25 ? "QUEDA" : "constância";
  const cur = porFase.get(fase) ?? { n: 0, quente: 0, fria: 0 };
  cur.n++;
  if (a.quente > 0) cur.quente += (b.quente / a.quente - 1) * 100;
  if (a.fria > 0) cur.fria += (b.fria / a.fria - 1) * 100;
  porFase.set(fase, cur);
}

console.log(`\n${"─".repeat(104)}`);
console.log("MÉDIA POR FASE");
console.log("─".repeat(104));
console.log(`\n  fase          trechos   quente     fria`);
for (const [fase, v] of porFase) {
  console.log(
    `  ${fase.padEnd(13)} ${String(v.n).padStart(6)}  ${`${(v.quente / v.n).toFixed(0)}%`.padStart(8)} ${`${(v.fria / v.n).toFixed(0)}%`.padStart(8)}`,
  );
}
