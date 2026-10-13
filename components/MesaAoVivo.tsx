"use client";

/**
 * A aba "Mesa de risco": a mesa (`MesaRobos`) com o fundo marcado ao vivo. Ela
 * morava dentro do painel dos robôs e pegava de lá o fundo já marcado; sozinha
 * na aba, ela marca os mesmos dois robôs com a mesma assinatura de preço
 * (`useRobosMarcados`), e o fundo da mesa e os cartões do ao vivo dizem o
 * mesmo patrimônio.
 */

import type { ArquivoRobos, Medicao } from "@/lib/robos";
import MesaRobos from "./MesaRobos";
import { fundoVivoDe, useRobosMarcados } from "./robosVivo";

export default function MesaAoVivo({ arquivo, medicao }: { arquivo: ArquivoRobos | null; medicao: Medicao | null }) {
  const { vivo, marcados } = useRobosMarcados(arquivo);
  if (!medicao?.quant) {
    return <p className="text-sm text-black/45 dark:text-white/45">A mesa de risco ainda não foi medida: <code>npm run medir-robos</code>.</p>;
  }
  return <MesaRobos medicao={medicao} quant={medicao.quant} fundoVivo={fundoVivoDe(marcados, medicao, vivo.em)} />;
}
