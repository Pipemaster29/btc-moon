/**
 * Um ciclo de vigilância: lê a cadeia, compara com a rodada anterior, alerta.
 *
 * Feito para ser chamado por um agendador, não para ficar rodando em laço. Cada
 * execução é independente e a memória vive em disco, então reiniciar não perde
 * estado e não existe processo para cair de madrugada.
 *
 * A cadência tem um limite duro: os nós públicos só servem log da última hora.
 * Rodar mais espaçado que isso deixa buracos em que uma transferência passa sem
 * ser vista, então 15 minutos é o alvo e 30 o teto.
 *
 * Rode com: npm run monitor
 *           npm run monitor -- --dry     (não envia, só mostra)
 *           npm run monitor -- --test    (manda uma mensagem de teste)
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import {
  balancesOf,
  blockNumber,
  gasOf,
  toUnits,
  tokenInfo,
  transfersBetween,
  CHAINS,
} from "../lib/onchain";
import { depthOn, pairsOfToken } from "../lib/dexscreener";
import { currentMove } from "../lib/positioning";
import { WATCHLIST, labelOf, type WatchedToken } from "../lib/watchlist";
import {
  detect,
  QUIET_MINUTES,
  type Severity,
  type Alert,
  type ExchangePoint,
  type Observation,
  type TransferSeen,
  type WalletMemory,
} from "../lib/alerts";
import {
  escapeMarkdown,
  markdownCode,
  markdownLink,
  sendTelegram,
  telegramFromEnv,
} from "../lib/telegram";
import { isFreshAddress } from "../lib/onchain";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
const testOnly = args.includes("--test");

const STATE = ".cache/monitor.json";
/** Silêncio máximo, usado só para limpar o arquivo de identidades vencidas. */
const QUIET_MAX_MINUTES = 360;

interface State {
  wallets: Record<string, Record<string, WalletMemory>>;
  /**
   * Saldo somado das corretoras, por moeda, ao longo do tempo.
   *
   * Diferente do resto do estado, esta série precisa de memória LONGA: o sinal
   * de topo compara o saldo de hoje com o fundo das últimas semanas, e uma
   * janela curta não enxergaria o aperto que o precede.
   */
  exchange?: Record<string, ExchangePoint[]>;
  /** fingerprint → quando foi enviado, em segundos. */
  fired: Record<string, number>;
  lastBlock: number;
}

async function loadState(): Promise<State> {
  try {
    return JSON.parse(await readFile(STATE, "utf8")) as State;
  } catch {
    return { wallets: {}, fired: {}, exchange: {}, lastBlock: 0 };
  }
}

const telegram = telegramFromEnv();

if (testOnly) {
  if (!telegram) {
    console.error("TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID não estão definidos.");
    process.exit(1);
  }
  const ok = await sendTelegram(
    telegram,
    escapeMarkdown("✅ Radar BTW conectado. Os alertas chegam por aqui."),
  );
  console.log(ok ? "Mensagem de teste enviada." : "Falhou — confira token e chat_id.");
  process.exit(ok ? 0 : 1);
}

if (!telegram && !dryRun) {
  console.error(
    "Telegram não configurado. Defina TELEGRAM_BOT_TOKEN e TELEGRAM_CHAT_ID,\n" +
      "ou rode com --dry para só ver os alertas no terminal.",
  );
  process.exit(1);
}

const state = await loadState();
const now = Math.floor(Date.now() / 1000);

/** O alerta viaja junto com a rede de origem, que decide o explorador do link. */
interface Pending {
  alert: Alert;
  explorer: string;
}

const pending: Pending[] = [];

