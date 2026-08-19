import Link from "next/link";
import PositioningPanel from "@/components/PositioningPanel";
import { getRadar, type AlertLevel, type RadarSnapshot } from "@/lib/radar";
import { getPositioning, type PositioningSnapshotView } from "@/lib/positioning";
import { WATCHLIST } from "@/lib/watchlist";

/**
 * O painel é leitura ao vivo da cadeia, então revalida de cinco em cinco
 * minutos: mais rápido que isso só castiga os nós públicos sem mostrar nada
 * novo — bloco leva segundos, mas saldo de baleia não muda a cada minuto.
 */
export const revalidate = 300;

export const metadata = {
  title: "BTC Moon · Radar de manipulação",
  description:
    "Quem segura o supply, quanto está travado e o que pode virar venda — lido direto da blockchain.",
};

/** Nome de exibição da rede — o identificador interno é minúsculo. */
const CHAIN_LABEL: Record<string, string> = {
  bsc: "BNB Chain",
  base: "Base",
};

const ROLE_COLOR: Record<string, string> = {
  lock: "bg-[#8B5CF6]",
  dormant: "bg-[#F0B90B]",
  exchange: "bg-[#0ECB81]",
  treasury: "bg-[#F6465D]",
  operational: "bg-[#3B82F6]",
  router: "bg-[#EC4899]",
  unmapped: "bg-black/25 dark:bg-white/25",
};

const ALERT_STYLE: Record<AlertLevel, string> = {
  danger: "border-[#F6465D]/40 bg-[#F6465D]/5",
  warning: "border-[#F0B90B]/40 bg-[#F0B90B]/5",
  info: "border-black/10 dark:border-white/10",
};

const ALERT_MARK: Record<AlertLevel, string> = {
  danger: "▲",
  warning: "●",
  info: "○",
};

