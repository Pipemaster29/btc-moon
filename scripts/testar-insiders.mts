/**
 * Os casos-limite da leitura dos criadores e VCs (`lib/insiders.ts`), sem tocar
 * em rede. Sai com código diferente de zero quando algum falha.
 *
 * O que mais importa travar: o endereço de depósito reconhecido pelo
 * comportamento (e o "não mandou nada adiante" que NÃO é "não é depósito"), a
 * infraestrutura que não vira insider, e o evento do pré-registro — a soma do
 * dia, o piso e o episódio de 7 dias.
 *
 * Rode com: npx tsx scripts/testar-insiders.mts
 */
import {
  aInvestigar,
  avisosDe,
  classePelaEtiqueta,
  classePeloComportamento,
  eventosDe,
  nivel1De,
  PISOS,
  resumir,
  type ClasseDoDestino,
  type Fluxo,
  type Rotulos,
  type Transferencia,
} from "../lib/insiders";

let falhas = 0;
function confere(nome: string, ok: boolean, obtido: string): void {
  if (!ok) falhas++;
  console.log(`  ${nome.padEnd(66)} ${obtido.padEnd(28)} ${ok ? "ok" : "← FALHOU"}`);
}
const perto = (x: number, y: number) => Math.abs(x - y) <= 1e-12 * Math.max(1, Math.abs(y));
const e = (n: number | string) => `0x${String(n).padStart(40, "0")}`;
const BINANCE = e("b1");
const WINTERMUTE = e("a1");
const POOL = e("c1");
const rotulos: Rotulos = { corretora: (x) => (x === BINANCE ? "Binance" : null), marketMaker: (x) => (x === WINTERMUTE ? "Wintermute" : null), pool: (x) => x === POOL };
let bloco = 0;
const t = (de: string, para: string, fracao: number): Transferencia => ({ bloco: ++bloco, tx: `0x${bloco}`, de, para, fracao });

console.log("\na etiqueta");
{
  confere("corretora, market maker e pool pela etiqueta", classePelaEtiqueta(BINANCE, rotulos)?.nome === "Binance" && classePelaEtiqueta(WINTERMUTE, rotulos)?.classe === "marketmaker" && classePelaEtiqueta(POOL, rotulos)?.classe === "pool", "ok");
  confere("o endereço nulo e o morto são queima", classePelaEtiqueta(e(0), rotulos)?.classe === "queima" && classePelaEtiqueta("0x000000000000000000000000000000000000dead", rotulos)?.classe === "queima", "queima");
  confere("sem etiqueta é nulo, não “outro”", classePelaEtiqueta(e(7), rotulos) === null, "nulo");
}

console.log("\nquem investigar");
{
  const dono = e(1);
  const saidas = [t(dono, e(10), 0.0002), t(dono, e(11), 0.00019), t(dono, BINANCE, 0.05), t(dono, e(12), 0.0001), ...Array.from({ length: 12 }, () => t(dono, e(13), 0.0001))];
  const xs = aInvestigar(saidas, new Set([dono]), rotulos);
  confere("uma transferência no piso entra; logo abaixo, não", xs.includes(e(10)) && !xs.includes(e(11)) && !xs.includes(e(12)), xs.length.toString());
  confere("muitas pequenas somando 0,1% do supply entram", xs.includes(e(13)), "sim");
  confere("destino com etiqueta não é investigado", !xs.includes(BINANCE), "fora");
  confere("quem já é conhecido não é investigado de novo", aInvestigar([t(dono, e(10), 0.01)], new Set([dono, e(10)]), rotulos).length === 0, "0");
}

console.log("\no comportamento");
{
  const d = e(20);
  const deposito = classePeloComportamento([t(d, BINANCE, 0.008), t(d, e(21), 0.002)], rotulos);
  confere("80% repassado a corretora é endereço de depósito", deposito.classe === "corretora" && deposito.nome === "Binance", `${deposito.classe} · ${deposito.nome}`);
  confere("79% não é", classePeloComportamento([t(d, BINANCE, 0.0079), t(d, e(21), 0.0021)], rotulos).classe === "outro", "outro");
  confere("não mandou nada adiante: “outro”, não depósito nem infraestrutura", classePeloComportamento([], rotulos).classe === "outro", "outro");
  const muitos = Array.from({ length: PISOS.destinosDeInfraestrutura + 1 }, (_, i) => t(d, e(1000 + i), 0.0001));
  confere("51 destinos distintos é infraestrutura", classePeloComportamento(muitos, rotulos).classe === "infraestrutura", "infraestrutura");
  confere("50 destinos ainda não", classePeloComportamento(muitos.slice(0, PISOS.destinosDeInfraestrutura), rotulos).classe === "outro", "outro");
  confere("o depósito vence a infraestrutura", classePeloComportamento([...muitos.map((x) => ({ ...x, fracao: 1e-7 })), t(d, BINANCE, 0.01)], rotulos).classe === "corretora", "corretora");
}

