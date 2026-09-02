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
export type Motivo = "painel mudou" | "stop" | "alvo" | "prazo";

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
  /** Retorno da posição até agora, com o custo de saída já provisionado. */
  retorno: number;
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
  /** Retorno líquido de custos, em fração. */
  retorno: number;
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
 * fixa do patrimônio até o stop, e o tamanho sai dessa conta. Com stop em 25%,
 * arriscar 1% do patrimônio dá uma posição de 4%.
 *
 * Por que arriscar tão pouco: o painel emite doze calls ao mesmo tempo num dia
 * normal. A 4% cada, isso já é metade do patrimônio exposto, e essas moedas
 * andam 8% num dia comum. Tamanho maior não seria agressividade, seria ignorar
 * quantas posições o próprio painel abre de uma vez.
 *
 * A força vem de `lerVies` e vale o que ela diz valer: 3 é a regra com o
 * refinamento mais forte medido, 1 é a que sobrevive por pouco.
 */
export const RISCO_POR_FORCA: Record<number, number> = { 3: 0.015, 2: 0.01, 1: 0.005 };

/**
 * Teto de patrimônio exposto ao mesmo tempo.
 *
 * Sem ele, um dia com vinte calls colocaria tudo na mesa. Metade parada é o que
 * garante que a carteira sobreviva para continuar medindo — que é o objetivo
 * dela, já que ela existe para produzir amostra e não lucro.
 */
export const EXPOSICAO_MAXIMA = 0.5;

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

// ------------------------------------------------------------------- o motor

/** Uma linha do histórico, que é o que o motor consome. */
export interface Emissao {
  t: number;
  s: string;
  preco: number;
  vies: string | null;
  forca?: number | null;
  nota?: number;
}

interface Estado {
  caixa: number;
  abertas: Map<string, Aberta>;
  fechadas: Fechada[];
}

/** Retorno bruto da posição, antes de custo. */
function bruto(p: { lado: Lado; precoEntrada: number }, preco: number): number {
  const variacao = preco / p.precoEntrada - 1;
  return p.lado === "long" ? variacao : -variacao;
}

function fechar(estado: Estado, p: Aberta, preco: number, quando: number, motivo: Motivo): void {
  // O custo de saída entra aqui; o de entrada já saiu do valor na abertura.
  const retorno = bruto(p, preco) - CUSTO;
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

  for (const [t, lote] of [...lotes.entries()].sort((a, b) => a[0] - b[0])) {
    const quando = t * 1000;
    ultimo = quando;
    const preco = new Map(lote.map((e) => [e.s, e.preco]));
    const vies = new Map(lote.map((e) => [e.s, e.vies]));

    // 1. marcar a mercado e decidir saídas
    for (const p of [...estado.abertas.values()]) {
      const atual = preco.get(p.symbol);
      if (atual === undefined) continue;
      p.precoAtual = atual;
      p.retorno = bruto(p, atual) - CUSTO;

      const dias = (quando - p.abertaEm) / 86_400_000;
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
        // Moeda que sumiu do lote não conta como mudança de ideia — leitura que
        // falhou não é leitura nova.
        if (vies.has(p.symbol)) fechar(estado, p, atual, quando, "painel mudou");
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
      const alvo = (total * risco) / STOP;
      const cabe = Math.max(0, total * EXPOSICAO_MAXIMA - expostoAgora());
      const valor = Math.min(alvo, cabe, estado.caixa);
      // Posição pequena demais é ruído de arredondamento contra custo fixo.
      if (valor < 1) continue;

      estado.caixa -= valor;
      estado.abertas.set(e.s, {
        symbol: e.s,
        lado: e.vies,
        abertaEm: quando,
        precoEntrada: e.preco,
        // O custo de entrada sai do valor alocado, não do caixa: assim o
        // retorno da posição já nasce líquido de um dos dois lados.
        valor: valor * (1 - CUSTO),
        forca,
        precoAtual: e.preco,
        retorno: -CUSTO,
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
