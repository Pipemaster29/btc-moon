<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# btc-moon — o que é, como funciona, como mexer

Radar de tokens de pump-and-dump. Lê quem segura o supply na blockchain, como as
posições estão montadas no perpétuo, e em que ponto do ciclo cada moeda está.

**Tudo vem de fonte pública e sem nenhuma chave de API.** Nós RPC públicos da BNB
Chain, Base e Ethereum; Blockscout para os logs antigos da Ethereum e da Base;
DexScreener para o mercado à vista; `www.binance.com`
para o perpétuo; Gate para as duas coisas que a Binance não expõe por REST;
FRED para liquidez dos bancos centrais.

A frase "sem nenhuma chave" é restrição de projeto e não descrição. Ela já
recusou o Etherscan, que resolveria a Ethereum e cobraria pela BSC e pela Base —
o Blockscout resolve as mesmas duas de graça e sem cadastro.

O `README.md` conta a história de cada decisão com os números que a sustentam.
Este arquivo é o mapa para trabalhar no código.

---

## A regra que organiza tudo

**Nada entra sem medição, e o que foi medido e não funciona fica escrito.**

Este projeto é cheio de coisa que parecia boa e não era. O valor dele está tanto
no que ele afirma quanto no que ele se recusa a afirmar. Três exemplos que estão
no código, com número:

- **Os vieses do painel não têm vantagem medida.** Sobre 22 mil emissões, short
  separa +0,01 p.p. da referência, long +0,02, com 46% a 54% de concordância
  entre moedas. Cara ou coroa. O painel diz isso na própria tela.
- **A tese da liquidez projetada é espúria.** Em nível o ajuste é 0,71 no lead de
  13 semanas — e 0,72 em lead ZERO. Em variação semanal é −0,004 sobre 770
  semanas. O painel mostra os três números lado a lado.
- **"No topo" deixou de ser regra de venda.** O número que a sustentava vinha de
  uma janela de medição diferente da que roda ao vivo. Refeita na janela certa:
  −3,1 p.p. com p = 0,187.
- **O garimpo acha o padrão e não vira call.** Sobre os 526 perpétuos da
  Binance, uma moeda que sobe ≥25% num dia cai 12,68% na mediana dos 7 dias
  seguintes contra referência de −0,96%, com 102 de 139 moedas concordando —
  monotônico em toda a escala e estável nas duas metades da janela. É o sinal
  mais forte já medido aqui, e **vendê-lo perde dinheiro em toda largura de stop
  testada**, porque o caminho estopa a posição antes. `npm run garimpar` entrega
  fila de investigação, com essa frase na tela.
- **Análise técnica clássica não tem vantagem nestas moedas, e parte dela tem
  vantagem AO CONTRÁRIO.** Sobre 319 mil moeda-dias dos 528 perpétuos: RSI < 30
  −0,03 p.p., suporte +0,02; rompimento de máxima de 20 dias −0,84 com 195 de
  498 moedas; comprar funding ≤ −0,1% −4,94. O único recorte que passou nas
  metades — vender RSI > 80 em 30–100 mi — caiu no ataque: mediana −8% por
  trade, +0,04 R, negativo mudando a faixa. `npm run medir-sinais` refaz tudo.

Se você for propor algo novo, meça primeiro. Se não der para medir, escreva que
não deu.

---

## Como rodar

```bash
npm install
npm run dev          # a aplicação
npm run panorama     # o retrato de todas as moedas → data/panorama.json
npm run carteira     # a carteira fictícia → data/carteira.json
npm run dados        # traz para data/ os dados vivos do robô (branch `dados`)
```

Não há chave, `.env` nem banco. O estado inteiro mora em `data/` — e **os arquivos
que o robô grava moram na branch `dados`, não no `main`** (armadilha nº 10). No
disco local eles só aparecem depois de `npm run dados`.

O GitHub Actions (`.github/workflows/monitor.yml`) roda `panorama` + `carteira` +
`garimpar` + `placar` + `fluxo-binance`, e `medir-sinais` uma vez por dia, e
commita o resultado **na branch `dados`** (`scripts/dados.sh`), que a Vercel não
vigia. **O cron pede 48 execuções por dia e o GitHub entrega cerca
de sete** — é limitação da plataforma, contornada pela DURAÇÃO de cada execução
e não pela frequência delas (ver logo abaixo).

### Os três relógios, que são diferentes de propósito

| o quê | com que frequência | onde roda |
|---|---|---|
| preço, 24h e a MARCAÇÃO da carteira | **~3 segundos** por WebSocket direto da Binance; 15 s pela consulta quando ele cai | no navegador de quem está com a página aberta |
| financiamento | 60 s (15 s sem o WebSocket) | idem, pela `/api/vivo` |
| preço e posicionamento por cima do retrato velho | a cada montagem da página | no servidor, quando o retrato passa de 100 min |
| as DECISÕES: viés, abrir e fechar posição, garimpo | **22 min, contínuo** | GitHub Actions |

O terceiro era o gargalo, e o conserto veio pela DURAÇÃO e não pela frequência.

Medido pela API do GitHub nas 40 execuções mais recentes: todas com sucesso,
nenhuma cancelada, e o intervalo entre CRIAÇÕES indo de 2,0 a 5,2 horas — com o
cron pedindo uma a cada 30 minutos. O `schedule` do GitHub atrasa e descarta sob
carga; das 48 pedidas por dia chegam cerca de sete. Nenhum ajuste de cron
alcança isso.

