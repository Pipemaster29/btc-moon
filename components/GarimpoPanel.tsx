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

import type { Garimpo } from "@/lib/garimpo";

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

export default function GarimpoPanel({ g }: { g: Garimpo }) {
  const novos = g.achados
    .filter((a) => !a.naLista && !a.aposentada)
    .filter((a) => a.marketCap == null || a.marketCap <= TETO_MCAP)
    .slice(0, 10);

  if (novos.length === 0) return null;

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

      <p className="text-xs text-[#C42B3E] dark:text-[#F6465D] mt-2 border-l-2 border-[#F6465D]/40 pl-2">
        <strong>Isto não é lista de venda.</strong> A queda depois do pump é o sinal mais
        forte já medido aqui — mediana de −12,7% em 7 dias contra referência de −1,0%, com
        102 de 139 moedas concordando, estável nas duas metades da janela. E vendê-la
        mecanicamente <strong>perde dinheiro em toda largura de stop testada</strong>: com
        stop de +25% de preço, 55% das entradas estopam antes de qualquer coisa acontecer, e
        a média fica negativa mesmo com o financiamento real contado a favor. É uma fila do
        que investigar, e o próximo passo de cada uma é identificar o contrato.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm tabular-nums min-w-[42rem]">
          <thead className="text-xs text-black/40 dark:text-white/40 text-left">
            <tr>
              <th className="font-normal py-1">Moeda</th>
              <th className="font-normal py-1 text-right">24h</th>
              <th className="font-normal py-1 text-right">7 dias</th>
              <th className="font-normal py-1 text-right">Market cap</th>
              <th
                className="font-normal py-1 text-right"
                title="Open interest em dólar dividido pelo market cap. Acima de 100% o perpétuo vale mais que a moeda inteira — o preço se forma em quem aposta, não em quem compra."
              >
                OI ÷ mcap
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
            {novos.map((a) => (
              <tr key={a.symbol} className="border-t border-black/5 dark:border-white/5">
                <td className="py-1.5 font-medium">{a.ticker}</td>
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
      </div>

      <p className="text-xs text-black/40 dark:text-white/40 mt-4">
        Nenhuma delas entra na análise completa sozinha:{" "}
        <span className="font-medium">identificar o token errado é o erro mais caro deste
        projeto</span> e já foi cometido duas vezes — buscar um ticker pelo nome devolve o
        mercado inteiro de homônimos. O próximo passo é{" "}
        <code className="px-1 rounded bg-black/5 dark:bg-white/10">
          npm run descobrir {novos.slice(0, 3).map((a) => a.ticker).join(" ")}
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
