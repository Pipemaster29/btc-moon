# Alertas da BTW no Telegram

Monitor que lê a BNB Smart Chain a cada 10 minutos, compara com a leitura
anterior e avisa no Telegram quando algo indica venda a caminho.

## Ligar o Telegram (uma vez, ~3 minutos)

**1. Criar o bot**

No Telegram, abra conversa com **@BotFather** e envie `/newbot`. Ele pede um
nome e um usuário (precisa terminar em `bot`). No fim devolve um token assim:

```
8123456789:AAFxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**2. Falar com o seu bot**

O BotFather devolve um link `t.me/seu_bot`. Abra, clique em **Iniciar** e mande
qualquer mensagem. Sem isso o Telegram não deixa o bot te escrever, e o
`chat_id` não existe para ser lido.

**3. Descobrir o chat_id**

```bash
npm run telegram-setup -- 8123456789:AAFxxxxx
```

Ele imprime o `chat_id` — um número como `1234567890`.

**4. Guardar as credenciais**

Para rodar na sua máquina, em `.env.local`:

```
TELEGRAM_BOT_TOKEN=8123456789:AAFxxxxx
TELEGRAM_CHAT_ID=1234567890
```

Para rodar 24h sozinho, no GitHub: **Settings → Secrets and variables →
Actions → New repository secret**, criando os dois com os mesmos nomes.

**5. Testar**

```bash
npm run monitor -- --test
```

Deve chegar uma mensagem no Telegram na hora.

## Ligar as 24 horas

O arquivo `.github/workflows/monitor.yml` já está no repositório. Assim que os
dois secrets existirem, ele roda sozinho de 10 em 10 minutos.

Para disparar à mão e conferir: aba **Actions → Radar BTW → Run workflow**.

## O que dispara alerta

Ordenado por quanta antecedência dá, que é o que importa — não pelo tamanho.

| Alerta | Antecedência | Por que funciona |
|---|---|---|
| ⛽ **Gás chegando** | minutos | Carteira sem BNB não move token nenhum. Abastecer é passo obrigatório antes de vender, e ninguém abastece por acaso uma carteira parada há semanas com milhões dentro. Hoje 8 carteiras seguram US$ 105 mi com 0 BNB. |
| 🧪 **Transferência de teste** | ~15 min | Em 16/08 saíram 66 e 120 BTW antes dos 8 e 12 milhões, com 13 e 16 minutos de intervalo. Quem vai mover US$ 4 mi confere o endereço antes. |
| 🔓 **Trava se mexendo** | imediato | 84,94% do supply está travado em contrato. Qualquer saída dali é o evento mais grave possível para o preço. |
| 🧊→🔥 **Fria para quente** | horas | Carteira fria não vende; abastece a quente, que vende. Em 16/08 essa sequência precedeu a distribuição em ~12 horas. |
| 🆕 **Destino recém-criado** | imediato | Padrão de quebrar a trilha antes de distribuir, igual às duas carteiras de 16/08. |
| 🏦 **Entrada em corretora** | imediato | Token indo para corretora costuma ser o passo anterior à venda no livro. |
| 📤 **Saída de carteira vigiada** | imediato | Movimento acima de 5% da liquidez à vista. |

O que **não** virou alerta, de propósito: queda de preço, volume alto, variação
de open interest isolada. São consequências, não avisos — quando aparecem, já
aconteceu.

## Sem alarme falso repetido

Cada alerta tem uma identidade e não repete por 6 horas. A identidade inclui a
ORDEM DE GRANDEZA do valor, não o valor exato: assim um segundo movimento de
US$ 30 mil na mesma carteira fica calado, mas um de US$ 3 milhões passa.

Os limiares de entrada e saída são **relativos ao tamanho da carteira**, não um
valor fixo. Uma corretora movimenta depósito e saque de clientes o tempo todo:
US$ 30 mil saindo de uma carteira com US$ 6 milhões é rotina. A mesma quantia
saindo de uma carteira parada é o evento inteiro. Trava é exceção — qualquer
saída conta, porque ela não deveria se mexer nunca.

Há também um teto de 6 alertas por rodada. Se algo disparar dezenas de uma vez,
mandar todos é o mesmo que não mandar nenhum: os mais graves passam e o resto
vira uma linha de resumo.

Todo alerta começa com o símbolo da moeda, porque o monitor vigia mais de uma.

## Comandos

```bash
npm run monitor              # um ciclo, envia ao Telegram
npm run monitor -- --dry     # um ciclo, só mostra no terminal
npm run monitor -- --test    # manda uma mensagem de teste
npm run telegram-setup -- TOKEN
```

## Limites conhecidos

**A janela de log é de uma hora.** Os nós públicos da BSC só servem
`eth_getLogs` dos últimos ~8 mil blocos. A cadência de 10 minutos dá seis
leituras por janela, folga suficiente para o agendamento atrasar — o que
acontece sob carga — sem abrir buraco. Mesmo num atraso grande, os alertas de
saldo e de gás continuam pegando a mudança, porque comparam retratos; só os de
teste e de carteira nova dependem de ver a transferência passar.

**O custo é zero porque o repositório é público.** Em repositório público o
GitHub não cobra minutos de execução. Se ele voltar a ser privado, o teto de
2.000 minutos mensais passa a valer e esta cadência custaria cerca de US$ 18 por
mês — nesse caso o certo é voltar para 30 minutos, editando o `cron` do
workflow.

**A memória vive no cache do GitHub Actions.** Se o cache for descartado, o
ciclo seguinte vira "primeira leitura" e não alerta nada naquela rodada. É uma
falha silenciosa mas segura: perde-se uma comparação, não se ganha alarme falso.

**Não cobre a Solana.** O PRL que tem volume é o Perle, que vive lá. Este
monitor só lê BSC.
