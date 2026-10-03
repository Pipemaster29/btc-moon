/**
 * A assinatura de preço ao vivo, exercitada de ponta a ponta fora do navegador.
 *
 * Existe porque o caminho que mais importa em `components/vivo.ts` — abrir o
 * WebSocket da Binance, receber, cair para a consulta quando ele morre, religar,
 * fechar quando a aba some — só roda com uma conexão de verdade, e o ambiente em
 * que ele foi escrito não deixa o Chromium abrir WebSocket (o proxy responde 403
 * ao upgrade). O Node abre. Então este script roda o MESMO módulo, pela
 * `assinarVivo` que ele exporta, com um `document` falso para a visibilidade e a
 * consulta apontada para um servidor de verdade.
 *
 * Medido em 23/09 na primeira rodada: consulta em 0,5 s, socket em 1,2 s, preço
 * com 1 s de idade, 19 publicações em 20 s; derrubado, caiu para a consulta e
 * religou; aba oculta fechou; aba de volta reabriu.
 *
 * PRECISA DA APLICAÇÃO RODANDO, e de rede até a Binance — ao contrário do
 * `testar-carteira`, isto não é teste de função pura:
 *
 *   npm run dev                                   (noutro terminal)
 *   npm run testar-vivo                           (http://localhost:3000)
 *   npm run testar-vivo -- http://localhost:3100
 *
 * Sai com código diferente de zero quando algum caso falha.
 */

const BASE = process.argv[2] ?? "http://localhost:3000";

// ------------------------------------------------------------ o ambiente falso

type Ouvinte = () => void;
const ouvintes = new Set<Ouvinte>();
const documento = {
  visibilityState: "visible" as "visible" | "hidden",
  addEventListener: (_: string, f: Ouvinte) => void ouvintes.add(f),
  removeEventListener: (_: string, f: Ouvinte) => void ouvintes.delete(f),
};
(globalThis as unknown as { document: typeof documento }).document = documento;

// A consulta relativa do módulo (`/api/vivo`) vai para o servidor pedido.
const fetchOriginal = globalThis.fetch;
let consultas = 0;
globalThis.fetch = ((u: string | URL | Request, o?: RequestInit) => {
  const url = String(u);
  if (url === "/api/vivo") consultas++;
  return fetchOriginal(url.startsWith("/") ? `${BASE}${url}` : url, o);
}) as typeof fetch;

// Os sockets que o módulo abre ficam à vista, para o teste poder derrubá-los.
const WsOriginal = globalThis.WebSocket;
const sockets: WebSocket[] = [];
globalThis.WebSocket = class extends WsOriginal {
  constructor(url: string | URL, protocolos?: string | string[]) {
    super(url, protocolos);
    sockets.push(this);
  }
} as typeof WebSocket;

const { assinarVivo, lerVivo } = await import("../components/vivo");

// ------------------------------------------------------------------ os casos

let falhas = 0;
function caso(nome: string, ok: boolean, detalhe: string) {
  if (!ok) falhas++;
  console.log(`  ${nome.padEnd(52)} ${detalhe.padEnd(34)} ${ok ? "ok" : "FALHOU"}`);
}
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ultimo = () => sockets[sockets.length - 1];
const aberto = (ws: WebSocket | undefined) => ws !== undefined && ws.readyState === WsOriginal.OPEN;
/** Espera até a condição valer ou o prazo acabar; devolve se valeu. */
async function ate(cond: () => boolean, prazoMs: number): Promise<boolean> {
  const fim = Date.now() + prazoMs;
  while (Date.now() < fim) {
    if (cond()) return true;
    await espera(250);
  }
  return cond();
}

console.log(`\nassinatura ao vivo contra ${BASE}\n`);
let publicacoes = 0;
const sair = assinarVivo(() => {
  publicacoes++;
});

// 1. Consulta primeiro, WebSocket logo depois.
const socketDePe = await ate(() => lerVivo().canal === "websocket", 15_000);
const e0 = lerVivo();
caso("a consulta respondeu com moedas", Object.keys(e0.moedas).length > 0, `${Object.keys(e0.moedas).length} moedas`);
caso("o WebSocket assumiu", socketDePe, `canal=${e0.canal}`);
if (!socketDePe) {
  console.log(
    "\n  Sem WebSocket não há o que testar adiante. Se a consulta respondeu, a tela\n" +
      "  funciona pela reserva de 15 s — mas o caminho principal não foi exercitado.",
  );
  sair();
  process.exit(1);
}

// 2. Vinte segundos de socket: preço fresco, publicação contida.
const pub0 = publicacoes;
const consultas0 = consultas;
await espera(20_000);
const e1 = lerVivo();
const idade = (Date.now() - (e1.em ?? 0)) / 1000;
caso("preço mais novo com menos de 10 s", idade < 10, `${idade.toFixed(1)} s`);
caso("no máximo ~1 publicação por segundo", publicacoes - pub0 <= 22, `${publicacoes - pub0} em 20 s`);
caso("consulta desacelera com o socket de pé", consultas - consultas0 <= 1, `${consultas - consultas0} em 20 s`);
const amostra = Object.entries(e1.moedas)[0];
caso(
  "variação e financiamento continuam na moeda",
  amostra !== undefined && Number.isFinite(amostra[1].variacao24h) && amostra[1].funding !== undefined,
  amostra ? `${amostra[0]} ${(amostra[1].variacao24h * 100).toFixed(1)}%` : "—",
);

// 3. A Binance derruba a conexão: cai para a consulta, religa sozinho.
const antes = sockets.length;
ultimo().close();
const caiu = await ate(() => lerVivo().canal === "consulta", 15_000);
caso("derrubado, cai para a consulta", caiu, `canal=${lerVivo().canal}`);
const religou = await ate(() => sockets.length > antes && lerVivo().canal === "websocket", 30_000);
caso("religa sozinho", religou, `${sockets.length - antes} socket(s) novo(s)`);

// 4. A aba some: fecha. A aba volta: reabre.
documento.visibilityState = "hidden";
for (const f of ouvintes) f();
const fechou = await ate(() => !aberto(ultimo()), 5_000);
caso("aba oculta fecha o socket", fechou, `canal=${lerVivo().canal}`);
documento.visibilityState = "visible";
for (const f of ouvintes) f();
const reabriu = await ate(() => aberto(ultimo()) && lerVivo().canal === "websocket", 20_000);
caso("aba de volta reabre", reabriu, `canal=${lerVivo().canal}`);

// 5. Ninguém mais escuta: tudo dorme.
sair();
const dormiu = await ate(() => !aberto(ultimo()), 5_000);
caso("sem inscritos, o socket fecha", dormiu, `aberto=${aberto(ultimo())}`);

console.log(falhas === 0 ? "\ntudo passou" : `\n${falhas} FALHA(S)`);
process.exit(falhas === 0 ? 0 : 1);
