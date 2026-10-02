/**
 * 表格的寬視窗（F104、F105）：欄名、刪列刪欄、每格的大文字欄、巢狀書式、放進儲存格、替儲存格建立彈出視窗。
 */
import { X } from 'lucide-react';
import { Button, Dialog, DialogClose, Field, IconButton, Select, TextInput } from '@/ui';
import { allBlocks, CELL_ADD, findBlock, typeName } from '../model/blocks';
import { makeBlock, newPopup, popupLabel } from '../model/doc';
import {
  cellHead,
  cellWrite,
  LOOK_HEADS,
  tblAddCol,
  tblAddRow,
  tblCols,
  tblDelCol,
  tblDelRow,
  tblRows,
} from '../model/table';
import type { BlockType } from '../model/types';
import { addToCell, uniquePopupName } from '../ops';
import { CellField } from '../panel/TableProps';
import { doc, edit, editBlock, say, setUi, useDoc, useUi } from '../store';
import { activeField, applyRichMark, RICH_BUTTONS } from '../textOps';
import { escapeLeavesField } from './PopupDialog';

export function TableDialog() {
  const id = useUi((s) => s.tableWide);
  const d = useDoc((s) => s.data);
  const cell = useUi((s) => (s.cell?.tbl === id ? s.cell : null));
  const b = id ? findBlock(d, id)?.b : null;
  if (!id || !b?.tbl) return null;
  const t = b.tbl;
  const R = tblRows(t);
  const C = tblCols(t);
  const colName = (c: number) =>
    t.look === 'grid'
      ? (t.head ? cellHead(t, 0, c).trim() : '') || `第 ${c + 1} 欄`
      : (LOOK_HEADS[t.look][c] ?? `第 ${c + 1} 欄`);
  const close = () => setUi({ tableWide: null });
  const popups = allBlocks(d).filter((x) => x.type === 'popup');

  /** 以選取的文字為名稱，建立只給儲存格用的彈出視窗（放在表格之後），選取的文字換成「＠名稱」 */
  const makeCellPopup = () => {
    const f = activeField();
    if (!cell || !f || f.cell !== `${cell.r},${cell.c}` || f.id !== b.id) {
      say('請先在儲存格裡選取要當作名稱的文字。', 'warn');
      return;
    }
    const cur = cellHead(t, cell.r, cell.c);
    const picked = cur
      .slice(f.a, f.z)
      .replace(/[\r\n]+/g, ' ')
      .trim();
    const name = uniquePopupName(picked || '詳細');
    const p = makeBlock('popup');
    p.pop = { ...newPopup(name), only: true };
    const next = picked
      ? `${cur.slice(0, f.a)}＠${name}${cur.slice(f.z)}`
      : `${cur}${cur && !cur.endsWith('\n') ? '\n' : ''}＠${name}`;
    edit((x) => {
      const fb = findBlock(x, b.id);
      if (!fb?.b.tbl) return;
      cellWrite(fb.b.tbl, cell.r, cell.c, next);
      fb.list.splice(fb.list.indexOf(fb.b) + 1, 0, p);
    });
    say(`已建立彈出視窗「${name}」`);
    setUi({ popEdit: p.id });
  };

  const pointTo = (popId: string) => {
    if (!cell) {
      say('請先點一下儲存格。', 'warn');
      return;
    }
    const target = findBlock(doc(), popId)?.b;
    if (!target) return;
    const cur = cellHead(t, cell.r, cell.c);
    editBlock(b.id, (x) => {
      if (x.tbl)
        cellWrite(
          x.tbl,
          cell.r,
          cell.c,
          `${cur}${cur && !cur.endsWith('\n') ? '\n' : ''}＠${popupLabel(target)}`,
        );
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && close()}
      title="在寬視窗中編寫表格"
      size="xl"
      className="max-w-[min(1300px,calc(100vw-2rem))]"
      onEscapeKeyDown={escapeLeavesField}
      footer={<DialogClose>完成</DialogClose>}
    >
      <div className="flex flex-col gap-2" data-testid="se-table-dialog">
        <Field label="表格名稱">
          <TextInput
            value={String(t.name ?? '')}
            data-tname={b.id}
            onChange={(e) =>
              editBlock(b.id, (x) => {
                if (x.tbl) x.tbl.name = e.target.value;
              })
            }
          />
        </Field>
        <div className="flex flex-wrap items-center gap-1">
          {RICH_BUTTONS.map((r) => (
            <button
              key={r.label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyRichMark(r.mark, r.label)}
              className="rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 text-xs hover:border-accent"
            >
              {r.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Field
            label="放進儲存格"
            hint={cell ? `目標：第 ${cell.r + 1} 列第 ${cell.c + 1} 欄` : '先點一下儲存格。'}
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
          <Button
            size="sm"
            variant="secondary"
            onMouseDown={(e) => e.preventDefault()}
            onClick={makeCellPopup}
          >
            ＋替這個儲存格建立彈出視窗
          </Button>
          {popups.length ? (
            <Field label="指向既有的彈出視窗">
              <Select
                size="sm"
                value="none"
                onValueChange={(v) => v !== 'none' && pointTo(v)}
                options={[
                  { value: 'none', label: '選擇…' },
                  ...popups.map((p) => ({ value: p.id, label: popupLabel(p) })),
                ]}
              />
            </Field>
          ) : null}
        </div>
        <div className="overflow-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr>
                <th className="w-10" />
                {Array.from({ length: C }, (_, c) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: 列、欄的位置就是身分
                  <th key={c} className="px-1 py-0.5 text-left text-xs font-semibold text-muted">
                    <div className="flex items-center gap-1">
                      <span className="flex-1 truncate">{colName(c)}</span>
                      <IconButton
                        size="sm"
                        variant="ghost"
                        label={`刪除第 ${c + 1} 欄`}
                        icon={<X />}
                        disabled={C <= 1}
                        onClick={() =>
                          editBlock(b.id, (x) => {
                            if (x.tbl) tblDelCol(x.tbl, c);
                          })
                        }
                      />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: R }, (_, r) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 列、欄的位置就是身分
                <tr key={r}>
                  <td className="align-top text-xs text-muted">
                    <div className="flex flex-col items-center">
                      <span>{r + 1}</span>
                      <IconButton
                        size="sm"
                        variant="ghost"
                        label={`刪除第 ${r + 1} 列`}
                        icon={<X />}
                        disabled={R <= 1}
                        onClick={() =>
                          editBlock(b.id, (x) => {
                            if (x.tbl) tblDelRow(x.tbl, r);
                          })
                        }
                      />
                    </div>
                  </td>
                  {Array.from({ length: C }, (_, c) => (
                    // biome-ignore lint/suspicious/noArrayIndexKey: 列、欄的位置就是身分
                    <td key={c} className="border border-border p-0 align-top">
                      <CellField
                        b={b}
                        r={r}
                        c={c}
                        big
                        head={(t.head && r === 0) || (t.look === 'grid' && t.rowhead && c === 0)}
                        on={cell?.r === r && cell?.c === c}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              editBlock(b.id, (x) => {
                if (x.tbl) tblAddRow(x.tbl);
              })
            }
          >
            新增一列
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              editBlock(b.id, (x) => {
                if (x.tbl) tblAddCol(x.tbl);
              })
            }
          >
            新增一欄
          </Button>
        </div>
      </div>
    </Dialog>
  );
}

export const CELL_TYPES: readonly BlockType[] = CELL_ADD;
