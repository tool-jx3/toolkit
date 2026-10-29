/**
 * 預設外觀（「外框」分頁的第一個區塊）：token-workshop 的 18 組外框、eidolon-ui 的 5 組範例、隨機、我的預設（存、覆寫、刪除、JSON）。
 * 縮圖是目前的棋子套上那組外觀（外觀停下 0.2 秒後才重畫，拖滑桿時不卡）。
 */
import { Download, Save, Shuffle, Trash2, Upload } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { downloadBlob, pickFiles } from '@/core/files';
import {
  Button,
  EffectGrid,
  type EffectGridItem,
  Field,
  IconButton,
  Section,
  TextInput,
  Toggle,
  useConfirm,
  useToast,
} from '@/ui';
import type { Look } from './model';
import {
  applyPreset,
  EXAMPLE_PRESETS,
  type LookPreset,
  PRESET_MAX,
  PRESET_NAME_MAX,
  presetFromLook,
  presetMatches,
  RING_PRESETS,
  shufflePatch,
} from './presets';
import { useCustomData } from './sources';
import {
  applyLookPatch,
  currentToken,
  normalizeMyPresets,
  prefsNow,
  setPrefs,
  useDoc,
  usePrefs,
} from './store';
import { S } from './strings';
import { drawTokenThumb, type ThumbCustom, useLoadedTokens } from './thumbs';

export const PRESET_FILE_FORMAT = 'trpg-toolkit-token-presets';

/** 外觀停下一段時間才更新的複本（縮圖用） */
function useSettled<T>(value: T, ms = 200): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

function useThumbDrawer() {
  const look = useDoc((s) => s.data.look);
  const token = useDoc((s) => currentToken(s.data));
  const custom = useDoc((s) => s.data.custom);
  const cdata = useCustomData(custom.frame?.id ?? null, custom.mask?.id ?? null);
  const loaded = useLoadedTokens(
    useMemo(() => (token ? [token] : []), [token]),
    look.feather,
  );
  const settled = useSettled(look);
  const extra: ThumbCustom = {
    frame: cdata.frame,
    frameId: custom.frame?.id ?? null,
    mask: cdata.mask,
  };
  const extraRef = useRef(extra);
  extraRef.current = extra;
  // biome-ignore lint/correctness/useExhaustiveDependencies: loaded 讓讀好的圖片重畫
  return useCallback(
    (ctx: CanvasRenderingContext2D, target: Look, labels: boolean) => {
      const k = Math.min(ctx.canvas.width, ctx.canvas.height);
      ctx.save();
      ctx.translate((ctx.canvas.width - k) / 2, (ctx.canvas.height - k) / 2);
      drawTokenThumb(ctx, token, target, k, extraRef.current, { labels });
      ctx.restore();
    },
    [token, loaded, settled, cdata.frame, cdata.mask],
  );
}

function applyWithOutput(p: LookPreset) {
  applyLookPatch(applyPreset(useDoc.getState().data.look, p));
  if (p.output) setPrefs({ ...p.output });
}

