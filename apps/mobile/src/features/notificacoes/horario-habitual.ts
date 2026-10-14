// RF25: "horário habitual" de um trajeto, derivado do registro LOCAL de uso (uso-trajetos.ts:
// instantes em que a pessoa abriu o briefing). Funções puras, com `agora` explícito.
// Regra: usos dos últimos 14 dias em dias úteis; acha o horário com mais usos a até ±60 min
// (ida e volta do mesmo trajeto não se misturam numa mediana sem sentido) e devolve a mediana
// desse grupo, arredondada a 5 min. Menos de 3 usos no grupo → null (a pessoa escolhe o horário).
// O fuso é o do aparelho (o app é só para São Paulo).

export type Horario = { hora: number; minuto: number };

export const JANELA_DIAS = 14;
export const MIN_USOS = 3;
/** O lembrete toca este tanto antes do horário habitual. */
export const ANTECEDENCIA_MIN = 10;
const RAIO_GRUPO_MIN = 60;
const DIA_MS = 24 * 3_600_000;

const minutosDoDia = (d: Date) => d.getHours() * 60 + d.getMinutes();

function deMinutos(total: number): Horario {
  const m = ((Math.round(total) % 1440) + 1440) % 1440;
  return { hora: Math.floor(m / 60), minuto: m % 60 };
}

export function horarioHabitual(instantes: readonly number[], agora: number): Horario | null {
  const minutos = instantes
    .filter((t) => t <= agora && t > agora - JANELA_DIAS * DIA_MS)
    .map((t) => new Date(t))
    .filter((d) => d.getDay() >= 1 && d.getDay() <= 5)
    .map(minutosDoDia)
    .sort((a, b) => a - b);
  let grupo: number[] = [];
  for (const centro of minutos) {
    const vizinhos = minutos.filter((m) => Math.abs(m - centro) <= RAIO_GRUPO_MIN);
    if (vizinhos.length > grupo.length) grupo = vizinhos;
  }
  if (grupo.length < MIN_USOS) return null;
  const meio = grupo.length / 2;
  const mediana = grupo.length % 2 ? grupo[Math.floor(meio)] : (grupo[meio - 1] + grupo[meio]) / 2;
  return deMinutos(Math.round(mediana / 5) * 5);
}

/** `h` deslocado em `delta` minutos, dando a volta na meia-noite. */
export function somarMinutos(h: Horario, delta: number): Horario {
  return deMinutos(h.hora * 60 + h.minuto + delta);
}

export function formatarHorario({ hora, minuto }: Horario): string {
  return `${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}`;
}
