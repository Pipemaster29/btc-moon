import { NextResponse } from "next/server";
import { getCandles, TIMEFRAMES, type Timeframe } from "@/lib/bitstamp";

export const revalidate = 3600;

export async function GET(request: Request) {
  const requested = new URL(request.url).searchParams.get("tf") ?? "1d";

  if (!(requested in TIMEFRAMES)) {
    return NextResponse.json(
      { error: `Timeframe inválido: ${requested}` },
      { status: 400 },
    );
  }

  try {
    const candles = await getCandles(requested as Timeframe);
    return NextResponse.json({ candles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro desconhecido";
    return NextResponse.json(
      { error: `Falha ao buscar candles: ${message}` },
      { status: 502 },
    );
  }
}
