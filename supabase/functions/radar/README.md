# Edge Function `radar`

Ciclo de vigilância rodando dentro do Supabase, disparado pelo `pg_cron` a cada
10 minutos.

## Por que aqui e não no GitHub Actions

Os nós públicos da BSC só servem `eth_getLogs` da última hora. Quanto menor o
intervalo entre leituras, menor a chance de uma transferência passar sem ser
vista. O plano gratuito do Actions comporta 30 minutos; o `pg_cron` desta base
comporta 10, sem custo — porque não paga por minuto de runner.

## As regras não moram aqui

`alerts.ts` e `watchlist.ts` são cópias **verbatim** de `lib/alerts.ts` e
`lib/watchlist.ts` do repositório, enviadas no deploy. A única alteração é
mecânica: o import `./watchlist` ganha a extensão `.ts`, porque o Deno exige e o
TypeScript do Next proíbe.

Duas cópias das regras de detecção acabariam divergindo, e a que diverge
silenciosamente é sempre a que está em produção. Por isso `index.ts` contém só
o encanamento — ler a cadeia, ler o estado anterior, chamar `detect`, avisar,
gravar o novo estado.

**Ao mudar `lib/alerts.ts` ou `lib/watchlist.ts`, republique a função.**

## Tabelas

| Tabela | Para quê |
|---|---|
| `monitor_state` | saldo e gás de cada carteira na última leitura — é o que torna o próximo ciclo uma comparação em vez de um retrato solto |
| `monitor_alerts` | alertas já disparados, para o mesmo aviso não repetir por 6 horas |
| `monitor_runs` | diário de execuções, para responder "está rodando?" sem depender de ter recebido alerta |

Todas com RLS ligado e nenhuma política: só a Edge Function escreve, usando a
chave de serviço, que ignora RLS.

## Segredos

Definidos no painel do Supabase, em Edge Functions → Secrets:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

`SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` são injetados automaticamente.

## Testar

```
POST /functions/v1/radar?test=1   → manda uma mensagem de teste no Telegram
POST /functions/v1/radar          → roda um ciclo completo
```

Ambas exigem `Authorization: Bearer <chave de serviço>`.
