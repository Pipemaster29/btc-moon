/**
 * A ESTATÍSTICA DE MESA DE FUNDO, sobre as curvas dos robôs: a ficha de risco,
 * os testes que dizem se o Sharpe medido sobrevive à quantidade de ideias
 * testadas até achá-lo, e a carteira que junta os livros.
 *
 * Por que isto existe. A medição dos robôs (`npm run medir-robos`) diz quanto
 * cada regra teria feito; ela não diz quanto disso é sorte de quem testou
 * centenas de variações e publicou a melhor. As regras deste repositório saíram
 * de ~300 tentativas contadas por baixo (as reprovadas estão escritas ao lado
 * de cada constante de `lib/robos.ts`), e com 300 tentativas sem vantagem
 * nenhuma a melhor delas mostra, em 997 dias, um Sharpe anual perto de 1,8 só
 * por acaso. Os testes daqui são os que uma mesa de fundo roda antes de pôr
 * dinheiro numa estratégia:
 *
 *   `sharpeProbabilistico`  a chance de o Sharpe verdadeiro passar de uma régua,
 *                           com a assimetria e a cauda dos retornos dentro
 *                           (Bailey e López de Prado, 2012);
 *   `sharpeDeflacionado`    o mesmo, com a régua no Sharpe que a MELHOR de N
 *                           tentativas sem vantagem mostraria (idem, 2014);
 *   `trilhaMinima`          quantos dias de ao vivo são precisos para afirmar o
 *                           Sharpe com 95% de confiança;
 *   `bootstrapEstacionario` o intervalo de confiança de qualquer número da
 *                           ficha, sorteando blocos de dias (Politis e Romano,
 *                           1994) para guardar a memória curta dos retornos;
 *   `pboCSCV`               a probabilidade de que a variante escolhida pelo
 *                           passado fique abaixo da mediana no futuro (Bailey,
 *                           Borwein, López de Prado e Zhu, 2017);
 *   `walkForward`           a seleção refeita a cada trimestre só com o passado:
 *                           o resultado de quem tivesse escolhido a regra em
 *                           tempo real, e não depois de ver tudo.
 *
 * E a carteira de livros (`paridadeDeRisco`): o capital repartido entre os
 * robôs pelo inverso da volatilidade de cada um, refeito todo dia 1º, só com o
 * que se sabia na véspera — o que um fundo multiestratégia faz com subcontas.
 *
 * As unidades: retorno é FRAÇÃO por dia; Sharpe sem sufixo é POR DIA (é o que
 * as fórmulas pedem), e `sharpe` da ficha é ANUAL (×√365, porque cripto negocia
 * todo dia). A curtose é a comum (3 na normal), não o excesso.
 *
 * Este arquivo não importa nada de `node:`: a página calcula a ficha e o fundo
 * ao vivo com as mesmas funções da medição.
 */

export const DIA_MS = 86_400_000;
export const DIAS_NO_ANO = 365;
const EULER_MASCHERONI = 0.5772156649015329;

// ------------------------------------------------------------------ a normal

/**
 * A acumulada da normal padrão, pelo algoritmo 5666 de Hart (1968) na forma de
 * West (2005): precisão de dupla em toda a reta. Os testes daqui leem caudas
 * de 1e-4 e diferenças na sexta casa (um Sharpe deflacionado de 0,9987 contra
 * 0,9994), e a aproximação de cinco termos de Abramowitz e Stegun já erra na
 * quarta; a de erfc do Numerical Recipes dava Φ(0) = 0,49999998.
 */
export function normalAcumulada(x: number): number {
  if (Number.isNaN(x)) return NaN;
  const z = Math.abs(x);
  let cauda: number;
  if (z > 37) cauda = 0;
  else {
    const e = Math.exp((-z * z) / 2);
    if (z < 7.07106781186547) {
      let n = 3.52624965998911e-2 * z + 0.700383064443688;
      n = n * z + 6.37396220353165;
      n = n * z + 33.912866078383;
      n = n * z + 112.079291497871;
      n = n * z + 221.213596169931;
      n = n * z + 220.206867912376;
      let d = 8.83883476483184e-2 * z + 1.75566716318264;
      d = d * z + 16.064177579207;
      d = d * z + 86.7807322029461;
      d = d * z + 296.564248779674;
      d = d * z + 637.333633378831;
      d = d * z + 793.826512519948;
      d = d * z + 440.413735824752;
      cauda = (e * n) / d;
    } else {
      let b = z + 0.65;
      b = z + 4 / b;
      b = z + 3 / b;
      b = z + 2 / b;
      b = z + 1 / b;
      cauda = e / b / 2.506628274631;
    }
  }
  return x > 0 ? 1 - cauda : cauda;
}

/**
 * A inversa da acumulada (o quantil), pelo algoritmo de Acklam com um passo de
 * Halley por cima: erro abaixo de 1e-9, o bastante para Φ⁻¹(1 − 1/1000).
 */
export function normalInversa(p: number): number {
  if (!(p > 0 && p < 1)) return p === 0 ? -Infinity : p === 1 ? Infinity : NaN;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const baixo = 0.02425;
  let x: number;
  if (p < baixo) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p > 1 - baixo) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  // Um passo de Halley sobre a acumulada de cima.
  const e = normalAcumulada(x) - p;
  const u = e * Math.sqrt(2 * Math.PI) * Math.exp((x * x) / 2);
  return x - u / (1 + (x * u) / 2);
}

// ------------------------------------------------------------------ a curva

export interface PontoCurva {
  t: number;
  patrimonio: number;
}

