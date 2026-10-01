/**
 * 編輯畫面的設定：文字欄（常駐）、外觀／動態／匯出三個分頁。
 * 標「進階」的項目只有打開「顯示進階設定」才出現（記在瀏覽器裡）。
 */
import { useCallback } from 'react';
import { DISCORD_DARK_BG, EXPORT_TARGETS, formatLimitBytes } from '@/ccfolia';
import { LOOP_FX_PARAMS, type LoopFxParam } from '@/core/fxlayers';
import {
  Button,
  Checkbox,
  ColorField,
  cn,
  Field,
  FieldRow,
  NumberInput,
  Section,
  Segmented,
  Select,
  Show,
  Slider,
  TextArea,
  ThumbChoice,
  useAdvancedMode,
} from '@/ui';
import { FontSelect, FormatPicker, thumbSize, useOptionThumbs } from './controls';
import {
  hasFillLayer,
  hasOutlineLayer,
  PALETTE_IDS,
  type PaletteId,
  paletteOf,
  pickerColor,
  STYLE_IDS,
  type StyleId,
} from './looks';
import {
  applySizePreset,
  type CutinSettings,
  charCount,
  FX_CHOICES,
  type FxChoice,
  LIMITS,
  lookWarnings,
  MOTION_KINDS,
  type MotionKind,
  SIZE_PRESETS,
  selectFx,
  selectMotion,
  selectPalette,
  selectStyle,
  suggestedCharCount,
  TOOL_ID,
} from './model';
import { setSettings, useSettings } from './store';
import { S } from './strings';

const useS = () => useSettings((st) => st.data);
const set = (patch: Partial<CutinSettings>) => setSettings((s) => ({ ...s, ...patch }));

/** 數值顯示：最多三位小數 */
const fmt3 = (v: number) => String(Number(v.toFixed(3)));

/* ---------- 文字（F10、F11） ---------- */

export function TextField() {
  const s = useS();
  const n = charCount(s.text);
  const max = suggestedCharCount(s);
  const over = n > max;
  return (
    <Field
      label={S.textLabel}
      labelSuffix={
        <span
          data-testid="char-count"
          data-over={over ? '' : undefined}
          className={cn('tabular-nums', over ? 'font-medium text-warning' : 'text-muted')}
          title={over ? S.charCountHint : undefined}
        >
          {S.charCount(n, max)}
        </span>
      }
    >
      <TextArea
        value={s.text}
        onChange={(e) => set({ text: e.target.value })}
        placeholder={S.textPlaceholder}
        rows={2}
        spellCheck={false}
      />
    </Field>
  );
}

/* ---------- 外觀（F12～F21） ---------- */

const STYLE_OPTIONS = STYLE_IDS.map((id) => ({ value: id, label: S.styles[id] }));
const PALETTE_OPTIONS = PALETTE_IDS.map((id) => ({ value: id, label: S.palettes[id] }));

