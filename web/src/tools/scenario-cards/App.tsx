/**
 * 劇本資訊卡片產生器：左邊放劇本全文（貼上或讀入 TXT、可搜尋），選取一段做成資訊卡片；
 * 右邊是卡片清單，可以複製成貼進 CCFOLIA 聊天欄的固定格式文字。專案存在瀏覽器裡或匯出成專案檔。
 * 規格：docs/refactor/specs/scenario-cards.md（第 7 節主控裁定優先）。
 *
 * 版面（用 ToolShell 的 body 自己排）：寬螢幕左右兩欄、各自捲動，佔滿視窗高；窄螢幕上下排列（內文在上）。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useRef } from 'react';
import { useSaveStatus, useUndoRedo } from '@/core/storage';
import { IconButton, ProjectMenu, type Shortcut, ToolShell, withShortcut } from '@/ui';
import { CardsPanel } from './CardsPanel';
import { CARD_TYPES, type CardType, cycleType, exportFileName, TYPE_INFO, typeText } from './logic';
import { SourcePanel } from './SourcePanel';
import {
  applyProject,
  currentProject,
  notify,
  PROJECT_VERSION,
  resetAll,
  setNewType,
  setSelectionType,
  TOOL_ID,
  usePrefs,
  useWorkspace,
} from './store';
import { S } from './strings';

/** Alt（Option）＋這些實體按鍵依序選第 1～12 種類型（F15；1～9、0、-，再加 = 給第 12 種） */
export const TYPE_KEY_CODES = [
  'digit1',
  'digit2',
  'digit3',
  'digit4',
  'digit5',
  'digit6',
  'digit7',
  'digit8',
  'digit9',
  'digit0',
  'minus',
  'equal',
] as const;

function Usage() {
  return (
    <>
      <p>{S.usageIntro}</p>
      <ol className="mt-2">
        {S.usageSteps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <p className="mt-2 font-semibold">{S.usageNotesTitle}</p>
      <ul>
        {S.usageNotes.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <p className="mt-2 text-muted">{S.disclaimer}</p>
    </>
  );
}

export function App() {
  const cardsPanel = useRef<HTMLElement>(null);
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useWorkspace);
  const savedAt = useSaveStatus(TOOL_ID);

  /** F15、F16：焦點在右欄（卡片區）時改「新增卡片」的類型，其他地方改「選取建卡」的類型 */
  const pickType = (pick: (current: CardType) => CardType) => {
    const active = document.activeElement;
    const target = active && cardsPanel.current?.contains(active) ? 'new' : 'selection';
    const prefs = usePrefs.getState().data;
    const type = pick(target === 'new' ? prefs.newType : prefs.selectionType);
    if (target === 'new') setNewType(type);
    else setSelectionType(type);
    notify(S.status.typeSelected(target, typeText(type)));
  };

  const shortcuts: Shortcut[] = [
    ...CARD_TYPES.map(
      (type, i): Shortcut => ({
        keys: `alt+code:${TYPE_KEY_CODES[i]}`,
        label: S.keyType(TYPE_INFO[type].marker, TYPE_INFO[type].label),
        group: S.keyGroupType,
        allowInInput: true,
        handler: () => pickType(() => type),
      }),
    ),
    {
      keys: 'alt+arrowdown',
      label: S.keyTypeNext,
      group: S.keyGroupType,
      allowInInput: true,
      handler: () => pickType((t) => cycleType(t, 1)),
    },
    {
      keys: 'alt+arrowup',
      label: S.keyTypePrev,
      group: S.keyGroupType,
      allowInInput: true,
      handler: () => pickType((t) => cycleType(t, -1)),
    },
    /* 以下由元件自己處理，只列在說明裡 */
    { keys: ['c', 'shift+c'], label: S.keyFromSelection, group: S.keyGroupEdit },
    { keys: 'mod+z', label: S.keyUndo, group: S.keyGroupEdit, handler: () => undo() },
    {
      keys: ['shift+mod+z', 'mod+y'],
      label: S.keyRedo,
      group: S.keyGroupEdit,
      handler: () => redo(),
    },
    { keys: 'enter', label: S.keySearchNext, group: S.keyGroupSearch },
    { keys: 'shift+enter', label: S.keySearchPrev, group: S.keyGroupSearch },
  ];

  const headerActions = (
    <>
      <IconButton
        label={withShortcut(S.undo, 'mod+z')}
        icon={<Undo2 />}
        disabled={!canUndo}
        onClick={() => undo()}
      />
      <IconButton
        label={withShortcut(S.redo, 'shift+mod+z')}
        icon={<Redo2 />}
        disabled={!canRedo}
        onClick={() => redo()}
      />
      <ProjectMenu
        toolId={TOOL_ID}
        version={PROJECT_VERSION}
        getData={currentProject}
        savedAt={savedAt}
        saveFileName={() => exportFileName(useWorkspace.getState().data.name)}
        onLoad={(data) => {
          if (!applyProject(data)) throw new Error(S.status.notProject);
        }}
        onReset={resetAll}
        /* 讀入後可以復原（第 7 節裁定：確認或可復原），所以不再另外確認 */
        confirmOpen={false}
        resetText={{
          label: S.resetLabel,
          title: S.resetTitle,
          description: S.resetDescription,
          confirmLabel: S.resetConfirm,
        }}
        onNotify={(n) => {
          if (n.kind === 'saved') notify(S.status.exported(n.fileName ?? ''), 'success');
          else if (n.kind === 'opened')
            notify(S.status.imported(n.fileName ?? ''), 'success', { undoable: true });
          else if (n.kind === 'open-failed')
            notify(S.status.importFailed(n.message ?? ''), 'danger');
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
          <div className="grid min-w-0 grid-cols-1 gap-3 lg:h-[calc(100dvh-6.5rem)] lg:min-h-[560px] lg:grid-cols-[minmax(0,3fr)_minmax(440px,2fr)] lg:gap-4">
            <SourcePanel />
            <CardsPanel ref={cardsPanel} />
          </div>
          <p className="m-0 px-1 text-xs text-muted" data-testid="disclaimer">
            {S.disclaimer}
          </p>
        </>
      }
    />
  );
}
