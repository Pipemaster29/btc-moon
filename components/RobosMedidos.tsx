/**
 * A aba "Medição" dos robôs: como cada regra de hoje teria ido desde 01/2024,
 * no mesmo motor que roda ao vivo, com o custo da vida real dentro.
 *
 * A RESSALVA FICA NA TELA, não num comentário: o lucro medido da perna
 * comprada vem de poucas moedas, e a melhora de cada regra nova sobre a
 * anterior não vale em todo trimestre — a de 09/10 ganha em 6 de 11. Quem olha
 * a curva bonita precisa ler isso ao lado dela, e por isso a regra anterior
 * entra no gráfico e na tabela, medida no mesmo modelo. Os textos que eram uma
 * parede de parágrafos embaixo da tabela viraram cartões com título: são as
 * mesmas ressalvas, achadas pelo assunto.
 */

import { CAPITAL_ROBO, TAXA, type ArquivoRobos, type Medicao, type MedicaoRobo } from "@/lib/robos";
import CurvaRobos, { type SerieRobo } from "./CurvaRobos";
import { CURTO, corDe, fracao, nomeDe, pct, tom, usd } from "./robosFormato";

/** Uma linha da tabela da medição; a de referência sai apagada, para não ser lida como robô. */
function LinhaMedicao({ m, nome, referencia }: { m: MedicaoRobo; nome: string; referencia?: boolean }) {
  const [tudo, dentro, fora] = m.linhas;
  return (
    <tr className={`border-t border-black/5 dark:border-white/5 ${referencia ? "text-black/45 dark:text-white/45" : ""}`}>
      <td className="py-1.5 pr-3">
        {nome}
        {referencia && <span className="ml-1.5 text-[10px]">(regra anterior)</span>}
      </td>
      <td className={`py-1.5 pr-3 text-right ${referencia ? "" : tom(tudo.retorno)}`}>{pct(tudo.retorno, 0)}</td>
      <td className={`py-1.5 pr-3 text-right ${referencia ? "" : tom(dentro.retorno)}`}>{pct(dentro.retorno, 0)}</td>
      <td className={`py-1.5 pr-3 text-right ${referencia ? "" : tom(fora.retorno)}`}>{pct(fora.retorno, 0)}</td>
      <td className="py-1.5 pr-3 text-right">{pct(tudo.quedaMaxima, 0)}</td>
      <td className="py-1.5 pr-3 text-right">{tudo.sharpe.toFixed(2)}</td>
      <td className="py-1.5 pr-3 text-right">
        {pct(m.semAMelhor.retorno, 0)} <span className="text-black/40 dark:text-white/40">sem {m.semAMelhor.symbol.replace(/USDT$/, "")}</span>
      </td>
      <td className="py-1.5 text-right" title={m.semAs5 ? `sem ${m.semAs5.symbols.map((s) => s.replace(/USDT$/, "")).join(", ")}` : undefined}>
        {m.semAs5 ? (
          <>
            <span className={referencia ? "" : tom(m.semAs5.retornos[0])}>{pct(m.semAs5.retornos[0], 0)}</span>
            {" · "}
            <span className={referencia ? "" : tom(m.semAs5.retornos[2])}>{pct(m.semAs5.retornos[2], 0)}</span>
          </>
        ) : (
          "—"
        )}
      </td>
    </tr>
  );
}

/** Um cartão de ressalva: o título diz o assunto, o texto é o de antes. */
function Nota({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 p-4">
      <h3 className="text-sm font-semibold">{titulo}</h3>
      <div className="text-xs text-black/60 dark:text-white/60 mt-1.5 leading-relaxed">{children}</div>
    </div>
  );
}

