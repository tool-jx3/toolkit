/**
 * 動作列（F057、D13）：選取框上方（放不下時在下方）的按鈕列，不超出畫布。
 * 群組／解散群組、複製、顯示／隱藏、鎖定、移到最上層、移到最下層、刪除；可以布林運算時多一列。
 */
import {
  BringToFront,
  Copy,
  Eye,
  EyeOff,
  Group,
  Lock,
  LockOpen,
  SendToBack,
  SquaresExclude,
  SquaresIntersect,
  SquaresSubtract,
  SquaresUnite,
  Trash2,
  Ungroup,
} from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { IconButton } from '@/ui';
import { act } from '../actions';
import { BOOL_OPS, type BoolOp } from '../boolLogic';
import { booleanSelected } from '../engine/ops';
import { getEngine } from '../runtime';
import { useEditor } from '../stores';
import { S } from '../strings';

const BOOL_ICONS: Record<BoolOp, typeof SquaresUnite> = {
  union: SquaresUnite,
  intersection: SquaresIntersect,
  difference: SquaresSubtract,
  xor: SquaresExclude,
};

const GAP = 8;

export function ActionBar() {
  const sel = useEditor((s) => s.selection);
  const tool = useEditor((s) => s.tool);
  const exportMode = useEditor((s) => s.exportMode);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const show = !!sel?.box && tool === 'select' && exportMode === 'off';
  const box = sel?.box ?? null;

  useLayoutEffect(() => {
    const el = ref.current;
    const parent = el?.parentElement;
    if (!show || !el || !parent || !box) {
      setPos(null);
      return;
    }
    const W = parent.clientWidth;
    const H = parent.clientHeight;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let top = box.y - h - GAP;
    if (top < 4) top = box.y + box.h + GAP;
    top = Math.min(Math.max(4, top), Math.max(4, H - h - 4));
    let left = box.x + box.w / 2 - w / 2;
    left = Math.min(Math.max(4, left), Math.max(4, W - w - 4));
    setPos({ left, top });
  }, [show, box]);

  if (!show || !sel) return null;
  const eng = getEngine();
  return (
    <div
      ref={ref}
      className="absolute z-10 flex flex-col gap-1"
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: 'hidden' }}
      data-testid="action-bar"
    >
      <div
        role="toolbar"
        aria-label={S.actions.bar}
        className="flex gap-0.5 rounded-md border border-border bg-surface p-0.5 shadow-2"
      >
        {sel.canGroup ? (
          <IconButton
            size="sm"
            icon={<Group />}
            label={S.actions.group}
            onClick={act.group}
            data-action="group"
          />
        ) : sel.isGroup ? (
          <IconButton
            size="sm"
            icon={<Ungroup />}
            label={S.actions.ungroup}
            onClick={act.ungroup}
            data-action="ungroup"
          />
        ) : null}
        <IconButton
          size="sm"
          icon={<Copy />}
          label={S.actions.duplicate}
          onClick={act.duplicate}
          data-action="duplicate"
        />
        <IconButton
          size="sm"
          icon={sel.visible ? <Eye /> : <EyeOff />}
          label={sel.visible ? S.actions.hide : S.actions.show}
          onClick={act.visibility}
          data-action="visibility"
        />
        <IconButton
          size="sm"
          icon={sel.locked ? <Lock /> : <LockOpen />}
          label={sel.locked ? S.actions.unlock : S.actions.lock}
          pressed={sel.locked}
          onClick={act.lock}
          data-action="lock"
        />
        <IconButton
          size="sm"
          icon={<BringToFront />}
          label={S.actions.front}
          onClick={act.front}
          data-action="front"
        />
        <IconButton
          size="sm"
          icon={<SendToBack />}
          label={S.actions.back}
          onClick={act.back}
          data-action="back"
        />
        <IconButton
          size="sm"
          icon={<Trash2 />}
          label={S.actions.delete}
          onClick={act.delete}
          data-action="delete"
        />
      </div>
      {sel.canBoolean ? (
        <div
          role="toolbar"
          aria-label={S.actions.boolBar}
          className="flex w-fit gap-0.5 self-center rounded-md border border-border bg-surface p-0.5 shadow-2"
        >
          {BOOL_OPS.map((op) => {
            const Icon = BOOL_ICONS[op];
            return (
              <IconButton
                key={op}
                size="sm"
                icon={<Icon />}
                label={S.boolHints[op]}
                onClick={() => eng && booleanSelected(eng, op)}
                data-action={`bool-${op}`}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