// ------------------------------------------------------------------ a passada
//
// A lista tem quarenta e duas moedas, e as duas metades do trabalho custam
// coisas muito diferentes.
//
// O PERPÉTUO custa uma requisição por moeda e não toca em nó nenhum: squeeze,
// desalavancagem e saída de baleia saem daí. Roda para todas, inclusive as que
// não têm contrato conferido — o posicionamento não depende de blockchain.
//
// A REDE custa dezenas de chamadas por moeda: saldo de cada carteira, gás de
// cada carteira, varredura de log de três horas. Roda só para as moedas com
// carteira mapeada, porque é a única situação em que ela responde mais do que
// "houve transferências". Numa moeda sem carteira nomeada o mesmo custo
// devolveria um punhado de endereços anônimos.
//
// Quando as carteiras de uma moeda forem mapeadas, ela migra de metade sozinha.
const comCarteiras = WATCHLIST.filter((t) => t.contract && t.wallets.length > 0);
const soPerpetuo = WATCHLIST.filter((t) => !comCarteiras.includes(t));

for (const token of comCarteiras) {
  try {
    const found = await inspect(token, state, now);
    const explorer = CHAINS[token.chain].explorer;
    pending.push(...found.map((alert) => ({ alert, explorer })));
  } catch (error) {
    console.error(`${token.symbol}: ${(error as Error).message}`);
  }
}

// As demais entram só pelo perpétuo, em paralelo — são requisições HTTP a uma
// API pública, não a um nó com limite de concorrência.
const perpAlerts = await Promise.all(
  soPerpetuo.map(async (token) => {
    try {
      const perp = await currentMove(token.symbol);
      if (!perp.move && !perp.whaleExit) return [];

      // O preço precisa ser real: `valueUsd` é o critério de desempate na hora
      // de escolher quais alertas cabem no teto da rodada, e passar zero fazia
      // todo alerta só-perpétuo ir para o fim da fila — perdendo justamente a
      // disputa que o teto existe para arbitrar.
      const preco = perp.move?.priceTo ?? 0;

      const ticker = token.symbol.replace(/USDT$/, "");
      return detect({
        symbol: ticker,
        gasSymbol: CHAINS[token.chain].gasSymbol,
        previous: {},
        current: [],
        transfers: [],
        priceUsd: preco,
        liquidityUsd: 0,
        perp: perp.move,
        whaleExit: perp.whaleExit,
      }).filter((alert) => {
        const last = state.fired[alert.fingerprint];
        return !last || now - last > QUIET_MINUTES[alert.kind] * 60;
      });
    } catch {
      return [];
    }
  }),
);

for (const [i, alerts] of perpAlerts.entries()) {
  const explorer = CHAINS[soPerpetuo[i].chain].explorer;
  pending.push(...alerts.map((alert) => ({ alert, explorer })));
}

console.log(
  `${comCarteiras.length} moedas com leitura on-chain · ${soPerpetuo.length} só pelo perpétuo · ` +
    `${pending.length} alertas no total`,
);

// ------------------------------------------------------------------ envio
//
// Teto por rodada. Se algo disparar dezenas de alertas de uma vez, mandar todos
// é o mesmo que não mandar nenhum: o celular vira uma parede de notificação e o
// mais grave se perde no meio. Os mais graves passam, o resto vira uma linha.
const MAX_PER_CYCLE = 6;

// O corte precisa vir DEPOIS de ordenar, e não vinha.
//
// `detect` ordena por gravidade dentro de uma moeda, mas `pending` junta o
// resultado de quarenta e duas delas na ordem em que foram lidas. Cortar os
// seis primeiros dessa pilha entregava os seis primeiros POR MOEDA — e como a
// passada on-chain roda antes, qualquer alerta das outras quarenta era
// descartado em silêncio sempre que BTW e AKE somassem seis. A mensagem ainda
// dizia "os mais graves", o que tornava o defeito invisível.
const RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2 };
pending.sort(
  (a, b) =>
    RANK[a.alert.severity] - RANK[b.alert.severity] ||
    b.alert.valueUsd - a.alert.valueUsd,
);

const overflow = pending.length - MAX_PER_CYCLE;
const sending = pending.slice(0, MAX_PER_CYCLE);

