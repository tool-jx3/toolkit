/**
 * 狀態條產生器：把 CCFOLIA 的角色狀態頁改造成直播用的狀態條（OBS 瀏覽器來源的自訂 CSS）。
 */
import {
  Clapperboard,
  Image,
  LayoutList,
  Redo2,
  RotateCcw,
  Shapes,
  SlidersHorizontal,
  Tag,
  Type,
  Undo2,
  Users,
} from 'lucide-react';
import { useEffect } from 'react';
import { localFontNames } from '@/core/css';
import { useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  Button,
  IconButton,
  ObsGuide,
  ProjectMenu,
  type Shortcut,
  Tabs,
  ToolShell,
  UsageSection,
  useConfirmedReset,
  withShortcut,
} from '@/ui';
import { measureTarget, previewCss } from './actions';
import { TextGestureScope } from './controls';
import { buildStatusBarCss, effectsNeedingObs31, usedFonts } from './css';
import { estimateSourceSize } from './geometry';
import { cssTargetFor, previewCharacter, projectFileName } from './logic';
import { Preview } from './Preview';
import { AvatarPanel } from './panels/AvatarPanel';
import { BarPanel } from './panels/BarPanel';
import { CharactersPanel } from './panels/CharactersPanel';
import { DecoPanel } from './panels/DecoPanel';
import { EffectsPanel } from './panels/EffectsPanel';
import { LayoutPanel } from './panels/LayoutPanel';
import { NamePanel } from './panels/NamePanel';
import { TextPanel } from './panels/TextPanel';
import {
  normalizePreview,
  normalizeSettings,
  type PreviewData,
  type Settings,
  TOOL_ID,
} from './settings';
import { resetEverything, setStatus, usePreview, useSession, useSettings } from './store';
import { S } from './strings';
import { applyStatusTemplate, TEMPLATE_IDS, TEMPLATES } from './templates';

interface ProjectData {
  settings: Settings;
  preview: PreviewData;
}

function Usage() {
  const s = useSettings((st) => st.data);
  const target = usePreview((st) => st.data.target);
  const c = previewCharacter(s, target);
  const t = cssTargetFor(s, c);
  const size = useSession((st) => st.size) ?? estimateSourceSize(s, { name: t.name });
  const effects = effectsNeedingObs31(s);
  return (
    <>
      <ol>
        <li>在「排列」選一個範本當起點，再依喜好調整各分頁的設定；預覽會即時反映。</li>
        <li>
          到「角色」貼上 CCFOLIA 的房間網址，新增角色並填好名稱、顏色與角色 ID。每個角色各自一份
          CSS、一個瀏覽器來源。
        </li>
        <li>按「複製 CSS」，照下面的步驟貼到 OBS 的瀏覽器來源。</li>
      </ol>
      <ObsGuide
        urlLabel="角色狀態頁的網址"
        url={t.url}
        size={size}
        multipleSources
        obs={effects.length ? { version: 31, features: effects } : null}
        localFonts={localFontNames(usedFonts(s, t))}
      >
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-muted">
          <li>瀏覽器來源的寬高請以預覽下方顯示的「來源大小」為準。</li>
          <li>CCFOLIA 角色「狀態」由上而下的順序，就是這裡第 1、2…條的顏色與設定。</li>
          <li>在 CCFOLIA 聊天欄輸入「:HP-3」「:SAN=45」這類指令改數值，OBS 上的條會立刻跟著動。</li>
          <li>角色被設為「隱藏狀態」時，除了持有者以外看不到狀態列，OBS 上也會是空的。</li>
          <li>角色 ID：在盤面的棋子上按右鍵 →「Copy Id (for dev)」，也可以直接貼棋子的網址。</li>
        </ul>
      </ObsGuide>
      <p className="mt-3">設定會自動儲存在這個瀏覽器；也可以從「專案」存成檔案，搬到別台電腦。</p>
    </>
  );
}

