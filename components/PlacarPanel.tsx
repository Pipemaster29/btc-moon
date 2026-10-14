/**
 * O placar do próprio painel: cada viés que esteve na tela, contra o que o
 * preço fez depois.
 *
 * DOIS TAMANHOS, PORQUE ELE TEM DOIS LUGARES. O inteiro mora na aba Carteira,
 * ao lado da carteira que segue as mesmas calls. O resumo mora no Radar, logo
 * acima das candidatas a comprar e a vender — quem lê "vender" precisa saber,
 * na mesma tela, que o viés ainda não separou de nada. Era essa a razão de o
 * placar vir antes das recomendações na página única, e separar a página em
 * abas não podia levar a razão junto.
 */

import Link from "next/link";
import type { Placar } from "@/lib/placar";

function pp(delta: number): string {
  return `${delta >= 0 ? "+" : "−"}${Math.abs(delta * 100).toFixed(2)} p.p.`;
}

export default function PlacarPanel({ placar }: { placar: Placar }) {
  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-lg">O placar do próprio painel</h2>
        {/* A JANELA NÃO É CARIMBO DE FRESCOR, e sem o `medido em` ela parecia
            um. Ela diz sobre que período o placar foi calculado; QUANDO ele foi
            calculado é outra coisa. Mostrar as duas datas é o que impede a
            segunda de se passar pela primeira. */}
        <span className="text-xs text-black/40 dark:text-white/40 tabular-nums">
          {placar.emissoes.toLocaleString("pt-BR")} emissões · {placar.moedas} moedas · {placar.janela.de.slice(0, 10)} a{" "}
          {placar.janela.ate.slice(0, 10)}
          {placar.geradoEm > 0 && <> · medido em {new Date(placar.geradoEm).toISOString().slice(0, 10)}</>}
        </span>
      </div>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1.5">
        Cada viés que esteve no radar, comparado com o que o preço fez {placar.horizonte}h depois. A referência — todas as
        moedas, todo o período — é {(placar.referencia * 100).toFixed(2)}%, e é dela que a distância importa: numa semana de
        queda geral um viés negativo não errou, apenas descreveu o mercado.
      </p>
      <div className="grid gap-3 mt-3 sm:grid-cols-2 lg:grid-cols-4">
        {placar.vereditos.map((v) => (
          <div key={v.vies} className="rounded-lg border border-black/10 dark:border-white/10 p-3">
            <p className="text-xs text-black/50 dark:text-white/50">{v.vies}</p>
            <p className={`text-lg font-semibold tabular-nums ${v.passa ? "text-[#0a7d43] dark:text-[#0ECB81]" : ""}`}>{pp(v.delta)}</p>
            <p className="text-xs text-black/45 dark:text-white/45 tabular-nums">
              {(v.concordancia * 100).toFixed(0)}% das moedas · {v.passa ? "separou" : "não separou"}
            </p>
          </div>
        ))}
      </div>
      {placar.vereditos.every((v) => !v.passa) && (
        <p className="text-sm text-[#C42B3E] dark:text-[#F6465D] mt-3">
          Nenhum viés separou da referência com concordância entre moedas nesta janela. Trate as candidatas do radar como
          descrição do estado das moedas, não como recomendação.
        </p>
      )}
    </section>
  );
}

/** A versão de uma linha, para o Radar: o veredito e o caminho até o placar inteiro. */
export function PlacarResumo({ placar }: { placar: Placar }) {
  const nenhum = placar.vereditos.every((v) => !v.passa);
  return (
    <div
      className={`rounded-lg border px-4 py-3 text-sm ${
        nenhum ? "border-[#C42B3E]/30 bg-[#C42B3E]/5 dark:border-[#F6465D]/30 dark:bg-[#F6465D]/10" : "border-black/10 dark:border-white/10"
      }`}
    >
      <span className="font-medium">O placar do painel:</span>{" "}
      <span className="tabular-nums text-black/60 dark:text-white/60">
        {placar.vereditos.map((v, k) => (
          <span key={v.vies}>
            {k > 0 && " · "}
            {v.vies} {pp(v.delta)}
          </span>
        ))}{" "}
        contra a referência, {placar.horizonte}h depois.
      </span>{" "}
      {nenhum && (
        <span className="text-[#C42B3E] dark:text-[#F6465D]">
          Nenhum viés separou: as candidatas abaixo descrevem o estado das moedas, não são recomendação.
        </span>
      )}{" "}
      <Link href="/carteira#placar" className="underline text-black/60 dark:text-white/60 whitespace-nowrap">
        ver o placar
      </Link>
    </div>
  );
}
