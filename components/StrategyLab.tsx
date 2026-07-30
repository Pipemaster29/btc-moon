"use client";

import { useMemo, useState, useTransition } from "react";
import type { Candle } from "@/lib/bitstamp";
import { MOON_PHASE_LABEL, moonPhasesBetween, type MoonPhaseName } from "@/lib/moon";
import {
  buyAndHold,
  locateInNull,
  monteCarloNull,
  returnsByLunarDay,
  runBacktest,
  type MonteCarloResult,
  type StrategyParams,
} from "@/lib/backtest";

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const mult = (v: number) => {
  const x = 1 + v;
  if (x >= 1000) return `${Math.round(x).toLocaleString("pt-BR")}x`;
  if (x >= 10) return `${x.toFixed(0)}x`;
  return `${x.toFixed(2)}x`;
};

const PHASE_OPTIONS: MoonPhaseName[] = ["full", "new", "first-quarter", "last-quarter"];

function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "good" | "bad";
}) {
  const color =
    tone === "good" ? "text-[#0ECB81]" : tone === "bad" ? "text-[#F6465D]" : "";
  return (
    <div className="rounded-lg border border-black/10 dark:border-white/10 p-3">
      <p className="text-xs text-black/50 dark:text-white/50">{label}</p>
      <p className={`text-lg font-semibold mt-0.5 ${color}`}>{value}</p>
      {hint && <p className="text-[11px] text-black/40 dark:text-white/40">{hint}</p>}
    </div>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step,
  format,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs text-black/60 dark:text-white/60 flex justify-between">
        <span>{label}</span>
        <span className="font-medium text-black dark:text-white">{format(value)}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="accent-[#F0B90B]"
      />
    </label>
  );
}

/** Barras dos retornos médios por dia do ciclo lunar. */
function LunarDayChart({ candles, phases }: { candles: Candle[]; phases: ReturnType<typeof moonPhasesBetween> }) {
  const stats = useMemo(() => returnsByLunarDay(candles, phases), [candles, phases]);
  if (stats.length === 0) return null;

  const scale = Math.max(...stats.map((s) => Math.abs(s.meanReturn)));

  return (
    <div>
      {/* Barras divergentes a partir do zero: acima da linha o dia rendeu em
          média positivo, abaixo negativo. */}
      <div className="relative flex gap-[3px] h-28">
        {stats.map((s) => {
          const height = scale === 0 ? 0 : (Math.abs(s.meanReturn) / scale) * 100;
          const positive = s.meanReturn >= 0;
          // Amostras curtas — o ciclo sinódico não fecha 30 dias inteiros —
          // aparecem esmaecidas para não sugerir mais evidência do que há.
          const opacity = s.sampleSize < 150 ? 0.35 : 1;

          return (
            <div key={s.lunarDay} className="flex-1 flex flex-col h-full">
              <div className="h-1/2 flex items-end">
                {positive && (
                  <div
                    className="w-full rounded-t-sm"
                    style={{ height: `${height}%`, backgroundColor: "#0ECB81", opacity }}
                    title={`Dia ${s.lunarDay}: +${(s.meanReturn * 100).toFixed(2)}%/dia (n=${s.sampleSize})`}
                  />
                )}
              </div>
              <div className="h-1/2 flex items-start">
                {!positive && (
                  <div
                    className="w-full rounded-b-sm"
                    style={{ height: `${height}%`, backgroundColor: "#F6465D", opacity }}
                    title={`Dia ${s.lunarDay}: ${(s.meanReturn * 100).toFixed(2)}%/dia (n=${s.sampleSize})`}
                  />
                )}
              </div>
            </div>
          );
        })}
        <div className="absolute inset-x-0 top-1/2 border-t border-black/15 dark:border-white/20 pointer-events-none" />
      </div>
      <div className="flex justify-between text-[10px] text-black/40 dark:text-white/40 mt-1">
        <span>● dia 0 — lua nova</span>
        <span>○ dia 15 — lua cheia</span>
        <span>dia 29</span>
      </div>
    </div>
  );
}

