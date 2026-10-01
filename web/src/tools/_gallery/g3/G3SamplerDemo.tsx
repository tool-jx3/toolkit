/**
 * 「立繪工作台」：取色視窗（ImageSampler 放在 Dialog 裡）＋主色的「依鮮豔度加權」模式（core/image）。
 */
import { Pipette } from 'lucide-react';
import { useMemo, useState } from 'react';
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
  Section,
  Segmented,
} from '@/ui';
import { makeBands } from './art';

type Mode = 'points' | 'splits';

export function G3SamplerDemo() {
  const demo = useMemo(() => makeBands(), []);
  const [image, setImage] = useState<ImageBitmap | HTMLCanvasElement>(demo);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('splits');
  const [count, setCount] = useState(3);
  const [tolerance, setTolerance] = useState(20);
  const [zoom, setZoom] = useState(1);
  const [points, setPoints] = useState<SamplePoint[]>([]);
  const [splits, setSplits] = useState<number[]>(evenSplits(3));
  const [result, setResult] = useState<{ color: string; ratio: number }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const reset = (n = count) => {
    setPoints([]);
    setSplits(evenSplits(n));
    setError(null);
  };
  const apply = () => {
    if (mode === 'points') {
      if (points.length < count) return setError(`請點滿 ${count} 個顏色`);
      setResult(points.map((p) => ({ color: p.color, ratio: 1 })));
    } else {
      setResult(vividColorsBySplits(getImageData(image), splits, { tolerance }));
    }
    setOpen(false);
  };

  return (
    <Section title="取色 ImageSampler＋依鮮豔度取主色" persistKey="_gallery:g3:sampler">
      <p className="m-0 text-xs text-muted">
        手動：在圖上點選取色（點滿後可拖動圓點微調）。自動：拖動分割線，每段取一個主色（core/image
        的 dominantColorVivid：偏好鮮豔、代表色是實際像素，不是平均色）。按住 Ctrl 滾輪縮放。
      </p>
      <ImageDrop
        compact
        paste="off"
        label="換一張圖片"
        onImages={([im]) => {
          setImage(im.bitmap);
          reset();
        }}
      />
      <Button
        icon={<Pipette />}
        onClick={() => {
          reset();
          setZoom(1);
          setOpen(true);
        }}
      >
        開啟取色視窗
      </Button>
      {result.length ? (
        <ul className="m-0 flex list-none flex-wrap gap-2 p-0" data-testid="sampler-result">
          {result.map((c, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 依由上到下的順序
            <li key={i} className="flex items-center gap-1.5 text-xs">
              <span
                aria-hidden
                className="size-5 rounded-sm border border-border"
                style={{ background: c.color }}
              />
              <span className="font-mono">{c.color}</span>
              <span className="text-muted">{c.ratio}</span>
            </li>
          ))}
        </ul>
      ) : null}
      <Dialog
        title="從圖片取色"
        size="xl"
        open={open}
        onOpenChange={setOpen}
        footer={
          <>
            <DialogClose>取消</DialogClose>
            <Button variant="primary" onClick={apply}>
              套用
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-end gap-3">
            <Segmented
              aria-label="取色方式"
              value={mode}
              onValueChange={(m) => {
                setMode(m);
                reset();
              }}
              options={[
                { value: 'points', label: '手動滴管' },
                { value: 'splits', label: '自動取色' },
              ]}
            />
            <Field label={mode === 'points' ? '取幾個顏色' : '分成幾段'} layout="inline">
              <NumberInput
                value={count}
                min={1}
                max={20}
                onChange={setCount}
                onCommit={(n) => reset(n)}
                className="w-20"
              />
            </Field>
            {mode === 'splits' ? (
              <Field label="相近色容許值" layout="inline">
                <NumberInput
                  value={tolerance}
                  min={1}
                  max={50}
                  onChange={setTolerance}
                  className="w-20"
                />
              </Field>
            ) : null}
            <Button size="sm" onClick={() => reset()}>
              重設
            </Button>
          </div>
          {mode === 'points' ? (
            <p className="m-0 text-xs text-muted" data-testid="sampler-progress">
              {points.length < count
                ? `已取 ${points.length}／共 ${count}`
                : '已取滿，可以拖動圓點微調'}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="m-0 text-xs text-danger">
              {error}
            </p>
          ) : null}
          <ImageSampler
            image={image}
            mode={mode}
            points={points}
            onPointsChange={setPoints}
            maxPoints={count}
            splits={splits}
            onSplitsChange={setSplits}
            zoom={zoom}
            onZoomChange={setZoom}
          />
        </div>
      </Dialog>
    </Section>
  );
}
