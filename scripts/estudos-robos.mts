/**
 * TRÊS PERGUNTAS que a medição dos robôs ainda não respondia, rodadas com o
 * MESMO motor e a mesma matriz de `npm run medir-robos` (que importa isto e
 * passa a simulação pronta):
 *
 *   npm run medir-robos -- --estudos
 *
 * 1. A CONTA CONJUNTA. Momento e Fluxo andam por caminhos diferentes
 *    (correlação diária de 0,16), e cada um mora numa conta de US$ 1.000.
 *    Dividir UMA conta entre os dois melhora o risco, ou só dilui o Momento?
 *
 * 2. A PERNA VENDIDA DO MOMENTO. O controle do Fluxo mediu a vendida do
 *    Momento com hedge de ETH em +8% fora e −10% sem as 5 melhores. Ela soma
 *    ao livro, ou só soma queda? E a perna do Fluxo no lugar dela?
 *
 * 3. O WALK-FORWARD. As peças do Momento (janela, pirâmide, saída por posto,
 *    alvo de volatilidade) foram escolhidas em 07 e 08/10 olhando as colunas
 *    "dentro" E "fora" da mesma janela, depois de dezenas de variantes. Com
 *    isso o "fora" deixou de ser fora. Aqui, a cada trimestre, escolhe-se a
 *    variante de melhor Sharpe SÓ com o que veio antes, e mede-se o trimestre
 *    seguinte. Se a regra publicada for a que o passado escolheria, ótimo; se
 *    não for, o número publicado tem futuro dentro.
 *
 * Tudo aqui é medido em PONTOS DIÁRIOS (o patrimônio na virada de cada dia
 * UTC), inclusive o Momento sozinho, para as linhas se compararem: a queda
 * máxima diária é um pouco menor que a de hora em hora que `medir-robos`
 * imprime.
 */

import { CAPITAL_ROBO, DIA, ROBOS, type EstadoRobo, type EstudosRobos, type LinhaMedida, type Perna, type Robo } from "../lib/robos";

export interface Bancada {
  simular: (robo: Robo, de: number, ate: number, excluir?: Set<string>) => EstadoRobo;
  porMoeda: (e: EstadoRobo) => Map<string, number>;
  INICIO: number;
  CORTE: number;
  FIM: number;
}

const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;

/** O patrimônio na virada de cada dia de `de` a `ate`: o último ponto da curva até ali. */
function diario(e: EstadoRobo, de: number, ate: number): number[] {
  const out: number[] = [CAPITAL_ROBO];
  let k = 0;
  let ultimo = CAPITAL_ROBO;
  for (let t = de + DIA; t <= ate; t += DIA) {
    while (k < e.curva.length && e.curva[k].t <= t) ultimo = e.curva[k++].patrimonio;
    out.push(ultimo);
  }
  return out;
}

function retornos(v: readonly number[]): number[] {
  const r: number[] = [];
  for (let k = 1; k < v.length; k++) r.push(v[k - 1] > 0 ? v[k] / v[k - 1] - 1 : 0);
  return r;
}

function sharpe(r: readonly number[]): number {
  if (r.length < 2) return 0;
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  const dp = Math.sqrt(r.reduce((a, b) => a + (b - m) ** 2, 0) / (r.length - 1));
  return dp > 0 ? (m / dp) * Math.sqrt(365) : 0;
}

function queda(v: readonly number[]): number {
  let pico = v[0];
  let pior = 0;
  for (const x of v) {
    pico = Math.max(pico, x);
    pior = Math.min(pior, x / pico - 1);
  }
  return pior;
}

function resumo(v: readonly number[]): string {
  return `${pct(v[v.length - 1] / v[0] - 1).padStart(9)} (queda ${pct(queda(v)).padStart(6)}, Sharpe ${sharpe(retornos(v)).toFixed(2)})`;
}

/**
 * Duas contas numa só, com `w` do patrimônio na primeira. O rebalanceamento é
 * na virada de cada mês — mudar o tamanho de uma conta que dimensiona tudo em
 * fração do próprio patrimônio é o mesmo que mexer no caixa dela, e a
 * diferença é o nocional mínimo, que nesta escala não morde. `mensal` falso:
 * as duas contas seguem separadas desde o começo, sem tocar.
 */
