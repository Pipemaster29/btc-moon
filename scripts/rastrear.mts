/**
 * O dossiê completo de UMA moeda, em uma tela.
 *
 * O painel mostra 71 moedas lado a lado e por isso mostra de cada uma o que
 * cabe numa linha. Quando a pergunta deixa de ser "qual delas" e passa a ser
 * "esta aqui vai cair?", falta o resto: onde estão as paredes do livro, quanto
 * custa carregar comprado, quem está de que lado e com quanto, o que as
 * carteiras de corretora fizeram nas últimas horas.
 *
 * Nada aqui é sinal novo. É a mesma base do painel, aberta.
 *
 * Rode com: npm run rastrear 龙虾
 *           npm run rastrear BTW
 */

import { ATIVAS } from "../lib/watchlist";
import { perpSeries } from "../lib/perp";
import { velas, circulante, precoBinance } from "../lib/binance";
import { lerLivro, financiamento } from "../lib/livro";
import { lerVida, lerVies, CARTEIRAS_CEX } from "../lib/lifecycle";
import { lerMotor } from "../lib/motor";
import { concentracaoDe } from "../lib/detentores";
import { vestingDe } from "../lib/vesting";
import { readLiveFromStats } from "../lib/positioning";
import { pairsOfToken, depthOn } from "../lib/dexscreener";
import { tokenInfo, balancesOf, toUnits, blockNumber, blocosPara, scanTransfers, type Chain } from "../lib/onchain";
import { lerTecnica } from "../lib/tecnica";

const alvo = process.argv.slice(2)[0];
if (!alvo) {
  console.error("uso: npm run rastrear <TICKER>");
  process.exit(1);
}

const token = ATIVAS.find((t) => t.symbol.replace(/USDT$/, "").toUpperCase() === alvo.toUpperCase());
if (!token) {
  console.error(`"${alvo}" não está na lista. Ativas: ${ATIVAS.map((t) => t.symbol.replace(/USDT$/, "")).join(", ")}`);
  process.exit(1);
}

const ticker = token.symbol.replace(/USDT$/, "");
const usd = (v: number) =>
  v >= 1e9 ? `US$ ${(v / 1e9).toFixed(2)} bi` : v >= 1e6 ? `US$ ${(v / 1e6).toFixed(2)} mi` : v >= 1e3 ? `US$ ${(v / 1e3).toFixed(0)} mil` : `US$ ${v.toFixed(0)}`;
