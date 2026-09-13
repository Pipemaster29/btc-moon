-- O arquivo: a memória que as fontes públicas apagam.
--
-- ESTA TABELA EXISTE POR CAUSA DE UM TETO MEDIDO. A Binance guarda 31 dias de
-- `openInterestHist` e nem um dia a mais — testado com `limit=500`, que devolve
-- 31 pontos. Nenhum arquivo do Data Vision traz a coluna de open interest. E o
-- salto de OI é o ÚNICO sinal deste projeto que separa para cima (26,0% de
-- chance de pump contra base de 7,1%, ver `lib/antecipar.ts`), medido justamente
-- sobre esses 31 dias.
--
-- Ou seja: o achado mais útil daqui está preso numa janela que anda sozinha e
-- que não dá para alargar olhando para trás. A única saída é começar a guardar
-- agora. Em três meses a medição tem três meses; em um ano, um ano — e aí dá
-- para testar o detector em regimes diferentes, que é o que hoje não dá.
--
-- O SEGUNDO MOTIVO É PESO. `data/historico-AAAA-MM.jsonl` cresce ~4.960 linhas
-- por dia, o que projeta ~38 MB por mês dentro do repositório, e todo clone paga
-- isso para sempre. No Postgres são 192 mil linhas por ano para os 526 símbolos,
-- que é nada.
--
-- Para aplicar: cole no SQL Editor do painel do Supabase, ou rode pelo CLI.
-- Nada no projeto depende destas tabelas existirem — sem elas, `npm run arquivar`
-- avisa e sai com zero.

-- ---------------------------------------------------------------- open interest
--
-- Uma linha por símbolo por dia, para os 526 perpétuos USDT — e não só para a
-- watchlist. A medição do detector roda sobre o universo inteiro, e guardar só
-- as 73 vigiadas deixaria o arquivo inútil para ela.

create table if not exists public.oi_diario (
  symbol        text not null,
  dia           date not null,
  -- Open interest em MOEDA, não em dólar. A distinção importa: em dólar ele se
  -- mexe quando o preço se mexe, e aí "OI subiu 30%" pode ser só o preço.
  open_interest double precision not null,
  -- A vela do mesmo dia, para o detector não precisar de uma segunda fonte.
  abertura      double precision,
  maxima        double precision,
  minima        double precision,
  fechamento    double precision,
  -- Volume em MOEDA, pelo mesmo motivo do open interest.
  volume        double precision,
  -- Quando esta linha foi gravada. Serve para saber se o coletor parou.
  gravado_em    timestamptz not null default now(),
  primary key (symbol, dia)
);

-- As duas consultas que existem são "a série deste símbolo" (coberta pela chave
-- primária) e "todos os símbolos neste intervalo de dias", que precisa desta.
create index if not exists oi_diario_dia on public.oi_diario (dia);

alter table public.oi_diario enable row level security;

-- Dado de mercado é público; a escrita é da service role, que ignora RLS.
drop policy if exists oi_diario_public_read on public.oi_diario;
create policy oi_diario_public_read
  on public.oi_diario for select to anon, authenticated using (true);

-- ---------------------------------------------------------------- as emissões
--
-- O mesmo conteúdo do `data/historico-AAAA-MM.jsonl`: uma linha por moeda por
-- retrato, com o que estava na tela naquele instante. É o que o placar lê.
--
-- O JSONL continua sendo gravado — os dois caminhos convivem de propósito. O
-- arquivo em git é o que sobrevive a este banco sumir, e já provou que serve:
-- foi dele que saíram as 68 mil emissões do placar. O Postgres é o que aguenta
-- crescer.

create table if not exists public.emissoes (
  symbol     text        not null,
  -- O carimbo do RETRATO, igual para todas as moedas da mesma execução. É o que
  -- permite calcular a maré do instante, que é a referência do placar.
  t          timestamptz not null,
  preco      double precision not null,
  liquidez   double precision,
  oi_usd     double precision,
  dominancia double precision,
  varejo     double precision,
  baleias    double precision,
  saida      double precision,
  estagio    text,
  vies       text,
  nota       integer,
  float_cex  double precision,
  float_token double precision,
  market_cap double precision,
  funding    double precision,
  primary key (symbol, t)
);

create index if not exists emissoes_t on public.emissoes (t);

alter table public.emissoes enable row level security;

drop policy if exists emissoes_public_read on public.emissoes;
create policy emissoes_public_read
  on public.emissoes for select to anon, authenticated using (true);

-- ------------------------------------------------------------------ o diário
--
-- "Está gravando?" é uma pergunta que o projeto já aprendeu a fazer do jeito
-- caro. Sem esta tabela, um coletor que parasse há duas semanas só apareceria
-- quando alguém estranhasse o número de dias numa medição.

create table if not exists public.arquivo_runs (
  id         bigserial primary key,
  quando     timestamptz not null default now(),
  tabela     text not null,
  linhas     integer not null,
  simbolos   integer not null,
  segundos   double precision,
  erro       text
);

alter table public.arquivo_runs enable row level security;

drop policy if exists arquivo_runs_public_read on public.arquivo_runs;
create policy arquivo_runs_public_read
  on public.arquivo_runs for select to anon, authenticated using (true);
