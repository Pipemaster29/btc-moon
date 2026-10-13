# Pré-registro: o robô das grandes (13/10/2026)

Escrito e commitado ANTES de rodar a reserva. O commit que traz este arquivo é
a prova de ordem, como em `docs/preregistro-oi.md`.

## De onde vem

O pedido do usuário em 13/10: "dá pra criar um bot usando só moeda grande, de
US$ 2 bi para cima? Pra vermos como seria a performance dele; as regras você
define e vai testando, mas deixa ele realista". Os robôs de hoje ganham nas
manipuladas — o lucro recente do Momento é de cinco moedas —, e a pergunta é o
que sobra numa praça onde ninguém empurra o preço.

## O universo, que é o de cada dia

As moedas com US$ 2 bilhões ou mais de market cap NAQUELA meia-noite, com
perpétuo USDT na Binance, US$ 20 milhões de volume e 14 dias de série. O market
cap vem do retrato semanal da CoinMarketCap (`scripts/baixar-grandes.mts`,
sem chave, 150 domingos de 12/2023 a 10/2026): as unidades que circulam no
último domingo fechado vezes o fechamento do perpétuo na véspera. Cada moeda é
casada com o perpétuo PELO PREÇO a cada domingo (`casarComPerpetuos`, a
armadilha nº 1): 4.957 de 6.667 moeda-semanas acima de US$ 2 bi casaram; o
resto não tem perpétuo na Binance (LEO, CRO, OKB, MNT, os embrulhados e os de
staking, PI) ou não o tinha naquela semana. Stablecoins e ouro tokenizado ficam
fora. Escolher pelas grandes de HOJE seria escolher as que deram certo.

Na média de cada trimestre são 31 a 42 moedas por dia em 2024, 30 a 38 em 2025
e 22 a 25 em 2026; o dia com menos teve 23 grandes casadas.

## As referências do desenho, sem custo e sem alavancagem

    BTC comprado e parado            +55,5% (Sharpe 0,65, queda −50,1%) · 1ª metade +144,4% · 2ª −36,2%
    cesta das grandes, pesos iguais  −43,3% (Sharpe 0,01, queda −77,6%) · 1ª metade   −4,5% · 2ª −40,6%

As altcoins grandes sangraram: quem comprou a cesta e esperou perdeu 43%.

## O que foi explorado no desenho, e soma tentativas

