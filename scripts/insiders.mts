/**
 * OS CRIADORES E OS VCs: lê para onde foi o supply que nasceu nas mãos deles
 * (`lib/insiders.ts`) e grava `data/insiders.json`.
 *
 * PELOS NÓS PÚBLICOS, E NÃO PELO EXPLORADOR. O Blockscout entrega as
 * transferências de uma carteira numa requisição, mas a cota dele é de dez
 * requisições por janela de ~40 minutos por IP (`lib/explorador.ts`): seguir os
 * donos, os que receberam deles e os destinos de cada um são centenas. Os nós
 * de arquivo da Ethereum respondem `eth_getLogs` filtrado pelo REMETENTE em
 * faixas de 10 mil blocos — medido em 09/11 na JCT: a vida inteira (2,7 milhões
 * de blocos, 272 faixas) em 65 segundos. A lista de remetentes vai inteira num
 * tópico só, então o custo não cresce com o número de carteiras.
 *
 * "NÃO CONSEGUI" NÃO VIRA "NÃO ACHEI". Na mesma medição, 21 das 272 faixas
 * falharam na primeira tentativa. Aqui cada faixa é tentada de novo, trocando de
 * nó, e partida ao meio quando a resposta é grande demais; a que mesmo assim
 * não vier é contada (`faixasPerdidas`), e a moeda com faixa perdida fica fora
 * da medição — transferência que não foi lida é depósito que não foi visto.
 *
 * TRÊS PASSADAS por moeda: as saídas do nível 0 (os donos da gênese); as saídas
 * de quem recebeu deles, para separar endereço de depósito, infraestrutura e
 * nível 1; e as saídas dos destinos do nível 1, pelo mesmo motivo.
 *
 * SÓ A ETHEREUM: a BNB Chain não tem fonte gratuita de log antigo (o nó guarda
 * ~100 h) e a gênese da Base está medida em duas moedas só. As que ficam fora
 * vão escritas no arquivo, com o porquê.
 *
 * DOIS RITMOS. A leitura da VIDA INTEIRA custa de 2 a 8 minutos por moeda
 * (medido em 09/11: JCT 156 s, CAP 149 s, HEMI 339 s) — é a que acha os
 * insiders e classifica os destinos, e roda à mão ou uma moeda por rodada, a
 * mais velha, quando passa de 7 dias. A RODADA (`--rodada`, no workflow, de 4
 * em 4 horas) só anda para frente: as saídas dos insiders já conhecidos desde o
 * último bloco lido — uma faixa por moeda — e, de novo, os destinos que ainda
 * não tinham mandado nada adiante (`pendentes`), porque o depósito só é
 * reconhecido quando a corretora varre o endereço. Faixa perdida na rodada e a
 * moeda NÃO avança: tenta de novo na próxima, do mesmo bloco.
 *
 * Rode com: npx tsx scripts/insiders.mts            (a vida inteira de todas)
 *           npx tsx scripts/insiders.mts JCTUSDT    (a vida inteira de uma)
 *           npx tsx scripts/insiders.mts --rodada   (só para frente; `--agora` ignora as 4 horas)
 *           npx tsx scripts/insiders.mts --semente  (copia a leitura para data/insiders-semente.json, no `main`)
 */

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { CHAINS, padAddress, tokenInfo, unpadAddress, TRANSFER_TOPIC, type Chain } from "../lib/onchain";
import { pairsOfToken } from "../lib/dexscreener";
import { CARTEIRAS_CEX } from "../lib/lifecycle";
import { firmaDe } from "../lib/marketmakers";
import { WATCHLIST } from "../lib/watchlist";
import { escapeMarkdown, sendTelegram, telegramFromEnv } from "../lib/telegram";
import {
  aInvestigar,
  avisosDe,
  classePelaEtiqueta,
  classePeloComportamento,
  eventosDe,
  nivel1De,
  PISOS,
  resumir,
  type ArquivoInsiders,
  type ClasseDoDestino,
  type Fluxo,
  type LeituraDeInsiders,
  type Rotulos,
  type Transferencia,
} from "../lib/insiders";

