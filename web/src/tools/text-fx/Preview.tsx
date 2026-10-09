/**
 * 預覽區：舞台（canvas）、播放列、提示、匯出。
 * 每一格的時間只在這個元件裡變動，設定面板不會跟著每格重繪。
 */
import { type Ref, type RefObject, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { AnimationExportFormat } from '@/core/timeline';
import { frameCount } from '@/core/timeline';
import {
  animationFormats,
  Button,
  ExportPanel,
  type ExportPanelHandle,
  type ExportSettings,
  Field,
  Notice,
  Stage,
  type StageBackground,
  TextInput,
  Toggle,
  Transport,
  usePlayback,
  useWebpSupport,
} from '@/ui';
import { BatchField } from './BatchField';
import { batchByLines, batchByTemplates, batchNames, batchZipName, runBatch } from './batch';
import { setCfg } from './controls';
import { MAX_FRAMES, phaseLabel, runExport, sceneSegments } from './exporter';
import { autoFileName, baseName } from './filename';
import { templateById } from './library';
import { useMine } from './mine';
import type { Scene } from './scene';
import { FPS_CHOICES, MODES, playsOf, type Settings } from './settings';
import { setManualName, updateCfg, useReplay, useTfx, useView } from './store';
import { S } from './strings';

export interface PlayHandle {
  seek: (t: number) => void;
  setPlaying: (on: boolean) => void;
  toggle: () => void;
  restart: () => void;
  /** 往前／往後一格並暫停 */
  step: (dir: 1 | -1) => void;
  readonly t: number;
  readonly playing: boolean;
}

function Hints({ scene, cfg }: { scene: Scene; cfg: Settings }) {
  const n = frameCount(scene.duration, cfg.fps);
  const items: {
    key: string;
    tone: 'info' | 'warning' | 'danger';
    text: string;
    action?: [string, () => void];
  }[] = [];
  if (scene.empty) items.push({ key: 'empty', tone: 'danger', text: S.hints.empty });
  if (scene.shrunk)
    items.push({
      key: 'shrunk',
      tone: 'info',
      text: `文字放不下，已自動縮小：${Math.round(scene.shrunk.from)} px → ${Math.round(scene.shrunk.to)} px`,
    });
  if (cfg.hold.fx !== 'none' && !(cfg.mode === 'long' && cfg.flow.kind === 'scroll'))
    items.push({ key: 'hold', tone: 'warning', text: S.hints.holdSize });
  if (cfg.hold.fx === 'breathe' && !cfg.glow.on)
    items.push({
      key: 'breathe',
      tone: 'warning',
      text: S.hints.breathe,
      action: [S.hints.breatheAction, () => setCfg('glow.on', true)],
    });
  if (!cfg.outroOn && cfg.loop === 'infinite')
    items.push({
      key: 'loop',
      tone: 'warning',
      text: S.hints.loopNoOutro,
      action: [S.hints.loopNoOutroAction, () => setCfg('loop', 'once')],
    });
  if (n > MAX_FRAMES)
    items.push({
      key: 'frames',
      tone: 'danger',
      text: `影格數 ${n} 超過上限 ${MAX_FRAMES}：請縮短時長或降低 fps。`,
    });
  if (!items.length) return null;
  return (
    <div className="flex flex-col gap-1.5" data-testid="hints">
      {items.map((h) => (
        <Notice
          key={h.key}
          tone={h.tone}
          action={
            h.action ? (
              <Button size="sm" variant="secondary" onClick={h.action[1]}>
                {h.action[0]}
              </Button>
            ) : undefined
          }
        >
          {h.text}
        </Notice>
      ))}
    </div>
  );
}

/** 檔名欄：打字時先放在草稿，離開或按 Enter 才存（跟舊版一樣去頭尾空白） */
function NameField({ cfg }: { cfg: Settings }) {
  const manual = useTfx((st) => st.data.names[st.data.mode]);
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null) setManualName(draft);
    setDraft(null);
  };
  return (
    <Field label={S.export.nameLabel}>
      <div className="flex min-w-0 gap-2">
        <TextInput
          value={draft ?? manual}
          placeholder={autoFileName(cfg)}
          spellCheck={false}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
          }}
        />
        <Button
          size="sm"
          className="h-8 shrink-0"
          onClick={() => {
            setDraft(null);
            setManualName('');
          }}
        >
          {S.export.autoName}
        </Button>
      </div>
    </Field>
  );
}