Desenho: 08/01/2024 a 31/03/2026, em duas metades (até 30/06/2025 e de
01/07/2025 a 31/03/2026). Todas com o mesmo motor, custo, financiamento,
escorregada e regras da corretora dos outros robôs, a 10% do patrimônio por
posição. `npm run medir-robos -- --grandes` refaz tudo. Retorno, Sharpe e
queda no desenho; retorno e Sharpe de cada metade; o desenho sem as 5 moedas
que mais deram:

    rodada 1                                desenho  Sharpe   queda  |  1ª metade      |  2ª metade      | sem as 5
    controle: o Momento publicado             +1,6%   0,24  −52,0%  |   −4,9% (0,15)  |  +20,1% (0,88)  |  −46,1%
    tendência L/S 14 d                        −1,3%   0,13  −41,0%  |   −9,5% (−0,07) |  +11,3% (0,67)  |  −34,5%
    tendência só comprada 14 d                −5,5%   0,08  −41,2%  |   −2,9% (0,10)  |   −2,8% (0,03)  |  −45,6%
    tendência L/S 14 d, rastro 20%           −28,1%  −0,44  −39,0%  |  −28,3% (−0,72) |   +2,5% (0,27)  |  −48,6%
    tendência só comprada 14 d, rastro 20%   −25,5%  −0,32  −43,6%  |  −19,4% (−0,36) |   −7,2% (−0,23) |  −55,0%
    momento L/S 14 d, sem limiar              −5,3%   0,06  −38,9%  |   −3,3% (0,07)  |   +0,9% (0,19)  |  −37,3%
    tendência L/S 30 d                        −3,1%   0,12  −34,0%  |  +12,7% (0,41)  |   −8,4% (−0,28) |  −35,3%
    tendência só comprada 30 d                +4,1%   0,21  −41,6%  |  +11,9% (0,40)  |   −6,4% (−0,14) |  −26,9%
    tendência L/S 30 d, rastro 20%            +2,9%   0,18  −24,9%  |  +13,5% (0,46)  |   −6,6% (−0,26) |  −35,8%
    tendência só comprada 30 d, rastro 20%   −14,4%  −0,14  −42,2%  |   −8,3% (−0,08) |   −6,7% (−0,28) |  −34,4%
    momento L/S 30 d, sem limiar              +6,7%   0,25  −28,8%  |  +15,1% (0,45)  |   −3,7% (−0,04) |  −26,3%
    tendência L/S 60 d                       +26,4%   0,48  −35,2%  |   +8,6% (0,33)  |  +20,3% (0,86)  |   −6,2%
    tendência só comprada 60 d                −5,9%   0,05  −29,8%  |   −2,6% (0,08)  |   −3,5% (−0,04) |  −35,5%
    tendência L/S 60 d, rastro 20%           +15,2%   0,37  −42,2%  |   +1,4% (0,16)  |  +15,8% (0,76)  |  −17,7%
    tendência só comprada 60 d, rastro 20%   −17,4%  −0,26  −30,0%  |  −13,9% (−0,31) |   −4,7% (−0,22) |  −37,5%
    momento L/S 60 d, sem limiar             +14,4%   0,35  −38,3%  |   −0,5% (0,15)  |  +21,7% (0,91)  |   −6,6%
    reversão L/S 3 d                         −66,8%  −2,04  −70,0%  |  −48,0% (−1,67) |  −36,8% (−3,00) |  −71,3%
    reversão L/S 7 d                         −62,0%  −1,75  −67,6%  |  −45,9% (−1,57) |  −31,3% (−2,31) |  −72,4%
    reversão L/S 14 d                        −66,1%  −2,00  −68,5%  |  −54,3% (−2,10) |  −27,5% (−1,92) |  −66,8%
    rodada 2 (escrita depois de ler a 1ª)
    tendência L/S 45 d                       +24,2%   0,46  −35,5%  |  +13,2% (0,41)  |  +19,0% (0,91)  |  −10,7%
    tendência L/S 90 d                        +1,4%   0,17  −31,3%  |  +11,8% (0,40)  |   −9,2% (−0,31) |   −5,8%
    tendência L/S 120 d                      −23,9%  −0,30  −43,3%  |  −24,7% (−0,56) |   +7,8% (0,49)  |  −44,8%
    tendência L/S 45 d, 5 por perna          +14,2%   0,36  −42,1%  |   −7,3% (0,11)  |  +44,1% (1,32)  |   −4,1%
    tendência L/S 60 d, 5 por perna           +8,9%   0,31  −51,9%  |   −6,7% (0,11)  |  +19,6% (0,78)  |  −17,1%
    tendência L/S 90 d, 5 por perna          +14,7%   0,36  −39,3%  |  +32,5% (0,69)  |   −1,1% (0,16)  |  −13,8%
    vendida da tendência 60 d, par com ETH    +1,0%   0,13  −41,3%  |  −20,5% (−0,58) |  +21,8% (1,23)  |   −2,6%
    vendida da tendência 90 d, par com ETH    −8,7%  −0,09  −33,8%  |   −9,0% (−0,20) |   −0,1% (0,09)  |  −15,4%
    rodada 4 (depois da bancada)
    tendência L/S 45 d, alvo de volatilidade +33,7%   0,52  −39,4%  |  +11,8% (0,39)  |  +20,3% (0,81)  |   −8,8%
    tendência L/S 60 d, alvo de volatilidade +22,9%   0,43  −49,1%  |   +6,8% (0,32)  |  +24,4% (0,84)  |   −5,1%

"Tendência" é comprar as 3 grandes que mais subiram em N dias SE subiram e
vender as 3 que mais caíram SE caíram (`Perna.minimo` = 0), saindo quando deixam
as 6 primeiras, com stop de 20%, prazo de 90 dias e o tamanho pela volatilidade
de cada moeda; "momento, sem limiar" é a mesma sem o "se"; "reversão" é o
contrário (`Perna.inverso`), por até 7 dias.

