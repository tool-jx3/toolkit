/**
 * 設定面板的四個分頁：角色、讀取動畫（進度條／循環動畫／換圖列）、文字、畫布。
 */
import { Dices, Eye, Play, RotateCcw, Upload } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { pickFiles } from '@/core/files';
import { FONT_FILE_ACCEPT, uploadFont } from '@/core/fonts';
import {
  Button,
  EffectGrid,
  type EffectGridItem,
  Field,
  FieldRow,
  FileDrop,
  FontPicker,
  KeyframeTable,
  NumberInput,
  Section,
  Segmented,
  Select,
  Show,
  TextArea,
} from '@/ui';
import {
  ColorRow,
  drawBarThumb,
  drawLoopThumb,
  drawModeThumb,
  drawVanishThumb,
  ImageSetDrop,
  namesLine,
  SliderField,
  StopList,
  ToggleField,
} from './controls';
import { addCharacterFiles, addImageSet } from './media';
import { requestSeek, setMedia, setStatus, showError, useRuntime, withBusy } from './runtime';
import {
  BAR_STYLES,
  type BarStyle,
  BUILTIN_CHARACTERS,
  DEFAULT_KEYS,
  IMAGE_ORDERS,
  type ImageOrder,
  type LmSettings,
  LOADER_TYPES,
  LOOP_STYLES,
  type LoopStyle,
  MOTION_KINDS,
  PROGRESS_CURVES,
  PROGRESS_MODES,
  type ProgressMode,
  RANGE,
  ROW_PATTERNS,
  ROW_SHAPES,
  type RowShape,
  SEGMENT_STYLES,
  SIZE_PRESETS,
  type TextBlock,
  VANISH_MODES,
  type VanishMode,
} from './settings';
import { edit, useLm } from './store';
import { S } from './strings';
import { completionStart, seamlessLoop, totalDuration, trimNumber } from './timing';

/** 新增的節點取到 0.01 秒、0.1%（與原作相同） */
const KEY_RULES = { insertDecimals: { time: 2, value: 1 } } as const;

const useSettings = () => useLm((st) => st.data);

const clampTo = (v: number, [lo, hi]: readonly [number, number]) => Math.min(hi, Math.max(lo, v));

/* ---------- 角色 ---------- */

/** 上傳角色（F13～F16） */
export async function loadCharacterFiles(files: File[]) {
  try {
    const r = await withBusy(S.busy.image, (progress) => addCharacterFiles(files, progress));
    edit((d) => {
      d.character.upload = r.value.upload;
    });
    setMedia({ character: r.value.media });
    setStatus(
      r.persisted ? 'success' : 'warning',
      `${r.persisted ? S.status.characterLoaded(r.value.media.frames.length) : S.status.notPersisted}${
        r.skipped ? S.status.skipped(r.skipped) : ''
      }`,
    );
  } catch (e) {
    /* 解碼失敗：顯示錯誤，改用內建角色 */
    edit((d) => {
      d.character.upload = null;
    });
    setMedia({ character: null });
    setStatus('danger', S.status.decodeFailed(e instanceof Error ? e.message : String(e)));
  }
}

function CharacterSource() {
  const s = useSettings();
  const media = useRuntime((st) => st.media.character);
  const up = s.character.upload;
  return (
    <Section title={S.character.sectionImage} persistKey="loading-maker:char-image">
      <FileDrop
        aria-label={S.character.sectionImage}
        label={S.character.dropLabel}
        buttonLabel={S.character.dropButton}
        hint={S.character.dropHint}
        accept="image/*,.apng"
        multiple
        clickable
        paste="off"
        filterByAccept={false}
        onFiles={(files) => void loadCharacterFiles(files)}
      />
      <div className="text-xs" data-testid="character-info">
        {up ? (
          <>
            <p className="m-0 font-medium text-fg">
              {media
                ? S.character.uploadInfo(media.frames.length, media.width, media.height)
                : S.busy.image}
            </p>
            <p className="m-0 break-all text-muted">{namesLine(up.names, 2)}</p>
          </>
        ) : (
          <>
            <p className="m-0 font-medium text-fg">
              {S.character.builtinInfo(S.character.builtins[s.character.builtin])}
            </p>
            <p className="m-0 text-muted">{S.character.builtinHint}</p>
          </>
        )}
      </div>
      {up ? (
        <Button
          variant="secondary"
          icon={<RotateCcw />}
          onClick={() => {
            edit((d) => {
              d.character.upload = null;
            });
            setMedia({ character: null });
            setStatus('success', S.status.characterCleared);
          }}
        >
          {S.character.clear}
        </Button>
      ) : (
        <Field label={S.character.builtin}>
          <Select
            value={s.character.builtin}
            onValueChange={(v) =>
              edit((d) => {
                d.character.builtin = v;
              })
            }
            options={BUILTIN_CHARACTERS.map((v) => ({ value: v, label: S.character.builtins[v] }))}
          />
        </Field>
      )}
    </Section>
  );
}

