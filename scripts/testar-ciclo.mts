/**
 * Os casos-limite do padrão dos 1.064 / 364 dias (`lib/cicloBtc.ts`), sem tocar
 * em rede. Sai com código diferente de zero quando algum falha.
 *
 * O que mais importa travar: nenhuma decisão olha o futuro (mexer nos dias
 * depois de uma operação não muda a operação), o fundo que é perdido vira
 * "fundo falso" e a data anda para frente, e o calendário literal cai nas
 * datas do post.
 *
 * Rode com: npm run testar-ciclo
 */
import { REGRAS_CICLO, emaDiaria, quedaMaxima, simularAdaptativo, simularCalendario, simularMedia, type DiaBtc, type RegrasCiclo } from "../lib/cicloBtc";

let falhas = 0;
function confere(nome: string, ok: boolean, obtido: string): void {
  if (!ok) falhas++;
  console.log(`  ${nome.padEnd(66)} ${obtido.padEnd(30)} ${ok ? "ok" : "← FALHOU"}`);
}

const DIA = 86_400;
const T0 = Date.UTC(2020, 0, 1) / 1000;
/** Regras pequenas para os testes caberem em poucos dias: fundo em 10, topo em 20, só pelos 20%. */
const R: RegrasCiclo = { ...REGRAS_CICLO, diasAteFundo: 10, diasAteTopo: 20, custo: 0, compra: "subida", venda: "queda" };
const SEM = { t: T0, preco: 100 };

/** Uma série a partir de fechamentos; máxima e mínima iguais ao fechamento. */
function serie(fechos: number[]): DiaBtc[] {
  return fechos.map((f, i) => ({ t: T0 + i * DIA, alta: f, baixa: f, fecho: f }));
}
const dia = (t: number) => Math.round((t - T0) / DIA);

console.log("\na busca só abre na data");
{
  // Cai até o dia 5 (antes da busca), sobe 30% no dia 6. A busca abre no dia 10.
  const s = serie([100, 90, 80, 70, 60, 50, 65, 66, 67, 68, 69, 70, 84, 90]);
  const r = simularAdaptativo(s, R, SEM);
  confere("o repique antes da abertura não compra", r.marcas.every((m) => dia(m.t) >= 10), r.marcas.map((m) => dia(m.t)).join(",") || "nenhuma");
  confere("o fundo conta só da abertura (69 no dia 10)", r.extremos[0]?.preco === 69, String(r.extremos[0]?.preco));
  confere("compra quando fecha 20% acima (84 ≥ 82,8, dia 12)", dia(r.marcas[0]?.t ?? 0) === 12 && r.marcas[0].tipo === "compra", `${r.marcas[0]?.tipo} dia ${dia(r.marcas[0]?.t ?? 0)}`);
}

console.log("\no fundo anda para frente");
{
  // Abre no dia 10 a 80, cai a 60 no 13 sem repique de 20%, sobe a 71 (sem confirmar: 71 < 72), afunda a 50 no 16, sobe a 61.
  const s = serie([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 80, 75, 70, 60, 70, 71, 50, 55, 61]);
  const r = simularAdaptativo(s, R, SEM);
  confere("o candidato é a mínima nova (50, dia 16)", r.extremos[0]?.preco === 50 && dia(r.extremos[0].t) === 16, `${r.extremos[0]?.preco} dia ${dia(r.extremos[0]?.t ?? 0)}`);
  confere("e compra no dia 18 (61 ≥ 60)", dia(r.marcas[0]?.t ?? 0) === 18, `dia ${dia(r.marcas[0]?.t ?? 0)}`);
}

console.log("\no fundo falso");
{
  // Compra no 12 (fundo 50 do dia 10), perde o fundo no 14 e vende; novo fundo 40 no 15, recompra no 16.
  const s = serie([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 50, 55, 61, 52, 49, 40, 48, 49]);
  const r = simularAdaptativo(s, R, SEM);
  const tipos = r.marcas.map((m) => `${m.tipo}@${dia(m.t)}`).join(" ");
  confere("compra, fundo falso, compra", tipos === "compra@12 fundo falso@14 compra@16", tipos);
  confere("sobra um fundo só, o novo (40)", r.extremos.length === 1 && r.extremos[0].preco === 40, r.extremos.map((e) => e.preco).join(","));
  confere("e a contagem do topo parte dele", r.estado.ancora.preco === 40 && r.estado.procurando === "topo", `${r.estado.ancora.preco} ${r.estado.procurando}`);
}

console.log("\no topo e o topo falso");
{
  // Fundo 50 no dia 10, compra no 12. Topo abre no 30. Sobe a 200 no 31, cai a 160 no 33 (vende).
  // Depois passa de 200 no 35: topo falso, recompra.
  const f = [...new Array(10).fill(100), 50, 55, 61, ...new Array(17).fill(100), 150, 200, 180, 160, 170, 210];
  const r = simularAdaptativo(serie(f), R, SEM);
  const tipos = r.marcas.map((m) => `${m.tipo}@${dia(m.t)}`).join(" ");
  confere("compra, venda no −20%, topo falso", tipos === "compra@12 venda@33 topo falso@35", tipos);
  confere("o topo marcado é a máxima desde a abertura (200)", r.marcas.length === 3 && r.estado.procurando === "topo", `${r.estado.procurando}`);
}

