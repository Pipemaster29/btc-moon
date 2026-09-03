/**
 * Quanto supply ainda vai cair no mercado, e em que ritmo.
 *
 * A `lib/detentores.ts` responde "existe um operador?" — quem recebeu o supply
 * no nascimento e quanto ainda segura. Esta responde a pergunta seguinte, que é
 * a que decide o preço: esse supply parado está PARADO, ou está saindo?
 *
 * A diferença não é de grau, é de sinal. Um contrato com 30% do supply que não
 * se move é oferta que não existe: o preço sobe sem resistência até ele acordar.
 * O mesmo contrato soltando 0,9 ponto percentual por mês é uma venda programada
 * de que ninguém avisou, e todo comprador está do outro lado dela.
 *
 * Medido na C (Chainbase), que motivou este arquivo. O supply inteiro — um
 * bilhão — foi mintado para três contratos em 40/30/30, e a leitura de gênese
 * marcava isso como "concentração", que soa a moeda travada. Amostrando o saldo
 * dos três mês a mês, o desenho aparece: eles guardavam 35,4% do supply em março
 * e 23,1% em setembro. São 12,3 pontos percentuais — 123 milhões de tokens — que
 * viraram oferta em seis meses, e o contrato dos 30% pinga 0,91 pp por mês com
 * regularidade de relógio. Não é carteira presa; é torneira.
 *
 * O método é barato porque não reconstrói saldo nenhum: pergunta `balanceOf` ao
 * nó de arquivo em sete alturas de bloco diferentes. Sete leituras por cofre
 * contra varrer a vida inteira do token.
 *
 * O QUE ISTO NÃO É: a lista de maiores detentores. Cofre aqui é quem recebeu
 * emissão direta do endereço zero. Supply que já saiu dos cofres e foi parar
 * numa carteira grande não aparece — para isso existe `emCorretora`, que mede o
 * pedaço que está sob custódia, e o resto é float de verdade.
 */

import { readFile } from "node:fs/promises";

const CAMINHO = "data/vesting.json";

export interface Cofre {
  endereco: string;
  contrato: boolean;
  /**
   * Fração do supply que ele recebeu direto da emissão, SOMADA ao longo da vida.
   *
   * Pode passar de 1, e passar não é erro: num token de ponte o mesmo endereço
   * recebe emissão toda vez que alguém atravessa, e o supply é queimado do outro
   * lado. Medido: o cofre do BASED soma 202,7% do supply e o do JCT 126,0%. É a
   * mesma assinatura que `cobertura` acima de 1 denuncia, e os dois casos caem no
   * veredito "contínua", onde a página esconde esta tabela justamente porque a
   * conta de alocação não se aplica.
   */
  recebeu: number;
  /** Fração do supply que ele ainda segura. */
  hoje: number;
  /** Ritmo de saída, em pontos percentuais do supply por mês. */
  ritmo: number;
}

export interface Amostra {
  /** Data da amostra, `YYYY-MM-DD`. */
  data: string;
  bloco: number;
  /** Fração do supply somada em todos os cofres nesta data. */
  travado: number;
}

