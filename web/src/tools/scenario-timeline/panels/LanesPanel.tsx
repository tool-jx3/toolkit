/**
 * 「泳道」分頁（規格 1.3）：泳道清單（拖曳排序、顏色、名稱、種類、上層、GM 專用、刪除）與分類清單。
 */
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { useRef } from 'react';
import { historyGesture } from '@/core/storage';
import {
  Button,
  ColorField,
  IconButton,
  Section,
  Select,
  SortableList,
  TextInput,
  useChoice,
} from '@/ui';
import {
  type Category,
  LANE_KINDS,
  type Lane,
  type LaneKind,
  LIMITS,
  PALETTE,
} from '../model/types';
import {
  addCategory,
  addLane,
  deleteCategory,
  deleteLane,
  displayOrder,
  moveLane,
  setLaneParent,
  updateCategory,
  updateLane,
  useDoc,
  usePrefs,
} from '../store';
import { S } from '../strings';
import { PlLock } from './EventPanel';

const g = historyGesture(useDoc);
const TOP = '__top';

export function LanesPanel() {
  const lanes = useDoc((s) => s.data.lanes);
  const categories = useDoc((s) => s.data.categories);
  const events = useDoc((s) => s.data.events);
  const pl = usePrefs((s) => s.data.viewMode) === 'pl';
  const choose = useChoice();
  const list = displayOrder(lanes);
  const focusNew = useRef<string | null>(null);

  const onDelete = async (lane: Lane) => {
    const n = events.filter((e) => e.laneId === lane.id).length;
    const name = lane.name.trim() || S.untitled;
    if (!n) {
      deleteLane(lane.id, false);
      return;
    }
    const how = await choose({
      title: S.laneDeleteTitle(name),
      description: S.laneDeleteDesc(n),
      choices: [
        { value: 'move', label: S.laneMoveEvents },
        { value: 'delete', label: S.laneDeleteEvents, variant: 'danger' },
      ],
    });
    if (how) deleteLane(lane.id, how === 'delete');
  };

  return (
    <div className="flex flex-col gap-3" data-testid="lanes-panel">
      {pl ? <PlLock /> : null}
      <Section
        title={S.lanesTitle}
        fixed
        description={S.lanesHint}
        actions={
          <Button
            size="sm"
            icon={<Plus />}
            disabled={pl || lanes.length >= LIMITS.lanes}
            aria-label={S.addLaneLabel}
            data-testid="add-lane"
            onClick={() => {
              const id = addLane();
              if (id) {
                focusNew.current = id;
                requestAnimationFrame(() => {
                  document.querySelector<HTMLInputElement>(`[data-lane-name="${id}"]`)?.focus();
                });
              }
            }}
          >
            {S.addLane}
          </Button>
        }
      >
        <SortableList<Lane>
          aria-label={S.lanesTitle}
          items={list}
          getId={(l) => l.id}
          mode="drop"
          handleOnly
          sortDisabled={pl}
          onMove={(from, to) => moveLane(from, to)}
          empty={S.lanesEmpty}
          itemClassName={(l) => (l.parentId ? 'ml-5' : undefined)}
          renderItem={(lane) => (
            <LaneRow lane={lane} lanes={lanes} pl={pl} onDelete={() => void onDelete(lane)} />
          )}
        />
        {lanes.length >= LIMITS.lanes ? (
          <p className="m-0 text-xs text-warning">{S.lanesFull(LIMITS.lanes)}</p>
        ) : null}
      </Section>
      <Section
        title={S.catsTitle}
        fixed
        description={S.catsHint}
        actions={
          <Button
            size="sm"
            icon={<Plus />}
            disabled={pl || categories.length >= LIMITS.categories}
            aria-label={S.addCategoryLabel}
            data-testid="add-category"
            onClick={() => {
              const id = addCategory();
              if (id)
                requestAnimationFrame(() =>
                  document.querySelector<HTMLInputElement>(`[data-cat-name="${id}"]`)?.focus(),
                );
            }}
          >
            {S.addCategory}
          </Button>
        }
      >
        {categories.length ? (
          <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label={S.catsTitle}>
            {categories.map((c) => (
              <CategoryRow key={c.id} c={c} pl={pl} />
            ))}
          </ul>
        ) : (
          <p className="m-0 text-sm text-muted">{S.catsEmpty}</p>
        )}
      </Section>
    </div>
  );
}

