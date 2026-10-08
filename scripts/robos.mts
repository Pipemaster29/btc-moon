/**
 * Roda os robôs ao vivo (`lib/robos.ts`) e grava `data/robos.json`.
 *
 * Roda a cada retrato do workflow, mas só faz trabalho quando há o que fazer:
 *
 *   - VELA NOVA: para cada posição aberta, as velas de 1 h fechadas desde a
 *     última percorrida e o financiamento do intervalo. Stop, rastro, prazo e
 *     liquidação disparam DENTRO do caminho, na hora em que aconteceram, mesmo
 *     que o workflow tenha ficado horas sem rodar — ordem parada não pisca.
 *   - DIA NOVO (UTC): o ranking da praça inteira (uma vela diária por moeda,
 *     ~530 requisições de peso 1) e a seleção de cada robô, aberta no preço DE
 *     AGORA. A pesquisa entrava na abertura da meia-noite; o ao vivo entra
 *     quando o retrato roda, e três horas de atraso custaram de +52,8% para
 *     +42,6% na medição — está no preço.
 *
 * O que NÃO acontece: abrir no passado. Um dia inteiro sem retrato vira "dia
 * perdido" e a seleção dele não é feita depois — escolher hoje o que valia
 * ontem seria escolher sabendo o que veio depois.
 *
 * "Não consegui" não vira "não achei" (armadilha nº 2): sem a lista de
 * símbolos ou sem preço, a rodada não grava nada; sem as velas de uma moeda, as
 * posições dela esperam a próxima rodada intactas; com menos de 90% da praça no
 * ranking, a seleção do dia espera a próxima rodada.
 *
 * Rode com: npm run robos
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { comLimite } from "../lib/limite";
import {
  CAPITAL_ROBO,
  DIA,
  HORA,
  ROBOS,
  decidir,
  fechar,
  marcar,
  novoEstado,
  percorrer,
  type ArquivoRobos,
  type Cobranca,
  type EstadoRobo,
  type LinhaRanking,
  type TradeRobo,
  type VelaRobo,
} from "../lib/robos";
import { escapeMarkdown, sendTelegram, telegramFromEnv } from "../lib/telegram";

const BASE = "https://www.binance.com";
const ARQUIVO = "data/robos.json";
const agora = Date.now();

async function pegar<T>(caminho: string, tentativas = 3): Promise<T | null> {
  return comLimite("binance-robos", 16, async () => {
    for (let k = 1; k <= tentativas; k++) {
      try {
        const res = await fetch(`${BASE}${caminho}`, { signal: AbortSignal.timeout(20_000) });
        // 418/429: a Binance pediu para parar. Insistir alonga o banimento e
        // derruba o resto do workflow junto — devolve nulo e a rodada segue.
        if (res.status === 418 || res.status === 429) return null;
        if (res.ok) return (await res.json()) as T;
      } catch {
        // tenta de novo
      }
      await new Promise((r) => setTimeout(r, 500 * k));
    }
    return null;
  });
}

// ------------------------------------------------------------------ o estado

/**
 * ARQUIVO AUSENTE É COMEÇO; ARQUIVO ILEGÍVEL É PARADA. Tratar os dois como
 * "não há estado" faria um JSON truncado recomeçar os três robôs do zero e o
 * `dados.sh gravar` empurrar o recomeço por cima do histórico na branch — a
 * mesma perda silenciosa que o freio de linhas do histórico existe para barrar.
 */
let anterior: ArquivoRobos | null = null;
try {
  anterior = JSON.parse(await readFile(ARQUIVO, "utf8")) as ArquivoRobos;
  if (!Array.isArray(anterior?.robos)) throw new Error("sem a lista de robôs");
} catch (erro) {
  if ((erro as NodeJS.ErrnoException).code !== "ENOENT") {
    console.error(`robôs: ${ARQUIVO} existe e não se lê (${(erro as Error).message}) — nada gravado, para não recomeçar por cima`);
    process.exit(1);
  }
  anterior = null;
}

