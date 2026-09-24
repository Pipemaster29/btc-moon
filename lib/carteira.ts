/**
 * Mil dólares de mentira seguindo as calls de verdade.
 *
 * O `lib/placar.ts` já mede se os vieses separam da referência, e a resposta
 * dele é honesta e desconfortável: não separam. Mas ele mede em pontos
 * percentuais de retorno mediano, e isso não responde a pergunta que qualquer
 * pessoa faz primeiro — "se eu tivesse seguido, quanto eu teria hoje?".
 *
 * São perguntas diferentes e as duas importam. Um viés pode separar +0,5 p.p. na
 * mediana e ainda quebrar a conta, porque a mediana não sabe de tamanho de
 * posição, de custo, nem de quantas posições estão abertas ao mesmo tempo. E o
 * contrário também: pode não separar na mediana e mesmo assim sobreviver, se as
 * poucas que dão certo derem muito certo. A carteira é o teste que junta as duas
 * coisas, e é o teste que dói.
 *
 * ELA COMEÇA HOJE, e não sobre o histórico inteiro, de propósito. Rodar o motor
 * para trás sobre os dois meses gravados daria um número imediato e um número
 * enganoso: as regras do painel foram sendo ajustadas ao longo desses dois meses
 * — o freio de perfil, o de emissão, a trava de alta — e todas elas foram
 * escritas DEPOIS de ver os dados. Um resultado retrospectivo mediria o quanto
 * eu ajustei o painel olhando para o passado, e não o quanto ele acerta.
 *
 * O QUE ISTO NÃO MODELA, e cada um destes empurra o resultado para cima:
 *
 *   EXECUÇÃO        o preço de ENTRADA é o do retrato. Na vida real a ordem sai
 *                   segundos ou minutos depois, e numa moeda que anda 100% num
 *                   dia esses minutos custam. (A SAÍDA deixou de ter esse
 *                   problema — ver `Passo` abaixo.)
 *   PROFUNDIDADE    o custo de 0,15% por lado é uma estimativa fixa. Numa pool
 *                   de dois mil dólares — a C tem exatamente isso — uma ordem de
 *                   sessenta dólares já move o preço mais do que isso.
 *
 * O que ELA MODELA e é fácil esquecer que precisa modelar: é PERPÉTUO a 3x, não
 * mercado à vista — ela opera vendido, e vendido não existe à vista. Então
 * financiamento e liquidação entram na conta, e os custos incidem sobre o
 * nocional, que é três vezes a margem.
 *
 * A UNIDADE DE CADA NÚMERO IMPORTA, e confundi-las já quebrou isto uma vez:
 * `STOP` e `ALVO` são variação de PREÇO; `retorno` e `funding` são fração da
 * MARGEM, ou seja já multiplicados pela alavancagem; `RISCO_POR_FORCA` e o
 * `risco` de cada posição são fração do PATRIMÔNIO. Comparar preço contra
 * margem fazia o stop de 25% disparar com 8,3% de preço.
 *
 * ESTE ARQUIVO NÃO IMPORTA NADA DE `node:`, e isso é requisito, não estilo: a
 * marcação a mercado (`remarcar`) roda TAMBÉM no navegador, para as posições
 * andarem com o preço ao vivo em vez de esperarem o retrato seguinte. Um
 * `import` de `node:fs` no topo quebra o empacotamento do cliente inteiro, então
 * a única função que lê disco o faz por `import()` dinâmico lá dentro — o mesmo
 * arranjo de `lib/estudo.ts`.
 */

export type Lado = "long" | "short";
export type Motivo =
  | "painel mudou"
  | "stop"
  | "stop móvel"
  | "sem reação"
  | "alvo"
  | "prazo"
  | "liquidada";

/** Todos os motivos, para quem precisa validar um arquivo gravado. */
export const MOTIVOS: readonly Motivo[] = [
  "painel mudou",
  "stop",
  "stop móvel",
  "sem reação",
  "alvo",
  "prazo",
  "liquidada",
];

export interface Aberta {
  symbol: string;
  lado: Lado;
  /** Quando entrou, em milissegundos. */
  abertaEm: number;
  precoEntrada: number;
  /** Dólares alocados na entrada, já descontado o custo. */
  valor: number;
  forca: number;
  /** Último preço visto, para marcar a posição a mercado. */
  precoAtual: number;
  /** Retorno SOBRE A MARGEM, já alavancado e com custos e financiamento dentro. */
  retorno: number;
  /** Financiamento acumulado desde a abertura, em fração da margem. */
  funding: number;
  /** Preço de liquidação nominal, sem contar o financiamento já pago. */
  precoLiquidacao: number;
  /** Quando o financiamento foi cobrado pela última vez. */
  ultimoFunding: number;
  /** Última taxa vista, para o caso de o retrato seguinte não trazer nenhuma. */
  ultimaTaxa: number | null;
  /**
   * Fração do patrimônio que esta posição arriscava até o stop na ENTRADA, já
   * com a escala, o fator do lado e o freio de queda aplicados. É a unidade do
   * teto agregado — e ela mora na posição porque deixou de ser função só da
   * força: duas calls de força 2 podem arriscar valores diferentes.
   */
  risco?: number;
  /** O melhor preço desde a entrada — máxima para comprado, mínima para vendido. */
  melhor?: number;
  /**
   * A distância do stop inicial DESTA posição, em variação de preço. Mora nela
   * porque depende do lado, e porque o regime pode mudar com a posição aberta:
   * ela sai pela regra com que entrou.
   */
  stop?: number;
  /** Onde a ordem de stop está AGORA: a inicial, ou a do rastro quando já subiu. */
  nivelStop?: number;
  /**
   * A marcação VIVA já passou de uma regra de saída, e o retrato seguinte fecha.
   *
   * Mesma lógica de `estourada`: o navegador marca, não decide. Sem a bandeira,
   * uma posição abaixo do stop aparecia na tela como aberta e normal por até um
   * intervalo inteiro entre retratos — e o AGENTS.md promete que ela aparece
   * "passada do stop, sinalizada".
   */
  saida?: Motivo;
  /**
   * A margem acabou na MARCAÇÃO viva, mas nenhum retrato fechou a posição ainda.
   *
   * Só existe na marcação do navegador, e existe para não mentir nas duas
   * direções ao mesmo tempo: mostrar −180% seria inventar uma dívida que a
   * corretora não cobra (a margem isolada é o teto da perda), e mostrar −100%
   * calado sugeriria que a posição já foi fechada. Ela foi marcada em zero e
   * espera o retrato seguinte, que é quem fecha.
   */
  estourada?: boolean;
}

/**
 * UMA VELA DO CAMINHO ENTRE DOIS RETRATOS.
 *
 * Existe porque o maior otimismo desta carteira não era custo nem execução: era
 * o mapa de saída simplesmente NÃO ENXERGAR o intervalo. Os retratos saem de
 * quarenta em quarenta minutos no melhor caso e de cinco em cinco horas no
 * caso real, e stop, alvo e liquidação só eram testados nas pontas. Uma moeda
 * que caísse 30% e voltasse dentro do intervalo nunca estopava aqui — e teria
 * estopado na corretora, porque ordem parada não pisca.
 *
 * MEDIDO nas 16 posições que a carteira carregou até 04/09, comparando a maior
 * excursão que os retratos registraram com a que as velas de uma hora mostram:
 * TODAS AS DEZESSEIS esconderam movimento, a mediana escondeu 2,1 p.p. e a maior
 * — a SKYAI vendida — escondeu 5,0 p.p. Não é caso raro, é o caso normal.
 *
 * E MEDIDO TAMBÉM O QUE ISSO MUDOU ATÉ AQUI: nada. Nos dois dias de vida da
 * carteira nenhuma posição chegou perto dos limites — a que mais andou contra
 * foi a TUT, a 12,5% de preço, metade do stop —, então as duas leituras dão o
 * mesmo patrimônio. Isto é um freio que ainda não foi acionado, não uma melhora
 * de resultado, e `npm run carteira` imprime os dois números lado a lado para
 * que continue sendo possível ver qual é qual.
 *
 * As velas vêm do PERPÉTUO e os preços da carteira vêm do retrato, que prefere a
 * pool à vista onde ela existe. Misturar as duas escalas cruas inventaria stop
 * onde só há diferença de praça, então o caminho é ANCORADO: as velas são
 * multiplicadas pela razão entre o preço do retrato e o fechamento da última
 * vela da janela. Assim o fim do caminho coincide com o retrato por construção,
 * e o que sobra da vela é só o que ela tem para dizer — a excursão de dentro.
 * Medidas as mesmas 16 posições, essa razão ficou entre 0,96 e 1,08.
 */
export interface Passo {
  /**
   * Quando a vela ABRIU, em milissegundos.
   *
   * Existe por um motivo só, e é um motivo de correção: a vela que contém o
   * instante da ENTRADA também contém os minutos ANTERIORES a ela. Uma posição
   * aberta às 14h20 herdaria a mínima das 14h05 e poderia estopar por um
   * movimento que aconteceu antes de ela existir — uma perda inventada, que é
   * pior do que uma perda não vista.
   */
  abriuEm: number;
  /**
   * Quando a vela FECHOU, em milissegundos.
   *
   * É por ele que a vela é ordenada e que se decide se ela já cabe no intervalo
   * vivido. Vela em formação não entra: a máxima dela ainda pode acontecer
   * depois do retrato que estamos processando, e usá-la seria olhar o futuro.
   */
  fechouEm: number;
  abertura: number;
  maxima: number;
  minima: number;
  fechamento: number;
}

export interface Fechada {
  symbol: string;
  lado: Lado;
  abertaEm: number;
  fechadaEm: number;
  precoEntrada: number;
  precoSaida: number;
  forca: number;
  motivo: Motivo;
  /** Retorno sobre a margem, líquido de custos e financiamento. */
  retorno: number;
  /** Quanto do resultado foi comido por financiamento, em fração da margem. */
  funding: number;
  /** Resultado em dólares. */
  resultado: number;
  /** Quantos dias a posição ficou de pé. */
  dias: number;
}

export interface Carteira {
  comecouEm: number;
  atualizadoEm: number;
  /** Dinheiro parado. */
  caixa: number;
  /** Caixa mais o valor de mercado das posições abertas. */
  patrimonio: number;
  /** Patrimônio ÷ capital inicial − 1. */
  retorno: number;
  abertas: Aberta[];
  fechadas: Fechada[];
  /** Quantas fecharam no positivo, sobre quantas fecharam. */
  acertos: number;
  encerradas: number;
  /** Por que as posições fecharam — o mapa de saída é metade da estratégia. */
  porMotivo: Record<string, { n: number; retornoMedio: number }>;
  /** O mesmo, separado por lado. */
  porLado: Record<string, { n: number; retornoMedio: number; acertos: number }>;

