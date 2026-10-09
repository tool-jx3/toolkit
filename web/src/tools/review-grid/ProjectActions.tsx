/**
 * 頁首的「專案」選單：存成專案檔（ZIP：設定＋圖片）、開啟（本工具的專案檔；原作的資料備份 JSON 也能開）、重設。
 */
import { safeFileName } from '@/core/files';
import { useSaveError, useSaveStatus } from '@/core/storage';
import { ProjectMenu, useToast } from '@/ui';
import { openLegacyFile } from './legacyImport';
import { initialState } from './model';
import { importProject, projectAssetIds } from './project';
import { assets, DATA_VERSION, replaceAll, reviewNow, TOOL_ID } from './store';
import { S } from './strings';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 專案檔的檔名（不含副檔名）：劇本心得_<暱稱>_<日期> */
export function projectFileBase(name: string, now: Date): string {
  const date = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;
  const who = safeFileName(name.trim(), { fallback: '', maxLength: 30 });
  return who ? `劇本心得_${who}_${date}` : `劇本心得_${date}`;
}

export function ProjectActions() {
  const toast = useToast();
  const savedAt = useSaveStatus(TOOL_ID);
  const saveError = useSaveError(TOOL_ID);
  return (
    <ProjectMenu<unknown>
      toolId={TOOL_ID}
      version={DATA_VERSION}
      getData={() => reviewNow()}
      getFiles={() => assets.exportFiles(projectAssetIds(reviewNow()))}
      fileNameFor={(now) => projectFileBase(reviewNow().profile.name, now)}
      confirmOpen={{
        title: S.openConfirmTitle,
        description: S.openConfirmDesc,
        confirmLabel: S.openConfirmLabel,
      }}
      openedMessage={S.projectOpened}
      onLoad={async (data, _file, files) => {
        const r = await importProject(data, files);
        replaceAll(r.state);
        /* 圖片存不進瀏覽器：和「已開啟專案檔」合成一則 */
        return { warnings: [r.notSaved && S.imageNotSaved] };
      }}
      onForeignFile={async (_file, bytes) => {
        const r = await openLegacyFile(bytes);
        if (!r) return false;
        const notes = [
          r.failed ? S.legacyFailedImages(r.failed) : '',
          r.dropped ? S.legacyDropped(r.dropped) : '',
          r.notSaved ? S.imageNotSaved : '',
        ].filter(Boolean);
        toast({
          title: S.legacyDone(r.cells),
          description: notes.length ? notes.join('') : undefined,
          tone: notes.length ? 'warning' : 'success',
        });
        return true;
      }}
      onReset={() => replaceAll(initialState())}
      resetText={{ title: S.resetTitle, description: S.resetDesc }}
      savedAt={savedAt}
      statusText={saveError ? S.saveFailed : undefined}
    />
  );
}
