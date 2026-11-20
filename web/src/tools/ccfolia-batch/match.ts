/**
 * 圖片庫 ↔ 棋子的對應（不依賴 React；規格 3.6）：圖片名稱和棋子同名就是立繪，「名稱_笑」是差分「笑」。
 *
 * - 比對前名稱做 NFKC（全形括號、底線變半形）、去頭尾空白、小寫。
 * - 差分的分隔：`_` `-` `@` 空白、括號（「名稱(笑)」「名稱[笑]」的結尾括號去掉）。
 * - **最長的名稱優先**：「艾莉絲_童年_笑」是「艾莉絲_童年」的差分，不是「艾莉絲」的。
 * - 名稱之外也比對「立繪的名稱」（表格的立繪欄、×N 的複本是原本的名字），所以「黑影 A～C」共用「黑影」的圖。
 * - 本站的「角色差分管理器」開了編號時輸出「名稱01_笑」：名稱後面接 2 位數以上的編號、再接分隔與差分名的，
 *   也當成那個名稱的差分（本站新增，5. D 項）。
 * 對應的規則參考原作（shiki365／キャラクター一括メーカー，MIT）。
 */
import type { Piece, ShelfImage } from './model';
import { wordKey } from './words';

export interface AutoImages {
  /** 和「立繪的名稱」同名的圖 */
  byImageName: ShelfImage | null;
  /** 和棋子名稱同名的圖 */
  byName: ShelfImage | null;
  /** 「名稱_差分」的圖（依圖片庫的順序） */
  faces: { label: string; image: ShelfImage }[];
}

/** 比對的起點：某個棋子的名稱或立繪的名稱 */
interface Anchor {
  /** 比對用的寫法（NFKC、去頭尾空白、小寫） */
  key: string;
  piece: number;
  slot: 'byImageName' | 'byName';
}

const shown = (s: string): string =>
  String(s || '')
    .normalize('NFKC')
    .trim();
const FACE_SEP = '[\\s_\\-@([]';
const STARTS_WITH_SEP = new RegExp(`^${FACE_SEP}`);
/** 差分管理器的編號：「名稱01_笑」的「01」 */
const SERIAL = new RegExp(`^\\d{2,}(?=${FACE_SEP})`);
const LEADING_SEPS = new RegExp(`^${FACE_SEP}+`);

/** 圖片名稱接在起點後面的部分：同名 → ''；「_笑」「01_笑」→ 後面的原文；不是這個起點的圖時 null */
function restAfter(name: string, lower: string, key: string): string | null {
  if (lower === key) return '';
  if (!lower.startsWith(key)) return null;
  const tail = lower.slice(key.length);
  if (STARTS_WITH_SEP.test(tail)) return name.slice(key.length);
  const serial = SERIAL.exec(tail)?.[0];
  return serial ? name.slice(key.length + serial.length) : null;
}

/** 「_笑」「(笑)」→「笑」 */
const faceLabel = (rest: string): string =>
  rest
    .replace(LEADING_SEPS, '')
    .replace(/[)\]]\s*$/, '')
    .trim();

/** 一張圖對到的起點：只留最長的（一樣長的都留，依棋子的順序） */
function longestAnchors(
  anchors: readonly Anchor[],
  name: string,
): { anchor: Anchor; rest: string }[] {
  const lower = name.toLowerCase();
  const found: { anchor: Anchor; rest: string }[] = [];
  for (const anchor of anchors) {
    /* anchors 依長度由長到短排好：比已經對到的短就不用再看 */
    if (found.length && anchor.key.length < found[0].anchor.key.length) break;
    const rest = restAfter(name, lower, anchor.key);
    if (rest !== null) found.push({ anchor, rest });
  }
  return found;
}

/** 每張圖分給名稱是它開頭的棋子（最長的名稱優先）；回傳依棋子的位置 */
export function assignShelfImages(
  pieces: readonly Piece[],
  images: readonly ShelfImage[],
): AutoImages[] {
  const result = pieces.map((): AutoImages => ({ byImageName: null, byName: null, faces: [] }));
  const anchors = pieces
    .flatMap((p, piece): Anchor[] => [
      { key: shown(p.imageName).toLowerCase(), piece, slot: 'byImageName' },
      { key: shown(p.name).toLowerCase(), piece, slot: 'byName' },
    ])
    .filter((a) => a.key !== '')
    .sort((a, b) => b.key.length - a.key.length);
  for (const image of images) {
    for (const { anchor, rest } of longestAnchors(anchors, shown(image.name))) {
      const target = result[anchor.piece];
      if (rest === '') {
        target[anchor.slot] ??= image;
        continue;
      }
      const label = faceLabel(rest);
      if (label !== '' && target.faces.every((f) => f.image !== image)) {
        target.faces.push({ label, image });
      }
    }
  }
  return result;
}

/** 依名稱找圖片庫的圖（wordKey 比對；沒有時 null） */
export function shelfImageNamed(images: readonly ShelfImage[], name: string): ShelfImage | null {
  const want = wordKey(name);
  if (!want) return null;
  return images.find((im) => wordKey(im.name) === want) ?? null;
}

export function shelfImageById(
  images: readonly ShelfImage[],
  id: string | null,
): ShelfImage | null {
  if (!id) return null;
  return images.find((im) => im.id === id) ?? null;
}

/** 棋子的立繪：'none' 沒有、指定的那張、'auto' 時同名的圖（立繪的名稱優先） */
export function pickPortrait(
  p: Piece,
  auto: AutoImages | undefined,
  images: readonly ShelfImage[],
): ShelfImage | null {
  switch (p.image) {
    case 'none':
      return null;
    case 'auto':
      return auto?.byImageName ?? auto?.byName ?? null;
    default:
      return shelfImageById(images, p.image);
  }
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

/** 棋子的差分：手動的（與表格的）在前，再接自動找到的（標籤和前面相同的不重複） */
export function listFaces(
  p: Piece,
  auto: AutoImages | undefined,
  images: readonly ShelfImage[],
): FaceView[] {
  const manual = p.faces.map(
    (f, index): FaceView => ({
      label: f.label,
      image: shelfImageById(images, f.imageId) ?? shelfImageNamed(images, f.imageName),
      auto: false,
      index,
    }),
  );
  if (!p.autoFaces || !auto) return manual;
  const taken = new Set(manual.map((f) => wordKey(f.label)));
  const found: FaceView[] = [];
  for (const { label, image } of auto.faces) {
    const key = wordKey(label);
    if (taken.has(key)) continue;
    taken.add(key);
    found.push({ label, image, auto: true, index: -1 });
  }
  return [...manual, ...found];
}