  /**
   * O LADO DO RISCO, que não existia e sem o qual não dá para julgar o tamanho.
   *
   * A carteira mostrava retorno, acertos e motivo de saída — tudo do lado do
   * ganho. A pergunta "este tamanho está certo?" não tem resposta sem a outra
   * metade: quanto a conta afundou no caminho, e quanto do orçamento de risco
   * chegou a ser usado.
   *
   * Sem isto, "conservadora" e "agressiva" viram opinião. Com isto, viram dois
   * números na mesma tela: uma carteira que rende 3% com 2% de queda máxima e
   * uma que rende 3% com 30% não são a mesma carteira, e até aqui era impossível
   * distinguir as duas olhando o painel.
   */
  /** Maior patrimônio já alcançado. */
  pico: number;
  /** Maior queda do pico até o vale seguinte, em fração. Sempre ≤ 0. */
  quedaMaxima: number;
  /** Maior margem exposta ao mesmo tempo, em fração do patrimônio de então. */
  maiorExposicao: number;
  /**
   * Maior risco agregado já comprometido, em fração do patrimônio.
   *
   * É o que a conta perderia se TODAS as posições abertas naquele instante
   * batessem no stop juntas — o cenário que o teto de 25% existe para limitar.
   * Comparar este número com o teto responde se o teto está prendendo ou se é
   * enfeite.
   */
  maiorRiscoAberto: number;
  /** O patrimônio ao longo do tempo, um ponto por hora no máximo. */
  curva: { t: number; patrimonio: number }[];
  /**
   * As regras com que ESTA carteira foi calculada.
   *
   * Gravadas no arquivo e não importadas pela tela, porque o arquivo pode ter
   * sido gerado por outra versão do código: a página lê o `carteira.json` do
   * `main` pelo GitHub raw, e o texto "stop de 25%" ao lado de uma carteira
   * calculada com outro stop seria a tela descrevendo uma regra que não gerou
   * aqueles números. Opcional porque os arquivos anteriores não têm.
   */
  regras?: Regras;
  /** O multiplicador do freio de queda agora: 1 é o orçamento inteiro. */
  freio?: number;
  /**
   * Quantas linhas do histórico ficaram de fora por não serem o preço do
   * perpétuo naquela hora (`foraDoPerpetuo`). Opcional: zero não é gravado.
   */
  foraDoPerpetuo?: number;
  /**
   * As moedas que chegaram em vista em algum retrato, tiradas do histórico.
   *
   * Do HISTÓRICO e não do conjunto de agora: uma moeda que sair de vista, ou for
   * escrita na lista, continua tendo entrado pela carteira da Binance nas calls
   * que já fez. É com isto que a tela separa o resultado de cada origem.
   */
  emVista?: string[];
  /** Risco comprometido agora, em fração do patrimônio. */
  riscoAberto?: number;
  /**
   * A tabela de regimes do `npm run carteira`, gravada para a tela.
   *
   * Ela morava só no terminal, e é ela que decide se uma regra entra: o
   * publicado ao lado do anterior e do publicado com cada peça desligada, nas
   * duas metades e sem a moeda que mais ganhou. Sem ela na página, o retorno não
   * tinha contra o que ser lido — e o número que mais pesa, "sem a melhor
   * moeda", ficava invisível para quem não roda o script.
   */
  comparacao?: Comparacao;
  /**
   * O que já foi avisado pelo Telegram (`lib/avisos.ts`): as chaves dos eventos
   * de abrir e fechar, as mais recentes primeiro. Viaja no arquivo porque a
   * carteira é recalculada inteira a cada retrato, e sem a memória o mesmo
   * "abriu" sairia de novo toda vez.
   */
  avisos?: { enviados: string[] };
}

/** Uma linha da tabela de regimes. Retornos em fração do capital inicial. */
export interface LinhaRegime {
  nome: string;
  retorno: number;
  /** O retorno tirando a moeda que mais deu dinheiro, e qual era ela. */
  semAMelhor: { ticker: string; retorno: number };
  quedaMaxima: number;
  encerradas: number;
  /** Cada metade da janela rodada do zero, sozinha. */
  metades: [number, number];
  maiorExposicao: number;
  maiorRiscoAberto: number;
}

export interface Comparacao {
  /** O corte entre as metades, em milissegundos. */
  meio: number;
  linhas: LinhaRegime[];
  /** A curva do regime anterior sobre as mesmas calls, para desenhar ao lado. */
  anterior: { t: number; patrimonio: number }[];
}

// ------------------------------------------------------------------ as regras

/** Com quanto ela começa. */
export const CAPITAL_INICIAL = 1000;

/**
 * Quanto do patrimônio entra em cada call, por força da leitura.
 *
 * Dimensionado pelo RISCO e não pelo capital: cada posição arrisca uma fração
 * fixa do patrimônio até o stop, e o tamanho sai dessa conta. Com stop em 25% e
 * alavancagem de 3, arriscar 2% do patrimônio pede margem de 2,67% — que
 * controla 8% em posição.
 *
 * DOBRADO EM 05/09, DE 1,5/1,0/0,5%, E O MOTIVO NÃO É QUERER GANHAR MAIS.
 *
 * A régua anterior deixava a carteira sem conseguir testar o que ela existe para
 * testar. Medido nela: o pico de margem exposta foi 17% de um teto de 50% e o
 * pico de risco agregado 13% de 25%, com 85% do dinheiro parado — NENHUM teto
 * chegava perto de prender. Quem limitava era só o tamanho por call, e a
 * consequência aritmética é que uma call de força 2 acertando o ALVO INTEIRO
 * movia +1,6% da conta. Uma carteira assim não quebra nem se tudo der errado, e
 * "isto quebra a conta?" é exatamente a pergunta que ela foi construída para
 * responder — e que o `lib/placar.ts` sozinho não responde, porque mediana não
 * sabe de tamanho de posição nem de quantas posições ficam abertas juntas.
 *
 * DOIS E NÃO TRÊS, e o corte saiu da tabela de escala do `npm run carteira`:
 *
 *   escala   risco/call     retorno   queda máx   margem   risco agregado
 *     1x     1,5/1,0/0,5%     −0,0%      −1,4%      17%         13%
 *     2x     3,0/2,0/1,0%     −0,1%      −2,8%      32%         25%   ← encosta
 *     3x     4,5/3,0/1,5%     −2,1%      −3,1%      32%         24%
 *     5x     7,5/5,0/2,5%     −4,3%      −5,3%      33%         25%
 *
 * 2x é onde o risco agregado encosta nos 25% que este arquivo declara. Acima
 * disso mais tamanho NÃO compra exposição — a margem trava em 32% — ele compra
 * RECUSA de call, porque o teto passa a barrar as que chegam depois. Escalar
 * além de 2x não é ser mais agressivo, é operar um subconjunto arbitrário das
 * mesmas calls.
 *
 * O QUE ISSO NÃO É: uma aposta em que o painel funciona. O placar continua
 * dizendo que nenhum viés separa da referência, e dobrar o tamanho de uma
 * estratégia sem vantagem medida dobra a perda esperada — é o que as linhas de
 * 3x e 5x da tabela mostram, ainda que com poucos trades encerrados isso não
 * conclua. O que 2x compra é a carteira rodando no orçamento de risco que ela
 * mesma publica, em vez de num sexto dele.
 *
 * O teto agregado de 25% é o que segura o resto: o painel emite treze calls ao
 * mesmo tempo num dia normal, e a 2% cada isso somaria 26% — o teto barra a
 * décima terceira. É ele, e não o tamanho por call, que passa a ser o freio.
 *
 * A força vem de `lerVies` e vale o que ela diz valer: 3 é a regra com o
 * refinamento mais forte medido, 1 é a que sobrevive por pouco.
 */
export const RISCO_POR_FORCA: Record<number, number> = { 3: 0.03, 2: 0.02, 1: 0.01 };

/**
 * Teto de MARGEM comprometida ao mesmo tempo.
 *
 * Sem ele, um dia com vinte calls colocaria tudo na mesa. Metade parada é o que
 * garante que a carteira sobreviva para continuar medindo — que é o objetivo
 * dela, já que ela existe para produzir amostra e não lucro.
 *
 * É margem e não nocional: a 3x, metade do patrimônio em margem controla uma
 * vez e meia o patrimônio em posição. O que limita quantas calls cabem é o
 * dinheiro que sai do caixa, e o risco agregado já está limitado pelo tamanho de
 * cada uma — treze calls a 1,5% somam 19,5% do patrimônio se TODAS baterem no
 * stop no mesmo dia.
 */
export const EXPOSICAO_MAXIMA = 0.5;

/**
 * Quanto a conta pode perder se TUDO bater no stop no mesmo dia.
 *
 * O teto de margem sozinho deixou de proteger quando a alavancagem entrou: a
 * margem por call caiu para um terço, então cabem três vezes mais posições
 * dentro dos mesmos 50%. Medido no teste de quarenta calls simultâneas, a
 * carteira passou de 9 para 26 posições abertas — 39% de risco agregado.
 *
 * Cripto tem dias em que a lista inteira cai 25% junto, e é exatamente esse o
 * tamanho do stop. Um quarto da conta é o que se aceita perder num dia desses;
 * o resto precisa sobreviver para continuar medindo.
 */
export const RISCO_TOTAL_MAXIMO = 0.25;

/**
 * Onde a posição morre, em variação de PREÇO.
 *
 * De preço, e não de margem: a 3x isto consome 75% da margem, e é dessa conta
 * que sai o teto de alavancagem. Comparar contra o retorno alavancado faria o
 * stop disparar com 8,3% de preço.
 *
 * Vinte e cinco por cento fica fora do ruído de UM DIA nestas moedas — mas não
 * a "três desvios" que este comentário dizia até 23/09. O texto afirmava
 * volatilidade diária de 7% a 10% "na maioria delas", e o `estudos.json` mede
 * outra coisa: desvio diário mediano de 11,2%, com 48 de 70 moedas acima de 10%.
 * São ~2,2 desvios na moeda típica, 3,8 na mais calma (RIF, 6,6%) e 1,3 na mais
 * nervosa (H, 19,1%).
 *
 * E mais curto foi medido em 23/09 — fixo e por volatilidade da moeda — e não
 * passou: o ganho era de uma moeda só. Ver `REGRAS`.
 */
export const STOP = 0.25;

