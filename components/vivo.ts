"use client";

/**
 * UMA assinatura de preço ao vivo para a página inteira.
 *
 * O radar tem setenta linhas e uma carteira embaixo delas, e cada uma quer o
 * preço de agora. Um `useEffect` com `setInterval` por componente daria setenta
 * e um relógios e setenta e uma requisições — a API pública não pede chave, e é
 * exatamente por isso que não se deve abusar dela.
 *
 * Então a assinatura é UMA SÓ, mora no módulo, e os componentes se inscrevem nela
 * por `useSyncExternalStore`. Ela acorda quando o primeiro componente monta e
 * dorme quando o último desmonta, então uma página que não mostra preço não
 * consulta nada.
 *
 * DOIS CANAIS, E O NAVEGADOR FALA DIRETO COM A BINANCE NO PRIMEIRO. A consulta a
 * `/api/vivo` de quinze em quinze segundos passa pelo Vercel a cada tique; o
 * WebSocket público do perpétuo não passa por servidor nosso nenhum — a conexão
 * é do navegador de quem está olhando com a Binance, e o custo para o Vercel e
 * para o GitHub é zero. Medido em 23/09 com as 71 moedas vigiadas numa conexão
 * só: ~19 mensagens e 4 KB por segundo, 64 das 71 moedas atualizando em vinte
 * segundos, cada uma de ~3 em ~3 s. Com ele de pé, a consulta cai para uma por
 * minuto e continua só pelo que o WebSocket não traz: o financiamento.
 *
 * O MINITICKER E NÃO O MARKPRICE, e o motivo é a MESMA LEITURA que a consulta
 * faz. `/api/vivo` devolve o último negócio e a variação sobre a abertura de 24h
 * (`/fapi/v1/ticker/24hr`); o miniTicker traz exatamente esses dois números (`c`
 * e `o`). O markPrice traria financiamento junto, mas o preço dele é o de marca
 * — outro número — e custa outros 4 KB/s pela mesma informação que muda de oito
 * em oito horas.
 *
 * E ELE PARA QUANDO A ABA SAI DE VISTA. Uma aba esquecida aberta a noite inteira
 * são 5.760 consultas, ou 14 MB/h de WebSocket, que ninguém vai ler; ao voltar, a
 * primeira coisa que ele faz é buscar e reabrir, para o preço na tela nunca ser o
 * de horas atrás sem aviso.
 */

import { useSyncExternalStore } from "react";

export interface MoedaViva {
  preco: number;
  variacao24h: number;
  funding: number | null;
}

export interface EstadoVivo {
  /** Quando o preço mais novo da tela foi lido. Nulo enquanto nada voltou ainda. */
  em: number | null;
  moedas: Record<string, MoedaViva>;
  /**
   * "buscando" antes da primeira resposta, "ao vivo" depois de uma boa,
   * "sem resposta" depois de uma falha. São três estados e não dois porque a
   * tela precisa poder dizer "ainda não sei" sem parecer "não há dado".
   */
  estado: "buscando" | "ao vivo" | "sem resposta";
  /**
   * Por onde o preço está chegando. A tela diz isto porque são duas cadências
   * diferentes — segundos e quinze segundos — e "ao vivo" sozinho esconderia qual.
   */
  canal: "websocket" | "consulta" | null;
}

/**
 * De quanto em quanto tempo a consulta roda SEM o WebSocket.
 *
 * Quinze segundos é o intervalo em que a tela parece viva sem que o servidor
 * precise consultar a Binance mais do que o cache dele já permite — o
 * `revalidate` da rota é de dez segundos, então a maioria destas chamadas é
 * servida sem sair para a praça.
 */
const INTERVALO_MS = 15_000;

/**
 * E COM o WebSocket de pé: só pelo financiamento e para reconciliar as moedas que
 * não negociaram. A taxa muda de oito em oito horas; um minuto é folga.
 */
const INTERVALO_COM_SOCKET_MS = 60_000;

/**
 * O caminho `/market/` e não o `/ws` da documentação antiga, e isso foi medido,
 * não lido. Em 23/09, `wss://fstream.binance.com/ws/btcusdt@aggTrade` ABRIU em
 * 590 ms e não entregou UMA mensagem em quinze segundos, e o mesmo com
 * `/stream?streams=`; `/market/stream?streams=` entregou a primeira em menos de
 * dois. É a Binance separando as rotas por tipo de dado — e o modo de falha da
 * rota velha é o silêncio, não o erro, que é o que justifica o vigia abaixo.
 */
