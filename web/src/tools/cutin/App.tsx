/**
 * 切入素材產生器：開頁先顯示範本一覽（網址帶分享設定時直接進編輯畫面）；
 * 編輯畫面左邊是文字與三個設定分頁，右邊是預覽、匯出按鈕與檢查清單。
 */
import { ArrowLeft, Clapperboard, Palette, Redo2, SlidersHorizontal, Undo2 } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode, useEffect } from 'react';
import { clearShareHash } from '@/core/share';
import { resetToolStore, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  AdvancedToggle,
  Button,
  IconButton,
  ProjectMenu,
  type Shortcut,
  Tabs,
  ToolShell,
} from '@/ui';
import { openFromHash, restoreLook } from './actions';
import { TargetPicker, TargetSummary } from './controls';
import { ExportArea } from './ExportArea';
import { failNextExport } from './exporter';
import { Gallery } from './Gallery';
import { isModified, switchTarget, TOOL_ID } from './model';
import { crashPreview, Preview, previewState } from './Preview';
import { ExportSettingsPanel, LookPanel, MotionPanel, TextField } from './panels';
import { normalizeSettings } from './settings';
import { setSettings, usePrefs, useSettings, useUi } from './store';
import { S, USAGE_LINES } from './strings';
import { templateOf } from './templates';

declare global {
  interface Window {
    __cutin?: unknown;
  }
}

function Usage() {
  return (
    <ol>
      {USAGE_LINES.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ol>
  );
}

/** 編輯畫面頂端：目前範本（已修改）、恢復範本外觀、回到範本一覽 */
function TemplateBar() {
  const s = useSettings((st) => st.data);
  const t = templateOf(s.templateId);
  const modified = isModified(s);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <p className="m-0 min-w-0 flex-1 text-sm" data-testid="template-name">
        <span className="text-muted">{S.templateNow}：</span>
        <span className="font-semibold text-fg">{t ? t.name : S.custom}</span>
        {modified ? (
          <span className="ml-1.5 rounded-sm bg-warning-soft px-1.5 py-0.5 text-xs text-warning">
            {S.modified}
          </span>
        ) : null}
      </p>
      {modified ? (
        <button
          type="button"
          className="text-sm text-accent underline underline-offset-2 hover:text-accent-hover"
          title={S.restoreLookHint}
          onClick={restoreLook}
        >
          {S.restoreLook}
        </button>
      ) : null}
      <Button size="sm" icon={<ArrowLeft />} onClick={() => useUi.setState({ screen: 'gallery' })}>
        {S.backToGallery}
      </Button>
    </div>
  );
}

function EditorSettings() {
  const target = useSettings((st) => st.data.target);
  return (
    <>
      <TemplateBar />
      <div className="flex flex-col gap-1.5">
        <TargetPicker value={target} onChange={(v) => setSettings((s) => switchTarget(s, v))} />
        <TargetSummary target={target} />
      </div>
      <TextField />
      <AdvancedToggle toolId={TOOL_ID} label={S.advancedToggle} />
      <Tabs
        aria-label={S.tabsLabel}
        items={[
          { value: 'look', label: S.tabs.look, icon: <Palette />, content: <LookPanel /> },
          {
            value: 'motion',
            label: S.tabs.motion,
            icon: <Clapperboard />,
            content: <MotionPanel />,
          },
          {
            value: 'export',
            label: S.tabs.export,
            icon: <SlidersHorizontal />,
            content: <ExportSettingsPanel />,
          },
        ]}
      />
    </>
  );
}

