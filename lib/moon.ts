/**
 * Fases da lua pelo algoritmo de Jean Meeus, "Astronomical Algorithms" (cap. 49).
 *
 * Calcula os instantes exatos de lua nova, quarto crescente, lua cheia e quarto
 * minguante a partir de séries periódicas — sem API externa, só matemática.
 * Precisão da ordem de segundos para o período moderno.
 */

export type MoonPhaseName = "new" | "first-quarter" | "full" | "last-quarter";

export interface MoonPhase {
  phase: MoonPhaseName;
  date: Date;
}

export const MOON_PHASE_LABEL: Record<MoonPhaseName, string> = {
  new: "Lua nova",
  "first-quarter": "Quarto crescente",
  full: "Lua cheia",
  "last-quarter": "Quarto minguante",
};

export const MOON_PHASE_SYMBOL: Record<MoonPhaseName, string> = {
  new: "●",
  "first-quarter": "◐",
  full: "○",
  "last-quarter": "◑",
};

const RAD = Math.PI / 180;
const sin = (deg: number) => Math.sin(deg * RAD);
const cos = (deg: number) => Math.cos(deg * RAD);

/** Correções adicionais A1..A14 (Meeus p. 352), comuns a todas as fases. */
const ADDITIONAL_TERMS: [number, number, number][] = [
  // [coeficiente, termo constante, coeficiente de k]
  [0.000325, 299.77, 0.107408],
  [0.000165, 251.88, 0.016321],
  [0.000164, 251.83, 26.651886],
  [0.000126, 349.42, 36.412478],
  [0.00011, 84.66, 18.206239],
  [0.000062, 141.74, 53.303771],
  [0.00006, 207.14, 2.453732],
  [0.000056, 154.84, 7.30686],
  [0.000047, 34.52, 27.261239],
  [0.000042, 207.19, 0.121824],
  [0.00004, 291.34, 1.844379],
  [0.000037, 161.72, 24.198154],
  [0.000035, 239.56, 25.513099],
  [0.000023, 331.55, 3.592518],
];

/**
 * ΔT (TD − UT) em segundos, aproximação de Espenak & Meeus para 2005–2050.
 * O algoritmo devolve tempo dinâmico; isto converte para UTC.
 */
function deltaTSeconds(year: number): number {
  const t = year - 2000;
  return 62.92 + 0.32217 * t + 0.005589 * t * t;
}

function julianDayToDate(jde: number, approxYear: number): Date {
  const unixMs = (jde - 2440587.5) * 86400000;
  return new Date(unixMs - deltaTSeconds(approxYear) * 1000);
}

/**
 * Instante da fase para a lunação `k`.
 * k inteiro = lua nova; +0.25 crescente; +0.5 cheia; +0.75 minguante.
 * k = 0 corresponde à lua nova de 6 de janeiro de 2000.
 */