const ARQUIVO = "data/insiders.json";
const SEMENTE = "data/insiders-semente.json";
const INTERVALO = 4 * 3_600_000;
/** A vida inteira de uma moeda é relida quando a última passa disto. */
const VALIDADE_DA_COMPLETA = 7 * 86_400_000;
/** Por quantos blocos um destino que ainda não mandou nada adiante é olhado de novo: 7 dias de Ethereum (12 s por bloco). */
const JANELA_PENDENTE = 50_400;
const FAIXA = 10_000;
const PARALELO = 8;
const TENTATIVAS = 5;
/** Abaixo disto a faixa não é mais partida: se nem 500 blocos vêm, o nó não entrega. */
const FAIXA_MINIMA = 500;

// ------------------------------------------------------------------ os rótulos

const rotuladas = JSON.parse(await readFile("data/corretoras-rotuladas.json", "utf8")) as { corretoras: Record<string, string[]> };
const corretoraDe = new Map<string, string>();
for (const [nome, xs] of Object.entries(rotuladas.corretoras)) for (const e of xs) corretoraDe.set(e, nome);
// As 17 que o projeto achou uma a uma pelo saldo: 14 já têm etiqueta; as outras 3 entram sem nome de corretora.
for (const e of CARTEIRAS_CEX) if (!corretoraDe.has(e.toLowerCase())) corretoraDe.set(e.toLowerCase(), "corretora (lista do projeto)");

// ------------------------------------------------------------------ os nós

let pedidos = 0;
async function rpc<T>(chain: Chain, method: string, params: unknown[], tentativa: number, limiteMs = 25_000): Promise<T> {
  const nos = CHAINS[chain].archiveLog.length > 0 ? CHAINS[chain].archiveLog : CHAINS[chain].endpoints;
  const url = nos[(pedidos++ + tentativa) % nos.length];
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(limiteMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = (await res.json()) as { result?: T; error?: { message?: string } };
  if (j.error || j.result === undefined || j.result === null) throw new Error(j.error?.message ?? "sem resultado");
  return j.result;
}

/** Um pedido só, insistindo e trocando de nó: o 429 de um nó público passa em segundos. */
async function rpcInsistente<T>(chain: Chain, method: string, params: unknown[]): Promise<T> {
  let ultimo: unknown;
  for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
    try {
      return await rpc<T>(chain, method, params, tentativa);
    } catch (e) {
      ultimo = e;
      await new Promise((r) => setTimeout(r, 600 * (tentativa + 1)));
    }
  }
  throw ultimo;
}

interface Bruto {
  blockNumber: string;
  transactionHash: string;
  topics: string[];
  data: string;
}

