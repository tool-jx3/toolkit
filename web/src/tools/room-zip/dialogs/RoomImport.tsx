/**
 * 讀入房間 ZIP 的介面（F287～F299）：選檔／拖放 → 讀取與檢查（壞檔時只通知、目前的專案不受影響）→
 * 確認（專案不是空的，或有會少掉的東西時）→ 換成讀入的專案（可以復原）→ 通知。
 */
import { useCallback, useMemo } from 'react';
import { pickFiles, readAsBytes } from '@/core/files';
import { useConfirm } from '@/ui';
import { useNotify } from '../common';
import { applyRoomImport, openAny, PROJECT_ACCEPT, ROOM_ZIP_ACCEPT } from '../ops';
import {
  assertRoomZipSize,
  describeReport,
  hasLost,
  importRoomZip,
  isProjectBlank,
  type RoomImportReport,
  type RoomImportResult,
} from '../roomImport';
import { setSession, useProject } from '../store';
import { S } from '../strings';

/** 確認對話框的內容（`<p>` 裡面，只能放行內元素） */
export function RoomImportSummary({ report }: { report: RoomImportReport }) {
  const T = S.roomImport;
  const d = describeReport(report);
  return (
    <span className="flex flex-col gap-2 text-left" data-testid="room-import-summary">
      <span>{T.confirmLead}</span>
      <span data-testid="room-import-counts">{d.counts}</span>
      {d.converted ? <span>{d.converted}</span> : null}
      {d.external ? <span>{d.external}</span> : null}
      {d.kept.length || d.keptFields ? (
        <span data-testid="room-import-kept">
          <b className="text-fg">{T.keptTitle}</b>
          {d.kept.map((k) => (
            <span key={k} className="block">
              ・{k}
            </span>
          ))}
          {d.keptFields ? <span className="block">{T.keptFields}</span> : null}
        </span>
      ) : null}
      {d.lost.length ? (
        <span data-testid="room-import-lost">
          <b className="text-warning">{T.lostTitle}</b>
          {d.lost.map((l) => (
            <span key={l} className="block">
              {l}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  );
}

export interface RoomZipOpener {
  /** 讀入一個房間 ZIP（內容不是房間 ZIP 時顯示原因）；回傳有沒有換成新的專案 */
  openRoom: (file: File, bytes?: Uint8Array) => Promise<boolean>;
  /** 專案檔或房間 ZIP（看內容分辨，頁首的「讀取」） */
  openAnyFile: (file: File) => Promise<boolean>;
  /** 開選檔視窗：專案檔或房間 ZIP */
  pickAny: () => Promise<void>;
  /** 開選檔視窗：房間 ZIP */
  pickRoom: () => Promise<void>;
}

export function useRoomZipOpener(): RoomZipOpener {
  const notify = useNotify();
  const confirm = useConfirm();

  const openRoom = useCallback(
    async (file: File, known?: Uint8Array): Promise<boolean> => {
      setSession({
        busy: { title: S.roomImport.busy, detail: file.name, done: 0, total: 1 },
      });
      let result: RoomImportResult;
      try {
        assertRoomZipSize(file.size);
        result = await importRoomZip(known ?? (await readAsBytes(file)), { fileName: file.name });
      } catch (e) {
        notify(
          S.roomImport.failed(e instanceof Error ? e.message : String(e)),
          'danger',
          S.roomImport.unchanged,
        );
        return false;
      } finally {
        setSession({ busy: null });
      }
      const { report } = result;
      const lost = hasLost(report);
      if (!isProjectBlank(useProject.getState().data) || lost) {
        const ok = await confirm({
          title: S.roomImport.confirmTitle(report.roomName),
          description: <RoomImportSummary report={report} />,
          confirmLabel: S.roomImport.confirmOk,
        });
        if (!ok) return false;
      }
      let persisted = true;
      try {
        persisted = await applyRoomImport(result);
      } catch (e) {
        notify(S.roomImport.failed(e instanceof Error ? e.message : String(e)), 'danger');
        return false;
      }
      /* 標題只在真的有資料沒帶進來時才寫「有東西沒有帶進來」；只有存不進瀏覽器時另外在說明欄警告（R8） */
      const lines = [S.roomImport.countsLine(report.counts)];
      if (!persisted) lines.push(S.roomImport.notPersisted);
      lines.push(S.roomImport.undoHint);
      notify(
        lost ? S.roomImport.doneWarn(report.roomName) : S.roomImport.done(report.roomName),
        lost || !persisted ? 'warning' : 'success',
        lines.join('\n'),
      );
      return true;
    },
    [notify, confirm],
  );

  const openAnyFile = useCallback(
    (file: File) =>
      openAny(
        file,
        notify,
        (f, bytes) => openRoom(f, bytes),
        async () =>
          isProjectBlank(useProject.getState().data) ||
          confirm({
            title: S.roomImport.openProjectConfirmTitle,
            description: S.roomImport.openProjectConfirm,
            confirmLabel: S.roomImport.openProjectConfirmOk,
            danger: true,
          }),
      ),
    [notify, confirm, openRoom],
  );

  return useMemo(
    () => ({
      openRoom,
      openAnyFile,
      pickAny: async () => {
        const [file] = await pickFiles({ accept: PROJECT_ACCEPT });
        if (file) await openAnyFile(file);
      },
      pickRoom: async () => {
        const [file] = await pickFiles({ accept: ROOM_ZIP_ACCEPT });
        if (file) await openRoom(file);
      },
    }),
    [openRoom, openAnyFile],
  );
}
