/**
 * 綁定設定路徑（例如 'stroke.width'）的欄位：滑桿、選單、分段、開關、顏色、可留空的顏色。
 */
import type { ReactNode } from 'react';
import {
  ColorField,
  Field,
  Segmented,
  Select,
  type SelectGroup,
  type SelectOption,
  Slider,
  Toggle,
} from '@/ui';
import type { Settings } from './settings';
import { updateCfg, useTfx } from './store';

type Obj = Record<string, unknown>;

export function getPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((o, k) => (o == null ? undefined : (o as Obj)[k]), obj);
}

export function setPath(obj: unknown, path: string, value: unknown): void {
  const keys = path.split('.');
  let o = obj as Obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o[keys[i]] == null || typeof o[keys[i]] !== 'object') o[keys[i]] = {};
    o = o[keys[i]] as Obj;
  }
  o[keys[keys.length - 1]] = value;
}

/** 目前模式的設定 */
export const useCfg = (): Settings => useTfx((st) => st.data.modes[st.data.mode].s);

export const setCfg = (path: string, value: unknown): void =>
  updateCfg((s) => setPath(s, path, value));

export type Choice = readonly [string, string];

/** [值, 名稱] 或分組 → Select 的選項 */
export function toOptions(
  list: readonly (Choice | { label: string; items: readonly Choice[] })[],
): (SelectOption | SelectGroup)[] {
  return list.map((it) =>
    'items' in it
      ? { label: it.label, options: it.items.map(([value, label]) => ({ value, label })) }
      : { value: it[0], label: it[1] },
  );
}

interface Base {
  label: ReactNode;
  path: string;
  hint?: ReactNode;
  labelSuffix?: ReactNode;
}

export function NumField({
  label,
  path,
  hint,
  labelSuffix,
  min,
  max,
  step,
  unit,
  scale = 1,
  digits,
}: Base & {
  /** 顯示單位的最小、最大、步進 */
  min: number;
  max: number;
  step: number;
  unit?: string;
  /** 顯示值＝設定值 × scale（例如字距存 0.08，顯示 8%） */
  scale?: number;
  digits?: number;
}) {
  const cfg = useCfg();
  const raw = Number(getPath(cfg, path)) * scale;
  const p = digits ?? 0;
  const value = Number((Number.isFinite(raw) ? raw : 0).toFixed(Math.max(p, 4)));
  return (
    <Field label={label} hint={hint} labelSuffix={labelSuffix}>
      <Slider
        value={value}
        onChange={(v) => setCfg(path, Math.min(max, Math.max(min, v)) / scale)}
        min={min}
        max={max}
        step={step}
        unit={unit}
        precision={digits}
      />
    </Field>
  );
}

export function SelectField({
  label,
  path,
  hint,
  labelSuffix,
  options,
  onPick,
}: Base & {
  options: readonly (Choice | { label: string; items: readonly Choice[] })[];
  onPick?: (v: string) => void;
}) {
  const cfg = useCfg();
  return (
    <Field label={label} hint={hint} labelSuffix={labelSuffix}>
      <Select
        value={String(getPath(cfg, path) ?? '')}
        onValueChange={(v) => (onPick ? onPick(v) : setCfg(path, v))}
        options={toOptions(options)}
      />
    </Field>
  );
}

export function SegField({
  label,
  path,
  hint,
  options,
  parse = (v) => v,
}: Base & {
  options: readonly Choice[];
  parse?: (v: string) => unknown;
}) {
  const cfg = useCfg();
  return (
    <Field label={label} hint={hint}>
      <Segmented
        value={String(getPath(cfg, path))}
        onValueChange={(v) => setCfg(path, parse(v))}
        options={options.map(([value, l]) => ({ value, label: l }))}
        fullWidth
      />
    </Field>
  );
}

export const parseBool = (v: string): boolean => v === 'true';

export function ToggleField({ label, path, hint }: Base) {
  const cfg = useCfg();
  return (
    <Field label={label} hint={hint} layout="inline">
      <Toggle checked={!!getPath(cfg, path)} onCheckedChange={(on) => setCfg(path, on)} />
    </Field>
  );
}

export function ColorPathField({ label, path, hint }: Base) {
  const cfg = useCfg();
  return (
    <Field label={label} hint={hint}>
      <ColorField
        value={String(getPath(cfg, path) || '#ffffff')}
        onChange={(c) => setCfg(path, c)}
      />
    </Field>
  );
}

/** 可以「同某某」（空字串）的顏色：開關＋色欄 */
export function OptionalColorField({
  label,
  path,
  sameLabel,
  fallback,
  hint,
}: Base & { sameLabel: string; fallback: string }) {
  const cfg = useCfg();
  const v = String(getPath(cfg, path) || '');
  return (
    <Field label={label} hint={hint}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Toggle
          aria-label={sameLabel}
          label={sameLabel}
          checked={!v}
          onCheckedChange={(same) => setCfg(path, same ? '' : fallback)}
        />
        {v ? (
          <ColorField value={v} onChange={(c) => setCfg(path, c)} className="min-w-0 flex-1" />
        ) : null}
      </div>
    </Field>
  );
}
