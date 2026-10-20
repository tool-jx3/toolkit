import { useEffect, useMemo, useRef } from 'react';
import { pickFiles } from '@/core/files';
import {
  type ExportPanelHandle,
  getTheme,
  type Shortcut,
  setTheme,
  ToolShell,
  UsageSection,
  useToast,
} from '@/ui';
import { loadFiles, setToaster } from './actions';
import { DeckHeaderActions, DeckSaveErrorNotice } from './DeckHeader';
import { DeckGlobalSection, DeckImagesSection, ModeSwitch } from './DeckPanels';
import { DeckPreview } from './DeckPreview';
import { DECK_FPS } from './deck';
import { addDeckImages } from './deckActions';
import { deckDebug } from './deckDebug';
import { assets, historyStep, referencedImages } from './deckStore';
import { Preview, type PreviewHandle } from './Preview';
import { ACCEPT, EffectTabs, ImagePanel, OutputPanel } from './panels';
import { TOOL_ID, useSession, useSettings } from './store';
import { DECK, S } from './strings';

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

const DECK_USAGE = (
  <>
    <ol>
      {DECK.usage.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ol>
    <p>{S.about}</p>
  </>
);

/** 開頁約 5 秒後整理一次圖片庫：以前留下、目前的狀態與復原紀錄都沒用到的圖才刪（這次開頁放進來的不刪） */
function useAssetCleanup() {
  useEffect(() => {
    const t = setTimeout(() => {
      void assets.gcStale(referencedImages()).catch(() => undefined);
    }, 5000);
    return () => clearTimeout(t);
  }, []);
}

/** 把 ToolShell 裡的 toast 交給 actions（狀態更新的地方不一定在元件裡） */
function ToastBridge() {
  const toast = useToast();
  useEffect(() => {
    setToaster(toast);
    return () => setToaster(null);
  }, [toast]);
  return null;
}

declare global {
  interface Window {
    __bgMotion?: unknown;
  }
}

export function App() {
  const exportRef = useRef<ExportPanelHandle>(null);
  const previewRef = useRef<PreviewHandle>(null);
  const mode = useSettings((st) => st.data.mode);
  useAssetCleanup();

  /* 測試與對等驗證用 */
  useEffect(() => {
    window.__bgMotion = {
      settings: () => useSettings.getState().data,
      images: () =>
        useSession.getState().images.map((i) => ({ name: i.name, w: i.width, h: i.height })),
      /* 圖片切換模式的內容 */
      ...deckDebug(),
      seek: (t: number) => previewRef.current?.seek(t),
      get time() {
        return previewRef.current?.time ?? 0;
      },
      get playing() {
        return previewRef.current?.playing ?? false;
      },
    };
  }, []);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      {
        keys: ['mod+shift+o', 'alt+shift+o'],
        label: S.keys.open,
        group: S.keys.group,
        handler: () => {
          if (useSession.getState().exporting) return;
          const deck = useSettings.getState().data.mode === 'deck';
          void pickFiles({ accept: deck ? 'image/*' : ACCEPT, multiple: true }).then((files) => {
            if (!files.length) return;
            if (deck) void addDeckImages(files);
            else void loadFiles(files);
          });
        },
      },
      {
        keys: ['mod+shift+p', 'alt+shift+p'],
        label: S.keys.play,
        group: S.keys.group,
        handler: () => previewRef.current?.toggle(),
      },
      /* Ctrl＋Shift＋W／T 是瀏覽器保留的組合（關視窗、重開分頁），只用 Alt＋Shift */
      {
        keys: 'alt+shift+w',
        label: S.keys.export24,
        group: S.keys.group,
        handler: () => previewRef.current?.exportWith(24),
      },
      {
        keys: ['mod+shift+f', 'alt+shift+f'],
        label: S.keys.export30,
        group: S.keys.group,
        handler: () => previewRef.current?.exportWith(30),
      },
      {
        keys: ['mod+shift+a', 'alt+shift+a'],
        label: mode === 'deck' ? DECK.keyExportMax(DECK_FPS[DECK_FPS.length - 1]) : S.keys.export60,
        group: S.keys.group,
        handler: () => previewRef.current?.exportWith(60),
      },
      {
        keys: 'alt+shift+t',
        label: S.keys.theme,
        group: S.keys.group,
        handler: () => setTheme(getTheme() === 'dark' ? 'light' : 'dark'),
      },
      /* 圖片切換模式的復原／重做（動態效果模式沒有） */
      {
        keys: 'mod+z',
        label: DECK.undo,
        group: DECK.groupEdit,
        handler: () => {
          if (useSettings.getState().data.mode === 'deck') historyStep('undo');
        },
      },
      {
        keys: ['shift+mod+z', 'mod+y'],
        label: DECK.redo,
        group: DECK.groupEdit,
        handler: () => {
          if (useSettings.getState().data.mode === 'deck') historyStep('redo');
        },
      },
    ],
    [mode],
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={mode === 'deck' ? DECK_USAGE : USAGE}
      shortcuts={shortcuts}
      headerActions={mode === 'deck' ? <DeckHeaderActions /> : undefined}
      settings={
        <>
          <ToastBridge />
          <ModeSwitch />
          <UsageSection persistKey="bg-motion">{mode === 'deck' ? DECK_USAGE : USAGE}</UsageSection>
          {mode === 'deck' ? (
            <>
              <DeckSaveErrorNotice />
              <DeckImagesSection />
              <DeckGlobalSection />
            </>
          ) : (
            <>
              <ImagePanel exportRef={exportRef} />
              <EffectTabs />
              <OutputPanel />
            </>
          )}
        </>
      }
      preview={
        mode === 'deck' ? (
          <DeckPreview ref={previewRef} exportRef={exportRef} />
        ) : (
          <Preview ref={previewRef} exportRef={exportRef} />
        )
      }
    />
  );
}
