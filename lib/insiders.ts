/**
 * OS CRIADORES E OS VCs: para onde vai o supply que nasceu nas mãos deles, e
 * quando ele chega numa corretora. Pedido do usuário em 09/11: "ver o on-chain
 * dos criadores e VC".
 *
 * `lib/detentores.ts` já diz QUEM recebeu o supply na gênese e quanto ainda
 * segura, e `lib/vesting.ts`, se os cofres estão pingando. O que faltava é o
 * passo seguinte, que é o que decide o preço: o que saiu foi para onde? Token
 * que sai do cofre para outra carteira do time continua fora do mercado; o que
 * cai num endereço de depósito de corretora está a um clique de virar venda.
 *
 * QUEM É INSIDER, em dois níveis: o nível 0 são os donos da gênese; o nível 1,
 * quem recebeu deles 0,1% do supply ou mais. Não há nomes — a cadeia não diz
 * quem é "time" e quem é "VC" —, há a relação: recebeu direto de quem recebeu o
 * supply inteiro.
 *
 * O ENDEREÇO DE DEPÓSITO É RECONHECIDO PELO COMPORTAMENTO. Ninguém deposita na
 * carteira fria da corretora: o depósito cai num endereço por cliente, que a
 * corretora varre para a carteira quente. Então o destino é "corretora" quando
 * tem etiqueta pública (`data/corretoras-rotuladas.json`) OU quando 80% ou mais
 * do que ele mandou adiante foi para endereço com etiqueta. Na JCT, um dono da
 * gênese mandou duas transferências de 10 mil tokens e depois 1,34 bilhão —
 * 3,4% do supply — para o mesmo endereço sem etiqueta nenhuma: o teste antes do
 * depósito.
 *
 * E QUEM DISTRIBUI A MAIS DE 50 DESTINOS É INFRAESTRUTURA — ponte, contrato de
 * staking, contrato de airdrop, carteira quente sem etiqueta. Não é insider e
 * as saídas dele não são seguidas: seguir a ponte contaria como "depósito do
 * time" todo usuário que sacou dela para uma corretora.
 *
 * A medição está em `docs/preregistro-insiders.md`. Este arquivo é puro e não
 * importa nada de `node:`: a página e os testes o usam.
 */

/** Os pisos da leitura, como estão no pré-registro. Tudo em fração do SUPPLY, salvo onde diz. */
export const PISOS = {
  /** Recebeu do nível 0, somado, isto ou mais: é nível 1. */
  nivel1: 0.001,
  /** Transferência a partir daqui é guardada e o destino dela é investigado. */
  fluxo: 0.0002,
  /** Fração do que o endereço mandou adiante que foi para corretora com etiqueta: daqui para cima é endereço de depósito. */
  deposito: 0.8,
  /** O dia em que os insiders mandam isto ou mais para corretora (ou market maker) é um evento. */
  evento: 0.001,
  /** No máximo estes no nível 1, os que mais receberam. */
  maximoNoNivel1: 40,
  /** Mais destinos distintos que isto e o endereço é infraestrutura, não insider. */
  destinosDeInfraestrutura: 50,
  /** Dias entre dois eventos do mesmo tipo na mesma moeda. */
  episodioDias: 7,
} as const;

export type ClasseDoDestino = "corretora" | "marketmaker" | "pool" | "insider" | "queima" | "infraestrutura" | "outro";

/** Uma transferência do token, com o valor já em fração do supply. */
export interface Transferencia {
  bloco: number;
  tx: string;
  de: string;
  para: string;
  /** Fração do supply. */
  fracao: number;
}

/** O que se sabe de um endereço por fora da cadeia: a etiqueta pública. Endereços em minúsculas. */
export interface Rotulos {
  /** O nome da corretora, ou nulo. */
  corretora(endereco: string): string | null;
  /** O nome da firma, ou nulo. */
  marketMaker(endereco: string): string | null;
  pool(endereco: string): boolean;
}

const QUEIMA = new Set(["0x0000000000000000000000000000000000000000", "0x000000000000000000000000000000000000dead"]);

/** A classe que a ETIQUETA dá a um endereço, ou nulo quando ela não diz nada. */
export function classePelaEtiqueta(endereco: string, r: Rotulos): { classe: ClasseDoDestino; nome?: string } | null {
  if (QUEIMA.has(endereco)) return { classe: "queima" };
  const c = r.corretora(endereco);
  if (c) return { classe: "corretora", nome: c };
  const m = r.marketMaker(endereco);
  if (m) return { classe: "marketmaker", nome: m };
  if (r.pool(endereco)) return { classe: "pool" };
  return null;
}

