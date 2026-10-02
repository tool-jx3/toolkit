/**
 * 工具專用的小控制項：用途（三選一＋滑鼠提示）、格式（不支援的以虛線標示但仍可選）、字型（名稱用字型本身顯示）、
 * 選項縮圖的畫法（目前設定套上某個選項）。
 */
import { RadioGroup } from 'radix-ui';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  EXPORT_TARGETS,
  formatLimitBytes,
  TARGET_FORMAT_LABELS,
  TARGET_IDS,
  type TargetId,
} from '@/ccfolia';
import { FALLBACK_STACK, loadPreviewFont } from '@/core/fonts';
import { cn, Select, Tooltip, useFieldControl } from '@/ui';
import { useFontTick } from './fontTick';
import { type CutinFormat, type CutinSettings, FONTS, FORMATS } from './model';
import { buildScene, type CutinScene } from './scene';
import { S } from './strings';

/* ---------- 用途 ---------- */

export function TargetPicker({
  value,
  onChange,
}: {
  value: TargetId;
  onChange: (v: TargetId) => void;
}) {
  return (
    <RadioGroup.Root
      aria-label={S.targetLabel}
      value={value}
      onValueChange={(v) => onChange(v as TargetId)}
      className="grid grid-cols-3 gap-1.5"
    >
      {TARGET_IDS.map((id) => (
        <Tooltip key={id} content={S.targetNotes[id]}>
          <RadioGroup.Item
            value={id}
            data-target={id}
            className={cn(
              'flex min-h-10 min-w-0 items-center justify-center rounded-md border px-2 py-1.5 text-center text-xs leading-snug font-medium transition-colors',
              id === value
                ? 'border-accent bg-accent-soft text-fg ring-1 ring-accent'
                : 'border-border bg-surface-2 text-muted hover:border-accent hover:text-fg',
            )}
          >
            {S.targets[id]}
          </RadioGroup.Item>
        </Tooltip>
      ))}
    </RadioGroup.Root>
  );
}

/** 目前用途可用的格式、容量上限、預設尺寸（固定尺寸另外註明） */
export function TargetSummary({ target }: { target: TargetId }) {
  const t = EXPORT_TARGETS[target];
  const size = t.fixedSize ?? t.defaultSize;
  return (
    <p className="m-0 text-xs text-muted" data-testid="target-summary">
      {S.targetSummary(
        t.formats.map((f) => TARGET_FORMAT_LABELS[f]).join('、'),
        formatLimitBytes(t.maxBytes),
        `${size.width} × ${size.height}`,
      )}
      {t.fixedSize ? <span className="ml-1 font-medium text-fg">{S.targetFixed}</span> : null}
    </p>
  );
}

/* ---------- 格式 ---------- */

export function FormatPicker({
  value,
  target,
  onChange,
  ...rest
}: {
  value: CutinFormat;
  target: TargetId;
  onChange: (v: CutinFormat) => void;
  id?: string;
  'aria-labelledby'?: string;
}) {
  const field = useFieldControl(rest);
  const ok = EXPORT_TARGETS[target].formats;
  return (
    <RadioGroup.Root
      id={field.id}
      aria-labelledby={field['aria-labelledby']}
      aria-describedby={field['aria-describedby']}
      value={value}
      onValueChange={(v) => onChange(v as CutinFormat)}
      className="grid grid-cols-3 gap-1.5"
    >
      {FORMATS.map((f) => {
        const supported = ok.includes(f);
        return (
          <RadioGroup.Item
            key={f}
            value={f}
            data-unsupported={supported ? undefined : ''}
            aria-label={supported ? S.formats[f] : `${S.formats[f]}（${S.formatUnsupported}）`}
            className={cn(
              'flex min-w-0 flex-col items-center justify-center rounded-md border px-2 py-1.5 text-sm font-medium transition-colors',
              !supported && 'border-dashed text-muted',
              f === value
                ? 'border-accent bg-accent-soft ring-1 ring-accent'
                : 'border-border bg-surface-2 hover:border-accent',
              f === value && supported && 'text-fg',
            )}
          >
            <span>{S.formats[f]}</span>
            {supported ? null : <span className="text-xs font-normal">{S.formatUnsupported}</span>}
          </RadioGroup.Item>
        );
      })}
    </RadioGroup.Root>
  );
}

/* ---------- 字型 ---------- */

/** 字型名稱用字型本身顯示（只下載名稱用到的字；載入完成後才換） */
function FontName({ family, label }: { family: string; label: string }) {
  const [alias, setAlias] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void loadPreviewFont(family, label).then((a) => {
      if (alive) setAlias(a);
    });
    return () => {
      alive = false;
    };
  }, [family, label]);
  return (
    <span
      data-font-preview={alias ? family : undefined}
      style={alias ? { fontFamily: `"${alias}", ${FALLBACK_STACK}` } : undefined}
    >
      {label}
    </span>
  );
}

export function FontSelect({
  value,
  onChange,
  ...rest
}: {
  value: string;
  onChange: (id: string) => void;
  id?: string;
  'aria-labelledby'?: string;
}) {
  return (
    <Select
      {...rest}
      value={value}
      onValueChange={onChange}
      options={FONTS.map((f) => ({
        value: f.id,
        label: <FontName family={f.font.family} label={f.label} />,
      }))}
    />
  );
}

/* ---------- 選項縮圖 ---------- */

/** 縮圖畫布的像素（寬固定，高依畫布比例） */
export function thumbSize(s: Pick<CutinSettings, 'width' | 'height'>, w = 160) {
  const h = Math.max(24, Math.min(w * 2, Math.round((w * s.height) / s.width)));
  return { thumbWidth: w, thumbHeight: h };
}

/**
 * 選項縮圖的畫法：每個選項的縮圖是「目前設定套上這個選項」（不套用依用途的自動調整）。
 * 排版先快取（滑鼠停留時每格都會畫）；設定改變時延後一點再重排，不拖慢打字。
 */
export function useOptionThumbs<V extends string>(
  settings: CutinSettings,
  values: readonly V[],
  apply: (s: CutinSettings, v: V) => CutinSettings,
  thumbWidth: number,
): (ctx: CanvasRenderingContext2D, value: V, t: number) => void {
  const deferred = useDeferredValue(settings);
  const tick = useFontTick();
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 只用來在字型載好後重排；apply 是固定的函式
  const scenes = useMemo(() => {
    const m = new Map<V, CutinScene>();
    for (const v of values) m.set(v, buildScene(apply(deferred, v)));
    return m;
  }, [deferred, values, tick]);
  return useCallback(
    (ctx, value, t) => {
      const scene = scenes.get(value);
      if (!scene) return;
      const k = thumbWidth / scene.width;
      ctx.scale(k, k);
      scene.draw(ctx, t);
    },
    [scenes, thumbWidth],
  );
}
