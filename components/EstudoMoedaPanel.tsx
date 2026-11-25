/**
 * O estudo de uma moeda no ciclo do BTC, na aba Bitcoin (26/11/2026), a pedido,
 * sobre a HBAR: "ela parece que trabalha com pancadas, uma subida enorme do
 * nada, depois mini correções e pancadas pra cima". Medido por
 * `scripts/estudar-moeda.mts` com `lib/pancadas.ts`. A forma se confirma; comprar
 * depois da pancada não tem vantagem; e a página diz as duas coisas.
 */
import { LivroDeOrdens } from "./CicloPanel";
import type { Ordem } from "@/lib/cicloBtc";

export interface EstudoMoeda {
  moeda: string;
  desde: number;
  ate: number;
  preco: number;
  maxima: { t: number; preco: number };
  estudo: {
    volDia: number;
    assimetria: number;
    segurar: number;
    semOs10Melhores: number;
    porAno: number;
    outraEm60: number;
    base60: number;
    devolveEm90: number;
    logPancadas: number;
    logTotal: number;
    pancadas: { de: number; ate: number; precoDe: number; precoAte: number; depois30: number | null; depois90: number | null; queda30: number | null }[];
  };
  btc: { volDia: number; assimetria: number; segurar: number; semOs10Melhores: number; porAno: number; outraEm60: number; base60: number };
  medianaOutras: { volDia: number; assimetria: number; segurar: number; semOs10Melhores: number; porAno: number; outraEm60: number; base60: number };
  outras: number;
  postos: { assimetria: number; porAno: number; de: number };
  regra: { k: number; n: number; media: number; mediana: number; positivas: number; moeda: { n: number; mediana: number } }[];
  ataque: {
    ate2021: { n: number; media: number; mediana: number };
    desde2022: { n: number; media: number; mediana: number };
    semOs10: { media: number };
    porMes: { meses: number; media: number; t: number; positivos: number };
    referencia: { media: number; mediana: number };
  };
  depoisDoFundo: { fundo: { t: number; preco: number }; primeira: { de: number; precoDe: number; precoAte: number } | null; dias: number | null; entreMin: number; entreMax: number };
  ordens: {
    aVista: { final: number; queda: number; operacoes: Ordem[] };
    comVendida: { final: number; queda: number; operacoes: Ordem[]; liquidada: boolean };
    segurar: { final: number; queda: number };
  };
}

const data = (t: number) => new Date(t * 1000).toLocaleDateString("pt-BR", { timeZone: "UTC" });
const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
const preco = (v: number) => `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
const vezes = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: v >= 10 ? 1 : v >= 1 ? 2 : 3 })}x`;

