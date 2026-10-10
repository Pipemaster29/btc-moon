/**
 * Os casos-limite da estatística de mesa (`lib/quant.ts`), sem tocar em rede.
 *
 * Cada função aqui decide uma frase da tela — "o Sharpe sobrevive às ~300
 * tentativas", "escolher pelo passado ajuda", "o fundo reparte assim" —, e a
 * frase só vale se a conta bate com o valor conhecido. Os valores de referência
 * são os das tabelas da normal e os das fórmulas fechadas dos artigos; os casos
 * de sorteio usam semente, para a régua não mudar de uma rodada para outra.
 *
 * Sai com código diferente de zero quando qualquer caso falha.
 *
 * Rode com: npm run testar-quant
 */
import {
  DIA_MS,
  ESTATISTICAS_DA_FICHA,
  bootstrapEstacionario,
  correlacao,
  fichaDe,
  fundoAoVivo,
  momentos,
  normalAcumulada,
  normalInversa,
  paridadeDeRisco,
  pboCSCV,
  porMes,
  quantil,
  retornosDiarios,
  sharpeDeflacionado,
  sharpeDiario,
  sharpeMaximoEsperado,
  sharpeProbabilistico,
  sorteador,
  trilhaMinima,
  varianciaDoSharpeNulo,
  walkForward,
} from "../lib/quant";

let falhas = 0;
function confere(nome: string, ok: boolean, obtido: string): void {
  if (!ok) falhas++;
  console.log(`  ${nome.padEnd(66)} ${obtido.padEnd(28)} ${ok ? "ok" : "← FALHOU"}`);
}
const perto = (a: number, b: number, tol = 1e-6) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const T0 = Date.parse("2025-01-01T00:00:00Z");

/** Normais com semente (Box-Muller sobre o `sorteador`). */
function normais(n: number, semente: number, media = 0, desvio = 1): number[] {
  const u = sorteador(semente);
  const out: number[] = [];
  while (out.length < n) {
    const a = Math.max(1e-12, u());
    const b = u();
    const r = Math.sqrt(-2 * Math.log(a));
    out.push(media + desvio * r * Math.cos(2 * Math.PI * b));
    if (out.length < n) out.push(media + desvio * r * Math.sin(2 * Math.PI * b));
  }
  return out;
}
const diasDe = (n: number) => Array.from({ length: n }, (_, k) => T0 + (k + 1) * DIA_MS);

console.log("\na normal");
confere("Φ(0) = 0,5", perto(normalAcumulada(0), 0.5, 1e-9), normalAcumulada(0).toFixed(9));
confere("Φ(1,96) = 0,9750021", perto(normalAcumulada(1.96), 0.9750021, 1e-6), normalAcumulada(1.96).toFixed(7));
confere("Φ(−3) = 0,0013499 (a cauda, onde o teste lê)", perto(normalAcumulada(-3), 0.0013499, 1e-4), normalAcumulada(-3).toExponential(4));
confere("Φ(4) = 0,99996833", perto(normalAcumulada(4), 0.99996833, 1e-7), normalAcumulada(4).toFixed(8));
confere("Φ(−8) = 6,221e−16 (o ramo da fração contínua)", Math.abs(normalAcumulada(-8) / 6.220960574e-16 - 1) < 1e-6, normalAcumulada(-8).toExponential(4));
confere("Φ⁻¹(0,975) = 1,959964", perto(normalInversa(0.975), 1.959964, 1e-6), normalInversa(0.975).toFixed(6));
confere("Φ⁻¹(0,0001) = −3,719016", perto(normalInversa(1e-4), -3.719016, 1e-6), normalInversa(1e-4).toFixed(6));
{
  let pior = 0;
  for (const p of [1e-6, 0.001, 0.02, 0.3, 0.5, 0.77, 0.98, 0.999999]) pior = Math.max(pior, Math.abs(normalAcumulada(normalInversa(p)) - p) / p);
  confere("Φ(Φ⁻¹(p)) = p em toda a reta", pior < 1e-6, `erro relativo ${pior.toExponential(1)}`);
}