export interface Vesting {
  symbol: string;
  chain: string;
  contrato: string;
  supply: number;
  nascimento: number;
  nasceuEm: string;
  /**
   * Quanto do supply as emissões encontradas explicam.
   *
   * Abaixo de 1 a varredura não achou toda a criação de moeda — ou porque parou
   * antes, ou porque o token não nasce por `mint`. Tudo o que vem depois é
   * parcial, e o veredito diz isso em vez de fingir número.
   */
  cobertura: number;
  faixasPerdidas: number;
  /**
   * O nó de log da rede não guarda a profundidade em que esta moeda nasceu.
   *
   * Fica gravado, e não descartado, porque "não varri ainda" e "não dá para
   * varrer aqui" pedem coisas diferentes: a primeira é uma tarefa, a segunda é
   * um limite. Sem a distinção, o painel manda rodar para sempre um comando que
   * nunca vai devolver nada — na BNB Chain isso valeria para toda moeda anterior
   * a 2025-11-10, que é o horizonte do único endpoint público que serve log.
   */
  semHistorico?: boolean;
  cofres: Cofre[];
  serie: Amostra[];
  /** Fração do supply parada nos cofres hoje. */
  travado: number;
  /** Pontos percentuais do supply que saíram dos cofres na janela medida. */
  liberado: number;
  /** Ritmo agregado, em pontos percentuais do supply por mês. */
  ritmo: number;
  /** Meses até os cofres esvaziarem no ritmo atual. Nulo quando não estão saindo. */
  mesesRestantes: number | null;
  /** Fração do supply nas carteiras de corretora conhecidas, hoje. */
  emCorretora: number;
  /**
   * Supply que existe no contrato e NÃO circula, segundo o circulante publicado.
   *
   * Existe porque a H expôs o furo do resto deste arquivo. O detector achou o
   * mint — um destino, 100% do supply —, viu que aquele endereço já esvaziou, e
   * concluiu "os contratos de alocação já esvaziaram: 0,5% restante neles".
   * Verdade e irrelevante: dos dez bilhões de H, só 1,95 bilhão circula. Os
   * outros OITO BILHÕES saíram do cofre e não chegaram ao mercado.
   *
   * Cofre vazio com float de 19,5% não é moeda livre; é moeda cujo supply parado
   * está num lugar que este método não enxerga — ele segue quem recebeu do
   * endereço zero, e para de seguir no salto seguinte.
   *
   * Nulo quando não há circulante publicado para comparar.
   */
  foraDeCirculacao?: number | null;
  medidoEm: number;
}

export interface Arquivo {
  moedas: Record<string, Vesting>;
}

/**
 * Acima disto o desbloqueio é grande o bastante para atrapalhar, em pp/mês.
 *
 * Meio ponto percentual do supply por mês é o que uma moeda de 25 milhões de
 * capitalização precisa absorver em torno de 125 mil dólares mensais só para
 * ficar parada. O corte não foi calibrado contra retorno — não há amostra — e
 * separa o que a medição mostrou ser diferente: a C solta 1,8 pp/mês e a HEI,
 * nada.
 */
export const RITMO_RELEVANTE = 0.5;

/** Abaixo disto a leitura não achou a emissão toda e não vira veredito. */
export const COBERTURA_MINIMA = 0.9;

/**
 * Acima disto o token não segue modelo de alocação, e a medição não se aplica.
 *
 * A emissão somada não pode passar do supply num token que minta uma vez. Passar
 * quer dizer que ele minta e queima continuamente — ponte, rebase, staking — e
 * aí "quem recebeu do endereço zero" não é cofre de alocação, é quem atravessou
 * a ponte. Medido na HEI: 558 destinos somando 120,7% do supply.
 */
export const COBERTURA_MAXIMA = 1.05;

/**
 * Abaixo disto não sobrou nada nos cofres, e o que saiu é história.
 *
 * Sem esta trava a HEI saía classificada como "emitindo a 3,23 pp/mês" com os
 * cofres a ZERO — a reta media a descida até o fundo e o veredito projetava para
 * frente uma torneira que já fechou. Ritmo sem estoque não é oferta futura.
 */
export const TRAVADO_MINIMO = 0.01;

/** Acima disto sobra supply parado suficiente para um desbloqueio futuro doer. */
export const TRAVADO_ALTO = 0.15;

/**
 * Acima disto o supply parado fora dos cofres é grande demais para chamar de
 * livre.
 *
 * Trinta por cento do supply sem circular é oferta futura por qualquer leitura,
 * e o detector não sabe onde ela está. Medido na H: 80,5%.
 */
export const FORA_DE_CIRCULACAO_ALTA = 0.3;

export type Veredito =
  | "emitindo"
  | "travado"
  | "livre"
  | "parcial"
  | "contínua"
  | "fora do alcance"
  | "sem histórico";