O que alcança: **cada execução dura cinco horas em vez de trinta e cinco
minutos**. O teto de um job são seis horas, e em repositório público o minuto de
runner é gratuito e sem cota. Sete execuções de cinco horas somam 35 horas de
cobertura para um dia de 24 — a sobra vira sobreposição, que o grupo de
concorrência enfileira. Vigilância contínua sem serviço externo, sem token e sem
custo.

**MEDIDO DEPOIS DE 24 HORAS NO AR**, e o resultado é melhor do que a previsão
em coisa nenhuma que importe:

| | antes | depois |
|---|---|---|
| retratos por dia | 14 | **68** |
| intervalo mediano | 38 min | **22 min** |
| maior buraco | **4,7 h** | **24 min** |
| buracos acima de 1h | 16 de 45 | **0 de 80** |

A previsão era de 12 minutos entre retratos e saiu 22 — o `monitor` demora mais
no runner do que eu supus. Fica o número medido, não o previsto. O que importava
era o buraco, e ele saiu de 4,7 horas para 24 minutos, com ZERO vãos acima de
uma hora em 80 intervalos.

O RISCO QUE EU SINALIZEI NÃO SE MATERIALIZOU: comparados um retrato de antes e
um de depois, a completude do dado não mudou (72→73 moedas, 1→2 sem motor, 0 sem
preço). Os nós RPC públicos aguentaram as 6x. O que subiu de verdade foi o
histórico: de ~1.200 para ~4.960 linhas por dia, o que projeta ~38 MB para o mês
contra os 12 MB do desenho. Se ficar pesado, o número a mexer é o `% 4` do
retrato.

**Com as em vista o teto chegou, e a conta de antes estava errada.** Ela usava
os 68 retratos por dia de 23/09; medido em 24/09, com as em vista, foram 41
retratos em 10,1 h — um a cada ~15 min — com 113 moedas e 284 bytes por linha:
**3,12 MB por dia, 97 MB num mês de 31 dias, 101 MB com o `pp`**. O GitHub
recusa arquivo acima de 100 MB, e a recusa derruba o push INTEIRO: retrato,
carteira e garimpo parariam juntos. Por isso, desde outubro, o histórico é
**um arquivo por quinzena** (`historico-AAAA-MM-1.jsonl` e `-2`, ~52 MB), e o
nome mora num lugar só (`lib/historico.ts`). Setembro fecha mensal, perto de
51 MB. `npm run auditar-dados` reprova arquivo acima de 80 MB: se reprovar,
encurte o pedaço em `arquivoDoHistorico` antes de o push começar a falhar.

As execuções agora aparecem como `cancelled` na aba Actions com frequência, e
isso é o mecanismo funcionando, não falha: é a execução PENDENTE sendo
substituída por uma mais nova enquanto a atual roda suas cinco horas.

O que segura o estrago desses vãos é o caminho de velas da carteira: um stop que
aconteceu às 3h dentro do buraco é registrado às 3h e no preço do stop, não no
retrato das 6h30. O que atrasa de verdade é ABRIR call nova.

---

## Arquitetura

### As três camadas de dados (`lib/snapshot.ts`)

A página nunca calcula tudo na hora — custa 20 s e função serverless morre em 10.

1. **GitHub raw** — `data/panorama.json` como está no repositório agora.
2. **Disco** — o mesmo arquivo, congelado no build.
3. **Cálculo** — caro e sempre certo; existe para o primeiro deploy.

### A camada viva

Quando o retrato passa de 100 minutos, `refrescar()` refaz por cima **o que é
barato e envelhece rápido**: preço, open interest, posicionamento, nota — duas
requisições por moeda. O que não cabe é o estágio de vida (seis meses de
histórico).

**A leitura é recalculada junto**, porque `lerVies` é pura e os sinais que ela
precisa acabaram de ser lidos. Sem isso a página mostrava preço novo embaixo de
veredito velho — foi o que fez a AKE aparecer como "em queda longa" no dia em que
subiu 117%.

### A camada viva do NAVEGADOR

A camada acima conserta o retrato no instante em que a página é montada. Daí em
diante a aba fica parada até alguém recarregar, e o `revalidate` da página é de
cinco minutos: um pump de 120% cabe inteiro nesse intervalo.

`/api/vivo` devolve preço, variação de 24h e financiamento de todas as moedas
vigiadas — **duas requisições à Binance para qualquer número de moedas e de
abas**, porque os dois endereços servem a praça inteira de uma vez e o
`next.revalidate` deduplica no servidor. `components/vivo.ts` mantém UMA
assinatura por página, que dorme quando a aba sai de vista.

**E O PREÇO VEM DIRETO DA BINANCE, SEM PASSAR POR SERVIDOR NOSSO.** Depois da
primeira consulta, o navegador abre um WebSocket público no perpétuo com o
miniTicker das moedas vigiadas — o mesmo último negócio e a mesma abertura de 24h
que a consulta devolve. Custo para o Vercel e para o GitHub: zero, porque a
conexão é do navegador de quem olha com a Binance. Com ele de pé a consulta cai
para uma por minuto, só pelo financiamento.

