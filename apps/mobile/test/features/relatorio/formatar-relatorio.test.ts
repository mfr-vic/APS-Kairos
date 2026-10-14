// RF26: formatação dos números do relatório.
import {
  diaCurto,
  porcentagem,
  resumoDoDia,
  tomDaDisponibilidade,
  totalDoDia,
} from '@/features/relatorio/formatar-relatorio';

const dia = { dia: '2026-10-14', FAVORAVEL: 2, ATENCAO: 0, AGUARDAR: 2, INDETERMINADO: 1 };

describe('formatar-relatorio', () => {
  it('dia, total e resumo legível', () => {
    expect(diaCurto('2026-10-04')).toBe('04/10');
    expect(totalDoDia(dia)).toBe(5);
    expect(resumoDoDia(dia)).toBe('14/10: 2 Favorável, 2 Aguardar, 1 Indeterminado');
    expect(resumoDoDia({ ...dia, FAVORAVEL: 0, AGUARDAR: 0, INDETERMINADO: 0 })).toBe('14/10: nenhum briefing');
  });

  it('porcentagem com vírgula e sem consultas', () => {
    expect(porcentagem(100)).toBe('100%');
    expect(porcentagem(99.53)).toBe('99,5%');
    expect(porcentagem(null)).toBe('sem consultas');
  });

  it('tom da barra por faixa', () => {
    expect(tomDaDisponibilidade(99)).toBe('ok');
    expect(tomDaDisponibilidade(95)).toBe('atencao');
    expect(tomDaDisponibilidade(75)).toBe('erro');
    expect(tomDaDisponibilidade(null)).toBe('neutro');
  });
});
