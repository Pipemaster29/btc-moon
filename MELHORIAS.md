# Pontos de melhoria

Levantamento de 2026-08-26 sobre o repositório inteiro — `lib/`, `scripts/`, `app/`,
workflow do GitHub Actions e `supabase/`. Dividido em melhorias **reativas**
(bugs encontrados, falhas silenciosas, robustez, segurança, validade estatística)
e **ativas** (novas análises, novas features, estrutura de código). Cada item
aponta `arquivo:linha` quando o achado é concreto.

## Maior retorno por esforço

1. **Guardar a divisão por liquidez zero** em `lib/alerts.ts:597` — hoje sai alerta com "Infinity% da liquidez".
2. **Trocar `in` por `Object.hasOwn`** em `app/api/candles/route.ts:9` — `?tf=constructor` passa pela validação.
3. **`--dry` não deveria gravar estado** — `scripts/monitor.mts:316` grava sempre, e um dry-run local apaga o delta que o ciclo real seguinte iria alertar.
4. **Headers de segurança** — `next.config.ts` está vazio: sem CSP, sem `X-Frame-Options`, sem `nosniff`.
5. **Validar o `panorama.json` vindo do GitHub raw linha a linha** — `lib/snapshot.ts:68-75` só confere o envelope, e esse JSON é a fonte primária da página.
6. **Corrigir a corrida do workflow que apaga pontos do histórico** — o `git checkout -B main origin/main` do fechamento descarta o commit da abertura quando ela perde o push (`.github/workflows/monitor.yml:97,140`).
7. **`lang="pt-BR"`** em `app/layout.tsx:27` — uma linha, hoje declara inglês numa página 100% em português.
8. **Escrita atômica do estado do monitor** (temp + rename) — arquivo truncado vira "primeira leitura" e engole todos os alertas da janela em silêncio.
9. **Não tratar falha de rede como dado ausente** em `lib/binance.ts:53` e `lib/gate.ts:146` — é o modo de falha que os próprios comentários do projeto descrevem como o mais caro já ocorrido.
10. **Grupo de controle no `replay`** — sem a taxa base de quedas de 8%, o placar do alerta de saída de baleia não tem leitura.

---

## Reativas — bugs concretos de análise

- **Alerta com percentual infinito.** `lib/alerts.ts:597` divide por `liquidityUsd` sem guarda; para as ~35 moedas sem pool mapeada o valor é 0, o piso de US$ 25 mil mantém a regra viva e a mensagem sai com `Infinity% da liquidez à vista`.
- **Deduplicação suprime o padrão que ela deveria pegar.** `lib/alerts.ts:583-584` deduplica transferências pelo valor exato (`toFixed(6)`) — mas o padrão documentado em `lib/watchlist.ts:308-326` é justamente cinco transferências de 30 milhões idênticos. Quatro das cinco seriam silenciadas por construção. Incluir bloco ou hash na chave.
- **Topo de ciclo degenerado.** `lib/alerts.ts:463-464` calcula o mínimo sobre os últimos 14 pontos mas o máximo sobre o histórico inteiro; com série longa, `houveAperto` trava em verdadeiro e o gatilho vira só "repique ≥ 25%".
- **Regras dependem de regex sobre rótulos de carteira.** `lib/alerts.ts:415-416,497-498,517-518` classificam corretora/fria/quente/dormente por regex sobre o texto livre do rótulo, ignorando o campo tipado `role: WalletRole` que já existe (`lib/watchlist.ts`). Renomear uma carteira desliga a regra sem erro — e hoje `"Bitget (quente)" → "Bitget (fria)"` casa como `hot-to-cold`, transformando movimento interno de corretora em alerta.
- **OI zero classifica como alavancagem.** `lib/positioning.ts:338-346` filtra só por `Number.isFinite`, não por `> 0`; um open interest inicial zero produz razão `Infinity`, que cruza o corte de 1,5 e sai como "alavancagem" — falso positivo.
- **Mapa de liquidação errado para 50×.** `lib/liquidation.ts:65`: com alavancagem 50× e margem de manutenção 2,5%, `1/50 − 0,025` é negativo — o preço de liquidação de um comprado fica acima da entrada, e parte desses pontos entra no mapa como bolsão legítimo.
- **Moeda só-Gate pontuada com régua da Binance.** `lib/overview.ts:158` deixa o OI da Gate entrar em `perpDominance` e o compara com cortes recalibrados para a escala da Binance (o próprio comentário registra diferença de ~40×). Moedas fora da Binance pontuam sistematicamente para baixo.
- **`??` onde deveria ser `||`.** `lib/positioning.ts:538-540`: `de.oiBinance ?? de.openInterest` não cai para o fallback quando o valor é `0` — hoje funciona por invariante externa; um zero legítimo vira divisão por zero.
- **Taker ratio mistura praças.** `lib/perp.ts:69` faz `b.takerRatio || g.takerRatio`, misturando numerador de uma corretora com dado da outra — exatamente o que o cabeçalho do próprio arquivo declara existir para impedir.
- **Estado global mutável no servidor.** `lib/overview.ts:197-204`: `export const caidas` é zerado no início de cada `getOverview`; duas requisições concorrentes corrompem a lista uma da outra. Devolver junto do resultado em vez de exportar.
- **`estagio` e `panorama` divergem para a mesma moeda.** `scripts/estagio.mts:69-70` passa `motores: 0` fixo para `lerVies`, enquanto `getPanorama` calcula o motor de verdade — os dois podem imprimir viés diferente no mesmo instante.
- **Decimais 18 hardcoded.** `scripts/ciclo.mts:110`, `scripts/forense.mts:63` e `scripts/rotas.mts:119` assumem 18 decimais em vez de ler `tokenInfo` — correto para LAB e BTW, silenciosamente errado por ordens de grandeza para qualquer token de 6 ou 9 decimais que entre nesses mapas.
- **`tokenInfo` lança sem proteção para token sem `symbol()`.** `lib/onchain.ts:240-247`: resposta `"0x"` leva a `BigInt("0x")`, que lança; `lib/radar.ts:127` chama dentro de `Promise.all` sem catch.

