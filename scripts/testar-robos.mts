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
  DIA,
  HORA,
  MANUTENCAO,
  ROBOS,
  abrir,
  cobrar,
  custoPorLado,
  decidir,
  fechar,
  marcar,
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
  confere("stop preenchido NO NÍVEL, não na mínima", s?.motivo === "stop" && perto(s.preco, 75), `${s?.motivo} ${s?.preco}`);
}
{
  const e = estado();
  const p = abrir(e, COMPRA, "AUSDT", 100, T0, 100e6, false)!;
  const s = percorrer(p, [v(0, 100, 101, 99, 100), v(1, 70, 71, 60, 65)], []);
  // Abriu em 70: abaixo do stop (75) e acima da liquidação (67,2). Ninguém foi servido em 75.
  confere("vela que salta o stop preenche na ABERTURA", s?.motivo === "stop" && perto(s.preco, 70), `${s?.motivo} ${s?.preco}`);
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
  confere("rastro de 30% da máxima anterior", s?.motivo === "rastro" && perto(s.preco, 140), `${s?.motivo} ${s?.preco}`);
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
  confere("vendida: o stop vem antes da liquidação na mesma vela", s?.motivo === "stop" && perto(s.preco, 145), `${s?.motivo} ${s?.preco}`);
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
  const margemMedia = r.regras.pernas.reduce((s, p) => s + (25 / r.regras.pernas.length) * (r.regras.tamanho / p.alavancagem), 0);
  confere(`${r.nome}: 25 posições cabem no caixa`, margemMedia < 0.8, `${(margemMedia * 100).toFixed(0)}% em margem`);
}

console.log(falhas === 0 ? "\ntodos os casos passaram" : `\n${falhas} caso(s) FALHARAM`);
process.exitCode = falhas === 0 ? 0 : 1;
