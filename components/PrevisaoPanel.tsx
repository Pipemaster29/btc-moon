/**
 * A ABA PREVISÃO: o que o algoritmo consegue dizer, o que não consegue, e o
 * ranking de hoje (`lib/previsao.ts`, `docs/preregistro-previsao.md`).
 *
 * A ORDEM É O VEREDITO ANTES DO RANKING, como o placar vem antes das candidatas
 * no Radar. E a palavra da nota é "ficar acima do mercado", nunca "subir": as
 * 10 moedas de nota mais alta renderam −0,02% por semana fora do desenho
 * enquanto a mediana caía 2,53% — bater a mediana caindo menos não é subir, e a
 * tela que chamasse isso de "vai subir" estaria vendendo o que a medição não
 * achou.
 *
 * AS CORES são o par divergente já validado na aba Baleias (azul e vermelho, e
 * não o verde e vermelho do site, que reprova na separação para daltonismo). A
 * barra também diz o lado pela posição, e todo número vai escrito ao lado.
 */

import { ENTRADAS, NOME_DA_ENTRADA, type ArquivoPrevisao, type MedicaoPrevisao, type MoedaPrevista } from "@/lib/previsao";
import { dataHora } from "@/components/robosFormato";

const CORES = "[--acima:#2a78d6] [--abaixo:#e34948] dark:[--acima:#3987e5] dark:[--abaixo:#e66767]";
const CARTAO = "rounded-xl border border-black/10 dark:border-white/10 p-5";

