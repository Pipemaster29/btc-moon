/**
 * O arquivo: guardar hoje o que a fonte apaga amanhã.
 *
 * O projeto inteiro lê de fonte pública e sem chave, e isso continua valendo —
 * a restrição é sobre de onde o DADO vem, não sobre onde ele é guardado depois.
 * Este módulo é a segunda metade: o que a Binance serve por 31 dias fica aqui
 * para sempre.
 *
 * ============================================================== POR QUE EXISTE
 *
 * O salto de open interest é o único sinal deste projeto que separa para cima:
 * 26,0% de chance de pump [17,5, 33,7] contra base de 7,1%, monotônico e estável
 * nas duas metades da janela (`lib/antecipar.ts`). E ele está medido sobre 31
 * dias, porque 31 dias é tudo o que `openInterestHist` devolve — testado com
 * `limit=500`, que traz 31 pontos. Nenhum arquivo do Data Vision tem a coluna.
 *
 * Isso deixa o achado mais útil daqui preso numa janela que anda sozinha: o
 * número de hoje é do regime de agosto e setembro de 2026, e não há como testá-lo
 * em 2024 nem em mercado de alta. A única saída é começar a guardar agora, e em
 * três meses a medição tem três meses.
 *
 * ======================================================= AS REGRAS DA CASA AQUI
 *
 * NADA AQUI PODE DERRUBAR O QUE JÁ FUNCIONA. O `data/historico-*.jsonl` continua
 * sendo gravado, o painel continua lendo do GitHub raw, e o arquivo é um caminho
 * A MAIS. Se o Supabase estiver fora, pausado ou sem chave, tudo continua como
 * antes — as funções devolvem nulo e quem chama segue.
 *
 * E NULO É RESPOSTA, NÃO ZERO. `arquivoDisponivel()` devolve `false` quando não
 * há credencial, e as leituras devolvem `null` quando a consulta falhou. Um
 * `catch` que devolvesse lista vazia faria uma medição rodar sobre nada e
 * imprimir um número — que é a armadilha nº 2 do AGENTS.md chegando por uma
 * porta nova.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Um dia de open interest e a vela do mesmo dia. */
export interface DiaArquivado {
  symbol: string;
  dia: string;
  open_interest: number;
  abertura: number | null;
  maxima: number | null;
  minima: number | null;
  fechamento: number | null;
  volume: number | null;
}

/** Uma emissão do painel, como ela esteve na tela. */
export interface EmissaoArquivada {
  symbol: string;
  t: string;
  preco: number;
  liquidez: number | null;
  oi_usd: number | null;
  dominancia: number | null;
  varejo: number | null;
  baleias: number | null;
  saida: number | null;
  estagio: string | null;
  vies: string | null;
  nota: number | null;
  float_cex: number | null;
  float_token: number | null;
  market_cap: number | null;
  funding: number | null;
}

/**
 * A chave de ESCRITA, que é a de serviço e ignora RLS.
 *
 * Ela não é a mesma do navegador. `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` só lê —
 * é ela que a página usa e pode aparecer no HTML sem problema. A de serviço
 * escreve, nunca sai do servidor, e mora no GitHub Secrets do workflow.
 */
function credenciais(): { url: string; chave: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const chave =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
  if (!url || !chave) return null;
  return { url, chave };
}

/** Chave de leitura: a publicável basta, e é a que a página já tem. */
function credenciaisDeLeitura(): { url: string; chave: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const chave =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.SUPABASE_SECRET_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !chave) return null;
  return { url, chave };
}

/**
 * Dá para gravar no arquivo?
 *
 * Existe para quem chama poder DIZER que não gravou, em vez de gravar no vazio.
 * O `npm run arquivar` imprime isso na primeira linha.
 */
export function arquivoDisponivel(): boolean {
  return credenciais() !== null;
}

/**
 * Dá para LER o arquivo? A chave publicável basta, e a página já a tem.
 *
 * Separada de `arquivoDisponivel` porque as três situações são diferentes e
 * viravam a mesma mensagem: "não configurei", "configurei e não respondeu" e
 * "respondeu vazio". Só a do meio é problema.
 */
export function arquivoLegivel(): boolean {
  return credenciaisDeLeitura() !== null;
}

