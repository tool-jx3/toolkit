/**
 * 匯出區的工具專屬部分：影片格式（MP4／透明 WebM，依瀏覽器能不能編、背景是否透明）、APNG 的「試算大小」。
 */
import { Calculator } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button, type ExportFormatOption } from '@/ui';
import { detectVideoMode, exportApng, formatSize, sizeBadge, type VideoMode } from './exporter';
import type { FxState, Size } from './model';
import type { ImageSource } from './render';
import { usePrefs } from './store';
import { S } from './strings';

/** 這個瀏覽器能怎麼編影片（檢查中 null） */
export function useVideoMode(size: Size, fps: number, alpha: boolean): VideoMode | null {
  const [mode, setMode] = useState<{ key: string; mode: VideoMode } | null>(null);
  const { width, height } = size;
  const key = `${width}x${height}|${fps}|${alpha}`;
  useEffect(() => {
    let alive = true;
    void detectVideoMode({ width, height }, fps, alpha).then((m) => {
      if (alive) setMode({ key, mode: m });
    });
    return () => {
      alive = false;
    };
  }, [key, width, height, fps, alpha]);
  return mode?.key === key ? mode.mode : null;
}

/** 匯出區的影片格式 */
export function videoFormat(
  mode: VideoMode | null,
  transparent: boolean,
  noImage: boolean,
): ExportFormatOption {
  const label = transparent ? S.formats.webm : S.formats.mp4;
  const reason = noImage
    ? S.needImage
    : !mode
      ? S.videoChecking
      : mode.kind === 'none'
        ? transparent
          ? S.webmUnsupported
          : S.videoUnsupported
        : undefined;
  return {
    id: 'video',
    label,
    description: transparent ? S.formatDesc.webm : S.formatDesc.mp4,
    animated: true,
    disabled: !!reason,
    disabledReason: reason,
  };
}

/** APNG 的試算大小：用目前的設定實際編碼一次（內容或設定改了就作廢） */
export function ApngEstimate({ s, image }: { s: FxState; image: ImageSource }) {
  const colors = usePrefs((p) => p.data.export.colors ?? 0);
  const plays = usePrefs((p) => p.data.export.plays);
  const key = JSON.stringify([s, colors, plays]);
  const [result, setResult] = useState<
    { key: string; bytes: number } | { key: string; error: string } | null
  >(null);
  const [running, setRunning] = useState(false);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  /* 內容或設定改了：取消進行中的試算 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在 key 改變時取消
  useEffect(() => {
    abort.current?.abort();
  }, [key]);
  const run = async () => {
    abort.current?.abort();
    const ctrl = new AbortController();
    abort.current = ctrl;
    setRunning(true);
    try {
      const out = await exportApng(
        s,
        image,
        { colors, plays },
        {
          signal: ctrl.signal,
          onProgress: () => undefined,
        },
      );
      if (!ctrl.signal.aborted) setResult({ key, bytes: out.blob.size });
    } catch (e) {
      if (!ctrl.signal.aborted)
        setResult({ key, error: e instanceof Error ? e.message : String(e) });
    } finally {
      if (abort.current === ctrl) {
        abort.current = null;
        setRunning(false);
      }
    }
  };
  const cur = result?.key === key ? result : null;
  const badge = cur && 'bytes' in cur ? sizeBadge(cur.bytes) : null;
  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-surface-2 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium">{S.estimate}</span>
        <output className="text-sm tabular-nums" data-testid="apng-estimate">
          {cur && 'bytes' in cur ? formatSize(cur.bytes) : '—'}
        </output>
        {badge ? (
          <span
            className={
              badge.tone === 'success'
                ? 'rounded-full bg-success-soft px-2 py-0.5 text-xs text-success'
                : badge.tone === 'warning'
                  ? 'rounded-full bg-warning-soft px-2 py-0.5 text-xs text-warning'
                  : 'rounded-full bg-accent-soft px-2 py-0.5 text-xs text-fg'
            }
            data-testid="apng-estimate-badge"
          >
            {badge.text}
          </span>
        ) : null}
        <Button
          size="sm"
          icon={<Calculator />}
          className="ml-auto"
          loading={running}
          onClick={() => void run()}
        >
          {running ? S.estimateRunning : S.estimateRun}
        </Button>
      </div>
      <p className="m-0 text-xs text-muted">
        {cur && 'error' in cur ? `${S.estimateFailed}：${cur.error}` : S.estimateIdle}
      </p>
    </div>
  );
}
