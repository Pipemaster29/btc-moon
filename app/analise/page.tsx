import Link from "next/link";
import StrategyLab from "@/components/StrategyLab";
import { getCandles } from "@/lib/bitstamp";

export const revalidate = 3600;

export const metadata = {
  title: "BTC Moon · Análise lunar",
  description:
    "A fase da lua prevê o preço do Bitcoin? Backtest, Monte Carlo e teste de significância.",
};

/** Saída de `npm run periods`: 300 calendários falsos por período. */
const PERIODS = [
  { label: "2011", years: 14.9, bh: "5.891x", bhPct: "+589.025%", cagr: "78,7%", real: "89.100x", fakeMedian: "60.970x", beaten: "49/300", p: 0.166 },
  { label: "2016", years: 10.6, bh: "148x", bhPct: "+14.702%", cagr: "60,4%", real: "376x", fakeMedian: "497x", beaten: "237/300", p: 0.791 },
  { label: "2018", years: 8.6, bh: "4,8x", bhPct: "+378%", cagr: "20,0%", real: "25,4x", fakeMedian: "27,5x", beaten: "219/300", p: 0.731 },
  { label: "2019", years: 7.6, bh: "16,8x", bhPct: "+1.580%", cagr: "45,1%", real: "37,6x", fakeMedian: "38,9x", beaten: "199/300", p: 0.664 },
  { label: "2020", years: 6.6, bh: "8,9x", bhPct: "+795%", cagr: "39,5%", real: "18,3x", fakeMedian: "18,2x", beaten: "142/300", p: 0.475 },
];

function Verdict() {
  return (
    <section className="rounded-xl border border-[#F6465D]/30 bg-[#F6465D]/5 p-5">
      <h2 className="font-semibold text-lg">Resposta curta: não funciona</h2>
      <div className="text-sm text-black/70 dark:text-white/70 mt-3 flex flex-col gap-3">
        <p>
          Varrendo <strong>5.760 combinações</strong> de fase, antecedência, permanência
          e stop loss, a melhor rende <strong>89.100x</strong> desde 2011. Parece
          extraordinário — e é ilusão de busca grande: testar milhares de regras garante
          que alguma pareça ótima por acaso.
        </p>
        <p>
          O teste correto repete a varredura inteira sobre{" "}
          <strong>calendários lunares deslocados no tempo</strong> — luas falsas — e
          pergunta se a lua verdadeira produz uma campeã melhor. Ela não produz. E{" "}
          <strong>quanto mais recente o período, pior a lua fica</strong>: de 2016 em
          diante, a lua real perde para a mediana das luas inventadas.
        </p>
        <p className="font-medium text-black dark:text-white">
          Em nenhum recorte o p-valor chega perto de 0,05. No período mais recente, 142 de
          300 calendários inventados batem a lua real — ou seja, ela cai exatamente na
          mediana do acaso.
        </p>
      </div>
    </section>
  );
}

function PeriodTable() {
  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5 flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">O mercado mudou — e a lua piorou</h2>
        <p className="text-xs text-black/50 dark:text-white/50 mt-1">
          Comparar contra “segurar desde 2011” infla a referência: aquele Bitcoin era
          ilíquido e não voltou. Abaixo, cada ano de entrada com seu próprio teste.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[640px]">
          <thead>
            <tr className="text-left text-xs text-black/50 dark:text-white/50">
              <th className="py-2 pr-3 font-medium">Entrada</th>
              <th className="py-2 pr-3 font-medium">Segurar até hoje</th>
              <th className="py-2 pr-3 font-medium">CAGR</th>
              <th className="py-2 pr-3 font-medium">Melhor c/ lua real</th>
              <th className="py-2 pr-3 font-medium">Melhor c/ lua falsa</th>
              <th className="py-2 pr-3 font-medium">Falsas que ganharam</th>
              <th className="py-2 font-medium">p</th>
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((r) => (
              <tr key={r.label} className="border-t border-black/10 dark:border-white/10">
                <td className="py-2 pr-3 font-medium">
                  {r.label}
                  <span className="text-black/40 dark:text-white/40 font-normal">
                    {" "}
                    · {r.years}a
                  </span>
                </td>
                <td className="py-2 pr-3">
                  {r.bh}
                  <span className="text-black/40 dark:text-white/40 text-xs"> {r.bhPct}</span>
                </td>
                <td className="py-2 pr-3">{r.cagr}</td>
                <td className="py-2 pr-3">{r.real}</td>
                <td className="py-2 pr-3">{r.fakeMedian}</td>
                <td className="py-2 pr-3">{r.beaten}</td>
                <td className="py-2 text-[#F6465D] font-medium">
                  {r.p.toFixed(3).replace(".", ",")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-black/60 dark:text-white/60">
        Repare na quinta coluna: de 2016 em diante a lua <em>falsa</em> rende mais que a
        verdadeira. E a fase vencedora troca a cada recorte — nova em 2011, minguante em
        2016, 2018 e 2020, cheia em 2019. Se houvesse um efeito lunar real, a mesma fase
        venceria sempre; trocar a cada período é a assinatura do ruído.
      </p>
    </section>
  );
}

export default async function AnalysisPage() {
  const candles = await getCandles("1d");

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black">
      <main className="flex-1 max-w-4xl mx-auto w-full px-6 py-12 flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <Link
            href="/"
            className="text-sm text-black/50 dark:text-white/50 hover:underline w-fit"
          >
            ← voltar ao gráfico
          </Link>
          <h1 className="text-3xl font-bold">A lua move o Bitcoin? 🌙</h1>
          <p className="text-black/60 dark:text-white/60">
            {candles.length.toLocaleString("pt-BR")} dias de preço, de{" "}
            {new Date(candles[0].time * 1000).toLocaleDateString("pt-BR")} até hoje,
            testados contra o calendário lunar.
          </p>
        </header>

        <Verdict />

        <PeriodTable />

        <StrategyLab candles={candles} />

        <section className="rounded-xl border border-black/10 dark:border-white/10 p-5 text-sm text-black/70 dark:text-white/70 flex flex-col gap-3">
          <h2 className="font-semibold text-black dark:text-white">
            Por que a otimização engana
          </h2>
          <p>
            Testar 5.760 estratégias e ficar com a melhor é como jogar 5.760 moedas e se
            impressionar com a que deu dez caras seguidas. Alguma sempre dá.
          </p>
          <p>
            Por isso o teste decisivo não pergunta “essa estratégia deu lucro?”, e sim
            “<strong>a melhor estratégia da lua real bate a melhor estratégia de uma lua
            inventada?</strong>”. Quando a resposta é não — e aqui foi não — o lucro veio
            da tendência do ativo e do tamanho da busca, não do sinal.
          </p>
          <p>
            Vale notar também que o backtest é <em>otimista</em>: o stop loss executa no
            preço exato, sem gap; não há corretagem, spread nem imposto. Com esses custos
            a diferença anda para o lado errado.
          </p>
          <p>
            E há um limite honesto do outro lado: períodos curtos têm poucas lunações —
            de 2020 para cá são ~80 operações — então o teste tem menos poder para
            detectar um efeito pequeno. O que se pode afirmar é que{" "}
            <strong>não há efeito grande o bastante para sustentar uma estratégia</strong>
            , não que o efeito seja exatamente zero.
          </p>
        </section>

        <footer className="text-xs text-black/40 dark:text-white/40">
          Análise reproduzível com <code>npm run analyze</code>. Não é
          recomendação de investimento.
        </footer>
      </main>
    </div>
  );
}
