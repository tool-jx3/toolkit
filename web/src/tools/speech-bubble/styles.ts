/**
 * 造型（規格 1.3、3.2）：21 種程式畫的泡泡外框。這裡只有資料（版面參數、預設配色與圖示、可以用的欄位），
 * 實際的畫法在 draw.ts，排版在 layout.ts。原作是作者自己的素材，形狀與配色都是本站自己設計的。
 */
import type { IconId, Palette, StyleId } from './model';

/** 造型的分類（造型選單的分組） */
export type StyleGroup = 'chat' | 'game' | 'paper' | 'show' | 'system' | 'sf';

/**
 * 標題的位置：
 * - outside：泡泡外面的上方（名字，像聊天室）
 * - above：泡泡裡、內文上方的一行
 * - bar：視窗的標題列
 * - tag：壓在上框線的名牌（RPG）
 * - side：內文左邊一欄（標籤、編號）
 * - label：左邊一塊實心標籤（新聞快訊）
 */
export type TitleMode = 'outside' | 'above' | 'bar' | 'tag' | 'side' | 'label';

/** 圖示的位置：badge＝標題左邊的小圓、big＝內文左邊的大圖示、avatar＝左邊的頭像圓、small＝左邊的小圓 */
export type IconSlot = 'none' | 'badge' | 'big' | 'avatar' | 'small';

/** 尾巴：hook＝訊息泡泡的小勾、point＝漫畫泡泡的尖角、dots＝想法泡泡的小圓點 */
export type TailKind = 'none' | 'hook' | 'point' | 'dots';

export interface StyleSpec {
  id: StyleId;
  group: StyleGroup;
  titleMode: TitleMode;
  /** 標題字級＝內文字級 × titleScale */
  titleScale: number;
  /** 標題用粗體 */
  titleBold: boolean;
  textAlign: 'left' | 'center';
  icon: IconSlot;
  /** 有按鈕（系統視窗） */
  button: boolean;
  tail: TailKind;
  /** 內距（內文字級的倍數）：上、右、下、左 */
  pad: readonly [number, number, number, number];
  /** 最小寬、高（內文字級的倍數） */
  minW: number;
  minH: number;
  /** 開啟陰影時有投影 */
  shadow: boolean;
  /** 文字光暈（內文字級的倍數；0＝沒有） */
  textGlow: number;
  /** 外框光暈、裝飾超出外框的距離（內文字級的倍數） */
  overflow: number;
  /** 本身就歪一點（度，便利貼） */
  tilt: number;
  colors: Palette;
  defaultIcon: IconId;
}

const P = (fill: string, border: string, text: string, accent: string): Palette => ({
  fill,
  border,
  text,
  accent,
});

type Partial2 = Omit<StyleSpec, 'id' | 'group' | 'colors'> & { colors?: Palette };
const base: Omit<Partial2, 'colors'> = {
  titleMode: 'above',
  titleScale: 0.8,
  titleBold: true,
  textAlign: 'left',
  icon: 'none',
  button: false,
  tail: 'none',
  pad: [0.6, 0.85, 0.6, 0.85],
  minW: 0,
  minH: 0,
  shadow: true,
  textGlow: 0,
  overflow: 0,
  tilt: 0,
  defaultIcon: 'none',
};

function spec(id: StyleId, group: StyleGroup, colors: Palette, o: Partial<Partial2>): StyleSpec {
  return { ...base, ...o, id, group, colors };
}