const pct = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%` : "—");
const hora = (t: number) => new Date(t).toISOString().slice(5, 16).replace("T", " ");
const titulo = (t: string) => console.log(`\n${"─".repeat(78)}\n${t}\n${"─".repeat(78)}`);

console.log(`\n${"═".repeat(78)}\n  ${ticker}  ·  ${token.chain}  ·  ${new Date().toISOString().slice(0, 16).replace("T", " ")} UTC\n${"═".repeat(78)}`);

const [preco, serie, diarias, livro, funding, pares] = await Promise.all([
  precoBinance(token.symbol).catch(() => null),
  perpSeries(token.symbol, "1h", 200).catch(() => []),
  velas(token.symbol, "1d", 200).catch(() => []),
  lerLivro(token.symbol).catch(() => null),
  financiamento(token.symbol, 30).catch(() => []),
  token.contract ? pairsOfToken(token.contract).catch(() => []) : Promise.resolve([]),
]);

const ultimo = serie[serie.length - 1];
const p = preco ?? ultimo?.price ?? 0;
const fundo = depthOn(pares, token.chain);
const vida = await lerVida(token, p).catch(() => null);
const circ = await circulante(token.symbol).catch(() => null);

// ───────────────────────────────────────────────────────────────── preço e ciclo
titulo("PREÇO E CICLO");
console.log(`preço            ${p}`);
if (vida) {
  console.log(`estágio          ${vida.estagio}`);
  console.log(`topo             ${vida.pico} em ${vida.picoEm} (${vida.diasDesdePico} dias) · agora a ${pct(vida.queda)} dele`);
  console.log(`desde o fundo    ${pct(vida.altaDesdeFundo)} · amplitude ${vida.amplitude.toFixed(1)}x na janela de ${vida.dias} dias`);
  if (vida.marketCap !== null) console.log(`market cap       ${usd(vida.marketCap)} · circulante ${Math.round(vida.circulante ?? 0).toLocaleString("pt-BR")}`);
}
for (const [rot, n] of [["24h", 1], ["7 dias", 7], ["30 dias", 30], ["90 dias", 90]] as const) {
  const antes = diarias[diarias.length - 1 - n];
  if (antes) console.log(`${rot.padEnd(16)} ${pct(p / antes.close - 1)}`);
}

// ───────────────────────────────────────────────────────────────── perpétuo
titulo("PERPÉTUO");
const oi = ultimo?.oiBinanceUsd || ultimo?.openInterestUsd || 0;
console.log(`open interest    ${usd(oi)}${vida?.marketCap ? ` · ${(oi / vida.marketCap * 100).toFixed(0)}% do market cap` : ""}`);
if (fundo) console.log(`OI ÷ pool        ${(oi / fundo.liquidityUsd).toFixed(1)}x  (pool ${usd(fundo.liquidityUsd)}, girando ${(fundo.volume24h / fundo.liquidityUsd).toFixed(2)}x/dia)`);
for (const [rot, n] of [["24h", 24], ["72h", 72]] as const) {
  const antes = serie[serie.length - 1 - n];
  const a = antes?.oiBinanceUsd || antes?.openInterestUsd || 0;
  if (a > 0) console.log(`OI ${rot.padEnd(13)} ${pct(oi / a - 1)}  (de ${usd(a)})`);
}
const leituraViva = readLiveFromStats(serie);
if (leituraViva?.move) console.log(`movimento        ${leituraViva.move.kind} · preço ${pct(leituraViva.move.priceChange)}`);

if (funding.length > 0) {
  const atual = funding[funding.length - 1].taxa;
  const media = funding.reduce((s, f) => s + f.taxa, 0) / funding.length;
  console.log(`financiamento    ${(atual * 100).toFixed(4)}% agora · ${(atual * 3 * 365 * 100).toFixed(0)}% ao ano se ficar assim`);
  console.log(`  média ${funding.length} períodos ${(media * 100).toFixed(4)}% · últimos 8: ${funding.slice(-8).map((f) => (f.taxa * 100).toFixed(3)).join("  ")}`);
}

// ───────────────────────────────────────────────────────────────── quem está de que lado
titulo("QUEM ESTÁ DE QUE LADO");
if (ultimo) {
  const linha = (rot: string, v: number, esq: string, dir: string) =>
    console.log(`${rot.padEnd(24)} ${v.toFixed(3).padStart(7)}   ${v > 1 ? esq : dir}`);
  linha("contas, varejo (Bnc)", ultimo.accountRatio, "mais gente comprada", "mais gente VENDIDA");
  linha("baleias, razão (Bnc)", ultimo.whaleRatio, "dinheiro grande COMPRADO", "dinheiro grande vendido");
  linha("agressão taker (Bnc)", ultimo.takerRatio, "comprador agredindo", "vendedor agredindo");
  // As duas praças são medidas SEPARADAS e podem discordar — e quando discordam,
  // isso é informação, não erro. A razão vem normalizada da Binance; o tamanho
  // absoluto só a Gate publica. Misturar as duas numa conta só daria fração
  // errada, então elas ficam rotuladas e lado a lado.
  if (ultimo.whaleLong > 0 || ultimo.whaleShort > 0) {
    const liq = ultimo.whaleNet;
    console.log(`baleias em moeda (Gate)  comprado ${Math.round(ultimo.whaleLong).toLocaleString("pt-BR")} · vendido ${Math.round(ultimo.whaleShort).toLocaleString("pt-BR")} · líquido ${liq >= 0 ? "+" : ""}${Math.round(liq).toLocaleString("pt-BR")} (${liq >= 0 ? "COMPRADAS" : "VENDIDAS"})`);
    if ((ultimo.whaleRatio > 1) !== (liq > 0)) {
      console.log(`  → as duas praças DISCORDAM: as grandes da Binance estão ${ultimo.whaleRatio > 1 ? "compradas" : "vendidas"} e as da Gate, ${liq > 0 ? "compradas" : "vendidas"}.`);
    }
  }
  if (ultimo.accountRatio > 0 && ultimo.whaleRatio > 0) {
    const div = ultimo.accountRatio < 0.8 && ultimo.whaleRatio > 1.2 ? "varejo VENDIDO contra dinheiro grande COMPRADO — combustível de squeeze"
      : ultimo.accountRatio > 1.4 && ultimo.whaleRatio < 0.9 ? "varejo COMPRADO contra dinheiro grande VENDIDO — o lado errado costuma ser o do varejo"
      : "sem divergência marcante entre varejo e dinheiro grande";
    console.log(`\n→ ${div}`);
  }
}
if (leituraViva?.whaleExit) {
  const w = leituraViva.whaleExit;
  console.log(`saída de baleia          ${w.fragile ? "SIM" : "não"} · ${(w.share * 100).toFixed(2)}% do open interest largado`);
}
const liqL = serie.slice(-24).reduce((s, x) => s + (x.longLiqUsd || 0), 0);
const liqS = serie.slice(-24).reduce((s, x) => s + (x.shortLiqUsd || 0), 0);
if (liqL + liqS > 0) console.log(`liquidações 24h (Gate)   comprados ${usd(liqL)} · vendidos ${usd(liqS)}`);

// ───────────────────────────────────────────────────────────────── livro
titulo("LIVRO DO PERPÉTUO — paredes e profundidade");
if (!livro) console.log("livro indisponível");
else {
  console.log(`meio ${livro.meio.toPrecision(6)} · spread ${(livro.spread * 100).toFixed(3)}% · retrato de ${hora(livro.quando)} UTC\n`);
  console.log("até andar    compra acumulada   venda acumulada");
  for (const f of livro.profundidade) {
    console.log(`  ${(f.faixa * 100).toFixed(1).padStart(4)}%      ${usd(f.compra).padStart(15)}   ${usd(f.venda).padStart(15)}`);
  }
  console.log(`\ndesequilíbrio em 2%: ${livro.desequilibrio.toFixed(2)} — ${livro.desequilibrio > 1.2 ? "mais compra apoiando" : livro.desequilibrio < 0.83 ? "mais VENDA no caminho" : "equilibrado"}`);

  if (livro.paredes.length === 0) console.log("\nnenhuma parede: o livro está distribuído, sem nível concentrado.");
  else {
    console.log(`\nparedes (nível ≥ ${8}x o mediano do livro):`);
    console.log("lado      preço          valor        distância");
    for (const w of livro.paredes) {
      console.log(`${w.lado.padEnd(9)} ${w.preco.toPrecision(6).padStart(10)}  ${usd(w.usd).padStart(12)}   ${pct(w.distancia).padStart(7)}  (${w.vezes.toFixed(0)}x)`);
    }
    console.log(`\n⚠️ livro é efêmero: cancelar ordem não custa nada, e parede grande é o material do spoofing.`);
  }
}

// ───────────────────────────────────────────────────────────────── técnica
titulo("RESISTÊNCIAS E SUPORTES");
if (diarias.length >= 30) {
  const tec = lerTecnica(diarias.map((v) => ({ close: v.close, high: v.high, low: v.low })));
  if (tec) {
    console.log(`tendência        ${tec.emBaixa ? "de baixa" : "não está em baixa"}${tec.rompeu ? " · ROMPEU para cima" : ""}`);
    console.log(`vs média de 20   ${pct(tec.vsMedia20 - 1)}`);
    console.log(`topos descendentes ${tec.toposDescendentes}`);
    if (tec.resistencia) console.log(`resistência mais próxima acima: ${tec.resistencia} (${pct(tec.ateResistencia ?? NaN)} daqui)`);
  }
  // Máximas e mínimas recentes, que é o que dá referência de onde o preço parou.
  for (const n of [7, 30, 90]) {
    const j = diarias.slice(-n);
    if (j.length < n) continue;
    const hi = Math.max(...j.map((v) => v.high)), lo = Math.min(...j.map((v) => v.low));
    console.log(`${String(n).padStart(3)} dias         máxima ${hi.toPrecision(6)} (${pct(p / hi - 1)})   mínima ${lo.toPrecision(6)} (${pct(p / lo - 1)})`);
  }
}
if (vida?.virada) console.log(`\nvirada da leitura: em ${vida.virada.preco.toPrecision(6)} (${pct(vida.virada.distancia)}) esta moeda passa a "${vida.virada.para}"`);

// ───────────────────────────────────────────────────────────────── on-chain
titulo("ON-CHAIN");
if (!token.contract) console.log("sem contrato conferido — só o lado dos derivativos.");
else {
  const info = await tokenInfo(token.chain as Chain, token.contract);
  const supply = toUnits(info.totalSupply, info.decimals);
  const saldos = await balancesOf(token.chain as Chain, token.contract, [...CARTEIRAS_CEX]);
  let cex = 0;
  const detalhe: [string, number][] = [];
  for (const a of CARTEIRAS_CEX) {
    const v = toUnits(saldos.get(a.toLowerCase()) ?? BigInt(0), info.decimals);
    cex += v;
    if (v > 0) detalhe.push([a, v]);
  }
  console.log(`contrato         ${token.contract}`);
  console.log(`supply           ${Math.round(supply).toLocaleString("pt-BR")}${circ ? ` · circulante ${Math.round(circ.atual).toLocaleString("pt-BR")} (${(circ.atual / supply * 100).toFixed(0)}%)` : " · circulante não publicado"}`);
  console.log(`em corretora     ${Math.round(cex).toLocaleString("pt-BR")} = ${(cex / supply * 100).toFixed(2)}% do supply${vida?.marketCap ? ` ≈ ${usd(cex * p)}` : ""}`);
  for (const [a, v] of detalhe.sort((x, y) => y[1] - x[1])) {
    console.log(`   ${a}  ${Math.round(v).toLocaleString("pt-BR").padStart(16)}  ${(v / supply * 100).toFixed(2)}%  ≈ ${usd(v * p)}`);
  }

  const motor = await lerMotor(
    token.chain,
    token.contract,
    circ?.atual ?? null,
    true,
    oi,
    fundo?.liquidityUsd ?? 0,
    fundo?.volume24h ?? 0,
    await concentracaoDe(token.symbol),
    null,
    (await vestingDe(token.symbol))?.ritmo ?? null,
  ).catch(() => null);
  if (motor) {
    console.log(`\nonde está o supply   fora de corretora e de pool ${((motor.privado ?? 0) * 100).toFixed(1)}% · em corretora ${((motor.emCorretora ?? 0) * 100).toFixed(1)}% · em pool ${((motor.emPool ?? 0) * 100).toFixed(1)}% (${motor.pools} pares)`);
    console.log(`motor                ${motor.motores}/${motor.medidos} — ${motor.resumo}`);
  }

  if (circ?.saltos.length) {
    console.log(`\nsaltos de circulante (unlock) nos últimos 30 dias:`);
    for (const s of circ.saltos) console.log(`   ${new Date(s.quando).toISOString().slice(0, 10)}  ${pct(s.variacao)}  ${Math.round(s.de).toLocaleString("pt-BR")} → ${Math.round(s.para).toLocaleString("pt-BR")}`);
  } else console.log(`\nnenhum unlock nos últimos 30 dias.`);

  // O fluxo das últimas horas para dentro e para fora das corretoras. É a
  // pergunta que o saldo sozinho não responde: 25% parado há meses é uma
  // coisa, 25% que chegou ontem é outra completamente diferente.
  try {
    // Com o filtro por ENDEREÇO em vez de varredura cega: 24 horas de BSC sem
    // filtro estoura o limite do nó ("limit exceeded"), e o que interessa aqui
    // são só as transferências que tocam carteira de corretora.
    const topo = await blockNumber(token.chain as Chain);
    const janela = blocosPara(token.chain as Chain, 24);
    const { transfers: movs, failed } = await scanTransfers({
      chain: token.chain as Chain,
      token: token.contract,
      fromBlock: topo - janela,
      toBlock: topo,
      involving: [...CARTEIRAS_CEX],
    });
    const cexSet = new Set(CARTEIRAS_CEX.map((a) => a.toLowerCase()));
    let entrou = 0, saiu = 0;
    const grandes: { de: string; para: string; qtd: number }[] = [];
    for (const m of movs) {
      const q = toUnits(m.value, info.decimals);
      const dentro = cexSet.has(m.to.toLowerCase()), fora = cexSet.has(m.from.toLowerCase());
      if (dentro && !fora) entrou += q;
      if (fora && !dentro) saiu += q;
      if (q * p >= 50_000) grandes.push({ de: m.from, para: m.to, qtd: q });
    }
    console.log(`\nfluxo para corretora, últimas 24h:`);
    if (failed > 0) {
      // Sem isto o número mente com cara de medida. Duas execuções minutos uma
      // da outra devolveram 413 e 179 transferências para a MESMA janela, e a
      // diferença eram faixas que falharam em silêncio.
      console.log(`   ⚠️ ${failed} faixa(s) falharam — os números abaixo são PISO, não medida.`);
    }
    console.log(`   entrou ${Math.round(entrou).toLocaleString("pt-BR")} (${usd(entrou * p)}) · saiu ${Math.round(saiu).toLocaleString("pt-BR")} (${usd(saiu * p)}) · líquido ${entrou - saiu >= 0 ? "+" : ""}${Math.round(entrou - saiu).toLocaleString("pt-BR")} (${usd(Math.abs(entrou - saiu) * p)} ${entrou - saiu >= 0 ? "chegando" : "saindo"})`);
    console.log(`   ${movs.length.toLocaleString("pt-BR")} transferências tocando corretora na janela · ${grandes.length} acima de US$ 50 mil`);
    for (const g of grandes.sort((a, b) => b.qtd - a.qtd).slice(0, 8)) {
      const rot = cexSet.has(g.para.toLowerCase()) ? "→ CORRETORA" : cexSet.has(g.de.toLowerCase()) ? "← da corretora" : "  entre carteiras";
      console.log(`   ${rot.padEnd(18)} ${Math.round(g.qtd).toLocaleString("pt-BR").padStart(14)}  ${usd(g.qtd * p).padStart(12)}  ${g.de.slice(0, 10)}… → ${g.para.slice(0, 10)}…`);
    }
  } catch (e) {
    console.log(`\nfluxo para corretora: não deu para varrer (${e instanceof Error ? e.message : e})`);
  }
}

// ───────────────────────────────────────────────────────────────── veredito
titulo("LEITURA");
if (vida) {
  const motor = await lerMotor(
    token.chain,
    token.contract,
    circ?.atual ?? null,
    true,
    oi,
    fundo?.liquidityUsd ?? 0,
    fundo?.volume24h ?? 0,
    await concentracaoDe(token.symbol),
    null,
    (await vestingDe(token.symbol))?.ritmo ?? null,
  ).catch(() => null);
  const leitura = lerVies(vida, {
    moveKind: leituraViva?.move?.kind ?? null,
    moveChange: leituraViva?.move?.priceChange ?? 0,
    whaleExiting: Boolean(leituraViva?.whaleExit?.fragile),
    oiChange72h: leituraViva?.oiChange72h ?? NaN,
    perpDominance: fundo && fundo.liquidityUsd > 0 ? oi / fundo.liquidityUsd : 0,
    motores: motor?.motores ?? 0,
    motoresMedidos: motor?.medidos ?? 0,
    concentracao: motor?.concentracao ?? null,
    perfil: null,
    perfilR: null,
    perfilLag: null,
    perfilSigmas: null,
    emissao: motor?.emissao ?? null,
    accountRatio: ultimo?.accountRatio ?? 0,
    whaleRatio: ultimo?.whaleRatio ?? 0,
    openInterestUsd: oi,
  });
  console.log(`${leitura.vies.toUpperCase()} · força ${leitura.forca}/3 — ${leitura.titulo}\n`);
  console.log(leitura.porque.replace(/(.{92}\S*)\s/g, "$1\n"));
  console.log(`\nvale até: ${leitura.ateQuando}`);
} else console.log("sem histórico suficiente para classificar.");
console.log();
