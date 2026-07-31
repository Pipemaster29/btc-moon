"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import {
  CandlestickSeries,
  HistogramSeries,
  createChart,
  createSeriesMarkers,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type ISeriesMarkersPluginApi,
  type SeriesMarker,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, Timeframe } from "@/lib/bitstamp";
import { useLivePrice } from "./LivePriceProvider";
import {
  MOON_PHASE_LABEL,
  MOON_PHASE_SYMBOL,
  moonPhasesBetween,
  type MoonPhaseName,
} from "@/lib/moon";

const TIMEFRAME_LABELS: { value: Timeframe; label: string }[] = [
  { value: "1h", label: "1H" },
  { value: "4h", label: "4H" },
  { value: "1d", label: "1D" },
  { value: "1w", label: "1S" },
];

/** Fases marcadas por padrão: nova e cheia são os extremos do ciclo. */
const DEFAULT_PHASES: MoonPhaseName[] = ["new", "full"];

const PHASE_COLOR: Record<MoonPhaseName, string> = {
  new: "#8B93A7",
  "first-quarter": "#5B8DEF",
  full: "#F0B90B",
  "last-quarter": "#5B8DEF",
};

/**
 * Teto de marcadores desenhados de uma vez. Desde 2011 são ~740 mudanças de
 * fase; renderizar todas deixa o gráfico ilegível, então só entram as que caem
 * no intervalo visível.
 */
const MAX_MARKERS = 120;

const UP_COLOR = "#0ECB81";
const DOWN_COLOR = "#F6465D";

/** Referência estável para o estado vazio, para não refazer efeitos a cada render. */
const EMPTY_CANDLES: Candle[] = [];

/** Duração de cada período, para saber a qual vela um tick ao vivo pertence. */
const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  "1h": 3600,
  "4h": 14400,
  "1d": 86400,
  "1w": 604800,
};

const DARK_QUERY = "(prefers-color-scheme: dark)";

function useIsDark(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(DARK_QUERY);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(DARK_QUERY).matches,
    () => true,
  );
}

