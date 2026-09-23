/**
 * Os sinais clássicos de gráfico e de derivativos, medidos, na tela do radar.
 *
 * Fica logo depois do placar de propósito: o placar diz que os vieses DESTE
 * painel não separam da referência, e a pergunta seguinte de quem lê é "e se eu
 * usasse RSI, suporte, funding, smart money?". A resposta foi medida em 23/09
 * sobre os 528 perpétuos e morava no terminal. Agora está onde a pergunta é
 * feita.
 *
 * A FORMA: uma barra divergente por sinal, centrada no zero, e não uma tabela
 * de números. O que importa é o SINAL e a DISTÂNCIA do zero — quase tudo cola no
 * zero, e o que se afasta se afasta para o lado errado. Uma coluna de "+0,02%"
 * e "−0,84%" esconde isso; barras mostram de uma vez.
 *
 * AS CORES: o par divergente azul ↔ vermelho, com o zero em cinza — azul é o
 * sinal acertando o lado que aponta, vermelho é errando. Validado contra as duas
 * superfícies do site: separação sob daltonismo ΔE 21,6 no claro e 19,2 no
 * escuro (alvo 8), contraste acima de 3:1. Verde e vermelho seriam o par que o
 * daltonismo mais comum não separa, e aqui a cor carrega o resultado. A posição
 * da barra diz o mesmo que a cor, então nenhum leitor depende dela.
 */

import type { Sinais, SinalMedido } from "@/lib/sinais";

const TEMA =
  "[--acerta:#2a78d6] [--erra:#e34948] dark:[--acerta:#3987e5] dark:[--erra:#e66767]";

/**
 * Com sinal, em vírgula, e SEM sinal no que arredonda para zero: "−0,00" sugere
 * uma direção que o número não tem, e neste painel a direção é a notícia.
 */
function assinado(v: number | null, casas: number, sufixo: string): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const txt = Math.abs(v * 100).toFixed(casas).replace(".", ",");
  if (/^0,?0*$/.test(txt)) return `${txt}${sufixo}`;
  return `${v >= 0 ? "+" : "−"}${txt}${sufixo}`;
}

const pp = (v: number | null, casas = 2) => assinado(v, casas, "");
const pctSinal = (v: number | null, casas = 1) => assinado(v, casas, "%");

/**
 * A barra: metade esquerda é "errou", metade direita é "acertou". O traço do
 * meio é o zero, e é a linha mais escura da célula — a pergunta é sempre "saiu
 * do zero?".
 */
function Barra({ v, max }: { v: number; max: number }) {
  const f = Math.min(1, Math.abs(v) / max);
  const lado = v >= 0 ? "left-1/2" : "right-1/2";
  return (
    <div className="relative h-3 w-full min-w-24">
      <div className="absolute inset-y-0 left-1/2 w-px bg-black/25 dark:bg-white/25" />
      <div
        className={`absolute top-0.5 bottom-0.5 ${lado} ${v >= 0 ? "rounded-r" : "rounded-l"}`}
        style={{
          width: `${f * 50}%`,
          background: v >= 0 ? "var(--acerta)" : "var(--erra)",
        }}
      />
    </div>
  );
}

/** As duas metades com o mesmo sinal da janela inteira? É o primeiro filtro de sobreajuste. */
function nasDuas(s: SinalMedido): boolean | null {
  const [a, b] = s.metades;
  if (a === null || b === null) return null;
  return Math.sign(a) === Math.sign(s.mediana7) && Math.sign(b) === Math.sign(s.mediana7);
}

