/**
 * PDF 引擎的錯誤（主執行緒、Worker 共用；不 import 其他模組）。
 * Worker 丟回來的錯誤經過 structured clone 只剩 name 與 message，所以 kind 寫在 message 的開頭（`[kind] 說明`），
 * 主執行緒用 `revivePdfError` 還原。
 */

export type PdfErrorKind =
  /** 不是 PDF（找不到 %PDF- 檔頭） */
  | 'not-pdf'
  /** 空檔 */
  | 'empty'
  /** 超過大小上限 */
  | 'too-large'
  /** 要密碼才能打開 */
  | 'password'
  /** 密碼不對 */
  | 'wrong-password'
  /** 檔案壞了、qpdf 打不開 */
  | 'broken'
  /** 頁數超過整頁轉圖的上限 */
  | 'too-many-pages'
  /** 記憶體不足 */
  | 'memory'
  /** 取消 */
  | 'aborted'
  /** 其他 */
  | 'internal';

export class PdfError extends Error {
  readonly kind: PdfErrorKind;
  /** 引擎（qpdf）的原文，給「複製錯誤資訊」用 */
  readonly detail: string;
  constructor(kind: PdfErrorKind, detail = '') {
    super(`[${kind}] ${detail}`.trim());
    this.name = 'PdfError';
    this.kind = kind;
    this.detail = detail;
  }
}

const KINDS: readonly PdfErrorKind[] = [
  'not-pdf',
  'empty',
  'too-large',
  'password',
  'wrong-password',
  'broken',
  'too-many-pages',
  'memory',
  'aborted',
  'internal',
];

/** Worker 丟回來的錯誤還原成 PdfError（其他錯誤：看起來像記憶體不足的歸到 memory，其餘 internal） */
export function revivePdfError(e: unknown): PdfError {
  if (e instanceof PdfError) return e;
  const err = e as { name?: string; message?: string } | null;
  const message = err?.message ?? String(e);
  if (err?.name === 'PdfError') {
    const m = /^\[([a-z-]+)\]\s?([\s\S]*)$/.exec(message);
    const kind = KINDS.find((k) => k === m?.[1]);
    if (kind) return new PdfError(kind, m?.[2] ?? '');
  }
  if (isMemoryMessage(message)) return new PdfError('memory', message);
  return new PdfError('internal', message);
}

/** WebAssembly 或瀏覽器的記憶體不足訊息 */
export function isMemoryMessage(message: string): boolean {
  return /out of memory|memory access out of bounds|allocation failed|array buffer allocation|Cannot enlarge memory|RangeError: Array buffer|invalid array length/i.test(
    message,
  );
}