function phaseJde(k: number): number {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const T4 = T3 * T;

  // Instante médio da fase
  let jde =
    2451550.09766 +
    29.530588861 * k +
    0.00015437 * T2 -
    0.00000015 * T3 +
    0.00000000073 * T4;

  const E = 1 - 0.002516 * T - 0.0000074 * T2;
  // Anomalia média do Sol
  const M = 2.5534 + 29.1053567 * k - 0.0000014 * T2 - 0.00000011 * T3;
  // Anomalia média da Lua
  const M1 =
    201.5643 +
    385.81693528 * k +
    0.0107582 * T2 +
    0.00001238 * T3 -
    0.000000058 * T4;
  // Argumento de latitude da Lua
  const F =
    160.7108 +
    390.67050284 * k -
    0.0016118 * T2 -
    0.00000227 * T3 +
    0.000000011 * T4;
  // Longitude do nodo ascendente
  const omega =
    124.7746 - 1.56375588 * k + 0.0020672 * T2 + 0.00000215 * T3;

  const phaseIndex = Math.round((k - Math.floor(k)) * 4); // 0=nova 1=cresc 2=cheia 3=ming

  if (phaseIndex === 0 || phaseIndex === 2) {
    // Lua nova e lua cheia partilham a estrutura, mudando os dois primeiros termos.
    const isNew = phaseIndex === 0;
    jde +=
      (isNew ? -0.4072 : -0.40614) * sin(M1) +
      (isNew ? 0.17241 : 0.17302) * E * sin(M) +
      (isNew ? 0.01608 : 0.01614) * sin(2 * M1) +
      (isNew ? 0.01039 : 0.01043) * sin(2 * F) +
      (isNew ? 0.00739 : 0.00734) * E * sin(M1 - M) +
      (isNew ? -0.00514 : -0.00515) * E * sin(M1 + M) +
      (isNew ? 0.00208 : 0.00209) * E * E * sin(2 * M) +
      -0.00111 * sin(M1 - 2 * F) +
      -0.00057 * sin(M1 + 2 * F) +
      0.00056 * E * sin(2 * M1 + M) +
      -0.00042 * sin(3 * M1) +
      0.00042 * E * sin(M + 2 * F) +
      0.00038 * E * sin(M - 2 * F) +
      -0.00024 * E * sin(2 * M1 - M) +
      -0.00017 * sin(omega) +
      -0.00007 * sin(M1 + 2 * M) +
      0.00004 * sin(3 * F) +
      0.00004 * sin(2 * M1 - 2 * F) +
      0.00003 * sin(M1 + M - 2 * F) +
      0.00003 * sin(2 * M1 + 2 * F) +
      -0.00003 * sin(M1 + M + 2 * F) +
      0.00003 * sin(M1 - M + 2 * F) +
      -0.00002 * sin(M1 - M - 2 * F) +
      -0.00002 * sin(3 * M1 + M) +
      0.00002 * sin(4 * M1);
  } else {
    // Quartos crescente e minguante
    jde +=
      -0.62801 * sin(M1) +
      0.17172 * E * sin(M) +
      -0.01183 * E * sin(M1 + M) +
      0.00862 * sin(2 * M1) +
      0.00804 * sin(2 * F) +
      0.00454 * E * sin(M1 - M) +
      0.00204 * E * E * sin(2 * M) +
      -0.0018 * sin(M1 - 2 * F) +
      -0.0007 * sin(M1 + 2 * F) +
      -0.0004 * sin(3 * M1) +
      -0.00034 * E * sin(2 * M1 - M) +
      0.00032 * E * sin(M + 2 * F) +
      0.00032 * E * sin(M - 2 * F) +
      -0.00028 * E * E * sin(M1 + 2 * M) +
      0.00027 * E * sin(2 * M1 + M) +
      -0.00017 * sin(omega) +
      -0.00005 * sin(M1 - M - 2 * F) +
      0.00004 * sin(2 * M1 + 2 * F) +
      -0.00004 * sin(M1 + M + 2 * F) +
      0.00004 * sin(M1 - 2 * M) +
      0.00003 * sin(M1 + M - 2 * F) +
      0.00003 * sin(3 * M) +
      0.00002 * sin(2 * M1 - 2 * F) +
      0.00002 * sin(M1 - M + 2 * F) +
      -0.00002 * sin(3 * M1 + M);

    // Correção W, somada no crescente e subtraída no minguante.
    const W =
      0.00306 -
      0.00038 * E * cos(M) +
      0.00026 * cos(M1) -
      0.00002 * cos(M1 - M) +
      0.00002 * cos(M1 + M) +
      0.00002 * cos(2 * F);
    jde += phaseIndex === 1 ? W : -W;
  }

  for (const [coefficient, constant, kFactor] of ADDITIONAL_TERMS) {
    jde += coefficient * sin(constant + kFactor * k);
  }

  return jde;
}

const PHASE_BY_INDEX: MoonPhaseName[] = [
  "new",
  "first-quarter",
  "full",
  "last-quarter",
];

/**
 * Todas as mudanças de fase entre duas datas, em ordem cronológica.
 */
export function moonPhasesBetween(from: Date, to: Date): MoonPhase[] {
  const fromYear = from.getUTCFullYear() + from.getUTCMonth() / 12;
  // k ≈ (ano decimal − 2000) × 12.3685; folga de uma lunação em cada ponta.
  const startK = Math.floor((fromYear - 2000) * 12.3685) - 1;
  const toYear = to.getUTCFullYear() + to.getUTCMonth() / 12;
  const endK = Math.ceil((toYear - 2000) * 12.3685) + 1;

  const phases: MoonPhase[] = [];

  for (let k = startK; k <= endK; k++) {
    for (let quarter = 0; quarter < 4; quarter++) {
      const exactK = k + quarter / 4;
      const jde = phaseJde(exactK);
      const approxYear = 2000 + exactK / 12.3685;
      const date = julianDayToDate(jde, approxYear);

      if (date >= from && date <= to) {
        phases.push({ phase: PHASE_BY_INDEX[quarter], date });
      }
    }
  }

  return phases.sort((a, b) => a.date.getTime() - b.date.getTime());
}
