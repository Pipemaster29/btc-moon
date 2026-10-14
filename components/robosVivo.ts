"use client";

/**
 * Os robôs marcados AGORA: cada posição no preço vivo da Binance, quando há,
 * e no do último retrato quando não. A aba "Ao vivo" e a mesa de risco (o
 * fundo também é marcado ao vivo, com os mesmos dois robôs) leem daqui, para
 * as duas mostrarem o mesmo patrimônio no mesmo instante.
 */

import {
  CAPITAL_ROBO,
  valorDaPosicao,
  type ArquivoRobos,
  type EstadoRobo,
  type Medicao,
  type PosicaoRobo,
} from "@/lib/robos";
import { fundoAoVivo, retornosDiarios, type FundoAoVivo } from "@/lib/quant";
import { useVivo, type EstadoVivo } from "./vivo";

/** A posição marcada no preço vivo, quando há; senão no do retrato. */
export function marcada(p: PosicaoRobo, vivo: Record<string, { preco: number }>): { preco: number; valor: number; vivo: boolean } {
  // O mesmo freio de lixo do motor: dez vezes não é mercado.
  const viva = (symbol: string, ultimo: number) => {
    const m = vivo[symbol.replace(/USDT$/, "")];
    return m && m.preco > 0 && m.preco / ultimo < 10 && ultimo / m.preco < 10 ? m.preco : null;
  };
  const precoVivo = viva(p.symbol, p.precoAtual);
  const preco = precoVivo ?? p.precoAtual;
  // A metade de hedge do par é marcada no preço vivo dela, quando há.
  const precoHedge = p.hedge ? (viva(p.hedge.symbol, p.hedge.precoAtual) ?? undefined) : undefined;
  return { preco, valor: valorDaPosicao(p, preco, precoHedge), vivo: precoVivo !== null };
}

export interface RoboMarcado {
  e: EstadoRobo;
  /** Caixa + cada posição no preço de agora; o do retrato enquanto o vivo não respondeu. */
  patrimonio: number;
  algumVivo: boolean;
}

export function useRobosMarcados(arquivo: ArquivoRobos | null): { vivo: EstadoVivo; robos: EstadoRobo[]; marcados: RoboMarcado[] } {
  const vivo = useVivo();
  const robos = arquivo?.robos ?? [];
  const marcados = robos.map((e) => {
    let pat = e.caixa;
    let algumVivo = false;
    for (const p of e.abertas) {
      const m = marcada(p, vivo.moedas);
      pat += m.valor;
      algumVivo ||= m.vivo;
    }
    return { e, patrimonio: vivo.em === null ? e.patrimonio : pat, algumVivo };
  });
  return { vivo, robos, marcados };
}

/**
 * O FUNDO AO VIVO: os dois livros dele marcados agora, com o passado medido de
 * cada um no lugar do desvio que o ao vivo ainda não tem (`fundoAoVivo`).
 */
export function fundoVivoDe(marcados: readonly RoboMarcado[], medicao: Medicao | null, vivoEm: number | null): FundoAoVivo | null {
  const q = medicao?.quant?.fundo;
  if (!q || !medicao) return null;
  const comps = q.componentes.map((id) => {
    const m = marcados.find((x) => x.e.id === id);
    const medida = medicao.robos.find((x) => x.id === id);
    if (!m || !medida) return null;
    return {
      curva: m.e.curva,
      patrimonioAgora: m.patrimonio,
      agora: Math.max(vivoEm ?? 0, m.e.atualizadoEm),
      historico: retornosDiarios(medida.curva).r.slice(-q.janelaDias),
    };
  });
  return comps.every((c) => c !== null) ? fundoAoVivo(comps as NonNullable<(typeof comps)[number]>[], CAPITAL_ROBO, q.janelaDias) : null;
}