## Reativas — falha silenciosa lida como dado

O comentário de `lib/limite.ts:1-17` descreve o modo de falha mais caro do projeto:
"silencioso, intermitente e indistinguível de dado ausente de verdade". Ele
continua presente em vários pontos:

- **`lib/binance.ts:53-55` e `lib/gate.ts:146,187` devolvem `[]` para qualquer erro** — e alimentam todo o posicionamento. Distinguir "vazio" de "falhou" (como `lib/dexscreener.ts` já faz) e propagar a distinção.
- **Falha de leitura vira aprovação.** `lib/lifecycle.ts:296`: quando a Binance não devolve circulante, `coerencia` é `null` e `representa` vira `true` — a fração de float é publicada como confiável justamente quando não foi conferida. Mesmo padrão em `lib/overview.ts:243` (`!== false` → `true`).
- **Saída de baleia nunca dispara para moeda fora da Gate.** `lib/perp.ts:38-57` zera `whaleNet` e liquidações quando a Gate não lista o par; zero é indistinguível de "baleias neutras", então o detector fica estruturalmente cego para essas moedas sem nenhum aviso. Marcar como "sem dado de baleia" e exibir isso no painel.
- **`descobrir` contradiz o próprio docblock.** `scripts/descobrir.mts:330-333`: um `tokenInfo` que falha por rede faz o contrato *certo* ser descartado e a moeda reportada como "só perpétuo" — a mesma confusão rede-fora/conclusão que o cabeçalho do arquivo (`:120-125`) argumenta ser inaceitável.
- **Cache que memoriza falhas para sempre.** `scripts/parametros.mts:171-176` grava `[]` no cache quando a coleta falha por rede; a moeda fica permanentemente excluída de todas as execuções seguintes até alguém lembrar do `--recoletar`, e o log a conta como presente.
- **Viés de sobrevivência no histórico.** Quando uma moeda falha no panorama ela some do array (`lib/overview.ts:199-211`) e nenhuma linha entra no `data/historico-*.jsonl` naquele ciclo. As faltas não são aleatórias — concentram-se quando a fonte engasga, que tende a ser quando o mercado agita. Gravar linha com campos nulos preservaria o painel balanceado para a validação futura.
- **Primeira leitura engole alertas de perpétuo.** `scripts/monitor.mts:552-558`: na primeira leitura de uma moeda com carteiras, o `return known ? alerts : []` descarta *todos* os alertas — inclusive os de perpétuo (squeeze, saída de baleia), que não dependem de comparação com estado anterior. Uma moeda que ganha carteiras mapeadas fica um ciclo cega.
- **Perpétuo falha sem log no monitor.** `scripts/monitor.mts:209-211` engole a exceção sem imprimir nada — a moeda some da rodada sem rastro (as outras passadas logam em stderr).

