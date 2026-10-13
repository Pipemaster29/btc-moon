/**
 * O que as abas dos robôs dividem para escrever um número: a cor e o nome curto
 * de cada robô, os formatos de dinheiro e porcentagem e o tom de ganho e perda.
 * Puro — o ao vivo, a medição e a mesa de risco leem as mesmas regras, e um
 * robô não troca de cor de uma aba para a outra.
 */

import { ROBOS, type EstadoRobo } from "@/lib/robos";

// A cor é do robô, não da posição na lista: robô novo não repinta os antigos.
const COR: Record<string, string> = {
  momento: "var(--robo-1)",
  turbo: "var(--robo-2)",
  "caca-monstra": "var(--robo-3)",
  fluxo: "var(--robo-4)",
  // A 5ª cor da paleta é a do fundo, na mesa de risco: o das grandes fica com a 6ª.
  grandes: "var(--robo-6)",
};
export const corDe = (id: string) => COR[id] ?? "var(--robo-ctx)";
export const CURTO: Record<string, string> = { momento: "Momento", turbo: "Turbo", "caca-monstra": "Caça", fluxo: "Fluxo", grandes: "Grandes" };

// O nome vem do estado ao vivo; robô medido que ainda não rodou (o primeiro
// retrato depois do deploy é que o cria) cai no nome das regras.
export const nomeDe = (id: string, robos: readonly EstadoRobo[]) =>
  robos.find((e) => e.id === id)?.nome ?? ROBOS.find((r) => r.id === id)?.nome ?? id;

export function usd(v: number, casas = 2): string {
  return `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
}

export function pct(v: number, casas = 1): string {
  // Abaixo de 10% uma casa a mais: "−0%" escondia os −0,3% do Caça-monstra no
  // período em que ele perdeu, que é justamente o número que importa ler.
  const c = Math.abs(v) < 0.1 ? Math.max(casas, 1) : casas;
  const x = Math.abs(v * 100) < 0.5 * 10 ** -c ? 0 : v * 100;
  return `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c })}%`;
}

/** Uma fração sem sinal e sem casa à toa: 0,06 → "6%", 0,001 → "0,1%". */
export function fracao(v: number): string {
  return `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

export function tom(v: number): string {
  if (v > 0.0005) return "text-[#0a7d43] dark:text-[#0ECB81]";
  if (v < -0.0005) return "text-[#C42B3E] dark:text-[#F6465D]";
  return "";
}

export function dataHora(t: number): string {
  return new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

export const MOTIVO: Record<string, string> = {
  stop: "stop",
  rastro: "rastro",
  prazo: "prazo",
  liquidada: "liquidada",
  sumiu: "saiu da praça",
  posto: "caiu no ranking",
};