/** As transferências do token enviadas por `remetentes` em [de, ate]. Devolve também quantas faixas nenhum nó entregou. */
async function saidasDe(chain: Chain, token: string, remetentes: readonly string[], de: number, ate: number, supply: bigint): Promise<{ transferencias: Transferencia[]; perdidas: number }> {
  const out: Transferencia[] = [];
  let perdidas = 0;
  if (remetentes.length === 0 || de > ate) return { transferencias: out, perdidas };
  // Um tópico aceita a lista inteira; em grupos de 100 para a requisição não ficar grande demais.
  const grupos: string[][] = [];
  for (let i = 0; i < remetentes.length; i += 100) grupos.push(remetentes.slice(i, i + 100).map(padAddress));
  const fila: [number, number, string[]][] = [];
  for (const g of grupos) for (let a = de; a <= ate; a += FAIXA) fila.push([a, Math.min(a + FAIXA - 1, ate), g]);
  const escala = BigInt(1_000_000_000_000);
  /** As faixas que não vieram nem partidas: ganham uma segunda chance no fim, com calma. */
  const devolvidas: [number, number, string[]][] = [];
  async function umaFaixa(a: number, b: number, g: string[], limiteMs = 25_000, ultima = false): Promise<void> {
    let ultimoErro = "";
    for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
      try {
        const logs = await rpc<Bruto[]>(chain, "eth_getLogs", [{ address: token, topics: [TRANSFER_TOPIC, g], fromBlock: `0x${a.toString(16)}`, toBlock: `0x${b.toString(16)}` }], tentativa, limiteMs);
        if (!Array.isArray(logs)) throw new Error("resposta não é lista");
        for (const l of logs) {
          if (l.topics.length < 3) continue;
          const valor = BigInt(l.data === "0x" ? "0x0" : l.data);
          out.push({ bloco: parseInt(l.blockNumber, 16), tx: l.transactionHash, de: unpadAddress(l.topics[1]), para: unpadAddress(l.topics[2]), fracao: Number((valor * escala) / supply) / 1e12 });
        }
        return;
      } catch (e) {
        ultimoErro = (e as Error).message;
        await new Promise((r) => setTimeout(r, 400 * (tentativa + 1)));
      }
    }
    // Não veio: a resposta pode ser grande demais para o nó. Parte ao meio até o piso.
    // Na segunda chance a faixa é partida até 4 blocos: no dia do lançamento um contrato de
    // distribuição manda mais transferências em 500 blocos do que o nó aceita devolver de uma vez
    // (a HEMI perdeu a mesma faixa em duas leituras seguidas em 10/11).
    if (b - a + 1 > (ultima ? 4 : FAIXA_MINIMA)) {
      const meio = Math.floor((a + b) / 2);
      await umaFaixa(a, meio, g, limiteMs, ultima);
      await umaFaixa(meio + 1, b, g, limiteMs, ultima);
    } else if (ultima) {
      perdidas++;
      // Escrito, e não só contado: sem o porquê não dá para saber se é o nó ou a leitura.
      console.error(`  faixa perdida ${a}–${b} (${b - a + 1} blocos): ${ultimoErro.slice(0, 160)}`);
    } else {
      devolvidas.push([a, b, g]);
    }
  }
  await Promise.all(
    Array.from({ length: PARALELO }, async () => {
      for (;;) {
        const f = fila.shift();
        if (!f) return;
        await umaFaixa(...f);
      }
    }),
  );
  // A segunda chance: uma de cada vez, depois de uma pausa e com o triplo do tempo — o
  // que falhou em rajada costuma vir sozinho. Só o que falhar de novo conta como perdida.
  if (devolvidas.length > 0) {
    await new Promise((r) => setTimeout(r, 5000));
    for (const [a, b, g] of devolvidas.splice(0)) await umaFaixa(a, b, g, 75_000, true);
  }
  // A mesma transferência não entra duas vezes (a faixa partida não repete, mas o nó pode).
  const vistos = new Set<string>();
  const unicas = out.filter((t) => {
    const k = `${t.tx}:${t.de}:${t.para}:${t.fracao}:${t.bloco}`;
    if (vistos.has(k)) return false;
    vistos.add(k);
    return true;
  });
  return { transferencias: unicas.sort((x, y) => x.bloco - y.bloco), perdidas };
}

/** O instante de cada bloco, em segundos; bloco que nenhum nó entregou fica sem entrada. */
async function horasDe(chain: Chain, blocos: readonly number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  const fila = [...new Set(blocos)];
  await Promise.all(
    Array.from({ length: PARALELO }, async () => {
      for (;;) {
        const b = fila.shift();
        if (b === undefined) return;
        for (let tentativa = 0; tentativa < TENTATIVAS; tentativa++) {
          try {
            const bloco = await rpc<{ timestamp: string }>(chain, "eth_getBlockByNumber", [`0x${b.toString(16)}`, false], tentativa);
            out.set(b, parseInt(bloco.timestamp, 16));
            break;
          } catch {
            await new Promise((r) => setTimeout(r, 400 * (tentativa + 1)));
          }
        }
      }
    }),
  );
  return out;
}

