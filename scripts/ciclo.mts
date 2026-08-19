/**
 * O ciclo de vida de uma moeda manipulada, medido pelo saldo das corretoras.
 *
 * A descoberta que motivou este script: no LAB, o saldo somado das corretoras
 * caiu 96% enquanto o preço multiplicava por 59, e o TOPO coincidiu com a
 * REVERSÃO desse saldo — de 0,36 milhão para 5,87 milhões em quatro dias,
 * enquanto o preço ia de US$ 14 para US$ 0,89.
 *
 * A leitura é mecânica, não mística. Retirar token das corretoras seca o livro
 * e faz pouco dinheiro mover muito preço; quem organiza a alta precisa disso.
 * Mas vender exige devolver o token para a corretora — e é impossível esconder,
 * porque o depósito acontece antes da venda. O saldo voltando a subir é a
 * distribuição começando.
 *
 * Rode com: npm run ciclo LABUSDT
 *           npm run ciclo BTWUSDT
 */

import { balanceAt, blockNumber, blockTime, toUnits } from "../lib/onchain";
import { fetchCsv, monthlyKlineUrl, dailyKlineUrl, recentDays } from "../lib/datavision";
import { parseKlines } from "../lib/derivatives";
import { CHAINS } from "../lib/onchain";

/**
 * Endereços de corretora na BNB Chain.
 *
 * São os mesmos para qualquer token: uma corretora usa a mesma carteira quente
 * para tudo. É isso que torna a comparação entre moedas possível.
 */
const CORRETORAS: [string, string][] = [
  ["Binance (contrato)", "0x73D8bD54F7Cf5FAb43fE4Ef40A62D390644946Db"],
  ["MEXC", "0x4982085C9e2F89F2eCb8131Eca71aFAD896e89CB"],
  ["Bitget (quente)", "0x1AB4973a48dc892Cd9971ECE8e01DcC7688f8F23"],
  ["Bitget (fria)", "0x26209d9f0Dc3aC0129C3FB1bADaBFeb9eE728c66"],
  ["Binance", "0x7FcBd9d429932A11884Cb5CE9c61055b369F56F7"],
];

const TOKENS: Record<string, { contract: string; meses: string[] }> = {
  LABUSDT: {
    contract: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A",
    meses: ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07"],
  },
  BTWUSDT: {
    contract: "0x444045B0EE1ee319A660a5E3d604CA0ffA35ACaA",
    meses: ["2026-06", "2026-07"],
  },
};

const symbol = (process.argv[2] ?? "BTWUSDT").toUpperCase();
const alvo = TOKENS[symbol];
if (!alvo) {
  console.error(`conhecidos: ${Object.keys(TOKENS).join(", ")}`);
  process.exit(1);
}

const csvs = await Promise.all([
  ...alvo.meses.map((m) => fetchCsv(monthlyKlineUrl(symbol, "1d", m))),
  ...recentDays(45).map((d) => fetchCsv(dailyKlineUrl(symbol, "1d", d))),
]);
const bars = [
  ...new Map(
    csvs.filter((c): c is string => c !== null).flatMap(parseKlines).map((b) => [b.time, b]),
  ).values(),
].sort((a, b) => a.time - b.time);

if (bars.length === 0) {
  console.error(`sem preço para ${symbol}`);
  process.exit(1);
}

const head = await blockNumber("bsc");
const tHead = await blockTime("bsc", head);
const seg = CHAINS.bsc.secondsPerBlock;
/** Converte data em altura de bloco, ancorando no bloco atual. */
const blocoDe = (ts: number) => Math.round(head - (tHead - ts) / seg);

// Uma amostra a cada três dias: o suficiente para ver a tendência sem gastar
// centenas de chamadas no nó de arquivo, que é lento e único.
const passo = Math.max(1, Math.round(bars.length / 30));
const amostra = bars.filter((_, i) => i % passo === 0);

const topo = bars.reduce((a, b) => (b.high > a.high ? b : a));

console.log(`\n${"=".repeat(78)}`);
console.log(`${symbol} · saldo das corretoras vs preço · ${bars.length} dias`);
console.log("=".repeat(78));
console.log(`\n  data         preço    corretoras   variação   fase`);

interface Ponto { time: number; preco: number; saldo: number }
const serie: Ponto[] = [];

for (const bar of amostra) {
  const bloco = blocoDe(bar.time);
  if (bloco < 1 || bloco > head) continue;

  let saldo = 0;
  try {
    for (const [, addr] of CORRETORAS) {
      saldo += toUnits(await balanceAt("bsc", alvo.contract, addr, bloco), 18);
    }
  } catch {
    continue;
  }

  const antes = serie[serie.length - 1];
  const variacao = antes && antes.saldo > 0 ? saldo / antes.saldo - 1 : NaN;
  serie.push({ time: bar.time, preco: bar.close, saldo });

  // A fase vem da direção do saldo, não do preço: é ela que antecede.
  const fase = !Number.isFinite(variacao)
    ? ""
    : variacao < -0.1
      ? "aperto"
      : variacao > 0.5
        ? "◀ REVERSÃO — oferta voltando"
        : variacao > 0.1
          ? "devolvendo"
          : "";

  const dia = new Date(bar.time * 1000).toISOString().slice(0, 10);
  console.log(
    `  ${dia}  ${bar.close.toPrecision(4).padStart(9)}  ${(saldo / 1e6).toFixed(2).padStart(9)}M  ${(Number.isFinite(variacao) ? `${variacao > 0 ? "+" : ""}${(variacao * 100).toFixed(0)}%` : "—").padStart(8)}   ${fase}${bar.time === topo.time ? "  ← TOPO" : ""}`,
  );
}

// ------------------------------------------------------------------ resumo
if (serie.length >= 3) {
  const menor = serie.reduce((a, b) => (b.saldo < a.saldo ? b : a));
  const maior = serie.reduce((a, b) => (b.saldo > a.saldo ? b : a));
  const atual = serie[serie.length - 1];
  const dia = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);

  console.log(`\n${"─".repeat(78)}`);
  console.log(`  saldo máximo   ${dia(maior.time)}  ${(maior.saldo / 1e6).toFixed(2)}M  · preço ${maior.preco.toPrecision(4)}`);
  console.log(`  saldo mínimo   ${dia(menor.time)}  ${(menor.saldo / 1e6).toFixed(2)}M  · preço ${menor.preco.toPrecision(4)}`);
  console.log(`  hoje           ${dia(atual.time)}  ${(atual.saldo / 1e6).toFixed(2)}M  · preço ${atual.preco.toPrecision(4)}`);
  console.log(`  topo de preço  ${dia(topo.time)}  ${topo.high.toPrecision(4)}`);
  console.log(
    `\n  Do máximo ao mínimo o saldo caiu ${((1 - menor.saldo / maior.saldo) * 100).toFixed(0)}% e o preço fez ${(menor.preco / maior.preco).toFixed(1)}x.`,
  );
  console.log(
    `  Desde o mínimo o saldo está ${((atual.saldo / menor.saldo - 1) * 100).toFixed(0)}% acima.`,
  );
}
