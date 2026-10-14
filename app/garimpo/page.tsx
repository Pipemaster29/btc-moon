import { getSnapshot } from "@/lib/snapshot";
import { getGarimpo } from "@/lib/garimpo";
import { getSinais } from "@/lib/sinais";
import { getFluxo } from "@/lib/fluxo";
import FluxoPanel from "@/components/FluxoPanel";
import GarimpoPanel from "@/components/GarimpoPanel";
import { Cabeca, Pagina, Secao } from "@/components/Pagina";

export const revalidate = 300;

export const metadata = {
  title: "BTC Moon · Garimpo",
  description: "O que entrou e saiu da carteira quente da Binance e o que a praça inteira de perpétuos devolveu.",
};

/**
 * A aba GARIMPO: o que está fora da lista. O fluxo da carteira quente da
 * Binance é dado on-chain sobre moedas que a lista nem sempre tem, e o garimpo
 * peneira os perpétuos inteiros atrás do padrão — os dois são fila de
 * investigação, descrição sem vantagem medida, e por isso ficam juntos e longe
 * da tabela, que tem leitura completa de cada moeda.
 */
export default async function Garimpo() {
  const [fluxo, sinais, garimpo, snapshot] = await Promise.all([getFluxo(), getSinais(), getGarimpo(), getSnapshot()]);
  return (
    <Pagina>
      <Cabeca
        titulo="Garimpo"
        secoes={[
          ...(fluxo ? [{ id: "fluxo", rotulo: "Fluxo da Binance" }] : []),
          ...(garimpo ? [{ id: "universo", rotulo: "O universo inteiro" }] : []),
        ]}
      >
        <p className="text-black/60 dark:text-white/60 max-w-3xl">
          O que está fora da lista: o que entrou e saiu da carteira quente da Binance e o que a praça inteira de perpétuos
          devolveu. É fila de investigação, não call: o fluxo ainda não foi medido — o dado só existe para frente —, e o
          padrão que o garimpo acha foi medido, e vendê-lo perde dinheiro.
        </p>
      </Cabeca>
      {fluxo && (
        <Secao id="fluxo">
          <FluxoPanel f={fluxo} s={sinais} />
        </Secao>
      )}
      {garimpo && (
        <Secao id="universo">
          <GarimpoPanel g={garimpo} naTela={snapshot.moedas.map((r) => r.symbol)} />
        </Secao>
      )}
      {!fluxo && !garimpo && (
        <p className="text-sm text-black/45 dark:text-white/45">
          Nada gravado ainda: <code>npm run fluxo-binance</code> e <code>npm run garimpar</code>.
        </p>
      )}
    </Pagina>
  );
}
