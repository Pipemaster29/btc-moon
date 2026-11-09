/**
 * Os casos-limite do módulo das baleias da Hyperliquid (`lib/hyperliquid.ts`),
 * sem tocar em rede. Sai com código diferente de zero quando algum falha.
 *
 * O que mais importa travar é a REGRA PARA TRÁS: a posição numa data passada é
 * o `antes` da primeira execução depois dela, ou a de agora — e antes do começo
 * do histórico da conta não há leitura, não há zero.
 *
 * Rode com: npx tsx scripts/testar-baleias.mts
 */
import {
  agregar,
  casarComBinance,
  fluxoEntre,
  lerExecucoes,
  lerMoedas,
  lerPosicoes,
  lerRanking,
  lucroRealizado,
  MINIMOS,
  posicoesEm,
  type HistoricoDaConta,
  type PosicaoAoVivo,
} from "../lib/hyperliquid";

let falhas = 0;
function confere(nome: string, ok: boolean, obtido: string): void {
  if (!ok) falhas++;
  console.log(`  ${nome.padEnd(66)} ${obtido.padEnd(28)} ${ok ? "ok" : "← FALHOU"}`);
}
const perto = (x: number, y: number, tol = 1e-9) => Math.abs(x - y) <= tol * Math.max(1, Math.abs(y));
const H = 3_600_000;
const T0 = Date.parse("2026-06-01T00:00:00Z");
const A = "0x" + "a".repeat(40);

console.log("\no ranking");
{
  const bruto = {
    leaderboardRows: [
      { ethAddress: "0x" + "A".repeat(40), accountValue: "1000000.5", windowPerformances: [["month", { pnl: "10", vlm: "20" }], ["allTime", { pnl: "-5", vlm: "3000000000" }]] },
      { ethAddress: "não é endereço", accountValue: "1", windowPerformances: [] },
      { ethAddress: "0x" + "b".repeat(40), accountValue: "lixo", windowPerformances: [["month", { pnl: "1", vlm: "1" }], ["allTime", { pnl: "1", vlm: "1" }]] },
    ],
  };
  const r = lerRanking(bruto);
  confere("lê a conta e põe o endereço em minúsculas", r.length === 1 && r[0].endereco === A && r[0].volumeVida === 3e9, `${r.length} · ${r[0]?.endereco.slice(0, 6)}`);
  confere("endereço inválido e número ilegível ficam fora", r.every((c) => c.endereco === A), `${r.length} linha(s)`);
  confere("ranking sem a lista: vazio, sem lançar", lerRanking(null).length === 0 && lerRanking({}).length === 0, "0");
}

