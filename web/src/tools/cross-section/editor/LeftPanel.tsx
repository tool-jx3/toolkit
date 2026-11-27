/**
 * 左側的三個分頁：構造（縱向：建築寬、樓層高、屋頂、天空、RF、樓層的增減與每層的區域數、縱向通道；
 * 橫向〔第二批〕：機關車、排法、車外的景色、車頂的移動路線、車廂的清單）、
 * 設備・家具（工具、搜尋、分類、放置的出現時機、連續放置、36 種設備）、完成（作品名、副標題、樣式、淹水、紙的老舊、顯示）。
 */
import {
  ArrowDown,
  ArrowUp,
  Building,
  Layers,
  MessageSquarePlus,
  Minus,
  MousePointer2,
  Plus,
  Shuffle,
  Sparkles,
  X,
} from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { historyGesture } from '@/core/storage';
import {
  Button,
  Checkbox,
  cn,
  Field,
  IconButton,
  Segmented,
  Select,
  Slider,
  Tabs,
  TextInput,
  Toggle,
} from '@/ui';
import { paletteOf } from '../draw/palette';
import { fixtureThumb } from '../draw/thumbs';
import { FIXTURE_CATEGORIES, FIXTURES, type FixtureCategory } from '../model/catalog';
import { floorsTopDown } from '../model/layout';
import {
  ARRANGES,
  type Arrange,
  CAPS,
  CAR_TYPES,
  type CarType,
  LOCO_KINDS,
  type LocoKind,
  levelTag,
  MAX_CARS,
  MAX_FLOORS,
  RANGES,
  ROOF_IDS,
  type RoofId,
  SCENERIES,
  type Scenery,
  SHAFT_KINDS,
  SKY_IDS,
  type SkyId,
  STYLE_IDS,
  WIDTHS,
} from '../model/types';
import { S } from '../strings';
import * as act from './actions';
import { editor } from './controller';
import {
  type LeftTab,
  type PlacePhase,
  setEditor,
  type ToolId,
  useDoc,
  useEditor,
  usePrefs,
} from './store';

const g = historyGesture(useDoc);

function ToolButton({
  tool,
  icon,
  label,
  keyHint,
}: {
  tool: ToolId;
  icon: ReactNode;
  label: string;
  keyHint: string;
}) {
  const active = useEditor((s) => s.tool === tool);
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => act.setTool(tool)}
      data-tool={tool}
      className={cn(
        'flex min-w-0 items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none',
        active ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:bg-surface-2',
      )}
    >
      <span className="inline-flex shrink-0 [&_svg]:size-4" aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <kbd className="text-[10px] text-muted">{keyHint}</kbd>
    </button>
  );
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <p className="m-0 rounded-md bg-surface-2 px-2.5 py-2 text-xs leading-relaxed text-muted">
      {children}
    </p>
  );
}

/* ---------- 構造 ---------- */

