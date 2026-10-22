import { useId } from 'react';
import { View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { Icon, type IconName } from './Icon';

type Props = {
  colors: [string, string];
  size: number;
  round?: boolean;
  icon?: IconName;
  radius?: number;
};

/** Обложка: градиент из цветов трека с иконкой — без загрузки картинок из сети. */
export function Cover({ colors, size, round, icon = 'note', radius }: Props) {
  const id = useId().replace(/:/g, '');
  const r = round ? size / 2 : (radius ?? Math.max(4, size * 0.06));
  return (
    <View style={{ width: size, height: size, borderRadius: r, overflow: 'hidden' }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={colors[0]} />
            <Stop offset="1" stopColor={colors[1]} />
          </LinearGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#${id})`} />
      </Svg>
      <View style={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', opacity: 0.55 }}>
        <Icon name={icon} size={size * 0.4} color="#fff" />
      </View>
    </View>
  );
}