/**
 * Onde ela realiza, em variação de PREÇO — como o stop, e pelo mesmo motivo.
 *
 * Sai da assimetria medida, que é o único motivo pelo qual a regra de compra
 * deste painel existe: moeda pequena e derretida sobe mais de 20% em 21,0% das
 * semanas contra 3,8% que caem mais de 20%. Quarenta por cento é o dobro disso —
 * pega a cauda que sustenta a regra sem esperar a moeda dobrar.
 */
export const ALVO = 0.4;

/**
 * Até quando a call continua sendo a mesma call.
 *
 * As duas regras direcionais do painel foram medidas em janelas de sete e
 * catorze dias. Passado isso, segurar a posição deixa de ser seguir a leitura e
 * passa a ser uma aposta minha, que ninguém mediu.
 */
export const PRAZO_DIAS = 14;

/**
 * Custo de ida e volta, por lado.
 *
 * 0,05% de taxa de taker mais 0,10% de escorregada. É estimativa, e a nota no
 * topo do arquivo diz por que ela é otimista nas moedas de pool rasa.
 */
export const CUSTO = 0.0015;

/**
 * Salto de preço entre dois retratos que só pode ser erro de dado.
 *
 * SEM ISTO UMA LINHA DE LIXO QUEBRA A CARTEIRA INTEIRA, e não é hipótese: o JCT
 * já foi gravado no histórico a 2,9e-27, quinze ordens de grandeza abaixo do
 * preço dele. Reproduzido — preço 1, depois 2,9e-27, depois 1,02 — a carteira
 * fecha no stop a −100%, REABRE no preço de lixo e fecha no alvo com ganho de
 * 3,5e+28%. Mil dólares viram 1,3e+28.
 *
 * Os retratos saem a cada quarenta minutos. Nenhum mercado real faz dez vezes
 * nesse intervalo — a AKE, que dobrou num dia, andou 52% no melhor par de
 * retratos. Dez vezes é folgado de propósito: não serve para pegar pool rasa
 * desalinhada, serve para pegar lixo, exatamente como o freio equivalente do
 * `lib/overview.ts`.
 */
export const SALTO_ABSURDO = 10;

/**
 * Quantas vezes o patrimônio cada posição controla.
 *
 * TRÊS É O TETO QUE PRESERVA O STOP, e o número sai de uma conta, não de gosto.
 * O stop é de 25% DE PREÇO. A 3x ele consome 75% da margem: a posição sobrevive
 * ao stop e ele funciona como stop. A 4x os mesmos 25% consomem 100% — a
 * liquidação acontece exatamente onde o stop dispararia, e acima disso ela vem
 * ANTES: o stop vira enfeite e quem decide a saída é a corretora.
 *
 * A 1x a carteira mal se movia: uma call de +40% numa posição de 4% mexe 1,6% do
 * patrimônio, e ela levaria meses para dizer qualquer coisa. A 3x diz o mesmo em
 * um terço do tempo sem abrir mão da regra de saída.
 *
 * E ela opera VENDIDO, o que não existe à vista. Isto sempre foi futuros; a 1x
 * era futuros com alavancagem de um, o que só escondia a pergunta.
 */
export const ALAVANCAGEM = 3;

/**
 * Margem de manutenção da corretora, abaixo da qual a posição é liquidada.
 *
 * Meio por cento é a faixa das corretoras grandes para posição pequena. Com ela,
 * a liquidação a 3x acontece quando o preço anda 33,2% contra — depois do stop
 * de 25%, que é exatamente o que o teto de alavancagem existe para garantir.
 */
export const MARGEM_MANUTENCAO = 0.005;

/**
 * Financiamento presumido quando o histórico não gravou a taxa real.
 *
 * As linhas anteriores a 03/09 não têm o campo. Medido nas moedas da lista, a
 * taxa fica em torno de 0,015% por período de oito horas — 16% ao ano —, e é
 * esse o valor usado como piso. O sinal segue a convenção da Binance: positivo,
 * o comprado paga.
 */
export const FUNDING_PRESUMIDO = 0.00015;

// ------------------------------------------------------------------ o regime

/**
 * AS REGRAS DE GESTÃO NUM LUGAR SÓ, para poderem ser MEDIDAS lado a lado.
 *
 * Eram constantes soltas lidas direto pelo motor, e isso tinha um custo
 * concreto: para comparar dois jeitos de gerir a mesma lista de calls era
 * preciso editar o arquivo, rodar, anotar, desfazer. A tabela de escala do
 * `npm run carteira` só existia porque `escala` era o único parâmetro que o
 * motor aceitava. Agora o regime inteiro é um parâmetro, e o script imprime o
 * publicado ao lado do anterior sobre as MESMAS emissões e o MESMO caminho de
 * velas — a diferença entre os dois fica medida a cada retrato, e não presumida
 * uma vez.
 *
 * O que NÃO está aqui de propósito: alavancagem, custo, margem de manutenção.
 * Esses são o mercado, não a gestão — mudar um deles é mudar a pergunta.
 */
export interface Regras {
  /** Stop do comprado, em variação de PREÇO contra a entrada. */
  stopComprado: number;
  /** Stop do vendido, em variação de PREÇO contra a entrada. */
  stopVendido: number;
  /** Alvo fixo, em variação de PREÇO a favor. Nulo: só o rastro realiza. */
  alvo: number | null;
  /** Prazo máximo da call, em dias. */
  prazoDias: number;
  /**
   * Depois de quantos dias a posição precisa estar a favor para continuar de pé.
   * Nulo: desligado.
   */
  semReacaoDias: number | null;
  /**
   * O stop que acompanha o ganho: liga depois de o preço andar `ativa` a favor
   * e fica `distancia` atrás do melhor preço desde a entrada. Nulo: desligado.
   */
  rastro: { ativa: number; distancia: number } | null;
  /** Fração do patrimônio arriscada até o stop, por força da leitura. */
  riscoPorForca: Record<number, number>;
  /** Multiplicador do risco nas VENDIDAS. 1 é simétrico. */
  fatorVendido: number;
  /**
   * O freio de queda: com a conta até `inicio` abaixo do pico, orçamento
   * inteiro; daí até `fim`, ele encolhe em linha reta até o `piso`. Nulo:
   * desligado.
   */
  freio: { inicio: number; fim: number; piso: number } | null;
  /** Se QUALQUER saída queima a call, ou só stop e liquidação. */
  queimaEmToda: boolean;
  /** Multiplicador do orçamento de risco inteiro — a tabela de escala. */
  escala: number;
}

/**
 * O regime que valeu de 02/09 a 23/09, preservado para ser medido ao lado.
 *
 * Em 23/09 ele estava em −11,3% com queda máxima de −17,2%, e o diagnóstico
 * das 93 posições encerradas diz onde o dinheiro saiu:
 *
 *   - AS SETE POSIÇÕES QUE ESTOPARAM NUNCA ESTIVERAM NO LUCRO. A maior excursão
 *     a favor de qualquer uma delas foi +7,3%, quase sempre na primeira hora; o
 *     resto foi sangria lenta até −25%. Stop móvel não teria salvado nenhuma.
 *   - O TEMPO SEPAROU AS DUAS METADES: as posições encerradas com menos de três
 *     dias somaram +US$ 66; as de três dias ou mais, −US$ 151.
 *   - O VENDIDO PAGOU O SQUEEZE: vendidas fechadas porque o painel virou para
 *     "evitar" — a moeda disparou — foram 13, e somaram −US$ 112, praticamente
 *     toda a perda do lado vendido (−US$ 101 no total).
 */
export const REGRAS_ANTERIORES: Regras = {
  stopComprado: STOP,
  stopVendido: STOP,
  alvo: ALVO,
  prazoDias: PRAZO_DIAS,
  semReacaoDias: null,
  rastro: null,
  riscoPorForca: RISCO_POR_FORCA,
  fatorVendido: 1,
  freio: null,
  queimaEmToda: false,
  escala: 1,
};

/**
 * O REGIME PUBLICADO, desde 23/09: cortar cedo o que não anda, pagar pouco pelo
 * lado que a medição condena, e usar o orçamento que sobra para tentar mais.
 *
 * O PRINCÍPIO é assimetria, e nenhuma das três mudanças mexe no que o painel
 * diz — só em quanto cada erro custa. O placar continua dizendo que nenhum viés
 * separa da referência; isto não muda isso e não finge mudar.
 *
 * MEDIDO sobre as mesmas emissões e o mesmo caminho de velas de 02/09 a 23/09,
 * e — a parte que importa — separadamente em cada METADE da janela e partindo
 * de oito datas de início diferentes, porque um regime escolhido olhando o
 * resultado de uma janela só descreve aquela janela:
 *
 *                       inteira   1ª metade   2ª metade   queda máx   pior início
 *   anterior             −11,3%     −10,4%      +2,5%      −17,2%      −11,3%
 *   publicado            +14,8%      +5,9%      +6,3%       −5,8%       +1,7%
 *
 * CORRIGIDO EM 24/09: esta tabela contava três alvos falsos da HEI, US$ 191
 * de preço de pool alheia que o perpétuo nunca tocou (`foraDoPerpetuo`).
 * Refeita com o juiz: anterior −15,3%, publicado −3,0% (queda −10,9%, metades
 * −5,9% e +7,7%). A ORDEM entre os regimes se manteve — cada peça desligada
 * continua pior —, o sinal do publicado virou. Os números abaixo são os de
 * 23/09 e ficam como registro de como a conclusão foi tomada.
 *
 * Melhora nas duas metades e em todas as datas de início; tirando as duas
 * moedas que mais ganharam com a troca (HEI e UB), a diferença ainda é de
 * +US$ 102 — 19 moedas melhoram, 9 pioram. `npm run carteira` imprime esta
 * comparação a cada retrato, com cada peça desligada uma de cada vez, para que
 * ela continue sendo medida em vez de ficar sendo lembrada.
 *
 * O QUE ISSO NÃO DEMONSTRA É LUCRO, e a conta que mostra isso é a mesma. A HEI
 * bateu o alvo três vezes e respondeu por US$ 191 do resultado; sem ela, o
 * publicado fica em −4,3% — e o anterior, sem ela, em −19,8%. A gestão nova
 * perde muito menos com as mesmas calls, e isso é robusto. Que as calls deem
 * dinheiro continua não medido, que é o que o placar diz desde agosto.
 *
 * E O QUE FOI TESTADO E NÃO PASSOU, que é metade da escolha:
 *
 *   - STOP MAIS CURTO, fixo ou por volatilidade da moeda. Com a saída por tempo
 *     no lugar, stop de 20% ou de 2σ de um dia dá +17,6% e +21,6% com a mesma
 *     queda máxima — e é quase tudo UMA moeda: o tamanho sai do risco, stop
 *     curto é posição maior, e a posição maior foi na HEI. Tirando as duas
 *     moedas que mais ganharam com a troca, o stop de 20% perde US$ 27 e o de
 *     2σ perde US$ 33; mais moedas pioram do que melhoram nos dois. Sem a
 *     saída por tempo, stop curto piora direto. Vendido com stop curto foi o
 *     pior de todos: posição vendida MAIOR, no lado que perde.
 *   - STOP MÓVEL (de 8/12% a 20/15%). As vencedoras andam pouco — excursão
 *     mediana de +3,9% — e saem pelo painel antes; o rastro mais frouxo
 *     empatou e os outros só as encurtaram.
 *   - ALVO MAIOR OU NENHUM ALVO. Nenhuma melhora: quase nada chega a +40%.
 *   - MAIS TAMANHO (1,5x e 2x o orçamento). O teto agregado passa a recusar
 *     call e a variância cresce sem retorno para pagá-la: ver a tabela do
 *     `npm run carteira`, que mede isto sobre o regime publicado.
 *   - VETAR COMPRA COM FUNDING NEGATIVO, que é o anti-sinal mais forte do
 *     `npm run medir-sinais` (−4,94 p.p. em 7 dias com funding ≤ −0,1%). Na
 *     carteira ele pega 1% das emissões de compra, e nenhum limiar melhorou as
 *     duas metades: em −0,1% o total foi de +14,8% para +14,1%; em −0,05%
 *     subiu para +17,2% piorando a primeira metade. Efeito medido no universo
 *     não é efeito medido nesta carteira.
 *     Sem vantagem medida, tamanho multiplica a variância e não o retorno.
 */
