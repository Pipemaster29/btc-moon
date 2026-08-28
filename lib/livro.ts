/**
 * O livro de ofertas do perpétuo — as paredes de compra e de venda.
 *
 * Faltava a única medida de PRESSÃO IMEDIATA que existe. Tudo o mais aqui olha
 * para posição montada (open interest), para oferta parada (carteira de
 * corretora) ou para o passado (velas). O livro mostra o que está no caminho do
 * preço agora: quanto dinheiro é preciso para andar 1%, e onde tem parede.
 *
 * DUAS RESSALVAS, e elas não são detalhe.
 *
 * A primeira: livro é EFÊMERO. Uma parede de US$ 200 mil pode sumir no segundo
 * seguinte, porque cancelar ordem não custa nada — é o material de que é feito
 * o spoofing. Por isso o que sai daqui é sempre um retrato datado, e a leitura
 * honesta é "havia isto neste instante", nunca "existe suporte em tal preço".
 *
 * A segunda: este é o livro do PERPÉTUO, não do mercado à vista. Ele diz o que
 * segura o preço do derivativo. Numa moeda em que o open interest vale vinte
 * vezes a pool, é o livro que importa; numa em que a pool é maior, ele é só
 * metade da história.
 *
 * A Binance devolve 1000 níveis por lado sem chave, pelo mesmo host que serve
 * o resto (`www.binance.com`).
 */

const BASE = "https://www.binance.com";

export interface Nivel {
  preco: number;
  quantidade: number;
  usd: number;
  /** Distância até o meio do livro, em fração. Negativa abaixo. */
  distancia: number;
}

export interface Parede {
  preco: number;
  usd: number;
  distancia: number;
  /** Quantas vezes o nível mediano do livro esta parede vale. */
  vezes: number;
  lado: "compra" | "venda";
}

export interface Livro {
  quando: number;
  meio: number;
  spread: number;
  bids: Nivel[];
  asks: Nivel[];
  /** Dólares acumulados até andar tanto por cento, por lado. */
  profundidade: { faixa: number; compra: number; venda: number }[];
  paredes: Parede[];
  /** Compra ÷ venda dentro de 2% do meio. Acima de 1, mais compra apoiando. */
  desequilibrio: number;
}

/** Uma parede precisa valer isto em relação ao nível mediano para ser parede. */
const VEZES_MINIMO = 8;

/** Faixas em que a profundidade é medida, em fração do preço. */
const FAIXAS = [0.005, 0.01, 0.02, 0.05, 0.1];

export async function lerLivro(symbol: string, limite = 1000): Promise<Livro | null> {
  try {
    const res = await fetch(`${BASE}/fapi/v1/depth?symbol=${symbol}&limit=${limite}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return null;
    const cru = (await res.json()) as { bids?: [string, string][]; asks?: [string, string][] };
    if (!Array.isArray(cru.bids) || !Array.isArray(cru.asks) || cru.bids.length === 0) return null;

    const meio = (Number(cru.bids[0][0]) + Number(cru.asks[0][0])) / 2;
    if (!(meio > 0)) return null;

    const monta = (linhas: [string, string][], sinal: number): Nivel[] =>
      linhas
        .map(([p, q]) => {
          const preco = Number(p);
          const quantidade = Number(q);
          return { preco, quantidade, usd: preco * quantidade, distancia: sinal * Math.abs(preco / meio - 1) };
        })
        .filter((n) => n.usd > 0);

    const bids = monta(cru.bids, -1);
    const asks = monta(cru.asks, 1);

    const profundidade = FAIXAS.map((faixa) => ({
      faixa,
      compra: bids.filter((n) => -n.distancia <= faixa).reduce((s, n) => s + n.usd, 0),
      venda: asks.filter((n) => n.distancia <= faixa).reduce((s, n) => s + n.usd, 0),
    }));

    // A mediana, e não a média: um livro com uma parede gigante tem média
    // puxada por ela, e aí a própria parede deixa de se destacar.
    const todos = [...bids, ...asks].map((n) => n.usd).sort((a, b) => a - b);
    const mediana = todos[Math.floor(todos.length / 2)] || 0;

    const paredes: Parede[] = [];
    if (mediana > 0) {
      for (const [lado, lista] of [["compra", bids], ["venda", asks]] as const) {
        for (const n of lista) {
          const vezes = n.usd / mediana;
          if (vezes >= VEZES_MINIMO && Math.abs(n.distancia) <= 0.15) {
            paredes.push({ preco: n.preco, usd: n.usd, distancia: n.distancia, vezes, lado });
          }
        }
      }
      paredes.sort((a, b) => b.usd - a.usd);
    }

    const dentro = profundidade.find((p) => p.faixa === 0.02)!;

    return {
      quando: Date.now(),
      meio,
      spread: Number(cru.asks[0][0]) / Number(cru.bids[0][0]) - 1,
      bids,
      asks,
      profundidade,
      paredes: paredes.slice(0, 12),
      desequilibrio: dentro.venda > 0 ? dentro.compra / dentro.venda : NaN,
    };
  } catch {
    return null;
  }
}

/**
 * O histórico de financiamento, e o que ele custa por ano.
 *
 * Financiamento alto e positivo é o comprado pagando para continuar comprado.
 * Ele não prevê queda sozinho — mas diz quanto custa esperar, e é o número que
 * transforma "estou comprado há duas semanas" em uma conta.
 */
export async function financiamento(symbol: string, limite = 30) {
  try {
    const res = await fetch(`${BASE}/fapi/v1/fundingRate?symbol=${symbol}&limit=${limite}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) return [];
    const cru = (await res.json()) as { fundingTime: number; fundingRate: string }[];
    if (!Array.isArray(cru)) return [];
    return cru
      .map((r) => ({ quando: Number(r.fundingTime), taxa: Number(r.fundingRate) }))
      .filter((r) => Number.isFinite(r.taxa))
      .sort((a, b) => a.quando - b.quando);
  } catch {
    return [];
  }
}
