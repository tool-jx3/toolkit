import {
  AlignHorizontalSpaceAround,
  ArrowDown,
  ArrowDownToLine,
  ArrowDownWideNarrow,
  ArrowUp,
  ArrowUpNarrowWide,
  ArrowUpToLine,
  Copy,
  Download,
  Eye,
  ImagePlus,
  ImageUp,
  Maximize2,
  Minus,
  MoveVertical,
  Plus,
  Redo2,
  Rows3,
  Search,
  Trash2,
  Undo2,
  X,
} from 'lucide-react';
import {
  type FocusEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { importAssetFiles } from '@/core/assets';
import { downloadBlob, pickFiles } from '@/core/files';
import { ensureFonts } from '@/core/fonts';
import { canvasToBlob } from '@/core/image';
import { type Box, hitTest } from '@/core/layout';
import { historyGesture, type ProjectFile, ProjectFileError, useUndoRedo } from '@/core/storage';
import {
  Button,
  Field,
  IconButton,
  isEditableTarget,
  isFormControlTarget,
  LayerList,
  Notice,
  type NoticeTone,
  NumberInput,
  PanZoomViewport,
  type PanZoomViewportHandle,
  ProjectMenu,
  type ProjectNotice,
  Section,
  type Shortcut,
  Slider,
  TextInput,
  ToolShell,
  UsageSection,
  useToast,
  type ViewportDrag,
  type ViewportPointer,
  WindowDrop,
} from '@/ui';
import { type AddEntry, BatchAddDialog, SingleAddDialog } from './AddDialogs';
import {
  arrangeByHeight,
  arrangeEvenly,
  BOTTOM_SLIDER,
  type BoardData,
  boardRange,
  type Character,
  clampBottomLine,
  clampTopLine,
  duplicateOf,
  EMPTY_BOARD,
  exportFileName,
  exportLayout,
  fileStamp,
  formatHeight,
  formatPercent,
  geometry,
  HEIGHT,
  isFiltering,
  listRows,
  moveListRow,
  moveOrder,
  NUDGE_MERGE_MS,
  nameFromFile,
  nextX,
  type OrderMove,
  placeDropped,
  placeInRow,
  resolveName,
  type SortDirection,
  sanitizeBoard,
  TOP_SLIDER,
  ZOOM,
} from './logic';
import {
  BOARD_PADDING,
  type BoardItem,
  drawBoard,
  drawRulerGutter,
  GUTTER_PX,
  hitLine,
  type LineKind,
  lineHandles,
  renderExport,
} from './render';
import {
  assets,
  collectGarbage,
  cropOf,
  disableAutosave,
  flushAutosave,
  getBitmapVersion,
  markSessionAsset,
  PROJECT_VERSION,
  prepareImage,
  requestBitmap,
  subscribeBitmaps,
  TOOL_ID,
  thumbnailOf,
  useBoard,
  useSaveState,
} from './store';
import { S } from './strings';

declare global {
  interface Window {
    __heightBoard?: unknown;
  }
}

let idSeq = 0;
const newId = () =>
  `c${Date.now().toString(36)}${(++idSeq).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const g = historyGesture(useBoard);

/** 清單縮圖框：60：84 的比例，列高約 68 px（緊密列距約 44 px） */
const THUMB_SIZE = { width: 42, height: 58 };

const board = () => useBoard.getState().data.characters;
const setCharacters = (characters: Character[]) => useBoard.getState().patch({ characters });
const editCharacter = (id: string, fn: (c: Character) => void) =>
  useBoard.getState().update((d) => {
    const c = d.characters.find((x) => x.id === id);
    if (c) fn(c as Character);
  });

const undo = () => {
  useBoard.endGesture();
  useBoard.temporal.getState().undo();
};
const redo = () => {
  useBoard.endGesture();
  useBoard.temporal.getState().redo();
};

const isSpinbutton = (t: EventTarget | null) =>
  t instanceof HTMLElement && t.getAttribute('role') === 'spinbutton';

const inOverlay = (t: EventTarget | null) =>
  t instanceof Element && !!t.closest('[role="dialog"],[role="alertdialog"],[role="menu"]');

const clockTime = (ms: number) =>
  new Date(ms).toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });

/** 一次聚焦期間的修改算一步復原（文字欄、數字欄、滑桿） */
function FocusGesture({ children }: { children: ReactNode }) {
  return (
    <div className="contents" onFocusCapture={g.begin} onBlurCapture={g.commit}>
      {children}
    </div>
  );
}

/** ToolShell 裡面才拿得到通知：交給 App 的按鈕與非同步處理使用 */
type Toast = ReturnType<typeof useToast>;
function UiBridge({ api }: { api: RefObject<Toast | null> }) {
  const toast = useToast();
  useLayoutEffect(() => {
    api.current = toast;
  }, [api, toast]);
  return null;
}

interface Pending {
  files: File[];
  /** 放開在盤面上的位置（cm）；一般加入是 null */
  dropX: number | null;
}

interface Freeze {
  id: string;
  box: Box;
  world: Box;
}

interface Message {
  tone: NoticeTone;
  text: string;
}

function Usage() {
  return (
    <>
      <p>{S.usageIntro}</p>
      <ol className="mt-2">
        {S.usageSteps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <p className="mt-2 font-semibold">{S.usageNotesTitle}</p>
      <ul>
        {S.usageNotes.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </>
  );
}

/** 開頁時只做一次：還原（略過圖片不見的角色）、清空復原紀錄、清掉沒人用的圖 */
let restored = false;
async function restoreOnce(onMissing: (n: number) => void): Promise<void> {
  if (restored) return;
  restored = true;
  const t = useBoard.temporal.getState();
  const current = useBoard.getState().data;
  const clean = sanitizeBoard(current) ?? EMPTY_BOARD;
  if (JSON.stringify(clean) !== JSON.stringify(current)) {
    t.pause();
    useBoard.getState().replace(clean);
    t.resume();
  }
  const ids = [...new Set(clean.characters.map((c) => c.imageId))];
  for (const id of ids) markSessionAsset(id);
  const { missing } = await assets.preload(ids).catch(() => ({ missing: ids }));
  if (missing.length) {
    const gone = new Set(missing);
    const before = board();
    const after = before.filter((c) => !gone.has(c.imageId));
    if (after.length !== before.length) {
      t.pause();
      setCharacters(after);
      t.resume();
      onMissing(before.length - after.length);
    }
  }
  useBoard.temporal.getState().clear();
  await collectGarbage();
}

export function App() {
  const chars = useBoard((s) => s.data.characters);
  const { canUndo, canRedo } = useUndoRedo(useBoard);
  const save = useSaveState();
  useSyncExternalStore(subscribeBitmaps, getBitmapVersion, getBitmapVersion);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [query, setQuery] = useState('');
  const [visibleOnly, setVisibleOnly] = useState(false);
  const [compact, setCompact] = useState(false);
  const [sortDir, setSortDir] = useState<SortDirection>('desc');
  const [pending, setPending] = useState<Pending | null>(null);
  const [progress, setProgress] = useState<{ i: number; n: number } | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [freeze, setFreeze] = useState<Freeze | null>(null);
  const [dragLine, setDragLine] = useState<LineKind | null>(null);

  const vp = useRef<PanZoomViewportHandle>(null);
  const listBox = useRef<HTMLDivElement>(null);
  const toastRef = useRef<Toast | null>(null);
  const latest = useRef({ selectedId, pending, busy: false });
  latest.current = { selectedId, pending, busy: !!progress };

  const toast: Toast = (o) => toastRef.current?.(o);

  const selected = chars.find((c) => c.id === selectedId) ?? null;
  /* 復原、刪除後選取的角色不在了：取消選取 */
  useEffect(() => {
    if (selectedId && !chars.some((c) => c.id === selectedId)) setSelectedId(null);
  }, [chars, selectedId]);

  /* ---------- 盤面的範圍與內容 ---------- */

  const range = useMemo(() => boardRange(chars), [chars]);
  const world: Box = freeze?.world ?? {
    x: 0,
    y: -range.top,
    width: range.width,
    height: range.top - range.bottom,
  };
  const rulerTop = -world.y;
  const items: BoardItem[] = useMemo(
    () =>
      chars
        .filter((c) => c.visible)
        .map((c) => ({ c, box: freeze?.id === c.id ? freeze.box : geometry(c).box })),
    [chars, freeze],
  );
  const selectedItem = items.find((it) => it.c.id === selectedId) ?? null;

  /* ---------- 選取與捲動 ---------- */

  const scrollListTo = (id: string) => {
    const box = listBox.current;
    const row = box
      ?.querySelector(`[data-layer-row="${CSS.escape(id)}"]`)
      ?.closest('li') as HTMLElement | null;
    if (!box || !row) return;
    const b = box.getBoundingClientRect();
    const r = row.getBoundingClientRect();
    if (r.top < b.top) box.scrollTop += r.top - b.top - 4;
    else if (r.bottom > b.bottom) box.scrollTop += r.bottom - b.bottom + 4;
  };

  /* 捲動要等這次的變更畫好（盤面範圍、清單列都更新了）再做 */
  const pendingScroll = useRef<{ id: string; list: boolean; view: boolean } | null>(null);
  const [scrollTick, setScrollTick] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scrollTick 只是觸發
  useLayoutEffect(() => {
    const p = pendingScroll.current;
    if (!p) return;
    pendingScroll.current = null;
    if (p.list) scrollListTo(p.id);
    if (!p.view) return;
    /*
     * 盤面範圍改變後，捲軸出現或消失會改變可視大小與倍率（ResizeObserver 在下一個畫格才量到），
     * 等兩個畫格、版面穩定後再依當時的範圍捲動，結果才一致。
     */
    /* 不在下一次變更時取消：連續的捲動（例如加入後馬上點選另一位）依序執行，結果與時序無關 */
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const c = board().find((x) => x.id === p.id);
        if (c?.visible) vp.current?.scrollToWorld(geometry(c).box);
      });
    });
  }, [scrollTick]);

  const select = (
    id: string | null,
    { list = false, view = false }: { list?: boolean; view?: boolean } = {},
  ) => {
    setSelectedId(id);
    if (!id || (!list && !view)) return;
    pendingScroll.current = { id, list, view };
    setScrollTick((n) => n + 1);
  };

  /* ---------- 加入（F01～F08） ---------- */

  const openAdd = (files: readonly File[], dropX: number | null) => {
    if (latest.current.pending || latest.current.busy) return;
    const images = files.filter((f) => f.type.startsWith('image/'));
    if (!images.length) return;
    setPending({ files: images, dropX });
  };

  const pickAndAdd = async () => {
    const files = await pickFiles({ accept: 'image/*', multiple: true });
    openAdd(files, null);
  };

  const commitAdd = async (entries: AddEntry[], dropX: number | null, batch: boolean) => {
    setPending(null);
    if (!entries.length) return;
    const ready: { entry: AddEntry; imageId: string; crop: Character['crop'] }[] = [];
    const failed: string[] = [];
    let lost: Parameters<typeof disableAutosave>[0] | null = null;
    for (let i = 0; i < entries.length; i++) {
      if (batch) setProgress({ i: i + 1, n: entries.length });
      const entry = entries[i];
      try {
        const p = await prepareImage(entry.file);
        if (!p.persisted) lost ??= p.reason ?? 'unavailable';
        ready.push({ entry, imageId: p.imageId, crop: p.crop });
      } catch {
        failed.push(entry.file.name);
      }
    }
    setProgress(null);
    if (lost) disableAutosave(lost);
    setMessage(failed.length ? { tone: 'danger', text: S.readFailed(failed) } : null);
    if (!ready.length) return;
    const made: Character[] = ready.map(({ entry, imageId, crop }) => ({
      id: newId(),
      name: resolveName(entry.name, nameFromFile(entry.file.name)),
      height: entry.height,
      x: 0,
      top: 0,
      bottom: 100,
      visible: true,
      imageId,
      crop,
    }));
    const widths = made.map((c) => geometry(c).width);
    const xs = dropX === null ? placeInRow(nextX(board()), widths) : placeDropped(dropX, widths);
    made.forEach((c, i) => {
      c.x = xs[i];
    });
    useBoard.endGesture();
    setCharacters([...board(), ...made]);
    setQuery('');
    select(made[made.length - 1].id, { list: true, view: true });
  };

  /* ---------- 盤面的操作（F14～F21） ---------- */

  const lineAt = (p: ViewportPointer) => {
    if (!selectedItem) return null;
    const v = vp.current?.getView();
    return v ? hitLine(lineHandles(v, selectedItem), p.x, p.y) : null;
  };

  const onPointerDown = (p: ViewportPointer): ViewportDrag | undefined => {
    const line = lineAt(p);
    if (line && selectedItem) {
      const { c, box } = selectedItem;
      const kind = line.kind;
      const start = kind === 'top' ? c.top : c.bottom;
      setFreeze({ id: c.id, box, world });
      setDragLine(kind);
      setHoverId(null);
      let began = false;
      const end = () => {
        if (began) g.commit();
        setFreeze(null);
        setDragLine(null);
      };
      return {
        cursor: 'ns-resize',
        onMove: (q) => {
          if (!began) {
            useBoard.beginGesture();
            began = true;
          }
          const pct = start + ((q.wy - p.wy) / box.height) * 100;
          editCharacter(c.id, (d) => {
            if (kind === 'top') d.top = clampTopLine(pct, d.bottom);
            else d.bottom = clampBottomLine(pct, d.top);
          });
        },
        onEnd: end,
        onCancel: end,
      };
    }
    const hit = hitTest(items, p.wx, p.wy);
    if (!hit) return undefined;
    select(hit.c.id, { list: true });
    setHoverId(null);
    const startX = hit.c.x;
    let began = false;
    const end = () => {
      if (began) g.commit();
    };
    return {
      cursor: 'move',
      onMove: (q) => {
        const x = Math.max(0, startX + q.wx - p.wx);
        if (!began) {
          if (x === startX) return;
          useBoard.beginGesture();
          began = true;
        }
        editCharacter(hit.c.id, (d) => {
          d.x = x;
        });
      },
      onEnd: end,
      onCancel: end,
    };
  };

  /* ---------- 鍵盤：方向鍵（F45）、Esc（F46） ---------- */

  const nudge = useRef({ t: 0, id: '', data: null as BoardData | null });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      if (latest.current.pending || inOverlay(e.target)) return;
      const id = latest.current.selectedId;
      if (e.key === 'Escape') {
        if (!id || isEditableTarget(e.target)) return;
        e.preventDefault();
        setSelectedId(null);
        return;
      }
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if (!id || e.ctrlKey || e.metaKey || e.altKey || isFormControlTarget(e.target)) return;
      const v = vp.current?.getView();
      if (!v) return;
      e.preventDefault();
      const dx = ((e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 10 : 1)) / v.scale;
      const now = performance.now();
      const before = useBoard.getState().data;
      const last = nudge.current;
      /* 兩次間隔 0.8 秒內、中間沒有別的變更：併進同一步復原 */
      const chain = last.data === before && last.id === id && now - last.t <= NUDGE_MERGE_MS;
      const t = useBoard.temporal.getState();
      useBoard.endGesture();
      if (chain) t.pause();
      editCharacter(id, (d) => {
        d.x = Math.max(0, d.x + dx);
      });
      if (chain) t.resume();
      const after = useBoard.getState().data;
      nudge.current =
        chain || after !== before ? { t: now, id, data: after } : { t: 0, id: '', data: null };
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  /* ---------- 工具列（F22～F25） ---------- */

  const fitWidth = () => {
    if (!board().some((c) => c.visible)) vp.current?.zoomTo(1);
    else vp.current?.fitWidth({ max: 1 });
  };

  const applyLayout = (next: Character[]) => {
    const cur = board();
    if (next.length === cur.length && next.every((c, i) => c === cur[i])) return;
    useBoard.endGesture();
    setCharacters(next);
  };

  const sortByHeight = () => {
    applyLayout(arrangeByHeight(board(), sortDir));
    setSortDir(sortDir === 'desc' ? 'asc' : 'desc');
  };

  /* ---------- 選取的角色（F27～F35） ---------- */

  const duplicate = () => {
    const c = selected;
    if (!c) return;
    const copy = duplicateOf(c, newId(), S.copySuffix);
    useBoard.endGesture();
    setCharacters([...board(), copy]);
    select(copy.id, { list: true, view: true });
  };

  const remove = () => {
    if (!selected) return;
    useBoard.endGesture();
    setCharacters(board().filter((c) => c.id !== selected.id));
    setSelectedId(null);
  };

  const reorder = (move: OrderMove) => {
    if (!selected) return;
    applyLayout(moveOrder(board(), selected.id, move));
    select(selected.id, { list: true });
  };

  const replaceImage = async () => {
    const id = selected?.id;
    if (!id || replacing) return;
    const [file] = await pickFiles({ accept: 'image/*' });
    if (!file) return;
    setReplacing(true);
    try {
      if (!file.type.startsWith('image/')) throw new Error('not image');
      const p = await prepareImage(file);
      if (!p.persisted) disableAutosave(p.reason);
      useBoard.endGesture();
      editCharacter(id, (d) => {
        d.imageId = p.imageId;
        d.crop = p.crop;
      });
      setMessage(null);
    } catch {
      setMessage({ tone: 'danger', text: S.replaceFailed });
    } finally {
      setReplacing(false);
    }
  };

  /* ---------- 全部刪除（F47）、專案檔（F49、F50） ---------- */

  const deleteAll = () => {
    if (!board().length) return;
    useBoard.endGesture();
    setCharacters([]);
    setSelectedId(null);
  };

  const loadProject = async (
    data: BoardData,
    project: ProjectFile<BoardData>,
    files: Map<string, Uint8Array>,
  ) => {
    if (project.version > PROJECT_VERSION) throw new ProjectFileError(S.projectNewer);
    const clean = sanitizeBoard(data);
    if (!clean) throw new ProjectFileError(S.projectInvalid);
    const imported = await importAssetFiles(assets, files);
    for (const id of imported.ids) markSessionAsset(id);
    const crops = new Map<string, Character['crop']>();
    for (const id of new Set(clean.characters.map((c) => c.imageId))) {
      if (!(await assets.get(id))) throw new ProjectFileError(S.projectMissingImage);
      const bmp = await assets.bitmap(id).catch(() => undefined);
      if (!bmp) throw new ProjectFileError(S.projectBadImage);
      crops.set(id, cropOf(bmp));
    }
    if (imported.notPersisted) disableAutosave(imported.reason ?? 'unavailable');
    const next: BoardData = {
      characters: clean.characters.map((c) => ({ ...c, crop: crops.get(c.imageId) ?? c.crop })),
    };
    useBoard.endGesture();
    useBoard.getState().replace(next);
    useBoard.temporal.getState().clear();
    setSelectedId(null);
    setZoom(1);
    requestAnimationFrame(() => vp.current?.scrollTo(0, 0));
    flushAutosave();
    void collectGarbage();
    return true;
  };

  const onProjectNotice = (n: ProjectNotice) => {
    if (n.kind === 'saved')
      toast({ title: '已存成專案檔', description: n.fileName, tone: 'success' });
    else if (n.kind === 'opened')
      toast({ title: S.projectOpened, description: n.fileName, tone: 'success' });
    else if (n.kind === 'open-failed')
      toast({ title: '無法開啟專案檔', description: n.message, tone: 'danger' });
    else toast({ title: S.deletedAll });
  };

  /* ---------- 匯出（F51） ---------- */

  const exportPng = async () => {
    if (exporting) return;
    const list = board();
    if (!list.length) {
      toast({ title: S.noCharacters, tone: 'warning' });
      return;
    }
    const layout = exportLayout(list);
    if (!layout) {
      toast({ title: S.exportAllHidden, tone: 'warning' });
      return;
    }
    setExporting(true);
    try {
      const images = new Map<string, ImageBitmap>();
      for (const c of list) {
        if (!c.visible || images.has(c.imageId)) continue;
        const bmp = await assets.bitmap(c.imageId);
        if (!bmp) throw new Error('missing image');
        images.set(c.imageId, bmp);
      }
      /* 刻度數字用介面字型（頁面通常已經載入；還沒有時才等） */
      const ready = (w: number) =>
        typeof document === 'undefined' ||
        !document.fonts ||
        document.fonts.check(`${w} 16px "Noto Sans TC"`, '0123456789');
      if (!ready(400) || !ready(700))
        await ensureFonts([
          { family: 'Noto Sans TC', weight: 400, text: '0123456789' },
          { family: 'Noto Sans TC', weight: 700, text: '0123456789' },
        ]).catch(() => undefined);
      const canvas = renderExport(list, layout, (id) => images.get(id));
      const blob = await canvasToBlob(canvas, 'image/png');
      canvas.width = 0;
      canvas.height = 0;
      downloadBlob(blob, exportFileName(new Date()));
    } catch (e) {
      toast({
        title: S.exportFailed,
        description: e instanceof Error ? e.message : undefined,
        tone: 'danger',
      });
    } finally {
      setExporting(false);
    }
  };

  /* ---------- 開頁還原（F48）與測試用的介面 ---------- */

  useEffect(() => {
    void restoreOnce((n) => setMessage({ tone: 'warning', text: S.restoredMissing(n) }));
  }, []);

  useEffect(() => {
    window.__heightBoard = {
      data: () => useBoard.getState().data,
      geometry: () => board().map((c) => ({ id: c.id, name: c.name, ...geometry(c) })),
      range: () => boardRange(board()),
      exportLayout: () => exportLayout(board()),
      view: () => {
        const v = vp.current?.getView();
        return v
          ? { zoom: v.zoom, scale: v.scale, scrollX: v.scrollX, scrollY: v.scrollY, world: v.world }
          : null;
      },
      selected: () => latest.current.selectedId,
      history: () => {
        const t = useBoard.temporal.getState();
        return { past: t.pastStates.length, future: t.futureStates.length };
      },
      toWorld: (cx: number, cy: number) => {
        const w = vp.current?.clientToWorld(cx, cy);
        return w ? { x: w.x, h: -w.y } : null;
      },
      toScreen: (x: number, h: number) => {
        const v = vp.current?.getView();
        const el = vp.current?.element()?.querySelector('canvas')?.getBoundingClientRect();
        if (!v || !el) return null;
        const p = v.toScreen(x, -h);
        return { x: el.left + p.x, y: el.top + p.y };
      },
      flush: flushAutosave,
    };
  }, []);

  /* 緊密列距切換後讓選取列留在看得見的地方（F43） */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在切換列距時捲動
  useEffect(() => {
    if (selectedId) select(selectedId, { list: true });
  }, [compact]);

  /* ---------- 快捷鍵 ---------- */

  const shortcuts: Shortcut[] = [
    { keys: 'mod+z', label: S.undo, group: S.keysEdit, handler: undo },
    { keys: ['shift+mod+z', 'mod+y'], label: S.redo, group: S.keysEdit, handler: redo },
    { keys: ['arrowleft', 'arrowright'], label: S.keyNudge, group: S.keysCharacter },
    { keys: ['shift+arrowleft', 'shift+arrowright'], label: S.keyNudge10, group: S.keysCharacter },
    { keys: 'escape', label: S.keyDeselect, group: S.keysCharacter },
  ];

  /* ---------- 版面 ---------- */

  const filter = { query, visibleOnly };
  const filtering = isFiltering(filter);
  const rows = listRows(chars, filter);
  const pct = Math.round(zoom * 100);

  const onListFocus = (e: FocusEvent) => {
    if (isSpinbutton(e.target)) useBoard.beginGesture();
  };
  const onListBlur = (e: FocusEvent) => {
    if (isSpinbutton(e.target)) g.commit();
  };

  const panel = selected ? (
    <div key={selected.id} className="flex flex-col gap-3" data-testid="character-panel">
      <Field label={S.name}>
        <TextInput
          value={selected.name}
          autoComplete="off"
          onFocus={g.begin}
          onBlur={g.commit}
          onChange={(e) => {
            const name = e.target.value;
            editCharacter(selected.id, (d) => {
              d.name = name;
            });
          }}
        />
      </Field>
      <Field label={S.height}>
        <FocusGesture>
          <NumberInput
            value={selected.height}
            min={HEIGHT.min}
            max={HEIGHT.max}
            step={HEIGHT.step}
            unit="cm"
            onChange={(v) =>
              editCharacter(selected.id, (d) => {
                d.height = v;
              })
            }
          />
        </FocusGesture>
      </Field>
      <Field label={S.headLine} labelSuffix={formatPercent(selected.top)} hint={S.headLineHint}>
        <FocusGesture>
          <Slider
            value={selected.top}
            min={TOP_SLIDER.min}
            max={TOP_SLIDER.max}
            step={TOP_SLIDER.step}
            showInput={false}
            unit="%"
            onChange={g.live((v: number) =>
              editCharacter(selected.id, (d) => {
                d.top = clampTopLine(v, d.bottom);
              }),
            )}
          />
        </FocusGesture>
      </Field>
      <Field label={S.footLine} labelSuffix={formatPercent(selected.bottom)} hint={S.footLineHint}>
        <FocusGesture>
          <Slider
            value={selected.bottom}
            min={BOTTOM_SLIDER.min}
            max={BOTTOM_SLIDER.max}
            step={BOTTOM_SLIDER.step}
            showInput={false}
            unit="%"
            onChange={g.live((v: number) =>
              editCharacter(selected.id, (d) => {
                d.bottom = clampBottomLine(v, d.top);
              }),
            )}
          />
        </FocusGesture>
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          icon={<MoveVertical />}
          onClick={() => {
            useBoard.endGesture();
            editCharacter(selected.id, (d) => {
              d.top = 0;
              d.bottom = 100;
            });
          }}
        >
          {S.resetLines}
        </Button>
        <span className="text-xs text-muted">{S.lineHintBoard}</span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button size="sm" icon={<Copy />} onClick={duplicate}>
          {S.duplicate}
        </Button>
        <Button
          size="sm"
          icon={<ImageUp />}
          loading={replacing}
          onClick={() => void replaceImage()}
        >
          {replacing ? S.busy : S.replaceImage}
        </Button>
        <Button size="sm" variant="danger" icon={<Trash2 />} onClick={remove}>
          {S.deleteOne}
        </Button>
      </div>
      <Field label={S.order}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button size="sm" icon={<ArrowDownToLine />} onClick={() => reorder('back')}>
            {S.toBack}
          </Button>
          <Button size="sm" icon={<ArrowDown />} onClick={() => reorder('backward')}>
            {S.backward}
          </Button>
          <Button size="sm" icon={<ArrowUp />} onClick={() => reorder('forward')}>
            {S.forward}
          </Button>
          <Button size="sm" icon={<ArrowUpToLine />} onClick={() => reorder('front')}>
            {S.toFront}
          </Button>
        </div>
      </Field>
      {!selected.visible ? <p className="m-0 text-xs text-warning">{S.hiddenNote}</p> : null}
    </div>
  ) : (
    <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-sm text-fg" data-testid="board-help">
      {S.help.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );

  const settings = (
    <>
      <Section title={selected ? S.selectedTitle : S.helpTitle} fixed>
        {panel}
      </Section>
      <Section
        title={filtering ? S.listLocked : S.listTitle}
        fixed
        actions={
          <span className="text-xs text-muted tabular-nums" data-testid="list-count">
            {filtering ? S.listFiltered(rows.length, chars.length) : S.listCount(chars.length)}
          </span>
        }
      >
        <div className="flex items-center gap-1">
          <div className="relative flex min-w-0 flex-1 items-center">
            <Search aria-hidden className="pointer-events-none absolute left-2 size-4 text-muted" />
            <TextInput
              aria-label={S.searchLabel}
              placeholder={S.search}
              value={query}
              autoComplete="off"
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Escape' || e.nativeEvent.isComposing) return;
                e.preventDefault();
                if (query) setQuery('');
                else e.currentTarget.blur();
              }}
              className="w-full pr-8 pl-8"
            />
            {query ? (
              <IconButton
                size="sm"
                variant="ghost"
                label={S.clearSearch}
                icon={<X />}
                className="absolute right-0.5"
                onClick={() => setQuery('')}
              />
            ) : null}
          </div>
          <IconButton
            label={S.visibleOnly}
            icon={<Eye />}
            pressed={visibleOnly}
            onClick={() => setVisibleOnly(!visibleOnly)}
          />
          <IconButton
            label={S.compact}
            icon={<Rows3 />}
            pressed={compact}
            onClick={() => setCompact(!compact)}
          />
        </div>
        <div
          ref={listBox}
          className="max-h-[min(52dvh,520px)] overflow-y-auto"
          onFocusCapture={onListFocus}
          onBlurCapture={onListBlur}
        >
          <LayerList
            aria-label={S.listLabel}
            items={rows.map((c) => ({
              id: c.id,
              name: c.name,
              thumbnail: thumbnailOf(c.imageId, c.crop),
              visible: c.visible,
              value: c.height,
            }))}
            selectedId={selectedId}
            onSelect={(id) => select(id, { view: true })}
            onMove={(from, to) => setCharacters(moveListRow(board(), from, to))}
            onMoveStart={() => useBoard.beginGesture()}
            onMoveEnd={() => useBoard.endGesture()}
            sortDisabled={filtering}
            onVisibleChange={(id, visible) => {
              useBoard.endGesture();
              editCharacter(id, (d) => {
                d.visible = visible;
              });
            }}
            number={{
              label: S.listHeight,
              unit: 'cm',
              min: HEIGHT.min,
              max: HEIGHT.max,
              step: HEIGHT.step,
              onChange: (id, v) => {
                useBoard.beginGesture();
                editCharacter(id, (d) => {
                  d.height = v;
                });
              },
              onCommit: () => g.commit(),
            }}
            compact={compact}
            thumbSize={THUMB_SIZE}
            empty={chars.length ? S.listNoMatch : S.listEmpty}
          />
        </div>
      </Section>
      <UsageSection persistKey={TOOL_ID}>
        <Usage />
      </UsageSection>
    </>
  );

  const status: Message | null = progress
    ? { tone: 'progress', text: S.adding(progress.i, progress.n) }
    : message;

  const preview = (
    <div className="flex flex-col gap-2">
      <UiBridge api={toastRef} />
      <div
        role="toolbar"
        aria-label={S.toolbarLabel}
        className="flex flex-wrap items-center gap-1.5"
      >
        <Button
          variant="primary"
          size="sm"
          icon={<ImagePlus />}
          title={S.addImagesHint}
          disabled={!!pending || !!progress}
          onClick={() => void pickAndAdd()}
        >
          {S.addImages}
        </Button>
        <IconButton label={S.undo} icon={<Undo2 />} onClick={undo} disabled={!canUndo} />
        <IconButton label={S.redo} icon={<Redo2 />} onClick={redo} disabled={!canRedo} />
        <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
        <IconButton
          label={S.zoomOut}
          icon={<Minus />}
          onClick={() => vp.current?.zoomBy(1 / ZOOM.button)}
        />
        <button
          type="button"
          className="h-8 min-w-13 rounded-md px-1 text-xs text-muted tabular-nums hover:bg-surface-2 hover:text-fg"
          aria-label={S.zoomLabel(pct)}
          data-testid="zoom"
          onClick={() => vp.current?.zoomTo(1)}
        >
          {pct}%
        </button>
        <IconButton
          label={S.zoomIn}
          icon={<Plus />}
          onClick={() => vp.current?.zoomBy(ZOOM.button)}
        />
        <Button size="sm" variant="ghost" icon={<Maximize2 />} onClick={fitWidth}>
          {S.fitWidth}
        </Button>
        <span aria-hidden className="mx-0.5 h-5 w-px bg-border" />
        <Button
          size="sm"
          variant="ghost"
          icon={<AlignHorizontalSpaceAround />}
          onClick={() => applyLayout(arrangeEvenly(board()))}
        >
          {S.arrangeEvenly}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={sortDir === 'desc' ? <ArrowDownWideNarrow /> : <ArrowUpNarrowWide />}
          onClick={sortByHeight}
          data-testid="sort-height"
        >
          {sortDir === 'desc' ? S.sortDesc : S.sortAsc}
        </Button>
        <Button
          size="sm"
          icon={<Download />}
          loading={exporting}
          className="ml-auto"
          onClick={() => void exportPng()}
        >
          {exporting ? S.busy : S.exportPng}
        </Button>
      </div>
      <div className="relative">
        <PanZoomViewport
          ref={vp}
          aria-label={S.boardLabel}
          world={world}
          baseScale="fit-height"
          zoom={zoom}
          onZoomChange={setZoom}
          minZoom={ZOOM.min}
          maxZoom={ZOOM.max}
          wheelStep={ZOOM.wheelPer100}
          padding={BOARD_PADDING}
          align={{ x: 'start', y: 'end' }}
          extend="x"
          gutter={{ width: GUTTER_PX, draw: (ctx, v) => drawRulerGutter(ctx, v, rulerTop) }}
          draw={(ctx, v) =>
            drawBoard(ctx, v, {
              items,
              top: rulerTop,
              selectedId,
              hoverId,
              dragLine,
              image: requestBitmap,
            })
          }
          onPointerDown={onPointerDown}
          onEmptyClick={() => setSelectedId(null)}
          onHover={(p) => {
            const id = p ? (hitTest(items, p.wx, p.wy)?.c.id ?? null) : null;
            setHoverId((prev) => (prev === id ? prev : id));
          }}
          getCursor={(p) =>
            lineAt(p) ? 'ns-resize' : hitTest(items, p.wx, p.wy) ? 'move' : undefined
          }
          getTooltip={(p) => {
            const hit = hitTest(items, p.wx, p.wy);
            return hit ? S.tooltip(hit.c.name, formatHeight(hit.c.height)) : null;
          }}
          className="h-[min(64dvh,760px)] lg:h-[min(calc(100dvh-13rem),860px)]"
        />
        {!chars.length ? (
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 pl-16"
            data-testid="board-empty"
          >
            <div className="flex max-w-sm flex-col items-center gap-1 rounded-lg border border-border bg-surface px-5 py-4 text-center shadow-1">
              <ImagePlus aria-hidden className="mb-1 size-7 text-accent" />
              <p className="m-0 text-base font-semibold text-fg">{S.emptyTitle}</p>
              <p className="m-0 text-sm text-muted">{S.emptyAlt}</p>
              <p className="m-0 text-sm text-muted">{S.emptyHint}</p>
              <p className="m-0 mt-2 text-xs text-muted">{S.emptyPrivacy}</p>
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5" data-testid="status">
        {save.failure ? (
          <Notice tone="warning">
            <span data-testid="save-status">
              {save.failure === 'quota' ? S.saveQuota : S.saveUnavailable}
            </span>
          </Notice>
        ) : null}
        {status ? (
          <Notice tone={status.tone}>
            <span data-testid="status-text">{status.text}</span>
          </Notice>
        ) : null}
      </div>
    </div>
  );

  const headerActions = (
    <ProjectMenu<BoardData>
      toolId={TOOL_ID}
      version={PROJECT_VERSION}
      getData={() => useBoard.getState().data}
      getFiles={() => assets.exportFiles(board().map((c) => c.imageId))}
      fileNameFor={fileStamp}
      beforeSave={() => (board().length ? null : S.noCharacters)}
      confirmOpen={() =>
        board().length
          ? {
              title: S.openConfirmTitle,
              description: S.openConfirmDescription,
              confirmLabel: S.openConfirmLabel,
              danger: true,
            }
          : null
      }
      onLoad={loadProject}
      onReset={deleteAll}
      resetDisabled={!chars.length}
      resetText={{
        label: S.deleteAll,
        title: S.deleteAllTitle,
        description: S.deleteAllDescription,
        confirmLabel: S.deleteAllConfirm,
      }}
      onNotify={onProjectNotice}
      savedAt={save.savedAt}
      statusText={
        save.failure
          ? S.autosaveOff
          : save.savedAt
            ? S.autosaveAt(clockTime(save.savedAt))
            : S.autosaveOn
      }
    />
  );

  return (
    <>
      <ToolShell
        toolId={TOOL_ID}
        usage={<Usage />}
        shortcuts={shortcuts}
        headerActions={headerActions}
        settings={settings}
        preview={preview}
      />
      <WindowDrop
        accept="image/*"
        disabled={!!pending}
        label={S.dropLabel}
        hint={S.dropHint}
        onDrop={(files, at) =>
          openAdd(files, vp.current?.clientToWorld(at.clientX, at.clientY)?.x ?? null)
        }
      />
      {pending && pending.files.length === 1 ? (
        <SingleAddDialog
          file={pending.files[0]}
          onCancel={() => setPending(null)}
          onConfirm={(entry) => void commitAdd([entry], pending.dropX, false)}
        />
      ) : null}
      {pending && pending.files.length > 1 ? (
        <BatchAddDialog
          files={pending.files}
          onCancel={() => setPending(null)}
          onConfirm={(entries) => void commitAdd(entries, pending.dropX, true)}
        />
      ) : null}
    </>
  );
}