/**
 * Os retornos de um dia para o outro, nas viradas de dia (00:00 UTC). A curva
 * medida já tem um ponto por dia; a do ao vivo tem um por hora, e o ponto de
 * cada virada é o último até ela — com no máximo 3 h de atraso, como no alvo de
 * volatilidade dos robôs: dia sem retrato fica de fora em vez de virar um
 * retorno zero, que acalmaria a conta.
 *
 * `datas[k]` é o FIM do dia de `r[k]` (a virada em que ele fecha).
 */
export function retornosDiarios(curva: readonly PontoCurva[]): { datas: number[]; r: number[] } {
  const datas: number[] = [];
  const r: number[] = [];
  if (curva.length < 2) return { datas, r };
  const primeiro = Math.ceil(curva[0].t / DIA_MS) * DIA_MS;
  const ultimo = Math.floor(curva[curva.length - 1].t / DIA_MS) * DIA_MS;
  let k = 0;
  let anterior: number | null = null;
  for (let t = primeiro; t <= ultimo; t += DIA_MS) {
    while (k + 1 < curva.length && curva[k + 1].t <= t) k++;
    const p = curva[k];
    const valido = p.t <= t && t - p.t <= 3 * 3_600_000 && p.patrimonio > 0;
    const v = valido ? p.patrimonio : null;
    if (v !== null && anterior !== null) {
      datas.push(t);
      r.push(v / anterior - 1);
    }
    anterior = v;
  }
  return { datas, r };
}

/** Média, desvio (amostral), assimetria e curtose (populacionais, como nas fórmulas de Bailey e López de Prado). */
export function momentos(r: readonly number[]): { media: number; desvio: number; assimetria: number; curtose: number } {
  const n = r.length;
  if (n < 2) return { media: NaN, desvio: NaN, assimetria: NaN, curtose: NaN };
  let s = 0;
  for (const x of r) s += x;
  const media = s / n;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const x of r) {
    const d = x - media;
    const d2 = d * d;
    m2 += d2;
    m3 += d2 * d;
    m4 += d2 * d2;
  }
  const varPop = m2 / n;
  const sdPop = Math.sqrt(varPop);
  return {
    media,
    desvio: Math.sqrt(m2 / (n - 1)),
    assimetria: sdPop > 0 ? m3 / n / (sdPop * sdPop * sdPop) : NaN,
    curtose: varPop > 0 ? m4 / n / (varPop * varPop) : NaN,
  };
}

/** O Sharpe POR DIA (sem juro livre: o caixa dos robôs não rende). */
export function sharpeDiario(r: readonly number[]): number {
  const { media, desvio } = momentos(r);
  return desvio > 0 ? media / desvio : NaN;
}

/** Quantil por interpolação linear entre os pontos ordenados (o "tipo 7" do R). */
export function quantil(xs: readonly number[], q: number): number {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (v.length === 0) return NaN;
  const h = (v.length - 1) * Math.min(1, Math.max(0, q));
  const i = Math.floor(h);
  return v[i] + (h - i) * ((v[Math.min(v.length - 1, i + 1)] ?? v[i]) - v[i]);
}

// ------------------------------------------------------------------ a ficha

export interface Ficha {
  /** Dias de retorno na conta. */
  dias: number;
  /** Retorno da janela inteira, em fração. */
  retorno: number;
  /** Retorno composto ao ano. */
  cagr: number;
  /** Desvio dos retornos diários × √365. */
  volAnual: number;
  /** Sharpe ANUAL. */
  sharpe: number;
  /** Sortino ANUAL: a média sobre o desvio só das perdas (raiz da média dos quadrados abaixo de zero). */
  sortino: number;
  /** Maior queda do pico, ≤ 0 — na curva DIÁRIA, que não vê a queda dentro do dia. */
  quedaMaxima: number;
  /** CAGR ÷ |queda máxima|. */
  calmar: number;
  /** O maior número de dias seguidos abaixo do pico anterior. */
  maiorTempoSubmerso: number;
  /** Perda diária que só é passada em 5% dos dias (positiva), e a média desses 5% piores. */
  var95: number;
  cvar95: number;
  assimetria: number;
  curtose: number;
  melhorDia: number;
  piorDia: number;
  /** Fração dos dias e dos meses fechados no positivo. */
  diasPositivos: number;
  mesesPositivos: number;
  /** Contra a referência (o BTC): beta, correlação e o alfa anual que sobra do beta (média diária × 365). */
  beta?: number;
  correlacao?: number;
  alfaAnual?: number;
}

/** O retorno de cada mês do calendário (UTC), composto dos dias. */
export function porMes(r: readonly number[], datas: readonly number[]): { mes: string; retorno: number }[] {
  const out: { mes: string; retorno: number }[] = [];
  for (let k = 0; k < r.length; k++) {
    // O dia de r[k] termina em datas[k]: ele pertence ao mês do instante anterior à virada.
    const d = new Date(datas[k] - 1);
    const mes = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    const ult = out[out.length - 1];
    if (ult && ult.mes === mes) ult.retorno = (1 + ult.retorno) * (1 + r[k]) - 1;
    else out.push({ mes, retorno: r[k] });
  }
  return out;
}