declare global {
  interface Window {
    __statusBar?: unknown;
  }
}

/** 全部重來（F117）：確認後回到初始狀態並清空復原紀錄（要在 ToolShell 裡面才拿得到確認對話框） */
function ResetAllButton() {
  const confirmReset = useConfirmedReset(S.resetConfirm);
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={<RotateCcw />}
      onClick={() =>
        confirmReset(() => {
          resetEverything();
          setStatus(S.status.reset, 'info');
        })
      }
    >
      {S.resetAll}
    </Button>
  );
}

export function App() {
  const { undo, redo, canUndo, canRedo, clear } = useUndoRedo(useSettings);
  const savedAt = useSaveStatus(TOOL_ID);
  const tab = usePreview((st) => st.data.tab);
  const fileName = useSettings((st) => st.data.fileName);

  /* 測試與對等驗證用 */
  useEffect(() => {
    window.__statusBar = {
      settings: useSettings,
      preview: usePreview,
      buildStatusBarCss,
      previewCss,
      measureTarget,
      cssTargetFor,
      normalizeSettings,
      applyStatusTemplate,
      templates: TEMPLATES,
    };
  }, []);

  const shortcuts: Shortcut[] = [
    { keys: 'mod+z', label: S.shortcuts.undo, group: S.shortcuts.group, handler: undo },
    {
      keys: ['shift+mod+z', 'mod+y'],
      label: S.shortcuts.redo,
      group: S.shortcuts.group,
      handler: redo,
    },
  ];

  const usage = <Usage />;

  return (
    <ToolShell
      toolId={TOOL_ID}
      shortcuts={shortcuts}
      usage={usage}
      headerActions={
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
          <ProjectMenu<ProjectData>
            toolId={TOOL_ID}
            getData={() => ({
              settings: useSettings.getState().data,
              preview: usePreview.getState().data,
            })}
            onLoad={(d, _project, _files, file) => {
              const raw = d as unknown as Record<string, unknown>;
              const settings = normalizeSettings(raw?.settings ?? raw, TEMPLATE_IDS);
              useSettings.getState().replace(settings);
              clear();
              if (raw?.preview) usePreview.getState().replace(normalizePreview(raw.preview));
              setStatus(S.status.opened(file.name), 'success');
            }}
            onReset={() => useSettings.getState().reset()}
            savedAt={savedAt}
            exactFileName={projectFileName(fileName)}
          />
          <ResetAllButton />
        </>
      }
      settings={
        <TextGestureScope>
          <UsageSection persistKey={TOOL_ID}>{usage}</UsageSection>
          <Tabs
            aria-label={S.tabsLabel}
            value={tab}
            onValueChange={(v) => usePreview.getState().patch({ tab: v })}
            items={[
              {
                value: 'layout',
                label: S.tabs.layout,
                icon: <LayoutList />,
                content: <LayoutPanel />,
              },
              { value: 'avatar', label: S.tabs.avatar, icon: <Image />, content: <AvatarPanel /> },
              {
                value: 'bar',
                label: S.tabs.bar,
                icon: <SlidersHorizontal />,
                content: <BarPanel />,
              },
              { value: 'text', label: S.tabs.text, icon: <Type />, content: <TextPanel /> },
              { value: 'name', label: S.tabs.name, icon: <Tag />, content: <NamePanel /> },
              {
                value: 'effects',
                label: S.tabs.effects,
                icon: <Clapperboard />,
                content: <EffectsPanel />,
              },
              { value: 'deco', label: S.tabs.deco, icon: <Shapes />, content: <DecoPanel /> },
              {
                value: 'characters',
                label: S.tabs.characters,
                icon: <Users />,
                content: <CharactersPanel />,
              },
            ]}
          />
        </TextGestureScope>
      }
      preview={
        <TextGestureScope>
          <Preview />
        </TextGestureScope>
      }
    />
  );
}
