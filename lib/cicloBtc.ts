/**
 * O padrão dos 1.064 / 364 dias do BTC — o post do 4chan de 12/12/2023 —, na
 * versão literal e numa versão que se corrige pelo preço. Pedido em 24/11/2026:
 * "coloque esse padrão no algoritmo [...] crie um que vai ajustando essas datas
 * [...] uma carteira ficcional lá do começo comprar e vender nessas datas".
 *
 * O post:   fundo 2015 → topo 2017 = 1.064 d;  topo 2017 → fundo 2018 = 364 d;
 *           fundo 2018 → topo 2021 = 1.064 d;  topo 2021 → fundo 2022 = 364 d;
 *           "o padrão imprime o topo deste ciclo em 06/10/2025".
 *
 * Conferido na Bitstamp (fechamentos e extremos diários), o padrão é melhor E
 * pior do que o post diz:
 *
 * - a previsão de 2023 acertou: o topo foi em 06/10/2025, a US$ 126.272. Pelos
 *   extremos reais, o fundo de 21/11/2022 + 1.064 dava 20/10/2025 — catorze
 *   dias de erro, dois anos antes;
 * - os números do post são arredondados: 2015→2017 foram 1.068 dias,
 *   2018→2021, 1.061, e 2021→2022 foram 376, não 364;
 * - o post começa em 2015 de propósito. O ciclo de 2011–2013 não cabe (fundo de
 *   11/2011 ao topo de 11/2013 são ~740 dias), e o urso de 2013–2015 durou 410;
 * - e o 364 de 2025 errou: 06/10/2026 fechou a US$ 85.554, e o fundo até
 *   aqui é o de 21/11/2026, a US$ 55.081 — 411 dias depois do topo.
 *
 * SÃO TRÊS CICLOS. Três compras e três vendas não demonstram nada, por melhor
 * que seja o resultado, e o padrão foi escrito depois de ver dois deles. O que
 * isto faz é pôr a ideia na tela de um jeito que não olha o futuro — cada
 * decisão só com os fechamentos até aquele dia — e com a carteira ao lado do
 * "comprar e segurar" no mesmo dia e com o mesmo dinheiro.
 *
 * A VERSÃO QUE SE CORRIGE, e o que ela faz com a data:
 *
 * - depois de um topo, a busca do fundo ABRE em topo + 364 dias. Daí em diante
 *   o fundo candidato é a menor mínima desde a abertura — ele anda para frente
 *   cada vez que o preço faz mínima nova, que é o "não era ali, fomos para
 *   novembro" do pedido;
 * - o fundo só é CONFIRMADO quando o fechamento sobe `subidaConfirma` acima
 *   dele. A compra é nesse fechamento, não no fundo: ninguém sabe que era o
 *   fundo no dia do fundo;
 * - comprado, se o fechamento perde o fundo confirmado, o fundo era falso: a
 *   carteira vende e a busca recomeça daquele dia;
 * - depois de um fundo, a busca do topo ABRE em fundo + 1.064 dias, e é o
 *   espelho: o topo candidato é a maior máxima desde a abertura, a venda é o
 *   fechamento `quedaConfirma` abaixo dele, e o fechamento acima do topo
 *   confirmado recompra.
 *
 * A data de cada ciclo é a do extremo CONFIRMADO do anterior, e não a do
 * calendário: o erro de um ciclo não se soma ao do seguinte.
 *
 * Unidades: `t` em SEGUNDOS desde 1970 (UTC), como as velas da Bitstamp;
 * preços em DÓLARES; `subidaConfirma`, `quedaConfirma` e `custo` são frações
 * (do PREÇO os dois primeiros, do VALOR negociado por lado o último); dias são
 * DIAS de calendário.
 */

export interface DiaBtc {
  /** Início do dia, em segundos desde 1970, UTC. */
  t: number;
  alta: number;
  baixa: number;
  fecho: number;
}

export interface RegrasCiclo {
  /** Do topo até a busca do fundo abrir. O post: 364. */
  diasAteFundo: number;
  /** Do fundo até a busca do topo abrir. O post: 1.064. */
  diasAteTopo: number;
  /** Quanto antes da data a busca abre. 0 é a data do post, sem folga. */
  antecedencia: number;
  /** Fração do PREÇO acima do fundo candidato que o confirma (e compra). */
  subidaConfirma: number;
  /** Fração do PREÇO abaixo do topo candidato que o confirma (e vende). */
  quedaConfirma: number;
  /** Fração do valor negociado, por lado. */
  custo: number;
  /** Dias da média exponencial dos fechamentos. */
  emaDias: number;
  /**
   * O que confirma o fundo: o fechamento `subidaConfirma` acima dele
   * ("subida"), o fechamento acima da EMA ("media") ou os dois juntos.
   */
  compra: "subida" | "media" | "ambos";
  /**
   * O que confirma o topo: a queda de `quedaConfirma` ("queda"), o fechamento
   * abaixo da EMA ("media") ou o PRIMEIRO dos dois.
   */
  venda: "queda" | "media" | "primeiro";
}

