/**
 * A pergunta que faltava: a classificação prevê alguma coisa?
 *
 * Todo o resto deste projeto descreve o presente. Isto olha para trás e mede se
 * a régua tem valor — se uma moeda marcada como "exausta" realmente continua
 * caindo, e se "ressuscitando" realmente sobe. Sem esta medida, os estágios são
 * só vocabulário bonito para o que já aconteceu.
 *
 * O teste é caminhado: para cada dia do passado, a classificação usa APENAS as
 * velas até aquele dia, e o resultado é medido nos dias seguintes. Olhar o
 * histórico inteiro para classificar e depois medir dentro dele seria trapaça —
 * o classificador estaria vendo o futuro que deveria prever.
 *
 * O que NÃO é testado, e é honesto dizer: a saída das baleias e o squeeze
 * dependem de liquidação e de posição absoluta, que só a Gate publica e só por
 * cem horas. O float em corretora exige nó de arquivo e não existe na Base.
 * Portanto o que se mede aqui é a espinha da régua — os estágios de vida — não
 * ela inteira.
 *
 * Rode com: npm run backtest
 */

import { fetchCsv, monthlyKlineUrl, dailyKlineUrl, recentDays } from "../lib/datavision";
import { velas } from "../lib/binance";
import { parseKlines } from "../lib/derivatives";
import { classificar, DIAS_DA_JANELA, type Estagio } from "../lib/lifecycle";
// A lista CHEIA de propósito, incluindo as aposentadas: para medir a régua,
// moeda morta é amostra tão boa quanto viva — melhor, até, porque é onde os
// estágios finais acontecem. Aposentar existe para poupar requisição no que
// roda de três em três minutos, não para apagar o passado.
import { WATCHLIST } from "../lib/watchlist";

/** Dias de histórico necessários antes de a classificação valer alguma coisa. */
const AQUECIMENTO = 45;

/** Horizontes medidos, em dias. */
const HORIZONTES = [1, 3, 7, 14];

const MESES = 8;

function mesesRecentes(): string[] {
  const out: string[] = [];
  const c = new Date();
  c.setUTCDate(1);
  c.setUTCMonth(c.getUTCMonth() - MESES + 1);
  for (let i = 0; i < MESES; i++) {
    out.push(c.toISOString().slice(0, 7));
    c.setUTCMonth(c.getUTCMonth() + 1);
  }
  return out;
}

async function barras(symbol: string) {
  const [aoVivo, m, d] = await Promise.all([
    velas(symbol, "1d", MESES * 31).catch(() => []),
    Promise.all(mesesRecentes().map((x) => fetchCsv(monthlyKlineUrl(symbol, "1d", x)))),
    Promise.all(recentDays(4).map((x) => fetchCsv(dailyKlineUrl(symbol, "1d", x)))),
  ]);
  const porDia = new Map<number, ReturnType<typeof parseKlines>[0]>();
  for (const csv of [...m, ...d]) {
    if (!csv) continue;
    for (const b of parseKlines(csv)) porDia.set(b.time, b);
  }
  for (const v of aoVivo) porDia.set(v.time, v);
  return [...porDia.values()].sort((a, b) => a.time - b.time);
}

interface Obs {
  symbol: string;
  dia: string;
  estagio: Estagio;
  retornos: (number | null)[];
}

// O LAB entra à mão: ele não está mais na watchlist, e é o único ciclo
// completo que este projeto observou do começo ao fim.
const SIMBOLOS = [...new Set([...WATCHLIST.map((t) => t.symbol), "LABUSDT"])];

const observacoes: Obs[] = [];
let semDado = 0;

for (const symbol of SIMBOLOS) {
  const b = await barras(symbol).catch(() => []);
  if (b.length < AQUECIMENTO + Math.max(...HORIZONTES) + 5) {
    semDado++;
    continue;
  }

  for (let i = AQUECIMENTO; i < b.length - 1; i++) {
    // A MESMA JANELA QUE RODA AO VIVO, e isto não é detalhe. `lerVida` enxerga
    // seis meses corridos; medir a régua numa janela que cresce sem limite
    // valida um classificador diferente do que está no ar — com topo mais
    // antigo, queda mais funda e amplitude maior em toda observação.
    const ate = b.slice(Math.max(0, i + 1 - DIAS_DA_JANELA), i + 1);
    const preco = ate[ate.length - 1].close;

    let pico = ate[0].high;
    let picoI = 0;
    for (const [j, x] of ate.entries()) {
      if (x.high > pico) {
        pico = x.high;
        picoI = j;
      }
    }
    const depois = ate.slice(picoI + 1);
    const fundo = Math.min(preco, ...depois.map((x) => x.low));
    const minimo = Math.min(...ate.map((x) => x.low));

    const { estagio } = classificar({
      queda: preco / pico - 1,
      altaDesdeFundo: fundo > 0 ? preco / fundo - 1 : 0,
      amplitude: minimo > 0 ? pico / minimo : 1,
      diasDesdePico: ate.length - 1 - picoI,
      floatCex: null,
    });

    observacoes.push({
      symbol,
      dia: new Date(ate[ate.length - 1].time * 1000).toISOString().slice(0, 10),
      estagio,
      retornos: HORIZONTES.map((h) =>
        i + h < b.length ? b[i + h].close / preco - 1 : null,
      ),
    });
  }
}