console.log("\na curva e os momentos");
{
  const m = momentos([1, 2, 3, 4, 5]);
  confere("média 3, desvio amostral √2,5, assimetria 0", perto(m.media, 3) && perto(m.desvio, Math.sqrt(2.5)) && perto(m.assimetria, 0), `${m.desvio.toFixed(4)}`);
  confere("curtose populacional de 1..5 = 1,7", perto(m.curtose, 1.7), m.curtose.toFixed(4));
  const H = 3_600_000;
  // Uma curva horária com um buraco: da 1 h do dia 3 ao fim dele não houve retrato.
  const curva: { t: number; patrimonio: number }[] = [];
  for (let h = 0; h <= 24 * 5; h++) {
    if (h > 48 && h < 72) continue;
    curva.push({ t: T0 + h * H + 60_000, patrimonio: 1000 + h });
  }
  const { datas, r } = retornosDiarios(curva);
  // Viradas válidas: 1, 2, 4 e 5 (a 3 não tem ponto nas 3 h anteriores) — o
  // retorno do dia 2 e o do dia 5; o 3 e o 4 tocam na virada sem ponto.
  confere("dia sem retrato fica de fora, não vira retorno zero", r.length === 2 && datas[0] === T0 + 2 * DIA_MS, `${r.length} retornos`);
  confere("o ponto da virada é o último até ela", perto(r[0], (1000 + 47) / (1000 + 23) - 1), r[0].toFixed(5));
  const meses = porMes([0.1, 0.1, -0.5], [Date.parse("2025-01-31T00:00:00Z"), Date.parse("2025-02-01T00:00:00Z"), Date.parse("2025-02-02T00:00:00Z")]);
  confere("o dia que fecha à meia-noite do 1º é do mês anterior", meses.length === 2 && meses[0].mes === "2025-01" && perto(meses[0].retorno, 0.21), meses.map((x) => `${x.mes} ${x.retorno.toFixed(2)}`).join(" "));
}

console.log("\na ficha");
{
  const r = [0.1, -0.2, 0.05, 0.3];
  const f = fichaDe(r, diasDe(4));
  confere("retorno composto 1,1 × 0,8 × 1,05 × 1,3 − 1", perto(f.retorno, 1.1 * 0.8 * 1.05 * 1.3 - 1), f.retorno.toFixed(4));
  confere("queda máxima −20% e dois dias debaixo do pico", perto(f.quedaMaxima, -0.2) && f.maiorTempoSubmerso === 2, `${f.quedaMaxima} · ${f.maiorTempoSubmerso} d`);
  confere("CAGR = (1 + retorno)^(365/4) − 1", perto(f.cagr, (1 + f.retorno) ** (365 / 4) - 1, 1e-9), f.cagr.toExponential(3));
  confere("pior e melhor dia", f.piorDia === -0.2 && f.melhorDia === 0.3, `${f.piorDia} · ${f.melhorDia}`);
  const ref = normais(400, 7, 0, 0.02);
  const dobro = ref.map((x) => 2 * x);
  const g = fichaDe(dobro, diasDe(400), ref);
  confere("série = 2 × referência: beta 2, correlação 1, alfa 0", perto(g.beta ?? NaN, 2) && perto(g.correlacao ?? NaN, 1) && Math.abs(g.alfaAnual ?? NaN) < 1e-12, `beta ${g.beta?.toFixed(4)}`);
  const h = fichaDe(normais(5000, 11, 0.001, 0.02), diasDe(5000));
  confere("normal: VaR 95% ≈ 1,645 σ − μ, CVaR ≈ 2,063 σ − μ", Math.abs(h.var95 - (1.645 * 0.02 - 0.001)) < 0.0015 && Math.abs(h.cvar95 - (2.063 * 0.02 - 0.001)) < 0.0015, `${h.var95.toFixed(4)} · ${h.cvar95.toFixed(4)}`);
  confere("normal: Sortino ≈ √2 × Sharpe", Math.abs(h.sortino / h.sharpe - Math.SQRT2) < 0.06, (h.sortino / h.sharpe).toFixed(3));
  confere("correlação de uma série com ela mesma é 1", perto(correlacao(ref, ref), 1), correlacao(ref, ref).toFixed(6));
}