Medido em 23/09 com as 71 moedas numa conexão: ~19 mensagens e 4 KB por segundo,
cada moeda de ~3 em ~3 s; a tela publica no máximo uma vez por segundo. Três
coisas que foram medidas e estão no código:

- **O endereço é `/market/stream`, não o `/ws` da documentação antiga.** O `/ws`
  ABRE e fica mudo — zero mensagens em quinze segundos. Por isso há um vigia:
  sem primeira mensagem em 10 s, ou nada em 30 s, a conexão conta como falha.
- **Na falha a consulta de 15 s assume na hora**, e a religação espera o dobro a
  cada falha seguida, de 5 s a 5 min. A tela diz por qual canal o preço chega.
- **O proxy deste ambiente de desenvolvimento não deixa o Chromium abrir
  WebSocket** (403 no upgrade). O caminho de reserva foi visto no navegador; o do
  WebSocket é exercitado no Node por `npm run testar-vivo` (com `npm run dev`
  de pé), pela `assinarVivo`, que é a mesma assinatura sem React: abrir,
  receber, publicar no máximo uma vez por segundo, derrubar, religar, aba
  oculta, aba de volta, dormir. Onze casos, e ele sai com erro se algum falha.

Quem consome: as células de preço e 24h da tabela (`PrecoVivo`) e a carteira
(`CarteiraPanel`, que remarca as posições com `remarcar`). O número do retrato é
sempre o ponto de partida e nunca some — se a rota não responder, a célula fica
exatamente como estava.

Medido em 04/09 com a página aberta: a CAP estava no retrato a US$ 0,07056 com
−3,8% em 24h e ao vivo a US$ 0,04501 com −38,3%. Trinta e seis por cento de
diferença, na tela, marcada como atual.

**A carteira NÃO decide ao vivo, só marca.** Abrir e fechar exige o histórico
inteiro, as regras de saída e o caminho de velas — isso é do `npm run carteira`.
Uma posição que já passou do stop aparece passada do stop, sinalizada, até o
retrato seguinte fechá-la com a hora certa.

### Os módulos

| arquivo | responsabilidade |
|---|---|
| `lib/onchain.ts` | JSON-RPC: saldos, logs, supply, bloco de nascimento, e tudo que toca uma carteira (`movimentosDaCarteira`). Sabe qual nó serve o quê — e o de log da BSC guarda só ~100 h |
| `lib/explorador.ts` | o Blockscout como fonte de log, **sem chave**, na Ethereum e na Base. Uma requisição por mil eventos onde o nó pedia centenas de faixas. A BSC não tem instância gratuita, e por que está escrito lá |
| `lib/watchlist.ts` | as moedas, com contrato e carteiras mapeadas. **Cada entrada tem a justificativa da identificação** |
| `lib/lifecycle.ts` | estágio do ciclo (`lerVida`) e o viés (`lerVies`) |
| `lib/motor.ts` | "ainda existe quem empurre esta moeda?" — quatro testes |
| `lib/detentores.ts` | concentração: quem recebeu o supply na gênese |
| `lib/vesting.ts` | emissão: o supply travado está parado ou saindo? |
| `lib/estudo.ts` | como CADA moeda se move — memória, volatilidade, assimetria |
| `lib/placar.ts` | o painel acertou? Lê o histórico de emissões |
| `lib/carteira.ts` | a carteira fictícia. **Não importa nada de `node:` no topo** — `remarcar` roda no navegador |
| `lib/overview.ts` | junta tudo numa linha por moeda |
| `app/api/vivo/route.ts` | preço, 24h e financiamento de todas as moedas, em duas requisições |
| `components/vivo.ts` | a assinatura única da página: WebSocket da Binance para preço, essa rota para financiamento e como reserva |
| `lib/sinais.ts` | o formato de `data/sinais.json` e a leitura dele pela página |
| `lib/fluxo.ts` | `resumirFluxo`: soma o bruto do fluxo da Binance por moeda, com a cobertura de cada dia junto |
| `lib/garimpo.ts` | peneira os 526 perpétuos atrás do padrão. **Carrega a tabela medida que ordena a lista** |
| `lib/historico.ts` | o nome do arquivo do histórico e o padrão que os leitores reconhecem. **Carrega a medição que partiu o mês em quinzenas** |
| `lib/emvista.ts` | as moedas **em vista**: todo perpétuo que passou pela carteira quente da Binance e não está na lista entra no painel sozinho. **Carrega a medição que justifica isso** e o aviso do Telegram. Não moram em `watchlist.ts`, e o monitor on-chain segue só com a lista |
| `lib/guardado.ts` | de onde a página lê `data/`. **A ordem depende do ambiente**: raw primeiro em produção (branch `dados`, depois `main`), disco primeiro no resto |
| `lib/avisos.ts` | o que a carteira abriu ou fechou desde o retrato anterior, em texto para o Telegram. A memória do que já foi avisado viaja no `carteira.json` |
| `scripts/dados.sh` | baixa e grava os dados do robô na branch `dados`; faz a transição do `main` sozinho |

### Os dados

Os que o **robô** grava (panorama, histórico, carteira, garimpo, placar, sinais,
fluxo e o estudo das em vista novas) moram na branch órfã `dados`; a lista está no `PADRAO` de
`scripts/dados.sh` e repetida no `.gitignore`. Os gerados **à mão** (detentores,
vesting, estudos) ficam no `main`: a página os lê do disco do build.

