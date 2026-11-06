/**
 * 先攻與戰鬥追蹤：系統通用的先攻順序、輪數、HP（臨時 HP 先扣）、狀態與持續回合；5e 的死亡豁免與 SRD 5.2.1 的狀態可以關掉。
 * 玩家視圖另開視窗（`#player`，`@/core/mirror`）；5e 速查計算送來的參戰者用 `@/core/combat`。
 *
 * 版面：≥ 1024 px 兩欄（清單｜加入、傷害與治療、選項；右欄固定在畫面上）；更窄時由上而下（清單在上）。
 * 規格：docs/refactor/specs/combat-tracker.md。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { downloadText } from '@/core/files';
import { createMirrorHost } from '@/core/mirror';
import { resetToolStore, serializeProject, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  ProjectMenu,
  type Shortcut,
  type ToastOptions,
  ToolShell,
  UsageSection,
  useToast,
  withShortcut,
} from '@/ui';
import { goNext, goPrev } from './actions';
import { CombatList } from './CombatList';
import { ConditionDialog } from './ConditionDialog';
import { HandoffReceiver } from './handoff';
import {
  type CombatData,
  DATA_VERSION,
  type PlayerSnapshot,
  playerSnapshot,
  sanitizeData,
  TOOL_ID,
} from './model';
import { AddPanel, DataPanel, HpPanel, OptionsPanel } from './Panels';
import { pruneSelected, startTabSync, useCombat, useUi } from './store';
import { S } from './strings';
import { TurnBar } from './TurnBar';

function Usage() {
  return (
    <>
      <p>{S.usage.intro}</p>
      <ol>
        {S.usage.steps.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
    </>
  );
}

const fileName = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${S.project.fileName}_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.json`;
};

/** 快捷鍵在 ToolShell 的通知範圍外綁定：由頁面裡的元件把 toast 交出來 */
const toastRef: { current: ((o: ToastOptions) => void) | null } = { current: null };
function ToastBridge() {
  toastRef.current = useToast();
  return null;
}

function saveProjectNow() {
  try {
    const name = fileName();
    downloadText(
      serializeProject(TOOL_ID, DATA_VERSION, useCombat.getState().data),
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

/** 玩家視圖：內容一變就送（GM 的備註、AC、隱藏的參戰者不送） */
function usePlayerMirror() {
  useEffect(() => {
    const host = createMirrorHost<PlayerSnapshot>(TOOL_ID);
    let last = '';
    const send = (d: CombatData) => {
      const snap = playerSnapshot(d);
      const key = JSON.stringify(snap);
      if (key === last) return;
      last = key;
      host.publish(snap);
    };
    send(useCombat.getState().data);
    const off = useCombat.subscribe((s) => send(s.data));
    return () => {
      off();
      host.close();
    };
  }, []);
}

export function App() {
  const savedAt = useSaveStatus(TOOL_ID);
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useCombat);
  usePlayerMirror();
  useEffect(() => startTabSync(), []);
  /* 刪掉的參戰者從勾選拿掉 */
  useEffect(
    () =>
      useCombat.subscribe((s, prev) => {
        if (s.data.list !== prev.data.list) pruneSelected(s.data.list.map((c) => c.id));
      }),
    [],
  );

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      {
        keys: 'n',
        label: S.keys.next,
        group: S.keys.turn,
        handler: () => goNext(toastRef.current ?? undefined),
      },
      { keys: 'shift+n', label: S.keys.prev, group: S.keys.turn, handler: goPrev },
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
      <ProjectMenu<CombatData>
        toolId={TOOL_ID}
        version={DATA_VERSION}
        getData={() => useCombat.getState().data}
        saveFileName={fileName}
        onLoad={(raw) => {
          const d = sanitizeData(raw);
          if (!d) return false;
          useCombat.getState().replace(d);
          useUi.setState({ selected: [], condFor: null });
          return true;
        }}
        onReset={() => {
          resetToolStore(useCombat, { clearHistory: false });
          useUi.setState({ selected: [], condFor: null });
        }}
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
          <HandoffReceiver />
          <UsageSection persistKey={TOOL_ID}>
            <Usage />
          </UsageSection>
          <div className="grid min-w-0 grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)]">
            <div className="flex min-w-0 flex-col gap-3">
              <TurnBar />
              <CombatList />
            </div>
            <div className="flex min-w-0 flex-col gap-3 lg:sticky-pane">
              <AddPanel />
              <HpPanel />
              <OptionsPanel />
              <DataPanel />
            </div>
          </div>
          <ConditionDialog />
        </>
      }
    />
  );
}
