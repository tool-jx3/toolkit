/**
 * 預覽：目前的設定畫在 canvas 上（和匯出同一段畫法、原始大小），下面是掃描檢查。
 * 畫好約 0.2 秒後在畫好的圖上取樣、讀回內容（core/qr 的 checkQrPixels），連續改設定時只檢查最後一次。
 */
import { useLayoutEffect, useMemo, useRef } from 'react';
import { create } from 'zustand';
import { useAssetImage } from '@/core/assets';
import { checkQrPixels, drawQrScene, type QrPixelCheck, type QrScene } from '@/core/qr';
import { IssueList, Notice, Stage } from '@/ui';
import { type CheckView, checkView } from './check';
import { buildQr, type QrBuild } from './render';
import { assets, useDoc } from './store';
import { S } from './strings';

/** 最後一次檢查（測試與狀態列用；pending＝等畫好） */
export const useCheck = create<{
  state: 'pending' | 'done' | 'none';
  result: QrPixelCheck | null;
  view: CheckView | null;
  /** 畫好的格子位置（原始大小；測試用） */
  grid: QrScene['grid'] | null;
}>(() => ({ state: 'pending', result: null, view: null, grid: null }));

const CHECK_DELAY = 200;

/** 目前的設定 → 場景（中間的圖讀不到時當成沒有圖） */
export function useQrBuild(): {
  built: QrBuild;
  image: ImageBitmap | null;
  imageStatus: ReturnType<typeof useAssetImage>['status'];
} {
  const d = useDoc((s) => s.data);
  const img = useAssetImage(assets, d.image?.id);
  const dims = d.image && img.status !== 'missing' ? d.image : null;
  const w = dims?.width ?? 0;
  const h = dims?.height ?? 0;
  /* 圖只看大小 */
  const built = useMemo(() => buildQr(d, w && h ? { width: w, height: h } : null), [d, w, h]);
  return { built, image: img.bitmap, imageStatus: img.status };
}

export function Preview() {
  const d = useDoc((s) => s.data);
  const { built, image, imageStatus } = useQrBuild();
  const canvas = useRef<HTMLCanvasElement>(null);
  const check = useCheck();

  useLayoutEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d', { willReadFrequently: true });
    if (!c || !ctx) return;
    if (!built.ok) {
      ctx.clearRect(0, 0, c.width, c.height);
      useCheck.setState({ state: 'none', result: null, view: null, grid: null });
      return;
    }
    drawQrScene(ctx, built.scene, { image: image ?? undefined });
    useCheck.setState({ grid: built.scene.grid });
    /* 圖還在讀：等讀好（重畫）再檢查 */
    if (imageStatus === 'loading') {
      useCheck.setState({ state: 'pending' });
      return;
    }
    useCheck.setState({ state: 'pending' });
    const doc = d;
    const t = setTimeout(() => {
      const { width, height } = c;
      const pixels = ctx.getImageData(0, 0, width, height).data;
      const hidden = built.scene.hidden;
      const result = checkQrPixels({
        pixels,
        width,
        height,
        grid: built.scene.grid,
        expected: built.code,
        skip: hidden
          ? (r, col) => r >= hidden.r0 && r < hidden.r1 && col >= hidden.c0 && col < hidden.c1
          : undefined,
      });
      useCheck.setState({ state: 'done', result, view: checkView(doc, built, result) });
    }, CHECK_DELAY);
    return () => clearTimeout(t);
  }, [built, image, imageStatus, d]);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      {!built.ok ? (
        <Notice tone="warning">
          <span data-testid="qr-error">{built.message}</span>
        </Notice>
      ) : null}
      {d.image && imageStatus === 'missing' ? (
        <Notice tone="warning">{S.imageMissing}</Notice>
      ) : null}
      <Stage width={d.width} height={d.height} aria-label={S.previewLabel}>
        <canvas
          ref={canvas}
          width={d.width}
          height={d.height}
          data-testid="qr-canvas"
          className="block size-full"
        />
      </Stage>
      <section
        aria-label={S.checkTitle}
        data-testid="qr-check"
        data-state={check.state === 'done' ? (check.view?.notice?.tone ?? 'none') : check.state}
        className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-surface p-3"
      >
        <h2 className="m-0 text-sm font-semibold">{S.checkTitle}</h2>
        {built.ok && check.state === 'done' && check.view ? (
          <IssueList
            aria-label={S.checkLabel}
            notice={check.view.notice}
            items={check.view.items}
          />
        ) : built.ok ? (
          <p className="m-0 text-sm text-muted">{S.checking}</p>
        ) : null}
        <p className="m-0 text-xs text-muted">{S.checkNote}</p>
      </section>
    </div>
  );
}
