import Link from "next/link";
import type { PanoramaRow } from "@/lib/overview";
import { getSnapshot } from "@/lib/snapshot";
import { getPlacar } from "@/lib/placar";
import { getCarteira, remarcar } from "@/lib/carteira";
import CarteiraPanel from "@/components/CarteiraPanel";
import GarimpoPanel from "@/components/GarimpoPanel";
import { getGarimpo } from "@/lib/garimpo";
import { PrecoVivo, VariacaoViva } from "@/components/PrecoVivo";
import type { Estagio, Vies } from "@/lib/lifecycle";
import type { MoveKind } from "@/lib/positioning";

// Duas chamadas por moeda: dá para atualizar com frequência sem castigar as
// APIs públicas, que não pedem chave e não deveriam ser abusadas por isso.
export const revalidate = 300;

/**
 * A cor do estágio segue o ciclo, não a preferência: verde onde ainda há
 * caminho pela frente, âmbar no topo, vermelho na descida, cinza no que já
 * acabou. Uma moeda cinza não é ruim — ela é passado.
 */
const ESTAGIO_TONE: Record<Estagio, string> = {
  "nunca subiu": "text-[#0ECB81]",
  subindo: "text-[#0ECB81]",
  "no topo": "text-[#F0B90B]",
  "caindo do topo": "text-[#F6465D]",
  ressuscitando: "text-[#5B8DEF]",
  "em queda longa": "text-black/45 dark:text-white/45",
  exausta: "text-black/30 dark:text-white/30",
  "de lado": "text-black/30 dark:text-white/30",
};

const VIES_LABEL: Record<Vies, string> = {
  short: "vender",
  long: "comprar",
  evitar: "não mexer",
  observar: "observar",
};

const VIES_STYLE: Record<Vies, string> = {
  short: "border-[#F6465D]/40 bg-[#F6465D]/10 text-[#F6465D]",
  long: "border-[#0ECB81]/40 bg-[#0ECB81]/10 text-[#0ECB81]",
  evitar: "border-black/15 dark:border-white/15 text-black/45 dark:text-white/45",
  observar: "border-transparent text-black/25 dark:text-white/25",
};

const MOVE_LABEL: Record<MoveKind, string> = {
  squeeze: "squeeze",
  alavancagem: "alta a crédito",
  oferta: "alta por oferta",
  desalavancagem: "desalavancando",
  "livro vazio": "livro vazio",
  distribuicao: "distribuindo",
  misto: "misto",
};

const MOVE_TONE: Record<MoveKind, string> = {
  squeeze: "text-[#F0B90B]",
  alavancagem: "text-[#F6465D]",
  oferta: "text-[#0ECB81]",
  desalavancagem: "text-[#F0B90B]",
  "livro vazio": "text-[#F0B90B]",
  distribuicao: "text-[#F6465D]",
  misto: "text-black/40 dark:text-white/40",
};

function money(v: number): string {
  if (!Number.isFinite(v) || v === 0) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)} bi`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)} mi`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)} mil`;
  return v.toFixed(0);
}

function signed(v: number): string {
  if (!Number.isFinite(v) || v === 0) return "—";
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

/**
 * A barra de nota é deliberadamente discreta. Ela ordena a tabela, e ordenar é
 * tudo o que ela faz — dar a ela cara de medidor sugeriria uma precisão que
 * quarenta moedas e cinco dias de histórico não sustentam.
 */
function Score({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-12 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full ${
            value >= 60 ? "bg-[#F6465D]" : value >= 35 ? "bg-[#F0B90B]" : "bg-black/25 dark:bg-white/25"
          }`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="tabular-nums text-xs text-black/40 dark:text-white/40">{value}</span>
    </div>
  );
}

/**
 * `referencia` é o instante do retrato, não o de agora.
 *
 * Era `Date.now()` chamado dentro da linha, o que dava duas coisas erradas de
 * uma vez: o lint reprovava a impureza no render, e a conta media a idade do
 * unlock contra o momento em que a página é servida — que, com o retrato
 * guardado e o cache de cinco minutos, pode estar horas à frente dos dados que
 * a própria linha mostra. A janela tem de ser medida a partir de quando os
 * `unlocks` foram lidos.
 */
