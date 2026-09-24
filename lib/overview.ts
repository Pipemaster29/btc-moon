/**
 * A triagem: todas as moedas vigiadas numa leitura só, barata o bastante para
 * caber numa página.
 *
 * O painel completo de uma moeda custa perto de trinta requisições — catorze
 * dias de arquivo da Binance, saldo de cada carteira, varredura de logs. Com
 * quarenta moedas isso vira mil e duzentas, e a página nunca abre. Então a
 * triagem lê só o que responde a pergunta "esta merece atenção agora?": o
 * perpétuo ao vivo da Gate e a profundidade à vista do DexScreener, duas
 * chamadas por moeda.
 *
 * O detalhe de cada uma continua existindo inteiro — só que sob demanda, em
 * /radar/[symbol], para uma moeda de cada vez.
 */

import { perpSeries } from "./perp";
import { cotacoes, type Cotacao } from "./binance";
import { depthOn, pairsOfToken, precoArbitrado } from "./dexscreener";
import { ATIVAS, type WatchedToken } from "./watchlist";
import { lerVida, lerVies, type Leitura, type Vida } from "./lifecycle";
import { concentracaoDe } from "./detentores";
import { ritmoDe, vestingDe } from "./vesting";
import { lerEstudo } from "./estudo";
import { lerMotor, type Motor } from "./motor";
import { readLiveFromStats, type MoveKind } from "./positioning";

export interface OverviewRow {
  symbol: string;
  /** Nome curto, sem o sufixo do par. */
  ticker: string;
  chain: string;
  contract: string;
  hasWallets: boolean;
  note?: string;
  /** Presente só nas em vista, que entraram sozinhas (`lib/emvista.ts`). */
  origem?: "carteira-binance";

  price: number;
  /**
   * O último negócio do perpétuo no instante do retrato, na mesma unidade do
   * contrato (por 1000 em `1000XUSDT`). Zero quando não há. `price / perpPrice`
   * é a base entre a pool e o perpétuo, que a carteira usa para ancorar as velas.
   */
  perpPrice: number;
  change24h: number;
  liquidityUsd: number;
  volume24h: number;
  /** volume ÷ liquidez: pool que não gira não absorve venda. */
  turnover: number;
  fdv: number;

  openInterestUsd: number;
  /** Open interest da Binance, a praça grande. Zero quando ela não lista. */
  openInterestBinance: number;
  /** OI em dólar ÷ liquidez à vista: o quanto o preço se forma no perpétuo. */
  perpDominance: number;
  accountRatio: number;
  whaleRatio: number;

  moveKind: MoveKind | null;
  moveChange: number;
  /** Contas grandes desmontando comprado perto do topo. */
  whaleExiting: boolean;
  whaleExitShare: number;
  /** Variação do open interest em 72h — o parâmetro que passou no teste. */
  oiChange72h: number;

  /** Quanto isto merece ser olhado agora, de 0 a 100. */
  score: number;
  reasons: string[];
}

/**
 * A nota não é previsão. É ordenação: com quarenta moedas na tela, alguma
 * ordem tem de existir, e ordenar por preço ou por tamanho colocaria em cima
 * justamente as que não estão fazendo nada.
 *
 * Cada parcela vale pelo que ela antecede, não pelo que ela descreve. Por isso
 * a saída da baleia pesa mais que a variação do preço: a variação já aconteceu.
 */
