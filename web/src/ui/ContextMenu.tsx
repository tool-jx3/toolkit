/**
 * 右鍵選單（地圖編輯器移植時新增）：在指定的畫面位置打開一個選單（Radix DropdownMenu，外觀同 ProjectMenu）。
 * 由工具自己決定什麼時候開、有哪些項目（例如右鍵點到畫布上的物件才開），所以不綁在觸發元素上：
 *
 * ```tsx
 * const [menu, setMenu] = useState<ContextMenuState | null>(null);
 * <div onContextMenu={(e) => { e.preventDefault(); setMenu({ ...contextMenuPoint(e), items }); }}>…</div>
 * <ContextMenu state={menu} onClose={() => setMenu(null)} aria-label="物件" />
 * ```
 *
 * 鍵盤：Shift＋F10／選單鍵在有焦點的元素上也會觸發 contextmenu（座標是 0），`contextMenuPoint` 改用元素的位置。
 * 選單打開時焦點移到第一項，↑↓ 移動、Enter 選取、Esc 關閉。
 */
import { DropdownMenu } from 'radix-ui';
import { Fragment, type ReactNode, useEffect, useRef } from 'react';
import { cn } from './cn';

export interface ContextMenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** 紅色（刪除） */
  danger?: boolean;
  disabled?: boolean;
  /** 在這一項前面畫分隔線 */
  separatorBefore?: boolean;
}

export interface ContextMenuState {
  /** 視窗座標（clientX／clientY） */
  x: number;
  y: number;
  items: readonly ContextMenuItem[];
}

export interface ContextMenuProps {
  /** null＝關閉 */
  state: ContextMenuState | null;
  onClose: () => void;
  'aria-label'?: string;
}

const itemClass =
  'flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-fg outline-none data-highlighted:bg-accent-soft data-disabled:cursor-not-allowed data-disabled:opacity-50 [&_svg]:size-4 [&_svg]:text-muted';

/** contextmenu 事件的位置：滑鼠是指標的位置；鍵盤觸發（座標 0, 0）時用元素的左下角 */
export function contextMenuPoint(e: {
  clientX: number;
  clientY: number;
  currentTarget: EventTarget | null;
}): { x: number; y: number } {
  if ((e.clientX !== 0 || e.clientY !== 0) && Number.isFinite(e.clientX))
    return { x: e.clientX, y: e.clientY };
  const el = e.currentTarget instanceof Element ? e.currentTarget : null;
  const r = el?.getBoundingClientRect();
  return r ? { x: r.left + 8, y: r.bottom } : { x: 0, y: 0 };
}

export function ContextMenu({ state, onClose, ...rest }: ContextMenuProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  /* 打開時焦點移到第一個可以選的項目（Radix 由程式打開時只聚焦在選單本身） */
  useEffect(() => {
    if (!state) return;
    const id = requestAnimationFrame(() => {
      contentRef.current
        ?.querySelector<HTMLElement>('[role="menuitem"]:not([data-disabled])')
        ?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [state]);
  return (
    <DropdownMenu.Root
      open={!!state}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      modal={false}
    >
      <DropdownMenu.Trigger asChild>
        <span
          aria-hidden
          tabIndex={-1}
          data-context-menu-anchor
          className="pointer-events-none fixed size-0"
          style={{ left: state?.x ?? 0, top: state?.y ?? 0 }}
        />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          ref={contentRef}
          align="start"
          side="bottom"
          sideOffset={2}
          collisionPadding={8}
          aria-label={rest['aria-label']}
          onCloseAutoFocus={(e) => e.preventDefault()}
          className="z-50 min-w-44 rounded-md border border-border bg-surface p-1 shadow-2"
          data-testid="context-menu"
        >
          {(state?.items ?? []).map((it) => (
            <Fragment key={it.label}>
              {it.separatorBefore ? (
                <DropdownMenu.Separator className="my-1 h-px bg-border" />
              ) : null}
              <DropdownMenu.Item
                className={cn(itemClass, it.danger && 'text-danger [&_svg]:text-danger')}
                disabled={it.disabled}
                onSelect={() => it.onSelect()}
              >
                {it.icon}
                {it.label}
              </DropdownMenu.Item>
            </Fragment>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
