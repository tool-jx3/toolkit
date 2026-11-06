/**
 * 清單上方的列：第幾輪、目前輪到誰、上一位／下一位、幫 NPC 擲先攻、依先攻排序、鎖定順序、新的戰鬥、複製文字、玩家視圖。
 */
import {
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Dices,
  ListOrdered,
  Lock,
  LockOpen,
  MonitorPlay,
  RotateCcw,
} from 'lucide-react';
import { Button, buttonClass, cn, IconButton, useConfirm, useToast, withShortcut } from '@/ui';
import { copyOrder, goNext, goPrev } from './actions';
import { currentId, newEncounter, rollInitiatives, sortList } from './model';
import { step, useCombat } from './store';
import { S } from './strings';

/** 玩家視圖的視窗名稱（再按一次會換到同一個視窗） */
export const PLAYER_WINDOW = 'trpg-combat-tracker-player';

export function TurnBar() {
  const toast = useToast();
  const confirm = useConfirm();
  const round = useCombat((s) => s.data.round);
  const count = useCombat((s) => s.data.list.length);
  const curName = useCombat((s) => {
    const id = currentId(s.data);
    return s.data.list.find((c) => c.id === id)?.name ?? null;
  });
  const locked = useCombat((s) => s.data.settings.lockOrder);
  const die = useCombat((s) => s.data.settings.initDie);
  const hasNpc = useCombat((s) => s.data.list.some((c) => c.side !== 'pc'));

  const startNew = async () => {
    if (
      await confirm({
        title: S.turn.newEncounterTitle,
        description: S.turn.newEncounterDesc,
        confirmLabel: S.turn.newEncounterOk,
      })
    )
      step((d) => newEncounter(d));
  };

  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
      data-testid="turn-bar"
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-lg font-semibold tabular-nums" data-testid="round">
          {S.turn.round(round)}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm" data-testid="current">
          {curName ? (
            <>
              <span className="text-muted">{S.turn.current}：</span>
              <strong className="font-semibold">{curName}</strong>
            </>
          ) : (
            <span className="text-muted">{S.turn.none}</span>
          )}
        </span>
        <div className="flex items-center gap-1.5">
          <IconButton
            label={withShortcut(S.turn.prev, 'shift+n')}
            icon={<ChevronLeft />}
            onClick={goPrev}
            disabled={!count}
          />
          <Button
            variant="primary"
            onClick={() => goNext(toast)}
            disabled={!count}
            title={withShortcut(S.turn.next, 'n')}
          >
            {S.turn.next}
            <ChevronRight aria-hidden className="size-4" />
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {die !== 'none' ? (
          <Button
            size="sm"
            icon={<Dices />}
            disabled={!hasNpc}
            title={S.turn.rollNpcHint}
            onClick={() => step((d) => void rollInitiatives(d, 'npc'))}
          >
            {S.turn.rollNpc}
          </Button>
        ) : null}
        <Button
          size="sm"
          icon={<ListOrdered />}
          disabled={locked || count < 2}
          onClick={() => step((d) => sortList(d))}
        >
          {S.turn.sort}
        </Button>
        <Button
          size="sm"
          icon={locked ? <Lock /> : <LockOpen />}
          aria-pressed={locked}
          title={S.turn.lockHint}
          className={cn(locked && 'border-accent text-accent')}
          onClick={() =>
            step((d) => {
              d.settings.lockOrder = !d.settings.lockOrder;
            })
          }
        >
          {S.turn.lock}
        </Button>
        <Button size="sm" icon={<RotateCcw />} disabled={!count} onClick={() => void startNew()}>
          {S.turn.newEncounter}
        </Button>
        <Button
          size="sm"
          icon={<ClipboardCopy />}
          disabled={!count}
          onClick={() => void copyOrder(toast)}
        >
          {S.turn.copy}
        </Button>
        <a
          href="#player"
          target={PLAYER_WINDOW}
          rel="opener"
          title={S.turn.playerHint}
          className={buttonClass('secondary', 'sm')}
          data-testid="open-player"
        >
          <MonitorPlay aria-hidden className="size-4" />
          {S.turn.player}
        </a>
      </div>
    </div>
  );
}
