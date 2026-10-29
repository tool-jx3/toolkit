/**
 * QR code 的編碼：文字 → 模組矩陣（qrcode-generator，MIT，npm 打包）。
 *
 * - 位元組模式一律以 UTF-8 編碼（先轉成位元組，再以「一個位元組一個字元」交給套件，不必改套件的全域設定）；
 *   qrcode-generator 預設只取每個字的低 8 位，中文會變成亂碼。
 * - 漢字模式用 Shift_JIS（`sjis.ts`）；只有整段都是 Shift_JIS 的雙位元組字時才能用。
 * - 版本 0＝自動（放得下的最小版本）；指定的版本放不下時回報至少要第幾版。
 *
 * id-ticket 原本的 `qr.ts` 搬到這裡（`qrMatrix`：等級 M、版本自動、位元組模式，結果不變）。
 */
import qrcode from 'qrcode-generator';
import { sjisBytes } from './sjis';

export type QrEcl = 'L' | 'M' | 'Q' | 'H';
export type QrDataMode = 'numeric' | 'alphanumeric' | 'byte' | 'kanji';
export type QrModeChoice = 'auto' | QrDataMode;

export const QR_ECLS: readonly QrEcl[] = ['L', 'M', 'Q', 'H'];
export const QR_DATA_MODES: readonly QrDataMode[] = ['numeric', 'alphanumeric', 'byte', 'kanji'];
/** 各錯誤更正等級大約可以修復的比例（中間放圖時算可以蓋掉多少格；同原作） */
export const QR_ECL_PERCENT: Record<QrEcl, number> = { L: 0.07, M: 0.15, Q: 0.25, H: 0.3 };
export const QR_VERSION_MAX = 40;

export interface QrMatrix {
  /** 一邊幾個模組（不含四周的空白） */
  size: number;
  /** 第 r 列第 c 行是不是黑的 */
  dark: (r: number, c: number) => boolean;
}

export interface QrCode extends QrMatrix {
  version: number;
  ecl: QrEcl;
  mode: QrDataMode;
}

export type QrEncodeError =
  | { kind: 'empty' }
  /** 這個模式不能用的字（第一個） */
  | { kind: 'mode'; mode: QrDataMode; char: string }
  /** 第 40 版也放不下 */
  | { kind: 'too-long' }
  /** 指定的版本放不下；min＝至少要第幾版 */
  | { kind: 'version'; min: number };

export type QrEncodeResult = { ok: true; code: QrCode } | { ok: false; error: QrEncodeError };

export interface QrEncodeOptions {
  /** 0＝自動，1～40 */
  version?: number;
  ecl?: QrEcl;
  mode?: QrModeChoice;
}

const MODE_NAME: Record<QrDataMode, 'Numeric' | 'Alphanumeric' | 'Byte' | 'Kanji'> = {
  numeric: 'Numeric',
  alphanumeric: 'Alphanumeric',
  byte: 'Byte',
  kanji: 'Kanji',
};

const NUMERIC = /^[0-9]*$/;
const ALPHANUMERIC = /^[0-9A-Z $%*+\-./:]*$/;

/** 自動選模式（同原作）：全是數字→數字；只有大寫英文、數字與 9 個符號→英數字；其他→位元組 */
export function qrAutoMode(text: string): Exclude<QrDataMode, 'kanji'> {
  if (NUMERIC.test(text)) return 'numeric';
  if (ALPHANUMERIC.test(text)) return 'alphanumeric';
  return 'byte';
}

/** UTF-8 位元組變成「一個位元組一個字元」的字串（套件的位元組模式只取每個字的低 8 位） */
export function utf8Binary(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return s;
}

/** 這個模式不能用的第一個字；都能用時 null */
function badChar(text: string, mode: QrDataMode): string | null {
  if (mode === 'byte') return null;
  if (mode === 'kanji') {
    const r = sjisBytes(text);
    return r.ok ? null : r.bad;
  }
  const re = mode === 'numeric' ? /[^0-9]/u : /[^0-9A-Z $%*+\-./:]/u;
  return re.exec(text)?.[0] ?? null;
}

type Factory = typeof qrcode & { stringToBytes: (s: string) => number[] };

