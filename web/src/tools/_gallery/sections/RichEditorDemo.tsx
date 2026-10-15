/**
 * 格式化文字編輯器（RichTextEditor，完整格式）＋core/richtext 的分頁＋core/scene 的 rich 節點（prose-card 移植時新增）：
 * 左邊打字、套用格式（粗體、斜體、刪除線、顏色、螢光筆、字型、字級、段落對齊、分頁），下面的畫布用同一份資料排版、分頁，
 * 一頁 360 × 200（示範用的小頁）。實際的用法見短文圖片產生器（`web/src/tools/prose-card/`）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { fontFamilyCss } from '@/core/fonts';
import { layoutRich, paginateRows, type RichDoc, sliceDoc } from '@/core/richtext';
import {
  drawScene,
  loadSceneFonts,
  type RichNode,
  richAdvance,
  richRowMetrics,
} from '@/core/scene';
import { RichTextEditor, Section } from '@/ui';

const W = 360;
const H = 200;
const PAD = 16;
const FAMILY = 'Noto Sans TC';

const SAMPLE: RichDoc = {
  lines: [
    { runs: [{ text: '霧港燈塔・後日談', bold: true, color: '', size: 22 }], align: 'center' },
    {
      runs: [
        { text: '燈塔的光，終於在第三夜', bold: false, color: '' },
        { text: '熄滅', bold: false, color: '#8a3b2e', highlight: '#fff0a8' },
        {
          text: '了。我們沒有找到船長，只找到他寫在日誌最後一頁的那句話——',
          bold: false,
          color: '',
        },
      ],
    },
    { runs: [{ text: '「別回頭看海。」', bold: false, color: '', italic: true }], align: 'right' },
    {
      runs: [{ text: '分頁之後的這一段會從新的一頁開始。', bold: false, color: '', strike: true }],
      pageBreak: true,
    },
  ],
};

const FONTS = [
  { value: 'Noto Sans TC', label: '思源黑體' },
  { value: 'Noto Serif TC', label: '思源宋體' },
  { value: 'Huninn', label: '粉圓體' },
];

function node(doc: RichDoc, y: number, h: number, openEnd = false): RichNode {
  return {
    kind: 'rich',
    x: PAD,
    y,
    w: W - PAD * 2,
    h,
    doc,
    font: { family: FAMILY, size: 15, weight: 400 },
    lineHeight: 1.7,
    color: '#2a2823',
    wrap: 'word',
    align: 'justify',
    openEnd,
    bleed: 6,
  };
}

function Pages({ doc }: { doc: RichDoc }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [tick, setTick] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 是字型載好後重排
  const pages = useMemo(() => {
    const ctx = document.createElement('canvas').getContext('2d') as CanvasRenderingContext2D;
    const base = node(doc, 0, 0);
    const rows = layoutRich(doc, {
      width: base.w,
      advance: (ch, bold, run) => richAdvance(ctx, base, ch, bold, run),
      wrap: 'word',
    });
    const heights = new Map(rows.map((r) => [r, richRowMetrics(ctx, base, r).height]));
    const res = paginateRows(doc, rows, {
      pageHeight: () => H - PAD * 2,
      rowHeight: (r) => heights.get(r) ?? 0,
      maxPages: 6,
    });
    return res.pages.map((p) => {
      let h = 0;
      for (let i = p.from; i < p.to; i++) h += heights.get(rows[i]) ?? 0;
      return node(sliceDoc(doc, p.start, p.end), PAD, h + 1, p.openEnd);
    });
  }, [doc, tick]);
  useEffect(() => {
    let alive = true;
    void loadSceneFonts(pages).then((changed) => {
      if (changed && alive) setTick((t) => t + 1);
    });
    return () => {
      alive = false;
    };
  }, [pages]);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    ctx.clearRect(0, 0, c.width, c.height);
    pages.forEach((n, i) => {
      ctx.save();
      ctx.translate(0, i * (H + 12));
      ctx.fillStyle = '#f2eee5';
      ctx.fillRect(0, 0, W, H);
      drawScene(ctx, [n]);
      ctx.restore();
    });
  });
  return (
    <canvas
      ref={ref}
      width={W}
      height={pages.length * (H + 12) - 12}
      className="block h-auto w-full max-w-[360px] rounded-sm"
      aria-label={`排好的 ${pages.length} 頁`}
      data-testid="rich-demo-pages"
    />
  );
}

export function RichEditorDemo() {
  const [doc, setDoc] = useState<RichDoc>(SAMPLE);
  const [presets, setPresets] = useState<string[]>([]);
  return (
    <Section title="格式化文字編輯器（RichTextEditor＋core/richtext 的分頁）">
      <p className="m-0 text-sm text-muted">
        先選取文字再按工具列；沒有選取時格式套用到接下來打的字。Ctrl＋Enter 分頁，段落開頭按
        Backspace 拿掉分頁。下面的畫布用同一份資料排版（左右對齊、英數字詞不拆開）、分頁。
      </p>
      <RichTextEditor
        value={doc}
        onChange={setDoc}
        fontFamily={fontFamilyCss(FAMILY)}
        baseFont={FAMILY}
        fontCss={fontFamilyCss}
        baseSize={15}
        displaySize={15}
        lineHeight={1.7}
        color="#2a2823"
        background="#f2eee5"
        align="justify"
        minHeight="9rem"
        aria-label="示範本文"
        toolbar={{
          fonts: FONTS,
          sizes: [12, 15, 18, 22, 28],
          textPresets: presets,
          onTextPresetsChange: setPresets,
        }}
      />
      <Pages doc={doc} />
    </Section>
  );
}