/** 錯誤畫面（F64）：整頁換掉；「從頭來過」清掉網址的分享設定與存檔並重新載入 */
function CrashScreen({ error }: { error: Error }) {
  return (
    <main
      className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-3 bg-bg p-6 text-fg"
      data-testid="crash-screen"
      role="alert"
    >
      <h1 className="m-0 text-xl font-semibold">{S.crashTitle}</h1>
      <p className="m-0 text-sm">{S.crashLead}</p>
      <ul className="m-0 list-disc pl-5 text-sm">
        {S.crashCauses.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <p className="m-0 text-sm text-muted">{S.crashMessage}</p>
      <pre className="m-0 overflow-auto rounded-md bg-surface-2 p-3 text-xs whitespace-pre-wrap">
        {error.message || String(error)}
      </pre>
      <Button
        variant="primary"
        className="self-start"
        onClick={() => {
          clearShareHash();
          resetToolStore(useSettings);
          usePrefs.getState().patch({ started: false });
          location.reload();
        }}
      >
        {S.crashRestart}
      </Button>
    </main>
  );
}

class Boundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }
  override componentDidCatch(error: unknown, info: ErrorInfo) {
    console.warn('切入素材產生器：', error, info.componentStack);
  }
  override render() {
    return this.state.error ? <CrashScreen error={this.state.error} /> : this.props.children;
  }
}

function Tool() {
  const screen = useUi((u) => u.screen);
  const fatal = useUi((u) => u.fatal);
  const { undo, redo, canUndo, canRedo, clear } = useUndoRedo(useSettings);
  const savedAt = useSaveStatus(TOOL_ID);

  /* 測試與除錯用 */
  useEffect(() => {
    window.__cutin = {
      settings: () => useSettings.getState().data,
      set: (patch: object) => setSettings((s) => ({ ...s, ...patch })),
      ui: () => useUi.getState(),
      preview: () => ({ ...previewState }),
      failNextExport,
      crash: (message = '測試用的錯誤') => crashPreview(message),
    };
  }, []);

  if (fatal) return <CrashScreen error={fatal} />;

  const shortcuts: Shortcut[] = [
    { keys: 'mod+z', label: S.undo, group: '編輯', handler: undo },
    { keys: ['mod+y', 'shift+mod+z'], label: S.redo, group: '編輯', handler: redo },
  ];
  const headerActions = (
    <>
      <IconButton
        label={`${S.undo}（Ctrl＋Z）`}
        icon={<Undo2 />}
        onClick={undo}
        disabled={!canUndo}
      />
      <IconButton
        label={`${S.redo}（Ctrl＋Y）`}
        icon={<Redo2 />}
        onClick={redo}
        disabled={!canRedo}
      />
      <ProjectMenu
        toolId={TOOL_ID}
        getData={() => useSettings.getState().data}
        onLoad={(data) => {
          useSettings.getState().replace(normalizeSettings(data));
          clear();
          usePrefs.getState().patch({ started: true });
          useUi.setState({ screen: 'editor', lastBytes: null, notice: null });
        }}
        onReset={() => {
          resetToolStore(useSettings);
          usePrefs.getState().patch({ started: false });
          useUi.setState({ screen: 'gallery', lastBytes: null, notice: null });
        }}
        resetConfirm={{
          title: S.resetTitle,
          description: S.resetDescription,
          confirmLabel: S.resetConfirm,
        }}
        resetLabel={S.resetMenu}
        savedAt={savedAt}
      />
    </>
  );
  const usage = <Usage />;
  if (screen === 'gallery')
    return (
      <ToolShell
        toolId={TOOL_ID}
        shortcuts={shortcuts}
        usage={usage}
        headerActions={headerActions}
        body={<Gallery />}
      />
    );
  return (
    <ToolShell
      toolId={TOOL_ID}
      shortcuts={shortcuts}
      usage={usage}
      headerActions={headerActions}
      settings={<EditorSettings />}
      preview={
        <>
          <Preview />
          <ExportArea />
        </>
      }
    />
  );
}

/* 開頁：網址帶有效的分享設定時直接進編輯畫面（F62） */
if (typeof location !== 'undefined') openFromHash(location.hash);

export function App() {
  return (
    <Boundary>
      <Tool />
    </Boundary>
  );
}
