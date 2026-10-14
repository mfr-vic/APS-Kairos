import { describe, expect, it } from 'vitest';
import { SchemaValidationError } from '../../../src/infrastructure/errors.js';
import {
  decodificarEntidades,
  normalizarSituacao,
  paraIsoSaoPaulo,
  parseDiretoMetro,
} from '../../../src/providers/rail/metro-sp.parser.js';
import { HTML_REAL, comSituacao } from './helpers.js';

describe('parseDiretoMetro (T34, HTML real de 10/10/2026 21:02)', () => {
  const linhas = parseDiretoMetro(HTML_REAL);

  it('extrai 1, 2, 3, 4, 5 e 15 e ignora a 17-Ouro (fora do contrato)', () => {
    expect(linhas.map((l) => l.linha)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L15']);
  });

  it('lê nome, operadora, texto, descrição e "atualizado em" (-03:00)', () => {
    expect(linhas[0]).toEqual({
      linha: 'L1',
      nome: 'Azul',
      operadora: 'Metrô',
      statusTexto: 'Operação Normal',
      situacao: 'NORMAL',
      descricao: 'Situação Normal',
      atualizadoEm: '2026-10-10T21:01:03-03:00',
    });
    const l4 = linhas.find((l) => l.linha === 'L4')!;
    expect(l4.operadora).toBe('ViaQuatro');
    expect(l4.atualizadoEm).toBe('2026-10-10T21:01:00-03:00'); // a ViaQuatro publica sem segundos
    expect(linhas.find((l) => l.linha === 'L5')).toMatchObject({ nome: 'Lilás', operadora: 'ViaMobilidade' });
  });

  it('todas em "Operação Normal" → NORMAL', () => {
    expect(linhas.every((l) => l.situacao === 'NORMAL' && l.statusTexto === 'Operação Normal')).toBe(true);
  });

  it('situação alterada na página (fixture sintética) é normalizada pela RN06', () => {
    let html = comSituacao(HTML_REAL, '1', 'Operação Paralisada');
    html = comSituacao(html, '2', 'Operação Transitória');
    html = comSituacao(html, '3', 'Velocidade Reduzida');
    const [l1, l2, l3] = parseDiretoMetro(html);
    expect(l1).toMatchObject({ statusTexto: 'Operação Paralisada', situacao: 'PARALISADA' });
    expect(l2).toMatchObject({ statusTexto: 'Operação Transitória', situacao: 'ALTERADA' });
    expect(l3).toMatchObject({ statusTexto: 'Velocidade Reduzida', situacao: 'ALTERADA' });
  });

  it('HTML sem os blocos de linha → SchemaValidationError (página mudou)', () => {
    const html = '<html><body><ol><li class="item">1 Azul Normal</li></ol></body></html>';
    expect(() => parseDiretoMetro(html)).toThrow(SchemaValidationError);
    expect(() => parseDiretoMetro('')).toThrow(/nenhum bloco/);
  });

  it('bloco de linha sem a situação → SchemaValidationError', () => {
    const html = HTML_REAL.replaceAll('class="linha-situacao"', 'class="linha-estado"');
    expect(() => parseDiretoMetro(html)).toThrow(/sem número ou sem situação/);
  });

  it('só linhas fora do contrato → SchemaValidationError', () => {
    const html =
      '<ol><li class="linha"><div class="linha-numero">17</div><div class="linha-situacao">Operação Normal</div></li></ol>';
    expect(() => parseDiretoMetro(html)).toThrow(/nenhuma linha do contrato/);
  });
});

describe('normalizarSituacao (RN06, B.8)', () => {
  it.each([
    ['Operação Normal', 'NORMAL'],
    ['  operacao   NORMAL ', 'NORMAL'],
    ['Operação Transitória', 'ALTERADA'],
    ['Operação Encerrada', 'PARALISADA'], // decisão de 10/10/2026: fechada à noite → AGUARDAR
    ['Situação Normal', 'ALTERADA'], // só "Operação Normal" vale NORMAL (B.8)
    ['Paralisada', 'PARALISADA'],
    ['Operação Paralisada', 'PARALISADA'],
    ['Linha paralisada entre Sé e Luz', 'PARALISADA'],
  ] as const)('%s → %s', (texto, esperado) => {
    expect(normalizarSituacao(texto)).toBe(esperado);
  });
});

describe('apoio do parser', () => {
  it('paraIsoSaoPaulo aceita com e sem segundos e rejeita lixo', () => {
    expect(paraIsoSaoPaulo('10/10/2026 08:08:24')).toBe('2026-10-10T08:08:24-03:00');
    expect(paraIsoSaoPaulo('10/10/2026 08:08')).toBe('2026-10-10T08:08:00-03:00');
    expect(paraIsoSaoPaulo('ontem')).toBeNull();
  });

  it('decodificarEntidades trata nomeadas e numéricas', () => {
    expect(decodificarEntidades('&lt;div class=&#039;title&#039;&gt;Metr&#xF4;&amp;&lt;/div&gt;')).toBe(
      "<div class='title'>Metrô&</div>",
    );
  });
});