**A rodada 3 foi de bancada, fora do motor** (`--grandes --bancada`): a
tendência POR MOEDA dos fundos de tendência — cada grande comprada se o retorno
de N dias é positivo e vendida se é negativo, o peso pelo inverso do desvio,
refeita todo dia, 0,2% por lado sobre o giro. Doze configurações, nenhuma com o
que pegar:

    N        os dois lados   só comprada   só o BTC
    14 d        −9,7%          +1,2%       +34,5%
    30 d       −12,8%          +1,2%       −40,3%
    60 d       +11,9%          −4,7%       −24,7%
    90 d       −14,2%         −24,5%       +40,1%

O que as quatro rodadas dizem, antes de qualquer reserva: **nas grandes, de
2024 a 03/2026, nenhuma regra sistemática simples tem vantagem medida depois do
custo.** A comprada perde em quase tudo (as altcoins grandes sangraram), a
reversão é comida pelo custo, a tendência por moeda é ruído, e o que sobra é a
tendência de 45 a 60 dias com as duas pernas — +24% a +34% em 27 meses, Sharpe
de 0,43 a 0,52, negativa sem as 5 melhores moedas e com vizinhos ruins dos dois
lados (30 dias −3%, 90 dias +1%). Pico estreito, não platô. Abaixo do BTC parado
no desenho inteiro em Sharpe (0,65), e acima dele só na 2ª metade, que foi de
queda.

## A escolhida, pelo critério escrito antes da rodada 4

O critério, no código desde antes da rodada 4: **entre as variações com as duas
metades do desenho positivas, a de maior Sharpe no desenho.** Cinco das 29
passam no filtro; a escolhida é a **tendência L/S de 45 dias com o alvo de
volatilidade do Momento** (60% ao ano, 40 dias, sem ajuste aqui):

- comprada: as 3 grandes que mais subiram em 45 dias, se subiram; stop de 20%
  a 3x, sem rastro, prazo de 90 dias, sai quando deixa as 6 primeiras;
- vendida: as 3 que mais caíram em 45 dias, se caíram; stop de 20% a 2x, o
  resto igual;
- as duas com o tamanho pela volatilidade da moeda (¼ a 2x da mediana do dia);
- 10% do patrimônio por posição, com o alvo de volatilidade do patrimônio
  (¼ a 2x).

## As tentativas

19 na rodada 1, 8 na 2, 12 configurações de bancada na 3 e 2 na 4: **41**. O N
"da pesquisa" do Sharpe deflacionado (`TENTATIVAS_DA_PESQUISA`) passa de 326 a
367 — o que também mexe, um pouco, no deflacionado do Momento e do Fluxo na mesa.

Dito antes de rodar: Sharpe de 0,52 em 27 meses não sobrevive a deflacionado
nenhum com 367 tentativas — a régua do acaso, sozinha, passa disso. O que a
reserva pode dizer não é "tem vantagem"; é se a regra ao menos não perde onde
não foi escolhida.

## O que a reserva decide, fixado agora

**Reserva**: 01/04/2026 a 30/09/2026, só a escolhida antes da decisão.

**Passa** se, na reserva, o retorno for positivo; E se ela **aguentar o
ataque** — no desenho, com o custo de entrada 4 vezes o medido (`CUSTO_ATRASO`
de 0,1% para 0,4%) e, separado, com a escorregada do stop dobrada
(`ESCORREGADA_STOP` de 0,06 para 0,12), o retorno do desenho continua positivo.

Impresso ao lado, fora do critério: o BTC parado e a cesta na reserva, o Sharpe
deflacionado com 367 tentativas, e a regra em TEMPO REAL — as 29 variações do
motor rodadas na janela inteira e o walk-forward de 365 dias escolhendo entre
elas a cada trimestre, que é o que alguém que fizesse esta pesquisa ao vivo
teria tido.

**O que muda**: o robô "Grandes" entra no ao vivo NOS DOIS CASOS, com esta
regra — a pergunta do usuário é "como seria", e a resposta é o robô rodando ao
lado dos outros. A reserva decide o que a página diz dele: "não perdeu fora de
onde foi escolhido" ou "reprovado na reserva". Nenhum dos dois é vantagem
demonstrada, e a página diz isso também.
