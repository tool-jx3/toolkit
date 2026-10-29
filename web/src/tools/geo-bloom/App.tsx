/**
 * 幾何花紋產生器：從中央的圓長出線條、子圖形與點的幾何花紋，依種子重現，匯出 PNG 或 SVG。
 * 規格：docs/refactor/specs/geo-bloom.md。靈感來源：al1scut/tkmizGeo（未授權：只參考功能、數值與做法）。
 */
import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  type ExportPanelHandle,
  IconButton,
  ProjectMenu,
  type Shortcut,
  ToolShell,
  UsageSection,
  useToast,
  withShortcut,
} from '@/ui';
import { sceneFor } from './client';
import { DecodeDialog, DecodeWindowDrop } from './Decode';
import { SettingsPanels } from './Panels';
import { Preview } from './Preview';
import { looksLikeSettings, type Settings, upgradeSettings } from './settings';
import {
  DATA_VERSION,
  regenerate,
  resetSettings,
  settingsNow,
  TOOL_ID,
  takeLegacyRestore,
  useSettings,
} from './store';
import { S } from './strings';

declare global {
  interface Window {
    /** 測試與對等驗證用 */
    __geoBloom?: unknown;
  }
}

function Usage() {
  return (
    <ul className="m-0 flex flex-col gap-1.5 pl-5">
      {S.usage.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
  );
}

/** 讀回的自動儲存是改版前的：通知一次（3.8、D20；通知要在 ToolShell 裡面） */
function LegacyRestoreNotice() {
  const toast = useToast();
  useEffect(() => {
    if (takeLegacyRestore())
      toast({ title: S.legacyTitle, description: S.legacyChange, tone: 'info', duration: 12000 });
  }, [toast]);
  return null;
}

export function App() {
  const { undo, redo, canUndo, canRedo, clear } = useUndoRedo(useSettings);
  const savedAt = useSaveStatus(TOOL_ID);
  const exportRef = useRef<ExportPanelHandle>(null);

  useEffect(() => {
    window.__geoBloom = { useSettings, settingsNow, sceneFor };
  }, []);

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { keys: 'space', label: S.generate, group: S.generateGroup, handler: regenerate },
      { keys: 'mod+z', label: S.undo, group: S.keysGroup, handler: undo },
      { keys: ['shift+mod+z', 'mod+y'], label: S.redo, group: S.keysGroup, handler: redo },
    ],
    [undo, redo],
  );

  const usage = <Usage />;
  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={usage}
      shortcuts={shortcuts}
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
          <ProjectMenu<Settings>
            toolId={TOOL_ID}
            version={DATA_VERSION}
            getData={() => useSettings.getState().data}
            onLoad={(d, file) => {
              if (!looksLikeSettings(d)) return false;
              /* 舊的資料版本（1）補舊版的值；畫法改了，同一個種子畫出來和以前不同，通知一次（3.8、D20） */
              useSettings.getState().replace(upgradeSettings(d, file.version));
              clear();
              return file.version < DATA_VERSION ? { warnings: [S.legacyNotice] } : true;
            }}
            onReset={resetSettings}
            savedAt={savedAt}
            fileName={S.projectName}
            resetText={{
              label: S.resetLabel,
              title: S.resetTitle,
              description: S.resetDescription,
            }}
          />
        </>
      }
      settings={
        <>
          <SettingsPanels />
          <UsageSection persistKey={TOOL_ID}>{usage}</UsageSection>
        </>
      }
      preview={
        <>
          <Preview exportRef={exportRef} />
          <DecodeDialog />
          <DecodeWindowDrop />
          <LegacyRestoreNotice />
        </>
      }
    />
  );
}
