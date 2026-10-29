/**
 * PL 自介卡與地雷表：跑團用的自我介紹卡（暱稱、頭像、玩過的系統、喜歡的風格、時段、聯絡方式…）＋地雷表
 * （常見主題 × 五級：盡量來、有就開心、沒差、先問我、地雷）。輸出 PNG、純文字、分享連結、專案檔；
 * KP 可以把幾個 PL 的地雷表合成對照表。規格：docs/refactor/specs/pl-profile.md。
 *
 * 版面：設定欄四個分頁（自介卡、地雷表、外觀、KP 對照）；預覽欄是輸出（圖片／純文字），在「KP 對照」分頁時是對照表。
 * 網址有分享內容（#p=…）時是唯讀檢視。
 */
import { Contact, Palette, Redo2, ShieldAlert, Undo2, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { downloadBytes, downloadText } from '@/core/files';
import { clearShareHash } from '@/core/share';
import { useShareHash } from '@/core/share/react';
import {
  resetToolStore,
  serializeProject,
  serializeProjectZip,
  useSaveError,
  useSaveStatus,
  useUndoRedo,
} from '@/core/storage';
import {
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
import { ComparePanel, CompareTable } from './Compare';
import { JiraiTab } from './JiraiTab';
import { LookTab } from './LookTab';
import { DATA_VERSION, LEVELS, type ProfileData, projectAssetIds, TOOL_ID } from './model';
import { OutputPanel } from './Output';
import { ProfileTab } from './ProfileTab';
import { importProject, projectFileBase } from './project';
import { readShare } from './share';
import { assets, profileNow, referencedImages, type TabId, useProfile, useView } from './store';
import { OUT, S } from './strings';
import { Viewer } from './Viewer';

function Usage() {
  return (
    <>
      <p>{S.usage.intro}</p>
      <ol>
        {S.usage.steps.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ol>
      <p className="mt-2 font-semibold">{S.usage.levelsTitle}</p>
      <ul>
        {LEVELS.map((l) => (
          <li key={l}>
            {OUT.symbols[l]} {OUT.levels[l]}：{OUT.levelHints[l]}
          </li>
        ))}
      </ul>
      <p className="mt-2 font-semibold">{S.usage.notesTitle}</p>
      <ul>
        {S.usage.notes.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </>
  );
}

/** 設定欄的預設寬度（地雷表的一列：主題名稱＋五個按鈕＋補充放得進一行；可以拖曳分隔線調整） */
const SETTINGS_WIDTH = 'minmax(360px,460px)';

/** 快捷鍵（在 ToolShell 的通知範圍外綁定）要跳通知時用：由頁面裡的元件把 toast 交出來 */
const toastRef: { current: ((o: ToastOptions) => void) | null } = { current: null };
function ToastBridge() {
  toastRef.current = useToast();
  return null;
}

/** Ctrl＋S：存成專案檔（與「專案」選單的「存成專案檔」相同的檔案） */
async function saveProjectNow() {
  try {
    const d = profileNow();
    const now = new Date();
    const base = projectFileBase(d, now);
    const ids = projectAssetIds(d);
    let name: string;
    if (ids.length) {
      name = `${base}.zip`;
      const files = await assets.exportFiles(ids);
      downloadBytes(
        serializeProjectZip(TOOL_ID, DATA_VERSION, d, files, now),
        name,
        'application/zip',
      );
    } else {
      name = `${base}.json`;
      downloadText(serializeProject(TOOL_ID, DATA_VERSION, d, now), name, 'application/json');
    }
    toastRef.current?.({ title: S.toast.saved, description: name, tone: 'success' });
  } catch (e) {
    toastRef.current?.({
      title: S.toast.saveFailed,
      description: e instanceof Error ? e.message : String(e),
      tone: 'danger',
    });
  }
}

/** 開頁約 5 秒後整理一次圖片庫：以前留下、目前的狀態與復原紀錄都沒用到的圖片才刪 */
function useAssetCleanup() {
  useEffect(() => {
    const t = setTimeout(() => {
      void assets.gcStale(referencedImages()).catch(() => undefined);
    }, 5000);
    return () => clearTimeout(t);
  }, []);
}

/** 讀不出來的分享連結：通知一次、清掉網址的 #，照一般開頁 */
function BrokenShare({ broken }: { broken: boolean }) {
  const toast = useToast();
  useEffect(() => {
    if (!broken) return;
    toast({ title: S.viewer.broken, description: S.viewer.brokenHint, tone: 'warning' });
    clearShareHash();
  }, [broken, toast]);
  return null;
}

function Settings() {
  const tab = useView((s) => s.data.tab);
  const patch = useView((s) => s.patch);
  return (
    <Tabs<TabId>
      aria-label={S.tabs.aria}
      value={tab}
      onValueChange={(v) => patch({ tab: v })}
      items={[
        { value: 'profile', label: S.tabs.profile, icon: <Contact />, content: <ProfileTab /> },
        { value: 'jirai', label: S.tabs.jirai, icon: <ShieldAlert />, content: <JiraiTab /> },
        { value: 'look', label: S.tabs.look, icon: <Palette />, content: <LookTab /> },
        { value: 'compare', label: S.tabs.compare, icon: <Users />, content: <ComparePanel /> },
      ]}
    />
  );
}

function Preview() {
  const tab = useView((s) => s.data.tab);
  return tab === 'compare' ? <CompareTable /> : <OutputPanel />;
}

function Editor({ brokenShare }: { brokenShare: boolean }) {
  const savedAt = useSaveStatus(TOOL_ID);
  const saveError = useSaveError(TOOL_ID);
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useProfile);
  const hasAvatar = useProfile((s) => !!s.data.profile.avatar);
  useAssetCleanup();

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { keys: 'mod+z', label: S.undo, group: S.keys.edit, handler: undo },
      { keys: ['shift+mod+z', 'mod+y'], label: S.redo, group: S.keys.edit, handler: redo },
      {
        keys: 'mod+s',
        label: S.keys.save,
        group: S.keys.file,
        handler: () => void saveProjectNow(),
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
      <ProjectMenu<unknown>
        toolId={TOOL_ID}
        version={DATA_VERSION}
        getData={() => profileNow()}
        getFiles={hasAvatar ? () => assets.exportFiles(projectAssetIds(profileNow())) : undefined}
        fileNameFor={(now) => projectFileBase(profileNow(), now)}
        openAccept=".json,.zip,application/json,application/zip"
        confirmOpen={{
          title: S.project.openTitle,
          description: S.project.openDesc,
          confirmLabel: S.project.openConfirm,
        }}
        onLoad={async (data, _file, files) => {
          const r = await importProject(data, files);
          useProfile.getState().replace(r.state as ProfileData);
          return { warnings: r.warnings };
        }}
        onReset={() => resetToolStore(useProfile, { clearHistory: false })}
        resetText={{
          label: S.project.resetLabel,
          title: S.project.resetTitle,
          description: S.project.resetDesc,
          confirmLabel: S.project.resetConfirm,
        }}
        savedAt={savedAt}
        statusText={saveError ? S.project.saveFailed : undefined}
      />
    </>
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={shortcuts}
      headerActions={headerActions}
      settingsResize={{ persistKey: TOOL_ID, defaultWidth: SETTINGS_WIDTH }}
      settings={
        <div className="flex flex-col gap-3">
          <ToastBridge />
          <BrokenShare broken={brokenShare} />
          <UsageSection persistKey={TOOL_ID}>
            <Usage />
          </UsageSection>
          <Settings />
        </div>
      }
      preview={<Preview />}
    />
  );
}

export function App() {
  const share = useShareHash(readShare);
  const [exited, setExited] = useState(false);
  /* 同一頁換了別的分享連結時重新顯示唯讀檢視 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 分享內容（share）換了就要重設
  useEffect(() => {
    setExited(false);
  }, [share]);
  if (typeof share === 'object' && !exited)
    return (
      <ToolShell
        toolId={TOOL_ID}
        usage={<Usage />}
        body={
          <Viewer
            data={share}
            onExit={() => {
              clearShareHash();
              setExited(true);
            }}
          />
        }
      />
    );
  return <Editor brokenShare={share === 'broken'} />;
}
