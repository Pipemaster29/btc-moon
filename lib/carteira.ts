/**
 * Mil dólares de mentira seguindo as calls de verdade.
 *
 * O `lib/placar.ts` já mede se os vieses separam da referência, e a resposta
 * dele é honesta e desconfortável: não separam. Mas ele mede em pontos
 * percentuais de retorno mediano, e isso não responde a pergunta que qualquer
 * pessoa faz primeiro — "se eu tivesse seguido, quanto eu teria hoje?".
 *
 * São perguntas diferentes e as duas importam. Um viés pode separar +0,5 p.p. na
 * mediana e ainda quebrar a conta, porque a mediana não sabe de tamanho de
 * posição, de custo, nem de quantas posições estão abertas ao mesmo tempo. E o
 * contrário também: pode não separar na mediana e mesmo assim sobreviver, se as
 * poucas que dão certo derem muito certo. A carteira é o teste que junta as duas
 * coisas, e é o teste que dói.
 *
 * ELA COMEÇA HOJE, e não sobre o histórico inteiro, de propósito. Rodar o motor
 * para trás sobre os dois meses gravados daria um número imediato e um número
 * enganoso: as regras do painel foram sendo ajustadas ao longo desses dois meses
 * — o freio de perfil, o de emissão, a trava de alta — e todas elas foram
 * escritas DEPOIS de ver os dados. Um resultado retrospectivo mediria o quanto
 * eu ajustei o painel olhando para o passado, e não o quanto ele acerta.
 *
 * O QUE ISTO NÃO MODELA, e cada um destes empurra o resultado para cima:
 *
 *   FINANCIAMENTO   posição vendida paga funding a cada oito horas, e nestas
 *                   moedas ele chega a valer dezenas de por cento ao ano. Não
 *                   entra na conta.
 *   EXECUÇÃO        o preço usado é o do retrato. Na vida real a ordem sai
 *                   segundos ou minutos depois, e numa moeda que anda 100% num
 *                   dia esses minutos custam.
 *   PROFUNDIDADE    o custo de 0,15% por lado é uma estimativa fixa. Numa pool
 *                   de dois mil dólares — a C tem exatamente isso — uma ordem de
 *                   sessenta dólares já move o preço mais do que isso.
 *   LIQUIDAÇÃO      não há alavancagem aqui, então não há chamada de margem. Com
 *                   alavancagem, o stop de 25% viraria perda total muito antes.
 */

import { readFile } from "node:fs/promises";

export type Lado = "long" | "short";
export type Motivo = "painel mudou" | "stop" | "alvo" | "prazo" | "liquidada";

export interface Aberta {
  symbol: string;
  lado: Lado;
  /** Quando entrou, em milissegundos. */
  abertaEm: number;
  precoEntrada: number;
  /** Dólares alocados na entrada, já descontado o custo. */
  valor: number;
  forca: number;
  /** Último preço visto, para marcar a posição a mercado. */
  precoAtual: number;
  /** Retorno SOBRE A MARGEM, já alavancado e com custos e financiamento dentro. */
  retorno: number;
  /** Financiamento acumulado desde a abertura, em fração da margem. */
  funding: number;
  /** Preço em que a corretora liquidaria a posição. */
  precoLiquidacao: number;
  /** Quando o financiamento foi cobrado pela última vez. */
  ultimoFunding: number;
  /** Última taxa vista, para o caso de o retrato seguinte não trazer nenhuma. */
  ultimaTaxa: number | null;
}

export interface Fechada {
  symbol: string;
  lado: Lado;
  abertaEm: number;
  fechadaEm: number;
  precoEntrada: number;
  precoSaida: number;
  forca: number;
  motivo: Motivo;
  /** Retorno sobre a margem, líquido de custos e financiamento. */
  retorno: number;
  /** Quanto do resultado foi comido por financiamento, em fração da margem. */
  funding: number;
  /** Resultado em dólares. */
  resultado: number;
  /** Quantos dias a posição ficou de pé. */
  dias: number;
}