/**
 * As regras publicadas.
 *
 * Até a tarde de 24/11 eram 20% nas duas pontas. O pedido seguinte foi "tem que
 * pegar a EMA de 200, candle, variação %, para replicar no presente", e a
 * medição (`npm run medir-ciclo`, seção das médias) deu isto, com US$ 10 mil
 * em 30/11/2013:
 *
 *   compra 20%, venda 20%                          US$ 43,4 mi  (2013–19 130x, 2020–26 33x)
 *   compra 20%, venda: 20% OU abaixo da EMA 200    US$ 50,7 mi  (130x, 39x)
 *   EMA 200 nas duas pontas, dentro do calendário  US$ 15,2 mi  (48x, 32x), 12 operações
 *   EMA 200 sozinha, sem calendário                US$ 0,9 mi   (13x, 7x — o segurar fez 8x)
 *
 * Entrou a segunda. A compra pela média reprova por um motivo visível: a EMA
 * anda devagar, e quando a busca do fundo abre o preço costuma estar em cima
 * dela — em out–nov/2026 foram três compras e três "fundos falsos" seguidos.
 * Na venda é o contrário: o preço que despenca do topo cruza a média antes de
 * cair 20%. TODO o ganho é UMA decisão, a venda de 2025 (US$ 107.595 em
 * 22/10/2025 contra US$ 92.102 em 17/11/2025), e a regra foi escolhida
 * depois de vê-la: essa venda deixa de ser fora da amostra. A média de 200 é
 * a convenção de mercado, não a melhor da grade (a de 50 dá US$ 52 mi).
 */
export const REGRAS_CICLO: RegrasCiclo = {
  diasAteFundo: 364,
  diasAteTopo: 1064,
  antecedencia: 0,
  subidaConfirma: 0.2,
  quedaConfirma: 0.2,
  custo: 0.001,
  emaDias: 200,
  compra: "subida",
  venda: "primeiro",
};

/**
 * A média exponencial dos fechamentos, dia a dia, só com o passado: o valor do
 * dia i usa os fechamentos até i. Semeada pela média simples dos primeiros
 * `n`; antes disso, NaN — e NaN não confirma nada (a comparação dá falso).
 */
export function emaDiaria(dias: DiaBtc[], n: number): number[] {
  const k = 2 / (n + 1);
  const saida: number[] = new Array(dias.length).fill(NaN);
  let e = NaN;
  let soma = 0;
  let validos = 0;
  for (let i = 0; i < dias.length; i++) {
    const f = dias[i].fecho;
    if (!Number.isFinite(f) || f <= 0) {
      saida[i] = e;
      continue;
    }
    if (validos < n) {
      soma += f;
      validos++;
      if (validos === n) e = soma / n;
    } else {
      e = f * k + e * (1 - k);
    }
    saida[i] = e;
  }
  return saida;
}

/**
 * A semente: o topo de 30/11/2013 (máxima diária de US$ 1.163 na Bitstamp).
 * Escolhida à mão, e é a única coisa escolhida à mão: daí em diante cada data
 * sai da regra. Começar no fundo de 2015, como o post, daria ao algoritmo a
 * primeira compra perfeita de graça.
 */
export const SEMENTE = { t: Date.UTC(2013, 10, 30) / 1000, preco: 1163 };

export const CAPITAL_INICIAL = 10_000;

const DIA = 86_400;

export type TipoMarca = "compra" | "venda" | "fundo falso" | "topo falso";

export interface Marca {
  t: number;
  tipo: TipoMarca;
  /** Preço do fechamento em que a carteira operou. */
  preco: number;
  /** Patrimônio depois da operação, em dólares. */
  patrimonio: number;
}

export interface Extremo {
  tipo: "fundo" | "topo";
  /** O dia do extremo (mínima ou máxima diária). */
  t: number;
  preco: number;
  /** O dia em que a regra o confirmou. */
  confirmadoEm: number;
  /** Quantos dias depois do extremo anterior. */
  dias: number;
  /** A data que o calendário do post dava para este extremo. */
  previsto: number;
}