console.log("\no Sharpe é sorte?");
{
  const simetrica = Array.from({ length: 500 }, (_, k) => (k % 2 === 0 ? 0.01 : -0.01));
  confere("média zero: PSR(0) = 0,5", perto(sharpeProbabilistico(simetrica, 0), 0.5, 1e-9), sharpeProbabilistico(simetrica, 0).toFixed(6));
  const r = normais(1000, 3, 0.002, 0.02);
  const m = momentos(r);
  const sr = m.media / m.desvio;
  const v = 1 - m.assimetria * sr + ((m.curtose - 1) / 4) * sr * sr;
  const esperado = normalAcumulada((sr * Math.sqrt(999)) / Math.sqrt(v));
  confere("PSR = Φ(SR √(n−1) / √(1 − γ₃SR + (γ₄−1)/4 SR²))", perto(sharpeProbabilistico(r), esperado, 1e-12), esperado.toFixed(6));
  confere("PSR cai quando a régua sobe", sharpeProbabilistico(r, sr / 2) < sharpeProbabilistico(r, 0) && sharpeProbabilistico(r, sr) < 0.51, sharpeProbabilistico(r, sr).toFixed(3));
  confere("uma tentativa só: a régua é zero", sharpeMaximoEsperado(1, 0.01) === 0, "0");
  // A aproximação de Bailey e López de Prado para o máximo de N normais padrão.
  const e100 = sharpeMaximoEsperado(100, 1);
  const e1000 = sharpeMaximoEsperado(1000, 1);
  confere("máximo esperado de 100 normais ≈ 2,53 (o exato é 2,51)", Math.abs(e100 - 2.53) < 0.01, e100.toFixed(4));
  confere("máximo esperado de 1000 normais ≈ 3,26 (o exato é 3,24)", Math.abs(e1000 - 3.26) < 0.01, e1000.toFixed(4));
  {
    // Conferido por sorteio: o maior Sharpe de 300 séries SEM vantagem, em 997 dias.
    let soma = 0;
    const rodadas = 40;
    for (let k = 0; k < rodadas; k++) {
      let melhor = -Infinity;
      for (let j = 0; j < 300; j++) melhor = Math.max(melhor, sharpeDiario(normais(997, 1 + k * 1000 + j, 0, 0.02)));
      soma += melhor;
    }
    const previsto = sharpeMaximoEsperado(300, varianciaDoSharpeNulo(997));
    confere("300 tentativas nulas em 997 dias: o melhor Sharpe bate a régua", Math.abs(soma / rodadas - previsto) < 0.1 * previsto, `${((soma / rodadas) * Math.sqrt(365)).toFixed(2)} contra ${(previsto * Math.sqrt(365)).toFixed(2)} ao ano`);
  }
  const dsr = sharpeDeflacionado(r, 300, varianciaDoSharpeNulo(r.length));
  confere("deflacionado = probabilístico com a régua de N tentativas", perto(dsr, sharpeProbabilistico(r, sharpeMaximoEsperado(300, 1 / 999)), 1e-12) && dsr < sharpeProbabilistico(r), dsr.toFixed(4));
  const trilha = trilhaMinima(r, 0, 0.95);
  confere("na trilha mínima o probabilístico vale exatamente 95%", perto(normalAcumulada((sr * Math.sqrt(trilha - 1)) / Math.sqrt(v)), 0.95, 1e-9), `${trilha.toFixed(0)} dias`);
  confere("Sharpe abaixo da régua: trilha infinita", trilhaMinima(r, sr * 2) === Infinity, "∞");
}

