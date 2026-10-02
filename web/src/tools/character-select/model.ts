/**
 * 設定的資料結構、預設值與修正（純函式，不依賴瀏覽器）。
 *
 * - 數值的範圍照規格第 1 節；`sanitize` 在每次編輯之後執行（夾範圍、補齊玩家的陣列、重算自動間距、修正目標與路徑）。
 * - 角色只記圖片的 id（`core/assets`）；內建角色的圖片是 `demo:<序號>`（執行時畫出來，不存檔）。
 */
import { DEFAULT_FONT, type FontValue } from '@/core/fonts';
import { clamp } from '@/core/timeline';

export type BackgroundType = 'gradient' | 'solid' | 'image' | 'transparent';
export type BorderStyle = 'solid' | 'corners' | 'dashed' | 'double';
export type Fit = 'cover' | 'contain';
export type Align = 'left' | 'center' | 'right';
export type IdleMode = 'normal' | 'grayscale' | 'sepia';
export type TintMode = 'none' | 'fixed' | 'player';
export type MainPosition = 'top' | 'left' | 'right';
export type Reveal = 'confirm' | 'hover';
export type PathMode = 'random' | 'custom';
export type SelectionMode = 'sequence' | 'single';
export type ExportFormatId = 'apng' | 'webp' | 'gif' | 'mp4' | 'avi';

/** 原圖上的範圍（0～1 的比例） */
export interface NormCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Character {
  /** 這一筆的 id（排序、複製後玩家的設定跟著它走） */
  id: string;
  name: string;
  /** 圖片：資產庫的 id，或內建角色 `demo:<序號>` */
  image: string;
  demo: boolean;
  /** 小清單縮圖的額外縮放（0.1～5） */
  scale: number;
  /** 小清單縮圖的位置偏移（格子寬／高的 %） */
  offsetX: number;
  offsetY: number;
  /** 位置滑桿的範圍（±%，25～500） */
  moveRangeX: number;
  moveRangeY: number;
  mainCrop: NormCrop | null;
  listCrop: NormCrop | null;
}

export interface Settings {
  canvas: { width: number; height: number };
  background: {
    type: BackgroundType;
    colorA: string;
    colorB: string;
    angle: number;
    /** 背景圖片的資產 id */
    image: string | null;
    imageDim: number;
    vignette: number;
    pattern: boolean;
  };
  layout: {
    x: number;
    y: number;
    width: number;
    height: number;
    columns: number;
    rows: number;
    autoRows: boolean;
    autoGap: boolean;
    gap: number;
    radius: number;
    fit: Fit;
    borderWidth: number;
    borderStyle: BorderStyle;
  };
  text: { showTitle: boolean; title: string; subtitle: string; titleSize: number; align: Align };
  font: FontValue;
  mainPanel: {
    enabled: boolean;
    effects: boolean;
    count: number;
    columns: number;
    slotGap: number;
    position: MainPosition;
    size: number;
    gap: number;
    fit: Fit;
    reveal: Reveal;
    showName: boolean;
    placeholder: string;
  };
  labels: { show: boolean; height: number; fontSize: number };
  idle: {
    mode: IdleMode;
    amount: number;
    brightness: number;
    saturation: number;
    overlayAlpha: number;
  };
  selected: {
    tintMode: TintMode;
    tint: string;
    tintAlpha: number;
    brightness: number;
    saturation: number;
    scale: number;
    glow: number;
    borderWidth: number;
  };
  players: {
    count: number;
    selectionMode: SelectionMode;
    singleNumber: number;
    allowDuplicate: boolean;
    labels: string[];
    colors: string[];
    targets: number[];
    /** null＝隨機（自動） */
    starts: (number | null)[];
    pathModes: PathMode[];
    paths: number[][];
  };
  animation: {
    initialHold: number;
    searchDuration: number;
    confirmDuration: number;
    endHold: number;
    hops: number;
    loop: boolean;
  };
  export: { format: ExportFormatId; scale: number; fps: number; webpQuality: number };
  ui: { showGuides: boolean };
  characters: Character[];
}

/** 選取狀態的對比（舊版固定 108%，沒有欄位） */
export const SELECTED_CONTRAST = 108;
/** 未選取狀態的對比 */
export const IDLE_CONTRAST = 104;
export const MAX_PLAYER_NUMBER = 99;
export const MAX_WAYPOINTS = 24;
export const DEFAULT_COLORS = ['#66ddff', '#ff668f', '#ffd45f', '#8df27a'] as const;
export const DEMO_COUNT = 8;

export const FPS_CHOICES = [6, 8, 10, 12, 15, 20, 24, 30, 48, 50, 60] as const;
export const SCALE_CHOICES = [0.5, 0.75, 1, 1.5, 2] as const;
export const WEBP_QUALITY_CHOICES = [0.7, 0.82, 0.9, 0.96, 1] as const;

/** 預設文字（原作未授權，自己寫） */
export const DEFAULT_TITLE = '角色選擇';
export const DEFAULT_SUBTITLE = '今晚的冒險者是誰？';
export const DEFAULT_PLACEHOLDER = '等待選擇';

export function defaultPlayers(): Settings['players'] {
  return {
    count: 4,
    selectionMode: 'sequence',
    singleNumber: 1,
    allowDuplicate: false,
    labels: ['', '', '', ''],
    colors: [...DEFAULT_COLORS],
    targets: [0, 1, 2, 3],
    starts: [null, null, null, null],
    pathModes: ['random', 'random', 'random', 'random'],
    paths: [[], [], [], []],
  };
}

