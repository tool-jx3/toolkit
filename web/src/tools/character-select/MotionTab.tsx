/**
 * 分頁 03「選擇演出」（規格 1.9、1.10）：玩家設定（選擇方式、人數、規則、每位玩家的名稱、顏色、目標與游標路徑）、
 * 播放時間與速度。
 */
import { ArrowDown, ArrowUp, X } from 'lucide-react';
import { useState } from 'react';
import {
  Button,
  Chips,
  ColorField,
  cn,
  Field,
  FieldRow,
  IconButton,
  NumberInput,
  Section,
  Segmented,
  Select,
  Slider,
  TextInput,
  Toggle,
} from '@/ui';
import {
  addWaypoint,
  captureRoute,
  editPlayers,
  moveWaypoint,
  removeWaypoint,
  setEditingPlayer,
  setPathMode,
  setPlayerStart,
  setPlayerTarget,
  setWaypoint,
} from './actions';
import { MAX_WAYPOINTS, normalizePlayerLabel, playerLabel, type Settings } from './model';
import { playbackPlayers, selectionIssue, selectionPath } from './motion';
import { edit, useSession, useSettings } from './store';
import { S } from './strings';
import { NextStep } from './widgets';

/** 顯示名稱欄：打字時照原樣顯示（可以打空白），存的是整理過的名稱；離開時改成整理過的樣子 */
function LabelInput({
  player,
  value,
  disabled,
}: {
  player: number;
  value: string;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <TextInput
      value={draft ?? value}
      maxLength={24}
      placeholder={S.players.labelPlaceholder(player + 1)}
      aria-label={S.players.label(player + 1)}
      disabled={disabled}
      className="h-8"
      onChange={(e) => {
        const raw = e.currentTarget.value;
        setDraft(raw);
        edit((d) => {
          d.players.labels[player] = normalizePlayerLabel(raw);
        });
      }}
      onBlur={() => setDraft(null)}
    />
  );
}

function characterOptions(s: Settings) {
  return s.characters.length
    ? s.characters.map((c, i) => ({
        value: String(i),
        label: c.name || S.chars.defaultName(i + 1),
      }))
    : [{ value: '0', label: S.players.noCharacter }];
}

function routeSummary(s: Settings, player: number): string {
  if (!s.characters.length) return S.players.addFirst;
  const n = s.characters.length;
  const target = Math.min(n - 1, Math.max(0, s.players.targets[player] || 0));
  return selectionPath(s, player, target, n)
    .map((i) => s.characters[i]?.name || S.chars.defaultName(i + 1))
    .join(' → ');
}

