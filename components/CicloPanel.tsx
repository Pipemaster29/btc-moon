/**
 * O padrão dos 1.064 / 364 dias na aba Bitcoin: o que a regra espera agora, a
 * carteira de US$ 10.000 desde 2013 e o que isso prova — que é pouco, e a
 * página diz por quê antes de qualquer número grande.
 */
import CurvaCiclo, { type SerieCiclo } from "./CurvaCiclo";
import type { Extremo, Marca, Ordem, PernaVendida, Resultado } from "@/lib/cicloBtc";

export interface LinhaVendida {
  nome: string;
  final: number;
  queda17: number;
  antes2020: number;
  desde2020: number;
  pernas: number;
  positivas: number;
  piorContra: number;
  publicada: boolean;
}

export interface AltcoinsCiclo {
  raio: number;
  extremos: { tipo: "topo" | "fundo"; nome: string; t: number }[];
  linhas: { moeda: string; desde: number; distancias: (number | null)[]; estrategia: number; soComprada: number; segurar: number; liquidada: boolean }[];
  resumo: { nome: string; tipo: string; n: number; mediana: number | null; perto40: number }[];
  soComprada: { batem: number; lucro: number; mediana: number; medianaSegurar: number };
  comVendida: { batem: number; lucro: number; liquidadas: string[] };
  btc: { estrategia: number; soComprada: number; segurar: number; desde: number };
  ganhamDoBtc: string[];
  geradoEm: string;
}

export interface MedicaoCiclo {
  datas?: {
    mediaFundo: number;
    mediaTopo: number;
    desce: number[];
    sobe: number[];
    linhas: { nome: string; grupo: string; final: number; antes2020: number; desde2020: number; publicada: boolean; liquidada: boolean }[];
    operacoes: { t: number; alvo: number; preco: number }[];
  };
  vendida?: { linhas: LinhaVendida[]; grade: { melhora: number; variacoes: number; pior: number; mediana: number; melhor: number; pernasPos: number; pernasTot: number; piorContra: number } };
  medias?: { nome: string; final: number; queda: number; operacoes: number; antes2020: number; desde2020: number; publicada: boolean }[];
  grade: { variacoes: number; posicao: number; mediana: number; pior: number; melhor: number; batemSegurar: number };
}

const usd = (v: number) => `US$ ${Math.round(v).toLocaleString("pt-BR")}`;
const usdCurto = (v: number) =>
  v >= 1e6 ? `US$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi` : v >= 1e3 ? `US$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil` : usd(v);
const data = (t: number) => new Date(t * 1000).toLocaleDateString("pt-BR", { timeZone: "UTC" });
const vezes = (v: number) => `${(v / 10_000).toLocaleString("pt-BR", { maximumFractionDigits: v >= 1e6 ? 0 : 1 })}x`;
const pct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;

/** 12/12/2023, o dia do post. */
const POST = Date.UTC(2023, 11, 12) / 1000;
/** A máxima diária do topo de 06/10/2025, na Bitstamp. */
const TOPO_2025 = 126_272;

const ROTULO: Record<Marca["tipo"], string> = {
  compra: "Compra — fundo confirmado",
  venda: "Venda — topo confirmado",
  "fundo falso": "Venda — o fundo foi perdido",
  "topo falso": "Recompra — o topo foi superado",
};

