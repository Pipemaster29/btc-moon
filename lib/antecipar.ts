/**
 * O único sinal deste projeto que olha para FRENTE.
 *
 * Tudo o mais aqui descreve o que já aconteceu: o garimpo mede o que vem depois
 * do pump, o estágio diz onde a moeda está, o placar corrige a prova. A pergunta
 * que nunca teve resposta é a que o usuário faz: dá para ver ANTES?
 *
 * A POWER foi o caso que forçou a medição. Em 13/09 ela fez +38% em 24 horas e o
 * painel marcou "observar · nota 10" do começo ao fim — nenhuma variável dele se
 * mexeu. A pergunta virou: existe ALGUMA coisa medida que suba a chance de um
 * pump antes dele?
 *
 * =================================================================== EXISTE, SIM
 *
 * `npm run aferir-antecipar` refaz a medição. Sobre 526 perpétuos e os 31 dias de
 * open interest que a Binance guarda, com carência de 2 dias entre observações da
 * mesma moeda e intervalo de 95% reamostrando moedas:
 *
 *   salto de OI num dia      n      pump ≥20% em 2 dias    contra a base
 *   ≤ −10%                  333     11,4% [7,9, 14,9]        1,60x
 *   −10 a 0%              5.088      6,8% [5,9,  7,7]        0,95x
 *   0 a +10%              4.235      6,9% [5,9,  7,6]        0,97x
 *   +10 a +25%              362     15,5% [11,8, 19,6]       2,17x
 *   +25 a +50%              100     26,0% [17,5, 33,7]       3,65x
 *   ≥ +50%                   65     24,6% [12,5, 34,8]       3,46x
 *
 * A base é 7,12% [6,37, 8,01] sobre 7.347 observações independentes. O intervalo
 * dos três cortes de cima fica INTEIRO acima dela, o efeito é monotônico na
 * subida, e aparece nas duas metades da janela separadamente (3,19x e 3,93x). É
 * o primeiro sinal deste projeto que separa para o lado de CIMA.
 *
 * A PONTA DE BAIXO TAMBÉM SEPARA, e isso é informação: OI caindo mais de 10% mede
 * 11,4%, 1,60x a base. O que o salto marca não é "alguém comprando" — é a moeda
 * sendo MEXIDA, e mexer inclui desmontar posição.
 *
 * E COM O PREÇO AINDA PARADO ele continua de pé, que é a versão que interessa:
 * OI ≥+20% no dia com o preço andando menos de 3% mede 16,9% [9,1, 27,9], 2,38x
 * a base. Alguém montando posição sem empurrar o preço é um fato observável, e é
 * isso que este módulo carimba.
 *
 * ===================================================== E MESMO ASSIM NÃO É CALL
 *
 * A probabilidade sobe; o RETORNO não vem junto. No corte de +25 a +50%, o
 * retorno mediano de dois dias é **−1,6%** contra +0,3% da base, e a média é
 * +3,6% contra +1,3%. Mediana negativa com média positiva é o perfil de loteria:
 * um quarto explode e três quartos sangram. A excursão mediana é quase simétrica
 * — máximo de +7,1% contra mínimo de −6,7% no caminho —, então não há assimetria
 * para um stop explorar.
 *
 * É a mesma forma do achado do garimpo, e leva à mesma conclusão: **fila de
 * investigação, não ordem**. O que este módulo diz é "esta moeda está sendo
 * MEXIDA agora", e isso vale para olhar. Quem transformar isso em compra está
 * apostando na cauda com a mediana contra.
 *
 * ================================================================= OS LIMITES
 *
 * - SÃO 31 DIAS. É tudo o que a Binance guarda em `openInterestHist`, e nenhum
 *   arquivo histórico traz esta coluna. Não dá para testar em 2024, e a janela
 *   se move sozinha: o número acima é do regime de agosto e setembro de 2026.
 * - A POWER NÃO TERIA SIDO PEGA. O OI dela subiu 1,4% e 2,0% nos dois dias
 *   antes do pump de 36,6%. Este detector não é a resposta para aquele caso —
 *   é a resposta para a pergunta geral, e o caso que a motivou fica de fora.
 * - O VIÉS DE SOBREVIVÊNCIA corre CONTRA a conclusão aqui, ao contrário do
 *   garimpo: as moedas que pumparam e foram deslistadas sairiam do universo,
 *   e elas são justamente as que mais pumparam.
 *
 * CUSTO ZERO DE REQUISIÇÃO: a série de OI vem na mesma resposta que `circulante`
 * já buscava e jogava fora.
 */

