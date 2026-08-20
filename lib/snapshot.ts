/**
 * De onde a página tira o panorama, em três camadas.
 *
 * Calcular na hora custa vinte segundos, e função serverless costuma ser
 * cortada em dez — então o caminho normal é ler o que `npm run panorama` já
 * deixou pronto. As três camadas existem porque cada uma falha de um jeito
 * diferente, e nenhuma delas sozinha é confiável:
 *
 *   1. GITHUB RAW   o arquivo como está no repositório AGORA. É a única camada
 *                   que fica fresca sem um novo deploy, já que o workflow grava
 *                   de trinta em trinta minutos. Falha quando o GitHub falha ou
 *                   quando o repositório é privado.
 *   2. DISCO        o mesmo arquivo, mas congelado no momento do build. Sempre
 *                   funciona, inclusive offline e em desenvolvimento, e é tão
 *                   velho quanto o último deploy.
 *   3. CÁLCULO      a fonte da verdade, sempre correta e sempre cara. Existe
 *                   para o primeiro deploy, quando ainda não há arquivo nenhum,
 *                   e para o caso de as duas primeiras sumirem.
 *
 * O carimbo de quando o retrato foi tirado sobe junto para a tela. Dado velho
 * apresentado como atual é pior do que dado ausente: quem olha não tem como
 * desconfiar.
 */

import { readFile } from "node:fs/promises";
import { getPanorama, type PanoramaRow } from "./overview";

const RAW =
  "https://raw.githubusercontent.com/Pipemaster29/btc-moon/main/data/panorama.json";

const CAMINHO = "data/panorama.json";

/** Acima disso o retrato deixa de ser "agora" e a tela avisa. */
export const VELHO_MINUTOS = 45;

export type Fonte = "github" | "disco" | "cálculo";

export interface Snapshot {
  moedas: PanoramaRow[];
  geradoEm: number;
  fonte: Fonte;
  /** Minutos desde que o retrato foi tirado. */
  idadeMinutos: number;
  velho: boolean;
}

interface Arquivo {
  geradoEm: number;
  moedas: PanoramaRow[];
}

function valido(dado: unknown): dado is Arquivo {
  const a = dado as Arquivo;
  return (
    typeof a?.geradoEm === "number" &&
    Array.isArray(a?.moedas) &&
    a.moedas.length > 0
  );
}

function montar(arquivo: Arquivo, fonte: Fonte): Snapshot {
  const idadeMinutos = Math.max(0, (Date.now() - arquivo.geradoEm) / 60_000);
  return {
    moedas: arquivo.moedas,
    geradoEm: arquivo.geradoEm,
    fonte,
    idadeMinutos,
    velho: idadeMinutos > VELHO_MINUTOS,
  };
}

export async function getSnapshot(): Promise<Snapshot> {
  // 1. o repositório
  try {
    const res = await fetch(RAW, {
      signal: AbortSignal.timeout(8_000),
      next: { revalidate: 120 },
    });
    if (res.ok) {
      const dado = await res.json();
      if (valido(dado)) return montar(dado, "github");
    }
  } catch {
    // Cai para a próxima camada.
  }

  // 2. o disco
  try {
    const dado = JSON.parse(await readFile(CAMINHO, "utf8"));
    if (valido(dado)) return montar(dado, "disco");
  } catch {
    // Cai para a próxima camada.
  }

  // 3. na mão
  const moedas = await getPanorama();
  return {
    moedas,
    geradoEm: Date.now(),
    fonte: "cálculo",
    idadeMinutos: 0,
    velho: false,
  };
}
