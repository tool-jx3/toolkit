import {
  Dices,
  Image,
  LayoutTemplate,
  RectangleHorizontal,
  Redo2,
  Type,
  Undo2,
} from 'lucide-react';
import { useEffect } from 'react';
import { roomUrlFrom } from '@/ccfolia';
import { localFontNames } from '@/core/css';
import { resetToolStore, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  ObsGuide,
  ProjectMenu,
  type Shortcut,
  Tabs,
  ToolShell,
  UsageSection,
} from '@/ui';
import { buildMessageBoxCss } from './css';
import { Preview } from './Preview';
import {
  applyTemplateById,
  BasicPanel,
  BoxPanel,
  ChatWindowLink,
  NamePanel,
  PortraitPanel,
  ROOM_FIELD_ID,
  TextPanel,
} from './panels';
import { loadCustomPortrait, refreshPortraits, roomScene, sendFirstSample } from './preview';
import {
  type MbSettings,
  normalizeSettings,
  projectFileName,
  TOOL_ID,
  usedFonts,
} from './settings';
import {
  type MbPreview,
  normalizePreview,
  PREVIEW_DEFAULTS,
  setStatus,
  usePreview,
  useSettings,
} from './store';
import { S } from './strings';
import { isKnownTemplate } from './templates';

/** 專案檔的內容：設定＋預覽設定（自己的範例立繪不含在內） */
interface ProjectData {
  settings: MbSettings;
  preview: Pick<MbPreview, 'background' | 'shape' | 'before'>;
}

const TAB_IDS = ['basic', 'box', 'name', 'text', 'portrait'] as const;

function Usage() {
  const s = useSettings((st) => st.data);
  const fonts = localFontNames(usedFonts(s));
  return (
    <>
      <p>
        把 CCFOLIA 房間畫面下方、有人發言時跳出來的訊息框（立繪、名稱、骰子結果、逐字打出的台詞）
        改成自己喜歡的樣子，放在直播畫面上。房間的盤面、棋子、聊天欄全部隱藏、背景透明，畫面上只看得到訊息框。
      </p>
      <ol className="mt-2">
        <li>在「基本」選一個範本當起點，按「套用」；再依喜好調整方框、名稱、內文、立繪。</li>
        <li>填 CCFOLIA 的房間網址，設定 OBS 瀏覽器來源的寬高（預覽就是這個大小）。</li>
        <li>按預覽下方的「複製 CSS」，照下面的步驟貼進 OBS。</li>
      </ol>
      <ObsGuide
        className="mt-3"
        urlLabel={S.obsUrlLabel}
        url={roomUrlFrom(s.room)}
        size={{ width: s.width, height: s.height }}
        login="swap-url"
        audio
        localFonts={fonts.length ? fonts : true}
        extraSteps={['盤面與棋子都消失、畫面上什麼都沒有就是成功了；等有人發言，訊息框就會出現。']}
        disclaimer={S.disclaimer}
      />
      <h3 className="mt-4 mb-1 text-sm font-semibold">顯示的規則（CCFOLIA 決定）</h3>
      <ul>
        <li>只顯示來源載入之後的發言；剛開 OBS 或重新整理來源後，要等下一則發言才會出現。</li>
        <li>發言會排隊、一則一則打出來；最後一則會一直留著，直到按關閉。</li>
        <li>
          要讓訊息框消失：在 OBS 的來源上按右鍵 →「互動」，滑鼠移到訊息框上按關閉；
          或在來源屬性按「重新整理目前頁面的快取」。在自己的 CCFOLIA 畫面上關掉，不會影響 OBS 裡的。
        </li>
        <li>
          骰子圖只在房間設定開了「旧ダイス演出を利用する」（舊式骰子演出）時才有；沒開時 3D
          骰子在盤面上滾，盤面被隱藏所以看不到。
        </li>
      </ul>
      <h3 className="mt-4 mb-1 text-sm font-semibold">想讓觀眾看到骰出的點數</h3>
      <p>
        訊息框只放得進骰子結果最後的「＞
        …」部分。建議台詞用訊息框，點數另外開一個聊天畫面（房間網址＋/chat）的瀏覽器來源， 用{' '}
        <ChatWindowLink /> 的單則骰子顯示，放在訊息框旁邊（立繪的另一側）。
      </p>
      <h3 className="mt-4 mb-1 text-sm font-semibold">疑難排解</h3>
      <ul>
        <li>
          畫面全空：先確認來源重新載入後有人發言過；把自訂 CSS
          清空看看，如果連房間都看不到，就是還沒登入。
        </li>
        <li>出現登入畫面：照上面的登入步驟，在「互動」視窗裡登入一次。</li>
        <li>立繪頂端被切掉：把來源的高度加大，或降低「立繪高度上限」。</li>
        <li>
          用電腦字型時，跑 OBS
          的那台電腦也要安裝同一套字型；沒有安裝時會換成一般字型，字型沒有的漢字也會換成一般黑體。
        </li>
      </ul>
    </>
  );
}