function LaneRow({
  lane,
  lanes,
  pl,
  onDelete,
}: {
  lane: Lane;
  lanes: readonly Lane[];
  pl: boolean;
  onDelete: () => void;
}) {
  const name = lane.name.trim() || S.untitled;
  const hasKids = lanes.some((l) => l.parentId === lane.id);
  const parents = lanes.filter((l) => !l.parentId && l.id !== lane.id);
  return (
    <div className="flex w-full min-w-0 flex-col gap-1.5 py-1" data-lane-item={lane.id}>
      <div className="flex min-w-0 items-center gap-1.5">
        <span
          data-drag-handle
          aria-hidden
          className="flex size-6 shrink-0 cursor-grab touch-none items-center justify-center text-muted"
          title={S.laneDrag}
        >
          <GripVertical className="size-4" />
        </span>
        <ColorField
          value={lane.color}
          showInput={false}
          swatches={PALETTE}
          disabled={pl}
          aria-label={`${S.laneColor}：${name}`}
          onChange={(c) =>
            updateLane(lane.id, (l) => {
              l.color = c.slice(0, 7).toLowerCase();
            })
          }
        />
        <TextInput
          value={lane.name}
          aria-label={S.laneNameLabel}
          data-lane-name={lane.id}
          maxLength={LIMITS.name}
          disabled={pl}
          className="min-w-0 flex-1"
          onFocus={g.begin}
          onBlur={g.commit}
          onChange={(e) =>
            updateLane(
              lane.id,
              (l) => {
                l.name = e.target.value;
              },
              false,
            )
          }
        />
        <IconButton
          size="sm"
          variant="ghost"
          label={S.laneDelete(name)}
          icon={<Trash2 />}
          disabled={pl}
          onClick={onDelete}
        />
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 pl-7">
        <Select<LaneKind>
          size="sm"
          aria-label={`${S.laneKind}：${name}`}
          value={lane.kind}
          disabled={pl}
          className="w-24"
          onValueChange={(v) =>
            updateLane(lane.id, (l) => {
              l.kind = v;
            })
          }
          options={LANE_KINDS.map((k) => ({ value: k, label: S.laneKinds[k] }))}
        />
        <Select
          size="sm"
          aria-label={`${S.laneParent}：${name}`}
          value={lane.parentId || TOP}
          disabled={pl || hasKids}
          className="min-w-0 flex-1"
          onValueChange={(v) => setLaneParent(lane.id, v === TOP ? '' : v)}
          options={[
            { value: TOP, label: S.laneTop },
            ...parents.map((p) => ({
              value: p.id,
              label: `${S.laneParent.replace('…', `「${p.name.trim() || S.untitled}」`)}`,
            })),
          ]}
        />
        <IconButton
          size="sm"
          variant="secondary"
          label={`${S.laneGmToggle}：${name}`}
          icon={<span className="text-[11px] font-bold">GM</span>}
          pressed={lane.gm}
          disabled={pl}
          data-lane-gm={lane.id}
          onClick={() =>
            updateLane(lane.id, (l) => {
              l.gm = !l.gm;
            })
          }
        />
      </div>
    </div>
  );
}

function CategoryRow({ c, pl }: { c: Category; pl: boolean }) {
  const name = c.name.trim() || S.untitled;
  return (
    <li className="flex min-w-0 items-center gap-1.5" data-cat-item={c.id}>
      <ColorField
        value={c.color}
        showInput={false}
        swatches={PALETTE}
        disabled={pl}
        aria-label={`${S.catColor}：${name}`}
        onChange={(v) =>
          updateCategory(c.id, (x) => {
            x.color = v.slice(0, 7).toLowerCase();
          })
        }
      />
      <TextInput
        value={c.name}
        aria-label={S.catNameLabel}
        data-cat-name={c.id}
        maxLength={LIMITS.name}
        disabled={pl}
        className="min-w-0 flex-1"
        onFocus={g.begin}
        onBlur={g.commit}
        onChange={(e) =>
          updateCategory(
            c.id,
            (x) => {
              x.name = e.target.value;
            },
            false,
          )
        }
      />
      <IconButton
        size="sm"
        variant="ghost"
        label={S.catDelete(name)}
        icon={<Trash2 />}
        disabled={pl}
        onClick={() => deleteCategory(c.id)}
      />
    </li>
  );
}
