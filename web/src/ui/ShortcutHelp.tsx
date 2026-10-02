/**
 * 快捷鍵說明對話框：從工具傳入的快捷鍵表產生。
 * `allowInInput` 的快捷鍵（在輸入框裡打字時也會作用）在說明旁標示「輸入框裡也可用」，開頭的說明也跟著改；
 * 沒有這種快捷鍵時，內容與以前相同。
 */
import { Dialog } from './Dialog';
import { Kbd } from './Kbd';
import { formatCombo, type Shortcut } from './shortcuts';

export interface ShortcutHelpProps {
  shortcuts: readonly Shortcut[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** 標示在 allowInInput 快捷鍵旁的文字 */
export const IN_INPUT_BADGE = '輸入框裡也可用';
const DESCRIPTION = '在輸入框裡打字時，大部分快捷鍵不會作用。';
const DESCRIPTION_WITH_BADGE = `在輸入框裡打字時，大部分快捷鍵不會作用；標示「${IN_INPUT_BADGE}」的在輸入框裡照樣作用。`;

export function ShortcutHelp({ shortcuts, open, onOpenChange }: ShortcutHelpProps) {
  const groups = new Map<string, Shortcut[]>();
  for (const s of shortcuts) {
    const g = s.group ?? '一般';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(s);
  }
  const anyInInput = shortcuts.some((s) => s.allowInInput);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="快捷鍵"
      description={anyInInput ? DESCRIPTION_WITH_BADGE : DESCRIPTION}
      size="md"
    >
      <div className="flex flex-col gap-4">
        {[...groups].map(([group, list]) => (
          <section key={group}>
            <h3 className="m-0 mb-1.5 text-xs font-semibold tracking-wide text-muted">{group}</h3>
            <dl className="m-0 grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-1.5">
              {list.map((s) => {
                const keys = typeof s.keys === 'string' ? [s.keys] : s.keys;
                return (
                  <div
                    key={`${group}-${s.label}`}
                    className="contents"
                    data-in-input={s.allowInInput || undefined}
                  >
                    <dt className="text-sm text-fg">
                      {s.label}
                      {s.allowInInput ? (
                        <span className="ml-1.5 inline-block rounded-sm border border-border px-1 align-[0.1em] text-xs whitespace-nowrap text-muted">
                          {IN_INPUT_BADGE}
                        </span>
                      ) : null}
                    </dt>
                    <dd className="m-0 flex flex-wrap items-center justify-end gap-1">
                      {keys.map((k, i) => (
                        <span key={k} className="inline-flex items-center gap-1">
                          {i > 0 ? <span className="text-xs text-muted">或</span> : null}
                          {formatCombo(k).map((part) => (
                            <Kbd key={part}>{part}</Kbd>
                          ))}
                        </span>
                      ))}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
