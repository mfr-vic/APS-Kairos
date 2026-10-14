// Icon: decorativo (fora da árvore de acessibilidade), com nomes para iOS, Android e web.
import { render } from '@testing-library/react-native';
import { SymbolView } from 'expo-symbols';

import { Icon } from '@/components/icon';

jest.mock('expo-symbols', () => {
  const { View } = jest.requireActual('react-native');
  return { SymbolView: jest.fn((props) => <View {...props} />) };
});

describe('Icon', () => {
  it('passa nomes SF e Material e fica oculto da acessibilidade', async () => {
    await render(<Icon name="onibus" size={24} />);
    const props = (SymbolView as unknown as jest.Mock).mock.calls[0][0];
    expect(props.name).toEqual({
      ios: 'bus.fill',
      android: 'directions_bus',
      web: 'directions_bus',
    });
    expect(props.size).toBe(24);
    expect(props.accessibilityElementsHidden).toBe(true);
    expect(props.importantForAccessibility).toBe('no-hide-descendants');
  });
});
