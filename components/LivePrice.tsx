"use client";

import { useLivePrice, type LiveStatus } from "./LivePriceProvider";

const STATUS_LABEL: Record<LiveStatus, string> = {
  connecting: "conectando",
  live: "ao vivo",
  polling: "atualizando",
  offline: "sem conexão",
};

const STATUS_COLOR: Record<LiveStatus, string> = {
  connecting: "#8B93A7",
  live: "#0ECB81",
  polling: "#F0B90B",
  offline: "#F6465D",
};

function formatUsd(value: number): string {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function LivePrice({ referenceClose }: { referenceClose?: number }) {
  const { tick, status } = useLivePrice();

  const change = tick && referenceClose ? tick.price / referenceClose - 1 : null;

  const priceColor =
    tick?.direction === "up"
      ? "text-[#0ECB81]"
      : tick?.direction === "down"
        ? "text-[#F6465D]"
        : "";

  return (
    <div className="flex items-baseline gap-3 flex-wrap">
      <span
        className={`text-3xl font-semibold tabular-nums transition-colors duration-300 ${priceColor}`}
      >
        {tick ? formatUsd(tick.price) : "—"}
      </span>

      {change !== null && (
        <span
          className={`text-sm font-medium ${
            change >= 0 ? "text-[#0ECB81]" : "text-[#F6465D]"
          }`}
        >
          {change >= 0 ? "+" : ""}
          {(change * 100).toFixed(2)}% hoje
        </span>
      )}

      <span className="flex items-center gap-1.5 text-xs text-black/50 dark:text-white/50">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full"
          style={{ backgroundColor: STATUS_COLOR[status] }}
          aria-hidden
        />
        KuCoin · {STATUS_LABEL[status]}
      </span>
    </div>
  );
}