/**
 * Os destinos que precisam ter as SAÍDAS lidas para serem classificados: sem
 * etiqueta, fora de `conhecidos`, e que receberam das origens uma transferência
 * de `PISOS.fluxo` ou mais, ou `PISOS.nivel1` somado.
 */
export function aInvestigar(saidasDasOrigens: readonly Transferencia[], conhecidos: ReadonlySet<string>, r: Rotulos): string[] {
  const total = new Map<string, number>();
  const maior = new Map<string, number>();
  for (const t of saidasDasOrigens) {
    if (conhecidos.has(t.para) || classePelaEtiqueta(t.para, r)) continue;
    total.set(t.para, (total.get(t.para) ?? 0) + t.fracao);
    maior.set(t.para, Math.max(maior.get(t.para) ?? 0, t.fracao));
  }
  return [...total.keys()].filter((e) => (maior.get(e) ?? 0) >= PISOS.fluxo || (total.get(e) ?? 0) >= PISOS.nivel1);
}

/** O que as saídas de um endereço dizem dele. */
export interface PerfilDeSaida {
  /** Fração do supply que ele mandou adiante. */
  saiu: number;
  /** Quanto disso foi para endereço com etiqueta de corretora, e para qual mais. */
  paraCorretora: number;
  corretora: string | null;
  destinos: number;
}

export function perfilDeSaida(saidas: readonly Transferencia[], r: Rotulos): PerfilDeSaida {
  let saiu = 0;
  let paraCorretora = 0;
  const porCorretora = new Map<string, number>();
  const destinos = new Set<string>();
  for (const t of saidas) {
    saiu += t.fracao;
    destinos.add(t.para);
    const c = r.corretora(t.para);
    if (c) {
      paraCorretora += t.fracao;
      porCorretora.set(c, (porCorretora.get(c) ?? 0) + t.fracao);
    }
  }
  const maior = [...porCorretora].sort((x, y) => y[1] - x[1])[0];
  return { saiu, paraCorretora, corretora: maior?.[0] ?? null, destinos: destinos.size };
}

/**
 * Classifica um endereço SEM etiqueta pelo que ele fez com o token: endereço de
 * depósito (repassou 80% ou mais a corretora com etiqueta), infraestrutura
 * (mais de 50 destinos) ou nada disso. `saidas` são TODAS as transferências que
 * ele enviou; sem nenhuma, não há o que dizer — "não mandou nada adiante" não é
 * "não é depósito", e ele fica como "outro".
 */
export function classePeloComportamento(saidas: readonly Transferencia[], r: Rotulos): { classe: "corretora" | "infraestrutura" | "outro"; nome?: string } {
  const p = perfilDeSaida(saidas, r);
  if (p.saiu > 0 && p.paraCorretora / p.saiu >= PISOS.deposito) return { classe: "corretora", nome: p.corretora ?? undefined };
  if (p.destinos > PISOS.destinosDeInfraestrutura) return { classe: "infraestrutura" };
  return { classe: "outro" };
}

/**
 * O nível 1: quem recebeu do nível 0, somado, `PISOS.nivel1` ou mais, não tem
 * etiqueta e não é depósito nem infraestrutura (`classes`, dos investigados).
 * Os `PISOS.maximoNoNivel1` que mais receberam.
 */
export function nivel1De(saidasDoNivel0: readonly Transferencia[], nivel0: ReadonlySet<string>, classes: ReadonlyMap<string, { classe: ClasseDoDestino }>, r: Rotulos): string[] {
  const total = new Map<string, number>();
  for (const t of saidasDoNivel0) {
    if (nivel0.has(t.para) || classePelaEtiqueta(t.para, r)) continue;
    const c = classes.get(t.para)?.classe;
    if (c === "corretora" || c === "infraestrutura") continue;
    total.set(t.para, (total.get(t.para) ?? 0) + t.fracao);
  }
  return [...total]
    .filter(([, v]) => v >= PISOS.nivel1)
    .sort((x, y) => y[1] - x[1])
    .slice(0, PISOS.maximoNoNivel1)
    .map(([e]) => e);
}

/** Um fluxo de insider já classificado, com a hora. */
export interface Fluxo {
  /** Segundos desde 1970 (o instante do bloco). */
  t: number;
  bloco: number;
  tx: string;
  de: string;
  /** 0 = dono da gênese, 1 = recebeu de um. */
  nivel: 0 | 1;
  para: string;
  classe: ClasseDoDestino;
  /** A corretora ou a firma, quando o destino é uma. */
  nome?: string;
  /** Verdadeiro quando a corretora foi reconhecida pelo comportamento (endereço de depósito), e não pela etiqueta. */
  porComportamento?: boolean;
  fracao: number;
}

