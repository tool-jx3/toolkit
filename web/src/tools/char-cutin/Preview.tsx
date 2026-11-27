/**
 * 預覽（規格 F37～F41）：1280 × 720 的畫布、每 2.1 秒重複一次（速度跟著這個型的設定）；暫停、拖曳時間軸、
 * 背景（暗、亮、透明的棋盤格、示意場景、自訂色、背景圖；只供預覽）。
 * - 改設定時：播放中跳到 0.5 秒（停留的開頭，馬上看得到改了什麼）；暫停中停在進場或退場的話跳到 0.9 秒。換型時從頭播放。
 * - 立繪拖到預覽上放開＝加入演員。
 */
import { type DragEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useAssetBitmaps } from '@/core/assets';
import { cn, Notice, type Playback, Stage, type StageAnyBackgroundKind, Transport } from '@/ui';
import { addFiles } from './actions';
import { loadShotFonts } from './exporter';
import { rivalActor } from './model';
import { BEAT, SEGMENTS } from './motion';
import { paintFrame } from './paint';
import { compose, H, W } from './scenes';
import { previewHero, type Shot, shotOf } from './shot';
import { assets, useDoc, usePrefs } from './store';
import { S } from './strings';

declare global {
  interface Window {
    __charCutin?: unknown;
  }
}

const BACKGROUNDS: readonly StageAnyBackgroundKind[] = [
  'dark',
  'light',
  'checker',
  'scene',
  'color',
  'image',
];

type FontState = 'ok' | 'loading' | 'missing';

/** 用到的字型載好之後重畫一次 */
function useShotFonts(shot: Shot): { state: FontState; tick: number } {
  const key = JSON.stringify([shot.crew.fonts, shot.texts]);
  const [state, setState] = useState<FontState>('ok');
  const [tick, setTick] = useState(0);
  const latest = useRef(shot);
  latest.current = shot;
  // biome-ignore lint/correctness/useExhaustiveDependencies: key 已經包含字型與文字
  useEffect(() => {
    let alive = true;
    /* 很快就載好（已經載過）時不閃「載入中」 */
    const slow = setTimeout(() => alive && setState('loading'), 250);
    void loadShotFonts(latest.current).then((ok) => {
      clearTimeout(slow);
      if (!alive) return;
      setState(ok ? 'ok' : 'missing');
      setTick((n) => n + 1);
    });
    return () => {
      alive = false;
      clearTimeout(slow);
    };
  }, [key]);
  return { state, tick };
}

const hasFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

export function PreviewPane({ playback }: { playback: Playback }) {
  const d = useDoc((s) => s.data);
  const selected = usePrefs((s) => s.data.selected);
  const hero = previewHero(d, selected);
  const rival = d.kind === 'versus' ? rivalActor(d) : null;
  const ids = [hero?.image, rival?.image].filter((x): x is string => !!x);
  const { bitmaps } = useAssetBitmaps(assets, ids);
  const shot = useMemo(() => shotOf(d, hero, bitmaps), [d, hero, bitmaps]);
  const fonts = useShotFonts(shot);
  const [dropping, setDropping] = useState(false);

  /* 改設定時跳到看得到變化的時間；換型時從頭播放 */
  const sig = JSON.stringify([
    d.actors,
    d.styles[d.kind],
    d.impactText,
    d.rival,
    d.mysteryName,
    selected,
  ]);
  const last = useRef({ sig, kind: d.kind });
  const pb = useRef(playback);
  pb.current = playback;
  useEffect(() => {
    const p = pb.current;
    if (last.current.kind !== d.kind) p.onRestart();
    else if (last.current.sig !== sig) {
      if (p.playing) p.onTimeChange(0.5);
      else if (p.time < 0.35 || p.time > BEAT.leave) p.onTimeChange(0.9);
    }
    last.current = { sig, kind: d.kind };
  }, [sig, d.kind]);

  /* 畫目前的時間 */
  const canvas = useRef<HTMLCanvasElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: fonts.tick＝字型載好之後重畫
  useEffect(() => {
    const c2d = canvas.current?.getContext('2d');
    if (!c2d) return;
    paintFrame(c2d, W, H, compose(shot.kind, { ...shot.input, t: playback.time }), shot.crew);
  }, [shot, playback.time, fonts.tick]);

  /* 測試與對等驗證用 */
  const shotRef = useRef(shot);
  shotRef.current = shot;
  useEffect(() => {
    window.__charCutin = {
      ...(window.__charCutin as object | undefined),
      doc: () => useDoc.getState().data,
      seek: (t: number) => {
        pb.current.pause();
        pb.current.onTimeChange(t);
      },
      time: () => pb.current.time,
      layers: (t: number) => compose(shotRef.current.kind, { ...shotRef.current.input, t }),
      shot: () => ({ kind: shotRef.current.kind, input: shotRef.current.input }),
    };
  }, []);

  return (
    <div className="flex flex-col gap-2">
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 只接住拖到預覽上的立繪（鍵盤用「演員」的選檔按鈕） */}
      <div
        className={cn('relative rounded-lg', dropping && 'ring-2 ring-accent')}
        onDragOver={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={() => setDropping(false)}
        onDrop={(e) => {
          if (!hasFiles(e)) return;
          e.preventDefault();
          setDropping(false);
          void addFiles(Array.from(e.dataTransfer.files));
        }}
      >
        <Stage<StageAnyBackgroundKind>
          width={W}
          height={H}
          backgrounds={BACKGROUNDS}
          defaultBackground={{ kind: 'dark' }}
          aria-label={S.previewLabel}
        >
          <canvas
            ref={canvas}
            width={W}
            height={H}
            className="block size-full"
            data-testid="cutin-canvas"
          />
        </Stage>
        {dropping ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-lg bg-overlay text-lg font-semibold text-fg">
            {S.dropHere}
          </div>
        ) : null}
      </div>
      <Transport
        time={playback.time}
        duration={playback.duration}
        playing={playback.playing}
        loop={playback.loop}
        onTimeChange={playback.onTimeChange}
        onPlayingChange={playback.onPlayingChange}
        onRestart={playback.onRestart}
        segments={SEGMENTS}
        fps={30}
      />
      {!d.actors.length ? <Notice tone="info">{S.previewEmpty}</Notice> : null}
      {fonts.state === 'loading' ? (
        <p className="m-0 text-xs text-muted" role="status">
          {S.fontLoading}
        </p>
      ) : fonts.state === 'missing' ? (
        <p className="m-0 text-xs text-warning" role="status">
          {S.fontMissing}
        </p>
      ) : null}
    </div>
  );
}
