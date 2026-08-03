import { loja } from "@/config/loja";

const FUSO = "America/Bahia";
const INDICE_DIA_SEMANA = [6, 0, 1, 2, 3, 4, 5]; // Date#getDay() (dom=0) -> índice em loja.horarios (seg=0)

function horaAtualEm(fuso: string, data: Date): { diaSemana: number; minutos: number } {
  const partes = new Intl.DateTimeFormat("en-US", {
    timeZone: fuso,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(data);

  const mapa = Object.fromEntries(partes.map((p) => [p.type, p.value]));
  const diasSemana: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const diaSemana = diasSemana[mapa.weekday] ?? 0;
  const [h, m] = [Number(mapa.hour), Number(mapa.minute)];
  return { diaSemana, minutos: h * 60 + m };
}

function paraMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** Horário de hoje (fuso de Salvador/BA), independente do fuso do servidor. */
export function horarioDeHoje(data = new Date()) {
  const { diaSemana } = horaAtualEm(FUSO, data);
  return loja.horarios[INDICE_DIA_SEMANA[diaSemana]];
}

/** true se a farmácia está aberta agora, considerando o horário de Salvador/BA. */
export function estaAberta(data = new Date()): boolean {
  const { diaSemana, minutos } = horaAtualEm(FUSO, data);
  const horario = loja.horarios[INDICE_DIA_SEMANA[diaSemana]];
  return minutos >= paraMinutos(horario.abertura) && minutos < paraMinutos(horario.fechamento);
}
