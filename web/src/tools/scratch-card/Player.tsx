/**
 * 分享連結的畫面（F51）：只有說明、卡片（窄畫面等比縮小）、再蓋一次、直接刮開，以及回到編輯畫面的連結。
 * 不會動到這個瀏覽器自己存的刮刮卡。
 */
import { Eraser, PenLine, RotateCcw } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { Button, buttonClass } from '@/ui';
import { CardView } from './CardView';
import { buildCard } from './card';
import type { ScratchHandle } from './engine';
import type { SharedCard } from './share';
import { S } from './strings';

export function Player({ shared: { spec, crops } }: { shared: SharedCard }) {
  const card = useMemo(() => buildCard(spec), [spec]);
  const handle = useRef<ScratchHandle | null>(null);
  const [revealed, setRevealed] = useState(false);
  return (
    <div
      className="mx-auto flex w-full max-w-[1300px] min-w-0 flex-col items-center gap-4 py-4"
      data-testid="player"
    >
      <p className="m-0 text-center text-sm text-muted">{S.player.lead}</p>
      <div className="w-full min-w-0">
        <CardView
          card={card}
          fit
          crops={crops}
          onHandle={(h) => {
            handle.current = h;
          }}
          onReveal={() => setRevealed(true)}
          onRecover={() => setRevealed(false)}
        />
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <Button
          icon={<RotateCcw />}
          onClick={() => {
            handle.current?.recover();
            setRevealed(false);
          }}
        >
          {S.recover}
        </Button>
        <Button icon={<Eraser />} disabled={revealed} onClick={() => handle.current?.reveal()}>
          {S.revealNow}
        </Button>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {revealed ? S.revealed : ''}
      </p>
      <a href={location.pathname + location.search} className={buttonClass('ghost', 'sm')}>
        <PenLine aria-hidden className="size-4" />
        {S.player.make}
      </a>
    </div>
  );
}
