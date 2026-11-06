/**
 * 結果卡的清單：每一筆的全文（有名字的欄畫虛線底線，點一下打開「重抽／鎖定／複製這一欄」的選單）、
 * 複製、重抽（鎖定的欄留著）、鎖住整張、「更多」（複製成 CCFOLIA 棋子、加到清單）。
 */
import { ClipboardPlus, Copy, Dices, ListPlus, Lock, LockOpen, RefreshCw } from 'lucide-react';
import { useRef, useState } from 'react';
import { ContextMenu, type ContextMenuState, cn, IconButton, MenuButton } from '@/ui';
import {
  copyCard,
  copyCcfolia,
  copyField,
  rerollOne,
  rerollOneField,
  saveCard,
  toggleCardLock,
  toggleFieldLock,
} from './actions';
import type { GeneratorDef } from './generators';
import { partLines, type ResultCard } from './logic';
import { S } from './strings';

interface FieldTarget {
  card: ResultCard;
  key: string;
  label: string;
}

/**
 * 一個欄的值：畫虛線底線的字，點一下（或 Enter、空白鍵）打開這一欄的選單。用 span（role="button"）而不是 button：
 * button 在 Chrome 是不可分割的行內方塊，後面的「，」會被擠到下一行的開頭；span 照一般的文字斷行（含避頭點）。
 */
function FieldSpan({
  label,
  text,
  locked,
  onOpen,
}: {
  label: string;
  text: string;
  locked: boolean;
  onOpen: (el: HTMLElement) => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: 要跟著文字斷行（見上面）
    <span
      role="button"
      tabIndex={0}
      data-field={label}
      data-locked={locked || undefined}
      aria-haspopup="menu"
      aria-label={`${label}：${text}${locked ? '（已鎖定）' : ''}`}
      title={S.card.fieldTitle(label, locked)}
      onClick={(e) => onOpen(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(e.currentTarget);
        }
      }}
      className={cn(
        'cursor-pointer rounded-sm underline decoration-dotted decoration-1 underline-offset-4 hover:bg-surface-3 focus-visible:focus-ring',
        locked && 'bg-accent-soft decoration-solid decoration-accent',
      )}
    >
      {locked ? (
        <Lock aria-hidden className="mr-0.5 inline size-3 align-baseline text-accent" />
      ) : null}
      {text}
    </span>
  );
}

function CardView({
  card,
  index,
  genLabel,
  onField,
}: {
  card: ResultCard;
  index: number;
  /** 和目前的產生器不同時顯示（鎖住留下來的卡） */
  genLabel: string | null;
  onField: (target: FieldTarget, el: HTMLElement) => void;
}) {
  const lines = partLines(card.parts);
  const n = index + 1;
  return (
    <li
      data-testid="result-card"
      data-locked={card.locked || undefined}
      className={cn(
        'flex min-w-0 flex-col gap-1 rounded-lg border bg-surface p-2',
        card.locked ? 'border-accent bg-accent-soft' : 'border-border',
      )}
    >
      {genLabel ? (
        <span className="self-start rounded-sm border border-border-strong px-1 text-xs text-muted">
          {genLabel}
        </span>
      ) : null}
      <div
        data-testid="result-text"
        className="min-w-0 break-words px-1 text-base leading-relaxed text-fg"
      >
        {lines.map((line, li) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 一張卡裡的行不會重排
          <p key={li} className="m-0">
            {line.map((part, pi) =>
              part.k && part.l ? (
                <FieldSpan
                  // biome-ignore lint/suspicious/noArrayIndexKey: 一行裡的段落不會重排
                  key={pi}
                  label={part.l}
                  text={part.t}
                  locked={card.lockedFields.includes(part.k)}
                  onOpen={(el) =>
                    onField({ card, key: part.k as string, label: part.l as string }, el)
                  }
                />
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: 一行裡的段落不會重排
                <span key={pi}>{part.t}</span>
              ),
            )}
          </p>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1">
        <IconButton
          label={S.card.copyLabel(n)}
          icon={<Copy />}
          size="sm"
          variant="ghost"
          onClick={() => void copyCard(card.id)}
        />
        <IconButton
          label={S.card.rerollLabel(n)}
          icon={<RefreshCw />}
          size="sm"
          variant="ghost"
          onClick={() => void rerollOne(card.id)}
        />
        <IconButton
          label={card.locked ? S.card.unlock(n) : S.card.lock(n)}
          icon={card.locked ? <Lock /> : <LockOpen />}
          pressed={card.locked}
          size="sm"
          variant="ghost"
          onClick={() => toggleCardLock(card.id)}
        />
        <MenuButton
          label={S.card.moreShort}
          aria-label={S.card.more(n)}
          variant="ghost"
          size="sm"
          align="end"
          items={[
            {
              label: S.card.save,
              icon: <ListPlus />,
              onSelect: () => saveCard(card.id),
              'data-testid': 'card-save',
            },
            {
              label: S.card.ccfolia,
              description: S.card.ccfoliaHint,
              icon: <ClipboardPlus />,
              onSelect: () => void copyCcfolia(card.id),
              'data-testid': 'card-ccfolia',
            },
          ]}
        />
      </div>
    </li>
  );
}

export function ResultList({
  results,
  current,
  labelOf,
}: {
  results: readonly ResultCard[];
  current: GeneratorDef;
  labelOf: (gen: string) => string | null;
}) {
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  const trigger = useRef<HTMLElement | null>(null);

  const openField = ({ card, key, label }: FieldTarget, el: HTMLElement) => {
    trigger.current = el;
    const r = el.getBoundingClientRect();
    const locked = card.lockedFields.includes(key);
    setMenu({
      x: r.left,
      y: r.bottom,
      items: [
        {
          label: S.card.fieldReroll(label),
          icon: <Dices />,
          onSelect: () => void rerollOneField(card.id, key),
        },
        {
          label: locked ? S.card.fieldUnlock(label) : S.card.fieldLock(label),
          icon: locked ? <LockOpen /> : <Lock />,
          onSelect: () => toggleFieldLock(card.id, key),
        },
        {
          label: S.card.fieldCopy(label),
          icon: <Copy />,
          onSelect: () => void copyField(card.id, key),
        },
      ],
    });
  };

  return (
    <>
      <ul
        aria-label={S.list.aria}
        className={cn(
          'm-0 grid list-none grid-cols-1 gap-2 p-0',
          !current.block && 'sm:grid-cols-2 2xl:grid-cols-3',
        )}
      >
        {results.map((card, i) => (
          <CardView
            key={card.id}
            card={card}
            index={i}
            genLabel={card.gen === current.id ? null : labelOf(card.gen)}
            onField={openField}
          />
        ))}
      </ul>
      <ContextMenu
        state={menu}
        aria-label={S.card.fieldMenu}
        onClose={() => {
          setMenu(null);
          /* 選單關掉時焦點回到點的那一欄（重抽之後同一個按鈕還在） */
          requestAnimationFrame(() => {
            if (trigger.current?.isConnected) trigger.current.focus({ preventScroll: true });
          });
        }}
      />
    </>
  );
}
