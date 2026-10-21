/**
 * 歌詞演出風格的設定面板（lyric-fx 移植時新增）：照風格的 `controls`（`@/core/lyricfx` 的 LyricControlSection，純資料）
 * 產生區塊與控制項，所以新增一個風格不必寫介面；music-frame 之後併入歌詞演出時用同一個元件。
 *
 * ```tsx
 * <LyricStyleControls
 *   sections={style.controls}
 *   settings={settings}
 *   onChange={(patch, kind) => kind === 'live' ? gesture.live(apply)(patch) : kind === 'edit' ? edit(patch) : step(patch)}
 *   onCommit={gesture.commit}
 *   renderRegion={(c) => <MyRegionPicker />}
 *   userPresets={presets} onUserPresetsChange={setPresets}
 *   persistKey="lyric-fx:scatter"
 * />
 * ```
 *
 * - onChange 的 kind：'live'（滑桿、數字欄拖曳中；放開時 onCommit）、'edit'（顏色：連續的變更合成一步）、'step'（開關、選項、字型、預設：一次一步）。
 * - `when` 不成立的控制項不顯示（值保留）；`disabled` 回傳字串時停用並把字串當成說明。
 * - 配色預設：內建的按鈕＋使用者存的（由呼叫端保存；「存成預設」取名字、每個有刪除鈕）。
 * - 避開區域（kind 'region'）由呼叫端畫（renderRegion），通常要在預覽上框選。
 */
import { Plus, X } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import type { FontValue } from '@/core/fonts';
import type {
  ChoiceControl,
  FontControl,
  LyricControl,
  LyricControlSection,
  PresetsControl,
  RangeControl,
  RegionControl,
  SliderControl,
} from '@/core/lyricfx';
import { Button } from './Button';
import { ColorField } from './ColorField';
import { Dialog, DialogClose } from './Dialog';
import { Field, FieldRow } from './Field';
import { FontPicker } from './FontPicker';
import { NumberInput } from './NumberInput';
import { Section } from './Section';
import { Segmented } from './Segmented';
import { Select } from './Select';
import { Slider } from './Slider';
import { TextInput } from './TextInput';
import { Toggle } from './Toggle';
import { Tooltip } from './Tooltip';

export type LyricControlChange = 'live' | 'edit' | 'step';

export interface LyricUserPreset {
  name: string;
  values: Record<string, unknown>;
}

export interface LyricStyleControlsProps {
  sections: readonly LyricControlSection[];
  settings: Record<string, unknown>;
  onChange: (patch: Record<string, unknown>, kind: LyricControlChange) => void;
  /** 滑桿放開、數字欄確定 */
  onCommit?: () => void;
  renderRegion?: (control: RegionControl) => ReactNode;
  userPresets?: readonly LyricUserPreset[];
  onUserPresetsChange?: (list: LyricUserPreset[]) => void;
  /** 區塊展開狀態的鍵名前綴 */
  persistKey?: string;
  /** 第幾個區塊之後預設收合（預設 2：前兩個展開） */
  openSections?: number;
  disabled?: boolean;
}

const USER_PRESETS_MAX = 24;

function disabledOf(c: LyricControl, s: Record<string, unknown>): string | boolean {
  const d = c.disabled?.(s);
  return d ?? false;
}

function SliderRow({
  c,
  s,
  onChange,
  onCommit,
  disabled,
}: {
  c: SliderControl;
  s: Record<string, unknown>;
  onChange: LyricStyleControlsProps['onChange'];
  onCommit?: () => void;
  disabled: boolean;
}) {
  const v = Number(s[c.key] ?? c.min);
  return (
    <Slider
      value={v}
      min={c.min}
      max={c.max}
      step={c.step}
      unit={c.unit}
      precision={c.precision}
      disabled={disabled}
      onChange={(x) => onChange({ [c.key]: x }, 'live')}
      onCommit={() => onCommit?.()}
    />
  );
}

function RangeRow({
  c,
  s,
  onChange,
  onCommit,
  disabled,
}: {
  c: RangeControl;
  s: Record<string, unknown>;
  onChange: LyricStyleControlsProps['onChange'];
  onCommit?: () => void;
  disabled: boolean;
}) {
  const lo = Number(s[c.key] ?? c.min);
  const hi = Number(s[c.maxKey] ?? c.max);
  return (
    <FieldRow columns={2}>
      <Field label={c.labels.min}>
        <NumberInput
          value={lo}
          min={c.min}
          max={c.max}
          step={c.step}
          unit={c.unit}
          disabled={disabled}
          onChange={(x) => onChange({ [c.key]: x }, 'live')}
          onCommit={() => onCommit?.()}
        />
      </Field>
      <Field label={c.labels.max}>
        <NumberInput
          value={hi}
          min={c.min}
          max={c.max}
          step={c.step}
          unit={c.unit}
          disabled={disabled}
          onChange={(x) => onChange({ [c.maxKey]: x }, 'live')}
          onCommit={() => onCommit?.()}
        />
      </Field>
    </FieldRow>
  );
}