console.log("\no nível 1");
{
  const dono = e(1);
  const saidas = [t(dono, e(30), 0.02), t(dono, e(31), 0.0009), t(dono, e(32), 0.03), t(dono, e(33), 0.04), t(dono, BINANCE, 0.05), t(dono, e(34), 0.0006), t(dono, e(34), 0.0006)];
  const classes = new Map<string, { classe: ClasseDoDestino }>([[e(32), { classe: "corretora" }], [e(33), { classe: "infraestrutura" }], [e(30), { classe: "outro" }]]);
  const n1 = nivel1De(saidas, new Set([dono]), classes, rotulos);
  confere("entra quem recebeu 0,1% ou mais, somado", n1.includes(e(30)) && n1.includes(e(34)) && !n1.includes(e(31)), n1.length.toString());
  confere("depósito, infraestrutura e corretora ficam fora", !n1.includes(e(32)) && !n1.includes(e(33)) && !n1.includes(BINANCE), "fora");
  const muitos = Array.from({ length: PISOS.maximoNoNivel1 + 5 }, (_, i) => t(dono, e(2000 + i), 0.002 + i * 1e-5));
  const top = nivel1De(muitos, new Set([dono]), new Map(), rotulos);
  confere("no máximo 40, os que mais receberam", top.length === PISOS.maximoNoNivel1 && top[0] === e(2000 + PISOS.maximoNoNivel1 + 4), `${top.length}`);
}

console.log("\nos eventos");
{
  const D = 86_400;
  const f = (dia: number, hora: number, classe: ClasseDoDestino, fracao: number): Fluxo => ({ t: dia * D + hora * 3600, bloco: 1, tx: "0x", de: e(1), nivel: 0, para: BINANCE, classe, fracao });
  const fluxos = [f(100, 1, "corretora", 0.0006), f(100, 20, "corretora", 0.0005), f(101, 2, "corretora", 0.0009), f(103, 0, "corretora", 0.01), f(107, 0, "corretora", 0.002), f(110, 0, "marketmaker", 0.003), f(111, 0, "outro", 0.5)];
  const ev = eventosDe(fluxos, "corretora");
  confere("a soma do dia passa o piso; o dia abaixo dele não é evento", ev[0].dia === 100 * D * 1000 && perto(ev[0].fracao, 0.0011), `${ev.length} · ${ev[0].fracao}`);
  confere("um por episódio: 3 dias depois não conta, 7 dias conta", ev.length === 2 && ev[1].dia === 107 * D * 1000, ev.map((x) => x.dia / D / 1000).join(","));
  confere("market maker é outro evento, e “outro” não é nenhum", eventosDe(fluxos, "marketmaker").length === 1 && eventosDe(fluxos, "marketmaker")[0].dia === 110 * D * 1000, "1");
  confere("fluxo sem hora não tem dia e fica de fora", eventosDe([{ ...f(1, 0, "corretora", 0.5), t: NaN }], "corretora").length === 0, "0");

  const agora = 200 * D;
  const r = resumir([f(100, 0, "corretora", 0.01), { ...f(190, 0, "corretora", 0.02), nome: "Binance" }, f(150, 0, "insider", 0.3), f(160, 0, "queima", 0.05), f(170, 0, "marketmaker", 0.004)], agora);
  confere("entre insiders não é destino", perto(r.paraCorretora, 0.03) && perto(r.queimado, 0.05) && perto(r.paraMarketMaker, 0.004) && r.paraOutros === 0, `${r.paraCorretora}`);
  confere("o último depósito e os 30 dias", r.ultimoDeposito?.t === 190 * D && r.ultimoDeposito.nome === "Binance" && perto(r.paraCorretora30d, 0.02), `${r.paraCorretora30d}`);
  confere("sem depósito nenhum, o último é nulo", resumir([f(1, 0, "outro", 0.1)], agora).ultimoDeposito === null, "nulo");
}

console.log("\nos avisos da rodada");
{
  const f = (classe: ClasseDoDestino, fracao: number, nome?: string, porComportamento?: boolean): Fluxo => ({ t: 1, bloco: 1, tx: "0x", de: e(1), nivel: 0, para: BINANCE, classe, fracao, ...(nome ? { nome } : {}), ...(porComportamento ? { porComportamento } : {}) });
  const av = avisosDe("XYZUSDT", [f("corretora", 0.0006, "Binance"), f("corretora", 0.0006, "Binance", true), f("corretora", 0.0009, "OKX"), f("marketmaker", 0.002, "Wintermute"), f("outro", 0.5), f("insider", 0.5)]);
  confere("soma por destino: a Binance passa o piso, a OKX não", av.length === 2 && av.some((x) => x.includes("Binance") && x.includes("0,12%")) && !av.some((x) => x.includes("OKX")), `${av.length}`);
  confere("o depósito reconhecido pela varredura é dito", av.some((x) => x.includes("reconhecido pela varredura")), "sim");
  confere("market maker é outro aviso; “outro” e insider, nenhum", av.some((x) => x.includes("Wintermute, market maker")), "sim");
  confere("todo aviso diz que não há medição", av.every((x) => x.includes("Sem medição")), "sim");
  confere("sem novidade, sem aviso", avisosDe("XYZUSDT", []).length === 0, "0");
}

console.log(falhas === 0 ? "\ntodos os casos passaram" : `\n${falhas} caso(s) FALHARAM`);
if (falhas > 0) process.exit(1);
