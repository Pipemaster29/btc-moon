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

## A lua prevê o preço? Não.

Em `/analise` o app testa a hipótese a sério, e a resposta é negativa.

Varrendo **11.520 combinações** de fase, antecedência, permanência, stop loss e
direção (comprado ou vendido) sobre 15 anos de preço, a melhor rende **89.172x**
contra 5.896x de comprar e segurar. O número impressiona — e é enganoso.

Repetindo a busca inteira sobre **calendários lunares deslocados no tempo**
(luas falsas), a melhor combinação rende na mediana **61.019x** e chega a
**130.113x**. De 300 calendários inventados, **49 superaram a lua real**:
**p = 0,17**, sem significância.

E isso não depende do recorte. Comparar contra "segurar desde 2011" seria uma
referência inflada — aquele Bitcoin era ilíquido e não voltou — então cada ano
de entrada foi testado por conta própria. **Quanto mais recente o período, pior
a lua fica:**

| Entrada | Segurar até hoje | CAGR | Melhor c/ lua real | Melhor c/ lua falsa | Falsas que ganharam | p |
| --- | --- | --- | --- | --- | --- | --- |
| 2011 | 5.896x (+589.600%) | 78,7% | 89.172x | 61.019x | 49/300 | 0,166 |
| 2015 | 205x (+20.380%) | 58,4% | 687x | **972x** | 219/300 | 0,731 |
| 2016 | 148x (+14.714%) | 60,4% | 377x | **497x** | 237/300 | 0,791 |
| 2018 | 4,8x (+378%) | 20,0% | 25,5x | **27,5x** | 219/300 | 0,731 |
| 2019 | 16,8x (+1.581%) | 45,1% | 37,6x | **38,9x** | 199/300 | 0,664 |
| 2020 | 9,0x (+795%) | 39,6% | 18,3x | 18,2x | 142/300 | 0,475 |

De 2015 em diante a lua **falsa** rende mais que a verdadeira. E a fase vencedora
troca a cada recorte — nova em 2011 e 2015, minguante em 2016/2018/2020, cheia em
2019. Se houvesse efeito real, a mesma fase venceria sempre.

### Comprado vs. vendido

A varredura cobre as duas direções (11.520 combinações). Vender a descoberto na
lua cheia perde em todos os períodos — de 1,0x a 0,5x — mas isso não é sinal
lunar: vender um ativo que subiu perde com qualquer calendário. O único p abaixo
de 0,05 aparece em 2011 (0,037) e não replica em nenhum dos outros cinco
recortes; com doze testes, um acerto desses é o esperado por acaso.

A melhor combinação de **todos** os períodos é comprada, nunca vendida.

Reproduza com `npm run analyze` (período completo) e `npm run periods`
(comparação por ano de entrada).

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
