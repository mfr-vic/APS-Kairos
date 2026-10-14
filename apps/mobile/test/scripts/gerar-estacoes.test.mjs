// Funções puras de scripts/gerar-estacoes.mjs. O script é ESM do Node (importa .ts e usa
// import.meta), então este teste roda no test runner do Node, não no Jest:
//   node --no-warnings --test test/scripts/gerar-estacoes.test.mjs   (de apps/mobile)
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  casarEstacao,
  conferirOrdem,
  extrairEstacoesMetro,
  feicoesDeEstacao,
} from '../../scripts/gerar-estacoes.mjs';

describe('extrairEstacoesMetro', () => {
  it('lê cada bloco do acordeão pela linha do cabeçalho (integração aponta para outra linha)', () => {
    const html = `
      <div class="accordion-item linha-azul"><button>Linha 1-<strong>Azul</strong></button>
        <ul><li><a href="/sua-viagem/linhas-estacoes/linha-1-azul/estacao-paraiso">Paraíso</a></li>
        <li><a href="/sua-viagem/linhas-estacoes/linha-1-azul/estacao-jardim-sao-paulo">Jardim São Paulo-Ayrton
            Senna</a>
        </li></ul></div>
      <div class="accordion-item linha-verde"><button>Linha 2-<strong>Verde</strong></button>
        <ul><li><a href="/sua-viagem/linhas-estacoes/linha-2-verde/estacao-x">Santos-Imigrantes</a></li>
        <li><a href="/sua-viagem/linhas-estacoes/linha-1-azul/estacao-paraiso">Paraíso</a></li></ul></div>`;
    assert.deepEqual(extrairEstacoesMetro(html), {
      1: ['Paraíso', 'Jardim São Paulo-Ayrton Senna'],
      2: ['Santos-Imigrantes', 'Paraíso'],
    });
  });
});

describe('casarEstacao', () => {
  const f = (nome) => ({ nome, coordenada: { lat: 0, lon: 0 } });
  const linha = [
    f('PENHA'),
    f('VILA MATILDE'),
    f('AYRTON SENNA-JARDIM SÃO PAULO'),
    f('DOMINGOS DE MORAIS'),
  ];

  it('exato após normalizar', () => {
    assert.equal(casarEstacao('Vila Matilde', linha).casamento, 'exato');
  });
  it('nome com patrocínio contém todas as palavras do GeoSampa', () => {
    const r = casarEstacao('Penha-Lojas Besni', linha);
    assert.equal(r.feicao.nome, 'PENHA');
    assert.equal(r.casamento, 'palavras');
    assert.equal(
      casarEstacao('Jardim São Paulo-Ayrton Senna', linha).feicao.nome,
      'AYRTON SENNA-JARDIM SÃO PAULO'
    );
  });
  it('alias conferido', () => {
    assert.equal(casarEstacao('Domingos de Moraes', linha).casamento, 'alias');
  });
  it('sem candidato (ou ambíguo): null, nunca chuta', () => {
    assert.equal(casarEstacao('Tatuapé', linha), null);
    assert.equal(casarEstacao('Penha-Vila Matilde', linha), null); // PENHA e VILA MATILDE servem
  });
});

describe('feicoesDeEstacao', () => {
  const ponto = (nome, lon, linha = 1) => ({
    properties: {
      nm_estacao_metro_trem: nome,
      cd_identificador_linha: linha,
      nm_linha_metro_trem: 'AZUL',
    },
    geometry: { coordinates: [lon, -23.5] },
  });
  it('remove duplicata no mesmo lugar e recusa duplicata em lugares diferentes', () => {
    assert.equal(
      feicoesDeEstacao(
        { features: [ponto('VILA MARIANA', -46.63), ponto('VILA MARIANA', -46.6301)] },
        'c'
      ).length,
      1
    );
    assert.throws(() =>
      feicoesDeEstacao({ features: [ponto('X', -46.6), ponto('X', -46.7)] }, 'c')
    );
  });
});

describe('conferirOrdem', () => {
  const polilinha = [
    { lat: -23.5, lon: -46.7 },
    { lat: -23.5, lon: -46.6 },
  ];
  const e = (nome, lon) => ({ nome, coordenada: { lat: -23.5, lon } });
  const est = [e('A', -46.69), e('B', -46.65), e('C', -46.61)];
  it('confere nos dois sentidos da geometria', () => {
    assert.equal(conferirOrdem(['A', 'B', 'C'], est, polilinha), 'confere');
    assert.equal(conferirOrdem(['C', 'B', 'A'], est, polilinha), 'confere');
  });
  it('aponta divergência', () => {
    assert.match(conferirOrdem(['A', 'C', 'B'], est, polilinha), /^diverge/);
  });
});
