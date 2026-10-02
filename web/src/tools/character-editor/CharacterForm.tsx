/**
 * 表單（目前的角色，F17～F32）：每個欄位改動後輸出立刻更新。
 */
import { memo, useRef } from 'react';
import { Button, Field, Section, TextArea, TextInput } from '@/ui';
import { ColorRow, NumberCell } from './controls';
import { ListSection } from './ListSection';
import { insertReference, referenceLabels, referenceToken } from './logic';
import { setField, useEditor } from './store';
import { S } from './strings';

function BasicsSection() {
  const c = useEditor((s) => s.data.character);
  return (
    <Section fixed title={S.form.basics}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={S.form.name}>
          <TextInput value={c.name} onChange={(e) => setField('name', e.target.value)} />
        </Field>
        <Field label={S.form.initiative} hint={S.form.initiativeHint}>
          <NumberCell value={c.initiative} onChange={(v) => setField('initiative', v)} />
        </Field>
        <Field label={S.form.externalUrl} hint={S.form.externalUrlHint}>
          <TextInput
            type="text"
            inputMode="url"
            value={c.externalUrl}
            onChange={(e) => setField('externalUrl', e.target.value)}
          />
        </Field>
        <Field label={S.form.color} hint={S.form.colorHint}>
          <ColorRow color={c.color} onChange={(v) => setField('color', v)} />
        </Field>
      </div>
      <Field label={S.form.memo} hint={S.form.memoHint}>
        <TextArea rows={4} value={c.memo} onChange={(e) => setField('memo', e.target.value)} />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={S.form.width}>
          <NumberCell
            value={c.width}
            onChange={(v) => setField('width', v)}
            unit={S.form.widthUnit}
          />
        </Field>
      </div>
    </Section>
  );
}

/** 聊天面板（F30）＋引用按鈕列（F31、F32） */
function CommandsSection() {
  const commands = useEditor((s) => s.data.character.commands);
  const status = useEditor((s) => s.data.character.status);
  const params = useEditor((s) => s.data.character.params);
  const area = useRef<HTMLTextAreaElement>(null);
  /** 聊天面板有沒有聚焦過（沒有的話插在最後） */
  const touched = useRef(false);
  const statusRefs = referenceLabels(status);
  const paramRefs = referenceLabels(params);

  const insert = (label: string) => {
    const el = area.current;
    const text = useEditor.getState().data.character.commands;
    const use = touched.current && el;
    const r = insertReference(
      text,
      label,
      use ? el.selectionStart : text.length,
      use ? el.selectionEnd : text.length,
    );
    setField('commands', r.text);
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(r.caret, r.caret);
    });
  };

  const group = (title: string, labels: string[], kind: string) =>
    labels.length ? (
      <div className="flex flex-wrap items-center gap-1.5" data-ref-group={kind}>
        <span className="text-xs font-medium text-muted">{title}</span>
        {labels.map((label, i) => (
          <Button
            // biome-ignore lint/suspicious/noArrayIndexKey: 同名的標籤會有多個按鈕，只能用位置區分
            key={i}
            size="sm"
            className="font-mono"
            title={S.commands.refHint}
            onClick={() => insert(label)}
          >
            {referenceToken(label)}
          </Button>
        ))}
      </div>
    ) : null;

  return (
    <Section fixed title={S.commands.title} description={S.commands.description}>
      <fieldset
        className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0"
        data-testid="reference-bar"
      >
        <legend className="sr-only">{S.commands.refsAria}</legend>
        {statusRefs.length || paramRefs.length ? (
          <>
            {group(S.lists.status.title, statusRefs, 'status')}
            {group(S.lists.params.title, paramRefs, 'params')}
          </>
        ) : (
          <p className="m-0 text-xs text-muted">{S.commands.refEmpty}</p>
        )}
      </fieldset>
      <TextArea
        ref={area}
        aria-label={S.commands.aria}
        rows={8}
        spellCheck={false}
        value={commands}
        onFocus={() => {
          touched.current = true;
        }}
        onChange={(e) => setField('commands', e.target.value)}
      />
    </Section>
  );
}

function CharacterFormBody() {
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="character-form">
      <BasicsSection />
      <ListSection list="status" />
      <ListSection list="params" />
      <CommandsSection />
    </div>
  );
}

/** 外層（讀入區的文字、輸出）改變時不重畫整張表單：各區自己訂閱需要的資料 */
export const CharacterForm = memo(CharacterFormBody);
