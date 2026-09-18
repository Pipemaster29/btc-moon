/**
 * Mil caminhos que a carteira poderia ter andado, em vez do um que ela andou.
 *
 * A CARTEIRA HOJE NÃO MEDE NADA, e isto é demonstrável em três linhas. São 64
 * posições fechadas em 14,2 dias, com média de −4,70% da margem por posição e
 * desvio de 42,6 pontos. O intervalo de 95% dessa média, por reamostragem, vai
 * de −14,8% a +6,1% — zero está dentro dele. E 84% do prejuízo (−2,53 de −3,01)
 * vem de TRÊS posições de 64. O "−9,35%" na tela é o resultado de três stops,
 * não de uma estratégia.
 *
 * Para o intervalo excluir zero, mantidos essa média e esse desvio, seriam
 * necessárias cerca de 316 posições — a 4,5 por dia, uns setenta dias de espera.
 * Este módulo existe para responder hoje o que o relógio só responde em setenta
 * dias, e para responder a pergunta certa, que não é "quanto rendeu" e sim
 * QUANTOS DOS CAMINHOS POSSÍVEIS QUEBRAM A CONTA.
 *
 * ELE NÃO PREVÊ PADRÃO, e é importante que isso esteja escrito no topo do
 * arquivo e não numa nota de rodapé. Monte Carlo não descobre regra nenhuma: ele
 * propaga a incerteza de um gerador que já é o dado. Todo caminho que sai daqui
 * já estava na amostra que entrou. Quem procura padrão neste repositório é o
 * `lib/garimpo.ts` e o `lib/estudo.ts`, que olham mercado; isto olha para a
 * régua de tamanho de posição e pergunta se ela sobrevive.
 *
 * ---------------------------------------------------------------------------
 *
 * O MOTOR SIMULADO É O MOTOR DE VERDADE. Nada aqui reimplementa stop, alvo,
 * prazo, liquidação, custo, financiamento ou dimensionamento: este módulo
 * fabrica fluxos de `Emissao` — o mesmo tipo que o histórico grava — e quem os
 * consome é o `rodar` de `lib/carteira.ts`, com os mesmos guards. Um Monte Carlo
 * que reescrevesse as regras mediria a reescrita, e o projeto já tem o caso: o
 * `SALTO_ABSURDO` existia na marcação e não na abertura, e o buraco sobreviveu
 * a um teste de regressão que passava ao lado dele.
 *
 * A REAMOSTRAGEM É EM BLOCO, e o motivo é medido. Sortear posições de forma
 * independente, que é o instinto, seria errado aqui: sobre 2.415 pares de moedas
 * em 29 dias, a correlação diária média é +0,105 e 67% dos pares são positivos;
 * no pior dia a mediana de 72 moedas foi −5,6%. A carteira chega a carregar 13
 * posições ao mesmo tempo, e a 3x um dia desses tira 16,8% da margem de TODAS
 * elas de uma vez. Sorteio independente espalha esse dia entre caminhos
 * diferentes e some justamente com a ruína — que é o único número que esta
 * simulação existe para produzir. Bloco contíguo preserva a seção transversal
 * inteira: o dia ruim continua sendo ruim para todo mundo junto.
 *
 * O QUE VIAJA NO BLOCO É RETORNO E NÃO PREÇO. Emendar preço faria a moeda saltar
 * de US$ 0,10 para US$ 0,35 na costura, inventando stop e alvo onde só houve
 * corte de fita — e o `SALTO_ABSURDO` engoliria parte disso em silêncio, que é
 * pior. Encadeando retorno, a costura é invisível no nível e o que se preserva é
 * exatamente a dinâmica de dentro do bloco.
 *
 * ---------------------------------------------------------------------------
 *
 * O QUE ISTO NÃO PODE FAZER, e cada item empurra o resultado para o otimismo:
 *
 *   CATORZE DIAS   é toda a amostra única que existe. `forca` só passou a ser
 *                  gravada em 02/09, e sem ela não há como dimensionar posição —
 *                  são 922 retratos cobrindo 14,2 dias. Um caminho de 90 dias
 *                  reusa cada dia real uma meia dúzia de vezes.
 *   A CAUDA        reamostragem NUNCA gera evento que não esteja na amostra. O
 *                  pior dia daqui é −5,6% na mediana da lista; o dia que de fato
 *                  quebra uma conta alavancada — a lista inteira caindo 40% —
 *                  não está nos 14 dias e portanto não está em nenhum dos mil
 *                  caminhos. Toda probabilidade de ruína que sai daqui é PISO.
 *   A COSTURA      no ponto de emenda, o retorno seguinte de uma posição aberta
 *                  passa a vir de outro dia real. Com bloco de 48h e posição
 *                  durando 2,07 dias na mediana, cerca de metade das posições
 *                  atravessa uma emenda — o que destrói parte de qualquer
 *                  vantagem que o painel tivesse. O sweep de tamanho de bloco
 *                  existe para essa sensibilidade ficar na tela.
 *   O CAMINHO      sem velas sintéticas, stop e alvo só são testados nas pontas
 *                  dos retratos. Medido nas 16 primeiras posições da carteira,
 *                  as pontas escondem 2,1 p.p. de excursão na mediana e 5,0 na
 *                  pior — sempre na direção que favorece a carteira.
 *   A PARTIDA      cada caminho começa com a conta vazia em US$ 1.000. A
 *                  carteira real está com 11 posições abertas agora.
 */

