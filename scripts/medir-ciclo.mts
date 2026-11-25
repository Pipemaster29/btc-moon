/**
 * O padrão dos 1.064 / 364 dias funciona? (`lib/cicloBtc.ts`)
 *
 * Roda a versão que se corrige pelo preço, o calendário literal do post e o
 * "comprar e segurar", todos com US$ 10.000 na semente (30/11/2013), sobre os
 * fechamentos diários da Bitstamp. Depois roda a GRADE das peças que a regra
 * tem — antecedência da busca e os dois gatilhos —, para se ver onde a
 * publicada cai entre as variações e se o resultado é de uma escolha ou de um
 * platô.
 *
 * Grava `data/ciclo-medicao.json`, que a aba Bitcoin lê. Fica no `main`,
 * gerado à mão.
 *
 * Rode com: npm run medir-ciclo
 */
import { writeFileSync } from "node:fs";
import { getCandles } from "../lib/bitstamp";
import {
  CAPITAL_INICIAL,
  REGRAS_CICLO,
  SEMENTE,
  diasDasVelas,
  pernas,
  quedaMaxima,
  simularAdaptativo,
  simularCalendario,
  simularMedia,
  simularComVendida,
  financiamentoDiario,
  REGRAS_VENDIDA,
  type RegrasVendida,
  simularSegurar,
  type RegrasCiclo,
} from "../lib/cicloBtc";

const dias = diasDasVelas(await getCandles("1d"));
const data = (t: number) => new Date(t * 1000).toISOString().slice(0, 10);
const usd = (v: number) => `US$ ${Math.round(v).toLocaleString("pt-BR")}`;
const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

console.log(`\n${dias.length} dias da Bitstamp, ${data(dias[0].t)} a ${data(dias.at(-1)!.t)}; semente ${data(SEMENTE.t)}`);

const adapt = simularAdaptativo(dias);
const cal = simularCalendario(dias);
const segurar = simularSegurar(dias);
const finalSegurar = segurar.at(-1)!.patrimonio;

console.log("\nos extremos que a regra confirmou");
for (const e of adapt.extremos) {
  console.log(
    `  ${e.tipo.padEnd(5)} ${data(e.t)} ${usd(e.preco).padStart(12)}  ${String(e.dias).padStart(5)} d  (calendário: ${data(e.previsto)})  confirmado ${data(e.confirmadoEm)}`,
  );
}
console.log("\nas operações da versão que se corrige");
for (const m of adapt.marcas) console.log(`  ${data(m.t)} ${m.tipo.padEnd(11)} ${usd(m.preco).padStart(12)}  patrimônio ${usd(m.patrimonio)}`);
console.log("\nas operações do calendário");
for (const m of cal.marcas) console.log(`  ${data(m.t)} ${m.tipo.padEnd(11)} ${usd(m.preco).padStart(12)}  patrimônio ${usd(m.patrimonio)}`);

const linha = (nome: string, final: number, q: number) =>
  console.log(`  ${nome.padEnd(22)} ${usd(final).padStart(16)}  ${(final / CAPITAL_INICIAL).toFixed(1).padStart(6)}x  queda máx ${pct(q)}`);
console.log("\nUS$ 10.000 em 30/11/2013");
linha("se corrige pelo preço", adapt.final, quedaMaxima(adapt.curva));
linha("calendário do post", cal.final, quedaMaxima(cal.curva));
linha("comprar e segurar", finalSegurar, quedaMaxima(segurar));

// O estado agora.
const e = adapt.estado;
console.log(
  `\nhoje: procurando ${e.procurando}, ${e.comprado ? "comprado" : "em caixa"}; âncora ${e.ancora.tipo} ${data(e.ancora.t)} a ${usd(e.ancora.preco)}; ` +
    `busca abre ${data(e.abre)}; candidato ${e.candidato ? `${data(e.candidato.t)} a ${usd(e.candidato.preco)}` : "—"}; gatilho ${e.gatilho ? usd(e.gatilho) : "—"}; depois ${data(e.depois)}`,
);

