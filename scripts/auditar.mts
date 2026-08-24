/**
 * Confere se cada contrato da lista ainda mede a moeda inteira.
 *
 * Nasceu de nove erros de uma vez. O teste de coerência de supply — contrato não
 * pode guardar menos do que circula — só passou a existir depois que boa parte
 * da lista já estava montada, e ninguém tinha voltado para reconferir o que
 * havia entrado antes dele. Nove moedas apontavam para fragmento de ponte: a DOS
 * lia um contrato com 32,9 milhões de tokens contra 200 milhões circulando, 3%
 * da moeda, e a "concentração" que aparecia ali era a carteira quente da Binance
 * dentro daquele pedaço.
 *
 * O estrago é sempre o mesmo e sempre invisível: todo número de "% do supply"
 * sai de uma divisão pelo supply do contrato, então num fragmento cada leitura
 * de oferta em corretora, de float e de concentração vem inflada — e inflada de
 * um jeito que parece perfeitamente plausível.
 *
 * Isto é barato: uma chamada de RPC e uma da Binance por moeda, sem DexScreener.
 * Vale rodar depois de mexer na lista.
 *
 * Rode com: npm run auditar
 */

import { ATIVAS } from "../lib/watchlist";
import { tokenInfo, toUnits } from "../lib/onchain";
import { circulante } from "../lib/binance";
import type { Chain } from "../lib/onchain";

/** Mesma margem do descobrir: o circulante é publicado por terceiro e atrasa. */
const COERENCIA_MINIMA = 0.9;

const comContrato = ATIVAS.filter((t) => t.contract);
console.log(`\nauditando ${comContrato.length} moedas com contrato\n`);
console.log("moeda      rede      supply do contrato       circulante        razão");
console.log("-".repeat(78));

const fragmentos: string[] = [];
const semTeste: string[] = [];
const erros: string[] = [];

const linhas = await Promise.all(
  comContrato.map(async (t) => {
    const ticker = t.symbol.replace(/USDT$/, "");
    try {
      const [info, circ] = await Promise.all([
        tokenInfo(t.chain as Chain, t.contract),
        circulante(t.symbol).catch(() => null),
      ]);
      const total = toUnits(info.totalSupply, info.decimals);

      if (!circ || circ.atual <= 0) {
        semTeste.push(ticker);
        return `${ticker.padEnd(10)} ${t.chain.padEnd(9)} ${Math.round(total).toLocaleString().padStart(20)}   sem circulante publicado — teste não roda`;
      }

      const razao = total / circ.atual;
      if (razao < COERENCIA_MINIMA) fragmentos.push(ticker);
      return (
        `${ticker.padEnd(10)} ${t.chain.padEnd(9)} ${Math.round(total).toLocaleString().padStart(20)} ` +
        `${Math.round(circ.atual).toLocaleString().padStart(17)} ${razao.toFixed(2).padStart(8)}` +
        (razao < COERENCIA_MINIMA ? "  <<< FRAGMENTO" : "")
      );
    } catch (e) {
      erros.push(ticker);
      return `${ticker.padEnd(10)} ${t.chain.padEnd(9)} ERRO: ${e instanceof Error ? e.message : e}`;
    }
  }),
);

for (const l of linhas.sort()) console.log(l);

console.log();
if (fragmentos.length > 0) {
  console.log(`FRAGMENTOS (${fragmentos.length}): ${fragmentos.join(", ")}`);
  console.log(`Rode "npm run descobrir ${fragmentos.join(" ")}" para achar o contrato principal.`);
} else {
  console.log("Nenhum fragmento: todo contrato da lista mede a moeda inteira.");
}
if (semTeste.length > 0) console.log(`sem circulante publicado (${semTeste.length}): ${semTeste.join(", ")}`);
if (erros.length > 0) console.log(`não responderam (${erros.length}): ${erros.join(", ")}`);

process.exit(fragmentos.length > 0 ? 1 : 0);
