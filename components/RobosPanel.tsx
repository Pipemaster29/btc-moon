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
  ROBOS,
  TAXA,
  escalaDoTamanho,
  juntarCurvas,
  margemTotal,
  valorDaPosicao,
  type ArquivoRobos,
  type EstadoRobo,
  type Medicao,
  type MedicaoRobo,
  type PosicaoRobo,
} from "@/lib/robos";
import CurvaRobos, { type Ponto, type SerieRobo } from "./CurvaRobos";
import { useVivo } from "./vivo";

// A cor é do robô, não da posição na lista: robô novo não repinta os antigos.
const COR: Record<string, string> = {
  momento: "var(--robo-1)",
  turbo: "var(--robo-2)",
  "caca-monstra": "var(--robo-3)",
  fluxo: "var(--robo-4)",
  conjunta: "var(--robo-5)",
};
const corDe = (id: string) => COR[id] ?? "var(--robo-ctx)";
const CURTO: Record<string, string> = { momento: "Momento", turbo: "Turbo", "caca-monstra": "Caça", fluxo: "Fluxo", conjunta: "Conjunta" };
// O nome vem do estado ao vivo; robô medido que ainda não rodou (o primeiro
// retrato depois do deploy é que o cria) cai no nome das regras.
const nomeDe = (id: string, robos: readonly EstadoRobo[]) =>
  robos.find((e) => e.id === id)?.nome ?? ROBOS.find((r) => r.id === id)?.nome ?? id;

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
  posto: "caiu no ranking",
};

/** A posição marcada no preço vivo, quando há; senão no do retrato. */
function marcada(p: PosicaoRobo, vivo: Record<string, { preco: number }>): { preco: number; valor: number; vivo: boolean } {
  // O mesmo freio de lixo do motor: dez vezes não é mercado.
  const viva = (symbol: string, ultimo: number) => {
    const m = vivo[symbol.replace(/USDT$/, "")];
    return m && m.preco > 0 && m.preco / ultimo < 10 && ultimo / m.preco < 10 ? m.preco : null;
  };
  const precoVivo = viva(p.symbol, p.precoAtual);
  const preco = precoVivo ?? p.precoAtual;
  // A metade de hedge do par é marcada no preço vivo dela, quando há.
  const precoHedge = p.hedge ? (viva(p.hedge.symbol, p.hedge.precoAtual) ?? undefined) : undefined;
  return { preco, valor: valorDaPosicao(p, preco, precoHedge), vivo: precoVivo !== null };
}

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

/**
 * A linha da conta conjunta: medida em pontos diários, sem "sem a melhor
 * moeda" (cada metade tem a sua) — o "sem as 5" tira as cinco de cada robô.
 */