console.log("\nas execuções");
const PERPS = new Set(["BTC", "ETH", "kPEPE"]);
{
  const bruto = [
    { coin: "ETH", px: "2000", sz: "1", side: "B", time: T0 + 2 * H, startPosition: "0", closedPnl: "0", fee: "1" },
    { coin: "@107", px: "1", sz: "1", side: "B", time: T0 + H, startPosition: "0", closedPnl: "0", fee: "0" },
    { coin: "PURR/USDC", px: "1", sz: "1", side: "A", time: T0 + H, startPosition: "0", closedPnl: "0", fee: "0" },
    { coin: "BTC", px: "100000", sz: "0.5", side: "A", time: T0 + H, startPosition: "1", closedPnl: "500", fee: "2" },
    { coin: "BTC", px: "lixo", sz: "1", side: "B", time: T0 + 3 * H, startPosition: "0.5", closedPnl: "0", fee: "0" },
  ];
  const { execucoes, ilegivelAte } = lerExecucoes(bruto, PERPS);
  confere("só perpétuo: a moeda à vista (@107, PURR/USDC) fica fora", execucoes.every((e) => PERPS.has(e.moeda)) && execucoes.length === 2, `${execucoes.map((e) => e.moeda).join(",")}`);
  confere("em ordem crescente de tempo", execucoes[0].moeda === "BTC" && execucoes[1].moeda === "ETH", `${execucoes.map((e) => e.moeda).join(",")}`);
  confere("execução ilegível marca até quando a conta não se reconstrói", ilegivelAte === T0 + 3 * H, `${ilegivelAte}`);
  // Três execuções no MESMO milissegundo, fora de ordem e com tid que não sobe:
  // a ordem verdadeira é a do encadeamento (−410,1 → −351,59 → −310,1 → −300).
  const mesmoMs = lerExecucoes(
    [
      { coin: "ETH", px: "1", sz: "41.49", side: "B", time: T0, startPosition: "-351.59", closedPnl: "0", fee: "0" },
      { coin: "ETH", px: "1", sz: "10.1", side: "B", time: T0, startPosition: "-310.1", closedPnl: "0", fee: "0" },
      { coin: "ETH", px: "1", sz: "58.51", side: "B", time: T0, startPosition: "-410.1", closedPnl: "0", fee: "0" },
    ],
    PERPS,
  ).execucoes;
  confere("no mesmo milissegundo, a ordem do encadeamento", mesmoMs.map((e) => e.antes).join() === "-410.1,-351.59,-310.1", mesmoMs.map((e) => e.antes).join());
  const h1: HistoricoDaConta = { endereco: A, desde: T0 - H, ate: T0 + H, execucoes: mesmoMs, atuais: { ETH: -300 }, altaFrequencia: false };
  confere("a posição antes do lote é o começo da cadeia", posicoesEm(h1, T0 - 1)?.get("ETH") === -410.1, `${posicoesEm(h1, T0 - 1)?.get("ETH")}`);
}

console.log("\na regra para trás");
function historico(): HistoricoDaConta {
  // BTC: 0 → +2 (t1) → +1 (t3) → −1 (t5, virou vendida); ETH: +10 → 0 (t4); kPEPE só agora.
  const { execucoes } = lerExecucoes(
    [
      { coin: "BTC", px: "100", sz: "2", side: "B", time: T0 + 1 * H, startPosition: "0", closedPnl: "0", fee: "0" },
      { coin: "BTC", px: "110", sz: "1", side: "A", time: T0 + 3 * H, startPosition: "2", closedPnl: "10", fee: "1" },
      { coin: "ETH", px: "50", sz: "10", side: "A", time: T0 + 4 * H, startPosition: "10", closedPnl: "-30", fee: "1" },
      { coin: "BTC", px: "120", sz: "2", side: "A", time: T0 + 5 * H, startPosition: "1", closedPnl: "20", fee: "1" },
    ],
    PERPS,
  );
  return { endereco: A, desde: T0, ate: T0 + 10 * H, execucoes, atuais: { BTC: -1, kPEPE: 5000 }, altaFrequencia: false };
}
{
  const h = historico();
  const p0 = posicoesEm(h, T0 + 0.5 * H);
  confere("antes de tudo: BTC zero, ETH +10, kPEPE de agora", p0 !== null && !p0.has("BTC") && p0.get("ETH") === 10 && p0.get("kPEPE") === 5000, `${JSON.stringify(p0 && Object.fromEntries(p0))}`);
  const p2 = posicoesEm(h, T0 + 2 * H);
  confere("entre a compra e a venda parcial: BTC +2", p2?.get("BTC") === 2 && p2.get("ETH") === 10, `${JSON.stringify(p2 && Object.fromEntries(p2))}`);
  const p45 = posicoesEm(h, T0 + 4.5 * H);
  confere("ETH zerada some do mapa; BTC +1 antes de virar", p45 !== null && !p45.has("ETH") && p45.get("BTC") === 1, `${JSON.stringify(p45 && Object.fromEntries(p45))}`);
  const p6 = posicoesEm(h, T0 + 6 * H);
  confere("depois da última execução: as posições de agora", p6?.get("BTC") === -1 && p6.get("kPEPE") === 5000, `${JSON.stringify(p6 && Object.fromEntries(p6))}`);
  confere("execução no instante exato conta como passada", posicoesEm(h, T0 + 1 * H)?.get("BTC") === 2, `${posicoesEm(h, T0 + 1 * H)?.get("BTC")}`);
  confere("antes do começo do histórico: nulo, não zero", posicoesEm({ ...h, desde: T0 + 2 * H }, T0 + H) === null, "nulo");
  confere("depois da leitura: nulo", posicoesEm(h, T0 + 11 * H) === null, "nulo");
  confere("lucro realizado: closedPnl menos a taxa, na janela", perto(lucroRealizado(h, T0, T0 + 4 * H), 10 - 1 + -30 - 1), `${lucroRealizado(h, T0, T0 + 4 * H)}`);
}

