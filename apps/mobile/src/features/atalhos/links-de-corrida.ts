// Atalhos para apps de corrida (decisão do usuário, 14/10/2026): só texto, sem logotipo, e deixando
// claro que é atalho. Funções puras: montam o link; quem abre é atalhos-corrida.tsx.
//
// Uber: link universal da documentação oficial (developer.uber.com › Deep Links, conferida em
// 13/10/2026): https://m.uber.com/looking?pickup={Location}&drop[0]={Location}, com Location em JSON
// ({latitude, longitude, addressLine1}) codificado na URL. `client_id` não é marcado como obrigatório na
// tabela de parâmetros e o Καιρός não tem um. Abre o app se instalado; senão, a versão web.
//
// 99: não há link documentado que preencha destino (pesquisa de 13/10/2026). O app abre a página da 99
// na loja do aparelho (de lá, "Abrir" se instalada) e copia o endereço do destino para colar.
import type { Address } from '@kairos/contracts';

export const PACOTE_99_ANDROID = 'com.taxis99';
export const ID_99_IOS = '553663691';

const SEM_ROTULO = 'Sem rótulo';

function local(a: Address) {
  const base = { latitude: a.lat, longitude: a.lon };
  return a.rotulo && a.rotulo !== SEM_ROTULO ? { ...base, addressLine1: a.rotulo } : base;
}

/** Corrida com origem e destino preenchidos (link universal do Uber). */
export function linkUber(origem: Address, destino: Address): string {
  const q = (o: object) => encodeURIComponent(JSON.stringify(o));
  return `https://m.uber.com/looking?pickup=${q(local(origem))}&${encodeURIComponent('drop[0]')}=${q(local(destino))}`;
}

/** Página da 99 na loja do sistema (Android abre a Play Store; iOS a App Store). */
export function link99(plataforma: string): string {
  return plataforma === 'ios'
    ? `https://apps.apple.com/br/app/id${ID_99_IOS}`
    : `https://play.google.com/store/apps/details?id=${PACOTE_99_ANDROID}`;
}

/** O que vai para a área de transferência: o endereço do destino, ou as coordenadas se não houver rótulo. */
export function textoDoDestino(destino: Address): string {
  return destino.rotulo && destino.rotulo !== SEM_ROTULO
    ? destino.rotulo
    : `${destino.lat.toFixed(6)}, ${destino.lon.toFixed(6)}`;
}
