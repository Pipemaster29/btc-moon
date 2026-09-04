/**
 * O universo inteiro da Binance peneirado, para a lista deixar de ser só o que
 * eu lembrei de colocar nela.
 *
 * A watchlist tem 73 moedas e todas entraram porque alguém as viu em algum
 * lugar. Isso tem um limite óbvio: o painel só pode achar padrão em moeda que
 * já está nele, e o padrão que ele procura — moeda pequena, bombada, com float
 * curto — acontece o tempo todo em moeda que ninguém apontou. São 526
 * perpétuos USDT em negociação; a lista cobre 14% deles.
 *
 * ================================================================== A MEDIÇÃO
 *
 * O gatilho não é palpite. `npm run aferir-garimpo` baixa 200 dias de velas
 * diárias dos 526 perpétuos e mede o que acontece DEPOIS de um dia de alta
 * grande, com a mesma metodologia do `lib/placar.ts`: mediana do retorno à
 * frente, comparada com a referência de TODAS as observações, e concordância
 * entre moedas. Medido em 04/09 sobre 95.141 observações de 523 moedas,
 * retorno de 7 dias à frente, referência −0,96%:
 *
 *   alta do dia     n       mediana 7d      vs referência    moedas a favor
 *   caiu          50.054      −0,65%          +0,31 p.p.        310/523
 *   0 a 10%       41.107      −1,08%          −0,12 p.p.        300/523
 *   10 a 25%       3.146      −4,75%          −3,79 p.p.        301/430
 *   25 a 50%         625     −12,68%         −11,72 p.p.        102/139
 *   50 a 100%        169     −22,00%         −21,04 p.p.         26/40
 *   +100%             40     −51,32%         −50,36 p.p.           5/6
 *
 * É MONOTÔNICO EM TODA A ESCALA, aparece igual no horizonte de 14 dias, e
 * aparece nas DUAS metades da janela separadamente (−12,57 e −14,75 p.p. para o
 * corte de 25%). Para comparação: os vieses que o painel emite hoje separam
 * +0,01 e +0,02 p.p. Este é, de longe, o sinal mais forte já medido aqui.
 *
 * O viés de sobrevivência corre a favor da conclusão, não contra: o universo é
 * quem está listado HOJE, então as moedas que bombaram e foram deslistadas
 * ficaram de fora — e essas são justamente as de pior desfecho.
 *
 * ========================================== E POR QUE ISSO NÃO VIRA UMA CALL
 *
 * Porque a deriva é real e o CAMINHO até ela mata a posição. Simulando vendido
 * a partir do dia da alta, com custo e o financiamento real da Binance dentro:
 *
 *   stop      alvo   stop   prazo     média      mediana    moedas com mediana+
 *   +25%       21%    55%     24%     −1,30%     −24,95%          58/152
 *   +40%       26%    41%     34%     −1,67%      +8,37%          75/152
 *   +60%       29%    30%     41%     −1,98%     +13,43%          98/152
 *   +80%       31%    24%     46%     −2,92%     +14,97%         109/152
 *   +100%      31%    18%     50%     −2,72%     +16,27%         114/152
 *
 * A MEDIANA É BOA E A MÉDIA É NEGATIVA EM TODA LARGURA DE STOP. Ganha-se pouco
 * com frequência e perde-se muito de vez em quando, que é exatamente o perfil
 * que quebra conta alavancada. Com o stop de 25% que a carteira usa hoje, 55%
 * das entradas estopam antes de qualquer coisa acontecer, e a mediana do
 * desfecho É o próprio stop.
 *
 * Só os gatilhos extremos viram média positiva, e neles a amostra some junto: a
 * alta ≥50% num dia dá +1,56% com n=202 e 22 de 46 moedas — quarenta e oito por
 * cento, que é cara ou coroa pelo critério que este projeto usa para tudo.
 *
 * Nenhum filtro das teses do projeto resgatou a média com amostra que preste. O
 * único corte que ficou positivo foi "listada há menos de 180 dias" (+1,73%,
 * n=164, 26/39 moedas), e um corte com n=164 achado depois de olhar os dados é
 * candidato a coincidência, não descoberta.
 *
 * E O LADO COMPRADO NÃO EXISTE, medido do mesmo jeito. "Comprar a derretida",
 * que é a regra de compra do painel, piora monotonicamente com a profundidade
 * da queda: caiu ≥50% do pico dá média +2,77% e mediana −1,13% com 213/395
 * moedas a favor (cara ou coroa, e sem nenhuma seletividade — é quase o
 * universo inteiro); caiu ≥85% dá média −0,76%; caiu ≥95% dá −2,43% com 2 de 17
 * moedas. Não há o que garimpar do lado comprado, e este arquivo não finge que
 * há — nem que a alta do X, que é de onde essas moedas costumam vir, seja
 * mensurável daqui.
 *
 * ===================================================================== ENTÃO
 *
 * Isto é uma LISTA DE TRIAGEM, não um emissor de calls. Ele responde "o que
 * apareceu no universo inteiro que se parece com o que a gente estuda?" e
 * entrega isso com os números do lado, para a análise completa — que exige
 * contrato identificado, leitura on-chain e histórico — rodar em cima do que
 * sobreviver. Quem promove a moeda é uma pessoa, com `npm run descobrir`,
 * porque identificar o token errado é o erro mais caro deste projeto e nenhum
 * peneiramento automático tem como evitá-lo.
 */

