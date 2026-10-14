import { describe, expect, it } from 'vitest';
import { BusLinesResponseSchema, BusStopsResponseSchema } from '@kairos/contracts';
import {
  OlhoVivoBuscaLinhasAdapter,
  OlhoVivoBuscaParadasAdapter,
  mapearLinhas,
  mapearParadas,
} from '../../../src/providers/transit/olhovivo-busca.adapter.js';
import { OlhoVivoLinhasSchema, OlhoVivoParadasSchema } from '../../../src/providers/transit/olhovivo.schemas.js';
import { clienteFalso, fakeOlhoVivo, fixture } from './olhovivo-fake.js';

const ctx = () => ({ signal: new AbortController().signal });

describe('busca de linhas e paradas do Olho Vivo (T18, RF02)', () => {
  it('mapearLinhas: fixture "875A" → dois sentidos com letreiro completo', () => {
    const resposta = mapearLinhas(OlhoVivoLinhasSchema.parse(fixture('fixture-linhas.json')));

    expect(BusLinesResponseSchema.parse(resposta).linhas).toEqual([
      { codigoLinha: 609, letreiro: '875A-10', sentido: 1, terminalPrincipal: 'PERDIZES', terminalSecundario: 'AEROPORTO' },
      { codigoLinha: 33377, letreiro: '875A-10', sentido: 2, terminalPrincipal: 'PERDIZES', terminalSecundario: 'AEROPORTO' },
    ]);
  });

  it('mapearParadas: fixture da linha 609 → 6 paradas com lat/lon e endereço', () => {
    const resposta = BusStopsResponseSchema.parse(mapearParadas(OlhoVivoParadasSchema.parse(fixture('fixture-paradas.json'))));

    expect(resposta.paradas).toHaveLength(6);
    expect(resposta.paradas).toContainEqual({
      codigoParada: 260016861,
      nome: 'CAIO PRADO B/C',
      endereco: 'R MARQUES DE PARANAGUA/ R MARIA ANTONIA',
      lat: -23.548174,
      lon: -46.649565,
    });
  });

  it('mapearParadas: endereço vazio ou ausente → null', () => {
    const resposta = mapearParadas([
      { cp: 1, np: 'A', ed: '  ', py: -23.5, px: -46.6 },
      { cp: 2, np: 'B', py: -23.5, px: -46.6 },
    ]);
    expect(resposta.paradas.map((p) => p.endereco)).toEqual([null, null]);
  });

  it('adaptadores chamam /Linha/Buscar e /Parada/BuscarParadasPorLinha com os parâmetros codificados', async () => {
    const fake = fakeOlhoVivo();
    const client = clienteFalso(fake);
    const linhas = new OlhoVivoBuscaLinhasAdapter(client);
    const paradas = new OlhoVivoBuscaParadasAdapter(client);

    await linhas.fetch(' Term. Lapa ', ctx());
    await paradas.fetch(609, ctx());

    const [busca] = fake.chamadasA('/Linha/Buscar');
    expect(new URL(busca!.url).searchParams.get('termosBusca')).toBe('Term. Lapa');
    const [porLinha] = fake.chamadasA('/Parada/BuscarParadasPorLinha');
    expect(new URL(porLinha!.url).searchParams.get('codigoLinha')).toBe('609');
    expect(linhas.cacheKey(' 875a ')).toBe(linhas.cacheKey('875A'));
    expect(linhas.source).toBe('sptrans-olhovivo');
  });
});
