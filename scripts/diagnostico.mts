/**
 * DE ONDE VEIO O PREJUÍZO, e o que teria mudado.
 *
 * A carteira já diz QUANTO perdeu. Ela não dizia POR QUÊ, e sem isso a reação
 * natural é mexer em parâmetro até o número ficar bonito — que é a forma mais
 * cara de errar, porque o backtest melhora e a conta não.
 *
 * Este script responde quatro perguntas, e as duas últimas são as que importam:
 *
 *   1. ONDE O DINHEIRO FOI       atribuição por operação, por motivo e por lado
 *   2. EM MÚLTIPLOS DE RISCO     porque dólar esconde tamanho de posição
 *   3. O PAINEL TEM VANTAGEM?    teste de permutação: as MESMAS entradas com o
 *                                lado sorteado. Se a carteira de verdade não se
 *                                separar do sorteio, a direção do painel não
 *                                está acrescentando nada — e nenhum ajuste de
 *                                stop conserta isso
 *   4. A SUPERFÍCIE DE SAÍDA     stop × alvo sobre as calls de verdade e o
 *                                caminho de velas
 *
 * A ORDEM É DELIBERADA. Ajustar stop antes de saber se o painel tem direção é
 * otimizar o tamanho da aposta numa moeda viciada. A pergunta 3 vem primeiro
 * porque ela pode invalidar a 4.
 *
 * Rode com: npm run diagnostico
 */

import { readdir, readFile } from "node:fs/promises";
import {
  ALAVANCAGEM,
  CAPITAL_INICIAL,
  LIMITES,
  MARGEM_MANUTENCAO,
  RISCO_POR_FORCA,
  rodar,
  type Emissao,
  type Passo,
} from "../lib/carteira";
import { velas } from "../lib/binance";
import { ATIVAS } from "../lib/watchlist";

const COMECO = Date.parse("2026-09-02T20:00:00Z");
const usd = (v: number) => `US$ ${v.toFixed(2)}`;
const pct = (v: number) => `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(1)}%`;

// ------------------------------------------------------------------- os dados

const dir = "data";
const emissoes: Emissao[] = [];
for (const f of (await readdir(dir)).filter((x) => /^historico-\d{4}-\d{2}\.jsonl$/.test(x)).sort()) {
  for (const linha of (await readFile(`${dir}/${f}`, "utf8")).split("\n")) {
    if (!linha.trim()) continue;
    try {
      emissoes.push(JSON.parse(linha) as Emissao);
    } catch {
      // linha truncada por escrita concorrente
    }
  }
}

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
 * A SÉRIE INTEIRA, SEM CORTE NO COMEÇO DA CARTEIRA.
 *
 * O `caminho` é truncado em `COMECO` de propósito — o motor só percorre o que a
 * carteira viveu. Mas o filtro da seção 5 precisa olhar SETE DIAS ANTES de cada
 * entrada, e as primeiras entradas acontecem horas depois de `COMECO`: usando o
 * caminho truncado, a janela de 7 dias caía fora da série inteira e o filtro não
 * tinha o que ler.
 *
 * Isso apareceu como "24 de 24 pares sem 7 dias de série" — e apareceu porque o
 * contador separa "não consegui ler" de "não passou no filtro". Sem essa
 * separação seria "o filtro não bloqueou nada", que se lê como "o filtro não
 * serve": a armadilha nº 2 do AGENTS.md em ação.
 */