console.log("\na soma por moeda");
{
  const ag = agregar([
    { conta: "1", moeda: "BTC", nocional: 400_000 },
    { conta: "2", moeda: "BTC", nocional: 300_000 },
    { conta: "3", moeda: "BTC", nocional: -100_000 },
    { conta: "4", moeda: "BTC", nocional: 40_000 },
    { conta: "1", moeda: "ETH", nocional: 900_000 },
    { conta: "2", moeda: "ETH", nocional: -60_000 },
  ]);
  const btc = ag.get("BTC")!;
  confere("posição abaixo de US$ 50 mil não conta", btc.contas === 3 && btc.comprado === 700_000, `${btc.contas} contas, ${btc.comprado}`);
  confere("consenso = (comprado − vendido) ÷ (comprado + vendido)", perto(btc.consenso ?? NaN, 600_000 / 800_000), `${btc.consenso}`);
  confere("menos de 3 contas: sem consenso", ag.get("ETH")?.consenso === null, `${ag.get("ETH")?.consenso}`);
  confere(`soma abaixo de US$ ${MINIMOS.somado / 1000} mil: sem consenso`, agregar([1, 2, 3].map((n) => ({ conta: String(n), moeda: "X", nocional: 60_000 }))).get("X")?.consenso === null, "nulo");
}

console.log("\no casamento com a Binance");
{
  const binance = new Map([
    ["BTCUSDT", 100_500],
    ["1000PEPEUSDT", 0.0101],
    ["RAYUSDT", 0.07],
    ["1000BONKUSDT", 0.02],
  ]);
  const m = casarComBinance(
    [
      { moeda: "BTC", preco: 100_000 },
      { moeda: "kPEPE", preco: 0.01 },
      { moeda: "RAY", preco: 2 },
      { moeda: "BONK", preco: 0.00002 },
    ],
    (s) => binance.get(s),
  );
  confere("BTC casa com BTCUSDT", m.get("BTC") === "BTCUSDT", `${m.get("BTC")}`);
  confere("kPEPE (mil PEPE) casa com 1000PEPEUSDT", m.get("kPEPE") === "1000PEPEUSDT", `${m.get("kPEPE")}`);
  confere("homônimo com preço fora (a RAY) não casa", !m.has("RAY"), m.has("RAY") ? "casou" : "fora");
  confere("moeda inteira contra o perpétuo de mil unidades casa pelo fator", m.get("BONK") === "1000BONKUSDT", `${m.get("BONK")}`);
}

