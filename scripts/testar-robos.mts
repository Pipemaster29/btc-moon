/**
 * Os casos-limite do motor dos robôs (`lib/robos.ts`), sem tocar em rede.
 *
 * O motor é o mesmo da medição e do ao vivo, então um erro aqui é um erro nos
 * dois — e é isso que torna estes casos portão: `npm run testar-robos` sai com
 * código diferente de zero quando qualquer um falha.
 *
 * Alguns travam decisões que custaram caro na medição: a perna de janela curta
 * escolher primeiro (a COAI comprada estopava em −25%; vendida, +80%), o rastro
 * só valer da vela seguinte, e a vela da entrada ficar de fora no ao vivo.
 *
 * Rode com: npm run testar-robos
 */
import {
  CAPITAL_ROBO,
  CUSTO_ATRASO,
  DIA,
  ESCORREGADA_STOP,
  HORA,
  JANELA_VOLATILIDADE_DIAS,
  MANUTENCAO,
  NOCIONAL_MINIMO,
  ROBOS,
  abrir,
  cobrar,
  custoPorLado,
  decidir,
  desvioDiario,
  escalaDoTamanho,
  fechar,
  marcar,
  multiplicadorPelaVolatilidade,
  novoEstado,
  patrimonioA,
  percorrer,
  selecionar,
  valorDaPosicao,
  type Cobranca,
  type EstadoRobo,
  type LinhaRanking,
  type Perna,
  type Robo,
  type VelaRobo,
} from "../lib/robos";

