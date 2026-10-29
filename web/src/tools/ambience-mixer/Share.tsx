/**
 * 分享連結：對話框（共用的 ShareLinkDialog），與開頁（或網址的 # 改變）時讀網址裡的組合。
 */
import { useEffect, useMemo } from 'react';
import { clearShareHash, encodeShareHash, shareTooLong } from '@/core/share';
import { ShareLinkDialog, type ToastOptions, useConfirm } from '@/ui';
import { applyShared } from './actions';
import { readShare, SHARE_MAX_LENGTH, SHARE_VERSION, shareData, trackLabel } from './model';
import { mixNow, useMix, useRuntime } from './store';
import { S } from './strings';

export function ShareDialog() {
  const open = useRuntime((s) => s.shareOpen);
  const state = useMix((s) => s.data);
  const hash = useMemo(
    () => (open ? encodeShareHash(shareData(state), { version: SHARE_VERSION }) : ''),
    [open, state],
  );
  const url = open ? `${location.origin}${location.pathname}${location.search}${hash}` : null;
  return (
    <ShareLinkDialog
      open={open}
      onOpenChange={(v) => useRuntime.setState({ shareOpen: v })}
      strings={{
        title: S.share.title,
        lead: S.share.lead,
        note: S.share.note,
        generating: S.share.generating,
        tooLong: S.share.tooLong,
        link: S.share.link,
        copy: S.share.copy,
        copied: S.share.copied,
        count: S.share.count,
        open: S.share.open,
      }}
      url={url}
      tooLong={!!hash && shareTooLong(hash, SHARE_MAX_LENGTH)}
      maxLength={SHARE_MAX_LENGTH}
      data-testid="share-dialog"
    />
  );
}

/** 網址帶著分享的組合時：目前有合成的聲音就先確認，再換成分享的組合（可以復原）；讀不出來時通知 */
export function useOpenShared(notify: (o: ToastOptions) => void) {
  const confirm = useConfirm();
  useEffect(() => {
    const check = async () => {
      const r = readShare(location.hash);
      if (r.kind === 'none') return;
      clearShareHash();
      if (r.kind === 'broken') {
        notify({ title: S.share.broken, tone: 'danger' });
        return;
      }
      const hasSynth = mixNow().tracks.some((t) => t.kind === 'synth');
      if (hasSynth) {
        const ok = await confirm({
          title: S.share.confirmTitle,
          description: S.share.confirmText(r.mix.tracks.map(trackLabel).join('、')),
          confirmLabel: S.share.confirm,
          cancelLabel: S.share.keep,
        });
        if (!ok) return;
      }
      applyShared(r.mix);
      notify({ title: S.share.applied, tone: 'success' });
    };
    void check();
    const on = () => void check();
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, [confirm, notify]);
}
