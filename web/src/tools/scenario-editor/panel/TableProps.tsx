/**
 * 表格的設定（F100～F106）：標題、外觀、大小、小格線（每格一個文字欄）、放進儲存格、輸出。
 */
import { copyText } from '@/core/files';
import { Button, Checkbox, Field, Section, Segmented, Select, TextArea, TextInput } from '@/ui';
import { CELL_ADD, typeName } from '../model/blocks';
import {
  cellHead,
  cellWrite,
  setLook,
  tblAddCol,
  tblAddRow,
  tblCols,
  tblDelCol,
  tblDelRow,
  tblOutText,
  tblRows,
} from '../model/table';
import type { Block, BlockType, Table, TableLook, TableOutMode } from '../model/types';
import { addToCell } from '../ops';
import { editBlock, say, setUi, useUi } from '../store';
import { S } from '../strings';
import { PreviewButton } from './BlockPanel';

function setT(b: Block, fn: (t: Table) => void): void {
  editBlock(b.id, (x) => {
    if (x.tbl) fn(x.tbl);
  });
}

/** 輸出欄的文字（自己寫以外是產生的文字） */
export const outShown = (t: Table): string =>
  t.outMode === 'free' ? String(t.out ?? '') : tblOutText(t);

export function TableProps({ b }: { b: Block }) {
  const t = b.tbl;
  const cell = useUi((s) => (s.cell?.tbl === b.id ? s.cell : null));
  if (!t) return null;
  const R = tblRows(t);
  const C = tblCols(t);
  const grid = t.look === 'grid';
  const delAt = (which: 'row' | 'col') => {
    if (!cell) {
      say(
        which === 'row'
          ? '請先點一下要刪除的那一列的儲存格。'
          : '請先點一下要刪除的那一欄的儲存格。',
        'warn',
      );
      return;
    }
    if ((which === 'row' ? R : C) <= 1) {
      say(which === 'row' ? '只剩一列，不能再刪。' : '只剩一欄，不能再刪。', 'warn');
      return;
    }
    setT(b, (x) => (which === 'row' ? tblDelRow(x, cell.r) : tblDelCol(x, cell.c)));
    setUi({ cell: null });
  };
  const copyOut = async () => {
    const txt = outShown(t);
    if (!txt.trim()) {
      say(S.status.outEmpty, 'warn');
      return;
    }
    const ok = await copyText(txt);
    say(ok ? S.status.outCopied : S.status.copyFailed, ok ? 'ok' : 'err');
  };
  return (
    <Section title="表格" fixed>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Checkbox
          label="表格名稱"
          checked={t.capOn !== false}
          onCheckedChange={(v) => setT(b, (x) => (x.capOn = !!v))}
        />
        <Checkbox
          label="欄標題（第 1 列）"
          checked={t.head}
          onCheckedChange={(v) => setT(b, (x) => (x.head = !!v))}
        />
        <Checkbox
          label="列標題（第 1 欄）"
          checked={t.rowhead && grid}
          disabled={!grid}
          onCheckedChange={(v) => setT(b, (x) => (x.rowhead = !!v))}
        />
      </div>
      {!grid ? <p className="m-0 text-xs text-muted">列標題只限格線。</p> : null}
      {t.capOn !== false ? (
        <Field label="表格名稱" hint="顯示在表格上方；空白時不顯示。">
          <TextInput
            value={String(t.name ?? '')}
            data-tname={b.id}
            onChange={(e) => setT(b, (x) => (x.name = e.target.value))}
          />
        </Field>
      ) : null}
      <Field
        label="外觀"
        hint={
          t.look === 'list'
            ? '條列：每列一段，「編號：標題」＋第 3 欄以後的內文。'
            : t.look === 'card'
              ? '標題框：第 1 欄的題名浮在框線上，第 2 欄以後是內容。'
              : undefined
        }
      >
        <Segmented
          size="sm"
          value={t.look}
          onValueChange={(v: TableLook) => setT(b, (x) => setLook(x, v))}
          options={[
            { value: 'grid', label: '格線' },
            { value: 'list', label: '條列' },
            { value: 'card', label: '標題框' },
          ]}
        />
      </Field>
      <Field label="大小" hint={`${R} 列 × ${C} 欄。刪除這一列／欄：先點一下那一格。`}>
        <div className="grid grid-cols-2 gap-1">
          <Button size="sm" variant="secondary" onClick={() => setT(b, (x) => tblAddRow(x))}>
            ＋列
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setT(b, (x) => tblDelRow(x, tblRows(x) - 1))}
            disabled={R <= 1}
          >
            −列
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setT(b, (x) => tblAddCol(x))}>
            ＋欄
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setT(b, (x) => tblDelCol(x, tblCols(x) - 1))}
            disabled={C <= 1}
          >
            −欄
          </Button>
          <Button size="sm" variant="danger" onClick={() => delAt('row')}>
            刪除這一列
          </Button>
          <Button size="sm" variant="danger" onClick={() => delAt('col')}>
            刪除這一欄
          </Button>
        </div>
      </Field>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs" aria-label="儲存格">
          <tbody>
            {Array.from({ length: R }, (_, r) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: 列、欄的位置就是身分
              <tr key={r}>
                {Array.from({ length: C }, (_, c) => {
                  const head = (t.head && r === 0) || (grid && t.rowhead && c === 0);
                  const on = cell?.r === r && cell?.c === c;
                  return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: 列、欄的位置就是身分
                    <td key={c} className="border border-border p-0 align-top">
                      <CellField b={b} r={r} c={c} head={head} on={on} />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" onClick={() => setUi({ tableWide: b.id })}>
          在寬視窗中編寫
        </Button>
      </div>
      <Field
        label="放進儲存格"
        hint={
          cell
            ? `目標：第 ${cell.r + 1} 列第 ${cell.c + 1} 欄。`
            : '先點一下儲存格，再從這裡選要放進去的書式。'
        }
      >
        <Select
          size="sm"
          value="none"
          onValueChange={(v) => {
            if (v !== 'none')
              void addToCell(v as BlockType, cell ? { tbl: b.id, r: cell.r, c: cell.c } : null);
          }}
          options={[
            { value: 'none', label: '選擇書式…' },
            ...CELL_ADD.map((k) => ({ value: k, label: typeName(k) })),
          ]}
        />
      </Field>
      <Field label="輸出">
        <Segmented
          size="sm"
          value={t.outMode}
          onValueChange={(v: TableOutMode) =>
            setT(b, (x) => {
              x.outMode = v;
              if (v !== 'free') x.out = tblOutText(x);
            })
          }
          options={[
            { value: 'roll', label: 'roll-table' },
            { value: 'simple', label: '簡單文字' },
            { value: 'free', label: '自己寫' },
          ]}
        />
      </Field>
      {t.outMode !== 'free' ? (
        <div className="flex items-end gap-1">
          {t.outMode === 'roll' ? (
            <Field label="骰子算式">
              <TextInput
                value={String(t.dice ?? '')}
                placeholder={`1D${Math.max(1, R - (t.head ? 1 : 0))}`}
                onChange={(e) => setT(b, (x) => (x.dice = e.target.value))}
              />
            </Field>
          ) : null}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              setT(b, (x) => (x.out = tblOutText(x)));
              say('已重新產生');
            }}
          >
            重新產生
          </Button>
        </div>
      ) : null}
      <TextArea
        rows={4}
        aria-label="輸出的文字"
        value={outShown(t)}
        onChange={(e) =>
          setT(b, (x) => {
            x.out = e.target.value;
            x.outMode = 'free';
          })
        }
      />
      <div className="flex flex-wrap gap-1">
        <Button size="sm" onClick={() => void copyOut()}>
          複製輸出
        </Button>
        <PreviewButton id={b.id} />
      </div>
    </Section>
  );
}

/** 一格的文字欄（編輯該格第一個可輸入段落的文字；隨內容長高，最多約 6 行） */
export function CellField({
  b,
  r,
  c,
  head,
  on,
  big = false,
}: {
  b: Block;
  r: number;
  c: number;
  head: boolean;
  on: boolean;
  big?: boolean;
}) {
  const t = b.tbl as Table;
  const v = cellHead(t, r, c);
  return (
    <textarea
      value={v}
      rows={1}
      data-cell-of={b.id}
      data-cell={`${r},${c}`}
      aria-label={`第 ${r + 1} 列第 ${c + 1} 欄`}
      className={[
        'block w-full resize-none border-0 bg-transparent px-1.5 py-1 text-fg focus:outline-2 focus:outline-accent',
        head ? 'font-bold' : '',
        on ? 'bg-accent-soft' : '',
        big ? 'min-h-16 text-sm' : 'min-w-16 text-xs',
      ].join(' ')}
      style={
        { fieldSizing: 'content', maxHeight: big ? undefined : '9.5em' } as React.CSSProperties
      }
      onFocus={() => setUi({ cell: { tbl: b.id, r, c } })}
      onChange={(e) =>
        editBlock(b.id, (x) => {
          if (x.tbl) cellWrite(x.tbl, r, c, e.target.value);
        })
      }
    />
  );
}
