/**
 * O que apareceu no universo inteiro e ainda não está na lista.
 *
 * Fica DEPOIS da tabela, e não antes: o painel é sobre as moedas que já foram
 * identificadas, medidas e acompanhadas: estas aqui não foram nenhuma das três.
 * Subi-las para o topo daria a elas o mesmo peso visual de uma leitura completa,
 * e elas não têm nem contrato conferido.
 *
 * O AVISO NÃO É RODAPÉ, É O SUBTÍTULO. A deriva depois de um pump é o sinal mais
 * forte já medido neste projeto — e vendê-la mecanicamente perde dinheiro em
 * toda largura de stop testada. Uma lista de moedas que subiram muito, mostrada
 * sem essa frase, seria lida como lista de venda em três segundos.
 */

import Link from "next/link";
import type { Achado, Afericao, Garimpo } from "@/lib/garimpo";

function money(v: number | null): string {
  if (v == null || !Number.isFinite(v) || v === 0) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)} bi`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(0)} mi`;
  return `${(v / 1e3).toFixed(0)} mil`;
}

function signed(v: number | null): string {
  if (v == null || !Number.isFinite(v) || v === 0) return "—";
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;
}

function tom(v: number | null): string {
  if (v == null || !Number.isFinite(v) || v === 0) return "";
  return v > 0 ? "text-[#0a7d43] dark:text-[#0ECB81]" : "text-[#C42B3E] dark:text-[#F6465D]";
}

/**
 * O recorte de tamanho existe pelo mesmo motivo do argumento do script, e com a
 * mesma ressalva: o objeto de estudo é moeda pequena, mas a MEDIÇÃO não
 * sustenta que o efeito seja maior nelas — a Binance só publica trinta dias de
 * supply circulante e a amostra por faixa não fecha. É recorte de interesse.
 */
const TETO_MCAP = 500e6;

function porSeveridade(a: Achado, b: Achado): number {
  return a.faixa.mediana7d - b.faixa.mediana7d || b.alta24h - a.alta24h;
}

