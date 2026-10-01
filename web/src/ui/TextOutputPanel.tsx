/**
 * 純文字結果面板：唯讀的輸出欄＋「複製」（原封不動放進剪貼簿，含行尾空白、全形空白）＋標題旁的字數或行數。
 *
 * - wrap="soft"（預設）：畫面太窄時只是顯示折行，複製的內容不受影響；
 *   wrap="off"：不折行、可以橫向捲動（文字圖案這類靠對齊的輸出），通常搭配 font="mono"（等寬）。
 * - 高度跟著內容（含畫面上的折行），不出現內捲軸；字型載入或寬度改變時重新量。
 * - 複製後輸出維持全選（剪貼簿不能用時方便手動 Ctrl＋C）；成功／失敗用 Toast 提示；文字是空的時提示沒有內容可複製。
 *
 * 由文字方框產生器（textbox）的輸出區提升而來。
 */
import { Copy } from 'lucide-react';
import { type ReactNode, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { copyText } from '@/core/files';
import { ensureFont, fontFamilyCss } from '@/core/fonts';
import { Button } from './Button';
import { cn } from './cn';
import { useToast } from './Toast';

export interface TextOutputMessages {
  copied?: string;
  failed?: string;
  failedHint?: string;
  /** 文字是空的時按複製 */
  empty?: string;
}

export interface TextOutputPanelProps {
  text: string;
  /** 標題（也是輸出欄的無障礙名稱，預設「輸出」） */
  title?: string;
  /** 標題旁的小字（預設「共 N 行」；給函式時以目前的文字計算，例如字數） */
  count?: ReactNode | ((text: string) => ReactNode);
  /** 輸出欄下方的說明 */
  hint?: ReactNode;
  copyLabel?: string;
  messages?: TextOutputMessages;
  /** soft：折行顯示（預設）；off：不折行、可以橫向捲動 */
  wrap?: 'soft' | 'off';
  /** 字型：Google／電腦字型名稱（會先載入），或 'mono'（等寬）；不給時用介面字型 */
  font?: { family: string; size?: number; lineHeight?: number } | 'mono';
  /** 空白時輸出欄的提示 */
  placeholder?: string;
  /** 標題列右邊、複製鈕左邊的其他按鈕 */
  actions?: ReactNode;
  className?: string;
}

const DEFAULT_MESSAGES: Required<TextOutputMessages> = {
  copied: '已複製到剪貼簿',
  failed: '無法寫入剪貼簿',
  failedHint: '輸出已全選，請按 Ctrl＋C（Mac 為 ⌘＋C）手動複製。',
  empty: '還沒有內容可以複製',
};

export function TextOutputPanel({
  text,
  title = '輸出',
  count,
  hint,
  copyLabel = '複製',
  messages,
  wrap = 'soft',
  font,
  placeholder,
  actions,
  className,
}: TextOutputPanelProps) {
  const toast = useToast();
  const msg = { ...DEFAULT_MESSAGES, ...messages };
  const area = useRef<HTMLTextAreaElement>(null);
  const labelId = useId();
  const hintId = useId();
  const lineCount = text.split('\n').length;
  const family = font && font !== 'mono' ? font.family : null;

  /* 字型載入後折行可能改變，要重新量高度 */
  const [fontReady, setFontReady] = useState(false);
  useEffect(() => {
    if (!family) return;
    let alive = true;
    void ensureFont(family, 400).then(() => alive && setFontReady(true));
    return () => {
      alive = false;
    };
  }, [family]);

  /* 高度跟著內容（含畫面上的折行），不出現內捲軸 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 內容（text）、字型（fontReady）、折行方式改變時要重新量高度
  useLayoutEffect(() => {
    const ta = area.current;
    if (!ta) return;
    const fitHeight = () => {
      ta.style.height = 'auto';
      /* 加上框線（與不折行時的橫向捲軸）的高度 */
      ta.style.height = `${ta.scrollHeight + (ta.offsetHeight - ta.clientHeight || 2)}px`;
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
  }, [text, fontReady, wrap]);

  const copy = async () => {
    if (!text) {
      toast({ title: msg.empty, tone: 'warning', duration: 2000 });
      return;
    }
    const ok = await copyText(text);
    const ta = area.current;
    if (ta) {
      ta.focus();
      ta.select();
    }
    if (ok) toast({ title: msg.copied, tone: 'success', duration: 2000 });
    else toast({ title: msg.failed, description: msg.failedHint, tone: 'danger' });
  };

  const style =
    font === 'mono'
      ? { fontFamily: 'var(--font-mono)', fontSize: 14, lineHeight: 1.43 }
      : font
        ? {
            fontFamily: fontFamilyCss(font.family),
            fontSize: font.size ?? 14,
            lineHeight: font.lineHeight ?? 1.43,
          }
        : undefined;
  const countNode =
    count === undefined ? `共 ${lineCount} 行` : typeof count === 'function' ? count(text) : count;

  return (
    <section
      aria-labelledby={labelId}
      className={cn(
        'flex flex-col gap-2 rounded-lg border border-border bg-surface p-3',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 id={labelId} className="m-0 text-sm font-semibold text-fg">
            {title}
          </h2>
          {countNode !== null && countNode !== false ? (
            <span className="text-xs text-muted" data-testid="text-output-count">
              {countNode}
            </span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <Button variant="primary" icon={<Copy />} onClick={() => void copy()}>
            {copyLabel}
          </Button>
        </div>
      </div>
      <textarea
        ref={area}
        readOnly
        aria-labelledby={labelId}
        aria-describedby={hint ? hintId : undefined}
        value={text}
        rows={4}
        spellCheck={false}
        wrap={wrap}
        placeholder={placeholder}
        style={style}
        className={cn(
          'block w-full resize-none rounded-md border border-border bg-surface-2 px-3 py-2 text-fg',
          wrap === 'off' ? 'overflow-x-auto overflow-y-hidden whitespace-pre' : 'overflow-hidden',
        )}
      />
      {hint ? (
        <p id={hintId} className="m-0 text-xs text-muted">
          {hint}
        </p>
      ) : null}
    </section>
  );
}
