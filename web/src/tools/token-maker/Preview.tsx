/**
 * 預覽：工具列（移動、魔術棒、筆刷、自動、清除、更多）＋工具的選項＋Stage 裡的畫布（與匯出同一段繪圖程式，1024 px）、
 * 疊在上面的提示層（只在預覽）與操作層（拖曳、捏合、滾輪、點選、塗抹）。
 */
import { Brush, Eraser, ImagePlus, Lasso, Move, Sparkles, Wand2, X } from 'lucide-react';
import {
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { ensureFont } from '@/core/fonts';
import { type BrushMode, StrokePainter } from '@/core/image';
import {
  Button,
  buttonClass,
  createPointerGesture,
  MenuButton,
  Notice,
  Segmented,
  Slider,
  Stage,
  Toggle,
  Tooltip,
  useStageScale,
  useToast,
} from '@/ui';
import { changeMask, lassoSelect, retuneWand, runAuto, selectionText, wandAt } from './actions';
import { badgeText, labelText, type OverlayKind, overlayAt, snapOverlay } from './labels';
import { copyMask, emptyMask, type Mask, maskSizeFor, type SelectMode } from './mask';
import {
  clamp,
  type Geom,
  geom,
  type ImageTransform,
  OVERFLOW_EPS,
  overflowMax,
  PREVIEW_SIZE,
  RANGES,
  type TokenItem,
  type TokenView,
  tokenToImage,
  zoomViewAt,
} from './model';
import { drawOverlay, type OverlayInput } from './overlay';
import { type Drawable, renderToken } from './render';
import {
  haloImage,
  hardMaskCanvas,
  peekHaloImage,
  peekMask,
  softMaskCanvas,
  useCustomData,
  useRefImage,
  useTokenData,
} from './sources';
import {
  commitMask,
  currentToken,
  editLook,
  effectiveMode,
  flushBurst,
  gesture,
  setPrefs,
  setTool,
  setView,
  toggleMaskView,
  tokenOverflow,
  tokenPad,
  useDoc,
  usePrefs,
  useUi,
  wheelRotate,
  wheelZoom,
} from './store';
import { S, type ToolId } from './strings';
import { onTextureReady, requestTexture } from './textures';

type AnyCanvas = HTMLCanvasElement | OffscreenCanvas;
const N = PREVIEW_SIZE;

/** 預覽的繪製結果（操作層換算座標用） */
interface DrawInfo {
  t: ImageTransform | null;
  R: number;
  g: Geom;
}

type SnapInfo = OverlayInput['snap'];

/** 正在圈的套索：遮罩的 px（填的時候用）與棋子的 px（畫的時候用） */
interface LassoState {
  tokenId: string;
  mode: SelectMode;
  pts: { x: number; y: number }[];
  screen: { x: number; y: number }[];
}

/** 鍵盤的游標（棋子的 px）；focused＝預覽有焦點（才畫十字） */
interface KeyCursor {
  at: { x: number; y: number } | null;
  focused: boolean;
}

/** 量名字牌、弧形文字大小用的畫布（點選名字時） */
let measureCtx: CanvasRenderingContext2D | null = null;
function measure(): CanvasRenderingContext2D | null {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  return measureCtx;
}

/** 正在畫的一筆：遮罩的複本＋共用的筆刷（只更新畫到的範圍） */
class LivePaint {
  readonly mask: Mask;
  readonly canvas: HTMLCanvasElement;
  private readonly painter: StrokePainter;
  private readonly ctx: CanvasRenderingContext2D;
  version = 0;
  constructor(
    readonly tokenId: string,
    base: Mask,
    readonly mode: BrushMode,
    diameter: number,
  ) {
    this.mask = copyMask(base);
    this.painter = new StrokePainter(this.mask.data, base.width, base.height, mode, diameter, 100);
    this.canvas = document.createElement('canvas');
    this.canvas.width = base.width;
    this.canvas.height = base.height;
    this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
    this.blit(0, 0, base.width, base.height);
  }
  private blit(x: number, y: number, w: number, h: number) {
    if (w <= 0 || h <= 0) return;
    const img = this.ctx.createImageData(w, h);
    const d = img.data;
    const m = this.mask;
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        const v = m.data[(y + j) * m.width + x + i];
        const p = (j * w + i) * 4;
        d[p] = d[p + 1] = d[p + 2] = 255;
        d[p + 3] = v;
      }
    this.ctx.putImageData(img, x, y);
  }
  add(x: number, y: number): void {
    const r = this.painter.add(x, y);
    if (r) this.blit(r.x, r.y, r.width, r.height);
    this.version++;
  }
}

/**
 * 拖曳的一步復原。文字欄（名稱、徽章）有焦點時按下去：它的手勢在失去焦點的 microtask 才結束，會把拖曳的手勢一起結束掉
 * （之後拖曳的每一格都變成一步）。所以先把文字欄那一步結束（打字自己一步）、開始拖曳的手勢，
 * 等它的 microtask 結束手勢之後，還在拖曳就再開始一次（那時還沒有變更，不會多出一步）。
 */
function beginDrag(blurred: boolean, dragging: () => boolean): void {
  if (blurred) useDoc.endGesture();
  useDoc.beginGesture();
  if (blurred)
    queueMicrotask(() => {
      if (dragging()) useDoc.beginGesture();
    });
}

