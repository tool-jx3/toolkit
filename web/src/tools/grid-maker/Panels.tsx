/**
 * 設定面板：方格與六角格共用「線條」「座標」，各自有「格數與大小」「格子樣式」。
 */
import type { Draft } from 'immer';
import type { ReactNode } from 'react';
import { COORD_FORMATS, GRID_LINE_STYLES } from '@/core/grid';
import {
  ColorField,
  Field,
  FieldRow,
  NumberInput,
  Section,
  Segmented,
  Select,
  Slider,
  Toggle,
} from '@/ui';
import { type CommonSettings, type HexSettings, RANGE, type SquareSettings } from './settings';
import { actions } from './store';
import { S } from './strings';

type Update<T> = (recipe: (d: Draft<T>) => void) => void;

const ORIGIN_OPTIONS = (['tl', 'bl', 'tr', 'br'] as const).map((value) => ({
  value,
  label: S.coordOrigins[value],
}));
const FORMAT_OPTIONS = COORD_FORMATS.map((value) => ({ value, label: S.coordFormats[value] }));
const STYLE_OPTIONS = GRID_LINE_STYLES.map((value) => ({ value, label: S.lineStyles[value] }));
const POS_OPTIONS = (['top', 'middle', 'bottom'] as const).map((value) => ({
  value,
  label: S.coordPositions[value],
}));
const START_OPTIONS = [
  { value: '0', label: S.coordStarts[0] },
  { value: '1', label: S.coordStarts[1] },
] as const;

function SizeFields<T extends CommonSettings>({
  s,
  update,
  sizeLabel,
  sizeHint,
  rowsHint,
}: {
  s: T;
  update: Update<T>;
  sizeLabel: string;
  sizeHint?: string;
  rowsHint?: string;
}) {
  return (
    <>
      <FieldRow>
        <Field label={S.cols}>
          <NumberInput
            value={s.cols}
            onChange={(v) =>
              update((d) => {
                d.cols = v;
              })
            }
            min={RANGE.cols.min}
            max={RANGE.cols.max}
          />
        </Field>
        <Field label={S.rows}>
          <NumberInput
            value={s.rows}
            onChange={(v) =>
              update((d) => {
                d.rows = v;
              })
            }
            min={RANGE.rows.min}
            max={RANGE.rows.max}
          />
        </Field>
      </FieldRow>
      {rowsHint ? <p className="m-0 -mt-1 text-xs text-muted">{rowsHint}</p> : null}
      <Field label={sizeLabel} hint={sizeHint}>
        <NumberInput
          value={s.size}
          onChange={(v) =>
            update((d) => {
              d.size = v;
            })
          }
          min={RANGE.size.min}
          max={RANGE.size.max}
          unit="px"
        />
      </Field>
    </>
  );
}

function LineSection<T extends CommonSettings>({
  s,
  update,
  styleHint,
}: {
  s: T;
  update: Update<T>;
  styleHint: string;
}) {
  return (
    <Section title={S.sectionLine} persistKey="grid-maker:line">
      <Field label={S.lineColor}>
        <ColorField
          value={s.lineColor}
          onChange={(v) =>
            update((d) => {
              d.lineColor = v;
            })
          }
          alpha
        />
      </Field>
      <Field label={S.lineWidth}>
        <NumberInput
          value={s.lineWidth}
          onChange={(v) =>
            update((d) => {
              d.lineWidth = v;
            })
          }
          min={RANGE.lineWidth.min}
          max={RANGE.lineWidth.max}
          unit="px"
        />
      </Field>
      <Field label={S.lineStyle} hint={styleHint}>
        <Segmented
          fullWidth
          value={s.lineStyle}
          onValueChange={(v) =>
            update((d) => {
              d.lineStyle = v;
            })
          }
          options={STYLE_OPTIONS}
        />
      </Field>
      <Field label={S.glow} hint={S.glowHint} layout="inline">
        <Toggle
          checked={s.glow}
          onCheckedChange={(v) =>
            update((d) => {
              d.glow = v;
            })
          }
        />
      </Field>
    </Section>
  );
}

function ScaleField<T extends CommonSettings>({ s, update }: { s: T; update: Update<T> }) {
  return (
    <Field label={S.scale} hint={S.scaleHint}>
      <Slider
        value={s.scale}
        onChange={(v) =>
          update((d) => {
            d.scale = v;
          })
        }
        min={RANGE.scale.min}
        max={RANGE.scale.max}
        unit="%"
      />
    </Field>
  );
}

