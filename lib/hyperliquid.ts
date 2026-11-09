/**
 * AS BALEIAS DA HYPERLIQUID: quem são as contas grandes, onde estão
 * posicionadas, a que preço entraram e onde seriam liquidadas — e como era isso
 * em qualquer data passada.
 *
 * A Hyperliquid é uma corretora de perpétuos que é uma blockchain: a posição de
 * CADA conta é pública, pela API do próprio site, sem chave
 * (`api.hyperliquid.xyz/info`, POST). O ranking público
 * (`stats-data.hyperliquid.xyz/Mainnet/leaderboard`) lista 48.149 contas em
 * 09/11/2026 com o patrimônio e o lucro e o volume do dia, da semana, do mês e
 * da vida. A Binance publica o posicionamento dos maiores traders só agregado,
 * e esse foi medido sem vantagem (`npm run medir-sinais`: +0,39 p.p., p = 0,21);
 * aqui cada conta é uma linha.
 *
 * A REGRA PARA TRÁS, que faz o passado sair exato. Cada execução traz a posição
 * da conta naquela moeda ANTES dela (`startPosition`). A posição numa data
 * passada é o `startPosition` da primeira execução depois dela, naquela moeda;
 * sem execução depois, é a posição de hoje. Por isso a regra pede TODA execução
 * entre a data e hoje — as comuns e as fatias de TWAP, que a API entrega à parte
 * —, e o download lê de hoje para trás (`scripts/baixar-baleias.mts`). Vale para
 * toda data a partir de onde esse histórico lido começa
 * (`HistoricoDaConta.desde`) — e não antes: uma execução de antes do começo pode
 * ter mudado a posição, e "não sei" não vira "zero".
 *
 * Este arquivo NÃO importa nada de `node:` — a página o importa para desenhar.
 * A medição está em `docs/preregistro-baleias.md` e `scripts/medir-baleias.mts`.
 */

// ------------------------------------------------------------------ o ranking

/** Uma conta do ranking público, com os números já em número. Dólares. */
export interface ContaDoRanking {
  endereco: string;
  patrimonio: number;
  /** Volume negociado na vida, em dólares. */
  volumeVida: number;
  volumeMes: number;
  lucroMes: number;
  lucroVida: number;
  /** O nome que a PRÓPRIA conta escolheu no ranking (`displayName`), quando escolheu. Não é verificação de nada. */
  nome?: string;
}

/**
 * O ranking público como a API devolve (`leaderboardRows`, com as janelas em
 * pares [nome, {pnl, roi, vlm}]). Linha sem endereço ou com número ilegível
 * fica de fora: conta que não se lê não entra no universo de ninguém.
 */
export function lerRanking(bruto: unknown): ContaDoRanking[] {
  const linhas = (bruto as { leaderboardRows?: unknown[] })?.leaderboardRows;
  if (!Array.isArray(linhas)) return [];
  const out: ContaDoRanking[] = [];
  for (const l of linhas as { ethAddress?: string; accountValue?: string; displayName?: string | null; windowPerformances?: [string, { pnl?: string; vlm?: string }][] }[]) {
    if (typeof l?.ethAddress !== "string" || !/^0x[0-9a-fA-F]{40}$/.test(l.ethAddress)) continue;
    const janelas = new Map(Array.isArray(l.windowPerformances) ? l.windowPerformances : []);
    const conta: ContaDoRanking = {
      endereco: l.ethAddress.toLowerCase(),
      patrimonio: Number(l.accountValue),
      volumeVida: Number(janelas.get("allTime")?.vlm),
      volumeMes: Number(janelas.get("month")?.vlm),
      lucroMes: Number(janelas.get("month")?.pnl),
      lucroVida: Number(janelas.get("allTime")?.pnl),
    };
    if (![conta.patrimonio, conta.volumeVida, conta.volumeMes, conta.lucroMes, conta.lucroVida].every(Number.isFinite)) continue;
    if (typeof l.displayName === "string" && l.displayName.trim()) conta.nome = l.displayName.trim().slice(0, 40);
    out.push(conta);
  }
  return out;
}

// ------------------------------------------------------------------ as execuções

/** Uma execução de PERPÉTUO de uma conta. */
export interface Execucao {
  moeda: string;
  /** Preço da execução, em dólares por unidade. */
  preco: number;
  /** Tamanho executado, em unidades da moeda; sempre positivo. */
  tamanho: number;
  /** "B" compra, "A" venda. */
  lado: "B" | "A";
  /** Instante, em milissegundos. */
  t: number;
  /** A posição da conta nesta moeda ANTES da execução, em unidades (negativa vendida). */
  antes: number;
  /** Lucro realizado por ela, em dólares, sem a taxa. */
  lucroFechado: number;
  /** A taxa paga, em dólares. */
  taxa: number;
}

