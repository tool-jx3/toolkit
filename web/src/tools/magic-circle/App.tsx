import { FileUp } from 'lucide-react';
import { memo, useEffect, useMemo, useRef } from 'react';
import { downloadText, pickFiles, readAsText } from '@/core/files';
import { ProjectFileError, serializeProject, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  type ExportPanelHandle,
  isEditableTarget,
  isFormControlTarget,
  type Playback,
  ProjectMenu,
  ProjectMenuItem,
  type Shortcut,
  Tabs,
  ToolShell,
  UsageSection,
  usePlayback,
  useToast,
} from '@/ui';
import {
  bridge,
  cancelDraft,
  clearSelection,
  deleteSelected,
  duplicateSelected,
  newProject,
  notify,
  nudge,
  openProjectData,
  selectAll,
  setNotifier,
  setStatus,
  setTool,
} from './actions';
import { CanvasPanel } from './CanvasPanel';
import { finishPen } from './drawing';
import { Editor, TOOL_KEYS } from './Editor';
import { ExportArea } from './ExportArea';
import { TOOL_IDS } from './editorDraw';
import { GeometryPanel } from './GeometryPanel';
import { clamp } from './geometry';
import { LayersPanel } from './LayersPanel';
import { MotionPanel } from './MotionPanel';
import {
  LEGACY_AUTOSAVE_KEY,
  looksLikeLegacyProject,
  type McProject,
  normalizeProject,
  projectFileName,
  TOOL_ID,
} from './model';
import { animationState } from './motion';
import { renderScene } from './render';
import { StylePanel } from './StylePanel';
import {
  hadSavedProject,
  type PanelTab,
  PROJECT_VERSION,
  projectNow,
  usePrefs,
  useProject,
  useUi,
} from './store';
import { S } from './strings';
import { Timeline } from './Timeline';

const USAGE = (
  <>
    <ol>
      {S.usage.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ol>
    <p>{S.about}</p>
  </>
);

declare global {
  interface Window {
    __magicCircle?: unknown;
  }
}

/** 儲存專案檔（Ctrl＋S、專案選單共用的檔名） */
const saveName = () => projectFileName(projectNow().document.name, new Date());

function saveProject(): void {
  const name = saveName();
  downloadText(serializeProject(TOOL_ID, PROJECT_VERSION, projectNow()), name, 'application/json');
  setStatus(S.msg.projectSavedStatus);
  notify(S.msg.projectSaved, 'success');
}

/** 開啟舊版的 .arcana.json（F137） */
async function openLegacyFile(): Promise<void> {
  const [file] = await pickFiles({ accept: '.json,application/json' });
  if (!file) return;
  try {
    const raw: unknown = JSON.parse(await readAsText(file));
    if (!looksLikeLegacyProject(raw)) throw new Error(S.project.invalid);
    openProjectData(raw);
    notify(S.msg.projectLoaded, 'success');
  } catch (e) {
    notify(S.msg.loadFailed(e instanceof Error ? e.message : String(e)), 'danger');
  }
}

/** 開頁：還原（整理）自動儲存、帶入舊版的自動儲存；通知；測試入口 */
function Bootstrap() {
  const toast = useToast();
  useEffect(() => {
    setNotifier((n) => toast({ title: n.title, tone: n.tone }));
    return () => setNotifier(null);
  }, [toast]);
  const once = useRef(false);
  useEffect(() => {
    if (once.current) return;
    once.current = true;
    const t = useProject.temporal.getState();
    if (hadSavedProject) {
      try {
        const cur = projectNow();
        const clean = normalizeProject(cur, cur.document.name).project;
        if (JSON.stringify(clean) !== JSON.stringify(cur)) {
          t.pause();
          useProject.getState().replace(clean);
          t.resume();
        }
      } catch {
        /* 存檔壞掉時維持合併後的資料 */
      }
      setStatus(S.status.restored);
      setTimeout(() => notify(S.msg.autosaveRestored, 'success'), 300);
    } else {
      let legacy: string | null = null;
      try {
        legacy = localStorage.getItem(LEGACY_AUTOSAVE_KEY);
      } catch {
        legacy = null;
      }
      if (legacy) {
        try {
          const n = normalizeProject(JSON.parse(legacy));
          t.pause();
          useProject.getState().replace(n.project);
          t.resume();
          useUi.setState({
            selected: n.selectedId ? [n.selectedId] : [],
            primary: n.selectedId,
            anchor: n.selectedId,
          });
          const D = n.project.animation.duration;
          usePrefs.getState().update((d) => {
            d.playhead = clamp(n.playhead ?? D, 0, D);
          });
          setStatus(S.status.restored);
          setTimeout(() => notify(S.msg.legacyImported, 'success'), 300);
        } catch {
          /* 舊版的存檔讀不懂時用範本 */
        }
      }
    }
    t.clear();
  }, []);
  useEffect(() => {
    window.__magicCircle = {
      data: () => projectNow(),
      ui: () => {
        const u = useUi.getState();
        return {
          tool: u.tool,
          selected: u.selected,
          primary: u.primary,
          node: u.node,
          status: u.status,
          tab: u.tab,
        };
      },
      prefs: () => usePrefs.getState().data,
      time: () => bridge.time(),
      playing: () => bridge.playing(),
      seek: (t: number) => bridge.seek(t),
      toClient: (x: number, y: number) => bridge.toClient(x, y),
      /* 一格輸出畫面（PNG data URL；對等驗證用） */
      frame: (t: number, scale = 1, transparent?: boolean) => {
        const p = projectNow();
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(p.document.width * scale));
        c.height = Math.max(1, Math.round(p.document.height * scale));
        const ctx = c.getContext('2d');
        if (!ctx) return null;
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        renderScene(ctx, p, t, {
          transparent: transparent ?? p.document.transparent,
          pixelScale: scale,
        });
        return c.toDataURL('image/png');
      },
      pause: () => bridge.pause(),
      replace: (p: unknown) => openProjectData(p),
      select: (ids: string[]) =>
        useUi.setState({
          selected: ids,
          primary: ids.at(-1) ?? null,
          anchor: ids.at(-1) ?? null,
          node: null,
        }),
      state: (id: string, t: number, k: number, n: number) => {
        const el = projectNow().elements.find((e) => e.id === id);
        return el ? animationState(el, t, k, n) : null;
      },
    };
    return () => {
      window.__magicCircle = undefined;
    };
  }, []);
  return null;
}

