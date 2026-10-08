/**
 * 有沒有未儲存的調整（規格 F77）：目前的設定與上次儲存（或讀入）時的比對。
 */
import { comparableSettings } from './actions';
import { useAuto, useEdit, useSession } from './store';

export function useDirty(): boolean {
  const data = useEdit((s) => s.data);
  const auto = useAuto();
  const saved = useSession((s) => s.savedSnapshot);
  const model = useSession((s) => s.model);
  void data;
  void auto;
  return !!model && saved !== null && saved !== comparableSettings();
}
