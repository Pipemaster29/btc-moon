"use client";

/**
 * A MESA DE RISCO: o que um fundo pergunta antes de pôr dinheiro numa
 * estratégia, respondido pela medição dos robôs (`lib/quant.ts`, gravado por
 * `npm run medir-robos`).
 *
 * A ORDEM É A DE UM COMITÊ DE INVESTIMENTO. Primeiro o produto — os dois livros
 * que passaram, juntos e repartidos por risco, como subcontas de um fundo —,
 * depois o risco de cada série com o intervalo do bootstrap ao lado, depois se
 * o resultado é sorte de quem testou ~300 ideias e publicou as melhores, e por
 * fim quanto dinheiro cabe antes de o próprio tamanho comer o lucro.
 *
 * A FRASE QUE CONCLUI SAI DO NÚMERO. Quando o Sharpe deflacionado reprova, a
 * tela diz que reprovou; quando o walk-forward ganha muito menos que a regra
 * publicada, a diferença aparece como o que ela é — o que a medição ganha por
 * ter sido escolhida depois de ver os dados.
 */

import { CAPITAL_ROBO, type Medicao } from "@/lib/robos";
import { faixaDeRetornos, quantil, type FichaMedida, type FundoAoVivo, type MedicaoQuant, type ValidacaoLivro } from "@/lib/quant";
import CurvaRobos, { type SerieRobo } from "./CurvaRobos";