/** Um dia de open interest, em MOEDA — não em dólar. */
export interface DiaDeOi {
  dia: string;
  oi: number;
}

/**
 * O corte em que a chance de pump triplica.
 *
 * Vinte e cinco por cento num dia. Abaixo disso o efeito existe mas é de 2,2x;
 * acima, o intervalo inteiro fica acima da base em todos os cortes testados.
 */
export const SALTO_DE_OI = 0.25;

/** O corte mais baixo, onde o efeito começa a aparecer. */
export const SALTO_DE_OI_FRACO = 0.10;

/**
 * "O preço ainda não andou": variação do dia, em módulo.
 *
 * Em PREÇO, não em margem. Três por cento é o corte em que a medição foi feita.
 */
export const PRECO_PARADO = 0.03;

export interface Antecipacao {
  /** Open interest do último dia FECHADO ÷ o do dia anterior − 1. */
  salto: number;
  /** O dia do salto, em AAAA-MM-DD. */
  dia: string;
  /** Variação de preço do mesmo dia, do abre ao fecha. Nulo quando não há vela. */
  moveuNoDia: number | null;
  /** O preço ficou parado enquanto o OI subia? Nulo quando não dá para dizer. */
  parado: boolean | null;
  /** Quantos dias de OI a série tinha. Abaixo de 3 não se mede nada. */
  dias: number;
}

/**
 * O salto de open interest do último dia fechado.
 *
 * NULO QUANDO NÃO DÁ PARA MEDIR, e isso inclui o caso mais traiçoeiro: a série
 * que a Binance devolve inclui o dia de HOJE, ainda aberto. O open interest dele
 * é o de agora, não o do fechamento — comparar isso com um dia inteiro dá um
 * salto que depende da hora em que a página foi aberta. O dia corrente sai da
 * conta, exatamente como em `lib/acumulacao.ts`.
 */
export function lerAntecipacao(
  serie: DiaDeOi[],
  velaDoDia?: { dia: string; open: number; close: number }[],
  agoraMs = Date.now(),
): Antecipacao | null {
  if (!serie || serie.length < 3) return null;

  const hoje = new Date(agoraMs).toISOString().slice(0, 10);
  const fechados = [...serie]
    .filter((x) => x.dia !== hoje && Number.isFinite(x.oi) && x.oi > 0)
    .sort((a, b) => (a.dia < b.dia ? -1 : 1));
  if (fechados.length < 2) return null;

  const a = fechados[fechados.length - 1];
  const b = fechados[fechados.length - 2];
  const salto = a.oi / b.oi - 1;
  if (!Number.isFinite(salto)) return null;

  const vela = velaDoDia?.find((v) => v.dia === a.dia);
  const moveu = vela && vela.open > 0 ? vela.close / vela.open - 1 : null;

  return {
    salto,
    dia: a.dia,
    moveuNoDia: moveu !== null && Number.isFinite(moveu) ? moveu : null,
    parado: moveu === null || !Number.isFinite(moveu) ? null : Math.abs(moveu) < PRECO_PARADO,
    dias: fechados.length,
  };
}

/**
 * A frase que acompanha o número na tela, com a medição dentro.
 *
 * Obrigatória pelo mesmo motivo da de `lib/acumulacao.ts`, e ainda mais aqui:
 * este é o sinal que mais parece uma ordem de compra e ele tem mediana negativa.
 * Quem vê "3,7x a chance de pump" sem ver "e a mediana do retorno é −1,6%" leu
 * metade.
 */
export function vereditoDaAntecipacao(a: Antecipacao | null): string | null {
  if (!a || a.salto < SALTO_DE_OI_FRACO) return null;

  const forte = a.salto >= SALTO_DE_OI;
  const chance = forte ? "26,0% [17,5, 33,7]" : "15,5% [11,8, 19,6]";
  const vezes = forte ? "3,7x" : "2,2x";

  return (
    `O open interest saltou ${(a.salto * 100).toFixed(0)}% em ${a.dia}` +
    `${a.parado === true ? ", com o preço parado no dia" : ""}. ` +
    `Medido sobre 526 perpétuos, depois de um salto assim a moeda sobe 20% ou mais ` +
    `em dois dias com chance de ${chance} contra base de 7,1% — ${vezes} a base, e o ` +
    `intervalo não encosta nela. MAS o retorno mediano desses casos é −1,6% contra ` +
    `+0,3% da base: a chance de pump sobe e a conta não. Serve para olhar, não para comprar.`
  );
}
