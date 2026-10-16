/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 分頁列：點一下切換、按兩下改名、拖曳換順序、×刪除（可以復原）、＋新增、複製；每個分頁有選單（改名、複製、往左／往右移、刪除）。
 * 最左邊是「檔案庫」鈕（打開／收起，原作也放在這裡）。
 */
import { ChevronDown, Copy, Library, Plus, X } from 'lucide-react';
import { DropdownMenu } from 'radix-ui';
import { useRef, useState } from 'react';
import { Button, IconButton, TextInput, useToast } from '@/ui';
import { sheetName } from '../engine/geom';
import { addSheet, deleteSheet, moveSheet, renameSheet, switchSheet } from '../state/actions';
import { activeIndex, setUi, useProject, useUi } from '../state/store';
import { S } from '../strings';
import { MENU_CONTENT, MENU_ITEM } from './menu';
import { undo } from './undo';

function RenameInput({ idx, initial }: { idx: number; initial: string }) {
  const [v, setV] = useState(initial);
  const done = useRef(false);
  const finish = (ok: boolean) => {
    if (done.current) return;
    done.current = true;
    if (ok) renameSheet(idx, v);
    setUi({ renaming: null });
  };
  return (
    <TextInput
      autoFocus
      value={v}
      aria-label={S.sheets.renameLabel}
      className="h-7 w-32 text-sm"
      onChange={(e) => setV(e.target.value)}
      onFocus={(e) => e.currentTarget.select()}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          finish(false);
        }
      }}
      data-testid="sheet-rename-input"
    />
  );
}

export function SheetBar() {
  const sheets = useProject((s) => s.data.sheets);
  const active = useProject((s) => activeIndex(s.data));
  const renaming = useUi((u) => u.renaming);
  const libOpen = useUi((u) => u.libOpen);
  const toast = useToast();
  const drag = useRef<{ idx: number; x: number; moved: boolean; pid: number } | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const tabs = useRef<HTMLDivElement>(null);

  const remove = (idx: number) => {
    const name = sheetName(sheets[idx]);
    if (!deleteSheet(idx)) return;
    toast({
      title: S.sheets.deleted(name),
      tone: 'info',
      action: { label: S.msg.undo, onClick: undo },
    });
  };
  const targetAt = (clientX: number): number => {
    const els = tabs.current?.querySelectorAll<HTMLElement>('[data-sheet-tab]') ?? [];
    let to = els.length - 1;
    for (let i = 0; i < els.length; i++) {
      const r = els[i].getBoundingClientRect();
      if (clientX < r.left + r.width / 2) {
        to = i;
        break;
      }
    }
    return to;
  };

  return (
    <div className="flex min-w-0 items-center gap-1" data-testid="sheet-bar">
      <Button
        size="sm"
        variant={libOpen ? 'primary' : 'secondary'}
        icon={<Library />}
        className="shrink-0"
        aria-pressed={libOpen}
        title={S.lib.openTip}
        onClick={() =>
          setUi(libOpen ? { libOpen: false, libMode: null, libEdit: null } : { libOpen: true })
        }
        data-testid="library-open"
      >
        {S.lib.open}
      </Button>
      <div
        ref={tabs}
        role="tablist"
        aria-label={S.sheets.label}
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto pb-0.5"
      >
        {sheets.map((s, i) => {
          const name = sheetName(s);
          const isActive = i === active;
          if (renaming === s.id)
            return (
              <div key={s.id} data-sheet-tab>
                <RenameInput idx={i} initial={s.name} />
              </div>
            );
          return (
            <div
              key={s.id}
              data-sheet-tab
              className={`flex shrink-0 items-center rounded-md border text-sm ${isActive ? 'border-accent bg-accent-soft text-fg' : 'border-border bg-surface text-muted hover:text-fg'} ${over === i ? 'outline-2 outline-accent' : ''}`}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                className="max-w-[10rem] touch-pan-x truncate px-2.5 py-1"
                onClick={() => {
                  if (drag.current?.moved) return;
                  switchSheet(i);
                }}
                onDoubleClick={() => setUi({ renaming: s.id })}
                onPointerDown={(e) => {
                  if (e.button !== 0 || e.pointerType === 'touch') return;
                  drag.current = { idx: i, x: e.clientX, moved: false, pid: e.pointerId };
                }}
                onPointerMove={(e) => {
                  const d = drag.current;
                  if (!d || d.pid !== e.pointerId) return;
                  if (!d.moved && Math.abs(e.clientX - d.x) > 6) {
                    d.moved = true;
                    e.currentTarget.setPointerCapture(e.pointerId);
                  }
                  if (d.moved) setOver(targetAt(e.clientX));
                }}
                onPointerUp={(e) => {
                  const d = drag.current;
                  setOver(null);
                  if (!d || d.pid !== e.pointerId) return;
                  if (d.moved) {
                    moveSheet(d.idx, targetAt(e.clientX));
                    setTimeout(() => {
                      drag.current = null;
                    }, 0);
                  } else drag.current = null;
                }}
                data-testid="sheet-tab"
              >
                {name}
              </button>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger
                  className="grid h-7 w-5 place-items-center text-muted hover:text-fg [&_svg]:size-3.5"
                  aria-label={S.sheets.menu(name)}
                  data-testid="sheet-menu"
                >
                  <ChevronDown />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="start" sideOffset={4} className={MENU_CONTENT}>
                    <DropdownMenu.Item
                      className={MENU_ITEM}
                      onSelect={() => setUi({ renaming: s.id })}
                    >
                      {S.sheets.rename}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className={MENU_ITEM}
                      onSelect={() => {
                        switchSheet(i);
                        addSheet(true);
                      }}
                    >
                      {S.sheets.copy}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className={MENU_ITEM}
                      disabled={i === 0}
                      onSelect={() => moveSheet(i, i - 1)}
                    >
                      {S.sheets.moveLeft}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className={MENU_ITEM}
                      disabled={i === sheets.length - 1}
                      onSelect={() => moveSheet(i, i + 1)}
                    >
                      {S.sheets.moveRight}
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      className={MENU_ITEM}
                      disabled={sheets.length <= 1}
                      onSelect={() => remove(i)}
                    >
                      {S.sheets.remove}
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <button
                type="button"
                className="grid h-7 w-6 place-items-center rounded-r-md text-muted hover:text-danger disabled:opacity-40 disabled:hover:text-muted [&_svg]:size-3.5"
                aria-label={
                  sheets.length <= 1 ? S.sheets.removeOnly : `${S.sheets.remove}「${name}」`
                }
                title={sheets.length <= 1 ? S.sheets.removeOnly : S.sheets.remove}
                disabled={sheets.length <= 1}
                onClick={() => remove(i)}
                data-testid="sheet-close"
              >
                <X />
              </button>
            </div>
          );
        })}
      </div>
      <IconButton
        size="sm"
        icon={<Plus />}
        label={S.sheets.add}
        onClick={() => addSheet(false)}
        data-testid="sheet-add"
      />
      <IconButton
        size="sm"
        icon={<Copy />}
        label={S.sheets.copy}
        onClick={() => addSheet(true)}
        data-testid="sheet-copy"
      />
    </div>
  );
}
