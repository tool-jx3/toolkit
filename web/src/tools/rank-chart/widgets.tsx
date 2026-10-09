/**
 * 設定欄的小元件：分頁標籤、「下一步」、遊戲中的鎖定提示、有字數上限的文字欄。
 */
import { ArrowRight, Lock } from 'lucide-react';
import { Button, Notice, TextInput, useConfirm } from '@/ui';
import { endGame } from './game';
import { charLength, limitChars } from './model';
import { gesture, runNow, setTab, useGame } from './store';
import { S, type TabId } from './strings';

export function TabLabel({ id }: { id: TabId }) {
  const t = S.tabs[id];
  return (
    <span className="inline-flex items-baseline gap-1.5" data-rc-tab={id}>
      <span className="text-xs text-muted tabular-nums">{t.n}</span>
      <span>{t.label}</span>
    </span>
  );
}

/** 「下一步：…」：切到下一個分頁、焦點移到分頁列；窄畫面時把分頁列捲到上方 */
export function NextStep({ to }: { to: TabId }) {
  return (
    <Button
      variant="secondary"
      className="self-stretch"
      onClick={() => {
        setTab(to);
        requestAnimationFrame(() => {
          const trigger = document
            .querySelector<HTMLElement>(`[data-rc-tab="${to}"]`)
            ?.closest<HTMLElement>('[role="tab"]');
          trigger?.focus({ preventScroll: true });
          if (window.matchMedia('(max-width: 1023px)').matches)
            trigger?.closest<HTMLElement>('[role="tablist"]')?.scrollIntoView({ block: 'start' });
        });
      }}
    >
      {S.next(S.tabs[to].label)}
      <ArrowRight aria-hidden className="size-4" />
    </Button>
  );
}

/** 遊戲進行中：設定鎖住的提示＋「回到設定」（還沒完成時先確認） */
export function LockNotice() {
  const run = useGame((s) => s.data.run);
  const confirm = useConfirm();
  if (!run) return null;
  const done = run.phase === 'complete';
  return (
    <Notice
      tone="warning"
      action={
        <Button
          size="sm"
          onClick={async () => {
            if (
              runNow()?.phase !== 'complete' &&
              !(await confirm({
                title: S.backTitle,
                description: S.backText,
                confirmLabel: S.backConfirm,
                danger: true,
              }))
            )
              return;
            endGame();
          }}
        >
          {S.backToSetup}
        </Button>
      }
    >
      <span data-testid="lock-notice" className="flex flex-col">
        <strong className="flex items-center gap-1">
          <Lock aria-hidden className="size-3.5" />
          {S.lockTitle(done)}
        </strong>
        <span className="text-xs">{S.lockText}</span>
      </span>
    </Notice>
  );
}

/**
 * 有字數上限（以字元計，emoji 算一個字）的文字欄：從聚焦到離開算一步復原。
 * onChange 收到截好的文字；onBlur 可以順便整理（例如去頭尾空白）。
 */
export function LimitedInput({
  value,
  max,
  onChange,
  onBlurValue,
  disabled,
  placeholder,
  field,
  ...rest
}: {
  value: string;
  max: number;
  onChange: (v: string) => void;
  onBlurValue?: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
  field?: string;
  'aria-label'?: string;
  'data-char-name'?: string;
  className?: string;
}) {
  return (
    <TextInput
      {...rest}
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      autoComplete="off"
      data-field={field}
      data-count={charLength(value)}
      onFocus={gesture.begin}
      onChange={(e) => {
        /*
         * 上限以字元計；讀原作設定檔時接上助詞的文字可能比上限長（存檔多留了位置）：這時可以刪、可以改，
         * 但不能再變長（不截掉原本的字）。一般情況貼上太長時截到上限。
         */
        const v = e.currentTarget.value;
        const cap = Math.max(max, charLength(value));
        if (charLength(v) <= cap) onChange(v);
        else if (charLength(value) < cap) onChange(limitChars(v, cap));
      }}
      onBlur={(e) => {
        onBlurValue?.(e.currentTarget.value);
        gesture.commit();
      }}
    />
  );
}
