/**
 * 「事件」分頁（規格 1.2、F83、F90、F93）：範例的提示、選取的事件的欄位與關聯線、多選時一起改的欄位、沒有選取時的說明。
 * PL 檢視時欄位停用（上方一行「切回 GM 檢視才能編輯」），不顯示 GM 筆記；泳道、分類的選項與地點、角色的建議詞
 * 只用 PL 看得到的資料。
 */
import { Copy, Lock, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { historyGesture } from '@/core/storage';
import {
  Button,
  Chips,
  ColorField,
  DEFAULT_SWATCHES,
  Field,
  IconButton,
  Notice,
  Segmented,
  Select,
  TextArea,
  TextInput,
  Toggle,
  useConfirm,
} from '@/ui';
import { minuteOfValue, valueOfMinute } from '../model/calendar';
import { afterUnit, canonical, ctxParts, type EraArg, readTime } from '../model/time';
import {
  type EventKind,
  eventColor,
  type Lane,
  LIMITS,
  PALETTE,
  splitPeople,
  type TimelineEvent,
} from '../model/types';
import { usedCategories, type VisibleDoc } from '../model/visible';
import {
  deleteEvent,
  displayOrder,
  duplicateEvent,
  patchDoc,
  resetBlank,
  select,
  updateEvent,
  useDoc,
  usePrefs,
  useUi,
} from '../store';
import { S } from '../strings';
import { addEventNow } from '../view/actions';
import { useVisibleDoc } from '../view/shared';
import { LinksSection } from './LinksSection';
import { MultiEditor } from './MultiEditor';
import { TimeField } from './TimeField';

const MAIN = '__main';
const NONE = '__none';
const g = historyGesture(useDoc);
const SWATCHES = [...PALETTE, ...DEFAULT_SWATCHES.slice(0, 3)];

/** 已經處理過的「編輯」要求（編輯區換了事件、重新掛上時不重複聚焦） */
let handledFocus = 0;

export function PlLock() {
  return (
    <p data-testid="pl-lock" className="m-0 flex items-center gap-1.5 text-xs text-muted">
      <Lock aria-hidden className="size-3.5 shrink-0" />
      {S.needGm}
    </p>
  );
}

function SampleNote() {
  const sample = useDoc((s) => s.data.sample);
  const pl = usePrefs((s) => s.data.viewMode) === 'pl';
  const confirm = useConfirm();
  if (!sample || pl) return null;
  return (
    <Notice
      tone="info"
      action={
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="secondary"
            data-testid="sample-new"
            onClick={async () => {
              if (
                await confirm({
                  title: S.sampleConfirmTitle,
                  description: S.sampleConfirmDesc,
                  confirmLabel: S.sampleNew,
                  danger: true,
                })
              )
                resetBlank();
            }}
          >
            {S.sampleNew}
          </Button>
          <IconButton
            size="sm"
            variant="ghost"
            label={S.sampleDismiss}
            icon={<X />}
            onClick={() => patchDoc({ sample: false })}
          />
        </div>
      }
    >
      <span data-testid="sample-note">{S.sampleNote}</span>
    </Notice>
  );
}

export function EventPanel() {
  const vdoc = useVisibleDoc();
  const pl = vdoc.audience === 'pl';
  const selectedId = useUi((s) => s.selectedId);
  const selectedIds = useUi((s) => s.selectedIds);
  const doc = useDoc((s) => s.data);
  const ev = selectedId ? doc.events.find((e) => e.id === selectedId) : undefined;
  const visible = ev && vdoc.events.some((e) => e.id === ev.id);
  /* 多選：PL 檢視只算 PL 看得到的 */
  const many = useMemo(() => {
    if (selectedIds.length < 2) return null;
    const shown = new Set((pl ? vdoc.events : doc.events).map((e) => e.id));
    const ids = selectedIds.filter((id) => shown.has(id));
    return ids.length > 1 ? ids : null;
  }, [selectedIds, pl, vdoc.events, doc.events]);
  return (
    <div className="flex flex-col gap-3" data-testid="event-panel">
      <SampleNote />
      {pl ? <PlLock /> : null}
      {many ? (
        <MultiEditor ids={many} vdoc={vdoc} pl={pl} />
      ) : ev && visible ? (
        <EventEditor key={ev.id} ev={ev} pl={pl} vdoc={vdoc} />
      ) : (
        <div className="flex flex-col gap-3">
          <p className="m-0 text-sm text-muted">{S.noSelection}</p>
          <p className="m-0 text-xs text-muted">{S.multiHelp}</p>
          <p className="m-0 text-xs text-muted" data-testid="event-count">
            {pl ? S.eventCountPl(vdoc.events.length) : S.eventCount(doc.events.length)}
          </p>
          <div>
            <Button size="sm" icon={<Plus />} disabled={pl} onClick={addEventNow}>
              {S.addEventLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 種類換成期間、背景時的預設結束：寫到分的開始＋1 小時；只到日、月、年的同一天、月、年 */
function defaultEnd(
  mode: TimelineEvent['kind'],
  ev: TimelineEvent,
  docMode: Parameters<typeof readTime>[0],
  era: EraArg,
): string {
  if (mode === 'point') return '';
  if (ev.end) return ev.end;
  const a = readTime(docMode, ev.start, era);
  if (!a) return '';
  if (docMode !== 'year' && a.p === 'minute')
    return canonical(docMode, { v: a.v + 60, p: 'minute' });
  /* 架空曆寫到時刻（F110）：一樣＋1 小時 */
  const info = docMode === 'year' && a.p === 'minute' ? ctxParts(era).info : null;
  if (info)
    return canonical(
      docMode,
      { v: valueOfMinute(info, minuteOfValue(info, a.v) + 60), p: 'minute' },
      era,
    );
  return canonical(docMode, a, era);
}

function EventEditor({ ev, pl, vdoc }: { ev: TimelineEvent; pl: boolean; vdoc: VisibleDoc }) {
  const doc = useDoc((s) => s.data);
  /* 選項與建議詞的來源：PL 檢視只用 PL 看得到的（GM 專用的泳道、分類、地點、角色不出現） */
  const lanesSrc = pl ? vdoc.lanes : doc.lanes;
  const catsSrc = useMemo(
    () => (pl ? usedCategories(vdoc) : doc.categories),
    [pl, vdoc, doc.categories],
  );
  const eventsSrc = pl ? vdoc.events : doc.events;
  const focusTitle = useUi((s) => s.focusTitle);
  const titleRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const id = ev.id;

  /* 「編輯」：焦點到標題欄並全選（窄畫面捲到編輯區）；剛選取、編輯區才換成這個事件時也算 */
  useEffect(() => {
    if (focusTitle.id !== id || focusTitle.n === handledFocus) return;
    handledFocus = focusTitle.n;
    const el = titleRef.current;
    if (!el) return;
    if (!window.matchMedia?.('(min-width: 1024px)').matches)
      rootRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    el.focus({ preventScroll: true });
    el.select();
  }, [focusTitle, id]);

  /* 換了事件或卸載時結束還開著的手勢（文字欄打字中） */
  useEffect(() => () => useDoc.endGesture(), []);

  const set = (recipe: (e: TimelineEvent) => void) => updateEvent(id, recipe, false);
  const step = (recipe: (e: TimelineEvent) => void) => updateEvent(id, recipe);

  const laneOptions = useMemo(
    () => [
      { value: MAIN, label: S.main },
      ...displayOrder(lanesSrc).map((l) => ({
        value: l.id,
        label: `${l.parentId ? '　' : ''}${l.name.trim() || S.untitled}${l.gm ? '（GM）' : ''}`,
      })),
    ],
    [lanesSrc],
  );
  const catOptions = useMemo(
    () => [
      { value: NONE, label: S.noCategory },
      ...catsSrc.map((c) => ({ value: c.id, label: c.name.trim() || S.untitled })),
    ],
    [catsSrc],
  );
  const places = useMemo(
    () => [...new Set(eventsSrc.map((e) => e.place.trim()).filter(Boolean))].slice(0, 200),
    [eventsSrc],
  );
  const placesId = useId();

  const validateEnd = (text: string) => {
    const a = readTime(doc.mode, ev.start, doc);
    const b = readTime(doc.mode, text, doc);
    if (!a || !b) return null;
    return afterUnit(doc.mode, b, doc) > a.v ? null : S.endAfter;
  };
  const validateStart = (text: string) => {
    if (ev.kind === 'point' || !ev.end) return null;
    const a = readTime(doc.mode, text, doc);
    const b = readTime(doc.mode, ev.end, doc);
    if (!a || !b) return null;
    return afterUnit(doc.mode, b, doc) > a.v ? null : S.endAfter;
  };

  return (
    <div ref={rootRef} className="flex flex-col gap-3" data-testid="event-editor" data-event={id}>
      <Field label={S.fTitle}>
        <TextInput
          ref={titleRef}
          value={ev.title}
          maxLength={LIMITS.eventTitle}
          disabled={pl}
          data-field="title"
          onFocus={g.begin}
          onBlur={g.commit}
          onChange={(e) =>
            set((x) => {
              x.title = e.target.value;
            })
          }
        />
      </Field>
      <Field label={S.fKind} hint={S.kindHints[ev.kind]}>
        <Segmented<EventKind>
          value={ev.kind}
          fullWidth
          disabled={pl}
          onValueChange={(k) =>
            step((x) => {
              x.end = defaultEnd(k, x, doc.mode, doc);
              x.kind = k;
            })
          }
          options={[
            { value: 'point', label: S.kinds.point },
            { value: 'range', label: S.kinds.range },
            { value: 'background', label: S.kinds.background },
          ]}
        />
      </Field>
      <TimeField
        label={S.fStart}
        value={ev.start}
        mode={doc.mode}
        era={doc}
        disabled={pl}
        data-field="start"
        validate={validateStart}
        onCommit={(t) =>
          step((x) => {
            x.start = t;
          })
        }
      />
      {ev.kind !== 'point' ? (
        <TimeField
          label={S.fEnd}
          value={ev.end}
          mode={doc.mode}
          era={doc}
          disabled={pl}
          data-field="end"
          emptyError={S.endRequired}
          validate={validateEnd}
          onCommit={(t) =>
            step((x) => {
              x.end = t;
            })
          }
        />
      ) : null}
      <Field label={S.fLane}>
        <Select
          value={ev.laneId || MAIN}
          disabled={pl}
          data-field="lane"
          onValueChange={(v) =>
            step((x) => {
              x.laneId = v === MAIN ? '' : v;
            })
          }
          options={laneOptions}
        />
      </Field>
      <Field label={S.fPlace}>
        <TextInput
          value={ev.place}
          list={placesId}
          maxLength={LIMITS.place}
          disabled={pl}
          data-field="place"
          onFocus={g.begin}
          onBlur={g.commit}
          onChange={(e) =>
            set((x) => {
              x.place = e.target.value;
            })
          }
        />
      </Field>
      <datalist id={placesId}>
        {places.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <PeopleField ev={ev} pl={pl} lanes={lanesSrc} events={eventsSrc} />
      <Field label={S.fCategory}>
        <Select
          value={ev.categoryId || NONE}
          disabled={pl}
          data-field="category"
          onValueChange={(v) =>
            step((x) => {
              x.categoryId = v === NONE ? '' : v;
            })
          }
          options={catOptions}
        />
      </Field>
      <Field label={S.fCustomColor} layout="inline" hint={ev.color ? undefined : S.colorHint}>
        <Toggle
          checked={!!ev.color}
          disabled={pl}
          onCheckedChange={(on) =>
            step((x) => {
              x.color = on ? eventColor(doc, { ...x, color: '' }) : '';
            })
          }
        />
      </Field>
      {ev.color ? (
        <Field label={S.fColor}>
          <ColorField
            value={ev.color}
            swatches={SWATCHES}
            disabled={pl}
            onChange={(c) =>
              step((x) => {
                x.color = c.slice(0, 7).toLowerCase();
              })
            }
          />
        </Field>
      ) : null}
      {pl ? null : (
        <Field label={S.fGm} layout="inline" hint={S.gmHint}>
          <Toggle
            checked={ev.gm}
            onCheckedChange={(v) =>
              step((x) => {
                x.gm = v;
              })
            }
          />
        </Field>
      )}
      <Field label={S.fDescription}>
        <TextArea
          value={ev.description}
          rows={4}
          maxLength={LIMITS.text}
          disabled={pl}
          data-field="description"
          onFocus={g.begin}
          onBlur={g.commit}
          onChange={(e) =>
            set((x) => {
              x.description = e.target.value;
            })
          }
        />
      </Field>
      {pl ? null : (
        <Field label={<span className="text-warning">{S.fGmNote}</span>} hint={S.gmNoteHint}>
          <TextArea
            value={ev.gmNote}
            rows={3}
            maxLength={LIMITS.text}
            data-field="gmNote"
            onFocus={g.begin}
            onBlur={g.commit}
            onChange={(e) =>
              set((x) => {
                x.gmNote = e.target.value;
              })
            }
          />
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={<Copy />} disabled={pl} onClick={() => duplicateEvent(id)}>
          {S.duplicate}
        </Button>
        <Button
          size="sm"
          variant="danger"
          icon={<Trash2 />}
          disabled={pl}
          data-testid="delete-event"
          onClick={() => deleteEvent(id)}
        >
          {S.delete}
        </Button>
        <Button size="sm" variant="ghost" className="ml-auto" onClick={() => select(null)}>
          {S.deselect}
        </Button>
      </div>
      <LinksSection id={id} vdoc={vdoc} pl={pl} />
    </div>
  );
}

/** 相關角色：以「、」分隔；離開欄位時整理（不重複、有上限）；下方的建議詞點一下加入 */
function PeopleField({
  ev,
  pl,
  lanes,
  events,
}: {
  ev: TimelineEvent;
  pl: boolean;
  /** 建議詞的來源（PL 檢視時只有 PL 看得到的） */
  lanes: readonly Lane[];
  events: readonly TimelineEvent[];
}) {
  const joined = ev.people.join('、');
  const [draft, setDraft] = useState(joined);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(joined);
  }, [joined, editing]);
  const latest = useRef({ draft, editing, joined });
  latest.current = { draft, editing, joined };
  const commit = (text: string, current: string) => {
    const list = splitPeople(text);
    if (list.join('、') !== current)
      updateEvent(ev.id, (x) => {
        x.people = list;
      });
    return list.join('、');
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: 卸載時套用輸入中的內容
  useEffect(
    () => () => {
      const l = latest.current;
      if (l.editing) commit(l.draft, l.joined);
    },
    [],
  );
  const suggestions = useMemo(() => {
    const names = new Set<string>();
    for (const l of lanes)
      if ((l.kind === 'character' || l.kind === 'npc') && l.name.trim()) names.add(l.name.trim());
    for (const e of events) for (const p of e.people) names.add(p);
    return [...names].filter((n) => !ev.people.includes(n)).slice(0, 24);
  }, [lanes, events, ev.people]);
  return (
    <div className="flex flex-col gap-1.5">
      <Field label={S.fPeople} hint={S.peopleHint}>
        <TextInput
          value={draft}
          disabled={pl}
          data-field="people"
          onFocus={() => setEditing(true)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            setDraft(commit(draft, joined));
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              setDraft(commit(draft, joined));
            }
          }}
        />
      </Field>
      {suggestions.length && !pl ? (
        <Chips
          aria-label={S.fPeople}
          items={suggestions}
          onPick={(name) => {
            const list = splitPeople([...splitPeople(draft), name]);
            setDraft(list.join('、'));
            if (!editing) commit(list.join('、'), joined);
          }}
        />
      ) : null}
    </div>
  );
}