function BuildTab() {
  const b = useDoc((s) => s.data.building);
  const sky = useDoc((s) => s.data.sky);
  const floors = floorsTopDown(b.floors);
  const firstBelow = floors.findIndex((f) => f.level < 0);
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label={S.build.width}>
          <Select
            value={String(b.width)}
            onValueChange={(v) => act.setWidth(Number(v))}
            options={WIDTHS.map((w) => ({ value: String(w), label: String(w) }))}
            data-testid="width-select"
          />
        </Field>
        <Field label={S.build.storey}>
          <Select
            value={String(b.storey)}
            onValueChange={(v) => {
              useDoc.getState().update((d) => {
                d.building.storey = Number(v);
              });
              editor.fitView();
            }}
            options={[
              { value: '5', label: S.build.storey5 },
              { value: '6', label: S.build.storey6 },
            ]}
          />
        </Field>
        <Field label={S.build.roof}>
          <Select
            value={b.roof}
            onValueChange={(v: RoofId) =>
              useDoc.getState().update((d) => {
                d.building.roof = v;
              })
            }
            options={ROOF_IDS.map((r) => ({ value: r, label: S.roofs[r] }))}
          />
        </Field>
        <Field label={S.build.sky}>
          <Select
            value={sky}
            onValueChange={(v: SkyId) =>
              useDoc.getState().update((d) => {
                d.sky = v;
              })
            }
            options={SKY_IDS.map((s) => ({ value: s, label: S.weathers[s] }))}
          />
        </Field>
      </div>
      <Checkbox
        checked={b.rooftop}
        onCheckedChange={(v) => {
          useDoc.getState().update((d) => {
            d.building.rooftop = v;
          });
          editor.fitView();
        }}
        label={S.build.rooftop}
      />
      <section className="flex flex-col gap-1.5" aria-label={S.build.floors}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="m-0 text-sm font-medium">{S.build.floors}</h3>
          <span className="text-xs text-muted tabular-nums" data-testid="floor-count">
            {S.build.floorCount(b.floors.length, MAX_FLOORS)}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => act.addFloorAt('above')}
            data-testid="add-above"
            disabled={b.floors.length >= MAX_FLOORS}
          >
            {S.build.addAbove}
          </Button>
          <Button
            size="sm"
            icon={<Plus />}
            onClick={() => act.addFloorAt('below')}
            data-testid="add-below"
            disabled={b.floors.length >= MAX_FLOORS}
          >
            {S.build.addBelow}
          </Button>
        </div>
        <ul className="m-0 flex list-none flex-col gap-1 p-0" data-testid="floor-list">
          {floors.map((f, i) => (
            <li key={f.id} className="flex flex-col gap-1">
              {i === firstBelow && i > 0 ? (
                <div className="flex items-center gap-2 text-[11px] text-muted" aria-hidden>
                  <span className="h-px flex-1 bg-border" />
                  {S.build.gl}
                  <span className="h-px flex-1 bg-border" />
                </div>
              ) : null}
              <div
                className="flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1"
                data-testid={`floor-${levelTag(f.level)}`}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                  onClick={() =>
                    f.rooms[0] && setEditor({ sel: { kind: 'room', id: f.rooms[0].id } })
                  }
                >
                  <b className="tabular-nums">{levelTag(f.level)}</b>{' '}
                  <span className="text-muted">{f.name}</span>
                  <small className="block text-xs text-muted">
                    {S.build.rooms(f.rooms.length)}
                    {f.rooms.some((r) => r.secret) ? `・${S.build.secretTag}` : ''}
                  </small>
                </button>
                <IconButton
                  size="sm"
                  icon={<Minus />}
                  label={S.build.fewer}
                  onClick={() => act.mergeFloorRooms(f.id)}
                  data-testid="merge-room"
                />
                <IconButton
                  size="sm"
                  icon={<Plus />}
                  label={S.build.more}
                  onClick={() => act.splitFloorRooms(f.id)}
                  data-testid="split-room"
                />
                <IconButton
                  size="sm"
                  icon={<X />}
                  label={S.build.delFloor}
                  disabled={b.floors.length <= 1}
                  onClick={() => void act.deleteFloor(f.id)}
                  data-testid="delete-floor"
                />
              </div>
            </li>
          ))}
        </ul>
      </section>
      <section className="flex flex-col gap-1.5" aria-label={S.build.shafts}>
        <h3 className="m-0 text-sm font-medium">{S.build.shafts}</h3>
        <div className="flex flex-wrap gap-1.5">
          {SHAFT_KINDS.map((k) => (
            <Button
              key={k}
              size="sm"
              icon={<Plus />}
              onClick={() => act.addShaftOf(k)}
              data-testid={`add-shaft-${k}`}
            >
              {S.shafts[k]}
            </Button>
          ))}
        </div>
        <ul className="m-0 flex list-none flex-col gap-1 p-0" data-testid="shaft-list">
          {b.shafts.length ? null : <li className="text-xs text-muted">{S.build.noShafts}</li>}
          {b.shafts.map((s) => (
            <li
              key={s.id}
              className="flex min-w-0 items-center gap-1.5 rounded-md border border-border bg-surface-2 px-2 py-1"
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate text-left text-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                onClick={() => setEditor({ sel: { kind: 'shaft', id: s.id } })}
              >
                <b>{S.shafts[s.kind]}</b>
                <small className="block text-xs text-muted">
                  {S.build.shaftInfo(s.x, levelTag(s.top), levelTag(s.bottom))}
                  {s.secret || s.kind === 'duct' ? `・${S.build.gmTag}` : ''}
                </small>
              </button>
              <IconButton
                size="sm"
                icon={<X />}
                label={S.build.delShaft}
                onClick={() => act.deleteShaft(s.id)}
              />
            </li>
          ))}
        </ul>
      </section>
      <Tip>{S.build.tip}</Tip>
    </div>
  );
}