function score(row: Omit<OverviewRow, "score" | "reasons">): { score: number; reasons: string[] } {
  let total = 0;
  const reasons: string[] = [];

  if (row.whaleExiting) {
    total += 35;
    reasons.push(`baleias largaram ${(row.whaleExitShare * 100).toFixed(1)}% do livro`);
  }

  if (row.moveKind === "squeeze") {
    total += 25;
    reasons.push(`alta forçada de ${(row.moveChange * 100).toFixed(0)}%`);
  } else if (row.moveKind === "alavancagem") {
    total += 20;
    reasons.push(`alta a crédito de ${(row.moveChange * 100).toFixed(0)}%`);
  } else if (row.moveKind === "distribuicao") {
    total += 20;
    reasons.push(`queda com posição de pé — alguém entregou moeda`);
  } else if (row.moveKind === "livro vazio") {
    total += 10;
    reasons.push(`queda por falta de compra`);
  }

  // Quando o perpétuo é muito maior que a pool à vista, o preço não é formado
  // por quem compra a moeda — é formado por quem aposta nela. Foi a condição
  // que fez a BTW andar 58% em nove horas com o saldo das corretoras parado.
  //
  // Os limiares foram refeitos junto com a troca da fonte do open interest. Na
  // escala da Gate a BTW media 31x e o corte alto era 20; medida na Binance ela
  // mede 1250x, e o mesmo corte marcaria praticamente a lista inteira. Os
  // valores abaixo vêm da distribuição real: 1250x na BTW, 342x no JCT, 165x no
  // BASED, depois uma queda longa até 25x na AKE e 3x na TAG.
  if (row.perpDominance >= 100) {
    total += 20;
    reasons.push(`perpétuo vale ${row.perpDominance.toFixed(0)}x a pool à vista`);
  } else if (row.perpDominance >= 25) {
    total += 10;
    reasons.push(`perpétuo vale ${row.perpDominance.toFixed(0)}x a pool`);
  }

  // Varejo de um lado e dinheiro grande do outro é a divergência que precede
  // cascata; sem extremo nenhum, o posicionamento não diz nada.
  if (row.accountRatio > 0 && row.whaleRatio > 0) {
    if (row.accountRatio > 1.5 && row.whaleRatio < 1) {
      total += 15;
      reasons.push(`varejo comprado contra dinheiro grande vendido`);
    } else if (row.accountRatio < 0.7 && row.whaleRatio > 1.2) {
      total += 15;
      reasons.push(`varejo vendido contra dinheiro grande comprado — risco de squeeze`);
    }
  }

  if (row.turnover > 0 && row.turnover < 0.05 && row.liquidityUsd > 0) {
    total += 5;
    reasons.push(`pool quase sem giro`);
  }

  return { score: Math.min(total, 100), reasons };
}

/**
 * `vivo` é o último negócio do perpétuo agora, do `ticker/24hr` da Binance —
 * uma requisição para a praça inteira, feita uma vez por retrato.
 */
