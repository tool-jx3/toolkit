/**
 * CSS 類工具（OBS 自訂 CSS）的輸出區塊：
 * - CssExportPanel：複製 CSS（剪貼簿不能用時退回舊式複製；仍失敗就展開「查看 CSS」並選取全文，請使用者手動複製）、
 *   存成 .css（檔名清理）、可收合的「查看 CSS」、狀態訊息。
 * - SourceUrlField：唯讀的瀏覽器來源網址欄＋複製按鈕；沒有網址時顯示提示或警告（可附「前往填寫」按鈕）。
 */
import { ChevronRight, Copy, Download, Link2 } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { copyText, downloadText, formatBytes, safeFileName } from '@/core/files';
import { Button } from './Button';
import { cn } from './cn';
import { Notice, type NoticeTone } from './Notice';
import { TextArea, TextInput } from './TextInput';

export interface CssExportStatus {
  tone: NoticeTone;
  text: ReactNode;
}

export interface CssExportPanelProps {
  /** 目前會匯出的完整 CSS */
  css: string;
  /** 檔名主體（不含 .css）；會清掉 Windows 不能用的字元 */
  fileName: string;
  /** 檔名主體清理後是空的時候用這個（預設 style） */
  fallbackFileName?: string;
  /** 複製成功時的訊息（預設「已複製 CSS，請貼到 OBS 瀏覽器來源的自訂 CSS 欄」） */
  copiedMessage?: ReactNode;
  /** 存檔成功時的訊息（預設「已儲存 檔名」） */
  savedMessage?: (fileName: string) => ReactNode;
  /** 複製／儲存之後通知工具（例如寫進工具自己的狀態列） */
  onCopy?: (ok: boolean) => void;
  onSave?: (fileName: string) => void;
  /** 沒有可匯出的 CSS 時（按鈕停用、顯示這段說明） */
  disabledReason?: ReactNode;
  /** 「查看 CSS」預設展開 */
  defaultViewerOpen?: boolean;
  /** 自己控制狀態訊息（不給時元件自己顯示） */
  status?: CssExportStatus | null;
  /** 按鈕列右側的其他按鈕 */
  actions?: ReactNode;
  className?: string;
}

export function CssExportPanel({
  css,
  fileName,
  fallbackFileName = 'style',
  copiedMessage = '已複製 CSS，請貼到 OBS 瀏覽器來源的「自訂 CSS」欄（先清空原有的內容）。',
  savedMessage = (n) => `已儲存「${n}」。`,
  onCopy,
  onSave,
  disabledReason,
  defaultViewerOpen = false,
  status,
  actions,
  className,
}: CssExportPanelProps) {
  const [innerStatus, setInnerStatus] = useState<CssExportStatus | null>(null);
  const [open, setOpen] = useState(defaultViewerOpen);
  const area = useRef<HTMLTextAreaElement>(null);
  const viewerId = useId();
  const disabled = !!disabledReason || !css;
  const shown = status === undefined ? innerStatus : status;
  const fullName = `${safeFileName(fileName, { fallback: fallbackFileName })}.css`;
  const bytes = new TextEncoder().encode(css).length;
  const lines = css ? css.split('\n').length - (css.endsWith('\n') ? 1 : 0) : 0;

  /* 失敗時展開並選取全文 */
  const [selectAll, setSelectAll] = useState(false);
  useEffect(() => {
    if (!selectAll || !open) return;
    const ta = area.current;
    if (ta) {
      ta.focus();
      ta.select();
    }
    setSelectAll(false);
  }, [selectAll, open]);

  const copy = async () => {
    const ok = await copyText(css);
    if (ok) setInnerStatus({ tone: 'success', text: copiedMessage });
    else {
      setInnerStatus({
        tone: 'danger',
        text: '無法自動複製。已展開「查看 CSS」並選取全文，請按 Ctrl＋C（Mac：⌘＋C）手動複製。',
      });
      setOpen(true);
      setSelectAll(true);
    }
    onCopy?.(ok);
  };

  const save = () => {
    downloadText(css, fullName, 'text/css;charset=utf-8');
    setInnerStatus({ tone: 'success', text: savedMessage(fullName) });
    onSave?.(fullName);
  };

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="primary" icon={<Copy />} onClick={copy} disabled={disabled}>
          複製 CSS
        </Button>
        <Button icon={<Download />} onClick={save} disabled={disabled}>
          儲存 .css
        </Button>
        {actions}
      </div>
      {disabledReason ? <p className="m-0 text-xs text-muted">{disabledReason}</p> : null}
      {shown ? (
        <Notice tone={shown.tone} className="text-xs">
          {shown.text}
        </Notice>
      ) : null}
      <div className="rounded-md border border-border">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={viewerId}
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-1.5 rounded-md px-2.5 py-1.5 text-left text-sm font-medium text-fg hover:bg-surface-2"
        >
          <ChevronRight
            aria-hidden
            className={cn('size-4 shrink-0 text-muted transition-transform', open && 'rotate-90')}
          />
          查看 CSS
          <span className="ml-auto text-xs font-normal text-muted tabular-nums">
            {lines} 行・{formatBytes(bytes)}
          </span>
        </button>
        <div id={viewerId} hidden={!open} className="px-2.5 pb-2.5">
          <TextArea
            ref={area}
            aria-label="目前的 CSS（唯讀）"
            readOnly
            value={css}
            rows={12}
            spellCheck={false}
            className="font-mono text-xs leading-snug whitespace-pre"
            onFocus={(e) => e.currentTarget.select()}
          />
          <p className="m-0 mt-1 text-xs text-muted">檔名：{fullName}</p>
        </div>
      </div>
    </div>
  );
}