if (pending.length === 0) {
  console.log("Nada digno de alerta neste ciclo.");
} else {
  console.log(`${pending.length} alertas:\n`);
  for (const { alert, explorer } of pending) {
    console.log(`  [${alert.severity}] ${alert.title}`);
    console.log(`      ${alert.detail}`);
    for (const address of alert.addresses) {
      console.log(`      ${explorer}/address/${address}`);
    }
    console.log("");
  }

  let delivered = 0;

  if (telegram && !dryRun) {
    if (overflow > 0) {
      await sendTelegram(
        telegram,
        escapeMarkdown(
          `⚠️ ${pending.length} alertas nesta rodada — mostrando os ${MAX_PER_CYCLE} mais graves. ` +
            `Volume assim costuma ser distribuição em andamento, não ruído.`,
        ),
      );
    }
    // Uma mensagem por alerta em vez de um bloco só: no celular a notificação
    // mostra as primeiras linhas, e um alerta crítico enterrado no meio de um
    // texto longo perde justamente a urgência que o torna útil.
    for (const { alert, explorer } of sending) {
      // O endereço vai em bloco de código, que o Telegram copia com um toque,
      // seguido do link para o explorador — conferir na fonte é o primeiro
      // passo depois de receber um aviso destes.
      const links = alert.addresses.map(
        (address) =>
          `${markdownCode(address)}\n${markdownLink("ver no explorador", `${explorer}/address/${address}`)}`,
      );

      const text = [
        `*${escapeMarkdown(alert.title)}*`,
        "",
        escapeMarkdown(alert.detail),
        ...(links.length ? ["", ...links] : []),
      ].join("\n");

      if (await sendTelegram(telegram, text)) {
        state.fired[alert.fingerprint] = now;
        delivered++;
      }
    }

    // Contagem real, não uma frase otimista: dizer "enviados" sem conferir
    // esconderia exatamente o caso em que o Telegram recusou a mensagem e o
    // alerta se perdeu em silêncio.
    console.log(
      delivered === sending.length
        ? `${delivered} enviados ao Telegram.`
        : `⚠ ${delivered} de ${sending.length} enviados — ${sending.length - delivered} FALHARAM.`,
    );
  }
}

// Esquece os silêncios vencidos, para o arquivo não crescer sem fim.
for (const [key, when] of Object.entries(state.fired)) {
  if (now - when > QUIET_MAX_MINUTES * 60 * 4) delete state.fired[key];
}

await mkdir(".cache", { recursive: true });
await writeFile(STATE, JSON.stringify(state, null, 2));

// --------------------------------------------------------------------- token

