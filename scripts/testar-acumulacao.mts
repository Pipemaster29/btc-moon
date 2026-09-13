/**
 * Os casos-limite da leitura de volume, sem tocar em rede.
 *
 * Mesmo desenho do `testar-carteira`: função pura, série montada à mão, e sai
 * com código diferente de zero quando algum caso falha — então serve de portão.
 *
 * CADA UM DESTES QUEBROU DE VERDADE, ou quebraria:
 *
 *   - o dia ABERTO entrando na conta de volume fazia a coluna "agora" depender
 *     da hora em que a página fosse aberta: às 03h UTC a vela do dia tem 12% do
 *     volume que terá, e uma moeda com volume explodindo aparecia com 0,1x do
 *     normal. Só sumia quando alguém conferia à noite;
 *   - `takerBuy` zerado da Gate virava pressão compradora 0,000, que se lê como
 *     "ninguém comprou" quando significa "não medido";
 *   - preço de lixo (o JCT já foi gravado a 2,9e-27) envenenava o VWAP e fazia o
 *     desconto virar −100%;
 *   - série curta devolvia salto 1,0x, que se lê como "volume normal" sobre uma
 *     medição que não aconteceu.
 *
 * Rode com: npm run testar-acumulacao
 */

import { lerAcumulacao, BASE_DE_VOLUME, type BarraDeVolume } from "../lib/acumulacao";

let falhas = 0;

function ok(nome: string, condicao: boolean, detalhe: string) {
  console.log(`  ${nome.padEnd(58)} ${detalhe.padEnd(28)} ${condicao ? "ok" : "FALHOU"}`);
  if (!condicao) falhas++;
}

/** Uma série sintética de dias fechados, todos iguais, para servir de base. */
function serie(dias: number, volume = 1000, preco = 10): BarraDeVolume[] {
  const base = Date.UTC(2026, 0, 1) / 1000;
  return Array.from({ length: dias }, (_, i) => ({
    time: base + i * 86_400,
    open: preco,
    high: preco,
    low: preco,
    close: preco,
    volume,
    takerBuy: volume / 2,
  }));
}

/** O instante "agora" usado nos testes: o dia seguinte ao último fechado. */
function depoisDe(s: BarraDeVolume[]): number {
  return (s[s.length - 1].time + 86_400) * 1000;
}

console.log("\n--- o que a leitura recusa a medir ---");

{
  const curta = serie(BASE_DE_VOLUME - 5);
  ok(
    "série sem os 90 dias de base devolve nulo, não 1,0x",
    lerAcumulacao(curta, depoisDe(curta)) === null,
    "null",
  );
}

{
  // 120 dias normais e o último com preço de lixo, como o JCT a 2,9e-27.
  const s = serie(120);
  s[s.length - 1] = { ...s[s.length - 1], close: 2.9e-27, high: 2.9e-27, low: 2.9e-27 };
  ok(
    "preço de lixo no último dia devolve nulo",
    lerAcumulacao(s, depoisDe(s)) === null,
    "null",
  );
}

{
  // Lixo NO MEIO da janela: a leitura continua, mas sem envenenar o VWAP.
  const s = serie(120);
  s[100] = { ...s[100], close: 2.9e-27, high: 2.9e-27, low: 2.9e-27 };
  const a = lerAcumulacao(s, depoisDe(s));
  ok(
    "preço de lixo no meio não envenena o VWAP",
    a !== null && Math.abs(a.desconto) < 0.01,
    a ? `desconto ${(a.desconto * 100).toFixed(2)}%` : "null",
  );
}

console.log("\n--- o dia aberto ---");

{
  // 120 dias fechados de volume 1000, e hoje aberto com 100 (o dia mal começou).
  const s = serie(120);
  const hoje = s[s.length - 1].time + 86_400;
  s.push({ time: hoje, open: 10, high: 10, low: 10, close: 10, volume: 100, takerBuy: 50 });
  // "agora" é o instante em que a vela de hoje ainda está aberta.
  const a = lerAcumulacao(s, hoje * 1000 + 3 * 3600_000);
  ok(
    "volume 'agora' usa o último dia FECHADO, não a vela de hoje",
    a !== null && Math.abs(a.agora - 1) < 1e-9,
    a ? `${a.agora.toFixed(2)}x (a vela aberta daria 0,10x)` : "null",
  );
}