/** 欄位有焦點時讓它失去焦點（它的手勢在這時提交）；有的話回傳 true */
function releaseFocus(): boolean {
  const a = document.activeElement;
  if (
    a instanceof HTMLElement &&
    a !== document.body &&
    a.closest('input,textarea,[role="slider"]')
  ) {
    a.blur();
    return true;
  }
  return false;
}

export function Preview({ onPick }: { onPick: () => void }) {
  const look = useDoc((s) => s.data.look);
  const token = useDoc((s) => currentToken(s.data));
  const tool = usePrefs((s) => s.data.tool);
  const showOutline = usePrefs((s) => s.data.showOutline);
  const live = useUi((s) => s.liveMask);
  const lockedPad = useUi((s) => s.lockedPad);
  const wand = useUi((s) => s.wand);
  const space = useUi((s) => s.space);
  const data = useTokenData(token?.image ?? null, token?.mask ?? null);
  const custom = useDoc((s) => s.data.custom);
  const customFrameId = look.frame === 'custom' ? (custom.frame?.id ?? null) : null;
  const cdata = useCustomData(customFrameId, custom.mask?.id ?? null);
  const refKind = usePrefs((s) => s.data.refKind);
  const refOpacity = usePrefs((s) => s.data.refOpacity);
  const guides = usePrefs((s) => s.data.guides);
  const refImageId = usePrefs((s) => s.data.refImage);
  const refImage = useRefImage(refKind === 'custom' ? refImageId : null);
  const [paintTick, setPaintTick] = useState(0);
  const [texTick, setTexTick] = useState(0);
  const [fontTick, setFontTick] = useState(0);
  const paint = useRef<LivePaint | null>(null);
  const main = useRef<HTMLCanvasElement>(null);
  const over = useRef<HTMLCanvasElement>(null);
  const cursor = useRef<{ x: number; y: number } | null>(null);
  const snap = useRef<SnapInfo>(null);
  const lasso = useRef<LassoState | null>(null);
  const keyCursor = useRef<KeyCursor>({ at: null, focused: false });
  const strip = useRef<(() => void) | null>(null);
  const maskView = useUi((s) => s.maskView);
  const info = useRef<DrawInfo>({ t: null, R: N / 2, g: geom(N, 0) });
  /** 提示層要用、但不在 store 裡的東西 */
  const extras = useRef<{ customMask: Drawable | null; refImage: Drawable | null }>({
    customMask: null,
    refImage: null,
  });
  extras.current = { customMask: cdata.mask, refImage };

  useEffect(() => onTextureReady(() => setTexTick((t) => t + 1)), []);

  /* 名字、徽章的字型：載好再重畫一次 */
  const text = `${labelText(look, token)}${badgeText(look, token)}`;
  useEffect(() => {
    if (!text || !look.font.family) return;
    let alive = true;
    void ensureFont(look.font.family, look.font.weight, text)
      .catch(() => false)
      .then(() => {
        if (alive) setFontTick((t) => t + 1);
      });
    return () => {
      alive = false;
    };
  }, [look.font.family, look.font.weight, text]);

  const liveMask = live && token && live.tokenId === token.id ? live.mask : null;
  const mask = liveMask ?? data.mask;
  const pad = lockedPad ?? tokenPad(look, token, liveMask ?? undefined);
  const hasImage = !!token?.image;
  const ready = data.status === 'ready';
  const showFrame = usePrefs((s) => s.data.showFrame);
  /* 畫布邊界：手動邊距、出框超出畫布時變紅 */
  const overflow = showFrame ? tokenOverflow(look, token, mask ?? undefined) : null;
  const frameOver = !!overflow && overflowMax(overflow) > OVERFLOW_EPS;

  /* 主畫布：和匯出同一段繪製 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: paintTick、texTick、fontTick 讓正在畫的一筆、產生好的質感、載好的字型重畫
  useEffect(() => {
    const ctx = main.current?.getContext('2d');
    if (!ctx) return;
    const p = paint.current;
    const painting = !!(p && token && p.tokenId === token.id);
    const popMask = painting
      ? (p as LivePaint).canvas
      : mask && token?.popOn
        ? softMaskCanvas(mask, look.feather)
        : null;
    /* 去光暈：畫到一半時先用上一次算好的（不每一格重算） */
    const halo = token?.halo ?? 0;
    const popImage =
      !token?.image || !halo || !token.popOn
        ? null
        : painting
          ? peekHaloImage(token.image.id, halo)
          : mask && data.work
            ? haloImage(token.image.id, data.work, mask, halo)
            : null;
    const r = renderToken(
      ctx,
      { N, pad, look, token: token ?? null },
      {
        image: data.work?.bitmap ?? null,
        size: token?.image ?? null,
        popMask,
        texture: requestTexture(look.texture, look.texSeed),
        customFrame: cdata.frame,
        customFrameId,
        customMask: cdata.mask,
        popImage,
      },
    );
    info.current = { t: r.transform, R: r.geom.R, g: r.geom };
    drawHints();
    strip.current?.();
  }, [look, token, data.work, mask, pad, paintTick, texTick, fontTick, cdata.frame, cdata.mask]);

  /** 提示層（選取、被藏起來的部分、筆刷圓圈）：游標移動時只重畫這一層 */
  const drawHints = useCallback(() => {
    const ctx = over.current?.getContext('2d');
    if (!ctx) return;
    const s = useDoc.getState().data;
    const tk = currentToken(s);
    const prefs = usePrefs.getState().data;
    const ui = useUi.getState();
    const p = paint.current;
    const lv = ui.liveMask && tk && ui.liveMask.tokenId === tk.id ? ui.liveMask.mask : null;
    const m = lv ?? (tk?.mask ? maskOf(tk) : null);
    const selection: AnyCanvas | null =
      p && tk && p.tokenId === tk.id ? p.canvas : m ? hardMaskCanvas(m) : null;
    const g = info.current.g;
    const c = cursor.current;
    const kc = keyCursor.current;
    const ls = lasso.current && tk && lasso.current.tokenId === tk.id ? lasso.current : null;
    const seed = ui.wand && tk && ui.wand.tokenId === tk.id ? ui.wand : null;
    let wandPoint: { x: number; y: number } | null = null;
    if (seed && tk?.image && info.current.t) {
      const ms = maskSizeFor(tk.image);
      const t = info.current.t;
      const u = (seed.x * tk.image.width) / ms.width;
      const v = (seed.y * tk.image.height) / ms.height;
      const lx = (u - tk.image.width / 2) * t.scale * t.flip;
      const ly = (v - tk.image.height / 2) * t.scale;
      wandPoint = {
        x: t.tx + lx * Math.cos(t.angle) - ly * Math.sin(t.angle),
        y: t.ty + lx * Math.sin(t.angle) + ly * Math.cos(t.angle),
      };
    }
    drawOverlay(ctx, {
      N,
      geom: g,
      look: s.look,
      transform: info.current.t,
      size: tk?.image ?? null,
      image: tk?.image ? (data.work?.bitmap ?? null) : null,
      selection,
      tool: ui.space ? 'move' : prefs.tool,
      showOutline: prefs.showOutline,
      wandActive: !!seed,
      wandPoint,
      cursor:
        c && prefs.tool === 'brush' && !ui.space
          ? {
              x: c.x,
              y: c.y,
              r: (prefs.brush / 100) * info.current.R,
              erase: effectiveMode() === 'sub',
            }
          : null,
      lasso: ls ? { pts: ls.screen, erase: ls.mode === 'sub' } : null,
      keyCursor: kc.focused && kc.at && prefs.tool === 'wand' && !ui.space ? kc.at : null,
      maskView:
        ui.maskView && tk?.image
          ? p && tk && p.tokenId === tk.id
            ? p.canvas
            : m
              ? softMaskCanvas(m, s.look.feather)
              : null
          : null,
      maskViewOn: ui.maskView && !!tk?.image,
      customMask: extras.current.customMask,
      ref: {
        kind: prefs.refKind,
        image: extras.current.refImage,
        opacity: prefs.refOpacity,
        guides: prefs.guides,
      },
      snap: snap.current,
    });
  }, [data.work]);

  /* 工具、外框顯示、Alt、空白鍵改變時重畫提示層 */
  const alt = useUi((s) => s.alt);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 這些改變時重畫提示層
  useEffect(() => {
    drawHints();
  }, [
    tool,
    showOutline,
    alt,
    space,
    wand,
    drawHints,
    refKind,
    refOpacity,
    guides,
    refImage,
    maskView,
  ]);

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <ToolBar disabled={!hasImage} />
      <div className="relative">
        <Stage width={N} height={N} aria-label={S.previewLabel}>
          <canvas
            ref={main}
            width={N}
            height={N}
            data-testid="token-canvas"
            className="absolute inset-0 block size-full"
          />
          <canvas
            ref={over}
            width={N}
            height={N}
            aria-hidden
            data-testid="token-overlay"
            className="pointer-events-none absolute inset-0 block size-full"
          />
          {hasImage && showFrame ? <ImageFrame over={frameOver} /> : null}
          {hasImage ? (
            <InteractionLayer
              token={token as TokenItem}
              ready={ready}
              info={info}
              paint={paint}
              cursor={cursor}
              snap={snap}
              lasso={lasso}
              keyCursor={keyCursor}
              onPaint={() => setPaintTick((t) => t + 1)}
              onHover={drawHints}
            />
          ) : (
            <button
              type="button"
              onClick={onPick}
              className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-2 text-sm text-muted outline-none hover:text-fg focus-visible:ring-2 focus-visible:ring-focus"
              data-testid="token-pick"
            >
              <ImagePlus aria-hidden className="size-10" />
              <span className="rounded-md bg-surface/80 px-3 py-1.5">{S.previewEmpty}</span>
            </button>
          )}
        </Stage>
      </div>
      <StatusLine token={token} mask={mask} />
      {hasImage ? <TableStrip source={main} redraw={strip} /> : null}
      {data.status === 'missing' ? <Notice tone="warning">{S.imageMissing}</Notice> : null}
    </div>
  );
}

