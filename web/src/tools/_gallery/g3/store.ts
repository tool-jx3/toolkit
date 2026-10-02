/**
 * 「立繪工作台」分頁的展示狀態：設定（可復原：拖曳、排序都算一步）＋預覽狀態（不列入復原）。不存檔（展示用）。
 */
import type { OutlineStyle, PatternKind } from '@/core/image';
import type { Box } from '@/core/layout';
import { createPreviewStore, createToolStore } from '@/core/storage';

export interface DemoCharacter {
  id: string;
  name: string;
  /** 身高 cm */
  height: number;
  /** 左緣位置 cm */
  x: number;
  visible: boolean;
  /** 示範圖的配色（FIGURE_COLORS 的索引）；使用者拖進來的圖用 assetId */
  art: number;
  assetId?: string;
}

export interface DemoVariant {
  id: string;
  file: string;
  variant: string;
}

export interface DemoExpression {
  id: string;
  label: string;
  eyes: string | null;
  mouth: string | null;
  decorations: string[];
  checked: boolean;
}

export interface G3Settings {
  /** 頭像版面（單位：內側區域的 %） */
  imageCenter: { x: number; y: number };
  imageScale: number;
  name: Box;
  ho: Box;
  pattern: PatternKind | 'none';
  frameWidth: number;
  /** 身高板 */
  characters: DemoCharacter[];
  /** 裁切框 */
  aspect: '3:4' | '1:1';
  range: number;
  offset: number;
  effect: OutlineStyle | 'none';
  effectColor: string;
  effectWidth: number;
  effectBlur: number;
  effectOffset: number;
  effectOpacity: number;
  /** 差分清單 */
  mainName: string;
  numbered: boolean;
  variants: DemoVariant[];
  /** 部件與表情清單 */
  draft: { eyes: string | null; mouth: string | null; decorations: string[]; label: string };
  expressions: DemoExpression[];
}

export const LAYOUT_DEFAULTS = {
  imageCenter: { x: 50, y: 56 },
  imageScale: 1,
  name: { x: 78, y: 8, width: 11, height: 48 },
  ho: { x: 7, y: 84, width: 20, height: 9 },
};

export const G3_DEFAULTS: G3Settings = {
  ...LAYOUT_DEFAULTS,
  pattern: 'dots',
  frameWidth: 18,
  characters: [
    { id: 'c1', name: '艾莉絲', height: 160, x: 5, visible: true, art: 0 },
    { id: 'c2', name: '鐵壁', height: 188, x: 60, visible: true, art: 2 },
    { id: 'c3', name: '小雪', height: 132, x: 120, visible: true, art: 1 },
  ],
  aspect: '3:4',
  range: 60,
  offset: 0,
  effect: 'stroke',
  effectColor: '#ffffff',
  effectWidth: 5,
  effectBlur: 12,
  effectOffset: 8,
  effectOpacity: 1,
  mainName: '',
  numbered: true,
  variants: [
    { id: 'v1', file: '艾莉絲_smile.png', variant: '笑' },
    { id: 'v2', file: '艾莉絲 normal.PNG', variant: '' },
    { id: 'v3', file: '艾莉絲-angry.webp', variant: '生氣' },
    { id: 'v4', file: 'noext', variant: '生氣' },
  ],
  draft: { eyes: 'round', mouth: 'smile', decorations: ['blush'], label: '開心' },
  expressions: [
    {
      id: 'e1',
      label: '開心',
      eyes: 'smile',
      mouth: 'open',
      decorations: ['blush'],
      checked: true,
    },
    { id: 'e2', label: '', eyes: 'closed', mouth: 'flat', decorations: [], checked: true },
    {
      id: 'e3',
      label: '有點緊張的時候',
      eyes: 'round',
      mouth: 'flat',
      decorations: ['sweat', 'gloom'],
      checked: false,
    },
  ],
};

export const useG3 = createToolStore<G3Settings>('_gallery-g3', G3_DEFAULTS, {
  persist: false,
  coalesceMs: 0,
  historyLimit: 60,
});

export type G3View = 'layout' | 'board' | 'crop';

export interface G3Preview {
  view: G3View;
  layoutSelected: string | null;
  boardSelected: string | null;
  boardZoom: number;
  cropZoom: number;
  cropPan: { x: number; y: number };
  editingId: string | null;
  selectedVariant: string | null;
}

export const useG3Preview = createPreviewStore<G3Preview>(
  '_gallery-g3',
  {
    view: 'layout',
    layoutSelected: 'name',
    boardSelected: null,
    boardZoom: 1,
    cropZoom: 1,
    cropPan: { x: 0, y: 0 },
    editingId: null,
    selectedVariant: 'v1',
  },
  { persist: false },
);