const ENDERECO = "wss://fstream.binance.com/market/stream?streams=";

/**
 * Quanto esperar pela PRIMEIRA mensagem depois de abrir. A rota antiga abria e
 * ficava muda, então "abriu" não é "funciona": sem mensagem em dez segundos a
 * conexão conta como falha e a consulta assume. Com dezenove mensagens por
 * segundo medidas, dez segundos de silêncio não são mercado parado.
 */
const PRIMEIRA_MENSAGEM_MS = 10_000;

/** E depois de funcionando: trinta segundos sem nada é conexão morta. */
const SILENCIO_MAXIMO_MS = 30_000;

/**
 * Corte conservador, não limite medido: em 23/09, 260 fluxos numa conexão só
 * funcionaram (203 moedas vistas em oito segundos), e a lista tem 71. Se um dia
 * passar de 200, as sobras ficam na consulta — que continua rodando e cobre todas.
 */
const MAX_FLUXOS = 200;

/**
 * Setenta moedas negociando geram dezenove mensagens por segundo, e cada
 * publicação re-renderiza as setenta células e a carteira. Uma por segundo é o
 * que o olho acompanha; o resto é o navegador trabalhando para ninguém.
 */
const PUBLICAR_A_CADA_MS = 1_000;

let estado: EstadoVivo = { em: null, moedas: {}, estado: "buscando", canal: null };
const inscritos = new Set<() => void>();
let relogio: ReturnType<typeof setInterval> | null = null;
let buscando = false;
let ultimaConsulta = 0;

/**
 * Quando cada moeda foi lida pela última vez, por qualquer um dos canais. É o que
 * impede a consulta de um minuto atrás — servida do cache da rota — de passar por
 * cima do preço que o WebSocket trouxe há dois segundos e fazer a tela andar para
 * trás.
 */
const lidaEm = new Map<string, number>();

let socket: WebSocket | null = null;
let socketVivo = false;
let ultimaMensagem = 0;
let vigia: ReturnType<typeof setTimeout> | null = null;
let religar: ReturnType<typeof setTimeout> | null = null;
let falhasSeguidas = 0;
let pendente: ReturnType<typeof setTimeout> | null = null;
let tickers: string[] = [];

function publicar(novo: EstadoVivo) {
  estado = novo;
  for (const avisar of inscritos) avisar();
}

