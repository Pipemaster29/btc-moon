/**
 * OS CRIADORES E OS VCs, na página da moeda: para onde foi o supply que nasceu
 * nas mãos deles (`lib/insiders.ts`) e o que a medição disse sobre o depósito em
 * corretora (`docs/preregistro-insiders.md`). O veredito vai na mesma tela da
 * leitura, como no resto do site.
 *
 * Sem gráfico: são meia dúzia de números e uma tabela curta, e o que importa
 * ler é a data e o tamanho do último depósito.
 */

import type { ArquivoInsiders, Fluxo, MedicaoInsiders } from "@/lib/insiders";
import { dataHora } from "@/components/robosFormato";

const EXPLORADOR: Record<string, string> = { ethereum: "https://etherscan.io", base: "https://basescan.org", bsc: "https://bscscan.com" };

/** Fração do supply em porcentagem, com casas bastantes para 0,02% não virar zero. */
function pct(v: number): string {
  if (v === 0) return "0%";
  const casas = v >= 0.1 ? 1 : v >= 0.001 ? 2 : 3;
  return `${(v * 100).toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}%`;
}

function dia(tS: number): string {
  return new Date(tS * 1000).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

const curto = (e: string) => `${e.slice(0, 6)}…${e.slice(-4)}`;

function destino(f: Fluxo): string {
  if (f.classe === "corretora") return f.porComportamento ? `depósito da ${f.nome ?? "corretora"} (${curto(f.para)})` : `${f.nome ?? "corretora"} (${curto(f.para)})`;
  if (f.classe === "marketmaker") return `${f.nome ?? "market maker"} (${curto(f.para)})`;
  return curto(f.para);
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div>
      <p className="text-black/50 dark:text-white/50">{rotulo}</p>
      <p className="text-lg font-semibold tabular-nums">{valor}</p>
      {nota && <p className="text-xs text-black/40 dark:text-white/40">{nota}</p>}
    </div>
  );
}

