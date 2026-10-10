# Radar de moedas manipuladas

Ferramenta pessoal para acompanhar tokens de pump-and-dump: quem segura o
supply na blockchain, como as posições estão montadas no perpétuo, e em que
ponto do ciclo cada moeda está — com alerta no Telegram quando algo se mexe.

Tudo é lido de fontes públicas, **sem nenhuma chave de API**: nós RPC públicos
da BNB Chain, Base e Ethereum, o Blockscout para os logs antigos da Ethereum e da
Base, o DexScreener para o mercado à vista, e a API de
futuros da Binance ao vivo — que parecia bloqueada por região e não estava: a
recusa é do host `fapi.binance.com`, e `www.binance.com` serve os mesmos
caminhos normalmente. A Gate entra só para as duas coisas que a Binance não
expõe por REST: o valor liquidado de cada lado e a posição absoluta das contas
grandes.

## O que ele responde

A pergunta que organiza tudo é: **esta queda foi alguém vendendo, ou não?**
Porque as duas coisas se parecem no gráfico e têm consequências opostas.

- **Desalavancagem** — o open interest em moeda cai junto com o preço. Foram
  posições encerradas. Nenhuma moeda trocou de mão, e não há o que ver na rede.
- **Livro vazio** — o open interest fica de pé e quase ninguém é liquidado. O
  preço cai porque sumiu a COMPRA. Foi o caso da BTW em 19/08: −50% de preço com
  o open interest intacto e US$ 51 mil de comprados liquidados (1,8% do livro).
- **Distribuição** — alguém entregou moeda de verdade, e o saldo das corretoras
  na rede sobe. A única das três que aparece on-chain.

## As duas telas

**`/`** — o gráfico do bitcoin, com os eventos que moveram o mercado marcados, e
embaixo dele a **liquidez projetada**. É a referência de contexto, não o objeto
de estudo.

O botão 🌕 marca lua nova e lua cheia, e os marcadores aparecem quando há menos
de 400 velas na tela — 12,4 lunações por ano viram uma cerca no histórico
inteiro. A conta não vem de API nenhuma: sai da fórmula do Meeus e erra no
máximo quatro minutos contra as efemérides do Observatório Naval dos EUA. É
ornamento, e fica desligado por padrão: não há nada aqui que sustente a lua
mexendo no preço.

**`/radar`** — a triagem: todas as moedas vigiadas numa tabela, ordenadas por
quanto merecem atenção agora. Duas requisições por moeda, quarenta e duas moedas
em menos de um segundo. Clicar numa abre **`/radar/[moeda]`** com o retrato
completo: estrutura do supply, carteira por carteira, transferências grandes,
posicionamento, mapa de liquidação e o estágio do ciclo.

Na ordem em que aparecem, e a ordem é o argumento: a **carteira fictícia** com a
curva do patrimônio contra a das regras anteriores sobre as mesmas calls; o
**placar** dizendo que nenhum viés separou; os **sinais clássicos medidos**, uma
barra divergente por sinal, para a pergunta "e se eu usasse RSI?" ter a resposta
na mesma tela; as candidatas e a tabela; o **fluxo da carteira quente da
Binance**, por porta; e o garimpo.

### Ao vivo, sem servidor

Preço, 24h e a marcação da carteira andam de ~3 em ~3 segundos, e isso não custa
nada ao Vercel nem ao GitHub: depois da primeira consulta, o navegador de quem
olha abre um WebSocket público direto com a Binance. Medido com as 71 moedas
numa conexão só: 4 KB por segundo. Quando ele cai — rede que bloqueia, região
que a Binance recusa, ou a rota que abre e fica muda, que existe —, a consulta
de 15 s assume na hora e a tela diz qual dos dois está valendo.

O que continua no ritmo do workflow, e por quê: **as decisões**. Abrir e fechar
posição exige o histórico inteiro e o caminho de velas; emitir viés exige o
estágio de vida, que custa seis meses de dados por moeda. Isso roda de ~22 em ~22
minutos no GitHub Actions, de graça. Decidir de segundo em segundo pediria um
servidor ligado o tempo todo — e os sinais daqui foram medidos em horizontes de
7 dias: nenhum deles mudaria de resposta em um minuto.

## A liquidez projetada

Balanço do Fed menos a conta do Tesouro menos o reverse repo é o dinheiro que de
fato circula, e a tese conhecida diz que ele chega aos ativos de risco um
trimestre depois. As três séries vêm do FRED, sem chave — só é preciso um
user-agent que se identifique, porque o padrão do Node leva 503.

**O painel mede a própria tese em vez de só desenhá-la, e o resultado desmente a
leitura fácil.** Em NÍVEL, no lead de 13 semanas e na janela de dois anos, o
ajuste é 0,71 — parece forte e não é: são duas séries que subiram no período, e
na janela longa o ajuste é 0,72 em zero semanas contra 0,68 em vinte e seis. Se
não muda com a defasagem, não existe defasagem; existe tendência compartilhada.
Em VARIAÇÃO semanal, que a tendência não falseia, o ajuste no lead de 13 semanas
é **−0,004 em 770 semanas**. Fora da amostra foi −0,09 entre 2017 e 2020, +0,78
entre 2020 e 2023 e −0,02 de 2023 para cá, e o ajuste móvel de 52 semanas já
oscilou de +0,89 a −0,82.

Por isso o painel mostra as três coisas lado a lado — o número bonito, o número
honesto e a série que mostra quando a relação inverteu. O lead fica **fixo** em
um trimestre justamente para não ser escolhido pelo que se ajusta melhor: o
melhor lead se mexe de 15 para 19 para 1 semana conforme a janela, que é como se
reconhece um ajuste que não existe.

## O placar do próprio painel

Todo parâmetro daqui foi medido sobre ARQUIVO de preço, reconstruindo o que o
classificador TERIA dito. Nada media o que ele REALMENTE disse — e o
`data/historico-AAAA-MM.jsonl` guardava 21 mil emissões ao vivo que nunca foram
lidas de volta. `npm run placar` lê.

O resultado, sobre 21.127 emissões de 72 moedas entre 20/08 e 01/09:

| viés | separa da referência | moedas que concordam |
| --- | --- | --- |
| short | −0,00 p.p. | 51% |
| long | +0,07 p.p. | 48% |
| evitar | −0,35 p.p. | 40% |
| observar | +0,01 p.p. | 53% |

**Nenhum viés separou de nada.** A referência — todas as moedas, todo o período —
é −0,45% em 24h, e os quatro vieses medem isso. Concordância de 50% entre moedas
é cara ou coroa.

Doze dias num regime de queda não é amostra para condenar o painel, e o placar
diz isso na tela. Mas enquanto for assim, o que está no radar é DESCRIÇÃO do
estado das moedas, não recomendação — e é assim que a página passa a apresentá-lo.

O que separou mais do que o viés foi o ESTÁGIO: "caindo do topo" mede −1,82 p.p.
abaixo da referência em 1.619 observações, e "nota 60+" mede −5,27 p.p. — só que
em 45 observações e 2 de 5 moedas, que é pouco para afirmar.

**Remedido em 23/09, com cinco vezes mais dado** — 120.407 emissões de 73
moedas, de 20/08 a 23/09 —, e o veredito não mudou:

| viés | separa da referência | moedas que concordam |
| --- | --- | --- |
| short | −0,14 p.p. | 55% |
| long | +0,01 p.p. | 47% |
| evitar | −0,12 p.p. | 43% |
| observar | −0,04 p.p. | 52% |

O short passou a apontar ligeiramente para o lado ERRADO, e em 72 horas isso
fica nítido nos dois meses: depois de cada call de venda o preço subiu +0,44
p.p. contra a referência em agosto e +2,29 p.p. em setembro. É isso que a
carteira passou a cobrar do lado vendido — ver abaixo.

O placar ficou vinte dias sem rodar, e ninguém viu: ele não estava no workflow,
e rodado à mão morria com a pilha estourada — `Math.min(...pontos)` com 126 mil
argumentos. A tela mostrava a medição de 03/09 com a janela antiga ao lado. Hoje
ele roda no retrato de fechamento, e o `Math.min` virou laço.

## Concentração: a moeda tem dono ou tem público?

O `lib/motor.ts` trazia a ressalva escrita desde sempre: "fora de corretora" não
separa um dono com 80% de dez mil donos com 80%, e são situações opostas. E dizia
que resolver isso exigiria a lista de maiores detentores, que nó público não
entrega.

O custo de não ter isso era concreto. **No JCT, seis endereços seguram 99,9% do
supply** — e o motor lia esse mesmo 99,9% como munição intacta, o que fez o painel
emitir COMPRA. A moeda imprimiu preço de 2,9e-27 dias depois.

A saída é a gênese, e ela é barata: nas primeiras horas do token não existe
mercado, e as poucas transferências que existem são a distribuição. Varrer a vida
inteira das 34 moedas com contrato somaria 167 milhões de logs; a janela da gênese
cabe em minutos. `npm run genese` faz isso e grava em `data/detentores.json`; o
motor desconta a concentração antes de julgar a oferta, e o viés de compra deixa
de sair em moeda com dono.

### A janela estava no lugar errado, e a medição custava horas

O método funcionava e quase ninguém tinha sido medido: **7 moedas de 37 com
contrato**, porque uma janela de gênese sem filtro anda de 500 em 500 blocos e o
nó entrega uma faixa a cada 1,5 a 3,4 segundos — 302 requisições e até dezessete
minutos por moeda. O `lib/explorador.ts` lê a mesma janela pelo Blockscout, sem
chave, em **uma requisição por mil eventos**: a BTW saiu de ~302 requisições e
sete minutos para **1 requisição e 0,3 segundo**. Só na Ethereum e na Base — a
BSC não tem instância gratuita, e isso foi verificado antes de ser afirmado
(o Etherscan cobra pelas duas redes, o Routescan não serve a 56, e os nós
públicos param em 10 mil blocos ou pedem token).

Com a leitura barata, o defeito da janela ficou visível. Ela era de **20.000
blocos**, e blocos não são tempo: os mesmos 20 mil são 2,5h na BNB Chain e 66,7h
na Ethereum. E ela começava no NASCIMENTO DO CONTRATO, que só é o começo da
distribuição quando o mint está na transação de deploy. Medido nas 17 moedas de
Ethereum e Base:

| atraso entre nascer e a 1ª transferência | moedas |
|---|---|
| 0,00h — o mint veio no deploy | 13 |
| 13,20h | H |
| **67,49h** | SYN |
| ~110h (4,6 dias) | HEI |
| **2.349h (98 dias)** | C |

A SYN caía 1,5 hora fora de uma janela de 66,7h. E o script não reclamava: ele
grava concentração ZERO como resultado legítimo, então a leitura falhada e a
leitura "ninguém tem pedaço grande" viravam o mesmo número.

A janela agora é de **72 horas contadas do primeiro evento**, e o primeiro evento
custa uma requisição — o Blockscout devolve em ordem crescente, então a primeira
página começa nele por mais larga que seja a faixa.

Resultado: **17 moedas medidas em vez de 7**, e a C saiu de 0% para **29,0%**.

### E a primeira correção quase apagou a medição que sustenta tudo

O rastro que segue o supply do contrato de passagem até a carteira real tinha o
mesmo defeito de unidade: `ALCANCE = 200_000` blocos, com o comentário "pouco
mais de um dia na BNB Chain" ao lado — e 667 horas na Ethereum. Troquei por 25
horas, o que o comentário dizia, rodei o lote, e o **JCT caiu de 99,9% para
0,0%**. É a leitura que justifica o módulo inteiro.

