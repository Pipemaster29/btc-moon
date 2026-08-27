# Plano de ação

Derivado do [MELHORIAS.md](./MELHORIAS.md) (levantamento de 2026-08-26). Itens em
checklist, separados em **reativas** (consertar o que existe) e **ativas**
(construir o que falta), e ordenados por **simplicidade de execução** — do que se
resolve em minutos ao que é projeto. Dentro de cada nível, a ordem sugerida é a
listada.

Dependências que valem respeitar:

- O **CI** (ativas, nível 2) multiplica a segurança de todo o resto — vale
  antecipar para logo depois das correções de nível 1.
- **Falha ≠ vazio** em Binance/Gate vem antes do flag "sem dado de baleia",
  que depende da distinção existir.
- O **módulo de calibração** facilita as recalibrações estatísticas e a régua
  para moedas só-Gate — quem for atacar essas, considere fazê-lo antes.
- Regra do projeto que segue valendo: nenhuma regra nova vai ao Telegram sem
  passar pelo `replay` (README).

---

## Reativas

### Nível 1 — correções pontuais (minutos cada)

- [ ] Trocar `requested in TIMEFRAMES` por `Object.hasOwn(TIMEFRAMES, requested)` — `app/api/candles/route.ts:9`.
- [ ] Guardar a divisão por liquidez zero: só imprimir a fração da pool quando `liquidityUsd > 0` — `lib/alerts.ts:597`.
- [ ] Filtrar `openInterestValue > 0` (não só `isFinite`) antes da razão que classifica "alavancagem" — `lib/positioning.ts:338`.
- [ ] Trocar `??` por `||` no fallback de OI (zero legítimo hoje vira divisão por zero) — `lib/positioning.ts:538-540`.
- [ ] Incluir bloco (ou hash) na chave de deduplicação de transferências grandes, em vez de só o valor exato — `lib/alerts.ts:583-584`.
- [ ] Adicionar `AbortSignal.timeout` ao fetch da Bitstamp (único sem timeout, dentro de laço de 200 páginas) — `lib/bitstamp.ts:70`.
- [ ] Logar a exceção engolida da passada de perpétuo do monitor — `scripts/monitor.mts:209-211`.
- [ ] Condicionar o `writeFile` do estado a `!dryRun` — `--dry` hoje avança o baseline e apaga o delta do ciclo real seguinte — `scripts/monitor.mts:316-317`.
- [ ] Consertar o degrau 50× do mapa de liquidação (`1/50 − 0,025` é negativo): remover o degrau ou impor piso positivo ao `move` — `lib/liquidation.ts:25-31,65`.
- [ ] Parar de misturar praças no taker ratio: remover o fallback `b.takerRatio || g.takerRatio` — `lib/perp.ts:69`.
- [ ] Remover o campo morto `lastBlock` do estado do monitor — `scripts/monitor.mts:550`.
- [ ] Subir a permutação de `parametros` para ≥10.000 sorteios (senão o Bonferroni declarado é irresolvível) e corrigir o comentário de "nove candidatos" — `scripts/parametros.mts:382,435-438`.
- [ ] `telegram-setup` ler o token só de variável de ambiente e não ecoá-lo no stdout — `scripts/telegram-setup.mts:13,49`.
- [ ] Fixar as actions do workflow por SHA completo e adicionar `dependabot.yml` — `.github/workflows/monitor.yml`.
- [ ] Devolver mensagem genérica (e logar o detalhe) em vez de repassar erro de upstream nas três rotas de API — `app/api/candles/route.ts:22`, `app/api/kucoin/*`.

### Nível 2 — uma sessão curta (~1 hora cada)

