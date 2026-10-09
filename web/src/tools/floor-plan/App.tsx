/**
 * 室內平面圖產生器：探索場景用的室內平面圖（房間、門窗、家具，自動產生牆壁），
 * GM 專用與隱藏線索、多樓層、匯出 PNG。
 */
import { FileInput } from 'lucide-react';
import { useSaveStatus } from '@/core/storage';
import { ProjectMenu, ProjectMenuItem, ToolShell } from '@/ui';
import { fileBase, newMap, notify } from './editor/actions';
import { Editor } from './editor/Editor';
import {
  importLegacyFile,
  notifyOpenFailed,
  OPEN_ACCEPT,
  openForeign,
  openProject,
} from './editor/files';
import { SHORTCUT_HELP } from './editor/keys';
import { DATA_VERSION, TOOL_ID, useProject } from './editor/store';
import { S } from './strings';
import { Usage } from './Usage';

export function App() {
  const savedAt = useSaveStatus(TOOL_ID);
  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={SHORTCUT_HELP}
      headerActions={
        <ProjectMenu
          toolId={TOOL_ID}
          version={DATA_VERSION}
          getData={() => useProject.getState().data}
          saveFileName={() => `${fileBase(useProject.getState().data.name)}.floor-plan.json`}
          confirmOpen={false}
          openAccept={OPEN_ACCEPT}
          onNotify={(n) => {
            if (n.kind === 'saved') notify(S.msg.saved(n.fileName ?? ''), 'success');
            else if (n.kind === 'open-failed') notifyOpenFailed(n.message);
          }}
          onLoad={(_data, file) => openProject(file)}
          onForeignFile={(_file, bytes) => openForeign(bytes)}
          onReset={newMap}
          savedAt={savedAt}
          resetText={{
            label: S.project.resetLabel,
            title: S.project.resetTitle,
            description: S.project.resetText,
            confirmLabel: S.project.resetConfirm,
          }}
          extraItems={
            <ProjectMenuItem icon={<FileInput />} onSelect={() => void importLegacyFile()}>
              {S.project.import}
            </ProjectMenuItem>
          }
        />
      }
      body={<Editor />}
    />
  );
}
