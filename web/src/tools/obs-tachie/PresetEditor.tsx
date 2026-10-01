/**
 * ② 預設集的編輯區（規格 F11、F25～F45）：名稱、立繪圖片（ImageSection）、位置與尺寸、說話效果、名字標籤、其他。
 */
import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  AnchorGrid,
  Button,
  ColorField,
  cn,
  Field,
  FieldRow,
  FontPicker,
  Notice,
  NumberInput,
  Section,
  Segmented,
  Show,
  TextInput,
  Toggle,
  useToast,
} from '@/ui';
import { ANCHOR_LABELS } from '@/ui/AnchorGrid';
import { gesture, liveIdle, resetOptions, updatePreset } from './actions';
import { PressButtons, WidthInput } from './controls';
import { type ImageInputState, ImageSection } from './ImageSection';
import { effectMargins, geometry, type MarginHint, marginHint } from './logic';
import { axesOf, MIN_GLOW_WIDTH, MIN_PERIOD, type NameLabel, type Preset } from './model';
import { useImageSize } from './store';
import { S } from './strings';

/** 標籤旁的邊距提示（F27） */
function MarginNote({ hint }: { hint: MarginHint }) {
  if (!hint) return null;
  return (
    <span
      className={cn('text-xs', hint.kind === 'warn' ? 'font-medium text-warning' : 'text-muted')}
      data-margin={hint.kind}
    >
      {hint.kind === 'warn' ? S.position.marginWarn(hint.value) : S.position.marginNeed(hint.value)}
    </span>
  );
}

function Off({ when, children }: { when: boolean; children: ReactNode }) {
  return when ? <p className="m-0 text-xs text-muted">{children}</p> : null;
}

