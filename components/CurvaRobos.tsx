"use client";

/**
 * O patrimônio de cada robô ao longo do tempo, numa régua só.
 *
 * ESCALA LOGARÍTMICA NA MEDIÇÃO, e não por estética: os robôs vão de US$ 1.000
 * a mais de US$ 10.000 em 2024–2026, e numa régua linear o primeiro ano inteiro
 * vira uma linha reta no rodapé — exatamente o ano em que o Caça-monstra perdeu
 * e o Momento andou de lado. No log, a mesma distância vertical é o mesmo
 * retorno em qualquer altura: cair de 2.000 para 1.000 ocupa o mesmo espaço que
 * cair de 10.000 para 5.000, que é como uma queda dói. Ao vivo, com dias de
 * curva, a régua é linear.
 *
 * AS CORES saem da paleta de referência da skill `dataviz` e foram VALIDADAS
 * contra as duas superfícies do site: azul, laranja, verde-água e amarelo na
 * ordem fixa da paleta, e cada robô com a SUA cor, não a da posição na lista.
 * Com as quatro, validadas em 08/10 no par vizinho de linhas: separação sob
 * daltonismo ΔE 9,1 no claro e 8,4 no escuro (alvo 8), visão normal 22,9 e
 * 19,8 (piso 15), contra o `zinc-50` e o preto da página. O verde-água (2,7:1)
 * e o amarelo (2,07:1) ficam abaixo dos 3:1 no fundo claro, e por isso toda
 * linha tem rótulo direto na ponta e legenda, e a tabela vem embaixo: a
 * identidade nunca depende só da cor. A carteira do painel entra em cinza,
 * como contexto e não como série a identificar — o mesmo arranjo da
 * `CurvaCarteira`.
 *
 * O FUNDO (Momento + Fluxo, `lib/quant.ts`) tem a quinta cor da paleta, o
 * magenta, e aparece num gráfico próprio com os dois livros dele: azul,
 * amarelo e magenta validados em 10/10 em TODOS os pares, porque as três
 * linhas se cruzam — daltonismo ΔE 13,0 no claro e 13,2 no escuro, visão
 * normal 19,6 e 19,3. O magenta fica em 2,58:1 no fundo claro: rótulo na
 * ponta e tabela embaixo, como as outras.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export const CORES_ROBOS = [
  "[--robo-1:#2a78d6] dark:[--robo-1:#3987e5]",
  "[--robo-2:#eb6834] dark:[--robo-2:#d95926]",
  "[--robo-3:#1baf7a] dark:[--robo-3:#199e70]",
  "[--robo-4:#eda100] dark:[--robo-4:#c98500]",
  "[--robo-5:#e87ba4] dark:[--robo-5:#d55181]",
  "[--robo-ctx:#898781] dark:[--robo-ctx:#8f8e88]",
].join(" ");

export type Ponto = { t: number; patrimonio: number };

export interface SerieRobo {
  id: string;
  rotulo: string;
  /** O nome curto que vai na ponta da linha. */
  curto: string;
  /** Uma `var(--robo-N)` de `CORES_ROBOS`. */
  cor: string;
  pontos: Ponto[];
  /** Linha de contexto: mais fina, sem ponto na ponta em destaque. */
  contexto?: boolean;
}

/**
 * Margens em pixels REAIS, medidas na largura de verdade. À direita mora o
 * rótulo da ponta de cada linha; no celular ele vira só o nome curto, senão
 * os rótulos comiam um terço do gráfico (visto a 390 px). No largo, 132 é o
 * que cabe "US$ 13.541 Momento" — com 118 o nome saía cortado.
 */
const G_LARGO = { esq: 74, dir: 132, topo: 14, base: 26 };
const G_ESTREITO = { esq: 44, dir: 66, topo: 14, base: 26 };

