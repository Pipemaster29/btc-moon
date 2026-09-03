/**
 * Os casos-limite do motor da carteira, sem tocar em rede.
 *
 * Cada um destes QUEBROU de verdade antes de virar teste, e o primeiro quebrou
 * feio: uma linha de preço de lixo — o JCT foi gravado a 2,9e-27 — fazia mil
 * dólares virarem 1,3e+28, porque a posição fechava no stop a −100%, REABRIA no
 * preço de lixo e fechava no alvo com ganho de 3,5e+28%.
 *
 * Não há framework de teste aqui, e não faz falta: o motor é uma função pura
 * sobre uma lista de emissões, então o teste é chamá-la e olhar o número.
 *
 * Rode com: npm run testar-carteira
 */
import { rodar, type Emissao } from "../lib/carteira";

const T0 = Date.parse("2026-01-01T00:00:00Z") / 1000;
const h = (n: number) => T0 + n * 3600;

function caso(nome: string, es: Emissao[]) {
  const c = rodar(es, T0 * 1000);
  const exposto = c.abertas.reduce((s, p) => s + p.valor * (1 + p.retorno), 0);
  const bate = Math.abs(c.caixa + exposto - c.patrimonio) < 1e-6;
  console.log(
    `${nome.padEnd(34)} patrim ${c.patrimonio.toFixed(2).padStart(8)} · abertas ${c.abertas.length} · ` +
      `fechadas ${c.encerradas} ${c.fechadas.map((f) => f.motivo).join(",")} ${bate ? "" : "· SOMA NÃO BATE"}`,
  );
}

// 1. moeda some do retrato depois de aberta — a posição pode ficar presa?
caso("moeda deslistada, 20 dias depois", [
  { t: h(0), s: "X", preco: 1, vies: "long", forca: 2 },
  { t: h(1), s: "Y", preco: 1, vies: null },
  ...Array.from({ length: 25 }, (_, i) => ({ t: h(24 * (i + 1)), s: "Y", preco: 1, vies: null }) as Emissao),
]);

// 2. preço de lixo — o JCT foi gravado a 2,9e-27
caso("preço vira lixo (2.9e-27)", [
  { t: h(0), s: "X", preco: 1, vies: "long", forca: 2 },
  { t: h(1), s: "X", preco: 2.9e-27, vies: "long", forca: 2 },
]);

// 3. gap maior que o stop
caso("gap de -80% entre retratos", [
  { t: h(0), s: "X", preco: 1, vies: "long", forca: 3 },
  { t: h(1), s: "X", preco: 0.2, vies: "long", forca: 3 },
]);

// 4. short com preço indo a zero (ganho limitado a +100%)
caso("short e o preço vai a quase zero", [
  { t: h(0), s: "X", preco: 1, vies: "short", forca: 3 },
  { t: h(1), s: "X", preco: 0.0001, vies: "short", forca: 3 },
]);

// 5. muitas calls de uma vez — o teto de exposição segura?
caso("40 calls no mesmo instante", [
  ...Array.from({ length: 40 }, (_, i) => ({ t: h(0), s: `M${i}`, preco: 1, vies: "long", forca: 3 }) as Emissao),
]);

// 6. viés vira null (leitura falhou) — deve fechar ou não?
caso("viés vira null no retrato seguinte", [
  { t: h(0), s: "X", preco: 1, vies: "long", forca: 2 },
  { t: h(1), s: "X", preco: 1.05, vies: null },
]);

// --- O MOEDOR: moeda em queda contínua com o painel insistindo em "long".
// Sem a trava de call queimada, a carteira estopa e RECOMPRA no mesmo retrato,
// onze vezes seguidas, perdendo 17% do patrimônio na mesma leitura errada.
{
  const es: Emissao[] = [];
  let preco = 1;
  for (let i = 0; i < 12; i++) {
    es.push({ t: h(i), s: "X", preco, vies: "long", forca: 3, fund: 0 });
    preco *= 0.72;
  }
  const c = rodar(es, T0 * 1000);
  console.log(
    `\nqueda contínua com "long" fixo:  ${c.encerradas} stop(s), patrimônio ${c.patrimonio.toFixed(2)} ` +
      `${c.encerradas === 1 ? "ok" : "← DEVERIA SER 1"}`,
  );
}

// --- OS LIMIARES, que são de PREÇO e já foram comparados contra margem por
// engano. Cada linha abaixo trava um número que a documentação promete.
console.log("\n--- os limiares disparam onde a documentação diz? ---");
function ate(varPreco: number, lado: "long" | "short" = "long") {
  const p1 = 1;
  const p2 = lado === "long" ? p1 * (1 + varPreco) : p1 * (1 - varPreco);
  const c = rodar(
    [
      { t: h(0), s: "X", preco: p1, vies: lado, forca: 2, fund: 0 },
      { t: h(1), s: "X", preco: p2, vies: lado, forca: 2, fund: 0 },
    ],
    T0 * 1000,
  );
  return c.fechadas[0]?.motivo ?? "aberta";
}
const casos: [string, number, string][] = [
  ["preço -24% (antes do stop de 25%)", -0.24, "aberta"],
  ["preço -26% (depois do stop)", -0.26, "stop"],
  ["preço +39% (antes do alvo de 40%)", 0.39, "aberta"],
  ["preço +41% (depois do alvo)", 0.41, "alvo"],
  ["preço -34% (depois da liquidação a 33,2%)", -0.34, "liquidada"],
];
for (const [nome, v, esperado] of casos) {
  const got = ate(v);
  console.log(`  ${nome.padEnd(44)} ${got.padEnd(11)} ${got === esperado ? "ok" : `← ESPERADO ${esperado}`}`);
}
// o mesmo do lado vendido, onde os sinais invertem
for (const [nome, v, esperado] of casos) {
  const got = ate(v, "short");
  console.log(`  vendido: ${nome.padEnd(35)} ${got.padEnd(11)} ${got === esperado ? "ok" : `← ESPERADO ${esperado}`}`);
}

console.log("\n--- o caso que preocupa: lixo e volta ---");
const c = rodar(
  [
    { t: h(0), s: "X", preco: 1, vies: "long", forca: 2 },
    { t: h(1), s: "X", preco: 2.9e-27, vies: "long", forca: 2 },
    { t: h(2), s: "X", preco: 1.02, vies: "long", forca: 2 },
  ],
  T0 * 1000,
);
console.log("patrimônio:", c.patrimonio.toFixed(2), "· fechadas:", c.encerradas);
for (const f of c.fechadas) {
  console.log(`  ${f.motivo}: entrou a ${f.precoEntrada}, saiu a ${f.precoSaida}, retorno ${(f.retorno * 100).toFixed(0)}%`);
}
for (const p of c.abertas) console.log(`  aberta a ${p.precoEntrada}, agora ${p.precoAtual}, retorno ${(p.retorno * 100).toFixed(0)}%`);
