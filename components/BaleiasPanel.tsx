/**
 * AS BALEIAS DA HYPERLIQUID, na tela: onde as contas grandes estão agora e o
 * que a medição disse sobre segui-las (`lib/hyperliquid.ts`,
 * `docs/preregistro-baleias.md`).
 *
 * AS CORES DO CONSENSO são o par divergente da skill `dataviz`, azul (comprado)
 * e vermelho (vendido), e não o verde e vermelho do resto do site: validados
 * contra o branco e o zinc-900 dos cartões, o par verde/vermelho do site reprova
 * na separação para daltonismo (ΔE 4,6 na deuteranopia, no claro) e o
 * azul/vermelho passa nos dois modos (21,6 e 19,2). A barra também diz o lado
 * pela POSIÇÃO — à direita do centro é comprado — e o número vai com sinal, para
 * a cor nunca carregar a leitura sozinha.
 */

import Link from "next/link";
import type { ArquivoBaleias, LeituraDaMoeda, LeituraDosMarketMakers, MedicaoBaleias, SinalMedido } from "@/lib/hyperliquid";
import { MARKET_MAKERS } from "@/lib/marketmakers";
import { dataHora, pct, tom } from "@/components/robosFormato";

/** As duas cores, como variáveis: o claro e o escuro trocam num lugar só. */
const CORES = "[--comprado:#2a78d6] [--vendido:#e34948] dark:[--comprado:#3987e5] dark:[--vendido:#e66767]";

