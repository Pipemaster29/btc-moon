/**
 * As invariantes de TODO o estado gravado em `data/`.
 *
 * Não é teste de unidade: é a pergunta "o que está no disco faz sentido?", feita
 * contra os arquivos reais depois de qualquer varredura. Cada linha aqui existe
 * porque algum número já saiu errado — supply zero, retorno abaixo de −100%,
 * símbolo duplicado, fração fora de 0..1.
 *
 * Rode com: npm run auditar-dados
 */
import { readFile } from "node:fs/promises";

let falhas = 0;
function checa(nome: string, ok: boolean, detalhe = "") {
  if (!ok) { falhas++; console.log(`  ✗ ${nome} ${detalhe}`); }
}
async function ler<T>(p: string): Promise<T | null> {
  try { return JSON.parse(await readFile(p, "utf8")) as T; } catch { return null; }
}

// ---- panorama
const pan = await ler<{ geradoEm: number; moedas: Record<string, unknown>[] }>("data/panorama.json");
console.log("panorama:");
if (pan) {
  checa("geradoEm no passado", pan.geradoEm <= Date.now() + 60_000, `(${new Date(pan.geradoEm).toISOString()})`);
  const syms = pan.moedas.map((m) => m.symbol as string);
  checa("sem símbolo duplicado", syms.length === new Set(syms).size,
    `(${syms.length} linhas, ${new Set(syms).size} únicas)`);
  for (const m of pan.moedas as Record<string, number | null>[]) {
    const t = m.ticker as unknown as string;
    for (const campo of ["price", "liquidityUsd", "openInterestUsd", "score"]) {
      const v = m[campo];
      checa(`${t}.${campo} finito`, typeof v === "number" && Number.isFinite(v), `= ${v}`);
      if (campo !== "price") checa(`${t}.${campo} >= 0`, (v as number) >= 0, `= ${v}`);
    }
    checa(`${t}.score entre 0 e 100`, (m.score as number) >= 0 && (m.score as number) <= 100, `= ${m.score}`);
  }
} else console.log("  (ausente)");