// ------------------------------------------------------------------ uma moeda

interface Dono {
  endereco: string;
  recebeu: number;
}

async function lerMoeda(symbol: string, chain: Chain, contrato: string, nascimento: number, donos: Dono[]): Promise<LeituraDeInsiders> {
  const token = contrato.toLowerCase();
  const [info, cabeca, pares] = await Promise.all([tokenInfo(chain, contrato), rpcInsistente<string>(chain, "eth_blockNumber", []), pairsOfToken(contrato).catch(() => [])]);
  const ate = parseInt(cabeca, 16);
  const supply = info.totalSupply;
  const pools = new Set(pares.map((p) => p.address.toLowerCase()));
  const rotulos: Rotulos = { corretora: (e) => corretoraDe.get(e) ?? null, marketMaker: (e) => firmaDe(e), pool: (e) => pools.has(e) };

  // Nível 0: os donos da gênese, sem corretora, market maker, pool nem endereço de queima.
  const nivel0 = donos.map((d) => d.endereco.toLowerCase()).filter((e) => e !== token && !classePelaEtiqueta(e, rotulos));
  const n0 = new Set(nivel0);
  let perdidas = 0;

  // 1ª passada: tudo que o nível 0 enviou.
  const p1 = await saidasDe(chain, token, nivel0, nascimento, ate, supply);
  perdidas += p1.perdidas;

  // 2ª passada: as saídas de quem recebeu, para separar depósito, infraestrutura e nível 1.
  const investigar1 = aInvestigar(p1.transferencias, n0, rotulos);
  const primeiro = (xs: readonly string[], ts: readonly Transferencia[]) => {
    const alvo = new Set(xs);
    return ts.find((t) => alvo.has(t.para))?.bloco ?? ate + 1;
  };
  const p2 = await saidasDe(chain, token, investigar1, primeiro(investigar1, p1.transferencias), ate, supply);
  perdidas += p2.perdidas;
  const saidasPor = new Map<string, Transferencia[]>();
  for (const t of p2.transferencias) {
    const xs = saidasPor.get(t.de);
    if (xs) xs.push(t);
    else saidasPor.set(t.de, [t]);
  }
  const classes = new Map<string, { classe: ClasseDoDestino; nome?: string }>();
  for (const e of investigar1) classes.set(e, classePeloComportamento(saidasPor.get(e) ?? [], rotulos));
  const nivel1 = nivel1De(p1.transferencias, n0, classes, rotulos);
  const n1 = new Set(nivel1);
  const saidasDoNivel1 = p2.transferencias.filter((t) => n1.has(t.de));

  // 3ª passada: os destinos do nível 1 que ainda não foram classificados.
  const conhecidos = new Set([...n0, ...n1, ...investigar1]);
  const investigar2 = aInvestigar(saidasDoNivel1, conhecidos, rotulos);
  const p3 = await saidasDe(chain, token, investigar2, primeiro(investigar2, saidasDoNivel1), ate, supply);
  perdidas += p3.perdidas;
  const saidasPor3 = new Map<string, Transferencia[]>();
  for (const t of p3.transferencias) {
    const xs = saidasPor3.get(t.de);
    if (xs) xs.push(t);
    else saidasPor3.set(t.de, [t]);
  }
  for (const e of investigar2) classes.set(e, classePeloComportamento(saidasPor3.get(e) ?? [], rotulos));

  // Os fluxos dos insiders, classificados.
  const classeDe = (e: string): { classe: ClasseDoDestino; nome?: string; porComportamento?: boolean } => {
    if (n0.has(e) || n1.has(e)) return { classe: "insider" };
    const pelaEtiqueta = classePelaEtiqueta(e, rotulos);
    if (pelaEtiqueta) return pelaEtiqueta;
    const c = classes.get(e);
    return c ? { ...c, ...(c.classe === "corretora" ? { porComportamento: true } : {}) } : { classe: "outro" };
  };
  const dosInsiders = [...p1.transferencias.map((t) => ({ t, nivel: 0 as const })), ...saidasDoNivel1.map((t) => ({ t, nivel: 1 as const }))];
  const grandes = dosInsiders.filter((x) => x.t.fracao >= PISOS.fluxo);
  const horas = await horasDe(chain, grandes.map((x) => x.t.bloco));
  const fluxos: Fluxo[] = [];
  let semHora = 0;
  for (const { t, nivel } of grandes) {
    const hora = horas.get(t.bloco);
    if (hora === undefined) {
      semHora++;
      continue;
    }
    fluxos.push({ t: hora, bloco: t.bloco, tx: t.tx, de: t.de, nivel, para: t.para, ...classeDe(t.para), fracao: t.fracao });
  }
  fluxos.sort((x, y) => x.t - y.t);
  if (semHora > 0) console.error(`  ${semHora} fluxo(s) sem a hora do bloco`);
  const miudos: Partial<Record<ClasseDoDestino, number>> = {};
  for (const { t } of dosInsiders) {
    if (t.fracao >= PISOS.fluxo) continue;
    const c = classeDe(t.para).classe;
    miudos[c] = (miudos[c] ?? 0) + t.fracao;
  }
  const depositos: Record<string, string> = {};
  const infraestrutura: string[] = [];
  for (const [e, c] of classes) {
    if (c.classe === "corretora") depositos[e] = c.nome ?? "corretora";
    else if (c.classe === "infraestrutura") infraestrutura.push(e);
  }
  // Quem recebeu nos últimos 7 dias e ainda não mandou nada adiante: a rodada olha de novo.
  const pendentes: Record<string, number> = {};
  const recebimentos = [...p1.transferencias, ...saidasDoNivel1];
  for (const e of [...investigar1, ...investigar2]) {
    if (classes.get(e)?.classe !== "outro" || (saidasPor.get(e)?.length ?? 0) + (saidasPor3.get(e)?.length ?? 0) > 0) continue;
    const bloco = recebimentos.find((x) => x.para === e)?.bloco;
    if (bloco !== undefined && ate - bloco <= JANELA_PENDENTE) pendentes[e] = bloco;
  }
  return {
    symbol,
    chain,
    contrato: token,
    ate,
    lidaEm: Date.now(),
    completaEm: Date.now(),
    pendentes,
    // Bloco sem hora é fluxo que ficou fora: conta como leitura incompleta, igual à faixa perdida.
    faixasPerdidas: perdidas + semHora,
    nivel0,
    nivel1,
    depositos,
    infraestrutura,
    fluxos,
    miudos,
    eventos: [...eventosDe(fluxos, "corretora"), ...eventosDe(fluxos, "marketmaker")],
    resumo: resumir(fluxos, Math.floor(Date.now() / 1000)),
  };
}

