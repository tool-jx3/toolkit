/**
 * CoC NPC 產生器（舊版 trpg-lab 的「CoC NPC 製作／管理工具」）：
 * NPC 清單（新增、切換、刪除）→ 編輯（7 版／6 版、屬性擲骰、衍生值、技能、指令、備註）→
 * 輸出 CCFOLIA 角色 JSON 與聊天面板（複製、擲骰並複製）。
 * 寬畫面三欄（清單｜編輯｜輸出），窄畫面由上而下排列、清單預設收合。
 * 規格：docs/refactor/specs/coc-npc.md。
 */
import { Plus, Redo2, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { resetToolStore, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  Button,
  cn,
  IconButton,
  ItemListEditor,
  ProjectMenu,
  Section,
  type Shortcut,
  ToolShell,
  UsageSection,
  withShortcut,
} from '@/ui';
import { addNpc, removeNpc, rollAll, selectNpc } from './actions';
import { EditForm } from './EditForm';
import { currentNpc, type Npc, type NpcProject, readProject, TOOL_ID } from './logic';
import { OutputPanel } from './OutputPanel';
import { useNpcs, useView } from './store';
import { OUT, S } from './strings';

function Usage() {
  return (
    <ul>
      {S.usage.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

/** 窄畫面（舊版 900 px 以下）時清單預設收合 */
const narrowAtStart = () =>
  typeof window !== 'undefined' &&
  !!window.matchMedia &&
  window.matchMedia('(max-width: 900px)').matches;

function EditionBadge({ npc }: { npc: Npc }) {
  return (
    <span
      data-testid="edition-badge"
      className={cn(
        'inline-flex rounded-sm border px-1.5 text-xs font-medium tabular-nums',
        npc.edition === 7 ? 'border-accent text-accent' : 'border-border-strong text-muted',
      )}
    >
      {S.list.badge(npc.edition)}
    </span>
  );
}

export function App() {
  const data = useNpcs((s) => s.data);
  const currentId = useView((v) => v.data.currentId);
  const npc = currentNpc(data, currentId);
  const savedAt = useSaveStatus(TOOL_ID);
  const { undo, redo, canUndo, canRedo, clear } = useUndoRedo(useNpcs);
  const [listOpen, setListOpen] = useState(() => !narrowAtStart());

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { keys: 'mod+z', label: S.undo, group: S.keysGroup, handler: undo },
      { keys: ['shift+mod+z', 'mod+y'], label: S.redo, group: S.keysGroup, handler: redo },
      { keys: 'r', label: S.rollAllKey, group: S.npcGroup, handler: () => void rollAll() },
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
      <ProjectMenu<NpcProject>
        toolId={TOOL_ID}
        getData={() => ({ ...useNpcs.getState().data, currentId: npc.id })}
        onLoad={(raw) => {
          const project = readProject(raw);
          if (!project) return false;
          useNpcs.getState().replace({ npcs: project.npcs });
          selectNpc(project.currentId ?? project.npcs[0].id);
          clear();
          return true;
        }}
        onReset={() => {
          resetToolStore(useNpcs, { clearHistory: false });
          selectNpc(useNpcs.getState().data.npcs[0].id);
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

  const list = (
    <Section
      title={
        <>
          {S.list.title}（{data.npcs.length}）
          {listOpen ? null : (
            <span className="ml-1 font-normal text-muted" data-testid="collapsed-current">
              {S.list.current(npc.name || OUT.unnamed)}
            </span>
          )}
        </>
      }
      open={listOpen}
      onOpenChange={setListOpen}
      actions={
        <Button size="sm" icon={<Plus />} onClick={addNpc} aria-label={S.list.add}>
          {S.list.addShort}
        </Button>
      }
    >
      <ItemListEditor<Npc>
        aria-label={S.list.aria}
        items={data.npcs}
        getId={(n) => n.id}
        getName={(n) => n.name}
        placeholder={OUT.unnamed}
        selectedId={npc.id}
        onSelect={selectNpc}
        onRemove={data.npcs.length > 1 ? removeNpc : undefined}
        renderLeading={(n) => <EditionBadge npc={n} />}
      />
    </Section>
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={shortcuts}
      headerActions={headerActions}
      body={
        <>
          <UsageSection persistKey={`${TOOL_ID}:usage`}>
            <Usage />
          </UsageSection>
          <div className="grid min-w-0 grid-cols-1 items-start gap-3 lg:grid-cols-[minmax(200px,240px)_minmax(0,1fr)_minmax(300px,400px)]">
            <div className="min-w-0 lg:sticky-pane">{list}</div>
            <EditForm key={npc.id} npc={npc} />
            <div className="min-w-0 lg:sticky-pane">
              <OutputPanel npc={npc} />
            </div>
          </div>
        </>
      }
    />
  );
}
