"use client";

/**
 * UMA assinatura de preço ao vivo para a página inteira.
 *
 * O radar tem setenta linhas e uma carteira embaixo delas, e cada uma quer o
 * preço de agora. Um `useEffect` com `setInterval` por componente daria setenta
 * e um relógios e setenta e uma requisições — a API pública não pede chave, e é
 * exatamente por isso que não se deve abusar dela.
 *
 * Então o relógio é UM SÓ, mora no módulo, e os componentes se inscrevem nele
 * por `useSyncExternalStore`. Ele acorda quando o primeiro componente monta e
 * dorme quando o último desmonta, então uma página que não mostra preço não
 * consulta nada.
 *
 * E ELE PARA QUANDO A ABA SAI DE VISTA. Uma aba esquecida aberta a noite inteira
 * são 5.760 requisições que ninguém vai ler; ao voltar, a primeira coisa que ele
 * faz é buscar, para o preço na tela nunca ser o de horas atrás sem aviso.
 */

import { useSyncExternalStore } from "react";

export interface MoedaViva {
  preco: number;
  variacao24h: number;
  funding: number | null;
}

export interface EstadoVivo {
  /** Quando o servidor leu a praça. Nulo enquanto nada voltou ainda. */
  em: number | null;
  moedas: Record<string, MoedaViva>;
  /**
   * "buscando" antes da primeira resposta, "ao vivo" depois de uma boa,
   * "sem resposta" depois de uma falha. São três estados e não dois porque a
   * tela precisa poder dizer "ainda não sei" sem parecer "não há dado".
   */
  estado: "buscando" | "ao vivo" | "sem resposta";
}

/**
 * De quanto em quanto tempo.
 *
 * Quinze segundos é o intervalo em que a tela parece viva sem que o servidor
 * precise consultar a Binance mais do que o cache dele já permite — o
 * `revalidate` da rota é de dez segundos, então a maioria destas chamadas é
 * servida sem sair para a praça.
 */
const INTERVALO_MS = 15_000;

let estado: EstadoVivo = { em: null, moedas: {}, estado: "buscando" };
const inscritos = new Set<() => void>();
let relogio: ReturnType<typeof setInterval> | null = null;
let buscando = false;

function publicar(novo: EstadoVivo) {
  estado = novo;
  for (const avisar of inscritos) avisar();
}

async function buscar() {
  // Sem chamadas empilhadas: numa rede lenta o intervalo dispararia por cima da
  // resposta anterior e a ordem de chegada deixaria de ser a ordem do tempo.
  if (buscando) return;
  buscando = true;
  try {
    const res = await fetch("/api/vivo", { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const corpo = (await res.json()) as { em: number; moedas: Record<string, MoedaViva> };
    if (!corpo?.moedas || typeof corpo.em !== "number") throw new Error("resposta sem moedas");
    publicar({ em: corpo.em, moedas: corpo.moedas, estado: "ao vivo" });
  } catch {
    // OS PREÇOS ANTERIORES FICAM. Uma requisição perdida não é motivo para a tela
    // voltar aos números do retrato — ela só deixa de dizer "ao vivo", e o
    // carimbo de idade que já está na tela conta o resto da verdade.
    publicar({ ...estado, estado: "sem resposta" });
  } finally {
    buscando = false;
  }
}

function acordar() {
  if (relogio || typeof document === "undefined") return;
  void buscar();
  relogio = setInterval(() => {
    if (document.visibilityState === "visible") void buscar();
  }, INTERVALO_MS);
  document.addEventListener("visibilitychange", aoVoltar);
}

function dormir() {
  if (relogio) clearInterval(relogio);
  relogio = null;
  if (typeof document !== "undefined") {
    document.removeEventListener("visibilitychange", aoVoltar);
  }
}

function aoVoltar() {
  // Voltar para a aba busca na hora: o intervalo sozinho deixaria até quinze
  // segundos de preço velho na tela justamente no momento em que alguém olhou.
  if (document.visibilityState === "visible") void buscar();
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
const NO_SERVIDOR: EstadoVivo = { em: null, moedas: {}, estado: "buscando" };
const lerNoServidor = () => NO_SERVIDOR;

export function useVivo(): EstadoVivo {
  return useSyncExternalStore(inscrever, ler, lerNoServidor);
}

/** O recorte de uma moeda. Continua reagindo a cada busca, como todo o resto. */
export function useMoedaViva(ticker: string): MoedaViva | null {
  return useVivo().moedas[ticker] ?? null;
}
