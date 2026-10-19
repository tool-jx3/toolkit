/**
 * QR code：文字 → 模組矩陣（qrcode-generator，MIT，npm 打包）。
 * 中文等非 ASCII 的字以 UTF-8 編碼（先轉成位元組，再以「一個位元組一個字元」交給套件，套件不必改全域設定）。
 * 容錯等級 M（同原作）；版本自動（放得下的最小版本）。內容太長、放不下時回傳 null。
 */
import qrcode from 'qrcode-generator';

export interface QrMatrix {
  /** 一邊幾個模組（不含四周的空白） */
  size: number;
  /** 第 r 列第 c 行是不是黑的 */
  dark: (r: number, c: number) => boolean;
}

const cache = new Map<string, QrMatrix | null>();

/** UTF-8 位元組變成「一個位元組一個字元」的字串（套件的位元組模式只取每個字的低 8 位） */
function utf8Binary(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

export function qrMatrix(text: string): QrMatrix | null {
  const key = String(text ?? '');
  if (!key) return null;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let out: QrMatrix | null = null;
  try {
    const qr = qrcode(0, 'M');
    qr.addData(utf8Binary(key), 'Byte');
    qr.make();
    const size = qr.getModuleCount();
    const bits: boolean[] = [];
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) bits.push(qr.isDark(r, c));
    out = { size, dark: (r, c) => bits[r * size + c] === true };
  } catch {
    out = null;
  }
  if (cache.size > 64) cache.clear();
  cache.set(key, out);
  return out;
}
