/**
 * 操作：選取、刪除、再製、排序、樣式與動態、節點編輯、微調、對齊、自動排列、範本、開啟作品…
 * 每個按鈕動作算一步復原（step）；通知與狀態列由這裡發出。
 */
import type { Draft as ImmerDraft } from 'immer';
import { moveItem } from '@/core/compose';
import type { ToolId } from './editorDraw';
import {
  boundsCenter,
  clamp,
  cornerNode,
  reversePathPoints,
  smoothNode,
  translated,
  unionBounds,
} from './geometry';
import {
  type AlignAction,
  actionablePlans,
  elementCenter,
  isLayoutElement,
  layoutBounds,
  planAlignment,
} from './layout';
import {
  baseProject,
  blankFrom,
  classicTemplate,
  type McAnimation,
  type McElement,
  type McProject,
  type McStyle,
  normalizeProject,
  RANGE,
  runeTemplate,
  sigilTemplate,
  type TemplateResult,
  uid,
} from './model';
import {
  autoSequence,
  type MotionPresetId,
  reverseSequence,
  STYLE_PRESETS,
  type StylePresetId,
  withMotionPreset,
} from './motion';
import { canvasMeasure } from './render';
import { primaryElement, projectNow, selectedElements, usePrefs, useProject, useUi } from './store';
import { S } from './strings';

/* ---------- 通知、狀態列、外部橋接 ---------- */

export type Tone = 'info' | 'success' | 'warning' | 'danger';
export type Notify = (n: { title: string; tone: Tone }) => void;

let notifier: Notify = () => {};
export function setNotifier(fn: Notify | null): void {
  notifier = fn ?? (() => {});
}
export function notify(title: string, tone: Tone = 'info'): void {
  notifier({ title, tone });
}
export function setStatus(message: string): void {
  useUi.setState({ status: message });
}

/** 播放與畫面的橋接（預覽欄掛上） */
export const bridge = {
  seek: (_t: number): void => {},
  pause: (): void => {},
  toggle: (): void => {},
  time: (): number => usePrefs.getState().data.playhead,
  playing: (): boolean => false,
  fit: (): void => {},
  /** 畫布座標 → 視窗座標（測試入口用）；編輯畫面還沒準備好時 null */
  toClient: (_x: number, _y: number): { x: number; y: number; zoom: number } | null => null,
};

/* ---------- 修改作品 ---------- */

export function edit(recipe: (d: ImmerDraft<McProject>) => void): void {
  useProject.getState().update(recipe);
}

/** 一次完成的動作自己算一步（已在手勢中時併進那個手勢） */
export function step(fn: () => void): void {
  if (useProject.inGesture()) {
    fn();
    return;
  }
  useProject.beginGesture();
  try {
    fn();
  } finally {
    useProject.endGesture();
  }
}

function findIndex(d: McProject, id: string): number {
  return d.elements.findIndex((el) => el.id === id);
}

/** 改基準元素 */
export function editPrimary(recipe: (el: ImmerDraft<McElement>) => void): void {
  const id = useUi.getState().primary;
  if (!id) return;
  edit((d) => {
    const i = findIndex(d as McProject, id);
    if (i >= 0) recipe(d.elements[i]);
  });
}

export function setPrimaryStyle(patch: Partial<McStyle>): void {
  editPrimary((el) => {
    Object.assign(el.style, patch);
  });
}

export function setPrimaryAnimation(patch: Partial<McAnimation>): void {
  editPrimary((el) => {
    Object.assign(el.animation, patch);
  });
}

/* ---------- 選取（規格 F35、F36、F53） ---------- */

export function setSelection(
  ids: readonly string[],
  primary: string | null = null,
  anchor: string | null = primary,
): void {
  const valid = new Set(projectNow().elements.map((el) => el.id));
  const selected = [...new Set(ids)].filter((id) => valid.has(id));
  const p = primary && selected.includes(primary) ? primary : (selected.at(-1) ?? null);
  const a = anchor && valid.has(anchor) ? anchor : p;
  const ui = useUi.getState();
  const node = ui.node && selected.includes(ui.node.id) && ui.node.id === p ? ui.node : null;
  useUi.setState({ selected, primary: p, anchor: a, node, textSel: null });
}

