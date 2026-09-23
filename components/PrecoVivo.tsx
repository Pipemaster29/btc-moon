"use client";

/**
 * As duas células da tabela que envelhecem em minutos: preço e variação de 24h.
 *
 * São componentes minúsculos dentro de uma tabela servida pelo servidor, e não
 * uma tabela inteira transformada em cliente. A diferença é de peso: passar as
 * setenta linhas do panorama para o navegador seriam centenas de kilobytes de
 * JSON por carregamento, e o que precisa andar sozinho são dois números por
 * linha. O resto — estágio, motor, concentração — muda de hora em hora e pode
 * continuar vindo pronto do servidor.
 *
 * O NÚMERO DO RETRATO É O PONTO DE PARTIDA E NUNCA SOME. Se a rota ao vivo não
 * responder, a célula fica exatamente como estava antes de existir camada viva
 * nenhuma. É a regra que este projeto repete em toda leitura: "não consegui" não
 * pode virar "não achei", e muito menos virar zero.
 */

import { useMoedaViva, useVivo } from "./vivo";

function sinal(v: number): string {
  if (!Number.isFinite(v) || v === 0) return "—";
  return `${v > 0 ? "+" : ""}${(v * 100).toFixed(1)}%`;
}

function tom(v: number): string {
  if (!Number.isFinite(v) || v === 0) return "";
  return v > 0 ? "text-[#0a7d43] dark:text-[#0ECB81]" : "text-[#C42B3E] dark:text-[#F6465D]";
}

/**
 * A pontinha que diz que aquele número em particular é de agora.
 *
 * Discreta de propósito: ela aparece em setenta linhas ao mesmo tempo, e um
 * marcador chamativo repetido setenta vezes vira ruído — e ruído que se ignora é
 * pior do que marcador nenhum, porque some justo quando importa.
 */
function Ponto() {
  return (
    <span
      className="inline-block ml-1 h-1 w-1 rounded-full bg-[#0a7d43] dark:bg-[#0ECB81] align-middle"
      title="preço lido ao vivo na Binance, não é o do retrato"
    />
  );
}

/**
 * Uma frase no cabeçalho dizendo por onde o preço está chegando.
 *
 * O pontinho de cada linha diz QUE o número é de agora; isto diz de QUANDO em
 * quando ele anda. Direto da Binance são ~3 s por moeda; pela consulta são
 * quinze. E quando nada responde, a frase existe para dizer isso — a tela
 * voltando em silêncio para o preço do retrato é o modo de falha que o projeto
 * inteiro existe para evitar.
 */
export function SinalVivo() {
  const vivo = useVivo();
  if (vivo.estado === "buscando") return null;
  if (vivo.estado === "sem resposta") {
    return <span className="text-[#8a5a00] dark:text-[#F0B90B]"> · ⚠ sem cotação ao vivo, preço do retrato</span>;
  }
  return (
    <span className="text-[#0a7d43] dark:text-[#0ECB81]">
      {vivo.canal === "websocket"
        ? " · preço e 24h ao vivo, direto da Binance, de segundos em segundos"
        : " · preço e 24h ao vivo, a cada 15 s"}
    </span>
  );
}

export function PrecoVivo({ ticker, retrato }: { ticker: string; retrato: number }) {
  const vivo = useMoedaViva(ticker);
  const preco = vivo?.preco ?? retrato;
  if (!(preco > 0)) return <>—</>;
  return (
    <>
      US$ {preco.toPrecision(4)}
      {vivo && <Ponto />}
    </>
  );
}

/**
 * A variação de 24h vem da MESMA leitura que o preço, e não pode vir de outra.
 *
 * Se o preço fosse o da Binance e a variação a do retrato, a tela mostraria uma
 * subida de 12% ao lado de um preço que já voltou — que é a combinação que este
 * projeto passou meses consertando em outros lugares.
 */
export function VariacaoViva({ ticker, retrato }: { ticker: string; retrato: number }) {
  const vivo = useMoedaViva(ticker);
  const v = vivo ? vivo.variacao24h : retrato;
  return <span className={tom(v)}>{sinal(v)}</span>;
}
