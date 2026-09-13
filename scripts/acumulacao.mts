/**
 * A fila de eventos de volume: em que moeda da lista alguém movimentou muito.
 *
 * É a resposta à pergunta "achar outras como o MOVR", e ela vem com a metade que
 * a pergunta não traz. O evento é FATO: num dia qualquer, o volume de uma moeda
 * foi dezenas de vezes o normal dela. O que a medição diz sobre COMPRAR por
 * causa disso está em `lib/acumulacao.ts` e em `npm run aferir-acumulacao`, e é
 * negativo em toda configuração testada — inclusive na configuração exata que a
 * tese descreve, volume recorde com o preço parado.
 *
 * Por isso esta lista ordena por tamanho do evento e NÃO emite lado. Ela serve
 * para saber onde olhar, igual ao garimpo. O passo seguinte de qualquer linha
 * daqui é `npm run radar TICKER`, não uma ordem.
 *
 * As colunas:
 *
 *   salto     volume do dia do evento ÷ mediana dos 90 dias anteriores A ELE
 *   quando    há quantos dias foi
 *   no dia    quanto o preço andou NO dia do evento (abre → fecha)
 *   depois    quanto o preço andou DESDE o evento até agora
 *   agora     volume do último dia ÷ mediana de 90 dias: o volume voltou?
 *   vs VWAP   preço contra o preço médio que o dinheiro pagou em 90 dias
 *   compra    fração agressiva compradora no dia do evento — sempre ~0,50
 *
 * A coluna `compra` está aí para ser vista colada em 0,50 moeda após moeda. É a
 * medição do item 3 do `lib/acumulacao.ts`: no perpétuo toda negociação tem os
 * dois lados, então "houve compra pesada" não é leitura que este dado sustente.
 *
 * CUSTO: o mesmo do `npm run estagio`, porque roda sobre as barras que `lerVida`
 * já carrega. Nenhuma requisição a mais.
 *
 * Rode com: npm run acumulacao
 */

import { lerVida, type Vida } from "../lib/lifecycle";
import { getOverview } from "../lib/overview";
import { ATIVAS } from "../lib/watchlist";
import { SALTO_NOTAVEL, vereditoDoEvento } from "../lib/acumulacao";

const overview = await getOverview();
const preco = new Map(overview.map((r) => [r.symbol, r.price]));

const vidas = (
  await Promise.all(ATIVAS.map((t) => lerVida(t, preco.get(t.symbol) ?? 0).catch(() => null)))
).filter((v): v is Vida => v !== null);

const comEvento = vidas
  .filter((v) => v.acumulacao !== null)
  .sort((a, b) => (b.acumulacao?.salto ?? 0) - (a.acumulacao?.salto ?? 0));

const semBase = vidas.length - comEvento.length;

const pct = (v: number) =>
  Number.isFinite(v) ? `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(0)}%` : "—";
const num = (v: number | null, casas = 1) =>
  v !== null && Number.isFinite(v) ? v.toFixed(casas) : "—";

console.log(
  `\n${vidas.length} moedas lidas · ${semBase} sem os 90 dias de base para medir salto\n`,
);
console.log(
  "moeda        salto   quando     no dia   depois    agora   vs VWAP   compra",
);
console.log("".padEnd(78, "-"));

for (const v of comEvento) {
  const a = v.acumulacao!;
  console.log(
    v.ticker.padEnd(12) +
      `${num(a.salto)}x`.padStart(6) +
      `${a.diasDesde}d`.padStart(9) +
      pct(a.moveuNoDia).padStart(9) +
      pct(a.desdeEntao).padStart(9) +
      `${num(a.agora)}x`.padStart(9) +
      pct(a.desconto).padStart(10) +
      num(a.pressao, 3).padStart(9),
  );
}

// ------------------------------------------------------- o que a medição diz
//
// Fica DEPOIS da tabela e não antes, de propósito: quem lê a tabela lê isto
// junto, e o corte de `SALTO_NOTAVEL` decide de quem se está falando.

const notaveis = comEvento.filter((v) => (v.acumulacao?.salto ?? 0) >= SALTO_NOTAVEL);

console.log(`\n${"=".repeat(78)}`);
console.log(
  `${notaveis.length} moedas com evento acima de ${SALTO_NOTAVEL}x. O que isso vale, medido:`,
);
console.log("=".repeat(78));

for (const v of notaveis) {
  const frase = vereditoDoEvento(v.acumulacao);
  if (frase) console.log(`\n${v.ticker} · ${frase}`);
}

console.log(
  `\n${"─".repeat(78)}\n` +
    "Esta fila é de INVESTIGAÇÃO, igual à do garimpo. O salto de volume foi medido\n" +
    "sobre 512 perpétuos e 354 mil observações e prevê QUEDA, mais quanto maior o\n" +
    "salto — e o filtro de 'preço parado no dia', que é a versão otimista da tese,\n" +
    "suaviza sem inverter. Refaça a medição com `npm run aferir-acumulacao`.\n" +
    "O próximo passo de qualquer linha daqui é `npm run radar TICKER`.",
);