const pc = (v: number, casas = 1) => `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
const comSinal = (v: number, casas = 2) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
const num = (v: number, casas = 2) => v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
const dia = (t: number) => new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

function Veredito({ pergunta, resposta, sim, children }: { pergunta: string; resposta: string; sim: boolean; children: React.ReactNode }) {
  return (
    <div className={CARTAO}>
      <p className="text-sm text-black/50 dark:text-white/50">{pergunta}</p>
      <p className="text-lg font-semibold mt-0.5">
        <span aria-hidden className="mr-1.5">
          {sim ? "✓" : "✕"}
        </span>
        {resposta}
      </p>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1.5">{children}</p>
    </div>
  );
}

/** As três respostas, antes de qualquer ranking. */
export function OQueFoiMedido({ m }: { m: MedicaoPrevisao }) {
  const fora = m.moedas.janelas.find((j) => j.nome === "fora do desenho");
  const d = m.moedas.diagnostico;
  const e = m.moedas.escolha;
  const eFora = e.janelas.find((j) => j.nome === "fora do desenho");
  const cima = m.moedas.decimos[9];
  const baixo = m.moedas.decimos[0];
  return (
    <section>
      <div className="grid gap-4 lg:grid-cols-3">
        <Veredito pergunta="Quais moedas ficam acima do mercado?" resposta={m.moedas.veredito.passa ? "Isso ele sabe dizer" : "Não sabe dizer"} sim={m.moedas.veredito.passa}>
          Em dados que o modelo não viu ({fora?.dias} dias), o décimo de nota mais alta ficou acima da mediana do mercado em {pc(cima.acerto)} das vezes, e
          o de nota mais baixa, em {pc(baixo.acerto)}. Mas o que ele aprendeu é uma coisa só: moeda grande e calma cai menos que moeda agitada. Sem essa
          entrada, a correlação vai de {num(fora?.ic ?? NaN, 3)} para {num(d.icSemAgitacao, 3)}.
        </Veredito>
        <Veredito pergunta="Quais moedas vão subir?" resposta="Isso ele não sabe dizer" sim={e.veredito.passa}>
          As 10 de nota mais alta renderam {comSinal(d.top10Absoluto)}% por semana — não subiram, caíram menos que a mediana ({comSinal(d.medianaAbsoluta)}%).
          E entre moedas de agitação parecida o modelo não escolhe: correlação de {num(eFora?.ic ?? NaN, 3)} (t {num(eFora?.t ?? NaN)}), com as 10 de cima
          acima da mediana em {pc(eFora?.top10Acerto ?? NaN)} das vezes. É cara ou coroa.
        </Veredito>
        <Veredito pergunta="Para onde vai o BTC?" resposta={m.btc.veredito.passa ? "O modelo bate a taxa histórica" : "O modelo não acrescenta nada"} sim={m.btc.veredito.passa}>
          De {dia(m.btc.de)} a {dia(m.btc.ate)}, o BTC estava mais alto 30 dias depois em {pc(m.btc.taxaBase)} das vezes. O modelo, com cinco entradas
          (média de 200 dias, retornos, queda desde a máxima, índice de medo), erra {pc(-m.btc.ganho, 0)} MAIS do que quem só repete essa taxa.
        </Veredito>
      </div>
      <p className="text-xs text-black/45 dark:text-white/45 mt-3 max-w-4xl">
        O critério de cada teste foi escrito antes dos números (`docs/preregistro-previsao.md`); o teste do meio foi escrito depois de ver o primeiro, e
        está dito lá. Custo, financiamento e escorregada não estão na conta: isto é um ranking, não uma carteira. A carteira com custo é a dos robôs — e
        o que rende nela não é acertar a moeda (26% das compras do Momento dão lucro), é cortar a que erra e deixar correr a rara que dispara.
      </p>
    </section>
  );
}

/**
 * O gráfico da calibração: por décimo da nota, a fração das vezes em que a
 * moeda ficou acima da mediana do mercado, fora do desenho. A linha é o 50% de
 * quem não sabe nada. Uma série só, então sem legenda — o título diz o que é.
 */
export function GraficoDosDecimos({ m }: { m: MedicaoPrevisao }) {
  const L = 640;
  const A = 220;
  const base = A - 34;
  const topo = 16;
  const larg = (L - 40) / 10;
  const y = (v: number) => base - ((v - 0.3) / 0.45) * (base - topo);
  return (
    <section className={`${CARTAO} ${CORES}`}>
      <h2 className="font-semibold text-lg">Quanto vale a nota</h2>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1.5 max-w-3xl">
        As moedas de cada dia, separadas em dez grupos pela nota. Em cada grupo, a fração das vezes em que a moeda ficou acima da mediana do mercado nos 7
        dias seguintes — medido de 07/2025 a 10/2026, depois de os pesos estarem fixados.
      </p>
      <div className="mt-3 overflow-x-auto">
        <svg viewBox={`0 0 ${L} ${A}`} className="w-full min-w-[30rem] max-w-3xl" role="img" aria-label="Fração acima da mediana, por décimo da nota">
          <line x1={34} x2={L} y1={y(0.5)} y2={y(0.5)} className="stroke-black/30 dark:stroke-white/30" strokeDasharray="3 3" />
          <text x={0} y={y(0.5) + 4} className="fill-black/45 dark:fill-white/45 text-[11px]">
            50%
          </text>
          {m.moedas.decimos.map((q, i) => {
            const x = 40 + i * larg;
            const h = base - y(q.acerto);
            return (
              <g key={i}>
                <title>{`Décimo ${i + 1}: ${pc(q.acerto)} acima da mediana, retorno relativo médio ${comSinal(q.retorno)} p.p., ${q.n.toLocaleString("pt-BR")} moeda-dias`}</title>
                <rect x={x + 1} y={y(q.acerto)} width={larg - 2} height={h} rx={4} className={q.acerto >= 0.5 ? "fill-[var(--acima)]" : "fill-[var(--abaixo)]"} />
                <text x={x + larg / 2} y={y(q.acerto) - 5} textAnchor="middle" className="fill-black/75 dark:fill-white/75 text-[11px] tabular-nums">
                  {pc(q.acerto, 0)}
                </text>
                <text x={x + larg / 2} y={A - 16} textAnchor="middle" className="fill-black/45 dark:fill-white/45 text-[11px]">
                  {i === 0 ? "nota mais baixa" : i === 9 ? "mais alta" : i + 1}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <p className="text-xs text-black/45 dark:text-white/45 mt-2 max-w-3xl">
        Ficar acima da mediana não é subir: no mesmo período a mediana do mercado caiu {comSinal(m.moedas.diagnostico.medianaAbsoluta)}% por semana, e só{" "}
        {pc(m.moedas.diagnostico.universoSubiu)} das moedas subiram em 7 dias. O grupo de nota mais baixa é o das moedas mais agitadas — as que este radar
        vigia.
      </p>
    </section>
  );
}

function Barra({ nota, maior }: { nota: number; maior: number }) {
  const w = Math.min(50, (Math.abs(nota) / maior) * 50);
  return (
    <span className="relative inline-block h-1.5 w-28 rounded-full bg-black/5 dark:bg-white/10 align-middle" aria-hidden>
      <span className="absolute left-1/2 top-[-3px] h-3 w-px bg-black/25 dark:bg-white/25" />
      {nota > 0 ? <span className="absolute left-1/2 top-0 h-1.5 rounded-r bg-[var(--acima)]" style={{ width: `${w}%` }} /> : <span className="absolute right-1/2 top-0 h-1.5 rounded-l bg-[var(--abaixo)]" style={{ width: `${w}%` }} />}
    </span>
  );
}

function Linhas({ moedas, m, maior }: { moedas: MoedaPrevista[]; m: MedicaoPrevisao; maior: number }) {
  return (
    <>
      {moedas.map((x) => {
        // A entrada que mais pesou na nota desta moeda, para a nota não ser uma caixa-preta.
        const k = x.contribuicao.reduce((a, v, i) => (Math.abs(v) > Math.abs(x.contribuicao[a]) ? i : a), 0);
        return (
          <tr key={x.symbol} className="border-t border-black/5 dark:border-white/5">
            <td className="py-1.5 pr-3 font-medium">{x.symbol.replace(/USDT$/, "")}</td>
            <td className="py-1.5 pr-3">
              <Barra nota={x.nota} maior={maior} />
            </td>
            <td className="py-1.5 pr-3 text-right">{pc(m.moedas.decimos[x.decimo].acerto, 0)}</td>
            <td className="py-1.5 pr-3 text-right">{x.x[0] === null ? "—" : `${comSinal(x.x[0], 1)}%`}</td>
            <td className="py-1.5 pr-3 text-right">{x.x[3] === null ? "—" : `${comSinal(x.x[3], 0)}%`}</td>
            <td className="py-1.5 pr-3 text-right">{x.x[5] === null ? "—" : pc(x.x[5])}</td>
            <td className="py-1.5 text-black/50 dark:text-white/50">
              {NOME_DA_ENTRADA[ENTRADAS[k]]} {x.contribuicao[k] > 0 ? "a favor" : "contra"}
            </td>
          </tr>
        );
      })}
    </>
  );
}

/** O ranking de hoje: as 15 de nota mais alta, as 15 de mais baixa, e o resto recolhido. */
export function RankingDeHoje({ p, m }: { p: ArquivoPrevisao; m: MedicaoPrevisao }) {
  const maior = Math.max(...p.moedas.map((x) => Math.abs(x.nota)), 1e-9);
  const cima = p.moedas.slice(0, 15);
  const baixo = p.moedas.slice(-15);
  const meio = p.moedas.slice(15, -15);
  const cabeca = (
    <thead className="text-black/40 dark:text-white/40">
      <tr className="text-left">
        <th className="py-1 pr-3 font-normal">moeda</th>
        <th className="py-1 pr-3 font-normal">nota</th>
        <th className="py-1 pr-3 font-normal text-right" title="A fração das vezes em que o décimo desta nota ficou acima da mediana do mercado, fora do desenho">
          acima do mercado
        </th>
        <th className="py-1 pr-3 font-normal text-right">1 dia</th>
        <th className="py-1 pr-3 font-normal text-right">45 dias</th>
        <th className="py-1 pr-3 font-normal text-right" title="O desvio do retorno diário em 30 dias">
          agitação
        </th>
        <th className="py-1 font-normal">o que mais pesou</th>
      </tr>
    </thead>
  );
  return (
    <section className={`${CARTAO} ${CORES}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-lg">O ranking de hoje</h2>
        <span className="text-xs text-black/40 dark:text-white/40 tabular-nums">
          decisão de {dia(p.dia)} · calculado em {dataHora(p.geradoEm)} UTC
        </span>
      </div>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1.5 max-w-4xl">
        Os {p.moedas.length} perpétuos da Binance com US$ 20 milhões ou mais de volume por dia, dos {p.listadas} listados, ordenados pela nota. “Acima do
        mercado” é a fração medida para o décimo daquela nota — a chance de a moeda render mais que a mediana em 7 dias, não de subir. As entradas vão até
        o fechamento da véspera.
      </p>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-black/55 dark:text-white/55">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-3 rounded-sm bg-[var(--acima)]" /> nota a favor (à direita do centro)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-3 rounded-sm bg-[var(--abaixo)]" /> nota contra (à esquerda)
        </span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[44rem] whitespace-nowrap text-xs tabular-nums">
          {cabeca}
          <tbody>
            <Linhas moedas={cima} m={m} maior={maior} />
            <tr>
              <td colSpan={7} className="py-2 text-center text-black/35 dark:text-white/35">
                · · · {meio.length} moedas no meio, abaixo · · ·
              </td>
            </tr>
            <Linhas moedas={baixo} m={m} maior={maior} />
          </tbody>
        </table>
      </div>
      {meio.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-black/55 dark:text-white/55">As {meio.length} do meio</summary>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[44rem] whitespace-nowrap tabular-nums">
              {cabeca}
              <tbody>
                <Linhas moedas={meio} m={m} maior={maior} />
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}

