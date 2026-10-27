/**
 * 新增準備事項（F45）：名稱、所屬場次、期限、完成。沒有場次時不開，提示先新增場次。
 */
import { useRef, useState } from 'react';
import { Button, Checkbox, Dialog, Field, Select, TextInput } from '@/ui';
import { formatDay, today } from './dates';
import { compareEntries, entryTitle, newTask } from './model';
import { notify } from './notify';
import { addTask, calNow, closeTaskDialog, selectEntry, useCal, useUi } from './store';
import { S } from './strings';
import { nextTaskOrder } from './tasks';

/** 打開新增準備事項（選取的日期當期限；所屬場次預設是選取的場次，沒有時是最近一個還沒到的場次） */
export function openTaskDialog(): boolean {
  const sessions = calNow().entries.filter((e) => e.kind === 'session');
  if (!sessions.length) {
    notify({ title: S.tasks.noSession, tone: 'warning' });
    return false;
  }
  const { selectedId, selectedDate } = useUi.getState();
  const due = selectedDate ?? today();
  const selected = sessions.find((e) => e.id === selectedId);
  const sorted = [...sessions].sort(compareEntries);
  const upcoming = sorted.find((e) => e.end >= due) ?? sorted[sorted.length - 1];
  useUi.setState({ taskDialog: { due, entryId: (selected ?? upcoming).id } });
  return true;
}

function Body({ due: initialDue, entryId }: { due: string; entryId: string | null }) {
  const entries = useCal((s) => s.data.entries);
  const sessions = entries.filter((e) => e.kind === 'session').sort(compareEntries);
  const [title, setTitle] = useState('');
  const [due, setDue] = useState(initialDue);
  const [owner, setOwner] = useState(entryId ?? sessions[0]?.id ?? '');
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  const save = () => {
    if (!title.trim()) {
      setError(S.taskDialog.nameRequired);
      ref.current?.focus();
      return;
    }
    if (!owner) return;
    const task = { ...newTask(title.trim(), due, nextTaskOrder(calNow().entries)), done };
    addTask(owner, task);
    selectEntry(owner);
    closeTaskDialog();
    notify({ title: S.taskDialog.added, tone: 'success' });
  };
  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) closeTaskDialog();
      }}
      title={S.taskDialog.title}
      initialFocus={ref}
      footer={
        <>
          <Button variant="secondary" onClick={closeTaskDialog}>
            {S.taskDialog.cancel}
          </Button>
          <Button variant="primary" onClick={save} data-testid="task-save">
            {S.taskDialog.add}
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <Field label={S.taskDialog.name} error={error || undefined}>
          <TextInput
            ref={ref}
            value={title}
            maxLength={200}
            placeholder={S.taskDialog.namePlaceholder}
            onChange={(e) => {
              setTitle(e.target.value);
              setError('');
            }}
          />
        </Field>
        <Field label={S.taskDialog.session}>
          <Select
            value={owner}
            onValueChange={setOwner}
            options={sessions.map((e) => ({
              value: e.id,
              label: `${entryTitle(e)}（${formatDay(e.start)}）`,
            }))}
          />
        </Field>
        <Field label={S.taskDialog.due}>
          <TextInput type="date" value={due} onChange={(e) => setDue(e.target.value)} />
        </Field>
        <Checkbox checked={done} onCheckedChange={setDone} label={S.taskDialog.done} />
        <button type="submit" hidden aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
  );
}

export function TaskDialog() {
  const st = useUi((s) => s.taskDialog);
  if (!st) return null;
  return <Body due={st.due} entryId={st.entryId} />;
}
