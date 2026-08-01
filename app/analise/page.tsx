import Link from "next/link";
import StrategyLab from "@/components/StrategyLab";
import { getCandles } from "@/lib/bitstamp";

export const revalidate = 3600;

export const metadata = {
  title: "BTC Moon · Análise lunar",
  description:
    "A fase da lua prevê o preço do Bitcoin? Backtest, Monte Carlo e teste de significância.",
};

/** Saída de `npm run periods`: 11.520 combinações e 300 calendários falsos por período. */
const PERIODS = [
  { label: "2011", years: 14.9, bh: "5.896x", bhPct: "+589.600%", cagr: "78,7%", real: "89.172x", fakeMedian: "61.019x", beaten: "49/300", p: 0.166, long: "21,9x", short: "1,0x" },
  { label: "2015", years: 11.6, bh: "205x", bhPct: "+20.380%", cagr: "58,4%", real: "687x", fakeMedian: "972x", beaten: "219/300", p: 0.731, long: "7,0x", short: "0,5x" },
  { label: "2016", years: 10.6, bh: "148x", bhPct: "+14.714%", cagr: "60,4%", real: "377x", fakeMedian: "497x", beaten: "237/300", p: 0.791, long: "5,6x", short: "0,8x" },
  { label: "2018", years: 8.6, bh: "4,8x", bhPct: "+378%", cagr: "20,0%", real: "25,5x", fakeMedian: "27,5x", beaten: "219/300", p: 0.731, long: "1,9x", short: "1,0x" },
  { label: "2019", years: 7.6, bh: "16,8x", bhPct: "+1.581%", cagr: "45,1%", real: "37,6x", fakeMedian: "38,9x", beaten: "199/300", p: 0.664, long: "3,1x", short: "0,6x" },
  { label: "2020", years: 6.6, bh: "9,0x", bhPct: "+795%", cagr: "39,6%", real: "18,3x", fakeMedian: "18,2x", beaten: "142/300", p: 0.475, long: "2,8x", short: "0,6x" },
];

function Verdict() {
  return (
    <section className="rounded-xl border border-[#F6465D]/30 bg-[#F6465D]/5 p-5">
      <h2 className="font-semibold text-lg">Resposta curta: não funciona</h2>
      <div className="text-sm text-black/70 dark:text-white/70 mt-3 flex flex-col gap-3">
        <p>
          Varrendo <strong>11.520 combinações</strong> de fase, antecedência,
          permanência, stop loss e direção — comprado ou vendido — a melhor rende{" "}
          <strong>89.172x</strong> desde 2011. Parece extraordinário, e é ilusão de busca
          grande: testar milhares de regras garante que alguma pareça ótima por acaso.
        </p>
        <p>
          O teste correto repete a varredura inteira sobre{" "}
          <strong>calendários lunares deslocados no tempo</strong> — luas falsas — e
          pergunta se a lua verdadeira produz uma campeã melhor. Ela não produz. E{" "}
          <strong>quanto mais recente o período, pior a lua fica</strong>: de 2015 em
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
        Repare na quinta coluna: de 2015 em diante a lua <em>falsa</em> rende mais que a
        verdadeira. E a fase vencedora troca a cada recorte — nova em 2011 e 2015,
        minguante em 2016, 2018 e 2020, cheia em 2019. Se houvesse um efeito lunar real, a
        mesma fase venceria sempre; trocar a cada período é a assinatura do ruído.
      </p>
    </section>
  );
}

/** Saída de `npm run events`: 28 eventos vs. 20.000 sorteios. */
const EVENT_TEST = {
  observed: "7,66",
  expected: "7,38",
  randomRange: "6,05 a 8,71",
  p: "0,63",
  closest: [
    { date: "08/11/2022", label: "FTX suspende saques", days: "0,5" },
    { date: "05/06/2023", label: "SEC processa a Binance", days: "0,8" },
    { date: "06/10/2025", label: "Máxima histórica", days: "1,2" },
    { date: "12/03/2020", label: "Quinta-feira Negra da covid", days: "2,3" },
  ],
  farthest: [
    { date: "07/09/2021", label: "El Salvador adota o Bitcoin", days: "14,0" },
    { date: "10/01/2024", label: "SEC aprova os ETFs spot", days: "14,0" },
    { date: "10/04/2013", label: "Estouro da bolha de 2013", days: "13,6" },
    { date: "17/12/2017", label: "Topo do ciclo de 2017", days: "13,3" },
  ],
};

