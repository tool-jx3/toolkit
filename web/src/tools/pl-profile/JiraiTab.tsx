/**
 * 「地雷表」分頁（規格 F20～F29）：圖例、成人向的開關、已填幾個、快速操作；每個分類一個區塊（主題一列：
 * 名稱、五級量表、補充），自訂主題與自訂分類；最下面是整張的補充說明。
 */
import { Eraser, MessageSquarePlus, Plus, Trash2 } from 'lucide-react';
import { memo, useState } from 'react';
import {
  Button,
  cn,
  Field,
  IconButton,
  Section,
  TextArea,
  TextInput,
  Toggle,
  useConfirm,
} from '@/ui';
import {
  addCategory,
  addCustomTopic,
  clearJirai,
  fillUnsetOk,
  removeCategory,
  removeCustomTopic,
  renameCategory,
  renameCustomTopic,
  setAdult,
  setJiraiMemo,
  setLevel,
  setTopicNote,
} from './actions';
import { LEVEL_UI, LevelPicker } from './LevelPicker';
import {
  type CategoryView,
  jiraiCategories,
  jiraiProgress,
  LEVELS,
  type LevelId,
  LIMITS,
  type TopicView,
} from './model';
import { gesture, useProfile } from './store';
import { OUT, S } from './strings';

/** 圖例（介面）：五個程度的樣子 */
export function LevelLegend({ className }: { className?: string }) {
  return (
    <ul
      aria-label={S.jirai.legendAria}
      className={cn('m-0 flex list-none flex-wrap gap-1.5 p-0', className)}
    >
      {LEVELS.map((l) => (
        <li
          key={l}
          title={OUT.levelHints[l]}
          data-on="true"
          className={cn(
            'inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-semibold',
            LEVEL_UI[l],
          )}
        >
          <span aria-hidden>{OUT.symbols[l]}</span>
          {OUT.levels[l]}
        </li>
      ))}
    </ul>
  );
}

const TopicRow = memo(function TopicRow({ topic }: { topic: TopicView }) {
  const [noteOpen, setNoteOpen] = useState(false);
  const showNote = noteOpen || !!topic.note;
  const name = topic.label.trim() || S.jirai.customPh;
  const onLevel = (l: LevelId | null) => setLevel(topic.id, l);
  return (
    <li
      className="flex flex-col gap-1.5 border-b border-border py-2 last:border-b-0"
      data-topic={topic.id}
      data-level={topic.level ?? ''}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
        {topic.builtin ? (
          <span className="min-w-0 flex-1 basis-40 text-sm text-fg">{topic.label}</span>
        ) : (
          <TextInput
            aria-label={S.jirai.customLabelAria}
            value={topic.label}
            maxLength={LIMITS.topicLabel}
            placeholder={S.jirai.customPh}
            onFocus={gesture.begin}
            onBlur={gesture.commit}
            onChange={(e) => renameCustomTopic(topic.id, e.target.value)}
            className="min-w-0 flex-1 basis-40"
          />
        )}
        <div className="flex items-center gap-1">
          <LevelPicker value={topic.level} onChange={onLevel} label={name} />
          <IconButton
            size="sm"
            label={S.jirai.noteToggle(name)}
            icon={<MessageSquarePlus />}
            pressed={showNote}
            onClick={() => {
              if (showNote && !topic.note) setNoteOpen(false);
              else setNoteOpen(true);
            }}
          />
          {topic.builtin ? null : (
            <IconButton
              size="sm"
              label={S.jirai.customRemove(topic.label.trim())}
              icon={<Trash2 />}
              onClick={() => removeCustomTopic(topic.id)}
            />
          )}
        </div>
      </div>
      {showNote ? (
        <TextInput
          aria-label={S.jirai.noteAria(name)}
          value={topic.note}
          maxLength={LIMITS.topicNote}
          placeholder={S.jirai.notePh}
          autoFocus={noteOpen && !topic.note}
          onFocus={gesture.begin}
          onBlur={() => {
            gesture.commit();
            if (!topic.note) setNoteOpen(false);
          }}
          onChange={(e) => setTopicNote(topic.id, e.target.value)}
        />
      ) : null}
    </li>
  );
});

