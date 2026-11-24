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
