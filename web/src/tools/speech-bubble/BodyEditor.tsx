/**
 * 泡泡的內文：格式化文字編輯區（2026-10 第二步，規格 F70～F73）。用共用的 RichTextEditor：
 * 粗體、斜體、刪除線、底線、文字顏色、螢光筆、清除格式（沒有字型、字級、分頁、段落對齊）。
 * 編輯區的字型、底色、字色、對齊照這個泡泡（看得清楚時）；復原由工具負責：連續打字、連續改顏色合成一步，
 * 套用一次格式＝一步（store 的 setBubbleRich）。
 */
import { type KeyboardEvent, useEffect, useMemo } from 'react';
import { contrastRatio, formatHex, parseColor } from '@/core/color';
import { fontFamilyCss } from '@/core/fonts';
import { docLength, type RichAlign } from '@/core/richtext';
import { Field, RichTextEditor, useToast } from '@/ui';
import {
  type Bubble,
  bubbleDoc,
  bubbleFmt,
  HIGHLIGHT_SWATCHES,
  MAX_TEXT,
  type Palette,
  TEXT_SWATCHES,
} from './model';
import { flushTextHistory, redoStep, setBubbleRich, undoStep, useSb } from './store';
import { S } from './strings';
import { styleOf } from './styles';

/** 色碼（可能有透明度）→ 不透明的 #rrggbb（疊在 under 上） */
function flatten(color: string, under: string): string {
  const c = parseColor(color);
  const u = parseColor(under) ?? { r: 255, g: 255, b: 255, a: 1 };
  if (!c) return under;
  const k = c.a;
  return formatHex(
    {
      r: Math.round(c.r * k + u.r * (1 - k)),
      g: Math.round(c.g * k + u.g * (1 - k)),
      b: Math.round(c.b * k + u.b * (1 - k)),
      a: 1,
    },
    false,
  );
}

/** 編輯區的底色與字色：照泡泡的底色與內文色；看不清楚時（對比不到 3）改用白底深字 */
export function editorColors(c: Palette): { background: string; color: string } {
  const text = flatten(c.text, '#ffffff');
  for (const under of ['#ffffff', '#1f2329']) {
    const bg = flatten(c.fill, under);
    const fg = flatten(c.text, bg);
    if (contrastRatio(fg, bg) >= 3) return { background: bg, color: fg };
  }
  return contrastRatio(text, '#ffffff') >= 3
    ? { background: '#ffffff', color: text }
    : { background: '#ffffff', color: '#363636' };
}

/** 常用色：泡泡的內文色、強調色在前面（不透明的 #rrggbb；格式只存 6 碼色碼） */
const hex6 = (color: string) => {
  const c = parseColor(color);
  return c ? formatHex({ ...c, a: 1 }, false) : null;
};

export function BodyEditor({ bubble }: { bubble: Bubble }) {
  const toast = useToast();
  const baseFont = useSb((s) => s.data.font);
  const f = bubbleFmt(bubble);
  const font = f.font ?? baseFont;
  const align: RichAlign =
    f.textAlign === 'auto' ? styleOf(bubble.style).textAlign : (f.textAlign as RichAlign);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只看內文與格式
  const value = useMemo(() => bubbleDoc(bubble), [bubble.text, bubble.rich]);
  const { background, color } = editorColors(bubble.colors);
  const swatches = [
    ...new Set(
      [bubble.colors.text, bubble.colors.accent, ...TEXT_SWATCHES]
        .map(hex6)
        .filter((x): x is string => !!x),
    ),
  ];

  /* 換到別的泡泡、離開編輯畫面：進行中的打字記成一步 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 泡泡換了才結束
  useEffect(() => () => flushTextHistory(), [bubble.id]);

  /* 編輯區裡的 Ctrl／⌘＋Z、Ctrl／⌘＋Shift＋Z、Ctrl／⌘＋Y：工具的復原（組字中編輯區自己會擋下來，不會到這裡） */
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const z = e.code === 'KeyZ' || e.key.toLowerCase() === 'z';
    const y = e.code === 'KeyY' || e.key.toLowerCase() === 'y';
    if (!z && !y) return;
    e.preventDefault();
    e.stopPropagation();
    if (z && !e.shiftKey) undoStep();
    else redoStep();
  };

  return (
    <Field label={S.text} hint={S.textHint}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 只接住編輯區冒上來的復原快捷鍵 */}
      <div data-testid="bubble-text" onKeyDown={onKeyDown}>
        <RichTextEditor
          aria-label={S.text}
          value={value}
          onChange={(doc) => setBubbleRich(bubble.id, doc)}
          fontFamily={fontFamilyCss(font.family)}
          baseFont={font.family}
          displaySize={16}
          lineHeight={1.6}
          color={color}
          background={background}
          align={align}
          maxLength={Math.max(MAX_TEXT, docLength(value))}
          placeholder={S.textPlaceholder}
          minHeight="5.5rem"
          maxHeight="16rem"
          onBlur={flushTextHistory}
          onHistory={(k) => (k === 'undo' ? undoStep() : redoStep())}
          onNotice={(m, tone) =>
            toast({ title: m, tone: tone === 'warning' ? 'warning' : 'info', replace: true })
          }
          toolbar={{
            underline: true,
            pageBreak: false,
            paragraphAlign: false,
            textSwatches: swatches,
            highlightSwatches: HIGHLIGHT_SWATCHES,
          }}
        />
      </div>
    </Field>
  );
}
