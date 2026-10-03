/**
 * 分色文字欄（HighlightTextArea）與流動分頁（core/paged 的 flowPaginate）的示範：
 * 左邊打字（# 開頭的行、【】上色），下面把每一行當成一段排進小頁面，放不下的段落在頁尾切開（避頭尾）。
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { flowPaginate } from '@/core/paged';
import { HighlightTextArea, Section } from '@/ui';

const PAGE = { w: 70, h: 52 };
const INITIAL = [
  '# 霧港',
  '調查員抵達港口時，濃霧剛好從海上漫了進來。燈塔照常轉動，但每隔一陣子，海面上會亮起另一道偏綠的光。',
  '用【偵查】可以發現碼頭邊停著一艘沒有名字的漁船，船身上的油漆還是濕的。',
  '「這種霧，連海鳥都不出來。」老船長一邊補漁網，一邊說。',
].join('\n');

const CSS =
  '.flow-demo-page{box-sizing:border-box;width:70mm;height:52mm;padding:4mm;background:#f7f3ea;color:#23201c;box-shadow:0 1px 4px rgba(0,0,0,.3);flex:none}' +
  '.flow-demo-body{height:100%;overflow:hidden;font:8pt/1.7 serif;text-align:justify;line-break:strict}' +
  '.flow-demo-body p{margin:0 0 1.5mm}.flow-demo-body h3{margin:0 0 1mm;font:700 10pt/1.4 sans-serif}' +
  '.flow-demo-body .flow-last-line{text-align-last:justify}.flow-demo-body .flow-joined{margin-bottom:0}';

export function FlowDemo() {
  const [text, setText] = useState(INITIAL);
  const [pages, setPages] = useState(0);
  const host = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const lines = useMemo(
    () =>
      text.split('\n').map((l) => ({
        className: l.startsWith('#') ? 'bg-accent-soft' : undefined,
        content: l.split(/(【[^【】]+】)/).map((part, i) =>
          part.startsWith('【') ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: 片段的位置就是身分
            <span key={i} className="text-accent">
              {part}
            </span>
          ) : (
            part
          ),
        ),
      })),
    [text],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      const h = host.current;
      const st = stage.current;
      if (!h || !st) return;
      h.replaceChildren();
      const blocks = text
        .split('\n')
        .filter((l) => l.trim())
        .map((l) => {
          const el = document.createElement(l.startsWith('#') ? 'h3' : 'p');
          el.textContent = l.replace(/^#+\s*/, '');
          return el;
        });
      const made: HTMLElement[] = [];
      flowPaginate(blocks, {
        newPage: () => {
          const p = document.createElement('div');
          p.className = 'flow-demo-page';
          const body = document.createElement('div');
          body.className = 'flow-demo-body';
          p.appendChild(body);
          h.appendChild(p);
          made.push(p);
          return body;
        },
        dropPage: () => made.pop()?.remove(),
      });
      st.replaceChildren(...made);
      setPages(made.length);
    }, 200);
    return () => clearTimeout(t);
  }, [text]);

  return (
    <Section title="分色文字欄（HighlightTextArea）＋流動分頁（flowPaginate）">
      <style>{CSS}</style>
      <p className="m-0 text-sm text-muted">
        上面是一般的文字欄（輸入法、復原照常），後面墊一層上色；下面把每一行當成一段排進 {PAGE.w}×
        {PAGE.h} mm 的小頁面，共 {pages}{' '}
        頁：放不下的段落在頁尾切開，下一頁不以「。」「」」等標點開頭。
      </p>
      <HighlightTextArea
        value={text}
        lines={lines}
        onChange={(e) => setText(e.target.value)}
        aria-label="分色文字欄的示範"
        className="h-48 rounded-md border border-border"
        textClassName="font-ui text-sm leading-relaxed px-3 py-2"
      />
      <div ref={host} aria-hidden className="pointer-events-none fixed -left-[9999px] top-0" />
      <div ref={stage} className="flex gap-3 overflow-x-auto p-1" data-testid="flow-demo-pages" />
    </Section>
  );
}
