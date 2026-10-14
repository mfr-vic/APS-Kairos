// Seção "Servidor da API" de Estado das fontes: testar antes de salvar, salvar e restaurar o padrão.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { fireEvent, screen } from '@testing-library/react-native';

import { API_URL_PADRAO, apiUrl, definirApiUrl } from '@/config/api';
import { CHAVE_SERVIDOR_API } from '@/features/provedores/servidor-api';
import { ServidorApiSecao } from '@/features/provedores/servidor-api-secao';
import { api } from '@/shared/api/client';
import { ApiError } from '@/shared/api/errors';

import { renderComQuery } from '../../support/render-com-query';

const healthEm = jest.spyOn(api, 'healthEm');
const botao = (nome: string) => screen.getByRole('button', { name: nome });
const digitar = (texto: string) => fireEvent.changeText(screen.getByLabelText('Endereço do servidor'), texto);

describe('ServidorApiSecao', () => {
  beforeEach(async () => {
    healthEm.mockReset();
    definirApiUrl(null);
    await AsyncStorage.clear();
  });

  it('mostra o padrão em uso e esconde Restaurar', async () => {
    await renderComQuery(<ServidorApiSecao />);
    expect(screen.getByText('Em uso (padrão)')).toBeTruthy();
    expect(screen.getByText(API_URL_PADRAO)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Restaurar padrão' })).toBeNull();
  });

  it('Testar conexão: sucesso mostra "API: up" sem salvar', async () => {
    healthEm.mockResolvedValue({ status: 'up', timestamp: '2026-10-14T12:00:00Z' });
    await renderComQuery(<ServidorApiSecao />);
    await digitar('192.168.1.20');
    await fireEvent.press(botao('Testar conexão'));
    expect(await screen.findByText('API: up')).toBeTruthy();
    expect(healthEm).toHaveBeenCalledWith('http://192.168.1.20:3000');
    expect(apiUrl()).toBe(API_URL_PADRAO);
    expect(await AsyncStorage.getItem(CHAVE_SERVIDOR_API)).toBeNull();
  });

  it('Testar conexão: falha mostra a mensagem do erro', async () => {
    healthEm.mockRejectedValue(new ApiError('rede', 'Sem conexão com o servidor do Καιρός. Confira a internet ou o Wi-Fi.'));
    await renderComQuery(<ServidorApiSecao />);
    await digitar('192.168.1.20:3000');
    await fireEvent.press(botao('Testar conexão'));
    expect(await screen.findByText('Sem resposta')).toBeTruthy();
    expect(screen.getByText(/Sem conexão com o servidor do Καιρός/)).toBeTruthy();
  });

  it('endereço inválido: mensagem no campo e nenhuma requisição', async () => {
    await renderComQuery(<ServidorApiSecao />);
    await digitar('ftp://x');
    await fireEvent.press(botao('Testar conexão'));
    expect(screen.getByText('Use um endereço http:// ou https://.')).toBeTruthy();
    expect(healthEm).not.toHaveBeenCalled();
  });

  it('Salvar ativa o personalizado; Restaurar padrão volta ao do build', async () => {
    await renderComQuery(<ServidorApiSecao />);
    await digitar('10.0.0.5:8080/');
    await fireEvent.press(botao('Salvar'));
    expect(await screen.findByText('Em uso (personalizado)')).toBeTruthy();
    expect(apiUrl()).toBe('http://10.0.0.5:8080');
    expect(await AsyncStorage.getItem(CHAVE_SERVIDOR_API)).toBe('http://10.0.0.5:8080');

    await fireEvent.press(botao('Restaurar padrão'));
    expect(await screen.findByText('Em uso (padrão)')).toBeTruthy();
    expect(apiUrl()).toBe(API_URL_PADRAO);
    expect(await AsyncStorage.getItem(CHAVE_SERVIDOR_API)).toBeNull();
  });
});