/** Histograma do Monte Carlo com a estratégia marcada. */
function NullHistogram({ mc, strategyReturn }: { mc: MonteCarloResult; strategyReturn: number }) {
  const bins = 40;
  const logs = mc.samples.map((s) => Math.log10(Math.max(1 + s, 0.01)));
  const min = Math.min(...logs);
  const max = Math.max(...logs, Math.log10(Math.max(1 + strategyReturn, 0.01)));
  const width = (max - min) / bins || 1;

  const counts = new Array(bins).fill(0);
  for (const l of logs) {
    counts[Math.min(Math.floor((l - min) / width), bins - 1)]++;
  }
  const peak = Math.max(...counts);
  const strategyBin = Math.min(
    Math.floor((Math.log10(Math.max(1 + strategyReturn, 0.01)) - min) / width),
    bins - 1,
  );

  return (
    <div>
      <div className="flex items-end gap-[2px] h-24">
        {counts.map((c, i) => (
          <div
            key={i}
            className="flex-1 rounded-sm"
            style={{
              height: `${peak === 0 ? 0 : Math.max((c / peak) * 100, 1)}%`,
              backgroundColor: i === strategyBin ? "#F0B90B" : "#6B7280",
              opacity: i === strategyBin ? 1 : 0.45,
            }}
          />
        ))}
      </div>
      <p className="text-[11px] text-black/50 dark:text-white/50 mt-1.5">
        Cinza: {mc.samples.length.toLocaleString("pt-BR")} simulações com datas de entrada
        sorteadas. <span className="text-[#F0B90B] font-medium">Amarelo</span>: onde a
        estratégia lunar caiu.
      </p>
    </div>
  );
}

