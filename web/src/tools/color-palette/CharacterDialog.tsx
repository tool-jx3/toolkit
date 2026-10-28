/**
 * 角色的編輯視窗（規格 1.1 F48～F51）：直接改清單裡的角色（每個變更可以復原，沒有「取消」）。
 * - 左邊：圓形頭像的滴管（選好一個格子後點一下或拖曳取色）、換立繪、調整頭像範圍、存成色碼表。
 * - 右邊：名字、身高、髮色與瞳色的格子（各最多 5 格、色系可以手動指定）、選中的格子的色碼與「無」、
 *   代表色、其他部位（部位、名稱或備註、顏色、「無」，最多 30 個）。
 * - 刪除角色（確認；可以復原）。
 */
import { Download, ImagePlus, Plus, Redo2, Scan, Trash2, Undo2, Wand2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useAssetImage } from '@/core/assets';
import { downloadBlob, pickFiles, safeFileName } from '@/core/files';
import { DEFAULT_PLACEMENT } from '@/core/image';
import { useUndoRedo } from '@/core/storage';
import {
  Button,
  ColorField,
  cn,
  Dialog,
  DialogClose,
  Field,
  FieldRow,
  IconButton,
  isEditableTarget,
  matchCombo,
  NumberInput,
  Select,
  TextInput,
  useConfirm,
  useToast,
} from '@/ui';
import { CirclePicker } from './CirclePicker';
import { autoFamily, familiesFor, type KeyRole, partGroups, roleColors } from './characters';
import { closeEditor, dominantOf, startJob, useFlow } from './flow';
import {
  type Bar,
  type FamilyKey,
  LIMITS,
  PART_ROLES,
  type PartRole,
  RANGE,
  type Segment,
} from './logic';
import { RoleSlots, swatchStyle } from './RoleSlots';
import { familyLabel, partLabel, renderChartPng } from './shelfRender';
import { actions, assets, gesture, useSettings } from './store';
import { S } from './strings';

type Target = { kind: 'seg'; id: string } | { kind: 'theme' } | null;

const displayName = (bar: Bar, index: number) => (bar.name ?? '').trim() || S.characterN(index + 1);

/**
 * 編輯視窗開著時的復原／重做（頁首的按鈕被對話框蓋住、工具的快捷鍵在對話框裡不作用）：
 * Ctrl／⌘＋Z 復原，Ctrl／⌘＋Shift＋Z、Ctrl＋Y 重做。焦點在文字欄時交給瀏覽器（復原打的字）。
 */
