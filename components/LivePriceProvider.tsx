"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type LiveStatus = "connecting" | "live" | "polling" | "offline";

export interface LiveTick {
  price: number;
  /** Direção em relação ao tick anterior, para colorir a variação. */
  direction: "up" | "down" | "flat";
}

interface LivePriceValue {
  tick: LiveTick | null;
  status: LiveStatus;
}

const LivePriceContext = createContext<LivePriceValue>({
  tick: null,
  status: "connecting",
});

/** Preço ao vivo compartilhado — o mesmo stream alimenta cotação e gráfico. */
export function useLivePrice(): LivePriceValue {
  return useContext(LivePriceContext);
}

const SYMBOL = "BTC-USDT";
const TOPIC = `/market/ticker:${SYMBOL}`;

/** Intervalo do fallback por REST, quando o WebSocket não sobe. */
const POLL_MS = 8000;

/**
 * Mantém uma única conexão com a KuCoin para toda a página.
 *
 * Ficava só na cotação do topo, e o gráfico não tinha como saber do preço —
 * a última vela ficava congelada no fechamento vindo da Bitstamp enquanto o
 * número acima dela andava. Centralizar aqui resolve isso sem abrir uma
 * segunda conexão.
 */
export default function LivePriceProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState<LiveTick | null>(null);
  const [status, setStatus] = useState<LiveStatus>("connecting");

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
        if (!cancelled) setStatus((s) => (s === "live" ? s : "polling"));
      } catch {
        if (!cancelled) setStatus((s) => (s === "live" ? s : "offline"));
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
          if (cancelled) socket.close();
        };

        socket.onmessage = (event) => {
          if (cancelled) return;
          let msg: { type?: string; topic?: string; data?: { price?: string } };
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
                socket.send(
                  JSON.stringify({ id: crypto.randomUUID(), type: "ping" }),
                );
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
          setStatus((s) => (s === "live" ? "polling" : s));
          startPolling();

          // Reconecta com espera crescente, até 30s, para não martelar a API.
          attempt += 1;
          retryTimer = setTimeout(connect, Math.min(1000 * 2 ** attempt, 30000));
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

  return (
    <LivePriceContext.Provider value={{ tick, status }}>
      {children}
    </LivePriceContext.Provider>
  );
}
