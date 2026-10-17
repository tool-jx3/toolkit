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
  withShortcut,
} from '@/ui';
import { sceneFor } from './client';
import { SettingsPanels } from './Panels';
import { Preview } from './Preview';
import { looksLikeSettings, type Settings, sanitizeSettings } from './settings';
import {
  DATA_VERSION,
  freshSettings,
  regenerate,
  settingsNow,
  TOOL_ID,
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
            onLoad={(d) => {
              if (!looksLikeSettings(d)) return false;
              useSettings.getState().replace(sanitizeSettings(d));
              clear();
              return true;
            }}
            onReset={() => useSettings.getState().replace(freshSettings())}
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
      preview={<Preview exportRef={exportRef} />}
    />
  );
}
