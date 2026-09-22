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
import { rodar, CAPITAL_INICIAL, RISCO_POR_FORCA, type Emissao, type Passo } from "../lib/carteira";
import { velas, type Vela } from "../lib/binance";
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
 *
 * DUAS RESOLUÇÕES E NÃO UMA, e a fina é a que importa. A vela que CONTÉM a
 * entrada é descartada de propósito — ela carrega os minutos anteriores à
 * posição existir, e herdar a mínima deles inventaria perda. Com vela de uma
 * hora isso cega o motor por até sessenta minutos LOGO DEPOIS DE ABRIR, que é
 * justamente quando estas moedas mais andam: a call sai porque alguma coisa
 * acabou de acontecer.
 *
 * 1500 velas de quinze minutos são 15,6 dias e a carteira já tem 20, então uma
 * resolução só não cobre a vida dela. As duas cobrem: quinze minutos onde
 * alcançam, uma hora antes disso. A cegueira de entrada cai de 60 para 15
 * minutos no trecho recente, e a ambiguidade de quem-veio-primeiro dentro da
 * barra cai junto.
 *
 * No ponto de costura pode ficar um vão de até 45 minutos, quando a vela de uma
 * hora que seria cortada ao meio é descartada inteira em vez de sobrepor as
 * finas. Um vão de 45 min, uma vez, a quinze dias atrás — contra sobreposição,
 * que percorreria o mesmo movimento duas vezes.
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
/**
 * QUEM ficou sem série, e não só quantas.
 *
 * Era uma contagem, e contagem não dá para investigar. Com o nome na tela dá:
 * a BP aparece aqui porque `BPUSDT` devolve "Invalid symbol" no perpétuo da
 * Binance — ela é lida pela Gate, e a watchlist diz "só o perpétuo" sem dizer
 * de qual praça. Enquanto for assim, as posições dela são testadas só nas
 * pontas, o que é o modo cego do motor.
 */
const semVelas: string[] = [];
let finas = 0;

/** Uma vela da Binance virando passo do motor, com o intervalo dito e não suposto. */
const passo = (x: Vela, segundos: number): Passo => ({
  // `x.time` é a ABERTURA em segundos. O intervalo vem por fora porque agora há
  // dois, e supô-lo lá dentro é o tipo de suposição que sobrevive a uma troca
  // de resolução e quebra em silêncio.
  abriuEm: x.time * 1000,
  fechouEm: (x.time + segundos) * 1000,
  abertura: x.open,
  maxima: x.high,
  minima: x.low,
  fechamento: x.close,
  // `quote` ausente vira `undefined` e não zero: a carteira precisa distinguir
  // barra rala de barra não medida para não cobrar impacto inventado.
  dolares: Number.isFinite(x.quote) && (x.quote ?? 0) > 0 ? x.quote : undefined,
});