function LinhaConjunta({ c }: { c: NonNullable<Medicao["estudos"]>["conjunta"] }) {
  const [tudo, dentro, fora] = c.linhas;
  return (
    <tr className="border-t border-black/5 dark:border-white/5">
      <td className="py-1 pr-3">
        Conjunta<span className="ml-1.5 text-[10px] text-black/45 dark:text-white/45">(Momento + Fluxo, metade cada)</span>
      </td>
      <td className={`py-1 pr-3 text-right ${tom(tudo.retorno)}`}>{pct(tudo.retorno, 0)}</td>
      <td className={`py-1 pr-3 text-right ${tom(dentro.retorno)}`}>{pct(dentro.retorno, 0)}</td>
      <td className={`py-1 pr-3 text-right ${tom(fora.retorno)}`}>{pct(fora.retorno, 0)}</td>
      <td className="py-1 pr-3 text-right">{pct(tudo.quedaMaxima, 0)}*</td>
      <td className="py-1 pr-3 text-right">{tudo.sharpe.toFixed(2)}*</td>
      <td className="py-1 pr-3 text-right text-black/40 dark:text-white/40">—</td>
      <td className="py-1 text-right">
        <span className={tom(c.semAs5[0])}>{pct(c.semAs5[0], 0)}</span>
        {" · "}
        <span className={tom(c.semAs5[2])}>{pct(c.semAs5[2], 0)}</span>
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

  const seriesVivo: SerieRobo[] = marcados.map(({ e, patrimonio }) => ({
    id: e.id,
    rotulo: e.nome,
    curto: CURTO[e.id] ?? e.nome,
    cor: corDe(e.id),
    pontos: vivo.em === null ? e.curva : [...e.curva, { t: Math.max(vivo.em, e.atualizadoEm), patrimonio }],
  }));
  // A conta conjunta ao vivo: as curvas do Momento e do Fluxo numa conta só,
  // como a medição a desenha. É conta no papel sobre os dois robôs, não um
  // quinto robô, e por isso não tem cartão nem posições.
  const conj = medicao?.estudos?.conjunta;
  if (conj) {
    const [sa, sb] = conj.ids.map((id) => seriesVivo.find((x) => x.id === id));
    const pontos = sa && sb ? juntarCurvas(sa.pontos, sb.pontos, conj.peso) : [];
    if (pontos.length >= 2) {
      seriesVivo.push({ id: "conjunta", rotulo: "Conjunta: Momento + Fluxo, metade cada, desde que os dois existem", curto: "Conjunta", cor: corDe("conjunta"), pontos });
    }
  }
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
  // A regra anterior do Momento, medida no MESMO modelo realista: é contra ela
  // que a melhora se lê, e ela entra em cinza, como contexto.
  const anterior = medicao?.referencias?.find((m) => m.id === "momento-anterior");
  const seriesMedidas: SerieRobo[] = medidos.map((m) => {
    const nome = nomeDe(m.id, robos);
    return { id: m.id, rotulo: nome, curto: CURTO[m.id] ?? nome, cor: corDe(m.id), pontos: m.curva };
  });
  if (conj) {
    seriesMedidas.push({
      id: "conjunta",
      rotulo: "Conjunta: Momento + Fluxo, metade cada, rebalanceada todo mês",
      curto: "Conjunta",
      cor: corDe("conjunta"),
      pontos: conj.curva,
    });
  }
  if (anterior) {
    seriesMedidas.push({
      id: anterior.id,
      rotulo: "Momento anterior (sem saída por posto nem alvo de volatilidade, 3%)",
      curto: "Antes",
      cor: "var(--robo-ctx)",
      contexto: true,
      pontos: anterior.curva,
    });
  }
  const corte = medidos[0]?.linhas.find((l) => l.janela.startsWith("fora"))?.de;
  const momento = medidos.find((m) => m.id === "momento");
  const fluxo = medidos.find((m) => m.id === "fluxo");
  // Quanto do resultado sobra sem as cinco moedas que mais deram: é a medida de concentração.
  const sobra = (m: MedicaoRobo | undefined) => (m?.semAs5 && m.linhas[0].retorno > 0 ? m.semAs5.retornos[0] / m.linhas[0].retorno : null);
  const real = medicao?.realismo;
  // O livro de ofertas lido em cada entrada ao vivo (`scripts/robos.mts`), contra a régua do motor.
  const lidas = robos.flatMap((e) => [
    ...e.abertas.filter((p) => p.livro !== undefined).map((p) => ({ livro: p.livro as number, regua: p.custoLado - TAXA })),
    ...e.fechadas.filter((t) => t.livro !== undefined && t.custoLado !== undefined).map((t) => ({ livro: t.livro as number, regua: (t.custoLado as number) - TAXA })),
  ]);
  const mediana = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

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
        anda +40%, o robô dobra a aposta; quando ela deixa as 10 que mais sobem, ele sai. Juntas, as duas pernas se
        protegem. O <strong>Fluxo</strong> é outro livro: lê quem está vendendo a mercado e vende essas moedas contra
        ETH. Não é recomendação: é a medição continuando ao vivo.
      </p>

      {robos.length === 0 ? (
        <p className="text-sm text-black/45 dark:text-white/45 mt-4">
          Os robôs ainda não rodaram — o primeiro retrato do workflow depois do deploy abre as primeiras posições.
        </p>
      ) : (
        <div className="grid gap-3 mt-4 sm:grid-cols-2 lg:grid-cols-4">
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
                  <LinhaMedicao key={m.id} m={m} nome={nomeDe(m.id, robos)} />
                ))}
                {conj && <LinhaConjunta c={conj} />}
                {anterior && <LinhaMedicao m={anterior} nome="Momento anterior" referencia />}
              </tbody>
            </table>
          </div>
          {momento && anterior && (
            <p className="text-xs text-black/50 dark:text-white/50 mt-2">
              <strong>O que mudou, e o que isso não prova.</strong> A compra agora SAI no dia em que a moeda deixa as
              10 que mais subiram em 45 dias — de 5 a 40, toda régua ganha de não sair —, e o tamanho de cada entrada
              segue a agitação do próprio patrimônio nos últimos 40 dias: menor na agitação, até 2x na calmaria. No
              mesmo modelo e na mesma queda máxima (4% por posição contra os 3% de antes), a janela inteira vai de{" "}
              {pct(anterior.linhas[0].retorno, 0)} para <strong>{pct(momento.linhas[0].retorno, 0)}</strong>, o dentro
              da amostra de {pct(anterior.linhas[1].retorno, 0)} para {pct(momento.linhas[1].retorno, 0)} e o fora de{" "}
              {pct(anterior.linhas[2].retorno, 0)} para {pct(momento.linhas[2].retorno, 0)}
              {anterior.semAs5 && momento.semAs5 && (
                <>
                  ; sem as cinco melhores moedas, o fora vai de {pct(anterior.semAs5.retornos[2], 0)} para{" "}
                  {pct(momento.semAs5.retornos[2], 0)}
                </>
              )}
              . Atacada com custo de entrada 4x, escorregada do stop dobrada e entrada 1 h atrasada, continua acima da
              anterior nas três janelas. <strong>O que não muda</strong>: o lucro mora na cauda.
              {momento.piramide && (
                <>
                  {" "}
                  A segunda parcela entrou em {momento.piramide.comParcela.toLocaleString("pt-BR")} de{" "}
                  {momento.piramide.compras.toLocaleString("pt-BR")} compras, e foram essas que fizeram o lucro da
                  perna: {usd(momento.piramide.resultadoCom, 0)}, enquanto as outras{" "}
                  {(momento.piramide.compras - momento.piramide.comParcela).toLocaleString("pt-BR")}{" "}
                  {momento.piramide.resultadoSem < 0
                    ? `perderam ${usd(-momento.piramide.resultadoSem, 0)}`
                    : `fizeram ${usd(momento.piramide.resultadoSem, 0)}`}
                  .
                </>
              )}
            </p>
          )}
          {fluxo && momento && (
            <p className="text-xs text-black/50 dark:text-white/50 mt-2">
              <strong>O Fluxo, e por que ele está aqui.</strong> Saiu de uma rodada de livros diferentes do momento,
              medidos do mesmo jeito — e quase todos reprovaram: coletar o financiamento na hora da cobrança (desde
              07/2025 o preço cai o que a cobrança paga), carry, reversão curta, loteria, vender listagem nova. O que
              passou foi o FLUXO: a moeda em que a venda a mercado dominou os últimos 7 dias continua indo pior que o
              resto. Vendida contra uma compra de ETH do mesmo tamanho, a aposta deixa de ser no mercado e passa a ser
              nela: {pct(fluxo.linhas[0].retorno, 0)} na janela inteira, {pct(fluxo.linhas[1].retorno, 0)} dentro e{" "}
              {pct(fluxo.linhas[2].retorno, 0)} fora, Sharpe {fluxo.linhas[0].sharpe.toFixed(2)} contra{" "}
              {momento.linhas[0].sharpe.toFixed(2)} do Momento. <strong>Rende menos, e o lucro dele não mora em cinco moedas</strong>:
              {sobra(fluxo) !== null && sobra(momento) !== null && (
                <>
                  {" "}
                  sem as cinco que mais deram, sobram {pct(sobra(fluxo) as number, 0).replace("+", "")} do lucro dele,
                  contra {pct(sobra(momento) as number, 0).replace("+", "")} no Momento
                </>
              )}
              . Se as monstras pararem de aparecer, o Momento seca; este não depende delas. Atacado com custo 4x,
              escorregada dobrada e entrada atrasada, e com cada peça mexida sozinha, ficou positivo em tudo.
            </p>
          )}
          {conj && momento && fluxo && (
            <p className="text-xs text-black/50 dark:text-white/50 mt-2">
              <strong>Os dois numa conta só.</strong> Momento e Fluxo andam por caminhos diferentes (correlação diária
              de {conj.correlacao.toFixed(2).replace(".", ",")}), e metade da conta em cada, rebalanceada todo mês, tem
              Sharpe maior que o de cada um nas três janelas: {conj.linhas.map((l) => l.sharpe.toFixed(2)).join(" · ")}{" "}
              contra {momento.linhas.map((l) => l.sharpe.toFixed(2)).join(" · ")} do Momento, e a queda máxima cai
              para {pct(conj.linhas[0].quedaMaxima, 0)}. Rende menos porque arrisca menos — o ganho é por unidade de
              risco, e de 30% a 70% no Momento toda divisão ganha dos dois sozinhos. Sem as cinco melhores de cada
              um, o fora fica em {pct(conj.semAs5[2], 0)}. * Pontos diários, como a correlação; a queda de hora em
              hora é um pouco maior. A curva ao vivo dela é a soma das dos dois robôs, não um quinto robô.
            </p>
          )}
          {medicao?.estudos?.walkForward && (() => {
            const w = medicao.estudos.walkForward;
            return (
              <p className="text-xs text-black/50 dark:text-white/50 mt-2">
                <strong>O &quot;fora da amostra&quot; do Momento tem futuro dentro.</strong> As peças dele foram escolhidas
                em 07 e 08/10 olhando as duas metades da janela, e entre {w.variantes} combinações delas (janela,
                pirâmide, saída por posto, alvo de volatilidade) a ordem de dentro prevê a de fora AO CONTRÁRIO:
                correlação de postos {w.correlacaoPostos.toFixed(2).replace(".", ",")}. Escolhendo a cada trimestre só com o que veio antes, de 07/2025 em diante o
                resultado é {pct(w.escolhido.retorno, 0)} (Sharpe {w.escolhido.sharpe.toFixed(2)}) contra{" "}
                {pct(w.publicado.retorno, 0)} ({w.publicado.sharpe.toFixed(2)}) da publicada — esse é o número honesto
                de fora. A família continua de pé: a mediana das variantes faz {pct(w.mediana.retorno, 0)} (Sharpe{" "}
                {w.mediana.sharpe.toFixed(2)}). O que só o ao vivo mede é o que vem daqui para frente.
              </p>
            );
          })()}
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
              {lidas.length > 0 ? (
                <>
                  {" "}
                  E o custo é conferido ao vivo: nas {lidas.length} entrada{lidas.length === 1 ? "" : "s"} em que o robô
                  leu o livro de ofertas, uma ordem a mercado do tamanho dela custaria{" "}
                  {fracao(mediana(lidas.map((x) => x.livro)))} por lado (mediana), contra{" "}
                  {fracao(mediana(lidas.map((x) => x.regua)))} que a régua cobra — sem a taxa nos dois.
                </>
              ) : (
                <>
                  {" "}
                  Num retrato do livro de ofertas de 08/10, a régua cobrava de 3 a 7 vezes o que uma ordem destas custaria;
                  ela só muda com amostra na hora da entrada, que cada entrada ao vivo passa a ler.
                </>
              )}
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
            . O Caça-monstra é a tese pura, e perdeu o primeiro ano e meio inteiro — nem a saída por posto nem o alvo
            de volatilidade passaram nele. Mais tamanho rende mais e cai mais, até o caixa acabar: acima dos 6% do
            turbo ele recusa entrada e o resultado piora.{" "}
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
                        {dataHora(t.fechadaEm)} · {t.symbol.replace(/USDT$/, "")} {t.lado === "long" ? "comprado" : "vendido"}
                        {t.hedge && <> + {t.hedge.symbol.replace(/USDT$/, "")} ({usd(t.hedge.resultado)} no hedge{t.hedge.liquidada ? ", liquidado" : ""})</>} ·{" "}
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
