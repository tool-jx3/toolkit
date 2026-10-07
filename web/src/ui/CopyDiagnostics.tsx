/**
 * 「複製錯誤資訊」按鈕：把 `@/core/diagnostics` 整理好的文字放進剪貼簿，讓使用者貼給維護者。
 * 複製成功時按鈕暫時變成「已複製」；瀏覽器不讓網頁複製時打開對話框、選取全文，讓使用者自己複製。
 * 通常放在 Notice 的 action：`<Notice tone="danger" action={<CopyDiagnostics text={details} />}>…</Notice>`。
 */
import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { copyText } from '@/core/files';
import { Button, type ButtonSize } from './Button';
import { Dialog } from './Dialog';
import { TextArea } from './TextInput';

export interface CopyDiagnosticsProps {
  /** 要複製的文字（diagnosticText 的結果） */
  text: string;
  /** 按鈕文字（預設「複製錯誤資訊」） */
  label?: string;
  size?: ButtonSize;
  className?: string;
}

/** 「已複製」維持多久（ms） */
const COPIED_MS = 2000;

export function CopyDiagnostics({
  text,
  label = '複製錯誤資訊',
  size = 'sm',
  className,
}: CopyDiagnosticsProps) {
  const [copied, setCopied] = useState(false);
  const [manual, setManual] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: 內容換了就回到「複製錯誤資訊」
  useEffect(() => setCopied(false), [text]);
  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(t);
  }, [copied]);

  const copy = async () => {
    if (await copyText(text)) setCopied(true);
    else setManual(true);
  };

  return (
    <>
      <Button
        size={size}
        icon={copied ? <Check /> : <Copy />}
        onClick={copy}
        className={className}
        data-testid="copy-diagnostics"
      >
        {copied ? '已複製' : label}
      </Button>
      <span role="status" className="sr-only">
        {copied ? '已複製錯誤資訊' : ''}
      </span>
      <Dialog
        open={manual}
        onOpenChange={setManual}
        title="錯誤資訊"
        description="瀏覽器不讓網頁直接複製。請長按下面的文字全選後複製，或按 Ctrl＋C（Mac：⌘＋C）。"
        initialFocus={area}
      >
        <TextArea
          ref={area}
          readOnly
          value={text}
          rows={12}
          aria-label="錯誤資訊"
          className="font-mono text-xs"
          onFocus={(e) => e.currentTarget.select()}
        />
      </Dialog>
    </>
  );
}
