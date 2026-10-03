/**
 * 預覽欄（規格 1.11）：舞台（點格子指定目標）、指定目標的玩家、播放列、儲存目前畫面、自己試著選選看、分頁提示卡。
 */
import { ArrowRight, ExternalLink, ImageDown } from 'lucide-react';
import { type Ref, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { downloadBlob } from '@/core/files';
import { buildSegments } from '@/core/timeline';
import { Button, cn, Stage, type StageBackgroundKind, Transport, usePlayback } from '@/ui';
import { blockingIssue, notify, setPlayerTarget } from './actions';
import { snapshotPng } from './exporter';
import { openInteractivePreview } from './HtmlDialog';
import { tileAt } from './layout';
import { previewAssets, resolveAssets } from './media';
import { playerLabel } from './model';
import { playbackPlayers, selectionIssue, timelineDuration } from './motion';
import { renderToCanvas } from './render';
import { setTab, settingsNow, useSession, useSettings } from './store';
import { RENDER_TEXT, S } from './strings';

/** 預覽畫布最多約這麼多像素（再大就等比縮小畫，只影響預覽，規格 5. D19） */
const PREVIEW_PIXELS = 1280 * 1280;
export const previewScale = (w: number, h: number) =>
  Math.min(1, Math.sqrt(PREVIEW_PIXELS / Math.max(1, w * h)));

const BACKGROUNDS: readonly StageBackgroundKind[] = ['checker', 'dark', 'light'];

export interface PreviewHandle {
  toggle: () => void;
  seek: (ms: number) => void;
  readonly time: number;
  readonly playing: boolean;
}

function PlayerTargets() {
  const s = useSettings((st) => st.data);
  const editing = useSession((st) => st.editingPlayer);
  const exporting = useSession((st) => st.exporting);
  const players = playbackPlayers(s);
  const name = playerLabel(s, editing);
  const hint = !s.characters.length
    ? S.preview.hintEmpty
    : s.mainPanel.enabled
      ? S.preview.hintMain(name)
      : S.preview.hintPick(name);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-xs font-medium text-muted">{S.preview.targets}</span>
      {/* biome-ignore lint/a11y/useSemanticElements: 一組相關的按鈕，不是表單分組 */}
      <div
        role="group"
        aria-label={S.preview.targetsAria}
        className="flex flex-wrap gap-1.5"
        data-testid="preview-players"
      >
        {players.slice(0, 99).map((p) => (
          <button
            key={p}
            type="button"
            aria-pressed={p === editing}
            aria-label={S.players.pick(playerLabel(s, p))}
            onClick={() => useSession.setState({ editingPlayer: p })}
            disabled={exporting}
            className={cn(
              'h-7 max-w-28 truncate rounded-full border-2 px-2.5 text-xs font-bold outline-none focus-visible:ring-2 focus-visible:ring-focus',
              p === editing ? 'text-[#061018]' : 'bg-surface-2 text-fg',
            )}
            style={{
              borderColor: s.players.colors[p],
              ...(p === editing ? { background: s.players.colors[p] } : {}),
            }}
          >
            {playerLabel(s, p)}
          </button>
        ))}
      </div>
      <p className="m-0 w-full text-xs text-muted" data-testid="canvas-tip">
        {hint}
      </p>
    </div>
  );
}

