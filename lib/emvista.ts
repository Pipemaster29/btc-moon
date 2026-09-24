/**
 * As moedas EM VISTA: as que entram no painel sozinhas, porque passaram pela
 * carteira quente da Binance na BNB Chain.
 *
 * A lista de `watchlist.ts` tem as moedas que alguém apontou. O gravador de
 * fluxo (`npm run fluxo-binance`) lê a carteira `0x73D8…46Db` a cada execução
 * e identifica cada token que passa por ela — e a pergunta foi se isso bastava
 * para uma moeda merecer o painel, sem ninguém apontar.
 *
 * ================================================================== A MEDIÇÃO
 *
 * Feita em 23/09 sobre 200 velas diárias dos 528 perpétuos USDT da Binance,
 * CORTADAS em 17/09: a carteira foi lida de 19/09 em diante, então os pumps
 * contados aqui aconteceram ANTES de a moeda ser vista nela — não é a carteira
 * pegando o pump em andamento. Nos cinco dias lidos, 70 perpétuos passaram por
 * ela; 29 já estavam na lista, 41 não.
 *
 *   dias de alta ≥25% por mil moeda-dias
 *                              todas    vol. pequeno  médio   grande
 *   carteira, fora da lista    16,7         9,5        19,0    22,7
 *   carteira e lista           43,2        15,6        34,5    56,4
 *   lista, fora da carteira    25,6        15,6        23,3    28,0
 *   resto da Binance (414)      4,4         2,7         5,7     5,3
 *
 * (Cada grupo conta as moedas com 30 dias de série ou mais: 40 das 41 de fora
 * da lista, 41 das 44 da lista que não passaram.) As de fora da lista bombam
 * 3,8 vezes mais que o resto, e a diferença não é tamanho: aparece nos três
 * terços de volume, e nas duas metades da janela (20,3 contra 5,3; 12,7
 * contra 3,6). 70% delas tiveram ao menos um dia assim,
 * contra 41% do resto. E caem junto: dias de −25% ou pior são 6,6 por mil
 * contra 1,0 — é a assinatura de pump-and-dump, que é o objeto deste painel.
 *
 * Não é "a maioria das manipuladas": as 70 são 13% da praça e seguram 40% dos
 * dias de alta ≥25% (350 de 891). É concentração, três vezes o peso delas.
 *
 * E não precisa de corte por atividade: as de fluxo abaixo da mediana (US$ 229
 * mil em cinco dias) dão 22,9 por mil, as de cima 32,8 — as duas muito acima
 * do resto.
 *
 * O QUE ISTO NÃO MEDE: vantagem de trade. Depois do pump elas caem como o resto
 * do garimpo (mediana de −15,9% em 7 dias contra referência de −1,0%, 21 de 28
 * moedas), e o garimpo mediu que vender isso perde dinheiro em toda largura de
 * stop. A carteira fictícia passa a operar as calls delas como opera as da
 * lista, e é ela que vai medir; por isso a origem viaja no histórico.
 *
 * ================================================ POR QUE A IDENTIFICAÇÃO BASTA
 *
 * A armadilha nº 1 é buscar pelo NOME e receber homônimos. Aqui a direção é a
 * oposta: parte do CONTRATO que a própria Binance custodia e só aceita o
 * perpétuo cujo preço bate com o da pool dentro de 15%, com pool de US$ 20 mil
 * (`scripts/fluxo-binance.mts`). O teste de fragmento de ponte — supply do
 * contrato menor que 90% do circulante — é o `contratoRepresenta` de
 * `lerVida`, que roda para toda moeda e suprime o float em corretora quando
 * falha: 16 das 41 caem nele hoje (a moeda mora inteira em outra rede) e seguem
 * pelo perpétuo e pela pool.
 *
 * O que continua exigindo gente: mapear as carteiras do projeto. Por isso o
 * monitor on-chain (`npm run monitor`) segue só com a lista.
 */

import { lerGuardado } from "./guardado";
import type { EstadoFluxo } from "./fluxo";
import { WATCHLIST, type WatchedToken } from "./watchlist";