export interface SourceUrlFieldProps {
  /** 瀏覽器來源要填的網址；沒有時 null */
  url: string | null;
  /** 沒有網址時欄位裡的提示（預設「填好房間網址後會出現在這裡」） */
  placeholder?: string;
  /** 沒有網址時顯示的警告（不給就只顯示 placeholder） */
  missingWarning?: ReactNode;
  /** 警告旁的按鈕（例如「前往房間網址」：切到那個設定分頁並聚焦欄位） */
  missingAction?: ReactNode;
  /** 複製成功時的訊息 */
  copiedMessage?: ReactNode;
  onCopy?: (ok: boolean) => void;
  id?: string;
  'aria-label'?: string;
  className?: string;
}

/** 唯讀網址欄＋複製（放在 Field 裡會自動關聯標籤） */
export function SourceUrlField({
  url,
  placeholder = '填好房間網址後會出現在這裡',
  missingWarning,
  missingAction,
  copiedMessage = '已複製網址，請貼到 OBS 瀏覽器來源的「網址」欄。',
  onCopy,
  className,
  ...rest
}: SourceUrlFieldProps) {
  const [msg, setMsg] = useState<CssExportStatus | null>(null);
  /* 網址換了就清掉上一次的複製訊息 */
  const [shownFor, setShownFor] = useState(url);
  if (shownFor !== url) {
    setShownFor(url);
    setMsg(null);
  }
  const copy = async () => {
    if (!url) return;
    const ok = await copyText(url);
    setMsg(
      ok
        ? { tone: 'success', text: copiedMessage }
        : { tone: 'danger', text: '無法自動複製，請選取欄位裡的網址後按 Ctrl＋C 複製。' },
    );
    onCopy?.(ok);
  };
  return (
    <div className={cn('flex min-w-0 flex-col gap-1.5', className)}>
      <div className="flex min-w-0 gap-2">
        <TextInput
          {...rest}
          readOnly
          value={url ?? ''}
          placeholder={placeholder}
          className="flex-1 font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
        <Button icon={<Link2 />} onClick={copy} disabled={!url}>
          複製網址
        </Button>
      </div>
      {!url && missingWarning ? (
        <Notice tone="warning" action={missingAction}>
          {missingWarning}
        </Notice>
      ) : null}
      {msg ? (
        <Notice tone={msg.tone} className="text-xs">
          {msg.text}
        </Notice>
      ) : null}
    </div>
  );
}
