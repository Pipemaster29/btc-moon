/**
 * Os avisos de entrada e saída da carteira fictícia, pelo Telegram.
 *
 * O monitor já avisava de movimento on-chain; faltava avisar do que a CARTEIRA
 * faz — abrir comprado, abrir vendido, fechar —, que é o que responde "o painel
 * mandou fazer o quê agora?". Continua sendo a carteira de mentira: a mensagem
 * diz isso na primeira linha, porque o placar ainda mede que os vieses não
 * separam da referência, e um aviso de trade no celular é exatamente o formato
 * que faz descrição parecer recomendação.
 *
 * COMO DESCOBRE O QUE É NOVO, e por que não basta comparar as duas listas. O
 * `npm run carteira` recalcula a carteira INTEIRA a cada retrato, desde 02/09 —
 * e quando uma regra muda, o passado inteiro muda junto: com a troca de regime
 * de 23/09, 173 trades viraram outros. Comparar as listas mandaria dezenas de
 * "abriu" e "fechou" de semanas atrás de uma vez. Então um evento só conta se
 * aconteceu DEPOIS do retrato anterior (o `atualizadoEm` do arquivo que estava
 * lá) e se a chave dele ainda não foi avisada — as chaves avisadas viajam no
 * próprio `carteira.json`, e é isso que impede o mesmo aviso de sair duas vezes
 * quando o retrato seguinte recalcula tudo de novo.
 *
 * O LADO PARA ONDE ELE ERRA, escolhido: se o push do retrato falhar depois de
 * o aviso sair, a memória some junto e o retrato seguinte avisa de novo. Aviso
 * repetido de vez em quando é melhor que aviso perdido em silêncio — que é o
 * que a janela de reenvio abaixo existe para evitar.
 *
 * Pura de propósito, sem rede nem disco: `scripts/testar-carteira.mts` a exercita
 * com carteiras montadas à mão.
 */

import { ALAVANCAGEM, type Aberta, type Carteira, type Fechada } from "./carteira";

export type Evento =
  | { tipo: "abriu"; chave: string; p: Aberta }
  /** `inteira`: abriu e fechou dentro do mesmo intervalo entre retratos. */
  | { tipo: "fechou"; chave: string; f: Fechada; inteira: boolean };

/** Quantas chaves guardar. Um retrato abre ou fecha poucas; 300 cobrem semanas. */
export const CHAVES_GUARDADAS = 300;

/**
 * Teto por retrato. Se um dia vier uma enxurrada — uma regra que mudou o
 * presente, não só o passado —, os primeiros vão um por um e o resto vira uma
 * linha de resumo, em vez de trinta notificações seguidas no celular.
 */
export const MAX_POR_RETRATO = 8;

/** Quanto para trás do retrato anterior um evento ainda pode ser avisado. */
export const JANELA_REENVIO_MS = 6 * 3_600_000;

const chaveAbriu = (p: Aberta) => `A|${p.symbol}|${p.abertaEm}`;
const chaveFechou = (f: Fechada) => `F|${f.symbol}|${f.abertaEm}|${f.fechadaEm}`;

/**
 * O que aconteceu desde o retrato anterior e ainda não foi avisado, em ordem de
 * tempo.
 *
 * Sem carteira anterior não há "desde": é a primeira vez, e o que já existe é
 * passado — nada é avisado.
 */
export function eventosNovos(anterior: Carteira | null, atual: Carteira): Evento[] {
  if (!anterior || !Number.isFinite(anterior.atualizadoEm)) return [];
  // Seis horas para trás do retrato anterior, e não zero: um aviso que o
  // Telegram recusou fica sem chave gravada e precisa ser tentado de novo no
  // retrato seguinte — que, com o corte exato, já o teria deixado para trás. As
  // chaves impedem a repetição; a janela só limita quanto passado recalculado
  // pode virar aviso. Na primeira vez (sem `avisos` no arquivo), corte exato:
  // ligar o recurso não deve despejar as últimas horas de uma vez.
  const desde = anterior.atualizadoEm - (anterior.avisos ? JANELA_REENVIO_MS : 0);
  const avisadas = new Set(anterior.avisos?.enviados ?? []);

  const eventos: { t: number; e: Evento }[] = [];
  for (const p of atual.abertas) {
    const chave = chaveAbriu(p);
    if (p.abertaEm > desde && !avisadas.has(chave)) eventos.push({ t: p.abertaEm, e: { tipo: "abriu", chave, p } });
  }
  for (const f of atual.fechadas) {
    const chave = chaveFechou(f);
    if (f.fechadaEm <= desde || avisadas.has(chave)) continue;
    // Uma posição que abriu e fechou dentro do mesmo intervalo entre retratos
    // nunca apareceu em `abertas` e não teve "abriu" avisado: vai num aviso só,
    // com as duas horas, em vez de um "abriu" montado com número inventado.
    const inteira = f.abertaEm > desde && !avisadas.has(`A|${f.symbol}|${f.abertaEm}`);
    eventos.push({ t: f.fechadaEm, e: { tipo: "fechou", chave, f, inteira } });
  }
  return eventos.sort((a, b) => a.t - b.t).map((x) => x.e);
}

