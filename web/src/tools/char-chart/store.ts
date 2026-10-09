/**
 * 狀態與動作：
 * - useChart：角色清單、四象限的頁面與位置、關係圖（自動儲存、可復原；拖曳、文字欄放開才記一步）；
 * - usePrefs：目前的圖表、頁、線的種類、匯出倍率、契合度的選擇（自動儲存，不列入復原）；
 * - useUi：只在這次開頁有效的東西（選取的角色、關係圖上點了第一個的人、正在畫面上改的字）；
 * - 角色的圖片存在 IndexedDB 的資產庫（core/assets），狀態只記 id。
 */
import { create } from 'zustand';
import { createAssetStore, referencedAssetIds } from '@/core/assets';
import { moveItem } from '@/core/compose';
import { createPreviewStore, createToolStore, historyGesture } from '@/core/storage';
import {
  type AxisKey,
  applyShareEntries,
  type Character,
  type ChartKind,
  type ChartState,
  clampPosition,
  clipText,
  createCharacter,
  deleteCharacter,
  deleteLegend,
  type ImageRef,
  imageIds,
  initialState,
  type LabelKey,
  type Legend,
  LIMITS,
  mapMembers,
  NEW_PAGE_LABELS,
  newLegendLabel,
  newPageTitle,
  nextColor,
  nextId,
  normalizeState,
  PALETTE,
  type Point,
  type QuadPage,
  randomLinks,
  type ShareEntry,
  toggleLink,
} from './model';

export const TOOL_ID = 'char-chart';
/** 專案檔與自動儲存的資料版本 */
export const DATA_VERSION = 1;

export const useChart = createToolStore<ChartState>(TOOL_ID, initialState(), {
  version: DATA_VERSION,
  migrate: (persisted) => normalizeState(persisted),
  coalesceMs: 0,
  historyLimit: 150,
});

/* 存檔可能缺欄位或被改壞：開頁時整理一次（沒有變化時不寫回），清空復原紀錄 */
{
  const cur = useChart.getState().data;
  const fixed = normalizeState(cur);
  if (JSON.stringify(fixed) !== JSON.stringify(cur)) useChart.getState().replace(fixed);
  useChart.temporal.getState().clear();
}

/** 拖曳、滑桿、文字欄：放開（離開）才記一步 */
export const gesture = historyGesture(useChart);

export const assets = createAssetStore(TOOL_ID);

/**
 * 這次開頁放進圖片庫的圖（新增區選好、還沒按「加入角色」的，換圖片、讀檔…）：
 * 還沒寫進狀態也要在整理時保留（規格 3.6、7.1）。
 */
const sessionImages = new Set<string>();
export const markSessionImage = (id: string): void => {
  sessionImages.add(id);
};

/** 整理圖片庫時保留的圖：狀態與復原紀錄裡用到的＋這次開頁放進來的 */
export function referencedImages(): Set<string> {
  const keep = referencedAssetIds(useChart, imageIds);
  for (const id of sessionImages) keep.add(id);
  return keep;
}

export const chartNow = (): ChartState => useChart.getState().data;

/* ---------- 偏好（不列入復原） ---------- */

export type CompareMode = 'pair' | 'group';
export type ExportScale = 1 | 2;

export interface Prefs {
  chart: ChartKind;
  /** 四象限目前的頁（索引） */
  page: number;
  /** 關係圖目前用來連線的線的種類 */
  legend: string;
  scale: ExportScale;
  compare: CompareMode;
  pairA: string;
  pairB: string;
}

export const usePrefs = createPreviewStore<Prefs>(TOOL_ID, {
  chart: 'quadrant',
  page: 0,
  legend: 'l1',
  scale: 1,
  compare: 'pair',
  pairA: '',
  pairB: '',
});

/** 目前的頁（夾在範圍內：刪頁、復原之後索引可能超出） */
export const pageIndexOf = (d: ChartState, page: number): number =>
  Math.max(0, Math.min(d.pages.length - 1, Math.floor(page) || 0));

export const currentPageIndex = (): number =>
  pageIndexOf(chartNow(), usePrefs.getState().data.page);

/** 目前用來連線的線（找不到時用第一種） */
export const activeLegendOf = (legends: readonly Legend[], id: string): Legend | undefined =>
  legends.find((l) => l.id === id) ?? legends[0];

export function setChart(chart: ChartKind): void {
  if (usePrefs.getState().data.chart === chart) return;
  flushNudge();
  usePrefs.getState().patch({ chart });
  useUi.setState({ linkFrom: null, editing: null });
}

