/**
 * 一個名字：大字的全名（點一下複製）、讀音、性別、鎖定。
 */
import { Lock, LockOpen } from 'lucide-react';
import type { GeneratedName } from '@/core/names';
import { cn, IconButton } from '@/ui';
import { type ReadingShow, shownReadings } from './logic';
import { S } from './strings';

export interface NameCardProps {
  name: GeneratedName;
  locked: boolean;
  show: ReadingShow;
  onCopy: (text: string) => void;
  onToggleLock: (text: string) => void;
}

export function NameCard({ name, locked, show, onCopy, onToggleLock }: NameCardProps) {
  const readings = shownReadings(name, show);
  return (
    <li
      data-testid="name-card"
      data-locked={locked || undefined}
      className={cn(
        'flex min-w-0 items-start gap-1 rounded-lg border bg-surface p-1',
        locked ? 'border-accent bg-accent-soft' : 'border-border',
      )}
    >
      <button
        type="button"
        onClick={() => onCopy(name.text)}
        aria-label={S.list.copy(name.text)}
        title={S.list.copy(name.text)}
        className="min-w-0 flex-1 cursor-copy rounded-md px-2 py-1.5 text-left hover:bg-surface-3 focus-visible:focus-ring"
      >
        <span
          data-testid="name-text"
          className="block break-words text-[1.625rem] font-medium leading-tight text-fg"
        >
          {name.text}
        </span>
        {readings.map((r) => (
          <span key={r} className="mt-0.5 block break-words text-sm text-muted">
            {r}
          </span>
        ))}
      </button>
      <div className="flex shrink-0 flex-col items-center gap-1 pt-1">
        <span className="inline-flex min-w-6 justify-center rounded-sm border border-border-strong px-1 text-xs font-medium text-muted">
          {S.list.gender[name.gender]}
        </span>
        <IconButton
          label={locked ? S.list.unlock(name.text) : S.list.lock(name.text)}
          icon={locked ? <Lock /> : <LockOpen />}
          pressed={locked}
          size="sm"
          variant="ghost"
          onClick={() => onToggleLock(name.text)}
        />
      </div>
    </li>
  );
}
