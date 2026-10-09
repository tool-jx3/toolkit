/**
 * 預覽：Stage 裡的畫布（與下載同一段繪圖程式）＋操作層；下方是匯出列（下載 PNG、輸出尺寸）。
 */
import { Download, MousePointer2, SquareDashedMousePointer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { downloadBlob } from '@/core/files';
import { Button, Notice, Segmented, Stage, useToast } from '@/ui';
import { EditLayer } from './EditLayer';
import { canvasSize, photoRect } from './model';
import type { PhotoStatus } from './photo';
import { drawMeme, ensureLabelFont, labelText, renderPng } from './render';
import { memeNow, setMode, useMeme, useUi } from './store';
import { type Mode, S } from './strings';

export function Preview({
  bitmap,
  status,
  onPick,
}: {
  bitmap: ImageBitmap | null;
  status: PhotoStatus;
  onPick: () => void;
}) {
  const d = useMeme((s) => s.data);
  const size = canvasSize(d.aspect, d.photo);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [fontTick, setFontTick] = useState(0);

  /* 字型載好之後重畫（中文字型只下載用到的字） */
  const text = labelText(d);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在字型或文字改變時載入
  useEffect(() => {
    let alive = true;
    void ensureLabelFont(memeNow()).then(() => {
      if (alive) setFontTick((t) => t + 1);
    });
    return () => {
      alive = false;
    };
  }, [d.font.family, d.font.weight, d.font.source, text]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: fontTick 只用來在字型載好後重畫
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) drawMeme(ctx, d, bitmap, size);
  }, [d, bitmap, size.width, size.height, fontTick]);

  const rect = d.photo ? photoRect(size, d.photo, d.view) : null;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Stage width={size.width} height={size.height} aria-label={S.previewLabel}>
        <canvas
          ref={canvas}
          width={size.width}
          height={size.height}
          className="block size-full"
          data-testid="meme-canvas"
          data-size={`${size.width}x${size.height}`}
          data-photo-rect={
            rect
              ? [rect.x, rect.y, rect.width, rect.height].map((v) => +v.toFixed(3)).join(',')
              : ''
          }
        />
        <EditLayer size={size} hasPhoto={!!d.photo} onPick={onPick} />
      </Stage>
      <ModeBar hasPhoto={!!d.photo} />
      {status === 'missing' ? <Notice tone="warning">{S.photoMissing}</Notice> : null}
      <ExportBar bitmap={bitmap} width={size.width} height={size.height} />
    </div>
  );
}

/** 操作模式（規格 F15）：放在預覽正下方，手機上也不必捲到設定欄才能切換 */
function ModeBar({ hasPhoto }: { hasPhoto: boolean }) {
  const mode = useUi((s) => s.mode);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5" data-testid="mode-bar">
      <Segmented<Mode>
        aria-label={S.mode}
        value={mode}
        onValueChange={setMode}
        options={[
          { value: 'select', label: S.modes.select, icon: <MousePointer2 /> },
          { value: 'draw', label: S.modes.draw, icon: <SquareDashedMousePointer /> },
        ]}
      />
      <p className="m-0 min-w-0 flex-1 basis-56 text-xs text-muted" data-testid="mode-hint">
        {hasPhoto ? S.modeHint[mode] : S.needPhoto}
      </p>
    </div>
  );
}

function ExportBar({
  bitmap,
  width,
  height,
}: {
  bitmap: ImageBitmap | null;
  width: number;
  height: number;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const download = async () => {
    if (!bitmap) return;
    setBusy(true);
    try {
      const blob = await renderPng(memeNow(), bitmap);
      downloadBlob(blob, S.fileName);
      toast({ title: S.downloadDone(S.fileName), tone: 'success' });
    } catch {
      toast({ title: S.downloadFailed, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      aria-label={S.exportTitle}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
      data-testid="export-bar"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          icon={<Download />}
          onClick={() => void download()}
          loading={busy}
          disabled={!bitmap || busy}
        >
          {S.downloadPng}
        </Button>
        <span className="ml-auto text-sm tabular-nums text-muted" data-testid="export-size">
          {S.exportSize(width, height)}
        </span>
      </div>
      <p className="m-0 text-xs text-muted">{bitmap ? S.exportNote : S.exportNeedPhoto}</p>
    </section>
  );
}
