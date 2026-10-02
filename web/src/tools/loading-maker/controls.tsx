/**
 * 這個工具的小控制項：滑桿欄、開關欄、色標清單（F74）、圖片組的載入區（F119、F122）、效果卡片的縮圖。
 */
import { Plus, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { drawVanish, type VanishKind } from '@/core/motion';
import { Button, ColorField, Field, FileDrop, IconButton, NumberInput, Slider, Toggle } from '@/ui';
import { insertStop, mixHex, removeStop, vanishColors } from './fill';
import { drawBar, drawLoop } from './render';
import {
  type BarStyle,
  type GradientStopSetting,
  type ImageSet,
  type LmSettings,
  type LoopStyle,
  MAX_STOPS,
  MIN_STOPS,
  type ProgressMode,
  RANGE,
  type VanishMode,
} from './settings';
import { S } from './strings';
import { evaluateSchedule, progressCurve } from './timing';

export function SliderField({
  label,
  value,
  onChange,
  range,
  input,
  step = 1,
  unit,
  hint,
  precision,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  range: readonly [number, number];
  input?: readonly [number, number];
  step?: number;
  unit?: string;
  hint?: ReactNode;
  precision?: number;
  disabled?: boolean;
}) {
  return (
    <Field label={label} hint={hint}>
      <Slider
        value={value}
        onChange={onChange}
        min={range[0]}
        max={range[1]}
        step={step}
        unit={unit}
        precision={precision}
        inputMin={input?.[0]}
        inputMax={input?.[1]}
        disabled={disabled}
      />
    </Field>
  );
}

export function ToggleField({
  label,
  checked,
  onChange,
  hint,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: ReactNode;
}) {
  return (
    <Field label={label} layout="inline" hint={hint}>
      <Toggle checked={checked} onCheckedChange={onChange} />
    </Field>
  );
}

export function ColorRow({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
}) {
  return (
    <Field label={label} hint={hint}>
      <ColorField value={value} onChange={(c) => onChange(c.slice(0, 7))} />
    </Field>
  );
}

/* ---------- 色標清單（F74） ---------- */

/**
 * 漸層色標：每列顏色、位置（0～100，0.5）、刪除；新增插在間隔最大的兩色標正中間（中間色）；
 * 2～7 個，滿了新增停用、剩 2 個時不能刪。位置在離開欄位時重新排序。
 */
export function StopList({
  value,
  onChange,
}: {
  value: readonly GradientStopSetting[];
  onChange: (stops: GradientStopSetting[]) => void;
}) {
  const sorted = [...value].sort((a, b) => a.pos - b.pos);
  const css = `linear-gradient(90deg, ${sorted.map((s) => `${s.color} ${s.pos}%`).join(', ')})`;
  const set = (i: number, patch: Partial<GradientStopSetting>) =>
    onChange(value.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  return (
    <div className="flex flex-col gap-2" data-testid="stop-list">
      <div
        aria-hidden
        className="h-4 rounded-sm border border-border-strong"
        style={{ background: css }}
      />
      <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
        {value.map((s, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 色標沒有 id，依位置對應
          <li key={i} className="flex min-w-0 items-center gap-2" data-testid="stop-row">
            <span className="w-4 shrink-0 text-xs text-muted tabular-nums">{i + 1}</span>
            <ColorField
              aria-label={S.bar.stopColor(i + 1)}
              value={s.color}
              onChange={(c) => set(i, { color: c.slice(0, 7) })}
            />
            <NumberInput
              aria-label={S.bar.stopPos(i + 1)}
              value={s.pos}
              onChange={(pos) => set(i, { pos })}
              onCommit={() => onChange([...value].sort((a, b) => a.pos - b.pos))}
              min={RANGE.stopPos[0]}
              max={RANGE.stopPos[1]}
              step={0.5}
              unit="%"
              className="w-24"
            />
            <IconButton
              label={S.bar.stopRemove(i + 1)}
              icon={<Trash2 />}
              size="sm"
              variant="ghost"
              disabled={value.length <= MIN_STOPS}
              onClick={() => onChange(removeStop(value, i))}
            />
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          icon={<Plus />}
          disabled={value.length >= MAX_STOPS}
          onClick={() => onChange(insertStop(value))}
        >
          {S.bar.stopAdd}
        </Button>
        <span className="text-xs text-muted tabular-nums" data-testid="stop-count">
          {S.bar.stopsCount(value.length, MAX_STOPS)}
        </span>
      </div>
    </div>
  );
}

/* ---------- 圖片組（F119、F122） ---------- */

export function ImageSetDrop({
  label,
  set,
  onFiles,
  onRemove,
  emptyHint,
  testId,
}: {
  label: string;
  set: ImageSet | null;
  onFiles: (files: File[]) => void;
  onRemove: () => void;
  emptyHint: string;
  testId: string;
}) {
  return (
    <div className="flex flex-col gap-2" data-testid={testId}>
      <FileDrop
        aria-label={label}
        label={S.row.dropLabel}
        buttonLabel={S.row.dropButton}
        hint={S.row.dropHint}
        accept="image/png,image/jpeg,image/webp,image/avif,image/bmp,image/gif"
        multiple
        clickable
        compact
        paste="off"
        filterByAccept={false}
        onFiles={onFiles}
      />
      <div className="flex min-w-0 items-start gap-2 text-xs">
        <div className="min-w-0 flex-1" data-testid={`${testId}-info`}>
          <p className="m-0 font-medium text-fg">
            {set ? S.row.setInfo(set.ids.length) : S.row.setEmpty}
          </p>
          <p className="m-0 break-all text-muted">{set ? namesLine(set.names, 3) : emptyHint}</p>
        </div>
        {set ? (
          <Button size="sm" variant="ghost" icon={<Trash2 />} onClick={onRemove}>
            {S.row.removeAll}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export const namesLine = (names: readonly string[], shown: number): string => {
  const head = names.slice(0, shown).join('、');
  return names.length > shown ? `${head}，另外 ${names.length - shown} 個` : head;
};

/* ---------- 效果卡片的縮圖 ---------- */

/** 縮圖用的小畫布設定（160 × 90，讀取動畫在中央） */
function thumbSettings(s: LmSettings, W: number, H: number): LmSettings {
  return {
    ...s,
    canvas: { ...s.canvas, width: W, height: H, transparent: true },
    loader: { ...s.loader, x: 50, y: 50, glow: false },
    bar: { ...s.bar, width: 78, height: 20, mode: 'linear', start: 0, end: 100, percent: false },
    loop: { ...s.loop, radius: 100, size: 30 },
    duration: 1,
  };
}

/** 條的樣式卡片：以目前的顏色從 0% 跑到 100% */
export const drawBarThumb =
  (s: LmSettings) => (ctx: CanvasRenderingContext2D, style: BarStyle, t: number) => {
    const { width: W, height: H } = ctx.canvas;
    ctx.clearRect(0, 0, W, H);
    const m = thumbSettings(s, W, H);
    drawBar(ctx, { ...m, bar: { ...m.bar, style, segments: 6 } }, t);
  };

/** 進度方式卡片：曲線圖＋沿時間走的點 */
export const drawModeThumb =
  (s: LmSettings) => (ctx: CanvasRenderingContext2D, mode: ProgressMode, t: number) => {
    const { width: W, height: H } = ctx.canvas;
    ctx.clearRect(0, 0, W, H);
    const pad = 12;
    const end = s.bar.keys[s.bar.keys.length - 1]?.time || 1;
    const f =
      mode === 'keyframes'
        ? (u: number) => evaluateSchedule(s.bar.keys, u * end, s.loader.seed) / 100
        : progressCurve(mode, s.loader.seed);
    ctx.strokeStyle = 'rgba(127,127,127,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(pad, pad, W - pad * 2, H - pad * 2);
    ctx.strokeStyle = s.loader.fillColor;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let i = 0; i <= 80; i++) {
      const u = i / 80;
      const x = pad + u * (W - pad * 2);
      const y = H - pad - f(u) * (H - pad * 2);
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
    }
    ctx.stroke();
    ctx.fillStyle = mixHex(s.loader.fillColor, '#ffffff', 0.4);
    ctx.beginPath();
    ctx.arc(pad + t * (W - pad * 2), H - pad - f(t) * (H - pad * 2), 4, 0, Math.PI * 2);
    ctx.fill();
  };

/** 結尾動作卡片：已填滿的小進度條依結尾動作消失 */
export const drawVanishThumb =
  (s: LmSettings) => (ctx: CanvasRenderingContext2D, kind: VanishMode, t: number) => {
    const { width: W, height: H } = ctx.canvas;
    ctx.clearRect(0, 0, W, H);
    const src = new OffscreenCanvas(W, H);
    const sctx = src.getContext('2d');
    if (!sctx) return;
    const m = thumbSettings(s, W, H);
    drawBar(sctx, { ...m, bar: { ...m.bar, shimmer: false } }, 1);
    /* 前 25% 停住、後 75% 是結尾動作 */
    const p = Math.max(0, (t - 0.25) / 0.75);
    if (kind === 'none' || p <= 0) ctx.drawImage(src, 0, 0);
    else
      drawVanish(ctx, src, W, H, kind as VanishKind, p, {
        intensity: s.bar.intensity,
        seed: s.loader.seed,
        colors: vanishColors(s),
      });
  };

/** 循環動畫的組成圖形卡片 */
export const drawLoopThumb =
  (s: LmSettings) => (ctx: CanvasRenderingContext2D, style: LoopStyle, t: number) => {
    const { width: W, height: H } = ctx.canvas;
    ctx.clearRect(0, 0, W, H);
    const m = thumbSettings(s, W, H);
    drawLoop(ctx, { ...m, loop: { ...m.loop, style, count: 8, speed: 1 } }, t);
  };
