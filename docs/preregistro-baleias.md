# Pré-registro: as baleias da Hyperliquid (09/11/2026)

Escrito ANTES de baixar o histórico de qualquer conta. O pedido do usuário: "um
algoritmo melhor, que pegue as carteiras grandes da Hyperliquid, baleias, o
on-chain dos criadores e dos VCs, e o suporte — um algoritmo extenso e próprio".
Esta é a primeira parte: as baleias da Hyperliquid.

## De onde vem

O projeto já mediu "smart money" — o posicionamento dos maiores traders da
Binance, que a corretora publica agregado — e não achou nada (+0,39 p.p. em 7
dias, p = 0,21, `npm run medir-sinais`). Mediu suporte clássico (+0,02 p.p.).
A Hyperliquid é outra coisa: a corretora é uma blockchain, e a posição de CADA
conta é pública — tamanho, preço de entrada, liquidação, lucro — pela API do
próprio site, sem chave (`api.hyperliquid.xyz/info`). Em 09/11/2026: 235
perpétuos, US$ 3,2 bilhões em aberto só no BTC, e um ranking público com 48.149
contas (2.527 com mais de US$ 1 milhão).

E dá para olhar para trás sem olhar o futuro. Cada execução de uma conta traz a
posição de ANTES dela (`startPosition`), e a API entrega as 10 mil execuções
mais recentes de cada conta, em ordem crescente. A posição numa data passada é
o `startPosition` da primeira execução depois dela, naquela moeda — ou a
posição de hoje, se não houve execução depois. Exata, para toda conta cujas 10
mil execuções mais recentes começam antes da data.

O VIÉS que manda no desenho: o ranking é de HOJE. Escolher as contas que são
ricas hoje é escolher as que acertaram — e seguir as que acertaram parece bom
olhando para trás. Medido no ranking de 09/11: ele guarda as contas que
quebraram (das 925 com mais de US$ 1 bilhão de volume na vida, 518 têm hoje menos
de US$ 10 mil). Escolher pelo VOLUME da vida, e não pelo patrimônio de hoje,
traz as que quebraram junto. Esse é o universo principal; o das ricas de hoje
roda ao lado, marcado como enviesado a favor.

## O universo

- **Contas, principal (A)**: todas as contas do ranking público de 09/11/2026
  (`stats-data.hyperliquid.xyz/Mainnet/leaderboard`) com volume da vida
  (`allTime.vlm`) de US$ 1 bilhão ou mais — 925 contas.
- **Contas, enviesado (B)**: as com patrimônio de hoje de US$ 5 milhões ou
  mais — 737 contas. Roda só para o registro: o viés empurra o resultado a favor
  de seguir as baleias.
- **Fora, por regra**: a conta de alta frequência — mais de 300 execuções por dia
  na primeira página do histórico (2.000 execuções em menos de 6,7 dias). É
  market maker ou robô de giro, a posição é estoque e não opinião, e o teto de
  10 mil execuções a deixaria sem histórico de qualquer jeito.
- **Posição de baleia**: nocional de US$ 50 mil ou mais naquela moeda naquela
  data (tamanho × fechamento da véspera). Menos que isso é resto de operação.
- **Moedas**: os perpétuos da Hyperliquid com vela diária na data e volume de
  US$ 1 milhão ou mais na véspera. O retorno de referência do dia é a MEDIANA de
  todas essas moedas, como em `npm run medir-sinais`: senão "seguir as baleias
  compradas" mediria o mercado subindo.
- **Janela das decisões**: toda meia-noite UTC de 11/05/2026 a 01/11/2026
  (175 dias), em duas metades — até 06/08/2026 e de 07/08/2026 em diante. Uma
  conta entra num dia só se o histórico dela cobre o dia (e, nos sinais que
  olham para trás, a janela inteira que eles olham).

## Os sinais, e só eles

Numa moeda e numa data, com as posições de baleia das contas que cobrem a data:

1. **Consenso das baleias** = (comprado − vendido) ÷ (comprado + vendido), em
   nocional. Existe com pelo menos US$ 500 mil somados e 3 contas.
2. **Consenso das espertas** = o mesmo, só com as contas cujo lucro realizado
   (a soma do `closedPnl` das execuções de perpétuo) nos 30 dias anteriores à
   data foi positivo — só o que se sabia na data.
3. **Fluxo das baleias** = a variação do líquido (comprado − vendido) em 3 dias,
   com as posições das duas datas a preço da véspera, ÷ (comprado + vendido) de
   hoje; das contas que cobrem as duas datas.
