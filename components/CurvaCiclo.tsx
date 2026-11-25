"use client";

/**
 * O patrimônio das três carteiras do padrão dos 1.064 / 364 dias, desde
 * 30/11/2013, em escala LOG.
 *
 * Log porque os números vão de US$ 10 mil a dezenas de milhões: na escala
 * linear tudo antes de 2021 vira uma reta no chão, e é justamente lá que estão
 * duas das três vendas. Na log, a mesma inclinação é o mesmo retorno.
 *
 * Três cores e um cinza: o azul (slot 1) é a publicada, comprada e vendida; o
 * aqua (slot 3), a mesma só comprada ou em caixa; o laranja (slot 2), o
 * calendário literal. O aqua fica a 2,74:1 da superfície clara (o validador
 * avisa, não reprova) e por isso tem rótulo na ponta, legenda e tooltip;
 * separação de daltonismo das três, todos os pares: ΔE 9,2 no claro, 9,4 no
 * escuro. o "comprar e segurar" é a régua, e régua é contexto, não
 * série a identificar — o mesmo raciocínio de `CurvaCarteira`. As cores são as
 * da curva dos robôs, validadas no claro (ΔE de daltonismo 24,7) e no escuro
 * (26,8). A identidade não depende delas: legenda em cima e rótulo na ponta.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const TEMA = "[--c-ad:#2a78d6] dark:[--c-ad:#3987e5] [--c-sc:#1baf7a] dark:[--c-sc:#199e70] [--c-cal:#eb6834] dark:[--c-cal:#d95926] [--c-seg:#898781] dark:[--c-seg:#8f8e88]";
const G = { esq: 64, dir: 96, topo: 14, base: 26 };

export type PontoCiclo = { t: number; v: number };
export interface SerieCiclo {
  nome: string;
  cor: "ad" | "sc" | "cal" | "seg";
  pontos: PontoCiclo[];
}

function usdCurto(v: number): string {
  if (v >= 1e6) return `US$ ${(v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: v >= 1e7 ? 0 : 1 })} mi`;
  if (v >= 1e3) return `US$ ${(v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return `US$ ${Math.round(v)}`;
}

function caminho(p: { x: number; y: number }[]): string {
  return p.map((q, i) => `${i === 0 ? "M" : "L"}${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(" ");
}

function maisPerto(s: PontoCiclo[], t: number): PontoCiclo | null {
  if (s.length === 0) return null;
  let lo = 0;
  let hi = s.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (s[m].t <= t) lo = m;
    else hi = m;
  }
  return Math.abs(s[lo].t - t) <= Math.abs(s[hi].t - t) ? s[lo] : s[hi];
}

export default function CurvaCiclo({ series, capital }: { series: SerieCiclo[]; capital: number }) {
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
  const H = W < 600 ? 230 : 280;

  // Laço e não `Math.min(...)`: a armadilha nº 9.
  let t0 = Infinity;
  let t1 = -Infinity;
  let y0 = capital;
  let y1 = capital;
  for (const s of series)
    for (const p of s.pontos) {
      if (!(p.v > 0)) continue;
      if (p.t < t0) t0 = p.t;
      if (p.t > t1) t1 = p.t;
      if (p.v < y0) y0 = p.v;
      if (p.v > y1) y1 = p.v;
    }
  const largura = W - G.esq - G.dir;
  const altura = H - G.topo - G.base;
  const lo = Math.floor(Math.log10(y0));
  const hi = Math.ceil(Math.log10(y1));

  const px = useCallback((t: number) => G.esq + (t1 > t0 ? ((t - t0) / (t1 - t0)) * largura : 0), [t0, t1, largura]);
  const py = useCallback((v: number) => G.topo + ((hi - Math.log10(v)) / (hi - lo || 1)) * altura, [hi, lo, altura]);

  const aoMover = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || !(t1 > t0)) return;
      const r = svg.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * W;
      setAlvo(Math.min(Math.max(t0 + ((x - G.esq) / largura) * (t1 - t0), t0), t1));
    },
    [t0, t1, largura, W],
  );

  if (!(t1 > t0)) return null;

  const ticksY: number[] = [];
  for (let e = lo; e <= hi; e++) ticksY.push(10 ** e);
  const ticksX: number[] = [];
  const passoAnos = largura < 420 ? 4 : 2;
  for (let a = new Date(t0 * 1000).getUTCFullYear() + 1; ; a += passoAnos) {
    const t = Date.UTC(a, 0, 1) / 1000;
    if (t > t1) break;
    ticksX.push(t);
  }

  // Rótulos da ponta sem se atropelar: empurra para baixo o que ficar a menos de 16 px do de cima.
  const pontas = series
    .map((s) => ({ s, fim: s.pontos.at(-1)! }))
    .filter((p) => p.fim)
    .map((p) => ({ ...p, y: py(p.fim.v) }))
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < pontas.length; i++) if (pontas[i].y - pontas[i - 1].y < 16) pontas[i].y = pontas[i - 1].y + 16;

  const naMira = alvo === null ? [] : series.map((s) => ({ s, p: maisPerto(s.pontos, alvo) })).filter((x) => x.p);
  const xAlvo = naMira[0]?.p ? px(naMira[0].p.t) : null;

  return (
    <div className={TEMA}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-black/55 dark:text-white/55">
        {series.map((s) => (
          <span key={s.nome} className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 rounded" style={{ background: `var(--c-${s.cor})` }} />
            {s.nome}
          </span>
        ))}
        <span className="text-black/35 dark:text-white/35">escala log</span>
      </div>
      <div ref={caixaRef} className="relative mt-1">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto touch-none"
          role="img"
          aria-label={`Patrimônio de ${usdCurto(capital)} desde 2013: ${series.map((s) => `${s.nome} ${usdCurto(s.pontos.at(-1)?.v ?? NaN)}`).join(", ")}`}
          onPointerMove={aoMover}
          onPointerLeave={() => setAlvo(null)}
        >
          {ticksY.map((v) => (
            <g key={v}>
              <line x1={G.esq} x2={W - G.dir} y1={py(v)} y2={py(v)} className="stroke-black/10 dark:stroke-white/10" strokeWidth="1" />
              <text x={G.esq - 8} y={py(v) + 3.5} textAnchor="end" className="fill-black/40 dark:fill-white/40 tabular-nums" fontSize="10">
                {usdCurto(v)}
              </text>
            </g>
          ))}
          {ticksX.map((t) => (
            <text key={t} x={px(t)} y={H - 8} textAnchor="middle" className="fill-black/35 dark:fill-white/35 tabular-nums" fontSize="10">
              {new Date(t * 1000).getUTCFullYear()}
            </text>
          ))}
          {series.map((s) => (
            <path
              key={s.nome}
              d={caminho(s.pontos.filter((p) => p.v > 0).map((p) => ({ x: px(p.t), y: py(p.v) })))}
              fill="none"
              stroke={`var(--c-${s.cor})`}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          ))}
          {pontas.map(({ s, fim, y }) => (
            <g key={s.nome}>
              <circle cx={px(fim.t)} cy={py(fim.v)} r="4" fill={`var(--c-${s.cor})`} className="stroke-zinc-50 dark:stroke-black" strokeWidth="2" />
              <text x={W - G.dir + 10} y={y + 3.5} className="fill-black/70 dark:fill-white/70 tabular-nums" fontSize="11">
                {usdCurto(fim.v)}
              </text>
            </g>
          ))}
          {xAlvo !== null && (
            <>
              <line x1={xAlvo} x2={xAlvo} y1={G.topo} y2={G.topo + altura} className="stroke-black/30 dark:stroke-white/30" strokeWidth="1" />
              {naMira.map(({ s, p }) => (
                <circle key={s.nome} cx={px(p!.t)} cy={py(p!.v)} r="4" fill={`var(--c-${s.cor})`} className="stroke-zinc-50 dark:stroke-black" strokeWidth="2" />
              ))}
            </>
          )}
        </svg>
        {xAlvo !== null && naMira[0]?.p && (
          <div
            className="pointer-events-none absolute top-1 rounded-lg border border-black/10 dark:border-white/15 bg-zinc-50/95 dark:bg-black/95 px-3 py-2 text-xs shadow-sm"
            style={{ left: `${(xAlvo / W) * 100}%`, transform: xAlvo > W / 2 ? "translateX(-108%)" : "translateX(8%)" }}
          >
            <p className="text-black/50 dark:text-white/50 tabular-nums">{new Date(naMira[0].p.t * 1000).toLocaleDateString("pt-BR", { timeZone: "UTC" })}</p>
            {naMira.map(({ s, p }) => (
              <p key={s.nome} className="flex items-center gap-2 mt-0.5">
                <span className="inline-block w-3 h-0.5 rounded" style={{ background: `var(--c-${s.cor})` }} />
                <span className="font-semibold tabular-nums">{usdCurto(p!.v)}</span>
                <span className="text-black/45 dark:text-white/45">{s.nome}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