export const ORIGEM = "carteira-binance" as const;

/**
 * Quanto tempo uma moeda fica em vista depois da última passagem pela carteira.
 *
 * NÃO MEDIDO: é higiene, para a lista não guardar para sempre moeda que a
 * Binance parou de movimentar. A medição acima é sobre moedas vistas em cinco
 * dias; trinta é folga larga sobre isso.
 */
export const VALIDADE_DIAS = 30;

const DIA = 86_400_000;

const NOTA =
  "Em vista: entrou sozinha, porque passou pela carteira quente da Binance na BNB Chain " +
  "com o perpétuo conferido pelo preço da pool. Ninguém mapeou as carteiras do projeto.";

/**
 * As moedas em vista, a partir do estado do gravador de fluxo.
 *
 * Fica de fora tudo o que está em `WATCHLIST`, INCLUSIVE as aposentadas: aposentar
 * é decisão de gente (`watchlist.ts` explica), e a moeda não pode voltar pela
 * porta dos fundos só porque a Binance a movimentou.
 */
export function emVistaDe(
  estado: EstadoFluxo | null,
  agora: number,
  lista: WatchedToken[] = WATCHLIST,
): WatchedToken[] {
  if (!estado?.tokens) return [];
  const naLista = new Set(lista.map((t) => t.symbol));
  const porPerp = new Map<string, { t: WatchedToken; visto: number }>();
  for (const [contrato, id] of Object.entries(estado.tokens)) {
    if (!id?.perp || naLista.has(id.perp)) continue;
    const visto = id.vistoEm ?? id.conferidoEm;
    // `NaN > x` é falso, e aí a moeda ficaria para sempre: sem data, fora
    // (armadilha nº 5).
    if (!Number.isFinite(visto) || agora - visto > VALIDADE_DIAS * DIA) continue;
    // Dois contratos para o mesmo perpétuo não apareceram nos 478 tokens de 23/09,
    // mas ponte e migração fazem isso. Fica o visto por último.
    const atual = porPerp.get(id.perp);
    if (atual && atual.visto >= visto) continue;
    porPerp.set(id.perp, {
      visto,
      t: { symbol: id.perp, chain: "bsc", contract: contrato, firstBlock: 0, wallets: [], note: NOTA, origem: ORIGEM },
    });
  }
  return [...porPerp.values()].map((x) => x.t).sort((a, b) => a.symbol.localeCompare(b.symbol));
}

// ------------------------------------------------ a tese, conferida adiante

/**
 * Quando a conferência para frente começa: o dia em que as em vista entraram no
 * ar. A medição acima é sobre o PASSADO de moedas escolhidas pelo fluxo de
 * cinco dias; o que ela prevê é que essas moedas continuem bombando mais que o
 * resto DAQUI EM DIANTE, e isso só se confere com dias que ainda não existiam.
 */
export const INICIO_ADIANTE = Date.UTC(2026, 8, 24);

export interface GrupoAdiante {
  moedas: number;
  moedaDias: number;
  /** Dias de alta ≥25% (fechamento sobre fechamento). */
  altas: number;
  /** Dias de queda ≤−25%. */
  quedas: number;
}

export interface Adiante {
  desde: number;
  /** Toda moeda que esteve em vista desde o início, contada a partir do dia seguinte à primeira passagem. */
  emVista: GrupoAdiante;
  /** A praça sem a lista e sem nada que tenha passado pela carteira. */
  resto: GrupoAdiante;
}

/**
 * Conta os dias de alta e de queda de 25% de cada grupo desde `INICIO_ADIANTE`.
 *
 * Três cortes que decidem se isto mede alguma coisa:
 *
 *   - o DIA DA CHEGADA não conta. A moeda costuma entrar na carteira porque o
 *     varejo a compra no meio do pump; contar esse dia seria a carteira
 *     "prevendo" o que a trouxe. Conta do dia UTC seguinte à primeira passagem.
 *   - o grupo é quem ESTEVE em vista, não quem está: quem sai por 30 dias sem
 *     passar é a menos movimentada, e tirá-la da conta inflaria o grupo.
 *   - o dia de hoje, ainda aberto, não conta: a vela parcial compara meio dia
 *     com um dia inteiro.
 */
