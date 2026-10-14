import { formatarEntrada, horaComSegundosSP, tamanho } from '@/features/registro/formatar-entrada';
import type { EntradaRegistro } from '@/shared/api/registro';

const e = (x: Partial<EntradaRegistro>): EntradaRegistro => ({
  id: 1,
  em: 0,
  metodo: 'POST',
  rota: '/v1/briefings',
  status: 200,
  erro: null,
  latenciaMs: 1083,
  bytes: 4200,
  degradadas: null,
  ...x,
});

describe('formatarEntrada', () => {
  it('hora com segundos em São Paulo (UTC−3)', () => {
    expect(horaComSegundosSP(Date.parse('2026-10-13T21:59:31Z'))).toBe('18:59:31');
  });

  it('tamanho em B e kB', () => {
    expect(tamanho(812)).toBe('812 B');
    expect(tamanho(4200)).toBe('4,1 kB');
  });

  it('sucesso com dimensões degradadas', () => {
    expect(formatarEntrada(e({ degradadas: { stale: ['air'], unavailable: ['bus', 'rail'] } }))).toEqual({
      titulo: 'POST /v1/briefings · HTTP 200',
      detalhe: '1083 ms · 4,1 kB · desatualizado: qualidade do ar · indisponível: ônibus, trilhos',
    });
    expect(formatarEntrada(e({ degradadas: { stale: [], unavailable: [] } })).detalhe).toMatch(
      /todas as dimensões atuais$/
    );
  });

  it('falhas: sem status (rede/prazo) e contrato com status', () => {
    expect(formatarEntrada(e({ status: null, erro: 'tempo-esgotado', bytes: null })).titulo).toBe(
      'POST /v1/briefings · tempo esgotado'
    );
    expect(formatarEntrada(e({ erro: 'contrato' })).titulo).toBe('POST /v1/briefings · HTTP 200 · fora do contrato');
    expect(formatarEntrada(e({ status: 503, erro: 'http' })).titulo).toBe('POST /v1/briefings · HTTP 503');
  });
});
