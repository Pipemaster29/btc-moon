import RobosMedidos from "@/components/RobosMedidos";
import { getMedicaoRobos, getRobos } from "@/lib/robos";

export const revalidate = 300;

export const metadata = { title: "BTC Moon · Robôs · Medição" };

export default async function RobosMedicao() {
  const [robos, medicao] = await Promise.all([getRobos().catch(() => null), getMedicaoRobos().catch(() => null)]);
  return <RobosMedidos arquivo={robos} medicao={medicao} />;
}
