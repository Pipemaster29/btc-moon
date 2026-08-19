/**
 * Anatomia de um movimento: quem se mexeu, em qual mercado, e quanto foi forçado.
 *
 * Uma queda pode ter três origens que se parecem no gráfico e não têm nada a
 * ver uma com a outra:
 *
 *   DESALAVANCAGEM  o open interest EM MOEDA despenca junto com o preço. Foi
 *                   posição encerrada. Nenhuma moeda trocou de mão de verdade,
 *                   então não há o que ver na rede.
 *   LIVRO VAZIO     o open interest fica de pé e quase ninguém é liquidado. O
 *                   preço cai porque sumiu a COMPRA, não porque apareceu venda.
 *   DISTRIBUIÇÃO    alguém entregou moeda. O saldo das corretoras na rede sobe.
 *
 * Medir o open interest em DÓLAR não separa as três: numa queda de 40% o valor
 * do OI cai 40% mesmo sem nenhuma posição ter sido encerrada. Só a contagem em
 * moeda responde.
 *
 * A fonte do perpétuo é a Gate e não o Binance Data Vision porque o Data Vision
 * publica o dia só depois que ele fecha — e o movimento que interessa é o de
 * hoje. A Gate é praça pequena: os NÍVEIS não batem com a Binance, a ESTRUTURA
 * sim.
 *
 * Rode com: npm run queda BTW
 */

import { balanceAt, blockNumber, blockTime, tokenInfo, toUnits, CHAINS } from "../lib/onchain";
import { liveStats } from "../lib/gate";
import { findToken } from "../lib/watchlist";

const nome = (process.argv[2] ?? "BTW").toUpperCase();
const token = findToken(nome) ?? findToken(`${nome}USDT`);
if (!token) {
  console.error(`moeda não configurada: ${nome}`);
  process.exit(1);
}