export function goPage(i: number): void {
  const d = chartNow();
  const next = pageIndexOf(d, i);
  if (next === currentPageIndex()) return;
  flushNudge();
  usePrefs.getState().patch({ page: next });
  useUi.setState({ editing: null });
}

/* ---------- 介面狀態 ---------- */

export interface UiState {
  /** 選取的角色（清單、四象限、選取的角色面板） */
  selectedId: string | null;
  /** 關係圖：點了第一個人，等著點第二個人連線 */
  linkFrom: string | null;
  /** 正在畫面上改的字 */
  editing: { chart: ChartKind; key: LabelKey } | null;
}

export const useUi = create<UiState>(() => ({ selectedId: null, linkFrom: null, editing: null }));

export const select = (id: string | null): void => useUi.setState({ selectedId: id });

/* ---------- 編輯與復原 ---------- */

/** 一次變更＝一步復原（手勢中除外）；方向鍵的連按還沒結束時先結束（不和方向鍵併成同一步） */
export function edit(recipe: (d: ChartState) => void): void {
  if (!nudging) flushNudge();
  useChart.getState().update((d) => {
    recipe(d as ChartState);
  });
}

/**
 * 復原／重做（快捷鍵與頁首按鈕）：方向鍵的連按還沒結束時先結束成一步再復原；
 * 拖曳中（還沒放開）不做事，免得跳過上一步。
 */
export function historyStep(kind: 'undo' | 'redo'): void {
  flushNudge();
  if (useChart.inGesture()) return;
  const t = useChart.temporal.getState();
  if (kind === 'undo') t.undo();
  else t.redo();
}

/* ---------- 角色 ---------- */

export const canAddCharacter = (): boolean => chartNow().characters.length < LIMITS.characters;

/**
 * 加入一個角色；`placeOn` 給了頁的索引時放在那一頁的中央（四象限）。回傳新角色的 id（到上限時 null）。
 */
export function addCharacter(
  input: { name: string; color?: string; image?: ImageRef | null },
  placeOn: number | null,
): string | null {
  if (!canAddCharacter()) return null;
  let id: string | null = null;
  edit((d) => {
    const c = createCharacter(d.characters, input);
    d.characters.push(c);
    id = c.id;
    const page = placeOn === null ? undefined : d.pages[placeOn];
    if (page) page.positions[c.id] = { x: 0, y: 0 };
  });
  select(id);
  return id;
}

/** 一次加入好幾個有圖片的角色（名字取自檔名、顏色依序）；回傳加入的 id */
export function addImageCharacters(
  list: readonly { name: string; image: ImageRef }[],
  placeOn: number | null,
): string[] {
  const ids: string[] = [];
  edit((d) => {
    for (const it of list) {
      if (d.characters.length >= LIMITS.characters) break;
      const c = createCharacter(d.characters, { name: it.name, image: it.image });
      d.characters.push(c);
      ids.push(c.id);
      const page = placeOn === null ? undefined : d.pages[placeOn];
      if (page) page.positions[c.id] = { x: 0, y: 0 };
    }
  });
  if (ids.length) select(ids[ids.length - 1]);
  return ids;
}

export function patchCharacter(
  id: string,
  patch: Partial<Pick<Character, 'name' | 'color' | 'marker' | 'inMap'>>,
): void {
  edit((d) => {
    const c = d.characters.find((x) => x.id === id);
    if (!c) return;
    if (patch.name !== undefined) c.name = clipText(patch.name, LIMITS.name);
    if (patch.color !== undefined) c.color = patch.color;
    if (patch.marker !== undefined) c.marker = patch.marker;
    if (patch.inMap !== undefined) {
      c.inMap = patch.inMap;
      /* 拿出關係圖：這個人的連線一起刪（可以復原） */
      if (!patch.inMap)
        d.relation.links = d.relation.links.filter((l) => l.from !== id && l.to !== id);
    }
    if (!c.image) c.marker = 'dot';
  });
  if (patch.inMap === false && useUi.getState().linkFrom === id) useUi.setState({ linkFrom: null });
}

/** 換圖片（圖片標記一起打開）；null＝拿掉圖片 */
export function setCharacterImage(id: string, image: ImageRef | null): void {
  edit((d) => {
    const c = d.characters.find((x) => x.id === id);
    if (!c) return;
    c.image = image;
    c.marker = image ? 'image' : 'dot';
  });
}

export function removeCharacter(id: string): void {
  edit((d) => deleteCharacter(d, id));
  const ui = useUi.getState();
  if (ui.selectedId === id) select(null);
  if (ui.linkFrom === id) useUi.setState({ linkFrom: null });
}