/**
 * 畫布邊界（token-workshop 70f1503 的 image frame）：預覽畫布就是匯出的圖，在它的邊上畫虛線（深色的底線＋白色虛線，
 * 出框超出畫布時紅色）；線寬、虛線的長度依舞台的縮放換算，畫面上一樣粗。只在預覽，不會匯出。
 */
function ImageFrame({ over }: { over: boolean }) {
  const k = 1 / Math.max(0.01, useStageScale());
  const outer = 3.2 * k;
  const inset = outer / 2;
  const rect = { x: inset, y: inset, width: N - outer, height: N - outer, fill: 'none' };
  return (
    <svg
      aria-hidden
      data-testid="image-frame"
      data-over={over ? 'true' : undefined}
      viewBox={`0 0 ${N} ${N}`}
      className="pointer-events-none absolute inset-0 block size-full"
    >
      <rect {...rect} stroke="rgba(0,0,0,0.55)" strokeWidth={outer} />
      <rect
        {...rect}
        stroke={over ? '#ff453a' : '#ffffff'}
        strokeWidth={1.5 * k}
        strokeDasharray={`${6 * k} ${4 * k}`}
      />
    </svg>
  );
}

const STRIP_SIZES = [40, 80, 120] as const;

/** 桌面尺寸預覽（40、80、120 px）：預覽畫布縮小（不含提示層）；只在預覽 */
function TableStrip({
  source,
  redraw,
}: {
  source: React.RefObject<HTMLCanvasElement | null>;
  redraw: React.RefObject<(() => void) | null>;
}) {
  const on = usePrefs((s) => s.data.tableStrip);
  const refs = useRef<(HTMLCanvasElement | null)[]>([]);
  useEffect(() => {
    if (!on) {
      redraw.current = null;
      return;
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const draw = () => {
      const src = source.current;
      if (!src) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      refs.current.forEach((c, i) => {
        if (!c) return;
        const px = Math.round(STRIP_SIZES[i] * dpr);
        if (c.width !== px) c.width = c.height = px;
        const x = c.getContext('2d');
        if (!x) return;
        x.clearRect(0, 0, px, px);
        x.imageSmoothingEnabled = true;
        x.imageSmoothingQuality = 'high';
        x.drawImage(src, 0, 0, px, px);
      });
    };
    redraw.current = () => {
      clearTimeout(timer);
      timer = setTimeout(draw, 140);
    };
    draw();
    return () => {
      clearTimeout(timer);
      redraw.current = null;
    };
  }, [on, source, redraw]);
  if (!on) return null;
  return (
    <figure
      className="checker m-0 flex flex-wrap items-end gap-4 rounded-md p-3"
      aria-label={S.tableStripLabel}
      data-testid="table-strip"
    >
      {STRIP_SIZES.map((s, i) => (
        <div key={s} className="flex flex-col items-center gap-1 text-xs text-muted">
          <canvas
            ref={(el) => {
              refs.current[i] = el;
            }}
            style={{ width: s, height: s }}
          />
          <span className="rounded-sm bg-surface/80 px-1">{s} px</span>
        </div>
      ))}
      <figcaption className="sr-only">{S.tableStrip}</figcaption>
    </figure>
  );
}

/** 遮罩（已經讀好的） */
function maskOf(t: TokenItem): Mask | null {
  return t.mask ? (peekMask(t.mask.id) ?? null) : null;
}

/* ---------- 工具列 ---------- */

function ToolBar({ disabled }: { disabled: boolean }) {
  const tool = usePrefs((s) => s.data.tool);
  const mode = usePrefs((s) => s.data.mode);
  const tolerance = usePrefs((s) => s.data.tolerance);
  const contiguous = usePrefs((s) => s.data.contiguous);
  const brush = usePrefs((s) => s.data.brush);
  const showOutline = usePrefs((s) => s.data.showOutline);
  const tableStrip = usePrefs((s) => s.data.tableStrip);
  const showFrame = usePrefs((s) => s.data.showFrame);
  const maskView = useUi((s) => s.maskView);
  const busy = useUi((s) => s.busy);
  const toast = useToast();
  const notify = (n: Awaited<ReturnType<typeof changeMask>>) => {
    if (n) toast({ title: n.title, description: n.description, tone: n.tone, replace: true });
  };
  const toolBtn = (id: ToolId, icon: React.ReactNode, keys: string) => (
    <Tooltip key={id} content={`${S.toolHints[id]}（${keys}）`}>
      <button
        type="button"
        aria-pressed={tool === id}
        data-tool={id}
        className={buttonClass('secondary', 'sm', undefined, tool === id)}
        onClick={() => setTool(id)}
      >
        {icon}
        {S.tools[id]}
      </button>
    </Tooltip>
  );
  const retune = useRef(0);
  /** 改容許度：拖曳中只換預覽、放開才存成一步；「只選相連的」直接重新選 */
  const live = (patch: { tolerance?: number; contiguous?: boolean }, final: boolean) => {
    setPrefs(patch);
    cancelAnimationFrame(retune.current);
    if (final) void retuneWand(true);
    else retune.current = requestAnimationFrame(() => void retuneWand(false));
  };
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div
        role="toolbar"
        aria-label={S.toolbarLabel}
        className="flex flex-wrap items-center gap-1.5"
      >
        {toolBtn('move', <Move aria-hidden className="size-4" />, 'V')}
        {toolBtn('wand', <Wand2 aria-hidden className="size-4" />, 'W')}
        {toolBtn('lasso', <Lasso aria-hidden className="size-4" />, 'L')}
        {toolBtn('brush', <Brush aria-hidden className="size-4" />, 'B')}
        <span className="mx-1 h-6 w-px bg-border" aria-hidden />
        <Button
          size="sm"
          variant="secondary"
          icon={<Sparkles />}
          disabled={disabled || !!busy}
          title={S.autoTitle}
          onClick={async () => notify(await runAuto())}
        >
          {S.auto}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<X />}
          disabled={disabled}
          title={S.clearTitle}
          onClick={async () => notify(await changeMask('clear'))}
        >
          {S.clear}
        </Button>
        <MenuButton
          label={S.more}
          menuLabel={S.moreLabel}
          disabled={disabled}
          data-testid="mask-menu"
          items={[
            { label: S.invert, onSelect: async () => notify(await changeMask('invert')) },
            { label: S.grow, onSelect: async () => notify(await changeMask('grow')) },
            { label: S.shrink, onSelect: async () => notify(await changeMask('shrink')) },
            { label: S.fill, onSelect: async () => notify(await changeMask('fill')) },
            {
              label: showOutline ? S.hideOutline : S.showOutline,
              onSelect: () => setPrefs({ showOutline: !showOutline }),
            },
            { label: maskView ? S.maskViewOff : S.maskViewOn, onSelect: toggleMaskView },
            {
              label: tableStrip ? S.tableStripOff : S.tableStripOn,
              onSelect: () => setPrefs({ tableStrip: !tableStrip }),
            },
            {
              label: showFrame ? S.hideFrame : S.showFrame,
              onSelect: () => setPrefs({ showFrame: !showFrame }),
            },
          ]}
        />
      </div>
      {tool === 'wand' ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="wand-options">
          <Segmented
            size="sm"
            aria-label={S.mode}
            value={mode}
            onValueChange={(v) => setPrefs({ mode: v })}
            options={[
              { value: 'add', label: S.modeAdd },
              { value: 'sub', label: S.modeSub },
            ]}
          />
          <div className="flex min-w-56 flex-1 items-center gap-2 text-sm" title={S.toleranceHint}>
            <span id="tm-tolerance" className="shrink-0 text-muted">
              {S.tolerance}
            </span>
            <Slider
              aria-labelledby="tm-tolerance"
              className="flex-1"
              value={tolerance}
              onChange={(v) => live({ tolerance: v }, false)}
              onCommit={(v) => live({ tolerance: v }, true)}
              min={RANGES.tolerance.min}
              max={RANGES.tolerance.max}
            />
          </div>
          <Toggle
            label={S.contiguous}
            checked={contiguous}
            onCheckedChange={(v) => live({ contiguous: v }, true)}
          />
        </div>
      ) : tool === 'lasso' ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="lasso-options">
          <Segmented
            size="sm"
            aria-label={S.mode}
            value={mode}
            onValueChange={(v) => setPrefs({ mode: v })}
            options={[
              { value: 'add', label: S.modeAdd },
              { value: 'sub', label: S.modeSub },
            ]}
          />
          <span className="text-xs text-muted">{S.lassoHint}</span>
        </div>
      ) : tool === 'brush' ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="brush-options">
          <Segmented
            size="sm"
            aria-label={S.mode}
            value={mode}
            onValueChange={(v) => setPrefs({ mode: v })}
            options={[
              {
                value: 'add',
                label: S.brushModeAdd,
                icon: <Brush aria-hidden className="size-3.5" />,
              },
              {
                value: 'sub',
                label: S.brushModeSub,
                icon: <Eraser aria-hidden className="size-3.5" />,
              },
            ]}
          />
          <div className="flex min-w-56 flex-1 items-center gap-2 text-sm">
            <span id="tm-brush" className="shrink-0 text-muted">
              {S.brushSize}
            </span>
            <Slider
              aria-labelledby="tm-brush"
              className="flex-1"
              value={brush}
              onChange={(v) => setPrefs({ brush: v })}
              min={RANGES.brush.min}
              max={RANGES.brush.max}
              unit="%"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatusLine({ token, mask }: { token: TokenItem | null; mask: Mask | null }) {
  const tool = usePrefs((s) => s.data.tool);
  const alt = useUi((s) => s.alt);
  const space = useUi((s) => s.space);
  const busy = useUi((s) => s.busy);
  const hint = useUi((s) => s.hint);
  const mode = usePrefs((s) => s.data.mode);
  if (!token?.image) return null;
  const m = alt ? (mode === 'add' ? 'sub' : 'add') : mode;
  const badge = space
    ? S.statusPan
    : tool === 'move'
      ? S.tools.move
      : S.statusBadge(
          S.tools[tool],
          tool === 'brush'
            ? m === 'add'
              ? S.brushModeAdd
              : S.brushModeSub
            : m === 'add'
              ? S.modeAdd
              : S.modeSub,
        );
  return (
    <div
      className="flex flex-wrap items-center gap-2 text-xs text-muted"
      data-testid="token-status"
    >
      <span
        className="rounded-sm border border-border px-1.5 py-0.5 text-fg"
        data-mode={tool === 'move' || space ? 'move' : m}
        data-testid="tool-badge"
      >
        {badge}
      </span>
      <span data-testid="selection-ratio">{selectionText(mask)}</span>
      <span role="status" className={busy ? 'text-accent' : undefined} data-testid="token-hint">
        {busy ?? hint ?? ''}
      </span>
    </div>
  );
}

