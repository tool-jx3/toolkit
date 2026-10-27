/**
 * 送到跑團紀錄簿、團報產生器（F54、F55）：確認 → 寫入交接資料（@/core/sessions）→ 新分頁開啟那個工具。
 * 寫入失敗時顯示交接資料的 JSON，讓使用者自己複製。
 */
import { useEffect, useState } from 'react';
import {
  hasPendingLogImport,
  hasPendingReportImport,
  writePendingLogImport,
  writePendingReportImport,
} from '@/core/sessions';
import { getTool, hrefToTool } from '@/registry';
import { Dialog, DialogClose, TextOutputPanel, useConfirm } from '@/ui';
import { logPayload, reportPayload } from './bridge';
import { notify } from './notify';
import { calNow } from './store';
import { S } from './strings';

/** 跑團紀錄簿、團報產生器的網址（還沒上線時在 next/） */
export const LOG_TOOL_HREF = hrefToTool(
  getTool('session-log') ?? { id: 'session-log', status: 'next' },
);
export const REPORT_TOOL_HREF = hrefToTool(
  getTool('session-report') ?? { id: 'session-report', status: 'next' },
);

type Target = 'log' | 'report';
let impl: ((id: string, target: Target) => Promise<void>) | null = null;

export const sendToLog = (id: string): Promise<void> => impl?.(id, 'log') ?? Promise.resolve();
export const sendToReport = (id: string): Promise<void> =>
  impl?.(id, 'report') ?? Promise.resolve();

export function SendBridge() {
  const confirm = useConfirm();
  const [failed, setFailed] = useState<string | null>(null);
  useEffect(() => {
    const run = async (id: string, target: Target) => {
      const entry = calNow().entries.find((e) => e.id === id);
      if (entry?.kind !== 'session') return;
      const log = target === 'log';
      const pending = log ? hasPendingLogImport() : hasPendingReportImport();
      const ok = await confirm({
        title: log ? S.send.logTitle : S.send.reportTitle,
        description: (
          <span className="flex flex-col gap-1.5">
            <span>{log ? S.send.logLead : S.send.reportLead}</span>
            <span>{S.send.items}</span>
            {pending ? (
              <span className="text-warning" data-testid="send-overwrite">
                {S.send.overwrite}
              </span>
            ) : null}
          </span>
        ),
        confirmLabel: S.send.confirm,
      });
      if (!ok) return;
      const payload = log ? logPayload(entry) : reportPayload(entry);
      const written = log
        ? writePendingLogImport(payload as ReturnType<typeof logPayload>)
        : writePendingReportImport(payload as ReturnType<typeof reportPayload>);
      if (!written) {
        setFailed(JSON.stringify(payload, null, 2));
        return;
      }
      window.open(log ? LOG_TOOL_HREF : REPORT_TOOL_HREF, '_blank', 'noopener,noreferrer');
      notify({ title: log ? S.send.sentLog : S.send.sentReport, tone: 'success' });
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
