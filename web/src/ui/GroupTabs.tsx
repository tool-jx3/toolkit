/**
 * 群組分頁：同一群組的工具互相切換（一般連結，每個工具仍是獨立網址）。
 * 群組只有一個工具時不顯示。
 */
import { GROUPS, getTool, hrefToTool, type ToolEntry, toolsInGroup } from '@/registry';
import { cn } from './cn';

export interface GroupTabsProps {
  toolId: string;
  /** 指定分頁清單（預設從 registry 找同群組的工具；元件展示頁用） */
  tools?: readonly ToolEntry[];
  className?: string;
}

export function GroupTabs({ toolId, tools, className }: GroupTabsProps) {
  const tool = tools?.find((t) => t.id === toolId) ?? getTool(toolId);
  if (!tool) return null;
  const siblings = tools ?? toolsInGroup(tool.group);
  if (siblings.length < 2) return null;
  return (
    <nav
      aria-label={`${GROUPS[tool.group].name}工具`}
      className={cn('min-w-0 overflow-x-auto', className)}
    >
      <ul className="m-0 flex list-none gap-1 p-0">
        {siblings.map((t) => {
          const current = t.id === toolId;
          return (
            <li key={t.id}>
              <a
                href={current ? undefined : hrefToTool(t)}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  'inline-flex h-7 items-center whitespace-nowrap rounded-md px-2.5 text-sm no-underline',
                  current
                    ? 'bg-accent-soft font-medium text-fg'
                    : 'text-muted hover:bg-surface-2 hover:text-fg',
                )}
              >
                {t.name}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