function CoordSection<T extends CommonSettings>({
  s,
  update,
  rowMode,
}: {
  s: T;
  update: Update<T>;
  /** 六角格才有的「列的算法」 */
  rowMode?: ReactNode;
}) {
  const off = !s.showCoords;
  const edge = s.coordPos !== 'middle';
  return (
    <Section title={S.sectionCoords} persistKey="grid-maker:coords">
      <Field label={S.showCoords} layout="inline">
        <Toggle
          checked={s.showCoords}
          onCheckedChange={(v) =>
            update((d) => {
              d.showCoords = v;
            })
          }
        />
      </Field>
      <Field label={S.coordColor}>
        <ColorField
          value={s.coordColor}
          onChange={(v) =>
            update((d) => {
              d.coordColor = v;
            })
          }
          alpha
          disabled={off}
        />
      </Field>
      <Field label={S.coordFormat} hint={S.coordFormatHint}>
        <Select
          value={s.coordFormat}
          onValueChange={(v) =>
            update((d) => {
              d.coordFormat = v;
              /* 流水號不分列的算法（舊版固定為壓縮） */
              if (v === 'serial' && 'rowMode' in d)
                (d as unknown as Draft<HexSettings>).rowMode = 'compress';
            })
          }
          options={FORMAT_OPTIONS}
          disabled={off}
        />
      </Field>
      <Field label={S.coordOrigin}>
        <Segmented
          fullWidth
          value={s.coordOrigin}
          onValueChange={(v) =>
            update((d) => {
              d.coordOrigin = v;
            })
          }
          options={ORIGIN_OPTIONS}
          disabled={off}
        />
      </Field>
      {rowMode}
      <Field label={S.coordStart}>
        <Segmented
          fullWidth
          value={String(s.coordStart) as '0' | '1'}
          onValueChange={(v) =>
            update((d) => {
              d.coordStart = v === '1' ? 1 : 0;
            })
          }
          options={START_OPTIONS}
          disabled={off}
        />
      </Field>
      <Field label={S.coordPos}>
        <Segmented
          fullWidth
          value={s.coordPos}
          onValueChange={(v) =>
            update((d) => {
              d.coordPos = v;
            })
          }
          options={POS_OPTIONS}
          disabled={off}
        />
      </Field>
      <FieldRow>
        <Field label={S.coordOffset}>
          <NumberInput
            value={s.coordOffset}
            onChange={(v) =>
              update((d) => {
                d.coordOffset = v;
              })
            }
            min={RANGE.coordOffset.min}
            max={RANGE.coordOffset.max}
            unit="px"
            disabled={off || !edge}
          />
        </Field>
        <Field label={S.coordFontSize}>
          <NumberInput
            value={s.coordFontSize}
            onChange={(v) =>
              update((d) => {
                d.coordFontSize = v;
              })
            }
            min={RANGE.coordFontSize.min}
            max={RANGE.coordFontSize.max}
            unit="px"
            disabled={off}
          />
        </Field>
      </FieldRow>
      <p className="m-0 -mt-1 text-xs text-muted">{S.coordOffsetHint}</p>
    </Section>
  );
}

export function SquarePanel({ s }: { s: SquareSettings }) {
  const update = actions.square;
  return (
    <>
      <Section title={S.sectionSize} persistKey="grid-maker:size">
        <SizeFields s={s} update={update} sizeLabel={S.cellSize} />
      </Section>
      <LineSection s={s} update={update} styleHint={S.lineStyleHintSquare} />
      <Section title={S.sectionCell} persistKey="grid-maker:cell">
        <ScaleField s={s} update={update} />
        <Field label={S.cornerRadius} hint={S.cornerRadiusHint}>
          <NumberInput
            value={s.cornerRadius}
            onChange={(v) =>
              update((d) => {
                d.cornerRadius = v;
              })
            }
            min={RANGE.cornerRadius.min}
            max={RANGE.cornerRadius.max}
            unit="px"
          />
        </Field>
      </Section>
      <CoordSection s={s} update={update} />
    </>
  );
}

const ORIENTATION_OPTIONS = [
  { value: 'flat', label: S.orientations.flat },
  { value: 'pointy', label: S.orientations.pointy },
] as const;
const ROW_MODE_OPTIONS = [
  { value: 'compress', label: S.rowModes.compress },
  { value: 'half', label: S.rowModes.half },
] as const;

export function HexPanel({ s }: { s: HexSettings }) {
  const update = actions.hex;
  const serial = s.coordFormat === 'serial';
  return (
    <>
      <Section title={S.sectionSize} persistKey="grid-maker:size">
        <Field label={S.orientation}>
          <Segmented
            fullWidth
            value={s.orientation}
            onValueChange={(v) =>
              update((d) => {
                d.orientation = v;
              })
            }
            options={ORIENTATION_OPTIONS}
          />
        </Field>
        <SizeFields
          s={s}
          update={update}
          sizeLabel={S.hexSize}
          sizeHint={S.hexSizeHint}
          rowsHint={S.hexRowsHint}
        />
        <Field label={S.shift} hint={S.shiftHint} layout="inline">
          <Toggle
            checked={s.shift}
            onCheckedChange={(v) =>
              update((d) => {
                d.shift = v;
              })
            }
          />
        </Field>
        <Field label={S.outer} hint={S.outerHint} layout="inline">
          <Toggle
            checked={s.outer}
            onCheckedChange={(v) =>
              update((d) => {
                d.outer = v;
              })
            }
          />
        </Field>
        <Field label={S.fit} hint={S.fitHint} layout="inline">
          <Toggle
            checked={s.fit}
            onCheckedChange={(v) =>
              update((d) => {
                d.fit = v;
              })
            }
          />
        </Field>
      </Section>
      <LineSection s={s} update={update} styleHint={S.lineStyleHintHex} />
      <Section title={S.sectionCell} persistKey="grid-maker:cell">
        <ScaleField s={s} update={update} />
      </Section>
      <CoordSection
        s={s}
        update={update}
        rowMode={
          <Field label={S.rowMode} hint={serial ? S.rowModeSerialHint : S.rowModeHint}>
            <Segmented
              fullWidth
              value={serial ? 'compress' : s.rowMode}
              onValueChange={(v) =>
                update((d) => {
                  d.rowMode = v;
                })
              }
              options={ROW_MODE_OPTIONS}
              disabled={!s.showCoords || serial}
            />
          </Field>
        }
      />
    </>
  );
}