async function buscar() {
  // Sem chamadas empilhadas: numa rede lenta o intervalo dispararia por cima da
  // resposta anterior e a ordem de chegada deixaria de ser a ordem do tempo.
  if (buscando) return;
  buscando = true;
  ultimaConsulta = Date.now();
  try {
    const res = await fetch("/api/vivo", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const corpo = (await res.json()) as { em: number; moedas: Record<string, MoedaViva> };
    if (!corpo?.moedas || typeof corpo.em !== "number") throw new Error("resposta sem moedas");

    const moedas: Record<string, MoedaViva> = { ...estado.moedas };
    for (const [t, m] of Object.entries(corpo.moedas)) {
      const atual = moedas[t];
      // O financiamento vem sempre da consulta — o WebSocket não o traz. O preço
      // só entra se for mais novo que o que já está na tela.
      if (atual && (lidaEm.get(t) ?? 0) > corpo.em) {
        moedas[t] = { ...atual, funding: m.funding };
      } else {
        moedas[t] = m;
        lidaEm.set(t, corpo.em);
      }
    }
    tickers = Object.keys(corpo.moedas);
    publicar({
      em: Math.max(corpo.em, estado.em ?? 0),
      moedas,
      estado: "ao vivo",
      canal: socketVivo ? "websocket" : "consulta",
    });
    abrirSocket();
  } catch {
    // OS PREÇOS ANTERIORES FICAM. Uma requisição perdida não é motivo para a tela
    // voltar aos números do retrato — ela só deixa de dizer "ao vivo", e o
    // carimbo de idade que já está na tela conta o resto da verdade. Com o
    // WebSocket de pé, a consulta falhar não tira o preço do ar: só o
    // financiamento envelhece.
    if (!socketVivo) publicar({ ...estado, estado: "sem resposta" });
  } finally {
    buscando = false;
  }
}

// ---------------------------------------------------------------------------
// O WebSocket.
// ---------------------------------------------------------------------------

/** Preços chegados desde a última publicação, por ticker. */
const chegados = new Map<string, { preco: number; abertura: number; em: number }>();

function descarregar() {
  pendente = null;
  if (chegados.size === 0) return;
  const moedas: Record<string, MoedaViva> = { ...estado.moedas };
  let em = estado.em ?? 0;
  for (const [t, c] of chegados) {
    moedas[t] = {
      preco: c.preco,
      variacao24h: c.preco / c.abertura - 1,
      // O financiamento é o da última consulta; `null` se ainda não houve uma, e
      // não zero — a carteira cobra coisas diferentes para os dois.
      funding: estado.moedas[t]?.funding ?? null,
    };
    lidaEm.set(t, c.em);
    if (c.em > em) em = c.em;
  }
  chegados.clear();
  publicar({ em, moedas, estado: "ao vivo", canal: "websocket" });
}

/** O que o miniTicker manda, e tudo `unknown` porque vem de fora. */
interface MiniTicker {
  s?: unknown;
  c?: unknown;
  o?: unknown;
  E?: unknown;
}

function aoReceber(ev: MessageEvent) {
  ultimaMensagem = Date.now();
  if (!socketVivo) {
    socketVivo = true;
    falhasSeguidas = 0;
    publicar({ ...estado, estado: "ao vivo", canal: "websocket" });
  }
  let d: MiniTicker | undefined;
  try {
    d = (JSON.parse(String(ev.data)) as { data?: MiniTicker }).data;
  } catch {
    return;
  }
  if (!d || typeof d.s !== "string") return;
  const preco = Number(d.c);
  const abertura = Number(d.o);
  // `Number.isFinite` e não `> 0` sozinho: NaN fura `<= 0` (armadilha nº 5), e
  // uma abertura zero daria variação infinita.
  if (!Number.isFinite(preco) || preco <= 0 || !Number.isFinite(abertura) || abertura <= 0) return;
  const em = Number.isFinite(Number(d.E)) ? Number(d.E) : Date.now();
  chegados.set(d.s.replace(/USDT$/, ""), { preco, abertura, em });
  if (!pendente) pendente = setTimeout(descarregar, PUBLICAR_A_CADA_MS);
}

function abrirSocket() {
  if (socket || religar || tickers.length === 0) return;
  if (typeof WebSocket === "undefined" || typeof document === "undefined") return;
  if (document.visibilityState !== "visible") return;

  const fluxos = tickers
    .slice(0, MAX_FLUXOS)
    .map((t) => `${t.toLowerCase()}usdt@miniTicker`)
    .join("/");
  let ws: WebSocket;
  try {
    ws = new WebSocket(ENDERECO + fluxos);
  } catch {
    falhou();
    return;
  }
  socket = ws;
  ultimaMensagem = 0;
  ws.onmessage = aoReceber;
  ws.onclose = () => {
    if (socket === ws) falhou();
  };
  // `onerror` é sempre seguido de `onclose` no navegador; tratar nos dois
  // contaria a mesma falha duas vezes e dobraria a espera.
  vigiar(Date.now());
}

/**
 * O vigia do silêncio. Roda de cinco em cinco segundos enquanto há conexão:
 * sem primeira mensagem em dez segundos, ou sem mensagem nenhuma em trinta, a
 * conexão é derrubada e conta como falha.
 */
function vigiar(aberto: number) {
  if (vigia) clearTimeout(vigia);
  vigia = setTimeout(() => {
    vigia = null;
    if (!socket) return;
    const agora = Date.now();
    const mudo =
      ultimaMensagem === 0
        ? agora - aberto > PRIMEIRA_MENSAGEM_MS
        : agora - ultimaMensagem > SILENCIO_MAXIMO_MS;
    if (mudo) {
      const ws = socket;
      socket = null;
      ws.close();
      falhou();
      return;
    }
    vigiar(aberto);
  }, 5_000);
}

function fecharSocket() {
  if (vigia) clearTimeout(vigia);
  vigia = null;
  if (pendente) {
    clearTimeout(pendente);
    descarregar();
  }
  const ws = socket;
  socket = null;
  socketVivo = false;
  if (ws) {
    ws.onclose = null;
    ws.close();
  }
}

/**
 * A conexão caiu, não abriu ou ficou muda. A consulta assume na hora — o
 * intervalo dela volta aos quinze segundos sozinho porque `socketVivo` caiu — e
 * a religação espera o dobro a cada falha seguida, de cinco segundos a cinco
 * minutos. Um navegador numa rede que bloqueia o WebSocket — ou fora da região
 * que a Binance serve, que é o mesmo 451 que a API dá ao servidor — passa a
 * tentar uma vez a cada cinco minutos em vez de martelar, e a tela segue na
 * consulta.
 *
 * A Binance também derruba toda conexão com 24 horas de vida; isso cai aqui e
 * religa em cinco segundos, sem ninguém notar.
 */
function falhou() {
  fecharSocket();
  if (estado.canal === "websocket") publicar({ ...estado, canal: "consulta" });
  falhasSeguidas += 1;
  if (religar || !relogio) return;
  const espera = Math.min(5_000 * 2 ** (falhasSeguidas - 1), 300_000);
  religar = setTimeout(() => {
    religar = null;
    abrirSocket();
  }, espera);
}

// ---------------------------------------------------------------------------
// O relógio e a visibilidade.
// ---------------------------------------------------------------------------

function tique() {
  if (document.visibilityState !== "visible") return;
  const intervalo = socketVivo ? INTERVALO_COM_SOCKET_MS : INTERVALO_MS;
  // `- 1_000` porque o relógio bate de quinze em quinze e o `setInterval` atrasa
  // uns milissegundos: sem folga, o minuto viraria setenta e cinco segundos.
  if (Date.now() - ultimaConsulta >= intervalo - 1_000) void buscar();
}

function acordar() {
  if (relogio || typeof document === "undefined") return;
  relogio = setInterval(tique, INTERVALO_MS);
  document.addEventListener("visibilitychange", aoMudarVista);
  void buscar();
}

function dormir() {
  if (relogio) clearInterval(relogio);
  relogio = null;
  if (religar) clearTimeout(religar);
  religar = null;
  fecharSocket();
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", aoMudarVista);
  }
}