export default function SinaisPanel({ s }: { s: Sinais }) {
  const linhas = [...s.sinais].sort((a, b) => b.mediana7 - a.mediana7);
  // Escala comum a todas as linhas, e simétrica: um sinal a +8 e outro a −5 têm
  // de ter barras de comprimento proporcional, senão a comparação é inventada.
  let max = 0.01;
  for (const l of linhas) if (Math.abs(l.mediana7) > max) max = Math.abs(l.mediana7);

  // Meio ponto é corte de LEITURA, não de decisão: abaixo dele a barra é tão
  // curta que chamar de efeito seria dar nome a ruído. A decisão continua sendo
  // das metades e da concordância entre moedas, que vêm junto no filtro.
  const EFEITO = 0.005;
  const aFavor = linhas.filter((l) => l.mediana7 > EFEITO && nasDuas(l) === true && l.p < 0.05);
  const contra = linhas.filter((l) => l.mediana7 < -EFEITO && nasDuas(l) === true);
  const comoTrade = linhas.filter((l) => l.trade2s !== null && l.trade2s > 0).length;

  const m = s.modelo;
  const faixas = m.variantes.filter((v) => v.nome.startsWith("faixa"));
  const vazias = s.vazias ? Object.entries(s.vazias).filter(([, n]) => n > 0) : [];

  return (
    <section className={`rounded-xl border border-black/10 dark:border-white/10 p-5 ${TEMA}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-lg">Os sinais clássicos, medidos</h2>
        <span className="text-xs text-black/40 dark:text-white/40 tabular-nums">
          {s.moedaDias.toLocaleString("pt-BR")} moeda-dias · {s.perpetuos} perpétuos ·{" "}
          {s.janela.de} a {s.janela.ate} · medido em{" "}
          {new Date(s.geradoEm).toISOString().slice(0, 10)}
        </span>
      </div>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1 max-w-3xl">
        RSI, bandas, suporte e resistência, rompimento, volume, funding, open interest e a razão
        de posição dos top traders contra o varejo — sobre todos os perpétuos USDT da Binance. Cada
        barra é o que o preço fez nos sete dias seguintes, <strong>contra a mediana de todas as
        moedas no mesmo dia</strong>: sem isso, &ldquo;comprar RSI &lt; 30&rdquo; mediria o
        mercado subindo, não o sinal.
      </p>

      <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-black/55 dark:text-white/55">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: "var(--acerta)" }} />
          acertou o lado que aponta
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-2.5 rounded-sm" style={{ background: "var(--erra)" }} />
          errou
        </span>
        <span className="text-black/40 dark:text-white/40">
          escala de ±{(max * 100).toFixed(1)} p.p. · um evento por episódio de 7 dias
        </span>
      </div>

      {/* `relative` porque o `sr-only` do cabeçalho é absoluto: sem um ancestral
          posicionado aqui dentro ele escapa do corte da rolagem e alargava a
          PÁGINA em 68 px num celular de 390 — medido. */}
      <div className="relative overflow-x-auto mt-2">
        <table className="w-full text-xs tabular-nums min-w-[46rem]">
          <thead className="text-black/45 dark:text-white/45">
            <tr className="text-left">
              <th className="font-normal py-1.5">Sinal</th>
              <th className="font-normal py-1.5">Lado</th>
              <th className="font-normal py-1.5 text-right" title="Excesso mediano em 7 dias, em pontos percentuais">
                7 dias
              </th>
              <th className="font-normal py-1.5 px-3 w-[26%]">
                <span className="sr-only">barra</span>
              </th>
              <th
                className="font-normal py-1.5 text-right"
                title={`Cada metade da janela, separada. Corte em ${s.corte}. O efeito tem de aparecer antes e depois.`}
              >
                Metades
              </th>
              <th
                className="font-normal py-1.5 text-right"
                title="Moedas com a mediana a favor, sobre as moedas com dois eventos ou mais, e a chance de isso ser cara ou coroa"
              >
                Moedas a favor
              </th>
              <th
                className="font-normal py-1.5 text-right"
                title="Média por operação: stop de 2 desvios diários da própria moeda, 7 dias, 0,2% de custo e funding pago"
              >
                Como trade
              </th>
              <th className="font-normal py-1.5 text-right">Eventos</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => {
              const duas = nasDuas(l);
              return (
                <tr key={l.nome} className="border-t border-black/5 dark:border-white/5">
                  <td className="py-1.5 pr-2">{l.nome}</td>
                  <td className="py-1.5 pr-2 text-black/50 dark:text-white/50">
                    {l.lado === "long" ? "comprar" : "vender"}
                  </td>
                  <td className="py-1.5 text-right font-medium">{pp(l.mediana7)}</td>
                  <td className="py-1.5 px-3">
                    <Barra v={l.mediana7} max={max} />
                  </td>
                  <td className="py-1.5 text-right text-black/55 dark:text-white/55">
                    {pp(l.metades[0], 1)} / {pp(l.metades[1], 1)}
                    <span
                      className="ml-1"
                      title={
                        duas === null
                          ? "sem a primeira metade: open interest e razões só existem para 30 dias"
                          : duas
                            ? "mesmo sinal nas duas metades"
                            : "muda de sinal entre as metades"
                      }
                    >
                      {duas === null ? "·" : duas ? "✓" : "✗"}
                    </span>
                  </td>
                  <td className="py-1.5 text-right">
                    {l.aFavor}/{l.moedas}
                    <span className="text-black/40 dark:text-white/40">
                      {" "}
                      p {l.p < 0.001 ? "< 0,001" : l.p.toFixed(3).replace(".", ",")}
                    </span>
                  </td>
                  <td className="py-1.5 text-right">{pctSinal(l.trade2s, 2)}</td>
                  <td className="py-1.5 text-right text-black/45 dark:text-white/45">
                    {l.n.toLocaleString("pt-BR")}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {s.poucos.length > 0 && (
        <p className="text-[11px] text-black/40 dark:text-white/40 mt-1.5">
          Sem número por amostra pequena (menos de 20 eventos):{" "}
          {s.poucos.map((p) => `${p.nome} (${p.n})`).join(", ")}.
        </p>
      )}

      {/* O modelo que parecia bom, atacado — com os números do arquivo. É o
          exemplo mais útil do painel: passou nas metades e caiu no ataque. */}
      <div className="mt-4 border-t border-black/10 dark:border-white/10 pt-3 text-xs text-black/60 dark:text-white/60 max-w-3xl">
        <p>
          <strong className="text-black/80 dark:text-white/80">
            O único recorte que parecia virar trade
          </strong>{" "}
          — vender RSI &gt; 80 em moeda de 30 a 100 milhões — foi atacado de todos os lados:{" "}
          {m.base.n} operações, mediana de <strong>{pctSinal(m.base.mediana)}</strong> por trade e{" "}
          <strong>{m.base.emR.toFixed(2).replace(".", ",")} R</strong> em média;{" "}
          {m.moedasPositivas} de {m.moedas} moedas no positivo.
          {faixas.length > 0 && (
            <>
              {" "}
              Mudando só a faixa de tamanho:{" "}
              {faixas.map((f, i) => (
                <span key={f.nome}>
                  {i > 0 && ", "}
                  {f.nome.replace("faixa ", "")} em {pctSinal(f.media)}
                </span>
              ))}
              .
            </>
          )}{" "}
          Resultado que depende da faixa exata é sobreajuste da faixa.
        </p>
        {m.trimestres.length > 0 && (
          <p className="text-black/45 dark:text-white/45 mt-1">
            Por trimestre:{" "}
            {m.trimestres.map((t, i) => (
              <span key={t.q} className="tabular-nums">
                {i > 0 && " · "}
                {t.q} {pctSinal(t.media)} ({t.n})
              </span>
            ))}
          </p>
        )}
      </div>

      <p className="text-xs text-black/45 dark:text-white/45 mt-3 max-w-3xl">
        <strong className="text-black/70 dark:text-white/70">A leitura, tirada da tabela:</strong>{" "}
        {aFavor.length > 0 ? (
          <>
            separam a favor, nas duas metades e com as moedas concordando:{" "}
            {aFavor.map((l) => l.nome).join("; ")}.{" "}
          </>
        ) : (
          <>nenhum sinal separa a favor nas duas metades com as moedas concordando. </>
        )}
        {contra.length > 0 && (
          <>
            Separam CONTRA — o sinal erra o lado que aponta, nas duas metades:{" "}
            {contra.map((l) => l.nome).join("; ")}.{" "}
          </>
        )}
        Como trade com stop, {comoTrade} de {linhas.length} ficam acima de zero
        {comoTrade > 0 && linhas.length > 0 && comoTrade / linhas.length < 0.5
          ? ", e acertar a direção não basta: o caminho estopa antes de a reversão vir"
          : ""}
        . Nada aqui entra no viés do painel.
        {vazias.length > 0 && (
          <span className="text-[#8a5a00] dark:text-[#F0B90B]">
            {" "}
            ⚠ Nesta coleta, {vazias.map(([f, n]) => `${n} de ${f}`).join(", ")} voltaram vazias
            depois das tentativas — os sinais que dependem delas têm menos moedas do que deveriam.
          </span>
        )}
      </p>
    </section>
  );
}
