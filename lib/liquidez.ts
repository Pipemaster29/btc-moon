/**
 * A liquidez líquida dos bancos centrais, e o que ela tem a dizer sobre o BTC.
 *
 * A tese que este módulo mede é conhecida: dinheiro de banco central entra no
 * sistema, leva um trimestre para chegar aos ativos de risco, e o bitcoin é o
 * mais sensível deles. A conta é sempre a mesma:
 *
 *   LIQUIDEZ LÍQUIDA = balanço do Fed − conta do Tesouro − reverse repo
 *
 * O balanço é o dinheiro que o Fed criou. A conta do Tesouro (TGA) é o que o
 * governo arrecadou e ainda não gastou — está fora do sistema. O reverse repo é
 * o que os fundos devolveram ao Fed para render overnight — também fora. O que
 * sobra é o dinheiro que de fato circula.
 *
 * ---------------------------------------------------------------------------
 * O QUE A MEDIÇÃO DIZ, E É MENOS DO QUE O GRÁFICO SUGERE.
 *
 * Este arquivo mede o próprio indicador em vez de só desenhá-lo, e o resultado
 * pede honestidade. Sobre 490 semanas desde 2017:
 *
 *   EM NÍVEL, no lead de 13 semanas e na janela de dois anos, o ajuste é 0,71.
 *   Parece forte. Não é: são duas séries que subiram no período, e correlação
 *   entre séries com tendência é a armadilha mais velha da estatística. A prova
 *   está no perfil por lead na janela longa — 0,72 em 0 semanas e 0,68 em 26.
 *   Se o ajuste é o mesmo em qualquer defasagem, não existe defasagem: existe
 *   tendência compartilhada.
 *
 *   EM VARIAÇÃO — semana contra semana, que é o teste que a tendência não
 *   consegue falsificar — o ajuste no lead de 13 semanas é −0,005 em 490
 *   observações. Zero. O melhor lead em módulo da amostra inteira é 3 semanas
 *   com 0,093 e t = 2,08, que não sobrevive à correção por 27 leads testados
 *   (|t| ≈ 3,2).
 *
 *   FORA DA AMOSTRA, o ajuste em nível no lead de 13 semanas foi −0,09 entre
 *   2017 e 2020, +0,78 entre 2020 e 2023, e −0,02 de 2023 para cá. Funcionou
 *   num terço da história.
 *
 *   E O AJUSTE MÓVEL DE 52 SEMANAS oscilou de +0,89 a −0,82. Ele está positivo
 *   agora; esteve em −0,62 em fevereiro de 2025.
 *
 * Por isso o painel mostra as três coisas juntas: o ajuste em nível, que é o
 * número bonito; o ajuste em variação, que é o número honesto; e a série móvel,
 * que mostra quando a relação inverteu. Um indicador que não mostra a própria
 * validade é uma narrativa com eixo.
 *
 * O LEAD É FIXO EM 13 SEMANAS, e isso é deliberado. Escolher a cada rodada o
 * lead que melhor se ajusta é o caminho garantido para 0,9 de ajuste e zero de
 * previsão — o melhor lead se mexe de 15 para 19 para 1 para 3 semanas conforme
 * a janela. Um trimestre é a defasagem que a tese afirma; ela fica fixa, e o
 * ajuste medido contra ela é que varia.
 */

import { getCandles } from "./bitstamp";

/**
 * O FRED recusa requisição sem user-agent que se identifique.
 *
 * Medido: o padrão do Node e qualquer disfarce de navegador levam 503; um
 * user-agent com nome e endereço de contato passa. É a política de robô normal
 * deles, e a resposta certa é obedecer, não fingir ser Chrome.
 */
const UA = "btc-moon/1.0 (+https://github.com/Pipemaster29/btc-moon)";

/** As três séries que compõem a conta, todas semanais ou diárias e públicas. */
const SERIES = {
  /** Balanço total do Fed, em milhões de dólares, quarta-feira a quarta-feira. */
  balanco: "WALCL",
  /** Conta geral do Tesouro no Fed, em milhões, mesma cadência. */
  tesouro: "WTREGEN",
  /** Reverse repo overnight, em BILHÕES e diário — a unidade diferente já custou
   *  um erro de mil vezes em quem faz essa conta na mão. */
  repo: "RRPONTSYD",
} as const;