function AddTopic({ cat, catName }: { cat: string; catName: string }) {
  const [draft, setDraft] = useState('');
  const [msg, setMsg] = useState('');
  const add = () => {
    const r = addCustomTopic(cat, draft);
    if (r === 'ok') {
      setDraft('');
      setMsg('');
    } else if (r === 'full') setMsg(S.jirai.topicFull(LIMITS.customTopics));
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex gap-2">
        <TextInput
          aria-label={S.jirai.addTopicAria(catName)}
          value={draft}
          maxLength={LIMITS.topicLabel}
          placeholder={S.jirai.addTopicPh}
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
          {S.jirai.addTopic}
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

function CategorySection({ c }: { c: CategoryView }) {
  const confirm = useConfirm();
  const named = c.topics.filter((t) => t.builtin || t.label.trim());
  const filled = named.filter((t) => t.level).length;
  const title = c.name.trim() || S.jirai.catUntitled;
  return (
    <Section
      title={title}
      persistKey={`pl-profile:cat:${c.id}`}
      actions={
        <span className="text-xs text-muted tabular-nums" data-testid="cat-count">
          {S.jirai.categoryCount(filled, named.length)}
        </span>
      }
    >
      <div data-category={c.id} className="flex flex-col gap-2">
        {c.builtin ? null : (
          <div className="flex items-end gap-2">
            <Field label={S.jirai.catNameAria} className="min-w-0 flex-1">
              <TextInput
                value={c.name}
                maxLength={LIMITS.catName}
                placeholder={S.jirai.addCatPh}
                onFocus={gesture.begin}
                onBlur={gesture.commit}
                onChange={(e) => renameCategory(c.id, e.target.value)}
              />
            </Field>
            <IconButton
              size="sm"
              label={S.jirai.catRemove(c.name.trim())}
              icon={<Trash2 />}
              onClick={async () => {
                const n = c.topics.length;
                if (
                  n &&
                  !(await confirm({
                    title: S.jirai.catRemoveTitle(c.name.trim()),
                    description: S.jirai.catRemoveDesc(n),
                    confirmLabel: S.jirai.catRemoveConfirm,
                    danger: true,
                  }))
                )
                  return;
                removeCategory(c.id);
              }}
            />
          </div>
        )}
        {c.topics.length ? (
          <ul className="m-0 list-none p-0">
            {c.topics.map((t) => (
              <TopicRow key={t.id} topic={t} />
            ))}
          </ul>
        ) : null}
        <AddTopic cat={c.id} catName={title} />
      </div>
    </Section>
  );
}

function AddCategory() {
  const count = useProfile((s) => s.data.jirai.cats.length);
  const [draft, setDraft] = useState('');
  const full = count >= LIMITS.customCats;
  const add = () => {
    if (addCategory(draft)) setDraft('');
  };
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-dashed border-border-strong p-3">
      <div className="flex gap-2">
        <TextInput
          aria-label={S.jirai.addCat}
          value={draft}
          maxLength={LIMITS.catName}
          placeholder={S.jirai.addCatPh}
          disabled={full}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              add();
            }
          }}
          className="min-w-0 flex-1"
        />
        <Button size="sm" icon={<Plus />} disabled={full} onClick={add}>
          {S.jirai.addCat}
        </Button>
      </div>
      {full ? <p className="m-0 text-xs text-muted">{S.jirai.catFull(LIMITS.customCats)}</p> : null}
    </div>
  );
}

export function JiraiTab() {
  const jirai = useProfile((s) => s.data.jirai);
  const confirm = useConfirm();
  const cats = jiraiCategories(jirai);
  const { filled, total } = jiraiProgress(jirai);
  const unsetIds = cats.flatMap((c) =>
    c.topics.filter((t) => !t.level && (t.builtin || t.label.trim())).map((t) => t.id),
  );
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
        <LevelLegend />
        <p className="m-0 text-xs text-muted">{S.jirai.levelClearHint}</p>
        <Field label={S.jirai.adult} hint={S.jirai.adultHint} layout="inline">
          <Toggle checked={jirai.adult} onCheckedChange={setAdult} />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-auto text-sm text-fg tabular-nums" data-testid="jirai-progress">
            {S.jirai.progress(filled, total)}
          </span>
          <Button size="sm" disabled={!unsetIds.length} onClick={() => fillUnsetOk(unsetIds)}>
            {S.jirai.fillOk}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            icon={<Eraser />}
            disabled={
              !filled && !Object.keys(jirai.notes).length && !jirai.custom.some((t) => t.note)
            }
            onClick={async () => {
              if (
                await confirm({
                  title: S.jirai.clearTitle,
                  description: S.jirai.clearDesc,
                  confirmLabel: S.jirai.clearConfirm,
                  danger: true,
                })
              )
                clearJirai();
            }}
          >
            {S.jirai.clearAll}
          </Button>
        </div>
      </div>
      {cats.map((c) => (
        <CategorySection key={c.id} c={c} />
      ))}
      <AddCategory />
      <Section title={S.jirai.memo} persistKey="pl-profile:jirai-memo">
        <Field
          label={S.jirai.memo}
          hint={S.profile.count(Array.from(jirai.memo).length, LIMITS.jiraiMemo)}
        >
          <TextArea
            value={jirai.memo}
            rows={3}
            maxLength={LIMITS.jiraiMemo}
            placeholder={S.jirai.memoPh}
            onFocus={gesture.begin}
            onBlur={gesture.commit}
            onChange={(e) => setJiraiMemo(e.target.value)}
          />
        </Field>
      </Section>
    </div>
  );
}
