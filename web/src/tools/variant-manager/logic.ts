/**
 * 角色差分管理器的規則（純函式，不依賴 React／DOM，單元測試直接測）。
 *
 * - 名稱清理（規格 3.2）：主名稱與差分名共用。
 * - 輸出檔名（3.1）：主名稱＋兩位數編號＋「_差分名」＋原副檔名（小寫）。
 * - 主名稱自動帶入（F07、3.3＋主控裁定）：第一張的檔名去掉副檔名，再去掉結尾的表情詞（詞前面要有 _、- 或空白）。
 * - 聊天面板（3.5）：每個非空的差分名一行「@差分名」，LF 分隔、最後沒有換行。
 * - ZIP（3.4、F23＋主控裁定）：重名時自動加序號、不覆蓋；檔名 `<主名稱>_sabun.zip`。
 */
import { safeFileName, uniqueFileName } from '@/core/files';

/** 主名稱清理後是空的時用這個 */
export const FALLBACK_MAIN = 'character';
/** ZIP 檔名的代號（CCFOLIA 社群通用的「差分」羅馬字；主控裁定保留） */
export const ZIP_TAG = 'sabun';
/** ZIP 裡的聊天面板文字檔 */
export const PALETTE_FILE = 'sabun-chatpalette.txt';
/** 原檔名沒有副檔名時一律用這個 */
export const DEFAULT_EXT = 'png';

/**
 * 名稱清理（規格 3.2）：去頭尾空白 → 連續空白（含全形空白、換行）換成一個「_」→ 刪掉 \ / : * ? " < > |
 * → 合併連續的「_」→ 去頭尾的「_」。其他字元（中日文、emoji、「.」「-」）保留；清理後可能是空字串。
 * 差分名同時用在聊天面板的「@差分名」，所以不改寫 Windows 保留名稱、也不截斷長度。
 */
export function cleanName(name: string): string {
  return safeFileName(name, {
    underscore: true,
    fallback: '',
    reservedNames: false,
    maxLength: Number.POSITIVE_INFINITY,
  });
}

/** 主名稱（清理後；空的時候是 character） */
export function mainNameOrFallback(main: string): string {
  return cleanName(main) || FALLBACK_MAIN;
}

/** 副檔名：原檔名最後一個「.」之後的部分轉小寫；沒有「.」（或「.」之後是空的）時一律 png */
export function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  if (i < 0) return DEFAULT_EXT;
  return fileName.slice(i + 1).toLowerCase() || DEFAULT_EXT;
}

/** 去掉副檔名（最後一個「.」之後）；沒有「.」時原樣 */
export function stripExtension(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  return i < 0 ? fileName : fileName.slice(0, i);
}

/** 編號：清單中的位置（從 1 起算），不足兩位數補 0；100 以上照實際位數 */
export function numberLabel(index: number): string {
  return String(index + 1).padStart(2, '0');
}

export interface OutputNameInput {
  /** 主名稱（未清理） */
  main: string;
  /** 是否加編號 */
  numbered: boolean;
  /** 清單中的位置（從 0 起算） */
  index: number;
  /** 差分名（未清理） */
  variant: string;
  /** 原檔名 */
  fileName: string;
}

/** 輸出檔名（規格 3.1）：`<主名稱><編號>_<差分名>.<副檔名>`；差分名清理後是空的時沒有「_差分名」 */
export function outputFileName({
  main,
  numbered,
  index,
  variant,
  fileName,
}: OutputNameInput): string {
  const v = cleanName(variant);
  return `${mainNameOrFallback(main)}${numbered ? numberLabel(index) : ''}${v ? `_${v}` : ''}.${extensionOf(fileName)}`;
}

/** ZIP 檔名（3.4）：`<主名稱>_sabun.zip` */
export function zipFileName(main: string): string {
  return `${mainNameOrFallback(main)}_${ZIP_TAG}.zip`;
}

/**
 * ZIP 內的檔名（F23＋主控裁定）：依清單順序，和前面的檔名（或聊天面板文字檔）撞名時在副檔名前加「_2」「_3」…，
 * 加了之後再檢查直到不撞名（不分大小寫，解壓縮到 Windows／macOS 也不會互相覆蓋）。
 * 例（編號關閉）：a、a、a_2 → `a.png`、`a_2.png`、`a_2_2.png`。
 */
export function zipEntryNames(outputNames: readonly string[]): string[] {
  const used = new Set<string>([PALETTE_FILE]);
  return outputNames.map((n) => uniqueFileName(n, used));
}

/**
 * 聊天面板文字（3.5）：依清單順序，差分名清理後不是空的就產生一行「@差分名」；空的略過、重複的照樣列出。
 * 行與行之間用 LF，最後一行後面沒有換行。
 */
export function chatPalette(variants: readonly string[]): string {
  return variants
    .map(cleanName)
    .filter(Boolean)
    .map((n) => `@${n}`)
    .join('\n');
}

/**
 * 主名稱自動帶入時去掉的結尾表情詞（新版自訂；繁中、英文、日文的常見表情與狀態）。
 * 只在詞前面緊接著 _、- 或空白時才去掉（主控裁定），所以 `chase`、`普通人` 這類一般字尾不會被誤刪。
 */