// ------------------------------------------------------------------ resultado
const mediana = (xs: number[]) => {
  if (xs.length === 0) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%` : "—");

console.log(
  `\n${observacoes.length.toLocaleString("pt-BR")} observações · ` +
    `${SIMBOLOS.length - semDado} moedas com histórico suficiente · ${semDado} sem\n`,
);

const ESTAGIOS: Estagio[] = [
  "nunca subiu", "subindo", "no topo", "caindo do topo",
  "ressuscitando", "em queda longa", "exausta", "de lado",
];

// A referência: o retorno mediano de TODAS as observações. Um estágio só diz
// alguma coisa se ele se afasta dela — comparar contra zero premiaria qualquer
// classificação num mercado que sobe, e puniria qualquer uma num que cai.
console.log(`estágio          obs      ${HORIZONTES.map((h) => `${h}d mediana  ${h}d>0`).join("   ")}`);
for (const est of [...ESTAGIOS, "TODAS" as const]) {
  const grupo = est === "TODAS" ? observacoes : observacoes.filter((o) => o.estagio === est);
  if (grupo.length === 0) continue;

  const cols = HORIZONTES.map((_, k) => {
    const rs = grupo.map((o) => o.retornos[k]).filter((r): r is number => r !== null);
    const acima = rs.filter((r) => r > 0).length;
    return `${pct(mediana(rs)).padStart(10)}  ${(rs.length ? ((acima / rs.length) * 100).toFixed(0) + "%" : "—").padStart(4)}`;
  });

  console.log(
    `${(est === "TODAS" ? "— todas —" : est).padEnd(16)} ${String(grupo.length).padStart(5)}   ${cols.join("   ")}`,
  );
}

// ------------------------------------------- o efeito é do estágio ou da moeda?
//
// Uma mediana de seis mil observações ainda pode ser o retrato de duas ou três
// moedas que se moveram muito e aparecem centenas de vezes. O teste é contar
// quantas moedas, uma a uma, apontam para o mesmo lado: se a maioria concorda, o
// efeito é do estágio; se não, é de quem estava dentro dele.
console.log(`\n--- por moeda, em 7 dias ---`);
console.log(`estágio          moedas   sobem  caem   mediana das medianas`);
for (const est of ESTAGIOS) {
  const porMoeda = new Map<string, number[]>();
  for (const o of observacoes) {
    if (o.estagio !== est || o.retornos[2] === null) continue;
    porMoeda.set(o.symbol, [...(porMoeda.get(o.symbol) ?? []), o.retornos[2]]);
  }
  const medianas = [...porMoeda.values()]
    .filter((rs) => rs.length >= 5)
    .map((rs) => mediana(rs));
  if (medianas.length < 3) continue;

  const sobem = medianas.filter((m) => m > 0).length;
  console.log(
    `${est.padEnd(16)} ${String(medianas.length).padStart(6)}   ${String(sobem).padStart(5)} ` +
      `${String(medianas.length - sobem).padStart(5)}   ${pct(mediana(medianas)).padStart(8)}`,
  );
}

// ------------------------------------------- o sinal sobrevive a embaralhar?
//
// Se atribuir estágios ao acaso produzir separações tão grandes quanto a real,
// não há sinal — há variação. Os rótulos são embaralhados mil vezes mantendo a
// mesma quantidade de cada estágio, e conta-se quantas vezes o acaso faz igual
// ou melhor.
function separacaoDe(est: Estagio, rotulos: Estagio[]): number {
  let dentro = 0, nDentro = 0, fora = 0, nFora = 0;
  for (const [i, o] of observacoes.entries()) {
    const r = o.retornos[2];
    if (r === null) continue;
    if (rotulos[i] === est) { dentro += r; nDentro++; } else { fora += r; nFora++; }
  }
  return nDentro && nFora ? dentro / nDentro - fora / nFora : 0;
}

const SORTEIOS = 1000;
const rotulosReais = observacoes.map((o) => o.estagio);

console.log(`\n--- teste de embaralhamento (${SORTEIOS} sorteios, 7 dias) ---`);
console.log(`estágio          diferença vs resto     p`);

for (const est of ["no topo", "subindo", "exausta", "ressuscitando"] as Estagio[]) {
  const real = separacaoDe(est, rotulosReais);
  let extremos = 0;

  for (let k = 0; k < SORTEIOS; k++) {
    const emb = [...rotulosReais];
    for (let i = emb.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [emb[i], emb[j]] = [emb[j], emb[i]];
    }
    // Bicaudal: interessa se o acaso chega tão longe do zero quanto o real,
    // para qualquer lado. Testar só o lado observado inflaria a significância.
    if (Math.abs(separacaoDe(est, emb)) >= Math.abs(real)) extremos++;
  }

  const p = extremos / SORTEIOS;
  console.log(
    `${est.padEnd(16)} ${((real * 100).toFixed(2) + " p.p.").padStart(16)}   ` +
      `${p.toFixed(3)}${p < 0.05 ? "  significativo" : "  não significativo"}`,
  );
}

// ----------------------------------------------------- o que interessa vender
console.log(`\n--- separação entre os extremos, em 7 dias ---`);
const em7 = (est: Estagio) =>
  observacoes.filter((o) => o.estagio === est).map((o) => o.retornos[2]).filter((r): r is number => r !== null);

const exausta = em7("exausta");
const ressus = em7("ressuscitando");
const todas = observacoes.map((o) => o.retornos[2]).filter((r): r is number => r !== null);

console.log(`exausta:       mediana ${pct(mediana(exausta))} · ${exausta.length} obs`);
console.log(`ressuscitando: mediana ${pct(mediana(ressus))} · ${ressus.length} obs`);
console.log(`referência:    mediana ${pct(mediana(todas))} · ${todas.length} obs`);
console.log(
  `\nseparação entre os dois: ${((mediana(ressus) - mediana(exausta)) * 100).toFixed(1)} pontos percentuais em 7 dias`,
);