Aí eu medi em vez de deduzir do texto. Quantas horas depois do primeiro evento
os donos de verdade chegam ao corte de 0,5% do supply: no JCT, **262,6 a 288,8
horas** — o contrato de passagem segura o supply por onze dias antes de
distribuir. O alcance agora é de 336h onde cabe, limitado a 40 faixas por salto
onde não cabe (a BSC, onde 336h seriam 538 faixas por salto).

E o rastro deixou de poder DIMINUIR a concentração. O laço trocava o nível atual
pelo seguinte sem comparar, então um nível que dispersa apagava um nível que
segurava: com o alcance maior, a C ia de 29,0% para 0,1% e a VVV de 28,6% para
0,0%. O que os donos da gênese seguram hoje é um fato medido; o nível seguinte é
informação a mais, não substituição.

Medido: BTW 100,0% · JCT 99,9% · CAP 84,5% · ZAMA 70,6% · MORPHO 51,5% · C 29,0%
· VVV 28,6% · PORTAL 24,7% · POWER 21,8% · HEMI 12,1% · e sete em 0,0%.

### As 20 da BSC não são lentas, são impossíveis

Eu supunha que a BSC ficaria com uma leitura pior. Rodei as 16 para medir quanto
pior, e o resultado foi outro: **em 15 delas as 41 faixas da janela falharam** e
nada foi lido. Não é o nó devagar — é o nó de log da BNB Chain guardando desde
2025-11-10, com a gênese dessas moedas antes disso. É a mesma falha de 41 de 41
que o repositório já registrava na AKE, agora medida na lista inteira.

O script gravava as 16 como `concentracao: 0`. **Hoje ele não grava linha
nenhuma** quando a varredura não leu: zero gravado é pior que ausência, porque a
moeda passa a parecer medida. E a 16ª — a CYS, que leu UMA transferência com
zero faixas perdidas e passava pelos dois guards existentes — é barrada por um
terceiro: **zero sem âncora não é medição**. A janela sem explorador são 2,5h
contadas do nascimento, e 4 das 17 moedas com âncora mintam depois disso.

## Parado ou saindo

A concentração responde "quem segura". Falta a pergunta seguinte, que é a que
decide o preço: esse supply está **parado** ou está **saindo**? Um contrato com
30% do supply que não se move é oferta que não existe. O mesmo contrato soltando
0,9 ponto percentual por mês é uma venda programada de que ninguém avisou.

**Medido na C (Chainbase).** O bilhão inteiro foi mintado para três contratos em
40/30/30, e a leitura de gênese marcava isso como concentração — que soa a moeda
travada. Amostrando o saldo dos três mês a mês no nó de arquivo da Base:

| data | supply nos cofres |
|---|---|
| 2026-03-05 | 35,39% |
| 2026-06-03 | 32,65% |
| 2026-09-01 | 23,12% |

São 12,3 pontos percentuais — 123 milhões de tokens — que viraram oferta em seis
meses, e o contrato dos 30% pinga 0,91 pp por mês com regularidade de relógio.
Não é carteira presa; é torneira.

`npm run vesting` acha os contratos de alocação pela emissão — varredura filtrada
por `from = 0x0`, que devolve as poucas transferências que criaram supply em vez
dos milhões que o movimentaram depois — e amostra o saldo deles em sete alturas
de bloco. Grava em `data/vesting.json`.

Entra como **quarto motor**: emissão acima de 0,5 pp/mês reprova. E freia as duas
regras de compra, ao lado do unlock. Os dois desfazem a mesma premissa — comprar
moeda derretida supõe que a oferta parou de crescer —, mas cobrem casos opostos:
o unlock procura um SALTO de 5% em 21 dias, e emissão programada não salta, ela
pinga.

**Limite conhecido:** na BNB Chain o único endpoint público que serve
`eth_getLogs` em lote guardava desde 2025-11-10 quando medido em 02/09 — e só
~100 horas rolantes quando medido de novo em 23/09. Moeda nascida antes do
horizonte não tem emissão varrível ali, e a varredura grava esse limite em vez
de devolver zero.

## Mil dólares de mentira

O placar mede se os vieses separam da referência em pontos percentuais. Não
responde a pergunta que qualquer pessoa faz primeiro: **se eu tivesse seguido,
quanto eu teria hoje?** São perguntas diferentes — a mediana não sabe de tamanho
de posição, de custo, nem de quantas posições ficam abertas ao mesmo tempo.

`npm run carteira` entra em toda call de compra e venda e mostra o resultado no
topo do painel, acima das candidatas. A ordem é deliberada: quem abre a página
vê quanto as calls renderam antes de ver as calls novas.

**É perpétuo a 3x, não mercado à vista.** Ela opera vendido, e vendido não
existe no spot — então financiamento e liquidação entram na conta, e os custos
incidem sobre o nocional, que é três vezes a margem. Três é o teto que preserva
o stop: a 25% de preço ele consome 75% da margem e ainda dispara antes da
liquidação; a 4x os mesmos 25% consomem 100% e quem decide a saída passa a ser
a corretora.

**Tamanho da posição — pelo risco, não pelo capital.** Cada call arrisca uma
fração fixa do patrimônio até o stop, e o tamanho sai dessa conta: força 3
arrisca 3%, força 2 arrisca 2%, força 1 arrisca 1%. Parece pouco até
lembrar que o painel emite treze calls de uma vez num dia normal, e que cripto
tem dia em que a lista inteira cai 25% junta. Teto de 50% de margem exposta e de
25% de risco agregado. **A carteira não opera vendido desde 25/09** — arriscava
um quarto até então, e ainda assim o lado vendido somava −US$ 28,51 em 60
posições; sem ele a carteira foi de −1,0% para +2,0% com as duas metades
melhores. O painel continua dando as vendas e o placar continua medindo cada
uma. Abaixo de 10% do pico o orçamento inteiro encolhe até um quarto em −25%,
da gestão de 23/09, logo abaixo.

**Quando sai — seis gatilhos, o primeiro que acontecer:**

| gatilho | por quê |
|---|---|
| **o painel mudou de ideia** | a saída principal. A carteira segue as calls, então sai quando a call sai — sem isso ela mediria as minhas regras de saída, não o painel |
| **stop em −25% de preço** | fora do ruído de um dia: o `npm run estudar` mede desvio diário mediano de 11,2% nestas moedas, então 25% são ~2,2 desvios. Mais curto foi testado e não passou — ver abaixo |
| **sem reação em 3 dias** | a posição que não andou a favor em três dias sai. Não é stop: é o tempo dizendo que a tese de reversão não se confirmou no prazo em que costuma se confirmar |
| **alvo em +40% de preço** | o dobro da assimetria que sustenta a regra de compra: pequena e derretida sobe mais de 20% em 21,0% das semanas |
| **prazo de 14 dias** | as duas regras direcionais foram medidas em janelas de 7 e 14 dias; depois disso segurar deixa de ser seguir a leitura |
| **liquidação** | a corretora não espera a regra de saída. A 3x ela fica em −32,9% de preço, depois do stop — mas um salto pode pular o stop e cair direto aqui |

E **toda saída queima a call**: a moeda só volta a valer quando o viés dela sair
daquele lado. Antes só stop e liquidação queimavam, e a posição que saía por
prazo reabria no mesmo lote, com o mesmo viés — a PRL fez isso em 22/09, pagando
entrada e saída para continuar onde estava.

### A gestão de 23/09: perder menos com as mesmas calls

Em 23/09 a carteira estava em **−11,3%, com queda máxima de −17,2%**, em 93
posições encerradas. O diagnóstico de onde o dinheiro saiu:

- **As sete que estoparam nunca estiveram no lucro.** A maior excursão a favor
  de qualquer uma foi +7,3%, quase sempre na primeira hora; depois, sangria lenta
  até −25%.
- **O tempo separou as metades.** Encerradas com menos de três dias: +US$ 66.
  Com três dias ou mais: −US$ 151.
- **O vendido pagou o squeeze.** As 13 vendidas fechadas porque a moeda disparou
  somaram −US$ 112 — mais que a perda inteira do lado vendido.

A regra nova ataca as três e **não mexe em nada do que o painel diz**. Medida
sobre as mesmas emissões e o mesmo caminho de velas, e — a parte que importa —
em cada METADE da janela separadamente, começando do zero:

| | inteira | 1ª metade | 2ª metade | queda máx | sem a melhor moeda |
|---|---|---|---|---|---|
| anterior | −14,1% | −15,1% | +3,8% | −18,7% | −19,3% (sem HEI) |
| **publicada** | **−2,1%** | **−6,2%** | **+8,1%** | **−11,0%** | **−3,9%** (sem BEAT) |

**Esta tabela foi refeita em 24/09 ao meio-dia, e a de 23/09 estava errada.** Ela dava à
publicada +14,8%, e a HEI respondia por US$ 191 disso com três saídas no alvo
(+46%, +64% e +66% de preço). Os três alvos eram preço de outra coisa: a pool
rasa da HEI devolvia de vez em quando 1,6 a 2 vezes o preço do perpétuo, o
retrato alternava entre os dois, e o perpétuo nunca passou de US$ 0,155 em
nenhuma das três janelas. O motor já recusava o CAMINHO de velas nesses
retratos, por ser "outra moeda" — e em seguida fechava a posição no alvo com o
mesmo preço. Hoje cada preço de retrato é conferido contra a vela de 1h do
perpétuo daquela hora (`foraDoPerpetuo`, em `lib/carteira.ts`): saem 211
linhas, todas da HEI, nenhuma de outra moeda.

E um stop virava liquidação. Dentro da vela de 1h o motor testava a liquidação
antes do stop, e a vela que seguia caindo depois do stop custava a margem
inteira no lugar de 75% dela. Mas o preço que desce cruza primeiro o nível mais
perto — o stop, em −25%, antes da liquidação, em −33% —, e a corretora só chega
antes quando a vela ABRE além dela. Aconteceu uma vez, na HEI de 09/09 (US$ 26,86
perdidos onde o stop perderia US$ 20,38); sobre os mesmos dados, −2,8% viraram
−2,1%.

O que sobrevive é a conclusão sobre a gestão: com as mesmas calls, a publicada
perde −2,1% onde a anterior perde −14,1%, e desligar qualquer peça piora (a
tabela do `npm run carteira`). **Lucro continua não demonstrado** — e agora nem
o número da tela sugere o contrário.

**O que foi testado e não passou**, e é metade da escolha:

- **Stop mais curto**, fixo (10% a 20%) ou medido na volatilidade de cada moeda
  (2σ de um dia). Com a saída por tempo no lugar, 20% dava +17,6% e 2σ dava
  +21,6%, com a mesma queda máxima — e era quase tudo a HEI: stop curto é
  posição maior, e a posição maior caiu na moeda que bateu o alvo três vezes.
  Tirando as duas moedas que mais ganharam, os dois PERDEM para o stop de 25%.
  Refeito em 24/09, sem os alvos falsos da HEI: stop de 20% em −3,1% contra
  −2,1% do de 25%. A decisão se mantém.
- **Stop móvel**, de 8/12% a 20/15%: as vencedoras andam pouco (+3,9% de
  excursão mediana) e saem pelo painel antes; o rastro só as encurtava.