console.log("\no bootstrap");
{
  const a = sorteador(42);
  const b = sorteador(42);
  let iguais = true;
  let soma = 0;
  for (let k = 0; k < 10_000; k++) {
    const x = a();
    iguais &&= x === b();
    soma += x;
  }
  confere("mesma semente, mesma sequência; média ≈ 0,5", iguais && Math.abs(soma / 10_000 - 0.5) < 0.01, (soma / 10_000).toFixed(4));
  const r = normais(300, 5, 0.001, 0.03);
  const sr = sharpeDiario(r) * Math.sqrt(365);
  const [rot] = bootstrapEstacionario(r, [ESTATISTICAS_DA_FICHA[0]], 50, 1e15, 9);
  confere("bloco infinito: cada amostra é a série girada, mesmo Sharpe", rot.every((x) => perto(x, sr, 1e-9)), `${rot.length} amostras`);
  const [s1] = bootstrapEstacionario(r, [ESTATISTICAS_DA_FICHA[0]], 200, 10, 123);
  const [s2] = bootstrapEstacionario(r, [ESTATISTICAS_DA_FICHA[0]], 200, 10, 123);
  confere("mesma semente, mesmo intervalo", s1.every((x, k) => x === s2[k]), `${quantil(s1, 0.025).toFixed(2)} a ${quantil(s1, 0.975).toFixed(2)}`);
  confere("o intervalo de 95% contém o medido", quantil(s1, 0.025) < sr && sr < quantil(s1, 0.975), sr.toFixed(2));
  const dd = ESTATISTICAS_DA_FICHA[2]([0.1, -0.2, 0.05, 0.3]);
  confere("a queda da estatística é a da ficha", perto(dd, -0.2), dd.toFixed(3));
  confere("quantil interpola entre os pontos", perto(quantil([1, 2, 3, 4], 0.5), 2.5) && quantil([5], 0.9) === 5, `${quantil([1, 2, 3, 4], 0.5)}`);
}

console.log("\no sobreajuste");
{
  const T = 1600;
  const N = 24;
  // Só ruído: escolher pelo passado não ajuda, e a escolhida cai abaixo da mediana fora em metade das vezes.
  const ruido = Array.from({ length: N }, (_, j) => normais(T, 100 + j, 0, 0.02));
  const matrizRuido = Array.from({ length: T }, (_, t) => ruido.map((c) => c[t]));
  const a = pboCSCV(matrizRuido, 16);
  confere("só ruído: PBO perto de 0,5", a.particoes === 12_870 && a.pbo > 0.3 && a.pbo < 0.7, `PBO ${a.pbo.toFixed(3)}`);
  // Uma variante com vantagem de verdade no meio do ruído: ela é a escolhida e fica no alto fora.
  const boa = Array.from({ length: N }, (_, j) => (j === 7 ? normais(T, 900, 0.004, 0.02) : ruido[j]));
  const matrizBoa = Array.from({ length: T }, (_, t) => boa.map((c) => c[t]));
  const b = pboCSCV(matrizBoa, 16);
  confere("uma variante com vantagem: PBO perto de zero", b.pbo < 0.02 && b.sharpeForaDaEscolhida > 2, `PBO ${b.pbo.toFixed(3)} · Sharpe fora ${b.sharpeForaDaEscolhida.toFixed(2)}`);
  confere("matriz pequena demais: sem resposta (NaN), não zero", Number.isNaN(pboCSCV(matrizBoa.slice(0, 40), 16).pbo), "NaN");

  // Walk-forward: a coluna 0 é a melhor na primeira metade, a 1 na segunda.
  const datas = diasDe(T);
  const m = Array.from({ length: T }, (_, t) => [t < T / 2 ? 0.01 : -0.01, t < T / 2 ? -0.01 : 0.01].map((x, j) => x + ruido[j][t] / 4));
  const wf = walkForward(m, datas, 180, 180);
  const primeira = wf.escolhas[0]?.variante;
  const ultima = wf.escolhas[wf.escolhas.length - 1]?.variante;
  confere("walk-forward com treino de 180 dias troca quando o passado manda", primeira === 0 && ultima === 1, wf.escolhas.map((e) => e.variante).join(""));
  confere("e só opera depois do treino mínimo", wf.r.length < T - 180 && wf.r.length > T - 180 - 95, `${wf.r.length} dias`);
  const tudo = walkForward(m, datas, null, 180);
  confere("com o passado inteiro, a troca demora mais", tudo.escolhas.filter((e) => e.variante === 0).length > wf.escolhas.filter((e) => e.variante === 0).length, tudo.escolhas.map((e) => e.variante).join(""));
}

