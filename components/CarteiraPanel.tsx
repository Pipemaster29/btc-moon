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
  EXPOSICAO_MAXIMA,
  REGRAS_ANTERIORES,
  RISCO_TOTAL_MAXIMO,
  remarcar,
  type Carteira,
  type Comparacao,
  type Regras,
} from "@/lib/carteira";
import CurvaCarteira from "./CurvaCarteira";
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

/**
 * O que cada saída quer dizer, com os números DO ARQUIVO.
 *
 * As regras vêm de `c.regras`, gravadas junto com a carteira, e não das
 * constantes do código: a página lê o `carteira.json` do `main`, que pode ter
 * sido calculado por outra versão. O texto "o preço andou 25% contra" ao lado de
 * uma carteira calculada com outro stop descreveria uma regra que não gerou
 * aqueles números. Arquivo sem o campo é do regime anterior, que é o que ele é.
 */
function notas(r: Regras): Record<string, string> {
  const stop = (v: number) => `${(v * 100).toFixed(0)}%`;
  return {
    "painel mudou": "o viés saiu — a carteira segue o painel, então sai com ele",
    stop:
      r.stopComprado === r.stopVendido
        ? `o preço andou ${stop(r.stopComprado)} contra`
        : `o preço andou ${stop(r.stopComprado)} contra o comprado, ou ${stop(r.stopVendido)} contra o vendido`,
    "stop móvel": r.rastro
      ? `depois de andar ${stop(r.rastro.ativa)} a favor, o preço devolveu ${stop(r.rastro.distancia)} do melhor ponto`
      : "o stop que acompanha o ganho",
    "sem reação":
      r.semReacaoDias !== null
        ? `${r.semReacaoDias} dias sem andar a favor — a tese não se confirmou no prazo em que costuma se confirmar`
        : "sem andar a favor no prazo",
    alvo: r.alvo !== null ? `o preço andou ${stop(r.alvo)} a favor` : "alvo",
    prazo: `${r.prazoDias} dias — além disso não é mais a mesma call`,
    liquidada:
      `a margem acabou antes do stop — só acontece quando o preço salta de uma vez ` +
      `mais do que ${((1 / ALAVANCAGEM) * 100).toFixed(0)}%`,
  };
}

/**
 * A curva gravada termina no último retrato; a marcação ao vivo é de agora. O
 * ponto de agora entra na ponta, para a linha terminar no mesmo número que a
 * placa de patrimônio mostra logo acima — duas leituras do mesmo instante que
 * discordam na mesma tela é o que este projeto trata como defeito.
 */
function comAgora(curva: Carteira["curva"], c: Carteira): Carteira["curva"] {
  const ultimo = curva[curva.length - 1];
  if (!ultimo || !(c.atualizadoEm > ultimo.t) || !Number.isFinite(c.patrimonio)) return curva;
  return [...curva, { t: c.atualizadoEm, patrimonio: c.patrimonio }];
}

/**
 * A tabela que decide se uma regra entra, na tela.
 *
 * A frase de cima é CALCULADA, não escrita: "sem a melhor moeda" é a coluna que
 * mais reprova aqui — foi ela que derrubou o stop curto em 23/09, que ganhava nas
 * duas metades e era uma moeda só — e o texto diz "lucro não demonstrado" só
 * enquanto o publicado sem essa moeda estiver no negativo.
 */
