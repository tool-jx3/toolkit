/**
 * 需要確認的重設（「全部重來」）：先用共用的確認對話框詢問，同意才執行。
 *
 * ```ts
 * const confirmReset = useConfirmedReset();
 * <Button onClick={() => confirmReset(() => { resetToolStore(useSettings); usePreview.getState().reset(); })}>全部重來</Button>
 * ```
 * 回傳 true 表示已重設。
 */
import { type ConfirmOptions, useConfirm } from './Dialog';

export function useConfirmedReset(options: Partial<ConfirmOptions> = {}) {
  const confirm = useConfirm();
  return async (onReset: () => void): Promise<boolean> => {
    const ok = await confirm({
      title: '全部重來？',
      description: '所有設定會回到一開始的樣子，這個動作無法復原。',
      confirmLabel: '全部重來',
      danger: true,
      ...options,
    });
    if (ok) onReset();
    return ok;
  };
}