- **Mais tamanho**, 1,5x e 2x o orçamento: a queda máxima dobra e o teto passa a
  recusar call. Sem vantagem medida, tamanho multiplica a variância.
- **Freio de queda contínuo desde o pico**: custou retorno e piorou o pior início.
  O que ficou só começa em −10% — nunca encosta nesta amostra, e existe para o
  cenário que ela não tem: dois dias seguidos de tudo estopar junto custariam
  −44% sem ele e −30% com ele.
- **Filtros de entrada (28/09)**, contra o publicado em +4,2%:
  - *Não comprar com financiamento alto.* No histórico, "exausta" com funding
    ≥ 0,015% por período mede −10,6 e −6,1 pontos em 7 dias, com 16 de 23
    moedas abaixo. Na carteira piorou em todo limite testado (+1,2% a +4,0%),
    porque as compras dessa faixa na segunda metade deram lucro saindo pelo
    painel.
  - *Não comprar com varejo lotado* (mais de 3,5 contas compradas por vendida).
    Só o 3,5 melhorou; 3 e 5 pioraram. É pico, não platô.
- **Confirmar a entrada (28/09)**: esperar o viés durar de 30 min a 12 h antes
  de abrir piora em todos, até −4,1%. Nestas compras o valor está em entrar
  logo.
- **Teto de risco e tamanho da força 1 (28/09)**: subir o teto de 25% não muda
  nada; baixar piora. Força 1 a 1,5% deu +4,6% com a segunda metade igual, e a
  2% piorou.

`npm run carteira` imprime esta comparação **a cada retrato** — o publicado, o
anterior, e cada peça desligada uma de cada vez, com as duas metades e a coluna
"sem a melhor moeda" —, para ela continuar sendo medida em vez de lembrada.

**Stop, alvo e liquidação disparam DENTRO do intervalo entre dois retratos.** Era
o maior otimismo desta conta, e não era custo nem execução: era o mapa de saída
simplesmente não enxergar o meio. Os retratos saem de duas a cinco vezes por dia
e os gatilhos só eram testados nas pontas, então uma moeda que caísse 30% às 3h
da manhã e voltasse antes do retrato das 6h nunca estopava aqui — e teria
estopado na corretora, porque ordem parada não pisca.

`npm run carteira` agora busca as velas de uma hora da Binance das moedas que
podem virar posição e percorre o caminho. Medido nas 16 posições que a carteira
carregou até 04/09: **todas as 16 esconderam movimento entre os retratos**, a
mediana escondeu 2,1 p.p. e a maior — a SKYAI vendida — escondeu 5,0 p.p.

E o que isso mudou no resultado até aqui: **nada.** Nos dois dias de vida da
carteira nenhuma posição chegou perto dos limites — a que mais andou contra foi
a TUT, a 12,5% de preço, metade do stop —, então as duas leituras dão o mesmo
patrimônio. É um freio que ainda não foi acionado, e o script imprime os dois
números lado a lado para continuar sendo possível ver qual é qual.

As velas vêm do perpétuo e os preços da carteira vêm do retrato, que prefere a
pool à vista onde ela existe. O caminho é **ancorado** pela razão entre os dois
— medida entre 0,96 e 1,08 nessas 16 posições — e recusado inteiro fora da faixa
de 0,8 a 1,25: uma razão de 1,4 não é base de mercado, é outra moeda.

**Ela começa hoje, não sobre o histórico.** Rodar o motor para trás sobre os dois
meses gravados daria um número imediato e enganoso: as regras do painel foram
ajustadas ao longo desses dois meses — o freio de perfil, o de emissão, a trava
de alta — e todas foram escritas depois de ver os dados. Um resultado
retrospectivo mediria o quanto eu ajustei o painel olhando para o passado.

**O que a conta não cobra, e cada um empurra o número para cima:** a diferença
entre o preço do retrato e o preço em que a ordem de ENTRADA sairia — a saída
deixou de ter esse problema —, e a profundidade real da pool, já que o custo é
0,15% por lado, fixo, e numa pool de dois mil dólares uma ordem de sessenta já
move mais que isso.

## Os robôs: qualquer moeda, uma regra medida

A carteira acima segue as calls do painel e passou cinco semanas entre US$ 1.000
e US$ 1.100. O pedido seguinte foi o óbvio — "arrisca mais, ou melhora a
estratégia; o melhor robô possível, qualquer moeda, de olho nas manipuladas" — e
as duas metades tinham resposta medida.

**Mais tamanho nas mesmas calls piora.** A tabela de regimes que a carteira grava
a cada retrato já media isso em 07/10: o publicado em +6,3%, a escala 1,5x em
+1,1% e a 2x em −7,1%. Sem vantagem nas calls, tamanho compra variância, e o teto
de risco agregado passa a recusar entrada.

**Então a estratégia tinha de ser outra, e ela foi escolhida medindo.** A bancada
baixou as velas de 1 h e o financiamento real de **676 perpétuos USDT de 01/2024 a
09/2026 — os 152 deslistados inclusive**, sem os quais o vendido pareceria pior e o
comprado melhor —, com custo por liquidez, stop testado dentro da vela, dentro da
amostra até 06/2025 e fora dela depois. Média por trade, sobre o nocional, líquida:

| ideia | dentro | fora | |
| --- | --- | --- | --- |
| surfar a vela de +20% em 1 h, sair no rastro | −0,2% a −2% | +1% a +2,4% | não passa |
| vender o pump depois do topo | −1% a −4% | −1% a −5% | perde nas duas |
| comprar o tombo de −8% em 1 h | +0,2% a +1,4% | −0,6% a −1,6% | vira |
| tendência nas 20/60 mais líquidas | −0,3% a −7% | ~0 (uma monstra) | não passa |
| financiamento extremo, qualquer lado | ± | ± | não passa |
| vender a listagem nova 72 h depois | +5,0% | +2,5% | fraco: Sharpe 0,5 fora |
| **vender as que mais caíram em 14 dias** | **+1,5% a +3%** | **+1% a +2,5%** | passa nas duas |
| **comprar as que mais subiram em 30 dias** | −1% a −2% | +2% a +8% | só fora |

Duas coisas que este projeto já sabia aparecem de novo pelo outro lado. Vender o
pump perde — é o garimpo. E **perdedora continua perdendo**: por decil do retorno
de 14 dias, o que mais caiu rende +3,1% vendido dentro e +1,4% fora; o do meio,
+0,2% e +0,8%; o que mais subiu, +0,1% e −2,2% — esse é o squeeze. É "comprar a
derretida piora quanto mais fundo a queda", visto do lado que ganha.

**Nenhuma perna sozinha é boa carteira.** A vendida é quase toda beta — vender
qualquer altcoin líquida com stop largo deu lucro em 2024–2026, porque elas
sangraram — e cai 40% a 60% quando as alts sobem juntas. A comprada perde devagar e
ganha de uma vez. **Juntas, se protegem**: quando o mercado de alts despenca a
vendida paga, quando aparece uma MYX a comprada paga. É o livro de **momento dos
dois lados**: todo dia, compra as 5 que mais subiram (stop de 25%, rastro de 30%,
até 30 dias) e vende as 5 que mais caíram em 14 (stop de 45%, 14 dias), entre os
perpétuos com US$ 20 milhões de volume. Na primeira versão, de 07/10, a compra
olhava 30 dias, e foi **atacada em 26 variações e positiva nas duas metades em
todas**: custo 2x e 3x, entrada 1 h e 3 h atrasada, decisão às 11 h ou 17 h em vez
da meia-noite, k de 3 e de 10, volume mínimo de 5 e de 50 milhões, rastro de 20% e
40%, stops, prazos e janelas. O pior foi o rastro de 20% — as monstras recuam 20%
várias vezes no caminho, e o rastro curto as vende no primeiro tranco.

### O custo da vida real (08/10)

A primeira medição entrava na abertura exata da meia-noite e saía no nível exato
do stop. As duas coisas foram medidas em **velas de 1 minuto** do Data Vision,
sobre as entradas e saídas que o livro de fato fez:

- **O stop.** Em 500 saídas sorteadas, em nenhuma o preço pulou o nível de um
  minuto para o outro — o "no nível" está certo nisso. Mas dentro do minuto do
  disparo o preço passa do nível 1,13% em média (mediana 0,52%, p99 9,3%), e uma
  ordem a mercado sai em algum ponto desse caminho. A medição passou a cobrar 6% do
  resto da vela de 1 h além do nível: ~0,28% por saída, proporcional ao tombo.
- **A entrada.** O robô ao vivo entra no primeiro retrato depois da meia-noite.
  Entrar 15 minutos depois custa +0,12%; pareado trade a trade, uma hora depois
  não custa nada em média. A medição cobra 0,1% por entrada.
- **A ordem mínima** da Binance, US$ 5 de nocional: abaixo disso não abre.
- **O stop pela marcação** em vez do último negócio foi medido e **não entrou**:
  o fora da amostra dobra, o dentro piora, e o stop da Binance é pelo último
  negócio salvo pedido.

Só isso levou a regra de 07/10, a 4% por posição, de +600% para **+416%** na janela
inteira (dentro +104% → +89%, fora +226% → +160%). É o que a medição antiga dava
de presente.

### A manhã de 08/10: 45 dias e pirâmide

Com o custo cobrado, duas mudanças na perna comprada passaram, juntas, no critério
escrito antes de olhar — melhorar a janela inteira, a de dentro e a de fora, sem
piorar o "sem as 5 melhores" de fora, e com vizinho bom (platô, não pico):

- **janela de 45 dias** em vez de 30 — de 35 a 55 dias, toda janela ganha da de 30
  fora da amostra. Sozinha ela EMPATA dentro (+84% contra +87%): a melhora dela é
  toda de 07/2025 em diante;
- **uma segunda parcela do mesmo tamanho quando a posição anda +40%** (+30% e +50%
  também passam), que é quem melhora o dentro: +84% → +105%, a 4%. Ela entra na
  mesma posição, como numa conta de verdade: preço médio, margem e liquidação
  refeitos, e o stop movido para dentro da liquidação nova — senão a corretora
  fecharia a posição inteira antes dele.

A 3% por posição, na mesma queda máxima da regra de 07/10 a 4%, a janela inteira foi
de +416% para +1.254% e o fora de +160% para +638%. **E o dentro da amostra foi de
+89% para +73%**: no mesmo risco, antes de 07/2025, aquela regra rendia menos. É o
que a tarde consertou.

### A tarde de 08/10: sair na hora e apostar conforme a agitação

Uma rodada nova de ideias, todas sobre a regra da manhã e com o custo da vida real
dentro, pelo mesmo critério. **Reprovadas**: comprar só perto da máxima da janela
(−50% a −90% do resultado — nestas moedas a que já corrigiu continua), ranking por
retorno ÷ volatilidade, comprar só com o BTC acima da média de 50 ou 100 dias,
vender só com ele abaixo, pirâmide na vendida (o dentro cai e a queda vai a −52%),
sair em N dias sem lucro (melhora o dentro e o fora fica igual ou pior), a mesma
saída por posto na vendida, stop de 20% ou 30%, volume mínimo de 10 ou 50 milhões,
e as duas ideias no Caça-monstra.

**Passaram duas**, e as duas são platô:

- **Sair quando a moeda deixa as 10 que mais sobem em 45 dias.** A monstra que parou
  de ser monstra devolvia o ganho até o rastro de 30% a pegar, ou ficava parada até
  o prazo prendendo margem. De top 5 a top 40, toda régua ganha de não sair, nas
  três janelas e no "sem as 5"; o 7 mediu melhor e é o pico, o 10 fica no meio.
