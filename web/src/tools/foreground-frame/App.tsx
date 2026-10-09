/**
 * 前景框產生器：做給 CCFOLIA「前景」用的框圖片（畫布扣掉中間透明的窗），可以依時間帶、天氣等做出差分一次匯出成 ZIP。
 */
import { FolderCog, Frame, Layers, Shapes, SwatchBook } from 'lucide-react';
import { useEffect } from 'react';
import { GRID_PX } from '@/ccfolia';
import { referencedAssetIds } from '@/core/assets';
import { filesInMemory } from '@/core/files';
import { useSaveStatus } from '@/core/storage';
import {
  ProjectMenu,
  type ProjectNotice,
  type Shortcut,
  Tabs,
  ToolShell,
  UsageSection,
  WindowDrop,
} from '@/ui';
import { addDroppedFiles, isFontFile, isImageFile, resetEverything, setTab } from './actions';
import { TextGestureScope } from './controls';
import { ensureStateFonts, fontRequests } from './fonts';
import { useTestHook } from './hook';
import { stateAssetIds, TOOL_ID } from './model';
import { Preview } from './Preview';
import { DecoPanel } from './panels/DecoPanel';
import { FramePanel } from './panels/FramePanel';
import { LayersPanel } from './panels/LayersPanel';
import { ProjectPanel } from './panels/ProjectPanel';
import { VariantsPanel } from './panels/VariantsPanel';
import {
  openProject,
  openProjectFile,
  PROJECT_VERSION,
  type ProjectData,
  projectData,
  projectFileName,
  projectFiles,
  projectHasFiles,
} from './project';
import {
  AUTOSAVE_OK,
  assets,
  bump,
  HAD_SAVED,
  setStatus,
  type TabId,
  useFrame,
  usePreview,
} from './store';
import { S } from './strings';

/** F80：Ctrl／⌘＋Z 復原；Ctrl／⌘＋Y 或 Ctrl／⌘＋Shift＋Z 重做（文字欄裡、對話框開著時不作用） */
const SHORTCUTS: Shortcut[] = [
  {
    keys: 'mod+z',
    label: S.preview.undo,
    group: '編輯',
    handler: () => useFrame.temporal.getState().undo(),
  },
  {
    keys: ['mod+y', 'shift+mod+z'],
    label: S.preview.redo,
    group: '編輯',
    handler: () => useFrame.temporal.getState().redo(),
  },
];

const USAGE = (
  <div className="flex flex-col gap-3">
    <ul className="m-0 flex flex-col gap-1.5 pl-5">
      {S.usage.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
    <p className="m-0 font-medium">{S.ccfoliaTitle}</p>
    <ul className="m-0 flex flex-col gap-1.5 pl-5">
      {S.ccfolia(GRID_PX).map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
    <p className="m-0 text-xs text-muted">{S.unofficial}</p>
  </div>
);

/** 開頁：狀態列顯示已還原或就緒；清掉以前留下、沒用到的圖片 */
function useStartup() {
  useEffect(() => {
    if (!AUTOSAVE_OK) setStatus(S.status.noAutosave, 'warning');
    else setStatus(HAD_SAVED ? S.status.restored : S.status.ready, 'info');
    const keep = referencedAssetIds(useFrame, stateAssetIds);
    const bg = usePreview.getState().data.bgAsset;
    if (bg) keep.add(bg);
    /* 只清以前留下的（這次開頁放進來、還沒寫進狀態的圖不刪） */
    void assets.gcStale(keep).catch(() => undefined);
  }, []);
}

/** 用到的圖片解碼、網頁字型載入；讀好了就重畫 */
function useMediaSync() {
  const state = useFrame((st) => st.data);
  const bgAsset = usePreview((st) => st.data.bgAsset);
  const ids = [...stateAssetIds(state), ...(bgAsset ? [bgAsset] : [])].sort().join('|');
  useEffect(() => {
    let alive = true;
    const list = ids ? ids.split('|') : [];
    const missing = list.filter((id) => !assets.peekBitmap(id));
    if (!missing.length) return;
    void Promise.all(missing.map((id) => assets.bitmap(id).catch(() => undefined))).then(() => {
      if (alive) bump();
    });
    return () => {
      alive = false;
    };
  }, [ids]);
  const fontKey = JSON.stringify(fontRequests(state));
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在用到的字型或文字改變時載入
  useEffect(() => {
    let alive = true;
    void ensureStateFonts(useFrame.getState().data).then(() => {
      if (alive) bump();
    });
    return () => {
      alive = false;
    };
  }, [fontKey]);
}

/** F31：拖放與貼上。有專案檔就開啟專案（忽略其他檔案），否則字型當字型、圖片當圖片圖層 */
async function handleFiles(picked: File[]): Promise<void> {
  /* 先全部讀進記憶體（貼上是自己接的；字型、圖片是依序處理，Android 的相片挑選器給的檔案之後會讀不到） */
  const files = await filesInMemory(picked);
  const project = files.find((f) => /\.(json|zip)$/i.test(f.name));
  if (project) {
    await openProjectFile(project);
    return;
  }
  const fonts = files.filter(isFontFile);
  const images = files.filter((f) => !isFontFile(f) && isImageFile(f));
  /* 同一批的結果合成狀態列的一則 */
  await addDroppedFiles(fonts, images);
}

function usePaste() {
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === 'TEXTAREA' ||
          (t.tagName === 'INPUT' &&
            !['checkbox', 'radio', 'range', 'button'].includes((t as HTMLInputElement).type)) ||
          t.isContentEditable)
      )
        return;
      const files = Array.from(e.clipboardData?.files ?? []);
      if (!files.length) return;
      e.preventDefault();
      void handleFiles(files);
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, []);
}

