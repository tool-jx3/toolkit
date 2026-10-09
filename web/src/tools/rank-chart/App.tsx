/**
 * 排行榜產生器：自己的盲選排行榜——放進角色（名字＋照片），一次揭曉一位、決定名次後就不能改，存成圖片。
 * 規格：docs/refactor/specs/rank-chart.md。
 */
import { FileJson, Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { pickFiles } from '@/core/files';
import { useSaveError, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  ProjectMenu,
  ProjectMenuItem,
  type Shortcut,
  Tabs,
  ToolShell,
  useConfirm,
  useToast,
  WindowDrop,
  withShortcut,
} from '@/ui';
import { endGame } from './game';
import { isImageFile } from './images';
import { fileNamePart } from './model';
import { PoolTab, usePhotoAdder } from './PoolTab';
import { Preview } from './Preview';
import { importLegacy, importProject, ProjectDataError, projectAssetIds } from './project';
import { RulesTab } from './RulesTab';
import { ensureSceneFonts, sceneText } from './render';
import {
  assets,
  configNow,
  DATA_VERSION,
  ensureImages,
  initialConfig,
  referencedImages,
  runNow,
  setTab,
  TOOL_ID,
  useConfig,
  useGame,
  useSession,
} from './store';
import { S, type TabId } from './strings';
import { TopicTab } from './TopicTab';
import { LockNotice, TabLabel } from './widgets';

/** 圖上用到的圖（角色的裁切圖、排名者照片）解碼後放進 useSession.images */
function useImageSync() {
  const characters = useConfig((s) => s.data.characters);
  const portrait = useConfig((s) => s.data.portrait.photo?.id);
  useEffect(() => {
    ensureImages([...characters.map((c) => c.thumb), portrait]);
  }, [characters, portrait]);
}

/** 字型：圖上的文字換了就載入用到的字，好了再重畫 */
function useFontSync() {
  const c = useConfig((s) => s.data);
  const text = sceneText(c);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在文字改變時載入
  useEffect(() => {
    let alive = true;
    void ensureSceneFonts(configNow()).then(() => {
      if (alive) useSession.setState((s) => ({ fontTick: s.fontTick + 1 }));
    });
    return () => {
      alive = false;
    };
  }, [text]);
}

/** 開頁約 5 秒後清掉沒用到的圖（目前的設定與復原紀錄都沒用到的才刪） */
function useAssetCleanup() {
  useEffect(() => {
    const t = setTimeout(() => {
      void assets.gc(referencedImages()).catch(() => undefined);
    }, 5000);
    return () => clearTimeout(t);
  }, []);
}

/** 開頁時的通知（接著上一局、還原完成的排行榜、存下來的遊戲讀不到）與自動儲存失敗 */
function Notices() {
  const toast = useToast();
  const boot = useSession((s) => s.boot);
  const saveError = useSaveError(TOOL_ID);
  useEffect(() => {
    if (!boot) return;
    toast({
      title: boot === 'resumed' ? S.resumed : boot === 'restoredDone' ? S.restoredDone : S.runLost,
      tone: boot === 'runLost' ? 'warning' : 'info',
    });
    useSession.setState({ boot: null });
  }, [boot, toast]);
  useEffect(() => {
    if (saveError) toast({ title: S.saveFailed, tone: 'warning' });
  }, [saveError, toast]);
  return null;
}

/** 整個視窗都可以拖放照片（加進角色名單） */
function PhotoWindowDrop() {
  const add = usePhotoAdder();
  const toast = useToast();
  const locked = useGame((s) => s.data.run !== null);
  return (
    <WindowDrop
      label={S.windowDrop}
      hint={S.windowDropHint}
      disabled={locked}
      onDrop={(files) => {
        const imgs = files.filter(isImageFile);
        if (!imgs.length) {
          if (files.length) toast({ title: S.notImage(files[0].name), tone: 'danger' });
          return;
        }
        setTab('pool');
        void add(imgs);
      }}
    />
  );
}

function Settings() {
  const tab = useSession((s) => s.tab);
  const items: { value: TabId; label: React.ReactNode; content: React.ReactNode }[] = [
    { value: 'topic', label: <TabLabel id="topic" />, content: <TopicTab /> },
    { value: 'pool', label: <TabLabel id="pool" />, content: <PoolTab /> },
    { value: 'rules', label: <TabLabel id="rules" />, content: <RulesTab /> },
  ];
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <Notices />
      <LockNotice />
      <Tabs<TabId> aria-label={S.tabsLabel} value={tab} onValueChange={setTab} items={items} />
      <PhotoWindowDrop />
    </div>
  );
}

