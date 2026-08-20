import Link from "next/link";
import type { PanoramaRow } from "@/lib/overview";
import { getSnapshot } from "@/lib/snapshot";
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

function tone(v: number): string {
  if (!Number.isFinite(v) || v === 0) return "";
  return v > 0 ? "text-[#0ECB81]" : "text-[#F6465D]";
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

function Row({ row }: { row: PanoramaRow }) {
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
      <td className="py-2.5 pr-3 text-right tabular-nums">
        {row.price > 0 ? `US$ ${row.price.toPrecision(4)}` : "—"}
      </td>
      <td className={`py-2.5 pr-3 text-right tabular-nums ${tone(row.change24h)}`}>
        {signed(row.change24h)}
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
        {row.vida?.unlocks?.some((u) => Date.now() - u.quando <= 21 * 86400_000 && u.variacao >= 0.05) && (
          <p className="text-xs text-[#F6465D]">unlock</p>
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
  const snapshot = await getSnapshot();
  const rows = snapshot.moedas;
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
          <p className="text-xs text-black/40 dark:text-white/40">
            Retrato de{" "}
            {new Date(snapshot.geradoEm).toLocaleString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {snapshot.idadeMinutos >= 1 &&
              ` · ${Math.round(snapshot.idadeMinutos)} min atrás`}
            {snapshot.fonte === "cálculo" && " · calculado agora"}
            {snapshot.velho && (
              <span className="text-[#F0B90B]">
                {" "}
                · o retrato parou de ser atualizado, confira o workflow
              </span>
            )}
          </p>
        </header>

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
          <table className="w-full text-sm min-w-[1150px]">
            <thead className="text-black/45 dark:text-white/45 text-xs">
              <tr>
                <th className="font-normal pb-2 text-left">Moeda</th>
                <th className="font-normal pb-2 text-right">Preço</th>
                <th className="font-normal pb-2 text-right">24h</th>
                <th className="font-normal pb-2 text-right">Liquidez</th>
                <th
                  className="font-normal pb-2 text-right"
                  title="Circulante ÷ supply total. Float pequeno é a condição que torna a manipulação barata; o resto é promessa de oferta futura."
                >
                  Circulando
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
                <th className="font-normal pb-2 text-center" title="Contas grandes desmontando comprado perto do topo">
                  🐋
                </th>
                <th className="font-normal pb-2 text-left">Atenção</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row key={row.symbol} row={row} />
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-black/40 dark:text-white/40 max-w-3xl">
          Perpétuo pela API pública da Gate, mercado à vista pelo DexScreener, blockchain
          por nós públicos — nenhuma chave de API envolvida. A coluna
          <span className="font-medium"> perp ÷ pool </span>
          é a mais subestimada: quando o open interest vale dezenas de vezes a liquidez à
          vista, o preço não é feito por quem compra a moeda, e sim por quem aposta nela. A
          coluna <span className="font-medium">circulando</span> mostra quanto do supply
          realmente anda — abaixo de 30% o resto é promessa de oferta futura, e cada unlock
          converte um pedaço dela em oferta real.
          Nada aqui é recomendação de investimento.
        </p>
      </main>
    </div>
  );
}