export const REGRAS: Regras = {
  ...REGRAS_ANTERIORES,
  /**
   * SEM REAÇÃO EM TRÊS DIAS, SAI.
   *
   * As duas regras direcionais do painel são apostas de REVERSÃO — vender quem
   * quicou, comprar quem derreteu —, e reversão nestas moedas é rápida ou não
   * vem: `npm run estudar` mede a memória delas em um a oito dias. Medido nas
   * posições da carteira: das 14 que chegaram ao terceiro dia no vermelho, só 6
   * terminaram no lucro, e as 14 somaram −US$ 54.
   *
   * O CORTE NÃO É UM PICO, É UM PLATÔ. Sozinha, a regra melhorou as duas
   * metades com 1, 2, 3 e 5 dias; com 7 a segunda metade já piora. Três fica no
   * meio.
   *
   * Não é stop: ela pode sair a 1% da entrada. É o tempo dizendo que a tese não
   * se confirmou no prazo em que ela costuma se confirmar.
   */
  semReacaoDias: 3,
  /**
   * O VENDIDO ARRISCA UM QUARTO.
   *
   * Duas medições independentes apontam para o mesmo lado. Na carteira, o
   * vendido perdeu US$ 101 em 33 posições — e só as 13 que o squeeze fechou
   * somaram −US$ 112. E FORA dela,
   * sobre o histórico inteiro — agosto inclusive, antes de a carteira existir —,
   * o preço SUBIU em relação à referência nas 72h seguintes a cada call de venda:
   *
   *              depois da call de venda, em 72h
   *   agosto     +0,44 p.p. contra o vendido   · 3.564 emissões
   *   setembro   +2,29 p.p. contra o vendido   · 6.268 emissões
   *              e 11,8% das vezes a moeda subiu 20%+, contra 0,4% que caiu 20%+
   *
   * O mecanismo é o do projeto inteiro: moeda pequena e fácil de empurrar tem a
   * cauda PARA CIMA, e quem está vendido é quem paga essa cauda.
   *
   * POR QUE NÃO ZERO, se zero mediu melhor (+18,1%): a carteira existe para
   * medir as calls, e o retorno sobre a margem — que é o que a tabela "por lado"
   * mostra — não depende do tamanho. Um quarto é a menor fração que mantém a
   * venda de força 1 acima do piso de US$ 1 de posição mesmo com a conta pela
   * metade: 1% × ¼ = 0,25% de risco, margem de 0,33% do patrimônio.
   */
  fatorVendido: 0.25,
  /**
   * TODA SAÍDA QUEIMA A CALL — ver `fechar`. Sem isto a saída por tempo não
   * funciona: a posição sairia "sem reação" e reabriria no mesmo lote, zerando o
   * relógio. Medido: o regime novo SEM esta linha fica em −5,2%, contra +14,8%
   * (23/09, com os alvos falsos da HEI; refeito em 24/09: −4,5% contra −3,0%).
   */
  queimaEmToda: true,
  /**
   * O FREIO DE QUEDA, e este não vem de medição: vem de mecânica, dito em voz
   * alta como a regra de concentração do `lib/lifecycle.ts`.
   *
   * Na amostra ele é NEUTRO: o regime novo não passa de −5,8% e o freio só
   * começa em −10%. Existe para o cenário que a amostra não tem, e que o teto
   * agregado descreve: todas as posições estopando no mesmo dia custam 25% da
   * conta. Sem freio, um segundo dia igual custa outros 25% do que sobrou — a
   * conta vai a −44%. Com ele, a conta a −25% arrisca um quarto do orçamento, e
   * o segundo dia custa ~6%: −30% no total. É o que separa uma carteira que
   * sofre de uma que acaba e para de medir.
   *
   * Contínuo, porque degrau faria o tamanho depender de que lado de um centavo
   * o retrato caiu. Custou 0,3 p.p. no pior dos oito inícios, onde chegou a
   * encostar.
   */
  freio: { inicio: 0.1, fim: 0.25, piso: 0.25 },
};

// ------------------------------------------------------------------- o motor

/** Uma linha do histórico, que é o que o motor consome. */
export interface Emissao {
  t: number;
  s: string;
  preco: number;
  vies: string | null;
  forca?: number | null;
  nota?: number;
  /** Taxa de financiamento por 8h, quando o retrato a gravou. */
  fund?: number | null;
  /** Só nas moedas em vista, que entraram sozinhas (`lib/emvista.ts`). */
  origem?: string;
}

interface Estado {
  caixa: number;
  abertas: Map<string, Aberta>;
  fechadas: Fechada[];
  /**
   * Moedas cuja call falhou, com o lado que falhou.
   *
   * SEM ISTO A CARTEIRA RECOMPRA A CALL QUE ACABOU DE MORRER, no MESMO retrato:
   * a posição sai pelo stop na fase de saída e a fase de abertura, logo abaixo,
   * vê o viés ainda em "long" e abre tudo de novo. Numa moeda em queda contínua
   * isso vira um moedor — reproduzido com −28% por retrato, a carteira tomou
   * ONZE stops seguidos de −84,9% da margem e perdeu 17% do patrimônio.
   *
   * Um stop diz que a leitura falhou naquela direção. Repetir a mesma aposta sem
   * nada ter mudado não é seguir o painel, é insistir. A moeda volta a valer
   * quando o viés dela sair daquele lado — aí é call nova, não a mesma.
   */
  queimadas: Map<string, Lado>;
  /** O regime de gestão desta rodada. */
  regras: Regras;
  /** O maior patrimônio já visto, e a maior queda a partir dele. */
  pico: number;
  quedaMaxima: number;
  maiorExposicao: number;
  maiorRiscoAberto: number;
  curva: { t: number; patrimonio: number }[];
  /** Linhas descartadas por `foraDoPerpetuo`. */
  foraDoPerpetuo?: number;
}

/**
 * Registra o patrimônio do instante e atualiza pico, queda e picos de risco.
 *
 * Chamado UMA vez por lote, depois das saídas e depois das aberturas, porque é
 * aí que o estado da conta está completo. Chamar antes das aberturas mediria uma
 * exposição que ainda não existe.
 */
function marcar(estado: Estado, quando: number): void {
  const exposto = [...estado.abertas.values()].reduce((s, p) => s + p.valor * (1 + p.retorno), 0);
  const patrimonio = estado.caixa + exposto;
  if (!Number.isFinite(patrimonio)) return;

  if (patrimonio > estado.pico) estado.pico = patrimonio;
  if (estado.pico > 0) {
    const queda = patrimonio / estado.pico - 1;
    if (queda < estado.quedaMaxima) estado.quedaMaxima = queda;
    // Em fração do patrimônio DE ENTÃO, não do inicial: exposição de US$ 300
    // numa conta de mil é metade do que é numa de seiscentos, e é a segunda
    // leitura que diz se o teto está prendendo.
    if (patrimonio > 0) {
      const exp = exposto / patrimonio;
      if (exp > estado.maiorExposicao) estado.maiorExposicao = exp;
    }
  }

  const risco = riscoAberto(estado);
  if (risco > estado.maiorRiscoAberto) estado.maiorRiscoAberto = risco;

  // Um ponto por hora no máximo: o motor roda sobre todos os retratos, e são de
  // duas a cinco execuções por hora. Guardar todas engordaria `carteira.json`
  // sem acrescentar forma nenhuma à curva.
  const ultimo = estado.curva[estado.curva.length - 1];
  if (!ultimo || quando - ultimo.t >= 3_600_000) {
    estado.curva.push({ t: quando, patrimonio });
  } else {
    ultimo.patrimonio = patrimonio;
  }
}

/** Variação do preço a favor da posição, sem alavancagem e sem custo. */
function aFavor(p: { lado: Lado; precoEntrada: number }, preco: number): number {
  const variacao = preco / p.precoEntrada - 1;
  return p.lado === "long" ? variacao : -variacao;
}

function stopDe(r: Regras, lado: Lado): number {
  return lado === "long" ? r.stopComprado : r.stopVendido;
}

/** O stop inicial desta posição: o gravado nela, ou o fixo do lado. */
function stopDa(p: Aberta, r: Regras): number {
  return p.stop ?? stopDe(r, p.lado);
}

/**
 * Onde a ordem de stop está, dado o melhor preço visto ATÉ AQUI.
 *
 * O rastro só aperta, nunca afrouxa: o nível é o mais protetor entre o stop
 * inicial e o que acompanha o melhor preço. Quem chama passa o `melhor` das
 * velas ANTERIORES, e não o da vela em teste — ver `percorrer`.
 */
function nivelDoStop(p: Aberta, r: Regras): number {
  const comprado = p.lado === "long";
  const s = stopDa(p, r);
  const inicial = p.precoEntrada * (comprado ? 1 - s : 1 + s);
  const melhor = p.melhor ?? p.precoEntrada;
  if (!r.rastro || aFavor(p, melhor) < r.rastro.ativa) return inicial;
  const rastro = melhor * (comprado ? 1 - r.rastro.distancia : 1 + r.rastro.distancia);
  return comprado ? Math.max(inicial, rastro) : Math.min(inicial, rastro);
}

