# 01 — Leitura de velas

| | |
|---|---|
| **Estado** | **medida e reprovada** — 0 de 8 figuras passaram nos quatro testes |
| **Aferido por** | `npm run aferir-padroes` → `data/padroes.json` |
| **Definições** | `lib/padroes.ts` |
| **Última medição** | 10/09/2026 · 522 moedas · 66.053 observações · horizonte de 7 dias |

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
concordância entre moedas ficou entre **50% e 57%**, que é a faixa que este
projeto chama de cara ou coroa.

**Só uma parte do contexto se sustenta, e não é a que a lição enfatiza.** A
lição fala de suporte e resistência; medidos, os dois são cara e coroa — "em
suporte" separa +0,32 p.p. com 55% de concordância, "em resistência" +0,19 p.p.
com **48%**. O que separa é o MOMENTO: quanto a moeda andou nos sete dias
anteriores.

O melhor sinal desta medição inteira não tem vela nenhuma dentro: **"subiu ≥20%
em 7 dias" separa −5,55 p.p. da referência com 79% das moedas concordando**. É a
mesma coisa que `lib/garimpo.ts` já mede por outro caminho, reencontrada aqui
sem querer — e é a única linha da tabela que passaria nos quatro testes.

E a figura em cima do contexto **piora** o resultado: nas quatro combinações com
"vem de alta", que é o contexto mais forte, a figura diluiu em **todas as
quatro**.

---

## 1. As afirmações, numeradas

Do texto original, o que dá para testar:

| # | afirmação | veredito |
|---|---|---|
| 1 | O martelo mostra compradores retomando o controle → é seguido de alta | **reprovada** — segue −0,05 p.p., para baixo |
| 2 | A estrela cadente mostra exaustão → é seguida de queda | **reprovada** — segue +0,49 p.p., para cima |
| 3 | O engolfo de alta mostra compradores dominando → é seguido de alta | **reprovada** — segue −0,06 p.p. |
| 4 | O engolfo de baixa mostra vendedores dominando → é seguido de queda | **reprovada** — segue +0,01 p.p. |
| 5 | Pavio superior longo revela rejeição → é seguido de queda | **reprovada** — segue +0,45 p.p. |
| 6 | Pavio inferior longo revela absorção → é seguido de alta | **reprovada** — segue −0,49 p.p. |
| 7 | O doji indica indecisão e pode marcar perda de momento | **sem direção declarada**; 52% de concordância, não separa de nada |
| 8 | Vela de expansão marca movimento em curso | **separa (−1,68 p.p., 65%)**, mas não é direcional — ver abaixo |
| 9 | Contexto importa mais que a figura | **confirmada** — mas o contexto que vale é o MOMENTO, não suporte/resistência |
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
  que exige cobrir os pavios, tem **4 e 8 ocorrências** em 66.053 observações —
  não fecha amostra nem de longe. Onde há duas definições e uma não fecha
  amostra, a honesta é a que fecha, dizendo qual foi e com que número.
- **Expansão compara com a mediana das 20**, não com a média. Uma vela gigante na
  janela levanta a média e faz a seguinte parecer normal.

O contexto (`contextoDe`) usa pivôs numa **janela móvel de 60 velas** para
suporte e resistência, média de 20 para tendência, mediana de volume para "volume
alto", e ±20% em 7 velas para "vem de alta/queda".

### A primeira medição desta lição estava errada, e o erro é instrutivo

A versão de 09/09 procurava pivôs **desde o começo da série**, sem janela. O
efeito é que "está num suporte" deixava de ser uma propriedade do mercado e
virava uma propriedade de quanto histórico por acaso tinha vindo antes: numa
ETHUSDT de 200 velas os pivôs de fundo acumulados vão de **2 na vela 30 para 17
na vela 190**.

Medido em 120 moedas, a mesma regra classificava **1,52× mais** observações como
"em suporte" na segunda metade da janela do que na primeira (41,8% → 63,7%).

E isso não era só imprecisão: **contaminava o teste de estabilidade**, que é um
dos quatro que decidem se uma figura passa e que existe justamente para comparar
as duas metades da janela. A régua estava mudando entre as metades junto com o
mercado, e nenhum número dizia isso.