function aoMudarVista() {
  if (document.visibilityState === "visible") {
    // Voltar para a aba busca na hora: o intervalo sozinho deixaria até quinze
    // segundos de preço velho na tela justamente no momento em que alguém olhou.
    // A busca reabre o WebSocket quando termina.
    falhasSeguidas = 0;
    void buscar();
  } else {
    if (religar) clearTimeout(religar);
    religar = null;
    fecharSocket();
    if (estado.canal === "websocket") publicar({ ...estado, canal: "consulta" });
  }
}

function inscrever(avisar: () => void): () => void {
  inscritos.add(avisar);
  if (inscritos.size === 1) acordar();
  return () => {
    inscritos.delete(avisar);
    if (inscritos.size === 0) dormir();
  };
}

const ler = () => estado;

/**
 * O estado do servidor é sempre o inicial, e tem de ser o MESMO objeto a cada
 * chamada: `useSyncExternalStore` compara por identidade e um objeto novo por
 * render vira laço infinito de hidratação.
 */
const NO_SERVIDOR: EstadoVivo = { em: null, moedas: {}, estado: "buscando", canal: null };
const lerNoServidor = () => NO_SERVIDOR;

export function useVivo(): EstadoVivo {
  return useSyncExternalStore(inscrever, ler, lerNoServidor);
}

/** O recorte de uma moeda. Continua reagindo a cada busca, como todo o resto. */
export function useMoedaViva(ticker: string): MoedaViva | null {
  return useVivo().moedas[ticker] ?? null;
}

/**
 * A mesma assinatura sem React. Existe para o relógio poder ser exercitado de
 * ponta a ponta fora do navegador: o proxy do ambiente de desenvolvimento não
 * deixa o Chromium abrir WebSocket, e o caminho que mais importa testar — abrir,
 * receber, cair para a consulta, religar — só roda com um de verdade.
 */
export { inscrever as assinarVivo, ler as lerVivo };