import { velas } from "./binance";
import { ATIVAS, WATCHLIST } from "./watchlist";

const BASE = "https://www.binance.com";

/**
 * A tabela de referência, tirada da medição acima.
 *
 * Ela é a régua do garimpo: em vez de inventar pesos para uma nota, cada moeda
 * é colocada na faixa a que ela pertence e carimbada com a MEDIANA MEDIDA
 * daquela faixa. O número que ordena a lista é, então, um número que alguém
 * pode conferir — e não a soma de pesos que ninguém sabe de onde vieram.
 *
 * `moedas` é a concordância entre moedas dentro da faixa, e ela viaja junto
 * porque uma mediana boa concentrada em poucas moedas é ruído com cara de
 * descoberta. É o teste que mais candidato mata neste projeto.
 */
export interface Faixa {
  /** Piso da alta, em fração. */
  de: number;
  rotulo: string;
  /** Mediana medida do retorno de 7 dias à frente, para moedas nesta faixa. */
  mediana7d: number;
  /** Quantas observações sustentam essa mediana. */
  n: number;
  /** Em quantas moedas de quantas o efeito apareceu. */
  moedas: [number, number];
}

/** Referência medida: TODAS as observações do universo, 7 dias à frente. */
export const REFERENCIA_7D = -0.0096;

/** Alta de UM dia. É a faixa com a resposta mais forte e mais rápida. */
export const FAIXAS_DIA: Faixa[] = [
  { de: 1.0, rotulo: "+100% num dia", mediana7d: -0.5132, n: 40, moedas: [5, 6] },
  { de: 0.5, rotulo: "50–100% num dia", mediana7d: -0.22, n: 169, moedas: [26, 40] },
  { de: 0.25, rotulo: "25–50% num dia", mediana7d: -0.1268, n: 625, moedas: [102, 139] },
  { de: 0.1, rotulo: "10–25% num dia", mediana7d: -0.0475, n: 3146, moedas: [301, 430] },
];

/** Alta acumulada de SETE dias — a "mais valorizadas da semana". */
export const FAIXAS_SEMANA: Faixa[] = [
  { de: 2.0, rotulo: "+200% na semana", mediana7d: -0.4201, n: 134, moedas: [20, 26] },
  { de: 1.0, rotulo: "100–200% na semana", mediana7d: -0.1875, n: 326, moedas: [54, 68] },
  { de: 0.5, rotulo: "50–100% na semana", mediana7d: -0.0927, n: 1126, moedas: [130, 180] },
  { de: 0.25, rotulo: "25–50% na semana", mediana7d: -0.0543, n: 3215, moedas: [276, 377] },
];

function faixaDe(alta: number, faixas: Faixa[]): Faixa | null {
  return faixas.find((f) => alta >= f.de) ?? null;
}

