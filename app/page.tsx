import LivePrice from "@/components/LivePrice";
import LivePriceProvider from "@/components/LivePriceProvider";
import LiquidityPanel from "@/components/LiquidityPanel";
import PriceChart from "@/components/PriceChart";
import { Pagina } from "@/components/Pagina";
import CicloPanel, { type MedicaoCiclo } from "@/components/CicloPanel";
import type { MarcaCiclo } from "@/components/PriceChart";
import type { PontoCiclo } from "@/components/CurvaCiclo";
import { getBitcoinAnalysis } from "@/lib/bitcoin";
import { getCandles } from "@/lib/bitstamp";
import { diasDasVelas, quedaMaxima, simularAdaptativo, simularCalendario, simularSegurar } from "@/lib/cicloBtc";
import { readFile } from "node:fs/promises";
import path from "node:path";
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

/**
 * A grade do padrão dos 1.064 / 364 dias, gerada à mão (`npm run medir-ciclo`)
 * e guardada no `main`: o disco do build basta, porque ela só muda quando a
 * regra muda. Sem o arquivo, o painel mostra o resto e cala a grade.
 */
async function getMedicaoCiclo(): Promise<MedicaoCiclo | null> {
  try {
    return JSON.parse(await readFile(path.join(process.cwd(), "data", "ciclo-medicao.json"), "utf8"));
  } catch {
    return null;
  }
}

/** Um ponto por semana, mais os dias de operação e o último: ~700 pontos por linha em vez de ~4.700. */
function semanal(curva: { t: number; patrimonio: number }[], manter: Set<number>): PontoCiclo[] {
  return curva.filter((p, i) => i % 7 === 0 || i === curva.length - 1 || manter.has(p.t)).map((p) => ({ t: p.t, v: p.patrimonio }));
}

/**
 * O ciclo roda a cada montagem da página, sobre as mesmas velas diárias do
 * gráfico (a Bitstamp, com cache de uma hora): são ~4.700 dias e um laço,
 * milissegundos. Assim o "agora" do painel anda com o preço, e não com a
 * última vez que alguém rodou a medição.
 */
async function getCiclo() {
  try {
    const dias = diasDasVelas(await getCandles("1d"));
    const adaptativo = simularAdaptativo(dias);
    const calendario = simularCalendario(dias);
    const segurar = simularSegurar(dias);
    const operacoes = new Set([...adaptativo.marcas, ...calendario.marcas].map((m) => m.t));
    const marcas: MarcaCiclo[] = [
      ...adaptativo.marcas.map((m) => ({ t: m.t, tipo: m.tipo })),
      ...calendario.marcas.map((m) => ({ t: m.t, tipo: m.tipo === "compra" ? ("cal-compra" as const) : ("cal-venda" as const) })),
    ];
    return {
      marcas,
      adaptativo: { ...adaptativo, quedaMax: quedaMaxima(adaptativo.curva), curva: [] },
      calendario: { ...calendario, quedaMax: quedaMaxima(calendario.curva), curva: [] },
      segurar: { final: segurar.at(-1)?.patrimonio ?? NaN, quedaMax: quedaMaxima(segurar) },
      series: [
        { nome: "se corrige pelo preço", cor: "ad" as const, pontos: semanal(adaptativo.curva, operacoes) },
        { nome: "calendário do post", cor: "cal" as const, pontos: semanal(calendario.curva, operacoes) },
        { nome: "comprar e segurar", cor: "seg" as const, pontos: semanal(segurar, operacoes) },
      ],
      precoAgora: dias.at(-1)!.fecho,
    };
  } catch {
    return null;
  }
}

export default async function Home() {
  // O painel de liquidez lê o FRED e pode voltar nulo quando ele está fora; a
  // página inteira não pode depender disso, então as duas leituras correm em
  // paralelo e a de liquidez tem direito a falhar sozinha.
  const [analysis, liquidez, ciclo, medicaoCiclo] = await Promise.all([getBitcoinAnalysis(), getLiquidez(), getCiclo(), getMedicaoCiclo()]);

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

          <PriceChart ciclo={ciclo?.marcas ?? []} />

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

          {ciclo && (
            <CicloPanel
              adaptativo={ciclo.adaptativo}
              calendario={ciclo.calendario}
              segurar={ciclo.segurar}
              series={ciclo.series}
              precoAgora={analysis.currentPrice}
              medicao={medicaoCiclo}
            />
          )}

          {liquidez && <LiquidityPanel dados={liquidez} />}

          <footer className="text-xs text-black/40 dark:text-white/40">
            Preços via API pública da Bitstamp, com histórico desde 2011. Não é
            recomendação de investimento.
          </footer>
      </Pagina>
    </LivePriceProvider>
  );
}
