/**
 * 關係圖的設定：標題與顯示名字、線的種類（選目前用的、改名稱／顏色／樣式、新增、刪除、排序）、
 * 連線清單（換種類、反轉箭頭、刪除）、隨機連線、刪除所有連線。
 */
import { ArrowLeftRight, Dices, GripVertical, Plus, Trash2 } from 'lucide-react';
import {
  Button,
  ColorField,
  Field,
  GestureScope,
  IconButton,
  Section,
  Segmented,
  Select,
  SortableList,
  TextInput,
  Toggle,
  useConfirm,
  useToast,
} from '@/ui';
import { type Legend, LIMITS, LINE_STYLES, type LineStyle, mapMembers, PALETTE } from './model';
import { releaseFocus } from './QuadLayer';
import {
  activeLegendOf,
  addLegend,
  clearLinks,
  gesture,
  moveLegend,
  patchLegend,
  randomConnect,
  removeLegend,
  removeLink,
  reverseLink,
  setActiveLegend,
  setLinkLegend,
  setRelationTitle,
  setShowNames,
  useChart,
  usePrefs,
} from './store';
import { S } from './strings';

/** 線的樣子（清單、選單用的小圖） */
export function LineSample({ color, style }: { color: string; style: LineStyle }) {
  return (
    <svg aria-hidden width="32" height="12" viewBox="0 0 32 12" className="shrink-0">
      <line
        x1="1"
        y1="6"
        x2={style === 'arrow' ? 24 : 31}
        y2="6"
        stroke={color}
        strokeWidth="2.5"
        strokeDasharray={style === 'dash' ? '4 3' : undefined}
      />
      {style === 'arrow' ? <path d="M31 6 L23 1.5 L23 10.5 Z" fill={color} /> : null}
    </svg>
  );
}

export function RelationSection() {
  const title = useChart((s) => s.data.relation.title);
  const showNames = useChart((s) => s.data.relation.showNames);
  return (
    <Section title={S.sectionRelation}>
      <Field label={S.relationTitle} hint={S.relationTitleHint}>
        <TextInput
          value={title}
          onFocus={gesture.begin}
          onBlur={gesture.commit}
          onChange={(e) => setRelationTitle(e.target.value)}
        />
      </Field>
      <Field label={S.showNames} layout="inline">
        <Toggle checked={showNames} onCheckedChange={setShowNames} />
      </Field>
    </Section>
  );
}

export function LegendsSection() {
  const toast = useToast();
  const legends = useChart((s) => s.data.relation.legends);
  const links = useChart((s) => s.data.relation.links);
  const activeId = usePrefs((s) => s.data.legend);
  const active = activeLegendOf(legends, activeId);
  const counts = new Map<string, number>();
  for (const l of links) counts.set(l.legend, (counts.get(l.legend) ?? 0) + 1);
  const set = (patch: Partial<Omit<Legend, 'id'>>) => active && patchLegend(active.id, patch);
  return (
    <Section title={S.sectionLegends}>
      <p className="m-0 text-xs text-muted">{S.legendsHint}</p>
      <SortableList
        aria-label={S.legendsLabel}
        items={legends}
        getId={(l) => l.id}
        selectedId={active?.id ?? null}
        onSelect={setActiveLegend}
        onMove={moveLegend}
        onMoveStart={gesture.begin}
        onMoveEnd={gesture.commit}
        handleOnly
        renderItem={(l) => {
          const name = l.label || S.noLabel;
          return (
            <div
              className="flex min-h-10 min-w-0 items-center gap-2 px-2 py-1"
              data-legend-row={l.id}
            >
              <span
                data-drag-handle
                aria-hidden
                className="-ml-1 flex shrink-0 cursor-grab touch-none text-muted [&_svg]:size-4"
                onPointerDown={releaseFocus}
              >
                <GripVertical />
              </span>
              <LineSample color={l.color} style={l.style} />
              <span
                className={
                  l.label
                    ? 'min-w-0 flex-1 truncate text-sm'
                    : 'min-w-0 flex-1 truncate text-sm text-muted'
                }
              >
                {name}
              </span>
              <span className="shrink-0 text-xs text-muted tabular-nums">
                {S.legendInUse(counts.get(l.id) ?? 0)}
              </span>
              <IconButton
                size="sm"
                variant="ghost"
                label={`${S.removeLegend}：${name}`}
                icon={<Trash2 />}
                disabled={legends.length <= 1}
                onClick={() => {
                  if (!removeLegend(l.id)) toast({ title: S.lastLegend, tone: 'warning' });
                }}
              />
            </div>
          );
        }}
      />
      {active ? (
        <fieldset
          className="m-0 flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-surface-2 p-3"
          data-testid="legend-editor"
          data-legend={active.id}
        >
          <legend className="px-1 text-xs font-medium text-muted">{S.activeLegend}</legend>
          <Field label={S.legendName}>
            <TextInput
              value={active.label}
              onFocus={gesture.begin}
              onBlur={gesture.commit}
              onChange={(e) => set({ label: e.target.value })}
            />
          </Field>
          <Field label={S.legendColor}>
            <GestureScope gesture={gesture}>
              <ColorField
                value={active.color}
                swatches={PALETTE}
                onChange={(v) => set({ color: v.slice(0, 7).toLowerCase() })}
              />
            </GestureScope>
          </Field>
          <Field label={S.legendStyle} hint={S.styleHint}>
            <Segmented<LineStyle>
              value={active.style}
              onValueChange={(v) => set({ style: v })}
              fullWidth
              options={LINE_STYLES.map((st) => ({ value: st, label: S.styles[st] }))}
            />
          </Field>
        </fieldset>
      ) : null}
      <div>
        <Button
          icon={<Plus />}
          disabled={legends.length >= LIMITS.legends}
          onClick={() => {
            if (!addLegend()) toast({ title: S.legendLimit(LIMITS.legends), tone: 'warning' });
          }}
        >
          {S.addLegend}
        </Button>
      </div>
    </Section>
  );
}