4. **Suporte das baleias** (evento): o preço médio das COMPRAS das contas nos 30
   dias anteriores (as execuções de lado B em perpétuo, ponderadas pelo
   nocional) é o "custo das baleias". O evento é o fechamento da véspera voltar a
   até 3% dele, para cima ou para baixo, depois de os 5 fechamentos anteriores
   terem ficado todos mais de 5% acima — o preço caindo até onde as baleias
   compraram.

## O que se mede

- O retorno da moeda de 1, 3 e 7 dias a partir da meia-noite da decisão, menos
  a mediana do mesmo retorno de todas as moedas do dia. **O de 7 dias é o
  principal**; 1 e 3 entram no registro.
- Sinais 1 a 3: a correlação de postos (Spearman) do dia entre o sinal e o
  retorno relativo, nos dias com o sinal em pelo menos 10 moedas; a média dela,
  e o t sobre os dias NÃO sobrepostos (um a cada 7 dias no de 7). E a diferença
  do retorno relativo médio entre o quinto de cima e o de baixo do sinal.
- Sinal 4: o retorno relativo médio depois dos eventos, contando um evento por
  episódio (a moeda só volta a ter evento depois de 7 dias), com o t sobre os
  eventos.

## O critério, fixado agora

Um sinal **tem vantagem**, a favor ou ao contrário, se no universo A e no
horizonte de 7 dias:

- (a) |t| ≥ 2,5 — com quatro sinais, é o Bonferroni de 5%;
- (b) o mesmo sinal da média nas duas metades da janela;
- (c) nos sinais 1 a 3, a diferença entre os quintos do mesmo lado nas duas
  metades; no sinal 4, pelo menos 30 eventos em 10 moedas.

Passar aqui é condição para virar regra, não regra: a reconstrução escolhe as
contas pelo ranking de hoje, e o que passar vai para um pré-registro de robô
próprio, com custo e stop, e para a coleta ao vivo, que é o juiz sem viés
nenhum. Nada passando, a leitura das baleias entra na página como informação,
com "sem vantagem medida" escrito ao lado — como o resto do painel.

Rode com: `npx tsx scripts/medir-baleias.mts`.

## Emenda (09/11/2026, ~15h30 UTC), antes de qualquer resultado

Escrita depois de um erro no download e ANTES de qualquer número de sinal: até
aqui só foram vistos diagnósticos de cobertura (contas por dia, moedas por dia
com sinal) e de consistência (a posição depois da última execução contra a de
agora). Nenhuma correlação, quinto ou evento foi calculado.

**O erro.** O pré-registro supôs que a API só guarda as 10 mil execuções mais
recentes de cada conta. Ela guarda mais, e o download lia de 01/04 para a frente
parando em 10 mil — deixando sem o trecho recente justamente as contas ativas.
E a regra para trás precisa de toda execução entre a data e hoje. Conferido em
22 contas: em 40% das moedas a posição depois da última execução lida não era a
de agora.

**E dois buracos da API que o erro revelou.** As execuções de ordens TWAP não
aparecem em `userFills`/`userFillsByTime`: vêm de `userTwapSliceFills`, à parte —
uma conta teve 2.000 fatias de TWAP em quatro horas, nenhuma no fluxo comum. E
execuções no mesmo milissegundo saem em qualquer ordem; o desempate é o id da
negociação (`tid`).

**O que muda, e só isto:**

1. o histórico é lido de HOJE PARA TRÁS, as 2.000 mais recentes e depois janelas
   lidas inteiras, até 01/04 ou até 10 mil eventos em cada fluxo; o começo do
   histórico (`desde`) é o ponto a partir do qual tudo até hoje foi lido;
2. os dois fluxos entram — execuções comuns e fatias de TWAP —, e o `desde` da
   conta é o mais recente dos dois;
3. a régua de alta frequência (mais de 300 por dia) é medida nas 2.000 execuções
   comuns MAIS RECENTES, e não nas primeiras desde 01/04 — a mesma do ao vivo. As
   fatias de TWAP não contam: são a execução de uma ordem direcional, não giro de
   market maker;
4. **a conta só entra se fechar**: em toda moeda com evento no histórico, a
   posição depois do último evento tem de ser a posição de agora. Conta que não
   fecha tem execução faltando, e fica fora — contada e impressa.

O universo, os sinais, os mínimos, as janelas e o critério continuam os de cima.

## Segunda emenda (09/11/2026, ~16h05 UTC): a reconstrução não coube, o juiz é para frente

Ainda sem nenhum número de sinal calculado.