export function CharacterPanel() {
  const s = useSettings();
  const media = useRuntime((st) => st.media.character);
  const ch = s.character;
  const up = ch.upload;
  const animated = !!media?.animated && up?.kind === 'file';
  const set = <K extends keyof LmSettings['character']>(k: K, v: LmSettings['character'][K]) =>
    edit((d) => {
      d.character[k] = v;
    });
  return (
    <div className="flex flex-col gap-3">
      <CharacterSource />
      <Section title={S.character.sectionLook} persistKey="loading-maker:char-look">
        <SliderField
          label={S.character.x}
          value={ch.x}
          onChange={(v) => set('x', v)}
          range={RANGE.charPos}
          input={RANGE.posInput}
          unit="%"
        />
        <SliderField
          label={S.character.y}
          value={ch.y}
          onChange={(v) => set('y', v)}
          range={RANGE.charPos}
          input={RANGE.posInput}
          unit="%"
        />
        <SliderField
          label={S.character.size}
          value={ch.size}
          onChange={(v) => set('size', v)}
          range={RANGE.charSize}
          unit="%"
          hint={S.character.sizeHint}
        />
        <SliderField
          label={S.character.rotation}
          value={ch.rotation}
          onChange={(v) => set('rotation', v)}
          range={RANGE.rotation}
          unit="°"
        />
        <SliderField
          label={S.character.opacity}
          value={ch.opacity}
          onChange={(v) => set('opacity', v)}
          range={[0, 1]}
          step={0.01}
          hint={S.character.dragHint}
        />
      </Section>
      <Section title={S.character.sectionMotion} persistKey="loading-maker:char-motion">
        <Field label={S.character.motion}>
          <Select
            value={ch.motion}
            onValueChange={(v) => set('motion', v)}
            options={MOTION_KINDS.map((v) => ({ value: v, label: S.character.motions[v] }))}
          />
        </Field>
        <SliderField
          label={S.character.motionAmount}
          value={ch.motionAmount}
          onChange={(v) => set('motionAmount', v)}
          range={RANGE.motionAmount}
        />
        <SliderField
          label={S.character.motionSpeed}
          value={ch.motionSpeed}
          onChange={(v) => set('motionSpeed', v)}
          range={RANGE.motionSpeed}
          step={0.05}
          unit="倍"
          hint={S.character.motionSpeedHint}
        />
      </Section>
      {up ? (
        <Section title={S.character.sectionFrames} persistKey="loading-maker:char-frames">
          {animated ? (
            <ToggleField
              label={S.character.fileTiming}
              checked={ch.fileTiming}
              onChange={(v) => set('fileTiming', v)}
              hint={S.character.fileTimingHint}
            />
          ) : null}
          <SliderField
            label={S.character.speed}
            value={ch.speed}
            onChange={(v) => set('speed', v)}
            range={RANGE.speed}
            step={0.05}
            unit="倍"
          />
          {!animated || !ch.fileTiming ? (
            <SliderField
              label={S.character.fps}
              value={ch.fps}
              onChange={(v) => set('fps', v)}
              range={RANGE.charFps}
              hint={S.character.fpsHint}
            />
          ) : null}
        </Section>
      ) : null}
      <Section title={S.character.sectionShadow} persistKey="loading-maker:char-shadow">
        <ToggleField
          label={S.character.shadow}
          checked={ch.shadow}
          onChange={(v) => set('shadow', v)}
        />
        <Show when={ch.shadow}>
          <ColorRow
            label={S.character.shadowColor}
            value={ch.shadowColor}
            onChange={(v) => set('shadowColor', v)}
          />
          <SliderField
            label={S.character.shadowBlur}
            value={ch.shadowBlur}
            onChange={(v) => set('shadowBlur', v)}
            range={RANGE.shadowBlur}
            unit="px"
          />
          <SliderField
            label={S.character.shadowY}
            value={ch.shadowY}
            onChange={(v) => set('shadowY', v)}
            range={RANGE.shadowY}
            unit="px"
          />
        </Show>
      </Section>
      {s.loader.type === 'bar' ? (
        <Section title={S.character.sectionFollow} persistKey="loading-maker:char-follow">
          <ToggleField
            label={S.character.follow}
            checked={ch.follow}
            onChange={(v) => set('follow', v)}
            hint={S.character.followHint}
          />
          <Show when={ch.follow}>
            <Field label={S.character.placement}>
              <Segmented
                fullWidth
                value={ch.followPlacement}
                onValueChange={(v) => set('followPlacement', v)}
                options={(['above', 'center', 'below'] as const).map((v) => ({
                  value: v,
                  label: S.character.placements[v],
                }))}
              />
            </Field>
            <SliderField
              label={S.character.gap}
              value={ch.followGap}
              onChange={(v) => set('followGap', v)}
              range={RANGE.followGap}
              unit="px"
              hint={S.character.gapHint}
            />
            <SliderField
              label={S.character.followX}
              value={ch.followX}
              onChange={(v) => set('followX', v)}
              range={RANGE.followOffset}
              input={RANGE.followOffsetXInput}
              unit="px"
            />
            <SliderField
              label={S.character.followY}
              value={ch.followY}
              onChange={(v) => set('followY', v)}
              range={RANGE.followOffset}
              input={RANGE.followOffsetYInput}
              unit="px"
            />
            <p className="m-0 text-xs text-muted">{S.character.followOffsetHint}</p>
            <ToggleField
              label={S.character.followSnap}
              checked={ch.followSnap}
              onChange={(v) => set('followSnap', v)}
              hint={S.character.followSnapHint}
            />
            <ToggleField
              label={S.character.followInside}
              checked={ch.followInside}
              onChange={(v) => set('followInside', v)}
            />
            <ToggleField
              label={S.character.followFlip}
              checked={ch.followFlip}
              onChange={(v) => set('followFlip', v)}
            />
          </Show>
        </Section>
      ) : null}
    </div>
  );
}

/* ---------- 讀取動畫 ---------- */