async function readOne(token: WatchedToken, vivo: Cotacao | null = null): Promise<OverviewRow | null> {
  // A pool que FALHOU e a pool que não existe têm de terminar em lugares
  // diferentes. Engolir a falha num array vazio pintou a BTW como moeda morta —
  // liquidez, volume, FDV e domínio do perpétuo todos em zero — com US$ 1,1
  // bilhão de market cap e a pool negociando normalmente. Agora, quando a moeda
  // TEM contrato e a consulta não volta, a linha inteira é descartada e a moeda
  // aparece em `caidas`: some do painel de um jeito que dá para ver.
  const [stats, pairs] = await Promise.all([
    perpSeries(token.symbol, "1h", 100).catch(() => []),
    token.contract
      ? pairsOfToken(token.contract).catch(() => null)
      : Promise.resolve([] as Awaited<ReturnType<typeof pairsOfToken>>),
  ]);

  if (token.contract && pairs === null) return null;

  const depth = token.contract ? depthOn(pairs ?? [], token.chain) : null;
  const last = stats[stats.length - 1];

  // Sem perpétuo e sem pool não há o que mostrar — a moeda saiu do ar.
  if (!last && !depth) return null;

  const live = readLiveFromStats(stats);

  // O PREÇO DA POOL PRECISA DE UM FREIO, e a falta dele já contaminou a série.
  //
  // O JCT foi gravado no histórico a 2,938e-27 — quinze ordens de grandeza
  // abaixo do preço dele — porque uma pool devolveu isso ao DexScreener e o
  // número entrou sem exame. Uma linha dessas vira −100% de retorno e sozinha
  // envenena qualquer medida sobre a série.
  //
  // O árbitro é o perpétuo, pelo mesmo motivo que ele arbitra a identificação de
  // contrato em `descobrir`: é a praça grande, e entre o mesmo ativo a
  // arbitragem não deixa a diferença passar de um dígito percentual.
  //
  // O CORTE ERA DE CEM VEZES, "frouxo de propósito, para pegar lixo e não pool
  // desalinhada" — e deixou passar a AIOT lendo o preço da AIT, 2,7 vezes fora,
  // que a carteira usou para abrir posição (23/09). Medido no dia seguinte, com
  // a pool alheia já filtrada em `depthOn`: das 75 moedas com pool e perpétuo,
  // 73 ficam a menos de 2% dele e a mais longe, a HEI, a 10% (pool de US$ 3
  // mil). Então a faixa é a mesma com que a carteira ancora as velas —
  // 0,8 a 1,25, "razão de 1,4 não é base de mercado, é outra moeda" — e fora
  // dela vale o perpétuo. Hoje isso não troca o preço de nenhuma moeda; troca o
  // da próxima AIOT. Os perpétuos de 1000 e 1.000.000 unidades caem aqui fora
  // por construção e sempre usaram o perpétuo.
  const precoPool = depth?.priceUsd ?? 0;
  // O PREÇO DO PERPÉTUO É O DE AGORA, e não era. O último ponto da série é o
  // valor em aberto dividido pelos contratos no fechamento da última HORA: às
  // 03:27 de 24/09 ele tinha 28 minutos, e ficava a 0,40% do último negócio na
  // mediana, 1,85% no p90 e 9,75% na UAI — numa madrugada calma. Era esse o
  // preço gravado no retrato de toda moeda sem pool (mais da metade da lista)
  // e o árbitro da pool logo abaixo: num pump, a pool certa sairia "fora do
  // perpétuo" contra um perpétuo de uma hora atrás. A série fica de reserva
  // para quando o ticker não responde.
  const precoPerp = (vivo && vivo.preco > 0 ? vivo.preco : 0) || (last?.price ?? 0);
  const arbitrado = precoArbitrado(precoPool, precoPerp);
  const razaoPool = arbitrado.razao;
  const poolFora = razaoPool !== null && arbitrado.fonte !== "pool";
  const price = arbitrado.preco;
  const liquidityUsd = depth?.liquidityUsd ?? 0;
  // A praça grande manda; a Gate só cobre quem a Binance não lista. E agora vem
  // ao vivo em vez do arquivo de ontem: o bloqueio por região era do host
  // `fapi`, não da API, e `www.binance.com` serve os mesmos caminhos.
  const oiBnc = last?.oiBinanceUsd ?? 0;
  const oiUsd = oiBnc > 0 ? oiBnc : last?.openInterestUsd ?? 0;

  // A VARIAÇÃO DE 24 HORAS VINHA SÓ DA POOL, e mais da metade da lista não tem
  // pool. Medido: 39 das 71 moedas gravavam `change24h` EXATAMENTE zero, 37
  // delas por não terem contrato nenhum — elas vivem no perpétuo.
  //
  // Zero não é "não andou", é "não olhei", e a diferença passou a custar caro no
  // dia em que a trava de venda passou a depender deste número: uma moeda só
  // perpétuo podia dobrar de preço e o painel continuaria emitindo short, porque
  // para ele ela não tinha andado. Era o buraco da AKE de novo, em 55% da lista.
  //
  // A série do perpétuo já está carregada e tem 100 pontos horários. Vinte e
  // quatro atrás é o preço de ontem a esta hora, e ele responde para toda moeda
  // que tem perpétuo — que é a lista inteira.
  //
  // Com série curta a comparação cai no ponto mais antigo que existe, em vez de
  // devolver zero. Moeda recém-listada é exatamente a que anda 100% num dia, e
  // "não tenho 24 horas de série" não pode virar "não andou" logo nela — foi
  // esse tipo de silêncio que deixou o painel emitir short no meio do pump.
  const precoOntem = stats[Math.max(0, stats.length - 25)]?.price ?? 0;
  // Com o ticker, a variação é a dele: as 24 horas rolantes até o último
  // negócio, a mesma que a camada viva da página mostra.
  const varPerp =
    vivo && vivo.preco > 0 && Number.isFinite(vivo.variacao24h)
      ? vivo.variacao24h
      : precoOntem > 0 && precoPerp > 0 && stats.length >= 2
        ? precoPerp / precoOntem - 1
        : 0;
  // A pool continua tendo preferência onde ela existe e gira: é a fonte que o
  // DexScreener calcula sobre o mercado à vista real. O perpétuo entra quando
  // ela não responde, que é o caso que estava zerado.
  // A variação da pool desalinhada é tão suspeita quanto o preço dela — na AIOT
  // era a da AIT.
  const change24h = (!poolFora && depth?.change24h) || varPerp;

  const base = {
    symbol: token.symbol,
    ticker: token.symbol.replace(/USDT$/, ""),
    chain: token.chain,
    contract: token.contract,
    hasWallets: token.wallets.length > 0,
    note: token.note,
    // Só quando existe: `undefined` some do JSON, e as 73 da lista não
    // precisam carregar um campo vazio em cada retrato.
    ...(token.origem ? { origem: token.origem } : {}),
    price,
    perpPrice: precoPerp,
    change24h,
    liquidityUsd,
    volume24h: depth?.volume24h ?? 0,
    turnover: liquidityUsd > 0 ? (depth?.volume24h ?? 0) / liquidityUsd : 0,
    fdv: depth?.fdv ?? 0,
    openInterestUsd: oiUsd,
    openInterestBinance: oiBnc,
    perpDominance: liquidityUsd > 0 ? oiUsd / liquidityUsd : 0,
    accountRatio: last?.accountRatio ?? 0,
    whaleRatio: last?.whaleRatio ?? 0,
    moveKind: live?.move?.kind ?? null,
    moveChange: live?.move?.priceChange ?? 0,
    whaleExiting: Boolean(live?.whaleExit?.fragile),
    whaleExitShare: live?.whaleExit?.share ?? 0,
    oiChange72h: live?.oiChange72h ?? NaN,
  };

  const nota = score(base);
  // Dito na coluna "Atenção", sem mexer na nota: não é o mercado que está
  // estranho, é a leitura. Os perpétuos de 1000 unidades ficam de fora porque a
  // razão deles é de mil por construção.
  if (poolFora && razaoPool !== null && !/^1000/.test(token.symbol)) {
    nota.reasons.push(`pool ${razaoPool > 1 ? "+" : "−"}${Math.abs((razaoPool - 1) * 100).toFixed(0)}% fora do perpétuo — preço pelo perpétuo`);
  }
  return { ...base, ...nota };
}

