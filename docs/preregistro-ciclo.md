# Pré-registro: o padrão dos 1.064 / 364 dias do BTC (24/11/2026)

O pedido: pôr no algoritmo o padrão do post anônimo de 12/12/2023 (fundo → topo
em 1.064 dias, topo → fundo em 364), com uma versão que ajusta as datas pelo
preço, e uma carteira de US$ 10.000 comprando e vendendo nelas.

## O que já foi visto, e por isso não prova nada

Os 1.064 e 364 foram tirados dos ciclos de 2015–2022, e a regra foi rodada
sobre 2013–2026 antes deste texto. Em `npm run medir-ciclo` de 24/11/2026:

| | US$ 10.000 em 30/11/2013 | queda máxima |
|---|---|---|
| se corrige pelo preço (publicada) | US$ 43,4 mi | −62,5% |
| calendário do post | US$ 4,8 mi | −62,5% |
| comprar e segurar | US$ 537 mil | −84,9% |

A publicada é a 4ª de 64 variações (antecedência 0/30/60/90 dias × confirmação
de 10/20/30/50% para o fundo e para o topo); mediana US$ 13,7 mi, pior
US$ 3,3 mi, todas acima do segurar. Fora da amostra do post há uma decisão: a
venda de 17/11/2025 a US$ 92.102.

## A regra, congelada

`REGRAS_CICLO` em `lib/cicloBtc.ts`: a busca do fundo abre no topo confirmado
+ 364 dias, a do topo no fundo confirmado + 1.064; o candidato é o extremo
desde a abertura; confirma com 20% de volta no fechamento; o fechamento que
perde o fundo (ou supera o topo) confirmado desfaz a operação. Semente: o topo
de 30/11/2013. Custo de 0,1% por lado.

Mudar qualquer número disso depois de hoje é uma tentativa nova, e esta página
ganha uma emenda dizendo qual e por quê.

## O juiz

O ciclo que começa agora. Em 24/11/2026 a regra está em caixa, com o fundo
candidato em 21/11/2026 a US$ 55.081, e compra no fechamento acima de
US$ 66.098.

Entre uma compra e a venda seguinte a carteira é igual a "comprar e segurar" —
as duas estão 100% em BTC. O que a regra acrescenta é só o tempo FORA. Por isso
o juiz é a volta inteira: compra → venda → recompra.

- **Passa** se o preço da venda que vier depois da próxima compra for maior que
  o preço da recompra seguinte, com o custo dentro (ou seja, se ficar em caixa
  durante o urso valeu mais que segurar).
- **Reprova** se a recompra vier mais cara que a venda, ou se a venda não vier
  até 31/12/2030 — aí o padrão não repetiu.
- A compra de agora é julgada à parte, e de um jeito só: se o fundo que ela
  confirmar for desfeito ("fundo falso"), está escrito aqui que a data errou de
  novo.

Um ciclo é um ponto. Mesmo passando, o que se ganha é "não foi desmentido".

## Emenda 1 (24/11/2026, à tarde): a venda pela EMA 200

O pedido: "tem que ser algo que daria para replicar na vida real [...] as EMAs
de 200, candle, variação %". A regra já só usava fechamentos até o dia; o que
mudou foi o gatilho da venda, depois de medir as médias (`npm run medir-ciclo`,
seção "as médias", 15 linhas, que somam tentativas às 64 da grade):

- a EMA 200 sozinha, sem calendário: US$ 0,91 mi, 114 operações, e de 2020 em
  diante 6,8x contra 8,4x do segurar. Reprovada;
- a EMA 200 também na compra: pior em toda combinação (três "fundos falsos" em
  out–nov/2026, porque a média anda devagar e o preço está em cima dela quando
  a busca abre);
- a venda no PRIMEIRO entre −20% da máxima e o fechamento abaixo da EMA 200:
  US$ 43,4 mi → US$ 47,8 mi, igual até 2019 e 33,4x → 36,8x de 2020 em diante.

Entrou a terceira (`compra: "subida"`, `venda: "primeiro"`, `emaDias: 200`).
O ganho inteiro é a venda de 2025 — 22/10/2025 a US$ 107.595, um topo falso
em 26/10 e a venda de novo em 30/10 a US$ 108.306, contra US$ 92.102 em
17/11 —, e a regra foi escolhida depois de vê-la. **Com isso não sobra decisão
fora da amostra**: o juiz acima é o único. O estado de hoje não mudou (em
caixa, compra no fechamento acima de US$ 66.098).

## Emenda 2 (25/11/2026): a vendida 1x no urso

O pedido: "pegar uma queda bruta seguida, tipo de 85 mil para 55 mil [...] não
precisa acertar topo ou fundo, e sim preços bons e maximizar o lucro. Mas de
forma realista". Entre a venda (topo confirmado) e a compra (fundo confirmado),
a carteira fica vendida 1x no perpétuo, com o financiamento real do BTCUSDT
desde 09/2019 e, antes, o vendido pagando 0,01% a cada 8 h (`REGRAS_VENDIDA`,
`simularComVendida`). Medido em `npm run medir-ciclo`, seção "a vendida" (10
linhas, mais 64 da grade):

- vendido 1x no urso inteiro: US$ 47,8 mi → US$ 183,7 mi; pernas +68% (2018,
  hipotética: não havia perpétuo na Binance), +65% (2022), −7% (o topo falso de
  10/2025) e a de agora aberta; o pior repique contra a entrada, +10%;
- só na reta final (do dia 200, 250, 300 ou 340 do urso): US$ 66 a 112 mi —
  a última perna começou no dia 261 em 2018 e no 350 em 2026;
- só abaixo da EMA 200: US$ 93 mi, 6 de 18 pernas com lucro;
- 2x e 3x: US$ 443 e 843 mi na regra publicada, mas na grade o pior repique
  contra foi de +38%: liquida a 3x e leva 76% da margem a 2x. Fica 1x;
- com a venda antiga (só −20%): US$ 167 mi — a vendida não depende da EMA;
- na grade: melhora 59 de 64 variações (mediana ×2,44), mas só 212 de 401
  pernas dão lucro.

O juiz da emenda é o mesmo, a volta inteira do próximo ciclo, e a vendida
aberta desde 30/10/2025 a US$ 108.306 é a primeira perna que conta: ela passa
se fechar com lucro quando a compra disparar.