console.log("\na leitura ao vivo");
{
  const bruto = {
    assetPositions: [
      { position: { coin: "BTC", szi: "10", positionValue: "1000000", entryPx: "95000", liquidationPx: "80000", unrealizedPnl: "50000", leverage: { value: 5 } } },
      { position: { coin: "ETH", szi: "0", positionValue: "0", entryPx: "1", liquidationPx: null, unrealizedPnl: "0" } },
    ],
  };
  const ps = lerPosicoes(A.toUpperCase(), bruto);
  confere("lê a posição; tamanho zero é conta sem posição", ps?.length === 1 && ps[0].moeda === "BTC" && ps[0].liquidacao === 80_000 && ps[0].conta === A, `${ps?.length} · ${ps?.[0]?.moeda}`);
  const comLixo = lerPosicoes(A, { assetPositions: [...bruto.assetPositions, { position: { coin: "SOL", szi: "-100", positionValue: "lixo", entryPx: "1", liquidationPx: null, unrealizedPnl: "0" } }] });
  confere("uma posição ilegível anula a conta (não vira saída)", comLixo === null, `${comLixo === null ? "nula" : comLixo.length}`);
  confere("resposta sem as posições é conta não lida", lerPosicoes(A, { erro: 1 }) === null && lerPosicoes(A, { assetPositions: [] })?.length === 0, "nula · vazia");

  const p = (conta: string, moeda: string, tamanho: number, nocional: number, entrada: number, liquidacao: number | null, lucroAberto = 0): PosicaoAoVivo => ({ conta, moeda, tamanho, nocional, entrada, liquidacao, alavancagem: 5, lucroAberto });
  const posicoes = [
    p("1", "BTC", 10, 1_000_000, 95_000, 90_500, 50_000),
    p("2", "BTC", 5, 500_000, 105_000, 91_000, -25_000),
    p("3", "BTC", -2, 200_000, 101_000, 110_500),
    p("4", "BTC", -1, 100_000, 99_000, 150_000),
    p("5", "BTC", 0.1, 10_000, 100_000, 99_000),
  ];
  const [btc] = lerMoedas(posicoes, new Set(["1", "3"]), new Map([["BTC", 100_000]]), new Map([["BTC", 3e9]]), new Map([["BTC", 0.25]]), new Map([["BTC", "BTCUSDT"]]));
  confere("conta comprada e vendida, sem a posição pequena", btc.compradas === 2 && btc.vendidas === 2 && btc.comprado === 1_500_000, `${btc.compradas}/${btc.vendidas} · ${btc.comprado}`);
  confere("duas espertas não fazem consenso (mínimo de 3 contas)", btc.consensoEspertas === null, `${btc.consensoEspertas}`);
  const [comTres] = lerMoedas(posicoes, new Set(["1", "2", "3"]), new Map([["BTC", 100_000]]), new Map());
  confere("consenso das espertas só com elas", perto(comTres.consensoEspertas ?? NaN, (1_500_000 - 200_000) / 1_700_000), `${comTres.consensoEspertas?.toFixed(4)}`);
  confere("o fluxo vem de fluxoEntre, como veio", btc.fluxo === 0.25, `${btc.fluxo}`);
  confere("custo médio das compradas, pelo nocional", perto(btc.custoComprado ?? NaN, (95_000 * 1e6 + 105_000 * 5e5) / 1.5e6), `${btc.custoComprado?.toFixed(0)}`);
  confere("liquidações das compradas abaixo, na faixa de 2%", btc.liquidacoesAbaixo.length === 1 && perto(btc.liquidacoesAbaixo[0].nocional, 1_500_000) && perto(btc.liquidacoesAbaixo[0].distancia, -0.09), `${JSON.stringify(btc.liquidacoesAbaixo.map((f) => [f.distancia, f.nocional]))}`);
  confere("liquidação além de 30% não é suporte de ninguém", btc.liquidacoesAcima.length === 1 && perto(btc.liquidacoesAcima[0].nocional, 200_000), `${btc.liquidacoesAcima.length} faixa(s)`);
  confere("casada com o perpétuo da Binance", btc.symbol === "BTCUSDT", `${btc.symbol}`);
  const [semAnterior] = lerMoedas(posicoes, new Set(), new Map([["BTC", 100_000]]), new Map());
  confere("sem leitura anterior: fluxo nulo, não zero", semAnterior.fluxo === null && semAnterior.consensoEspertas === null && semAnterior.openInterest === null, `${semAnterior.fluxo}`);
}

