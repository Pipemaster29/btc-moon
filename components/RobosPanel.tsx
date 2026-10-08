"use client";

/**
 * Os robôs na tela: o placar ao vivo, a medição que os sustenta, e as posições.
 *
 * A ORDEM É O ARGUMENTO, como no resto da página. Primeiro quanto cada um tem
 * agora; logo abaixo, como teria sido desde 01/2024 com a mesma regra — porque
 * um robô de três dias não diz nada sozinho, e a medição sem o ao vivo é só
 * um backtest. As duas idades ficam na tela: a marcação é de agora (o preço vem
 * do WebSocket da Binance, como o da carteira), as ENTRADAS e SAÍDAS são do
 * último retrato.
 *
 * E A RESSALVA FICA NA TELA, não num comentário: o lucro medido da perna
 * comprada vem de poucas moedas, e a melhora de 08/10 é quase toda de 07/2025
 * em diante — no mesmo risco, dentro da amostra a regra nova rende MENOS que a
 * anterior. Quem olha a curva bonita precisa ler isso ao lado dela, e por isso
 * a regra anterior entra no gráfico e na tabela, medida no mesmo modelo.
 */

import {
  CAPITAL_ROBO,
  DIA,
  valorDaPosicao,
  type ArquivoRobos,
  type EstadoRobo,
  type Medicao,
  type MedicaoRobo,
  type PosicaoRobo,
} from "@/lib/robos";
import CurvaRobos, { type Ponto, type SerieRobo } from "./CurvaRobos";
import { useVivo } from "./vivo";

const CORES = ["var(--robo-1)", "var(--robo-2)", "var(--robo-3)"];
const CURTO: Record<string, string> = { momento: "Momento", turbo: "Turbo", "caca-monstra": "Caça" };

function usd(v: number, casas = 2): string {
  return `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
}

function pct(v: number, casas = 1): string {
  // Abaixo de 10% uma casa a mais: "−0%" escondia os −0,3% do Caça-monstra no
  // período em que ele perdeu, que é justamente o número que importa ler.
  const c = Math.abs(v) < 0.1 ? Math.max(casas, 1) : casas;
  const x = Math.abs(v * 100) < 0.5 * 10 ** -c ? 0 : v * 100;
  return `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toLocaleString("pt-BR", { minimumFractionDigits: c, maximumFractionDigits: c })}%`;
}

/** Uma fração sem sinal e sem casa à toa: 0,06 → "6%", 0,001 → "0,1%". */
function fracao(v: number): string {
  return `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

function tom(v: number): string {
  if (v > 0.0005) return "text-[#0a7d43] dark:text-[#0ECB81]";
  if (v < -0.0005) return "text-[#C42B3E] dark:text-[#F6465D]";
  return "";
}

