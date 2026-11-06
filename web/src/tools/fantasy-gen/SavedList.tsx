/**
 * 我的清單：結果卡「加到清單」存下來的每一筆（會存進瀏覽器與專案檔），可以複製、刪除、全部複製、清空（可以復原）。
 */
import { Copy, Trash2, X } from 'lucide-react';
import { Button, IconButton, Section, useConfirm } from '@/ui';
import { clearSaved, copyAllSaved, copySaved, removeSaved } from './actions';
import { partLines, type SavedItem, TOOL_ID } from './logic';
import { S } from './strings';

export function SavedList({ saved }: { saved: readonly SavedItem[] }) {
  const confirm = useConfirm();
  return (
    <Section
      title={S.saved.title}
      description={saved.length ? S.saved.count(saved.length) : undefined}
      persistKey={`${TOOL_ID}:saved`}
      actions={
        saved.length ? (
          <span className="flex gap-1">
            <Button size="sm" variant="ghost" icon={<Copy />} onClick={() => void copyAllSaved()}>
              {S.saved.copyAll}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={<Trash2 />}
              onClick={async () => {
                if (
                  await confirm({
                    title: S.saved.clearTitle,
                    description: S.saved.clearDescription,
                    confirmLabel: S.saved.clearConfirm,
                    danger: true,
                  })
                )
                  clearSaved();
              }}
            >
              {S.saved.clear}
            </Button>
          </span>
        ) : null
      }
    >
      {saved.length ? (
        <ol aria-label={S.saved.aria} className="m-0 flex list-none flex-col gap-2 p-0">
          {saved.map((item, i) => (
            <li
              key={item.id}
              data-testid="saved-item"
              className="flex min-w-0 items-start gap-2 rounded-md border border-border bg-surface-2 p-2"
            >
              <div className="min-w-0 flex-1 break-words text-sm leading-relaxed text-fg">
                <span className="mr-1 rounded-sm border border-border-strong px-1 text-xs text-muted">
                  {item.label}
                </span>
                {partLines(item.parts).map((line, li) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 一筆裡的行不會重排
                  <span key={li} className={li ? 'block' : undefined}>
                    {line.map((p) => p.t).join('')}
                  </span>
                ))}
              </div>
              <span className="flex shrink-0 gap-1">
                <IconButton
                  label={S.saved.copy(i + 1)}
                  icon={<Copy />}
                  size="sm"
                  variant="ghost"
                  onClick={() => void copySaved(item.id)}
                />
                <IconButton
                  label={S.saved.remove(i + 1)}
                  icon={<X />}
                  size="sm"
                  variant="ghost"
                  onClick={() => removeSaved(item.id)}
                />
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="m-0 text-sm text-muted">{S.saved.empty}</p>
      )}
    </Section>
  );
}
