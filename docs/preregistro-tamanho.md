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

## O resultado

(preenchido depois da medição, sem mexer em nada acima)
