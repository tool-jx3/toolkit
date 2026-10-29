/**
 * 一個名字：大字的全名（點一下複製）、讀音、性別、鎖定；考據語料的名字另有說明（原站的排法，字小一級，
 * 在複製的範圍外面，可以自己選取）：涵義一段一行（「姓：…」「名：…」依姓名順序）、備註一行、暱稱與姓的另一形一行。
 */
import { Lock, LockOpen } from 'lucide-react';
import { cn, IconButton } from '@/ui';
import {
  corpusDetails,
  genderLabel,
  isCorpusName,
  type NpcName,
  type ReadingShow,
  shownReadings,
} from './logic';
import { S } from './strings';

export interface NameCardProps {
  name: NpcName;
  locked: boolean;
  show: ReadingShow;
  onCopy: (text: string) => void;
  onToggleLock: (text: string) => void;
}

export function NameCard({ name, locked, show, onCopy, onToggleLock }: NameCardProps) {
  const readings = shownReadings(name, show);
  const corpus = isCorpusName(name) && show.meaning ? name : null;
  const details = corpus ? corpusDetails(corpus) : [];
  return (
    <li
      data-testid="name-card"
      data-locked={locked || undefined}
      className={cn(
        'flex min-w-0 flex-col rounded-lg border bg-surface p-1',
        locked ? 'border-accent bg-accent-soft' : 'border-border',
      )}
    >
      <div className="flex min-w-0 items-start gap-1">
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
            {genderLabel(name)}
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
      </div>
      {details.length ? (
        <div
          data-testid="name-meaning"
          className="flex flex-col gap-0.5 px-2 pt-0.5 pb-1.5 text-xs leading-relaxed"
        >
          {details.map((d, i) => (
            <p
              // biome-ignore lint/suspicious/noArrayIndexKey: 同一張卡的文字不會重排
              key={i}
              className={cn('m-0 break-words', d.muted ? 'text-muted' : 'text-fg')}
            >
              {d.text}
            </p>
          ))}
        </div>
      ) : null}
    </li>
  );
}
