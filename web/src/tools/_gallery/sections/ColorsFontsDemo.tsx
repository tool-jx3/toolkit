import { useState } from 'react';
import type { Hsv } from '@/core/color';
import type { FontValue } from '@/core/fonts';
import { DEFAULT_GRADIENT, type Gradient, gradientToCss } from '@/core/gradient';
import { ColorField, Field, FontPicker, GradientField, HsvPanel, hsvToHex, Section } from '@/ui';

/** 顏色與字型元件的各種狀態 */
export function ColorsFontsDemo() {
  const [c1, setC1] = useState('#7b5ea7');
  const [c2, setC2] = useState('#f0c36d99');
  const [c3, setC3] = useState('#27ae60');
  const [g, setG] = useState<Gradient>(DEFAULT_GRADIENT);
  const [hsv, setHsv] = useState<Hsv>({ h: 268, s: 0.3, v: 0.18 });
  const [f1, setF1] = useState<FontValue>({
    source: 'google',
    family: 'LXGW WenKai TC',
    weight: 400,
  });
  const [f2, setF2] = useState<FontValue>({
    source: 'google',
    family: 'Noto Serif TC',
    weight: 700,
  });
  return (
    <div className="flex flex-col gap-3">
      <Section title="色彩欄 ColorField">
        <Field
          label="不含透明度"
          hint="可以輸入 #rgb、#rrggbb 或 rgb()；點色塊開調色盤（支援時有吸管）。"
        >
          <ColorField value={c1} onChange={setC1} />
        </Field>
        <Field label="含透明度">
          <ColorField value={c2} onChange={setC2} alpha />
        </Field>
        <Field label="只有色塊（窄空間）" layout="inline">
          <ColorField value={c3} onChange={setC3} showInput={false} />
        </Field>
        <Field label="停用">
          <ColorField value="#888888" onChange={() => {}} disabled />
        </Field>
      </Section>
      <Section title="HSV 面板 HsvPanel">
        <Field
          label="彩度／明度＋色相"
          hint="值直接是 HSV（不是色碼），可以指定標記的初始位置；灰色時色相不會遺失。"
        >
          <HsvPanel value={hsv} onChange={setHsv} />
        </Field>
        <p className="m-0 flex items-center gap-2 font-mono text-xs text-muted">
          <span
            aria-hidden
            className="inline-block size-5 rounded-sm border border-border-strong"
            style={{ background: hsvToHex(hsv) }}
          />
          {hsvToHex(hsv)}（色相 {Math.round(hsv.h)}°、彩度 {Math.round(hsv.s * 100)}%、明度{' '}
          {Math.round(hsv.v * 100)}%）
        </p>
      </Section>
      <Section title="漸層 GradientField">
        <Field
          label="背景漸層"
          hint="拖曳色標、點預覽條空白處新增；色標有焦點時方向鍵移動、Delete 刪除。"
        >
          <GradientField value={g} onChange={setG} />
        </Field>
        <div
          aria-hidden
          className="h-16 rounded-md border border-border"
          style={{ backgroundImage: gradientToCss(g) }}
        />
      </Section>
      <Section title="字型 FontPicker">
        <Field label="內文字型" hint="Google 字型／電腦字型／上傳字型三合一。">
          <FontPicker value={f1} onChange={setF1} />
        </Field>
        <p
          className="m-0 rounded-md bg-surface-2 p-3 text-lg"
          style={{ fontFamily: `"${f1.family}", var(--font-ui)`, fontWeight: f1.weight }}
        >
          調查員們推開了地下室的門。
        </p>
        <Field label="只列繁中、不能上傳">
          <FontPicker value={f2} onChange={setF2} scripts={['tc']} allowUpload={false} />
        </Field>
        <Field label="停用">
          <FontPicker value={f2} onChange={() => {}} disabled />
        </Field>
      </Section>
    </div>
  );
}
