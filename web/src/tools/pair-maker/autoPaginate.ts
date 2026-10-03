/**
 * 文字記錄的自動分頁（對版型的 store 做一次）：先載入場景用到的字型再量字寬，放不下的字推到下一頁同一欄。
 * Editor 的背景排程（停手約 0.2 秒、離開本文欄）與下載 PNG／PDF 前（同舊版按 PDF 時的 `scene.paginate()`）都用這一個。
 */
import { loadSceneFonts, richAdvance } from '@/core/scene';
import type { ToolStore } from '@/core/storage';
import type { Draft, TemplateDef } from './model';
import { sceneEnv } from './render';
import { measureContext, silently } from './store';
import { paginate, variantOf } from './templates/textlog';

/**
 * 分頁一次；不是文字記錄時回傳 null。分頁的結果不記進復原紀錄（跟著前一個變更算同一步）。
 * 回傳 capped：到了 30 頁（或字數上限）還放不下。
 */
export async function paginateNow(
  def: TemplateDef,
  store: ToolStore<Draft>,
): Promise<{ capped: boolean } | null> {
  const variant = variantOf(def.id);
  if (!variant) return null;
  const d0 = store.getState().data;
  await loadSceneFonts(def.scene({ ...d0, view: 'all' }, sceneEnv(d0)));
  const d = store.getState().data;
  const r = paginate(
    d,
    variant,
    (node) => (ch, bold) => richAdvance(measureContext(), node, ch, bold),
  );
  if (r.changed) silently(store, () => store.getState().replace(r.draft));
  return { capped: r.capped };
}