export default function GarimpoPanel({ g, afericao }: { g: Garimpo; afericao?: Afericao | null }) {
  const cabeNoRecorte = (a: Achado) => a.marketCap == null || a.marketCap <= TETO_MCAP;

  const novos = g.achados.filter((a) => !a.naLista && !a.aposentada).filter(cabeNoRecorte);

  /**
   * AS MOEDAS QUE JÁ ESTÃO NA LISTA E O GARIMPO PEGOU HOJE.
   *
   * ELAS ERAM JOGADAS FORA, e essa era a pior linha deste componente. O filtro
   * `!a.naLista` existia para responder "o que apareceu que ainda não está na
   * lista?", e a pergunta é legítima — mas jogar a resposta contrária no lixo
   * apagava justamente as moedas mais acionáveis da tela.
   *
   * Medido no retrato de 08/09: SETE dos 43 achados sumiam por isto, e entre
   * eles a BULLA na faixa "+200% na semana", que é a segunda mais severa da
   * tabela inteira (mediana medida de −42,0% em 7 dias). A diferença entre ela e
   * uma linha de baixo não é pequena: a BULLA tem contrato identificado, leitura
   * on-chain de concentração e emissão, estágio de ciclo e histórico de preço —
   * tudo o que o rodapé aqui embaixo diz que falta às outras. É a única linha da
   * seção sobre a qual o painel PODE afirmar alguma coisa, e era a única que não
   * aparecia.
   *
   * Elas ficam numa faixa própria e não misturadas: são confirmação, não achado
   * novo, e as duas coisas pedem ações diferentes — a de cima pede
   * `npm run descobrir`, a de baixo já está no radar e pede um clique.
   */
  const confirmadas = g.achados.filter((a) => a.naLista).sort(porSeveridade).slice(0, 6);

  if (novos.length === 0 && confirmadas.length === 0) return null;

  const mostrados = novos.slice(0, 12);
  const escondidos = novos.length - mostrados.length;

  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-lg">O que o universo inteiro devolveu</h2>
        {/* Carimbo ABSOLUTO e não "há N horas". A página é servida de cache, e
            uma idade calculada no render congela junto com o HTML — passaria a
            dizer "1 h atrás" por cinco horas seguidas. O carimbo continua
            verdadeiro por mais velho que fique, que é o ponto da armadilha nº 6. */}
        <span className="text-xs text-black/40 dark:text-white/40 tabular-nums">
          {g.universo} perpétuos peneirados em{" "}
          {new Date(g.geradoEm).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
        </span>
      </div>

      <p className="text-sm text-black/60 dark:text-white/60 mt-1.5">
        A watchlist tem as moedas que alguém apontou. Isto é o resto da praça — os{" "}
        {g.universo} perpétuos da Binance filtrados pelo padrão que o projeto estuda, para
        a lista deixar de depender de quem lembrou de olhar. Ordenado pela{" "}
        <strong>mediana medida</strong> da faixa em que cada moeda caiu, não por nota
        inventada.
      </p>

      {/* DUAS DATAS OUTRA VEZ, e são dois relógios: o retrato do garimpo é de
          hoje, mas a TABELA que o ordena é uma medição de 200 dias de velas que
          alguém rodou em algum momento. Sem a segunda data, a primeira se passa
          pela dela — que é a armadilha nº 6, e é a mesma correção que o placar
          já carrega. */}
      <p className="text-xs text-black/40 dark:text-white/40 mt-1.5">
        {afericao == null ? (
          <>
            A tabela que ordena esta lista está fixa no código e{" "}
            <span className="text-[#F0B90B]">nunca foi conferida por este painel</span>. Rode{" "}
            <code className="px-1 rounded bg-black/5 dark:bg-white/10">
              npm run aferir-garimpo
            </code>{" "}
            para medi-la de novo e gravar a data.
          </>
        ) : (
          <>
            Tabela conferida em{" "}
            {new Date(afericao.geradoEm).toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}{" "}
            sobre {afericao.moedas} moedas: maior desvio de{" "}
            {(afericao.piorDesvio * 100).toFixed(1)} p.p. e{" "}
            {afericao.monotonica ? (
              <>
                a ordem se sustenta — faixa mais alta, desfecho pior, em toda a escala
              </>
            ) : (
              <span className="text-[#F6465D]">
                a ordem QUEBROU: faixa mais alta deixou de ter desfecho pior, e é isso que a
                tabela afirma
              </span>
            )}
            .
          </>
        )}
      </p>

      <p className="text-xs text-[#C42B3E] dark:text-[#F6465D] mt-2 border-l-2 border-[#F6465D]/40 pl-2">
        <strong>Isto não é lista de venda.</strong> A queda depois do pump é o sinal mais
        forte já medido aqui — mediana de −12,7% em 7 dias contra referência de −1,0%, com
        102 de 139 moedas concordando, estável nas duas metades da janela. E vendê-la
        mecanicamente <strong>perde dinheiro em toda largura de stop testada</strong>: com
        stop de +25% de preço, 55% das entradas estopam antes de qualquer coisa acontecer, e
        a média fica negativa mesmo com o financiamento real contado a favor. É uma fila do
        que investigar, e o próximo passo de cada uma é identificar o contrato.
      </p>

      {mostrados.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <Tabela achados={mostrados} />
        </div>
      )}

      {escondidos > 0 && (
        // O QUE NÃO COUBE, CONTADO. Uma tabela cortada em silêncio faz a praça
        // parecer menor do que ela é — e o corte era de 10, com 26 elegíveis.
        <p className="text-xs text-black/40 dark:text-white/40 mt-2">
          e mais {escondidos} {escondidos === 1 ? "moeda" : "moedas"} abaixo desta na mesma
          peneira, cortadas só para a tabela caber na tela.
        </p>
      )}

      {confirmadas.length > 0 && (
        <div className="mt-6">
          <p className="text-[10px] tracking-widest text-black/40 dark:text-white/40 uppercase mb-1">
            Já estão na lista — e o garimpo pegou hoje
          </p>
          {/* A DIFERENÇA ENTRE ESTA FAIXA E A DE CIMA É O QUE DÁ PARA AFIRMAR.
              As de cima não têm contrato conferido; estas têm contrato, leitura
              on-chain de concentração e emissão, estágio de ciclo e histórico.
              São as únicas linhas desta seção sobre as quais o painel pode dizer
              alguma coisa — e eram exatamente as que o filtro `!naLista` jogava
              fora, sete delas no retrato de 08/09, a BULLA entre elas na faixa
              mais severa da tabela. */}
          <p className="text-xs text-black/55 dark:text-white/55 mb-2">
            Não são achado novo, são confirmação — e são as únicas aqui com contrato
            identificado, leitura on-chain e histórico. Clique para o retrato completo, que é
            um passo que nenhuma linha de cima tem.
          </p>
          <div className="overflow-x-auto">
            <Tabela achados={confirmadas} comLink />
          </div>
        </div>
      )}

      <p className="text-xs text-black/40 dark:text-white/40 mt-4">
        Nenhuma das moedas novas entra na análise completa sozinha:{" "}
        <span className="font-medium">identificar o token errado é o erro mais caro deste
        projeto</span> e já foi cometido duas vezes — buscar um ticker pelo nome devolve o
        mercado inteiro de homônimos. O próximo passo é{" "}
        <code className="px-1 rounded bg-black/5 dark:bg-white/10">
          npm run descobrir {mostrados.slice(0, 3).map((a) => a.ticker).join(" ")}
        </code>
        , que confere preço contra o perpétuo, supply contra o circulante e giro da pool
        antes de a moeda existir para o resto do painel. O recorte da tabela é até US$ 500
        milhões de market cap, e ele é de interesse e não de vantagem: a Binance publica só
        trinta dias de supply circulante, então não deu para medir se o efeito é maior nas
        pequenas.
      </p>
    </section>
  );
}

