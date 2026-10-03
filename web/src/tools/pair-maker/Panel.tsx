/**
 * 設定欄：編輯對象分頁（左右角色／共用／各角色／選項與各頁＋貼紙）→ 分類按鈕 → 欄位與圖片格 → 對象的動作（刪除、左右移）。
 * 從畫布點元素時（useUi.open）切到那一項並捲到看得到的地方。
 */
import { ArrowLeft, ArrowRight, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ToolStore } from '@/core/storage';
import { Button, type CanvasPicker, Chips, IconButton, Tabs, useConfirm, useToast } from '@/ui';
import { FieldList } from './Fields';
import type { Draft, GroupDef, SideDef, TemplateDef } from './model';
import { SlotField } from './SlotField';
import { StickerPanel } from './StickerPanel';
import { STICKER_SIDE, silently, useUi } from './store';
import { S } from './strings';
import { addMember, MAX_MEMBERS, members, moveMember, removeMember } from './templates/roster';
import { addPage, MAX_PAGES, pageNo, pagesOf, removePage, variantOf } from './templates/textlog';

export interface PanelProps {
  def: TemplateDef;
  store: ToolStore<Draft>;
  d: Draft;
  picker: CanvasPicker;
  onRichBlur?: () => void;
}

/** 切換到某個編輯對象（文字記錄的頁：畫布也切到那一頁、單獨看） */
export function chooseSide(def: TemplateDef, store: ToolStore<Draft>, side: string) {
  useUi.getState().setSide(def.id, side);
  const n = def.kind === 'textlog' ? pageNo(side) : null;
  if (n !== null) {
    const d = store.getState().data;
    if (d.active !== n || d.view === 'all')
      silently(store, () => store.getState().patch({ active: n, view: 'single' }));
  }
}

/** 多人資料框：在最後新增一人並切到他（設定欄上方與畫布下方的新增鈕共用）；30 人時回傳 false */
export function addMemberTo(def: TemplateDef, store: ToolStore<Draft>): boolean {
  const r = addMember(store.getState().data);
  if (!r) return false;
  store.getState().replace(r.draft);
  useUi.getState().setSide(def.id, r.side);
  return true;
}

/** 文字記錄：在最後新增一頁並切過去（單獨看）；30 頁時回傳 false */
export function addPageTo(def: TemplateDef, store: ToolStore<Draft>): boolean {
  const variant = variantOf(def.id);
  const next = variant ? addPage(store.getState().data, variant) : null;
  if (!next) return false;
  store.getState().replace({ ...next, view: 'single' });
  useUi.getState().setSide(def.id, `p${next.active}`);
  return true;
}

/**
 * 已經捲過去的那一次點選（useUi 的 revealTick）。點到另一個對象時，新掛上的設定欄也要捲過去；
 * 開頁、換版型、手動切分頁時 revealTick 沒變，不捲。
 * 換對象的那一刻，舊對象的設定欄還會掛著一下（Radix 分頁的 Presence 下一輪才卸載），所以只讓目前的對象處理。
 */
let revealedTick = 0;

