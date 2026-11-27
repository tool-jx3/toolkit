/**
 * 立繪切入產生器：左邊（窄畫面在下面）是演員與樣式兩個分頁；右邊是預覽、型、匯出。
 * 頁首：復原、重做、專案檔。快捷鍵：Ctrl＋Z／Y（復原、重做）、空白鍵（播放／暫停）、Home（回到開頭）。
 */
import { Palette, Redo2, Undo2, UsersRound } from 'lucide-react';
import { useEffect } from 'react';
import { hasIndexedDb, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  ProjectMenu,
  playbackShortcuts,
  type Shortcut,
  Tabs,
  ToolShell,
  usePlayback,
  withShortcut,
} from '@/ui';
import { loadProject, projectFiles, resetAll } from './actions';
import { ActorSection, CastSection } from './CastPanel';
import { ExportSection } from './ExportArea';
import { DOC_VERSION, TOOL_ID } from './model';
import { BEAT } from './motion';
import { PreviewPane } from './Preview';
import {
  ColorSection,
  FontSection,
  ImpactSection,
  KindSection,
  MotionSection,
  RivalSection,
} from './StylePanel';
import { hydrate, say, useDoc } from './store';
import { S } from './strings';

const USAGE = (
  <ul>
    {S.usage.map((line) => (
      <li key={line}>{line}</li>
    ))}
  </ul>
);

const stamp = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
};

function HeaderActions() {
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useDoc);
  const savedAt = useSaveStatus(TOOL_ID);
  return (
    <>
      <IconButton
        label={withShortcut(S.undo, 'mod+z')}
        icon={<Undo2 />}
        disabled={!canUndo}
        onClick={() => undo()}
      />
      <IconButton
        label={withShortcut(S.redo, 'mod+y')}
        icon={<Redo2 />}
        disabled={!canRedo}
        onClick={() => redo()}
      />
      <ProjectMenu
        toolId={TOOL_ID}
        version={DOC_VERSION}
        getData={() => useDoc.getState().data}
        getFiles={projectFiles}
        openAccept=".zip,.json,application/zip,application/json"
        fileNameFor={() => `char-cutin-${stamp()}`}
        savedAt={savedAt}
        confirmOpen={false}
        onLoad={async (data, project, files) => {
          const r = await loadProject(data, project.version, files);
          return { warnings: [r.notPersisted > 0 && S.projectNotSaved] };
        }}
        onReset={resetAll}
        resetText={{
          label: S.resetLabel,
          title: S.resetTitle,
          description: S.resetDescription,
          confirmLabel: S.resetConfirm,
        }}
      />
    </>
  );
}

export function App() {
  const pace = useDoc((s) => s.data.styles[s.data.kind].pace);
  const playback = usePlayback({ duration: BEAT.cycle, loop: true, rate: pace });
  const { undo, redo } = useUndoRedo(useDoc);

  useEffect(() => {
    void hydrate();
    if (!hasIndexedDb()) say('castStatus', S.noIndexedDb, 'warning');
  }, []);

  const shortcuts: Shortcut[] = [
    { keys: 'mod+z', label: S.undo, group: S.editGroup, handler: () => undo() },
    { keys: ['mod+y', 'shift+mod+z'], label: S.redo, group: S.editGroup, handler: () => redo() },
    ...playbackShortcuts({
      toggle: playback.toggle,
      rewind: () => {
        playback.onPlayingChange(false);
        playback.onTimeChange(0);
      },
      group: S.playGroup,
    }),
  ];

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={USAGE}
      shortcuts={shortcuts}
      headerActions={<HeaderActions />}
      settings={
        <Tabs
          aria-label={S.settingsTabs}
          items={[
            {
              value: 'cast',
              label: S.castTitle,
              icon: <UsersRound />,
              content: (
                <div className="flex flex-col gap-3">
                  <CastSection />
                  <ActorSection />
                </div>
              ),
            },
            {
              value: 'style',
              label: S.styleTab,
              icon: <Palette />,
              content: (
                <div className="flex flex-col gap-3">
                  <RivalSection />
                  <ImpactSection />
                  <FontSection />
                  <ColorSection />
                  <MotionSection />
                </div>
              ),
            },
          ]}
        />
      }
      preview={
        <div className="flex flex-col gap-3">
          <PreviewPane playback={playback} />
          <KindSection />
          <ExportSection />
        </div>
      }
    />
  );
}
