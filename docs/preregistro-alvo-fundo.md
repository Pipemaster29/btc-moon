# Pré-registro: o alvo de volatilidade no fundo inteiro (rodada 2 do loop, 12/10/2026)

Escrito e commitado ANTES de rodar qualquer uma das variantes abaixo. O commit
que traz este arquivo é a prova de ordem, como em `docs/preregistro-oi.md`.

## De onde vem

A rodada 1 (`docs/preregistro-tamanho.md`) mediu que, com o tamanho FIXO, o
crescimento máximo dentro de 50% de queda é o do turbo (Momento ×1,5): 13,4% ao
mês no desenho. O fundo com tamanho fixo parou em 11,4% (×2,5). Tamanho fixo
aposta igual na calmaria e na tempestade. O alvo de volatilidade aposta mais
quando o patrimônio está calmo e menos quando está agitado — no Momento ele
passou (`ALVO_MOMENTO`); no Fluxo e no Caça-monstra, sozinhos, não. A pergunta é
se ele, aplicado ao FUNDO INTEIRO — os dois livros escalados juntos pela agitação
do fundo —, cresce mais que a campeã dentro do mesmo teto.

## As variantes, e só elas

O fundo publicado (Momento e Fluxo em subcontas, paridade de risco do inverso do
desvio de 90 dias todo dia 1º, só com o caixa livre), com o tamanho base dos dois
livros multiplicado, a cada meia-noite, por

    L = alvo ÷ (desvio dos retornos diários do FUNDO nos 40 dias anteriores × √365),
    entre ¼ e 2; com menos de 20 dias de curva, L = 1,

o mesmo formato do `ALVO_MOMENTO`, que continua valendo dentro do Momento (os
dois multiplicam). Três alvos:

1. **alvo de 40% ao ano**;
2. **alvo de 60% ao ano**;
3. **alvo de 80% ao ano**.

E um controle, que NÃO é candidato: o mesmo fundo com L = 1 sempre, simulado do
mesmo jeito (as duas subcontas lado a lado, hora a hora), que precisa reproduzir
o "fundo ×1" da rodada 1 (+685% no desenho, queda −20,7%) — se não reproduzir, a
simulação está errada e a rodada para antes de julgar.

## As janelas

- **Desenho**: 08/01/2024 a 31/03/2026, em duas metades — até 30/06/2025 e de
  01/07/2025 a 31/03/2026.
- **Reserva**: 01/04/2026 a 30/09/2026. Só a variante escolhida roda nela antes
  da decisão; as outras, depois, para o registro.

## O que se mede

O mesmo da rodada 1: retorno ao mês, queda máxima na curva de HORA EM HORA (as
cotas de cada subconta marcadas hora a hora), Sharpe, entradas recusadas por
caixa, e o desenho sem as 5 moedas que mais deram a cada livro ×1 no desenho (as
mesmas listas da rodada 1).

## O critério, fixado agora

**Elegível**: queda máxima de até 50% no desenho E em cada metade, e "sem as 5"
positivo no desenho.

**Escolhida**: a elegível de maior retorno ao mês no desenho.

**Aprovada** se: no desenho, o retorno ao mês dela for MAIOR que o da campeã da
rodada 1 (Momento ×1,5: 13,4%); e, na reserva, a queda máxima for de até 50% e o
retorno ao mês for maior ou igual ao da campeã na reserva (19,6%).

**O que muda se for aprovada**: ela vira candidata a robô ao vivo próprio (o
fundo com alvo), e o loop decide como ligá-la na rodada seguinte; o retorno em
tempo real dela é medido antes de ligar. Reprovada, fica escrita como reprovada.