let falhas = 0;
function confere(nome: string, ok: boolean, obtido: string): void {
  if (!ok) falhas++;
  console.log(`  ${nome.padEnd(62)} ${obtido.padEnd(26)} ${ok ? "ok" : "← FALHOU"}`);
}
const perto = (a: number, b: number, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

const T0 = Date.parse("2026-01-01T00:00:00Z");
const v = (n: number, o: number, h: number, l: number, c: number): VelaRobo => ({ t: T0 + n * HORA, o, h, l, c });

const COMPRA: Perna = { lado: "long", janelaDias: 30, k: 2, stop: 0.25, rastro: 0.3, prazoH: 48, alavancagem: 3 };
const VENDA: Perna = { lado: "short", janelaDias: 14, k: 2, stop: 0.45, rastro: null, prazoH: 24, alavancagem: 2 };
const ROBO: Robo = {
  id: "teste",
  nome: "Teste",
  descricao: "",
  regras: { tamanho: 0.1, volumeMinimo: 1e6, idadeMinimaDias: 14, pernas: [COMPRA, VENDA] },
};

function estado(): EstadoRobo {
  return novoEstado(ROBO, T0);
}

// ------------------------------------------------------------------ saídas
console.log("\nsaídas dentro da vela");
{
  const e = estado();
  const p = abrir(e, COMPRA, "AUSDT", 100, T0, 100e6, false)!;
  confere("abre com nocional = tamanho × patrimônio", perto(p.nocional, 100) && perto(p.margem, 100 / 3), `noc ${p.nocional.toFixed(2)} mg ${p.margem.toFixed(2)}`);
  confere("stop e liquidação no lugar (3x: −25% e −32,8%)", perto(p.stop, 75) && perto(p.liquidacao, 100 * (1 - (1 / 3 - MANUTENCAO))), `${p.stop} · ${p.liquidacao.toFixed(3)}`);
  const s = percorrer(p, [v(0, 100, 101, 99, 100), v(1, 100, 100, 70, 72)], []);
  // No nível, e não na mínima — menos a escorregada medida no minuto do disparo.
  const esperado = 75 - ESCORREGADA_STOP * (75 - 70);
  confere("stop no NÍVEL menos a escorregada, não na mínima", s?.motivo === "stop" && perto(s.preco, esperado), `${s?.motivo} ${s?.preco.toFixed(3)}`);
}
{
  const e = estado();
  const p = abrir(e, COMPRA, "AUSDT", 100, T0, 100e6, false)!;
  const s = percorrer(p, [v(0, 100, 101, 99, 100), v(1, 70, 71, 60, 65)], []);
  // Abriu em 70: abaixo do stop (75) e acima da liquidação (67,2). Ninguém foi servido em 75.
  confere("vela que salta o stop preenche na ABERTURA (e escorrega)", s?.motivo === "stop" && perto(s.preco, 70 - ESCORREGADA_STOP * (70 - 60)), `${s?.motivo} ${s?.preco.toFixed(3)}`);
}
{
  const e = estado();
  const p = abrir(e, COMPRA, "AUSDT", 100, T0, 100e6, false)!;
  const s = percorrer(p, [v(0, 100, 101, 99, 100), v(1, 60, 61, 55, 58)], []);
  confere("vela que abre além da liquidação: liquidada", s?.motivo === "liquidada", `${s?.motivo} ${s?.preco.toFixed(2)}`);
  const t = fechar(e, p, s!);
  confere("liquidada perde a margem inteira, e só ela", perto(t.resultado, -p.margem), `${t.resultado.toFixed(2)}`);
  confere("caixa volta a fechar a conta", perto(e.caixa + 0, CAPITAL_ROBO - p.margem), `${e.caixa.toFixed(2)}`);
}
{
  const e = estado();
  const p = abrir(e, COMPRA, "AUSDT", 100, T0, 100e6, false)!;
  // Sobe a 200, depois recua: o rastro de 30% da máxima ANTERIOR é 140.
  const s = percorrer(p, [v(0, 100, 120, 99, 120), v(1, 120, 200, 119, 190), v(2, 190, 191, 130, 135)], []);
  confere("rastro de 30% da máxima anterior", s?.motivo === "rastro" && perto(s.preco, 140 - ESCORREGADA_STOP * (140 - 130)), `${s?.motivo} ${s?.preco.toFixed(3)}`);
}
{
  const e = estado();
  const p = abrir(e, COMPRA, "AUSDT", 100, T0, 100e6, false)!;
  // Na MESMA vela vai a 200 e recua a 145: a vela não diz a ordem. O rastro
  // desta vela é o que estava parado na abertura (stop de 75), e não sai.
  const s = percorrer(p, [v(0, 100, 101, 99, 100), v(1, 100, 200, 145, 150)], []);
  confere("rastro NÃO usa a máxima da própria vela", s === null && perto(p.melhor, 200), `${s?.motivo ?? "aberta"} melhor ${p.melhor}`);
}
{
  const e = estado();
  const p = abrir(e, COMPRA, "AUSDT", 100, T0, 100e6, false)!;
  const velas = Array.from({ length: 60 }, (_, n) => v(n, 100, 101, 99, 100 + n * 0.01));
  const s = percorrer(p, velas, []);
  confere("prazo de 48 h fecha no fechamento da 48ª vela", s?.motivo === "prazo" && s.quando === T0 + 48 * HORA, `${s?.motivo} ${((s?.quando ?? 0) - T0) / HORA} h`);
}
{
  const e = estado();
  const p = abrir(e, VENDA, "BUSDT", 100, T0, 100e6, false)!;
  confere("vendida a 2x: stop +45%, liquidação +49,5%", perto(p.stop, 145) && perto(p.liquidacao, 149.5), `${p.stop} · ${p.liquidacao}`);
  const s = percorrer(p, [v(0, 100, 150, 99, 140)], []);
  // Saindo de 100, o preço cruza 145 antes de 149,5.
  confere("vendida: o stop vem antes da liquidação na mesma vela", s?.motivo === "stop" && perto(s.preco, 145 + ESCORREGADA_STOP * (150 - 145)), `${s?.motivo} ${s?.preco.toFixed(3)}`);
}
{
  const e = estado();
  const p = abrir(e, VENDA, "BUSDT", 100, T0, 100e6, false)!;
  const s = percorrer(p, [v(0, 100, 101, 99, 100), v(1, 100, 101, 50, 52)], []);
  confere("vendida sem alvo nem rastro não sai na queda", s === null && perto(p.precoAtual, 52), `${s?.motivo ?? "aberta"} ${p.precoAtual}`);
  const t = fechar(e, p, { preco: 52, quando: T0 + 2 * HORA, motivo: "prazo" });
  const esperado = 100 * 0.48 - 2 * 100 * custoPorLado(100e6);
  confere("resultado = variação × nocional − custo dos dois lados", perto(t.resultado, esperado), `${t.resultado.toFixed(4)} ≈ ${esperado.toFixed(4)}`);
}

// ------------------------------------------------------------------ o caminho
console.log("\no caminho entre rodadas");
{
  const e = estado();
  // Entrou às 00:20 (no ao vivo, quando o retrato roda): a vela das 00:00 tem
  // minutos de ANTES da entrada, e uma mínima deles não pode estopar a posição.
  const p = abrir(e, COMPRA, "AUSDT", 100, T0 + 20 * 60_000, 100e6, false)!;
  const s = percorrer(p, [v(0, 90, 101, 60, 100), v(1, 100, 102, 98, 101)], []);
  confere("vela que abriu antes da entrada fica de fora", s === null && p.ultimaVela === T0 + HORA, `${s?.motivo ?? "aberta"}`);
}
{
  const e = estado();
  const p = abrir(e, COMPRA, "AUSDT", 100, T0, 100e6, false)!;
  const velas = [v(0, 100, 101, 99, 100), v(1, 100, 101, 99, 100)];
  percorrer(p, velas, []);
  const antes = p.ultimaVela;
  // A rodada seguinte recebe as mesmas velas de novo, mais uma com o stop.
  const s = percorrer(p, [...velas, v(2, 100, 101, 70, 72)], []);
  confere("vela já percorrida não é percorrida de novo", antes === T0 + HORA && s?.motivo === "stop" && s.quando === T0 + 3 * HORA, `${s?.motivo} ${((s?.quando ?? 0) - T0) / HORA} h`);
}
{
  const e = estado();
  const p = abrir(e, COMPRA, "AUSDT", 100, T0, 100e6, false)!;
  p.precoAtual = 98;
  const s = percorrer(p, [v(0, 100, 101, 97, 98), v(1, NaN, NaN, NaN, NaN)], []);
  confere("vela sem preço: sai no último preço visto (sumiu)", s?.motivo === "sumiu" && perto(s.preco, 98), `${s?.motivo} ${s?.preco}`);
}

// ------------------------------------------------------------------ financiamento
console.log("\nfinanciamento");
{
  const e = estado();
  const p = abrir(e, COMPRA, "AUSDT", 100, T0, 100e6, false)!;
  const cobrancas: Cobranca[] = [
    { t: T0, taxa: 0.5 }, // no instante da entrada: não é dela
    { t: T0 + HORA, taxa: 0.001 },
    { t: T0 + 2 * HORA, taxa: -0.02 },
  ];
  percorrer(p, [v(0, 100, 101, 99, 100), v(1, 100, 101, 99, 100), v(2, 100, 101, 99, 100)], cobrancas);
  confere("comprado paga a positiva e recebe a negativa", perto(p.funding, 100 * (0.001 - 0.02)), `${p.funding.toFixed(4)}`);
  const antes = p.funding;
  percorrer(p, [v(0, 100, 101, 99, 100), v(1, 100, 101, 99, 100), v(2, 100, 101, 99, 100)], cobrancas);
  confere("cobrança não é cobrada duas vezes entre rodadas", perto(p.funding, antes), `${p.funding.toFixed(4)}`);
  const q = abrir(e, VENDA, "BUSDT", 100, T0, 100e6, false)!;
  cobrar(q, [{ t: T0 + HORA, taxa: -0.02 }], T0 + HORA);
  confere("vendido paga a negativa (o caso das manipuladas)", q.funding > 0 && perto(q.funding, q.nocional * 0.02), `${q.funding.toFixed(4)}`);
}

// ------------------------------------------------------------------ a seleção
console.log("\na seleção do dia");
function linha(symbol: string, r30: number | null, r14: number | null, volume = 50e6, idadeDias: number | null = 100): LinhaRanking {
  return { symbol, retorno: { 30: r30, 14: r14 }, volume, idadeDias };
}
{
  const linhas = Array.from({ length: 10 }, (_, n) => linha(`M${n}USDT`, n / 10, -n / 10));
  const comp = selecionar(ROBO.regras, COMPRA, linhas).map((l) => l.symbol);
  const vend = selecionar(ROBO.regras, VENDA, linhas).map((l) => l.symbol);
  confere("compra as que mais subiram, da maior para a menor", comp.join() === "M9USDT,M8USDT", comp.join());
  confere("vende as que mais caíram", vend.join() === "M9USDT,M8USDT", vend.join());
  const poucas = selecionar(ROBO.regras, COMPRA, linhas.slice(0, 7));
  confere("menos de 4k elegíveis: não seleciona", poucas.length === 0, `${poucas.length}`);
  const filtradas = [
    ...linhas,
    linha("RASAUSDT", 5, 0, 1e5),
    linha("NOVAUSDT", 5, 0, 50e6, 3),
    linha("SEMSERIEUSDT", null, null),
  ];
  const c2 = selecionar(ROBO.regras, COMPRA, filtradas).map((l) => l.symbol);
  confere("volume baixo, moeda nova e sem série ficam fora", c2.join() === "M9USDT,M8USDT", c2.join());
  const velha = selecionar(ROBO.regras, COMPRA, [...linhas, linha("VELHAUSDT", 5, 0, 50e6, null)]).map((l) => l.symbol);
  confere("idade desconhecida (mais velha que a série) entra", velha[0] === "VELHAUSDT", velha.join());
}
{
  // A mesma moeda é a que mais subiu em 30 dias E a que mais caiu em 14: a
  // manipulada no meio do despejo. A perna de janela curta escolhe primeiro.
  const e = estado();
  const linhas = Array.from({ length: 10 }, (_, n) => linha(`M${n}USDT`, n / 10, 0.5 - n / 20));
  linhas.push(linha("DESPEJOUSDT", 3, -0.6));
  const abertas = decidir(e, linhas, () => 1, T0, new Set(["DESPEJOUSDT"]));
  const d = e.abertas.find((p) => p.symbol === "DESPEJOUSDT");
  confere("moeda nas duas listas vira VENDIDA (janela curta primeiro)", d?.lado === "short", `${d?.lado}`);
  confere("e não abre de novo do outro lado", e.abertas.filter((p) => p.symbol === "DESPEJOUSDT").length === 1, `${abertas.length} abertas`);
  confere("marca a manipulada", d?.manipulada === true, `${d?.manipulada}`);
  confere("a decisão grava o DIA, não a hora", e.ultimaDecisao === Math.floor(T0 / DIA) * DIA, `${e.ultimaDecisao}`);
}
{
  const e = estado();
  const p1 = abrir(e, COMPRA, "AUSDT", 100, T0, 100e6, false);
  const p2 = abrir(e, VENDA, "AUSDT", 100, T0, 100e6, false);
  confere("moeda já aberta não abre outra posição", p1 !== null && p2 === null && e.recusadas === 0, `${e.abertas.length} aberta`);
  e.caixa = 0.5;
  const p3 = abrir(e, COMPRA, "BUSDT", 100, T0, 100e6, false);
  confere("sem caixa para a margem: recusa e conta", p3 === null && e.recusadas === 1, `recusadas ${e.recusadas}`);
  const p4 = abrir(e, COMPRA, "CUSDT", NaN, T0, 100e6, false);
  confere("sem preço: recusa (NaN não passa)", p4 === null && e.recusadas === 2, `recusadas ${e.recusadas}`);
}

// ------------------------------------------------------------------ a conta
console.log("\na conta");
{
  const e = estado();
  const p = abrir(e, COMPRA, "AUSDT", 100, T0, 100e6, false)!;
  confere("patrimônio na entrada = capital − custo de entrada", perto(patrimonioA(e), CAPITAL_ROBO - p.nocional * p.custoLado), `${patrimonioA(e).toFixed(4)}`);
  confere("posição marcada nunca abaixo de zero (margem isolada)", valorDaPosicao(p, 1) === 0, `${valorDaPosicao(p, 1)}`);
  marcar(e, T0 + 10 * 60_000, new Map([["AUSDT", 110]]));
  marcar(e, T0 + 20 * 60_000, new Map([["AUSDT", 90]]));
  marcar(e, T0 + HORA + 60_000, new Map([["AUSDT", 95]]));
  confere("um ponto por hora na curva", e.curva.length === 2, `${e.curva.length} pontos`);
  confere("pico e queda máxima andam com a marcação", e.pico > CAPITAL_ROBO && e.quedaMaxima < 0, `pico ${e.pico.toFixed(2)} queda ${(e.quedaMaxima * 100).toFixed(2)}%`);
  const t = fechar(e, p, { preco: 20, quando: T0 + 2 * HORA, motivo: "stop" });
  confere("perda nunca passa da margem", perto(t.resultado, -p.margem), `${t.resultado.toFixed(2)}`);
  confere("caixa fecha: capital − margem perdida", perto(e.caixa, CAPITAL_ROBO - p.margem), `${e.caixa.toFixed(2)}`);
}
{
  const e = estado();
  abrir(e, COMPRA, "AUSDT", 100, T0, 100e6, false);
  const volta = JSON.parse(JSON.stringify(e)) as EstadoRobo;
  const finitos = JSON.stringify(e).match(/null/g) === null || volta.ultimaDecisao === null;
  confere("o estado sobrevive ao JSON (sem Infinity/NaN virando null)", finitos && volta.abertas[0].ultimaVela === 0, `ultimaVela ${volta.abertas[0].ultimaVela}`);
}


// ------------------------------------------------------------------ a pirâmide
console.log("\na pirâmide");
const COMPRA_P: Perna = { ...COMPRA, prazoH: 1000, piramide: { niveis: [0.4], tamanho: 1 } };
{
  const e = estado();
  const p = abrir(e, COMPRA_P, "AUSDT", 100, T0, 100e6, false)!;
  confere("gatilho da parcela em +40% da entrada", p.piramide?.precos[0] === 140, `${p.piramide?.precos.join()}`);
  const caixaAntes = e.caixa;
  const s = percorrer(p, [v(0, 100, 101, 99, 100), v(1, 120, 150, 118, 145)], [], e);
  const fill = 140 + ESCORREGADA_STOP * (150 - 140);
  const noc2 = p.nocional - 100;
  const medio = (100 + noc2) / (100 / 100 + noc2 / fill);
  confere("a parcela entra no gatilho com a escorregada da alta", s === null && p.parcelas === 2 && perto(p.precoEntrada, medio), `médio ${p.precoEntrada.toFixed(4)} parcelas ${p.parcelas}`);
  confere("margem da parcela sai do caixa, na mesma alavancagem", perto(caixaAntes - e.caixa, noc2 / 3) && perto(p.nocional / p.margem, 3), `${(caixaAntes - e.caixa).toFixed(3)}`);
  confere("liquidação refeita sobre o preço médio", perto(p.liquidacao, medio * (1 - (1 / 3 - MANUTENCAO))), `${p.liquidacao.toFixed(3)}`);
  // A liquidação nova (~78) passou o stop fixo de 75: ele sobe junto.
  confere("o stop sobe para dentro da nova liquidação", perto(p.stop, p.liquidacao * 1.01) && p.liquidacao < p.stop && p.stop < p.precoEntrada, `stop ${p.stop.toFixed(3)} liq ${p.liquidacao.toFixed(3)}`);
  confere("o gatilho é consumido: não entra de novo", p.piramide?.precos.length === 0, `${p.piramide?.precos.length}`);
  // O resultado da posição unificada é EXATAMENTE o das duas parcelas separadas.
  const t = fechar(e, p, { preco: 160, quando: T0 + 3 * HORA, motivo: "prazo" });
  const separadas = 100 * (160 / 100 - 1) + noc2 * (160 / fill - 1) - 2 * (100 + noc2) * p.custoLado;
  confere("posição unificada = soma das parcelas separadas", perto(t.resultado, separadas, 1e-9), `${t.resultado.toFixed(4)} ≈ ${separadas.toFixed(4)}`);
  confere("o trade guarda quantas parcelas teve", t.parcelas === 2, `${t.parcelas}`);
}
{
  // Na mesma vela a alta dispara a parcela e a queda dispara o stop: a vela não
  // diz a ordem, e o pior caso é a parcela ter entrado antes. Com o stop de 75
  // parado, a liquidação nova (~78) viria primeiro e levaria a margem inteira.
  const e = estado();
  const p = abrir(e, COMPRA_P, "AUSDT", 100, T0, 100e6, false)!;
  const s = percorrer(p, [v(0, 100, 101, 99, 100), v(1, 100, 145, 70, 72)], [], e);
  confere("parcela e stop na mesma vela: entra antes, sai junto", s?.motivo === "stop" && p.parcelas === 2, `${s?.motivo} parcelas ${p.parcelas}`);
  confere("e sai no stop movido, não na liquidação", s !== null && perto(s.preco, p.stop - ESCORREGADA_STOP * (p.stop - 70)) && s.preco > 75, `${s?.preco.toFixed(3)}`);
}
{
  const e = estado();
  const p = abrir(e, COMPRA_P, "AUSDT", 100, T0, 100e6, false)!;
  const s = percorrer(p, [v(0, 100, 101, 99, 100), v(1, 120, 150, 118, 145)], []);
  confere("sem o robô (a margem), a parcela não entra", s === null && (p.parcelas ?? 1) === 1, `parcelas ${p.parcelas ?? 1}`);
}
{
  const e = estado();
  const p = abrir(e, COMPRA_P, "AUSDT", 100, T0, 100e6, false)!;
  e.caixa = 0;
  percorrer(p, [v(0, 100, 101, 99, 100), v(1, 120, 150, 118, 145)], [], e);
  confere("sem caixa: parcela recusada, contada e consumida", (p.parcelas ?? 1) === 1 && e.recusadas === 1 && p.piramide?.precos.length === 0, `recusadas ${e.recusadas}`);
}
{
  const e = estado();
  const p = abrir(e, COMPRA, "AUSDT", 100, T0, 100e6, false)!;
  percorrer(p, [v(0, 100, 101, 99, 100), v(1, 120, 150, 118, 145)], [], e);
  confere("perna sem pirâmide não acrescenta", p.piramide === undefined && (p.parcelas ?? 1) === 1, `parcelas ${p.parcelas ?? 1}`);
}

// ------------------------------------------------------------------ a saída por posto
console.log("\na saída por posto");
const COMPRA_POSTO: Perna = { ...COMPRA, saidaPosto: 3 };
const ROBO_POSTO: Robo = { ...ROBO, regras: { ...ROBO.regras, pernas: [COMPRA_POSTO] } };
/** 30 moedas no ranking de 30 dias: M29 é a que mais subiu. `fora` vai para o fim da fila. */
function ranking30(fora?: string): LinhaRanking[] {
  const ls = Array.from({ length: 30 }, (_, n) => linha(`M${n}USDT`, n / 10, 0));
  if (fora) ls.push(linha(fora, -1, 0));
  return ls;
}
{
  const e = novoEstado(ROBO_POSTO, T0);
  const p = abrir(e, COMPRA_POSTO, "AUSDT", 100, T0, 100e6, false)!;
  confere("a posição guarda a saída com que entrou", p.posto?.janelaDias === 30 && p.posto.n === 3, `${JSON.stringify(p.posto)}`);
  // Caixa de US$ 10: sem a saída ANTES, o patrimônio (~US$ 43) dá nocional de
  // US$ 4,3, abaixo do mínimo da Binance, e a entrada do dia seria recusada.
  e.caixa = 10;
  decidir(e, ranking30("AUSDT"), (s) => (s === "AUSDT" ? 120 : 1), T0 + DIA);
  const t = e.fechadas.find((x) => x.symbol === "AUSDT");
  confere("sai no dia em que deixou as N primeiras, no preço da decisão", t?.motivo === "posto" && t.precoSaida === 120, `${t?.motivo} ${t?.precoSaida}`);
  confere("e sai ANTES das entradas: o caixa dela já serve ao dia", e.abertas.some((x) => x.symbol === "M29USDT"), `${e.abertas.map((x) => x.symbol).join() || "nenhuma"}`);
}
{
  const e = novoEstado(ROBO_POSTO, T0);
  abrir(e, COMPRA_POSTO, "M29USDT", 100, T0, 100e6, false);
  decidir(e, ranking30(), () => 100, T0 + DIA);
  confere("dentro das N primeiras: fica", e.abertas.some((p) => p.symbol === "M29USDT") && e.fechadas.length === 0, `${e.fechadas.length} saídas`);
}
{
  // A Binance não respondeu pela moeda: ela some do ranking. "Não consegui ler" não é "caiu".
  const e = novoEstado(ROBO_POSTO, T0);
  abrir(e, COMPRA_POSTO, "AUSDT", 100, T0, 100e6, false);
  decidir(e, ranking30(), () => 100, T0 + DIA);
  confere("fora do ranking (sem leitura): fica", e.abertas.some((p) => p.symbol === "AUSDT"), `${e.fechadas.map((x) => x.motivo).join() || "nenhuma saída"}`);
  const e2 = novoEstado(ROBO_POSTO, T0);
  abrir(e2, COMPRA_POSTO, "AUSDT", 100, T0, 100e6, false);
  decidir(e2, ranking30("AUSDT").slice(-15), () => 100, T0 + DIA);
  confere(`ranking com menos de 20 moedas: ninguém sai`, e2.abertas.some((p) => p.symbol === "AUSDT"), `${e2.fechadas.length} saídas`);
}
{
  // A posição aberta ANTES da regra não sai por ela: a regra mora na posição.
  const e = novoEstado(ROBO_POSTO, T0);
  abrir(e, COMPRA, "AUSDT", 100, T0, 100e6, false);
  decidir(e, ranking30("AUSDT"), () => 100, T0 + DIA);
  confere("posição sem a regra (entrou antes) não sai por posto", e.abertas.some((p) => p.symbol === "AUSDT"), `${e.fechadas.length} saídas`);
}
{
  const e = novoEstado(ROBO_POSTO, T0);
  abrir(e, COMPRA_POSTO, "AUSDT", 100, T0, 100e6, false);
  decidir(e, ranking30("AUSDT"), () => 100, T0 + DIA, undefined, CUSTO_ATRASO);
  const t = e.fechadas[0];
  confere("na medição a saída paga o atraso, como a entrada", t !== undefined && perto(t.resultado, -2 * t.nocional * custoPorLado(100e6) - CUSTO_ATRASO * t.nocional, 1e-9), `${t?.resultado.toFixed(4)}`);
}

// ------------------------------------------------------------------ o alvo de volatilidade
console.log("\no alvo de volatilidade");
{
  const ALVO = { anual: 0.6, janelaDias: 10, minimo: 0.25, maximo: 2 };
  const R: Robo = { ...ROBO, regras: { ...ROBO.regras, alvoVolatilidade: ALVO } };
  // Patrimônio alternando ±d por dia, um ponto por virada de dia, terminando HOJE.
  const comCurva = (d: number, dias: number): EstadoRobo => {
    const e = novoEstado(R, T0);
    e.curva = Array.from({ length: dias + 1 }, (_, k) => ({ t: T0 + (10 - dias + k) * DIA, patrimonio: 1000 * ((dias - k) % 2 === 0 ? 1 : 1 + d) }));
    return e;
  };
  const quando = T0 + 10 * DIA + 5 * HORA;
  confere("sem alvo: 1", escalaDoTamanho(estado(), quando) === 1, `${escalaDoTamanho(estado(), quando)}`);
  confere("robô mais novo que a janela: 1", escalaDoTamanho(comCurva(0.05, 5), quando) === 1, `${escalaDoTamanho(comCurva(0.05, 5), quando)}`);
  // Dias sem retrato não viram retorno zero: com só 4 dias lidos na janela de 10, 1.
  const buracos = comCurva(0.05, 10);
  buracos.curva = buracos.curva.filter((_, k) => k % 3 === 0);
  confere("dias sem retrato ficam de fora (poucos retornos: 1)", escalaDoTamanho(buracos, quando) === 1, `${escalaDoTamanho(buracos, quando)}`);
  // Retornos +d e −d/(1+d) alternados; o desvio populacional sai da conta direta.
  const d = 0.05;
  const rs = Array.from({ length: 10 }, (_, k) => (k % 2 === 0 ? -d / (1 + d) : d));
  const m = rs.reduce((a, b) => a + b, 0) / rs.length;
  const sd = Math.sqrt(rs.reduce((a, b) => a + b * b, 0) / rs.length - m * m);
  const esperado = Math.min(2, Math.max(0.25, 0.6 / Math.sqrt(365) / sd));
  const obtido = escalaDoTamanho(comCurva(d, 10), quando);
  confere("alvo ÷ desvio dos retornos diários", perto(obtido, esperado, 1e-9), `${obtido.toFixed(4)} ≈ ${esperado.toFixed(4)}`);
  confere("patrimônio agitado: encolhe até o piso", escalaDoTamanho(comCurva(0.5, 10), quando) === 0.25, `${escalaDoTamanho(comCurva(0.5, 10), quando)}`);
  confere("patrimônio calmo: cresce até o teto", escalaDoTamanho(comCurva(0.001, 10), quando) === 2, `${escalaDoTamanho(comCurva(0.001, 10), quando)}`);
  // Um ponto da curva DEPOIS da virada do dia não entra: só o que se sabia na decisão.
  const e = comCurva(d, 10);
  e.curva.push({ t: T0 + 10 * DIA + HORA, patrimonio: 5000 });
  confere("o que veio depois da virada do dia não entra", perto(escalaDoTamanho(e, quando), esperado, 1e-9), `${escalaDoTamanho(e, quando).toFixed(4)}`);
  const ea = comCurva(0.001, 10);
  const pat = patrimonioA(ea);
  const p = abrir(ea, COMPRA, "AUSDT", 100, quando, 100e6, false)!;
  confere("a entrada sai com o tamanho multiplicado (calmo: 2x)", perto(p.nocional, 0.1 * pat * 2), `noc ${p.nocional.toFixed(2)}`);
}

// ------------------------------------------------------------------ o fluxo e o par com hedge
console.log("\no fluxo e o par com hedge");
const VENDA_PAR: Perna = {
  lado: "short",
  janelaDias: 7,
  k: 2,
  stop: 0.45,
  rastro: null,
  prazoH: 48,
  alavancagem: 2,
  criterio: "fluxo",
  hedge: { symbol: "ETHUSDT", alavancagem: 2 },
};
const ROBO_PAR: Robo = { ...ROBO, regras: { ...ROBO.regras, pernas: [VENDA_PAR] } };
/** 30 moedas com fluxo de 0,30 a 0,59 (M0 é a que mais foi vendida a mercado) e o ETH, o mais vendido de todos. */
function rankingFluxo(): LinhaRanking[] {
  const ls: LinhaRanking[] = Array.from({ length: 30 }, (_, n) => ({ symbol: `M${n}USDT`, retorno: {}, volume: 50e6, idadeDias: 100, fluxo: { 7: 0.3 + n / 100 } }));
  ls.push({ symbol: "ETHUSDT", retorno: {}, volume: 2e9, idadeDias: null, fluxo: { 7: 0.1 } });
  return ls;
}
{
  const sel = selecionar(ROBO_PAR.regras, VENDA_PAR, rankingFluxo()).map((l) => l.symbol);
  confere("fluxo: vende as de MENOR fração comprada a mercado", sel.join() === "M0USDT,M1USDT", sel.join());
  confere("e o símbolo do hedge nunca entra na própria perna", !sel.includes("ETHUSDT"), sel.join());
}
{
  const e = novoEstado(ROBO_PAR, T0);
  const p = abrir(e, VENDA_PAR, "AUSDT", 10, T0, 50e6, false, 0, { preco: 2000, volume: 2e9 })!;
  confere("o par abre as duas metades com o mesmo nocional", p.hedge !== undefined && p.hedge.lado === "long" && perto(p.hedge.nocional, p.nocional), `${p.hedge?.lado} ${p.hedge?.nocional}`);
  confere("e as duas margens saem do caixa", perto(CAPITAL_ROBO - e.caixa, p.margem + (p.hedge?.margem ?? 0)) && perto(p.hedge?.margem ?? 0, p.nocional / 2), `${(CAPITAL_ROBO - e.caixa).toFixed(2)}`);
  confere("liquidação do hedge comprado a 2x: −49,5%", perto(p.hedge?.liquidacao ?? 0, 2000 * (1 - (0.5 - MANUTENCAO))), `${p.hedge?.liquidacao}`);
  const custoEntrada = p.nocional * p.custoLado + p.nocional * (p.hedge?.custoLado ?? 0);
  confere("o par vale margens menos o custo de entrada das duas", perto(valorDaPosicao(p, 10), p.margem + (p.hedge?.margem ?? 0) - custoEntrada), `${valorDaPosicao(p, 10).toFixed(4)}`);
  confere("sem preço do hedge: não abre pela metade", abrir(e, VENDA_PAR, "BUSDT", 10, T0, 50e6, false) === null && e.recusadas === 1, `recusadas ${e.recusadas}`);
}
{
  // A vendida cai 20% e o ETH sobe 10%: o par ganha nas duas metades.
  const e = novoEstado(ROBO_PAR, T0);
  const p = abrir(e, VENDA_PAR, "AUSDT", 10, T0, 50e6, false, 0, { preco: 2000, volume: 2e9 })!;
  const hv = (n: number, o: number, h: number, l: number, c: number): VelaRobo => ({ t: T0 + n * HORA, o, h, l, c });
  const semHedge = percorrer(p, [v(0, 10, 10, 9, 9)], []);
  confere("sem as velas do hedge, o par não anda", semHedge === null && p.ultimaVela === 0, `ultimaVela ${p.ultimaVela}`);
  const cobrancasEth: Cobranca[] = [{ t: T0 + HORA, taxa: 0.001 }];
  const s = percorrer(p, [v(0, 10, 10, 9, 9), v(1, 9, 9, 8, 8)], [], e, { velas: [hv(0, 2000, 2100, 1990, 2100), hv(1, 2100, 2200, 2090, 2200)], cobrancas: cobrancasEth });
  confere("o hedge anda junto: preço e financiamento do comprado", s === null && p.hedge?.precoAtual === 2200 && perto(p.hedge.funding, p.hedge.nocional * 0.001), `${p.hedge?.precoAtual} fin ${p.hedge?.funding.toFixed(4)}`);
  const caixaAntes = e.caixa;
  const t = fechar(e, p, { preco: 8, quando: T0 + 2 * HORA, motivo: "prazo" });
  const ganhoVendido = p.nocional * 0.2 - 2 * p.nocional * p.custoLado;
  const ganhoHedge = p.nocional * 0.1 - 2 * p.nocional * (p.hedge?.custoLado ?? 0) - (p.hedge?.funding ?? 0);
  confere("o trade soma as duas metades", t.hedge !== undefined && perto(t.resultado, ganhoVendido + ganhoHedge) && perto(t.hedge.resultado, ganhoHedge), `${t.resultado.toFixed(4)} = ${ganhoVendido.toFixed(4)} + ${ganhoHedge.toFixed(4)}`);
  confere("e o caixa recebe as duas margens e o resultado", perto(e.caixa - caixaAntes, p.margem + (p.hedge?.margem ?? 0) + t.resultado), `${(e.caixa - caixaAntes).toFixed(4)}`);
}
{
  // O ETH despenca 55% numa hora: a corretora liquida o hedge, e o vendido segue.
  const e = novoEstado(ROBO_PAR, T0);
  const p = abrir(e, VENDA_PAR, "AUSDT", 10, T0, 50e6, false, 0, { preco: 2000, volume: 2e9 })!;
  const hv = (n: number, o: number, h: number, l: number, c: number): VelaRobo => ({ t: T0 + n * HORA, o, h, l, c });
  const s = percorrer(p, [v(0, 10, 10, 9.5, 9.5)], [], e, { velas: [hv(0, 2000, 2000, 900, 950)], cobrancas: [] });
  confere("hedge liquidado: a margem dele vai, o par segue aberto", s === null && p.hedge?.liquidadaEm !== undefined, `${s?.motivo ?? "aberto"} liquidado ${p.hedge?.liquidadaEm !== undefined}`);
  const t = fechar(e, p, { preco: 9.5, quando: T0 + HORA, motivo: "prazo" });
  confere("e no fechamento ele conta −margem, nunca mais que isso", t.hedge?.liquidada === true && perto(t.hedge.resultado, -(p.hedge?.margem ?? 0)), `${t.hedge?.resultado.toFixed(4)}`);
}
{
  const e = novoEstado(ROBO_PAR, T0);
  const linhas = rankingFluxo();
  const abertas = decidir(e, linhas, (s) => (s === "ETHUSDT" ? 2000 : 10), T0 + DIA);
  confere("a decisão abre os pares com o preço do hedge no mesmo retrato", abertas.length === 2 && abertas.every((p) => p.hedge?.precoEntrada === 2000), `${abertas.length} pares`);
  const e2 = novoEstado(ROBO_PAR, T0);
  const semEth = decidir(e2, linhas.filter((l) => l.symbol !== "ETHUSDT"), () => 10, T0 + DIA);
  confere("sem a linha do hedge no ranking, nenhum par abre", semEth.length === 0 && e2.recusadas === 2, `recusadas ${e2.recusadas}`);
}

// ------------------------------------------------------------------ o tamanho pela volatilidade
console.log("\no tamanho pela volatilidade da moeda");
{
  // +10%, −10%, +10%: média 3,33%, desvio amostral 11,55%.
  const d = desvioDiario([100, 110, 99, 108.9]);
  confere("o desvio é o dos retornos diários (amostral)", d !== null && perto(d, 0.11547005383792516, 1e-6), `${d}`);
  const furado = Array.from({ length: 46 }, (_, k) => (k % 2 === 0 ? NaN : 100 + k));
  confere("com menos de 2/3 dos retornos: nulo, não um desvio de poucos dias", desvioDiario(furado) === null, `${desvioDiario(furado)}`);
  const comBuraco = Array.from({ length: 46 }, (_, k) => (k === 20 ? NaN : 100 * 1.01 ** k));
  confere("um dia sem fechamento tira só os dois retornos dele", perto(desvioDiario(comBuraco) ?? NaN, 0, 1e-9), `${desvioDiario(comBuraco)}`);
}
const VENDA_VOL: Perna = { ...VENDA, porVolatilidade: { minimo: 0.25, maximo: 2 } };
const ROBO_VOL: Robo = { ...ROBO, regras: { ...ROBO.regras, pernas: [COMPRA, VENDA_VOL] } };
/** 30 moedas com desvio de 5% a 34% ao dia (M15, o do meio, 20%): M0 é a que mais caiu, M29 a que mais subiu. */
function rankingVol(): LinhaRanking[] {
  return Array.from({ length: 30 }, (_, n) => ({
    symbol: `M${n}USDT`,
    retorno: { 30: n / 30, 14: -1 + n / 30 },
    volume: 50e6,
    idadeDias: 100,
    vol: 0.05 + n / 100,
  }));
}
{
  const linhas = rankingVol();
  const de = multiplicadorPelaVolatilidade(ROBO_VOL.regras, VENDA_VOL, linhas);
  const l = (vol: number | null): LinhaRanking => ({ symbol: "X", retorno: {}, volume: 50e6, idadeDias: 100, vol });
  confere("o dobro do desvio do meio entra com metade do tamanho", perto(de(l(0.4)), 0.5), `${de(l(0.4))}`);
  confere("a mais calma não passa do teto (2x)", de(l(0.05)) === 2, `${de(l(0.05))}`);
  confere("a mais agitada não passa do piso (¼)", de(l(2)) === 0.25, `${de(l(2))}`);
  confere("sem o desvio lido: o tamanho normal", de(l(null)) === 1 && de({ symbol: "Y", retorno: {}, volume: 50e6, idadeDias: 100 }) === 1, `${de(l(null))}`);
  const semRegra = multiplicadorPelaVolatilidade(ROBO_VOL.regras, COMPRA, linhas);
  confere("perna sem a regra: 1 para todas", semRegra(l(0.4)) === 1, `${semRegra(l(0.4))}`);
  const semNenhum = multiplicadorPelaVolatilidade(ROBO_VOL.regras, VENDA_VOL, linhas.map((x) => ({ ...x, vol: null })));
  confere("dia sem nenhum desvio lido: 1", semNenhum(l(0.4)) === 1, `${semNenhum(l(0.4))}`);
}
{
  const e = novoEstado(ROBO_VOL, T0);
  decidir(e, rankingVol(), () => 10, T0 + DIA);
  const vend = e.abertas.filter((p) => p.lado === "short");
  const comp = e.abertas.filter((p) => p.lado === "long");
  // A vendida (M0 e M1, desvio de 5% e 6%) escolhe primeiro e abre no teto de
  // 2x; a comprada (M29 e M28, desvio de 34% e 33%) não tem a regra e abre com
  // o tamanho normal — com ela, entraria com 0,6x.
  const base = ROBO_VOL.regras.tamanho * CAPITAL_ROBO;
  const m0 = vend.find((p) => p.symbol === "M0USDT");
  confere("a vendida entra com o tamanho × mediana ÷ desvio", m0 !== undefined && perto(m0.nocional, base * 2), `${m0?.nocional.toFixed(2)} (desvio 5%: teto 2x)`);
  confere(
    "e a comprada, sem a regra, com o tamanho normal",
    comp.length === 2 && comp.every((p) => Math.abs(p.nocional / base - 1) < 0.01),
    comp.map((p) => `${p.symbol.replace(/USDT$/, "")} ${p.nocional.toFixed(2)}`).join(" "),
  );
  const e2 = novoEstado(ROBO_VOL, T0);
  const p = abrir(e2, VENDA_VOL, "AUSDT", 10, T0, 50e6, false, 0, undefined, NaN);
  confere("multiplicador que não é número vira 1", p !== null && perto(p.nocional, base), `${p?.nocional}`);
}

// ------------------------------------------------------------------ o realismo da medição
console.log("\no realismo da medição");
{
  const e = estado();
  const p = abrir(e, COMPRA, "AUSDT", 100, T0, 100e6, false, CUSTO_ATRASO)!;
  confere("o atraso medido vira custo de entrada em dólares", perto(p.custoExtra ?? 0, CUSTO_ATRASO * p.nocional), `${p.custoExtra}`);
  confere("e entra na marcação", perto(valorDaPosicao(p, 100), p.margem - p.nocional * p.custoLado - CUSTO_ATRASO * p.nocional), `${valorDaPosicao(p, 100).toFixed(4)}`);
  const t = fechar(e, p, { preco: 110, quando: T0 + HORA, motivo: "prazo" });
  confere("e no resultado", perto(t.resultado, p.nocional * 0.1 - 2 * p.nocional * p.custoLado - CUSTO_ATRASO * p.nocional), `${t.resultado.toFixed(4)}`);
  const q = abrir(e, COMPRA, "BUSDT", 100, T0, 100e6, false)!;
  confere("o ao vivo não paga atraso (é de verdade lá)", q.custoExtra === undefined, `${q.custoExtra}`);
}
{
  const e = estado();
  e.caixa = 40; // patrimônio de US$ 40 → nocional de US$ 4 a 10%
  const p = abrir(e, COMPRA, "AUSDT", 100, T0, 100e6, false);
  confere(`abaixo do nocional mínimo da Binance (US$ ${NOCIONAL_MINIMO}) não abre`, p === null && e.recusadas === 1, `recusadas ${e.recusadas}`);
}

// ------------------------------------------------------------------ os robôs publicados
console.log("\nos robôs publicados");
for (const r of ROBOS) {
  for (const p of r.regras.pernas) {
    const liq = 1 / p.alavancagem - MANUTENCAO;
    confere(`${r.nome}: stop da perna ${p.lado} antes da liquidação`, p.stop < liq, `stop ${p.stop} liq ${liq.toFixed(3)}`);
  }
  // A medição tem em média 25 posições abertas (máximo 38): a média precisa
  // caber no caixa com folga. No pico o turbo recusa algumas — a medição conta
  // e as recusas estão dentro do resultado dela.
  // No par, as duas metades prendem margem.
  const margemMedia = r.regras.pernas.reduce(
    (s, p) => s + (25 / r.regras.pernas.length) * (r.regras.tamanho / p.alavancagem + (p.hedge ? r.regras.tamanho / p.hedge.alavancagem : 0)),
    0,
  );
  confere(`${r.nome}: 25 posições cabem no caixa`, margemMedia < 0.8, `${(margemMedia * 100).toFixed(0)}% em margem`);
}

{
  const m = ROBOS.find((r) => r.id === "momento")!;
  const compra = m.regras.pernas.find((p) => p.lado === "long")!;
  confere("Momento: compra em 45 dias com pirâmide em +40%", compra.janelaDias === 45 && compra.piramide?.niveis[0] === 0.4, `${compra.janelaDias} d`);
  confere("Momento: a comprada sai fora do top 10; a vendida não tem saída por posto", compra.saidaPosto === 10 && !m.regras.pernas.find((p) => p.lado === "short")!.saidaPosto, `top ${compra.saidaPosto}`);
  const alvo = m.regras.alvoVolatilidade;
  confere("Momento: alvo de 60% ao ano em 40 dias, tamanho entre ¼ e 2x", alvo?.anual === 0.6 && alvo.janelaDias === 40 && alvo.minimo === 0.25 && alvo.maximo === 2, JSON.stringify(alvo));
  const vendaM = m.regras.pernas.find((p) => p.lado === "short")!;
  confere(
    "Momento: só a vendida pela volatilidade, ¼ a 2x, desvio de 45 dias",
    vendaM.porVolatilidade?.minimo === 0.25 && vendaM.porVolatilidade.maximo === 2 && !compra.porVolatilidade && JANELA_VOLATILIDADE_DIAS === 45,
    JSON.stringify(vendaM.porVolatilidade),
  );
  const turbo = ROBOS.find((r) => r.id === "turbo")!;
  confere("Turbo: o mesmo livro com 1,5x o tamanho", perto(turbo.regras.tamanho, 1.5 * m.regras.tamanho), `${turbo.regras.tamanho} = 1,5 × ${m.regras.tamanho}`);
  const caca = ROBOS.find((r) => r.id === "caca-monstra")!.regras.pernas[0];
  confere("Caça-monstra: 30 dias e sem pirâmide (não passou nele)", caca.janelaDias === 30 && !caca.piramide, `${caca.janelaDias} d`);
  const fluxo = ROBOS.find((r) => r.id === "fluxo")!;
  const vendaFluxo = fluxo.regras.pernas[0];
  confere(
    "Fluxo: 3%, par com ETH a 2x e sem alvo de volatilidade (não passou nele)",
    fluxo.regras.tamanho === 0.03 && !fluxo.regras.alvoVolatilidade && vendaFluxo.hedge?.symbol === "ETHUSDT" && vendaFluxo.hedge.alavancagem === 2,
    `${fluxo.regras.tamanho * 100}% · ${vendaFluxo.hedge?.symbol}`,
  );
}

console.log(falhas === 0 ? "\ntodos os casos passaram" : `\n${falhas} caso(s) FALHARAM`);
process.exitCode = falhas === 0 ? 0 : 1;