export interface Achado {
  symbol: string;
  ticker: string;
  preco: number;
  /** Fração. */
  alta24h: number;
  /**
   * Alta acumulada de 7 dias, ou NULO quando não há 7 dias de série.
   *
   * NULO E NÃO ZERO, e essa distinção é a armadilha nº 2 do AGENTS.md aplicada
   * aqui: zero se lê como "não andou", e moeda listada há três dias é
   * exatamente a que anda 100% num dia. É a mesma correção que
   * `lib/overview.ts` já carrega para o `change24h`.
   */
  alta7d: number | null;
  /** Volume em dólar nas 24h. */
  volume24h: number;
  /**
   * Quantos dias de vela a moeda tem. Menos de 8 é moeda recém-listada.
   *
   * Existe porque `alta7d` e `quedaDoPico` são NULOS nesse caso, e um nulo sem
   * explicação na tela vira "não andou" na cabeça de quem lê.
   */
  diasDeSerie: number;
  /**
   * Circulante × preço, quando a Binance publica o circulante.
   *
   * É ANOTAÇÃO, NÃO FILTRO, e a diferença é medida. O objeto de estudo deste
   * projeto é moeda pequena, então a tentação é cortar por tamanho — mas a
   * medição não sustenta o corte: a Binance só guarda TRINTA DIAS de supply
   * circulante, e com isso a amostra por faixa de tamanho não fecha (a única
   * faixa que passou de 30 observações, US$ 20 a 100 milhões, deu −18,8 p.p.
   * com 11 de 14 moedas — igual ao número do universo inteiro, sem separar de
   * nada). Cortar por tamanho aqui seria escolher pelo que se acredita e não
   * pelo que se mediu, então o número aparece na tela e quem decide é quem olha.
   */
  marketCap: number | null;
  /**
   * Open interest em dólar ÷ market cap.
   *
   * A prima pobre do `perpDominance` do painel, que divide pela liquidez da pool
   * à vista. Aqui não há pool — o garimpo varre o universo e a maioria nem tem
   * contrato identificado —, mas a pergunta é a mesma: o preço se forma em quem
   * compra a moeda ou em quem aposta nela? Também não é filtro, pelo mesmo
   * motivo de amostra.
   */
  oiSobreMcap: number | null;
  /** Taxa de financiamento por 8h. Positiva, o comprado paga. */
  funding: number | null;
  /** Dias desde que a Binance listou o perpétuo. */
  idadeDias: number | null;
  /** Quanto o preço está abaixo da máxima da série, ou nulo sem série. */
  quedaDoPico: number | null;
  /** A faixa que manda na ordenação, com a mediana medida dela. */
  faixa: Faixa;
  /** Se a faixa que classificou veio do dia ou da semana. */
  origem: "dia" | "semana";
  /** Já está na watchlist? Se sim, não é achado novo — é confirmação. */
  naLista: boolean;
  /** Aposentada da watchlist: já foi olhada e descartada. */
  aposentada: boolean;
  porque: string[];
}

export interface Garimpo {
  geradoEm: number;
  /** Quantos perpétuos foram peneirados. */
  universo: number;
  /** Quantos ficaram sem série de velas — "não consegui", não "não achou". */
  semSerie: number;
  achados: Achado[];
}

interface RawSymbol {
  symbol: string;
  status: string;
  contractType: string;
  quoteAsset: string;
  onboardDate: number;
}

async function pegarJson<T>(caminho: string, revalidate: number): Promise<T | null> {
  try {
    const res = await fetch(`${BASE}${caminho}`, {
      signal: AbortSignal.timeout(20_000),
      next: { revalidate },
    });
    return res.ok ? ((await res.json()) as T) : null;
  } catch {
    return null;
  }
}

/**
 * O universo negociável AGORA.
 *
 * O filtro por `status` e `contractType` não é burocracia: contrato em
 * liquidação continua aparecendo na lista com preço parado, e o PORTAL da Gate
 * — `in_delisting`, volume zero, marcando 24% fora da Binance — é o exemplo de
 * como preço velho de contrato morto envenena tudo o que se calcula em cima.
 *
 * `onboardDate` vem de graça aqui e responde a única pergunta cujo filtro mediu
 * média positiva: há quanto tempo esta moeda existe na praça grande.
 */