function Tile({ titulo, valor, linha, destaque }: { titulo: string; valor: string; linha: string; destaque?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${destaque ? "border-[#2a78d6]/40 dark:border-[#3987e5]/40" : "border-black/10 dark:border-white/10"}`}>
      <p className="text-xs text-black/55 dark:text-white/55">{titulo}</p>
      <p className="text-2xl font-semibold mt-1 tabular-nums">{valor}</p>
      <p className="text-xs text-black/45 dark:text-white/45 mt-1">{linha}</p>
    </div>
  );
}

export default function CicloPanel({
  adaptativo,
  vendida,
  calendario,
  segurar,
  series,
  precoAgora,
  medicao,
  altcoins,
  ordens,
}: {
  adaptativo: Resultado & { quedaMax: number };
  vendida: { final: number; quedaMax: number; pernas: PernaVendida[] };
  calendario: Resultado & { quedaMax: number };
  segurar: { final: number; quedaMax: number };
  series: SerieCiclo[];
  precoAgora: number;
  medicao: MedicaoCiclo | null;
  altcoins: AltcoinsCiclo | null;
  ordens: { aVista: Ordem[]; comVendida: Ordem[]; finalAVista: number; finalComVendida: number };
}) {
  const ultimaData = medicao?.datas?.operacoes.at(-1);
  const e = adaptativo.estado;
  const extremoDe = (m: Marca): Extremo | undefined => adaptativo.extremos.find((x) => x.confirmadoEm === m.t);
  const ultimaCal = calendario.marcas.at(-1);
  const calComprado = calendario.estado.comprado && ultimaCal;
  // O post é de 12/12/2023: a primeira venda depois dele é a única decisão que ele não viu.
  const vendaFora = adaptativo.marcas.find((m) => m.t > POST && m.tipo === "venda");
  const vendidaAberta = vendida.pernas.find((p) => p.ate === null);

  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5 flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold">O padrão dos 1.064 / 364 dias</h2>
        <p className="text-sm text-black/60 dark:text-white/60 mt-1 max-w-3xl">
          Um post anônimo de 12/12/2023: do fundo ao topo, 1.064 dias; do topo ao fundo, 364 — e o topo deste ciclo em 06/10/2025. O topo veio
          em 06/10/2025, a US$ 126.272. O fundo que o 364 marcava, 05/10/2026, não veio: o BTC fechou a US$ 85 mil e foi a US$ 55 mil em 21/11.
          Por isso existem duas versões: o <b>calendário</b>, ao pé da letra, e a que <b>se corrige pelo preço</b> — a data abre a busca, o fundo
          anda para frente a cada mínima nova, a compra é o fechamento 20% acima dele, e a venda é o primeiro de dois sinais: cair 20% da máxima ou
          fechar abaixo da EMA 200 diária. E entre a venda e a compra, em vez de ficar parada, a carteira fica <b>vendida 1x no perpétuo</b> — é
          o que pega a queda em linha reta sem precisar acertar topo nem fundo. Tudo com o fechamento do dia, que qualquer gráfico mostra.
        </p>
      </div>

      {/* Agora: o que a regra está esperando, como uma lista que se confere no gráfico diário. */}
      <div className="rounded-lg bg-black/[0.03] dark:bg-white/[0.04] p-4 text-sm flex flex-col gap-3">
        <p className="text-[10px] tracking-widest uppercase text-black/45 dark:text-white/45">Agora — para conferir no fechamento diário (00h UTC, 21h de Brasília)</p>
        {e.procurando === "fundo" ? (
          <ol className="flex flex-col gap-2 list-decimal pl-5">
            {vendidaAberta && (
              <li>
                <b>Vendido 1x desde {data(vendidaAberta.de)}, a {usd(vendidaAberta.entrada)}</b>: {pct(1 - precoAgora / vendidaAberta.entrada)} de
                preço a favor, mais o financiamento recebido. A vendida fecha no mesmo fechamento em que a compra abaixo dispara.
              </li>
            )}
            <li>
              <b>A busca do fundo abriu?</b> {e.candidato ? "Sim" : "Ainda não"}: o topo confirmado é o de {data(e.ancora.t)} ({usd(e.ancora.preco)}), e
              364 dias depois dá {data(e.abre)}.
            </li>
            {e.candidato && e.gatilho !== null && (
              <>
                <li>
                  <b>A menor mínima diária desde então:</b> {usd(e.candidato.preco)}, em {data(e.candidato.t)}. Se uma vela fizer mínima abaixo dela,
                  ela passa a ser o fundo — e a data anda.
                </li>
                <li>
                  <b>Fecha a vendida e compra quando um candle diário FECHAR acima de {usd(e.gatilho)}</b> ({usd(e.candidato.preco)} × 1,2).{" "}
                  {precoAgora < e.gatilho ? `Faltam ${pct(e.gatilho / precoAgora - 1)} do preço de agora.` : "O preço de agora já passa: vale se o candle fechar assim."}
                </li>
                <li className="text-black/60 dark:text-white/60">
                  Comprado, duas saídas. <b>Antes de {data(e.depois)}</b> (fundo + 1.064): só se um fechamento perder o fundo — o fundo era falso, vende e
                  recomeça. <b>Depois</b>: vende no primeiro fechamento abaixo da EMA 200 diária (hoje em {usd(e.ema)}) ou 20% abaixo da máxima desde
                  {" "}{data(e.depois)} — e, no mesmo fechamento, abre a vendida 1x do urso seguinte.
                </li>
              </>
            )}
          </ol>
        ) : (
          <ol className="flex flex-col gap-2 list-decimal pl-5">
            <li>
              <b>Comprado desde o fundo de {data(e.ancora.t)}</b> ({usd(e.ancora.preco)}). Fechamento abaixo de {usd(e.desfaz)}: o fundo era falso, vende.
            </li>
            <li>
              <b>A busca do topo {e.candidato ? "abriu" : "abre"} em {data(e.abre)}</b> (fundo + 1.064 dias).
              {e.candidato && e.gatilho !== null && (
                <>
                  {" "}Máxima desde então: {usd(e.candidato.preco)}. Vende no fechamento abaixo de <b>{usd(e.gatilho)}</b> — o maior entre a EMA 200 (
                  {usd(e.ema)}) e a máxima × 0,8.
                </>
              )}
            </li>
          </ol>
        )}
        <p className="text-xs text-black/50 dark:text-white/50">
          Três números e um calendário, nada que precise deste site: o fechamento diário, a menor mínima desde a data e a EMA 200 — a mesma de
          qualquer gráfico. O painel refaz a conta a cada hora com as velas da Bitstamp.
          {calComprado && ultimaCal
            ? ` O calendário literal, sem os gatilhos, comprou em ${data(ultimaCal.t)} a ${usd(ultimaCal.preco)} e está ${pct(precoAgora / ultimaCal.preco - 1)}.`
            : ""}
        </p>
      </div>

      {/* A carteira. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <Tile
          destaque
          titulo="Comprado + vendido 1x"
          valor={usdCurto(vendida.final)}
          linha={`${vezes(vendida.final)} · queda máxima ${pct(vendida.quedaMax)} · ${vendida.pernas.filter((p) => p.retorno !== 0).length} vendidas`}
        />
        <Tile
          titulo="Só comprado ou em caixa"
          valor={usdCurto(adaptativo.final)}
          linha={`${vezes(adaptativo.final)} · queda máxima ${pct(adaptativo.quedaMax)} · ${adaptativo.marcas.length} operações`}
        />
        <Tile titulo="Calendário do post" valor={usdCurto(calendario.final)} linha={`${vezes(calendario.final)} · queda máxima ${pct(calendario.quedaMax)}`} />
        <Tile titulo="Comprar e segurar" valor={usdCurto(segurar.final)} linha={`${vezes(segurar.final)} · queda máxima ${pct(segurar.quedaMax)}`} />
      </div>
      <p className="text-xs text-black/45 dark:text-white/45 -mt-3">
        US$ 10.000 em 30/11/2013, o topo daquele ciclo — a única data escolhida à mão; daí em diante cada data sai da regra. Opera no fechamento
        do dia, com 0,1% por lado; em caixa, rende zero. A vendida é perpétuo de margem isolada, com o financiamento real do BTCUSDT da Binance desde
        09/2019 — o vendido recebeu em todos os anos, de +3% a +31% — e, antes, a suposição de pior caso: pagando 0,01% a cada 8 h. A queda máxima
        é a de 2014, antes de qualquer vendida; desde 2017 ela é a mesma −63% com e sem a vendida, porque vem da perna comprada.
      </p>

      <CurvaCiclo series={series} capital={10_000} />

      {/* As operações. */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm whitespace-nowrap">
          <thead>
            <tr className="text-left text-xs text-black/45 dark:text-white/45">
              <th className="py-1.5 pr-3 font-normal">operou em</th>
              <th className="py-1.5 pr-3 font-normal">o quê</th>
              <th className="py-1.5 pr-3 font-normal text-right">preço</th>
              <th className="py-1.5 pr-3 font-normal">extremo (dias depois do anterior)</th>
              <th className="py-1.5 pr-3 font-normal">calendário dava</th>
              <th className="py-1.5 font-normal text-right">patrimônio</th>
            </tr>
          </thead>
          <tbody>
            {adaptativo.marcas.map((m) => {
              const x = extremoDe(m);
              return (
                <tr key={m.t} className="border-t border-black/5 dark:border-white/10">
                  <td className="py-1.5 pr-3 tabular-nums">{data(m.t)}</td>
                  <td className="py-1.5 pr-3">{ROTULO[m.tipo]}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{usd(m.preco)}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{x ? `${x.tipo} ${data(x.t)} a ${usd(x.preco)} (${x.dias} d)` : "—"}</td>
                  <td className="py-1.5 pr-3 tabular-nums">{x ? data(x.previsto) : "—"}</td>
                  <td className="py-1.5 text-right tabular-nums font-medium">{usd(m.patrimonio)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* O livro de ordens: cada ordem como ela seria dada na corretora. */}
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold text-sm">As ordens, uma a uma</h3>
        <p className="text-xs text-black/55 dark:text-white/55 max-w-3xl">
          A compra é <b>à vista, sem alavancagem</b>: compra-se BTC com todo o patrimônio. A vendida é <b>1x</b> no perpétuo: a margem é o
          patrimônio inteiro e o tamanho vendido vale o mesmo que ele — nada de 2x ou 3x, que estão medidos acima e reprovam. Cada ordem sai no
          fechamento diário (00h UTC, 21h de Brasília), no preço desse fechamento, com 0,1% de taxa e escorregada por lado. A versão à vista é a mesma
          regra sem a vendida: entre a venda e a compra, o dinheiro fica parado em dólar. <b>O que não é realista é o tamanho</b>: a partir de 2021 a
          carteira passa de US$ 10 milhões e as ordens de 2025 têm 1.300 BTC — uma ordem dessas de uma vez move o preço bem mais que 0,1%, e
          teria de ser picada em dias. Com US$ 10 mil, as primeiras ordens são do tamanho de qualquer conta; os milhões do fim, não.
        </p>
        <LivroDeOrdens titulo="À vista, sem alavancagem (sem vendida)" ordens={ordens.aVista} agora={{ preco: precoAgora, patrimonio: ordens.finalAVista }} />
        <LivroDeOrdens titulo="Com a vendida 1x no urso" ordens={ordens.comVendida} agora={{ preco: precoAgora, patrimonio: ordens.finalComVendida }} />
      </div>

      {/* A vendida: perna a perna e o que foi medido. */}
      <div className="flex flex-col gap-2">
        <h3 className="font-semibold text-sm">A vendida, perna a perna</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm whitespace-nowrap">
            <thead>
              <tr className="text-left text-xs text-black/45 dark:text-white/45">
                <th className="py-1.5 pr-3 font-normal">de → até</th>
                <th className="py-1.5 pr-3 font-normal text-right">preço</th>
                <th className="py-1.5 pr-3 font-normal text-right">no patrimônio</th>
                <th className="py-1.5 pr-3 font-normal text-right">pior contra</th>
                <th className="py-1.5 font-normal text-right">financiamento</th>
              </tr>
            </thead>
            <tbody>
              {vendida.pernas.map((p) => (
                <tr key={p.de} className="border-t border-black/5 dark:border-white/10">
                  <td className="py-1.5 pr-3 tabular-nums">
                    {data(p.de)} → {p.ate ? data(p.ate) : "aberta"}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {usd(p.entrada)} → {usd(p.ate ? p.saida : precoAgora)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums font-medium">{pct(p.ate ? p.retorno : 1 - precoAgora / p.entrada + p.financiamento)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">+{(p.piorContra * 100).toFixed(0)}%</td>
                  <td className="py-1.5 text-right tabular-nums">{pct(p.financiamento)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {medicao?.vendida && (
          <>
            <p className="text-xs text-black/55 dark:text-white/55 max-w-3xl mt-2">
              O que foi medido antes de escolher. Vender só na reta final (do dia 200, 250, 300 ou 340 do urso) rende MENOS que o urso inteiro: a
              última perna começou no dia 261 em 2018 e no 350 em 2026, e uma janela fixa perde metade dela. Filtrar pela EMA 200 vira uma
              sequência de stops nos repiques. E a alavancagem é onde o “maximizar” encontra o “realista”: na grade das{" "}
              {medicao.vendida.grade.variacoes} variações a vendida melhora {medicao.vendida.grade.melhora}, mas só{" "}
              {medicao.vendida.grade.pernasPos} de {medicao.vendida.grade.pernasTot} pernas dão lucro e o pior repique contra foi de +
              {(medicao.vendida.grade.piorContra * 100).toFixed(0)}% — a 3x isso liquida a conta, a 2x leva três quartos da margem. A 1x, nada
              liquida.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm whitespace-nowrap">
                <thead>
                  <tr className="text-left text-xs text-black/45 dark:text-white/45">
                    <th className="py-1.5 pr-3 font-normal">regra</th>
                    <th className="py-1.5 pr-3 font-normal text-right">final</th>
                    <th className="py-1.5 pr-3 font-normal text-right">2013–19</th>
                    <th className="py-1.5 pr-3 font-normal text-right">2020–26</th>
                    <th className="py-1.5 pr-3 font-normal text-right">vendidas com lucro</th>
                    <th className="py-1.5 font-normal text-right">pior contra</th>
                  </tr>
                </thead>
                <tbody>
                  {medicao.vendida.linhas.map((v) => (
                    <tr key={v.nome} className={`border-t border-black/5 dark:border-white/10 ${v.publicada ? "font-semibold" : ""}`}>
                      <td className="py-1.5 pr-3">
                        {v.nome}
                        {v.publicada ? " ← a do painel" : ""}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{usdCurto(v.final)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{v.antes2020.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}x</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{v.desde2020.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{v.nome === "sem vendida" ? "—" : `${v.positivas} de ${v.pernas}`}</td>
                      <td className="py-1.5 text-right tabular-nums">{v.nome === "sem vendida" ? "—" : `+${(v.piorContra * 100).toFixed(0)}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* As datas fixas pela média dos ciclos. */}
      {medicao?.datas && (
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold text-sm">E se comprar e vender NA DATA, pela média dos ciclos?</h3>
          <p className="text-xs text-black/55 dark:text-white/55 max-w-3xl">
            Do fundo ao topo foram {medicao.datas.sobe.join(", ")} dias (média {medicao.datas.mediaTopo}); do topo ao fundo,{" "}
            {medicao.datas.desce.join(", ")} (média {medicao.datas.mediaFundo}) — o de agora, 411 até 21/11, ainda não fechou. Duas formas de
            contar: o <b>calendário puro</b>, desde 2013, em que cada data prevista vira o ponto de partida da seguinte e o erro se acumula; e{" "}
            <b>contando do último extremo confirmado</b> pelo preço, que é o que se sabe no dia — e a compra ou venda sai na data, sem esperar o
            preço. As médias são dos mesmos ciclos que elas compram e vendem; o “deixa-um-fora” prevê cada ciclo com a média dos outros.
          </p>
          {ultimaData && (
            <p className="text-sm rounded-lg bg-black/[0.03] dark:bg-white/[0.04] px-3 py-2">
              <b>Hoje as duas regras discordam.</b> Pela média, a data de compra foi {data(ultimaData.t)} (topo confirmado + {medicao.datas.mediaFundo} dias):
              ela fechou a vendida e comprou a {usd(ultimaData.preco)}, e está {pct(precoAgora / ultimaData.preco - 1)}. A do painel ainda está
              vendida, esperando o preço confirmar. Quem estiver certa até o fim deste fundo é o teste ao vivo das duas ideias.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm whitespace-nowrap">
              <thead>
                <tr className="text-left text-xs text-black/45 dark:text-white/45">
                  <th className="py-1.5 pr-3 font-normal">regra</th>
                  <th className="py-1.5 pr-3 font-normal text-right">final</th>
                  <th className="py-1.5 pr-3 font-normal text-right">2013–19</th>
                  <th className="py-1.5 font-normal text-right">2020–26</th>
                </tr>
              </thead>
              <tbody>
                {medicao.datas.linhas.map((x) => (
                  <tr key={x.grupo + x.nome} className={`border-t border-black/5 dark:border-white/10 ${x.publicada ? "font-semibold" : ""}`}>
                    <td className="py-1.5 pr-3">
                      <span className="text-black/45 dark:text-white/45">{x.grupo}:</span> {x.nome}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{x.liquidada ? "liquidada" : usdCurto(x.final)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{x.liquidada ? "—" : `${x.antes2020.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}x`}</td>
                    <td className="py-1.5 text-right tabular-nums">{x.liquidada ? "—" : `${x.desde2020.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-black/55 dark:text-white/55 max-w-3xl">
            O que isso diz: a data fixa só funciona contada do extremo confirmado — no calendário puro o erro de um ciclo passa para o seguinte e a
            vendida numa data cega é liquidada (o calendário do post vendeu em 10/2017 a US$ 5,7 mil, dois meses antes de o BTC ir a US$ 19,7 mil).
            Espalhar em três parcelas de ±20 ou ±40 dias rende MENOS em todas as versões: a parcela antecipada sai cedo demais da alta e a
            atrasada entra tarde na queda. Pela média, em uma parcela e com vendida, empata com a do painel — e sem o próprio ciclo cai para perto
            de três quartos dela.
          </p>
        </div>
      )}

      {altcoins && <AltcoinsDoCiclo a={altcoins} />}

      {medicao?.medias && (
        <div className="flex flex-col gap-2">
          <h3 className="font-semibold text-sm">E as médias? O que foi medido</h3>
          <p className="text-xs text-black/55 dark:text-white/55 max-w-3xl">
            US$ 10 mil em 30/11/2013, e cada metade de forma independente (até 2019 e de 2020 em diante). A EMA 200 sozinha não basta: são mais de
            cem operações, e de 2020 em diante ela fica atrás do segurar. Dentro do calendário, ela ajuda na VENDA e atrapalha na COMPRA — anda
            devagar, e quando a busca do fundo abre o preço costuma estar em cima dela (três “fundos falsos” seguidos em out–nov/2026).
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm whitespace-nowrap">
              <thead>
                <tr className="text-left text-xs text-black/45 dark:text-white/45">
                  <th className="py-1.5 pr-3 font-normal">regra</th>
                  <th className="py-1.5 pr-3 font-normal text-right">final</th>
                  <th className="py-1.5 pr-3 font-normal text-right">queda máx</th>
                  <th className="py-1.5 pr-3 font-normal text-right">operações</th>
                  <th className="py-1.5 pr-3 font-normal text-right">2013–19</th>
                  <th className="py-1.5 font-normal text-right">2020–26</th>
                </tr>
              </thead>
              <tbody>
                {medicao.medias.map((m) => (
                  <tr key={m.nome} className={`border-t border-black/5 dark:border-white/10 ${m.publicada ? "font-semibold" : ""}`}>
                    <td className="py-1.5 pr-3">
                      {m.nome}
                      {m.publicada ? " ← a do painel" : ""}
                    </td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{usdCurto(m.final)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{pct(m.queda)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{m.operacoes}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{m.antes2020.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x</td>
                    <td className="py-1.5 text-right tabular-nums">{m.desde2020.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}x</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fica top? */}
      <div className="rounded-lg border border-black/10 dark:border-white/10 p-4 text-sm flex flex-col gap-2">
        <p className="font-semibold">Fica top? No papel, muito. Demonstrado, não.</p>
        <ul className="list-disc pl-5 flex flex-col gap-1.5 text-black/70 dark:text-white/70">
          <li>
            <b>São três ciclos.</b> Três compras e três vendas. E os 1.064 e 364 dias foram tirados de 2015–2022 — as duas primeiras voltas da
            carteira são o padrão medindo a si mesmo.
          </li>
          {vendaFora && (
            <li>
              <b>Não sobrou nada fora da amostra.</b> O post é de 12/2023 e a primeira venda depois dele foi em {data(vendaFora.t)}, a{" "}
              {usd(vendaFora.preco)} ({pct(vendaFora.preco / TOPO_2025 - 1)} do topo). Era a única decisão que o padrão não tinha visto — e a venda pela
              EMA 200 entrou depois de olhar para ela (com só os 20%, a venda foi em 17/11/2025, a US$ 92.102). O juiz é o ciclo que vem.
            </li>
          )}
          {medicao && (
            <li>
              <b>A regra publicada é a {medicao.grade.posicao}ª de {medicao.grade.variacoes}</b> na grade das peças que ela tem (abrir a busca 0, 30,
              60 ou 90 dias antes; confirmar com 10%, 20%, 30% ou 50%). A data do post e os 20% vieram antes da grade e a venda pela EMA veio depois; ainda assim, a publicada está perto do topo: a
              mediana das variações é {usdCurto(medicao.grade.mediana)}, a pior {usdCurto(medicao.grade.pior)}. As {medicao.grade.batemSegurar} batem
              o segurar, porque sair de três ursos de −75% a −85% bate o segurar com quase qualquer data.
            </li>
          )}
          <li>
            <b>A vendida são três ursos.</b> +68% em 2018 (sem perpétuo na Binance: hipotético, com o pior financiamento), +65% em 2022 e a de
            agora aberta. Ela rende porque abre DEPOIS de o topo confirmar, já 14% a 29% abaixo dele, e o urso nunca voltou ao preço de entrada
            mais que 10%. Um urso que volte — ou um ciclo que não repita — e a vendida perde junto com a data.
          </li>
          <li>
            O ciclo de 2011–2013 não cabe no padrão (~740 dias de fundo a topo), e é por isso que o post começa em 2015. Ciclo de quatro anos é
            leitura de três halvings; o quarto pode simplesmente não repetir.
          </li>
        </ul>
        <p className="text-xs text-black/45 dark:text-white/45">
          A regra está congelada em <code>REGRAS_CICLO</code> (<code>lib/cicloBtc.ts</code>) e o juiz é o ciclo que vem:{" "}
          <code>docs/preregistro-ciclo.md</code>. Não é recomendação.
        </p>
      </div>
    </section>
  );
}

/** As altcoins nas datas do BTC: o extremo delas perto do dele, e a carteira do BTC aplicada a elas. */
function AltcoinsDoCiclo({ a }: { a: AltcoinsCiclo }) {
  // As colunas com moeda o bastante para dizer algo: o topo de 2017 não tem nenhuma (o par USDT começa em 08/2017).
  const colunas = a.extremos.map((e, i) => ({ ...e, i })).filter((e) => (a.resumo[e.i]?.n ?? 0) > 0);
  const linhas = [...a.linhas].sort((x, y) => y.soComprada - x.soComprada);
  const vezesCurto = (v: number) => `${v.toLocaleString("pt-BR", { maximumFractionDigits: v >= 10 ? 0 : v >= 1 ? 1 : 2 })}x`;
  return (
    <div className="flex flex-col gap-2">
      <h3 className="font-semibold text-sm">E as altcoins? Fazem topo e fundo perto do BTC?</h3>
      <p className="text-xs text-black/55 dark:text-white/55 max-w-3xl">
        {a.linhas.length} moedas da Binance à vista com pelo menos três anos de histórico (o par USDT começa em 08/2017). Para cada topo e fundo
        do BTC, o extremo da moeda num raio de {a.raio} dias: negativo é antes do BTC. <b>Nos fundos, elas vêm junto</b> —{" "}
        {a.resumo.filter((r) => r.tipo === "fundo" && r.n > 0).map((r) => `${r.nome}: ${r.perto40} de ${r.n} a até 40 dias`).join("; ")}.{" "}
        <b>Nos topos, não</b> — {a.resumo.filter((r) => r.tipo === "topo" && r.n > 0).map((r) => `${r.nome}: mediana ${r.mediana} dias, ${r.perto40} de ${r.n} a até 40`).join("; ")}.
        Em 2021 a maioria topou em maio, seis meses antes do BTC (o −180 é a borda do raio). O fundo de 2026 é o de até hoje.
      </p>
      <p className="text-xs text-black/55 dark:text-white/55 max-w-3xl">
        A carteira do BTC aplicada a cada moeda: <b>só comprada, nas datas do BTC, ela bate o segurar a moeda em {a.soComprada.batem} de{" "}
        {a.linhas.length}</b> (mediana {vezesCurto(a.soComprada.mediana)} contra {vezesCurto(a.soComprada.medianaSegurar)} segurando — a maioria destas
        moedas vale menos hoje que em 2018). <b>Com a vendida, {a.comVendida.liquidadas.length} são liquidadas</b> ({a.comVendida.liquidadas.join(", ")}):
        altcoin sobe 100% a 500% em pleno urso do BTC. E a mesma carteira no próprio BTC fez {vezesCurto(a.btc.estrategia)} desde 08/2017, e só
        comprada {vezesCurto(a.btc.soComprada)}: <b>só {a.ganhamDoBtc.length} de {a.linhas.length} moedas ganharam do próprio BTC</b> nas mesmas
        datas e no mesmo período ({a.ganhamDoBtc.join(", ")}) — e não havia como saber quais seriam. A
        lista é só de moedas que existem hoje: as que morreram no caminho não estão aqui, e o segurar delas foi zero.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm whitespace-nowrap">
          <thead>
            <tr className="text-left text-xs text-black/45 dark:text-white/45">
              <th className="py-1.5 pr-3 font-normal">moeda</th>
              {colunas.map((c) => (
                <th key={c.nome} className="py-1.5 pr-3 font-normal text-right">
                  {c.nome.replace(" (até hoje)", "*")}
                </th>
              ))}
              <th className="py-1.5 pr-3 font-normal text-right">só comprada</th>
              <th className="py-1.5 pr-3 font-normal text-right">com vendida</th>
              <th className="py-1.5 font-normal text-right">segurar</th>
            </tr>
          </thead>
          <tbody>
            {linhas.map((l) => (
              <tr key={l.moeda} className="border-t border-black/5 dark:border-white/10">
                <td className="py-1.5 pr-3 font-medium">{l.moeda}</td>
                {colunas.map((c) => {
                  const x = l.distancias[c.i];
                  return (
                    <td key={c.nome} className={`py-1.5 pr-3 text-right tabular-nums ${x !== null && Math.abs(x) <= 40 ? "font-semibold" : "text-black/50 dark:text-white/50"}`}>
                      {x === null ? "—" : `${x > 0 ? "+" : ""}${x} d`}
                    </td>
                  );
                })}
                <td className="py-1.5 pr-3 text-right tabular-nums">{vezesCurto(l.soComprada)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{l.liquidada ? "liquidada" : vezesCurto(l.estrategia)}</td>
                <td className="py-1.5 text-right tabular-nums">{vezesCurto(l.segurar)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-black/45 dark:text-white/45">
        Em negrito, o extremo a até 40 dias do BTC. * o fundo de até hoje. O vendido nas moedas recebe o financiamento do BTCUSDT — o de cada
        moeda não foi baixado. <code>npx tsx scripts/ciclo-altcoins.mts</code>.
      </p>
    </div>
  );
}

/** Uma ordem em português, do jeito que se digita na corretora. */
function textoDaOrdem(o: Ordem, unidade: string): string {
  const q = (u: number) => `${u.toLocaleString("pt-BR", { maximumFractionDigits: u >= 100 ? 0 : u >= 1 ? 3 : 5 })} ${unidade}`;
  const partes: string[] = [];
  if (o.vendidoAntes > 0 && o.vendidoDepois === 0) partes.push(`fecha o vendido de ${q(o.vendidoAntes)}`);
  if (o.compradoAntes > 0 && o.compradoDepois === 0) partes.push(`vende ${q(o.compradoAntes)} à vista`);
  if (o.compradoDepois > 0 && o.compradoAntes === 0) partes.push(`compra ${q(o.compradoDepois)} à vista`);
  if (o.vendidoDepois > 0 && o.vendidoAntes === 0) partes.push(`abre vendido de ${q(o.vendidoDepois)} (1x)`);
  return partes.join(" e ") || "—";
}

export function LivroDeOrdens({
  titulo,
  ordens,
  unidade = "BTC",
  casasPreco = 0,
  agora,
}: {
  titulo: string;
  ordens: Ordem[];
  unidade?: string;
  casasPreco?: number;
  /** O preço e o patrimônio de hoje, com a posição da última ordem marcada a eles. */
  agora?: { preco: number; patrimonio: number };
}) {
  const ultima = ordens.at(-1);
  const posicao = ultima
    ? ultima.vendidoDepois > 0
      ? `vendido de ${ultima.vendidoDepois.toLocaleString("pt-BR", { maximumFractionDigits: ultima.vendidoDepois >= 100 ? 0 : 3 })} ${unidade} desde ${data(ultima.t)}`
      : ultima.compradoDepois > 0
        ? `comprado em ${ultima.compradoDepois.toLocaleString("pt-BR", { maximumFractionDigits: ultima.compradoDepois >= 100 ? 0 : 3 })} ${unidade} desde ${data(ultima.t)}`
        : `em dólar desde ${data(ultima.t)}`
    : "";
  return (
    <details className="rounded-lg border border-black/10 dark:border-white/10 px-3 py-2" open>
      <summary className="cursor-pointer text-sm font-medium">
        {titulo} — {ordens.length} ordens
      </summary>
      <div className="overflow-x-auto mt-2">
        <table className="w-full min-w-[720px] text-sm whitespace-nowrap">
          <thead>
            <tr className="text-left text-xs text-black/45 dark:text-white/45">
              <th className="py-1.5 pr-3 font-normal">data (fechamento)</th>
              <th className="py-1.5 pr-3 font-normal">ordem</th>
              <th className="py-1.5 pr-3 font-normal text-right">preço</th>
              <th className="py-1.5 pr-3 font-normal text-right">taxa</th>
              <th className="py-1.5 font-normal text-right">patrimônio depois</th>
            </tr>
          </thead>
          <tbody>
            {ordens.map((o) => (
              <tr key={o.t} className="border-t border-black/5 dark:border-white/10">
                <td className="py-1.5 pr-3 tabular-nums">{data(o.t)}</td>
                <td className="py-1.5 pr-3">{textoDaOrdem(o, unidade)}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  US$ {o.preco.toLocaleString("pt-BR", { minimumFractionDigits: casasPreco, maximumFractionDigits: casasPreco })}
                </td>
                <td className="py-1.5 pr-3 text-right tabular-nums">{usd(o.custo)}</td>
                <td className="py-1.5 text-right tabular-nums font-medium">{usd(o.patrimonio)}</td>
              </tr>
            ))}
            {agora && ultima && (
              <tr className="border-t border-black/10 dark:border-white/15 text-black/60 dark:text-white/60">
                <td className="py-1.5 pr-3">hoje</td>
                <td className="py-1.5 pr-3">posição aberta: {posicao}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums">
                  US$ {agora.preco.toLocaleString("pt-BR", { minimumFractionDigits: casasPreco, maximumFractionDigits: casasPreco })}
                </td>
                <td className="py-1.5 pr-3 text-right">—</td>
                <td className="py-1.5 text-right tabular-nums font-medium">{usd(agora.patrimonio)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </details>
  );
}