export default function EstudoMoedaPanel({ e, procurando, gatilho }: { e: EstudoMoeda; procurando: "fundo" | "topo"; gatilho: number | null }) {
  const m = e.moeda;
  const s = e.estudo;
  const fora = Math.exp(s.logTotal - s.logPancadas);
  const r30 = e.regra.find((r) => r.k === 30)!;
  const linhas: { nome: string; x: EstudoMoeda["btc"] }[] = [
    { nome: m, x: s },
    { nome: "BTC (desde 08/2017)", x: e.btc },
    { nome: `mediana das outras ${e.outras}`, x: e.medianaOutras },
  ];
  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5 flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold">A {m} anda em pancadas?</h2>
        <p className="text-sm text-black/60 dark:text-white/60 mt-1 max-w-3xl">
          Pancada aqui é o fechamento 50% ou mais acima do de 7 dias antes — a definição veio antes da medição. Velas diárias da Binance à vista,
          de {data(e.desde)} a {data(e.ate)}.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 text-sm">
        <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.04] p-3">
          <p className="font-semibold">Sim, a forma é essa.</p>
          <p className="text-black/65 dark:text-white/65 mt-1">
            {s.pancadas.length} pancadas, {s.porAno.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por ano — a {e.postos.porAno}ª de {e.postos.de}{" "}
            moedas (o BTC, {e.btc.porAno.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}). E elas vêm em grupo: depois de uma, a chance de outra
            em 60 dias é {pct(s.outraEm60).replace("+", "")}, contra {pct(s.base60).replace("+", "")} num dia qualquer. Assimetria{" "}
            {s.assimetria.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}, a {e.postos.assimetria}ª mais puxada para cima.
          </p>
        </div>
        <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.04] p-3">
          <p className="font-semibold">Fora das pancadas, ela sangra.</p>
          <p className="text-black/65 dark:text-white/65 mt-1">
            As {s.pancadas.length} semanas de pancada são {((s.pancadas.length * 7 * 86_400) / (e.ate - e.desde) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
            dos dias e fazem toda a alta da vida dela — e mais. Fora delas, US$ 1 virava US$ {fora.toLocaleString("pt-BR", { maximumFractionDigits: 3 })}.
            Segurar desde {data(e.desde)} deu {vezes(s.segurar)}; sem os 10 melhores dias, {vezes(s.semOs10Melhores)}. Hoje ela está a {preco(e.preco)},{" "}
            {pct(e.preco / e.maxima.preco - 1)} da máxima de {data(e.maxima.t)}.
          </p>
        </div>
        <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.04] p-3">
          <p className="font-semibold">Comprar depois da pancada não tem vantagem.</p>
          <p className="text-black/65 dark:text-white/65 mt-1">
            Nas {e.outras + 1} moedas, {r30.n} pancadas: 30 dias depois, mediana {pct(r30.mediana)} e {pct(r30.positivas).replace("+", "")} positivas. A
            média alta ({pct(r30.media)}) é de 2021: por mês, {pct(e.ataque.porMes.media)} (t {e.ataque.porMes.t.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}), contra{" "}
            {pct(e.ataque.referencia.media)} de um dia qualquer; de 2022 em diante, mediana {pct(e.ataque.desde2022.mediana)}.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm whitespace-nowrap">
          <thead>
            <tr className="text-left text-xs text-black/45 dark:text-white/45">
              <th className="py-1.5 pr-3 font-normal"></th>
              <th className="py-1.5 pr-3 font-normal text-right">variação por dia</th>
              <th className="py-1.5 pr-3 font-normal text-right">assimetria</th>
              <th className="py-1.5 pr-3 font-normal text-right">pancadas por ano</th>
              <th className="py-1.5 pr-3 font-normal text-right">outra em 60 d (base)</th>
              <th className="py-1.5 pr-3 font-normal text-right">segurar</th>
              <th className="py-1.5 font-normal text-right">sem os 10 melhores dias</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map(({ nome, x }) => (
              <tr key={nome} className={`border-t border-black/5 dark:border-white/10 ${nome === m ? "font-semibold" : ""}`}>
                <td className="py-1.5 pr-3">{nome}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{(x.volDia * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{x.assimetria.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{x.porAno.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  {Math.round(x.outraEm60 * 100)}% ({Math.round(x.base60 * 100)}%)
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{vezes(x.segurar)}</td>
                <td className="py-1.5 text-right tabular-nums">{vezes(x.semOs10Melhores)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details className="rounded-lg border border-black/10 dark:border-white/10 px-3 py-2">
        <summary className="cursor-pointer text-sm font-medium">As {s.pancadas.length} pancadas da {m}</summary>
        <div className="overflow-x-auto mt-2">
          <table className="w-full min-w-[640px] text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-xs text-black/45 dark:text-white/45">
                <th className="py-1.5 pr-3 font-normal">semana</th>
                <th className="py-1.5 pr-3 font-normal text-right">preço</th>
                <th className="py-1.5 pr-3 font-normal text-right">pior queda em 30 d</th>
                <th className="py-1.5 pr-3 font-normal text-right">30 d depois</th>
                <th className="py-1.5 font-normal text-right">90 d depois</th>
              </tr>
            </thead>
            <tbody>
              {s.pancadas.map((p) => (
                <tr key={p.ate} className="border-t border-black/5 dark:border-white/10">
                  <td className="py-1.5 pr-3 tabular-nums">
                    {data(p.de)} → {data(p.ate)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {preco(p.precoDe)} → {preco(p.precoAte)} ({pct(p.precoAte / p.precoDe - 1)})
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{p.queda30 === null ? "—" : pct(p.queda30)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{p.depois30 === null ? "—" : pct(p.depois30)}</td>
                  <td className="py-1.5 text-right tabular-nums">{p.depois90 === null ? "—" : pct(p.depois90)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <div className="text-sm flex flex-col gap-2">
        <h3 className="font-semibold">A {m} nas datas do BTC, e o que veio depois do último fundo</h3>
        {e.depoisDoFundo.dias !== null && e.depoisDoFundo.primeira && (
          <p className="text-black/65 dark:text-white/65 max-w-3xl">
            No ciclo passado, o fundo da {m} foi em {data(e.depoisDoFundo.fundo.t)}, a {preco(e.depoisDoFundo.fundo.preco)}, e a primeira pancada só começou{" "}
            <b>{e.depoisDoFundo.dias} dias depois</b> ({data(e.depoisDoFundo.primeira.de)}). No meio ela andou entre {preco(e.depoisDoFundo.entreMin)} e{" "}
            {preco(e.depoisDoFundo.entreMax)}. Um ciclo é um exemplo, não uma previsão: diz que o fundo da {m} pode vir junto com o do BTC e a alta
            dela, mais de um ano depois.
          </p>
        )}
        <p className="text-black/65 dark:text-white/65 max-w-3xl">
          Comprando e vendendo a {m} nas datas da regra do BTC, US$ 10 mil em {data(e.desde)} viravam <b>{vezes(e.ordens.aVista.final / 10_000)}</b> à
          vista (queda máxima {pct(e.ordens.aVista.queda)}) e <b>{vezes(e.ordens.comVendida.final / 10_000)}</b> com a vendida 1x
          {e.ordens.comVendida.liquidada ? " — liquidada" : ", sem liquidar"} (queda máxima {pct(e.ordens.comVendida.queda)}), contra{" "}
          {vezes(e.ordens.segurar.final / 10_000)} segurando. A vendida em altcoin é onde mora o risco: ela subiu de US$ 0,17 para US$ 0,20 entre
          22 e 30/10/2025 enquanto o BTC caía. {procurando === "fundo" && gatilho !== null
            ? `Hoje a regra do BTC está esperando o fundo: compra quando o BTC fechar acima de US$ ${Math.round(gatilho).toLocaleString("pt-BR")}.`
            : ""}
        </p>
        <LivroDeOrdens titulo={`${m} à vista nas datas do BTC`} ordens={e.ordens.aVista.operacoes} unidade={m} casasPreco={4} agora={{ preco: e.preco, patrimonio: e.ordens.aVista.final }} />
        <LivroDeOrdens
          titulo={`${m} com a vendida 1x nas datas do BTC`}
          ordens={e.ordens.comVendida.operacoes}
          unidade={m}
          casasPreco={4}
          agora={{ preco: e.preco, patrimonio: e.ordens.comVendida.final }}
        />
      </div>
      <p className="text-xs text-black/45 dark:text-white/45">
        Um estudo de uma moeda, com {s.pancadas.length} pancadas: descreve a forma, não demonstra vantagem. Não é recomendação.{" "}
        <code>npx tsx scripts/estudar-moeda.mts {m}</code>.
      </p>
    </section>
  );
}
