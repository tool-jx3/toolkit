/**
 * core/video 與 useVideoPlayback 的示範：把畫布錄成一段 2 秒的影片（recordCanvas）、讀出長寬與總長（probeVideo）、
 * 用共用播放列播放（只在 0.5～1.5 秒之間循環）、抽 4 張樣本縮圖（createVideoGrabber）。
 * 逐格編碼（encodeAvi、encodeMp4；character-select 移植時新增）：同一段畫面逐格編成 AVI（MJPEG）或 MP4（H.264）。
 */
import { Clapperboard, Film, Images } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { formatBytes } from '@/core/files';
import {
  canEncodeMp4,
  canRecordCanvas,
  createVideoGrabber,
  encodeAvi,
  encodeMp4,
  evenSampleTimes,
  probeVideo,
  recordCanvas,
  type VideoThumbnail,
} from '@/core/video';
import { Button, Section, ThumbnailList, Transport, useVideoPlayback } from '@/ui';

interface DemoVideo {
  url: string;
  width: number;
  height: number;
  duration: number;
}

function drawDemo(ctx: CanvasRenderingContext2D, t: number) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.fillStyle = '#1d2433';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#b79ce0';
  ctx.beginPath();
  ctx.arc(30 + (t / 2) * (W - 60), H / 2, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.font = '16px sans-serif';
  ctx.fillText(`${t.toFixed(2)} 秒`, 12, 24);
}

export function VideoDemo() {
  const [demo, setDemo] = useState<DemoVideo | null>(null);
  const [busy, setBusy] = useState(false);
  const [thumbs, setThumbs] = useState<VideoThumbnail[]>([]);
  const [el, setEl] = useState<HTMLVideoElement | null>(null);
  const range = useMemo(
    () => (demo ? { start: 0.5, end: Math.min(1.5, demo.duration) } : null),
    [demo],
  );
  const playback = useVideoPlayback({ video: el, duration: demo?.duration ?? 0, range });
  const [encoded, setEncoded] = useState<{ name: string; url: string; size: number } | null>(null);
  const [mp4, setMp4] = useState(false);
  useEffect(() => {
    void canEncodeMp4({ width: 320, height: 180, fps: 15 }).then(setMp4);
  }, []);
  useEffect(() => () => (encoded ? URL.revokeObjectURL(encoded.url) : undefined), [encoded]);
  /** 2 秒、15 FPS 的畫面逐格編成影片 */
  const encode = async (kind: 'avi' | 'mp4') => {
    setBusy(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext('2d')!;
      const options = {
        width: 320,
        height: 180,
        fps: 15,
        frameCount: 30,
        renderFrame: (i: number) => {
          drawDemo(ctx, i / 15);
          return canvas;
        },
      };
      const blob = kind === 'mp4' ? await encodeMp4(options) : await encodeAvi(options);
      setEncoded({ name: `示範.${kind}`, url: URL.createObjectURL(blob), size: blob.size });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => () => (demo ? URL.revokeObjectURL(demo.url) : undefined), [demo]);

  const record = async () => {
    setBusy(true);
    try {
      const blob = await recordCanvas({ width: 320, height: 180, seconds: 2, draw: drawDemo });
      const url = URL.createObjectURL(blob);
      const info = await probeVideo(url);
      setThumbs([]);
      setDemo({ url, ...info });
    } finally {
      setBusy(false);
    }
  };
  const grab = async () => {
    if (!demo) return;
    const g = createVideoGrabber(demo.url);
    try {
      setThumbs(
        await g.thumbnails(evenSampleTimes(0, demo.duration, 4), { maxWidth: 160, maxHeight: 90 }),
      );
    } finally {
      g.close();
    }
  };

  return (
    <Section title="影片（core/video、useVideoPlayback）">
      <p className="m-0 text-xs text-muted">
        recordCanvas 把畫布錄成影片；probeVideo 讀出長寬與總長（錄影的 WebM 沒寫總長也算得出來）；
        播放列只在 0.5～1.5 秒之間循環；createVideoGrabber
        用看不見的影片元素依序抽影格（等畫面送出才畫）。
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          icon={<Film />}
          onClick={() => void record()}
          loading={busy}
          disabled={busy || !canRecordCanvas()}
        >
          錄一段 2 秒的示範影片
        </Button>
        <Button size="sm" icon={<Images />} onClick={() => void grab()} disabled={!demo}>
          抽 4 張樣本
        </Button>
        <Button
          size="sm"
          icon={<Clapperboard />}
          onClick={() => void encode('avi')}
          disabled={busy}
        >
          逐格編成 AVI
        </Button>
        <Button
          size="sm"
          icon={<Clapperboard />}
          onClick={() => void encode('mp4')}
          disabled={busy || !mp4}
          title={mp4 ? undefined : '這個瀏覽器不支援 H.264 編碼'}
        >
          逐格編成 MP4
        </Button>
      </div>
      {encoded ? (
        <p className="m-0 text-xs text-muted" data-testid="video-encoded">
          <a href={encoded.url} download={encoded.name} className="text-accent underline">
            {encoded.name}
          </a>
          （{formatBytes(encoded.size)}）
        </p>
      ) : null}
      {demo ? (
        <>
          <p className="m-0 text-xs text-muted tabular-nums">
            {demo.width}×{demo.height}・{demo.duration.toFixed(2)} 秒
          </p>
          <video
            ref={setEl}
            src={demo.url}
            muted
            playsInline
            className="block w-full max-w-sm rounded-sm bg-black"
          />
          <Transport
            {...playback}
            segments={[{ id: 'range', label: '循環範圍', start: 0.5, end: range?.end ?? 1.5 }]}
          />
        </>
      ) : null}
      {thumbs.length ? (
        <ThumbnailList
          aria-label="示範影片的樣本"
          items={thumbs.map((t, i) => ({
            id: String(i),
            name: `${t.time.toFixed(2)} 秒`,
            image: t.canvas,
          }))}
          thumbAspect={16 / 9}
          minItemWidth={90}
        />
      ) : null}
    </Section>
  );
}