export function moveCharacter(from: number, to: number): void {
  edit((d) => {
    d.characters = moveItem(d.characters, from, to);
  });
}

/** 刪掉所有角色（頁面、線的種類、標題留著） */
export function clearCharacters(): void {
  edit((d) => {
    d.characters = [];
    for (const p of d.pages) p.positions = {};
    d.relation.links = [];
  });
  useUi.setState({ selectedId: null, linkFrom: null });
}

/** 下一個新角色的預設顏色 */
export const suggestedColor = (): string => nextColor(chartNow().characters);

/* ---------- 四象限：位置 ---------- */

export function placeCharacter(id: string, pageIndex: number, at: Point = { x: 0, y: 0 }): void {
  edit((d) => {
    const p = d.pages[pageIndex];
    if (p && d.characters.some((c) => c.id === id)) p.positions[id] = clampPosition(at);
  });
}

export function unplaceCharacter(id: string, pageIndex: number): void {
  edit((d) => {
    const p = d.pages[pageIndex];
    if (p) delete p.positions[id];
  });
}

export function setPosition(id: string, pageIndex: number, at: Point): void {
  edit((d) => {
    const p = d.pages[pageIndex];
    if (p?.positions[id]) p.positions[id] = clampPosition(at);
  });
}

/* 方向鍵：連按（停頓 0.5 秒以內）算一步復原 */
let nudgeTimer: ReturnType<typeof setTimeout> | undefined;
let nudging = false;
export function nudgeSelected(dx: number, dy: number): void {
  const id = useUi.getState().selectedId;
  const i = currentPageIndex();
  const pos = id ? chartNow().pages[i]?.positions[id] : undefined;
  if (!id || !pos) return;
  useChart.beginGesture();
  nudging = true;
  try {
    setPosition(id, i, { x: pos.x + dx, y: pos.y + dy });
  } finally {
    nudging = false;
  }
  clearTimeout(nudgeTimer);
  nudgeTimer = setTimeout(flushNudge, 500);
}

/** 結束方向鍵的連按（開始別的手勢、復原、換頁之前呼叫，兩者不會併成一步） */
export function flushNudge(): void {
  if (nudgeTimer === undefined) return;
  clearTimeout(nudgeTimer);
  nudgeTimer = undefined;
  useChart.endGesture();
}

/* ---------- 四象限：頁面 ---------- */

export const canAddPage = (): boolean => chartNow().pages.length < LIMITS.pages;

/** 加一頁在最後面並切過去 */
export function addPage(): boolean {
  if (!canAddPage()) return false;
  let index = 0;
  edit((d) => {
    d.pages.push({
      id: nextId('p', d.pages),
      title: newPageTitle(d.pages.length + 1),
      labels: { ...NEW_PAGE_LABELS },
      positions: {},
    });
    index = d.pages.length - 1;
  });
  usePrefs.getState().patch({ page: index });
  useUi.setState({ editing: null });
  return true;
}

/** 刪掉一頁（至少留一頁）；之後停在同一個位置（最後一頁時往前一頁） */
export function deletePage(i: number): boolean {
  if (chartNow().pages.length <= 1) return false;
  edit((d) => {
    d.pages.splice(i, 1);
  });
  usePrefs.getState().patch({ page: pageIndexOf(chartNow(), i) });
  useUi.setState({ editing: null });
  return true;
}

export function movePage(from: number, to: number): void {
  edit((d) => {
    d.pages = moveItem(d.pages, from, to);
  });
}

export function setPageText(i: number, key: LabelKey, value: string): void {
  edit((d) => {
    const p = d.pages[i];
    if (!p) return;
    if (key === 'title') p.title = clipText(value, LIMITS.title);
    else p.labels[key as AxisKey] = clipText(value, LIMITS.axis);
  });
}

/** 套用座標碼到目前的頁；回傳數量 */
export function applyShare(entries: readonly ShareEntry[]) {
  let result = { added: 0, updated: 0, skipped: 0 };
  const i = currentPageIndex();
  edit((d) => {
    result = applyShareEntries(d, i, entries);
  });
  return result;
}

/* ---------- 關係圖 ---------- */

export function setRelationTitle(title: string): void {
  edit((d) => {
    d.relation.title = clipText(title, LIMITS.title);
  });
}

export function setShowNames(v: boolean): void {
  edit((d) => {
    d.relation.showNames = v;
  });
}

export const setActiveLegend = (id: string): void => usePrefs.getState().patch({ legend: id });