export function PresetSection() {
  const look = useDoc((s) => s.data.look);
  const showExamples = usePrefs((s) => s.data.showExamples);
  const mine = usePrefs((s) => s.data.myPresets);
  const draw = useThumbDrawer();
  const settled = useSettled(look);
  const builtins = useMemo(
    () => (showExamples ? [...RING_PRESETS, ...EXAMPLE_PRESETS] : []),
    [showExamples],
  );
  const byId = useMemo(() => new Map(builtins.map((p) => [p.id, p])), [builtins]);
  const items = useMemo<EffectGridItem<string>[]>(
    () =>
      builtins.map((p) => ({
        value: p.id,
        label: p.name,
        group: p.kind === 'ring' ? S.presetRing : S.presetExample,
      })),
    [builtins],
  );
  const active = useMemo(
    () => builtins.find((p) => presetMatches(settled, p))?.id ?? null,
    [builtins, settled],
  );
  const drawBuiltin = useCallback(
    (ctx: CanvasRenderingContext2D, id: string) => {
      const p = byId.get(id);
      if (p) draw(ctx, applyPreset(settled, p), p.kind === 'example');
    },
    [byId, draw, settled],
  );

  return (
    <Section title={S.presetSection} description={S.presetHint} persistKey="token-maker:presets">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button
          size="sm"
          variant="secondary"
          icon={<Shuffle />}
          title={S.presetShuffleTitle}
          data-testid="preset-shuffle"
          onClick={() =>
            applyLookPatch(
              applyPreset(useDoc.getState().data.look, {
                id: 'shuffle',
                name: '',
                kind: 'ring',
                patch: shufflePatch(),
              }),
            )
          }
        >
          {S.presetShuffle}
        </Button>
        <Field label={S.showExamples} layout="inline">
          <Toggle checked={showExamples} onCheckedChange={(v) => setPrefs({ showExamples: v })} />
        </Field>
      </div>
      {items.length ? (
        <EffectGrid<string>
          aria-label={S.presetSection}
          items={items}
          value={active}
          onValueChange={(v) => {
            const p = v ? byId.get(v) : undefined;
            if (p) applyWithOutput(p);
          }}
          draw={drawBuiltin}
          thumbWidth={96}
          thumbHeight={96}
          animate="none"
          minItemWidth={84}
        />
      ) : null}
      <MyPresets mine={mine} look={look} settled={settled} draw={draw} />
    </Section>
  );
}

function MyPresetThumb({
  draw,
  look,
}: {
  draw: (ctx: CanvasRenderingContext2D, look: Look, labels: boolean) => void;
  look: Look;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const px = Math.round(56 * Math.min(2, window.devicePixelRatio || 1));
    c.width = c.height = px;
    draw(ctx, look, true);
  }, [draw, look]);
  return <canvas ref={ref} aria-hidden className="checker size-14 shrink-0 rounded-sm" />;
}