function PlayerRow({
  s,
  player,
  editing,
  disabled,
}: {
  s: Settings;
  player: number;
  editing: boolean;
  disabled: boolean;
}) {
  const name = playerLabel(s, player);
  const color = s.players.colors[player];
  const custom = s.players.pathModes[player] === 'custom';
  const waypoints = s.players.paths[player] ?? [];
  const has = s.characters.length > 0;
  const options = characterOptions(s);
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: 點列上任何地方都選這位玩家（主要操作是裡面的按鈕）
    // biome-ignore lint/a11y/useKeyWithClickEvents: 鍵盤用列裡的名稱按鈕
    <div
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-md border bg-surface-2 p-2',
        editing ? 'border-accent shadow-[inset_3px_0_0_var(--pc)]' : 'border-border',
      )}
      style={{ ['--pc' as string]: color }}
      data-testid="player-row"
      data-player={player}
      onClick={() => setEditingPlayer(player)}
      onFocusCapture={() => setEditingPlayer(player)}
    >
      <Field label={S.players.label(player + 1)}>
        <LabelInput player={player} value={s.players.labels[player] ?? ''} disabled={disabled} />
      </Field>
      <div className="flex flex-wrap items-end gap-2">
        <button
          type="button"
          aria-pressed={editing}
          aria-label={S.players.pick(name)}
          title={S.players.pick(name)}
          onClick={() => setEditingPlayer(player)}
          disabled={disabled}
          className="h-8 max-w-32 truncate rounded-full px-3 text-sm font-bold text-[#061018] outline-none focus-visible:ring-2 focus-visible:ring-focus aria-pressed:ring-2 aria-pressed:ring-fg"
          style={{ background: color }}
        >
          {name}
        </button>
        <ColorField
          value={color}
          onChange={(v) =>
            edit((d) => {
              d.players.colors[player] = v;
            })
          }
          showInput={false}
          aria-label={S.players.color(name)}
          disabled={disabled}
        />
        <div className="min-w-36 flex-1">
          <Field label={S.players.target}>
            <Select
              value={String(s.players.targets[player] ?? 0)}
              onValueChange={(v) => setPlayerTarget(player, Number(v))}
              options={options}
              aria-label={S.players.targetAria(name)}
              disabled={disabled || !has}
            />
          </Field>
        </div>
      </div>
      <Section
        title={S.players.route}
        defaultOpen={false}
        className="bg-surface"
        actions={
          <span className="text-xs text-muted">
            {custom ? S.players.routeCustom : S.players.routeAuto}
          </span>
        }
      >
        <FieldRow columns={2}>
          <Field label={S.players.start}>
            <Select
              value={
                s.players.starts[player] === null ? 'random' : String(s.players.starts[player])
              }
              onValueChange={(v) => setPlayerStart(player, v === 'random' ? null : Number(v))}
              options={[{ value: 'random', label: S.players.random }, ...(has ? options : [])]}
              aria-label={S.players.startAria(name)}
              disabled={disabled || !has}
            />
          </Field>
          <Field label={S.players.pathMode}>
            <Select
              value={custom ? 'custom' : 'random'}
              onValueChange={(v) => setPathMode(player, v as 'random' | 'custom')}
              options={(['random', 'custom'] as const).map((v) => ({
                value: v,
                label: S.players.pathModes[v],
              }))}
              aria-label={S.players.pathModeAria(name)}
              disabled={disabled}
            />
          </Field>
        </FieldRow>
        <p className="m-0 text-xs" data-testid="route-summary">
          <span className="text-muted">{S.players.summary}：</span>
          <strong className="font-semibold text-fg">{routeSummary(s, player)}</strong>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            onClick={() => captureRoute(player)}
            disabled={disabled || custom || !has}
          >
            {S.players.capture}
          </Button>
          <Button
            size="sm"
            onClick={() => addWaypoint(player)}
            disabled={disabled || !custom || !has || waypoints.length >= MAX_WAYPOINTS}
          >
            {S.players.addWaypoint}
          </Button>
        </div>
        {custom ? (
          waypoints.length ? (
            <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
              {waypoints.map((w, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: 中繼點的位置就是它的身分
                <li key={i} className="flex items-center gap-1.5" data-testid="waypoint">
                  <span className="w-14 shrink-0 text-xs text-muted">
                    {S.players.waypoint(i + 1)}
                  </span>
                  <Select
                    value={String(w)}
                    onValueChange={(v) => setWaypoint(player, i, Number(v))}
                    options={options}
                    aria-label={S.players.waypointAria(name, i + 1)}
                    size="sm"
                    disabled={disabled || !has}
                    className="min-w-0 flex-1"
                  />
                  <IconButton
                    size="sm"
                    icon={<ArrowUp />}
                    label={S.players.waypointUp}
                    onClick={() => moveWaypoint(player, i, -1)}
                    disabled={disabled || i === 0}
                  />
                  <IconButton
                    size="sm"
                    icon={<ArrowDown />}
                    label={S.players.waypointDown}
                    onClick={() => moveWaypoint(player, i, 1)}
                    disabled={disabled || i === waypoints.length - 1}
                  />
                  <IconButton
                    size="sm"
                    icon={<X />}
                    label={S.players.waypointRemove}
                    onClick={() => removeWaypoint(player, i)}
                    disabled={disabled}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <p className="m-0 text-xs text-muted">{S.players.emptyCustom}</p>
          )
        ) : (
          <p className="m-0 text-xs text-muted">{S.players.emptyAuto}</p>
        )}
      </Section>
    </div>
  );
}

function PlayersSection({ s, disabled }: { s: Settings; disabled: boolean }) {
  const editing = useSession((st) => st.editingPlayer);
  const P = s.players;
  const single = P.selectionMode === 'single';
  const issue = selectionIssue(s);
  const players = playbackPlayers(s);
  return (
    <Section
      title={S.players.title}
      persistKey="character-select:players"
      actions={
        <span
          className="rounded-full bg-surface-2 px-2 py-0.5 text-xs text-muted"
          data-testid="mode-badge"
        >
          {single
            ? S.players.badgeOne(playerLabel(s, P.singleNumber - 1))
            : S.players.badgeSeq(P.count)}
        </span>
      }
    >
      <Field label={S.players.mode}>
        <Segmented
          value={P.selectionMode}
          onValueChange={(v) =>
            editPlayers((d) => {
              d.players.selectionMode = v;
            })
          }
          options={(['sequence', 'single'] as const).map((v) => ({
            value: v,
            label: S.players.modes[v],
          }))}
          fullWidth
          disabled={disabled}
        />
      </Field>
      {single ? (
        <Field label={S.players.single} hint={S.players.singleHint}>
          <NumberInput
            value={P.singleNumber}
            onChange={(v) =>
              editPlayers((d) => {
                d.players.singleNumber = v;
              })
            }
            min={1}
            max={99}
            step={1}
            precision={0}
            unit={S.players.singleUnit}
            disabled={disabled}
          />
        </Field>
      ) : (
        <FieldRow columns={2}>
          <Field label={S.players.count}>
            <NumberInput
              value={P.count}
              onChange={(v) =>
                editPlayers((d) => {
                  d.players.count = v;
                })
              }
              min={1}
              max={99}
              step={1}
              precision={0}
              unit={S.players.countUnit}
              disabled={disabled}
            />
          </Field>
          <Field label={S.players.rule}>
            <Select
              value={P.allowDuplicate ? 'duplicate' : 'unique'}
              onValueChange={(v) =>
                edit((d) => {
                  d.players.allowDuplicate = v === 'duplicate';
                })
              }
              options={(['unique', 'duplicate'] as const).map((v) => ({
                value: v,
                label: S.players.rules[v],
              }))}
              disabled={disabled}
            />
          </Field>
        </FieldRow>
      )}
      <Chips
        aria-label={S.players.quickAria}
        items={[1, 2, 3, 4].map((n) => ({
          value: String(n),
          label: playerLabel(s, n - 1),
          title: S.players.quickTitle(n, playerLabel(s, n - 1)),
        }))}
        value={single ? String(P.singleNumber) : ''}
        onPick={(v) =>
          editPlayers((d) => {
            d.players.selectionMode = 'single';
            d.players.singleNumber = Number(v);
          })
        }
        disabled={disabled}
      />
      <p className="m-0 text-xs text-muted" data-testid="mode-help">
        {single
          ? S.players.oneHelp(playerLabel(s, P.singleNumber - 1))
          : S.players.seqHelp(playerLabel(s, 0))}
      </p>
      {s.mainPanel.enabled ? <p className="m-0 text-xs text-muted">{S.players.gridNote}</p> : null}
      {issue ? (
        <div
          className="flex flex-col gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning"
          role="status"
          data-testid="selection-issue"
        >
          <p className="m-0">{S.players.issue(issue.visible, issue.players)}</p>
          <Button
            size="sm"
            className="self-start"
            onClick={() =>
              edit((d) => {
                d.players.allowDuplicate = true;
              })
            }
            disabled={disabled}
          >
            {S.players.allowDuplicate}
          </Button>
        </div>
      ) : null}
      <p className="m-0 text-xs text-muted">{S.players.nameHelp}</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0" aria-label={S.players.listAria}>
        {players.map((p) => (
          <li key={p}>
            <PlayerRow s={s} player={p} editing={p === editing} disabled={disabled} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

function TimingSection({ s, disabled }: { s: Settings; disabled: boolean }) {
  const a = s.animation;
  const set = (recipe: (d: Settings) => void) => edit(recipe);
  return (
    <Section title={S.time.title} persistKey="character-select:time" defaultOpen={false}>
      <Field label={S.time.initialHold}>
        <Slider
          value={a.initialHold}
          onChange={(v) =>
            set((d) => {
              d.animation.initialHold = v;
            })
          }
          min={0}
          max={3000}
          step={50}
          unit="ms"
          disabled={disabled}
        />
      </Field>
      <Field label={S.time.search}>
        <Slider
          value={a.searchDuration}
          onChange={(v) =>
            set((d) => {
              d.animation.searchDuration = v;
            })
          }
          min={100}
          max={4000}
          step={50}
          unit="ms"
          disabled={disabled}
        />
      </Field>
      <Field label={S.time.confirm}>
        <Slider
          value={a.confirmDuration}
          onChange={(v) =>
            set((d) => {
              d.animation.confirmDuration = v;
            })
          }
          min={100}
          max={3000}
          step={50}
          unit="ms"
          disabled={disabled}
        />
      </Field>
      <Field label={S.time.endHold}>
        <Slider
          value={a.endHold}
          onChange={(v) =>
            set((d) => {
              d.animation.endHold = v;
            })
          }
          min={100}
          max={6000}
          step={50}
          unit="ms"
          disabled={disabled}
        />
      </Field>
      <Field label={S.time.hops}>
        <Slider
          value={a.hops}
          onChange={(v) =>
            set((d) => {
              d.animation.hops = v;
            })
          }
          min={0}
          max={10}
          step={1}
          unit={S.time.hopsUnit}
          disabled={disabled}
        />
      </Field>
      <Field label={S.time.loop} layout="inline" hint={S.time.loopHint}>
        <Toggle
          checked={a.loop}
          onCheckedChange={(v) =>
            set((d) => {
              d.animation.loop = v;
            })
          }
          disabled={disabled}
        />
      </Field>
    </Section>
  );
}

export function MotionTab() {
  const s = useSettings((st) => st.data);
  const disabled = useSession((st) => st.exporting);
  return (
    <div className="flex flex-col gap-3">
      <PlayersSection s={s} disabled={disabled} />
      <TimingSection s={s} disabled={disabled} />
      <NextStep to="export" />
    </div>
  );
}