export function LookPanel() {
  const s = useS();
  const [advanced] = useAdvancedMode(TOOL_ID);
  const thumb = thumbSize(s);
  const drawStyle = useOptionThumbs<StyleId>(s, STYLE_IDS, selectStyle, thumb.thumbWidth);
  const drawPalette = useOptionThumbs<PaletteId>(s, PALETTE_IDS, selectPalette, thumb.thumbWidth);
  const warnings = lookWarnings(s);
  const palette = paletteOf(s.palette);
  const showBackground = advanced || s.style === 'knockout';
  return (
    <div className="flex flex-col gap-4 pt-3">
      <Field label={S.fontLabel}>
        <FontSelect value={s.font} onChange={(font) => set({ font })} />
      </Field>
      <Field label={S.styleLabel}>
        <ThumbChoice
          options={STYLE_OPTIONS}
          value={s.style}
          onValueChange={(v) => setSettings((cur) => selectStyle(cur, v))}
          draw={drawStyle}
          {...thumb}
          minItemWidth={84}
          frames={s.frames}
          fps={s.fps}
        />
      </Field>
      {warnings.length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0" data-testid="look-warnings">
          {warnings.map((w) => (
            <li key={w} className="rounded-md bg-warning-soft px-2.5 py-1.5 text-sm text-warning">
              {w === 'dark-style' ? S.warnDarkStyle : S.warnKnockout}
            </li>
          ))}
        </ul>
      ) : null}
      <Field label={S.paletteLabel}>
        <ThumbChoice
          options={PALETTE_OPTIONS}
          value={s.palette}
          onValueChange={(v) => setSettings((cur) => selectPalette(cur, v))}
          draw={drawPalette}
          {...thumb}
          minItemWidth={84}
          frames={s.frames}
          fps={s.fps}
        />
      </Field>
      <Show when={advanced && hasFillLayer(s.style)}>
        <Field label={S.textColorLabel} hint={S.textColorHint}>
          <ColorField
            value={s.textColor ?? (s.style === 'neon' ? '#ffffff' : pickerColor(palette.fill))}
            onChange={(textColor) => set({ textColor })}
          />
        </Field>
      </Show>
      <Show when={advanced && hasOutlineLayer(s.style)}>
        <Field label={S.outlineColorLabel} hint={S.outlineColorHint}>
          <ColorField
            value={
              s.outlineColor ?? pickerColor(s.style === 'neon' ? palette.fill : palette.outline1)
            }
            onChange={(outlineColor) => set({ outlineColor })}
          />
        </Field>
      </Show>
      <Show when={showBackground}>
        <BackgroundField />
      </Show>
      <Show when={advanced}>
        <Section title={S.layoutSection} persistKey="cutin:layout">
          <Field label={S.textScaleLabel} hint={S.textScaleHint}>
            <Slider
              value={s.textScale}
              onChange={(textScale) => set({ textScale })}
              {...LIMITS.textScale}
            />
          </Field>
          <Field label={S.leadingLabel}>
            <Slider
              value={s.leading}
              onChange={(leading) => set({ leading })}
              {...LIMITS.leading}
            />
          </Field>
          <Field label={S.trackingLabel}>
            <Slider
              value={s.tracking}
              onChange={(tracking) => set({ tracking })}
              {...LIMITS.tracking}
            />
          </Field>
        </Section>
      </Show>
    </div>
  );
}

/** 背景（F18）：透明、單色、彩虹；挖空時即使沒開進階也顯示 */
function BackgroundField() {
  const s = useS();
  const hint =
    s.background === 'transparent'
      ? S.backgroundTransparentHint
      : s.background === 'palette'
        ? S.backgroundPaletteHint
        : undefined;
  return (
    <div className="flex flex-col gap-2" data-testid="background-field">
      <Field label={S.backgroundLabel} hint={hint}>
        <Segmented
          value={s.background}
          onValueChange={(background) => set({ background })}
          options={(['transparent', 'solid', 'rainbow'] as const).map((v) => ({
            value: v,
            label: S.backgrounds[v],
          }))}
          fullWidth
        />
      </Field>
      <Show when={s.background === 'solid'}>
        <Field label={S.backgroundColorLabel}>
          <ColorField value={s.bgColor} onChange={(bgColor) => set({ bgColor })} />
        </Field>
      </Show>
    </div>
  );
}

/* ---------- 動態（F22～F26） ---------- */

const FX_OPTIONS = FX_CHOICES.map((v) => ({
  value: v,
  label: v === 'none' ? S.fxNone : S.fxNames[v],
}));

export function MotionPanel() {
  const s = useS();
  const [advanced] = useAdvancedMode(TOOL_ID);
  const thumb = thumbSize(s);
  const drawFx = useOptionThumbs<FxChoice>(s, FX_CHOICES, selectFx, thumb.thumbWidth);
  const rotate = s.motion === 'rotate';
  return (
    <div className="flex flex-col gap-4 pt-3">
      <Field label={S.fxLabel}>
        <ThumbChoice
          options={FX_OPTIONS}
          value={s.fx}
          onValueChange={(v) => setSettings((cur) => selectFx(cur, v))}
          draw={drawFx}
          {...thumb}
          minItemWidth={84}
          frames={s.frames}
          fps={s.fps}
        />
      </Field>
      <Field label={S.motionLabel}>
        <Select<MotionKind>
          value={s.motion}
          onValueChange={(v) => setSettings((cur) => selectMotion(cur, v))}
          options={MOTION_KINDS.map((v) => ({ value: v, label: S.motions[v] }))}
        />
      </Field>
      <Show when={s.motion !== 'none'}>
        <Field
          label={S.motionAmountLabel}
          labelSuffix={rotate ? S.rotateTurns(Math.round(s.motionAmount)) : undefined}
        >
          {rotate ? (
            <Slider
              value={Math.round(s.motionAmount)}
              onChange={(motionAmount) => set({ motionAmount })}
              {...LIMITS.rotate}
              unit="圈"
            />
          ) : (
            <Slider
              value={s.motionAmount}
              onChange={(motionAmount) => set({ motionAmount })}
              {...LIMITS.motion}
            />
          )}
        </Field>
      </Show>
      <Show when={advanced && s.fx !== 'none'}>
        {s.fx !== 'none' ? <FxTune fx={s.fx} /> : null}
      </Show>
      <Show when={advanced}>
        <Field label={S.seedLabel} hint={S.seedHint}>
          <Slider value={s.seed} onChange={(seed) => set({ seed })} {...LIMITS.seed} step={1} />
        </Field>
      </Show>
    </div>
  );
}

