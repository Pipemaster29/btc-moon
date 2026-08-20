/**
 * Leitura de gráfico, reduzida ao que dá para definir sem ambiguidade.
 *
 * Análise técnica sofre de um problema que este arquivo tenta evitar: quase tudo
 * nela é desenhado a olho, e duas pessoas traçam a mesma linha de tendência em
 * lugares diferentes. Uma regra que depende de onde alguém desenhou não pode ser
 * testada, e o que não pode ser testado não entra aqui.
 *
 * Então só existem três conceitos, todos com definição fechada:
 *
 *   PIVÔ         uma máxima (ou mínima) que é a maior (menor) de uma janela
 *                simétrica ao redor dela. Sem julgamento: é uma comparação.
 *   TENDÊNCIA    dois pivôs de topo consecutivos descendentes E o preço abaixo
 *                da média de vinte dias. Os dois juntos, porque topos
 *                descendentes num mercado lateral são ruído.
 *   ROMPIMENTO   fechamento acima do último pivô de topo, estando em tendência
 *                de baixa no dia anterior. É o evento que interessa: a estrutura
 *                que vinha segurando o preço deixou de segurar.
 *
 * Resistência é o pivô de topo mais próximo ACIMA do preço — o primeiro lugar
 * onde já houve vendedor suficiente para virar o mercado.
 */

export interface Vela {
  close: number;
  high: number;
  low: number;
}

/** Metade da janela do pivô: quantas velas de cada lado precisam ser menores. */
const LADO = 3;

/** Índices das velas que são pivô de topo. */
export function pivosDeTopo(velas: Vela[]): number[] {
  const out: number[] = [];
  for (let i = LADO; i < velas.length - LADO; i++) {
    let maior = true;
    for (let j = i - LADO; j <= i + LADO; j++) {
      if (j !== i && velas[j].high >= velas[i].high) {
        maior = false;
        break;
      }
    }
    if (maior) out.push(i);
  }
  return out;
}

function media(velas: Vela[], n: number): number {
  const trecho = velas.slice(-n);
  if (trecho.length === 0) return NaN;
  return trecho.reduce((s, v) => s + v.close, 0) / trecho.length;
}

export interface Tecnica {
  /** Preço abaixo da média de 20 e com topos descendentes. */
  emBaixa: boolean;
  /** Fechou acima do último pivô de topo, vindo de tendência de baixa. */
  rompeu: boolean;
  /** Pivô de topo mais próximo acima do preço; nulo quando não há. */
  resistencia: number | null;
  /** Distância até essa resistência, em fração. */
  ateResistencia: number | null;
  /** Preço ÷ média de 20 − 1. */
  vsMedia20: number;
  /** Quantos pivôs de topo consecutivos vêm descendo. */
  toposDescendentes: number;
}

/**
 * Lê a estrutura no fim da série. As velas devem ir da mais antiga à mais
 * recente, e a leitura vale para a última — nada aqui olha para frente.
 */
export function lerTecnica(velas: Vela[]): Tecnica | null {
  if (velas.length < 25) return null;

  const preco = velas[velas.length - 1].close;
  const m20 = media(velas, 20);
  const pivos = pivosDeTopo(velas);

  // Quantos topos seguidos vêm descendo, contando do mais recente para trás.
  let descendentes = 0;
  for (let i = pivos.length - 1; i > 0; i--) {
    if (velas[pivos[i]].high < velas[pivos[i - 1]].high) descendentes++;
    else break;
  }

  const emBaixa = descendentes >= 2 && preco < m20;

  // O rompimento precisa do estado de ONTEM: romper é deixar de estar em baixa,
  // e medir isso no estado de hoje seria circular.
  const ontem = velas.slice(0, -1);
  const anterior = ontem.length >= 25 ? lerEstrutura(ontem) : null;
  const ultimoTopo = pivos.length ? velas[pivos[pivos.length - 1]].high : null;
  const rompeu = Boolean(anterior?.emBaixa && ultimoTopo !== null && preco > ultimoTopo);

  const acima = pivos.map((i) => velas[i].high).filter((h) => h > preco).sort((a, b) => a - b);

  return {
    emBaixa,
    rompeu,
    resistencia: acima[0] ?? null,
    ateResistencia: acima[0] ? acima[0] / preco - 1 : null,
    vsMedia20: m20 > 0 ? preco / m20 - 1 : NaN,
    toposDescendentes: descendentes,
  };
}

/** Só o estado de tendência, sem recursão — usado para saber como o dia anterior estava. */
function lerEstrutura(velas: Vela[]): { emBaixa: boolean } {
  const preco = velas[velas.length - 1].close;
  const m20 = media(velas, 20);
  const pivos = pivosDeTopo(velas);
  let descendentes = 0;
  for (let i = pivos.length - 1; i > 0; i--) {
    if (velas[pivos[i]].high < velas[pivos[i - 1]].high) descendentes++;
    else break;
  }
  return { emBaixa: descendentes >= 2 && preco < m20 };
}