| arquivo | o que é | quem grava |
|---|---|---|
| `data/panorama.json` | o retrato completo, ~70 moedas | `npm run panorama` |
| `data/historico-AAAA-MM.jsonl` e, desde outubro, `historico-AAAA-MM-1.jsonl`/`-2` | uma linha por moeda por retrato, um arquivo por quinzena (`lib/historico.ts`). **É a memória do projeto** | idem |
| `data/detentores.json` | concentração por moeda. **17 medidas de 37 com contrato**, todas de Ethereum e Base. As 20 da BSC não têm fonte de log: 15 de 16 varridas em 06/09 perderam as 41 faixas da janela | `npm run genese` |
| `data/vesting.json` | emissão por moeda | `npm run vesting` |
| `data/estudos.json` | estudo por moeda, **as em vista incluídas**: sem ele a trava de "a moeda continua o movimento" não roda nelas (8 de 70 da lista, 6 de 39 em vista) | `npm run estudar` (`-- --em-vista` só para elas) |
| `data/estudos-em-vista.json` | **do robô, na branch `dados`**: o estudo das em vista que chegaram depois, feito pelo próprio retrato (até dez por rodada; a sem amostra é tentada de novo depois de um dia). `lerEstudo` junta os dois, e o de mão manda | `npm run panorama` |
| `data/placar.json` | o painel acertou? | `npm run placar` |
| `data/quarentena.json` | as linhas do histórico que não são o preço do perpétuo daquela hora, julgadas contra as velas de 1h: **471 em 24/09, de HEI, CAP, SYN e JCT**. O placar não toca em rede e as pula por esta lista. Linha nova fora do perpétuo não nasce mais desde o árbitro de `lib/overview.ts` | `npm run quarentena`, à mão (fica no `main`) |
| `data/carteira.json` | a carteira, com a tabela de regimes e a curva do regime anterior em `comparacao` — a tela desenha as duas | `npm run carteira` |
| `data/garimpo.json` | o que o universo da Binance devolveu | `npm run garimpar` |
| `data/fluxo-binance-AAAA-MM.jsonl` | o que entrou e saiu da carteira quente da Binance, por moeda com perpétuo, **em duas portas**: `cmp`/`vnd` pelo executor de swap (varejo comprando/vendendo na DEX) e `dep`/`saq` direto (depósito/saque). Janelas cortadas na meia-noite UTC, cada uma com falhas, lacuna e a contraparte dominante. **Só existe para frente**: o nó guarda ~100 h | `npm run fluxo-binance` |
| `data/fluxo-binance.json` | o último bloco lido, a identificação de cada token (perpétuo e preço conferidos, última passagem) e a memória das em vista já anunciadas. **É daqui que sai o conjunto em vista** | idem |
| `data/fluxo-binance-resumo.json` | os últimos 7 dias somados por moeda, com a cobertura de cada dia — é o que a página lê | idem (e `-- --resumo` só refaz este) |
| `data/sinais.json` | os 25 sinais medidos sobre os 528 perpétuos, o modelo atacado e os testes do fluxo | `npm run medir-sinais`, **uma vez por dia** no workflow (`--diario`) |

---

## A carteira fictícia

US$ 1.000 entrando em toda call de compra e venda do painel, para a pergunta
"quanto eu teria hoje?" ficar na tela.

**É perpétuo, não à vista** — ela opera vendido, e vendido não existe no spot.

| regra | valor | de onde vem |
|---|---|---|
| Alavancagem | **3x** | o teto em que o stop ainda dispara antes da liquidação: 25% de preço × 3 = 75% da margem. A 4x seriam 100%, e a corretora fecharia a posição exatamente onde o stop fecharia |
| Stop | −25% de preço | fora do ruído de um dia: desvio diário mediano de 11,2% (`estudos.json`), ~2,2σ. Mais curto foi medido em 23/09 e não passou — o ganho era de uma moeda |
| Sem reação | **3 dias** | a posição que não andou a favor em três dias sai. Platô: 1 a 5 dias melhoram as duas metades da janela |
| Alvo | +40% de preço | o dobro da assimetria que sustenta a regra de compra (sobe +20% em 21,0% das semanas) |
| Prazo | 14 dias | as regras direcionais foram medidas em janelas de 7 e 14 dias |
| Risco por call | **3% / 2% / 1%** do patrimônio (força 3/2/1) | dobrado em 05/09: na régua anterior o pico de risco agregado era 13% de um teto de 25% e 85% do dinheiro ficava parado — a carteira não conseguia testar se a estratégia quebra a conta, que é para o que ela existe |
| Vendido | **¼ do risco** | depois de cada call de venda o preço subiu contra a referência em 72h nos dois meses (+0,44 p.p. em agosto, +2,29 em setembro); a cauda destas moedas é para cima. Um quarto, e não zero, para continuar medindo |
| Freio de queda | a partir de −10% do pico, até ¼ do orçamento em −25% | mecânico, não medido: nunca encosta na amostra. Dois dias seguidos de tudo estopar custariam −44% sem ele e −30% com ele |
| Risco agregado | teto de 25% | cripto tem dias em que a lista inteira cai 25% junta |
| Margem exposta | teto de 50% | |
| Custo | 0,15% por lado, **sobre o nocional** | a 3x, isso é 0,45% da margem por lado |
| Financiamento | taxa real da Binance, **no período de cada moeda** | 39 das 40 negociadas cobram de 4 em 4 h, não de 8 — até 24/09 o motor cobrava a metade. Em 24/09 a mediana do painel paga 11% ao ano (0,005% a cada 4 h); os 15% a 20% de 03/09 foram contados com três cobranças por dia |
| Liquidação | margem de manutenção 0,5% | a 3x, o preço andando 33,2% contra |