export interface EstadoAtual {
  /** O que a regra procura agora. */
  procurando: "fundo" | "topo";
  comprado: boolean;
  /** O extremo confirmado de que a contagem parte. */
  ancora: { t: number; preco: number; tipo: "fundo" | "topo" };
  /** Quando a busca abre (ou abriu). */
  abre: number;
  /** O candidato desde a abertura, ou nulo se a busca ainda não abriu. */
  candidato: { t: number; preco: number } | null;
  /** O fechamento que confirma o candidato, ou nulo se a busca não abriu. */
  gatilho: number | null;
  /** O fechamento que desfaz o último extremo confirmado (o "falso"). */
  desfaz: number;
  /** A próxima data do calendário depois desta: venda estimada se procura fundo, etc. */
  depois: number;
  /** A EMA do último dia, em dólares (NaN sem dias bastantes). */
  ema: number;
}

export interface Resultado {
  marcas: Marca[];
  extremos: Extremo[];
  curva: { t: number; patrimonio: number }[];
  estado: EstadoAtual;
  final: number;
  /**
   * O estado no fim de cada dia (o mesmo índice de `curva`): comprado, e — fora
   * dele — o topo CONFIRMADO de que a busca do fundo conta (nulo antes do
   * primeiro topo confirmado, quando a âncora ainda é a semente escolhida à mão).
   */
  dias?: { t: number; fecho: number; comprado: boolean; topo: number | null }[];
}

/**
 * A versão que se corrige. Decide no fechamento de cada dia, só com os dias
 * até ele, e opera nesse mesmo fechamento.
 */
export function simularAdaptativo(dias: DiaBtc[], regras: RegrasCiclo = REGRAS_CICLO, semente = SEMENTE): Resultado {
  let caixa = CAPITAL_INICIAL;
  let btc = 0;
  const marcas: Marca[] = [];
  const extremos: Extremo[] = [];
  const curva: Resultado["curva"] = [];
  const ema = emaDiaria(dias, regras.emaDias);
  const linha: NonNullable<Resultado["dias"]> = [];

  let procurando: "fundo" | "topo" = "fundo";
  let ancora = { t: semente.t, preco: semente.preco, tipo: "topo" as "fundo" | "topo" };
  let abre = semente.t + (regras.diasAteFundo - regras.antecedencia) * DIA;
  let candidato: { t: number; preco: number } | null = null;

  const operar = (d: DiaBtc, tipo: TipoMarca, compra: boolean) => {
    if (compra) {
      btc = (caixa * (1 - regras.custo)) / d.fecho;
      caixa = 0;
    } else {
      caixa = btc * d.fecho * (1 - regras.custo);
      btc = 0;
    }
    marcas.push({ t: d.t, tipo, preco: d.fecho, patrimonio: caixa + btc * d.fecho });
  };

  for (let i = 0; i < dias.length; i++) {
    const d = dias[i];
    if (d.t < semente.t || !Number.isFinite(d.fecho) || d.fecho <= 0) continue;
    const comprado = btc > 0;

    // O extremo confirmado foi desfeito: o fundo perdido com a carteira
    // comprada, ou o topo superado com ela vendida. A busca do mesmo extremo
    // recomeça HOJE — é o candidato andando para frente.
    if (ancora.tipo === "fundo" && procurando === "topo" && comprado && d.fecho < ancora.preco) {
      operar(d, "fundo falso", false);
      extremos.pop();
      const anterior = extremos.at(-1);
      ancora = anterior ? { t: anterior.t, preco: anterior.preco, tipo: "topo" } : { ...semente, tipo: "topo" };
      procurando = "fundo";
      abre = d.t;
      candidato = { t: d.t, preco: d.baixa };
    } else if (ancora.tipo === "topo" && procurando === "fundo" && !comprado && extremos.length > 0 && d.fecho > ancora.preco) {
      operar(d, "topo falso", true);
      extremos.pop();
      const anterior = extremos.at(-1)!;
      ancora = { t: anterior.t, preco: anterior.preco, tipo: "fundo" };
      procurando = "topo";
      abre = d.t;
      candidato = { t: d.t, preco: d.alta };
    } else if (d.t >= abre) {
      if (procurando === "fundo") {
        if (!candidato || d.baixa < candidato.preco) candidato = { t: d.t, preco: d.baixa };
        const subiu = d.fecho >= candidato.preco * (1 + regras.subidaConfirma);
        const acima = d.fecho > ema[i];
        if (regras.compra === "subida" ? subiu : regras.compra === "media" ? acima : subiu && acima) {
          operar(d, "compra", true);
          extremos.push({
            tipo: "fundo",
            t: candidato.t,
            preco: candidato.preco,
            confirmadoEm: d.t,
            dias: Math.round((candidato.t - ancora.t) / DIA),
            previsto: ancora.t + regras.diasAteFundo * DIA,
          });
          ancora = { t: candidato.t, preco: candidato.preco, tipo: "fundo" };
          procurando = "topo";
          abre = candidato.t + (regras.diasAteTopo - regras.antecedencia) * DIA;
          candidato = null;
        }
      } else {
        if (!candidato || d.alta > candidato.preco) candidato = { t: d.t, preco: d.alta };
        const caiu = d.fecho <= candidato.preco * (1 - regras.quedaConfirma);
        const abaixo = d.fecho < ema[i];
        if (regras.venda === "queda" ? caiu : regras.venda === "media" ? abaixo : caiu || abaixo) {
          if (btc > 0) operar(d, "venda", false);
          extremos.push({
            tipo: "topo",
            t: candidato.t,
            preco: candidato.preco,
            confirmadoEm: d.t,
            dias: Math.round((candidato.t - ancora.t) / DIA),
            previsto: ancora.t + regras.diasAteTopo * DIA,
          });
          ancora = { t: candidato.t, preco: candidato.preco, tipo: "topo" };
          procurando = "fundo";
          abre = candidato.t + (regras.diasAteFundo - regras.antecedencia) * DIA;
          candidato = null;
        }
      }
    }
    curva.push({ t: d.t, patrimonio: caixa + btc * d.fecho });
    linha.push({ t: d.t, fecho: d.fecho, comprado: btc > 0, topo: !(btc > 0) && procurando === "fundo" && ancora.tipo === "topo" && extremos.length > 0 ? ancora.t : null });
  }

  const ultimo = dias.at(-1)!;
  const aberta = ultimo.t >= abre && candidato;
  // O gatilho de hoje é o preço de fechamento que dispara a regra. Com a média
  // na regra, ele vira o mais exigente (compra) ou o mais próximo (venda) dos dois.
  const emaHoje = ema.at(-1) ?? NaN;
  const porPreco = aberta && candidato ? candidato.preco * (procurando === "fundo" ? 1 + regras.subidaConfirma : 1 - regras.quedaConfirma) : null;
  const gatilho =
    porPreco === null
      ? null
      : procurando === "fundo"
        ? regras.compra === "subida" ? porPreco : regras.compra === "media" ? emaHoje : Math.max(porPreco, emaHoje)
        : regras.venda === "queda" ? porPreco : regras.venda === "media" ? emaHoje : Math.max(porPreco, emaHoje);
  const estado: EstadoAtual = {
    procurando,
    comprado: btc > 0,
    ancora,
    abre,
    candidato: aberta ? candidato : null,
    gatilho,
    desfaz: ancora.preco,
    // Procurando fundo, a venda seguinte é o fundo (ainda por vir) + 1.064; sem
    // fundo confirmado, a melhor estimativa é contar do candidato de hoje.
    depois:
      procurando === "fundo"
        ? (aberta && candidato ? candidato.t : abre) + regras.diasAteTopo * DIA
        : abre + regras.antecedencia * DIA + regras.diasAteFundo * DIA,
    ema: emaHoje,
  };
  return { marcas, extremos, curva, estado, final: caixa + btc * ultimo.fecho, dias: linha };
}

