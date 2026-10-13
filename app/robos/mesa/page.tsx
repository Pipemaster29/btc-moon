import MesaAoVivo from "@/components/MesaAoVivo";
import { getMedicaoRobos, getRobos } from "@/lib/robos";

export const revalidate = 300;

export const metadata = { title: "BTC Moon · Robôs · Mesa de risco" };

export default async function RobosMesa() {
  const [robos, medicao] = await Promise.all([getRobos().catch(() => null), getMedicaoRobos().catch(() => null)]);
  return <MesaAoVivo arquivo={robos} medicao={medicao} />;
}