## Reativas — robustez operacional

- **Corrida no workflow apaga pontos do histórico append-only.** O passo "Retrato de abertura" commita e pode perder o push (`.github/workflows/monitor.yml:97`); o passo de fechamento começa com `git checkout -B main origin/main` (`:140`), que descarta esse commit local — as linhas do `historico-*.jsonl` daquele instante somem, e o retry gera um snapshot novo, não recupera o perdido. Rebase preservando (o `merge=union` do `.gitattributes` só age em merge/rebase, não em checkout) ou não commitar na abertura.
- **Retry do panorama duplica linhas.** As três tentativas do fechamento (`monitor.yml:138-158`) rodam `npm run panorama` de novo a cada uma, e cada rodada acrescenta outro lote de linhas ao `.jsonl` com segundos de diferença.
- **Nenhuma escrita é atômica.** `scripts/monitor.mts:317`, `scripts/wallets.mts:327`, `scripts/flows.mts:140-143`, `scripts/cache.mts:28` gravam direto no destino; processo morto no meio (o job tem timeout de 60 min) deixa arquivo truncado. Para `.cache/monitor.json` a consequência é a pior: `loadState` engole o JSON inválido e o ciclo vira "primeira leitura" — todos os alertas da janela descartados em silêncio. Gravar em temp + rename.
- **Sem vigia do vigia.** Monitor morto produz o mesmo silêncio que mercado calmo. A página até mostra "parado há horas", mas o Telegram não. Um heartbeat (mensagem diária de "estou vivo" ou um passo de notificação em caso de falha do workflow) fecha o buraco.
- **Bitstamp sem timeout dentro de laço de 200 páginas.** `lib/bitstamp.ts:70` é o único `fetch` do projeto sem `AbortSignal.timeout` — e roda em laço sequencial de até 200 iterações, cada uma podendo pendurar a renderização da home.
- **Semáforo com corrida.** `lib/limite.ts:38-41` (e a cópia em `lib/datavision.ts:36-38`) checa o teto antes do `await` e incrementa sem re-checar ao acordar — sob liberações simultâneas o teto pode ser ultrapassado. Além disso, o teto registrado é o da primeira chamada por serviço.
- **Crescimento do repositório.** O histórico já está em 4,6 MB no mês (11× a estimativa do comentário em `scripts/panorama.mts:26-30`), com ~34 commits/dia do bot. Vale definir agora a política: comprimir meses fechados (`gzip`), mover série longa para GitHub Releases/branch de dados, ou aceitar o crescimento e documentá-lo.
- **Premissas contraditórias sobre sobreposição.** `monitor.yml:36-38` serializa as execuções (`concurrency`, `cancel-in-progress: false`), mas comentários (`:129-130`) e o `.gitattributes` assumem execuções sobrepostas. Alinhar o desenho — provavelmente resíduo de versão anterior.
- **Campo morto no estado.** `lastBlock` é gravado (`scripts/monitor.mts:550`) e nunca lido em lugar nenhum.

## Reativas — segurança