function ChoiceRow({
  c,
  s,
  onChange,
  disabled,
}: {
  c: ChoiceControl;
  s: Record<string, unknown>;
  onChange: LyricStyleControlsProps['onChange'];
  disabled: boolean;
}) {
  const cur = String(s[c.key]);
  const pick = (v: string) => {
    const o = c.options.find((x) => String(x.value) === v);
    if (o) onChange({ [c.key]: o.value }, 'step');
  };
  const options = c.options.map((o) => ({ value: String(o.value), label: o.label }));
  if (c.kind === 'select')
    return <Select value={cur} onValueChange={pick} options={options} disabled={disabled} />;
  return (
    <Segmented value={cur} onValueChange={pick} options={options} fullWidth disabled={disabled} />
  );
}

const SAME = 'same';
const OWN = 'own';

function FontRow({
  c,
  s,
  onChange,
  disabled,
}: {
  c: FontControl;
  s: Record<string, unknown>;
  onChange: LyricStyleControlsProps['onChange'];
  disabled: boolean;
}) {
  const v = s[c.key] as FontValue | null;
  if (c.nullLabel) {
    const fallback = (s.font as FontValue | undefined) ?? {
      source: 'google',
      family: 'Noto Sans TC',
      weight: 700,
    };
    return (
      <div className="flex min-w-0 flex-col gap-2">
        <Segmented
          value={v ? OWN : SAME}
          onValueChange={(x) => onChange({ [c.key]: x === OWN ? { ...fallback } : null }, 'step')}
          options={[
            { value: SAME, label: c.nullLabel },
            { value: OWN, label: '另選字型' },
          ]}
          fullWidth
          disabled={disabled}
        />
        {v ? (
          <FontPicker
            value={v}
            previewText={c.previewText}
            onChange={(f) => onChange({ [c.key]: f }, 'step')}
          />
        ) : null}
      </div>
    );
  }
  if (!v) return null;
  return (
    <FontPicker
      value={v}
      previewText={c.previewText}
      onChange={(f) => onChange({ [c.key]: f }, 'step')}
    />
  );
}

function Swatches({ values, keys }: { values: Record<string, unknown>; keys: readonly string[] }) {
  return (
    <span aria-hidden className="flex shrink-0 -space-x-1">
      {keys.map((k) => (
        <span
          key={k}
          className="size-3.5 rounded-full border border-border-strong"
          style={{ background: String(values[k] ?? 'transparent') }}
        />
      ))}
    </span>
  );
}

function PresetsRow({
  c,
  s,
  onChange,
  userPresets,
  onUserPresetsChange,
  disabled,
}: {
  c: PresetsControl;
  s: Record<string, unknown>;
  onChange: LyricStyleControlsProps['onChange'];
  userPresets: readonly LyricUserPreset[];
  onUserPresetsChange?: (list: LyricUserPreset[]) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const apply = (values: Record<string, unknown>) => {
    const patch: Record<string, unknown> = {};
    for (const k of c.keys) if (k in values) patch[k] = values[k];
    onChange(patch, 'step');
  };
  const current = Object.fromEntries(c.keys.map((k) => [k, s[k]]));
  const save = () => {
    const n = name.trim().slice(0, 20);
    if (!n || !onUserPresetsChange) return;
    const rest = userPresets.filter((p) => p.name !== n);
    onUserPresetsChange([...rest, { name: n, values: current }].slice(-USER_PRESETS_MAX));
    setOpen(false);
    setName('');
  };
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5" data-testid="lyric-presets">
      {c.builtins.map((p) => (
        <Button
          key={p.name}
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() => apply(p.values)}
          icon={<Swatches values={p.values} keys={c.keys} />}
        >
          {p.name}
        </Button>
      ))}
      {userPresets.map((p) => (
        <span key={p.name} className="inline-flex items-center">
          <Button
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={() => apply(p.values)}
            icon={<Swatches values={p.values} keys={c.keys} />}
            className="rounded-r-none"
          >
            {p.name}
          </Button>
          <Tooltip content={`刪除「${p.name}」`}>
            <button
              type="button"
              aria-label={`刪除「${p.name}」`}
              disabled={disabled}
              onClick={() => onUserPresetsChange?.(userPresets.filter((x) => x.name !== p.name))}
              className="focus-ring inline-flex h-8 items-center rounded-r-md border border-l-0 border-border-strong bg-surface-2 px-1.5 text-muted hover:bg-surface-3 hover:text-fg disabled:opacity-50"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          </Tooltip>
        </span>
      ))}
      {onUserPresetsChange ? (
        <Button
          size="sm"
          variant="ghost"
          icon={<Plus />}
          disabled={disabled || userPresets.length >= USER_PRESETS_MAX}
          onClick={() => setOpen(true)}
        >
          存成預設
        </Button>
      ) : null}
      <Dialog
        open={open}
        onOpenChange={setOpen}
        title="存成配色預設"
        description="記下目前的顏色，之後按一下就能套用（存在這個瀏覽器）。"
        size="sm"
        footer={
          <>
            <DialogClose>取消</DialogClose>
            <Button variant="primary" onClick={save} disabled={!name.trim()}>
              存成預設
            </Button>
          </>
        }
      >
        <Field label="名稱">
          <TextInput
            value={name}
            maxLength={20}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                save();
              }
            }}
          />
        </Field>
      </Dialog>
    </div>
  );
}

