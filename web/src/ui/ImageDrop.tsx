/**
 * 檔案拖放區（FileDrop）與圖片拖放區（ImageDrop）：拖放、貼上（Ctrl+V）、選檔，可多檔。
 * ImageDrop 會把圖片解碼成 ImageBitmap 再交給 onImages。
 */
import { ImagePlus, Upload } from 'lucide-react';
import { type DragEvent, type ReactNode, useEffect, useId, useRef, useState } from 'react';
import { matchesAccept } from '@/core/files';
import { loadImage } from '@/core/image';
import { buttonClass } from './Button';
import { cn } from './cn';
import { isEditableTarget } from './shortcuts';

export interface FileDropProps {
  onFiles: (files: File[]) => void;
  /** 同 <input accept>，例如 'image/*'、'.json' */
  accept?: string;
  multiple?: boolean;
  /**
   * 貼上：'document'（整頁都接收，頁面上只有一個拖放區時用；預設）、
   * 'focus'（拖放區或其按鈕有焦點時才接收）、'off'
   */
  paste?: 'document' | 'focus' | 'off';
  /** 主要文字 */
  label?: ReactNode;
  /** 選檔按鈕文字（預設「選擇檔案」） */
  buttonLabel?: string;
  /** 補充說明（格式、大小） */
  hint?: ReactNode;
  /** 不符合 accept 的檔案 */
  onReject?: (files: File[]) => void;
  /**
   * 是否依 accept 過濾收到的檔案（預設 true）。
   * false：accept 只用在選檔視窗，所有檔案都交給 onFiles，由工具自己判斷（例如讀檔頭辨認沒有副檔名的圖片）。
   */
  filterByAccept?: boolean;
  icon?: ReactNode;
  /** 精簡樣式（一行） */
  compact?: boolean;
  /**
   * 整個拖放區都可以點（點空白處也開啟選檔視窗；預設 false：只有選檔按鈕可以點）。
   * 鍵盤操作仍用裡面的選檔按鈕。
   */
  clickable?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function FileDrop({
  onFiles,
  accept,
  multiple = false,
  paste = 'document',
  label = '把檔案拖到這裡',
  buttonLabel = '選擇檔案',
  hint,
  onReject,
  filterByAccept = true,
  icon = <Upload />,
  compact,
  clickable = false,
  disabled,
  className,
  ...rest
}: FileDropProps) {
  const inputId = useId();
  const root = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const depth = useRef(0);
  const handlers = useRef({ onFiles, onReject });
  handlers.current = { onFiles, onReject };

  const deliver = (list: File[]) => {
    if (disabled || !list.length) return;
    const pass = (f: File) => !filterByAccept || matchesAccept(f, accept);
    const ok = list.filter(pass);
    const bad = list.filter((f) => !pass(f));
    if (bad.length) handlers.current.onReject?.(bad);
    if (ok.length) handlers.current.onFiles(multiple ? ok : ok.slice(0, 1));
  };
  const deliverRef = useRef(deliver);
  deliverRef.current = deliver;

  useEffect(() => {
    if (paste === 'off' || disabled) return;
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      if (!files.length) return;
      if (paste === 'focus' && !root.current?.contains(document.activeElement)) return;
      if (paste === 'document' && isEditableTarget(e.target)) return;
      e.preventDefault();
      deliverRef.current(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [paste, disabled]);

  const onDrag = (e: DragEvent<HTMLDivElement>) => {
    if (disabled || !Array.from(e.dataTransfer.types).includes('Files')) return;
    e.preventDefault();
    if (e.type === 'dragenter') depth.current++;
    if (e.type === 'dragleave') depth.current--;
    if (e.type === 'dragover') e.dataTransfer.dropEffect = 'copy';
    setOver(depth.current > 0);
  };

  return (
    // biome-ignore lint/a11y/useSemanticElements: 拖放區是一組控制項（拖放＋選檔按鈕），不是表單分組
    // biome-ignore lint/a11y/useKeyWithClickEvents: clickable 只是讓滑鼠點空白處也能選檔；鍵盤用裡面的選檔按鈕
    <div
      ref={root}
      role="group"
      aria-label={rest['aria-label'] ?? (typeof label === 'string' ? label : '檔案拖放區')}
      aria-disabled={disabled || undefined}
      onDragEnter={onDrag}
      onDragOver={onDrag}
      onDragLeave={onDrag}
      onDrop={(e) => {
        if (disabled) return;
        e.preventDefault();
        depth.current = 0;
        setOver(false);
        deliver(Array.from(e.dataTransfer.files));
      }}
      onClick={
        clickable
          ? (e) => {
              if (disabled) return;
              /* 點在選檔按鈕（label）上時由按鈕自己開啟，不重複 */
              if ((e.target as Element).closest?.('label,input,button,a')) return;
              input.current?.click();
            }
          : undefined
      }
      data-over={over || undefined}
      data-clickable={(clickable && !disabled) || undefined}
      className={cn(
        'flex rounded-lg border-2 border-dashed border-border-strong bg-surface-2 text-center transition-colors',
        'data-over:border-accent data-over:bg-accent-soft',
        compact
          ? 'flex-row items-center gap-3 px-3 py-2 text-left'
          : 'flex-col items-center gap-2 px-4 py-6',
        clickable && !disabled && 'cursor-pointer hover:border-accent',
        disabled && 'opacity-50',
        className,
      )}
    >
      <span
        aria-hidden
        className={cn('text-accent', compact ? '[&_svg]:size-5' : '[&_svg]:size-7')}
      >
        {icon}
      </span>
      <div className={cn('flex min-w-0 flex-col gap-0.5', compact && 'flex-1')}>
        <span className="text-sm font-medium text-fg">{label}</span>
        <span className="text-xs text-muted">
          {paste !== 'off' ? '也可以直接貼上（Ctrl+V）' : null}
          {hint ? (
            <>
              {paste !== 'off' ? '；' : null}
              {hint}
            </>
          ) : null}
        </span>
      </div>
      <label
        htmlFor={inputId}
        className={cn(
          buttonClass('secondary', 'sm'),
          disabled ? 'pointer-events-none' : 'cursor-pointer',
          'focus-within:focus-ring',
        )}
      >
        {buttonLabel}
        <input
          ref={input}
          id={inputId}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          className="sr-only"
          onChange={(e) => {
            deliver(Array.from(e.target.files ?? []));
            e.target.value = '';
          }}
        />
      </label>
    </div>
  );
}

export interface DroppedImage {
  file: File;
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

export interface ImageDropProps extends Omit<FileDropProps, 'onFiles'> {
  /** 收到原始檔案（不解碼） */
  onFiles?: (files: File[]) => void;
  /** 收到解碼後的圖片 */
  onImages?: (images: DroppedImage[]) => void;
  /** 解碼失敗時（例如損壞的檔案） */
  onError?: (message: string, file: File) => void;
}

export function ImageDrop({
  onFiles,
  onImages,
  onError,
  accept = 'image/*',
  label = '把圖片拖到這裡',
  icon = <ImagePlus />,
  ...rest
}: ImageDropProps) {
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-1">
      <FileDrop
        {...rest}
        accept={accept}
        label={label}
        icon={icon}
        onReject={(files) => {
          const msg = `不支援的檔案：${files.map((f) => f.name).join('、')}`;
          setError(msg);
          rest.onReject?.(files);
        }}
        onFiles={async (files) => {
          setError(null);
          onFiles?.(files);
          if (!onImages) return;
          const out: DroppedImage[] = [];
          for (const file of files) {
            try {
              const bitmap = await loadImage(file);
              out.push({ file, bitmap, width: bitmap.width, height: bitmap.height });
            } catch {
              const msg = `無法讀取「${file.name}」，檔案可能已損壞。`;
              setError(msg);
              onError?.(msg, file);
            }
          }
          if (out.length) onImages(out);
        }}
      />
      {error ? (
        <p role="alert" className="m-0 text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
