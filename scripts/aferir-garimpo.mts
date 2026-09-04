/**
 * A medição que sustenta o garimpo, refeita do zero a cada execução.
 *
 * `lib/garimpo.ts` carrega uma tabela de medianas medidas, e uma tabela colada
 * num arquivo envelhece em silêncio — que é o pior modo de falha possível para
 * um número que ordena decisão. Este script é como aquela tabela foi produzida,
 * e rodá-lo de novo é como se confere se ela ainda vale.
 *
 * A METODOLOGIA É A DO `lib/placar.ts`, de propósito: mediana do retorno à
 * frente, comparada com a referência de TODAS as observações, mais a
 * concordância entre moedas. A referência existe porque num período de queda
 * geral qualquer grupo tem mediana negativa e isso não é informação; a
 * concordância existe porque mediana boa concentrada em poucas moedas é ruído
 * com cara de descoberta.
 *
 * O QUE ELE MEDE, em três partes:
 *
 *   1. A DERIVA  — depois de um dia (ou uma semana) de alta grande, o que o
 *                  preço faz? É o sinal.
 *   2. O CAMINHO — vendendo a partir dali, com stop, alvo, custo e o
 *                  financiamento real da Binance, o que a conta faz? É o que
 *                  transforma, ou não, o sinal em dinheiro.
 *   3. O AVESSO  — a mesma pergunta do lado comprado, sobre a moeda derretida,
 *                  que é a regra de compra que o painel emite hoje.
 *
 * As três respostas juntas são o motivo de o garimpo ser uma fila de
 * investigação e não um emissor de calls.
 *
 * CUSTO: duas requisições por símbolo — velas diárias e histórico de
 * financiamento —, cerca de 1.050 de peso contra o orçamento de 2.400 por
 * minuto da Binance. Leva uns cinco segundos.
 *
 * Rode com: npm run aferir-garimpo
 */

import { velas } from "../lib/binance";
import { comLimite } from "../lib/limite";

/** Custo por lado, o mesmo da carteira: 0,05% de taker mais 0,10% de escorregada. */
const CUSTO = 0.0015;

