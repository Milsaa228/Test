import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';

/**
 * Снимает или выбирает фото и возвращает его в JPEG base64, уменьшенным до 1568 px по длинной стороне:
 * больше Claude всё равно не использует, а запрос становится в разы легче.
 */
export async function pickPhoto(source: 'camera' | 'library'): Promise<string | null> {
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) throw new Error('Нет доступа к камере. Разрешите его в настройках телефона.');
  }
  const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(options) : await ImagePicker.launchImageLibraryAsync(options);
  if (res.canceled || !res.assets.length) return null;

  const { uri, width, height } = res.assets[0];
  const max = 1568;
  const ctx = ImageManipulator.manipulate(uri);
  if (width > max || height > max) ctx.resize(width >= height ? { width: max } : { height: max });
  const image = await ctx.renderAsync();
  const saved = await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.7, base64: true });
  if (!saved.base64) throw new Error('Не удалось прочитать фото');
  return saved.base64;
}
