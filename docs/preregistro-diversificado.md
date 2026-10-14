# Pré-registro: o robô diversificado (14/10/2026)

Escrito e commitado ANTES de rodar qualquer variante. O commit que traz este
arquivo é a prova de ordem.

## De onde vem

A pergunta do usuário em 14/10: "é foda tentar acertar 5 moedas de 1.000 — e
se elas nunca surgirem? Não acho que essa estratégia daria certo de forma
realista". Ela já está medida: na reserva de 04–09/2026, o Momento publicado
SEM as 5 moedas que mais deram perde 67% (`docs/preregistro-oi-invertido.md`).
O lucro dele é a cauda: 26% das compras dão lucro, e os 10 melhores trades de
2.388 fazem mais que o lucro inteiro.

O que um fundo quantitativo faz contra isso é DIVERSIFICAR: muitas apostas
pequenas no mesmo sinal, para nenhuma moeda sozinha decidir o resultado. A
hipótese: com 10 ou 20 moedas por perna em vez de 5, e sem a pirâmide (que é
justamente a peça que concentra o dinheiro nas monstras), o robô perde parte
do lucro da cauda e passa a ganhar sem ela.

## As variantes, e só elas

Sobre o Momento publicado (`ROBOS`, id "momento") e o Fluxo publicado (id
"fluxo") do `main` de 14/10 (`df2a17a`), mexendo só em:

    Momento diversificado, k = 10 e k = 20 por perna:
      comprada SEM pirâmide, saída quando deixa as 2k primeiras;
      vendida igual à publicada, só com k;
      tamanho = 4,25% × 5 ÷ k (o mesmo risco total de hoje, repartido)
    Fluxo diversificado, k = 10 e k = 20:
      tamanho = 3% × 5 ÷ k

São quatro. O Momento e o Fluxo publicados entram como referência.

## O capital

US$ 10.000, e não os US$ 1.000 da arena: com k = 20 a posição do Momento cai
para ~US$ 10, abaixo do mínimo de ordem da Binance (US$ 5) quando a vendida
encolhe pela volatilidade, e a do Fluxo para ~US$ 7, abaixo dos US$ 20 que o
ETH exige — o robô não abriria nada. Diversificar exige capital, e isto também
é resultado: a mesma tabela é impressa com US$ 1.000, fora do critério.

## As janelas

- **Desenho**: 08/01/2024 a 31/03/2026, em duas metades (até 30/06/2025 e de
  01/07/2025 a 31/03/2026).
- **Reserva**: 01/04/2026 a 30/09/2026, só a escolhida antes da decisão.

## O critério, fixado agora

**Elegível**: no desenho, as duas metades positivas, queda máxima de até 40%,
e o desenho SEM as suas 5 melhores moedas guardando pelo menos metade do lucro
do desenho.

**Escolhida**: a elegível de maior Sharpe no desenho.

**Passa** se: na reserva, o retorno for positivo E o retorno sem as 5 moedas
que mais deram NA PRÓPRIA RESERVA também for positivo — a resposta direta a "e
se elas nunca surgirem?" —; e se, no desenho, o retorno continuar positivo com
o custo de entrada 4x e, separado, com a escorregada do stop dobrada.

**As tentativas**: quatro, e o N da pesquisa vai de 367 a 371.

**O que muda**: aprovada, vira um robô da arena, com a medição ao lado.
Reprovada, fica escrita como reprovada — e a resposta ao usuário passa a ser
que diversificar não salvou o momento.
