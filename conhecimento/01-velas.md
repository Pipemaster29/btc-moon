# 01 — Leitura de velas

| | |
|---|---|
| **Estado** | **medida e reprovada** — 0 de 8 figuras passaram nos quatro testes |
| **Aferido por** | `npm run aferir-padroes` → `data/padroes.json` |
| **Definições** | `lib/padroes.ts` |
| **Última medição** | 09/09/2026 · 522 moedas · 87.950 observações · horizonte de 7 dias |

Lição de origem: material introdutório sobre leitura de candlestick — anatomia da
vela, corpo e pavio, doji, martelo, estrela cadente, engolfo, e a tese de que
contexto vale mais que a figura.

---

## O resumo, antes dos detalhes

A lição tem duas partes, e a medição separou as duas de forma limpa:

**A parte das figuras não se sustenta.** As seis figuras direcionais — martelo,
estrela cadente, engolfo de alta, engolfo de baixa e as duas rejeições —
apontaram, TODAS AS SEIS, para o lado **contrário** ao que a lição afirma. E
nenhuma delas separou o bastante para isso significar alguma coisa: a
concordância entre moedas ficou entre 51% e 59%, que é a faixa que este projeto
chama de cara ou coroa.

**A parte do contexto se sustenta, e mais forte do que a lição diz.** A lição
afirma que "contexto importa mais que a figura". A medição diz que o contexto
importa e a figura **não importa nada** — em 6 das 15 combinações a figura em
cima do contexto *piorou* o resultado, e nas combinações com o contexto mais
forte ela piorou em todas.

O melhor sinal desta medição inteira não tem vela nenhuma dentro: **"subiu ≥20%
em 7 dias" separa −4,80 p.p. da referência com 76% das moedas concordando**. É a
mesma coisa que `lib/garimpo.ts` já mede por outro caminho, reencontrada aqui
sem querer — e é a única linha da tabela que passaria nos quatro testes.

---

## 1. As afirmações, numeradas

Do texto original, o que dá para testar:

| # | afirmação | veredito |
|---|---|---|
| 1 | O martelo mostra compradores retomando o controle → é seguido de alta | **reprovada** — segue −0,27 p.p., para baixo |
| 2 | A estrela cadente mostra exaustão → é seguida de queda | **reprovada** — segue +0,49 p.p., para cima |
| 3 | O engolfo de alta mostra compradores dominando → é seguido de alta | **reprovada** — segue −0,23 p.p. |
| 4 | O engolfo de baixa mostra vendedores dominando → é seguido de queda | **reprovada** — segue +0,11 p.p. |
| 5 | Pavio superior longo revela rejeição → é seguido de queda | **reprovada** — segue +0,53 p.p. |
| 6 | Pavio inferior longo revela absorção → é seguido de alta | **reprovada** — segue −0,46 p.p. |
| 7 | O doji indica indecisão e pode marcar perda de momento | **sem direção declarada**; 50% de concordância, não separa de nada |
| 8 | Vela de expansão marca movimento em curso | **separa (−1,83 p.p., 69%)**, mas não é direcional — ver abaixo |
| 9 | Contexto importa mais que a figura | **confirmada, e mais forte que o enunciado** |
| 10 | A figura no suporte/resistência com volume é mais forte que a figura solta | **reprovada** — o contexto sozinho já entrega tudo |

Todas as seis primeiras erraram o lado. Isso é mais interessante do que erros
aleatórios: a consistência sugere que estas moedas revertem no horizonte de 7
dias, e que a vela está lendo o movimento que **acabou de acontecer**, não o que
vem. Uma vela com pavio inferior longo é uma vela que caiu muito no dia — e o que
prevê o futuro aqui é a queda, não o pavio.

### O que não dá para medir daqui

Estas partes da lição ficam sem veredito, e ficam escritas assim de propósito:

- **"Velas refletem emoção, medo, ganância, hesitação."** Não é falso; é
  não-testável com os dados deste projeto. Nada aqui observa quem operou nem por
  quê. É metáfora de ensino, e como metáfora funciona.
- **"Caçadas de stop criam pavios longos."** Testável em princípio, com livro de
  ofertas e liquidações — dados que este projeto não coleta com fonte pública e
  sem chave. Fica como hipótese aberta.