export function LinksSection() {
  const toast = useToast();
  const confirm = useConfirm();
  const d = useChart((s) => s.data);
  const { links, legends } = d.relation;
  const names = new Map(d.characters.map((c) => [c.id, c.name || S.noName]));
  const legendOptions = legends.map((l) => ({ value: l.id, label: l.label || S.noLabel }));
  const members = mapMembers(d.characters).length;
  return (
    <Section title={S.sectionLinks}>
      {links.length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={S.linksLabel}>
          {links.map((l, i) => {
            const legend = legends.find((x) => x.id === l.legend);
            const arrow = legend?.style === 'arrow';
            const name = S.linkName(names.get(l.from) ?? '', names.get(l.to) ?? '', arrow);
            return (
              <li
                key={`${l.from}-${l.to}`}
                className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border border-border bg-surface px-2 py-1.5"
                data-link={`${l.from}-${l.to}`}
              >
                {legend ? <LineSample color={legend.color} style={legend.style} /> : null}
                <span className="min-w-0 flex-1 basis-28 truncate text-sm" title={name}>
                  {name}
                </span>
                <span className="flex shrink-0 items-center gap-1">
                  <Select
                    size="sm"
                    className="w-28"
                    aria-label={`${S.linkLegend}：${name}`}
                    value={l.legend}
                    options={legendOptions}
                    onValueChange={(v) => setLinkLegend(i, v)}
                  />
                  {arrow ? (
                    <IconButton
                      size="sm"
                      variant="ghost"
                      label={`${S.reverse}：${name}`}
                      icon={<ArrowLeftRight />}
                      onClick={() => reverseLink(i)}
                    />
                  ) : null}
                  <IconButton
                    size="sm"
                    variant="ghost"
                    label={`${S.removeLink}：${name}`}
                    icon={<Trash2 />}
                    onClick={() => removeLink(i)}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted">
          {S.linksEmpty}
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          icon={<Dices />}
          onClick={() => {
            const n = randomConnect();
            toast(
              n < 0
                ? { title: S.randomNeedTwo, tone: 'warning', replace: true }
                : { title: S.randomDone(n), tone: n ? 'success' : 'info', replace: true },
            );
          }}
          disabled={members < 2}
        >
          {S.randomLinks}
        </Button>
        <Button
          variant="ghost"
          icon={<Trash2 />}
          disabled={!links.length}
          onClick={async () => {
            const ok = await confirm({
              title: S.clearLinksTitle,
              description: S.clearLinksDesc,
              confirmLabel: S.clearLinksConfirm,
              danger: true,
            });
            if (ok) clearLinks();
          }}
        >
          {S.clearLinks}
        </Button>
      </div>
      <p className="m-0 text-xs text-muted">{members < 2 ? S.randomNeedTwo : S.randomHint}</p>
    </Section>
  );
}
