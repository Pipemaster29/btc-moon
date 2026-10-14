import Link from "next/link";
import type { PanoramaRow } from "@/lib/overview";
import { getSnapshot } from "@/lib/snapshot";
import { getPlacar } from "@/lib/placar";
import { getGarimpo } from "@/lib/garimpo";
import { lerDetentores } from "@/lib/detentores";
import { lerVesting } from "@/lib/vesting";
import { somarAdiante, type Adiante } from "@/lib/emvista";
import { PrecoVivo, SinalVivo, VariacaoViva } from "@/components/PrecoVivo";
import { PlacarResumo } from "@/components/PlacarPanel";
import { Cabeca, Pagina } from "@/components/Pagina";
import type { Estagio, Vies } from "@/lib/lifecycle";
import type { MoveKind } from "@/lib/positioning";

// Duas chamadas por moeda: dá para atualizar com frequência sem castigar as
// APIs públicas, que não pedem chave e não deveriam ser abusadas por isso.
export const revalidate = 300;

/**
 * A cor do estágio segue o ciclo, não a preferência: verde onde ainda há
 * caminho pela frente, âmbar no topo, vermelho na descida, cinza no que já
 * acabou. Uma moeda cinza não é ruim — ela é passado.
 */
const ESTAGIO_TONE: Record<Estagio, string> = {
  "nunca subiu": "text-[#0ECB81]",
  subindo: "text-[#0ECB81]",
  "no topo": "text-[#F0B90B]",
  "caindo do topo": "text-[#F6465D]",
  ressuscitando: "text-[#5B8DEF]",
  "em queda longa": "text-black/45 dark:text-white/45",
  exausta: "text-black/30 dark:text-white/30",
  "de lado": "text-black/30 dark:text-white/30",
};

const VIES_LABEL: Record<Vies, string> = {
  short: "vender",
  long: "comprar",
  evitar: "não mexer",
  observar: "observar",
};

const VIES_STYLE: Record<Vies, string> = {
  short: "border-[#F6465D]/40 bg-[#F6465D]/10 text-[#F6465D]",
  long: "border-[#0ECB81]/40 bg-[#0ECB81]/10 text-[#0ECB81]",
  evitar: "border-black/15 dark:border-white/15 text-black/45 dark:text-white/45",
  observar: "border-transparent text-black/25 dark:text-white/25",
};

const MOVE_LABEL: Record<MoveKind, string> = {
  squeeze: "squeeze",
  alavancagem: "alta a crédito",
  oferta: "alta por oferta",
  desalavancagem: "desalavancando",
  "livro vazio": "livro vazio",
  distribuicao: "distribuindo",
  misto: "misto",
};

const MOVE_TONE: Record<MoveKind, string> = {
  squeeze: "text-[#F0B90B]",
  alavancagem: "text-[#F6465D]",
  oferta: "text-[#0ECB81]",
  desalavancagem: "text-[#F0B90B]",
  "livro vazio": "text-[#F0B90B]",
  distribuicao: "text-[#F6465D]",
  misto: "text-black/40 dark:text-white/40",
};

function money(v: number): string {
  if (!Number.isFinite(v) || v === 0) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)} bi`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)} mi`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)} mil`;
  return v.toFixed(0);
}

function signed(v: number): string {
  if (!Number.isFinite(v) || v === 0) return "—";
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

/**
 * A barra de nota é deliberadamente discreta. Ela ordena a tabela, e ordenar é
 * tudo o que ela faz — dar a ela cara de medidor sugeriria uma precisão que
 * quarenta moedas e cinco dias de histórico não sustentam.
 */
function Score({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-12 rounded-full bg-black/10 dark:bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full ${
            value >= 60 ? "bg-[#F6465D]" : value >= 35 ? "bg-[#F0B90B]" : "bg-black/25 dark:bg-white/25"
          }`}
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="tabular-nums text-xs text-black/40 dark:text-white/40">{value}</span>
    </div>
  );
}

