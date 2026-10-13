# Pré-registro: a parcela maior na pirâmide do Momento (rodada 3 do loop, 13/10/2026)

Escrito e commitado ANTES de rodar qualquer uma das variantes abaixo. O commit
que traz este arquivo é a prova de ordem, como em `docs/preregistro-oi.md`.

## De onde vem

As rodadas 1 e 2 mediram que mais tamanho — fixo ou pelo alvo de volatilidade —
não passa de 13,4% ao mês dentro de 50% de queda: o turbo (Momento ×1,5) é o
teto, e o caixa recusa entrada antes de o resto crescer. Tamanho espalhado por
igual aposta tanto na moeda que ainda não provou nada quanto na que já andou
+40%. A pirâmide é o contrário: a parcela só entra na posição que já anda a
favor, e é dela que a perna comprada tira o lucro (a pirâmide em +40% levou o
"dentro" de +84% para +105% na bancada de 08/10). A pergunta é se mover o risco
da entrada para a parcela — parcela maior, entrada igual ou menor — cresce mais
que a campeã dentro do mesmo teto de queda.

## As variantes, e só elas

O Momento publicado no `main` de 11/10 (`f88a678`), mexendo SÓ em duas coisas:
o tamanho da parcela da pirâmide da perna comprada (`Perna.piramide.tamanho`,
hoje 1 — a parcela igual ao tamanho normal; o gatilho continua em +40%) e o
tamanho base (`RegrasRobo.tamanho`, hoje 4,25%). O alvo de volatilidade, a
vendida, a saída por posto e as regras da corretora continuam como estão.

    parcela P ∈ {1,5; 2; 3} × tamanho base ×L, L ∈ {1; 1,25; 1,5}

São nove. As três com P = 1 (×1, ×1,25 e ×1,5, a campeã) foram medidas na
rodada 1 e entram só como referência, não como candidatas.

## As janelas

- **Desenho**: 08/01/2024 a 31/03/2026, em duas metades — até 30/06/2025 e de
  01/07/2025 a 31/03/2026.
- **Reserva**: 01/04/2026 a 30/09/2026. Só a variante escolhida roda nela antes
  da decisão; as outras, depois, para o registro.

## O que se mede

O mesmo das rodadas 1 e 2: retorno ao mês, queda máxima na curva de HORA EM
HORA, Sharpe, entradas recusadas por caixa, e o desenho sem as 5 moedas que
mais deram ao Momento ×1 no desenho (a mesma lista da rodada 1). E, para ler o
mecanismo, quanto do resultado da perna comprada veio das posições que ganharam
a parcela — impresso, fora do critério.

## O critério, fixado agora

**Elegível**: queda máxima de até 50% no desenho E em cada metade, e "sem as 5"
positivo no desenho.

**Escolhida**: a elegível de maior retorno ao mês no desenho.

**Aprovada** se: no desenho, o retorno ao mês dela for MAIOR que o da campeã
(Momento ×1,5 com parcela 1: 13,4%); na reserva, a queda máxima for de até 50%
e o retorno ao mês for maior ou igual ao da campeã na reserva (19,6%); e ela
**aguentar o ataque** — no desenho, com o custo de entrada 4 vezes o medido
(`CUSTO_ATRASO` de 0,1% para 0,4%) e, separado, com a escorregada do stop
dobrada (`ESCORREGADA_STOP` de 0,06 para 0,12), a queda máxima continua de até
50% e o retorno ao mês continua maior que o da campeã sob o mesmo ataque.

**As tentativas**: as nove desta rodada somam-se às 14 da rodada 1 e às 3 da
rodada 2, e o Sharpe deflacionado da escolhida é impresso com 300 + 26 = 326
tentativas. Não entra no critério de aprovação; entra no 4º teste da meta.

**O que muda se for aprovada**: ela vira a configuração do turbo (o robô de "e se
arriscasse mais?"), com a medição escrita ao lado; o Momento publicado não muda,
porque o critério é o da meta (crescimento dentro de −50%), não o do Momento
(a comparação dele é sempre na mesma queda, −36%). Reprovada, fica escrita como
reprovada.

**E a meta**: o retorno ao mês da escolhida em TEMPO REAL — as 144 variações da
grade do Momento com a parcela P nas que têm pirâmide, todas no tamanho ×L, e o
walk-forward de 365 dias escolhendo entre elas a cada trimestre — é impresso e
vai para o documento de objetivos, se ela for aprovada. Não entra no critério
de aprovação; entra no da meta.