/**
 * As execuções como a API devolve, só as de PERPÉTUO: a moeda à vista vem como
 * "@107" ou "PURR/USDC", e a de perpétuo pelo nome que está em `perpetuos`.
 * Execução com número ilegível fica de fora — e a conta que a teve deixa de ser
 * reconstruível para trás dela (`HistoricoDaConta.desde` vai para depois dela).
 */
export function lerExecucoes(bruto: unknown, perpetuos: ReadonlySet<string>): { execucoes: Execucao[]; ilegivelAte: number } {
  const out: Execucao[] = [];
  let ilegivelAte = -Infinity;
  if (!Array.isArray(bruto)) return { execucoes: out, ilegivelAte };
  for (const f of bruto as { coin?: string; px?: string; sz?: string; side?: string; time?: number; startPosition?: string; closedPnl?: string; fee?: string }[]) {
    const moeda = String(f?.coin ?? "");
    if (!perpetuos.has(moeda)) continue;
    const e: Execucao = {
      moeda,
      preco: Number(f.px),
      tamanho: Number(f.sz),
      lado: f.side === "B" ? "B" : "A",
      t: Number(f.time),
      antes: Number(f.startPosition),
      lucroFechado: Number(f.closedPnl ?? 0),
      taxa: Number(f.fee ?? 0),
    };
    const ok = (f.side === "B" || f.side === "A") && e.preco > 0 && e.tamanho > 0 && Number.isFinite(e.t) && [e.preco, e.tamanho, e.antes, e.lucroFechado, e.taxa].every(Number.isFinite);
    if (!ok) {
      if (Number.isFinite(e.t)) ilegivelAte = Math.max(ilegivelAte, e.t);
      continue;
    }
    out.push(e);
  }
  out.sort((a, b) => a.t - b.t);
  return { execucoes: encadear(out), ilegivelAte };
}

const igual = (x: number, y: number) => Math.abs(x - y) <= 1e-9 * Math.max(1, Math.abs(x), Math.abs(y));

/**
 * No MESMO MILISSEGUNDO e na mesma moeda, a ordem verdadeira é a do
 * encadeamento: cada execução começa onde a anterior terminou (o `antes` dela é
 * o `depois` da outra). O id da negociação (`tid`) NÃO serve de desempate — em
 * 09/11, três execuções seguidas da mesma conta tinham tid 51.489…, 950.785… e
 * 284.887… —, e a ordem errada faz a "primeira depois da data" ser outra, com
 * outro `antes`. Grupo que não forma cadeia única fica como veio.
 */
function encadear(xs: Execucao[]): Execucao[] {
  const out: Execucao[] = [];
  for (let i = 0; i < xs.length; ) {
    let j = i;
    while (j + 1 < xs.length && xs[j + 1].t === xs[i].t) j++;
    if (j === i) {
      out.push(xs[i]);
      i++;
      continue;
    }
    // Dentro do milissegundo, moeda por moeda (moedas diferentes não se encadeiam).
    const porMoeda = new Map<string, Execucao[]>();
    for (let k = i; k <= j; k++) porMoeda.set(xs[k].moeda, [...(porMoeda.get(xs[k].moeda) ?? []), xs[k]]);
    for (const grupo of porMoeda.values()) {
      if (grupo.length === 1) {
        out.push(grupo[0]);
        continue;
      }
      // A primeira é a que não começa onde nenhuma outra termina; daí em diante, a que começa onde a anterior terminou.
      const primeiras = grupo.filter((e) => !grupo.some((o) => o !== e && igual(depois(o), e.antes)));
      const cadeia: Execucao[] = [];
      if (primeiras.length === 1) {
        const resto = new Set(grupo);
        let atual: Execucao | undefined = primeiras[0];
        while (atual) {
          cadeia.push(atual);
          resto.delete(atual);
          const fim = depois(atual);
          atual = [...resto].find((o) => igual(o.antes, fim));
        }
      }
      out.push(...(cadeia.length === grupo.length ? cadeia : grupo));
    }
    i = j + 1;
  }
  return out;
}

/** A posição depois de uma execução, em unidades. */
export const depois = (e: Execucao) => e.antes + (e.lado === "B" ? e.tamanho : -e.tamanho);

/**
 * O histórico de uma conta, do jeito que a medição guarda: as execuções de
 * perpétuo em ordem, as posições de agora e de quando o histórico vale.
 */
