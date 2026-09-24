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
import {
  rodar,
  CAPITAL_INICIAL,
  REGRAS,
  REGRAS_ANTERIORES,
  type Carteira,
  type Emissao,
  type LinhaRegime,
  type Passo,
  type Regras,
} from "../lib/carteira";
import { intervalosDeFunding, velas, velasDesde } from "../lib/binance";
import { ATIVAS } from "../lib/watchlist";
import { ARQUIVO_HISTORICO } from "../lib/historico";
import { chavesDepois, eventosNovos, MAX_POR_RETRATO, textoDoEvento, type Evento } from "../lib/avisos";
import { escapeMarkdown, sendTelegram, telegramFromEnv } from "../lib/telegram";

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
const arquivos = (await readdir(dir)).filter((f) => ARQUIVO_HISTORICO.test(f));

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
 * As velas vêm desde o começo da carteira, em páginas de 1.500 (62 dias): além
 * do caminho, elas julgam se o preço de cada retrato é o do perpétuo — ver o
 * laço de busca abaixo.
 */
const porTicker = new Map(ATIVAS.map((t) => [t.symbol.replace(/USDT$/, ""), t.symbol]));
// As em vista também viram posição (`lib/emvista.ts`), e sem caminho de velas o
// stop delas seria testado só nas pontas — a paciência que ninguém tem, a favor
// delas. Tiradas do histórico, que guarda a origem na linha: são todas
// perpétuo USDT, e o símbolo é o ticker com o sufixo.
const deEmVista = new Set(emissoes.filter((e) => e.origem).map((e) => e.s));
for (const s of deEmVista) if (!porTicker.has(s)) porTicker.set(s, `${s}USDT`);

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

/**
 * DE QUANTAS EM QUANTAS HORAS CADA MOEDA COBRA O FINANCIAMENTO.
 *
 * O motor cobrava toda taxa como se fosse de oito horas, e 39 das 40 moedas que
 * a carteira já negociou cobram a cada quatro (`intervalosDeFunding`). Sem
 * resposta da Binance, vale o último período lido, que viaja no próprio
 * `carteira.json` — cair no padrão de 8 h faria o custo de carregar dobrar e
 * desdobrar de um retrato para o outro, e com ele o tamanho das posições.
 */
const jaGravada = await readFile("data/carteira.json", "utf8")
  .then((t) => JSON.parse(t) as Carteira)
  .catch(() => null);
const intervalos = await intervalosDeFunding();
const horasFunding: Record<string, number> = {};
for (const s of candidatas) {
  const h = intervalos ? (intervalos.get(porTicker.get(s)!) ?? 8) : jaGravada?.horasFunding?.[s];
  if (h !== undefined && Number.isFinite(h) && h > 0) horasFunding[s] = h;
}
for (const e of emissoes) {
  const h = horasFunding[e.s];
  if (h !== undefined) e.fh = h;
}