function Row({ row, referencia }: { row: PanoramaRow; referencia: number }) {
  const unlockRecente = row.vida?.unlocks?.some(
    (u) => referencia - u.quando <= 21 * 86400_000 && u.variacao >= 0.05,
  );

  return (
    <tr className="border-t border-black/5 dark:border-white/5 hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
      <td className="py-2.5 pr-3">
        <Link href={`/radar/${row.ticker}`} className="font-medium hover:underline">
          {row.ticker}
        </Link>
        <p className="text-xs text-black/35 dark:text-white/35">
          {row.contract ? row.chain : "só perpétuo"}
          {row.hasWallets && " · carteiras mapeadas"}
        </p>
      </td>
      {/* Preço e 24h continuam andando depois que a página é servida: são os dois
          números que envelhecem em minutos, e um pump de 120% cabe inteiro entre
          dois retratos. O resto da linha muda de hora em hora e segue vindo
          pronto do servidor. */}
      <td className="py-2.5 pr-3 text-right tabular-nums">
        <PrecoVivo ticker={row.ticker} retrato={row.price} />
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums">
        <VariacaoViva ticker={row.ticker} retrato={row.change24h} />
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums">
        {row.vida?.marketCap != null ? money(row.vida.marketCap) : "—"}
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums">{money(row.liquidityUsd)}</td>
      <td className="py-2.5 pr-3 text-right">
        {row.vida?.floatToken != null ? (
          <span
            className={`tabular-nums ${row.vida.floatToken <= 0.3 ? "text-[#F0B90B]" : ""}`}
          >
            {(row.vida.floatToken * 100).toFixed(0)}%
          </span>
        ) : (
          <span className="text-black/25 dark:text-white/25">—</span>
        )}
        {unlockRecente && <p className="text-xs text-[#F6465D]">unlock</p>}
      </td>
      <td className="py-2.5 pr-3 text-right">
        {row.motor?.concentracao == null ? (
          <span className="text-black/25 dark:text-white/25" title="Nunca varrida — npm run genese">
            —
          </span>
        ) : (
          <span
            className={`tabular-nums ${row.motor.concentracao >= 0.5 ? "text-[#C42B3E] dark:text-[#F6465D]" : ""}`}
            title={`${(row.motor.concentracao * 100).toFixed(1)}% do supply ainda está com quem o recebeu na gênese`}
          >
            {(row.motor.concentracao * 100).toFixed(0)}%
          </span>
        )}
      </td>
      <td className="py-2.5 pr-3 text-right">
        {row.motor?.emissao == null ? (
          <span className="text-black/25 dark:text-white/25" title="Nunca varrida — npm run vesting">
            —
          </span>
        ) : (
          <span
            className={`tabular-nums ${row.motor.emissao >= 0.5 ? "text-[#C42B3E] dark:text-[#F6465D]" : ""}`}
            title={`os contratos de alocação soltam ${row.motor.emissao.toFixed(2)} pp do supply por mês`}
          >
            {row.motor.emissao < 0.01 ? "—" : `${row.motor.emissao.toFixed(1)}pp`}
          </span>
        )}
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums">{money(row.openInterestUsd)}</td>
      <td className="py-2.5 pr-3 text-right tabular-nums">
        {row.perpDominance > 0 ? `${row.perpDominance.toFixed(0)}x` : "—"}
      </td>
      <td className="py-2.5 pr-3">
        {row.vida ? (
          <span className={ESTAGIO_TONE[row.vida.estagio]}>{row.vida.estagio}</span>
        ) : (
          <span className="text-black/25 dark:text-white/25">—</span>
        )}
        {row.vida && (
          <p className="text-xs text-black/35 dark:text-white/35 tabular-nums">
            {signed(row.vida.queda)} do topo · {signed(row.vida.altaDesdeFundo)} do fundo
          </p>
        )}
      </td>
      <td className="py-2.5 pr-3">
        {row.leitura && row.leitura.vies !== "observar" ? (
          <span
            className={`text-xs px-2 py-0.5 rounded-md border ${VIES_STYLE[row.leitura.vies]}`}
            title={row.leitura.titulo}
          >
            {VIES_LABEL[row.leitura.vies]}
          </span>
        ) : (
          <span className="text-black/20 dark:text-white/20 text-xs">—</span>
        )}
      </td>
      <td className="py-2.5 pr-3">
        {row.moveKind ? (
          <span className={MOVE_TONE[row.moveKind]}>
            {MOVE_LABEL[row.moveKind]} {signed(row.moveChange)}
          </span>
        ) : (
          <span className="text-black/25 dark:text-white/25">—</span>
        )}
      </td>
      <td className="py-2.5 pr-3 text-center">
        {row.motor ? (
          <span
            title={row.motor.resumo}
            className={`tabular-nums text-xs ${
              row.motor.motores === row.motor.medidos && row.motor.medidos >= 3
                ? "text-[#0ECB81]"
                : row.motor.motores === 0
                  ? "text-black/30 dark:text-white/30"
                  : ""
            }`}
          >
            {row.motor.motores}/{row.motor.medidos}
          </span>
        ) : (
          <span className="text-black/20 dark:text-white/20">—</span>
        )}
      </td>
      <td className="py-2.5 pr-3 text-center">
        {row.whaleExiting ? (
          <span title={`largaram ${(row.whaleExitShare * 100).toFixed(1)}% do livro`}>🐋</span>
        ) : (
          <span className="text-black/15 dark:text-white/15">·</span>
        )}
      </td>
      <td className="py-2.5">
        <Score value={row.score} />
      </td>
    </tr>
  );
}

