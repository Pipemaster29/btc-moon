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
import { getOverview, getPanorama, type PanoramaRow } from "./overview";
import { lerVies, type Vida } from "./lifecycle";
import { lerEstudo } from "./estudo";

const RAW =
  "https://raw.githubusercontent.com/Pipemaster29/btc-moon/main/data/panorama.json";

const CAMINHO = "data/panorama.json";

/**
 * Quando o retrato deixa de ser "agora", e quando ele está de fato parado.
 *
 * Os quarenta e cinco minutos originais eram um chute, e a realidade medida é
 * outra: o cron pede duas execuções por hora, o GitHub entrega uma, com atraso
 * de zero a vinte e oito minutos, e o laço leva trinta e cinco. Somando, o
 * intervalo normal entre retratos chega perto de noventa minutos mesmo com tudo
 * funcionando — e um aviso que acende quando não há problema treina quem olha a
 * ignorá-lo.
 *
 * Com o retrato de abertura, o intervalo típico cai pela metade. Os cortes abaixo
 * distinguem atraso de parada: o primeiro é informação, o segundo é chamado.
 */
export const ATRASADO_MINUTOS = 100;
export const PARADO_MINUTOS = 240;

export type Fonte = "github" | "disco" | "cálculo";

export interface Snapshot {
  moedas: PanoramaRow[];
  geradoEm: number;
  fonte: Fonte;
  /** Minutos desde que o retrato foi tirado. */
  idadeMinutos: number;
  /** Passou do intervalo normal entre execuções. */
  atrasado: boolean;
  /** Tempo demais: alguma coisa quebrou. */
  parado: boolean;
  /**
   * Quando a camada barata foi refeita por cima do retrato guardado, se foi.
   *
   * Preço, open interest, posicionamento e nota são duas requisições por moeda
   * e voltam em segundos; estágio de vida e leitura são dez arquivos por moeda e
   * não cabem numa função serverless. São dois relógios diferentes no mesmo
   * objeto, e juntá-los num só seria mentir sobre a idade de metade dos números.
   */
  vivoEm: number | null;
  /** Moedas que estavam na lista e não existiam no retrato guardado. */
  novas: string[];
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
    atrasado: idadeMinutos > ATRASADO_MINUTOS,
    parado: idadeMinutos > PARADO_MINUTOS,
    vivoEm: null,
    novas: [],
  };
}

/**
 * Quanto tempo vale a pena esperar pela camada viva.
 *
 * Se ela não voltar a tempo, a página sai com o retrato guardado em vez de
 * estourar o limite da função serverless. Perder o refresco é aceitável; não
 * abrir a página não é.
 */
const ORCAMENTO_VIVO_MS = 7_000;

/**
 * O estágio guardado, corrigido quando o preço vivo desmente o pico.
 *
 * `vida.estagio` custa seis meses de histórico e não cabe na camada viva. Mas
 * há um caso em que o guardado é DEMONSTRAVELMENTE falso e o conserto é
 * aritmética: quando o preço de agora passou da máxima que o retrato registrou,
 * a moeda não pode estar "em queda longa" — ela está na máxima.
 *
 * Foi o que a AKE mostrou em 02/09: retrato das 12:45 com pico de 0,0163 em
 * 14/08 e estágio "em queda longa", e o preço às 19:28 em 0,0188. O painel
 * mostrava o preço novo embaixo do veredito velho.
 *
 * Só o que o preço prova é corrigido. Fundo, amplitude e dias de série ficam
 * como estavam, porque para esses o preço de agora não é evidência.
 */
