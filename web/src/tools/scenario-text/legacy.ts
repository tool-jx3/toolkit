/**
 * 讀原作（shiki365/scenario-text-maker）的專案檔（規格 2、5. D5）：
 * `{ tool: "scenario-text-maker", version: 2, state: { images: [{ id, kind, name, type, size, hash, credit, dataUrl | url }], speakers, script, opts, edited, confirmed } }`，
 * 或直接是 state。更舊的格式把圖直接放在說話者、差分上（`image: { kind: "file", dataUrl, fileName } | { kind: "url", url }`），
 * 讀入時搬進圖片庫（同一個 data URL 或網址只放一次）。不依賴 React；圖片內容交給呼叫端放進資產庫。
 */
import { sniffImageMime } from '@/ccfolia';
import { baseName, cleanDoc, type Doc, uid, urlImageName } from './model';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** 圖片庫的檔案圖：內容先放這裡，呼叫端存進資產庫後把 asset 填上 */
export interface LegacyFile {
  /** 圖片庫的 id */
  id: string;
  bytes: Uint8Array;
  type: string;
}

export interface LegacyProject {
  /** 整理過的內容（檔案圖的 asset 是暫時的空字串，呼叫端依 files 填上） */
  doc: Doc;
  files: LegacyFile[];
}

/** 看起來是原作的專案檔（或 state） */
export function isLegacyProject(json: unknown): boolean {
  if (!isObj(json)) return false;
  if (json.tool === 'scenario-text-maker') return true;
  const s = isObj(json.state) ? json.state : json;
  return Array.isArray(s.speakers) && ('script' in s || 'opts' in s) && !('format' in json);
}

/** data URL → 位元組與 MIME（壞掉時 null；MIME 依檔頭修正） */
export function fromDataUrl(dataUrl: unknown): { bytes: Uint8Array; type: string } | null {
  if (typeof dataUrl !== 'string') return null;
  const m = /^data:([^;,]*)(;base64)?,([\s\S]*)$/i.exec(dataUrl);
  if (!m) return null;
  try {
    const raw = m[2] ? atob(m[3]) : decodeURIComponent(m[3]);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i) & 0xff;
    const type = sniffImageMime(bytes) ?? m[1];
    return bytes.length ? { bytes, type } : null;
  } catch {
    return null;
  }
}

/** 原作的專案檔 → 新版的內容＋要放進資產庫的圖。不是原作的專案檔時 null。 */
export function readLegacyProject(json: unknown): LegacyProject | null {
  if (!isLegacyProject(json)) return null;
  const root = json as Obj;
  const s: Obj = { ...(isObj(root.state) ? root.state : root) };
  const files: LegacyFile[] = [];
  const images: Obj[] = [];
  /** data URL 或網址 → 圖片庫 id（同一張只放一次） */
  const seen = new Map<string, string>();

  const addFile = (meta: Obj, dataUrl: string, name: string): string | null => {
    const got = fromDataUrl(dataUrl);
    if (!got) return null;
    const id = meta.id ? String(meta.id) : uid('i');
    files.push({ id, bytes: got.bytes, type: got.type });
    images.push({
      id,
      kind: 'file',
      name,
      credit: typeof meta.credit === 'string' ? meta.credit : '',
      asset: 'pending',
      type: got.type,
      size: got.bytes.length,
    });
    return id;
  };

  for (const im of Array.isArray(s.images) ? s.images : []) {
    if (!isObj(im) || !im.id) continue;
    if (im.kind === 'file' && typeof im.dataUrl === 'string') {
      const id = addFile(im, im.dataUrl, String(im.name ?? '') || '圖片');
      if (id) seen.set(im.dataUrl, id);
    } else if (im.kind === 'url' && typeof im.url === 'string') {
      images.push({ ...im, credit: typeof im.credit === 'string' ? im.credit : '' });
      seen.set(im.url, String(im.id));
    }
    /* 沒有內容的檔案圖（原作存在 IndexedDB、專案檔沒帶）略過 */
  }

  /** 舊格式：說話者、差分直接帶圖 */
  const legacyRef = (img: unknown): string | null => {
    if (!isObj(img)) return null;
    const k = img.kind === 'file' ? img.dataUrl : img.kind === 'url' ? img.url : null;
    if (typeof k !== 'string' || !k) return null;
    const hit = seen.get(k);
    if (hit) return hit;
    let id: string | null;
    if (img.kind === 'file') {
      id = addFile({}, k, baseName(typeof img.fileName === 'string' ? img.fileName : ''));
    } else {
      id = uid('i');
      images.push({ id, kind: 'url', name: urlImageName(k), credit: '', url: k });
    }
    if (id) seen.set(k, id);
    return id;
  };

  const speakers = Array.isArray(s.speakers)
    ? s.speakers.filter(isObj).map((sp) => {
        const out: Obj = { ...sp };
        if ('image' in sp) {
          if (!out.imageId) out.imageId = legacyRef(sp.image);
          delete out.image;
        }
        out.faces = Array.isArray(sp.faces)
          ? sp.faces.filter(isObj).map((f) => {
              const face: Obj = { ...f };
              if ('image' in f) {
                if (!face.imageId) face.imageId = legacyRef(f.image);
                delete face.image;
              }
              return face;
            })
          : [];
        return out;
      })
    : undefined;

  const doc = cleanDoc({ ...s, images, ...(speakers ? { speakers } : {}) });
  /* 行號：原作手動加的是空字串，cleanEntry 已換成 null */
  return { doc, files };
}