// ---- carteira
const c = await ler<{
  caixa: number; patrimonio: number; comecouEm: number; atualizadoEm: number;
  abertas: { symbol: string; valor: number; retorno: number; forca: number; lado: string }[];
  fechadas: { retorno: number; resultado: number; dias: number; motivo: string }[];
  acertos: number; encerradas: number;
  pico?: number; quedaMaxima?: number; maiorExposicao?: number;
  maiorRiscoAberto?: number; curva?: { t: number; patrimonio: number }[];
}>("data/carteira.json");
console.log("carteira:");
if (c) {
  const exposto = c.abertas.reduce((s, p) => s + p.valor * (1 + p.retorno), 0);
  checa("caixa + exposto = patrimônio", Math.abs(c.caixa + exposto - c.patrimonio) < 1e-6);
  checa("caixa não negativo", c.caixa >= -1e-9, `= ${c.caixa}`);
  checa("patrimônio não negativo", c.patrimonio >= 0, `= ${c.patrimonio}`);
  checa("atualizadoEm >= comecouEm", c.atualizadoEm >= c.comecouEm);
  checa("encerradas = fechadas.length", c.encerradas === c.fechadas.length);
  checa("acertos <= encerradas", c.acertos <= c.encerradas);
  const s = new Set(c.abertas.map((p) => p.symbol));
  checa("sem posição duplicada", s.size === c.abertas.length);
  for (const p of c.abertas) {
    checa(`${p.symbol}: retorno > -100%`, p.retorno > -1, `= ${p.retorno}`);
    checa(`${p.symbol}: valor > 0`, p.valor > 0);
    checa(`${p.symbol}: lado válido`, p.lado === "long" || p.lado === "short");
    checa(`${p.symbol}: força 1..3`, p.forca >= 1 && p.forca <= 3, `= ${p.forca}`);
  }
  for (const f of c.fechadas) {
    checa("fechada: retorno >= -100%", f.retorno >= -1.0000001, `= ${f.retorno}`);
    checa("fechada: dias >= 0", f.dias >= 0);
    checa("fechada: motivo válido",
      ["painel mudou", "stop", "alvo", "prazo", "liquidada"].includes(f.motivo), `= ${f.motivo}`);
  }

  // O LADO DO RISCO. Opcional porque o arquivo do `main` pode ter sido gravado
  // antes de a medição existir — mas quando está presente, tem de fechar.
  if (c.quedaMaxima !== undefined) {
    checa("queda máxima <= 0", c.quedaMaxima <= 1e-12, `= ${c.quedaMaxima}`);
    checa("queda máxima > -100%", c.quedaMaxima > -1, `= ${c.quedaMaxima}`);
    checa("pico >= patrimônio", (c.pico ?? 0) >= c.patrimonio - 1e-6, `pico ${c.pico}, hoje ${c.patrimonio}`);
    checa("pico >= capital inicial", (c.pico ?? 0) >= 1000 - 1e-6, `= ${c.pico}`);
    // A queda máxima tem de ser CONSISTENTE com o patrimônio de hoje: se a conta
    // está 5% abaixo do pico, a maior queda não pode ser de 1%.
    const quedaHoje = (c.pico ?? 0) > 0 ? c.patrimonio / (c.pico as number) - 1 : 0;
    checa("queda máxima cobre a queda de hoje", (c.quedaMaxima as number) <= quedaHoje + 1e-9,
      `máx ${c.quedaMaxima}, hoje ${quedaHoje}`);
    checa("exposição de pico 0..1", (c.maiorExposicao ?? 0) >= 0 && (c.maiorExposicao ?? 0) <= 1,
      `= ${c.maiorExposicao}`);
    // O TETO DE 25% É CONFERIDO NA ABERTURA, e o pico medido pode passar dele
    // sem nenhuma call o ter furado — o que este teste precisou aprender quando
    // o risco passou a ser medido de onde a posição ESTÁ e não de onde ela
    // entrou (ver `riscoDaqui` em lib/carteira.ts).
    //
    // Uma comprada a 100 com stop em 75 que subiu para 115 tem 120% da margem a
    // devolver, não 75%: o ganho não realizado já entrou no patrimônio e o stop
    // continua onde estava. Os dois sobem juntos, e a fração passa do teto.
    // Medido no retrato de 08/09: 26,9%.
    //
    // A FOLGA NÃO PODE SER LARGA, senão o teste deixa de proteger. Metade acima
    // do teto é o corte: cabe o lucro não realizado de um livro inteiro e ainda
    // reprova se alguém voltar a somar risco nominal sem teto nenhum, ou se o
    // teto parar de ser conferido na abertura.
    checa("risco de pico dentro do teto de 25% mais o lucro não realizado",
      (c.maiorRiscoAberto ?? 0) <= 0.375, `= ${c.maiorRiscoAberto}`);
    const curva = c.curva ?? [];
    checa("curva ordenada no tempo", curva.every((p, i) => i === 0 || curva[i - 1].t <= p.t));
    checa("curva sem patrimônio negativo", curva.every((p) => p.patrimonio >= 0));
  }
} else console.log("  (ausente)");

