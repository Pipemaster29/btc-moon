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

// A grade: 4 antecedências × 4 subidas × 4 quedas = 64 variações.
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
      grade: { variacoes: grade.length, posicao, mediana, pior: finais[0], melhor: finais.at(-1), batemSegurar: bate, celulas: grade },
    },
    null,
    1,
  ),
);
console.log("\ngravado data/ciclo-medicao.json");
