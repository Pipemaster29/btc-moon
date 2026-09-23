/**
 * O que entrou e saiu da carteira quente da Binance, por moeda, nos últimos dias.
 *
 * É a única pista de "smart money" on-chain deste projeto que ainda não foi
 * medida — e não foi porque o dado só existe para frente: o nó gratuito guarda
 * ~100 horas, e o gravador começou em 19/09. Então este painel é DESCRIÇÃO, e
 * diz isso: embaixo dele vem a contagem dos quatro testes pré-registrados,
 * andando até a amostra mínima.
 *
 * DUAS COLUNAS PORQUE SÃO DUAS PORTAS, e elas dizem coisas opostas. Compra de
 * varejo na DEX passa pelo executor de swap e ENTRA na custódia quando alguém
 * compra; depósito entra direto e costuma ser para vender. Somadas, a TAKE de
 * 23/09 parecia holder correndo para a corretora — era cliente comprando no meio
 * do pump (ver `scripts/fluxo-binance.mts`).
 *
 * BARRAS EM TINTA NEUTRA, e não no par azul ↔ vermelho do painel de sinais.
 * Aqui não há lado certo: "entrou" e "saiu" são direções, não acerto e erro, e o
 * mesmo azul querendo dizer "acertou" dois painéis acima e "entrou" aqui faria a
 * cor mentir. A direção é da posição: à direita do zero entrou na quente, à
 * esquerda saiu. O tique a ±1% é o limiar escolhido ANTES de haver dado.
 */

import type { FluxoResumo } from "@/lib/fluxo";
import type { Sinais } from "@/lib/sinais";

const LIMIAR = 0.01;

function mi(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1e9) return `${s}US$ ${(a / 1e9).toFixed(1).replace(".", ",")} bi`;
  if (a >= 1e6) return `${s}US$ ${(a / 1e6).toFixed(1).replace(".", ",")} mi`;
  return `${s}US$ ${(a / 1e3).toFixed(0)} mil`;
}

function pctSinal(v: number | null): string {
  if (v === null || !Number.isFinite(v)) return "—";
  const txt = Math.abs(v * 100).toFixed(1).replace(".", ",");
  // Sem sinal no que arredonda para zero: "−0,0%" sugere uma direção que o
  // número não tem.
  if (txt === "0,0") return "0,0%";
  return `${v >= 0 ? "+" : "−"}${txt}%`;
}

function Barra({ v, max }: { v: number | null; max: number }) {
  if (v === null || !Number.isFinite(v)) {
    return <div className="h-3 w-full min-w-24" />;
  }
  const f = Math.min(1, Math.abs(v) / max);
  const tique = (LIMIAR / max) * 50;
  return (
    <div className="relative h-3 w-full min-w-24">
      {/* O limiar pré-registrado, dos dois lados. */}
      {tique < 50 && (
        <>
          <div
            className="absolute inset-y-0 w-px bg-black/15 dark:bg-white/15"
            style={{ left: `${50 + tique}%` }}
          />
          <div
            className="absolute inset-y-0 w-px bg-black/15 dark:bg-white/15"
            style={{ left: `${50 - tique}%` }}
          />
        </>
      )}
      <div className="absolute inset-y-0 left-1/2 w-px bg-black/30 dark:bg-white/30" />
      <div
        className={`absolute top-0.5 bottom-0.5 bg-black/45 dark:bg-white/50 ${
          v >= 0 ? "left-1/2 rounded-r" : "right-1/2 rounded-l"
        }`}
        style={{ width: `${f * 50}%` }}
      />
      {Math.abs(v) > max && (
        <span
          className={`absolute -top-0.5 text-[9px] text-black/50 dark:text-white/50 ${v >= 0 ? "right-0" : "left-0"}`}
          aria-hidden
        >
          {v >= 0 ? "▸" : "◂"}
        </span>
      )}
    </div>
  );
}