/**
 * O post ao pé da letra: a partir da semente, compra em +364 dias, vende em
 * +1.064 dias depois da compra, e assim por diante — só calendário, sem olhar
 * o preço. É a régua que mostra o que a correção pelo preço acrescenta.
 */
export function simularCalendario(dias: DiaBtc[], regras: RegrasCiclo = REGRAS_CICLO, semente = SEMENTE): Resultado {
  let caixa = CAPITAL_INICIAL;
  let btc = 0;
  const marcas: Marca[] = [];
  const curva: Resultado["curva"] = [];
  let proxima = semente.t + regras.diasAteFundo * DIA;
  let compra = true;
  for (const d of dias) {
    if (d.t < semente.t || !Number.isFinite(d.fecho) || d.fecho <= 0) continue;
    if (d.t >= proxima) {
      if (compra) {
        btc = (caixa * (1 - regras.custo)) / d.fecho;
        caixa = 0;
      } else {
        caixa = btc * d.fecho * (1 - regras.custo);
        btc = 0;
      }
      marcas.push({ t: d.t, tipo: compra ? "compra" : "venda", preco: d.fecho, patrimonio: caixa + btc * d.fecho });
      proxima += (compra ? regras.diasAteTopo : regras.diasAteFundo) * DIA;
      compra = !compra;
    }
    curva.push({ t: d.t, patrimonio: caixa + btc * d.fecho });
  }
  const ultimo = dias.at(-1)!;
  return {
    marcas,
    extremos: [],
    curva,
    estado: {
      procurando: compra ? "fundo" : "topo",
      comprado: btc > 0,
      ancora: { t: marcas.at(-1)?.t ?? semente.t, preco: marcas.at(-1)?.preco ?? semente.preco, tipo: compra ? "topo" : "fundo" },
      abre: proxima,
      candidato: null,
      gatilho: null,
      desfaz: NaN,
      depois: proxima + (compra ? regras.diasAteTopo : regras.diasAteFundo) * DIA,
      ema: NaN,
    },
    final: caixa + btc * ultimo.fecho,
  };
}