export function fichaDe(r: readonly number[], datas: readonly number[], referencia?: readonly number[]): Ficha {
  const n = r.length;
  const { media, desvio, assimetria, curtose } = momentos(r);
  let eq = 1;
  let pico = 1;
  let queda = 0;
  let submerso = 0;
  let maiorSubmerso = 0;
  let somaPerda2 = 0;
  let positivos = 0;
  for (const x of r) {
    eq *= 1 + x;
    if (eq >= pico) {
      pico = eq;
      submerso = 0;
    } else {
      submerso++;
      if (submerso > maiorSubmerso) maiorSubmerso = submerso;
    }
    if (eq / pico - 1 < queda) queda = eq / pico - 1;
    if (x < 0) somaPerda2 += x * x;
    if (x > 0) positivos++;
  }
  const cagr = n > 0 && eq > 0 ? eq ** (DIAS_NO_ANO / n) - 1 : NaN;
  const desvioPerda = Math.sqrt(somaPerda2 / Math.max(1, n));
  const ordenados = [...r].sort((a, b) => a - b);
  const cauda = Math.max(1, Math.floor(0.05 * n));
  const meses = porMes(r, datas);
  const ficha: Ficha = {
    dias: n,
    retorno: eq - 1,
    cagr,
    volAnual: desvio * Math.sqrt(DIAS_NO_ANO),
    sharpe: desvio > 0 ? (media / desvio) * Math.sqrt(DIAS_NO_ANO) : NaN,
    sortino: desvioPerda > 0 ? (media / desvioPerda) * Math.sqrt(DIAS_NO_ANO) : NaN,
    quedaMaxima: queda,
    calmar: queda < 0 ? cagr / -queda : NaN,
    maiorTempoSubmerso: maiorSubmerso,
    var95: -quantil(r, 0.05),
    cvar95: -ordenados.slice(0, cauda).reduce((a, b) => a + b, 0) / cauda,
    assimetria,
    curtose,
    melhorDia: ordenados[n - 1] ?? NaN,
    piorDia: ordenados[0] ?? NaN,
    diasPositivos: n > 0 ? positivos / n : NaN,
    mesesPositivos: meses.length > 0 ? meses.filter((m) => m.retorno > 0).length / meses.length : NaN,
  };
  if (referencia && referencia.length === n && n > 2) {
    const mr = momentos(referencia);
    let cov = 0;
    for (let k = 0; k < n; k++) cov += (r[k] - media) * (referencia[k] - mr.media);
    cov /= n - 1;
    const varRef = mr.desvio * mr.desvio;
    ficha.beta = varRef > 0 ? cov / varRef : NaN;
    ficha.correlacao = desvio > 0 && mr.desvio > 0 ? cov / (desvio * mr.desvio) : NaN;
    ficha.alfaAnual = (media - (ficha.beta ?? 0) * mr.media) * DIAS_NO_ANO;
  }
  return ficha;
}

/** A correlação de Pearson entre duas séries do mesmo tamanho. */
export function correlacao(a: readonly number[], b: readonly number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 3) return NaN;
  const ma = momentos(a.slice(0, n));
  const mb = momentos(b.slice(0, n));
  let cov = 0;
  for (let k = 0; k < n; k++) cov += (a[k] - ma.media) * (b[k] - mb.media);
  cov /= n - 1;
  return ma.desvio > 0 && mb.desvio > 0 ? cov / (ma.desvio * mb.desvio) : NaN;
}

// ------------------------------------------------------------------ o Sharpe é sorte?

/**
 * O SHARPE PROBABILÍSTICO: a probabilidade de o Sharpe verdadeiro passar de
 * `referencia` (POR DIA), dado o medido em `r`. O desvio do estimador cresce
 * com a assimetria negativa e com a cauda gorda — retorno de seguidor de
 * tendência, com assimetria positiva, tem estimador MENOS ruidoso que o normal.
 */
export function sharpeProbabilistico(r: readonly number[], referencia = 0): number {
  const n = r.length;
  const { media, desvio, assimetria, curtose } = momentos(r);
  if (!(n > 2) || !(desvio > 0)) return NaN;
  const sr = media / desvio;
  const v = 1 - assimetria * sr + ((curtose - 1) / 4) * sr * sr;
  if (!(v > 0)) return NaN;
  return normalAcumulada(((sr - referencia) * Math.sqrt(n - 1)) / Math.sqrt(v));
}

/**
 * O Sharpe (POR DIA) que a MELHOR de `tentativas` estratégias sem vantagem
 * nenhuma mostraria, quando os Sharpes medidos delas se espalham com esta
 * variância: a régua do Sharpe deflacionado. Com `tentativas` ≤ 1, zero.
 */
export function sharpeMaximoEsperado(tentativas: number, varianciaDosSharpes: number): number {
  if (!(tentativas > 1) || !(varianciaDosSharpes > 0)) return 0;
  return (
    Math.sqrt(varianciaDosSharpes) *
    ((1 - EULER_MASCHERONI) * normalInversa(1 - 1 / tentativas) + EULER_MASCHERONI * normalInversa(1 - 1 / (tentativas * Math.E)))
  );
}

/**
 * A variância do Sharpe medido (POR DIA) quando o verdadeiro é ZERO, em `dias`
 * dias: 1/(dias − 1). É o piso honesto da variância entre tentativas — se as
 * variações testadas se espalham menos que isso, a diferença entre elas é ruído.
 */
export function varianciaDoSharpeNulo(dias: number): number {
  return dias > 1 ? 1 / (dias - 1) : NaN;
}

/**
 * O SHARPE DEFLACIONADO: o probabilístico com a régua na melhor de N
 * tentativas sem vantagem (`sharpeMaximoEsperado`). Acima de 0,95, o Sharpe
 * sobrevive à quantidade de ideias testadas; abaixo de 0,5, o medido é o que
 * a sorte de N tentativas já daria.
 */
