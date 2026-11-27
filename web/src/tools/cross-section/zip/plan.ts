/**
 * CCFOLIA 房間 ZIP 的構成（第二批；純函式，Node 可測）：盤面的大小、場景、每個區域的遮罩與祕密區域的偽裝面板、切入、
 * 對照表（CSV）。圖片在 images.ts、切入在 cutins.ts、組成 ZIP 在 build.ts。
 *
 * 規則與數值參考原作（CCFOLIA 的格式是外部的事實；原作說「位置固定・點擊穿透」「全場景色差為零」的做法照它的輸出）：
 * - 盤面：地圖本體（世界）放在左 2、上 2 格；右邊至少留 max(14, ⌈(寬＋2) ÷ 3⌉) 格給聊天、下面至少 max(10, ⌈(高＋2) ÷ 3⌉) 格
 *   給立繪；寬高補成偶數。每格 48 px（前景圖超過 4400 px 時 32 px）。大棋子（2 倍）時盤面的格數與面板的位置大小都 ×2，
 *   圖不變（同樣的圖蓋滿兩倍的格數，棋子看起來小一半）。
 * - 場景：白天・平常、夜・雨、停電・緊急照明、事件後（＋淹水：事件後＋淹水），前景是公開差分用的圖（祕密區域照常畫），
 *   第一個場景套用到房間。
 * - 螢幕面板（スクリーンパネル）：一般區域的遮罩 z 4（一開始公開的區域 active＝false）、祕密區域（含列車床下）的偽裝 z 5
 *   （一律 active＝true）、KP 操作說明 z 9（放在最後、active＝false）；全部 locked、freezed。
 * - 編號：建築「1F-01」「B2F-03」（每層由左往右）；列車「3車-A」；祕密「S-01」（建築由上往下、列車由前往後，床下排在後面）。
 *   面板的備註（PL 滑鼠停留時看得到）：有名字時「編號 名字」；無記名或「PL 用不寫名字」的只寫編號；
 *   祕密區域在無記名或「PL 停留時也蓋成編號」（預設開）時只寫編號。
 */
import {
  type CcfoliaEffect,
  type CcfoliaItem,
  type CcfoliaRoomData,
  type CcfoliaScene,
  createEffect,
  createItem,
  createRoom,
  createRoomData,
  createScene,
  newRoomEntityId,
} from '@/ccfolia/room';
import type { Plan } from '../draw/scene';
import { worldOf } from '../draw/scene';
import type { Rect } from '../model/layout';
import { type Arrange, type EnvId, levelTag, type SectionDoc } from '../model/types';
import { S } from '../strings';

export type MaskStyle = 'shutter' | 'fog' | 'sign';
export const MASK_STYLES: readonly MaskStyle[] = ['shutter', 'fog', 'sign'];

export interface ZipOptions {
  mask: MaskStyle;
  /** 無記名：面板與遮罩只寫編號 */
  blind: boolean;
  /** PL 滑鼠停留時祕密區域的名字也蓋成編號 */
  anon: boolean;
  /** 加淹水的場景與「@淹水」的切入 */
  flood: boolean;
  /** KP 操作說明放在螢幕面板一覽的最後（一開始不顯示） */
  guide: boolean;
  /** 棋子大小：1＝標準、2＝大棋子（盤面兩倍） */
  token: 1 | 2;
  /** 列車的排法（匯出用；平常照作品的） */
  arrange: Arrange;
}

export const DEFAULT_ZIP: ZipOptions = {
  mask: 'shutter',
  blind: false,
  anon: true,
  flood: false,
  guide: false,
  token: 1,
  arrange: 'auto',
};

export interface Board {
  /** 地圖本體在盤面上的左上角（格） */
  padL: number;
  padT: number;
  /** 盤面（標準的格數） */
  cols: number;
  rows: number;
  /** 每格幾 px */
  cell: number;
  /** 棋子大小的倍率 */
  scale: 1 | 2;
  /** CCFOLIA 的盤面（格；大棋子時 ×2） */
  fieldWidth: number;
  fieldHeight: number;
  world: Rect;
}

const even = (n: number) => {
  const v = Math.ceil(n);
  return v % 2 ? v + 1 : v;
};

/** 前景圖的長邊上限（超過時每格 32 px） */
export const FG_MAX = 4400;

export function boardOf(world: Rect, token: 1 | 2 = 1): Board {
  const padL = 2;
  const padT = 2;
  const cols = even(padL + world.w + Math.max(14, Math.ceil((world.w + padL) / 3)));
  const rows = even(padT + world.h + Math.max(10, Math.ceil((world.h + padT) / 3)));
  const cell = cols * 48 <= FG_MAX && rows * 48 <= FG_MAX ? 48 : 32;
  return {
    padL,
    padT,
    cols,
    rows,
    cell,
    scale: token,
    fieldWidth: cols * token,
    fieldHeight: rows * token,
    world,
  };
}

