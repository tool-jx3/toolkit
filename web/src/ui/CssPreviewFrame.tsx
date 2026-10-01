/**
 * OBS 自訂 CSS 的預覽：用 iframe 以「來源原尺寸」排版模擬頁（ccfolia/mock 的場景）、套用工具產生的 CSS，
 * 再等比縮放到預覽區。G4（狀態條、訊息框、聊天視窗、Discord 通話立繪）共用。
 *
 * - 倍率＝min(maxScale, (預覽區寬 − gutter) ÷ 來源寬, maxHeight ÷ 來源高)；四周以粉紅虛線標出來源範圍，角落顯示倍率。
 * - 工具的 CSS 放在 iframe head 的第一個 <style>，模擬頁原本的樣式在它之後（與 OBS 相同：CCFOLIA 的樣式後插入）。
 * - 背景：棋盤格／深／淺／彩色場景／自訂色（只在 iframe 後面，不會進 CSS）；「套用前」顯示沒有 CSS 的原樣。
 * - 改 CSS（或 replayKey）時重播 CSS 動畫；pauseAt 讓所有動畫停在第 t 毫秒（測試、截圖用）。
 * - hover：模擬滑鼠移到頁面上（OBS「互動」視窗）。CSS 裡的 `:hover` 會同時對 html／body／#root 上的 .tk-hover 生效，
 *   所以「滑鼠在頁面上時才顯示」請寫成 `html:hover …`、`body:hover …` 這類頁面層級的寫法。
 * - pointer='hover'：滑鼠真的移到預覽上也會觸發 :hover（點擊、捲動、按鍵仍然無效）。
 * - onMeasure：量測來源內容尺寸（場景的 measure，或 #root 右下角＋外距），字型載入完成與頁面變動時重量。
 *
 * ```tsx
 * const scene = useMemo(() => createCharacterScene(), []);
 * const frame = useRef<CssPreviewFrameHandle>(null);
 * <CssPreviewFrame ref={frame} width={size.width} height={size.height} css={css} scene={scene}
 *   maxScale={2} onMeasure={setMeasured} />
 * ```
 */