export type SelectMode = 'replace' | 'toggle' | 'range' | 'preserve';

export function selectElement(id: string, mode: SelectMode = 'replace'): void {
  const p = projectNow();
  if (!p.elements.some((el) => el.id === id)) return;
  const ui = useUi.getState();
  const next = new Set(ui.selected);
  let primary: string | null = id;
  let anchor: string | null = id;
  if (mode === 'toggle') {
    if (next.has(id)) {
      next.delete(id);
      primary = ui.primary === id ? ([...next].at(-1) ?? null) : ui.primary;
    } else next.add(id);
  } else if (mode === 'range') {
    const a = p.elements.findIndex((el) => el.id === ui.anchor);
    const b = p.elements.findIndex((el) => el.id === id);
    next.clear();
    if (a >= 0 && b >= 0) {
      for (const el of p.elements.slice(Math.min(a, b), Math.max(a, b) + 1)) next.add(el.id);
      anchor = ui.anchor;
    } else next.add(id);
  } else if (mode === 'preserve') {
    next.add(id);
    anchor = ui.anchor ?? id;
  } else {
    next.clear();
    next.add(id);
  }
  setSelection([...next], primary, anchor);
  useUi.setState({ node: null });
}

export function clearSelection(): void {
  useUi.setState({ selected: [], primary: null, anchor: null, node: null, textSel: null });
}

/** 全選可編輯（F42） */
export function selectAll(): void {
  const p = projectNow();
  const list = p.elements.filter((el) => el.visible && !el.locked && isLayoutElement(el));
  if (!list.length) {
    notify(S.msg.noSelectable);
    return;
  }
  const cur = useUi.getState().primary;
  const primary = cur && list.some((el) => el.id === cur) ? cur : list[list.length - 1].id;
  setSelection(
    list.map((el) => el.id),
    primary,
    primary,
  );
  useUi.setState({ node: null });
  notify(S.msg.selectedAll(list.length), 'success');
}

/* ---------- 刪除、再製、排序（F40、F41、F56） ---------- */

export function deleteSelected(): void {
  const p = projectNow();
  const sel = selectedElements(p);
  if (!sel.length) return;
  const index = p.elements.findIndex((el) => el.id === useUi.getState().primary);
  const ids = new Set(sel.map((el) => el.id));
  step(() =>
    edit((d) => {
      d.elements = d.elements.filter((el) => !ids.has(el.id));
    }),
  );
  const rest = projectNow().elements;
  const next = rest[Math.min(Math.max(0, index), rest.length - 1)]?.id ?? null;
  setSelection(next ? [next] : [], next, next);
  useUi.setState({ node: null });
  notify(sel.length === 1 ? S.msg.deletedOne(sel[0].name) : S.msg.deletedMany(sel.length));
}

export function duplicateSelected(): void {
  const p = projectNow();
  const sel = selectedElements(p);
  if (!sel.length) return;
  const ids = new Set(sel.map((el) => el.id));
  const primary = useUi.getState().primary;
  const copies: McElement[] = [];
  const map = new Map<string, string>();
  const next: McElement[] = [];
  for (const el of p.elements) {
    next.push(el);
    if (!ids.has(el.id)) continue;
    const moved = translated(structuredClone(el) as McElement, 18, 18);
    const copy: McElement = {
      ...moved,
      id: uid(el.type),
      name: S.names.copy(el.name),
      animation: {
        ...moved.animation,
        start: Math.min(p.animation.duration, Number(moved.animation.start) + 0.1),
      },
    };
    next.push(copy);
    copies.push(copy);
    map.set(el.id, copy.id);
  }
  step(() =>
    edit((d) => {
      d.elements = next as ImmerDraft<McElement>[];
    }),
  );
  const nextPrimary = (primary && map.get(primary)) || copies.at(-1)?.id || null;
  setSelection(
    copies.map((c) => c.id),
    nextPrimary,
    nextPrimary,
  );
  notify(
    copies.length === 1 ? S.msg.duplicatedOne : S.msg.duplicatedMany(copies.length),
    'success',
  );
}