/**
 * A tabela, uma vez só, para as duas faixas.
 *
 * AS QUATRO COLUNAS NOVAS SÃO DADO QUE JÁ ERA PAGO E JOGADO FORA. `volume24h`,
 * `funding`, `quedaDoPico` e `preco` custam requisição no `lib/garimpo.ts`,
 * viajam dentro do `garimpo.json` e não apareciam em lugar nenhum — o `funding`
 * chegava a ser mencionado no texto do `porque` de uma linha cuja coluna não
 * existia.
 *
 * E as três primeiras não são enfeite, são o que separa pump de ruído:
 *
 *   volume      o corte de US$ 500 mil é de EXISTÊNCIA de mercado, não de
 *               qualidade — uma alta de 40% num livro vazio é uma ordem de mil
 *               dólares. Sem a coluna, não dá para ver de qual lado do corte a
 *               moeda está.
 *   funding     quem paga para ficar na posição, e quanto. É o preço de manter
 *               a aposta que está segurando o preço lá em cima.
 *   do pico     onde a moeda está no próprio movimento. "Na máxima" e "já caiu
 *               60% desde ela" são a mesma faixa de alta e situações opostas.
 */
function Tabela({ achados, comLink = false }: { achados: Achado[]; comLink?: boolean }) {
  return (
    <table className="w-full text-sm tabular-nums min-w-[52rem]">
      <thead className="text-xs text-black/40 dark:text-white/40 text-left">
        <tr>
          <th className="font-normal py-1">Moeda</th>
          <th className="font-normal py-1 text-right">24h</th>
          <th className="font-normal py-1 text-right">7 dias</th>
          <th
            className="font-normal py-1 text-right"
            title="Quanto o preço está abaixo da máxima da série. Perto de zero é moeda na máxima; −60% é moeda que já devolveu o movimento."
          >
            Do pico
          </th>
          <th
            className="font-normal py-1 text-right"
            title="Volume em dólar nas 24h. O corte para entrar na peneira é US$ 500 mil, e ele é de existência de mercado: abaixo disso um pump de 40% pode ser uma ordem de mil dólares num livro vazio."
          >
            Volume 24h
          </th>
          <th className="font-normal py-1 text-right">Market cap</th>
          <th
            className="font-normal py-1 text-right"
            title="Open interest em dólar dividido pelo market cap. Acima de 100% o perpétuo vale mais que a moeda inteira — o preço se forma em quem aposta, não em quem compra."
          >
            OI ÷ mcap
          </th>
          <th
            className="font-normal py-1 text-right"
            title="Taxa de financiamento por 8h. Positiva, quem está comprado paga para ficar."
          >
            Funding
          </th>
          <th
            className="font-normal py-1 text-right"
            title="Há quantos dias a Binance listou o perpétuo"
          >
            Idade
          </th>
          <th className="font-normal py-1 text-left">Faixa medida</th>
        </tr>
      </thead>
      <tbody>
        {achados.map((a) => (
          <tr key={a.symbol} className="border-t border-black/5 dark:border-white/5">
            <td className="py-1.5 font-medium">
              {comLink ? (
                <Link href={`/radar/${a.ticker}`} className="hover:underline">
                  {a.ticker}
                </Link>
              ) : (
                a.ticker
              )}
            </td>
            <td className={`py-1.5 text-right ${tom(a.alta24h)}`}>{signed(a.alta24h)}</td>
            {/* Travessão com MOTIVO: moeda listada há três dias não tem 7
                dias de série, e uma célula vazia se lê como "não andou" —
                logo nela, que é a que mais anda. */}
            <td
              className={`py-1.5 text-right ${tom(a.alta7d)}`}
              title={
                a.alta7d == null
                  ? `só ${a.diasDeSerie} ${a.diasDeSerie === 1 ? "dia" : "dias"} de série desde a listagem`
                  : undefined
              }
            >
              {a.alta7d == null ? (
                <span className="text-black/30 dark:text-white/30">{a.diasDeSerie}d de série</span>
              ) : (
                signed(a.alta7d)
              )}
            </td>
            <td
              className="py-1.5 text-right text-black/50 dark:text-white/50"
              title={
                a.quedaDoPico == null
                  ? undefined
                  : `máxima da série de ${a.diasDeSerie} ${a.diasDeSerie === 1 ? "dia" : "dias"}`
              }
            >
              {a.quedaDoPico == null ? "—" : `${(a.quedaDoPico * 100).toFixed(0)}%`}
            </td>
            <td className="py-1.5 text-right">{money(a.volume24h)}</td>
            <td className="py-1.5 text-right">{money(a.marketCap)}</td>
            <td
              className={`py-1.5 text-right ${
                a.oiSobreMcap != null && a.oiSobreMcap >= 0.3
                  ? "text-[#C42B3E] dark:text-[#F6465D]"
                  : ""
              }`}
            >
              {a.oiSobreMcap == null ? "—" : `${(a.oiSobreMcap * 100).toFixed(0)}%`}
            </td>
            {/* Três casas porque a escala é essa: 0,05% por 8h é o padrão da
                Binance, e arredondar para uma casa transformaria a coluna
                inteira em "0,1%" e "0,0%".

                E NÃO USA O `tom` VERDE-VERMELHO das colunas de preço, que aqui
                mentiria: funding não tem lado bom. Positivo alto é livro
                lotado de comprado pagando para ficar — que numa moeda já
                bombada é sinal de aviso, não de saúde. Marcado como a coluna de
                OI ao lado: destaque só no extremo, e neutro no resto. */}
            <td
              className={`py-1.5 text-right ${
                a.funding != null && Math.abs(a.funding) >= 0.0005
                  ? "text-[#C42B3E] dark:text-[#F6465D]"
                  : "text-black/50 dark:text-white/50"
              }`}
            >
              {a.funding == null ? "—" : `${(a.funding * 100).toFixed(3)}%`}
            </td>
            <td className="py-1.5 text-right text-black/50 dark:text-white/50">
              {a.idadeDias == null ? "—" : `${Math.round(a.idadeDias)}d`}
            </td>
            <td className="py-1.5 text-black/60 dark:text-white/60" title={a.porque.join(" · ")}>
              {a.faixa.rotulo}{" "}
              <span className="text-black/40 dark:text-white/40">
                → {(a.faixa.mediana7d * 100).toFixed(0)}% em 7d ({a.faixa.moedas[0]}/
                {a.faixa.moedas[1]} moedas)
              </span>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
