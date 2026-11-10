/**
 * Os casos-limite do algoritmo de previsão (`lib/previsao.ts`), sem tocar em
 * rede. Sai com código diferente de zero quando algum falha.
 *
 * O que mais importa travar: a entrada de um dia NÃO pode ler o dia da decisão
 * nem depois dele (olhar o futuro é o defeito que faz qualquer modelo parecer
 * bom), moeda sem leitura fica fora em vez de entrar com zero, e o posto não
 * empurra para lado nenhum a moeda sem aquela entrada.
 *
 * Rode com: npx tsx scripts/testar-previsao.mts
 */
import { ajustarLogistica, DIAS_MINIMOS, ENTRADAS, entradasDaMoeda, entradasDoBtc, notaDe, postosDe, prever, ridge, universoDoDia, VOLUME_MINIMO, type SerieDiaria } from "../lib/previsao";

let falhas = 0;
function confere(nome: string, ok: boolean, obtido: string): void {
  if (!ok) falhas++;
  console.log(`  ${nome.padEnd(66)} ${obtido.padEnd(28)} ${ok ? "ok" : "← FALHOU"}`);
}
const perto = (x: number, y: number, tol = 1e-9) => Math.abs(x - y) <= tol * Math.max(1, Math.abs(y));

/** Uma série de `n` dias a partir do dia 1000, subindo `passo` por dia, com volume e financiamento fixos. */
function serie(symbol: string, n: number, passo = 0.01, volume = 50e6): SerieDiaria {
  const c = Array.from({ length: n }, (_, i) => 100 * (1 + passo) ** i);
  return { symbol, d0: 1000, c, qv: new Array(n).fill(volume), tb: new Array(n).fill(volume * 0.6), fr: new Array(n).fill(0.0003) };
}

console.log("\nos postos");
{
  const p = postosDe([3, 1, 2]);
  confere("do menor (−0,5) ao maior (+0,5)", p[0] === 0.5 && p[1] === -0.5 && p[2] === 0, p.join(","));
  const e = postosDe([1, 2, 2, 3]);
  confere("o empate leva a média", perto(e[1], e[2]) && perto(e[1], 0), e.map((v) => v.toFixed(2)).join(","));
  const n = postosDe([5, null, 1, NaN]);
  confere("sem leitura fica no meio, e não conta na ordem", n[1] === 0 && n[3] === 0 && n[0] === 0.5 && n[2] === -0.5, n.join(","));
  confere("uma moeda só não tem posto", postosDe([7])[0] === 0, "0");
}

console.log("\nas entradas de uma moeda");
{
  const s = serie("AAA", 60);
  const d = 1000 + 60;
  const e = entradasDaMoeda(s, d);
  confere("retornos de 1, 7, 14 e 45 dias sobre o fechamento da véspera", e !== null && perto(e.x[0] as number, 0.01) && perto(e.x[1] as number, 1.01 ** 7 - 1) && perto(e.x[3] as number, 1.01 ** 45 - 1), `${(e?.x[0] as number)?.toFixed(4)}`);
  confere("fluxo, financiamento e surto", e !== null && perto(e.x[4] as number, 0.6) && perto(e.x[6] as number, 0.0003) && perto(e.x[7] as number, 1), `${e?.x[4]} · ${e?.x[6]} · ${e?.x[7]}`);
  confere("o volume é a média de 7 dias, em dólares", e !== null && perto(e.volume, 50e6), `${e?.volume}`);
  // Olhar o futuro: mexer no dia da decisão e nos seguintes não pode mudar nada.
  const longa = serie("AAA", 70);
  const antes = JSON.stringify(entradasDaMoeda(longa, d));
  for (let i = 60; i < 70; i++) {
    longa.c[i] *= 3;
    longa.qv[i] *= 9;
    longa.fr[i] = 0.5;
  }
  confere("o dia da decisão e os seguintes não entram", JSON.stringify(entradasDaMoeda(longa, d)) === antes, "igual");
  confere("com 45 dias de vela ainda não há leitura", entradasDaMoeda(serie("AAA", DIAS_MINIMOS - 1), 1000 + DIAS_MINIMOS - 1) === null, "nulo");
  confere("com 46 já há", entradasDaMoeda(serie("AAA", DIAS_MINIMOS), 1000 + DIAS_MINIMOS) !== null, "lida");
  const furo = serie("AAA", 60);
  furo.c[40] = NaN;
  confere("dia sem vela na janela de 30 dias: fora, não zero", entradasDaMoeda(furo, d) === null, "nulo");
  const semFr = serie("AAA", 60);
  semFr.fr.fill(NaN);
  confere("sem financiamento a moeda fica, com essa entrada nula", entradasDaMoeda(semFr, d)?.x[6] === null, "nula");
  confere("decisão além do fim da série não tem leitura", entradasDaMoeda(s, d + 2) === null, "nulo");
}

