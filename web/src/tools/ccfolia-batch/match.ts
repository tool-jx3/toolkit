/**
 * 圖片庫 ↔ 棋子的對應（不依賴 React；規格 3.6）：圖片名稱和棋子同名就是立繪，「名稱_笑」是差分「笑」。
 *
 * - 比對前名稱做 NFKC（全形括號、底線變半形）、去頭尾空白、小寫。
 * - 差分的分隔：`_` `-` `@` 空白、括號（「名稱(笑)」「名稱[笑]」的結尾括號去掉）。
 * - **最長的名稱優先**：「艾莉絲_童年_笑」是「艾莉絲_童年」的差分，不是「艾莉絲」的。
 * - 名稱之外也比對「立繪的名稱」（表格的立繪欄、×N 的複本是原本的名字），所以「黑影 A～C」共用「黑影」的圖。
 * - 本站的「角色差分管理器」開了編號時輸出「名稱01_笑」：名稱後面接 2 位數以上的編號、再接分隔與差分名的，
 *   也當成那個名稱的差分（本站新增，5. D 項）。
 * 原作照 app.v1.js 的 matchImages／portraitOf／facesOf（MIT）。
 */
import type { Piece, ShelfImage } from './model';
import { wordKey } from './words';

const norm = (s: string): string =>
  String(s || '')
    .normalize('NFKC')
    .trim()
    .toLowerCase();
const SEP = /^[\s_\-@([]/;

export interface AutoImages {
  /** 和「立繪的名稱」同名的圖 */
  byImageName: ShelfImage | null;
  /** 和棋子名稱同名的圖 */
  byName: ShelfImage | null;
  /** 「名稱_差分」的圖（依圖片庫的順序） */
  faces: { label: string; image: ShelfImage }[];
}

/**
 * 每張圖分給名稱是它開頭的棋子（最長的名稱優先）。回傳依棋子的位置。
 */
export function matchImages(pieces: readonly Piece[], images: readonly ShelfImage[]): AutoImages[] {
  const out: AutoImages[] = pieces.map(() => ({ byImageName: null, byName: null, faces: [] }));
  const bases: { k: string; i: number; from: 'byImageName' | 'byName' }[] = [];
  pieces.forEach((p, i) => {
    if (norm(p.imageName)) bases.push({ k: norm(p.imageName), i, from: 'byImageName' });
    if (norm(p.name)) bases.push({ k: norm(p.name), i, from: 'byName' });
  });
  for (const im of images) {
    const n = String(im.name || '')
      .normalize('NFKC')
      .trim();
    const low = n.toLowerCase();
    let best = 0;
    let hits: { b: (typeof bases)[number]; rest: string }[] = [];
    for (const b of bases) {
      let rest: string | null = null;
      if (low === b.k) rest = '';
      else if (low.startsWith(b.k)) {
        const after = low.slice(b.k.length);
        if (SEP.test(after)) rest = n.slice(b.k.length);
        else {
          /* 差分管理器的編號：「名稱01_笑」 */
          const num = /^\d{2,}(?=[\s_\-@([])/.exec(after);
          if (num) rest = n.slice(b.k.length + num[0].length);
        }
      }
      if (rest === null) continue;
      if (b.k.length > best) {
        best = b.k.length;
        hits = [{ b, rest }];
      } else if (b.k.length === best) hits.push({ b, rest });
    }
    for (const { b, rest } of hits) {
      const a = out[b.i];
      if (rest === '') {
        if (!a[b.from]) a[b.from] = im;
        continue;
      }
      const label = rest
        .replace(/^[\s_\-@([]+/, '')
        .replace(/[)\]]\s*$/, '')
        .trim();
      if (label && !a.faces.some((f) => f.image === im)) a.faces.push({ label, image: im });
    }
  }
  return out;
}

/** 依名稱找圖片庫的圖（wordKey 比對；沒有時 null） */
export function imageByName(images: readonly ShelfImage[], name: string): ShelfImage | null {
  const k = wordKey(name);
  return k ? (images.find((im) => wordKey(im.name) === k) ?? null) : null;
}

export const imageById = (images: readonly ShelfImage[], id: string | null): ShelfImage | null =>
  id ? (images.find((im) => im.id === id) ?? null) : null;

/** 棋子的立繪：'none' 沒有、指定的那張、'auto' 時同名的圖（立繪的名稱優先） */
export function portraitOf(
  p: Piece,
  auto: AutoImages | undefined,
  images: readonly ShelfImage[],
): ShelfImage | null {
  if (p.image === 'none') return null;
  if (p.image !== 'auto') return imageById(images, p.image);
  return auto ? (auto.byImageName ?? auto.byName) : null;
}

/** 一個差分（手動的或自動找到的） */
export interface FaceView {
  label: string;
  image: ShelfImage | null;
  /** 自動找到的（「名稱_差分」） */
  auto: boolean;
  /** 手動差分在 piece.faces 的位置（自動的是 -1） */
  index: number;
}

/** 棋子的差分：手動的（與表格的）在前，再接自動找到的（標籤和手動的相同的不重複） */
export function facesOf(
  p: Piece,
  auto: AutoImages | undefined,
  images: readonly ShelfImage[],
): FaceView[] {
  const list: FaceView[] = p.faces.map((f, index) => ({
    label: f.label,
    image: imageById(images, f.imageId) ?? imageByName(images, f.imageName),
    auto: false,
    index,
  }));
  if (p.autoFaces && auto) {
    const used = new Set(list.map((f) => wordKey(f.label)));
    for (const f of auto.faces) {
      const k = wordKey(f.label);
      if (used.has(k)) continue;
      used.add(k);
      list.push({ label: f.label, image: f.image, auto: true, index: -1 });
    }
  }
  return list;
}
