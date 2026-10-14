// Widget "tempo agora": temperatura, condição e sensação, máx/mín e a grade 3×2 (umidade, vento,
// UV, chance de chuva, nascer e pôr do sol). Estados: esqueleto, erro com a causa e "Tentar de
// novo" (regressão de 13/10: "Sem dados de clima." genérico), fonte indisponível com o motivo, stale.
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import { TempoAgora } from '@/features/tempo/tempo-agora';
import { api, type ObservacaoTempo } from '@/shared/api/client';
import { ApiError } from '@/shared/api/errors';

import { renderComQuery } from '../../support/render-com-query';

jest.mock('@/features/trajetos/obter-localizacao', () => ({
  obterLocalizacaoSePermitida: jest.fn().mockResolvedValue(null),
}));

const AGORA = Date.parse('2026-10-10T08:10:00-03:00');

const hora = (h: string, precipitacaoMm: number, prob: number, temperaturaC: number) => ({
  hora: `2026-10-10T${h}:00:00-03:00`,
  precipitacaoMm,
  probabilidadePrecipitacao: prob,
  temperaturaC,
});

const OBSERVACAO: ObservacaoTempo = {
  dimension: 'weather',
  source: 'open-meteo',
  status: 'fresh',
  observedAt: '2026-10-10T08:00:00-03:00',
  fetchedAt: '2026-10-10T08:05:00-03:00',
  ttlSeconds: 900,
  value: {
    atual: {
      temperaturaC: 21.4,
      precipitacaoMm: 0,
      ventoKmH: 14.2,
      codigoTempo: 2,
      sensacaoC: 20.3,
      umidadePct: 71,
      uv: 6.4,
    },
    hoje: { temperaturaMaxC: 28.6, temperaturaMinC: 17.2 },
    sol: { nascer: '2026-10-10T05:48:00-03:00', por: '2026-10-10T18:12:00-03:00' },
    horas: [hora('09', 0.4, 35, 22.0), hora('10', 1.2, 60, 22.6), hora('11', 2.0, 70, 23), hora('12', 3.1, 80, 23.4)],
  },
};

describe('TempoAgora', () => {
  afterEach(() => jest.restoreAllMocks());

  it('mostra temperatura, condição + sensação, máx/mín e a grade com valores numa linha', async () => {
    jest.spyOn(api, 'tempoAgora').mockResolvedValue(OBSERVACAO);
    await renderComQuery(<TempoAgora agora={AGORA} />);
    await waitFor(() => expect(screen.getByText('21,4°C')).toBeTruthy());
    expect(screen.getByText('Parcialmente nublado · sensação de 20°')).toBeTruthy();
    expect(screen.getByText('↑ 29°')).toBeTruthy();
    expect(screen.getByText('↓ 17°')).toBeTruthy();
    expect(screen.getByText('71%')).toBeTruthy(); // umidade
    expect(screen.getByText('14 km/h')).toBeTruthy(); // vento (sem direção: o contrato não traz)
    expect(screen.getByText('6 · alto')).toBeTruthy(); // UV com a faixa
    expect(screen.getByText('Chuva às 09h')).toBeTruthy();
    expect(screen.getByText('35%')).toBeTruthy();
    expect(screen.getByText('05:48')).toBeTruthy();
    expect(screen.getByText('18:12')).toBeTruthy();
    // Valor nunca quebra linha (defeito "UV\n8" do app de referência).
    expect(screen.getByText('6 · alto').props.numberOfLines).toBe(1);
  });

  it('campos nulos: "Condição não informada" e células ausentes somem', async () => {
    jest.spyOn(api, 'tempoAgora').mockResolvedValue({
      ...OBSERVACAO,
      value: {
        ...OBSERVACAO.value!,
        atual: { ...OBSERVACAO.value!.atual, codigoTempo: null, sensacaoC: null, umidadePct: null, uv: null },
        hoje: null,
      },
    });
    await renderComQuery(<TempoAgora agora={AGORA} />);
    await waitFor(() => expect(screen.getByText('Condição não informada')).toBeTruthy());
    expect(screen.queryByText(/sensação/)).toBeNull();
    expect(screen.queryByText('UV')).toBeNull();
    expect(screen.queryByText('Umidade')).toBeNull();
  });

  it('erro da API: diz a causa e oferece "Tentar de novo" (que consulta de novo)', async () => {
    const espiao = jest
      .spyOn(api, 'tempoAgora')
      .mockRejectedValue(new ApiError('tempo-esgotado', 'A API não respondeu em 5 s.'));
    await renderComQuery(<TempoAgora agora={AGORA} />);
    await waitFor(() => expect(screen.getByText('Previsão do tempo indisponível')).toBeTruthy());
    expect(screen.getByText('A API não respondeu em 5 s.')).toBeTruthy();
    expect(screen.queryByText('Sem dados de clima.')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Tentar de novo' }));
    expect(espiao.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('fonte indisponível: o motivo da Observation, com o nome da fonte', async () => {
    jest.spyOn(api, 'tempoAgora').mockResolvedValue({
      ...OBSERVACAO,
      status: 'unavailable',
      value: null,
      observedAt: null,
      fetchedAt: null,
      motivo: 'A fonte não respondeu a tempo',
    });
    await renderComQuery(<TempoAgora agora={AGORA} />);
    await waitFor(() => expect(screen.getByText('Open-Meteo não respondeu a tempo.')).toBeTruthy());
  });

  it('stale: diz a idade da previsão', async () => {
    jest.spyOn(api, 'tempoAgora').mockResolvedValue({ ...OBSERVACAO, status: 'stale' as const });
    await renderComQuery(<TempoAgora agora={AGORA} />);
    await waitFor(() => expect(screen.getByText(/Previsão de há 10 min/)).toBeTruthy());
  });
});