export const STYLES: Record<StyleId, StyleSpec> = {
  /* ---- 對話 ---- */
  messenger: spec('messenger', 'chat', P('#3b82f6', '#00000000', '#ffffff', '#94a3b8'), {
    titleMode: 'outside',
    titleScale: 0.68,
    tail: 'hook',
    pad: [0.5, 0.8, 0.5, 0.8],
    shadow: false,
  }),
  speech: spec('speech', 'chat', P('#ffffff', '#1f2937', '#111827', '#1f2937'), {
    titleMode: 'outside',
    titleScale: 0.7,
    textAlign: 'center',
    tail: 'point',
    pad: [0.9, 1.3, 0.9, 1.3],
    minW: 3,
    shadow: false,
  }),
  thought: spec('thought', 'chat', P('#ffffff', '#4b5563', '#1f2937', '#6b7280'), {
    titleMode: 'outside',
    titleScale: 0.7,
    textAlign: 'center',
    tail: 'dots',
    pad: [1, 1.4, 1, 1.4],
    minW: 3.5,
    shadow: false,
    overflow: 0.45,
  }),
  shout: spec('shout', 'chat', P('#fff6c2', '#111827', '#c81e1e', '#111827'), {
    titleMode: 'outside',
    titleScale: 0.7,
    textAlign: 'center',
    pad: [1.1, 1.5, 1.1, 1.5],
    minW: 3.5,
    shadow: false,
    overflow: 0.95,
  }),
  'chat-card': spec('chat-card', 'chat', P('#fff7fa', '#f9cfe0', '#4b5563', '#ec4899'), {
    titleScale: 0.82,
    icon: 'avatar',
    pad: [0.75, 1.1, 0.8, 0.85],
    defaultIcon: 'person',
  }),
  /* ---- 遊戲・RPG ---- */
  rpg: spec('rpg', 'game', P('#1b2452', '#c9d3f2', '#ffffff', '#ffd166'), {
    titleMode: 'tag',
    titleScale: 0.72,
    pad: [1.05, 1.3, 1.15, 1.1],
    minW: 12,
    minH: 3.6,
  }),
  battle: spec('battle', 'game', P('#26161a', '#7a3b46', '#ffe7a3', '#ff6b8b'), {
    titleScale: 0.9,
    textAlign: 'center',
    pad: [0.75, 2, 0.8, 2],
    minW: 10,
    textGlow: 0.35,
  }),
  tag: spec('tag', 'game', P('#2b2115', '#caa24b', '#fff0c2', '#ffd34d'), {
    titleMode: 'side',
    titleScale: 0.9,
    icon: 'small',
    pad: [0.6, 1.6, 0.6, 1.1],
    minW: 8,
    defaultIcon: 'dot',
    textGlow: 0.15,
  }),
  /* ---- 便條・紙張 ---- */
  sticky: spec('sticky', 'paper', P('#ffb6d0', '#f08db3', '#3d2430', '#b02a62'), {
    titleScale: 1.05,
    pad: [1.4, 1.2, 1.3, 1.1],
    minW: 7.5,
    minH: 5.5,
    tilt: -2,
    overflow: 0.2,
  }),
  notebook: spec('notebook', 'paper', P('#f7fbff', '#c5d5e8', '#2b3445', '#f08a8a'), {
    titleScale: 1,
    pad: [1.5, 1.1, 1.5, 2.4],
    minW: 10,
    minH: 5,
  }),
  parchment: spec('parchment', 'paper', P('#ecd3a2', '#6b4321', '#3d2513', '#7a4a20'), {
    titleScale: 1.2,
    textAlign: 'center',
    pad: [1.2, 1.8, 1.25, 1.8],
    minW: 9,
    overflow: 0.2,
  }),
  /* ---- 直播・標題 ---- */
  neon: spec('neon', 'show', P('#1a1428', '#ff4fd8', '#ffe2fb', '#b48cff'), {
    titleScale: 1.15,
    textAlign: 'center',
    pad: [0.95, 1.6, 1, 1.6],
    minW: 8,
    shadow: false,
    textGlow: 0.5,
    overflow: 0.7,
  }),
  news: spec('news', 'show', P('#13254d', '#f5c84c', '#ffffff', '#d92b2b'), {
    titleMode: 'label',
    titleScale: 0.85,
    pad: [0.65, 1.4, 0.75, 0.8],
    minW: 12,
  }),
  /* ---- 通知・系統 ---- */
  toast: spec('toast', 'system', P('#f1fdf6', '#bdf0d0', '#25402f', '#1f9d55'), {
    titleScale: 0.78,
    icon: 'badge',
    pad: [0.75, 1.5, 0.8, 1.05],
    minW: 10,
    defaultIcon: 'check',
  }),
  window: spec('window', 'system', P('#fffaf0', '#f0c66a', '#3b3326', '#e08a00'), {
    titleMode: 'bar',
    titleScale: 0.7,
    icon: 'big',
    button: true,
    pad: [0.9, 1.1, 0.8, 1.1],
    minW: 11,
    defaultIcon: 'warn',
  }),
  glass: spec('glass', 'system', P('#ffffff30', '#ffffff80', '#ffffff', '#ffffff'), {
    titleScale: 1,
    textAlign: 'center',
    pad: [0.9, 1.6, 0.95, 1.6],
    minW: 9,
  }),
  capsule: spec('capsule', 'system', P('#ffe2e6', '#f09aa5', '#a3374a', '#a3374a'), {
    titleMode: 'side',
    titleScale: 1,
    textAlign: 'center',
    pad: [0.5, 1.3, 0.5, 1.3],
    minW: 8,
    shadow: false,
  }),
  card: spec('card', 'system', P('#ffffff', '#e3e7ee', '#374151', '#3b82f6'), {
    titleMode: 'side',
    titleScale: 1,
    pad: [0.75, 1.1, 0.7, 0.9],
    minW: 10,
  }),
  /* ---- 科幻・賽博 ---- */
  hud: spec('hud', 'sf', P('#082a33e0', '#38d6f5', '#c8f7ff', '#38d6f5'), {
    titleMode: 'bar',
    titleScale: 0.62,
    pad: [0.9, 1.2, 1.05, 1.2],
    minW: 9,
    shadow: false,
    textGlow: 0.3,
    overflow: 0.45,
  }),
  terminal: spec('terminal', 'sf', P('#12141c', '#2b2f3c', '#5cff9d', '#9aa1b2'), {
    titleMode: 'bar',
    titleScale: 0.58,
    pad: [0.95, 1.1, 1.05, 1.1],
    minW: 12,
    minH: 4,
    textGlow: 0.25,
  }),
  hologram: spec('hologram', 'sf', P('#7c6cff48', '#a99bff', '#f3efff', '#6fe3ff'), {
    titleScale: 0.85,
    textAlign: 'center',
    pad: [1, 1.5, 1, 1.5],
    minW: 9,
    shadow: false,
    textGlow: 0.35,
    overflow: 0.4,
  }),
};

export const styleOf = (id: StyleId): StyleSpec => STYLES[id] ?? STYLES.messenger;

/** 造型的預設配色與圖示（normalizeBubble 用） */
export const styleDefaults = (id: StyleId): { colors: Palette; icon: IconId } => {
  const s = styleOf(id);
  return { colors: { ...s.colors }, icon: s.defaultIcon };
};

/** 這個造型用得到哪些欄位 */
export function styleFields(id: StyleId): { title: boolean; icon: boolean; button: boolean } {
  const s = styleOf(id);
  return { title: true, icon: s.icon !== 'none', button: s.button };
}

/** 造型選單的分組順序 */
export const STYLE_GROUPS: readonly StyleGroup[] = [
  'chat',
  'game',
  'paper',
  'show',
  'system',
  'sf',
];
