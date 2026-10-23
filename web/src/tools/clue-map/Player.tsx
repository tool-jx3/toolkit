/**
 * 分享連結的畫面（F92）：只有說明、遊玩畫面，以及回到編輯畫面的連結。不會動到這個瀏覽器自己存的調查熱點圖；
 * 遊玩進度記在瀏覽器（鍵含內容的指紋，F68）。
 */
import { PenLine } from 'lucide-react';
import { useMemo } from 'react';
import { buttonClass } from '@/ui';
import { refsOf, usePreviewSources } from './images';
import { playConfig, progressKey } from './markup';
import type { ClueMapState } from './model';
import { PlayView } from './PlayView';
import { S } from './strings';

export function Player({ shared }: { shared: ClueMapState }) {
  const refs = useMemo(() => refsOf(shared), [shared]);
  const { srcOf } = usePreviewSources(refs);
  const config = useMemo(
    () => playConfig(shared, srcOf, { storageKey: progressKey(shared) }),
    [shared, srcOf],
  );
  return (
    <div
      className="mx-auto flex w-full max-w-[1200px] min-w-0 flex-col items-center gap-4 py-4"
      data-testid="player"
    >
      <p className="m-0 text-center text-sm text-muted">{S.sharedLead}</p>
      <div className="w-full min-w-0">
        <PlayView config={config} />
      </div>
      <a href={location.pathname + location.search} className={buttonClass('ghost', 'sm')}>
        <PenLine aria-hidden className="size-4" />
        {S.sharedMake}
      </a>
    </div>
  );
}