export interface HistoricoDaConta {
  endereco: string;
  /**
   * Desde quando a posição para trás é exata, em milissegundos: o começo da
   * janela mais velha lida inteira, nos dois fluxos (o mais recente dos dois) —
   * o começo da medição quando a leitura chegou lá, o ponto em que ela parou
   * quando bateu no teto de eventos.
   */
  desde: number;
  /** Até quando o histórico foi lido (o instante da leitura das posições de agora). */
  ate: number;
  execucoes: Execucao[];
  /** As posições de agora, em unidades (negativa vendida), por moeda. */
  atuais: Record<string, number>;
  /** Mais de 300 execuções por dia na primeira página: market maker ou robô de giro, fora por regra. */
  altaFrequencia: boolean;
}

/**
 * As posições da conta no instante `t`, pela regra para trás: por moeda, a
 * posição de antes da primeira execução depois de `t`, ou a de agora. Nulo
 * quando `t` é anterior ao começo do histórico (`desde`) ou posterior à leitura:
 * "não sei" não vira "zero".
 */
export function posicoesEm(h: HistoricoDaConta, t: number): Map<string, number> | null {
  if (!(t >= h.desde) || t > h.ate) return null;
  const out = new Map<string, number>();
  for (const [moeda, s] of Object.entries(h.atuais)) if (s !== 0) out.set(moeda, s);
  // A primeira execução DEPOIS de t, em cada moeda, diz a posição em t. Percorrer
  // de trás para a frente e parar em t deixa no mapa justamente a mais cedo.
  const primeira = new Map<string, number>();
  for (let k = h.execucoes.length - 1; k >= 0; k--) {
    const e = h.execucoes[k];
    if (e.t <= t) break;
    primeira.set(e.moeda, e.antes);
  }
  for (const [moeda, s] of primeira) {
    if (s === 0) out.delete(moeda);
    else out.set(moeda, s);
  }
  return out;
}

/** O lucro realizado da conta em (de, ate], em dólares: o `closedPnl` menos a taxa. */
export function lucroRealizado(h: HistoricoDaConta, de: number, ate: number): number {
  let s = 0;
  for (const e of h.execucoes) if (e.t > de && e.t <= ate) s += e.lucroFechado - e.taxa;
  return s;
}

// ------------------------------------------------------------------ a leitura de uma data

/** A posição de baleia de uma conta numa moeda, em DÓLARES (negativa vendida). */
export interface PosicaoDeBaleia {
  conta: string;
  moeda: string;
  nocional: number;
}

/** O que as baleias somam numa moeda. */
export interface Agregado {
  moeda: string;
  /** Nocional comprado e vendido, em dólares, ambos positivos. */
  comprado: number;
  vendido: number;
  contas: number;
  /** (comprado − vendido) ÷ (comprado + vendido): de −1 (todas vendidas) a +1. Nulo abaixo dos mínimos. */
  consenso: number | null;
}

/** Os mínimos da leitura, como estão em `docs/preregistro-baleias.md`. */
export const MINIMOS = {
  /** Posição menor que isto, em dólares de nocional, é resto de operação. */
  posicao: 50_000,
  /** Soma comprada + vendida mínima para o consenso existir, em dólares. */
  somado: 500_000,
  /** Contas mínimas para o consenso existir. */
  contas: 3,
} as const;

/** Soma as posições de baleia por moeda; posição abaixo de `MINIMOS.posicao` não conta. */
export function agregar(posicoes: readonly PosicaoDeBaleia[], m: { posicao: number; somado: number; contas: number } = MINIMOS): Map<string, Agregado> {
  const out = new Map<string, Agregado & { quem: Set<string> }>();
  for (const p of posicoes) {
    if (!Number.isFinite(p.nocional) || Math.abs(p.nocional) < m.posicao) continue;
    const a = out.get(p.moeda) ?? { moeda: p.moeda, comprado: 0, vendido: 0, contas: 0, consenso: null, quem: new Set<string>() };
    if (p.nocional > 0) a.comprado += p.nocional;
    else a.vendido -= p.nocional;
    a.quem.add(p.conta);
    out.set(p.moeda, a);
  }
  const fim = new Map<string, Agregado>();
  for (const [moeda, a] of out) {
    const soma = a.comprado + a.vendido;
    const contas = a.quem.size;
    fim.set(moeda, { moeda, comprado: a.comprado, vendido: a.vendido, contas, consenso: soma >= m.somado && contas >= m.contas ? (a.comprado - a.vendido) / soma : null });
  }
  return fim;
}

