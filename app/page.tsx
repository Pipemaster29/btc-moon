import Link from "next/link";
import LivePrice from "@/components/LivePrice";
import LivePriceProvider from "@/components/LivePriceProvider";
import PriceChart from "@/components/PriceChart";
import { getBitcoinAnalysis } from "@/lib/bitcoin";
import {
  MOON_PHASE_LABEL,
  MOON_PHASE_SYMBOL,
  moonPhasesBetween,
} from "@/lib/moon";

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
      <p className="text-sm text-black/60 dark:text-white/60">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      {hint && (
        <p className="text-xs text-black/40 dark:text-white/40 mt-1">{hint}</p>
      )}
    </div>
  );
}

/** Próxima mudança de fase a partir de agora. */
function nextMoonPhase() {
  const now = new Date();
  const horizon = new Date(now.getTime() + 40 * 86400 * 1000);
  return moonPhasesBetween(now, horizon)[0];
}

export default async function Home() {
  const analysis = await getBitcoinAnalysis();
  const nextPhase = nextMoonPhase();

  const rsiSignal =
    analysis.rsi14 >= 70
      ? "Sobrecomprado"
      : analysis.rsi14 <= 30
        ? "Sobrevendido"
        : "Neutro";
  const trendSignal = analysis.sma7 >= analysis.sma30 ? "Alta" : "Baixa";

  return (
    <LivePriceProvider>
      <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black">
        <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-12 flex flex-col gap-8">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-3xl font-bold">BTC Moon 🌙</h1>
              <p className="text-black/60 dark:text-white/60 mt-1 mb-3">
                Análise de Bitcoin com dados públicos e indicadores matemáticos,
                com as fases da lua sobrepostas ao gráfico.
              </p>
              {/* A cotação ao vivo vem da KuCoin; o histórico continua vindo da
                Bitstamp, então a variação usa o fechamento de ontem como base. */}
              <LivePrice referenceClose={analysis.previousClose} />
            </div>
            <Link
              href="/analise"
              className="text-sm px-3 py-2 rounded-md border border-black/15 dark:border-white/15 hover:bg-black/5 dark:hover:bg-white/10 transition-colors whitespace-nowrap"
            >
              A lua move o preço? →
            </Link>
          </header>

          <PriceChart />

          <section className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <StatCard
              label="Preço atual"
              value={formatUsd(analysis.currentPrice)}
            />
            <StatCard label="SMA 7d" value={formatUsd(analysis.sma7)} />
            <StatCard label="SMA 30d" value={formatUsd(analysis.sma30)} />
            <StatCard label="EMA 12d" value={formatUsd(analysis.ema12)} />
            <StatCard
              label="Volatilidade anualizada"
              value={`${analysis.volatility.toFixed(1)}%`}
            />
            <StatCard
              label="RSI 14d"
              value={analysis.rsi14.toFixed(1)}
              hint={rsiSignal}
            />
          </section>

          <section className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
              <p className="text-sm text-black/60 dark:text-white/60">
                Tendência (SMA7 vs SMA30)
              </p>
              <p className="text-xl font-semibold mt-1">{trendSignal}</p>
            </div>

            {nextPhase && (
              <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
                <p className="text-sm text-black/60 dark:text-white/60">
                  Próxima fase da lua
                </p>
                <p className="text-xl font-semibold mt-1">
                  {MOON_PHASE_SYMBOL[nextPhase.phase]}{" "}
                  {MOON_PHASE_LABEL[nextPhase.phase]}
                </p>
                <p className="text-xs text-black/40 dark:text-white/40 mt-1">
                  {nextPhase.date.toLocaleString("pt-BR", {
                    dateStyle: "long",
                    timeStyle: "short",
                    timeZone: "UTC",
                  })}{" "}
                  UTC
                </p>
              </div>
            )}
          </section>

          <footer className="text-xs text-black/40 dark:text-white/40">
            Preços via API pública da Bitstamp (histórico desde 2011). Fases da
            lua calculadas pelo algoritmo de Jean Meeus. Não é recomendação de
            investimento.
          </footer>
        </main>
      </div>
    </LivePriceProvider>
  );
}