/* ---------- 構造（橫向的連結車廂） ---------- */

function TrainTab() {
  const t = useDoc((s) => s.data.train);
  const sel = useEditor((s) => s.sel);
  const [type, setType] = useState<CarType>('coach');
  if (!t) return null;
  const full = t.cars.length >= MAX_CARS;
  return (
    <div className="flex flex-col gap-3" data-testid="train-build">
      <div className="grid grid-cols-2 gap-2">
        <Field label={S.train.loco}>
          <Select
            value={t.loco}
            onValueChange={(v: LocoKind) => act.setLoco(v)}
            options={LOCO_KINDS.map((v) => ({ value: v, label: S.locos[v] }))}
            data-testid="loco-select"
          />
        </Field>
        <Field label={S.train.arrange}>
          <Select
            value={t.arrange}
            onValueChange={(v: Arrange) => act.setArrange(v)}
            options={ARRANGES.map((v) => ({ value: v, label: S.arranges[v] }))}
            data-testid="arrange-select"
          />
        </Field>
      </div>
      <Field label={S.train.scenery}>
        <Select
          value={t.scenery}
          onValueChange={(v: Scenery) => act.setScenery(v)}
          options={SCENERIES.map((v) => ({ value: v, label: S.sceneries[v] }))}
          data-testid="scenery-select"
        />
      </Field>
      <Checkbox
        checked={t.roofRoute}
        onCheckedChange={(v) => act.patchTrain({ roofRoute: v })}
        label={S.train.roofRoute}
      />
      <section className="flex flex-col gap-1.5" aria-label={S.train.cars}>
        <div className="flex items-center justify-between gap-2">
          <h3 className="m-0 text-sm font-medium">{S.train.cars}</h3>
          <span className="text-xs text-muted tabular-nums" data-testid="car-count">
            {S.train.carCount(t.cars.length, MAX_CARS)}
          </span>
        </div>
        <div className="flex min-w-0 items-end gap-1.5">
          <Field label={S.train.newCarType} className="min-w-0 flex-1">
            <Select
              value={type}
              onValueChange={(v: CarType) => setType(v)}
              options={CAR_TYPES.map((v) => ({ value: v, label: S.cars[v] }))}
              data-testid="new-car-type"
            />
          </Field>
          <Button
            size="sm"
            icon={<Plus />}
            disabled={full}
            onClick={() => act.addCarOf(type)}
            data-testid="add-car"
          >
            {S.train.addCar}
          </Button>
        </div>
        <ul className="m-0 flex list-none flex-col gap-1 p-0" data-testid="car-list">
          {t.cars.map((car, i) => {
            const on = sel?.kind === 'car' && sel.id === car.id;
            const secret = car.under || car.rooms.some((r) => r.secret);
            return (
              <li
                key={car.id}
                className={cn(
                  'flex min-w-0 items-center gap-1 rounded-md border bg-surface-2 px-2 py-1',
                  on ? 'border-accent' : 'border-border',
                )}
                data-testid={`car-${i + 1}`}
              >
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left text-sm focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                  onClick={() => setEditor({ sel: { kind: 'car', id: car.id } })}
                >
                  <b className="tabular-nums">{S.train.carNo(i + 1)}</b>{' '}
                  <span className="text-muted">{car.name}</span>
                  <small className="block text-xs text-muted">
                    {S.train.carRooms(car.rooms.length)}
                    {i < t.cars.length - 1 && car.coupler !== 'normal'
                      ? `・${S.couplers[car.coupler]}`
                      : ''}
                    {secret ? `・${S.build.secretTag}` : ''}
                  </small>
                </button>
                <IconButton
                  size="sm"
                  icon={<ArrowUp />}
                  label={S.train.up}
                  disabled={i === 0}
                  onClick={() => act.moveCarBy(car.id, -1)}
                />
                <IconButton
                  size="sm"
                  icon={<ArrowDown />}
                  label={S.train.down}
                  disabled={i === t.cars.length - 1}
                  onClick={() => act.moveCarBy(car.id, 1)}
                />
                <IconButton
                  size="sm"
                  icon={<X />}
                  label={S.train.delCar}
                  disabled={t.cars.length <= 1}
                  onClick={() => act.deleteCar(car.id)}
                  data-testid="delete-car"
                />
              </li>
            );
          })}
        </ul>
      </section>
      <Tip>{S.train.tip}</Tip>
    </div>
  );
}