const NOME: Record<string, string> = {
  momento: "Momento",
  turbo: "Momento turbo",
  "caca-monstra": "Caça-monstra",
  fluxo: "Fluxo",
  fundo: "Fundo (Momento + Fluxo)",
  btc: "BTC comprado",
};
const CURTO: Record<string, string> = { momento: "Momento", turbo: "Turbo", "caca-monstra": "Caça", fluxo: "Fluxo", fundo: "Fundo", btc: "BTC" };
const nome = (id: string) => NOME[id] ?? id;
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function pct(v: number, casas = 0): string {
  if (!Number.isFinite(v)) return "—";
  const c = Math.abs(v) < 0.1 ? Math.max(casas, 1) : casas;
  const x = Math.abs(v * 100) < 0.5 * 10 ** -c ? 0 : v * 100;
  return `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c })}%`;
}
/** Uma fração sem sinal: 0,0423 → "4,2%". */
function fr(v: number, casas = 1): string {
  return Number.isFinite(v) ? `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%` : "—";
}
function num(v: number, casas = 2): string {
  return Number.isFinite(v) ? v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas }).replace("-", "−") : "—";
}
function usd(v: number, casas = 2): string {
  return `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
}
function capital(v: number): string {
  if (v >= 1e6) return `US$ ${(v / 1e6).toLocaleString("pt-BR")} mi`;
  if (v >= 1e3) return `US$ ${(v / 1e3).toLocaleString("pt-BR")} mil`;
  return usd(v, 0);
}
function tom(v: number): string {
  if (v > 0.0005) return "text-[#0a7d43] dark:text-[#0ECB81]";
  if (v < -0.0005) return "text-[#C42B3E] dark:text-[#F6465D]";
  return "";
}
const data = (t: number) => new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
const th = "py-1 pr-3 font-normal";
const linhaTabela = "border-t border-black/5 dark:border-white/5";
const nota = "text-xs text-black/50 dark:text-white/50 mt-2";

function Intervalo({ v, de, ate, f }: { v: number; de: number; ate: number; f: (x: number) => string }) {
  return (
    <>
      {f(v)}{" "}
      <span className="text-black/40 dark:text-white/40">
        [{f(de)} a {f(ate)}]
      </span>
    </>
  );
}

function TabelaFicha({ fichas }: { fichas: FichaMedida[] }) {
  return (
    <div className="overflow-x-auto mt-2">
      <table className="w-full text-xs tabular-nums">
        <thead className="text-black/40 dark:text-white/40">
          <tr className="text-left">
            <th className={th}>série</th>
            <th className={`${th} text-right`}>retorno ao ano</th>
            <th className={`${th} text-right`}>volatilidade</th>
            <th className={`${th} text-right`}>Sharpe</th>
            <th className={`${th} text-right`} title="A média sobre o desvio só das perdas">Sortino</th>
            <th className={`${th} text-right`} title="Retorno ao ano ÷ queda máxima">Calmar</th>
            <th className={`${th} text-right`}>queda máx</th>
            <th className={`${th} text-right`} title="O maior número de dias seguidos abaixo do pico anterior">dias abaixo do pico</th>
            <th className={`${th} text-right`} title="A perda de um dia que só é passada em 5% dos dias, e a média desses 5%">VaR · CVaR 95% (dia)</th>
            <th className={`${th} text-right`} title="Quanto a série anda por 1% do BTC, nos retornos diários">beta BTC</th>
            <th className="py-1 font-normal text-right">meses no positivo</th>
          </tr>
        </thead>
        <tbody>
          {fichas.map((f) => {
            const x = f.ficha;
            const iv = f.intervalo;
            const ref = f.id === "btc";
            return (
              <tr key={f.id} className={`${linhaTabela} ${ref ? "text-black/45 dark:text-white/45" : ""}`}>
                <td className="py-1 pr-3 whitespace-nowrap">{nome(f.id)}</td>
                <td className="py-1 pr-3 text-right whitespace-nowrap">{iv ? <Intervalo v={x.cagr} de={iv.cagr[0]} ate={iv.cagr[2]} f={(v) => pct(v)} /> : pct(x.cagr)}</td>
                <td className="py-1 pr-3 text-right">{fr(x.volAnual, 0)}</td>
                <td className="py-1 pr-3 text-right whitespace-nowrap">{iv ? <Intervalo v={x.sharpe} de={iv.sharpe[0]} ate={iv.sharpe[2]} f={(v) => num(v)} /> : num(x.sharpe)}</td>
                <td className="py-1 pr-3 text-right">{num(x.sortino)}</td>
                <td className="py-1 pr-3 text-right">{num(x.calmar, 1)}</td>
                <td className="py-1 pr-3 text-right whitespace-nowrap">{iv ? <Intervalo v={x.quedaMaxima} de={iv.queda[0]} ate={iv.queda[2]} f={(v) => pct(v)} /> : pct(x.quedaMaxima)}</td>
                <td className="py-1 pr-3 text-right">{x.maiorTempoSubmerso.toLocaleString("pt-BR")}</td>
                <td className="py-1 pr-3 text-right whitespace-nowrap">
                  {fr(x.var95)} · {fr(x.cvar95)}
                </td>
                <td className="py-1 pr-3 text-right">{x.beta === undefined ? "—" : num(x.beta)}</td>
                <td className="py-1 text-right">{fr(x.mesesPositivos, 0)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TabelaTrades({ fichas }: { fichas: FichaMedida[] }) {
  const com = fichas.filter((f) => f.trades);
  if (com.length === 0) return null;
  return (
    <div className="overflow-x-auto mt-3">
      <table className="w-full text-xs tabular-nums">
        <thead className="text-black/40 dark:text-white/40">
          <tr className="text-left">
            <th className={th}>robô</th>
            <th className={`${th} text-right`}>trades</th>
            <th className={`${th} text-right`}>no positivo</th>
            <th className={`${th} text-right`} title="Sobre o nocional: a variação de preço líquida de custo e financiamento">ganho médio · perda média</th>
            <th className={`${th} text-right`} title="O que os trades vencedores ganharam ÷ o que os perdedores perderam, em dólares">fator de lucro</th>
            <th className={`${th} text-right`}>duração média</th>
            <th className="py-1 font-normal text-right" title="Nocional negociado (entrada e saída) por ano ÷ patrimônio médio">giro ao ano</th>
          </tr>
        </thead>
        <tbody>
          {com.map((f) => {
            const t = f.trades!;
            return (
              <tr key={f.id} className={linhaTabela}>
                <td className="py-1 pr-3">{nome(f.id)}</td>
                <td className="py-1 pr-3 text-right">{t.n.toLocaleString("pt-BR")}</td>
                <td className="py-1 pr-3 text-right">{fr(t.positivos, 0)}</td>
                <td className="py-1 pr-3 text-right whitespace-nowrap">
                  {pct(t.ganhoMedio, 1)} · {pct(t.perdaMedia, 1)}
                </td>
                <td className="py-1 pr-3 text-right">{num(t.fatorDeLucro)}</td>
                <td className="py-1 pr-3 text-right">{num(t.duracaoMediaDias, 1)} d</td>
                <td className="py-1 text-right">{Math.round(t.giroAnual).toLocaleString("pt-BR")}x</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** O veredito do Sharpe deflacionado, em palavras: a régua de 95% é a de quem decide com dinheiro. */
function veredito(dsr: number): string {
  if (!Number.isFinite(dsr)) return "sem leitura";
  if (dsr >= 0.95) return "passa";
  if (dsr >= 0.8) return "passa no limite";
  if (dsr >= 0.5) return "não passa";
  return "reprova";
}

function TabelaValidacao({ validacao, tentativas }: { validacao: ValidacaoLivro[]; tentativas: number }) {
  return (
    <div className="overflow-x-auto mt-2">
      <table className="w-full text-xs tabular-nums">
        <thead className="text-black/40 dark:text-white/40">
          <tr className="text-left">
            <th className={th}>livro</th>
            <th className={`${th} text-right`}>a publicada na grade</th>
            <th className={`${th} text-right`}>Sharpe: publicada · meio da grade</th>
            <th className={`${th} text-right`} title="A probabilidade de o Sharpe verdadeiro passar do que a melhor de N tentativas sem vantagem mostraria">
              Sharpe deflacionado: grade · {tentativas} tentativas
            </th>
            <th className={`${th} text-right`} title="Em que fração das 12.870 partições a melhor variação do passado ficou na metade de baixo do futuro">
              PBO
            </th>
            <th className="py-1 font-normal text-right" title="A variação escolhida a cada trimestre pelos 365 dias anteriores, contra a publicada nos mesmos dias">
              escolhendo em tempo real · a publicada
            </th>
          </tr>
        </thead>
        <tbody>
          {validacao.map((v) => {
            const [daGrade, daPesquisa] = v.deflacionado;
            const wf = v.walkForward.find((w) => w.treinoDias === 365) ?? v.walkForward[0];
            return (
              <tr key={v.id} className={linhaTabela}>
                <td className="py-1 pr-3">{nome(v.id)}</td>
                <td className="py-1 pr-3 text-right whitespace-nowrap">
                  {v.posicaoDaPublicada}ª de {v.variantes}
                </td>
                <td className="py-1 pr-3 text-right whitespace-nowrap">
                  {num(v.sharpePublicada)} · {num(quantil(v.sharpes, 0.5))}
                </td>
                <td className="py-1 pr-3 text-right whitespace-nowrap">
                  {fr(daGrade.dsr, 0)} · <strong className="font-semibold">{fr(daPesquisa.dsr, 0)}</strong>{" "}
                  <span className="text-black/45 dark:text-white/45">({veredito(daPesquisa.dsr)})</span>
                </td>
                <td className="py-1 pr-3 text-right">{num(v.pbo.pbo)}</td>
                <td className="py-1 text-right whitespace-nowrap">
                  {wf ? (
                    <>
                      <span className={tom(wf.retorno)}>{pct(wf.retorno)}</span> (Sharpe {num(wf.sharpe)}) · {pct(wf.retornoPublicada)} ({num(wf.sharpePublicada)})
                    </>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TabelaCapacidade({ quant }: { quant: MedicaoQuant }) {
  const y1 = quant.capacidade.filter((c) => c.y === 1);
  const capitais = [...new Set(y1.flatMap((c) => c.linhas.map((l) => l.capital)))].sort((a, b) => a - b);
  if (y1.length === 0) return null;
  return (
    <div className="overflow-x-auto mt-2">
      <table className="w-full text-xs tabular-nums">
        <thead className="text-black/40 dark:text-white/40">
          <tr className="text-left">
            <th className={th}>começando com</th>
            {y1.map((c) => (
              <th key={c.id} className={`${th} text-right`} colSpan={1}>
                {nome(c.id)}: 01/2024–09/2026 · Sharpe · impacto por lado
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {capitais.map((k) => (
            <tr key={k} className={linhaTabela}>
              <td className="py-1 pr-3 whitespace-nowrap">{capital(k)}</td>
              {y1.map((c) => {
                const l = c.linhas.find((x) => x.capital === k);
                return (
                  <td key={c.id} className="py-1 pr-3 text-right whitespace-nowrap">
                    {l ? (
                      <>
                        <span className={tom(l.retorno)}>{pct(l.retorno)}</span> · {num(l.sharpe)} · {fr(l.impacto, 2)}
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MesesDoFundo({ meses }: { meses: { mes: string; retorno: number }[] }) {
  const anos = [...new Set(meses.map((m) => m.mes.slice(0, 4)))].sort();
  const porMes = new Map(meses.map((m) => [m.mes, m.retorno]));
  return (
    <div className="overflow-x-auto mt-2">
      <table className="w-full text-[11px] tabular-nums">
        <thead className="text-black/40 dark:text-white/40">
          <tr>
            <th className="py-1 pr-2 font-normal text-left">ano</th>
            {MESES.map((m) => (
              <th key={m} className="py-1 px-1 font-normal text-right">
                {m}
              </th>
            ))}
            <th className="py-1 pl-2 font-normal text-right">ano</th>
          </tr>
        </thead>
        <tbody>
          {anos.map((a) => {
            const doAno = MESES.map((_, k) => porMes.get(`${a}-${String(k + 1).padStart(2, "0")}`));
            const ano = doAno.reduce<number>((acc, r) => (r === undefined ? acc : (1 + acc) * (1 + r) - 1), 0);
            return (
              <tr key={a} className={linhaTabela}>
                <td className="py-1 pr-2">{a}</td>
                {doAno.map((r, k) => (
                  <td key={k} className={`py-1 px-1 text-right ${r === undefined ? "text-black/25 dark:text-white/25" : tom(r)}`}>
                    {r === undefined ? "·" : pct(r)}
                  </td>
                ))}
                <td className={`py-1 pl-2 text-right font-semibold ${tom(ano)}`}>{pct(ano)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function MesaRobos({
  medicao,
  quant,
  fundoVivo,
}: {
  medicao: Medicao;
  quant: MedicaoQuant;
  /** O fundo marcado com os robôs ao vivo (`fundoAoVivo`); nulo antes da primeira virada com os dois. */
  fundoVivo: FundoAoVivo | null;
}) {
  const f = quant.fundo;
  const ficha = (id: string) => quant.fichas.find((x) => x.id === id);
  const fichaFundo = ficha("fundo");
  const fichaMomento = ficha("momento");
  const fichaFluxo = ficha("fluxo");
  const medido = (id: string) => medicao.robos.find((m) => m.id === id);
  const momento = medido("momento");
  const fluxo = medido("fluxo");
  const corte = momento?.linhas.find((l) => l.janela.startsWith("fora"))?.de;
  const vM = quant.validacao.find((v) => v.id === "momento");
  const vF = quant.validacao.find((v) => v.id === "fluxo");
  const dsr300 = (v: ValidacaoLivro | undefined) => v?.deflacionado.find((d) => d.tentativas === quant.tentativasDaPesquisa);
  const wf = (v: ValidacaoLivro | undefined) => v?.walkForward.find((w) => w.treinoDias === 365);
  const a2 = f?.alavancado.find((a) => a.fator === 2);
  const capM = quant.capacidade.find((c) => c.id === "momento" && c.y === 1);
  const capF = quant.capacidade.find((c) => c.id === "fluxo" && c.y === 1);
  const capM05 = quant.capacidade.find((c) => c.id === "momento" && c.y === 0.5);
  const emCapital = (c: typeof capM, k: number) => c?.linhas.find((l) => l.capital === k);
  // Os piores dias do BTC em que o fundo fechou no positivo: é a parte do "não anda com o mercado" que dá para ver.
  const estresse = quant.estresse;
  const positivosNoEstresse = estresse.filter((x) => (x.retornos.fundo ?? 0) > 0).length;
  const corr = (a: string, b: string) => {
    const i = quant.correlacoes.ids.indexOf(a);
    const j = quant.correlacoes.ids.indexOf(b);
    return i >= 0 && j >= 0 ? quant.correlacoes.matriz[i][j] : NaN;
  };

  // A fatia do Fluxo em cada dia 1º, sem o primeiro mês (partes iguais, sem passado).
  const fatias = (f?.pesos ?? []).slice(1).map((p) => p.pesos[f?.componentes.indexOf("fluxo") ?? 1]);
  const pesoFluxo = { min: fatias.length > 0 ? Math.min(...fatias) : NaN, max: fatias.length > 0 ? Math.max(...fatias) : NaN };
  // O fundo ganha dos dois livros em Sharpe em cada metade? A frase só aparece se ganhar.
  const ganhaNasMetades =
    !!f &&
    !!momento &&
    !!fluxo &&
    [1, 2].every((k) => f.linhas[k].sharpe > momento.linhas[k].sharpe && f.linhas[k].sharpe > fluxo.linhas[k].sharpe);

  const series: SerieRobo[] = [];
  if (momento) series.push({ id: "momento", rotulo: "Momento", curto: "Momento", cor: "var(--robo-1)", pontos: momento.curva });
  if (fluxo) series.push({ id: "fluxo", rotulo: "Fluxo", curto: "Fluxo", cor: "var(--robo-4)", pontos: fluxo.curva });
  if (f) series.push({ id: "fundo", rotulo: "Fundo: os dois, repartidos por risco", curto: "Fundo", cor: "var(--robo-5)", pontos: f.curva });

  // O fundo ao vivo contra a faixa medida dele, como cada robô.
  const diasVivo = fundoVivo ? Math.floor((fundoVivo.curva[fundoVivo.curva.length - 1].t - fundoVivo.comecouEm) / 86_400_000) : 0;
  const faixa = fundoVivo && f ? faixaDeRetornos(f.curva, diasVivo) : null;
  const retVivo = fundoVivo ? fundoVivo.patrimonio / CAPITAL_ROBO - 1 : 0;

  return (
    <div className="mt-8 border-t border-black/10 dark:border-white/10 pt-6">
      <h3 className="font-semibold">A mesa de risco</h3>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1">
        O que um fundo pergunta antes de pôr dinheiro numa estratégia, respondido pela mesma medição: quanto ela arrisca e
        com que intervalo, se o Sharpe sobrevive às ~{quant.tentativasDaPesquisa} ideias testadas até achá-la, se
        escolher a regra em tempo real teria funcionado, e quanto dinheiro cabe antes de o próprio tamanho comer o lucro.
        E o que um fundo faria com os dois livros que passaram: juntá-los.
      </p>

      {f && fichaFundo && fichaMomento && fichaFluxo && (
        <>
          <h4 className="text-sm font-semibold mt-5">O fundo: Momento e Fluxo em subcontas, repartidos por risco</h4>
          <p className="text-xs text-black/60 dark:text-white/60 mt-1">
            Todo dia 1º o capital é repartido pelo inverso da volatilidade de {f.janelaDias} dias de cada livro — o mais
            agitado recebe menos —, só com o que se sabia na véspera, e só com o caixa livre de cada subconta: dinheiro que é
            margem de posição aberta não sai sem fechar a posição. Como o Fluxo oscila menos que o Momento, ele fica com a
            maior parte: de {fr(pesoFluxo.min, 0)} a {fr(pesoFluxo.max, 0)} do capital desde o segundo mês. Os dois quase não
            andam juntos (correlação diária de {num(corr("momento", "fluxo"))}).
          </p>
          {fundoVivo ? (
            <p className="text-xs text-black/70 dark:text-white/70 mt-2 tabular-nums">
              <strong className="font-semibold">Ao vivo</strong> desde {data(fundoVivo.comecouEm)}, com os dois robôs da
              arena: <strong className={`font-semibold ${tom(retVivo)}`}>{usd(fundoVivo.patrimonio)}</strong> ({pct(retVivo, 1)}) ·
              agora {fr(fundoVivo.pesos[0], 0)} no Momento e {fr(fundoVivo.pesos[1], 0)} no Fluxo
              {faixa && (
                <>
                  {" "}
                  · medido em {diasVivo} dia{diasVivo === 1 ? "" : "s"}: {pct(faixa.p10, 1)} a {pct(faixa.p90, 1)} (8 em 10), ao vivo{" "}
                  <strong className="font-medium">{retVivo < faixa.p10 ? "abaixo da faixa" : retVivo > faixa.p90 ? "acima da faixa" : "dentro da faixa"}</strong>
                </>
              )}
              .
            </p>
          ) : (
            <p className="text-xs text-black/45 dark:text-white/45 mt-2">
              O fundo ao vivo começa na primeira virada de dia em que os dois robôs têm marcação.
            </p>
          )}
          <div className="mt-3">
            <CurvaRobos
              series={series}
              capital={CAPITAL_ROBO}
              titulo="Medido · o fundo e os dois livros dele desde 01/2024 (escala log)"
              log
              corte={corte ? { t: corte, rotulo: "fora da amostra →" } : undefined}
            />
          </div>
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-xs tabular-nums">
              <thead className="text-black/40 dark:text-white/40">
                <tr className="text-left">
                  <th className={th}>série</th>
                  <th className={`${th} text-right`}>01/2024–09/2026</th>
                  <th className={`${th} text-right`}>dentro (até 06/2025)</th>
                  <th className={`${th} text-right`}>fora (07/2025 →)</th>
                  <th className={`${th} text-right`}>queda máx (curva diária)</th>
                  <th className={`${th} text-right`}>Sharpe</th>
                  <th className="py-1 font-normal text-right">sem as 5 melhores: inteira · fora</th>
                </tr>
              </thead>
              <tbody>
                <tr className={linhaTabela}>
                  <td className="py-1 pr-3 font-semibold">Fundo</td>
                  {f.linhas.map((l) => (
                    <td key={l.janela} className={`py-1 pr-3 text-right font-semibold ${tom(l.retorno)}`}>
                      {pct(l.retorno)}
                    </td>
                  ))}
                  <td className="py-1 pr-3 text-right">{pct(f.linhas[0].quedaMaxima)}</td>
                  <td className="py-1 pr-3 text-right">{num(f.linhas[0].sharpe)}</td>
                  <td className="py-1 text-right">
                    <span className={tom(f.semAs5[0])}>{pct(f.semAs5[0])}</span> · <span className={tom(f.semAs5[2])}>{pct(f.semAs5[2])}</span>
                  </td>
                </tr>
                {[momento, fluxo].map((m) =>
                  m ? (
                    <tr key={m.id} className={linhaTabela}>
                      <td className="py-1 pr-3">{nome(m.id)}</td>
                      {m.linhas.map((l) => (
                        <td key={l.janela} className={`py-1 pr-3 text-right ${tom(l.retorno)}`}>
                          {pct(l.retorno)}
                        </td>
                      ))}
                      <td className="py-1 pr-3 text-right">{pct(ficha(m.id)?.ficha.quedaMaxima ?? NaN)}</td>
                      <td className="py-1 pr-3 text-right">{num(m.linhas[0].sharpe)}</td>
                      <td className="py-1 text-right">
                        {m.semAs5 ? (
                          <>
                            <span className={tom(m.semAs5.retornos[0])}>{pct(m.semAs5.retornos[0])}</span> ·{" "}
                            <span className={tom(m.semAs5.retornos[2])}>{pct(m.semAs5.retornos[2])}</span>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ) : null,
                )}
              </tbody>
            </table>
          </div>
          <p className={nota}>
            <strong>O que o fundo é.</strong> Sharpe {num(fichaFundo.ficha.sharpe)} contra {num(fichaMomento.ficha.sharpe)} do
            Momento e {num(fichaFluxo.ficha.sharpe)} do Fluxo, com a queda máxima em {pct(fichaFundo.ficha.quedaMaxima)} contra{" "}
            {pct(fichaMomento.ficha.quedaMaxima)} do Momento, {fichaFundo.ficha.maiorTempoSubmerso} dias abaixo do pico contra{" "}
            {fichaMomento.ficha.maiorTempoSubmerso}
            {ganhaNasMetades ? ", e com Sharpe maior que o dos dois livros dentro e fora da amostra" : ""}. Nos{" "}
            {estresse.length} piores dias do BTC na janela ele fechou {positivosNoEstresse} no positivo. Sem as cinco moedas que
            mais deram a cada livro sobram {pct(f.semAs5[0])}: o Fluxo segura o fundo onde o Momento depende das monstras.{" "}
            {a2 && momento && (
              <>
                <strong>O que ele não é: mais lucro na mesma queda.</strong> Com os dois livros a 2x o tamanho, cada um na sua
                subconta, a queda chega a {pct(a2.linhas[0].quedaMaxima)} — a do Momento — e o fundo faz {pct(a2.linhas[0].retorno)}, contra{" "}
                {pct(momento.linhas[0].retorno)} do Momento sozinho: o caixa recusa {a2.recusadas.toLocaleString("pt-BR")} entradas,
                porque cada par do Fluxo prende margem nas duas metades. É para cair menos, não para render mais.
              </>
            )}{" "}
            {f.transferencias.semCaixa > 0 && (
              <>
                Em {f.transferencias.semCaixa} dos {f.transferencias.rebalanceamentos} rebalanceamentos a subconta que dava
                dinheiro não tinha caixa livre para o acerto inteiro, e o resto ficou para o mês seguinte.
              </>
            )}
          </p>
          {f.tempoReal && (
            <p className={nota}>
              <strong>E em tempo real.</strong> As regras publicadas foram escolhidas olhando 2024–2026 inteiro. Se, a cada
              trimestre desde {data(f.tempoReal.de)}, cada livro tivesse usado a variação da grade com o melhor Sharpe nos 365
              dias anteriores — sem saber o que vinha —, o resultado até 09/2026 seria:{" "}
              {f.tempoReal.linhas
                .filter((l) => l.id !== "fundo publicado")
                .map((l, k, xs) => (
                  <span key={l.id}>
                    {nome(l.id).replace(" (Momento + Fluxo)", "")} {pct(l.retorno)} (Sharpe {num(l.sharpe)}, queda {pct(l.quedaMaxima)})
                    {k < xs.length - 1 ? ", " : ""}
                  </span>
                ))}
              {(() => {
                const pub = f.tempoReal.linhas.find((l) => l.id === "fundo publicado");
                return pub ? (
                  <>
                    , contra {pct(pub.retorno)} (Sharpe {num(pub.sharpe)}) do fundo publicado nos mesmos dias. A diferença é o
                    que a medição ganha por ter escolhido depois de ver tudo
                  </>
                ) : null;
              })()}
              . É esse o número de quem liga hoje sem saber quais regras serão as melhores daqui para a frente.
            </p>
          )}
          <details className="mt-2">
            <summary className="cursor-pointer text-xs text-black/55 dark:text-white/55">O fundo mês a mês</summary>
            <MesesDoFundo meses={fichaFundo.meses} />
          </details>
        </>
      )}

      <h4 className="text-sm font-semibold mt-6">A ficha de risco</h4>
      {/* Aspas literais, e não `&ldquo;`: com a entidade no mesmo texto, o
          compilador comia o espaço logo depois do número ("20dias"), visto no
          HTML servido em 10/10. */}
      <p className="text-xs text-black/60 dark:text-white/60 mt-1">
        Janela inteira, sobre a curva de um ponto por dia (a queda dentro do dia não aparece aqui; a da tabela de cima é a
        de hora em hora). Entre colchetes, o intervalo de 95% do bootstrap estacionário:{" "}
        {(fichaFundo?.intervalo?.amostras ?? 0).toLocaleString("pt-BR")} séries sorteadas em blocos de{" "}
        {fichaFundo?.intervalo?.blocoMedio ?? 20} dias em média, que guardam as sequências de alta e de queda. É a resposta
        para “e se 2024–2026 tivesse vindo em outra ordem?”.
      </p>
      <TabelaFicha fichas={quant.fichas} />
      <TabelaTrades fichas={quant.fichas} />
      {fichaMomento?.intervalo && (
        <p className={nota}>
          <strong>Como ler.</strong> O Sharpe do Momento pode ser qualquer coisa entre {num(fichaMomento.intervalo.sharpe[0])} e{" "}
          {num(fichaMomento.intervalo.sharpe[2])} só pela ordem dos dias, e a queda máxima de {pct(fichaMomento.ficha.quedaMaxima)}{" "}
          vira {pct(fichaMomento.intervalo.queda[0])} numa ordem ruim: é esse número, e não o medido, que decide o tamanho de
          uma conta de verdade. Ele ganha em menos da metade dos trades ({fr(fichaMomento.trades?.positivos ?? NaN, 0)}) e
          ganha mais do que perde em cada um — seguidor de tendência —, e anda CONTRA o BTC (beta {num(fichaMomento.ficha.beta ?? NaN)}):
          a vendida paga nos dias de pânico.
          {fichaFundo && (
            <>
              {" "}
              Para afirmar com 95% de confiança que o Sharpe é positivo seriam precisos{" "}
              {Math.ceil(fichaMomento.trilhaMinimaDias ?? NaN).toLocaleString("pt-BR")} dias de ao vivo no Momento,{" "}
              {Math.ceil(fichaFluxo?.trilhaMinimaDias ?? NaN).toLocaleString("pt-BR")} no Fluxo e{" "}
              {Math.ceil(fichaFundo.trilhaMinimaDias ?? NaN).toLocaleString("pt-BR")} no fundo — se o Sharpe verdadeiro for o
              medido; se for menor, mais.
            </>
          )}
        </p>
      )}

      {vM && vF && (
        <>
          <h4 className="text-sm font-semibold mt-6">É sorte? O teste de sobreajuste</h4>
          <p className="text-xs text-black/60 dark:text-white/60 mt-1">
            Cada livro foi remedido numa grade das peças que a pesquisa de fato mexeu — o Momento em {vM.variantes} variações
            ({vM.grade}), o Fluxo em {vF.variantes} ({vF.grade}). O <strong>Sharpe deflacionado</strong> é a probabilidade de o
            Sharpe verdadeiro passar do que a melhor de N tentativas SEM vantagem mostraria por acaso — com{" "}
            {quant.tentativasDaPesquisa} tentativas, um Sharpe de {num(dsr300(vM)?.regua ?? NaN)} ao ano. O <strong>PBO</strong> é
            a chance de a variação que foi a melhor no passado ficar abaixo da mediana no futuro (0,5 é sorteio). E o{" "}
            <strong>walk-forward</strong> refaz a escolha a cada trimestre só com o passado.
          </p>
          <TabelaValidacao validacao={quant.validacao} tentativas={quant.tentativasDaPesquisa} />
          <p className={nota}>
            <strong>O que isso diz.</strong> O Momento {veredito(dsr300(vM)?.dsr ?? NaN)} no deflacionado com{" "}
            {quant.tentativasDaPesquisa} tentativas ({fr(dsr300(vM)?.dsr ?? NaN, 0)}), e o PBO de {num(vM.pbo.pbo)} diz que
            escolher pelo passado ajuda — mas a publicada é a {vM.posicaoDaPublicada}ª de {vM.variantes}, e escolhendo em tempo
            real ele faria {pct(wf(vM)?.retorno ?? NaN)} contra {pct(wf(vM)?.retornoPublicada ?? NaN)} da publicada nos mesmos
            dias — quase o mesmo que a variação do meio da grade nos mesmos dias ({pct(wf(vM)?.retornoMediana ?? NaN)}).{" "}
            {`O +${Math.round((momento?.linhas[0].retorno ?? 0) * 100).toLocaleString("pt-BR")}% da medição`} é o teto de quem
            escolheu depois de ver; o esperável é o de quem escolhe sem saber, e as {vM.variantes} variações são positivas (a
            pior com Sharpe {num(vM.sharpes[0])}). O Fluxo {veredito(dsr300(vF)?.dsr ?? NaN)} ({fr(dsr300(vF)?.dsr ?? NaN, 0)}):
            o Sharpe {num(vF.sharpePublicada)} dele é o que a melhor de ~{quant.tentativasDaPesquisa} ideias sem vantagem já
            mostraria, e o PBO de {num(vF.pbo.pbo)} fica entre o do Momento e o sorteio. A família inteira é positiva (o pior
            Sharpe da grade é {num(vF.sharpes[0])}) e escolhendo em tempo real ele faria {pct(wf(vF)?.retorno ?? NaN)} — mas a
            vantagem dele ainda não está demonstrada; o ao vivo é que vai dizer. Por isso o fundo, e não um livro só: no
            fundo, a parte do Fluxo dilui o risco do Momento mesmo que a vantagem dele seja menor do que a medida.
          </p>
        </>
      )}

      {capM && capF && (
        <>
          <h4 className="text-sm font-semibold mt-6">Quanto dinheiro cabe</h4>
          <p className="text-xs text-black/60 dark:text-white/60 mt-1">
            O mesmo livro começando com mais dinheiro, com o impacto de mercado pela lei da raiz quadrada — quem compra Q
            dólares de uma moeda que negocia V por dia paga perto de σ × √(Q/V), com σ o desvio diário dela — e as regras da
            Binance, que com posição grande baixam a alavancagem máxima e põem teto no tamanho de cada moeda.
          </p>
          <TabelaCapacidade quant={quant} />
          <p className={nota}>
            <strong>A capacidade é pequena.</strong> Com {capital(1e6)} o Momento já paga{" "}
            {fr(emCapital(capM, 1e6)?.impacto ?? NaN, 2)} por lado de impacto e o Sharpe cai a {num(emCapital(capM, 1e6)?.sharpe ?? NaN)};
            com {capital(2e7)}, a {num(emCapital(capM, 2e7)?.sharpe ?? NaN)}; com {capital(1e8)} perde dinheiro (
            {pct(emCapital(capM, 1e8)?.retorno ?? NaN)}). O Fluxo aguenta menos ainda: {num(emCapital(capF, 5e6)?.sharpe ?? NaN)} de
            Sharpe com {capital(5e6)}. As monstras que fazem o lucro são moedas de dezenas de milhões por dia, e quem entra
            nelas com milhões move o preço contra si.
            {capM05 && (
              <>
                {" "}
                Com metade do impacto (Y = 0,5, o otimista da literatura), o Momento com {capital(5e6)} faz{" "}
                {pct(emCapital(capM05, 5e6)?.retorno ?? NaN)} e Sharpe {num(emCapital(capM05, 5e6)?.sharpe ?? NaN)}.
              </>
            )}{" "}
            Com os US$ 1.000 da arena o impacto é de {fr(emCapital(capM, 1e3)?.impacto ?? NaN, 2)} por lado, menos do que a régua
            de custo já cobra a mais — num retrato do livro de ofertas de 08/10, ela cobrava de 3 a 7 vezes o que uma ordem
            destas custaria.
          </p>
        </>
      )}

      {estresse.length > 0 && (
        <>
          <h4 className="text-sm font-semibold mt-6">Os piores dias do BTC</h4>
          <div className="overflow-x-auto mt-2">
            <table className="w-full text-xs tabular-nums">
              <thead className="text-black/40 dark:text-white/40">
                <tr className="text-left">
                  <th className={th}>dia</th>
                  {["btc", "momento", "fluxo", "fundo", "caca-monstra"].map((id) => (
                    <th key={id} className={`${th} text-right`}>
                      {CURTO[id]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {estresse.map((x) => (
                  <tr key={x.dia} className={linhaTabela}>
                    <td className="py-1 pr-3">{data(x.dia)}</td>
                    {["btc", "momento", "fluxo", "fundo", "caca-monstra"].map((id) => (
                      <td key={id} className={`py-1 pr-3 text-right ${tom(x.retornos[id] ?? 0)}`}>
                        {pct(x.retornos[id] ?? NaN, 1)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={nota}>
            A vendida do Momento e o par do Fluxo pagam no pânico; o Caça-monstra, só comprado, cai junto. Correlação diária com
            o BTC: Momento {num(corr("momento", "btc"))}, Fluxo {num(corr("fluxo", "btc"))}, fundo {num(corr("fundo", "btc"))},
            Caça-monstra {num(corr("caca-monstra", "btc"))}.
          </p>
        </>
      )}
      <p className={nota}>
        Medição de {new Date(medicao.geradoEm).toISOString().slice(0, 10)}, com as funções de <code className="text-[11px]">lib/quant.ts</code>:{" "}
        <code className="text-[11px]">npm run medir-robos</code>. Nada disto é recomendação: é a régua que um fundo usaria, e
        ela diz o que a medição sustenta e o que ainda não.
      </p>
    </div>
  );
}
