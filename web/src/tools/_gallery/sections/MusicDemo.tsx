/**
 * 音樂與歌詞的示範（music-frame 移植時新增）：
 * - core/audio 的 createAudioPlayer＋ui 的 useAudioPlayback：程式產生 4 秒的示範音樂，用共用播放列（分:秒）播放；
 *   AnalyserNode 的頻譜依 logFrequencyBands 分成 24 段畫長條。
 * - core/lyrics：LRC 的解析、目前這一句、播放中打點。
 * - core/video 的 findMoviePlan／encodeMovie：同一段音樂＋畫面逐格編成有聲音的影片（MP4／MOV）。
 */
import { Clapperboard, Music2, Timer } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  bandAverage,
  createAudioPlayer,
  logFrequencyBands,
  type PcmAudio,
  wavBlob,
} from '@/core/audio';
import { formatBytes } from '@/core/files';
import { lyricAt, parseLyrics, stampLyrics } from '@/core/lyrics';
import { encodeMovie, findMoviePlan } from '@/core/video';
import { Button, Section, TextArea, Transport, useAudioPlayback } from '@/ui';

const clock = (t: number) => {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** 4 秒的示範音樂：每 0.5 秒一下低音、上面一段簡單的旋律 */
function demoSong(sr = 44100): PcmAudio {
  const n = 4 * sr;
  const a = new Float32Array(n);
  const notes = [262, 330, 392, 523, 392, 330, 294, 262];
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    const beat = t % 0.5;
    const note = notes[Math.floor(t * 2) % notes.length];
    a[i] =
      Math.sin(2 * Math.PI * 55 * t) * Math.exp(-beat * 10) * 0.5 +
      Math.sin(2 * Math.PI * note * t) * 0.18 * Math.exp(-beat * 3);
  }
  return { sampleRate: sr, channels: [a, a.slice()] };
}

const SAMPLE_LYRICS =
  '[00:00.20] 擲出骰子\n[00:01.20] 命運開始轉動\n[00:02.40] 大成功！\n第四句還沒有時間';

export function MusicDemo() {
  const player = useMemo(() => createAudioPlayer(), []);
  useEffect(() => () => player.dispose(), [player]);
  const playback = useAudioPlayback(player);
  const [song, setSong] = useState<PcmAudio | null>(null);
  const [lyrics, setLyrics] = useState(SAMPLE_LYRICS);
  const [movie, setMovie] = useState<{ name: string; url: string; size: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const bars = useRef<HTMLCanvasElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const parsed = useMemo(() => parseLyrics(lyrics), [lyrics]);
  const { current, next } = lyricAt(parsed.lines, playback.time);

  useEffect(() => () => (movie ? URL.revokeObjectURL(movie.url) : undefined), [movie]);

  /* 長條：播放中每個畫面畫 */
  useEffect(() => {
    const c = bars.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !playback.loaded) return;
    const freq = new Uint8Array(1024);
    let raf = 0;
    const draw = () => {
      const an = player.analyser;
      const css = getComputedStyle(document.documentElement);
      ctx.clearRect(0, 0, c.width, c.height);
      if (an && player.context) {
        an.getByteFrequencyData(freq);
        const bands = logFrequencyBands(24, { sampleRate: player.context.sampleRate });
        ctx.fillStyle = css.getPropertyValue('--accent').trim() || '#b79ce0';
        bands.forEach(([lo, hi], i) => {
          const v = bandAverage(freq, lo, hi);
          const h = Math.max(2, v * c.height);
          ctx.fillRect(i * (c.width / 24) + 2, c.height - h, c.width / 24 - 4, h);
        });
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [player, playback.loaded]);

  const load = async () => {
    const pcm = demoSong();
    await player.load(wavBlob(pcm));
    setSong(pcm);
  };

  const stamp = () => {
    const r = stampLyrics(lyrics, area.current?.selectionStart ?? 0, player.time());
    if (!r.ok) return;
    setLyrics(r.text);
    requestAnimationFrame(() => area.current?.setSelectionRange(r.caret, r.caret));
  };

  const encode = async () => {
    if (!song) return;
    setBusy(true);
    try {
      const plan = await findMoviePlan({
        width: 320,
        height: 180,
        fps: 15,
        audio: { sampleRate: song.sampleRate },
        videoCodecs: ['avc1', 'vp09'],
      });
      if (!plan) return;
      const canvas = document.createElement('canvas');
      canvas.width = 320;
      canvas.height = 180;
      const ctx = canvas.getContext('2d')!;
      const blob = await encodeMovie({
        plan,
        width: 320,
        height: 180,
        fps: 15,
        frameCount: 30,
        keyFrameInterval: 15,
        audio: { pcm: song, start: 0, end: 2 },
        renderFrame: (i) => {
          ctx.fillStyle = '#1d2433';
          ctx.fillRect(0, 0, 320, 180);
          ctx.fillStyle = '#b79ce0';
          ctx.font = '20px sans-serif';
          ctx.fillText(lyricAt(parsed.lines, i / 15).current?.text ?? '♪', 16, 100);
          return canvas;
        },
      });
      setMovie({ name: `示範.${plan.extension}`, url: URL.createObjectURL(blob), size: blob.size });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="音樂與歌詞（core/audio、core/lyrics、useAudioPlayback、encodeMovie）">
      <div className="flex min-w-0 flex-col gap-3" data-testid="music-demo">
        <p className="m-0 text-xs text-muted">
          createAudioPlayer 播放音樂（AnalyserNode 的頻譜畫成長條）；useAudioPlayback
          接上共用播放列； parseLyrics／lyricAt 依時間找出目前這一句，stampLyrics
          在游標所在的行記下播放時間；encodeMovie 把畫面與聲音逐格編成影片。
        </p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Music2 />} onClick={() => void load()} disabled={!!song}>
            產生 4 秒的示範音樂
          </Button>
          <Button size="sm" icon={<Timer />} onClick={stamp} disabled={!song}>
            打點
          </Button>
          <Button
            size="sm"
            icon={<Clapperboard />}
            onClick={() => void encode()}
            disabled={!song || busy}
            loading={busy}
          >
            編成有聲音的影片（2 秒）
          </Button>
        </div>
        {playback.loaded ? (
          <>
            <Transport {...playback} fps={1} formatTime={clock} />
            <canvas
              ref={bars}
              width={480}
              height={48}
              className="block h-12 w-full max-w-md rounded-sm bg-surface-2"
            />
          </>
        ) : null}
        <TextArea
          ref={area}
          aria-label="示範歌詞"
          value={lyrics}
          rows={4}
          wrap="off"
          className="font-mono text-xs"
          onChange={(e) => setLyrics(e.target.value)}
        />
        <p className="m-0 text-sm" data-testid="music-demo-line">
          目前：{current?.text ?? '—'}
          <span className="text-muted">　下一句：{next?.text ?? '—'}</span>
        </p>
        <p className="m-0 text-xs text-muted">
          讀到 {parsed.lines.length} 句、沒有時間的 {parsed.untimed} 行。
        </p>
        {movie ? (
          <p className="m-0 text-xs text-muted" data-testid="music-demo-movie">
            <a href={movie.url} download={movie.name} className="text-accent underline">
              {movie.name}
            </a>
            （{formatBytes(movie.size)}）
          </p>
        ) : null}
      </div>
    </Section>
  );
}
