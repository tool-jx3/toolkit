/**
 * 角色圖的載入區（規格 F01～F05）：
 * - 沒有圖時是大的拖放區：選檔（PNG、JPEG、WebP）或拖放（只取第一個檔案，任何圖片類型都收）；
 * - 不是圖片的檔案靜默忽略；
 * - 載入後縮成一列，顯示檔名與「更換圖片」；按「更換圖片」時恢復成大的樣子並開啟選檔，
 *   選了新圖就換掉並再縮成一列，取消選檔則維持一列。
 */
import { Image as ImageIcon, ImagePlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { FileDrop, useToast } from '@/ui';
import { S } from './strings';

/** 選檔視窗只列這三種；拖放則任何 image/* 都收 */
export const PICK_ACCEPT = 'image/png,image/jpeg,image/webp';

export const isImageFile = (f: File): boolean => f.type.startsWith('image/');

export function LoadArea({
  fileName,
  onFile,
}: {
  /** 已載入的檔名（null：還沒有圖） */
  fileName: string | null;
  /** 收到一個圖片檔（解碼失敗時丟錯） */
  onFile: (file: File) => Promise<void>;
}) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const loaded = fileName !== null;
  const compact = loaded && !expanded;
  const wrap = useRef<HTMLDivElement>(null);

  /* 選檔視窗按取消：維持一列（cancel 事件會冒泡） */
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const onCancel = (e: Event) => {
      if (e.target instanceof HTMLInputElement && e.target.type === 'file') setExpanded(false);
    };
    el.addEventListener('cancel', onCancel);
    return () => el.removeEventListener('cancel', onCancel);
  }, []);

  return (
    <div
      ref={wrap}
      data-testid="load-area"
      data-state={compact ? 'loaded' : 'empty'}
      onClickCapture={(e) => {
        /* 按「更換圖片」：恢復成大的樣子（同時開啟選檔） */
        if (loaded && e.target instanceof Element && e.target.closest('label')) setExpanded(true);
      }}
    >
      <FileDrop
        aria-label={S.dropAreaLabel}
        accept={PICK_ACCEPT}
        filterByAccept={false}
        paste="off"
        compact={compact}
        icon={compact ? <ImageIcon /> : <ImagePlus />}
        label={
          compact ? (
            <span className="flex min-w-0" data-testid="loaded-name">
              <span className="shrink-0">{S.loadedPrefix}</span>
              <span className="truncate" title={fileName ?? undefined}>
                {fileName}
              </span>
            </span>
          ) : (
            S.dropLabel
          )
        }
        hint={compact ? S.loadedHint : S.dropHint}
        buttonLabel={loaded ? S.changeImage : S.chooseImage}
        onFiles={(files) => {
          const f = files[0];
          /* 只取第一個；不是圖片就什麼都不做 */
          if (!f || !isImageFile(f)) return;
          onFile(f).then(
            () => setExpanded(false),
            () => toast({ title: S.decodeError(f.name), tone: 'danger' }),
          );
        }}
      />
    </div>
  );
}
