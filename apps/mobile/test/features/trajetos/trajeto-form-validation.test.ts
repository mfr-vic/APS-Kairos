// T13 / TC22: validação do formulário de trajeto, com mensagens em pt-BR.
import { FORMULARIO_VAZIO, validarFormulario } from '@/features/trajetos/trajeto-form-validation';

describe('TC22 (lógica): validação do formulário', () => {
  it('nome vazio e sem destino → erros, não salva', () => {
    const r = validarFormulario({
      ...FORMULARIO_VAZIO,
      origem: { rotulo: '', lat: '-23.5', lon: '-46.6' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erros.nome).toBe('Dê um nome ao trajeto.');
      expect(r.erros['destino.lat']).toBe('Informe a latitude do destino.');
    }
  });

  it('aceita vírgula decimal e valida faixa e número', () => {
    const r = validarFormulario({
      ...FORMULARIO_VAZIO,
      nome: 'T',
      origem: { rotulo: '', lat: '-23,5', lon: '-46,6' },
      destino: { rotulo: 'Sé', lat: '95', lon: 'abc' },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.erros['origem.lat']).toBeUndefined();
      expect(r.erros['destino.lat']).toBe('Latitude do destino deve estar entre -90 e 90.');
      expect(r.erros['destino.lon']).toMatch(/deve ser um número/);
    }
  });

  it('válido → dados do trajeto com rótulos padrão', () => {
    const r = validarFormulario({
      ...FORMULARIO_VAZIO,
      nome: ' T ',
      origem: { rotulo: '', lat: '-23.5', lon: '-46.6' },
      destino: { rotulo: 'Sé', lat: '-23.55', lon: '-46.63' },
      trilhos: ['L1'],
    });
    expect(r).toMatchObject({
      ok: true,
      dados: {
        nome: 'T',
        trajeto: {
          origem: { rotulo: 'Origem', lat: -23.5 },
          destino: { rotulo: 'Sé' },
          trilhos: ['L1'],
        },
      },
    });
  });
});