/** 漢字模式：套件用全域的 stringToBytes 轉 Shift_JIS，加資料的那一刻暫時換掉（同步，馬上換回來） */
function addKanji(qr: ReturnType<typeof qrcode>, text: string): void {
  const f = qrcode as Factory;
  const saved = f.stringToBytes;
  f.stringToBytes = (s: string) => {
    const r = sjisBytes(s);
    if (!r.ok) throw new Error(`sjis: ${r.bad}`);
    return r.bytes;
  };
  try {
    qr.addData(text, 'Kanji');
  } finally {
    f.stringToBytes = saved;
  }
}

function build(text: string, version: number, ecl: QrEcl, mode: QrDataMode) {
  const qr = qrcode(version as Parameters<typeof qrcode>[0], ecl);
  if (mode === 'kanji') addKanji(qr, text);
  else qr.addData(mode === 'byte' ? utf8Binary(text) : text, MODE_NAME[mode]);
  qr.make();
  return qr;
}

function toCode(qr: ReturnType<typeof qrcode>, ecl: QrEcl, mode: QrDataMode): QrCode {
  const size = qr.getModuleCount();
  const bits = new Uint8Array(size * size);
  for (let r = 0; r < size; r++)
    for (let c = 0; c < size; c++) bits[r * size + c] = qr.isDark(r, c) ? 1 : 0;
  return {
    size,
    version: (size - 17) / 4,
    ecl,
    mode,
    dark: (r, c) => r >= 0 && c >= 0 && r < size && c < size && bits[r * size + c] === 1,
  };
}

const cache = new Map<string, QrEncodeResult>();

/** 文字 → QR code（結果會快取；同樣的輸入回傳同一個物件） */
export function encodeQr(text: string, options: QrEncodeOptions = {}): QrEncodeResult {
  const data = String(text ?? '');
  const ecl: QrEcl = options.ecl && QR_ECLS.includes(options.ecl) ? options.ecl : 'Q';
  const v = Math.round(options.version ?? 0);
  const version = Number.isFinite(v) && v >= 1 && v <= QR_VERSION_MAX ? v : 0;
  const choice = options.mode ?? 'auto';
  const key = `${version}|${ecl}|${choice}|${data}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const out = encodeUncached(data, version, ecl, choice);
  if (cache.size > 64) cache.clear();
  cache.set(key, out);
  return out;
}

function encodeUncached(
  data: string,
  version: number,
  ecl: QrEcl,
  choice: QrModeChoice,
): QrEncodeResult {
  if (!data) return { ok: false, error: { kind: 'empty' } };
  const mode: QrDataMode = choice === 'auto' ? qrAutoMode(data) : choice;
  const bad = badChar(data, mode);
  if (bad !== null) return { ok: false, error: { kind: 'mode', mode, char: bad } };
  try {
    return { ok: true, code: toCode(build(data, version, ecl, mode), ecl, mode) };
  } catch {
    /* 放不下：自動版本也放不下就是太長，不然回報至少要第幾版 */
    if (version === 0) return { ok: false, error: { kind: 'too-long' } };
    try {
      const auto = build(data, 0, ecl, mode);
      return { ok: false, error: { kind: 'version', min: (auto.getModuleCount() - 17) / 4 } };
    } catch {
      return { ok: false, error: { kind: 'too-long' } };
    }
  }
}

/* ---------- id-ticket 用（原本的 qr.ts） ---------- */

const matrixCache = new Map<string, QrMatrix | null>();

/** 文字 → 模組矩陣：等級 M、版本自動、位元組模式（UTF-8）；空白或放不下時 null */
export function qrMatrix(text: string): QrMatrix | null {
  const key = String(text ?? '');
  if (!key) return null;
  const hit = matrixCache.get(key);
  if (hit !== undefined) return hit;
  let out: QrMatrix | null = null;
  try {
    const code = toCode(build(key, 0, 'M', 'byte'), 'M', 'byte');
    out = { size: code.size, dark: (r, c) => code.dark(r, c) };
  } catch {
    out = null;
  }
  if (matrixCache.size > 64) matrixCache.clear();
  matrixCache.set(key, out);
  return out;
}
