/**
 * 「人物」分頁（規格 1.6；第二批 F80～F87）：選取的成員或配偶的資料、加人、配偶、父母、過繼、位置、狀態、
 * GM 專用、頭像、刪除。PL 檢視時不能編輯（只顯示說明與「切回 GM 檢視」）。
 */
import {
  ArrowLeft,
  ArrowRight,
  ChevronsDownUp,
  ChevronsUpDown,
  Eraser,
  Eye,
  EyeOff,
  Heart,
  Link2,
  Plus,
  Trash2,
  UserRoundPlus,
  X,
} from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { addImageFile, ImageLoadError, useAssetImage } from '@/core/assets';
import { historyGesture } from '@/core/storage';
import {
  Button,
  cn,
  Field,
  FieldRow,
  ImageDrop,
  ImageFrameDialog,
  Notice,
  NumberInput,
  Section,
  Segmented,
  Select,
  TextArea,
  TextInput,
  Toggle,
  useToast,
} from '@/ui';
import {
  canvasApi,
  doAddChild,
  doAddParent,
  doAddSibling,
  doAddSpouse,
  doRemove,
  notify,
} from '../actions';
import { AvatarCircle } from '../editor/Card';
import {
  adoptChoices,
  canAddParent,
  clearManual,
  fatherChoices,
  hasManual,
  isFull,
  linkChoices,
  motherChoices,
  moveSibling,
  newCategory,
  setAdoptFather,
  setAdoptKind,
  setAvatar,
  setFather,
  setGmField,
  setGmOnly,
  setLink,
  setMother,
  setStatus,
} from '../model/ops';
import { initialOf } from '../model/present';
import {
  adoptKindOf,
  daughterHusband,
  genOf,
  hostOf,
  kidsOf,
  lineParent,
  linkedBy,
  linkOf,
  marriedTo,
  rootOf,
  shownOf,
  spousesOf,
} from '../model/tree';
import {
  type AdoptInfo,
  type Board,
  type Gender,
  type GmField,
  isMember,
  LIFE_STATUSES,
  LIMITS,
  type LifeStatus,
  MEMBER_GM_FIELDS,
  type Member,
  type People,
  type Person,
  SPOUSE_GM_FIELDS,
  type Spouse,
} from '../model/types';
import {
  assets,
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

type TextKey =
  | 'name'
  | 'reading'
  | 'alias'
  | 'birth'
  | 'death'
  | 'note'
  | 'origin'
  | 'parents'
  | 'secret';

const LIMIT: Record<TextKey, number> = {
  name: LIMITS.name,
  reading: LIMITS.reading,
  alias: LIMITS.alias,
  birth: LIMITS.year,
  death: LIMITS.year,
  note: LIMITS.note,
  origin: LIMITS.origin,
  parents: LIMITS.parents,
  secret: LIMITS.secret,
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
          rows={k === 'note' || k === 'secret' ? 4 : 2}
          onChange={(e) => setText(person.id, k, e.target.value)}
        />
      ) : (
        <TextInput {...common} onChange={(e) => setText(person.id, k, e.target.value)} />
      )}
    </Field>
  );
}

/** 下拉的選項：「名字 · 第 N 代 · ○○ 家系」 */
function memberOption(people: People, f: Member) {
  const r = rootOf(people, f);
  return {
    value: f.id,
    label: S.fatherOption(
      f.name || S.unnamed,
      genOf(people, f),
      r.id !== f.id ? r.name || S.unnamed : null,
    ),
  };
}

/** 「○○ 家系 第 N 代」 */
function whereOf(people: People, m: Member): string {
  const r = rootOf(people, m);
  return `${r.id !== m.id ? `${r.name || S.unnamed} 家系 ` : ''}${S.genLabel(genOf(people, m))}`;
}

