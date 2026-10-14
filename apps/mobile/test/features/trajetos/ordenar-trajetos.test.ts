// Hierarquia dos trajetos: favoritos primeiro; depois frecência (decaimento de 14 dias) com
// afinidade de horário e tipo de dia; desempate por uso mais recente e ordem de cadastro.
import {
  afinidadeHorario,
  distanciaHorario,
  motivoDestaque,
  ordenarTrajetos,
  pontuacao,
} from '@/features/trajetos/ordenar-trajetos';
import type { TrajetoSalvo } from '@/features/trajetos/trajeto-store';

const DIA = 24 * 3_600_000;
/** Terça-feira, 13/10/2026, horário de São Paulo. */
const em = (hhmm: string, dia = '2026-10-13') => Date.parse(`${dia}T${hhmm}:00-03:00`);

const tr = (id: string, extra: Partial<TrajetoSalvo> = {}): TrajetoSalvo => ({
  id,
  nome: id,
  criadoEm: '2026-10-01T08:00:00-03:00',
  atualizadoEm: '2026-10-01T08:00:00-03:00',
  favorito: false,
  trajeto: {
    origem: { lat: -23.56, lon: -46.65, rotulo: 'A' },
    destino: { lat: -23.55, lon: -46.63, rotulo: 'B' },
    onibus: [],
    trilhos: [],
  },
  ...extra,
});

/** n usos às `hhmm`, um por dia útil anterior a 13/10 (seg 12, sex 9, qui 8…). */
function diasUteisAs(hhmm: string, n: number): number[] {
  const dias = ['2026-10-12', '2026-10-09', '2026-10-08', '2026-10-07', '2026-10-06', '2026-10-05', '2026-10-02', '2026-10-01', '2026-09-30', '2026-09-29'];
  return dias.slice(0, n).map((d) => em(hhmm, d));
}

const ids = (l: TrajetoSalvo[]) => l.map((t) => t.id);

describe('afinidade de horário', () => {
  it('distância circular no relógio de SP (23:30 × 00:30 = 60 min)', () => {
    expect(distanciaHorario(em('23:30'), em('00:30', '2026-10-14'))).toBe(60);
    expect(distanciaHorario(em('07:00'), em('19:00'))).toBe(720);
  });

  it('plena até 60 min, cai a zero em 3 h; outro tipo de dia vale metade', () => {
    const agora = em('07:30');
    expect(afinidadeHorario(em('08:30', '2026-10-12'), agora)).toBe(1);
    expect(afinidadeHorario(em('09:30', '2026-10-12'), agora)).toBeCloseTo(0.5);
    expect(afinidadeHorario(em('10:30', '2026-10-12'), agora)).toBe(0);
    expect(afinidadeHorario(em('07:30', '2026-10-11'), agora)).toBe(0.5); // domingo
  });

  it('pontuação decai com meia-vida de 14 dias', () => {
    const agora = em('07:30');
    const hoje = pontuacao([agora], agora);
    expect(pontuacao([agora - 14 * DIA], agora)).toBeCloseTo(hoje / 2);
    expect(pontuacao(undefined, agora)).toBe(0);
  });
});

describe('ordenarTrajetos', () => {
  it('sem favoritos nem uso: mantém a ordem de cadastro (estável)', () => {
    const lista = [tr('a'), tr('b'), tr('c')];
    expect(ids(ordenarTrajetos(lista, {}, em('07:30')))).toEqual(['a', 'b', 'c']);
  });

  it('favoritos primeiro, mesmo com menos uso; o resto segue a pontuação', () => {
    const lista = [tr('a'), tr('b', { favorito: true }), tr('c')];
    const uso = { a: diasUteisAs('07:30', 5), c: diasUteisAs('07:30', 8) };
    expect(ids(ordenarTrajetos(lista, uso, em('07:30')))).toEqual(['b', 'c', 'a']);
  });

  it('pendular: às 7h sobe Casa → Trabalho; às 18h sobe Trabalho → Casa, mesmo sendo o menos usado no total', () => {
    const ida = tr('ida');
    const volta = tr('volta');
    const uso = { ida: diasUteisAs('07:15', 10), volta: diasUteisAs('18:10', 4) };
    expect(ids(ordenarTrajetos([ida, volta], uso, em('07:00')))).toEqual(['ida', 'volta']);
    expect(ids(ordenarTrajetos([ida, volta], uso, em('18:00')))).toEqual(['volta', 'ida']);
  });

  it('frequência sem recência perde: hábito antigo (60 dias) não vence o atual', () => {
    const antigo = Array.from({ length: 10 }, (_, i) => em('07:30') - (60 + i) * DIA);
    const uso = { velho: antigo, novo: diasUteisAs('07:30', 3) };
    expect(ids(ordenarTrajetos([tr('velho'), tr('novo')], uso, em('07:30')))).toEqual(['novo', 'velho']);
  });

  it('empate de pontuação → o usado mais recentemente; depois a ordem de cadastro', () => {
    const agora = em('12:00');
    expect(ids(ordenarTrajetos([tr('x'), tr('y')], { x: [], y: [] }, agora))).toEqual(['x', 'y']);
    // Mesmo instante de uso, pontuação idêntica → ordem de cadastro.
    const mesmo = agora - DIA;
    expect(ids(ordenarTrajetos([tr('x'), tr('y')], { x: [mesmo], y: [mesmo] }, agora))).toEqual(['x', 'y']);
    // O uso mais novo pesa mais (decaimento) e também desempata.
    const uso = { x: [agora - 2 * DIA], y: [agora - DIA] };
    expect(ids(ordenarTrajetos([tr('x'), tr('y')], uso, agora))).toEqual(['y', 'x']);
  });

  it('não altera a lista recebida', () => {
    const lista = [tr('a'), tr('b', { favorito: true })];
    ordenarTrajetos(lista, {}, em('07:30'));
    expect(ids(lista)).toEqual(['a', 'b']);
  });
});

describe('motivoDestaque', () => {
  const agora = em('07:30');
  it('fixado > hábito no horário > favorito > uso recente > primeiro da lista', () => {
    expect(motivoDestaque(tr('a', { principal: true }), {}, agora).tipo).toBe('fixado');
    expect(motivoDestaque(tr('a'), { a: diasUteisAs('07:40', 3) }, agora)).toEqual({
      tipo: 'habito',
      texto: 'Sugerido agora: você costuma abri-lo neste horário',
    });
    expect(motivoDestaque(tr('a', { favorito: true }), {}, agora)).toEqual({
      tipo: 'favorito',
      texto: 'Primeiro dos seus favoritos',
    });
    expect(motivoDestaque(tr('a', { favorito: true }), { a: diasUteisAs('15:00', 2) }, agora).texto).toBe(
      'Sugerido agora: seu favorito mais usado'
    );
    expect(motivoDestaque(tr('a'), { a: diasUteisAs('15:00', 1) }, agora).tipo).toBe('frequente');
    expect(motivoDestaque(tr('a'), {}, agora).tipo).toBe('lista');
  });

  it('um uso só no horário ainda não é hábito', () => {
    expect(motivoDestaque(tr('a'), { a: diasUteisAs('07:30', 1) }, agora).tipo).toBe('frequente');
  });
});
