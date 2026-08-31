"use client";

/**
 * O painel da liquidez projetada.
 *
 * Duas séries num eixo só, e isso exige justificativa: dólares de balanço e
 * preço de bitcoin não cabem na mesma escala, e encaixar duas escalas uma na
 * outra é inventar a correlação no alinhamento — o eixo duplo é a mentira mais
 * comum em gráfico de macro. Aqui as duas séries são PADRONIZADAS antes de
 * desenhar: cada uma vira distância da própria média, em desvios padrão, que é
 * a mesma unidade para as duas. Um eixo, honesto.
 *
 * Os dois gráficos pequenos existem para o painel poder ser desmentido por si
 * mesmo. O de cima mostra o ajuste em nível, que é grande; o da esquerda mostra
 * que esse mesmo ajuste já esteve em −0,82; o da direita mostra que o pico não
 * fica exatamente onde a tese diz. Indicador que não mostra a própria validade
 * é narrativa com eixo.
 */

import { useCallback, useRef, useState } from "react";
import type { Liquidez } from "@/lib/liquidez";

/**
 * As cores das séries, validadas — não escolhidas por gosto.
 *
 * O par passou nos seis testes de paleta contra as DUAS superfícies do site
 * (#FAFAFA no claro, #000000 no escuro): banda de luminosidade, piso de croma,
 * separação sob daltonismo (ΔE 32,3, onde o alvo é 8), piso de visão normal
 * (35,8) e contraste contra a superfície.
 *
 * O âmbar tem um passo por modo, e não é capricho: `#C98500` mede 2,94:1 contra
 * o fundo claro e fica abaixo do piso de 3:1, então no claro ele escurece para
 * `#B87A00`. Modo escuro não é o claro invertido — é uma escolha própria, medida
 * contra a superfície em que de fato aparece.
 *
 * Ficam em variável CSS porque o SVG precisa das duas versões e o tema é
 * decidido pelo navegador, não pelo servidor.
 */
const TEMA_SERIES = "[--serie-btc:#5B8DEF] [--serie-liq:#B87A00] dark:[--serie-liq:#C98500]";
const COR_BTC = "var(--serie-btc)";
const COR_LIQ = "var(--serie-liq)";

/** Molduras do gráfico principal, no espaço do viewBox. */
const L = { w: 900, h: 300, esq: 34, dir: 12, topo: 14, base: 26 };
const SIGMA = 3;

const MINI = { w: 300, h: 110, esq: 30, dir: 8, topo: 10, base: 20 };