declare global {
  interface Window {
    __messageBox?: unknown;
  }
}

export function App() {
  const { undo, redo, canUndo, canRedo, clear } = useUndoRedo(useSettings);
  const savedAt = useSaveStatus(TOOL_ID);
  const tab = usePreview((st) => st.data.tab);
  const shape = usePreview((st) => st.data.shape);
  const fileName = useSettings((st) => st.data.fileName);

  /* 開頁：讀回自訂立繪、送出第一則範例（F64）、狀態列顯示就緒 */
  useEffect(() => {
    sendFirstSample();
    void loadCustomPortrait();
    setStatus('');
  }, []);

  /* 範例立繪形狀改變時，畫面上那則訊息的立繪立即更換（F58） */
  // biome-ignore lint/correctness/useExhaustiveDependencies: shape 只用來觸發
  useEffect(() => {
    refreshPortraits();
  }, [shape]);

  /* 測試與除錯用 */
  useEffect(() => {
    window.__messageBox = {
      scene: roomScene,
      settings: () => useSettings.getState().data,
      preview: () => usePreview.getState().data,
      set: (patch: Partial<MbSettings>) => useSettings.getState().patch(patch),
      applyTemplate: applyTemplateById,
      css: () => buildMessageBoxCss(useSettings.getState().data),
      history: () => useSettings.temporal.getState().pastStates.length,
    };
  }, []);

  const tabValue = (TAB_IDS as readonly string[]).includes(tab) ? tab : 'basic';
  const setTab = (v: string) => usePreview.getState().patch({ tab: v });

  const goToRoom = () => {
    setTab('basic');
    requestAnimationFrame(() => {
      const el = document.getElementById(ROOM_FIELD_ID);
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el?.focus({ preventScroll: true });
    });
  };

  const shortcuts: Shortcut[] = [
    { keys: 'mod+z', label: S.undo, group: '編輯', handler: undo },
    { keys: ['mod+y', 'shift+mod+z'], label: S.redo, group: '編輯', handler: redo },
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
            label={`${S.undo}（Ctrl＋Z）`}
            icon={<Undo2 />}
            onClick={undo}
            disabled={!canUndo}
          />
          <IconButton
            label={`${S.redo}（Ctrl＋Y）`}
            icon={<Redo2 />}
            onClick={redo}
            disabled={!canRedo}
          />
          <ProjectMenu<ProjectData>
            toolId={TOOL_ID}
            getData={() => {
              const p = usePreview.getState().data;
              return {
                settings: useSettings.getState().data,
                preview: { background: p.background, shape: p.shape, before: p.before },
              };
            }}
            onLoad={(data, _project, _files, file) => {
              const raw = (data && typeof data === 'object' ? data : {}) as Partial<ProjectData>;
              useSettings.getState().replace(normalizeSettings(raw.settings, isKnownTemplate));
              clear();
              const cur = usePreview.getState().data;
              usePreview.getState().replace(normalizePreview({ ...cur, ...(raw.preview ?? {}) }));
              setStatus(S.projectOpened(file.name), 'success');
            }}
            onLoadError={(msg) => setStatus(S.projectError(msg), 'danger')}
            onSaved={(name) => setStatus(S.projectSaved(name), 'success')}
            onReset={() => {
              resetToolStore(useSettings);
              usePreview
                .getState()
                .replace({ ...PREVIEW_DEFAULTS, tab: usePreview.getState().data.tab });
              setStatus(S.resetDone, 'success');
            }}
            resetConfirm={{
              title: S.resetTitle,
              description: S.resetDescription,
              confirmLabel: S.resetConfirm,
            }}
            resetLabel={S.resetMenu}
            savedAt={savedAt}
            exactFileName={projectFileName(fileName)}
          />
        </>
      }
      settings={
        <>
          <UsageSection persistKey={TOOL_ID}>{usage}</UsageSection>
          <Tabs
            aria-label={S.tabsLabel}
            value={tabValue}
            onValueChange={setTab}
            items={[
              {
                value: 'basic',
                label: S.tabs.basic,
                icon: <LayoutTemplate />,
                content: <BasicPanel />,
              },
              {
                value: 'box',
                label: S.tabs.box,
                icon: <RectangleHorizontal />,
                content: <BoxPanel />,
              },
              { value: 'name', label: S.tabs.name, icon: <Dices />, content: <NamePanel /> },
              { value: 'text', label: S.tabs.text, icon: <Type />, content: <TextPanel /> },
              {
                value: 'portrait',
                label: S.tabs.portrait,
                icon: <Image />,
                content: <PortraitPanel />,
              },
            ]}
          />
        </>
      }
      preview={<Preview onGoToRoom={goToRoom} />}
    />
  );
}
