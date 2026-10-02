/**
 * 圖片加工（F120～F130、3.3.4）：套用範圍、顏色與外觀、效果濾鏡、漸層、裁切（數字欄＋預覽上的裁切框）、翻轉、旋轉、
 * 取代原素材、製作（WebP 品質 0.9）、轉成動態圖。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Checkbox, ColorField, cn, Dialog, Segmented, Select, Slider, Toggle } from '@/ui';
import { updatePart } from '../actions';
import { Hint, Labeled, NumCell, Row, useNotify } from '../common';
import {
  dragGradientHandle,
  drawEditProcessed,
  EDIT_RANGES,
  type EditParams,
  editDefaults,
  type GradientDirection,
  gradientBarCss,
  makeEditedCanvas,
  noiseSeed,
  normalizeCrop,
  signCanvas,
} from '../edit';
import { canvasBlob, importFiles } from '../importer';
import { replaceImageRefs } from '../materials';
import { applyPending, type Notify, openFade } from '../ops';
import { assets, commit, goPage, type MakeContext, setSession, useProject } from '../store';
import { S } from '../strings';

/**
 * 製作加工結果並加入素材（F129）：名稱＝原名＋加工後綴、標籤沿用原圖；內容與既有素材相同時警告且不新增；
 * 勾「取代原素材」時所有引用改用新圖、新圖沿用舊名稱、舊素材從一覽移除（F128）。回傳新素材的名稱。
 */
export async function runEdit(name: string, q: EditParams, notify: Notify): Promise<string | null> {
  const m = useProject.getState().data.materials.find((x) => x.name === name);
  const blob = await assets.get(name);
  if (!m || !blob) {
    notify(S.editFailed, 'danger');
    return null;
  }
  const bmp = await createImageBitmap(blob);
  try {
    const cv = makeEditedCanvas(bmp, q, noiseSeed(name));
    if (!cv) {
      notify(S.editFailed, 'warning');
      return null;
    }
    signCanvas(cv);
    const out = await canvasBlob(cv, 'image/webp', 0.9);
    if (!out) {
      notify(S.editFailed, 'warning');
      return null;
    }
    const label = `${m.label}${S.editSuffix}`;
    const r = await importFiles([new File([out], `${label}.webp`, { type: 'image/webp' })], {
      label,
      tags: m.tags,
    });
    if (!r.added) {
      notify(S.editSame, 'warning');
      return null;
    }
    const newName = r.names[0];
    if (q.replace) {
      commit((d) => {
        replaceImageRefs(d, name, newName);
        const nm = d.materials.find((x) => x.name === newName);
        if (nm) nm.label = m.label;
        d.materials = d.materials.filter((x) => x.name !== name);
      });
      notify(S.editReplaced, 'success');
    } else notify(S.editDone, 'success');
    return newName;
  } finally {
    bmp.close();
  }
}

type CropKey = 'cropLeft' | 'cropRight' | 'cropTop' | 'cropBottom';

