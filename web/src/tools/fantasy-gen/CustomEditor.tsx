/**
 * 自訂產生器的編輯：名稱、表的文字（原作 generator_template 的寫法，見 engine.ts）、即時的檢查（找不到的表、空的表、
 * 停不下來的表、缺少範本）、寫法的說明、刪除。打字的每一段（進到欄位到離開）是一步復原。
 */
import { Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { historyGesture } from '@/core/storage';
import {
  Button,
  Field,
  type IssueItem,
  IssueList,
  Section,
  TextArea,
  TextInput,
  useConfirm,
} from '@/ui';
import { removeCustom, updateCustom } from './actions';
import { checkTables, parseTables } from './engine';
import { type CustomGenerator, TEMPLATE_TABLES } from './generators';
import { TOOL_ID } from './logic';
import { useGen } from './store';
import { S } from './strings';

const typing = historyGesture(useGen);

/** 表的文字的問題（畫面上的清單） */
export function customIssues(text: string): {
  items: IssueItem[];
  tables: number;
  templates: number;
} {
  const { tables, issues } = parseTables(text);
  const templateName = TEMPLATE_TABLES.find((n) => Object.hasOwn(tables, n));
  const templates = templateName ? tables[templateName] : [];
  const rest = { ...tables };
  if (templateName) delete rest[templateName];
  const check = checkTables(
    rest,
    templates.map((t) => t.text),
  );
  const items: IssueItem[] = [
    ...(templateName ? [] : [{ level: 'error' as const, message: S.custom.noTemplate }]),
    ...issues.map((i) => ({ level: 'warning' as const, message: `第 ${i.line} 行：${i.message}` })),
    ...check.missing.map((m) => ({
      level: 'warning' as const,
      message: S.custom.missing(m.name, m.from),
    })),
    ...check.empty.map((n) => ({ level: 'warning' as const, message: S.custom.empty(n) })),
    ...check.cycles.map((n) => ({ level: 'error' as const, message: S.custom.cycle(n) })),
  ];
  return { items, tables: Object.keys(rest).length, templates: templates.length };
}

export function CustomEditor({ custom }: { custom: CustomGenerator }) {
  const confirm = useConfirm();
  const check = useMemo(() => customIssues(custom.text), [custom.text]);
  return (
    <Section title={S.custom.title} description={custom.name} fixed>
      <Field label={S.custom.name}>
        <TextInput
          value={custom.name}
          maxLength={60}
          onFocus={typing.begin}
          onBlur={typing.commit}
          onChange={(e) => updateCustom(custom.id, { name: e.target.value })}
        />
      </Field>
      <Field label={S.custom.text} hint={S.custom.textHint}>
        <TextArea
          rows={16}
          value={custom.text}
          spellCheck={false}
          className="font-mono text-sm"
          onFocus={typing.begin}
          onBlur={typing.commit}
          onChange={(e) => updateCustom(custom.id, { text: e.target.value.slice(0, 50_000) })}
        />
      </Field>
      <div data-testid="custom-check">
        <IssueList
          items={check.items}
          notice={
            check.items.some((i) => i.level === 'error')
              ? null
              : { tone: 'success', message: S.custom.ok(check.tables, check.templates) }
          }
        />
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-fg">{S.custom.syntaxTitle}</summary>
        <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          {S.custom.syntax.map(([code, what]) => (
            <div key={code} className="contents">
              <dt className="font-mono text-xs text-fg">{code}</dt>
              <dd className="m-0 text-muted">{what}</dd>
            </div>
          ))}
        </dl>
      </details>
      <div>
        <Button
          variant="danger"
          size="sm"
          icon={<Trash2 />}
          onClick={async () => {
            if (
              await confirm({
                title: S.custom.removeTitle(custom.name),
                description: S.custom.removeDescription,
                confirmLabel: S.custom.removeConfirm,
                danger: true,
              })
            )
              void removeCustom(custom.id);
          }}
        >
          {S.custom.remove}
        </Button>
      </div>
    </Section>
  );
}

export const CUSTOM_SECTION_KEY = `${TOOL_ID}:custom`;
