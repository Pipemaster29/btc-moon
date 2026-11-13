# Pré-registro: a gestão da carteira, refeita com dois meses a mais (13/11/2026)

Escrito ANTES de rodar qualquer variante abaixo. O pedido do usuário: "a
estratégia da carteira fictícia deu uma melhorada boa (…) talvez se arriscasse
um pouco mais ia ter mais dinheiro (…) a meta é deixar eles absurdos e
realistas".

## De onde vem

**Ao vivo, de 02/09 a 13/11/2026** (`data/carteira.json` da branch `dados`): a
carteira em +4,1% (queda máxima −19,6%), 325 encerradas, 175 no positivo; sem a
melhor moeda (HEI), +0,4%; metades +4,9% e −3,7%. O dinheiro por motivo de
saída: "painel mudou" 167 posições a +17,2% da margem em média, "alvo" 9 a
+119,8%, "sem reação" 130 a −16,8%, stop 17 a −75%. Por força: a força 2 fez
+US$ 110 em 180 posições, a 1 fez −US$ 8 em 137, a 3 fez −US$ 50 em 8.

**"Arriscar mais" já está na tabela que o retrato grava**, sobre as mesmas
calls: escala 1,5x dá −1,5% (queda −23,0%) e 2x dá −12,5% (queda −27,1%),
contra +4,1% do publicado. O que se mede aqui é se a resposta muda com o risco
posto em outro lugar (na força que dá dinheiro), e não no orçamento inteiro.

**A AKE**, que motivou o pedido: a carteira a comprou sete vezes de 08/10 a
09/11 (−US$ 38 na soma, uma liquidação) e saiu da última por "sem reação" em
13/11 às 03:24 UTC, a US$ 0,002598 — horas antes de ela subir 162% em 24 h. É
um caso; a tabela diz que sem a saída por tempo a carteira estaria em −15,0%.

## O que conta como janela nova

Duas das ideias abaixo foram olhadas em 23/09 e 28/09 e reprovadas por serem
pico de uma moeda ou de um limiar. Para elas existe o que este projeto quase
nunca tem: **dado posterior à hipótese**. A janela POSTERIOR é de 29/09 a
13/11, com a carteira começando do zero em 29/09. Para as ideias novas (3, 4 e
5) não há janela posterior, e isso fica dito no resultado.

## As variantes, e só elas

Sobre `REGRAS` de hoje, mexendo só no que cada linha diz. Os vizinhos entram
para o platô, e não como candidatos a mais.

1. **Filtro de varejo lotado na entrada** (`varejoMaxEntrada`): 3 · **3,5** · 4 · 5.
2. **Stop**: 15% · **20%** · 30% (publicado: 25%).
3. **Deixar correr** — o alvo fixo de +40% trocado por rastro que liga em +40%
   (`alvo: null`, `rastro: { ativa: 0,4, distancia }`): distância 15% · **20%** ·
   30%; e, para comparar, alvo fixo de 60% e de 80%.
4. **Sem reação**: 2 · 4 · 5 dias (publicado: 3). Só conferência do platô com
   mais dado; não é candidata a mudar se o 3 continuar no meio.
5. **O risco na força que paga**: força 2 a 2,5% · **3%** · 4% (publicado 2%), com
   a força 1 e a 3 como estão; e a força 1 a 0,5%.
6. **Confirmar a entrada**: 30 min · **1 h** · 2 h (olhada em 28/09; tem janela
   posterior).

## O critério, o mesmo da tabela de regimes e mais duro

Uma variante entra em `REGRAS` só se, contra o publicado:

- melhora as quatro colunas — janela inteira, sem a melhor moeda, 1ª metade e
  2ª metade — sem piorar a queda máxima em mais de 2 p.p.;
- os vizinhos dos dois lados também melhoram a inteira e o "sem a melhor"
  (platô; pico não entra);
- melhora "sem as 3 melhores moedas" (coluna nova: com 325 posições a HEI não é
  mais a única que pode carregar um resultado);
- e, onde há janela posterior (1, 2 e 6), melhora nela a inteira e o "sem a
  melhor".

Combinação de duas aprovadas só entra se a soma também passar no mesmo
critério. Nada é escolhido pelo maior número.

## O que isto não demonstra, qualquer que seja o resultado

Vantagem das calls. São dez semanas de um mercado só, e toda regra de gestão
desta carteira foi escolhida olhando parte destes mesmos dados. O placar segue
sendo o juiz das calls.

---

## Resultado (13/11/2026, `npm run medir-carteira`)

500.831 emissões, 80 de 81 moedas com vela de 1 h, de 02/09 a 13/11 11:23 UTC;
meio em 08/10, posterior desde 29/09. Colunas: inteira · sem a melhor · sem as
3 melhores · queda máxima · 1ª metade · 2ª metade · posterior · posterior sem a
melhor.

