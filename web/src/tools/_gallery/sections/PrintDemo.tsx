/**
 * 印刷尺寸與解析度（id-ticket 移植時新增）：core/paged 的 `printPixels`（mm＋出血 → 指定 dpi 的整數像素）、
 * core/encode 的 `setPngDpi`（PNG 寫入 pHYs，印刷軟體依它換算實際尺寸）。
 */
import { useState } from 'react';
import { readPngDpi, setPngDpi } from '@/core/encode';
import { downloadBlob } from '@/core/files';
import { canvasToBlob, makeCanvas } from '@/core/image';
import { mmToDots, printPixels } from '@/core/paged';
import { Button, Field, FieldRow, NumberInput, Section, Segmented } from '@/ui';

const DPIS = [300, 600] as const;

export function PrintDemo() {
  const [w, setW] = useState(54);
  const [h, setH] = useState(86);
  const [bleed, setBleed] = useState(2);
  const [dpi, setDpi] = useState<number>(600);
  const [note, setNote] = useState('');
  const px = printPixels({ w, h }, dpi, bleed);
  const download = async () => {
    const c = makeCanvas(px.width, px.height);
    const ctx = c.getContext('2d') as CanvasRenderingContext2D | null;
    if (!ctx) return;
    /* 出血（淡色）＋成品範圍（白）＋裁切線 */
    const b = mmToDots(bleed, dpi);
    ctx.fillStyle = '#f4c7d4';
    ctx.fillRect(0, 0, px.width, px.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(b, b, px.width - b * 2, px.height - b * 2);
    ctx.strokeStyle = '#d0335e';
    ctx.lineWidth = Math.max(1, dpi / 150);
    ctx.setLineDash([dpi / 30, dpi / 50]);
    ctx.strokeRect(b, b, px.width - b * 2, px.height - b * 2);
    const bytes = setPngDpi(
      new Uint8Array(await (await canvasToBlob(c, 'image/png')).arrayBuffer()),
      dpi,
    );
    const back = readPngDpi(bytes);
    setNote(`已寫入 ${back?.x ?? '—'} dpi（${bytes.length.toLocaleString('zh-TW')} 位元組）`);
    downloadBlob(new Blob([bytes], { type: 'image/png' }), `print-${w}x${h}mm-${dpi}dpi.png`);
  };
  return (
    <Section title="印刷尺寸與解析度（printPixels、setPngDpi）">
      <FieldRow columns={3}>
        <Field label="成品寬">
          <NumberInput value={w} onChange={setW} min={10} max={420} unit="mm" />
        </Field>
        <Field label="成品高">
          <NumberInput value={h} onChange={setH} min={10} max={420} unit="mm" />
        </Field>
        <Field label="出血">
          <NumberInput value={bleed} onChange={setBleed} min={0} max={10} step={0.5} unit="mm" />
        </Field>
      </FieldRow>
      <Field label="解析度">
        <Segmented<string>
          value={String(dpi)}
          onValueChange={(v) => setDpi(Number(v))}
          options={DPIS.map((d) => ({ value: String(d), label: `${d} dpi` }))}
        />
      </Field>
      <p className="m-0 text-sm tabular-nums" data-testid="print-demo-size">
        {w + bleed * 2} × {h + bleed * 2} mm → {px.width} × {px.height} px
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void download()}>
          下載測試 PNG
        </Button>
        <span className="text-xs text-muted" role="status">
          {note}
        </span>
      </div>
      <p className="m-0 text-xs text-muted">
        證件（54 × 86 mm）600 dpi：卡片 1276 × 2031、含 2 mm 出血 1370 × 2126。印刷軟體依 PNG 的
        pHYs 換算實際尺寸（瀏覽器的 toBlob 不寫）。
      </p>
    </Section>
  );
}
