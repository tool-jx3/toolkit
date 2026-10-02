/**
 * Discord 通話立繪產生器（規格 docs/refactor/specs/obs-tachie.md）。
 * 三個步驟：① 使用者 ② 立繪與效果（預設集）③ 組合與輸出（CSS）。左欄是目前步驟的設定，右欄是預覽。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSaveStatus, useUndoRedo } from '@/core/storage';
import { getTool } from '@/registry';
import {
  IconButton,
  Notice,
  ProjectMenu,
  type Shortcut,
  StepNav,
  Stepper,
  ToolShell,
  UsageSection,
  withShortcut,
} from '@/ui';
import { buildTachieCss } from './css';
import { type ImageInputState, INITIAL_INPUT } from './ImageSection';
import { createPreset, normalizeData, type TachieData } from './model';
import { PreviewNotes, TachiePreview } from './Preview';
import { StepLook, useEditingPreset } from './StepLook';
import { OutputPanel, StepOutput } from './StepOutput';
import { StepUsers } from './StepUsers';
import { importImages, loadImages, referencedImages, TOOL_ID, useImages, useTachie } from './store';
import { S } from './strings';
import { usePresetPreview } from './useCss';

interface ProjectData {
  data: TachieData;
  /** 圖片鍵 → data URI 或網址（專案檔把圖片一起存進去，裁定） */
  images: Record<string, string>;
}

const USAGE = (
  <ul>
    {S.usage.map((line) => (
      <li key={line}>{line}</li>
    ))}
  </ul>
);

function Overview() {
  const data = useTachie((s) => s.data);
  return (
    <section
      aria-label={S.preview.overview}
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 text-sm"
      data-testid="overview"
    >
      <h2 className="m-0 text-base font-semibold text-fg">{S.preview.overview}</h2>
      <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-fg">
        {S.preview.overviewSteps.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
      <p className="m-0 text-muted" data-testid="overview-counts">
        {S.preview.counts(data.users.length, data.presets.length, data.saved.length)}
      </p>
    </section>
  );
}

function LookPreview() {
  const preset = useEditingPreset();
  const pv = usePresetPreview(preset);
  if (!preset || !pv)
    return (
      <p
        className="m-0 rounded-lg border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted"
        data-testid="look-preview-empty"
      >
        {S.preview.noPreset}
      </p>
    );
  return (
    <>
      <TachiePreview
        css={pv.css}
        userId={pv.userId}
        userName={pv.userName}
        hideAway={preset.hideAway}
        testId="look-preview"
      />
      {pv.provisional ? (
        <Notice tone="info" className="text-xs">
          {S.preview.provisionalNote}
        </Notice>
      ) : null}
      <PreviewNotes />
    </>
  );
}

export function App() {
  const [step, setStep] = useState(0);
  const [input, setInput] = useState<ImageInputState>(INITIAL_INPUT);
  const savedAt = useSaveStatus(TOOL_ID);
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useTachie);

  useEffect(() => {
    void loadImages();
    /* 測試與對等驗證用：用任意設定產生 CSS、讀目前的資料 */
    (window as unknown as { __obsTachie?: unknown }).__obsTachie = {
      buildTachieCss,
      createPreset,
      data: () => useTachie.getState().data,
      images: () => useImages.getState(),
    };
  }, []);

  const shortcuts: Shortcut[] = [
    { keys: 'mod+z', label: S.undoShort, group: S.editGroup, handler: undo },
    { keys: ['shift+mod+z', 'mod+y'], label: S.redoShort, group: S.editGroup, handler: redo },
  ];

  const go = (i: number) => {
    setStep(Math.max(0, Math.min(2, i)));
    window.scrollTo?.({ top: 0 });
  };

  return (
    <ToolShell
      toolId={TOOL_ID}
      shortcuts={shortcuts}
      usage={USAGE}
      headerActions={
        <>
          <IconButton
            label={withShortcut(S.undo, 'mod+z')}
            icon={<Undo2 />}
            onClick={undo}
            disabled={!canUndo}
          />
          <IconButton
            label={withShortcut(S.redo, 'shift+mod+z')}
            icon={<Redo2 />}
            onClick={redo}
            disabled={!canRedo}
          />
          <ProjectMenu<ProjectData>
            toolId={TOOL_ID}
            fileName={S.projectFileName}
            savedAt={savedAt}
            getData={() => {
              const data = useTachie.getState().data;
              const map = useImages.getState().map;
              const images: Record<string, string> = {};
              for (const key of referencedImages(data)) if (map[key]) images[key] = map[key];
              return { data, images };
            }}
            onLoad={(project) => {
              if (!project || typeof project !== 'object' || !('data' in project)) return false;
              const images: Record<string, string> = {};
              const raw = (project as Partial<ProjectData>).images;
              if (raw && typeof raw === 'object')
                for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') images[k] = v;
              const data = normalizeData(project.data);
              void importImages(images);
              useTachie.getState().replace(data);
              return true;
            }}
            onReset={() => useTachie.getState().reset()}
          />
        </>
      }
      settings={
        <>
          <UsageSection persistKey="obs-tachie">{USAGE}</UsageSection>
          <p className="m-0 px-1 text-sm text-muted" data-testid="intro">
            {getTool(TOOL_ID)?.summary}
          </p>
          <Stepper aria-label={S.stepsLabel} steps={S.steps} value={step} onValueChange={go} />
          {step === 0 ? <StepUsers /> : null}
          {step === 1 ? (
            <StepLook input={input} onInputChange={(p) => setInput((cur) => ({ ...cur, ...p }))} />
          ) : null}
          {step === 2 ? <StepOutput /> : null}
          <StepNav value={step} count={3} onValueChange={go} />
        </>
      }
      preview={step === 0 ? <Overview /> : step === 1 ? <LookPreview /> : <OutputPanel />}
    />
  );
}
