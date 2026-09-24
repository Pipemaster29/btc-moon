"use client";

/**
 * O patrimônio da carteira ao longo do tempo, e o regime anterior ao lado.
 *
 * O retorno sozinho não diz nada: não diz se foi uma subida constante ou
 * um salto numa moeda, nem quanto a conta afundou no caminho, nem contra o que
 * ele deveria ser lido. A curva responde as duas primeiras; a linha cinza — as
 * regras que valiam até 23/09, sobre AS MESMAS calls — responde a terceira. É a
 * comparação que decidiu a troca de regime, e ela morava só no terminal.
 *
 * UMA LINHA EM COR, A OUTRA EM CINZA, E NÃO DUAS CORES. O anterior não é uma
 * série a identificar, é contexto: pintá-lo com uma segunda cor daria às duas o
 * mesmo peso. O validador de paleta reprova o cinza no piso de croma — é o que
 * ele deve fazer com um cinza — e aprova o resto contra as duas superfícies do
 * site: separação sob daltonismo ΔE 16,8 no claro e 16,1 no escuro (alvo 8),
 * contraste acima de 3:1. A identidade não depende da cor: legenda em cima e
 * rótulo na ponta de cada linha.
 *
 * O azul é o `#5B8DEF` do painel de liquidez, já validado nas duas superfícies.
 */

import { useCallback, useEffect, useRef, useState } from "react";

const TEMA = "[--serie-pub:#5B8DEF] [--serie-ant:#898781] dark:[--serie-ant:#8f8e88]";
const COR_PUB = "var(--serie-pub)";
const COR_ANT = "var(--serie-ant)";

/**
 * Margens em pixels REAIS: o gráfico mede a própria largura e desenha nela, em
 * vez de escalar um desenho de 900 unidades. Escalado, num celular de 390 px o
 * texto do eixo encolheria para uns 5 px — ilegível, e o validador de paleta não
 * pega isso, porque o que ele confere é cor.
 */
const G = { esq: 58, dir: 84, topo: 14, base: 26 };

type Ponto = { t: number; patrimonio: number };

function usd(v: number, casas = 0): string {
  return `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas })}`;
}