const caminho = new Map<string, Passo[]>();
let semVelas = 0;
let comVelasParciais = 0;
await Promise.all(
  [...candidatas].map(async (ticker) => {
    const symbol = porTicker.get(ticker);
    if (!symbol) return;
    // DESDE O COMEÇO DA CARTEIRA, e não as 1.500 mais recentes. Eram 62 dias,
    // e o comentário lá em cima dizia que passar disso só devolvia o pedaço
    // velho ao teste de ponta. Deixou de ser inofensivo: as velas agora também
    // julgam se o preço do retrato é o do perpétuo (`foraDoPerpetuo`), e sem
    // elas os preços de pool alheia de setembro — os que deram à HEI três
    // "alvos" que o perpétuo nunca tocou — voltariam a valer quando a carteira
    // fizesse 62 dias. De trás para frente (`velasDesde`): se faltar alguma
    // página, falta a mais velha, nunca as de agora — e a contagem diz quantas.
    const { velas: v, parcial } = await velasDesde(symbol, "1h", COMECO - 3_600_000).catch(() => ({
      velas: [] as Awaited<ReturnType<typeof velas>>,
      parcial: true,
    }));
    if (parcial && v.length > 0) comVelasParciais++;
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
const semCaminho = rodar(emissoes, COMECO, caminho, REGRAS, { soPontas: true });
const c = rodar(emissoes, COMECO, caminho);

const usd = (v: number) => `US$ ${v.toFixed(2)}`;
const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

console.log(`\ncarteira desde ${new Date(COMECO).toISOString().slice(0, 16).replace("T", " ")} UTC`);
console.log(`emissões lidas: ${emissoes.length}`);
console.log(
  `caminho: ${caminho.size} de ${candidatas.size} moedas com vela de 1h` +
    (semVelas > 0 ? ` · ${semVelas} sem série, testadas só nas pontas` : "") +
    (comVelasParciais > 0 ? ` · ${comVelasParciais} com série incompleta no começo` : ""),
);
{
  const porPeriodo = new Map<number, number>();
  for (const h of Object.values(horasFunding)) porPeriodo.set(h, (porPeriodo.get(h) ?? 0) + 1);
  const resumo = [...porPeriodo.entries()].sort((a, b) => a[0] - b[0]).map(([h, n]) => `${n} de ${h} h`).join(", ");
  console.log(
    `financiamento: ${resumo || "nenhum período conhecido"}` +
      (intervalos ? "" : jaGravada?.horasFunding ? " · a Binance não respondeu, valem os do retrato anterior" : " · sem período nenhum: cobrado de 8 em 8 h"),
  );
}
console.log(
  `só nas pontas o patrimônio seria ${usd(semCaminho.patrimonio)} ` +
    `com ${semCaminho.encerradas} encerrada(s) — a diferença é o que o intervalo escondia\n`,
);
if (c.foraDoPerpetuo) {
  console.log(`${c.foraDoPerpetuo} linha(s) do histórico fora do perpétuo daquela hora — não abrem, não marcam, não fecham\n`);
}
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
{
  // A PERGUNTA QUE AS EM VISTA TRAZEM: as calls nas moedas que entraram sozinhas
  // se comportam diferente das da lista? Impresso a cada retrato para a resposta
  // se acumular à vista — e com o aviso de que amostra pequena não responde.
  const origem = (s: string) => (deEmVista.has(s) ? "em vista" : "lista");
  for (const o of ["lista", "em vista"]) {
    const f = c.fechadas.filter((x) => origem(x.symbol) === o);
    const a = c.abertas.filter((x) => origem(x.symbol) === o);
    const soma = f.reduce((t, x) => t + x.resultado, 0);
    console.log(
      `${o.padEnd(9)} ${String(f.length).padStart(4)} fechada(s), ${f.filter((x) => x.resultado > 0).length} no positivo, ` +
        `${usd(soma)} · ${a.length} aberta(s)`,
    );
  }
}
if (c.freio !== undefined && c.freio < 1) {
  console.log(`freio de queda LIGADO: novas calls arriscam ${(c.freio * 100).toFixed(0)}% da régua`);
}

/**
 * O REGIME, VIRADO EM NÚMERO — e medido de novo a cada retrato.
 *
 * Esta tabela era só de ESCALA: o mesmo motor com o orçamento de risco
 * multiplicado. Foi ela que dobrou a régua em 05/09, e continua valendo pelo
 * mesmo motivo: mostra onde o teto encosta e a partir de onde mais tamanho só
 * faz RECUSAR call. Mas escala era o único parâmetro que o motor aceitava, e a
 * pergunta "e se a gestão fosse outra?" não tinha como ser feita sem editar o
 * código.
 *
 * Agora cada linha é um regime inteiro sobre as MESMAS emissões e o MESMO
 * caminho de velas: o publicado, o anterior, e o publicado com UMA peça
 * desligada por vez — que é como se descobre quanto cada peça carrega. E cada
 * um roda três vezes: a janela inteira e as duas METADES dela, separadas,
 * começando do zero. Um regime que só ganha numa metade descreve aquela metade.
 *
 * A LEITURA HONESTA continua dependendo do placar: enquanto nenhum viés separar
 * da referência, o que esta tabela compara é como PERDER MENOS com calls sem
 * vantagem medida, não como ganhar com elas.
 */
const FIM = c.atualizadoEm;
const MEIO = COMECO + (FIM - COMECO) / 2;
const antesDoMeio = emissoes.filter((e) => e.t * 1000 < MEIO);
const regimes: [string, Regras][] = [
  ["publicado", REGRAS],
  ["anterior (até 23/09)", REGRAS_ANTERIORES],
  ["  sem a saída sem reação", { ...REGRAS, semReacaoDias: null }],
  ["  vendido com risco cheio", { ...REGRAS, fatorVendido: 1 }],
  ["  sem queimar toda saída", { ...REGRAS, queimaEmToda: false }],
  ["  sem freio de queda", { ...REGRAS, freio: null }],
  ["  stop de 20%", { ...REGRAS, stopComprado: 0.2, stopVendido: 0.2 }],
  ["  com stop móvel 20/15", { ...REGRAS, rastro: { ativa: 0.2, distancia: 0.15 } }],
  ["  escala 1,5x", { ...REGRAS, escala: 1.5 }],
  ["  escala 2x", { ...REGRAS, escala: 2 }],
];
console.log(
  `\nregimes sobre as mesmas calls — inteira, e cada metade começando do zero ` +
    `(corte em ${new Date(MEIO).toISOString().slice(0, 16).replace("T", " ")} UTC)`,
);
/**
 * "SEM A MELHOR MOEDA": o retorno tirando a moeda que mais deu dinheiro.
 *
 * Existe porque foi ela que reprovou o stop curto em 23/09. Stop de 20% e stop
 * de 2σ davam +17,6% e +21,6% contra +14,8% do publicado, com a mesma queda
 * máxima e as duas metades melhores — e o ganho era quase inteiro da HEI, onde
 * o stop curto virou posição maior bem na moeda que bateu o alvo três vezes.
 * As metades não pegam isso quando a mesma moeda ganha nas duas; esta coluna
 * pega. Mediana boa puxada por uma moeda é o modo mais comum de um resultado
 * mentir aqui.
 */
function semAMelhor(x: Carteira): { ticker: string; retorno: number } {
  const porMoeda = new Map<string, number>();
  for (const f of x.fechadas) porMoeda.set(f.symbol, (porMoeda.get(f.symbol) ?? 0) + f.resultado);
  for (const p of x.abertas) porMoeda.set(p.symbol, (porMoeda.get(p.symbol) ?? 0) + p.valor * p.retorno);
  let melhor = { ticker: "—", resultado: 0 };
  for (const [ticker, resultado] of porMoeda) if (resultado > melhor.resultado) melhor = { ticker, resultado };
  return { ticker: melhor.ticker, retorno: (x.patrimonio - melhor.resultado) / CAPITAL_INICIAL - 1 };
}

console.log(
  `${"regime".padEnd(26)} ${"retorno".padStart(8)} ${"sem a melhor".padStart(18)} ${"queda máx".padStart(10)} ` +
    `${"n".padStart(4)} ${"1ª metade".padStart(10)} ${"2ª metade".padStart(10)} ` +
    `${"margem pico".padStart(12)} ${"risco pico".padStart(11)}`,
);
const linhas: LinhaRegime[] = [];
let anterior: Carteira | null = null;
for (const [nome, regras] of regimes) {
  // O publicado já foi rodado lá em cima; rodar de novo daria o mesmo número.
  const t = regras === REGRAS ? c : rodar(emissoes, COMECO, caminho, regras);
  const m1 = rodar(antesDoMeio, COMECO, caminho, regras);
  const m2 = rodar(emissoes, MEIO, caminho, regras);
  const sm = semAMelhor(t);
  if (regras === REGRAS_ANTERIORES) anterior = t;
  linhas.push({
    nome: nome.trim(),
    retorno: t.retorno,
    semAMelhor: sm,
    quedaMaxima: t.quedaMaxima,
    encerradas: t.encerradas,
    metades: [m1.retorno, m2.retorno],
    maiorExposicao: t.maiorExposicao,
    maiorRiscoAberto: t.maiorRiscoAberto,
  });
  console.log(
    `${nome.padEnd(26)} ${pct(t.retorno).padStart(8)} ${`${pct(sm.retorno)} sem ${sm.ticker}`.padStart(18)} ` +
      `${pct(t.quedaMaxima).padStart(10)} ${String(t.encerradas).padStart(4)} ` +
      `${pct(m1.retorno).padStart(10)} ${pct(m2.retorno).padStart(10)} ` +
      `${`${(t.maiorExposicao * 100).toFixed(0)}%`.padStart(12)} ${`${(t.maiorRiscoAberto * 100).toFixed(0)}%`.padStart(11)}`,
  );
}
// Os rótulos saem das regras, e não de números escritos aqui: eles estavam
// fixos em 1,5/1,0/0,5% e continuaram imprimindo isso depois que a régua dobrou
// — a tabela passou a mentir sobre a própria linha de base.
const rf = REGRAS.riscoPorForca;
console.log(
  `risco por call no publicado: ${rf[3] * 100}/${rf[2] * 100}/${rf[1] * 100}% por força 3/2/1, ` +
    `vendido × ${REGRAS.fatorVendido}`,
);

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

/**
 * OS AVISOS DE TRADE NO TELEGRAM: cada posição aberta ou fechada desde o
 * retrato anterior vira uma mensagem (`lib/avisos.ts`). A carteira anterior é
 * o arquivo que o `baixar` trouxe da branch `dados` — ainda não sobrescrito,
 * porque a gravação é a última coisa deste script.
 *
 * Sem Telegram configurado (rodando local), nada é enviado e nada é marcado
 * como enviado: a memória só registra o que de fato chegou, para o retrato
 * seguinte tentar de novo o que o Telegram recusou.
 */
const antes = jaGravada;
const eventos = eventosNovos(antes, c);
const telegram = telegramFromEnv();
let avisos = antes?.avisos;
if (!telegram) {
  if (eventos.length > 0) console.log(`\n${eventos.length} aviso(s) de trade — Telegram não configurado, nada enviado`);
} else {
  // A primeira vez avisa que ligou: é também o teste de que as mensagens chegam
  // na conversa certa, que é a dúvida que fez este recurso existir.
  if (!avisos && antes) {
    const ok = await sendTelegram(
      telegram,
      escapeMarkdown(
        "✅ Avisos da carteira fictícia ligados. A partir de agora, cada posição que ela abrir ou fechar " +
          "chega aqui, com preço, stop e motivo. Continua sendo carteira de mentira: o placar ainda mede " +
          "que os vieses do painel não têm vantagem.",
      ),
    );
    if (ok) avisos = { enviados: [] };
  }
  if (avisos) {
    let painel: { moedas?: { ticker: string; leitura?: { titulo?: string } | null }[] } | null = null;
    try {
      painel = JSON.parse(await readFile("data/panorama.json", "utf8"));
    } catch {
      // sem leitura, o aviso sai sem a frase do painel
    }
    const leitura = new Map((painel?.moedas ?? []).map((m) => [m.ticker, m.leitura?.titulo ?? null]));
    const enviados: Evento[] = [];
    for (const e of eventos.slice(0, MAX_POR_RETRATO)) {
      const simbolo = e.tipo === "abriu" ? e.p.symbol : e.f.symbol;
      const texto = textoDoEvento(e, c.patrimonio, e.tipo === "abriu" ? leitura.get(simbolo) : null);
      if (await sendTelegram(telegram, escapeMarkdown(texto))) enviados.push(e);
    }
    if (eventos.length > MAX_POR_RETRATO) {
      const resto = eventos.slice(MAX_POR_RETRATO);
      const ok = await sendTelegram(
        telegram,
        escapeMarkdown(`…e mais ${resto.length} evento(s) da carteira neste retrato. Veja a página do radar.`),
      );
      if (ok) enviados.push(...resto);
    }
    if (eventos.length > 0) console.log(`\n${enviados.length} de ${eventos.length} aviso(s) de trade enviados ao Telegram`);
    avisos = { enviados: chavesDepois(antes, enviados) };
  }
}

// A tabela vai junto para a tela. A curva do anterior entra inteira, e é a única
// além da publicada: as outras linhas são ablações, e desenhar dez curvas
// sobrepostas não deixaria ler nenhuma.
const gravada: Carteira = {
  ...c,
  comparacao: { meio: MEIO, linhas, anterior: anterior?.curva ?? [] },
  ...(deEmVista.size ? { emVista: [...deEmVista].sort() } : {}),
  ...(Object.keys(horasFunding).length ? { horasFunding } : {}),
  ...(avisos ? { avisos } : {}),
};

await mkdir(dir, { recursive: true });
await writeFile("data/carteira.json", `${JSON.stringify(gravada, null, 2)}\n`);
console.log(`\ndata/carteira.json gravado`);