export default async function Radar() {
  const [snapshot, placar, guardada, garimpo] = await Promise.all([
    getSnapshot(),
    getPlacar(),
    getCarteira(),
    getGarimpo(),
  ]);
  const rows = snapshot.moedas;

  // A carteira é recalculada só quando o retrato roda, e o painel ao lado dela
  // se atualiza pela camada viva. Remarcar as posições com os preços que esta
  // página já tem em mãos é aritmética, e sem isso a tela mostra preço novo em
  // cima e posição marcada há horas embaixo.
  const carteira = guardada
    ? remarcar(guardada, new Map(rows.filter((r) => r.price > 0).map((r) => [r.ticker, r.price])))
    : null;
  const comCarteiras = rows.filter((r) => r.hasWallets).length;

  const porVies = (v: Vies) =>
    rows
      .filter((r) => r.leitura?.vies === v)
      .sort((a, b) => (b.leitura?.forca ?? 0) - (a.leitura?.forca ?? 0) || b.score - a.score);

  const vender = porVies("short");
  const comprar = porVies("long");
  const mortas = rows.filter((r) => r.vida?.estagio === "exausta");

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black">
      <main className="flex-1 max-w-6xl mx-auto w-full px-6 py-12 flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <Link
            href="/"
            className="text-sm text-black/50 dark:text-white/50 hover:underline w-fit"
          >
            ← gráfico do bitcoin
          </Link>
          <h1 className="text-3xl font-bold">Radar de moedas manipuladas</h1>
          <p className="text-black/60 dark:text-white/60 max-w-3xl">
            {rows.length} moedas vigiadas, {comCarteiras} com carteiras mapeadas na
            blockchain. A ordem é por quanto cada uma merece atenção agora — não por
            tamanho, que colocaria em cima justamente as que não estão fazendo nada.
            Clique numa moeda para o retrato completo.
          </p>
          {/* Duas idades, porque são dois relógios: preço e posicionamento se
              refazem em segundos, estágio de vida custa dez arquivos por moeda.
              Mostrar uma idade só estava errando a de metade dos números. */}
          <p className="text-xs text-black/40 dark:text-white/40">
            Estágio e leitura de{" "}
            {new Date(snapshot.geradoEm).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {snapshot.idadeMinutos >= 1 &&
              ` · ${
                snapshot.idadeMinutos >= 120
                  ? `${Math.round(snapshot.idadeMinutos / 60)} h atrás`
                  : `${Math.round(snapshot.idadeMinutos)} min atrás`
              }`}
            {snapshot.fonte === "cálculo" && " · calculado agora"}
            {/* O aviso de workflow parado continua aparecendo mesmo com a camada
                viva por cima: uma coisa é o preço estar fresco, outra é o
                retrato ter parado de ser tirado. Esconder a segunda porque a
                primeira foi resolvida deixaria o workflow quebrado em silêncio. */}
            {snapshot.parado ? (
              <span className="text-[#F6465D]"> · parado há horas, confira o workflow</span>
            ) : snapshot.atrasado ? (
              <span className="text-[#F0B90B]"> · atrasado</span>
            ) : null}
            {snapshot.vivoEm !== null && snapshot.fonte !== "cálculo" && (
              <span className="text-[#0ECB81]">
                {" "}
                · preço, open interest e posicionamento refeitos agora
              </span>
            )}
          </p>
          {snapshot.novas.length > 0 && (
            <p className="text-xs text-black/40 dark:text-white/40">
              {snapshot.novas.join(", ")} {snapshot.novas.length === 1 ? "entrou" : "entraram"} na
              lista depois do último retrato: aparecem com preço e posicionamento, sem estágio nem
              leitura, até o workflow rodar de novo.
            </p>
          )}
        </header>

        {/* O painel dizendo o que a própria régua já acertou. Vem ANTES das
            recomendações de propósito: quem lê "vender" precisa saber, na mesma
            tela, que o viés ainda não separou de nada. */}
        {carteira && <CarteiraPanel c={carteira} />}

        {placar && (
          <section className="rounded-xl border border-black/10 dark:border-white/10 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">O placar do próprio painel</h2>
              {/* A JANELA NÃO É CARIMBO DE FRESCOR, e sem o `medido em` ela
                  parecia um. Ela diz sobre que período o placar foi calculado;
                  QUANDO ele foi calculado é outra coisa, e o `npm run placar` não
                  roda no workflow — ele pode ter dias. Mostrar as duas datas é o
                  que impede a segunda de se passar pela primeira. */}
              <span className="text-xs text-black/40 dark:text-white/40 tabular-nums">
                {placar.emissoes.toLocaleString("pt-BR")} emissões · {placar.moedas} moedas ·{" "}
                {placar.janela.de.slice(0, 10)} a {placar.janela.ate.slice(0, 10)}
                {placar.geradoEm > 0 && (
                  <> · medido em {new Date(placar.geradoEm).toISOString().slice(0, 10)}</>
                )}
              </span>
            </div>
            <p className="text-xs text-black/55 dark:text-white/55 mt-1.5">
              Cada viés que esteve nesta tela, comparado com o que o preço fez{" "}
              {placar.horizonte}h depois. A referência — todas as moedas, todo o período —
              é {(placar.referencia * 100).toFixed(2)}%, e é dela que a distância importa:
              numa semana de queda geral um viés negativo não errou, apenas descreveu o
              mercado.
            </p>
            <div className="flex flex-wrap gap-x-6 gap-y-1 mt-2.5 text-xs tabular-nums">
              {placar.vereditos.map((v) => (
                <span key={v.vies} className="flex items-baseline gap-1.5">
                  <span className="font-medium">{v.vies}</span>
                  <span className={v.passa ? "text-[#0a7d43] dark:text-[#0ECB81]" : "text-black/45 dark:text-white/45"}>
                    {v.delta >= 0 ? "+" : "−"}
                    {Math.abs(v.delta * 100).toFixed(2)} p.p.
                  </span>
                  <span className="text-black/35 dark:text-white/35">
                    {(v.concordancia * 100).toFixed(0)}% das moedas
                  </span>
                </span>
              ))}
            </div>
            {placar.vereditos.every((v) => !v.passa) && (
              <p className="text-xs text-[#C42B3E] dark:text-[#F6465D] mt-2">
                Nenhum viés separou da referência com concordância entre moedas nesta janela.
                Trate o que está abaixo como descrição do estado das moedas, não como
                recomendação.
              </p>
            )}
          </section>
        )}

        <div className="grid gap-4 lg:grid-cols-2">
          {[
            { titulo: "Candidatas a vender", lista: vender, tom: "border-[#F6465D]/40 bg-[#F6465D]/5" },
            { titulo: "Candidatas a comprar", lista: comprar, tom: "border-[#0ECB81]/40 bg-[#0ECB81]/5" },
          ].map(({ titulo, lista, tom }) => (
            <section key={titulo} className={`rounded-xl border p-5 ${tom}`}>
              <h2 className="font-semibold">
                {titulo} ({lista.length})
              </h2>
              {lista.length === 0 ? (
                <p className="text-sm text-black/50 dark:text-white/50 mt-2">
                  Nenhuma moeda com essa combinação agora. É o resultado mais comum, e é
                  informação: o setup não existe na maior parte do tempo.
                </p>
              ) : (
                <ul className="mt-3 flex flex-col gap-3 text-sm">
                  {lista.slice(0, 4).map((r) => (
                    <li key={r.symbol}>
                      <Link href={`/radar/${r.ticker}`} className="font-medium hover:underline">
                        {r.ticker}
                      </Link>
                      <span className="text-black/40 dark:text-white/40 text-xs">
                        {" "}
                        · {r.vida?.estagio} · força {r.leitura?.forca}/3
                      </span>
                      <p className="text-black/60 dark:text-white/60">{r.leitura?.titulo}</p>
                      <p className="text-xs text-black/45 dark:text-white/45 mt-0.5">
                        {r.leitura?.porque}
                      </p>
                      {r.leitura?.ateQuando && (
                        <p className="text-xs text-black/60 dark:text-white/60 mt-1 border-l-2 border-black/15 dark:border-white/15 pl-2">
                          {r.leitura.ateQuando}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        {mortas.length > 0 && (
          <p className="text-sm text-black/50 dark:text-white/50">
            <span className="font-medium">{mortas.length} já cumpriram o ciclo</span> —{" "}
            {mortas.map((r) => r.ticker).join(", ")}. Caíram mais de 60% de um topo antigo e
            não acharam comprador desde então. Vender agora é pagar financiamento para
            capturar o que sobrou.
          </p>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1400px]">
            <thead className="text-black/45 dark:text-white/45 text-xs">
              <tr>
                <th className="font-normal pb-2 text-left">Moeda</th>
                <th className="font-normal pb-2 text-right">Preço</th>
                <th className="font-normal pb-2 text-right">24h</th>
                <th
                  className="font-normal pb-2 text-right"
                  title="Circulante × preço. Diferente do FDV, que conta como valor o que ainda nem circula."
                >
                  Market cap
                </th>
                <th className="font-normal pb-2 text-right">Liquidez</th>
                <th
                  className="font-normal pb-2 text-right"
                  title="Circulante ÷ supply total. Float pequeno é a condição que torna a manipulação barata; o resto é promessa de oferta futura."
                >
                  Circulando
                </th>
                <th
                  className="font-normal pb-2 text-right"
                  title="Quanto do supply ainda está com quem o recebeu na distribuição inicial. Acima de 50% a moeda tem dono, não float — e aí supply fora de corretora não é munição livre."
                >
                  Dono
                </th>
                <th
                  className="font-normal pb-2 text-right"
                  title="Pontos percentuais do supply que os contratos de alocação soltam por mês. É oferta programada: o comprador está do outro lado dela."
                >
                  Solta
                </th>
                <th className="font-normal pb-2 text-right">Open interest</th>
                <th className="font-normal pb-2 text-right" title="Open interest dividido pela liquidez à vista">
                  Perp ÷ pool
                </th>
                <th className="font-normal pb-2 text-left" title="Onde a moeda está na própria vida">
                  Estágio
                </th>
                <th className="font-normal pb-2 text-left" title="O cruzamento do estágio com o que acontece agora">
                  Leitura
                </th>
                <th className="font-normal pb-2 text-left">Perna atual</th>
                <th
                  className="font-normal pb-2 text-center"
                  title="Ainda há com que empurrar: perpétuo com tamanho, pool que gire e oferta fora das corretoras. Mede capacidade, não intenção."
                >
                  Motor
                </th>
                <th className="font-normal pb-2 text-center" title="Contas grandes desmontando comprado perto do topo">
                  🐋
                </th>
                <th className="font-normal pb-2 text-left">Atenção</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row key={row.symbol} row={row} referencia={snapshot.geradoEm} />
              ))}
            </tbody>
          </table>
        </div>

        {/* Depois da tabela de propósito: estas moedas não têm contrato
            conferido, nem leitura on-chain, nem histórico. Dar a elas o topo da
            página seria dar o mesmo peso visual de uma leitura completa. */}
        {garimpo && <GarimpoPanel g={garimpo} />}

        <p className="text-xs text-black/40 dark:text-white/40 max-w-3xl">
          Perpétuo pela API pública da Gate, mercado à vista pelo DexScreener, blockchain
          por nós públicos — nenhuma chave de API envolvida. A coluna
          <span className="font-medium"> perp ÷ pool </span>
          é a mais subestimada: quando o open interest vale dezenas de vezes a liquidez à
          vista, o preço não é feito por quem compra a moeda, e sim por quem aposta nela. A
          coluna <span className="font-medium">circulando</span> mostra quanto do supply
          realmente anda — abaixo de 30% o resto é promessa de oferta futura, e cada unlock
          converte um pedaço dela em oferta real. A coluna
          <span className="font-medium"> motor </span>
          conta quantos dos três testes de capacidade passam — perpétuo com tamanho, pool
          que gire, oferta fora das corretoras. Ela mede se a moeda AINDA PODE ser
          empurrada; não mede se alguém vai empurrar, e não distingue um dono com 80% de
          dez mil donos com 80%, o que exigiria a lista de maiores detentores.
          Nada aqui é recomendação de investimento.
        </p>
      </main>
    </div>
  );
}
