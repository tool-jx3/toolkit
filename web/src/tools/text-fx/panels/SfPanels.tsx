/**
 * SF 標題模式（2026-10-26）的設定分頁：模式（範本、我的範本、播放方式）、文字（標題、副文字、代碼、編號）、
 * 樣式（主色、強調色、字型、光暈、顆粒雜訊、掃描線、故障）、裝飾（說明）、時間與尺寸（比例、寬度、fps、長度）。
 */
import { RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { frameCount } from '@/core/timeline';
import {
  Button,
  ColorField,
  cn,
  Field,
  FieldRow,
  NumberInput,
  Section,
  Segmented,
  Select,
  TextInput,
  ThumbChoice,
  useConfirm,
} from '@/ui';
import { getPath, NumField, SegField, setCfg, ToggleField, useCfg } from '../controls';
import { loadFonts, sfFontLoads } from '../fonts';
import type { Scene } from '../scene';
import type { Settings } from '../settings';
import {
  SF_ACCENT_SWATCHES,
  SF_CJK_FONTS,
  SF_FPS_CHOICES,
  SF_LATIN_FONTS,
  SF_LIMITS,
  SF_MAIN_SWATCHES,
  SF_PLAYS,
  SF_RATIOS,
  SF_TEMPLATES,
  SF_WIDTHS,
  type SfPlay,
  type SfTemplateId,
  sfAutoCode,
  sfHeight,
  sfOf,
  sfPlayOf,
  sfSizeOf,
} from '../sf';
import { SfPainter } from '../sfDraw';
import { applyTemplate, resetTemplate, updateCfg } from '../store';
import { S } from '../strings';
import { MinePanel } from './MinePanel';
import { ModeSection } from './ModePanel';

/** 範本縮圖的像素（3:1，同設計空間的比例） */
const THUMB_W = 300;
const THUMB_H = 100;

/** 這組設定的字型載好之後加 1（縮圖重畫用） */
function useSfFontTick(cfg: Settings): number {
  const loads = useMemo(() => sfFontLoads(cfg), [cfg]);
  const key = JSON.stringify(loads.map((l) => [l.family, l.weight, l.text]));
  const [tick, setTick] = useState(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在要載入的字型改變時重新載入
  useEffect(() => {
    let alive = true;
    void loadFonts(loads, 12000).then(() => {
      if (alive) setTick((n) => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [key]);
  return tick;
}

function SfTemplateSection() {
  const c = useCfg();
  const confirm = useConfirm();
  const tick = useSfFontTick(c);
  const painter = useMemo(() => new SfPainter(), []);
  const sf = sfOf(c);
  /* 縮圖：目前的文字與樣式套上每個範本，畫停留中的樣子（滑鼠移上去時播放） */
  // biome-ignore lint/correctness/useExhaustiveDependencies: tick 只用來在字型載入後重畫
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, value: SfTemplateId, t: number) =>
      painter.draw(ctx, c, t * sf.dur, THUMB_W, THUMB_H, { idle: true, tpl: value }),
    [c, sf.dur, painter, tick],
  );
  return (
    <Section
      title={S.sf.tplTitle}
      description={S.sf.tplNote}
      persistKey="text-fx:sf-template"
      actions={
        <Button
          size="sm"
          variant="ghost"
          icon={<RotateCcw />}
          onClick={async () => {
            if (
              await confirm({
                title: S.template.reset,
                description: S.sf.resetConfirm,
                confirmLabel: '重設',
              })
            )
              resetTemplate();
          }}
        >
          {S.template.reset}
        </Button>
      }
    >
      <div data-thumbs-ready="true" data-testid="sf-templates">
        <ThumbChoice<SfTemplateId>
          aria-label={S.sf.tplLabel}
          options={SF_TEMPLATES.map((t) => ({ value: t.id, label: t.name, description: t.note }))}
          value={sf.tpl}
          onValueChange={(id) => applyTemplate(id)}
          draw={draw}
          thumbWidth={THUMB_W}
          thumbHeight={THUMB_H}
          minItemWidth={136}
          stillTime={0.3}
          fps={c.fps}
          frames={Math.max(2, Math.round(sf.dur * c.fps))}
        />
      </div>
    </Section>
  );
}

/** 播放方式：一次設定登場、退場開關與循環 */
function applyPlay(id: SfPlay): void {
  const p = SF_PLAYS.find((x) => x.id === id);
  if (!p) return;
  updateCfg((s) => {
    s.introOn = p.introOn;
    s.outroOn = p.outroOn;
    s.loop = p.loop;
  });
}

const loopName = (c: Settings) =>
  c.loop === 'infinite' ? '無限循環' : c.loop === 'once' ? '播放一次' : `播放 ${c.loopCount} 次`;

function SfPlaySection() {
  const c = useCfg();
  const play = sfPlayOf(c);
  const info = SF_PLAYS.find((p) => p.id === play);
  return (
    <Section title={S.sf.playTitle} fixed>
      <Field
        label={S.sf.playLabel}
        hint={info ? info.note : S.sf.playCustom(c.introOn !== false, c.outroOn, loopName(c))}
      >
        <Select
          value={play ?? ''}
          placeholder="自訂的組合"
          onValueChange={(v) => applyPlay(v as SfPlay)}
          options={SF_PLAYS.map((p) => ({ value: p.id, label: p.label }))}
        />
      </Field>
      <NumField
        label={S.sf.dur}
        path="sf.dur"
        min={2}
        max={8}
        step={0.5}
        unit="秒"
        digits={1}
        hint={S.sf.durHint}
      />
      <p className="m-0 text-xs text-muted">{S.sf.playHint}</p>
    </Section>
  );
}

/** 「模式」分頁（SF 標題） */
export function SfModePanel() {
  return (
    <div className="flex flex-col gap-3">
      <ModeSection />
      <SfTemplateSection />
      <MinePanel />
      <SfPlaySection />
    </div>
  );
}

/** 「文字」分頁（SF 標題） */
export function SfTextPanel() {
  const c = useCfg();
  const sf = sfOf(c);
  const auto = sfAutoCode(c.text);
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.sf.textTitle} fixed>
        <Field label={S.sf.title}>
          <TextInput
            value={c.text}
            maxLength={SF_LIMITS.title}
            onChange={(e) => setCfg('text', e.target.value)}
            spellCheck={false}
            placeholder={S.sf.titlePlaceholder}
            className="text-base"
          />
        </Field>
        <Field label={S.sf.sub}>
          <TextInput
            value={c.sub}
            maxLength={SF_LIMITS.sub}
            onChange={(e) => setCfg('sub', e.target.value)}
            spellCheck={false}
            placeholder={S.sf.subPlaceholder}
          />
        </Field>
        <FieldRow>
          <Field label={S.sf.code} hint={sf.code.trim() ? undefined : S.sf.codeHint(auto)}>
            <TextInput
              value={sf.code}
              maxLength={SF_LIMITS.code}
              onChange={(e) => setCfg('sf.code', e.target.value)}
              spellCheck={false}
              placeholder={auto}
            />
          </Field>
          <Field label={S.sf.num} hint={S.sf.numHint}>
            <TextInput
              value={sf.num}
              maxLength={SF_LIMITS.num}
              onChange={(e) => setCfg('sf.num', e.target.value)}
              spellCheck={false}
              placeholder="01"
            />
          </Field>
        </FieldRow>
      </Section>
    </div>
  );
}

/** 色票＋自訂色 */
function SwatchField({
  label,
  path,
  swatches,
}: {
  label: string;
  path: string;
  swatches: readonly (readonly [string, string])[];
}) {
  const c = useCfg();
  const value = String(getPath(c, path) || '#ffffff').toLowerCase();
  return (
    <Field label={label}>
      <div className="flex flex-col gap-2">
        <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
          {swatches.map(([hex, name]) => {
            const on = value === hex;
            return (
              // biome-ignore lint/a11y/useSemanticElements: 色票是一組圓形按鈕（radiogroup＋radio）
              <button
                key={hex}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={S.sf.swatchLabel(name, hex)}
                title={S.sf.swatchLabel(name, hex)}
                onClick={() => setCfg(path, hex)}
                className={cn(
                  'size-7 shrink-0 rounded-full border border-border-strong',
                  on && 'ring-2 ring-accent ring-offset-2 ring-offset-surface',
                )}
                style={{ background: hex }}
              />
            );
          })}
        </div>
        <ColorField
          aria-label={`${label}（${S.sf.custom}）`}
          value={value}
          onChange={(hex) => setCfg(path, hex)}
          swatches={swatches.map((s) => s[0])}
        />
      </div>
    </Field>
  );
}

/** 「樣式」分頁（SF 標題） */
export function SfStylePanel() {
  const c = useCfg();
  const sf = sfOf(c);
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.sf.colorTitle} fixed>
        <SwatchField label={S.sf.main} path="sf.main" swatches={SF_MAIN_SWATCHES} />
        <SwatchField label={S.sf.accent} path="sf.accent" swatches={SF_ACCENT_SWATCHES} />
      </Section>
      <Section title={S.sf.fontTitle} persistKey="text-fx:sf-font" description={S.sf.fontNote}>
        <Field label={S.sf.latin}>
          <Select
            value={sf.latin}
            onValueChange={(v) => setCfg('sf.latin', v)}
            options={SF_LATIN_FONTS.map((f) => ({ value: f, label: f }))}
          />
        </Field>
        <Field label={S.sf.cjk}>
          <Select
            value={sf.cjk}
            onValueChange={(v) => setCfg('sf.cjk', v)}
            options={SF_CJK_FONTS.map((f) => ({ value: f.id, label: f.label }))}
          />
        </Field>
      </Section>
      <Section title={S.sf.fxTitle} persistKey="text-fx:sf-fx">
        <NumField label={S.sf.glow} path="sf.glow" min={0} max={10} step={1} />
        <NumField
          label={S.sf.grain}
          path="sf.grain"
          min={0}
          max={10}
          step={1}
          hint={S.sf.grainHint}
        />
        <ToggleField label={S.sf.scan} path="sf.scan" />
        <ToggleField label={S.sf.glitch} path="sf.glitch" hint={S.sf.glitchHint} />
      </Section>
    </div>
  );
}

