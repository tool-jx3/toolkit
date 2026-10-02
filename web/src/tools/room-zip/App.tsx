/**
 * CCFOLIA 房間 ZIP 產生器：把自己的圖片整理成 CCFOLIA 可以直接匯入的房間 ZIP。
 * 規格：docs/refactor/specs/room-zip.md（第 7 節主控裁定優先）。
 *
 * 版面（ToolShell 的 body 自己排）：上方專案列（名稱、摘要）；左側導覽（可收合；窄畫面變成一列）；中間是目前的頁面；
 * 右側面板（素材／預覽，可釘選、可調寬度；房間設計頁不顯示）；畫面底部是備忘與待辦欄。
 */
import {
  BookOpen,
  Clapperboard,
  Download,
  FolderOpen,
  Home,
  Image,
  LayoutTemplate,
  PanelLeftClose,
  PanelLeftOpen,
  Redo2,
  Save,
  SaveAll,
  Settings,
  Sparkles,
  Undo2,
  UserSquare2,
  Users,
} from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import {
  Button,
  cn,
  getTheme,
  IconButton,
  type Shortcut,
  setTheme,
  ToolShell,
  WindowDrop,
  withShortcut,
} from '@/ui';
import { useNotify, useRenameProject } from './common';
import { ImagePicker } from './ImagePicker';
import { importFiles, importMessage } from './importer';
import { ACTIONS, keyOf } from './keys';
import { Modals } from './Modals';
import { formatMb } from './materials';
import { TOOL_ID } from './model';
import { exportRoom, pickAndOpen, redoAny, restoreBlobs, saveProject, undoAny } from './ops';
import { HomePage } from './pages/Home';
import { MaterialsPage } from './pages/Materials';
import { CutinsPage, PiecesPage, StoryPage } from './pages/Others';
import { RoomPage, runPartShortcut } from './pages/Room';
import { ClipDock, ScenesPage } from './pages/Scenes';
import { SavePage, SettingsPage } from './pages/Settings';
import { TachiePage } from './pages/Tachie';
import { RightOpener, RightPanel } from './Right';
import {
  autoSaveTick,
  commit,
  goPage,
  isDirty,
  markSaved,
  type PageId,
  patchLayout,
  projectSnapshot,
  setSession,
  useLayout,
  useProject,
  useSession,
  useSettings,
  useTemplateHistory,
} from './store';
import { S } from './strings';

/** 給快捷鍵等 Provider 外面的程式用的通知 */
export const notifier: {
  current: (t: string, tone?: 'info' | 'success' | 'warning' | 'danger') => void;
} = {
  current: () => {},
};
const notify = (t: string, tone?: 'info' | 'success' | 'warning' | 'danger') =>
  notifier.current(t, tone);

/* ---------- 開頁 ---------- */

