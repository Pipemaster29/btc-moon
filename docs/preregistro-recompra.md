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
