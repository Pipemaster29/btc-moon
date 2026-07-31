import { NextResponse } from "next/server";

/**
 * Token de conexão do WebSocket público da KuCoin.
 *
 * Este proxy existe porque a API REST da KuCoin não devolve cabeçalhos CORS —
 * o navegador não consegue pedir o token sozinho. Já o WebSocket é isento de
 * CORS, então depois daqui o preço flui direto do navegador para a KuCoin, sem
 * passar pelo servidor. Isso também contorna bloqueio por região: quem conecta
 * é o visitante, não a função na Vercel.
 *
 * O token é de vida curta e single-use, então nada aqui pode ser cacheado.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const BULLET_URL = "https://api.kucoin.com/api/v1/bullet-public";

interface BulletResponse {
  code?: string;
  data?: {
    token?: string;
    instanceServers?: {
      endpoint?: string;
      pingInterval?: number;
      pingTimeout?: number;
    }[];
  };
}

export async function GET() {
  try {
    const res = await fetch(BULLET_URL, {
      method: "POST",
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `KuCoin respondeu ${res.status}` },
        { status: 502 },
      );
    }

    const body: BulletResponse = await res.json();
    const server = body.data?.instanceServers?.[0];

    if (!body.data?.token || !server?.endpoint) {
      return NextResponse.json(
        { error: "Resposta da KuCoin sem token ou endpoint" },
        { status: 502 },
      );
    }

    return NextResponse.json(
      {
        token: body.data.token,
        endpoint: server.endpoint,
        pingInterval: server.pingInterval ?? 18000,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "erro desconhecido";
    return NextResponse.json(
      { error: `Falha ao obter token: ${message}` },
      { status: 502 },
    );
  }
}
