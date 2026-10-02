/**
 * 一條色條的編輯卡（F10～F17、F26 的按鈕）：標題「第 n 條」、倍率、刪除；新增一段、圖片取色；
 * 分段清單（顏色、比例、刪除，拖曳把手或整列拖曳排序，只在同一條之內）。
 */
import { GripVertical, Pipette, Plus, Trash2, X } from 'lucide-react';
import { useId } from 'react';
import { Button, ColorField, cn, IconButton, NumberInput, SortableList } from '@/ui';
import { type Bar, RANGE } from './logic';
import { actions } from './store';
import { S } from './strings';

const noop = () => {};

export interface BarCardProps {
  bar: Bar;
  index: number;
  /** 畫布把手開啟時醒目顯示 */
  highlight: boolean;
  onPick: (bar: Bar, index: number) => void;
}

export function BarCard({ bar, index, highlight, onPick }: BarCardProps) {
  const n = index + 1;
  const scaleId = useId();
  return (
    <section
      aria-label={S.barTitle(n)}
      data-bar={index}
      data-highlight={highlight || undefined}
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-md border p-2.5 transition-colors',
        highlight ? 'border-accent bg-accent-soft' : 'border-border bg-surface-2',
      )}
    >
      <div className="flex min-w-0 items-center gap-2">
        <h4 className="m-0 min-w-0 flex-1 truncate text-sm font-semibold text-fg">
          {S.barTitle(n)}
        </h4>
        <label htmlFor={scaleId} className="shrink-0 text-xs text-muted" title={S.barScaleHint}>
          {S.barScale}
        </label>
        <NumberInput
          id={scaleId}
          aria-label={S.barScaleLabel(n)}
          value={bar.scale}
          onChange={noop}
          onCommit={(v) => actions.setBarScale(bar.id, v)}
          min={RANGE.barScale.min}
          step={0.1}
          precision={2}
          size="sm"
          className="w-24 shrink-0"
        />
        <IconButton
          label={S.removeBar(n)}
          icon={<Trash2 />}
          size="sm"
          onClick={() => actions.removeBar(bar.id)}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Plus />} onClick={() => actions.addSegment(bar.id)}>
          {S.addSegment}
        </Button>
        <Button
          size="sm"
          icon={<Pipette />}
          aria-label={S.pickLabel(n)}
          onClick={() => onPick(bar, index)}
        >
          {S.pick}
        </Button>
      </div>
      <SortableList
        aria-label={S.segmentsLabel(n)}
        items={bar.segments}
        getId={(s) => s.id}
        mode="drop"
        cancelOutside
        onMove={(from, to) => actions.moveSegment(bar.id, from, to)}
        empty={S.segmentsEmpty}
        renderItem={(seg, { index: k }) => (
          <div className="flex min-w-0 items-center gap-1.5 py-1 pr-1 pl-1" data-segment={k}>
            <span
              data-drag-handle
              aria-hidden
              className="flex shrink-0 cursor-grab touch-none text-muted [&_svg]:size-4"
            >
              <GripVertical />
            </span>
            <ColorField
              aria-label={S.segmentName(k + 1)}
              value={seg.color}
              onChange={(color) => actions.updateSegment(bar.id, seg.id, { color })}
              className="min-w-0 flex-1"
            />
            <NumberInput
              aria-label={S.segmentRatio(k + 1)}
              value={seg.ratio}
              onChange={noop}
              onCommit={(ratio) => actions.updateSegment(bar.id, seg.id, { ratio })}
              min={RANGE.segmentRatio.min}
              step={0.1}
              precision={3}
              size="sm"
              className="w-20 shrink-0"
            />
            <IconButton
              label={S.removeSegment(k + 1)}
              icon={<X />}
              size="sm"
              onClick={() => actions.removeSegment(bar.id, seg.id)}
            />
          </div>
        )}
      />
    </section>
  );
}