- **O alvo de volatilidade**: o tamanho de cada entrada é multiplicado por 60% ao
  ano ÷ a volatilidade do próprio patrimônio nos últimos 40 dias, entre ¼ e 2x —
  menor na agitação, maior na calmaria. É a correção conhecida do momento (Barroso
  e Santa-Clara, 2015). O número que importa aqui é o Sharpe, porque tamanho sozinho
  não o muda (2,08 a 2,11 de 2% a 6%): com o alvo ele vai de 2,22 a 2,24–2,42 em
  toda janela de 30 a 60 dias, dentro e fora.

Medido com o motor que roda ao vivo, US$ 1.000 em 08/01/2024. As duas primeiras linhas
são do motor de antes das regras da Binance (abaixo, em "Na vida real"); as outras, com
elas:

| | inteira | dentro | fora | queda máx | Sharpe | sem as 5 melhores: inteira · fora |
| --- | --- | --- | --- | --- | --- | --- |
| regra de 07/10, 4% | +416% | +89% | +160% | −36% | 1,36 | +24% · −38% |
| manhã de 08/10, 3% | +1.254% | +73% | +638% | −37% | 2,09 | +242% · +71% |
| tarde de 08/10, 4% | +4.502% | +188% | +1.367% | −36% | 2,38 | +633% · +104% |
| **hoje, 4,25% — Momento** | **+5.928%** | **+216%** | **+1.565%** | **−36%** | **2,54** | **+833% · +116%** |
| **hoje, 6,375% — Momento turbo** | **+10.307%** | +244% | +2.633% | −46% | 2,45 | +968% · +138% |

Na mesma queda máxima da manhã, a regra da tarde de 08/10 quase quadruplicou a janela
inteira (+4.863%, no motor de então), e o dentro da amostra — o ponto fraco de antes —
foi de +73% a +199%. Por
trimestre ela ganhava em 8 de 11; perdia 2024T1 (−24% contra −22%), 2024T4 (+4% contra
+7%) e 2025T4 (+13% contra +23%). **Atacada** na bancada a 3%: custo de entrada 4x
(+2.411%), escorregada do stop dobrada (+2.454%), entrada 1 h atrasada (+2.577%) e
3 h atrasada (+1.906%) — todas acima da manhã nas três janelas.

### A vendida pela volatilidade da moeda (09/10)

A vendida do Momento perde dinheiro na soma (US$ 8 mil em 2024–2026) e mesmo assim é
indispensável: sem ela, o dentro da amostra cai de +199% para +17% com queda de −51% —
é ela que segura 2024. Reduzir o tamanho dela inteira (½ ou ¾) também derruba o dentro
(+118% e +161%). O que passou foi **repartir o risco entre as vendidas**: cada uma
entra com o tamanho multiplicado pela mediana do desvio diário de 45 dias das moedas
elegíveis ÷ o desvio da própria moeda, entre ¼ e 2x. A moeda duas vezes mais agitada
que a do meio é vendida com metade do tamanho.

| na mesma queda máxima (−36%), com as regras da Binance | inteira | dentro | fora | sem as 5 melhores: inteira · dentro · fora |
| --- | --- | --- | --- | --- |
| sem (08/10, 4%) | +4.502% | +188% (Sharpe 1,43) | +1.367% (3,27) | +633% · +195% · +104% |
| **com (4,25%)** | **+5.928%** | **+216% (1,56)** | **+1.565% (3,39)** | **+833% · +224% · +116%** |

No mesmo tamanho (4%), +5.329% com queda de −34%: mais lucro e menos queda juntos.
**Platô**: com o desvio de 30, 45 e 60 dias o Sharpe sobe nas duas metades ou empata
(dentro 1,54 · 1,56 · 1,44 contra 1,43; fora 3,33 · 3,39 · 3,38 contra 3,27); com 14
dias o dentro empata (1,44) e com 21 piora (1,40) — desvio de poucos dias é ruído. Os
limites ½–2x, ¼–1,5x e ¼–3x passam todos. **Atacada** no motor de antes das regras da
Binance, contra a regra anterior no mesmo ataque: custo de entrada 4x, +4.443% contra
+3.466%; escorregada do stop dobrada, +4.618% contra +3.686% — o Sharpe maior nas duas
metades nos dois.

**O que ela não é.** Não é "moeda agitada é venda ruim": por quartil do desvio na
entrada, as vendidas mais agitadas tiveram o melhor resultado médio por margem (+8,7%)
— e o maior número de stops. A regra reparte o risco em vez de concentrá-lo nas que
mais pulam. E **não melhora todo trimestre**: contra a regra anterior, ganha em 6 de
11. A vendida perde muito menos em 2026T2 (−18% do patrimônio → −6%) e em 2024T1
(−28% → −24%), e mais em 2025T3 (−15% → −23%) e 2026T1 (+29% → +20%).

**Reprovado na mesma rodada**, sobre a regra anterior a 4% (os números estão em
`VENDA_MOMENTO`): o mesmo tamanho pela volatilidade na **comprada** (+1.848% — as
monstras são as moedas mais agitadas, e o lucro mora nelas); trocar a vendida pelo par
do Fluxo (o fora sobe, o dentro cai para +91% a +138%); pôr o par do Fluxo como
terceira perna na mesma conta (+1.568% a +5.022%: o caixa não comporta os dois livros);
o fluxo como filtro da comprada ou da vendida (+2.237% a +4.515%); não comprar depois
de um dia de alta de 15% a 40% (+1.724% a +2.614% — é nesse dia que a monstra começa);
k de 3 a 7 nas duas pernas e janela da vendida de 7 a 30 dias (nenhuma passa; vender 4
em vez de 5 empata).

E o tamanho, na regra de hoje:

| tamanho por posição | inteira | queda máx | Sharpe | recusadas por caixa |
| --- | --- | --- | --- | --- |
| 2% | +1.591% | −22% | 2,48 | 11 |
| 3% | +3.204% | −29% | 2,53 | 1 |
| 4% | +5.329% | −34% | 2,54 | 1 |
| **4,25% — Momento** | **+5.928%** | **−36%** | **2,54** | 3 |
| 5% | +6.858% | −39% | 2,47 | 12 |
| 6% | +9.395% | −44% | 2,46 | 18 |
| **6,375% — Momento turbo** | **+10.307%** | **−46%** | **2,45** | 27 |
| 7% | +11.490% | −48% | 2,42 | 37 |
| 8% | +14.246% | −53% | 2,40 | 90 |

**Tamanho escolhe o risco, não a vantagem — e tem teto.** De 3% a 4,25% o Sharpe não
se mexe; dali para cima o caixa começa a recusar entrada e o Sharpe cai. O Momento
fica na queda máxima da regra anterior, e o turbo é 1,5x ele. (As recusas a 2% são o
mínimo de US$ 5 da Binance: a vendida mais agitada entra com ¼ do tamanho.)

**E a ressalva que manda, que a página mostra numa coluna própria: o lucro vem de
poucas moedas.** Tiradas as cinco que mais deram — TUT, BEAT, LAB, RAVE e LSK —, a
janela inteira cai de +5.928% para +833% e o fora, de +1.565% para +116%; o dentro
quase não muda (+216% → +224%). A segunda parcela entrou em 311 de 1.090 compras, e
foram essas que fizeram o lucro da perna: US$ 159 mil, contra US$ 89 mil perdidos
nas outras 779. É o formato de todo seguidor de tendência, e a tese só continua de
pé enquanto continuarem aparecendo monstras. Dos US$ 69.981 que a perna comprada
fez, US$ 49.407 vieram de moedas que hoje estão no painel: a intuição de que "as
manipuladas têm mais potencial" está medida aqui — e é também onde o risco se
concentra.

### A informação mais recente manda

A primeira versão do motor em TypeScript media +154% fora da amostra, contra +210%
da bancada. Comparado trade a trade, a diferença inteira estava em moedas que, no
mesmo dia, eram das que mais subiram em 30 dias **e** das que mais caíram em 14 — a
manipulada no meio do despejo, com a subida velha ainda na janela longa. A COAI em
29/10/2025: comprada, estopou em −25%; vendida, +80% em 14 dias. A BEAT em
01/01/2026: −25% contra +76%. Hoje a perna de janela mais curta escolhe primeiro, e
as duas medições batem (+600% contra +564%). O contraexemplo existe e fica escrito:
a AIA em 19/10/2025 foi vendida e estopou, e comprada teria feito +158%. Somado, a
regra melhora as duas metades.

### O Fluxo: um livro que não depende das monstras

Depois do momento, uma rodada de livros **diferentes**, medidos do mesmo jeito — o
modelo realista, dentro e fora da amostra, sem as 5 melhores, platô e ataque, a 3%
por posição com o alvo de volatilidade do Momento. Quase tudo reprovou, e fica
escrito:

| ideia | o que deu |
| --- | --- |
| coletar o financiamento na hora da cobrança | ≈0% por evento fora da amostra: desde 07/2025 o preço cai o que a cobrança paga. O +0,4% a +1,2% de dentro era, em parte, olhar o futuro nas moedas de cobrança horária — corrigido, some |
| carry: vender quem paga financiamento alto | −57% a −73% (é vender o momento) |
| comprar quem recebe financiamento | +23% a −13%; sem as 5 melhores, negativo |
| reversão de 1 e 3 dias, nos dois lados | −36% a −87% |
| loteria: vender o maior dia dos últimos 30 | dentro +14%, fora −23% |
| vender a listagem nova 1, 3 ou 7 dias depois | dentro +20% a +62%, fora negativo |
| vender a divergência "preço sobe, fluxo vende" | −19% a −30% |
| tamanho médio do negócio, volume que acorda | não passa em nenhuma direção |
| comprar o fluxo comprador | fora +62% a +215%, dentro −6% a −36% |
| fluxo e momento num score só | dilui o momento: +392% contra +611% |

**Passou o fluxo vendedor.** O volume de cada vela da Binance diz quanto foi compra
**a mercado** (o agressor comprador, *taker buy*). Nas moedas em que essa fração foi
a menor dos últimos 7 dias — a venda a mercado dominou —, o preço continua indo pior
que o resto. Sozinho o sinal é fraco (+73% a +107%, Sharpe 0,6 a 0,8) e escolhe moedas
diferentes das da vendida do Momento (13% de sobreposição). O que o fez virar livro
foi o **hedge**: cada venda vem com uma compra de ETH do mesmo tamanho, e a aposta
deixa de ser "o mercado cai" para virar "esta moeda vai pior que o ETH":

| fluxo vendedor, na bancada a 3%, sem o alvo | inteira | dentro | fora | sem as 5, fora | Sharpe |
| --- | --- | --- | --- | --- | --- |
| sem hedge | +107% | +54% | +34% | +12% | 0,78 |
| + BTC | +281% | +186% | +31% | +11% | 1,24 |
| **+ ETH** | **+271%** | **+90%** | **+93%** | **+64%** | **1,22** |
| + cesta das 10 maiores altcoins | +242% | +92% | +63% | +8% | 1,11 |
| vendida do Momento + ETH (controle) | +115% | +91% | +8% | −10% | 0,86 |

