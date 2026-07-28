import { getBitcoinAnalysis } from "@/lib/bitcoin";

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
      <p className="text-sm text-black/60 dark:text-white/60">{label}</p>
      <p className="text-2xl font-semibold mt-1">{value}</p>
      {hint && <p className="text-xs text-black/40 dark:text-white/40 mt-1">{hint}</p>}
    </div>
  );
}

export default async function Home() {
  const analysis = await getBitcoinAnalysis();

  const rsiSignal =
    analysis.rsi14 >= 70 ? "Sobrecomprado" : analysis.rsi14 <= 30 ? "Sobrevendido" : "Neutro";
  const trendSignal = analysis.sma7 >= analysis.sma30 ? "Alta" : "Baixa";

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black">
      <main className="flex-1 max-w-3xl mx-auto w-full px-6 py-16 flex flex-col gap-8">
        <header>
          <h1 className="text-3xl font-bold">BTC Moon 🌙</h1>
          <p className="text-black/60 dark:text-white/60 mt-1">
            Análise de Bitcoin com dados públicos (CoinGecko) e indicadores matemáticos.
          </p>
        </header>

        <section className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <StatCard label="Preço atual" value={formatUsd(analysis.currentPrice)} />
          <StatCard label="SMA 7d" value={formatUsd(analysis.sma7)} />
          <StatCard label="SMA 30d" value={formatUsd(analysis.sma30)} />
          <StatCard label="EMA 12d" value={formatUsd(analysis.ema12)} />
          <StatCard
            label="Volatilidade anualizada"
            value={`${analysis.volatility.toFixed(1)}%`}
          />
          <StatCard label="RSI 14d" value={analysis.rsi14.toFixed(1)} hint={rsiSignal} />
        </section>

        <section className="rounded-xl border border-black/10 dark:border-white/10 p-4">
          <p className="text-sm text-black/60 dark:text-white/60">Tendência (SMA7 vs SMA30)</p>
          <p className="text-xl font-semibold mt-1">{trendSignal}</p>
        </section>

        <footer className="text-xs text-black/40 dark:text-white/40">
          Dados via CoinGecko API pública. Não é recomendação de investimento.
        </footer>
      </main>
    </div>
  );
}