/**
 * O risco que a posição ainda COMPROMETE, em fração do patrimônio da entrada.
 *
 * É o risco da entrada na proporção do que sobra entre a entrada e o stop.
 * Enquanto o stop é o inicial, é o risco inteiro. Quando o rastro o empurra para
 * o lado da entrada, encolhe; passado dela, é zero — a posição já não pode
 * devolver capital, só lucro, e não há motivo para ela ocupar o orçamento que
 * existe para limitar PERDA.
 *
 * Posição sem `risco` gravado (arquivo anterior a este campo) vale o risco da
 * força, que é o que ela valia quando foi aberta.
 */
function riscoDe(p: Aberta, r: Regras): number {
  const base = p.risco ?? (r.riscoPorForca[p.forca] ?? 0) * r.escala;
  const nivel = p.nivelStop ?? nivelDoStop(p, r);
  const contra = -aFavor(p, nivel);
  const s = stopDa(p, r);
  return base * Math.min(1, Math.max(0, contra / s));
}

/**
 * Quanto do orçamento de risco sobra depois da queda do pico, de 1 ao piso.
 *
 * Linear e contínuo de propósito: um degrau ("metade depois de −10%") faria a
 * carteira mudar de comportamento por um centavo de patrimônio, e o tamanho da
 * posição passaria a depender de que lado do degrau o retrato caiu.
 */
function freioDeQueda(r: Regras, patrimonio: number, pico: number): number {
  if (!r.freio || !(pico > 0) || !Number.isFinite(patrimonio)) return 1;
  const { inicio, fim, piso } = r.freio;
  const queda = Math.max(0, 1 - patrimonio / pico);
  if (queda <= inicio) return 1;
  if (queda >= fim) return piso;
  return 1 - ((queda - inicio) / (fim - inicio)) * (1 - piso);
}

function riscoAberto(estado: Estado): number {
  let soma = 0;
  for (const p of estado.abertas.values()) soma += riscoDe(p, estado.regras);
  return soma;
}

/** Tocou o nível do stop? `preco` é a mínima (comprado) ou a máxima (vendido). */
function passouDoStop(p: Aberta, preco: number): boolean {
  if (p.nivelStop === undefined) return false;
  return p.lado === "long" ? preco <= p.nivelStop : preco >= p.nivelStop;
}

/** Stop do rastro, ou o inicial? A diferença é o motivo da saída. */
function motivoDoStop(p: Aberta, r: Regras): Motivo {
  const s = stopDa(p, r);
  const inicial = p.precoEntrada * (p.lado === "long" ? 1 - s : 1 + s);
  return p.nivelStop !== undefined && Math.abs(p.nivelStop - inicial) > inicial * 1e-9
    ? "stop móvel"
    : "stop";
}

/**
 * Retorno sobre a MARGEM: a variação de preço multiplicada pela alavancagem,
 * menos os custos de entrada e saída e menos o financiamento acumulado.
 *
 * O custo entra multiplicado porque a taxa incide sobre o NOCIONAL, que é a
 * margem vezes a alavancagem — a 3x, os 0,15% por lado custam 0,45% da margem.
 * Esquecer isso é o erro que faz backtest alavancado parecer melhor do que é.
 */
function sobreMargem(p: Aberta, preco: number): number {
  return aFavor(p, preco) * ALAVANCAGEM - 2 * CUSTO * ALAVANCAGEM - p.funding;
}

/**
 * O preço em que a corretora fecha a posição à força.
 *
 * A margem acaba quando a variação contra chega a `1/alavancagem`, menos a
 * margem de manutenção. A 3x isso é 33,2% de preço — depois do stop de 25%, que
 * é o que o teto de alavancagem existe para garantir.
 */
function precoDeLiquidacao(lado: Lado, entrada: number): number {
  const distancia = 1 / ALAVANCAGEM - MARGEM_MANUTENCAO;
  return lado === "long" ? entrada * (1 - distancia) : entrada * (1 + distancia);
}

/**
 * O caminho inverso de `sobreMargem`: em que PREÇO a posição vale tanto.
 *
 * Serve para pôr no eixo do preço um corte que é definido na margem — a
 * liquidação —, que é o único jeito de testá-lo contra a máxima e a mínima de
 * uma vela. Como ele parte do `funding` já acumulado, o preço de liquidação
 * anda contra a posição conforme ela é carregada, que é o que a corretora
 * também faz.
 */
function precoNoRetorno(p: Aberta, retorno: number): number {
  const favor = (retorno + 2 * CUSTO * ALAVANCAGEM + p.funding) / ALAVANCAGEM;
  return p.lado === "long" ? p.precoEntrada * (1 + favor) : p.precoEntrada * (1 - favor);
}

/**
 * Cobra o financiamento das horas ainda não cobradas, até `ate`.
 *
 * FICA FORA DO CAMINHO DO PREÇO de propósito. Antes ela morava depois do teste
 * `if (atual === undefined) continue`, e o efeito era que uma moeda que saísse
 * do retrato parava de pagar para carregar posição. Voltando, ela pagava tudo de
 * uma vez e a conta se acertava — mas a posição que fechasse POR PRAZO enquanto
 * a moeda estava fora saía sem pagar o intervalo inteiro. O financiamento corre
 * com o relógio, não com a cotação.
 */
function cobrarFunding(p: Aberta, ate: number, taxa: number): void {
  const horas = (ate - p.ultimoFunding) / 3_600_000;
  if (!(horas > 0) || !Number.isFinite(taxa)) return;
  p.ultimaTaxa = taxa;
  // Positiva, o comprado paga; negativa, o vendido paga. Vezes a alavancagem
  // porque a taxa incide sobre o NOCIONAL e `funding` é fração da margem.
  p.funding += (horas / 8) * taxa * (p.lado === "long" ? 1 : -1) * ALAVANCAGEM;
  p.ultimoFunding = ate;
}

/**
 * Fator que põe as velas do perpétuo na escala de preço do retrato.
 *
 * Fora da faixa, o caminho é descartado em vez de corrigido: uma razão de 1,4
 * entre as duas praças não é base de mercado, é outra moeda — homônimo, pool
 * decorativa, contrato de ponte. É o mesmo julgamento do `SALTO_ABSURDO`, e a
 * consequência de errá-lo é a mesma: stop inventado onde não houve queda.
 *
 * A faixa sai da medição, não do gosto: nas 16 posições de 04/09 a razão ficou
 * entre 0,96 e 1,08, com a HEI no extremo. 0,8 a 1,25 deixa essa dispersão
 * passar inteira e ainda barra por larga margem o que é moeda diferente.
 */
function ancora(precoRetrato: number, fechamentoVela: number): number | null {
  if (!(precoRetrato > 0) || !(fechamentoVela > 0)) return null;
  const k = precoRetrato / fechamentoVela;
  return k >= 0.8 && k <= 1.25 ? k : null;
}

/** As velas de cada série indexadas pela hora de abertura, montadas uma vez por série. */
const velasPorHora = new WeakMap<Passo[], Map<number, Passo>>();

/**
 * O preço do retrato é da MESMA moeda que o perpétuo naquela hora?
 *
 * A HEI mostrou por que isto tem de existir. A pool dela, rasa, devolvia de vez
 * em quando um preço 60% acima do perpétuo, e o retrato alternava entre os dois:
 * US$ 0,115 num, US$ 0,1836 no seguinte. Abaixo do `SALTO_ABSURDO` de dez
 * vezes, o motor aceitava — e fechou três posições "no alvo" com +46%, +64% e
 * +66% de preço, US$ 142 somados, sem que o perpétuo passasse de US$ 0,155
 * em nenhuma das janelas. `ancora` já recusava o CAMINHO dessas velas por ser
 * "outra moeda"; e em seguida o teste de ponta usava o mesmo preço para
 * fechar. A armadilha nº 7 inteira: o freio numa ponta só.
 *
 * A faixa é a de `ancora` (0,8 a 1,25), mas contra a MÍNIMA e a MÁXIMA da hora
 * em que o retrato caiu (ou da anterior — ver abaixo), e não contra um
 * fechamento: numa moeda que anda 30% dentro da hora, o preço verdadeiro de
 * qualquer minuto dela está entre as duas.
 * Sem vela para aquela hora — moeda sem série, retrato mais velho que as velas
 * buscadas — não há juiz, e o preço passa como sempre passou.
 */
export function foraDoPerpetuo(preco: number, velas: Passo[] | undefined, quando: number): boolean {
  if (!velas || velas.length === 0) return false;
  let indice = velasPorHora.get(velas);
  if (!indice) {
    indice = new Map(velas.map((v) => [v.abriuEm, v]));
    velasPorHora.set(velas, indice);
  }
  const hora = Math.floor(quando / 3_600_000) * 3_600_000;
  // A HORA DO RETRATO E A ANTERIOR. Moeda sem pool usa o preço da série do
  // perpétuo, que é de hora em hora e pode ter até uma hora de atraso: a TAKE,
  // subindo 221% em 23/09, foi gravada às 06:00 com o fechamento das 05:00,
  // 23% abaixo da mínima da vela das 06:00. Era preço de verdade, só atrasado.
  // Basta caber numa das duas; o preço de outra moeda não cabe em nenhuma.
  const velasDaHora = [indice.get(hora), indice.get(hora - 3_600_000)].filter(
    (v): v is Passo => v !== undefined && v.minima > 0 && v.maxima > 0,
  );
  if (velasDaHora.length === 0) return false;
  return velasDaHora.every((v) => preco < v.minima * 0.8 || preco > v.maxima * 1.25);
}

/**
 * Percorre o caminho entre o retrato anterior e este, e fecha onde a ordem teria
 * de fato executado. Devolve `true` quando a posição saiu no meio do caminho.
 *
 * A ORDEM DOS TESTES DENTRO DE UMA VELA É A DO PIOR CASO — liquidação, stop,
 * alvo —, porque a vela diz onde o preço esteve e não em que ordem. Supor que
 * ele tocou o stop antes do alvo é a suposição conservadora, e é a mesma que o
 * teste de ponta já fazia.
 *
 * O preço de saída é o NÍVEL DA ORDEM, não o extremo da vela: quem tem stop
 * parado em −25% sai em −25%, não na mínima do candle. A exceção é a vela que
 * ABRE já do outro lado do nível — aí houve salto, ninguém foi servido no nível,
 * e o preenchimento é na abertura. Para o stop isso é pior que o nível e para o
 * alvo é melhor, que é exatamente como o salto trata os dois na vida real.
 */
