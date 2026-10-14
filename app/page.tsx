import LivePrice from "@/components/LivePrice";
import LivePriceProvider from "@/components/LivePriceProvider";
import LiquidityPanel from "@/components/LiquidityPanel";
import PriceChart from "@/components/PriceChart";
import { Pagina } from "@/components/Pagina";
import { getBitcoinAnalysis } from "@/lib/bitcoin";
import { getLiquidez } from "@/lib/liquidez";

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

export default async function Home() {
  // O painel de liquidez lê o FRED e pode voltar nulo quando ele está fora; a
  // página inteira não pode depender disso, então as duas leituras correm em
  // paralelo e a de liquidez tem direito a falhar sozinha.
  const [analysis, liquidez] = await Promise.all([getBitcoinAnalysis(), getLiquidez()]);

  const rsiSignal =
    analysis.rsi14 >= 70
      ? "Sobrecomprado"
      : analysis.rsi14 <= 30
        ? "Sobrevendido"
        : "Neutro";
  const trendSignal = analysis.sma7 >= analysis.sma30 ? "Alta" : "Baixa";

  return (
    <LivePriceProvider>
      <Pagina>
          <header>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">Bitcoin</h1>
            <p className="text-black/60 dark:text-white/60 mt-1 mb-3">
              A referência do mercado, com os eventos que o moveram marcados no
              gráfico. O garimpo das moedas manipuladas fica nas outras abas.
            </p>
            {/* A cotação ao vivo vem da KuCoin; o histórico continua vindo da
              Bitstamp, então a variação usa o fechamento de ontem como base. */}
            <LivePrice referenceClose={analysis.previousClose} />
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

          <section className="rounded-xl border border-black/10 dark:border-white/10 p-4">
            <p className="text-sm text-black/60 dark:text-white/60">
              Tendência (SMA7 vs SMA30)
            </p>
            <p className="text-xl font-semibold mt-1">{trendSignal}</p>
          </section>

          {liquidez && <LiquidityPanel dados={liquidez} />}

          <footer className="text-xs text-black/40 dark:text-white/40">
            Preços via API pública da Bitstamp, com histórico desde 2011. Não é
            recomendação de investimento.
          </footer>
      </Pagina>
    </LivePriceProvider>
  );
}
