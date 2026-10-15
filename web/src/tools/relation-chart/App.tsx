/**
 * 角色關係圖產生器：在畫布上擺角色、定義關係類型、拉關係線，排列後匯出成圖片或互動網頁。
 * 改編自 PaiTei4234 的 Relationship Chart Maker（CC BY-NC-SA 4.0，見同目錄的 UPSTREAM_LICENSE）。
 */
import { useSaveStatus } from '@/core/storage';
import { ProjectMenu, ToolShell, useToast } from '@/ui';
import { Editor } from './editor/Editor';
import { OPEN_ACCEPT, openForeign, openOwnProject, resetProject } from './editor/files';
import { SHORTCUT_HELP } from './editor/keys';
import { collectProjectFiles, projectDataForSave, takeSaveDropped } from './state/project';
import { DATA_VERSION, TOOL_ID } from './state/store';
import { S } from './strings';
import { Usage } from './Usage';

function Menu() {
  const savedAt = useSaveStatus(TOOL_ID);
  const toast = useToast();
  return (
    <ProjectMenu<unknown>
      toolId={TOOL_ID}
      version={DATA_VERSION}
      fileName={S.project.fileName}
      getData={projectDataForSave}
      getFiles={collectProjectFiles}
      onSaved={() => {
        const n = takeSaveDropped();
        if (n) toast({ title: S.project.saveDropped(n), tone: 'warning' });
      }}
      openAccept={OPEN_ACCEPT}
      openedMessage={S.project.opened}
      onLoad={(data, file, files) => openOwnProject(data, file.version, files)}
      onForeignFile={(_file, bytes) => openForeign(bytes)}
      onReset={resetProject}
      resetText={{
        label: S.project.resetLabel,
        title: S.project.resetTitle,
        description: S.project.resetText,
        confirmLabel: S.project.resetConfirm,
      }}
      savedAt={savedAt}
    />
  );
}

export function App() {
  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={SHORTCUT_HELP}
      headerActions={<Menu />}
      body={<Editor />}
    />
  );
}
