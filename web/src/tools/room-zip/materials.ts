/**
 * 素材的規則（不依賴 React 與 DOM）：動態圖判斷（2.）、用途標籤推測（F042）、容量顯示（F046）、篩選（F050、F051、F081）、
 * 使用處清單（F063）、引用的取代與清除（F128、D2）、遺失圖片（3.2.12、F279、F280）。
 */
import { isRoomImageName } from '@/ccfolia';
import { type Material, NAMES, type Project, TAGS, type Tag } from './model';

export const TAG_LABELS: Record<Tag, string> = {
  fg: '前景',
  tachie: '立繪',
  panel: '面板',
  frame: '外框',
  icon: '棋子圖示',
  effect: '演出',
  other: '其他',
};

/** 標籤名稱 → 標籤（篩選、匯入範本時用） */
export const tagFromLabel = (s: string): Tag | undefined =>
  TAGS.find((t) => TAG_LABELS[t] === s || t === s);

/**
 * 依寬高比 a＝寬÷高 推測用途（依序判斷，先成立者為準，F042）：
 * a ≥ 2.1 → 外框；a ≥ 1.15 且寬 ≥ 800 → 前景；0.85 ≤ a ≤ 1.15 且寬 ≤ 512 → 棋子圖示；
 * a ≤ 0.9 且高 ≥ 700 → 立繪；a ≤ 0.9 → 面板；其他 → 其他。
 */
export function guessTag(w: number, h: number): Tag {
  if (!w || !h) return 'other';
  const a = w / h;
  if (a >= 2.1) return 'frame';
  if (a >= 1.15 && w >= 800) return 'fg';
  if (a >= 0.85 && a <= 1.15 && w <= 512) return 'icon';
  if (a <= 0.9 && h >= 700) return 'tachie';
  if (a <= 0.9) return 'panel';
  return 'other';
}

/** 動態圖判斷時看的檔頭長度 */
export const ANIMATION_SCAN_BYTES = 256 * 1024;

/**
 * 動態圖（規格 2.）：GIF 一律算動態；PNG 在前 256 KiB 內、影像資料（IDAT）之前出現動畫控制區塊（acTL）；
 * WebP 在前 256 KiB 內有 ANIM 區塊或 VP8X 標頭的動畫旗標。PNG／WebP 以 MIME 或副檔名決定要不要檢查（看檔頭內容）。
 */
export function isAnimatedImage(head: Uint8Array, mime: string, fileName = ''): boolean {
  const type = (mime || '').toLowerCase();
  if (type === 'image/gif') return true;
  const b = head.subarray(0, ANIMATION_SCAN_BYTES);
  const is = (i: number, s: string) =>
    b[i] === s.charCodeAt(0) &&
    b[i + 1] === s.charCodeAt(1) &&
    b[i + 2] === s.charCodeAt(2) &&
    b[i + 3] === s.charCodeAt(3);
  if (/webp/.test(type) || /\.webp$/i.test(fileName)) {
    for (let i = 0; i + 8 < b.length; i++) {
      if (is(i, 'ANIM')) return true;
      if (is(i, 'VP8X') && b[i + 8] & 0x02) return true;
    }
    return false;
  }
  if (!/png/.test(type) && !/\.png$/i.test(fileName)) return false;
  for (let i = 8; i + 8 < b.length; i++) {
    if (is(i, 'acTL')) return true;
    if (is(i, 'IDAT')) return false;
  }
  return false;
}