export function veredito(v: Vesting): Veredito {
  if (v.semHistorico) return "sem histórico";
  if (v.cobertura > COBERTURA_MAXIMA) return "contínua";
  if (v.cobertura < COBERTURA_MINIMA || v.serie.length < 2) return "parcial";
  // A ORDEM DAQUI PARA BAIXO É A ORDEM DA FORÇA DA EVIDÊNCIA, e ela importa.
  //
  // 1. Emissão MEDIDA e ativa é o sinal mais forte que existe: eu vi o supply
  //    saindo, mês a mês. Ritmo só vale com estoque atrás dele — cofre vazio não
  //    solta mais nada, por mais inclinada que a reta que o esvaziou tenha sido.
  if (v.ritmo >= RITMO_RELEVANTE && v.travado >= TRAVADO_MINIMO) return "emitindo";

  // 2. Supply que não circula e não está em cofre nenhum vem ANTES de "travado",
  //    e esta ordem é um conserto. A POWER tem 21,8% num cofre parado e 79% do
  //    supply fora de circulação: os outros 57,2% não circulam E não estão em
  //    cofre que eu ache. "Travado" saía primeiro, o ritmo zero passava no teste
  //    do motor, e a moeda ganhava viés de COMPRA com 4/4 motores — enquanto
  //    mais da metade do supply dela está num lugar que eu não sei apontar.
  //
  //    Vinte e um por cento localizado e parado é menos importante do que
  //    cinquenta e sete por cento desaparecido. O que domina é o que não se sabe.
  //
  // `!= null` e não `!== null`: os registros gravados antes deste campo existir
  // trazem `undefined`, e as duas ausências têm de cair do mesmo lado.
  if (v.foraDeCirculacao != null && v.foraDeCirculacao >= FORA_DE_CIRCULACAO_ALTA) {
    return "fora do alcance";
  }

  // 3. Cofre grande e parado, com o resto do supply circulando: oferta que não
  //    existe hoje e pode existir amanhã.
  if (v.travado >= TRAVADO_ALTO) return "travado";

  return "livre";
}

export function textoVeredito(v: Vesting): string {
  const pct = (f: number) => `${(f * 100).toFixed(1)}%`;
  switch (veredito(v)) {
    case "sem histórico":
      return (
        `o nó de log da ${v.chain} não guarda ${v.nasceuEm.slice(0, 10)}, quando esta moeda ` +
        `nasceu — a emissão não é varrível aqui, e insistir não muda isso`
      );
    case "contínua":
      return (
        `este token minta continuamente: ${v.cofres.length}+ destinos receberam do endereço zero ` +
        `somando ${pct(v.cobertura)} do supply. É ponte ou rebase, não alocação — quem recebeu do ` +
        `zero aqui atravessou a ponte, e a conta de cofre esvaziando não se aplica`
      );
    case "parcial":
      return `leitura parcial: a varredura explicou ${pct(v.cobertura)} do supply`;
    case "emitindo": {
      const meses = v.mesesRestantes;
      const prazo =
        meses === null
          ? ""
          : meses > 60
            ? ", e nesse ritmo leva mais de cinco anos para acabar"
            : `, e nesse ritmo acaba em ${Math.round(meses)} meses`;
      return (
        `${pct(v.travado)} do supply ainda está em contrato de alocação e sai a ` +
        `${v.ritmo.toFixed(2)} pp por mês${prazo}`
      );
    }
    case "travado":
      // Ritmo negativo é o cofre ENCHENDO, e chamar isso de "não se moveu" seria
      // errado no sentido que mais importa: supply saindo de circulação para
      // dentro de um contrato é o oposto de oferta chegando. Medido na VVV, que
      // guarda 49% do supply e recolhe 0,47 pp por mês.
      return v.ritmo <= -0.1
        ? `${pct(v.travado)} do supply está em contrato de alocação, e o saldo dele CRESCE ` +
            `${Math.abs(v.ritmo).toFixed(2)} pp por mês — está recolhendo oferta, não soltando`
        : `${pct(v.travado)} do supply está parado em contrato de alocação e não se ` +
            `moveu na janela medida — oferta que não existe hoje e pode existir amanhã`;
    case "fora do alcance": {
      const perdido = (v.foraDeCirculacao ?? 0) - v.travado;
      return (
        `${pct(v.foraDeCirculacao ?? 0)} do supply NÃO CIRCULA, e ${pct(perdido)} dele não está em ` +
        `contrato de alocação nenhum que eu ache — só ${pct(v.travado)} está. Esse pedaço saiu da ` +
        `alocação e não chegou ao mercado, e este método não segue além do primeiro salto: ele acha ` +
        `quem recebeu do endereço zero, não quem recebeu depois. Não dá para dizer se vira oferta`
      );
    }
    case "livre":
      return `os contratos de alocação já esvaziaram: ${pct(v.travado)} do supply restante neles`;
  }
}

