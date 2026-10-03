/**
 * GIF 接合器的資料：設定與畫布上的動圖（復原／重做、自動保存到 localStorage），以及不列入復原的畫面狀態。
 * 動圖檔本身在 media.ts 的資產庫（IndexedDB），這裡只記 id。
 */
import { create } from 'zustand';
import { moveItem } from '@/core/compose';
import type { Box } from '@/core/layout';
import { createToolStore } from '@/core/storage';
import type { StageZoom } from '@/ui';
import {
  arrangeGrid,
  type CombinerData,
  type CombinerItem,
  DEFAULTS,
  normalizeData,
  squareCanvas,
  suggestedDuration,
  TOOL_ID,
  tightGrid,
  topZ,
  zInListOrder,
} from './logic';

export const PROJECT_VERSION = 1;

export const useCombiner = createToolStore<CombinerData>(TOOL_ID, DEFAULTS, {
  version: 1,
  migrate: (persisted) => normalizeData(persisted) ?? DEFAULTS,
});

/** 畫面狀態（不存、不列入復原） */
interface UiState {
  selected: string | null;
  zoom: StageZoom;
  /** 正在讀檔的數量 */
  loading: number;
}

export const useUi = create<UiState>(() => ({ selected: null, zoom: 'fit', loading: 0 }));

export const dataNow = (): CombinerData => useCombiner.getState().data;

export function edit(recipe: (d: CombinerData) => void): void {
  useCombiner.getState().update(recipe);
}

export const select = (id: string | null): void => useUi.setState({ selected: id });

/**
 * 按鈕這類一次完成的動作：自己算一步復原（不和 0.4 秒內的前後變更合併，例如連按「正方格」「去掉留白」）。
 * 已經在手勢中（例如拖曳、加入檔案途中）時併進那個手勢。
 */
export function step(fn: () => void): void {
  if (useCombiner.inGesture()) {
    fn();
    return;
  }
  useCombiner.beginGesture();
  try {
    fn();
  } finally {
    useCombiner.endGesture();
  }
}

/** 加入或刪除之後：總播放時間改成最長那張的長度（沒有動圖時不改，F09） */
function syncDuration(d: CombinerData): void {
  const ms = suggestedDuration(d.items);
  if (ms !== null) d.durationMs = ms;
}

export function addItem(item: Omit<CombinerItem, 'z'>): void {
  edit((d) => {
    d.items.push({ ...item, z: topZ(d.items) });
    syncDuration(d);
  });
}

export function removeItem(id: string): void {
  step(() =>
    edit((d) => {
      const i = d.items.findIndex((it) => it.id === id);
      if (i < 0) return;
      d.items.splice(i, 1);
      syncDuration(d);
    }),
  );
  if (useUi.getState().selected === id) select(null);
}

/** 清單排序（上下移、拖曳）：疊放改成清單順序（F07） */
export function reorder(from: number, to: number): void {
  edit((d) => {
    d.items = zInListOrder(moveItem(d.items, from, to));
  });
}

/** 點選移到最上層（F14；清單順序不變） */
export function bringToFront(id: string): void {
  edit((d) => {
    const it = d.items.find((x) => x.id === id);
    if (!it) return;
    const others = d.items.filter((x) => x.id !== id);
    if (others.every((x) => x.z < it.z)) return;
    it.z = topZ(others);
  });
}

export function setBox(id: string, box: Box): void {
  edit((d) => {
    const it = d.items.find((x) => x.id === id);
    if (!it) return;
    it.x = box.x;
    it.y = box.y;
    it.width = box.width;
    it.height = box.height;
  });
}

function applyBoxes(d: CombinerData, boxes: readonly Box[]): void {
  d.items.forEach((it, i) => {
    const b = boxes[i];
    it.x = b.x;
    it.y = b.y;
    it.width = b.width;
    it.height = b.height;
  });
}

/** 排列（F21） */
export function arrange(): void {
  step(() =>
    edit((d) => {
      if (!d.items.length) return;
      applyBoxes(d, arrangeGrid(d.items, d.canvas, d.grid.cols, d.grid.rows));
    }),
  );
}

/** 正方格（F22）：改畫布、配合畫面、排列 */
export function arrangeSquare(): void {
  step(() =>
    edit((d) => {
      d.canvas = squareCanvas(d.grid.cols, d.grid.rows);
      if (d.items.length) applyBoxes(d, arrangeGrid(d.items, d.canvas, d.grid.cols, d.grid.rows));
    }),
  );
  useUi.setState({ zoom: 'fit' });
}

/** 去掉留白（F23）：沒有動圖時什麼都不做 */
export function arrangeTight(): void {
  const t = tightGrid(dataNow().items, dataNow().grid.cols, dataNow().grid.rows);
  if (!t) return;
  step(() =>
    edit((d) => {
      d.canvas = t.canvas;
      applyBoxes(d, t.boxes);
    }),
  );
  useUi.setState({ zoom: 'fit' });
}
