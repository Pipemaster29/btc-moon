/**
 * Monitor de carteiras on-chain.
 *
 * Faz o que se faz manualmente no Arkham ou no BscScan: olha quanto as carteiras
 * grandes seguram, compara com a rodada anterior e avisa quando alguma coisa se
 * mexeu. O que ele acrescenta é o denominador — o saldo dessas carteiras medido
 * contra a liquidez que existe para absorvê-lo.
 *
 * O retrato fica em `.cache/wallets.json`. Isso não é cache descartável: os nós
 * públicos não servem estado antigo, então o histórico só existe porque foi
 * salvo. Apagar o arquivo apaga o histórico.
 *
 * Rode com: npm run wallets
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  balancesOf,
  blockNumber,
  gasOf,
  isContract,
  toUnits,
  tokenInfo,
  transfersBetween,
  CHAINS,
} from "../lib/onchain";
import { depthOn, pairsOfToken } from "../lib/dexscreener";
import { WATCHLIST, labelOf, type WatchedToken } from "../lib/watchlist";

const STATE = ".cache/wallets.json";

interface Snapshot {
  time: number;
  block: number;
  priceUsd: number;
  /** Saldo por carteira, em unidades do token. */
  balances: Record<string, number>;
}

type State = Record<string, Snapshot[]>;

const money = (v: number) =>
  v >= 1e9
    ? `$${(v / 1e9).toFixed(2)}B`
    : v >= 1e6
      ? `$${(v / 1e6).toFixed(1)}M`
      : v >= 1e3
        ? `$${(v / 1e3).toFixed(0)}k`
        : `$${v.toFixed(0)}`;

const units = (v: number) =>
  v >= 1e9
    ? `${(v / 1e9).toFixed(2)}B`
    : v >= 1e6
      ? `${(v / 1e6).toFixed(2)}M`
      : v.toLocaleString("pt-BR", { maximumFractionDigits: 0 });

const signed = (v: number) => `${v >= 0 ? "+" : ""}${(v * 100).toFixed(2)}%`;

async function loadState(): Promise<State> {
  try {
    return JSON.parse(await readFile(STATE, "utf8")) as State;
  } catch {
    return {};
  }
}

// ------------------------------------------------------------------- token