function SeedField() {
  const seed = useLm((st) => st.data.loader.seed);
  return (
    <Field label={S.loader.seed} hint={S.loader.seedHint}>
      <div className="flex items-center gap-2">
        <NumberInput
          value={seed}
          onChange={(v) =>
            edit((d) => {
              d.loader.seed = Math.round(v);
            })
          }
          min={RANGE.seed[0]}
          max={RANGE.seed[1]}
          step={1}
          precision={0}
          className="w-32"
        />
        <Button
          size="sm"
          icon={<Dices />}
          onClick={() =>
            edit((d) => {
              d.loader.seed = 1 + Math.floor(Math.random() * RANGE.seed[1]);
            })
          }
        >
          {S.loader.reseed}
        </Button>
      </div>
    </Field>
  );
}

function ColorsFields({ loop = false }: { loop?: boolean }) {
  const ld = useLm((st) => st.data.loader);
  const set = <K extends keyof LmSettings['loader']>(k: K, v: LmSettings['loader'][K]) =>
    edit((d) => {
      d.loader[k] = v;
    });
  return (
    <FieldRow>
      <ColorRow
        label={loop ? S.loop.baseColor : S.bar.trackColor}
        value={ld.trackColor}
        onChange={(v) => set('trackColor', v)}
      />
      <ColorRow
        label={loop ? S.loop.accentColor : S.bar.fillColor}
        value={ld.fillColor}
        onChange={(v) => set('fillColor', v)}
      />
    </FieldRow>
  );
}

function BorderFields() {
  const ld = useLm((st) => st.data.loader);
  return (
    <>
      <ColorRow
        label={S.bar.borderColor}
        value={ld.borderColor}
        onChange={(v) =>
          edit((d) => {
            d.loader.borderColor = v;
          })
        }
      />
      <SliderField
        label={S.bar.borderWidth}
        value={ld.borderWidth}
        onChange={(v) =>
          edit((d) => {
            d.loader.borderWidth = v;
          })
        }
        range={RANGE.borderWidth}
        step={0.5}
        unit="px"
      />
    </>
  );
}

const BAR_ITEMS: EffectGridItem<BarStyle>[] = BAR_STYLES.map((v) => ({
  value: v,
  label: S.bar.styles[v],
  description: S.bar.styleDescriptions[v],
}));
const MODE_ITEMS: EffectGridItem<ProgressMode>[] = PROGRESS_MODES.map((v) => ({
  value: v,
  label: S.bar.modes[v],
  description: S.bar.modeDescriptions[v],
}));
const VANISH_ITEMS: EffectGridItem<VanishMode>[] = VANISH_MODES.map((v) => ({
  value: v,
  label: S.bar.vanishes[v],
}));
const LOOP_ITEMS: EffectGridItem<LoopStyle>[] = LOOP_STYLES.map((v) => ({
  value: v,
  label: S.loop.styles[v],
}));
const CURVE_OPTIONS = PROGRESS_CURVES.map((v) => ({ value: v, label: S.bar.modes[v] }));

/** 起點、終點確定時：終點比起點小就對調（F69） */
const commitRange = () =>
  edit((d) => {
    if (d.bar.end < d.bar.start) [d.bar.start, d.bar.end] = [d.bar.end, d.bar.start];
  });

