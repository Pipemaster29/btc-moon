-- Cache opcional de candles no Postgres.
--
-- O app funciona sem esta tabela: busca direto da Bitstamp com o cache do
-- Next.js. Ela passa a valer a pena quando você quiser granularidade fina
-- (1h/1m) em janelas longas, onde buscar ao vivo exigiria centenas de
-- requisições paginadas.
--
-- Para aplicar: cole no SQL Editor do painel do Supabase.

create table if not exists public.btc_candles (
  resolution   text             not null,
  bucket_start timestamptz      not null,
  open         double precision not null,
  high         double precision not null,
  low          double precision not null,
  close        double precision not null,
  volume       double precision not null,
  primary key (resolution, bucket_start)
);

-- A chave primária composta já serve às consultas por intervalo, que sempre
-- filtram por resolution e ordenam por bucket_start.

alter table public.btc_candles enable row level security;

-- Dados de mercado são públicos; escrita fica a cargo da service role, que
-- ignora RLS por definição.
drop policy if exists btc_candles_public_read on public.btc_candles;
create policy btc_candles_public_read
  on public.btc_candles
  for select
  to anon, authenticated
  using (true);

-- Agrega candles armazenados em períodos maiores, para não precisar guardar
-- uma tabela por timeframe. Ex.: 4h e 1d derivados de 1h.
create or replace function public.btc_candles_aggregated(
  source_resolution text,
  bucket_interval   interval,
  range_start       timestamptz default '2011-01-01'::timestamptz,
  range_end         timestamptz default now()
)
returns table (
  bucket_start timestamptz,
  open   double precision,
  high   double precision,
  low    double precision,
  close  double precision,
  volume double precision
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    to_timestamp(
      floor(extract(epoch from c.bucket_start) / extract(epoch from bucket_interval))
      * extract(epoch from bucket_interval)
    ) as bucket_start,
    (array_agg(c.open  order by c.bucket_start))[1]                as open,
    max(c.high)                                                    as high,
    min(c.low)                                                     as low,
    (array_agg(c.close order by c.bucket_start desc))[1]           as close,
    sum(c.volume)                                                  as volume
  from public.btc_candles c
  where c.resolution = source_resolution
    and c.bucket_start >= range_start
    and c.bucket_start <  range_end
  group by 1
  order by 1;
$$;