export function Preview({ ref }: { ref?: Ref<PreviewHandle> }) {
  const s = useSettings((st) => st.data);
  const images = useSession((st) => st.images);
  const fontTick = useSession((st) => st.fontTick);
  const exporting = useSession((st) => st.exporting);
  const command = useSession((st) => st.command);
  const tab = useSession((st) => st.tab);
  const durationMs = timelineDuration(s);
  const issue = selectionIssue(s);
  const playback = usePlayback({ duration: durationMs / 1000, loop: s.animation.loop });
  const pb = useRef(playback);
  pb.current = playback;

  useEffect(() => pb.current.onLoopChange(s.animation.loop), [s.animation.loop]);
  /* 角色不夠時停止（規格 F94） */
  const blocked = !!issue;
  useEffect(() => {
    if (blocked) pb.current.pause();
  }, [blocked]);
  /* 指令：從頭播放／回到開頭並停住／停在某個時間 */
  useEffect(() => {
    if (!command) return;
    const p = pb.current;
    if (command.kind === 'restart') {
      if (selectionIssue(settingsNow())) {
        p.pause();
        p.onTimeChange(0);
      } else p.onRestart();
    } else if (command.kind === 'rewind') {
      p.pause();
      p.onTimeChange(0);
    } else {
      p.pause();
      p.onTimeChange(command.time / 1000);
    }
  }, [command]);

  const W = s.canvas.width;
  const H = s.canvas.height;
  const k = previewScale(W, H);
  const pw = Math.max(1, Math.round(W * k));
  const ph = Math.max(1, Math.round(H * k));
  const canvas = useRef<HTMLCanvasElement>(null);
  const assets = useMemo(() => previewAssets(s, images), [s, images]);
  const timeMs = playback.time * 1000;
  // biome-ignore lint/correctness/useExhaustiveDependencies: fontTick：字型載入後重畫
  useEffect(() => {
    const c = canvas.current;
    if (!c) return;
    renderToCanvas(c, s, timeMs, assets, { guides: s.ui.showGuides, text: RENDER_TEXT });
  }, [s, assets, timeMs, pw, ph, fontTick]);

  const guarded = (fn: () => void) => () => {
    const err = blockingIssue(settingsNow());
    if (err && settingsNow().characters.length) {
      notify({ title: err, tone: 'danger' });
      return;
    }
    fn();
  };
  const setPlaying = (on: boolean) => {
    if (on) guarded(() => playback.onPlayingChange(true))();
    else playback.onPlayingChange(false);
  };

  useImperativeHandle(ref, () => ({
    toggle: () => {
      if (useSession.getState().exporting) return;
      setPlaying(!pb.current.playing);
    },
    seek: (ms: number) => {
      pb.current.pause();
      pb.current.onTimeChange(ms / 1000);
    },
    get time() {
      return pb.current.time * 1000;
    },
    get playing() {
      return pb.current.playing;
    },
  }));

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (exporting) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const y = ((e.clientY - r.top) / r.height) * H;
    const tile = tileAt(s, x, y);
    if (tile >= 0) setPlayerTarget(useSession.getState().editingPlayer, tile);
  };

  const segments = useMemo(() => {
    const a = s.animation;
    return buildSegments([
      { id: 'hold', label: S.preview.segments.hold, duration: a.initialHold / 1000 },
      ...playbackPlayers(s).map((p) => ({
        id: `p${p}`,
        label: playerLabel(s, p),
        duration: (a.searchDuration + a.confirmDuration) / 1000,
        color: s.players.colors[p],
      })),
      { id: 'end', label: S.preview.segments.end, duration: a.endHold / 1000 },
    ]);
  }, [s]);

  const savePng = async () => {
    const now = settingsNow();
    if (!now.characters.length) {
      notify({ title: S.toast.needCharacters, tone: 'danger' });
      return;
    }
    try {
      const r = await snapshotPng(
        now,
        await resolveAssets(now),
        pb.current.time * 1000,
        now.export.scale,
      );
      downloadBlob(r.blob, r.fileName);
      notify({ title: S.toast.png, tone: 'success' });
    } catch (e) {
      notify({ title: e instanceof Error ? e.message : String(e), tone: 'danger' });
    }
  };

  const guide = S.guides[tab];
  const single = s.players.selectionMode === 'single';
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Stage
        width={W}
        height={H}
        aria-label={S.preview.aria}
        backgrounds={BACKGROUNDS}
        defaultBackground={{ kind: 'checker' }}
      >
        <canvas
          ref={canvas}
          width={pw}
          height={ph}
          onClick={onCanvasClick}
          className="block size-full cursor-pointer"
          data-testid="preview-canvas"
          data-output={`${W}x${H}`}
          aria-label={S.preview.aria}
        />
      </Stage>
      <p className="m-0 text-xs text-muted tabular-nums" data-testid="preview-size">
        {W} × {H}・{(durationMs / 1000).toFixed(2)} 秒・
        {S.preview.timeline(
          single
            ? S.preview.modeOne(playerLabel(s, s.players.singleNumber - 1))
            : S.preview.modeSeq,
        )}
      </p>
      <PlayerTargets />
      <Transport
        {...playback}
        onPlayingChange={setPlaying}
        onRestart={guarded(() => playback.onRestart())}
        loop={s.animation.loop}
        onLoopChange={(v) =>
          useSettings.getState().update((d) => {
            d.animation.loop = v;
          })
        }
        segments={segments}
        legend={segments.length <= 10}
        fps={30}
        disabled={exporting}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          icon={<ImageDown />}
          onClick={() => void savePng()}
          disabled={exporting}
          data-testid="save-png"
        >
          {S.preview.png}
        </Button>
        <Button
          icon={<ExternalLink />}
          onClick={() => void openInteractivePreview()}
          disabled={exporting}
        >
          {S.preview.tryIt}
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2">
        <span className="text-xs text-muted">{S.preview.live}</span>
        <Button size="sm" variant="ghost" onClick={() => setTab('export')}>
          {S.preview.goExport}
          <ArrowRight aria-hidden className="size-4" />
        </Button>
      </div>
      <aside className="rounded-md border border-border bg-surface-2 px-3 py-2" data-testid="guide">
        <h3 className="m-0 text-sm font-semibold text-fg">{guide.title}</h3>
        <p className="m-0 mt-1 text-xs text-muted">{guide.text}</p>
      </aside>
    </div>
  );
}