**Saída pelo primeiro que acontecer:** o painel mudou de ideia (a principal — a
carteira segue as calls, então sai quando a call sai), stop, sem reação, alvo,
prazo, liquidação.

**As regras são um objeto, `Regras`, e o motor aceita qualquer uma.** `REGRAS` é
o regime publicado e `REGRAS_ANTERIORES` o que valeu até 23/09. `npm run
carteira` imprime os dois lado a lado e o publicado com cada peça desligada, nas
duas metades da janela e sem a moeda que mais ganhou — é essa tabela que decide
se uma regra entra. **Nenhuma regra de gestão nova sem passar nela**, e a coluna
"sem a melhor moeda" reprova mais do que as metades: o stop curto passava nas
duas metades e era uma moeda só.

Medido em 24/09 ao meio-dia, as mesmas calls: o regime anterior em −14,1%
(queda máxima −18,7%), o publicado em **−2,1%** (−11,0%) — a gestão perde muito
menos, e lucro continua não demonstrado. **O número de 23/09, +14,8%, estava
errado**: três "alvos" da HEI eram preço de pool alheia que o perpétuo nunca
tocou (ver a armadilha nº 7). Cada peça desligada continua pior que o publicado.

E o motor liquidava o que era stop: dentro da vela ele testava a liquidação
antes do stop, e toda vela que seguia caindo depois do stop virava −100% da
margem no lugar de −75%. Uma posição em 174, a HEI de 09/09; sobre os mesmos
dados, −2,8% viraram −2,1%. Hoje a liquidação só vem primeiro quando a vela abre
além dela ou quando o financiamento a trouxe para aquém do stop.

**Stop, alvo e liquidação disparam DENTRO do intervalo entre dois retratos.**
`npm run carteira` busca as velas de 1h da Binance das moedas que podem virar
posição e percorre o caminho: a saída é no NÍVEL DA ORDEM, não no extremo da
vela, e na abertura quando a vela saltou por cima do nível. Ordem parada não
pisca — testar só as pontas dava à carteira uma paciência que ninguém tem, e
sempre na direção que a favorece.

As velas vêm do perpétuo e os preços da carteira vêm do retrato, que prefere a
pool. O caminho é **ancorado** pela razão entre os dois e recusado inteiro fora
de 0,8–1,25, porque razão de 1,4 não é base de mercado, é outra moeda. Sem velas
— e há moeda sem série — o motor cai no teste de ponta de sempre, e o script diz
quantas ficaram assim.

Medido nas 16 posições carregadas até 04/09: **todas as 16** esconderam
movimento entre retratos, mediana 2,1 p.p., maior 5,0 p.p. (SKYAI). E o que isso
mudou no patrimônio: **nada** — nada chegou perto dos limites em dois dias, a
maior excursão contra foi 12,5% de preço na TUT. `npm run carteira` imprime as
duas leituras lado a lado para isso continuar visível.

**Ela começa em 02/09/2026, não sobre o histórico.** Rodar o motor para trás daria
um número enganoso: as regras do painel foram ajustadas ao longo dos dois meses
gravados, todas depois de ver os dados.

**O que ela não cobra:** a diferença entre o preço do retrato e o preço real de
execução; a profundidade da pool (o custo é fixo, e numa pool de US$ 2 mil uma
ordem de US$ 60 move mais que isso).

**A call queimada não se repete.** Depois de QUALQUER saída, a moeda só volta a
valer quando o viés dela sair daquele lado. Sem isso a carteira recomprava a
call que acabou de morrer no MESMO retrato — reproduzido com uma moeda caindo
28% por retrato e o painel fixo em "long", ela tomou **onze stops seguidos** e
perdeu 17% do patrimônio na mesma leitura errada. Até 23/09 só stop e liquidação
queimavam, e a saída por prazo reabria no mesmo lote; com a saída por tempo, a
diferença é de −2,1% para −3,3% (refeito em 24/09; com os alvos falsos da HEI,
era de +14,8% para +5,0%).

**A unidade de cada número importa, e confundi-las já quebrou isto.** `STOP` e
`ALVO` são variação de PREÇO; `retorno` e `funding` são fração da MARGEM, ou seja
já multiplicados pela alavancagem; `RISCO_POR_FORCA` e `risco` são fração do
PATRIMÔNIO. Comparar um contra o outro
fazia o stop de 25% disparar com 8,3% de preço — ruído de um dia normal.

`npm run testar-carteira` roda os casos-limite e trava os limiares, sem tocar em
rede. **Cada um deles quebrou de verdade** — o pior fazia mil dólares virarem
1,4×10²⁸ por causa de uma linha de preço de lixo no histórico. Ele sai com
código diferente de zero quando algum caso falha, então serve de portão.

