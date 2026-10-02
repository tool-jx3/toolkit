/**
 * 群組分頁：同一群組的工具互相切換（一般連結，每個工具仍是獨立網址）。
 * 群組只有一個工具時不顯示。
 * 分頁永遠只佔一行：放不下時整列橫向捲動（觸控可滑、鍵盤 Tab 聚焦時自動捲到），開頁時目前的分頁捲進可見範圍。
 */
import { useLayoutEffect, useRef } from 'react';
import { GROUPS, getTool, hrefToTool, type ToolEntry, toolsInGroup } from '@/registry';
import { cn } from './cn';

export interface GroupTabsProps {
  toolId: string;
  /** 指定分頁清單（預設從 registry 找同群組的工具；元件展示頁用） */
  tools?: readonly ToolEntry[];
  className?: string;
}

/** 把目前的分頁捲進分頁列的可見範圍（只捲分頁列本身，不動整頁） */
function revealCurrent(nav: HTMLElement) {
  const cur = nav.querySelector<HTMLElement>('[aria-current="page"]');
  if (!cur) return;
  const left = cur.offsetLeft - nav.offsetLeft;
  const right = left + cur.offsetWidth;
  if (left < nav.scrollLeft) nav.scrollLeft = left;
  else if (right > nav.scrollLeft + nav.clientWidth) nav.scrollLeft = right - nav.clientWidth;
}

export function GroupTabs({ toolId, tools, className }: GroupTabsProps) {
  const navRef = useRef<HTMLElement>(null);
  const tool = tools?.find((t) => t.id === toolId) ?? getTool(toolId);
  const siblings = tool ? (tools ?? toolsInGroup(tool.group)) : [];
  // biome-ignore lint/correctness/useExhaustiveDependencies: 換工具或分頁清單時重新對齊
  useLayoutEffect(() => {
    if (navRef.current) revealCurrent(navRef.current);
  }, [toolId, siblings.length]);
  if (!tool || siblings.length < 2) return null;
  return (
    <nav
      ref={navRef}
      aria-label={`${GROUPS[tool.group].name}工具`}
      className={cn(
        'min-w-0 overflow-x-auto overscroll-x-contain [scrollbar-width:thin]',
        className,
      )}
    >
      <ul className="m-0 flex w-max list-none gap-1 p-0">
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