/** Um evento do pré-registro: o dia em que os insiders mandaram `PISOS.evento` ou mais para corretora ou market maker. */
export interface Evento {
  tipo: "corretora" | "marketmaker";
  /** O dia UTC, em milissegundos (00:00). */
  dia: number;
  fracao: number;
}

const DIA_S = 86_400;

/**
 * Os eventos de um tipo: soma por dia UTC, o piso, e um por episódio — depois
 * de um evento, a moeda só volta a ter outro do mesmo tipo `PISOS.episodioDias`
 * depois. Fluxo sem hora legível fica de fora (não há dia para ele).
 */
export function eventosDe(fluxos: readonly Fluxo[], tipo: Evento["tipo"]): Evento[] {
  const porDia = new Map<number, number>();
  for (const f of fluxos) {
    if (f.classe !== tipo || !Number.isFinite(f.t) || !(f.t > 0)) continue;
    const dia = Math.floor(f.t / DIA_S) * DIA_S * 1000;
    porDia.set(dia, (porDia.get(dia) ?? 0) + f.fracao);
  }
  const out: Evento[] = [];
  for (const [dia, fracao] of [...porDia].sort((x, y) => x[0] - y[0])) {
    if (fracao < PISOS.evento) continue;
    const ultimo = out[out.length - 1];
    if (ultimo && dia - ultimo.dia < PISOS.episodioDias * DIA_S * 1000) continue;
    out.push({ tipo, dia, fracao });
  }
  return out;
}

/** O resumo de uma moeda para a tela: quanto os insiders mandaram para cada tipo de destino. Frações do supply. */
export interface ResumoDeInsiders {
  paraCorretora: number;
  paraMarketMaker: number;
  paraPool: number;
  queimado: number;
  paraInfraestrutura: number;
  paraOutros: number;
  /** As corretoras que mais receberam, com a fração de cada uma. */
  corretoras: { nome: string; fracao: number }[];
  /** O último fluxo para corretora, se houve. */
  ultimoDeposito: { t: number; fracao: number; nome?: string } | null;
  /** Quanto foi para corretora nos últimos 30 dias contados de `agoraS`. */
  paraCorretora30d: number;
}

export function resumir(fluxos: readonly Fluxo[], agoraS: number): ResumoDeInsiders {
  const r: ResumoDeInsiders = { paraCorretora: 0, paraMarketMaker: 0, paraPool: 0, queimado: 0, paraInfraestrutura: 0, paraOutros: 0, corretoras: [], ultimoDeposito: null, paraCorretora30d: 0 };
  const porCorretora = new Map<string, number>();
  for (const f of fluxos) {
    // Entre insiders o token não saiu de casa: não é destino.
    if (f.classe === "insider") continue;
    if (f.classe === "corretora") {
      r.paraCorretora += f.fracao;
      const nome = f.nome ?? "sem nome";
      porCorretora.set(nome, (porCorretora.get(nome) ?? 0) + f.fracao);
      if (!r.ultimoDeposito || f.t > r.ultimoDeposito.t) r.ultimoDeposito = { t: f.t, fracao: f.fracao, ...(f.nome ? { nome: f.nome } : {}) };
      if (agoraS - f.t <= 30 * DIA_S) r.paraCorretora30d += f.fracao;
    } else if (f.classe === "marketmaker") r.paraMarketMaker += f.fracao;
    else if (f.classe === "pool") r.paraPool += f.fracao;
    else if (f.classe === "queima") r.queimado += f.fracao;
    else if (f.classe === "infraestrutura") r.paraInfraestrutura += f.fracao;
    else r.paraOutros += f.fracao;
  }
  r.corretoras = [...porCorretora].sort((x, y) => y[1] - x[1]).slice(0, 5).map(([nome, fracao]) => ({ nome, fracao }));
  return r;
}

/**
 * O texto dos avisos de uma rodada: os fluxos NOVOS para corretora ou market
 * maker, somados por destino, a partir de `PISOS.evento`. Diz que não há
 * medição — a amostra não alcança o critério — para o aviso não virar call.
 */