/** A defasagem afirmada pela tese. Fixa de propósito — ver o cabeçalho. */
export const LEAD_SEMANAS = 13;

/** A janela desenhada e medida: dois anos de leituras semanais. */
export const JANELA_SEMANAS = 104;

/** O tamanho da janela do ajuste móvel, que mostra quando a relação inverte. */
const MOVEL_SEMANAS = 52;

/** Acima disto o lead está acompanhando; abaixo do negativo, invertido. */
const LIMIAR_ACOMPANHANDO = 0.5;
const LIMIAR_INVERTIDO = -0.3;

export type EstadoLead = "acompanhando" | "descolado" | "invertido";

export interface PontoSerie {
  /** Quarta-feira da leitura do Fed, em AAAA-MM-DD. */
  data: string;
  /** Log do preço do BTC, padronizado na janela. Nulo no trecho projetado. */
  btcZ: number | null;
  /** Liquidez de 13 semanas antes, padronizada na mesma janela. */
  liqZ: number | null;
  /** Está à frente de hoje — é projeção, não observação. */
  futuro: boolean;
}

export interface Liquidez {
  /** Data da última leitura publicada pelo Fed. */
  atualizadoEm: string;
  /** Liquidez líquida de agora, em trilhões de dólares. */
  atual: number;
  /** Quanto ela andou nas 13 semanas que já estão no cano. */
  variacaoLead: number;
  lead: number;
  janela: number;

  /** Correlação em NÍVEL no lead, na janela desenhada. O número bonito. */
  ajusteNivel: number;
  /** Correlação em VARIAÇÃO no lead, na janela desenhada. */
  ajusteVariacao: number;
  /** A mesma, sobre a amostra inteira desde 2017. O número honesto. */
  ajusteVariacaoTotal: number;
  /** Quantas semanas entraram no número honesto. */
  amostraTotal: number;

  estado: EstadoLead;
  /** Para onde aponta o trecho já contratado da projeção. */
  direcao: "subindo" | "caindo";
  /**
   * Desvio padrão da distância entre as duas linhas na janela, em sigmas.
   *
   * É a largura do cone de projeção, e ela é MEDIDA e não escolhida: diz o
   * quanto o bitcoin costumou ficar longe da linha de liquidez deslocada. Cone
   * desenhado por gosto é decoração que finge ser intervalo de confiança.
   */
  erroTipico: number;

  serie: PontoSerie[];
  /** Ajuste em nível para cada lead de 0 a 26 semanas, na janela desenhada. */
  perfilLead: { lead: number; ajuste: number }[];
  /** Ajuste móvel de 52 semanas no lead fixo, ao longo de toda a história. */
  movel: { data: string; ajuste: number }[];
}

// --------------------------------------------------------------------- fonte

type Serie = Map<string, number>;

async function serieFred(id: string): Promise<Serie> {
  const res = await fetch(`https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`, {
    headers: { "user-agent": UA },
    signal: AbortSignal.timeout(20_000),
    // O Fed publica o H.4.1 uma vez por semana, quinta à tarde. Seis horas de
    // cache não perdem nada e não castigam um servidor público.
    next: { revalidate: 21_600 },
  });
  if (!res.ok) throw new Error(`FRED respondeu ${res.status} para ${id}`);

  const out: Serie = new Map();
  for (const linha of (await res.text()).trim().split("\n").slice(1)) {
    const [data, valor] = linha.trim().split(",");
    const n = Number(valor);
    // O FRED marca buraco com ponto ou com nada; os dois têm de sair fora, e
    // `Number("")` é ZERO, que entraria como leitura de verdade.
    if (!valor || valor === "." || !Number.isFinite(n)) continue;
    out.set(data, n);
  }
  if (out.size === 0) throw new Error(`FRED devolveu ${id} vazio`);
  return out;
}

/**
 * Casa uma série diária com uma semanal, pegando a leitura mais recente até
 * cada data pedida.
 *
 * Percorre as duas listas UMA vez em vez de varrer a diária inteira para cada
 * data da semanal: são 5.500 dias de BTC contra 1.230 semanas de balanço, e a
 * varredura ingênua faz quase sete milhões de comparações a cada render.
 * As duas chegam ordenadas, então um ponteiro basta.
 */
