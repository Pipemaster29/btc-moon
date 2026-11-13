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