// ------------------------------------------------------------------ a rodada: só para frente

/**
 * Anda a leitura de uma moeda do último bloco lido até agora, sem reler a vida
 * dela. Devolve os fluxos que são NOVIDADE — os novos e os antigos que acabam de
 * ser reconhecidos como depósito, porque a corretora varreu o endereço. Nulo
 * quando alguma faixa ou hora não veio: a moeda não avança, e a próxima rodada
 * tenta do mesmo bloco — avançar com buraco esconderia um depósito para sempre.
 */
async function atualizarMoeda(l: LeituraDeInsiders): Promise<{ l: LeituraDeInsiders; novidades: Fluxo[] } | null> {
  const chain = l.chain as Chain;
  const [info, cabeca, pares] = await Promise.all([tokenInfo(chain, l.contrato), rpcInsistente<string>(chain, "eth_blockNumber", []), pairsOfToken(l.contrato).catch(() => [])]);
  const ate = parseInt(cabeca, 16);
  if (ate <= l.ate) return { l, novidades: [] };
  const supply = info.totalSupply;
  const pools = new Set(pares.map((p) => p.address.toLowerCase()));
  const rotulos: Rotulos = { corretora: (e) => corretoraDe.get(e) ?? null, marketMaker: (e) => firmaDe(e), pool: (e) => pools.has(e) };
  const n0 = new Set(l.nivel0);
  const n1 = new Set(l.nivel1);
  const insiders = [...n0, ...n1];

  const a = await saidasDe(chain, l.contrato, insiders, l.ate + 1, ate, supply);
  if (a.perdidas > 0) return null;
  const classes = new Map<string, { classe: ClasseDoDestino; nome?: string }>();
  for (const [e, nome] of Object.entries(l.depositos)) classes.set(e, { classe: "corretora", nome });
  for (const e of l.infraestrutura) classes.set(e, { classe: "infraestrutura" });

  // Os destinos a olhar: os novos desta rodada e os que ainda não tinham mandado nada adiante.
  const pendentes: Record<string, number> = {};
  for (const [e, b] of Object.entries(l.pendentes ?? {})) if (ate - b <= JANELA_PENDENTE) pendentes[e] = b;
  for (const e of aInvestigar(a.transferencias, new Set([...insiders, ...classes.keys()]), rotulos)) {
    pendentes[e] ??= a.transferencias.find((t) => t.para === e)?.bloco ?? ate;
  }
  const alvos = Object.keys(pendentes);
  const b = await saidasDe(chain, l.contrato, alvos, Math.min(ate, ...Object.values(pendentes)), ate, supply);
  if (b.perdidas > 0) return null;
  const saidasPor = new Map<string, Transferencia[]>();
  for (const t of b.transferencias) {
    const xs = saidasPor.get(t.de);
    if (xs) xs.push(t);
    else saidasPor.set(t.de, [t]);
  }
  const depositos = { ...l.depositos };
  const infraestrutura = [...l.infraestrutura];
  const viraramDeposito = new Map<string, string>();
  for (const e of alvos) {
    const xs = saidasPor.get(e) ?? [];
    // Ainda não mandou nada adiante: continua pendente. "Não mandou" não é "não é depósito".
    if (xs.length === 0) continue;
    const c = classePeloComportamento(xs, rotulos);
    delete pendentes[e];
    if (c.classe === "corretora") {
      depositos[e] = c.nome ?? "corretora";
      classes.set(e, c);
      viraramDeposito.set(e, depositos[e]);
    } else if (c.classe === "infraestrutura") {
      infraestrutura.push(e);
      classes.set(e, c);
    }
  }

  const classeDe = (e: string): { classe: ClasseDoDestino; nome?: string; porComportamento?: boolean } => {
    if (n0.has(e) || n1.has(e)) return { classe: "insider" };
    const pelaEtiqueta = classePelaEtiqueta(e, rotulos);
    if (pelaEtiqueta) return pelaEtiqueta;
    const c = classes.get(e);
    return c ? { ...c, ...(c.classe === "corretora" ? { porComportamento: true } : {}) } : { classe: "outro" };
  };
  const grandes = a.transferencias.filter((t) => t.fracao >= PISOS.fluxo);
  const horas = await horasDe(chain, grandes.map((t) => t.bloco));
  if (grandes.some((t) => !horas.has(t.bloco))) return null;
  const novos: Fluxo[] = grandes.map((t) => ({ t: horas.get(t.bloco) as number, bloco: t.bloco, tx: t.tx, de: t.de, nivel: n0.has(t.de) ? 0 : 1, para: t.para, ...classeDe(t.para), fracao: t.fracao }));
  // Os fluxos antigos para um endereço que só agora se mostrou depósito mudam de classe — e viram novidade.
  const reclassificados: Fluxo[] = [];
  const antigos = l.fluxos.map((f) => {
    const nome = f.classe === "outro" ? viraramDeposito.get(f.para) : undefined;
    if (nome === undefined) return f;
    const g: Fluxo = { ...f, classe: "corretora", nome, porComportamento: true };
    reclassificados.push(g);
    return g;
  });
  const fluxos = [...antigos, ...novos].sort((x, y) => x.t - y.t);
  const miudos = { ...l.miudos };
  for (const t of a.transferencias) {
    if (t.fracao >= PISOS.fluxo) continue;
    const c = classeDe(t.para).classe;
    miudos[c] = (miudos[c] ?? 0) + t.fracao;
  }
  return {
    l: { ...l, ate, lidaEm: Date.now(), depositos, infraestrutura, fluxos, miudos, pendentes, eventos: [...eventosDe(fluxos, "corretora"), ...eventosDe(fluxos, "marketmaker")], resumo: resumir(fluxos, Math.floor(Date.now() / 1000)) },
    novidades: [...novos, ...reclassificados],
  };
}