function usd(v: number, casas = 0): string {
  return `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
}

function caminho(pontos: { x: number; y: number }[]): string {
  return pontos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
}

function maisPerto(serie: Ponto[], t: number): Ponto | null {
  if (serie.length === 0) return null;
  let lo = 0;
  let hi = serie.length - 1;
  while (hi - lo > 1) {
    const meio = (lo + hi) >> 1;
    if (serie[meio].t <= t) lo = meio;
    else hi = meio;
  }
  return Math.abs(serie[lo].t - t) <= Math.abs(serie[hi].t - t) ? serie[lo] : serie[hi];
}

function passoRedondo(amplitude: number, alvo: number): number {
  const bruto = amplitude / alvo;
  const base = 10 ** Math.floor(Math.log10(bruto));
  for (const m of [1, 2, 2.5, 5, 10]) if (base * m >= bruto) return base * m;
  return base * 10;
}

/** Marcas do log: 1, 2 e 5 vezes potência de dez dentro da faixa. */
function ticksLog(lo: number, hi: number): number[] {
  const out: number[] = [];
  for (let k = Math.floor(Math.log10(lo)) - 1; k <= Math.ceil(Math.log10(hi)); k++) {
    for (const m of [1, 2, 5]) {
      const v = m * 10 ** k;
      if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v);
    }
  }
  return out;
}

export default function CurvaRobos({
  series,
  capital,
  titulo,
  log = false,
  corte,
}: {
  series: SerieRobo[];
  capital: number;
  titulo: string;
  log?: boolean;
  /** Uma linha vertical rotulada — o corte entre dentro e fora da amostra. */
  corte?: { t: number; rotulo: string };
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const caixaRef = useRef<HTMLDivElement>(null);
  const [alvo, setAlvo] = useState<number | null>(null);
  const [W, setW] = useState(900);
  useEffect(() => {
    const el = caixaRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(320, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const estreito = W < 600;
  const G = estreito ? G_ESTREITO : G_LARGO;
  const H = estreito ? 220 : 270;

  // Laço e não `Math.min(...)`: armadilha nº 9 — as curvas só crescem.
  let t0 = Infinity;
  let t1 = -Infinity;
  let y0 = capital;
  let y1 = capital;
  for (const s of series) {
    for (const p of s.pontos) {
      if (!Number.isFinite(p.patrimonio) || p.patrimonio <= 0) continue;
      if (p.t < t0) t0 = p.t;
      if (p.t > t1) t1 = p.t;
      if (p.patrimonio < y0) y0 = p.patrimonio;
      if (p.patrimonio > y1) y1 = p.patrimonio;
    }
  }
  const largura = W - G.esq - G.dir;
  const altura = H - G.topo - G.base;

  let lo: number;
  let hi: number;
  let ticksY: number[];
  if (log) {
    lo = y0 * 0.92;
    hi = y1 * 1.08;
    ticksY = ticksLog(lo, hi);
  } else {
    const passo = passoRedondo(Math.max(y1 - y0, capital * 0.02), 4);
    lo = Math.floor(y0 / passo) * passo;
    hi = Math.ceil(y1 / passo) * passo;
    ticksY = [];
    for (let v = lo; v <= hi + passo / 2; v += passo) ticksY.push(v);
  }

  const px = useCallback(
    (t: number) => G.esq + (t1 > t0 ? ((t - t0) / (t1 - t0)) * largura : 0),
    [t0, t1, largura, G.esq],
  );
  const py = useCallback(
    (v: number) => {
      const f = log ? (Math.log(hi) - Math.log(Math.max(v, 1e-9))) / (Math.log(hi) - Math.log(lo) || 1) : (hi - v) / (hi - lo || 1);
      return G.topo + f * altura;
    },
    [hi, lo, altura, log, G.topo],
  );

  const aoMover = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || !(t1 > t0)) return;
      const caixa = svg.getBoundingClientRect();
      const x = ((e.clientX - caixa.left) / caixa.width) * W;
      const t = t0 + ((x - G.esq) / largura) * (t1 - t0);
      setAlvo(Math.min(Math.max(t, t0), t1));
    },
    [t0, t1, largura, W, G.esq],
  );

  const comPontos = series.filter((s) => s.pontos.length >= 2);
  if (comPontos.length === 0 || !(t1 > t0)) return null;

  // Rótulo na ponta de cada linha, empurrados para não se atropelarem: ordena
  // pela altura e afasta quem ficar a menos de 14 px do vizinho de cima.
  const pontas = comPontos
    .map((s) => ({ s, fim: s.pontos[s.pontos.length - 1] }))
    .map((x) => ({ ...x, y: py(x.fim.patrimonio) }))
    .sort((a, b) => a.y - b.y);
  for (let k = 1; k < pontas.length; k++) {
    if (pontas[k].y - pontas[k - 1].y < 14) pontas[k].y = pontas[k - 1].y + 14;
  }

  const spanDias = (t1 - t0) / 86_400_000;
  const nTicks = Math.max(2, Math.floor(largura / 110));
  const ticksX: number[] = [];
  if (spanDias > 120) {
    // Meses: um rótulo a cada N meses.
    const d = new Date(t0);
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
    const meses = Math.max(1, Math.ceil(spanDias / 30 / nTicks));
    for (d.setUTCMonth(d.getUTCMonth() + 1); d.getTime() <= t1; d.setUTCMonth(d.getUTCMonth() + meses)) ticksX.push(d.getTime());
  } else {
    const DIA = 86_400_000;
    const salto = Math.max(1, Math.ceil(spanDias / nTicks));
    for (let t = Math.ceil(t0 / DIA) * DIA; t <= t1; t += salto * DIA) ticksX.push(t);
  }
  const rotuloX = (t: number) => {
    const iso = new Date(t).toISOString();
    return spanDias > 120 ? `${iso.slice(5, 7)}/${iso.slice(2, 4)}` : `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  };

  const sob = alvo === null ? [] : comPontos.map((s) => ({ s, p: maisPerto(s.pontos, alvo) })).filter((x) => x.p !== null);
  const xAlvo = sob.length > 0 ? px(sob[0].p!.t) : null;

  return (
    <div className={CORES_ROBOS}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-[10px] tracking-widest text-black/40 dark:text-white/40 uppercase">{titulo}</span>
        <span className="flex flex-wrap items-center gap-3 text-black/55 dark:text-white/55">
          {comPontos.map((s) => (
            <span key={s.id} className="flex items-center gap-1.5">
              <span className={`inline-block w-4 rounded ${s.contexto ? "h-px" : "h-0.5"}`} style={{ background: s.cor }} />
              {s.rotulo}
            </span>
          ))}
        </span>
      </div>

      <div ref={caixaRef} className="relative mt-1">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto touch-none"
          role="img"
          aria-label={`${titulo}: ` + comPontos.map((s) => `${s.rotulo} em ${usd(s.pontos[s.pontos.length - 1].patrimonio)}`).join(", ")}
          onPointerMove={aoMover}
          onPointerLeave={() => setAlvo(null)}
        >
          {ticksY.map((v) => (
            <g key={v}>
              <line x1={G.esq} x2={W - G.dir} y1={py(v)} y2={py(v)} className="stroke-black/10 dark:stroke-white/10" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              <text x={G.esq - 8} y={py(v) + 3.5} textAnchor="end" className="fill-black/40 dark:fill-white/40 tabular-nums" fontSize="10">
                {/* No estreito, sem "US$": "US$ 990" não cabe nos 44 px e saía "S$ 990". */}
                {estreito ? (v >= 1000 ? `${(v / 1000).toLocaleString("pt-BR")} mil` : v.toLocaleString("pt-BR")) : usd(v)}
              </text>
            </g>
          ))}
          {/* O capital inicial é a linha que importa: acima ou abaixo de mil? */}
          <line x1={G.esq} x2={W - G.dir} y1={py(capital)} y2={py(capital)} className="stroke-black/35 dark:stroke-white/35" strokeWidth="1" vectorEffect="non-scaling-stroke" />

          {corte && corte.t > t0 && corte.t < t1 && (
            <>
              <line x1={px(corte.t)} x2={px(corte.t)} y1={G.topo} y2={G.topo + altura} className="stroke-black/25 dark:stroke-white/25" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
              <text x={px(corte.t) + 5} y={G.topo + 9} className="fill-black/40 dark:fill-white/40" fontSize="10">
                {corte.rotulo}
              </text>
            </>
          )}

          {/* Contexto primeiro, para as séries passarem por cima. */}
          {[...comPontos].sort((a, b) => Number(!!b.contexto) - Number(!!a.contexto)).map((s) => (
            <path
              key={s.id}
              d={caminho(s.pontos.filter((p) => p.patrimonio > 0).map((p) => ({ x: px(p.t), y: py(p.patrimonio) })))}
              fill="none"
              stroke={s.cor}
              strokeWidth={s.contexto ? 1.5 : 2}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {pontas.map(({ s, fim, y }) => (
            <g key={s.id}>
              <circle cx={px(fim.t)} cy={py(fim.patrimonio)} r={s.contexto ? 3 : 4} fill={s.cor} className="stroke-zinc-50 dark:stroke-black" strokeWidth="2" />
              <text x={W - G.dir + 10} y={y + 3.5} className={`${s.contexto ? "fill-black/50 dark:fill-white/50" : "fill-black/80 dark:fill-white/80 font-semibold"} tabular-nums`} fontSize="11">
                {estreito ? s.curto : `${usd(fim.patrimonio)} ${s.curto}`}
              </text>
            </g>
          ))}

          {ticksX.map((t) => (
            <text key={t} x={px(t)} y={H - 8} textAnchor="middle" className="fill-black/35 dark:fill-white/35 tabular-nums" fontSize="10">
              {rotuloX(t)}
            </text>
          ))}

          {xAlvo !== null && (
            <>
              <line x1={xAlvo} x2={xAlvo} y1={G.topo} y2={G.topo + altura} className="stroke-black/30 dark:stroke-white/30" strokeWidth="1" vectorEffect="non-scaling-stroke" />
              {sob.map(({ s, p }) => (
                <circle key={s.id} cx={px(p!.t)} cy={py(p!.patrimonio)} r="4" fill={s.cor} className="stroke-zinc-50 dark:stroke-black" strokeWidth="2" />
              ))}
            </>
          )}
        </svg>

        {xAlvo !== null && sob.length > 0 && (
          <div
            className="pointer-events-none absolute top-1 rounded-lg border border-black/10 dark:border-white/15 bg-zinc-50/95 dark:bg-black/95 px-3 py-2 text-xs shadow-sm"
            style={{ left: `${(xAlvo / W) * 100}%`, transform: xAlvo > W / 2 ? "translateX(-108%)" : "translateX(8%)" }}
          >
            <p className="text-black/50 dark:text-white/50 tabular-nums">
              {new Date(sob[0].p!.t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: spanDias > 120 ? "2-digit" : undefined, hour: spanDias > 120 ? undefined : "2-digit", minute: spanDias > 120 ? undefined : "2-digit", timeZone: "UTC" })} UTC
            </p>
            {[...sob].sort((a, b) => b.p!.patrimonio - a.p!.patrimonio).map(({ s, p }) => (
              <p key={s.id} className="mt-1 flex items-center gap-2">
                <span className="inline-block w-3 h-0.5 rounded" style={{ background: s.cor }} />
                <span className="font-semibold tabular-nums">{usd(p!.patrimonio, 2)}</span>
                <span className="text-black/45 dark:text-white/45">{s.rotulo}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