function dolares(v: number): string {
  const a = Math.abs(v);
  const s = v < 0 ? "−" : "";
  if (a >= 1e9) return `${s}US$ ${(a / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} bi`;
  if (a >= 1e6) return `${s}US$ ${(a / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1e3) return `${s}US$ ${(a / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return `${s}US$ ${a.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
}

/** Preço com 5 algarismos significativos: 74.873 e 0,0045123 na mesma régua. */
function preco(v: number): string {
  return v.toLocaleString("pt-BR", { maximumSignificantDigits: 5 });
}

function consensoTexto(v: number | null): string {
  if (v === null) return "—";
  const x = Math.round(v * 100) / 100;
  return `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`;
}

/** A barra do consenso: o centro é o empate, à direita comprado, à esquerda vendido. */
function BarraConsenso({ m }: { m: LeituraDaMoeda }) {
  const k = m.consenso;
  const titulo = `comprado ${dolares(m.comprado)} · vendido ${dolares(m.vendido)} · consenso ${consensoTexto(k)}`;
  return (
    <span className="inline-flex items-center gap-2" title={titulo}>
      <span className="relative inline-block h-1.5 w-20 rounded-full bg-black/5 dark:bg-white/10" aria-hidden>
        <span className="absolute left-1/2 top-[-3px] h-3 w-px bg-black/25 dark:bg-white/25" />
        {k !== null && k > 0 && <span className="absolute left-1/2 top-0 h-1.5 rounded-r bg-[var(--comprado)]" style={{ width: `${k * 50}%` }} />}
        {k !== null && k < 0 && <span className="absolute right-1/2 top-0 h-1.5 rounded-l bg-[var(--vendido)]" style={{ width: `${-k * 50}%` }} />}
      </span>
      <span className="w-10 text-right">{consensoTexto(k)}</span>
    </span>
  );
}

const VAZIO = <span className="text-black/30 dark:text-white/30">—</span>;
const SEGUNDA = "block text-black/40 dark:text-white/40";

/** O custo médio e, embaixo, quanto o preço de agora anda a favor da baleia (+) ou contra (−). */
function custo(c: number | null, p: number, lado: 1 | -1): React.ReactNode {
  if (c === null || !(c > 0)) return VAZIO;
  const d = lado * (p / c - 1);
  return (
    <>
      {preco(c)}
      <span className={`block ${tom(d) || "text-black/40 dark:text-white/40"}`}>{pct(d)}</span>
    </>
  );
}

/** O dinheiro de um lado e, embaixo, quantas contas: lado sem baleia é traço, não "US$ 0 · 0 contas". */
function lado(nocional: number, contas: number): React.ReactNode {
  if (contas === 0) return VAZIO;
  return (
    <>
      {dolares(nocional)}
      <span className={SEGUNDA}>{contas === 1 ? "1 conta" : `${contas} contas`}</span>
    </>
  );
}

function faixa(f: LeituraDaMoeda["liquidacoesAbaixo"][number] | undefined): React.ReactNode {
  if (!f) return VAZIO;
  return (
    <>
      {pct(f.distancia, 0)}
      <span className={SEGUNDA}>{dolares(f.nocional)}</span>
    </>
  );
}

export function BaleiasAgora({ b }: { b: ArquivoBaleias }) {
  const moedas = b.moedas.slice(0, 40);
  const total = b.moedas.reduce((s, m) => s + m.comprado + m.vendido, 0);
  return (
    <section className={`rounded-xl border border-black/10 dark:border-white/10 p-5 ${CORES}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-lg">Onde as baleias estão</h2>
        {/* Carimbo absoluto, como o resto do site: a página é servida de cache. */}
        <span className="text-xs text-black/40 dark:text-white/40 tabular-nums">
          lido em {dataHora(b.geradoEm)} UTC · {b.lidas.toLocaleString("pt-BR")} contas lidas, {b.comPosicao.toLocaleString("pt-BR")} com posição
          {b.semLeitura > 0 ? ` · ${b.semLeitura} sem leitura` : ""}
          {b.fluxoDesde ? ` · fluxo desde ${dataHora(b.fluxoDesde)}` : ""}
        </span>
      </div>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1.5 max-w-4xl">
        As posições de US$ 50 mil ou mais das contas com US$ 5 milhões ou mais de patrimônio na Hyperliquid:{" "}
        {dolares(total)} em {b.moedas.length} moedas. Os market makers ficam fora
        {b.marketMakers !== undefined ? ` (${b.marketMakers} contas)` : ""} — quem faz mais de 300 execuções por dia segura
        estoque, não opinião
        {b.semClasse ? `, e ${b.semClasse} contas ainda sem classificação também` : ""}. As {moedas.length} moedas com mais
        dinheiro de baleia, da maior para a menor.
      </p>
      <div className="mt-3 flex flex-wrap gap-4 text-xs text-black/55 dark:text-white/55">
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-3 rounded-sm bg-[var(--comprado)]" /> comprado (à direita do centro)
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="inline-block h-1.5 w-3 rounded-sm bg-[var(--vendido)]" /> vendido (à esquerda)
        </span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[60rem] whitespace-nowrap text-xs tabular-nums">
          <thead className="text-black/40 dark:text-white/40">
            <tr className="text-left align-bottom">
              <th className="py-1 pr-3 font-normal">moeda · preço</th>
              <th className="py-1 pr-3 font-normal text-right">comprado</th>
              <th className="py-1 pr-3 font-normal text-right">vendido</th>
              <th className="py-1 pr-3 font-normal">consenso</th>
              <th className="py-1 pr-3 font-normal text-right" title="O consenso só das contas com lucro no mês">espertas</th>
              <th
                className="py-1 pr-3 font-normal text-right"
                title="Quanto o líquido das baleias mudou desde a leitura anterior — só as contas lidas nas duas e ao preço de agora: compra e venda, não o preço andando —, sobre o total delas agora"
              >
                fluxo
              </th>
              <th className="py-1 pr-3 font-normal text-right" title="Preço médio de entrada das compradas e, embaixo, quanto o preço anda a favor (+) ou contra (−) elas">
                custo das
                <br />
                compradas
              </th>
              <th className="py-1 pr-3 font-normal text-right" title="Preço médio de entrada das vendidas e quanto o preço anda a favor (+) ou contra (−) elas">
                custo das
                <br />
                vendidas
              </th>
              <th className="py-1 pr-3 font-normal text-right">
                lucro aberto
                <br />
                compradas · vendidas
              </th>
              <th className="py-1 pr-3 font-normal text-right" title="A faixa de 2% abaixo do preço onde mais compradas seriam liquidadas — venda forçada se o preço chegar lá">
                liquidação
                <br />
                abaixo
              </th>
              <th className="py-1 font-normal text-right" title="A faixa de 2% acima do preço onde mais vendidas seriam liquidadas — compra forçada">
                liquidação
                <br />
                acima
              </th>
            </tr>
          </thead>
          <tbody>
            {moedas.map((m) => (
              <tr key={m.moeda} className="border-t border-black/5 dark:border-white/5 align-top">
                <td className="py-1.5 pr-3">
                  <span className="font-medium">{m.moeda}</span>{" "}
                  <span className="text-black/35 dark:text-white/35">{m.symbol && m.symbol !== `${m.moeda}USDT` ? m.symbol : m.symbol ? "" : "só na HL"}</span>
                  <span className={SEGUNDA}>{preco(m.preco)}</span>
                </td>
                <td className="py-1.5 pr-3 text-right">{lado(m.comprado, m.compradas)}</td>
                <td className="py-1.5 pr-3 text-right">{lado(m.vendido, m.vendidas)}</td>
                <td className="py-1.5 pr-3">
                  <BarraConsenso m={m} />
                </td>
                <td className="py-1.5 pr-3 text-right">{consensoTexto(m.consensoEspertas)}</td>
                <td className="py-1.5 pr-3 text-right">{m.fluxo === null ? VAZIO : pct(m.fluxo)}</td>
                <td className="py-1.5 pr-3 text-right">{custo(m.custoComprado, m.preco, 1)}</td>
                <td className="py-1.5 pr-3 text-right">{custo(m.custoVendido, m.preco, -1)}</td>
                <td className="py-1.5 pr-3 text-right">
                  {m.compradas > 0 ? <span className={tom(m.lucroComprado)}>{dolares(m.lucroComprado)}</span> : VAZIO}
                  <span className={`block ${tom(m.lucroVendido)}`}>{m.vendidas > 0 ? dolares(m.lucroVendido) : VAZIO}</span>
                </td>
                <td className="py-1.5 pr-3 text-right">{faixa(m.liquidacoesAbaixo[0])}</td>
                <td className="py-1.5 text-right">{faixa(m.liquidacoesAcima[0])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-black/45 dark:text-white/45 max-w-4xl">
        Consenso: (comprado − vendido) ÷ (comprado + vendido), de −1 a +1, com pelo menos US$ 500 mil e 3 contas. Espertas:
        as contas com lucro no mês, pelo ranking público. Fluxo: quanto o líquido das mesmas contas mudou desde a leitura
        anterior, ao preço de agora — compra e venda de verdade, não o preço andando —, sobre o total delas.{" "}
        {b.fluxoDesde ? "" : "Ainda não há leitura anterior com as posições conta a conta: o fluxo aparece na próxima. "}
        Custo: o preço médio de entrada; embaixo, quanto o preço de agora já anda a favor (+) ou contra (−) elas. As faixas
        de liquidação são de 2% do preço, até 30% de distância: é onde a corretora fecharia as posições à força — o
        “suporte” e a “resistência” que as baleias criam.
      </p>
    </section>
  );
}

/** A barra do saldo do estoque dos market makers: a mesma régua do consenso, com outro nome. */
function BarraSaldo({ m }: { m: LeituraDosMarketMakers }) {
  const k = m.saldo;
  return (
    <span className="inline-flex items-center gap-2" title={`comprado ${dolares(m.comprado)} · vendido ${dolares(m.vendido)}`}>
      <span className="relative inline-block h-1.5 w-20 rounded-full bg-black/5 dark:bg-white/10" aria-hidden>
        <span className="absolute left-1/2 top-[-3px] h-3 w-px bg-black/25 dark:bg-white/25" />
        {k > 0 && <span className="absolute left-1/2 top-0 h-1.5 rounded-r bg-[var(--comprado)]" style={{ width: `${k * 50}%` }} />}
        {k < 0 && <span className="absolute right-1/2 top-0 h-1.5 rounded-l bg-[var(--vendido)]" style={{ width: `${-k * 50}%` }} />}
      </span>
      <span className="w-10 text-right">{consensoTexto(k)}</span>
    </span>
  );
}

/** Uma moeda do radar com saldo nas carteiras conhecidas de market maker, do retrato. */
export interface MarketMakerOnChain {
  symbol: string;
  /** Fração do supply. */
  fracao: number;
}

/**
 * OS MARKET MAKERS, os dois lados: na Hyperliquid (as contas que o critério das
 * execuções tira do consenso, somadas à parte) e on-chain (as carteiras de
 * Wintermute, DWF Labs, GSR e as outras de `lib/marketmakers.ts`, nas moedas do
 * radar). Pedido do usuário em 09/11. A tela diz o que a posição deles é —
 * estoque e proteção — antes dos números.
 */
export function MarketMakers({ b, onchain, retratoEm }: { b: ArquivoBaleias | null; onchain: MarketMakerOnChain[] | null; retratoEm: number | null }) {
  const hl = b?.doMercado ?? [];
  const total = hl.reduce((s, m) => s + m.comprado + m.vendido, 0);
  const vendido = hl.reduce((s, m) => s + m.vendido, 0);
  const firmas = [...new Set(MARKET_MAKERS.map((m) => m.firma))];
  return (
    <section className={`rounded-xl border border-black/10 dark:border-white/10 p-5 ${CORES}`}>
      <h2 className="font-semibold text-lg">Os market makers</h2>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1.5 max-w-4xl">
        Quem faz o livro compra de quem vende e vende para quem compra: a posição dele é estoque, e por isso fica fora do
        consenso das baleias. Aqui ela aparece pelo que é. Vendido no perpétuo, em boa parte, é a proteção de quem tem a
        moeda à vista ou faz arbitragem de financiamento — não aposta de queda. Nada disto tem vantagem medida.
      </p>

      <h3 className="font-medium mt-4">Na Hyperliquid</h3>
      {b && hl.length > 0 ? (
        <>
          <p className="text-xs text-black/50 dark:text-white/50 mt-1 max-w-4xl tabular-nums">
            {b.mmLidas} contas com mais de 300 execuções por dia, lidas em {dataHora(b.geradoEm)} UTC
            {b.mmSemLeitura ? ` (${b.mmSemLeitura} sem leitura)` : ""}: {dolares(total)} em posição, {Math.round((vendido / total) * 100)}%
            vendido. São anônimas — as carteiras on-chain das firmas abaixo não operam aqui pelo mesmo endereço (conferido em
            09/11), e o nome ao lado de uma conta é o que ela mesma escolheu no ranking.
          </p>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[44rem] whitespace-nowrap text-xs tabular-nums">
              <thead className="text-black/40 dark:text-white/40">
                <tr className="text-left">
                  <th className="py-1 pr-3 font-normal">moeda</th>
                  <th className="py-1 pr-3 font-normal text-right">comprado</th>
                  <th className="py-1 pr-3 font-normal text-right">vendido</th>
                  <th className="py-1 pr-3 font-normal">para onde o estoque pende</th>
                  <th className="py-1 font-normal">maiores contas</th>
                </tr>
              </thead>
              <tbody>
                {hl.slice(0, 20).map((m) => (
                  <tr key={m.moeda} className="border-t border-black/5 dark:border-white/5 align-top">
                    <td className="py-1.5 pr-3 font-medium">{m.moeda}</td>
                    <td className="py-1.5 pr-3 text-right">{lado(m.comprado, m.compradas)}</td>
                    <td className="py-1.5 pr-3 text-right">{lado(m.vendido, m.vendidas)}</td>
                    <td className="py-1.5 pr-3">
                      <BarraSaldo m={m} />
                    </td>
                    <td className="py-1.5 text-black/60 dark:text-white/60">
                      {m.maiores.map((x) => `${x.nome ? `“${x.nome}”` : `${x.conta.slice(0, 6)}…${x.conta.slice(-4)}`} ${dolares(x.nocional)}`).join(" · ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="text-xs text-black/50 dark:text-white/50 mt-1">A leitura dos market makers sai com a próxima rodada do coletor.</p>
      )}

      <h3 className="font-medium mt-5">On-chain, nas moedas do radar</h3>
      <p className="text-xs text-black/50 dark:text-white/50 mt-1 max-w-4xl">
        {MARKET_MAKERS.length} carteiras de {firmas.length} firmas — {firmas.join(", ")} —, conferidas on-chain em 09/11: uma
        publicada pela própria firma (a DWF Labs) e as outras pela etiqueta pública do Etherscan. Elas guardam pouco: o
        estoque de um market maker mora na corretora, e o que a cadeia mostra é o movimento — o monitor avisa quando uma
        firma recebe ou manda embora 0,05% do supply ou mais. A divisão por firma está na página de cada moeda.
      </p>
      {onchain === null ? (
        <p className="text-xs text-black/50 dark:text-white/50 mt-2">O saldo dos market makers entra no retrato a partir da próxima rodada do panorama.</p>
      ) : onchain.length === 0 ? (
        <p className="text-xs text-black/50 dark:text-white/50 mt-2">Nenhuma moeda do radar com saldo nessas carteiras no retrato de {retratoEm ? dataHora(retratoEm) : "agora"}.</p>
      ) : (
        <p className="text-sm mt-2 tabular-nums">
          {onchain.map((x, i) => (
            <span key={x.symbol}>
              {i > 0 ? " · " : ""}
              <Link href={`/radar/${x.symbol}`} className="hover:underline">
                {x.symbol.replace(/USDT$/, "")}
              </Link>{" "}
              <span className="text-black/50 dark:text-white/50">{(x.fracao * 100).toLocaleString("pt-BR", { maximumFractionDigits: 3 })}%</span>
            </span>
          ))}
        </p>
      )}
      <details className="mt-3 text-xs text-black/55 dark:text-white/55">
        <summary className="cursor-pointer">As {MARKET_MAKERS.length} carteiras e de onde vem cada uma</summary>
        <ul className="mt-2 space-y-0.5 font-mono">
          {MARKET_MAKERS.map((m) => (
            <li key={m.endereco}>
              {m.endereco} <span className="font-sans">· {m.rotulo} · {m.fonte === "oficial" ? "publicada pela firma" : "etiqueta do Etherscan"}</span>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/**
 * As baleias de UMA moeda, na página dela no Radar: a mesma leitura da aba, em
 * cartão. Nada quando a leitura não existe ou a moeda não negocia na
 * Hyperliquid; uma linha quando negocia e nenhuma baleia está nela — "não há
 * baleia" é leitura, e some se a tela não disser.
 */
export function BaleiasDaMoeda({ b, symbol }: { b: ArquivoBaleias; symbol: string }) {
  const m = b.moedas.find((x) => x.symbol === symbol);
  const naHL = Object.entries(b.pares ?? {}).find(([, s]) => s === symbol)?.[0];
  if (!m && !naHL) return null;
  const rodape = (
    <span className="text-xs text-black/40 dark:text-white/40 tabular-nums">
      lido em {dataHora(b.geradoEm)} UTC ·{" "}
      <Link href="/baleias" className="hover:underline">
        todas as moedas
      </Link>
    </span>
  );
  if (!m) {
    return (
      <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="font-semibold">Baleias da Hyperliquid</h3>
          {rodape}
        </div>
        <p className="text-sm text-black/60 dark:text-white/60 mt-1.5">
          Negocia lá como {naHL}, e nenhuma das {b.lidas.toLocaleString("pt-BR")} contas de US$ 5 milhões ou mais lidas
          tem posição de US$ 50 mil ou mais nela.
        </p>
      </section>
    );
  }
  const abaixo = m.liquidacoesAbaixo[0];
  const acima = m.liquidacoesAcima[0];
  return (
    <section className={`rounded-xl border border-black/10 dark:border-white/10 p-5 ${CORES}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Baleias da Hyperliquid{m.moeda !== symbol.replace(/USDT$/, "") ? ` (${m.moeda})` : ""}</h3>
        {rodape}
      </div>
      <div className="grid gap-4 sm:grid-cols-4 mt-3 text-sm tabular-nums">
        <div>
          <p className="text-black/50 dark:text-white/50">Consenso</p>
          <p className="text-lg font-semibold">
            <BarraConsenso m={m} />
          </p>
          <p className="text-xs text-black/40 dark:text-white/40">
            espertas {consensoTexto(m.consensoEspertas)} · fluxo {m.fluxo === null ? "—" : pct(m.fluxo)}
          </p>
        </div>
        <div>
          <p className="text-black/50 dark:text-white/50">Comprado · vendido</p>
          <p className="text-lg font-semibold">
            {dolares(m.comprado)} · {dolares(m.vendido)}
          </p>
          <p className="text-xs text-black/40 dark:text-white/40">
            {m.compradas} {m.compradas === 1 ? "conta" : "contas"} · {m.vendidas} {m.vendidas === 1 ? "conta" : "contas"}
          </p>
        </div>
        <div>
          <p className="text-black/50 dark:text-white/50">Custo médio</p>
          <p className="text-lg font-semibold">
            {m.custoComprado ? preco(m.custoComprado) : "—"} · {m.custoVendido ? preco(m.custoVendido) : "—"}
          </p>
          <p className="text-xs text-black/40 dark:text-white/40">das compradas · das vendidas, preço de lá {preco(m.preco)}</p>
        </div>
        <div>
          <p className="text-black/50 dark:text-white/50">Liquidações mais pesadas</p>
          {abaixo || acima ? (
            <>
              <p className="text-lg font-semibold">
                {abaixo ? pct(abaixo.distancia, 0) : "—"} · {acima ? pct(acima.distancia, 0) : "—"}
              </p>
              <p className="text-xs text-black/40 dark:text-white/40">
                {abaixo ? `${dolares(abaixo.nocional)} abaixo` : "nada abaixo"} · {acima ? `${dolares(acima.nocional)} acima` : "nada acima"}
              </p>
            </>
          ) : (
            <>
              <p className="text-lg font-semibold">nenhuma</p>
              <p className="text-xs text-black/40 dark:text-white/40">a até 30% do preço, de nenhum dos lados</p>
            </>
          )}
        </div>
      </div>
      <p className="text-xs text-black/40 dark:text-white/40 mt-3">
        Quem está posicionado e onde, não call: seguir as baleias ainda não tem vantagem medida. O teste foi escrito antes
        do dado e é lido com 90 dias de coleta{quandoSeLe(b.historicoDesde)}.
      </p>
    </section>
  );
}

const NOME_DO_SINAL: Record<string, string> = {
  consenso: "consenso das baleias",
  espertas: "consenso das espertas",
  fluxo: "fluxo das baleias (3 dias)",
  suporte: "suporte no custo das compras",
};

/**
 * Quando o juiz pode ser lido: 90 dias depois da primeira leitura diária gravada
 * (`historicoDesde`). Sem ela, a frase diz de onde a contagem parte em vez de
 * inventar uma data — o coletor só roda depois do merge no `main`.
 */
function quandoSeLe(desde: number | undefined): string {
  if (desde === undefined) return ", contados da primeira leitura diária que o coletor gravar";
  return `: a primeira foi gravada em ${dia(desde)}, então a partir de ${dia(desde + 90 * 86_400_000)}`;
}

/** A data com o ano: a janela do juiz atravessa a virada de 2026 para 2027. */
function dia(t: number): string {
  return new Date(t).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

function ic(v: number): string {
  return `${v >= 0 ? "+" : "−"}${Math.abs(v).toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}`;
}

export function BaleiasMedidas({ m }: { m: MedicaoBaleias }) {
  // O juiz é a coleta para frente (a segunda emenda do pré-registro); a reconstrução, quando rodada, fica atrás.
  const vivo = m.grupos.find((g) => g.id === "VIVO");
  const a = vivo ?? m.grupos.find((g) => g.id === "A");
  const b = vivo ? undefined : m.grupos.find((g) => g.id === "B");
  if (!a) return null;
  const sete = (g: typeof a, s: string): SinalMedido | undefined => g.sinais.find((x) => x.sinal === s && x.horizonte === 7);
  const algumPassa = m.vereditos.some((v) => v.passa);
  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-lg">Seguir as baleias funciona? O que foi medido</h2>
        <span className="text-xs text-black/40 dark:text-white/40 tabular-nums">
          {dia(m.janela.de)} a {dia(m.janela.ate)} · medido em {dataHora(m.geradoEm)} UTC
        </span>
      </div>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1.5 max-w-4xl">
        {vivo ? (
          <>
            Sobre a primeira leitura de cada dia desta aba, desde {dia(m.janela.de)}: as posições lidas direto, sem
            reconstrução e sem o viés do ranking.
          </>
        ) : (
          <>
            A posição de cada conta em cada dia passado foi reconstruída pelas execuções dela — cada uma traz a posição de
            antes —, para {a.contas.toLocaleString("pt-BR")} contas com US$ 1 bilhão ou mais de volume na vida, as que
            quebraram inclusive (mediana de {a.coberturaMediana} cobrindo cada dia; {m.contas.altaFrequencia} de alta
            frequência fora).
          </>
        )}{" "}
        Cada sinal contra o retorno de 7 dias da moeda MENOS a mediana de todas as moedas no dia, pelo critério escrito
        antes de baixar o dado (`docs/preregistro-baleias.md`): |t| ≥ 2,5 e o mesmo lado nas duas metades.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[46rem] whitespace-nowrap text-xs tabular-nums">
          <thead className="text-black/40 dark:text-white/40">
            <tr className="text-left">
              <th className="py-1 pr-3 font-normal">sinal, 7 dias</th>
              <th className="py-1 pr-3 font-normal text-right">correlação média</th>
              <th className="py-1 pr-3 font-normal text-right">t</th>
              <th className="py-1 pr-3 font-normal text-right">metades</th>
              <th className="py-1 pr-3 font-normal text-right">quinto de cima − de baixo</th>
              <th className="py-1 font-normal">veredito</th>
            </tr>
          </thead>
          <tbody>
            {(["consenso", "espertas", "fluxo"] as const).map((s) => {
              const x = sete(a, s);
              const v = m.vereditos.find((y) => y.sinal === s);
              return (
                <tr key={s} className="border-t border-black/5 dark:border-white/5">
                  <td className="py-1.5 pr-3">{NOME_DO_SINAL[s]}</td>
                  <td className="py-1.5 pr-3 text-right">{x ? ic(x.icMedio) : "—"}</td>
                  <td className="py-1.5 pr-3 text-right">{x ? x.t.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"}</td>
                  <td className="py-1.5 pr-3 text-right">{x ? `${ic(x.icMetades[0])} · ${ic(x.icMetades[1])}` : "—"}</td>
                  <td className="py-1.5 pr-3 text-right">{x ? `${pct(x.quintos, 2)} (${pct(x.quintosMetades[0], 2)} · ${pct(x.quintosMetades[1], 2)})` : "—"}</td>
                  <td className={`py-1.5 ${v?.passa ? "font-medium" : "text-black/50 dark:text-white/50"}`}>{v?.texto ?? "—"}</td>
                </tr>
              );
            })}
            <tr className="border-t border-black/5 dark:border-white/5">
              <td className="py-1.5 pr-3">{NOME_DO_SINAL.suporte}</td>
              <td className="py-1.5 pr-3 text-right" colSpan={2}>
                {a.suporte.eventos} eventos em {a.suporte.moedas} moedas, t {Number.isFinite(a.suporte.t) ? a.suporte.t.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : "—"}
              </td>
              <td className="py-1.5 pr-3 text-right">{`${pct(a.suporte.metades[0], 2)} · ${pct(a.suporte.metades[1], 2)}`}</td>
              <td className="py-1.5 pr-3 text-right">{Number.isFinite(a.suporte.media) ? `${pct(a.suporte.media, 2)} depois do toque` : "—"}</td>
              <td className={`py-1.5 ${m.vereditos.find((y) => y.sinal === "suporte")?.passa ? "font-medium" : "text-black/50 dark:text-white/50"}`}>
                {m.vereditos.find((y) => y.sinal === "suporte")?.texto ?? "—"}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-black/45 dark:text-white/45 max-w-4xl">
        {algumPassa
          ? "Passar aqui ainda não é regra: a reconstrução escolhe as contas pelo ranking de hoje, e o que passou vai para um pré-registro de robô com custo e stop, e para a coleta ao vivo, que é o juiz sem viés."
          : "Nenhum sinal passou: a leitura de cima é informação sobre quem está posicionado, não call."}{" "}
        {b && sete(b, "consenso")
          ? `As contas ricas de HOJE (${b.contas.toLocaleString("pt-BR")}), que o viés favorece, medem ${ic(sete(b, "consenso")!.icMedio)} no consenso — só para o registro.`
          : ""}{" "}
        {vivo ? "" : "A coleta ao vivo grava a primeira leitura de cada dia: é ela que vai dizer, sem o viés do ranking, se isto muda."}
      </p>
    </section>
  );
}

/**
 * Enquanto não há medição: o que se sabe, o que não, e quando se vai saber. A
 * leitura de cima é informação sem vantagem medida, e a tela diz isso antes dela.
 */
export function BaleiasSemMedicao({ desde }: { desde?: number }) {
  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
      <h2 className="font-semibold text-lg">Seguir as baleias funciona? Ainda não está medido</h2>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1.5 max-w-4xl">
        O critério foi escrito antes de qualquer dado (`docs/preregistro-baleias.md`): a correlação entre cada sinal e o
        retorno de 7 dias da moeda contra o mercado, com |t| ≥ 2,5 e o mesmo lado nas duas metades. Medir para trás pede
        reconstruir a posição de cada conta em cada dia pelas execuções dela — o método fecha, conferido conta a conta,
        mas as ~1.500 contas grandes pedem ~14 horas de download no teto da API da Hyperliquid. O juiz é a coleta desta
        aba, para frente: a primeira leitura de cada dia, sem reconstrução e sem o viés de escolher as contas pelo
        ranking de hoje. O teste é lido com 90 dias de leituras{quandoSeLe(desde)}.
      </p>
      <p className="mt-2 text-xs text-black/45 dark:text-white/45 max-w-4xl">
        Até lá, a leitura abaixo é informação sobre quem está posicionado e onde — não call. No resto do projeto, o
        posicionamento agregado dos maiores traders da Binance foi medido sem vantagem (+0,39 p.p. em 7 dias, p = 0,21), e
        suporte clássico também (+0,02 p.p.).
      </p>
    </section>
  );
}