function BarPanel() {
  const s = useSettings();
  const b = s.bar;
  const set = <K extends keyof LmSettings['bar']>(k: K, v: LmSettings['bar'][K]) =>
    edit((d) => {
      d.bar[k] = v;
    });
  /* 縮圖依目前的顏色畫（換顏色時重畫） */
  const thumbKey = useMemo(
    () =>
      JSON.stringify([
        s.loader.trackColor,
        s.loader.fillColor,
        s.loader.borderColor,
        b.fill,
        b.stops,
      ]),
    [s.loader.trackColor, s.loader.fillColor, s.loader.borderColor, b.fill, b.stops],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在顏色改變時換縮圖
  const barThumb = useCallback(drawBarThumb(useLm.getState().data), [thumbKey]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在顏色、節點、種子改變時換縮圖
  const modeThumb = useCallback(drawModeThumb(useLm.getState().data), [
    thumbKey,
    b.keys,
    s.loader.seed,
  ]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在顏色、強度、種子改變時換縮圖
  const vanishThumb = useCallback(drawVanishThumb(useLm.getState().data), [
    thumbKey,
    b.intensity,
    s.loader.seed,
  ]);
  const segmentStyle = SEGMENT_STYLES.includes(b.style);
  return (
    <>
      <Section title={S.bar.sectionStyle} persistKey="loading-maker:bar-style">
        <EffectGrid<BarStyle>
          aria-label={S.bar.style}
          items={BAR_ITEMS}
          value={b.style}
          onValueChange={(v) => v && set('style', v)}
          draw={barThumb}
          thumbHeight={60}
          minItemWidth={112}
        />
        <SliderField
          label={S.bar.width}
          value={b.width}
          onChange={(v) => set('width', v)}
          range={RANGE.barWidth}
          unit="%"
        />
        <SliderField
          label={S.bar.height}
          value={b.height}
          onChange={(v) => set('height', v)}
          range={RANGE.barHeight}
          step={0.5}
          unit="%"
        />
        {segmentStyle ? (
          <SliderField
            label={S.bar.segments}
            value={b.segments}
            onChange={(v) => set('segments', Math.round(v))}
            range={RANGE.segments}
            hint={S.bar.segmentsHint}
          />
        ) : null}
      </Section>
      <Section title={S.bar.sectionProgress} persistKey="loading-maker:bar-progress">
        <EffectGrid<ProgressMode>
          aria-label={S.bar.mode}
          items={MODE_ITEMS}
          value={b.mode}
          onValueChange={(v) => v && set('mode', v)}
          draw={modeThumb}
          thumbHeight={60}
          minItemWidth={112}
        />
        {b.mode === 'keyframes' ? (
          <Field label={S.bar.keys}>
            <KeyframeTable
              aria-label={S.bar.keysAria}
              value={b.keys}
              onChange={(keys) => set('keys', keys)}
              curves={CURVE_OPTIONS}
              rules={KEY_RULES}
              defaults={DEFAULT_KEYS}
              onReset={() => setStatus('success', S.status.keysReset)}
              labels={S.bar.keysLabels}
            />
          </Field>
        ) : (
          <FieldRow>
            <Field label={S.bar.start} hint={S.bar.rangeHint}>
              <NumberInput
                value={b.start}
                onChange={(v) => set('start', v)}
                onCommit={commitRange}
                min={0}
                max={100}
                unit="%"
              />
            </Field>
            <Field label={S.bar.end}>
              <NumberInput
                value={b.end}
                onChange={(v) => set('end', v)}
                onCommit={commitRange}
                min={0}
                max={100}
                unit="%"
              />
            </Field>
          </FieldRow>
        )}
        <SeedField />
      </Section>
      <Section title={S.bar.sectionFill} persistKey="loading-maker:bar-fill">
        <Field label={S.bar.fill}>
          <Segmented
            fullWidth
            value={b.fill}
            onValueChange={(v) => set('fill', v)}
            options={(['solid', 'gradient'] as const).map((v) => ({
              value: v,
              label: S.bar.fills[v],
            }))}
          />
        </Field>
        {b.fill === 'solid' ? (
          <ColorRow
            label={S.bar.fillColor}
            value={s.loader.fillColor}
            onChange={(v) =>
              edit((d) => {
                d.loader.fillColor = v;
              })
            }
          />
        ) : (
          <>
            <Field label={S.bar.stops}>
              <StopList value={b.stops} onChange={(stops) => set('stops', stops)} />
            </Field>
            <SliderField
              label={S.bar.angle}
              value={b.angle}
              onChange={(v) => set('angle', v)}
              range={RANGE.angle}
              unit="°"
              hint={S.bar.angleHint}
            />
            <SliderField
              label={S.bar.colorBlur}
              value={b.colorBlur}
              onChange={(v) => set('colorBlur', v)}
              range={RANGE.colorBlur}
              unit="px"
              hint={S.bar.colorBlurHint}
            />
            <ToggleField label={S.bar.flow} checked={b.flow} onChange={(v) => set('flow', v)} />
            <Show when={b.flow}>
              <SliderField
                label={S.bar.flowSpeed}
                value={b.flowSpeed}
                onChange={(v) => set('flowSpeed', v)}
                range={RANGE.flowSpeed}
                step={0.01}
                unit={S.bar.flowSpeedUnit}
              />
              <Field label={S.bar.flowDirection}>
                <Segmented
                  value={b.flowReverse ? 'reverse' : 'forward'}
                  onValueChange={(v) => set('flowReverse', v === 'reverse')}
                  options={(['forward', 'reverse'] as const).map((v) => ({
                    value: v,
                    label: S.bar.flowDirections[v],
                  }))}
                />
              </Field>
            </Show>
          </>
        )}
        <ColorRow
          label={S.bar.trackColor}
          value={s.loader.trackColor}
          onChange={(v) =>
            edit((d) => {
              d.loader.trackColor = v;
            })
          }
        />
        <BorderFields />
        {b.style === 'rounded' ? (
          <ToggleField
            label={S.bar.shimmer}
            checked={b.shimmer}
            onChange={(v) => set('shimmer', v)}
            hint={S.bar.shimmerHint}
          />
        ) : null}
      </Section>
      <Section title={S.bar.sectionPercent} persistKey="loading-maker:bar-percent">
        <ToggleField
          label={S.bar.percent}
          checked={b.percent}
          onChange={(v) => set('percent', v)}
        />
        <Show when={b.percent}>
          <SliderField
            label={S.bar.percentX}
            value={b.percentX}
            onChange={(v) => set('percentX', v)}
            range={RANGE.percentX}
            input={RANGE.percentXInput}
            unit="px"
          />
          <SliderField
            label={S.bar.percentY}
            value={b.percentY}
            onChange={(v) => set('percentY', v)}
            range={RANGE.percentY}
            input={RANGE.percentYInput}
            unit="px"
          />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              size="sm"
              icon={<RotateCcw />}
              onClick={() => {
                edit((d) => {
                  d.bar.percentX = 0;
                  d.bar.percentY = 0;
                });
                setStatus('success', S.status.percentReset);
              }}
            >
              {S.bar.percentReset}
            </Button>
            <span className="text-xs text-muted">{S.bar.percentHint}</span>
          </div>
        </Show>
      </Section>
      <Section title={S.bar.sectionTiming} persistKey="loading-maker:bar-timing">
        <ToggleField
          label={S.bar.fadeIn}
          checked={b.fadeIn}
          onChange={(v) => set('fadeIn', v)}
          hint={S.bar.fadeInHint}
        />
        <div className="flex flex-wrap items-end gap-3">
          <Field label={S.bar.fadeInDuration}>
            <NumberInput
              value={b.fadeInDuration}
              onChange={(v) => set('fadeInDuration', v)}
              min={RANGE.fadeIn[0]}
              max={RANGE.fadeIn[1]}
              step={0.1}
              precision={2}
              unit="秒"
              className="w-32"
              disabled={!b.fadeIn}
            />
          </Field>
          <Button icon={<Eye />} disabled={!b.fadeIn} onClick={() => requestSeek(0, true)}>
            {S.bar.previewFadeIn}
          </Button>
        </div>
        <Field label={S.bar.hold}>
          <NumberInput
            value={b.hold}
            onChange={(v) => set('hold', v)}
            min={RANGE.hold[0]}
            max={RANGE.hold[1]}
            step={0.05}
            precision={2}
            unit="秒"
            className="w-32"
          />
        </Field>
        <Field label={S.bar.vanish} hint={S.bar.vanishHint}>
          <EffectGrid<VanishMode>
            aria-label={S.bar.vanish}
            items={VANISH_ITEMS}
            value={b.vanish}
            onValueChange={(v) => v && set('vanish', v)}
            draw={vanishThumb}
            thumbHeight={60}
            minItemWidth={112}
          />
        </Field>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={S.bar.vanishDuration}>
            <NumberInput
              value={b.vanishDuration}
              onChange={(v) => set('vanishDuration', v)}
              min={RANGE.vanishDuration[0]}
              max={RANGE.vanishDuration[1]}
              step={0.1}
              precision={2}
              unit="秒"
              className="w-32"
            />
          </Field>
          <Button
            icon={<Play />}
            disabled={b.vanish === 'none'}
            onClick={() => {
              const st = useLm.getState().data;
              requestSeek(Math.min(totalDuration(st), completionStart(st) + 0.001), true);
            }}
          >
            {S.bar.previewVanish}
          </Button>
        </div>
        <SliderField
          label={S.bar.intensity}
          value={b.intensity}
          onChange={(v) => set('intensity', v)}
          range={RANGE.intensity}
          step={0.05}
          unit="倍"
          hint={S.bar.intensityHint}
        />
      </Section>
    </>
  );
}

function LoopPanel() {
  const s = useSettings();
  const l = s.loop;
  const set = <K extends keyof LmSettings['loop']>(k: K, v: LmSettings['loop'][K]) =>
    edit((d) => {
      d.loop[k] = v;
    });
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在顏色改變時換縮圖
  const loopThumb = useCallback(drawLoopThumb(useLm.getState().data), [
    s.loader.trackColor,
    s.loader.fillColor,
  ]);
  return (
    <Section title={S.loop.sectionShape} persistKey="loading-maker:loop">
      <EffectGrid<LoopStyle>
        aria-label={S.loop.style}
        items={LOOP_ITEMS}
        value={l.style}
        onValueChange={(v) => v && set('style', v)}
        draw={loopThumb}
        animate="hover"
        thumbHeight={70}
        minItemWidth={96}
      />
      {l.style !== 'ring' ? (
        <SliderField
          label={S.loop.count}
          value={l.count}
          onChange={(v) => set('count', Math.round(v))}
          range={RANGE.loopCount}
        />
      ) : null}
      <SliderField
        label={S.loop.radius}
        value={l.radius}
        onChange={(v) => set('radius', v)}
        range={RANGE.loopRadius}
        unit="px"
      />
      <SliderField
        label={S.loop.size}
        value={l.size}
        onChange={(v) => set('size', v)}
        range={RANGE.loopSize}
        unit="px"
      />
      <SliderField
        label={S.loop.speed}
        value={l.speed}
        onChange={(v) => set('speed', v)}
        range={RANGE.loopSpeed}
        step={0.05}
        unit="倍"
        hint={S.loop.speedHint}
      />
      <Field label={S.loop.direction}>
        <Segmented
          value={l.clockwise ? 'cw' : 'ccw'}
          onValueChange={(v) => set('clockwise', v === 'cw')}
          options={(['cw', 'ccw'] as const).map((v) => ({ value: v, label: S.loop.directions[v] }))}
        />
      </Field>
      {l.style !== 'ring' ? (
        <>
          <ToggleField label={S.loop.trail} checked={l.trail} onChange={(v) => set('trail', v)} />
          <ToggleField label={S.loop.pulse} checked={l.pulse} onChange={(v) => set('pulse', v)} />
        </>
      ) : null}
      <ColorsFields loop />
      <div className="flex flex-col gap-1">
        <Button
          className="self-start"
          icon={<RotateCcw />}
          onClick={() => {
            const st = useLm.getState().data;
            const r = seamlessLoop(st.duration, st.loop.speed);
            edit((d) => {
              d.duration = r.duration;
            });
            requestSeek(0, true);
            setStatus('success', S.status.seamless(r.cycles, trimNumber(r.duration), r.extended));
          }}
        >
          {S.loop.fit}
        </Button>
        <p className="m-0 text-xs text-muted">{S.loop.fitHint}</p>
      </div>
    </Section>
  );
}

/** 換圖列的圖片組（F119、F122） */
async function loadRowImages(which: 'start' | 'target', files: File[]) {
  const label = which === 'start' ? S.row.startImages : S.row.targetImages;
  try {
    const r = await withBusy(S.busy.image, (progress) => addImageSet(files, progress));
    edit((d) => {
      if (which === 'start') {
        d.row.startImages = r.value.set;
        d.row.start = 'images';
      } else d.row.targetImages = r.value.set;
    });
    setMedia(which === 'start' ? { rowStart: r.value.images } : { rowTarget: r.value.images });
    setStatus(
      r.persisted ? 'success' : 'warning',
      `${r.persisted ? S.status.rowLoaded(label, r.value.images.length) : S.status.notPersisted}${
        r.skipped ? S.status.skipped(r.skipped) : ''
      }`,
    );
  } catch (e) {
    showError(e);
  }
}

function removeRowImages(which: 'start' | 'target') {
  edit((d) => {
    if (which === 'start') d.row.startImages = null;
    else d.row.targetImages = null;
  });
  setMedia(which === 'start' ? { rowStart: [] } : { rowTarget: [] });
  setStatus(
    'success',
    S.status.rowCleared(which === 'start' ? S.row.startImages : S.row.targetImages),
  );
}

function RowPanel() {
  const s = useSettings();
  const r = s.row;
  const set = <K extends keyof LmSettings['row']>(k: K, v: LmSettings['row'][K]) =>
    edit((d) => {
      d.row[k] = v;
    });
  const [allShape, setAllShape] = useState<RowShape>('circle');
  const usesRandom =
    r.order === 'random' ||
    r.targetOrder === 'random' ||
    (r.start === 'images' && r.startOrder === 'random');
  const orderOptions = IMAGE_ORDERS.map((v) => ({ value: v, label: S.row.orders[v] }));
  const fitOptions = (['contain', 'cover'] as const).map((v) => ({
    value: v,
    label: S.row.fits[v],
  }));
  return (
    <>
      <Section title={S.row.sectionStart} persistKey="loading-maker:row-start">
        <Field label={S.row.startMode}>
          <Segmented
            fullWidth
            value={r.start}
            onValueChange={(v) => set('start', v)}
            options={(['shape', 'images'] as const).map((v) => ({
              value: v,
              label: S.row.startModes[v],
            }))}
          />
        </Field>
        {r.start === 'images' ? (
          <>
            <ImageSetDrop
              testId="row-start"
              label={S.row.startImages}
              set={r.startImages}
              emptyHint={S.row.startEmptyHint}
              onFiles={(files) => void loadRowImages('start', files)}
              onRemove={() => removeRowImages('start')}
            />
            <FieldRow>
              <Field label={S.row.startOrder}>
                <Select<ImageOrder>
                  value={r.startOrder}
                  onValueChange={(v) => set('startOrder', v)}
                  options={orderOptions}
                />
              </Field>
              <Field label={S.row.startFit} hint={S.row.fitHint}>
                <Segmented
                  value={r.startFit}
                  onValueChange={(v) => set('startFit', v)}
                  options={fitOptions}
                />
              </Field>
            </FieldRow>
          </>
        ) : null}
      </Section>
      <Section title={S.row.sectionTarget} persistKey="loading-maker:row-target">
        <ImageSetDrop
          testId="row-target"
          label={S.row.targetImages}
          set={r.targetImages}
          emptyHint={S.row.targetEmptyHint}
          onFiles={(files) => void loadRowImages('target', files)}
          onRemove={() => removeRowImages('target')}
        />
        <FieldRow>
          <Field label={S.row.targetOrder}>
            <Select<ImageOrder>
              value={r.targetOrder}
              onValueChange={(v) => set('targetOrder', v)}
              options={orderOptions}
            />
          </Field>
          <Field label={S.row.targetFit} hint={S.row.fitHint}>
            <Segmented
              value={r.targetFit}
              onValueChange={(v) => set('targetFit', v)}
              options={fitOptions}
            />
          </Field>
        </FieldRow>
      </Section>
      <Section title={S.row.sectionPlay} persistKey="loading-maker:row-play">
        <Field label={S.row.mode} hint={S.row.modeHint}>
          <Segmented
            fullWidth
            value={r.mode}
            onValueChange={(v) => set('mode', v)}
            options={(['progress', 'loop'] as const).map((v) => ({
              value: v,
              label: S.row.modes[v],
            }))}
          />
        </Field>
        <Field label={S.row.pattern} hint={S.row.patternHint}>
          <Segmented
            fullWidth
            value={r.pattern}
            onValueChange={(v) => set('pattern', v)}
            options={ROW_PATTERNS.map((v) => ({ value: v, label: S.row.patterns[v] }))}
          />
        </Field>
        <Field label={S.row.order}>
          <Select<ImageOrder>
            value={r.order}
            onValueChange={(v) => set('order', v)}
            options={IMAGE_ORDERS.map((v) => ({ value: v, label: S.row.changeOrders[v] }))}
          />
        </Field>
        {usesRandom ? (
          <>
            <SliderField
              label={S.row.repeats}
              value={r.repeats}
              onChange={(v) => set('repeats', Math.round(v))}
              range={RANGE.repeats}
              hint={S.row.repeatsHint}
            />
            <SeedField />
          </>
        ) : null}
      </Section>
      <Section title={S.row.sectionLayout} persistKey="loading-maker:row-layout">
        <SliderField
          label={S.row.count}
          value={r.count}
          onChange={(v) => set('count', Math.round(v))}
          range={RANGE.rowCount}
        />
        <SliderField
          label={S.row.length}
          value={r.length}
          onChange={(v) => set('length', v)}
          range={RANGE.rowLength}
          unit="%"
        />
        <SliderField
          label={S.row.size}
          value={r.size}
          onChange={(v) => set('size', v)}
          range={RANGE.rowSize}
          unit="px"
          hint={S.row.sizeHint}
        />
      </Section>
      <Section title={S.row.sectionColor} persistKey="loading-maker:row-color">
        <FieldRow>
          <ColorRow
            label={S.row.baseColor}
            value={s.loader.trackColor}
            onChange={(v) =>
              edit((d) => {
                d.loader.trackColor = v;
              })
            }
          />
          <ColorRow
            label={S.row.targetColor}
            value={s.loader.fillColor}
            onChange={(v) =>
              edit((d) => {
                d.loader.fillColor = v;
              })
            }
          />
        </FieldRow>
        <BorderFields />
      </Section>
      <Section
        title={S.row.sectionShapes}
        description={
          r.start === 'images' ? S.row.shapesCountImages(r.count) : S.row.shapesCount(r.count)
        }
        persistKey="loading-maker:row-shapes"
      >
        <ol
          className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2 p-0"
          data-testid="row-shapes"
        >
          {r.shapes.map((shape, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 每個位置一列
            <li key={i} className="flex min-w-0 items-center gap-2">
              <span className="w-10 shrink-0 text-xs text-muted">{S.row.shapeAt(i + 1)}</span>
              <Select<RowShape>
                aria-label={S.row.shapeAt(i + 1)}
                size="sm"
                value={shape}
                onValueChange={(v) =>
                  edit((d) => {
                    d.row.shapes[i] = v;
                  })
                }
                options={ROW_SHAPES.map((v) => ({ value: v, label: S.row.shapes[v] }))}
                className="min-w-0 flex-1"
              />
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap items-end gap-2">
          <Field label={S.row.applyAllShape}>
            <Select<RowShape>
              value={allShape}
              onValueChange={setAllShape}
              options={ROW_SHAPES.map((v) => ({ value: v, label: S.row.shapes[v] }))}
            />
          </Field>
          <Button
            onClick={() => {
              edit((d) => {
                d.row.shapes = d.row.shapes.map(() => allShape);
              });
              setStatus('success', S.status.shapesAll(S.row.shapes[allShape]));
            }}
          >
            {S.row.applyAll}
          </Button>
        </div>
      </Section>
    </>
  );
}

export function LoaderPanel() {
  const s = useSettings();
  const ld = s.loader;
  const set = <K extends keyof LmSettings['loader']>(k: K, v: LmSettings['loader'][K]) =>
    edit((d) => {
      d.loader[k] = v;
    });
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.loader.sectionType} persistKey="loading-maker:loader">
        <Field label={S.loader.type}>
          <Segmented
            fullWidth
            value={ld.type}
            onValueChange={(v) => set('type', v)}
            options={LOADER_TYPES.map((v) => ({ value: v, label: S.loader.types[v] }))}
          />
        </Field>
        {ld.type !== 'none' ? (
          <>
            <SliderField
              label={S.loader.x}
              value={ld.x}
              onChange={(v) => set('x', v)}
              range={RANGE.loaderPos}
              input={RANGE.posInput}
              unit="%"
            />
            <SliderField
              label={S.loader.y}
              value={ld.y}
              onChange={(v) => set('y', v)}
              range={RANGE.loaderPos}
              input={RANGE.posInput}
              unit="%"
            />
            <ToggleField label={S.loader.glow} checked={ld.glow} onChange={(v) => set('glow', v)} />
            <Show when={ld.glow}>
              <ColorRow
                label={S.loader.glowColor}
                value={ld.glowColor}
                onChange={(v) => set('glowColor', v)}
              />
              <SliderField
                label={S.loader.glowBlur}
                value={ld.glowBlur}
                onChange={(v) => set('glowBlur', v)}
                range={RANGE.glowBlur}
                unit="px"
              />
            </Show>
          </>
        ) : null}
      </Section>
      {ld.type === 'bar' ? <BarPanel /> : null}
      {ld.type === 'loop' ? <LoopPanel /> : null}
      {ld.type === 'row' ? <RowPanel /> : null}
    </div>
  );
}

/* ---------- 文字 ---------- */

/** 本機字型（F135）：上傳後上下兩段文字都改用它 */
export async function applyFontFile(file: File) {
  try {
    const meta = await withBusy(S.busy.font, async () => uploadFont(file));
    edit((d) => {
      for (const b of [d.text.top, d.text.bottom])
        b.font = { source: 'upload', family: meta.family, weight: b.font.weight };
    });
    setStatus('success', S.status.fontApplied(meta.family));
    return meta;
  } catch (e) {
    showError(e);
    return null;
  }
}

function TextBlockSection({ which }: { which: 'top' | 'bottom' }) {
  const block = useLm((st) => st.data.text[which]);
  const set = <K extends keyof TextBlock>(k: K, v: TextBlock[K]) =>
    edit((d) => {
      d.text[which][k] = v;
    });
  return (
    <Section title={S.text[which]} persistKey={`loading-maker:text-${which}`}>
      <ToggleField
        label={S.text.enabled}
        checked={block.enabled}
        onChange={(v) => set('enabled', v)}
      />
      <Field label={S.text.text}>
        <TextArea
          value={block.text}
          rows={2}
          onChange={(e) => set('text', e.target.value)}
          data-testid={`text-${which}`}
        />
      </Field>
      <Field label={S.text.font}>
        <FontPicker
          value={block.font}
          showWeight={false}
          previewText={S.text.previewText}
          onChange={(f) =>
            edit((d) => {
              d.text[which].font = { ...f, weight: d.text[which].font.weight };
            })
          }
        />
      </Field>
      <SliderField
        label={S.text.x}
        value={block.x}
        onChange={(v) => set('x', v)}
        range={RANGE.textX}
        input={RANGE.posInput}
        unit="%"
      />
      <SliderField
        label={S.text.y}
        value={block.y}
        onChange={(v) => set('y', v)}
        range={RANGE.textY}
        input={RANGE.posInput}
        unit="%"
      />
      <SliderField
        label={S.text.size}
        value={block.size}
        onChange={(v) => set('size', v)}
        range={RANGE.textSize}
        unit="px"
      />
      <SliderField
        label={S.text.weight}
        value={block.font.weight}
        onChange={(v) =>
          edit((d) => {
            d.text[which].font.weight = clampTo(Math.round(v / 50) * 50, RANGE.weight);
          })
        }
        range={RANGE.weight}
        step={50}
      />
      <SliderField
        label={S.text.spacing}
        value={block.spacing}
        onChange={(v) => set('spacing', v)}
        range={RANGE.spacing}
        step={0.5}
        unit="px"
        hint={S.text.spacingHint}
      />
      <SliderField
        label={S.text.rotation}
        value={block.rotation}
        onChange={(v) => set('rotation', v)}
        range={RANGE.rotation}
        unit="°"
      />
      <FieldRow>
        <ColorRow label={S.text.color} value={block.color} onChange={(v) => set('color', v)} />
        <ColorRow
          label={S.text.strokeColor}
          value={block.strokeColor}
          onChange={(v) => set('strokeColor', v)}
        />
      </FieldRow>
      <SliderField
        label={S.text.strokeWidth}
        value={block.strokeWidth}
        onChange={(v) => set('strokeWidth', v)}
        range={RANGE.textStroke}
        step={0.5}
        unit="px"
      />
    </Section>
  );
}

export function TextPanel() {
  const top = useLm((st) => st.data.text.top.font);
  const bottom = useLm((st) => st.data.text.bottom.font);
  const shared =
    top.source === 'upload' && bottom.source === 'upload' && top.family === bottom.family;
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.text.sectionFont} persistKey="loading-maker:text-font">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            icon={<Upload />}
            onClick={async () => {
              const [file] = await pickFiles({ accept: FONT_FILE_ACCEPT });
              if (file) await applyFontFile(file);
            }}
          >
            {S.text.fontUpload}
          </Button>
          <span className="min-w-0 break-all text-xs text-muted" data-testid="font-info">
            {shared ? S.text.fontApplied(top.family) : S.text.fontUploadHint}
          </span>
        </div>
      </Section>
      <TextBlockSection which="top" />
      <TextBlockSection which="bottom" />
    </div>
  );
}

/* ---------- 畫布 ---------- */

export function CanvasPanel() {
  const c = useLm((st) => st.data.canvas);
  const set = <K extends keyof LmSettings['canvas']>(k: K, v: LmSettings['canvas'][K]) =>
    edit((d) => {
      d.canvas[k] = v;
    });
  const preset = SIZE_PRESETS.find((p) => p.w === c.width && p.h === c.height);
  const presetValue = preset ? `${preset.w}x${preset.h}` : 'custom';
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.canvas.sectionSize} persistKey="loading-maker:canvas-size">
        <Field label={S.canvas.preset}>
          <Select
            value={presetValue}
            onValueChange={(v) => {
              if (v === 'custom') return;
              const [w, h] = v.split('x').map(Number);
              edit((d) => {
                d.canvas.width = w;
                d.canvas.height = h;
              });
            }}
            options={[
              ...SIZE_PRESETS.map((p) => ({
                value: `${p.w}x${p.h}`,
                label: S.canvas.presets(p.w, p.h),
              })),
              { value: 'custom', label: S.canvas.custom },
            ]}
          />
        </Field>
        <FieldRow>
          <Field label={S.canvas.width}>
            <NumberInput
              value={c.width}
              onChange={(v) => set('width', Math.round(v))}
              min={RANGE.canvasSide[0]}
              max={RANGE.canvasSide[1]}
              precision={0}
              unit="px"
            />
          </Field>
          <Field label={S.canvas.height}>
            <NumberInput
              value={c.height}
              onChange={(v) => set('height', Math.round(v))}
              min={RANGE.canvasSide[0]}
              max={RANGE.canvasSide[1]}
              precision={0}
              unit="px"
            />
          </Field>
        </FieldRow>
      </Section>
      <Section title={S.canvas.sectionBackground} persistKey="loading-maker:canvas-bg">
        <ToggleField
          label={S.canvas.transparent}
          checked={c.transparent}
          onChange={(v) => set('transparent', v)}
          hint={S.canvas.transparentHint}
        />
        <ColorRow
          label={S.canvas.background}
          value={c.background}
          onChange={(v) => set('background', v)}
          hint={S.canvas.backgroundHint}
        />
      </Section>
      <Section title={S.canvas.sectionSnap} persistKey="loading-maker:canvas-snap">
        <ToggleField
          label={S.canvas.snapCanvas}
          checked={c.snapCanvas}
          onChange={(v) => set('snapCanvas', v)}
          hint={S.canvas.snapCanvasHint}
        />
        <ToggleField
          label={S.canvas.snapItems}
          checked={c.snapItems}
          onChange={(v) => set('snapItems', v)}
          hint={S.canvas.snapItemsHint}
        />
      </Section>
    </div>
  );
}
