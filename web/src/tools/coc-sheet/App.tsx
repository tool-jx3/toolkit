/**
 * CoC 7 版調查員角色卡（舊版 trpg-lab 的「CoC 7 版自訂調查員角色卡」）：
 * 角色卡清單（新增、複製、重新命名、刪除、切換）→ 表單（基本資料、屬性與狀態、技能、戰鬥、背景與物品）→
 * A4 兩頁的角色卡預覽 → 列印／存成 PDF、匯出 PNG、複製 CCFOLIA 角色資料。
 * 寬畫面兩欄（左：清單＋表單；右：固定的預覽＋輸出），窄畫面由上而下：清單 → 預覽 → 輸出 → 表單。
 * 規格：docs/refactor/specs/coc-sheet.md。
 */
import { Copy, Plus, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { create } from 'zustand';
import { importAssetFiles } from '@/core/assets';
import { resetToolStore, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  Button,
  IconButton,
  ItemListEditor,
  Notice,
  ProjectMenu,
  Section,
  type Shortcut,
  Tabs,
  type ToastOptions,
  ToolShell,
  UsageSection,
  useToast,
  withShortcut,
} from '@/ui';
import { addSheet, copySheet, removeSheet, renameSheet, selectSheet } from './actions';
import { CombatTab } from './CombatTab';
import { InfoTab } from './InfoTab';
import {
  currentSheet,
  DATA_VERSION,
  portraitIds,
  readProject,
  type Sheet,
  type SheetProject,
  sheetLabel,
  TOOL_ID,
} from './model';
import { OutputPanel, runPrint } from './OutputPanel';
import { Preview } from './Preview';
import { SKILL_TABLE_CSS, SkillsTab } from './SkillsTab';
import { StatsTab } from './StatsTab';
import { StoryTab } from './StoryTab';
import {
  assets,
  collectPortraits,
  type EditorTab,
  useMigrationNotice,
  useSheets,
  useView,
} from './store';
import { S } from './strings';

function Usage() {
  return (
    <ul>
      {S.usage.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

/** 表單用的樣式（技能表的版面） */
function useFormStyle(): void {
  useLayoutEffect(() => {
    let el = document.getElementById('coc-sheet-form-style') as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = 'coc-sheet-form-style';
      document.head.appendChild(el);
    }
    el.textContent = SKILL_TABLE_CSS;
  }, []);
}

const narrowAtStart = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(max-width: 1023px)').matches;

function MigrationNotice() {
  const n = useMigrationNotice();
  if (!n.shown) return null;
  return (
    <Notice
      tone="info"
      action={
        <Button
          size="sm"
          variant="ghost"
          onClick={() => useMigrationNotice.setState({ shown: false })}
        >
          {S.migrate.dismiss}
        </Button>
      }
    >
      <span data-testid="migration-notice" className="flex flex-col gap-1">
        <strong>{S.migrate.title(n.titles.length)}</strong>
        <span>{S.migrate.names(n.titles.map((t) => `「${t}」`).join('、'))}</span>
        {n.skipped.map((s) => (
          <span key={s.title}>
            「{s.title}」：{S.migrate.unparsed(s.items.join('；'))}
          </span>
        ))}
      </span>
    </Notice>
  );
}

function SheetList({ sheet, sheets }: { sheet: Sheet; sheets: readonly Sheet[] }) {
  const [open, setOpen] = useState(() => !narrowAtStart());
  return (
    <Section
      title={
        <>
          {S.list.title}（{sheets.length}）
          {open ? null : (
            <span className="ml-1 font-normal text-muted" data-testid="collapsed-current">
              {S.list.current(sheetLabel(sheet))}
            </span>
          )}
        </>
      }
      open={open}
      onOpenChange={setOpen}
      actions={
        <Button size="sm" icon={<Plus />} onClick={addSheet} aria-label={S.list.add}>
          {S.list.addShort}
        </Button>
      }
    >
      <ItemListEditor<Sheet>
        aria-label={S.list.aria}
        items={sheets}
        getId={(s) => s.id}
        getName={(s) => s.title}
        placeholder={S.list.unnamed}
        renameLabel={S.list.rename}
        onRename={renameSheet}
        selectedId={sheet.id}
        onSelect={selectSheet}
        onRemove={sheets.length > 1 ? removeSheet : undefined}
        confirmRemove={(s) => ({
          title: S.list.removeTitle(sheetLabel(s)),
          description: S.list.removeDescription,
        })}
        renderMeta={(s) => S.list.meta(s.info.name.trim(), s.info.occupation.trim())}
        renderActions={(s) => (
          <IconButton
            size="sm"
            label={S.list.duplicate(sheetLabel(s))}
            icon={<Copy />}
            onClick={() => copySheet(s.id)}
          />
        )}
      />
    </Section>
  );
}

function Editor({ sheet }: { sheet: Sheet }) {
  const tab = useView((v) => v.data.tab);
  return (
    <Tabs<EditorTab>
      aria-label={S.tabs.aria}
      value={tab}
      onValueChange={(t) => useView.getState().patch({ tab: t })}
      items={[
        { value: 'info', label: S.tabs.info, content: <InfoTab sheet={sheet} /> },
        { value: 'stats', label: S.tabs.stats, content: <StatsTab sheet={sheet} /> },
        { value: 'skills', label: S.tabs.skills, content: <SkillsTab sheet={sheet} /> },
        { value: 'combat', label: S.tabs.combat, content: <CombatTab sheet={sheet} /> },
        { value: 'story', label: S.tabs.story, content: <StoryTab sheet={sheet} /> },
      ]}
    />
  );
}

const printRef: { run: () => void } = { run: () => {} };

/** 在 ToolShell 的 Provider 裡面：列印快捷鍵、頁首選單要顯示的通知 */
const useNotify = create<{ queue: ToastOptions[] }>(() => ({ queue: [] }));
const notify = (t: ToastOptions) => useNotify.setState((s) => ({ queue: [...s.queue, t] }));

function Bridge({ sheet }: { sheet: Sheet }) {
  const toast = useToast();
  const queue = useNotify((s) => s.queue);
  useEffect(() => {
    printRef.run = () => void runPrint(sheet, toast);
  });
  useEffect(() => {
    if (!queue.length) return;
    for (const t of queue) toast(t);
    useNotify.setState({ queue: [] });
  }, [queue, toast]);
  return null;
}

export function App() {
  useFormStyle();
  const data = useSheets((s) => s.data);
  const currentId = useView((v) => v.data.currentId);
  const sheet = currentSheet(data, currentId);
  const savedAt = useSaveStatus(TOOL_ID);
  const { undo, redo, canUndo, canRedo, clear } = useUndoRedo(useSheets);

  /* 開頁：讀回頭像、清掉沒有用到的圖 */
  useEffect(() => {
    void assets.preload(portraitIds(useSheets.getState().data)).then(() => collectPortraits());
  }, []);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { keys: 'mod+z', label: S.undo, group: S.keysGroup, handler: undo },
      { keys: ['shift+mod+z', 'mod+y'], label: S.redo, group: S.keysGroup, handler: redo },
      {
        keys: 'mod+p',
        label: S.output.printKey,
        group: S.outputGroup,
        allowInInput: true,
        handler: () => printRef.run(),
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
      <ProjectMenu<SheetProject>
        toolId={TOOL_ID}
        version={DATA_VERSION}
        getData={() => ({ ...useSheets.getState().data, currentId: sheet.id })}
        getFiles={() => assets.exportFiles(portraitIds(useSheets.getState().data))}
        onLoad={async (raw, _project, files) => {
          const project = readProject(raw);
          if (!project) throw new Error(S.project.invalid);
          await importAssetFiles(assets, files);
          const ids = project.sheets.flatMap((s) => (s.portrait ? [s.portrait.assetId] : []));
          const { missing } = await assets.preload(ids);
          useSheets.getState().replace({ sheets: project.sheets });
          selectSheet(project.currentId ?? project.sheets[0].id);
          clear();
          if (missing.length)
            notify({ title: S.project.missingImages(missing.length), tone: 'warning' });
          return true;
        }}
        onReset={() => {
          resetToolStore(useSheets, { clearHistory: false });
          selectSheet(useSheets.getState().data.sheets[0].id);
        }}
        savedAt={savedAt}
        fileName={S.project.fileName}
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
          <Bridge sheet={sheet} />
          <UsageSection persistKey={`${TOOL_ID}:usage`}>
            <Usage />
          </UsageSection>
          <MigrationNotice />
          <div className="grid min-w-0 grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="min-w-0 lg:col-start-1 lg:row-start-1">
              <SheetList sheet={sheet} sheets={data.sheets} />
            </div>
            <div className="flex min-w-0 flex-col gap-3 lg:sticky-pane lg:col-start-2 lg:row-span-2 lg:row-start-1">
              <Preview sheet={sheet} />
              <OutputPanel sheet={sheet} />
            </div>
            <div className="min-w-0 lg:col-start-1 lg:row-start-2">
              <Editor key={sheet.id} sheet={sheet} />
            </div>
          </div>
        </>
      }
    />
  );
}
