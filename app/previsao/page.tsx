import { getMedicaoPrevisao, getPrevisao } from "@/lib/previsao";
import { GraficoDosDecimos, OQueFoiMedido, OsPesos, PrevisaoDoBtc, RankingDeHoje } from "@/components/PrevisaoPanel";
import { Cabeca, Pagina, Secao } from "@/components/Pagina";

export const revalidate = 300;

export const metadata = {
  title: "BTC Moon · Previsão",
  description: "O que um algoritmo consegue prever nestas moedas e no BTC — e o que não consegue, medido em dados que ele não viu.",
};

/**
 * A aba PREVISÃO, pedida em 10/11: "um algoritmo, estilo gráfico, que tente ver
 * quais moedas vão subir, e para onde o BTC vai". O algoritmo existe
 * (`lib/previsao.ts`) e foi medido antes de ir para a tela
 * (`docs/preregistro-previsao.md`): ele ordena as moedas pela chance de ficar
 * acima do mercado, e é só — não escolhe a que sobe e não prevê o BTC. A página
 * diz as três coisas antes do ranking.
 */
export default async function Previsao() {
  const [m, p] = await Promise.all([getMedicaoPrevisao(), getPrevisao()]);
  return (
    <Pagina>
      <Cabeca
        titulo="Previsão"
        secoes={m ? [{ id: "medido", rotulo: "O que ele sabe" }, { id: "nota", rotulo: "Quanto vale a nota" }, ...(p ? [{ id: "ranking", rotulo: "O ranking de hoje" }] : []), { id: "btc", rotulo: "BTC" }, { id: "pesos", rotulo: "O que ele olha" }] : []}
      >
        <p className="text-black/60 dark:text-white/60 max-w-3xl">
          Um algoritmo que dá nota a cada moeda e tenta dizer para onde o BTC vai — testado em dados que ele não viu, com o critério escrito antes. A
          resposta curta: ele sabe dizer quais moedas tendem a ficar atrás do mercado, e não sabe dizer quais vão subir.
        </p>
      </Cabeca>
      {m ? (
        <>
          <Secao id="medido">
            <OQueFoiMedido m={m} />
          </Secao>
          <Secao id="nota">
            <GraficoDosDecimos m={m} />
          </Secao>
          {p ? (
            <Secao id="ranking">
              <RankingDeHoje p={p} m={m} />
            </Secao>
          ) : (
            <p className="text-sm text-black/45 dark:text-white/45">
              O ranking de hoje ainda não foi calculado: sai na próxima rodada do robô (<code>npm run previsao</code>).
            </p>
          )}
          <Secao id="btc">
            <PrevisaoDoBtc p={p} m={m} />
          </Secao>
          <Secao id="pesos">
            <OsPesos m={m} />
          </Secao>
        </>
      ) : (
        <p className="text-sm text-black/45 dark:text-white/45">
          A medição ainda não foi gravada: <code>npm run medir-previsao</code>.
        </p>
      )}
    </Pagina>
  );
}