function corrigirPico(vida: Vida | null, preco: number): Vida | null {
  // `Number.isFinite` e não `preco > 0`: NaN faz TODA comparação devolver falso,
  // então `preco <= 0 || preco <= vida.pico` deixava NaN passar e a moeda saía
  // "no topo" com pico NaN, envenenando a leitura inteira dela.
  if (!vida || !Number.isFinite(preco) || preco <= 0 || preco <= vida.pico) return vida;
  // `Vida` não guarda o fundo, guarda a alta desde ele — que dá na mesma de
  // trás para frente, e evita inventar um campo só para este conserto.
  const fundo = vida.preco > 0 ? vida.preco / (1 + vida.altaDesdeFundo) : 0;
  return {
    ...vida,
    preco,
    pico: preco,
    picoEm: new Date().toISOString().slice(0, 10),
    diasDesdePico: 0,
    queda: 0,
    altaDesdeFundo: fundo > 0 ? preco / fundo - 1 : vida.altaDesdeFundo,
    amplitude: fundo > 0 ? preco / fundo : vida.amplitude,
    estagio: "no topo",
  };
}

/**
 * A leitura refeita com os sinais de agora — de graça, porque `lerVies` é pura.
 *
 * O refresco atualizava preço, open interest e posicionamento e mantinha a
 * LEITURA do retrato, que é o veredito que a página exibe em cima deles. O
 * resultado é a pior combinação possível: número novo embaixo de conclusão
 * velha, sem nada na tela dizendo que as duas têm idades diferentes.
 *
 * E não havia motivo. O que é caro é `vida` — seis meses de histórico. Os
 * sinais de que `lerVies` precisa (perna atual, saída de baleia, open interest,
 * variação de 24 horas) são exatamente o que a camada viva acabou de ler.
 */
async function relerVies(
  vida: Vida,
  viva: Awaited<ReturnType<typeof getOverview>>[number],
  antiga: PanoramaRow,
): Promise<PanoramaRow["leitura"]> {
  try {
    const estudo = await lerEstudo(viva.symbol);
    return lerVies(vida, {
      moveKind: viva.moveKind,
      moveChange: viva.moveChange,
      whaleExiting: viva.whaleExiting,
      perpDominance: viva.perpDominance,
      accountRatio: viva.accountRatio,
      whaleRatio: viva.whaleRatio,
      oiChange72h: viva.oiChange72h,
      openInterestUsd: viva.openInterestUsd,
      motores: antiga.motor?.motores ?? 0,
      motoresMedidos: antiga.motor?.medidos ?? 0,
      concentracao: antiga.motor?.concentracao ?? null,
      perfil: estudo?.perfil ?? null,
      perfilR: estudo?.melhorLag?.r ?? null,
      perfilLag: estudo?.melhorLag?.lag ?? null,
      perfilSigmas: estudo?.melhorLag?.sigmas ?? null,
      emissao: antiga.motor?.emissao ?? null,
      alta24h: viva.change24h,
    });
  } catch {
    // Leitura velha é melhor do que leitura nenhuma, e o carimbo de idade que
    // já sobe para a tela continua contando a verdade sobre ela.
    return antiga.leitura;
  }
}

/**
 * O retrato guardado com a camada barata refeita por cima.
 *
 * ISTO É O CONSERTO DE UM PROBLEMA QUE ESTAVA ACONTECENDO, e não uma precaução.
 * As três camadas foram desenhadas para o caso de o arquivo SUMIR, e nenhuma
 * delas cobria o caso de ele ESTAR VELHO — que é o que acontece na prática. O
 * cron do workflow pede duas execuções por hora e o GitHub entrega de duas a
 * cinco por DIA: medido no histórico de commits, os retratos saem em pares
 * separados por cinco a dez horas. Como o disco sempre responde, a camada de
 * cálculo nunca era alcançada, e a página servia preço de dez horas atrás com
 * um aviso em letra pequena.
 *
 * O que dá para refazer barato é justamente o que envelhece rápido: preço, open
 * interest, posicionamento, perna atual e nota são duas requisições por moeda. O
 * que não dá é o estágio de vida — seis meses de histórico, dez arquivos por
 * moeda, vinte segundos. Então as duas metades passam a ter idades diferentes e
 * declaradas, em vez de uma idade só que estava errada para metade dos números.
 *
 * De quebra, moeda recém-adicionada à watchlist aparece na hora em vez de
 * esperar a próxima execução do workflow — ela entra sem estágio e sem leitura,
 * que é o honesto: esses dois ainda não foram calculados para ela.
 */
