/**
 * 匯出區裡的「一次匯出多個」（P11 新增）：方式選單、會做出幾個、勾選範本的對話框。
 * 實際的匯出在 Preview 的 onExport（batch.ts 的 runBatch）。
 */
import { ListChecks } from 'lucide-react';
import { useState } from 'react';
import { Button, Checkbox, Dialog, DialogClose, Field, Select } from '@/ui';
import { batchByLines, batchChoices } from './batch';
import { useMine } from './mine';
import type { Mode, Settings } from './settings';
import { useView } from './store';
import { S } from './strings';

type BatchKind = 'off' | 'lines' | 'templates';

const PREVIEW_MAX = 5;

/** 勾選範本的對話框：依分組列出，每組可以一次全選／全不選 */
function PickDialog({
  mode,
  open,
  onOpenChange,
}: {
  mode: Mode;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const mine = useMine((st) => st.data.items);
  const picked = useView((st) => st.data.batchPick?.[mode] ?? []);
  const choices = batchChoices(mode, mine);
  const groups = [...new Set(choices.map((c) => c.group))];
  const set = new Set(picked);
  const write = (next: Set<string>) => {
    const keys = choices.filter((c) => next.has(c.key)).map((c) => c.key);
    const cur = useView.getState().data.batchPick ?? { title: [], long: [], caption: [] };
    useView.getState().patch({ batchPick: { ...cur, [mode]: keys } });
  };
  const toggle = (key: string, on: boolean) => {
    const next = new Set(set);
    if (on) next.add(key);
    else next.delete(key);
    write(next);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={S.batch.pickTitle}
      description={S.batch.pickDesc}
      size="lg"
      footer={
        <>
          <Button size="sm" onClick={() => write(new Set(choices.map((c) => c.key)))}>
            {S.batch.pickAll}
          </Button>
          <Button size="sm" onClick={() => write(new Set())}>
            {S.batch.pickNone}
          </Button>
          <span className="flex-1" />
          <DialogClose variant="primary">完成</DialogClose>
        </>
      }
    >
      <div className="flex flex-col gap-3" data-testid="batch-pick">
        {groups.map((g) => {
          const list = choices.filter((c) => c.group === g);
          const all = list.every((c) => set.has(c.key));
          return (
            <fieldset key={g} className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
              <legend className="mb-1 flex w-full items-center gap-2 p-0 text-sm font-semibold text-fg">
                <span className="flex-1">{g}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={S.batch.groupToggle(g)}
                  onClick={() => {
                    const next = new Set(set);
                    for (const c of list) {
                      if (all) next.delete(c.key);
                      else next.add(c.key);
                    }
                    write(next);
                  }}
                >
                  {all ? S.batch.pickNone : S.batch.pickAll}
                </Button>
              </legend>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-x-3 gap-y-1.5">
                {list.map((c) => (
                  <Checkbox
                    key={c.key}
                    label={c.name}
                    checked={set.has(c.key)}
                    onCheckedChange={(v) => toggle(c.key, v)}
                  />
                ))}
              </div>
            </fieldset>
          );
        })}
      </div>
    </Dialog>
  );
}

export function BatchField({ cfg }: { cfg: Settings }) {
  const kind = useView((st) => st.data.batch ?? 'off') as BatchKind;
  const mode = cfg.mode;
  const mine = useMine((st) => st.data.items);
  const picked = useView((st) => st.data.batchPick?.[mode] ?? []);
  const [open, setOpen] = useState(false);
  const isLong = mode === 'long';
  const pickedCount = batchChoices(mode, mine).filter((c) => picked.includes(c.key)).length;

  let note: string | null = null;
  if (kind === 'lines') {
    const items = batchByLines(cfg);
    if (!items.length) note = S.batch.empty;
    else {
      const names = items.slice(0, PREVIEW_MAX).map((it) => `「${it.label}」`);
      const more = items.length > PREVIEW_MAX ? '…' : '';
      note = S.batch.count(items.length, `${names.join('、')}${more}`);
      if (!isLong && items.some((it) => it.cfg.sub !== cfg.sub)) note += `（${S.batch.pair}）`;
    }
  }

  return (
    <div className="flex flex-col gap-2" data-testid="batch-field">
      <Field label={S.batch.label} hint={S.batch.hint}>
        <Select
          value={kind}
          onValueChange={(v) => useView.getState().patch({ batch: v as BatchKind })}
          options={[
            { value: 'off', label: S.batch.off },
            { value: 'lines', label: isLong ? S.batch.pages : S.batch.lines },
            { value: 'templates', label: S.batch.templates },
          ]}
        />
      </Field>
      {note ? (
        <p className="m-0 text-xs text-muted" data-testid="batch-note">
          {note}
        </p>
      ) : null}
      {kind === 'templates' ? (
        <>
          <Button
            size="sm"
            icon={<ListChecks />}
            className="self-start"
            onClick={() => setOpen(true)}
          >
            {S.batch.pick(pickedCount)}
          </Button>
          <PickDialog mode={mode} open={open} onOpenChange={setOpen} />
        </>
      ) : null}
    </div>
  );
}
