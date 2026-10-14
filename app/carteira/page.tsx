import { getSnapshot } from "@/lib/snapshot";
import { getPlacar } from "@/lib/placar";
import { getCarteira, remarcar } from "@/lib/carteira";
import { getSinais } from "@/lib/sinais";
import { mesmaMoeda } from "@/lib/faixa";
import CarteiraPanel from "@/components/CarteiraPanel";
import PlacarPanel from "@/components/PlacarPanel";
import SinaisPanel from "@/components/SinaisPanel";
import { Cabeca, Pagina, Secao } from "@/components/Pagina";

// O retrato e a carteira mudam quando o workflow roda; cinco minutos é a régua
// do resto do radar.
export const revalidate = 300;

export const metadata = {
  title: "BTC Moon · Carteira e placar",
  description: "O painel posto à prova: a carteira fictícia que segue as calls, o placar dos vieses e os sinais clássicos medidos.",
};

/**
 * A aba CARTEIRA: o painel posto à prova. A carteira fictícia segue as calls
 * do radar com dinheiro de mentira e custo de verdade; o placar diz se cada
 * viés separou do mercado; e os sinais clássicos medidos respondem a pergunta
 * seguinte de quem lê "nenhum viés separou" — "e se eu usasse RSI, suporte,
 * funding?". Era essa a ordem na página única, e ela continua aqui.
 */
export default async function Carteira() {
  const [snapshot, guardada, placar, sinais] = await Promise.all([getSnapshot(), getCarteira(), getPlacar(), getSinais()]);
  const rows = snapshot.moedas;
  // A carteira é recalculada só quando o retrato roda, e o painel dela se
  // atualiza pela camada viva. Remarcar as posições com os preços que esta
  // página já tem em mãos é aritmética, e sem isso a tela mostra preço novo em
  // cima e posição marcada há horas embaixo.
  const carteira = guardada
    ? remarcar(guardada, new Map(rows.filter((r) => r.price > 0).map((r) => [r.ticker, r.price])))
    : null;
  // A base pool–perpétuo de cada moeda neste retrato, para a carteira remarcar
  // ao vivo na escala em que as posições entraram. Fora de 0,8–1,25 não é
  // base, é leitura quebrada: fica 1, e a marcação usa o perpétuo cru.
  const bases: Record<string, number> = {};
  for (const r of rows) {
    const b = r.perpPrice > 0 && r.price > 0 ? r.price / r.perpPrice : NaN;
    if (mesmaMoeda(b) && Math.abs(b - 1) > 1e-4) bases[r.ticker] = b;
  }

  return (
    <Pagina>
      <Cabeca
        titulo="Carteira e placar"
        secoes={[
          ...(carteira ? [{ id: "carteira", rotulo: "Carteira fictícia" }] : []),
          ...(placar ? [{ id: "placar", rotulo: "O placar do painel" }] : []),
          ...(sinais ? [{ id: "sinais", rotulo: "Os sinais clássicos" }] : []),
        ]}
      >
        <p className="text-black/60 dark:text-white/60 max-w-3xl">
          O radar posto à prova: a carteira fictícia que entra em toda call dele, o placar de cada viés contra o mercado e
          os sinais de análise técnica medidos nas mesmas moedas.
        </p>
      </Cabeca>

      {carteira ? (
        <Secao id="carteira">
          <CarteiraPanel c={carteira} bases={bases} />
        </Secao>
      ) : (
        <p className="text-sm text-black/45 dark:text-white/45">A carteira ainda não foi gravada: <code>npm run carteira</code>.</p>
      )}
      {placar && (
        <Secao id="placar">
          <PlacarPanel placar={placar} />
        </Secao>
      )}
      {sinais && (
        <Secao id="sinais">
          <SinaisPanel s={sinais} />
        </Secao>
      )}
    </Pagina>
  );
}
