/**
 * O fluxo da carteira quente da Binance, resumido para a tela.
 *
 * O `npm run fluxo-binance` grava uma linha por moeda por janela — dezenas de
 * linhas por execução, e o arquivo do mês passa de megabytes. A página não pode
 * baixar isso a cada montagem, e não precisa: o que ela mostra é a soma dos
 * últimos dias por moeda, em fração do market cap, com a cobertura de cada dia
 * ao lado. É isso que este módulo monta, e o script grava junto com o bruto.
 *
 * A COBERTURA VIAJA COM O NÚMERO. Um dia lido pela metade soma fluxo de menos, e
 * um dia com faixa perdida é "não li", não "não entrou" (armadilha nº 2). A soma
 * de sete dias sem dizer quantos foram lidos inteiros seria o mesmo silêncio de
 * sempre com outra cara.
 *
 * Unidades: dólares na linha, fração do market cap na tela (0,01 = 1%).
 */

import { lerGuardado } from "./guardado";

/** Como o gravador identificou um token que passou pela quente. */
export interface IdentificacaoFluxo {
  symbol: string;
  decimals: number;
  /** Símbolo do perpétuo (`TAKEUSDT`), ou nulo quando não há ou o preço não bate. */
  perp: string | null;
  /** Unidades do token por contrato: 1000 em `1000XUSDT`. */
  mult: number;
  conferidoEm: number;
  /**
   * A última vez que o token passou pela carteira, em milissegundos. Opcional
   * porque os tokens identificados antes de 23/09 não têm: para eles vale o
   * `conferidoEm`, que é no máximo sete dias mais velho.
   */
  vistoEm?: number;
  /**
   * A primeira passagem que este gravador registrou. É o começo da janela em que
   * a moeda conta na verificação para frente (`medirAdiante`, `lib/emvista.ts`):
   * o dia em que ela chegou não conta, porque é o pump que a trouxe.
   */
  primeiroVisto?: number;
  /**
   * O último perpétuo conferido, que fica quando uma reconferência falha. A
   * moeda que despencou costuma perder a pool mínima logo depois — e com
   * `perp` nulo ela sumia da carteira para `medirAdiante`, que passava a
   * contá-la no "resto" os mesmos dias em que ela já estava nas em vista.
   */
  perpVisto?: string;
}

/** O `data/fluxo-binance.json`: de onde o gravador continua, e quem é quem. */
export interface EstadoFluxo {
  ultimoBloco: number;
  tokens: Record<string, IdentificacaoFluxo>;
  /** Os perpétuos já anunciados no Telegram como em vista (`lib/emvista.ts`). */
  emVista?: { avisadas: string[] };
}

export interface FluxoMoeda {
  /** O perpétuo, `TAKEUSDT`. */
  s: string;
  /** O market cap mais recente lido, em dólares. */
  mcap: number | null;
  /** Compra de varejo na DEX menos venda, pelo executor de swap, em dólares. */
  dex: number;
  /** Depósito direto menos saque, em dólares. */
  dep: number;
  /** Tudo o que passou, nas quatro direções — o tamanho do movimento. */
  bruto: number;
  /** Quantas carteiras distintas depositaram, somadas por janela. */
  depositantes: number;
  /** Saldo da quente no token, na última janela que o leu. */
  saldo: number | null;
  /** O líquido de cada dia, para o desenho de cada linha. */
  porDia: { d: string; dex: number; dep: number }[];
}

export interface FluxoResumo {
  geradoEm: number;
  /** Os dias somados, do mais antigo ao mais novo, com a fração de cada um que foi lida. */
  dias: { d: string; cobertura: number; falhas: number; lacuna: boolean }[];
  /** Quem dominou as transferências na janela mais recente, e se é o executor conhecido. */
  sentinela: { fracao: number; conhecido: boolean } | null;
  moedas: FluxoMoeda[];
}

interface Janela {
  t: number;
  janela: { de: number; ate: number };
  falhas: { entrando: number; saindo: number };
  lacuna: { de: number; ate: number } | null;
  maior?: { fracao: number; conhecido: boolean };
}

interface Linha {
  t: number;
  s: string;
  cmp: number;
  vnd: number;
  dep: number;
  saq: number;
  nDep?: number;
  saldo: number | null;
  mcap: number | null;
}

const DIA = 86_400_000;

/**
 * Soma as linhas gravadas nos últimos `nDias` dias UTC, contando hoje.
 *
 * `segundosPorBloco` vem de fora porque a cobertura é medida em blocos e a
 * janela é de tempo (armadilha nº 8): na BNB Chain são 0,45 s por bloco.
 */
