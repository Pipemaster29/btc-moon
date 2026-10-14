"use client";

/**
 * AS ABAS DO SITE, uma por assunto. Até 13/10 o radar era uma página só, com
 * a carteira, os robôs, a medição deles, a mesa de risco, o placar, os sinais,
 * a tabela, o fluxo da Binance e o garimpo empilhados — dez arquivos de
 * `data/` pedidos para mostrar qualquer um deles, e as posições dos robôs no
 * fim de tudo.
 *
 * Cada aba é uma ROTA, não estado: o endereço diz onde se está, o link pode
 * ser mandado para alguém, e cada aba busca só os dados que mostra. A aba ativa
 * sai do segmento da rota (`useSelectedLayoutSegment`), que é lido um nível
 * abaixo do layout que desenha a barra — no layout raiz, "radar" vale para
 * `/radar` e para `/radar/AKE`; no dos robôs, `null` é a aba de entrada.
 */

import Link from "next/link";
import { useSelectedLayoutSegment } from "next/navigation";

export interface Aba {
  /** O segmento da rota um nível abaixo do layout; `null` é a rota do próprio layout. */
  segmento: string | null;
  href: string;
  rotulo: string;
}

export const ABAS_DO_SITE: Aba[] = [
  { segmento: null, href: "/", rotulo: "Bitcoin" },
  { segmento: "radar", href: "/radar", rotulo: "Radar" },
  { segmento: "robos", href: "/robos", rotulo: "Robôs" },
  { segmento: "carteira", href: "/carteira", rotulo: "Carteira" },
  { segmento: "garimpo", href: "/garimpo", rotulo: "Garimpo" },
];

/** A barra de cima: abas sublinhadas, que rolam de lado no celular em vez de quebrar a linha. */
export function AbasDoSite() {
  const atual = useSelectedLayoutSegment();
  return (
    <nav aria-label="Seções" className="flex min-w-0 flex-1 gap-1 overflow-x-auto [scrollbar-width:none]">
      {ABAS_DO_SITE.map((a) => {
        const ativa = a.segmento === atual;
        return (
          <Link
            key={a.href}
            href={a.href}
            aria-current={ativa ? "page" : undefined}
            className={`whitespace-nowrap border-b-2 px-2 sm:px-3 py-3.5 text-sm transition-colors ${
              ativa
                ? "border-black dark:border-white text-black dark:text-white font-medium"
                : "border-transparent text-black/55 dark:text-white/55 hover:text-black dark:hover:text-white"
            }`}
          >
            {a.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}

/** As sub-abas de uma aba: um seletor em pílula, para não competir com a barra de cima. */
export function SubAbas({ abas }: { abas: Aba[] }) {
  const atual = useSelectedLayoutSegment();
  return (
    <nav aria-label="Partes desta aba" className="inline-flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-black/5 dark:bg-white/10 p-1">
      {abas.map((a) => {
        const ativa = a.segmento === atual;
        return (
          <Link
            key={a.href}
            href={a.href}
            aria-current={ativa ? "page" : undefined}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${
              ativa
                ? "bg-white dark:bg-black text-black dark:text-white shadow-sm font-medium"
                : "text-black/60 dark:text-white/60 hover:text-black dark:hover:text-white"
            }`}
          >
            {a.rotulo}
          </Link>
        );
      })}
    </nav>
  );
}
