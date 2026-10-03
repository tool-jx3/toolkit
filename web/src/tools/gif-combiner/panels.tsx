/**
 * 設定面板：動圖（加入、清單）、畫布（尺寸、背景）、格線排列。
 */
import { Grid3x3, LayoutGrid, Maximize2, Trash2 } from 'lucide-react';
import { historyGesture } from '@/core/storage';
import {
  Button,
  ColorField,
  Field,
  FieldRow,
  FileDrop,
  IconButton,
  LayerList,
  NumberInput,
  Section,
  Toggle,
  useToast,
} from '@/ui';
import { addFiles } from './actions';
import { type CombinerData, itemMeta, RANGE, squareCanvas } from './logic';
import { useMedia } from './media';
import {
  arrange,
  arrangeSquare,
  arrangeTight,
  edit,
  removeItem,
  reorder,
  select,
  step,
  useCombiner,
  useUi,
} from './store';
import { S } from './strings';

/** 檔案選擇視窗列出的類型（拖放、貼上的檔案一律交給解碼器判斷） */
export const ACCEPT = 'image/*';

const g = historyGesture(useCombiner);

/** 數值欄：打字時即時套用，確定（離開、Enter）時記成一步復原 */
function NumberSetting({
  value,
  onValue,
  range,
  unit,
  step = 1,
}: {
  value: number;
  onValue: (d: CombinerData, v: number) => void;
  range: readonly [number, number];
  unit?: string;
  step?: number;
}) {
  return (
    <NumberInput
      value={value}
      onChange={g.live((v) => edit((d) => onValue(d, v)))}
      onCommit={g.commit}
      min={range[0]}
      max={range[1]}
      step={step}
      precision={0}
      unit={unit}
    />
  );
}

export function FilesPanel() {
  const items = useCombiner((st) => st.data.items);
  const media = useMedia((st) => st.media);
  const selected = useUi((st) => st.selected);
  const loading = useUi((st) => st.loading);
  const toast = useToast();
  return (
    <Section title={S.files.title} persistKey="gif-combiner:files">
      <FileDrop
        accept={ACCEPT}
        multiple
        filterByAccept={false}
        label={S.files.drop}
        buttonLabel={S.files.pick}
        hint={S.files.hint}
        onFiles={(files) => void addFiles(files, toast)}
      />
      {loading ? (
        <p className="m-0 text-xs text-muted" role="status" data-testid="loading">
          {S.files.loading(loading)}
        </p>
      ) : null}
      <LayerList
        aria-label={S.files.listLabel}
        items={items.map((it) => ({
          id: it.id,
          name: it.name,
          thumbnail: media[it.asset]?.frames[0] ?? null,
          meta: itemMeta(it),
        }))}
        selectedId={selected}
        onSelect={select}
        onMove={reorder}
        onMoveStart={() => useCombiner.beginGesture()}
        onMoveEnd={() => useCombiner.endGesture()}
        moveButtons={{ up: S.files.up, down: S.files.down }}
        thumbSize={{ width: 56, height: 56 }}
        empty={S.files.empty}
        renderActions={(item) => (
          <IconButton
            size="sm"
            variant="ghost"
            label={S.files.remove(item.name)}
            icon={<Trash2 />}
            onClick={() => removeItem(item.id)}
          />
        )}
      />
      {items.length > 1 ? <p className="m-0 text-xs text-muted">{S.files.reorderHint}</p> : null}
    </Section>
  );
}

export function CanvasPanel() {
  const d = useCombiner((st) => st.data);
  return (
    <Section title={S.canvas.title} persistKey="gif-combiner:canvas">
      <FieldRow columns={2}>
        <Field label={S.canvas.width}>
          <NumberSetting
            value={d.canvas.width}
            range={RANGE.canvas}
            unit="px"
            onValue={(x, v) => {
              x.canvas.width = v;
            }}
          />
        </Field>
        <Field label={S.canvas.height}>
          <NumberSetting
            value={d.canvas.height}
            range={RANGE.canvas}
            unit="px"
            onValue={(x, v) => {
              x.canvas.height = v;
            }}
          />
        </Field>
      </FieldRow>
      <Field label={S.canvas.background}>
        <ColorField
          value={d.background}
          onChange={(c) =>
            edit((x) => {
              x.background = c.slice(0, 7).toLowerCase();
            })
          }
          disabled={d.transparent}
        />
      </Field>
      <Field label={S.canvas.transparent} layout="inline" hint={S.canvas.transparentHint}>
        <Toggle
          checked={d.transparent}
          onCheckedChange={(v) =>
            step(() =>
              edit((x) => {
                x.transparent = v;
              }),
            )
          }
        />
      </Field>
    </Section>
  );
}

export function GridPanel() {
  const d = useCombiner((st) => st.data);
  const has = d.items.length > 0;
  const sq = squareCanvas(d.grid.cols, d.grid.rows);
  return (
    <Section title={S.grid.title} persistKey="gif-combiner:grid">
      <FieldRow columns={2}>
        <Field label={S.grid.cols}>
          <NumberSetting
            value={d.grid.cols}
            range={RANGE.grid}
            onValue={(x, v) => {
              x.grid.cols = v;
            }}
          />
        </Field>
        <Field label={S.grid.rows}>
          <NumberSetting
            value={d.grid.rows}
            range={RANGE.grid}
            onValue={(x, v) => {
              x.grid.rows = v;
            }}
          />
        </Field>
      </FieldRow>
      <div className="flex flex-wrap gap-2">
        <Button icon={<LayoutGrid />} onClick={arrange}>
          {S.grid.arrange}
        </Button>
        <Button icon={<Grid3x3 />} onClick={arrangeSquare}>
          {S.grid.square}
        </Button>
        <Button icon={<Maximize2 />} onClick={arrangeTight}>
          {S.grid.tight}
        </Button>
      </div>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-xs text-muted">
        <li>
          {S.grid.arrange}：{S.grid.arrangeHint}
        </li>
        <li>
          {S.grid.square}：{S.grid.squareHint(sq.width, sq.height)}
        </li>
        <li>
          {S.grid.tight}：{S.grid.tightHint}
        </li>
        {has ? null : <li>{S.grid.needItems}</li>}
      </ul>
    </Section>
  );
}
