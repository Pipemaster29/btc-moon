/**
 * AS CARTEIRAS DE CORRETORA COM ETIQUETA PÚBLICA, para a leitura dos criadores e
 * VCs (`lib/insiders.ts`) reconhecer um depósito: lê o conjunto aberto
 * `dawsbot/eth-labels` (as etiquetas públicas do Etherscan, do Basescan e do
 * BscScan, raspadas do "label cloud") e grava `data/corretoras-rotuladas.json`.
 *
 * `CARTEIRAS_CEX` (`lib/lifecycle.ts`) tem 17 endereços, achados um a um pelo
 * saldo nas moedas da lista — serve para "quanto do supply está em corretora",
 * e não para "este depósito foi numa corretora?": ninguém deposita na carteira
 * fria. O depósito cai num endereço POR CLIENTE, que a corretora varre depois, e
 * o conjunto traz ~5 mil desses da Binance e ~19 mil da Bitget, além das
 * carteiras quentes e frias de ~50 corretoras.
 *
 * SÓ ENTRA O QUE É CUSTÓDIA. A etiqueta do Etherscan cobre tudo que a corretora
 * tem na rede — contrato de token, implantador, caridade, operador de AVS,
 * carteira de taxa, o produto de carteira web3 da Bitget, o endereço de quem
 * atacou a Bybit. O filtro é pelo FIM do nome ("Binance 14", "Kraken: Hot
 * Wallet", "Bitget Dep: 0x…", "Coinbase Cold 3"), e o que não casa fica fora:
 * conferidos os 301 formatos distintos em 09/11, os de fora são os que não
 * guardam moeda de cliente. "Deposit Funder" também fica fora — é a carteira que
 * manda gás para os endereços de depósito, não recebe o depósito.
 *
 * A ETIQUETA DE QUALQUER REDE VALE NAS TRÊS. A "Binance 14" — a carteira quente
 * mais ativa da Binance — não está etiquetada na Ethereum neste conjunto; está
 * na World Chain e na Avalanche. Mas o endereço é o mesmo em toda rede EVM, e
 * quem o controla numa controla em todas: carteira comum é uma chave, e contrato
 * só nasce no mesmo endereço pelas mãos de quem o implantou. Então o arquivo é
 * um conjunto só, sem rede — o mesmo raciocínio de `lib/marketmakers.ts`.
 *
 * É RÓTULO DE TERCEIRO, como todo o resto que vem do Etherscan. O que ele dá é
 * cobertura, não certeza; `lib/insiders.ts` também reconhece o endereço de
 * depósito pelo comportamento (repassa tudo a uma corretora).
 *
 * Rode com: npx tsx scripts/corretoras-rotuladas.mts /caminho/para/eth-labels/data/csv/accounts.csv [commit]
 */

import { readFile, writeFile } from "node:fs/promises";

const NOMES =
  /^(Binance|Coinbase Prime|Coinbase|Kraken|OKX|OKEx|Bybit|KuCoin|Gate\.io|Gate|Huobi|HTX|Bitfinex|Crypto\.com|MEXC|Bitget|Upbit|Bithumb|Gemini|Bitstamp|Poloniex|Bittrex|BitMart|LBank|Deribit|BitMEX|Coinone|Korbit|bitFlyer|BingX|WhiteBIT|AscendEX|Hotbit|CoinEx|Bitrue|Phemex|Backpack|Robinhood|Bitvavo|Indodax|BtcTurk|Paribu|Coincheck|Bitso|Luno|Bitpanda|FTX|Bitkub|Coinhako|Tokocrypto|ProBit|DigiFinex|XT\.com|Toobit|HashKey|Bullish)(?![\w.])/i;

/** O fim do nome que diz "isto guarda moeda de cliente". */
const CUSTODIA = [
  /^\s*\d*$/, // "Binance 14", "bitFlyer"
  /^ (Dep|Deposit)\b/i, // "Binance Dep: 0x…", "Coinbase Deposit 2"
  /^ (Cold|Hot)( \d+)?$/i, // "Coinbase Cold 14"
  /^\s?: ?(Hot|Cold|Warm|Old Warm)( Wallet| Storage| Migration)?( \d+)?$/i,
  /^\s?: ?[A-Z]{2,6} Hot( \d+)?$/, // "Coinbase: LINK Hot 12"
  /^\s?: ?(Deposit|Batch Deposit|Old Address|Wallet|MultiSig|Multisig)( \d+)?$/i,
  /^ Multisig$/i,
];

/** Uma linha do CSV: os quatro campos entre aspas, sem vírgula dentro do endereço nem da rede. */
function campos(linha: string): [string, string, string, string] | null {
  const m = /^"?(0x[0-9a-fA-F]{40})"?,(\d+),"((?:[^"]|"")*)","((?:[^"]|"")*)"$/.exec(linha);
  return m ? [m[1].toLowerCase(), m[2], m[3], m[4].replace(/""/g, '"')] : null;
}

const [arquivo, commit = "desconhecido"] = process.argv.slice(2);
if (!arquivo) {
  console.error("uso: npx tsx scripts/corretoras-rotuladas.mts <accounts.csv> [commit]");
  process.exit(1);
}
const linhas = (await readFile(arquivo, "utf8")).split("\n");
const corretoras: Record<string, string[]> = {};
let ilegiveis = 0;
let fora = 0;
const vistos = new Set<string>();
for (const linha of linhas.slice(1)) {
  if (!linha.trim()) continue;
  const c = campos(linha.trim());
  if (!c) {
    ilegiveis++;
    continue;
  }
  const [endereco, , etiqueta, nome] = c;
  const m = NOMES.exec(nome);
  if (!m) continue;
  // A etiqueta de ataque ou de bloqueio vence o nome: "Bybit Exploiter 33" não é a Bybit.
  if (/exploit|blocked|heist|phish|hack/i.test(etiqueta) || !CUSTODIA.some((r) => r.test(nome.slice(m[0].length)))) {
    fora++;
    continue;
  }
  if (vistos.has(endereco)) continue;
  vistos.add(endereco);
  // Um nome só por corretora: "OKEx" é a OKX, "Gate" é a Gate.io, e a custódia da Prime é da Coinbase.
  const corretora = m[1].replace(/^OKEx$/i, "OKX").replace(/^Gate$/i, "Gate.io").replace(/^Coinbase Prime$/i, "Coinbase").replace(/^Huobi$/i, "HTX").replace(/^kucoin$/i, "KuCoin");
  (corretoras[corretora] ??= []).push(endereco);
}
for (const xs of Object.values(corretoras)) xs.sort();
await writeFile(
  "data/corretoras-rotuladas.json",
  `${JSON.stringify({ fonte: `dawsbot/eth-labels@${commit} — as etiquetas públicas do Etherscan e dos exploradores irmãos, de todas as redes`, geradoEm: Date.now(), corretoras })}\n`,
);
console.log(
  `data/corretoras-rotuladas.json: ${vistos.size} endereços de ${Object.keys(corretoras).length} corretoras — ${fora} com nome de corretora e fora (não são custódia), ${ilegiveis} linhas com o endereço truncado na fonte`,
);
console.log(`  ${Object.entries(corretoras).sort((x, y) => y[1].length - x[1].length).slice(0, 20).map(([n, xs]) => `${n} ${xs.length}`).join(", ")}`);