- **"Marque velas manualmente no TradingView e pergunte o que compradores e
  vendedores queriam ali."** É conselho de treino, não afirmação sobre o mercado.
  Provavelmente bom conselho; nada a medir.

---

## 2. A tradução para código

Em `lib/padroes.ts`, cada figura virou uma comparação entre números, seguindo a
regra que `lib/tecnica.ts` já tinha estabelecido: *"uma regra que depende de onde
alguém desenhou não pode ser testada, e o que não pode ser testado não entra
aqui."*

| figura | definição fechada |
|---|---|
| doji | corpo ≤ 10% da amplitude |
| martelo | pavio inferior ≥ 2 corpos **e** pavio superior ≤ ¼ do inferior **e** corpo > 0 |
| estrela cadente | o espelho exato |
| rejeição | um pavio sozinho ≥ 50% da amplitude |
| engolfo | o corpo de hoje cobre o corpo de ontem, cores opostas |
| expansão | amplitude ≥ 2× a **mediana** das 20 anteriores |

**Todos esses cortes são convenção, não medição** — são os números que a
literatura repete, escritos para poder ser testados, não porque eu acredito
neles. Por isso a aferição roda cada figura em três cortes (0,7× / 1× / 1,4×): um
efeito que só existe num deles é calibragem, não descoberta.

Duas escolhas que mudam resultado e por isso ficam explícitas:

- **Engolfo compara corpo com corpo**, não vela com vela. A definição "total",
  que exige cobrir os pavios, é rara demais para fechar amostra. Onde há duas
  definições e uma não fecha amostra, a honesta é a que fecha — dizendo qual foi.
- **Expansão compara com a mediana das 20**, não com a média. Uma vela gigante na
  janela levanta a média e faz a seguinte parecer normal.

O contexto (`contextoDe`) usa pivôs para suporte e resistência, média de 20 para
tendência, mediana de volume para "volume alto", e ±20% em 7 velas para "vem de
alta/queda".

---

## 3. O veredito, com os números

Referência de todas as 87.950 observações: **−0,88%** em 7 dias.

### As figuras sozinhas

| figura | n | mediana 7d | vs referência | moedas a favor | no sentido que afirma? |
|---|---|---|---|---|---|
| martelo | 2.937 | −1,15% | −0,27 p.p. | 282/501 · 56% | **não** |
| estrela cadente | 6.304 | −0,39% | +0,49 p.p. | 286/521 · 55% | **não** |
| engolfo de alta | 7.327 | −1,11% | −0,23 p.p. | 272/522 · 52% | **não** |
| engolfo de baixa | 7.854 | −0,77% | +0,11 p.p. | 268/522 · 51% | **não** |
| rejeição superior | 19.056 | −0,35% | +0,53 p.p. | 294/522 · 56% | **não** |
| rejeição inferior | 12.021 | −1,34% | −0,46 p.p. | 309/522 · 59% | **não** |
| doji | 10.458 | −0,74% | +0,15 p.p. | 263/521 · 50% | n/a |
| expansão | 10.515 | −2,71% | −1,83 p.p. | 360/522 · 69% | n/a |

Seis de seis no sentido errado, e nenhuma acima de 60% de concordância.

### O contexto sozinho — o controle que decide

| contexto | n | vs referência | moedas a favor |
|---|---|---|---|
| **subiu ≥20% em 7d** | 6.189 | **−4,80 p.p.** | **341/448 · 76%** |
| caiu ≥20% em 7d | 4.338 | +1,50 p.p. | 278/422 · 66% |
| volume alto | 21.127 | −1,01 p.p. | 326/522 · 62% |
| em suporte | 40.136 | +0,59 p.p. | 311/520 · 60% |
| em resistência | 31.080 | +0,13 p.p. | 242/520 · 47% |

### A decomposição — quem estava causando

A pergunta que julga a lição não é "quanto o contexto acrescenta à figura", é o
inverso: **quanto a figura acrescenta depois que o contexto já foi lido?**

