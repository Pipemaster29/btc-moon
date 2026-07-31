import { NextResponse } from "next/server";

/**
 * Preço atual da KuCoin por REST.
 *
 * Serve de rede de segurança para quando o WebSocket não sobe — rede
 * corporativa bloqueando `wss:`, extensão de navegador, proxy. Sem isto a
 * cotação simplesmente não apareceria nesses casos.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const TICKER_URL =
  "https://api.kucoin.com/api/v1/market/orderbook/level1?symbol=BTC-USDT";

export async function GET() {
  try {
    const res = await fetch(TICKER_URL, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `KuCoin respondeu ${res.status}` },
        { status: 502 },
      );
    }

    const body: { data?: { price?: string; time?: number } } = await res.json();
    const price = Number(body.data?.price);

    if (!Number.isFinite(price)) {
      return NextResponse.json(
        { error: "Resposta da KuCoin sem preço" },
        { status: 502 },
      );
    }

    return NextResponse.json(
      { price, time: body.data?.time ?? Date.now() },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
