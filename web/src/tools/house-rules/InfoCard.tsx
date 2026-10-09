/**
 * 表的資訊（標題、KP、規則系統、適用劇本、更新日期）與其他備註（規格 F10～F16）。
 */
import { useId } from 'react';
import { historyGesture } from '@/core/storage';
import { Field, TextArea, TextInput } from '@/ui';
import { setInfo } from './actions';
import { LIMITS } from './model';
import { SYSTEM_AUTO } from './rules';
import { useRules } from './store';
import { OUT, S } from './strings';
import { useAutoGrow } from './useAutoGrow';

const gesture = historyGesture(useRules);

export function InfoCard() {
  const info = useRules((s) => s.data.info);
  const edition = useRules((s) => s.data.edition);
  const hintId = useId();
  const text = (key: 'kp' | 'system' | 'scenario', label: string, max: number, ph?: string) => (
    <Field label={label}>
      <TextInput
        value={info[key]}
        maxLength={max}
        placeholder={ph}
        onFocus={gesture.begin}
        onBlur={gesture.commit}
        onChange={(e) => setInfo(key, e.target.value)}
      />
    </Field>
  );
  return (
    <section
      id="hr-info"
      aria-label={S.info.section}
      data-toc-target=""
      className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3"
    >
      <h2 className="sr-only">{S.info.section}</h2>
      <input
        aria-label={S.info.title}
        value={info.title}
        maxLength={LIMITS.title}
        placeholder={OUT.defaultTitle}
        aria-describedby={hintId}
        onFocus={gesture.begin}
        onBlur={gesture.commit}
        onChange={(e) => setInfo('title', e.target.value)}
        className="-mx-2 min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 text-xl font-bold text-fg placeholder:text-muted hover:border-border focus:border-border-strong"
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4">
        {text('kp', S.info.kp, LIMITS.kp)}
        {text('system', S.info.system, LIMITS.system, SYSTEM_AUTO[edition])}
        {text('scenario', S.info.scenario, LIMITS.scenario)}
        <Field label={S.info.date}>
          <TextInput
            type="date"
            value={info.date}
            onFocus={gesture.begin}
            onBlur={gesture.commit}
            onChange={(e) => setInfo('date', e.target.value)}
          />
        </Field>
      </div>
      <p id={hintId} className="m-0 text-xs text-muted">
        {S.info.optional}
      </p>
    </section>
  );
}

export function RemarksCard() {
  const remarks = useRules((s) => s.data.info.remarks);
  const ref = useAutoGrow<HTMLTextAreaElement>(remarks);
  return (
    <section
      id="hr-remarks"
      data-toc-target=""
      className="rounded-lg border border-border bg-surface p-3"
    >
      <Field label={S.info.remarks}>
        <TextArea
          ref={ref}
          rows={2}
          value={remarks}
          maxLength={LIMITS.remarks}
          placeholder={S.info.remarksPlaceholder}
          onFocus={gesture.begin}
          onBlur={gesture.commit}
          onChange={(e) => setInfo('remarks', e.target.value)}
          className="resize-none overflow-hidden"
        />
      </Field>
    </section>
  );
}