O BTC sozinho fez +59% nas mesmas datas, dentro da amostra (ele foi de 43 mil a 107
mil): o hedge de BTC infla 2024. O de ETH é o equilibrado. E o controle diz que o
lucro é do **fluxo**, não do hedge — a vendida do Momento com o mesmo ETH faz +8% fora,
e −10% sem as 5 melhores, contra +93% e +64% do fluxo. A bancada marca o hedge só na
saída, então a queda e o Sharpe dela são os de um vendido sem hedge enquanto a posição
está aberta; o motor marca as duas metades de hora em hora (abaixo).

Cada peça mexida sozinha ficou positiva nas três janelas e no "sem as 5": janela de
5, 10 e 14 dias (+99%, +176%, +143%); prazo de 7 e 21 (+114%, +252%); k de 3 e de 7
(+172%, +236%); stop de 30% e 60% (+211%, +268%); volume de 10 e 50 milhões (+239%,
+147%); hedge de 0,5 a 1,25 do nocional (+195% a +298%). E atacado — custo de entrada
4x +224%, escorregada dobrada +266%, entrada 1 h e 3 h atrasada +260% e +259%, custo
do hedge a 0,3% por lado +209% — também.

Medido com o motor que roda ao vivo e as regras da Binance, a **3% por posição**:

| | inteira | dentro | fora | queda máx | Sharpe | sem as 5 melhores: inteira · fora |
| --- | --- | --- | --- | --- | --- | --- |
| **Fluxo, 3%** | **+260%** | **+90%** | **+89%** | **−22%** | **1,60** | **+214% · +69%** |

1.571 pares, nenhum hedge liquidado (a 2x, o ETH precisaria cair 49,5% em 14 dias;
em 2024–2026 o pior foi −42,6%). Ganha em 8 de 11 trimestres.

**O alvo de volatilidade não passou nele**, do mesmo jeito que no Caça-monstra. Na
mesma queda máxima (2% com ele, 3% sem, medido antes das regras da Binance) ele
melhora o dentro (+90% → +104%, com o Sharpe igual: 1,55 e 1,56) e piora o fora
(+91% → +84%, Sharpe 1,65 → 1,51). O Sharpe da janela inteira sobe por mudar a aposta
de lugar entre as metades, não por melhorar nenhuma delas. Com as regras da Binance é
pior ainda para o alvo: a 2% de base o ETH do par fica abaixo do mínimo de US$ 20
sempre que o alvo encolhe a aposta, e o fora cai para +37%.

**Por que 3%:** cada par prende margem nas duas metades, e acima disso o caixa começa
a recusar entrada — a 3,5% são 59 recusas e Sharpe 1,55, a 4% são 199 e 1,54. E abaixo
dele a Binance não deixa: a ordem de ETH tem de ter US$ 20, e a 2% de uma conta de US$
1.000 ela fica abaixo disso assim que a conta passa um centavo de US$ 1.000 para baixo
(o lote do ETH arredonda para baixo) — medido, o robô não abriu um par sequer. A 2,5%
são 33 recusas e Sharpe 1,57.

**O que ele é e o que não é.** Rende bem menos que o Momento. A virtude é outra, e
está medida: o lucro dele não mora em cinco moedas — sem as 5 melhores sobram 82% do
lucro, contra 14% no Momento — e ele anda por outro caminho: correlação diária de
**0,10** com o Momento e **−0,24** com o Caça-monstra. Nos 99 dias em que o Momento
caiu mais de 3% (−4,6% na média), o Fluxo fez −0,6%. Se as monstras pararem de
aparecer, o Momento seca; o Fluxo não depende delas.

### A arena

Quatro robôs com US$ 1.000 cada, ao lado da carteira do painel:

- **Momento** — o livro acima, a 4,25% por posição antes do alvo de volatilidade.
- **Momento turbo** — o mesmo livro a 6,375% (1,5x): a resposta medida a "e se arriscasse
  mais?", com a queda de −46% que vem junto.
- **Caça-monstra** — só a perna comprada, as 3 que mais subiram em 30 dias,
  aceitando moeda de US$ 5 milhões. É a tese das manipuladas pura: +189% fora da
  amostra, **−3% dentro**, queda de −37%. Os 45 dias e a pirâmide foram medidos
  nele também e não entraram: o fora melhora (+188% → +554%), o dentro piora (−4%
  → −17%). A saída por posto e o alvo de volatilidade também não: na mesma queda,
  o alvo melhora o dentro (−4% → +3%) e piora o fora (+189% → +163%).
- **Fluxo** — o livro acima: vende as 5 em que a venda a mercado mais dominou os
  últimos 7 dias, cada uma em par com ETH, por 14 dias, a 3% por posição e sem o
  alvo de volatilidade.

Cada posição sai pela regra com que entrou — stop, rastro, prazo, pirâmide e saída
por posto moram nela —, e a regra nova vale para as entradas. O alvo de volatilidade
só liga com 40 dias de curva: até lá, o tamanho é o base.

`npm run robos` roda a cada retrato do workflow. Para cada posição aberta, percorre
as velas de 1 h fechadas desde a última rodada — stop, rastro, prazo, liquidação e
a segunda parcela disparam na hora em que aconteceram, mesmo que o workflow tenha
ficado horas parado, porque são ordens paradas na corretora —, e cobra o
financiamento de cada intervalo da moeda. No primeiro retrato de cada dia UTC, faz o
ranking da praça inteira, fecha as que deixaram o top 10 e abre a seleção **no preço
de agora**: a medição entra e sai na abertura da meia-noite pagando o atraso medido. Dia inteiro sem retrato vira dia
perdido, e a seleção dele não é feita depois — escolher hoje o que valia ontem seria
escolher sabendo o que veio depois. Um resumo por dia vai ao Telegram.

**A régua de custo é mais cara que o livro, e isso agora é conferido.** O motor cobra
a taxa de 0,05% mais uma escorregada por faixa de volume — 0,05% acima de US$ 50
milhões por dia, 0,10% de 10 a 50, 0,20% de 3 a 10. Lido o livro de ofertas dos 271
perpétuos com US$ 3 milhões ou mais na tarde de 08/10, uma ordem a mercado de US$ 30
a US$ 1.000 custava, por lado e sem a taxa, 0,007% a 0,015% na faixa de cima, 0,013%
a 0,031% na do meio e 0,021% a 0,051% na de baixo (medianas; p90 até 0,08%) — a régua
cobra de 3 a 7 vezes isso. Ela não mudou: a foto foi de uma tarde, e o robô entra
logo depois da meia-noite UTC. Cobrar o livro daquela tarde renderia +1.296% na regra
da manhã, contra +1.255% — 3% a mais, não uma regra nova. Desde agora **cada entrada
ao vivo lê o livro** da moeda e guarda o custo dele ao lado do da régua, e a página
mostra a comparação: a régua só muda com essa amostra na mão.

**O que eles não cobram**: o fato de a Binance não deixar abrir alguns desses
perpétuos em certas contas e regiões, e o tempo entre a decisão e a ordem quando o
retrato atrasa mais que o medido. Não é recomendação: é a medição continuando ao
vivo.

### Dá para fazer na vida real? (09/10)

A pergunta passou a ser essa, e ela mudou o motor. Até 09/10 ele usava **0,5% de
margem de manutenção para toda moeda**. A tabela de degraus da Binance é pública e não
pede chave (`/bapi/futures/v1/friendly/future/common/brackets`), e diz outra coisa: das
525 moedas, 149 pedem 5% no primeiro degrau e 203 pedem 2,5%; as que fizeram o lucro
do Momento (TUT, BEAT, RAVE, MYX, AKE) pedem 5% até US$ 10 mil e 10% daí até US$ 60
mil. Vendida a 2x numa delas, **a corretora liquida em +42,9%, antes do stop de 45%**.
Com 5% em toda moeda e nada mais mudado, o Momento perderia 242 vendidas para a
liquidação (+5.969% → +4.404%).

O motor agora faz o que uma conta de verdade faz, com as regras de cada moeda guardadas
na posição:

- **margem a mais** onde a manutenção é alta, até a liquidação ficar 4 pontos depois do
  stop (`alavancagemSegura`) — 1.266 de 1.298 vendidas do Momento, 1,86x em média;
- a **liquidação pela fórmula da margem isolada**, com o desconto do degrau e o
  financiamento saindo da margem — como na Binance;
- a **margem reposta de hora em hora** quando o financiamento a come (`reporMargem`).
  Sem isso sobravam 15 vendidas liquidadas, todas pelo financiamento: a DRIFT de
  02/04/2026 pagou 98% da margem em 4,8 dias e foi liquidada com o preço caindo;
- o **lote e o mínimo** de cada moeda (`MARKET_LOT_SIZE`, `MIN_NOTIONAL`): o ETH pede
  US$ 20 por ordem, e a QNT só aceita múltiplos de ~US$ 25.

| com as regras da Binance (tabela de 09/10) | sem | com |
| --- | --- | --- |
| Momento | +5.969% | **+5.928%** |
| Momento turbo | +10.537% | **+10.307%** |
| Caça-monstra | +176% | **+177%** |
| Fluxo | +262% | **+260%** |

Nenhuma liquidação nos quatro. A tabela é a de hoje aplicada ao passado: a Binance não
publica o histórico dela, e a medição guarda a que usou, com a data. Moeda deslistada
usa a tabela das manipuladas, a mais dura das comuns.

**O que a medição ainda supõe, e a vida real cobra:**

- **Um robô que rode toda hora.** O rastro de 30% não existe como ordem na Binance — a
  ordem nativa de stop móvel vai até 10% (`callbackRate`) —, então o robô precisa
  mover o stop; a reposição de margem também é dele. Medido com o rastro movido só de
  tempos em tempos, o Momento faz:

  | o robô move o rastro a cada | 1 h | 2 h | 4 h | 8 h |
  | --- | --- | --- | --- | --- |
  | Momento, janela inteira | **+5.928%** | +5.439% | +4.149% | +3.620% |

  O dentro da amostra quase não muda; o que se perde é o fora, onde as monstras devolvem
  o ganho entre uma passada e outra. O GitHub Actions deste projeto já ficou 4,7 horas
  parado: para dinheiro de verdade, é uma máquina ligada.
- **As regras foram escolhidas olhando 2024–2026 inteiro.** A medição é otimista por
  construção, e nenhum ajuste aqui conserta isso — o teste limpo é o ao vivo. Por isso
  cada cartão da página mostra a **faixa medida para a idade do robô**: em quantas
  janelas do mesmo tamanho, oito em cada dez terminaram entre dois números, e se o ao
  vivo está dentro, acima ou abaixo. Meses fora da faixa é a medição falhando na vida
  real.
- **As quedas.** −36% no Momento e −46% no turbo aconteceram na medição e voltam a
  acontecer.
- **O capital.** Com US$ 1.000 as ordens já encostam no mínimo da Binance: a vendida
  mais agitada do Momento entra com ~US$ 11, e o Fluxo só opera a partir de 3% por par —
  a 2%, medido, ele não abre um par sequer.

**Para ligar com dinheiro de verdade** seria preciso uma conta de futuros da Binance
onde ela for permitida, uma chave de API só de negociação (sem saque), uma máquina que
rode o robô toda hora, margem isolada e uma subconta por robô. Este projeto não faz isso
e não vai fazer — ele não usa chave nenhuma, por desenho. O que ele faz é medir, ao vivo,
se a regra continua funcionando.

### A mesa de risco: o que um fundo perguntaria (10/10)