// ------------------------------------------------------------------ todas

const detentores = (JSON.parse(await readFile("data/detentores.json", "utf8")) as { moedas: Record<string, { chain: string; nascimento: number; donos: Dono[] }> }).moedas;
const argumentos = process.argv.slice(2);
const so = argumentos.filter((a) => !a.startsWith("--"));
const rodada = argumentos.includes("--rodada");
let anterior: ArquivoInsiders | null = null;
// O arquivo do robô ou, na primeira rodada, a semente lida à mão que mora no `main`.
for (const arq of [ARQUIVO, SEMENTE]) {
  if (anterior || !existsSync(arq)) continue;
  try {
    anterior = JSON.parse(await readFile(arq, "utf8")) as ArquivoInsiders;
  } catch (e) {
    console.error(`insiders: ${arq} existe e não se lê (${(e as Error).message}) — nada gravado`);
    process.exit(1);
  }
}
if (argumentos.includes("--semente")) {
  if (!existsSync(ARQUIVO)) {
    console.error(`insiders: sem ${ARQUIVO} para copiar`);
    process.exit(1);
  }
  await writeFile(SEMENTE, await readFile(ARQUIVO, "utf8"));
  console.log(`${SEMENTE} gravado`);
  process.exit(0);
}
if (rodada && existsSync(ARQUIVO) && anterior && Date.now() - anterior.geradoEm < INTERVALO && !argumentos.includes("--agora")) {
  console.log(`insiders: a leitura tem ${((Date.now() - anterior.geradoEm) / 60_000).toFixed(0)} min — a próxima sai com 4 h`);
  process.exit(0);
}
const saida: ArquivoInsiders = { geradoEm: Date.now(), fora: {}, moedas: { ...(anterior?.moedas ?? {}) } };