const porId = new Map((anterior?.robos ?? []).map((e) => [e.id, e]));
const robos: EstadoRobo[] = ROBOS.map((r) => {
  const e = porId.get(r.id);
  if (!e) return novoEstado(r, agora);
  // As regras de ENTRADA seguem o código; cada posição aberta sai pela regra
  // com que entrou, porque stop, rastro e prazo moram nela.
  e.nome = r.nome;
  e.descricao = r.descricao;
  e.regras = r.regras;
  return e;
});
// Robô que saiu do código continua no arquivo, parado: apagar seria perder o histórico dele em silêncio.
const parados = (anterior?.robos ?? []).filter((e) => !ROBOS.some((r) => r.id === e.id));

// ------------------------------------------------------------------ o mercado

interface Simbolo {
  symbol: string;
  status: string;
  contractType: string;
  quoteAsset: string;
  onboardDate: number;
}
const info = await pegar<{ symbols: Simbolo[] }>("/fapi/v1/exchangeInfo");
if (!info?.symbols?.length) {
  console.log("robôs: a Binance não devolveu a lista de símbolos — nada gravado, a próxima rodada tenta de novo");
  process.exit(0);
}
const status = new Map(info.symbols.map((s) => [s.symbol, s.status]));
// Só perpétuo USDT de moeda: os de ação e de metal (`TRADIFI_PERPETUAL`) não entram.
const universo = info.symbols.filter(
  (s) => s.status === "TRADING" && s.contractType === "PERPETUAL" && s.quoteAsset === "USDT",
);

const tickers = await pegar<{ symbol: string; price: string }[]>("/fapi/v1/ticker/price");
const precos = new Map<string, number>();
for (const t of tickers ?? []) {
  const p = Number(t.price);
  if (p > 0 && Number.isFinite(p)) precos.set(t.symbol, p);
}
if (precos.size === 0) {
  console.log("robôs: sem preço da Binance — nada gravado");
  process.exit(0);
}

// As moedas do painel de manipuladas, para marcar as posições delas.
const manipuladas = await readFile("data/panorama.json", "utf8")
  .then((t) => new Set((JSON.parse(t) as { moedas: { symbol: string }[] }).moedas.map((m) => m.symbol)))
  .catch(() => new Set<string>());

// ------------------------------------------------------------------ as saídas

/** A última vela FECHADA que existe agora: a que abriu uma hora antes da hora corrente. */
const ultimaFechada = Math.floor(agora / HORA) * HORA - HORA;

const precisam = new Map<string, { desde: number; fundingDesde: number }>();
for (const e of robos) {
  for (const p of e.abertas) {
    const proxima = p.ultimaVela > 0 ? p.ultimaVela + HORA : Math.floor(p.abertaEm / HORA) * HORA;
    if (proxima > ultimaFechada) continue;
    const atual = precisam.get(p.symbol);
    precisam.set(p.symbol, {
      desde: Math.min(atual?.desde ?? Infinity, proxima),
      fundingDesde: Math.min(atual?.fundingDesde ?? Infinity, p.fundingAte),
    });
  }
}