| combinação | só a figura | só o contexto | juntos | a figura acrescenta |
|---|---|---|---|---|
| estrela + vem de alta | +0,49 | −4,80 | −3,94 | **−0,86** ← diluiu |
| engolfo-baixa + vem de alta | +0,11 | −4,80 | −3,92 | **−0,88** ← diluiu |
| doji + vem de alta | +0,14 | −4,80 | −4,14 | **−0,65** ← diluiu |
| martelo + em suporte | −0,27 | +0,59 | +0,17 | **−0,42** ← diluiu |
| engolfo-alta + em suporte | −0,23 | +0,59 | +0,60 | +0,01 |
| martelo + vem de queda | −0,27 | +1,50 | +3,30 | +1,80 |

**A figura acrescentou nada ou piorou em 6 das 15 combinações**, e nas três com o
contexto mais forte — "vem de alta", que separa 4,80 p.p. — piorou nas três.

As duas linhas em que a figura parece ter ajudado muito (martelo + vem de queda,
+1,80 p.p.; doji + vem de queda, +1,07 p.p.) **não sobrevivem ao teste de
concordância**: 11 de 21 moedas (52%) e 65 de 120 (54%). É cara e coroa com
amostra pequena, que é exatamente o formato de coisa que este projeto aprendeu a
não acreditar.

### A exceção que quase passou: a vela de expansão

Uma figura passou em **tudo que é mensurável** e mesmo assim não virou regra, e o
motivo merece estar escrito porque é diferente dos outros sete "não":

| | expansão |
|---|---|
| amostra | 10.515 |
| distância da referência | −1,83 p.p. |
| concordância | 360/522 · **69%** — acima do corte de 60% |
| sensibilidade ao corte | estável: −1,09 / −1,83 / −2,98 p.p., mesmo sinal nos três |
| estabilidade nas metades | estável: −2,42 e −1,18 p.p. |

Ela é a única da tabela que sobrevive aos quatro filtros. O que a barra é outra
coisa: **ela não afirma um lado.** "Vela muito maior que as vinte anteriores" diz
que houve movimento, não em que direção o movimento continua — e uma regra de
operação precisa de um lado.

O que ela mede, olhando os números, é provavelmente o mesmo que os contextos
medem: vela de expansão é vela de dia grande, e dia grande costuma ser dia de
alta grande, que é o efeito de −4,80 p.p. aparecendo de novo com outro nome. Não
é figura de vela funcionando; é o tamanho do movimento funcionando, medido por um
instrumento em forma de vela.

### Sensibilidade e estabilidade

Nenhuma figura direcional troca de sinal entre os cortes — o efeito (fraco) é
consistente. Mas quatro das oito **não aparecem nas duas metades da janela**:
martelo (+0,27 e −0,84), engolfo de alta (+0,11 e −0,46), engolfo de baixa
(−0,42 e +0,76) e doji (+0,34 e −0,02). Trocar de sinal entre trimestres é a
assinatura de descrição de regime, não de regularidade.

---

## 4. O que mudou no projeto

**No comportamento: nada.** Nenhuma figura passou, então nenhuma virou regra,
nenhuma entrou no painel e nenhuma toca a carteira. `lib/padroes.ts` existe como
instrumento de medição — e para a próxima pessoa que ler esta lição em algum
lugar não precisar refazer o teste do zero.

**No conhecimento, três coisas:**

1. **Figura de vela sozinha não separa nada neste universo.** Oito figuras,
   87.950 observações, 522 moedas, concordância de 50% a 59%. Se alguém propuser
   uma regra baseada em martelo ou engolfo aqui, este arquivo é a resposta.
2. **As seis direcionais erraram o lado, todas.** A vela está descrevendo o
   movimento que acabou de acontecer, e neste horizonte estas moedas revertem.
   Ler a vela como previsão é ler o passado achando que é futuro.
3. **O contexto que a lição trata como coadjuvante é o protagonista** — e o mais
   forte deles, "subiu ≥20% em 7 dias" com −4,80 p.p. e 76% de concordância, é o
   mesmo efeito que `lib/garimpo.ts` já ordena a lista por. Duas medições
   independentes, com definições diferentes, chegando ao mesmo lugar é o
   resultado mais sólido desta aferição.

E o de sempre, que o `AGENTS.md` pede que fique escrito: **a deriva depois da alta
continua sem virar call.** O garimpo já mediu que vendê-la mecanicamente perde
dinheiro em toda largura de stop testada, porque o caminho estopa a posição
antes. Achar o mesmo sinal por um segundo caminho confirma o sinal, não a
operação.