export function InsidersDaMoeda({ a, m, symbol }: { a: ArquivoInsiders; m: MedicaoInsiders | null; symbol: string }) {
  const l = a.moedas[symbol];
  const fora = a.fora[symbol];
  if (!l && !fora) return null;
  if (!l) {
    return (
      <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
        <h3 className="font-semibold">Criadores e VCs</h3>
        <p className="text-sm text-black/60 dark:text-white/60 mt-1.5">
          A leitura de para onde foi o supply da gênese não alcança esta moeda — {fora}. É “não consegui”, não “não há”.
        </p>
      </section>
    );
  }
  const r = l.resumo;
  const veredito = m?.eventos.find((e) => e.tipo === "corretora");
  // Os fluxos que saíram de casa para um destino com nome, do mais novo para o mais velho.
  const comNome = l.fluxos.filter((f) => f.classe === "corretora" || f.classe === "marketmaker").slice(-8).reverse();
  const base = EXPLORADOR[l.chain] ?? "";
  return (
    <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">Criadores e VCs: para onde foi o supply da gênese</h3>
        <span className="text-xs text-black/40 dark:text-white/40 tabular-nums">lido em {dataHora(l.lidaEm)} UTC</span>
      </div>
      <p className="text-sm text-black/60 dark:text-white/60 mt-1.5 max-w-4xl">
        {l.nivel0.length} {l.nivel0.length === 1 ? "endereço recebeu" : "endereços receberam"} o supply na criação e {l.nivel1.length}{" "}
        {l.nivel1.length === 1 ? "recebeu deles" : "receberam deles"} 0,1% ou mais. A cadeia não diz quem é time e quem é VC — diz quem
        recebeu de quem. Abaixo, o que saiu dessas carteiras, em fração do supply.
        {l.faixasPerdidas > 0 ? ` A leitura está incompleta: ${l.faixasPerdidas === 1 ? "uma faixa de blocos não veio" : `${l.faixasPerdidas} faixas de blocos não vieram`}, e pode haver depósito que não foi visto.` : ""}
      </p>
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-4 mt-3 text-sm">
        <Numero
          rotulo="Para corretora"
          valor={pct(r.paraCorretora)}
          nota={r.paraCorretora > 0 ? `${pct(r.paraCorretora30d)} nos últimos 30 dias${r.corretoras[0] ? ` · mais para ${r.corretoras[0].nome}` : ""}` : "nenhum depósito visto"}
        />
        <Numero rotulo="Último depósito" valor={r.ultimoDeposito ? dia(r.ultimoDeposito.t) : "—"} nota={r.ultimoDeposito ? `${pct(r.ultimoDeposito.fracao)} do supply${r.ultimoDeposito.nome ? ` · ${r.ultimoDeposito.nome}` : ""}` : undefined} />
        <Numero rotulo="Para market maker" valor={pct(r.paraMarketMaker)} nota="as 21 carteiras conhecidas" />
        <Numero
          rotulo="Saiu da rede"
          valor={pct(r.queimado)}
          nota={r.queimado > 1 ? "passa de 100% porque o token vai e volta pela ponte — daí a leitura não segue" : "queimado ou levado por ponte — daí a leitura não segue"}
        />
      </div>
      <p className="text-xs text-black/45 dark:text-white/45 mt-3 tabular-nums">
        O resto: {pct(r.paraPool)} para pool de DEX, {pct(r.paraInfraestrutura)} para contratos que distribuem a muita gente (ponte, staking, airdrop) e{" "}
        {pct(r.paraOutros)} para carteiras sem etiqueta.
      </p>
      {comNome.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[36rem] whitespace-nowrap text-xs tabular-nums">
            <thead className="text-black/40 dark:text-white/40">
              <tr className="text-left">
                <th className="py-1 pr-3 font-normal">quando</th>
                <th className="py-1 pr-3 font-normal">de</th>
                <th className="py-1 pr-3 font-normal">para</th>
                <th className="py-1 font-normal text-right">do supply</th>
              </tr>
            </thead>
            <tbody>
              {comNome.map((f) => (
                <tr key={`${f.tx}:${f.para}:${f.fracao}`} className="border-t border-black/5 dark:border-white/5">
                  <td className="py-1.5 pr-3">
                    <a href={`${base}/tx/${f.tx}`} target="_blank" rel="noreferrer" className="hover:underline">
                      {dia(f.t)}
                    </a>
                  </td>
                  <td className="py-1.5 pr-3 font-mono">
                    {curto(f.de)} <span className="font-sans text-black/40 dark:text-white/40">{f.nivel === 0 ? "dono da gênese" : "recebeu de um dono"}</span>
                  </td>
                  <td className="py-1.5 pr-3">{destino(f)}</td>
                  <td className="py-1.5 text-right">{pct(f.fracao)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-black/40 dark:text-white/40 mt-3 max-w-4xl">
        {veredito
          ? veredito.veredito.passa
            ? `Medido (${veredito.n} depósitos em ${veredito.moedas} moedas): ${veredito.veredito.texto}.`
            : veredito.veredito.texto === "amostra insuficiente"
              ? `“Depósito de insider antecede queda?” não tem resposta medida: ${veredito.n} depósitos em ${veredito.moedas} moedas, e o critério, escrito antes do dado, pede 30 em 8. É informação, não call.`
              : `Medido (${veredito.n} depósitos em ${veredito.moedas} moedas): sem vantagem — o preço não cai mais que o mercado depois do depósito. É informação, não call.`
          : "“Depósito de insider antecede queda?” ainda não foi medido. É informação, não call."}{" "}
        A corretora é reconhecida pela etiqueta pública do Etherscan ou pelo comportamento — o endereço que repassa 80% ou mais do que recebe a uma corretora.
      </p>
    </section>
  );
}