const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
const hora = (t: number) => new Date(t * 1000).toISOString().slice(5, 16).replace("T", " ");
const num = (v: number) =>
  Math.abs(v) >= 1e9 ? `${(v / 1e9).toFixed(2)}B` :
  Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` :
  Math.abs(v) >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : v.toFixed(2);
const usd = (v: number) =>
  v >= 1e6 ? `US$ ${(v / 1e6).toFixed(2)} mi` : `US$ ${(v / 1e3).toFixed(0)} mil`;

console.log(`\n=== ${token.symbol} — anatomia do movimento ===\n`);

const stats = await liveStats(token.symbol, "1h", 100);
if (stats.length < 6) {
  console.log("A Gate não lista este par, ou a API não respondeu.");
  process.exit(0);
}

const janela = stats.slice(-24);
console.log(`${stats.length} horas de leitura · última em ${hora(stats[stats.length - 1].time)} UTC\n`);
console.log(`hora UTC          preço     Δ%   OI moeda    ΔOI%    liq.comp   liq.vend  varejo  grandes`);

let precoAnt = NaN;
let oiAnt = NaN;
for (const s of janela) {
  const dp = Number.isFinite(precoAnt) ? s.price / precoAnt - 1 : 0;
  const doi = Number.isFinite(oiAnt) ? s.openInterest / oiAnt - 1 : 0;
  console.log(
    `${hora(s.time)}  ${s.price.toFixed(4).padStart(9)} ${pct(dp).padStart(6)}  ` +
      `${num(s.openInterest).padStart(9)} ${pct(doi).padStart(7)}  ` +
      `${num(s.longLiqUsd).padStart(10)} ${num(s.shortLiqUsd).padStart(10)}  ` +
      `${s.accountRatio.toFixed(2).padStart(6)}  ${s.whaleRatio.toFixed(2).padStart(7)}`,
  );
  precoAnt = s.price;
  oiAnt = s.openInterest;
}

// A perna atual: se o topo veio antes do fundo, estamos caindo.
let iTopo = 0;
let iFundo = 0;
for (const [i, s] of janela.entries()) {
  if (s.price > janela[iTopo].price) iTopo = i;
  if (s.price < janela[iFundo].price) iFundo = i;
}
const caindo = iTopo < iFundo;
const [de, ate] = caindo ? [iTopo, iFundo] : [iFundo, iTopo];
const trecho = janela.slice(de, ate + 1);

const dPreco = janela[ate].price / janela[de].price - 1;
const dOi = janela[ate].openInterest / janela[de].openInterest - 1;
const razao = dPreco !== 0 ? dOi / dPreco : 0;
const liqComp = trecho.reduce((s, r) => s + r.longLiqUsd, 0);
const liqVend = trecho.reduce((s, r) => s + r.shortLiqUsd, 0);
// Só conta o lado que o movimento força. Vendido liquidado durante uma queda é
// rastro do squeeze que a precedeu, não parte da queda.
const forcado = janela[ate].openInterestUsd > 0
  ? (caindo ? liqComp : liqVend) / janela[ate].openInterestUsd
  : 0;

console.log(`\n--- a perna atual: ${caindo ? "QUEDA" : "ALTA"} ---`);
console.log(`de ${hora(janela[de].time)} US$ ${janela[de].price.toFixed(4)} até ${hora(janela[ate].time)} US$ ${janela[ate].price.toFixed(4)}`);
console.log(`preço ${pct(dPreco)}   OI em moeda ${pct(dOi)}   razão ${razao.toFixed(2)}`);
console.log(`liquidados: comprados ${usd(liqComp)} · vendidos ${usd(liqVend)}`);
console.log(`forçado na direção do movimento: ${(forcado * 100).toFixed(1)}% do open interest`);

// -------------------------------------------------------------- na rede
if (!token.contract) {
  console.log(`\n${nome} não tem contrato configurado — só o perpétuo.\n`);
  process.exit(0);
}

const config = CHAINS[token.chain];
if (config.archiveState.length === 0) {
  console.log(`\n${token.chain} não tem nó de arquivo público; sem saldo histórico.\n`);
  process.exit(0);
}

console.log(`\n--- saldo nas corretoras, na rede (${token.chain}) ---`);

const head = await blockNumber(token.chain);
const agora = await blockTime(token.chain, head);
const inicio = janela[de].time;
const blocoInicio = Math.max(head - Math.round((agora - inicio) / config.secondsPerBlock), 1);

const info = await tokenInfo(token.chain, token.contract);
// Quente é o livro: o que está nela pode virar venda agora. Fria é custódia, e
// só chega ao livro atravessando a quente — travessia que é visível.
const quentes = token.wallets.filter(
  (w) => w.role === "exchange" && !/fria|cold/i.test(w.label),
);
const frias = token.wallets.filter(
  (w) => w.role === "exchange" && /fria|cold/i.test(w.label),
);

console.log(`bloco ${blocoInicio} (${hora(inicio)} UTC) → ${head} (agora)\n`);
console.log(`carteira                            início        agora         Δ`);

const somas = { quente: [0, 0], fria: [0, 0] };

for (const grupo of [
  { nome: "quente" as const, lista: quentes },
  { nome: "fria" as const, lista: frias },
]) {
  for (const w of grupo.lista) {
    const [a, b] = await Promise.all([
      balanceAt(token.chain, token.contract, w.address, blocoInicio).catch(() => null),
      balanceAt(token.chain, token.contract, w.address, head).catch(() => null),
    ]);
    if (a === null || b === null) {
      console.log(`${w.label.padEnd(34)} — sem leitura`);
      continue;
    }
    const antes = toUnits(a, info.decimals);
    const depois = toUnits(b, info.decimals);
    somas[grupo.nome][0] += antes;
    somas[grupo.nome][1] += depois;
    console.log(
      `${w.label.padEnd(34)} ${num(antes).padStart(9)} ${num(depois).padStart(12)} ` +
        `${pct(antes > 0 ? depois / antes - 1 : 0).padStart(9)}`,
    );
  }
}

const dQuente = somas.quente[0] > 0 ? somas.quente[1] / somas.quente[0] - 1 : 0;
const dFria = somas.fria[0] > 0 ? somas.fria[1] / somas.fria[0] - 1 : 0;
const totalAntes = somas.quente[0] + somas.fria[0];
const totalDepois = somas.quente[1] + somas.fria[1];
const dTotal = totalAntes > 0 ? totalDepois / totalAntes - 1 : 0;

console.log(`\n${"QUENTES (o livro)".padEnd(34)} ${num(somas.quente[0]).padStart(9)} ${num(somas.quente[1]).padStart(12)} ${pct(dQuente).padStart(9)}`);
console.log(`${"FRIAS (custódia)".padEnd(34)} ${num(somas.fria[0]).padStart(9)} ${num(somas.fria[1]).padStart(12)} ${pct(dFria).padStart(9)}`);
console.log(`${"TOTAL".padEnd(34)} ${num(totalAntes).padStart(9)} ${num(totalDepois).padStart(12)} ${pct(dTotal).padStart(9)}`);

// ------------------------------------------------------------- veredito
console.log(`\n--- veredito ---`);
const entrouMoeda = dQuente > 0.05;

if (caindo && razao >= 0.6) {
  console.log(
    `DESALAVANCAGEM. O OI em moeda caiu ${pct(dOi)} contra ${pct(dPreco)} de preço: a queda é\n` +
      `posição sendo encerrada no perpétuo. Não há o que procurar na rede.`,
  );
} else if (caindo && razao <= 0.25 && forcado < 0.02 && !entrouMoeda) {
  console.log(
    `LIVRO VAZIO. O preço caiu ${pct(dPreco)} com o OI intacto (${pct(dOi)}), só ${usd(liqComp)}\n` +
      `de comprados liquidados (${(forcado * 100).toFixed(1)}% do OI) e o saldo das carteiras quentes\n` +
      `em ${pct(dQuente)}. Ninguém foi liquidado, ninguém encerrou posição e ninguém entregou moeda:\n` +
      `o que sumiu foi a compra. Por isso não aparece nada na rede — não há nada para aparecer.`,
  );
} else if (caindo && entrouMoeda) {
  console.log(
    `DISTRIBUIÇÃO. Entrou moeda nas carteiras quentes (${pct(dQuente)}) durante a queda.\n` +
      `Isso é venda de verdade e vale rastrear de onde veio.`,
  );
} else if (!caindo && liqVend >= 3 * liqComp) {
  console.log(
    `SQUEEZE. A alta de ${pct(dPreco)} veio com ${usd(liqVend)} de vendidos liquidados e o OI em\n` +
      `${pct(dOi)}. A compra que subiu o preço foi forçada. Quando os vendidos acabam, o bid\n` +
      `some junto — e a queda seguinte não precisa de venda nenhuma para acontecer.`,
  );
} else {
  console.log(`Sem leitura limpa: razão ${razao.toFixed(2)}, forçado ${(forcado * 100).toFixed(1)}%, quentes ${pct(dQuente)}.`);
}
console.log();
