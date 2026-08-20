/**
 * Exercita as regras de alerta com dados inventados, sem tocar em nada.
 *
 * Existe por causa de um erro concreto: para testar a regra de oferta chegando
 * às corretoras, editei o arquivo de estado do monitor à mão e rodei o ciclo de
 * verdade. Resultado — foi para o Telegram um alerta dizendo que a oferta da BR
 * tinha saltado de 0,16% para 1,25% do supply, redigido exatamente como um
 * alerta real, sobre um evento que nunca aconteceu. Só foi possível desconfiar
 * indo conferir a rede.
 *
 * Duas coisas estavam erradas ali, e nenhuma era a regra. Mexer no estado
 * contamina a memória do monitor, e rodar o ciclo de verdade manda mensagem de
 * verdade. Este script não faz nem uma coisa nem outra: chama `detect` com
 * entrada sintética e imprime no terminal. É onde regra se testa.
 *
 * Rode com: npm run testar-alerta
 */

import { detect, type DetectInput } from "../lib/alerts";

interface Caso {
  nome: string;
  esperado: string;
  entrada: DetectInput;
}

const base: DetectInput = {
  symbol: "TESTE",
  gasSymbol: "BNB",
  previous: {},
  current: [],
  transfers: [],
  priceUsd: 0.24,
  liquidityUsd: 1_250_000,
};

const casos: Caso[] = [
  {
    nome: "float salta de 0,16% para 1,25% do supply em 2h",
    esperado: "float-jump",
    entrada: {
      ...base,
      floatCex: {
        agora: 0.01247,
        antes: 0.00156,
        horas: 2,
        chegadas: [],
        supply: 1_000_000_000,
      },
    },
  },
  {
    nome: "float sobe de 0,001% para 0,002% — dobrou, mas não é nada",
    esperado: "nenhum (o piso absoluto barra)",
    entrada: {
      ...base,
      floatCex: { agora: 0.00002, antes: 0.00001, horas: 2, chegadas: [], supply: 1e9 },
    },
  },
  {
    nome: "float alto sobe 10% — muita moeda, pouca variação",
    esperado: "nenhum (o piso relativo barra)",
    entrada: {
      ...base,
      floatCex: { agora: 0.55, antes: 0.5, horas: 2, chegadas: [], supply: 1e9 },
    },
  },
  {
    nome: "chegada de 0,5% do supply numa carteira de corretora",
    esperado: "cex-inflow",
    entrada: {
      ...base,
      floatCex: {
        agora: 0.012,
        antes: 0.007,
        horas: 1,
        supply: 1_000_000_000,
        chegadas: [
          {
            amount: 5_000_000,
            from: "0x1111111111111111111111111111111111111111",
            to: "0x26209d9f0Dc3aC0129C3FB1bADaBFeb9eE728c66",
            toLabel: "Bitget (fria)",
            block: 116_900_000,
          },
        ],
      },
    },
  },
  {
    nome: "chegada minúscula: 0,0001% do supply e US$ 240",
    esperado: "nenhum",
    entrada: {
      ...base,
      floatCex: {
        agora: 0.0071,
        antes: 0.007,
        horas: 1,
        supply: 1_000_000_000,
        chegadas: [
          {
            amount: 1_000,
            from: "0x1111111111111111111111111111111111111111",
            to: "0x26209d9f0Dc3aC0129C3FB1bADaBFeb9eE728c66",
            toLabel: "Bitget (fria)",
            block: 116_900_000,
          },
        ],
      },
    },
  },
  {
    nome: "primeira leitura da moeda — não há com o que comparar",
    esperado: "nenhum",
    entrada: {
      ...base,
      floatCex: { agora: 0.4, antes: null, horas: 0, chegadas: [], supply: 1e9 },
    },
  },
];

console.log("\nENTRADA SINTÉTICA — nada aqui aconteceu de verdade\n");

let falhas = 0;
for (const caso of casos) {
  const alertas = detect(caso.entrada);
  const tipos = alertas.map((a) => a.kind);
  const esperaNenhum = caso.esperado.startsWith("nenhum");
  const ok = esperaNenhum ? tipos.length === 0 : tipos.includes(caso.esperado);
  if (!ok) falhas++;

  console.log(`${ok ? "ok  " : "FALHA"} ${caso.nome}`);
  console.log(`     esperado: ${caso.esperado} · saiu: ${tipos.join(", ") || "nenhum"}`);
  for (const a of alertas) console.log(`     → ${a.title}`);
  console.log("");
}

console.log(`${casos.length - falhas}/${casos.length} casos como esperado`);
if (falhas > 0) process.exitCode = 1;