// ---- vesting
const v = await ler<{ moedas: Record<string, Record<string, number | boolean | null>> }>("data/vesting.json");
console.log("vesting:");
if (v) {
  for (const [k, m] of Object.entries(v.moedas)) {
    const f = (n: string) => m[n] as number;
    checa(`${k}: travado 0..1`, f("travado") >= 0 && f("travado") <= 1, `= ${f("travado")}`);
    checa(`${k}: emCorretora 0..1`, f("emCorretora") >= 0 && f("emCorretora") <= 1.0001, `= ${f("emCorretora")}`);
    checa(`${k}: supply > 0`, f("supply") > 0);
    checa(`${k}: ritmo finito`, Number.isFinite(f("ritmo")));
    const fc = m.foraDeCirculacao as number | null | undefined;
    if (fc != null) checa(`${k}: foraDeCirculacao 0..1`, fc >= 0 && fc <= 1, `= ${fc}`);
    for (const cofre of (m.cofres as unknown as { hoje: number; recebeu: number }[]) ?? []) {
      checa(`${k}: cofre.hoje 0..1`, cofre.hoje >= 0 && cofre.hoje <= 1.0001, `= ${cofre.hoje}`);
      // `recebeu` pode passar de 1 em token de ponte, e passar não é erro: o
      // mesmo endereço recebe emissão toda vez que alguém atravessa. O que
      // denuncia isso é `cobertura`, e esses casos já caem no veredito
      // "contínua". Aqui só se exige que não seja negativo nem absurdo.
      checa(`${k}: cofre.recebeu >= 0`, cofre.recebeu >= 0, `= ${cofre.recebeu}`);
      checa(`${k}: cofre.recebeu abaixo de 10x o supply`, cofre.recebeu < 10, `= ${cofre.recebeu}`);
    }
  }
} else console.log("  (ausente)");

// ---- detentores
//
// O arquivo que a concentração lê, e que não era auditado. A concentração é a
// trava que existe por causa do JCT — seis endereços com 99,9% do supply e o
// painel emitindo COMPRA —, então um número torto aqui vira call.
const det = await ler<{
  moedas: Record<
    string,
    {
      chain: string; nascimento: number; nasceuEm: string; transferencias: number;
      faixasPerdidas: number; ancorada: boolean; concentracao: number; medidoEm: number;
      donos: { endereco: string; recebeu: number; hoje: number; contrato: boolean }[];
    }
  >;
}>("data/detentores.json");
console.log("detentores:");
if (det) {
  for (const [k, m] of Object.entries(det.moedas)) {
    checa(`${k}: concentração 0..1`, m.concentracao >= 0 && m.concentracao <= 1.0001, `= ${m.concentracao}`);
    checa(`${k}: nascimento > 0`, m.nascimento > 0, `= ${m.nascimento}`);
    checa(`${k}: nasceuEm no passado`, Date.parse(m.nasceuEm) <= Date.now(), `= ${m.nasceuEm}`);
    checa(`${k}: medidoEm no passado`, m.medidoEm <= Date.now() + 60_000);
    checa(`${k}: transferências >= 0`, m.transferencias >= 0, `= ${m.transferencias}`);
    // Linha sem leitura não pode existir: `mapear` recusa gravar quando a
    // varredura falhou inteira. Se uma aparecer, o arquivo tem lixo de uma
    // versão anterior, e o painel lê esse lixo como concentração medida.
    checa(
      `${k}: não é varredura vazia com faixas perdidas`,
      !(m.transferencias === 0 && m.faixasPerdidas > 0),
      `${m.transferencias} transferências, ${m.faixasPerdidas} faixas perdidas`,
    );
    checa(`${k}: ancorada é booleano`, typeof m.ancorada === "boolean", `= ${m.ancorada}`);
    const enderecos = m.donos.map((d) => d.endereco);
    checa(`${k}: sem dono duplicado`, enderecos.length === new Set(enderecos).size);
    checa(
      `${k}: endereço zero fora da lista`,
      !enderecos.includes("0x0000000000000000000000000000000000000000"),
      "queima não é dono",
    );
    // A soma de `hoje` é a concentração, e a conta tem de fechar — é o número
    // que o painel usa, e ele não pode divergir da lista que o explica.
    const somaHoje = m.donos.reduce((s, d) => s + d.hoje, 0);
    checa(
      `${k}: soma de donos.hoje = concentração`,
      Math.abs(somaHoje - m.concentracao) < 1e-6,
      `soma ${somaHoje.toFixed(6)}, gravado ${m.concentracao.toFixed(6)}`,
    );
    for (const d of m.donos) {
      checa(`${k}: dono.hoje 0..1`, d.hoje >= -1e-9 && d.hoje <= 1.0001, `= ${d.hoje}`);
      // `recebeu` acima de 1 NÃO é erro: o valor é histórico e o supply que o
      // divide é o de hoje, então moeda que queimou parte da emissão passa de
      // 100% — a BASED dá 141,87%. Ver o comentário em `lib/detentores.ts`.
      // O teto largo aqui separa "moeda deflacionária" de "conta furada".
      checa(`${k}: dono.recebeu >= 0`, d.recebeu >= 0, `= ${d.recebeu}`);
      checa(`${k}: dono.recebeu abaixo de 10x o supply`, d.recebeu < 10, `= ${d.recebeu}`);
    }
  }
} else console.log("  (ausente)");

