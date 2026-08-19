import type { Estagio, LeituraDeCiclo } from "@/lib/setup";

/**
 * O verde aqui é "ainda não é hora", não "está bom". Vermelho é o gatilho.
 */
const ESTAGIO_STYLE: Record<Estagio, string> = {
  "fora do ciclo": "border-black/10 dark:border-white/10",
  aperto: "border-[#0ECB81]/40 bg-[#0ECB81]/5",
  "alta a crédito": "border-[#F0B90B]/40 bg-[#F0B90B]/5",
  "saída da baleia": "border-[#F0B90B]/40 bg-[#F0B90B]/5",
  "oferta voltando": "border-[#F6465D]/40 bg-[#F6465D]/5",
};

const ORDEM = ["Aperto", "Alta a crédito", "Saída da baleia", "Oferta volta"];

export default function CyclePanel({ leitura }: { leitura: LeituraDeCiclo }) {
  return (
    <section className={`rounded-xl border p-5 ${ESTAGIO_STYLE[leitura.estagio]}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{leitura.titulo}</h3>
        <p className="text-xs text-black/40 dark:text-white/40">
          {leitura.marcados} de 4 estágios marcados
        </p>
      </div>

      {/* A trilha em ordem: é a sequência que importa, não o placar. */}
      <ol className="flex flex-wrap gap-2 mt-4">
        {leitura.sinais.map((sinal, i) => (
          <li
            key={sinal.id}
            className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
              sinal.ativo
                ? "border-[#F6465D]/50 bg-[#F6465D]/10 font-medium"
                : "border-black/10 dark:border-white/10 text-black/40 dark:text-white/40"
            }`}
          >
            <span aria-hidden>{sinal.ativo ? "●" : "○"}</span>
            <span>
              {i + 1}. {ORDEM[i]}
            </span>
          </li>
        ))}
      </ol>

      <p className="text-sm text-black/60 dark:text-white/60 mt-4">{leitura.detalhe}</p>

      <dl className="mt-4 pt-4 border-t border-black/10 dark:border-white/10 flex flex-col gap-3">
        {leitura.sinais.map((sinal) => (
          <div key={sinal.id} className="text-sm">
            <dt className="flex flex-wrap items-baseline gap-2">
              <span className={sinal.ativo ? "font-medium" : "text-black/50 dark:text-white/50"}>
                {sinal.ativo ? "●" : "○"} {sinal.label}
              </span>
              <span className="text-xs text-black/40 dark:text-white/40">
                antecedência: {sinal.antecedencia}
              </span>
            </dt>
            <dd className="text-black/50 dark:text-white/50 mt-0.5">{sinal.detalhe}</dd>
          </div>
        ))}
      </dl>

      <p className="text-xs text-black/40 dark:text-white/40 mt-4">
        Sequência tirada de dois ciclos completos — LAB (topo em 02/06, saldo somado das
        corretoras caiu 95% na subida e devolveu 1% do supply no dia exato da máxima) e BTW
        (topo em 19/08 às 09h UTC). Não é recomendação: descreve onde a moeda está na
        sequência, não o que fazer com isso. Moeda de float baixo subiu 58% em nove horas
        duas vezes nesta semana.
      </p>
    </section>
  );
}
