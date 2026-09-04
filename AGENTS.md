<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# btc-moon — o que é, como funciona, como mexer

Radar de tokens de pump-and-dump. Lê quem segura o supply na blockchain, como as
posições estão montadas no perpétuo, e em que ponto do ciclo cada moeda está.

**Tudo vem de fonte pública e sem nenhuma chave de API.** Nós RPC públicos da BNB
Chain, Base e Ethereum; DexScreener para o mercado à vista; `www.binance.com`
para o perpétuo; Gate para as duas coisas que a Binance não expõe por REST;
FRED para liquidez dos bancos centrais.

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

Se você for propor algo novo, meça primeiro. Se não der para medir, escreva que
não deu.

---

## Como rodar

```bash
npm install
npm run dev          # a aplicação
npm run panorama     # o retrato de todas as moedas → data/panorama.json
npm run carteira     # a carteira fictícia → data/carteira.json
```

Não há chave, `.env` nem banco. O estado inteiro mora em `data/`.

O GitHub Actions (`.github/workflows/monitor.yml`) roda `panorama` + `carteira` +
`garimpar` e
commita o resultado. **O cron pede 48 execuções por dia e o GitHub entrega cerca
de sete** — é limitação da plataforma, contornada pela DURAÇÃO de cada execução
e não pela frequência delas (ver logo abaixo).

### Os três relógios, que são diferentes de propósito

| o quê | com que frequência | onde roda |
|---|---|---|
| preço, 24h, financiamento e a MARCAÇÃO da carteira | 15 segundos | no navegador de quem está com a página aberta |
| preço e posicionamento por cima do retrato velho | a cada montagem da página | no servidor, quando o retrato passa de 100 min |
| as DECISÕES: viés, abrir e fechar posição, garimpo | ~12 min, contínuo | GitHub Actions |

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

O preço: o monitor passa de ~80 ciclos por dia para ~480 e o retrato de 14 para
~120 — 6x mais chamadas aos nós RPC públicos e 2,5x mais histórico por dia do
que o desenho original previa. Se algum nó recusar, mexa no `sleep` do laço ou
no `% 4` do retrato, não na duração.

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
`next.revalidate` deduplica no servidor. `components/vivo.ts` mantém UM relógio
por página, de quinze em quinze segundos, que dorme quando a aba sai de vista.

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
| `lib/onchain.ts` | JSON-RPC: saldos, logs, supply, bloco de nascimento. Sabe qual nó serve o quê |
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
| `components/vivo.ts` | o relógio único da página que consome essa rota |
| `lib/garimpo.ts` | peneira os 526 perpétuos atrás do padrão. **Carrega a tabela medida que ordena a lista** |
| `lib/guardado.ts` | de onde a página lê `data/`. **A ordem depende do ambiente**: raw primeiro em produção, disco primeiro no resto |

### Os dados

| arquivo | o que é | quem grava |
|---|---|---|
| `data/panorama.json` | o retrato completo, ~70 moedas | `npm run panorama` |
| `data/historico-AAAA-MM.jsonl` | uma linha por moeda por retrato. **É a memória do projeto** | idem |
| `data/detentores.json` | concentração por moeda | `npm run genese` |
| `data/vesting.json` | emissão por moeda | `npm run vesting` |
| `data/estudos.json` | estudo por moeda | `npm run estudar` |
| `data/placar.json` | o painel acertou? | `npm run placar` |
| `data/carteira.json` | a carteira | `npm run carteira` |
| `data/garimpo.json` | o que o universo da Binance devolveu | `npm run garimpar` |

---

## A carteira fictícia

US$ 1.000 entrando em toda call de compra e venda do painel, para a pergunta
"quanto eu teria hoje?" ficar na tela.

**É perpétuo, não à vista** — ela opera vendido, e vendido não existe no spot.

| regra | valor | de onde vem |
|---|---|---|
| Alavancagem | **3x** | o teto em que o stop ainda dispara antes da liquidação: 25% de preço × 3 = 75% da margem. A 4x seriam 100%, e a corretora fecharia a posição exatamente onde o stop fecharia |
| Stop | −25% de preço | ~3 desvios de UM DIA; `npm run estudar` mede volatilidade diária de 7% a 10% |
| Alvo | +40% de preço | o dobro da assimetria que sustenta a regra de compra (sobe +20% em 21,0% das semanas) |
| Prazo | 14 dias | as regras direcionais foram medidas em janelas de 7 e 14 dias |
| Risco por call | 1,5% / 1,0% / 0,5% do patrimônio (força 3/2/1) | dimensionado pelo risco, não pelo capital |
| Risco agregado | teto de 25% | cripto tem dias em que a lista inteira cai 25% junta |
| Margem exposta | teto de 50% | |
| Custo | 0,15% por lado, **sobre o nocional** | a 3x, isso é 0,45% da margem por lado |
| Financiamento | taxa real da Binance, por 8h | a lista paga de 15% a 20% ao ano |
| Liquidação | margem de manutenção 0,5% | a 3x, o preço andando 33,2% contra |

**Saída pelo primeiro que acontecer:** o painel mudou de ideia (a principal — a
carteira segue as calls, então sai quando a call sai), stop, alvo, prazo,
liquidação.

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

**A call queimada não se repete.** Depois de um stop ou uma liquidação, a moeda
só volta a valer quando o viés dela sair daquele lado. Sem isso a carteira
recomprava a call que acabou de morrer no MESMO retrato — reproduzido com uma
moeda caindo 28% por retrato e o painel fixo em "long", ela tomou **onze stops
seguidos** e perdeu 17% do patrimônio na mesma leitura errada.

**A unidade de cada número importa, e confundi-las já quebrou isto.** `STOP` e
`ALVO` são variação de PREÇO; `retorno`, `funding` e `RISCO_POR_FORCA` são fração
da MARGEM, ou seja já multiplicados pela alavancagem. Comparar um contra o outro
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

### 2. "Não achei" e "não consegui" são coisas diferentes

O modo de falha que este projeto mais teme. Casos reais:

- `rpc.flashbots.net` devolvia **lista vazia** para logs além de ~8.192 blocos.
  Não é erro, é silêncio — e `prunedDepth` dizia 20.000.
- O nó de log da BNB Chain **guarda desde 2025-11-10**, não a cadeia inteira.
  Toda varredura mais funda devolvia nada, sem avisar.
- `concentracaoDe` devolvia **ZERO** quando a janela de gênese estava vazia. A C
  tinha 23% do supply em contratos e o painel lia "concentração zero".
- `change24h` vinha só do DexScreener, então **39 das 71 moedas** gravavam
  exatamente zero — e a trava de venda dependia desse número.

**Sempre que uma leitura puder falhar, o `null` tem de sobreviver até a decisão.**
`?? 0` é quase sempre um bug.

### 3. Preço de lixo

O JCT já foi gravado no histórico a **2,9e-27**, quinze ordens de grandeza abaixo
do preço dele, porque uma pool devolveu isso ao DexScreener. Há dois freios
independentes hoje (`lib/overview.ts` e `lib/carteira.ts`); mantenha os dois.

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
mesma: **em produção o disco é o do BUILD**, e o `ignoreCommand` do `vercel.json`
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

Quando escrever um freio, procure a outra ponta onde a mesma decisão é tomada.

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