// ---- garimpo
const gar = await ler<{
  geradoEm: number; universo: number; semSerie: number;
  achados: {
    ticker: string; preco: number; alta24h: number; alta7d: number | null;
    volume24h: number; diasDeSerie: number; marketCap: number | null;
    oiSobreMcap: number | null; quedaDoPico: number | null;
    faixa: { mediana7d: number; n: number; moedas: [number, number] };
  }[];
}>("data/garimpo.json");
console.log("garimpo:");
if (gar) {
  checa("geradoEm no passado", gar.geradoEm <= Date.now() + 60_000, `(${new Date(gar.geradoEm).toISOString()})`);
  checa("universo plausível", gar.universo >= 100 && gar.universo <= 2000, `= ${gar.universo}`);
  const t = gar.achados.map((a) => a.ticker);
  checa("sem ticker duplicado", t.length === new Set(t).size, `(${t.length} linhas, ${new Set(t).size} únicas)`);
  for (const a of gar.achados) {
    checa(`${a.ticker}: preço > 0`, a.preco > 0, `= ${a.preco}`);
    checa(`${a.ticker}: alta24h finita`, Number.isFinite(a.alta24h), `= ${a.alta24h}`);
    checa(`${a.ticker}: volume >= 0`, a.volume24h >= 0);
    checa(`${a.ticker}: diasDeSerie >= 1`, a.diasDeSerie >= 1, `= ${a.diasDeSerie}`);
    // NULO É VÁLIDO e zero não é a mesma coisa: moeda listada há três dias não
    // tem 7 dias de série, e gravar zero ali se leria como "não andou" — que é
    // o erro que fez a MARSCOIN, subindo 96% num dia, sumir do garimpo.
    checa(
      `${a.ticker}: alta7d nula ou finita`,
      a.alta7d === null || Number.isFinite(a.alta7d),
      `= ${a.alta7d}`,
    );
    checa(
      `${a.ticker}: alta7d nula sse série < 8 dias`,
      (a.alta7d === null) === (a.diasDeSerie < 8),
      `alta7d=${a.alta7d}, dias=${a.diasDeSerie}`,
    );
    checa(
      `${a.ticker}: quedaDoPico nula ou <= 0`,
      a.quedaDoPico === null || (a.quedaDoPico <= 1e-9 && a.quedaDoPico >= -1),
      `= ${a.quedaDoPico}`,
    );
    checa(`${a.ticker}: marketCap nulo ou > 0`, a.marketCap === null || a.marketCap > 0, `= ${a.marketCap}`);
    checa(`${a.ticker}: oi/mcap nulo ou >= 0`, a.oiSobreMcap === null || a.oiSobreMcap >= 0);
    // A faixa é a régua da ordenação e ela vem da medição: se a mediana virasse
    // positiva, a lista estaria ordenando por outra coisa que não o efeito.
    checa(`${a.ticker}: mediana da faixa negativa`, a.faixa.mediana7d < 0, `= ${a.faixa.mediana7d}`);
    checa(`${a.ticker}: faixa com amostra`, a.faixa.n >= 30, `n = ${a.faixa.n}`);
    checa(
      `${a.ticker}: concordância <= total`,
      a.faixa.moedas[0] <= a.faixa.moedas[1] && a.faixa.moedas[1] > 0,
      `= ${a.faixa.moedas.join("/")}`,
    );
  }
  // A ordenação É o produto: se ela quebrar, a lista deixa de significar o que
  // a tela promete.
  const ordenado = gar.achados.every(
    (a, i) => i === 0 || gar.achados[i - 1].faixa.mediana7d <= a.faixa.mediana7d,
  );
  checa("ordenado pela mediana medida", ordenado);
} else console.log("  (ausente)");

