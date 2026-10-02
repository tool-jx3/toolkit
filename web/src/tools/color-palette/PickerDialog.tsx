/**
 * 圖片取色視窗（F26～F38）：ImageSampler 放在 Dialog 裡。
 * - 每次開啟：清掉上次的圖片、取色點，分割線回到等分，縮放回 100%；取色方式、數量、容許值沿用上次的值（同一次開頁內）。
 * - 手動滴管：依點選順序取色，點滿 n 個才能套用（比例都是 1）。
 * - 自動取色：n − 1 條分割線，每段取一個主色（core/image 的 vividColorsBySplits），比例＝該段占圖片高度的比例。
 * - 結果取代該條的全部分段；取消、關閉鈕、Esc 都不改變分段。
 */
import { Check, ImagePlus, RotateCcw } from 'lucide-react';
import { type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { evenSplits, getImageData, vividColorsBySplits } from '@/core/image';
import {
  Button,
  Dialog,
  DialogClose,
  Field,
  ImageDrop,
  ImageSampler,
  NumberInput,
  type SamplePoint,
  Tabs,
} from '@/ui';
import { type PickedColor, picksFromPoints, RANGE } from './logic';
import { S } from './strings';

export type PickMode = 'points' | 'splits';

export interface PickerTarget {
  barId: string;
  /** 第幾條（1 起算，標題用） */
  number: number;
}

export interface PickerHandle {
  /** 開啟取色視窗（每次都清掉上次的圖片、取色點與縮放） */
  open: (target: PickerTarget) => void;
}

export interface PickerDialogProps {
  onApply: (barId: string, picks: PickedColor[]) => void;
  ref?: Ref<PickerHandle>;
}

export function PickerDialog({ onApply, ref }: PickerDialogProps) {
  const [target, setTarget] = useState<PickerTarget | null>(null);
  /* 沿用上次的值（同一次開頁內） */
  const [mode, setMode] = useState<PickMode>('points');
  const [count, setCount] = useState<number>(RANGE.pickCount.default);
  const [tolerance, setTolerance] = useState<number>(RANGE.tolerance.default);
  /* 每次開啟都清掉 */
  const [image, setImageState] = useState<ImageBitmap | null>(null);
  const [points, setPoints] = useState<SamplePoint[]>([]);
  const [splits, setSplits] = useState<number[]>(() => evenSplits(RANGE.pickCount.default));
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const imageRef = useRef<ImageBitmap | null>(null);

  const setImage = (next: ImageBitmap | null) => {
    const old = imageRef.current;
    imageRef.current = next;
    setImageState(next);
    /* 等畫面換掉之後再釋放舊圖 */
    if (old && old !== next) setTimeout(() => old.close(), 0);
  };

  /** 清掉取色點、分割線回到等分 */
  const resetMarks = (n = count) => {
    setPoints([]);
    setSplits(evenSplits(n));
    setError(null);
  };

  /* 開啟時清掉圖片、取色點，分割線回到等分，縮放回 100%（取色方式、數量、容許值沿用） */
  const countRef = useRef(count);
  countRef.current = count;
  // biome-ignore lint/correctness/useExhaustiveDependencies: setImage 只用到 ref 與 setState（都不會變）
  useImperativeHandle(
    ref,
    () => ({
      open: (t) => {
        setImage(null);
        setPoints([]);
        setSplits(evenSplits(countRef.current));
        setZoom(1);
        setError(null);
        setTarget(t);
      },
    }),
    [],
  );
  /* 關閉時也放掉圖片（不保留取色視窗的圖片） */
  const onClose = () => {
    setTarget(null);
    setImage(null);
  };

  /* 離開頁面時釋放圖片 */
  useEffect(() => () => imageRef.current?.close(), []);

  const apply = () => {
    if (!target) return;
    if (!image) {
      setError(S.needImage);
      return;
    }
    let picks: PickedColor[];
    if (mode === 'points') {
      if (points.length < count) {
        setError(S.needPoints(count));
        return;
      }
      picks = picksFromPoints(points.slice(0, count));
    } else {
      picks = vividColorsBySplits(getImageData(image), splits, { tolerance });
    }
    onApply(target.barId, picks);
    onClose();
  };

  const controls = (m: PickMode) => (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <Field label={m === 'points' ? S.countPoints : S.countSplits} layout="inline">
          <NumberInput
            value={count}
            onChange={() => {}}
            onCommit={(n) => {
              /* 數量改了（確定時）才清掉取色點、重設分割線 */
              if (n === count) return;
              setCount(n);
              resetMarks(n);
            }}
            min={RANGE.pickCount.min}
            max={RANGE.pickCount.max}
            step={1}
            className="w-20"
          />
        </Field>
        {m === 'splits' ? (
          <Field label={S.tolerance} layout="inline">
            <NumberInput
              value={tolerance}
              onChange={setTolerance}
              min={RANGE.tolerance.min}
              max={RANGE.tolerance.max}
              step={1}
              className="w-20"
            />
          </Field>
        ) : null}
        <Button size="sm" icon={<RotateCcw />} title={S.resetHint} onClick={() => resetMarks()}>
          {S.reset}
        </Button>
      </div>
      <p className="m-0 text-xs text-muted">
        {m === 'points' ? S.pointsHint : `${S.splitsHint}${S.toleranceHint}`}
      </p>
      {m === 'points' ? <Progress points={points} count={count} /> : null}
    </div>
  );

  return (
    <Dialog
      title={target ? S.pickerTitle(target.number) : ''}
      description={S.pickerDescription}
      size="xl"
      /* 和舊版相同：點外面不關（誤點會丟掉載入的圖與取色點），用 Esc、取消或關閉鈕關 */
      dismissOnOutside={false}
      open={!!target}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      footer={
        <>
          <DialogClose>{S.cancel}</DialogClose>
          <Button variant="primary" onClick={apply}>
            {S.apply}
          </Button>
        </>
      }
    >
      <div className="flex min-w-0 flex-col gap-3">
        <ImageDrop
          compact
          paste="document"
          label={S.pickerDrop}
          buttonLabel={S.pickerDropButton}
          hint={S.pickerDropHint}
          icon={<ImagePlus />}
          onImages={([first]) => {
            if (!first) return;
            setImage(first.bitmap);
            resetMarks();
            setZoom(1);
          }}
        />
        <Tabs<PickMode>
          aria-label={S.modeLabel}
          value={mode}
          onValueChange={(m) => {
            setMode(m);
            resetMarks();
          }}
          items={[
            { value: 'points', label: S.modePoints, content: controls('points') },
            { value: 'splits', label: S.modeSplits, content: controls('splits') },
          ]}
        />
        {error ? (
          <p role="alert" className="m-0 text-sm text-danger" data-testid="picker-error">
            {error}
          </p>
        ) : null}
        <ImageSampler
          image={image}
          mode={mode}
          points={points}
          onPointsChange={(p) => {
            setPoints(p);
            setError(null);
          }}
          maxPoints={count}
          splits={splits}
          onSplitsChange={setSplits}
          zoom={zoom}
          onZoomChange={setZoom}
          minZoom={RANGE.pickerZoom.min / 100}
          maxZoom={RANGE.pickerZoom.max / 100}
          empty={S.pickerEmpty}
          viewportClassName="h-[min(42dvh,480px)]"
        />
      </div>
    </Dialog>
  );
}

/** 手動滴管的進度（F31）：一列色塊（未取的是灰底問號）＋「已取 i／共 n」，點滿後改成完成樣式 */
function Progress({ points, count }: { points: readonly SamplePoint[]; count: number }) {
  const done = points.length >= count;
  return (
    <div className="flex flex-col gap-1.5" data-testid="picker-progress">
      <ol aria-label={S.progressLabel} className="m-0 flex list-none flex-wrap gap-1 p-0">
        {Array.from({ length: count }, (_, i) => {
          const p = points[i];
          return (
            <li
              // biome-ignore lint/suspicious/noArrayIndexKey: 位置固定的格子
              key={i}
              aria-label={p ? S.slotFilled(i + 1, p.color) : S.slotEmpty(i + 1)}
              data-slot={i}
              data-color={p?.color}
              className="flex size-6 items-center justify-center rounded-sm border border-border-strong bg-surface-3 text-xs text-muted"
              style={p ? { background: p.color } : undefined}
            >
              {p ? null : '?'}
            </li>
          );
        })}
      </ol>
      <p
        className={
          done
            ? 'm-0 flex items-center gap-1 text-sm font-medium text-success [&_svg]:size-4'
            : 'm-0 text-sm text-muted'
        }
        data-done={done || undefined}
        data-testid="picker-progress-text"
      >
        {done ? <Check aria-hidden /> : null}
        {done ? S.progressDone : S.progress(points.length, count)}
      </p>
    </div>
  );
}
