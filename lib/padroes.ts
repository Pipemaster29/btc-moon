/**
 * As figuras de vela, com definição fechada o bastante para serem medidas.
 *
 * Este arquivo existe por causa de uma lição que entrou em `conhecimento/` e da
 * regra que governa este repositório: **nada entra sem medição**. A lição diz
 * coisas como "o martelo mostra que os compradores retomaram o controle" e "uma
 * engolfo de alta no suporte com volume subindo é muito mais forte do que a
 * mesma figura no meio do nada". As duas podem ser verdade e as duas podem ser
 * folclore — e a única forma de saber é transformá-las em função e passá-las
 * pelos 528 perpétuos da Binance.
 *
 * O PADRÃO DE `lib/tecnica.ts` VALE AQUI INTEIRO, e ele já dizia a coisa certa:
 * *"análise técnica sofre de um problema que este arquivo tenta evitar: quase
 * tudo nela é desenhada a olho, e duas pessoas traçam a mesma linha em lugares
 * diferentes. Uma regra que depende de onde alguém desenhou não pode ser
 * testada, e o que não pode ser testado não entra aqui."*
 *
 * Então cada figura abaixo é uma comparação entre números, sem julgamento. Onde
 * a definição comum do mercado é vaga — "corpo pequeno", "pavio longo" — eu
 * fechei o corte num número e **escrevi ao lado que o número é convenção e não
 * medição**. Isso importa: um corte escolhido a dedo pode fabricar o resultado
 * que ele quiser, então `npm run aferir-padroes` mede também a SENSIBILIDADE —
 * o mesmo padrão com o corte mais frouxo e mais apertado — e o veredito só vale
 * se sobreviver aos três.
 *
 * O QUE ESTE ARQUIVO NÃO FAZ: emitir call. Ele descreve a vela e o contexto
 * dela. Quem diz se isso vale alguma coisa é a aferição, e o resultado dela
 * está escrito em `conhecimento/01-velas.md` — inclusive quando é "não vale".
 */