function MyPresets({
  mine,
  look,
  settled,
  draw,
}: {
  mine: LookPreset[];
  look: Look;
  settled: Look;
  draw: (ctx: CanvasRenderingContext2D, look: Look, labels: boolean) => void;
}) {
  const withOutput = usePrefs((s) => s.data.presetOutput);
  const [name, setName] = useState('');
  const confirm = useConfirm();
  const toast = useToast();

  const output = (): LookPreset['output'] | undefined => {
    const p = prefsNow();
    return p.presetOutput
      ? { sizeChoice: p.sizeChoice, customSize: p.customSize, format: p.format }
      : undefined;
  };
  const store = (list: LookPreset[]) => setPrefs({ myPresets: list });

  const save = async () => {
    const n = name.trim().slice(0, PRESET_NAME_MAX);
    if (!n) return;
    const list = prefsNow().myPresets;
    const same = list.find((p) => p.name === n);
    if (same) {
      const ok = await confirm({
        title: S.presetOverwriteTitle(n),
        confirmLabel: S.presetOverwrite,
        danger: true,
      });
      if (!ok) return;
      store(list.map((p) => (p.id === same.id ? presetFromLook(p.id, n, look, output()) : p)));
      toast({ title: S.presetOverwritten(n), tone: 'success', replace: true });
    } else {
      if (list.length >= PRESET_MAX) {
        toast({ title: S.presetFull(PRESET_MAX), tone: 'warning' });
        return;
      }
      const id = `mine-${Date.now().toString(36)}`;
      store([presetFromLook(id, n, look, output()), ...list]);
      toast({ title: S.presetSaved(n), tone: 'success', replace: true });
    }
    setName('');
  };

  const exportJson = () => {
    const body = JSON.stringify(
      {
        format: PRESET_FILE_FORMAT,
        version: 1,
        presets: prefsNow().myPresets.map(({ name: n, patch, output: o, savedAt }) => ({
          name: n,
          patch,
          ...(o ? { output: o } : {}),
          savedAt,
        })),
      },
      null,
      2,
    );
    downloadBlob(new Blob([body], { type: 'application/json' }), S.presetExportName);
  };

  const importJson = async () => {
    const [f] = await pickFiles({ accept: '.json,application/json' });
    if (!f) return;
    let raw: unknown = null;
    try {
      const d = JSON.parse(await f.text());
      raw = Array.isArray(d)
        ? d
        : d && typeof d === 'object'
          ? (d as { presets?: unknown }).presets
          : null;
    } catch {
      raw = null;
    }
    const got = normalizeMyPresets(raw).map((p, i) => ({
      ...p,
      id: `mine-${Date.now().toString(36)}-${i}`,
    }));
    if (!got.length) {
      toast({ title: S.presetImportNone, description: f.name, tone: 'warning' });
      return;
    }
    const list = prefsNow().myPresets;
    const names = new Set(got.map((p) => p.name));
    const merged = [...got, ...list.filter((p) => !names.has(p.name))].slice(0, PRESET_MAX);
    store(merged);
    toast({ title: S.presetImported(got.length), tone: 'success' });
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h4 className="m-0 text-sm font-semibold text-fg">{S.presetMine}</h4>
      {mine.length ? (
        <ul className="m-0 flex list-none flex-col gap-1.5 p-0" aria-label={S.presetMine}>
          {mine.map((p) => {
            const on = presetMatches(settled, p);
            return (
              <li
                key={p.id}
                className={`flex min-w-0 items-center gap-2 rounded-md border p-1.5 ${on ? 'border-accent bg-accent-soft' : 'border-border bg-surface'}`}
                data-preset={p.name}
              >
                <button
                  type="button"
                  className="flex min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-sm text-left outline-none focus-visible:ring-2 focus-visible:ring-focus"
                  aria-pressed={on}
                  title={S.presetApplied(p.name)}
                  onClick={() => applyWithOutput(p)}
                >
                  <MyPresetThumb draw={draw} look={applyPreset(settled, p)} />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm text-fg">{p.name}</span>
                    {p.output ? (
                      <span className="text-xs text-muted">{S.presetOutputNote}</span>
                    ) : null}
                  </span>
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  title={S.presetOverwriteTitle(p.name)}
                  onClick={async () => {
                    const ok = await confirm({
                      title: S.presetOverwriteTitle(p.name),
                      confirmLabel: S.presetOverwrite,
                      danger: true,
                    });
                    if (!ok) return;
                    store(
                      prefsNow().myPresets.map((x) =>
                        x.id === p.id
                          ? presetFromLook(p.id, p.name, look, output() ?? p.output)
                          : x,
                      ),
                    );
                    toast({ title: S.presetOverwritten(p.name), tone: 'success', replace: true });
                  }}
                >
                  {S.presetOverwrite}
                </Button>
                <IconButton
                  size="sm"
                  label={S.presetDelete(p.name)}
                  icon={<Trash2 />}
                  onClick={async () => {
                    const ok = await confirm({
                      title: S.presetDeleteTitle(p.name),
                      description: S.presetDeleteDesc,
                      confirmLabel: S.presetDeleteConfirm,
                      danger: true,
                    });
                    if (!ok) return;
                    store(prefsNow().myPresets.filter((x) => x.id !== p.id));
                    toast({ title: S.presetDeleted(p.name), tone: 'info' });
                  }}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="m-0 text-xs text-muted">{S.presetNoneMine}</p>
      )}
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <Field label={S.presetName} className="min-w-40 flex-1">
          <TextInput
            value={name}
            maxLength={PRESET_NAME_MAX}
            placeholder={S.presetNamePlaceholder}
            data-testid="preset-name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void save();
              }
            }}
          />
        </Field>
        <Button
          size="sm"
          variant="secondary"
          icon={<Save />}
          disabled={!name.trim()}
          data-testid="preset-save"
          onClick={() => void save()}
        >
          {S.presetSave}
        </Button>
      </div>
      <Field label={S.presetWithOutput} layout="inline">
        <Toggle checked={withOutput} onCheckedChange={(v) => setPrefs({ presetOutput: v })} />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="ghost"
          icon={<Download />}
          disabled={!mine.length}
          onClick={exportJson}
        >
          {S.presetExport}
        </Button>
        <Button size="sm" variant="ghost" icon={<Upload />} onClick={() => void importJson()}>
          {S.presetImport}
        </Button>
      </div>
    </div>
  );
}