/**
 * A tese das em vista conferida para frente (`medirAdiante`). O número medido
 * antes vai junto porque é contra ele que este se lê; e com pouca amostra a
 * frase diz que é pouca, com a conta de quando deixa de ser.
 */
function textoAdiante(adiante: Adiante): string {
  const desde = new Date(adiante.desde).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  const a = somarAdiante(adiante);
  if (a.emVista.moedaDias === 0) return `A conferência para frente conta a partir de ${desde}, dia fechado a dia fechado.`;
  const taxa = (g: typeof a.emVista) => (g.moedaDias ? ((g.altas / g.moedaDias) * 1000).toFixed(1).replace(".", ",") : "—");
  // Mil moeda-dias: a 16,7 contra 4,4 por mil, são ~17 dias de alta contra ~4
  // esperados — a partir daí a diferença medida antes, se existir, aparece.
  const pouca = a.emVista.moedaDias < 1000;
  return (
    `Conferido para frente, desde ${desde}: ${taxa(a.emVista)} por mil nas em vista contra ${taxa(a.resto)} no resto ` +
    `(${a.emVista.moedaDias.toLocaleString("pt-BR")} e ${a.resto.moedaDias.toLocaleString("pt-BR")} moeda-dias)` +
    (pouca ? " — amostra ainda pequena; a comparação começa a valer perto de mil moeda-dias em vista." : ".")
  );
}

/**
 * `referencia` é o instante do retrato, não o de agora.
 *
 * Era `Date.now()` chamado dentro da linha, o que dava duas coisas erradas de
 * uma vez: o lint reprovava a impureza no render, e a conta media a idade do
 * unlock contra o momento em que a página é servida — que, com o retrato
 * guardado e o cache de cinco minutos, pode estar horas à frente dos dados que
 * a própria linha mostra. A janela tem de ser medida a partir de quando os
 * `unlocks` foram lidos.
 */
/**
 * Quando "Dono" e "Solta" foram medidos. Os dois vêm de arquivos feitos à mão
 * (`npm run genese`, `npm run vesting`), e em 24/09 as medições eram de 06/09 e
 * de 02–03/09 — três semanas, sem nada na tela dizendo. É a armadilha nº 6:
 * número ao lado do preço de agora carrega a própria data.
 */
interface Medidas {
  dono: Record<string, number>;
  solta: Record<string, number>;
}