export function LyricStyleControls({
  sections,
  settings,
  onChange,
  onCommit,
  renderRegion,
  userPresets = [],
  onUserPresetsChange,
  persistKey,
  openSections = 2,
  disabled = false,
}: LyricStyleControlsProps) {
  const s = settings;
  const row = (c: LyricControl) => {
    if (c.when && !c.when(s)) return null;
    const d = disabledOf(c, s);
    const off = disabled || !!d;
    const hint = typeof d === 'string' ? d : c.hint;
    const key = `${c.kind}:${c.key}`;
    switch (c.kind) {
      case 'slider':
        return (
          <Field
            key={key}
            label={c.label}
            hint={hint}
            labelSuffix={
              c.format ? (
                <span className="font-mono text-xs text-muted">{c.format(Number(s[c.key]))}</span>
              ) : undefined
            }
          >
            <SliderRow c={c} s={s} onChange={onChange} onCommit={onCommit} disabled={off} />
          </Field>
        );
      case 'number':
        return (
          <Field key={key} label={c.label} hint={hint}>
            <NumberInput
              value={Number(s[c.key])}
              min={c.min}
              max={c.max}
              step={c.step}
              unit={c.unit}
              precision={c.precision}
              disabled={off}
              onChange={(x) => onChange({ [c.key]: x }, 'live')}
              onCommit={() => onCommit?.()}
            />
          </Field>
        );
      case 'range':
        return (
          <fieldset key={key} className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
            <legend className="mb-1 p-0 text-sm font-medium">{c.label}</legend>
            <RangeRow c={c} s={s} onChange={onChange} onCommit={onCommit} disabled={off} />
            {hint ? <p className="m-0 text-xs text-muted">{hint}</p> : null}
          </fieldset>
        );
      case 'toggle':
        return (
          <Field key={key} label={c.label} hint={hint} layout="inline">
            <Toggle
              checked={!!s[c.key]}
              disabled={off}
              onCheckedChange={(v) => onChange({ [c.key]: v }, 'step')}
            />
          </Field>
        );
      case 'color':
        return (
          <Field key={key} label={c.label} hint={hint}>
            <ColorField
              value={String(s[c.key] ?? '#000000')}
              disabled={off}
              onChange={(v) => onChange({ [c.key]: v }, 'edit')}
            />
          </Field>
        );
      case 'segmented':
      case 'select':
        return (
          <Field key={key} label={c.label} hint={hint}>
            <ChoiceRow c={c} s={s} onChange={onChange} disabled={off} />
          </Field>
        );
      case 'font':
        return (
          <Field key={key} label={c.label} hint={hint}>
            <FontRow c={c} s={s} onChange={onChange} disabled={off} />
          </Field>
        );
      case 'presets':
        return (
          <Field key={key} label={c.label} hint={hint}>
            <PresetsRow
              c={c}
              s={s}
              onChange={onChange}
              userPresets={userPresets}
              onUserPresetsChange={onUserPresetsChange}
              disabled={off}
            />
          </Field>
        );
      case 'region':
        return renderRegion ? (
          <Field key={key} label={c.label} hint={hint}>
            {renderRegion(c)}
          </Field>
        ) : null;
      default:
        return null;
    }
  };
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="lyric-style-controls">
      {sections.map((sec, i) => (
        <Section
          key={sec.id}
          title={sec.title}
          description={sec.description}
          defaultOpen={i < openSections}
          persistKey={persistKey ? `${persistKey}:${sec.id}` : undefined}
        >
          <div className="flex min-w-0 flex-col gap-3" data-section={sec.id}>
            {sec.controls.map(row)}
          </div>
        </Section>
      ))}
    </div>
  );
}
