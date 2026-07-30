# BTC Moon 🌙

App pessoal de análise de Bitcoin: gráfico de candles estilo plataforma de
trading com histórico desde 2011, indicadores matemáticos (médias móveis,
volatilidade, RSI) e as fases da lua sobrepostas ao preço.

## Funcionalidades

- **Candles desde agosto de 2011** nos timeframes 1H, 4H, 1D e 1S, com escala
  logarítmica (essencial quando o preço vai de US$ 10 a seis dígitos).
- **Fases da lua sobre o gráfico** — lua nova, quarto crescente, cheia e
  minguante, cada uma podendo ser ligada ou desligada.
- **Indicadores**: SMA 7/30, EMA 12, volatilidade anualizada e RSI de Wilder.

## Stack

- [Next.js](https://nextjs.org) (App Router)
- [Tailwind CSS](https://tailwindcss.com)
- [lightweight-charts](https://tradingview.github.io/lightweight-charts/) da TradingView
- [Supabase](https://supabase.com) (opcional — ver "Cache no Supabase")
- Deploy na [Vercel](https://vercel.com)

## De onde vêm os dados

Preços vêm da **API pública da Bitstamp**, sem chave nem cadastro. Ela foi
escolhida no lugar da Binance por dois motivos concretos:

1. o histórico começa em 2011, contra 2017 da Binance;
2. a API da Binance **bloqueia por geolocalização** — como funções da Vercel
   rodam por padrão na região `iad1` (EUA), chamá-la quebraria em produção
   mesmo funcionando na máquina local.

As fases da lua não vêm de API nenhuma: são calculadas pelo algoritmo de Jean
Meeus (*Astronomical Algorithms*, cap. 49), em `lib/moon.ts`. Conferido contra
efemérides publicadas, o erro fica em torno de 1 minuto.

## Rodando localmente

```bash
npm install
cp .env.example .env.local # preencha as chaves do Supabase
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

## Variáveis de ambiente

Veja `.env.example`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

## Estrutura

- `app/page.tsx` — dashboard com o gráfico e os indicadores
- `components/PriceChart.tsx` — gráfico de candles, seletor de timeframe e marcadores lunares
- `lib/bitstamp.ts` — busca paginada de candles e agregação para timeframes maiores
- `lib/moon.ts` — cálculo astronômico das fases da lua
- `lib/bitcoin.ts` — SMA, EMA, volatilidade e RSI
- `lib/supabase/` — clients Supabase (browser e server)

## Cache no Supabase (opcional)

O app **funciona sem banco**: busca direto da Bitstamp usando o cache do
Next.js. O Supabase passa a valer a pena para granularidade fina em janelas
longas — 1h desde 2012 são ~123 mil velas, que ao vivo exigiriam centenas de
requisições paginadas.

A tabela e a função de agregação estão em
`supabase/migrations/0001_btc_candles.sql`; basta colar no SQL Editor do painel.

## Deploy

Conecte o repositório na [Vercel](https://vercel.com/new). As variáveis do
Supabase só são necessárias se você usar o cache descrito acima.
