/**
 * 斷面圖產生器：建築從側面切開的斷面圖（地上與地下的樓層、區域、電梯與樓梯、側面的設備與家具），
 * 四種環境與淹水、GM 用／PL 用（祕密區域偽裝），匯出 PNG（含 VTT 的格子、事件前後兩張）。
 */
import { useSaveStatus } from '@/core/storage';
import { ProjectMenu, ToolShell } from '@/ui';
import * as act from './editor/actions';
import { notify } from './editor/actions';
import { Editor } from './editor/Editor';
import { openForeign, openProject, PROJECT_ACCEPT, projectFileName } from './editor/files';
import { SHORTCUT_HELP } from './editor/keys';
import { DATA_VERSION, docNow, TOOL_ID } from './editor/store';
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