/** 容量（F046）：未滿 1 KB「n B」、KB 不帶小數、MB 一位小數（1 KB＝1024 B） */
export function formatKb(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** MB，一位小數（F044 的大型動態圖提醒） */
export const formatMb = (n: number): string => `${Math.round((n / 1048576) * 10) / 10} MB`;

/** 容量合計（F046）：原始合計 → 處理後合計（減少 N%） */
export function sizeTotals(materials: readonly Material[]) {
  const before = materials.reduce((s, m) => s + (m.before || 0), 0);
  const after = materials.reduce((s, m) => s + (m.after || 0), 0);
  const saved = before > 0 ? Math.max(0, Math.round((1 - after / before) * 100)) : 0;
  return { before, after, saved };
}

/** 大型動態圖（F044：> 2 MiB） */
export const LARGE_ANIMATION_BYTES = 2 * 1024 * 1024;
/** 淡入淡出動態圖的結果提示（F102：> 1 MiB） */
export const LARGE_FADE_BYTES = 1024 * 1024;

export const tagsLabel = (m: Material): string => m.tags.map((t) => TAG_LABELS[t]).join('・');

/** 素材一覽的篩選（F050、F051）：名稱包含（不分大小寫）、標籤有任一個符合 */
export function filterMaterials(
  list: readonly Material[],
  query: string,
  tags: readonly Tag[],
): Material[] {
  const q = query.trim().toLowerCase();
  return list.filter(
    (m) =>
      (!q || m.label.toLowerCase().includes(q)) &&
      (!tags.length || tags.some((t) => m.tags.includes(t))),
  );
}

/** 選圖面板的篩選（F081）：「名稱＋標籤名稱」包含輸入字（不分大小寫）；role 有值時只列帶該標籤的 */
export function filterForPicker(
  list: readonly Material[],
  query: string,
  role: Tag | null,
): Material[] {
  const q = query.trim().toLowerCase();
  return list.filter(
    (m) =>
      (!role || m.tags.includes(role)) &&
      (!q || `${m.label} ${tagsLabel(m)}`.toLowerCase().includes(q)),
  );
}

/** 切換標籤（F054、F058）：全部取消時自動變成「其他」 */
export function toggleTag(tags: readonly Tag[], tag: Tag, on: boolean): Tag[] {
  let out = tags.filter((t) => t !== tag);
  if (on) out = tags.includes(tag) ? [...tags] : [...tags, tag];
  return out.length ? out : ['other'];
}

/* ---------- 使用處（F063） ---------- */

export type UsageTarget =
  | { page: 'room' }
  | { page: 'room'; partId: string }
  | { page: 'tachie'; id: string }
  | { page: 'cutins'; id: string }
  | { page: 'pieces'; id: string }
  | { page: 'scenes'; sceneId: string };

export interface Usage {
  label: string;
  target: UsageTarget;
}

/** 這張圖用在哪些地方（房間背景／前景、部件、立繪、切入、棋子、各場景的前景、背景、演出、登場立繪、差異） */
export function materialUsages(project: Project, name: string): Usage[] {
  const out: Usage[] = [];
  const add = (label: string, target: UsageTarget) => out.push({ label, target });
  const r = project.room;
  if (r.backgroundUrl === name) add('房間背景', { page: 'room' });
  if (r.foregroundUrl === name) add('房間前景', { page: 'room' });
  for (const p of project.parts)
    if (p.imageUrl === name)
      add(`${p.kind === 'panel' ? '螢幕面板' : '共用標記'}「${p.name}」`, {
        page: 'room',
        partId: p.id,
      });
  for (const t of project.tachie)
    if (t.imageUrl === name)
      add(`立繪「${t.expression || t.character || NAMES.tachie}」`, { page: 'tachie', id: t.id });
  for (const c of project.cutins)
    if (c.imageUrl === name) add(`切入「${c.name || NAMES.cutin}」`, { page: 'cutins', id: c.id });
  for (const p of project.pieces) {
    if (p.iconUrl === name) add(`棋子「${p.name}」的圖示`, { page: 'pieces', id: p.id });
    for (const f of p.faces)
      if (f.iconUrl === name)
        add(`棋子「${p.name}」的差分「${f.label}」`, { page: 'pieces', id: p.id });
  }
  for (const s of project.scenes) {
    const sn = s.name || NAMES.scene;
    const target: UsageTarget = { page: 'scenes', sceneId: s.id };
    if (s.foregroundUrl === name) add(`場景「${sn}」的前景`, target);
    if (s.backgroundMode === 'image' && s.backgroundUrl === name)
      add(`場景「${sn}」的背景`, target);
    for (const m of s.markers)
      if (m.imageUrl === name)
        add(
          m.kind === 'tachie'
            ? `場景「${sn}」的登場立繪「${m.name}」`
            : `場景「${sn}」的演出「${m.name}」`,
          target,
        );
    for (const [id, o] of Object.entries(s.overrides))
      if (o?.imageUrl === name) {
        const p = project.parts.find((x) => x.id === id);
        add(`場景「${sn}」的共用標記「${p?.name ?? ''}」`, target);
      }
  }
  return out;
}

/* ---------- 引用的取代與清除 ---------- */

/**
 * 把專案裡所有引用 oldName 的地方換成 newName（F128；null＝清除引用，D2）：房間、部件、立繪、切入、棋子（圖示、差分）、
 * 場景前景／背景、演出與登場立繪、場景差異、場景範本。清除時場景差異的換圖整項取消（回到共用的圖）。
 */
export function replaceImageRefs(project: Project, oldName: string, newName: string | null): void {
  const sw = <T extends object, K extends keyof T>(o: T, k: K) => {
    if (o[k] === (oldName as unknown)) o[k] = newName as T[K];
  };
  sw(project.room, 'backgroundUrl');
  sw(project.room, 'foregroundUrl');
  for (const p of project.parts) sw(p, 'imageUrl');
  for (const t of project.tachie) sw(t, 'imageUrl');
  for (const c of project.cutins) sw(c, 'imageUrl');
  for (const p of project.pieces) {
    sw(p, 'iconUrl');
    for (const f of p.faces) sw(f, 'iconUrl');
  }
  const scenes = [...project.scenes, ...project.sceneTemplates];
  for (const s of scenes) {
    sw(s, 'foregroundUrl');
    sw(s, 'backgroundUrl');
    for (const m of s.markers) sw(m, 'imageUrl');
    for (const o of Object.values(s.overrides)) {
      if (o?.imageUrl !== oldName) continue;
      if (newName) o.imageUrl = newName;
      else delete o.imageUrl;
    }
  }
}

/** 專案裡引用到的所有房間圖片名稱（素材一覽本身不算） */
export function referencedImages(project: Project): Set<string> {
  const out = new Set<string>();
  const add = (v: string | null | undefined) => {
    if (v && isRoomImageName(v)) out.add(v);
  };
  add(project.room.backgroundUrl);
  add(project.room.foregroundUrl);
  for (const p of project.parts) add(p.imageUrl);
  for (const t of project.tachie) add(t.imageUrl);
  for (const c of project.cutins) add(c.imageUrl);
  for (const p of project.pieces) {
    add(p.iconUrl);
    for (const f of p.faces) add(f.iconUrl);
  }
  for (const s of [...project.scenes, ...project.sceneTemplates]) {
    add(s.foregroundUrl);
    add(s.backgroundUrl);
    for (const m of s.markers) add(m.imageUrl);
    for (const o of Object.values(s.overrides)) add(o?.imageUrl ?? null);
  }
  return out;
}

/** 正在使用的素材（F062 的「其中幾張正在使用」） */
export const isMaterialUsed = (project: Project, name: string): boolean =>
  materialUsages(project, name).length > 0;

/**
 * 遺失圖片（3.2.12）：引用了、但工具內沒有圖片資料的名稱與使用處。
 * 只看會輸出到 ZIP 的地方（場景範本不算）。
 */
export function brokenImages(project: Project, available: (name: string) => boolean) {
  const names = new Set<string>();
  const shadow: Project = { ...project, sceneTemplates: [] };
  for (const n of referencedImages(shadow)) if (!available(n)) names.add(n);
  return [...names].map((name) => ({
    name,
    uses: [...new Set(materialUsages(project, name).map((u) => u.label))],
  }));
}

/** 名稱去副檔名（素材名稱預設） */
export const baseName = (fileName: string): string => fileName.replace(/\.[^.]+$/, '');