function diaMes(t: number | undefined): string | null {
  if (!t || !Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

function Row({ row, referencia, medidas }: { row: PanoramaRow; referencia: number; medidas: Medidas }) {
  const donoEm = diaMes(medidas.dono[row.symbol]);
  const soltaEm = diaMes(medidas.solta[row.symbol]);
  const unlockRecente = row.vida?.unlocks?.some(
    (u) => referencia - u.quando <= 21 * 86400_000 && u.variacao >= 0.05,
  );

  return (
    <tr className="border-t border-black/5 dark:border-white/5 hover:bg-black/[0.02] dark:hover:bg-white/[0.03]">
      <td className="py-2.5 pr-3">
        <Link href={`/radar/${row.ticker}`} className="font-medium hover:underline">
          {row.ticker}
        </Link>
        <p className="text-xs text-black/35 dark:text-white/35">
          {row.contract ? row.chain : "só perpétuo"}
          {row.hasWallets && " · carteiras mapeadas"}
          {row.origem && (
            <span title="Entrou sozinha: passou pela carteira quente da Binance com o perpétuo conferido pelo preço. Ninguém mapeou as carteiras do projeto.">
              {" · em vista"}
            </span>
          )}
        </p>
      </td>
      {/* Preço e 24h continuam andando depois que a página é servida: são os dois
          números que envelhecem em minutos, e um pump de 120% cabe inteiro entre
          dois retratos. O resto da linha muda de hora em hora e segue vindo
          pronto do servidor. */}
      <td className="py-2.5 pr-3 text-right tabular-nums">
        <PrecoVivo ticker={row.ticker} retrato={row.price} />
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums">
        <VariacaoViva ticker={row.ticker} retrato={row.change24h} />
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums">
        {row.vida?.marketCap != null ? money(row.vida.marketCap) : "—"}
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums">{money(row.liquidityUsd)}</td>
      <td className="py-2.5 pr-3 text-right">
        {row.vida?.floatToken != null ? (
          <span
            className={`tabular-nums ${row.vida.floatToken <= 0.3 ? "text-[#F0B90B]" : ""}`}
          >
            {(row.vida.floatToken * 100).toFixed(0)}%
          </span>
        ) : (
          <span className="text-black/25 dark:text-white/25">—</span>
        )}
        {unlockRecente && <p className="text-xs text-[#F6465D]">unlock</p>}
      </td>
      <td className="py-2.5 pr-3 text-right">
        {row.motor?.concentracao == null ? (
          <span className="text-black/25 dark:text-white/25" title="Nunca varrida — npm run genese">
            —
          </span>
        ) : (
          <span
            className={`tabular-nums ${row.motor.concentracao >= 0.5 ? "text-[#C42B3E] dark:text-[#F6465D]" : ""}`}
            title={`${(row.motor.concentracao * 100).toFixed(1)}% do supply ainda está com quem o recebeu na gênese${donoEm ? ` — medido em ${donoEm}` : ""}`}
          >
            {(row.motor.concentracao * 100).toFixed(0)}%
            {donoEm && <span className="block text-[10px] text-black/35 dark:text-white/35">{donoEm}</span>}
          </span>
        )}
      </td>
      <td className="py-2.5 pr-3 text-right">
        {row.motor?.emissao == null ? (
          <span className="text-black/25 dark:text-white/25" title="Nunca varrida — npm run vesting">
            —
          </span>
        ) : (
          <span
            className={`tabular-nums ${row.motor.emissao >= 0.5 ? "text-[#C42B3E] dark:text-[#F6465D]" : ""}`}
            title={`os contratos de alocação soltam ${row.motor.emissao.toFixed(2)} pp do supply por mês${soltaEm ? ` — medido em ${soltaEm}` : ""}`}
          >
            {row.motor.emissao < 0.01 ? "—" : `${row.motor.emissao.toFixed(1)}pp`}
            {soltaEm && <span className="block text-[10px] text-black/35 dark:text-white/35">{soltaEm}</span>}
          </span>
        )}
      </td>
      <td className="py-2.5 pr-3 text-right tabular-nums">{money(row.openInterestUsd)}</td>
      <td className="py-2.5 pr-3 text-right tabular-nums">
        {row.perpDominance > 0 ? `${row.perpDominance.toFixed(0)}x` : "—"}
      </td>
      <td className="py-2.5 pr-3">
        {row.vida ? (
          <span className={ESTAGIO_TONE[row.vida.estagio]}>{row.vida.estagio}</span>
        ) : (
          <span className="text-black/25 dark:text-white/25">—</span>
        )}
        {row.vida && (
          <p className="text-xs text-black/35 dark:text-white/35 tabular-nums">
            {signed(row.vida.queda)} do topo · {signed(row.vida.altaDesdeFundo)} do fundo
          </p>
        )}
      </td>
      <td className="py-2.5 pr-3">
        {row.leitura && row.leitura.vies !== "observar" ? (
          <span
            className={`text-xs px-2 py-0.5 rounded-md border ${VIES_STYLE[row.leitura.vies]}`}
            title={row.leitura.titulo}
          >
            {VIES_LABEL[row.leitura.vies]}
          </span>
        ) : (
          <span className="text-black/20 dark:text-white/20 text-xs">—</span>
        )}
      </td>
      <td className="py-2.5 pr-3">
        {row.moveKind ? (
          <span className={MOVE_TONE[row.moveKind]}>
            {MOVE_LABEL[row.moveKind]} {signed(row.moveChange)}
          </span>
        ) : (
          <span className="text-black/25 dark:text-white/25">—</span>
        )}
      </td>
      <td className="py-2.5 pr-3 text-center">
        {row.motor ? (
          <span
            title={row.motor.resumo}
            className={`tabular-nums text-xs ${
              row.motor.motores === row.motor.medidos && row.motor.medidos >= 3
                ? "text-[#0ECB81]"
                : row.motor.motores === 0
                  ? "text-black/30 dark:text-white/30"
                  : ""
            }`}
          >
            {row.motor.motores}/{row.motor.medidos}
          </span>
        ) : (
          <span className="text-black/20 dark:text-white/20">—</span>
        )}
      </td>
      <td className="py-2.5 pr-3 text-center">
        {row.whaleExiting ? (
          <span title={`largaram ${(row.whaleExitShare * 100).toFixed(1)}% do livro`}>🐋</span>
        ) : (
          <span className="text-black/15 dark:text-white/15">·</span>
        )}
      </td>
      <td className="py-2.5">
        <Score value={row.score} />
      </td>
    </tr>
  );
}

/**
 * A aba RADAR: as moedas e o que cada uma está fazendo agora. A carteira, os
 * robôs, o placar inteiro, os sinais, o fluxo da Binance e o garimpo moravam
 * nesta mesma página, empilhados; cada um foi para a sua aba (`components/Abas.tsx`)
 * e esta ficou com a tabela e as candidatas. O resumo do placar fica — acima
 * das candidatas, que é onde ele precisa ser lido.
 */
export default async function Radar() {
  const [snapshot, placar, garimpo, detentores, vesting] = await Promise.all([
    getSnapshot(),
    getPlacar(),
    getGarimpo(),
    lerDetentores().catch(() => null),
    lerVesting().catch(() => null),
  ]);
  const medidas: Medidas = {
    dono: Object.fromEntries(Object.entries(detentores?.moedas ?? {}).map(([s, d]) => [s, d.medidoEm])),
    solta: Object.fromEntries(Object.entries(vesting?.moedas ?? {}).map(([s, v]) => [s, v.medidoEm])),
  };
  const rows = snapshot.moedas;
  const comCarteiras = rows.filter((r) => r.hasWallets).length;
  const emVista = rows.filter((r) => r.origem).length;
  const adiante = garimpo?.emVistaAdiante ?? null;

  const porVies = (v: Vies) =>
    rows
      .filter((r) => r.leitura?.vies === v)
      .sort((a, b) => (b.leitura?.forca ?? 0) - (a.leitura?.forca ?? 0) || b.score - a.score);

  const vender = porVies("short");
  const comprar = porVies("long");
  const mortas = rows.filter((r) => r.vida?.estagio === "exausta");

  return (
    <Pagina>
      <Cabeca titulo="Radar de moedas manipuladas">
        <p className="text-black/60 dark:text-white/60 max-w-3xl">
          {rows.length} moedas vigiadas, {comCarteiras} com carteiras mapeadas na blockchain
          {emVista > 0 && `, ${emVista} em vista`}. A ordem é por quanto cada uma merece atenção agora — não por tamanho,
          que colocaria em cima justamente as que não estão fazendo nada. Clique numa moeda para o retrato completo.
        </p>
        {/* Duas idades, porque são dois relógios: preço e posicionamento se
            refazem em segundos, estágio de vida custa dez arquivos por moeda.
            Mostrar uma idade só estava errando a de metade dos números. */}
        <p className="text-xs text-black/40 dark:text-white/40">
          Estágio e leitura de{" "}
          {new Date(snapshot.geradoEm).toLocaleString("pt-BR", {
            day: "2-digit",
            month: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          })}
          {snapshot.idadeMinutos >= 1 &&
            ` · ${
              snapshot.idadeMinutos >= 120
                ? `${Math.round(snapshot.idadeMinutos / 60)} h atrás`
                : `${Math.round(snapshot.idadeMinutos)} min atrás`
            }`}
          {snapshot.fonte === "cálculo" && " · calculado agora"}
          {/* O aviso de workflow parado continua aparecendo mesmo com a camada
              viva por cima: uma coisa é o preço estar fresco, outra é o
              retrato ter parado de ser tirado. Esconder a segunda porque a
              primeira foi resolvida deixaria o workflow quebrado em silêncio. */}
          {/* Os tons claros aqui eram os do modo escuro nos dois modos, e no
              fundo claro o âmbar dá 1,73:1 — o aviso de workflow parado era
              justamente o texto que menos se lia. */}
          {snapshot.parado ? (
            <span className="text-[#C42B3E] dark:text-[#F6465D]"> · parado há horas, confira o workflow</span>
          ) : snapshot.atrasado ? (
            <span className="text-[#8a5a00] dark:text-[#F0B90B]"> · atrasado</span>
          ) : null}
          {snapshot.vivoEm !== null && snapshot.fonte !== "cálculo" && (
            <span className="text-[#0a7d43] dark:text-[#0ECB81]">
              {" "}
              · preço, open interest e posicionamento refeitos na montagem da página
            </span>
          )}
          <SinalVivo />
        </p>
        {snapshot.novas.length > 0 && (
          <p className="text-xs text-black/40 dark:text-white/40">
            {snapshot.novas.join(", ")} {snapshot.novas.length === 1 ? "entrou" : "entraram"} na lista depois do último
            retrato: aparecem com preço e posicionamento, sem estágio nem leitura, até o workflow rodar de novo.
          </p>
        )}
        {/* O QUE É "EM VISTA", com o número que a sustenta e o que ele não
            diz. Sem a segunda metade, "entrou sozinha no painel" seria lido
            como "o robô achou uma oportunidade" — e o que foi medido é que
            elas se MEXEM, não que dá para ganhar com elas. Recolhido, e não
            cortado: quem vê "em vista" na tabela acha a explicação aqui. */}
        {emVista > 0 && (
          <details className="text-xs text-black/55 dark:text-white/55 max-w-3xl">
            <summary className="cursor-pointer w-fit hover:text-black dark:hover:text-white">
              O que é “em vista” ({emVista} moedas)
            </summary>
            <p className="mt-1.5">
              São as que entraram sozinhas: passaram pela carteira quente da Binance na BNB Chain com o perpétuo conferido
              pelo preço, e saem depois de 30 dias sem passar. Medido em 23/09 sobre 200 dias da praça inteira: essas moedas
              tiveram dia de alta de 25% ou mais 3,8 vezes mais que o resto da Binance, no mesmo tamanho e nas duas metades da
              janela. Isso diz que elas se mexem. Que dê para ganhar com isso não está medido — a carteira fictícia opera as
              calls delas separadas por origem, e é ela que vai dizer.
              {adiante && <> {textoAdiante(adiante)}</>}
            </p>
          </details>
        )}
      </Cabeca>

      {/* O placar ANTES das candidatas, de propósito: quem lê "vender"
          precisa saber, na mesma tela, que o viés ainda não separou de nada. O
          placar inteiro mora na aba Carteira; aqui fica o veredito. */}
      {placar && <PlacarResumo placar={placar} />}

      <div className="grid gap-4 lg:grid-cols-2">
        {[
          { titulo: "Candidatas a vender", lista: vender, tom: "border-[#F6465D]/40 bg-[#F6465D]/5" },
          { titulo: "Candidatas a comprar", lista: comprar, tom: "border-[#0ECB81]/40 bg-[#0ECB81]/5" },
        ].map(({ titulo, lista, tom }) => (
          <section key={titulo} className={`rounded-xl border p-5 ${tom}`}>
            <h2 className="font-semibold">
              {titulo} ({lista.length})
            </h2>
            {lista.length === 0 ? (
              <p className="text-sm text-black/50 dark:text-white/50 mt-2">
                Nenhuma moeda com essa combinação agora. É o resultado mais comum, e é
                informação: o setup não existe na maior parte do tempo.
              </p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3 text-sm">
                {lista.slice(0, 4).map((r) => (
                  <li key={r.symbol}>
                    <Link href={`/radar/${r.ticker}`} className="font-medium hover:underline">
                      {r.ticker}
                    </Link>
                    <span className="text-black/40 dark:text-white/40 text-xs">
                      {" "}
                      · {r.vida?.estagio} · força {r.leitura?.forca}/3
                    </span>
                    <p className="text-black/60 dark:text-white/60">{r.leitura?.titulo}</p>
                    {/* A TRAVA QUE NÃO PÔDE RODAR, dita onde alguém decide.
                        `lerVies` só remove a compra quando a concentração é
                        CONHECIDA e alta — com ela nula, a regra "moeda com dono
                        não quica" simplesmente não roda. Medido em 05/09: das 7
                        calls de compra, as 7 estavam sem varredura, e a mais
                        forte (BASED, força 3) tinha 97% do circulante fora de
                        corretora contando como munição livre. É a forma exata
                        do JCT, onde o painel emitiu COMPRA e a moeda imprimiu
                        2,9e-27 dias depois.
                        O número já aparecia na coluna "Dono" da tabela, mas
                        não aqui — e é aqui que se lê antes de agir. */}
                    {r.leitura?.vies === "long" && r.motor?.concentracao == null && (
                      <p className="text-xs text-[#C42B3E] dark:text-[#F6465D] mt-1">
                        {/* A frase é montada numa string só, e não em pedaços de
                            JSX: quebra de linha entre expressões vira espaço, e
                            o texto saía com "50% , e aqui" e um " ." solto no
                            fim. */}
                        {`Concentração não varrida: a trava de “o supply tem dono” não rodou nesta. ` +
                          `Ela só remove a compra quando a concentração é conhecida e passa de 50%` +
                          (r.motor?.privadoPublico != null
                            ? `, e aqui ${(r.motor.privadoPublico * 100).toFixed(0)}% do circulante fora de corretora está contando como munição livre.`
                            : ".")}
                      </p>
                    )}
                    {/* O porquê e o até quando, recolhidos: sempre abertos, as
                        quatro candidatas de cada lado eram 3.000 px de texto no
                        celular antes de a tabela começar. O aviso de cima, da
                        trava que não rodou, fica aberto — é ele que muda a
                        decisão. */}
                    {(r.leitura?.porque || r.leitura?.ateQuando) && (
                      <details className="mt-1 text-xs">
                        <summary className="cursor-pointer w-fit text-black/45 dark:text-white/45 hover:text-black dark:hover:text-white">
                          por quê, e até quando
                        </summary>
                        {r.leitura?.porque && <p className="text-black/50 dark:text-white/50 mt-1">{r.leitura.porque}</p>}
                        {r.leitura?.ateQuando && (
                          <p className="text-black/60 dark:text-white/60 mt-1 border-l-2 border-black/15 dark:border-white/15 pl-2">
                            {r.leitura.ateQuando}
                          </p>
                        )}
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>

      {mortas.length > 0 && (
        <p className="text-sm text-black/50 dark:text-white/50">
          <span className="font-medium">{mortas.length} já cumpriram o ciclo</span> —{" "}
          {mortas.map((r) => r.ticker).join(", ")}. Caíram mais de 60% de um topo antigo e
          não acharam comprador desde então. Vender agora é pagar financiamento para
          capturar o que sobrou.
        </p>
      )}

      <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold text-lg">Todas as moedas</h2>
          <span className="text-xs text-black/40 dark:text-white/40">role de lado para ver todas as colunas · passe o mouse no título de cada uma</span>
        </div>
        {/* As colunas explicadas, recolhidas logo acima da tabela: o texto era o
            rodapé da página, longe de quem tenta ler uma coluna. */}
        <details className="text-xs text-black/55 dark:text-white/55 mt-2 max-w-3xl">
          <summary className="cursor-pointer w-fit hover:text-black dark:hover:text-white">Como ler as colunas</summary>
          <p className="mt-1.5">
            A coluna <span className="font-medium">perp ÷ pool</span> é a mais subestimada: quando o open interest vale
            dezenas de vezes a liquidez à vista, o preço não é feito por quem compra a moeda, e sim por quem aposta nela. A
            coluna <span className="font-medium">circulando</span> mostra quanto do supply realmente anda — abaixo de 30% o
            resto é promessa de oferta futura, e cada unlock converte um pedaço dela em oferta real. A coluna
            <span className="font-medium"> motor </span>
            conta quantos dos três testes de capacidade passam — perpétuo com tamanho, pool que gire, oferta fora das
            corretoras. Ela mede se a moeda AINDA PODE ser empurrada; não mede se alguém vai empurrar, e não distingue um dono
            com 80% de dez mil donos com 80%, o que exigiria a lista de maiores detentores.
          </p>
        </details>
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-sm min-w-[1400px]">
            <thead className="text-black/45 dark:text-white/45 text-xs">
              <tr>
                <th className="font-normal pb-2 text-left">Moeda</th>
                <th className="font-normal pb-2 text-right">Preço</th>
                <th className="font-normal pb-2 text-right">24h</th>
                <th
                  className="font-normal pb-2 text-right"
                  title="Circulante × preço. Diferente do FDV, que conta como valor o que ainda nem circula."
                >
                  Market cap
                </th>
                <th className="font-normal pb-2 text-right">Liquidez</th>
                <th
                  className="font-normal pb-2 text-right"
                  title="Circulante ÷ supply total. Float pequeno é a condição que torna a manipulação barata; o resto é promessa de oferta futura."
                >
                  Circulando
                </th>
                <th
                  className="font-normal pb-2 text-right"
                  title="Quanto do supply ainda está com quem o recebeu na distribuição inicial. Acima de 50% a moeda tem dono, não float — e aí supply fora de corretora não é munição livre."
                >
                  Dono
                </th>
                <th
                  className="font-normal pb-2 text-right"
                  title="Pontos percentuais do supply que os contratos de alocação soltam por mês. É oferta programada: o comprador está do outro lado dela."
                >
                  Solta
                </th>
                <th className="font-normal pb-2 text-right">Open interest</th>
                <th className="font-normal pb-2 text-right" title="Open interest dividido pela liquidez à vista">
                  Perp ÷ pool
                </th>
                <th className="font-normal pb-2 text-left" title="Onde a moeda está na própria vida">
                  Estágio
                </th>
                <th className="font-normal pb-2 text-left" title="O cruzamento do estágio com o que acontece agora">
                  Leitura
                </th>
                <th className="font-normal pb-2 text-left">Perna atual</th>
                <th
                  className="font-normal pb-2 text-center"
                  title="Ainda há com que empurrar: perpétuo com tamanho, pool que gire e oferta fora das corretoras. Mede capacidade, não intenção."
                >
                  Motor
                </th>
                <th className="font-normal pb-2 text-center" title="Contas grandes desmontando comprado perto do topo">
                  🐋
                </th>
                <th className="font-normal pb-2 text-left">Atenção</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row key={row.symbol} row={row} referencia={snapshot.geradoEm} medidas={medidas} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-black/40 dark:text-white/40 max-w-3xl">
        Perpétuo pela API pública da Gate, mercado à vista pelo DexScreener, blockchain por nós públicos — nenhuma chave de
        API envolvida. Nada aqui é recomendação de investimento.
      </p>
    </Pagina>
  );
}