export interface Carteira {
  comecouEm: number;
  atualizadoEm: number;
  /** Dinheiro parado. */
  caixa: number;
  /** Caixa mais o valor de mercado das posições abertas. */
  patrimonio: number;
  /** Patrimônio ÷ capital inicial − 1. */
  retorno: number;
  abertas: Aberta[];
  fechadas: Fechada[];
  /** Quantas fecharam no positivo, sobre quantas fecharam. */
  acertos: number;
  encerradas: number;
  /** Por que as posições fecharam — o mapa de saída é metade da estratégia. */
  porMotivo: Record<string, { n: number; retornoMedio: number }>;
  /** O mesmo, separado por lado. */
  porLado: Record<string, { n: number; retornoMedio: number; acertos: number }>;
}

// ------------------------------------------------------------------ as regras

/** Com quanto ela começa. */
export const CAPITAL_INICIAL = 1000;

/**
 * Quanto do patrimônio entra em cada call, por força da leitura.
 *
 * Dimensionado pelo RISCO e não pelo capital: cada posição arrisca uma fração
 * fixa do patrimônio até o stop, e o tamanho sai dessa conta. Com stop em 25% e
 * alavancagem de 3, arriscar 1% do patrimônio pede margem de 1,33% — que
 * controla 4% em posição.
 *
 * Por que arriscar tão pouco: o painel emite treze calls ao mesmo tempo num dia
 * normal, e essas moedas andam 8% num dia comum. Se todas as treze batessem no
 * stop no mesmo dia, a conta perderia 19,5%. Tamanho maior não seria
 * agressividade, seria ignorar quantas posições o próprio painel abre de uma
 * vez.
 *
 * A força vem de `lerVies` e vale o que ela diz valer: 3 é a regra com o
 * refinamento mais forte medido, 1 é a que sobrevive por pouco.
 */
export const RISCO_POR_FORCA: Record<number, number> = { 3: 0.015, 2: 0.01, 1: 0.005 };

/**
 * Teto de MARGEM comprometida ao mesmo tempo.
 *
 * Sem ele, um dia com vinte calls colocaria tudo na mesa. Metade parada é o que
 * garante que a carteira sobreviva para continuar medindo — que é o objetivo
 * dela, já que ela existe para produzir amostra e não lucro.
 *
 * É margem e não nocional: a 3x, metade do patrimônio em margem controla uma
 * vez e meia o patrimônio em posição. O que limita quantas calls cabem é o
 * dinheiro que sai do caixa, e o risco agregado já está limitado pelo tamanho de
 * cada uma — treze calls a 1,5% somam 19,5% do patrimônio se TODAS baterem no
 * stop no mesmo dia.
 */
export const EXPOSICAO_MAXIMA = 0.5;

/**
 * Quanto a conta pode perder se TUDO bater no stop no mesmo dia.
 *
 * O teto de margem sozinho deixou de proteger quando a alavancagem entrou: a
 * margem por call caiu para um terço, então cabem três vezes mais posições
 * dentro dos mesmos 50%. Medido no teste de quarenta calls simultâneas, a
 * carteira passou de 9 para 26 posições abertas — 39% de risco agregado.
 *
 * Cripto tem dias em que a lista inteira cai 25% junto, e é exatamente esse o
 * tamanho do stop. Um quarto da conta é o que se aceita perder num dia desses;
 * o resto precisa sobreviver para continuar medindo.
 */
export const RISCO_TOTAL_MAXIMO = 0.25;

/**
 * Onde a posição morre.
 *
 * Vinte e cinco por cento é perto de três desvios de UM DIA nestas moedas: o
 * `npm run estudar` mede volatilidade diária de 7% a 10% na maioria delas. Mais
 * apertado que isso e o stop viraria ruído de um dia normal; mais largo e ele
 * deixaria de proteger.
 */
export const STOP = 0.25;

/**
 * Onde ela realiza.
 *
 * Sai da assimetria medida, que é o único motivo pelo qual a regra de compra
 * deste painel existe: moeda pequena e derretida sobe mais de 20% em 21,0% das
 * semanas contra 3,8% que caem mais de 20%. Quarenta por cento é o dobro disso —
 * pega a cauda que sustenta a regra sem esperar a moeda dobrar.
 */
export const ALVO = 0.4;

/**
 * Até quando a call continua sendo a mesma call.
 *
 * As duas regras direcionais do painel foram medidas em janelas de sete e
 * catorze dias. Passado isso, segurar a posição deixa de ser seguir a leitura e
 * passa a ser uma aposta minha, que ninguém mediu.
 */
