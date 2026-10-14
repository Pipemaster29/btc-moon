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

## O resultado (13/10, depois do pré-registro)

`npm run medir-robos -- --piramide`. Retorno ao mês entre parênteses; a queda é a
de hora em hora. As três referências com a parcela de hoje reproduzem a rodada 1
casa por casa (+1.864,3%, +2.220,0% e +2.795,2%).

| desenho, 08/01/2024 a 31/03/2026 | desenho | 1ª metade | 2ª metade | queda | Sharpe | sem as 5 | |
| --- | --- | --- | --- | --- | --- | --- | --- |
| parcela 1 · ×1 (o Momento) | +1.864% (11,8%) | +216% (6,7%) | +444% (20,7%) | −35,8% | 2,40 | +432% | referência |
| parcela 1 · ×1,25 | +2.220% (12,5%) | +228% (6,9%) | +549% (23,1%) | −40,7% | 2,31 | +455% | referência |
| parcela 1 · ×1,5 (a campeã, o turbo) | +2.795% (13,4%) | +244% (7,2%) | +662% (25,3%) | −46,0% | 2,30 | +471% | referência |
| parcela 1,5 · ×1 | +2.111% (12,3%) | +219% (6,8%) | +493% (21,9%) | −38,4% | 2,35 | +466% | elegível |
| parcela 1,5 · ×1,25 | +2.434% (12,8%) | +223% (6,8%) | +617% (24,5%) | −43,5% | 2,26 | +394% | elegível |
| parcela 1,5 · ×1,5 | +3.042% (13,8%) | +235% (7,0%) | +750% (26,8%) | −48,7% | 2,24 | +432% | elegível |
| parcela 2 · ×1 | +2.375% (12,7%) | +225% (6,9%) | +537% (22,8%) | −40,2% | 2,32 | +469% | elegível |
| parcela 2 · ×1,25 | +2.695% (13,3%) | +227% (6,9%) | +678% (25,6%) | −45,8% | 2,22 | +394% | elegível |
| parcela 2 · ×1,5 | +3.312% (14,1%) | +226% (6,9%) | +831% (28,1%) | −51,6% | 2,19 | +433% | fora do teto |
| parcela 3 · ×1 | +2.622% (13,1%) | +218% (6,7%) | +626% (24,6%) | −43,6% | 2,20 | +511% | elegível |
| **parcela 3 · ×1,25** | **+3.111% (13,9%)** | +226% (6,9%) | +801% (27,7%) | **−49,5%** | 2,13 | +422% | **escolhida** |
| parcela 3 · ×1,5 | +4.164% (15,1%) | +251% (7,3%) | +981% (30,3%) | −55,0% | 2,14 | +325% | fora do teto |

**Escolhida: parcela 3x, tamanho ×1,25** — 13,9% ao mês, acima dos 13,4% da
campeã, com a queda a meio ponto do teto.

| reserva, 01/04 a 30/09/2026 | retorno | ao mês | queda | Sharpe |
| --- | --- | --- | --- | --- |
| campeã | +193% | 19,6% | −35,3% | 2,47 |
| **parcela 3 · ×1,25** | **+264%** | **24,0%** | **−41,9%** | 2,40 |

✓ queda até 50% · ✓ retorno ao mês maior que o da campeã → passa na reserva, e
vai ao ataque, no desenho, cada um contra a campeã no mesmo ataque:

| ataque, desenho | campeã | parcela 3 · ×1,25 | |
| --- | --- | --- | --- |
| custo de entrada 4x | +1.872% (11,8%), queda −47,9% | +2.418% (12,8%), **queda −53,8%** | não aguenta |
| escorregada do stop dobrada | +2.126% (12,3%), queda −46,6% | +2.372% (12,7%), **queda −52,2%** | não aguenta |

O retorno continua acima do da campeã nos dois ataques, mas a queda passa do
teto nos dois: **REPROVADA.** A meio ponto do teto no desenho, o custo um pouco
pior da vida real é o que basta para passar dele.

**O que a rodada mede além do veredito.** O mecanismo é verdadeiro: na campeã,
as 190 de 756 compras que ganharam a parcela fizeram US$ 55.598, e a perna
comprada inteira fez US$ 20.093 — as outras 566 perderam US$ 35.505. Mas
aumentar a parcela é aumentar o tamanho por outro caminho, e pelo mesmo preço:
dentro do teto, cada variante fica a menos de 0,3 ponto por mês da reta do
tamanho puro da rodada 1 na mesma queda — acima em três, abaixo em quatro (a
parcela 1,5x ×1,5, com −48,7%, faz 13,8% ao mês; o tamanho puro faria ~13,9% na
mesma queda) —, e o Sharpe cai a cada parcela maior (a ×1: 2,40, 2,35, 2,32 e
2,20). A primeira metade do desenho não sai de 6,7%–7,3% ao mês em nenhuma; o
que a parcela maior ganha mora na segunda metade e na reserva, em que ela ganha
em todo tamanho (a ×1: 16,8% com a parcela de hoje, 18,2%, 19,7% e 22,0% ao mês)
— as monstras de 2025–2026 de novo.

**As tentativas:** com 326 (300 da pesquisa e as 26 das três rodadas), o Sharpe
deflacionado da campeã é 90,1% e o da escolhida, 86,9% — o 4º teste da meta
pede 95%.

A reserva das outras, rodada só para o registro depois da decisão: parcela 1 ×1
+155% (16,8%) · ×1,25 +175% (18,3%); parcela 1,5 ×1 +173% (18,2%) · ×1,25 +200%
(20,1%) · ×1,5 +222% (21,5%); parcela 2 ×1 +194% (19,7%) · ×1,25 +223% (21,5%) ·
×1,5 +250% (23,2%); parcela 3 ×1 +231% (22,0%) · ×1,5 +296% (25,7%, queda −44,6%).

**O que fica:** nada muda nos robôs. O ataque fica na medição (`Extra.custoAtraso`
e `EstadoRobo.escorregada`, que só a medição muda), para as próximas regras.