async function universo(): Promise<RawSymbol[]> {
  const info = await pegarJson<{ symbols: RawSymbol[] }>("/fapi/v1/exchangeInfo", 3600);
  if (!info?.symbols) return [];
  return info.symbols.filter(
    (s) => s.status === "TRADING" && s.contractType === "PERPETUAL" && s.quoteAsset === "USDT",
  );
}

/**
 * Volume mínimo em 24h para a moeda ser candidata.
 *
 * Não é filtro de qualidade, é filtro de EXISTÊNCIA: abaixo disto o "pump" de
 * 40% pode ser uma ordem de mil dólares num livro vazio, e a alta que a peneira
 * mediu não é a mesma coisa que isso. O corte é frouxo de propósito — a lista
 * atual tem moeda girando US$ 2 milhões por dia e ela precisa continuar
 * passando.
 */
export const VOLUME_MINIMO = 500_000;

/**
 * Peneira o universo inteiro e devolve o que se parece com o objeto de estudo.
 *
 * O CUSTO É DE UMA RODADA SÓ e ele foi medido: três requisições largas —
 * `exchangeInfo`, `ticker/24hr`, `premiumIndex` — mais uma de velas por moeda.
 * As 523 velas voltam em cinco segundos com o teto de concorrência de
 * `lib/limite.ts`, e o peso somado fica perto de 1.100 contra o orçamento de
 * 2.400 por minuto da Binance.
 *
 * As velas valem a viagem porque metade dos sinais depende de série: a alta de
 * SETE dias — que é a "mais valorizadas da semana" da pergunta original — não
 * existe em nenhum endereço agregado, e a queda desde o pico da vida também
 * não.
 */