// ------------------------------------------------------------------ a leitura ao vivo

/** Uma posição aberta agora, do `clearinghouseState` da conta. */
export interface PosicaoAoVivo {
  conta: string;
  moeda: string;
  /** Unidades, negativa vendida. */
  tamanho: number;
  /** Dólares, positivo, ao preço de marcação da corretora. */
  nocional: number;
  /** Preço médio de entrada. */
  entrada: number;
  /** Preço em que a corretora liquida; nulo quando a margem cruzada não deixa liquidar nesta moeda. */
  liquidacao: number | null;
  alavancagem: number;
  /** Lucro aberto, em dólares. */
  lucroAberto: number;
}

/**
 * As posições de uma conta como a API devolve. Tamanho zero é conta sem posição
 * naquela moeda e fica de fora; uma posição ILEGÍVEL anula a conta inteira
 * (nulo): tirar só ela faria a conta parecer ter saído da moeda, e o fluxo da
 * leitura seguinte contaria uma venda que não houve.
 */
export function lerPosicoes(conta: string, bruto: unknown): PosicaoAoVivo[] | null {
  const ps = (bruto as { assetPositions?: { position?: Record<string, unknown> }[] })?.assetPositions;
  if (!Array.isArray(ps)) return null;
  const out: PosicaoAoVivo[] = [];
  for (const x of ps) {
    const p = x?.position as { coin?: string; szi?: string; positionValue?: string; entryPx?: string; liquidationPx?: string | null; unrealizedPnl?: string; leverage?: { value?: number } } | undefined;
    if (!p?.coin) return null;
    const tamanho = Number(p.szi);
    if (tamanho === 0) continue;
    const nocional = Number(p.positionValue);
    const entrada = Number(p.entryPx);
    const liq = p.liquidationPx === null || p.liquidationPx === undefined ? null : Number(p.liquidationPx);
    const pos: PosicaoAoVivo = {
      conta: conta.toLowerCase(),
      moeda: p.coin,
      tamanho,
      nocional,
      entrada,
      liquidacao: liq !== null && Number.isFinite(liq) && liq > 0 ? liq : null,
      alavancagem: Number(p.leverage?.value),
      lucroAberto: Number(p.unrealizedPnl),
    };
    if (!(Number.isFinite(tamanho) && nocional > 0 && Number.isFinite(nocional) && entrada > 0 && Number.isFinite(entrada) && Number.isFinite(pos.lucroAberto))) return null;
    out.push(pos);
  }
  return out;
}

/**
 * As posições de cada conta LIDA, em UNIDADES da moeda (negativa vendida), por
 * moeda. A conta lida sem posição fica com objeto vazio: "lida e sem nada" e
 * "não lida" são coisas diferentes, e o fluxo depende da diferença.
 */
export type UnidadesPorConta = Record<string, Record<string, number>>;

/**
 * O FLUXO das baleias entre duas leituras, por moeda: o líquido (comprado −
 * vendido) de agora menos o de antes, ÷ (comprado + vendido) de agora — SÓ das
 * contas lidas nas duas, e com as duas posições ao MESMO preço, o de agora.
 *
 * Os dois cuidados são do pré-registro ("com as posições das duas datas a preço
 * da véspera ... das contas que cobrem as duas datas", `docs/preregistro-baleias.md`)
 * e são os de `scripts/medir-baleias.mts`; a primeira versão do ao vivo não
 * tinha nenhum dos dois, e subtraía o líquido em DÓLARES de duas leituras
 * inteiras. Uma moeda que sobe 10% sem ninguém negociar aumentava o líquido
 * comprado em 10% — o "fluxo" media o preço, e o teste dele mediria o retorno
 * passado — e a conta que cruzava os US$ 5 milhões do universo de um dia para o
 * outro entrava como compra.
 *
 * A régua de baleia (`MINIMOS.posicao`) vale para a posição de qualquer uma das
 * duas pontas, ao preço de agora: a de US$ 60 mil que vira US$ 40 mil conta como
 * venda de US$ 20 mil, e não de 60. O total de agora segue os mesmos mínimos do
 * consenso (`MINIMOS.somado`, `MINIMOS.contas`), entre as contas lidas nas duas;
 * abaixo deles, a moeda fica sem fluxo. Moeda sem preço agora fica de fora.
 */