/** 特效細調（F25）：每個參數一個控制項 */
function FxTune({ fx }: { fx: Exclude<FxChoice, 'none'> }) {
  const s = useS();
  const setParam = useCallback(
    (key: string, v: number | boolean | string) =>
      setSettings((cur) => ({ ...cur, fxParams: { ...cur.fxParams, [key]: v } })),
    [],
  );
  return (
    <Section title={S.fxTuneTitle(S.fxNames[fx])} persistKey="cutin:fx-tune">
      {LOOP_FX_PARAMS[fx].map((p) => (
        <FxParamField key={p.key} fx={fx} param={p} value={s.fxParams[p.key]} onChange={setParam} />
      ))}
    </Section>
  );
}

function FxParamField({
  fx,
  param: p,
  value,
  onChange,
}: {
  fx: Exclude<FxChoice, 'none'>;
  param: LoopFxParam;
  value: number | boolean | string | undefined;
  onChange: (key: string, v: number | boolean | string) => void;
}) {
  const label = S.fxParamLabels[p.key] ?? p.label;
  if (p.kind === 'boolean')
    return (
      <Checkbox label={label} checked={!!value} onCheckedChange={(v) => onChange(p.key, !!v)} />
    );
  if (p.kind === 'color') {
    const color = typeof value === 'string' ? value : '#ffffff';
    if (fx === 'speedLines') {
      const rainbow = color === 'rainbow';
      return (
        <div className="flex flex-col gap-2">
          <Field label={label}>
            <Segmented
              value={rainbow ? 'rainbow' : 'solid'}
              onValueChange={(v) => onChange(p.key, v === 'rainbow' ? 'rainbow' : '#ffffff')}
              options={[
                { value: 'rainbow', label: S.lineColorRainbow },
                { value: 'solid', label: S.lineColorSolid },
              ]}
            />
          </Field>
          <Show when={!rainbow}>
            <ColorField
              aria-label={`${label}（${S.lineColorSolid}）`}
              value={rainbow ? '#ffffff' : color}
              onChange={(c) => onChange(p.key, c)}
            />
          </Show>
        </div>
      );
    }
    return (
      <Field label={label}>
        <ColorField value={color} onChange={(c) => onChange(p.key, c)} />
      </Field>
    );
  }
  const num = typeof value === 'number' ? value : (p.min ?? 0);
  const step = p.step ?? (p.kind === 'int' ? 1 : 0.01);
  return (
    <Field label={label} labelSuffix={<span className="tabular-nums">{fmt3(num)}</span>}>
      <Slider
        value={num}
        onChange={(v) => onChange(p.key, v)}
        min={p.min ?? 0}
        max={p.max ?? 1}
        step={step}
        showInput={false}
        valueText={fmt3}
      />
    </Field>
  );
}

/* ---------- 匯出設定（F27～F35） ---------- */

