import {
  AlignHorizontalSpaceAround,
  ArrowDown,
  ArrowDownToLine,
  ArrowDownWideNarrow,
  ArrowUp,
  ArrowUpNarrowWide,
  ArrowUpToLine,
  ChevronDown,
  Compass,
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
  Save,
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
import { downloadBlob, downloadBytes, pickFiles, readAsBytes } from '@/core/files';
import { ensureFonts } from '@/core/fonts';
import { canvasToBlob } from '@/core/image';
import { type Box, hitTest } from '@/core/layout';
import {
  historyGesture,
  type ProjectFile,
  ProjectFileError,
  parseProjectBytes,
  serializeProjectZip,
  useUndoRedo,
} from '@/core/storage';
import {
  Button,
  COARSE_POINTER,
  type ConfirmOptions,
  cn,
  DialogClose,
  Field,
  GuidedTour,
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
  type TourRect,
  type TourStep,
  UsageSection,
  useConfirm,
  useMediaQuery,
  useToast,
  type ViewportDrag,
  type ViewportPointer,
  WindowDrop,
} from '@/ui';
import { type AddEntry, BatchAddDialog, SingleAddDialog } from './AddDialogs';
import { HBOARD_EXT, HboardError, isHboard, parseHboard } from './hboard';
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
  isImageFile,
  isSlowRender,
  LINE_LIMIT,
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
  sliderValue,
  sortDropped,
  TOP_SLIDER,
  UNTITLED,
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
import { markTourSeen, type Practice, practiceBoard, tourSeen } from './tour';

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

/** 清單長按多久開始排序（觸控；原作 400 ms） */
const LIST_LONG_PRESS_MS = 400;

/**
 * 面板的版面（原作 2026-10 更新）：
 * - phone：窄畫面（寬 < 768，或寬 < 1024 且高 < 500 的橫向手機）：盤面在上，下面「角色清單／角色設定」分頁，可以收合
 * - tablet：寬 768～1023（高 ≥ 500）：盤面在上，下面清單與設定左右並排，可以一起收合
 * - wide：寬 ≥ 1024：左邊設定欄（可以拖曳調整寬度、「選取的角色」可以收合）、右邊盤面
 */
const PHONE_QUERY = '(max-width: 767px), (max-width: 1023px) and (max-height: 499px)';
const TABLET_QUERY = '(min-width: 768px) and (max-width: 1023px) and (min-height: 500px)';
const PANEL_COLLAPSED_KEY = 'trpg-toolkit:height-board:panel-collapsed';
/** 「選取的角色」區塊的收合（Section 的 persistKey） */
const DETAIL_PERSIST_KEY = 'height-board:detail';

function readFlag(key: string, fallback: boolean): boolean {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === '1';
  } catch {
    return fallback;
  }
}

function writeFlag(key: string, v: boolean | null) {
  try {
    if (v === null) localStorage.removeItem(key);
    else localStorage.setItem(key, v ? '1' : '0');
  } catch {
    /* 記不住就算了 */
  }
}

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