export function App() {
  const savedAt = useSaveStatus(TOOL_ID);
  const tab = usePreview((st) => st.data.tab);
  useFrame((st) => st.data);
  const withFiles = projectHasFiles();
  useStartup();
  useMediaSync();
  usePaste();
  useTestHook();

  const onNotify = (n: ProjectNotice) => {
    if (n.kind === 'saved') setStatus(S.status.projectSaved(n.fileName ?? ''), 'success');
    else if (n.kind === 'opened')
      setStatus(
        S.status.projectOpened(n.fileName ?? '') + (n.warnings ?? []).join(''),
        n.warnings ? 'warning' : 'success',
      );
    else if (n.kind === 'open-failed') setStatus(n.message ?? S.project.invalid, 'danger');
  };

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={USAGE}
      shortcuts={SHORTCUTS}
      headerActions={
        <ProjectMenu<ProjectData>
          toolId={TOOL_ID}
          version={PROJECT_VERSION}
          getData={() => projectData(withFiles)}
          getFiles={withFiles ? projectFiles : undefined}
          saveFileName={projectFileName}
          openAccept=".json,.zip,application/json,application/zip"
          confirmOpen={false}
          onLoad={(data, project, files, source) =>
            openProject(data, project.version, files, source.name)
          }
          onReset={() => void resetEverything()}
          resetText={{
            label: S.project.resetLabel,
            title: S.project.resetTitle,
            description: S.project.resetDescription,
            confirmLabel: S.project.resetConfirm,
          }}
          onNotify={onNotify}
          savedAt={savedAt}
          statusText={AUTOSAVE_OK ? undefined : S.status.noAutosave}
        />
      }
      settings={
        <TextGestureScope>
          <UsageSection persistKey="foreground-frame">{USAGE}</UsageSection>
          <Tabs<TabId>
            aria-label={S.tabsAria}
            value={tab}
            onValueChange={setTab}
            items={[
              { value: 'frame', label: S.tabs.frame, icon: <Frame />, content: <FramePanel /> },
              { value: 'deco', label: S.tabs.deco, icon: <Shapes />, content: <DecoPanel /> },
              { value: 'layers', label: S.tabs.layers, icon: <Layers />, content: <LayersPanel /> },
              {
                value: 'variants',
                label: S.tabs.variants,
                icon: <SwatchBook />,
                content: <VariantsPanel />,
              },
              {
                value: 'project',
                label: S.tabs.project,
                icon: <FolderCog />,
                content: <ProjectPanel />,
              },
            ]}
          />
          <WindowDrop onDrop={(files) => void handleFiles(files)} />
        </TextGestureScope>
      }
      preview={<Preview />}
    />
  );
}
