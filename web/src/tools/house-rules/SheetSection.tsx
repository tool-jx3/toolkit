/**
 * 一個區塊（6 版、7 版、各版通用）：區塊標題、欄名、各分類（可收合、數量、全部放進／拿掉、新增規則）。
 * 規格 F21～F24。
 */
import { ChevronDown, Eye, EyeOff, Plus } from 'lucide-react';
import { memo, useState } from 'react';
import { cn, IconButton } from '@/ui';
import { addCustom, setCollapsed, toggleCategory } from './actions';
import { bucketItems, type SectionState } from './model';
import { BuiltinRow, CustomRuleRow, ROW_GRID } from './RuleRow';
import { CATEGORY_NAMES, type CategoryId, SECTION_BY_ID, type SectionId } from './rules';
import { collapseKey, useRules, useView } from './store';
import { S } from './strings';

const Category = memo(function Category({
  secId,
  catId,
  bucket,
  collapsed,
}: {
  secId: SectionId;
  catId: CategoryId;
  bucket: SectionState;
  collapsed: boolean;
}) {
  const [added, setAdded] = useState<string | null>(null);
  const items = bucketItems(bucket, secId, catId);
  const shown = items.filter((i) => i.row.vis).length;
  const allOn = items.length > 0 && shown === items.length;
  const name = CATEGORY_NAMES[catId];
  const listId = `hr-cat-${secId}-${catId}-rows`;
  return (
    <div id={`hr-cat-${secId}-${catId}`} data-toc-target="" className="mt-1">
      <div className="flex items-center gap-2 border-b border-border py-1">
        <button
          type="button"
          aria-expanded={!collapsed}
          aria-controls={listId}
          title={S.sheet.collapse}
          onClick={() => setCollapsed(secId, catId, !collapsed)}
          className="-ml-1 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-sm font-bold text-accent hover:bg-accent-soft"
        >
          <ChevronDown
            aria-hidden
            className={cn('size-4 transition-transform', collapsed && '-rotate-90')}
          />
          {name}
        </button>
        <span className="ml-auto text-xs text-muted tabular-nums" data-testid="cat-count">
          {S.sheet.count(shown, items.length)}
        </span>
        {items.length ? (
          <IconButton
            label={allOn ? S.sheet.hideAll(name) : S.sheet.showAll(name)}
            icon={allOn ? <Eye className="text-accent" /> : <EyeOff className="text-muted" />}
            size="sm"
            onClick={() => toggleCategory(secId, catId)}
          />
        ) : null}
      </div>
      {collapsed ? null : (
        <div id={listId} className="flex flex-col">
          {items.map((it) =>
            it.kind === 'builtin' ? (
              <BuiltinRow key={it.rule.id} secId={secId} rule={it.rule} row={it.row} />
            ) : (
              <CustomRuleRow
                key={it.row.id}
                secId={secId}
                row={it.row}
                autoFocus={it.row.id === added}
              />
            ),
          )}
          <button
            type="button"
            aria-label={S.sheet.addAria(name, SECTION_BY_ID[secId].title)}
            onClick={() => setAdded(addCustom(secId, catId))}
            className="mt-1.5 inline-flex h-7 items-center gap-1.5 self-start rounded-md border border-dashed border-border-strong px-2.5 text-xs font-medium text-muted transition-colors hover:border-accent hover:text-accent focus-visible:focus-ring"
          >
            <Plus aria-hidden className="size-4" />
            {S.sheet.add}
          </button>
        </div>
      )}
    </div>
  );
});

export function SheetSection({ secId }: { secId: SectionId }) {
  const sec = SECTION_BY_ID[secId];
  const bucket = useRules((s) => s.data.secs[secId]);
  const collapsed = useView((v) => v.data.collapsed);
  const tone = secId === 'common';
  return (
    <section
      id={`hr-sec-${secId}`}
      aria-labelledby={`hr-sec-${secId}-title`}
      data-toc-target=""
      className="@container rounded-lg border border-border bg-surface px-3 pt-3 pb-2"
    >
      <h2
        id={`hr-sec-${secId}-title`}
        className={cn(
          'm-0 border-b-2 pb-2 text-lg font-bold text-fg',
          tone ? 'border-border-strong' : 'border-accent',
        )}
      >
        {sec.title}
      </h2>
      <div
        aria-hidden
        className={cn(ROW_GRID, 'hidden px-2 pt-1.5 text-xs font-semibold text-muted @lg:grid')}
      >
        <span className="[grid-area:name]">{S.sheet.cols.rule}</span>
        <span className="[grid-area:value]">{S.sheet.cols.value}</span>
        <span className="hidden [grid-area:note] @3xl:block">{S.sheet.cols.note}</span>
      </div>
      {sec.cats.map((catId) => (
        <Category
          key={catId}
          secId={secId}
          catId={catId}
          bucket={bucket}
          collapsed={!!collapsed[collapseKey(secId, catId)]}
        />
      ))}
    </section>
  );
}