export function medirAdiante(
  series: Map<string, { time: number; close: number }[]>,
  estado: EstadoFluxo | null,
  agora: number,
  lista: WatchedToken[] = WATCHLIST,
): Adiante {
  const naLista = new Set(lista.map((t) => t.symbol));
  const naCarteira = new Set<string>();
  const inicioDe = new Map<string, number>();
  for (const id of Object.values(estado?.tokens ?? {})) {
    if (!id?.perp) continue;
    naCarteira.add(id.perp);
    if (naLista.has(id.perp)) continue;
    const visto = id.vistoEm ?? id.conferidoEm;
    // Em vista em algum momento desde o início: visto dentro da validade dele.
    if (!Number.isFinite(visto) || visto < INICIO_ADIANTE - VALIDADE_DIAS * DIA) continue;
    const primeiro = id.primeiroVisto ?? 0;
    const dia = Math.max(INICIO_ADIANTE, (Math.floor(primeiro / DIA) + 1) * DIA);
    const atual = inicioDe.get(id.perp);
    if (atual === undefined || dia < atual) inicioDe.set(id.perp, dia);
  }

  const vazio = (): GrupoAdiante => ({ moedas: 0, moedaDias: 0, altas: 0, quedas: 0 });
  const emVista = vazio();
  const resto = vazio();
  for (const [s, v] of series) {
    const g = inicioDe.has(s) ? emVista : !naLista.has(s) && !naCarteira.has(s) ? resto : null;
    if (!g) continue;
    const inicio = inicioDe.get(s) ?? INICIO_ADIANTE;
    let contou = false;
    for (let i = 1; i < v.length; i++) {
      const abre = v[i].time * 1000;
      if (abre < inicio || abre + DIA > agora) continue;
      const r = v[i].close / v[i - 1].close - 1;
      if (!Number.isFinite(r)) continue;
      g.moedaDias++;
      contou = true;
      if (r >= 0.25) g.altas++;
      if (r <= -0.25) g.quedas++;
    }
    if (contou) g.moedas++;
  }
  return { desde: INICIO_ADIANTE, emVista, resto };
}

function valido(d: unknown): EstadoFluxo | null {
  const e = d as EstadoFluxo;
  return e && typeof e.tokens === "object" && e.tokens !== null ? e : null;
}

/** As em vista de agora, lidas da camada certa para o ambiente (`lib/guardado.ts`). */
export async function getEmVista(): Promise<WatchedToken[]> {
  const g = await lerGuardado<EstadoFluxo>("fluxo-binance.json", valido, 600);
  return emVistaDe(g?.dado ?? null, Date.now());
}

/**
 * A moeda de volta a partir da linha do retrato, que já carrega contrato e rede.
 *
 * É o que a camada viva usa para refazer as em vista sem ler o estado do fluxo
 * de novo: o conjunto certo é o do retrato que está na tela.
 */
export function daLinha(r: { symbol: string; chain: string; contract: string; note?: string }): WatchedToken {
  return {
    symbol: r.symbol,
    chain: r.chain as WatchedToken["chain"],
    contract: r.contract,
    firstBlock: 0,
    wallets: [],
    note: r.note ?? NOTA,
    origem: ORIGEM,
  };
}

/**
 * As em vista que SAÍRAM de vista com posição aberta na carteira, de volta ao
 * retrato até a posição fechar.
 *
 * Sem isto, a moeda que passasse 30 dias sem tocar a carteira da Binance
 * sumia do retrato no meio de uma posição, e o motor da carteira só tem o
 * prazo de 14 dias para fechar moeda ausente — no último preço visto, sem
 * stop, sem alvo e sem caminho de velas nesse meio-tempo (`rodar`, em
 * `lib/carteira.ts`). A regra de saída é da carteira; quem decide quando a
 * moeda deixa de ser lida não pode atropelá-la. Contrato e rede vêm da linha
 * do retrato anterior, que é onde eles estavam da última vez.
 */