`npm run auditar-dados` confere as invariantes de tudo que está em `data/`.

---

## Armadilhas conhecidas

Estas custaram caro. Leia antes de mexer.

### 1. Identificar o token errado

**O erro mais caro deste projeto, cometido duas vezes.** Buscar um ticker pelo
nome devolve o mercado inteiro de homônimos. `npm run descobrir` aplica quatro
testes, e **todos são necessários**:

- **preço bate com o perpétuo** (arbitragem não deixa passar de um dígito
  percentual; homônimo fica 30% ou 30.000% fora);
- **supply do contrato ≥ circulante** (não dá para circular mais do que existe —
  contrato menor é fragmento de ponte);
- **a pool gira** (VVV aparece com US$ 775 milhões de liquidez e ZERO de volume:
  pool decorativa);
- e para ticker curto, **buscar pelo NOME do projeto** — procurar "C" ou "H"
  devolve o mercado inteiro.

**A busca precisa olhar TODAS as redes.** C e POWER ficaram meses marcadas como
"sem contrato EVM" porque a busca parou na BNB Chain, onde o endereço é fragmento
de ponte. Nas duas, o mesmo endereço na Ethereum/Base guarda o supply inteiro.

**E o nome do perpétuo pode não ser latino.** A BINARENSHENG ficou na lista
como "sem perpétuo em lugar nenhum", sem open interest, posicionamento nem
estágio — e o perpétuo existia desde 20/10/2025 como `币安人生USDT`, US$ 37
milhões em aberto, o mesmo caso do `龙虾USDT`. O símbolo DO CONTRATO é o nome do
perpétuo; o transliterado não acha nada. Conferido em 24/09 sobre as 72 ativas:
era a única (a BP, a outra sem perpétuo na Binance, vive na Gate de fato).

### 2. "Não achei" e "não consegui" são coisas diferentes

O modo de falha que este projeto mais teme. Casos reais:

- `rpc.flashbots.net` devolvia **lista vazia** para logs além de ~8.192 blocos.
  Não é erro, é silêncio — e `prunedDepth` dizia 20.000.
- O nó de log da BNB Chain **guardava desde 2025-11-10** (02/09), não a cadeia
  inteira, e toda varredura mais funda devolvia nada, sem avisar. **Em 23/09 a
  janela era de ~100 horas rolantes** — o limite encolheu sem aviso, e o
  comentário no código continuou afirmando dez meses. `semHistorico` detecta o
  limite na hora; data escrita em comentário não acompanha o nó.
- `concentracaoDe` devolvia **ZERO** quando a janela de gênese estava vazia. A C
  tinha 23% do supply em contratos e o painel lia "concentração zero".
- O lote da BSC de 06/09: 16 moedas varridas, **15 com as 41 faixas da janela
  falhando** e nada lido — não é lentidão, é que o nó de log da BNB Chain guarda
  desde 2025-11-10 e a gênese delas é anterior. O script gravava as 16 como
  `concentracao: 0`. Hoje `mapear` **não grava linha** quando a varredura não
  leu, e a 16ª (CYS, que leu UMA transferência e nenhuma faixa perdida, passando
  pelos dois guards) é barrada pela âncora: **zero sem âncora não é medição**,
  porque a janela sem explorador são 2,5h do nascimento e 4 das 17 moedas com
  âncora mintam depois disso.
- `change24h` vinha só do DexScreener, então **39 das 71 moedas** gravavam
  exatamente zero — e a trava de venda dependia desse número.

**Sempre que uma leitura puder falhar, o `null` tem de sobreviver até a decisão.**
`?? 0` é quase sempre um bug.

### 3. Preço de lixo

O JCT já foi gravado no histórico a **2,9e-27**, quinze ordens de grandeza abaixo
do preço dele, porque uma pool devolveu isso ao DexScreener. Os freios hoje, e
todos precisam ficar:

- **na leitura**, `precoArbitrado` (`lib/dexscreener.ts`): a pool só vale dentro
  de 0,8–1,25 do ÚLTIMO NEGÓCIO do perpétuo. Retrato, página de detalhe e
  alertas on-chain usam a mesma função — até 24/09 cada um tinha a sua, e a do
  alerta das carteiras mapeadas nem recorria ao perpétuo;
- **no que foi gravado**, o `pp` de cada linha do histórico e a auditoria que
  reprova linha fora da faixa;
- **na carteira**, o `SALTO_ABSURDO` de dez vezes e `foraDoPerpetuo`, que julga
  cada linha contra a vela de 1h daquela hora;
- **no placar**, o mesmo salto e `data/quarentena.json` — as linhas antigas,
  de antes do árbitro, julgadas uma vez contra as velas.

E há o preço que é de OUTRA moeda, que nenhum dos dois pega. `tokens/<endereço>`
no DexScreener devolve também as pools em que o token é o PAGAMENTO, com o
`priceUsd` da base. A AIOT leu o da AIT: 2,7 vezes fora, abaixo do freio de 100,
e a carteira abriu posição nele (23/09). `pairsOfToken` marca `propria` e
`depthOn` só usa essas; o `lib/motor.ts` continua contando o saldo nas outras,
que é saldo de verdade. Quem ler preço de pool fora do `depthOn`: filtre.

### 4. Unidades misturadas

