/**
 * 音訊的輸入與試聽：
 * - AudioDrop：接受音訊檔的拖放區＋選檔（MP3、WAV、OGG…，accept 預設 audio/*）；下方顯示目前的檔案與狀態
 *   （解碼中、已載入、無法解碼）。解碼由工具用 core/audio 的 decodeAudio 做。
 * - AudioPlayer：合成結果的試聽播放器（瀏覽器內建控制列）＋下載按鈕。
 */
import { AudioLines, Download } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { buttonClass } from './Button';
import { cn } from './cn';
import { FileDrop } from './ImageDrop';
import { Notice, type NoticeTone } from './Notice';

export interface AudioDropProps {
  onFile: (file: File) => void;
  /** 目前載入的檔名（顯示在狀態列） */
  status?: { tone: NoticeTone; message: ReactNode } | null;
  label?: ReactNode;
  buttonLabel?: string;
  hint?: ReactNode;
  accept?: string;
  /** 不是音訊檔時 */
  onReject?: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

export function AudioDrop({
  onFile,
  status,
  label = '把音效檔拖到這裡',
  buttonLabel = '選擇音效檔',
  hint = 'MP3、WAV、OGG 等瀏覽器能播放的格式',
  accept = 'audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus',
  onReject,
  disabled,
  className,
  ...rest
}: AudioDropProps) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <FileDrop
        compact
        accept={accept}
        paste="off"
        label={label}
        buttonLabel={buttonLabel}
        hint={hint}
        icon={<AudioLines />}
        onFiles={(files) => files[0] && onFile(files[0])}
        onReject={onReject}
        disabled={disabled}
        aria-label={rest['aria-label'] ?? '音效檔'}
      />
      {status ? <Notice tone={status.tone}>{status.message}</Notice> : null}
    </div>
  );
}

export interface AudioPlayerProps {
  /** 要試聽的音訊（null＝還沒有） */
  blob: Blob | null;
  /** 下載的檔名 */
  fileName: string;
  downloadLabel?: string;
  /** 播放器的無障礙名稱（預設「試聽」） */
  'aria-label'?: string;
  /** 下載後（例如記錄或提示） */
  onDownload?: () => void;
  className?: string;
}

export function AudioPlayer({
  blob,
  fileName,
  downloadLabel = '下載 WAV',
  onDownload,
  className,
  'aria-label': ariaLabel = '試聽',
}: AudioPlayerProps) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  if (!blob || !url) return null;
  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {/* biome-ignore lint/a11y/useMediaCaption: 合成的音效沒有語音內容，不需要字幕 */}
      <audio controls src={url} aria-label={ariaLabel} className="h-9 min-w-0 max-w-full flex-1" />
      <a
        href={url}
        download={fileName}
        onClick={onDownload}
        className={buttonClass('secondary', 'md', 'no-underline')}
      >
        <Download aria-hidden className="size-4" />
        {downloadLabel}
      </a>
    </div>
  );
}