function StructureTab() {
  const mode = useDoc((s) => s.data.mode);
  return mode === 'train' ? <TrainTab /> : <BuildTab />;
}

/* ---------- 設備・家具 ---------- */

function FixturesTab() {
  const category = usePrefs((s) => s.data.category);
  const phase = usePrefs((s) => s.data.phase);
  const repeat = usePrefs((s) => s.data.repeat);
  const query = useEditor((s) => s.query);
  const tool = useEditor((s) => s.tool);
  const kind = useEditor((s) => s.kind);
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FIXTURES.filter((d) => {
      if (category !== 'all' && d.group !== category) return false;
      if (!q) return true;
      return `${S.fixtures[d.kind]} ${S.fixtureTags[d.kind] ?? ''} ${d.kind}`
        .toLowerCase()
        .includes(q);
    });
  }, [category, query]);
  return (
    <div className="flex flex-col gap-3">
      <fieldset className="m-0 grid min-w-0 grid-cols-2 gap-1.5 border-0 p-0">
        <legend className="sr-only">{S.fx.tools}</legend>
        <ToolButton tool="select" icon={<MousePointer2 />} label={S.fx.select} keyHint="V" />
        <ToolButton tool="note" icon={<MessageSquarePlus />} label={S.fx.note} keyHint="T" />
      </fieldset>
      <TextInput
        type="search"
        value={query}
        placeholder={S.fx.searchPh}
        aria-label={S.fx.search}
        onChange={(e) => setEditor({ query: e.target.value })}
      />
      <Segmented
        size="sm"
        fullWidth
        aria-label={S.fx.category}
        value={category}
        onValueChange={(v: FixtureCategory | 'all') => usePrefs.getState().patch({ category: v })}
        options={(['all', ...FIXTURE_CATEGORIES] as const).map((c) => ({
          value: c,
          label: S.cats[c],
        }))}
      />
      <Field label={S.fx.phase}>
        <Select
          value={phase}
          onValueChange={(v: PlacePhase) => usePrefs.getState().patch({ phase: v })}
          options={[
            { value: 'auto', label: S.fx.phaseAuto },
            { value: 'any', label: S.phases.any },
            { value: 'before', label: S.phases.before },
            { value: 'after', label: S.phases.after },
          ]}
          data-testid="place-phase"
        />
      </Field>
      <Field label={S.fx.repeat} layout="inline" hint={S.fx.repeatHint}>
        <Toggle
          checked={repeat}
          onCheckedChange={(v) => usePrefs.getState().patch({ repeat: v })}
        />
      </Field>
      <div
        className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-2"
        data-testid="fixture-grid"
      >
        {list.map((d) => {
          const on = tool === 'place' && kind === d.kind;
          return (
            <button
              key={d.kind}
              type="button"
              aria-pressed={on}
              title={S.fx.pick(S.fixtures[d.kind])}
              onClick={() => (on ? act.setTool('select') : act.armFixture(d.kind))}
              data-kind={d.kind}
              className={cn(
                'flex min-w-0 flex-col items-center gap-1 rounded-md border p-1.5 text-center text-xs focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none',
                on ? 'border-accent bg-accent-soft' : 'border-border bg-surface hover:bg-surface-2',
              )}
            >
              <img
                src={fixtureThumb(d.kind)}
                alt=""
                className="size-14 rounded-sm"
                style={{ background: paletteOf('color').walls.plaster }}
              />
              <span className="line-clamp-2 min-w-0">{S.fixtures[d.kind]}</span>
            </button>
          );
        })}
        {list.length ? null : <p className="col-span-full m-0 text-xs text-muted">{S.fx.none}</p>}
      </div>
    </div>
  );
}

/* ---------- 完成 ---------- */