function useDialogHistoryKeys(host: HTMLElement | null, undo: () => void, redo: () => void): void {
  useEffect(() => {
    if (!host) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const t = e.target as Element | null;
      /* 只處理這個視窗裡（或焦點不在任何元素上）的按鍵；確認刪除之類疊在上面的對話框不算 */
      const dialog = host.closest('[role="dialog"]');
      if (!(t === document.body || (dialog && t && dialog.contains(t)))) return;
      if (isEditableTarget(t)) return;
      if (matchCombo(e, 'mod+z')) {
        e.preventDefault();
        undo();
      } else if (matchCombo(e, 'shift+mod+z') || matchCombo(e, 'mod+y')) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [host, undo, redo]);
}

export function CharacterDialog() {
  const id = useFlow((s) => s.editing);
  const bars = useSettings((s) => s.data.bars);
  const index = bars.findIndex((b) => b.id === id);
  const bar = index >= 0 ? bars[index] : null;
  const { bitmap } = useAssetImage(assets, bar?.image?.id ?? null);
  const [target, setTarget] = useState<Target>(null);
  const toast = useToast();
  const confirm = useConfirm();
  const history = useUndoRedo(useSettings);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  useDialogHistoryKeys(host, history.undo, history.redo);

  /* 角色不見了（刪除、復原）：關掉 */
  useEffect(() => {
    if (id && !bar) closeEditor();
  }, [id, bar]);
  /* 打開另一位角色：選第一個髮色（沒有時不選） */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在換角色時
  useEffect(() => {
    const first = bar?.segments.find((s) => s.role === 'hair') ?? bar?.segments[0];
    setTarget(first ? { kind: 'seg', id: first.id } : null);
  }, [id]);

  const groups = useMemo(() => partGroups(bar?.segments ?? []), [bar]);
  if (!bar) return null;
  const name = displayName(bar, index);
  const seg = target?.kind === 'seg' ? bar.segments.find((s) => s.id === target.id) : undefined;
  const targetLabel =
    target?.kind === 'theme'
      ? S.themeColor
      : seg
        ? seg.role === 'hair' || seg.role === 'eye'
          ? S.slotLabel(S.roles[seg.role], groups[seg.role].indexOf(seg) + 1)
          : partLabel(bar, seg)
        : null;

  const setTargetColor = (hex: string) => {
    if (target?.kind === 'theme') actions.patchCharacter(bar.id, { theme: hex });
    else if (seg) actions.updateSegment(bar.id, seg.id, { color: hex, none: false });
  };

  const roleRow = (role: KeyRole) => {
    const list = groups[role];
    const auto = autoFamily(roleColors(bar, role), role);
    const manual = role === 'hair' ? bar.hairFamily : bar.eyeFamily;
    return (
      <div className="flex flex-col gap-1.5" key={role}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-fg">{S.roles[role]}</span>
          <span className="text-xs text-muted">{S.multiHint[role]}</span>
          <Select<string>
            aria-label={`${S.roles[role]}${S.familyField}`}
            size="sm"
            className="ml-auto w-36"
            disabled={!list.length}
            value={manual ?? 'auto'}
            onValueChange={(v) =>
              actions.patchCharacter(bar.id, {
                [role === 'hair' ? 'hairFamily' : 'eyeFamily']:
                  v === 'auto' ? null : (v as FamilyKey),
              })
            }
            options={[
              { value: 'auto', label: S.familyAuto(familyLabel(auto, role)) },
              ...familiesFor(role).map((f) => ({ value: f, label: familyLabel(f, role) })),
            ]}
          />
        </div>
        <RoleSlots
          label={S.roles[role]}
          slots={list.map((s) => ({ color: s.color, none: !!s.none }))}
          active={seg && seg.role === role ? list.indexOf(seg) : null}
          onSelect={(i) => setTarget({ kind: 'seg', id: list[i].id })}
          onAdd={() => {
            const last = list[list.length - 1];
            actions.addPart(
              bar.id,
              role,
              last?.color ??
                (bitmap && bar.image
                  ? dominantOf(bitmap, bar.image, bar.avatar ?? DEFAULT_PLACEMENT)
                  : '#888888'),
            );
            /* 新的那一格當作選中的格子 */
            queueMicrotask(() => {
              const now = useSettings.getState().data.bars.find((b) => b.id === bar.id);
              const added = now?.segments.filter((s) => s.role === role).at(-1);
              if (added) setTarget({ kind: 'seg', id: added.id });
            });
          }}
          onRemove={(i) => {
            const s = list[i];
            if (target?.kind === 'seg' && target.id === s.id) setTarget(null);
            actions.removeSegment(bar.id, s.id);
          }}
          removeLast
          max={LIMITS.roleColors}
          testId={`edit-slots-${role}`}
        />
      </div>
    );
  };

  const otherRow = (s: Segment, k: number) => {
    const label = partLabel(bar, s);
    const on = target?.kind === 'seg' && target.id === s.id;
    return (
      <li
        key={s.id}
        className={cn(
          'flex min-w-0 flex-wrap items-center gap-1.5 rounded-md border p-1.5',
          on ? 'border-accent bg-accent-soft' : 'border-border',
        )}
        data-part={k}
      >
        <button
          type="button"
          aria-label={`${label}：${s.none ? S.noneLabel : s.color.toUpperCase()}`}
          aria-pressed={on}
          onClick={() => setTarget({ kind: 'seg', id: s.id })}
          className="size-7 shrink-0 rounded-sm border border-border-strong outline-none focus-visible:ring-2 focus-visible:ring-focus"
          style={swatchStyle({ color: s.color, none: !!s.none })}
        />
        <Select<string>
          aria-label={`${label}${S.otherRole}`}
          size="sm"
          className="w-24 shrink-0"
          value={s.role ?? 'unset'}
          onValueChange={(v) =>
            actions.updateSegment(bar.id, s.id, { role: v === 'unset' ? null : (v as PartRole) })
          }
          options={[
            ...PART_ROLES.map((r) => {
              /* 髮色、瞳色各最多 5 格：滿了就不能再把別的部位改成它 */
              const full =
                (r === 'hair' || r === 'eye') &&
                s.role !== r &&
                groups[r].length >= LIMITS.roleColors;
              return {
                value: r,
                label: S.roles[r],
                disabled: full,
                description: full ? S.roleFull(S.roles[r], LIMITS.roleColors) : undefined,
              };
            }),
            { value: 'unset', label: S.slotUnset },
          ]}
        />
        <TextInput
          aria-label={`${label}${S.otherMemo}`}
          value={s.memo ?? ''}
          maxLength={LIMITS.memo}
          placeholder={S.otherMemoPlaceholder}
          className="h-7 min-w-24 flex-1 text-xs"
          onFocus={() => {
            gesture.begin();
            setTarget({ kind: 'seg', id: s.id });
          }}
          onBlur={gesture.commit}
          onChange={(e) => actions.updateSegment(bar.id, s.id, { memo: e.target.value })}
        />
        <IconButton
          label={S.removePart(label)}
          icon={<X />}
          size="sm"
          onClick={() => actions.removeSegment(bar.id, s.id)}
        />
      </li>
    );
  };

  const saveChart = async () => {
    try {
      const out = await renderChartPng(bar, bitmap);
      const file = `${safeFileName(S.chartFile((bar.name ?? '').trim() || S.unnamed), { fallback: S.chartLabel })}.png`;
      downloadBlob(out.blob, file);
      toast({ title: S.savedFile(file, out.width, out.height), tone: 'success' });
    } catch {
      toast({ title: S.saveFailedImage, tone: 'danger' });
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) closeEditor();
      }}
      title={S.editTitle(name)}
      description={S.editHint}
      size="lg"
      footer={
        <>
          <Button
            variant="danger"
            icon={<Trash2 />}
            className="mr-auto"
            onClick={async () => {
              const ok = await confirm({
                title: S.deleteTitle(name),
                description: S.deleteDesc,
                confirmLabel: S.deleteCharacter,
                danger: true,
              });
              if (!ok) return;
              closeEditor();
              actions.removeBar(bar.id);
              toast({ title: S.deleted(name), tone: 'success' });
            }}
          >
            {S.deleteCharacter}
          </Button>
          <IconButton
            label={S.undo}
            icon={<Undo2 />}
            onClick={history.undo}
            disabled={!history.canUndo}
          />
          <IconButton
            label={S.redo}
            icon={<Redo2 />}
            onClick={history.redo}
            disabled={!history.canRedo}
          />
          <DialogClose variant="primary">{S.editDone}</DialogClose>
        </>
      }
    >
      <div
        ref={setHost}
        className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start"
        data-testid="character-editor"
      >
        <div className="flex shrink-0 flex-col items-center gap-2 sm:w-56">
          <CirclePicker
            bitmap={bar.image ? bitmap : null}
            size={bar.image ?? null}
            placement={bar.avatar ?? DEFAULT_PLACEMENT}
            diameter={200}
            canPick={!!targetLabel}
            onNoTarget={() => toast({ title: S.pickNoTarget, tone: 'info', replace: true })}
            onPickStart={gesture.begin}
            onPick={setTargetColor}
            onPickEnd={gesture.commit}
            label={S.pickCircle}
            empty={S.noImageYet}
          />
          <p className="m-0 text-center text-xs text-muted" data-testid="edit-target">
            {targetLabel && bar.image
              ? S.pickTarget(targetLabel)
              : !bar.image
                ? ''
                : S.pickNoTarget}
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            <Button
              size="sm"
              icon={<ImagePlus />}
              onClick={async () => {
                const [f] = await pickFiles({ accept: 'image/*' });
                if (f) startJob({ kind: 'image', barId: bar.id, file: f });
              }}
            >
              {bar.image ? S.changeImage : S.chooseImage}
            </Button>
            <Button
              size="sm"
              icon={<Scan />}
              disabled={!bar.image}
              onClick={() => startJob({ kind: 'avatar', barId: bar.id })}
            >
              {S.editAvatar}
            </Button>
            <Button size="sm" icon={<Download />} onClick={() => void saveChart()}>
              {S.saveChart}
            </Button>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <FieldRow>
            <Field label={S.nameLabel}>
              <TextInput
                value={bar.name ?? ''}
                maxLength={LIMITS.name}
                placeholder={S.namePlaceholder}
                autoComplete="off"
                onFocus={gesture.begin}
                onBlur={gesture.commit}
                onChange={(e) => actions.patchCharacter(bar.id, { name: e.target.value })}
              />
            </Field>
            <Field label={S.editHeight}>
              <NumberInput
                value={bar.scale}
                onChange={() => {}}
                onCommit={(v) => actions.setBarScale(bar.id, v)}
                min={RANGE.barScale.min}
                step={0.1}
                precision={2}
              />
            </Field>
          </FieldRow>
          {roleRow('hair')}
          {roleRow('eye')}
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface-2 p-2">
            <span className="text-xs text-muted">{targetLabel ?? S.pickNoTarget}</span>
            <ColorField
              aria-label={targetLabel ?? S.hexLabel}
              value={
                target?.kind === 'theme'
                  ? (bar.theme ?? '#888888')
                  : seg && !seg.none
                    ? seg.color
                    : '#888888'
              }
              onChange={setTargetColor}
              disabled={!targetLabel}
              className="min-w-0 flex-1"
            />
            <Button
              size="sm"
              icon={<Wand2 />}
              title={S.autoPickHint}
              disabled={!targetLabel || !bitmap || !bar.image}
              onClick={() => {
                if (bitmap && bar.image)
                  setTargetColor(dominantOf(bitmap, bar.image, bar.avatar ?? DEFAULT_PLACEMENT));
              }}
            >
              {S.autoPick}
            </Button>
            <Button
              size="sm"
              title={S.noneHint}
              aria-pressed={!!seg?.none}
              disabled={!seg}
              onClick={() => seg && actions.updateSegment(bar.id, seg.id, { none: !seg.none })}
            >
              {S.markNone}
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-fg">{S.themeColor}</span>
            <button
              type="button"
              aria-label={`${S.themeColor}：${bar.theme ? bar.theme.toUpperCase() : S.themeNone}`}
              aria-pressed={target?.kind === 'theme'}
              onClick={() => setTarget({ kind: 'theme' })}
              className={cn(
                'flex size-9 items-center justify-center rounded-md border text-xs text-muted outline-none focus-visible:ring-2 focus-visible:ring-focus',
                target?.kind === 'theme'
                  ? 'border-accent ring-2 ring-accent'
                  : 'border-border-strong',
                !bar.theme && 'bg-surface-3',
              )}
              style={bar.theme ? { background: bar.theme } : undefined}
              data-testid="edit-theme"
            >
              {bar.theme ? null : '—'}
            </button>
            {bar.theme ? (
              <Button
                size="sm"
                icon={<X />}
                onClick={() => actions.patchCharacter(bar.id, { theme: null })}
              >
                {S.themeClear}
              </Button>
            ) : (
              <span className="text-xs text-muted">{S.themeNone}</span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-fg">{S.otherParts}</span>
              <Button
                size="sm"
                icon={<Plus />}
                className="ml-auto"
                disabled={groups.other.length >= LIMITS.otherParts}
                onClick={() => {
                  actions.addPart(bar.id, 'other', '#888888');
                  queueMicrotask(() => {
                    const now = useSettings.getState().data.bars.find((b) => b.id === bar.id);
                    const added = now?.segments.at(-1);
                    if (added) setTarget({ kind: 'seg', id: added.id });
                  });
                }}
              >
                {S.addOther}
              </Button>
            </div>
            {groups.other.length ? (
              <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label={S.otherParts}>
                {groups.other.map(otherRow)}
              </ul>
            ) : null}
          </div>
        </div>
      </div>
    </Dialog>
  );
}
