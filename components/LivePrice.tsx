"use client";

import { useEffect, useRef, useState } from "react";

type Status = "connecting" | "live" | "polling" | "offline";

interface Tick {
  price: number;
  /** Direção em relação ao tick anterior, para colorir a variação. */
  direction: "up" | "down" | "flat";
}

const SYMBOL = "BTC-USDT";
const TOPIC = `/market/ticker:${SYMBOL}`;

/** Intervalo do fallback por REST, quando o WebSocket não sobe. */
const POLL_MS = 8000;

const STATUS_LABEL: Record<Status, string> = {
  connecting: "conectando",
  live: "ao vivo",
  polling: "atualizando",
  offline: "sem conexão",
};

const STATUS_COLOR: Record<Status, string> = {
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
  const [tick, setTick] = useState<Tick | null>(null);
  const [status, setStatus] = useState<Status>("connecting");

  // Refs para não recriar o efeito de conexão a cada tick recebido.
  const lastPriceRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let cancelled = false;
    let pingTimer: ReturnType<typeof setInterval> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;

    function publish(price: number) {
      if (cancelled || !Number.isFinite(price)) return;
      const previous = lastPriceRef.current;
      lastPriceRef.current = price;
      setTick({
        price,
        direction:
          previous === null || price === previous
            ? "flat"
            : price > previous
              ? "up"
              : "down",
      });
    }

    async function pollOnce() {
      try {
        const res = await fetch("/api/kucoin/ticker", { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const body = await res.json();
        publish(Number(body.price));
        if (!cancelled) setStatus("polling");
      } catch {
        if (!cancelled) setStatus("offline");
      }
    }

    function startPolling() {
      if (cancelled || pollTimer) return;
      void pollOnce();
      pollTimer = setInterval(pollOnce, POLL_MS);
    }

    function stopPolling() {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    }

    async function connect() {
      try {
        const res = await fetch("/api/kucoin/token", { cache: "no-store" });
        if (!res.ok) throw new Error(`token ${res.status}`);
        const { token, endpoint, pingInterval } = await res.json();
        if (cancelled) return;

        const connectId = crypto.randomUUID();
        const socket = new WebSocket(
          `${endpoint}?token=${encodeURIComponent(token)}&connectId=${connectId}`,
        );
        socketRef.current = socket;

        socket.onopen = () => {
          // A KuCoin só envia dados após o "welcome"; a inscrição vai no
          // handler de mensagem, quando ele chega.
          if (cancelled) socket.close();
        };

        socket.onmessage = (event) => {
          if (cancelled) return;
          let msg: {
            type?: string;
            topic?: string;
            data?: { price?: string };
          };
          try {
            msg = JSON.parse(event.data as string);
          } catch {
            return;
          }

          if (msg.type === "welcome") {
            socket.send(
              JSON.stringify({
                id: crypto.randomUUID(),
                type: "subscribe",
                topic: TOPIC,
                privateChannel: false,
                response: true,
              }),
            );

            // A conexão cai se o ping parar; o intervalo vem do próprio servidor.
            pingTimer = setInterval(() => {
              if (socket.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ id: crypto.randomUUID(), type: "ping" }));
              }
            }, pingInterval ?? 18000);
            return;
          }

          if (msg.type === "ack") {
            attempt = 0;
            stopPolling();
            setStatus("live");
            return;
          }

          if (msg.type === "message" && msg.topic === TOPIC && msg.data?.price) {
            publish(Number(msg.data.price));
          }
        };

        const degrade = () => {
          if (cancelled) return;
          if (pingTimer) {
            clearInterval(pingTimer);
            pingTimer = null;
          }
          startPolling();

          // Reconecta com espera crescente, até 30s, para não martelar a API.
          attempt += 1;
          const delay = Math.min(1000 * 2 ** attempt, 30000);
          retryTimer = setTimeout(connect, delay);
        };

        socket.onerror = degrade;
        socket.onclose = degrade;
      } catch {
        if (cancelled) return;
        startPolling();
        attempt += 1;
        retryTimer = setTimeout(connect, Math.min(1000 * 2 ** attempt, 30000));
      }
    }

    // O polling começa junto com a tentativa de WebSocket, em vez de esperar
    // ela falhar: o preço aparece de imediato e o stream assume quando abre.
    // Sem isto, uma rede que bloqueia `wss:` deixa a cotação vazia por vários
    // segundos antes do primeiro fallback.
    startPolling();
    void connect();

    return () => {
      cancelled = true;
      if (pingTimer) clearInterval(pingTimer);
      if (pollTimer) clearInterval(pollTimer);
      if (retryTimer) clearTimeout(retryTimer);
      const socket = socketRef.current;
      if (socket) {
        // Zera os handlers antes de fechar: onclose dispararia a reconexão.
        socket.onopen = null;
        socket.onmessage = null;
        socket.onerror = null;
        socket.onclose = null;
        socket.close();
        socketRef.current = null;
      }
    };
  }, []);

  const change =
    tick && referenceClose ? tick.price / referenceClose - 1 : null;

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