export const PRAZO_DIAS = 14;

/**
 * Custo de ida e volta, por lado.
 *
 * 0,05% de taxa de taker mais 0,10% de escorregada. É estimativa, e a nota no
 * topo do arquivo diz por que ela é otimista nas moedas de pool rasa.
 */
export const CUSTO = 0.0015;

/**
 * Salto de preço entre dois retratos que só pode ser erro de dado.
 *
 * SEM ISTO UMA LINHA DE LIXO QUEBRA A CARTEIRA INTEIRA, e não é hipótese: o JCT
 * já foi gravado no histórico a 2,9e-27, quinze ordens de grandeza abaixo do
 * preço dele. Reproduzido — preço 1, depois 2,9e-27, depois 1,02 — a carteira
 * fecha no stop a −100%, REABRE no preço de lixo e fecha no alvo com ganho de
 * 3,5e+28%. Mil dólares viram 1,3e+28.
 *
 * Os retratos saem a cada quarenta minutos. Nenhum mercado real faz dez vezes
 * nesse intervalo — a AKE, que dobrou num dia, andou 52% no melhor par de
 * retratos. Dez vezes é folgado de propósito: não serve para pegar pool rasa
 * desalinhada, serve para pegar lixo, exatamente como o freio equivalente do
 * `lib/overview.ts`.
 */
export const SALTO_ABSURDO = 10;

/**
 * Quantas vezes o patrimônio cada posição controla.
 *
 * TRÊS É O TETO QUE PRESERVA O STOP, e o número sai de uma conta, não de gosto.
 * O stop é de 25% DE PREÇO. A 3x ele consome 75% da margem: a posição sobrevive
 * ao stop e ele funciona como stop. A 4x os mesmos 25% consomem 100% — a
 * liquidação acontece exatamente onde o stop dispararia, e acima disso ela vem
 * ANTES: o stop vira enfeite e quem decide a saída é a corretora.
 *
 * A 1x a carteira mal se movia: uma call de +40% numa posição de 4% mexe 1,6% do
 * patrimônio, e ela levaria meses para dizer qualquer coisa. A 3x diz o mesmo em
 * um terço do tempo sem abrir mão da regra de saída.
 *
 * E ela opera VENDIDO, o que não existe à vista. Isto sempre foi futuros; a 1x
 * era futuros com alavancagem de um, o que só escondia a pergunta.
 */
export const ALAVANCAGEM = 3;

/**
 * Margem de manutenção da corretora, abaixo da qual a posição é liquidada.
 *
 * Meio por cento é a faixa das corretoras grandes para posição pequena. Com ela,
 * a liquidação a 3x acontece quando o preço anda 33,2% contra — depois do stop
 * de 25%, que é exatamente o que o teto de alavancagem existe para garantir.
 */
export const MARGEM_MANUTENCAO = 0.005;

/**
 * Financiamento presumido quando o histórico não gravou a taxa real.
 *
 * As linhas anteriores a 03/09 não têm o campo. Medido nas moedas da lista, a
 * taxa fica em torno de 0,015% por período de oito horas — 16% ao ano —, e é
 * esse o valor usado como piso. O sinal segue a convenção da Binance: positivo,
 * o comprado paga.
 */
export const FUNDING_PRESUMIDO = 0.00015;

// ------------------------------------------------------------------- o motor

/** Uma linha do histórico, que é o que o motor consome. */
export interface Emissao {
  t: number;
  s: string;
  preco: number;
  vies: string | null;
  forca?: number | null;
  nota?: number;
  /** Taxa de financiamento por 8h, quando o retrato a gravou. */
  fund?: number | null;
}

interface Estado {
  caixa: number;
  abertas: Map<string, Aberta>;
  fechadas: Fechada[];
}

/** Variação do preço a favor da posição, sem alavancagem e sem custo. */
function aFavor(p: { lado: Lado; precoEntrada: number }, preco: number): number {
  const variacao = preco / p.precoEntrada - 1;
  return p.lado === "long" ? variacao : -variacao;
}

