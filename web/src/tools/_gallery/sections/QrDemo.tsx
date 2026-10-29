/**
 * 元件展示頁「模組」分頁：core/qr 的示範——文字 → 有樣式的 QR code（點的樣式、角、漸層）→ 畫好後讀回來
 * （qr-maker 引入時新增）。實際的用法見 web/src/tools/qr-maker/（render.ts、Preview.tsx）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildQrScene,
  checkQrPixels,
  drawQrScene,
  encodeQr,
  QR_DOT_TYPES,
  type QrDotType,
} from '@/core/qr';
import { Field, Section, Select, TextInput } from '@/ui';

const SIZE = 200;

export function QrDemo() {
  const [text, setText] = useState('https://example.com/展示頁');
  const [dot, setDot] = useState<QrDotType>('rounded');
  const [result, setResult] = useState('');
  const canvas = useRef<HTMLCanvasElement>(null);
  const built = useMemo(() => {
    const r = encodeQr(text, { ecl: 'M' });
    if (!r.ok) return null;
    const s = buildQrScene(r.code, 'M', {
      width: SIZE,
      height: SIZE,
      margin: 8,
      shape: 'square',
      dots: {
        type: dot,
        roundSize: true,
        paint: {
          kind: 'gradient',
          gradient: {
            kind: 'linear',
            angle: 135,
            stops: [
              { offset: 0, color: '#2b1b5e' },
              { offset: 1, color: '#0b4f5c' },
            ],
          },
        },
      },
      cornerSquare: { type: 'extra-rounded', paint: { kind: 'solid', color: '#7a1d2e' } },
      cornerDot: { type: 'dot', paint: null },
      background: { paint: { kind: 'solid', color: '#ffffff' }, round: 0.1 },
      image: null,
    });
    return s.ok ? s.scene : null;
  }, [text, dot]);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    if (!built) {
      ctx.clearRect(0, 0, SIZE, SIZE);
      setResult('（沒有內容或放不下）');
      return;
    }
    drawQrScene(ctx, built);
    const c = checkQrPixels({
      pixels: ctx.getImageData(0, 0, SIZE, SIZE).data,
      width: SIZE,
      height: SIZE,
      grid: built.grid,
    });
    setResult(
      c.decoded.ok
        ? `讀回來：「${c.decoded.text}」（第 ${c.decoded.version} 版・等級 ${c.decoded.ecl}）`
        : `讀不出來（${c.decoded.reason}）`,
    );
  }, [built]);

  return (
    <Section title="QR code（core/qr）">
      <div className="flex flex-wrap items-start gap-3">
        <canvas
          ref={canvas}
          width={SIZE}
          height={SIZE}
          className="checker block size-[200px] rounded-sm"
        />
        <div className="flex min-w-48 flex-1 flex-col gap-2">
          <Field label="內容">
            <TextInput value={text} onChange={(e) => setText(e.target.value)} />
          </Field>
          <Field label="點的樣式">
            <Select<QrDotType>
              value={dot}
              onValueChange={setDot}
              options={QR_DOT_TYPES.map((t) => ({ value: t, label: t }))}
            />
          </Field>
          <p className="m-0 text-sm" data-testid="qr-demo-result">
            {result}
          </p>
        </div>
      </div>
    </Section>
  );
}
