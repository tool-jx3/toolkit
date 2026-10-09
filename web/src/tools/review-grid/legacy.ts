/**
 * 原作（sotsotssi/scenario-review）的「資料備份」JSON（規格 3.8）：
 * `{ profile: { img, nickname, handle }, scenarios: [{ img, rule, title, writer, comment, chips }] }`，
 * 圖片是 data URL。原作開頁時每一格就填好的示範字（暱稱、規則、劇本名稱、作者）與感想的提示字沒改過時當成空白。
 * 這裡只解析（純函式）；圖片放進圖片庫在 legacyImport.ts。
 */
import { type Cell, cleanTag, clipText, emptyCell, LIMITS, nextId, oneLine } from './model';

/** 原作開頁時就填好的字、感想欄的提示字（沒改過時當成空白） */
export const ORIGINAL_DEFAULTS = {
  nickname: '닉네임',
  handle: '@아이디 혹은 코멘트',
  rule: '룰 이름',
  title: '시나리오 제목',
  writer: '라이터 이름',
  comment: '이 시나리오에 대한 코멘트를 자유롭게 남겨주세요.',
} as const;

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** 是不是原作的備份（有 scenarios 陣列；profile 有的話是物件） */
export function isLegacyBackup(raw: unknown): raw is Record<string, unknown> {
  return (
    isObj(raw) &&
    Array.isArray(raw.scenarios) &&
    (raw.profile === undefined || raw.profile === null || isObj(raw.profile))
  );
}

/** 單行欄位：去頭尾空白；等於原作的示範字時當成空白 */
function field(v: unknown, def: string, n: number): string {
  if (typeof v !== 'string') return '';
  const t = v.trim();
  return t === def ? '' : oneLine(t, n);
}

/** 圖片的 data URL（不是圖片時 null） */
export function imageDataUrl(v: unknown): string | null {
  return typeof v === 'string' && /^data:image\//i.test(v.trim()) ? v.trim() : null;
}

export interface LegacyBackup {
  profile: { name: string; handle: string; image: string | null };
  /** 格子（圖片先不放，見 images） */
  cells: Cell[];
  /** 每一格的圖片 data URL（索引同 cells） */
  images: (string | null)[];
  /** 超過格數上限、沒讀的 */
  dropped: number;
}

export function fromLegacyBackup(raw: Record<string, unknown>): LegacyBackup {
  const p = isObj(raw.profile) ? raw.profile : {};
  const list = Array.isArray(raw.scenarios) ? raw.scenarios : [];
  const cells: Cell[] = [];
  const images: (string | null)[] = [];
  for (const s0 of list.slice(0, LIMITS.cells)) {
    const s = isObj(s0) ? s0 : {};
    const c = emptyCell(nextId('c', cells));
    c.rule = field(s.rule, ORIGINAL_DEFAULTS.rule, LIMITS.rule);
    c.title = field(s.title, ORIGINAL_DEFAULTS.title, LIMITS.title);
    c.writer = field(s.writer, ORIGINAL_DEFAULTS.writer, LIMITS.writer);
    const comment = typeof s.comment === 'string' ? s.comment.replace(/\r\n?/g, '\n') : '';
    c.comment =
      comment.trim() === ORIGINAL_DEFAULTS.comment ? '' : clipText(comment.trim(), LIMITS.comment);
    if (Array.isArray(s.chips))
      for (const t of s.chips) {
        if (typeof t !== 'string') continue;
        const tag = cleanTag(t);
        if (tag && !c.tags.includes(tag) && c.tags.length < LIMITS.tagsPerCell) c.tags.push(tag);
      }
    cells.push(c);
    images.push(imageDataUrl(s.img));
  }
  if (!cells.length) {
    cells.push(emptyCell('c1'));
    images.push(null);
  }
  return {
    profile: {
      name: field(p.nickname, ORIGINAL_DEFAULTS.nickname, LIMITS.name),
      handle: field(p.handle, ORIGINAL_DEFAULTS.handle, LIMITS.handle),
      image: imageDataUrl(p.img),
    },
    cells,
    images,
    dropped: Math.max(0, list.length - LIMITS.cells),
  };
}