function FinishTab() {
  const d = useDoc((s) => s.data);
  const train = d.mode === 'train';
  const set = (fn: (x: typeof d) => void) => useDoc.getState().update(fn);
  return (
    <div className="flex flex-col gap-3">
      <Field label={S.finish.title}>
        <TextInput
          value={d.title}
          maxLength={CAPS.title}
          onFocus={g.begin}
          onBlur={g.commit}
          onChange={(e) =>
            set((x) => {
              x.title = e.target.value;
            })
          }
        />
      </Field>
      <Field label={S.finish.subtitle}>
        <TextInput
          value={d.subtitle}
          maxLength={CAPS.subtitle}
          onFocus={g.begin}
          onBlur={g.commit}
          onChange={(e) =>
            set((x) => {
              x.subtitle = e.target.value;
            })
          }
          data-testid="subtitle"
        />
      </Field>
      <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 p-0 text-sm font-medium">{S.finish.style}</legend>
        <div className="grid grid-cols-2 gap-1.5" data-testid="style-cards">
          {STYLE_IDS.map((id) => {
            const p = paletteOf(id);
            const on = d.style === id;
            return (
              <button
                key={id}
                type="button"
                aria-pressed={on}
                data-style={id}
                onClick={() =>
                  set((x) => {
                    x.style = id;
                  })
                }
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-md border p-1.5 text-left focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none',
                  on
                    ? 'border-accent bg-accent-soft'
                    : 'border-border bg-surface hover:bg-surface-2',
                )}
              >
                <span
                  aria-hidden
                  className="size-8 shrink-0 rounded-sm border border-border"
                  style={{
                    background: `linear-gradient(135deg, ${p.paper} 0 50%, ${p.ink} 50% 100%)`,
                  }}
                />
                <span className="min-w-0">
                  <b className="block truncate text-sm">{S.styles[id].name}</b>
                  <small className="block truncate text-xs text-muted">{S.styles[id].desc}</small>
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>
      <fieldset className="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
        <legend className="mb-1.5 p-0 text-sm font-medium">{S.finish.flood}</legend>
        <Field label={S.finish.floodOn} layout="inline">
          <Toggle
            checked={d.flood}
            onCheckedChange={(v) =>
              set((x) => {
                x.flood = v;
                if (v && !x.floodLevel) x.floodLevel = RANGES.flood.def;
              })
            }
          />
        </Field>
        <Field
          label={S.finish.floodLevel}
          hint={train ? S.finish.floodHintTrain : S.finish.floodHint}
        >
          <Slider
            value={d.floodLevel}
            min={RANGES.flood.min}
            max={RANGES.flood.max}
            step={RANGES.flood.step}
            unit="%"
            onChange={g.live((v) =>
              set((x) => {
                x.floodLevel = v;
                x.flood = v > 0;
              }),
            )}
            onCommit={g.commit}
          />
        </Field>
      </fieldset>
      <Field label={S.finish.wear} hint={S.finish.reseedHint}>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Slider
            value={d.wear}
            min={RANGES.wear.min}
            max={RANGES.wear.max}
            step={RANGES.wear.step}
            unit="%"
            onChange={g.live((v) =>
              set((x) => {
                x.wear = v;
              }),
            )}
            onCommit={g.commit}
          />
          <Button size="sm" icon={<Shuffle />} onClick={act.reseed} data-testid="reseed">
            {S.finish.reseed}
          </Button>
        </div>
      </Field>
      <fieldset className="m-0 flex min-w-0 flex-col gap-1 border-0 p-0">
        <legend className="mb-1.5 p-0 text-sm font-medium">{S.finish.show}</legend>
        {(['grid', 'labels', 'elevation', 'frame'] as const).map((k) => (
          <Field
            key={k}
            label={train && k === 'elevation' ? S.finish.carTags : S.finish[k]}
            layout="inline"
          >
            <Toggle
              checked={d[k]}
              onCheckedChange={(v) => {
                set((x) => {
                  x[k] = v;
                });
                if (k === 'frame') editor.fitView();
              }}
            />
          </Field>
        ))}
      </fieldset>
    </div>
  );
}

export function LeftPanel() {
  const tab = usePrefs((s) => s.data.tab);
  return (
    <div className="flex min-h-0 min-w-0 flex-col rounded-md border border-border bg-surface p-2 lg:overflow-y-auto">
      <Tabs
        value={tab}
        onValueChange={(v: LeftTab) => {
          usePrefs.getState().patch({ tab: v });
          if (v !== 'fixtures' && useEditor.getState().tool === 'place') act.setTool('select');
        }}
        items={[
          { value: 'build', label: S.tabs.build, icon: <Building />, content: <StructureTab /> },
          { value: 'fixtures', label: S.tabs.fixtures, icon: <Layers />, content: <FixturesTab /> },
          { value: 'finish', label: S.tabs.finish, icon: <Sparkles />, content: <FinishTab /> },
        ]}
      />
    </div>
  );
}
