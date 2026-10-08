/**
 * 設定面板：範圍與距離、格子顏色（配色＋每個距離一個色彩欄）、文字、自訂格子。
 */
import { Eraser } from 'lucide-react';
import { HEX_DISTANCE_METHODS, SQUARE_DISTANCE_METHODS } from '@/core/grid';
import {
  Button,
  ColorField,
  Field,
  NumberInput,
  Section,
  Segmented,
  Select,
  Slider,
  Toggle,
} from '@/ui';
import {
  type CommonSettings,
  type HexSettings,
  RANGE,
  SCHEMES,
  type Settings,
  type SquareSettings,
} from './settings';
import { actions } from './store';
import { S } from './strings';

const SCHEME_OPTIONS = SCHEMES.map((value) => ({ value, label: S.schemes[value] }));
const SQUARE_METHOD_OPTIONS = SQUARE_DISTANCE_METHODS.map((value) => ({
  value,
  label: S.squareMethods[value],
  description: S.squareMethodDescriptions[value],
}));
const HEX_METHOD_OPTIONS = HEX_DISTANCE_METHODS.map((value) => ({
  value,
  label: S.hexMethods[value],
}));
const ORIENTATION_OPTIONS = [
  { value: 'flat', label: S.orientations.flat },
  { value: 'pointy', label: S.orientations.pointy },
] as const;

function RangeField({ s }: { s: CommonSettings }) {
  return (
    <Field label={S.range} hint={S.rangeHint}>
      <NumberInput
        value={s.range}
        onChange={actions.setRange}
        min={RANGE.range.min}
        max={RANGE.range.max}
        unit={S.rangeUnit}
      />
    </Field>
  );
}

function SizeField({ s, label, hint }: { s: CommonSettings; label: string; hint?: string }) {
  return (
    <Field label={label} hint={hint}>
      <NumberInput
        value={s.size}
        onChange={(v) =>
          actions.edit((d) => {
            d.size = v;
          })
        }
        min={RANGE.size.min}
        max={RANGE.size.max}
        unit="px"
      />
    </Field>
  );
}

function SquareBasic({ s }: { s: SquareSettings }) {
  return (
    <Section title={S.sectionBasic} persistKey="range-ruler:basic">
      <RangeField s={s} />
      <Field label={S.method}>
        <Select
          value={s.method}
          onValueChange={(v) =>
            actions.edit((d) => {
              (d as SquareSettings).method = v;
            })
          }
          options={SQUARE_METHOD_OPTIONS}
        />
      </Field>
      <SizeField s={s} label={S.cellSize} />
    </Section>
  );
}

function HexBasic({ s }: { s: HexSettings }) {
  return (
    <Section title={S.sectionBasic} persistKey="range-ruler:basic">
      <Field label={S.orientation}>
        <Segmented
          fullWidth
          value={s.orientation}
          onValueChange={(v) =>
            actions.edit((d) => {
              (d as HexSettings).orientation = v;
            })
          }
          options={ORIENTATION_OPTIONS}
        />
      </Field>
      <RangeField s={s} />
      <Field label={S.method} hint={S.hexMethodHint}>
        <Segmented
          fullWidth
          value={s.method}
          onValueChange={(v) =>
            actions.edit((d) => {
              (d as HexSettings).method = v;
            })
          }
          options={HEX_METHOD_OPTIONS}
        />
      </Field>
      <SizeField s={s} label={S.hexSize} hint={S.hexSizeHint} />
      <Field label={S.fit} hint={S.fitHint} layout="inline">
        <Toggle
          checked={s.fit}
          onCheckedChange={(v) =>
            actions.edit((d) => {
              (d as HexSettings).fit = v;
            })
          }
        />
      </Field>
    </Section>
  );
}

