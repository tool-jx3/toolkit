/**
 * 設定的 store：自動存檔＋復原／重做（主控裁定：核准加上，屬刻意改善）。
 * 取色視窗的圖片不存（每次開啟都清掉，見 PickerDialog）。
 *
 * 2026-10 併入色票櫃與配色卡：
 * - `useSettings.data.bars` 是角色清單（三種呈現共用），色票櫃、配色卡的設定也在同一個 store（一起復原、存進專案檔）；
 * - 角色的立繪、配色卡的照片存在 IndexedDB 的圖片庫（core/assets），狀態只記 id；
 * - `useView`：目前看哪一種呈現（不列入復原）。
 */
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import type { FramePlacement } from '@/core/image';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import { addPart, createCharacter, type NewCharacter, roomLeft } from './characters';
import {
  addBar,
  addSegment,
  type Bar,
  type CardColumn,
  type CardSettings,
  DEFAULT_CARD,
  DEFAULT_PLACEMENT_VALUE,
  DEFAULT_SETTINGS,
  DEFAULT_SHELF,
  imageIds,
  LIMITS,
  moveSegment,
  newId,
  type PartRole,
  type PickedColor,
  removeBar,
  removeSegment,
  replaceSegments,
  type Segment,
  type Settings,
  type ShelfSettings,
  sanitizeSettings,
  setBarScale,
  updateSegment,
} from './logic';

export const TOOL_ID = 'color-palette';
/** 自動存檔與專案檔的資料版本（2：角色清單、色票櫃、配色卡，2026-10；版本 1 的存檔照常讀） */
export const DATA_VERSION = 2;

export const useSettings = createToolStore<Settings>(TOOL_ID, DEFAULT_SETTINGS, {
  version: DATA_VERSION,
  migrate: (persisted) => sanitizeSettings(persisted),
});

/* 自動存檔讀回來的資料整理一次（舊資料、手改過的資料），不列入復原 */
{
  const st = useSettings.getState();
  const clean = sanitizeSettings(st.data);
  if (JSON.stringify(clean) !== JSON.stringify(st.data)) {
    st.replace(clean);
    useSettings.temporal.getState().clear();
  }
}

/** 文字欄、拖曳：放開（離開）才記一步 */
export const gesture = historyGesture(useSettings);

/** 角色的立繪、配色卡的照片 */
export const assets = createAssetStore(TOOL_ID);

/** 整理圖片庫時保留的圖：目前的狀態與復原紀錄用到的 */
export const referencedImages = (): Set<string> => referencedAssetIds(useSettings, imageIds);

export const settingsNow = (): Settings => useSettings.getState().data;
export const shelfOf = (s: Pick<Settings, 'shelf'>): ShelfSettings => s.shelf ?? DEFAULT_SHELF;
export const cardOf = (s: Pick<Settings, 'card'>): CardSettings => s.card ?? DEFAULT_CARD;

/* ---------- 目前的呈現（不列入復原） ---------- */

export type ViewMode = 'bar' | 'shelf' | 'card';

export const useView = createPreviewStore<{ mode: ViewMode }>(TOOL_ID, { mode: 'bar' });
export const setMode = (mode: ViewMode) => useView.getState().patch({ mode });

/* ---------- 操作（每次呼叫是一步復原；連續的變更 400 ms 內合併成一步） ---------- */

const setBars = (fn: (bars: readonly Bar[]) => Bar[]) => {
  const st = useSettings.getState();
  st.patch({ bars: fn(st.data.bars) });
};

const mapBar = (barId: string, fn: (bar: Bar) => Bar) =>
  setBars((list) => list.map((b) => (b.id === barId ? fn(b) : b)));

const setCard = (fn: (c: CardSettings) => CardSettings) => {
  const st = useSettings.getState();
  st.patch({ card: fn(cardOf(st.data)) });
};

const mapColumn = (id: string, fn: (c: CardColumn) => CardColumn) =>
  setCard((c) => ({ ...c, columns: c.columns.map((x) => (x.id === id ? fn(x) : x)) }));

