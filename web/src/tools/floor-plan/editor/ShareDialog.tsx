/**
 * 分享連結（規格 F215～F217、D27）：「專案 → 分享連結…」開這個對話框。
 * 選「PL 用」（預設）或「完整（GM 用）」，下面是連結（共用的文字輸出欄：字數、複製）；太長時改成錯誤訊息。
 * 打開網址裡的分享連結：openSharedFromHash（Editor 開頁與 hashchange 時呼叫）。
 */
import { useMemo } from 'react';
import { clearShareHash } from '@/core/share';
import { Dialog, Field, Notice, Segmented, TextOutputPanel } from '@/ui';
import {
  encodeMapHash,
  mapShareUrl,
  readMapHash,
  SHARE_MAX_LENGTH,
  type ShareMode,
} from '../model/share';
import { S } from '../strings';
import { notify, openProjectData } from './actions';
import { setEditor, useEditor, usePrefs, useProject } from './store';

/**
 * 網址 # 後面有分享的地圖時打開它（取代目前的地圖，可以復原）；讀不出來時通知錯誤、地圖不變。
 * 兩種情況都先把 # 從網址拿掉（重新整理不會再開一次）。沒有分享的地圖時 false。
 */
export function openSharedFromHash(hash: string = location.hash): boolean {
  const r = readMapHash(hash);
  if (r.kind === 'none') return false;
  clearShareHash();
  if (r.kind === 'ok' && openProjectData(r.raw, r.pl ? 'link-pl' : 'link').ok) return true;
  notify(S.share.broken, 'danger', { description: S.share.brokenHint });
  return false;
}

const isMode = (v: unknown): v is ShareMode => v === 'pl' || v === 'full';

export function ShareDialog() {
  const open = useEditor((s) => s.shareOpen);
  const project = useProject((s) => s.data);
  const pref = usePrefs((s) => s.data.share);
  const mode: ShareMode = isMode(pref) ? pref : 'pl';
  const share = useMemo(() => (open ? encodeMapHash(project, mode) : null), [open, project, mode]);
  const url = share && !share.tooLong ? mapShareUrl(share.hash, location.href) : '';
  const r = share?.removed;
  const removedAny = !!r && Object.values(r).some((n) => n > 0);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => setEditor({ shareOpen: o })}
      title={S.share.title}
      description={S.share.lead}
      size="lg"
    >
      <div className="flex min-w-0 flex-col gap-3" data-testid="share-dialog">
        <Field label={S.share.mode}>
          <Segmented
            aria-label={S.share.mode}
            value={mode}
            onValueChange={(v) =>
              usePrefs.getState().update((d) => {
                d.share = v as ShareMode;
              })
            }
            options={[
              { value: 'pl', label: S.share.modes.pl },
              { value: 'full', label: S.share.modes.full },
            ]}
          />
        </Field>
        <p className="m-0 text-sm text-muted">
          {mode === 'pl' ? S.share.plNote : S.share.fullNote}
        </p>
        {mode === 'pl' && r ? (
          <p className="m-0 text-xs text-muted" data-testid="share-removed">
            {removedAny ? S.share.removed(r) : S.share.nothingRemoved}
          </p>
        ) : null}
        {share?.tooLong ? (
          <Notice tone="danger">{S.share.tooLong(share.length, SHARE_MAX_LENGTH)}</Notice>
        ) : share ? (
          <TextOutputPanel
            text={url}
            title={S.share.link}
            count={() => S.share.count(share.length, SHARE_MAX_LENGTH)}
            copyLabel={S.share.copy}
            messages={{ copied: S.share.copied }}
            className="max-h-[30dvh] overflow-auto"
          />
        ) : null}
        <p className="m-0 text-xs text-muted">{S.share.refresh}</p>
      </div>
    </Dialog>
  );
}
