import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

import { MAX_PHOTOS } from './fridge';

export interface Photo {
  uri: string;
  width: number;
  height: number;
}

/** Длинная сторона, до которой уменьшаем фото: больше нейросети всё равно не нужно. */
const MAX_SIDE = 1568;

function toPhotos(res: ImagePicker.ImagePickerResult): Photo[] {
  if (res.canceled) return [];
  return res.assets.map((a) => ({ uri: a.uri, width: a.width, height: a.height }));
}

export async function takePhoto(): Promise<Photo[]> {
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('Нет доступа к камере. Разрешите его в настройках телефона.');
  return toPhotos(await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1 }));
}

export async function pickPhotos(limit = MAX_PHOTOS): Promise<Photo[]> {
  const res = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsMultipleSelection: limit > 1,
    selectionLimit: limit,
    quality: 1,
  });
  return toPhotos(res).slice(0, limit);
}

/** Уменьшает фото до ~1568 px по длинной стороне и возвращает JPEG в base64. */
export async function toJpegBase64(photo: Photo): Promise<string> {
  const ctx = ImageManipulator.manipulate(photo.uri);
  const long = Math.max(photo.width, photo.height);
  if (long > MAX_SIDE) ctx.resize(photo.width >= photo.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!saved.base64) throw new Error('Не удалось подготовить фото');
  return saved.base64.replace(/^data:image\/\w+;base64,/, '');
}