function percorrer(
  estado: Estado,
  p: Aberta,
  velas: Passo[],
  ate: number,
  precoRetrato: number,
  taxa: number,
): boolean {
  // Só vela FECHADA, ainda não percorrida, e que não começou antes da posição
  // existir. `ultimoFunding` é o relógio de onde esta posição parou, e ele avança
  // vela a vela logo abaixo — é ele que garante que nenhuma vela é percorrida
  // duas vezes, mesmo com retratos mais frequentes do que as velas.
  const janela = velas
    .filter((v) => v.fechouEm <= ate && v.fechouEm > p.ultimoFunding && v.abriuEm >= p.abertaEm)
    .sort((a, b) => a.fechouEm - b.fechouEm);
  if (janela.length === 0) return false;

  const k = ancora(precoRetrato, janela[janela.length - 1].fechamento);
  if (k === null) return false;

  const r = estado.regras;
  const comprado = p.lado === "long";
  const nivelAlvo = r.alvo === null ? null : p.precoEntrada * (comprado ? 1 + r.alvo : 1 - r.alvo);

  for (const v of janela) {
    const abertura = v.abertura * k;
    const maxima = v.maxima * k;
    const minima = v.minima * k;
    if (!Number.isFinite(maxima) || !Number.isFinite(minima) || minima <= 0) continue;

    // O financiamento até o fim desta vela é devido mesmo que ela seja a que
    // fecha a posição — a corretora cobra por hora carregada, não por hora
    // sobrevivida. Cobrar antes de testar também é o que move o preço de
    // liquidação para onde ele de fato está agora.
    cobrarFunding(p, v.fechouEm, taxa);

    // Contra a posição é mínima para comprado e máxima para vendido; a favor é o
    // contrário. Estas duas linhas são as únicas que sabem de lado.
    const contra = comprado ? minima : maxima;
    const favor = comprado ? maxima : minima;
    const tocou = (nivel: number, lado: "contra" | "favor") =>
      lado === "contra"
        ? comprado
          ? contra <= nivel
          : contra >= nivel
        : comprado
          ? favor >= nivel
          : favor <= nivel;
    // Salto por cima do nível: ninguém foi servido nele, o preenchimento é na
    // abertura da vela.
    const preenche = (nivel: number, lado: "contra" | "favor") =>
      lado === "contra"
        ? comprado
          ? Math.min(abertura, nivel)
          : Math.max(abertura, nivel)
        : comprado
          ? Math.max(abertura, nivel)
          : Math.min(abertura, nivel);

    const nivelLiq = precoNoRetorno(p, -1 + MARGEM_MANUTENCAO);
    if (tocou(nivelLiq, "contra")) {
      fechar(estado, p, preenche(nivelLiq, "contra"), v.fechouEm, "liquidada");
      return true;
    }
    // O nível do stop é o que estava PARADO quando a vela abriu — o rastro desta
    // vela ainda não subiu. Ver o fim do laço.
    const nivelStop = p.nivelStop ?? nivelDoStop(p, r);
    if (tocou(nivelStop, "contra")) {
      fechar(estado, p, preenche(nivelStop, "contra"), v.fechouEm, motivoDoStop(p, r));
      return true;
    }
    if (nivelAlvo !== null && tocou(nivelAlvo, "favor")) {
      fechar(estado, p, preenche(nivelAlvo, "favor"), v.fechouEm, "alvo");
      return true;
    }
    const dias = (v.fechouEm - p.abertaEm) / 86_400_000;
    if (dias >= r.prazoDias) {
      fechar(estado, p, v.fechamento * k, v.fechouEm, "prazo");
      return true;
    }
    if (r.semReacaoDias !== null && dias >= r.semReacaoDias && aFavor(p, v.fechamento * k) <= 0) {
      fechar(estado, p, v.fechamento * k, v.fechouEm, "sem reação");
      return true;
    }

    p.precoAtual = v.fechamento * k;
    p.retorno = sobreMargem(p, p.precoAtual);

    // O RASTRO SOBE DEPOIS DOS TESTES, e só vale da vela seguinte em diante.
    //
    // A vela diz onde o preço esteve e não em que ordem. Se a máxima que empurra
    // o rastro para cima veio DEPOIS da mínima, subir o nível antes de testar
    // estoparia a posição por um recuo que aconteceu quando a ordem ainda estava
    // mais embaixo — saída inventada, e sempre na direção de realizar cedo. Mover
    // a ordem uma vez por hora, no fechamento, é também o que alguém faria na
    // mão, e não olha o futuro.
    p.melhor = comprado ? Math.max(p.melhor ?? p.precoEntrada, maxima) : Math.min(p.melhor ?? p.precoEntrada, minima);
    p.nivelStop = nivelDoStop(p, r);
  }

  return false;
}

function fechar(estado: Estado, p: Aberta, preco: number, quando: number, motivo: Motivo): void {
  // Liquidada é o único caso em que a margem não volta: ela foi consumida antes
  // de a posição ser fechada, e fingir que sobrou algo seria o erro clássico de
  // backtest alavancado.
  const retorno = motivo === "liquidada" ? -1 : Math.max(-1, sobreMargem(p, preco));
  const devolvido = p.valor * (1 + retorno);
  estado.caixa += devolvido;
  estado.abertas.delete(p.symbol);
  // QUAIS SAÍDAS QUEIMAM A CALL.
  //
  // No regime anterior, só stop e liquidação: "sair pelo alvo, pelo prazo ou
  // porque o painel mudou de ideia não diz que a leitura estava errada". Isso é
  // verdade e não era a pergunta. A pergunta é se a MESMA leitura pode abrir a
  // mesma posição de novo no mesmo retrato — e com o prazo ela abria.
  //
  // Medido na carteira de 23/09: a PRL saiu por prazo aos 14,0 dias e reabriu
  // no mesmo lote, com o mesmo viés, pagando entrada e saída (0,9% da margem) para
  // continuar exatamente onde estava. O prazo diz "passado isso, segurar deixa de
  // ser seguir a leitura" — e a reabertura segurava. Com o "sem reação" e o stop
  // móvel é igual: a posição que sai por tempo e reabre na hora zera o relógio
  // sem nada ter mudado.
  //
  // `queimaEmToda` fecha isso: uma call é UMA aposta, e a moeda volta a valer
  // quando o viés sair daquele lado — aí é leitura nova. "Painel mudou" queima
  // também, sem efeito: o viés já está do outro lado e descongela no mesmo lote.
  const queima = estado.regras.queimaEmToda || motivo === "stop" || motivo === "liquidada";
  if (queima) estado.queimadas.set(p.symbol, p.lado);
  estado.fechadas.push({
    symbol: p.symbol,
    lado: p.lado,
    abertaEm: p.abertaEm,
    fechadaEm: quando,
    precoEntrada: p.precoEntrada,
    precoSaida: preco,
    forca: p.forca,
    motivo,
    retorno,
    funding: p.funding,
    resultado: devolvido - p.valor,
    dias: (quando - p.abertaEm) / 86_400_000,
  });
}

/**
 * Roda as emissões cronologicamente e devolve o estado da carteira.
 *
 * As emissões chegam em LOTES — o retrato grava todas as moedas com o mesmo
 * carimbo —, e a ordem dentro do lote importa: primeiro marcar a mercado e
 * fechar o que bateu no limite, depois abrir o que é novo. Invertido, uma call
 * nova competiria por caixa com uma posição que já devia ter saído.
 *
 * `caminho` é opcional e muda o resultado de verdade: com ele, stop, alvo e
 * liquidação passam a ser testados DENTRO do intervalo entre dois retratos, em
 * vez de só nas pontas. Sem ele o motor se comporta como antes — que é o que
 * mantém `npm run testar-carteira` medindo os limiares sem rede.
 *
 * `regras` é o regime de gestão; o padrão é o publicado. Passar outro é como o
 * script mede um regime contra o outro sobre as mesmas emissões.
 */
