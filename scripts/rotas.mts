/**
 * A camada de roteamento: quem carrega o dinheiro entre as carteiras grandes.
 *
 * As corretoras são o destino, não o caminho. Entre a carteira que segura e o
 * livro onde se vende existe uma fila de endereços intermediários — depósitos,
 * repassadores, contratos de roteamento — e é neles que o movimento aparece
 * PRIMEIRO, porque o token precisa atravessá-los antes de chegar ao livro.
 *
 * O script amostra janelas curtas ao longo da vida do token, identifica quem
 * mais moveu volume em cada uma, e cruza com o preço daquela data. A pergunta
 * que ele responde é: os mesmos endereços reaparecem nas fases, ou cada fase
 * tem os seus? Reaparecer é assinatura de infraestrutura de quem opera; não
 * reaparecer é fluxo de mercado.
 *
 * Rode com: npm run rotas LAB
 *           npm run rotas BTW
 */

import { blockNumber, blockTime, scanTransfers, toUnits, CHAINS } from "../lib/onchain";
import { fetchCsv, monthlyKlineUrl, dailyKlineUrl, recentDays } from "../lib/datavision";
import { parseKlines } from "../lib/derivatives";

/** Carteiras de corretora: são destino conhecido e poluiriam o ranking. */
const CORRETORAS = new Set(
  [
    "0x73D8bD54F7Cf5FAb43fE4Ef40A62D390644946Db",
    "0x4982085C9e2F89F2eCb8131Eca71aFAD896e89CB",
    "0x1AB4973a48dc892Cd9971ECE8e01DcC7688f8F23",
    "0x26209d9f0Dc3aC0129C3FB1bADaBFeb9eE728c66",
    "0x7FcBd9d429932A11884Cb5CE9c61055b369F56F7",
    "0x0000000000000000000000000000000000000000",
  ].map((a) => a.toLowerCase()),
);

const TOKENS: Record<string, { contract: string; symbol: string; meses: string[] }> = {
  LAB: {
    contract: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A",
    symbol: "LABUSDT",
    meses: ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07"],
  },
  BTW: {
    contract: "0x444045B0EE1ee319A660a5E3d604CA0ffA35ACaA",
    symbol: "BTWUSDT",
    meses: ["2026-06", "2026-07"],
  },
};

const nome = (process.argv[2] ?? "LAB").toUpperCase();
const alvo = TOKENS[nome];
if (!alvo) {
  console.error(`tokens: ${Object.keys(TOKENS).join(", ")}`);
  process.exit(1);
}

/** Janela curta por amostra: varrer tudo custaria horas e não afina nada. */
const HORAS = 2;
const AMOSTRAS = 12;

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

const passo = Math.max(1, Math.floor(bars.length / AMOSTRAS));
const amostras = bars.filter((_, i) => i % passo === 0).slice(0, AMOSTRAS);
const topo = bars.reduce((a, b) => (b.high > a.high ? b : a));

console.log(`\n${"=".repeat(88)}`);
console.log(`${nome} · camada de roteamento ao longo do ciclo · janelas de ${HORAS}h`);
console.log("=".repeat(88));

/** Quantas vezes cada endereço apareceu no topo de uma janela. */
const recorrencia = new Map<string, { vezes: number; datas: string[] }>();

for (const bar of amostras) {
  const a = blocoDe(bar.time);
  const b = a + Math.round((HORAS * 3600) / seg);
  if (a < 1 || b > head) continue;

  const r = await scanTransfers({ chain: "bsc", token: alvo.contract, fromBlock: a, toBlock: b });

  const vol = new Map<string, bigint>();
  for (const t of r.transfers) {
    for (const lado of [t.from.toLowerCase(), t.to.toLowerCase()]) {
      if (CORRETORAS.has(lado)) continue;
      vol.set(lado, (vol.get(lado) ?? BigInt(0)) + t.value);
    }
  }

  const top = [...vol.entries()].sort((x, y) => (y[1] > x[1] ? 1 : -1)).slice(0, 3);
  const dia = new Date(bar.time * 1000).toISOString().slice(0, 10);

  for (const [addr] of top) {
    const r0 = recorrencia.get(addr) ?? { vezes: 0, datas: [] };
    r0.vezes++;
    r0.datas.push(dia);
    recorrencia.set(addr, r0);
  }

  console.log(
    `\n  ${dia}  preço ${bar.close.toPrecision(4)}  ·  ${r.transfers.length} transferências${bar.time === topo.time ? "  ← TOPO" : ""}`,
  );
  for (const [addr, v] of top) {
    console.log(`     ${addr}  ${(toUnits(v, 18) / 1e6).toFixed(2).padStart(9)}M`);
  }
}

// ------------------------------------------------------------- recorrência
const repetidos = [...recorrencia.entries()]
  .filter(([, r]) => r.vezes >= 2)
  .sort((a, b) => b[1].vezes - a[1].vezes);

console.log(`\n${"─".repeat(88)}`);
console.log("ENDEREÇOS QUE REAPARECEM EM MAIS DE UMA FASE");
console.log("─".repeat(88));

if (repetidos.length === 0) {
  console.log(
    `\n  Nenhum. Cada fase teve roteadores próprios — o que aponta para fluxo de\n  mercado em vez de infraestrutura de um mesmo operador.`,
  );
} else {
  console.log(
    `\n  ${repetidos.length} de ${recorrencia.size} endereços aparecem em duas ou mais janelas.\n`,
  );
  for (const [addr, r] of repetidos) {
    console.log(`  ${addr}  ${r.vezes}x  ${r.datas.join(", ")}`);
  }
  console.log(
    `\n  Endereço que atravessa fases é candidato a infraestrutura de quem opera.\n  Vale acompanhá-lo: a reativação dele costuma preceder movimento.`,
  );
}
