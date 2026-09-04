/**
 * A nota que o painel tira na própria prova.
 *
 * Gravado por `npm run placar`, que lê o histórico de emissões e compara cada
 * viés que esteve na tela com o que o preço fez depois. Existe para ficar VISÍVEL
 * na página, e não escondido num terminal: um painel que recomenda comprar e
 * vender sem dizer se isso já funcionou alguma vez está pedindo confiança que
 * não mediu.
 */

import { lerGuardado } from "./guardado";

export interface Veredito {
  vies: string;
  n: number;
  /** Quanto o viés separa da referência, a favor da direção dele. */
  delta: number;
  /** Fração das moedas em que a separação aparece. */
  concordancia: number;
  passa: boolean;
}

export interface Placar {
  geradoEm: number;
  horizonte: number;
  janela: { de: string; ate: string };
  emissoes: number;
  moedas: number;
  /** Mediana de TODAS as observações: sem ela nenhum viés significa nada. */
  referencia: number;
  vereditos: Veredito[];
  /**
   * O placar dentro de cada moeda, contra a mediana dela mesma.
   *
   * O agregado esconde o que interessa para operar: um viés pode separar em
   * cinco moedas e inverter em outras cinco, e o total dá zero.
   */
  porMoeda?: Record<
    string,
    { n: number; refMoeda: number; vieses: Record<string, { n: number; delta: number }> }
  >;
}

/**
 * O placar gravado, com as MESMAS duas camadas do panorama e da carteira.
 *
 * Ele lia SÓ O DISCO, e em produção o disco é o do BUILD — que é exatamente o
 * defeito que `getCarteira` já tinha e documenta ter consertado. Aqui ele era
 * pior de perceber por causa do `vercel.json`: o `ignoreCommand` pula o build
 * quando só `data/` mudou, então um `npm run placar` novo, commitado sozinho,
 * NUNCA chegaria à tela. O painel continuaria mostrando o veredito antigo com a
 * janela antiga do lado, e a janela antiga tem cara de carimbo de frescor.
 *
 * O `geradoEm` sobe junto para a página, que é a outra metade do conserto: dado
 * velho apresentado como atual é pior do que dado ausente.
 */
export async function getPlacar(): Promise<Placar | null> {
  const g = await lerGuardado<Placar>(
    "placar.json",
    (d) => (Array.isArray((d as Placar)?.vereditos) ? (d as Placar) : null),
    600,
  );
  return g?.dado ?? null;
}