- [ ] Escrita atômica (gravar em temp + rename) num helper único, aplicado a `.cache/monitor.json`, `wallets`, `flows`, `parametros` e `cache.mts` — `scripts/monitor.mts:317` etc.
- [ ] Headers de segurança em `next.config.ts`: CSP com `connect-src` limitado a `*.kucoin.com`, `nosniff`, `frame-ancestors 'none'`, `Referrer-Policy` — testar o WebSocket depois.
- [ ] `Cache-Control: s-maxage=3600, stale-while-revalidate` em `/api/candles`; cache de 1-2 s em `/api/kucoin/ticker`; polling do client só quando o WebSocket cair — `components/LivePriceProvider.tsx:187-190`.
- [ ] Simetrizar as janelas do topo de ciclo (mínimo de 14 pontos vs máximo do histórico inteiro) — `lib/alerts.ts:463-464`.
- [ ] Trocar o `export const caidas` mutável por valor de retorno de `getOverview` — `lib/overview.ts:197-204`.
- [ ] Try/catch em `tokenInfo`/`decodeString` para token sem `symbol()` (`BigInt("0x")` lança) — `lib/onchain.ts:240-247`.
- [ ] `encodeURIComponent` nos símbolos interpolados em URL dentro de `lib/binance.ts` e `lib/gate.ts`.
- [ ] Validar o símbolo do `radar.mts` contra a watchlist antes de virar caminho de arquivo em `.cache/` — `scripts/radar.mts:31,59`.
- [ ] `descobrir`: logar e distinguir falha de rede em vez do catch mudo que descarta o contrato certo — `scripts/descobrir.mts:330-333`.
- [ ] `parametros`: não gravar `[]` no cache quando a coleta falhou (senão a moeda fica excluída para sempre) — `scripts/parametros.mts:171-176`.
- [ ] Ler decimais via `tokenInfo` em vez de 18 hardcoded — `scripts/ciclo.mts:110`, `scripts/forense.mts:63`, `scripts/rotas.mts:119`.
- [ ] Vigia do vigia: mensagem diária de heartbeat no Telegram ou passo de notificação em falha do workflow.
- [ ] Re-checar o teto do semáforo ao acordar do `await` (e honrar tetos diferentes por chamada) — `lib/limite.ts:38-41` e cópia em `lib/datavision.ts:36-38`.
- [ ] Alinhar a premissa de sobreposição: `concurrency` serializa, mas comentários e `.gitattributes` assumem execuções sobrepostas — `.github/workflows/monitor.yml:36-38,129-130`.
- [ ] Horizonte por calendário (timestamp), não por índice, nos retornos do backtest — `scripts/backtest.mts:122`, `scripts/parametros.mts:252-253`.
- [ ] Primeira leitura de moeda com carteiras: não engolir os alertas de perpétuo, que não dependem de comparação — `scripts/monitor.mts:552-558`.

### Nível 3 — meio dia ou mais

- [ ] Consertar a corrida do workflow que apaga pontos do histórico: o fechamento faz `checkout -B` e descarta o commit da abertura quando ela perde o push. Rebase preservando (o `merge=union` só age em merge/rebase) ou abertura sem commit — `.github/workflows/monitor.yml:86-97,138-158`.
- [ ] No mesmo passo: retry sem regenerar o panorama (senão cada tentativa acrescenta outro lote de linhas ao `.jsonl`).
- [ ] Distinguir falha de rede de dado vazio em `lib/binance.ts:53-55` e `lib/gate.ts:146,187`, propagando a distinção aos consumidores (padrão já existente em `lib/dexscreener.ts`).
- [ ] Falha de leitura não vira aprovação: `coerencia === null` não pode implicar `representa = true` — `lib/lifecycle.ts:296`, `lib/overview.ts:243`.
- [ ] Flag "sem dado de baleia" quando a Gate não lista o par (hoje zeros deixam o detector estruturalmente cego), exibida nos painéis — `lib/perp.ts:38-57`. *(Depende do item anterior.)*
- [ ] Gravar linha com campos nulos no `historico-*.jsonl` quando a moeda falha, em vez de omiti-la — remove o viés de sobrevivência da série — `lib/overview.ts:199-211`, `scripts/panorama.mts`.
- [ ] Validar o `panorama.json` linha a linha (campos, enums de `estagio`/`vies`/`moveKind`, clamp de `score` 0-100) — `lib/snapshot.ts:68-75`, `app/radar/page.tsx:84-98`.
- [ ] Régua própria para moedas só-Gate no score (hoje pontuam ~40× para baixo com os cortes da Binance) — `lib/overview.ts:158`.
- [ ] Unificar as carteiras de corretora num lugar só, com procedência/`verified` (3 cópias divergentes; 2 omitem a fria grande da Binance) — `lib/lifecycle.ts:44-51`, `scripts/ciclo.mts:27-33`, `scripts/rotas.mts:24-33`.
- [ ] Grupo de controle no `replay`: medir a taxa base de quedas >8% em horas aleatórias das mesmas moedas — `scripts/replay.mts:58-73`.
- [ ] Permutação em blocos e dentro de cada data (retornos sobrepostos + fator comum com o BTC) — `scripts/backtest.mts:198-234`, `scripts/parametros.mts:382-402`.
- [ ] Separar amostra de seleção e de confirmação (a lista `promissores` é double dipping declarado) — `scripts/parametros.mts:506-513`.
- [ ] Versionar as migrations de `monitor_state`/`monitor_alerts`/`monitor_runs` e confirmar que a Edge Function exige JWT no `?test=1` — `supabase/`.

---

## Ativas

### Nível 1 — correções pontuais (minutos cada)

