import Link from "next/link";
import { notFound } from "next/navigation";
import CyclePanel from "@/components/CyclePanel";
import PositioningPanel from "@/components/PositioningPanel";
import { lerCiclo } from "@/lib/setup";
import { lerVida } from "@/lib/lifecycle";
import { lerEstudo, type Estudo } from "@/lib/estudo";
import { getPlacar, type Placar } from "@/lib/placar";
import { textoVeredito, veredito, vestingDe, type Veredito, type Vesting } from "@/lib/vesting";
import { getRadar, type AlertLevel, type RadarSnapshot } from "@/lib/radar";
import { getPositioning, type PositioningSnapshotView } from "@/lib/positioning";
import { WATCHLIST } from "@/lib/watchlist";

/**
 * O painel é leitura ao vivo da cadeia, então revalida de cinco em cinco
 * minutos: mais rápido que isso só castiga os nós públicos sem mostrar nada
 * novo — bloco leva segundos, mas saldo de baleia não muda a cada minuto.
 */
export const revalidate = 300;

export const metadata = {
  title: "BTC Moon · Radar de manipulação",
  description:
    "Quem segura o supply, quanto está travado e o que pode virar venda — lido direto da blockchain.",
};

/** Nome de exibição da rede — o identificador interno é minúsculo. */
const CHAIN_EXPLORER: Record<string, string> = {
  bsc: "https://bscscan.com",
  base: "https://basescan.org",
  ethereum: "https://etherscan.io",
};

const CHAIN_LABEL: Record<string, string> = {
  bsc: "BNB Chain",
  base: "Base",
  ethereum: "Ethereum",
  solana: "Solana",
};

const ROLE_COLOR: Record<string, string> = {
  lock: "bg-[#8B5CF6]",
  dormant: "bg-[#F0B90B]",
  exchange: "bg-[#0ECB81]",
  treasury: "bg-[#F6465D]",
  operational: "bg-[#3B82F6]",
  router: "bg-[#EC4899]",
  multisig: "bg-[#F97316]",
  unmapped: "bg-black/25 dark:bg-white/25",
};

const ALERT_STYLE: Record<AlertLevel, string> = {
  danger: "border-[#F6465D]/40 bg-[#F6465D]/5",
  warning: "border-[#F0B90B]/40 bg-[#F0B90B]/5",
  info: "border-black/10 dark:border-white/10",
};

const ALERT_MARK: Record<AlertLevel, string> = {
  danger: "▲",
  warning: "●",
  info: "○",
};

