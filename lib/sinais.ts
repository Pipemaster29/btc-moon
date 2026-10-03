/**
 * O que o `npm run medir-sinais` mediu, no formato em que a tela lê.
 *
 * A medição de 23/09 — RSI, suporte, rompimento, funding, OI, smart money sobre
 * os 528 perpétuos — morava só no terminal e no README. A regra do projeto é que
 * o que foi medido e não funciona fica escrito, e "escrito" num arquivo que só
 * quem roda o script vê é meio escrito: quem abre o radar e pensa "e se eu
 * comprasse RSI < 30?" tem de encontrar a resposta na mesma tela.
 *
 * Todos os números de retorno são FRAÇÃO (0,01 = 1 p.p.), e o sinal já está do
 * lado do sinal: positivo é o sinal acertando o lado que ele aponta, contra a
 * mediana de todas as moedas no mesmo dia.
 */

import { lerGuardado } from "./guardado";

export interface SinalMedido {
  nome: string;
  lado: "long" | "short";
  /** Eventos, um por episódio de sete dias. */
  n: number;
  /** Excesso mediano em 7 dias, sobre a mediana do mercado no mesmo dia. */
  mediana7: number;
  /** O mesmo em 3 dias. */
  mediana3: number;
  /** Cada metade da janela. `null` quando a metade não tem evento — OI e razões só existem para 30 dias. */
  metades: [number | null, number | null];
  /** Moedas com mediana a favor, sobre moedas com dois eventos ou mais. */
  aFavor: number;
  moedas: number;
  /** A concordância entre moedas é mais que cara ou coroa? */
  p: number;
  /** Média por operação com stop de 2σ, 7 dias, custo e funding. */
  trade2s: number | null;
}

export interface VarianteModelo {
  nome: string;
  n: number;
  media: number;
  mediana: number;
  acerto: number;
  emR: number;
}

export interface TesteFluxo {
  nome: string;
  lado: "long" | "short";
  eventos: number;
  moedas: number;
  /** Só existe quando a amostra passa do mínimo: 30 eventos em 10 moedas. */
  mediana7: number | null;
  acerto: number | null;
}

export interface Sinais {
  geradoEm: number;
  /** De que dia a que dia os eventos foram lidos (ISO, só data). */
  janela: { de: string; ate: string };
  corte: string;
  moedaDias: number;
  perpetuos: number;
  /**
   * Quantas requisições voltaram vazias depois das tentativas, por família de
   * caminho. Vazio é o esperado; `null` é coleta anterior à contagem.
   */
  vazias: Record<string, number> | null;
  sinais: SinalMedido[];
  /** Sinais com menos de 20 eventos: ficam listados, sem número. */
  poucos: { nome: string; n: number }[];
  /** "Vender RSI > 80 em 30–100 mi", o recorte que passou nas metades, atacado. */
  modelo: {
    base: VarianteModelo;
    variantes: VarianteModelo[];
    trimestres: { q: string; media: number; n: number }[];
    moedasPositivas: number;
    moedas: number;
  };
  fluxo: {
    dias: number;
    diasValidos: number;
    minimo: { eventos: number; moedas: number };
    testes: TesteFluxo[];
  };
}

function valido(d: unknown): Sinais | null {
  const s = d as Sinais;
  return s && Array.isArray(s.sinais) && typeof s.geradoEm === "number" && s.modelo && s.fluxo ? s : null;
}

export async function getSinais(): Promise<Sinais | null> {
  const g = await lerGuardado<Sinais>("sinais.json", valido, 300);
  return g?.dado ?? null;
}
