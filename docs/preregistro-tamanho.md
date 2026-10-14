# Pré-registro: o tamanho de crescimento máximo (rodada 1 do loop, 11/10/2026)

Escrito e commitado ANTES de rodar qualquer uma das variantes abaixo. O commit
que traz este arquivo é a prova de ordem, como em `docs/preregistro-oi.md`.

## De onde vem

O documento de objetivos do loop pede **30% ao mês** com queda máxima de até
**50%** na curva de hora em hora. A pergunta desta rodada não é se existe vantagem
nova, é de tamanho: dentro desse teto de queda, que tamanho dos livros faz o
patrimônio crescer mais — e quanto isso aproxima da meta.

A tabela de tamanhos de `npm run medir-robos` já mostra o Momento achatando perto
de 16% ao mês a 8% por posição, com queda de −53%, na janela inteira. Ela não
separa desenho e reserva, não olha o Fluxo nem o fundo, e não diz qual tamanho
um teto de 50% escolheria. Esta rodada diz.

## As variantes, e só elas

Todas sobre os robôs publicados no `main` de 11/10 (`f88a678`), mexendo SÓ no
tamanho base (`RegrasRobo.tamanho`) — o alvo de volatilidade, a pirâmide e as
regras da corretora continuam como estão:

1. **Momento × L**, L ∈ {1; 1,25; 1,5; 1,75; 2} — de 4,25% a 8,5% por posição
   (×1,5 é o turbo de hoje).
2. **Fluxo × L**, L ∈ {1; 1,25; 1,5; 2} — de 3% a 6% por par.
3. **Fundo × L** — Momento × L e Fluxo × L em subcontas, pela paridade de risco
   publicada (`paridadeDeRisco`: inverso do desvio de 90 dias, todo dia 1º, só
   com o caixa livre), L ∈ {1; 1,5; 2; 2,5; 3}.

## As janelas

- **Desenho**: 08/01/2024 a 31/03/2026, em duas metades — até 30/06/2025 e de
  01/07/2025 a 31/03/2026.
- **Reserva**: 01/04/2026 a 30/09/2026. Só a variante escolhida roda nela antes
  da decisão; as outras, depois, para o registro.

## O que se mede

- **retorno ao mês**: (1 + retorno da janela)^(30,4375 / dias) − 1;
- **queda máxima na curva de hora em hora** — a do fundo sai das cotas de cada
  subconta marcadas hora a hora, não da curva diária;
- **sem as 5**: o desenho sem as 5 moedas que mais deram à versão ×1 de cada
  família no desenho (a mesma lista para todos os L da família; no fundo, as 5
  de cada livro).

## O critério, fixado agora

**Elegível**: queda máxima de até 50% no desenho E em cada metade, e "sem as 5"
positivo no desenho.

**Escolhida**: a elegível de maior retorno ao mês no desenho, entre as três
famílias.

**Aprovada** se, na reserva: queda máxima de até 50% E retorno ao mês maior ou
igual ao da versão ×1 da mesma família na reserva.

**O que muda se for aprovada**: sendo do Momento, ela vira o tamanho do turbo
(o robô que existe para "e se arriscasse mais?"), com o teto de 50% do documento
de objetivos escrito ao lado; sendo do Fluxo ou do fundo, ela é anotada como
candidata a um robô ao vivo próprio, e o loop decide isso na rodada seguinte.
Reprovada, fica escrita como reprovada.

**E a meta**: o retorno ao mês da escolhida em TEMPO REAL — cada livro com a
variação da grade que o walk-forward de 365 dias escolheria a cada trimestre,
rodada no tamanho escolhido — é impresso e vai para o documento de objetivos. Não
entra no critério de aprovação; entra no da meta.

## O resultado (11/10, depois do pré-registro)

`npm run medir-robos -- --tamanho`. Retorno ao mês entre parênteses; a queda é a
de hora em hora (a do fundo, das cotas de cada subconta).

