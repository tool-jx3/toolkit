/**
 * 工具外框：頁首＋主體（設定面板＋預覽區）＋頁尾（靈感來源）。
 * - ≥ 1024 px：左邊設定、右邊預覽（預覽固定在畫面上，內容太長時自己捲動）。
 * - < 1024 px：上下排列，預覽在上。
 * - 已包好 UiProvider（提示、通知、確認對話框）；傳入 shortcuts 會自動綁定，並可按「?」看說明。
 * - settingsResize（選填）：≥ 1024 px 時兩欄之間有分隔線，拖曳調整設定欄的寬度（按兩下回到預設、方向鍵 16 px、
 *   Shift 64 px、Home／End 到最窄／最寬），寬度記在這個瀏覽器。height-board 跟進原作 2026-10 更新時新增，不給時版面不變。
 */
import {
  type CSSProperties,
  type ReactNode,
  type RefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { getTool, type Inspiration } from '@/registry';
import { Dialog, DialogClose } from './Dialog';
import { InspirationFooter } from './InspirationFooter';
import { ShortcutHelp } from './ShortcutHelp';
import { type Shortcut, useShortcuts } from './shortcuts';
import { ToolHeader } from './ToolHeader';
import { UiProvider } from './UiProvider';

export interface ToolShellProps {
  /** registry 裡的工具 id（決定標題、群組分頁、靈感來源） */
  toolId: string;
  /** 覆寫標題 */
  title?: string;
  /** 覆寫靈感來源（null 不顯示） */
  inspiration?: Inspiration | null;
  /** 設定面板（Tabs／Section／Field） */
  settings?: ReactNode;
  /** 預覽區（Stage、Transport、ExportPanel） */
  preview?: ReactNode;
  /**
   * 整頁內容：給了就取代「設定＋預覽」兩欄（例如開頁先顯示的範本一覽），頁首、頁尾照舊。
   * 不給時行為不變。
   */
  body?: ReactNode;
  /** 頁首右側的按鈕 */
  headerActions?: ReactNode;
  shortcuts?: readonly Shortcut[];
  /** 「說明」對話框的內容（通常與 UsageSection 相同） */
  usage?: ReactNode;
  /** 設定欄可以拖曳調整寬度（≥ 1024 px）；不給時固定 320～400 px（原本的版面） */
  settingsResize?: SettingsResize;
}

export interface SettingsResize {
  /** 記住寬度用的鍵名（localStorage `trpg-toolkit:layout:<persistKey>:settings-width`） */
  persistKey: string;
  /** 最窄（px，預設 320） */
  min?: number;
  /** 最寬（px，預設 640），而且不超過視窗寬的 maxRatio（預設 0.45，預覽至少留一半以上） */
  max?: number;
  maxRatio?: number;
  /** 方向鍵每次（px，預設 16；Shift 四倍） */
  step?: number;
}

const widthKey = (k: string) => `trpg-toolkit:layout:${k}:settings-width`;

function readWidth(key: string): number | null {
  try {
    const v = Number(localStorage.getItem(widthKey(key)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

function writeWidth(key: string, v: number | null) {
  try {
    if (v === null) localStorage.removeItem(widthKey(key));
    else localStorage.setItem(widthKey(key), String(Math.round(v)));
  } catch {
    /* 記不住就算了 */
  }
}

/** 設定欄的寬度：記住的寬度（夾在目前視窗允許的範圍內；視窗變窄時不改記住的值） */
function useSettingsWidth(o: SettingsResize | undefined) {
  const [stored, setStored] = useState<number | null>(() => (o ? readWidth(o.persistKey) : null));
  const [vw, setVw] = useState(() => (typeof window === 'undefined' ? 1280 : window.innerWidth));
  useEffect(() => {
    if (!o) return;
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [o]);
  const min = o?.min ?? 320;
  const max = Math.max(min, Math.min(o?.max ?? 640, Math.floor(vw * (o?.maxRatio ?? 0.45))));
  const clamp = (v: number) => Math.round(Math.min(max, Math.max(min, v)));
  return {
    width: stored === null ? null : clamp(stored),
    min,
    max,
    clamp,
    set: (v: number | null, persist: boolean) => {
      const next = v === null ? null : clamp(v);
      setStored(next);
      if (persist && o) writeWidth(o.persistKey, next);
    },
  };
}

/** 兩欄之間的分隔線（拖曳、按兩下、方向鍵） */
function SettingsSplitter({
  options,
  state,
  aside,
}: {
  options: SettingsResize;
  state: ReturnType<typeof useSettingsWidth>;
  aside: RefObject<HTMLElement | null>;
}) {
  const drag = useRef<{ id: number; x: number; w: number; moved: boolean } | null>(null);
  const current = () => state.width ?? aside.current?.getBoundingClientRect().width ?? state.min;
  const end = () => {
    const d = drag.current;
    drag.current = null;
    document.documentElement.style.removeProperty('cursor');
    document.documentElement.style.removeProperty('user-select');
    if (d?.moved) state.set(current(), true);
  };
  const step = options.step ?? 16;
  return (
    // biome-ignore lint/a11y/useSemanticElements: 可拖曳、可用鍵盤調整的分隔線（hr 不能互動）
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="設定欄的寬度"
      aria-valuemin={state.min}
      aria-valuemax={state.max}
      aria-valuenow={Math.round(current())}
      tabIndex={0}
      title="拖曳調整設定欄的寬度（按兩下回到預設寬度）"
      data-testid="settings-splitter"
      className="group relative hidden cursor-col-resize self-stretch touch-none outline-none lg:order-2 lg:block"
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          /* 不捕捉也能拖（指標離開分隔線時可能停住） */
        }
        drag.current = { id: e.pointerId, x: e.clientX, w: current(), moved: false };
        document.documentElement.style.cursor = 'col-resize';
        document.documentElement.style.userSelect = 'none';
      }}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        d.moved = true;
        state.set(d.w + e.clientX - d.x, false);
      }}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={() => state.set(null, true)}
      onKeyDown={(e) => {
        const k = e.shiftKey ? step * 4 : step;
        const w = current();
        const next =
          e.key === 'ArrowLeft'
            ? w - k
            : e.key === 'ArrowRight'
              ? w + k
              : e.key === 'Home'
                ? state.min
                : e.key === 'End'
                  ? state.max
                  : null;
        if (next === null) return;
        /* 方向鍵也是工具的快捷鍵（例如移動選取的物件）：這裡用掉 */
        e.preventDefault();
        e.stopPropagation();
        state.set(next, true);
      }}
    >
      {/* 抓取範圍：分隔線左右各 8 px */}
      <span aria-hidden className="absolute inset-y-0 -left-2 w-4" />
      {/* 把手：捲動時停在畫面中間 */}
      <span
        aria-hidden
        className="sticky top-[calc(50dvh-1.5rem)] -ml-0.5 block h-12 w-1 rounded-full bg-border transition-colors group-hover:bg-accent group-focus-visible:bg-accent group-focus-visible:ring-2 group-focus-visible:ring-focus"
      />
    </div>
  );
}

export function ToolShell({
  toolId,
  title,
  inspiration,
  settings,
  preview,
  headerActions,
  shortcuts = [],
  usage,
  body,
  settingsResize,
}: ToolShellProps) {
  const tool = getTool(toolId);
  const widthState = useSettingsWidth(settingsResize);
  const asideRef = useRef<HTMLElement>(null);
  const name = title ?? tool?.name ?? toolId;
  const [helpOpen, setHelpOpen] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);

  useEffect(() => {
    document.title = `${name}｜TRPG Toolkit`;
  }, [name]);

  const all = useMemo<Shortcut[]>(
    () =>
      shortcuts.length
        ? [
            ...shortcuts,
            { keys: '?', label: '顯示快捷鍵', group: '一般', handler: () => setKeysOpen(true) },
          ]
        : [],
    [shortcuts],
  );
  useShortcuts(all);

  return (
    <UiProvider>
      <div className="flex min-h-dvh flex-col bg-bg text-fg">
        {body === undefined ? (
          <a
            href="#tool-preview"
            className="sr-only rounded-md bg-accent px-3 py-2 text-accent-contrast focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50"
          >
            跳到預覽
          </a>
        ) : null}
        <ToolHeader
          toolId={toolId}
          title={name}
          actions={headerActions}
          onHelp={usage ? () => setHelpOpen(true) : undefined}
          onShortcuts={all.length ? () => setKeysOpen(true) : undefined}
        />
        {body !== undefined ? (
          <main className="mx-auto flex w-full max-w-[1600px] min-w-0 flex-1 flex-col gap-4 p-3 lg:p-4">
            {body}
          </main>
        ) : (
          <main
            className={
              settingsResize
                ? 'mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 items-start gap-4 p-3 lg:grid-cols-[var(--settings-w)_0px_minmax(0,1fr)] lg:gap-x-2 lg:p-4'
                : 'mx-auto grid w-full max-w-[1600px] flex-1 grid-cols-1 items-start gap-4 p-3 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] lg:p-4'
            }
            style={
              settingsResize
                ? ({
                    '--settings-w':
                      widthState.width === null ? 'minmax(320px,400px)' : `${widthState.width}px`,
                  } as CSSProperties)
                : undefined
            }
          >
            <aside
              ref={asideRef}
              aria-label="設定"
              className="order-2 flex min-w-0 flex-col gap-3 lg:order-1"
            >
              {settings}
            </aside>
            {settingsResize ? (
              <SettingsSplitter options={settingsResize} state={widthState} aside={asideRef} />
            ) : null}
            <section
              id="tool-preview"
              aria-label="預覽"
              tabIndex={-1}
              className={
                settingsResize
                  ? 'order-1 flex min-w-0 flex-col gap-3 outline-none lg:sticky-pane lg:order-3'
                  : 'order-1 flex min-w-0 flex-col gap-3 outline-none lg:sticky-pane lg:order-2'
              }
            >
              {preview}
            </section>
          </main>
        )}
        <InspirationFooter
          inspiration={inspiration === undefined ? tool?.inspiration : inspiration}
        />
      </div>
      {all.length ? (
        <ShortcutHelp shortcuts={all} open={keysOpen} onOpenChange={setKeysOpen} />
      ) : null}
      {usage ? (
        <Dialog
          open={helpOpen}
          onOpenChange={setHelpOpen}
          title={`${name}：使用方式`}
          footer={<DialogClose />}
        >
          <div className="text-sm leading-relaxed [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
            {usage}
          </div>
        </Dialog>
      ) : null}
    </UiProvider>
  );
}