import { SALTO_ABSURDO, type Emissao } from "./carteira";

/**
 * Vão entre retratos acima do qual um bloco não pode ser cortado.
 *
 * Um bloco que atravessasse um buraco de horas carregaria esse buraco para dentro
 * de todo caminho que o sorteasse, e o financiamento corre com o relógio: seriam
 * cobranças de oito horas aparecendo no meio de uma janela de vinte minutos.
 *
 * MEDIDO na janela que tem `forca`: mediana de 21,6 min entre retratos, p99 de
 * 86 min, maior vão de 4,7 h e ZERO acima de seis horas. Hoje este corte não
 * corta nada e a grade sai num segmento só — ele existe para o dia em que
 * alguém rodar isto sobre o histórico de agosto, que tem vãos de 4,7 h porque é
 * anterior à execução contínua do monitor.
 */
export const VAO_MAXIMO = 6 * 3600;

/** O que uma moeda fez e o que o painel disse sobre ela, num instante. */
export interface Observacao {
  s: string;
  /**
   * Retorno de PREÇO desde a ÚLTIMA OBSERVAÇÃO DESTA MOEDA — não desde o
   * retrato anterior. Moeda que ficou três retratos fora volta com o movimento
   * dos três dentro, que é o que de fato aconteceu com ela.
   */
  r: number;
  vies: string | null;
  forca: number | null;
  /** Taxa de financiamento por 8h, quando o retrato a gravou. */
  fund: number | null;
}

export interface Instante {
  /** Segundos decorridos desde o instante anterior da grade. */
  dt: number;
  obs: Observacao[];
  /** O mesmo conteúdo indexado, para o controle embaralhado buscar o espelho. */
  porMoeda: Map<string, Observacao>;
}

export interface Grade {
  instantes: Instante[];
  /** Só as moedas que ALGUM DIA tiveram call direcional com força. */
  moedas: string[];
  precoInicial: Map<string, number>;
  /** Trechos contíguos, em índices `[de, ate)`. Bloco não atravessa fronteira. */
  segmentos: { de: number; ate: number }[];
  /** A cadência típica da grade, em segundos. */
  dtMediano: number;
  /** Quantos segundos de amostra ÚNICA existem. É o número que limita tudo. */
  duracao: number;
}

/**
 * Monta a grade a partir das linhas cruas do histórico.
 *
 * SÓ ENTRAM AS MOEDAS QUE PODEM VIRAR POSIÇÃO — as que em algum retrato tiveram
 * viés direcional com força de 1 a 3. As outras nunca abrem (o `rodar` exige as
 * duas coisas) e portanto nunca são marcadas nem fecham nada. Verificado
 * rodando a carteira real com e sem a poda: 32 moedas de 71, 90.243 emissões
 * caindo para 39.772, e patrimônio, posições fechadas e queda máxima IDÊNTICOS
 * até a sexta casa. O que muda é o custo: 73 ms viram 37 ms, e isso multiplica
 * por mil caminhos.
 */