| desenho, 08/01/2024 a 31/03/2026 | desenho | 1ª metade | 2ª metade | queda | sem as 5 | |
| --- | --- | --- | --- | --- | --- | --- |
| Momento ×1 (publicado) | +1.864% (11,8%) | +216% (6,7%) | +444% (20,7%) | −35,8% | +432% | elegível |
| Momento ×1,25 | +2.220% (12,5%) | +228% (6,9%) | +549% (23,1%) | −40,7% | +455% | elegível |
| **Momento ×1,5 (o turbo)** | **+2.795% (13,4%)** | +244% (7,2%) | +662% (25,3%) | **−46,0%** | +471% | **escolhida** |
| Momento ×1,75 | +3.379% (14,2%) | +253% (7,4%) | +770% (27,2%) | −50,1% | +457% | fora do teto |
| Momento ×2 | +3.627% (14,5%) | +282% (7,8%) | +797% (27,6%) | −54,9% | +443% | fora do teto |
| Fluxo ×1 (publicado) | +228% (4,5%) | +90% (3,7%) | +73% (6,3%) | −22,2% | +198% | elegível |
| Fluxo ×1,25 | +292% (5,2%) | +108% (4,2%) | +91% (7,5%) | −26,5% | +233% | elegível |
| Fluxo ×1,5 | +351% (5,8%) | +128% (4,8%) | +108% (8,5%) | −28,3% | +338% | elegível |
| Fluxo ×2 | +311% (5,4%) | +83% (3,5%) | +120% (9,1%) | −34,9% | +257% | elegível |
| fundo ×1 | +685% (8,0%) | +152% (5,3%) | +200% (13,0%) | −20,7% | +333% | elegível |
| fundo ×1,5 | +1.097% (9,7%) | +205% (6,5%) | +279% (16,0%) | −26,5% | +489% | elegível |
| fundo ×2 | +1.169% (10,0%) | +185% (6,1%) | +306% (16,9%) | −34,4% | +438% | elegível |
| fundo ×2,5 | +1.691% (11,4%) | +243% (7,2%) | +347% (18,1%) | −38,6% | +463% | elegível |
| fundo ×3 | +1.641% (11,3%) | +205% (6,5%) | +291% (16,3%) | −40,9% | +578% | elegível |

**Escolhida: Momento ×1,5 — o turbo de hoje.** O teto de 50% corta o Momento
entre ×1,5 e ×1,75 (−50,1%, por um décimo), e nem o Fluxo nem o fundo chegam
perto em retorno: o caixa recusa entradas a partir de ×1,25 (86 no Fluxo; 979 no
fundo a ×2, 2.166 a ×3), porque cada posição prende margem isolada.

| reserva, 01/04 a 30/09/2026 | retorno | ao mês | queda | Sharpe |
| --- | --- | --- | --- | --- |
| Momento ×1 | +155% | 16,8% | −30,0% | 2,62 |
| **Momento ×1,5** | **+193%** | **19,6%** | **−35,3%** | 2,47 |

✓ queda até 50% · ✓ retorno ao mês maior que o do ×1 → **APROVADA. E nada
muda nos robôs: o turbo já está nesse tamanho.** A rodada mede que ele é o
tamanho de crescimento máximo dentro do teto de queda do documento de
objetivos, e escreve isso ao lado dele em `lib/robos.ts`.

A reserva das outras, rodada só para o registro depois da decisão: Momento
×1,25 +175% · ×1,75 +213% · ×2 +229%; Fluxo ×1 +11% · ×1,25 +13% · ×1,5 +20% ·
×2 +50%; fundo ×1 +60% · ×1,5 +91% · ×2 +158% · ×2,5 +169% · ×3 +241% (queda
−40%). O fundo ×3 rendeu mais que o turbo NA RESERVA (22,6% ao mês contra
19,6%), e menos no desenho (11,3% contra 13,4%): seis meses bons não mudam a
escolha, que já estava feita.

**A meta, em tempo real.** As 144 variações do Momento rodadas a ×1,5 e o
walk-forward de 365 dias escolhendo entre elas a cada trimestre, sem saber o
que vinha: **+1.319% de 10/2024 a 09/2026 — 11,7% ao mês**, queda diária de
−36%, Sharpe 2,07. A 30% ao mês ficam faltando 18 pontos por mês: **o tamanho
não chega lá dentro de −50%.** O que falta tem de vir de vantagem nova ou de
margem que deixe o fundo crescer sem o caixa recusar.
