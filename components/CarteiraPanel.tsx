"use client";

/**
 * A carteira fictícia na tela, marcada a mercado enquanto a aba está aberta.
 *
 * Fica no topo do painel, acima das candidatas, porque a ordem importa: quem
 * abre a página deve ver quanto as calls renderam ANTES de ver as calls novas.
 * Um painel que recomenda e esconde o próprio resultado está pedindo confiança
 * que não mediu.
 *
 * É COMPONENTE DE CLIENTE PORQUE A MARCAÇÃO NÃO PODE ESPERAR O RETRATO. O
 * `npm run carteira` roda de duas a cinco vezes por dia, e entre uma e outra as
 * posições ficavam congeladas no preço de horas atrás enquanto a tabela logo
 * abaixo já andava. `remarcar` é aritmética pura sobre preços que a rota
 * `/api/vivo` acabou de ler, então ela roda aqui, a cada quinze segundos.
 *
 * O QUE ELA NÃO FAZ AQUI, e a distinção é o ponto: não abre nem fecha posição.
 * Decidir exige o histórico inteiro e as regras de saída, e quem faz isso é o
 * script — inclusive porque só ele tem o caminho de velas que diz ONDE dentro do
 * intervalo a ordem teria executado. Uma posição que já passou do stop aparece
 * passada do stop, marcada e sinalizada, até o retrato seguinte fechá-la com a
 * hora certa.
 */

import {
  ALAVANCAGEM,
  CAPITAL_INICIAL,
  ALVO,
  PRAZO_DIAS,
  STOP,
  remarcar,
  type Carteira,
} from "@/lib/carteira";
import { useVivo } from "./vivo";

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