O pedido foi "como um quant de fundo faria". Um fundo não pergunta só quanto a regra
rende: pergunta quanto ela arrisca e com que intervalo, se o resultado sobrevive à
quantidade de ideias testadas até achá-la, se escolher a regra em tempo real teria
funcionado, quanto dinheiro ela aguenta e o que acontece quando os livros se juntam. As
funções estão em `lib/quant.ts` (puras, travadas por `npm run testar-quant`), `npm run
medir-robos` as roda sobre o mesmo motor e grava o resultado em `quant` de
`data/robos-medicao.json`, e a página mostra tudo na "mesa de risco", embaixo dos robôs.

**O Sharpe é sorte?** As regras deste repositório saíram de ~240 variações escritas nos
comentários de `lib/robos.ts` e de outras que a primeira bancada testou sem anotar — 300,
contadas por baixo. Com 300 tentativas SEM vantagem nenhuma, a melhor delas mostraria em
997 dias um Sharpe anual de 1,75 só por acaso (Bailey e López de Prado, 2014). Cada livro
foi remedido numa grade das peças que a pesquisa de fato mexeu: o Momento em 144
variações (janela da compra 30/45/60 dias × da venda 7/14/21 × saída por posto ×
pirâmide × alvo de volatilidade × vendida pela volatilidade), o Fluxo em 108 (janela
5/7/10/14 × k 3/5/7 × prazo 7/14/21 dias × stop 30/45/60%).

| | Momento | Fluxo |
| --- | --- | --- |
| a publicada na grade, por Sharpe | **1ª de 144** | 4ª de 108 |
| Sharpe: publicada · mediana da grade · pior | 2,54 · 1,61 · 1,01 | 1,60 · 1,13 · 0,51 |
| Sharpe deflacionado, 300 tentativas | **93%** (passa no limite) | **40%** (reprova) |
| PBO, 12.870 partições (0,5 é sorteio) | 0,13 | 0,37 |
| escolhendo em tempo real, 10/2024–09/2026 | +977% (Sharpe 2,32) | +188% (1,96) |
| a publicada nos mesmos dias | +6.126% (3,21) | +249% (2,00) |
| dias de ao vivo para afirmar Sharpe > 0 (95%) | 118 | 367 |

"Escolhendo em tempo real" é o walk-forward: a cada trimestre, a variação da grade com o
melhor Sharpe nos 365 dias anteriores, sem saber o que vinha. **É o número que importa
para quem liga hoje.** O Momento sobrevive à deflação, todas as 144 variações dele são
positivas e escolher pelo passado ajuda (PBO baixo) — mas a publicada é a melhor de 144,
e quem a escolhesse às cegas faria +977% onde a medição mostra +6.126%, quase o mesmo da
variação do meio da grade nos mesmos dias (+902%). O +5.928% da janela inteira é o teto
de quem escolheu depois de ver. O Fluxo **não** sobrevive: o Sharpe 1,60 dele é o que a
melhor de 300 ideias sem vantagem já mostraria. A família inteira é positiva e o
walk-forward faz +188%, então a vantagem é plausível — mas não está demonstrada.

**A ficha de risco**, na curva de um ponto por dia, com o intervalo de 95% do bootstrap
estacionário (Politis e Romano, 1994: 2.000 séries sorteadas em blocos de 20 dias em
média, que guardam as sequências de alta e de queda):

| | retorno ao ano | Sharpe | queda máx | dias abaixo do pico | beta ao BTC |
| --- | --- | --- | --- | --- | --- |
| Momento | +348% [+96% a +942%] | 2,54 [1,37 a 3,60] | −30% [−54% a −24%] | 301 | −0,28 |
| Fluxo | +60% [+10% a +135%] | 1,60 [0,47 a 2,76] | −21% [−43% a −17%] | 201 | −0,03 |
| **Fundo** | +149% [+64% a +277%] | 2,85 [1,66 a 3,99] | −17% [−31% a −13%] | 145 | −0,11 |
| BTC comprado | +27% [−26% a +124%] | 0,73 [−0,39 a 1,98] | −53% [−76% a −28%] | 359 | — |

A queda de −30% do Momento vira −54% numa ordem ruim dos mesmos dias: é esse número, e
não o medido, que decide o tamanho de uma conta de verdade. Ele ganha em 44% dos trades,
com ganho médio de +27% do nocional contra perda média de −20% (fator de lucro 1,37), e
anda contra o BTC — a vendida paga no pânico.

**O fundo.** Momento e Fluxo em subcontas, o capital repartido todo dia 1º pelo inverso da
volatilidade de 90 dias de cada livro (`paridadeDeRisco`), só com o que se sabia na véspera
e só com o **caixa livre** de cada subconta — margem de posição aberta não sai sem fechar a
posição, e em 1 dos 33 rebalanceamentos o acerto ficou pela metade até o mês seguinte. O
Fluxo, que oscila menos, fica com 58% a 77% do capital.

| | inteira | dentro | fora | queda máx (diária) | Sharpe | sem as 5: inteira · fora |
| --- | --- | --- | --- | --- | --- | --- |
| **Fundo** | **+1.114%** | +149% | +369% | **−17%** | **2,85** | +531% · +139% |
| Momento | +5.928% | +216% | +1.565% | −30% | 2,54 | +833% · +116% |
| Fluxo | +260% | +90% | +89% | −21% | 1,60 | +214% · +69% |

Sharpe maior que o dos dois livros nas duas metades (dentro 2,04 contra 1,56 e 1,55; fora
3,67 contra 3,39 e 1,63), metade da queda, e no positivo em 5 dos 6 piores dias do BTC na
janela (no de −14% de 05/02/2026, +1,3%). A janela é platô: 60, 90 e 180 dias dão Sharpe
2,80, 2,87 e 2,88 (na conta sem a trava do caixa). **E sobrevive à escolha às cegas:** com cada livro na variação que o
walk-forward escolheria, de 10/2024 a 09/2026, o Momento faz +977% (Sharpe 2,32, queda
−28%), o Fluxo +188% (1,96, −20%) e **o fundo deles +371% (2,87, −11%)** — Sharpe acima
dos dois e a menor queda. É o argumento de um fundo multiestratégia: ele não depende de
ter acertado a melhor variação de cada livro.

**O que ele não é: mais lucro na mesma queda.** Com os dois livros a 2x o tamanho, cada um
na sua subconta, a queda chega a −30% — a do Momento — e o fundo faz +2.570% contra
+5.928% do Momento sozinho; a 1,5x, +1.872% com −23%. O caixa recusa 1.233 entradas a 2x,
porque cada par do Fluxo prende margem nas duas metades. Medido e não entrou: o
Caça-monstra como terceiro livro (Sharpe igual, 2,88 contra 2,87, as duas contas sem a
trava do caixa; queda −15% contra −17%; mas dentro +96% contra +156%).

**Quanto dinheiro cabe.** O mesmo livro começando com mais capital, com o impacto de
mercado pela lei da raiz quadrada (Tóth et al., 2011; no Bitcoin, Donier e Bonart, 2015):
quem compra Q dólares de uma moeda que negocia V por dia paga perto de Y × σ × √(Q/V),
com σ o desvio diário dela, Y = 1 e V o volume médio de 7 dias — mais as regras da Binance
com posição grande, que baixam a alavancagem máxima e põem teto no tamanho de cada moeda
(US$ 5 milhões nas que fizeram o lucro do Momento):

| começando com | Momento | Sharpe | impacto por lado | Fluxo | Sharpe |
| --- | --- | --- | --- | --- | --- |
| US$ 1 mil | +5.611% | 2,51 | 0,03% | +254% | 1,58 |
| US$ 100 mil | +2.670% | 2,15 | 0,27% | +220% | 1,47 |
| US$ 1 milhão | +1.439% | 1,83 | 0,69% | +154% | 1,21 |
| US$ 5 milhões | +403% | 1,23 | 1,10% | +78% | 0,81 |
| US$ 20 milhões | +96% | 0,70 | 1,68% | +14% | 0,31 |
| US$ 100 milhões | −50% | −0,15 | 2,19% | −51% | −0,74 |

**A capacidade é pequena**: as monstras que fazem o lucro negociam dezenas de milhões por
dia, e quem entra nelas com milhões move o preço contra si. Com metade do impacto (Y =
0,5, o otimista da literatura), o Momento com US$ 5 milhões faz +1.214% (Sharpe 1,82).
Com os US$ 1.000 da arena o impacto custa 0,03% por lado (+5.928% → +5.611%), menos do
que a régua de custo já cobra a mais — e por isso a medição publicada não o cobra.

## O ciclo, em quatro estágios

Tirado de dois ciclos completos — o LAB, que topou em 02/06, e a BTW, em 19/08.
A ordem é mecânica, não estatística:

1. **Aperto** (dias a semanas) — o float sai das corretoras e o livro seca. No
   LAB o saldo somado caiu 95% em duas semanas enquanto o preço triplicava.
2. **Alta a crédito** (horas) — a subida final vem de alavancagem ou de vendidos
   sendo espremidos. **É o pior momento possível para entrar vendido.**
3. **Saída da baleia** (0 a 48h) — as contas grandes desmontam comprado com o
   preço ainda na máxima. Na BTW foi às 09h UTC, na hora exata do topo.
4. **A oferta volta** — o gatilho, e o único obrigatório: para vender numa
   corretora é preciso depositar antes. No LAB isso foi 1% do supply indo e
   voltando no dia exato da máxima.

## Garimpar o universo inteiro

A watchlist tem 73 moedas e todas entraram porque alguém as viu em algum lugar.
O limite disso é óbvio: o painel só acha padrão em moeda que já está nele, e o
padrão que ele procura acontece o tempo todo em moeda que ninguém apontou. São
526 perpétuos USDT em negociação na Binance; a lista cobre 14% deles.

`npm run garimpar` peneira os 526 — três requisições largas mais uma de velas
por moeda, cinco segundos no total — e devolve o que se parece com o objeto de
estudo. `npm run aferir-garimpo` é a medição que sustenta o gatilho, refeita do
zero: 200 dias de velas diárias de todos os perpétuos, com a metodologia do
placar.

**O sinal é o mais forte já medido neste projeto.** Retorno de 7 dias à frente,
95.141 observações de 523 moedas, referência de −0,96%:

| alta do dia | n | mediana 7d | vs referência | moedas a favor |
| --- | --- | --- | --- | --- |
| caiu | 50.054 | −0,65% | +0,31 p.p. | 310/523 |
| 0 a 10% | 41.107 | −1,08% | −0,12 p.p. | 300/523 |
| 10 a 25% | 3.146 | −4,75% | −3,79 p.p. | 301/430 |
| 25 a 50% | 625 | −12,68% | −11,72 p.p. | 102/139 |
| 50 a 100% | 169 | −22,00% | −21,04 p.p. | 26/40 |
| +100% | 40 | −51,32% | −50,36 p.p. | 5/6 |

É monotônico em toda a escala, igual no horizonte de 14 dias, e aparece nas duas
metades da janela separadamente (−12,57 e −14,75 p.p. no corte de 25%). Para
comparação, os vieses que o painel emite separam +0,01 e +0,02 p.p. O viés de
sobrevivência corre a favor da conclusão: o universo é quem está listado hoje,
então as moedas que bombaram e foram deslistadas — as de pior desfecho — ficaram
de fora.

**E ele não vira call, porque o caminho até a queda mata a posição.** Vendido a
partir do dia da alta, com custo e o financiamento real da Binance dentro:

| stop | alvo | stop | prazo | média | mediana | moedas com mediana + |
| --- | --- | --- | --- | --- | --- | --- |
| +25% | 21% | 55% | 24% | −1,30% | −24,95% | 58/152 |
| +40% | 26% | 41% | 34% | −1,67% | +8,37% | 75/152 |
| +60% | 29% | 30% | 41% | −1,98% | +13,43% | 98/152 |
| +100% | 31% | 18% | 50% | −2,72% | +16,27% | 114/152 |

A mediana é boa e **a média é negativa em toda largura de stop**: ganha-se pouco
com frequência e perde-se muito de vez em quando, que é o perfil que quebra
conta alavancada. Com o stop de 25% que a carteira usa, 55% das entradas estopam
antes de qualquer coisa acontecer e a mediana do desfecho é o próprio stop. Só
os gatilhos extremos viram média positiva, e neles a amostra some junto — alta
≥50% num dia dá +1,56% com n=202 e 22 de 46 moedas.

**Do lado comprado não há o que garimpar.** "Comprar a derretida", que é a regra
de compra do painel, testada sobre o universo com a mesma máquina, piora quanto
mais fundo a queda: caiu ≥50% do pico dá mediana −1,13% com 213 de 395 moedas;
caiu ≥85% dá média −0,76%; caiu ≥95% dá −2,43% com 2 de 17. O que faz uma moeda
subir do zero não está no preço, e este projeto não tem como ler o X.

Então o garimpo é uma **fila de investigação**, e a página diz isso em cima da
tabela. Nenhuma moeda entra na análise completa sozinha: o próximo passo é
sempre `npm run descobrir`, porque identificar o token errado é o erro mais caro
daqui e já foi cometido duas vezes.

## RSI, suporte, OI, smart money: medidos

A pergunta veio de fora — "dá para achar trade com RSI, resistência, modelo
estatístico, open interest, smart money?" — e nada disso tinha sido medido aqui.
`npm run medir-sinais` mede sobre os 528 perpétuos, até mil dias de cada: 319 mil
moeda-dias. Cada sinal é comparado com a mediana de TODAS as moedas no mesmo dia
(senão "comprar RSI baixo" mediria o mercado subindo), conta um evento por
episódio, aparece nas duas metades ou não conta, e é simulado como trade com
stop, custo e funding.

| sinal | 7 dias contra o mercado | moedas a favor | como trade |
| --- | --- | --- | --- |
| RSI < 30, comprar | −0,03 p.p. | 253/471 | ~0 |
| a menos de 3% do suporte, comprar | +0,02 | 257/519 | −0,7% |
| tendência (EMA20 > EMA50), comprar | −0,15 | 205/497 | −0,6% |
| **rompeu a máxima de 20 dias, comprar** | **−0,84** | 195/498 | −0,5% |
| **volume 3x na alta, comprar** | **−2,22** | 152/512 | −0,9% |
| **funding ≤ −0,1%/8h, comprar o squeeze** | **−4,94** | 16/63 | — |
| RSI > 80, vender | +3,23 | 136/226 | +0,7% |
| pump ≥ 25% no dia, vender | +8,51 | 236/334 | −0,3% |
| smart money compra e varejo vende | +0,39 (p = 0,21) | 68/122 | — |

**Nenhum sinal de compra clássico funciona nestas moedas, e três funcionam AO
CONTRÁRIO.** Rompimento, volume na alta e funding negativo são anti-sinais: quem
compra o rompimento perde para o mercado, e quem aposta no squeeze dos vendidos
perde quase 5 pontos em uma semana — quem está vendido costuma ter razão. O que
tem efeito é vender o exagero, e é o mesmo resultado do garimpo: a direção
acerta, o trade não paga.

Um recorte parecia a exceção: vender RSI > 80 em moeda de 30 a 100 milhões, com
+2,5% por trade e stop de 2σ, positivo nas duas metades. **Atacado, caiu.** A
mediana por trade é −8%, o resultado ajustado ao risco é +0,04 R, a faixa de 20 a
150 milhões dá negativo, a de 100 a 200 também, o trimestre de agora é negativo,
e 69 de 136 moedas terminam no positivo. Era sobreajuste de faixa, e a seção 3
do script imprime o ataque a cada rodada.

OI e razões de posição só existem para 30 dias na Binance, e com isso nenhum
sinal deles tem amostra para afirmar nada.

### O fluxo da carteira quente da Binance — e as duas portas dele

O que sobra de "smart money" é o on-chain: quem está MOVENDO moeda, e não quem
está apostando. A carteira `0x73D8…46Db` é o contrato quente da Binance na BNB
Chain, e ela guarda boa parte do que circula de várias moedas pequenas — 70% da
LYN, 59% da TRADOOR, 53% da STAR, medido em 23/09.

**A primeira leitura dela saiu invertida, e o motivo vale registrar.** No dia em
que a TAKE subiu +221%, entraram US$ 8,75 mi dela na carteira em 24 horas. Lido
como fluxo de corretora, era holder depositando para vender — distribuição. Só
que 97% das transferências que entram e 93% das que saem têm uma única
contraparte, o contrato `0x6aba…1b90`, em 194 tokens. Seguindo a TAKE, o padrão
é sempre o mesmo, na mesma transação: a pool da PancakeSwap manda para ele, e
ele repassa para a quente — 3.699 vezes em meia hora. É o **executor de swap**:
o cliente compra pelo app, a Binance compra na pool, a moeda cai na custódia.
Aquela entrada era, em grande parte, **cliente comprando no meio do pump**.

Então o fluxo tem duas portas, e elas dizem coisas opostas:

| porta | o que é | medido na TAKE, 1 hora de 23/09 |
| --- | --- | --- |
| executor de swap | varejo da Binance comprando/vendendo na DEX | +US$ 2,13 mi de compra líquida (3,0% do mcap) |
| direta | depósito e saque — o fluxo clássico | +US$ 1,13 mi de depósito líquido (1,6%) |

`npm run fluxo-binance` grava as duas separadas, por moeda com perpétuo, cortando
as janelas na meia-noite UTC. Toda janela registra a contraparte dominante: se
a Binance trocar de executor, o novo cairia calado na porta de depósito e o
sinal mudaria de sentido sem nada quebrar — a auditoria reprova isso.

**Só existe para frente, e agora pelo motivo certo.** O único nó gratuito que
serve esse tipo de consulta na BNB Chain guarda uma janela rolante de ~100
horas — medido em 23/09 por busca binária. O comentário do código dizia "desde
2025-11-10", que era verdade em 02/09 e deixou de ser sem aviso. Foram
semeadas as ~96 horas que o nó ainda tinha; daí em diante o gravador roda no
retrato de fechamento, e buraco maior que quatro dias é dado perdido.

A seção 4 do `medir-sinais` testa as duas portas com os lados escritos ANTES de
haver dado: depósito líquido ≥ 1% do market cap → vender; compra líquida de
varejo na DEX ≥ 1% → vender; os espelhos → comprar. Até ter 30 eventos em 10
moedas, com 7 dias de preço à frente de cada, ela diz "amostra insuficiente".

### As moedas em vista: a carteira da Binance aponta, o painel acompanha

A lista tem as moedas que alguém apontou. A pergunta foi se passar por esta
carteira bastava para uma moeda merecer o painel sem ninguém apontar — e foi
medida antes de virar código, sobre 200 velas diárias dos 528 perpétuos,
**cortadas em 17/09**, antes de a carteira começar a ser lida (19/09): os pumps
contados aconteceram antes, não são a carteira pegando o pump em andamento.

| dias de alta ≥25% por mil moeda-dias | todas | vol. pequeno | médio | grande |
| --- | --- | --- | --- | --- |
| passaram pela carteira, fora da lista (40) | 16,7 | 9,5 | 19,0 | 22,7 |
| passaram pela carteira e estão na lista (29) | 43,2 | 15,6 | 34,5 | 56,4 |
| na lista, sem passar pela carteira (41) | 25,6 | 15,6 | 23,3 | 28,0 |
| resto da Binance (414) | 4,4 | 2,7 | 5,7 | 5,3 |

Entre parênteses, as moedas com 30 dias de série ou mais. As de fora da lista
bombam **3,8 vezes** mais que o resto, nos três terços de
volume e nas duas metades da janela (20,3 contra 5,3; 12,7 contra 3,6). E caem
junto: dia de −25% ou pior é 6,6 por mil contra 1,0. É a assinatura do objeto
deste painel. Não é "a maioria das manipuladas" — as 70 são 13% da praça e têm
40% dos dias de alta ≥25% —, é concentração, três vezes o peso delas.

Então elas **entram sozinhas**: todo perpétuo que o gravador identifica e não
está na lista vira linha do painel, com a leitura inteira, marcada "em vista", e
sai depois de 30 dias sem passar pela carteira (higiene, não medido). A
identificação parte do CONTRATO que a Binance custodia e exige o preço da pool
batendo com o do perpétuo — a direção oposta da busca por nome que já errou duas
vezes. Aposentada não volta por aqui. O Telegram avisa cada uma que entra.

**O que isso não mede é vantagem.** Depois do pump elas caem como o resto do
garimpo (mediana de −15,9% em 7 dias, 21 de 28 moedas), e vender isso perde
dinheiro. A carteira fictícia opera as calls delas como as da lista, com a
origem gravada em cada linha do histórico, e a tela separa o resultado das duas.
É ela que vai dizer se as em vista se comportam diferente.

**E a tese é conferida para frente.** A medição acima olha o passado de moedas
escolhidas pelo fluxo de cinco dias; o que ela prevê é que elas continuem
bombando mais DAQUI EM DIANTE. O `npm run garimpar` já baixa as velas diárias da
praça inteira, e com elas conta, desde 24/09, os dias de alta ≥25% de toda moeda
que esteve em vista — a partir do dia seguinte à primeira passagem, porque o
dia da chegada costuma ser o pump que a trouxe — contra o resto da praça. A
página mostra os dois números com a amostra ao lado; a comparação começa a
valer perto de mil moeda-dias em vista (~25 dias com 41 moedas: a 16,7 contra
4,4 por mil, ~17 dias de alta contra ~4).

**E elas trouxeram à tona um defeito que estava em todas.** O endereço de um
token no DexScreener devolve também as pools em que ele é a moeda de PAGAMENTO,
e nelas o preço é o da outra moeda. A AIOT entrou lendo o preço da AIT — 0,01846
contra 0,05025, 2,7 vezes fora, abaixo do freio de 100 vezes — e a carteira
abriu posição nele; a marcação ao vivo, que usa o perpétuo, a mostrava
multiplicada por seis. Das 78 moedas com contrato, 35 aparecem como pagamento em
alguma pool e 2 tinham essa como a mais funda, as duas em vista. Hoje a
profundidade só conta pool em que a moeda é a base.

## Identificar a moeda certa

O erro mais caro deste projeto foi analisar o token errado — duas vezes. Buscar
um ticker pelo nome devolve o mercado inteiro de homônimos. `npm run descobrir`
aplica os dois testes que resolvem isso:

- **O preço à vista bate com o do perpétuo** (dentro de 10%). Entre o mesmo
  ativo a arbitragem não deixa a diferença crescer; um homônimo erra por
  dezenas ou milhares de por cento.
- **A pool gira** pelo menos 1% do próprio tamanho por dia. O VVV aparecia com
  US$ 775 milhões de liquidez e volume ZERO — pool decorativa, que não absorve
  venda nenhuma.