/**
 * A média sozinha, sem calendário: comprado no fechamento acima da EMA,
 * vendido no fechamento abaixo. É a régua do "não precisa do padrão, a EMA 200
 * já faz isso" — e não faz: 114 operações desde 2013 e, de 2020 em diante,
 * menos que segurar.
 */
export function simularMedia(dias: DiaBtc[], n = REGRAS_CICLO.emaDias, custo = REGRAS_CICLO.custo, semente = SEMENTE): Resultado["curva"] & { operacoes?: number } {
  const ema = emaDiaria(dias, n);
  let caixa = CAPITAL_INICIAL;
  let btc = 0;
  let operacoes = 0;
  const curva: Resultado["curva"] = [];
  for (let i = 0; i < dias.length; i++) {
    const d = dias[i];
    if (d.t < semente.t || !Number.isFinite(d.fecho) || d.fecho <= 0) continue;
    if (Number.isFinite(ema[i]) && d.fecho > ema[i] !== btc > 0) {
      if (btc > 0) {
        caixa = btc * d.fecho * (1 - custo);
        btc = 0;
      } else {
        btc = (caixa * (1 - custo)) / d.fecho;
        caixa = 0;
      }
      operacoes++;
    }
    curva.push({ t: d.t, patrimonio: caixa + btc * d.fecho });
  }
  return Object.assign(curva, { operacoes });
}

/** Comprar na semente e não vender nunca: a régua que as duas precisam bater. */
export function simularSegurar(dias: DiaBtc[], custo = REGRAS_CICLO.custo, semente = SEMENTE): Resultado["curva"] {
  const primeiro = dias.find((d) => d.t >= semente.t && Number.isFinite(d.fecho) && d.fecho > 0);
  if (!primeiro) return [];
  const btc = (CAPITAL_INICIAL * (1 - custo)) / primeiro.fecho;
  return dias.filter((d) => d.t >= primeiro.t && Number.isFinite(d.fecho) && d.fecho > 0).map((d) => ({ t: d.t, patrimonio: btc * d.fecho }));
}

/** A maior queda do patrimônio, de pico a vale, em fração (negativa). */
export function quedaMaxima(curva: { patrimonio: number }[]): number {
  let pico = -Infinity;
  let pior = 0;
  for (const p of curva) {
    if (p.patrimonio > pico) pico = p.patrimonio;
    const q = p.patrimonio / pico - 1;
    if (q < pior) pior = q;
  }
  return pior;
}

/** Os dias de velas da Bitstamp, no formato deste módulo. */
export function diasDasVelas(velas: { time: number; high: number; low: number; close: number }[]): DiaBtc[] {
  return velas.map((v) => ({ t: v.time, alta: v.high, baixa: v.low, fecho: v.close }));
}

/** Os retornos de cada perna (compra → venda) do resultado, em fração. */
export function pernas(marcas: Marca[]): { de: Marca; ate: Marca | null; retorno: number }[] {
  const saida: { de: Marca; ate: Marca | null; retorno: number }[] = [];
  for (let i = 0; i < marcas.length; i++) {
    const m = marcas[i];
    if (m.tipo !== "compra" && m.tipo !== "topo falso") continue;
    const ate = marcas[i + 1] ?? null;
    saida.push({ de: m, ate, retorno: ate ? ate.patrimonio / m.patrimonio - 1 : NaN });
  }
  return saida;
}

/**
 * A PERNA VENDIDA (25/11/2026), a pedido: "pegar uma queda bruta seguida, tipo
 * de 85 mil para 55 mil praticamente em linha reta [...] não precisa acertar
 * topo ou fundo, e sim preços bons e maximizar o lucro. Mas de forma realista".
 *
 * Por cima da versão que se corrige: onde ela está em CAIXA depois de um topo
 * confirmado, a carteira fica VENDIDA no perpétuo. "urso" vende desde a venda do
 * topo; "capitulação" só a partir de `inicioDias` depois do topo, que é onde a
 * pergunta do pedido mora — a última perna, perto da data dos 364. A vendida
 * fecha quando a regra compra (fundo confirmado) ou recompra (topo falso).
 *
 * O que é realista aqui, e o que é suposição:
 * - perpétuo com margem isolada de todo o patrimônio e `alavancagem` sobre
 *   ela; liquida quando a margem que sobra não cobre a manutenção de 0,5% do
 *   nocional, e liquidado é patrimônio ZERO, não um número negativo;
 * - `custoLado` sobre o nocional na entrada e na saída (taxa + escorregada);
 * - o financiamento REAL do BTCUSDT da Binance desde 10/09/2019, em `taxaDia`
 *   (positivo = o vendido recebe). ANTES disso não havia perpétuo de BTC na
 *   Binance, e os ursos de 2014 e 2018 recebem a suposição do pior caso que a
 *   chamada passar — a medição usa o vendido PAGANDO 0,01% a cada 8 h;
 * - opera no fechamento do dia, como a comprada.
 *
 * Unidades: `inicioDias` em DIAS desde o topo confirmado; `custoLado`, fração
 * do NOCIONAL; `taxaDia(t)`, fração do nocional por DIA, `t` em SEGUNDOS.
 */