{
  // O preço da vela aberta É o preço de agora, e isso tem de continuar valendo.
  const s = serie(120);
  const hoje = s[s.length - 1].time + 86_400;
  s.push({ time: hoje, open: 10, high: 13, low: 10, close: 13, volume: 100, takerBuy: 50 });
  const a = lerAcumulacao(s, hoje * 1000 + 3 * 3600_000);
  ok(
    "o preço da vela aberta continua valendo para o desconto",
    a !== null && a.desconto > 0.25,
    a ? `desconto +${(a.desconto * 100).toFixed(0)}% sobre o VWAP` : "null",
  );
}

console.log("\n--- o evento ---");

{
  // Um único dia com 50x o volume, 10 dias antes do fim.
  const s = serie(120);
  const i = s.length - 11;
  s[i] = { ...s[i], volume: 50_000, open: 10, close: 11 };
  const a = lerAcumulacao(s, depoisDe(s));
  ok(
    "acha o salto e mede contra a mediana ANTERIOR a ele",
    a !== null && Math.abs(a.salto - 50) < 0.01,
    a ? `${a.salto.toFixed(1)}x` : "null",
  );
  ok(
    "conta os dias desde o evento",
    a !== null && a.diasDesde === 10,
    a ? `${a.diasDesde} dias` : "null",
  );
  ok(
    "mede quanto o preço andou NO dia do evento",
    a !== null && Math.abs(a.moveuNoDia - 0.1) < 1e-9,
    a ? `+${(a.moveuNoDia * 100).toFixed(0)}%` : "null",
  );
}

{
  // Evento fora da janela de 60 dias não é o assunto da moeda.
  const s = serie(200);
  const i = s.length - 120;
  s[i] = { ...s[i], volume: 90_000 };
  const a = lerAcumulacao(s, depoisDe(s));
  ok(
    "evento de 120 dias atrás fica fora da janela de 60",
    a !== null && a.salto < 2,
    a ? `${a.salto.toFixed(1)}x` : "null",
  );
}

console.log("\n--- o que não foi medido ---");

{
  const s = serie(120);
  const i = s.length - 5;
  s[i] = { ...s[i], volume: 50_000, takerBuy: 0 };
  const a = lerAcumulacao(s, depoisDe(s));
  ok(
    "takerBuy zerado (Gate) vira nulo, não pressão 0,000",
    a !== null && a.pressao === null,
    a ? `pressao ${a.pressao}` : "null",
  );
}

{
  const s = serie(120);
  const i = s.length - 5;
  s[i] = { ...s[i], volume: 50_000, takerBuy: 30_000 };
  const a = lerAcumulacao(s, depoisDe(s));
  ok(
    "takerBuy de verdade vira fração",
    a !== null && a.pressao !== null && Math.abs(a.pressao - 0.6) < 1e-9,
    a?.pressao ? a.pressao.toFixed(3) : "null",
  );
}

{
  // Volume zerado na janela inteira: divisão por zero não pode virar Infinity.
  const s = serie(120, 0);
  const a = lerAcumulacao(s, depoisDe(s));
  ok(
    "volume zero na janela inteira não vira Infinity",
    a === null || Number.isFinite(a.salto),
    a === null ? "null" : `salto ${a.salto}`,
  );
}

{
  // NaN no volume de um dia: `NaN > salto` é falso, então ele não pode virar o
  // evento — e também não pode derrubar a leitura.
  const s = serie(120);
  s[110] = { ...s[110], volume: NaN };
  const a = lerAcumulacao(s, depoisDe(s));
  ok(
    "NaN no volume não vira evento nem derruba a leitura",
    a !== null && Number.isFinite(a.salto),
    a ? `salto ${a.salto.toFixed(2)}x` : "null",
  );
}

console.log(falhas === 0 ? "\ntudo passou\n" : `\n${falhas} caso(s) falharam\n`);
process.exit(falhas === 0 ? 0 : 1);
