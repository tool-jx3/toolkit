/**
 * 頁首的「專案」選單（F06）：存成專案檔（有背景圖片時是 ZIP：project.json＋圖片）、開啟、重設。
 * 開啟時選到的不是本工具的專案檔、而是讀得懂的 JSON（卓準備カレンダー、taku_calendar…）時，改走讀入對話框。
 */
import { importAssetFiles } from '@/core/assets';
import { useSaveError, useSaveStatus } from '@/core/storage';
import { ProjectMenu } from '@/ui';
import { today } from './dates';
import { readImportFiles, useImport } from './ImportDialog';
import { normalizeData } from './model';
import { assets, calNow, DATA_VERSION, resetAll, TOOL_ID, useCal } from './store';
import { S } from './strings';

const pad2 = (n: number) => String(n).padStart(2, '0');

export function ProjectActions() {
  const savedAt = useSaveStatus(TOOL_ID);
  const saveError = useSaveError(TOOL_ID);
  return (
    <ProjectMenu<unknown>
      toolId={TOOL_ID}
      version={DATA_VERSION}
      getData={() => calNow()}
      getFiles={() => {
        const id = calNow().look.image.id;
        return id ? assets.exportFiles([id]) : Promise.resolve([]);
      }}
      openAccept=".json,.zip,application/json,application/zip"
      fileNameFor={(now) =>
        `${(calNow().title.trim() || '團期行事曆').replace(/[\\/:*?"<>|]/g, '_')}_${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`
      }
      confirmOpen={{
        title: S.project.openConfirmTitle,
        description: S.project.openConfirmDesc,
        confirmLabel: S.project.openConfirmLabel,
      }}
      openedMessage={S.project.opened}
      onLoad={async (data, _file, files) => {
        const next = normalizeData(data, today());
        if (!next) throw new Error(S.project.bad);
        const imported = await importAssetFiles(assets, files.entries());
        if (next.look.image.id && !(await assets.bitmap(next.look.image.id).catch(() => undefined)))
          throw new Error(S.project.missingImage);
        useCal.getState().replace(next);
        return { warnings: [imported.notPersisted > 0 && S.look.imageNotSaved] };
      }}
      onForeignFile={async (file) => {
        try {
          const pending = await readImportFiles([file]);
          useImport.setState({ pending });
          return true;
        } catch {
          return false;
        }
      }}
      onReset={() => {
        resetAll();
        void assets.clear();
      }}
      resetText={{ title: S.project.resetTitle, description: S.project.resetDesc }}
      savedAt={savedAt}
      statusText={saveError ? S.project.saveFailed : undefined}
    />
  );
}