let cache: Arquivo | null = null;

/** O arquivo gravado por `npm run vesting`. Vazio quando ele nunca rodou. */
export async function lerVesting(): Promise<Arquivo> {
  if (cache) return cache;
  try {
    const dado = JSON.parse(await readFile(CAMINHO, "utf8")) as Arquivo;
    cache = dado?.moedas ? dado : { moedas: {} };
  } catch {
    cache = { moedas: {} };
  }
  return cache;
}

export async function vestingDe(symbol: string): Promise<Vesting | null> {
  const arquivo = await lerVesting();
  return arquivo.moedas[symbol] ?? null;
}

/**
 * Só o ritmo, ou nulo quando a medição não sustenta número.
 *
 * O `ritmo` bruto é ZERO tanto numa moeda sem emissão nenhuma quanto numa que
 * não deu para varrer, e as duas coisas viram vereditos opostos no motor: a
 * primeira passa no teste, a segunda não pode ser testada. Ler o campo direto
 * apagava essa diferença.
 */
export async function ritmoDe(symbol: string): Promise<number | null> {
  const v = await vestingDe(symbol);
  if (!v) return null;
  const q = veredito(v);
  // "fora do alcance" entra aqui com os outros não-medidos, e é o ponto todo da
  // mudança: antes ele saía como "livre" e virava ZERO, que o motor lê como
  // aprovado no teste de emissão. Uma moeda com 80% do supply fora de circulação
  // passando no teste de oferta futura é o mesmo falso positivo da concentração
  // que este projeto já pagou uma vez.
  if (q === "sem histórico" || q === "parcial" || q === "contínua" || q === "fora do alcance") {
    return null;
  }
  // Cofre vazio não tem oferta futura, e o ritmo que o esvaziou é passado. O
  // motor precisa de zero aqui, não da inclinação da descida.
  return v.travado >= TRAVADO_MINIMO ? v.ritmo : 0;
}

/**
 * O ritmo de saída em pp do supply por mês, por mínimos quadrados sobre a série.
 *
 * A conta ingênua — primeiro menos último, dividido pelos meses — depende
 * inteiramente das duas pontas, e uma delas caindo numa semana de desbloqueio
 * grande inventa tendência onde não há. A reta usa todas as amostras.
 */
export function ritmoMensal(serie: { data: string; travado: number }[]): number {
  // Ponto com data ilegível ou saldo não numérico envenena a reta inteira: um
  // `NaN` em `xs` faz a média virar NaN e o ritmo sai NaN, que segue para o
  // motor e para a tela sem parecer errado. Descartar é o certo — a série tem
  // sete pontos e perder um ainda deixa reta.
  const limpa = serie.filter(
    (a) => Number.isFinite(Date.parse(a.data)) && Number.isFinite(a.travado),
  );
  if (limpa.length < 2) return 0;
  const t0 = Date.parse(limpa[0].data);
  const MES = 30 * 24 * 3600 * 1000;
  const xs = limpa.map((a) => (Date.parse(a.data) - t0) / MES);
  const ys = limpa.map((a) => a.travado * 100);
  const n = xs.length;
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  if (den === 0 || !Number.isFinite(num) || !Number.isFinite(den)) return 0;
  // Sinal invertido de propósito: a reta desce quando o cofre esvazia, e o que
  // se lê no painel é "quanto SAI por mês", que é um número positivo.
  return -(num / den);
}
