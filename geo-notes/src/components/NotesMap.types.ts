import type { StyleProp, ViewStyle } from 'react-native';

import type { GeoNote, LatLng } from '../lib/types';

export interface NotesMapProps {
  notes: GeoNote[];
  position: LatLng | null;
  style?: StyleProp<ViewStyle>;
  /** Режим выбора точки: касание ставит точку, карта центрируется на ней. */
  pickerMode?: boolean;
  picked?: LatLng | null;
  pickedRadius?: number;
  /** Долгое нажатие (и касание в режиме выбора). */
  onPick?: (point: LatLng) => void;
  onNotePress?: (id: string) => void;
}

export const DEFAULT_CENTER: LatLng = { latitude: 55.7539, longitude: 37.6208 };
