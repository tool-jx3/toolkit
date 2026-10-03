/**
 * 送到團報產生器（F102～F105）：確認 → 寫入交接資料（@/core/sessions）→ 新分頁開啟新版團報產生器。
 * 寫入失敗時顯示交接資料的 JSON，讓使用者自己複製。
 */
import { useEffect, useState } from 'react';
import {
  createReportPendingImport,
  hasPendingReportImport,
  writePendingReportImport,
} from '@/core/sessions';
import { getTool, hrefToTool } from '@/registry';
import { Dialog, DialogClose, TextOutputPanel, useConfirm } from '@/ui';
import { notify } from './notify';
import { flushRowDraft, useLog } from './store';
import { S } from './strings';

/** 新版團報產生器的網址（還沒上線時在 next/） */
export const REPORT_TOOL_HREF = hrefToTool(
  getTool('session-report') ?? { id: 'session-report', status: 'next' },
);

let impl: ((id: string) => Promise<void>) | null = null;

/** 把這一團送到團報產生器（表格、側欄用） */
export function sendToReport(id: string): Promise<void> {
  return impl ? impl(id) : Promise.resolve();
}

/** 放在 ToolShell 裡：接上確認對話框，並顯示寫入失敗時的 JSON */
export function SendBridge() {
  const confirm = useConfirm();
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    const run = async (id: string) => {
      flushRowDraft();
      const row = useLog.getState().data.rows.find((r) => r.id === id);
      if (!row) return;
      const ok = await confirm({
        title: S.send.title,
        description: (
          <span className="flex flex-col gap-1.5">
            <span>{S.send.lead}</span>
            <span>{S.send.items}</span>
            {hasPendingReportImport() ? (
              <span className="text-warning" data-testid="send-overwrite">
                {S.send.overwrite}
              </span>
            ) : null}
          </span>
        ),
        confirmLabel: S.send.confirm,
      });
      if (!ok) return;
      const payload = createReportPendingImport(row);
      if (!writePendingReportImport(payload)) {
        setFailed(JSON.stringify(payload, null, 2));
        return;
      }
      window.open(REPORT_TOOL_HREF, '_blank', 'noopener,noreferrer');
      notify({ title: S.send.sent, tone: 'success' });
    };
    impl = run;
    return () => {
      if (impl === run) impl = null;
    };
  }, [confirm]);
  return (
    <Dialog
      open={failed !== null}
      onOpenChange={(o) => {
        if (!o) setFailed(null);
      }}
      title={S.send.failedTitle}
      description={S.send.failedDesc}
      size="lg"
      footer={<DialogClose />}
    >
      <TextOutputPanel text={failed ?? ''} title={S.send.failedData} font="mono" wrap="off" />
    </Dialog>
  );
}