export async function garimpar(): Promise<Garimpo> {
  const [lista, tickers, premios] = await Promise.all([
    universo(),
    pegarJson<{ symbol: string; lastPrice: string; priceChangePercent: string; quoteVolume: string }[]>(
      "/fapi/v1/ticker/24hr",
      60,
    ),
    pegarJson<{ symbol: string; lastFundingRate: string }[]>("/fapi/v1/premiumIndex", 300),
  ]);

  const porTicker = new Map((tickers ?? []).map((t) => [t.symbol, t]));
  const porPremio = new Map((premios ?? []).map((p) => [p.symbol, Number(p.lastFundingRate)]));
  const naLista = new Map(WATCHLIST.map((t) => [t.symbol, t]));
  const ativas = new Set(ATIVAS.map((t) => t.symbol));

  // O corte de volume, ANTES das velas. E ele corta pouco: medido em 04/09,
  // 519 dos 526 perpétuos passam — 99%. Não está aqui para economizar
  // requisição, e dizer que estava era falso: está para não deixar entrar na
  // lista um "pump" de 40% que foi uma ordem de mil dólares num livro vazio. É
  // filtro de EXISTÊNCIA de mercado, e o custo real do garimpo continua sendo
  // uma requisição de velas por moeda da praça.
  const candidatas = lista.filter((s) => {
    const t = porTicker.get(s.symbol);
    if (!t) return false;
    const volume = Number(t.quoteVolume);
    return Number.isFinite(volume) && volume >= VOLUME_MINIMO;
  });

  const achados: Achado[] = [];
  let semSerie = 0;

  await Promise.all(
    candidatas.map(async (s) => {
      const t = porTicker.get(s.symbol);
      if (!t) return;
      const preco = Number(t.lastPrice);
      const alta24h = Number(t.priceChangePercent) / 100;
      if (!(preco > 0) || !Number.isFinite(alta24h)) return;

      const v = await velas(s.symbol, "1d", 30).catch(() => []);
      // Lista vazia é "NÃO CONSEGUI", e só isso conta como falha de leitura.
      if (v.length === 0) {
        semSerie++;
        return;
      }

      // MOEDA RECÉM-LISTADA NÃO PODE SER DESCARTADA AQUI, e era.
      //
      // A versão anterior exigia 8 velas para seguir, e jogava fora quem tinha
      // menos — junto com a contagem de "sem série", como se fosse falha de
      // leitura. Custo medido em 04/09: a MARSCOIN, listada havia TRÊS DIAS,
      // subindo 96,3% em 24h com US$ 588 milhões de volume, sumia do garimpo.
      // Ela cai na faixa de 50 a 100% num dia, cuja mediana medida é −22,00% em
      // 7 dias — a segunda mais forte da tabela — e é justamente o tipo de moeda
      // que o único filtro de média positiva ("listada há menos de 180 dias")
      // aponta. O garimpo perdia exatamente o que existe para achar.
      //
      // A alta de 24h vem do `ticker/24hr` e NÃO precisa de vela nenhuma. Quem
      // precisa de série é a alta de 7 dias e a queda do pico, e essas duas
      // viram NULO em vez de zero — a armadilha nº 2 do AGENTS.md, e a mesma
      // correção que `lib/overview.ts` já carrega: "não tenho 24 horas de série"
      // não pode virar "não andou" logo na moeda que anda 100% num dia.
      const ultimo = v[v.length - 1].close;
      const alta7d =
        v.length >= 8 && ultimo > 0 && v[v.length - 8].close > 0
          ? ultimo / v[v.length - 8].close - 1
          : null;
      const pico = Math.max(...v.map((x) => x.high));
      const quedaDoPico = pico > 0 ? preco / pico - 1 : null;

      // A faixa mais severa das duas manda: uma moeda que fez +30% hoje DEPOIS
      // de +150% na semana é o caso da BTW, e classificá-la pelo dia jogaria
      // fora a metade que mais importa.
      const doDia = faixaDe(alta24h, FAIXAS_DIA);
      const daSemana = alta7d == null ? null : faixaDe(alta7d, FAIXAS_SEMANA);
      if (!doDia && !daSemana) return;
      const usaDia =
        !daSemana || (doDia != null && doDia.mediana7d <= daSemana.mediana7d);
      const faixa = (usaDia ? doDia : daSemana) as Faixa;

      const funding = porPremio.get(s.symbol);
      const idadeDias = s.onboardDate > 0 ? (Date.now() - s.onboardDate) / 86_400_000 : null;
      const doProjeto = naLista.get(s.symbol);

      const porque = [`${faixa.rotulo}: mediana medida de ${(faixa.mediana7d * 100).toFixed(1)}% em 7 dias`];
      if (alta7d != null && alta24h >= 0.1 && alta7d >= 0.5) {
        porque.push(`vem de ${(alta7d * 100).toFixed(0)}% na semana`);
      }
      if (alta7d == null) {
        // O motivo do buraco, e não só o buraco: sem isto a linha aparece com
        // travessão na coluna de 7 dias e quem lê completa a lacuna sozinho.
        porque.push(`só ${v.length} ${v.length === 1 ? "dia" : "dias"} de série — sem 7 dias para comparar`);
      }
      if (idadeDias != null && idadeDias < 180) {
        // O único corte cujo desfecho MÉDIO ficou positivo. Com n=164 e achado
        // depois de olhar os dados, ele entra como anotação e não como filtro.
        porque.push(`listada há ${Math.round(idadeDias)} dias`);
      }
      if (funding != null && funding >= 0.0005) {
        porque.push(`comprado paga ${(funding * 100).toFixed(3)}% por 8h para ficar`);
      }
      // "Na máxima DA SÉRIE" e não "dos 30 dias": numa moeda de quatro velas a
      // série tem quatro dias, e prometer trinta seria mentir no rótulo.
      if (quedaDoPico != null && quedaDoPico >= -0.05) {
        porque.push(v.length >= 30 ? `na máxima dos 30 dias` : `na máxima dos ${v.length} dias de série`);
      }

      achados.push({
        symbol: s.symbol,
        ticker: s.symbol.replace(/USDT$/, ""),
        preco,
        alta24h,
        alta7d,
        volume24h: Number(t.quoteVolume),
        diasDeSerie: v.length,
        marketCap: null,
        oiSobreMcap: null,
        funding: funding != null && Number.isFinite(funding) ? funding : null,
        idadeDias,
        quedaDoPico,
        faixa,
        origem: usaDia ? "dia" : "semana",
        naLista: doProjeto != null && ativas.has(s.symbol),
        // Aposentada NÃO é o mesmo que ausente, e por isso ela tem coluna
        // própria: é moeda que já foi olhada e descartada por alguém. Trazê-la
        // de volta como novidade faria o garimpo repropor todo mês o que já foi
        // decidido.
        aposentada: doProjeto?.aposentada != null,
        porque,
      });
    }),
  );

  // Pela mediana MEDIDA da faixa, e o desempate pela alta do dia. Ordenar por
  // uma nota inventada é o que este arquivo existe para não fazer.
  achados.sort((a, b) => a.faixa.mediana7d - b.faixa.mediana7d || b.alta24h - a.alta24h);

  // SEGUNDA PASSADA, só sobre quem sobreviveu: tamanho e open interest.
  //
  // Fica separada porque o custo é por moeda e a peneira já reduziu 526 a umas
  // poucas dezenas. Rodar isto no universo inteiro seria meio milhar de
  // requisições para enfeitar linhas que ninguém vai ler.
  await Promise.all(achados.map((a) => anotarTamanho(a)));

  return { geradoEm: Date.now(), universo: lista.length, semSerie, achados };
}

