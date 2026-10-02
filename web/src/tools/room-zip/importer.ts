/**
 * 匯入圖片（規格 3.3.1、F035～F046；瀏覽器）：動態圖原樣保留；轉檔開啟時等比縮到長邊上限並轉成 WebP（品質 0.8），
 * 轉完比原檔大就保留原檔；PNG／JPEG／GIF／WebP 以外的格式一律轉成 PNG（第 7 節裁定 D8）；
 * 以處理後的內容算 SHA-256 決定識別名，已有同名素材就算合併（那張素材的圖片資料不見了時順便補回，F280）。
 */
import { packRoomImage, roomImageExt } from '@/ccfolia';
import { addMaterial, autoRoomBackground } from './actions';
import {
  ANIMATION_SCAN_BYTES,
  baseName,
  guessTag,
  isAnimatedImage,
  LARGE_ANIMATION_BYTES,
} from './materials';
import type { Material, Tag } from './model';
import { commit, hasBlob, putBlob, setSession, settings, useProject } from './store';

export const WEBP_QUALITY = 0.8;

export function canvasBlob(
  c: HTMLCanvasElement | OffscreenCanvas,
  type: string,
  quality?: number,
): Promise<Blob | null> {
  if ('convertToBlob' in c) return c.convertToBlob({ type, quality }).catch(() => null);
  return new Promise((res) => c.toBlob(res, type, quality));
}

function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** 等比縮到長邊 ≤ maxEdge（不放大；四捨五入、至少 1） */
export function shrinkSize(w: number, h: number, maxEdge: number) {
  const k = Math.min(1, maxEdge / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * k)), height: Math.max(1, Math.round(h * k)) };
}

async function encode(bmp: ImageBitmap, w: number, h: number, type: string, quality?: number) {
  const c = canvas(w, h);
  c.getContext('2d')?.drawImage(bmp, 0, 0, w, h);
  return canvasBlob(c, type, quality);
}

export interface Processed {
  blob: Blob;
  mime: string;
  width: number;
  height: number;
  animated: boolean;
  /** 推測用途用的寬高（轉檔時為縮小後的尺寸，同舊版） */
  guessWidth: number;
  guessHeight: number;
}

/** 處理一個檔案（不是圖片或解碼失敗時丟錯） */
export async function processFile(file: File, { preserve = false } = {}): Promise<Processed> {
  if (!/^image\//.test(file.type)) throw new Error('not-image');
  const head = new Uint8Array(await file.slice(0, ANIMATION_SCAN_BYTES).arrayBuffer());
  const animated = isAnimatedImage(head, file.type, file.name);
  const s = settings();
  if (animated) {
    let width = 0;
    let height = 0;
    try {
      const bmp = await createImageBitmap(file);
      width = bmp.width;
      height = bmp.height;
      bmp.close();
    } catch {
      /* 尺寸未知也照樣保留 */
    }
    return {
      blob: file,
      mime: file.type,
      width,
      height,
      animated,
      guessWidth: width,
      guessHeight: height,
    };
  }
  const bmp = await createImageBitmap(file);
  try {
    const ow = bmp.width;
    const oh = bmp.height;
    let blob: Blob = file;
    let mime = file.type;
    let width = ow;
    let height = oh;
    let gw = ow;
    let gh = oh;
    if (s.convert && !preserve) {
      const t = shrinkSize(ow, oh, Math.max(1, Number(s.maxEdge) || 1200));
      gw = t.width;
      gh = t.height;
      const webp = await encode(bmp, t.width, t.height, 'image/webp', WEBP_QUALITY);
      if (webp && webp.type === 'image/webp' && webp.size < file.size) {
        blob = webp;
        mime = 'image/webp';
        width = t.width;
        height = t.height;
      }
    }
    if (!roomImageExt(mime)) {
      /* D8：BMP、AVIF 等轉成 PNG（原尺寸） */
      const png = await encode(bmp, ow, oh, 'image/png');
      if (!png) throw new Error('encode');
      blob = png;
      mime = 'image/png';
      width = ow;
      height = oh;
    }
    return { blob, mime, width, height, animated: false, guessWidth: gw, guessHeight: gh };
  } finally {
    bmp.close();
  }
}

export interface ImportResult {
  /** 這次處理到的素材名稱（新增的與合併的，依順序） */
  names: string[];
  added: number;
  dup: number;
  failed: number;
  /** 這次加入的大型動態圖（F044） */
  heavy: Material[];
}

export interface ImportOptions {
  /** 不轉檔（合成圖製作器的輸出） */
  preserve?: boolean;
  /** 加入後覆寫名稱與標籤（單色圖、加工結果、最愛） */
  label?: string;
  tags?: Tag[];
  /** 顯示忙碌遮罩（F017） */
  busyTitle?: string;
}

/** 匯入檔案到素材一覽；結束時房間背景是空的就自動設定（F043） */
export async function importFiles(
  files: readonly File[],
  opts: ImportOptions = {},
): Promise<ImportResult> {
  const out: ImportResult = { names: [], added: 0, dup: 0, failed: 0, heavy: [] };
  const total = files.length;
  const busy = opts.busyTitle ?? (total > 1 ? '匯入圖片中' : '讀取圖片中');
  setSession({ busy: { title: busy, detail: '', done: 0, total } });
  try {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setSession({ busy: { title: busy, detail: file.name, done: i, total } });
      try {
        const r = await processFile(file, { preserve: opts.preserve });
        const packed = await packRoomImage(r.blob, r.mime);
        const exists = useProject.getState().data.materials.some((m) => m.name === packed.name);
        const blob = new Blob([packed.data as Uint8Array<ArrayBuffer>], { type: packed.type });
        if (exists) {
          /* 同名＝同內容：圖片資料不見了（換了瀏覽器、清掉網站資料）時，用這次的檔案補回（同舊版） */
          if (!hasBlob(packed.name)) await putBlob(packed.name, blob);
          out.dup++;
          out.names.push(packed.name);
          continue;
        }
        await putBlob(packed.name, blob);
        const m: Material = {
          name: packed.name,
          label: opts.label ?? baseName(file.name),
          tags: opts.tags ?? [r.animated ? 'effect' : guessTag(r.guessWidth, r.guessHeight)],
          animated: r.animated,
          originalName: file.name,
          mime: packed.type,
          before: file.size,
          after: packed.data.byteLength,
          width: r.width,
          height: r.height,
        };
        commit((d) => {
          addMaterial(d, m);
        });
        out.added++;
        out.names.push(m.name);
        if (m.animated && m.after > LARGE_ANIMATION_BYTES) out.heavy.push(m);
      } catch {
        out.failed++;
      }
    }
    commit((d) => autoRoomBackground(d));
    setSession({ busy: { title: busy, detail: '', done: total, total } });
  } finally {
    setTimeout(() => setSession({ busy: null }), 180);
  }
  return out;
}

/** 匯入結果的通知文字（F045） */
export function importMessage(r: ImportResult): { text: string; ok: boolean } {
  let text = `新增 ${r.added} 張`;
  if (r.dup) text += `，合併 ${r.dup} 張重複的圖`;
  if (r.failed) text += `，${r.failed} 張無法讀取`;
  return { text, ok: r.added > 0 };
}

/** Blob → File（製作出來的圖照一般匯入規則加入） */
export const asFile = (blob: Blob, name: string, type = blob.type): File =>
  new File([blob], name, { type });
