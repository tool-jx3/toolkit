import { useEffect, useMemo } from 'react';
import { type Shortcut, ToolShell, useToast } from '@/ui';
import { previewTime, setEndHere, setStartHere, setToaster, togglePreview } from './actions';
import { Preview } from './Preview';
import { CropPanel, FormatGuide, FramesPanel, Landing, SizePanel, VideoPanel } from './panels';
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
    __videoAnim?: unknown;
  }
}

export function App() {
  const hasVideo = useSession((s) => !!s.video);

  /* 測試與對等驗證用 */
  useEffect(() => {
    window.__videoAnim = {
      session: () => {
        const { video, start, end, cropOn, crop, exporting } = useSession.getState();
        return { video, start, end, cropOn, crop, exporting };
      },
      settings: () => useSettings.getState().data,
    };
  }, []);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      {
        keys: 'space',
        label: S.keys.play,
        group: S.keys.group,
        handler: () => togglePreview(),
      },
      {
        keys: '[',
        label: S.keys.start,
        group: S.keys.group,
        handler: () => setStartHere(previewTime()),
      },
      {
        keys: ']',
        label: S.keys.end,
        group: S.keys.group,
        handler: () => setEndHere(previewTime()),
      },
    ],
    [],
  );

  /* 同一個 ToolShell（通知不會因為換版面而消失）：還沒載入影片時整頁是載入區，載入後是設定＋預覽兩欄 */
  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={USAGE}
      shortcuts={shortcuts}
      body={
        hasVideo ? undefined : (
          <>
            <ToastBridge />
            <Landing />
          </>
        )
      }
      settings={
        <>
          <ToastBridge />
          <VideoPanel />
          <CropPanel />
          <SizePanel />
          <FramesPanel />
          <FormatGuide />
        </>
      }
      preview={<Preview />}
    />
  );
}