/** 移到某人：選取、畫面移到他 */
function goTo(id: string) {
  select(id);
  setTimeout(() => canvasApi.current?.centerOn(id), 30);
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

/* ---------- 狀態（F85） ---------- */

function StatusField({ person }: { person: Person }) {
  const value: LifeStatus = person.status ?? 'alive';
  return (
    <Field label={S.statusLabel}>
      <Segmented<LifeStatus>
        value={value}
        onValueChange={(v) => updatePeople((d) => setStatus(d as People, person.id, v))}
        options={LIFE_STATUSES.map((v) => ({ value: v, label: S.status[v] }))}
        fullWidth
      />
    </Field>
  );
}

/* ---------- 頭像（F87） ---------- */

function AvatarSection({ person }: { person: Person }) {
  const toast = useToast();
  const showing = usePrefs((s) => s.data.avatars);
  const { bitmap, status } = useAssetImage(assets, person.avatar);
  const open = useUi((s) => s.avatarFor === person.id);
  const [busy, setBusy] = useState(false);
  const add = async (file: File) => {
    setBusy(true);
    try {
      const r = await addImageFile(assets, file, { maxSide: 512 });
      updatePeople((d) => setAvatar(d as People, person.id, r.ref.id));
      if (!r.persisted) toast({ title: S.avatarNotSaved, tone: 'warning' });
    } catch (e) {
      toast({
        title: S.avatarFailed(e instanceof ImageLoadError ? e.fileName : file.name),
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title={S.avatarSection} persistKey="family-tree:person-avatar">
      <div className="flex items-center gap-3">
        <span className="relative block size-14 shrink-0" data-testid="avatar-preview">
          <AvatarCircle
            view={{ bitmap, pos: person.avatarPos, initial: initialOf(person.name) }}
            size={56}
            className="top-0 left-0"
          />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <ImageDrop
            compact
            paste="focus"
            label={S.avatarDrop}
            disabled={busy}
            onFiles={(files) => {
              if (files[0]) void add(files[0]);
            }}
          />
          {person.avatar ? (
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                disabled={!bitmap}
                onClick={() => useUi.setState({ avatarFor: person.id })}
              >
                {S.avatarAdjust}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Trash2 />}
                onClick={() => updatePeople((d) => setAvatar(d as People, person.id, null))}
              >
                {S.avatarRemove}
              </Button>
            </div>
          ) : null}
        </div>
      </div>
      {person.avatar && status === 'missing' ? (
        <p className="m-0 mt-2 text-xs text-warning">{S.avatarMissing}</p>
      ) : null}
      {person.avatar && !showing ? (
        <p className="m-0 mt-2 text-xs text-muted">{S.avatarOff}</p>
      ) : null}
      <p className="m-0 mt-2 text-xs text-muted">{S.avatarHint}</p>
      <ImageFrameDialog
        open={open && !!bitmap}
        onOpenChange={(o) => {
          if (!o) useUi.setState({ avatarFor: null });
        }}
        image={bitmap}
        aspect={1}
        cover={{ maxZoom: 4 }}
        shape="circle"
        outline="shape"
        initialPlacement={person.avatarPos ?? null}
        title={S.avatarTitle(person.name || S.unnamed)}
        note={S.avatarNote}
        onApply={(pos) =>
          updatePeople((d) => {
            const t = d[person.id];
            if (t) t.avatarPos = pos;
          })
        }
      />
    </Section>
  );
}

/* ---------- GM 專用（F86） ---------- */

function GmSection({
  person,
  fields,
  onlyLabel,
  onlyHint,
  note,
}: {
  person: Person;
  fields: readonly GmField[];
  onlyLabel: string;
  onlyHint: string;
  note?: string;
}) {
  return (
    <Section title={S.gmSection} persistKey="family-tree:person-gm">
      <Field label={onlyLabel} layout="inline" hint={onlyHint}>
        <Toggle
          checked={!!person.gm}
          onCheckedChange={(v) => updatePeople((d) => setGmOnly(d as People, person.id, v))}
        />
      </Field>
      <Field label={S.gmFields} hint={note ?? S.gmFieldsHint}>
        {/* 按鈕（aria-pressed）而不是勾選框：欄位名稱和上面的文字欄同名，避免標籤重複 */}
        {/* biome-ignore lint/a11y/useSemanticElements: 一組相關的開關按鈕，不是表單分組 */}
        <div
          role="group"
          aria-label={S.gmFields}
          className="flex flex-wrap gap-1.5"
          data-testid="gm-fields"
        >
          {fields.map((f) => {
            const on = !!person.gmFields?.includes(f);
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                data-gm-field={f}
                className={cn(
                  'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs',
                  on
                    ? 'border-warning bg-warning-soft font-semibold text-fg'
                    : 'border-border bg-bg text-muted hover:bg-surface-3 hover:text-fg',
                )}
                onClick={() => updatePeople((d) => setGmField(d as People, person.id, f, !on))}
              >
                {on ? <EyeOff className="size-3.5" /> : null}
                {S.gmFieldName[f]}
              </button>
            );
          })}
        </div>
      </Field>
      <TextField
        person={person}
        k="secret"
        label={S.secret}
        hint={S.secretHint}
        placeholder={S.secretPlaceholder}
        multiline
      />
    </Section>
  );
}

/* ---------- 成員 ---------- */

function MemberPanel({ p, board }: { p: Member; board: Board }) {
  const people = board.people;
  const collapsed = usePrefs((s) => s.data.collapsed[board.id]) ?? NONE;
  const maternal = usePrefs((s) => s.data.maternal);
  const daughterName = usePrefs((s) => s.data.daughterName);
  const [msg, setMsg] = useState<string | null>(null);
  const lp = lineParent(people, p, { all: true });
  const parent = lp ? people[lp] : undefined;
  const gen = genOf(people, p);
  const rel = p.gender === 'F' ? S.daughter : S.son;
  const husband = daughterName ? daughterHusband(people, p) : null;
  const dLabel =
    daughterName && p.gender === 'F'
      ? husband
        ? S.daughterLabel(shownOf(people, husband).name || S.unnamed)
        : S.daughterSelf(p.name || S.unnamed)
      : null;
  const sub = `${dLabel ? S.daughterSub(p.name || S.unnamed) : ''}${
    isMember(parent) ? S.childSub(gen, parent.name || S.unnamed, rel) : S.rootSub(gen)
  }${p.adopt?.fatherId ? S.adoptSub(S.adoptWord[adoptKindOf(p)]) : ''}`;
  const spouses = spousesOf(people, p.id);
  const otherSide = marriedTo(people, p, linkedBy(people));
  const hasKids = kidsOf(people, p.id, { all: true }).length > 0;
  const folded = collapsed.includes(p.id);
  const full = isFull(people);

  const fathers = fatherChoices(people, p);
  const fatherOptions = [
    { value: '__none__', label: S.fatherNone },
    ...fathers.map((f) => memberOption(people, f)),
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
  const adoptKind: AdoptInfo['kind'] | 'none' = p.adopt ? p.adopt.kind : 'none';
  const adoptFathers = adoptChoices(people, p);
  const adoptValue =
    p.adopt?.fatherId && adoptFathers.some((f) => f.id === p.adopt?.fatherId)
      ? p.adopt.fatherId
      : '__none__';

  const basic = (
    <Section
      title={husband ? `${S.basicInfo}（${S.daughter}）` : S.basicInfo}
      persistKey="family-tree:person-basic"
    >
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
      <StatusField person={p} />
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
  );

  return (
    <div className="flex flex-col gap-3" data-testid="member-panel">
      <Header title={dLabel ?? (p.name || S.unnamed)} sub={sub} />
      <CategoryPicker person={p} board={board} />
      {husband ? (
        <HusbandSection husband={husband} people={people} more={spouses.length > 1} />
      ) : null}
      {basic}

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
          <Button
            size="sm"
            icon={<Link2 />}
            disabled={full}
            className="col-span-2"
            onClick={() => doAddSpouse(p.id, true)}
          >
            {S.addLinkedSpouse}
          </Button>
        </div>
        {full ? (
          <p className="m-0 mt-2 text-xs text-warning">{S.peopleFull(LIMITS.people)}</p>
        ) : null}
        {p.gender === 'F' && !maternal ? (
          <p className="m-0 mt-2 text-xs text-muted">{S.maternalOffHint}</p>
        ) : null}
      </Section>

      {spouses.length || otherSide.length ? (
        <Section title={S.spousesSection} persistKey="family-tree:person-spouses">
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0" data-testid="spouse-list">
            {spouses.map((s) => {
              const src = shownOf(people, s);
              const lk = linkOf(people, s);
              const subs = [s.origin, lk ? null : S.separateRecord].filter(Boolean).join(' · ');
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
                    {subs ? <div className="truncate text-xs text-muted">{subs}</div> : null}
                    {lk ? (
                      <div className="truncate text-xs text-[var(--ft-link,var(--accent))]">
                        {S.spouseLinkedTo(whereOf(people, lk))}
                      </div>
                    ) : null}
                  </div>
                  <Button size="sm" onClick={() => select(s.id)}>
                    {S.edit}
                  </Button>
                  {lk ? (
                    <Button size="sm" icon={<ArrowRight />} onClick={() => goTo(lk.id)}>
                      {S.goTo}
                    </Button>
                  ) : null}
                </li>
              );
            })}
            {otherSide.map((h) => (
              <li
                key={`o${h.id}`}
                className="flex items-center gap-2 rounded-md border border-dashed border-border px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{h.name || S.unnamed}</div>
                  <div className="truncate text-xs text-muted">{S.linkedFromOther}</div>
                </div>
                <Button size="sm" icon={<ArrowRight />} onClick={() => goTo(h.id)}>
                  {S.goTo}
                </Button>
              </li>
            ))}
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

      <Section title={S.adoptSection} persistKey="family-tree:person-adopt">
        <Field label={S.adoptKind}>
          <Select
            value={adoptKind}
            data-field="adopt-kind"
            options={[
              { value: 'none', label: S.adoptNone },
              { value: 'heir', label: S.adoptHeir },
              { value: 'adopted', label: S.adoptAdopted },
            ]}
            onValueChange={(v) =>
              updatePeople((d) =>
                setAdoptKind(d as People, p.id, v === 'none' ? null : (v as AdoptInfo['kind'])),
              )
            }
          />
        </Field>
        {p.adopt ? (
          <>
            <Field label={p.adopt.kind === 'adopted' ? S.adoptFatherAdopted : S.adoptFatherHeir}>
              <Select
                value={adoptValue}
                data-field="adopt-father"
                options={[
                  { value: '__none__', label: S.adoptPick },
                  ...adoptFathers.map((f) => memberOption(people, f)),
                ]}
                onValueChange={(v) => {
                  const to = v === '__none__' ? null : v;
                  updatePeople((d) => setAdoptFather(d as People, p.id, to));
                  if (to) setTimeout(() => canvasApi.current?.centerOn(p.id), 30);
                }}
              />
            </Field>
            <p className="m-0 text-xs text-muted">{S.adoptHint}</p>
          </>
        ) : null}
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

      <AvatarSection person={p} />
      <GmSection
        person={p}
        fields={MEMBER_GM_FIELDS}
        onlyLabel={S.gmOnlyMember}
        onlyHint={S.gmOnlyMemberHint}
      />

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

/** 女兒寫成「女（適 丈夫）」時，面板最上方是女婿（第一位丈夫）的資料（F84，同原作） */
function HusbandSection({
  husband,
  people,
  more,
}: {
  husband: Spouse;
  people: People;
  more: boolean;
}) {
  const src = shownOf(people, husband);
  const lk = linkOf(people, husband);
  return (
    <Section title={S.husbandSection} persistKey="family-tree:person-husband">
      <FieldRow columns={2}>
        <TextField person={src} k="name" label={S.fName} testId="husband-name" />
        <TextField person={src} k="reading" label={S.fReading} testId="husband-reading" />
      </FieldRow>
      <TextField
        person={husband}
        k="origin"
        label={S.fOrigin}
        placeholder={S.fOriginPlaceholder}
        testId="husband-origin"
      />
      <FieldRow columns={2}>
        <TextField person={src} k="birth" label={S.fBirth} testId="husband-birth" />
        <TextField person={src} k="death" label={S.fDeath} testId="husband-death" />
      </FieldRow>
      <TextField person={husband} k="note" label={S.fNote} multiline testId="husband-note" />
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" onClick={() => select(husband.id)}>
          {S.husbandMore}
        </Button>
        {lk ? (
          <Button size="sm" icon={<ArrowRight />} onClick={() => goTo(lk.id)}>
            {S.linkGo}
          </Button>
        ) : null}
      </div>
      {lk ? (
        <p className="m-0 text-xs text-muted">
          {S.husbandLinked(whereOf(people, lk), lk.name || S.unnamed)}
        </p>
      ) : null}
      {more ? <p className="m-0 text-xs text-muted">{S.husbandFirst}</p> : null}
    </Section>
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
  const lk = linkOf(people, s);
  const rel = host?.gender === 'F' ? S.husband : S.wife;
  const choices = linkChoices(people, s);
  return (
    <div className="flex flex-col gap-3" data-testid="spouse-panel">
      <Header
        title={src.name || S.unnamed}
        sub={`${S.spouseSub(host?.name || S.unnamed, rel)}${lk ? S.spouseSubLinked : ''}`}
      />
      <CategoryPicker person={s} board={board} />
      <Section title={S.linkSection} persistKey="family-tree:spouse-link">
        <Field label={S.linkTo}>
          <Select
            value={lk ? lk.id : '__none__'}
            data-field="link"
            options={[
              { value: '__none__', label: S.linkNone },
              ...choices.map((m) => memberOption(people, m)),
            ]}
            onValueChange={(v) => {
              const to = v === '__none__' ? null : v;
              updatePeople((d) => void setLink(d as People, s.id, to));
              if (to) {
                setTimeout(() => canvasApi.current?.fit(true), 40);
                notify({ title: S.linkAdded(people[to]?.name || S.unnamed), tone: 'success' });
              }
            }}
          />
        </Field>
        {lk ? (
          <>
            <div>
              <Button size="sm" icon={<ArrowRight />} onClick={() => goTo(lk.id)}>
                {S.linkGo}
              </Button>
            </div>
            <p className="m-0 text-xs text-muted">{S.linkHintOn(lk.name || S.unnamed)}</p>
          </>
        ) : (
          <p className="m-0 text-xs text-muted">{S.linkHintOff}</p>
        )}
      </Section>
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
        <StatusField person={src} />
        {!lk ? (
          <TextField
            person={s}
            k="parents"
            label={S.fParents}
            placeholder={S.fParentsPlaceholder}
          />
        ) : null}
        <TextField person={s} k="note" label={S.fNote} multiline />
      </Section>
      <AvatarSection person={src} />
      <GmSection
        person={s}
        fields={lk ? LINKED_GM_FIELDS : SPOUSE_GM_FIELDS}
        onlyLabel={S.gmOnlySpouse}
        onlyHint={S.gmOnlySpouseHint}
        note={lk ? S.gmFieldsLinked(lk.name || S.unnamed) : undefined}
      />
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

/** 連結的配偶：名字、讀音、生歿年、狀態、頭像跟著連到的成員（到那個人的卡片設定） */
const LINKED_GM_FIELDS: readonly GmField[] = SPOUSE_GM_FIELDS.filter((f) =>
  ['origin', 'note', 'cat'].includes(f),
);

/* ---------- 沒有選取、PL 檢視 ---------- */

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

function PlNotice() {
  return (
    <Notice
      tone="info"
      action={
        <Button size="sm" icon={<Eye />} onClick={() => setPrefs({ viewMode: 'gm' })}>
          {S.toGmView}
        </Button>
      }
    >
      <span data-testid="pl-readonly">{S.plReadOnly}</span>
    </Notice>
  );
}

export function PersonPanel() {
  const board = useBoard();
  const selectedId = useUi((s) => s.selectedId);
  const pl = usePrefs((s) => s.data.viewMode === 'pl');
  if (pl) return <PlNotice />;
  const p = selectedId ? board.people[selectedId] : undefined;
  if (!p) return <NoSelection />;
  /* 換人時整個面板重建（文字欄的手勢、訊息不會帶到下一個人） */
  return p.kind === 'member' ? (
    <MemberPanel key={p.id} p={p} board={board} />
  ) : (
    <SpousePanel key={p.id} s={p} board={board} />
  );
}