// A grade: 4 antecedências × 4 subidas × 4 quedas = 64 variações, com a venda
// e a média da publicada (o −20% da grade é o da queda; a EMA vale junto).
const ANTECEDENCIAS = [0, 30, 60, 90];
const SUBIDAS = [0.1, 0.2, 0.3, 0.5];
const QUEDAS = [0.1, 0.2, 0.3, 0.5];
const grade: { antecedencia: number; subida: number; queda: number; final: number; queda_max: number; batesegurar: boolean; publicada: boolean }[] = [];
for (const antecedencia of ANTECEDENCIAS)
  for (const subida of SUBIDAS)
    for (const queda of QUEDAS) {
      const r: RegrasCiclo = { ...REGRAS_CICLO, antecedencia, subidaConfirma: subida, quedaConfirma: queda };
      const s = simularAdaptativo(dias, r);
      grade.push({
        antecedencia,
        subida,
        queda,
        final: s.final,
        queda_max: quedaMaxima(s.curva),
        batesegurar: s.final > finalSegurar,
        publicada: antecedencia === REGRAS_CICLO.antecedencia && subida === REGRAS_CICLO.subidaConfirma && queda === REGRAS_CICLO.quedaConfirma,
      });
    }
const ordenada = [...grade].sort((a, b) => b.final - a.final);
const posicao = ordenada.findIndex((g) => g.publicada) + 1;
const finais = grade.map((g) => g.final).sort((a, b) => a - b);
const mediana = finais[Math.floor(finais.length / 2)];
const bate = grade.filter((g) => g.batesegurar).length;
console.log(
  `\na grade: ${grade.length} variações; a publicada é a ${posicao}ª; mediana ${usd(mediana)}; pior ${usd(finais[0])}; melhor ${usd(finais.at(-1)!)}; ${bate} batem o segurar`,
);
console.log("  antecedência × (subida, queda) — o patrimônio final em milhares");
for (const a of ANTECEDENCIAS) {
  const cel = grade.filter((g) => g.antecedencia === a).map((g) => `${(g.final / 1000).toFixed(0)}${g.publicada ? "*" : ""}`.padStart(7));
  console.log(`  ${String(a).padStart(3)} d  ${cel.join("")}`);
}

// As médias (pedido de 24/11, tarde: "pega a EMA de 200, candle, variação %").
// Cada linha com as duas metades, cortadas em 01/01/2020, contra o segurar.
const CORTE = Date.UTC(2020, 0, 1) / 1000;
function metades(curva: { t: number; patrimonio: number }[]): [number, number] {
  const i = curva.findIndex((p) => p.t >= CORTE);
  return [curva[i].patrimonio / curva[0].patrimonio, curva.at(-1)!.patrimonio / curva[i].patrimonio];
}
const medias: { nome: string; final: number; queda: number; operacoes: number; antes2020: number; desde2020: number; publicada: boolean }[] = [];
const linhaMedia = (nome: string, curva: { t: number; patrimonio: number }[], operacoes: number, publicada = false) => {
  const [a, b] = metades(curva);
  medias.push({ nome, final: curva.at(-1)!.patrimonio, queda: quedaMaxima(curva), operacoes, antes2020: a, desde2020: b, publicada });
};
linhaMedia("comprar e segurar", segurar, 1);
for (const n of [50, 100, 200]) {
  const c = simularMedia(dias, n);
  linhaMedia(`EMA ${n} sozinha, sem calendário`, c, c.operacoes ?? 0);
}
const COMBOS: [RegrasCiclo["compra"], RegrasCiclo["venda"], string][] = [
  ["subida", "queda", "compra +20%, venda −20%"],
  ["subida", "media", "compra +20%, venda abaixo da EMA 200"],
  ["subida", "primeiro", "compra +20%, venda −20% ou abaixo da EMA 200"],
  ["media", "media", "compra e venda pela EMA 200"],
  ["media", "primeiro", "compra pela EMA 200, venda −20% ou EMA"],
  ["ambos", "primeiro", "compra +20% e acima da EMA, venda −20% ou EMA"],
];
for (const [compra, venda, nome] of COMBOS) {
  const r = simularAdaptativo(dias, { ...REGRAS_CICLO, compra, venda });
  linhaMedia(`calendário: ${nome}`, r.curva, r.marcas.length, compra === REGRAS_CICLO.compra && venda === REGRAS_CICLO.venda);
}
for (const n of [50, 100, 150, 250, 300]) {
  const r = simularAdaptativo(dias, { ...REGRAS_CICLO, emaDias: n });
  linhaMedia(`calendário: a publicada com EMA ${n}`, r.curva, r.marcas.length);
}
console.log("\nas médias (US$ 10 mil em 30/11/2013; metades cortadas em 01/01/2020)");
for (const m of medias)
  console.log(
    `  ${(m.publicada ? "* " : "  ") + m.nome.padEnd(58)} ${usd(m.final).padStart(16)}  ${pct(m.queda).padStart(7)}  ${String(m.operacoes).padStart(4)} ops  ${m.antes2020.toFixed(1).padStart(6)}x  ${m.desde2020.toFixed(1).padStart(5)}x`,
  );