function EventsTable() {
  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5 flex flex-col gap-4">
      <div>
        <h2 className="font-semibold">Os grandes eventos caem perto da lua cheia?</h2>
        <p className="text-xs text-black/50 dark:text-white/50 mt-1">
          28 eventos que moveram o mercado, da Mt. Gox à Reserva Estratégica dos EUA,
          medidos pela distância até a lua cheia mais próxima. Todos estão marcados no
          gráfico da página inicial.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div>
          <p className="text-xs font-medium text-[#0ECB81] mb-2">Mais próximos</p>
          <ul className="text-sm flex flex-col gap-1.5">
            {EVENT_TEST.closest.map((e) => (
              <li key={e.label} className="flex justify-between gap-3">
                <span className="text-black/70 dark:text-white/70">
                  {e.label}
                  <span className="text-black/40 dark:text-white/40 text-xs"> · {e.date}</span>
                </span>
                <span className="tabular-nums whitespace-nowrap">{e.days}d</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="text-xs font-medium text-[#F6465D] mb-2">Mais distantes</p>
          <ul className="text-sm flex flex-col gap-1.5">
            {EVENT_TEST.farthest.map((e) => (
              <li key={e.label} className="flex justify-between gap-3">
                <span className="text-black/70 dark:text-white/70">
                  {e.label}
                  <span className="text-black/40 dark:text-white/40 text-xs"> · {e.date}</span>
                </span>
                <span className="tabular-nums whitespace-nowrap">{e.days}d</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-lg bg-black/5 dark:bg-white/5 p-3 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span>
            Distância média observada:{" "}
            <strong className="tabular-nums">{EVENT_TEST.observed} dias</strong>
          </span>
          <span className="text-black/60 dark:text-white/60">
            Esperado sem relação: <span className="tabular-nums">{EVENT_TEST.expected} dias</span>
          </span>
          <span className="text-black/60 dark:text-white/60">
            Faixa do acaso:{" "}
            <span className="tabular-nums">{EVENT_TEST.randomRange} dias</span>
          </span>
          <span className="text-[#F6465D] font-medium">p = {EVENT_TEST.p}</span>
        </div>
      </div>

      <p className="text-xs text-black/60 dark:text-white/60">
        A média observada é <strong>maior</strong> que a esperada — os eventos ficam, se
        alguma coisa, um pouco <em>mais longe</em> da lua cheia do que datas sorteadas.
        A FTX a 0,5 dia da lua cheia é impressionante, mas o El Salvador e a aprovação
        do ETF caem a 14 dias, exatamente no extremo oposto. É a memória seletiva de
        sempre: os casos que encaixam ficam; os que não encaixam somem.
      </p>
      <p className="text-xs text-black/50 dark:text-white/50">
        Uma ressalva sobre este teste em particular: fui eu quem escolheu quais eventos
        entram na lista. Uma seleção diferente move os números. Separando por categoria,
        as quebras ficam a 6,15 dias em média e as adoções institucionais a 12,43 — mas
        olhar categorias depois de ver o resultado é o mesmo erro de escolher a melhor
        de milhares de estratégias, e mesmo assim o p das quebras dá 0,18.
      </p>
    </section>
  );
}

/** Saída de `npm run pattern`: 105 luas cheias vs. 200 conjuntos sorteados. */
const PATTERN = {
  moon: { drop: "−11,13%", rise: "+13,76%", fromClose: "+7,99%" },
  random: { drop: "−11,15%", rise: "+14,15%", fromClose: "+8,63%" },
  randomRange: { drop: "−12,45% a −9,94%", rise: "+12,36% a +15,93%", fromClose: "+7,38% a +9,72%" },
};

function PatternTable() {
  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5 flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">“Cai antes da lua cheia e sobe depois”</h2>
        <p className="text-xs text-black/50 dark:text-white/50 mt-1">
          O padrão mais citado, medido com precisão: a queda do topo até o fundo nos 10
          dias anteriores, e a subida daquele fundo até o topo dos 10 dias seguintes.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[560px]">
          <thead>
            <tr className="text-left text-xs text-black/50 dark:text-white/50">
              <th className="py-2 pr-3 font-medium"></th>
              <th className="py-2 pr-3 font-medium">Na lua cheia</th>
              <th className="py-2 pr-3 font-medium">Em datas sorteadas</th>
              <th className="py-2 font-medium">Faixa do acaso</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t border-black/10 dark:border-white/10">
              <td className="py-2 pr-3">Queda antes</td>
              <td className="py-2 pr-3 text-[#F6465D] font-medium">{PATTERN.moon.drop}</td>
              <td className="py-2 pr-3 text-[#F6465D]">{PATTERN.random.drop}</td>
              <td className="py-2 text-black/50 dark:text-white/50 text-xs">
                {PATTERN.randomRange.drop}
              </td>
            </tr>
            <tr className="border-t border-black/10 dark:border-white/10">
              <td className="py-2 pr-3">Subida depois</td>
              <td className="py-2 pr-3 text-[#0ECB81] font-medium">{PATTERN.moon.rise}</td>
              <td className="py-2 pr-3 text-[#0ECB81]">{PATTERN.random.rise}</td>
              <td className="py-2 text-black/50 dark:text-white/50 text-xs">
                {PATTERN.randomRange.rise}
              </td>
            </tr>
            <tr className="border-t border-black/10 dark:border-white/10">
              <td className="py-2 pr-3">Comprando no fechamento da fase</td>
              <td className="py-2 pr-3 font-medium">{PATTERN.moon.fromClose}</td>
              <td className="py-2 pr-3">{PATTERN.random.fromClose}</td>
              <td className="py-2 text-black/50 dark:text-white/50 text-xs">
                {PATTERN.randomRange.fromClose}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p className="text-xs text-black/60 dark:text-white/60">
        O padrão é <strong>real e mensurável</strong>: queda de 11% seguida de subida de
        14%, em <strong>100% das janelas</strong>. Só que ele aparece igual em qualquer
        data — sorteando âncoras ao acaso a queda dá −11,15% e a subida +14,15%. A lua
        cheia fica no percentil 48% da queda e 35% da subida, ou seja, no meio ou abaixo
        do acaso.
      </p>
      <p className="text-xs text-black/60 dark:text-white/60">
        A razão é o método de medir: procurar o topo, depois o fundo, depois o topo
        seguinte <em>sempre</em> encontra uma queda seguida de subida — é assim que a
        série foi recortada, não uma propriedade da data. Um gráfico com essa marcação
        mostra o padrão em toda lua cheia, e mostraria igual em toda terça-feira.
      </p>
    </section>
  );
}

function ShortTable() {
  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5 flex flex-col gap-3">
      <div>
        <h2 className="font-semibold">E se apostar ao contrário?</h2>
        <p className="text-xs text-black/50 dark:text-white/50 mt-1">
          A mesma regra na lua cheia, mas vendendo a descoberto em vez de comprando.
          Segurar 14 dias, stop de 8%.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse min-w-[420px]">
          <thead>
            <tr className="text-left text-xs text-black/50 dark:text-white/50">
              <th className="py-2 pr-3 font-medium">Entrada</th>
              <th className="py-2 pr-3 font-medium">Comprado</th>
              <th className="py-2 pr-3 font-medium">Vendido</th>
              <th className="py-2 font-medium">Segurar</th>
            </tr>
          </thead>
          <tbody>
            {PERIODS.map((r) => (
              <tr key={r.label} className="border-t border-black/10 dark:border-white/10">
                <td className="py-2 pr-3 font-medium">{r.label}</td>
                <td className="py-2 pr-3 text-[#0ECB81]">{r.long}</td>
                <td className="py-2 pr-3 text-[#F6465D]">{r.short}</td>
                <td className="py-2 text-black/50 dark:text-white/50">{r.bh}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-black/60 dark:text-white/60">
        Vendido perde dinheiro em todos os períodos (0,5x a 1,0x), mas isso{" "}
        <strong>não é evidência de sinal lunar</strong>: vender a descoberto um ativo que
        subiu perde com qualquer calendário. A pergunta certa é se perde mais do que
        vendas em datas sorteadas — e não perde. O único p abaixo de 0,05 aparece em
        2011 (0,037) e não se repete em nenhum dos outros cinco recortes. Com doze testes
        no total, encontrar um resultado assim é exatamente o esperado por acaso.
      </p>
      <p className="text-xs text-black/50 dark:text-white/50">
        Além disso, a simulação vendida é generosa: não cobra funding nem aluguel, que na
        prática são debitados continuamente enquanto a posição existe.
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

        <PatternTable />

        <EventsTable />

        <PeriodTable />

        <ShortTable />

        <StrategyLab candles={candles} />

        <section className="rounded-xl border border-black/10 dark:border-white/10 p-5 text-sm text-black/70 dark:text-white/70 flex flex-col gap-3">
          <h2 className="font-semibold text-black dark:text-white">
            Por que a otimização engana
          </h2>
          <p>
            Testar 11.520 estratégias e ficar com a melhor é como jogar 11.520 moedas e se
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
