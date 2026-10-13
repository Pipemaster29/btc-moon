/**
 * A moldura de toda aba: a mesma largura da barra de cima, o mesmo respiro e o
 * mesmo cabeçalho — título, uma frase do que a aba responde e, quando há, o
 * índice das seções dela. Cada página tinha a sua (5xl numa, 6xl na outra,
 * 12 de respiro em cima), e trocar de aba fazia a tela pular.
 */

import Link from "next/link";

export function Pagina({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col flex-1 bg-zinc-50 font-sans dark:bg-black">
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-8 flex flex-col gap-6">{children}</main>
    </div>
  );
}

export function Cabeca({
  titulo,
  children,
  secoes,
}: {
  titulo: string;
  children?: React.ReactNode;
  /** O índice da aba: âncoras para as seções, na ordem em que aparecem. */
  secoes?: { id: string; rotulo: string }[];
}) {
  return (
    <header className="flex flex-col gap-2">
      <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">{titulo}</h1>
      {children}
      {secoes && secoes.length > 0 && (
        <nav aria-label="Nesta aba" className="flex flex-wrap gap-2 pt-1">
          {secoes.map((s) => (
            <Link
              key={s.id}
              href={`#${s.id}`}
              className="rounded-full border border-black/10 dark:border-white/15 px-3 py-1 text-xs text-black/60 dark:text-white/60 hover:bg-black/5 dark:hover:bg-white/10"
            >
              {s.rotulo}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}

/** Uma seção com âncora: a margem de cima deixa o título fora da barra fixa quando o índice leva até ela. */
export function Secao({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-20">
      {children}
    </div>
  );
}
