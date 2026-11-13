# Pré-registro: a recompra do Momento, solta só na máxima nova (13/11/2026)

Escrito ANTES de rodar qualquer uma das variantes abaixo. O pedido do usuário:
"as estratégias dos bots estão muito ruins (…) melhorar eles e sua eficiência.
A meta é deixar eles absurdos e realistas".

## De onde vem

**Ao vivo, de 07/10 a 13/11/2026** (`data/robos.json` da branch `dados`): o
Momento em −15,3% (queda −21,0%), o turbo em −22,3% (−30,1%), o Caça-monstra em
−13,8%, o Grandes em −1,1% e o Fluxo em +0,8%. No Momento, as 65 compras
encerradas somam −US$ 332 e as 38 vendas, +US$ 159. O desenho da perda é o
mesmo de 05/11, maior: a perna comprada recompra a moeda que acabou de estopar
— a AGT foi aberta 12 vezes (−US$ 67), a JCT 10 (−US$ 68), a BTW 8 (−US$ 42), a
Q 6, a AIN 5. Essas cinco moedas respondem por −US$ 242 dos −US$ 173 do livro
inteiro.

**O que já foi medido** (`docs/preregistro-regime.md`, 05/11): a call queimada
da carteira — depois de stop ou rastro a perna só volta quando a moeda sai das
k primeiras e retorna, ou depois da janela — conserta outubro e corta o desenho
pela metade (+1.864% → +802% a +854%), nas três formas testadas. A leitura
escrita lá: "a recompra é o que pega a segunda perna das monstras".

## A hipótese

As duas coisas têm uma diferença que o preço mostra. A segunda perna de uma
monstra FAZ MÁXIMA NOVA: o preço passa do pico que a posição anterior viu. A
manipulada despejando não faz: ela continua entre as 5 que mais subiram em 45
dias só porque a alta velha ainda está na janela. Então: queimar como em 05/11,
e soltar a queima também quando o preço da decisão passa do melhor preço que a
posição queimada viu.

No motor, `Perna.queimada.ateExtremo` (`lib/robos.ts`), desligado em todo robô
publicado; os casos-limite estão em `npm run testar-robos`. O nível mora na
queima (`Queimada.extremo`), é o `melhor` da posição que saiu, e sem preço lido
a moeda continua queimada.

## As variantes, e só elas

Sobre o Momento publicado (o turbo é o mesmo livro a 1,5x e segue a decisão):

1. queimada com soltura no extremo, nas duas pernas;
2. queimada com soltura no extremo, só na perna comprada;
3. a 2, queimando só a saída com prejuízo.

São 3 tentativas a mais: 380 com as 377 da pesquisa.

## O critério, o mesmo de 05/11

No DESENHO (08/01/2024 a 31/03/2026), contra o publicado:

- Sharpe do desenho maior;
- nenhuma das duas metades (até 06/2025 e depois) com Sharpe menor;
- "sem as 5 melhores" do publicado não pior.

Das que passarem, a de maior Sharpe no desenho é a escolhida, e só ela decide:

- na RESERVA (01/04 a 30/09/2026), Sharpe não menor que o do publicado;
- de 01/10 a 12/11/2026, retorno não menor — **e esta janela não é
  independente**: é a que motivou a hipótese. Ela pode reprovar, não aprovar
  sozinha;
- no ataque, no desenho, contra o publicado no mesmo ataque: custo de entrada
  4x e escorregada do stop dobrada, Sharpe maior nos dois.

Se nenhuma passar no desenho, o livro fica como está e a reserva não é aberta
para escolher — as três rodam nela depois, só para o registro.

## O que isto não muda, qualquer que seja o resultado

O +5.928% medido é o teto de quem escolheu depois de ver (em tempo real, +977%
contra +6.126%), o lucro é de cauda (sem as 5 melhores a reserva perde 67%) e
cinco semanas de −15% cabem na queda que o bootstrap dá ao livro (−24% a −54%).
Uma regra de recompra não transforma isso em outra coisa.

## Emenda (13/11/2026, antes de rodar)

O Data Vision só publica o mês fechado: a medição alcança 31/10/2026, e não
12/11. A janela recente do critério passa a ser 01/10 a 31/10/2026. Nela o
motor reproduz o ao vivo (`--conferir-ao-vivo`, desde 08/10): Momento −10,6% ao
vivo e −11,8% no motor; turbo −15,9% e −17,8%; Caça-monstra −9,5% e −10,9%;
Fluxo +1,6% e +1,0%; Grandes −1,1% e −2,0%. Nada mais muda.

---

## Resultado (13/11/2026, `npm run medir-robos -- --recompra`)

677 moedas com vela, 155 deslistadas, até 31/10/2026. O publicado reproduz a
rodada de 13/10 no desenho (+1.863,9%).

| | desenho | 1ª metade | 2ª metade | sem as 5 | trades |
| --- | --- | --- | --- | --- | --- |
| **publicado** | +1.863,9% (queda −35,8%, Sharpe 2,40) | +216,1% (1,56) | +443,9% (3,65) | +431,9% | 1.818 |
| extremo, nas duas pernas | +966,8% (−36,9%, 2,07) | +163,6% (1,46) | +265,9% (2,91) | +298,7% | 1.574 |
| extremo, só na compra | +955,2% (−37,9%, 2,06) | +164,9% (1,46) | +260,1% (2,87) | +288,1% | 1.589 |
| extremo, só na compra e no prejuízo | +882,2% (−37,2%, 1,98) | +157,4% (1,43) | +244,8% (2,71) | +232,5% | 1.647 |

**As três reprovam nos três critérios do desenho. O Momento fica como está, e a
reserva não escolheu nada.** Depois da decisão, para o registro:

| | reserva (04–09/2026) | outubro de 2026 |
| --- | --- | --- |
| **publicado** | +154,4% (queda −30,0%, Sharpe 2,62) | −13,0% (−17,6%) |
| extremo, nas duas pernas | +133,5% (−33,1%, 2,51) | −3,3% (−8,3%) |
| extremo, só na compra | +141,4% (−33,8%, 2,59) | −1,7% (−9,3%) |
| extremo, só na compra e no prejuízo | +125,8% (−29,5%, 2,41) | −2,7% (−9,6%) |
| queimada de 05/11, só na compra | +151,0% (−32,6%, 2,67) | −1,7% (−9,3%) |

O que isso diz:

- **A soltura na máxima nova recupera pouco**: +830% (a queimada de 05/11) →
  +955% no desenho, contra +1.864% do publicado. A hipótese estava errada no
  mecanismo: a segunda perna que o Momento pega recomprando NÃO espera a máxima
  nova. A recompra que dá dinheiro é a de logo depois do stop, ainda abaixo do
  pico — a moeda que sacudiu a posição e voltou a subir.
- **Outubro é consertado por qualquer forma de queima** (−13,0% → −1,7% a
  −3,3%) e isso continua não sendo motivo: é a janela que motivou a regra, e
  em 27 meses de desenho a mesma regra custa metade do resultado.
- A perda de outubro e novembro é o preço do desenho do livro, não um defeito
  dele: 26% das compras dão lucro (`--placebo`, 13/10), e os meses sem monstra
  são feitos só dos outros 74%.

São 380 tentativas na conta da pesquisa (`TENTATIVAS_DA_PESQUISA`).
