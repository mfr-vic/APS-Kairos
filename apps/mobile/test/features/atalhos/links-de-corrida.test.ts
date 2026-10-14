// Atalhos de corrida (14/10/2026): links montados por funções puras.
import { link99, linkUber, textoDoDestino } from '@/features/atalhos/links-de-corrida';

const ORIGEM = { lat: -23.5505, lon: -46.6333, rotulo: 'Praça da Sé' };
const DESTINO = { lat: -23.5614, lon: -46.6559, rotulo: 'Av. Paulista, 1578' };

describe('linkUber (link universal da doc oficial, m.uber.com/looking)', () => {
  it('preenche origem e destino com coordenadas e apelido, tudo codificado', () => {
    const url = linkUber(ORIGEM, DESTINO);
    expect(url.startsWith('https://m.uber.com/looking?pickup=')).toBe(true);
    expect(url).toContain('&drop%5B0%5D=');
    expect(url).not.toMatch(/[{}"\[\] ]/); // JSON e colchetes codificados
    const q = new URLSearchParams(url.split('?')[1]);
    expect(JSON.parse(q.get('pickup')!)).toEqual({ latitude: -23.5505, longitude: -46.6333, addressLine1: 'Praça da Sé' });
    expect(JSON.parse(q.get('drop[0]')!)).toEqual({ latitude: -23.5614, longitude: -46.6559, addressLine1: 'Av. Paulista, 1578' });
  });

  it('sem rótulo de verdade, vai só a coordenada', () => {
    const q = new URLSearchParams(linkUber({ ...ORIGEM, rotulo: 'Sem rótulo' }, DESTINO).split('?')[1]);
    expect(JSON.parse(q.get('pickup')!)).toEqual({ latitude: -23.5505, longitude: -46.6333 });
  });
});

describe('99 (sem link documentado com destino)', () => {
  it('abre a página do app na loja do sistema', () => {
    expect(link99('android')).toBe('https://play.google.com/store/apps/details?id=com.taxis99');
    expect(link99('ios')).toBe('https://apps.apple.com/br/app/id553663691');
  });

  it('copia o endereço do destino; sem rótulo, as coordenadas', () => {
    expect(textoDoDestino(DESTINO)).toBe('Av. Paulista, 1578');
    expect(textoDoDestino({ ...DESTINO, rotulo: 'Sem rótulo' })).toBe('-23.561400, -46.655900');
  });
});