function casarPorData(
  alvos: string[],
  datas: string[],
  serie: Serie,
): (number | null)[] {
  const out: (number | null)[] = [];
  let i = 0;
  let ultimo: number | null = null;
  for (const alvo of alvos) {
    while (i < datas.length && datas[i] <= alvo) {
      ultimo = serie.get(datas[i]) ?? ultimo;
      i++;
    }
    out.push(ultimo);
  }
  return out;
}

// ------------------------------------------------------------------ estatística

function media(xs: number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function desvio(xs: number[], m = media(xs)): number {
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length);
}

/**
 * Correlação de Pearson. Devolve zero quando alguma das séries é constante —
 * a divisão daria NaN, e NaN espalhado por um gráfico some sem avisar.
 */
export function correlacao(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  const ma = media(a.slice(0, n));
  const mb = media(b.slice(0, n));
  let num = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    va += x * x;
    vb += y * y;
  }
  if (va === 0 || vb === 0) return 0;
  return num / Math.sqrt(va * vb);
}

/** Padroniza uma série na própria média e desvio: é o que põe as duas no mesmo eixo. */
function padronizar(xs: number[]): number[] {
  const m = media(xs);
  const s = desvio(xs, m);
  return s === 0 ? xs.map(() => 0) : xs.map((x) => (x - m) / s);
}

interface Par {
  data: string;
  liq: number;
  btc: number;
}

/**
 * Correlação entre a liquidez de t−lead e o BTC de t.
 *
 * `modo` decide o que se compara, e a diferença é a coisa toda: em NÍVEL duas
 * séries que sobem juntas dão 0,7 sem relação nenhuma; em VARIAÇÃO a tendência
 * some e sobra só o movimento comum.
 */
function ajusteNoLead(pares: Par[], lead: number, modo: "nivel" | "variacao"): number {
  const a: number[] = [];
  const b: number[] = [];
  for (let i = lead; i < pares.length; i++) {
    if (modo === "nivel") {
      a.push(pares[i - lead].liq);
      b.push(Math.log(pares[i].btc));
    } else if (i > lead) {
      a.push(pares[i - lead].liq - pares[i - lead - 1].liq);
      b.push(Math.log(pares[i].btc / pares[i - 1].btc));
    }
  }
  return correlacao(a, b);
}

// ----------------------------------------------------------------------- leitura

