/**
 * 歌詞演出的示範（lyric-fx 移植時新增）：
 * - core/lyricfx：buildLyricLines 組出要排的句，「散落」風格 plan 事先排好、draw 畫任一時間的一格（畫進 640 × 360 的畫布）。
 * - ui 的 LyricStyleControls：照風格的 controls 產生設定面板（這裡只放「文字」「顏色」「動畫」三個區塊）。
 * - core/video 的 findAlphaWebmPlan／encodeAlphaWebm：逐格編成透明背景的 WebM（兩路 VP9）。
 */
import { Clapperboard } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { formatBytes } from '@/core/files';
import { buildLyricLines, createCanvasMeasure, scatterStyle } from '@/core/lyricfx';
import type { ScatterSettings } from '@/core/lyricfx/styles/scatter';
import { encodeAlphaWebm, findAlphaWebmPlan } from '@/core/video';
import { Button, LyricStyleControls, Section, Transport, usePlayback } from '@/ui';

const LRC = [
  '[00:00.30]骰子落下的聲音',
  '[00:02.20]Roll the dice',
  '[00:04.00]燭火搖晃　故事開始',
  '[00:06.00]再擲一次',
].join('\n');

const W = 640;
const H = 360;

export function LyricFxDemo() {
  const [settings, setSettings] = useState<ScatterSettings>(() => ({
    ...scatterStyle.defaults(),
    preview: 1,
  }));
  const [movie, setMovie] = useState<{ url: string; size: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const lines = useMemo(() => buildLyricLines(LRC).lines, []);
  const plan = useMemo(
    () => scatterStyle.plan(lines, settings, 7, { width: W, height: H }, createCanvasMeasure()),
    [lines, settings],
  );
  const playback = usePlayback({ duration: 8, loop: true });

  useEffect(() => () => (movie ? URL.revokeObjectURL(movie.url) : undefined), [movie]);

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#1d2433';
    ctx.fillRect(0, 0, W, H);
    scatterStyle.draw(ctx, playback.time, plan, settings, { x: 0, y: 0, width: W, height: H });
  }, [plan, settings, playback.time]);

  const encode = async () => {
    setBusy(true);
    try {
      const p = await findAlphaWebmPlan({ width: 320, height: 180, fps: 15 });
      if (!p) return;
      const c = document.createElement('canvas');
      c.width = 320;
      c.height = 180;
      const g = c.getContext('2d', { willReadFrequently: true });
      if (!g) return;
      const small = scatterStyle.plan(
        lines,
        settings,
        7,
        { width: 320, height: 180 },
        createCanvasMeasure(),
      );
      const blob = await encodeAlphaWebm({
        plan: p,
        width: 320,
        height: 180,
        fps: 15,
        frameCount: 30,
        renderFrame: (i) => {
          g.clearRect(0, 0, 320, 180);
          scatterStyle.draw(g, 1 + i / 15, small, settings, {
            x: 0,
            y: 0,
            width: 320,
            height: 180,
          });
          return c;
        },
      });
      setMovie({ url: URL.createObjectURL(blob), size: blob.size });
    } finally {
      setBusy(false);
    }
  };

  const sections = scatterStyle.controls.filter((s) => ['text', 'colors', 'motion'].includes(s.id));
  return (
    <Section title="歌詞演出（core/lyricfx、LyricStyleControls、encodeAlphaWebm）">
      <div className="flex min-w-0 flex-col gap-3" data-testid="lyricfx-demo">
        <p className="m-0 text-xs text-muted">
          buildLyricLines 組出要排的句；風格的 plan 事先排好位置與時間（由種子決定），draw
          畫任一時間的一格、可以畫進任何矩形；LyricStyleControls 照風格的 controls
          產生設定面板；encodeAlphaWebm 逐格編成透明背景的 WebM。
        </p>
        <canvas
          ref={canvas}
          width={W}
          height={H}
          className="block h-auto w-full max-w-xl rounded-sm"
          data-testid="lyricfx-demo-canvas"
        />
        <Transport {...playback} fps={15} />
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            icon={<Clapperboard />}
            onClick={() => void encode()}
            disabled={busy}
            loading={busy}
          >
            編成透明 WebM（2 秒）
          </Button>
          {movie ? (
            <a
              href={movie.url}
              download="示範-透明.webm"
              className="text-xs text-accent underline"
              data-testid="lyricfx-demo-movie"
            >
              示範-透明.webm（{formatBytes(movie.size)}）
            </a>
          ) : null}
        </div>
        <LyricStyleControls
          sections={sections}
          settings={settings as unknown as Record<string, unknown>}
          onChange={(patch) => setSettings((s) => scatterStyle.normalize({ ...s, ...patch }))}
          openSections={1}
          persistKey="gallery:lyricfx"
        />
      </div>
    </Section>
  );
}