export function montarGrade(emissoes: Emissao[], desde: number): Grade {
  const capazes = new Set(
    emissoes
      .filter((e) => (e.vies === "long" || e.vies === "short") && e.forca != null && e.forca >= 1)
      .map((e) => e.s),
  );

  const uteis = emissoes
    .filter((e) => capazes.has(e.s) && e.t * 1000 >= desde)
    .sort((a, b) => a.t - b.t);

  const lotes = new Map<number, Emissao[]>();
  for (const e of uteis) {
    const lote = lotes.get(e.t) ?? [];
    lote.push(e);
    lotes.set(e.t, lote);
  }
  const tempos = [...lotes.keys()].sort((a, b) => a - b);

  // O último preço que passou no teste de sanidade, por moeda — a mesma regra do
  // `rodar`, e contra o último BOM e não contra o anterior cru, senão duas
  // linhas de lixo seguidas se validam uma à outra. O JCT já foi gravado a
  // 2,9e-27; uma linha dessas virando retorno envenenaria todo caminho que
  // sorteasse o bloco em que ela caiu.
  const ultimoBom = new Map<string, number>();
  const instantes: Instante[] = [];
  const cortes: number[] = [];

  for (let i = 0; i < tempos.length; i++) {
    const t = tempos[i];
    const dt = i === 0 ? 0 : t - tempos[i - 1];
    if (dt > VAO_MAXIMO) cortes.push(instantes.length);

    const obs: Observacao[] = [];
    for (const e of lotes.get(t) ?? []) {
      if (!Number.isFinite(e.preco) || e.preco <= 0) continue;
      const antes = ultimoBom.get(e.s);
      if (antes !== undefined && (e.preco / antes > SALTO_ABSURDO || antes / e.preco > SALTO_ABSURDO)) continue;
      ultimoBom.set(e.s, e.preco);
      // A primeira leitura da moeda não produz retorno: não há de onde medir.
      // Ela entra só para o painel poder falar — e o preço dela começa no
      // `precoInicial`, que é onde o caminho a coloca.
      if (antes === undefined) continue;
      const r = e.preco / antes - 1;
      // `NaN <= 0` e `NaN >= 0` são ambos falsos: guard escrito como comparação
      // deixaria NaN passar e o preço do caminho inteiro viraria NaN a partir
      // dali, sem erro e sem aviso.
      if (!Number.isFinite(r) || r <= -0.999) continue;
      obs.push({ s: e.s, r, vies: e.vies, forca: e.forca ?? null, fund: e.fund ?? null });
    }

    instantes.push({ dt, obs, porMoeda: new Map(obs.map((o) => [o.s, o])) });
  }

  const segmentos: { de: number; ate: number }[] = [];
  let de = 0;
  for (const corte of cortes) {
    if (corte > de) segmentos.push({ de, ate: corte });
    de = corte;
  }
  if (instantes.length > de) segmentos.push({ de, ate: instantes.length });

  const vaos = instantes.slice(1).map((x) => x.dt).sort((a, b) => a - b);
  const dtMediano = vaos.length ? vaos[Math.floor(vaos.length / 2)] : 0;

  return {
    instantes,
    moedas: [...capazes].sort(),
    precoInicial: new Map(ultimoBom),
    segmentos,
    dtMediano,
    duracao: tempos.length > 1 ? tempos[tempos.length - 1] - tempos[0] : 0,
  };
}

/**
 * Gerador reprodutível (mulberry32).
 *
 * Reprodutibilidade não é capricho: `scripts/carteira.mts` fixa a data de início
 * no código pelo mesmo motivo — "rodar duas vezes tem de dar o mesmo resultado,
 * senão o número na tela muda sozinho a cada execução e não significa nada". Uma
 * probabilidade de ruína que oscila 2 p.p. entre execuções não é medição.
 */