function dataHora(t: number): string {
  return new Date(t).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function caminho(pontos: { x: number; y: number }[]): string {
  return pontos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
}

/** O ponto mais perto de `t`, por busca binária: a curva está em ordem de tempo. */
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

/**
 * Passo "redondo" para o eixo: 1, 2, 2,5 ou 5 vezes uma potência de dez. Um
 * eixo em US$ 1.037, 1.074, 1.111 obriga o leitor a fazer conta para ler.
 */
function passoRedondo(amplitude: number, alvo: number): number {
  const bruto = amplitude / alvo;
  const base = 10 ** Math.floor(Math.log10(bruto));
  for (const m of [1, 2, 2.5, 5, 10]) if (base * m >= bruto) return base * m;
  return base * 10;
}

export default function CurvaCarteira({
  curva,
  anterior,
  rotuloAnterior,
  capital,
  meio,
}: {
  curva: Ponto[];
  anterior: Ponto[];
  rotuloAnterior: string;
  capital: number;
  /** O corte entre as metades da tabela de regimes, se houver. */
  meio?: number;
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
  const H = W < 600 ? 210 : 250;

  // Laço e não `Math.min(...)`: é a armadilha nº 9, e a curva só cresce.
  let t0 = Infinity;
  let t1 = -Infinity;
  let y0 = capital;
  let y1 = capital;
  for (const serie of [curva, anterior]) {
    for (const p of serie) {
      if (!Number.isFinite(p.patrimonio)) continue;
      if (p.t < t0) t0 = p.t;
      if (p.t > t1) t1 = p.t;
      if (p.patrimonio < y0) y0 = p.patrimonio;
      if (p.patrimonio > y1) y1 = p.patrimonio;
    }
  }
  const largura = W - G.esq - G.dir;
  const altura = H - G.topo - G.base;
  const passo = passoRedondo(Math.max(y1 - y0, capital * 0.02), 4);
  const lo = Math.floor(y0 / passo) * passo;
  const hi = Math.ceil(y1 / passo) * passo;

  const px = useCallback(
    (t: number) => G.esq + (t1 > t0 ? ((t - t0) / (t1 - t0)) * largura : 0),
    [t0, t1, largura],
  );
  const py = useCallback((v: number) => G.topo + ((hi - v) / (hi - lo || 1)) * altura, [hi, lo, altura]);

  const aoMover = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg || !(t1 > t0)) return;
      const caixa = svg.getBoundingClientRect();
      const x = ((e.clientX - caixa.left) / caixa.width) * W;
      const t = t0 + ((x - G.esq) / largura) * (t1 - t0);
      setAlvo(Math.min(Math.max(t, t0), t1));
    },
    [t0, t1, largura, W],
  );

  if (curva.length < 2 || !(t1 > t0)) return null;

  const linhaPub = curva.map((p) => ({ x: px(p.t), y: py(p.patrimonio) }));
  const linhaAnt = anterior.map((p) => ({ x: px(p.t), y: py(p.patrimonio) }));

  const ticksY: number[] = [];
  for (let v = lo; v <= hi + passo / 2; v += passo) ticksY.push(v);

  // Um rótulo de data a cada ~110 px: o bastante para situar sem virar régua, e
  // sem os rótulos se atropelarem na tela estreita.
  const DIA = 86_400_000;
  const saltoDias = Math.max(1, Math.ceil((t1 - t0) / DIA / Math.max(2, Math.floor(largura / 110))));
  const ticksX: number[] = [];
  for (let t = Math.ceil(t0 / DIA) * DIA; t <= t1; t += saltoDias * DIA) ticksX.push(t);

  const fimPub = curva[curva.length - 1];
  const fimAnt = anterior.length > 0 ? anterior[anterior.length - 1] : null;
  // Os dois rótulos da ponta não podem se sobrepor: se ficarem a menos de 22
  // unidades um do outro, cada um se afasta metade do que falta.
  let yRotPub = py(fimPub.patrimonio);
  let yRotAnt = fimAnt ? py(fimAnt.patrimonio) : 0;
  if (fimAnt && Math.abs(yRotPub - yRotAnt) < 22) {
    const falta = (22 - Math.abs(yRotPub - yRotAnt)) / 2;
    if (yRotPub <= yRotAnt) {
      yRotPub -= falta;
      yRotAnt += falta;
    } else {
      yRotPub += falta;
      yRotAnt -= falta;
    }
  }

  const pPub = alvo === null ? null : maisPerto(curva, alvo);
  const pAnt = alvo === null ? null : maisPerto(anterior, alvo);
  const xAlvo = pPub ? px(pPub.t) : null;

  return (
    <div className={TEMA}>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-[10px] tracking-widest text-black/40 dark:text-white/40 uppercase">
          Patrimônio · mesmas calls, duas gestões
        </span>
        <span className="flex items-center gap-3 text-black/55 dark:text-white/55">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 rounded" style={{ background: COR_PUB }} />
            regras publicadas
          </span>
          {anterior.length > 1 && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5 rounded" style={{ background: COR_ANT }} />
              {rotuloAnterior}
            </span>
          )}
        </span>
      </div>

      <div ref={caixaRef} className="relative mt-1">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${W} ${H}`}
          className="w-full h-auto touch-none"
          role="img"
          aria-label={
            `Patrimônio da carteira fictícia de ${usd(capital)} a ${usd(fimPub.patrimonio)} com as regras publicadas` +
            (fimAnt ? `, e a ${usd(fimAnt.patrimonio)} com as anteriores sobre as mesmas calls` : "")
          }
          onPointerMove={aoMover}
          onPointerLeave={() => setAlvo(null)}
        >
          {/* Grade: hairline sólida e recessiva. A linha do capital inicial é a
              única mais forte, porque é a pergunta: acima ou abaixo de mil? */}
          {ticksY.map((v) => (
            <g key={v}>
              <line
                x1={G.esq}
                x2={W - G.dir}
                y1={py(v)}
                y2={py(v)}
                className="stroke-black/10 dark:stroke-white/10"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={G.esq - 8}
                y={py(v) + 3.5}
                textAnchor="end"
                className="fill-black/40 dark:fill-white/40 tabular-nums"
                fontSize="10"
              >
                {usd(v)}
              </text>
            </g>
          ))}
          <line
            x1={G.esq}
            x2={W - G.dir}
            y1={py(capital)}
            y2={py(capital)}
            className="stroke-black/35 dark:stroke-white/35"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />

          {/* O corte das metades: a tabela abaixo roda cada lado do zero,
              sozinho. Marcado aqui para as duas leituras se encontrarem. */}
          {meio !== undefined && meio > t0 && meio < t1 && (
            <>
              <line
                x1={px(meio)}
                x2={px(meio)}
                y1={G.topo}
                y2={G.topo + altura}
                className="stroke-black/25 dark:stroke-white/25"
                strokeWidth="1"
                strokeDasharray="3 3"
                vectorEffect="non-scaling-stroke"
              />
              <text
                x={px(meio) + 5}
                y={G.topo + 9}
                className="fill-black/40 dark:fill-white/40"
                fontSize="10"
              >
                metade
              </text>
            </>
          )}

          {linhaAnt.length > 1 && (
            <path
              d={caminho(linhaAnt)}
              fill="none"
              stroke={COR_ANT}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          )}
          <path
            d={caminho(linhaPub)}
            fill="none"
            stroke={COR_PUB}
            strokeWidth="2"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />

          {/* Rótulo direto na ponta de cada linha, em tinta de texto — a cor
              fica no ponto ao lado, não nas letras. */}
          {fimAnt && linhaAnt.length > 1 && (
            <>
              <circle
                cx={px(fimAnt.t)}
                cy={py(fimAnt.patrimonio)}
                r="4"
                fill={COR_ANT}
                className="stroke-zinc-50 dark:stroke-black"
                strokeWidth="2"
              />
              <text
                x={W - G.dir + 10}
                y={yRotAnt + 3.5}
                className="fill-black/55 dark:fill-white/55 tabular-nums"
                fontSize="11"
              >
                {usd(fimAnt.patrimonio)}
              </text>
            </>
          )}
          <circle
            cx={px(fimPub.t)}
            cy={py(fimPub.patrimonio)}
            r="4"
            fill={COR_PUB}
            className="stroke-zinc-50 dark:stroke-black"
            strokeWidth="2"
          />
          <text
            x={W - G.dir + 10}
            y={yRotPub + 3.5}
            className="fill-black/80 dark:fill-white/80 font-semibold tabular-nums"
            fontSize="11"
          >
            {usd(fimPub.patrimonio)}
          </text>

          {ticksX.map((t) => (
            <text
              key={t}
              x={px(t)}
              y={H - 8}
              textAnchor="middle"
              className="fill-black/35 dark:fill-white/35 tabular-nums"
              fontSize="10"
            >
              {new Date(t).toISOString().slice(8, 10)}/{new Date(t).toISOString().slice(5, 7)}
            </text>
          ))}

          {/* Mira: linha vertical e um ponto em cada série, com anel da cor da
              superfície para o ponto não se fundir com a linha que ele marca. */}
          {xAlvo !== null && pPub && (
            <>
              <line
                x1={xAlvo}
                x2={xAlvo}
                y1={G.topo}
                y2={G.topo + altura}
                className="stroke-black/30 dark:stroke-white/30"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              {pAnt && linhaAnt.length > 1 && (
                <circle
                  cx={px(pAnt.t)}
                  cy={py(pAnt.patrimonio)}
                  r="4"
                  fill={COR_ANT}
                  className="stroke-zinc-50 dark:stroke-black"
                  strokeWidth="2"
                />
              )}
              <circle
                cx={xAlvo}
                cy={py(pPub.patrimonio)}
                r="4"
                fill={COR_PUB}
                className="stroke-zinc-50 dark:stroke-black"
                strokeWidth="2"
              />
            </>
          )}
        </svg>

        {xAlvo !== null && pPub && (
          <div
            className="pointer-events-none absolute top-1 rounded-lg border border-black/10 dark:border-white/15 bg-zinc-50/95 dark:bg-black/95 px-3 py-2 text-xs shadow-sm"
            style={{
              left: `${(xAlvo / W) * 100}%`,
              transform: xAlvo > W / 2 ? "translateX(-108%)" : "translateX(8%)",
            }}
          >
            <p className="text-black/50 dark:text-white/50 tabular-nums">{dataHora(pPub.t)} UTC</p>
            <p className="mt-1 flex items-center gap-2">
              <span className="inline-block w-3 h-0.5 rounded" style={{ background: COR_PUB }} />
              <span className="font-semibold tabular-nums">{usd(pPub.patrimonio, 2)}</span>
              <span className="text-black/45 dark:text-white/45">publicadas</span>
            </p>
            {pAnt && linhaAnt.length > 1 && (
              <p className="flex items-center gap-2">
                <span className="inline-block w-3 h-0.5 rounded" style={{ background: COR_ANT }} />
                <span className="font-semibold tabular-nums">{usd(pAnt.patrimonio, 2)}</span>
                <span className="text-black/45 dark:text-white/45">anteriores</span>
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
