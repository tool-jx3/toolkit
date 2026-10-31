/**
 * 「格局與尺寸」區塊（2026-10-30 新增）：格局（生成法）、各格局的參數、欄數、列數、每格 px。
 * （2026-10-30 驗證後：介面上的「生成法」改叫「格局」，原本的「格局」「尺寸」兩個區塊合成一個。）
 * 數字欄與滑桿在確定（離開欄位、Enter、放開滑桿）時才套用，拖曳或打字途中不會一直重畫地圖。
 */
import { RotateCcw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Field, FieldRow, NumberInput, Section, Segmented, Slider } from '@/ui';
import {
  CAVE_FILL_MAX,
  CAVE_FILL_MIN,
  CAVE_SMOOTH_MAX,
  CAVE_SMOOTH_MIN,
  CELL_PX_OPTIONS,
  type CellPx,
  DEFAULT_SETTINGS,
  DENSITY_IDS,
  GENERATOR_IDS,
  type LayoutSettings,
  MAZE_STYLES,
  MAZE_WIDTHS,
  type MazeWidth,
  MIN_CELLS,
  maxCellsFor,
  ROOM_GENERATORS,
} from './settings';
import { S } from './strings';

/** 顯示用的草稿值：外部的值變了（例如重設）就跟著變；確定時才交出去 */
function useDraft(value: number): [number, (v: number) => void] {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return [draft, setDraft];
}

const GENERATOR_OPTIONS = GENERATOR_IDS.map((id) => ({ value: id, label: S.generators[id] }));
const DENSITY_OPTIONS = DENSITY_IDS.map((id) => ({ value: id, label: S.densities[id] }));
const MAZE_STYLE_OPTIONS = MAZE_STYLES.map((id) => ({ value: id, label: S.mazeStyles[id] }));
const MAZE_WIDTH_OPTIONS = MAZE_WIDTHS.map((w) => ({
  value: String(w),
  label: `${w} ${S.cellsUnit}`,
}));
const CELL_PX_SEGMENTS = CELL_PX_OPTIONS.map((px) => ({
  value: String(px),
  label: S.cellPxOption(px),
}));

const sameSettings = (a: LayoutSettings, b: LayoutSettings) =>
  (Object.keys(a) as (keyof LayoutSettings)[]).every((k) => a[k] === b[k]);

export interface LayoutPanelProps {
  settings: LayoutSettings;
  onChange: (patch: Partial<LayoutSettings>) => void;
  onReset: () => void;
}

export function LayoutPanel({ settings: s, onChange, onReset }: LayoutPanelProps) {
  const [fill, setFill] = useDraft(s.caveFill);
  const [smooth, setSmooth] = useDraft(s.caveSmooth);
  const [cols, setCols] = useDraft(s.cols);
  const [rows, setRows] = useDraft(s.rows);
  const max = maxCellsFor(s.cellPx);
  return (
    <Section title={S.sectionLayout} fixed>
      <Field label={S.generator} hint={S.generatorInfo[s.generator]}>
        <Segmented
          fullWidth
          columns={3}
          value={s.generator}
          onValueChange={(generator) => onChange({ generator })}
          options={GENERATOR_OPTIONS}
        />
      </Field>
      <p className="m-0 -mt-1 text-xs text-muted">{S.generatorHint}</p>
      {ROOM_GENERATORS.includes(s.generator) ? (
        <Field label={S.density} hint={S.densityHint}>
          <Segmented
            fullWidth
            value={s.density}
            onValueChange={(density) => onChange({ density })}
            options={DENSITY_OPTIONS}
          />
        </Field>
      ) : null}
      {s.generator === 'cave' ? (
        <>
          <Field label={S.caveFill} hint={S.caveFillHint}>
            <Slider
              value={fill}
              onChange={setFill}
              onCommit={(caveFill) => onChange({ caveFill })}
              min={CAVE_FILL_MIN}
              max={CAVE_FILL_MAX}
              unit="%"
            />
          </Field>
          <Field label={S.caveSmooth} hint={S.caveSmoothHint}>
            <Slider
              value={smooth}
              onChange={setSmooth}
              onCommit={(caveSmooth) => onChange({ caveSmooth })}
              min={CAVE_SMOOTH_MIN}
              max={CAVE_SMOOTH_MAX}
              unit={S.times}
            />
          </Field>
        </>
      ) : null}
      {s.generator === 'maze' ? (
        <>
          <Field label={S.mazeStyle} hint={S.mazeStyleInfo[s.mazeStyle]}>
            <Segmented
              fullWidth
              value={s.mazeStyle}
              onValueChange={(mazeStyle) => onChange({ mazeStyle })}
              options={MAZE_STYLE_OPTIONS}
            />
          </Field>
          <Field label={S.mazeWidth} hint={S.mazeWidthHint}>
            <Segmented
              fullWidth
              value={String(s.mazeWidth)}
              onValueChange={(w) => onChange({ mazeWidth: Number(w) as MazeWidth })}
              options={MAZE_WIDTH_OPTIONS}
            />
          </Field>
        </>
      ) : null}
      <FieldRow>
        <Field label={S.cols}>
          <NumberInput
            value={cols}
            onChange={setCols}
            onCommit={(v) => onChange({ cols: v })}
            min={MIN_CELLS}
            max={max}
            unit={S.cellsUnit}
          />
        </Field>
        <Field label={S.rows}>
          <NumberInput
            value={rows}
            onChange={setRows}
            onCommit={(v) => onChange({ rows: v })}
            min={MIN_CELLS}
            max={max}
            unit={S.cellsUnit}
          />
        </Field>
      </FieldRow>
      <p className="m-0 -mt-1 text-xs text-muted">{S.sizeHint(max)}</p>
      <Field label={S.cellPx} hint={S.cellPxHint}>
        <Segmented
          fullWidth
          value={String(s.cellPx)}
          onValueChange={(px) => onChange({ cellPx: Number(px) as CellPx })}
          options={CELL_PX_SEGMENTS}
        />
      </Field>
      <div>
        <Button
          size="sm"
          variant="ghost"
          icon={<RotateCcw />}
          disabled={sameSettings(s, DEFAULT_SETTINGS)}
          onClick={onReset}
        >
          {S.resetLayout}
        </Button>
      </div>
    </Section>
  );
}