export function sharpeDeflacionado(r: readonly number[], tentativas: number, varianciaDosSharpes: number): number {
  return sharpeProbabilistico(r, sharpeMaximoEsperado(tentativas, varianciaDosSharpes));
}

/**
 * A TRILHA MÍNIMA: quantos dias de retorno com estes momentos são precisos para
 * que o Sharpe passe de `referencia` (POR DIA) com esta confiança. Infinito se
 * o medido não passa da régua.
 */
export function trilhaMinima(r: readonly number[], referencia = 0, confianca = 0.95): number {
  const { media, desvio, assimetria, curtose } = momentos(r);
  if (!(desvio > 0)) return NaN;
  const sr = media / desvio;
  if (!(sr > referencia)) return Infinity;
  const v = 1 - assimetria * sr + ((curtose - 1) / 4) * sr * sr;
  const z = normalInversa(confianca);
  return 1 + v * (z / (sr - referencia)) ** 2;
}

// ------------------------------------------------------------------ o bootstrap

/** Gerador com semente (mulberry32): a medição sai igual de uma rodada para a outra. */
export function sorteador(semente: number): () => number {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * O BOOTSTRAP ESTACIONÁRIO: `amostras` séries do mesmo tamanho de `r`, cada uma
 * colada de blocos de dias consecutivos com tamanho sorteado (média
 * `blocoMedio`), e cada estatística calculada em cada uma. Blocos e não dias
 * soltos porque os retornos destes robôs têm memória — a monstra que dá +30%
 * hoje costuma dar mais amanhã —, e sortear dia a dia apagaria as sequências
 * que fazem as quedas e as altas grandes.
 *
 * Devolve, por estatística, os valores das amostras.
 */
export function bootstrapEstacionario(
  r: readonly number[],
  estatisticas: readonly ((amostra: number[]) => number)[],
  amostras: number,
  blocoMedio: number,
  semente: number,
): number[][] {
  const n = r.length;
  const out = estatisticas.map(() => [] as number[]);
  if (n < 2) return out;
  const sorte = sorteador(semente);
  const p = 1 / Math.max(1, blocoMedio);
  const amostra = new Array<number>(n);
  for (let b = 0; b < amostras; b++) {
    let i = Math.floor(sorte() * n);
    for (let k = 0; k < n; k++) {
      amostra[k] = r[i];
      i = sorte() < p ? Math.floor(sorte() * n) : (i + 1) % n;
    }
    for (let s = 0; s < estatisticas.length; s++) out[s].push(estatisticas[s](amostra));
  }
  return out;
}

/** O Sharpe anual, o CAGR e a queda máxima de uma série: as três estatísticas que a ficha põe com intervalo. */
export const ESTATISTICAS_DA_FICHA: readonly ((r: number[]) => number)[] = [
  (r) => sharpeDiario(r) * Math.sqrt(DIAS_NO_ANO),
  (r) => {
    let eq = 1;
    for (const x of r) eq *= 1 + x;
    return eq > 0 ? eq ** (DIAS_NO_ANO / r.length) - 1 : -1;
  },
  (r) => {
    let eq = 1;
    let pico = 1;
    let q = 0;
    for (const x of r) {
      eq *= 1 + x;
      if (eq > pico) pico = eq;
      if (eq / pico - 1 < q) q = eq / pico - 1;
    }
    return q;
  },
];

// ------------------------------------------------------------------ o sobreajuste

/** As combinações de `k` em `n` (índices), em ordem lexicográfica. */
function combinacoes(n: number, k: number): number[][] {
  const out: number[][] = [];
  const atual: number[] = [];
  const passo = (ini: number) => {
    if (atual.length === k) {
      out.push([...atual]);
      return;
    }
    for (let i = ini; i <= n - (k - atual.length); i++) {
      atual.push(i);
      passo(i + 1);
      atual.pop();
    }
  };
  passo(0);
  return out;
}

export interface ResultadoPBO {
  /** A probabilidade de sobreajuste: em que fração das partições a melhor de dentro ficou na metade de baixo fora. */
  pbo: number;
  /** Quantas partições (combinações de metade dos blocos). */
  particoes: number;
  /** A mediana, entre as partições, do Sharpe ANUAL fora da variante que foi a melhor dentro. */
  sharpeForaDaEscolhida: number;
  /** Em que fração das partições a escolhida teve Sharpe fora abaixo de zero. */
  perdaFora: number;
  /** A inclinação da reta Sharpe fora × Sharpe dentro da escolhida: abaixo de 1 é a degradação. */
  inclinacao: number;
}

/**
 * A PROBABILIDADE DE SOBREAJUSTE por validação cruzada combinatória simétrica
 * (CSCV). A matriz tem uma COLUNA por variante testada e uma linha por dia. Os
 * dias são cortados em `blocos` pedaços consecutivos; para cada maneira de
 * escolher metade deles como "dentro", a melhor variante dentro (por Sharpe) é
 * olhada fora, nos outros pedaços, e anota-se em que posição ela ficou entre as
 * variantes. Se escolher pelo passado não ajuda, a escolhida fica abaixo da
 * mediana fora em metade das partições: PBO de 0,5. Regra boa e robusta dá PBO
 * perto de zero.
 */
export function pboCSCV(matriz: readonly (readonly number[])[], blocos = 16): ResultadoPBO {
  const T = matriz.length;
  const N = matriz[0]?.length ?? 0;
  const vazio: ResultadoPBO = { pbo: NaN, particoes: 0, sharpeForaDaEscolhida: NaN, perdaFora: NaN, inclinacao: NaN };
  if (N < 2 || blocos < 2 || blocos % 2 !== 0 || T < blocos * 5) return vazio;
  // As somas por bloco e por variante: o Sharpe de qualquer união de blocos sai delas.
  const tam = Math.floor(T / blocos);
  const soma = Array.from({ length: blocos }, () => new Float64Array(N));
  const soma2 = Array.from({ length: blocos }, () => new Float64Array(N));
  for (let b = 0; b < blocos; b++) {
    const ini = b * tam;
    const fim = b === blocos - 1 ? T : ini + tam;
    for (let t = ini; t < fim; t++) {
      const linha = matriz[t];
      for (let j = 0; j < N; j++) {
        const x = linha[j];
        soma[b][j] += x;
        soma2[b][j] += x * x;
      }
    }
  }
  const contagem = Array.from({ length: blocos }, (_, b) => (b === blocos - 1 ? T - b * tam : tam));
  const sharpeDe = (bs: readonly number[], j: number): number => {
    let s = 0;
    let s2 = 0;
    let n = 0;
    for (const b of bs) {
      s += soma[b][j];
      s2 += soma2[b][j];
      n += contagem[b];
    }
    const m = s / n;
    const v = (s2 - n * m * m) / (n - 1);
    return v > 0 ? m / Math.sqrt(v) : 0;
  };
  const todas = combinacoes(blocos, blocos / 2);
  let abaixo = 0;
  let perdas = 0;
  const forasEscolhida: number[] = [];
  const dentrosEscolhida: number[] = [];
  for (const dentro of todas) {
    const marcado = new Set(dentro);
    const fora = Array.from({ length: blocos }, (_, b) => b).filter((b) => !marcado.has(b));
    let melhor = 0;
    let melhorSr = -Infinity;
    for (let j = 0; j < N; j++) {
      const sr = sharpeDe(dentro, j);
      if (sr > melhorSr) {
        melhorSr = sr;
        melhor = j;
      }
    }
    const srFora = Array.from({ length: N }, (_, j) => sharpeDe(fora, j));
    const alvo = srFora[melhor];
    // A posição relativa da escolhida fora, em (0, 1): empates contam meio.
    let menores = 0;
    let iguais = 0;
    for (let j = 0; j < N; j++) {
      if (srFora[j] < alvo) menores++;
      else if (srFora[j] === alvo && j !== melhor) iguais++;
    }
    const w = (menores + 0.5 * iguais + 1) / (N + 1);
    if (Math.log(w / (1 - w)) <= 0) abaixo++;
    if (alvo < 0) perdas++;
    forasEscolhida.push(alvo * Math.sqrt(DIAS_NO_ANO));
    dentrosEscolhida.push(melhorSr * Math.sqrt(DIAS_NO_ANO));
  }
  // A reta dos mínimos quadrados de fora contra dentro.
  const md = dentrosEscolhida.reduce((a, b) => a + b, 0) / dentrosEscolhida.length;
  const mf = forasEscolhida.reduce((a, b) => a + b, 0) / forasEscolhida.length;
  let sxy = 0;
  let sxx = 0;
  for (let k = 0; k < forasEscolhida.length; k++) {
    sxy += (dentrosEscolhida[k] - md) * (forasEscolhida[k] - mf);
    sxx += (dentrosEscolhida[k] - md) ** 2;
  }
  return {
    pbo: abaixo / todas.length,
    particoes: todas.length,
    sharpeForaDaEscolhida: quantil(forasEscolhida, 0.5),
    perdaFora: perdas / todas.length,
    inclinacao: sxx > 0 ? sxy / sxx : NaN,
  };
}

export interface ResultadoWalkForward {
  /** Os retornos colados, de cada período com a variante escolhida pelo passado. */
  r: number[];
  datas: number[];
  /** O começo (ms) de cada período e a variante (índice da coluna) escolhida para ele. */
  escolhas: { de: number; variante: number }[];
}

/**
 * O WALK-FORWARD: no começo de cada trimestre do calendário, a variante com o
 * melhor Sharpe nos `treinoDias` anteriores (ou em todo o passado, com `null`)
 * é a que opera o trimestre. Só começa quando há `minimoDias` de passado. É o
 * resultado de quem tivesse escolhido a regra em tempo real, trocando de
 * variante quando o passado mandasse — e a troca é suposta sem custo, o que
 * favorece o walk-forward: trocar de verdade fecha e abre posições.
 */
export function walkForward(
  matriz: readonly (readonly number[])[],
  datas: readonly number[],
  treinoDias: number | null,
  minimoDias = 180,
): ResultadoWalkForward {
  const T = matriz.length;
  const N = matriz[0]?.length ?? 0;
  const out: ResultadoWalkForward = { r: [], datas: [], escolhas: [] };
  if (N === 0 || T !== datas.length) return out;
  const trimestreDe = (t: number) => {
    const d = new Date(t - 1);
    return d.getUTCFullYear() * 4 + Math.floor(d.getUTCMonth() / 3);
  };
  let atual = -1;
  let trimestre = -1;
  for (let t = 0; t < T; t++) {
    const q = trimestreDe(datas[t]);
    if (q !== trimestre) {
      trimestre = q;
      if (t >= minimoDias) {
        const ini = treinoDias === null ? 0 : Math.max(0, t - treinoDias);
        let melhor = 0;
        let melhorSr = -Infinity;
        for (let j = 0; j < N; j++) {
          const col: number[] = [];
          for (let k = ini; k < t; k++) col.push(matriz[k][j]);
          const sr = sharpeDiario(col);
          if (sr > melhorSr) {
            melhorSr = sr;
            melhor = j;
          }
        }
        atual = melhor;
        out.escolhas.push({ de: datas[t] - DIA_MS, variante: melhor });
      }
    }
    if (atual >= 0) {
      out.r.push(matriz[t][atual]);
      out.datas.push(datas[t]);
    }
  }
  return out;
}

// ------------------------------------------------------------------ a carteira de livros

export interface ResultadoFundo {
  r: number[];
  datas: number[];
  /**
   * Cada rebalanceamento (todo dia 1º): os pesos que ele pediu a cada livro, na
   * ordem das séries, a fração do fundo que cada um tinha logo antes e a que
   * ficou depois — diferente da pedida quando a subconta que dava dinheiro não
   * tinha caixa livre para tudo (`caixaLivre`).
   */
  pesos: { t: number; pesos: number[]; antes: number[]; depois: number[] }[];
}

/**
 * A PARIDADE DE RISCO entre livros, como um fundo multiestratégia com uma
 * subconta por robô: todo dia 1º do mês o patrimônio é repartido pelo inverso
 * do desvio diário de cada livro nos `janelaDias` dias ANTERIORES — o livro
 * duas vezes mais agitado recebe metade do capital —, e entre um dia 1º e o
 * seguinte os pesos andam com o resultado de cada um. Com menos de
 * `minimoDias` de passado, partes iguais.
 *
 * O rebalanceamento é transferência entre subcontas da mesma corretora, que na
 * Binance é imediata e sem taxa — mas só do que está LIVRE: dinheiro que é
 * margem de posição aberta não sai da subconta sem fechar a posição. Com
 * `caixaLivre` (por livro e por dia, a fração do patrimônio dele fora das
 * posições na virada que abre o dia), a subconta que dá dinheiro dá no máximo
 * isso, e as que recebem dividem o que veio na proporção do que faltava a
 * cada uma; o resto do acerto fica para o dia 1º seguinte. Sem ele, a conta
 * supõe que todo o acerto cabe.
 *
 * `series` tem uma série de retornos diários por livro, todas alinhadas a
 * `datas`; `historico`, quando vem, é o passado de cada livro antes de
 * `datas[0]` (mesma ordem), usado só para os pesos.
 */
export function paridadeDeRisco(
  series: readonly (readonly number[])[],
  datas: readonly number[],
  janelaDias = 90,
  minimoDias = 20,
  historico?: readonly (readonly number[])[],
  caixaLivre?: readonly (readonly number[])[],
): ResultadoFundo {
  const L = series.length;
  const T = datas.length;
  const out: ResultadoFundo = { r: [], datas: [...datas], pesos: [] };
  if (L === 0 || series.some((s) => s.length !== T)) return out;
  const passado = (j: number, t: number): number[] => {
    const h = historico?.[j] ?? [];
    const todos = [...h, ...series[j].slice(0, t)];
    return todos.slice(Math.max(0, todos.length - janelaDias));
  };
  let valores = new Array<number>(L).fill(1 / L);
  let mes = -1;
  for (let t = 0; t < T; t++) {
    // O dia de r[t] começa em datas[t] − 1 dia: é no começo dele que se decide.
    const ini = new Date(datas[t] - DIA_MS);
    const m = ini.getUTCFullYear() * 12 + ini.getUTCMonth();
    if (m !== mes) {
      mes = m;
      const desvios = series.map((_, j) => {
        const p = passado(j, t);
        return p.length >= minimoDias ? momentos(p).desvio : NaN;
      });
      const brutos = desvios.every((d) => d > 0) ? desvios.map((d) => 1 / d) : new Array<number>(L).fill(1);
      const soma = brutos.reduce((a, b) => a + b, 0);
      const total = valores.reduce((a, b) => a + b, 0);
      const pesos = brutos.map((b) => b / soma);
      const antes = valores.map((v) => (total > 0 ? v / total : 0));
      if (!caixaLivre) valores = pesos.map((w) => w * total);
      else {
        // O que cada subconta quer dar (positivo) ou receber (negativo), e o que ela pode dar.
        const quer = valores.map((v, j) => v - pesos[j] * total);
        const pode = quer.map((q, j) => {
          const livre = caixaLivre[j]?.[t];
          return q > 0 ? Math.min(q, valores[j] * (Number.isFinite(livre) ? Math.min(1, Math.max(0, livre)) : 0)) : 0;
        });
        const veio = pode.reduce((a, b) => a + b, 0);
        const faltava = quer.reduce((a, q) => a + (q < 0 ? -q : 0), 0);
        valores = valores.map((v, j) => (quer[j] > 0 ? v - pode[j] : faltava > 0 ? v + (-quer[j] * veio) / faltava : v));
      }
      out.pesos.push({ t: datas[t] - DIA_MS, pesos, antes, depois: valores.map((v) => (total > 0 ? v / total : 0)) });
    }
    const total = valores.reduce((a, b) => a + b, 0);
    let novo = 0;
    for (let j = 0; j < L; j++) {
      valores[j] *= 1 + series[j][t];
      novo += valores[j];
    }
    out.r.push(total > 0 ? novo / total - 1 : 0);
  }
  return out;
}

/**
 * O TESTE DE VIDA REAL: o que a medição dá para janelas do mesmo tamanho que a
 * idade do ao vivo. Todos os retornos de `dias` dias da curva medida (um
 * ponto por dia) e os percentis 10, 50 e 90 — oito em cada dez janelas
 * terminaram entre o primeiro e o último. Com menos de 30 janelas, nulo.
 */
export function faixaDeRetornos(curva: readonly PontoCurva[], dias: number): { p10: number; p50: number; p90: number; janelas: number } | null {
  if (!(dias >= 1) || curva.length <= dias) return null;
  const rs: number[] = [];
  for (let k = dias; k < curva.length; k++) {
    const a = curva[k - dias].patrimonio;
    const b = curva[k].patrimonio;
    if (a > 0 && b > 0) rs.push(b / a - 1);
  }
  if (rs.length < 30) return null;
  rs.sort((x, y) => x - y);
  const q = (p: number) => rs[Math.min(rs.length - 1, Math.floor(p * (rs.length - 1)))];
  return { p10: q(0.1), p50: q(0.5), p90: q(0.9), janelas: rs.length };
}

/** O patrimônio de uma curva na virada `t`: o último ponto até ela, com no máximo 3 h de atraso (como em `retornosDiarios`). */
function valorNaVirada(curva: readonly PontoCurva[], t: number): number | null {
  let lo = 0;
  let hi = curva.length - 1;
  if (hi < 0 || curva[0].t > t) return null;
  while (lo < hi) {
    const meio = (lo + hi + 1) >> 1;
    if (curva[meio].t <= t) lo = meio;
    else hi = meio - 1;
  }
  const p = curva[lo];
  return t - p.t <= 3 * 3_600_000 && p.patrimonio > 0 ? p.patrimonio : null;
}

export interface FundoAoVivo {
  /** A primeira virada de dia em que todos os livros tinham marcação: o começo do fundo. */
  comecouEm: number;
  patrimonio: number;
  /** Um ponto por virada válida, e o de agora. */
  curva: PontoCurva[];
  /** A fração do fundo em cada livro AGORA (os pesos andam com o resultado entre um dia 1º e o outro). */
  pesos: number[];
  /** Os pesos do último rebalanceamento. */
  pesosDoMes: number[];
}

/**
 * O FUNDO AO VIVO, com as curvas dos robôs ao vivo e a mesma regra da medição
 * (`paridadeDeRisco`): começa na primeira virada de dia em que todos os livros
 * têm marcação, com `capital` repartido pelo inverso do desvio de 90 dias, e
 * refaz a repartição na primeira virada válida de cada mês.
 *
 * O desvio de 90 dias de um robô de dois dias seria ruído; por isso entram
 * antes os retornos MEDIDOS de cada livro (`historico`), o mesmo motor nas
 * mesmas moedas, e os do ao vivo vão tomando o lugar deles. É conta de cotas,
 * não de retornos: virada sem marcação de algum livro fica de fora, e a
 * seguinte lê o patrimônio de cada um onde ele estiver, sem inventar o dia.
 */
export function fundoAoVivo(
  componentes: readonly { curva: readonly PontoCurva[]; patrimonioAgora: number; agora: number; historico: readonly number[] }[],
  capital: number,
  janelaDias = 90,
  minimoDias = 20,
): FundoAoVivo | null {
  if (componentes.length === 0 || componentes.some((c) => c.curva.length === 0)) return null;
  const inicio = Math.ceil(Math.max(...componentes.map((c) => c.curva[0].t)) / DIA_MS) * DIA_MS;
  const fim = Math.min(...componentes.map((c) => c.agora));
  const vivos = componentes.map((c) => retornosDiarios(c.curva));
  const pesosEm = (t: number): number[] => {
    const desvios = componentes.map((c, j) => {
      const aoVivo = vivos[j].r.filter((_, k) => vivos[j].datas[k] <= t);
      const todos = [...c.historico, ...aoVivo];
      const janela = todos.slice(Math.max(0, todos.length - janelaDias));
      return janela.length >= minimoDias ? momentos(janela).desvio : NaN;
    });
    const brutos = desvios.every((d) => d > 0) ? desvios.map((d) => 1 / d) : desvios.map(() => 1);
    const soma = brutos.reduce((a, b) => a + b, 0);
    return brutos.map((b) => b / soma);
  };
  let cotas: number[] | null = null;
  let pesosDoMes: number[] = [];
  let mes = -1;
  let comecouEm = NaN;
  const curva: PontoCurva[] = [];
  for (let t = inicio; t <= fim; t += DIA_MS) {
    const valores = componentes.map((c) => valorNaVirada(c.curva, t));
    if (valores.some((v) => v === null)) continue;
    const vs = valores as number[];
    const d = new Date(t);
    const m = d.getUTCFullYear() * 12 + d.getUTCMonth();
    const total: number = cotas ? cotas.reduce((a, q, j) => a + q * vs[j], 0) : capital;
    if (cotas === null || m !== mes) {
      mes = m;
      pesosDoMes = pesosEm(t);
      cotas = pesosDoMes.map((w, j) => (w * total) / vs[j]);
      if (curva.length === 0) comecouEm = t;
    }
    curva.push({ t, patrimonio: total });
  }
  if (cotas === null) return null;
  const q = cotas;
  const agoras = componentes.map((c) => c.patrimonioAgora);
  const patrimonio = q.reduce((a, x, j) => a + x * agoras[j], 0);
  if (fim > curva[curva.length - 1].t) curva.push({ t: fim, patrimonio });
  return {
    comecouEm,
    patrimonio,
    curva,
    pesos: q.map((x, j) => (patrimonio > 0 ? (x * agoras[j]) / patrimonio : NaN)),
    pesosDoMes,
  };
}

// ------------------------------------------------------------------ o arquivo

/** O intervalo de 95% do bootstrap: percentil 2,5, mediana e 97,5. */
export type Intervalo = [number, number, number];

/** A ficha de um robô, do fundo ou do BTC na janela inteira da medição. */
export interface FichaMedida {
  id: string;
  ficha: Ficha;
  /** Sharpe ANUAL, CAGR e queda máxima no bootstrap estacionário, e em que fração das amostras o Sharpe deu ≤ 0. */
  intervalo?: { amostras: number; blocoMedio: number; sharpe: Intervalo; cagr: Intervalo; queda: Intervalo; sharpeNegativo: number };
  /** A probabilidade de o Sharpe verdadeiro ser positivo (`sharpeProbabilistico`). */
  probabilistico?: number;
  /** Dias de ao vivo com estes momentos para afirmar Sharpe > 0, e > 1 ao ano, com 95% (`trilhaMinima`). */
  trilhaMinimaDias?: number;
  trilhaMinimaDiasSharpe1?: number;
  meses: { mes: string; retorno: number }[];
  /** Os trades encerrados: quantos, a fração no positivo, o ganho e a perda médios sobre o NOCIONAL, o fator de lucro, a duração e o giro. */
  trades?: {
    n: number;
    positivos: number;
    ganhoMedio: number;
    perdaMedia: number;
    fatorDeLucro: number;
    duracaoMediaDias: number;
    /** Nocional negociado (entrada e saída) por ano ÷ patrimônio médio. */
    giroAnual: number;
  };
}

/** Os testes de sobreajuste de um livro sobre a grade de variações dele. */
export interface ValidacaoLivro {
  id: string;
  /** Do que a grade é feita, em uma frase. */
  grade: string;
  variantes: number;
  /** O Sharpe ANUAL de cada variação, do menor ao maior. */
  sharpes: number[];
  sharpePublicada: number;
  /** A posição da publicada na grade por Sharpe: 1 é a melhor. */
  posicaoDaPublicada: number;
  /** O desvio ANUAL dos Sharpes da grade e o do Sharpe nulo em tantos dias: a régua usa o maior. */
  desvioDosSharpes: { grade: number; nulo: number };
  deflacionado: { tentativas: number; regua: number; dsr: number }[];
  pbo: ResultadoPBO;
  walkForward: {
    /** Dias de treino; nulo é o passado inteiro. */
    treinoDias: number | null;
    de: number;
    retorno: number;
    sharpe: number;
    /** A publicada e a variação do meio da grade, nos mesmos dias. */
    retornoPublicada: number;
    sharpePublicada: number;
    retornoMediana: number;
    /** Em quantos trimestres a escolha mudou, e quantos trimestres. */
    trocas: number;
    trimestres: number;
  }[];
}

/** Quanto dinheiro o livro aguenta: o mesmo livro com mais capital e o impacto de mercado dentro. */
export interface CapacidadeMedida {
  id: string;
  /** O Y da lei da raiz quadrada. */
  y: number;
  linhas: {
    capital: number;
    retorno: number;
    sharpe: number;
    quedaMaxima: number;
    /** Mediana da primeira parcela de cada entrada ÷ o volume diário médio de 7 dias da moeda. */
    participacao: number;
    /** O impacto médio por lado que a régua cobrou, em fração do nocional. */
    impacto: number;
    recusadas: number;
  }[];
}

/** A carteira dos livros (`paridadeDeRisco`), medida nas mesmas janelas dos robôs. */
export interface FundoMedido {
  componentes: string[];
  janelaDias: number;
  /** Inteira, dentro e fora, na ordem das linhas dos robôs; a queda é a da curva DIÁRIA. */
  linhas: { janela: string; retorno: number; quedaMaxima: number; sharpe: number }[];
  /** Cada janela sem as 5 melhores moedas de cada livro. */
  semAs5: number[];
  pesos: { t: number; pesos: number[] }[];
  curva: PontoCurva[];
  /** Os rebalanceamentos, e em quantos a subconta que dava dinheiro não tinha caixa livre para isso. */
  transferencias: { rebalanceamentos: number; semCaixa: number; maiorFracaoDoCaixa: number };
  /** Os livros com o tamanho multiplicado: a resposta a "e na mesma queda do Momento?". */
  alavancado: { fator: number; linhas: { janela: string; retorno: number; quedaMaxima: number; sharpe: number }[]; recusadas: number }[];
  /**
   * O FUNDO EM TEMPO REAL: cada livro com a variação que o walk-forward de 365
   * dias escolheria a cada trimestre (`walkForward`), e o fundo deles, desde o
   * primeiro trimestre com passado; ao lado, o publicado nos mesmos dias. É o
   * número de quem não sabia em 2024 quais regras seriam as melhores.
   */
  tempoReal?: { de: number; linhas: { id: string; retorno: number; quedaMaxima: number; sharpe: number }[] };
}

export interface MedicaoQuant {
  /** As tentativas da pesquisa, contadas por baixo: é o N do Sharpe deflacionado "da pesquisa". */
  tentativasDaPesquisa: number;
  fichas: FichaMedida[];
  correlacoes: { ids: string[]; matriz: number[][] };
  validacao: ValidacaoLivro[];
  capacidade: CapacidadeMedida[];
  fundo?: FundoMedido;
  /** Os dias de maior queda do BTC na janela e o que cada série fez neles. */
  estresse: { dia: number; retornos: Record<string, number> }[];
}