console.log("\na carteira de livros");
{
  const T = 120;
  const datas = Array.from({ length: T }, (_, k) => Date.parse("2025-01-01T00:00:00Z") + (k + 1) * DIA_MS);
  // Dois livros de média zero: um de ±2% ao dia, outro de ±1%.
  const agitado = Array.from({ length: T }, (_, k) => (k % 2 === 0 ? 0.02 : -0.02));
  const calmo = Array.from({ length: T }, (_, k) => (k % 2 === 0 ? -0.01 : 0.01));
  const f = paridadeDeRisco([agitado, calmo], datas, 90, 20);
  confere("primeiro mês sem passado: partes iguais", f.pesos[0].t === Date.parse("2025-01-01T00:00:00Z") && perto(f.pesos[0].pesos[0], 0.5), f.pesos[0].pesos.map((p) => p.toFixed(2)).join(" / "));
  const fev = f.pesos[1];
  confere("depois, o agitado recebe metade do calmo (1/3 contra 2/3)", fev.t === Date.parse("2025-02-01T00:00:00Z") && perto(fev.pesos[0], 1 / 3, 1e-9), fev.pesos.map((p) => p.toFixed(4)).join(" / "));
  // No primeiro dia, meio a meio: +2% × ½ − 1% × ½.
  confere("o retorno do fundo é a soma ponderada do dia", perto(f.r[0], 0.005), f.r[0].toFixed(4));
  // Com o passado dado, os pesos do primeiro mês já saem dele.
  const comHist = paridadeDeRisco([agitado.slice(60), calmo.slice(60)], datas.slice(60), 90, 20, [agitado.slice(0, 60), calmo.slice(0, 60)]);
  confere("o passado de antes da janela entra nos pesos", perto(comHist.pesos[0].pesos[0], 1 / 3, 1e-9), comHist.pesos[0].pesos.map((p) => p.toFixed(4)).join(" / "));
  // Entre um dia 1º e o outro os pesos andam: o livro que ganhou pesa mais.
  const ganha = Array.from({ length: 40 }, () => 0.01);
  const parado = Array.from({ length: 40 }, () => 0);
  const g = paridadeDeRisco([ganha, parado], datas.slice(0, 40), 90, 20);
  const vJan = (1.01 ** 30 * 0.5 + 0.5);
  confere("o peso anda com o resultado até o dia 1º", perto(g.r[29], (1.01 ** 30 * 0.5 + 0.5) / (1.01 ** 29 * 0.5 + 0.5) - 1, 1e-12), `${(vJan - 1).toFixed(4)} em janeiro`);
  confere("série desalinhada: fundo vazio, não zero", paridadeDeRisco([ganha, parado.slice(1)], datas.slice(0, 40)).r.length === 0, "vazio");
  // A subconta que dá dinheiro só dá o que está livre: em 01/02 o agitado (meio a meio em janeiro)
  // precisa dar 1/6 do fundo, e só tem 10% do patrimônio dele fora das posições.
  const livre = [Array.from({ length: T }, () => 0.1), Array.from({ length: T }, () => 1)];
  const travado = paridadeDeRisco([agitado, calmo], datas, 90, 20, undefined, livre);
  const r1 = travado.pesos[1];
  const quer = r1.antes[0] - r1.pesos[0];
  confere("sem caixa livre, a transferência é só do que está livre", perto(r1.antes[0] - r1.depois[0], 0.1 * r1.antes[0], 1e-12) && quer > 0.1 * r1.antes[0], `deu ${(r1.antes[0] - r1.depois[0]).toFixed(4)} de ${quer.toFixed(4)}`);
  confere("o que veio vai para quem faltava, e o total não muda", perto(r1.depois[0] + r1.depois[1], 1, 1e-12), r1.depois.map((x) => x.toFixed(4)).join(" / "));
  const solto = paridadeDeRisco([agitado, calmo], datas, 90, 20, undefined, [livre[1], livre[1]]);
  confere("com todo o caixa livre, é a paridade sem trava", solto.r.every((x, k) => perto(x, f.r[k], 1e-12)), "igual");
}