export interface RegrasVendida {
  modo: "urso" | "capitulacao";
  inicioDias: number;
  /** Só vende se o fechamento estiver abaixo da EMA da regra (não vende repique). */
  soAbaixoDaEma: boolean;
  alavancagem: number;
  custoLado: number;
}

export const REGRAS_VENDIDA: RegrasVendida = { modo: "urso", inicioDias: 0, soAbaixoDaEma: false, alavancagem: 1, custoLado: 0.001 };

export interface PernaVendida {
  de: number;
  ate: number | null;
  entrada: number;
  saida: number;
  /** Fração do patrimônio ganha (negativa = perdida) na perna. */
  retorno: number;
  /** O pior momento: quanto o preço chegou ACIMA da entrada, em fração do preço. */
  piorContra: number;
  financiamento: number;
  liquidada: boolean;
}

export function simularComVendida(
  dias: DiaBtc[],
  regras: RegrasCiclo = REGRAS_CICLO,
  vendida: RegrasVendida = REGRAS_VENDIDA,
  taxaDia: (t: number) => number = () => 0,
  semente = SEMENTE,
): { curva: Resultado["curva"]; pernas: PernaVendida[]; final: number; base: Resultado } {
  const base = simularAdaptativo(dias, regras, semente);
  const linha = base.dias ?? [];
  const ema = emaDiaria(dias, regras.emaDias);
  const emaDe = new Map(dias.map((d, i) => [d.t, ema[i]]));
  const porT = new Map(dias.map((d) => [d.t, d]));
  const MANUTENCAO = 0.005;

  // A comprada vale o que ela vale na curva da base; a vendida é escalada sobre
  // ela: o patrimônio é a base × o quanto as vendidas multiplicaram até ali.
  let fator = 1;
  const curva: Resultado["curva"] = [];
  const pernas: PernaVendida[] = [];
  let aberta: { de: number; entrada: number; margem: number; qtd: number; fin: number; pior: number } | null = null;

  const fechar = (t: number, preco: number, liquidada: boolean) => {
    const a = aberta!;
    const nocional = a.qtd * preco;
    const sobra = liquidada ? 0 : Math.max(0, a.margem + a.qtd * (a.entrada - preco) + a.fin - nocional * vendida.custoLado);
    const retorno = sobra - 1; // a margem inicial é 1 (o patrimônio todo)
    fator *= 1 + retorno;
    pernas.push({ de: a.de, ate: t, entrada: a.entrada, saida: preco, retorno, piorContra: a.pior / a.entrada - 1, financiamento: a.fin, liquidada });
    aberta = null;
  };

  for (let i = 0; i < linha.length; i++) {
    const l = linha[i];
    const d = porT.get(l.t);
    // O dia de ontem para hoje: a vendida aberta anda com o preço e o financiamento.
    if (aberta) {
      const a: NonNullable<typeof aberta> = aberta;
      a.fin += a.qtd * l.fecho * taxaDia(l.t);
      a.pior = Math.max(a.pior, d?.alta ?? l.fecho);
      const nocionalPior = a.qtd * a.pior;
      // Liquidação pela máxima do dia: a margem que sobraria no pior preço do dia.
      if (a.margem + a.qtd * (a.entrada - (d?.alta ?? l.fecho)) + a.fin < MANUTENCAO * nocionalPior) {
        fechar(l.t, d?.alta ?? l.fecho, true);
      }
    }
    const querVendida =
      !l.comprado &&
      l.topo !== null &&
      (vendida.modo === "urso" || l.t >= l.topo + vendida.inicioDias * DIA) &&
      (!vendida.soAbaixoDaEma || l.fecho < (emaDe.get(l.t) ?? NaN));
    if (aberta && !querVendida) fechar(l.t, l.fecho, false);
    else if (!aberta && querVendida && fator > 0) {
      const nocional = vendida.alavancagem; // sobre a margem 1
      aberta = { de: l.t, entrada: l.fecho, margem: 1 - nocional * vendida.custoLado, qtd: nocional / l.fecho, fin: 0, pior: l.fecho };
    }
    // O patrimônio do dia: a base escalada pelo que as vendidas fizeram, mais a aberta marcada.
    let marcaAberta = 1;
    if (aberta) {
      const a: NonNullable<typeof aberta> = aberta;
      marcaAberta = Math.max(0, a.margem + a.qtd * (a.entrada - l.fecho) + a.fin);
    }
    curva.push({ t: l.t, patrimonio: base.curva[i].patrimonio * fator * marcaAberta });
  }
  if (aberta) {
    const a: NonNullable<typeof aberta> = aberta;
    const u = linha.at(-1)!;
    pernas.push({ de: a.de, ate: null, entrada: a.entrada, saida: u.fecho, retorno: a.margem + a.qtd * (a.entrada - u.fecho) + a.fin - 1, piorContra: a.pior / a.entrada - 1, financiamento: a.fin, liquidada: false });
  }
  return { curva, pernas, final: curva.at(-1)?.patrimonio ?? NaN, base };
}