export function EditDialog({
  name,
  context,
  stayRoom,
}: {
  name: string;
  context: MakeContext;
  stayRoom?: string;
}) {
  const n = useNotify();
  const m = useProject((s) => s.data.materials.find((x) => x.name === name));
  const [q, setQ] = useState<EditParams>(editDefaults);
  const [bmp, setBmp] = useState<ImageBitmap | null>(null);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const W = bmp?.width ?? m?.width ?? 1;
  const H = bmp?.height ?? m?.height ?? 1;

  useEffect(() => {
    let alive = true;
    void assets.bitmap(name).then((b) => alive && setBmp(b ?? null));
    return () => {
      alive = false;
    };
  }, [name]);

  /* 即時預覽（最大約 900×600 的縮小版；F127） */
  useEffect(() => {
    const c = canvas.current;
    if (!c || !bmp) return;
    const k = Math.min(1, 900 / bmp.width, 600 / bmp.height);
    c.width = Math.max(1, Math.round(bmp.width * k));
    c.height = Math.max(1, Math.round(bmp.height * k));
    drawEditProcessed(c, bmp, q, noiseSeed(name));
  }, [bmp, q, name]);

  const set = (patch: Partial<EditParams>, key = '') =>
    setQ((cur) => normalizeCrop({ ...cur, ...patch }, W, H, key));
  const close = () => setSession({ modal: null });

  const make = async () => {
    setBusy(true);
    try {
      const out = await runEdit(name, q, n);
      if (!out) return;
      close();
      if (context.kind === 'picker') applyPending(out);
      else if (stayRoom && !q.replace)
        commit((d, c) => updatePart(d, stayRoom, { imageUrl: out }, c));
      else if (context.kind === 'material') goPage('materials');
    } finally {
      setBusy(false);
    }
  };

  const toFade = async () => {
    if (!bmp) return;
    const cv = makeEditedCanvas(bmp, q, noiseSeed(name));
    if (!cv) return;
    const png = await canvasBlob(cv, 'image/png');
    if (!png) return;
    openFade({ kind: 'edit' }, null, {
      blob: png,
      label: `${m?.label ?? ''}${S.editSuffix}`,
      width: cv.width,
      height: cv.height,
    });
    editReturn.current = { name, context, stayRoom };
  };

  /* 裁切框：拖曳移動、8 個控制點調整大小（與數字欄雙向連動） */
  const startCrop = (mode: string) => (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = box.current?.getBoundingClientRect();
    if (!rect) return;
    const sx = e.clientX;
    const sy = e.clientY;
    const q0 = q;
    const keepW = W - q0.cropLeft - q0.cropRight;
    const keepH = H - q0.cropTop - q0.cropBottom;
    const move = (ev: PointerEvent) => {
      const dx = ((ev.clientX - sx) / rect.width) * W;
      const dy = ((ev.clientY - sy) / rect.height) * H;
      if (mode === 'move') {
        const l = Math.round(Math.max(0, Math.min(W - keepW, q0.cropLeft + dx)));
        const t = Math.round(Math.max(0, Math.min(H - keepH, q0.cropTop + dy)));
        set({ cropLeft: l, cropRight: W - keepW - l, cropTop: t, cropBottom: H - keepH - t });
        return;
      }
      const patch: Partial<EditParams> = {};
      if (mode.includes('w')) patch.cropLeft = Math.round(q0.cropLeft + dx);
      if (mode.includes('e')) patch.cropRight = Math.round(q0.cropRight - dx);
      if (mode.includes('n')) patch.cropTop = Math.round(q0.cropTop + dy);
      if (mode.includes('s')) patch.cropBottom = Math.round(q0.cropBottom - dy);
      set(patch, mode);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const gradientDrag = (kind: 'start' | 'end' | 'mid') => (e: React.PointerEvent) => {
    e.preventDefault();
    const bar = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
    let moved = false;
    const move = (ev: PointerEvent) => {
      moved = true;
      setQ((cur) => dragGradientHandle(cur, kind, ((ev.clientX - bar.left) / bar.width) * 100));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (kind !== 'mid') setQ((cur) => ({ ...cur, gradientStop: kind }));
      void moved;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const rot = ((q.rotate % 360) + 360) % 360;
  const stop = q.gradientStop;
  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const slider = (k: keyof typeof EDIT_RANGES, unit: string) => (
    <Labeled key={k} label={S.editSliders[k]}>
      <Slider
        value={q[k] as number}
        min={EDIT_RANGES[k][0]}
        max={EDIT_RANGES[k][1]}
        unit={unit}
        onChange={(v) => set({ [k]: v })}
        aria-label={S.editSliders[k]}
      />
    </Labeled>
  );

  if (!m) return null;
  return (
    <Dialog
      open
      size="xl"
      title={S.editTitle(m.label, W, H)}
      dismissOnOutside={false}
      onOpenChange={(o) => {
        if (!o && !busy) close();
      }}
      footer={
        <>
          <Button onClick={() => void toFade()} disabled={busy}>
            {S.editToFade}
          </Button>
          <Button variant="primary" loading={busy} onClick={() => void make()}>
            {S.editGo}
          </Button>
        </>
      }
    >
      <div
        className="grid min-w-0 gap-3 lg:grid-cols-[minmax(0,1fr)_320px]"
        data-testid="edit-dialog"
      >
        <div className="flex min-w-0 items-center justify-center rounded-md bg-surface-2 p-2">
          <div
            ref={box}
            className="checker relative max-w-full overflow-hidden"
            style={{
              aspectRatio: `${W} / ${H}`,
              width: `min(100%, ${Math.round((420 * W) / H)}px)`,
            }}
          >
            <canvas
              ref={canvas}
              className="block size-full"
              style={{ transform: `rotate(${rot}deg)${q.flip ? ' scaleX(-1)' : ''}` }}
            />
            <div
              role="presentation"
              data-testid="crop-box"
              onPointerDown={startCrop('move')}
              className="absolute cursor-move border-2 border-accent shadow-[0_0_0_9999px_rgba(0,0,0,.35)]"
              style={{
                left: pct(q.cropLeft, W),
                top: pct(q.cropTop, H),
                width: pct(W - q.cropLeft - q.cropRight, W),
                height: pct(H - q.cropTop - q.cropBottom, H),
              }}
            >
              {['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'].map((h) => (
                <span
                  key={h}
                  role="presentation"
                  onPointerDown={startCrop(h)}
                  className="absolute size-3 rounded-sm border border-accent bg-surface"
                  style={{
                    left: h.includes('w')
                      ? -6
                      : h.includes('e')
                        ? 'calc(100% - 6px)'
                        : 'calc(50% - 6px)',
                    top: h.includes('n')
                      ? -6
                      : h.includes('s')
                        ? 'calc(100% - 6px)'
                        : 'calc(50% - 6px)',
                    cursor: `${h}-resize`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-3 text-sm">
          <Labeled label={S.editScope}>
            <Segmented
              size="sm"
              value={q.scope}
              onValueChange={(v) => set({ scope: v as EditParams['scope'] })}
              options={[
                { value: 'content', label: S.editScopes.content },
                { value: 'all', label: S.editScopes.all },
              ]}
            />
          </Labeled>
          <b>{S.editLook}</b>
          {slider('brightness', '%')}
          {slider('contrast', '%')}
          {slider('saturate', '%')}
          {slider('hue', '°')}
          {slider('opacity', '%')}
          {slider('blur', 'px')}
          {slider('noise', '%')}
          <b>{S.editFilters}</b>
          {slider('gray', '%')}
          {slider('sepia', '%')}
          <Row>
            <Labeled label={S.editFilterColor}>
              <ColorField value={q.filterColor} onChange={(v) => set({ filterColor: v })} />
            </Labeled>
          </Row>
          {slider('filterStrength', '%')}
          <Toggle
            checked={q.gradientOn}
            onCheckedChange={(v) => set({ gradientOn: v })}
            aria-label={S.editGradient}
            label={S.editGradient}
          />
          {q.gradientOn ? (
            <div className="flex flex-col gap-2" data-testid="gradient-editor">
              <Labeled label={S.editGradientDir}>
                <Select
                  aria-label={S.editGradientDir}
                  value={q.gradientDirection}
                  onValueChange={(v) => set({ gradientDirection: v as GradientDirection })}
                  options={(['top-bottom', 'bottom-top', 'left-right', 'right-left'] as const).map(
                    (v) => ({ value: v, label: S.editGradientDirs[v] }),
                  )}
                />
              </Labeled>
              <div
                className="checker relative h-6 rounded-sm border border-border"
                style={{ backgroundImage: gradientBarCss(q) }}
              >
                {(
                  [
                    ['start', q.gradientStartPosition, S.editGradientStart],
                    ['mid', q.gradientMidpoint, S.editGradientMid],
                    ['end', q.gradientEndPosition, S.editGradientEnd],
                  ] as const
                ).map(([k, pos, label]) => (
                  <button
                    key={k}
                    type="button"
                    aria-label={`${label} ${pos}%`}
                    onPointerDown={gradientDrag(k)}
                    onClick={() => k !== 'mid' && set({ gradientStop: k })}
                    className={cn(
                      'absolute -top-1 h-8 w-2.5 -translate-x-1/2 rounded-sm border border-fg bg-surface',
                      k === stop && 'bg-accent',
                      k === 'mid' && 'w-1.5 bg-surface-3',
                    )}
                    style={{ left: `${pos}%` }}
                  />
                ))}
              </div>
              <Row>
                <span className="text-xs">
                  {stop === 'start' ? S.editGradientStart : S.editGradientEnd}
                </span>
                <ColorField
                  value={stop === 'start' ? q.gradientStartColor : q.gradientEndColor}
                  onChange={(v) =>
                    set(stop === 'start' ? { gradientStartColor: v } : { gradientEndColor: v })
                  }
                />
                <Labeled label={S.editGradientOpacity}>
                  <NumCell
                    aria-label={S.editGradientOpacity}
                    value={stop === 'start' ? q.gradientStartOpacity : q.gradientEndOpacity}
                    min={0}
                    max={100}
                    onCommit={(v) =>
                      set(
                        stop === 'start'
                          ? { gradientStartOpacity: v ?? 0 }
                          : { gradientEndOpacity: v ?? 0 },
                      )
                    }
                  />
                </Labeled>
              </Row>
            </div>
          ) : null}
          <b>{S.editCrop}</b>
          <Row>
            {(['cropLeft', 'cropRight', 'cropTop', 'cropBottom'] as CropKey[]).map((k) => (
              <Labeled key={k} label={S.editCropSides[k]}>
                <NumCell
                  aria-label={`${S.editCrop}：${S.editCropSides[k]}`}
                  value={q[k]}
                  min={0}
                  className="w-16"
                  onCommit={(v) => set({ [k]: v ?? 0 }, k)}
                />
              </Labeled>
            ))}
          </Row>
          <Row>
            <Button size="sm" aria-pressed={q.flip} onClick={() => set({ flip: !q.flip })}>
              {S.editFlip(q.flip)}
            </Button>
            <Button size="sm" onClick={() => set({ rotate: (q.rotate + 90) % 360 })}>
              {S.editRotate(rot)}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setQ({ ...editDefaults(), replace: q.replace })}
            >
              {S.editReset}
            </Button>
          </Row>
          <Checkbox
            checked={q.replace}
            onCheckedChange={(v) => set({ replace: !!v })}
            aria-label={S.editReplace}
            label={S.editReplace}
          />
          <Hint>
            {W}×{H}
          </Hint>
        </div>
      </div>
    </Dialog>
  );
}

/** 從加工開啟的動態圖關閉後回到加工對話框 */
export const editReturn: {
  current: { name: string; context: MakeContext; stayRoom?: string } | null;
} = { current: null };

export function useEditMemo() {
  return useMemo(() => editReturn, []);
}
