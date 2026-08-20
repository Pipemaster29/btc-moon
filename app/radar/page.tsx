import Link from "next/link";
import { getOverview, type OverviewRow } from "@/lib/overview";
import type { MoveKind } from "@/lib/positioning";

// Duas chamadas por moeda: dá para atualizar com frequência sem castigar as
// APIs públicas, que não pedem chave e não deveriam ser abusadas por isso.
export const revalidate = 180;

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

function Row({ row }: { row: OverviewRow }) {
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
      <td className="py-2.5 pr-3 text-right tabular-nums">{money(row.openInterestUsd)}</td>
      <td className="py-2.5 pr-3 text-right tabular-nums">
        {row.perpDominance > 0 ? `${row.perpDominance.toFixed(0)}x` : "—"}
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums">
        {row.accountRatio > 0 ? row.accountRatio.toFixed(2) : "—"}
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
  const rows = await getOverview();
  const quentes = rows.filter((r) => r.score >= 35);
  const comCarteiras = rows.filter((r) => r.hasWallets).length;

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
        </header>

        {quentes.length > 0 && (
          <section className="rounded-xl border border-[#F0B90B]/40 bg-[#F0B90B]/5 p-5">
            <h2 className="font-semibold">
              {quentes.length} {quentes.length === 1 ? "moeda pedindo" : "moedas pedindo"} atenção
            </h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {quentes.slice(0, 6).map((r) => (
                <li key={r.symbol}>
                  <Link href={`/radar/${r.ticker}`} className="font-medium hover:underline">
                    {r.ticker}
                  </Link>
                  <span className="text-black/60 dark:text-white/60">
                    {" — "}
                    {r.reasons.join(" · ")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="text-black/45 dark:text-white/45 text-xs">
              <tr>
                <th className="font-normal pb-2 text-left">Moeda</th>
                <th className="font-normal pb-2 text-right">Preço</th>
                <th className="font-normal pb-2 text-right">24h</th>
                <th className="font-normal pb-2 text-right">Liquidez</th>
                <th className="font-normal pb-2 text-right">Open interest</th>
                <th className="font-normal pb-2 text-right" title="Open interest dividido pela liquidez à vista">
                  Perp ÷ pool
                </th>
                <th className="font-normal pb-2 text-right" title="Contas compradas ÷ vendidas, por cabeça">
                  Varejo
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
          vista, o preço não é feito por quem compra a moeda, e sim por quem aposta nela.
          Nada aqui é recomendação de investimento.
        </p>
      </main>
    </div>
  );
}