/** As chaves a gravar depois de avisar: as antigas mais as novas, as mais recentes primeiro. */
export function chavesDepois(anterior: Carteira | null, avisados: Evento[]): string[] {
  const todas = [...avisados.map((e) => e.chave), ...(anterior?.avisos?.enviados ?? [])];
  return [...new Set(todas)].slice(0, CHAVES_GUARDADAS);
}

// ------------------------------------------------------------------ o texto

function preco(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return "—";
  // Vírgula, como o resto da mensagem: "US$ 0.08680" ao lado de "+5,1%" lia
  // como dois idiomas na mesma linha.
  return `US$ ${v.toPrecision(4).replace(".", ",")}`;
}

function usd(v: number): string {
  return `US$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function pct(v: number): string {
  return `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(1).replace(".", ",")}%`;
}

function hora(t: number): string {
  return `${new Date(t).toISOString().slice(8, 10)}/${new Date(t).toISOString().slice(5, 7)} ${new Date(t).toISOString().slice(11, 16)} UTC`;
}

const MOTIVO: Record<string, string> = {
  "painel mudou": "o painel mudou de ideia",
  stop: "bateu no stop",
  "stop móvel": "bateu no stop móvel",
  "sem reação": "não andou a favor no prazo da regra",
  alvo: "bateu no alvo",
  prazo: "venceu o prazo máximo da posição",
  liquidada: "LIQUIDADA",
};

/**
 * O texto de um evento, em texto puro — quem manda escapa para o MarkdownV2.
 *
 * `leitura` é a frase do painel para a moeda naquele retrato, quando existe:
 * é o "porquê" do trade, e sem ela o aviso seria só um ticker e um preço.
 */
export function textoDoEvento(e: Evento, patrimonio: number, leitura?: string | null): string {
  const cab = "Carteira fictícia · não é recomendação";
  if (e.tipo === "abriu") {
    const p = e.p;
    const acao = p.lado === "long" ? "🟢 ABRIU COMPRADO" : "🔴 ABRIU VENDIDO";
    return [
      `${acao} · ${p.symbol}`,
      cab,
      `força ${p.forca}/3 · entrada ${preco(p.precoEntrada)} · margem ${usd(p.valor)} a ${ALAVANCAGEM}x`,
      p.nivelStop ? `stop em ${preco(p.nivelStop)}${p.precoLiquidacao ? ` · liquida em ${preco(p.precoLiquidacao)}` : ""}` : null,
      leitura ? `leitura: ${leitura}` : null,
      `às ${hora(p.abertaEm)} · patrimônio ${usd(patrimonio)}`,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  }
  const f = e.f;
  const sinal = f.resultado >= 0 ? "✅" : "❌";
  return [
    `${sinal} FECHOU ${f.lado === "long" ? "COMPRADO" : "VENDIDO"} · ${f.symbol} · ${pct(f.retorno)}`,
    cab,
    `${MOTIVO[f.motivo] ?? f.motivo} · ${f.resultado >= 0 ? "+" : "−"}${usd(Math.abs(f.resultado))} em ${f.dias.toFixed(1).replace(".", ",")} dias`,
    `entrou a ${preco(f.precoEntrada)}, saiu a ${preco(f.precoSaida)}`,
    e.inteira
      ? `abriu às ${hora(f.abertaEm)} e fechou às ${hora(f.fechadaEm)}, entre dois retratos · patrimônio ${usd(patrimonio)}`
      : `às ${hora(f.fechadaEm)} · patrimônio ${usd(patrimonio)}`,
  ].join("\n");
}