/** 空白鍵：按一下放開＝播放／暫停；按住時拖曳＝平移（盤面處理，放開時不切換；規格 F128） */
function useSpaceToggle(): void {
  useEffect(() => {
    let held = false;
    let panned = false;
    const blocked = (t: EventTarget | null) =>
      isEditableTarget(t) ||
      isFormControlTarget(t) ||
      (t instanceof Element &&
        !!t.closest(
          'button,a,[role="slider"],[role="switch"],[role="tab"],[role="radio"],[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]',
        ));
    const down = (e: KeyboardEvent) => {
      if (e.key !== ' ' || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (blocked(e.target)) return;
      e.preventDefault();
      if (!e.repeat) {
        held = true;
        panned = false;
      }
    };
    const pointer = () => {
      if (held) panned = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key !== ' ' || !held) return;
      held = false;
      e.preventDefault();
      if (!panned) bridge.toggle();
    };
    const blur = () => {
      held = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('pointerdown', pointer, true);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('pointerdown', pointer, true);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);
}

/**
 * Esc：正在畫時取消、否則取消選取（規格 F51）。在捕獲階段處理、不攔下事件：
 * 畫面上有通知時 Radix 會把 Esc 拿去關通知，一般的快捷鍵就收不到（這個工具的通知很多）。
 * 對話框、選單開著或在輸入欄裡時不作用。
 */
function useEscape(): void {
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (
        document.querySelector(
          '[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]',
        )
      )
        return;
      if (useUi.getState().draft) cancelDraft();
      else clearSelection();
    };
    window.addEventListener('keydown', down, true);
    return () => window.removeEventListener('keydown', down, true);
  }, []);
}