/** As moedas que a leitura alcança, com o porquê das que ficam fora. */
const alcanca: { symbol: string; contrato: string; nascimento: number; donos: Dono[] }[] = [];
for (const [symbol, d] of Object.entries(detentores)) {
  const token = WATCHLIST.find((t) => t.symbol === symbol);
  let porque: string | null = null;
  if (!token?.contract) porque = "sem contrato na lista";
  else if (d.chain === "base") porque = "Base: só a Ethereum está na leitura";
  else if (d.chain !== "ethereum") porque = "BNB Chain: não há fonte gratuita de log antigo";
  else if (d.donos.length === 0) porque = "a gênese não tem dono medido";
  if (porque) {
    saida.fora[symbol] = porque;
    delete saida.moedas[symbol];
  } else {
    alcanca.push({ symbol, contrato: (token as { contract: string }).contract, nascimento: d.nascimento, donos: d.donos });
  }
}

async function completa(m: (typeof alcanca)[number]): Promise<void> {
  const t0 = Date.now();
  try {
    const l = await lerMoeda(m.symbol, "ethereum", m.contrato, m.nascimento, m.donos);
    saida.moedas[m.symbol] = l;
    const r = l.resumo;
    console.log(
      `${m.symbol.padEnd(11)} nível 0: ${l.nivel0.length} · nível 1: ${l.nivel1.length} · depósitos reconhecidos: ${Object.keys(l.depositos).length} · infraestrutura: ${l.infraestrutura.length} · ` +
        `para corretora ${(r.paraCorretora * 100).toFixed(2)}% · market maker ${(r.paraMarketMaker * 100).toFixed(2)}% · saiu da rede ${(r.queimado * 100).toFixed(2)}% · outros ${(r.paraOutros * 100).toFixed(2)}% · ` +
        `eventos ${l.eventos.filter((e) => e.tipo === "corretora").length}+${l.eventos.filter((e) => e.tipo === "marketmaker").length} · faixas perdidas ${l.faixasPerdidas} · ${((Date.now() - t0) / 1000).toFixed(0)} s`,
    );
  } catch (e) {
    // A leitura anterior, se havia, fica: uma falha de rede não apaga o que já foi lido.
    console.log(`${m.symbol.padEnd(11)} FALHOU: ${(e as Error).message}`);
    if (!saida.moedas[m.symbol]) saida.fora[m.symbol] = `a leitura falhou: ${(e as Error).message.slice(0, 80)}`;
  }
  await mkdir("data", { recursive: true });
  await writeFile(ARQUIVO, `${JSON.stringify(saida)}\n`);
}

