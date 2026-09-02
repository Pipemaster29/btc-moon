/**
 * Roda a carteira sobre o histórico e grava o estado.
 *
 * Roda junto com `npm run panorama`, depois dele, porque consome as linhas que
 * ele acabou de gravar. As regras todas moram em `lib/carteira.ts`; aqui só há
 * leitura de arquivo e o relatório de terminal.
 *
 * Rode com: npm run carteira
 */

import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { rodar, CAPITAL_INICIAL, type Emissao } from "../lib/carteira";

/**
 * Quando a carteira começou a valer.
 *
 * Fixo no código, e não "agora", porque o motor precisa ser reprodutível: rodar
 * duas vezes tem de dar o mesmo resultado, senão o número na tela muda sozinho a
 * cada execução e não significa nada.
 *
 * A data é a da primeira execução com a força da call já gravada no histórico —
 * antes disso não há como dimensionar posição.
 */
const COMECO = Date.parse("2026-09-02T20:00:00Z");

const dir = "data";
const arquivos = (await readdir(dir)).filter((f) => /^historico-\d{4}-\d{2}\.jsonl$/.test(f));

const emissoes: Emissao[] = [];
for (const f of arquivos.sort()) {
  const texto = await readFile(`${dir}/${f}`, "utf8");
  for (const linha of texto.split("\n")) {
    if (!linha.trim()) continue;
    try {
      emissoes.push(JSON.parse(linha) as Emissao);
    } catch {
      // Linha truncada por escrita concorrente: perder uma é melhor do que
      // derrubar a leitura das outras vinte mil.
    }
  }
}

const c = rodar(emissoes, COMECO);

const usd = (v: number) => `US$ ${v.toFixed(2)}`;
const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

console.log(`\ncarteira desde ${new Date(COMECO).toISOString().slice(0, 16).replace("T", " ")} UTC`);
console.log(`emissões lidas: ${emissoes.length}\n`);
console.log(`patrimônio   ${usd(c.patrimonio)}  (${pct(c.retorno)} sobre ${usd(CAPITAL_INICIAL)})`);
console.log(`caixa        ${usd(c.caixa)}`);
console.log(`exposto      ${usd(c.patrimonio - c.caixa)} em ${c.abertas.length} posições`);

if (c.abertas.length > 0) {
  console.log(`\nabertas`);
  for (const p of c.abertas) {
    console.log(
      `  ${p.symbol.padEnd(10)} ${p.lado.padEnd(6)} f${p.forca}  ` +
        `${usd(p.valor).padStart(9)} → ${usd(p.valor * (1 + p.retorno)).padStart(9)}  ${pct(p.retorno)}`,
    );
  }
}

if (c.encerradas > 0) {
  console.log(`\nencerradas: ${c.encerradas} · ${c.acertos} no positivo (${((c.acertos / c.encerradas) * 100).toFixed(0)}%)`);
  for (const [motivo, g] of Object.entries(c.porMotivo)) {
    console.log(`  ${motivo.padEnd(14)} ${String(g.n).padStart(3)} · média ${pct(g.retornoMedio)}`);
  }
  for (const [lado, g] of Object.entries(c.porLado)) {
    console.log(`  ${lado.padEnd(14)} ${String(g.n).padStart(3)} · média ${pct(g.retornoMedio)} · ${g.acertos} acertos`);
  }
} else {
  console.log(`\nnenhuma posição encerrada ainda`);
}

await mkdir(dir, { recursive: true });
await writeFile("data/carteira.json", `${JSON.stringify(c, null, 2)}\n`);
console.log(`\ndata/carteira.json gravado`);