function cliente(escrita: boolean): SupabaseClient | null {
  const c = escrita ? credenciais() : credenciaisDeLeitura();
  if (!c) return null;
  return createClient(c.url, c.chave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Grava dias de open interest, sem duplicar.
 *
 * `upsert` com a chave (symbol, dia): rodar duas vezes no mesmo dia atualiza a
 * linha em vez de criar outra, e o dia corrente é reescrito a cada execução até
 * fechar. Isso é de propósito — o OI do dia aberto muda até a meia-noite UTC, e
 * a última escrita antes da virada é a que vale.
 *
 * Devolve quantas linhas foram enviadas, ou nulo quando não deu para gravar.
 * Nulo e zero são coisas diferentes: zero é "não havia o que gravar", nulo é
 * "não consegui".
 */
export async function gravarOi(dias: DiaArquivado[]): Promise<number | null> {
  const db = cliente(true);
  if (!db) return null;
  if (dias.length === 0) return 0;

  // O Postgres aceita lotes grandes, mas a API REST tem teto de corpo. Mil
  // linhas por vez passa com folga e mantém o número de idas baixo.
  const LOTE = 1000;
  let enviadas = 0;
  for (let i = 0; i < dias.length; i += LOTE) {
    const { error } = await db
      .from("oi_diario")
      .upsert(dias.slice(i, i + LOTE), { onConflict: "symbol,dia" });
    if (error) {
      // Falhou no meio: o que já entrou está lá, e quem chama precisa saber que
      // o resto não. Devolver o parcial escondido seria pior que devolver nulo.
      console.error(`arquivo: lote ${i / LOTE + 1} falhou —`, error.message);
      return null;
    }
    enviadas += Math.min(LOTE, dias.length - i);
  }
  return enviadas;
}

/** Grava emissões do painel. Mesma regra de nulo do `gravarOi`. */
export async function gravarEmissoes(linhas: EmissaoArquivada[]): Promise<number | null> {
  const db = cliente(true);
  if (!db) return null;
  if (linhas.length === 0) return 0;

  const { error } = await db.from("emissoes").upsert(linhas, { onConflict: "symbol,t" });
  if (error) {
    console.error("arquivo: emissões falharam —", error.message);
    return null;
  }
  return linhas.length;
}

/** Anota a execução no diário, para "está gravando?" ter resposta sem adivinhação. */
export async function anotarRun(
  tabela: string,
  linhas: number,
  simbolos: number,
  segundos: number,
  erro?: string,
): Promise<void> {
  const db = cliente(true);
  if (!db) return;
  await db.from("arquivo_runs").insert({ tabela, linhas, simbolos, segundos, erro: erro ?? null });
}

/**
 * A série de open interest guardada, de todos os símbolos ou de alguns.
 *
 * Devolve NULO quando a consulta falhou e lista vazia quando não há nada
 * guardado — de novo, as duas coisas são diferentes, e a medição que chama
 * precisa distinguir "o arquivo está vazio, use só a Binance" de "o arquivo não
 * respondeu, não confie no que eu devolvi".
 */
export async function lerOi(
  desde?: string,
  symbols?: string[],
): Promise<DiaArquivado[] | null> {
  const db = cliente(false);
  if (!db) return null;

  // A API REST pagina em 1.000 linhas por padrão, e 526 símbolos × 90 dias são
  // 47 mil. Sem o laço, a medição rodaria sobre o primeiro milésimo do arquivo e
  // não diria nada — o pior modo de falha possível para um número.
  const PAGINA = 1000;
  const todas: DiaArquivado[] = [];
  for (let de = 0; ; de += PAGINA) {
    let q = db
      .from("oi_diario")
      .select("symbol,dia,open_interest,abertura,maxima,minima,fechamento,volume")
      .order("symbol", { ascending: true })
      .order("dia", { ascending: true })
      .range(de, de + PAGINA - 1);
    if (desde) q = q.gte("dia", desde);
    if (symbols?.length) q = q.in("symbol", symbols);

    const { data, error } = await q;
    if (error) {
      console.error("arquivo: leitura falhou —", error.message);
      return null;
    }
    todas.push(...((data ?? []) as DiaArquivado[]));
    if (!data || data.length < PAGINA) break;
  }
  return todas;
}

/** Quantos dias distintos o arquivo tem, e o mais antigo. Nulo se não deu para ler. */
export async function cobertura(): Promise<{ dias: number; de: string; ate: string } | null> {
  const db = cliente(false);
  if (!db) return null;
  const { data, error } = await db
    .from("oi_diario")
    .select("dia")
    .order("dia", { ascending: true })
    .limit(1);
  if (error) return null;
  const primeiro = (data?.[0] as { dia: string } | undefined)?.dia;
  if (!primeiro) return { dias: 0, de: "", ate: "" };

  const { data: ultimo } = await db
    .from("oi_diario")
    .select("dia")
    .order("dia", { ascending: false })
    .limit(1);
  const fim = (ultimo?.[0] as { dia: string } | undefined)?.dia ?? primeiro;
  const dias = Math.round(
    (new Date(fim).getTime() - new Date(primeiro).getTime()) / 86_400_000,
  ) + 1;
  return { dias, de: primeiro, ate: fim };
}