await Promise.all(
  [...candidatas].map(async (ticker) => {
    const symbol = porTicker.get(ticker);
    if (!symbol) return;
    const [grossas, miudas] = await Promise.all([
      velas(symbol, "1h", 1500).catch(() => []),
      velas(symbol, "15m", 1500).catch(() => []),
    ]);
    // Lista vazia é "não consegui", não "não houve movimento" — e as duas não
    // podem terminar no mesmo lugar. Sem velas, esta moeda cai no teste de ponta
    // de sempre, e a contagem abaixo diz quantas ficaram assim.
    if (grossas.length === 0 && miudas.length === 0) {
      semVelas.push(ticker);
      return;
    }
    if (miudas.length > 0) finas++;

    // Onde as finas começam, as grossas param — e param INTEIRAS. Uma vela de
    // uma hora que só está meio dentro da janela fina seria movimento contado
    // duas vezes, e o motor não tem como saber que já percorreu aquilo.
    const comecamAsFinas = miudas.length > 0 ? miudas[0].time * 1000 : Infinity;

    const passos = [
      ...grossas.filter((x) => (x.time + 3600) * 1000 <= comecamAsFinas).map((x) => passo(x, 3600)),
      ...miudas.map((x) => passo(x, 900)),
    ]
      // Só vela dentro da vida da carteira: o resto é peso à toa no filtro que
      // roda por posição por retrato.
      .filter((x) => x.fechouEm >= COMECO)
      .sort((a, b) => a.fechouEm - b.fechouEm);

    if (passos.length > 0) caminho.set(ticker, passos);
    else semVelas.push(ticker);
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
  `caminho: ${caminho.size} de ${candidatas.size} moedas com vela · ${finas} delas com 15 min` +
    (semVelas.length > 0
      ? ` · sem série e testada(s) só nas pontas: ${[...semVelas].sort().join(", ")}`
      : ""),
);

/**
 * O QUE O MOTOR RECUSOU, que é metade do que ele faz e não aparecia em lugar
 * nenhum.
 *
 * As duas primeiras linhas são o conserto do bug mais caro que a carteira
 * tinha: o preço do retrato que o perpétuo desmente. A âncora já o recusava
 * para percorrer o caminho e o teste de ponta o usava assim mesmo — a HEI
 * fechou no alvo a +205% da margem num preço que nunca existiu na praça em que
 * esta carteira opera.
 */
const d = c.diagnostico;
if (d) {
  console.log(
    `o perpétuo desmentiu ${d.desmentidas} leitura(s) do retrato` +
      (d.desmentidas > 0
        ? ` · ${d.substituidas} substituída(s) pelo preço do perpétuo, ` +
          `${d.desmentidas - d.substituidas} descartada(s) por não haver âncora anterior`
        : ""),
  );
  const total = d.comImpacto + d.semImpacto;
  console.log(
    `impacto de mercado medido em ${d.comImpacto} de ${total} abertura(s)` +
      (total > 0
        ? ` · médio ${(d.impactoMedio * 100).toFixed(4)}% · máximo ${(d.impactoMaximo * 100).toFixed(4)}% ` +
          `(o custo fixo de cada ponta é ${(0.0015 * 100).toFixed(2)}%)`
        : ""),
  );
}
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

console.log(
  `queda máxima ${pct(c.quedaMaxima)} do pico de ${usd(c.pico)}  ·  ` +
    `pico de margem exposta ${(c.maiorExposicao * 100).toFixed(1)}% (teto 50%)  ·  ` +
    `pico de risco agregado ${(c.maiorRiscoAberto * 100).toFixed(1)}% (teto 25%)`,
);

/**
 * O TAMANHO DA APOSTA, VIRADO EM NÚMERO.
 *
 * A régua publicada arrisca 3% / 2% / 1% do patrimônio por call — dobrada em
 * 05/09 justamente por causa desta tabela. Na anterior, uma call de força 2 que
 * acertasse o ALVO INTEIRO movia +1,6% da conta e o pico de risco agregado
 * ficava em 13% de um teto de 25%: nenhum limite chegava a prender, e a carteira
 * não conseguia testar se a estratégia quebra a conta.
 *
 * A tabela continua aqui porque a pergunta não acabou: ela é o que mostra onde
 * o teto encosta e a partir de onde mais tamanho só faz RECUSAR call.
 *
 * Esta tabela roda o motor inteiro — as mesmas emissões, o mesmo caminho de
 * velas, os mesmos custos — multiplicando SÓ o orçamento de risco. Stop, alvo,
 * prazo e alavancagem ficam onde estão. As duas colunas que importam andam
 * juntas: retorno e queda máxima. Uma carteira que rende 3% com 2% de queda e
 * outra que rende 3% com 30% não são a mesma carteira.
 *
 * A LEITURA HONESTA DELA depende do placar: enquanto nenhum viés separar da
 * referência, multiplicar o tamanho multiplica uma perda esperada, não um lucro.
 * A tabela existe para mostrar a troca, não para escolher a linha mais alta.
 */
const ESCALAS = [1, 1.5, 2, 3, 5];
console.log(`\ntamanho da aposta — o mesmo motor, só o orçamento de risco multiplicado`);
console.log(`escala   risco/call   patrimônio   retorno   queda máx   margem pico   risco pico`);
for (const e of ESCALAS) {
  const r = rodar(emissoes, COMECO, caminho, e);
  // Os rótulos saem de `RISCO_POR_FORCA`, e não de números escritos aqui: eles
  // estavam fixos em 1,5/1,0/0,5% e continuaram imprimindo isso depois que a
  // régua dobrou — a tabela passou a mentir sobre a própria linha de base.
  const r3 = (RISCO_POR_FORCA[3] * 100 * e).toFixed(1);
  const r2 = (RISCO_POR_FORCA[2] * 100 * e).toFixed(1);
  const r1 = (RISCO_POR_FORCA[1] * 100 * e).toFixed(1);
  console.log(
    `  ${`${e}x`.padEnd(6)} ` +
      `${`${r3}/${r2}/${r1}%`.padStart(12)} ` +
      `${usd(r.patrimonio).padStart(12)} ` +
      `${pct(r.retorno).padStart(9)} ` +
      `${pct(r.quedaMaxima).padStart(11)} ` +
      `${`${(r.maiorExposicao * 100).toFixed(0)}%`.padStart(13)} ` +
      `${`${(r.maiorRiscoAberto * 100).toFixed(0)}%`.padStart(12)}` +
      (e === 1 ? "   ← a régua de hoje" : ""),
  );
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