console.log("\no fluxo entre duas leituras (fluxoEntre)");
{
  const preco = new Map([["BTC", 100_000]]);
  // Três contas compradas, ninguém negocia, o preço sobe 10%: fluxo ZERO — era 10% na primeira versão.
  const antes = { "1": { BTC: 5 }, "2": { BTC: 3 }, "3": { BTC: 2 } };
  const parado = fluxoEntre(antes, antes, new Map([["BTC", 110_000]]));
  confere("o preço andando sozinho não é fluxo", parado.get("BTC") === 0, `${parado.get("BTC")}`);
  // A conta 1 compra mais 1 BTC: +US$ 100 mil sobre US$ 1,1 milhão de agora.
  const compra = fluxoEntre(antes, { "1": { BTC: 6 }, "2": { BTC: 3 }, "3": { BTC: 2 } }, preco);
  confere("compra de uma conta lida nas duas", perto(compra.get("BTC") ?? NaN, 100_000 / 1_100_000), `${compra.get("BTC")?.toFixed(4)}`);
  // Uma conta nova no universo (a 4) com 20 BTC: não é compra, é composição.
  const nova = fluxoEntre(antes, { ...antes, "4": { BTC: 20 } }, preco);
  confere("conta que só está numa das leituras fica fora", nova.get("BTC") === 0, `${nova.get("BTC")}`);
  // A conta 3 não foi lida agora: a posição dela não vira venda.
  const naoLida = fluxoEntre({ ...antes, "4": { BTC: 1 } }, { "1": { BTC: 5 }, "2": { BTC: 3 }, "4": { BTC: 1 } }, preco);
  confere("conta não lida agora não vira saída", naoLida.get("BTC") === 0, `${naoLida.get("BTC")}`);
  // Saída inteira de uma conta LIDA (objeto vazio): venda de US$ 100 mil sobre o US$ 1 milhão que ficou.
  const saiu = fluxoEntre({ ...antes, "4": { BTC: 1 } }, { ...antes, "4": {} }, preco);
  confere("conta lida que zerou é venda", perto(saiu.get("BTC") ?? NaN, -100_000 / 1_000_000), `${saiu.get("BTC")?.toFixed(4)}`);
  // A de US$ 60 mil que vira US$ 40 mil conta como venda de 20, não de 60.
  const enc = fluxoEntre({ ...antes, "4": { BTC: 0.6 } }, { ...antes, "4": { BTC: 0.4 } }, preco);
  confere("posição que cruza a régua conta pela diferença", perto(enc.get("BTC") ?? NaN, -20_000 / 1_000_000), `${enc.get("BTC")?.toFixed(4)}`);
  // Abaixo dos mínimos entre as contas lidas nas duas: sem fluxo, não zero.
  const pouco = fluxoEntre({ "1": { BTC: 5 } }, { "1": { BTC: 6 } }, preco);
  confere("uma conta só não faz fluxo (mínimos do consenso)", !pouco.has("BTC"), `${pouco.get("BTC")}`);
  // Moeda sem preço agora fica de fora.
  const semPreco = fluxoEntre({ ...antes, "1": { BTC: 5, ETH: 100 } }, { ...antes, "1": { BTC: 5, ETH: 200 } }, preco);
  confere("moeda sem preço agora fica de fora", !semPreco.has("ETH"), `${semPreco.get("ETH")}`);
  // Vendido: a conta 2 vira vendida de 3 BTC — o líquido cai US$ 600 mil.
  const virou = fluxoEntre(antes, { "1": { BTC: 5 }, "2": { BTC: -3 }, "3": { BTC: 2 } }, preco);
  confere("comprada que vira vendida conta as duas pernas", perto(virou.get("BTC") ?? NaN, -600_000 / 1_000_000), `${virou.get("BTC")?.toFixed(4)}`);
}

console.log(falhas === 0 ? "\ntodos os casos passaram" : `\n${falhas} caso(s) FALHARAM`);
if (falhas > 0) process.exit(1);
