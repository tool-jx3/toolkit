/**
 * 圖塊地圖產生器：手動擺圖塊的 VTT 戰鬥地圖編輯器（圖層、圖塊組、畫筆／填滿／圖形、選取後搬動與轉向），
 * 匯出 PNG 與照實際尺寸分頁的列印用 PDF。參考 deukrezia／Trials 的功能改寫（程式未授權：只參考功能與數值）；
 * 內建圖塊是本站的簡易地形與 Kenney 的兩個 CC0 圖塊包。
 */
import { ProjectMenu, ToolShell } from '@/ui';
import { resetToSample } from './editor/actions';
import { Editor } from './editor/Editor';
import {
  applyProject,
  OPEN_ACCEPT,
  projectData,
  projectFileName,
  projectFiles,
} from './editor/files';
import { SHORTCUT_HELP } from './editor/keys';
import { DATA_VERSION, TOOL_ID, useEditor } from './editor/store';
import { S } from './strings';
import { Usage } from './Usage';

export function App() {
  const savedAt = useEditor((s) => s.savedAt);
  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={SHORTCUT_HELP}
      headerActions={
        <ProjectMenu
          toolId={TOOL_ID}
          version={DATA_VERSION}
          getData={projectData}
          getFiles={projectFiles}
          saveFileName={projectFileName}
          confirmOpen={false}
          openAccept={OPEN_ACCEPT}
          onLoad={(_data, file, files, source) => applyProject(file, files, source.name)}
          onReset={resetToSample}
          savedAt={savedAt}
          resetText={{
            label: S.project.resetLabel,
            title: S.project.resetTitle,
            description: S.project.resetText,
            confirmLabel: S.project.resetConfirm,
          }}
        />
      }
      body={<Editor />}
    />
  );
}
