/**
 * Procura parâmetros que separem melhor do que o estágio sozinho.
 *
 * O backtest mostrou que a fase de vida prevê alguma coisa — exausta sobe,
 * ressuscitando cai, topo cai. Este script pergunta o passo seguinte: existe
 * medida que some a isso em vez de repetir?
 *
 * Só entram candidatos RECONSTRUÍVEIS dia a dia, porque medida que não tem
 * passado não tem como ser testada. Os arquivos de métrica da Binance publicam,
 * a cada cinco minutos e há meses: open interest, razão de contas do varejo,
 * razão de POSIÇÃO das contas grandes e razão de agressão. É daí que sai o
 * candidato mais interessante — baleia realizando lucro é essa razão caindo com
 * o preço ainda em cima, e eu tinha descartado essa ideia por engano, confundindo
 * a razão histórica com a posição absoluta, que só a Gate publica e só por cem
 * horas.
 *
 * Ficam de fora, e é honesto dizer: fria alimentando quente e dispersão entre
 * carteiras exigem saldo histórico por carteira. Isso existe na BNB Chain, via
 * nó de arquivo, mas custa uma chamada por carteira por dia por moeda — e não
 * existe na Base nem na Ethereum, onde vive parte da lista.
 *
 * Rode com: npm run parametros
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fetchCsv, monthlyKlineUrl, dailyKlineUrl, metricsUrl, recentDays } from "../lib/datavision";
import { circulante } from "../lib/binance";
import { parseKlines, parsePositioning } from "../lib/derivatives";
import { classificar, type Estagio } from "../lib/lifecycle";
import { lerTecnica } from "../lib/tecnica";
// A lista CHEIA de propósito, incluindo as aposentadas: para medir a régua,
// moeda morta é amostra tão boa quanto viva — melhor, até, porque é onde os
// estágios finais acontecem. Aposentar existe para poupar requisição no que
// roda de três em três minutos, não para apagar o passado.
import { WATCHLIST } from "../lib/watchlist";

const AQUECIMENTO = 45;
const DIAS_METRICA = 150;
const CACHE = ".cache/parametros.json";

interface Dia {
  dia: string;
  /**
   * Supply circulante ATUAL, repetido em toda a série.
   *
   * É aproximação, e a aproximação tem nome: o circulante histórico não existe
   * em arquivo, só os trinta dias que a REST devolve. Usar o de hoje para trás
   * superestima o market cap dos dias anteriores a um unlock — mas unlock é
   * raro (seis eventos em trinta dias entre quarenta e cinco moedas), e o erro
   * é de nível, não de ordenação entre moedas, que é o que o teste compara.
   */
  circ: number;
  close: number;
  high: number;
  low: number;
  oi: number;
  varejo: number;
  baleias: number;
  taker: number;
}

interface Linha {
  symbol: string;
  dia: string;
  estagio: Estagio;
  queda: number;
  altaDesdeFundo: number;
  /** Variação do open interest em 3 dias. */
  dOi3: number;
  /** Variação da razão de posição das contas grandes em 3 dias. */
  dBaleias3: number;
  baleias: number;
  varejo: number;
  taker: number;
  /** Preço em relação à máxima dos últimos 7 dias. */
  doTopo7: number;
  /** Em tendência de baixa: topos descendentes e preço abaixo da média de 20. */
  emBaixa: boolean;
  /** Rompeu a tendência de baixa hoje. */
  rompeu: boolean;
  /** Distância até a resistência mais próxima acima. */
  ateResistencia: number;
  /** Preço × circulante: o tamanho real da moeda, não o FDV. */
  mcap: number;
  /** Open interest em dólar ÷ market cap. */
  oiSobreMcap: number;
  /** Preço ÷ média de 20 − 1. */
  vsMedia20: number;
  /** Cruzou acima da média de 20 hoje, depois de 10+ dias abaixo. */
  cruzouMedia: boolean;
  /** Fechou acima da máxima dos 20 dias anteriores. */
  rompeuMax20: boolean;
  /** Dias seguidos abaixo da média de 20 antes de hoje. */
  diasAbaixo: number;
  r7: number | null;
  r14: number | null;
}

// ------------------------------------------------------------------ coleta
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