export function resumirFluxo(
  textos: string[],
  agora: number,
  segundosPorBloco: number,
  nDias = 7,
  maxMoedas = 20,
): FluxoResumo {
  const hoje = Math.floor(agora / DIA) * DIA;
  const desde = hoje - (nDias - 1) * DIA;
  const iso = (d: number) => new Date(d).toISOString().slice(0, 10);

  const cobertura = new Map<number, { s: number; falhas: number; lacuna: boolean }>();
  let ultima: Janela | null = null;
  const porMoeda = new Map<string, FluxoMoeda & { tSaldo: number; tMcap: number }>();

  for (const texto of textos) {
    for (const l of texto.split("\n")) {
      if (!l.trim()) continue;
      let o: Janela | Linha;
      try {
        o = JSON.parse(l) as Janela | Linha;
      } catch {
        continue; // linha truncada: perder uma é melhor que perder o resumo
      }
      const dia = Math.floor((o.t * 1000) / DIA) * DIA;
      if ("janela" in o) {
        if (!ultima || o.t >= ultima.t) ultima = o;
        if (dia < desde) continue;
        const c = cobertura.get(dia) ?? { s: 0, falhas: 0, lacuna: false };
        c.s += (o.janela.ate - o.janela.de + 1) * segundosPorBloco;
        c.falhas += o.falhas.entrando + o.falhas.saindo;
        if (o.lacuna) c.lacuna = true;
        cobertura.set(dia, c);
        continue;
      }
      if (!("cmp" in o) || dia < desde) continue;
      const m = porMoeda.get(o.s) ?? {
        s: o.s, mcap: null, dex: 0, dep: 0, bruto: 0, depositantes: 0, saldo: null, porDia: [],
        tSaldo: 0, tMcap: 0,
      };
      // Número que não é número não entra na soma — NaN contamina tudo o que toca
      // (armadilha nº 5), e um `cmp` ausente somaria como zero sem avisar.
      const [cmp, vnd, dep, saq] = [o.cmp, o.vnd, o.dep, o.saq].map((x) => (Number.isFinite(x) ? x : 0));
      m.dex += cmp - vnd;
      m.dep += dep - saq;
      m.bruto += cmp + vnd + dep + saq;
      m.depositantes += o.nDep ?? 0;
      if (o.mcap != null && Number.isFinite(o.mcap) && o.t >= m.tMcap) {
        m.mcap = o.mcap;
        m.tMcap = o.t;
      }
      if (o.saldo != null && Number.isFinite(o.saldo) && o.t >= m.tSaldo) {
        m.saldo = o.saldo;
        m.tSaldo = o.t;
      }
      const d = iso(dia);
      const pd = m.porDia.find((x) => x.d === d);
      if (pd) {
        pd.dex += cmp - vnd;
        pd.dep += dep - saq;
      } else m.porDia.push({ d, dex: cmp - vnd, dep: dep - saq });
      porMoeda.set(o.s, m);
    }
  }

  const dias: FluxoResumo["dias"] = [];
  for (let d = desde; d <= hoje; d += DIA) {
    const c = cobertura.get(d);
    // Hoje conta sobre o que já passou do dia, não sobre 24 horas: às 6h, seis
    // horas lidas são o dia inteiro até aqui.
    const duracao = d === hoje ? Math.max(1, (agora - hoje) / 1000) : 86_400;
    dias.push({
      d: iso(d),
      cobertura: c ? Math.min(1, c.s / duracao) : 0,
      falhas: c?.falhas ?? 0,
      lacuna: c?.lacuna ?? false,
    });
  }

  // A ordem é pelo peso RELATIVO: US$ 1 mi numa moeda de US$ 20 mi é 5% dela; na
  // de US$ 2 bi é ruído. Sem market cap, a moeda vai para o fim, pelo tamanho.
  const peso = (m: FluxoMoeda) => (m.mcap ? (Math.abs(m.dex) + Math.abs(m.dep)) / m.mcap : -1 / (1 + m.bruto));
  const moedas: FluxoMoeda[] = [...porMoeda.values()]
    .map((m) => ({
      s: m.s,
      mcap: m.mcap,
      dex: m.dex,
      dep: m.dep,
      bruto: m.bruto,
      depositantes: m.depositantes,
      saldo: m.saldo,
      porDia: m.porDia.sort((a, b) => a.d.localeCompare(b.d)),
    }))
    .sort((a, b) => peso(b) - peso(a))
    .slice(0, maxMoedas);

  return {
    geradoEm: agora,
    dias,
    sentinela: ultima?.maior ? { fracao: ultima.maior.fracao, conhecido: ultima.maior.conhecido } : null,
    moedas,
  };
}

function valido(d: unknown): FluxoResumo | null {
  const f = d as FluxoResumo;
  return f && Array.isArray(f.moedas) && Array.isArray(f.dias) && typeof f.geradoEm === "number" ? f : null;
}

export async function getFluxo(): Promise<FluxoResumo | null> {
  const g = await lerGuardado<FluxoResumo>("fluxo-binance-resumo.json", valido, 300);
  return g?.dado ?? null;
}
