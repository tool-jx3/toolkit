/**
 * 劇本排版台：左邊逐段書寫、右邊即時排成 A4 書頁。規格：docs/refactor/specs/scenario-editor.md。
 *
 * 版面（ToolShell 的 body 自己排）：上方工具列；寬畫面三欄〔書寫・頁面・文件｜（頁面一覽）｜紙面｜設定欄〕、
 * 中等寬度兩欄（設定欄放在左欄下方）、窄畫面上下排列；最下面是狀態列。
 */
import {
  BookOpen,
  FileDown,
  FolderOpen,
  LayoutList,
  PanelRight,
  Printer,
  Redo2,
  Save,
  Undo2,
} from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useUndoRedo } from '@/core/storage';
import { Button, cn, IconButton, Tabs, ToolShell, withShortcut } from '@/ui';
import { CcfDialogs } from './dialogs/CcfDialogs';
import { FlowDialog } from './dialogs/FlowDialog';
import { LibraryDialog } from './dialogs/LibraryDialog';
import { BridgeBinder, OutputDialog, PreviewDialog, PromptDialog } from './dialogs/Misc';
import { NpcDialog } from './dialogs/NpcDialog';
import { PopupDialog } from './dialogs/PopupDialog';
import { TableDialog } from './dialogs/TableDialog';
import { onCopy, onPaste, onWindowKey, shortcutList } from './keys';
import { Overview } from './Overview';
import { Paper } from './Paper';
import { BlockPanel } from './panel/BlockPanel';
import { DocTab } from './panel/DocTab';
import { PagesTab } from './panel/PagesTab';
import { SourcePane } from './SourcePane';
import { openFile, retrySave, saveFile, startSession, useSession } from './session';
import { setUi, useDoc, usePrefs, useUi } from './store';
import { S } from './strings';
import { BlockOps, TypeButtons } from './TypeButtons';
import { trackFields } from './textOps';
import { Usage } from './Usage';

let started: Promise<boolean> | null = null;

function useStartup() {
  useEffect(() => {
    trackFields();
    if (!started) started = startSession();
    void started.then((showList) => {
      if (showList) setUi({ libraryOpen: true });
    });
    window.addEventListener('keydown', onWindowKey);
    document.addEventListener('copy', onCopy);
    document.addEventListener('paste', onPaste);
    return () => {
      window.removeEventListener('keydown', onWindowKey);
      document.removeEventListener('copy', onCopy);
      document.removeEventListener('paste', onPaste);
    };
  }, []);
}

function Toolbar() {
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useDoc);
  const prefs = usePrefs((s) => s.data);
  const patch = usePrefs((s) => s.patch);
  return (
    <div className="flex flex-wrap items-center gap-1" role="toolbar" aria-label="工具列">
      <Button size="sm" icon={<BookOpen />} onClick={() => setUi({ libraryOpen: true })}>
        {S.toolbar.library}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        icon={<Save />}
        title={withShortcut('存成檔案', 'mod+s')}
        onClick={saveFile}
      >
        {S.toolbar.save}
      </Button>
      <Button size="sm" variant="secondary" icon={<FolderOpen />} onClick={() => void openFile()}>
        {S.toolbar.open}
      </Button>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <IconButton
        size="sm"
        variant="ghost"
        label={withShortcut(S.toolbar.undo, 'mod+z')}
        icon={<Undo2 />}
        disabled={!canUndo}
        onClick={undo}
      />
      <IconButton
        size="sm"
        variant="ghost"
        label={withShortcut(S.toolbar.redo, 'mod+y')}
        icon={<Redo2 />}
        disabled={!canRedo}
        onClick={redo}
      />
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <Button
        size="sm"
        variant="secondary"
        icon={<Printer />}
        onClick={() => setUi({ output: 'print' })}
      >
        {S.toolbar.print}
      </Button>
      <Button
        size="sm"
        variant="secondary"
        icon={<FileDown />}
        onClick={() => setUi({ output: 'export' })}
      >
        {S.toolbar.exportHtml}
      </Button>
      <span className="mx-1 h-5 w-px bg-border" aria-hidden />
      <Button
        size="sm"
        variant={prefs.overview ? 'primary' : 'ghost'}
        aria-pressed={prefs.overview}
        icon={<LayoutList />}
        title={withShortcut(S.toolbar.overview, 'mod+shift+p')}
        onClick={() => patch({ overview: !prefs.overview })}
      >
        {S.toolbar.overview}
      </Button>
      <Button
        size="sm"
        variant={prefs.sidePinned ? 'primary' : 'ghost'}
        aria-pressed={prefs.sidePinned}
        icon={<PanelRight />}
        title="沒有選取段落時也開著設定欄"
        onClick={() => patch({ sidePinned: !prefs.sidePinned })}
      >
        {S.toolbar.side}
      </Button>
    </div>
  );
}