async function report(token: WatchedToken, state: State): Promise<void> {
  console.log(`\n${"=".repeat(92)}`);
  console.log(token.symbol);
  console.log("=".repeat(92));

  if (!token.contract) {
    console.log(
      `\n  sem contrato configurado nesta rede — veja lib/watchlist.ts para o motivo.`,
    );
    return;
  }

  const [info, head, pairs] = await Promise.all([
    tokenInfo(token.chain, token.contract),
    blockNumber(token.chain),
    pairsOfToken(token.contract),
  ]);

  const depth = depthOn(pairs, token.chain);
  const price = depth?.priceUsd ?? 0;
  const supply = toUnits(info.totalSupply, info.decimals);

  console.log(
    `\n  ${info.symbol} · ${units(supply)} de supply · ${money(price * supply)} de valor total`,
  );
  if (depth) {
    console.log(
      `  preço ${price.toPrecision(4)} · liquidez ${money(depth.liquidityUsd)} em ${depth.pairs} pools · volume 24h ${money(depth.volume24h)}`,
    );
  }

  // --------------------------------------------------------------- saldos
  const addresses = token.wallets.map((w) => w.address);
  const balances = await balancesOf(token.chain, token.contract, addresses);

  const history = state[token.symbol] ?? [];
  const previous = history[history.length - 1];

  console.log(`\n  carteira                saldo         valor    % supply    desde a última leitura`);

  let held = 0;
  const current: Record<string, number> = {};

  for (const wallet of token.wallets) {
    const amount = toUnits(
      balances.get(wallet.address.toLowerCase()) ?? BigInt(0),
      info.decimals,
    );
    current[wallet.address.toLowerCase()] = amount;
    held += amount;

    const before = previous?.balances[wallet.address.toLowerCase()];
    let movement = "—";
    if (before !== undefined) {
      const delta = amount - before;
      // Variações minúsculas são poeira de contrato, não decisão de ninguém.
      if (Math.abs(delta) > supply * 1e-6) {
        movement = `${delta > 0 ? "entrou" : "SAIU"} ${units(Math.abs(delta))} (${money(Math.abs(delta) * price)})`;
      } else movement = "parado";
    }

    console.log(
      `  ${wallet.label.padEnd(20)} ${units(amount).padStart(11)}  ${money(amount * price).padStart(11)}  ${((amount / supply) * 100).toFixed(3).padStart(8)}%    ${movement}`,
    );
  }

  console.log(
    `  ${"TOTAL".padEnd(20)} ${units(held).padStart(11)}  ${money(held * price).padStart(11)}  ${((held / supply) * 100).toFixed(3).padStart(8)}%`,
  );

  // --------------------------------------------------------------- combustível
  const gas = await gasOf(token.chain, addresses);

  // O sinal só vale para carteira comum. Um contrato não paga o próprio gás:
  // quem o chama é que paga, então saldo zero de BNB num contrato não trava
  // nada e listá-lo aqui daria uma falsa sensação de segurança.
  const starving = token.wallets.filter((w) => {
    const bnb = Number(gas.get(w.address.toLowerCase()) ?? BigInt(0)) / 1e18;
    return bnb < 0.001 && (current[w.address.toLowerCase()] ?? 0) > 0;
  });

  const kinds = await Promise.all(starving.map((w) => isContract(token.chain, w.address)));
  const stuck = starving.filter((_, i) => !kinds[i]);

  if (stuck.length > 0) {
    console.log(`\n  TRAVADAS POR FALTA DE GÁS`);
    for (const wallet of stuck) {
      const amount = current[wallet.address.toLowerCase()] ?? 0;
      console.log(
        `    ${wallet.label.padEnd(20)} ${units(amount).padStart(11)} (${money(amount * price)}) · 0 BNB — não consegue mover`,
      );
    }
    console.log(
      `\n    Vigie a chegada de BNB nestes endereços: é o passo obrigatório antes\n    de qualquer venda, e acontece minutos antes dela.`,
    );
  }

  // ------------------------------------------------------ estrutura do supply
  //
  // O market cap divulgado supõe que o supply circulante é vendável. Somando
  // por papel dá para checar essa suposição em vez de aceitá-la: o que está
  // travado em contrato e o que está parado sem gás não são oferta.
  const byRole = new Map<string, number>();
  for (const wallet of token.wallets) {
    const amount = current[wallet.address.toLowerCase()] ?? 0;
    byRole.set(wallet.role, (byRole.get(wallet.role) ?? 0) + amount);
  }

  const locked = byRole.get("lock") ?? 0;
  const dormant = byRole.get("dormant") ?? 0;
  const mapped = held;
  const unmapped = supply - mapped;

  console.log(`\n  ESTRUTURA DO SUPPLY`);
  const line = (name: string, amount: number, note: string) =>
    console.log(
      `    ${name.padEnd(24)} ${units(amount).padStart(10)}  ${((amount / supply) * 100).toFixed(2).padStart(6)}%  ${money(amount * price).padStart(9)}   ${note}`,
    );

  line("travado em contrato", locked, "só sai se o administrador mandar");
  line("parado sem gás", dormant, "não consegue mover");
  line("em corretora", byRole.get("exchange") ?? 0, "custódia / oferta pronta");
  line("distribuidora", byRole.get("treasury") ?? 0, "de onde saem os repasses");
  line("operacional", byRole.get("operational") ?? 0, "ativa, com gás");
  line("não mapeado", unmapped, "todo o resto do mercado");

  // A oferta que pode virar venda hoje é o que sobra depois de tirar trava e
  // paralisia. É esse número, e não o supply, que o preço tem de absorver.
  const sellable = (byRole.get("exchange") ?? 0) + (byRole.get("treasury") ?? 0)
    + (byRole.get("operational") ?? 0) + unmapped;

  console.log(
    `\n    oferta destravada        ${units(sellable).padStart(10)}  ${((sellable / supply) * 100).toFixed(2).padStart(6)}%  ${money(sellable * price).padStart(9)}`,
  );

  // ------------------------------------------------------------- o veredito
  if (depth && depth.liquidityUsd > 0) {
    const value = held * price;
    const ratio = value / depth.liquidityUsd;

    console.log(`\n  CONCENTRAÇÃO vs LIQUIDEZ`);
    console.log(`    nas carteiras vigiadas : ${money(value)}`);
    console.log(`    oferta destravada      : ${money(sellable * price)}`);
    console.log(`    liquidez à vista total : ${money(depth.liquidityUsd)}`);
    console.log(`    razão (destravado/liq) : ${(sellable * price / depth.liquidityUsd).toFixed(0)}x`);

    if (ratio > 50) {
      console.log(`
    A oferta que pode virar venda vale ${money(sellable * price)} e a pool inteira
    aguenta ${money(depth.liquidityUsd)} — ${((sellable * price) / depth.liquidityUsd).toFixed(0)} vezes menos. O preço de tela não é um preço
    em que esse volume possa ser vendido; é o preço do último punhado de dólares
    que passou por uma pool rasa. É por isso que o mercado real da moeda é o
    perpétuo, e não o mercado à vista.`);
    }
  }

  // -------------------------------------------------- movimentação recente
  const config = CHAINS[token.chain];
  const from = Math.max(head - config.prunedDepth + 500, 0);
  const hours = ((head - from) * config.secondsPerBlock) / 3600;

  console.log(`\n  TRANSFERÊNCIAS GRANDES (últimos ${hours.toFixed(1)}h, bloco ${from}–${head})`);

  let transfers: Awaited<ReturnType<typeof transfersBetween>> = [];
  try {
    transfers = await transfersBetween(token.chain, token.contract, from, head);
  } catch (error) {
    console.log(`    não foi possível ler os eventos: ${(error as Error).message}`);
  }

  // Só transferências que valem mais do que a pool inteira aguentaria sem
  // derreter. Abaixo disso é fluxo de varejo e enche a tela de ruído.
  const floor = depth ? Math.max(depth.liquidityUsd * 0.05, 5000) : 25_000;
  const big = transfers
    .filter((t) => toUnits(t.value, info.decimals) * price >= floor)
    .sort((a, b) => Number(b.value - a.value))
    .slice(0, 12);

  if (big.length === 0) {
    console.log(`    nenhuma acima de ${money(floor)} · ${transfers.length} transferências no período`);
  } else {
    console.log(`    ${transfers.length} transferências no período, ${big.length} acima de ${money(floor)}\n`);
    for (const t of big) {
      const amount = toUnits(t.value, info.decimals);
      console.log(
        `    ${units(amount).padStart(10)} ${money(amount * price).padStart(9)}  ${labelOf(token, t.from).padEnd(18)} → ${labelOf(token, t.to)}`,
      );
    }
  }

  // ------------------------------------------------------------------ grava
  const snapshot: Snapshot = {
    time: Math.floor(Date.now() / 1000),
    block: head,
    priceUsd: price,
    balances: current,
  };

  const updated = [...history, snapshot];
  state[token.symbol] = updated.slice(-500);

  if (previous) {
    const elapsed = (snapshot.time - previous.time) / 3600;
    const change = previous.priceUsd > 0 ? price / previous.priceUsd - 1 : NaN;
    console.log(
      `\n  leitura anterior há ${elapsed.toFixed(1)}h · preço ${Number.isFinite(change) ? signed(change) : "—"} · ${updated.length} retratos guardados`,
    );
  } else {
    console.log(`\n  primeiro retrato guardado — as variações aparecem a partir da próxima rodada.`);
  }
}