function Usage() {
  return (
    <ol className="m-0 flex flex-col gap-1.5 pl-5">
      {S.usage.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ol>
  );
}

const ymd = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;

/** 換掉整份設定（開啟專案檔、原作的設定檔、重設）：先結束這一局 */
function replaceConfig(next: ReturnType<typeof configNow>) {
  endGame();
  useConfig.getState().replace(next);
  useSession.setState({ placing: false });
}

function LegacyItem() {
  const toast = useToast();
  const confirm = useConfirm();
  return (
    <ProjectMenuItem
      icon={<FileJson />}
      onSelect={async () => {
        if (!(await confirm(S.legacyConfirm(runNow() !== null)))) return;
        const [file] = await pickFiles({ accept: '.json,application/json' });
        if (!file) return;
        try {
          const r = await importLegacy(await file.text());
          replaceConfig(r.config);
          toast({ title: S.legacyOk, tone: 'success' });
        } catch (e) {
          toast({
            title: e instanceof ProjectDataError ? e.message : S.legacyBad,
            tone: 'danger',
          });
        }
      }}
    >
      {S.legacyOpen}
    </ProjectMenuItem>
  );
}

function HeaderActions() {
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useConfig);
  const locked = useGame((s) => s.data.run !== null);
  const savedAt = useSaveStatus(TOOL_ID);
  const saveError = useSaveError(TOOL_ID);
  const toast = useToast();
  return (
    <>
      <IconButton
        label={withShortcut(S.undo, 'mod+z')}
        icon={<Undo2 />}
        onClick={undo}
        disabled={!canUndo || locked}
      />
      <IconButton
        label={withShortcut(S.redo, 'shift+mod+z')}
        icon={<Redo2 />}
        onClick={redo}
        disabled={!canRedo || locked}
      />
      <ProjectMenu<unknown>
        toolId={TOOL_ID}
        version={DATA_VERSION}
        getData={() => configNow()}
        getFiles={() => assets.exportFiles(projectAssetIds(configNow()))}
        fileNameFor={(now) => `${fileNamePart(configNow().subject)}_${ymd(now)}`}
        confirmOpen={() => S.openConfirm(runNow() !== null)}
        openedMessage={S.projectOpened}
        onLoad={async (data, _project, files) => {
          const r = await importProject(data, files);
          replaceConfig(r.config);
          if (r.missing) toast({ title: S.projectMissing(r.missing), tone: 'warning' });
          return true;
        }}
        onReset={() => replaceConfig(initialConfig())}
        resetText={{ title: S.resetTitle, description: S.resetDesc }}
        savedAt={savedAt}
        statusText={saveError ? S.saveFailed : undefined}
        extraItems={<LegacyItem />}
      />
    </>
  );
}

declare global {
  interface Window {
    __rankChart?: unknown;
  }
}

/** 測試與對等驗證用的入口（讀設定與這一局、直接改設定） */
function useTestHook() {
  useEffect(() => {
    window.__rankChart = {
      config: () => configNow(),
      run: () => runNow(),
      spin: () => useSession.getState().spinId,
      patch: (partial: Partial<ReturnType<typeof configNow>>) =>
        useConfig.getState().update((d) => {
          Object.assign(d, partial);
        }),
    };
  }, []);
}

export function App() {
  const focus = useSession((s) => s.focus);
  useTestHook();
  const locked = useGame((s) => s.data.run !== null);
  const { undo, redo } = useUndoRedo(useConfig);
  useImageSync();
  useFontSync();
  useAssetCleanup();

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { keys: 'mod+z', label: S.undo, group: S.groupEdit, handler: locked ? undefined : undo },
      {
        keys: ['shift+mod+z', 'mod+y'],
        label: S.redo,
        group: S.groupEdit,
        handler: locked ? undefined : redo,
      },
    ],
    [locked, undo, redo],
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={shortcuts}
      headerActions={<HeaderActions />}
      settings={<Settings />}
      preview={<Preview />}
      body={
        focus ? (
          <div className="mx-auto flex w-full max-w-[1200px] min-w-0 flex-col gap-3 [--stage-max-h:calc(100dvh-20rem)]">
            <Notices />
            <Preview />
          </div>
        ) : undefined
      }
    />
  );
}