/**
 * O financiamento por dia, de uma lista de cobranças `{t (ms), r}` da Binance,
 * com a suposição `antes` (fração por dia) para os dias sem perpétuo. Positivo =
 * o vendido recebe.
 */
export function financiamentoDiario(cobrancas: { t: number; r: number }[], antes: number): (t: number) => number {
  const porDia = new Map<number, number>();
  for (const c of cobrancas) {
    const dia = Math.floor(c.t / 1000 / DIA) * DIA;
    porDia.set(dia, (porDia.get(dia) ?? 0) + c.r);
  }
  const inicio = cobrancas.length ? Math.floor(cobrancas[0].t / 1000 / DIA) * DIA + DIA : Infinity;
  return (t: number) => (t < inicio ? antes : porDia.get(Math.floor(t / DIA) * DIA) ?? 0);
}

/**
 * DATAS FIXAS (25/11/2026), a pedido: "fazendo uma média ± dos topos e fundos,
 * comprando perto do fundo e vendendo perto do topo, quanto daria?".
 *
 * Uma agenda de datas com a exposição desejada em cada uma — +1 todo em BTC, 0
 * em caixa, −1 vendido 1x no perpétuo —, e a carteira se ajusta a ela no
 * fechamento do primeiro dia na data ou depois dela. Entre duas datas as
 * UNIDADES ficam paradas (nada de rebalancear todo dia, que ninguém faz): a
 * conta é caixa + BTC × preço − vendido × preço, e o vendido recebe o
 * financiamento `taxaDia` sobre o nocional. Liquida, como na vendida, quando o
 * patrimônio não cobre 0,5% do nocional vendido.
 *
 * Unidades: `alvo` é fração do PATRIMÔNIO (−1 a +1); `t` em SEGUNDOS.
 */
export function simularExposicao(
  dias: DiaBtc[],
  agenda: { t: number; alvo: number }[],
  taxaDia: (t: number) => number = () => 0,
  custo = REGRAS_CICLO.custo,
  inicio = SEMENTE.t,
): { curva: Resultado["curva"]; final: number; operacoes: Ordem[] } {
  const fila = [...agenda].sort((a, b) => a.t - b.t);
  let caixa = CAPITAL_INICIAL;
  let comprado = 0;
  let vendido = 0;
  let k = 0;
  const curva: Resultado["curva"] = [];
  const operacoes: Ordem[] = [];
  let alvoAtual = 0;
  for (const d of dias) {
    if (d.t < inicio || !Number.isFinite(d.fecho) || d.fecho <= 0) continue;
    const p = d.fecho;
    if (vendido > 0) {
      caixa += vendido * p * taxaDia(d.t);
      // A liquidação pela máxima do dia, como em `simularComVendida`.
      const pior = Math.max(p, d.alta);
      if (caixa + comprado * pior - vendido * pior < 0.005 * vendido * pior) {
        caixa = 0;
        comprado = 0;
        vendido = 0;
      }
    }
    // Várias datas vencidas no mesmo dia (a agenda começa antes da moeda existir,
    // ou três parcelas que esperavam o extremo ser conhecido) valem como UMA
    // ordem, a da última: ninguém compra, vende e recompra no mesmo fechamento.
    let ultimaVencida = -1;
    while (k < fila.length && fila[k].t <= d.t) ultimaVencida = k++;
    const patrimonio = caixa + comprado * p - vendido * p;
    // Conta liquidada (patrimônio zero) não opera mais: as ordens vencidas passam.
    if (ultimaVencida >= 0 && patrimonio > 0) {
      const alvo = fila[ultimaVencida].alvo;
      // A taxa sai do patrimônio ANTES de dimensionar a ordem: sem isso, comprar
      // "todo o patrimônio" deixava o caixa em −0,1% — alavancagem que ninguém
      // escolheu, e que o motor da vendida não tem.
      const liquido = patrimonio / (1 + custo * Math.abs(alvo - alvoAtual));
      const novoComprado = (Math.max(0, alvo) * liquido) / p;
      const novoVendido = (Math.max(0, -alvo) * liquido) / p;
      const giro = (Math.abs(novoComprado - comprado) + Math.abs(novoVendido - vendido)) * p;
      caixa += (comprado - novoComprado) * p - (vendido - novoVendido) * p - giro * custo;
      if (alvo !== alvoAtual) {
        operacoes.push({
          t: d.t,
          de: alvoAtual,
          alvo,
          preco: p,
          compradoAntes: comprado,
          compradoDepois: novoComprado,
          vendidoAntes: vendido,
          vendidoDepois: novoVendido,
          custo: giro * custo,
          patrimonio: caixa + novoComprado * p - novoVendido * p,
        });
      }
      comprado = novoComprado;
      vendido = novoVendido;
      alvoAtual = alvo;
    }
    curva.push({ t: d.t, patrimonio: Math.max(0, caixa + comprado * p - vendido * p) });
  }
  return { curva, final: curva.at(-1)?.patrimonio ?? NaN, operacoes };
}