Meio arquivo trabalha em variação de PREÇO e meio em fração da MARGEM, e a
alavancagem é o fator entre os dois. Já quebrou: o stop de 25% comparado contra
o retorno alavancado disparava com 8,3% de preço. Quando um número novo entrar,
diga no nome ou no comentário em que unidade ele está.

### 5. `NaN` fura guardas

`NaN <= 0` e `NaN >= 0` são **ambos falsos**. Um guard escrito como
`if (x <= 0) return` deixa NaN passar. Use `Number.isFinite`.

### 6. O retrato é velho e a página não pode fingir que não

Um pump de 120% cabe inteiro no intervalo entre dois retratos. Qualquer coisa que
a página exiba junto do preço precisa ser recalculada com o preço, ou carimbada
com a própria idade.

Isto vale para TODO arquivo de `data/`, e a forma que o descuido toma é sempre a
mesma: **em produção o disco é o do BUILD**, e o `ignoreCommand` do `vercel.json` (ver a nº 10)
pula o build quando só `data/` mudou. Um arquivo lido só do disco fica congelado
para sempre. `getSnapshot`, `getCarteira` e `getPlacar` leem do GitHub raw
primeiro por isso — o `getPlacar` só passou a ler em 04/09, e até então o painel
que diz "nenhum viés separou" era o do último deploy, com a janela de medição
antiga do lado parecendo carimbo de frescor.

E vale para a IDADE ao lado do número: a janela do placar diz sobre que período
ele foi calculado, não quando. São duas datas e as duas precisam estar na tela.

**Mas a ordem das camadas se INVERTE fora de produção**, e isso não era feito. Em
`next dev` e nos scripts, o disco é o arquivo que você acabou de gerar e o raw é
a produção — então ler o raw primeiro fazia `npm run carteira` não mudar nada na
tela, sem erro e sem aviso. Medido: disco em US$ 999,57 com a queda máxima,
página em US$ 998,11 sem ela. A regra mora em `lib/guardado.ts` e vale para as
quatro leituras.

### 7. Um freio que existe numa metade do caminho não existe

O `SALTO_ABSURDO` da carteira barrava preço de lixo na MARCAÇÃO e não na
ABERTURA, e o buraco durou até 04/09 com o teste de regressão em pé ao lado:
o teste abria a posição antes de a linha de lixo chegar, e aí `abertas.has`
barrava a reabertura por outro motivo. Bastava a moeda ainda estar fechada
quando o lixo chegasse — US$ 1.000 viravam US$ 1,4×10²⁸.

O mesmo formato apareceu na trava de call queimada: ela distinguia "não houve
leitura" de "leitura contrária" na SAÍDA e não no descongelamento, e um único
retrato mudo bastava para o moedor voltar — doze stops seguidos, −18,6%.

E apareceu uma terceira vez, a mais cara. `ancora` recusava o caminho de velas
quando o preço do retrato estava fora de 0,8–1,25 do perpétuo — "é outra
moeda" —, e o teste de ponta logo abaixo usava esse MESMO preço para fechar. A
pool rasa da HEI devolvia 1,6 a 2 vezes o perpétuo em parte dos retratos, e a
carteira fechou três posições "no alvo" que o perpétuo nunca tocou: US$ 191,
todo o lucro que a tela mostrava (+14,8% viraram −3,9% em 24/09, contando os
stops que a linha descartada escondia — ver abaixo). Hoje
`foraDoPerpetuo` julga cada linha contra a vela daquela hora antes de ela
abrir, marcar ou fechar qualquer coisa — e as velas vêm desde o começo da
carteira, porque sem elas o juiz some e os preços falsos voltam a valer.

Quando escrever um freio, procure a outra ponta onde a mesma decisão é tomada.

### 8. Janela medida em BLOCOS não é janela de tempo

Bloco não é segundo, e a razão entre os dois muda 27 vezes dentro deste
repositório: 0,45 s na BNB Chain, 2 s na Base, 12 s na Ethereum. Uma constante em
blocos vira três janelas diferentes sem que ninguém escolha nenhuma delas.

O `scripts/genese.mts` tinha duas, e as duas estavam erradas de jeitos
diferentes:

- `JANELA = 20_000` blocos era 2,5h na BSC e 66,7h na Ethereum. A **SYN** tem a
  primeira transferência 67,49h depois do nascimento — hora e meia fora — e
  gravava concentração ZERO, que `mapear` trata como resultado legítimo.
- `ALCANCE = 200_000` blocos tinha ao lado o comentário "pouco mais de um dia na
  BNB Chain", que é verdade lá e **667 horas na Ethereum**. O texto afirmava o
  contrário do que o número fazia em duas das três redes.

**E consertar pelo comentário em vez de pela medição foi pior que o defeito.** Eu
troquei os 200 mil blocos pelas 25 horas que o texto dizia, e o **JCT caiu de
99,9% para 0,0%** — a leitura que justifica o módulo inteiro. Medido depois: os
seis donos do JCT só chegam ao corte entre **262,6 e 288,8 horas**. O comentário
estava errado, o número estava certo por acidente, e o certo era medir os dois.

E o começo da janela é a outra metade do mesmo erro: o nascimento do contrato só
é o começo da distribuição quando o mint está no deploy, o que é 13 de 17.
Na **C** a primeira transferência vem **98 dias** depois do contrato existir.

