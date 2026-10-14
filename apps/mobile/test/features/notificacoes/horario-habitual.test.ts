// RF25: horário habitual = mediana do grupo de usos mais denso (±60 min) nos dias úteis dos últimos 14 dias.
import { formatarHorario, horarioHabitual, somarMinutos } from '@/features/notificacoes/horario-habitual';

// Datas no fuso local (o mesmo que a função usa). 14/10/2026 é quarta-feira.
const em = (dia: number, h: number, m: number) => new Date(2026, 9, dia, h, m).getTime();
const AGORA = em(14, 12, 0);

describe('horarioHabitual', () => {
  it('mediana dos usos de manhã em dias úteis; ignora a volta, fim de semana e uso antigo', () => {
    const usos = [
      em(12, 7, 50), // seg
      em(13, 7, 55), // ter
      em(14, 7, 45), // qua
      em(12, 18, 0), // volta: outro grupo, menor
      em(13, 18, 10),
      em(10, 7, 0), // sábado
      em(11, 7, 0), // domingo
      em(10, 7, 5),
      new Date(2026, 8, 20, 7, 0).getTime(), // 24 dias atrás
    ];
    expect(horarioHabitual(usos, AGORA)).toEqual({ hora: 7, minuto: 50 });
  });

  it('menos de 3 usos no grupo → null (a pessoa escolhe o horário)', () => {
    expect(horarioHabitual([em(12, 7, 50), em(13, 7, 55)], AGORA)).toBeNull();
    expect(horarioHabitual([em(12, 7, 0), em(13, 12, 0), em(14, 11, 0)], AGORA)).toBeNull();
    expect(horarioHabitual([], AGORA)).toBeNull();
  });

  it('arredonda a 5 min (número par de usos usa a média dos dois do meio)', () => {
    expect(horarioHabitual([em(12, 8, 1), em(13, 8, 2), em(14, 8, 9), em(9, 8, 11)], AGORA)).toEqual({
      hora: 8,
      minuto: 5,
    });
  });
});

describe('somarMinutos / formatarHorario', () => {
  it('dá a volta na meia-noite e formata com dois dígitos', () => {
    expect(somarMinutos({ hora: 0, minuto: 5 }, -10)).toEqual({ hora: 23, minuto: 55 });
    expect(somarMinutos({ hora: 23, minuto: 30 }, 60)).toEqual({ hora: 0, minuto: 30 });
    expect(formatarHorario({ hora: 7, minuto: 5 })).toBe('07:05');
  });
});