function Startup() {
  const n = useNotify();
  useEffect(() => {
    notifier.current = (t, tone) => n(t, tone);
  }, [n]);
  useEffect(() => {
    const p = useProject.getState().data;
    if (!useSession.getState().sceneId && p.scenes[0]) setSession({ sceneId: p.scenes[0].id });
    markSaved(projectSnapshot());
    void restoreBlobs();
    const unsub = useProject.subscribe((s, prev) => {
      if (s.data !== prev.data) autoSaveTick(s.data);
    });
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (!isDirty()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      unsub();
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, []);
  return null;
}

/* ---------- 頁首 ---------- */

function HeaderActions() {
  const n = useNotify();
  const projectUndo = useStore(useProject.temporal, (s) => s.pastStates.length > 0);
  const projectRedo = useStore(useProject.temporal, (s) => s.futureStates.length > 0);
  const templateUndo = useTemplateHistory((s) => s.past.length > 0);
  const templateRedo = useTemplateHistory((s) => s.future.length > 0);
  const canUndo = projectUndo || templateUndo;
  const canRedo = projectRedo || templateRedo;
  const keys = useSettings((s) => s.data.keys);
  const k = (id: string) => keyOf(id, keys);
  const label = (text: string, id: string) => (k(id) ? withShortcut(text, k(id)) : text);
  return (
    <div className="flex flex-wrap items-center gap-1">
      <IconButton
        label={label(S.undo, 'undo')}
        icon={<Undo2 />}
        disabled={!canUndo}
        onClick={() => undoAny(n)}
      />
      <IconButton
        label={label(S.redo, 'redo')}
        icon={<Redo2 />}
        disabled={!canRedo}
        onClick={() => redoAny(n)}
      />
      <IconButton
        label={label(S.save, 'save')}
        icon={<Save />}
        onClick={() => void saveProject('overwrite', n)}
      />
      <IconButton
        label={label(S.saveAs, 'saveAs')}
        icon={<SaveAll />}
        onClick={() => void saveProject('saveAs', n)}
      />
      <IconButton label={S.open} icon={<FolderOpen />} onClick={() => void pickAndOpen(n)} />
      <Button
        variant="primary"
        size="sm"
        icon={<Download />}
        aria-label={S.exportZip}
        onClick={() => void exportRoom(n)}
      >
        {/* 窄畫面只留短字，頁首的按鈕才放得下 */}
        <span className="sm:hidden">ZIP</span>
        <span className="hidden sm:inline">{S.exportZip}</span>
      </Button>
    </div>
  );
}

function TopBar() {
  const name = useProject((s) => s.data.name);
  const counts = useProject(
    useShallow((s) => [
      s.data.materials.length,
      s.data.scenes.length,
      s.data.parts.length,
      s.data.pieces.length,
    ]),
  );
  const [rename, node] = useRenameProject();
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        onClick={() => void rename()}
        title={name}
        data-testid="project-name"
        className="max-w-full min-w-0 truncate rounded-sm text-base font-semibold text-fg hover:text-accent focus-visible:focus-ring sm:max-w-[28rem]"
      >
        {name}
      </button>
      <span className="text-xs text-muted" data-testid="project-summary">
        {S.summary(counts[0], counts[1], counts[2], counts[3])}
      </span>
      <span className="hidden text-xs text-muted md:inline">{S.subtitle}</span>
      {node}
    </div>
  );
}

/* ---------- 左側導覽（F008、F009） ---------- */

const NAV: { group: keyof typeof S.navGroups | null; items: { id: PageId; icon: ReactNode }[] }[] =
  [
    { group: null, items: [{ id: 'home', icon: <Home /> }] },
    {
      group: 'base',
      items: [
        { id: 'room', icon: <LayoutTemplate /> },
        { id: 'materials', icon: <Image /> },
      ],
    },
    {
      group: 'scenes',
      items: [
        { id: 'scenes', icon: <Clapperboard /> },
        { id: 'tachie', icon: <UserSquare2 /> },
        { id: 'cutins', icon: <Sparkles /> },
        { id: 'story', icon: <BookOpen /> },
      ],
    },
    { group: 'pieces', items: [{ id: 'pieces', icon: <Users /> }] },
    { group: 'save', items: [{ id: 'save', icon: <Save /> }] },
  ];

function Nav() {
  const page = useSession((s) => s.page);
  const collapsed = useLayout((s) => s.data.sideCollapsed);
  const counts = useProject(
    useShallow((s) => ({
      materials: s.data.materials.length,
      scenes: s.data.scenes.length,
      tachie: s.data.tachie.length,
      cutins: s.data.cutins.length,
      pieces: s.data.pieces.length,
    })),
  );
  const item = (id: PageId, icon: ReactNode) => {
    const badge = (counts as Record<string, number>)[id];
    return (
      <button
        key={id}
        type="button"
        onClick={() => goPage(id)}
        aria-current={page === id ? 'page' : undefined}
        title={S.pages[id]}
        data-nav={id}
        className={cn(
          'relative flex shrink-0 items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fg hover:bg-surface-3 focus-visible:focus-ring [&_svg]:size-4 [&_svg]:shrink-0',
          page === id && 'bg-accent-soft font-semibold text-accent',
          collapsed && 'lg:justify-center',
        )}
      >
        {icon}
        <span className={cn('whitespace-nowrap', collapsed && 'lg:sr-only')}>{S.pages[id]}</span>
        {badge ? (
          <span
            className={cn(
              'ml-auto rounded-full bg-surface-3 px-1.5 text-[11px] leading-4 text-muted tabular-nums',
              collapsed && 'lg:absolute lg:-top-1 lg:-right-1 lg:ml-0',
            )}
          >
            {badge}
          </span>
        ) : null}
      </button>
    );
  };
  return (
    <nav
      aria-label={S.navLabel}
      className={cn(
        'flex min-w-0 shrink-0 gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-1.5 lg:sticky lg:top-16 lg:max-h-[calc(100dvh-6rem)] lg:flex-col lg:overflow-y-auto lg:overflow-x-visible',
        collapsed ? 'lg:w-12' : 'lg:w-44',
      )}
    >
      <IconButton
        label={collapsed ? S.navExpand : S.navCollapse}
        icon={collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        size="sm"
        className="hidden self-end lg:inline-flex"
        onClick={() => patchLayout({ sideCollapsed: !collapsed })}
      />
      {NAV.map((g) => (
        <div key={g.group ?? 'top'} className="flex shrink-0 gap-1 lg:flex-col">
          {g.group && !collapsed ? (
            <span className="hidden px-2 pt-1 text-[11px] text-muted lg:block">
              {S.navGroups[g.group]}
            </span>
          ) : null}
          {g.items.map((i) => item(i.id, i.icon))}
        </div>
      ))}
      <div className="flex shrink-0 gap-1 lg:mt-2 lg:flex-col lg:border-t lg:border-border lg:pt-2">
        {item('settings', <Settings />)}
        {!collapsed ? (
          <p className="m-0 hidden px-2 text-[11px] text-muted lg:block">{S.navFootnote}</p>
        ) : null}
      </div>
    </nav>
  );
}

/* ---------- 底部的備忘與待辦（F014～F016） ---------- */

function BottomBar() {
  const open = useLayout((s) => s.data.bottomOpen);
  const memo = useProject((s) => s.data.memo);
  const todos = useProject((s) => s.data.todos);
  const [draft, setDraft] = useState('');
  const left = todos.filter((t) => !t.done).length;
  const summary = [
    todos.length ? (left ? S.bottomTodoLeft(left) : S.bottomTodoDone) : '',
    memo.trim() ? S.bottomHasMemo : '',
  ]
    .filter(Boolean)
    .join('・');
  const move = (i: number, d: -1 | 1) =>
    commit((p) => {
      const j = i + d;
      if (j < 0 || j >= p.todos.length) return;
      [p.todos[i], p.todos[j]] = [p.todos[j], p.todos[i]];
    });
  return (
    <div
      className="sticky bottom-0 z-20 -mx-3 border-t border-border bg-surface shadow-2 lg:-mx-4"
      data-testid="bottom-bar"
    >
      <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-3 py-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => patchLayout({ bottomOpen: !open })}
          className="rounded-sm text-sm text-fg hover:text-accent focus-visible:focus-ring"
        >
          {open ? '▾' : '▴'} {S.bottomToggle}
        </button>
        <span className="truncate text-xs text-muted">{summary}</span>
      </div>
      {open ? (
        <div className="mx-auto grid max-h-[40dvh] max-w-[1600px] grid-cols-1 gap-3 overflow-y-auto px-3 pb-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold">{S.memoTitle}</span>
            <textarea
              value={memo}
              rows={5}
              placeholder={S.memoPlaceholder}
              onChange={(e) =>
                commit((p) => {
                  p.memo = e.target.value;
                })
              }
              className="min-h-24 w-full rounded-md border border-border-strong bg-surface-2 p-2 text-sm text-fg focus-visible:focus-ring"
            />
          </label>
          <div className="flex min-w-0 flex-col gap-1 text-sm">
            <span className="font-semibold">{S.todoTitle}</span>
            {todos.length ? (
              <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={S.todoTitle}>
                {todos.map((t, i) => (
                  <li key={t.id} className={cn('flex min-w-0 items-center gap-1', t.sub && 'pl-6')}>
                    <input
                      type="checkbox"
                      checked={t.done}
                      aria-label={t.text}
                      onChange={(e) =>
                        commit((p) => {
                          p.todos[i].done = e.target.checked;
                        })
                      }
                    />
                    <span
                      className={cn('min-w-0 flex-1 truncate', t.done && 'text-muted line-through')}
                    >
                      {t.text}
                    </span>
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={S.todoUp}
                      icon={<span>↑</span>}
                      onClick={() => move(i, -1)}
                    />
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={S.todoDown}
                      icon={<span>↓</span>}
                      onClick={() => move(i, 1)}
                    />
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={S.todoSub}
                      icon={<span>⇥</span>}
                      pressed={t.sub}
                      onClick={() =>
                        commit((p) => {
                          p.todos[i].sub = !p.todos[i].sub;
                        })
                      }
                    />
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={S.todoDelete}
                      icon={<span>✕</span>}
                      onClick={() => commit((p) => void p.todos.splice(i, 1))}
                    />
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-xs text-muted">{S.todoEmpty}</span>
            )}
            <input
              value={draft}
              aria-label={S.todoPlaceholder}
              placeholder={S.todoPlaceholder}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                const t = draft.trim();
                if (!t) return;
                commit(
                  (p) =>
                    void p.todos.push({
                      id: `t${Date.now().toString(36)}`,
                      text: t,
                      done: false,
                      sub: false,
                    }),
                );
                setDraft('');
              }}
              className="h-8 rounded-md border border-border-strong bg-surface-2 px-2 text-sm text-fg focus-visible:focus-ring"
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------- 忙碌遮罩（F017） ---------- */

function Busy() {
  const busy = useSession((s) => s.busy);
  if (!busy) return null;
  const pct = busy.total ? Math.max(4, Math.round((busy.done / busy.total) * 100)) : 4;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-overlay p-6"
      role="status"
      aria-live="polite"
      data-testid="busy"
    >
      <div className="flex w-full max-w-sm flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-2">
        <b>{busy.title}</b>
        <span className="truncate text-sm text-muted">{busy.detail || S.busyWait}</span>
        <span className="text-xs text-muted tabular-nums">
          {busy.done} / {busy.total}
        </span>
        <div className="h-2 overflow-hidden rounded-full bg-surface-3">
          <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  );
}

/* ---------- 版面 ---------- */

function Page({ id }: { id: PageId }) {
  switch (id) {
    case 'home':
      return <HomePage />;
    case 'room':
      return <RoomPage />;
    case 'materials':
      return <MaterialsPage />;
    case 'scenes':
      return <ScenesPage />;
    case 'tachie':
      return <TachiePage />;
    case 'cutins':
      return <CutinsPage />;
    case 'story':
      return <StoryPage />;
    case 'pieces':
      return <PiecesPage />;
    case 'save':
      return <SavePage />;
    default:
      return <SettingsPage />;
  }
}

function Workspace() {
  const page = useSession((s) => s.page);
  const lay = useLayout((s) => s.data);
  const n = useNotify();
  const showRight = page !== 'room';
  return (
    <div className={'flex min-w-0 flex-1 flex-col gap-3'} data-page={page}>
      <Startup />
      <TopBar />
      <div className="flex min-w-0 flex-col gap-3 lg:flex-row lg:items-start">
        <Nav />
        <div className="flex min-w-0 flex-1 flex-col gap-3" id="room-zip-main">
          <Page id={page} />
        </div>
        {showRight && lay.rightOpen ? <RightPanel /> : null}
      </div>
      {showRight && !lay.rightOpen ? <RightOpener /> : null}
      <ClipDock />
      <BottomBar />
      <Busy />
      <Modals />
      <ImagePicker />
      <WindowDrop
        label={S.materialsDrop}
        onDrop={async (files) => {
          if (useSession.getState().picker) return;
          const r = await importFiles(files);
          const msg = importMessage(r);
          n(msg.text, msg.ok ? 'success' : 'warning');
          if (r.heavy.length)
            n(
              S.importHeavyTitle,
              'warning',
              S.importHeavy(r.heavy.map((m) => `・${m.label}（${formatMb(m.after)}）`).join('\n')),
            );
          if (r.added) goPage('materials');
        }}
      />
    </div>
  );
}

function Usage() {
  return (
    <>
      <p>{S.usageIntro}</p>
      <ol className="mt-2">
        {S.usageSteps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <ul className="mt-2">
        {S.usageNotes.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </>
  );
}

/* ---------- 快捷鍵（4.3、F284） ---------- */

function moveScene(dir: -1 | 1) {
  const p = useProject.getState().data;
  if (!p.scenes.length) return;
  const cur = p.scenes.findIndex((s) => s.id === useSession.getState().sceneId);
  const next = cur < 0 ? 0 : Math.max(0, Math.min(p.scenes.length - 1, cur + dir));
  setSession({ sceneId: p.scenes[next].id, sceneSel: [] });
  goPage('scenes');
}

const HANDLERS: Record<string, () => void> = {
  undo: () => undoAny(notify),
  redo: () => redoAny(notify),
  save: () => void saveProject('overwrite', notify),
  saveAs: () => void saveProject('saveAs', notify),
  export: () => void exportRoom(notify),
  toggleRight: () => patchLayout({ rightOpen: !useLayout.getState().data.rightOpen }),
  toggleBottom: () => patchLayout({ bottomOpen: !useLayout.getState().data.bottomOpen }),
  toggleTheme: () => setTheme(getTheme() === 'dark' ? 'light' : 'dark'),
  prevScene: () => moveScene(-1),
  nextScene: () => moveScene(1),
  quickScene: () => {
    goPage('scenes');
    setTimeout(
      () => (document.getElementById('quick-scene-name') as HTMLInputElement | null)?.focus(),
      50,
    );
  },
  goMaterials: () => goPage('materials'),
  goScenes: () => goPage('scenes'),
  goMarkers: () => goPage('room'),
  goTachie: () => goPage('tachie'),
  goPanels: () => goPage('room'),
  goCutins: () => goPage('cutins'),
  goPieces: () => goPage('pieces'),
  goStory: () => goPage('story'),
  goRoom: () => goPage('room'),
  goSettings: () => goPage('settings'),
  goSave: () => goPage('save'),
  partOpen: () => runPartShortcut('open', notify),
  partLock: () => runPartShortcut('lock', notify),
  partVisible: () => runPartShortcut('visible', notify),
};

const GROUP_LABEL = S.shortcutGroups;

export function App() {
  const custom = useSettings((s) => s.data.keys);
  const shortcuts = useMemo<Shortcut[]>(() => {
    const out: Shortcut[] = [];
    for (const a of ACTIONS) {
      const k = keyOf(a.id, custom);
      if (!k) continue;
      const keys = a.id === 'redo' && !custom.redo ? [k, 'mod+y'] : k;
      out.push({
        keys,
        label: S.actions[a.id] ?? a.id,
        group: GROUP_LABEL[a.group],
        allowInInput: a.inInput,
        handler: (e) => {
          e.preventDefault();
          HANDLERS[a.id]?.();
        },
      });
    }
    out.push({ keys: 'escape', label: '關閉面板或對話框', group: GROUP_LABEL.basic });
    return out;
  }, [custom]);
  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={shortcuts}
      headerActions={<HeaderActions />}
      body={<Workspace />}
    />
  );
}
