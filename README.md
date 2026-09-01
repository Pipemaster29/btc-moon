# Radar de moedas manipuladas

Ferramenta pessoal para acompanhar tokens de pump-and-dump: quem segura o
supply na blockchain, como as posições estão montadas no perpétuo, e em que
ponto do ciclo cada moeda está — com alerta no Telegram quando algo se mexe.

Tudo é lido de fontes públicas, **sem nenhuma chave de API**: nós RPC públicos
da BNB Chain, Base e Ethereum, o DexScreener para o mercado à vista, e a API de
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
Sem ele, cada retrato dispararia um deploy novo.

## Scripts

| comando | o que faz |
| --- | --- |
| `npm run descobrir` | acha o contrato certo de cada ticker, pelos dois testes |
| `npm run panorama` | calcula o retrato de todas e grava em `data/` |
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

## Aviso

Nada aqui é recomendação de investimento. As moedas acompanhadas são
reconhecidamente manipuladas, o histórico usado para calibrar os detectores tem
poucos dias, e moeda de float baixo já subiu 58% em nove horas duas vezes na
mesma semana.