function dataHora(t: number): string {
  return new Date(t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
}

const MOTIVO: Record<string, string> = {
  stop: "stop",
  rastro: "rastro",
  prazo: "prazo",
  liquidada: "liquidada",
  sumiu: "saiu da praça",
};

/** A posição marcada no preço vivo, quando há; senão no do retrato. */
function marcada(p: PosicaoRobo, vivo: Record<string, { preco: number }>): { preco: number; valor: number; vivo: boolean } {
  const m = vivo[p.symbol.replace(/USDT$/, "")];
  // O mesmo freio de lixo do motor: dez vezes não é mercado.
  const ok = m && m.preco > 0 && m.preco / p.precoAtual < 10 && p.precoAtual / m.preco < 10;
  const preco = ok ? m.preco : p.precoAtual;
  return { preco, valor: valorDaPosicao(p, preco), vivo: !!ok };
}

function Posicoes({ e, vivo }: { e: EstadoRobo; vivo: Record<string, { preco: number }> }) {
  const linhas = e.abertas
    .map((p) => ({ p, ...marcada(p, vivo) }))
    .map((x) => ({ ...x, resultado: x.valor - x.p.margem }))
    .sort((a, b) => b.resultado - a.resultado);
  if (linhas.length === 0) return <p className="text-xs text-black/45 dark:text-white/45">Nenhuma posição aberta.</p>;
  // A coluna só aparece no robô que tem pirâmide em alguma posição: no
  // Caça-monstra seria uma coluna inteira de traços.
  const comPiramide = e.abertas.some((p) => p.piramide !== undefined || (p.parcelas ?? 1) > 1);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs tabular-nums">
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
                <td className="py-1 pr-3">{p.lado === "long" ? "comprado" : "vendido"}</td>
                <td className="py-1 pr-3 text-right">{p.precoEntrada.toPrecision(5)}</td>
                <td className="py-1 pr-3 text-right">{preco.toPrecision(5)}</td>
                <td className={`py-1 pr-3 text-right ${tom(resultado)}`}>
                  {usd(resultado)} <span className="text-black/40 dark:text-white/40">({pct(resultado / p.margem, 0)} da margem)</span>
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

/** Uma linha da tabela da medição; a de referência sai apagada, para não ser lida como robô. */
function LinhaMedicao({ m, nome, referencia }: { m: MedicaoRobo; nome: string; referencia?: boolean }) {
  const [tudo, dentro, fora] = m.linhas;
  return (
    <tr className={`border-t border-black/5 dark:border-white/5 ${referencia ? "text-black/45 dark:text-white/45" : ""}`}>
      <td className="py-1 pr-3">
        {nome}
        {referencia && <span className="ml-1.5 text-[10px]">(regra anterior)</span>}
      </td>
      <td className={`py-1 pr-3 text-right ${referencia ? "" : tom(tudo.retorno)}`}>{pct(tudo.retorno, 0)}</td>
      <td className={`py-1 pr-3 text-right ${referencia ? "" : tom(dentro.retorno)}`}>{pct(dentro.retorno, 0)}</td>
      <td className={`py-1 pr-3 text-right ${referencia ? "" : tom(fora.retorno)}`}>{pct(fora.retorno, 0)}</td>
      <td className="py-1 pr-3 text-right">{pct(tudo.quedaMaxima, 0)}</td>
      <td className="py-1 pr-3 text-right">{tudo.sharpe.toFixed(2)}</td>
      <td className="py-1 pr-3 text-right">
        {pct(m.semAMelhor.retorno, 0)} <span className="text-black/40 dark:text-white/40">sem {m.semAMelhor.symbol.replace(/USDT$/, "")}</span>
      </td>
      <td className="py-1 text-right" title={m.semAs5 ? `sem ${m.semAs5.symbols.map((s) => s.replace(/USDT$/, "")).join(", ")}` : undefined}>
        {m.semAs5 ? (
          <>
            <span className={referencia ? "" : tom(m.semAs5.retornos[0])}>{pct(m.semAs5.retornos[0], 0)}</span>
            {" · "}
            <span className={referencia ? "" : tom(m.semAs5.retornos[2])}>{pct(m.semAs5.retornos[2], 0)}</span>
          </>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}

export default function RobosPanel({
  arquivo,
  medicao,
  carteira,
}: {
  arquivo: ArquivoRobos | null;
  medicao: Medicao | null;
  /** A curva da carteira do painel, para entrar como contexto no ao vivo. */
  carteira?: Ponto[];
}) {
  const vivo = useVivo();
  const robos = arquivo?.robos ?? [];
  const inicio = robos.length > 0 ? Math.min(...robos.map((e) => e.comecouEm)) : null;

  const marcados = robos.map((e) => {
    let pat = e.caixa;
    let algumVivo = false;
    for (const p of e.abertas) {
      const m = marcada(p, vivo.moedas);
      pat += m.valor;
      algumVivo ||= m.vivo;
    }
    return { e, patrimonio: vivo.em === null ? e.patrimonio : pat, algumVivo };
  });

  const seriesVivo: SerieRobo[] = marcados.map(({ e, patrimonio }, k) => ({
    id: e.id,
    rotulo: e.nome,
    curto: CURTO[e.id] ?? e.nome,
    cor: CORES[k % CORES.length],
    pontos: vivo.em === null ? e.curva : [...e.curva, { t: Math.max(vivo.em, e.atualizadoEm), patrimonio }],
  }));
  if (carteira && inicio !== null) {
    const desde = carteira.filter((p) => p.t >= inicio);
    // Rebaseada a US$ 1.000 no começo dos robôs: as duas contas largam juntas.
    if (desde.length >= 2) {
      const base = desde[0].patrimonio;
      seriesVivo.push({
        id: "carteira",
        rotulo: "Carteira do painel (rebaseada)",
        curto: "Painel",
        cor: "var(--robo-ctx)",
        contexto: true,
        pontos: desde.map((p) => ({ t: p.t, patrimonio: (p.patrimonio / base) * CAPITAL_ROBO })),
      });
    }
  }

  const medidos = medicao?.robos ?? [];
  // A regra do Momento até 08/10, medida no MESMO modelo realista: é contra ela
  // que a melhora se lê, e ela entra em cinza, como contexto.
  const anterior = medicao?.referencias?.find((m) => m.id === "momento-anterior");
  const seriesMedidas: SerieRobo[] = medidos.map((m, k) => {
    const nome = robos.find((e) => e.id === m.id)?.nome ?? m.id;
    return { id: m.id, rotulo: nome, curto: CURTO[m.id] ?? nome, cor: CORES[k % CORES.length], pontos: m.curva };
  });
  if (anterior) {
    seriesMedidas.push({
      id: anterior.id,
      rotulo: "Momento até 08/10 (30 dias, sem pirâmide, 4%)",
      curto: "Antes",
      cor: "var(--robo-ctx)",
      contexto: true,
      pontos: anterior.curva,
    });
  }
  const corte = medidos[0]?.linhas.find((l) => l.janela.startsWith("fora"))?.de;
  const momento = medidos.find((m) => m.id === "momento");
  const real = medicao?.realismo;

  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-lg">Robôs</h2>
        <span className="text-xs text-black/40 dark:text-white/40 tabular-nums">
          {inicio !== null && <>desde {dataHora(inicio)} UTC · </>}
          {vivo.estado === "ao vivo" ? (
            <span className="text-[#0a7d43] dark:text-[#0ECB81]">marcados ao vivo, decisões do último retrato</span>
          ) : vivo.estado === "sem resposta" ? (
            <span className="text-[#8a5a00] dark:text-[#F0B90B]">⚠ sem cotação ao vivo, marcados no retrato</span>
          ) : (
            "marcados no retrato"
          )}
        </span>
      </div>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1">
        Carteiras fictícias de {usd(CAPITAL_ROBO, 0)} que <strong>não seguem o painel</strong>: operam qualquer
        perpétuo da Binance com uma regra só, escolhida depois de medir dezenas de ideias sobre 676 perpétuos —
        os 152 deslistados inclusive — de 01/2024 a 09/2026. A que passou: <strong>momento dos dois lados</strong>.
        Perdedora continua perdendo nestas moedas, e a que sobe há mês e meio às vezes vira monstra — e quando ela
        anda +40%, o robô dobra a aposta. Juntas, as duas pernas se protegem. Não é recomendação: é a medição
        continuando ao vivo.
      </p>

      {robos.length === 0 ? (
        <p className="text-sm text-black/45 dark:text-white/45 mt-4">
          Os robôs ainda não rodaram — o primeiro retrato do workflow depois do deploy abre as primeiras posições.
        </p>
      ) : (
        <div className="grid gap-3 mt-4 sm:grid-cols-3">
          {marcados.map(({ e, patrimonio }) => {
            const ret = patrimonio / CAPITAL_ROBO - 1;
            const compradas = e.abertas.filter((p) => p.lado === "long").length;
            const manip = e.abertas.filter((p) => p.manipulada).length;
            const acertos = e.fechadas.filter((t) => t.resultado > 0).length;
            return (
              <div key={e.id} className="rounded-lg border border-black/10 dark:border-white/10 p-3">
                <p className="font-semibold">{e.nome}</p>
                <p className="text-xs text-black/50 dark:text-white/50 mt-0.5 min-h-[3em]">{e.descricao}</p>
                <p className="mt-2 text-xl font-semibold tabular-nums">{usd(patrimonio)}</p>
                <p className={`text-sm tabular-nums ${tom(ret)}`}>{pct(ret)}</p>
                <p className="text-xs text-black/50 dark:text-white/50 mt-1 tabular-nums">
                  queda máx {pct(e.quedaMaxima)} · {compradas} comprada{compradas === 1 ? "" : "s"},{" "}
                  {e.abertas.length - compradas} vendida{e.abertas.length - compradas === 1 ? "" : "s"}
                  {manip > 0 && <> · {manip} em manipulada{manip === 1 ? "" : "s"}</>}
                </p>
                <p className="text-xs text-black/50 dark:text-white/50 tabular-nums">
                  {e.fechadas.length} encerrada{e.fechadas.length === 1 ? "" : "s"}
                  {e.fechadas.length > 0 && <> · {acertos} no positivo</>}
                  {e.diasPerdidos > 0 && <> · {e.diasPerdidos} dia(s) sem retrato</>}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {/* Com poucas horas a curva ao vivo é uma reta de centavos em volta de mil
          dólares; a partir de doze horas ela começa a ter o que mostrar. */}
      {seriesVivo.some((s) => s.pontos.length >= 2 && s.pontos[s.pontos.length - 1].t - s.pontos[0].t >= 12 * 3_600_000) && (
        <div className="mt-5">
          <CurvaRobos series={seriesVivo} capital={CAPITAL_ROBO} titulo="Ao vivo · patrimônio de cada robô" />
        </div>
      )}

      {medidos.length > 0 && (
        <div className="mt-6">
          <CurvaRobos
            series={seriesMedidas}
            capital={CAPITAL_ROBO}
            titulo="Medido · as regras de hoje desde 01/2024, com o custo da vida real (escala log)"
            log
            corte={corte ? { t: corte, rotulo: "fora da amostra →" } : undefined}
          />
          <div className="overflow-x-auto mt-3">
            <table className="w-full text-xs tabular-nums">
              <thead className="text-black/40 dark:text-white/40">
                <tr className="text-left">
                  <th className="py-1 pr-3 font-normal">robô</th>
                  <th className="py-1 pr-3 font-normal text-right">01/2024–09/2026</th>
                  <th className="py-1 pr-3 font-normal text-right">dentro (até 06/2025)</th>
                  <th className="py-1 pr-3 font-normal text-right">fora (07/2025 →)</th>
                  <th className="py-1 pr-3 font-normal text-right">queda máx</th>
                  <th className="py-1 pr-3 font-normal text-right">Sharpe</th>
                  <th className="py-1 pr-3 font-normal text-right">sem a melhor moeda</th>
                  <th className="py-1 font-normal text-right">sem as 5 melhores: inteira · fora</th>
                </tr>
              </thead>
              <tbody>
                {medidos.map((m) => (
                  <LinhaMedicao key={m.id} m={m} nome={robos.find((e) => e.id === m.id)?.nome ?? m.id} />
                ))}
                {anterior && <LinhaMedicao m={anterior} nome="Momento até 08/10" referencia />}
              </tbody>
            </table>
          </div>
          {momento && anterior && (
            <p className="text-xs text-black/50 dark:text-white/50 mt-2">
              <strong>O que mudou em 08/10, e o que isso não prova.</strong> A compra passou a olhar 45 dias em vez
              de 30 — de 35 a 55 dias, toda janela ganha da de 30 fora da amostra — e a posição que anda +40% ganha
              uma segunda parcela do mesmo tamanho.
              {momento.piramide && (
                <>
                  {" "}
                  Ela entrou em {momento.piramide.comParcela.toLocaleString("pt-BR")} de{" "}
                  {momento.piramide.compras.toLocaleString("pt-BR")} compras, e foram essas que
                  fizeram o lucro da perna: {usd(momento.piramide.resultadoCom, 0)}, enquanto as outras{" "}
                  {(momento.piramide.compras - momento.piramide.comParcela).toLocaleString("pt-BR")}{" "}
                  {momento.piramide.resultadoSem < 0
                    ? `perderam ${usd(-momento.piramide.resultadoSem, 0)}`
                    : `fizeram ${usd(momento.piramide.resultadoSem, 0)}`}
                  .
                </>
              )}{" "}
              No mesmo modelo e na mesma queda máxima (3% por posição contra os 4% de antes), a janela inteira vai de{" "}
              {pct(anterior.linhas[0].retorno, 0)} para <strong>{pct(momento.linhas[0].retorno, 0)}</strong>
              {anterior.semAs5 && momento.semAs5 && (
                <>
                  , e sem as cinco melhores moedas o fora da amostra vai de {pct(anterior.semAs5.retornos[2], 0)} para{" "}
                  {pct(momento.semAs5.retornos[2], 0)}
                </>
              )}
              . <strong>Mas dentro da amostra, no mesmo risco, a regra nova rende menos</strong>:{" "}
              {pct(momento.linhas[1].retorno, 0)} contra {pct(anterior.linhas[1].retorno, 0)}. A melhora é quase toda
              de 07/2025 em diante, quando as altas destas moedas passaram a durar meses.
            </p>
          )}
          {real && (
            <p className="text-xs text-black/50 dark:text-white/50 mt-2">
              <strong>O que a medição cobra da vida real.</strong> O stop não sai no nível: medido em velas de 1
              minuto, o preço passa dele dentro do minuto do disparo, e cada saída paga {fracao(real.escorregadaStop)}{" "}
              do resto da vela além do nível (~0,3% em média). A entrada paga {fracao(real.custoAtraso)} pelo atraso
              até o primeiro retrato depois da
              meia-noite, e ordem abaixo de {usd(real.nocionalMinimo, 0)} é recusada, como na Binance. A segunda
              parcela sai acima do gatilho pela mesma escorregada, e o stop sobe para dentro da nova liquidação — sem
              isso a corretora fecharia a posição inteira antes dele. Taxa, escorregada pela liquidez, financiamento
              real e as moedas deslistadas já estavam na conta.
            </p>
          )}
          <p className="text-xs text-black/50 dark:text-white/50 mt-2">
            É o formato de todo seguidor de tendência — perde pouco quase sempre e ganha muito de vez em quando —, e
            a tese só segue de pé enquanto aparecerem monstras
            {momento?.semAs5 && (
              <>
                : tiradas as cinco que mais deram ({momento.semAs5.symbols.map((s) => s.replace(/USDT$/, "")).join(", ")}),
                o Momento vai de {pct(momento.linhas[0].retorno, 0)} para {pct(momento.semAs5.retornos[0], 0)}
              </>
            )}
            . O Caça-monstra é a tese pura, e perdeu o primeiro ano e meio inteiro. Mais tamanho rende mais e cai
            mais: a partir de 4,5% por posição o caixa começa a recusar entrada e a queda máxima passa de 50%.{" "}
            {medicao && (
              <>
                Medição de {new Date(medicao.geradoEm).toISOString().slice(0, 10)}, {medicao.universo.moedas} moedas:{" "}
                <code className="text-[11px]">npm run medir-robos</code>.
              </>
            )}
          </p>
        </div>
      )}

      {robos.length > 0 && (
        <div className="mt-5 flex flex-col gap-2">
          {robos.map((e) => (
            <details key={e.id} className="rounded-lg border border-black/10 dark:border-white/10 px-3 py-2">
              <summary className="cursor-pointer text-sm">
                {e.nome} · {e.abertas.length} posiç{e.abertas.length === 1 ? "ão" : "ões"} aberta{e.abertas.length === 1 ? "" : "s"}
                {e.fechadas.length > 0 && <> · últimas encerradas</>}
              </summary>
              <div className="mt-2">
                <Posicoes e={e} vivo={vivo.moedas} />
                {e.fechadas.length > 0 && (
                  <ul className="mt-3 text-xs tabular-nums text-black/60 dark:text-white/60">
                    {e.fechadas.slice(0, 10).map((t) => (
                      <li key={`${t.symbol}-${t.abertaEm}`} className="py-0.5">
                        {dataHora(t.fechadaEm)} · {t.symbol.replace(/USDT$/, "")} {t.lado === "long" ? "comprado" : "vendido"} ·{" "}
                        {MOTIVO[t.motivo] ?? t.motivo} · <span className={tom(t.resultado)}>{usd(t.resultado)}</span>
                        {t.funding !== 0 && <> · financiamento {usd(-t.funding)}</>} · {((t.fechadaEm - t.abertaEm) / DIA).toFixed(1)} d
                        {(t.parcelas ?? 1) > 1 && <> · {t.parcelas} parcelas</>}
                        {t.manipulada && " · manipulada"}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}