O conserto foi janela fixa de 60 velas **mais** a exigência de que ela esteja
cheia — meia correção derrubou a deriva só de 1,52× para 1,14×, porque o começo
da série continuava com janela incompleta. Com as duas, 1,09×, e o que sobra anda
na direção que a deriva de preço do período explica.

**O que mudou nas conclusões:** nada no veredito (0 de 8 antes e depois), mas os
números todos, e um deles inverteu de leitura. "Em suporte" aparecia com +0,59
p.p. e 60% de concordância — no limite do que este projeto aceita como separação.
Com a régua fixa: **+0,32 p.p. e 55%**, cara e coroa. O bug estava inflando
exatamente o contexto que a lição original diz ser o mais importante.

---

## 3. O veredito, com os números

Referência de todas as 66.053 observações: **−1,22%** em 7 dias.

### As figuras sozinhas

| figura | n | mediana 7d | vs referência | moedas a favor | no sentido que afirma? |
|---|---|---|---|---|---|
| martelo | 2.156 | −1,27% | −0,05 p.p. | 251/473 · 53% | **não** |
| estrela cadente | 4.541 | −0,73% | +0,49 p.p. | 269/514 · 52% | **não** |
| engolfo de alta | 5.554 | −1,28% | −0,06 p.p. | 260/516 · 50% | **não** |
| engolfo de baixa | 6.054 | −1,20% | +0,01 p.p. | 259/518 · 50% | **não** |
| rejeição superior | 14.231 | −0,77% | +0,45 p.p. | 285/518 · 55% | **não** |
| rejeição inferior | 9.280 | −1,71% | −0,49 p.p. | 295/518 · 57% | **não** |
| doji | 7.997 | −1,04% | +0,18 p.p. | 267/517 · 52% | n/a |
| expansão | 7.864 | −2,91% | −1,68 p.p. | 339/518 · 65% | n/a |

Seis de seis no sentido errado, e nenhuma acima de 60% de concordância — quatro
delas em 50% a 53%, que é literalmente cara ou coroa.

### O contexto sozinho — o controle que decide

| contexto | n | vs referência | moedas a favor |
|---|---|---|---|
| **subiu ≥20% em 7d** | 4.363 | **−5,55 p.p.** | **332/421 · 79%** |
| caiu ≥20% em 7d | 3.413 | +2,49 p.p. | 276/396 · 70% |
| volume alto | 15.675 | −1,00 p.p. | 322/518 · 62% |
| em suporte | 28.195 | +0,32 p.p. | 283/516 · 55% |
| em resistência | 20.010 | +0,19 p.p. | 246/516 · 48% |

**Suporte e resistência são cara e coroa** — 55% e 48%. A lição os trata como o
contexto principal, e eles não separam. O que separa é o MOMENTO, e separa muito:
79% das moedas concordam que subir 20% numa semana é seguido de queda.

### A decomposição — quem estava causando

A pergunta que julga a lição não é "quanto o contexto acrescenta à figura", é o
inverso: **quanto a figura acrescenta depois que o contexto já foi lido?**

| combinação | só a figura | só o contexto | juntos | a figura acrescenta |
|---|---|---|---|---|
| estrela + vem de alta | +0,49 | −5,55 | −5,27 | **−0,27** ← diluiu |
| engolfo-baixa + vem de alta | +0,01 | −5,55 | −5,06 | **−0,49** ← diluiu |
| doji + vem de alta | +0,18 | −5,55 | −5,50 | **−0,05** ← diluiu |
| martelo + em suporte | −0,05 | +0,32 | +0,22 | **−0,10** ← diluiu |
| martelo + volume alto | −0,05 | −1,00 | −0,82 | **−0,19** ← diluiu |
| martelo + vem de queda | −0,05 | +2,49 | +3,90 | +1,41 |

**A figura acrescentou nada ou piorou em 5 das 15 combinações**, e nas QUATRO com
o contexto mais forte — "vem de alta", que separa 5,55 p.p. — piorou nas quatro.

As duas linhas em que a figura parece ter ajudado muito (martelo + vem de queda,
+1,41 p.p.; doji + vem de queda, +0,95 p.p.) **não sobrevivem à amostra**: 15 e
94 moedas, com 60% e 54% de concordância. É cara e coroa com amostra pequena, que
é exatamente o formato de coisa que este projeto aprendeu a não acreditar.

