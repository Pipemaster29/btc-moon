# Pré-registro: o algoritmo de previsão (10/11/2026)

Escrito ANTES de calcular qualquer correlação, acerto ou peso. O pedido do
usuário: "com esse tanto de informação, não existe um algoritmo, estilo gráfico,
que tente ver quais moedas vão subir, e para onde o BTC vai? Um algoritmo de
investimento".

Existe como fazer, e o risco é o de sempre: um modelo com oito entradas e dois
anos de dado acha padrão em qualquer coisa. O que separa algoritmo de enfeite é
o teste em dado que o modelo não viu, com o critério escrito antes. É este.

## Parte 1: quais moedas

**A pergunta.** Dá para ordenar as moedas, hoje, pela chance de bater o mercado
nos próximos 7 dias?

**O dado.** As velas de 1 h e o financiamento dos perpétuos USDT da Binance que a
medição dos robôs guarda em `.cache/robos/` (676 moedas, as deslistadas
inclusive, de 01/2024 a 10/2026), somadas em dias UTC.

**O universo de cada dia.** Decisão à meia-noite UTC do dia d, só com o que
existe até o fechamento de d−1: perpétuos com pelo menos 46 dias de vela e
volume médio de 7 dias de US$ 20 milhões ou mais — a régua dos robôs.

**As oito entradas, e só elas**, cada uma virando posto dentro do universo do
dia (de −0,5 a +0,5), para nenhuma moeda mandar pelo tamanho do número:

1. retorno de 1 dia;
2. retorno de 7 dias;
3. retorno de 14 dias;
4. retorno de 45 dias;
5. fluxo: a fração do volume de 7 dias que foi compra a mercado;
6. agitação: o desvio do retorno diário em 30 dias;
7. financiamento: a média de 7 dias;
8. surto de volume: o volume médio de 7 dias ÷ o de 30.

São as que o projeto já mediu uma a uma (momento, reversão, fluxo, garimpo,
financiamento). Nenhuma entrada nova entra depois de ver o resultado.

**O alvo.** O retorno do fechamento de d−1 ao fechamento de d+6, menos a mediana
do universo do dia, em posto.

**O modelo.** Regressão linear com penalidade (ridge, λ = 10% do traço médio),
ajustada UMA vez sobre o desenho. A nota de uma moeda é a soma dos pesos pelos
postos. Sem árvore, sem rede: oito pesos que cabem numa linha e se leem.

**As janelas.**

- desenho: 01/03/2024 a 30/06/2025 — os pesos saem daqui;
- validação: 01/07/2025 a 31/03/2026;
- reserva: 01/04/2026 a 24/10/2026 — a mesma dos robôs.

**O critério.** O algoritmo **tem vantagem** se, fora do desenho:

- (a) a correlação de postos média do dia entre a nota e o retorno relativo é
  positiva com t ≥ 2,5, contando um dia a cada 7;
- (b) é positiva na validação E na reserva, separadas;
- (c) o décimo de cima da nota rende mais que o de baixo nas duas;
- (d) as 10 moedas de nota mais alta de cada dia batem a mediana do universo em
  7 dias, na média, nas duas janelas — e continuam batendo sem as 5 moedas que
  mais contribuíram (o teste que mais reprova neste projeto).

Passando, a tela mostra o ranking com a chance medida de cada décimo bater o
mercado. Não passando, mostra o ranking com "sem vantagem medida" — e os pesos,
para quem quiser ver o que o modelo achou.

**O que não está na conta**: custo, financiamento e escorregada. É um ranking,
não uma carteira; a carteira com custo é a dos robôs.

## Parte 2: para onde vai o BTC

**A pergunta.** Dá para dizer, hoje, a chance de o BTC estar mais alto daqui a
30 dias, melhor do que a taxa histórica?

**O dado.** O fechamento diário do BTC na Bitstamp desde 2011 e o índice de medo
e ganância da alternative.me desde 02/2018 (o valor de um dia só vale no
seguinte).

