/**
 * ① 使用者（規格 F03～F07）：新增表單、使用者清單（可直接改畫面上的名字）、刪除（裁定：先確認，說明連帶刪除的組合）、說明。
 */
import { UserPlus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Button, Field, ItemListEditor, Notice, Section, TextInput } from '@/ui';
import { addUser, gesture, removeUser, setUserName } from './actions';
import { combosOfUser, memoOf, type TachieData, type TachieUser, userLabel } from './model';
import { useTachie } from './store';
import { S } from './strings';

/** 已儲存組合的顯示名稱（刪除確認用） */
export function comboNames(data: TachieData, list: { userId: string; presetId: string }[]) {
  return list.map((c) => {
    const u = data.users.find((x) => x.id === c.userId);
    const p = data.presets.find((x) => x.id === c.presetId);
    return S.output.comboName(
      u ? (memoOf(u) ?? u.id) : c.userId,
      p?.name.trim() || S.presets.unnamed,
    );
  });
}

function AddUserForm() {
  const [id, setId] = useState('');
  const [memo, setMemo] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const r = addUser({ id, memo, name });
    if (r.error || !r.user) {
      setError(true);
      setDone(null);
      return;
    }
    setError(false);
    setId('');
    setMemo('');
    setName('');
    setDone(r.replaced ? S.users.replaced(userLabel(r.user)) : S.users.added(userLabel(r.user)));
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3" aria-label={S.users.addTitle}>
      <Field label={S.users.idLabel} hint={S.users.idHint} error={error ? S.users.idError : null}>
        <TextInput
          value={id}
          inputMode="numeric"
          autoComplete="off"
          placeholder={S.users.idPlaceholder}
          onChange={(e) => {
            setId(e.target.value);
            setDone(null);
          }}
        />
      </Field>
      <Field label={S.users.memoLabel}>
        <TextInput
          value={memo}
          placeholder={S.users.memoPlaceholder}
          onChange={(e) => setMemo(e.target.value)}
        />
      </Field>
      <Field label={S.users.nameLabel}>
        <TextInput
          value={name}
          placeholder={S.users.namePlaceholder}
          onChange={(e) => setName(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" variant="primary" icon={<UserPlus />}>
          {S.users.add}
        </Button>
      </div>
      {done ? (
        <Notice tone="success" className="text-xs">
          {done}
        </Notice>
      ) : null}
    </form>
  );
}

function UserDetails({ user }: { user: TachieUser }) {
  const label = memoOf(user) ?? S.users.noMemo;
  return (
    <TextInput
      aria-label={S.users.displayNameFor(label)}
      value={user.name}
      placeholder={memoOf(user) ?? S.users.notSet}
      onFocus={gesture.begin}
      onBlur={gesture.commit}
      onChange={(e) => setUserName(user.id, e.target.value)}
    />
  );
}

export function StepUsers() {
  const data = useTachie((s) => s.data);
  return (
    <>
      <Section title={S.users.addTitle} fixed>
        <AddUserForm />
      </Section>
      <Section title={S.listTitle(S.users.listTitle, data.users.length)} fixed>
        <ItemListEditor<TachieUser>
          aria-label={S.users.listLabel}
          items={data.users}
          getId={(u) => u.id}
          getName={(u) => u.memo}
          placeholder={S.users.noMemo}
          renderMeta={(u) => <span className="font-mono">{S.users.idMeta(u.id)}</span>}
          renderDetails={(u) => (
            <div className="flex min-w-0 flex-col gap-1">
              <span className="text-xs text-muted">{S.users.displayName}</span>
              <UserDetails user={u} />
            </div>
          )}
          onRemove={removeUser}
          confirmRemove={(u) => {
            const combos = comboNames(data, combosOfUser(data, u.id));
            return {
              title: S.users.removeTitle(memoOf(u) ?? u.id),
              description: combos.length ? S.removeCombos(combos) : S.removeNoCombos,
              confirmLabel: S.removeConfirm,
              danger: true,
            };
          }}
          emptyText={S.users.empty}
        />
      </Section>
      <Section title={S.users.guideTitle} persistKey="obs-tachie:users-guide">
        <ul className="m-0 flex list-disc flex-col gap-1.5 pl-5 text-sm text-fg">
          {S.users.guide.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Section>
    </>
  );
}
