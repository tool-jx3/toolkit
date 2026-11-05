/**
 * 畫筆：目前的圖塊（轉向、翻轉之後的樣子）、名稱、轉 90°、左右翻轉。
 * 選取工具有選取時改成「選取」：已選幾格、轉 90°、左右翻轉、刪除、取消選取。
 */
import { FlipHorizontal2, RotateCw, Trash2, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/ui';
import { spanOf, turnedSpan } from '../model/large';
import { drawThumb } from '../render/draw';
import { S } from '../strings';
import * as act from './actions';
import { useEditor } from './store';
import { imageFor, tileDef, useImages } from './tiles';

const PREVIEW = 96;

export function BrushPanel() {
  const tool = useEditor((s) => s.tool);
  const tile = useEditor((s) => s.tile);
  const r = useEditor((s) => s.r);
  const f = useEditor((s) => s.f);
  const selection = useEditor((s) => s.selection.length);
  const version = useImages((s) => s.version);
  const canvas = useRef<HTMLCanvasElement>(null);
  const def = tileDef(tile);
  const editingSel = tool === 'select' && selection > 0;

  // biome-ignore lint/correctness/useExhaustiveDependencies: 圖片讀好（version）時重畫
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(PREVIEW * dpr);
    c.height = Math.round(PREVIEW * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, PREVIEW, PREVIEW);
    const img = def && imageFor(def.src);
    if (def && img) drawThumb(ctx, def, img, PREVIEW, r, f);
  }, [def, r, f, version]);

  if (tool === 'move-map' || (tool === 'select' && !editingSel)) return null;
  if (!def && !editingSel) return null;
  const span = def ? turnedSpan(spanOf(def), r) : ([1, 1] as const);

  return (
    <section aria-labelledby="tm-brush" className="flex flex-col gap-2" data-testid="brush-panel">
      <h2 id="tm-brush" className="m-0 text-sm font-semibold">
        {editingSel ? S.brush.selection : S.brush.heading}
      </h2>
      {editingSel ? (
        <p className="m-0 text-sm" data-testid="selection-count">
          {S.brush.selectionCount(selection)}
        </p>
      ) : (
        <div className="flex items-center gap-3">
          <canvas
            ref={canvas}
            className="checker size-24 shrink-0 rounded-md border border-border"
            style={{ imageRendering: def?.pixel ? 'pixelated' : 'auto' }}
            aria-hidden
          />
          <div className="min-w-0 text-sm">
            <p className="m-0 font-medium break-words" data-testid="brush-name">
              {def?.name || S.brush.none}
            </p>
            <p className="m-0 text-xs text-muted tabular-nums">
              {S.brush.rotation(r * 90)}
              {f ? `・${S.brush.flip}` : ''}
              {span[0] > 1 || span[1] > 1 ? `・${S.brush.span(span[0], span[1])}` : ''}
            </p>
          </div>
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon={<RotateCw />} onClick={act.rotate} title="R">
          {S.brush.rotate}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<FlipHorizontal2 />}
          onClick={act.flip}
          aria-pressed={!editingSel ? f : undefined}
          title="F"
        >
          {S.brush.flip}
        </Button>
        {editingSel ? (
          <>
            <Button
              size="sm"
              variant="danger"
              icon={<Trash2 />}
              onClick={() => act.applySelection('delete')}
              title="Delete"
            >
              {S.brush.deleteSel}
            </Button>
            <Button size="sm" variant="ghost" icon={<X />} onClick={act.clearSelection} title="Esc">
              {S.brush.clearSel}
            </Button>
          </>
        ) : null}
      </div>
    </section>
  );
}
