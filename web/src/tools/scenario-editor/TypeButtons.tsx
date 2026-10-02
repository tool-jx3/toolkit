/**
 * 書式按鈕（F050～F053）與段落操作（F060～F068）。
 */
import {
  ArrowDown,
  ArrowUp,
  ClipboardCopy,
  ClipboardPaste,
  Combine,
  Copy,
  CopyPlus,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { copyText } from '@/core/files';
import { Button, cn, IconButton, isMac } from '@/ui';
import { findBlock, POP_SKIP, TYPE_GROUPS, TYPES } from './model/blocks';
import type { BlockType } from './model/types';
import {
  addBelow,
  copyBlocks,
  copyTargetText,
  deleteSel,
  dupSel,
  mergeSel,
  moveSel,
  pasteBlocks,
  setPageCols,
  targetPages,
  typeButton,
} from './ops';
import { pageSettingAt } from './render/html';
import { clearSelection, say, useDoc, useUi } from './store';
import { S } from './strings';

/** 書式快捷鍵的顯示（Ctrl＋Shift＋鍵） */
export const typeKeyText = (key: string): string => (isMac() ? `⌃⇧${key}` : `Ctrl＋Shift＋${key}`);

export function TypeButtons({ exclude = [] }: { exclude?: readonly BlockType[] }) {
  const sel = useUi((s) => s.sel);
  const d = useDoc((s) => s.data);
  const current = sel.length ? findBlock(d, sel[0])?.b.type : null;
  return (
    <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0" aria-label="書式">
      {TYPE_GROUPS.map((g) => (
        <div key={g.k} className="flex flex-wrap items-center gap-1">
          <span className="w-8 shrink-0 text-[11px] text-muted">{g.name}</span>
          {TYPES.filter((t) => t.group === g.k && !exclude.includes(t.k)).map((t) => (
            <button
              key={t.k}
              type="button"
              data-type={t.k}
              title={`${t.name}（${typeKeyText(t.key)}）`}
              aria-pressed={current === t.k}
              onClick={() => void typeButton(t.k)}
              className={cn(
                'inline-flex h-7 items-center gap-1 rounded-sm border px-1.5 text-xs transition-colors',
                current === t.k
                  ? 'border-accent bg-accent text-accent-contrast'
                  : 'border-border bg-surface-2 text-fg hover:border-accent',
              )}
            >
              <span>{t.name}</span>
              <span className={cn('text-[10px]', current === t.k ? 'opacity-80' : 'text-muted')}>
                {t.key}
              </span>
            </button>
          ))}
        </div>
      ))}
    </fieldset>
  );
}

/** 書式按鈕在彈出視窗編輯裡用：不含換頁、換欄、封面、版權頁、目錄 */
export const POPUP_EXCLUDE = POP_SKIP;

export function BlockOps({ compact = false }: { compact?: boolean }) {
  const sel = useUi((s) => s.sel);
  const clip = useUi((s) => s.clip);
  const pageSel = useUi((s) => s.pageSel);
  const layout = useUi((s) => s.layout);
  const d = useDoc((s) => s.data);
  const has = sel.length > 0;
  void pageSel;
  void layout;
  const pages = targetPages();
  const colsOf = pages.map((i) => pageSettingAt(d, i).cols);
  const all1 = colsOf.every((c) => c === 1);
  const all2 = colsOf.every((c) => c === 2);
  const copyTxt = async () => {
    const { text, n } = copyTargetText();
    const ok = await copyText(text);
    say(
      ok ? (n ? S.status.textCopied(n) : S.status.allCopied) : S.status.copyFailed,
      ok ? 'ok' : 'err',
    );
  };
  return (
    <div className="flex flex-col gap-1">
      <fieldset
        className="m-0 flex min-w-0 flex-wrap items-center gap-1 border-0 p-0"
        aria-label="段落操作"
      >
        <IconButton
          size="sm"
          variant="ghost"
          label="上移"
          icon={<ArrowUp />}
          disabled={!has}
          onClick={() => moveSel(-1)}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label="下移"
          icon={<ArrowDown />}
          disabled={!has}
          onClick={() => moveSel(1)}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label="合併選取的段落"
          icon={<Combine />}
          disabled={sel.length < 2}
          onClick={mergeSel}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label="複製段落（放在下方）"
          icon={<CopyPlus />}
          disabled={!has}
          onClick={dupSel}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label="在下方新增"
          icon={<Plus />}
          onClick={addBelow}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label="刪除選取的段落"
          icon={<Trash2 />}
          disabled={!has}
          onClick={() => void deleteSel(true)}
        />
        <span className="mx-1 h-5 w-px bg-border" aria-hidden />
        <IconButton
          size="sm"
          variant="ghost"
          label={has ? '複製選取段落的文字' : '複製全文'}
          icon={<ClipboardCopy />}
          onClick={() => void copyTxt()}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label="複製區塊（整段記下）"
          icon={<Copy />}
          disabled={!has}
          onClick={() => copyBlocks()}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label="貼上記下的區塊"
          icon={<ClipboardPaste />}
          disabled={!clip?.length}
          onClick={() => pasteBlocks()}
        />
        <IconButton
          size="sm"
          variant="ghost"
          label="取消選取（Esc）"
          icon={<X />}
          disabled={!has}
          onClick={clearSelection}
        />
      </fieldset>
      {compact ? null : (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <Button
            size="sm"
            variant={all1 ? 'primary' : 'secondary'}
            aria-pressed={all1}
            onClick={() => setPageCols(targetPages(), 1)}
          >
            這頁設為單欄
          </Button>
          <Button
            size="sm"
            variant={all2 ? 'primary' : 'secondary'}
            aria-pressed={all2}
            onClick={() => setPageCols(targetPages(), 2)}
          >
            這頁設為雙欄
          </Button>
          <span className="text-muted">對象：{pages.map((i) => `P.${i + 1}`).join('、')}</span>
        </div>
      )}
    </div>
  );
}