function Regimes({ cmp }: { cmp: Comparacao }) {
  const [pub, ant] = cmp.linhas;
  if (!pub) return null;
  const mesmaMoeda = ant && ant.semAMelhor.ticker === pub.semAMelhor.ticker;
  return (
    <>
      <p className="text-xs text-black/55 dark:text-white/55 mt-2 max-w-3xl">
        As duas linhas são o mesmo motor sobre as mesmas calls; muda só a gestão.{" "}
        {mesmaMoeda && ant ? (
          <>
            Sem a <strong>{pub.semAMelhor.ticker}</strong>, que foi a moeda que mais rendeu nas duas,
            as regras publicadas ficam em{" "}
            <strong className={tom(pub.semAMelhor.retorno)}>{pct(pub.semAMelhor.retorno)}</strong> e as
            anteriores em{" "}
            <strong className={tom(ant.semAMelhor.retorno)}>{pct(ant.semAMelhor.retorno)}</strong>
          </>
        ) : (
          <>
            Sem a moeda que mais rendeu ({pub.semAMelhor.ticker}), as publicadas ficam em{" "}
            <strong className={tom(pub.semAMelhor.retorno)}>{pct(pub.semAMelhor.retorno)}</strong>
          </>
        )}
        {pub.semAMelhor.retorno <= 0
          ? " — a gestão perde menos, e lucro continua não demonstrado."
          : " — e continuam no positivo sem ela."}
      </p>
      <details className="mt-3 group">
        <summary className="text-xs text-black/50 dark:text-white/50 cursor-pointer hover:text-black/70 dark:hover:text-white/70 w-fit">
          Ver a tabela de regimes — as publicadas com cada peça desligada, nas duas metades
        </summary>
        <div className="overflow-x-auto mt-2">
          <table className="w-full text-xs tabular-nums min-w-[40rem]">
            <thead className="text-black/45 dark:text-white/45">
              <tr className="text-left">
                <th className="font-normal py-1.5">Regime</th>
                <th className="font-normal py-1.5 text-right">Retorno</th>
                <th
                  className="font-normal py-1.5 text-right"
                  title="O retorno tirando a moeda que mais deu dinheiro. Um resultado que depende de uma moeda só descreve aquela moeda."
                >
                  Sem a melhor moeda
                </th>
                <th className="font-normal py-1.5 text-right">Queda máx.</th>
                <th
                  className="font-normal py-1.5 text-right"
                  title={`Cada metade da janela rodada do zero, sozinha. Corte em ${new Date(cmp.meio).toISOString().slice(0, 16).replace("T", " ")} UTC.`}
                >
                  1ª metade
                </th>
                <th className="font-normal py-1.5 text-right">2ª metade</th>
                <th className="font-normal py-1.5 text-right">Encerradas</th>
              </tr>
            </thead>
            <tbody>
              {cmp.linhas.map((l, i) => (
                <tr
                  key={l.nome}
                  className={`border-t border-black/5 dark:border-white/5 ${i > 1 ? "text-black/60 dark:text-white/60" : ""}`}
                >
                  <td className={`py-1.5 ${i === 0 ? "font-semibold" : i === 1 ? "font-medium" : "pl-3"}`}>
                    {/* A cor da linha do gráfico ao lado do nome, e só nas duas
                        que estão desenhadas: é o que liga a tabela à curva. */}
                    {i < 2 && (
                      <span
                        className="inline-block w-3 h-0.5 rounded mr-2 align-middle"
                        style={{ background: i === 0 ? "#5B8DEF" : "#898781" }}
                      />
                    )}
                    {l.nome}
                  </td>
                  <td className={`py-1.5 text-right ${tom(l.retorno)}`}>{pct(l.retorno)}</td>
                  <td className="py-1.5 text-right">
                    <span className={tom(l.semAMelhor.retorno)}>{pct(l.semAMelhor.retorno)}</span>
                    <span className="text-black/35 dark:text-white/35"> sem {l.semAMelhor.ticker}</span>
                  </td>
                  <td className={`py-1.5 text-right ${tom(l.quedaMaxima)}`}>{pct(l.quedaMaxima)}</td>
                  <td className={`py-1.5 text-right ${tom(l.metades[0])}`}>{pct(l.metades[0])}</td>
                  <td className={`py-1.5 text-right ${tom(l.metades[1])}`}>{pct(l.metades[1])}</td>
                  <td className="py-1.5 text-right">{l.encerradas}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-black/40 dark:text-white/40 mt-2 max-w-3xl">
            Uma regra entra quando melhora as duas metades E continua de pé sem a moeda que mais
            ganhou. Enquanto o placar disser que nenhum viés separa da referência, esta tabela
            compara maneiras de perder menos com calls sem vantagem medida — não maneiras de ganhar.
          </p>
        </div>
      </details>
    </>
  );
}

/**
 * As calls de cada origem, lado a lado: a lista escrita à mão e as em vista, que
 * entraram sozinhas pela carteira da Binance (`lib/emvista.ts`). É a pergunta
 * que elas trazem — se se comportam diferente — e fica na tela com a contagem
 * junto, porque cinco trades não respondem nada.
 */
function porOrigem(c: Carteira, emVista: Set<string>) {
  return (["lista", "em vista"] as const).map((o) => {
    const f = c.fechadas.filter((x) => emVista.has(x.symbol) === (o === "em vista"));
    return {
      o,
      n: f.length,
      acertos: f.filter((x) => x.resultado > 0).length,
      resultado: f.reduce((t, x) => t + x.resultado, 0),
      abertas: c.abertas.filter((x) => emVista.has(x.symbol) === (o === "em vista")).length,
    };
  });
}

export default function CarteiraPanel({ c: guardada }: { c: Carteira }) {
  const vivo = useVivo();
  const emVista = new Set(guardada.emVista ?? []);

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
  const saindo = c.abertas.filter((p) => p.saida);
  const r = c.regras ?? REGRAS_ANTERIORES;
  const MOTIVO_NOTA = notas(r);

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
              · marcada ao vivo
              {vivo.canal === "websocket" ? " (direto da Binance)" : " (a cada 15 s)"}, decisões do
              último retrato
            </span>
          ) : vivo.estado === "sem resposta" ? (
            // O âmbar da Binance (#F0B90B) reprova contraste no fundo claro,
            // 1,73:1; o escuro abaixo é o mesmo tom com a luminosidade que passa.
            <span className="text-[#8a5a00] dark:text-[#F0B90B]">
              {" "}
              · ⚠ sem cotação ao vivo, marcada no retrato
            </span>
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
      {saindo.length > 0 && (
        <p className="text-xs text-[#C42B3E] dark:text-[#F6465D] mt-2">
          {saindo.map((p) => `${p.symbol} (${p.saida})`).join(", ")}: a marcação ao vivo já passou
          de uma regra de saída. A carteira não decide ao vivo — o retrato seguinte fecha, pelo
          caminho de velas e na hora em que a ordem teria executado.
        </p>
      )}
      <p className="text-sm text-black/60 dark:text-white/60 mt-1">
        {usd(CAPITAL_INICIAL)} de mentira entrando em toda call de compra e venda que o painel
        emite, para a pergunta ficar na tela em vez de ficar no terminal. Perpétuo a{" "}
        <strong>{ALAVANCAGEM}x</strong> — que é o teto em que o stop de{" "}
        {(Math.max(r.stopComprado, r.stopVendido) * 100).toFixed(0)}% ainda dispara antes da
        liquidação —, com financiamento e liquidação cobrados.
      </p>
      {/* O REGIME, dito na tela. Sem isto quem olha vê as saídas "sem reação"
          e as vendidas pequenas sem saber de onde vêm — e são as duas peças que
          mais carregam o resultado, medido lado a lado no `npm run carteira`. */}
      {c.regras && (
        <p className="text-xs text-black/50 dark:text-white/50 mt-2">
          Gestão:{" "}
          {r.semReacaoDias !== null && (
            <>
              sai a posição que não andou a favor em <strong>{r.semReacaoDias} dias</strong>;{" "}
            </>
          )}
          {r.fatorVendido !== 1 && (
            <>
              o vendido arrisca <strong>{(r.fatorVendido * 100).toFixed(0)}%</strong> da régua do
              comprado, porque a cauda destas moedas é para cima;{" "}
            </>
          )}
          {r.freio && (
            <>
              abaixo de {(r.freio.inicio * 100).toFixed(0)}% do pico, o orçamento de risco encolhe
              até {(r.freio.piso * 100).toFixed(0)}% em −{(r.freio.fim * 100).toFixed(0)}%
              {c.freio !== undefined && c.freio < 1 && (
                <strong className="text-[#C42B3E] dark:text-[#F6465D]">
                  {" "}
                  — ligado agora, a {(c.freio * 100).toFixed(0)}%
                </strong>
              )}
              ;{" "}
            </>
          )}
          uma call que sai não reabre até o viés mudar de lado.
        </p>
      )}

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
            <p
              className="text-black/50 dark:text-white/50"
              title={`Maior margem comprometida ao mesmo tempo, sobre um teto de ${(EXPOSICAO_MAXIMA * 100).toFixed(0)}%`}
            >
              Margem no pico
            </p>
            <p className="text-xl font-semibold tabular-nums">
              {((c.maiorExposicao ?? 0) * 100).toFixed(0)}%
            </p>
            <p className="text-xs text-black/40 dark:text-white/40">
              de um teto de {(EXPOSICAO_MAXIMA * 100).toFixed(0)}%
            </p>
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
              de um teto de {(RISCO_TOTAL_MAXIMO * 100).toFixed(0)}%
              {(c.maiorRiscoAberto ?? 0) < 0.2 && " · o teto nunca prendeu"}
              {c.riscoAberto !== undefined && ` · agora ${(c.riscoAberto * 100).toFixed(1)}%`}
            </p>
          </div>
        </div>
      )}

      {guardada.curva.length > 1 && (
        <div className="mt-5 border-t border-black/10 dark:border-white/10 pt-4">
          <CurvaCarteira
            curva={comAgora(guardada.curva, c)}
            anterior={guardada.comparacao?.anterior ?? []}
            rotuloAnterior="regras até 23/09"
            capital={CAPITAL_INICIAL}
            meio={guardada.comparacao?.meio}
          />
          {guardada.comparacao && <Regimes cmp={guardada.comparacao} />}
        </div>
      )}

      {c.abertas.length > 0 && (
        <div className="mt-5 overflow-x-auto">
          <p className="text-[10px] tracking-widest text-black/40 dark:text-white/40 uppercase mb-2">
            Abertas
          </p>
          <table className="w-full text-sm tabular-nums min-w-[44rem]">
            <thead className="text-xs text-black/40 dark:text-white/40 text-left">
              <tr>
                <th className="font-normal py-1">Moeda</th>
                <th className="font-normal py-1">Lado</th>
                <th className="font-normal py-1 text-right" title="Força da leitura: decide o tamanho da posição">
                  Força
                </th>
                <th className="font-normal py-1 text-right">Entrada</th>
                <th className="font-normal py-1 text-right">Agora</th>
                <th
                  className="font-normal py-1 text-right"
                  title="Onde a ordem de stop está, no último retrato. A marcação ao vivo não a move — quem move é o retrato."
                >
                  Stop em
                </th>
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
                  <td className="py-1.5 font-medium">
                  {p.symbol}
                  {emVista.has(p.symbol) && (
                    <span
                      className="ml-1.5 text-[10px] font-normal text-black/40 dark:text-white/40"
                      title="Moeda em vista: entrou no painel sozinha, pela carteira quente da Binance"
                    >
                      em vista
                    </span>
                  )}
                  </td>
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
                  <td className="py-1.5 text-right text-black/60 dark:text-white/60">
                    {p.nivelStop ? p.nivelStop.toPrecision(4) : "—"}
                  </td>
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
                    {p.saida && (
                      <span className="ml-1" title={`${p.saida} na marcação ao vivo — o retrato seguinte fecha`}>
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
                    <td className="py-1.5 font-medium">
                    {f.symbol}
                    {emVista.has(f.symbol) && (
                    <span
                      className="ml-1.5 text-[10px] font-normal text-black/40 dark:text-white/40"
                      title="Moeda em vista: entrou no painel sozinha, pela carteira quente da Binance"
                    >
                      em vista
                    </span>
                  )}
                    </td>
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
            {emVista.size > 0 && (
              <div>
                <p
                  className="text-[10px] tracking-widest text-black/40 dark:text-white/40 uppercase mb-2"
                  title="As em vista entraram sozinhas, pela carteira quente da Binance. Separadas para dar para ver se as calls delas se comportam diferente das da lista."
                >
                  Por origem
                </p>
                {porOrigem(c, emVista).map((g) => (
                  <div key={g.o} className="flex justify-between gap-3 py-0.5">
                    <span className="text-black/60 dark:text-white/60">
                      {g.o}{" "}
                      <span className="text-black/35 dark:text-white/35">
                        ({g.acertos}/{g.n}
                        {g.abertas > 0 && ` · ${g.abertas} aberta${g.abertas > 1 ? "s" : ""}`})
                      </span>
                    </span>
                    <span className={`tabular-nums ${tom(g.resultado)}`}>
                      {g.n === 0 ? "—" : `${g.resultado >= 0 ? "+" : "−"}${usd(Math.abs(g.resultado))}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
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