export async function getLiquidez(): Promise<Liquidez | null> {
  let balanco: Serie;
  let tesouro: Serie;
  let repo: Serie;

  try {
    [balanco, tesouro, repo] = await Promise.all([
      serieFred(SERIES.balanco),
      serieFred(SERIES.tesouro),
      serieFred(SERIES.repo),
    ]);
  } catch {
    // Fonte fora é fonte fora. Devolver nulo faz a página esconder o painel
    // inteiro, que é melhor do que desenhar um gráfico com meia série.
    return null;
  }

  const semanas = [...balanco.keys()].sort();
  const reposDaSemana = casarPorData(semanas, [...repo.keys()].sort(), repo);

  // A liquidez, em trilhões de dólares. O repo vem em bilhões: mil vezes menor.
  const liquidez: { data: string; v: number }[] = [];
  semanas.forEach((data, i) => {
    const saldo = balanco.get(data)!;
    const tga = tesouro.get(data);
    const rrp = reposDaSemana[i];
    if (tga === undefined || rrp === null) return;
    liquidez.push({ data, v: (saldo - tga - rrp * 1000) / 1e6 });
  });
  if (liquidez.length < JANELA_SEMANAS + LEAD_SEMANAS) return null;

  // O BTC no mesmo dia de cada leitura do Fed.
  const candles = await getCandles("1d").catch(() => []);
  if (candles.length === 0) return null;

  const porDia = new Map(
    candles.map((c) => [new Date(c.time * 1000).toISOString().slice(0, 10), c.close]),
  );
  const fechamentos = casarPorData(
    liquidez.map((p) => p.data),
    [...porDia.keys()].sort(),
    porDia,
  );

  const pares: Par[] = [];
  liquidez.forEach((p, i) => {
    const btc = fechamentos[i];
    if (btc === null || btc <= 0) return;
    pares.push({ data: p.data, liq: p.v, btc });
  });
  if (pares.length < JANELA_SEMANAS + LEAD_SEMANAS) return null;

  const janela = pares.slice(-JANELA_SEMANAS);

  // --------------------------------------------------------------- os ajustes
  const ajusteNivel = ajusteNoLead(janela, LEAD_SEMANAS, "nivel");
  const ajusteVariacao = ajusteNoLead(janela, LEAD_SEMANAS, "variacao");
  const ajusteVariacaoTotal = ajusteNoLead(pares, LEAD_SEMANAS, "variacao");

  const perfilLead = Array.from({ length: 27 }, (_, lead) => ({
    lead,
    ajuste: ajusteNoLead(janela, lead, "nivel"),
  }));

  const movel: Liquidez["movel"] = [];
  for (let fim = MOVEL_SEMANAS + LEAD_SEMANAS; fim <= pares.length; fim++) {
    const trecho = pares.slice(fim - MOVEL_SEMANAS - LEAD_SEMANAS, fim);
    movel.push({
      data: trecho[trecho.length - 1].data,
      ajuste: ajusteNoLead(trecho, LEAD_SEMANAS, "nivel"),
    });
  }

  // ----------------------------------------------------------------- a série
  //
  // O eixo é compartilhado porque as duas séries foram PADRONIZADAS, e não
  // porque duas escalas foram encaixadas uma na outra. Dólares e desvios padrão
  // no mesmo gráfico com dois eixos seria inventar a correlação no alinhamento;
  // padronizadas, as duas medem a mesma coisa — distância da própria média.
  //
  // O trecho projetado são as 13 semanas de liquidez que já aconteceram e ainda
  // não venceram. Não é previsão de modelo: é dado publicado, deslocado.
  const ultimo = pares.length - 1;
  const primeiro = Math.max(0, ultimo - JANELA_SEMANAS + 1);

  const btcJanela = janela.map((p) => Math.log(p.btc));
  const btcZ = padronizar(btcJanela);

  // A liquidez deslocada cobre a janela E as 13 semanas à frente.
  const liqDeslocada: number[] = [];
  for (let i = primeiro; i <= ultimo + LEAD_SEMANAS; i++) {
    const origem = i - LEAD_SEMANAS;
    liqDeslocada.push(pares[Math.min(Math.max(origem, 0), ultimo)].liq);
  }
  const liqZ = padronizar(liqDeslocada);

  const semanaMs = 7 * 86_400_000;
  const serie: PontoSerie[] = liqDeslocada.map((_, i) => {
    const passado = primeiro + i <= ultimo;
    const data = passado
      ? pares[primeiro + i].data
      : new Date(Date.parse(`${pares[ultimo].data}T00:00:00Z`) + (primeiro + i - ultimo) * semanaMs)
          .toISOString()
          .slice(0, 10);
    return {
      data,
      btcZ: passado ? (btcZ[i] ?? null) : null,
      liqZ: liqZ[i],
      futuro: !passado,
    };
  });

  // --------------------------------------------------------------- o veredito
  const ultimoMovel = movel[movel.length - 1]?.ajuste ?? 0;
  const estado: EstadoLead =
    ultimoMovel >= LIMIAR_ACOMPANHANDO
      ? "acompanhando"
      : ultimoMovel <= LIMIAR_INVERTIDO
        ? "invertido"
        : "descolado";

  const residuos = serie
    .filter((p) => !p.futuro && p.btcZ !== null && p.liqZ !== null)
    .map((p) => (p.btcZ as number) - (p.liqZ as number));
  const erroTipico = residuos.length > 1 ? desvio(residuos) : 1;

  const contratado = serie.filter((p) => p.futuro).map((p) => p.liqZ ?? 0);
  const direcao =
    contratado.length > 1 && contratado[contratado.length - 1] >= contratado[0]
      ? "subindo"
      : "caindo";

  return {
    atualizadoEm: pares[ultimo].data,
    atual: pares[ultimo].liq,
    variacaoLead: pares[ultimo].liq - pares[ultimo - LEAD_SEMANAS].liq,
    lead: LEAD_SEMANAS,
    janela: JANELA_SEMANAS,
    ajusteNivel,
    ajusteVariacao,
    ajusteVariacaoTotal,
    amostraTotal: Math.max(0, pares.length - LEAD_SEMANAS - 1),
    estado,
    direcao,
    erroTipico,
    serie,
    perfilLead,
    movel,
  };
}
