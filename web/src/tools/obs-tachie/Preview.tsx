/**
 * 立繪預覽（規格 F46～F51）：Streamkit 模擬頁（1920 × 1080）套上產生的 CSS，等比縮小顯示。
 * 每個預覽有自己的「在頻道裡」開關與說話狀態（不存檔）；在頻道時點預覽（或 Enter／空白鍵）切換說話中⇄安靜。
 */
import { useEffect, useMemo, useState } from 'react';
import { createStreamkitScene } from '@/ccfolia/mock';
import { CssPreviewFrame, cn, Toggle } from '@/ui';
import { previewStatus } from './logic';
import { SOURCE_SIZE } from './model';
import { S } from './strings';

/** 測試用：網址加 ?pause=毫秒 時，預覽裡的動畫停在那個時間點 */
const PAUSE_AT = (() => {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('pause');
  return v === null || !Number.isFinite(Number(v)) ? null : Number(v);
})();

/** 頻道裡的另一個人（說不說話都不影響這個立繪） */
const OTHER_USER = { id: '900000000000000009', name: '其他人' };

export interface TachiePreviewProps {
  css: string;
  /** 這個立繪是誰（Discord 使用者 ID） */
  userId: string;
  /** Streamkit 上顯示的名字（只在「套用前」看得到） */
  userName: string;
  /** 開了「不在頻道時隱藏」嗎（狀態標籤用） */
  hideAway: boolean;
  /** 測試用的識別 */
  testId: string;
  className?: string;
}

export function TachiePreview({
  css,
  userId,
  userName,
  hideAway,
  testId,
  className,
}: TachiePreviewProps) {
  const scene = useMemo(() => createStreamkitScene({ users: [] }), []);
  const [inChannel, setInChannel] = useState(true);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => {
    scene.update({
      users: [
        { id: OTHER_USER.id, name: OTHER_USER.name },
        { id: userId, name: userName || userId, inChannel, speaking: inChannel && speaking },
      ],
    });
  }, [scene, userId, userName, inChannel, speaking]);

  const status = previewStatus(inChannel, speaking, hideAway);
  const statusText = S.preview.status[status];
  const toggle = () => {
    if (inChannel) setSpeaking((v) => !v);
  };

  return (
    <div className={cn('flex flex-col gap-2', className)} data-testid={testId}>
      <CssPreviewFrame
        width={SOURCE_SIZE.width}
        height={SOURCE_SIZE.height}
        css={css}
        scene={scene}
        label={S.preview.frameLabel}
        pauseAt={PAUSE_AT}
        toolbarExtra={
          <Toggle
            label={S.preview.inChannel}
            checked={inChannel}
            onCheckedChange={(v) => {
              setInChannel(v);
              if (!v) setSpeaking(false);
            }}
            className="mr-2"
          />
        }
        overlay={
          <button
            type="button"
            aria-pressed={inChannel ? speaking : undefined}
            aria-disabled={inChannel ? undefined : true}
            aria-label={
              inChannel ? S.preview.toggleAria(statusText) : S.preview.toggleAwayAria(statusText)
            }
            title={inChannel ? S.preview.toggleHint : undefined}
            onClick={toggle}
            data-testid={`${testId}-toggle`}
            className={cn(
              'absolute inset-0 block rounded-none border-0 bg-transparent p-0 text-left outline-none',
              'focus-visible:shadow-[inset_0_0_0_3px_var(--focus)]',
              inChannel ? 'cursor-pointer' : 'cursor-not-allowed',
            )}
          >
            <span
              aria-hidden
              data-testid={`${testId}-status`}
              data-status={status}
              className={cn(
                'pointer-events-none absolute top-1.5 left-1.5 rounded-sm px-1.5 py-0.5 text-xs font-medium shadow-1',
                status === 'speaking'
                  ? 'bg-success text-success-contrast'
                  : status === 'quiet'
                    ? 'bg-surface text-fg'
                    : 'bg-warning text-warning-contrast',
              )}
            >
              {statusText}
            </span>
          </button>
        }
      />
    </div>
  );
}

/** 預覽的說明（F51） */
export function PreviewNotes() {
  return (
    <ul className="m-0 flex list-disc flex-col gap-0.5 pl-5 text-xs text-muted">
      {S.preview.notes.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}