function juntar(a: readonly number[], b: readonly number[], w: number, de: number, mensal: boolean): number[] {
  const out: number[] = [];
  let ha = (w * CAPITAL_ROBO) / a[0];
  let hb = ((1 - w) * CAPITAL_ROBO) / b[0];
  for (let k = 0; k < a.length; k++) {
    const v = ha * a[k] + hb * b[k];
    out.push(v);
    if (mensal && new Date(de + k * DIA).getUTCDate() === 1 && k > 0) {
      ha = (w * v) / a[k];
      hb = ((1 - w) * v) / b[k];
    }
  }
  return out;
}

export function estudos(b: Bancada): EstudosRobos {
  const { simular, porMoeda, INICIO, CORTE, FIM } = b;
  const janelas: [string, number, number][] = [
    ["inteira", INICIO, FIM],
    ["dentro", INICIO, CORTE],
    ["fora", CORTE, FIM],
  ];
  const momento = ROBOS.find((r) => r.id === "momento")!;
  const fluxo = ROBOS.find((r) => r.id === "fluxo")!;
  const top5 = (e: EstadoRobo) => new Set([...porMoeda(e).entries()].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([s]) => s));

  /** As três janelas e as três "sem as 5 melhores" de um robô, em pontos diários. */
  function curvas(robo: Robo): { com: number[][]; sem: number[][]; top: Set<string> } {
    const com = janelas.map(([, de, ate]) => simular(robo, de, ate));
    const top = top5(com[0]);
    const sem = janelas.map(([, de, ate]) => diario(simular(robo, de, ate, top), de, ate));
    return { com: com.map((e, k) => diario(e, janelas[k][1], janelas[k][2])), sem, top };
  }
  const linha = (nome: string, com: number[][], sem: number[][]) =>
    console.log(
      `${nome.padEnd(28)} ` +
        janelas.map(([j], k) => `${j} ${resumo(com[k])}`).join(" · ") +
        ` · sem as 5: ` +
        janelas.map(([j], k) => `${j} ${pct(sem[k][sem[k].length - 1] / CAPITAL_ROBO - 1)}`).join(" · "),
    );

  // ---------------------------------------------------------------- 1. a conta conjunta
  console.log("\n== 1. A CONTA CONJUNTA: Momento e Fluxo dividindo uma conta (pontos diários)");
  const m = curvas(momento);
  const f = curvas(fluxo);
  const ra = retornos(m.com[0]);
  const rb = retornos(f.com[0]);
  const ma = ra.reduce((x, y) => x + y, 0) / ra.length;
  const mb = rb.reduce((x, y) => x + y, 0) / rb.length;
  let cov = 0, va = 0, vb = 0;
  for (let k = 0; k < ra.length; k++) {
    cov += (ra[k] - ma) * (rb[k] - mb);
    va += (ra[k] - ma) ** 2;
    vb += (rb[k] - mb) ** 2;
  }
  const correlacao = cov / Math.sqrt(va * vb);
  console.log(`correlação diária ${correlacao.toFixed(2)} · Momento sem as 5: ${[...m.top].join(", ")} · Fluxo sem as 5: ${[...f.top].join(", ")}`);
  const conjunta = {
    com: janelas.map((_, k) => juntar(m.com[k], f.com[k], 0.5, janelas[k][1], true)),
    sem: janelas.map((_, k) => juntar(m.sem[k], f.sem[k], 0.5, janelas[k][1], true)),
  };
  for (const [nome, w, mensal] of [
    ["só Momento", 1, false],
    ["70/30, mensal", 0.7, true],
    ["50/50, mensal", 0.5, true],
    ["50/50, sem rebalancear", 0.5, false],
    ["30/70, mensal", 0.3, true],
    ["só Fluxo", 0, false],
  ] as const) {
    linha(
      nome,
      janelas.map((_, k) => juntar(m.com[k], f.com[k], w, janelas[k][1], mensal)),
      janelas.map((_, k) => juntar(m.sem[k], f.sem[k], w, janelas[k][1], mensal)),
    );
  }

  // ---------------------------------------------------------------- 2. a perna vendida do Momento
  console.log("\n== 2. A PERNA VENDIDA DO MOMENTO (o mesmo tamanho e o mesmo alvo de volatilidade)");
  const [compra, vendaMomento] = momento.regras.pernas;
  const vendaFluxo = fluxo.regras.pernas[0];
  const comPernas = (id: string, pernas: Perna[]): Robo => ({ ...momento, id, regras: { ...momento.regras, pernas } });
  // O lucro de cada lado do publicado, por janela: a vendida paga a conta dela?
  for (const [j, de, ate] of janelas) {
    const e = simular(momento, de, ate);
    const lado = (l: string) => e.fechadas.filter((t) => t.lado === l).reduce((a, t) => a + t.resultado, 0);
    const n = (l: string) => e.fechadas.filter((t) => t.lado === l).length;
    console.log(`publicado, ${j.padEnd(7)}: comprada US$ ${lado("long").toFixed(0)} em ${n("long")} · vendida US$ ${lado("short").toFixed(0)} em ${n("short")} (só as fechadas)`);
  }
  for (const [nome, robo] of [
    ["publicado (compra + venda)", momento],
    ["só a compra", comPernas("so-compra", [compra])],
    ["compra + a venda do Fluxo", comPernas("compra-fluxo", [compra, vendaFluxo])],
    ["compra + as duas vendas", comPernas("compra-duas", [compra, vendaMomento, vendaFluxo])],
  ] as const) {
    const c = robo === momento ? m : curvas(robo);
    linha(nome, c.com, c.sem);
  }

  // ---------------------------------------------------------------- 3. o walk-forward
  console.log("\n== 3. O WALK-FORWARD do Momento: a cada trimestre, a variante de melhor Sharpe até ali");
  const alvo = momento.regras.alvoVolatilidade;
  const variantes: { nome: string; robo: Robo; publicado: boolean }[] = [];
  for (const janela of [20, 30, 45, 60])
    for (const pir of [false, true])
      for (const posto of [false, true])
        for (const comAlvo of [false, true]) {
          const perna: Perna = { ...compra, janelaDias: janela };
          if (!pir) delete perna.piramide;
          if (posto) perna.saidaPosto = 10;
          else delete perna.saidaPosto;
          const nome = `${janela}d${pir ? " pir" : ""}${posto ? " posto" : ""}${comAlvo ? " alvo" : ""}`;
          const regras = { ...momento.regras, pernas: [perna, vendaMomento] };
          if (!comAlvo) delete regras.alvoVolatilidade;
          else regras.alvoVolatilidade = alvo;
          variantes.push({ nome, robo: { ...momento, id: nome, regras }, publicado: janela === 45 && pir && posto && comAlvo });
        }
  const dias = Math.floor((FIM - INICIO) / DIA);
  const rets = variantes.map((v) => retornos(diario(simular(v.robo, INICIO, FIM), INICIO, INICIO + dias * DIA)));
  const publicado = variantes.findIndex((v) => v.publicado);

  // O dentro e o fora de cada variante, da MESMA rodada contínua: se a ordem
  // de dentro previsse a de fora, escolher pelo passado bastaria.
  const kCorte = Math.round((CORTE - INICIO) / DIA);
  const sd = rets.map((r) => sharpe(r.slice(0, kCorte)));
  const sf = rets.map((r) => sharpe(r.slice(kCorte)));
  const posto = (xs: number[]) => {
    const ord = xs.map((x, i) => [x, i] as const).sort((a, b) => a[0] - b[0]);
    const p = new Array<number>(xs.length);
    ord.forEach(([, i], k) => (p[i] = k));
    return p;
  };
  const pd = posto(sd), pf = posto(sf);
  const n = variantes.length;
  const md = (n - 1) / 2;
  let num = 0, den1 = 0, den2 = 0;
  for (let i = 0; i < n; i++) {
    num += (pd[i] - md) * (pf[i] - md);
    den1 += (pd[i] - md) ** 2;
    den2 += (pf[i] - md) ** 2;
  }
  console.log(`${n} variantes (janela 20/30/45/60 × pirâmide × saída por posto × alvo de volatilidade), todas com a vendida de 14 dias`);
  const correlacaoPostos = num / Math.sqrt(den1 * den2);
  console.log(`correlação de postos entre o Sharpe dentro e o Sharpe fora: ${correlacaoPostos.toFixed(2)}`);
  const melhorDentro = sd.indexOf(Math.max(...sd));
  console.log(
    `a melhor de dentro (${variantes[melhorDentro].nome}, Sharpe ${sd[melhorDentro].toFixed(2)}) fica em ${n - pf[melhorDentro]}º de ${n} fora (Sharpe ${sf[melhorDentro].toFixed(2)}); ` +
      `o publicado é ${n - pd[publicado]}º dentro e ${n - pf[publicado]}º fora (Sharpe ${sd[publicado].toFixed(2)} e ${sf[publicado].toFixed(2)})`,
  );
  console.log("as 6 melhores de fora: " + [...sf.keys()].sort((a, b) => sf[b] - sf[a]).slice(0, 6).map((i) => `${variantes[i].nome} ${sf[i].toFixed(2)}`).join(" · "));

  // A cadeia: trimestre a trimestre, a escolhida pelo passado (janela que
  // cresce desde o começo, no mínimo seis meses).
  const inicioQ: number[] = [];
  for (let d = new Date(Date.UTC(2024, 6, 1)); d.getTime() < FIM - 30 * DIA; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 3, 1))) inicioQ.push(d.getTime());
  const cadeia: number[] = [];
  const doPublicado: number[] = [];
  const daMediana: number[] = [];
  const escolhas: string[] = [];
  for (let q = 0; q < inicioQ.length; q++) {
    const k0 = Math.round((inicioQ[q] - INICIO) / DIA);
    const k1 = q + 1 < inicioQ.length ? Math.round((inicioQ[q + 1] - INICIO) / DIA) : dias;
    const passado = rets.map((r) => sharpe(r.slice(0, k0)));
    const i = passado.indexOf(Math.max(...passado));
    const d = new Date(inicioQ[q]);
    escolhas.push(`${d.getUTCFullYear()}T${Math.floor(d.getUTCMonth() / 3) + 1} ${variantes[i].nome}`);
    for (let k = k0; k < k1; k++) {
      cadeia.push(rets[i][k]);
      doPublicado.push(rets[publicado][k]);
      const dia = rets.map((r) => r[k]).sort((a, b) => a - b);
      daMediana.push(dia[Math.floor(dia.length / 2)]);
    }
  }
  console.log("escolhidas: " + escolhas.join(" · "));
  const acum = (r: number[]) => {
    const v = [CAPITAL_ROBO];
    for (const x of r) v.push(v[v.length - 1] * (1 + x));
    return v;
  };
  const kFora = Math.round((CORTE - inicioQ[0]) / DIA);
  for (const [nome, r] of [
    ["walk-forward", cadeia],
    ["publicado", doPublicado],
    ["a mediana das variantes, dia a dia", daMediana],
  ] as const) {
    console.log(`${nome.padEnd(36)} de 07/2024: ${resumo(acum(r))} · fora (07/2025 em diante): ${resumo(acum(r.slice(kFora)))}`);
  }

  const medida = (r: number[]) => {
    const v = acum(r.slice(kFora));
    return { retorno: v[v.length - 1] / CAPITAL_ROBO - 1, sharpe: sharpe(r.slice(kFora)) };
  };
  const linhas: LinhaMedida[] = janelas.map(([j, de, ate], k) => ({
    janela: j,
    de,
    ate,
    retorno: conjunta.com[k][conjunta.com[k].length - 1] / CAPITAL_ROBO - 1,
    quedaMaxima: queda(conjunta.com[k]),
    sharpe: sharpe(retornos(conjunta.com[k])),
    trades: 0,
  }));
  return {
    conjunta: {
      ids: [momento.id, fluxo.id],
      peso: 0.5,
      correlacao,
      linhas,
      semAs5: conjunta.sem.map((v) => v[v.length - 1] / CAPITAL_ROBO - 1),
      curva: conjunta.com[0].map((p, k) => ({ t: INICIO + k * DIA, patrimonio: Math.round(p * 100) / 100 })),
    },
    walkForward: {
      variantes: variantes.length,
      correlacaoPostos,
      foraDe: CORTE,
      escolhido: medida(cadeia),
      publicado: medida(doPublicado),
      mediana: medida(daMediana),
      escolhas,
    },
  };
}
