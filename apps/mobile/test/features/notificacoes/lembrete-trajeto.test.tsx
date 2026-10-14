// RF25: "Lembrete de saída" por trajeto — opt-in, pede permissão só ao ligar, propõe 10 min antes do
// horário habitual, ajusta em passos e explica quando não há uso suficiente.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as N from 'expo-notifications';
import { act, fireEvent, screen } from '@testing-library/react-native';

import { LembreteTrajeto } from '@/features/notificacoes/lembrete-trajeto';
import { lembretesStore } from '@/features/notificacoes/use-lembretes';
import { CHAVE_USO_TRAJETOS } from '@/features/trajetos/storage';

import { renderComQuery } from '../../support/render-com-query';
import { TRAJETO_EXEMPLO as t } from '../../support/trajeto';

// expo-notifications vem simulado para todos os testes (moduleNameMapper do package.json)
const mockMostrar = jest.fn();
jest.mock('@/components/snackbar', () => ({ useSnackbar: () => ({ mostrar: mockMostrar, ocultar: jest.fn() }) }));

const mocks = N as unknown as Record<string, jest.Mock>;
const ontem = (h: number, m: number, diasAtras: number) => {
  const d = new Date();
  d.setDate(d.getDate() - diasAtras);
  d.setHours(h, m, 0, 0);
  return d;
};

/** 3 usos às 07:50 em dias úteis dos últimos 14 dias. */
async function gravarUsoMatinal() {
  const usos: number[] = [];
  for (let i = 1; usos.length < 3; i++) {
    const d = ontem(7, 50, i);
    if (d.getDay() >= 1 && d.getDay() <= 5) usos.push(d.getTime());
  }
  await AsyncStorage.setItem(CHAVE_USO_TRAJETOS, JSON.stringify({ t1: usos.sort() }));
}

const interruptor = () => screen.getByRole('switch', { name: 'Lembrete de saída' });

describe('LembreteTrajeto', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('desligado por padrão; ligar pede permissão e usa 10 min antes do habitual', async () => {
    await gravarUsoMatinal();
    await renderComQuery(<LembreteTrajeto trajeto={t} />);
    expect(await screen.findByText('Desligado.')).toBeTruthy();
    expect(mocks.requestPermissionsAsync).not.toHaveBeenCalled();

    await act(() => fireEvent(interruptor(), 'valueChange', true));
    expect(mocks.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText('Dias úteis às 07:40, 10 min antes do seu horário habitual (07:50).')
    ).toBeTruthy();
    expect(mockMostrar).toHaveBeenCalledWith({ mensagem: 'Lembrete ligado: dias úteis às 07:40' });
    expect((await lembretesStore.ler()).porTrajeto.t1).toMatchObject({ hora: 7, minuto: 40, origem: 'habitual' });

    // Ajuste manual e volta ao habitual.
    await fireEvent.press(screen.getByRole('button', { name: /Cinco minutos mais tarde/ }));
    expect(await screen.findByText('Dias úteis às 07:45 (horário escolhido por você).')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /^Usar 10 min antes do horário habitual/ }));
    expect(await screen.findByText(/^Dias úteis às 07:40, 10 min antes/)).toBeTruthy();

    await act(() => fireEvent(interruptor(), 'valueChange', false));
    expect(await screen.findByText('Desligado.')).toBeTruthy();
    expect((await lembretesStore.ler()).porTrajeto).toEqual({});
  });

  it('sem uso suficiente: nasce às 07:00 e explica como escolher', async () => {
    await renderComQuery(<LembreteTrajeto trajeto={t} />);
    const sw = await screen.findByRole('switch', { name: 'Lembrete de saída' });
    await act(() => fireEvent(sw, 'valueChange', true));
    expect(await screen.findByText('Dias úteis às 07:00 (horário escolhido por você).')).toBeTruthy();
    expect(screen.getByText(/Ainda não dá para saber seu horário habitual/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: /Uma hora mais cedo/ }));
    expect(await screen.findByText('Horário do aviso: 06:00')).toBeTruthy();
  });

  it('permissão negada: continua desligado e oferece abrir as configurações', async () => {
    mocks.requestPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: false });
    await renderComQuery(<LembreteTrajeto trajeto={t} />);
    const sw = await screen.findByRole('switch', { name: 'Lembrete de saída' });
    await act(() => fireEvent(sw, 'valueChange', true));
    expect(mockMostrar).toHaveBeenCalledWith(
      expect.objectContaining({ tipo: 'erro', acao: expect.objectContaining({ rotulo: 'Abrir configurações' }) })
    );
    expect(screen.getByText('Desligado.')).toBeTruthy();
    expect((await lembretesStore.ler()).porTrajeto).toEqual({});
  });
});
