/**
 * O PEDIDO À API DA HYPERLIQUID, com o teto de peso, num lugar só: o download
 * da reconstrução (`baixar-baleias.mts`) e o coletor ao vivo (`baleias-hl.mts`)
 * tinham cada um o seu, e eles reagiam diferente ao 429 — o download esperava o
 * minuto, o coletor tentava de novo na hora. Os dois batem no MESMO teto por IP.
 *
 * O teto da API é de 1.200 de peso por minuto por IP (+1 a cada 20 itens
 * devolvidos, em `userFills` e afins); quem pede se dá 1.000, para sobrar folga
 * a pedido de fora do script. No 429, o minuto inteiro de espera.
 */

const API = "https://api.hyperliquid.xyz/info";

export interface Pedidor {
  /** POST na API com o peso pago antes; o peso a mais pelo tamanho da resposta (`porItem`) é pago depois. Nulo depois das tentativas. */
  pedir<T>(corpo: object, peso: number, porItem?: number): Promise<T | null>;
  /** Quantos pedidos desistiram depois de todas as tentativas. */
  falhas(): number;
}

export function criarPedidor(o: { orcamentoPorMinuto?: number; tentativas: number; tempoLimiteMs: number }): Pedidor {
  const orcamento = o.orcamentoPorMinuto ?? 1000;
  let gasto = 0;
  let inicioDoMinuto = Date.now();
  let falhas = 0;
  async function pagar(peso: number): Promise<void> {
    for (;;) {
      const agora = Date.now();
      if (agora - inicioDoMinuto >= 60_000) {
        inicioDoMinuto = agora;
        gasto = 0;
      }
      if (gasto + peso <= orcamento) {
        gasto += peso;
        return;
      }
      await new Promise((r) => setTimeout(r, 60_000 - (agora - inicioDoMinuto) + 50));
    }
  }
  async function pedir<T>(corpo: object, peso: number, porItem = 0): Promise<T | null> {
    for (let tentativa = 1; tentativa <= o.tentativas; tentativa++) {
      await pagar(peso);
      try {
        const res = await fetch(API, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo), signal: AbortSignal.timeout(o.tempoLimiteMs) });
        if (res.status === 429) {
          // O teto foi batido mesmo com a conta: espera o minuto inteiro.
          gasto = orcamento;
          await new Promise((r) => setTimeout(r, 60_000));
          continue;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as T;
        if (porItem > 0 && Array.isArray(j)) await pagar(Math.floor(j.length / porItem));
        return j;
      } catch (e) {
        if (process.env.DEPURAR) console.error(`pedido ${(corpo as { type?: string }).type} falhou (tentativa ${tentativa}): ${(e as Error).message}`);
        await new Promise((r) => setTimeout(r, 2000 * tentativa));
      }
    }
    falhas++;
    return null;
  }
  return { pedir, falhas: () => falhas };
}