export default function StrategyLab({ candles }: { candles: Candle[] }) {
  const [params, setParams] = useState<StrategyParams>({
    phase: "full",
    entryOffsetDays: 0,
    holdingDays: 14,
    stopLossPct: 0.08,
  });
  // O resultado guarda os parâmetros que o geraram: assim ele se invalida
  // sozinho quando os controles mudam, sem precisar limpá-lo num efeito.
  const [mcRun, setMcRun] = useState<{
    params: StrategyParams;
    mc: MonteCarloResult;
  } | null>(null);
  const [isPending, startTransition] = useTransition();

  const phases = useMemo(() => {
    if (candles.length === 0) return [];
    return moonPhasesBetween(
      new Date(candles[0].time * 1000),
      new Date(candles[candles.length - 1].time * 1000),
    );
  }, [candles]);

  const result = useMemo(
    () => runBacktest(candles, phases, params),
    [candles, phases, params],
  );
  const bh = useMemo(() => buyAndHold(candles), [candles]);

  const sameParams =
    mcRun !== null &&
    mcRun.params.phase === params.phase &&
    mcRun.params.entryOffsetDays === params.entryOffsetDays &&
    mcRun.params.holdingDays === params.holdingDays &&
    mcRun.params.stopLossPct === params.stopLossPct;
  const mc = sameParams ? mcRun.mc : null;

  function runMonteCarlo() {
    startTransition(() => {
      const raw = monteCarloNull(candles, params, result.tradeCount, 2000);
      setMcRun({ params, mc: locateInNull(result.totalReturn, raw) });
    });
  }

  const beatsBuyAndHold = result.totalReturn > bh.totalReturn;

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-black/10 dark:border-white/10 p-4">
        <h2 className="font-semibold mb-1">Retorno médio por dia do ciclo lunar</h2>
        <p className="text-xs text-black/50 dark:text-white/50 mb-3">
          Se a lua não influenciasse o preço, as barras seriam ruído em torno de zero —
          que é aproximadamente o que se vê.
        </p>
        <LunarDayChart candles={candles} phases={phases} />
      </section>

      <section className="rounded-xl border border-black/10 dark:border-white/10 p-4 flex flex-col gap-4">
        <h2 className="font-semibold">Testar uma estratégia</h2>

        <div className="grid sm:grid-cols-2 gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-xs text-black/60 dark:text-white/60">Comprar na…</span>
            <select
              value={params.phase}
              onChange={(e) =>
                setParams((p) => ({ ...p, phase: e.target.value as MoonPhaseName }))
              }
              className="rounded-md border border-black/15 dark:border-white/15 bg-transparent px-2 py-1.5 text-sm"
            >
              {PHASE_OPTIONS.map((phase) => (
                <option key={phase} value={phase} className="dark:bg-black">
                  {MOON_PHASE_LABEL[phase]}
                </option>
              ))}
            </select>
          </label>

          <Slider
            label="Dias em relação à fase"
            value={params.entryOffsetDays}
            min={-7}
            max={7}
            step={1}
            format={(v) => (v === 0 ? "no dia" : v > 0 ? `${v} dias depois` : `${-v} dias antes`)}
            onChange={(v) => setParams((p) => ({ ...p, entryOffsetDays: v }))}
          />

          <Slider
            label="Segurar por"
            value={params.holdingDays}
            min={1}
            max={29}
            step={1}
            format={(v) => `${v} dias`}
            onChange={(v) => setParams((p) => ({ ...p, holdingDays: v }))}
          />

          <Slider
            label="Stop loss"
            value={params.stopLossPct}
            min={0}
            max={0.3}
            step={0.01}
            format={(v) => (v === 0 ? "sem stop" : pct(v))}
            onChange={(v) => setParams((p) => ({ ...p, stopLossPct: v }))}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Metric
            label="Retorno total"
            value={mult(result.totalReturn)}
            tone={beatsBuyAndHold ? "good" : "bad"}
            hint={`segurar: ${mult(bh.totalReturn)}`}
          />
          <Metric label="CAGR" value={pct(result.cagr)} hint={`segurar: ${pct(bh.cagr)}`} />
          <Metric label="Taxa de acerto" value={pct(result.winRate)} />
          <Metric
            label="Queda máxima"
            value={pct(result.maxDrawdown)}
            hint={`segurar: ${pct(bh.maxDrawdown)}`}
          />
          <Metric label="Operações" value={String(result.tradeCount)} />
          <Metric label="Tempo comprado" value={pct(result.timeInMarket)} />
          <Metric label="Sharpe" value={result.sharpe.toFixed(2)} hint={`segurar: ${bh.sharpe.toFixed(2)}`} />
          <Metric label="Retorno médio/op" value={pct(result.meanTradeReturn)} />
        </div>

        {!beatsBuyAndHold && (
          <p className="text-xs rounded-md bg-[#F6465D]/10 text-[#F6465D] px-3 py-2">
            Esta configuração rende menos do que simplesmente comprar e segurar no mesmo
            período.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-black/10 dark:border-white/10 p-4 flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="font-semibold">Monte Carlo</h2>
            <p className="text-xs text-black/50 dark:text-white/50">
              Mesmas {result.tradeCount} operações, mesma duração, mesmo stop — só as
              datas de entrada são sorteadas.
            </p>
          </div>
          <button
            onClick={runMonteCarlo}
            disabled={isPending}
            className="px-4 py-2 text-sm rounded-md bg-[#F0B90B] text-black font-medium disabled:opacity-50"
          >
            {isPending ? "Simulando…" : "Rodar 2.000 cenários"}
          </button>
        </div>

        {mc && (
          <>
            <NullHistogram mc={mc} strategyReturn={result.totalReturn} />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Metric label="Estratégia lunar" value={mult(result.totalReturn)} />
              <Metric label="Sorteio (mediana)" value={mult(mc.medianSample)} />
              <Metric label="Percentil" value={pct(mc.percentile)} />
              <Metric
                label="p-valor"
                value={mc.pValue.toFixed(3)}
                tone={mc.pValue < 0.05 ? "good" : "bad"}
                hint={mc.pValue < 0.05 ? "significativo" : "não significativo"}
              />
            </div>
            <p className="text-xs text-black/50 dark:text-white/50">
              Atenção: este p-valor vale para <em>esta</em> configuração escolhida de
              antemão. Se você mexer nos controles até achar um número bonito, ele deixa
              de valer — testar muitas combinações garante encontrar alguma que parece
              boa por acaso.
            </p>
          </>
        )}
      </section>
    </div>
  );
}
