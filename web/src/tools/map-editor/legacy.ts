/**
 * 舊版存檔 → 新版（規格 3.5）。舊版的地圖資料是 `version: 1`、`canvas` 是 Fabric 5.3 的 `toJSON`；
 * Fabric 7 讀它的差異（型別名稱、上游已拿掉的內建貼圖、作圖預覽）在這裡轉好，之後照新版的流程讀入。
 * 純資料轉換（不 import Fabric），新版自己的資料經過這裡也不會變（可以重複呼叫）。
 */
import { DECOR_IDS } from './decorCatalog';
import { type MapData, type PatternState, sanitizeMapData } from './model';

export const FABRIC_VERSION = '7.4.0';

/** Fabric 5 的型別名稱 → Fabric 7（classRegistry 的名稱） */
export const TYPE_MAP: Readonly<Record<string, string>> = {
  rect: 'Rect',
  ellipse: 'Ellipse',
  circle: 'Circle',
  line: 'Line',
  polyline: 'Polyline',
  polygon: 'Polygon',
  path: 'Path',
  group: 'Group',
  textbox: 'Textbox',
  'i-text': 'IText',
  text: 'Text',
  image: 'Image',
  triangle: 'Triangle',
  activeSelection: 'ActiveSelection',
};

/**
 * 上游內建貼圖（收錄版已拿掉）的代替色：舊地圖用到它們時改成這個單色（舊版 REMOVED_PATTERN_COLORS）。
 */
export const REMOVED_PATTERN_COLORS: Readonly<Record<string, string>> = {
  grass: '#4a8c3f',
  water: '#5ba3cf',
  rock: '#7a7368',
  'rock-moss': '#6b7a52',
  'wood-plank': '#8a6a3f',
  brick: '#9a5a3f',
  cobblestone: '#7a7368',
  forest: '#3f6a3a',
  tile: '#d2d2d2',
  'black-soil': '#3a3026',
  'cobblestone-round': '#7a7368',
  lava: '#5e2a20',
  sand: '#d9c89a',
  gravel: '#9a948a',
};

type Json = Record<string, unknown>;

const isObj = (v: unknown): v is Json => !!v && typeof v === 'object' && !Array.isArray(v);
const isPattern = (v: unknown): v is Json => isObj(v) && v.type === 'pattern';

/** 舊版存檔？（`version: 1`、Fabric 5 的畫布、或物件的型別是小寫） */
export function isLegacyMapData(raw: unknown): boolean {
  if (!isObj(raw)) return false;
  if (raw.version === 1) return true;
  const canvas = raw.canvas;
  if (isObj(canvas) && typeof canvas.version === 'string' && /^[1-5]\./.test(canvas.version))
    return true;
  const objs = isObj(canvas) && Array.isArray(canvas.objects) ? canvas.objects : [];
  return objs.some((o) => isObj(o) && typeof o.type === 'string' && o.type in TYPE_MAP);
}

export interface ConvertOptions {
  /** 這張地圖的自訂圖樣 id（存在的圖樣不換成單色） */
  patternIds: ReadonlySet<string>;
}

/** 一個 Fabric 物件（含群組的子物件、clipPath）：型別名稱、版本、拿掉的貼圖 */
/** 定位點（originX／Y）→ Fabric 的偏移係數 */
const ORIGIN_FACTOR: Readonly<Record<string, number>> = { left: -0.5, top: -0.5, center: 0, right: 0.5, bottom: 0.5 };

const numOr = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/**
 * 平頭的水平／垂直直線：Fabric 5 算位置時外接框不含線寬（線的方向），Fabric 7 含，同一個 left、top 會差半個線寬。
 * 調整 left、top，讓中心（看到的位置）與舊版相同。只處理舊版的物件（型別名稱是小寫的 `line`）。
 */
