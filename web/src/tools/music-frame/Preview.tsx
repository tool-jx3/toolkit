/**
 * 預覽（規格 F46～F49）：1920 × 1080 的畫布（每個畫面重畫；沒有變化時不重畫）、播放列（有音樂時控制音樂，
 * 沒有音樂時控制循環的預覽）、移除音樂、儲存 PNG。
 */
import { ImageDown, Music2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button, Stage, Transport, useAudioPlayback, usePlayback } from '@/ui';
import { demoArt, notify, removeAudio } from './actions';
import { drawDemoCover } from './demo';
import { savePng } from './exporter';
import { frameLayout } from './layout';
import { demoContext } from './media';
import { FRAME_H, FRAME_W, formatClock } from './model';
import { type FrameClock, FrameRenderer, phaseAt } from './render';
import { buildScene, liveViz, registerPreview } from './scene';
import { player, useSession, useSettings } from './store';
import { S } from './strings';
import { updateViz, vizSettling } from './viz';

export interface PreviewControls {
  toggle(): void;
}

let controls: PreviewControls | null = null;
/** 播放／暫停（快捷鍵）：有音樂時控制音樂，沒有時控制循環預覽 */
export const togglePreview = () => controls?.toggle();

export function Preview() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const loopLength = useSettings((st) => st.data.export.loopLength);
  const hasAudio = useSession((st) => !!st.audio);
  const audioName = useSettings((st) => st.data.audio.name);
  const exporting = useSession((st) => st.exporting);
  const loop = usePlayback({ duration: loopLength, loop: true });
  const audio = useAudioPlayback(player);
  const loopRef = useRef(loop);
  loopRef.current = loop;
  const lastClock = useRef<FrameClock>({ t: 0, beat: false, timeDomain: null });

  /* 有音樂時循環預覽停著（不白跑） */
  useEffect(() => {
    if (hasAudio) loopRef.current.pause();
  }, [hasAudio]);

  useEffect(() => {
    controls = {
      toggle: () => {
        if (useSession.getState().exporting) return;
        if (useSession.getState().audio) {
          if (player.playing) player.pause();
          else void player.play();
        } else loopRef.current.toggle();
      },
    };
    registerPreview({
      get canvas() {
        return canvasRef.current;
      },
      clock: () => lastClock.current,
      restartLoop: () => {
        loopRef.current.onTimeChange(0);
        loopRef.current.play();
      },
    });
    return () => {
      controls = null;
      registerPreview(null);
    };
  }, []);

  /* 畫面：每個畫面檢查要不要重畫 */
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d', { alpha: false });
    if (!canvas || !ctx) return;
    const renderer = new FrameRenderer(ctx);
    const freq = new Uint8Array(1024);
    const wave = new Uint8Array(2048);
    let raf = 0;
    let last = performance.now();
    let prev: unknown[] = [];
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const sess = useSession.getState();
      /* 逐格匯出時預覽停在原本的畫面（即時錄影時預覽就是錄影的畫面，照常畫） */
      if (sess.exporting && !sess.recording) {
        last = now;
        return;
      }
      const art = sess.art ?? demoArt();
      const s = useSettings.getState().data;
      const song = sess.audio;
      const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
      last = now;
      const bars = frameLayout(s.layout).text.bars;
      let clock: FrameClock;
      let animating: boolean;
      if (song) {
        const an = player.analyser;
        if (an && player.context) {
          an.getByteFrequencyData(freq);
          an.getByteTimeDomainData(wave);
          updateViz(liveViz, freq, bars, {
            sampleRate: player.context.sampleRate,
            frames: dt * 60,
          });
        }
        clock = { t: player.time(), beat: player.playing, timeDomain: wave };
        animating = player.playing || vizSettling(liveViz, bars);
      } else {
        clock = { t: loopRef.current.time, beat: false, timeDomain: null };
        animating = false;
      }
      lastClock.current = clock;
      renderer.invalidate(`preview-${sess.fontTick}`);
      const sig = [s, art, song, sess.fontTick, clock.t];
      if (!animating && sig.every((v, i) => Object.is(v, prev[i]))) return;
      prev = sig;
      if (art.demo) drawDemoCover(demoContext(art), phaseAt(s, !!song, clock.t).ph);
      renderer.draw(buildScene(s, art, song), liveViz, clock);
      canvas.dataset.rendered = String(Number(canvas.dataset.rendered ?? 0) + 1);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onPng = async () => {
    if (useSession.getState().exporting) return;
    try {
      const name = await savePng();
      notify({ title: S.toast.png(name), tone: 'success' });
    } catch (e) {
      notify({ title: e instanceof Error ? e.message : S.toast.pngFailed, tone: 'danger' });
    }
  };

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Stage
        width={FRAME_W}
        height={FRAME_H}
        aria-label={S.preview.aria}
        toolbar={false}
        defaultBackground={{ kind: 'dark' }}
      >
        <canvas
          ref={canvasRef}
          width={FRAME_W}
          height={FRAME_H}
          className="block size-full"
          data-testid="preview-canvas"
          aria-label={S.preview.aria}
        />
      </Stage>
      {hasAudio ? (
        <div className="flex min-w-0 flex-col gap-2" data-testid="audio-transport">
          <Transport {...audio} fps={1} formatTime={formatClock} disabled={exporting} />
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <span className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-muted">
              <Music2 aria-hidden className="size-3.5 shrink-0" />
              <span className="truncate" title={audioName}>
                {audioName}
              </span>
            </span>
            <Button size="sm" variant="ghost" onClick={removeAudio} disabled={exporting}>
              {S.preview.removeAudio}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-1" data-testid="loop-transport">
          <Transport {...loop} onLoopChange={undefined} fps={30} disabled={exporting} />
          <p className="m-0 text-xs text-muted">{S.preview.loopNote(loopLength)}</p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          icon={<ImageDown />}
          onClick={() => void onPng()}
          disabled={exporting}
          data-testid="save-png"
        >
          {S.preview.png}
        </Button>
        <span className="text-xs text-muted">{S.preview.pngHint}</span>
      </div>
      <p className="m-0 text-xs text-muted">{S.preview.dropHint}</p>
    </div>
  );
}
