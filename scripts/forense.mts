/**
 * Reconstrói a curva de saldo de carteiras específicas ao longo de um ciclo.
 *
 * Serve para responder o que nenhum agregado responde: o que cada baleia FEZ
 * durante a subida, e não só no topo. A diferença importa — no LAB, duas
 * carteiras grandes se comportaram de formas opostas na mesma alta, e só a
 * curva individual mostra isso.
 *
 * Só funciona na BNB Chain, porque é a única rede aqui com nó público que serve
 * estado antigo. Na Base o `balanceAt` falha por desenho, com mensagem clara.
 *
 * Rode com: npm run forense LAB 0xc882b1...
 *           npm run forense BTW 0x26209d... 0x1AB497...
 */

import { balanceAt, blockNumber, blockTime, isContract, toUnits, CHAINS } from "../lib/onchain";

const TOKENS: Record<string, { contract: string; inicio: string }> = {
  LAB: { contract: "0x7ec43Cf65F1663F820427C62A5780b8f2E25593A", inicio: "2026-03-15" },
  BTW: { contract: "0x444045B0EE1ee319A660a5E3d604CA0ffA35ACaA", inicio: "2026-06-04" },
};

const [nome, ...carteiras] = process.argv.slice(2);
const alvo = TOKENS[(nome ?? "").toUpperCase()];

if (!alvo || carteiras.length === 0) {
  console.error(`uso: npm run forense LAB 0xEndereco [0xOutro...]`);
  console.error(`tokens: ${Object.keys(TOKENS).join(", ")}`);
  process.exit(1);
}

const head = await blockNumber("bsc");
const tHead = await blockTime("bsc", head);
const seg = CHAINS.bsc.secondsPerBlock;
const blocoDe = (ts: number) => Math.round(head - (tHead - ts) / seg);

const inicio = Date.parse(alvo.inicio) / 1000;
const agora = Math.floor(Date.now() / 1000);
const PONTOS = 16;
const passo = (agora - inicio) / (PONTOS - 1);
const marcos = Array.from({ length: PONTOS }, (_, i) => Math.round(inicio + i * passo));

console.log(`\n${"=".repeat(20 + carteiras.length * 13)}`);
console.log(`${nome.toUpperCase()} · curva de saldo por carteira`);
console.log("=".repeat(20 + carteiras.length * 13));

for (const c of carteiras) {
  const tipo = await isContract("bsc", c).catch(() => false);
  console.log(`  ${c.slice(0, 10)}…  ${tipo ? "contrato" : "carteira"}`);
}

console.log(`\n  data        ${carteiras.map((c) => c.slice(0, 8).padStart(12)).join("")}`);

const serie: number[][] = [];

for (const ts of marcos) {
  const bloco = blocoDe(ts);
  if (bloco < 1 || bloco > head) continue;

  const linha: number[] = [];
  for (const c of carteiras) {
    try {
      linha.push(toUnits(await balanceAt("bsc", alvo.contract, c, bloco), 18));
    } catch {
      linha.push(NaN);
    }
  }
  serie.push(linha);

  const dia = new Date(ts * 1000).toISOString().slice(0, 10);
  console.log(
    `  ${dia}  ${linha.map((v) => (Number.isFinite(v) ? `${(v / 1e6).toFixed(2)}M` : "—").padStart(12)).join("")}`,
  );
}

// ----------------------------------------------------------------- leitura
if (serie.length >= 2) {
  console.log(`\n${"─".repeat(20 + carteiras.length * 13)}`);
  console.log(`  Da primeira à última leitura:\n`);

  for (const [i, c] of carteiras.entries()) {
    const valores = serie.map((l) => l[i]).filter(Number.isFinite);
    if (valores.length < 2) continue;

    const primeiro = valores[0];
    const ultimo = valores[valores.length - 1];
    const maior = Math.max(...valores);
    const menor = Math.min(...valores);

    // O comportamento se lê pela forma da curva, não pelo saldo final: quem
    // zerou no meio e voltou depois é um perfil diferente de quem só acumulou.
    const zerou = menor < maior * 0.05;
    const cresceu = ultimo > primeiro * 1.5;
    const perfil = zerou && cresceu
      ? "saiu na alta e recomprou depois"
      : cresceu
        ? "acumulou ao longo do período"
        : ultimo < primeiro * 0.5
          ? "distribuiu"
          : "estável";

    console.log(
      `  ${c.slice(0, 10)}…  ${(primeiro / 1e6).toFixed(2)}M → ${(ultimo / 1e6).toFixed(2)}M  ` +
        `(pico ${(maior / 1e6).toFixed(2)}M, fundo ${(menor / 1e6).toFixed(2)}M)  ${perfil}`,
    );
  }
}