console.log("\no fundo ao vivo");
{
  const H = 3_600_000;
  const T1 = Date.parse("2025-01-30T00:00:00Z");
  // Livro A sobe US$ 1 por hora; B fica parado. O passado medido diz: A é duas vezes mais agitado.
  const curvaA = Array.from({ length: 73 }, (_, h) => ({ t: T1 + h * H + 60_000, patrimonio: 1000 + h }));
  const curvaB = Array.from({ length: 73 }, (_, h) => ({ t: T1 + h * H + 60_000, patrimonio: 1000 }));
  const histA = Array.from({ length: 30 }, (_, k) => (k % 2 === 0 ? 0.02 : -0.02));
  const histB = Array.from({ length: 30 }, (_, k) => (k % 2 === 0 ? 0.01 : -0.01));
  const agora = T1 + 72 * H + 60_000;
  const f = fundoAoVivo(
    [
      { curva: curvaA, patrimonioAgora: 1072, agora, historico: histA },
      { curva: curvaB, patrimonioAgora: 1000, agora, historico: histB },
    ],
    1000,
  );
  confere("começa na primeira virada com os dois livros marcados", f !== null && f.comecouEm === T1 + DIA_MS && perto(f.curva[0].patrimonio, 1000), f ? new Date(f.comecouEm).toISOString().slice(0, 10) : "nulo");
  // Em 31/01 entra 1/3 em A (que vale 1.023) e 2/3 em B; o dia 1º refaz os pesos sem mudar o total.
  const esperadoFev1 = (1000 / 3) * (1047 / 1023) + (2000 / 3);
  confere("os pesos saem do passado medido: 1/3 no agitado", f !== null && f.curva.length === 4 && perto(f.curva[1].patrimonio, esperadoFev1, 1e-9), f ? f.curva[1].patrimonio.toFixed(4) : "nulo");
  const cotasFev = f ? f.pesosDoMes.map((w, j) => (w * esperadoFev1) / [1047, 1000][j]) : [];
  const agoraEsperado = cotasFev.length === 2 ? cotasFev[0] * 1072 + cotasFev[1] * 1000 : NaN;
  confere("dia 1º rebalanceia, e o agora marca por cima da última virada", f !== null && perto(f.patrimonio, agoraEsperado, 1e-9) && f.curva[f.curva.length - 1].t === agora, f ? f.patrimonio.toFixed(4) : "nulo");
  confere("os pesos de agora somam 1", f !== null && perto(f.pesos[0] + f.pesos[1], 1, 1e-12), f ? f.pesos.map((x) => x.toFixed(3)).join(" / ") : "nulo");
  // Virada sem marcação de um livro: fica de fora, e a seguinte lê onde cada um estiver.
  const buracoB = curvaB.filter((p) => !(p.t > T1 + 40 * H && p.t < T1 + 49 * H));
  const g = fundoAoVivo(
    [
      { curva: curvaA, patrimonioAgora: 1072, agora, historico: histA },
      { curva: buracoB, patrimonioAgora: 1000, agora, historico: histB },
    ],
    1000,
  );
  confere("virada sem marcação de um livro fica de fora", g !== null && g.curva.length === 3 && !g.curva.some((p) => p.t === T1 + 2 * DIA_MS), g ? g.curva.map((p) => new Date(p.t).toISOString().slice(5, 13)).join(" ") : "nulo");
  confere("sem nenhuma virada em comum: sem fundo, não um fundo de US$ 0", fundoAoVivo([{ curva: curvaA.slice(0, 3), patrimonioAgora: 1002, agora: T1 + 3 * H, historico: histA }], 1000) === null, "nulo");
}

console.log(falhas === 0 ? "\ntodos os casos passaram" : `\n${falhas} caso(s) FALHARAM`);
process.exitCode = falhas === 0 ? 0 : 1;
