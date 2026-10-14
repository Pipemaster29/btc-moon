"use client";

/**
 * A aba "Ao vivo" dos robôs: quanto cada um tem agora, a curva desde que
 * começaram e o que cada um segura.
 *
 * AS POSIÇÕES SOBEM PARA PERTO DOS CARTÕES. Na página única elas moravam no fim
 * do painel, depois da medição inteira e da mesa de risco — a pergunta "o que o
 * robô comprou?" era a mais frequente e a que ficava mais longe. Aqui ela é a
 * segunda coisa da tela, com um robô de cada vez.
 *
 * As duas idades continuam na tela: a marcação é de agora (o preço vem do
 * WebSocket da Binance, como o da carteira), as ENTRADAS e SAÍDAS são do último
 * retrato. E cada cartão traz a faixa medida para a idade do robô — o teste
 * de vida real, que é o único limpo, porque as regras foram escolhidas olhando
 * o mesmo período da medição.
 */

import { useState } from "react";
import Link from "next/link";
import { CAPITAL_ROBO, DIA, escalaDoTamanho, margemTotal, type ArquivoRobos, type EstadoRobo } from "@/lib/robos";
import { faixaDeRetornos } from "@/lib/quant";
import CurvaRobos, { CORES_ROBOS, type Ponto, type SerieRobo } from "./CurvaRobos";
import { CURTO, MOTIVO, corDe, dataHora, fracao, pct, tom, usd } from "./robosFormato";
import { marcada, useRobosMarcados } from "./robosVivo";