Se a janela é sobre um fenômeno de mercado, ela é de TEMPO e se converte para
blocos por rede. Se é sobre orçamento de requisição, ela é de blocos — e aí
escreva ao lado que é orçamento, para ninguém ler o corte como medição.

### 9. Espalhar um array grande como argumento estoura a pilha

`Math.min(...pontos)` passa cada elemento como ARGUMENTO, e a pilha tem teto. Com
as 23 mil linhas de 03/09 cabia; com as 126 mil de 23/09 o `npm run placar`
morria com "Maximum call stack size exceeded" antes de imprimir uma linha — e
como ele não rodava no workflow, a tela mostrou a medição de 03/09 por vinte
dias. O histórico só cresce: sobre ele, é laço.

### 10. O robô gasta a cota de deploy da Vercel, e um deploy perdido não voltava

O plano gratuito da Vercel cria no máximo **100 deployments por dia**, e a
documentação dela diz que o build CANCELADO pelo `ignoreCommand` conta como
deployment inteiro. Cada commit do robô é um: **74 em 24 horas**, medido em
23/09 — três quartos da cota só com retratos de dados. Com mais 14 pushes de
branch naquele dia, a cota estourou, e o merge do PR #2 — o único commit do dia
com código de tela — recebeu "Deployment rate limited". O site ficou na versão
anterior sem erro nenhum na página.

E ele NÃO VOLTARIA SOZINHO. O `ignoreCommand` comparava `HEAD^` com `HEAD`: o
retrato seguinte ao merge só mexia em `data/`, então pulava o build — e o código
do merge nunca iria ao ar até alguém commitar código de novo. Hoje a comparação é
contra `VERCEL_GIT_PREVIOUS_SHA`, o último deploy que FOI ao ar: qualquer commit
depois de um deploy perdido publica o que ficou pendente. Variável vazia ou SHA
fora do clone raso constroem — na dúvida, constrói. Os quatro casos foram
simulados sobre o histórico real antes de entrar.

E as branches `claude/*` não criam deploy de prévia (`git.deploymentEnabled`):
eram elas que empurravam o dia para cima da cota.

**O conserto de fundo: os dados do robô foram para a branch órfã `dados`**, que a
Vercel não vigia (`deploymentEnabled` no `vercel.json` do `main` E no dela), e a
página lê de lá pelo raw. O `main` passa a receber só código, e os 74 deploys por
dia caem para os merges. `scripts/dados.sh` faz tudo, e cada peça foi simulada
contra um remoto falso com clone raso, como o do Actions, antes de entrar:

- **a transição é sozinha:** a primeira execução importa do `main` o commit mais
  novo que ainda tem `data/panorama.json`, e reimporta se o `main` andou enquanto
  a ponta de `dados` ainda for uma importação — nunca por cima de retrato
  próprio. Depois, o próprio robô tira os arquivos do `main`, uma vez: não podia
  ser o PR, porque apagar arquivo que o robô modifica a cada 20 minutos dá
  conflito com cada retrato e trava o merge;
- **o checkout do Actions é de uma branch só:** `git fetch origin dados` sem
  refspec explícito não cria `origin/dados`, e o segundo retrato da simulação
  morreu nisso;
- **o freio nas duas pontas:** sem `baixar`, o workflow não roda o robô; e
  `gravar` recusa jsonl com MENOS linhas do que a branch tem — simulado com uma
  linha contra 99.109, recusado, branch intacta.

Uma branch com código junto teria de receber merge do `main`, e o token do Actions
não pode empurrar commit que mexa em `.github/workflows/`. Por isso órfã.

---

## Como escrever código aqui

**Comentário explica POR QUE, com número.** O padrão do repositório é alto e é
proposital: quase todo corte tem a medição que o justifica escrita ao lado, e
quando não tem, diz que não tem. Um comentário que repete o que o código faz é
pior que nenhum.

Exemplo do tom (de `lib/motor.ts`):

```
 * O custo de não ter isso era concreto. No JCT, seis endereços seguram 99,9% do
 * supply; este módulo lia esse mesmo número como munição intacta e o painel
 * emitiu COMPRA. Agora a concentração é descontada antes do teste de oferta.
```

**Outras convenções:**

- Código e comentários **em português**. Nomes de variáveis também.
- Sem framework de teste. Funções puras se testam com um script em `scripts/`
  que chama e imprime — ver `scripts/testar-carteira.mts`.
- `npx tsc --noEmit` e `npm run lint` antes de commitar. `npm run build` quando
  mexer em página ou componente.
- Cores de gráfico e painel: use a skill `dataviz`. Há um validador de paleta, e
  cores já reprovaram nele (`#F0B90B` falha contraste no claro: 1,73:1).
- Mensagem de commit: título curto no imperativo, corpo explicando **o que foi
  medido** e **o que mudou de comportamento**.

---

## O estado, em uma linha

O que funciona: a leitura on-chain (concentração, emissão, custódia), a
identificação de contrato, o estudo por moeda, e a honestidade sobre o resto.

O que **não** está demonstrado: que os vieses do painel tenham vantagem. O placar
mede que não têm, e a carteira fictícia existe para medir isso de novo, com
tamanho de posição e custo dentro da conta.

**Não transforme o painel em recomendação enquanto o placar disser o que ele diz
hoje.**