/**
 * Retorno sobre a MARGEM: a variação de preço multiplicada pela alavancagem,
 * menos os custos de entrada e saída e menos o financiamento acumulado.
 *
 * O custo entra multiplicado porque a taxa incide sobre o NOCIONAL, que é a
 * margem vezes a alavancagem — a 3x, os 0,15% por lado custam 0,45% da margem.
 * Esquecer isso é o erro que faz backtest alavancado parecer melhor do que é.
 */
function sobreMargem(p: Aberta, preco: number): number {
  return aFavor(p, preco) * ALAVANCAGEM - 2 * CUSTO * ALAVANCAGEM - p.funding;
}

/**
 * O preço em que a corretora fecha a posição à força.
 *
 * A margem acaba quando a variação contra chega a `1/alavancagem`, menos a
 * margem de manutenção. A 3x isso é 33,2% de preço — depois do stop de 25%, que
 * é o que o teto de alavancagem existe para garantir.
 */
function precoDeLiquidacao(lado: Lado, entrada: number): number {
  const distancia = 1 / ALAVANCAGEM - MARGEM_MANUTENCAO;
  return lado === "long" ? entrada * (1 - distancia) : entrada * (1 + distancia);
}

function fechar(estado: Estado, p: Aberta, preco: number, quando: number, motivo: Motivo): void {
  // Liquidada é o único caso em que a margem não volta: ela foi consumida antes
  // de a posição ser fechada, e fingir que sobrou algo seria o erro clássico de
  // backtest alavancado.
  const retorno = motivo === "liquidada" ? -1 : Math.max(-1, sobreMargem(p, preco));
  const devolvido = p.valor * (1 + retorno);
  estado.caixa += devolvido;
  estado.abertas.delete(p.symbol);
  estado.fechadas.push({
    symbol: p.symbol,
    lado: p.lado,
    abertaEm: p.abertaEm,
    fechadaEm: quando,
    precoEntrada: p.precoEntrada,
    precoSaida: preco,
    forca: p.forca,
    motivo,
    retorno,
    funding: p.funding,
    resultado: devolvido - p.valor,
    dias: (quando - p.abertaEm) / 86_400_000,
  });
}

/**
 * Roda as emissões cronologicamente e devolve o estado da carteira.
 *
 * As emissões chegam em LOTES — o retrato grava todas as moedas com o mesmo
 * carimbo —, e a ordem dentro do lote importa: primeiro marcar a mercado e
 * fechar o que bateu no limite, depois abrir o que é novo. Invertido, uma call
 * nova competiria por caixa com uma posição que já devia ter saído.
 */