export function presasPorPosicao(
  abertas: string[],
  cobertas: Set<string>,
  anteriores: { symbol: string; ticker: string; chain: string; contract: string; note?: string; origem?: string }[],
): WatchedToken[] {
  const tickers = new Set(abertas);
  return anteriores
    .filter((r) => r.origem && tickers.has(r.ticker) && !cobertas.has(r.symbol))
    .map(daLinha);
}

// ------------------------------------------------------------------ o aviso

/** Teto de avisos de entrada por execução, pelo mesmo motivo do da carteira. */
export const MAX_AVISOS = 8;

/**
 * O que ainda não foi anunciado. `primeira` é o arquivo sem memória nenhuma:
 * aí nada é novo, e sai uma mensagem só com o conjunto inteiro.
 */
export function novasEmVista(
  estado: EstadoFluxo | null,
  atuais: WatchedToken[],
): { primeira: boolean; novas: WatchedToken[] } {
  const avisadas = estado?.emVista?.avisadas;
  if (!avisadas) return { primeira: true, novas: [] };
  const ja = new Set(avisadas);
  return { primeira: false, novas: atuais.filter((t) => !ja.has(t.symbol)) };
}

/**
 * A memória depois de avisar. Guarda as avisadas que ainda estão em vista mais
 * as de agora: a que sair e voltar meses depois é anunciada de novo, que é o
 * certo — voltou a ser movimentada.
 */
export function avisadasDepois(anteriores: string[], atuais: WatchedToken[], avisadasAgora: string[]): string[] {
  const vivas = new Set(atuais.map((t) => t.symbol));
  return [...new Set([...anteriores.filter((s) => vivas.has(s)), ...avisadasAgora])].sort();
}

const tk = (s: string) => s.replace(/USDT$/, "");

function preco(v: number): string {
  return `US$ ${v.toPrecision(4).replace(".", ",")}`;
}

function mil(v: number): string {
  return `US$ ${Math.round(v / 1e3).toLocaleString("pt-BR")} mil`;
}

/** Texto puro: quem manda escapa para o MarkdownV2. */
export function textoEmVista(
  t: WatchedToken,
  extra: {
    preco?: number | null;
    variacao24h?: number | null;
    /** O que passou nesta execução, em dólares: compra/venda na DEX, depósito/saque. */
    fluxo?: { cmp: number; vnd: number; dep: number; saq: number } | null;
  } = {},
): string {
  const linhas = [
    `👀 EM VISTA · ${tk(t.symbol)}`,
    "Passou pela carteira quente da Binance e entrou no painel sozinha · não é recomendação",
  ];
  if (extra.preco != null && Number.isFinite(extra.preco) && extra.preco > 0) {
    const v = extra.variacao24h;
    linhas.push(
      `perpétuo ${t.symbol} a ${preco(extra.preco)}` +
        (v != null && Number.isFinite(v) ? ` · ${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1).replace(".", ",")}% em 24h` : ""),
    );
  }
  const f = extra.fluxo;
  if (f && [f.cmp, f.vnd, f.dep, f.saq].every(Number.isFinite)) {
    linhas.push(`nesta leitura: varejo comprou ${mil(f.cmp)} e vendeu ${mil(f.vnd)} na DEX · depósitos ${mil(f.dep)}, saques ${mil(f.saq)}`);
  }
  linhas.push("A leitura completa (estágio, viés, motor) sai no próximo retrato.");
  return linhas.join("\n");
}

export function textoLigado(atuais: WatchedToken[]): string {
  return [
    `✅ Moedas em vista ligadas: ${atuais.length} moedas que passaram pela carteira quente da Binance entraram no painel sozinhas.`,
    atuais.map((t) => tk(t.symbol)).join(", "),
    "Medido em 23/09: essas moedas tiveram dia de alta de 25% ou mais 3,8 vezes mais que o resto da Binance, " +
      "no mesmo tamanho. Isso diz que elas se mexem, não que dá para ganhar com elas. " +
      "Daqui em diante, cada moeda nova que entrar chega aqui.",
  ].join("\n");
}