export function avisosDe(symbol: string, novos: readonly Fluxo[]): string[] {
  const soma = new Map<string, { classe: "corretora" | "marketmaker"; nome: string; fracao: number; porComportamento: boolean }>();
  for (const f of novos) {
    if (f.classe !== "corretora" && f.classe !== "marketmaker") continue;
    const nome = f.nome ?? (f.classe === "corretora" ? "corretora" : "market maker");
    const k = `${f.classe}:${nome}`;
    const x = soma.get(k) ?? { classe: f.classe, nome, fracao: 0, porComportamento: false };
    x.fracao += f.fracao;
    x.porComportamento ||= f.porComportamento === true;
    soma.set(k, x);
  }
  const ticker = symbol.replace(/USDT$/, "");
  const out: string[] = [];
  for (const x of soma.values()) {
    if (x.fracao < PISOS.evento) continue;
    const pct = `${(x.fracao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% do supply`;
    out.push(
      x.classe === "corretora"
        ? `🏦 ${ticker} · carteiras de criadores ou VCs mandaram ${pct} para a ${x.nome}${x.porComportamento ? " (endereço de depósito, reconhecido pela varredura)" : ""}. Token de quem recebeu o supply na gênese chegando em corretora. Sem medição de que isto anteceda queda: a amostra não alcança o critério.`
        : `🤝 ${ticker} · carteiras de criadores ou VCs mandaram ${pct} para a ${x.nome}, market maker. Sem medição de que isto anteceda alta ou queda.`,
    );
  }
  return out;
}

/** A leitura de uma moeda, como `scripts/insiders.mts` grava. */
export interface LeituraDeInsiders {
  symbol: string;
  chain: string;
  contrato: string;
  /** Até que bloco a leitura vai, e quando foi feita (ms). */
  ate: number;
  lidaEm: number;
  /** As faixas de bloco que nenhum nó entregou. Acima de zero a leitura NÃO é completa, e a moeda fica fora da medição. */
  faixasPerdidas: number;
  nivel0: string[];
  nivel1: string[];
  /** Os endereços de depósito reconhecidos pelo comportamento, com a corretora. */
  depositos: Record<string, string>;
  /** Os endereços tratados como infraestrutura. */
  infraestrutura: string[];
  /** Os fluxos de `PISOS.fluxo` ou mais dos insiders, em ordem de tempo. */
  fluxos: Fluxo[];
  /** A soma dos fluxos menores que `PISOS.fluxo`, por classe do destino conhecida pela etiqueta; o resto em "outro". */
  miudos: Partial<Record<ClasseDoDestino, number>>;
  eventos: Evento[];
  resumo: ResumoDeInsiders;
  /** Quando a vida inteira foi lida pela última vez (ms). Entre uma e outra, a leitura anda só para frente (`scripts/insiders.mts --rodada`). */
  completaEm?: number;
  /**
   * Destinos sem etiqueta que receberam e AINDA NÃO MANDARAM NADA ADIANTE, com o
   * bloco em que receberam: o depósito só é reconhecido quando a corretora varre
   * o endereço, e a varredura pode vir horas depois da leitura. Eles são olhados
   * de novo a cada rodada, por 7 dias.
   */
  pendentes?: Record<string, number>;
}

/** O que `scripts/insiders.mts` grava em `data/insiders.json`. */
export interface ArquivoInsiders {
  geradoEm: number;
  /** As moedas que a leitura não alcança, com o porquê — "não consegui" escrito. */
  fora: Record<string, string>;
  moedas: Record<string, LeituraDeInsiders>;
}

/** O que `scripts/medir-insiders.mts` grava em `data/insiders-medicao.json`. */
export interface MedicaoInsiders {
  geradoEm: number;
  janela: { de: number; ate: number };
  moedas: string[];
  foraDaMedicao: Record<string, string>;
  eventos: {
    tipo: Evento["tipo"];
    n: number;
    moedas: number;
    /** Por horizonte em dias: a média do retorno relativo (fração), o t e as metades. */
    horizontes: { dias: number; n: number; media: number; mediana: number; t: number; metades: [number, number]; semAMaior: number }[];
    veredito: { passa: boolean; texto: string };
  }[];
}

/** A leitura guardada, pela regra de camadas da página (`lib/guardado.ts`). */
export async function getInsiders(): Promise<ArquivoInsiders | null> {
  const { lerGuardado } = await import("./guardado");
  const valido = (d: unknown) => (typeof (d as ArquivoInsiders)?.moedas === "object" && (d as ArquivoInsiders).moedas !== null ? (d as ArquivoInsiders) : null);
  // O do robô (branch `dados`) e, enquanto ele não gravou o primeiro, a semente lida à mão que mora no `main`.
  const g = (await lerGuardado<ArquivoInsiders>("insiders.json", valido, 600)) ?? (await lerGuardado<ArquivoInsiders>("insiders-semente.json", valido, 3600));
  return g?.dado ?? null;
}

export async function getMedicaoInsiders(): Promise<MedicaoInsiders | null> {
  const { lerGuardado } = await import("./guardado");
  const g = await lerGuardado<MedicaoInsiders>("insiders-medicao.json", (d) => (Array.isArray((d as MedicaoInsiders)?.eventos) ? (d as MedicaoInsiders) : null), 3600);
  return g?.dado ?? null;
}