export default function FluxoPanel({ f, s }: { f: FluxoResumo; s: Sinais | null }) {
  const lidos = f.dias.filter((d) => d.cobertura >= 0.9 && d.falhas === 0 && !d.lacuna).length;
  const linhas = f.moedas
    .filter((m) => m.mcap && m.mcap > 0)
    .slice(0, 15)
    .map((m) => ({ ...m, dexF: m.dex / m.mcap!, depF: m.dep / m.mcap! }));

  // Escala comum às duas colunas (é a mesma unidade), com teto de 20%: uma moeda
  // a 60% esmagaria todas as outras num traço. O que passa do teto ganha seta.
  let max = 0.02;
  for (const l of linhas) max = Math.max(max, Math.abs(l.dexF), Math.abs(l.depF));
  max = Math.min(max, 0.2);

  const dataCurta = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;

  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-lg">O que entrou e saiu da Binance</h2>
        <span className="text-xs text-black/40 dark:text-white/40 tabular-nums">
          carteira quente na BNB Chain · últimos {f.dias.length} dias · resumo de{" "}
          {new Date(f.geradoEm).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "UTC",
          })}{" "}
          UTC
        </span>
      </div>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1 max-w-3xl">
        Líquido de cada moeda com perpétuo, em fração do market cap, pelas duas portas da carteira
        quente: <strong>varejo na DEX</strong> é cliente da Binance comprando (à direita) ou vendendo
        (à esquerda) pelo executor de swap; <strong>depósito direto</strong> é o fluxo clássico de
        corretora — à direita entrou mais do que saiu, e depositar costuma ser para vender.
      </p>

      {/* A cobertura de cada dia, antes dos números: soma de dia lido pela
          metade é soma de menos, e quem lê precisa saber disso antes. */}
      <div className="flex flex-wrap items-end gap-3 mt-3 text-[11px] text-black/50 dark:text-white/50 tabular-nums">
        {f.dias.map((d) => (
          <div
            key={d.d}
            className="flex flex-col items-center gap-1"
            title={
              d.falhas > 0
                ? `${d.falhas} faixa(s) de blocos não lida(s)`
                : d.lacuna
                  ? "lacuna gravada: o gravador ficou mais de 12 h sem rodar"
                  : `${Math.round(d.cobertura * 100)}% do dia lido`
            }
          >
            <div className="h-1.5 w-9 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full bg-black/45 dark:bg-white/50"
                style={{ width: `${Math.round(d.cobertura * 100)}%` }}
              />
            </div>
            <span>
              {dataCurta(d.d)}
              {(d.falhas > 0 || d.lacuna) && " ⚠"}
            </span>
          </div>
        ))}
        <span className="text-black/40 dark:text-white/40 pb-0.5">
          {lidos} de {f.dias.length} dias lidos inteiros e sem falha
          {f.sentinela &&
            (f.sentinela.conhecido
              ? ` · ${Math.round(f.sentinela.fracao * 100)}% das transferências da última janela pelo executor conhecido`
              : "")}
        </span>
      </div>
      {f.sentinela && !f.sentinela.conhecido && (
        <p className="text-xs text-[#C42B3E] dark:text-[#F6465D] mt-2">
          ⚠ A contraparte dominante da última janela NÃO é o executor de swap conhecido. Se a Binance
          trocou de executor, a compra de varejo está caindo na coluna de depósito e as duas colunas
          mudaram de significado.
        </p>
      )}

      {linhas.length === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50 mt-4">
          Nenhuma moeda com perpétuo e market cap nos dias lidos.
        </p>
      ) : (
        // `relative` pelo mesmo motivo do painel de sinais: o `sr-only` do
        // cabeçalho é absoluto e escapava do corte, rolando a página inteira.
        <div className="relative overflow-x-auto mt-3">
          <table className="w-full text-xs tabular-nums min-w-[44rem]">
            <thead className="text-black/45 dark:text-white/45">
              <tr className="text-left">
                <th className="font-normal py-1.5">Moeda</th>
                <th className="font-normal py-1.5 text-right">Varejo na DEX</th>
                <th className="font-normal py-1.5 px-3 w-[22%]">
                  <span className="sr-only">barra do varejo</span>
                </th>
                <th className="font-normal py-1.5 text-right">Depósito direto</th>
                <th className="font-normal py-1.5 px-3 w-[22%]">
                  <span className="sr-only">barra do depósito</span>
                </th>
                <th className="font-normal py-1.5 text-right">Market cap</th>
                <th
                  className="font-normal py-1.5 text-right"
                  title="Tudo o que passou pelas duas portas, nos dois sentidos: o tamanho do movimento, não a direção"
                >
                  Movimento
                </th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.s} className="border-t border-black/5 dark:border-white/5">
                  <td className="py-1.5 pr-2 font-medium">{l.s.replace(/USDT$/, "")}</td>
                  <td className="py-1.5 text-right" title={mi(l.dex)}>
                    {pctSinal(l.dexF)}
                  </td>
                  <td className="py-1.5 px-3">
                    <Barra v={l.dexF} max={max} />
                  </td>
                  <td className="py-1.5 text-right" title={`${mi(l.dep)} · ${l.depositantes} depósito(s) de carteiras distintas por janela`}>
                    {pctSinal(l.depF)}
                  </td>
                  <td className="py-1.5 px-3">
                    <Barra v={l.depF} max={max} />
                  </td>
                  <td className="py-1.5 text-right text-black/55 dark:text-white/55">{mi(l.mcap!)}</td>
                  <td className="py-1.5 text-right text-black/55 dark:text-white/55">{mi(l.bruto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-black/40 dark:text-white/40 mt-1.5">
            Escala comum às duas colunas, de ±{(max * 100).toFixed(0)}% do market cap; os tiques finos
            marcam ±1%, o limiar pré-registrado. Passe o cursor no número para ver em dólares.
          </p>
        </div>
      )}

      {/* A medição, andando. Os lados foram escolhidos antes de haver dado e
          estão escritos em `scripts/medir-sinais.mts`; até a amostra mínima,
          este painel descreve e não prevê. */}
      {s && (
        <div className="mt-4 border-t border-black/10 dark:border-white/10 pt-3">
          <p className="text-xs text-black/60 dark:text-white/60 max-w-3xl">
            <strong className="text-black/80 dark:text-white/80">Isto prevê alguma coisa?</strong>{" "}
            Ainda não se sabe. Quatro testes foram escritos antes de haver dado, e cada evento só
            conta sete dias depois, quando o retorno à frente existe. O mínimo é{" "}
            {s.fluxo.minimo.eventos} eventos em {s.fluxo.minimo.moedas} moedas. Na última medição
            havia {s.fluxo.diasValidos} dia(s) lido(s) inteiro(s) e sem falha, e o evento de cada um
            só entra na conta quando fizer sete dias.
          </p>
          <div className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2 mt-2 text-xs">
            {s.fluxo.testes.map((t) => {
              const prog = Math.min(1, t.eventos / s.fluxo.minimo.eventos);
              return (
                <div key={t.nome} className="flex items-center gap-2">
                  <div className="h-1.5 w-16 shrink-0 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-black/45 dark:bg-white/50"
                      style={{ width: `${prog * 100}%` }}
                    />
                  </div>
                  <span className="text-black/60 dark:text-white/60">{t.nome}</span>
                  <span className="ml-auto tabular-nums text-black/45 dark:text-white/45 whitespace-nowrap">
                    {t.mediana7 !== null
                      ? `${pctSinal(t.mediana7)} · ${Math.round((t.acerto ?? 0) * 100)}% de acerto`
                      : `${t.eventos}/${s.fluxo.minimo.eventos} eventos · ${t.moedas}/${s.fluxo.minimo.moedas} moedas`}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
