# Pré-registro: os robôs no mercado com medo (05/11/2026)

Escrito ANTES de rodar qualquer uma das variantes abaixo. O pedido do usuário:
"os bots não estão sendo bons, principalmente em períodos de queda de mercado
ou mercado com medo".

## De onde vem

**Ao vivo, de 08/10 a 05/11/2026** (`data/robos.json` da branch `dados`), com o
BTC saindo de US$ 85 mil para US$ 76 mil e o índice de medo e ganância da
alternative.me caindo de 74 para 26–50: o Momento em −4,0% (queda −17,7%), o
turbo em −6,2%, o Caça-monstra em −10,2%, o Grandes em +0,3% e o Fluxo em
+7,1%. No Momento, as 48 compras encerradas somam −US$ 278 e as 23 vendas,
+US$ 119. O desenho das perdas é um só: a perna comprada RECOMPRA, dia após
dia, a mesma manipulada que acabou de estopar — a AGT foi comprada nove vezes
de 17/10 a 04/11, e oito delas saíram no stop ou no rastro com prejuízo; a
BTW, sete vezes; a Q, seis; a JCT, cinco. Ela continua entre as 5 que mais subiram em 45 dias porque
a alta velha ainda está na janela, e o motor só impede abrir a moeda que JÁ
está aberta. É o defeito que a carteira teve e corrigiu em 04/09 ("a call
queimada não se repete", `lib/carteira.ts`): onze stops seguidos na mesma
leitura errada.

**No histórico** (`npm run medir-robos -- --regime`, só no DESENHO, 08/01/2024 a
31/03/2026; a reserva e outubro de 2026 ficaram fechados). A rodada reproduz a
de 13/10 (Momento +1.863,9% no desenho, contra +1.864,3%). Retorno médio por
dia e Sharpe dos dias de cada regime, pelo regime da meia-noite que abriu o dia:

| | medo extremo (≤ 24) | medo (25–44) | neutro | ganância | ganância extrema |
| --- | --- | --- | --- | --- | --- |
| dias | 126 | 160 | 126 | 305 | 96 |
| cesta das alts | +0,02%/d | +0,01%/d | −0,31%/d | −0,02%/d | −0,55%/d |
| Momento | **−0,02%/d (Sharpe −0,15)** | +0,49%/d (2,96) | +1,15%/d (5,87) | +0,24%/d (1,38) | +0,50%/d (2,83) |
| compras do Momento, por entrada | **−5,0% do nocional** | +0,6% | +8,4% | −1,8% | −9,8% |
| vendas do Momento, por entrada | **−1,1% do nocional** | +1,3% | +4,1% | +5,2% | +1,1% |
| Fluxo | +0,08%/d (1,02) | **−0,19%/d (−2,15)** | +0,13%/d (1,56) | +0,34%/d (3,52) | +0,32%/d (3,45) |
| Grandes | **−0,17%/d (−1,24)** | +0,00%/d | +0,28%/d | −0,04%/d | +0,52%/d |

O medo extremo é o ÚNICO regime em que o Momento não ganha (−8,3% compostos em
126 dias), e as duas pernas perdem por entrada nele. Mas 111 dos 126 dias são da
2ª metade do desenho: na 1ª houve só 15.

Pelo BTC contra a média dos seus 50 fechamentos diários:

| | BTC abaixo da média | BTC acima |
| --- | --- | --- |
| dias | 362 | 409 |
| Momento | +0,24%/d (Sharpe 1,55) | +0,65%/d (3,35) |
| Fluxo, desenho | **−0,05%/d (−0,59), −19,6% composto** | +0,37%/d (3,77), +326% |
| Fluxo, 1ª metade · 2ª metade | −16,7% · −3,2% | +136% · +79% |
| vendas do Fluxo, por entrada | **−0,8% do nocional, 51,6% no lucro** | +7,3%, 73,4% no lucro |

O Fluxo faz todo o lucro com o BTC acima da média e perde abaixo dela, nas duas
metades. O Momento ganha nos dois — e a bancada de 08/10 já tinha reprovado
"comprar só com o BTC acima da média de 50 ou 100 dias" (+640% e +291% contra
+1.555%): as monstras aparecem no mercado em queda também. Não é medido de novo.

## As variantes, e só elas

Sobre os robôs publicados no `main` de 13/10 (`df2a17a`), mexendo só no que cada
linha diz. Duas regras novas no motor (`lib/robos.ts`), desligadas em todo robô
publicado:

- **`Perna.queimada`** — a call queimada da carteira, nos robôs: depois de uma
  saída por stop, rastro ou liquidação, a perna não volta à moeda até o sinal se
  renovar (um dia em que ela foi lida no ranking da perna fora das k primeiras)
  ou até passar a janela da perna. Pulada sem trocar pela seguinte, como a que
  já está aberta. Posto, prazo e "sumiu" não queimam.
- **`Perna.regime`** — o tamanho das entradas novas da perna × um multiplicador
  no dia em que o regime da véspera está do lado ruim: o índice de medo até um
  limite, ou o BTC abaixo da média de n dias (`RegimeDoMercado`, a mesma conta
  na medição e no ao vivo). A parcela da pirâmide sai com o multiplicador da
  entrada. Sem leitura, tamanho normal.

**Momento** (o turbo segue a decisão do Momento: é o mesmo livro a 1,5x):

1. queimada, nas duas pernas;
2. queimada só no prejuízo (a saída com resultado negativo), nas duas pernas;
3. queimada só na perna comprada;
4. medo extremo (índice da véspera ≤ 24): as duas pernas com metade do tamanho
   — vizinhas do platô, que não são candidatas: ≤ 20 e ≤ 30, metade;
5. medo extremo (≤ 24): a comprada não abre (×0); a vendida igual.

**Fluxo**:

6. só abre com o BTC acima da média de 50 dias (×0 abaixo) — vizinhas do platô:
   médias de 30 e de 100 dias.

São 6 candidatas e 4 vizinhas: 10 tentativas, que somam 377 com as 367 da
pesquisa até 13/10.

## As janelas

- **Desenho**: 08/01/2024 a 31/03/2026, em duas metades — até 30/06/2025 e de
  01/07/2025 a 31/03/2026. A regra de regime NASCEU do diagnóstico deste
  desenho: passar nele é necessário e não basta.
- **Reserva**: 01/04/2026 a 30/09/2026.
- **Outubro de 2026**: 01/10 a 31/10, o mês que nenhuma medição tinha visto —
  os dados de outubro do Data Vision chegaram em 11/2026. É o juiz limpo das
  regras de regime. Para a queimada ele é CONTAMINADO: ela nasceu do ao vivo de
  outubro, e o juiz limpo dela é a reserva.

Só a escolhida de cada livro roda na reserva e em outubro antes da decisão; as
outras, depois, para o registro.

## O critério, fixado agora

No **desenho**, cada candidata contra o publicado do mesmo livro:

- (a) Sharpe do desenho MAIOR;
- (b) nenhuma metade com Sharpe menor;
- (c) "sem as 5" não pior — o desenho sem as 5 moedas que mais deram ao
  publicado no desenho;
- (d) nas candidatas 4 e 6, as duas vizinhas do platô também com Sharpe do
  desenho maior que o publicado.

**Escolhida**: a de maior Sharpe do desenho entre as que passam em (a)–(d), uma
por livro.

**Aprovada** se, além disso:

- (e) na reserva, Sharpe maior ou igual ao do publicado;
- (f) em outubro de 2026, retorno maior ou igual ao do publicado — é o que o
  pedido quer: melhorar no mercado com medo;
- (g) **aguenta o ataque**, no desenho: com o custo de entrada 4x
  (`CUSTO_ATRASO` de 0,1% para 0,4%) e, separado, com a escorregada do stop
  dobrada (0,06 para 0,12), o Sharpe continua maior que o do publicado no
  mesmo ataque.

Fora do critério, impressos depois da decisão: as outras candidatas na reserva
e em outubro, e o Sharpe deflacionado da escolhida com 377 tentativas.

**O que muda se for aprovada**: a regra entra na perna do robô em `ROBOS` (o
Momento e o turbo, ou o Fluxo), no mesmo tamanho de hoje, com a medição escrita
ao lado; o ao vivo (`scripts/robos.mts`) lê o regime pela mesma
`regimeDoMercado`. Reprovada, fica escrita como reprovada, e a regra fica no
motor desligada, como o filtro de open interest.

Rode com: `npm run medir-robos -- --regime-regras`.

## O resultado (05/11, depois do pré-registro)

O pré-registro foi fixado às 21h14 UTC de 05/11 — o texto acima deste título, byte a
byte, tem o sha256 `2ebb22ff1b0166d094b9b1d17546f892398c70eba1c7e523ed1b4244dfee9dc7` —,
e a rodada começou às 21h15. `npm run medir-robos -- --regime-regras`, com o motor e
os dados que reproduzem a rodada de 13/10 (o Momento faz +1.863,9% no desenho);
as regras da corretora são as de 05/11.

| Momento, desenho (08/01/2024 a 31/03/2026) | desenho | 1ª metade | 2ª metade | sem as 5 | |
| --- | --- | --- | --- | --- | --- |
| publicado | +1.864% (Sharpe 2,40) | +216% (1,56) | +444% (3,65) | +432% | |
| queimada | +802% (1,96) | +159% (1,44) | +216% (2,65) | +277% | ✗ ✗ ✗ |
| queimada só no prejuízo | +854% (1,98) | +148% (1,39) | +249% (2,79) | +225% | ✗ ✗ ✗ |
| queimada só na compra | +830% (1,98) | +171% (1,50) | +211% (2,61) | +282% | ✗ ✗ ✗ |
| **medo extremo (≤ 24): metade** | **+2.134% (2,54)** | +218% (1,57) | +517% (4,13) | +577% | **escolhida** |
| — vizinha ≤ 20 · ≤ 30 | +2.307% (2,55) · +1.818% (2,43) | | | | platô ✓ |
| medo extremo (≤ 24): sem compra | +2.173% (2,56) | +210% (**1,54**) | +543% (4,25) | +625% | ✗ na 1ª metade |

| Momento | reserva (04–09/2026) | outubro de 2026 |
| --- | --- | --- |
| publicado | +154,4% (Sharpe 2,62, queda −30,0%) | −10,6% (queda −13,7%) |
| medo extremo (≤ 24): metade | **+109,3% (Sharpe 2,40)** ✗ | −10,6% ✓ (igual: nenhum dia de outubro teve o índice da véspera em 24 ou menos) |

**REPROVADA na reserva.** A regra nasceu do diagnóstico do desenho, e o desenho
a confirmou — a metade do tamanho no medo extremo melhora as duas metades e tem
platô dos dois lados. A reserva diz o contrário pelo motivo de sempre: de abril
a junho de 2026 o índice passou semanas em 10 a 23, e foi aí que vieram as
monstras do semestre. Encolher a aposta no medo extremo é encolhê-la nelas. A
"sem compra" no medo extremo, que já perdia na 1ª metade, faz +40,4% na reserva.

| Fluxo, desenho | desenho | 1ª metade | 2ª metade | sem as 5 | |
| --- | --- | --- | --- | --- | --- |
| publicado | +225% (Sharpe 1,77) | +88% (1,54) | +73% (2,16) | +196% | |
| **só abre com o BTC acima da média de 50 d** | **+294% (2,51)** | +122% (2,24) | +77% (2,97) | +281% | **escolhida** |
| — vizinha: média de 30 d · de 100 d | +230% (2,25) · +256% (2,34) | | | | platô ✓ |

| Fluxo | reserva (04–09/2026) | outubro de 2026 |
| --- | --- | --- |
| publicado | +11,4% (Sharpe 0,85) | −2,6% |
| BTC acima da média de 50 d | **−8,2% (Sharpe −0,53)** ✗ | −1,2% ✓ |

**REPROVADA na reserva.** Era a candidata mais forte da rodada no desenho — o
Sharpe de 1,77 para 2,51, as duas metades melhores, platô de 30 a 100 dias, a
queda de −22% para −18% —, e na reserva ela perde 8,2% onde o publicado ganha
11,4%. Um corte de regime achado no mesmo histórico em que é medido parece
sempre melhor do que é.

**A queimada é o resultado que mais ensina.** Ela foi desenhada para o defeito
que outubro mostrou ao vivo, e conserta outubro (−1,9% a −5,1% contra −10,6%) e
até a reserva (a "só no prejuízo" faz +162,6% com Sharpe 2,76, contra +154,4% e
2,62). E no desenho ela corta o Momento pela metade, em toda variante: a
recompra da moeda que acabou de estopar é o que pega a segunda perna das
monstras de 2024–2025. Recomprar a AGT pela nona vez e recomprar a MYX depois
de um tranco de 30% são a mesma decisão vista na hora.

**As tentativas:** com 377, o Sharpe deflacionado da escolhida do Momento é 0,932
(Sharpe 2,59 contra a régua de 1,80) e o do Fluxo, 0,575 (1,90 contra 1,80).

**O que a rodada mede além do veredito.**

- **O ao vivo bate com o motor** (`npm run medir-robos -- --conferir-ao-vivo`, de
  08/10 a 31/10/2026): Momento −10,6% ao vivo e −9,3% no motor; turbo −15,9% e
  −14,1%; Caça-monstra −9,5% e −7,9%; Fluxo +1,6% e −1,1%; Grandes −1,1% e
  −4,0%. A perda de outubro é da estratégia, não da execução.
- **O Momento não é pior no mercado em queda — é o contrário.** Nos 33 meses de
  01/2024 a 09/2026 (`data/robos-medicao.json`), o BTC caiu 8% ou mais em 7: o
  Momento foi positivo em TODOS (+2,3% a +82,2%), o fundo em 6, o Fluxo em 3. Nos
  10 meses com o índice de medo médio até 35, o Momento foi positivo em 8 e
  multiplicou o patrimônio por 7,8. Os piores meses dele foram de ALTA ou de
  ressaca: 02/2024 (−18,1%, o BTC +43,8%), 12/2025 (−20,1%), 09/2026 (−9,2%, o
  BTC +6,4%), 03/2024 (−8,0%, o BTC +16,6%). E outubro de 2026 nem foi mês de
  medo: o índice ficou entre 30 e 74, com média 59, e o BTC caiu 7,2% — quase
  tudo na última semana. É uma sequência ruim colada em setembro, −9,2% e
  −10,6%, cerca de −19% somados, com a queda máxima medida em −36%.
- **O que o regime explica, por robô.** O Caça-monstra (só compra) perde nas
  quedas como se espera de quem só compra: positivo em 3 dos 7 meses de queda. O
  Grandes perde no medo extremo e depois de uma queda de 10% do BTC (−24,5%
  compostos nesses dias) — e já está na arena como reprovado. O Fluxo faz todo o
  lucro do desenho com o BTC acima da média de 50 dias, e a reserva mostrou que
  isso não é regra.

**O que fica:** nada muda nos robôs. `Perna.queimada` e `Perna.regime` ficam no
motor, desligadas e com os casos em `npm run testar-robos`, para a próxima
pergunta não precisar reescrevê-las; o diagnóstico fica em `npm run medir-robos --
--regime`. A régua das tentativas da pesquisa passa a 377. E o único juiz limpo
que sobra para uma regra de regime ou de recompra é o tempo: de novembro de
2026 em diante.
