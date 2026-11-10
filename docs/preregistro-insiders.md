# Pré-registro: criadores e VCs depositando em corretora (09/11/2026)

Escrito ANTES de ler as transferências de qualquer carteira e antes de calcular
qualquer retorno. O pedido do usuário: "ver o on-chain dos criadores e VC". O
que já foi visto: só os saldos de `data/detentores.json` (quem recebeu o supply
na gênese e quanto ainda segura) e a lista de carteiras de corretora.

## A pergunta

Quando quem recebeu o supply na criação da moeda manda token para uma corretora,
o preço cai depois, contra o mercado? É a leitura que todo mundo faz ("o time
está despejando"), e aqui ela nunca foi medida.

## O universo

- **Moedas**: as da lista (`lib/watchlist.ts`) com contrato na ETHEREUM, gênese
  medida em `data/detentores.json` com pelo menos um dono que não seja corretora
  nem endereço nulo, e perpétuo USDT na Binance com velas no cache. Onze em
  09/11: JCT, CAP, ZAMA, HEMI, MORPHO, PORTAL, BASED, RE, EPIC, DOS e POWER.
  A BASE fica fora — o Blockscout dela responde com desafio do Cloudflare a este
  endereço de IP em 09/11 (C e VVV) —, e a BNB Chain não tem fonte gratuita de
  log antigo. É "não consegui", não "não há".
- **Insiders**, em dois níveis:
  - nível 0: os donos da gênese, sem os que têm etiqueta de corretora ou de
    market maker;
  - nível 1: todo endereço que recebeu do nível 0, somado, 0,1% do supply ou
    mais, sem etiqueta de corretora, de market maker nem de pool de DEX, e que
    não seja endereço de depósito (abaixo). No máximo os 40 maiores por moeda.
- **Destino "corretora"**: endereço com etiqueta pública de corretora
  (`data/corretoras-rotuladas.json`, 26.667 endereços, mais `CARTEIRAS_CEX`), ou
  ENDEREÇO DE DEPÓSITO reconhecido pelo comportamento: recebeu de um insider
  0,02% do supply ou mais e pelo menos 80% do que ele mandou adiante daquele
  token foi para endereço com etiqueta de corretora.
- **Destino "market maker"**: as 21 carteiras de `lib/marketmakers.ts`.

Carteira cuja leitura não fechar (o explorador não entregou tudo) deixa a MOEDA
fora, contada e impressa.

## Os dois eventos, e só eles

1. **Depósito em corretora**: o dia UTC em que as transferências dos insiders
   (níveis 0 e 1) para destino "corretora" somam 0,1% do supply ou mais.
2. **Entrega a market maker**: o dia UTC em que as transferências dos insiders
   para destino "market maker" somam 0,1% do supply ou mais.

Um evento por moeda por episódio: depois de um, a moeda só volta a ter evento do
mesmo tipo 7 dias depois. Só contam eventos de dias em que o perpétuo já negocia.

## O que se mede

O retorno do perpétuo do fechamento do dia do evento ao fechamento 7 dias depois,
menos a MEDIANA do mesmo retorno de todos os perpétuos USDT da Binance com vela
nas duas pontas. 1 e 3 dias entram no registro; **7 dias é o principal**.

## O critério, fixado agora

Um evento **tem vantagem**, a favor ou ao contrário, se no horizonte de 7 dias:

- (a) pelo menos 30 eventos em 8 moedas — abaixo disso, "amostra insuficiente",
  e é o desfecho mais provável com 11 moedas;
- (b) |t| ≥ 2,5 sobre os eventos;
- (c) o mesmo sinal da média nas duas metades dos eventos, pela data;
- (d) o mesmo sinal da média sem a moeda com mais eventos.

Passar é condição para virar regra, não regra. Qualquer que seja o desfecho, a
leitura entra na página da moeda como informação — para onde foi o supply da
gênese e quando foi o último depósito —, com o veredito escrito ao lado.

Rode com: `npx tsx scripts/insiders.mts` e `npx tsx scripts/medir-insiders.mts`.

## Emenda, anterior a qualquer retorno

Duas coisas mudaram entre este texto e a primeira leitura, as duas ANTES de
calcular o retorno de qualquer evento — e ficam escritas aqui só agora, em
10/11, junto com o desfecho. Quem lê deve saber disso.

1. **Quem distribui a mais de 50 destinos é infraestrutura** (ponte, staking,
   contrato de airdrop, carteira quente sem etiqueta) e não entra no nível 1 nem
   é seguido. O texto acima não tinha essa exclusão; sem ela, todo usuário que
   sacasse de uma ponte para uma corretora contaria como depósito do time.
2. **A leitura é pelos nós públicos da Ethereum**, com `eth_getLogs` filtrado
   pelo remetente, e não pelo Blockscout: a cota dele é de dez requisições por
   ~40 minutos. A regra de "leitura que não fecha deixa a moeda fora" virou
   `faixasPerdidas`: as 11 moedas foram relidas até não perder nenhuma faixa.

## O desfecho (10/11/2026)

- 11 moedas lidas, nenhuma faixa perdida; 39 episódios de depósito em corretora
  e 2 de entrega a market maker.
- Com retorno de 7 dias medido: **31 depósitos em 5 moedas** (EPIC 13, MORPHO 7,
  PORTAL 6, HEMI 3, ZAMA 2); os outros 8 são de antes de o perpétuo listar ou de
  depois do fim das velas. O critério (a) pede 8 moedas: **amostra
  insuficiente**.
- Para o registro, e não como resultado: média +2,04 p.p. em 7 dias (t 0,43),
  mediana −4,02 p.p., metades +7,89 e −3,43 p.p., −4,97 p.p. sem a EPIC — cujos
  13 "depósitos" são a troca do token antigo pelo novo, feita pelas corretoras.
- Entrega a market maker: 1 evento com retorno. Amostra insuficiente.

Nada vira regra. A leitura entra na página como informação, com isto ao lado.
