const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64ToBytes(input: string): Uint8Array {
  const clean = input.replace(/^data:[^,]*,/, '').replace(/[^A-Za-z0-9+/]/g, '');
  const out = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let buffer = 0;
  let bits = 0;
  let pos = 0;
  for (let i = 0; i < clean.length; i++) {
    buffer = (buffer << 6) | B64.indexOf(clean[i]);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[pos++] = (buffer >> bits) & 0xff;
    }
  }
  return out.subarray(0, pos);
}

/** Декодирует UTF-8; возвращает null, если байты не являются корректным UTF-8. */
export function decodeUtf8Strict(bytes: Uint8Array): string | null {
  let out = '';
  let i = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  while (i < bytes.length) {
    const b = bytes[i];
    let cp: number;
    let extra: number;
    if (b < 0x80) { cp = b; extra = 0; }
    else if ((b & 0xe0) === 0xc0) { cp = b & 0x1f; extra = 1; }
    else if ((b & 0xf0) === 0xe0) { cp = b & 0x0f; extra = 2; }
    else if ((b & 0xf8) === 0xf0) { cp = b & 0x07; extra = 3; }
    else return null;
    for (let k = 1; k <= extra; k++) {
      const c = bytes[i + k];
      if (c === undefined || (c & 0xc0) !== 0x80) return null;
      cp = (cp << 6) | (c & 0x3f);
    }
    out += String.fromCodePoint(cp);
    i += extra + 1;
  }
  return out;
}

// Символы Windows-1251 для байтов 0x80–0xBF (0xC0–0xFF — это А–я подряд).
const CP1251_HIGH =
  'ЂЃ‚ѓ„…†‡€‰Љ‹ЊЌЋЏђ‘’“”•–—�™љ›њќћџ ЎўЈ¤Ґ¦§Ё©Є«¬­®Ї°±Ііґµ¶·ё№є»јЅѕї';

export function decodeCp1251(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    if (b < 0x80) out += String.fromCharCode(b);
    else if (b < 0xc0) out += CP1251_HIGH[b - 0x80];
    else out += String.fromCharCode(0x0410 + (b - 0xc0));
  }
  return out;
}

/** Выписки Т-Банка выгружаются в Windows-1251, но пересохранённые файлы бывают в UTF-8. */
export function decodeText(bytes: Uint8Array): string {
  return decodeUtf8Strict(bytes) ?? decodeCp1251(bytes);
}