console.log("\no universo do dia");
{
  const series = [serie("AAA", 60, 0.01), serie("BBB", 60, 0.02), serie("CCC", 60, -0.01), serie("POUCA", 60, 0.05, VOLUME_MINIMO / 2), serie("NOVA", 20)];
  const u = universoDoDia(series, 1060);
  confere("volume baixo e moeda nova ficam fora", u.length === 3 && !u.some((l) => l.symbol === "POUCA" || l.symbol === "NOVA"), u.map((l) => l.symbol).join(","));
  const r45 = ENTRADAS.indexOf("r45");
  const de = (s: string) => u.find((l) => l.symbol === s)?.p[r45];
  confere("o posto é dentro do universo do dia", de("BBB") === 0.5 && de("CCC") === -0.5 && de("AAA") === 0, `${de("BBB")} · ${de("AAA")} · ${de("CCC")}`);
  confere("a nota é a soma dos pesos pelos postos", perto(notaDe([0.5, -0.5, 0], [2, 1, 9]), 0.5), `${notaDe([0.5, -0.5, 0], [2, 1, 9])}`);
}

console.log("\na regressão");
{
  // y = 2·x0 − 1·x1, sem ruído: com penalidade quase zero os pesos voltam.
  const X: number[][] = [];
  const y: number[] = [];
  let s = 7;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647) - 0.5;
  for (let i = 0; i < 500; i++) {
    const x = [r(), r(), r()];
    X.push(x);
    y.push(2 * x[0] - x[1]);
  }
  const w = ridge(X, y, 1e-9);
  confere("recupera os pesos de um dado sem ruído", perto(w[0], 2, 1e-4) && perto(w[1], -1, 1e-4) && Math.abs(w[2]) < 1e-4, w.map((v) => v.toFixed(3)).join(","));
  const wp = ridge(X, y, 0.5);
  confere("a penalidade encolhe os pesos, sem trocar o sinal", Math.abs(wp[0]) < 2 && wp[0] > 0 && wp[1] < 0, wp.map((v) => v.toFixed(3)).join(","));
}

console.log("\no BTC");
{
  const fech = Array.from({ length: 260 }, (_, i) => 100 + i);
  const e = entradasDoBtc(fech, 259, 400, 30);
  confere("as cinco entradas", e !== null && perto(e[1], 359 / 329 - 1) && perto(e[3], 359 / 400 - 1) && perto(e[4], -0.2), e?.map((v) => v.toFixed(3)).join(",") ?? "nulo");
  confere("sem 200 dias ou sem o índice de medo: nulo", entradasDoBtc(fech, 150, 400, 30) === null && entradasDoBtc(fech, 259, 400, null) === null, "nulo");
  // Uma entrada que separa perfeitamente: o modelo tem de dar mais chance onde subiu.
  const X = Array.from({ length: 200 }, (_, i) => [i < 100 ? -1 : 1]);
  const y = X.map((x) => (x[0] > 0 ? 1 : 0));
  const m = ajustarLogistica(X, y);
  confere("a logística aprende o lado certo", prever(m, [1]) > 0.8 && prever(m, [-1]) < 0.2, `${prever(m, [1]).toFixed(2)} · ${prever(m, [-1]).toFixed(2)}`);
  const semSinal = ajustarLogistica(X, X.map((_, i) => (i % 2 === 0 ? 1 : 0)));
  confere("sem sinal, devolve a taxa-base", Math.abs(prever(semSinal, [1]) - 0.5) < 0.02, prever(semSinal, [1]).toFixed(3));
}

console.log(falhas === 0 ? "\ntodos os casos passaram" : `\n${falhas} caso(s) FALHARAM`);
if (falhas > 0) process.exit(1);
