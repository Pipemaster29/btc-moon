# Pré-registro: o open interest invertido (10/10/2026)

Escrito e commitado ANTES de rodar esta variante em qualquer janela.

## De onde veio, e por que isso importa

O teste de `docs/preregistro-oi.md` reprovou: comprar só a monstra com o open
interest SUBINDO piorou o Momento em todos os critérios. A leitura óbvia é a
inversa — a monstra que dá lucro é a que sobe com o open interest CAINDO, os
vendidos sendo espremidos —, e essa ideia **nasceu de olhar o resultado do
desenho**. Por isso o desenho não vale como teste dela: a hipótese foi escolhida
por ele. O único juiz é a reserva, que ainda não viu esta variante.

## A variante, só uma

**OI 7 d caindo** — a perna comprada do Momento publicado (`ad3fa4c9`) só entra
na moeda com o open interest em contratos de 7 dias MENOR que 7 dias antes
(< 0). O ranking dos 45 dias é percorrido em ordem, pulando quem não passa, até
completar as 5. Sem o dado, passa. Uma variante só, para não repetir o erro que
este pré-registro existe para evitar.

## O critério, fixado agora

Na reserva (01/04/2026 a 30/09/2026), contra o publicado nas mesmas datas
(+155%, Sharpe 2,62, já impresso no teste anterior):

1. Sharpe da variante maior que o do publicado;
2. sem as 5 moedas que mais deram ao publicado na reserva, a variante não pode
   render menos que o publicado sem elas.

Passou nos dois: aprovada **como candidata**, e não ligada — seis meses e uma
variante são pouco para mudar um robô que funciona, e ela ainda teria de passar
na mesa de risco (Sharpe deflacionado e walk-forward). Reprovou em algum: fica
escrita como reprovada.

O desenho é impresso junto, marcado como contaminado.
