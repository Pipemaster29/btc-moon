/**
 * Eventos que marcaram o mercado cripto.
 *
 * Todas as datas são UTC e correspondem ao dia em que o fato se tornou público
 * e mexeu no preço — não à data de um documento ou de um anúncio posterior. No
 * caso da FTX, por exemplo, o que moveu o mercado foi a suspensão dos saques em
 * 8 de novembro, com o pedido de falência vindo três dias depois; ambos estão
 * na lista porque tiveram efeitos distintos.
 */

export type EventKind = "crash" | "regulation" | "adoption" | "milestone";

export interface MarketEvent {
  /** Data UTC no formato AAAA-MM-DD. */
  date: string;
  label: string;
  kind: EventKind;
  /** Rótulo curto para o marcador no gráfico. */
  short: string;
}

export const EVENT_KIND_LABEL: Record<EventKind, string> = {
  crash: "Quebras e crashes",
  regulation: "Regulação",
  adoption: "Adoção institucional",
  milestone: "Marcos de preço e rede",
};

export const EVENT_KIND_COLOR: Record<EventKind, string> = {
  crash: "#F6465D",
  regulation: "#5B8DEF",
  adoption: "#0ECB81",
  milestone: "#A78BFA",
};

export const MARKET_EVENTS: MarketEvent[] = [
  { date: "2013-04-10", label: "Estouro da bolha de 2013", kind: "crash", short: "Bolha 2013" },
  { date: "2013-12-05", label: "China proíbe bancos de operar com Bitcoin", kind: "regulation", short: "China 2013" },
  { date: "2014-02-24", label: "Colapso da Mt. Gox", kind: "crash", short: "Mt. Gox" },
  { date: "2016-07-09", label: "Segundo halving", kind: "milestone", short: "Halving 2" },
  { date: "2016-08-02", label: "Hack da Bitfinex (120 mil BTC)", kind: "crash", short: "Bitfinex" },
  { date: "2017-09-04", label: "China proíbe ICOs", kind: "regulation", short: "ICOs" },
  { date: "2017-12-17", label: "Topo do ciclo de 2017 (~US$ 19,7 mil)", kind: "milestone", short: "Topo 2017" },
  { date: "2020-03-12", label: "Quinta-feira Negra da covid", kind: "crash", short: "Covid" },
  { date: "2020-05-11", label: "Terceiro halving", kind: "milestone", short: "Halving 3" },
  { date: "2021-02-08", label: "Tesla compra US$ 1,5 bilhão em BTC", kind: "adoption", short: "Tesla" },
  { date: "2021-04-14", label: "IPO da Coinbase", kind: "adoption", short: "Coinbase" },
  { date: "2021-05-19", label: "China proíbe mineração", kind: "regulation", short: "Mineração" },
  { date: "2021-09-07", label: "El Salvador adota o Bitcoin como moeda legal", kind: "adoption", short: "El Salvador" },
  { date: "2021-11-10", label: "Topo do ciclo de 2021 (~US$ 69 mil)", kind: "milestone", short: "Topo 2021" },
  { date: "2022-05-09", label: "Colapso do Terra/LUNA", kind: "crash", short: "LUNA" },
  { date: "2022-06-12", label: "Celsius suspende saques", kind: "crash", short: "Celsius" },
  { date: "2022-11-08", label: "FTX suspende saques", kind: "crash", short: "FTX" },
  { date: "2022-11-11", label: "FTX pede falência", kind: "crash", short: "FTX falência" },
  { date: "2023-03-10", label: "Quebra do SVB e perda de paridade do USDC", kind: "crash", short: "SVB" },
  { date: "2023-06-05", label: "SEC processa a Binance", kind: "regulation", short: "SEC/Binance" },
  { date: "2023-06-15", label: "BlackRock pede ETF spot de Bitcoin", kind: "adoption", short: "BlackRock" },
  { date: "2024-01-10", label: "SEC aprova os ETFs spot de Bitcoin", kind: "adoption", short: "ETF spot" },
  { date: "2024-04-20", label: "Quarto halving", kind: "milestone", short: "Halving 4" },
  { date: "2024-11-06", label: "Eleição de Trump nos EUA", kind: "regulation", short: "Eleição EUA" },
  { date: "2025-02-21", label: "Hack da Bybit (US$ 1,5 bilhão)", kind: "crash", short: "Bybit" },
  { date: "2025-03-06", label: "EUA criam a Reserva Estratégica de Bitcoin", kind: "regulation", short: "Reserva EUA" },
  { date: "2025-07-18", label: "GENIUS Act sancionado", kind: "regulation", short: "GENIUS Act" },
  { date: "2025-10-06", label: "Máxima histórica (~US$ 126 mil)", kind: "milestone", short: "Topo 2025" },
];

/** Segundos desde a época para o evento, à meia-noite UTC. */
export function eventTime(event: MarketEvent): number {
  return Date.parse(`${event.date}T00:00:00Z`) / 1000;
}