/** 基準元素上移（+1，往上層）／下移（−1） */
export function moveLayer(direction: 1 | -1): void {
  const p = projectNow();
  const i = p.elements.findIndex((el) => el.id === useUi.getState().primary);
  if (i < 0) return;
  const j = i + direction;
  if (j < 0 || j >= p.elements.length) return;
  step(() =>
    edit((d) => {
      const a = d.elements[i];
      d.elements[i] = d.elements[j];
      d.elements[j] = a;
    }),
  );
}

/** 清單拖曳排序（清單是上層在上：index 是倒過來的） */
export function reorderList(from: number, to: number): void {
  const n = projectNow().elements.length;
  edit((d) => {
    d.elements = moveItem(d.elements, n - 1 - from, n - 1 - to);
  });
}

export function toggleVisible(id: string): void {
  step(() =>
    edit((d) => {
      const el = d.elements.find((x) => x.id === id);
      if (el) el.visible = !el.visible;
    }),
  );
}

export function toggleLocked(id: string): void {
  step(() =>
    edit((d) => {
      const el = d.elements.find((x) => x.id === id);
      if (el) el.locked = !el.locked;
    }),
  );
}

/* ---------- 樣式、動態的預設集（F74、F95、F22） ---------- */

export function applyStylePreset(id: StylePresetId): void {
  if (!primaryElement()) return;
  step(() => setPrimaryStyle(STYLE_PRESETS[id]));
  notify(S.msg.stylePreset, 'success');
}

export function applyMotionPreset(id: MotionPresetId): void {
  const el = primaryElement();
  if (!el) return;
  const next = withMotionPreset(el.animation, id, projectNow().animation.duration);
  step(() => setPrimaryAnimation(next));
  notify(S.msg.motionPreset, 'success');
}

export function copyStyle(): void {
  const el = primaryElement();
  if (!el) {
    notify(S.msg.selectStyleSource);
    return;
  }
  useUi.setState({ clipboardStyle: structuredClone(el.style) as McStyle });
  notify(S.msg.styleCopied);
}

export function pasteStyle(): void {
  const style = useUi.getState().clipboardStyle;
  if (!style || !primaryElement()) return;
  step(() =>
    editPrimary((el) => {
      el.style = structuredClone(style) as McStyle;
    }),
  );
  notify(S.msg.stylePasted, 'success');
}

/* ---------- 節點編輯（F80、F81） ---------- */

function selectedPathNode(): { index: number } | null {
  const el = primaryElement();
  const node = useUi.getState().node;
  if (el?.type !== 'path' || !node || node.id !== el.id) return null;
  return { index: node.index };
}

export function smoothSelectedNode(): void {
  const n = selectedPathNode();
  if (!n) {
    notify(S.msg.selectNodeFirst);
    return;
  }
  const el = primaryElement();
  if (el?.type !== 'path' || !el.points[n.index] || el.points.length < 2) return;
  const points = smoothNode(el.points, n.index, el.closed);
  step(() =>
    editPrimary((d) => {
      if (d.type === 'path') d.points = points;
    }),
  );
}

export function cornerSelectedNode(): void {
  const n = selectedPathNode();
  if (!n) {
    notify(S.msg.selectNodeFirst);
    return;
  }
  const el = primaryElement();
  if (el?.type !== 'path' || !el.points[n.index]) return;
  const points = cornerNode(el.points, n.index);
  step(() =>
    editPrimary((d) => {
      if (d.type === 'path') d.points = points;
    }),
  );
}

export function reverseSelectedPath(): void {
  const el = primaryElement();
  if (el?.type !== 'path' || el.points.length < 2) return;
  const ui = useUi.getState();
  const node = ui.node?.id === el.id ? ui.node.index : null;
  const points = reversePathPoints(el.points);
  step(() =>
    editPrimary((d) => {
      if (d.type === 'path') d.points = points;
    }),
  );
  if (node !== null) useUi.setState({ node: { id: el.id, index: el.points.length - 1 - node } });
  notify(S.msg.pathReversed, 'success');
}

/* ---------- 微調、平移整個元素（F87、F138） ---------- */

export function moveElements(plans: readonly { id: string; dx: number; dy: number }[]): void {
  const byId = new Map(plans.map((p) => [p.id, p]));
  edit((d) => {
    d.elements = d.elements.map((el) => {
      const p = byId.get(el.id);
      return p ? (translated(el as McElement, p.dx, p.dy) as ImmerDraft<McElement>) : el;
    });
  });
}

