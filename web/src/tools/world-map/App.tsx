/**
 * 世界地圖產生器：畫地形（陸地、森林、山地、沙漠、雪原、濕地）、國與路線、城鎮等素材與地名，
 * 自動產生世界，匯出公開用／GM 用的 PNG，或送到地圖演出產生器。
 */
import { useSaveStatus } from '@/core/storage';
import { ProjectMenu, ToolShell } from '@/ui';
import * as act from './editor/actions';
import { notify } from './editor/actions';
import { Editor } from './editor/Editor';
import { openForeign, openProject, PROJECT_ACCEPT, projectFileName } from './editor/files';
import { SHORTCUT_HELP } from './editor/keys';
import { DATA_VERSION, docNow, TOOL_ID, useSaveHealth } from './editor/store';
import { S } from './strings';
import { Usage } from './Usage';

export function App() {
  const savedAt = useSaveStatus(TOOL_ID);
  const saveFailed = useSaveHealth((h) => h.failed);
  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      shortcuts={SHORTCUT_HELP}
      headerActions={
        <ProjectMenu
          toolId={TOOL_ID}
          version={DATA_VERSION}
          getData={docNow}
          saveFileName={projectFileName}
          confirmOpen={false}
          openAccept={PROJECT_ACCEPT}
          onNotify={(n) => {
            if (n.kind === 'saved') notify(S.msg.saved(n.fileName ?? ''), 'success');
            else if (n.kind === 'open-failed')
              notify(S.project.openFailed, 'danger', { description: n.message });
            else if (n.kind === 'opened') notify(S.project.opened, 'success');
          }}
          onLoad={(data) => openProject(data)}
          onForeignFile={(_file, bytes) => openForeign(bytes)}
          onReset={act.newBlank}
          savedAt={savedAt}
          statusText={saveFailed ? S.project.saveFailed : undefined}
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
