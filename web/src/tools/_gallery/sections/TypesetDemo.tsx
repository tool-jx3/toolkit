/**
 * core/typeset 的示範：橫書／直書、禁則、依長度換行、放不下時自動縮小、九宮格擺放（AnchorPicker）、
 * 外框與光暈分層的逐字 sprite。
 */
import { useEffect, useRef, useState } from 'react';
import { canvasFont, fontStack, paintGlyph, placeBox, typesetToFit } from '@/core/typeset';
import { AnchorPicker, type AnchorValue, Field, Section, Segmented, TextArea, Toggle } from '@/ui';

const W = 480;
const H = 270;

export function TypesetDemo() {
  const [text, setText] = useState('「大成功」！\n調查員們，請擲骰。');
  const [vertical, setVertical] = useState(false);
  const [anchor, setAnchor] = useState<AnchorValue>('mc');
  const [glow, setGlow] = useState(true);
  const ref = useRef<HTMLCanvasElement>(null);
  const [info, setInfo] = useState('');

  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const font = (px: number) =>
      canvasFont(fontStack({ family: 'Noto Sans TC', styleClass: 'sans' }, text), 700, px);
    const area = { width: W, height: H, marginX: 24, marginY: 20 };
    const r = typesetToFit(
      {
        main: text,
        size: 64,
        mainFont: font,
        vertical,
        tracking: 0.05,
        leading: 1.4,
        wrapLength: vertical ? H - 40 : W - 48,
      },
      { ...area, pad: 12 },
    );
    const pos = placeBox({ w: r.block.w, h: r.block.h }, { ...area, pad: 12 }, anchor);
    const style = {
      fill: { type: 'solid' as const, color: '#fff7e0', stops: [], opacity: 1 },
      stroke: { w: 3, color: '#2a1840' },
      outer: null,
      shadow: null,
      glow: glow ? { color: '#c49bff', spread: 12 } : null,
    };
    ctx.clearRect(0, 0, W, H);
    for (const g of r.block.glyphs) {
      const art = paintGlyph(g.ch, r.mainCss, g.m, g.adv, r.mainMeter.central, style, null);
      if (!art) continue;
      ctx.save();
      ctx.translate(pos.x + g.x, pos.y + g.y);
      if (g.rot0) ctx.rotate(g.rot0);
      if (art.halo) ctx.drawImage(art.halo, -art.px, -art.py);
      ctx.drawImage(art.body, -art.px, -art.py);
      ctx.restore();
    }
    setInfo(
      `${r.lines.main.length} 行・字級 ${r.size.toFixed(1)} px${r.shrunk ? `（自動縮小 ${(r.scale * 100).toFixed(0)}%）` : ''}`,
    );
  }, [text, vertical, anchor, glow]);

  return (
    <Section title="文字排版（core/typeset）與九宮格位置（AnchorPicker）">
      <canvas ref={ref} width={W} height={H} className="checker block h-auto w-full rounded-sm" />
      <p className="m-0 text-xs text-muted" aria-live="polite">
        {info}
      </p>
      <Field label="文字">
        <TextArea value={text} rows={2} onChange={(e) => setText(e.target.value)} />
      </Field>
      <Field label="方向">
        <Segmented
          value={vertical ? 'v' : 'h'}
          onValueChange={(v) => setVertical(v === 'v')}
          options={[
            { value: 'h', label: '橫書' },
            { value: 'v', label: '直書' },
          ]}
        />
      </Field>
      <Field label="位置">
        <AnchorPicker value={anchor} onChange={setAnchor} />
      </Field>
      <Field label="光暈（分層 sprite）" layout="inline">
        <Toggle checked={glow} onCheckedChange={setGlow} />
      </Field>
    </Section>
  );
}
