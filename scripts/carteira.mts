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
import { rodar, CAPITAL_INICIAL, type Emissao, type Passo } from "../lib/carteira";
import { velas } from "../lib/binance";
import { ATIVAS } from "../lib/watchlist";

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

/**
 * O CAMINHO ENTRE OS RETRATOS, buscado na praça grande.
 *
 * Os retratos são a única coisa que o motor via, e eles saem de quarenta em
 * quarenta minutos no melhor caso e de cinco em cinco horas no caso real. Stop,
 * alvo e liquidação testados só nas pontas davam à carteira uma paciência que
 * ordem parada não tem. As velas de uma hora tapam o buraco.
 *
 * SÓ AS MOEDAS QUE PODEM VIRAR POSIÇÃO, e não a lista inteira: é uma requisição
 * por moeda, e quem nunca teve viés direcional com força gravada nunca abriu
 * nada. O conjunto abaixo é o limite superior do que a carteira pode ter
 * carregado, então ele cobre tudo sem buscar o que não serve.
 *
 * 1500 velas de uma hora são 62 dias. Quando a carteira passar disso, o pedaço
 * mais antigo simplesmente volta a ser testado só nas pontas — que é o
 * comportamento anterior, não um erro novo.
 */
const porTicker = new Map(ATIVAS.map((t) => [t.symbol.replace(/USDT$/, ""), t.symbol]));

const candidatas = new Set(
  emissoes
    .filter(
      (e) =>
        e.t * 1000 >= COMECO &&
        (e.vies === "long" || e.vies === "short") &&
        e.forca != null &&
        porTicker.has(e.s),
    )
    .map((e) => e.s),
);

const caminho = new Map<string, Passo[]>();
let semVelas = 0;
await Promise.all(
  [...candidatas].map(async (ticker) => {
    const symbol = porTicker.get(ticker);
    if (!symbol) return;
    const v = await velas(symbol, "1h", 1500).catch(() => []);
    // Lista vazia é "não consegui", não "não houve movimento" — e as duas não
    // podem terminar no mesmo lugar. Sem velas, esta moeda cai no teste de ponta
    // de sempre, e a contagem abaixo diz quantas ficaram assim.
    if (v.length === 0) {
      semVelas++;
      return;
    }
    caminho.set(
      ticker,
      v
        // Só vela dentro da vida da carteira: o resto é peso à toa no filtro que
        // roda por posição por retrato.
        .filter((x) => (x.time + 3600) * 1000 >= COMECO)
        .map((x) => ({
          // `x.time` é a ABERTURA em segundos, e a vela é de uma hora — mas o
          // passo fica explícito aqui em vez de ficar suposto lá dentro, que é o
          // tipo de suposição que sobrevive a uma troca de intervalo e quebra em
          // silêncio.
          abriuEm: x.time * 1000,
          fechouEm: (x.time + 3600) * 1000,
          abertura: x.open,
          maxima: x.high,
          minima: x.low,
          fechamento: x.close,
        })),
    );
  }),
);

// As duas leituras, para a diferença ficar medida e não presumida. A de pontas é
// o que a carteira era; a de caminho é o que ela passa a ser.
const semCaminho = rodar(emissoes, COMECO);
const c = rodar(emissoes, COMECO, caminho);

const usd = (v: number) => `US$ ${v.toFixed(2)}`;
const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

console.log(`\ncarteira desde ${new Date(COMECO).toISOString().slice(0, 16).replace("T", " ")} UTC`);
console.log(`emissões lidas: ${emissoes.length}`);
console.log(
  `caminho: ${caminho.size} de ${candidatas.size} moedas com vela de 1h` +
    (semVelas > 0 ? ` · ${semVelas} sem série, testadas só nas pontas` : ""),
);
console.log(
  `só nas pontas o patrimônio seria ${usd(semCaminho.patrimonio)} ` +
    `com ${semCaminho.encerradas} encerrada(s) — a diferença é o que o intervalo escondia\n`,
);
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