function units(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)} bi`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)} mi`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)} mil`;
  return v.toFixed(0);
}

function money(v: number): string {
  if (v >= 1e9) return `US$ ${(v / 1e9).toFixed(2)} bi`;
  if (v >= 1e6) return `US$ ${(v / 1e6).toFixed(1)} mi`;
  if (v >= 1e3) return `US$ ${(v / 1e3).toFixed(0)} mil`;
  return `US$ ${v.toFixed(0)}`;
}

function short(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** Uma fração do supply. Devolve travessão quando não há denominador — dividir
 *  por zero imprimia "NaN%" na tela. */
function pct(parte: number, todo: number): string {
  return todo > 0 ? `${((parte / todo) * 100).toFixed(2)}%` : "—";
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
      <p className="text-sm text-black/60 dark:text-white/60">{label}</p>
      <p className="text-2xl font-semibold mt-1 tabular-nums">{value}</p>
      {hint && <p className="text-xs text-black/40 dark:text-white/40 mt-1">{hint}</p>}
    </div>
  );
}

function SupplyBar({ snapshot }: { snapshot: RadarSnapshot }) {
  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
      <h2 className="font-semibold text-lg">Estrutura do supply</h2>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1">
        O market cap divulgado supõe que o supply circulante é vendável. Somando por
        papel dá para conferir essa suposição em vez de aceitá-la.
      </p>

      <div className="mt-4 flex h-3 w-full overflow-hidden rounded-full">
        {snapshot.supplyBreakdown
          .filter((slice) => slice.pct > 0)
          .map((slice) => (
            <div
              key={slice.role}
              className={ROLE_COLOR[slice.role]}
              style={{ width: `${slice.pct * 100}%` }}
              title={`${slice.label}: ${(slice.pct * 100).toFixed(2)}%`}
            />
          ))}
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm min-w-[34rem]">
          <thead className="text-black/50 dark:text-white/50">
            <tr className="text-left">
              <th className="font-normal pb-2">Papel</th>
              <th className="font-normal pb-2 text-right">Quantidade</th>
              <th className="font-normal pb-2 text-right">%</th>
              <th className="font-normal pb-2 text-right">Valor</th>
              <th className="font-normal pb-2 pl-4">O que significa</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.supplyBreakdown.map((slice) => (
              <tr key={slice.role} className="border-t border-black/5 dark:border-white/5">
                <td className="py-2">
                  <span className="inline-flex items-center gap-2">
                    <span className={`inline-block size-2 rounded-full ${ROLE_COLOR[slice.role]}`} />
                    {slice.label}
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums">{units(slice.amount)}</td>
                <td className="py-2 text-right tabular-nums">{(slice.pct * 100).toFixed(2)}%</td>
                <td className="py-2 text-right tabular-nums">{money(slice.valueUsd)}</td>
                <td className="py-2 pl-4 text-black/50 dark:text-white/50">{slice.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-sm mt-4 pt-4 border-t border-black/10 dark:border-white/10">
        <strong>Oferta destravada: {units(snapshot.sellable)}</strong> (
        {pct(snapshot.sellable, snapshot.supply)} ·{" "}
        {money(snapshot.sellable * snapshot.priceUsd)}) — é este o volume que o preço
        precisaria absorver, e não o supply.
      </p>
    </section>
  );
}

function Wallets({ snapshot }: { snapshot: RadarSnapshot }) {
  const sorted = [...snapshot.wallets].sort((a, b) => b.amount - a.amount);

  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
      <h2 className="font-semibold text-lg">Carteiras vigiadas</h2>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1">
        {snapshot.wallets.length} endereços cobrindo{" "}
        {pct(snapshot.mapped, snapshot.supply)} do supply. A coluna de gás é o que decide
        se o saldo pode virar venda hoje.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-sm min-w-[42rem]">
          <thead className="text-black/50 dark:text-white/50">
            <tr className="text-left">
              <th className="font-normal pb-2">Carteira</th>
              <th className="font-normal pb-2">Endereço</th>
              <th className="font-normal pb-2 text-right">Saldo</th>
              <th className="font-normal pb-2 text-right">Valor</th>
              <th className="font-normal pb-2 text-right">% supply</th>
              <th className="font-normal pb-2 text-right">{snapshot.gasSymbol}</th>
              <th className="font-normal pb-2 pl-3">Estado</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((wallet) => (
              <tr
                key={wallet.address}
                className="border-t border-black/5 dark:border-white/5"
              >
                <td className="py-2">
                  <span className="inline-flex items-center gap-2">
                    <span className={`inline-block size-2 rounded-full ${ROLE_COLOR[wallet.role]}`} />
                    {wallet.label}
                    {!wallet.verified && (
                      <span
                        className="text-[10px] text-black/40 dark:text-white/40"
                        title="Rótulo informado por terceiros, não conferido on-chain"
                      >
                        ?
                      </span>
                    )}
                  </span>
                </td>
                <td className="py-2 font-mono text-xs text-black/50 dark:text-white/50">
                  <a
                    href={`${snapshot.explorer}/address/${wallet.address}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:underline"
                  >
                    {short(wallet.address)}
                  </a>
                </td>
                <td className="py-2 text-right tabular-nums">{units(wallet.amount)}</td>
                <td className="py-2 text-right tabular-nums">{money(wallet.valueUsd)}</td>
                <td className="py-2 text-right tabular-nums">
                  {(wallet.pctSupply * 100).toFixed(3)}%
                </td>
                <td className="py-2 text-right tabular-nums text-black/50 dark:text-white/50">
                  {wallet.gas.toFixed(3)}
                </td>
                <td className="py-2 pl-3">
                  {wallet.armed ? (
                    <span className="text-[#F6465D] font-medium">armada</span>
                  ) : wallet.stuck ? (
                    <span className="text-black/40 dark:text-white/40">sem gás</span>
                  ) : wallet.role === "lock" ? (
                    <span className="text-[#8B5CF6]">travada</span>
                  ) : (
                    <span className="text-black/40 dark:text-white/40">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Transfers({ snapshot }: { snapshot: RadarSnapshot }) {
  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
      <h2 className="font-semibold text-lg">Movimentação recente</h2>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1">
        {snapshot.transfersScanned.toLocaleString("pt-BR")} transferências nas últimas{" "}
        {snapshot.windowHours.toFixed(1)}h. Os nós públicos só servem log recente, então
        esta é a janela inteira que existe sem chave paga.
      </p>

      {snapshot.bigTransfers.length === 0 ? (
        <p className="text-sm text-black/50 dark:text-white/50 mt-4">
          Nenhuma transferência grande perto do tamanho da pool no período.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2 text-sm">
          {snapshot.bigTransfers.map((t) => (
            <li
              key={`${t.block}-${t.from}-${t.to}-${t.amount}`}
              className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-black/5 dark:border-white/5 pt-2"
            >
              <span className="tabular-nums font-medium">{units(t.amount)}</span>
              <span className="tabular-nums text-black/50 dark:text-white/50">
                {money(t.valueUsd)}
              </span>
              <span className="text-black/70 dark:text-white/70">
                {t.fromLabel} <span className="text-black/30 dark:text-white/30">→</span>{" "}
                {t.toLabel}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

const PERFIL_TOM: Record<Estudo["perfil"], string> = {
  devolve: "text-[#C42B3E] dark:text-[#F6465D]",
  continua: "text-[#0a7d43] dark:text-[#0ECB81]",
  "sem memória": "text-black/45 dark:text-white/45",
};

/**
 * O que esta moeda faz, medido nela e não no grupo.
 *
 * Todo o resto do painel usa régua de conjunto — os estágios saíram de 12 mil
 * observações de 64 moedas juntas. Esta seção mede a moeda sozinha, e a barra de
 * significância é corrigida pelas oito defasagens testadas: sem isso, uma em
 * cada vinte passaria por acaso, e são oito por moeda vezes setenta moedas.
 */
function EstudoPanel({ estudo }: { estudo: Estudo }) {
  const maior = Math.max(...estudo.memoria.map((m) => Math.abs(m.r)), 0.05);

  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-lg">Estudo da moeda</h2>
        <span className="text-xs text-black/40 dark:text-white/40 tabular-nums">
          {estudo.dias} dias · {estudo.de} a {estudo.ate}
        </span>
      </div>

      <div className="grid gap-4 sm:grid-cols-4 mt-3 text-sm">
        <div>
          <p className="text-black/50 dark:text-white/50">Memória</p>
          <p className={`text-lg font-semibold ${PERFIL_TOM[estudo.perfil]}`}>{estudo.perfil}</p>
        </div>
        <div>
          <p className="text-black/50 dark:text-white/50">Volatilidade diária</p>
          <p className="text-lg font-semibold tabular-nums">
            {(estudo.volDiaria * 100).toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-black/50 dark:text-white/50" title="Janelas de 7 dias que subiram mais de 20%, sobre as que caíram mais de 20%">
            Assimetria da cauda
          </p>
          <p className="text-lg font-semibold tabular-nums">
            {Number.isFinite(estudo.assimetria) ? estudo.assimetria.toFixed(2) : "∞"}
          </p>
          <p className="text-xs text-black/40 dark:text-white/40 tabular-nums">
            +20% em {(estudo.sobe20 * 100).toFixed(1)}% · −20% em {(estudo.cai20 * 100).toFixed(1)}%
          </p>
        </div>
        <div>
          <p className="text-black/50 dark:text-white/50">Extremos de um dia</p>
          <p className="text-lg font-semibold tabular-nums">
            <span className="text-[#0a7d43] dark:text-[#0ECB81]">
              +{(estudo.maiorAlta * 100).toFixed(0)}%
            </span>{" "}
            <span className="text-[#C42B3E] dark:text-[#F6465D]">
              {(estudo.maiorQueda * 100).toFixed(0)}%
            </span>
          </p>
        </div>
      </div>

      {/* Autocorrelação por defasagem. A linha pontilhada é o corte já corrigido
          pelas oito tentativas — barra que não a cruza é ruído. */}
      <div className="mt-4">
        <p className="text-[10px] tracking-widest text-black/40 dark:text-white/40 uppercase">
          O retorno de hoje prevê o de daqui a N dias?
        </p>
        <div className="mt-2 flex items-end gap-1.5">
          {estudo.memoria.map((m) => {
            const passa = m.sigmas >= 2.73;
            const alturaPct = (Math.abs(m.r) / maior) * 100;
            return (
              <div key={m.lag} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full h-16 flex flex-col justify-end">
                  <div
                    className={`w-full rounded-t-[3px] ${
                      !passa
                        ? "bg-black/15 dark:bg-white/15"
                        : m.r < 0
                          ? "bg-[#C42B3E] dark:bg-[#F6465D]"
                          : "bg-[#0a7d43] dark:bg-[#0ECB81]"
                    }`}
                    style={{ height: `${Math.max(alturaPct, 3)}%` }}
                    title={`${m.lag} dia(s): r = ${m.r.toFixed(3)} · ${m.sigmas.toFixed(1)}σ em ${m.n} dias`}
                  />
                </div>
                <span className="text-[10px] text-black/40 dark:text-white/40 tabular-nums">
                  {m.lag}d
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <p className="text-xs text-black/55 dark:text-white/55 mt-3">{estudo.veredito}</p>
      <p className="text-xs text-black/40 dark:text-white/40 mt-2">
        Barra colorida é defasagem que passou de 2,73σ — o corte de 5% já dividido pelas
        oito testadas. Cinza é ruído. Vermelho significa que o movimento se INVERTE depois
        desse prazo; verde, que ele continua.
      </p>
    </section>
  );
}

/**
 * O placar do painel DENTRO desta moeda.
 *
 * O agregado esconde o que interessa para operar: um viés pode separar em cinco
 * moedas e inverter em outras cinco, e o total dá zero — que foi exatamente o
 * que aconteceu. Aqui a comparação é contra a mediana da própria moeda, e não
 * contra a do grupo, senão "o painel acertou" se mistura com "esta moeda andou
 * diferente das outras".
 */
const VEREDITO_TOM: Record<Veredito, string> = {
  emitindo: "text-[#C42B3E] dark:text-[#F6465D]",
  travado: "text-[#A97400] dark:text-[#F0B90B]",
  livre: "text-[#0a7d43] dark:text-[#0ECB81]",
  parcial: "text-black/50 dark:text-white/50",
  "sem histórico": "text-black/50 dark:text-white/50",
};

/**
 * A oferta que ainda vai chegar.
 *
 * O painel inteiro media quem SEGURA supply e chamava isso de munição intacta.
 * Faltava a pergunta seguinte: esse supply está parado ou está saindo? São
 * situações opostas para quem compra, e a diferença entre elas é uma reta sobre
 * sete leituras de saldo.
 */
function VestingPanel({ v, preco }: { v: Vesting; preco: number }) {
  const q = veredito(v);
  const serie = v.serie;
  const maior = Math.max(...serie.map((a) => a.travado), 0.01);
  const larg = 300;
  const alt = 72;
  const x = (i: number) => (serie.length < 2 ? 0 : (i / (serie.length - 1)) * larg);
  const y = (t: number) => alt - (t / maior) * (alt - 6);
  const linha = serie.map((a, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(a.travado).toFixed(1)}`).join(" ");
  const area = serie.length >= 2 ? `${linha} L${larg},${alt} L0,${alt} Z` : "";

  // Tokens por mês vezes preço: o que o comprador precisa absorver todo mês só
  // para o preço ficar parado.
  const porMes = (v.ritmo / 100) * v.supply;
  const dolarPorMes = porMes * preco;

  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-lg">Oferta que ainda vai chegar</h2>
        <span className="text-xs text-black/40 dark:text-white/40 tabular-nums">
          {serie.length} leituras · desde {serie[0]?.data ?? "—"}
        </span>
      </div>
      <p className={`text-sm mt-1 ${VEREDITO_TOM[q]}`}>{textoVeredito(v)}</p>

      <div className="grid gap-4 sm:grid-cols-4 mt-4 text-sm">
        <div>
          <p className="text-black/50 dark:text-white/50">Travado em contrato</p>
          <p className="text-lg font-semibold tabular-nums">{(v.travado * 100).toFixed(1)}%</p>
          <p className="text-xs text-black/40 dark:text-white/40 tabular-nums">
            {units(v.travado * v.supply)} tokens
          </p>
        </div>
        <div>
          <p className="text-black/50 dark:text-white/50" title="Pontos percentuais do supply que saem dos contratos por mês, por mínimos quadrados sobre a série">
            Ritmo de saída
          </p>
          <p className={`text-lg font-semibold tabular-nums ${v.ritmo >= 0.5 ? VEREDITO_TOM.emitindo : ""}`}>
            {v.ritmo.toFixed(2)} pp/mês
          </p>
          {preco > 0 && porMes > 0 && (
            <p className="text-xs text-black/40 dark:text-white/40 tabular-nums">
              {money(dolarPorMes)}/mês em oferta
            </p>
          )}
        </div>
        <div>
          <p className="text-black/50 dark:text-white/50">Já liberado na janela</p>
          <p className="text-lg font-semibold tabular-nums">{v.liberado.toFixed(1)} pp</p>
          <p className="text-xs text-black/40 dark:text-white/40 tabular-nums">
            {units((v.liberado / 100) * v.supply)} tokens
          </p>
        </div>
        <div>
          <p className="text-black/50 dark:text-white/50" title="Somado nas 17 carteiras de corretora conhecidas">
            Em corretora
          </p>
          <p className="text-lg font-semibold tabular-nums">{(v.emCorretora * 100).toFixed(1)}%</p>
          <p className="text-xs text-black/40 dark:text-white/40 tabular-nums">
            {units(v.emCorretora * v.supply)} tokens
          </p>
        </div>
      </div>

      {serie.length >= 2 && (
        <div className="mt-4">
          <p className="text-[10px] tracking-widest text-black/40 dark:text-white/40 uppercase">
            % do supply parado nos contratos de alocação
          </p>
          <svg
            viewBox={`0 0 ${larg} ${alt}`}
            preserveAspectRatio="none"
            className="w-full h-20 mt-2 overflow-visible"
            role="img"
            aria-label={`Supply travado caindo de ${(serie[0].travado * 100).toFixed(1)}% para ${(v.travado * 100).toFixed(1)}%`}
          >
            <path d={area} className="fill-[#A97400]/15 dark:fill-[#F0B90B]/15" />
            <path
              d={linha}
              fill="none"
              strokeWidth={2}
              vectorEffect="non-scaling-stroke"
              className="stroke-[#A97400] dark:stroke-[#F0B90B]"
            />
          </svg>
          <div className="flex justify-between text-xs text-black/40 dark:text-white/40 tabular-nums mt-1">
            <span>
              {serie[0].data} · {(serie[0].travado * 100).toFixed(1)}%
            </span>
            <span>
              {serie[serie.length - 1].data} · {(v.travado * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      )}

      {v.cofres.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm tabular-nums">
            <thead className="text-xs text-black/40 dark:text-white/40 text-left">
              <tr>
                <th className="font-normal py-1">contrato de alocação</th>
                <th className="font-normal py-1 text-right">recebeu</th>
                <th className="font-normal py-1 text-right">hoje</th>
                <th className="font-normal py-1 text-right">ritmo</th>
              </tr>
            </thead>
            <tbody>
              {v.cofres.map((c) => (
                <tr key={c.endereco} className="border-t border-black/5 dark:border-white/5">
                  <td className="py-1.5 font-mono text-xs">
                    <a
                      href={`${CHAIN_EXPLORER[v.chain] ?? ""}/address/${c.endereco}`}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:underline"
                    >
                      {short(c.endereco)}
                    </a>
                    {!c.contrato && (
                      <span className="ml-2 text-black/40 dark:text-white/40">carteira</span>
                    )}
                  </td>
                  <td className="py-1.5 text-right">{(c.recebeu * 100).toFixed(2)}%</td>
                  <td className="py-1.5 text-right">{(c.hoje * 100).toFixed(2)}%</td>
                  <td className={`py-1.5 text-right ${c.ritmo >= 0.5 ? VEREDITO_TOM.emitindo : ""}`}>
                    {c.hoje < 0.0001 ? "esvaziou" : `${c.ritmo.toFixed(2)} pp/mês`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-black/40 dark:text-white/40 mt-3">
        Cofre aqui é quem recebeu emissão direta do endereço zero. Supply que já saiu deles e foi
        parar numa carteira grande não aparece nesta conta.
      </p>
    </section>
  );
}

function PlacarDaMoeda({
  placar,
  meu,
  ticker,
}: {
  placar: Placar;
  meu: NonNullable<Placar["porMoeda"]>[string];
  ticker: string;
}) {
  const linhas = Object.entries(meu.vieses).sort((a, b) => b[1].delta - a[1].delta);

  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold text-lg">O painel acerta na {ticker}?</h2>
        <span className="text-xs text-black/40 dark:text-white/40 tabular-nums">
          {meu.n} emissões · {placar.horizonte}h à frente · {placar.janela.de.slice(0, 10)} a{" "}
          {placar.janela.ate.slice(0, 10)}
        </span>
      </div>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1">
        Cada viés que esteve na tela desta moeda, contra a mediana dela mesma no período
        ({(meu.refMoeda * 100).toFixed(2)}%). Positivo significa que o viés separou a favor
        da direção que ele recomendava.
      </p>

      <table className="w-full text-sm mt-3">
        <thead className="text-black/50 dark:text-white/50">
          <tr className="text-left">
            <th className="font-normal pb-2">Viés</th>
            <th className="font-normal pb-2 text-right">Emissões</th>
            <th className="font-normal pb-2 text-right">Separação</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {linhas.map(([v, d]) => (
            <tr key={v} className="border-t border-black/5 dark:border-white/5">
              <td className="py-2">{v}</td>
              <td className="py-2 text-right">{d.n}</td>
              <td
                className={`py-2 text-right font-medium ${
                  d.delta > 0
                    ? "text-[#0a7d43] dark:text-[#0ECB81]"
                    : "text-[#C42B3E] dark:text-[#F6465D]"
                }`}
              >
                {d.delta >= 0 ? "+" : "−"}
                {Math.abs(d.delta * 100).toFixed(2)} p.p.
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-xs text-black/40 dark:text-white/40 mt-3">
        Doze dias de emissões, e por moeda isso vira poucas dezenas por viés — números
        grandes aqui são ruído com decimal, não descoberta. Serve para saber onde olhar
        quando a amostra crescer, e a amostra cresce a cada execução do workflow.
      </p>
    </section>
  );
}

export default async function Page({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  // O on-chain só existe para quem tem contrato configurado; o perpétuo existe
  // para todos os símbolos da lista, inclusive os que não vivem na BSC.
  const { symbol } = await params;
  const alvo = symbol.toUpperCase();
  const token = WATCHLIST.find(
    (t) => t.symbol === alvo || t.symbol === `${alvo}USDT`,
  );
  if (!token) notFound();

  const [snapshot, perp] = await Promise.all([
    token.contract ? getRadar(token.symbol) : Promise.resolve(null),
    getPositioning(token.symbol),
  ]);

  const preco = snapshot?.priceUsd ?? perp?.price ?? 0;
  const [vida, estudo, placar, vesting] = await Promise.all([
    lerVida(token, preco).catch(() => null),
    lerEstudo(token.symbol),
    getPlacar(),
    vestingDe(token.symbol),
  ]);
  const meuPlacar = placar?.porMoeda?.[token.symbol] ?? null;

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black">
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-12 flex flex-col gap-8">
        <header className="flex flex-col gap-2">
          <Link
            href="/radar"
            className="text-sm text-black/50 dark:text-white/50 hover:underline w-fit"
          >
            ← todas as moedas
          </Link>
          <div className="flex flex-wrap items-baseline gap-3">
            <h1 className="text-3xl font-bold">{token.symbol.replace(/USDT$/, "")}</h1>
            {token.contract && (
              <a
                href={`${CHAIN_EXPLORER[token.chain] ?? ""}/token/${token.contract}`}
                target="_blank"
                rel="noreferrer"
                className="text-sm text-black/50 dark:text-white/50 font-mono hover:underline"
              >
                {short(token.contract)}
              </a>
            )}
            <span className="text-sm text-black/40 dark:text-white/40">
              {CHAIN_LABEL[token.chain] ?? token.chain}
            </span>
          </div>
          {token.note && (
            <p className="text-sm text-black/60 dark:text-white/60">{token.note}</p>
          )}
        </header>

        <CyclePanel leitura={lerCiclo(snapshot, perp?.live ?? null)} />

        {vesting && <VestingPanel v={vesting} preco={preco} />}
        {estudo && <EstudoPanel estudo={estudo} />}
        {meuPlacar && placar && (
          <PlacarDaMoeda placar={placar} meu={meuPlacar} ticker={token.symbol.replace(/USDT$/, "")} />
        )}

        {vida?.tecnica && (
          <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
            <h3 className="font-semibold">Estrutura de preço</h3>
            <div className="grid gap-4 sm:grid-cols-4 mt-3 text-sm">
              <div>
                <p className="text-black/50 dark:text-white/50">Resistência acima</p>
                <p className="text-lg font-semibold tabular-nums">
                  {vida.tecnica.resistencia
                    ? `US$ ${vida.tecnica.resistencia.toPrecision(4)}`
                    : "nenhuma"}
                </p>
                {vida.tecnica.ateResistencia !== null && (
                  <p className="text-xs text-black/40 dark:text-white/40">
                    +{(vida.tecnica.ateResistencia * 100).toFixed(1)}% daqui
                  </p>
                )}
              </div>
              <div>
                <p className="text-black/50 dark:text-white/50">Contra a média de 20</p>
                <p
                  className={`text-lg font-semibold tabular-nums ${
                    vida.tecnica.vsMedia20 > 0 ? "text-[#0ECB81]" : "text-[#F6465D]"
                  }`}
                >
                  {vida.tecnica.vsMedia20 >= 0 ? "+" : ""}
                  {(vida.tecnica.vsMedia20 * 100).toFixed(1)}%
                </p>
              </div>
              <div>
                <p className="text-black/50 dark:text-white/50">Topos descendentes</p>
                <p className="text-lg font-semibold tabular-nums">
                  {vida.tecnica.toposDescendentes}
                </p>
              </div>
              <div>
                <p className="text-black/50 dark:text-white/50">Tendência</p>
                <p className="text-lg font-semibold">
                  {vida.tecnica.rompeu
                    ? "rompeu a baixa"
                    : vida.tecnica.emBaixa
                      ? "de baixa"
                      : "sem baixa definida"}
                </p>
              </div>
            </div>
            <p className="text-xs text-black/40 dark:text-white/40 mt-3">
              Isto é contexto, não sinal, e a distinção foi medida. Rompimento de tendência
              de baixa deu 24 casos em 6.236 — raro demais. Afrouxando para &ldquo;fechou acima da
              máxima de 20 dias&rdquo;, a amostra subiu para 237 e o efeito apareceu invertido:
              −5,2 pontos percentuais em sete dias, ou seja, o rompimento falha. E com 10 de
              21 moedas concordando, que é cara ou coroa. O mais revelador: o giro de
              tendência de verdade — romper a máxima vindo de dez dias abaixo da média —
              aconteceu três vezes em 6.236. Estas moedas não revertem tendência; elas
              espetam e devolvem. Serve para saber onde há vendedor à frente, não para
              decidir se entra.
            </p>
          </section>
        )}

        {snapshot ? (
          <div className="flex flex-col gap-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label={snapshot.priceSource === "perpétuo" ? "Preço do perpétuo" : "Preço à vista"}
                value={snapshot.priceUsd > 0 ? `US$ ${snapshot.priceUsd.toPrecision(4)}` : "—"}
                hint={
                  snapshot.priceSource === "pool"
                    ? `${snapshot.pools} ${snapshot.pools === 1 ? "pool" : "pools"} na ${CHAIN_LABEL[snapshot.chain]}`
                    : snapshot.priceSource === "perpétuo"
                      ? `nenhuma pool na ${CHAIN_LABEL[snapshot.chain]} — a moeda negocia em corretora`
                      : "sem pool e sem perpétuo: os valores em dólar não existem"
                }
              />
              <Stat
                label="Valor de todo o supply"
                value={money(snapshot.fdv)}
                hint={`${units(snapshot.supply)} de tokens`}
              />
              <Stat
                label="Liquidez à vista"
                value={money(snapshot.liquidityUsd)}
                hint={`volume 24h ${money(snapshot.volume24h)}`}
              />
              <Stat
                label="Destravado ÷ liquidez"
                value={
                  snapshot.liquidityUsd > 0
                    ? `${((snapshot.sellable * snapshot.priceUsd) / snapshot.liquidityUsd).toFixed(0)}x`
                    : "—"
                }
                hint="quantas vezes a pool seria estourada"
              />
            </div>

            {snapshot.alerts.length > 0 && (
              <section className="flex flex-col gap-3">
                {snapshot.alerts.map((alert) => (
                  <div
                    key={alert.title}
                    className={`rounded-xl border p-4 ${ALERT_STYLE[alert.level]}`}
                  >
                    <p className="font-medium flex items-baseline gap-2">
                      <span aria-hidden className="text-xs">
                        {ALERT_MARK[alert.level]}
                      </span>
                      {alert.title}
                    </p>
                    <p className="text-sm text-black/60 dark:text-white/60 mt-1">
                      {alert.detail}
                    </p>
                  </div>
                ))}
              </section>
            )}

            <SupplyBar snapshot={snapshot} />
            {/* Sem carteira mapeada a tabela saía com cabeçalho e nenhuma linha,
                que se lê como "não achei nada" em vez de "não procurei". */}
            {snapshot.wallets.length > 0 ? (
              <Wallets snapshot={snapshot} />
            ) : (
              <p className="text-sm text-black/50 dark:text-white/50">
                Nenhuma carteira mapeada nesta moeda: a leitura on-chain cobre preço,
                supply, oferta em corretora e transferências grandes, mas não sabe quem é
                quem. Mapear exige levantar os endereços um a um.
              </p>
            )}
            <Transfers snapshot={snapshot} />
          </div>
        ) : (
          <p className="text-sm text-black/50 dark:text-white/50">
            Sem leitura on-chain para esta moeda — só o lado do perpétuo.
          </p>
        )}

        {perp && <PositioningPanel snapshot={perp} />}

        <p className="text-xs text-black/40 dark:text-white/40">
          Leitura pública da rede e do DexScreener, sem chave de API. Rótulos
          marcados com <span className="font-mono">?</span> vieram de terceiros e não foram
          conferidos on-chain. Nada aqui é recomendação de investimento.
        </p>
      </main>
    </div>
  );
}
