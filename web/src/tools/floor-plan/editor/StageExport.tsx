/**
 * 匯出演出（2026-11-09，F323）：共用的匯出區（ExportPanel：格式、進度與取消、結果卡）放在對話框裡。
 * 格式：WebM、MP4（影片）、逐步公開 ZIP、現在的畫面 PNG。編碼的程式用到時才載入（editor/stageExport.ts）。
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, type ExportFormatOption, ExportPanel } from '@/ui';
import type { StageView } from '../draw/stage';
import { momentOf, momentProject } from '../model/moment';
import { STAGE_FPS } from '../model/stage';
import { ST } from '../stageStrings';
import { editor } from './controller';
import { stageCamera, stagePlayView } from './stageActions';
import { timelineOf } from './stageCache';
import { setStage, useStage } from './stageStore';
import { usePrefs, useProject } from './store';

const T = ST.exp;

type Format = 'webm' | 'mp4' | 'zip' | 'png';

/** 匯出用的檢視方式：播放畫面（「現在的檢視方式」時照檢視方式） */
const exportView = (): StageView => {
  const v = stagePlayView();
  return v === 'keep' ? (usePrefs.getState().data.view ?? 'plan') : v;
};

export function StageExportDialog() {
  const open = useStage((s) => s.exportOpen);
  const p = useProject((s) => s.data);
  const prefs = usePrefs((s) => s.data);
  const tl = timelineOf(p);
  const [support, setSupport] = useState<{ webm: boolean; mp4: boolean } | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const input = useMemo(
    () => ({
      /* 事件前後（2026-11-12，F333）：照目前顯示的狀態 */
      project: momentProject(p, momentOf(p)),
      tl,
      view: exportView(),
      camera: stageCamera(),
      hideClues: prefs.exp.clues === 'hide',
      noise: prefs.exp.noise !== false,
    }),
    [p, tl, prefs],
  );
  useEffect(() => {
    if (!open) return;
    let alive = true;
    void (async () => {
      const [m, fx] = await Promise.all([import('./stageExport'), import('@/core/imagefx')]);
      const s = m.stageVideoSize(input);
      if (!alive) return;
      setSize(s);
      const [webm, mp4] = await Promise.all([
        fx.detectVideoMode(s, STAGE_FPS, true, ['avc1', 'vp09'], { opaque: true }),
        fx.detectVideoMode(s, STAGE_FPS, false, ['avc1', 'vp09']),
      ]);
      if (alive) setSupport({ webm: webm.kind !== 'none', mp4: mp4.kind !== 'none' });
    })();
    return () => {
      alive = false;
    };
  }, [open, input]);
  const steps = tl.steps.length;
  const formats: ExportFormatOption[] = [
    {
      id: 'webm',
      label: T.webm,
      description: T.webmNote,
      animated: true,
      disabled: steps < 2 || support?.webm === false,
      disabledReason: steps < 2 ? T.nothing : T.noVideo,
    },
    {
      id: 'mp4',
      label: T.mp4,
      description: T.mp4Note,
      animated: true,
      disabled: steps < 2 || support?.mp4 === false,
      disabledReason: steps < 2 ? T.nothing : T.noVideo,
    },
    {
      id: 'zip',
      label: T.zip,
      description: T.zipNote,
      disabled: !tl.playable,
      disabledReason: T.nothing,
    },
    { id: 'png', label: T.png, description: T.pngNote },
  ];
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => setStage({ exportOpen: o })}
      title={T.title}
      description={T.lead}
      size="lg"
    >
      <ExportPanel
        formats={formats}
        defaultSettings={{ format: steps < 2 ? 'png' : 'webm', fps: STAGE_FPS }}
        fixedFps={STAGE_FPS}
        fixedFpsHint={T.fpsHint}
        estimate={
          size && steps > 1
            ? {
                width: size.width,
                height: size.height,
                frames: Math.ceil(tl.total * STAGE_FPS) + 1,
                duration: tl.total,
              }
            : null
        }
        resetKey={tl}
        onExport={async (settings, ctx) => {
          const m = await import('./stageExport');
          const f = settings.format as Format;
          if (f === 'webm' || f === 'mp4') return m.exportStageVideo(input, f, ctx);
          if (f === 'zip') return m.exportStageSteps(input, ctx);
          const v = editor.view;
          const box = { x: -v.ox / v.zoom, y: -v.oy / v.zoom, w: v.w / v.zoom, h: v.h / v.zoom };
          /* 現在的畫面：畫布上的檢視方式（準備時是檢視方式，演出的畫面是播放畫面） */
          const sc = editor.stage;
          return m.exportStageCurrent(
            { ...input, view: sc?.viewMode() ?? input.view },
            sc?.frame() ?? null,
            box,
            sc?.planFloor()?.id ?? '',
          );
        }}
      />
    </Dialog>
  );
}