// A VENDIDA (25/11): ganhar na queda, e não só ficar fora dela. O financiamento
// real do BTCUSDT vem da Binance (sem chave), desde 10/09/2019; antes disso não
// havia perpétuo, e o vendido PAGA 0,01% a cada 8 h — o pior caso.
const cobrancas: { t: number; r: number }[] = [];
for (let inicio = Date.UTC(2019, 8, 1), i = 0; i < 30; i++) {
  const res = await fetch(`https://www.binance.com/fapi/v1/fundingRate?symbol=BTCUSDT&limit=1000&startTime=${inicio}`);
  if (!res.ok) throw new Error(`financiamento: a Binance respondeu ${res.status} — sem ele a vendida não é medida`);
  const lote = (await res.json()) as { fundingTime: number; fundingRate: string }[];
  for (const c of lote) cobrancas.push({ t: c.fundingTime, r: Number(c.fundingRate) });
  if (lote.length < 1000) break;
  inicio = lote.at(-1)!.fundingTime + 1;
}
const ANTES_DO_PERPETUO = -0.0003;
const taxa = financiamentoDiario(cobrancas, ANTES_DO_PERPETUO);
const porDia = new Map<number, number>();
for (const c of cobrancas) {
  const dia = Math.floor(c.t / 1000 / 86_400) * 86_400;
  porDia.set(dia, (porDia.get(dia) ?? 0) + c.r);
}
writeFileSync("data/btc-financiamento-diario.json", JSON.stringify({ fonte: "Binance BTCUSDT /fapi/v1/fundingRate", antes: ANTES_DO_PERPETUO, dias: [...porDia].map(([t, r]) => [t, Number(r.toFixed(7))]) }));

const D17 = Date.UTC(2017, 0, 1) / 1000;
const vendidas: { nome: string; final: number; queda17: number; antes2020: number; desde2020: number; pernas: number; positivas: number; piorContra: number; publicada: boolean }[] = [];
const linhaVendida = (nome: string, v: Partial<RegrasVendida>, regras: RegrasCiclo = REGRAS_CICLO) => {
  const r = simularComVendida(dias, regras, { ...REGRAS_VENDIDA, ...v }, taxa);
  const [a, b] = metades(r.curva);
  const publicada = regras === REGRAS_CICLO && Object.entries(v).every(([k, x]) => (REGRAS_VENDIDA as unknown as Record<string, unknown>)[k] === x);
  vendidas.push({
    nome,
    final: r.final,
    queda17: quedaMaxima(r.curva.filter((p) => p.t >= D17)),
    antes2020: a,
    desde2020: b,
    pernas: r.pernas.length,
    positivas: r.pernas.filter((p) => p.retorno > 0).length,
    piorContra: Math.max(0, ...r.pernas.map((p) => p.piorContra)),
    publicada,
  });
  return r;
};
linhaVendida("sem vendida", { alavancagem: 0 });
const publicada = linhaVendida("vendido 1x no urso inteiro", { modo: "urso", alavancagem: 1 });
linhaVendida("vendido 1x, só abaixo da EMA 200", { alavancagem: 1, soAbaixoDaEma: true });
linhaVendida("vendido 2x no urso inteiro", { alavancagem: 2 });
linhaVendida("vendido 3x no urso inteiro", { alavancagem: 3 });
for (const i of [200, 250, 300, 340]) linhaVendida(`vendido 1x só do dia ${i} do urso em diante`, { modo: "capitulacao", inicioDias: i, alavancagem: 1 });
linhaVendida("vendido 1x, com a venda antiga (só −20%)", { alavancagem: 1 }, { ...REGRAS_CICLO, venda: "queda" });
console.log("\na vendida (financiamento real desde 09/2019; antes, o vendido paga 0,01%/8 h)");
for (const v of vendidas)
  console.log(
    `  ${(v.publicada ? "* " : "  ") + v.nome.padEnd(44)} ${usd(v.final).padStart(18)}  queda desde 2017 ${pct(v.queda17).padStart(7)}  ${v.antes2020.toFixed(0).padStart(4)}x ${v.desde2020.toFixed(1).padStart(6)}x  pernas ${v.positivas}/${v.pernas}  pior contra +${(v.piorContra * 100).toFixed(0)}%`,
  );