export function PresetEditor({
  preset,
  input,
  onInputChange,
}: {
  preset: Preset;
  input: ImageInputState;
  onInputChange: (patch: Partial<ImageInputState>) => void;
}) {
  const toast = useToast();
  const id = preset.id;
  const set =
    <K extends keyof Preset>(key: K) =>
    (value: Preset[K]) =>
      updatePreset(id, (p) => {
        (p as Preset)[key] = value;
      });
  const setLabel =
    <K extends keyof NameLabel>(key: K) =>
    (value: NameLabel[K]) =>
      updatePreset(id, (p) => {
        (p.label as NameLabel)[key] = value;
      });
  /* 數字欄：打字中即時更新，確定時記成一步復原 */
  const num = <K extends keyof Preset>(key: K) => ({
    onChange: gesture.live(set(key) as (v: number) => void),
    onCommit: gesture.commit,
  });
  const numL = <K extends keyof NameLabel>(key: K) => ({
    onChange: gesture.live(setLabel(key) as (v: number) => void),
    onCommit: gesture.commit,
  });

  const size = useImageSize(preset.image);
  const natural = size?.status === 'ok' ? size.size : null;
  const g = geometry(preset, preset.image ? natural : null);
  const { x, y } = axesOf(preset.anchor);
  const margins = effectMargins(preset);
  const l = preset.label;

  return (
    <div className="flex flex-col gap-3" data-testid="preset-editor">
      <Section title={S.presets.editing(preset.name.trim() || S.presets.unnamed)} fixed>
        <Field label={S.presets.nameLabel} hint={S.presets.nameHint}>
          <TextInput
            value={preset.name}
            placeholder={S.presets.namePlaceholder}
            onFocus={gesture.begin}
            onBlur={gesture.commit}
            onChange={(e) => set('name')(e.target.value)}
          />
        </Field>
      </Section>

      <ImageSection preset={preset} input={input} onInputChange={onInputChange} />

      {/* ---- 位置與尺寸 ---- */}
      <Section title={S.position.title} persistKey="obs-tachie:position">
        <Field label={S.position.anchor} hint={S.position.anchorHint}>
          <div className="flex flex-wrap items-center gap-3">
            <AnchorGrid value={preset.anchor} onValueChange={set('anchor')} />
            <span className="text-sm text-fg" data-testid="anchor-now">
              {S.position.anchorNow(ANCHOR_LABELS[preset.anchor])}
            </span>
          </div>
        </Field>
        <Field
          label={S.position.x[x]}
          labelSuffix={<MarginNote hint={marginHint(margins.x, preset.offsetX)} />}
        >
          <NumberInput value={preset.offsetX} {...num('offsetX')} unit="px" className="w-36" />
        </Field>
        <Field
          label={S.position.y[y]}
          labelSuffix={<MarginNote hint={marginHint(margins.y, preset.offsetY)} />}
        >
          <NumberInput value={preset.offsetY} {...num('offsetY')} unit="px" className="w-36" />
        </Field>
        <Field label={S.position.width} hint={S.position.widthHint}>
          <WidthInput
            value={preset.width}
            placeholder={S.position.widthPlaceholder}
            onChange={(v) => {
              gesture.begin();
              set('width')(v);
            }}
            onCommit={gesture.commit}
          />
        </Field>
      </Section>

      {/* ---- 說話效果 ---- */}
      <Section
        title={S.effects.title}
        description={S.effects.description}
        persistKey="obs-tachie:effects"
      >
        <Field label={S.effects.toggles}>
          <PressButtons
            options={[
              {
                key: 'bounce',
                label: S.effects.bounce,
                pressed: preset.bounce,
                onChange: set('bounce'),
              },
              { key: 'glow', label: S.effects.glow, pressed: preset.glow, onChange: set('glow') },
              {
                key: 'blink',
                label: S.effects.blink,
                pressed: preset.blink,
                onChange: set('blink'),
              },
            ]}
          />
        </Field>
        <FieldRow columns={2}>
          <Field label={S.effects.bounceHeight} hint={S.effects.bounceHint}>
            <NumberInput
              value={preset.bounceHeight}
              {...num('bounceHeight')}
              min={0}
              max={2000}
              unit="px"
              disabled={!preset.bounce}
            />
          </Field>
          <Field label={S.effects.period} hint={S.effects.periodHint}>
            <NumberInput
              value={preset.period}
              {...num('period')}
              min={MIN_PERIOD}
              max={60000}
              step={10}
              unit="ms"
            />
          </Field>
        </FieldRow>
        <Off when={!preset.bounce}>{S.effects.bounceOff}</Off>
        <FieldRow columns={2}>
          <Field label={S.effects.glowColor}>
            <ColorField
              value={preset.glowColor}
              onChange={liveIdle(set('glowColor'))}
              disabled={!preset.glow}
            />
          </Field>
          <Field label={S.effects.glowWidth}>
            <NumberInput
              value={preset.glowWidth}
              {...num('glowWidth')}
              min={MIN_GLOW_WIDTH}
              max={200}
              step={0.5}
              unit="px"
              disabled={!preset.glow}
            />
          </Field>
        </FieldRow>
        <Off when={!preset.glow}>{S.effects.glowOff}</Off>
      </Section>

      {/* ---- 名字標籤 ---- */}
      <Section title={S.label.title} persistKey="obs-tachie:label">
        <Field label={S.label.show} hint={S.label.showHint} layout="inline">
          <Toggle checked={l.show} onCheckedChange={setLabel('show')} />
        </Field>
        <Show when={l.show}>
          <FieldRow columns={2}>
            <Field label={S.label.x}>
              <NumberInput value={l.x} {...numL('x')} unit="px" />
            </Field>
            <Field label={S.label.y[y]}>
              <NumberInput value={l.y} {...numL('y')} unit="px" />
            </Field>
          </FieldRow>
          <FieldRow columns={2}>
            <Field label={S.label.size}>
              <NumberInput value={l.size} {...numL('size')} min={1} max={1000} unit="px" />
            </Field>
            <Field label={S.label.color}>
              <ColorField value={l.color} onChange={liveIdle(setLabel('color'))} />
            </Field>
          </FieldRow>
          <Field label={S.label.font} hint={S.label.fontHint}>
            <FontPicker
              mode="css"
              value={l.font}
              onChange={setLabel('font')}
              showWeight={false}
              previewText="艾琳 Erin"
            />
          </Field>
          <Field
            label={S.label.align}
            hint={
              g.baseW !== null ? (
                <span data-testid="align-base">
                  {S.label.alignWithin(Number(g.baseW.toFixed(2)))}
                  {g.baseFromActual ? S.label.alignActual : null}
                </span>
              ) : (
                <span data-testid="align-base">{S.label.alignOff}</span>
              )
            }
          >
            <Segmented
              value={l.align}
              onValueChange={setLabel('align')}
              options={(['left', 'center', 'right'] as const).map((v) => ({
                value: v,
                label: S.label.alignOptions[v],
                disabled: g.baseW === null,
              }))}
            />
          </Field>
          <Field label={S.label.toggles}>
            <PressButtons
              options={[
                { key: 'bold', label: S.label.bold, pressed: l.bold, onChange: setLabel('bold') },
                {
                  key: 'stroke',
                  label: S.label.stroke,
                  pressed: l.stroke,
                  onChange: setLabel('stroke'),
                },
                { key: 'bar', label: S.label.bar, pressed: l.bar, onChange: setLabel('bar') },
              ]}
            />
          </Field>
          <FieldRow columns={2}>
            <Field label={S.label.strokeWidth} hint={S.label.strokeHint}>
              <NumberInput
                value={l.strokeWidth}
                {...numL('strokeWidth')}
                min={0}
                max={100}
                step={0.5}
                unit="px"
                disabled={!l.stroke}
              />
            </Field>
            <Field label={S.label.strokeColor}>
              <ColorField
                value={l.strokeColor}
                onChange={liveIdle(setLabel('strokeColor'))}
                disabled={!l.stroke}
              />
            </Field>
          </FieldRow>
          <Off when={!l.stroke}>{S.label.strokeOff}</Off>
          <Show when={l.bar}>
            <div
              className="flex flex-col gap-3 rounded-md border border-border p-3"
              data-testid="bar-settings"
            >
              <Field label={S.label.barWidth}>
                <Segmented
                  value={l.barWidth}
                  onValueChange={setLabel('barWidth')}
                  options={[
                    { value: 'fit', label: S.label.barWidthOptions.fit },
                    { value: 'fill', label: S.label.barWidthOptions.fill },
                  ]}
                />
              </Field>
              {l.barWidth === 'fill' && g.baseW === null ? (
                <Notice tone="warning" className="text-xs">
                  {S.label.barFillNoBase}
                </Notice>
              ) : null}
              <FieldRow columns={2}>
                <Field label={S.label.barColor}>
                  <ColorField value={l.barColor} onChange={liveIdle(setLabel('barColor'))} />
                </Field>
                <Field label={S.label.barOpacity}>
                  <NumberInput
                    value={l.barOpacity}
                    {...numL('barOpacity')}
                    min={0}
                    max={100}
                    unit="%"
                  />
                </Field>
              </FieldRow>
              <FieldRow columns={3}>
                <Field label={S.label.barRadius}>
                  <NumberInput
                    value={l.barRadius}
                    {...numL('barRadius')}
                    min={0}
                    max={500}
                    unit="px"
                  />
                </Field>
                <Field label={S.label.barPadX}>
                  <NumberInput value={l.barPadX} {...numL('barPadX')} min={0} max={500} unit="px" />
                </Field>
                <Field label={S.label.barPadY}>
                  <NumberInput value={l.barPadY} {...numL('barPadY')} min={0} max={500} unit="px" />
                </Field>
              </FieldRow>
            </div>
          </Show>
        </Show>
        <p className="m-0 text-xs text-muted">{S.label.note}</p>
      </Section>

      {/* ---- 其他 ---- */}
      <Section title={S.other.title} persistKey="obs-tachie:other">
        <Field label={S.other.dim} hint={S.other.dimHint} layout="inline">
          <Toggle checked={preset.dim} onCheckedChange={set('dim')} />
        </Field>
        <Field label={S.other.hide} hint={S.other.hideHint} layout="inline">
          <Toggle checked={preset.hideAway} onCheckedChange={set('hideAway')} />
        </Field>
        <div className="flex flex-col gap-1">
          <div>
            <Button
              icon={<RotateCcw />}
              onClick={() => {
                resetOptions(id);
                toast({ title: S.other.resetDone, tone: 'success' });
              }}
            >
              {S.other.reset}
            </Button>
          </div>
          <p className="m-0 text-xs text-muted">{S.other.resetHint}</p>
        </div>
        <Notice tone="info" className="text-xs">
          {S.other.compat}
        </Notice>
      </Section>
    </div>
  );
}
