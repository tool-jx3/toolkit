/**
 * 頁首的「專案」選單：存成專案檔、開啟（本工具的專案檔；原作 R 的專案 JSON 也能開）、重設，
 * 以及「貼上原作的備份碼…」（原作 Q 的全部專案備份；規格 F46、3.9）。
 */
import { ClipboardPaste } from 'lucide-react';
import { useState } from 'react';
import { useSaveError, useSaveStatus } from '@/core/storage';
import {
  Button,
  Dialog,
  DialogClose,
  Field,
  ProjectMenu,
  ProjectMenuItem,
  TextArea,
  useToast,
} from '@/ui';
import { LegacyFileError } from './legacy';
import { type LegacyResult, openBackupCode, openRelationFile } from './legacyImport';
import { initialState } from './model';
import { importProject, projectAssetIds } from './project';
import { assets, chartNow, DATA_VERSION, replaceAll, TOOL_ID } from './store';
import { S } from './strings';

/** 讀入原作的檔案之後的通知（讀不了的圖片、超過上限、存不進瀏覽器另外說明） */
function useLegacyToast() {
  const toast = useToast();
  return (r: LegacyResult) => {
    const notes = [
      r.failed ? S.legacyFailedImages(r.failed) : '',
      r.dropped ? S.legacyDropped(r.dropped) : '',
      r.notSaved ? S.imageNotSaved : '',
    ].filter(Boolean);
    toast({
      title:
        r.kind === 'relation'
          ? S.legacyRelationDone(r.characters, r.links)
          : S.legacyBackupDone(r.characters, r.pages),
      description: notes.length ? notes.join('') : undefined,
      tone: notes.length ? 'warning' : 'success',
    });
  };
}

export function ProjectActions() {
  const savedAt = useSaveStatus(TOOL_ID);
  const saveError = useSaveError(TOOL_ID);
  const done = useLegacyToast();
  const [backupOpen, setBackupOpen] = useState(false);
  return (
    <>
      <ProjectMenu<unknown>
        toolId={TOOL_ID}
        version={DATA_VERSION}
        getData={() => chartNow()}
        getFiles={() => assets.exportFiles(projectAssetIds(chartNow()))}
        confirmOpen={{
          title: S.openConfirmTitle,
          description: S.openConfirmDesc,
          confirmLabel: S.openConfirmLabel,
        }}
        openedMessage={S.projectOpened}
        onLoad={async (data, _file, files) => {
          replaceAll(await importProject(data, files));
          return true;
        }}
        onForeignFile={async (_file, bytes) => {
          const r = await openRelationFile(bytes);
          if (!r) return false;
          done(r);
          return true;
        }}
        onReset={() => replaceAll(initialState())}
        resetText={{ title: S.resetTitle, description: S.resetDesc }}
        savedAt={savedAt}
        statusText={saveError ? S.saveFailed : undefined}
        extraItems={
          <ProjectMenuItem icon={<ClipboardPaste />} onSelect={() => setBackupOpen(true)}>
            {S.backupMenu}
          </ProjectMenuItem>
        }
      />
      {backupOpen ? (
        <BackupDialog
          onClose={() => setBackupOpen(false)}
          onDone={(r) => {
            setBackupOpen(false);
            done(r);
          }}
        />
      ) : null}
    </>
  );
}

function BackupDialog({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (r: LegacyResult) => void;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!code.trim()) {
      setError(S.backupEmpty);
      return;
    }
    setBusy(true);
    try {
      onDone(await openBackupCode(code));
    } catch (e) {
      setError(e instanceof LegacyFileError ? S.backupBad : S.backupFailed);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
      title={S.backupTitle}
      description={S.backupDesc}
      footer={
        <>
          <DialogClose>{S.cancel}</DialogClose>
          <Button variant="primary" loading={busy} onClick={() => void submit()}>
            {S.backupApply}
          </Button>
        </>
      }
    >
      <Field label={S.backupLabel} error={error ?? undefined}>
        <TextArea
          rows={6}
          value={code}
          spellCheck={false}
          placeholder={S.backupPlaceholder}
          className="font-mono text-xs break-all"
          onChange={(e) => {
            setCode(e.target.value);
            setError(null);
          }}
        />
      </Field>
    </Dialog>
  );
}
