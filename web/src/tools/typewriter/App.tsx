import { Keyboard, ListVideo, Mic2, Redo2, Undo2, Zap } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';
import { resetToolStore, useSaveStatus, useUndoRedo } from '@/core/storage';
import { frameStartTimes } from '@/core/timeline';
import {
  type ExportPanelHandle,
  IconButton,
  ProjectMenu,
  type Shortcut,
  Tabs,
  ToolShell,
  UsageSection,
} from '@/ui';
import { type PlayHandle, Preview, sourceFor } from './Preview';
import { CreditsPanel, GlitchPanel, KaraokePanel, TypingPanel } from './panels';
import { MODES, type Mode, normalizeData, type TwData } from './settings';
import { currentMode, patchMode, setMode, TOOL_ID, useTw, useView } from './store';
import { S } from './strings';
import {
  glitchPattern,
  karaokeShowPlan,
  lineProgress,
  typingScreenAlphas,
  typingScreenText,
} from './timeline';

const USAGE = (
  <>
    <ol>
      {S.usage.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ol>
    {S.about.map((line) => (
      <p key={line}>{line}</p>
    ))}
  </>
);

/** 測試與對等驗證用：讀出目前模式的逐格資料（欄位名稱同規格附件） */
function describeFrames(mode: Mode) {
  const src = sourceFor(mode, useTw.getState().data[mode]);
  const d = src.debug;
  const ms = src.frames.map((f) => f.ms);
  if (d.mode === 'typing')
    return d.timeline.frames.map((f, i) => ({
      畫面文字: typingScreenText(d.timeline, i),
      延遲毫秒: ms[i],
      各字透明度: typingScreenAlphas(d.timeline, i),
      整體透明度: f.alpha,
      旋轉度: f.rotation,
      停留格: f.hold,
    }));
  if (d.mode === 'glitch')
    return d.timeline.frames.map((f, i) => ({
      畫面文字: glitchPattern(d.timeline, i),
      延遲毫秒: ms[i],
      停留格: f.hold,
    }));
  if (d.mode === 'credits') return d.tops.map((y, i) => ({ 第一行上緣y: y, 延遲毫秒: ms[i] }));
  return d.times.map((t, i) => ({
    秒: t,
    延遲毫秒: ms[i],
    各行可見度: d.plan.alphaAt(t),
    各行進度: d.schedule.lines.map((l) => (l.sung ? lineProgress(l, t) : 0)),
  }));
}

declare global {
  interface Window {
    __typewriter?: unknown;
  }
}

export function App() {
  const mode = useView((st) => st.data.mode);
  const savedAt = useSaveStatus(TOOL_ID);
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useTw);
  const playRef = useRef<PlayHandle>(null);
  const exportRef = useRef<ExportPanelHandle>(null);

  useEffect(() => {
    window.__typewriter = {
      data: () => useTw.getState().data,
      mode: currentMode,
      setMode,
      patch: (m: Mode, p: Record<string, unknown>) => patchMode(m, p as Partial<TwData[Mode]>),
      frames: (m?: Mode) => describeFrames(m ?? currentMode()),
      karaoke: () => {
        const src = sourceFor('karaoke', useTw.getState().data.karaoke);
        const d = src.debug;
        if (d.mode !== 'karaoke') return null;
        return {
          結束秒數: d.schedule.end,
          格數: src.frames.length,
          各行: d.schedule.lines.map((l) => ({
            顯示文字: l.text,
            會唱: l.sung,
            開始秒數: l.start,
            長度秒數: l.length,
          })),
          實際淡化秒數: d.plan.fade,
          各行所在行: d.plan.rowOf,
          visibilityAt: (t: number) => d.plan.alphaAt(t),
          planFor: (show: 'all' | 'reveal' | 'current' | 'rotate' | 'page', n: number, f: number) =>
            karaokeShowPlan(d.schedule, show, n, f).alphaAt,
        };
      },
      seek: (t: number) => playRef.current?.seek(t),
      seekFrame: (i: number) => {
        const src = playRef.current?.source;
        if (!src) return;
        playRef.current?.seek((frameStartTimes(src.frames)[i] ?? 0) + 1e-6);
      },
      setPlaying: (on: boolean) => playRef.current?.setPlaying(on),
      get t() {
        return playRef.current?.t ?? 0;
      },
      get frame() {
        return playRef.current?.frame ?? -1;
      },
      get playing() {
        return playRef.current?.playing ?? false;
      },
      exportNow: (format?: string) => exportRef.current?.exportNow(format),
    };
  }, []);

  const shortcuts: Shortcut[] = [
    { keys: 'mod+z', label: '復原', group: '編輯', handler: undo },
    { keys: ['shift+mod+z', 'mod+y'], label: '重做', group: '編輯', handler: redo },
  ];

  const icons: Record<Mode, ReactNode> = {
    typing: <Keyboard />,
    glitch: <Zap />,
    credits: <ListVideo />,
    karaoke: <Mic2 />,
  };
  const panels: Record<Mode, ReactNode> = {
    typing: <TypingPanel />,
    glitch: <GlitchPanel />,
    credits: <CreditsPanel />,
    karaoke: <KaraokePanel />,
  };

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={USAGE}
      shortcuts={shortcuts}
      headerActions={
        <>
          <IconButton label="復原（Ctrl＋Z）" icon={<Undo2 />} onClick={undo} disabled={!canUndo} />
          <IconButton
            label="重做（Ctrl＋Shift＋Z）"
            icon={<Redo2 />}
            onClick={redo}
            disabled={!canRedo}
          />
          <ProjectMenu<TwData>
            toolId={TOOL_ID}
            getData={() => useTw.getState().data}
            onLoad={(d) => {
              const next = normalizeData(d);
              if (!next) return false;
              useTw.getState().replace(next);
              return true;
            }}
            onReset={() => resetToolStore(useTw)}
            savedAt={savedAt}
            fileName={S.project.fileName}
          />
        </>
      }
      settings={
        <>
          <UsageSection persistKey="typewriter">{USAGE}</UsageSection>
          <Tabs<Mode>
            aria-label={S.modesAria}
            value={mode}
            onValueChange={setMode}
            items={MODES.map((m) => ({
              value: m,
              label: S.modes[m],
              icon: icons[m],
              content: panels[m],
            }))}
          />
        </>
      }
      preview={<Preview playRef={playRef} exportRef={exportRef} />}
    />
  );
}
