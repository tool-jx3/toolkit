/**
 * 「自介卡」分頁（規格 F01～F15）：基本資料、頭像、跑團經驗、玩過的系統、喜歡的風格、團的形式、平台與工具、
 * 可以的時段、聯絡方式、想說的話。每個區塊右上角的眼睛決定放不放在卡片上（F15）。
 */
import { ArrowDown, ArrowUp, Eye, EyeOff, Plus, Trash2, X } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import {
  Button,
  Checkbox,
  Chips,
  Field,
  FieldRow,
  IconButton,
  Section,
  Segmented,
  Select,
  TextArea,
  TextInput,
} from '@/ui';
import { AvatarField } from './AvatarField';
import {
  addContact,
  addExtraTag,
  addSystem,
  moveSystem,
  removeContact,
  removeExtraTag,
  removeSystem,
  setProfileText,
  setShow,
  togglePresetTag,
  updateContact,
  updateSystem,
} from './actions';
import {
  AGE_CHOICES,
  type AgeChoice,
  EXP_LEVELS,
  type ExpLevel,
  type FieldKey,
  LIMITS,
  SYSTEM_LEVELS,
  type SystemLevel,
  TAG_PRESETS,
  type TagGroupKey,
} from './model';
import { gesture, useProfile } from './store';
import { CONTACT_SUGGESTIONS, OUT, S, SYSTEM_SUGGESTIONS } from './strings';

const persist = (k: string) => `pl-profile:${k}`;

/** 放不放在卡片上的眼睛 */
export function ShowToggle({ field }: { field: FieldKey }) {
  const on = useProfile((s) => s.data.show[field]);
  const name = OUT.fields[field];
  return (
    <IconButton
      size="sm"
      label={on ? S.show.on(name) : S.show.off(name)}
      icon={on ? <Eye /> : <EyeOff />}
      pressed={on}
      data-show={field}
      onClick={() => setShow(field, !on)}
    />
  );
}

/** 有眼睛的區塊；關掉時內容變淡、寫一行說明 */
function FieldSection({
  field,
  title,
  children,
}: {
  field: FieldKey;
  title: string;
  children: ReactNode;
}) {
  const on = useProfile((s) => s.data.show[field]);
  return (
    <Section title={title} persistKey={persist(field)} actions={<ShowToggle field={field} />}>
      <div className="flex flex-col gap-3" data-field={field} data-shown={on ? '1' : '0'}>
        {on ? null : <p className="m-0 text-xs text-muted">{S.show.hiddenHint}</p>}
        <div className={on ? 'flex flex-col gap-3' : 'flex flex-col gap-3 opacity-60'}>
          {children}
        </div>
      </div>
    </Section>
  );
}

