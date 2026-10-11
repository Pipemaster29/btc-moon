# Pré-registro: open interest na compra do Momento (10/10/2026)

Escrito e commitado ANTES de baixar um único arquivo de open interest. O commit
que traz este arquivo é a prova de ordem: o resultado não pode ter escolhido a
pergunta.

## A pergunta

A monstra que o Momento compra (as 5 que mais subiram em 45 dias) sobe por dois
motivos que o preço não separa:

- **demanda alavancada nova** — o open interest em CONTRATOS cresce junto com o
  preço: gente abrindo comprado. É combustível que ainda não foi gasto.
- **vendido sendo espremido** — o preço sobe com o open interest CAINDO: quem
  fecha é o vendido recomprando. Acaba quando acabam os vendidos.

Se a distinção vale, comprar só o primeiro tipo melhora a perna comprada.

## A variável

`sum_open_interest` (em contratos, não em dólar — o dólar sobe com o preço e
tornaria a variável o próprio momento) dos arquivos diários de métricas do Data
Vision da Binance (`data/futures/um/daily/metrics/`), público e sem chave. O
valor de cada decisão (meia-noite UTC do dia D) é a ÚLTIMA linha do arquivo do
dia D−1. Variação de d dias: `oi(D) / oi(D − d) − 1`.

`sum_toptrader_long_short_ratio`, do mesmo arquivo, para a terceira hipótese.

## As três variantes, e só elas

Todas sobre o Momento publicado no `main` de 10/10 (`ad3fa4c9`), mexendo SÓ na
seleção da perna comprada: o ranking dos 45 dias é percorrido em ordem e pula a
moeda que não passa, até completar as 5.

1. **OI 7 d** — compra só com o open interest de 7 dias crescendo (> 0).
2. **OI 14 d** — o mesmo com 14 dias.
3. **Top traders 7 d** — compra só com a razão comprado/vendido dos maiores
   traders maior que 7 dias antes.

Moeda sem o dado (arquivo que falta, série curta) **passa**: falta de leitura não
pode virar veto. O script conta quantas passaram assim.

## As janelas

- **Desenho**: 08/01/2024 a 31/03/2026, em duas metades — até 30/06/2025 e de
  01/07/2025 a 31/03/2026.
- **Reserva**: 01/04/2026 a 30/09/2026. Nenhuma variante é rodada nela antes da
  escolha.

Ressalva honesta: a reserva é limpa para o open interest, não para o Momento.
As regras do Momento foram ajustadas olhando até 09/2026, então a reserva mede
se o filtro acrescenta algo à regra, não se a regra funciona.

## O critério de aprovação, fixado agora

No desenho, contra o Momento publicado nas mesmas datas, a variante precisa:

1. ter Sharpe maior na janela inteira do desenho;
2. não ter Sharpe menor em nenhuma das duas metades;
3. não render menos sem as 5 moedas que mais deram ao publicado no desenho.

Das que passarem, só UMA vai para a reserva: a de maior Sharpe no desenho. Ela
é aprovada se, na reserva, o Sharpe dela não for menor que o do publicado. Senão
reprova — e a reprovação fica escrita em `lib/robos.ts`, como as outras.

Depois da decisão, as três são rodadas na reserva e os números vão para o
registro, para ninguém precisar acreditar na escolha.

## O resultado (10/10, depois do pré-registro)

`npm run medir-robos -- --oi`, com 467.525 arquivos diários baixados e o dado
lido em 90% das moeda-dia do desenho.

| desenho, 08/01/2024 a 31/03/2026 | desenho | 1ª metade | 2ª metade | sem as 5 | queda |
| --- | --- | --- | --- | --- | --- |
| publicado | +1.864% (2,40) | +216% (1,56) | +444% (3,65) | +432% | −36% |
| OI 7 d | +862% (1,87) | +174% (1,39) | +190% (2,34) | +219% | −45% |
| OI 14 d | +797% (1,78) | +128% (1,17) | +254% (2,63) | +219% | −43% |
| Top traders 7 d | +304% (1,36) | +26% (0,53) | +196% (2,50) | +28% | −45% |

Entre parênteses, o Sharpe. **Nenhuma passou em nenhum critério: o filtro
REPROVA sem chegar à reserva.** A reserva, rodada só para o registro:

| reserva, 01/04 a 30/09/2026 | retorno | Sharpe | queda |
| --- | --- | --- | --- |
| publicado | +155% | 2,62 | −30% |
| OI 7 d | +42% | 1,18 | −47% |
| OI 14 d | +3% | 0,45 | −53% |
| Top traders 7 d | +98% | 1,85 | −26% |
