/**
 * 頁首的「專案」選單：存成專案檔（ZIP：設定＋圖片）、開啟（本工具的專案檔；原作的設定檔 JSON 也能開）、重設。
 */
import { strFromU8 } from 'fflate';
import { useSaveError, useSaveStatus } from '@/core/storage';
import { ProjectMenu, useToast } from '@/ui';
import { initialState } from './model';
import { applyLegacyConfig, importProject, isLegacyConfig, projectAssetIds } from './project';
import { assets, DATA_VERSION, replaceAll, scratchNow, TOOL_ID } from './store';
import { S } from './strings';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** 專案檔的檔名（不含副檔名）：刮刮卡_<年月日> */
export const projectFileBase = (now: Date): string =>
  `刮刮卡_${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}`;

/** 讀成 JSON（不是 JSON 時 undefined） */
function parseJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(strFromU8(bytes).replace(/^﻿/, ''));
  } catch {
    return undefined;
  }
}

export function ProjectActions() {
  const toast = useToast();
  const savedAt = useSaveStatus(TOOL_ID);
  const saveError = useSaveError(TOOL_ID);
  return (
    <ProjectMenu<unknown>
      toolId={TOOL_ID}
      version={DATA_VERSION}
      getData={() => scratchNow()}
      getFiles={() => assets.exportFiles(projectAssetIds(scratchNow()))}
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
        /* 圖片存不進瀏覽器：和「已開啟專案檔」合成一則 */
        return { warnings: [r.notSaved && S.imageNotSaved] };
      }}
      onForeignFile={async (_file, bytes) => {
        const json = parseJson(bytes);
        if (!isLegacyConfig(json)) return false;
        const r = await applyLegacyConfig(scratchNow(), json);
        replaceAll(r.state, { countAsDraw: true });
        const notes = [
          r.failed ? S.legacyFailed(r.failed) : '',
          r.dropped ? S.legacyDropped(r.dropped) : '',
          r.notSaved ? S.imageNotSaved : '',
        ].filter(Boolean);
        toast({
          title: S.legacyDone,
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