console.log("  as pernas da publicada:");
for (const p of publicada.pernas)
  console.log(`    ${data(p.de)} → ${p.ate ? data(p.ate) : "aberta"}  ${usd(p.entrada)} → ${usd(p.saida)}  ${pct(p.retorno)}  pior contra +${(p.piorContra * 100).toFixed(0)}%  financiamento ${pct(p.financiamento)}`);

// A vendida na grade: ela melhora QUALQUER variação, ou só a escolhida?
let melhora = 0;
let pernasPos = 0;
let pernasTot = 0;
let piorContraGrade = 0;
const razoes: number[] = [];
for (const antecedencia of ANTECEDENCIAS)
  for (const subida of SUBIDAS)
    for (const queda of QUEDAS) {
      const r: RegrasCiclo = { ...REGRAS_CICLO, antecedencia, subidaConfirma: subida, quedaConfirma: queda };
      const sem = simularAdaptativo(dias, r).final;
      const com = simularComVendida(dias, r, REGRAS_VENDIDA, taxa);
      if (com.final > sem) melhora++;
      razoes.push(com.final / sem);
      for (const p of com.pernas) {
        pernasTot++;
        if (p.retorno > 0) pernasPos++;
        piorContraGrade = Math.max(piorContraGrade, p.piorContra);
      }
    }
razoes.sort((a, b) => a - b);
const vendidaGrade = { melhora, variacoes: razoes.length, pior: razoes[0], mediana: razoes[Math.floor(razoes.length / 2)], melhor: razoes.at(-1)!, pernasPos, pernasTot, piorContra: piorContraGrade };
console.log(
  `  na grade: a vendida 1x melhora ${melhora} de ${razoes.length}; multiplica o final por ${vendidaGrade.pior.toFixed(2)} a ${vendidaGrade.melhor.toFixed(2)} (mediana ${vendidaGrade.mediana.toFixed(2)}); pernas positivas ${pernasPos}/${pernasTot}; pior contra +${(piorContraGrade * 100).toFixed(0)}%`,
);

writeFileSync(
  "data/ciclo-medicao.json",
  JSON.stringify(
    {
      geradoEm: new Date().toISOString(),
      fonte: "Bitstamp, fechamentos diários",
      ate: dias.at(-1)!.t,
      regras: REGRAS_CICLO,
      semente: SEMENTE,
      capital: CAPITAL_INICIAL,
      adaptativo: { final: adapt.final, quedaMaxima: quedaMaxima(adapt.curva), marcas: adapt.marcas, extremos: adapt.extremos, pernas: pernas(adapt.marcas).map((p) => ({ de: p.de.t, ate: p.ate?.t ?? null, retorno: p.retorno })) },
      calendario: { final: cal.final, quedaMaxima: quedaMaxima(cal.curva), marcas: cal.marcas },
      segurar: { final: finalSegurar, quedaMaxima: quedaMaxima(segurar) },
      medias,
      vendida: { regras: REGRAS_VENDIDA, linhas: vendidas, pernas: publicada.pernas, grade: vendidaGrade, final: publicada.final },
      grade: { variacoes: grade.length, posicao, mediana, pior: finais[0], melhor: finais.at(-1), batemSegurar: bate, celulas: grade },
    },
    null,
    1,
  ),
);
console.log("\ngravado data/ciclo-medicao.json");