export function rodar(emissoes: Emissao[], comecouEm: number): Carteira {
  const estado: Estado = { caixa: CAPITAL_INICIAL, abertas: new Map(), fechadas: [] };

  const uteis = emissoes
    .filter((e) => e.t * 1000 >= comecouEm && e.preco > 0 && Number.isFinite(e.preco))
    .sort((a, b) => a.t - b.t);

  const lotes = new Map<number, Emissao[]>();
  for (const e of uteis) {
    const lote = lotes.get(e.t) ?? [];
    lote.push(e);
    lotes.set(e.t, lote);
  }

  let ultimo = comecouEm;
  // O último preço que passou no teste de sanidade, por moeda. É contra ele que
  // o preço novo é comparado — não contra o preço anterior cru, senão duas
  // linhas de lixo seguidas se validariam uma à outra.
  const ultimoBom = new Map<string, number>();

  for (const [t, lote] of [...lotes.entries()].sort((a, b) => a[0] - b[0])) {
    const quando = t * 1000;
    ultimo = quando;

    const preco = new Map<string, number>();
    const vies = new Map<string, string | null>();
    const fund = new Map<string, number>();
    for (const e of lote) {
      const antes = ultimoBom.get(e.s);
      const absurdo =
        antes !== undefined &&
        (e.preco / antes > SALTO_ABSURDO || antes / e.preco > SALTO_ABSURDO);
      // Preço absurdo não entra nem para marcar nem para abrir. A posição fica
      // no último preço bom e espera o retrato seguinte, que é o que aconteceria
      // se a leitura simplesmente tivesse falhado — e é o que ela de fato é.
      if (absurdo) continue;
      ultimoBom.set(e.s, e.preco);
      preco.set(e.s, e.preco);
      vies.set(e.s, e.vies);
      if (e.fund != null && Number.isFinite(e.fund)) fund.set(e.s, e.fund);
    }

    // 1. marcar a mercado e decidir saídas
    for (const p of [...estado.abertas.values()]) {
      const atual = preco.get(p.symbol);
      const dias = (quando - p.abertaEm) / 86_400_000;

      // MOEDA QUE SAIU DO RETRATO NÃO PODE PRENDER CAPITAL PARA SEMPRE.
      //
      // O `continue` daqui pulava o loop inteiro, e com ele o teste de prazo —
      // então uma moeda deslistada, ou que simplesmente parasse de responder,
      // deixava a posição aberta indefinidamente, marcada no último preço visto
      // e ocupando o teto de exposição de todas as calls seguintes.
      //
      // O prazo continua valendo mesmo sem preço novo: ele conta tempo, não
      // cotação. A saída é pelo último preço conhecido, que é a única coisa
      // honesta a fazer quando não há preço de hoje.
      if (atual === undefined) {
        if (dias >= PRAZO_DIAS) fechar(estado, p, p.precoAtual, quando, "prazo");
        continue;
      }

      // FINANCIAMENTO PRIMEIRO, porque ele corre com o relógio e não com o
      // preço: são três cobranças por dia sobre o NOCIONAL, então a 3x cada uma
      // custa três vezes mais da margem. Numa vendida de duas semanas isso passa
      // de 2% — mais do que entrada e saída somadas.
      const horas = (quando - p.ultimoFunding) / 3_600_000;
      if (horas > 0) {
        const taxa = fund.get(p.symbol) ?? p.ultimaTaxa ?? FUNDING_PRESUMIDO;
        p.ultimaTaxa = taxa;
        // Positiva, o comprado paga; negativa, o vendido paga.
        const sinal = p.lado === "long" ? 1 : -1;
        p.funding += (horas / 8) * taxa * sinal * ALAVANCAGEM;
        p.ultimoFunding = quando;
      }

      p.precoAtual = atual;
      p.retorno = sobreMargem(p, atual);

      // LIQUIDAÇÃO ANTES DE TUDO: a corretora não espera a regra de saída. A 3x
      // ela só acontece depois do stop, e é isso que o teto de alavancagem
      // garante — mas um salto de preço entre retratos pode pular o stop e cair
      // direto aqui, e nesse caso a margem inteira se perde.
      const liquidou =
        p.lado === "long" ? atual <= p.precoLiquidacao : atual >= p.precoLiquidacao;
      if (liquidou) {
        fechar(estado, p, atual, quando, "liquidada");
        continue;
      }
      // A ordem dos testes é a ordem do pior caso: dentro de um intervalo entre
      // retratos o preço passou por lugares que não vemos, e supor que ele
      // tocou o stop antes do alvo é a suposição conservadora.
      if (p.retorno <= -STOP) fechar(estado, p, atual, quando, "stop");
      else if (p.retorno >= ALVO) fechar(estado, p, atual, quando, "alvo");
      else if (dias >= PRAZO_DIAS) fechar(estado, p, atual, quando, "prazo");
      else if (vies.get(p.symbol) !== p.lado) {
        // O painel mudou de ideia. Esta é a saída principal: a carteira segue as
        // calls, então ela sai quando a call sai. Sem isso a carteira mediria as
        // MINHAS regras de saída, e não o painel.
        //
        // Mas AUSÊNCIA de leitura não é leitura contrária, e o código tratava as
        // duas formas de ausência de jeitos opostos: moeda que sumia do lote não
        // fechava, e moeda presente com viés NULO fechava como "painel mudou".
        // As duas dizem a mesma coisa — não houve leitura —, e viés nulo não é
        // raro: 26 das 1.845 emissões de setembro.
        const lido = vies.get(p.symbol);
        if (lido != null) fechar(estado, p, atual, quando, "painel mudou");
      }
    }

    // 2. abrir o que é novo
    const expostoAgora = () =>
      [...estado.abertas.values()].reduce((s, p) => s + p.valor * (1 + p.retorno), 0);
    const patrimonio = () => estado.caixa + expostoAgora();

    for (const e of lote) {
      if (e.vies !== "long" && e.vies !== "short") continue;
      if (estado.abertas.has(e.s)) continue;

      const forca = e.forca ?? 0;
      const risco = RISCO_POR_FORCA[forca];
      // Sem força gravada não há como dimensionar, e chutar um tamanho seria
      // inventar a parte mais importante da conta. As linhas antigas do
      // histórico não têm o campo; elas simplesmente não viram posição.
      if (!risco) continue;

      const total = patrimonio();
      // A MARGEM QUE ARRISCA `risco` DO PATRIMÔNIO, e a alavancagem entra aqui.
      //
      // O stop de 25% é de PREÇO. A 3x ele consome 75% da margem, então para
      // arriscar 1,5% do patrimônio a margem tem de ser 2% — não 6%. Dividir só
      // pelo stop, como antes, triplicaria o risco de cada call sem que nada na
      // tela dissesse isso: é assim que backtest alavancado quebra sem avisar.
      const alvo = (total * risco) / (STOP * ALAVANCAGEM);
      const cabe = Math.max(0, total * EXPOSICAO_MAXIMA - expostoAgora());

      // O risco já comprometido, em fração do patrimônio: cada posição aberta
      // vale o que ela perderia se batesse no stop.
      const riscoAberto = [...estado.abertas.values()].reduce(
        (soma, a) => soma + (RISCO_POR_FORCA[a.forca] ?? 0),
        0,
      );
      if (riscoAberto + risco > RISCO_TOTAL_MAXIMO) continue;

      const valor = Math.min(alvo, cabe, estado.caixa);
      // Posição pequena demais é ruído de arredondamento contra custo fixo.
      if (valor < 1) continue;

      estado.caixa -= valor;
      estado.abertas.set(e.s, {
        symbol: e.s,
        lado: e.vies,
        abertaEm: quando,
        precoEntrada: e.preco,
        // A margem inteira entra na posição; os custos aparecem no RETORNO, que
        // é onde a alavancagem os multiplica. Descontá-los aqui os cobraria uma
        // vez só, e o nocional é três vezes a margem.
        valor,
        forca,
        precoAtual: e.preco,
        retorno: -2 * CUSTO * ALAVANCAGEM,
        funding: 0,
        ultimoFunding: quando,
        ultimaTaxa: fund.get(e.s) ?? null,
        precoLiquidacao: precoDeLiquidacao(e.vies, e.preco),
      });
    }
  }

  return montar(estado, comecouEm, ultimo);
}