interface Vela {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

const mediana = (xs: number[]): number => {
  if (xs.length === 0) return NaN;
  const a = [...xs].sort((x, y) => x - y);
  return a.length % 2 ? a[(a.length - 1) / 2] : (a[a.length / 2 - 1] + a[a.length / 2]) / 2;
};
const pct = (v: number) =>
  Number.isFinite(v) ? `${v >= 0 ? "+" : "−"}${(Math.abs(v) * 100).toFixed(2)}%` : "—";

// ------------------------------------------------------------------- os dados

const info = (await (await fetch("https://www.binance.com/fapi/v1/exchangeInfo")).json()) as {
  symbols: { symbol: string; status: string; contractType: string; quoteAsset: string; onboardDate: number }[];
};
const universo = info.symbols.filter(
  (s) => s.status === "TRADING" && s.contractType === "PERPETUAL" && s.quoteAsset === "USDT",
);

/**
 * O financiamento pago em cada período de 8h, do histórico da própria Binance.
 *
 * Entra porque numa vendida ele é VENTO A FAVOR e ignorá-lo enviesaria a
 * conclusão contra o trade — e a conclusão aqui já é desfavorável, então ela
 * precisa ser desfavorável com o vento a favor contado.
 */
async function financiamento(symbol: string): Promise<{ t: number; r: number }[]> {
  return comLimite("binance", 24, async () => {
    try {
      const r = await fetch(
        `https://www.binance.com/fapi/v1/fundingRate?symbol=${symbol}&limit=1000`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (!r.ok) return [];
      const d = (await r.json()) as { fundingTime: number; fundingRate: string }[];
      return Array.isArray(d)
        ? d
            .map((x) => ({ t: Math.floor(x.fundingTime / 1000), r: Number(x.fundingRate) }))
            .filter((x) => Number.isFinite(x.r))
        : [];
    } catch {
      return [];
    }
  });
}

const t0 = Date.now();
const series = new Map<string, Vela[]>();
const fundos = new Map<string, { t: number; r: number }[]>();
let semSerie = 0;

await Promise.all(
  universo.map(async (s) => {
    const [v, f] = await Promise.all([velas(s.symbol, "1d", 200).catch(() => []), financiamento(s.symbol)]);
    // Menos de trinta dias não sustenta nem a janela de sete dias nem o
    // horizonte de catorze. Fora, e contado.
    if (v.length < 30) {
      semSerie++;
      return;
    }
    series.set(s.symbol, v);
    fundos.set(s.symbol, f);
  }),
);

console.log(
  `\n${universo.length} perpétuos · ${series.size} com série de 200 dias · ` +
    `${semSerie} sem histórico suficiente · ${((Date.now() - t0) / 1000).toFixed(1)}s`,
);

// ------------------------------------------------------------- 1. a deriva

interface Obs {
  s: string;
  t: number;
  alta1: number;
  alta7: number;
  fwd: number;
}

function observar(H: number): Obs[] {
  const obs: Obs[] = [];
  for (const [s, v] of series) {
    for (let i = 7; i + H < v.length; i++) {
      const c = v[i].close, a = v[i - 1].close, b = v[i - 7].close, f = v[i + H].close;
      if (!(c > 0 && a > 0 && b > 0 && f > 0)) continue;
      obs.push({ s, t: v[i].time, alta1: c / a - 1, alta7: c / b - 1, fwd: f / c - 1 });
    }
  }
  return obs;
}

function deriva(obs: Obs[], H: number, campo: "alta1" | "alta7", faixas: [string, number, number][]) {
  const ref = mediana(obs.map((o) => o.fwd));
  console.log(
    `\n=== ${campo === "alta1" ? "alta de UM dia" : "alta de SETE dias"} → retorno ${H} dias à frente ===`,
  );
  console.log(
    `referência (${obs.length.toLocaleString("pt-BR")} observações, ${new Set(obs.map((o) => o.s)).size} moedas): ${pct(ref)}`,
  );
  console.log("faixa                    n      mediana   vs referência   moedas a favor   subiu");
  for (const [nome, lo, hi] of faixas) {
    const g = obs.filter((o) => o[campo] >= lo && o[campo] < hi);
    if (g.length < 30) {
      console.log(`${nome.padEnd(22)} ${String(g.length).padStart(6)}   (amostra pequena, não conclui)`);
      continue;
    }
    const med = mediana(g.map((o) => o.fwd));
    const delta = med - ref;
    const porM = new Map<string, number[]>();
    for (const o of g) {
      const l = porM.get(o.s) ?? [];
      l.push(o.fwd);
      porM.set(o.s, l);
    }
    // "A favor" é relativo à REFERÊNCIA e não a zero: num período de queda geral
    // toda faixa tem mediana negativa, e isso não é informação.
    const meds = [...porM.values()].filter((l) => l.length >= 2).map(mediana);
    const aFavor = meds.filter((m) => (delta >= 0 ? m > ref : m < ref)).length;
    console.log(
      nome.padEnd(22),
      String(g.length).padStart(6),
      pct(med).padStart(11),
      ((delta >= 0 ? "+" : "−") + (Math.abs(delta) * 100).toFixed(2) + " p.p.").padStart(14),
      `${aFavor}/${meds.length}`.padStart(14),
      ((g.filter((o) => o.fwd > 0).length / g.length) * 100).toFixed(0).padStart(7) + "%",
    );
  }
}

const FAIXAS_1D: [string, number, number][] = [
  ["caiu", -1, 0], ["subiu 0–10%", 0, 0.1], ["subiu 10–25%", 0.1, 0.25],
  ["subiu 25–50%", 0.25, 0.5], ["subiu 50–100%", 0.5, 1], ["subiu +100%", 1, 99],
];
const FAIXAS_7D: [string, number, number][] = [
  ["caiu", -1, 0], ["subiu 0–25%", 0, 0.25], ["subiu 25–50%", 0.25, 0.5],
  ["subiu 50–100%", 0.5, 1], ["subiu 100–200%", 1, 2], ["subiu +200%", 2, 99],
];

console.log("\n──────────────── 1. A DERIVA: o pump é seguido de quê? ────────────────");
for (const H of [7, 14]) {
  const obs = observar(H);
  deriva(obs, H, "alta1", FAIXAS_1D);
  deriva(obs, H, "alta7", FAIXAS_7D);
}

/**
 * ESTABILIDADE: o efeito aparece nas duas metades da janela, separadamente?
 *
 * É o teste que separa efeito de regime. Um número que só existe numa metade é
 * a descrição daquele trimestre, não uma regularidade.
 */
console.log("\n=== estabilidade: alta de 1 dia ≥25%, retorno 7 dias, por metade da janela ===");
{
  const obs = observar(7);
  const tempos = obs.map((o) => o.t).sort((a, b) => a - b);
  const corte = tempos[Math.floor(tempos.length / 2)];
  for (const [nome, filtro] of [
    ["primeira metade", (o: Obs) => o.t < corte],
    ["segunda metade", (o: Obs) => o.t >= corte],
  ] as const) {
    const parte = obs.filter(filtro);
    const ref = mediana(parte.map((o) => o.fwd));
    const g = parte.filter((o) => o.alta1 >= 0.25);
    const de = new Date(Math.min(...parte.map((o) => o.t)) * 1000).toISOString().slice(0, 10);
    const ate = new Date(Math.max(...parte.map((o) => o.t)) * 1000).toISOString().slice(0, 10);
    console.log(
      `${nome.padEnd(17)} ${de}→${ate}  n=${String(g.length).padStart(4)}  ` +
        `mediana ${pct(mediana(g.map((o) => o.fwd)))}  referência ${pct(ref)}  ` +
        `distância ${pct(mediana(g.map((o) => o.fwd)) - ref)}`,
    );
  }
}

// ------------------------------------------------------------- 2. o caminho

/**
 * Vendido a partir do dia da alta, caminhando pelas máximas e mínimas diárias.
 *
 * O preenchimento é no NÍVEL DA ORDEM, e na abertura quando a vela saltou por
 * cima dele — as mesmas regras que `lib/carteira.ts` usa, para os dois números
 * serem comparáveis. Dentro de um dia, stop antes de alvo: é a suposição
 * conservadora, e supor o contrário seria escolher o resultado.
 */
function simular(
  minAlta: number,
  stopPct: number,
  alvoPct: number,
  dias: number,
  filtro?: (e: { idadeDias: number; alta7: number; funding: number }) => boolean,
) {
  let alvo = 0, stop = 0, prazo = 0;
  const rets: number[] = [];
  const porMoeda = new Map<string, number[]>();

  for (const [sym, v] of series) {
    const fs = fundos.get(sym) ?? [];
    const onboard = universo.find((u) => u.symbol === sym)?.onboardDate ?? 0;
    for (let i = 7; i + dias < v.length; i++) {
      const c = v[i].close, a = v[i - 1].close, b = v[i - 7].close;
      if (!(c > 0 && a > 0 && b > 0) || c / a - 1 < minAlta) continue;
      if (filtro) {
        const recentes = fs.filter((x) => x.t <= v[i].time).slice(-3);
        const ok = filtro({
          idadeDias: (v[i].time * 1000 - onboard) / 86_400_000,
          alta7: c / b - 1,
          funding: recentes.length ? recentes.reduce((s, x) => s + x.r, 0) / recentes.length : 0,
        });
        if (!ok) continue;
      }

      const nStop = c * (1 + stopPct), nAlvo = c * (1 - alvoPct);
      let saida = v[i + dias].close, fim = i + dias, motivo = "prazo";
      for (let j = i + 1; j <= i + dias; j++) {
        if (v[j].high >= nStop) { saida = Math.max(v[j].open, nStop); fim = j; motivo = "stop"; break; }
        if (v[j].low <= nAlvo) { saida = Math.min(v[j].open, nAlvo); fim = j; motivo = "alvo"; break; }
      }
      if (motivo === "alvo") alvo++;
      else if (motivo === "stop") stop++;
      else prazo++;

      // Vendido RECEBE financiamento positivo, então ele entra somado.
      let f = 0;
      for (const x of fs) if (x.t >= v[i].time && x.t < v[fim].time) f += x.r;

      const r = -(saida / c - 1) + f - 2 * CUSTO;
      rets.push(r);
      const l = porMoeda.get(sym) ?? [];
      l.push(r);
      porMoeda.set(sym, l);
    }
  }

  const n = rets.length || 1;
  const meds = [...porMoeda.values()].filter((l) => l.length >= 2).map(mediana);
  return {
    n: rets.length,
    alvo: alvo / n, stop: stop / n, prazo: prazo / n,
    media: rets.reduce((s, x) => s + x, 0) / n,
    med: mediana(rets),
    aFavor: meds.filter((m) => m > 0).length,
    moedas: meds.length,
  };
}

function linha(nome: string, r: ReturnType<typeof simular>) {
  if (r.n < 25) { console.log(`${nome.padEnd(26)} n=${r.n} (amostra pequena, não conclui)`); return; }
  console.log(
    `${nome.padEnd(26)} ${String(r.n).padStart(5)}  ${(r.alvo * 100).toFixed(0).padStart(3)}% ` +
      `${(r.stop * 100).toFixed(0).padStart(4)}% ${(r.prazo * 100).toFixed(0).padStart(5)}%  ` +
      `${pct(r.media).padStart(9)} ${pct(r.med).padStart(9)}   ${r.aFavor}/${r.moedas}`,
  );
}

const CAB = "                               n   alvo  stop  prazo      média   mediana   moedas+";

console.log(
  "\n──────────────── 2. O CAMINHO: vendendo isso, a conta fecha? ────────────────" +
    "\nvariação de PREÇO, sem alavancagem, com custo de 0,15% por lado e financiamento real dentro",
);
console.log("\n=== largura do stop · gatilho alta ≥25% num dia · alvo −40% · 14 dias ===");
console.log(CAB);
for (const s of [0.25, 0.4, 0.6, 0.8, 1.0]) linha(`stop +${(s * 100).toFixed(0)}%`, simular(0.25, s, 0.4, 14));

console.log("\n=== por gatilho · stop +60% · alvo −40% · 14 dias ===");
console.log(CAB);
for (const [n, g] of [["alta ≥10%", 0.1], ["alta ≥25%", 0.25], ["alta ≥50%", 0.5], ["alta ≥100%", 1.0]] as const) {
  linha(n, simular(g, 0.6, 0.4, 14));
}

console.log("\n=== com o stop de +25% que a carteira usa hoje ===");
console.log(CAB);
for (const [n, g] of [["alta ≥10%", 0.1], ["alta ≥25%", 0.25], ["alta ≥50%", 0.5], ["alta ≥100%", 1.0]] as const) {
  linha(n, simular(g, 0.25, 0.4, 14));
}

console.log("\n=== as teses do projeto como filtro · gatilho ≥25% · stop +60% · alvo −40% ===");
console.log(CAB);
linha("sem filtro", simular(0.25, 0.6, 0.4, 14));
linha("listada há <180 dias", simular(0.25, 0.6, 0.4, 14, (e) => e.idadeDias < 180));
linha("listada há <90 dias", simular(0.25, 0.6, 0.4, 14, (e) => e.idadeDias < 90));
linha("listada há >1 ano", simular(0.25, 0.6, 0.4, 14, (e) => e.idadeDias > 365));
linha("vem de +50% na semana", simular(0.25, 0.6, 0.4, 14, (e) => e.alta7 >= 0.5));
linha("funding ≥0,05%/8h", simular(0.25, 0.6, 0.4, 14, (e) => e.funding >= 0.0005));
linha("funding negativo", simular(0.25, 0.6, 0.4, 14, (e) => e.funding < 0));

// -------------------------------------------------------------- 3. o avesso

/**
 * O lado COMPRADO, medido do mesmo jeito.
 *
 * A regra de compra do painel é "moeda pequena e derretida", e ela nunca foi
 * medida sobre o universo — só sobre a watchlist, que é uma amostra escolhida a
 * dedo. Aqui ela é testada sobre os 526 perpétuos, com a mesma máquina.
 */
function comprarDerretida(quedaMinima: number, dias: number) {
  let alvo = 0, stop = 0, prazo = 0;
  const rets: number[] = [];
  const porMoeda = new Map<string, number[]>();

  for (const [sym, v] of series) {
    const fs = fundos.get(sym) ?? [];
    for (let i = 7; i + dias < v.length; i++) {
      const c = v[i].close;
      if (!(c > 0)) continue;
      let pico = 0;
      for (let k = 0; k <= i; k++) if (v[k].high > pico) pico = v[k].high;
      if (!(pico > 0) || c / pico - 1 > -quedaMinima) continue;

      const nStop = c * (1 - 0.25), nAlvo = c * (1 + 0.4);
      let saida = v[i + dias].close, fim = i + dias, motivo = "prazo";
      for (let j = i + 1; j <= i + dias; j++) {
        if (v[j].low <= nStop) { saida = Math.min(v[j].open, nStop); fim = j; motivo = "stop"; break; }
        if (v[j].high >= nAlvo) { saida = Math.max(v[j].open, nAlvo); fim = j; motivo = "alvo"; break; }
      }
      if (motivo === "alvo") alvo++;
      else if (motivo === "stop") stop++;
      else prazo++;

      // Comprado PAGA financiamento positivo, então ele entra subtraído.
      let f = 0;
      for (const x of fs) if (x.t >= v[i].time && x.t < v[fim].time) f += x.r;

      const r = saida / c - 1 - f - 2 * CUSTO;
      rets.push(r);
      const l = porMoeda.get(sym) ?? [];
      l.push(r);
      porMoeda.set(sym, l);
    }
  }

  const n = rets.length || 1;
  const meds = [...porMoeda.values()].filter((l) => l.length >= 2).map(mediana);
  return {
    n: rets.length, alvo: alvo / n, stop: stop / n, prazo: prazo / n,
    media: rets.reduce((s, x) => s + x, 0) / n, med: mediana(rets),
    aFavor: meds.filter((m) => m > 0).length, moedas: meds.length,
  };
}

console.log(
  "\n──────────────── 3. O AVESSO: e comprar a derretida? ────────────────" +
    "\na regra de compra do painel, testada sobre o universo · stop −25% · alvo +40% · 14 dias",
);
console.log(CAB);
for (const [n, q] of [
  ["caiu ≥50% do pico", 0.5], ["caiu ≥70% do pico", 0.7],
  ["caiu ≥85% do pico", 0.85], ["caiu ≥95% do pico", 0.95],
] as const) {
  linha(n, comprarDerretida(q, 14));
}

console.log(
  `\n────────────────────────────────────────────────────────────────────────────\n` +
    `A leitura das três partes juntas é o motivo de o garimpo ser uma FILA DE\n` +
    `INVESTIGAÇÃO e não um emissor de calls: a deriva depois do pump é o sinal mais\n` +
    `forte já medido neste projeto, e ele não sobrevive ao caminho até ele. Se algum\n` +
    `dia sobreviver, é aqui que vai aparecer primeiro.\n`,
);