export function fluxoEntre(antes: Readonly<UnidadesPorConta>, agora: Readonly<UnidadesPorConta>, precos: ReadonlyMap<string, number>): Map<string, number> {
  const delta = new Map<string, number>();
  const hoje: PosicaoDeBaleia[] = [];
  for (const [conta, u] of Object.entries(agora)) {
    if (!Object.prototype.hasOwnProperty.call(antes, conta)) continue;
    const a = antes[conta];
    for (const moeda of new Set([...Object.keys(u), ...Object.keys(a)])) {
      const p = precos.get(moeda);
      if (p === undefined || !(p > 0) || !Number.isFinite(p)) continue;
      const n = (u[moeda] ?? 0) * p;
      const n0 = (a[moeda] ?? 0) * p;
      if (!Number.isFinite(n) || !Number.isFinite(n0)) continue;
      if (Math.abs(n) < MINIMOS.posicao && Math.abs(n0) < MINIMOS.posicao) continue;
      delta.set(moeda, (delta.get(moeda) ?? 0) + (n - n0));
      if (n !== 0) hoje.push({ conta, moeda, nocional: n });
    }
  }
  const out = new Map<string, number>();
  for (const [moeda, x] of agregar(hoje)) if (x.consenso !== null) out.set(moeda, (delta.get(moeda) ?? 0) / (x.comprado + x.vendido));
  return out;
}

/** Uma faixa de liquidação: o preço do meio da faixa e quantos dólares de posição de baleia morrem nela. */
export interface FaixaDeLiquidacao {
  preco: number;
  /** Distância ao preço de agora, em fração (negativa abaixo). */
  distancia: number;
  nocional: number;
}

/** A leitura das baleias numa moeda, agora. Dólares, salvo onde diz. */
export interface LeituraDaMoeda {
  moeda: string;
  /** O perpétuo da Binance casado pelo preço (`casarComBinance`); nulo sem par. */
  symbol: string | null;
  preco: number;
  /** O open interest da moeda na Hyperliquid, em dólares; nulo sem leitura. */
  openInterest: number | null;
  compradas: number;
  vendidas: number;
  comprado: number;
  vendido: number;
  /** (comprado − vendido) ÷ (comprado + vendido), nulo abaixo dos `MINIMOS`. */
  consenso: number | null;
  /** O mesmo, só das contas com lucro no mês (o ranking): as "espertas". */
  consensoEspertas: number | null;
  /**
   * A variação do líquido desde a leitura anterior, só das contas lidas nas duas
   * e ao preço de agora, ÷ o total delas agora (`fluxoEntre`); nulo sem a
   * leitura anterior ou abaixo dos mínimos.
   */
  fluxo: number | null;
  /** Preço médio de entrada das baleias compradas e das vendidas, ponderado pelo nocional; nulo sem elas. */
  custoComprado: number | null;
  custoVendido: number | null;
  /** O lucro aberto somado das baleias compradas e das vendidas. */
  lucroComprado: number;
  lucroVendido: number;
  /**
   * Onde as baleias seriam liquidadas, em faixas de 2% do preço até 30% de
   * distância: abaixo, as compradas (venda forçada se o preço chegar lá);
   * acima, as vendidas (compra forçada). As três maiores de cada lado.
   */
  liquidacoesAbaixo: FaixaDeLiquidacao[];
  liquidacoesAcima: FaixaDeLiquidacao[];
  /** As maiores posições da moeda, para a tela mostrar quem é. */
  maiores: { conta: string; nocional: number; entrada: number; liquidacao: number | null; lucroAberto: number }[];
}

/** A largura de cada faixa de liquidação e até onde elas vão, em fração do preço. */
export const FAIXA_LIQUIDACAO = 0.02;
export const ALCANCE_LIQUIDACAO = 0.3;

/**
 * A leitura de todas as moedas a partir das posições de baleia de agora (só as
 * de US$ 50 mil para cima, `MINIMOS.posicao`), as contas espertas, o preço e o
 * open interest de cada moeda, e o fluxo desde a leitura anterior, já calculado
 * por `fluxoEntre` (ausente, nulo em todas).
 */