export const actions = {
  patch: (partial: Partial<Settings>) => useSettings.getState().patch(partial),
  addBar: () => setBars((b) => addBar(b, useSettings.getState().data.baseScale)),
  removeBar: (barId: string) => setBars((b) => removeBar(b, barId)),
  setBarScale: (barId: string, scale: number) => setBars((b) => setBarScale(b, barId, scale)),
  addSegment: (barId: string) => setBars((b) => addSegment(b, barId)),
  removeSegment: (barId: string, segId: string) => setBars((b) => removeSegment(b, barId, segId)),
  updateSegment: (
    barId: string,
    segId: string,
    patch: Partial<Pick<Segment, 'color' | 'ratio' | 'role' | 'memo' | 'none'>>,
  ) => setBars((b) => updateSegment(b, barId, segId, patch)),
  moveSegment: (barId: string, from: number, to: number) =>
    setBars((b) => moveSegment(b, barId, from, to)),
  replaceSegments: (barId: string, picks: readonly PickedColor[]) =>
    setBars((b) => replaceSegments(b, barId, picks)),
  /** 畫布把手：交界上下兩段（在 segments 裡的索引）換成新的比例 */
  setPair: (barId: string, [ia, ib]: [number, number], [a, b]: [number, number]) =>
    mapBar(barId, (bar) => ({
      ...bar,
      segments: bar.segments.map((s, i) =>
        i === ia ? { ...s, ratio: a } : i === ib ? { ...s, ratio: b } : s,
      ),
    })),

  /* ---------- 角色（色票櫃、編輯視窗） ---------- */

  /** 加一位角色（清單滿了時不加，回傳 null） */
  addCharacter: (c: NewCharacter): string | null => {
    const st = useSettings.getState();
    if (!roomLeft(st.data.bars)) return null;
    const bar = createCharacter(c, st.data.baseScale);
    st.patch({ bars: [...st.data.bars, bar] });
    return bar.id;
  },
  /** 一次加好幾位（範例；放得下的才加） */
  addCharacters: (list: readonly Bar[]) => setBars((b) => [...b, ...list.slice(0, roomLeft(b))]),
  patchCharacter: (
    barId: string,
    patch: Partial<Pick<Bar, 'name' | 'theme' | 'hairFamily' | 'eyeFamily' | 'scale'>>,
  ) => mapBar(barId, (b) => ({ ...b, ...patch })),
  setImage: (barId: string, image: Bar['image'], avatar: FramePlacement | null) =>
    mapBar(barId, (b) => ({ ...b, image, avatar })),
  setAvatar: (barId: string, avatar: FramePlacement | null) =>
    mapBar(barId, (b) => ({ ...b, avatar })),
  addPart: (barId: string, role: PartRole, color: string, none = false) =>
    mapBar(barId, (b) => ({ ...b, segments: addPart(b.segments, role, color, { none }) })),
  /** 換掉某個部位的全部顏色（從立繪重新取色） */
  setRoleColors: (
    barId: string,
    role: 'hair' | 'eye',
    colors: { color: string; none: boolean }[],
  ) =>
    mapBar(barId, (b) => {
      let segs = b.segments.filter((s) => s.role !== role);
      for (const c of colors) segs = addPart(segs, role, c.color, { none: c.none });
      return { ...b, segments: segs };
    }),
  /** 清單的順序（色票櫃的「自己拖曳」） */
  setOrder: (ids: readonly string[]) =>
    setBars((list) => {
      const byId = new Map(list.map((b) => [b.id, b]));
      const next = ids.map((id) => byId.get(id)).filter((b): b is Bar => !!b);
      for (const b of list) if (!ids.includes(b.id)) next.push(b);
      return next;
    }),
  /** 全部清除（可以復原） */
  clearCharacters: () => {
    const st = useSettings.getState();
    st.patch({
      bars: [],
      card: {
        ...cardOf(st.data),
        columns: cardOf(st.data).columns.map((c) =>
          c.source === 'character' ? { ...c, characterId: null } : c,
        ),
      },
    });
  },

  /* ---------- 色票櫃、配色卡的設定 ---------- */

  patchShelf: (patch: Partial<ShelfSettings>) => {
    const st = useSettings.getState();
    st.patch({ shelf: { ...shelfOf(st.data), ...patch } });
  },
  patchCard: (patch: Partial<Omit<CardSettings, 'columns'>>) =>
    setCard((c) => ({ ...c, ...patch })),
  addColumn: (init: Partial<CardColumn> = {}) =>
    setCard((c) =>
      c.columns.length >= LIMITS.cardColumns
        ? c
        : {
            ...c,
            columns: [
              ...c.columns,
              {
                id: newId('col'),
                source: 'character',
                characterId: null,
                image: null,
                name: '',
                autoName: false,
                placement: DEFAULT_PLACEMENT_VALUE,
                key: null,
                colors: 'auto',
                ...init,
              },
            ],
          },
    ),
  removeColumn: (id: string) =>
    setCard((c) =>
      c.columns.length <= 1 ? c : { ...c, columns: c.columns.filter((x) => x.id !== id) },
    ),
  patchColumn: (id: string, patch: Partial<Omit<CardColumn, 'id'>>) =>
    mapColumn(id, (c) => ({ ...c, ...patch })),
};