function ColorSection({ s }: { s: CommonSettings }) {
  return (
    <Section title={S.sectionColor} persistKey="range-ruler:color">
      <Field label={S.scheme} hint={S.schemeHint}>
        <Select value={s.scheme} onValueChange={actions.setScheme} options={SCHEME_OPTIONS} />
      </Field>
      <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 p-0 text-sm text-fg">{S.distColorsLabel}</legend>
        <ul
          className="m-0 grid list-none grid-cols-1 gap-x-4 gap-y-1.5 p-0"
          data-testid="dist-colors"
        >
          {s.distColors.map((color, d) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 距離就是索引
            <li key={d} className="flex min-w-0 items-center gap-3">
              <span className="w-16 shrink-0 text-sm text-muted tabular-nums">
                {S.distLabel(d)}
              </span>
              <ColorField
                className="min-w-0 flex-1"
                value={color}
                onChange={(c) => actions.setDistColor(d, c)}
                alpha
                aria-label={S.distLabel(d)}
              />
            </li>
          ))}
        </ul>
      </fieldset>
      <Field label={S.cellOpacity} hint={S.cellOpacityHint}>
        <Slider
          value={s.cellOpacity}
          onChange={(v) =>
            actions.edit((d) => {
              d.cellOpacity = v;
            })
          }
          min={RANGE.opacity.min}
          max={RANGE.opacity.max}
          unit="%"
        />
      </Field>
    </Section>
  );
}

function TextSection({ s }: { s: CommonSettings }) {
  return (
    <Section title={S.sectionText} persistKey="range-ruler:text">
      <Field label={S.textColor}>
        <ColorField
          value={s.textColor}
          onChange={(v) =>
            actions.edit((d) => {
              d.textColor = v;
            })
          }
          alpha
        />
      </Field>
      <Field label={S.fontSize} hint={S.fontSizeHint}>
        <NumberInput
          value={s.fontSize}
          onChange={(v) =>
            actions.edit((d) => {
              d.fontSize = v;
            })
          }
          min={RANGE.fontSize.min}
          max={RANGE.fontSize.max}
          unit="px"
        />
      </Field>
      <Field label={S.textOpacity} hint={S.textOpacityHint}>
        <Slider
          value={s.textOpacity}
          onChange={(v) =>
            actions.edit((d) => {
              d.textOpacity = v;
            })
          }
          min={RANGE.opacity.min}
          max={RANGE.opacity.max}
          unit="%"
        />
      </Field>
      <Field label={S.stroke} hint={S.strokeHint} layout="inline">
        <Toggle
          checked={s.stroke}
          onCheckedChange={(v) =>
            actions.edit((d) => {
              d.stroke = v;
            })
          }
        />
      </Field>
      <Field label={S.strokeColor}>
        <ColorField
          value={s.strokeColor}
          onChange={(v) =>
            actions.edit((d) => {
              d.strokeColor = v;
            })
          }
          alpha
          disabled={!s.stroke}
        />
      </Field>
    </Section>
  );
}

function CustomSection({ s, onClear }: { s: CommonSettings; onClear: () => void }) {
  const n = Object.keys(s.customs).length;
  return (
    <Section title={S.sectionCustom} persistKey="range-ruler:custom" description={S.customHint}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm tabular-nums" data-testid="custom-count">
          {S.customCount(n)}
        </span>
        <Button size="sm" icon={<Eraser />} onClick={onClear} disabled={n === 0}>
          {S.clearCustoms}
        </Button>
      </div>
    </Section>
  );
}

export function SettingsPanels({
  settings,
  onClearCustoms,
}: {
  settings: Settings;
  onClearCustoms: () => void;
}) {
  const s = settings.shape === 'square' ? settings.square : settings.hex;
  return (
    <>
      {settings.shape === 'square' ? (
        <SquareBasic s={settings.square} />
      ) : (
        <HexBasic s={settings.hex} />
      )}
      <CustomSection s={s} onClear={onClearCustoms} />
      <ColorSection s={s} />
      <TextSection s={s} />
    </>
  );
}
