/**
 * A carteira fictícia na tela.
 *
 * Fica no topo do painel, acima das candidatas, porque a ordem importa: quem
 * abre a página deve ver quanto as calls renderam ANTES de ver as calls novas.
 * Um painel que recomenda e esconde o próprio resultado está pedindo confiança
 * que não mediu.
 */

import {
  ALAVANCAGEM,
  CAPITAL_INICIAL,
  ALVO,
  PRAZO_DIAS,
  STOP,
  type Carteira,
} from "@/lib/carteira";

function usd(v: number): string {
  return `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(v: number): string {
  return `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

function tom(v: number): string {
  if (v > 0.0005) return "text-[#0a7d43] dark:text-[#0ECB81]";
  if (v < -0.0005) return "text-[#C42B3E] dark:text-[#F6465D]";
  return "";
}

const MOTIVO_NOTA: Record<string, string> = {
  "painel mudou": "o viés saiu — a carteira segue o painel, então sai com ele",
  stop: `o preço andou ${(STOP * 100).toFixed(0)}% contra`,
  alvo: `o preço andou ${(ALVO * 100).toFixed(0)}% a favor`,
  prazo: `${PRAZO_DIAS} dias — além disso não é mais a mesma call`,
  liquidada:
    `a margem acabou antes do stop — só acontece quando o preço salta de uma vez ` +
    `mais do que ${((1 / ALAVANCAGEM) * 100).toFixed(0)}%`,
};

export default function CarteiraPanel({ c }: { c: Carteira }) {
  const dias = Math.max(0, (c.atualizadoEm - c.comecouEm) / 86_400_000);
  const exposto = c.patrimonio - c.caixa;

  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-lg">Carteira fictícia</h2>
        <span className="text-xs text-black/40 dark:text-white/40 tabular-nums">
          desde {new Date(c.comecouEm).toISOString().slice(0, 10)} · {dias.toFixed(1)} dias
        </span>
      </div>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1">
        {usd(CAPITAL_INICIAL)} de mentira entrando em toda call de compra e venda que o painel
        emite, para a pergunta ficar na tela em vez de ficar no terminal. Perpétuo a{" "}
        <strong>{ALAVANCAGEM}x</strong> — que é o teto em que o stop de {(STOP * 100).toFixed(0)}%
        ainda dispara antes da liquidação —, com financiamento e liquidação cobrados.
      </p>

      <div className="grid gap-4 sm:grid-cols-4 mt-4 text-sm">
        <div>
          <p className="text-black/50 dark:text-white/50">Patrimônio</p>
          <p className={`text-2xl font-semibold tabular-nums ${tom(c.retorno)}`}>
            {usd(c.patrimonio)}
          </p>
          <p className={`text-xs tabular-nums ${tom(c.retorno)}`}>{pct(c.retorno)}</p>
        </div>
        <div>
          <p className="text-black/50 dark:text-white/50">Caixa parado</p>
          <p className="text-2xl font-semibold tabular-nums">{usd(c.caixa)}</p>
          <p className="text-xs text-black/40 dark:text-white/40 tabular-nums">
            {usd(exposto)} exposto
          </p>
        </div>
        <div>
          <p className="text-black/50 dark:text-white/50">Posições abertas</p>
          <p className="text-2xl font-semibold tabular-nums">{c.abertas.length}</p>
        </div>
        <div>
          <p className="text-black/50 dark:text-white/50">Encerradas</p>
          <p className="text-2xl font-semibold tabular-nums">{c.encerradas}</p>
          {c.encerradas > 0 && (
            <p className="text-xs text-black/40 dark:text-white/40 tabular-nums">
              {c.acertos} no positivo ({((c.acertos / c.encerradas) * 100).toFixed(0)}%)
            </p>
          )}
        </div>
      </div>

      {c.abertas.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <p className="text-[10px] tracking-widest text-black/40 dark:text-white/40 uppercase mb-2">
            Abertas
          </p>
          <table className="w-full text-sm tabular-nums min-w-[34rem]">
            <thead className="text-xs text-black/40 dark:text-white/40 text-left">
              <tr>
                <th className="font-normal py-1">Moeda</th>
                <th className="font-normal py-1">Lado</th>
                <th className="font-normal py-1 text-right" title="Força da leitura: decide o tamanho da posição">
                  Força
                </th>
                <th className="font-normal py-1 text-right">Entrada</th>
                <th className="font-normal py-1 text-right">Agora</th>
                <th className="font-normal py-1 text-right" title="Preço em que a corretora fecha a posição à força">
                  Liquida em
                </th>
                <th className="font-normal py-1 text-right">Valor</th>
                <th className="font-normal py-1 text-right">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {c.abertas.map((p) => (
                <tr key={p.symbol} className="border-t border-black/5 dark:border-white/5">
                  <td className="py-1.5 font-medium">{p.symbol}</td>
                  <td className="py-1.5">
                    <span
                      className={
                        p.lado === "long"
                          ? "text-[#0a7d43] dark:text-[#0ECB81]"
                          : "text-[#C42B3E] dark:text-[#F6465D]"
                      }
                    >
                      {p.lado === "long" ? "comprado" : "vendido"}
                    </span>
                  </td>
                  <td className="py-1.5 text-right">{p.forca}/3</td>
                  <td className="py-1.5 text-right">{p.precoEntrada.toPrecision(4)}</td>
                  <td className="py-1.5 text-right">{p.precoAtual.toPrecision(4)}</td>
                  <td className="py-1.5 text-right text-black/40 dark:text-white/40">
                    {p.precoLiquidacao ? p.precoLiquidacao.toPrecision(4) : "—"}
                  </td>
                  <td className="py-1.5 text-right">{usd(p.valor * (1 + p.retorno))}</td>
                  <td className={`py-1.5 text-right ${tom(p.retorno)}`}>{pct(p.retorno)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {c.encerradas > 0 && (
        <>
          <div className="mt-5 overflow-x-auto">
            <p className="text-[10px] tracking-widest text-black/40 dark:text-white/40 uppercase mb-2">
              Últimas encerradas
            </p>
            <table className="w-full text-sm tabular-nums min-w-[34rem]">
              <thead className="text-xs text-black/40 dark:text-white/40 text-left">
                <tr>
                  <th className="font-normal py-1">Moeda</th>
                  <th className="font-normal py-1">Lado</th>
                  <th className="font-normal py-1">Saiu por</th>
                  <th className="font-normal py-1 text-right">Dias</th>
                  <th className="font-normal py-1 text-right" title="Financiamento pago enquanto a posição ficou de pé, em fração da margem">
                    Funding
                  </th>
                  <th className="font-normal py-1 text-right">Resultado</th>
                  <th className="font-normal py-1 text-right">Em dólar</th>
                </tr>
              </thead>
              <tbody>
                {c.fechadas.slice(0, 12).map((f) => (
                  <tr
                    key={`${f.symbol}-${f.fechadaEm}`}
                    className="border-t border-black/5 dark:border-white/5"
                  >
                    <td className="py-1.5 font-medium">{f.symbol}</td>
                    <td className="py-1.5">{f.lado === "long" ? "comprado" : "vendido"}</td>
                    <td className="py-1.5 text-black/50 dark:text-white/50" title={MOTIVO_NOTA[f.motivo]}>
                      {f.motivo}
                    </td>
                    <td className="py-1.5 text-right">{f.dias.toFixed(1)}</td>
                    <td className={`py-1.5 text-right ${tom(-(f.funding ?? 0))}`}>
                      {f.funding ? pct(-f.funding) : "—"}
                    </td>
                    <td className={`py-1.5 text-right ${tom(f.retorno)}`}>{pct(f.retorno)}</td>
                    <td className={`py-1.5 text-right ${tom(f.retorno)}`}>
                      {f.resultado >= 0 ? "+" : "−"}
                      {usd(Math.abs(f.resultado)).replace("US$ ", "")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 mt-5 text-sm">
            <div>
              <p className="text-[10px] tracking-widest text-black/40 dark:text-white/40 uppercase mb-2">
                Por que saiu
              </p>
              {Object.entries(c.porMotivo).map(([motivo, g]) => (
                <div key={motivo} className="flex justify-between gap-3 py-0.5">
                  <span className="text-black/60 dark:text-white/60" title={MOTIVO_NOTA[motivo]}>
                    {motivo} <span className="text-black/35 dark:text-white/35">({g.n})</span>
                  </span>
                  <span className={`tabular-nums ${tom(g.retornoMedio)}`}>
                    {pct(g.retornoMedio)}
                  </span>
                </div>
              ))}
            </div>
            <div>
              <p className="text-[10px] tracking-widest text-black/40 dark:text-white/40 uppercase mb-2">
                Por lado
              </p>
              {Object.entries(c.porLado).map(([lado, g]) => (
                <div key={lado} className="flex justify-between gap-3 py-0.5">
                  <span className="text-black/60 dark:text-white/60">
                    {lado === "long" ? "comprado" : "vendido"}{" "}
                    <span className="text-black/35 dark:text-white/35">
                      ({g.acertos}/{g.n})
                    </span>
                  </span>
                  <span className={`tabular-nums ${tom(g.retornoMedio)}`}>
                    {pct(g.retornoMedio)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <p className="text-xs text-black/40 dark:text-white/40 mt-5 pt-4 border-t border-black/10 dark:border-white/10">
        <strong>O que esta conta não cobra, e cada um empurra o número para cima:</strong>{" "}
        a diferença entre o preço do retrato e o preço em que a ordem sairia de verdade — numa
        moeda que anda 100% num dia, os minutos entre os dois custam; e a profundidade real da
        pool, já que o custo aqui é 0,15% por lado, fixo, e numa pool de dois mil dólares uma
        ordem de sessenta já move mais do que isso. O financiamento passou a ser cobrado com a
        taxa real de cada moeda, e ele não é pequeno: a lista paga de 15% a 20% ao ano.
      </p>
    </section>
  );
}