import { Eye, EyeOff, MousePointer2 } from 'lucide-react';
import {
  type CSSProperties,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { type MockScene, measureRootExtent } from '@/ccfolia/mock/shared';
import { IconButton } from './Button';
import { ColorField } from './ColorField';
import { cn } from './cn';
import { Segmented } from './Segmented';

export type PreviewBackgroundKind = 'checker' | 'dark' | 'light' | 'scene' | 'color';

export interface PreviewBackground {
  kind: PreviewBackgroundKind;
  /** kind='color' 時的顏色（可半透明） */
  color?: string;
}

export interface PreviewSize {
  width: number;
  height: number;
}

export interface CssPreviewFrameHandle {
  /** iframe 裡的文件（還沒載入時 null） */
  readonly document: Document | null;
  /** 立刻量測來源內容尺寸 */
  measure(): PreviewSize | null;
  /** 暫時換成另一份 CSS 量測（例如用 10 個字的名稱估算來源大小），量完還原 */
  measureWith(css: string): PreviewSize | null;
  /** 重播所有 CSS 動畫 */
  replay(): void;
  /** 所有動畫停在第 t 毫秒；null 恢復播放 */
  pauseAt(ms: number | null): void;
}

export interface CssPreviewFrameProps {
  /** 來源（OBS 瀏覽器來源）的寬高 px：iframe 以這個尺寸排版 */
  width: number;
  height: number;
  /** 套用的 CSS */
  css: string;
  /** 模擬頁場景（ccfolia/mock）；不給時是空白頁 */
  scene?: MockScene | null;
  /** 最大倍率（預設 1；狀態條用 2） */
  maxScale?: number;
  /** 預覽區最高 px（預設 560） */
  maxHeight?: number;
  /** 預覽區寬度要扣掉的留白 px（預設 32） */
  gutter?: number;
  background?: PreviewBackground;
  defaultBackground?: PreviewBackground;
  onBackgroundChange?: (bg: PreviewBackground) => void;
  /** 工具列提供哪些背景（預設：棋盤格、深、淺、場景） */
  backgrounds?: readonly PreviewBackgroundKind[];
  /** 套用前（不套 CSS） */
  showBefore?: boolean;
  /** 給了就在工具列顯示「套用前」切換 */
  onShowBeforeChange?: (v: boolean) => void;
  /** 模擬滑鼠移到頁面上（OBS 互動） */
  hover?: boolean;
  /** 給了就在工具列顯示「模擬滑鼠移入」切換 */
  onHoverChange?: (v: boolean) => void;
  /** none：預覽完全不能用滑鼠操作（預設）；hover：滑鼠移上去會觸發 :hover（點擊仍無效） */
  pointer?: 'none' | 'hover';
  /** 改變時重播動畫（CSS 改變時也會重播） */
  replayKey?: unknown;
  /** 測試用：所有動畫停在第 t 毫秒 */
  pauseAt?: number | null;
  /** 量到來源內容尺寸時（有變動才呼叫） */
  onMeasure?: (size: PreviewSize) => void;
  /** 量測時暫時用這個 iframe 尺寸排版（內容可能比目前的來源大時） */
  measureViewport?: PreviewSize;
  /** 量測哪個元素（預設 #root；場景有 measure 時用場景的） */
  measureSelector?: string;
  /** 顯示工具列（預設 true） */
  toolbar?: boolean;
  toolbarExtra?: ReactNode;
  /** 預覽下方顯示「來源大小 寬 W × 高 H」（預設 true） */
  showSize?: boolean;
  /** 來源大小後面的補充（例：名稱最多 10 個字） */
  sizeNote?: ReactNode;
  /** iframe 的標題（螢幕閱讀器） */
  label?: string;
  className?: string;
  ref?: Ref<CssPreviewFrameHandle>;
}

const SRCDOC =
  '<!doctype html><html><head><meta charset="utf-8"><style id="tk-user-css"></style></head><body></body></html>';

const BG_OPTIONS: { value: PreviewBackgroundKind; label: string; ariaLabel: string }[] = [
  { value: 'checker', label: '透明', ariaLabel: '棋盤格（透明）' },
  { value: 'dark', label: '深', ariaLabel: '深色背景' },
  { value: 'light', label: '淺', ariaLabel: '淺色背景' },
  { value: 'scene', label: '場景', ariaLabel: '彩色場景' },
  { value: 'color', label: '色', ariaLabel: '自訂顏色背景' },
];

/** 彩色場景：兩團柔和的色光（本專案自訂） */
const SCENE_BG =
  'radial-gradient(circle at 22% 28%, rgb(108 140 255 / 0.85), transparent 55%), radial-gradient(circle at 78% 72%, rgb(255 140 178 / 0.8), transparent 52%), linear-gradient(135deg, #283350, #4b2f47)';

function bgLook(bg: PreviewBackground): { className: string; style?: CSSProperties } {
  switch (bg.kind) {
    case 'dark':
      return { className: '', style: { background: '#16161a' } };
    case 'light':
      return { className: '', style: { background: '#f4f4f2' } };
    case 'scene':
      return { className: '', style: { background: SCENE_BG } };
    case 'color':
      return {
        className: 'checker',
        style: { boxShadow: `inset 0 0 0 9999px ${bg.color ?? '#808080'}` },
      };
    default:
      return { className: 'checker' };
  }
}

/** CSS 的 :hover 同時對 .tk-hover 生效（模擬滑鼠在頁面上） */
export function simulateHoverCss(css: string): string {
  return css.replace(/(?<!:):hover(?![\w-])/g, ':is(:hover, .tk-hover)');
}

const BLOCKED_EVENTS = [
  'click',
  'dblclick',
  'mousedown',
  'pointerdown',
  'keydown',
  'wheel',
  'contextmenu',
  'dragstart',
  'submit',
  'auxclick',
];

function isCssAnimation(a: Animation): a is Animation & { animationName: string } {
  return 'animationName' in a;
}

/** 這個 CSS 動畫的元素現在還套著同名的 animation-name 嗎 */
function stillAnimated(doc: Document, a: Animation & { animationName: string }): boolean {
  const effect = a.effect as KeyframeEffect | null;
  const target = effect?.target;
  const view = doc.defaultView;
  if (!target || !view) return true;
  const names = view
    .getComputedStyle(target, effect.pseudoElement ?? undefined)
    .animationName.split(',')
    .map((n) => n.trim());
  return names.includes(a.animationName);
}

export function CssPreviewFrame({
  width,
  height,
  css,
  scene,
  maxScale = 1,
  maxHeight = 560,
  gutter = 32,
  background,
  defaultBackground = { kind: 'checker' },
  onBackgroundChange,
  backgrounds = ['checker', 'dark', 'light', 'scene'],
  showBefore = false,
  onShowBeforeChange,
  hover = false,
  onHoverChange,
  pointer = 'none',
  replayKey,
  pauseAt = null,
  onMeasure,
  measureViewport,
  measureSelector = '#root',
  toolbar = true,
  toolbarExtra,
  showSize = true,
  sizeNote,
  label = '預覽',
  className,
  ref,
}: CssPreviewFrameProps) {
  const W = Math.max(1, Math.round(width));
  const H = Math.max(1, Math.round(height));
  const iframe = useRef<HTMLIFrameElement>(null);
  const [doc, setDoc] = useState<Document | null>(null);
  const [innerBg, setInnerBg] = useState(defaultBackground);
  const bg = background ?? innerBg;
  const setBg = (b: PreviewBackground) => {
    if (!background) setInnerBg(b);
    onBackgroundChange?.(b);
  };

  /* ---- 縮放 ---- */
  const viewport = useRef<HTMLDivElement>(null);
  const [areaWidth, setAreaWidth] = useState(0);
  useLayoutEffect(() => {
    const el = viewport.current;
    if (!el) return;
    const read = () => setAreaWidth(el.clientWidth);
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const fit =
    areaWidth > 0
      ? Math.min(maxScale, (areaWidth - gutter) / W, maxHeight / H)
      : Math.min(maxScale, maxHeight / H);
  const scale = Math.max(0.02, fit);

  /* ---- 最新的參數（給事件處理用） ---- */
  const latest = useRef({ pauseAt, onMeasure, scene, measureSelector, measureViewport });
  latest.current = { pauseAt, onMeasure, scene, measureSelector, measureViewport };
  const lastSize = useRef<PreviewSize | null>(null);

  const userStyle = useCallback(
    () => (doc?.getElementById('tk-user-css') as HTMLStyleElement | null) ?? null,
    [doc],
  );

  const measureNow = useCallback((): PreviewSize | null => {
    const d = doc;
    const f = iframe.current;
    if (!d || !f) return null;
    const { scene: sc, measureSelector: sel, measureViewport: vp } = latest.current;
    let restore: (() => void) | null = null;
    if (vp) {
      const pw = f.style.width;
      const ph = f.style.height;
      f.style.width = `${vp.width}px`;
      f.style.height = `${vp.height}px`;
      restore = () => {
        f.style.width = pw;
        f.style.height = ph;
      };
    }
    try {
      return sc?.measure ? sc.measure(d) : measureRootExtent(d, sel);
    } finally {
      restore?.();
    }
  }, [doc]);

  const reportMeasure = useCallback(() => {
    const cb = latest.current.onMeasure;
    if (!cb) return;
    const s = measureNow();
    if (!s) return;
    const prev = lastSize.current;
    if (prev && prev.width === s.width && prev.height === s.height) return;
    lastSize.current = s;
    cb(s);
  }, [measureNow]);

  const applyPause = useCallback(() => {
    const t = latest.current.pauseAt;
    if (!doc || t === null || t === undefined) return;
    for (const a of doc.getAnimations()) {
      /* 用 API 暫停過的 CSS 動畫，在元素不再符合規則時瀏覽器不一定會自動取消：照目前的 animation-name 同步 */
      if (isCssAnimation(a) && !stillAnimated(doc, a)) {
        a.cancel();
        continue;
      }
      a.pause();
      a.currentTime = t;
    }
  }, [doc]);

  const replay = useCallback(() => {
    if (!doc?.body) return;
    /*
     * 用 API 暫停過的 CSS 動畫，在 CSS 改變（動畫名稱相同、內容或時長不同）後可能留著舊的那個：
     * 先全部取消，下面關掉再恢復 animation-name 時會照目前的規則重新建立。
     */
    for (const a of doc.getAnimations()) if (isCssAnimation(a)) a.cancel();
    /*
     * 讓所有 CSS 動畫從頭開始：暫時把 animation-name 全部關掉再恢復（瀏覽器會重新建立動畫）。
     * 不用 Animation.play()：用 API 控制過的 CSS 動畫，之後規則不符合時不一定會被取消。
     */
    const off = doc.createElement('style');
    /* 放在 @layer 裡的 !important 會蓋過沒有分層的 !important（不論權重），工具 CSS 的 animation 也關得掉 */
    off.textContent =
      '@layer tk-replay { *, *::before, *::after { animation-name: none !important; } }';
    doc.head.append(off);
    void doc.body.getBoundingClientRect();
    off.remove();
    void doc.body.getBoundingClientRect();
    applyPause();
  }, [doc, applyPause]);

  /** 結束暫停：轉場接著播，CSS 動畫從頭重播（不用 API 控制 CSS 動畫，理由見 replay） */
  const resume = useCallback(() => {
    if (!doc) return;
    for (const a of doc.getAnimations())
      if (!isCssAnimation(a) && a.playState === 'paused') a.play();
    replay();
  }, [doc, replay]);

  useImperativeHandle(
    ref,
    () => ({
      get document() {
        return doc;
      },
      measure: measureNow,
      measureWith(other: string) {
        const st = userStyle();
        if (!st) return null;
        const prev = st.textContent;
        st.textContent = other;
        try {
          return measureNow();
        } finally {
          st.textContent = prev;
        }
      },
      replay,
      pauseAt(ms: number | null) {
        latest.current.pauseAt = ms;
        if (ms === null) resume();
        else applyPause();
      },
    }),
    [doc, measureNow, replay, applyPause, resume, userStyle],
  );

  /* ---- iframe 載入 ---- */
  const onLoad = () => {
    const d = iframe.current?.contentDocument ?? null;
    if (!d) return;
    lastSize.current = null;
    setDoc(d);
  };

  /* ---- 場景 ---- */
  useLayoutEffect(() => {
    if (!doc) return;
    if (!scene) {
      doc.body.replaceChildren();
      return;
    }
    const unmount = scene.mount(doc);
    return () => {
      unmount();
      /* 換場景（或 StrictMode 重新掛載）時清掉上一個模擬頁的樣式，避免重複 */
      for (const el of doc.head.querySelectorAll('style[data-mock]')) el.remove();
    };
  }, [doc, scene]);

  /* ---- 套用 CSS、滑鼠移入的模擬 ---- */
  const effectiveCss = showBefore ? '' : hover ? simulateHoverCss(css) : css;
  // biome-ignore lint/correctness/useExhaustiveDependencies: scene 換掉時也要重新套用與量測
  useLayoutEffect(() => {
    const st = userStyle();
    if (!st || !doc) return;
    if (st.textContent !== effectiveCss) st.textContent = effectiveCss;
    for (const el of [doc.documentElement, doc.body, doc.getElementById('root')])
      el?.classList.toggle('tk-hover', hover && !showBefore);
    replay();
    reportMeasure();
  }, [doc, effectiveCss, hover, showBefore, scene, userStyle, replay, reportMeasure]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: replayKey 只用來觸發重播
  useEffect(() => {
    replay();
  }, [replayKey]);

  const wasPaused = useRef(false);
  useEffect(() => {
    if (pauseAt === null || pauseAt === undefined) {
      if (wasPaused.current) resume();
      wasPaused.current = false;
    } else {
      wasPaused.current = true;
      applyPause();
    }
  }, [pauseAt, applyPause, resume]);

  /* ---- 頁面變動、字型載入：重新量測；暫停模式下新的動畫也停在同一點 ---- */
  useEffect(() => {
    if (!doc) return;
    const view = doc.defaultView;
    let raf = 0;
    const kick = () => {
      if (raf || !view) return;
      raf = view.requestAnimationFrame(() => {
        raf = 0;
        reportMeasure();
        applyPause();
        const root = doc.getElementById('root');
        if (root && doc.documentElement.classList.contains('tk-hover'))
          root.classList.add('tk-hover');
      });
    };
    const MO = (view as (Window & typeof globalThis) | null)?.MutationObserver;
    const mo = MO ? new MO(kick) : null;
    mo?.observe(doc.body, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true,
    });
    const onFonts = () => kick();
    doc.fonts?.addEventListener('loadingdone', onFonts);
    doc.addEventListener('animationstart', applyPause, true);
    doc.addEventListener('transitionrun', applyPause, true);
    return () => {
      mo?.disconnect();
      doc.fonts?.removeEventListener('loadingdone', onFonts);
      doc.removeEventListener('animationstart', applyPause, true);
      doc.removeEventListener('transitionrun', applyPause, true);
      if (raf && view) view.cancelAnimationFrame(raf);
    };
  }, [doc, reportMeasure, applyPause]);

  /* 來源尺寸改變時重量 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: W、H 改變時 iframe 重新排版
  useLayoutEffect(() => {
    reportMeasure();
  }, [W, H, reportMeasure]);

  /* ---- 預覽不能操作：攔下 iframe 裡的點擊、按鍵、捲動 ---- */
  useEffect(() => {
    if (!doc) return;
    const block = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };
    for (const t of BLOCKED_EVENTS)
      doc.addEventListener(t, block, { capture: true, passive: false });
    return () => {
      for (const t of BLOCKED_EVENTS) doc.removeEventListener(t, block, { capture: true });
    };
  }, [doc]);

  const look = bgLook(bg);
  const pctText = `${Math.round(scale * 100)}%`;

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col overflow-hidden rounded-lg border border-border bg-surface',
        className,
      )}
    >
      {toolbar ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-2 py-1.5">
          <Segmented
            aria-label="預覽背景"
            size="sm"
            value={bg.kind}
            onValueChange={(kind) => setBg({ ...bg, kind })}
            options={BG_OPTIONS.filter((o) => backgrounds.includes(o.value))}
          />
          {bg.kind === 'color' ? (
            <ColorField
              aria-label="背景色"
              value={bg.color ?? '#808080'}
              onChange={(color) => setBg({ ...bg, color })}
              showInput={false}
              className="w-auto"
            />
          ) : null}
          <div className="ml-auto flex items-center gap-0.5">
            {toolbarExtra}
            {onHoverChange ? (
              <IconButton
                label="模擬滑鼠移到畫面上（OBS 的「互動」視窗）"
                icon={<MousePointer2 />}
                size="sm"
                pressed={hover}
                onClick={() => onHoverChange(!hover)}
              />
            ) : null}
            {onShowBeforeChange ? (
              <IconButton
                label={showBefore ? '顯示套用後' : '查看套用前的樣子'}
                icon={showBefore ? <EyeOff /> : <Eye />}
                size="sm"
                pressed={showBefore}
                onClick={() => onShowBeforeChange(!showBefore)}
              />
            ) : null}
          </div>
        </div>
      ) : null}
      <div
        ref={viewport}
        className={cn(
          'relative flex w-full items-center justify-center overflow-hidden',
          look.className,
        )}
        style={{ ...look.style, height: Math.ceil(H * scale) + gutter }}
        data-testid="css-preview-area"
      >
        <div
          className="relative shrink-0 overflow-hidden"
          style={{
            width: W * scale,
            height: H * scale,
            outline: '1px dashed var(--source-outline)',
          }}
          data-testid="css-preview-source"
          data-scale={scale}
        >
          <iframe
            ref={iframe}
            title={label}
            srcDoc={SRCDOC}
            onLoad={onLoad}
            tabIndex={-1}
            inert={pointer === 'none' ? true : undefined}
            className="absolute top-0 left-0 block border-0"
            style={{
              width: W,
              height: H,
              transform: `scale(${scale})`,
              transformOrigin: '0 0',
              /* iframe 與裡面的文件色彩配置不同時，瀏覽器會在 iframe 後面墊白底；兩邊都用 light 才會透明 */
              colorScheme: 'light',
              pointerEvents: pointer === 'none' ? 'none' : 'auto',
              background: 'transparent',
            }}
          />
        </div>
        <span
          className="pointer-events-none absolute top-1 right-1.5 rounded-sm bg-surface/80 px-1.5 text-xs tabular-nums text-muted"
          aria-hidden
        >
          {pctText}
          {showBefore ? '・套用前' : ''}
        </span>
      </div>
      {showSize ? (
        <p
          className="m-0 border-t border-border px-3 py-1.5 text-xs text-muted"
          data-testid="css-preview-size"
        >
          來源大小：寬 {W} × 高 {H}
          {sizeNote ? <span>（{sizeNote}）</span> : null}
        </p>
      ) : null}
    </div>
  );
}
