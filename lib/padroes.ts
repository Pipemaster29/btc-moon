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
  // COMPARA CORPO COM CORPO e não vela com vela, que é a definição clássica: os
  // pavios entram na versão "engolfo total" e ela é rara demais para ter
  // amostra. Onde há duas definições e uma delas não fecha amostra, a medida
  // honesta é a que fecha — e dizer qual foi usada.
  const ant = velas[i - 1];
  if (ant) {
    const b = anatomia(ant);
    if (b.corpo > 0 && a.corpo > 0) {
      const topoAnt = Math.max(ant.open, ant.close);
      const baseAnt = Math.min(ant.open, ant.close);
      if (a.alta && !b.alta && v.close >= topoAnt && v.open <= baseAnt) out.push("engolfo-alta");
      if (!a.alta && b.alta && v.open >= topoAnt && v.close <= baseAnt) out.push("engolfo-baixa");
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
 * estudo, e a consequência é que "em suporte" vai ser raro e a amostra vai
 * sofrer. A aferição roda com 3% e 8% para isso ficar visível em vez de
 * escondido numa constante.
 */
export const PERTO = 0.03;

const LADO = 3;

/** Pivôs de fundo — o espelho de `pivosDeTopo` de `lib/tecnica.ts`. */
export function pivosDeFundo(velas: VelaOHLC[], ate: number): number[] {
  const out: number[] = [];
  for (let i = LADO; i < Math.min(velas.length, ate) - LADO; i++) {
    let menor = true;
    for (let j = i - LADO; j <= i + LADO; j++) {
      if (j !== i && velas[j].low <= velas[i].low) {
        menor = false;
        break;
      }
    }
    if (menor) out.push(i);
  }
  return out;
}

/** Pivôs de topo, mas só até `ate` — para nunca olhar para frente. */
export function pivosDeTopoAte(velas: VelaOHLC[], ate: number): number[] {
  const out: number[] = [];
  for (let i = LADO; i < Math.min(velas.length, ate) - LADO; i++) {
    let maior = true;
    for (let j = i - LADO; j <= i + LADO; j++) {
      if (j !== i && velas[j].high >= velas[i].high) {
        maior = false;
        break;
      }
    }
    if (maior) out.push(i);
  }
  return out;
}

export function contextoDe(velas: VelaOHLC[], i: number, perto = PERTO): Contexto | null {
  if (i < 21 || i >= velas.length) return null;
  const v = velas[i];
  const preco = v.close;
  if (!(preco > 0)) return null;

  // `i` e não `i + 1`: o pivô precisa estar FECHADO antes da vela que se está
  // classificando. Um pivô que inclui a própria vela — ou as três seguintes, que
  // é o que a janela simétrica exige — seria olhar para frente, e a aferição
  // inteira viraria circular sem nenhum sintoma.
  //
  // O `- LADO` é o que garante isso: um pivô no índice k só é conhecido depois
  // de k + LADO, então só valem os pivôs até `i - LADO`.
  const limite = i - LADO;
  const fundos = pivosDeFundo(velas, limite).map((k) => velas[k].low);
  const topos = pivosDeTopoAte(velas, limite).map((k) => velas[k].high);

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
