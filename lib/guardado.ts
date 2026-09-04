/**
 * Como a página lê qualquer arquivo de `data/` — e por que a ordem depende de
 * onde ela está rodando.
 *
 * Havia quatro cópias desta lógica (`getSnapshot`, `getCarteira`, `getPlacar`,
 * `getGarimpo`), todas com a mesma ordem fixa: GitHub raw primeiro, disco
 * depois. A ordem está certa EM PRODUÇÃO e está errada em todo o resto, e o
 * custo disso não é teórico.
 *
 * EM PRODUÇÃO o disco é o do BUILD. O `ignoreCommand` do `vercel.json` pula o
 * build quando só `data/` mudou, então um arquivo lido do disco fica congelado
 * no último deploy — podendo ter dias. O GitHub raw é a única camada que fica
 * fresca sem um deploy novo, e por isso ela vem primeiro.
 *
 * EM DESENVOLVIMENTO A REGRA SE INVERTE, e a versão anterior não invertia. O
 * disco é o arquivo que você ACABOU DE GERAR; o raw é a produção. Com a ordem de
 * produção valendo aqui, rodar `npm run carteira` e abrir a página mostrava a
 * carteira do `main`. Medido em 04/09: o disco marcava US$ 999,57 com a queda
 * máxima medida, e a página exibia US$ 998,11 sem ela — o número da produção.
 *
 * O efeito prático é o pior possível para quem está desenvolvendo: você muda o
 * código, roda o script, abre a página e NADA MUDA. Não há erro, não há aviso —
 * a página está lendo outra máquina. Foi exatamente essa a queixa que fez este
 * arquivo existir.
 */

/**
 * Onde o dado exibido veio.
 *
 * "cálculo" não sai daqui — é a terceira camada do panorama, que recalcula tudo
 * do zero. Está no tipo porque quem consome carimba a tela com ela.
 */
export type Fonte = "github" | "disco" | "cálculo";

/**
 * Em produção o raw manda; em qualquer outro lugar, o disco.
 *
 * `NODE_ENV` é "production" no build e no `next start`, "development" no
 * `next dev`, e indefinido nos scripts do `tsx` — e para os dois últimos a
 * resposta certa é a mesma: o arquivo local é o que importa.
 */
export function rawPrimeiro(): boolean {
  return process.env.NODE_ENV === "production";
}

const BASE_RAW = "https://raw.githubusercontent.com/Pipemaster29/btc-moon/main";

/**
 * Quatro segundos, não oito.
 *
 * São arquivos estáticos vindos de CDN, e o que vem depois — refazer a camada
 * viva, no caso do panorama — precisa do orçamento da função serverless. Se o
 * GitHub demorar mais do que isso, o disco responde na hora.
 */
const ESPERA_MS = 4_000;

export interface Guardado<T> {
  dado: T;
  fonte: Fonte;
}

/**
 * Lê `data/<arquivo>` da camada certa para o ambiente, validando as duas.
 *
 * `valido` NÃO é opcional de propósito: um JSON que interpreta mas não tem a
 * forma esperada é pior do que um que falha, porque ele segue para a tela. Cada
 * chamador diz o que considera um arquivo bom, e a camada seguinte é tentada
 * quando a primeira não passa.
 */
export async function lerGuardado<T>(
  arquivo: string,
  valido: (dado: unknown) => T | null,
  revalidate: number,
): Promise<Guardado<T> | null> {
  const daRede = async (): Promise<Guardado<T> | null> => {
    try {
      const res = await fetch(`${BASE_RAW}/data/${arquivo}`, {
        signal: AbortSignal.timeout(ESPERA_MS),
        next: { revalidate },
      });
      if (!res.ok) return null;
      const d = valido(await res.json());
      return d ? { dado: d, fonte: "github" } : null;
    } catch {
      return null;
    }
  };

  const doDisco = async (): Promise<Guardado<T> | null> => {
    try {
      // `import()` dentro da função para este módulo poder ser importado por
      // código que também roda no navegador.
      const { readFile } = await import("node:fs/promises");
      const d = valido(JSON.parse(await readFile(`data/${arquivo}`, "utf8")));
      return d ? { dado: d, fonte: "disco" } : null;
    } catch {
      return null;
    }
  };

  const [primeira, segunda] = rawPrimeiro() ? [daRede, doDisco] : [doDisco, daRede];
  return (await primeira()) ?? (await segunda());
}