export function semente(n: number): () => number {
  let a = n >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Sorteio {
  /** Quanto tempo o caminho cobre, em segundos. */
  horizonte: number;
  /** Tamanho do bloco contíguo, em segundos. */
  bloco: number;
  /** Instante inicial do caminho, em milissegundos. */
  comecaEm: number;
  /**
   * Trocar as moedas de sinal entre si — o CONTROLE.
   *
   * Cada moeda mantém os próprios retornos e passa a receber o viés e a força de
   * OUTRA moeda, por uma permutação fixa no caminho inteiro. Fixa, e não sorteada
   * a cada retrato: viés trocado a cada instante faria toda posição fechar por
   * "painel mudou" no retrato seguinte, e o controle mediria a duração zero em
   * vez de medir a escolha.
   *
   * O que ele preserva: quantas calls saem juntas, a mistura de forças, a
   * correlação entre as moedas e todos os custos. O que ele quebra: a escolha de
   * QUAL moeda. Se as duas distribuições se sobrepuserem, escolher a moeda certa
   * não vale dinheiro — que é a pergunta do `lib/placar.ts`, feita em dólares.
   *
   * O QUE ELE NÃO SEPARA, e é preciso dizer: moeda carrega volatilidade junto.
   * Se o painel perder para este controle, a leitura honesta é "as moedas que o
   * painel escolhe são piores PARA ESTA RÉGUA DE TAMANHO" — o que mistura errar
   * a direção com escolher moeda volátil demais para um stop de 25% a 3x. Quem
   * separa a direção sozinha é o `inverter` abaixo.
   *
   * A permutação é um embaralhamento simples, então em média uma moeda de 32 cai
   * em si mesma. Isso enfraquece o controle em cerca de 3% e não muda a leitura.
   *
   * ELA CONSOME UM GERADOR PRÓPRIO — o quarto argumento de `sortearSerie` — e
   * isso é requisito de medição, não arrumação. Com um gerador só, embaralhar
   * gastaria sorteios ANTES dos blocos e o controle cairia em blocos diferentes
   * dos do cenário; a diferença entre os dois passaria a misturar a permutação
   * com o sorteio, que é justamente o que ela precisa separar. Com dois
   * geradores, cenário e controle andam sobre os MESMOS blocos e a comparação
   * vira pareada.
   */
  permutar?: boolean;
  /**
   * Virar toda call do avesso — o CONTROLE DE DIREÇÃO.
   *
   * Cada `long` vira `short` e vice-versa, com a MESMA moeda, a MESMA força e o
   * MESMO instante. É o controle mais limpo que existe aqui porque não sobra
   * nenhum confundidor: volatilidade, correlação, custo, financiamento, quantas
   * calls saem juntas e em quais moedas — tudo idêntico. A única coisa que muda
   * é o lado da aposta.
   *
   * Se o painel e o avesso dele derem a mesma distribuição, a direção que o
   * painel emite não carrega informação nenhuma. Se o AVESSO ganhar, ela carrega
   * informação com o sinal trocado, que é um resultado bem diferente de "não
   * separa" e que o `lib/placar.ts` não consegue ver em pontos percentuais de
   * mediana.
   *
   * Não consome sorteio nenhum, então o pareamento com o cenário é exato.
   */
  inverter?: boolean;
}

/**
 * Sorteia um histórico sintético, pronto para o `rodar` consumir.
 *
 * O `dt` do PRIMEIRO instante de cada bloco é substituído pela mediana da grade,
 * de propósito: o vão real ali é a distância até um retrato que ficou para trás
 * na série original e não pertence a este caminho. Carregá-lo importaria o
 * buraco de outro lugar — e o financiamento é cobrado pelo relógio.
 */
export function sortearSerie(
  grade: Grade,
  opcoes: Sorteio,
  sorteio: () => number,
  sorteioPermuta: () => number = sorteio,
): Emissao[] {
  if (!grade.instantes.length || !grade.dtMediano) return [];

  const passosBloco = Math.max(1, Math.round(opcoes.bloco / grade.dtMediano));
  const inicios: number[] = [];
  for (const seg of grade.segmentos) {
    for (let i = seg.de; i + passosBloco <= seg.ate; i++) inicios.push(i);
  }
  if (!inicios.length) {
    throw new Error(
      `bloco de ${(opcoes.bloco / 3600).toFixed(1)}h não cabe em nenhum segmento contínuo da grade ` +
        `(o maior tem ${(Math.max(...grade.segmentos.map((s) => s.ate - s.de)) * grade.dtMediano) / 3600} h)`,
    );
  }

  // O espelho do controle: moeda -> moeda de quem ela vai herdar o sinal.
  const espelho = new Map<string, string>();
  if (opcoes.permutar) {
    const baralho = [...grade.moedas];
    for (let i = baralho.length - 1; i > 0; i--) {
      const j = Math.floor(sorteioPermuta() * (i + 1));
      [baralho[i], baralho[j]] = [baralho[j], baralho[i]];
    }
    grade.moedas.forEach((m, i) => espelho.set(m, baralho[i]));
  }

  const preco = new Map(grade.precoInicial);
  const serie: Emissao[] = [];
  let t = Math.round(opcoes.comecaEm / 1000);
  const fim = t + opcoes.horizonte;

  while (t < fim) {
    const inicio = inicios[Math.floor(sorteio() * inicios.length)];
    for (let k = 0; k < passosBloco && t < fim; k++) {
      const instante = grade.instantes[inicio + k];
      t += k === 0 ? grade.dtMediano : instante.dt;
      if (t >= fim) break;

      for (const o of instante.obs) {
        const antes = preco.get(o.s);
        if (antes === undefined) continue;
        const novo = antes * (1 + o.r);
        if (!Number.isFinite(novo) || novo <= 0) continue;
        preco.set(o.s, novo);

        // O sinal vem da moeda espelho; o FINANCIAMENTO fica com a moeda dona do
        // preço, porque é dela que ele é cobrado.
        const fonte = opcoes.permutar ? instante.porMoeda.get(espelho.get(o.s) ?? o.s) : o;
        const lido = fonte?.vies ?? null;
        // A inversão vale só para as duas direcionais: virar "observar" do avesso
        // não quer dizer nada, e virar "evitar" em call seria inventar uma call
        // que o painel nunca emitiu.
        const vies = opcoes.inverter && (lido === "long" || lido === "short")
          ? lido === "long" ? "short" : "long"
          : lido;
        serie.push({
          t,
          s: o.s,
          preco: novo,
          vies,
          forca: fonte?.forca ?? null,
          fund: o.fund,
        });
      }
    }
  }

  return serie;
}

/** Quantil por interpolação linear. Recebe a lista JÁ ORDENADA. */
export function quantil(ordenados: number[], q: number): number {
  if (!ordenados.length) return NaN;
  if (ordenados.length === 1) return ordenados[0];
  const pos = Math.min(Math.max(q, 0), 1) * (ordenados.length - 1);
  const baixo = Math.floor(pos);
  const alto = Math.ceil(pos);
  if (baixo === alto) return ordenados[baixo];
  return ordenados[baixo] + (ordenados[alto] - ordenados[baixo]) * (pos - baixo);
}

/**
 * Intervalo de 95% para uma proporção, por Wilson.
 *
 * Existe porque probabilidade de ruína sai de uma CONTAGEM de caminhos, e uma
 * contagem tem erro de amostragem que o número sozinho esconde: com 400
 * caminhos, "10%" é qualquer coisa entre 7,4% e 13,4%. Publicar o 10% pelado
 * seria dar a esta simulação uma precisão que ela não tem — e o projeto inteiro
 * é sobre não fazer isso.
 *
 * Wilson e não a fórmula normal de sempre porque esta cauda encosta em zero, e
 * lá a normal devolve limite inferior NEGATIVO.
 */
export function faixaBinomial(k: number, n: number): [number, number] {
  if (n <= 0) return [NaN, NaN];
  const z = 1.96;
  const p = k / n;
  const d = 1 + (z * z) / n;
  const centro = (p + (z * z) / (2 * n)) / d;
  const meia = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, centro - meia), Math.min(1, centro + meia)];
}