export function lerMoedas(
  posicoes: readonly PosicaoAoVivo[],
  espertas: ReadonlySet<string>,
  precos: ReadonlyMap<string, number>,
  openInterest: ReadonlyMap<string, number>,
  fluxo?: ReadonlyMap<string, number>,
  binance?: ReadonlyMap<string, string>,
): LeituraDaMoeda[] {
  const grandes = posicoes.filter((p) => p.nocional >= MINIMOS.posicao);
  const porMoeda = new Map<string, PosicaoAoVivo[]>();
  for (const p of grandes) porMoeda.set(p.moeda, [...(porMoeda.get(p.moeda) ?? []), p]);
  const todas = agregar(grandes.map((p) => ({ conta: p.conta, moeda: p.moeda, nocional: Math.sign(p.tamanho) * p.nocional })));
  const dasEspertas = agregar(grandes.filter((p) => espertas.has(p.conta)).map((p) => ({ conta: p.conta, moeda: p.moeda, nocional: Math.sign(p.tamanho) * p.nocional })));
  const out: LeituraDaMoeda[] = [];
  for (const [moeda, ps] of porMoeda) {
    const preco = precos.get(moeda);
    if (preco === undefined || !(preco > 0)) continue;
    const a = todas.get(moeda);
    if (!a) continue;
    const longas = ps.filter((p) => p.tamanho > 0);
    const curtas = ps.filter((p) => p.tamanho < 0);
    const custo = (xs: PosicaoAoVivo[]) => {
      const n = xs.reduce((s, p) => s + p.nocional, 0);
      return n > 0 ? xs.reduce((s, p) => s + p.entrada * p.nocional, 0) / n : null;
    };
    const faixas = (xs: PosicaoAoVivo[], lado: -1 | 1): FaixaDeLiquidacao[] => {
      const baldes = new Map<number, number>();
      for (const p of xs) {
        if (p.liquidacao === null) continue;
        const dist = p.liquidacao / preco - 1;
        // Só do lado em que a posição morre, e até o alcance: além disso não é suporte de ninguém.
        if (Math.sign(dist) !== lado || Math.abs(dist) > ALCANCE_LIQUIDACAO) continue;
        const k = Math.floor(Math.abs(dist) / FAIXA_LIQUIDACAO);
        baldes.set(k, (baldes.get(k) ?? 0) + p.nocional);
      }
      return [...baldes]
        .map(([k, nocional]) => {
          const distancia = lado * (k + 0.5) * FAIXA_LIQUIDACAO;
          return { preco: preco * (1 + distancia), distancia, nocional };
        })
        .sort((x, y) => y.nocional - x.nocional)
        .slice(0, 3);
    };
    out.push({
      moeda,
      symbol: binance?.get(moeda) ?? null,
      preco,
      openInterest: openInterest.get(moeda) ?? null,
      compradas: new Set(longas.map((p) => p.conta)).size,
      vendidas: new Set(curtas.map((p) => p.conta)).size,
      comprado: a.comprado,
      vendido: a.vendido,
      consenso: a.consenso,
      consensoEspertas: dasEspertas.get(moeda)?.consenso ?? null,
      fluxo: fluxo?.get(moeda) ?? null,
      custoComprado: custo(longas),
      custoVendido: custo(curtas),
      lucroComprado: longas.reduce((s, p) => s + p.lucroAberto, 0),
      lucroVendido: curtas.reduce((s, p) => s + p.lucroAberto, 0),
      liquidacoesAbaixo: faixas(longas, -1),
      liquidacoesAcima: faixas(curtas, 1),
      maiores: [...ps]
        .sort((x, y) => y.nocional - x.nocional)
        .slice(0, 5)
        .map((p) => ({ conta: p.conta, nocional: Math.sign(p.tamanho) * p.nocional, entrada: p.entrada, liquidacao: p.liquidacao, lucroAberto: p.lucroAberto })),
    });
  }
  return out.sort((x, y) => y.comprado + y.vendido - (x.comprado + x.vendido));
}

// ------------------------------------------------------------------ os arquivos

/**
 * Os MARKET MAKERS de uma moeda: as contas que o critério das execuções tira do
 * consenso (mais de 300 por dia), somadas à parte. A posição delas é ESTOQUE —
 * compram de quem vende e vendem para quem compra —, e por isso não entra no
 * consenso das baleias; aqui ela aparece pelo que é. Pedido do usuário em 09/11:
 * "colocar principalmente baleias market maker como Wintermute e outras".
 * Dólares, salvo onde diz; posição abaixo de `MINIMOS.posicao` não conta.
 */
export interface LeituraDosMarketMakers {
  moeda: string;
  symbol: string | null;
  preco: number;
  comprado: number;
  vendido: number;
  compradas: number;
  vendidas: number;
  /** (comprado − vendido) ÷ (comprado + vendido): para que lado o estoque pende, de −1 a +1. */
  saldo: number;
  /** As maiores posições, com o nome que a conta se deu no ranking, quando deu. */
  maiores: { conta: string; nome?: string; nocional: number }[];
}