const avisos: string[] = [];
if (rodada) {
  // Para frente, em todas as que já têm leitura.
  for (const m of alcanca) {
    const l = saida.moedas[m.symbol];
    if (!l) continue;
    try {
      const r = await atualizarMoeda(l);
      if (!r) {
        console.log(`${m.symbol.padEnd(11)} não avançou: faixa ou hora de bloco sem resposta — tenta de novo na próxima, do bloco ${l.ate + 1}`);
        continue;
      }
      saida.moedas[m.symbol] = r.l;
      const textos = avisosDe(m.symbol, r.novidades);
      avisos.push(...textos);
      console.log(`${m.symbol.padEnd(11)} +${r.l.ate - l.ate} blocos · ${r.novidades.length} fluxos novos · ${Object.keys(r.l.pendentes ?? {}).length} destinos esperando a varredura${textos.length ? ` · ${textos.length} aviso(s)` : ""}`);
    } catch (e) {
      console.log(`${m.symbol.padEnd(11)} não avançou: ${(e as Error).message}`);
    }
  }
  // E a vida inteira de UMA: a que nunca foi lida, ou a mais velha, se passou de 7 dias.
  const maisVelha = [...alcanca].sort((x, y) => (saida.moedas[x.symbol]?.completaEm ?? 0) - (saida.moedas[y.symbol]?.completaEm ?? 0))[0];
  if (maisVelha && Date.now() - (saida.moedas[maisVelha.symbol]?.completaEm ?? 0) > VALIDADE_DA_COMPLETA) await completa(maisVelha);
} else {
  for (const m of alcanca) if (so.length === 0 || so.includes(m.symbol)) await completa(m);
}
await mkdir("data", { recursive: true });
await writeFile(ARQUIVO, `${JSON.stringify(saida)}\n`);
console.log(`${ARQUIVO}: ${Object.keys(saida.moedas).length} moedas lidas, ${Object.keys(saida.fora).length} fora (${Object.entries(saida.fora).map(([k, v]) => `${k.replace(/USDT$/, "")}: ${v}`).join("; ")})`);

if (avisos.length > 0) {
  const telegram = telegramFromEnv();
  for (const texto of avisos) {
    console.log(`aviso: ${texto}`);
    if (telegram && !(await sendTelegram(telegram, escapeMarkdown(texto)))) console.log("  ⚠ o Telegram recusou este aviso");
  }
}