- [ ] `lang="pt-BR"` — `app/layout.tsx:27`.
- [ ] Varredura de código morto: `lib/supabase/*` + os dois pacotes `@supabase/*` do `package.json`, `m20` (`scripts/parametros.mts:214-217`), import `PositioningSnapshotView` (`app/radar/[symbol]/page.tsx:8`), SVGs do template em `public/`, `font-family: Arial` residual (`app/globals.css:22-26`).
- [ ] `outputFileTracingIncludes` para `data/panorama.json` entrar no bundle serverless (senão a camada 2 do snapshot não existe em produção) — `next.config.ts`.
- [ ] Mostrar a fonte do retrato sempre ("github"/"disco"/"cálculo"), não só quando é cálculo — `app/radar/page.tsx:246`.
- [ ] `applyOptions` na troca de tema em vez de destruir e recriar o gráfico (perde zoom/pan) — `components/PriceChart.tsx:111-181`.
- [ ] Acessibilidade básica: `aria-pressed` nos botões de timeframe, `scope="col"` e `<caption>` nas tabelas, `focus-visible` nos botões.

### Nível 2 — uma sessão curta (~1 hora cada)

- [ ] CI de push/PR rodando `lint`, `tsc --noEmit`, `npm run auditar` e `npm run testar-alerta` (os dois já saem com exit 1 em falha). **Vale antecipar.**
- [ ] `lib/formato.ts` único para `money`/`pct`/`signed`/`units` (~10 versões divergentes entre `lib/`, `scripts/` e componentes).
- [ ] Renomear as colisões de nome: `Alert` (radar vs alerts), `Estagio` (setup vs lifecycle), `Vela` (binance vs tecnica).
- [ ] Adotar `cachedCsv` em `backtest`, `parametros`, `ciclo`, `rotas` e `descobrir` (hoje só `radar.mts` usa) e aposentar o cache paralelo do `parametros` — `scripts/cache.mts`.
- [ ] Precedência do checklist do ciclo por chaves nomeadas em vez de índice de array — `lib/setup.ts:146-149`.
- [ ] Alerta de saúde das fontes: `caidas` acima de um teto ou fonte vazia por N ciclos → aviso no Telegram.
- [ ] Detecção de listagem/deslistagem de perpétuo (1 requisição contra a lista de contratos + diff).

### Nível 3 — meio dia ou mais

- [ ] Funding rate (Binance/Gate, 1 requisição por moeda) como sinal de "alta a crédito" — passar pelo `replay` antes de virar alerta.
- [ ] Tabela do radar interativa: ordenação/filtro client-side, coluna da moeda fixa, visão em cards no mobile — `app/radar/page.tsx:310`.
- [ ] Sparklines e gráfico por moeda a partir do `data/historico-*.jsonl` (18 mil linhas sem nenhum pixel hoje).
- [ ] Testes com vitest para as funções puras: `classificar`, `detect` (semente em `scripts/testar-alerta.mts`), `escapeMarkdown`, matemática de `liquidation.ts`, parsers de CSV.
- [ ] Módulo de tipos compartilhado entre `lib/alerts.ts` e `lib/positioning.ts` (cópias manuais hoje) e passo de build que copie/confira os arquivos duplicados em `supabase/functions/radar/`.
- [ ] Placar automático de alertas: gravar cada disparo (tipo, moeda, preço) e medir o resultado em 24/48 h — placar vivo e out-of-sample para toda regra.
- [ ] Profundidade de livro (bid/ask a ±2%) para medir "livro vazio" diretamente — idem, `replay` antes de alertar.
- [ ] Fator BTC como controle nos backtests (descontar o retorno do mercado).
- [ ] Política de crescimento do repositório: comprimir meses fechados do `.jsonl`, ou mover série longa para Releases/branch de dados (~4,6 MB/mês + ~34 commits/dia hoje).
- [ ] Pré-calcular o retrato por moeda (como o panorama fez para a tabela) — `/radar/[symbol]` faz ~30 requisições externas por render frio.

### Nível 4 — projetos (dias)

- [ ] `lib/calibracao.ts`: extrair todos os limiares nomeados (inclusive os vereditos em literais de `scripts/queda.mts:171-190` e `scripts/radar.mts:202-216`), compartilhado entre vivo, backtest e `parametros`.
- [ ] Decompor `detect` (548 linhas, `lib/alerts.ts:265-812`) e `lerVies` (407 linhas, `lib/lifecycle.ts:687-1093`) em regras testáveis isoladas.
- [ ] Comandos no bot do Telegram: `/status`, `/silenciar MOEDA 24h`, `/aposentar MOEDA`.
- [ ] Cobertura de Solana: saldo de corretora primeiro (1 chamada), varredura SPL depois — `lib/onchain.ts:157`, gap admitido no `ALERTAS.md`.