- **Sem nenhum header de segurança.** `next.config.ts` vazio e `vercel.json` sem bloco `headers`: falta CSP (com `connect-src` limitado a `*.kucoin.com` — hoje o endpoint de WebSocket devolvido pela KuCoin é usado sem allowlist em `components/LivePriceProvider.tsx:111-113`), `X-Content-Type-Options: nosniff`, `frame-ancestors`/`X-Frame-Options` (a página é embutível em iframe — clickjacking), `Referrer-Policy`.
- **Validação vazada pela cadeia de protótipos.** `app/api/candles/route.ts:9`: `requested in TIMEFRAMES` aceita `?tf=constructor`/`toString`/`__proto__`, que segue com `step` indefinido até virar URL com `start=NaN` na Bitstamp. `Object.hasOwn` resolve.
- **Amplificador sem teto.** `/api/kucoin/ticker` é público, sem cache e sem rate limit; cada aba aberta gera 1 requisição a cada 8 s do IP da Vercel contra a KuCoin — e o polling começa sempre, mesmo com o WebSocket de pé (`components/LivePriceProvider.tsx:187-190`). Um `s-maxage=2` ou cache em memória de 1-2 s contém o risco de 429/ban. O mesmo raciocínio vale para `/api/candles`, que re-serializa ~5.500 velas por visita sem `Cache-Control`.
- **Confiança cega no JSON do GitHub raw.** `lib/snapshot.ts:68-75` valida só o envelope; qualquer conteúdo em `moedas` é renderizado como leitura de mercado (React escapa HTML, então não há XSS — mas há conteúdo arbitrário, `class="undefined"` para enums desconhecidos e `width: ${score}%` sem clamp em `app/radar/page.tsx:84-98`). E `geradoEm` adulterado apresenta dado velho como fresco — exatamente o que o comentário do arquivo declara querer evitar. Validar campos, enums e faixas.
- **Token do Telegram em argv e stdout.** `scripts/telegram-setup.mts:13,49` recebe o token como argumento (fica no histórico do shell e na lista de processos) e o imprime. Preferir variável de ambiente e não ecoar.
- **Símbolo interpolado cru em URLs.** `lib/binance.ts:96,134,182,217` e `lib/gate.ts:101,168` não usam `encodeURIComponent`; hoje a lista branca em `app/radar/[symbol]/page.tsx:279-283` protege, mas a proteção mora fora da biblioteca — qualquer chamador novo reintroduz o problema.
- **Argumento vira caminho de arquivo.** `scripts/radar.mts:31,59` monta `.cache/radar/k-${symbol}-...` com o argv sem sanitização — `npm run radar -- ../../foo` escreve fora de `.cache/`. Severidade baixa (script local), mas é entrada não sanitizada virando path.
- **Supabase: schema de produção fora do controle de versão.** As tabelas `monitor_state`, `monitor_alerts` e `monitor_runs` que a Edge Function usa não têm migration (só `btc_candles` tem). E o `?test=1` (`supabase/functions/radar/index.ts:303-309`) dispara Telegram — conferir se a função está publicada com verificação de JWT ativa, já que não há `config.toml` forçando isso.
- **Endereços de corretora sem procedência.** `CARTEIRAS_CEX` (`lib/lifecycle.ts:44-51`) baseia todo o cálculo de float em corretora e não tem campo `verified` nem fonte documentada — ao contrário das carteiras da watchlist, que têm. Um endereço obsoleto corrompe `floatCex` e as decisões de viés que dependem dele.
- **Cadeia de suprimentos do workflow.** Fixar as actions por SHA completo (hoje `@v4`) e adicionar Dependabot/Renovate — o workflow roda `npm ci` com `contents: write` a cada meia hora.
- **Erros de upstream repassados crus ao browser** nas três rotas de API — vazamento leve de infraestrutura; devolver mensagem genérica e logar o detalhe.

## Reativas — validade estatística dos detectores

- **Permutação i.i.d. sobre retornos sobrepostos.** `scripts/backtest.mts:198-234` e `scripts/parametros.mts:382-402` embaralham rótulos como se as observações fossem independentes, mas retornos de 7 dias em dias consecutivos compartilham 6/7 da janela — o p-valor sai otimista (o n efetivo é ~1/7 do nominal). Permutar em blocos e, para o fator comum com o BTC, permutar dentro de cada data.
- **Bonferroni impresso mas não aplicável.** `scripts/parametros.mts:493-495` declara limiar corrigido de 0,0025, mas a permutação roda com 500 sorteios — resolução mínima de 0,002. Precisaria de ≥10.000 sorteios para o teste resolver o próprio limiar.
- **Double dipping declarado.** A lista `promissores` (`scripts/parametros.mts:506-513`) foi escolhida olhando o resultado da mesma amostra em que é re-testada — os p-valores da segunda tabela são decorativos. Separar amostra de seleção e de confirmação.
- **Replay sem taxa base.** `scripts/replay.mts:58-73` conta quantos episódios caíram >8% sem medir quantas horas *aleatórias* são seguidas de −8% nas mesmas moedas — sem o controle, o placar (que vai dentro da mensagem do alerta!) não tem leitura. É a lacuna mais séria da validação.
- **Horizonte por índice, não por calendário.** `scripts/backtest.mts:122` usa `b[i + h]` assumindo série diária sem buracos; qualquer dia faltante estica o horizonte sem aviso.
- **Amostra in-sample.** As moedas default do replay são exatamente os episódios que motivaram a regra. O `data/historico-*.jsonl` existe para resolver isso — priorizar a ferramenta que roda os detectores sobre essa série acumulada (out-of-sample de verdade), que hoje não existe.
- **Comentário desatualizado:** `scripts/parametros.mts:435-438` fala em "nove candidatos"; a lista tem 20.

