import { describe, expect, it } from 'vitest';
import { descreverConexao, lerConfigDb } from '../../../src/modules/flood-risk/db.js';

describe('lerConfigDb', () => {
  it('usa os padrões do docker-compose quando DB_* não está definido', () => {
    expect(lerConfigDb({})).toEqual({
      host: '127.0.0.1',
      port: 5432,
      user: 'kairos',
      password: undefined,
      database: 'kairos',
    });
  });

  it('lê DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME', () => {
    const c = lerConfigDb({ DB_HOST: 'db', DB_PORT: '6543', DB_USER: 'u', DB_PASSWORD: 'segredo', DB_NAME: 'n' });
    expect(c).toEqual({ host: 'db', port: 6543, user: 'u', password: 'segredo', database: 'n' });
  });

  it('rejeita porta inválida', () => {
    expect(() => lerConfigDb({ DB_PORT: 'abc' })).toThrow(/DB_PORT/);
  });

  it('a descrição para log não inclui a senha', () => {
    const texto = descreverConexao(lerConfigDb({ DB_PASSWORD: 'segredo' }));
    expect(texto).toBe('postgres://kairos@127.0.0.1:5432/kairos');
    expect(texto).not.toContain('segredo');
  });
});
