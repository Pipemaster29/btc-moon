import { getBaleias, getMedicaoBaleias } from "@/lib/hyperliquid";
import { BaleiasAgora, BaleiasMedidas, BaleiasSemMedicao, MarketMakers, type MarketMakerOnChain } from "@/components/BaleiasPanel";
import { lerGuardado } from "@/lib/guardado";
import type { PanoramaRow } from "@/lib/overview";
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
  // O retrato guardado direto, e não `getSnapshot`: este só precisa do saldo dos market makers
  // (`vida.floatMm`), e `getSnapshot` refaz a camada viva — duas requisições por moeda — quando o retrato envelhece.
  const [b, m, guardado] = await Promise.all([
    getBaleias(),
    getMedicaoBaleias(),
    lerGuardado<{ moedas: PanoramaRow[]; geradoEm: number }>("panorama.json", (d) => (Array.isArray((d as { moedas?: unknown })?.moedas) ? (d as { moedas: PanoramaRow[]; geradoEm: number }) : null), 300).catch(() => null),
  ]);
  const retrato = guardado?.dado ?? null;
  // Retrato de antes de 09/11 não tem o saldo dos market makers: aí a tela diz que ele vem no próximo.
  const linhas = retrato?.moedas ?? [];
  const leram = linhas.filter((r) => r.vida?.floatMm !== undefined);
  const onchain: MarketMakerOnChain[] | null =
    leram.length === 0
      ? null
      : leram
          .filter((r) => (r.vida?.floatMm ?? 0) > 0)
          .map((r) => ({ symbol: r.symbol, fracao: r.vida?.floatMm as number }))
          .sort((x, y) => y.fracao - x.fracao);
  return (
    <Pagina>
      <Cabeca
        titulo="Baleias"
        secoes={[{ id: "medido", rotulo: m ? "O que foi medido" : "Funciona?" }, ...(b ? [{ id: "agora", rotulo: "Onde estão agora" }] : []), { id: "market-makers", rotulo: "Market makers" }]}
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
      <Secao id="market-makers">
        <MarketMakers b={b} onchain={onchain} retratoEm={retrato?.geradoEm ?? null} />
      </Secao>
      {!b && (
        <p className="text-sm text-black/45 dark:text-white/45">
          A leitura das baleias ainda não foi gravada: <code>npm run baleias</code>.
        </p>
      )}
    </Pagina>
  );
}
