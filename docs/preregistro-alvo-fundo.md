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

## O resultado (12/10, depois do pré-registro)

`npm run medir-robos -- --alvo-fundo`. Retorno ao mês entre parênteses; a queda é
a de hora em hora, das cotas de cada subconta.

**O controle confere:** o fundo sem alvo, simulado com as subcontas lado a lado,
faz +684,4% no desenho com queda de −20,7% — o fundo ×1 da rodada 1, que vinha
da curva de cada livro montada depois (+684,5%, −20,7%). A campeã também saiu
igual à da rodada 1 (+2.795,2%), com o passo de uma hora extraído do `simular`.

| desenho, 08/01/2024 a 31/03/2026 | desenho | 1ª metade | 2ª metade | queda | sem as 5 | escala média | recusadas |
| --- | --- | --- | --- | --- | --- | --- | --- |
| campeã: Momento ×1,5 | +2.795% (13,4%) | — | — | −46,0% | — | — | — |
| fundo sem alvo (controle) | +684% (8,0%) | +152% (5,3%) | +200% (13,0%) | −20,7% | — | 1 | — |
| fundo, alvo 40% | +757% (8,4%) | +174% (5,8%) | +193% (12,7%) | −21,0% | +384% | 1,14 | 92 |
| fundo, alvo 60% | +1.006% (9,4%) | +215% (6,7%) | +195% (12,8%) | −24,8% | +376% | 1,47 | 382 |
| **fundo, alvo 80%** | **+1.016% (9,4%)** | +206% (6,5%) | +248% (14,9%) | −29,9% | +412% | 1,72 | 582 |

As três cabem no teto; a escolhida é a de 80% (9,4% ao mês), e ela **não supera
a campeã (13,4%): REPROVA sem chegar à reserva.** De 60% para 80% o alvo pede
17% mais tamanho e o retorno não sai do lugar, porque o caixa recusa 582
entradas: quando o fundo está calmo e o alvo manda crescer, a margem isolada de
cada posição já ocupa o caixa das duas subcontas. É o mesmo teto da rodada 1,
alcançado por outro caminho.

E não é melhor que o tamanho fixo na mesma queda: o fundo ×1,5 da rodada 1 fazia
9,7% ao mês com −26,5%; o alvo de 60%, 9,4% com −24,8%.

| reserva, 01/04 a 30/09/2026 (registro, depois da decisão) | retorno | ao mês | queda | Sharpe |
| --- | --- | --- | --- | --- |
| campeã: Momento ×1,5 | +193% | 19,6% | −35,3% | 2,47 |
| fundo, alvo 40% | +93% | 11,5% | −16,5% | 3,36 |
| fundo, alvo 60% | +87% | 11,0% | −18,4% | 2,98 |
| fundo, alvo 80% | +88% | 11,1% | −19,3% | 2,82 |
| fundo sem alvo | +60% | 8,1% | −15,7% | 2,64 |

**O que fica:** nada muda nos robôs nem no fundo da página. A simulação do
fundo com as subcontas lado a lado (`simularFundo`) fica na medição, porque
qualquer regra que olhe o fundo inteiro precisa dela.