const caminhos = new Map<string, { velas: VelaRobo[]; cobrancas: Cobranca[] }>();
let semCaminho = 0;
await Promise.all(
  [...precisam.entries()].map(async ([symbol, { desde, fundingDesde }]) => {
    const [kl, fr] = await Promise.all([
      pegar<(string | number)[][]>(`/fapi/v1/klines?symbol=${encodeURIComponent(symbol)}&interval=1h&startTime=${desde}&limit=1000`),
      pegar<{ fundingTime: number; fundingRate: string }[]>(
        `/fapi/v1/fundingRate?symbol=${encodeURIComponent(symbol)}&startTime=${fundingDesde + 1}&limit=1000`,
      ),
    ]);
    // Sem as duas, a posição espera: percorrer sem o financiamento cobraria
    // de menos, e percorrer sem as velas não é percorrer.
    if (!kl || !fr) {
      semCaminho++;
      return;
    }
    const velas = kl
      .filter((k) => Number(k[6]) < agora)
      .map((k) => ({ t: Number(k[0]), o: Number(k[1]), h: Number(k[2]), l: Number(k[3]), c: Number(k[4]) }));
    const cobrancas = fr
      .map((f) => ({ t: Number(f.fundingTime), taxa: Number(f.fundingRate) }))
      .filter((c) => Number.isFinite(c.t) && Number.isFinite(c.taxa));
    caminhos.set(symbol, { velas, cobrancas });
  }),
);

const fechadasAgora = new Map<string, TradeRobo[]>();
for (const e of robos) {
  const lista: TradeRobo[] = [];
  for (const p of [...e.abertas]) {
    const caminho = caminhos.get(p.symbol);
    if (caminho) {
      const s = percorrer(p, caminho.velas, caminho.cobrancas, e);
      if (s) {
        lista.push(fechar(e, p, s));
        continue;
      }
    }
    // Moeda que saiu de negociação: as velas que houve já foram percorridas, e
    // a posição fecha no último preço. Sem isso ela prenderia margem para sempre.
    if (status.get(p.symbol) !== "TRADING") {
      lista.push(fechar(e, p, { preco: precos.get(p.symbol) ?? p.precoAtual, quando: agora, motivo: "sumiu" }));
    }
  }
  fechadasAgora.set(e.id, lista);
}

// ------------------------------------------------------------------ a seleção do dia

const hoje = Math.floor(agora / DIA) * DIA;
const decidem = robos.filter((e) => e.ultimaDecisao === null || e.ultimaDecisao < hoje);
let decidiu = false;
const abertasAgora = new Map<string, number>();

if (decidem.length > 0) {
  const janelas = [...new Set(decidem.flatMap((e) => e.regras.pernas.map((p) => p.janelaDias)))];
  const maior = Math.max(...janelas);
  const linhas: LinhaRanking[] = [];
  let responderam = 0;
  await Promise.all(
    universo.map(async (s) => {
      const kl = await pegar<(string | number)[][]>(
        `/fapi/v1/klines?symbol=${encodeURIComponent(s.symbol)}&interval=1d&limit=${maior + 5}`,
      );
      if (!kl) return;
      responderam++;
      const porDia = new Map(kl.map((k) => [Number(k[0]), k]));
      // O dia que acabou de fechar. Sem ele a moeda não negociou ontem e não entra.
      const ontem = porDia.get(hoje - DIA);
      if (!ontem) return;
      const c = Number(ontem[4]);
      if (!(c > 0)) return;
      const retorno: Record<number, number | null> = {};
      for (const d of janelas) {
        const antes = porDia.get(hoje - DIA - d * DIA);
        const a = antes ? Number(antes[4]) : NaN;
        retorno[d] = a > 0 ? c / a - 1 : null;
      }
      linhas.push({
        symbol: s.symbol,
        retorno,
        volume: Number(ontem[7]),
        idadeDias: s.onboardDate > 0 ? (hoje - HORA - s.onboardDate) / DIA : null,
      });
    }),
  );
  if (responderam < 0.9 * universo.length) {
    console.log(`robôs: só ${responderam} de ${universo.length} moedas responderam ao ranking — a seleção do dia espera a próxima rodada`);
  } else {
    linhas.sort((a, b) => a.symbol.localeCompare(b.symbol));
    for (const e of decidem) {
      if (e.ultimaDecisao !== null) e.diasPerdidos += Math.max(0, Math.round((hoje - e.ultimaDecisao) / DIA) - 1);
      const novas = decidir(e, linhas, (s) => precos.get(s), agora, manipuladas);
      abertasAgora.set(e.id, novas.length);
    }
    decidiu = true;
  }
}