export const canAddLegend = (): boolean => chartNow().relation.legends.length < LIMITS.legends;

/** 新增一種線（顏色依序、實線），並切到這一種；回傳 id */
export function addLegend(): string | null {
  if (!canAddLegend()) return null;
  let id = '';
  edit((d) => {
    const used = new Set(d.relation.legends.map((l) => l.color));
    id = nextId('l', d.relation.legends);
    d.relation.legends.push({
      id,
      label: newLegendLabel(d.relation.legends.length + 1),
      color: PALETTE.find((c) => !used.has(c)) ?? PALETTE[0],
      style: 'solid',
    });
  });
  setActiveLegend(id);
  return id;
}

export function patchLegend(id: string, patch: Partial<Omit<Legend, 'id'>>): void {
  edit((d) => {
    const l = d.relation.legends.find((x) => x.id === id);
    if (!l) return;
    if (patch.label !== undefined) l.label = clipText(patch.label, LIMITS.legend);
    if (patch.color !== undefined) l.color = patch.color;
    if (patch.style !== undefined) l.style = patch.style;
  });
}

/** 刪掉一種線（用到它的連線一起刪；最後一種不能刪）；刪掉的是目前用的就換成第一種 */
export function removeLegend(id: string): boolean {
  if (chartNow().relation.legends.length <= 1) return false;
  edit((d) => {
    deleteLegend(d, id);
  });
  if (usePrefs.getState().data.legend === id)
    setActiveLegend(chartNow().relation.legends[0]?.id ?? '');
  return true;
}

export function moveLegend(from: number, to: number): void {
  edit((d) => {
    d.relation.legends = moveItem(d.relation.legends, from, to);
  });
}

/**
 * 在關係圖上點一個人（規格 F55）：還沒有第一個人 → 記下；點同一個人 → 取消；
 * 點另一個人 → 用目前的線連起來（兩人之間已經有線就刪掉），然後取消。
 */
export function clickNode(id: string): 'start' | 'cancel' | 'added' | 'removed' {
  const from = useUi.getState().linkFrom;
  if (!from || !chartNow().characters.some((c) => c.id === from && c.inMap)) {
    useUi.setState({ linkFrom: id });
    return 'start';
  }
  if (from === id) {
    useUi.setState({ linkFrom: null });
    return 'cancel';
  }
  const d = chartNow();
  const legend = activeLegendOf(d.relation.legends, usePrefs.getState().data.legend);
  if (!legend) return 'cancel';
  const r = toggleLink(d.relation.links, from, id, legend.id);
  edit((draft) => {
    draft.relation.links = r.links;
  });
  useUi.setState({ linkFrom: null });
  return r.action === 'removed' ? 'removed' : 'added';
}

export function removeLink(i: number): void {
  edit((d) => {
    d.relation.links.splice(i, 1);
  });
}

export function setLinkLegend(i: number, legend: string): void {
  edit((d) => {
    const l = d.relation.links[i];
    if (l && d.relation.legends.some((x) => x.id === legend)) l.legend = legend;
  });
}

export function reverseLink(i: number): void {
  edit((d) => {
    const l = d.relation.links[i];
    if (l) [l.from, l.to] = [l.to, l.from];
  });
}

/** 隨機連線；回傳加了幾條（人不夠時 -1） */
export function randomConnect(random: () => number = Math.random): number {
  const d = chartNow();
  const members = mapMembers(d.characters).map((c) => c.id);
  if (members.length < 2) return -1;
  const add = randomLinks(
    members,
    d.relation.legends.map((l) => l.id),
    d.relation.links,
    random,
  );
  if (add.length)
    edit((draft) => {
      draft.relation.links.push(...add);
    });
  useUi.setState({ linkFrom: null });
  return add.length;
}

export function clearLinks(): void {
  edit((d) => {
    d.relation.links = [];
  });
  useUi.setState({ linkFrom: null });
}

/* ---------- 讀檔、重設 ---------- */

export function replaceAll(next: ChartState): void {
  flushNudge();
  useChart.getState().replace(next);
  useUi.setState({ selectedId: null, linkFrom: null, editing: null });
  usePrefs.getState().patch({ page: 0, legend: next.relation.legends[0]?.id ?? '' });
}

/** 選取的角色（找不到時 null；例如復原之後） */
export const selectedCharacter = (d: ChartState, id: string | null): Character | null =>
  (id && d.characters.find((c) => c.id === id)) || null;

export const pageOf = (d: ChartState, i: number): QuadPage => d.pages[pageIndexOf(d, i)];
