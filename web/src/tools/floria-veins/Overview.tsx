/**
 * 全員（規格 F15）：所有的畫布照順序排在一起（和「全部排成一張」的匯出同一種排法），點一張打開。
 * 欄數依畫面寬度：一格至少約 18 px（手機一欄、寬畫面最多四欄）。
 */
import { useLayoutEffect, useRef, useState } from 'react';
import { paintTiled, tileCanvases } from './render';
import { selectCanvas, useDoc, usePrefs } from './store';
import { S } from './strings';

const MIN_CELL = 18;
const MIN_FONT = { label: 9, name: 12 };

export function Overview() {
  const canvases = useDoc((s) => s.data.canvases);
  const layers = usePrefs((s) => s.data.layers);
  const box = useRef<HTMLDivElement>(null);
  const ref = useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* 欄數：一格至少 MIN_CELL px；最多 4 欄 */
  const big = Math.max(...canvases.map((c) => c.size));
  const unit = big + 0.82 + 0.5;
  const cols = Math.max(
    1,
    Math.min(4, canvases.length, Math.floor(width / (unit * MIN_CELL)) || 1),
  );
  /* 先用 1 px 算出排好的寬度（格數），再換算成剛好填滿寬度的一格 px */
  const probe = tileCanvases(
    canvases.map((c) => c.size),
    100,
    cols,
  );
  const cell = width > 0 ? Math.max(8, (width / probe.width) * 100) : MIN_CELL;
  const tiled = tileCanvases(
    canvases.map((c) => c.size),
    cell,
    cols,
    MIN_FONT,
  );
  const scale = width > 0 && tiled.width > width ? width / tiled.width : 1;

  useLayoutEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !width) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(tiled.width * dpr);
    c.height = Math.round(tiled.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, tiled.width, tiled.height);
    paintTiled(ctx, canvases, tiled, layers, null);
  }, [canvases, layers, tiled, width]);

  return (
    <div ref={box} className="w-full" data-testid="overview">
      <div
        className="relative mx-auto"
        style={{ width: tiled.width * scale, height: tiled.height * scale }}
      >
        <canvas
          ref={ref}
          aria-hidden
          className="absolute inset-0 block size-full rounded-md"
          data-testid="overview-canvas"
        />
        <ul aria-label={S.canvas.overviewLabel} className="m-0 list-none p-0">
          {canvases.map((c, i) => {
            const r = tiled.rects[i];
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className="absolute cursor-pointer rounded-md border border-border bg-transparent outline-none hover:border-accent focus-visible:ring-2 focus-visible:ring-focus"
                  style={{
                    left: r.x * scale,
                    top: r.y * scale,
                    width: r.w * scale,
                    height: r.h * scale,
                  }}
                  aria-label={S.canvas.open(c.name || S.canvas.untitled)}
                  data-canvas-id={c.id}
                  onClick={() => {
                    selectCanvas(c.id);
                    /* 窄畫面時一覽很長：打開的畫布捲回畫面裡 */
                    requestAnimationFrame(() =>
                      document
                        .querySelector('[data-testid="board"]')
                        ?.scrollIntoView({ block: 'nearest' }),
                    );
                  }}
                />
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