// ------------------------------------------------------------------ a marcação

for (const e of robos) {
  for (const p of e.abertas) {
    const preco = precos.get(p.symbol);
    // O mesmo freio de lixo da carteira: dez vezes de um retrato para o outro não é mercado.
    if (preco !== undefined && preco / p.precoAtual < 10 && p.precoAtual / preco < 10) p.precoAtual = preco;
  }
  marcar(e, agora);
}

// ------------------------------------------------------------------ o relatório

const usd = (v: number) => `US$ ${v.toFixed(2)}`;
const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
console.log(`\nrobôs · ${new Date(agora).toISOString().slice(0, 16).replace("T", " ")} UTC`);
if (semCaminho > 0) console.log(`${semCaminho} moeda(s) sem velas ou financiamento nesta rodada — as posições delas esperam a próxima`);
for (const e of robos) {
  const f = fechadasAgora.get(e.id) ?? [];
  const compradas = e.abertas.filter((p) => p.lado === "long").length;
  console.log(
    `${e.nome.padEnd(15)} ${usd(e.patrimonio).padStart(12)} (${pct(e.patrimonio / CAPITAL_ROBO - 1)}) · ` +
      `queda máx ${pct(e.quedaMaxima)} · ${compradas} comprada(s), ${e.abertas.length - compradas} vendida(s) · ` +
      `${e.fechadas.length} encerrada(s)` +
      (abertasAgora.has(e.id) ? ` · abriu ${abertasAgora.get(e.id)} hoje` : "") +
      (f.length ? ` · fechou ${f.length} agora (${f.map((t) => `${t.symbol.replace(/USDT$/, "")} ${t.motivo} ${usd(t.resultado)}`).join(", ")})` : "") +
      (e.diasPerdidos ? ` · ${e.diasPerdidos} dia(s) perdido(s)` : ""),
  );
}

// ------------------------------------------------------------------ o Telegram

/**
 * UM resumo por dia, depois da seleção, e não um aviso por trade: os três
 * robôs abrem até 13 posições por dia e fecham outras tantas, e trinta
 * notificações diárias no celular fariam o canal inteiro ser silenciado —
 * inclusive os alertas do monitor. A memória do último dia resumido viaja no
 * próprio arquivo, e só é gravada quando o Telegram aceitou.
 */
let resumidoAte = anterior?.resumidoAte;
const telegram = telegramFromEnv();
if (decidiu && telegram && (resumidoAte === undefined || resumidoAte < hoje)) {
  const dia = new Date(hoje).toISOString().slice(0, 10).split("-").reverse().join("/");
  const linhasMsg = robos.map((e) => {
    const n = abertasAgora.get(e.id) ?? 0;
    const ontem = e.fechadas.filter((t) => t.fechadaEm > hoje - DIA);
    const ganho = ontem.reduce((a, t) => a + t.resultado, 0);
    return (
      `${e.nome}: ${usd(e.patrimonio)} (${pct(e.patrimonio / CAPITAL_ROBO - 1)}) · ${e.abertas.length} abertas · ` +
      `abriu ${n} · fechou ${ontem.length} nas últimas 24 h (${usd(ganho)})`
    );
  });
  const texto = [`🤖 Robôs · ${dia}`, "carteiras fictícias · não é recomendação", "", ...linhasMsg].join("\n");
  if (await sendTelegram(telegram, escapeMarkdown(texto))) resumidoAte = hoje;
}

const saida: ArquivoRobos = {
  geradoEm: agora,
  robos: [...robos, ...parados],
  ...(resumidoAte !== undefined ? { resumidoAte } : {}),
};
await mkdir("data", { recursive: true });
await writeFile(ARQUIVO, `${JSON.stringify(saida)}\n`);
console.log(`\n${ARQUIVO} gravado`);
