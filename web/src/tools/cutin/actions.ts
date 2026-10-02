/**
 * 操作：套用範本、開啟分享連結、匯出（三個按鈕共用）、自動縮小檔案、複製分享連結。
 */
import { copyText } from '@/core/files';
import { encodeShareHash } from '@/core/share';
import { runExport } from './exporter';
import {
  applyTemplate,
  type CutinFormat,
  type CutinSettings,
  type CutinTemplate,
  restoreTemplateLook,
  shrinkOnce,
} from './model';
import { SHARE_VERSION, settingsFromHash, shareData } from './settings';
import { setNotice, setSettings, usePrefs, useSettings, useUi } from './store';
import { S } from './strings';
import { templateOf } from './templates';

/** 點範本卡片（F04）：套用並進入編輯畫面 */
export function chooseTemplate(t: CutinTemplate): void {
  setSettings((s) => applyTemplate(s, t));
  usePrefs.getState().patch({ started: true });
  useUi.setState({ screen: 'editor' });
}

/** 恢復範本外觀（F07） */
export function restoreLook(): void {
  const t = templateOf(useSettings.getState().data.templateId);
  if (t) setSettings((s) => restoreTemplateLook(s, t));
}

/** 開頁時：網址帶有效的分享設定就直接進編輯畫面（F62） */
export function openFromHash(hash: string): boolean {
  const s = settingsFromHash(hash);
  if (!s) return false;
  useSettings.getState().replace(s);
  useSettings.temporal.getState().clear();
  usePrefs.getState().patch({ started: true });
  useUi.setState({ screen: 'editor' });
  return true;
}

/* ---------- 匯出 ---------- */

/**
 * 匯出（F41）：把格式選擇改成這個格式（算手動改過）並立即匯出；檢查清單有錯誤也照樣匯出。
 * 完成後自動打開結果對話框（F43）；失敗時在檢查清單上方顯示錯誤（F47）。
 */
export async function exportAs(
  format: CutinFormat,
  { keepShrinkNote = false } = {},
): Promise<void> {
  if (useUi.getState().exporting) return;
  setSettings((s) =>
    s.format === format && s.touched.format
      ? s
      : { ...s, format, touched: { ...s.touched, format: true } },
  );
  const s = useSettings.getState().data;
  const prev = useUi.getState().outcome;
  useUi.setState({
    exporting: { format, progress: { phase: 'draw', done: 0, total: s.frames } },
    resultOpen: false,
    ...(keepShrinkNote ? {} : { shrinkNote: null, notice: null }),
  });
  try {
    const result = await runExport(s, format, (progress) =>
      useUi.setState({ exporting: { format, progress } }),
    );
    if (prev) URL.revokeObjectURL(prev.url);
    useUi.setState({
      exporting: null,
      outcome: {
        result,
        url: URL.createObjectURL(result.blob),
        format,
        target: s.target,
        text: s.text,
      },
      resultOpen: true,
      lastBytes: result.blob.size,
    });
  } catch (e) {
    useUi.setState({ exporting: null });
    setNotice({
      tone: 'error',
      message: S.exportFailed(e instanceof Error ? e.message : String(e)),
    });
  }
}

/**
 * 自動縮小檔案（F46）：每按一次降一級（色數 → 影格數 → 放射速度線 → 尺寸），改掉設定並用同一格式重新匯出；
 * 已無可再降時不匯出，在檢查清單上方說明。這次降了什麼會顯示出來。
 */
export function autoShrink(): void {
  const ui = useUi.getState();
  if (ui.exporting || !ui.outcome) return;
  const format = ui.outcome.format;
  const step = shrinkOnce(useSettings.getState().data, format);
  if (!step) {
    useUi.setState({ shrinkNote: S.noMoreShrink });
    setNotice({ tone: 'info', message: S.noMoreShrink });
    return;
  }
  setSettings(() => step.next);
  const note = S.shrunk(step.description);
  useUi.setState({ shrinkNote: note });
  setNotice({ tone: 'info', message: note });
  void exportAs(format, { keepShrinkNote: true });
}

/* ---------- 分享連結（F61） ---------- */

export async function copyShareLink(): Promise<void> {
  const hash = encodeShareHash(shareData(useSettings.getState().data), { version: SHARE_VERSION });
  history.replaceState(history.state, '', `${location.pathname}${location.search}${hash}`);
  const ok = await copyText(location.href);
  setNotice(
    ok
      ? { tone: 'success', message: S.shareCopied }
      : { tone: 'error', message: S.shareCopyFailed },
  );
}

/** 用途的切入名稱（文字第一行；空白時用範例詞） */
export const cutinWord = (text: string): string =>
  text.replace(/\r\n?/g, '\n').split('\n')[0]?.trim() || S.cutinWordFallback;

export type { CutinSettings };