function SideContent({ side, def, store, d, picker, onRichBlur }: PanelProps & { side: SideDef }) {
  const groupKey = `${def.id}|${side.id}`;
  const chosen = useUi((s) => s.group[groupKey]);
  const tick = useUi((s) => s.revealTick);
  const group: GroupDef = side.groups.find((g) => g.id === chosen) ?? side.groups[0];
  const box = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();

  /* 從畫布點過來：捲到欄位（同一個對象換分類、或切到另一個對象剛掛上時都捲） */
  useEffect(() => {
    if (!tick || tick === revealedTick) return;
    if (useUi.getState().side[def.id] !== side.id) return;
    revealedTick = tick;
    box.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [tick, def.id, side.id]);

  if (!group) return null;
  const defaults = def.defaults(d);
  const env = { store, d, defaults, picker, onRichBlur };
  const before = (group.slots ?? []).filter((s) => !s.after);
  const after = (group.slots ?? []).filter((s) => s.after);
  const slotVisible = (s: (typeof before)[number]) => {
    if (!s.when) return true;
    const c = s.when;
    const v = d.v;
    if (typeof c === 'string') return v[c] === true;
    return 'is' in c ? v[c.id] === c.is : v[c.id] !== c.not;
  };

  /* 對象的動作 */
  const actions: React.ReactNode[] = [];
  if (def.kind === 'roster') {
    const list = members(d);
    const i = list.findIndex((n) => `m${n}` === side.id);
    actions.push(
      <Button
        key="del"
        size="sm"
        variant="danger"
        icon={<Trash2 />}
        disabled={list.length <= 1}
        onClick={async () => {
          if (
            !(await confirm({
              title: S.deleteMemberTitle,
              description: S.deleteMemberDesc,
              confirmLabel: S.deleteMember,
              danger: true,
            }))
          )
            return;
          const next = removeMember(store.getState().data, side.id);
          if (!next) return;
          store.getState().replace(next);
          useUi
            .getState()
            .setSide(def.id, `m${members(next)[Math.min(i, members(next).length - 1)]}`);
        }}
      >
        {S.deleteMember}
      </Button>,
      <IconButton
        key="left"
        size="sm"
        label={S.memberLeft}
        icon={<ArrowLeft />}
        disabled={i <= 0}
        onClick={() => {
          const next = moveMember(store.getState().data, side.id, -1);
          if (next) store.getState().replace(next);
        }}
      />,
      <IconButton
        key="right"
        size="sm"
        label={S.memberRight}
        icon={<ArrowRight />}
        disabled={i < 0 || i >= list.length - 1}
        onClick={() => {
          const next = moveMember(store.getState().data, side.id, 1);
          if (next) store.getState().replace(next);
        }}
      />,
    );
  }
  const n = def.kind === 'textlog' ? pageNo(side.id) : null;
  if (n !== null)
    actions.push(
      <Button
        key="del"
        size="sm"
        variant="danger"
        icon={<Trash2 />}
        disabled={pagesOf(d).length <= 1}
        onClick={async () => {
          if (
            !(await confirm({
              title: S.deletePageTitle,
              description: S.deletePageDesc,
              confirmLabel: S.deletePage,
              danger: true,
            }))
          )
            return;
          const next = removePage(store.getState().data, n);
          if (!next) return;
          store.getState().replace(next);
          useUi.getState().setSide(def.id, `p${next.active}`);
        }}
      >
        {S.deletePage}
      </Button>,
    );

  return (
    <div ref={box} className="flex min-w-0 flex-col gap-3 pt-3" data-side={side.id}>
      {side.groups.length > 1 ? (
        <Chips
          aria-label={S.groupsAria}
          size="md"
          value={group.id}
          items={side.groups.map((g) => ({ value: g.id, label: g.label }))}
          onPick={(g) => useUi.getState().setGroup(def.id, side.id, g)}
        />
      ) : null}
      <h3 className="m-0 text-base font-semibold text-fg" data-testid="panel-heading">
        {side.heading ?? side.label} {group.label}
      </h3>
      <div className="flex min-w-0 flex-col gap-3" data-group={group.id}>
        {before.filter(slotVisible).map((s) => (
          <SlotField key={s.id} slot={s} label={s.label ?? group.label} store={store} d={d} />
        ))}
        <FieldList fields={group.fields} env={env} />
        {after.filter(slotVisible).map((s) => (
          <SlotField key={s.id} slot={s} label={s.label ?? group.label} store={store} d={d} />
        ))}
      </div>
      {actions.length ? (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
          {actions}
        </div>
      ) : null}
    </div>
  );
}

export function Panel(props: PanelProps) {
  const { def, store, d } = props;
  const toast = useToast();
  const sides = def.sides(d);
  const current = useUi((s) => s.side[def.id]);
  const value =
    current === STICKER_SIDE || sides.some((s) => s.id === current) ? current : sides[0]?.id;

  const add =
    def.kind === 'roster'
      ? {
          label: S.addMember,
          disabled: members(d).length >= MAX_MEMBERS,
          run: () => {
            if (!addMemberTo(def, store)) toast({ title: S.memberLimit, tone: 'warning' });
          },
        }
      : def.kind === 'textlog'
        ? {
            label: S.addPage,
            disabled: pagesOf(d).length >= MAX_PAGES,
            run: () => {
              if (!addPageTo(def, store)) toast({ title: S.pageLimit, tone: 'warning' });
            },
          }
        : null;

  return (
    <div className="flex min-w-0 flex-col gap-2" data-testid="editor-panel">
      {add ? (
        <div className="flex justify-end">
          <Button size="sm" icon={<Plus />} disabled={add.disabled} onClick={add.run}>
            {add.label}
          </Button>
        </div>
      ) : null}
      <Tabs
        aria-label={S.sidesAria}
        className="min-w-0"
        value={value}
        onValueChange={(v) => chooseSide(def, store, v)}
        items={[
          ...sides.map((side) => ({
            value: side.id,
            label: side.label,
            content: <SideContent {...props} side={side} />,
          })),
          {
            value: STICKER_SIDE,
            label: S.stickers,
            content: (
              <div className="pt-3">
                <StickerPanel def={def} store={store} d={d} />
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}
