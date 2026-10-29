/**
 * 時間的文字欄（規格 F02）：寬鬆地解讀，離開欄位或 Enter 時套用並改成標準寫法；看不懂時標紅、寫原因、不套用；Esc 還原。
 * 欄位下方寫解讀的結果。
 * 輸入中被換掉（例如點了別的事件，編輯區換成別的事件）時，用聚焦當時的 onCommit 套用（不會套用到別的事件）。
 */
import { useEffect, useRef, useState } from 'react';
import { Field, TextInput } from '@/ui';
import { canonical, formatLong, parseTime, type TimeMode } from '../model/time';
import { S } from '../strings';

export interface TimeFieldProps {
  label: string;
  value: string;
  mode: TimeMode;
  era: string;
  onCommit: (text: string) => void;
  /** 額外的檢查（標準寫法 → 錯誤訊息或 null） */
  validate?: (text: string) => string | null;
  disabled?: boolean;
  placeholder?: string;
  hint?: string;
  /** 空白也可以（例如自訂範圍還沒填） */
  allowEmpty?: boolean;
  /** 空白時的錯誤（預設「請輸入時間」） */
  emptyError?: string;
  'data-field'?: string;
}

const PLACEHOLDER: Record<TimeMode, string> = {
  date: '1925-03-12 21:00',
  day: '第 3 天 21:00',
  year: '302',
};

interface Check {
  empty: boolean;
  text: string;
  error: string | null;
  status: string | null;
}

function check(
  draft: string,
  {
    mode,
    era,
    validate,
    allowEmpty,
    emptyError,
  }: Pick<TimeFieldProps, 'mode' | 'era' | 'validate' | 'allowEmpty' | 'emptyError'>,
): Check {
  const empty = !draft.trim();
  if (empty)
    return {
      empty,
      text: '',
      error: allowEmpty ? null : (emptyError ?? '請輸入時間'),
      status: null,
    };
  const parsed = parseTime(mode, draft, era);
  if (!parsed.ok) return { empty, text: '', error: parsed.error, status: null };
  const text = canonical(mode, parsed.tv);
  const error = validate ? validate(text) : null;
  return { empty, text, error, status: S.parsed(formatLong(mode, parsed.tv, era)) };
}

export function TimeField(props: TimeFieldProps) {
  const { label, value, mode, onCommit, disabled, placeholder, hint } = props;
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  const result = check(draft, props);
  /* 聚焦時的 onCommit 與最新的狀態（卸載時套用用） */
  const commitRef = useRef(onCommit);
  const latest = useRef({ draft, editing, value, props });
  latest.current = { draft, editing, value, props };

  const applyDraft = (text: string, current: string, p: TimeFieldProps) => {
    const r = check(text, p);
    if (r.error) return null;
    if (r.empty) {
      if (p.allowEmpty && current) commitRef.current('');
      return '';
    }
    if (r.text !== current) commitRef.current(r.text);
    return r.text;
  };
  const apply = () => {
    const out = applyDraft(draft, value, props);
    if (out !== null) setDraft(out);
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: 卸載時（例如換了選取的事件）套用輸入中的內容
  useEffect(
    () => () => {
      const l = latest.current;
      if (l.editing) applyDraft(l.draft, l.value, l.props);
    },
    [],
  );

  return (
    <Field
      label={label}
      hint={result.error ? undefined : (result.status ?? hint)}
      error={result.error ?? undefined}
    >
      <TextInput
        value={draft}
        disabled={disabled}
        placeholder={placeholder ?? PLACEHOLDER[mode]}
        data-field={props['data-field']}
        onFocus={() => {
          commitRef.current = onCommit;
          setEditing(true);
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          apply();
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            apply();
          } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setDraft(value);
          }
        }}
      />
    </Field>
  );
}