export function Preview({
  scene,
  cfg,
  fontsLoading,
  playRef,
  exportRef,
}: {
  scene: Scene;
  cfg: Settings;
  fontsLoading: boolean;
  playRef: Ref<PlayHandle>;
  exportRef: RefObject<ExportPanelHandle | null>;
}) {
  const view = useView((st) => st.data);
  const mode = useTfx((st) => st.data.mode);
  const tplId = useTfx((st) => st.data.modes[st.data.mode].tpl);
  const mineId = useTfx((st) => st.data.modes[st.data.mode].mine);
  const mineName = useMine((st) => st.data.items.find((t) => t.id === mineId)?.name);
  const playback = usePlayback({ duration: scene.duration, loop: view.loop });
  const canvas = useRef<HTMLCanvasElement>(null);
  const webp = useWebpSupport();
  const [imageUrl, setImageUrl] = useState<string | undefined>(undefined);
  const [imageOn, setImageOn] = useState(false);

  const state = useRef({ playback, scene });
  state.current = { playback, scene };

  useImperativeHandle(playRef, () => ({
    seek: (t: number) => {
      const p = state.current.playback;
      p.pause();
      p.onTimeChange(Math.min(state.current.scene.duration, Math.max(0, t)));
    },
    setPlaying: (on: boolean) =>
      on ? state.current.playback.play() : state.current.playback.pause(),
    toggle: () => state.current.playback.toggle(),
    restart: () => state.current.playback.onRestart(),
    step: (dir: 1 | -1) => {
      const p = state.current.playback;
      p.pause();
      p.onTimeChange(
        Math.min(state.current.scene.duration, Math.max(0, p.time + dir / Math.max(1, cfg.fps))),
      );
    },
    get t() {
      return state.current.playback.time;
    },
    get playing() {
      return state.current.playback.playing;
    },
  }));

  /* 套用範本、切換模式：從頭播放 */
  const token = useReplay((st) => st.token);
  const lastToken = useRef(token);
  useEffect(() => {
    if (token === lastToken.current) return;
    lastToken.current = token;
    state.current.playback.onRestart();
  }, [token]);

  /* 換了場景（含第一次）：暫停中、畫面變成空的就跳到完成狀態 */
  const prevScene = useRef<Scene | null>(null);
  useEffect(() => {
    const prev = prevScene.current;
    prevScene.current = scene;
    const p = state.current.playback;
    const t = Math.min(p.time, scene.duration);
    const wasBlank = prev ? prev.isBlankAt(p.time) : true;
    if (!p.playing && (scene.isBlankAt(t) || wasBlank)) p.onTimeChange(scene.repTime);
  }, [scene]);

  /* 畫目前這一格 */
  useEffect(() => {
    const ctx = canvas.current?.getContext('2d');
    if (ctx) scene.draw(ctx, playback.time);
  }, [scene, playback.time]);

  const background: StageBackground =
    imageOn && imageUrl ? { kind: 'image', imageUrl } : { kind: view.bg, color: view.color };

  const n = frameCount(scene.duration, cfg.fps);
  const pages = cfg.mode === 'long' && scene.pages.length > 1 ? `・${scene.pages.length} 頁` : '';
  const exportSettings: ExportSettings = {
    format: view.format,
    fps: cfg.fps,
    plays: playsOf(cfg),
    scale: view.scale,
    quantize: cfg.colors === 256,
  };
  const modeName = MODES.find((m) => m[0] === mode)?.[1] ?? '';
  /* 套用中的是我的範本時顯示它的名稱 */
  const tplName =
    mineName !== undefined ? mineName.trim() || S.mine.unnamed : templateById(mode, tplId).name;
  const isScroll = cfg.mode === 'long' && cfg.flow.kind === 'scroll';
  const batchOn = (view.batch ?? 'off') !== 'off';
  /* 一次匯出多個時不能用連番 PNG（每個都會是一包 ZIP） */
  const formats = animationFormats(['apng', 'gif', 'webp', 'png', 'zip'], {
    webpSupported: webp,
  }).map((f) =>
    batchOn && f.id === 'zip' ? { ...f, disabled: true, disabledReason: S.batch.zipOff } : f,
  );

  return (
    <>
      <Stage
        width={scene.W}
        height={scene.H}
        aria-label="動畫預覽"
        className="shrink-0"
        background={background}
        backgrounds={['checker', 'dark', 'light', 'color', 'image']}
        onBackgroundChange={(bg) => {
          if (bg.kind === 'image') {
            if (bg.imageUrl) setImageUrl(bg.imageUrl);
            setImageOn(true);
            return;
          }
          setImageOn(false);
          useView.getState().patch({ bg: bg.kind, ...(bg.color ? { color: bg.color } : {}) });
        }}
        toolbarExtra={
          fontsLoading ? (
            <span role="status" className="mr-2 text-xs text-muted">
              {S.loadingFonts}
            </span>
          ) : null
        }
      >
        <canvas
          ref={canvas}
          width={scene.W}
          height={scene.H}
          className="block size-full"
          data-testid="tfx-canvas"
        />
      </Stage>
      <Transport
        {...playback}
        onLoopChange={(l) => {
          playback.onLoopChange(l);
          useView.getState().patch({ loop: l });
        }}
        segments={sceneSegments(scene)}
        legend={scene.pages.length <= 1}
        markers={[
          { time: scene.repTime, label: `代表畫面（完成狀態）${scene.repTime.toFixed(2)} 秒` },
        ]}
        fps={cfg.fps}
      />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-1 text-xs text-muted">
        {!isScroll ? (
          <Toggle
            label={S.introSwitch.bar}
            checked={cfg.introOn !== false}
            onCheckedChange={(on) => setCfg('introOn', on)}
            aria-label={S.introSwitch.barAria}
          />
        ) : null}
        <Toggle
          label="退場"
          checked={cfg.outroOn}
          onCheckedChange={(on) => setCfg('outroOn', on)}
          aria-label="退場（關掉時停在完成狀態）"
        />
        <span data-testid="phase-label" className="text-fg">
          {phaseLabel(scene, playback.time) || ' '}
        </span>
        <span data-testid="meta-line" className="ml-auto tabular-nums">
          <b className="font-medium text-fg">{modeName}</b>／{tplName}・{scene.W}×{scene.H}・
          {cfg.fps} fps・{scene.duration.toFixed(2)} 秒・{n} 格{pages}
        </span>
      </div>
      <Hints scene={scene} cfg={cfg} />
      <ExportPanel
        ref={exportRef}
        formats={formats}
        baseSize={{ width: scene.W, height: scene.H }}
        fpsOptions={FPS_CHOICES}
        maxPlays={999}
        loopHint={cfg.loop === 'once' ? S.export.loopOnceHint : undefined}
        quantizeHint={S.export.quantizeHint}
        sizeWarningHint={S.export.sizeWarning}
        settings={exportSettings}
        onSettingsChange={(next) => {
          if (next.format !== view.format || next.scale !== view.scale)
            useView.getState().patch({ format: next.format, scale: next.scale });
          updateCfg((s) => {
            if ((FPS_CHOICES as readonly number[]).includes(next.fps)) s.fps = next.fps;
            s.colors = next.quantize ? 256 : 'full';
            if (next.plays !== playsOf(s)) {
              if (next.plays === 0) s.loop = 'infinite';
              else if (next.plays === 1 && s.loop !== 'count') s.loop = 'once';
              else {
                s.loop = 'count';
                s.loopCount = next.plays;
              }
            }
          });
        }}
        extra={
          <div className="flex flex-col gap-3 border-t border-border pt-3">
            {view.format === 'apng' ? (
              <Field
                label="預設圖用完成狀態"
                layout="inline"
                hint="不支援 APNG 的環境（看圖程式等）顯示完成狀態；關掉時顯示第一格。"
              >
                <Toggle
                  checked={cfg.stillFallback}
                  onCheckedChange={(on) => setCfg('stillFallback', on)}
                />
              </Field>
            ) : null}
            <Field label="自動裁掉透明邊" layout="inline">
              <Toggle checked={cfg.autoCrop} onCheckedChange={(on) => setCfg('autoCrop', on)} />
            </Field>
            <NameField cfg={cfg} />
            <BatchField cfg={cfg} />
            {view.format === 'png' ? (
              <p className="m-0 text-xs text-muted">{S.export.pngNote}</p>
            ) : null}
          </div>
        }
        onExport={async (s, { signal, onProgress }) => {
          const d = useTfx.getState().data;
          const c = d.modes[d.mode].s;
          const p = state.current.playback;
          const batch = useView.getState().data.batch ?? 'off';
          if (batch !== 'off') {
            /* 一次匯出多個（P11）：用目前的匯出設定，預設圖、裁邊照目前的設定 */
            const picked = useView.getState().data.batchPick?.[d.mode] ?? [];
            const items =
              batch === 'lines'
                ? batchByLines(c)
                : batchByTemplates(d, picked, useMine.getState().data.items);
            if (!items.length) throw new Error(batch === 'lines' ? S.export.noText : S.batch.none);
            for (const it of items) {
              it.cfg.stillFallback = c.stillFallback;
              it.cfg.autoCrop = c.autoCrop;
            }
            const manual = d.names[d.mode];
            const kindName =
              batch === 'templates'
                ? S.batch.templates
                : d.mode === 'long'
                  ? S.batch.pages
                  : S.batch.lines;
            return runBatch({
              items,
              names: batchNames(items, manual),
              zipName: batchZipName(batch, c, manual),
              summary: S.batch.summary(kindName, items.length),
              format: s.format as AnimationExportFormat,
              fps: s.fps,
              plays: s.plays,
              scale: s.scale,
              quantize: s.quantize,
              signal,
              onProgress,
            });
          }
          return runExport({
            cfg: c,
            format: s.format as AnimationExportFormat,
            fps: s.fps,
            plays: s.plays,
            scale: s.scale,
            quantize: s.quantize,
            name: baseName(c, d.names[d.mode]),
            pausedAt: p.playing ? null : p.time,
            signal,
            onProgress,
          });
        }}
      />
    </>
  );
}
