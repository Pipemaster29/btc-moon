import { NextResponse } from "next/server";
import { cotacoes, fundings } from "@/lib/binance";
import { ATIVAS } from "@/lib/watchlist";

/**
 * O preço de agora de todas as moedas vigiadas, para a página não precisar
 * recarregar para andar.
 *
 * ISTO EXISTE POR CAUSA DA ARMADILHA Nº 6 do AGENTS.md — "o retrato é velho e a
 * página não pode fingir que não". A página do radar é servida do retrato, o
 * retrato sai de duas a cinco vezes por dia, e um pump de 120% cabe inteiro
 * entre dois. A camada viva do servidor conserta isso no momento em que a página
 * é montada; daí em diante a aba fica parada até alguém recarregar. Esta rota é
 * o que faz a tela continuar andando depois disso.
 *
 * DUAS REQUISIÇÕES À BINANCE PARA QUALQUER NÚMERO DE MOEDAS E DE ABAS. Os dois
 * endereços devolvem a praça inteira de uma vez, e o `next.revalidate` de cada
 * um deduplica no servidor — dez abas abertas não viram dez requisições. É por
 * isso que a cadência do cliente pode ser de segundos sem abusar de uma API
 * pública que não pede chave.
 *
 * ISSO FOI MEDIDO, E CONTRARIA A DOCUMENTAÇÃO DO PRÓPRIO NEXT. O guia diz que
 * `dynamic = "force-dynamic"` equivale a `fetchCache = 'force-no-store'`, que
 * "força toda requisição a ser refeita mesmo que ela peça cache" — o que
 * anularia o `revalidate` daqui e faria cada consulta do cliente virar duas
 * viagens à Binance. Medido em 04/09 no Next 16.2.12, cinco chamadas seguidas à
 * rota: 1,107s a primeira e 37, 11, 10 e 13 MILISSEGUNDOS as outras; esperando
 * treze segundos, a seguinte volta a 0,672s e a de logo depois a 0,013s. O
 * cache existe e respeita o TTL, então o texto acima vale.
 *
 * FICA REGISTRADO PORQUE É FRÁGIL: a garantia depende de um comportamento que a
 * documentação nega, e o dia em que ele mudar numa atualização do Next o modo de
 * falha não é a tela quebrar — é a Binance começar a recusar por excesso, o que
 * derruba panorama, carteira e monitor junto. Quem atualizar o Next: repita a
 * medição das cinco chamadas antes de confiar nela de novo.
 *
 * O financiamento vem junto porque a carteira precisa dele para marcar posição:
 * são três cobranças por dia sobre o nocional, e a 3x isso é 0,16% da margem por
 * dia numa taxa comum da lista. Marcar preço vivo com financiamento velho
 * mostraria a posição valendo mais do que ela vale.
 */
export const dynamic = "force-dynamic";

/** Sem sufixo do par: é assim que a carteira e o histórico chamam a moeda. */
const VIGIADAS = ATIVAS.filter((t) => /USDT$/.test(t.symbol)).map((t) => ({
  ticker: t.symbol.replace(/USDT$/, ""),
  symbol: t.symbol,
}));

export interface MoedaViva {
  preco: number;
  /** Fração, não porcento. */
  variacao24h: number;
  /** Taxa por período de 8h, quando a Binance a publica para o símbolo. */
  funding: number | null;
}

export interface RespostaViva {
  /** Quando o servidor leu a praça, em milissegundos. */
  em: number;
  moedas: Record<string, MoedaViva>;
}

export async function GET() {
  // As duas em paralelo e cada uma com direito a falhar sozinha: sem preço a
  // camada viva não serve para nada, mas sem financiamento ela ainda serve.
  const [precos, taxas] = await Promise.all([cotacoes(), fundings()]);

  const moedas: Record<string, MoedaViva> = {};
  for (const { ticker, symbol } of VIGIADAS) {
    const c = precos.get(symbol);
    if (!c) continue;
    const f = taxas.get(symbol);
    moedas[ticker] = {
      preco: c.preco,
      variacao24h: c.variacao24h,
      // `null` e não `?? 0`: taxa ausente e taxa zero levam a carteira a cobrar
      // coisas diferentes — a primeira cai na estimativa, a segunda não cobra
      // nada. É a armadilha nº 2 do AGENTS.md, e ela já custou caro aqui.
      funding: f != null && Number.isFinite(f) ? f : null,
    };
  }

  const corpo: RespostaViva = { em: Date.now(), moedas };

  // Se a Binance não respondeu, isto é um 502 e não um objeto vazio: o cliente
  // precisa distinguir "nenhuma moeda andou" de "não consegui olhar", que é a
  // distinção que este projeto mais teme perder.
  if (Object.keys(moedas).length === 0) {
    return NextResponse.json(
      { error: "a Binance não devolveu cotação para nenhuma moeda da lista" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json(corpo, { headers: { "Cache-Control": "no-store" } });
}