export function ExportSettingsPanel() {
  const s = useS();
  const [advanced] = useAdvancedMode(TOOL_ID);
  const target = EXPORT_TARGETS[s.target];
  const touch = (k: keyof CutinSettings['touched']) => ({ ...s.touched, [k]: true });
  const sec = (s.frames / s.fps).toFixed(2);
  return (
    <div className="flex flex-col gap-4 pt-3">
      <Field label={S.formatLabel}>
        <FormatPicker
          value={s.format}
          target={s.target}
          onChange={(format) => set({ format, touched: touch('format') })}
        />
      </Field>
      {target.fixedSize ? (
        <p
          className="m-0 rounded-md bg-surface-2 px-3 py-2 text-sm text-muted"
          data-testid="fixed-size-note"
        >
          {S.fixedSizeNote(target.fixedSize.width, target.fixedSize.height)}
        </p>
      ) : (
        <Field label={S.sizeLabel}>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4" data-testid="size-presets">
            {SIZE_PRESETS.map((p) => {
              const on = s.width === p.width && s.height === p.height;
              return (
                <Button
                  key={p.id}
                  size="sm"
                  variant={on ? 'primary' : 'secondary'}
                  aria-pressed={on}
                  onClick={() => setSettings((cur) => applySizePreset(cur, p))}
                  className="h-auto flex-col gap-0 py-1"
                >
                  <span>{S.sizePresets[p.id]}</span>
                  <span className="text-xs font-normal tabular-nums">
                    {p.width} × {p.height}
                  </span>
                </Button>
              );
            })}
          </div>
        </Field>
      )}
      <p className="m-0 text-sm text-fg tabular-nums" data-testid="export-summary">
        {S.summary(s.width, s.height, s.frames, s.fps, sec, formatLimitBytes(target.maxBytes))}
      </p>
      <Show when={advanced}>
        <Section title={S.exportSettings} persistKey="cutin:export">
          <FieldRow>
            <Field label={S.widthLabel}>
              <NumberInput
                value={s.width}
                onChange={(width) => set({ width, touched: touch('size') })}
                {...LIMITS.size}
                unit="px"
              />
            </Field>
            <Field label={S.heightLabel}>
              <NumberInput
                value={s.height}
                onChange={(height) => set({ height, touched: touch('size') })}
                {...LIMITS.size}
                unit="px"
              />
            </Field>
          </FieldRow>
          <Field label={S.framesLabel}>
            <Slider
              value={s.frames}
              onChange={(frames) => set({ frames, touched: touch('frames') })}
              {...LIMITS.frames}
              unit="格"
            />
          </Field>
          <Field label={S.fpsLabel}>
            <Slider
              value={s.fps}
              onChange={(fps) => set({ fps, touched: touch('fps') })}
              {...LIMITS.fps}
              unit="fps"
            />
          </Field>
          <Field label={S.contentScaleLabel} hint={S.contentScaleHint}>
            <Slider
              value={Math.round(s.contentScale * 100)}
              onChange={(v) => set({ contentScale: v / 100 })}
              min={40}
              max={100}
              step={2}
              unit="%"
            />
          </Field>
          <Field
            label={S.colorsLabel}
            hint={S.colorsHint}
            labelSuffix={
              <span className="tabular-nums" data-testid="colors-value">
                {s.colors === 0 ? S.colorsLossless : `${s.colors} 色`}
              </span>
            }
          >
            <Slider
              value={s.colors}
              onChange={(colors) => set({ colors })}
              {...LIMITS.colors}
              showInput={false}
              valueText={(v) => (v === 0 ? S.colorsLossless : `${v} 色`)}
            />
          </Field>
          <Show when={s.format === 'gif'}>
            <Field
              label={S.gifMatteLabel}
              hint={S.gifMatteHint}
              labelSuffix={
                <span className="font-mono tabular-nums" data-testid="gif-matte-value">
                  {s.gifMatte ?? S.gifMatteNone}
                </span>
              }
            >
              <div className="flex flex-wrap items-center gap-2">
                <ColorField
                  value={s.gifMatte ?? '#000000'}
                  onChange={(gifMatte) => set({ gifMatte, touched: touch('gifMatte') })}
                  className="w-auto"
                />
                <Button
                  size="sm"
                  onClick={() => set({ gifMatte: null, touched: touch('gifMatte') })}
                >
                  {S.gifMatteNone}
                </Button>
                <Button
                  size="sm"
                  onClick={() => set({ gifMatte: DISCORD_DARK_BG, touched: touch('gifMatte') })}
                >
                  {S.gifMatteDiscord}
                </Button>
              </div>
            </Field>
          </Show>
        </Section>
      </Show>
    </div>
  );
}