function units(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)} bi`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)} mi`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)} mil`;
  return v.toFixed(0);
}

function money(v: number): string {
  if (v >= 1e9) return `US$ ${(v / 1e9).toFixed(2)} bi`;
  if (v >= 1e6) return `US$ ${(v / 1e6).toFixed(1)} mi`;
  if (v >= 1e3) return `US$ ${(v / 1e3).toFixed(0)} mil`;
  return `US$ ${v.toFixed(0)}`;
}

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
      <p className="text-sm text-black/60 dark:text-white/60">{label}</p>
      <p className="text-2xl font-semibold mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-black/40 dark:text-white/40 mt-1">{hint}</p>}
    </div>
  );
}

function SupplyBar({ snapshot }: { snapshot: RadarSnapshot }) {
  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
      <h2 className="font-semibold text-lg">Estrutura do supply</h2>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1">
        O market cap divulgado supõe que o supply circulante é vendável. Somando por
        papel dá para conferir essa suposição em vez de aceitá-la.
      </p>

      <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full">
        {snapshot.supplyBreakdown
          .filter((slice) => slice.pct > 0)
          .map((slice) => (
            <div
              key={slice.role}
              className={ROLE_COLOR[slice.role]}
              style={{ width: `${slice.pct * 100}%` }}
              title={`${slice.label}: ${(slice.pct * 100).toFixed(2)}%`}
            />
          ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm min-w-[34rem]">
          <thead className="text-black/50 dark:text-white/50">
            <tr className="text-left">
              <th className="font-normal pb-2">Papel</th>
              <th className="font-normal pb-2 text-right">Quantidade</th>
              <th className="font-normal pb-2 text-right">%</th>
              <th className="font-normal pb-2 text-right">Valor</th>
              <th className="font-normal pb-2 pl-4">O que significa</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.supplyBreakdown.map((slice) => (
              <tr key={slice.role} className="border-t border-black/5 dark:border-white/5">
                <td className="py-2">
                  <span className="inline-flex items-center gap-2">
                    <span className={`inline-block size-2 rounded-full ${ROLE_COLOR[slice.role]}`} />
                    {slice.label}
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums">{units(slice.amount)}</td>
                <td className="py-2 text-right tabular-nums">{(slice.pct * 100).toFixed(2)}%</td>
                <td className="py-2 text-right tabular-nums">{money(slice.valueUsd)}</td>
                <td className="py-2 pl-4 text-black/50 dark:text-white/50">{slice.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm mt-4 pt-4 border-t border-black/10 dark:border-white/10">
        <strong>Oferta destravada: {units(snapshot.sellable)}</strong> (
        {((snapshot.sellable / snapshot.supply) * 100).toFixed(2)}% ·{" "}
        {money(snapshot.sellable * snapshot.priceUsd)}) — é este o volume que o preço
        precisaria absorver, e não o supply.
      </p>
    </section>
  );
}

function Wallets({ snapshot }: { snapshot: RadarSnapshot }) {
  const sorted = [...snapshot.wallets].sort((a, b) => b.amount - a.amount);

  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
      <h2 className="font-semibold text-lg">Carteiras vigiadas</h2>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1">
        {snapshot.wallets.length} endereços cobrindo{" "}
        {((snapshot.mapped / snapshot.supply) * 100).toFixed(2)}% do supply. A coluna de
        gás é o que decide se o saldo pode virar venda hoje.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm min-w-[42rem]">
          <thead className="text-black/50 dark:text-white/50">
            <tr className="text-left">
              <th className="font-normal pb-2">Carteira</th>
              <th className="font-normal pb-2">Endereço</th>
              <th className="font-normal pb-2 text-right">Saldo</th>
              <th className="font-normal pb-2 text-right">Valor</th>
              <th className="font-normal pb-2 text-right">% supply</th>
              <th className="font-normal pb-2 text-right">{snapshot.gasSymbol}</th>
              <th className="font-normal pb-2 pl-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((wallet) => (
              <tr
                key={wallet.address}
                className="border-t border-black/5 dark:border-white/5"
              >
                <td className="py-2">
                  <span className="inline-flex items-center gap-2">
                    <span className={`inline-block size-2 rounded-full ${ROLE_COLOR[wallet.role]}`} />
                    {wallet.label}
                    {!wallet.verified && (
                      <span
                        className="text-[10px] text-black/40 dark:text-white/40"
                        title="Rótulo informado por terceiros, não conferido on-chain"
                      >
                        ?
                      </span>
                    )}
                  </span>
                </td>
                <td className="py-2 font-mono text-xs text-black/50 dark:text-white/50">
                  <a
                    href={`${snapshot.explorer}/address/${wallet.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    {short(wallet.address)}
                  </a>
                </td>
                <td className="py-2 text-right tabular-nums">{units(wallet.amount)}</td>
                <td className="py-2 text-right tabular-nums">{money(wallet.valueUsd)}</td>
                <td className="py-2 text-right tabular-nums">
                  {(wallet.pctSupply * 100).toFixed(3)}%
                </td>
                <td className="py-2 text-right tabular-nums text-black/50 dark:text-white/50">
                  {wallet.gas.toFixed(3)}
                </td>
                <td className="py-2 pl-3">
                  {wallet.armed ? (
                    <span className="text-[#F6465D] font-medium">armada</span>
                  ) : wallet.stuck ? (
                    <span className="text-black/40 dark:text-white/40">sem gás</span>
                  ) : wallet.role === "lock" ? (
                    <span className="text-[#8B5CF6]">travada</span>
                  ) : (
                    <span className="text-black/40 dark:text-white/40">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Transfers({ snapshot }: { snapshot: RadarSnapshot }) {
  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
      <h2 className="font-semibold text-lg">Movimentação recente</h2>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1">
        {snapshot.transfersScanned.toLocaleString("pt-BR")} transferências nas últimas{" "}
        {snapshot.windowHours.toFixed(1)}h. Os nós públicos só servem log recente, então
        esta é a janela inteira que existe sem chave paga.
      </p>

      {snapshot.bigTransfers.length === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50 mt-4">
          Nenhuma transferência grande perto do tamanho da pool no período.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2 text-sm">
          {snapshot.bigTransfers.map((t) => (
            <li
              key={`${t.block}-${t.from}-${t.to}-${t.amount}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-black/5 dark:border-white/5 pt-2"
            >
              <span className="tabular-nums font-medium">{units(t.amount)}</span>
              <span className="tabular-nums text-black/50 dark:text-white/50">
                {money(t.valueUsd)}
              </span>
              <span className="text-black/70 dark:text-white/70">
                {t.fromLabel} <span className="text-black/30 dark:text-white/30">→</span>{" "}
                {t.toLabel}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function Radar() {
  // O on-chain só existe para quem tem contrato configurado; o perpétuo existe
  // para todos os símbolos da lista, inclusive os que não vivem na BSC.
  const [onchain, positioning] = await Promise.all([
    Promise.all(WATCHLIST.filter((t) => t.contract).map((t) => getRadar(t.symbol))),
    Promise.all(WATCHLIST.map((t) => getPositioning(t.symbol))),
  ]);

  const snapshots = onchain.filter((s): s is RadarSnapshot => s !== null);

  const perpBySymbol = new Map<string, PositioningSnapshotView>();
  for (const p of positioning) if (p) perpBySymbol.set(p.symbol, p);

  // Símbolos que só têm leitura de derivativos, sem lado on-chain.
  const perpOnly = WATCHLIST.filter(
    (t) => !t.contract && perpBySymbol.has(t.symbol),
  );

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black">
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-12 flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <Link
            href="/"
            className="text-sm text-black/50 dark:text-white/50 hover:underline w-fit"
          >
            ← voltar ao gráfico
          </Link>
          <h1 className="text-3xl font-bold">Radar de manipulação</h1>
          <p className="text-black/60 dark:text-white/60">
            Quem segura o supply, quanto está travado e o que pode virar venda — lido
            direto da blockchain, sem chave de API.
          </p>
        </header>

        {snapshots.map((snapshot) => (
          <div key={snapshot.symbol} className="flex flex-col gap-6">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-xl font-semibold">{snapshot.tokenSymbol}</h2>
              <span className="text-sm text-black/50 dark:text-white/50 font-mono">
                {short(snapshot.contract)}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Preço à vista"
                value={`US$ ${snapshot.priceUsd.toPrecision(4)}`}
                hint={`${snapshot.pools} ${snapshot.pools === 1 ? "pool" : "pools"} na ${CHAIN_LABEL[snapshot.chain]}`}
              />
              <Stat
                label="Valor de todo o supply"
                value={money(snapshot.fdv)}
                hint={`${units(snapshot.supply)} de tokens`}
              />
              <Stat
                label="Liquidez à vista"
                value={money(snapshot.liquidityUsd)}
                hint={`volume 24h ${money(snapshot.volume24h)}`}
              />
              <Stat
                label="Destravado ÷ liquidez"
                value={
                  snapshot.liquidityUsd > 0
                    ? `${((snapshot.sellable * snapshot.priceUsd) / snapshot.liquidityUsd).toFixed(0)}x`
                    : "—"
                }
                hint="quantas vezes a pool seria estourada"
              />
            </div>

            {snapshot.alerts.length > 0 && (
              <section className="flex flex-col gap-3">
                {snapshot.alerts.map((alert) => (
                  <div
                    key={alert.title}
                    className={`rounded-xl border p-4 ${ALERT_STYLE[alert.level]}`}
                  >
                    <p className="font-medium flex items-baseline gap-2">
                      <span aria-hidden className="text-xs">
                        {ALERT_MARK[alert.level]}
                      </span>
                      {alert.title}
                    </p>
                    <p className="text-sm text-black/60 dark:text-white/60 mt-1">
                      {alert.detail}
                    </p>
                  </div>
                ))}
              </section>
            )}

            {perpBySymbol.has(snapshot.symbol) && (
              <PositioningPanel snapshot={perpBySymbol.get(snapshot.symbol)!} />
            )}

            <SupplyBar snapshot={snapshot} />
            <Wallets snapshot={snapshot} />
            <Transfers snapshot={snapshot} />
          </div>
        ))}

        {perpOnly.map((token) => (
          <div key={token.symbol} className="flex flex-col gap-6">
            <div className="flex flex-wrap items-baseline gap-3">
              <h2 className="text-xl font-semibold">{token.symbol.replace("USDT", "")}</h2>
              <span className="text-sm text-black/50 dark:text-white/50">
                só derivativos
              </span>
            </div>
            <p className="text-sm text-black/60 dark:text-white/60">
              O PRL negociado com volume é o Perle, que vive na Solana — fora do alcance
              da leitura on-chain daqui. O contrato BSC de mesmo símbolo é outro projeto,
              com US$ 445 mil de FDV e quatro negócios por dia: usá-lo mediria a moeda
              errada, então este símbolo é acompanhado só pelo lado do perpétuo.
            </p>
            <PositioningPanel snapshot={perpBySymbol.get(token.symbol)!} />
          </div>
        ))}

        <p className="text-xs text-black/40 dark:text-white/40">
          Leitura pública da BNB Smart Chain e do DexScreener, sem chave de API. Rótulos
          marcados com <span className="font-mono">?</span> vieram de terceiros e não foram
          conferidos on-chain. Nada aqui é recomendação de investimento.
        </p>
      </main>
    </div>
  );
}
