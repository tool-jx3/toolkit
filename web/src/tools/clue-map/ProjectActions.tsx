/**
 * 頁首的「專案」選單：存成專案檔（有上傳的圖片時是 ZIP：設定＋圖片）、開啟專案檔、重設（回到範例）。
 */
import { useSaveError, useSaveStatus } from '@/core/storage';
import { ProjectMenu, useToast } from '@/ui';
import { importProject, projectAssetIds } from './project';
import { sampleState } from './sample';
import { assets, clueNow, DATA_VERSION, replaceAll, TOOL_ID } from './store';
import { S } from './strings';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 專案檔的檔名（不含副檔名）：調查熱點圖_<年月日> */
export const projectFileBase = (now: Date): string =>
  `${S.fileBase}_${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;

export function ProjectActions() {
  const toast = useToast();
  const savedAt = useSaveStatus(TOOL_ID);
  const saveError = useSaveError(TOOL_ID);
  return (
    <ProjectMenu<unknown>
      toolId={TOOL_ID}
      version={DATA_VERSION}
      getData={() => clueNow()}
      getFiles={() => assets.exportFiles(projectAssetIds(clueNow()))}
      fileNameFor={projectFileBase}
      openAccept=".zip,.json,application/zip,application/json"
      confirmOpen={{
        title: S.openConfirmTitle,
        description: S.openConfirmDesc,
        confirmLabel: S.openConfirmLabel,
      }}
      openedMessage={S.projectOpened}
      onLoad={async (data, _file, files) => {
        const r = await importProject(data, files);
        replaceAll(r.state);
        if (r.droppedSpots) toast({ title: S.spotsOver(r.droppedSpots), tone: 'warning' });
        /* 圖片存不進瀏覽器：和「已開啟專案檔」合成一則 */
        return { warnings: [r.notSaved && S.imageNotSaved] };
      }}
      onReset={() => replaceAll(sampleState())}
      resetText={{ title: S.resetTitle, description: S.resetDesc }}
      savedAt={savedAt}
      statusText={saveError ? S.saveFailed : undefined}
    />
  );
}
