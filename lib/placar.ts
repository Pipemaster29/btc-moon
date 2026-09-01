/**
 * A nota que o painel tira na própria prova.
 *
 * Gravado por `npm run placar`, que lê o histórico de emissões e compara cada
 * viés que esteve na tela com o que o preço fez depois. Existe para ficar VISÍVEL
 * na página, e não escondido num terminal: um painel que recomenda comprar e
 * vender sem dizer se isso já funcionou alguma vez está pedindo confiança que
 * não mediu.
 */

import { readFile } from "node:fs/promises";

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
}

export async function getPlacar(): Promise<Placar | null> {
  try {
    const dado = JSON.parse(await readFile("data/placar.json", "utf8")) as Placar;
    return Array.isArray(dado?.vereditos) ? dado : null;
  } catch {
    return null;
  }
}
