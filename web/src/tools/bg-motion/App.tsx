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
import { Preview, type PreviewHandle } from './Preview';
import { ACCEPT, EffectTabs, ImagePanel, OutputPanel } from './panels';
import { TOOL_ID, useSession, useSettings } from './store';
import { S } from './strings';

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

  /* 測試與對等驗證用 */
  useEffect(() => {
    window.__bgMotion = {
      settings: () => useSettings.getState().data,
      images: () =>
        useSession.getState().images.map((i) => ({ name: i.name, w: i.width, h: i.height })),
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
          void pickFiles({ accept: ACCEPT, multiple: true }).then((files) => {
            if (files.length) void loadFiles(files);
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
        label: S.keys.export60,
        group: S.keys.group,
        handler: () => previewRef.current?.exportWith(60),
      },
      {
        keys: 'alt+shift+t',
        label: S.keys.theme,
        group: S.keys.group,
        handler: () => setTheme(getTheme() === 'dark' ? 'light' : 'dark'),
      },
    ],
    [],
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={USAGE}
      shortcuts={shortcuts}
      settings={
        <>
          <ToastBridge />
          <UsageSection persistKey="bg-motion">{USAGE}</UsageSection>
          <ImagePanel exportRef={exportRef} />
          <EffectTabs />
          <OutputPanel />
        </>
      }
      preview={<Preview ref={previewRef} exportRef={exportRef} />}
    />
  );
}
