# conhecimento/ — o que a gente leu, e o que sobreviveu à medição

Esta pasta guarda lições de trading vindas de fora do projeto: threads, cursos,
livros, vídeos, o que for. É o lugar onde material de terceiros entra **sem**
virar regra automaticamente.

A distinção é o ponto inteiro da pasta.

## A regra

**Uma lição aqui é uma lista de hipóteses, nunca uma lista de regras.**

O `AGENTS.md` abre com a lei do repositório — *"nada entra sem medição, e o que
foi medido e não funciona fica escrito"* — e material de fora é exatamente onde
essa lei é mais fácil de furar. Um texto bem escrito, com exemplos convincentes e
tom de quem sabe, passa a sensação de conhecimento sem trazer um número sequer.
Se ele entrasse direto no código, a pasta viraria o único lugar do projeto que
afirma sem medir.

Então toda lição passa pelo mesmo caminho:

```
   texto original  →  hipóteses numeradas  →  função com definição fechada
                                                        ↓
   veredito escrito de volta na lição  ←  aferição sobre os 528 perpétuos
```

E o veredito pode ser **não**. Foi o que aconteceu com a primeira lição desta
pasta, e o "não" dela está escrito com o mesmo cuidado que um "sim" teria.

## O padrão de arquivo

Cada lição é um arquivo `NN-assunto.md` com estas seções, nesta ordem:

### 1. Cabeçalho de estado

Uma tabela de três linhas, no topo, antes de qualquer texto:

```markdown
| | |
|---|---|
| **Estado** | medida · não medida · medida e reprovada |
| **Aferido por** | `npm run aferir-xxx` → `data/xxx.json` |
| **Última medição** | 09/09/2026 · 522 moedas · 87.950 observações |
```

Existe para quem abre o arquivo no meio saber, na primeira linha, se está lendo
uma coisa demonstrada ou uma coisa que alguém escreveu na internet. Sem isso, a
lição e o veredito dela têm a mesma aparência — que é a armadilha nº 6 do
`AGENTS.md` aplicada a texto em vez de a dado.

### 2. As afirmações, numeradas

O texto original destrinchado em afirmações **testáveis**, uma por linha
numerada. Cada uma precisa poder ser falsa. "Velas mostram emoção" não é
afirmação testável; "um martelo é seguido de alta com mais frequência do que a
referência" é.

O que não puder virar afirmação testável vai para uma seção separada chamada **O
que não dá para medir daqui**, e fica lá — sem virar código, sem virar regra, e
sem ser jogado fora, porque saber que não dá para medir também é informação.

### 3. A tradução para código

Onde as definições fecharam: qual arquivo, qual função, quais cortes. **Todo
corte que for convenção e não medição tem de dizer que é**, com essas palavras.
É o que permite a prova de sensibilidade da seção seguinte.

### 4. O veredito

A tabela do que passou e do que não passou, com os números. E a frase do que
mudou no comportamento do projeto — inclusive quando a resposta é "nada, porque
nada passou".

## Os quatro testes

Uma afirmação só vira regra se passar em **todos**. Cada um sozinho deixa passar
coisa demais, e este projeto já descartou tese por cada um deles separadamente:

| teste | o que ele mata |
|---|---|
| **amostra** ≥ 30 observações | número bonito feito de três casos |
| **sentido** — a distância aponta para onde a afirmação diz | o resultado que confirma qualquer coisa: mediana positiva "confirma alta", negativa "confirma armadilha". A direção esperada é declarada **antes** de medir |
| **concordância** ≥ 60% das moedas | mediana boa concentrada em poucas moedas. É o teste que mais candidato mata aqui — os vieses do próprio painel morrem nele, com 46% a 54% |
| **estabilidade** nas duas metades da janela | efeito que é só a descrição de um trimestre |

E, quando a definição tiver corte de convenção, um quinto:

| **sensibilidade** — o efeito sobrevive ao corte frouxo e ao apertado | calibragem disfarçada de descoberta |

## O controle que não pode faltar

Se a afirmação for "figura X no contexto Y funciona", **medir X+Y não conclui
nada sozinho**. É preciso medir os três:

- X sozinho
- Y sozinho ← **este é o que quase sempre falta**
- X e Y juntos

Sem o Y sozinho, atribui-se à figura o que era do ambiente. Foi exatamente o que
a primeira lição desta pasta revelou: o contexto entregava a distância inteira e
a figura em cima dele **diluía** o resultado em 6 de 15 combinações.

É o mesmo raciocínio que o `lib/placar.ts` já aplica ao comparar viés com a
referência em vez de com zero.

## Nunca olhar para frente

Toda função de classificação recebe a série e um índice `i`, e só pode ler `i` e
o que veio antes. Um `i + 1` em qualquer lugar invalida a aferição inteira **sem
nenhum sintoma** — os números continuam saindo, bonitos e falsos.

Cuidado com o que parece passado e não é: um pivô no índice `k` só é conhecido
depois de `k + LADO`, porque a janela é simétrica. Usar pivôs até `i` é olhar
para frente; até `i − LADO` não é. Está comentado assim em `lib/padroes.ts`.

## Como adicionar a próxima lição

1. `conhecimento/NN-assunto.md` com as quatro seções, estado **não medida**.
2. As afirmações que derem, viram função em `lib/` com definição fechada.
3. Um `scripts/aferir-NN.mts` que mede com a metodologia acima e grava
   `data/NN.json`. Copie a estrutura de `scripts/aferir-padroes.mts` — as cinco
   seções dele são as cinco perguntas.
4. Rode, e **escreva o resultado de volta na lição**, seja ele qual for.
5. Só então, se passou, o comportamento do projeto muda — e o commit diz o que
   foi medido e o que mudou.

## As lições

| arquivo | assunto | estado |
|---|---|---|
| [`01-velas.md`](01-velas.md) | leitura de velas: martelo, estrela cadente, doji, engolfo, pavios, contexto | **medida — 0 de 8 figuras passaram** |