## Ativas — novas análises

- **Funding rate.** Binance e Gate expõem por REST; custo de 1 requisição por moeda. Mede diretamente o aperto de vendidos que hoje é inferido por proxy (liquidações + razão de contas) — e funding extremo é o melhor termômetro conhecido de "alta a crédito".
- **Profundidade de livro.** O diagnóstico "livro vazio" é deduzido de OI + liquidações; um snapshot de profundidade (bid/ask a ±2%) mediria a compra sumindo *antes* da queda, não depois. Candidato a entrar no ciclo do panorama.
- **Cobertura de Solana.** Gap admitido em `ALERTAS.md` (o PRL com volume vive lá) e `CHAINS.solana` já existe com endpoints vazios (`lib/onchain.ts:157`). A varredura de transferências SPL tem API diferente, mas saldo de corretora — o alerta universal do projeto — é uma chamada só.
- **Placar automático de alertas.** Gravar cada alerta disparado (tipo, moeda, preço no momento) numa linha do histórico e medir o resultado em 24/48 h automaticamente. O placar da saída de baleia passa a ser vivo e out-of-sample em vez de medido uma vez sobre 100 h da Gate — e todo alerta novo ganha régua de graça.
- **Fator BTC como controle.** Todas as altcoins andam com o mercado; descontar o retorno do BTC nos backtests separaria "o estágio prevê" de "o mercado inteiro caiu".
- **Alerta de saúde das fontes.** `caidas` acima de um teto (ou fonte inteira devolvendo vazio por N ciclos) → aviso no Telegram. Hoje a degradação de fonte só aparece se alguém ler o log do Actions.
- **Detecção de listagem/deslistagem de perpétuo.** Listagem nova na Binance/Gate muda o regime da moeda da noite para o dia (foi o que criou o livro da BTW); é 1 requisição contra a lista de contratos e um diff.

## Ativas — features

- **Visualizar o histórico que já é coletado.** `data/historico-*.jsonl` tem 18 mil linhas e nenhum pixel: sparklines de score/float/OI por moeda na tabela do radar e um gráfico da série na página da moeda transformariam dado morto em contexto.
- **Tabela do radar interativa.** Ordenação e filtro client-side, coluna da moeda fixa no scroll horizontal e visão em cards no mobile — hoje são 14 colunas com `min-w-[1330px]` (`app/radar/page.tsx:310`) em scroll cego no celular.
- **Mostrar a fonte do retrato sempre.** `app/radar/page.tsx:246` só rotula a fonte quando é "cálculo"; quem lê não distingue "GitHub raw fresco" de "disco congelado no deploy" — a camada 1 pode estar caída há dias sem sinal.
- **Garantir que a camada 2 exista em produção.** `lib/snapshot.ts:106` lê `data/panorama.json` por caminho relativo, mas sem `outputFileTracingIncludes` no `next.config.ts` o arquivo provavelmente nem entra no bundle serverless — a falha do GitHub raw cairia direto no cálculo de ~20 s que estoura função serverless.
- **Pré-calcular o retrato por moeda.** `/radar/[symbol]` faz ~30 requisições externas por render frio — o mesmo problema que o panorama resolveu para a tabela. Estender o retrato pré-calculado ao detalhe (ou ao menos às moedas ativas).
- **Cache nas rotas de API.** `s-maxage=3600, stale-while-revalidate` em `/api/candles`; 1-2 s em `/api/kucoin/ticker`. E iniciar o polling só quando o WebSocket falhar.
- **CI de verdade.** `npm run auditar` já sai com código 1 quando acha contrato-fragmento e `npm run testar-alerta` idem em falha — falta só um workflow de push/PR que rode os dois (mais `lint` e `tsc --noEmit`).
- **Comandos no bot do Telegram.** `/status` (idade do retrato, fontes caídas), `/silenciar MOEDA 24h`, `/aposentar MOEDA` — o canal já existe, hoje é só mão única.
- **Não recriar o gráfico no toggle de tema.** `components/PriceChart.tsx:111-181` destrói e recria o chart quando o tema muda, perdendo zoom e pan; `applyOptions` resolve.
- **Acessibilidade.** `lang="pt-BR"` (`app/layout.tsx:27`); `aria-pressed` nos botões de timeframe; `scope="col"` e `<caption>` nas tabelas; tirar informação exclusiva de `title=` (invisível em touch); contraste dos textos `text-black/25`; `focus-visible`; alternativa textual para o gráfico.