console.log("\nnão olha o futuro");
{
  const base = [...new Array(10).fill(100), 50, 55, 61, ...new Array(17).fill(100), 150, 200, 180, 160];
  const a = simularAdaptativo(serie([...base, 10, 10, 10]), R, SEM);
  const b = simularAdaptativo(serie([...base, 1000, 1000, 1000]), R, SEM);
  const ate = (r: typeof a) => r.marcas.filter((m) => dia(m.t) < base.length).map((m) => `${m.tipo}@${dia(m.t)}:${m.preco}`).join(" ");
  confere("as operações até o dia 33 não dependem do que vem depois", ate(a) === ate(b), ate(a));
}

console.log("\no calendário do post");
{
  const s = serie(new Array(80).fill(100));
  const r = simularCalendario(s, R, SEM);
  const ds = r.marcas.map((m) => dia(m.t)).join(",");
  confere("compra +10, vende +20 depois, compra +10 depois", ds === "10,30,40,60,70", ds);
}

console.log("\na EMA");
{
  const e = emaDiaria(serie([1, 2, 3, 4, 5]), 3);
  confere("NaN até ter n dias; semente é a média simples", Number.isNaN(e[1]) && e[2] === 2, e.map((v) => v.toFixed(2)).join(","));
  confere("depois, k = 2/(n+1): 4·0,5 + 2·0,5 = 3", e[3] === 3 && e[4] === 4, `${e[3]}, ${e[4]}`);
  const a = emaDiaria(serie([1, 2, 3, 4, 5, 999]), 3);
  confere("o dia seguinte não muda a EMA de hoje", a[4] === e[4], String(a[4]));
}

console.log("\na venda pelo primeiro sinal");
{
  // EMA de 5 dias. Fundo 50 no dia 10, compra no 12 (61). Topo abre no 30, com o preço em 200 há dias;
  // cai a 190 no 31: abaixo da EMA (~200) e longe dos 20% — a venda "primeiro" sai aqui, a "queda" não.
  const f = [...new Array(10).fill(100), 50, 55, 61, ...new Array(18).fill(200), 190, 180, 150];
  const primeiro = simularAdaptativo(serie(f), { ...R, emaDias: 5, venda: "primeiro" }, SEM);
  const queda = simularAdaptativo(serie(f), { ...R, emaDias: 5, venda: "queda" }, SEM);
  const vp = primeiro.marcas.find((m) => m.tipo === "venda");
  const vq = queda.marcas.find((m) => m.tipo === "venda");
  confere("\"primeiro\" vende no fechamento abaixo da EMA (dia 31)", vp !== undefined && dia(vp.t) === 31, vp ? `dia ${dia(vp.t)}` : "não vendeu");
  confere("\"queda\" espera os 20% (160 → dia 33)", vq !== undefined && dia(vq.t) === 33, vq ? `dia ${dia(vq.t)}` : "não vendeu");
  // A compra pela média: dentro da janela, o primeiro fechamento acima da EMA compra, mesmo sem os 20%.
  const g = [...new Array(10).fill(100), 80, 70, 72, 80];
  const m = simularAdaptativo(serie(g), { ...R, emaDias: 3, compra: "media" }, SEM);
  confere("compra \"media\" no 1º fechamento acima da EMA", m.marcas[0]?.tipo === "compra" && dia(m.marcas[0].t) === 13, m.marcas[0] ? `dia ${dia(m.marcas[0].t)}` : "nenhuma");
  const amb = simularAdaptativo(serie(g), { ...R, emaDias: 3, compra: "ambos" }, SEM);
  confere("\"ambos\" ainda espera os 20% (80 < 84)", amb.marcas.length === 0, String(amb.marcas.length));
}

console.log("\na média sozinha");
{
  const c = simularMedia(serie([10, 10, 10, 12, 13, 9, 8, 11]), 3, 0, SEM);
  confere("compra acima, vende abaixo, compra de novo: 3 operações", c.operacoes === 3, String(c.operacoes));
}

console.log("\nlixo e queda");
{
  const s = serie([100, NaN, 100, 0, 100]);
  const r = simularAdaptativo(s, R, SEM);
  confere("fechamento NaN ou zero não entra na curva", r.curva.length === 3, String(r.curva.length));
  confere("queda máxima de pico a vale", Math.abs(quedaMaxima([{ patrimonio: 10 }, { patrimonio: 20 }, { patrimonio: 5 }, { patrimonio: 30 }]) + 0.75) < 1e-12, "−75%");
}

console.log(falhas ? `\n${falhas} caso(s) falharam` : "\ntodos os casos passaram");
process.exit(falhas ? 1 : 0);