export const EXPRESSION_WORDS: readonly string[] = [
  /* 英文 */
  'normal',
  'default',
  'neutral',
  'base',
  'smile',
  'smiling',
  'happy',
  'joy',
  'laugh',
  'laughing',
  'grin',
  'angry',
  'anger',
  'mad',
  'sad',
  'cry',
  'crying',
  'tears',
  'surprise',
  'surprised',
  'shock',
  'shocked',
  'blush',
  'shy',
  'embarrassed',
  'worried',
  'troubled',
  'confused',
  'scared',
  'fear',
  'wink',
  'sleep',
  'sleepy',
  'serious',
  'smug',
  'hurt',
  'pain',
  /* 日文（羅馬拼音） */
  'egao',
  'warai',
  'ikari',
  'okori',
  'naki',
  'kanashimi',
  'odoroki',
  'tere',
  'komari',
  'futsuu',
  'tsuujou',
  'majime',
  'doya',
  'aseri',
  /* 日文 */
  '通常',
  '笑顔',
  '笑い',
  '怒り',
  '泣き',
  '悲しみ',
  '驚き',
  '照れ',
  '困り',
  '真顔',
  '焦り',
  '目閉じ',
  'ドヤ顔',
  'ジト目',
  /* 繁中 */
  '普通',
  '一般',
  '預設',
  '微笑',
  '笑',
  '大笑',
  '開心',
  '生氣',
  '憤怒',
  '難過',
  '傷心',
  '哭',
  '哭泣',
  '驚訝',
  '害羞',
  '臉紅',
  '困惑',
  '疑問',
  '閉眼',
  '認真',
  '得意',
  '害怕',
  '受傷',
];

const isSeparator = (ch: string) => ch === '_' || ch === '-' || /\s/u.test(ch);

/**
 * 去掉結尾的表情詞（不分大小寫）：結尾是詞表裡的某個詞、而且詞前面緊接著 _、- 或空白時，
 * 連同那一個分隔字元一起去掉（只去一次）。長的詞先比，例如 `_大笑` 會整個去掉。
 */
export function stripExpressionWord(
  base: string,
  words: readonly string[] = EXPRESSION_WORDS,
): string {
  const sorted = [...words].filter(Boolean).sort((a, b) => b.length - a.length);
  for (const w of sorted) {
    const cut = base.length - w.length;
    if (cut <= 0) continue;
    if (base.slice(cut).toLowerCase() !== w.toLowerCase()) continue;
    if (!isSeparator(base[cut - 1])) continue;
    return base.slice(0, cut - 1);
  }
  return base;
}

/**
 * 主名稱自動帶入（F07）：檔名去掉副檔名 → 去掉結尾的表情詞 → 3.2 的清理。
 * 例：`alice_smile.png` → `alice`；`Bob-SMILE.png` → `Bob`；`Bob smile.png` → `Bob`；
 * `smile_alice.png` → `smile_alice`；`x.tar.PNG` → `x.tar`；`chase.png` → `chase`。
 */
export function autoMainName(fileName: string): string {
  return cleanName(stripExpressionWord(stripExtension(fileName.normalize('NFC'))));
}

/** 判斷重複檔案用的鍵：檔名、大小、最後修改時間三者都相同就是同一個檔案（F04） */
export function fileKey(f: { name: string; size: number; lastModified: number }): string {
  return `${f.name}\u0000${f.size}\u0000${f.lastModified}`;
}

/** 瀏覽器回報為圖片的檔案（F03：含 GIF 等；不看內容） */
export function isImageFile(f: { type: string }): boolean {
  return /^image\//i.test(f.type || '');
}

/**
 * 載入後選取哪一張（F10＋主控追加裁定）：還沒有選取、或選取的那張已經不在清單裡時選第一張；
 * 其他情況（加入新檔、全部是重複檔而加入 0 張）維持原本的選取。清單是空的時回傳 null。
 */
export function selectionAfterLoad(
  selectedId: string | null,
  ids: readonly string[],
): string | null {
  if (selectedId !== null && ids.includes(selectedId)) return selectedId;
  return ids[0] ?? null;
}

/** 清單面板在寬畫面時的高度範圍（F11）：最少約一列半、最多 640 px；面板下緣與視窗下緣保留的距離 */
export const LIST_FIT = { min: 140, max: 640, gap: 16 } as const;

/**
 * 清單面板的最大高度（F11＋主控追加裁定）：寬畫面時讓面板下緣停在視窗裡，
 * 方向鍵換選取時只要捲清單自己就看得到選到的列，不必捲整頁。
 * top：面板在頁面上的位置（頁面沒有捲動時的 y）；viewport：視窗高度。視窗太矮時至少保留 min。
 */
export function fitListHeight(
  top: number,
  viewport: number,
  { min, max, gap }: { min: number; max: number; gap: number } = LIST_FIT,
): number {
  return Math.round(Math.min(max, Math.max(min, viewport - top - gap)));
}