**O método corrigido funciona.** Com o histórico lido de hoje para trás, os dois
fluxos (execuções comuns e fatias de TWAP), o encadeamento no mesmo milissegundo
e os eventos de antes do `desde` fora, as 8 contas direcionais com execução que
chegaram a baixar FECHAM com a posição de agora, moeda por moeda — contra 60%
das moedas na primeira versão.

**O que não coube foi o tempo.** O universo A é feito de contas de volume alto,
e conta de volume alto que não é de alta frequência pede ~12 páginas de 2.000
execuções, a ~120 de peso cada, contra o teto de 1.200 por minuto por IP da API.
Medido: ~1 conta por minuto mesmo com 12 leituras em paralelo, e 20 das primeiras
32 contas de A eram de alta frequência (fora por regra). As 1.544 contas que
faltavam pediriam ~14 horas de download contínuo, e o cache mora num contêiner
que não dura isso.

**A decisão, antes de qualquer resultado:** a reconstrução para trás fica no
repositório pronta para uma rodada dedicada (`npx tsx scripts/baixar-baleias.mts`,
que retoma de onde parou, e `npm run medir-baleias`), e o JUIZ deste
pré-registro passa a ser a coleta para frente: a primeira leitura completa de
cada dia UTC do ao vivo (`data/baleias-hl-AAAA-MM.jsonl`, desde 09/11/2026), que
lê as posições direto, sem reconstruir nada e sem o viés do ranking. O critério
é o mesmo — |t| ≥ 2,5 no horizonte de 7 dias, o mesmo lado nas duas metades —,
sobre as contas do ao vivo (US$ 5 milhões ou mais, sem market makers), com
estas diferenças forçadas pelo que a leitura ao vivo tem:

- as **espertas** são as contas com lucro no mês pelo ranking do dia, e não pelo
  `closedPnl` dos 30 dias;
- o **fluxo** é a variação do líquido entre a leitura diária de hoje e a de 3 dias
  antes;
- o **suporte** é o preço médio de ENTRADA das baleias compradas (o custo da
  posição aberta), e não o das compras dos 30 dias.

O teste só é lido com 90 dias de leituras diárias (até lá, "amostra
insuficiente"), e as duas metades são as duas metades desses dias.

## Terceira emenda (09/11/2026, ~16h15 UTC): o fluxo do juiz é o do pré-registro

Com zero dias de leitura gravados e nenhum número de sinal calculado.

**O defeito.** A segunda emenda escreveu o fluxo do ao vivo como "a variação do
líquido entre a leitura diária de hoje e a de 3 dias antes", e o juiz o tirava do
histórico POR MOEDA: o líquido em dólares de hoje menos o de 3 dias antes, cada
um somando o universo inteiro do seu dia. Isso larga os dois cuidados do texto
original ("com as posições das duas datas a preço da véspera ... das contas que
cobrem as duas datas"): uma moeda que sobe 10% sem ninguém negociar aumentava o
líquido comprado em 10% — o fluxo mediria o retorno passado, e o teste dele
mediria momento ou reversão, não baleia —, e a conta que cruzava os US$ 5
milhões do ranking, que é baixado de novo a cada dia, entrava como compra.

**O que muda, e só isto:**

1. o fluxo, no ao vivo (desde a leitura anterior) e no juiz (3 dias), é o do
   texto original, pela mesma função (`fluxoEntre`, `lib/hyperliquid.ts`): só as
   contas lidas nas duas datas, as duas posições ao preço de hoje, a régua de
   US$ 50 mil valendo para a posição de qualquer das duas pontas, ÷ o total das
   posições de baleia de hoje dessas contas, com os mínimos do consenso
   (US$ 500 mil e 3 contas) — como `scripts/medir-baleias.mts` já fazia;
2. para isso o ao vivo grava, além da linha por moeda, uma linha por dia com a
   posição de cada conta lida em unidades, as espertas e o preço de cada moeda
   (`data/baleias-hl-contas-AAAA-MM.jsonl`); dia sem as duas linhas conta a
   conta fica sem fluxo;
3. uma conta com alguma posição ilegível conta como NÃO LIDA, e não como conta
   que saiu da moeda;
4. o t sobre os dias que não se sobrepõem escolhe os dias pela DATA (cada um a
   h dias ou mais do último escolhido), e não pela posição na lista — um dia sem
   sinal não encurta mais o passo;
5. a condição (c) dos sinais 1 a 3, escrita por extenso como os dois scripts a
   aplicam: a diferença entre os quintos com o mesmo sinal nas duas metades E do
   mesmo lado da correlação média.

O universo, os outros sinais, os mínimos, os horizontes, os 90 dias e as metades
continuam os da segunda emenda.