const serie = new Map<string, Passo[]>();
await Promise.all(
  [...candidatas].map(async (ticker) => {
    const symbol = porTicker.get(ticker);
    if (!symbol) return;
    const v = await velas(symbol, "1h", 1500).catch(() => []);
    if (v.length === 0) return;
    serie.set(
      ticker,
      v.map((x) => ({
        abriuEm: x.time * 1000,
        fechouEm: (x.time + 3600) * 1000,
        abertura: x.open,
        maxima: x.high,
        minima: x.low,
        fechamento: x.close,
      })),
    );
    caminho.set(
      ticker,
      v
        .filter((x) => (x.time + 3600) * 1000 >= COMECO)
        .map((x) => ({
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

const c = rodar(emissoes, COMECO, caminho);
console.log(
  `\ncarteira desde ${new Date(COMECO).toISOString().slice(0, 10)} · ` +
    `${caminho.size} moedas com caminho de velas`,
);

// ============================================== 1. onde o dinheiro foi

console.log(`\n──────────────── 1. ONDE O DINHEIRO FOI ────────────────`);

const realizado = c.fechadas.reduce((s, f) => s + f.resultado, 0);
const naoRealizado = c.abertas.reduce((s, p) => s + p.valor * p.retorno, 0);

console.log(
  `patrimônio ${usd(c.patrimonio)} (${pct(c.retorno)})  =  ${usd(CAPITAL_INICIAL)} ` +
    `${realizado >= 0 ? "+" : "−"} ${usd(Math.abs(realizado))} realizado ` +
    `${naoRealizado >= 0 ? "+" : "−"} ${usd(Math.abs(naoRealizado))} em aberto`,
);

/**
 * A CONCENTRAÇÃO DO PREJUÍZO, que é o número que muda o diagnóstico inteiro.
 *
 * "A carteira está perdendo" e "duas operações são o prejuízo inteiro" pedem
 * consertos opostos: o primeiro sugere que a estratégia não presta, o segundo
 * pergunta se aquelas duas tinham como ser evitadas. Sem esta linha, o primeiro
 * é o que se assume.
 */
const perdas = c.fechadas.filter((f) => f.resultado < 0).sort((a, b) => a.resultado - b.resultado);
const ganhos = c.fechadas.filter((f) => f.resultado >= 0);
const somaPerdas = perdas.reduce((s, f) => s + f.resultado, 0);
console.log(
  `\n${perdas.length} operações no vermelho somam ${usd(somaPerdas)}; ` +
    `${ganhos.length} no verde somam ${usd(ganhos.reduce((s, f) => s + f.resultado, 0))}`,
);
if (perdas.length > 0) {
  const duasPiores = perdas.slice(0, 2).reduce((s, f) => s + f.resultado, 0);
  console.log(
    `as DUAS piores sozinhas: ${usd(duasPiores)} — ` +
      `${((duasPiores / somaPerdas) * 100).toFixed(0)}% de todo o prejuízo realizado`,
  );
}

console.log(`\npor motivo de saída:`);
for (const [m, g] of Object.entries(c.porMotivo)) {
  const dessas = c.fechadas.filter((f) => f.motivo === m);
  console.log(
    `  ${m.padEnd(14)} n=${String(g.n).padStart(2)}  ` +
      `${usd(dessas.reduce((s, f) => s + f.resultado, 0)).padStart(10)}  média ${pct(g.retornoMedio)}`,
  );
}
console.log(`\npor lado:`);
for (const [l, g] of Object.entries(c.porLado)) {
  const dessas = c.fechadas.filter((f) => f.lado === l);
  console.log(
    `  ${l.padEnd(14)} n=${String(g.n).padStart(2)}  ` +
      `${usd(dessas.reduce((s, f) => s + f.resultado, 0)).padStart(10)}  ` +
      `${g.acertos}/${g.n} acertos`,
  );
}

// ============================================== 2. em múltiplos de risco

/**
 * O DÓLAR ESCONDE O TAMANHO DA POSIÇÃO, e o múltiplo de risco não.
 *
 * Uma força 3 arrisca 3% do patrimônio e uma força 1 arrisca 1%: perder US$ 30
 * na primeira e US$ 10 na segunda é o MESMO erro, e a coluna de dólares faz
 * parecer que a primeira foi três vezes pior. Em R — o risco orçado da própria
 * call — as duas são −1,0R, e aí dá para somar maçã com maçã.
 *
 * É também o único jeito de ler a assimetria: com stop, a perda é travada em
 * −1R, então a pergunta que decide a conta é quantos R o ganho médio devolve.
 */
console.log(`\n──────────────── 2. EM MÚLTIPLOS DE RISCO (R) ────────────────`);
console.log(`1R = o risco orçado da call: ${(RISCO_POR_FORCA[3] * 100).toFixed(0)}% / ` +
  `${(RISCO_POR_FORCA[2] * 100).toFixed(0)}% / ${(RISCO_POR_FORCA[1] * 100).toFixed(0)}% do patrimônio (força 3/2/1)`);

// A margem foi dimensionada para que o stop custe exatamente 1R, então o R em
// dólares é `valor × stop × alavancagem` — a mesma conta da abertura, invertida.
const emR = c.fechadas.map((f) => {
  const margem = f.retorno === 0 ? 0 : f.resultado / f.retorno;
  const umR = margem * LIMITES.stop * ALAVANCAGEM;
  return { f, r: umR > 0 ? f.resultado / umR : NaN };
});
console.log(`\noperação                       R      resultado`);
for (const { f, r } of emR.slice().sort((a, b) => a.r - b.r)) {
  console.log(
    `  ${f.symbol.padEnd(7)} ${f.lado.padEnd(5)} ${f.motivo.padEnd(13)} ` +
      `${(Number.isFinite(r) ? `${r >= 0 ? "+" : "−"}${Math.abs(r).toFixed(2)}R` : "—").padStart(7)}  ` +
      `${usd(f.resultado).padStart(10)}`,
  );
}
const rs = emR.map((x) => x.r).filter(Number.isFinite);
const somaR = rs.reduce((s, x) => s + x, 0);
const vitorias = rs.filter((x) => x > 0);
const derrotas = rs.filter((x) => x <= 0);
console.log(
  `\nsoma ${somaR >= 0 ? "+" : "−"}${Math.abs(somaR).toFixed(2)}R em ${rs.length} operações  ·  ` +
    `taxa de acerto ${((vitorias.length / Math.max(1, rs.length)) * 100).toFixed(0)}%  ·  ` +
    `ganho médio ${vitorias.length ? `+${(vitorias.reduce((s, x) => s + x, 0) / vitorias.length).toFixed(2)}R` : "—"}  ·  ` +
    `perda média ${derrotas.length ? `−${Math.abs(derrotas.reduce((s, x) => s + x, 0) / derrotas.length).toFixed(2)}R` : "—"}`,
);
if (vitorias.length && derrotas.length) {
  const g = vitorias.reduce((s, x) => s + x, 0) / vitorias.length;
  const p = Math.abs(derrotas.reduce((s, x) => s + x, 0) / derrotas.length);
  // A taxa de acerto que zera a conta com este par ganho/perda. É o alvo real da
  // estratégia, e ele não depende de opinião nenhuma.
  const precisa = p / (g + p);
  console.log(
    `com este ganho e esta perda médios, a carteira empata acertando ` +
      `${(precisa * 100).toFixed(0)}% — está acertando ${((vitorias.length / rs.length) * 100).toFixed(0)}%`,
  );
}

// ============================================== 3. o painel tem direção?

/**
 * O TESTE QUE VEM ANTES DE QUALQUER AJUSTE: as mesmas entradas, o lado sorteado.
 *
 * Toda a máquina — quando entrar, em que moeda, com que tamanho, com que custo,
 * com que financiamento, com que regra de saída — fica idêntica. A ÚNICA coisa
 * trocada é se a call era de compra ou de venda. Se a carteira de verdade não se
 * separar da nuvem de sorteios, o painel não está acrescentando direção, e
 * mexer em stop é escolher melhor o tamanho de uma aposta sem vantagem.
 *
 * É o mesmo raciocínio do `lib/placar.ts` — comparar contra uma referência em
 * vez de contra zero — mas com tamanho de posição, custo e mapa de saída dentro,
 * que é o que a mediana do placar não sabe.
 *
 * O SORTEIO É POR MOEDA E NÃO POR EMISSÃO, e a diferença é grande: sortear cada
 * linha faria a moeda trocar de lado de retrato em retrato, o que a trava de
 * call queimada e a saída por viés contrário transformariam num moedor — o
 * sorteio perderia por um motivo que não tem nada a ver com direção. Sorteando
 * uma vez por moeda, a série de cada uma continua coerente e só o lado inverte.
 */
console.log(`\n──────────────── 3. O PAINEL TEM DIREÇÃO? ────────────────`);

function comLadosSorteados(semente: number): Emissao[] {
  // Gerador determinístico: o resultado precisa ser reproduzível, senão o
  // percentil muda a cada execução e não significa nada.
  let x = semente * 2654435761;
  const proximo = () => {
    x = (x ^ (x << 13)) >>> 0;
    x = (x ^ (x >>> 17)) >>> 0;
    x = (x ^ (x << 5)) >>> 0;
    return x / 4294967296;
  };
  const inverter = new Map<string, boolean>();
  for (const e of emissoes) {
    if (!inverter.has(e.s)) inverter.set(e.s, proximo() < 0.5);
  }
  return emissoes.map((e) => {
    if (e.vies !== "long" && e.vies !== "short") return e;
    if (!inverter.get(e.s)) return e;
    return { ...e, vies: e.vies === "long" ? "short" : "long" };
  });
}

const SORTEIOS = 400;
const nuvem: number[] = [];
for (let i = 1; i <= SORTEIOS; i++) {
  nuvem.push(rodar(comLadosSorteados(i), COMECO, caminho).patrimonio);
}
nuvem.sort((a, b) => a - b);
const q = (f: number) => nuvem[Math.min(nuvem.length - 1, Math.floor(f * nuvem.length))];
const abaixo = nuvem.filter((v) => v < c.patrimonio).length;
const percentil = (abaixo / nuvem.length) * 100;

console.log(
  `\nsorteando o lado de cada moeda, ${SORTEIOS} vezes, com todo o resto idêntico:`,
);
console.log(
  `  pior ${usd(nuvem[0])} · p10 ${usd(q(0.1))} · mediana ${usd(q(0.5))} · ` +
    `p90 ${usd(q(0.9))} · melhor ${usd(nuvem[nuvem.length - 1])}`,
);
console.log(`  a carteira DE VERDADE: ${usd(c.patrimonio)} — percentil ${percentil.toFixed(0)}`);
console.log(
  percentil >= 95
    ? `  → o painel separa do sorteio. Vale otimizar a saída.`
    : percentil <= 5
      ? `  → o painel está PIOR que o sorteio, e de forma significativa. Inverter a leitura seria melhor que segui-la — o que é um resultado sobre a leitura, não sobre o stop.`
      : `  → NÃO DÁ PARA SEPARAR O PAINEL DE UM SORTEIO. Com ${c.encerradas} operações encerradas,\n` +
        `    esta amostra não distingue as duas coisas, e é isso que o número diz — não que\n` +
        `    o painel esteja errado, e sim que ele ainda não se mostrou certo. Ajustar stop\n` +
        `    aqui é escolher o tamanho da aposta antes de saber se a aposta tem lado.`,
);

// ============================================== 4. a superfície de saída

/**
 * STOP × ALVO, sobre as calls de verdade e o caminho de velas de uma hora.
 *
 * O TETO DE 33,2% NÃO É ESCOLHA, É ARITMÉTICA. A 3x, a margem acaba quando o
 * preço anda 1/3 − manutenção contra: um stop declarado acima disso nunca
 * dispara, porque a corretora fecha antes. As linhas acima do teto aparecem na
 * tabela mesmo assim, marcadas — para ficar visível que "alargar o stop" e
 * "baixar a alavancagem" são a MESMA decisão, e não duas.
 */
const TETO_STOP = 1 / ALAVANCAGEM - MARGEM_MANUTENCAO;
console.log(`\n──────────────── 4. A SUPERFÍCIE DE SAÍDA ────────────────`);
console.log(
  `stop × alvo, em variação de PREÇO · a ${ALAVANCAGEM}x a liquidação fica em ` +
    `${(TETO_STOP * 100).toFixed(1)}%, e stop acima disso não dispara`,
);

const STOPS = [0.15, 0.2, 0.25, 0.3, 0.4];
const ALVOS = [0.25, 0.4, 0.6, 1.0];
console.log(`\n         ${ALVOS.map((a) => `alvo ${(a * 100).toFixed(0)}%`.padStart(12)).join("")}`);
for (const s of STOPS) {
  const celulas = ALVOS.map((a) => {
    const r = rodar(emissoes, COMECO, caminho, { limites: { stop: s, alvo: a } });
    return usd(r.patrimonio).padStart(12);
  });
  console.log(
    `stop ${(s * 100).toFixed(0)}%`.padEnd(9) +
      celulas.join("") +
      (s > TETO_STOP ? "   ← acima da liquidação, o stop não chega a disparar" : "") +
      (s === LIMITES.stop ? "   ← a régua de hoje" : ""),
  );
}

/**
 * E O PRAZO, que é a saída que NUNCA disparou.
 *
 * A carteira publica 14 dias, e nenhuma posição chegou lá — as saídas são stop,
 * alvo ou o painel mudando de ideia. Um limite que nunca morde não é limite, é
 * decoração, e vale saber se encurtá-lo muda alguma coisa.
 */
console.log(`\nprazo (o limite que nunca disparou):`);
for (const d of [3, 5, 7, 14]) {
  const r = rodar(emissoes, COMECO, caminho, { limites: { prazoDias: d } });
  console.log(
    `  ${String(d).padStart(2)} dias  ${usd(r.patrimonio).padStart(10)}  ` +
      `${r.encerradas} encerradas  ·  saídas por prazo: ${r.porMotivo["prazo"]?.n ?? 0}` +
      (d === LIMITES.prazoDias ? "   ← a régua de hoje" : ""),
  );
}

// ====================================== 5. o filtro pela deriva medida

/**
 * A ÚNICA COISA QUE ESTE PROJETO MEDIU COM FORÇA, aplicada como filtro de
 * ENTRADA em vez de como call.
 *
 * Duas medições independentes, com definições diferentes, chegaram ao mesmo
 * lugar: moeda que acabou de subir muito cai depois.
 *
 *   `lib/garimpo.ts`      +25% num dia → mediana de −12,68% em 7 dias, contra
 *                         referência de −0,96%, com 102 de 139 moedas
 *   `aferir-padroes`      subiu ≥20% em 7 dias → −5,55 p.p. da referência, com
 *                         **332 de 421 moedas — 79%**, a maior concordância já
 *                         medida aqui
 *
 * O projeto sabe disso e não usa em lugar nenhum da carteira. E o uso natural
 * NÃO é virar call — o garimpo já mediu que vender isso perde dinheiro em toda
 * largura de stop, porque o caminho estopa a posição antes. O uso natural é
 * NEGATIVO: não comprar contra ele.
 *
 * Uma call de COMPRA numa moeda que subiu 20% na semana está entrando na frente
 * da deriva negativa mais forte que este repositório conhece. Suprimir só essas
 * entradas não inventa sinal nenhum — usa um que já foi medido, no único sentido
 * em que ele sobreviveu.
 *
 * O espelho também entra na tabela, para o filtro não ser testado só do lado que
 * eu espero que funcione: moeda que CAIU ≥20% na semana mede +2,49 p.p. com 70%
 * de concordância, então vender essas é a simétrica do mesmo erro.
 */
console.log(`\n──────────────── 5. FILTRAR ENTRADA PELA DERIVA MEDIDA ────────────────`);

/** A alta acumulada nos 7 dias anteriores a `tMs`, pelo caminho de velas. */
function alta7d(ticker: string, tMs: number): number | null {
  const v = serie.get(ticker);
  if (!v || v.length === 0) return null;
  const antes = v.filter((x) => x.fechouEm <= tMs);
  if (antes.length === 0) return null;
  const agora = antes[antes.length - 1].fechamento;
  const alvoT = tMs - 7 * 86_400_000;
  // A vela mais próxima de 7 dias atrás, e SÓ se ela existir de verdade: sem 7
  // dias de série a resposta é "não sei", que não pode virar "não subiu".
  const passado = antes.filter((x) => x.fechouEm <= alvoT);
  if (passado.length === 0) return null;
  const base = passado[passado.length - 1].fechamento;
  return agora > 0 && base > 0 ? agora / base - 1 : null;
}

/**
 * Suprime ENTRADA trocando o viés por "observar" — que sob a regra de saída de
 * hoje não fecha posição nenhuma. É filtro de abertura, não de fechamento: quem
 * já está dentro segue as regras normais.
 */
function filtrar(bloquearLongApos: number | null, bloquearShortApos: number | null): Emissao[] {
  return emissoes.map((e) => {
    if (e.vies !== "long" && e.vies !== "short") return e;
    if (e.t * 1000 < COMECO) return e;
    const a = alta7d(e.s, e.t * 1000);
    if (a == null) return e;
    if (e.vies === "long" && bloquearLongApos != null && a >= bloquearLongApos) {
      return { ...e, vies: "observar" };
    }
    if (e.vies === "short" && bloquearShortApos != null && a <= bloquearShortApos) {
      return { ...e, vies: "observar" };
    }
    return e;
  });
}

const VARIANTES: [string, Emissao[]][] = [
  ["sem filtro (hoje)", emissoes],
  ["não comprar depois de +20% em 7d", filtrar(0.2, null)],
  ["não vender depois de −20% em 7d", filtrar(null, -0.2)],
  ["os dois", filtrar(0.2, -0.2)],
];
console.log(`\nvariante                              patrimônio   encerradas   soma em R`);
for (const [nome, es] of VARIANTES) {
  const r = rodar(es, COMECO, caminho);
  const rr = r.fechadas
    .map((f) => {
      const margem = f.retorno === 0 ? 0 : f.resultado / f.retorno;
      const umR = margem * LIMITES.stop * ALAVANCAGEM;
      return umR > 0 ? f.resultado / umR : NaN;
    })
    .filter(Number.isFinite);
  const soma = rr.reduce((s, x) => s + x, 0);
  console.log(
    `  ${nome.padEnd(36)} ${usd(r.patrimonio).padStart(10)} ` +
      `${String(r.encerradas).padStart(11)} ` +
      `${`${soma >= 0 ? "+" : "−"}${Math.abs(soma).toFixed(2)}R`.padStart(11)}`,
  );
}

/**
 * QUANTAS CALLS O FILTRO CHEGA A TOCAR. Sem isto, um filtro que não bloqueou
 * nada aparece como "não mudou o resultado" e se lê como "não funciona" — que
 * são coisas diferentes, e a diferença é a armadilha nº 2 do AGENTS.md.
 */
let tocadas = 0;
let semSerie = 0;
const vistas = new Set<string>();
for (const e of emissoes) {
  if (e.t * 1000 < COMECO || (e.vies !== "long" && e.vies !== "short")) continue;
  const chave = `${e.s}|${e.vies}`;
  if (vistas.has(chave)) continue;
  vistas.add(chave);
  const a = alta7d(e.s, e.t * 1000);
  if (a == null) semSerie++;
  else if ((e.vies === "long" && a >= 0.2) || (e.vies === "short" && a <= -0.2)) tocadas++;
}
console.log(
  `\no filtro toca ${tocadas} de ${vistas.size} pares moeda+lado ` +
    `(${semSerie} sem 7 dias de série, onde ele não opina).`,
);

console.log(
  `\n────────────────────────────────────────────────────────────────────────────\n` +
    `AS TABELAS ACIMA NÃO SÃO UM CARDÁPIO. Com ${c.encerradas} operações encerradas, a\n` +
    `diferença entre as células é ruído, e escolher a mais alta é ajustar a régua\n` +
    `ao passado — que é como se fabrica backtest bonito e conta vazia.\n` +
    `\n` +
    `A leitura das seções 4 e 5 depende inteiramente da 3, e a 3 diz que esta\n` +
    `amostra não separa o painel de um sorteio. Enquanto for assim, o que muda o\n` +
    `resultado não é onde fica o stop: é o painel passar a ter direção medida.\n`,
);
