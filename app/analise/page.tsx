import Link from "next/link";
import StrategyLab from "@/components/StrategyLab";
import { getCandles } from "@/lib/bitstamp";

export const revalidate = 3600;

export const metadata = {
  title: "BTC Moon · Análise lunar",
  description:
    "A fase da lua prevê o preço do Bitcoin? Backtest, Monte Carlo e teste de significância.",
};

function Verdict() {
  return (
    <section className="rounded-xl border border-[#F6465D]/30 bg-[#F6465D]/5 p-5">
      <h2 className="font-semibold text-lg">Resposta curta: não funciona</h2>
      <div className="text-sm text-black/70 dark:text-white/70 mt-3 flex flex-col gap-3">
        <p>
          Varrendo <strong>5.760 combinações</strong> de fase, antecedência, tempo de
          permanência e stop loss sobre 15 anos de preço, a melhor delas rende{" "}
          <strong>88.776x</strong> — contra 5.869x de comprar e segurar. Parece
          extraordinário.
        </p>
        <p>
          Só que esse número não sobrevive ao teste certo. Repetindo a mesma varredura
          sobre <strong>calendários lunares deslocados no tempo</strong> — luas falsas,
          sem nenhuma relação com a lua real — a melhor combinação rende, na mediana,{" "}
          <strong>60.748x</strong>, e chega a <strong>129.535x</strong>. De 300
          calendários inventados, <strong>49 bateram a lua verdadeira</strong>.
        </p>
        <p className="font-medium text-black dark:text-white">
          p = 0,17. A lua não explica nada que um ciclo qualquer de 29 dias não explique
          igual.
        </p>
        <p>
          O que os 88.776x realmente medem é outra coisa: comprar Bitcoin repetidamente e
          segurar por ~29 dias durante um mercado que subiu 5.869x dá muito lucro. A lua
          é carona, não motor.
        </p>
      </div>
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
        </section>

        <footer className="text-xs text-black/40 dark:text-white/40">
          Análise reproduzível com <code>npm run analyze</code>. Não é
          recomendação de investimento.
        </footer>
      </main>
    </div>
  );
}