### A exceção que quase passou: a vela de expansão

Uma figura passou em **tudo que é mensurável** e mesmo assim não virou regra, e o
motivo merece estar escrito porque é diferente dos outros sete "não":

| | expansão |
|---|---|
| amostra | 7.864 |
| distância da referência | −1,68 p.p. |
| concordância | 339/518 · **65%** — acima do corte de 60% |
| sensibilidade ao corte | estável: −1,07 / −1,68 / −2,73 p.p., mesmo sinal nos três |
| estabilidade nas metades | estável: −3,67 e −0,89 p.p. |

Ela é a única da tabela que sobrevive aos quatro filtros. O que a barra é outra
coisa: **ela não afirma um lado.** "Vela muito maior que as vinte anteriores" diz
que houve movimento, não em que direção o movimento continua — e uma regra de
operação precisa de um lado.

O que ela mede, olhando os números, é provavelmente o mesmo que os contextos
medem: vela de expansão é vela de dia grande, e dia grande costuma ser dia de
alta grande, que é o efeito de −5,55 p.p. aparecendo de novo com outro nome. Não
é figura de vela funcionando; é o tamanho do movimento funcionando, medido por um
instrumento em forma de vela.

### Sensibilidade e estabilidade

**Seis das oito não aparecem nas duas metades da janela**, e trocar de sinal
entre trimestres é a assinatura de descrição de regime, não de regularidade:

| figura | primeira metade | segunda metade |
|---|---|---|
| martelo | +0,61 p.p. | −0,50 p.p. |
| estrela cadente | −0,23 p.p. | +0,69 p.p. |
| engolfo de alta | +1,00 p.p. | −0,67 p.p. |
| engolfo de baixa | −0,73 p.p. | +0,91 p.p. |
| rejeição inferior | +0,04 p.p. | −0,83 p.p. |
| doji | +0,06 p.p. | −0,01 p.p. |

O martelo também troca de sinal entre os cortes (−0,13 / −0,05 / +0,20 p.p.): o
pouco que ele mede depende de onde a régua foi posta.

**E o engolfo trouxe um número que vale por si.** A prova de sensibilidade dele
percorre a convenção discutida na literatura — corpo contra corpo, ou vela
inteira contra vela inteira, com os pavios. Na definição clássica, a estrita:

| definição | engolfo de alta | engolfo de baixa |
|---|---|---|
| corpo cobre corpo | 5.554 | 6.054 |
| vela inteira cobre vela inteira | **4** | **8** |

Quatro ocorrências em 66.053 observações. A figura que os manuais desenham como
o exemplo canônico de dominância de um lado praticamente **não existe** neste
universo — e a versão que existe é a frouxa, que é a que não separa nada.

---

## 4. O que mudou no projeto

**No comportamento: nada.** Nenhuma figura passou, então nenhuma virou regra,
nenhuma entrou no painel e nenhuma toca a carteira. `lib/padroes.ts` existe como
instrumento de medição — e para a próxima pessoa que ler esta lição em algum
lugar não precisar refazer o teste do zero.

**No conhecimento, três coisas:**

1. **Figura de vela sozinha não separa nada neste universo.** Oito figuras,
   66.053 observações, 522 moedas, concordância de 50% a 57%. Se alguém propuser
   uma regra baseada em martelo ou engolfo aqui, este arquivo é a resposta.
2. **As seis direcionais erraram o lado, todas.** A vela está descrevendo o
   movimento que acabou de acontecer, e neste horizonte estas moedas revertem.
   Ler a vela como previsão é ler o passado achando que é futuro.
3. **O contexto que a lição trata como coadjuvante é o protagonista** — e o mais
   forte deles, "subiu ≥20% em 7 dias" com −5,55 p.p. e 79% de concordância, é o
   mesmo efeito que `lib/garimpo.ts` já ordena a lista por. Duas medições
   independentes, com definições diferentes, chegando ao mesmo lugar é o
   resultado mais sólido desta aferição.

E o de sempre, que o `AGENTS.md` pede que fique escrito: **a deriva depois da alta
continua sem virar call.** O garimpo já mediu que vendê-la mecanicamente perde
dinheiro em toda largura de stop testada, porque o caminho estopa a posição
antes. Achar o mesmo sinal por um segundo caminho confirma o sinal, não a
operação.
