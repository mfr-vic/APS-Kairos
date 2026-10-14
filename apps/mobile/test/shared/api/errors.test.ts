// T14 / C.5: erros da API viram mensagem em pt-BR a partir do `title` do Problem Details.
import problema400 from '../../../../../packages/contracts/examples/problem-400.json';

import { ApiError, erroDeResposta } from '@/shared/api/errors';

describe('Problem Details → mensagem pt-BR', () => {
  it('usa o title e não repete 4xx', async () => {
    const res = new Response(JSON.stringify(problema400), {
      status: 400,
      headers: { 'Content-Type': 'application/problem+json' },
    });
    const e = await erroDeResposta(res);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.message).toBe('Entrada inválida');
    expect(e.valeRepetir).toBe(false);
  });

  it('5xx sem corpo → mensagem genérica, pode repetir', async () => {
    const e = await erroDeResposta(new Response('<html>', { status: 502 }));
    expect(e.message).toMatch(/HTTP 502/);
    expect(e.valeRepetir).toBe(true);
  });
});