| regime | inteira | sem 1 | sem 3 | queda | 1ª met | 2ª met | post | post s/1 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **publicado** | +4,1% | +0,4% | −5,8% | −19,6% | +4,9% | −3,7% | −3,0% | −6,9% |
| varejo ≤ 3 | +7,9% | +1,0% | −6,2% | −16,9% | +13,8% | −8,6% | −7,8% | −10,1% |
| varejo ≤ 3,5 | +10,4% | +6,8% | +0,2% | −18,8% | +8,7% | +1,2% | −3,2% | −6,6% |
| varejo ≤ 4 | +4,4% | +0,7% | −5,7% | −18,9% | +6,4% | −4,8% | −5,8% | −9,2% |
| varejo ≤ 5 | +6,3% | +2,6% | −3,7% | −19,3% | +6,0% | +0,8% | −7,6% | −11,5% |
| stop 15% | −7,5% | −14,5% | −23,8% | −24,7% | −1,0% | −7,3% | −11,7% | −16,6% |
| stop 20% | +7,7% | +2,5% | −5,6% | −21,2% | +5,4% | −0,3% | −1,1% | −6,1% |
| stop 30% | +1,7% | −1,0% | −6,2% | −18,4% | +2,7% | −3,4% | −5,0% | −8,3% |
| rastro liga +40%, 15% atrás | −5,5% | −9,3% | −13,8% | −20,2% | +3,2% | −11,3% | −12,2% | −15,8% |
| rastro liga +40%, 20% atrás | −4,4% | −8,2% | −13,0% | −20,1% | +3,5% | −9,6% | −11,7% | −15,3% |
| rastro liga +40%, 30% atrás | −4,6% | −8,3% | −12,8% | −20,5% | +3,1% | −6,8% | −7,1% | −10,9% |
| alvo 60% | −2,1% | −5,8% | −12,1% | −20,3% | +4,5% | −3,8% | −8,3% | −13,3% |
| alvo 80% | +0,2% | −4,2% | −10,8% | −20,0% | +5,3% | +0,3% | −9,6% | −13,2% |
| sem reação 2 d | +4,0% | +0,6% | −5,7% | −14,8% | +2,0% | +3,6% | +3,3% | −0,5% |
| sem reação 4 d | −2,7% | −6,1% | −11,8% | −20,7% | −0,6% | −7,3% | −5,0% | −9,5% |
| sem reação 5 d | −10,3% | −13,8% | −19,3% | −21,6% | −3,6% | −6,8% | −8,9% | −13,1% |
| força 2 a 2,5% | +2,1% | −2,6% | −9,8% | −22,1% | +2,1% | −2,6% | −5,7% | −9,1% |
| força 2 a 3% | −3,1% | −6,9% | −14,1% | −24,6% | −1,8% | −3,0% | −3,1% | −7,4% |
| força 2 a 4% | −5,2% | −9,9% | −17,7% | −27,0% | −6,6% | +1,9% | −7,4% | −13,3% |
| força 1 a 0,5% | +5,4% | +1,7% | −4,4% | −19,1% | +2,1% | +3,7% | +2,5% | −1,4% |
| entrada 30 min | +8,6% | +4,7% | −1,8% | −17,1% | +4,3% | +1,7% | +1,8% | −1,9% |
| entrada 1 h | +4,6% | +1,0% | −5,7% | −16,9% | +1,8% | −0,2% | −2,0% | −5,9% |
| entrada 2 h | +0,4% | −3,7% | −9,4% | −17,5% | −2,6% | −1,3% | +1,9% | −1,9% |

**Nenhuma variante passa no critério, e `REGRAS` fica como está.**

1. **Filtro de varejo 3,5** — melhora as quatro colunas e o "sem as 3", os
   vizinhos melhoram a inteira e o "sem a melhor", e **reprova na janela
   posterior**: −3,2% contra −3,0%, com os três vizinhos piores que o publicado
   (−5,8% a −7,8%). O dado que a ideia não tinha visto confirma a leitura de
   28/09: pico, não regra.
2. **Stop de 20%** — melhora inteira, sem a melhor, as duas metades e a
   posterior, mas não é platô: 15% dá −7,5% e 30% dá +1,7%. Reprovado.
3. **Deixar correr** — pior em tudo, nas cinco formas. O alvo fixo de +40% não
   é o que segura a carteira: as nove posições que o bateram devolvem o ganho
   quando ficam (a 2ª metade vai de −3,7% para −6,8% a −11,3% com o rastro).
4. **Sem reação** — 4 e 5 dias pioram tudo; 2 dias empata a inteira (+4,0%) com
   a queda menor (−14,8%) e a 2ª metade e a posterior melhores, e a 1ª metade
   pior (+2,0% contra +4,9%). O 3 deixou de estar no meio de um platô e passou
   a ser a borda dele. Não era candidata e não muda; fica anotado para a
   próxima rodada, que terá janela posterior para o 2.
5. **Mais risco na força 2** — piora em linha reta: 2,5% → +2,1%, 3% → −3,1%,
   4% → −5,2%, com a queda indo a −27%. É a resposta medida a "se arriscasse
   um pouco mais": a força 2 fez o lucro na média, e aumentar a aposta nela
   aumenta mais os stops de −75% da margem do que os ganhos. A força 1 a 0,5%
   melhora a inteira e piora a 1ª metade: reprovada.
6. **Confirmar a entrada 30 min** — melhora inteira, sem a melhor, sem as 3,
   queda, 2ª metade e posterior; piora a 1ª metade (+4,3% contra +4,9%) e os
   vizinhos (1 h e 2 h) pioram a 1ª metade também. Reprovada pelo critério
   como escrito. É a que chegou mais perto.

O que a tabela diz, somado: a gestão publicada está num ponto em que mexer em
qualquer botão troca uma metade pela outra. Sem as três melhores moedas a
carteira está em −5,8%, e a janela posterior, começando do zero em 29/09, em
−3,0%. O resultado de +4,1% é das calls de setembro; a gestão não tem de onde
tirar mais.