/* ---------- 操作層 ---------- */

interface DragState {
  kind: 'pan' | 'pinch' | 'paint' | 'overlay' | 'lasso';
  tokenId: string;
  start: TokenView;
  cur: TokenView;
  /** 拖曳的是名字或徽章 */
  which?: OverlayKind;
}

function InteractionLayer({
  token,
  ready,
  info,
  paint,
  cursor,
  snap,
  lasso,
  keyCursor,
  onPaint,
  onHover,
}: {
  token: TokenItem;
  ready: boolean;
  info: React.RefObject<DrawInfo>;
  paint: React.RefObject<LivePaint | null>;
  cursor: React.RefObject<{ x: number; y: number } | null>;
  snap: React.RefObject<SnapInfo>;
  lasso: React.RefObject<LassoState | null>;
  keyCursor: React.RefObject<KeyCursor>;
  onPaint: () => void;
  onHover: () => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const g = useRef(createPointerGesture());
  const drag = useRef<DragState | null>(null);
  const tool = usePrefs((s) => s.data.tool);
  const space = useUi((s) => s.space);
  const [overOverlay, setOverOverlay] = useState(false);

  /** 指標下是名字還是徽章（移動工具時才拖得動） */
  const overlayHit = useCallback(
    (px: number, py: number): OverlayKind | null => {
      const ctx = measure();
      if (!ctx) return null;
      const s = useDoc.getState().data;
      const tk = s.tokens.find((t) => t.id === token.id) ?? null;
      return overlayAt(ctx, info.current.g, s.look, tk, px, py);
    },
    [info, token.id],
  );

  const local = useCallback((clientX: number, clientY: number) => {
    const r = el.current?.getBoundingClientRect();
    if (!r?.width) return { x: 0, y: 0, k: 1 };
    const k = N / r.width;
    return { x: (clientX - r.left) * k, y: (clientY - r.top) * k, k };
  }, []);

  /** 棋子上的點 → 遮罩的 px */
  const toMask = useCallback(
    (px: number, py: number) => {
      const t = info.current.t;
      const img = token.image;
      if (!t || !img) return null;
      const { u, v } = tokenToImage(t, img, px, py);
      const ms = maskSizeFor(img);
      return { x: (u * ms.width) / img.width, y: (v * ms.height) / img.height };
    },
    [info, token.image],
  );

  const endDrag = useCallback(() => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    if (d.kind === 'pan' || d.kind === 'pinch') {
      gesture.commit();
      useUi.setState({ lockedPad: null });
    } else if (d.kind === 'overlay') {
      gesture.commit();
      snap.current = null;
      onHover();
    }
  }, [snap, onHover]);

  const finishPaint = useCallback(async () => {
    const p = paint.current;
    if (!p) return;
    useUi.setState({ painting: false });
    /* 畫完：存成遮罩（一步復原）；存好之前預覽繼續用正在畫的那一份，不會閃 */
    useUi.setState({ liveMask: { tokenId: p.tokenId, mask: p.mask, version: p.version } });
    paint.current = null;
    try {
      await commitMask(p.tokenId, p.mask.data.some((v) => v > 0) ? p.mask : null);
    } finally {
      const lm = useUi.getState().liveMask;
      if (lm && lm.mask === p.mask) useUi.setState({ liveMask: null });
      useUi.setState({ wand: null });
    }
  }, [paint]);

  const cancelPaint = useCallback(() => {
    if (!paint.current) return;
    paint.current = null;
    useUi.setState({ painting: false });
    onPaint();
  }, [paint, onPaint]);

  const startPaint = useCallback(
    (px: number, py: number, forced?: SelectMode) => {
      const img = token.image;
      if (!img) return;
      const ms = maskSizeFor(img);
      const ui = useUi.getState();
      const base =
        (ui.liveMask && ui.liveMask.tokenId === token.id ? ui.liveMask.mask : null) ??
        (token.mask ? maskOf(token) : null) ??
        emptyMask(ms.width, ms.height);
      const prefs = usePrefs.getState().data;
      /* 筆刷半徑＝外框半徑 × 大小 %（換成遮罩的 px） */
      const t = info.current.t;
      if (!t) return;
      const radiusTokenPx = (prefs.brush / 100) * info.current.R;
      const mode: BrushMode = (forced ?? effectiveMode()) === 'add' ? 'restore' : 'erase';
      /*
       * 擦的時候半徑大 1 px（遮罩的 px）：畫的筆刷邊緣有 1 px 的半透明，同樣大小擦會留下最多 25% 的殘影；
       * 大 1 px 剛好把畫過的地方整個擦乾淨。
       */
      const diameter =
        Math.max(1, ((2 * radiusTokenPx) / t.scale) * (ms.width / img.width)) +
        (mode === 'erase' ? 2 : 0);
      const lp = new LivePaint(
        token.id,
        base.width === ms.width ? base : emptyMask(ms.width, ms.height),
        mode,
        diameter,
      );
      paint.current = lp;
      useUi.setState({ painting: true, wand: null });
      const m = toMask(px, py);
      if (m) lp.add(m.x, m.y);
      onPaint();
    },
    [token, info, paint, toMask, onPaint],
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0 && e.button !== 1) return;
    if (!ready) return;
    e.preventDefault();
    /* 剛滾過輪（還沒停下來算一步）：先結束那一步，這次拖曳才是新的一步 */
    flushBurst();
    const blurred = releaseFocus();
    el.current?.focus({ preventScroll: true });
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* 合成的指標事件沒有真的指標可以捕捉 */
    }
    if (!g.current.down(e.pointerId, e.clientX, e.clientY)) return;
    const p = local(e.clientX, e.clientY);
    const view = useDoc.getState().data.tokens.find((t) => t.id === token.id)?.view ?? token.view;
    const pad = useUi.getState().lockedPad ?? tokenPad(useDoc.getState().data.look, token);
    if (g.current.count() === 2) {
      /* 第二指：改成捏合縮放（畫到一半的一筆作廢、圈到一半的套索作廢、拖到一半的名字放下） */
      if (drag.current?.kind === 'paint') cancelPaint();
      if (drag.current?.kind === 'lasso') {
        lasso.current = null;
        drag.current = null;
        onHover();
      }
      if (drag.current?.kind === 'overlay') {
        /* 名字拖到哪就是哪一步（馬上結束，捏合是新的一步） */
        useDoc.endGesture();
        snap.current = null;
        drag.current = null;
        onHover();
      }
      if (!drag.current || drag.current.kind === 'paint' || drag.current.kind === 'lasso') {
        beginDrag(blurred, () => !!drag.current);
        useUi.setState({ lockedPad: pad });
      }
      const cur = drag.current?.cur ?? view;
      drag.current = { kind: 'pinch', tokenId: token.id, start: cur, cur };
      return;
    }
    const prefs = usePrefs.getState().data;
    const spaceDown = useUi.getState().space;
    if (prefs.tool === 'move' && !spaceDown && e.button === 0) {
      const which = overlayHit(p.x, p.y);
      if (which) {
        beginDrag(blurred, () => !!drag.current);
        const l = useDoc.getState().data.look;
        snap.current = {
          which,
          style: l.labelStyle,
          at: which === 'badge' ? [l.badgeX, l.badgeY] : [l.labelX, l.labelY],
        };
        drag.current = { kind: 'overlay', tokenId: token.id, start: view, cur: view, which };
        onHover();
        return;
      }
    }
    const panning = prefs.tool === 'move' || spaceDown || e.button === 1;
    if (panning) {
      beginDrag(blurred, () => !!drag.current);
      useUi.setState({ lockedPad: pad });
      drag.current = { kind: 'pan', tokenId: token.id, start: view, cur: view };
      return;
    }
    if (prefs.tool === 'wand') {
      const m = toMask(p.x, p.y);
      if (!m) return;
      void wandAt(m.x, m.y).then((n) => {
        useUi.setState({ hint: n?.title ?? null });
      });
      return;
    }
    if (prefs.tool === 'lasso') {
      const m = toMask(p.x, p.y);
      if (!m) return;
      /* Shift 或 Alt：去掉 */
      lasso.current = {
        tokenId: token.id,
        mode: e.shiftKey ? 'sub' : effectiveMode(),
        pts: [m],
        screen: [{ x: p.x, y: p.y }],
      };
      useUi.setState({ wand: null });
      drag.current = { kind: 'lasso', tokenId: token.id, start: view, cur: view };
      onHover();
      return;
    }
    drag.current = { kind: 'paint', tokenId: token.id, start: view, cur: view };
    startPaint(p.x, p.y);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = local(e.clientX, e.clientY);
    cursor.current = { x: p.x, y: p.y };
    const s = g.current.move(e.pointerId, e.clientX, e.clientY);
    const d = drag.current;
    if (!s || !d) {
      const t = usePrefs.getState().data.tool;
      if (t === 'brush') onHover();
      else if (t === 'move' && !useUi.getState().space) {
        const hit = !!overlayHit(p.x, p.y);
        if (hit !== overOverlay) setOverOverlay(hit);
      }
      return;
    }
    if (d.kind === 'overlay' && d.which) {
      const gm = info.current.g;
      const which = d.which;
      const style = useDoc.getState().data.look.labelStyle;
      const [x, y] = snapOverlay(
        which,
        style,
        (p.x - gm.c) / gm.R,
        (p.y - gm.c) / gm.R,
        useUi.getState().alt || e.altKey,
      );
      const r4 = (v: number) => Math.round(clamp(v, -1.2, 1.2) * 1e4) / 1e4;
      editLook((l) => {
        if (which === 'badge') {
          l.badgeX = r4(x);
          l.badgeY = r4(y);
        } else {
          l.labelX = r4(x);
          l.labelY = r4(y);
        }
      });
      snap.current = { which, style, at: [r4(x), r4(y)] };
      onHover();
      return;
    }
    const Rs = info.current.R / p.k;
    if (d.kind === 'pan' && s.kind === 'pan') {
      const v = { ...d.start, x: d.start.x + s.dx / Rs, y: d.start.y + s.dy / Rs };
      d.cur = v;
      setView(d.tokenId, v);
    } else if (s.kind === 'pinch' && d.kind === 'pinch') {
      const o = local(s.originX, s.originY);
      const ax = (o.x - N / 2) / info.current.R;
      const ay = (o.y - N / 2) / info.current.R;
      const z = zoomViewAt(d.start, d.start.zoom * s.scale, ax, ay);
      const v = { ...z, x: clamp(z.x + s.dx / Rs, -20, 20), y: clamp(z.y + s.dy / Rs, -20, 20) };
      d.cur = v;
      setView(d.tokenId, v);
    } else if (d.kind === 'paint' && s.kind === 'pan' && paint.current) {
      const m = toMask(p.x, p.y);
      if (m) {
        paint.current.add(m.x, m.y);
        onPaint();
      }
    } else if (d.kind === 'lasso' && lasso.current) {
      const m = toMask(p.x, p.y);
      const L = lasso.current;
      const last = L.pts[L.pts.length - 1];
      const ms = token.image ? maskSizeFor(token.image) : { width: 1 };
      /* 點太密時不加（遮罩的 px，長邊 600 分之一以上） */
      if (m && Math.hypot(m.x - last.x, m.y - last.y) >= Math.max(1, ms.width / 600)) {
        L.pts.push(m);
        L.screen.push({ x: p.x, y: p.y });
        onHover();
      }
    }
  };

  /** 放開套索：圈起來的範圍加入或去掉 */
  const finishLasso = () => {
    const L = lasso.current;
    lasso.current = null;
    onHover();
    if (!L || L.tokenId !== token.id) return;
    void lassoSelect(L.pts, L.mode).then((n) => {
      useUi.setState({ hint: n?.title ?? null });
    });
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    const rebased = g.current.up(e.pointerId);
    const d = drag.current;
    if (rebased && d) {
      /* 捏合變回一指：從目前的擺放接著拖 */
      if (d.kind === 'pinch') drag.current = { ...d, kind: 'pan', start: d.cur };
      return;
    }
    if (g.current.active()) return;
    if (d?.kind === 'paint') {
      drag.current = null;
      void finishPaint();
      return;
    }
    if (d?.kind === 'lasso') {
      drag.current = null;
      finishLasso();
      return;
    }
    endDrag();
  };

  const onPointerCancel = (e: ReactPointerEvent<HTMLDivElement>) => {
    g.current.up(e.pointerId);
    if (g.current.active()) return;
    if (drag.current?.kind === 'paint') {
      drag.current = null;
      cancelPaint();
      return;
    }
    if (drag.current?.kind === 'lasso') {
      drag.current = null;
      lasso.current = null;
      onHover();
      return;
    }
    endDrag();
  };

  /**
   * 鍵盤操作（token-workshop 的 keyboard cursor）：預覽有焦點、魔術棒或筆刷時，方向鍵移動游標（棋子的 1%，Shift 5%），
   * Enter 在游標的地方點魔術棒或蓋一下筆刷（Shift＋Enter 去掉）。其他按鍵交給快捷鍵（移動工具時方向鍵照樣移動圖片）。
   */
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const t = usePrefs.getState().data.tool;
    if ((t !== 'wand' && t !== 'brush') || useUi.getState().space) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const arrow = e.key.startsWith('Arrow');
    if (!arrow && e.key !== 'Enter') return;
    e.preventDefault();
    const kc = keyCursor.current;
    const at = kc.at ?? { x: N / 2, y: N / 2 };
    if (arrow) {
      const d = ((e.shiftKey ? 5 : 1) * N) / 100;
      at.x = clamp(at.x + (e.key === 'ArrowRight' ? d : e.key === 'ArrowLeft' ? -d : 0), 0, N);
      at.y = clamp(at.y + (e.key === 'ArrowDown' ? d : e.key === 'ArrowUp' ? -d : 0), 0, N);
    }
    kc.at = at;
    if (t === 'brush') cursor.current = { x: at.x, y: at.y };
    if (e.key === 'Enter' && ready) {
      const mode: SelectMode = e.shiftKey ? 'sub' : effectiveMode();
      if (t === 'wand') {
        const m = toMask(at.x, at.y);
        if (m)
          void wandAt(m.x, m.y, mode).then((n) => {
            useUi.setState({ hint: n?.title ?? null });
          });
      } else if (!paint.current) {
        startPaint(at.x, at.y, mode);
        void finishPaint();
      }
    }
    onHover();
  };

  /* 滾輪：移動工具（或按住空白鍵）時縮放圖片（Shift 旋轉、Alt 細調）；Ctrl＋滾輪留給預覽的縮放 */
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) return;
      const prefs = usePrefs.getState().data;
      if (prefs.tool !== 'move' && !useUi.getState().space) return;
      e.preventDefault();
      const dy = e.deltaY || e.deltaX;
      const p = local(e.clientX, e.clientY);
      const apply = () => {
        if (e.shiftKey) {
          wheelRotate(Math.sign(dy) * (e.altKey ? 1 : 5));
          return;
        }
        const factor = Math.exp(-dy * (e.altKey ? 0.0006 : Math.abs(dy) < 30 ? 0.01 : 0.0025));
        wheelZoom(factor, (p.x - N / 2) / info.current.R, (p.y - N / 2) / info.current.R);
      };
      /* 文字欄有焦點時：先讓它提交（它的手勢在 microtask 結束），再算這一次滾動，不會併成同一步 */
      if (releaseFocus()) queueMicrotask(apply);
      else apply();
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return () => node.removeEventListener('wheel', onWheel);
  }, [local, info]);

  /* 卸載或換棋子時收掉拖到一半的東西 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 換棋子時收尾
  useEffect(
    () => () => {
      g.current.reset();
      if (drag.current?.kind === 'paint') cancelPaint();
      else endDrag();
    },
    [token.id],
  );

  const cursorStyle =
    space || tool === 'move'
      ? drag.current?.kind === 'overlay' || (!space && overOverlay)
        ? 'move'
        : drag.current
          ? 'grabbing'
          : 'grab'
      : tool === 'brush'
        ? 'none'
        : 'crosshair';

  return (
    <div
      ref={el}
      role="application"
      aria-label={S.keyCursorLabel}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: 預覽可以用 Tab 移過來，用方向鍵與 Enter 操作（role＝application）
      tabIndex={0}
      data-testid="token-interaction"
      data-tool={space ? 'move' : tool}
      className="absolute inset-0 touch-none outline-none focus-visible:ring-2 focus-visible:ring-focus"
      style={{ cursor: cursorStyle }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onPointerLeave={() => {
        cursor.current = null;
        onHover();
      }}
      onKeyDown={onKeyDown}
      onFocus={() => {
        keyCursor.current.focused = true;
        onHover();
      }}
      onBlur={() => {
        keyCursor.current.focused = false;
        onHover();
      }}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
