/**
 * 預覽區：工具列（復原／重做、預覽背景、格線）、差分切換列（F53）、預覽（F47～F52）、差分縮圖（F54）、
 * 狀態列（F78）、匯出（F74～F76）。
 */
import { Download, FileArchive, Redo2, Undo2 } from 'lucide-react';
import {
  type KeyboardEvent,
  type PointerEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { suggestGridCells } from '@/ccfolia';
import { downloadBlob, pickFiles } from '@/core/files';
import { useUndoRedo } from '@/core/storage';
import {
  Button,
  Checkbox,
  cn,
  Field,
  IconButton,
  Notice,
  Select,
  Stage,
  TextInput,
  useStageScale,
  withShortcut,
} from '@/ui';
import { removeLayer, setCurrent, setPreviewBgImage, setTab } from './actions';
import { TextGestureScope } from './controls';
import { buildZip, exportName, renderPng, zipName } from './exporting';
import { ensureStateFonts } from './fonts';
import { DRAG_THRESHOLD, type HitBox, hitTest, lockAxis, virtualWidth } from './geometry';
import { BASE_H, currentItem, type FrameState } from './model';
import { drawGrid, drawSelection, render } from './render';
import { env, loadImageElements } from './runtime';
import { drawScenery, sceneryFor } from './scenery';
import {
  assets,
  edit,
  frameNow,
  gesture,
  PREVIEW_BGS,
  type PreviewBg,
  select,
  setStatus,
  useFrame,
  usePreview,
  useSession,
} from './store';
import { S } from './strings';

const round4 = (v: number) => Math.round(v * 10000) / 10000;

/** 預覽背景（範例風景或背景圖）畫到 ctx */
function paintBackground(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  bg: PreviewBg,
  state: FrameState,
  slotId: string | null,
  bgAsset: string | null,
): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  if (bg === 'scenery') drawScenery(ctx, w, h, sceneryFor(state.variants.enabled, slotId));
  else if (bg === 'image' && bgAsset) {
    const img = assets.peekBitmap(bgAsset);
    if (img) {
      const sc = Math.max(w / img.width, h / img.height);
      ctx.drawImage(
        img,
        (w - img.width * sc) / 2,
        (h - img.height * sc) / 2,
        img.width * sc,
        img.height * sc,
      );
    }
  }
}

/** 目前的位置（比例）：標籤在固定位置時取畫出來的中心 */
function itemPosition(
  state: FrameState,
  hits: HitBox[],
  id: string,
): { x: number; y: number } | null {
  if (id === 'indicator') {
    const label = state.variants.label;
    if (label.pos === 'free') return { x: label.x, y: label.y };
    const hit = hits.find((h) => h.id === id);
    return hit ? { x: hit.cx / virtualWidth(state.size), y: hit.cy / BASE_H } : null;
  }
  const layer = state.layers.find((l) => l.id === id);
  return layer ? { x: layer.x, y: layer.y } : null;
}

function moveItem(d: FrameState, id: string, x: number, y: number): void {
  if (id === 'indicator') {
    Object.assign(d.variants.label, { pos: 'free', x: round4(x), y: round4(y) });
    return;
  }
  const layer = d.layers.find((l) => l.id === id);
  if (layer) {
    layer.x = round4(x);
    layer.y = round4(y);
  }
}

interface Drag {
  id: string;
  pointer: number;
  p0: { x: number; y: number };
  start: { x: number; y: number };
  moved: boolean;
}