async function inspect(
  token: WatchedToken,
  state: State,
  now: number,
): Promise<Alert[]> {
  const addresses = token.wallets.map((w) => w.address);

  const [info, head, pairs, balances, gas] = await Promise.all([
    tokenInfo(token.chain, token.contract),
    blockNumber(token.chain),
    pairsOfToken(token.contract),
    balancesOf(token.chain, token.contract, addresses),
    gasOf(token.chain, addresses),
  ]);

  const depth = depthOn(pairs, token.chain);
  const price = depth?.priceUsd ?? 0;

  const current: Observation[] = token.wallets.map((wallet) => {
    const key = wallet.address.toLowerCase();
    return {
      address: wallet.address,
      label: wallet.label,
      role: wallet.role,
      balance: toUnits(balances.get(key) ?? BigInt(0), info.decimals),
      bnb: Number(gas.get(key) ?? BigInt(0)) / 1e18,
    };
  });

  // ---------------------------------------------------------- transferências
  //
  // A janela é definida em TEMPO, não em blocos, porque as redes têm ritmos
  // diferentes: 5 mil blocos são 37 minutos na BNB Chain e 167 na Base.
  //
  // Três horas cobrem com folga o pior atraso observado do agendamento do
  // GitHub — que pede 10 minutos e entrega 31 em média, chegando a 42. Menos do
  // que isso deixaria uma transferência escapar entre dois ciclos atrasados;
  // muito mais só traria evento velho e mais dados para trafegar.
  const config = CHAINS[token.chain];
  const WINDOW_HOURS = 3;
  const span = Math.min(
    Math.round((WINDOW_HOURS * 3600) / config.secondsPerBlock),
    config.prunedDepth,
  );
  const from = Math.max(head - span, 0);
  const transfers: TransferSeen[] = [];

  try {
    const raw = await transfersBetween(token.chain, token.contract, from, head);
    const bigEnough = raw.filter(
      (t) => toUnits(t.value, info.decimals) * price >= 100,
    );

    // Só os destinos que importam vão para a checagem de carteira nova: são
    // chamadas RPC extras e não vale gastá-las com poeira.
    const relevant = bigEnough.filter((t) =>
      token.wallets.some((w) => w.address.toLowerCase() === t.from.toLowerCase()),
    );

    const freshness = new Map<string, boolean>();
    await Promise.all(
      [...new Set(relevant.map((t) => t.to.toLowerCase()))].map(async (to) => {
        freshness.set(to, await isFreshAddress(token.chain, to));
      }),
    );

    for (const t of bigEnough) {
      transfers.push({
        from: t.from,
        to: t.to,
        amount: toUnits(t.value, info.decimals),
        block: t.block,
        fromLabel: labelOf(token, t.from),
        toLabel: labelOf(token, t.to),
        toIsFresh: freshness.get(t.to.toLowerCase()) ?? false,
      });
    }
  } catch (error) {
    console.error(`Logs indisponíveis para ${token.symbol}: ${(error as Error).message}`);
  }

  const previous = state.wallets[token.symbol] ?? {};

  // Uma leitura por hora basta para a série: o sinal é de dias, e guardar um
  // ponto a cada ciclo de 5 minutos encheria o arquivo sem afinar nada.
  const exchangeTotal = current
    .filter((w) => w.role === "exchange")
    .reduce((sum, w) => sum + w.balance, 0);

  const historico = state.exchange?.[token.symbol] ?? [];
  const ultimo = historico[historico.length - 1];
  if (!ultimo || now - ultimo.time >= 3600) {
    historico.push({ time: now, total: exchangeTotal });
  } else {
    ultimo.total = exchangeTotal;
  }
  state.exchange = { ...state.exchange, [token.symbol]: historico.slice(-400) };

  // O perpétuo é onde o preço destas moedas realmente se forma: no dia 19/08 a
  // BTW fez +60% e −50% com o saldo das corretoras variando meio por cento.
  // Sem esta leitura o monitor fica mudo justamente nos dias que importam.
  const perp = await currentMove(token.symbol).catch(() => ({
    move: null,
    whaleExit: null,
  }));

  const alerts = detect({
    symbol: info.symbol,
    exchangeHistory: historico,
    gasSymbol: CHAINS[token.chain].gasSymbol,
    previous,
    current,
    transfers,
    priceUsd: price,
    liquidityUsd: depth?.liquidityUsd ?? 0,
    perp: perp.move,
    whaleExit: perp.whaleExit,
  }).filter((alert) => {
    const last = state.fired[alert.fingerprint];
    return !last || now - last > QUIET_MINUTES[alert.kind] * 60;
  });

  // A memória é gravada mesmo quando nada dispara: é ela que transforma o
  // próximo ciclo numa comparação em vez de um retrato solto.
  state.wallets[token.symbol] = Object.fromEntries(
    current.map((w) => [w.address.toLowerCase(), { balance: w.balance, bnb: w.bnb }]),
  );
  state.lastBlock = head;

  const known = Object.keys(previous).length;
  console.log(
    `${token.symbol}: ${current.length} carteiras · ${transfers.length} transferências · ` +
      (known ? `${alerts.length} alertas` : "primeira leitura, sem comparação"),
  );

  return known ? alerts : [];
}