/**
 * Market cap e open interest, do endereço de open interest da Binance.
 *
 * O supply circulante vem DE GRAÇA junto com o open interest — é o mesmo
 * `CMCCirculatingSupply` que `lib/binance.ts` usa para achar unlock. A janela é
 * de trinta dias e é o teto da própria API, o que já custou uma conclusão: é
 * por causa dela que o tamanho não pôde virar filtro medido.
 */
async function anotarTamanho(a: Achado): Promise<void> {
  const bruto = await pegarJson<{ sumOpenInterestValue: string; CMCCirculatingSupply?: string }[]>(
    `/futures/data/openInterestHist?symbol=${a.symbol}&period=1d&limit=30`,
    900,
  );
  if (!Array.isArray(bruto) || bruto.length === 0) return;

  const ultimo = bruto[bruto.length - 1];
  const circulante = Number(ultimo?.CMCCirculatingSupply ?? 0);
  const oi = Number(ultimo?.sumOpenInterestValue ?? 0);

  // Supply ausente não vira zero: market cap zero se leria como "moeda
  // minúscula", que é o oposto de "não sei o tamanho dela". É a armadilha nº 2
  // do AGENTS.md, e ela custa caro exatamente aqui, onde o número ordena
  // atenção.
  if (circulante > 0) {
    a.marketCap = circulante * a.preco;
    if (oi > 0) a.oiSobreMcap = oi / a.marketCap;
  }
}

const CAMINHO = "data/garimpo.json";

const RAW =
  "https://raw.githubusercontent.com/Pipemaster29/btc-moon/main/data/garimpo.json";

/**
 * O garimpo gravado, com as mesmas duas camadas do panorama e do placar — e
 * pelo mesmo motivo: em produção o disco é o do BUILD, e o `ignoreCommand` do
 * `vercel.json` pula o build quando só `data/` mudou.
 */
export async function getGarimpo(): Promise<Garimpo | null> {
  const valido = (d: unknown): Garimpo | null =>
    Array.isArray((d as Garimpo)?.achados) ? (d as Garimpo) : null;

  try {
    const res = await fetch(RAW, { signal: AbortSignal.timeout(4_000), next: { revalidate: 300 } });
    if (res.ok) {
      const daRede = valido(await res.json());
      if (daRede) return daRede;
    }
  } catch {
    // Cai para o disco, que sempre responde.
  }

  try {
    const { readFile } = await import("node:fs/promises");
    return valido(JSON.parse(await readFile(CAMINHO, "utf8")));
  } catch {
    return null;
  }
}