Os dois juntos corrigiram três identificações que o primeiro sozinho errava.

Ticker curto derrota a busca — procurar "C" devolve o mercado inteiro. Para esses,
`npm run descobrir C=chainbase` busca pelo nome do projeto.

**Quando não há pool nenhuma, quem identifica é a custódia.** A HEI não tem par
em DEX alguma: os dois testes não têm em que rodar, e a busca por ticker devolve
três "Heima" na Solana com US$ 195 milhões de liquidez declarada, US$ 115 mil de
volume e 38% de erro no preço — pool decorativa clássica. O que resolveu foi
olhar quem guarda: na Ethereum a carteira fria da Binance carrega 30 milhões
redondos do contrato, e na BNB Chain, onde o mesmo endereço existe, todas as
carteiras de corretora estão zeradas. Corretora não custodia a moeda errada, e
esse teste vale para qualquer moeda que negocie só em livro central.

## Aposentar uma moeda

Moeda que morreu sai das análises sem sair da lista: basta preencher
`aposentada` na entrada dela em `lib/watchlist.ts`. Ela some do painel e do
monitor e para de consumir requisição, mas o contrato conferido, a rede e o
histórico continuam ali — e volta apagando uma linha.

A decisão é **sempre manual**. Existe o estágio "exausta" e seria tentador
aposentar sozinho quem cair nele, mas o backtest mostrou que exausta é
justamente a fase de melhor retorno adiante: uma moeda que caiu 80% pode estar
morta ou pode estar na véspera de um segundo ciclo. Quem decide é quem olha.

Os scripts de medição (`backtest`, `parametros`) usam a lista cheia de propósito:
para medir a régua, moeda morta é amostra tão boa quanto viva.

## O alerta de oferta chegando ao livro

Vale para **qualquer** moeda, mapeada ou não, e é o único número on-chain nessa
condição: carteira de corretora é endereço externo, e endereço externo tem o
mesmo valor em toda rede EVM. Não é preciso conhecer nenhuma carteira do projeto
para saber quanto do supply dele está pousado num livro de vendas.

São duas leituras da mesma coisa. A **fração do supply em corretora** é o estado,
e responde "isso é grande para ESTA moeda?" sem depender de liquidez, que em pool
decorativa mente. A **transferência** é o evento: chega com minutos de vida e
nomeia quem enviou.

A ordem entre as duas foi decidida por medição, não por gosto: varrer três horas
da BNB Chain filtrando as carteiras levou 377 segundos numa moeda só, e ler o
saldo custa uma chamada. Então o saldo decide se vale procurar quem enviou —
e na maioria dos ciclos não vale, porque nada chegou. O ciclo completo das 42
moedas leva 31 segundos.

A lista de carteiras tinha um buraco que só aparecia na Ethereum: as seis
originais foram levantadas na BNB Chain, e lá as carteiras QUENTES — por onde a
oferta chega ao livro — ficaram todas de fora. O PORTAL marcava 11,6% e são
59,6%, o EPIC 29,8% e são 57,8%, o BASED marcava ZERO. São dezessete agora, e
cada uma passou por um teste que não depende de rótulo de terceiro nenhum:
tesouraria guarda o próprio token, custódia guarda o de todo mundo, então conta-se
em quantas moedas **não relacionadas** da lista o mesmo endereço aparece com
saldo. A mais presente aparece em 22 das 33.

## Alertas

`npm run monitor` roda um ciclo e manda o que achou para o Telegram. O trabalho
é dividido por custo: o perpétuo custa uma requisição por moeda e roda para
todas; a leitura de rede custa dezenas e roda só para as moedas com carteira
mapeada, porque é a única situação em que ela diz mais do que "houve
transferências".

Cada regra tem janela de silêncio própria e piso de relevância. O alerta de
saída de baleia carrega o próprio placar dentro da mensagem: em 6 episódios
medidos, 3 caíram mais de 8% em 24 horas e 5 em 48 — o modo de errar dele é
chegar cedo, não errar a direção.

**A carteira fictícia também avisa.** Cada posição que ela abre ou fecha vira uma
mensagem — lado, força, entrada, stop, liquidação e a leitura do painel na
abertura; motivo, resultado em dólar e dias no fechamento —, com "carteira
fictícia · não é recomendação" na segunda linha, porque o placar ainda mede que
os vieses não têm vantagem. A carteira é recalculada inteira a cada retrato, e
quando uma regra muda o passado inteiro muda junto; por isso só vira aviso o que
aconteceu desde o retrato anterior e ainda não foi avisado, com a memória no
próprio `carteira.json`. Aviso recusado pelo Telegram é tentado de novo por até
6 horas. A primeira mensagem, quando o recurso liga, diz que ligou — é também o
teste de que o bot fala com a conversa certa.

**Quando parece que o bot parou**, o log do Actions diz se ele falou: em 23/09,
entre 12:45 e 16:43 UTC, uma única execução mandou 18 alertas e o Telegram
aceitou todos. Se não chegou, a conversa configurada em `TELEGRAM_CHAT_ID` não é
a que está sendo olhada — `npm run telegram-setup` descobre o identificador certo.

## O retrato pré-calculado

Montar o panorama leva vinte segundos — dez arquivos do Data Vision por moeda,
mais o saldo em corretora de cada uma. Função serverless costuma ser cortada em
dez, então a página não estava lenta: estava a um cold start de não abrir.

`npm run panorama` calcula e grava em `data/panorama.json`; o workflow roda isso
uma vez por execução e devolve o arquivo ao repositório. A página lê em três
camadas — GitHub raw (fresco sem deploy), disco (congelado no build), cálculo ao
vivo (caro, mas nunca falha) — e mostra na tela quando o retrato foi tirado.
Dado velho apresentado como atual é pior do que dado ausente. Resultado: 20,9s
para 0,10s.

As três camadas cobriam o arquivo SUMIR e não cobriam o arquivo ESTAR VELHO, que
é o que de fato acontece: o cron pede duas execuções por hora e o GitHub entrega
de duas a cinco por dia, então os retratos saem em pares separados por cinco a
dez horas. Como o disco sempre responde, a camada de cálculo nunca era alcançada
e a página servia preço de horas atrás. Agora, quando o retrato passa do prazo, a
**camada barata é refeita por cima dele**: preço, open interest, posicionamento,
perna atual e nota são duas requisições por moeda e voltam em quatro segundos; o
estágio de vida, que custa dez arquivos por moeda, continua vindo do retrato. São
duas idades diferentes e a tela mostra as duas — juntá-las numa só estava errando
a de metade dos números. De quebra, moeda recém-adicionada à lista aparece na
hora, sem estágio, em vez de esperar a próxima execução do workflow.

Cada execução também acrescenta uma linha por moeda a
`data/historico-AAAA-MM.jsonl`. É essa série que responde a pergunta que hoje
não tem resposta — os detectores funcionam? — porque a Gate só devolve cem horas
de passado, e é com essas cem horas que o placar da saída de baleia foi medido.

O `vercel.json` traz um `ignoreCommand` que pula o build quando só `data/` mudou.
Sem ele, cada retrato dispararia um deploy novo. **E não bastava:** a Vercel conta
o build pulado como deploy, o plano gratuito cria 100 por dia, e o robô fazia 74
commits em 24 horas. Em 23/09 a cota estourou e o merge com a tela nova ficou de
fora. Desde então **os dados do robô moram na branch `dados`**, que a Vercel não
vigia, e a página os lê de lá pelo GitHub raw; o `main` só recebe código.
`npm run dados` traz os vivos para o disco local.

## Scripts

| comando | o que faz |
| --- | --- |
| `npm run placar` | lê o histórico de emissões e mede se o painel acertou |
| `npm run quarentena` | julga as linhas do histórico contra as velas de 1h do perpétuo e grava em `data/quarentena.json` as que não são o preço daquela hora, para o placar pular (à mão; o retrato já não grava linha assim) |
| `npm run carteira` | mil dólares de mentira seguindo as calls, e o que sobrou |
| `npm run robos` | os robôs ao vivo: percorre as velas das posições e, uma vez por dia UTC, faz a seleção (`data/robos.json`) |
| `npm run medir-robos` | a medição dos robôs com o mesmo motor, sobre o Data Vision de 01/2024 em diante, deslistados inclusive, e a mesa de risco — ficha, sobreajuste nas grades, capacidade e o fundo (`data/robos-medicao.json`; ~430 MB na primeira vez, guardados em `.cache/robos/`; depois, ~6 minutos) |
| `npm run genese` | acha quem recebeu o supply no nascimento e quanto ainda tem |
| `npm run vesting` | acha os contratos de alocação e mede se estão esvaziando |
| `npm run descobrir` | acha o contrato certo de cada ticker, pelos dois testes |
| `npm run garimpar` | peneira os 526 perpétuos da Binance atrás do padrão |
| `npm run aferir-garimpo` | a medição que sustenta o garimpo, refeita do zero |
| `npm run medir-sinais` | RSI, suporte, rompimento, OI, funding e smart money sobre os 528 perpétuos, gravado em `data/sinais.json` (`-- --diario` sai se tiver menos de 20 h) |
| `npm run dados` | traz para `data/` os arquivos vivos do robô, que moram na branch `dados` |
| `npm run fluxo-binance` | grava o fluxo da carteira quente da Binance desde a última rodada, separando varejo na DEX de depósito/saque, e refaz o resumo que a tela lê (`-- --resumo` só o resumo) |
| `npm run panorama` | calcula o retrato de todas e grava em `data/` |
| `npm run estudar` | o estudo de cada moeda — memória, volatilidade, assimetria — em `data/estudos.json` (`-- --em-vista` só as em vista; as que chegam depois o próprio retrato estuda) |
| `npm run estagio` | classifica cada moeda por onde está na própria vida |
| `npm run radar` | o retrato on-chain de uma moeda, no terminal |
| `npm run monitor` | um ciclo de vigilância, com envio ao Telegram |
| `npm run queda` | anatomia de um movimento: perpétuo cruzado com a rede |
| `npm run ciclo` | o ciclo de vida completo, carteira de corretora por carteira |
| `npm run replay` | roda um detector sobre a história e imprime o placar |
| `npm run rotas` | mapeia a camada de roteamento entre carteiras |
| `npm run wallets` | saldo e gás das carteiras vigiadas |
| `npm run flows` | fluxo entre carteiras numa janela |
| `npm run forense` | curva de saldo de endereços arbitrários |
| `npm run telegram-setup` | descobre o chat_id do bot |

Nenhuma regra nova vai para o Telegram sem passar pelo `replay` antes.

Quatro portões, que saem com erro quando algum caso falha: `npm run
testar-carteira` (casos-limite da carteira, sem rede), `npm run testar-robos` (o
motor dos robôs, sem rede), `npm run testar-quant` (a estatística da mesa de risco
contra os valores conhecidos da normal e das fórmulas fechadas, sem rede) e `npm run testar-vivo`
(o preço ao vivo de ponta a ponta — WebSocket, queda, religação, aba oculta —
contra a aplicação rodando: `npm run testar-vivo -- http://localhost:3000`).

## Aviso

Nada aqui é recomendação de investimento. As moedas acompanhadas são
reconhecidamente manipuladas, o histórico usado para calibrar os detectores tem
poucos dias, e moeda de float baixo já subiu 58% em nove horas duas vezes na
mesma semana.