/* ---------- 場景 ---------- */

export interface SceneDef {
  key: EnvId | 'flood';
  env: EnvId;
  flood: boolean;
  name: string;
}

export function scenesOf(o: Pick<ZipOptions, 'flood'>): SceneDef[] {
  const list: SceneDef[] = (['day', 'night', 'blackout', 'after'] as const).map((env, i) => ({
    key: env,
    env,
    flood: false,
    name: `${i + 1} ${S.envs[env]}`,
  }));
  if (o.flood)
    list.push({ key: 'flood', env: 'after', flood: true, name: `5 ${S.zip.floodScene}` });
  return list;
}

/* ---------- 切入 ---------- */

export type CutinKind = 'blackout' | 'emergency' | 'incident' | 'flood';
export const CUTIN_KINDS: readonly CutinKind[] = ['blackout', 'emergency', 'incident', 'flood'];

/** 切入：名稱是「@」＋字（照立繪切入產生器的開頭，規格 D27）；淹水的只在有淹水的場景時 */
export function cutinsOf(
  o: Pick<ZipOptions, 'flood'>,
): { kind: CutinKind; word: string; name: string }[] {
  return CUTIN_KINDS.filter((k) => o.flood || k !== 'flood').map((kind) => ({
    kind,
    word: S.zip.cutins[kind],
    name: `@${S.zip.cutins[kind]}`,
  }));
}

/* ---------- 螢幕面板 ---------- */

export interface Panel {
  kind: 'mask' | 'camo' | 'guide';
  code: string;
  /** 面板的備註（PL 停留時看得到） */
  memo: string;
  /** 真正的名字（GM 的對照表） */
  name: string;
  /** 位置（1F、3 車） */
  place: string;
  /** 遮罩上寫的名字（無記名、不寫名字時空字串） */
  label: string;
  /** 一開始就公開（遮罩不顯示） */
  open: boolean;
  /** 世界座標的範圍（整數格） */
  rect: Rect;
  z: number;
}

const two = (n: number) => String(n).padStart(2, '0');

export function panelsOf(plan: Plan, o: Pick<ZipOptions, 'blind' | 'anon'>): Panel[] {
  const masks: Panel[] = [];
  const camos: Omit<Panel, 'code' | 'memo'>[] = [];
  const mask = (
    code: string,
    room: { name: string; hideName: boolean; open?: boolean },
    place: string,
    rect: Rect,
  ) => {
    const name = room.name.trim();
    const shown = !o.blind && !room.hideName && !!name;
    masks.push({
      kind: 'mask',
      code,
      memo: shown ? `${code} ${name}` : code,
      name,
      place,
      label: shown ? name : '',
      open: !!room.open,
      rect,
      z: 4,
    });
  };
  const camo = (name: string, place: string, rect: Rect) =>
    camos.push({ kind: 'camo', name: name.trim(), place, label: '', open: false, rect, z: 5 });
  if (plan.kind === 'building') {
    const count = new Map<string, number>();
    for (const rb of plan.L.rooms) {
      const tag = levelTag(rb.floor.level);
      const rect = { x: rb.x, y: rb.y, w: rb.w, h: rb.h };
      if (rb.room.secret) camo(rb.room.name, tag, rect);
      else {
        const n = (count.get(tag) ?? 0) + 1;
        count.set(tag, n);
        mask(`${tag}-${two(n)}`, rb.room, tag, rect);
      }
    }
  } else {
    const count = new Map<string, number>();
    for (const rb of plan.T.rooms) {
      const tag = S.zip.carTag(rb.index + 1);
      const rect = { x: rb.x, y: rb.y, w: rb.w, h: rb.h };
      if (rb.room.secret) camo(rb.room.name, tag, rect);
      else {
        const n = (count.get(tag) ?? 0) + 1;
        count.set(tag, n);
        mask(`${tag}-${String.fromCharCode(64 + n)}`, rb.room, tag, rect);
      }
    }
    for (const u of plan.T.unders)
      camo(u.room.name || S.train.underName, S.zip.carTag(u.index + 1), {
        x: u.x,
        y: u.y,
        w: u.w,
        h: u.h,
      });
  }
  const secret = camos.map((p, i) => {
    const code = `S-${two(i + 1)}`;
    const hide = o.blind || o.anon || !p.name;
    return { ...p, code, memo: hide ? code : `${code} ${p.name}` };
  });
  return [...masks, ...secret];
}

/** 面板在盤面上的位置與大小（CCFOLIA 的格；原點在盤面中央、往右往下為正，x、y 是左上角） */
export function panelSpot(
  b: Board,
  r: Rect,
): { x: number; y: number; width: number; height: number } {
  const gx = b.padL + (r.x - b.world.x);
  const gy = b.padT + (r.y - b.world.y);
  return {
    x: (gx - b.cols / 2) * b.scale,
    y: (gy - b.rows / 2) * b.scale,
    width: r.w * b.scale,
    height: r.h * b.scale,
  };
}

