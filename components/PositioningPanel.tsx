import type { PositioningSnapshotView, RiseKind, Verdict } from "@/lib/positioning";
import type { LiquidationLevel } from "@/lib/liquidation";

/** Alta a crédito é frágil; alta por oferta é a que se sustenta. */
const RISE_STYLE: Record<RiseKind, string> = {
  alavancagem: "border-[#F6465D]/40 bg-[#F6465D]/5",
  oferta: "border-[#0ECB81]/40 bg-[#0ECB81]/5",
  misto: "border-[#F0B90B]/40 bg-[#F0B90B]/5",
  "sem alta": "border-black/10 dark:border-white/10",
};

const RISE_LABEL: Record<RiseKind, string> = {
  alavancagem: "Alta movida a alavancagem",
  oferta: "Alta movida a oferta",
  misto: "Origem da alta indefinida",
  "sem alta": "Sem alta relevante",
};

const VERDICT_STYLE: Record<Verdict, string> = {
  sell: "border-[#0ECB81]/40 bg-[#0ECB81]/5",
  avoid: "border-[#F6465D]/40 bg-[#F6465D]/5",
  wait: "border-[#F0B90B]/40 bg-[#F0B90B]/5",
  unclear: "border-black/10 dark:border-white/10",
};

function money(v: number): string {
  if (!Number.isFinite(v)) return "—";
  if (v >= 1e9) return `US$ ${(v / 1e9).toFixed(2)} bi`;
  if (v >= 1e6) return `US$ ${(v / 1e6).toFixed(1)} mi`;
  if (v >= 1e3) return `US$ ${(v / 1e3).toFixed(0)} mil`;
  return `US$ ${v.toFixed(0)}`;
}