export function fixLegacyLinePosition(o: Json): Json {
  if (o.type !== 'line' || o.strokeUniform === true) return o;
  if ((o.strokeLineCap ?? 'butt') !== 'butt') return o;
  const w = numOr(o.width, 0);
  const h = numOr(o.height, 0);
  const sw = numOr(o.strokeWidth, 1);
  const dx = h === 0 ? -sw : 0;
  const dy = w === 0 ? -sw : 0;
  if (!dx && !dy) return o;
  const ox = ORIGIN_FACTOR[String(o.originX ?? 'left')] ?? 0;
  const oy = ORIGIN_FACTOR[String(o.originY ?? 'top')] ?? 0;
  /* 本地的位移（縮放後）→ 依旋轉角轉到畫布 */
  const lx = -ox * dx * numOr(o.scaleX, 1);
  const ly = -oy * dy * numOr(o.scaleY, 1);
  if (!lx && !ly) return o;
  const a = (numOr(o.angle, 0) * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  return {
    ...o,
    left: numOr(o.left, 0) + lx * cos - ly * sin,
    top: numOr(o.top, 0) + lx * sin + ly * cos,
  };
}

function convertObject(o: Json, opts: ConvertOptions): Json | null {
  if (o.isPreview) return null;
  const out: Json = fixLegacyLinePosition({ ...o });
  if (typeof out.type === 'string' && TYPE_MAP[out.type]) out.type = TYPE_MAP[out.type];
  if (typeof out.version === 'string') out.version = FABRIC_VERSION;

  /* 拿掉的內建貼圖 → 單色（舊版 replaceRemovedPatterns） */
  let solid: string | null = null;
  const st = out._patternState;
  if (
    isObj(st) &&
    st.mode === 'pattern' &&
    !(typeof st.id === 'string' && opts.patternIds.has(st.id))
  ) {
    const id = typeof st.id === 'string' ? st.id : '';
    solid =
      REMOVED_PATTERN_COLORS[id] ?? (typeof st.solidColor === 'string' ? st.solidColor : null);
    out._patternState = { ...st, mode: 'solid', id: null, solidColor: solid ?? st.solidColor };
  }
  for (const prop of ['fill', 'stroke'] as const) {
    const v = out[prop];
    const removedSource =
      isPattern(v) && typeof v.source === 'string' && !v.source.startsWith('data:');
    if (removedSource || (solid && isPattern(v))) {
      out[prop] = solid ?? (prop === 'fill' ? '#888888' : '#333333');
    }
  }
  if (Array.isArray(out._cellEntries)) {
    out._cellEntries = (out._cellEntries as unknown[]).filter(isObj).map((e) => {
      if (
        e.mode !== 'pattern' ||
        (typeof e.patternId === 'string' && opts.patternIds.has(e.patternId))
      )
        return e;
      const id = typeof e.patternId === 'string' ? e.patternId : '';
      const c = REMOVED_PATTERN_COLORS[id] ?? '#888888';
      return { col: e.col, row: e.row, fillKey: `solid:${c}`, mode: 'solid', solidColor: c };
    });
  }
  if (Array.isArray(out.objects)) out.objects = convertObjects(out.objects as unknown[], opts);
  if (isObj(out.clipPath)) out.clipPath = convertObject(out.clipPath, opts) ?? undefined;
  return out;
}

function convertObjects(list: readonly unknown[], opts: ConvertOptions): Json[] {
  const out: Json[] = [];
  for (const o of list) {
    if (!isObj(o)) continue;
    const c = convertObject(o, opts);
    if (c) out.push(c);
  }
  return out;
}

function fixPatternState(s: unknown, patternIds: ReadonlySet<string>): unknown {
  if (!isObj(s)) return s;
  const p = s as Partial<PatternState>;
  if (p.mode === 'pattern' && !(typeof p.id === 'string' && patternIds.has(p.id)))
    return { ...p, mode: 'solid', id: null };
  return s;
}

/**
 * 地圖資料（舊版或新版）→ 新版的地圖資料。上層欄位照搬並整理；`canvas.objects` 依 3.5 轉換。
 */
export function convertMapData(raw: unknown): MapData {
  const src: Json = isObj(raw) ? raw : {};
  const patterns = Array.isArray(src.userPatterns) ? src.userPatterns : [];
  const patternIds = new Set(
    patterns
      .filter(isObj)
      .map((p) => p.id)
      .filter((id): id is string => typeof id === 'string'),
  );
  const decors = Array.isArray(src.userDecors) ? src.userDecors : [];
  const decorIds = new Set(
    decors
      .filter(isObj)
      .map((d) => d.id)
      .filter((id): id is string => typeof id === 'string'),
  );
  const opts: ConvertOptions = { patternIds };
  const canvas = isObj(src.canvas) ? src.canvas : { objects: [] };
  const objects = convertObjects(Array.isArray(canvas.objects) ? canvas.objects : [], opts);
  const decorId =
    typeof src.decorId === 'string' && (DECOR_IDS.has(src.decorId) || decorIds.has(src.decorId))
      ? src.decorId
      : null;
  return sanitizeMapData({
    ...src,
    groundPattern: fixPatternState(src.groundPattern, patternIds),
    wallPattern: fixPatternState(src.wallPattern, patternIds),
    decorId,
    canvas: { ...canvas, version: FABRIC_VERSION, objects },
  });
}
