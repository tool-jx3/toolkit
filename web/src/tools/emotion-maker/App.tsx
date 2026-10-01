/**
 * 表情產生器：在固定的頭部上組合眼睛、眉毛、嘴巴與漫畫符號，存成表情清單，再排成附文字的合輯圖匯出 PNG。
 * 規格：docs/refactor/specs/emotion-maker.md（第 7 節主控裁定優先）。
 *
 * 版面（用 ToolShell 的 body 自己排）：
 * - 寬螢幕：左邊是部件選項格（整頁捲動）；右邊固定在畫面上，上面編輯區、下面表情清單（自己捲動）。
 * - 窄螢幕：編輯區 → 部件 → 表情清單（右欄的外框在窄螢幕是 display: contents，三塊依 order 排列）。
 */
import { useEffect, useRef } from 'react';
import { useSaveError } from '@/core/storage';
import { ToolShell } from '@/ui';
import { EditorPanel } from './EditorPanel';
import { builtinThumbLayers, useNotify } from './hooks';
import { ListPanel } from './ListPanel';
import { collectUnusedImages, PartsPanel } from './PartsPanel';
import { partAssets, TOOL_ID, useCustomImages, useEmotions } from './store';
import { S } from './strings';

/** 讀回自訂部件的圖片（重新整理後還原）；只在開頁時清一次沒用到的圖片 */
function Startup() {
  const customParts = useEmotions((s) => s.data.customParts);
  const notify = useNotify();
  const saveError = useSaveError(TOOL_ID);
  const reported = useRef(false);
  const first = useRef(true);

  useEffect(() => {
    const failed = builtinThumbLayers().failed;
    if (failed.length) notify(S.builtinFailed(failed.map((p) => p.name).join('、')), 'danger');
  }, [notify]);

  useEffect(() => {
    if (saveError) notify(S.listNotSaved, 'warning');
  }, [saveError, notify]);

  useEffect(() => {
    const { images, missing } = useCustomImages.getState();
    const ids = [
      ...new Set(
        customParts
          .map((p) => p.assetId)
          .filter((id): id is string => !!id && !images[id] && !missing[id]),
      ),
    ];
    const isFirst = first.current;
    first.current = false;
    if (!ids.length) {
      if (isFirst) void collectUnusedImages();
      return;
    }
    let alive = true;
    void (async () => {
      let lost = 0;
      for (const id of ids) {
        const image = await partAssets.bitmap(id).catch(() => undefined);
        if (image) useCustomImages.getState().put(id, image);
        else {
          useCustomImages.getState().markMissing(id);
          lost++;
        }
      }
      if (!alive) return;
      if (lost && !reported.current) {
        reported.current = true;
        notify(S.partsMissing(lost), 'warning');
      }
      if (isFirst) void collectUnusedImages();
    })();
    return () => {
      alive = false;
    };
  }, [customParts, notify]);

  return null;
}

function Usage() {
  return (
    <>
      <p>{S.usageIntro}</p>
      <ol className="mt-2">
        {S.usageSteps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <p className="mt-2 font-semibold">{S.usageNotesTitle}</p>
      <ul>
        {S.usageNotes.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </>
  );
}

export function App() {
  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={<Usage />}
      body={
        <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(320px,460px)_minmax(0,1fr)]">
          <Startup />
          <div className="order-2 flex min-w-0 flex-col gap-4 lg:order-1">
            <PartsPanel />
          </div>
          <div className="contents lg:sticky lg:top-16 lg:order-2 lg:flex lg:max-h-[calc(100dvh-5rem)] lg:min-w-0 lg:flex-col lg:gap-4 lg:overflow-y-auto">
            <div className="order-1 min-w-0">
              <EditorPanel />
            </div>
            <div className="order-3 min-w-0">
              <ListPanel />
            </div>
          </div>
        </div>
      }
    />
  );
}
