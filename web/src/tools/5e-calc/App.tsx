/**
 * 5e 速查計算：遭遇預算（SRD 5.2.1 的 XP 預算＋簡易遭遇基準）、快速怪物數值（LGMRD）、能力值點數購買（SRD 5.2.1／5.1）。
 * 遭遇與快速怪物可以一鍵送到先攻與戰鬥追蹤（`@/core/combat`）。規格：docs/refactor/specs/5e-calc.md。
 */
import { Info, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { downloadText } from '@/core/files';
import { resetToolStore, serializeProject, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  Button,
  IconButton,
  ProjectMenu,
  type Shortcut,
  Tabs,
  type ToastOptions,
  ToolShell,
  UsageSection,
  useToast,
  withShortcut,
} from '@/ui';
import { AboutDialog } from './AboutDialog';
import { EncounterTab } from './EncounterTab';
import { MonsterTab, readCrFromUrl } from './MonsterTab';
import { type CalcData, DATA_VERSION, sanitizeData, type Tab, TOOL_ID } from './model';
import { PointBuyTab } from './PointBuyTab';
import { useCalc, usePrefs } from './store';
import { S } from './strings';

function Usage() {
  return (
    <>
      <p>{S.usage.intro}</p>
      <ul>
        {S.usage.steps.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </>
  );
}

const fileName = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${S.project.fileName}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
};

const toastRef: { current: ((o: ToastOptions) => void) | null } = { current: null };
function ToastBridge() {
  toastRef.current = useToast();
  return null;
}

function saveProjectNow() {
  try {
    const name = fileName();
    downloadText(
      serializeProject(TOOL_ID, DATA_VERSION, useCalc.getState().data),
      name,
      'application/json',
    );
    toastRef.current?.({ title: S.toast.saved, description: name, tone: 'success' });
  } catch (e) {
    toastRef.current?.({
      title: S.toast.saveFailed,
      description: e instanceof Error ? e.message : String(e),
      tone: 'danger',
    });
  }
}

/* 網址帶 ?cr= 時（原作的做法）：打開快速怪物數值的那一級（不列入復原） */
let urlRead = false;
function applyUrlCr() {
  if (urlRead) return;
  urlRead = true;
  const cr = readCrFromUrl();
  if (!cr) return;
  const t = useCalc.temporal.getState();
  t.pause();
  useCalc.getState().update((d) => {
    d.quick.cr = cr;
  });
  t.resume();
  usePrefs.getState().patch({ tab: 'monster' });
}

export function App() {
  const tab = usePrefs((p) => p.data.tab);
  const savedAt = useSaveStatus(TOOL_ID);
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useCalc);
  const [about, setAbout] = useState(false);
  useEffect(applyUrlCr, []);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { keys: 'mod+z', label: S.undo, group: S.keys.edit, handler: undo },
      { keys: ['shift+mod+z', 'mod+y'], label: S.redo, group: S.keys.edit, handler: redo },
      {
        keys: 'mod+s',
        label: S.keys.save,
        group: S.keys.file,
        handler: saveProjectNow,
        allowInInput: true,
      },
    ],
    [undo, redo],
  );

  const headerActions = (
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
      <ProjectMenu<CalcData>
        toolId={TOOL_ID}
        version={DATA_VERSION}
        getData={() => useCalc.getState().data}
        saveFileName={fileName}
        onLoad={(raw) => {
          const d = sanitizeData(raw);
          if (!d) return false;
          useCalc.getState().replace(d);
          return true;
        }}
        onReset={() => resetToolStore(useCalc, { clearHistory: false })}
        savedAt={savedAt}
        resetText={{
          label: S.project.resetLabel,
          title: S.project.resetTitle,
          description: S.project.resetDescription,
        }}
      />
    </>
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={shortcuts}
      headerActions={headerActions}
      body={
        <>
          <ToastBridge />
          <UsageSection persistKey={TOOL_ID}>
            <Usage />
          </UsageSection>
          <div className="flex justify-end">
            <Button size="sm" variant="ghost" icon={<Info />} onClick={() => setAbout(true)}>
              {S.about.button}
            </Button>
          </div>
          <Tabs<Tab>
            aria-label={S.tabsLabel}
            value={tab}
            onValueChange={(v) => usePrefs.getState().patch({ tab: v })}
            items={[
              { value: 'encounter', label: S.tabs.encounter, content: <EncounterTab /> },
              { value: 'monster', label: S.tabs.monster, content: <MonsterTab /> },
              { value: 'buy', label: S.tabs.buy, content: <PointBuyTab /> },
            ]}
          />
          <AboutDialog open={about} onOpenChange={setAbout} />
        </>
      }
    />
  );
}
