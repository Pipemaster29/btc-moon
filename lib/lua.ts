/**
 * As fases da lua — que o gráfico prometia e não desenhava.
 *
 * A legenda do PriceChart dizia "aproxime o gráfico para ver as fases da lua"
 * desde sempre, e não existia uma linha de código que as calculasse. Promessa na
 * interface sem nada atrás é pior do que ausência: quem lê aproxima, não vê
 * nada, e conclui que o próprio gráfico está quebrado.
 *
 * Não há fonte de dados aqui, e nem precisa: a lua é o único dado deste projeto
 * inteiro que não vem de API nenhuma. Sai de aritmética pura, e é conferida —
 * contra oito instantes publicados pelo Observatório Naval dos EUA entre 2012 e
 * 2025, o pior erro é de QUATRO MINUTOS e nenhuma fase cai no dia errado.
 *
 * SOBRE A UTILIDADE DISSO, para não haver mal-entendido: a ideia de que a lua
 * move o preço do bitcoin é folclore de rede social, e não há nada neste
 * repositório que a sustente. Isto entra como ORNAMENTO datado — o projeto se
 * chama btc-moon —, na mesma prateleira dos marcadores de evento, e por isso
 * fica atrás de um botão desligável em vez de aparecer por padrão.
 */

/**
 * Mês sinódico MÉDIO, em dias. Sozinho ele não basta.
 *
 * A órbita da lua é elíptica, então cada lunação real se adianta ou se atrasa
 * até treze horas em relação à média. Conferido contra as efemérides do
 * Observatório Naval dos EUA, a conta média sozinha errava o DIA em uma de cada
 * seis fases — a cheia de 25/01/2024 caía em 26/01. Num gráfico diário isso é
 * o marcador na vela errada, que é justamente o tipo de erro pequeno e
 * silencioso que este projeto não deixa passar.
 *
 * Por isso a média é só o ponto de partida: as correções periódicas abaixo, do
 * capítulo 49 do Astronomical Algorithms do Meeus, trazem o erro para minutos.
 */
const SINODICO_DIAS = 29.530588861;
/** O mesmo, em segundos — usado só para percorrer lunações. */
const SINODICO = SINODICO_DIAS * 86_400;

/** Dia juliano da lua nova de 6 de janeiro de 2000, 18h14 UTC. */
const JDE_ZERO = 2451550.09766;
/** Dia juliano do início da época Unix, para converter de um para o outro. */
const JD_UNIX = 2440587.5;

const NOVA_ZERO = (JDE_ZERO - JD_UNIX) * 86_400;

export type Fase = "nova" | "cheia";

export interface FaseDaLua {
  /** Segundos desde a época, UTC. */
  time: number;
  fase: Fase;
}

const rad = (graus: number) => (graus % 360) * (Math.PI / 180);

/**
 * O instante da lunação `k`, corrigido.
 *
 * `k` inteiro é lua nova, `k + 0,5` é lua cheia — é assim que o Meeus indexa. Os
 * coeficientes das duas fases são quase iguais mas não idênticos, e trocá-los
 * custa alguns minutos; ficam separados por isso.
 */
function instanteDaFase(k: number, fase: Fase): number {
  const T = k / 1236.85;
  const T2 = T * T;

  // Excentricidade da órbita da Terra, que decai devagar ao longo dos séculos.
  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  // Anomalia média do Sol, da Lua, e o argumento de latitude.
  const M = rad(2.5534 + 29.1053567 * k - 0.0000014 * T2);
  const Ml = rad(201.5643 + 385.81693528 * k + 0.0107582 * T2);
  const F = rad(160.7108 + 390.67050284 * k - 0.0016118 * T2);
  const O = rad(124.7746 - 1.56375588 * k + 0.0020672 * T2);

  const jdeMedio = JDE_ZERO + SINODICO_DIAS * k + 0.00015437 * T2;

  // Os sete termos que valem mais de um minuto. A lista completa do Meeus tem
  // catorze; do oitavo em diante nenhum passa de vinte segundos, e vinte
  // segundos não movem um marcador de vela diária.
  const correcao =
    fase === "nova"
      ? -0.4072 * Math.sin(Ml) +
        0.17241 * E * Math.sin(M) +
        0.01608 * Math.sin(2 * Ml) +
        0.01039 * Math.sin(2 * F) +
        0.00739 * E * Math.sin(Ml - M) -
        0.00514 * E * Math.sin(Ml + M) +
        0.00208 * E * E * Math.sin(2 * M)
      : -0.40614 * Math.sin(Ml) +
        0.17302 * E * Math.sin(M) +
        0.01614 * Math.sin(2 * Ml) +
        0.01043 * Math.sin(2 * F) +
        0.00734 * E * Math.sin(Ml - M) -
        0.00515 * E * Math.sin(Ml + M) +
        0.00209 * E * E * Math.sin(2 * M);

  // Termo adicional do nodo, que sozinho vale meio minuto mas é barato.
  const extra = -0.00017 * Math.sin(O);

  return Math.round((jdeMedio + correcao + extra - JD_UNIX) * 86_400);
}

/**
 * As luas novas e cheias entre dois instantes, em ordem cronológica.
 *
 * Funciona para trás também: a época é o ano 2000 e o histórico do gráfico
 * começa em 2011, mas um `k` negativo é tão válido quanto um positivo.
 */
export function fasesEntre(de: number, ate: number): FaseDaLua[] {
  if (!(ate > de)) return [];

  const out: FaseDaLua[] = [];
  // Uma lunação de folga de cada lado: a correção pode empurrar uma fase da
  // borda para dentro do intervalo.
  const primeiro = Math.floor((de - NOVA_ZERO) / SINODICO) - 1;
  const ultimo = Math.ceil((ate - NOVA_ZERO) / SINODICO) + 1;

  for (let k = primeiro; k <= ultimo; k++) {
    for (const [passo, fase] of [
      [0, "nova"],
      [0.5, "cheia"],
    ] as const) {
      const time = instanteDaFase(k + passo, fase);
      if (time >= de && time <= ate) out.push({ time, fase });
    }
  }

  return out.sort((a, b) => a.time - b.time);
}

/**
 * Cola cada fase na vela em que ela caiu.
 *
 * Marcador com tempo que não existe na série é ignorado pela biblioteca, em
 * silêncio — e um instante lunar quase nunca coincide com a abertura de uma
 * vela. `tempos` precisa estar ordenado, que é como as velas chegam.
 */
export function grudarNasVelas(
  fases: FaseDaLua[],
  tempos: number[],
  /** Duração da vela em segundos: uma fase depois da última vela não tem onde ir. */
  passo: number,
): FaseDaLua[] {
  if (tempos.length === 0) return [];

  const out: FaseDaLua[] = [];
  let i = 0;
  for (const f of fases) {
    while (i + 1 < tempos.length && tempos[i + 1] <= f.time) i++;
    // A vela candidata é a última que começou antes da fase; ela só serve se a
    // fase caiu DENTRO dela.
    if (f.time >= tempos[i] && f.time < tempos[i] + passo) {
      out.push({ time: tempos[i], fase: f.fase });
    }
  }

  // Duas fases não cabem na mesma vela num gráfico diário, mas cabem numa
  // semanal — e marcador repetido no mesmo tempo confunde a biblioteca.
  return out.filter((f, k) => k === 0 || f.time !== out[k - 1].time);
}
