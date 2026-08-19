/**
 * Roda o detector de saída de baleia sobre a história, hora a hora.
 *
 * Existe para responder a única pergunta que importa antes de ligar um alerta:
 * quantas vezes ele teria falado, e o que aconteceu depois de cada uma. Regra
 * que não passa por aqui não vai para o Telegram.
 *
 * Rode com: npm run replay BTW GPS PRL DOGE SOL
 */

import { liveStats } from "../lib/gate";
import { detectWhaleExit } from "../lib/positioning";

const moedas = process.argv.slice(2);
if (moedas.length === 0) moedas.push("BTW", "GPS", "PRL", "LAB", "DOGE", "SOL");

const hora = (t: number) => new Date(t * 1000).toISOString().slice(5, 16).replace("T", " ");
const pct = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(0)}%`;

let episodios = 0;
const placar = { h24: [0, 0], h48: [0, 0] };

for (const moeda of moedas) {
  const symbol = moeda.toUpperCase().endsWith("USDT") ? moeda.toUpperCase() : `${moeda.toUpperCase()}USDT`;
  const serie = await liveStats(symbol, "1h", 100);
  if (serie.length < 30) {
    console.log(`\n${symbol}: sem dado suficiente`);
    continue;
  }

  // Disparos a menos de 6 horas um do outro são o mesmo episódio.
  const disparos: { time: number; price: number; share: number }[] = [];
  for (let i = 24; i < serie.length; i++) {
    const sinal = detectWhaleExit(serie.slice(i - 24, i + 1));
    if (!sinal || !sinal.fragile) continue;
    const anterior = disparos[disparos.length - 1];
    if (anterior && serie[i].time - anterior.time <= 6 * 3600) continue;
    disparos.push({ time: serie[i].time, price: serie[i].price, share: sinal.share });
  }

  console.log(`\n${symbol}: ${disparos.length} episódio(s) em ${serie.length} horas`);
  for (const d of disparos) {
    // Dois horizontes de propósito. Um aviso de topo que chega um dia cedo é
    // diferente de um aviso errado, e a diferença só aparece medindo os dois:
    // no GPS de 17/08 o preço subiu 10% em 24 horas e caiu 32% em 48.
    const janelas = [24, 48].map((h) =>
      serie.filter((s) => s.time > d.time && s.time <= d.time + h * 3600),
    );
    if (janelas[0].length === 0) {
      console.log(`  ${hora(d.time)} US$ ${d.price.toPrecision(5)} — ${(d.share * 100).toFixed(1)}% do livro · ainda sem futuro medido`);
      continue;
    }
    episodios++;
    const marcas = janelas.map((futuro, i) => {
      if (futuro.length === 0) return "48h —";
      const r = futuro[futuro.length - 1].price / d.price - 1;
      const chave = i === 0 ? "h24" : "h48";
      if (r <= -0.08) placar[chave][0]++;
      else if (r >= 0.08) placar[chave][1]++;
      return `${i === 0 ? "24h" : "48h"} ${pct(r)} ${r <= -0.08 ? "✓" : r >= 0.08 ? "✗" : "~"}`;
    });
    const pior = Math.min(...janelas[1].concat(janelas[0]).map((s) => s.price)) / d.price - 1;
    console.log(
      `  ${hora(d.time)} US$ ${d.price.toPrecision(5)} — ${(d.share * 100).toFixed(1)}% do livro · ` +
        `${marcas.join(" · ")} (pior ${pct(pior)})`,
    );
  }
}

console.log(
  `\nplacar: ${episodios} episódios\n` +
    `  em 24h: ${placar.h24[0]} caíram >8% · ${placar.h24[1]} subiram >8%\n` +
    `  em 48h: ${placar.h48[0]} caíram >8% · ${placar.h48[1]} subiram >8%`,
);