/** O mínimo que uma vela precisa ter para as figuras abaixo. */
export interface VelaOHLC {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/**
 * As quatro medidas de que toda figura sai: corpo, amplitude e os dois pavios.
 *
 * Em PREÇO e não em fração, porque a fração precisa de um denominador e o
 * denominador muda de figura para figura — o doji compara corpo com amplitude,
 * o martelo compara pavio com corpo. Fixar um só aqui esconderia essa escolha
 * dentro da conta em vez de deixá-la na definição de cada figura.
 */
export interface Anatomia {
  corpo: number;
  amplitude: number;
  pavioSuperior: number;
  pavioInferior: number;
  /** Fechou acima de onde abriu. */
  alta: boolean;
  /** corpo ÷ amplitude: 0 é doji perfeito, 1 é vela sem pavio nenhum. */
  cheia: number;
}

export function anatomia(v: VelaOHLC): Anatomia {
  const corpo = Math.abs(v.close - v.open);
  const amplitude = v.high - v.low;
  const topoDoCorpo = Math.max(v.open, v.close);
  const baseDoCorpo = Math.min(v.open, v.close);
  return {
    corpo,
    amplitude,
    pavioSuperior: v.high - topoDoCorpo,
    pavioInferior: baseDoCorpo - v.low,
    alta: v.close > v.open,
    // Amplitude zero é vela sem movimento nenhum — acontece em moeda parada. Não
    // é doji (que é indecisão entre dois lados brigando), é ausência de mercado,
    // e dividir por ela daria NaN, que fura guarda (armadilha nº 5).
    cheia: amplitude > 0 ? corpo / amplitude : NaN,
  };
}

export type Padrao =
  | "doji"
  | "martelo"
  | "estrela-cadente"
  | "engolfo-alta"
  | "engolfo-baixa"
  | "rejeicao-superior"
  | "rejeicao-inferior"
  | "expansao";

/**
 * OS CORTES, e todos eles são CONVENÇÃO e não medição.
 *
 * Nenhum destes números saiu de um teste feito aqui: são os valores que a
 * literatura de análise técnica repete, e eu os escrevi para poder medi-los, não
 * porque acredito neles. É a diferença que o AGENTS.md pede que fique explícita
 * — um corte sem medição ao lado tem de dizer que não tem.
 *
 * E o risco deles é real: escolhendo o corte depois de ver o resultado, dá para
 * fabricar qualquer conclusão. Por isso `npm run aferir-padroes` roda cada
 * figura em TRÊS cortes (frouxo, este, apertado) e um veredito que só aparece
 * num deles é descartado como coincidência de calibragem.
 */
export const CORTES = {
  /** Doji: corpo de no máximo 10% da amplitude. */
  dojiCorpo: 0.1,
  /** Martelo e estrela: o pavio longo vale ao menos 2 corpos. */
  pavioSobreCorpo: 2,
  /** Martelo e estrela: o pavio do outro lado é no máximo 1/4 do longo. */
  pavioOposto: 0.25,
  /** Rejeição: um pavio sozinho vale metade da amplitude da vela. */
  rejeicao: 0.5,
  /** Expansão: amplitude de ao menos 2× a mediana das 20 anteriores. */
  expansao: 2,
} as const;

/** Mediana — usada pelas janelas de referência de amplitude e volume. */
function mediana(xs: number[]): number {
  if (xs.length === 0) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
}

/**
 * Quais figuras a vela `i` fecha. Uma vela pode fechar mais de uma.
 *
 * NÃO OLHA PARA FRENTE — nunca. Toda figura usa `i` e velas anteriores a `i`, e
 * é isso que permite comparar o resultado com o que veio depois sem estar
 * medindo a si mesmo. Um `i + 1` aqui invalidaria a aferição inteira em
 * silêncio, que é o pior modo de falha possível para um número que vira regra.
 *
 * `escala` multiplica os cortes: 1 é a convenção, acima de 1 aperta, abaixo
 * afrouxa. É o parâmetro da prova de sensibilidade.
 */
export function padroesDe(velas: VelaOHLC[], i: number, escala = 1): Padrao[] {
  const v = velas[i];
  if (!v) return [];
  const a = anatomia(v);
  if (!(a.amplitude > 0) || !Number.isFinite(a.cheia)) return [];

  const out: Padrao[] = [];

  // DOJI — abertura e fechamento quase no mesmo lugar. É indecisão: os dois
  // lados brigaram a vela inteira e ninguém saiu do lugar.
  if (a.cheia <= CORTES.dojiCorpo / escala) out.push("doji");

  // MARTELO — pavio longo embaixo, corpo lá em cima, quase nada de pavio
  // superior. A leitura corrente: os vendedores levaram o preço para baixo e os
  // compradores devolveram o movimento inteiro antes do fechamento.
  //
  // O corpo precisa existir: `corpo > 0` separa martelo de doji-de-pernas-longas,
  // que é outra figura e diz outra coisa. Sem isso as duas se sobrepõem e a
  // medição de uma contamina a da outra.
  if (
    a.corpo > 0 &&
    a.pavioInferior >= CORTES.pavioSobreCorpo * escala * a.corpo &&
    a.pavioSuperior <= CORTES.pavioOposto * a.pavioInferior
  ) {
    out.push("martelo");
  }

  // ESTRELA CADENTE — o espelho exato do martelo.
  if (
    a.corpo > 0 &&
    a.pavioSuperior >= CORTES.pavioSobreCorpo * escala * a.corpo &&
    a.pavioInferior <= CORTES.pavioOposto * a.pavioSuperior
  ) {
    out.push("estrela-cadente");
  }

  // REJEIÇÃO — um pavio sozinho vale metade da vela. É a figura mais frouxa
  // daqui de propósito: ela existe para testar se "pavio revela rejeição"
  // sobrevive SEM as exigências extras do martelo. Se o martelo medir e a
  // rejeição não, o que vale é o resto da definição, não o pavio.
  if (a.pavioSuperior >= (CORTES.rejeicao * escala) * a.amplitude) out.push("rejeicao-superior");
  if (a.pavioInferior >= (CORTES.rejeicao * escala) * a.amplitude) out.push("rejeicao-inferior");

  // ENGOLFO — o corpo de hoje cobre o corpo de ontem inteiro, e as duas velas
  // são de cores opostas.
  //
  // A ESCALA AQUI TROCA A DEFINIÇÃO EM VEZ DE MEXER NUM NÚMERO, e isso conserta
  // um bug que dava passe livre num teste. O engolfo não tem corte contínuo —
  // ou o corpo cobre o outro ou não cobre —, então a prova de sensibilidade
  // rodava com as TRÊS escalas devolvendo exatamente as mesmas 7.327
  // observações, e o veredito marcava "cortes ok" para uma figura em que o teste
  // nunca tinha rodado. Um "ok" de um teste que não aconteceu é pior do que não
  // ter o teste.
  //
  // Mas o engolfo TEM uma convenção discutida, e ela é binária: corpo contra
  // corpo, ou vela inteira contra vela inteira (com os pavios). É essa a
  // sensibilidade real da figura, e é ela que a escala percorre:
  //
  //   frouxo (<0,8)    corpo cobre corpo, e a vela anterior pode ser um doji
  //   convenção (1)    corpo cobre corpo, anterior com corpo de verdade
  //   apertado (>1,2)  a vela INTEIRA cobre a anterior, pavios incluídos
  const ant = velas[i - 1];
  if (ant) {
    const b = anatomia(ant);
    const topoAnt = Math.max(ant.open, ant.close);
    const baseAnt = Math.min(ant.open, ant.close);
    // No frouxo, a anterior pode ter corpo zero (doji); nos outros dois, não —
    // "engolfir" um corpo inexistente não é engolfo, é qualquer vela.
    const anteriorVale = escala < 0.8 ? true : b.corpo > 0;
    const total = escala > 1.2;
    if (anteriorVale && a.corpo > 0) {
      const cobreAlta = total
        ? v.close >= ant.high && v.open <= ant.low
        : v.close >= topoAnt && v.open <= baseAnt;
      const cobreBaixa = total
        ? v.open >= ant.high && v.close <= ant.low
        : v.open >= topoAnt && v.close <= baseAnt;
      if (a.alta && !b.alta && cobreAlta) out.push("engolfo-alta");
      if (!a.alta && b.alta && cobreBaixa) out.push("engolfo-baixa");
    }
  }

  // EXPANSÃO — a vela é muito maior que as vinte anteriores. É o que a lição
  // chama de "vela de momento" ou "vela de rompimento".
  //
  // Contra a MEDIANA das 20 e não contra a média: uma única vela gigante na
  // janela levanta a média e faz a seguinte parecer normal. A mediana não se
  // move com uma observação, que é exatamente o que se quer de uma referência.
  if (i >= 20) {
    const refs = velas.slice(i - 20, i).map((x) => x.high - x.low).filter((x) => x > 0);
    const base = mediana(refs);
    if (base > 0 && a.amplitude >= CORTES.expansao * escala * base) out.push("expansao");
  }

  return out;
}

/**
 * O CONTEXTO, que segundo a lição importa mais do que a figura.
 *
 * É a afirmação mais interessante que veio na lição — *"um martelo no meio do
 * nada significa muito pouco"*, *"contexto importa mais que a figura em si"* — e
 * é testável: basta medir a figura sozinha e a figura dentro do contexto, e ver
 * se a segunda separa mais da referência do que a primeira.
 *
 * Cada campo aqui é uma comparação fechada, pelo mesmo motivo das figuras.
 * Suporte e resistência saem dos PIVÔS, que é a única definição de nível que
 * `lib/tecnica.ts` aceita: um pivô é a maior máxima (ou menor mínima) de uma
 * janela simétrica, o que é comparação e não desenho.
 */
export interface Contexto {
  /** Preço a menos de 3% de um pivô de fundo anterior. */
  emSuporte: boolean;
  /** Preço a menos de 3% de um pivô de topo anterior. */
  emResistencia: boolean;
  /** Fechamento acima da média de 20. */
  acimaDaMedia20: boolean;
  /** Volume de ao menos 1,5× a mediana das 20 anteriores. */
  volumeAlto: boolean;
  /** Caiu ao menos 20% nas 7 velas anteriores — "vem de queda". */
  vemDeQueda: boolean;
  /** Subiu ao menos 20% nas 7 velas anteriores — "vem de alta". */
  vemDeAlta: boolean;
}

/**
 * Três por cento de distância para "está no nível".
 *
 * CONVENÇÃO, como os cortes das figuras, e com um agravante que precisa ser
 * dito: nestas moedas 3% é ruído de poucas horas — `npm run estudar` mede
 * volatilidade diária de 7% a 10%. Então este corte é APERTADO para o objeto de
 * estudo.
 *
 * A SEÇÃO 4b DE `npm run aferir-padroes` MEDE ISSO, e é bom dizer que ela passou
 * a existir depois: este comentário afirmava que "a aferição roda com 3% e 8%"
 * quando a aferição rodava só com 3%. Comentário que promete medição inexistente
 * é pior que comentário nenhum — ele desliga a pergunta na cabeça de quem lê, e
 * foi por isso que a deriva de `JANELA_NIVEIS` sobreviveu tanto tempo ali do
 * lado. Hoje ela roda perto de 3% e 8%, e janela de 30, 60 e 120.
 *
 * O que ela devolveu: "em suporte" separa +0,32 p.p. a 3% e +0,30 p.p. a 8%,
 * com 55% e 56% de concordância. Estável nos cortes e irrelevante nos quatro —
 * ou seja, o corte não é o problema, o conceito é que não separa.
 */
export const PERTO = 0.03;

const LADO = 3;

/**
 * QUANTAS VELAS PARA TRÁS UM NÍVEL CONTINUA VALENDO COMO NÍVEL.
 *
 * ESTA CONSTANTE CONSERTA UM BUG QUE INVALIDAVA MEDIÇÃO, e ele merece estar
 * escrito por inteiro porque não dava sintoma nenhum.
 *
 * A primeira versão procurava pivôs desde o COMEÇO da série. O efeito é que a
 * definição de "está num suporte" não era uma propriedade do mercado — era uma
 * propriedade de quanto histórico por acaso tinha vindo antes. Medido numa
 * ETHUSDT de 200 velas, os pivôs de fundo acumulados vão de **2 na vela 30 para
 * 17 na vela 190**: a mesma condição de mercado tem duas chances de ser
 * classificada como "em suporte" no começo da janela e dezessete no fim.
 *
 * O tamanho do estrago, medido em 120 moedas:
 *
 *   "em suporte" na PRIMEIRA metade da série     41,8%
 *   "em suporte" na SEGUNDA  metade da série     63,7%   ← 1,52x
 *
 * E isso não é só uma imprecisão: **contamina o teste de estabilidade**, que é
 * um dos quatro que decidem se uma figura passa. Esse teste compara as duas
 * metades da janela justamente para separar efeito de regime — e a régua estava
 * mudando entre as duas metades junto com o mercado. Qualquer diferença entre as
 * metades tinha uma explicação além do mercado, e nenhum número dizia isso.
 *
 * Com janela fixa, toda observação tem o MESMO número de chances, e a definição
 * volta a ser sobre o mercado. Sessenta velas é convenção e não medição — a
 * aferição roda 30, 60 e 120 para o número não se esconder aqui dentro.
 */
export const JANELA_NIVEIS = 60;

/**
 * Os pivôs conhecidos em `ateIndice`, dentro da janela.
 *
 * UM PIVÔ NO ÍNDICE `k` SÓ É CONHECIDO EM `k + LADO`, porque a janela do pivô é
 * simétrica e as `LADO` velas seguintes fazem parte da definição dele. Usar
 * pivôs além disso é olhar para frente — e a aferição inteira viraria circular
 * sem nenhum sintoma, que é o modo de falha que este projeto mais teme.
 *
 * O corte fica AQUI e não em quem chama. A versão anterior deixava a
 * responsabilidade dividida: quem chamava passava `i - LADO` e esta função
 * subtraía outro `LADO` por dentro, o que era seguro por acidente e jogava fora
 * os três pivôs mais recentes — justamente os mais relevantes para "onde o preço
 * está agora". Uma trava dividida em dois lugares é a armadilha nº 7.
 */
function pivos(velas: VelaOHLC[], ateIndice: number, tipo: "fundo" | "topo", janela: number): number[] {
  const out: number[] = [];
  // O último pivô confirmado em `ateIndice`, e o começo da janela móvel.
  const ultimo = ateIndice - LADO;
  const inicio = Math.max(LADO, ultimo - janela + 1);
  for (let k = inicio; k <= ultimo && k + LADO < velas.length; k++) {
    let extremo = true;
    for (let j = k - LADO; j <= k + LADO; j++) {
      if (j === k) continue;
      const bate =
        tipo === "fundo" ? velas[j].low <= velas[k].low : velas[j].high >= velas[k].high;
      if (bate) {
        extremo = false;
        break;
      }
    }
    if (extremo) out.push(k);
  }
  return out;
}

/** Pivôs de fundo conhecidos em `ateIndice`. */
export function pivosDeFundo(velas: VelaOHLC[], ateIndice: number, janela = JANELA_NIVEIS): number[] {
  return pivos(velas, ateIndice, "fundo", janela);
}

/** Pivôs de topo conhecidos em `ateIndice`. */
export function pivosDeTopoAte(velas: VelaOHLC[], ateIndice: number, janela = JANELA_NIVEIS): number[] {
  return pivos(velas, ateIndice, "topo", janela);
}

export function contextoDe(
  velas: VelaOHLC[],
  i: number,
  perto = PERTO,
  janela = JANELA_NIVEIS,
): Contexto | null {
  // A JANELA PRECISA ESTAR CHEIA, senão a definição volta a andar.
  //
  // Fixar a janela em 60 velas derrubou a deriva de 1,52x para 1,14x e não para
  // 1,00x, e o que sobrava era o começo da série: em `i = 21` a janela móvel só
  // tem 16 velas de onde tirar pivô, então as primeiras observações continuavam
  // com menos chances de cair em "suporte" do que as de depois. Meia correção
  // não corrige — exigir a janela cheia é o que torna a régua a mesma em toda
  // observação.
  //
  // CUSTA AMOSTRA E É PARA CUSTAR: numa série de 200 velas isto descarta as ~42
  // primeiras observações elegíveis. Amostra menor com régua fixa vale mais do
  // que amostra maior com régua que anda, porque a régua que anda entra
  // exatamente no teste de estabilidade — que compara as duas metades da janela.
  const minimo = Math.max(21, janela + LADO);
  if (i < minimo || i >= velas.length) return null;
  const v = velas[i];
  const preco = v.close;
  if (!(preco > 0)) return null;

  // `i` e não `i + 1`: o pivô precisa estar CONFIRMADO na vela que se está
  // classificando, e quem garante isso é `pivos`, que só devolve pivôs até
  // `i - LADO`. O corte mora lá dentro de propósito — ver o comentário dele.
  const fundos = pivosDeFundo(velas, i, janela).map((k) => velas[k].low);
  const topos = pivosDeTopoAte(velas, i, janela).map((k) => velas[k].high);

  const m20 = velas.slice(i - 20, i).reduce((s, x) => s + x.close, 0) / 20;
  const volRef = mediana(velas.slice(i - 20, i).map((x) => x.volume).filter((x) => x > 0));
  const antes7 = velas[i - 7]?.close;

  return {
    emSuporte: fundos.some((f) => f > 0 && Math.abs(preco / f - 1) <= perto),
    emResistencia: topos.some((t) => t > 0 && Math.abs(preco / t - 1) <= perto),
    acimaDaMedia20: m20 > 0 && preco > m20,
    volumeAlto: volRef > 0 && v.volume >= 1.5 * volRef,
    vemDeQueda: antes7 != null && antes7 > 0 && preco / antes7 - 1 <= -0.2,
    vemDeAlta: antes7 != null && antes7 > 0 && preco / antes7 - 1 >= 0.2,
  };
}

/**
 * O que cada figura AFIRMA sobre o que vem depois.
 *
 * Sem isto não há como reprovar nada: "o martelo é de alta" precisa estar
 * escrito ANTES da medição, senão qualquer resultado vira confirmação — mediana
 * positiva confirma alta, negativa confirma que "era armadilha". Declarar a
 * direção esperada aqui é o que torna a aferição capaz de dizer NÃO.
 */
export const DIRECAO: Record<Padrao, "alta" | "baixa" | "nenhuma"> = {
  doji: "nenhuma",
  martelo: "alta",
  "estrela-cadente": "baixa",
  "engolfo-alta": "alta",
  "engolfo-baixa": "baixa",
  "rejeicao-superior": "baixa",
  "rejeicao-inferior": "alta",
  expansao: "nenhuma",
};
