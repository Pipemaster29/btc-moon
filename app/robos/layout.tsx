import { SubAbas } from "@/components/Abas";
import { Cabeca, Pagina } from "@/components/Pagina";
import { usd } from "@/components/robosFormato";
import { CAPITAL_ROBO } from "@/lib/robos";

export const metadata = {
  title: "BTC Moon · Robôs",
  description: "Carteiras fictícias que operam qualquer perpétuo da Binance com uma regra medida, ao vivo e desde 01/2024.",
};

/**
 * A aba ROBÔS, em três partes: o que eles têm agora, como teriam ido desde
 * 01/2024 e o que um fundo perguntaria antes de pôr dinheiro. Na página única
 * eram um painel só, com a medição e a mesa de risco entre os cartões e as
 * posições; aqui cada parte é uma rota, e o cabeçalho — o que os robôs são —
 * vale para as três.
 */
export default function LayoutRobos({ children }: { children: React.ReactNode }) {
  return (
    <Pagina>
      <Cabeca titulo="Robôs">
        <p className="text-black/60 dark:text-white/60 max-w-4xl">
          {/* Curto de propósito: o cabeçalho se repete nas três partes, e a regra
              de cada robô está no cartão dele e na Medição. */}
          Carteiras fictícias de {usd(CAPITAL_ROBO, 0)} que <strong>não seguem o radar</strong>: operam qualquer perpétuo
          da Binance com uma regra escolhida depois de medir dezenas de ideias em 676 perpétuos — os 152 deslistados
          inclusive — de 01/2024 a 09/2026. Três seguem o <strong>momento dos dois lados</strong>; o <strong>Fluxo</strong>{" "}
          vende onde a venda a mercado domina, contra ETH. Não é recomendação: é a medição continuando ao vivo.
        </p>
        <div className="pt-2">
          <SubAbas
            abas={[
              { segmento: null, href: "/robos", rotulo: "Ao vivo" },
              { segmento: "medicao", href: "/robos/medicao", rotulo: "Medição" },
              { segmento: "mesa", href: "/robos/mesa", rotulo: "Mesa de risco" },
            ]}
          />
        </div>
      </Cabeca>
      {children}
    </Pagina>
  );
}
