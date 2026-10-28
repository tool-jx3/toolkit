/**
 * 移除重複的串流（無損；QC 的 dedupe，改寫成 pdf-lib 的物件模型）。
 *
 * 同一個標誌每頁都有一份、同一張掃描重複放好幾頁時，每一份都完整存著。字典與內容都完全相同的串流可以互相取代，
 * 所以只留第一份、其他的參照改指向它。只合併「字典就決定長相」的種類：影像、內嵌字型、內嵌檔案、中繼資料、ICC 描述檔。
 * **頁面的內容串流不合併**：兩頁的內容一模一樣也可能畫出不同的東西（它們用的資源在各自的頁面字典裡）。
 *
 * 比 QC 多做的：合併之後影像的 /SMask 可能變成指向同一份，原本只差在 /SMask 的影像就能再合併，所以重複做到沒有可合併的（最多 4 輪）。
 */
import {
  PDFArray,
  type PDFContext,
  PDFDict,
  type PDFDocument,
  type PDFObject,
  PDFRawStream,
  PDFRef,
} from 'pdf-lib';
import { isImage, N, nameOf, refKey, resolve } from './objects';

export interface DedupeStats {
  /** 移除的重複串流數 */
  merged: number;
  /** 省下的位元組（串流內容） */
  savedBytes: number;
}

/** 字型檔與 ICC 描述檔的參照（它們的字典沒有寫種類，要從用到它們的地方找） */
function referencedKinds(ctx: PDFContext): Set<string> {
  const keys = new Set<string>();
  const visitArray = (a: PDFArray) => {
    const first = a.size() ? resolve(ctx, a.get(0)) : undefined;
    if (first && nameOf(ctx, first) === 'ICCBased' && a.get(1) instanceof PDFRef) {
      keys.add(refKey(a.get(1) as PDFRef));
    }
    for (const x of a.asArray()) if (x instanceof PDFArray) visitArray(x);
  };
  for (const [, obj] of ctx.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFDict ? obj : obj instanceof PDFRawStream ? obj.dict : null;
    if (obj instanceof PDFArray) visitArray(obj);
    if (!dict) continue;
    if (nameOf(ctx, dict.get(N('Type'))) === 'FontDescriptor') {
      for (const k of ['FontFile', 'FontFile2', 'FontFile3']) {
        const v = dict.get(N(k));
        if (v instanceof PDFRef) keys.add(refKey(v));
      }
    }
    for (const v of dict.values()) if (v instanceof PDFArray) visitArray(v);
  }
  return keys;
}

function dedupable(ctx: PDFContext, ref: PDFRef, s: PDFRawStream, kinds: Set<string>): boolean {
  if (isImage(ctx, s.dict)) return true;
  const type = nameOf(ctx, s.dict.get(N('Type')));
  if (type === 'Metadata' || type === 'EmbeddedFile') return true;
  return kinds.has(refKey(ref));
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** FNV-1a（只用來分組；最後一定逐位元組比對） */
function hash(bytes: Uint8Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    h ^= bytes[i];
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 把物件裡指向 remap 的參照換掉（字典、陣列、串流的字典，直接物件會往下找） */
function remapIn(obj: PDFObject, remap: Map<string, PDFRef>, seen: Set<PDFObject>): void {
  if (seen.has(obj)) return;
  seen.add(obj);
  if (obj instanceof PDFRawStream) {
    remapIn(obj.dict, remap, seen);
    return;
  }
  if (obj instanceof PDFDict) {
    for (const [k, v] of obj.entries()) {
      if (v instanceof PDFRef) {
        const to = remap.get(refKey(v));
        if (to) obj.set(k, to);
      } else if (v instanceof PDFDict || v instanceof PDFArray) remapIn(v, remap, seen);
    }
    return;
  }
  if (obj instanceof PDFArray) {
    for (let i = 0; i < obj.size(); i++) {
      const v = obj.get(i);
      if (v instanceof PDFRef) {
        const to = remap.get(refKey(v));
        if (to) obj.set(i, to);
      } else if (v instanceof PDFDict || v instanceof PDFArray) remapIn(v, remap, seen);
    }
  }
}

function oneRound(doc: PDFDocument): DedupeStats {
  const ctx = doc.context;
  const kinds = referencedKinds(ctx);
  const groups = new Map<string, [PDFRef, PDFRawStream][]>();
  const remap = new Map<string, PDFRef>();
  let savedBytes = 0;
  for (const [ref, obj] of ctx.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream) || !dedupable(ctx, ref, obj, kinds)) continue;
    const key = `${obj.contents.length}|${hash(obj.contents)}|${obj.dict.toString()}`;
    const list = groups.get(key);
    if (!list) {
      groups.set(key, [[ref, obj]]);
      continue;
    }
    const keep = list.find(([, s]) => sameBytes(s.contents, obj.contents));
    if (keep) {
      remap.set(refKey(ref), keep[0]);
      savedBytes += obj.contents.length;
    } else list.push([ref, obj]);
  }
  if (!remap.size) return { merged: 0, savedBytes: 0 };
  const seen = new Set<PDFObject>();
  for (const [, obj] of ctx.enumerateIndirectObjects()) remapIn(obj, remap, seen);
  /* 文件尾的 /Root、/Info 不會指向這些串流，但目錄（Catalog）等都已在上面的迴圈處理 */
  for (const key of remap.keys()) {
    const [num, gen] = key.split(' ').map(Number);
    ctx.delete(PDFRef.of(num, gen));
  }
  return { merged: remap.size, savedBytes };
}

/** 合併重複的串流（就地修改 doc） */
export function dedupeStreams(doc: PDFDocument, rounds = 4): DedupeStats {
  const total: DedupeStats = { merged: 0, savedBytes: 0 };
  for (let r = 0; r < rounds; r++) {
    const s = oneRound(doc);
    total.merged += s.merged;
    total.savedBytes += s.savedBytes;
    if (!s.merged) break;
  }
  return total;
}
