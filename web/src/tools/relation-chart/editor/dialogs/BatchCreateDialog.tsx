/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 批次建立角色（原作的 openBatchCreatePanel）：一格一位、Enter 跳下一格、Alt／Shift＋Enter 格內換行、
 * 尾端永遠留一格空的、貼上試算表的一欄自動拆格；或用頭像圖片建立（一張一位，檔名＝名稱）。
 */
import { ImagePlus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { pickFiles } from '@/core/files';
import { Button, Dialog, IconButton, TextArea, useToast } from '@/ui';
import { parseBatchPaste } from '../../logic/table';
import { addChars } from '../../state/actions';
import { avatarFromBlob } from '../../state/images';
import { setUi, useUi } from '../../state/store';
import { S } from '../../strings';
import { kickSim } from '../sim';

const T = S.batchCreate;

const withTrailing = (cells: string[]) =>
  !cells.length || cells[cells.length - 1].trim() ? [...cells, ''] : cells;

function Body({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const [cells, setCells] = useState<string[]>(['', '', '']);
  const [cols, setCols] = useState(false);
  const [busy, setBusy] = useState(false);
  const refs = useRef<(HTMLTextAreaElement | null)[]>([]);
  const focusAt = useRef<number | null>(null);
  useEffect(() => {
    if (focusAt.current === null) return;
    refs.current[focusAt.current]?.focus();
    focusAt.current = null;
  });
  const raw = cells.map((c) => c.trim()).filter(Boolean);
  const uniq = [...new Set(raw)];
  let preview = T.preview(uniq.length);
  if (raw.length > uniq.length) preview += T.dup(raw.length - uniq.length);
  if (cols) preview += T.cols;
  if (uniq.length > 200) preview += ` ${T.many}`;

  const setAt = (i: number, v: string) =>
    setCells((cs) => withTrailing(cs.map((c, k) => (k === i ? v : c))));
  const create = () => {
    if (!uniq.length) {
      onDone();
      return;
    }
    const ids = addChars(uniq.map((name) => ({ name })));
    kickSim(0.7);
    toast({ title: T.done(ids.length), tone: 'success' });
    onDone();
  };
  const fromImages = async () => {
    const files = (await pickFiles({ accept: 'image/*', multiple: true })).filter((f) =>
      f.type.startsWith('image/'),
    );
    if (!files.length) return;
    setBusy(true);
    try {
      const made: { name: string; avatar: Awaited<ReturnType<typeof avatarFromBlob>>['avatar'] }[] =
        [];
      let failed = 0;
      let notSaved = false;
      for (const f of files) {
        try {
          const r = await avatarFromBlob(f, f.name);
          if (!r.persisted) notSaved = true;
          made.push({ name: f.name.replace(/\.[^.]+$/, '').trim(), avatar: r.avatar });
        } catch {
          failed++;
        }
      }
      if (!made.length) {
        toast({ title: T.imagesNone, tone: 'warning' });
        return;
      }
      addChars(made);
      kickSim(0.7);
      const notes = [failed ? T.imagesFail(failed) : '', notSaved ? S.msg.imageNotSaved : '']
        .filter(Boolean)
        .join('');
      toast({
        title: S.msg.imagesAdded(made.length),
        description: notes || undefined,
        tone: notes ? 'warning' : 'success',
      });
      onDone();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-muted">{T.hint}</p>
      <ol className="flex max-h-[45dvh] flex-col gap-1 overflow-auto" data-testid="batch-cells">
        {cells.map((v, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: 格子的位置就是身分（可以刪除、插入）
          <li key={i} className="flex items-start gap-1">
            <span className="w-6 pt-1.5 text-right text-xs tabular-nums text-muted">{i + 1}</span>
            <TextArea
              ref={(el) => {
                refs.current[i] = el;
              }}
              rows={Math.max(1, v.split('\n').length)}
              value={v}
              placeholder={i === 0 ? T.cellPh : undefined}
              aria-label={T.cellLabel(i + 1)}
              className="min-h-0 flex-1 resize-none py-1 text-sm"
              onChange={(e) => setAt(i, e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
                if (e.altKey) {
                  e.preventDefault();
                  const el = e.currentTarget;
                  const s = el.selectionStart ?? el.value.length;
                  const en = el.selectionEnd ?? s;
                  setAt(i, `${el.value.slice(0, s)}\n${el.value.slice(en)}`);
                  return;
                }
                if (e.shiftKey) return;
                e.preventDefault();
                if (i === cells.length - 1) setCells((cs) => [...cs, '']);
                focusAt.current = i + 1;
                setCells((cs) => [...cs]);
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData('text/plain');
                const parsed = parseBatchPaste(text);
                if (!parsed.cells.length) return;
                if (parsed.cells.length === 1 && !parsed.cells[0].includes('\n')) return;
                e.preventDefault();
                if (parsed.usedCols) setCols(true);
                setCells((cs) => {
                  const next = [...cs];
                  parsed.cells.forEach((c, k) => {
                    next[i + k] = c;
                  });
                  return withTrailing(next);
                });
                focusAt.current = i + parsed.cells.length - 1;
              }}
              data-testid="batch-cell"
            />
            <IconButton
              size="sm"
              icon={<Trash2 />}
              label={T.rowDel}
              onClick={() =>
                setCells((cs) => withTrailing(cs.length <= 1 ? [''] : cs.filter((_, k) => k !== i)))
              }
            />
          </li>
        ))}
      </ol>
      <p className="text-sm" data-testid="batch-preview">
        {preview}
      </p>
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <Button
          size="sm"
          icon={<ImagePlus />}
          loading={busy}
          onClick={() => void fromImages()}
          data-testid="batch-images"
        >
          {T.images}
        </Button>
        <span className="text-xs text-muted">{T.imagesHint}</span>
      </div>
      <div className="flex justify-end gap-2">
        <Button onClick={onDone}>{T.cancel}</Button>
        <Button variant="primary" onClick={create} data-testid="batch-create">
          {T.create}
        </Button>
      </div>
    </div>
  );
}

export function BatchCreateDialog() {
  const open = useUi((u) => u.dialog === 'batch');
  const close = () => setUi({ dialog: null });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()} title={T.title} size="md">
      {open ? <Body onDone={close} /> : null}
    </Dialog>
  );
}
