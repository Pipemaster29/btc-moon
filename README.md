# BTC Moon 🌙

App pessoal de análise de Bitcoin usando APIs públicas (CoinGecko) e indicadores matemáticos (médias móveis, volatilidade, RSI). Construído com Next.js, Supabase e deploy na Vercel.

## Stack

- [Next.js](https://nextjs.org) (App Router)
- [Tailwind CSS](https://tailwindcss.com)
- [Supabase](https://supabase.com) (auth/dados, via `@supabase/ssr`)
- Deploy na [Vercel](https://vercel.com)

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

- `app/page.tsx` — dashboard com preço atual, SMA/EMA, volatilidade e RSI do BTC
- `lib/bitcoin.ts` — busca de preços na API pública da CoinGecko e cálculo dos indicadores
- `lib/supabase/` — clients Supabase (browser e server)

## Deploy

Conecte o repositório na [Vercel](https://vercel.com/new) e configure as variáveis de ambiente do Supabase no painel do projeto.