export function rodar(
  emissoes: Emissao[],
  comecouEm: number,
  caminho?: Map<string, Passo[]>,
  regras: Regras = REGRAS,
): Carteira {
  const r = regras;
  const estado: Estado = {
    caixa: CAPITAL_INICIAL,
    abertas: new Map(),
    fechadas: [],
    queimadas: new Map(),
    regras,
    pico: CAPITAL_INICIAL,
    quedaMaxima: 0,
    maiorExposicao: 0,
    maiorRiscoAberto: 0,
    curva: [],
  };

  const uteis = emissoes
    .filter((e) => e.t * 1000 >= comecouEm && e.preco > 0 && Number.isFinite(e.preco))
    .sort((a, b) => a.t - b.t);

  const lotes = new Map<number, Emissao[]>();
  for (const e of uteis) {
    const lote = lotes.get(e.t) ?? [];
    lote.push(e);
    lotes.set(e.t, lote);
  }

  let ultimo = comecouEm;
  // O último preço que passou no teste de sanidade, por moeda. É contra ele que
  // o preço novo é comparado — não contra o preço anterior cru, senão duas
  // linhas de lixo seguidas se validariam uma à outra.
  const ultimoBom = new Map<string, number>();

  for (const [t, lote] of [...lotes.entries()].sort((a, b) => a[0] - b[0])) {
    const quando = t * 1000;
    ultimo = quando;

    const preco = new Map<string, number>();
    const vies = new Map<string, string | null>();
    const fund = new Map<string, number>();
    for (const e of lote) {
      const antes = ultimoBom.get(e.s);
      const absurdo =
        antes !== undefined &&
        (e.preco / antes > SALTO_ABSURDO || antes / e.preco > SALTO_ABSURDO);
      // Preço absurdo não entra nem para marcar nem para abrir. A posição fica
      // no último preço bom e espera o retrato seguinte, que é o que aconteceria
      // se a leitura simplesmente tivesse falhado — e é o que ela de fato é.
      if (absurdo) continue;
      // O mesmo destino para o preço que não é do perpétuo daquela hora: não
      // abre, não marca, não fecha. Antes de `ultimoBom`, para ele não virar a
      // régua do próximo salto.
      if (caminho && foraDoPerpetuo(e.preco, caminho.get(e.s), quando)) {
        estado.foraDoPerpetuo = (estado.foraDoPerpetuo ?? 0) + 1;
        continue;
      }
      ultimoBom.set(e.s, e.preco);
      preco.set(e.s, e.preco);
      vies.set(e.s, e.vies);
      if (e.fund != null && Number.isFinite(e.fund)) fund.set(e.s, e.fund);
    }

    // 1. marcar a mercado e decidir saídas
    for (const p of [...estado.abertas.values()]) {
      const atual = preco.get(p.symbol);
      const dias = (quando - p.abertaEm) / 86_400_000;
      const taxa = fund.get(p.symbol) ?? p.ultimaTaxa ?? FUNDING_PRESUMIDO;

      // O CAMINHO ENTRE OS DOIS RETRATOS, ANTES DAS PONTAS.
      //
      // Uma ordem parada não pisca: se o preço tocou o stop às 3h da manhã e
      // voltou antes do retrato das 6h, a posição estava fechada às 3h. Testar
      // só as pontas dava à carteira uma paciência que ninguém tem, e sempre na
      // direção que a favorece.
      //
      // Precisa de preço do retrato para ancorar as velas na escala certa, e
      // por isso vem depois de `atual` estar em mãos. Sem caminho, ou sem
      // âncora confiável, o motor cai no teste de ponta de sempre.
      if (atual !== undefined && caminho && percorrer(estado, p, caminho.get(p.symbol) ?? [], quando, atual, taxa)) {
        continue;
      }

      // FINANCIAMENTO ANTES DO TESTE DE PREÇO, porque ele corre com o relógio e
      // não com a cotação: são três cobranças por dia sobre o NOCIONAL, então a
      // 3x cada uma custa três vezes mais da margem. Numa vendida de duas
      // semanas isso passa de 2% — mais do que entrada e saída somadas.
      //
      // E antes do `continue` da moeda ausente, que é o conserto: uma posição
      // que fechasse por prazo enquanto a moeda estava fora do retrato saía sem
      // pagar o intervalo em que ficou de pé.
      cobrarFunding(p, quando, taxa);

      // MOEDA QUE SAIU DO RETRATO NÃO PODE PRENDER CAPITAL PARA SEMPRE.
      //
      // O `continue` daqui pulava o loop inteiro, e com ele o teste de prazo —
      // então uma moeda deslistada, ou que simplesmente parasse de responder,
      // deixava a posição aberta indefinidamente, marcada no último preço visto
      // e ocupando o teto de exposição de todas as calls seguintes.
      //
      // O prazo continua valendo mesmo sem preço novo: ele conta tempo, não
      // cotação. A saída é pelo último preço conhecido, que é a única coisa
      // honesta a fazer quando não há preço de hoje.
      if (atual === undefined) {
        if (dias >= r.prazoDias) fechar(estado, p, p.precoAtual, quando, "prazo");
        continue;
      }

      p.precoAtual = atual;
      p.retorno = sobreMargem(p, atual);

      // LIQUIDAÇÃO ANTES DE TUDO: a corretora não espera a regra de saída. A 3x
      // ela só acontece depois do stop, e é isso que o teto de alavancagem
      // garante — mas um salto de preço entre retratos pode pular o stop e cair
      // direto aqui, e nesse caso a margem inteira se perde.
      //
      // O gatilho é a MARGEM e não o preço, porque a corretora também deduz o
      // financiamento dela. Uma posição carregada muito tempo liquida antes do
      // preço de liquidação nominal, e testar só o preço deixava o retorno
      // passar de −100% sem ninguém fechar nada. `precoLiquidacao` continua
      // gravado porque é o número que se olha na tela — só não é o gatilho.
      const liquidou = p.retorno <= -1 + MARGEM_MANUTENCAO;
      if (liquidou) {
        fechar(estado, p, atual, quando, "liquidada");
        continue;
      }
      // STOP E ALVO SÃO DE PREÇO, e comparar contra `p.retorno` os quebrava.
      //
      // `p.retorno` passou a ser sobre a MARGEM quando a alavancagem entrou —
      // ou seja, já multiplicado por três. Comparado contra um corte de 25%
      // pensado em preço, o stop disparava com o preço andando 8,3% contra, que
      // é ruído de um dia normal nestas moedas: `npm run estudar` mede
      // volatilidade diária de 7% a 10%. Quase toda posição morreria no primeiro
      // dia, e o alvo cairia de 40% para 13,3%.
      //
      // Pior, isso desmontava em silêncio a justificativa do teto de 3x: ele
      // existe porque o stop de 25% de preço consome 75% da margem, e o stop
      // errado consumia 25%.
      const varPreco = aFavor(p, atual);
      if (p.nivelStop === undefined) p.nivelStop = nivelDoStop(p, r);

      // A ordem dos testes é a ordem do pior caso: dentro de um intervalo entre
      // retratos o preço passou por lugares que não vemos, e supor que ele
      // tocou o stop antes do alvo é a suposição conservadora.
      if (passouDoStop(p, atual)) fechar(estado, p, atual, quando, motivoDoStop(p, r));
      else if (r.alvo !== null && varPreco >= r.alvo) fechar(estado, p, atual, quando, "alvo");
      else if (dias >= r.prazoDias) fechar(estado, p, atual, quando, "prazo");
      // SEM REAÇÃO: passados N dias, a posição precisa estar pagando para ficar.
      // Não é stop — ela pode estar a 1% da entrada. É o tempo dizendo que a
      // tese não se confirmou no horizonte em que ela costuma se confirmar.
      else if (r.semReacaoDias !== null && dias >= r.semReacaoDias && varPreco <= 0)
        fechar(estado, p, atual, quando, "sem reação");
      else if (vies.get(p.symbol) !== p.lado) {
        // O painel mudou de ideia. Esta é a saída principal: a carteira segue as
        // calls, então ela sai quando a call sai. Sem isso a carteira mediria as
        // MINHAS regras de saída, e não o painel.
        //
        // Mas AUSÊNCIA de leitura não é leitura contrária, e o código tratava as
        // duas formas de ausência de jeitos opostos: moeda que sumia do lote não
        // fechava, e moeda presente com viés NULO fechava como "painel mudou".
        // As duas dizem a mesma coisa — não houve leitura —, e viés nulo não é
        // raro: 26 das 1.845 emissões de setembro.
        const lido = vies.get(p.symbol);
        if (lido != null) fechar(estado, p, atual, quando, "painel mudou");
      }

      // Sobreviveu: o retrato também move o rastro, pelo mesmo motivo que a vela
      // move — e depois dos testes, pelo mesmo motivo também.
      if (estado.abertas.has(p.symbol)) {
        p.melhor = p.lado === "long" ? Math.max(p.melhor ?? p.precoEntrada, atual) : Math.min(p.melhor ?? p.precoEntrada, atual);
        p.nivelStop = nivelDoStop(p, r);
      }
    }

    // 2. abrir o que é novo
    const expostoAgora = () =>
      [...estado.abertas.values()].reduce((s, p) => s + p.valor * (1 + p.retorno), 0);
    const patrimonio = () => estado.caixa + expostoAgora();

    // A call queimada volta a valer quando o viés sai daquele lado — aí a leitura
    // é outra, e não a mesma repetida.
    //
    // MAS AUSÊNCIA DE LEITURA NÃO É LEITURA DO OUTRO LADO, e a versão anterior
    // descongelava a call com viés NULO: `null !== "long"` é verdadeiro. Um único
    // retrato em que `lerVies` não respondeu bastava para o moedor voltar. Medido
    // com a mesma moeda em queda de −28% por retrato e um retrato sem leitura
    // intercalado: DOZE stops seguidos e −18,6% do patrimônio, contra o único
    // stop que a trava promete. É a mesma distinção que a saída por "painel
    // mudou" faz vinte linhas acima — ela só não estava sendo feita aqui.
    for (const [sym, lado] of estado.queimadas) {
      const lido = vies.get(sym);
      if (lido != null && lido !== lado) estado.queimadas.delete(sym);
    }

    // A FORÇA DECIDE QUEM ENTRA PRIMEIRO, e antes ela não decidia nada.
    //
    // O orçamento de risco é escasso por desenho, e quando ele acaba as calls
    // seguintes são recusadas. A versão anterior percorria o lote na ordem em
    // que ele veio do histórico — que é a ordem do `panorama.json`, ordenada
    // por NOTA DE ATENÇÃO. E a nota é exatamente o número que este projeto
    // avisa, em `scripts/panorama.mts`, que não serve para dimensionar: "ele
    // ordena a tela por 'merece olhada agora' e sobe com squeeze em andamento,
    // que é onde o painel diz para NÃO entrar".
    //
    // Ou seja: o aviso estava escrito e a alocação o contornava por baixo.
    // Reproduzido com 40 calls de força 1 chegando antes de 10 de força 3, o
    // teto de 25% estourando no meio: na ordem do lote entram 3 das 10 fortes e
    // as 40 fracas; invertendo a ordem entram as 10 fortes e 19 fracas. Mesmas
    // calls, mesmo orçamento, livros opostos — e a diferença era a ordem de um
    // arquivo.
    //
    // Hoje isto está dormente, porque o teto não chega a prender: o pico medido
    // de risco agregado é 13% de 25%. Ele acorda no dia em que o painel emitir
    // muita call junta, ou no dia em que alguém aumentar o tamanho da aposta —
    // que é justamente a pergunta que a tabela de escala existe para responder.
    const porForca = [...lote].sort((a, b) => (b.forca ?? 0) - (a.forca ?? 0));

    for (const e of porForca) {
      if (e.vies !== "long" && e.vies !== "short") continue;
      if (estado.abertas.has(e.s)) continue;
      if (estado.queimadas.get(e.s) === e.vies) continue;

      // O FREIO DE PREÇO DE LIXO TAMBÉM VALE PARA ABRIR, e não valia — este era
      // o buraco por onde a catástrofe do topo do arquivo continuava passando
      // inteira.
      //
      // A fase de marcação, logo acima, lê o mapa `preco`, que já passou pelo
      // teste do `SALTO_ABSURDO`. Esta fase lia `e.preco` CRU. Uma moeda que
      // ainda não estivesse aberta e recebesse a linha de lixo abria a posição no
      // preço de lixo; o retrato seguinte trazia o preço de verdade, que passa no
      // teste porque `ultimoBom` nunca foi contaminado, e a posição fechava no
      // alvo com o ganho de quinze ordens de grandeza. Reproduzido com a mesma
      // sequência do JCT — 1, depois 2,9e-27, depois 1,02 — a carteira fechava em
      // US$ 1,4e+28. O teste antigo não pegava porque abria a posição ANTES do
      // lixo chegar, e aí `estado.abertas.has` barrava a reabertura.
      const entrada = preco.get(e.s);
      if (entrada === undefined) continue;

      const forca = e.forca ?? 0;
      const base = r.riscoPorForca[forca];
      // Sem força gravada não há como dimensionar, e chutar um tamanho seria
      // inventar a parte mais importante da conta. As linhas antigas do
      // histórico não têm o campo; elas simplesmente não viram posição.
      if (!base) continue;

      const total = patrimonio();
      // `escala` multiplica o orçamento de risco e nada mais: stop, alvo, prazo
      // e alavancagem ficam onde estão. É só o TAMANHO que muda, que é a
      // pergunta que ela existe para responder. O fator do lado e o freio de
      // queda são do mesmo tipo — mexem no tamanho, nunca na regra de saída.
      const risco =
        base * r.escala * (e.vies === "short" ? r.fatorVendido : 1) * freioDeQueda(r, total, estado.pico);
      if (!(risco > 0)) continue;

      const stop = stopDe(r, e.vies);
      // A MARGEM QUE ARRISCA `risco` DO PATRIMÔNIO, e a alavancagem entra aqui.
      //
      // O stop de 25% é de PREÇO. A 3x ele consome 75% da margem, então para
      // arriscar 1,5% do patrimônio a margem tem de ser 2% — não 6%. Dividir só
      // pelo stop, como antes, triplicaria o risco de cada call sem que nada na
      // tela dissesse isso: é assim que backtest alavancado quebra sem avisar.
      //
      // É também por esta linha que um stop mais curto compra posição MAIOR: o
      // que se fixa é quanto a conta perde se o stop bater, e o tamanho sai
      // dessa conta. Metade da distância, o dobro de margem, a mesma perda.
      const alvo = (total * risco) / (stop * ALAVANCAGEM);
      const cabe = Math.max(0, total * EXPOSICAO_MAXIMA - expostoAgora());

      // O risco já comprometido, em fração do patrimônio: cada posição aberta
      // vale o que ela perderia se batesse no stop onde ele está agora.
      if (riscoAberto(estado) + risco > RISCO_TOTAL_MAXIMO + 1e-12) continue;

      const valor = Math.min(alvo, cabe, estado.caixa);
      // Posição pequena demais é ruído de arredondamento contra custo fixo.
      if (valor < 1) continue;

      estado.caixa -= valor;
      const nova: Aberta = {
        symbol: e.s,
        lado: e.vies,
        abertaEm: quando,
        precoEntrada: entrada,
        // A margem inteira entra na posição; os custos aparecem no RETORNO, que
        // é onde a alavancagem os multiplica. Descontá-los aqui os cobraria uma
        // vez só, e o nocional é três vezes a margem.
        valor,
        forca,
        precoAtual: entrada,
        retorno: -2 * CUSTO * ALAVANCAGEM,
        funding: 0,
        ultimoFunding: quando,
        ultimaTaxa: fund.get(e.s) ?? null,
        precoLiquidacao: precoDeLiquidacao(e.vies, entrada),
        // O risco EFETIVO: quando a margem sai menor que o alvo — teto de
        // exposição ou caixa —, a posição arrisca menos do que a régua pedia, e
        // é isso que ela ocupa do orçamento.
        risco: (valor * stop * ALAVANCAGEM) / total,
        melhor: entrada,
        stop,
      };
      nova.nivelStop = nivelDoStop(nova, r);
      estado.abertas.set(e.s, nova);
    }

    // 3. registrar o estado da conta, DEPOIS das saídas e DEPOIS das aberturas.
    marcar(estado, quando);
  }

  return montar(estado, comecouEm, ultimo);
}