export default function RobosMedidos({ arquivo, medicao }: { arquivo: ArquivoRobos | null; medicao: Medicao | null }) {
  const robos = arquivo?.robos ?? [];
  const medidos = medicao?.robos ?? [];
  if (!medicao || medidos.length === 0) {
    return <p className="text-sm text-black/45 dark:text-white/45">A medição ainda não foi gravada: <code>npm run medir-robos</code>.</p>;
  }
  // A regra anterior do Momento, medida no MESMO modelo realista: é contra ela
  // que a melhora se lê, e ela entra em cinza, como contexto.
  const anterior = medicao.referencias?.find((m) => m.id === "momento-anterior");
  const series: SerieRobo[] = medidos.map((m) => {
    const nome = nomeDe(m.id, robos);
    return { id: m.id, rotulo: nome, curto: CURTO[m.id] ?? nome, cor: corDe(m.id), pontos: m.curva };
  });
  if (anterior) {
    series.push({
      id: anterior.id,
      rotulo: "Momento anterior (vendida do mesmo tamanho em toda moeda, 4%)",
      curto: "Antes",
      cor: "var(--robo-ctx)",
      contexto: true,
      pontos: anterior.curva,
    });
  }
  const corte = medidos[0]?.linhas.find((l) => l.janela.startsWith("fora"))?.de;
  const momento = medidos.find((m) => m.id === "momento");
  const fluxo = medidos.find((m) => m.id === "fluxo");
  const grandes = medidos.find((m) => m.id === "grandes");
  // Quanto do resultado sobra sem as cinco moedas que mais deram: é a medida de concentração.
  const sobra = (m: MedicaoRobo | undefined) => (m?.semAs5 && m.linhas[0].retorno > 0 ? m.semAs5.retornos[0] / m.linhas[0].retorno : null);
  const real = medicao.realismo;
  // O livro de ofertas lido em cada entrada ao vivo (`scripts/robos.mts`), contra a régua do motor.
  const lidas = robos.flatMap((e) => [
    ...e.abertas.filter((p) => p.livro !== undefined).map((p) => ({ livro: p.livro as number, regua: p.custoLado - TAXA })),
    ...e.fechadas.filter((t) => t.livro !== undefined && t.custoLado !== undefined).map((t) => ({ livro: t.livro as number, regua: (t.custoLado as number) - TAXA })),
  ]);
  const mediana = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  const corretoraMomento = real?.corretora?.robos.find((r) => r.id === "momento");

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-xl border border-black/10 dark:border-white/10 p-5">
        <CurvaRobos
          series={series}
          capital={CAPITAL_ROBO}
          titulo="Medido · as regras de hoje desde 01/2024, com o custo da vida real (escala log)"
          log
          corte={corte ? { t: corte, rotulo: "fora da amostra →" } : undefined}
        />
        <div className="overflow-x-auto mt-4">
          <table className="w-full text-xs tabular-nums">
            <thead className="text-black/40 dark:text-white/40">
              <tr className="text-left">
                <th className="py-1 pr-3 font-normal">robô</th>
                <th className="py-1 pr-3 font-normal text-right">01/2024–09/2026</th>
                <th className="py-1 pr-3 font-normal text-right">dentro (até 06/2025)</th>
                <th className="py-1 pr-3 font-normal text-right">fora (07/2025 →)</th>
                <th className="py-1 pr-3 font-normal text-right">queda máx</th>
                <th className="py-1 pr-3 font-normal text-right">Sharpe</th>
                <th className="py-1 pr-3 font-normal text-right">sem a melhor moeda</th>
                <th className="py-1 font-normal text-right">sem as 5 melhores: inteira · fora</th>
              </tr>
            </thead>
            <tbody>
              {medidos.map((m) => (
                <LinhaMedicao key={m.id} m={m} nome={nomeDe(m.id, robos)} />
              ))}
              {anterior && <LinhaMedicao m={anterior} nome="Momento anterior" referencia />}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-black/50 dark:text-white/50 mt-3">
          É o formato de todo seguidor de tendência — perde pouco quase sempre e ganha muito de vez em quando —, e a tese só
          segue de pé enquanto aparecerem monstras
          {momento?.semAs5 && (
            <>
              : tiradas as cinco que mais deram ({momento.semAs5.symbols.map((s) => s.replace(/USDT$/, "")).join(", ")}), o
              Momento vai de {pct(momento.linhas[0].retorno, 0)} para {pct(momento.semAs5.retornos[0], 0)}
            </>
          )}
          . O Caça-monstra é a tese pura, e perdeu o primeiro ano e meio inteiro — nem a saída por posto nem o alvo de
          volatilidade passaram nele. Mais tamanho rende mais e cai mais, até o caixa acabar: a partir de 5% ele começa a
          recusar entrada e o Sharpe cai. Medição de {new Date(medicao.geradoEm).toISOString().slice(0, 10)},{" "}
          {medicao.universo.moedas} moedas: <code className="text-[11px]">npm run medir-robos</code>.
        </p>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        {momento && anterior && (
          <Nota titulo="O que mudou, e o que isso não prova">
            A vendida perde dinheiro na soma e mesmo assim segura 2024 — sem ela o dentro da amostra quase some. Agora cada
            venda entra com o tamanho pela volatilidade da própria moeda: a duas vezes mais agitada que a do meio, com metade.
            Não é que a moeda agitada seja venda ruim (ela rende mais por margem e estopa mais); é o risco repartido entre as
            vendidas em vez de concentrado nas que mais pulam. No mesmo modelo e na mesma queda máxima (4,25% por posição
            contra os 4% de antes), a janela inteira vai de {pct(anterior.linhas[0].retorno, 0)} para{" "}
            <strong>{pct(momento.linhas[0].retorno, 0)}</strong>, o dentro da amostra de {pct(anterior.linhas[1].retorno, 0)}{" "}
            para {pct(momento.linhas[1].retorno, 0)} e o fora de {pct(anterior.linhas[2].retorno, 0)} para{" "}
            {pct(momento.linhas[2].retorno, 0)}
            {anterior.semAs5 && momento.semAs5 && (
              <>
                ; sem as cinco melhores moedas, o fora vai de {pct(anterior.semAs5.retornos[2], 0)} para{" "}
                {pct(momento.semAs5.retornos[2], 0)}
              </>
            )}
            , com o Sharpe maior nas duas metades. Atacada com custo de entrada 4x e escorregada do stop dobrada, continua
            acima da anterior; e não ganha em todo trimestre — em 6 de 11. Na comprada a mesma regra derruba o resultado: as
            monstras são as moedas mais agitadas. <strong>O que não muda</strong>: o lucro mora na cauda.
            {momento.piramide && (
              <>
                {" "}
                A segunda parcela entrou em {momento.piramide.comParcela.toLocaleString("pt-BR")} de{" "}
                {momento.piramide.compras.toLocaleString("pt-BR")} compras, e foram essas que fizeram o lucro da perna:{" "}
                {usd(momento.piramide.resultadoCom, 0)}, enquanto as outras{" "}
                {(momento.piramide.compras - momento.piramide.comParcela).toLocaleString("pt-BR")}{" "}
                {momento.piramide.resultadoSem < 0
                  ? `perderam ${usd(-momento.piramide.resultadoSem, 0)}`
                  : `fizeram ${usd(momento.piramide.resultadoSem, 0)}`}
                .
              </>
            )}
          </Nota>
        )}
        {fluxo && momento && (
          <Nota titulo="O Fluxo, e por que ele está aqui">
            Saiu de uma rodada de livros diferentes do momento, medidos do mesmo jeito — e quase todos reprovaram: coletar o
            financiamento na hora da cobrança (desde 07/2025 o preço cai o que a cobrança paga), carry, reversão curta,
            loteria, vender listagem nova. O que passou foi o FLUXO: a moeda em que a venda a mercado dominou os últimos 7
            dias continua indo pior que o resto. Vendida contra uma compra de ETH do mesmo tamanho, a aposta deixa de ser no
            mercado e passa a ser nela: {pct(fluxo.linhas[0].retorno, 0)} na janela inteira, {pct(fluxo.linhas[1].retorno, 0)}{" "}
            dentro e {pct(fluxo.linhas[2].retorno, 0)} fora, Sharpe {fluxo.linhas[0].sharpe.toFixed(2)} contra{" "}
            {momento.linhas[0].sharpe.toFixed(2)} do Momento. <strong>Rende menos, e o lucro dele não mora em cinco moedas</strong>
            {sobra(fluxo) !== null && sobra(momento) !== null && (
              <>
                : sem as cinco que mais deram, sobram {pct(sobra(fluxo) as number, 0).replace("+", "")} do lucro dele, contra{" "}
                {pct(sobra(momento) as number, 0).replace("+", "")} no Momento
              </>
            )}
            . Se as monstras pararem de aparecer, o Momento seca; este não depende delas. Atacado com custo 4x, escorregada
            dobrada e entrada atrasada, e com cada peça mexida sozinha, ficou positivo em tudo.
          </Nota>
        )}
        {real && (
          <Nota titulo="O que a medição cobra da vida real">
            O stop não sai no nível: medido em velas de 1 minuto, o preço passa dele dentro do minuto do disparo, e cada saída
            paga {fracao(real.escorregadaStop)} do resto da vela além do nível (~0,3% em média). A entrada paga{" "}
            {fracao(real.custoAtraso)} pelo atraso até o primeiro retrato depois da meia-noite, e ordem abaixo de{" "}
            {usd(real.nocionalMinimo, 0)} é recusada, como na Binance. A segunda parcela sai acima do gatilho pela mesma
            escorregada, e o stop sobe para dentro da nova liquidação — sem isso a corretora fecharia a posição inteira antes
            dele. Taxa, escorregada pela liquidez, financiamento real e as moedas deslistadas já estavam na conta.
            {lidas.length > 0 ? (
              <>
                {" "}
                E o custo é conferido ao vivo: nas {lidas.length} entrada{lidas.length === 1 ? "" : "s"} em que o robô leu o
                livro de ofertas, uma ordem a mercado do tamanho dela custaria {fracao(mediana(lidas.map((x) => x.livro)))} por
                lado (mediana), contra {fracao(mediana(lidas.map((x) => x.regua)))} que a régua cobra — sem a taxa nos dois.
              </>
            ) : (
              <>
                {" "}
                Num retrato do livro de ofertas de 08/10, a régua cobrava de 3 a 7 vezes o que uma ordem destas custaria; ela
                só muda com amostra na hora da entrada, que cada entrada ao vivo passa a ler.
              </>
            )}
          </Nota>
        )}
        {real?.corretora && (
          <Nota titulo="As regras da Binance">
            A medição usa a tabela pública de degraus de margem de {real.corretora.em.split("-").reverse().slice(0, 2).join("/")}:
            nas moedas que fizeram o lucro do Momento a margem de manutenção é de 5% até US$ 10 mil, e a 2x a corretora
            liquidaria a vendida em +43%, antes do stop de 45%. Por isso cada posição entra com a margem que põe a liquidação
            depois do stop, a liquidação segue a fórmula da margem isolada com o financiamento saindo da margem, a margem é
            reposta de hora em hora quando o financiamento a come, e cada ordem respeita o lote e o mínimo da moeda — o que se
            faz numa conta de verdade.
            {corretoraMomento && (
              <>
                {" "}
                No Momento, {corretoraMomento.comMargemAMais.toLocaleString("pt-BR")} de{" "}
                {corretoraMomento.vendidas.toLocaleString("pt-BR")} vendidas precisaram de margem a mais,{" "}
                {corretoraMomento.liquidadas === 0 ? "nenhuma foi liquidada" : `${corretoraMomento.liquidadas} foram liquidadas`}, e
                a janela inteira vai de {pct(corretoraMomento.semRegras, 0)} sem as regras para {pct(corretoraMomento.comRegras, 0)}{" "}
                com elas.
              </>
            )}
          </Nota>
        )}
        <Nota titulo="Dá para fazer na vida real?">
          O que a conta de cima não cobre, e decide. As regras foram escolhidas olhando 2024–2026 inteiro, então a medição é
          otimista por construção: o teste que falta é o ao vivo contra a faixa medida de cada cartão, e ele leva meses. O
          stop móvel de 30% não existe como ordem na Binance (a nativa vai até 10%): um robô precisa movê-lo de hora em hora —
          mexendo nele só a cada 4 horas, o Momento medido cai de +5.928% para +4.149%. A tabela de degraus é a de hoje
          aplicada ao passado. E as quedas de −36% do Momento e −46% do turbo aconteceram na medição e voltam a acontecer. Com
          US$ 1.000, as ordens já encostam no mínimo da Binance: a vendida mais agitada do Momento entra com ~US$ 11, e o Fluxo
          só opera a partir de 3% por par — a 2%, a ordem de ETH fica abaixo dos US$ 20 exigidos e nenhum par abre. Para ligar
          com dinheiro de verdade: conta de futuros da Binance onde ela for permitida, chave de API só de negociação (sem
          saque), uma máquina que rode o robô toda hora — o GitHub Actions deste projeto já ficou horas parado — e uma subconta
          por robô.
        </Nota>
        {grandes && (
          <Nota titulo="Só moedas grandes?">
            O robô das grandes responde a “e se só moeda de US$ 2 bi para cima?”: o universo de cada dia, do retrato semanal da
            CoinMarketCap casado com o perpétuo pelo preço — de 22 a 42 moedas, conforme o trimestre. Em 41 tentativas no desenho
            (01/2024–03/2026), comprar as que sobem perdeu, a reversão foi comida pelo custo, e a melhor — a tendência das duas
            pernas em 45 dias — fez +34% em 27 meses, abaixo do BTC parado em Sharpe. Na reserva (04–09/2026), fechada até a
            escolha, fez +49% contra +23% do BTC, mas todo esse ganho era de posições ainda abertas em 30/09, metade numa só
            (ZEC), num semestre em que 25 de 28 variações também ganharam. E <strong>reprovou no ataque</strong>: com a entrada a
            0,4% em vez de 0,1%, o desenho vira −9%. Escolhendo a melhor variação a cada trimestre pelo ano anterior, desde
            10/2024 teria perdido 51%. Na janela inteira, {pct(grandes.linhas[0].retorno, 0)} com queda de{" "}
            {pct(grandes.linhas[0].quedaMaxima, 0)} e Sharpe {grandes.linhas[0].sharpe.toFixed(2)}
            {grandes.semAs5 && <> ({pct(grandes.semAs5.retornos[0], 0)} sem as cinco melhores moedas)</>}. Está na arena para a
            pergunta ter resposta ao vivo, não porque passou:{" "}
            <code className="text-[11px]">docs/preregistro-grandes.md</code>.
          </Nota>
        )}
        <Nota titulo="É lógica ou sorte?">
          Medido com o mesmo motor em 13/10 (<code className="text-[11px]">npm run medir-robos -- --placebo</code>): com o mesmo
          stop, rastro, pirâmide, custo e a mesma quantidade de entradas por dia, escolher as moedas ao acaso perde 76% na
          mediana de 40 sorteios, e nenhum sorteio chega ao Momento em nenhuma metade da janela. A gestão sozinha não ganha
          dinheiro; quem ganha é a escolha pelo momento. Mas cada perna sozinha empata com o acaso numa metade — a compra até
          06/2025, a venda depois —, e o que parece erro é o desenho: só uma em quatro compras dá lucro, e os 10 melhores
          trades de 2.388 fazem mais que o lucro inteiro.
        </Nota>
      </div>
    </div>
  );
}