export function createDefaultSettings(): Settings {
  return {
    canvas: { width: 960, height: 540 },
    background: {
      type: 'gradient',
      colorA: '#111827',
      colorB: '#3b1d5a',
      angle: 135,
      image: null,
      imageDim: 24,
      vignette: 38,
      pattern: true,
    },
    layout: {
      x: 64,
      y: 124,
      width: 832,
      height: 328,
      columns: 4,
      rows: 2,
      autoRows: true,
      autoGap: true,
      gap: 14,
      radius: 24,
      fit: 'cover',
      borderWidth: 2,
      borderStyle: 'solid',
    },
    text: {
      showTitle: true,
      title: DEFAULT_TITLE,
      subtitle: DEFAULT_SUBTITLE,
      titleSize: 30,
      align: 'center',
    },
    font: { ...DEFAULT_FONT },
    mainPanel: {
      enabled: false,
      effects: true,
      count: 1,
      columns: 1,
      slotGap: 16,
      position: 'top',
      size: 62,
      gap: 24,
      fit: 'contain',
      reveal: 'confirm',
      showName: true,
      placeholder: DEFAULT_PLACEHOLDER,
    },
    labels: { show: true, height: 46, fontSize: 17 },
    idle: { mode: 'grayscale', amount: 88, brightness: 68, saturation: 62, overlayAlpha: 18 },
    selected: {
      tintMode: 'player',
      tint: '#64e4ff',
      tintAlpha: 18,
      brightness: 108,
      saturation: 124,
      scale: 1.06,
      glow: 30,
      borderWidth: 5,
    },
    players: defaultPlayers(),
    animation: {
      initialHold: 650,
      searchDuration: 900,
      confirmDuration: 650,
      endHold: 1600,
      hops: 3,
      loop: true,
    },
    export: { format: 'apng', scale: 0.75, fps: 10, webpQuality: 0.9 },
    ui: { showGuides: true },
    characters: [],
  };
}

/* ---------- 小工具 ---------- */

const num = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
/** 數字（不是有限數字或 0 時用 fallback，與舊版的 `Number(v) || fallback` 相同） */
const orNum = (v: unknown, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n !== 0 ? n : fallback;
};

/** 玩家的顯示名稱：控制字元換成空白、連續空白併成一個、去頭尾、最多 24 字 */
export function normalizePlayerLabel(value: unknown): string {
  return Array.from(
    String(value ?? '')
      // biome-ignore lint/suspicious/noControlCharactersInRegex: 控制字元換成空白（規格 F95）
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim(),
  )
    .slice(0, 24)
    .join('');
}

/** 玩家名稱（空白時「NP」） */
export function playerLabel(s: Pick<Settings, 'players'>, player: number): string {
  return normalizePlayerLabel(s.players.labels[player]) || `${player + 1}P`;
}

/** 範圍（比例）：寬高 0.02～1、位置夾在圖內；不是物件時 null */
export function normalizeCrop(value: unknown): NormCrop | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<NormCrop>;
  const width = clamp(num(v.width, 1), 0.02, 1);
  const height = clamp(num(v.height, 1), 0.02, 1);
  return {
    x: clamp(num(v.x, 0), 0, 1 - width),
    y: clamp(num(v.y, 0), 0, 1 - height),
    width,
    height,
  };
}

/** 角色的數值修正（規格 F27：移動範圍至少涵蓋目前的位置） */
export function normalizeCharacter(c: Character): Character {
  const moveRangeX = clamp(
    Math.max(orNum(c.moveRangeX, 100), Math.abs(num(c.offsetX, 0))),
    25,
    500,
  );
  const moveRangeY = clamp(
    Math.max(orNum(c.moveRangeY, 100), Math.abs(num(c.offsetY, 0))),
    25,
    500,
  );
  return {
    id: String(c.id),
    name: String(c.name ?? '').slice(0, 60),
    image: String(c.image ?? ''),
    demo: !!c.demo,
    scale: clamp(orNum(c.scale, 1), 0.1, 5),
    offsetX: clamp(num(c.offsetX, 0), -moveRangeX, moveRangeX),
    offsetY: clamp(num(c.offsetY, 0), -moveRangeY, moveRangeY),
    moveRangeX,
    moveRangeY,
    mainCrop: normalizeCrop(c.mainCrop),
    listCrop: normalizeCrop(c.listCrop),
  };
}

/* ---------- 其他 ---------- */

/** 播放的玩家（依序：0～人數−1；單一：那一號） */
export function playbackPlayers(s: Pick<Settings, 'players'>): number[] {
  return s.players.selectionMode === 'single'
    ? [s.players.singleNumber - 1]
    : Array.from({ length: s.players.count }, (_, i) => i);
}

/** 匯出尺寸（規格 F120） */
export function exportDimensions(s: Pick<Settings, 'canvas'>, scale: number) {
  return {
    width: Math.max(1, Math.round(s.canvas.width * scale)),
    height: Math.max(1, Math.round(s.canvas.height * scale)),
  };
}

/** 檔名主體（主標題；空白時 character-select） */
export function fileBase(s: Pick<Settings, 'text'>): string {
  const t = s.text.title.trim();
  return t || 'character-select';
}

/** 新角色的 id */
export function newCharacterId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