/** 方向鍵微調（選取工具、有選取、焦點在頁面或編輯畫面上時；規格 F138） */
function useArrowNudge(): void {
  useEffect(() => {
    const dirs: Record<string, [number, number]> = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    };
    const down = (e: KeyboardEvent) => {
      const d = dirs[e.key];
      if (!d || e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      const t = e.target;
      const onPage =
        t === document.body || (t instanceof Element && !!t.closest('[data-mc-editor]'));
      if (!onPage) return;
      const ui = useUi.getState();
      if (ui.tool !== 'select' || !ui.selected.length || ui.draft) return;
      e.preventDefault();
      nudge(d[0], d[1], e.shiftKey ? 10 : 1);
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);
}

const EditorMemo = memo(Editor);

function Preview({ exportRef }: { exportRef: React.RefObject<ExportPanelHandle | null> }) {
  const anim = useProject((s) => s.data.animation);
  const playback: Playback = usePlayback({
    duration: anim.duration,
    loop: anim.plays === 0,
    autoPlay: false,
  });
  const state = useRef(playback);
  state.current = playback;
  /* 播放列的循環＝作品的循環設定 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只跟著作品的設定
  useEffect(() => {
    if (playback.loop !== (anim.plays === 0)) playback.onLoopChange(anim.plays === 0);
  }, [anim.plays]);
  /* 橋接（範本、開檔、快捷鍵用） */
  useEffect(() => {
    bridge.seek = (t) => state.current.onTimeChange(t);
    bridge.pause = () => state.current.pause();
    bridge.toggle = () => state.current.toggle();
    bridge.time = () => state.current.time;
    bridge.playing = () => state.current.playing;
  }, []);
  /* 開頁時回到上次的播放頭 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在開頁時
  useEffect(() => {
    playback.onTimeChange(clamp(usePrefs.getState().data.playhead, 0, anim.duration));
  }, []);
  /* 暫停時記住播放頭 */
  useEffect(() => {
    if (playback.playing) return;
    const t = playback.time;
    if (Math.abs(usePrefs.getState().data.playhead - t) > 1e-9)
      usePrefs.getState().update((d) => {
        d.playhead = t;
      });
  }, [playback.playing, playback.time]);
  /* 播放中以 FPS 為單位重畫編輯畫面 */
  const fps = clamp(Math.round(anim.fps) || 24, 1, 60);
  const shown = playback.playing ? Math.floor(playback.time * fps + 1e-7) / fps : playback.time;
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <EditorMemo time={shown} />
      <Timeline
        playback={playback}
        onStop={() => {
          playback.pause();
          playback.onTimeChange(0);
        }}
      />
      <ExportArea exportRef={exportRef} />
    </div>
  );
}

function SettingsTabs() {
  const tab = useUi((s) => s.tab);
  return (
    <Tabs<PanelTab>
      aria-label={S.tabs.label}
      value={tab}
      onValueChange={(v) => useUi.setState({ tab: v })}
      items={[
        { value: 'layers', label: S.tabs.layers, content: <LayersPanel /> },
        { value: 'style', label: S.tabs.style, content: <StylePanel /> },
        { value: 'geometry', label: S.tabs.geometry, content: <GeometryPanel /> },
        { value: 'motion', label: S.tabs.motion, content: <MotionPanel /> },
        { value: 'canvas', label: S.tabs.canvas, content: <CanvasPanel /> },
      ]}
    />
  );
}

export function App() {
  const exportRef = useRef<ExportPanelHandle | null>(null);
  const { undo, redo } = useUndoRedo(useProject);
  const savedAt = useSaveStatus(TOOL_ID);
  useSpaceToggle();
  useArrowNudge();
  useEscape();

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      ...TOOL_IDS.map((id) => ({
        keys: TOOL_KEYS[id],
        label: S.tools[id].name,
        group: S.keys.tools,
        handler: () => setTool(id),
      })),
      { keys: 'space', label: S.keys.playPause, group: S.keys.play },
      {
        keys: 'enter',
        label: S.keys.finishPath,
        group: S.keys.edit,
        handler: () => {
          if (useUi.getState().tool === 'pen') finishPen(false);
        },
      },
      {
        keys: 'escape',
        label: S.keys.cancel,
        group: S.keys.edit,
      },
      {
        keys: ['delete', 'backspace'],
        label: S.keys.remove,
        group: S.keys.edit,
        handler: deleteSelected,
      },
      {
        keys: ['arrowleft', 'arrowright', 'arrowup', 'arrowdown'],
        label: S.keys.nudge,
        group: S.keys.edit,
      },
      {
        keys: ['shift+arrowleft', 'shift+arrowright', 'shift+arrowup', 'shift+arrowdown'],
        label: S.keys.nudge10,
        group: S.keys.edit,
      },
      {
        keys: 'mod+z',
        label: S.keys.undo,
        group: S.keys.edit,
        handler: () => {
          if (!useProject.temporal.getState().pastStates.length) return;
          undo();
          notify(S.msg.undone);
        },
      },
      {
        keys: ['shift+mod+z', 'mod+y'],
        label: S.keys.redo,
        group: S.keys.edit,
        handler: () => {
          if (!useProject.temporal.getState().futureStates.length) return;
          redo();
          notify(S.msg.redone);
        },
      },
      { keys: 'mod+d', label: S.keys.duplicate, group: S.keys.edit, handler: duplicateSelected },
      { keys: 'mod+a', label: S.keys.selectAll, group: S.keys.edit, handler: selectAll },
      {
        keys: 'mod+s',
        label: S.keys.save,
        group: S.keys.file,
        handler: saveProject,
        allowInInput: true,
      },
    ],
    [undo, redo],
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={USAGE}
      shortcuts={shortcuts}
      headerActions={
        <ProjectMenu<McProject>
          toolId={TOOL_ID}
          version={PROJECT_VERSION}
          getData={projectNow}
          saveFileName={saveName}
          confirmOpen={false}
          onLoad={(data, project) => {
            if (project.version > PROJECT_VERSION) throw new ProjectFileError(S.project.newer);
            openProjectData(data);
          }}
          onReset={newProject}
          resetText={{
            label: S.project.newLabel,
            title: S.project.newTitle,
            description: S.project.newDescription,
            confirmLabel: S.project.newConfirm,
          }}
          onNotify={(n) => {
            if (n.kind === 'saved') {
              setStatus(S.msg.projectSavedStatus);
              notify(S.msg.projectSaved, 'success');
            } else if (n.kind === 'opened') notify(S.msg.projectLoaded, 'success');
            else if (n.kind === 'open-failed') notify(S.msg.loadFailed(n.message ?? ''), 'danger');
          }}
          extraItems={
            <ProjectMenuItem icon={<FileUp aria-hidden />} onSelect={() => void openLegacyFile()}>
              {S.project.legacyOpen}
            </ProjectMenuItem>
          }
          savedAt={savedAt}
        />
      }
      settings={
        <>
          <Bootstrap />
          <UsageSection persistKey="magic-circle">{USAGE}</UsageSection>
          <SettingsTabs />
        </>
      }
      preview={<Preview exportRef={exportRef} />}
    />
  );
}