/** KP 操作說明的面板：左上角（2, 2）、寬 min(盤面寬 − 4, 28) 格、高照圖的比例 */
export const GUIDE_PX = { w: 1280, h: 860 } as const;
export function guideSpot(b: Board): { x: number; y: number; width: number; height: number } {
  const w = Math.min(b.cols - 4, 28);
  const h = Math.round((w * GUIDE_PX.h) / GUIDE_PX.w);
  return {
    x: (2 - b.cols / 2) * b.scale,
    y: (2 - b.rows / 2) * b.scale,
    width: w * b.scale,
    height: h * b.scale,
  };
}

/* ---------- 對照表 ---------- */

/** 對照表（CSV 的列）：編號、種類、一開始、位置、名字、PL 停留時看到的字 */
export function tableRows(panels: readonly Panel[]): string[][] {
  const T = S.zip.table;
  return [
    [T.code, T.kind, T.start, T.place, T.name, T.memo],
    ...panels.map((p) => [
      p.code,
      T.kinds[p.kind],
      p.kind === 'camo' ? T.covered : p.open ? T.open : T.covered,
      p.place,
      p.name,
      p.memo,
    ]),
  ];
}

/** 匯出的世界（列車照匯出的排法） */
export const zipWorld = (plan: Plan): Rect => worldOf(plan);

/** 匯出時用的作品：列車的排法換成匯出的設定 */
export function zipDoc(doc: SectionDoc, arrange: Arrange): SectionDoc {
  if (doc.mode !== 'train' || !doc.train || doc.train.arrange === arrange) return doc;
  return { ...doc, train: { ...doc.train, arrange } };
}

/* ---------- 房間資料 ---------- */

/** 自動結束用的無聲 MP3：和切入一樣長（2.6 秒）、44.1 kHz 單聲道 64 kbps */
export const SILENT_MP3 = { seconds: 2.6, sampleRate: 44100, channels: 1, kbps: 64 } as const;

/** 房間的背景色（盤面外） */
export const ROOM_BACKGROUND = '#180d23';

/**
 * `__data.json`（圖片已經算好檔名）：第一個場景套用到房間；螢幕面板依序（遮罩、偽裝、KP 操作說明），
 * 全部固定位置、點了穿過去；切入的順序照名單。
 */
export function roomDataOf(
  b: Board,
  scenes: readonly SceneDef[],
  panels: readonly Panel[],
  cuts: readonly { name: string }[],
  img: {
    scenes: readonly { fg: string; bg: string }[];
    panels: readonly string[];
    guide: string | null;
    cutins: readonly string[];
  },
): CcfoliaRoomData {
  const sceneMap: Record<string, CcfoliaScene> = {};
  const ids = scenes.map(() => newRoomEntityId());
  scenes.forEach((sd, i) => {
    sceneMap[ids[i]] = createScene({
      name: sd.name,
      order: i + 1,
      backgroundUrl: img.scenes[i].bg,
      foregroundUrl: img.scenes[i].fg,
      fieldObjectFit: 'fill',
      fieldWidth: b.fieldWidth,
      fieldHeight: b.fieldHeight,
      displayGrid: false,
      gridSize: 1,
    });
  });
  const items: Record<string, CcfoliaItem> = {};
  panels.forEach((p, i) => {
    items[newRoomEntityId()] = createItem({
      ...panelSpot(b, p.rect),
      z: p.z,
      order: i + 1,
      active: p.kind === 'camo' || !p.open,
      memo: p.memo,
      imageUrl: img.panels[i],
      locked: true,
      freezed: true,
    });
  });
  if (img.guide)
    items[newRoomEntityId()] = createItem({
      ...guideSpot(b),
      z: 9,
      order: panels.length + 1,
      active: false,
      memo: S.zip.guideMemo,
      imageUrl: img.guide,
      locked: true,
      freezed: true,
    });
  const effects: Record<string, CcfoliaEffect> = {};
  cuts.forEach((c, i) => {
    effects[newRoomEntityId()] = createEffect({
      name: c.name,
      order: i + 1,
      imageUrl: img.cutins[i],
    });
  });
  const first = img.scenes[0];
  const room = createRoom({
    backgroundUrl: first?.bg ?? null,
    foregroundUrl: first?.fg ?? null,
    fieldObjectFit: 'fill',
    fieldWidth: b.fieldWidth,
    fieldHeight: b.fieldHeight,
    sceneId: ids[0] ?? null,
    backgroundColor: ROOM_BACKGROUND,
  });
  return createRoomData({ room, items, effects, scenes: sceneMap });
}