function montar(estado: Estado, comecouEm: number, atualizadoEm: number): Carteira {
  const abertas = [...estado.abertas.values()].sort((a, b) => b.retorno - a.retorno);
  const exposto = abertas.reduce((s, p) => s + p.valor * (1 + p.retorno), 0);
  const patrimonio = estado.caixa + exposto;

  const porMotivo: Carteira["porMotivo"] = {};
  for (const f of estado.fechadas) {
    const g = (porMotivo[f.motivo] ??= { n: 0, retornoMedio: 0 });
    g.retornoMedio = (g.retornoMedio * g.n + f.retorno) / (g.n + 1);
    g.n++;
  }

  const porLado: Carteira["porLado"] = {};
  for (const f of estado.fechadas) {
    const g = (porLado[f.lado] ??= { n: 0, retornoMedio: 0, acertos: 0 });
    g.retornoMedio = (g.retornoMedio * g.n + f.retorno) / (g.n + 1);
    g.n++;
    if (f.retorno > 0) g.acertos++;
  }

  return {
    comecouEm,
    atualizadoEm,
    caixa: estado.caixa,
    patrimonio,
    retorno: patrimonio / CAPITAL_INICIAL - 1,
    abertas,
    fechadas: estado.fechadas.sort((a, b) => b.fechadaEm - a.fechadaEm),
    acertos: estado.fechadas.filter((f) => f.retorno > 0).length,
    encerradas: estado.fechadas.length,
    porMotivo,
    porLado,
    pico: estado.pico,
    quedaMaxima: estado.quedaMaxima,
    maiorExposicao: estado.maiorExposicao,
    maiorRiscoAberto: estado.maiorRiscoAberto,
    curva: estado.curva,
    ...(estado.foraDoPerpetuo ? { foraDoPerpetuo: estado.foraDoPerpetuo } : {}),
    regras: estado.regras,
    freio: freioDeQueda(estado.regras, patrimonio, estado.pico),
    riscoAberto: riscoAberto(estado),
  };
}

/**
 * A carteira gravada, com as MESMAS duas camadas do panorama.
 *
 * Ela lia só o disco, e em produção o disco é o do BUILD. O painel ao lado se
 * atualiza pelo GitHub raw a cada retrato, e a carteira embaixo dele ficava
 * parada no último deploy — podia ter dias, sem nada na tela dizendo isso.
 *
 * A ORDEM DAS CAMADAS mora em `lib/guardado.ts`, porque ela depende do
 * ambiente: em produção o raw vem primeiro, em desenvolvimento o disco. Estava
 * fixa aqui e nas outras três leituras, e o efeito era rodar `npm run carteira`,
 * abrir a página e ver a carteira do `main` em vez da que acabou de ser gerada.
 */
export async function getCarteira(): Promise<Carteira | null> {
  const { lerGuardado } = await import("./guardado");
  const g = await lerGuardado<Carteira>(
    "carteira.json",
    (d) => (Array.isArray((d as Carteira)?.abertas) ? (d as Carteira) : null),
    120,
  );
  return g?.dado ?? null;
}

/**
 * As posições abertas remarcadas com os preços — e as taxas — de agora.
 *
 * A carteira só é recalculada quando o retrato roda, e o GitHub entrega de dois
 * a cinco retratos por dia. Entre um e outro, a tabela do painel se atualiza
 * pela camada viva e a carteira embaixo dela não — preço novo em cima, posição
 * marcada há horas embaixo. É o mesmo defeito que a leitura tinha.
 *
 * Isto NÃO abre nem fecha posição, e a distinção é deliberada: decidir exige o
 * histórico inteiro e as regras de saída, que é o que `npm run carteira` faz.
 * Aqui só se corrige a MARCAÇÃO, que é aritmética sobre um preço que a página já
 * tem em mãos. Uma posição que já passou do stop aparece passada do stop até o
 * retrato seguinte fechá-la — o que é honesto, porque foi só então que ela
 * fechou de verdade.
 *
 * RODA NOS DOIS LADOS: no servidor, com os preços do retrato refrescado; e no
 * navegador, a cada poucos segundos, com os preços ao vivo da Binance. É por
 * isso que `agora` é parâmetro e não `Date.now()` — dois lados marcando o mesmo
 * instante têm de chegar ao mesmo número.
 */
export function remarcar(
  c: Carteira,
  precos: Map<string, number>,
  agora: number = Date.now(),
  taxas?: Map<string, number>,
): Carteira {
  if (c.abertas.length === 0) return c;

  let mudou = false;
  const abertas = c.abertas.map((p) => {
    const preco = precos.get(p.symbol);
    if (!preco || !Number.isFinite(preco) || preco <= 0) return p;
    // O mesmo freio de lixo do motor: salto de dez vezes entre marcações é erro
    // de dado, não mercado.
    if (preco / p.precoAtual > SALTO_ABSURDO || p.precoAtual / preco > SALTO_ABSURDO) return p;
    mudou = true;

    // O FINANCIAMENTO DAS HORAS DESDE O RETRATO, que a marcação anterior não
    // cobrava. Não é detalhe e nem tem sinal aleatório: são três cobranças por
    // dia sobre o nocional, e com retratos separados por cinco a dez horas a
    // marcação viva mostrava sistematicamente MAIS do que a posição valia. A
    // carteira gravada em 04/09 tinha posição pagando 0,052% por 8h — a 3x, 0,16%
    // da margem por dia parada.
    const viva = { ...p };
    cobrarFunding(viva, agora, taxas?.get(p.symbol) ?? p.ultimaTaxa ?? FUNDING_PRESUMIDO);
    viva.precoAtual = preco;
    viva.retorno = sobreMargem(viva, preco);

    // A MARGEM ISOLADA É O TETO DA PERDA, e sem esta trava a marcação viva
    // inventava dívida. Uma moeda caindo 40% desde o retrato dá retorno de −120%
    // a 3x, e `valor * (1 + retorno)` vira dinheiro NEGATIVO — o patrimônio da
    // tela ficava abaixo do caixa, que é impossível. Na corretora essa posição
    // já teria sido liquidada; aqui ela é marcada em zero e sinalizada, porque
    // quem fecha de verdade é o retrato seguinte, com a hora certa.
    //
    // Atribuído nos DOIS sentidos, e não só quando estoura: o navegador remarca
    // por cima de uma marcação que pode já ter estourado, e uma bandeira que só
    // liga ficaria acesa depois de o preço voltar.
    viva.estourada = viva.retorno <= -1 + MARGEM_MANUTENCAO;
    if (viva.estourada) viva.retorno = -1;

    // A mesma atribuição nos dois sentidos, pelo mesmo motivo da bandeira acima.
    // As regras vêm do ARQUIVO e não do código: são as que o retrato seguinte
    // vai aplicar, e numa carteira gravada antes delas não há o que sinalizar.
    const r = c.regras;
    viva.saida = undefined;
    if (!viva.estourada && r) {
      if (passouDoStop(viva, preco)) viva.saida = motivoDoStop(viva, r);
      else if (
        r.semReacaoDias !== null &&
        (agora - p.abertaEm) / 86_400_000 >= r.semReacaoDias &&
        aFavor(viva, preco) <= 0
      )
        viva.saida = "sem reação";
    }
    return viva;
  });

  if (!mudou) return c;
  const exposto = abertas.reduce((s, p) => s + p.valor * (1 + p.retorno), 0);
  return {
    ...c,
    abertas: abertas.sort((a, b) => b.retorno - a.retorno),
    patrimonio: c.caixa + exposto,
    retorno: (c.caixa + exposto) / CAPITAL_INICIAL - 1,
    atualizadoEm: agora,
  };
}