/**
 * Uma ordem da carteira, para a tela mostrar como ela seria dada na corretora:
 * a data e o preço do fechamento em que saiu, o que mudou nas unidades e o
 * patrimônio depois. `de` e `alvo` em fração do PATRIMÔNIO (−1 a +1);
 * quantidades em UNIDADES da moeda; `custo` e `patrimonio`, DÓLARES.
 */
export interface Ordem {
  t: number;
  de: number;
  alvo: number;
  preco: number;
  compradoAntes: number;
  compradoDepois: number;
  vendidoAntes: number;
  vendidoDepois: number;
  custo: number;
  patrimonio: number;
}

/**
 * A exposição diária da publicada — +1 comprado à vista, −1 vendido 1x no
 * perpétuo, 0 caixa —, como agenda para `simularExposicao`. É o que permite
 * aplicar as datas do BTC a outra moeda, ou montar o livro de ordens: as
 * mesmas decisões, contadas em unidades. `soComprada` troca a vendida por
 * caixa (a carteira só à vista).
 */
export function agendaDaPublicada(r: ReturnType<typeof simularComVendida>, soComprada = false): { t: number; alvo: number }[] {
  const ultimo = r.base.dias?.at(-1)?.t ?? -Infinity;
  const vendidas = r.pernas.filter((p) => p.retorno !== 0 || p.ate === null);
  const agenda: { t: number; alvo: number }[] = [];
  let anterior = NaN;
  for (const l of r.base.dias ?? []) {
    const vendido = !soComprada && vendidas.some((p) => l.t >= p.de && l.t < (p.ate ?? ultimo + 1));
    const alvo = l.comprado ? 1 : vendido ? -1 : 0;
    if (alvo !== anterior) agenda.push({ t: l.t, alvo });
    anterior = alvo;
  }
  return agenda;
}

/**
 * A agenda das datas fixas. `ancoras` são os extremos de que cada contagem parte
 * (com o dia em que ele PASSOU A SER CONHECIDO), e cada um marca o seguinte:
 * topo + `ateFundo` dias é a data de compra, fundo + `ateTopo` a de venda. A
 * troca é feita em `parcelas` iguais, espalhadas de −`faixa` a +`faixa` dias da
 * data; parcela que cairia antes de o extremo ser conhecido sai no dia em que
 * ele é conhecido. `vendida` leva a venda até −1 em vez de 0.
 */
export function agendaDasDatas(
  ancoras: { tipo: "fundo" | "topo"; t: number; conhecidoEm: number }[],
  o: { ateFundo: number | ((i: number) => number); ateTopo: number | ((i: number) => number); faixa: number; parcelas: number; vendida: boolean },
): { t: number; alvo: number }[] {
  const agenda: { t: number; alvo: number }[] = [];
  let iFundo = 0;
  let iTopo = 0;
  for (const a of ancoras) {
    const compra = a.tipo === "topo";
    const dias = compra
      ? typeof o.ateFundo === "number" ? o.ateFundo : o.ateFundo(iFundo++)
      : typeof o.ateTopo === "number" ? o.ateTopo : o.ateTopo(iTopo++);
    const centro = a.t + dias * DIA;
    // A primeira compra sai do caixa: antes da primeira âncora não há vendida aberta.
    const de = compra ? (o.vendida && agenda.length > 0 ? -1 : 0) : 1;
    const ate = compra ? 1 : o.vendida ? -1 : 0;
    for (let k = 1; k <= o.parcelas; k++) {
      const desvio = o.parcelas === 1 ? 0 : -o.faixa + (2 * o.faixa * (k - 1)) / (o.parcelas - 1);
      agenda.push({ t: Math.max(a.conhecidoEm, centro + desvio * DIA), alvo: de + ((ate - de) * k) / o.parcelas });
    }
  }
  return agenda;
}
