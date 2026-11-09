import { getBaleias, getMedicaoBaleias } from "@/lib/hyperliquid";
import { BaleiasAgora, BaleiasMedidas, BaleiasSemMedicao } from "@/components/BaleiasPanel";
import { Cabeca, Pagina, Secao } from "@/components/Pagina";

export const revalidate = 300;

export const metadata = {
  title: "BTC Moon · Baleias",
  description: "Onde as contas grandes da Hyperliquid estão posicionadas, a que preço entraram, onde seriam liquidadas — e se segui-las funciona, medido.",
};

/**
 * A aba BALEIAS: a primeira parte do algoritmo próprio de on-chain que o
 * usuário pediu em 09/11 — as contas grandes da Hyperliquid, onde cada posição
 * é pública. A leitura de agora vem de `npm run baleias` (de 4 em 4 horas, na
 * branch `dados`) e a medição, de `npm run medir-baleias` (`docs/preregistro-baleias.md`).
 * O veredito fica na mesma tela da leitura, como o placar fica acima das
 * candidatas no Radar.
 */
export default async function Baleias() {
  const [b, m] = await Promise.all([getBaleias(), getMedicaoBaleias()]);
  return (
    <Pagina>
      <Cabeca
        titulo="Baleias"
        secoes={[{ id: "medido", rotulo: m ? "O que foi medido" : "Funciona?" }, ...(b ? [{ id: "agora", rotulo: "Onde estão agora" }] : [])]}
      >
        <p className="text-black/60 dark:text-white/60 max-w-3xl">
          Na Hyperliquid, a corretora é uma blockchain: a posição de cada conta é pública. Aqui estão as contas grandes —
          quem está comprado e vendido em cada moeda, a que preço entrou, quanto ganha e onde seria liquidado. E, antes da
          leitura, a resposta medida para a pergunta que ela faz: seguir as baleias dá dinheiro?
        </p>
      </Cabeca>
      <Secao id="medido">{m ? <BaleiasMedidas m={m} /> : <BaleiasSemMedicao desde={b?.historicoDesde} />}</Secao>
      {b && (
        <Secao id="agora">
          <BaleiasAgora b={b} />
        </Secao>
      )}
      {!b && (
        <p className="text-sm text-black/45 dark:text-white/45">
          A leitura das baleias ainda não foi gravada: <code>npm run baleias</code>.
        </p>
      )}
    </Pagina>
  );
}