/** 「裝飾」分頁（SF 標題）：裝飾由範本決定 */
export function SfDecoPanel() {
  return (
    <div className="flex flex-col gap-3">
      <Section title="裝飾" fixed>
        <p className="m-0 text-sm text-muted">{S.sf.decoNote}</p>
      </Section>
    </div>
  );
}

/** 「時間與尺寸」分頁（SF 標題） */
export function SfTimePanel({ scene }: { scene: Scene }) {
  const c = useCfg();
  const sf = sfOf(c);
  const [customOpen, setCustomOpen] = useState(false);
  const cur = sfSizeOf(c.canvasW, c.canvasH);
  const ratio = customOpen || !cur ? 'custom' : cur.ratio;
  const n = frameCount(scene.duration, c.fps);
  const setSize = (r: string, w: number) => {
    const v = SF_RATIOS.find((x) => x[0] === r)?.[2] ?? 3;
    updateCfg((s) => {
      s.canvasW = w;
      s.canvasH = sfHeight(w, v);
    });
  };
  return (
    <div className="flex flex-col gap-3">
      <Section title={S.time.size} fixed>
        <Field label={S.sf.ratio}>
          <Segmented
            value={ratio}
            onValueChange={(r) => {
              if (r === 'custom') {
                setCustomOpen(true);
                return;
              }
              setCustomOpen(false);
              const w = (SF_WIDTHS as readonly number[]).includes(c.canvasW) ? c.canvasW : 960;
              setSize(r, w);
            }}
            options={[
              ...SF_RATIOS.map(([value, label]) => ({ value, label })),
              { value: 'custom', label: S.sf.customSize },
            ]}
            fullWidth
          />
        </Field>
        {ratio !== 'custom' ? (
          <Field label={S.sf.width}>
            <Segmented
              value={String(c.canvasW)}
              onValueChange={(w) => setSize(ratio, Number(w))}
              options={SF_WIDTHS.map((w) => ({ value: String(w), label: String(w) }))}
              fullWidth
            />
          </Field>
        ) : (
          <FieldRow>
            <Field label="寬">
              <NumberInput
                value={c.canvasW}
                onChange={(v) => setCfg('canvasW', Math.round(v))}
                min={16}
                max={2048}
                unit="px"
              />
            </Field>
            <Field label="高">
              <NumberInput
                value={c.canvasH}
                onChange={(v) => setCfg('canvasH', Math.round(v))}
                min={16}
                max={2048}
                unit="px"
              />
            </Field>
          </FieldRow>
        )}
        <p className="m-0 text-xs text-muted">
          {c.canvasW}×{c.canvasH}・{S.sf.sizeNote}
        </p>
      </Section>

      <Section title={S.time.timing} fixed>
        <SegField
          label="fps"
          path="fps"
          parse={Number}
          options={SF_FPS_CHOICES.map((f) => [String(f), String(f)] as const)}
        />
        <NumField
          label={S.sf.dur}
          path="sf.dur"
          min={2}
          max={8}
          step={0.5}
          unit="秒"
          digits={1}
          hint={S.sf.durHint}
        />
        <p
          className="m-0 rounded-md bg-surface-2 px-3 py-2 text-xs text-muted"
          data-testid="total-note"
        >
          總長 {scene.duration.toFixed(2)} 秒・{c.fps} fps 共 {n} 格・完成狀態在{' '}
          {scene.repTime.toFixed(2)} 秒（長度 {sf.dur} 秒）
        </p>
      </Section>
    </div>
  );
}