function montar(estado: Estado, comecouEm: number, atualizadoEm: number): Carteira {
  const abertas = [...estado.abertas.values()].sort((a, b) => b.retorno - a.retorno);
  const exposto = abertas.reduce((s, p) => s + p.valor * (1 + p.retorno), 0);
  const patrimonio = estado.caixa + exposto;

  const porMotivo: Carteira["porMotivo"] = {};
  for (const f of estado.fechadas) {
    const g = (porMotivo[f.motivo] ??= { n: 0, retornoMedio: 0 });
    g.retornoMedio = (g.retornoMedio * g.n + f.retorno) / (g.n + 1);
    g.n++;
  }

  const porLado: Carteira["porLado"] = {};
  for (const f of estado.fechadas) {
    const g = (porLado[f.lado] ??= { n: 0, retornoMedio: 0, acertos: 0 });
    g.retornoMedio = (g.retornoMedio * g.n + f.retorno) / (g.n + 1);
    g.n++;
    if (f.retorno > 0) g.acertos++;
  }

  return {
    comecouEm,
    atualizadoEm,
    caixa: estado.caixa,
    patrimonio,
    retorno: patrimonio / CAPITAL_INICIAL - 1,
    abertas,
    fechadas: estado.fechadas.sort((a, b) => b.fechadaEm - a.fechadaEm),
    acertos: estado.fechadas.filter((f) => f.retorno > 0).length,
    encerradas: estado.fechadas.length,
    porMotivo,
    porLado,
  };
}

const CAMINHO = "data/carteira.json";

export async function getCarteira(): Promise<Carteira | null> {
  try {
    const dado = JSON.parse(await readFile(CAMINHO, "utf8")) as Carteira;
    return Array.isArray(dado?.abertas) ? dado : null;
  } catch {
    return null;
  }
}
