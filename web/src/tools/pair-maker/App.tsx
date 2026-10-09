/**
 * 角色介紹圖產生器：開頁先顯示版型一覽，選了版型進入編輯畫面（網址帶 `?t=<版型 id>`，可以直接開；上一頁回到一覽）。
 * 規格：docs/refactor/specs/pair-maker.md。
 */
import { useEffect, useState } from 'react';
import { Notice, ToolShell } from '@/ui';
import { Editor } from './Editor';
import { Gallery } from './Gallery';
import { slotAssetIds } from './slots';
import { assets, referencedIds, TOOL_ID } from './store';
import { S } from './strings';
import { templateById } from './templates';
import { Usage } from './Usage';

const readUrl = (): string | null => {
  try {
    return new URLSearchParams(window.location.search).get('t');
  } catch {
    return null;
  }
};

/**
 * 開頁約 5 秒後整理一次圖片庫：以前留下、所有版型（含復原紀錄）與存檔槽都沒用到的圖片才刪
 * （這次開頁放進來的不刪：讀到一半的專案檔、還沒寫進版型的圖）
 */
function useAssetCleanup() {
  useEffect(() => {
    const t = setTimeout(() => {
      void (async () => {
        try {
          const keep = await referencedIds(await slotAssetIds());
          await assets.gcStale(keep);
        } catch {
          /* 整理失敗就下次再整理 */
        }
      })();
    }, 5000);
    return () => clearTimeout(t);
  }, []);
}

export function App() {
  const [id, setId] = useState<string | null>(readUrl);
  useAssetCleanup();
  useEffect(() => {
    const onPop = () => setId(readUrl());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const go = (next: string | null) => {
    const url = next ? `?t=${encodeURIComponent(next)}` : window.location.pathname;
    window.history.pushState(null, '', url);
    setId(next);
    window.scrollTo(0, 0);
  };

  const def = templateById(id);
  if (!def)
    return (
      <ToolShell
        toolId={TOOL_ID}
        usage={<Usage />}
        body={
          <div className="flex flex-col gap-4">
            {id ? <Notice tone="warning">{S.notFound(id)}</Notice> : null}
            <Gallery onPick={go} />
          </div>
        }
      />
    );
  return <Editor key={def.id} def={def} onBack={() => go(null)} onSwitch={go} />;
}