/** 單行文字欄（從進入到離開算一步復原） */
function TextField({
  label,
  value,
  onChange,
  max,
  placeholder,
  suffix,
  list,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  max: number;
  placeholder?: string;
  suffix?: ReactNode;
  list?: string;
}) {
  return (
    <Field label={label} labelSuffix={suffix}>
      <TextInput
        value={value}
        maxLength={max}
        placeholder={placeholder}
        list={list}
        onFocus={gesture.begin}
        onBlur={gesture.commit}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

function BasicSection() {
  const p = useProfile((s) => s.data.profile);
  const showAge = useProfile((s) => s.data.show.age);
  return (
    <Section title={S.profile.basic} persistKey={persist('basic')}>
      <TextField
        label={S.profile.nickname}
        value={p.nickname}
        max={LIMITS.nickname}
        placeholder={S.profile.nicknamePh}
        onChange={(v) => setProfileText('nickname', v)}
      />
      <TextField
        label={S.profile.handle}
        value={p.handle}
        max={LIMITS.handle}
        placeholder={S.profile.handlePh}
        suffix={<ShowToggle field="handle" />}
        onChange={(v) => setProfileText('handle', v)}
      />
      <TextField
        label={S.profile.tagline}
        value={p.tagline}
        max={LIMITS.tagline}
        placeholder={S.profile.taglinePh}
        suffix={<ShowToggle field="tagline" />}
        onChange={(v) => setProfileText('tagline', v)}
      />
      <Field label={S.profile.age} labelSuffix={<ShowToggle field="age" />}>
        <Segmented<AgeChoice | 'unset'>
          size="sm"
          value={p.age || 'unset'}
          onValueChange={(v) =>
            useProfile.getState().update((d) => {
              d.profile.age = v === 'unset' ? '' : v;
            })
          }
          options={[
            { value: 'unset', label: S.profile.ageNone },
            ...AGE_CHOICES.map((a) => ({ value: a, label: OUT.age[a] })),
          ]}
          className={showAge ? undefined : 'opacity-60'}
        />
      </Field>
    </Section>
  );
}

function ExperienceSection() {
  const p = useProfile((s) => s.data.profile);
  const expOptions = [
    { value: 'unset' as const, label: S.profile.expNone },
    ...EXP_LEVELS.map((l) => ({ value: l, label: OUT.exp[l] })),
  ];
  const set = (key: 'plExp' | 'kpExp', v: Exclude<ExpLevel, ''> | 'unset') =>
    useProfile.getState().update((d) => {
      d.profile[key] = v === 'unset' ? '' : v;
    });
  return (
    <FieldSection field="experience" title={OUT.fields.experience}>
      <FieldRow columns={2}>
        <Field label={S.profile.plExp}>
          <Select
            value={p.plExp || 'unset'}
            onValueChange={(v) => set('plExp', v)}
            options={expOptions}
          />
        </Field>
        <Field label={S.profile.kpExp}>
          <Select
            value={p.kpExp || 'unset'}
            onValueChange={(v) => set('kpExp', v)}
            options={expOptions}
          />
        </Field>
      </FieldRow>
      <TextField
        label={S.profile.expNote}
        value={p.expNote}
        max={LIMITS.expNote}
        placeholder={S.profile.expNotePh}
        onChange={(v) => setProfileText('expNote', v)}
      />
    </FieldSection>
  );
}

function SystemsSection() {
  const systems = useProfile((s) => s.data.profile.systems);
  const listId = useId();
  const full = systems.length >= LIMITS.systems;
  return (
    <FieldSection field="systems" title={OUT.fields.systems}>
      <datalist id={listId}>
        {SYSTEM_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {systems.length ? (
        <ol className="m-0 flex list-none flex-col gap-2 p-0" aria-label={OUT.fields.systems}>
          {systems.map((s, i) => (
            <li
              key={s.id}
              className="flex flex-col gap-2 rounded-md border border-border bg-surface-2 p-2"
              data-system={s.id}
            >
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <TextField
                    label={S.profile.systemName}
                    value={s.name}
                    max={LIMITS.systemName}
                    placeholder={S.profile.systemNamePh}
                    list={listId}
                    onChange={(v) => updateSystem(s.id, { name: v })}
                  />
                </div>
                <IconButton
                  size="sm"
                  label={S.profile.systemUp}
                  icon={<ArrowUp />}
                  disabled={i === 0}
                  onClick={() => moveSystem(s.id, -1)}
                />
                <IconButton
                  size="sm"
                  label={S.profile.systemDown}
                  icon={<ArrowDown />}
                  disabled={i === systems.length - 1}
                  onClick={() => moveSystem(s.id, 1)}
                />
                <IconButton
                  size="sm"
                  label={S.profile.systemRemove(s.name.trim())}
                  icon={<Trash2 />}
                  onClick={() => removeSystem(s.id)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                <Segmented<SystemLevel>
                  size="sm"
                  aria-label={`${s.name.trim() || S.profile.systemName}：${S.profile.systemLevel}`}
                  value={s.level}
                  onValueChange={(v) => updateSystem(s.id, { level: v })}
                  options={SYSTEM_LEVELS.map((l) => ({ value: l, label: OUT.systemLevels[l] }))}
                />
                <Checkbox
                  checked={s.kp}
                  onCheckedChange={(v) => updateSystem(s.id, { kp: v })}
                  label={S.profile.systemKp}
                />
              </div>
              <TextField
                label={S.profile.systemNote}
                value={s.note}
                max={LIMITS.systemNote}
                placeholder={S.profile.systemNotePh}
                onChange={(v) => updateSystem(s.id, { note: v })}
              />
            </li>
          ))}
        </ol>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <Button
          size="sm"
          icon={<Plus />}
          disabled={full}
          onClick={() => addSystem()}
          className="self-start"
        >
          {S.profile.systemAdd}
        </Button>
        {full ? (
          <p className="m-0 text-xs text-muted">{S.profile.systemFull(LIMITS.systems)}</p>
        ) : (
          <Chips
            aria-label={S.profile.systemSuggest}
            items={SYSTEM_SUGGESTIONS.filter((x) => !systems.some((s) => s.name.trim() === x))}
            onPick={(v) => addSystem(v)}
          />
        )}
      </div>
    </FieldSection>
  );
}

/** 標籤組：預設的選項（複選）＋自己加的 */
function TagField({ group }: { group: TagGroupKey }) {
  const g = useProfile((s) => s.data.profile[group]);
  const [draft, setDraft] = useState('');
  const [msg, setMsg] = useState('');
  const names = OUT.tags[group] as Record<string, string>;
  const title = OUT.fields[group];
  const add = () => {
    const r = addExtraTag(group, draft, names);
    if (r === 'ok') {
      setDraft('');
      setMsg('');
    } else if (r === 'dup') setMsg(S.profile.tagDup(draft.trim()));
    else if (r === 'full') setMsg(S.profile.tagFull(LIMITS.tagExtra));
  };
  return (
    <div className="flex flex-col gap-2">
      <Chips
        aria-label={title}
        size="md"
        items={TAG_PRESETS[group].map((id) => ({ value: id, label: names[id] }))}
        values={g.picked}
        onPick={(id) => togglePresetTag(group, id)}
      />
      {g.extra.length ? (
        <ul
          className="m-0 flex list-none flex-wrap gap-1.5 p-0"
          aria-label={S.profile.tagAddAria(title)}
        >
          {g.extra.map((label, i) => (
            <li
              key={label}
              className="inline-flex min-h-8 max-w-full items-center gap-1 rounded-2xl border border-accent bg-accent-soft py-0.5 pr-0.5 pl-3 text-sm text-accent"
            >
              {/* 很長的英數字（沒有空白）也能斷行，窄畫面不會橫向捲動 */}
              <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>
              <IconButton
                size="sm"
                noTooltip
                label={S.profile.tagRemove(label)}
                icon={<X />}
                onClick={() => removeExtraTag(group, i)}
                className="size-6 shrink-0"
              />
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex gap-2">
        <TextInput
          aria-label={S.profile.tagAddAria(title)}
          value={draft}
          maxLength={LIMITS.tagLabel}
          placeholder={S.profile.tagAddPh}
          onChange={(e) => {
            setDraft(e.target.value);
            setMsg('');
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            }
          }}
          className="min-w-0 flex-1"
        />
        <Button size="sm" icon={<Plus />} disabled={!draft.trim()} onClick={add}>
          {S.profile.tagAdd}
        </Button>
      </div>
      {msg ? (
        <p role="status" className="m-0 text-xs text-warning">
          {msg}
        </p>
      ) : null}
    </div>
  );
}

function ScheduleNote() {
  const note = useProfile((s) => s.data.profile.scheduleNote);
  return (
    <TextField
      label={S.profile.scheduleNote}
      value={note}
      max={LIMITS.scheduleNote}
      placeholder={S.profile.scheduleNotePh}
      onChange={(v) => setProfileText('scheduleNote', v)}
    />
  );
}

function ContactsSection() {
  const contacts = useProfile((s) => s.data.profile.contacts);
  const listId = useId();
  const full = contacts.length >= LIMITS.contacts;
  return (
    <FieldSection field="contact" title={OUT.fields.contact}>
      <datalist id={listId}>
        {CONTACT_SUGGESTIONS.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
      {contacts.map((c) => (
        <div key={c.id} className="flex items-end gap-2" data-contact={c.id}>
          <div className="w-28 shrink-0">
            <TextField
              label={S.profile.contactKind}
              value={c.kind}
              max={LIMITS.contactKind}
              placeholder={S.profile.contactKindPh}
              list={listId}
              onChange={(v) => updateContact(c.id, { kind: v })}
            />
          </div>
          <div className="min-w-0 flex-1">
            <TextField
              label={S.profile.contactValue}
              value={c.value}
              max={LIMITS.contactValue}
              placeholder={S.profile.contactValuePh}
              onChange={(v) => updateContact(c.id, { value: v })}
            />
          </div>
          <IconButton
            size="sm"
            label={S.profile.contactRemove(c.kind.trim())}
            icon={<Trash2 />}
            onClick={() => removeContact(c.id)}
          />
        </div>
      ))}
      <Button
        size="sm"
        icon={<Plus />}
        disabled={full}
        onClick={() => addContact()}
        className="self-start"
      >
        {S.profile.contactAdd}
      </Button>
      {full ? (
        <p className="m-0 text-xs text-muted">{S.profile.contactFull(LIMITS.contacts)}</p>
      ) : null}
    </FieldSection>
  );
}

function MemoSection() {
  const memo = useProfile((s) => s.data.profile.memo);
  return (
    <FieldSection field="memo" title={OUT.fields.memo}>
      <Field label={S.profile.memo} hint={S.profile.count(Array.from(memo).length, LIMITS.memo)}>
        <TextArea
          value={memo}
          rows={4}
          maxLength={LIMITS.memo}
          placeholder={S.profile.memoPh}
          onFocus={gesture.begin}
          onBlur={gesture.commit}
          onChange={(e) => setProfileText('memo', e.target.value)}
        />
      </Field>
    </FieldSection>
  );
}

export function ProfileTab() {
  const credit = useProfile((s) => s.data.profile.avatarCredit);
  return (
    <div className="flex flex-col gap-3">
      <BasicSection />
      <FieldSection field="avatar" title={OUT.fields.avatar}>
        <AvatarField />
        <TextField
          label={S.profile.avatarCredit}
          value={credit}
          max={LIMITS.avatarCredit}
          placeholder={S.profile.avatarCreditPh}
          onChange={(v) => setProfileText('avatarCredit', v)}
        />
      </FieldSection>
      <ExperienceSection />
      <SystemsSection />
      <FieldSection field="styles" title={OUT.fields.styles}>
        <TagField group="styles" />
      </FieldSection>
      <FieldSection field="formats" title={OUT.fields.formats}>
        <TagField group="formats" />
      </FieldSection>
      <FieldSection field="tools" title={OUT.fields.tools}>
        <TagField group="tools" />
      </FieldSection>
      <FieldSection field="schedule" title={OUT.fields.schedule}>
        <TagField group="schedule" />
        <ScheduleNote />
      </FieldSection>
      <ContactsSection />
      <MemoSection />
    </div>
  );
}