function signed(v: number): string {
  if (!Number.isFinite(v)) return "—";
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

function changeColor(v: number): string {
  if (!Number.isFinite(v) || v === 0) return "";
  return v > 0 ? "text-[#0ECB81]" : "text-[#F6465D]";
}

/**
 * Cada nível vira uma barra proporcional ao maior bolsão, para a comparação ser
 * visual em vez de aritmética. A distância até o preço atual importa tanto
 * quanto o tamanho: um bolsão enorme a 25% daqui é uma ameaça diferente de um
 * bolsão menor a 1,5%.
 */
function LiquidationSide({
  levels,
  max,
  price,
  tone,
  title,
  note,
}: {
  levels: LiquidationLevel[];
  max: number;
  price: number;
  tone: string;
  title: string;
  note: string;
}) {
  return (
    <div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-black/50 dark:text-white/50 mt-0.5">{note}</p>

      {levels.length === 0 ? (
        <p className="text-sm text-black/40 dark:text-white/40 mt-3">
          Nenhum bolsão relevante.
        </p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {levels.map((level) => (
            <li key={`${level.side}-${level.price}`} className="text-sm">
              <div className="flex items-baseline justify-between gap-3">
                <span className="tabular-nums">{level.price.toPrecision(5)}</span>
                <span className="tabular-nums text-black/50 dark:text-white/50">
                  {signed(level.price / price - 1)} · {money(level.notional)}
                </span>
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-black/5 dark:bg-white/10">
                <div
                  className={`h-full rounded-full ${tone}`}
                  style={{ width: `${max > 0 ? (level.notional / max) * 100 : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function PositioningPanel({
  snapshot,
}: {
  snapshot: PositioningSnapshotView;
}) {
  const max = Math.max(
    ...snapshot.above.map((l) => l.notional),
    ...snapshot.below.map((l) => l.notional),
    0,
  );

  return (
    <div className="flex flex-col gap-6">
      {/* ------------------------------------------------------- veredito */}
      <section className={`rounded-xl border p-5 ${VERDICT_STYLE[snapshot.verdict]}`}>
        <h3 className="font-semibold text-lg">{snapshot.verdictTitle}</h3>
        <p className="text-sm text-black/70 dark:text-white/70 mt-2">
          {snapshot.verdictDetail}
        </p>

        <div className="grid gap-4 sm:grid-cols-3 mt-4 pt-4 border-t border-black/10 dark:border-white/10">
          <div>
            <p className="text-xs text-black/50 dark:text-white/50">Contas em geral</p>
            <p className="text-xl font-semibold tabular-nums">
              {snapshot.accountRatio.toFixed(2)}
            </p>
            <p className="text-xs text-black/40 dark:text-white/40">
              {snapshot.accountRatio > 1 ? "maioria comprada" : "maioria vendida"}
            </p>
          </div>
          <div>
            <p className="text-xs text-black/50 dark:text-white/50">
              Baleias por tamanho
            </p>
            <p className="text-xl font-semibold tabular-nums">
              {snapshot.whaleRatio.toFixed(2)}
            </p>
            <p className="text-xs text-black/40 dark:text-white/40">
              {snapshot.whaleRatio > 1 ? "dinheiro grande comprado" : "dinheiro grande vendido"}
            </p>
          </div>
          <div>
            <p className="text-xs text-black/50 dark:text-white/50">Open interest</p>
            <p className="text-xl font-semibold tabular-nums">
              {money(snapshot.openInterestValue)}
            </p>
            <p className="text-xs text-black/40 dark:text-white/40">no perpétuo da Binance</p>
          </div>
        </div>
      </section>

      {/* --------------------------------------------- natureza da alta */}
      {snapshot.rise.kind !== "sem alta" && (
        <section className={`rounded-xl border p-5 ${RISE_STYLE[snapshot.rise.kind]}`}>
          <h3 className="font-semibold">{RISE_LABEL[snapshot.rise.kind]}</h3>
          <div className="grid gap-4 sm:grid-cols-3 mt-3 text-sm">
            <div>
              <p className="text-black/50 dark:text-white/50">Preço</p>
              <p className={`text-lg font-semibold tabular-nums ${changeColor(snapshot.rise.priceChange)}`}>
                {signed(snapshot.rise.priceChange)}
              </p>
            </div>
            <div>
              <p className="text-black/50 dark:text-white/50">Open interest</p>
              <p className={`text-lg font-semibold tabular-nums ${changeColor(snapshot.rise.oiChange)}`}>
                {signed(snapshot.rise.oiChange)}
              </p>
            </div>
            <div>
              <p className="text-black/50 dark:text-white/50">OI ÷ preço</p>
              <p className="text-lg font-semibold tabular-nums">
                {snapshot.rise.ratio.toFixed(2)}x
              </p>
            </div>
          </div>
          <p className="text-sm text-black/60 dark:text-white/60 mt-3">{snapshot.rise.note}</p>
        </section>
      )}

      {/* ---------------------------------------------------------- base */}
      {snapshot.basis && Math.abs(snapshot.basis.basis) > 0.005 && (
        <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
          <h3 className="font-semibold">Perpétuo contra mercado à vista</h3>
          <div className="grid gap-4 sm:grid-cols-3 mt-3 text-sm">
            <div>
              <p className="text-black/50 dark:text-white/50">Perpétuo</p>
              <p className="text-lg font-semibold tabular-nums">
                {snapshot.basis.perp.toPrecision(5)}
              </p>
            </div>
            <div>
              <p className="text-black/50 dark:text-white/50">À vista on-chain</p>
              <p className="text-lg font-semibold tabular-nums">
                {snapshot.basis.spot.toPrecision(5)}
              </p>
            </div>
            <div>
              <p className="text-black/50 dark:text-white/50">Base</p>
              <p
                className={`text-lg font-semibold tabular-nums ${changeColor(snapshot.basis.basis)}`}
              >
                {signed(snapshot.basis.basis)}
              </p>
            </div>
          </div>

          {Math.abs(snapshot.basis.basis) > 0.03 && (
            <p className="text-sm text-black/60 dark:text-white/60 mt-3">
              Uma base de {signed(snapshot.basis.basis)} não sobrevive num mercado
              arbitrável — some em minutos. Ela persiste aqui porque fechá-la exigiria
              negociar {money(snapshot.basis.openInterestValue)} de open interest contra
              uma pool de {money(snapshot.basis.liquidityUsd)}. Não há por onde: o preço do
              perpétuo não está ancorado em nada além do próprio livro da corretora.
            </p>
          )}
        </section>
      )}

      {/* --------------------------------------------- mapa de liquidação */}
      <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
        <h3 className="font-semibold">Mapa de liquidação estimado</h3>
        <p className="text-sm text-black/60 dark:text-white/60 mt-1">
          Reconstruído de {snapshot.readings.toLocaleString("pt-BR")} leituras de open
          interest de 5 em 5 minutos. Preço de referência {snapshot.price.toPrecision(5)}.
        </p>

        <div className="grid gap-6 sm:grid-cols-2 mt-4">
          <LiquidationSide
            levels={snapshot.below}
            max={max}
            price={snapshot.price}
            tone="bg-[#F6465D]"
            title={`Abaixo · ${money(snapshot.belowTotal)}`}
            note="liquida comprados — combustível para cascata de queda"
          />
          <LiquidationSide
            levels={snapshot.above}
            max={max}
            price={snapshot.price}
            tone="bg-[#0ECB81]"
            title={`Acima · ${money(snapshot.aboveTotal)}`}
            note="liquida vendidos — combustível para squeeze de alta"
          />
        </div>

        <p className="text-xs text-black/40 dark:text-white/40 mt-4 pt-4 border-t border-black/10 dark:border-white/10">
          O mapa é <strong>deduzido</strong> do open interest, não observado — não existe
          fonte gratuita das posições reais. Ele supõe uma distribuição típica de
          alavancagem, e nada garante que a desta moeda seja típica; num livro controlado,
          menos ainda. Serve para ordenar hipóteses, não para dimensionar risco.
        </p>
      </section>

      {/* -------------------------------------------------------- tabela */}
      <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
        <h3 className="font-semibold">Últimos {snapshot.rows.length} dias</h3>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm min-w-[40rem]">
            <thead className="text-black/50 dark:text-white/50">
              <tr className="text-left">
                <th className="font-normal pb-2">Data</th>
                <th className="font-normal pb-2 text-right">Fechamento</th>
                <th className="font-normal pb-2 text-right">Variação</th>
                <th className="font-normal pb-2 text-right">Volume</th>
                <th className="font-normal pb-2 text-right">OI</th>
                <th className="font-normal pb-2 text-right">Δ OI</th>
                <th className="font-normal pb-2 text-right">Contas</th>
                <th className="font-normal pb-2 text-right">Baleias</th>
              </tr>
            </thead>
            <tbody>
              {snapshot.rows.map((row) => (
                <tr key={row.date} className="border-t border-black/5 dark:border-white/5">
                  <td className="py-2 tabular-nums">{row.date.slice(5)}</td>
                  <td className="py-2 text-right tabular-nums">{row.close.toPrecision(5)}</td>
                  <td className={`py-2 text-right tabular-nums ${changeColor(row.change)}`}>
                    {signed(row.change)}
                  </td>
                  <td className="py-2 text-right tabular-nums text-black/50 dark:text-white/50">
                    {money(row.volumeUsd)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {money(row.openInterestValue)}
                  </td>
                  <td
                    className={`py-2 text-right tabular-nums ${changeColor(row.openInterestChange)}`}
                  >
                    {signed(row.openInterestChange)}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {Number.isFinite(row.accountRatio) ? row.accountRatio.toFixed(2) : "—"}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    {Number.isFinite(row.whaleRatio) ? row.whaleRatio.toFixed(2) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-black/40 dark:text-white/40 mt-3">
          <strong>Contas</strong> conta cabeças entre todos os clientes;{" "}
          <strong>baleias</strong> pesa pelo tamanho da posição das maiores contas. A
          divergência entre as duas é o que separa &ldquo;muita gente comprada&rdquo; de
          &ldquo;muito dinheiro comprado&rdquo;.
        </p>
      </section>
    </div>
  );
}