/** Os oito pesos: o que o modelo olha, e quanto. */
export function OsPesos({ m }: { m: MedicaoPrevisao }) {
  const maior = Math.max(...m.moedas.pesos.map(Math.abs));
  return (
    <section className={`${CARTAO} ${CORES}`}>
      <h2 className="font-semibold text-lg">O que o modelo olha</h2>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1.5 max-w-3xl">
        Oito entradas, cada uma virando a posição da moeda dentro do universo do dia, e um peso para cada. Os pesos saíram de 03/2024 a 06/2025 e não
        mudaram depois. Peso negativo quer dizer que quanto MAIOR a entrada, pior a nota.
      </p>
      <table className="mt-3 text-xs tabular-nums">
        <tbody>
          {ENTRADAS.map((e, k) => (
            <tr key={e} className="border-t border-black/5 dark:border-white/5">
              <td className="py-1.5 pr-4">{NOME_DA_ENTRADA[e]}</td>
              <td className="py-1.5 pr-3">
                <Barra nota={m.moedas.pesos[k]} maior={maior} />
              </td>
              <td className="py-1.5 text-right">{comSinal(m.moedas.pesos[k] / 100, 3)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-black/45 dark:text-white/45 mt-3 max-w-3xl">
        A agitação pesa três vezes mais que a segunda entrada, e é dela que vem todo o acerto. As mais escolhidas entre as 10 de cima, fora do desenho:{" "}
        {m.moedas.diagnostico.maisEscolhidas.slice(0, 8).map((x) => `${x.symbol.replace(/USDT$/, "")} (${pc(x.fracao, 0)} dos dias)`).join(", ")}.
      </p>
    </section>
  );
}

/** O BTC: a taxa histórica, e a prova de que o modelo não a melhora. */
export function PrevisaoDoBtc({ p, m }: { p: ArquivoPrevisao | null; m: MedicaoPrevisao }) {
  const b = m.btc;
  const grandes = b.calibracao.filter((c) => c.n > 500).map((c) => c.subiu);
  return (
    <section className={CARTAO}>
      <h2 className="font-semibold text-lg">Para onde vai o BTC</h2>
      <div className="grid gap-4 sm:grid-cols-3 mt-3 text-sm">
        <div>
          <p className="text-black/50 dark:text-white/50">Mais alto em 30 dias, historicamente</p>
          <p className="text-2xl font-semibold tabular-nums">{pc(b.taxaBase)}</p>
          <p className="text-xs text-black/40 dark:text-white/40">
            das {b.dias.toLocaleString("pt-BR")} janelas de {dia(b.de)} a {dia(b.ate)}
          </p>
        </div>
        <div>
          <p className="text-black/50 dark:text-white/50">Em 7 dias</p>
          <p className="text-2xl font-semibold tabular-nums">{pc(b.seteDias.taxaBase)}</p>
          <p className="text-xs text-black/40 dark:text-white/40">pouco acima de cara ou coroa</p>
        </div>
        <div>
          <p className="text-black/50 dark:text-white/50">O modelo contra essa taxa</p>
          <p className="text-2xl font-semibold tabular-nums">{comSinal(b.ganho, 0)}%</p>
          <p className="text-xs text-black/40 dark:text-white/40">
            de erro a menos (negativo é erro a MAIS); intervalo de 95%: {comSinal(b.intervalo[0], 0)}% a {comSinal(b.intervalo[1], 0)}%
          </p>
        </div>
      </div>
      <p className="text-sm text-black/60 dark:text-white/60 mt-3 max-w-4xl">
        A resposta honesta para “o BTC vai subir?” é a taxa histórica: um pouco mais vezes sim do que não. O modelo foi refeito a cada virada de ano só
        com o passado e testado contra o que veio depois, e perdeu para ela nas duas metades do teste. Por isso esta tela não mostra a previsão dele como
        previsão.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="text-xs tabular-nums whitespace-nowrap">
          <thead className="text-black/40 dark:text-white/40">
            <tr className="text-left">
              <th className="py-1 pr-4 font-normal">quando o modelo dizia</th>
              <th className="py-1 pr-4 font-normal text-right">dias</th>
              <th className="py-1 font-normal text-right">o BTC subiu em</th>
            </tr>
          </thead>
          <tbody>
            {b.calibracao.map((c) => (
              <tr key={c.de} className="border-t border-black/5 dark:border-white/5">
                <td className="py-1.5 pr-4">
                  {pc(c.de, 0)} a {pc(c.ate, 0)} de chance de alta
                </td>
                <td className="py-1.5 pr-4 text-right">{c.n.toLocaleString("pt-BR")}</td>
                <td className="py-1.5 text-right">{c.n > 0 ? pc(c.subiu) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-black/45 dark:text-white/45 mt-3 max-w-4xl">
        Se o modelo soubesse algo, a última coluna subiria de cima para baixo. Nas faixas com mais de 500 dias, que somam quase todo o teste, ela vai de{" "}
        {pc(Math.min(...grandes), 0)} a {pc(Math.max(...grandes), 0)} — a taxa de sempre, qualquer que fosse a previsão.
        {p?.btc ? ` Para o registro, hoje (BTC a US$ ${p.btc.preco.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}) ele diz ${pc(p.btc.p30, 0)}.` : ""}
      </p>
    </section>
  );
}