/** 微調：dx、dy 為 0 時把外接框中心移到對稱中心 */
export function nudge(dx: number, dy: number, amount = 1): void {
  const p = projectNow();
  const list = selectedElements(p).filter((el) => !el.locked && isLayoutElement(el));
  if (!list.length) {
    notify(S.msg.nothingToMove);
    return;
  }
  let mx = dx * amount;
  let my = dy * amount;
  if (dx === 0 && dy === 0) {
    const b = unionBounds(list.map((el) => layoutBounds(el, canvasMeasure)));
    if (!b) return;
    const c = boundsCenter(b);
    mx = p.symmetry.centerX - c.x;
    my = p.symmetry.centerY - c.y;
  }
  if (Math.abs(mx) <= 1e-7 && Math.abs(my) <= 1e-7) return;
  step(() => moveElements(list.map((el) => ({ id: el.id, dx: mx, dy: my }))));
}

/* ---------- 對齊（F60～F63） ---------- */

const actionLabel = (a: AlignAction) => S.align.actions[a].label;

export function runAlignment(action: AlignAction): void {
  const p = projectNow();
  const ui = useUi.getState();
  const selected = selectedElements(p, ui);
  const key = primaryElement(p, ui);
  const reference = ui.alignRef;
  const r = planAlignment(p, { selected, key }, reference, action, canvasMeasure);
  const announce = (message: string, tone: Tone = 'info') => {
    setStatus(message);
    notify(message, tone);
  };
  if (!r.ok) {
    announce(S.align[r.reason]);
    return;
  }
  let label: string = actionLabel(action);
  if (action.startsWith('align-')) {
    const ref = reference === 'key' ? S.align.refKey(key?.name ?? '') : S.align.refName[reference];
    label = `${ref}${S.align.actions[action].label}`;
  }
  const plans = actionablePlans(r.plans);
  if (!plans.length) {
    announce(r.plans.length ? S.align.already(actionLabel(action)) : S.align.nothing);
    return;
  }
  step(() => moveElements(plans));
  const locked = selected.filter((el) => el.locked).length;
  announce(
    locked ? S.align.doneLocked(plans.length, label, locked) : S.align.done(plans.length, label),
    'success',
  );
}

/* ---------- 自動排列、反轉（F106、F107） ---------- */

function applySequence(changes: ReturnType<typeof reverseSequence>): void {
  const byId = new Map(changes.map((c) => [c.id, c]));
  edit((d) => {
    for (const el of d.elements) {
      const c = byId.get(el.id);
      if (!c) continue;
      el.animation.start = c.start;
      el.animation.duration = c.duration;
      if (c.mode) el.animation.mode = c.mode;
    }
  });
}

export function sequence(mode: 'layers' | 'center'): void {
  const changes = autoSequence(projectNow(), mode, (el) => elementCenter(el, canvasMeasure));
  if (!changes.length) return;
  step(() => applySequence(changes));
  notify(mode === 'center' ? S.msg.sequencedCenter : S.msg.sequencedLayers, 'success');
}

export function reverseOrder(): void {
  if (!projectNow().elements.length) return;
  step(() => applySequence(reverseSequence(projectNow())));
  notify(S.msg.sequenceReversed);
}

/* ---------- 畫布設定（F97、F99） ---------- */

export function setDocumentSize(axis: 'width' | 'height', value: number): void {
  const v = clamp(Math.round(value), RANGE.size[0], RANGE.size[1]);
  edit((d) => {
    const old = d.document[axis];
    const key = axis === 'width' ? 'centerX' : 'centerY';
    const wasMiddle = Math.abs(d.symmetry[key] - old / 2) < 0.001;
    d.document[axis] = v;
    if (wasMiddle) d.symmetry[key] = v / 2;
  });
}

export function centerSymmetry(): void {
  step(() =>
    edit((d) => {
      d.symmetry.centerX = d.document.width / 2;
      d.symmetry.centerY = d.document.height / 2;
    }),
  );
}

/* ---------- 時間軸設定 ---------- */

export function setTimelineDuration(v: number): void {
  edit((d) => {
    d.animation.duration = clamp(v, RANGE.timelineDuration[0], RANGE.timelineDuration[1]);
  });
  const D = projectNow().animation.duration;
  if (bridge.time() > D) bridge.seek(D);
}