export default function CarteiraPanel({ c: guardada }: { c: Carteira }) {
  const vivo = useVivo();

  // A MARCAÇÃO É DERIVADA DA CARTEIRA QUE VEIO DO SERVIDOR, a cada render, e
  // nunca guardada em estado. Não há acumulador para sair de sincronia, e cada
  // tique é uma conta inteira sobre a mesma base — que é o que garante que quinze
  // segundos parado e quinze minutos parado deem o mesmo número para o mesmo
  // instante. (Encadear também seria correto, porque `cobrarFunding` avança o
  // relógio da posição; derivar é só menos coisa que pode dar errado.)
  const c =
    vivo.em === null
      ? guardada
      : remarcar(
          guardada,
          new Map(Object.entries(vivo.moedas).map(([t, m]) => [t, m.preco])),
          vivo.em,
          new Map(
            Object.entries(vivo.moedas)
              .filter(([, m]) => m.funding != null)
              .map(([t, m]) => [t, m.funding as number]),
          ),
        );

  const dias = Math.max(0, (c.atualizadoEm - c.comecouEm) / 86_400_000);
  const exposto = c.patrimonio - c.caixa;
  const estourada = c.abertas.some((p) => p.estourada);

  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-lg">Carteira fictícia</h2>
        <span className="text-xs text-black/40 dark:text-white/40 tabular-nums">
          desde {new Date(c.comecouEm).toISOString().slice(0, 10)} · {dias.toFixed(1)} dias
          {/* Duas idades outra vez, e pelo mesmo motivo da tabela acima: a
              MARCAÇÃO é de agora, as ENTRADAS e SAÍDAS são do último retrato.
              Dizer só "ao vivo" faria parecer que a carteira também decide ao
              vivo, e ela não decide — nem deve. */}
          {vivo.estado === "ao vivo" ? (
            <span className="text-[#0a7d43] dark:text-[#0ECB81]">
              {" "}
              · marcada ao vivo, decisões do último retrato
            </span>
          ) : vivo.estado === "sem resposta" ? (
            <span className="text-[#F0B90B]"> · sem cotação ao vivo, marcada no retrato</span>
          ) : null}
        </span>
      </div>

      {estourada && (
        <p className="text-xs text-[#C42B3E] dark:text-[#F6465D] mt-2">
          Posição com a margem zerada na marcação ao vivo. A perda para em −100%
          porque a margem isolada é o teto — a corretora fecharia aqui, e o
          retrato seguinte é que registra a liquidação com a hora certa.
        </p>
      )}
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
          {/* O nocional, e não só a margem. Dizer "US$ 140 exposto" a 3x esconde
              que o que anda com o preço são US$ 420 — a margem é o que se perde,
              o nocional é o que se move. */}
          <p className="text-xs text-black/40 dark:text-white/40 tabular-nums">
            {usd(exposto)} de margem, controlando {usd(exposto * ALAVANCAGEM)}
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

      {/* O LADO DO RISCO, que faltava inteiro. O painel mostrava retorno,
          acertos e motivo de saída — tudo do lado do ganho — e com isso não dava
          para julgar se o tamanho da aposta está certo. Uma carteira que rende
          3% com 2% de queda e outra que rende 3% com 30% não são a mesma
          carteira, e até aqui elas eram indistinguíveis nesta tela. */}
      {/* O RETRATO SALVO PODE SER MAIS NOVO NO TEMPO E MAIS VELHO NO ESQUEMA, e
          essa é uma falha nova do arranjo "GitHub raw primeiro": ele busca o
          arquivo do `main`, que é mais fresco que o disco do build, mas que foi
          gravado pela versão ANTERIOR do código até o workflow rodar de novo.
          Um `&&` escondendo o bloco fazia a seção inteira sumir sem explicação —
          exatamente o silêncio que este projeto trata como o pior modo de falha.
          Então ela aparece dizendo por que está vazia. */}
      {c.quedaMaxima == null ? (
        <p className="text-xs text-black/40 dark:text-white/40 mt-4 border-t border-black/10 dark:border-white/10 pt-4">
          O lado do risco — queda máxima, pico de margem e pico de risco agregado — ainda não
          está neste retrato: ele foi gravado antes de a medição existir. Aparece no próximo
          que o <code className="px-1 rounded bg-black/5 dark:bg-white/10">npm run carteira</code>{" "}
          gerar.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-3 mt-4 text-sm border-t border-black/10 dark:border-white/10 pt-4">
          <div>
            <p className="text-black/50 dark:text-white/50">Queda máxima</p>
            <p className={`text-xl font-semibold tabular-nums ${tom(c.quedaMaxima)}`}>
              {pct(c.quedaMaxima)}
            </p>
            <p className="text-xs text-black/40 dark:text-white/40 tabular-nums">
              do pico de {usd(c.pico ?? CAPITAL_INICIAL)}
            </p>
          </div>
          <div>
            <p className="text-black/50 dark:text-white/50" title="Maior margem comprometida ao mesmo tempo, sobre um teto de 50%">
              Margem no pico
            </p>
            <p className="text-xl font-semibold tabular-nums">
              {((c.maiorExposicao ?? 0) * 100).toFixed(0)}%
            </p>
            <p className="text-xs text-black/40 dark:text-white/40">de um teto de 50%</p>
          </div>
          <div>
            <p
              className="text-black/50 dark:text-white/50"
              title="O que a conta perderia se TODAS as posições abertas naquele instante batessem no stop juntas"
            >
              Risco no pico
            </p>
            <p className="text-xl font-semibold tabular-nums">
              {((c.maiorRiscoAberto ?? 0) * 100).toFixed(0)}%
            </p>
            {/* O número que responde "está conservadora?": se o pico de risco
                nunca chega perto do teto, quem segura o tamanho não é o teto —
                é o risco por call. */}
            <p className="text-xs text-black/40 dark:text-white/40">
              de um teto de 25%
              {(c.maiorRiscoAberto ?? 0) < 0.2 && " · o teto nunca prendeu"}
            </p>
          </div>
        </div>
      )}

      {c.abertas.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <p className="text-[10px] tracking-widest text-black/40 dark:text-white/40 uppercase mb-2">
            Abertas
          </p>
          <table className="w-full text-sm tabular-nums min-w-[40rem]">
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
                <th
                  className="font-normal py-1 text-right"
                  title="Financiamento já pago para carregar esta posição, em fração da margem. Cobrado com a taxa real da moeda e atualizado enquanto a aba está aberta."
                >
                  Funding
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
                  {/* O sinal invertido porque financiamento POSITIVO é dinheiro
                      saindo. Numa vendida com taxa positiva ele entra, e aí
                      aparece verde — que é a verdade e surpreende quem só
                      conhece o lado comprado. */}
                  <td className={`py-1.5 text-right ${tom(-p.funding)}`}>
                    {p.funding ? pct(-p.funding) : "—"}
                  </td>
                  <td className="py-1.5 text-right">{usd(p.valor * (1 + p.retorno))}</td>
                  <td className={`py-1.5 text-right ${tom(p.retorno)}`}>
                    {pct(p.retorno)}
                    {p.estourada && (
                      <span className="ml-1" title="margem zerada na marcação ao vivo">
                        ⚠
                      </span>
                    )}
                  </td>
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
        a diferença entre o preço do retrato e o preço em que a ordem de ENTRADA sairia de
        verdade — numa moeda que anda 100% num dia, os minutos entre os dois custam; e a
        profundidade real da pool, já que o custo aqui é 0,15% por lado, fixo, e numa pool de
        dois mil dólares uma ordem de sessenta já move mais do que isso.{" "}
        <strong>O que ela passou a cobrar:</strong> financiamento com a taxa real de cada
        moeda — a lista paga de 15% a 20% ao ano —, e as saídas por stop, alvo e liquidação
        DENTRO do intervalo entre dois retratos, pelas velas de uma hora da Binance. Ordem
        parada não pisca: se o preço tocou o stop às 3h e voltou antes do retrato das 6h, a
        posição estava fechada às 3h. Nas 16 posições medidas até aqui, todas as 16
        esconderam movimento entre os retratos — a mediana escondeu 2,1 p.p. e a maior, 5,0.
      </p>
    </section>
  );
}