function fmt(v: number, casas = 2): string {
  return v.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

function assinado(v: number, casas = 2): string {
  return `${v >= 0 ? "+" : "−"}${fmt(Math.abs(v), casas)}`;
}

function dataCurta(iso: string): string {
  const [a, m, d] = iso.split("-");
  return `${d}/${m}/${a.slice(2)}`;
}

// ------------------------------------------------------------------- placas

const ESTADO_ROTULO: Record<Liquidez["estado"], string> = {
  acompanhando: "ACOMPANHANDO",
  descolado: "DESCOLADO",
  invertido: "INVERTIDO",
};

/**
 * Cores de estado, com um passo por modo — e a razão é contraste, não estética.
 *
 * O verde do projeto, `#0ECB81`, mede 2,04:1 contra o fundo claro: ilegível.
 * `#0a7d43` mede 5,00:1 e é o mesmo verde um passo mais escuro. Mesma história
 * no vermelho (3,38 → 5,35) e no âmbar (1,73 → 3,88, que basta porque a placa é
 * texto grande). No escuro os três originais medem de 5,9 a 11,7 e ficam.
 *
 * Estas são cores de ESTADO e nunca aparecem como série — quem confunde as duas
 * faz o leitor achar que verde é uma linha do gráfico.
 */
const ESTADO_COR: Record<Liquidez["estado"], string> = {
  acompanhando: "text-[#0a7d43] dark:text-[#0ECB81]",
  descolado: "text-[#A97400] dark:text-[#F0B90B]",
  invertido: "text-[#C42B3E] dark:text-[#F6465D]",
};

function Placa({
  rotulo,
  valor,
  tom,
  nota,
}: {
  rotulo: string;
  valor: string;
  tom?: string;
  nota: string;
}) {
  return (
    <div className="px-4 py-3 border-t sm:border-t-0 sm:border-l first:border-l-0 first:border-t-0 border-black/10 dark:border-white/10">
      <p className="text-[10px] tracking-widest text-black/40 dark:text-white/40 uppercase">
        {rotulo}
      </p>
      <p className={`text-2xl font-semibold mt-1 ${tom ?? ""}`}>{valor}</p>
      <p className="text-xs text-black/45 dark:text-white/45 mt-0.5">{nota}</p>
    </div>
  );
}

// ------------------------------------------------------- gráfico principal

function caminho(pontos: { x: number; y: number }[]): string {
  return pontos.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
}

function GraficoPrincipal({ dados }: { dados: Liquidez }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [alvo, setAlvo] = useState<number | null>(null);

  const serie = dados.serie;
  const n = serie.length;
  const largura = L.w - L.esq - L.dir;
  const altura = L.h - L.topo - L.base;

  const px = useCallback(
    (i: number) => L.esq + (n <= 1 ? 0 : (i / (n - 1)) * largura),
    [n, largura],
  );
  const py = useCallback(
    (z: number) => L.topo + ((SIGMA - z) / (2 * SIGMA)) * altura,
    [altura],
  );

  const btc = serie
    .map((p, i) => (p.btcZ === null ? null : { x: px(i), y: py(p.btcZ) }))
    .filter((p): p is { x: number; y: number } => p !== null);
  const liq = serie.map((p, i) => ({ x: px(i), y: py(p.liqZ ?? 0) }));

  const iHoje = serie.findIndex((p) => p.futuro) - 1;
  const xHoje = px(iHoje < 0 ? n - 1 : iHoje);

  // O cone é o erro típico medido entre as duas linhas, abrindo com o horizonte:
  // a incerteza de projetar treze semanas à frente não é a de projetar uma.
  const futuros = serie.map((p, i) => ({ p, i })).filter(({ p }) => p.futuro);
  const cone =
    futuros.length > 0
      ? [
          ...futuros.map(({ p, i }, k) => ({
            x: px(i),
            y: py((p.liqZ ?? 0) + dados.erroTipico * Math.sqrt((k + 1) / futuros.length)),
          })),
          ...futuros
            .map(({ p, i }, k) => ({
              x: px(i),
              y: py((p.liqZ ?? 0) - dados.erroTipico * Math.sqrt((k + 1) / futuros.length)),
            }))
            .reverse(),
        ]
      : [];

  const aoMover = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const caixa = svg.getBoundingClientRect();
      const xViewBox = ((e.clientX - caixa.left) / caixa.width) * L.w;
      const bruto = Math.round(((xViewBox - L.esq) / largura) * (n - 1));
      setAlvo(Math.min(Math.max(bruto, 0), n - 1));
    },
    [largura, n],
  );

  const p = alvo === null ? null : serie[alvo];
  const anos = [...new Set(serie.map((s) => s.data.slice(0, 4)))];

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${L.w} ${L.h}`}
        className="w-full h-auto touch-none"
        role="img"
        aria-label={`Bitcoin contra a liquidez líquida dos bancos centrais deslocada em ${dados.lead} semanas, ambos padronizados`}
        onPointerMove={aoMover}
        onPointerLeave={() => setAlvo(null)}
      >
        {/* Faixa de projeção: tudo à direita daqui é liquidez já publicada,
            deslocada — não é previsão de modelo. */}
        <rect
          x={xHoje}
          y={L.topo}
          width={L.w - L.dir - xHoje}
          height={altura}
          className="fill-black/[0.04] dark:fill-white/[0.04]"
        />

        {/* Grade: hairline sólida, um passo fora da superfície. Nunca tracejada. */}
        {[-3, -2, -1, 0, 1, 2, 3].map((z) => (
          <g key={z}>
            <line
              x1={L.esq}
              x2={L.w - L.dir}
              y1={py(z)}
              y2={py(z)}
              className={z === 0 ? "stroke-black/20 dark:stroke-white/20" : "stroke-black/10 dark:stroke-white/10"}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={L.esq - 6}
              y={py(z) + 3}
              textAnchor="end"
              className="fill-black/40 dark:fill-white/40 tabular-nums"
              fontSize="9"
            >
              {z > 0 ? `+${z}σ` : `${z}σ`}
            </text>
          </g>
        ))}

        {cone.length > 0 && (
          <path d={`${caminho(cone)} Z`} fill={COR_LIQ} fillOpacity="0.16" />
        )}

        <path
          d={caminho(liq)}
          fill="none"
          stroke={COR_LIQ}
          strokeWidth="2"
          strokeDasharray="5 4"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <path
          d={caminho(btc)}
          fill="none"
          stroke={COR_BTC}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />

        <line
          x1={xHoje}
          x2={xHoje}
          y1={L.topo}
          y2={L.topo + altura}
          className="stroke-black/35 dark:stroke-white/35"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <text
          x={xHoje - 5}
          y={L.topo + 10}
          textAnchor="end"
          className="fill-black/45 dark:fill-white/45"
          fontSize="9"
        >
          hoje
        </text>

        {/* Rótulo direto na ponta de cada linha: a identidade não depende só da cor. */}
        {btc.length > 0 && (
          <>
            <circle
              cx={btc[btc.length - 1].x}
              cy={btc[btc.length - 1].y}
              r="4"
              fill={COR_BTC}
              className="stroke-zinc-50 dark:stroke-black"
              strokeWidth="2"
            />
            <text
              x={btc[btc.length - 1].x - 8}
              y={btc[btc.length - 1].y - 8}
              textAnchor="end"
              className="fill-black/70 dark:fill-white/70 font-medium"
              fontSize="10"
            >
              BTC
            </text>
          </>
        )}
        <text
          x={L.w - L.dir - 4}
          y={liq[liq.length - 1].y + 16}
          textAnchor="end"
          className="fill-black/70 dark:fill-white/70 font-medium"
          fontSize="10"
        >
          liquidez
        </text>

        {/* Anos no eixo x — o suficiente para situar, sem virar régua. */}
        {anos.map((ano) => {
          const i = serie.findIndex((s) => s.data.slice(0, 4) === ano);
          return (
            <text
              key={ano}
              x={px(i)}
              y={L.h - 8}
              textAnchor="middle"
              className="fill-black/35 dark:fill-white/35 tabular-nums"
              fontSize="9"
            >
              {ano}
            </text>
          );
        })}

        {alvo !== null && p && (
          <line
            x1={px(alvo)}
            x2={px(alvo)}
            y1={L.topo}
            y2={L.topo + altura}
            className="stroke-black/30 dark:stroke-white/30"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {alvo !== null && p && (
        <div
          className="pointer-events-none absolute top-2 rounded-lg border border-black/10 dark:border-white/15 bg-zinc-50/95 dark:bg-black/95 px-3 py-2 text-xs shadow-sm"
          style={{
            left: `${(px(alvo) / L.w) * 100}%`,
            transform: px(alvo) > L.w / 2 ? "translateX(-108%)" : "translateX(8%)",
          }}
        >
          <p className="text-black/50 dark:text-white/50 tabular-nums">
            {dataCurta(p.data)}
            {p.futuro && " · projeção"}
          </p>
          <p className="mt-1 flex items-center gap-2">
            <span className="inline-block w-3 h-0.5" style={{ background: COR_BTC }} />
            <span className="font-semibold tabular-nums">
              {p.btcZ === null ? "—" : `${assinado(p.btcZ)}σ`}
            </span>
            <span className="text-black/45 dark:text-white/45">BTC</span>
          </p>
          <p className="flex items-center gap-2">
            <span className="inline-block w-3 h-0.5" style={{ background: COR_LIQ }} />
            <span className="font-semibold tabular-nums">
              {p.liqZ === null ? "—" : `${assinado(p.liqZ)}σ`}
            </span>
            <span className="text-black/45 dark:text-white/45">liquidez</span>
          </p>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------- gráficos pequenos

/**
 * Os dois pequenos usam tinta neutra de propósito.
 *
 * Azul é o bitcoin e âmbar é a liquidez no gráfico de cima; pintar uma medida
 * SOBRE o ajuste com uma dessas duas cores faria a cor deixar de identificar
 * uma coisa só. Aqui a linha é cinza e quem carrega o significado é o eixo.
 */
function MiniGrafico({
  titulo,
  legenda,
  pontos,
  dominio,
  marcaX,
  marcaRotulo,
  rotulosX,
  faixaRuim,
}: {
  titulo: string;
  legenda: string;
  pontos: { x: number; y: number }[];
  dominio: [number, number];
  marcaX?: number;
  marcaRotulo?: string;
  rotulosX: { pos: number; texto: string }[];
  faixaRuim?: [number, number];
}) {
  const largura = MINI.w - MINI.esq - MINI.dir;
  const altura = MINI.h - MINI.topo - MINI.base;
  const [x0, x1] = [Math.min(...pontos.map((p) => p.x)), Math.max(...pontos.map((p) => p.x))];
  const sx = (x: number) => MINI.esq + (x1 === x0 ? 0 : ((x - x0) / (x1 - x0)) * largura);
  const sy = (y: number) =>
    MINI.topo + ((dominio[1] - y) / (dominio[1] - dominio[0])) * altura;

  const ultimo = pontos[pontos.length - 1];

  return (
    <div className="flex-1 min-w-[240px]">
      <p className="text-[10px] tracking-widest text-black/40 dark:text-white/40 uppercase">
        {titulo}
      </p>
      <svg viewBox={`0 0 ${MINI.w} ${MINI.h}`} className="w-full h-auto mt-1" role="img" aria-label={legenda}>
        {faixaRuim && (
          <rect
            x={MINI.esq}
            y={sy(faixaRuim[1])}
            width={largura}
            height={sy(faixaRuim[0]) - sy(faixaRuim[1])}
            className="fill-[#C42B3E]/[0.08] dark:fill-[#F6465D]/[0.08]"
          />
        )}
        {[dominio[1], 0, dominio[0]].map((y) => (
          <g key={y}>
            <line
              x1={MINI.esq}
              x2={MINI.w - MINI.dir}
              y1={sy(y)}
              y2={sy(y)}
              className={y === 0 ? "stroke-black/20 dark:stroke-white/20" : "stroke-black/10 dark:stroke-white/10"}
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={MINI.esq - 5}
              y={sy(y) + 3}
              textAnchor="end"
              className="fill-black/35 dark:fill-white/35 tabular-nums"
              fontSize="8"
            >
              {y > 0 ? `+${y}` : y}
            </text>
          </g>
        ))}

        {marcaX !== undefined && (
          <>
            <line
              x1={sx(marcaX)}
              x2={sx(marcaX)}
              y1={MINI.topo}
              y2={MINI.topo + altura}
              className="stroke-black/30 dark:stroke-white/30"
              strokeWidth="1"
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
            {marcaRotulo && (
              <text
                x={sx(marcaX)}
                y={MINI.topo + 8}
                textAnchor="middle"
                className="fill-black/50 dark:fill-white/50"
                fontSize="8"
              >
                {marcaRotulo}
              </text>
            )}
          </>
        )}

        <path
          d={caminho(pontos.map((p) => ({ x: sx(p.x), y: sy(p.y) })))}
          fill="none"
          className="stroke-black/55 dark:stroke-white/55"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={sx(ultimo.x)}
          cy={sy(ultimo.y)}
          r="3.5"
          className="fill-black/70 dark:fill-white/70 stroke-zinc-50 dark:stroke-black"
          strokeWidth="2"
        />
        <text
          x={sx(ultimo.x) - 6}
          y={sy(ultimo.y) - 6}
          textAnchor="end"
          className="fill-black/60 dark:fill-white/60 font-medium tabular-nums"
          fontSize="9"
        >
          {assinado(ultimo.y)}
        </text>

        {rotulosX.map((r) => (
          <text
            key={r.texto}
            x={sx(r.pos)}
            y={MINI.h - 6}
            textAnchor="middle"
            className="fill-black/35 dark:fill-white/35 tabular-nums"
            fontSize="8"
          >
            {r.texto}
          </text>
        ))}
      </svg>
      <p className="text-xs text-black/45 dark:text-white/45">{legenda}</p>
    </div>
  );
}

// ----------------------------------------------------------------- o painel

export default function LiquidityPanel({ dados }: { dados: Liquidez }) {
  const movel = dados.movel;
  const minMovel = Math.min(...movel.map((m) => m.ajuste));
  const maxMovel = Math.max(...movel.map((m) => m.ajuste));
  const anosMovel = [...new Set(movel.map((m) => m.data.slice(0, 4)))].filter(
    (_, i, a) => i === 0 || i === a.length - 1 || i === Math.floor(a.length / 2),
  );

  const picoLead = dados.perfilLead.reduce((a, b) => (b.ajuste > a.ajuste ? b : a));
  const observados = dados.serie.filter((p) => !p.futuro);

  return (
    <section
      className={`rounded-xl border border-black/10 dark:border-white/10 overflow-hidden ${TEMA_SERIES}`}
    >
      {/* ------------------------------------------------------------ cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-black/10 dark:border-white/10">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10px] tracking-widest text-black/40 dark:text-white/40 uppercase">
            Macro · Liquidez
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full border border-[#0a7d43]/40 dark:border-[#0ECB81]/40 text-[#0a7d43] dark:text-[#0ECB81]">
            semanal · última leitura {dataCurta(dados.atualizadoEm)}
          </span>
        </div>
        <span className="text-[10px] tracking-widest text-black/40 dark:text-white/40 uppercase">
          lead {dados.lead} semanas · fixo
        </span>
      </div>

      <div className="px-4 pt-4">
        <h2 className="text-2xl font-bold">Liquidez projetada</h2>
        <p className="text-sm text-black/60 dark:text-white/60 mt-1 max-w-3xl">
          Balanço do Fed menos a conta do Tesouro menos o reverse repo — o dinheiro que
          de fato circula, hoje em US$ {fmt(dados.atual, 2)} trilhões. A linha da liquidez
          está deslocada {dados.lead}{" "}
          semanas para a frente, então o trecho depois de &ldquo;hoje&rdquo; é dado já
          publicado, não previsão de modelo.
        </p>
      </div>

      {/* ---------------------------------------------------------------- placas */}
      <div className="grid grid-cols-2 sm:grid-cols-4 mt-4 border-y border-black/10 dark:border-white/10">
        <Placa
          rotulo="Estado do lead"
          valor={ESTADO_ROTULO[dados.estado]}
          tom={ESTADO_COR[dados.estado]}
          nota={`ajuste móvel de 52 semanas em ${assinado(movel[movel.length - 1].ajuste)}`}
        />
        <Placa
          rotulo="Ajuste em nível"
          valor={fmt(dados.ajusteNivel)}
          nota={`na janela de ${dados.janela} semanas — inflado por tendência comum`}
        />
        <Placa
          rotulo="Ajuste em variação"
          valor={assinado(dados.ajusteVariacaoTotal)}
          tom="text-black/70 dark:text-white/70"
          nota={`${dados.amostraTotal} semanas — é este que não dá para falsear`}
        />
        <Placa
          rotulo={`Projeção ${dados.lead} semanas`}
          valor={dados.direcao === "caindo" ? "CAINDO" : "SUBINDO"}
          tom={
            dados.direcao === "caindo"
              ? "text-[#C42B3E] dark:text-[#F6465D]"
              : "text-[#0a7d43] dark:text-[#0ECB81]"
          }
          nota={`liquidez ${assinado(dados.variacaoLead, 2)} tri no trimestre já contratado`}
        />
      </div>

      {/* --------------------------------------------------------------- gráfico */}
      <div className="px-4 pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="text-[10px] tracking-widest text-black/40 dark:text-white/40 uppercase">
            Bitcoin contra liquidez deslocada · padronizados
          </span>
          <span className="flex items-center gap-3 text-black/50 dark:text-white/50">
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-4 h-0.5" style={{ background: COR_BTC }} />
              BTC
            </span>
            <span className="flex items-center gap-1.5">
              <svg width="16" height="2" aria-hidden>
                <line x1="0" y1="1" x2="16" y2="1" stroke={COR_LIQ} strokeWidth="2" strokeDasharray="5 4" />
              </svg>
              liquidez
            </span>
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: `${COR_LIQ}29` }} />
              cone
            </span>
          </span>
        </div>
        <GraficoPrincipal dados={dados} />
      </div>

      {/* -------------------------------------------------- validade e perfil */}
      <div className="flex flex-wrap gap-6 px-4 pt-2 pb-4">
        <MiniGrafico
          titulo="Validade do lead · ajuste móvel"
          legenda={`52 semanas móveis no lead de ${dados.lead}. Já esteve em ${fmt(minMovel)} e em ${fmt(maxMovel)}: a relação vai e volta.`}
          pontos={movel.map((m, i) => ({ x: i, y: m.ajuste }))}
          dominio={[-1, 1]}
          faixaRuim={[-1, 0]}
          rotulosX={anosMovel.map((ano) => ({
            pos: movel.findIndex((m) => m.data.slice(0, 4) === ano),
            texto: ano,
          }))}
        />
        <MiniGrafico
          titulo="Onde o lead está · ajuste por defasagem"
          legenda={`O pico da janela atual cai em ${picoLead.lead} semanas, não em ${dados.lead}. Curva chata é sinal de tendência comum, não de defasagem.`}
          pontos={dados.perfilLead.map((p) => ({ x: p.lead, y: p.ajuste }))}
          dominio={[-1, 1]}
          marcaX={dados.lead}
          marcaRotulo={`${dados.lead}s`}
          rotulosX={[0, 8, 16, 24].map((s) => ({ pos: s, texto: `${s}s` }))}
        />
      </div>

      {/* --------------------------------------------------------------- o aviso */}
      <div className="px-4 pb-4">
        <p className="text-xs text-black/55 dark:text-white/55 max-w-3xl">
          <span className="font-medium text-black/70 dark:text-white/70">
            O que este painel não prova.
          </span>{" "}
          O ajuste de {fmt(dados.ajusteNivel)} é entre NÍVEIS de duas séries que subiram
          no período, e correlação entre séries com tendência é a armadilha mais velha da
          estatística. Medido em VARIAÇÃO semanal, que a tendência não consegue falsear, o
          ajuste no lead de {dados.lead} semanas é {assinado(dados.ajusteVariacaoTotal)} em{" "}
          {dados.amostraTotal} semanas — zero. Fora da amostra, o ajuste em nível foi −0,09
          entre 2017 e 2020, +0,78 entre 2020 e 2023 e −0,02 de 2023 para cá: funcionou num
          terço da história. O lead fica fixo em um trimestre justamente para não ser
          escolhido pelo que se ajusta melhor — o melhor lead se mexe de 15 para 19 para 1
          semana conforme a janela, que é como se reconhece um ajuste que não existe. Use
          isto como contexto de regime, nunca como gatilho.
        </p>
      </div>

      {/* ------------------------------------------------------- tabela equivalente */}
      <details className="border-t border-black/10 dark:border-white/10">
        <summary className="px-4 py-2.5 text-xs text-black/50 dark:text-white/50 cursor-pointer hover:text-black/70 dark:hover:text-white/70">
          Ver os números — as últimas 16 semanas e o trimestre projetado
        </summary>
        <div className="px-4 pb-4 overflow-x-auto">
          <table className="w-full text-xs min-w-[26rem]">
            <thead className="text-black/45 dark:text-white/45">
              <tr className="text-left">
                <th className="font-normal py-1.5">Semana</th>
                <th className="font-normal py-1.5 text-right">BTC (σ)</th>
                <th className="font-normal py-1.5 text-right">Liquidez (σ)</th>
                <th className="font-normal py-1.5 pl-4">Trecho</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {[...observados.slice(-16), ...dados.serie.filter((p) => p.futuro)].map((p) => (
                <tr key={p.data} className="border-t border-black/5 dark:border-white/5">
                  <td className="py-1.5">{dataCurta(p.data)}</td>
                  <td className="py-1.5 text-right">{p.btcZ === null ? "—" : assinado(p.btcZ)}</td>
                  <td className="py-1.5 text-right">{p.liqZ === null ? "—" : assinado(p.liqZ)}</td>
                  <td className="py-1.5 pl-4 text-black/45 dark:text-white/45">
                    {p.futuro ? "projetado" : "observado"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="px-4 pb-4 text-[11px] text-black/35 dark:text-white/35">
        WALCL, WTREGEN e RRPONTSYD pelo FRED do Fed de St. Louis; bitcoin pela Bitstamp.
        Sem chave de API. Nada aqui é recomendação de investimento.
      </p>
    </section>
  );
}
