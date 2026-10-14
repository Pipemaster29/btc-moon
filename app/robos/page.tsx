import RobosAoVivo from "@/components/RobosAoVivo";
import { getCarteira } from "@/lib/carteira";
import { getMedicaoRobos, getRobos } from "@/lib/robos";

// O estado dos robôs muda quando o workflow roda; a marcação de agora vem do
// navegador, pelo WebSocket da Binance, e não depende desta régua.
export const revalidate = 300;

export default async function RobosAgora() {
  const [robos, medicao, carteira] = await Promise.all([
    getRobos().catch(() => null),
    getMedicaoRobos().catch(() => null),
    getCarteira().catch(() => null),
  ]);
  // Dos ~300 KB da medição, o ao vivo só usa a curva de cada robô (a faixa
  // medida de cada cartão): o resto não precisa viajar até o navegador.
  const medidas = (medicao?.robos ?? []).map((m) => ({ id: m.id, curva: m.curva }));
  return <RobosAoVivo arquivo={robos} medidas={medidas} carteira={carteira?.curva} />;
}