/** 預覽畫布（放在 Stage 裡；依實際顯示大小 × 裝置像素比畫，最多 2 倍） */
function PreviewCanvas({ slotId }: { slotId: string | null }) {
  const state = useFrame((st) => st.data);
  const pv = usePreview((st) => st.data);
  const selected = useSession((st) => st.selected);
  const tick = useSession((st) => st.tick);
  const scale = useStageScale();
  const bgRef = useRef<HTMLCanvasElement>(null);
  const fgRef = useRef<HTMLCanvasElement>(null);
  const hits = useRef<HitBox[]>([]);
  const drag = useRef<Drag | null>(null);
  const [cursor, setCursor] = useState<'move' | 'default'>('default');

  const dpr = Math.min(2, typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
  const W = Math.max(1, Math.round(state.size.w * scale * dpr));
  const H = Math.max(1, Math.round((W * state.size.h) / state.size.w));

  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 變了（圖片、字型讀好）也要重畫
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      const bg = bgRef.current;
      const fg = fgRef.current;
      if (!bg || !fg) return;
      for (const c of [bg, fg]) {
        if (c.width !== W || c.height !== H) {
          c.width = W;
          c.height = H;
        }
      }
      const bctx = bg.getContext('2d') as CanvasRenderingContext2D;
      paintBackground(bctx, W, H, pv.bg, state, slotId, pv.bgAsset);
      const ctx = fg.getContext('2d') as CanvasRenderingContext2D;
      hits.current = render(ctx, state, env, slotId, W, H);
      if (pv.grid) drawGrid(ctx, suggestGridCells(state.size.w, state.size.h), W, H);
      const hit = hits.current.find((h) => h.id === selected);
      if (hit) drawSelection(ctx, hit, H / BASE_H);
      fg.dataset.hits = JSON.stringify(hits.current);
      fg.dataset.rendered = String(Number(fg.dataset.rendered ?? 0) + 1);
    });
    return () => cancelAnimationFrame(raf);
  }, [state, pv.bg, pv.bgAsset, pv.grid, slotId, selected, W, H, tick]);

  const toVirtual = (e: { clientX: number; clientY: number }) => {
    const rect = fgRef.current?.getBoundingClientRect();
    if (!rect?.height) return { x: 0, y: 0 };
    const k = BASE_H / rect.height;
    return { x: (e.clientX - rect.left) * k, y: (e.clientY - rect.top) * k };
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    e.currentTarget.focus();
    const p = toVirtual(e);
    const hit = hitTest(hits.current, p.x, p.y);
    if (!hit) {
      if (useSession.getState().selected) select(null);
      return;
    }
    const start = itemPosition(frameNow(), hits.current, hit.id);
    if (!start) return;
    drag.current = { id: hit.id, pointer: e.pointerId, p0: p, start, moved: false };
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (useSession.getState().selected !== hit.id) {
      select(hit.id);
      setTab(hit.id === 'indicator' ? 'variants' : 'layers');
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    const p = toVirtual(e);
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) {
      setCursor(hitTest(hits.current, p.x, p.y) ? 'move' : 'default');
      return;
    }
    const VW = virtualWidth(frameNow().size);
    const [dx, dy] = lockAxis(p.x - d.p0.x, p.y - d.p0.y, e.shiftKey);
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      gesture.begin();
    }
    edit((s) => moveItem(s, d.id, d.start.x + dx / VW, d.start.y + dy / BASE_H));
  };

  const endDrag = (e: PointerEvent<HTMLCanvasElement>) => {
    const d = drag.current;
    if (!d || d.pointer !== e.pointerId) return;
    drag.current = null;
    if (d.moved) gesture.commit();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLCanvasElement>) => {
    const id = useSession.getState().selected;
    if (!id) return;
    const steps: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const step = steps[e.key];
    if (step) {
      e.preventDefault();
      const s = frameNow();
      const pos = itemPosition(s, hits.current, id);
      if (!pos) return;
      const n = e.shiftKey ? 10 : 1;
      const VW = virtualWidth(s.size);
      edit((d) => moveItem(d, id, pos.x + (step[0] * n) / VW, pos.y + (step[1] * n) / BASE_H));
    } else if ((e.key === 'Delete' || e.key === 'Backspace') && id !== 'indicator') {
      e.preventDefault();
      removeLayer(id);
    }
  };

  return (
    <>
      <canvas ref={bgRef} aria-hidden className="absolute inset-0 block size-full" />
      <canvas
        ref={fgRef}
        tabIndex={0}
        role="img"
        aria-label={S.preview.aria}
        data-testid="preview-canvas"
        className="absolute inset-0 block size-full touch-none outline-none focus-visible:ring-2 focus-visible:ring-(--focus)"
        style={{ cursor }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onKeyDown={onKeyDown}
      />
    </>
  );
}