async function coletar(symbol: string): Promise<Dia[]> {
  const circ = (await circulante(symbol).catch(() => null))?.atual ?? 0;
  const dias = recentDays(DIAS_METRICA);

  const [mensais, diarios, metricas] = await Promise.all([
    Promise.all(mesesRecentes().map((m) => fetchCsv(monthlyKlineUrl(symbol, "1d", m)))),
    Promise.all(recentDays(4).map((d) => fetchCsv(dailyKlineUrl(symbol, "1d", d)))),
    Promise.all(dias.map((d) => fetchCsv(metricsUrl(symbol, d)))),
  ]);

  const barras = new Map<string, ReturnType<typeof parseKlines>[0]>();
  for (const csv of [...mensais, ...diarios]) {
    if (!csv) continue;
    for (const b of parseKlines(csv)) {
      barras.set(new Date(b.time * 1000).toISOString().slice(0, 10), b);
    }
  }

  // Do arquivo de métricas interessa a ÚLTIMA leitura do dia: é o estado com
  // que o dia fecha, alinhado com o fechamento da vela.
  const porDia = new Map<string, ReturnType<typeof parsePositioning>[0]>();
  for (const [i, csv] of metricas.entries()) {
    if (!csv) continue;
    const p = parsePositioning(csv).filter((x) => x.openInterest > 0);
    if (p.length) porDia.set(dias[i], p[p.length - 1]);
  }

  return [...barras.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([dia, b]) => {
      const m = porDia.get(dia);
      return {
        dia,
        circ,
        close: b.close,
        high: b.high,
        low: b.low,
        oi: m?.openInterest ?? NaN,
        varejo: m?.accountRatio ?? NaN,
        baleias: m?.topTraderPositionRatio ?? NaN,
        taker: m?.takerRatio ?? NaN,
      };
    });
}

let bruto: Record<string, Dia[]>;
const forcar = process.argv.includes("--recoletar");
const guardado = forcar ? null : await readFile(CACHE, "utf8").catch(() => null);