export default function PriceChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);

  const [timeframe, setTimeframe] = useState<Timeframe>("1d");
  const [activePhases, setActivePhases] = useState<MoonPhaseName[]>(DEFAULT_PHASES);
  const [logScale, setLogScale] = useState(true);

  // Resultado e erro carregam junto o timeframe a que pertencem, de modo que
  // "carregando" seja estado derivado em vez de um setState dentro do efeito.
  const [loaded, setLoaded] = useState<{ tf: Timeframe; candles: Candle[] } | null>(null);
  const [failure, setFailure] = useState<{ tf: Timeframe; message: string } | null>(null);

  const candles = useMemo(
    () => (loaded?.tf === timeframe ? loaded.candles : EMPTY_CANDLES),
    [loaded, timeframe],
  );
  const error = failure?.tf === timeframe ? failure.message : null;
  const loading = !error && loaded?.tf !== timeframe;

  const isDark = useIsDark();
  const { tick } = useLivePrice();

  // A vela em formação vive fora do React: ela muda a cada tick e só o
  // lightweight-charts precisa saber disso.
  const liveBarRef = useRef<CandlestickData<Time> | null>(null);

  // Fases da lua cobrindo todo o período carregado. Cálculo puro, roda no
  // cliente sem nenhuma chamada de rede.
  const moonPhases = useMemo(() => {
    if (candles.length === 0) return [];
    const from = new Date(candles[0].time * 1000);
    const to = new Date(candles[candles.length - 1].time * 1000);
    return moonPhasesBetween(from, to);
  }, [candles]);

  useEffect(() => {
    const controller = new AbortController();

    fetch(`/api/candles?tf=${timeframe}`, { signal: controller.signal })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
        return body.candles as Candle[];
      })
      .then((data) => setLoaded({ tf: timeframe, candles: data }))
      .catch((err: Error) => {
        if (err.name !== "AbortError") {
          setFailure({ tf: timeframe, message: err.message });
        }
      });

    return () => controller.abort();
  }, [timeframe]);

  // Criação do gráfico — uma vez, e refeita só quando o tema muda.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const textColor = isDark ? "#B7BDC6" : "#4B5563";
    const gridColor = isDark ? "#1F2329" : "#E5E7EB";

    const chart = createChart(container, {
      layout: {
        background: { color: "transparent" },
        textColor,
        attributionLogo: false,
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      rightPriceScale: { borderColor: gridColor },
      timeScale: {
        borderColor: gridColor,
        timeVisible: true,
        // Sem isto o fitContent não consegue comprimir as ~5.500 velas
        // diárias desde 2011: o espaçamento mínimo padrão exigiria uma tela
        // muito mais larga, e o gráfico abriria cortado nos anos recentes.
        minBarSpacing: 0.02,
      },
      crosshair: { mode: 0 },
      autoSize: true,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderUpColor: UP_COLOR,
      borderDownColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
    });
    // Margens folgadas viram muita coisa na escala log, onde a folga é
    // multiplicativa: o padrão levava o topo do eixo à casa dos milhões.
    candleSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.06, bottom: 0.06 },
    });

    // Volume em painel próprio, como nas plataformas de trading. Sobrepor os
    // dois na mesma escala fazia o eixo de preço descer abaixo de zero.
    const volumeSeries = chart.addSeries(
      HistogramSeries,
      { priceFormat: { type: "volume" }, priceScaleId: "" },
      1,
    );

    const panes = chart.panes();
    if (panes.length > 1) {
      panes[0].setHeight(320);
      panes[1].setHeight(100);
    }

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    markersRef.current = createSeriesMarkers(candleSeries, []);

    return () => {
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
      markersRef.current = null;
    };
  }, [isDark]);

  // Alimenta as séries com os candles carregados.
  useEffect(() => {
    const candleSeries = candleSeriesRef.current;
    const volumeSeries = volumeSeriesRef.current;
    if (!candleSeries || !volumeSeries || candles.length === 0) return;

    const candleData: CandlestickData<Time>[] = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    candleSeries.setData(candleData);
    volumeSeries.setData(
      candles.map((c) => ({
        time: c.time as UTCTimestamp,
        value: c.volume,
        color: c.close >= c.open ? `${UP_COLOR}55` : `${DOWN_COLOR}55`,
      })),
    );

    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  // Escala logarítmica: com o preço saindo de US$ 10 em 2011 para seis dígitos,
  // a escala linear achata mais de uma década contra o eixo.
  useEffect(() => {
    candleSeriesRef.current?.priceScale().applyOptions({
      mode: logScale ? 1 : 0,
    });
  }, [logScale, candles]);

  // A última vela segue o preço ao vivo. Sem isto o gráfico congela no
  // fechamento vindo da Bitstamp enquanto a cotação acima dele continua andando.
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series || !tick || candles.length === 0) return;

    const bucket = TIMEFRAME_SECONDS[timeframe];
    const last = candles[candles.length - 1];
    const nowBucket = Math.floor(Date.now() / 1000 / bucket) * bucket;

    let bar = liveBarRef.current;

    if (nowBucket > last.time) {
      // O período virou e a vela nova ainda não existe nos dados carregados.
      if (!bar || bar.time !== nowBucket) {
        bar = {
          time: nowBucket as UTCTimestamp,
          open: tick.price,
          high: tick.price,
          low: tick.price,
          close: tick.price,
        };
      }
    } else if (!bar || bar.time !== last.time) {
      // Ainda dentro do último período carregado: continua a vela existente,
      // preservando abertura, máxima e mínima já registradas.
      bar = {
        time: last.time as UTCTimestamp,
        open: last.open,
        high: last.high,
        low: last.low,
        close: last.close,
      };
    }

    bar.high = Math.max(bar.high, tick.price);
    bar.low = Math.min(bar.low, tick.price);
    bar.close = tick.price;
    liveBarRef.current = bar;

    series.update(bar);
  }, [tick, candles, timeframe]);

  // Trocar de timeframe ou recarregar dados invalida a vela acumulada.
  useEffect(() => {
    liveBarRef.current = null;
  }, [timeframe, candles]);

  // Marcadores lunares, recalculados conforme o intervalo visível.
  useEffect(() => {
    const chart = chartRef.current;
    const plugin = markersRef.current;
    if (!chart || !plugin || candles.length === 0) return;

    const selected = moonPhases.filter((p) => activePhases.includes(p.phase));

    const render = () => {
      const range = chart.timeScale().getVisibleRange();
      const from = range ? Number(range.from) : candles[0].time;
      const to = range ? Number(range.to) : candles[candles.length - 1].time;

      const visible = selected.filter((p) => {
        const seconds = p.date.getTime() / 1000;
        return seconds >= from && seconds <= to;
      });

      // Com o gráfico afastado sobram fases demais para caber; nesse caso os
      // marcadores viram ruído, então some com eles até o usuário aproximar.
      const markers: SeriesMarker<Time>[] =
        visible.length > MAX_MARKERS
          ? []
          : visible.map((p) => ({
              time: Math.floor(p.date.getTime() / 1000) as UTCTimestamp,
              position: "aboveBar" as const,
              color: PHASE_COLOR[p.phase],
              shape: "circle" as const,
              text: MOON_PHASE_SYMBOL[p.phase],
            }));

      plugin.setMarkers(markers);
    };

    render();
    const timeScale = chart.timeScale();
    timeScale.subscribeVisibleTimeRangeChange(render);
    return () => timeScale.unsubscribeVisibleTimeRangeChange(render);
  }, [moonPhases, activePhases, candles]);

  function togglePhase(phase: MoonPhaseName) {
    setActivePhases((current) =>
      current.includes(phase)
        ? current.filter((p) => p !== phase)
        : [...current, phase],
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          {TIMEFRAME_LABELS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setTimeframe(value)}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                timeframe === value
                  ? "bg-[#F0B90B] text-black font-medium"
                  : "hover:bg-black/5 dark:hover:bg-white/10"
              }`}
            >
              {label}
            </button>
          ))}

          <span className="mx-1 h-4 w-px bg-black/10 dark:bg-white/15" />

          <button
            onClick={() => setLogScale((on) => !on)}
            aria-pressed={logScale}
            title="Alterna entre escala logarítmica e linear"
            className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
              logScale
                ? "bg-black/10 dark:bg-white/15 font-medium"
                : "hover:bg-black/5 dark:hover:bg-white/10 opacity-60"
            }`}
          >
            log
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {(Object.keys(MOON_PHASE_LABEL) as MoonPhaseName[]).map((phase) => (
            <button
              key={phase}
              onClick={() => togglePhase(phase)}
              title={MOON_PHASE_LABEL[phase]}
              aria-pressed={activePhases.includes(phase)}
              className={`px-2 py-1 text-xs rounded-md border transition-colors ${
                activePhases.includes(phase)
                  ? "border-current"
                  : "border-transparent opacity-40 hover:opacity-70"
              }`}
              style={{
                color: activePhases.includes(phase)
                  ? PHASE_COLOR[phase]
                  : undefined,
              }}
            >
              {MOON_PHASE_SYMBOL[phase]} {MOON_PHASE_LABEL[phase]}
            </button>
          ))}
        </div>
      </div>

      <div className="relative rounded-xl border border-black/10 dark:border-white/10 overflow-hidden">
        <div ref={containerRef} className="h-[460px] w-full" />

        {loading && (
          <div className="absolute inset-0 grid place-items-center bg-white/60 dark:bg-black/60 text-sm">
            Carregando candles…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center bg-white/80 dark:bg-black/80 text-sm text-[#F6465D] px-4 text-center">
            {error}
          </div>
        )}
      </div>

      {candles.length > 0 && (
        <p className="text-xs text-black/40 dark:text-white/40">
          {candles.length.toLocaleString("pt-BR")} velas ·{" "}
          {new Date(candles[0].time * 1000).toLocaleDateString("pt-BR")} até{" "}
          {new Date(
            candles[candles.length - 1].time * 1000,
          ).toLocaleDateString("pt-BR")}{" "}
          · aproxime o gráfico para ver as fases da lua
        </p>
      )}
    </section>
  );
}