/** A tabela inteira, já ordenada por quem merece olhar primeiro. */
/**
 * Moedas que não devolveram dado na última leitura.
 *
 * Existe porque uma moeda sumindo do painel em silêncio é indistinguível de uma
 * moeda que nunca esteve lá. Foi assim que a Chainbase desapareceu de um retrato
 * inteiro enquanto funcionava perfeitamente quando consultada sozinha — o teto
 * de concorrência conserta a causa, isto denuncia quando volta a acontecer.
 */
export const caidas: string[] = [];

/**
 * `tokens` é a lista curada por padrão; o retrato passa ela somada às moedas em
 * vista (`lib/emvista.ts`), que não moram em `watchlist.ts` porque mudam sozinhas.
 */
export async function getOverview(tokens: WatchedToken[] = ATIVAS): Promise<OverviewRow[]> {
  caidas.length = 0;
  // Uma requisição para os perpétuos todos. Sem ela, cada moeda cai na série
  // de hora em hora, que é o comportamento de antes — não uma moeda a menos.
  const vivos = await cotacoes().catch(() => null);
  const linhas = await Promise.all(
    tokens.map(async (t) => {
      const r = await readOne(t, vivos?.get(t.symbol) ?? null).catch(() => null);
      if (!r) caidas.push(t.symbol.replace(/USDT$/, ""));
      return r;
    }),
  );
  return linhas
    .filter((r): r is OverviewRow => r !== null)
    .sort((a, b) => b.score - a.score || b.openInterestUsd - a.openInterestUsd);
}

/**
 * A triagem somada ao estágio de vida.
 *
 * Fica separada de `getOverview` porque custa outra ordem de grandeza: o
 * histórico de seis meses são dez arquivos por moeda. Quem só quer saber o que
 * está acontecendo agora não deve pagar por isso.
 */
export interface PanoramaRow extends OverviewRow {
  vida: Vida | null;
  leitura: Leitura | null;
  /** Ainda existe com que empurrar a moeda? */
  motor: Motor | null;
}

export async function getPanorama(tokens: WatchedToken[] = ATIVAS): Promise<PanoramaRow[]> {
  const linhas = await getOverview(tokens);
  const porSymbol = new Map(tokens.map((t) => [t.symbol, t]));

  return Promise.all(
    linhas.map(async (row) => {
      const token = porSymbol.get(row.symbol);
      if (!token) return { ...row, vida: null, leitura: null, motor: null };

      const [vida, estudo] = await Promise.all([
        lerVida(token, row.price).catch(() => null),
        lerEstudo(token.symbol),
      ]);
      if (!vida) return { ...row, vida: null, leitura: null, motor: null };

      const motor = await lerMotor(
        token.chain,
        token.contract,
        vida.circulante,
        vida.contratoRepresenta !== false,
        row.openInterestUsd,
        row.liquidityUsd,
        row.volume24h,
        await concentracaoDe(token.symbol),
        vida.coberturaContrato,
        await ritmoDe(token.symbol),
      ).catch(() => null);

      const leitura = lerVies(vida, {
        moveKind: row.moveKind,
        moveChange: row.moveChange,
        whaleExiting: row.whaleExiting,
        perpDominance: row.perpDominance,
        accountRatio: row.accountRatio,
        whaleRatio: row.whaleRatio,
        oiChange72h: row.oiChange72h,
        openInterestUsd: row.openInterestUsd,
        motores: motor?.motores ?? 0,
        motoresMedidos: motor?.medidos ?? 0,
        concentracao: motor?.concentracao ?? null,
        perfil: estudo?.perfil ?? null,
        perfilR: estudo?.melhorLag?.r ?? null,
        perfilLag: estudo?.melhorLag?.lag ?? null,
        perfilSigmas: estudo?.melhorLag?.sigmas ?? null,
        emissao: motor?.emissao ?? null,
        foraDeCirculacao: (await vestingDe(token.symbol))?.foraDeCirculacao ?? null,
        alta24h: row.change24h,
      });
      return { ...row, vida, leitura, motor };
    }),
  );
}
