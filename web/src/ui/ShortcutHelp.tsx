/**
 * 快捷鍵說明對話框：從工具傳入的快捷鍵表產生。
 */
import { Dialog } from './Dialog';
import { Kbd } from './Kbd';
import { formatCombo, type Shortcut } from './shortcuts';

export interface ShortcutHelpProps {
  shortcuts: readonly Shortcut[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ShortcutHelp({ shortcuts, open, onOpenChange }: ShortcutHelpProps) {
  const groups = new Map<string, Shortcut[]>();
  for (const s of shortcuts) {
    const g = s.group ?? '一般';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(s);
  }
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="快捷鍵"
      description="在輸入框裡打字時，大部分快捷鍵不會作用。"
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
                  <div key={`${group}-${s.label}`} className="contents">
                    <dt className="text-sm text-fg">{s.label}</dt>
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