## Ativas — estrutura e manutenção do código

- **Extrair as constantes de calibração para um módulo único.** Os limiares de decisão estão espalhados e alguns são decisão de trade em literais anônimos (`scripts/queda.mts:171-190` e `scripts/radar.mts:202-216` decidem VENDER/NÃO VENDER com números nus, sem nome e fora de qualquer backtest). Um `lib/calibracao.ts` com nomes daria um lugar só para recalibrar — e o backtest e o vivo passariam a compartilhar a mesma régua por construção (hoje `mesesRecentes`, janela e classificador são copiados entre `lib/lifecycle.ts`, `scripts/backtest.mts` e `scripts/parametros.mts`).
- **Unificar as carteiras de corretora.** Três cópias divergentes: `lib/lifecycle.ts:44-51` (6 endereços), `scripts/ciclo.mts:27-33` e `scripts/rotas.mts:24-33` (5 cada — ambos omitem a fria grande da Binance). Mover para `lib/watchlist.ts` com campo de procedência; de quebra elimina a dependência espúria de `lib/motor.ts:34` em `lifecycle`.
- **Tipos espelhados sem verificação.** `PerpMove`/`WhaleExitSeen` (`lib/alerts.ts:153,176`) são cópias manuais de `MoveRead`/`WhaleExit` (`lib/positioning.ts:93,136`) — o desacoplamento é deliberado, mas um módulo só de tipos (sem imports de runtime) manteria o isolamento com conformidade garantida pelo compilador. O mesmo vale para as cópias verbatim de `alerts.ts`/`watchlist.ts` dentro de `supabase/functions/radar/` — um passo de build que copie e confira resolveria o drift.
- **Formatadores duplicados com formatos divergentes.** `money`/`pct`/`signed` existem em ~10 versões entre `lib/`, `scripts/` e componentes, com casas decimais e cortes diferentes (zero vira `"—"` numa e `"+0.0%"` noutra). Um `lib/formato.ts` único.
- **Colisões de nome que armam ciladas.** `Alert` (`lib/radar.ts:69` vs `lib/alerts.ts:96`), `Estagio` (`lib/setup.ts:42`, 4 estágios de manipulação vs `lib/lifecycle.ts:53`, 8 estágios de vida) e `Vela` (`lib/binance.ts:148` vs `lib/tecnica.ts:24`) — mesmo nome exportado, semânticas incompatíveis.
- **Decompor os dois monólitos de decisão.** `detect` (`lib/alerts.ts:265-812`, 548 linhas) e `lerVies` (`lib/lifecycle.ts:687-1093`, 407 linhas) concentram a lógica do sistema; quebrar por regra tornaria cada uma testável isolada.
- **Testes para as funções puras.** `scripts/testar-alerta.mts` é a semente certa (6 casos sintéticos contra `detect`); `classificar`, `escapeMarkdown`, a matemática de `liquidation.ts` e os parsers de CSV são puros e estão a um `vitest` de distância. O projeto documenta que `classificar` foi mantida pura *para isso* (`lib/lifecycle.ts:404-410`).
- **Remover código morto.** `lib/supabase/{client,server}.ts` e os dois pacotes `@supabase/*` não são usados por nada no app Next; `lastBlock` no estado do monitor; `m20` em `scripts/parametros.mts:214-217`; import `PositioningSnapshotView` em `app/radar/[symbol]/page.tsx:8`; os 5 SVGs do template em `public/`; `font-family: Arial` residual em `app/globals.css:22-26` anulando a fonte Geist carregada no layout.
- **Adotar o cache de CSV onde ele foi feito para ser usado.** `scripts/cache.mts` existe porque os arquivos do Data Vision são imutáveis, mas só `scripts/radar.mts` o usa — `backtest`, `parametros`, `ciclo`, `rotas` e `descobrir` baixam os mesmos CSVs direto a cada execução (e `parametros` inventou um segundo cache próprio, monolítico e sem invalidação).
- **Precedência por índice de array.** `lib/setup.ts:146-149` decide o estágio do ciclo por `sinais[3]`, `sinais[2]`… acoplado à ordem dos `push` — inserir um sinal no meio reordena os estágios em silêncio. Usar chaves nomeadas.