/** ToolShell 裡面才拿得到通知與確認對話框：交給 App 的按鈕與非同步處理使用 */
type Toast = ReturnType<typeof useToast>;
type Confirm = ReturnType<typeof useConfirm>;
function UiBridge({
  api,
  confirmApi,
}: {
  api: RefObject<Toast | null>;
  confirmApi: RefObject<Confirm | null>;
}) {
  const toast = useToast();
  const confirm = useConfirm();
  useLayoutEffect(() => {
    api.current = toast;
    confirmApi.current = confirm;
  }, [api, toast, confirmApi, confirm]);
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

/**
 * 使用說明（說明對話框與「使用方式」區塊共用；原作 2026-10 更新的說明選單：立繪的準備、儲存方式、隱私、手機與平板）。
 * inDialog：在說明對話框裡，「看操作導覽」先關掉對話框再開始。
 */
function Usage({ onTour, inDialog }: { onTour: () => void; inDialog?: boolean }) {
  const list = (items: readonly string[]) => (
    <ul>
      {items.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
  return (
    <>
      <div className="mb-2">
        {inDialog ? (
          <DialogClose size="sm" icon={<Compass />} onClick={onTour}>
            {S.tourOpen}
          </DialogClose>
        ) : (
          <Button size="sm" icon={<Compass />} onClick={onTour}>
            {S.tourOpen}
          </Button>
        )}
      </div>
      <p>{S.usageIntro}</p>
      <ol className="mt-2">
        {S.usageSteps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      {S.usageSections.map((sec) => (
        <div key={sec.title}>
          <p className="mt-3 mb-1 font-semibold">{sec.title}</p>
          {list(sec.items)}
        </div>
      ))}
      <p className="mt-3 mb-1 font-semibold">{S.usageNotesTitle}</p>
      {list(S.usageNotes)}
    </>
  );
}

/** 說明對話框關上之後（沒有開著的對話框）再呼叫 fn：導覽要在對話框的焦點鎖解除後才開（最多等 1 秒） */
function afterDialogs(fn: () => void) {
  const start = performance.now();
  const tick = () => {
    const open = document.querySelector('[role="dialog"]:not([data-testid="guided-tour"])');
    if (!open || performance.now() - start > 1000) fn();
    else requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

/** 開頁時只做一次：還原（略過圖片不見的角色）、清空復原紀錄、清掉沒人用的圖（呼叫第二次時回傳同一個 Promise） */
let restoring: Promise<void> | null = null;
function restoreOnce(onMissing: (n: number) => void): Promise<void> {
  restoring ??= restoreNow(onMissing);
  return restoring;
}
/** 開頁時自動開始導覽的檢查只做一次 */
let autoTourChecked = false;

async function restoreNow(onMissing: (n: number) => void): Promise<void> {
  const t = useBoard.temporal.getState();
  const current = useBoard.getState().data;
  const clean = sanitizeBoard(current) ?? EMPTY_BOARD;
  if (JSON.stringify(clean) !== JSON.stringify(current)) {
    t.pause();
    useBoard.getState().replace(clean);
    t.resume();
  }
  const ids = [...new Set(clean.characters.map((c) => c.imageId))];
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
  const stored = useBoard((s) => s.data.characters);
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
  const [opening, setOpening] = useState(false);
  /* 操作導覽（原作 2026-10 更新）：練習用盤面顯示在畫面上，盤面的資料（store）不動 */
  const [tour, setTour] = useState<{ step: number; practice: Practice } | null>(null);
  const tourSaved = useRef<{
    zoom: number;
    scrollX: number;
    scrollY: number;
    panelTab: 'list' | 'detail';
    panelOpen: boolean;
    detailOpen: boolean;
  } | null>(null);
  const [saveNoticeHidden, setSaveNoticeHidden] = useState(false);
  const touch = useMediaQuery(COARSE_POINTER);
  const chars = tour ? tour.practice.characters : stored;

  /* 面板的版面（手機分頁、平板並排、桌面兩欄）與收合 */
  const phone = useMediaQuery(PHONE_QUERY);
  const tablet = useMediaQuery(TABLET_QUERY);
  const wide = !phone && !tablet;
  const [panelTab, setPanelTab] = useState<'list' | 'detail'>('list');
  const [panelOpen, setPanelOpenState] = useState(() => !readFlag(PANEL_COLLAPSED_KEY, false));
  const setPanelOpen = (v: boolean) => {
    setPanelOpenState(v);
    writeFlag(PANEL_COLLAPSED_KEY, v ? null : true);
  };
  const [detailOpen, setDetailOpen] = useState(() =>
    readFlag(`trpg-toolkit:section:${DETAIL_PERSIST_KEY}`, true),
  );

  const vp = useRef<PanZoomViewportHandle>(null);
  const listBox = useRef<HTMLDivElement>(null);
  const toastRef = useRef<Toast | null>(null);
  const confirmRef = useRef<Confirm | null>(null);
  /** 清單的選取是點的（或 Enter／空白鍵）：手機上換到「角色設定」分頁；鍵盤 ↑↓ 選取時不換分頁 */
  const listPointer = useRef(false);
  const latest = useRef({ selectedId, pending, busy: false, phone, tour: false });
  latest.current = { selectedId, pending, busy: !!progress || opening, phone, tour: !!tour };
  /** 畫面上的選取（導覽中是練習用盤面的那一位） */
  const activeId = tour ? tour.practice.selectedId : selectedId;

  const toast: Toast = (o) => toastRef.current?.(o);
  const confirm = (o: ConfirmOptions) => confirmRef.current?.(o) ?? Promise.resolve(false);

  const selected = chars.find((c) => c.id === activeId) ?? null;
  /* 復原、刪除後選取的角色不在了：取消選取 */
  useEffect(() => {
    if (selectedId && !stored.some((c) => c.id === selectedId)) setSelectedId(null);
  }, [stored, selectedId]);

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
  const selectedItem = items.find((it) => it.c.id === activeId) ?? null;

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
    {
      list = false,
      view = false,
      detail = false,
    }: { list?: boolean; view?: boolean; detail?: boolean } = {},
  ) => {
    setSelectedId(id);
    /* 手機：在盤面或清單上「選了」角色就換到「角色設定」分頁（加入、眼睛、身高欄不換；原作 2026-10 更新） */
    if (id && detail && latest.current.phone) setPanelTab('detail');
    if (!id || (!list && !view)) return;
    pendingScroll.current = { id, list, view };
    setScrollTick((n) => n + 1);
  };

  /* ---------- 加入（F01～F08） ---------- */

  /** 不能加入的檔案：提示檔名（原作 2026-10 更新；以前靜默略過） */
  const notifyRejected = (rejected: readonly File[]) => {
    if (!rejected.length) return;
    toast({
      title: S.rejected(rejected.map((f) => f.name)),
      description: S.rejectedHint,
      tone: 'warning',
    });
  };

  const openAdd = (files: readonly File[], dropX: number | null) => {
    if (latest.current.pending || latest.current.busy) return;
    const images = files.filter(isImageFile);
    notifyRejected(files.filter((f) => !isImageFile(f)));
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
      const before = board();
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
          /* 盤面上可以拖到圖外（頭頂線到圖的上方、腳底線到圖的下方；原作 2026-10 更新） */
          editCharacter(c.id, (d) => {
            if (kind === 'top') d.top = clampTopLine(pct, d.bottom, LINE_LIMIT.top);
            else d.bottom = clampBottomLine(pct, d.top, LINE_LIMIT.bottom);
          });
        },
        onEnd: end,
        onCancel: (reason) => {
          /* 第二指放上去（捏合）：拖到一半的線放回原位，不記復原步驟（原作 2026-10 更新） */
          if (reason === 'pinch' && began) setCharacters(before);
          end();
        },
      };
    }
    const hit = hitTest(items, p.wx, p.wy);
    if (!hit) return undefined;
    select(hit.c.id, { list: true, detail: true });
    setHoverId(null);
    const startX = hit.c.x;
    const before = board();
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
      onCancel: (reason) => {
        /* 第二指放上去（捏合）：拖到一半的角色放回原位，不記復原步驟（原作 2026-10 更新） */
        if (reason === 'pinch' && began) setCharacters(before);
        end();
      },
    };
  };

  /* ---------- 鍵盤：方向鍵（F45）、Esc（F46） ---------- */

  const nudge = useRef({ t: 0, id: '', data: null as BoardData | null });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      if (latest.current.pending || latest.current.tour || inOverlay(e.target)) return;
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

  /**
   * 通知上的「復原」（刪除之後；原作 2026-10 更新：觸控螢幕沒有 Ctrl＋Z）。之後又有別的變更時不復原，
   * 改提示用工具列的「復原」（不會退掉別的操作）。
   */
  const undoAction = () => {
    const after = useBoard.getState().data;
    return {
      label: S.undoDelete,
      altText: S.undoAlt,
      onClick: () => {
        if (useBoard.getState().data === after) undo();
        else toast({ title: S.undoStale, tone: 'warning' });
      },
    };
  };

  const remove = () => {
    if (!selected) return;
    useBoard.endGesture();
    setCharacters(board().filter((c) => c.id !== selected.id));
    setSelectedId(null);
    toast({ title: S.deleted(selected.name), duration: 6000, action: undoAction() });
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

  /** 整個盤面換成讀進來的內容：沒有選取、倍率 100%、復原紀錄清空、立即自動保存 */
  const replaceBoard = (next: BoardData) => {
    useBoard.endGesture();
    useBoard.getState().replace(next);
    useBoard.temporal.getState().clear();
    setSelectedId(null);
    setZoom(1);
    requestAnimationFrame(() => vp.current?.scrollTo(0, 0));
    flushAutosave();
    void collectGarbage();
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
    const crops = new Map<string, Character['crop']>();
    for (const id of new Set(clean.characters.map((c) => c.imageId))) {
      if (!(await assets.get(id))) throw new ProjectFileError(S.projectMissingImage);
      const bmp = await assets.bitmap(id).catch(() => undefined);
      if (!bmp) throw new ProjectFileError(S.projectBadImage);
      crops.set(id, cropOf(bmp));
    }
    if (imported.notPersisted) disableAutosave(imported.reason ?? 'unavailable');
    replaceBoard({
      characters: clean.characters.map((c) => ({ ...c, crop: crops.get(c.imageId) ?? c.crop })),
    });
    return true;
  };

  /** 原作的 .hboard（只讀；原作 2026-10 更新後存的也能讀）：換成本站的角色資料 */
  const loadHboard = async (bytes: Uint8Array) => {
    let parsed: ReturnType<typeof parseHboard>;
    try {
      parsed = parseHboard(bytes);
    } catch (e) {
      if (e instanceof HboardError)
        throw new ProjectFileError(
          e.problem === 'version' ? S.hboardVersion(String(e.version)) : S.hboardBroken,
        );
      throw e;
    }
    const made: Character[] = [];
    let lost: Parameters<typeof disableAutosave>[0] | null = null;
    for (const c of parsed) {
      let img: Awaited<ReturnType<typeof prepareImage>>;
      try {
        img = await prepareImage(new Blob([c.bytes as Uint8Array<ArrayBuffer>], { type: c.type }));
      } catch {
        throw new ProjectFileError(S.projectBadImage);
      }
      if (!img.persisted) lost ??= img.reason ?? 'unavailable';
      made.push({
        id: newId(),
        name: c.name.trim() ? c.name : UNTITLED,
        height: c.height,
        x: c.x,
        top: c.top,
        bottom: c.bottom,
        visible: c.visible,
        imageId: img.imageId,
        crop: img.crop,
      });
    }
    const clean = sanitizeBoard({ characters: made });
    if (!clean) throw new ProjectFileError(S.hboardBroken);
    if (lost) disableAutosave(lost);
    replaceBoard(clean);
  };

  /** 拖進來的專案檔（本站的 .zip／.json、原作的 .hboard）：確認後取代整個盤面（原作 2026-10 更新） */
  const openBoardFile = async (file: File) => {
    if (latest.current.pending || latest.current.busy) return;
    if (
      board().length &&
      !(await confirm({
        title: S.openConfirmTitle,
        description: S.openConfirmDescription,
        confirmLabel: S.openDroppedConfirmLabel,
        danger: true,
      }))
    )
      return;
    setOpening(true);
    try {
      const bytes = await readAsBytes(file);
      if (isHboard(bytes)) await loadHboard(bytes);
      else {
        const project = parseProjectBytes<BoardData>(bytes, TOOL_ID);
        await loadProject(project.data, project, project.files);
      }
      toast({ title: S.projectOpened, description: file.name, tone: 'success' });
    } catch (e) {
      toast({
        title: S.projectOpenFailed,
        description: e instanceof Error ? e.message : String(e),
        tone: 'danger',
      });
    } finally {
      setOpening(false);
    }
  };

  const onProjectNotice = (n: ProjectNotice) => {
    if (n.kind === 'saved')
      toast({ title: '已存成專案檔', description: n.fileName, tone: 'success' });
    else if (n.kind === 'opened')
      toast({ title: S.projectOpened, description: n.fileName, tone: 'success' });
    else if (n.kind === 'open-failed')
      toast({ title: S.projectOpenFailed, description: n.message, tone: 'danger' });
    else toast({ title: S.deletedAll, duration: 6000, action: undoAction() });
  };

  /** 存成專案檔（自動保存無法使用時的提示上的按鈕；內容同「專案 → 存成專案檔」） */
  const saveProjectNow = async () => {
    if (!board().length) {
      toast({ title: S.noCharacters, tone: 'warning' });
      return;
    }
    try {
      const now = new Date();
      const files = await assets.exportFiles(board().map((c) => c.imageId));
      const name = `${fileStamp(now)}.zip`;
      downloadBytes(
        serializeProjectZip(TOOL_ID, PROJECT_VERSION, useBoard.getState().data, files, now),
        name,
        'application/zip',
      );
      toast({ title: '已存成專案檔', description: name, tone: 'success' });
    } catch (e) {
      toast({
        title: '無法存成專案檔',
        description: e instanceof Error ? e.message : String(e),
        tone: 'danger',
      });
    }
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
      let blob: Blob;
      try {
        const canvas = renderExport(list, layout, (id) => images.get(id));
        blob = await canvasToBlob(canvas, 'image/png');
        canvas.width = 0;
        canvas.height = 0;
      } catch {
        /* 畫布太大（建不起來或輸出失敗）：減少顯示中的角色可能就能匯出（原作 2026-10 更新） */
        throw new Error(S.exportTooBig);
      }
      downloadBlob(blob, exportFileName(new Date()));
      /* PNG 不能再開回盤面：提醒要保留就存成專案檔（原作 2026-10 更新） */
      toast({ title: S.exported, description: S.exportedNote, tone: 'success' });
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

  /* ---------- 操作導覽（原作 2026-10 更新） ---------- */

  const startTour = async () => {
    if (latest.current.tour) return;
    if (latest.current.pending || latest.current.busy) {
      toast({ title: S.tourBusy, tone: 'warning' });
      return;
    }
    let practice: Practice;
    try {
      practice = await practiceBoard();
    } catch (e) {
      toast({
        title: S.tourFailed,
        description: e instanceof Error ? e.message : undefined,
        tone: 'danger',
      });
      return;
    }
    markTourSeen();
    useBoard.endGesture();
    const v = vp.current?.getView();
    tourSaved.current = {
      zoom: v?.zoom ?? 1,
      scrollX: v?.scrollX ?? 0,
      scrollY: v?.scrollY ?? 0,
      panelTab,
      panelOpen,
      detailOpen,
    };
    /* 第 2 步要照亮名稱與身高欄：面板展開、手機換到「角色設定」 */
    setPanelTab('detail');
    setPanelOpenState(true);
    setDetailOpen(true);
    setHoverId(null);
    setZoom(1);
    setTour({ step: 0, practice });
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const b = practice.characters.find((c) => c.id === practice.selectedId);
        vp.current?.scrollTo(0, 0);
        if (b) vp.current?.scrollToWorld(geometry(b).box);
      }),
    );
  };

  const endTour = () => {
    const s = tourSaved.current;
    tourSaved.current = null;
    setTour(null);
    if (!s) return;
    setPanelTab(s.panelTab);
    setPanelOpenState(s.panelOpen);
    setDetailOpen(s.detailOpen);
    setZoom(s.zoom);
    requestAnimationFrame(() =>
      requestAnimationFrame(() => vp.current?.scrollTo(s.scrollX, s.scrollY)),
    );
  };

  /* 開頁還原（F48）；第一次開（這個瀏覽器沒看過、盤面是空的）時自動開始導覽 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在開頁時做一次
  useEffect(() => {
    void restoreOnce((n) => setMessage({ tone: 'warning', text: S.restoredMissing(n) })).then(
      () => {
        if (autoTourChecked) return;
        autoTourChecked = true;
        if (tourSeen()) return;
        /* 以前用過（自動保存還原了角色）：不打擾，記成看過 */
        if (board().length) {
          markTourSeen();
          return;
        }
        /* 記不住「看過了」的環境（例如封鎖了網站資料）每次開頁都會跳出來：不自動開 */
        if (!markTourSeen()) return;
        void startTour();
      },
    );
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
      tourStep: () => (latest.current.tour ? (tourStepRef.current ?? 0) + 1 : 0),
      noticeIfSlow: (ms: number, visible: number) => noticeSlowRef.current(ms, visible),
    };
  }, []);

  /* 重畫變慢的提示（原作 2026-10 更新）：一次重畫 150 ms 以上且顯示中 20 位以上時提示一次 */
  const slowNoticed = useRef(false);
  const noticeSlow = (ms: number, visible: number) => {
    if (slowNoticed.current || !isSlowRender(ms, visible)) return;
    slowNoticed.current = true;
    setTimeout(
      () =>
        toast({
          title: S.slowTitle(visible),
          description: S.slowHint,
          tone: 'info',
          duration: 12000,
        }),
      0,
    );
  };
  const noticeSlowRef = useRef(noticeSlow);
  noticeSlowRef.current = noticeSlow;
  const tourStepRef = useRef<number | null>(null);
  tourStepRef.current = tour?.step ?? null;

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

  const filter = tour ? { query: '', visibleOnly: false } : { query, visibleOnly };
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
      <div className="flex flex-col gap-3" data-tour="fields">
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
      </div>
      <Field label={S.headLine} labelSuffix={formatPercent(selected.top)} hint={S.headLineHint}>
        <FocusGesture>
          <Slider
            value={sliderValue(selected.top, TOP_SLIDER)}
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
            value={sliderValue(selected.bottom, BOTTOM_SLIDER)}
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
      {(touch ? S.helpTouch : S.help).map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );

  const listTitle = filtering ? S.listLocked : S.listTitle;
  const listCountText = filtering
    ? S.listFiltered(rows.length, chars.length)
    : S.listCount(chars.length);

  /** 清單：篩選列＋清單（三種版面共用） */
  const listBody = (
    <div className="flex flex-col gap-3">
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
        onPointerDownCapture={() => {
          listPointer.current = true;
        }}
        onKeyDownCapture={(e) => {
          listPointer.current = e.key === 'Enter' || e.key === ' ';
        }}
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
          selectedId={activeId}
          onSelect={(id) => {
            select(id, { view: true, detail: listPointer.current });
            listPointer.current = false;
          }}
          onMove={(from, to) => setCharacters(moveListRow(board(), from, to))}
          onMoveStart={() => useBoard.beginGesture()}
          onMoveEnd={() => useBoard.endGesture()}
          sortDisabled={filtering}
          longPress={LIST_LONG_PRESS_MS}
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
    </div>
  );

  const detailTitle = selected ? S.selectedTitle : S.helpTitle;
  const collapseButton = (
    <IconButton
      size="sm"
      variant="ghost"
      label={panelOpen ? S.panelCollapse : S.panelExpand}
      icon={
        <ChevronDown className={panelOpen ? undefined : 'rotate-180'} aria-hidden data-icon="" />
      }
      aria-expanded={panelOpen}
      onClick={() => setPanelOpen(!panelOpen)}
      data-testid="panel-toggle"
    />
  );

  const usageSection = (
    <UsageSection persistKey={TOOL_ID}>
      <Usage onTour={() => void startTour()} />
    </UsageSection>
  );

  let settings: ReactNode;
  if (phone) {
    /* 手機：「角色清單／角色設定」分頁＋收合（只留分頁列，盤面變高；記在這個瀏覽器） */
    const tabClass = (on: boolean) =>
      cn(
        '-mb-px inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-2 text-sm font-medium',
        on && panelOpen ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
      );
    const showTab = (t: 'list' | 'detail') => {
      setPanelTab(t);
      if (!panelOpen) setPanelOpen(true);
    };
    settings = (
      <>
        <div className="rounded-lg border border-border bg-surface" data-testid="panel">
          <div className="flex items-center gap-1 border-b border-border pr-1.5 pl-1.5">
            <div role="tablist" aria-label={S.panelTabs} className="flex min-w-0 flex-1 gap-1">
              <button
                type="button"
                role="tab"
                id="hb-tab-list"
                aria-selected={panelTab === 'list'}
                aria-controls="hb-panel-list"
                className={tabClass(panelTab === 'list')}
                onClick={() => showTab('list')}
              >
                {filtering ? S.listTabLocked : S.listTitle}
                <span className="text-xs text-muted tabular-nums" data-testid="list-count">
                  {listCountText}
                </span>
              </button>
              <button
                type="button"
                role="tab"
                id="hb-tab-detail"
                aria-selected={panelTab === 'detail'}
                aria-controls="hb-panel-detail"
                className={tabClass(panelTab === 'detail')}
                onClick={() => showTab('detail')}
              >
                {S.detailTab}
              </button>
            </div>
            {collapseButton}
          </div>
          <div
            role="tabpanel"
            id="hb-panel-list"
            aria-labelledby="hb-tab-list"
            hidden={!panelOpen || panelTab !== 'list'}
            className="p-3"
          >
            {listBody}
          </div>
          <div
            role="tabpanel"
            id="hb-panel-detail"
            aria-labelledby="hb-tab-detail"
            hidden={!panelOpen || panelTab !== 'detail'}
            className="p-3"
          >
            <h3 className="m-0 mb-3 text-sm font-semibold text-fg">{detailTitle}</h3>
            {panel}
          </div>
        </div>
        {usageSection}
      </>
    );
  } else if (tablet) {
    /* 平板：清單與設定左右並排，右上角的按鈕一起收合（只留標題列） */
    settings = (
      <>
        <div className="grid grid-cols-2 items-start gap-3" data-testid="panel">
          <Section
            title={listTitle}
            open={panelOpen}
            onOpenChange={setPanelOpen}
            actions={
              <span className="text-xs text-muted tabular-nums" data-testid="list-count">
                {listCountText}
              </span>
            }
          >
            {listBody}
          </Section>
          <Section
            title={
              !panelOpen && selected ? S.collapsedTitle(detailTitle, selected.name) : detailTitle
            }
            open={panelOpen}
            onOpenChange={setPanelOpen}
            actions={collapseButton}
          >
            {panel}
          </Section>
        </div>
        {usageSection}
      </>
    );
  } else {
    /* 桌面：「選取的角色」可以收合（收合時標題帶出選取的角色名稱；選取不會自動展開）、清單、使用方式 */
    settings = (
      <>
        <Section
          title={
            !detailOpen && selected ? S.collapsedTitle(detailTitle, selected.name) : detailTitle
          }
          open={detailOpen}
          onOpenChange={setDetailOpen}
          persistKey={DETAIL_PERSIST_KEY}
        >
          {panel}
        </Section>
        <Section
          title={listTitle}
          fixed
          actions={
            <span className="text-xs text-muted tabular-nums" data-testid="list-count">
              {listCountText}
            </span>
          }
        >
          {listBody}
        </Section>
        {usageSection}
      </>
    );
  }

  const status: Message | null = progress
    ? { tone: 'progress', text: S.adding(progress.i, progress.n) }
    : message;

  const preview = (
    <div className="flex flex-col gap-2">
      <UiBridge api={toastRef} confirmApi={confirmRef} />
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
          data-tour="add"
        >
          {S.addImages}
        </Button>
        <IconButton label={S.undo} icon={<Undo2 />} onClick={undo} disabled={!canUndo || !!tour} />
        <IconButton label={S.redo} icon={<Redo2 />} onClick={redo} disabled={!canRedo || !!tour} />
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
          data-tour="arrange"
        >
          {S.arrangeEvenly}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          icon={sortDir === 'desc' ? <ArrowDownWideNarrow /> : <ArrowUpNarrowWide />}
          onClick={sortByHeight}
          data-testid="sort-height"
          data-tour="arrange"
        >
          {sortDir === 'desc' ? S.sortDesc : S.sortAsc}
        </Button>
        <Button
          size="sm"
          icon={<Download />}
          loading={exporting}
          className="ml-auto"
          onClick={() => void exportPng()}
          data-tour="export"
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
          gutter={
            /* 手機上空盤面時不顯示刻度欄（數字和空盤面的說明疊在一起；原作 2026-10 更新） */
            phone && !chars.length
              ? undefined
              : { width: GUTTER_PX, draw: (ctx, v) => drawRulerGutter(ctx, v, rulerTop) }
          }
          draw={(ctx, v) => {
            const t0 = performance.now();
            drawBoard(ctx, v, {
              items,
              top: rulerTop,
              selectedId: activeId,
              hoverId,
              dragLine,
              image: requestBitmap,
              lineTargets: tour?.step === 3 ? tour.practice.targets : null,
            });
            if (!tour) noticeSlow(performance.now() - t0, items.length);
          }}
          onPointerDown={onPointerDown}
          pinch
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
          className={
            !wide && !panelOpen
              ? 'h-[max(16rem,calc(100dvh-9rem))]!'
              : 'h-[min(64dvh,760px)] lg:h-[min(calc(100dvh-13rem),860px)]'
          }
        />
        {!chars.length ? (
          <div
            className={cn(
              'pointer-events-none absolute inset-0 flex items-center justify-center p-4',
              !phone && 'pl-16',
            )}
            data-testid="board-empty"
          >
            {/* 空盤面：「加入角色」「看操作導覽」（原作 2026-10 更新）；觸控螢幕沒有拖放，文字依輸入裝置 */}
            <div className="pointer-events-auto flex max-w-sm flex-col items-center gap-1 rounded-lg border border-border bg-surface px-5 py-4 text-center shadow-1">
              <ImagePlus aria-hidden className="mb-1 size-7 text-accent" />
              <p className="m-0 text-base font-semibold text-fg">
                {touch ? S.emptyTitleTouch : S.emptyTitle}
              </p>
              <p className="m-0 text-sm text-muted">{S.emptyHint}</p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  icon={<ImagePlus />}
                  disabled={!!pending || !!progress}
                  onClick={() => void pickAndAdd()}
                >
                  {S.emptyAdd}
                </Button>
                <Button size="sm" icon={<Compass />} onClick={() => void startTour()}>
                  {S.tourOpen}
                </Button>
              </div>
              <p className="m-0 mt-2 text-xs text-muted">{S.emptyPrivacy}</p>
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-1.5" data-testid="status">
        {save.failure && !saveNoticeHidden ? (
          <Notice tone="warning">
            {/* 可以關閉（手機上很佔位置）、旁邊就能存成專案檔；重新整理後還是不能保存時會再出現（原作 2026-10 更新） */}
            <div className="flex flex-wrap items-start gap-2">
              <span data-testid="save-status" className="min-w-0 flex-1">
                {save.failure === 'quota' ? S.saveQuota : S.saveUnavailable}
              </span>
              <span className="flex shrink-0 items-center gap-1">
                <Button size="sm" icon={<Save />} onClick={() => void saveProjectNow()}>
                  {S.saveNow}
                </Button>
                <IconButton
                  size="sm"
                  label={S.closeNotice}
                  icon={<X />}
                  onClick={() => setSaveNoticeHidden(true)}
                />
              </span>
            </div>
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

  /* 導覽的六個步驟（照亮的地方每次定位時才找：版面、捲動都可能變） */
  const q = (sel: string) => [...document.querySelectorAll(sel)];
  /** 第 4 步：選取的角色（圖＋兩條線與標籤），切在盤面看得到的範圍裡 */
  const tourCharRect = (): TourRect | null => {
    const v = vp.current?.getView();
    const root = vp.current?.element();
    const c = root?.querySelector('canvas')?.getBoundingClientRect();
    if (!v || !c || !root || !selectedItem) return null;
    const p = v.toScreen(selectedItem.box.x, selectedItem.box.y);
    const hs = lineHandles(v, selectedItem);
    const left = Math.min(p.x, ...hs.map((h) => h.tag.x));
    const right = Math.max(
      p.x + selectedItem.box.width * v.scale,
      ...hs.map((h) => h.tag.x + h.tag.width),
    );
    const top = Math.min(p.y, ...hs.map((h) => h.tag.y));
    const bottom = Math.max(
      p.y + selectedItem.box.height * v.scale,
      ...hs.map((h) => h.tag.y + h.tag.height),
    );
    const r = root.getBoundingClientRect();
    return {
      left: Math.max(c.left + left, r.left + 8),
      right: Math.min(c.left + right, r.right - 8),
      top: Math.max(c.top + top, r.top + 8),
      bottom: Math.min(c.top + bottom, r.bottom - 8),
    };
  };
  const tourSteps: TourStep[] = [
    {
      title: S.tour1Title,
      body: touch ? S.tour1Touch : S.tour1,
      target: () => q('[data-tour="add"]'),
    },
    { title: S.tour2Title, body: S.tour2, target: () => q('[data-tour="fields"]') },
    {
      title: S.tour3Title,
      body: touch ? S.tour3Touch : S.tour3,
      target: () => q('[data-testid="pan-zoom-viewport"]'),
    },
    { title: S.tour4Title, body: S.tour4, target: tourCharRect },
    { title: S.tour5Title, body: S.tour5, target: () => q('[data-tour="arrange"]') },
    {
      title: S.tour6Title,
      body: S.tour6,
      target: () => [...q('[data-tour="export"]'), ...q('header [aria-haspopup="menu"]')],
    },
  ];

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
      openAccept={`.zip,.json,${HBOARD_EXT},application/zip,application/json`}
      onForeignFile={async (_file, bytes) => {
        /* 原作的 .hboard：讀進來（成功的通知由這裡發；失敗時丟出的錯誤由選單顯示） */
        if (!isHboard(bytes)) return false;
        await loadHboard(bytes);
        toast({ title: S.projectOpened, description: _file.name, tone: 'success' });
        return true;
      }}
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
        usage={<Usage inDialog onTour={() => afterDialogs(() => void startTour())} />}
        shortcuts={tour ? [] : shortcuts}
        headerActions={headerActions}
        settings={settings}
        preview={preview}
        settingsResize={{ persistKey: TOOL_ID }}
      />
      <WindowDrop
        disabled={!!pending || opening || !!tour}
        label={S.dropLabel}
        hint={S.dropHint}
        onDrop={(files, at) => {
          /* 專案檔（.zip、.hboard）＝開啟那個盤面；圖片＝加入；其他的提示檔名（原作 2026-10 更新） */
          const { board: boardFile, images, rejected } = sortDropped(files);
          if (boardFile) {
            void openBoardFile(boardFile);
            return;
          }
          notifyRejected(rejected);
          if (images.length)
            openAdd(images, vp.current?.clientToWorld(at.clientX, at.clientY)?.x ?? null);
        }}
      />
      <GuidedTour
        open={!!tour}
        steps={tourSteps}
        step={tour?.step ?? 0}
        onStepChange={(step) => setTour((t) => (t ? { ...t, step } : t))}
        onClose={endTour}
        labels={{ next: S.tourNext, back: S.tourBack, skip: S.tourSkip, done: S.tourDone }}
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
