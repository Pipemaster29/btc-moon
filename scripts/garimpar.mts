/**
 * Peneira os 526 perpétuos da Binance e mostra o que se parece com o objeto de
 * estudo, para a lista deixar de ser só o que alguém lembrou de colocar nela.
 *
 * As regras e — o que importa mais — a medição que as sustenta moram em
 * `lib/garimpo.ts`. Aqui só há relatório de terminal e gravação.
 *
 * ISTO NÃO EMITE CALL, e o cabeçalho impresso repete isso toda vez. A deriva
 * depois de um pump é o sinal mais forte já medido neste projeto, e vendê-la
 * mecanicamente perde dinheiro em toda largura de stop testada. O que sai daqui
 * é uma fila de investigação.
 *
 * Rode com: npm run garimpar
 *           npm run garimpar 40           (quantas linhas mostrar, padrão 25)
 *           npm run garimpar 40 500       (só até US$ 500 milhões de market cap)
 *
 * O SEGUNDO ARGUMENTO É RECORTE DE INTERESSE, NÃO DE VANTAGEM. Ele existe
 * porque o objeto de estudo deste projeto é moeda pequena e a lista sem ele
 * enche de UNI, ARB e ZEC — que subiram 40% na semana e não são o que se
 * procura. Mas a medição NÃO sustenta que o efeito seja maior nas pequenas: a
 * Binance só publica trinta dias de supply circulante, e com isso a amostra por
 * faixa de tamanho não fecha. Filtrar aqui é escolher o que olhar, e o padrão é
 * não filtrar.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { garimpar, REFERENCIA_7D } from "../lib/garimpo";

const QUANTAS = Number(process.argv[2] ?? 25);
const TETO_MCAP = process.argv[3] ? Number(process.argv[3]) * 1e6 : null;

const t0 = Date.now();
const g = await garimpar();
const levou = (Date.now() - t0) / 1000;

const pct = (v: number | null) =>
  v == null ? "—" : `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(1)}%`;
const money = (v: number) =>
  v >= 1e9 ? `${(v / 1e9).toFixed(1)}bi` : v >= 1e6 ? `${(v / 1e6).toFixed(0)}mi` : `${(v / 1e3).toFixed(0)}mil`;

// Moeda SEM market cap conhecido continua na lista quando há teto: "não sei o
// tamanho" não é "é grande demais", e descartá-la calada seria transformar uma
// leitura que falhou num veredito.
const mostrar = TETO_MCAP
  ? g.achados.filter((a) => a.marketCap == null || a.marketCap <= TETO_MCAP)
  : g.achados;
const novos = mostrar.filter((a) => !a.naLista && !a.aposentada);

console.log(
  `\n${g.universo} perpétuos peneirados em ${levou.toFixed(1)}s · ` +
    `${g.achados.length} na faixa · ${novos.length} fora da watchlist` +
    (TETO_MCAP ? ` · recorte até ${money(TETO_MCAP)} de market cap` : "") +
    (g.semSerie > 0 ? ` · ${g.semSerie} sem série de velas` : ""),
);
console.log(
  `referência do universo: ${pct(REFERENCIA_7D)} em 7 dias — é dela que a distância importa\n`,
);

console.log("ticker      preço        24h       7d    volume     mcap  oi/mc  funding  idade   faixa medida");
for (const a of mostrar.slice(0, QUANTAS)) {
  const marca = a.naLista ? "•" : a.aposentada ? "×" : " ";
  console.log(
    `${marca} ${a.ticker.padEnd(10)}` +
      `${a.preco.toPrecision(4).padStart(11)} ` +
      `${pct(a.alta24h).padStart(8)} ` +
      `${(a.alta7d == null ? `${a.diasDeSerie}d série` : pct(a.alta7d)).padStart(9)} ` +
      `${money(a.volume24h).padStart(8)} ` +
      `${(a.marketCap == null ? "—" : money(a.marketCap)).padStart(8)} ` +
      `${(a.oiSobreMcap == null ? "—" : `${(a.oiSobreMcap * 100).toFixed(0)}%`).padStart(6)} ` +
      `${(a.funding == null ? "—" : `${(a.funding * 100).toFixed(3)}%`).padStart(8)} ` +
      `${(a.idadeDias == null ? "—" : `${Math.round(a.idadeDias)}d`).padStart(6)}  ` +
      `${a.faixa.rotulo} → ${pct(a.faixa.mediana7d)} (${a.faixa.moedas[0]}/${a.faixa.moedas[1]} moedas)`,
  );
}

console.log(`\n• já está na watchlist · × aposentada, já foi olhada e descartada`);

if (novos.length > 0) {
  console.log(`\nas ${Math.min(novos.length, 12)} primeiras que ainda não estão na lista:`);
  for (const a of novos.slice(0, 12)) {
    console.log(`  ${a.ticker.padEnd(12)} ${a.porque.join(" · ")}`);
  }
  console.log(
    `\nPARA PROMOVER QUALQUER UMA, o contrato precisa ser identificado primeiro —\n` +
      `identificar o token errado é o erro mais caro deste projeto e já foi cometido duas vezes:\n` +
      `  npm run descobrir ${novos.slice(0, 6).map((a) => a.ticker).join(" ")}`,
  );
}

console.log(
  `\nESTA LISTA NÃO É RECOMENDAÇÃO. A deriva depois do pump é o sinal mais forte já\n` +
    `medido aqui — mediana de −12,7% em 7 dias contra referência de −1,0%, com 102 de 139\n` +
    `moedas concordando —, e vendê-la mecanicamente PERDE dinheiro em toda largura de stop\n` +
    `testada, porque o caminho estopa a posição antes: média de −1,3% a −2,9% com custo e\n` +
    `financiamento reais dentro. Ver a tabela inteira em \`npm run aferir-garimpo\`.\n` +
    `\nE não há lado comprado para garimpar: "comprar a derretida" medida sobre o universo\n` +
    `piora quanto mais fundo a queda — caiu ≥50% do pico dá mediana −1,1% com 213 de 395\n` +
    `moedas, e caiu ≥95% dá média −2,4% com 2 de 17. O que se acha aqui é candidato a ESTUDO.`,
);

await mkdir("data", { recursive: true });
await writeFile("data/garimpo.json", `${JSON.stringify(g, null, 2)}\n`);
console.log(`\ndata/garimpo.json gravado`);