/** F54：每個要匯出的差分的縮圖（寬 320 px），變更後約 0.2 秒重畫 */
function Thumbs({ current }: { current: string | null }) {
  const state = useFrame((st) => st.data);
  const bg = usePreview((st) => st.data.bg);
  const tick = useSession((st) => st.tick);
  const items = state.variants.items.filter((i) => i.on);
  const refs = useRef(new Map<string, HTMLCanvasElement>());
  const w = 320;
  const h = Math.max(1, Math.round((w * state.size.h) / state.size.w));
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 變了（圖片、字型讀好）也要重畫
  useEffect(() => {
    const t = setTimeout(() => {
      const frame = document.createElement('canvas');
      frame.width = w;
      frame.height = h;
      const fctx = frame.getContext('2d') as CanvasRenderingContext2D;
      for (const item of state.variants.items) {
        if (!item.on) continue;
        const c = refs.current.get(item.id);
        if (!c) continue;
        c.width = w;
        c.height = h;
        const ctx = c.getContext('2d') as CanvasRenderingContext2D;
        ctx.clearRect(0, 0, w, h);
        if (bg === 'scenery') drawScenery(ctx, w, h, sceneryFor(true, item.id));
        render(fctx, state, env, item.id, w, h);
        ctx.drawImage(frame, 0, 0);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [state, bg, w, h, tick]);
  return (
    <ul
      className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2 p-0"
      aria-label={S.variant.thumbsAria}
      data-testid="variant-thumbs"
    >
      {items.map((item) => (
        <li key={item.id}>
          <button
            type="button"
            aria-pressed={item.id === current}
            onClick={() => setCurrent(item.id)}
            className={cn(
              'flex w-full flex-col gap-1 rounded-md border p-1 text-left text-xs',
              item.id === current ? 'border-accent bg-accent-soft' : 'border-border bg-surface-2',
            )}
          >
            <canvas
              ref={(el) => {
                if (el) refs.current.set(item.id, el);
                else refs.current.delete(item.id);
              }}
              width={w}
              height={h}
              className="checker block h-auto w-full rounded-sm"
            />
            <span className="truncate text-fg">{item.name || S.variant.noName}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** 匯出前：字型載好、圖片解碼好 */
async function prepareExport(state: FrameState): Promise<void> {
  await ensureStateFonts(state);
  const ids = new Set<string>();
  for (const l of state.layers) if (l.kind === 'image') ids.add(l.asset);
  for (const i of state.variants.items) if (i.iconAsset) ids.add(i.iconAsset);
  await Promise.all([...ids].map((id) => assets.bitmap(id).catch(() => undefined)));
  await loadImageElements(ids);
}

function ExportRow() {
  const fileBase = useFrame((st) => st.data.fileBase);
  const enabled = useFrame((st) => st.data.variants.enabled);
  const exporting = useSession((st) => st.exporting);
  const run = useCallback(async (kind: 'png' | 'zip') => {
    if (useSession.getState().exporting) return;
    useSession.setState({ exporting: true });
    setStatus(S.status.exporting, 'progress');
    try {
      const state = frameNow();
      await prepareExport(state);
      if (kind === 'png') {
        const item = state.variants.enabled
          ? currentItem(state, usePreview.getState().data.current)
          : null;
        const blob = await renderPng(state, env, item?.id ?? null);
        const name = exportName(state, item);
        downloadBlob(blob, name);
        setStatus(S.status.saved(name, blob.size), 'success');
      } else {
        const { blob, count } = await buildZip(state, env);
        const name = zipName(state);
        downloadBlob(blob, name);
        setStatus(S.status.savedZip(count, name, blob.size), 'success');
      }
    } catch (e) {
      setStatus(S.status.exportFailed(e instanceof Error ? e.message : String(e)), 'danger');
    } finally {
      useSession.setState({ exporting: false });
    }
  }, []);
  return (
    <div
      className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-surface p-3"
      data-testid="export-row"
    >
      <TextGestureScope>
        <div className="min-w-40 flex-1">
          <Field label={S.export.fileName}>
            <TextInput
              value={fileBase}
              placeholder={S.export.defaultBase}
              onChange={(e) =>
                edit((d) => {
                  d.fileBase = e.target.value;
                })
              }
            />
          </Field>
        </div>
      </TextGestureScope>
      <Button
        variant="primary"
        icon={<Download />}
        loading={exporting}
        onClick={() => run('png')}
        data-testid="export-png"
      >
        {enabled ? S.export.pngVariant : S.export.png}
      </Button>
      {enabled ? (
        <Button
          icon={<FileArchive />}
          loading={exporting}
          onClick={() => run('zip')}
          data-testid="export-zip"
        >
          {S.export.zip}
        </Button>
      ) : null}
    </div>
  );
}

export function Preview() {
  const state = useFrame((st) => st.data);
  const pv = usePreview((st) => st.data);
  const status = useSession((st) => st.status);
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useFrame);
  const enabled = state.variants.enabled;
  const cur = currentItem(state, pv.current);
  const slotId = enabled ? (cur?.id ?? null) : null;
  const switchItems = useMemo(
    () => state.variants.items.filter((i) => i.on || i.id === cur?.id),
    [state.variants.items, cur?.id],
  );
  const bgKind = pv.bg === 'checker' ? 'checker' : pv.bg === 'light' ? 'light' : 'dark';
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2" data-testid="preview-toolbar">
        <IconButton
          label={withShortcut(S.preview.undo, 'mod+z')}
          icon={<Undo2 />}
          onClick={undo}
          disabled={!canUndo}
        />
        <IconButton
          label={withShortcut(S.preview.redo, 'mod+y')}
          icon={<Redo2 />}
          onClick={redo}
          disabled={!canRedo}
        />
        <Select<PreviewBg>
          aria-label={S.preview.bg}
          value={pv.bg}
          size="sm"
          className="w-32"
          onValueChange={(bg) => {
            if (bg === 'image' && !pv.bgAsset) {
              void pickFiles({ accept: 'image/*' }).then(([f]) => f && setPreviewBgImage(f));
              return;
            }
            usePreview.getState().patch({ bg });
          }}
          options={PREVIEW_BGS.map((b) => ({ value: b, label: S.preview.bgs[b] }))}
        />
        <Checkbox
          checked={pv.grid}
          onCheckedChange={(grid) => usePreview.getState().patch({ grid })}
          label={S.preview.grid}
        />
      </div>
      {enabled ? (
        <fieldset
          className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0"
          aria-label={S.variant.switchAria}
          data-testid="variant-switch"
        >
          {switchItems.map((item) => (
            <Button
              key={item.id}
              size="sm"
              variant={item.id === cur?.id ? 'primary' : 'secondary'}
              aria-pressed={item.id === cur?.id}
              onClick={() => setCurrent(item.id)}
            >
              {item.name || S.variant.noName}
            </Button>
          ))}
        </fieldset>
      ) : null}
      <Stage
        width={state.size.w}
        height={state.size.h}
        toolbar={false}
        fitUpscale
        backgroundArea="content"
        background={{ kind: bgKind }}
        maxViewportHeight="70dvh"
        aria-label={S.preview.aria}
      >
        <PreviewCanvas slotId={slotId} />
      </Stage>
      <ExportRow />
      {status.text ? (
        <Notice tone={status.tone} key={status.id}>
          <span data-testid="status">{status.text}</span>
        </Notice>
      ) : null}
      {enabled ? <Thumbs current={cur?.id ?? null} /> : null}
    </div>
  );
}