function Posicoes({ e, vivo }: { e: EstadoRobo; vivo: Record<string, { preco: number }> }) {
  const linhas = e.abertas
    .map((p) => ({ p, ...marcada(p, vivo) }))
    // No par, o valor soma as duas metades: o resultado desconta as duas margens.
    .map((x) => ({ ...x, resultado: x.valor - margemTotal(x.p) }))
    .sort((a, b) => b.resultado - a.resultado);
  if (linhas.length === 0) return <p className="text-xs text-black/45 dark:text-white/45">Nenhuma posição aberta.</p>;
  // A coluna só aparece no robô que tem pirâmide em alguma posição: no
  // Caça-monstra seria uma coluna inteira de traços.
  const comPiramide = e.abertas.some((p) => p.piramide !== undefined || (p.parcelas ?? 1) > 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[44rem] whitespace-nowrap text-xs tabular-nums">
        <thead className="text-black/40 dark:text-white/40">
          <tr className="text-left">
            <th className="py-1 pr-3 font-normal">moeda</th>
            <th className="py-1 pr-3 font-normal">lado</th>
            <th className="py-1 pr-3 font-normal text-right">entrada</th>
            <th className="py-1 pr-3 font-normal text-right">agora</th>
            <th className="py-1 pr-3 font-normal text-right">resultado</th>
            <th className="py-1 pr-3 font-normal text-right">stop</th>
            {comPiramide && <th className="py-1 pr-3 font-normal text-right">2ª parcela</th>}
            <th className="py-1 font-normal text-right">desde</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map(({ p, preco, resultado }) => {
            const nivel = p.rastro === null ? p.stop : p.lado === "long" ? Math.max(p.stop, p.melhor * (1 - p.rastro)) : Math.min(p.stop, p.melhor * (1 + p.rastro));
            const gatilho = p.piramide?.precos[0];
            return (
              <tr key={p.symbol} className="border-t border-black/5 dark:border-white/5">
                <td className="py-1 pr-3">
                  {p.symbol.replace(/USDT$/, "")}
                  {p.manipulada && (
                    <span className="ml-1.5 rounded border border-black/15 dark:border-white/20 px-1 text-[10px] text-black/55 dark:text-white/55" title="Está no painel de manipuladas (lista ou em vista)">
                      manipulada
                    </span>
                  )}
                </td>
                <td className="py-1 pr-3">
                  {p.lado === "long" ? "comprado" : "vendido"}
                  {p.hedge && (
                    <span
                      className="text-black/45 dark:text-white/45"
                      title={`Par: ${p.hedge.lado === "long" ? "comprado" : "vendido"} em ${p.hedge.symbol.replace(/USDT$/, "")} do mesmo nocional, desde ${p.hedge.precoEntrada.toPrecision(5)}${p.hedge.liquidadaEm !== undefined ? " — o hedge foi liquidado" : ""}`}
                    >
                      {" "}+ {p.hedge.symbol.replace(/USDT$/, "")}
                      {p.hedge.liquidadaEm !== undefined && " (liquidado)"}
                    </span>
                  )}
                </td>
                <td className="py-1 pr-3 text-right">{p.precoEntrada.toPrecision(5)}</td>
                <td className="py-1 pr-3 text-right">{preco.toPrecision(5)}</td>
                <td className={`py-1 pr-3 text-right ${tom(resultado)}`}>
                  {usd(resultado)} <span className="text-black/40 dark:text-white/40">({pct(resultado / margemTotal(p), 0)} da margem)</span>
                </td>
                <td className="py-1 pr-3 text-right text-black/50 dark:text-white/50">
                  {nivel.toPrecision(4)}
                  {nivel !== p.stop && <span title="O rastro já subiu a ordem de stop"> ↑</span>}
                </td>
                {comPiramide && (
                  <td className="py-1 pr-3 text-right text-black/50 dark:text-white/50">
                    {(p.parcelas ?? 1) > 1 ? (
                      <span title="A segunda parcela entrou: preço médio refeito, e o stop subiu para dentro da nova liquidação">entrou</span>
                    ) : gatilho !== undefined ? (
                      <span title="A posição ganha uma segunda parcela do mesmo tamanho se o preço chegar aqui (+40% da entrada)">em {gatilho.toPrecision(4)}</span>
                    ) : (
                      "—"
                    )}
                  </td>
                )}
                <td className="py-1 text-right text-black/50 dark:text-white/50">{dataHora(p.abertaEm)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Encerradas({ e }: { e: EstadoRobo }) {
  if (e.fechadas.length === 0) return <p className="text-xs text-black/45 dark:text-white/45">Nenhuma posição encerrada ainda.</p>;
  return (
    <ul className="text-xs tabular-nums text-black/60 dark:text-white/60">
      {e.fechadas.slice(0, 10).map((t) => (
        <li key={`${t.symbol}-${t.abertaEm}`} className="py-0.5">
          {dataHora(t.fechadaEm)} · {t.symbol.replace(/USDT$/, "")} {t.lado === "long" ? "comprado" : "vendido"}
          {t.hedge && <> + {t.hedge.symbol.replace(/USDT$/, "")} ({usd(t.hedge.resultado)} no hedge{t.hedge.liquidada ? ", liquidado" : ""})</>} ·{" "}
          {MOTIVO[t.motivo] ?? t.motivo} · <span className={tom(t.resultado)}>{usd(t.resultado)}</span>
          {t.funding !== 0 && <> · financiamento {usd(-t.funding)}</>} · {((t.fechadaEm - t.abertaEm) / DIA).toFixed(1)} d
          {(t.parcelas ?? 1) > 1 && <> · {t.parcelas} parcelas</>}
          {t.manipulada && " · manipulada"}
        </li>
      ))}
    </ul>
  );
}

export default function RobosAoVivo({
  arquivo,
  medidas,
  carteira,
}: {
  arquivo: ArquivoRobos | null;
  /** A curva medida de cada robô (01/2024–09/2026): é dela que sai a faixa de cada cartão. */
  medidas: { id: string; curva: Ponto[] }[];
  /** A curva da carteira do painel, para entrar como contexto no ao vivo. */
  carteira?: Ponto[];
}) {
  const { vivo, robos, marcados } = useRobosMarcados(arquivo);
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const inicio = robos.length > 0 ? Math.min(...robos.map((e) => e.comecouEm)) : null;

  const series: SerieRobo[] = marcados.map(({ e, patrimonio }) => ({
    id: e.id,
    rotulo: e.nome,
    curto: CURTO[e.id] ?? e.nome,
    cor: corDe(e.id),
    pontos: vivo.em === null ? e.curva : [...e.curva, { t: Math.max(vivo.em, e.atualizadoEm), patrimonio }],
  }));
  if (carteira && inicio !== null) {
    const desde = carteira.filter((p) => p.t >= inicio);
    // Rebaseada a US$ 1.000 no começo dos robôs: as duas contas largam juntas.
    if (desde.length >= 2) {
      const base = desde[0].patrimonio;
      series.push({
        id: "carteira",
        rotulo: "Carteira do painel (rebaseada)",
        curto: "Painel",
        cor: "var(--robo-ctx)",
        contexto: true,
        pontos: desde.map((p) => ({ t: p.t, patrimonio: (p.patrimonio / base) * CAPITAL_ROBO })),
      });
    }
  }

  if (robos.length === 0) {
    return (
      <p className="text-sm text-black/45 dark:text-white/45">
        Os robôs ainda não rodaram — o primeiro retrato do workflow depois do deploy abre as primeiras posições.
      </p>
    );
  }
  const atual = robos.find((e) => e.id === escolhido) ?? robos[0];

  return (
    // As cores dos robôs são variáveis de CSS (`CORES_ROBOS`), e precisam valer
    // na aba inteira: a bolinha de cada cartão e de cada seletor é a mesma cor
    // da linha dele no gráfico.
    <div className={`flex flex-col gap-6 ${CORES_ROBOS}`}>
      <p className="text-xs text-black/45 dark:text-white/45 tabular-nums">
        {inicio !== null && <>desde {dataHora(inicio)} UTC · </>}
        {vivo.estado === "ao vivo" ? (
          <span className="text-[#0a7d43] dark:text-[#0ECB81]">marcados ao vivo, decisões do último retrato</span>
        ) : vivo.estado === "sem resposta" ? (
          <span className="text-[#8a5a00] dark:text-[#F0B90B]">⚠ sem cotação ao vivo, marcados no retrato</span>
        ) : (
          "marcados no retrato"
        )}
      </p>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {marcados.map(({ e, patrimonio }) => {
          const ret = patrimonio / CAPITAL_ROBO - 1;
          const compradas = e.abertas.filter((p) => p.lado === "long").length;
          const manip = e.abertas.filter((p) => p.manipulada).length;
          const acertos = e.fechadas.filter((t) => t.resultado > 0).length;
          // A idade em dias inteiros, até a marcação de agora.
          const dias = Math.floor((Math.max(vivo.em ?? 0, e.atualizadoEm) - e.comecouEm) / DIA);
          const medido = medidas.find((m) => m.id === e.id);
          const faixa = medido ? faixaDeRetornos(medido.curva, dias) : null;
          return (
            // O número em cima e a descrição embaixo: com ela em cima, o
            // patrimônio de cada cartão caía numa altura diferente, conforme o
            // tamanho da descrição, e os cartões não se liam lado a lado.
            <div key={e.id} className="flex flex-col rounded-xl border border-black/10 dark:border-white/10 bg-white/60 dark:bg-white/[0.03] p-4">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-semibold flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: corDe(e.id) }} aria-hidden />
                  {e.nome}
                </p>
                <p className={`text-sm font-medium tabular-nums ${tom(ret)}`}>{pct(ret)}</p>
              </div>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{usd(patrimonio)}</p>
              <p className="text-xs text-black/50 dark:text-white/50 mt-2 tabular-nums">
                queda máx {pct(e.quedaMaxima)} · {compradas} comprada{compradas === 1 ? "" : "s"},{" "}
                {e.abertas.length - compradas} vendida{e.abertas.length - compradas === 1 ? "" : "s"}
                {manip > 0 && <> · {manip} em manipulada{manip === 1 ? "" : "s"}</>}
              </p>
              {e.regras.alvoVolatilidade && (
                <p className="text-xs text-black/50 dark:text-white/50 tabular-nums" title="O tamanho base vezes o multiplicador do alvo de volatilidade, que lê os últimos dias do patrimônio">
                  aposta de hoje: {fracao(e.regras.tamanho * escalaDoTamanho(e, e.atualizadoEm))} por posição
                  {e.atualizadoEm - e.comecouEm < e.regras.alvoVolatilidade.janelaDias * DIA && (
                    <> · o alvo de volatilidade liga com {e.regras.alvoVolatilidade.janelaDias} dias de curva</>
                  )}
                </p>
              )}
              <p className="text-xs text-black/50 dark:text-white/50 tabular-nums">
                {e.fechadas.length} encerrada{e.fechadas.length === 1 ? "" : "s"}
                {e.fechadas.length > 0 && <> · {acertos} no positivo</>}
                {e.diasPerdidos > 0 && <> · {e.diasPerdidos} dia(s) sem retrato</>}
              </p>
              {faixa ? (
                <p
                  className="text-xs text-black/60 dark:text-white/60 tabular-nums mt-2 border-t border-black/5 dark:border-white/10 pt-2"
                  title={`Em ${faixa.janelas.toLocaleString("pt-BR")} janelas de ${dias} dia(s) da medição (01/2024–09/2026), oito em cada dez terminaram entre estes dois números. Ao vivo fora da faixa por meses é a medição falhando na vida real.`}
                >
                  medido em {dias} dia{dias === 1 ? "" : "s"}: {pct(faixa.p10)} a {pct(faixa.p90)} (8 em 10) · ao vivo{" "}
                  <strong className="font-medium">{ret < faixa.p10 ? "abaixo da faixa" : ret > faixa.p90 ? "acima da faixa" : "dentro da faixa"}</strong>
                </p>
              ) : (
                medido && <p className="text-xs text-black/40 dark:text-white/40 mt-2">a faixa medida aparece com um dia inteiro ao vivo</p>
              )}
              <p className="text-xs text-black/45 dark:text-white/45 mt-auto pt-3">{e.descricao}</p>
            </div>
          );
        })}
      </div>

      <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-semibold text-lg">Posições</h2>
          {/* Um robô de cada vez: quatro tabelas empilhadas eram a parte mais
              comprida da página, e quase sempre se quer ver uma. */}
          <div role="tablist" aria-label="Robô" className="inline-flex flex-wrap gap-1 rounded-lg bg-black/5 dark:bg-white/10 p-1">
            {robos.map((e) => {
              const ativo = e.id === atual.id;
              return (
                <button
                  key={e.id}
                  type="button"
                  role="tab"
                  aria-selected={ativo}
                  onClick={() => setEscolhido(e.id)}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs transition-colors ${
                    ativo
                      ? "bg-white dark:bg-black text-black dark:text-white shadow-sm font-medium"
                      : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
                  }`}
                >
                  <span className="inline-block h-2 w-2 rounded-full" style={{ background: corDe(e.id) }} aria-hidden />
                  {CURTO[e.id] ?? e.nome}
                  <span className="tabular-nums text-black/40 dark:text-white/40">{e.abertas.length}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-3" role="tabpanel">
          <Posicoes e={atual} vivo={vivo.moedas} />
        </div>
        <h3 className="text-sm font-semibold mt-5">Últimas encerradas</h3>
        <div className="mt-1.5">
          <Encerradas e={atual} />
        </div>
      </section>

      {/* Com poucas horas a curva ao vivo é uma reta de centavos em volta de mil
          dólares; a partir de doze horas ela começa a ter o que mostrar. */}
      {series.some((s) => s.pontos.length >= 2 && s.pontos[s.pontos.length - 1].t - s.pontos[0].t >= 12 * 3_600_000) && (
        <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
          <CurvaRobos series={series} capital={CAPITAL_ROBO} titulo="Ao vivo · patrimônio de cada robô" />
        </section>
      )}

      <p className="text-xs text-black/50 dark:text-white/50">
        Poucos dias não dizem nada sozinhos: na medição, 45% das janelas de 5 dias e 30% das de 30 dias do Momento terminam
        no prejuízo, e só uma em quatro compras dá lucro — o lucro vem das poucas que viram monstras. Como cada robô teria
        ido desde 01/2024 está na <Link href="/robos/medicao" className="underline">Medição</Link>; o que um fundo
        perguntaria antes de pôr dinheiro, na <Link href="/robos/mesa" className="underline">Mesa de risco</Link>.
      </p>
    </div>
  );
}