**As cinco entradas, e só elas:** o preço ÷ a média de 200 dias; o retorno de 30
dias; o retorno de 90 dias; a queda desde a máxima histórica; o índice de medo
da véspera.

**O modelo.** Regressão logística, reajustada a cada virada de ano só com o
passado (janela que cresce), a partir de 02/2018. A primeira previsão é de
01/01/2020.

**O teste.** De 01/01/2020 a 24/10/2026, a previsão de cada dia contra o que
aconteceu 30 dias depois, comparada com a TAXA-BASE — a fração de janelas de 30
dias em alta até aquele dia, que é o que diria quem não sabe nada.

**O critério.** O modelo **bate a taxa-base** se:

- (a) o erro quadrático (Brier) dele é menor que o da taxa-base, com a diferença
  acima de zero no bootstrap em blocos de 30 dias (95%);
- (b) e é menor nas duas metades do teste.

Não batendo, a tela mostra a taxa-base e diz que o modelo não acrescenta. 7 dias
entra no registro, sem critério.

Rode com: `npm run medir-previsao`.

## Parte 3, escrita DEPOIS de ver a parte 1 (10/11/2026, ~11h15 UTC)

Não é pré-registro limpo, e fica dito: a parte 1 já rodou. Ela passou no
critério, e o diagnóstico mostrou o que ela achou — a correlação é toda da
entrada da agitação (0,203 só com ela, −0,011 sem ela), e as 10 moedas de nota
mais alta são TRX, BTC, PAXG, BNB e ETH, que renderam −0,02% por semana em
retorno absoluto enquanto a mediana do universo caía 2,53%. O modelo aprendeu
que moeda calma cai menos; não aprendeu a escolher moeda.

A pergunta do usuário é a outra: **entre moedas de agitação parecida, as outras
entradas escolhem a que vai melhor?** O teste, fixado antes de rodá-lo:

- as SETE entradas restantes (sem a agitação), nas mesmas janelas e no mesmo
  universo;
- o universo de cada dia partido em três terços pela agitação de 30 dias; as
  entradas e o alvo viram posto DENTRO do terço, e o alvo é o retorno de 7 dias
  menos a mediana do terço — assim "calma bate agitada" não entra na conta;
- a mesma regressão (ridge, 10% do traço médio), ajustada uma vez no desenho;
- o mesmo critério (a) a (d), com as 10 de nota mais alta do dia e o retorno
  delas contra a mediana do próprio terço.

É a segunda tentativa sobre o mesmo dado, e conta como tal.

## O desfecho (10/11/2026)

**Parte 1 — passa no critério.** Fora do desenho (480 dias, ~131 moedas por
dia): correlação 0,1915 (t 11,28); validação 0,1930 e reserva 0,1894; décimo de
cima − de baixo +1,25 e +1,63 p.p.; as 10 de cima +3,14 e +1,76 p.p. contra a
mediana, +2,57 e +1,36 sem as 5 que mais contribuíram. Por décimo, a fração
acima da mediana vai de 38,1% a 66,7%.

**E o diagnóstico, feito depois, diz o que isso é:** só a agitação, 0,2031; sem
ela, −0,0112. As 10 de cima renderam −0,02% por semana em retorno absoluto
(47,8% subiram), contra −2,53% da mediana. É "moeda calma cai menos", não
"moeda que vai subir".

**Parte 3 — reprova.** Dentro do terço de agitação, sem a agitação: 0,0581 no
desenho, 0,0091 fora dele (t 0,22); validação 0,0018 e reserva 0,0188; o décimo
de cima perde do de baixo na validação (−0,52 p.p.); as 10 de cima acima da
mediana do terço em 49,2% das vezes, −0,89% por semana em retorno absoluto.

**Parte 2 — reprova.** 2.474 dias de teste; o BTC subiu em 55,4% das janelas de
30 dias; erro do modelo 0,2899 contra 0,2521 da taxa-base; ganho −15,0%
(intervalo −30,6% a −0,4%); metades −25,3% e −4,5%. Em 7 dias, para o registro:
53,1% e −8,5%.
