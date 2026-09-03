/**
 * As invariantes de TODO o estado gravado em `data/`.
 *
 * Não é teste de unidade: é a pergunta "o que está no disco faz sentido?", feita
 * contra os arquivos reais depois de qualquer varredura. Cada linha aqui existe
 * porque algum número já saiu errado — supply zero, retorno abaixo de −100%,
 * símbolo duplicado, fração fora de 0..1.
 *
 * Rode com: npm run auditar-dados
 */
import { readFile } from "node:fs/promises";

let falhas = 0;
function checa(nome: string, ok: boolean, detalhe = "") {
  if (!ok) { falhas++; console.log(`  ✗ ${nome} ${detalhe}`); }
}
async function ler<T>(p: string): Promise<T | null> {
  try { return JSON.parse(await readFile(p, "utf8")) as T; } catch { return null; }
}

// ---- panorama
const pan = await ler<{ geradoEm: number; moedas: Record<string, unknown>[] }>("data/panorama.json");
console.log("panorama:");
if (pan) {
  checa("geradoEm no passado", pan.geradoEm <= Date.now() + 60_000, `(${new Date(pan.geradoEm).toISOString()})`);
  const syms = pan.moedas.map((m) => m.symbol as string);
  checa("sem símbolo duplicado", syms.length === new Set(syms).size,
    `(${syms.length} linhas, ${new Set(syms).size} únicas)`);
  for (const m of pan.moedas as Record<string, number | null>[]) {
    const t = m.ticker as unknown as string;
    for (const campo of ["price", "liquidityUsd", "openInterestUsd", "score"]) {
      const v = m[campo];
      checa(`${t}.${campo} finito`, typeof v === "number" && Number.isFinite(v), `= ${v}`);
      if (campo !== "price") checa(`${t}.${campo} >= 0`, (v as number) >= 0, `= ${v}`);
    }
    checa(`${t}.score entre 0 e 100`, (m.score as number) >= 0 && (m.score as number) <= 100, `= ${m.score}`);
  }
} else console.log("  (ausente)");

// ---- carteira
const c = await ler<{
  caixa: number; patrimonio: number; comecouEm: number; atualizadoEm: number;
  abertas: { symbol: string; valor: number; retorno: number; forca: number; lado: string }[];
  fechadas: { retorno: number; resultado: number; dias: number; motivo: string }[];
  acertos: number; encerradas: number;
}>("data/carteira.json");
console.log("carteira:");
if (c) {
  const exposto = c.abertas.reduce((s, p) => s + p.valor * (1 + p.retorno), 0);
  checa("caixa + exposto = patrimônio", Math.abs(c.caixa + exposto - c.patrimonio) < 1e-6);
  checa("caixa não negativo", c.caixa >= -1e-9, `= ${c.caixa}`);
  checa("patrimônio não negativo", c.patrimonio >= 0, `= ${c.patrimonio}`);
  checa("atualizadoEm >= comecouEm", c.atualizadoEm >= c.comecouEm);
  checa("encerradas = fechadas.length", c.encerradas === c.fechadas.length);
  checa("acertos <= encerradas", c.acertos <= c.encerradas);
  const s = new Set(c.abertas.map((p) => p.symbol));
  checa("sem posição duplicada", s.size === c.abertas.length);
  for (const p of c.abertas) {
    checa(`${p.symbol}: retorno > -100%`, p.retorno > -1, `= ${p.retorno}`);
    checa(`${p.symbol}: valor > 0`, p.valor > 0);
    checa(`${p.symbol}: lado válido`, p.lado === "long" || p.lado === "short");
    checa(`${p.symbol}: força 1..3`, p.forca >= 1 && p.forca <= 3, `= ${p.forca}`);
  }
  for (const f of c.fechadas) {
    checa("fechada: retorno >= -100%", f.retorno >= -1.0000001, `= ${f.retorno}`);
    checa("fechada: dias >= 0", f.dias >= 0);
    checa("fechada: motivo válido",
      ["painel mudou", "stop", "alvo", "prazo", "liquidada"].includes(f.motivo), `= ${f.motivo}`);
  }
} else console.log("  (ausente)");

// ---- vesting
const v = await ler<{ moedas: Record<string, Record<string, number | boolean | null>> }>("data/vesting.json");
console.log("vesting:");
if (v) {
  for (const [k, m] of Object.entries(v.moedas)) {
    const f = (n: string) => m[n] as number;
    checa(`${k}: travado 0..1`, f("travado") >= 0 && f("travado") <= 1, `= ${f("travado")}`);
    checa(`${k}: emCorretora 0..1`, f("emCorretora") >= 0 && f("emCorretora") <= 1.0001, `= ${f("emCorretora")}`);
    checa(`${k}: supply > 0`, f("supply") > 0);
    checa(`${k}: ritmo finito`, Number.isFinite(f("ritmo")));
    const fc = m.foraDeCirculacao as number | null | undefined;
    if (fc != null) checa(`${k}: foraDeCirculacao 0..1`, fc >= 0 && fc <= 1, `= ${fc}`);
    for (const cofre of (m.cofres as unknown as { hoje: number; recebeu: number }[]) ?? []) {
      checa(`${k}: cofre.hoje 0..1`, cofre.hoje >= 0 && cofre.hoje <= 1.0001, `= ${cofre.hoje}`);
      // `recebeu` pode passar de 1 em token de ponte, e passar não é erro: o
      // mesmo endereço recebe emissão toda vez que alguém atravessa. O que
      // denuncia isso é `cobertura`, e esses casos já caem no veredito
      // "contínua". Aqui só se exige que não seja negativo nem absurdo.
      checa(`${k}: cofre.recebeu >= 0`, cofre.recebeu >= 0, `= ${cofre.recebeu}`);
      checa(`${k}: cofre.recebeu abaixo de 10x o supply`, cofre.recebeu < 10, `= ${cofre.recebeu}`);
    }
  }
} else console.log("  (ausente)");

console.log(falhas === 0 ? "\nTUDO OK" : `\n${falhas} FALHAS`);