/** Soma as posições dos market makers por moeda, da que tem mais dinheiro para a que tem menos. */
export function lerMarketMakers(
  posicoes: readonly PosicaoAoVivo[],
  precos: ReadonlyMap<string, number>,
  nomes: Readonly<Record<string, string>> = {},
  binance?: ReadonlyMap<string, string>,
): LeituraDosMarketMakers[] {
  const porMoeda = new Map<string, PosicaoAoVivo[]>();
  for (const p of posicoes) if (p.nocional >= MINIMOS.posicao) porMoeda.set(p.moeda, [...(porMoeda.get(p.moeda) ?? []), p]);
  const out: LeituraDosMarketMakers[] = [];
  for (const [moeda, ps] of porMoeda) {
    const preco = precos.get(moeda);
    if (preco === undefined || !(preco > 0)) continue;
    const longas = ps.filter((p) => p.tamanho > 0);
    const curtas = ps.filter((p) => p.tamanho < 0);
    const comprado = longas.reduce((s, p) => s + p.nocional, 0);
    const vendido = curtas.reduce((s, p) => s + p.nocional, 0);
    out.push({
      moeda,
      symbol: binance?.get(moeda) ?? null,
      preco,
      comprado,
      vendido,
      compradas: new Set(longas.map((p) => p.conta)).size,
      vendidas: new Set(curtas.map((p) => p.conta)).size,
      saldo: (comprado - vendido) / (comprado + vendido),
      maiores: [...ps]
        .sort((x, y) => y.nocional - x.nocional)
        .slice(0, 3)
        .map((p) => ({ conta: p.conta, ...(nomes[p.conta] ? { nome: nomes[p.conta] } : {}), nocional: Math.sign(p.tamanho) * p.nocional })),
    });
  }
  return out.sort((x, y) => y.comprado + y.vendido - (x.comprado + x.vendido));
}

/** O que `scripts/baleias-hl.mts` grava em `data/baleias-hl.json` (na branch `dados`). */
export interface ArquivoBaleias {
  geradoEm: number;
  /** Quando o ranking que escolheu as contas foi baixado. */
  rankingEm: number;
  /** As contas do universo (minúsculas, patrimônio de US$ 5 mi ou mais) e as espertas entre elas (lucro no mês do ranking). */
  contas: string[];
  espertas: string[];
  /** Por conta: se é market maker pelas execuções (mais de 300 por dia) e quando isso foi visto. */
  classes?: Record<string, { af: boolean; em: number }>;
  /** Quantas contas do universo ficaram fora por serem market makers, e quantas ainda sem classificação. */
  marketMakers?: number;
  semClasse?: number;
  lidas: number;
  semLeitura: number;
  comPosicao: number;
  moedas: LeituraDaMoeda[];
  /** As posições de cada conta lida nesta leitura, em unidades: a base do fluxo da leitura seguinte (`fluxoEntre`). */
  unidades?: UnidadesPorConta;
  /** O instante da leitura contra a qual o fluxo foi medido; ausente quando não houve uma com `unidades`. */
  fluxoDesde?: number;
  /**
   * Toda moeda da Hyperliquid casada com um perpétuo da Binance pelo preço
   * (`casarComBinance`), com ou sem baleia: a página de uma moeda separa "negocia
   * na Hyperliquid e nenhuma baleia está nela" de "não negocia lá".
   */
  pares?: Record<string, string>;
  /** Os market makers da Hyperliquid, à parte do consenso (`lerMarketMakers`), e quantas contas deles foram lidas. */
  doMercado?: LeituraDosMarketMakers[];
  mmLidas?: number;
  mmSemLeitura?: number;
  /** O nome que cada conta do universo se deu no ranking, quando deu. */
  nomes?: Record<string, string>;
  /** O dia (00:00 UTC, ms) da última linha gravada no histórico diário. */
  historicoAte?: number;
  /**
   * O dia (00:00 UTC, ms) da PRIMEIRA linha gravada: os 90 dias do juiz contam
   * daqui. Sai do dado e não de uma data escrita, porque o coletor só roda no
   * workflow do `main` — a coleta começa no merge, não no dia em que foi escrita.
   */
  historicoDesde?: number;
}

/**
 * Uma linha do histórico diário POR CONTA (`data/baleias-hl-contas-AAAA-MM.jsonl`):
 * a primeira leitura completa do dia UTC, com a posição de cada conta lida em
 * unidades, as espertas do ranking do dia e o preço de marcação de cada moeda.
 * É dela que o juiz para frente tira o fluxo de 3 dias pela mesma `fluxoEntre`
 * — o histórico por moeda soma o universo inteiro de cada dia e não sabe quem
 * estava nas duas datas.
 */