async function refrescar(base: Snapshot): Promise<Snapshot> {
  // O `catch` fica NA promessa, não na corrida: se o orçamento vencer primeiro
  // e o `getOverview` falhar depois, a corrida já terminou e a rejeição viraria
  // um unhandled rejection — que no Node derruba o processo.
  const viva = getOverview().catch(() => null);
  const vivas = await Promise.race([
    viva,
    new Promise<null>((r) => setTimeout(() => r(null), ORCAMENTO_VIVO_MS)),
  ]);

  if (!vivas || vivas.length === 0) return base;

  const guardadas = new Map(base.moedas.map((m) => [m.symbol, m]));
  const novas: string[] = [];

  const moedas: PanoramaRow[] = await Promise.all(
    vivas.map(async (viva) => {
      const antiga = guardadas.get(viva.symbol);
      if (!antiga) {
        novas.push(viva.ticker);
        return { ...viva, vida: null, leitura: null, motor: null };
      }
      // A linha viva manda em tudo que ela mede; o que ela não mede vem do
      // retrato. Espalhar nesta ordem é o que garante que nenhum campo velho
      // sobreviva por cima de um novo.
      const vida = corrigirPico(antiga.vida, viva.price);
      return {
        ...antiga,
        ...viva,
        vida,
        leitura: vida ? await relerVies(vida, viva, antiga) : antiga.leitura,
        motor: antiga.motor,
      };
    }),
  );

  // Moeda que existe no retrato e não voltou na passada viva CONTINUA na tela,
  // com os números do retrato. Descartá-la faria uma requisição perdida apagar
  // uma moeda do painel — que é a falha que o próprio `caidas` existe para
  // denunciar, e seria absurdo reintroduzi-la aqui.
  const vistas = new Set(vivas.map((v) => v.symbol));
  for (const antiga of base.moedas) {
    if (!vistas.has(antiga.symbol)) moedas.push(antiga);
  }

  return {
    ...base,
    moedas: moedas.sort((a, b) => b.score - a.score || b.openInterestUsd - a.openInterestUsd),
    vivoEm: Date.now(),
    novas,
  };
}

export async function getSnapshot(): Promise<Snapshot> {
  let guardado: Snapshot | null = null;

  // 1. o repositório
  try {
    const res = await fetch(RAW, {
      // Quatro segundos, não oito: são 250 KB de arquivo estático vindo de CDN,
      // e o que vem depois — refazer a camada viva — precisa do orçamento. Se o
      // GitHub demorar mais do que isso, o disco responde na hora e a camada
      // viva conserta o que nele estiver velho.
      signal: AbortSignal.timeout(4_000),
      next: { revalidate: 120 },
    });
    if (res.ok) {
      const dado = await res.json();
      if (valido(dado)) guardado = montar(dado, "github");
    }
  } catch {
    // Cai para a próxima camada.
  }

  // 2. o disco
  if (!guardado) {
    try {
      const dado = JSON.parse(await readFile(CAMINHO, "utf8"));
      if (valido(dado)) guardado = montar(dado, "disco");
    } catch {
      // Cai para a próxima camada.
    }
  }

  // 2b. o retrato existe mas passou da hora: refaz o que é barato por cima.
  if (guardado) {
    return guardado.atrasado ? refrescar(guardado) : guardado;
  }

  // 3. na mão
  const moedas = await getPanorama();
  return {
    moedas,
    geradoEm: Date.now(),
    fonte: "cálculo",
    idadeMinutos: 0,
    atrasado: false,
    parado: false,
    vivoEm: Date.now(),
    novas: [],
  };
}