function StatusBar() {
  const status = useUi((s) => s.status);
  const tone = status?.tone ?? 'info';
  return (
    <p
      role="status"
      aria-live="polite"
      data-testid="se-status"
      data-tone={tone}
      className={cn(
        'm-0 min-h-6 truncate rounded-md px-2 py-0.5 text-sm',
        tone === 'ok' && 'text-success',
        tone === 'warn' && 'text-warning',
        tone === 'err' && 'text-danger',
        tone === 'info' && 'text-muted',
      )}
    >
      {status?.text ?? ''}
    </p>
  );
}

function SaveErrorBar() {
  const error = useSession((s) => s.error);
  const tooBig = useSession((s) => s.tooBig);
  if (!error && !tooBig) return null;
  return (
    <div
      role="alert"
      className="flex items-center gap-2 rounded-md bg-danger-soft px-3 py-1.5 text-sm text-danger"
    >
      <span className="flex-1">{tooBig ? S.status.tooBig : S.status.saveFailed}</span>
      {error ? (
        <Button size="sm" variant="danger" onClick={retrySave}>
          {S.status.retry}
        </Button>
      ) : null}
    </div>
  );
}

function LeftColumn() {
  return (
    <Tabs
      aria-label="書寫與設定"
      items={[
        {
          value: 'source',
          label: S.panes.source,
          content: (
            <div className="flex h-full min-h-0 flex-col gap-1">
              <div className="flex flex-col gap-1 border-b border-border pb-1">
                <TypeButtons />
                <BlockOps />
              </div>
              <div className="min-h-0 flex-1">
                <SourcePane />
              </div>
            </div>
          ),
        },
        { value: 'pages', label: S.side.pages, content: <PagesTab /> },
        { value: 'doc', label: S.side.doc, content: <DocTab /> },
      ]}
    />
  );
}

export function App() {
  useStartup();
  const shortcuts = useMemo(shortcutList, []);
  const overview = usePrefs((s) => s.data.overview);
  const pinned = usePrefs((s) => s.data.sidePinned);
  const hasSel = useUi((s) => s.sel.length > 0);
  const showSide = hasSel || pinned;
  return (
    <ToolShell
      toolId="scenario-editor"
      shortcuts={shortcuts}
      usage={<Usage />}
      body={
        <div
          className="flex min-h-0 flex-col gap-2 lg:h-[calc(100dvh-8.5rem)] lg:min-h-[560px] lg:flex-none"
          data-testid="se-root"
        >
          <BridgeBinder />
          <Toolbar />
          <SaveErrorBar />
          <div
            className={cn(
              'grid min-h-0 flex-1 grid-cols-1 gap-2',
              'lg:grid-cols-[var(--se-cols-lg)] lg:grid-rows-[minmax(0,1fr)_auto]',
              'xl:grid-cols-[var(--se-cols-xl)] xl:grid-rows-1',
            )}
            style={
              {
                '--se-cols-lg': `340px ${overview ? '170px ' : ''}minmax(0,1fr)`,
                '--se-cols-xl': `360px ${overview ? '170px ' : ''}minmax(0,1fr)${showSide ? ' 330px' : ''}`,
              } as React.CSSProperties
            }
          >
            <section
              aria-label={S.panes.source}
              className="flex h-[70dvh] min-h-0 flex-col overflow-hidden rounded-lg border border-border bg-surface p-2 lg:h-auto [&>div]:flex [&>div]:min-h-0 [&>div]:flex-1 [&>div]:flex-col [&_[role=tabpanel]]:min-h-0 [&_[role=tabpanel]]:flex-1 [&_[role=tabpanel]]:overflow-auto"
            >
              <LeftColumn />
            </section>
            {overview ? (
              <section
                aria-label={S.panes.overview}
                className="h-[40dvh] min-h-0 overflow-hidden rounded-lg border border-border bg-surface lg:row-span-2 lg:h-auto xl:row-span-1"
              >
                <Overview />
              </section>
            ) : null}
            <section
              aria-label={S.panes.paper}
              className="h-[75dvh] min-h-0 overflow-hidden rounded-lg border border-border bg-surface lg:row-span-2 lg:h-auto xl:row-span-1"
            >
              <Paper />
            </section>
            {showSide ? (
              <section
                aria-label={S.panes.side}
                className="min-h-0 overflow-auto rounded-lg border border-border bg-surface p-2 lg:max-h-[45dvh] xl:max-h-none"
              >
                <BlockPanel />
              </section>
            ) : null}
          </div>
          <StatusBar />
          <LibraryDialog />
          <OutputDialog />
          <PreviewDialog />
          <PopupDialog />
          <FlowDialog />
          <TableDialog />
          <NpcDialog />
          <CcfDialogs />
          <PromptDialog />
        </div>
      }
    />
  );
}