export interface LinhaDiariaDasContas {
  t: number;
  u: UnidadesPorConta;
  /** As contas lidas que estão entre as espertas (lucro no mês do ranking). */
  e: string[];
  /** Preço de marcação de cada perpétuo da Hyperliquid, em dólares. */
  p: Record<string, number>;
}

/** Um sinal medido num horizonte (`scripts/medir-baleias.mts`). */
export interface SinalMedido {
  sinal: "consenso" | "espertas" | "fluxo";
  horizonte: number;
  /** A correlação de postos média do dia entre o sinal e o retorno relativo. */
  icMedio: number;
  /** O t sobre os dias que não se sobrepõem. */
  t: number;
  dias: number;
  moedasPorDia: number;
  icMetades: [number, number];
  /** O quinto de cima do sinal menos o de baixo, em retorno relativo (fração). */
  quintos: number;
  quintosMetades: [number, number];
}

/** O que `scripts/medir-baleias.mts` grava em `data/baleias-medicao.json` (no `main`, à mão). */
export interface MedicaoBaleias {
  geradoEm: number;
  janela: { de: number; ate: number; corte: number };
  contas: { lidas: number; altaFrequencia: number; semArquivo: number; /** As que a reconstrução não fecha com a posição de agora: fora. */ naoFecham?: number };
  grupos: {
    /** A, B e AB: a reconstrução para trás (`medir-baleias`); VIVO: a coleta para frente (`medir-baleias-ao-vivo`), o juiz da segunda emenda. */
    id: "A" | "B" | "AB" | "VIVO";
    nome: string;
    contas: number;
    coberturaMediana: number;
    sinais: SinalMedido[];
    suporte: { eventos: number; moedas: number; media: number; t: number; metades: [number, number]; porMetade: [number, number] };
  }[];
  /** O veredito do universo A no horizonte de 7 dias, pelo critério do pré-registro, por sinal. */
  vereditos: { sinal: "consenso" | "espertas" | "fluxo" | "suporte"; passa: boolean; texto: string }[];
}

/** A leitura de agora, pela regra de camadas da página (`lib/guardado.ts`). */
export async function getBaleias(): Promise<ArquivoBaleias | null> {
  const { lerGuardado } = await import("./guardado");
  const g = await lerGuardado<ArquivoBaleias>("baleias-hl.json", (d) => (Array.isArray((d as ArquivoBaleias)?.moedas) ? (d as ArquivoBaleias) : null), 300);
  return g?.dado ?? null;
}

/** A medição gravada à mão por `npm run medir-baleias`, que mora no `main`. */
export async function getMedicaoBaleias(): Promise<MedicaoBaleias | null> {
  const { lerGuardado } = await import("./guardado");
  const g = await lerGuardado<MedicaoBaleias>("baleias-medicao.json", (d) => (Array.isArray((d as MedicaoBaleias)?.grupos) ? (d as MedicaoBaleias) : null), 3600);
  return g?.dado ?? null;
}

// ------------------------------------------------------------------ o casamento com a Binance

/**
 * Casa as moedas da Hyperliquid com os perpétuos da Binance PELO PREÇO — a
 * armadilha nº 1 do projeto (homônimo). A Hyperliquid lista a moeda miúda em
 * lotes de mil com um "k" na frente (kPEPE é o preço de mil PEPE), e a Binance
 * com "1000" (1000PEPEUSDT): o nome vira `XUSDT` ou `1000XUSDT`, e só vale com o
 * preço entre 0,8 e 1,25 do da Binance. Devolve, por moeda da Hyperliquid, o
 * símbolo da Binance.
 */
export function casarComBinance(
  moedas: readonly { moeda: string; preco: number }[],
  precoBinance: (symbol: string) => number | undefined,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const { moeda, preco } of moedas) {
    if (!(preco > 0) || !Number.isFinite(preco)) continue;
    const mil = /^k[A-Z0-9]/.test(moeda);
    const base = (mil ? moeda.slice(1) : moeda).toUpperCase();
    const candidatos = mil ? [`1000${base}USDT`, `${base}USDT`] : [`${base}USDT`, `1000${base}USDT`];
    for (const symbol of candidatos) {
      const p = precoBinance(symbol);
      if (p === undefined || !(p > 0) || !Number.isFinite(p)) continue;
      // O perpétuo de mil unidades da Binance contra a moeda inteira da Hyperliquid, e o contrário.
      const fator = symbol.startsWith("1000") && !mil ? 1000 : !symbol.startsWith("1000") && mil ? 1 / 1000 : 1;
      const razao = p / (preco * fator);
      if (razao >= 0.8 && razao <= 1.25) {
        out.set(moeda, symbol);
        break;
      }
    }
  }
  return out;
}
