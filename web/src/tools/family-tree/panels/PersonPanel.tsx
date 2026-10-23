/**
 * 「人物」分頁（規格 1.6）：選取的成員或配偶的資料、加人、配偶、父母、位置、刪除。
 */
import {
  ArrowLeft,
  ArrowRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Eraser,
  Heart,
  Plus,
  Trash2,
  UserRoundPlus,
  X,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { historyGesture } from '@/core/storage';
import {
  Button,
  cn,
  Field,
  FieldRow,
  NumberInput,
  Section,
  Segmented,
  Select,
  TextArea,
  TextInput,
} from '@/ui';
import {
  canvasApi,
  doAddChild,
  doAddParent,
  doAddSibling,
  doAddSpouse,
  doRemove,
} from '../actions';
import {
  canAddParent,
  clearManual,
  fatherChoices,
  hasManual,
  isFull,
  motherChoices,
  moveSibling,
  newCategory,
  setFather,
  setMother,
} from '../model/ops';
import { genOf, hostOf, kidsOf, lineParent, rootOf, shownOf, spousesOf } from '../model/tree';
import {
  type Board,
  type Gender,
  isMember,
  LIMITS,
  type Member,
  type People,
  type Person,
  type Spouse,
} from '../model/types';
import {
  prefsNow,
  select,
  setPrefs,
  toggleFold,
  updateBoard,
  updatePeople,
  useBoard,
  usePrefs,
  useTree,
  useUi,
} from '../store';
import { S } from '../strings';

const gesture = historyGesture(useTree);
const NONE: readonly string[] = [];

type TextKey = 'name' | 'reading' | 'alias' | 'birth' | 'death' | 'note' | 'origin' | 'parents';

const LIMIT: Record<TextKey, number> = {
  name: LIMITS.name,
  reading: LIMITS.reading,
  alias: LIMITS.alias,
  birth: LIMITS.year,
  death: LIMITS.year,
  note: LIMITS.note,
  origin: LIMITS.origin,
  parents: LIMITS.parents,
};

/** 改一位人物的一欄文字（打字中合成一步復原，離開欄位時記下） */
function setText(id: string, key: TextKey, value: string) {
  const v = Array.from(value).slice(0, LIMIT[key]).join('');
  updatePeople((d) => {
    const t = d[id] as unknown as Record<string, string | undefined>;
    if (!t) return;
    if (v || key === 'name') t[key] = v;
    else delete t[key];
  });
}

function TextField({
  person,
  k,
  label,
  placeholder,
  hint,
  multiline,
  testId,
}: {
  person: Person;
  k: TextKey;
  label: string;
  placeholder?: string;
  hint?: ReactNode;
  multiline?: boolean;
  testId?: string;
}) {
  const value = ((person as unknown as Record<string, string | undefined>)[k] ?? '') as string;
  const common = {
    value,
    placeholder,
    maxLength: LIMIT[k],
    'data-field': testId ?? k,
    onFocus: gesture.begin,
    onBlur: gesture.commit,
  };
  return (
    <Field label={label} hint={hint}>
      {multiline ? (
        <TextArea
          {...common}
          rows={k === 'note' ? 4 : 2}
          onChange={(e) => setText(person.id, k, e.target.value)}
        />
      ) : (
        <TextInput {...common} onChange={(e) => setText(person.id, k, e.target.value)} />
      )}
    </Field>
  );
}

/* ---------- 色分類（F36） ---------- */

function CategoryPicker({ person, board }: { person: Person; board: Board }) {
  const colors = usePrefs((s) => s.data.colors);
  const pick = (catId: string | null) =>
    updatePeople((d) => {
      const t = d[person.id];
      if (!t) return;
      if (catId) t.cat = catId;
      else delete t.cat;
    });
  const addNew = () => {
    updateBoard((b) => {
      const c = newCategory(b);
      b.cats.push(c);
      const t = b.people[person.id];
      if (t) t.cat = c.id;
    });
    if (!prefsNow().colors) setPrefs({ colors: true });
  };
  const chip = (active: boolean) =>
    cn(
      'inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-xs',
      active
        ? 'border-accent bg-accent-soft font-semibold text-fg ring-1 ring-accent'
        : 'border-border bg-bg text-fg hover:bg-surface-3',
    );
  return (
    <Section title={S.catSection} persistKey="family-tree:person-cat">
      <fieldset className="m-0 flex flex-wrap gap-1.5 border-0 p-0" data-testid="cat-picker">
        <legend className="sr-only">{S.catSection}</legend>
        <button
          type="button"
          className={chip(!person.cat)}
          aria-pressed={!person.cat}
          onClick={() => pick(null)}
        >
          {S.catNone}
        </button>
        {board.cats.map((c) => (
          <button
            key={c.id}
            type="button"
            className={chip(person.cat === c.id)}
            aria-pressed={person.cat === c.id}
            onClick={() => pick(c.id)}
          >
            <i className="inline-block size-2.5 rounded-[3px]" style={{ background: c.color }} />
            {c.name || S.catFallback}
          </button>
        ))}
        <button type="button" className={chip(false)} onClick={addNew}>
          <Plus className="size-3.5" />
          {S.catNew}
        </button>
      </fieldset>
      {!colors && person.cat ? <p className="m-0 mt-2 text-xs text-muted">{S.catHidden}</p> : null}
    </Section>
  );
}

/* ---------- 標題 ---------- */

function Header({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border bg-surface px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <h2 className="m-0 truncate text-lg font-semibold" data-testid="person-title">
          {title}
        </h2>
        <p className="m-0 mt-0.5 text-xs text-muted" data-testid="person-sub">
          {sub}
        </p>
      </div>
      <Button size="sm" variant="ghost" icon={<X />} onClick={() => select(null)}>
        {S.deselect}
      </Button>
    </div>
  );
}

/* ---------- 成員 ---------- */

function MemberPanel({ p, board }: { p: Member; board: Board }) {
  const people = board.people;
  const collapsed = usePrefs((s) => s.data.collapsed[board.id]) ?? NONE;
  const [msg, setMsg] = useState<string | null>(null);
  const lp = lineParent(people, p, { all: true });
  const parent = lp ? people[lp] : undefined;
  const gen = genOf(people, p);
  const rel = p.gender === 'F' ? S.daughter : S.son;
  const sub = isMember(parent) ? S.childSub(gen, parent.name || S.unnamed, rel) : S.rootSub(gen);
  const spouses = spousesOf(people, p.id);
  const hasKids = kidsOf(people, p.id, { all: true }).length > 0;
  const folded = collapsed.includes(p.id);
  const full = isFull(people);

  const fathers = fatherChoices(people, p);
  const fatherOptions = [
    { value: '__none__', label: S.fatherNone },
    ...fathers.map((f) => {
      const r = rootOf(people, f);
      return {
        value: f.id,
        label: S.fatherOption(
          f.name || S.unnamed,
          genOf(people, f),
          r.id !== f.id ? r.name || S.unnamed : null,
        ),
      };
    }),
  ];
  const mothers = motherChoices(people, p);
  const motherOptions = [
    { value: '__none__', label: S.motherNone },
    ...mothers.map((m) => {
      const person = people[m.id];
      const name =
        person && person.kind === 'spouse' ? shownOf(people, person).name : (person?.name ?? '');
      return {
        value: m.id,
        label: `${name || S.unnamed}${m.daughterSide ? ` ${S.daughterSide}` : ''}`,
      };
    }),
  ];
  const fatherValue =
    p.fatherId && fathers.some((f) => f.id === p.fatherId) ? p.fatherId : '__none__';
  const motherValue =
    p.motherId && mothers.some((m) => m.id === p.motherId) ? p.motherId : '__none__';

  return (
    <div className="flex flex-col gap-3" data-testid="member-panel">
      <Header title={p.name || S.unnamed} sub={sub} />
      <CategoryPicker person={p} board={board} />
      <Section title={S.basicInfo} persistKey="family-tree:person-basic">
        <FieldRow columns={2}>
          <TextField person={p} k="name" label={S.fName} />
          <TextField person={p} k="reading" label={S.fReading} hint={S.fReadingHint} />
        </FieldRow>
        <Field label={S.fGender}>
          <Segmented<Gender>
            value={p.gender}
            onValueChange={(g) =>
              updatePeople((d) => {
                const t = d[p.id];
                if (t && t.kind === 'member') t.gender = g;
              })
            }
            options={[
              { value: 'M', label: S.male },
              { value: 'F', label: S.female },
            ]}
            fullWidth
          />
        </Field>
        <TextField
          person={p}
          k="alias"
          label={S.fAlias}
          hint={S.fAliasHint}
          placeholder={S.fAliasPlaceholder}
          multiline
        />
        <FieldRow columns={2}>
          <TextField person={p} k="birth" label={S.fBirth} placeholder={S.fYearPlaceholder} />
          <TextField person={p} k="death" label={S.fDeath} />
        </FieldRow>
        {!lp ? (
          <Field label={S.fGen} hint={S.fGenHint}>
            <NumberInput
              value={p.gen || 1}
              min={1}
              max={LIMITS.gen}
              step={1}
              precision={0}
              onChange={(v) =>
                updatePeople((d) => {
                  const t = d[p.id];
                  if (t && t.kind === 'member')
                    t.gen = Math.max(1, Math.min(LIMITS.gen, Math.round(v)));
                })
              }
            />
          </Field>
        ) : null}
        <MemoField person={p} />
      </Section>

      <Section title={S.addSection} persistKey="family-tree:person-add">
        <div className="grid grid-cols-2 gap-1.5" data-testid="add-buttons">
          <Button
            variant="primary"
            size="sm"
            icon={<UserRoundPlus />}
            disabled={full}
            onClick={() => doAddChild(p.id, 'M')}
          >
            {S.addSon}
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<UserRoundPlus />}
            disabled={full}
            onClick={() => doAddChild(p.id, 'F')}
          >
            {S.addDaughter}
          </Button>
          <Button size="sm" icon={<Heart />} disabled={full} onClick={() => doAddSpouse(p.id)}>
            {p.gender === 'F' ? S.addHusband : S.addWife}
          </Button>
          {lp ? (
            <Button size="sm" icon={<Plus />} disabled={full} onClick={() => doAddSibling(p.id)}>
              {S.addSibling}
            </Button>
          ) : null}
          {canAddParent(people, p) ? (
            <Button size="sm" icon={<Plus />} disabled={full} onClick={() => doAddParent(p.id)}>
              {S.addParent}
            </Button>
          ) : null}
        </div>
        {full ? (
          <p className="m-0 mt-2 text-xs text-warning">{S.peopleFull(LIMITS.people)}</p>
        ) : null}
      </Section>

      {spouses.length ? (
        <Section title={S.spousesSection} persistKey="family-tree:person-spouses">
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="spouse-list">
            {spouses.map((s) => {
              const src = shownOf(people, s);
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-2 rounded-md border border-border px-2.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {src.name || S.unnamed}
                      {src.reading ? (
                        <span className="ml-1.5 font-normal text-muted">{src.reading}</span>
                      ) : null}
                    </div>
                    {s.origin ? (
                      <div className="truncate text-xs text-muted">{s.origin}</div>
                    ) : null}
                  </div>
                  <Button size="sm" onClick={() => select(s.id)}>
                    {S.edit}
                  </Button>
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      <Section title={S.parentsSection} persistKey="family-tree:person-parents">
        <Field label={S.father}>
          <Select
            value={fatherValue}
            options={fatherOptions}
            data-field="father"
            onValueChange={(v) => {
              updatePeople((d) => setFather(d as People, p.id, v === '__none__' ? null : v));
              setTimeout(() => canvasApi.current?.centerOn(p.id), 30);
            }}
          />
        </Field>
        <Field label={S.mother}>
          <Select
            value={motherValue}
            options={motherOptions}
            data-field="mother"
            onValueChange={(v) =>
              updatePeople((d) => setMother(d as People, p.id, v === '__none__' ? null : v))
            }
          />
        </Field>
        <p className="m-0 text-xs text-muted">{S.parentsHint}</p>
      </Section>

      <Section title={S.placeSection} persistKey="family-tree:person-place">
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            size="sm"
            icon={<ArrowLeft />}
            onClick={() => updatePeople((d) => void moveSibling(d as People, p.id, -1))}
          >
            {S.swapLeft}
          </Button>
          <Button
            size="sm"
            icon={<ArrowRight />}
            onClick={() => updatePeople((d) => void moveSibling(d as People, p.id, 1))}
          >
            {S.swapRight}
          </Button>
          {hasManual(p) ? (
            <Button
              size="sm"
              icon={<Eraser />}
              className="col-span-2"
              onClick={() => updatePeople((d) => clearManual(d as People, p.id))}
            >
              {S.clearManual}
            </Button>
          ) : null}
          {hasKids || folded ? (
            <Button
              size="sm"
              icon={folded ? <ChevronsUpDown /> : <ChevronsDownUp />}
              className="col-span-2"
              onClick={() => toggleFold(p.id)}
            >
              {folded ? S.unfold : S.fold}
            </Button>
          ) : null}
        </div>
      </Section>

      <div className="flex flex-col gap-1.5 px-1">
        <Button
          variant="danger"
          icon={<Trash2 />}
          onClick={() => {
            if (!doRemove(p.id)) setMsg(S.hasKids);
          }}
        >
          {S.deletePerson}
        </Button>
        {msg ? (
          <p role="alert" className="m-0 text-xs text-danger">
            {msg}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MemoField({ person }: { person: Member | Spouse }) {
  const memo = usePrefs((s) => s.data.memo);
  return (
    <TextField
      person={person}
      k="note"
      label={S.fNote}
      hint={person.kind === 'member' && !memo ? S.fNoteHint : undefined}
      multiline
    />
  );
}

/* ---------- 配偶 ---------- */

function SpousePanel({ s, board }: { s: Spouse; board: Board }) {
  const people = board.people;
  const host = hostOf(people, s);
  const src = shownOf(people, s);
  const rel = host?.gender === 'F' ? S.husband : S.wife;
  return (
    <div className="flex flex-col gap-3" data-testid="spouse-panel">
      <Header title={src.name || S.unnamed} sub={S.spouseSub(host?.name || S.unnamed, rel)} />
      <CategoryPicker person={s} board={board} />
      <Section title={S.basicInfo} persistKey="family-tree:spouse-basic">
        <FieldRow columns={2}>
          <TextField person={src} k="name" label={S.fName} />
          <TextField person={src} k="reading" label={S.fReading} />
        </FieldRow>
        <TextField person={s} k="origin" label={S.fOrigin} placeholder={S.fOriginPlaceholder} />
        <FieldRow columns={2}>
          <TextField person={src} k="birth" label={S.fBirth} placeholder={S.fYearPlaceholder} />
          <TextField person={src} k="death" label={S.fDeath} />
        </FieldRow>
        <TextField person={s} k="parents" label={S.fParents} placeholder={S.fParentsPlaceholder} />
        <TextField person={s} k="note" label={S.fNote} multiline />
      </Section>
      <div className="flex flex-col gap-1.5 px-1">
        <div className="grid grid-cols-2 gap-1.5">
          {host ? (
            <Button size="sm" icon={<ArrowLeft />} onClick={() => select(host.id)}>
              {S.backTo(host.name || S.unnamed)}
            </Button>
          ) : null}
          <Button size="sm" variant="danger" icon={<Trash2 />} onClick={() => doRemove(s.id)}>
            {S.deleteSpouse}
          </Button>
        </div>
        <p className="m-0 text-xs text-muted">{S.deleteSpouseHint}</p>
      </div>
    </div>
  );
}

/* ---------- 沒有選取 ---------- */

function NoSelection() {
  return (
    <div
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 text-sm"
      data-testid="no-selection"
    >
      <p className="m-0 font-medium">{S.noSelection}</p>
      <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-xs text-muted">
        {S.noSelectionTips.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </div>
  );
}

export function PersonPanel() {
  const board = useBoard();
  const selectedId = useUi((s) => s.selectedId);
  const p = selectedId ? board.people[selectedId] : undefined;
  if (!p) return <NoSelection />;
  /* 換人時整個面板重建（文字欄的手勢、訊息不會帶到下一個人） */
  return p.kind === 'member' ? (
    <MemberPanel key={p.id} p={p} board={board} />
  ) : (
    <SpousePanel key={p.id} s={p} board={board} />
  );
}