if (guardado) {
  bruto = JSON.parse(guardado);
  console.log(`lendo de ${CACHE} · ${Object.keys(bruto).length} moedas (use --recoletar para buscar de novo)`);
} else {
  console.log(`coletando… ${WATCHLIST.length + 1} moedas × ${DIAS_METRICA} dias de métrica`);
  const simbolos = [...new Set([...WATCHLIST.map((t) => t.symbol), "LABUSDT"])];
  bruto = {};
  const t0 = Date.now();
  for (const s of simbolos) {
    bruto[s] = await coletar(s).catch(() => []);
    process.stdout.write(`\r  ${Object.keys(bruto).length}/${simbolos.length} · ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  }
  console.log("");
  await mkdir(".cache", { recursive: true });
  await writeFile(CACHE, JSON.stringify(bruto));
}

// -------------------------------------------------------------- montagem
const linhas: Linha[] = [];

for (const [symbol, dias] of Object.entries(bruto)) {
  if (dias.length < AQUECIMENTO + 20) continue;

  for (let i = AQUECIMENTO; i < dias.length - 1; i++) {
    const ate = dias.slice(0, i + 1);
    const hoje = ate[i];
    const preco = hoje.close;

    let pico = ate[0].high;
    let picoI = 0;
    for (const [j, x] of ate.entries()) if (x.high > pico) { pico = x.high; picoI = j; }
    const depois = ate.slice(picoI + 1);
    const fundo = Math.min(preco, ...depois.map((x) => x.low));
    const minimo = Math.min(...ate.map((x) => x.low));

    const { estagio } = classificar({
      queda: preco / pico - 1,
      altaDesdeFundo: fundo > 0 ? preco / fundo - 1 : 0,
      amplitude: minimo > 0 ? pico / minimo : 1,
      diasDesdePico: i - picoI,
      floatCex: null,
    });

    const tres = ate[i - 3];
    const max7 = Math.max(...ate.slice(-7).map((x) => x.high));
    const velas = ate.map((x) => ({ close: x.close, high: x.high, low: x.low }));
    const tec = lerTecnica(velas);

    // Definições mais frouxas, para ter amostra: a rígida deu 24 observações em
    // seis mil, e com isso não se mede nada.
    const m20 = (n: number) => {
      const t = velas.slice(Math.max(0, velas.length - n - 1), velas.length - 1);
      return t.length ? t.reduce((s2, v) => s2 + v.close, 0) / t.length : NaN;
    };
    const mediaHoje = velas.slice(-20).reduce((s2, v) => s2 + v.close, 0) / Math.min(20, velas.length);
    let diasAbaixo = 0;
    for (let k = velas.length - 2; k >= 20; k--) {
      const m = velas.slice(k - 19, k + 1).reduce((s2, v) => s2 + v.close, 0) / 20;
      if (velas[k].close < m) diasAbaixo++;
      else break;
    }
    const cruzouMedia = preco > mediaHoje && diasAbaixo >= 10;
    const max20 = Math.max(...ate.slice(-21, -1).map((x) => x.high));

    linhas.push({
      symbol,
      dia: hoje.dia,
      estagio,
      queda: preco / pico - 1,
      altaDesdeFundo: fundo > 0 ? preco / fundo - 1 : 0,
      dOi3: tres && tres.oi > 0 && hoje.oi > 0 ? hoje.oi / tres.oi - 1 : NaN,
      dBaleias3: tres && tres.baleias > 0 && hoje.baleias > 0 ? hoje.baleias / tres.baleias - 1 : NaN,
      baleias: hoje.baleias,
      varejo: hoje.varejo,
      taker: hoje.taker,
      doTopo7: max7 > 0 ? preco / max7 - 1 : NaN,
      mcap: hoje.circ > 0 ? preco * hoje.circ : NaN,
      oiSobreMcap:
        hoje.circ > 0 && Number.isFinite(hoje.oi) && preco > 0
          ? (hoje.oi * preco) / (preco * hoje.circ)
          : NaN,
      emBaixa: tec?.emBaixa ?? false,
      rompeu: tec?.rompeu ?? false,
      ateResistencia: tec?.ateResistencia ?? NaN,
      vsMedia20: tec?.vsMedia20 ?? NaN,
      cruzouMedia,
      rompeuMax20: Number.isFinite(max20) && preco > max20,
      diasAbaixo,
      r7: i + 7 < dias.length ? dias[i + 7].close / preco - 1 : null,
      r14: i + 14 < dias.length ? dias[i + 14].close / preco - 1 : null,
    });
  }
}

// -------------------------------------------------------------- avaliação
const mediana = (xs: number[]) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const pct = (v: number) => (Number.isFinite(v) ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%` : "—");

const comMetrica = linhas.filter((l) => Number.isFinite(l.baleias));
console.log(
  `\n${linhas.length.toLocaleString("pt-BR")} observações · ` +
    `${comMetrica.length.toLocaleString("pt-BR")} com métrica de posicionamento\n`,
);

interface Candidato {
  nome: string;
  descricao: string;
  testa: (l: Linha) => boolean;
}

const candidatos: Candidato[] = [
  {
    nome: "baleias reduzindo",
    descricao: "razão de posição das contas grandes caiu mais de 10% em 3 dias",
    testa: (l) => l.dBaleias3 <= -0.1,
  },
  {
    nome: "baleias reduzindo no topo",
    descricao: "o mesmo, com o preço a menos de 5% da máxima de 7 dias",
    testa: (l) => l.dBaleias3 <= -0.1 && l.doTopo7 >= -0.05,
  },
  {
    nome: "baleias carregando",
    descricao: "razão das contas grandes subiu mais de 10% em 3 dias",
    testa: (l) => l.dBaleias3 >= 0.1,
  },
  {
    nome: "OI inflando",
    descricao: "open interest cresceu mais de 20% em 3 dias",
    testa: (l) => l.dOi3 >= 0.2,
  },
  {
    nome: "OI desinflando",
    descricao: "open interest caiu mais de 20% em 3 dias",
    testa: (l) => l.dOi3 <= -0.2,
  },
  {
    nome: "varejo comprado",
    descricao: "razão de contas do varejo acima de 1,5",
    testa: (l) => l.varejo >= 1.5,
  },
  {
    nome: "varejo vendido",
    descricao: "razão de contas do varejo abaixo de 0,7",
    testa: (l) => l.varejo <= 0.7,
  },
  {
    nome: "divergência",
    descricao: "varejo comprando enquanto as contas grandes reduzem",
    testa: (l) => l.varejo >= 1.2 && l.dBaleias3 <= -0.05,
  },
  {
    nome: "rompeu tendência de baixa",
    descricao: "fechou acima do último topo, vindo de topos descendentes",
    testa: (l) => l.rompeu,
  },
  {
    nome: "em tendência de baixa",
    descricao: "topos descendentes e preço abaixo da média de 20",
    testa: (l) => l.emBaixa,
  },
  {
    nome: "rompeu e é manipulável",
    descricao: "rompeu a baixa numa moeda de float pequeno — o cruzamento sugerido",
    testa: (l) => l.rompeu && l.dOi3 >= 0.1,
  },
  {
    nome: "market cap acima de 100 mi",
    descricao: "moeda grande — mais lugar para cair, se a tese estiver certa",
    testa: (l) => l.mcap >= 100e6,
  },
  {
    nome: "market cap abaixo de 30 mi",
    descricao: "moeda pequena — pouco espaço para o short capturar",
    testa: (l) => Number.isFinite(l.mcap) && l.mcap <= 30e6,
  },
  {
    nome: "OI acima de 20% do market cap",
    descricao: "aposta no perpétuo grande perto do tamanho da moeda",
    testa: (l) => l.oiSobreMcap >= 0.2,
  },
  {
    nome: "cruzou a média de 20",
    descricao: "fechou acima da média de 20 depois de 10+ dias abaixo dela",
    testa: (l) => l.cruzouMedia,
  },
  {
    nome: "rompeu máxima de 20 dias",
    descricao: "fechou acima da máxima dos 20 dias anteriores",
    testa: (l) => l.rompeuMax20,
  },
  {
    nome: "rompeu máxima vindo de baixa",
    descricao: "o mesmo, mas depois de 10+ dias abaixo da média — o giro de tendência",
    testa: (l) => l.rompeuMax20 && l.diasAbaixo >= 10,
  },
  {
    nome: "colado na resistência",
    descricao: "a menos de 3% do topo anterior mais próximo",
    testa: (l) => Number.isFinite(l.ateResistencia) && l.ateResistencia <= 0.03,
  },
  {
    nome: "esticado da média",
    descricao: "mais de 30% acima da média de 20 dias",
    testa: (l) => l.vsMedia20 >= 0.3,
  },
  {
    nome: "agressão vendedora",
    descricao: "razão de agressão abaixo de 0,9",
    testa: (l) => l.taker <= 0.9,
  },
];

function embaralhamento(dentro: boolean[], retornos: (number | null)[], sorteios = 500): number {
  const pares = dentro.map((d, i) => ({ d, r: retornos[i] })).filter((x) => x.r !== null) as { d: boolean; r: number }[];
  const dif = (marcas: boolean[]) => {
    let a = 0, na = 0, b = 0, nb = 0;
    for (const [i, p] of pares.entries()) {
      if (marcas[i]) { a += p.r; na++; } else { b += p.r; nb++; }
    }
    return na && nb ? a / na - b / nb : 0;
  };
  const real = dif(pares.map((p) => p.d));
  let extremos = 0;
  for (let k = 0; k < sorteios; k++) {
    const m = pares.map((p) => p.d);
    for (let i = m.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [m[i], m[j]] = [m[j], m[i]];
    }
    if (Math.abs(dif(m)) >= Math.abs(real)) extremos++;
  }
  return extremos / sorteios;
}

console.log(`candidato                     obs   7d dentro   7d fora    dif      p      moedas`);
for (const c of candidatos) {
  const dentro = comMetrica.filter(c.testa);
  const fora = comMetrica.filter((l) => !c.testa(l));
  if (dentro.length < 50) {
    console.log(`${c.nome.padEnd(28)} ${String(dentro.length).padStart(5)}   amostra pequena demais`);
    continue;
  }

  const rd = dentro.map((l) => l.r7).filter((r): r is number => r !== null);
  const rf = fora.map((l) => l.r7).filter((r): r is number => r !== null);

  const porMoeda = new Map<string, number[]>();
  for (const l of dentro) if (l.r7 !== null) porMoeda.set(l.symbol, [...(porMoeda.get(l.symbol) ?? []), l.r7]);
  const medianas = [...porMoeda.values()].filter((rs) => rs.length >= 5).map(mediana);
  const concordam = medianas.filter((m) => (mediana(rd) > mediana(rf) ? m > 0 : m < 0)).length;

  const p = embaralhamento(comMetrica.map(c.testa), comMetrica.map((l) => l.r7));

  console.log(
    `${c.nome.padEnd(28)} ${String(dentro.length).padStart(5)} ${pct(mediana(rd)).padStart(10)} ` +
      `${pct(mediana(rf)).padStart(9)} ${((mediana(rd) - mediana(rf)) * 100).toFixed(1).padStart(6)}pp ` +
      `${p.toFixed(3).padStart(6)}   ${concordam}/${medianas.length}`,
  );
}

console.log(`\ndescrição dos candidatos:`);
for (const c of candidatos) console.log(`  ${c.nome.padEnd(28)} ${c.descricao}`);

// ------------------------------------------------- correção por comparações
//
// Nove candidatos testados contra o mesmo conjunto. Com nove tentativas, um
// p de 0,02 é mais ou menos o que o acaso entrega de graça — a chance de pelo
// menos um dos nove parecer significativo por sorte é de 37%. O corte honesto
// divide o limiar pelo número de tentativas.
console.log(`\n--- corrigindo para ${candidatos.length} candidatos testados ---`);
console.log(`limiar de 5% vira ${(0.05 / candidatos.length).toFixed(4)} (Bonferroni)`);
console.log(`chance de ao menos um dos ${candidatos.length} parecer significativo por acaso: ${((1 - Math.pow(0.95, candidatos.length)) * 100).toFixed(0)}%`);

// -------------------------------------------- o candidato SOMA ao estágio?
//
// A pergunta que interessa não é "este sinal prevê?", e sim "ele prevê algo que
// o estágio já não previa?". Um sinal que só aparece dentro de "no topo" não
// acrescenta nada — ele é o estágio com outro nome.
console.log(`\n--- dentro de cada estágio, o candidato ainda separa? (7 dias) ---`);
console.log(`estágio          candidato                    n    com     sem     dif      p    moedas`);

const focos: Estagio[] = ["no topo", "exausta", "ressuscitando", "caindo do topo"];
const promissores = candidatos.filter((c) =>
  [
    "baleias reduzindo no topo", "OI inflando", "OI desinflando", "varejo comprado",
    "rompeu tendência de baixa", "esticado da média", "colado na resistência",
    "cruzou a média de 20", "rompeu máxima de 20 dias", "rompeu máxima vindo de baixa",
    "market cap acima de 100 mi", "market cap abaixo de 30 mi", "OI acima de 20% do market cap",
  ].includes(c.nome),
);

for (const est of focos) {
  const base = comMetrica.filter((l) => l.estagio === est);
  for (const c of promissores) {
    const com = base.filter(c.testa).map((l) => l.r7).filter((r): r is number => r !== null);
    const sem = base.filter((l) => !c.testa(l)).map((l) => l.r7).filter((r): r is number => r !== null);
    if (com.length < 25) continue;

    // Embaralhar DENTRO do estágio: a pergunta é se o candidato separa entre
    // observações que já compartilham a mesma fase, e não se a fase separa.
    const pCond = embaralhamento(base.map(c.testa), base.map((l) => l.r7), 1000);

    // Quantas moedas, uma a uma, apontam para o mesmo lado.
    const porMoedaC = new Map<string, number[]>();
    for (const l of base.filter(c.testa)) {
      if (l.r7 !== null) porMoedaC.set(l.symbol, [...(porMoedaC.get(l.symbol) ?? []), l.r7]);
    }
    const meds = [...porMoedaC.values()].filter((rs) => rs.length >= 3).map(mediana);
    const alvo = mediana(com) - mediana(sem);
    const concordam = meds.filter((m) => (alvo < 0 ? m < mediana(sem) : m > mediana(sem))).length;

    console.log(
      `${est.padEnd(16)} ${c.nome.padEnd(28)} ${String(com.length).padStart(4)} ` +
        `${pct(mediana(com)).padStart(7)} ${pct(mediana(sem)).padStart(7)} ` +
        `${(alvo * 100).toFixed(1).padStart(6)}pp ${pCond.toFixed(3).padStart(6)} ` +
        `${concordam}/${meds.length}`,
    );
  }
}