/* ---------- 工具（F14、F43、F51） ---------- */

export function cancelDraft(): void {
  if (!useUi.getState().draft) return;
  useUi.setState({ draft: null, snap: null });
  setStatus(S.msg.drawCancelled);
}

export function setTool(tool: ToolId): void {
  const ui = useUi.getState();
  if (ui.draft && tool !== ui.tool) cancelDraft();
  useUi.setState({ tool });
}

/** 加入新元素（一步復原）並選取它 */
export function addElement(el: McElement, node: number | null = null): void {
  step(() =>
    edit((d) => {
      d.elements.push(el as ImmerDraft<McElement>);
    }),
  );
  setSelection([el.id], el.id, el.id);
  useUi.setState({ node: node === null ? null : { id: el.id, index: node } });
}

/** 文字工具放好文字後：切回選取、打開「形狀」分頁、聚焦文字內容並全選（F50） */
export function focusTextContent(): void {
  useUi.setState({ tool: 'select', tab: 'geometry' });
  setTimeout(() => {
    const el = document.getElementById('mc-text-content') as HTMLTextAreaElement | null;
    el?.focus();
    el?.select();
  }, 50);
}

/* ---------- 盧恩（F84、F85） ---------- */

export function applyRuneText(next: string, caret: number, message: string): void {
  const el = primaryElement();
  if (el?.type !== 'text') {
    notify(S.msg.selectTextFirst);
    return;
  }
  if (next === el.text) return;
  step(() =>
    editPrimary((d) => {
      if (d.type === 'text') d.text = next;
    }),
  );
  const pos = clamp(caret, 0, next.length);
  useUi.setState({ textSel: { id: el.id, start: pos, end: pos } });
  setStatus(message);
}

export function insertRuneText(text: string): void {
  if (!text) return;
  const el = primaryElement();
  if (el?.type !== 'text') {
    notify(S.msg.selectTextFirst);
    return;
  }
  const sel = useUi.getState().textSel;
  const cur = el.text;
  const has = sel && sel.id === el.id;
  const start = clamp(has ? sel.start : cur.length, 0, cur.length);
  const end = clamp(has ? sel.end : cur.length, start, cur.length);
  applyRuneText(
    cur.slice(0, start) + text + cur.slice(end),
    start + text.length,
    S.msg.runeInserted,
  );
}

/* ---------- 作品：範本、新文件、開啟 ---------- */

/** 取代整個作品（可以復原）：選取、播放頭、畫面跟著設定 */
export function replaceProject(
  next: McProject,
  {
    selectedId = null,
    playhead = next.animation.duration,
    message,
  }: {
    selectedId?: string | null;
    playhead?: number;
    message?: string;
  } = {},
): void {
  useUi.setState({ draft: null, snap: null, node: null });
  step(() => useProject.getState().replace(next));
  setSelection(selectedId ? [selectedId] : [], selectedId, selectedId);
  bridge.pause();
  bridge.seek(clamp(playhead, 0, next.animation.duration));
  bridge.fit();
  if (message) notify(message, 'success');
}

export type TemplateId = 'classic' | 'rune' | 'sigil' | 'blank';

export function applyTemplateById(id: TemplateId): void {
  if (id === 'blank') {
    replaceProject(blankFrom(projectNow()), { message: S.msg.templateBlank });
    return;
  }
  const t: TemplateResult =
    id === 'classic' ? classicTemplate() : id === 'rune' ? runeTemplate() : sigilTemplate();
  replaceProject(t.project, {
    selectedId: t.selectedId,
    message:
      id === 'classic'
        ? S.msg.templateClassic
        : id === 'rune'
          ? S.msg.templateRune
          : S.msg.templateSigil,
  });
  if (id === 'sigil') setTool('freehand');
}

export function newProject(): void {
  replaceProject(baseProject(S.names.newProject, 1000, 1000), { message: S.msg.newDocument });
}

/** 開啟作品資料（新版專案檔的 data、舊版的 .arcana.json） */
export function openProjectData(raw: unknown): void {
  const n = normalizeProject(raw);
  replaceProject(n.project, {
    selectedId: n.selectedId,
    playhead: n.playhead ?? n.project.animation.duration,
  });
}
