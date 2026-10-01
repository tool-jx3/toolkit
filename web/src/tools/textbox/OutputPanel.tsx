/**
 * 預覽與複製：唯讀的輸出區（接近 CCFOLIA 聊天欄的字型），一鍵把整段輸出原封不動放進剪貼簿。
 */
import { Copy } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { copyText } from '@/core/files';
import { ensureFont, fontFamilyCss } from '@/core/fonts';
import { Button, useToast } from '@/ui';
import { S } from './strings';

/** CCFOLIA 聊天欄大約的字型：Roboto 14 px、行高約 1.43 倍 */
const PREVIEW_FONT = 'Roboto';

export function OutputPanel({ text }: { text: string }) {
  const toast = useToast();
  const area = useRef<HTMLTextAreaElement>(null);
  const lineCount = text.split('\n').length;

  /* 字型載入後折行可能改變，要重新量高度 */
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => {
    let alive = true;
    void ensureFont(PREVIEW_FONT, 400).then(() => alive && setFontReady(true));
    return () => {
      alive = false;
    };
  }, []);

  /* 高度跟著內容（含畫面上的折行），不出現內捲軸 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 內容（text）或字型（fontReady）改變時要重新量高度
  useLayoutEffect(() => {
    const ta = area.current;
    if (!ta) return;
    const fitHeight = () => {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight + 2}px`;
    };
    fitHeight();
    /* 寬度改變（視窗縮放、版面切換）時折行數會變，重新量；只看寬度，避免自己改高度又觸發 */
    let lastWidth = ta.clientWidth;
    const ro = new ResizeObserver(() => {
      if (ta.clientWidth === lastWidth) return;
      lastWidth = ta.clientWidth;
      requestAnimationFrame(fitHeight);
    });
    ro.observe(ta);
    return () => ro.disconnect();
  }, [text, fontReady]);

  const copy = async () => {
    const ok = await copyText(text);
    const ta = area.current;
    if (ta) {
      ta.focus();
      ta.select();
    }
    if (ok) toast({ title: S.copied, tone: 'success', duration: 2000 });
    else toast({ title: S.copyFailed, description: S.copyFailedHint, tone: 'danger' });
  };

  return (
    <section
      aria-labelledby="textbox-output-label"
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 id="textbox-output-label" className="m-0 text-sm font-semibold text-fg">
            {S.output}
          </h2>
          <span className="text-xs text-muted">{S.lines(lineCount)}</span>
        </div>
        <Button variant="primary" icon={<Copy />} onClick={() => void copy()}>
          {S.copy}
        </Button>
      </div>
      <textarea
        ref={area}
        readOnly
        aria-labelledby="textbox-output-label"
        aria-describedby="textbox-output-hint"
        value={text}
        rows={4}
        spellCheck={false}
        wrap="soft"
        style={{ fontFamily: fontFamilyCss(PREVIEW_FONT), fontSize: 14, lineHeight: 1.43 }}
        className="block w-full resize-none overflow-hidden rounded-md border border-border bg-surface-2 px-3 py-2 text-fg"
      />
      <p id="textbox-output-hint" className="m-0 text-xs text-muted">
        {S.outputHint}
      </p>
    </section>
  );
}