// --------------------------------------------------------------------- main

const wanted = process.argv.slice(2).map((s) => s.toUpperCase());
const tokens = wanted.length
  ? WATCHLIST.filter((t) => wanted.includes(t.symbol))
  : WATCHLIST;

if (tokens.length === 0) {
  console.error(`nenhuma moeda conhecida em: ${wanted.join(", ")}`);
  console.error(`disponíveis: ${WATCHLIST.map((t) => t.symbol).join(", ")}`);
  process.exit(1);
}

const state = await loadState();

for (const token of tokens) {
  await report(token, state);
}

// Um endereço com código é contrato, e isso muda quem se supõe estar por trás
// dele. A checagem fica no fim para não atrasar o que interessa.
const unverified = tokens.flatMap((t) =>
  t.wallets.filter((w) => !w.verified).map((w) => ({ token: t, wallet: w })),
);

if (unverified.length > 0) {
  console.log(`\n${"─".repeat(92)}`);
  console.log("NATUREZA DOS ENDEREÇOS");
  console.log("─".repeat(92));
  console.log(
    `\n  Os rótulos abaixo vieram de fora e não foram confirmados. Contrato e\n  carteira comum contam histórias diferentes sobre o mesmo saldo.\n`,
  );
  for (const { token: owner, wallet } of unverified) {
    const code = await isContract(owner.chain, wallet.address);
    console.log(
      `  ${wallet.label.padEnd(20)} ${wallet.address}  ${code ? "CONTRATO" : "carteira comum"}`,
    );
  }
}

await mkdir(".cache", { recursive: true });
await writeFile(STATE, JSON.stringify(state, null, 2));
console.log(`\nRetratos gravados em ${STATE}\n`);
