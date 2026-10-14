// Ícones: SF Symbols no iOS, Material Symbols no Android e na web (expo-symbols, SDK 57).
// Nomes centralizados aqui para manter uma família por plataforma e nenhum emoji.
import { SymbolView } from 'expo-symbols';
import type { ComponentProps } from 'react';
import type { ColorValue, StyleProp, ViewStyle } from 'react-native';

import { useColors } from '@/theme';

type NomeSimbolo = ComponentProps<typeof SymbolView>['name'];
type ParNomes = { ios: string; android: string };

const ICONES = {
  rota: { ios: 'point.topleft.down.to.point.bottomright.curvepath', android: 'route' },
  provedores: { ios: 'antenna.radiowaves.left.and.right', android: 'sensors' },
  info: { ios: 'info.circle', android: 'info' },
  mapa: { ios: 'map', android: 'map' },
  vento: { ios: 'wind', android: 'air' },
  sol: { ios: 'sunrise', android: 'wb_twilight' },
  expandir: { ios: 'chevron.down', android: 'expand_more' },
  recolher: { ios: 'chevron.up', android: 'expand_less' },
  busca: { ios: 'magnifyingglass', android: 'search' },
  mais: { ios: 'plus', android: 'add' },
  editar: { ios: 'pencil', android: 'edit' },
  chevron: { ios: 'chevron.right', android: 'chevron_right' },
  origem: { ios: 'circle.circle', android: 'radio_button_checked' },
  destino: { ios: 'mappin.circle.fill', android: 'location_on' },
  localizacao: { ios: 'location.fill', android: 'my_location' },
  onibus: { ios: 'bus.fill', android: 'directions_bus' },
  metro: { ios: 'tram.fill', android: 'subway' },
  clima: { ios: 'cloud.rain.fill', android: 'rainy' },
  ar: { ios: 'aqi.medium', android: 'airwave' },
  alagamento: { ios: 'water.waves', android: 'flood' },
  janela: { ios: 'clock', android: 'schedule' },
  favoravel: { ios: 'checkmark.circle.fill', android: 'check_circle' },
  atencao: { ios: 'exclamationmark.triangle.fill', android: 'warning' },
  aguardar: { ios: 'hand.raised.fill', android: 'front_hand' },
  indeterminado: { ios: 'questionmark.circle.fill', android: 'help' },
  desatualizado: { ios: 'clock.badge.exclamationmark', android: 'history' },
  atualizar: { ios: 'arrow.clockwise', android: 'refresh' },
  marcado: { ios: 'checkmark', android: 'check' },
  remover: { ios: 'xmark', android: 'close' },
  excluir: { ios: 'trash', android: 'delete' },
  compartilhar: { ios: 'square.and.arrow.up', android: 'share' },
  principal: { ios: 'star.fill', android: 'star' },
  principalVazio: { ios: 'star', android: 'star_border' },
  trocar: { ios: 'chevron.down', android: 'keyboard_arrow_down' },
  guardaChuva: { ios: 'umbrella.fill', android: 'umbrella' },
  caminhar: { ios: 'figure.walk', android: 'directions_walk' },
  alternativa: { ios: 'arrow.triangle.branch', android: 'alt_route' },
  bloqueio: { ios: 'nosign', android: 'block' },
  saude: { ios: 'heart.text.square', android: 'health_and_safety' },
  // Contatos de emergência (features/alertas/contatos-emergencia.tsx)
  escudo: { ios: 'shield.fill', android: 'shield' },
  fogo: { ios: 'flame.fill', android: 'local_fire_department' },
  nascerSol: { ios: 'sunrise.fill', android: 'wb_twilight' },
  porSol: { ios: 'sunset.fill', android: 'nights_stay' },
  gota: { ios: 'drop.fill', android: 'water_drop' },
  relogio: { ios: 'clock.fill', android: 'schedule' },
  desfazer: { ios: 'arrow.uturn.backward', android: 'undo' },
  opcoes: { ios: 'ellipsis.circle', android: 'more_vert' },
  // Tendência de chuva (features/tempo/tendencia.ts)
  tendenciaSobe: { ios: 'arrow.up.right', android: 'trending_up' },
  tendenciaDesce: { ios: 'arrow.down.right', android: 'trending_down' },
  tendenciaEstavel: { ios: 'arrow.right', android: 'trending_flat' },
  // Condição do tempo (WMO weather_code, features/tempo/codigo-tempo.ts); chuva = `clima`
  ceuLimpo: { ios: 'sun.max.fill', android: 'sunny' },
  parcialNublado: { ios: 'cloud.sun.fill', android: 'partly_cloudy_day' },
  nublado: { ios: 'cloud.fill', android: 'cloud' },
  nevoeiro: { ios: 'cloud.fog.fill', android: 'foggy' },
  garoa: { ios: 'cloud.drizzle.fill', android: 'rainy_light' },
  pancadas: { ios: 'cloud.heavyrain.fill', android: 'rainy_heavy' },
  neve: { ios: 'cloud.snow.fill', android: 'weather_snowy' },
  tempestade: { ios: 'cloud.bolt.rain.fill', android: 'thunderstorm' },
  granizo: { ios: 'cloud.hail.fill', android: 'weather_hail' },
  termometro: { ios: 'thermometer.medium', android: 'device_thermostat' },
  umidade: { ios: 'humidity.fill', android: 'humidity_percentage' },
  uv: { ios: 'sun.max.trianglebadge.exclamationmark', android: 'light_mode' },
  // Chip de estado de conexão (components/estado-conexao-chip.tsx)
  online: { ios: 'wifi', android: 'wifi' },
  offline: { ios: 'wifi.slash', android: 'wifi_off' },
  semDados: { ios: 'icloud.slash', android: 'cloud_off' },
  demo: { ios: 'flask.fill', android: 'science' },
} as const satisfies Record<string, ParNomes>;

export type IconName = keyof typeof ICONES;

type Props = {
  name: IconName;
  size?: 16 | 20 | 24 | 32 | 48;
  color?: ColorValue;
  style?: StyleProp<ViewStyle>;
};

/** Ícone decorativo: o texto ao lado (ou o rótulo do controle) carrega o significado. */
export function Icon({ name, size = 20, color, style }: Props) {
  const c = useColors();
  const par = ICONES[name];
  return (
    <SymbolView
      name={{ ios: par.ios, android: par.android, web: par.android } as NomeSimbolo}
      size={size}
      tintColor={color ?? c.text}
      style={[{ width: size, height: size }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}