// ---- aferição
//
// A tabela de faixas do `lib/garimpo.ts` é o que ORDENA a lista inteira, e ela
// está fixa no código. Este arquivo é o carimbo de quando ela foi conferida
// contra uma medição nova — sem ele, o número que ordena a atenção envelhece em
// silêncio, que é o que o próprio `aferir-garimpo` avisa no topo.
const afe = await ler<{
  geradoEm: number; moedas: number; horizonteDias: number; referencia: number;
  piorDesvio: number; monotonica: boolean;
  dia: { de: number; n: number; mediana: number; aFavor: number; moedas: number }[];
  semana: { de: number; n: number; mediana: number; aFavor: number; moedas: number }[];
}>("data/afericao.json");
console.log("aferição:");
if (afe) {
  checa("geradoEm no passado", afe.geradoEm <= Date.now() + 60_000, `(${new Date(afe.geradoEm).toISOString()})`);
  // TRINTA DIAS é o corte, e é generoso: a janela da medição são 200 dias de
  // velas, então ela anda devagar. O que não pode é ninguém saber a idade.
  const dias = (Date.now() - afe.geradoEm) / 86_400_000;
  checa("conferida nos últimos 30 dias", dias <= 30, `há ${dias.toFixed(0)} dias`);
  checa("horizonte de 7 dias", afe.horizonteDias === 7, `= ${afe.horizonteDias}`);
  checa("referência finita e negativa", Number.isFinite(afe.referencia) && afe.referencia < 0, `= ${afe.referencia}`);
  // A AFIRMAÇÃO CENTRAL DO GARIMPO: quanto mais subiu, pior o desfecho. Se ela
  // cair, a tabela deixou de descrever o mundo e nenhum ajuste de mediana
  // conserta isso — a lista passa a ordenar por uma régua que não vale mais.
  checa("monotônica: faixa mais alta, desfecho pior", afe.monotonica === true);
  checa("desvio da tabela viva abaixo de 5 p.p.", afe.piorDesvio <= 0.05, `= ${(afe.piorDesvio * 100).toFixed(1)} p.p.`);
  for (const [nome, linhas] of [["dia", afe.dia], ["semana", afe.semana]] as const) {
    checa(`${nome}: tem faixas`, linhas.length > 0, `= ${linhas.length}`);
    for (const l of linhas) {
      checa(`${nome} ≥${l.de}: mediana negativa`, l.mediana < 0, `= ${l.mediana}`);
      checa(`${nome} ≥${l.de}: amostra >= 30`, l.n >= 30, `n = ${l.n}`);
      checa(`${nome} ≥${l.de}: concordância <= total`, l.aFavor <= l.moedas && l.moedas > 0, `= ${l.aFavor}/${l.moedas}`);
    }
  }
} else console.log("  (ausente — rode npm run aferir-garimpo)");

console.log(falhas === 0 ? "\nTUDO OK" : `\n${falhas} FALHAS`);

// SAI COM CÓDIGO DE ERRO, e não saía.
//
// O script imprimia "3 FALHAS" e terminava com status 0, então ele era
// relatório e não portão: qualquer `npm run auditar-dados && ...` seguia em
// frente com o dado quebrado, e nenhum CI conseguiria reprovar por ele. O nome
// do arquivo e a frase de abertura prometem uma coisa e o código entregava
// outra — é o tipo de silêncio que este projeto trata como o pior modo de
// falha.
process.exitCode = falhas === 0 ? 0 : 1;
