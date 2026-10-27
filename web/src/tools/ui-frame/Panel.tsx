/**
 * 設定欄（規格 1.1～1.6）：用途、世界觀預設與我的預設、外觀（配色、外框、質感與字型、尺寸與按鈕、翻頁游標與系統按鈕）、測試文字。
 */
import { Download, FileJson, RotateCcw } from 'lucide-react';
import { useCallback } from 'react';
import { downloadText, fileNameWithExt } from '@/core/files';
import {
  Button,
  ColorField,
  Field,
  FileDrop,
  GestureScope,
  IconButton,
  ItemListEditor,
  Section,
  Segmented,
  Select,
  Slider,
  TextArea,
  TextInput,
  ThumbChoice,
  Toggle,
  useToast,
} from '@/ui';
import {
  MINE_MAX,
  type MyPreset,
  presetsFileBase,
  presetsFileText,
  readPresetFiles,
  useMine,
} from './mine';
import {
  BUTTON_LANGS,
  type ButtonLang,
  CORNER_STYLES,
  type CornerStyle,
  CURSOR_SHAPES,
  type CursorShape,
  type Design,
  FONT_IDS,
  type FontId,
  MODES,
  type Mode,
  MULTILINE_TEXTS,
  ORNAMENTS,
  type Ornament,
  POLARITIES,
  type Polarity,
  PRESETS,
  QUICK_COLORS,
  RANGES,
  type RangeKey,
  sameDesign,
  TEXT_MAX,
  TEXTURES,
  type TextKey,
  type Texture,
  tidyText,
} from './model';
import {
  applyMine,
  applyPreset,
  docNow,
  edit,
  gesture,
  importMine,
  removeMine,
  renameMine,
  resetDesignToBase,
  resetField,
  saveMine,
  setMode,
  useDoc,
  useSession,
} from './store';
import { S } from './strings';
import {
  drawCornerThumb,
  drawCursorThumb,
  drawOrnamentThumb,
  drawPresetThumb,
  drawTextureThumb,
  THUMB_H,
  THUMB_W,
} from './thumbs';

/* ---------- 共用 ---------- */

function setDesign<K extends keyof Design>(key: K, value: Design[K]) {
  edit((d) => {
    d.design[key] = value;
  });
}

/** 和原始值不同時，標籤旁出現「回到原始值」 */
function ResetButton({ k, label }: { k: keyof Design; label: string }) {
  const changed = useDoc((s) => s.data.design[k] !== s.data.base.design[k]);
  if (!changed) return null;
  return (
    <IconButton
      size="sm"
      variant="ghost"
      icon={<RotateCcw />}
      label={S.resetValue(label)}
      data-reset={k}
      onClick={() => resetField(k)}
    />
  );
}

const UNITS: Record<RangeKey, string> = {
  bgOpacity: '%',
  cornerSize: 'px',
  borderWidth: 'px',
  innerOffset: 'px',
  ornamentScale: '%',
  textureAlpha: '%',
  msgW: 'px',
  msgH: 'px',
  choiceW: 'px',
  hoverGlow: 'px',
  activeShift: 'px',
};

/** 數值欄：滑桿放開才記一步；按兩下滑桿回到原始值 */
function RangeField({ k, label, hint }: { k: RangeKey; label: string; hint?: string }) {
  const value = useDoc((s) => s.data.design[k]);
  const r = RANGES[k];
  return (
    <Field label={label} hint={hint} labelSuffix={<ResetButton k={k} label={label} />}>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 按兩下回到原始值是滑鼠的捷徑；鍵盤用標籤旁的按鈕 */}
      <div data-range={k} onDoubleClick={() => resetField(k)}>
        <Slider
          value={value}
          min={r.min}
          max={r.max}
          step={r.step}
          unit={UNITS[k]}
          onChange={gesture.live((v: number) => setDesign(k, v))}
          onCommit={gesture.commit}
        />
      </div>
    </Field>
  );
}

/* ---------- 用途 ---------- */

export function ModeSwitch() {
  const mode = useDoc((s) => s.data.mode);
  return (
    <Field label={S.modeLabel} hint={S.modeHints[mode]}>
      <Segmented<Mode>
        value={mode}
        onValueChange={setMode}
        options={MODES.map((m) => ({ value: m, label: S.modes[m] }))}
        fullWidth
      />
    </Field>
  );
}

/* ---------- 世界觀 ---------- */

function BaseStatus() {
  const base = useDoc((s) => s.data.base);
  const changed = useDoc((s) => !sameDesign(s.data.design, s.data.base.design));
  const toast = useToast();
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="base-status">
      <p className="m-0 min-w-0 flex-1 text-sm text-muted" data-changed={changed}>
        {base.kind === 'mine'
          ? S.baseStatusMine(base.name, changed)
          : S.baseStatus(base.name, changed)}
      </p>
      {changed ? (
        <Button
          size="sm"
          icon={<RotateCcw />}
          onClick={() => {
            resetDesignToBase();
            toast({ title: S.backToBaseDone(base.name), tone: 'success' });
          }}
        >
          {S.backToBase}
        </Button>
      ) : null}
    </div>
  );
}

function PresetSection() {
  const base = useDoc((s) => s.data.base);
  const tick = useSession((s) => s.tick);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 字型載好（tick）時重畫縮圖
  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, id: string) => {
      const p = PRESETS.find((x) => x.id === id);
      if (p) drawPresetThumb(ctx, p);
    },
    [tick],
  );
  return (
    <Section title={S.presetSection} description={S.presetNote} persistKey="ui-frame:presets">
      <ThumbChoice<string>
        aria-label={S.presetAria}
        options={PRESETS.map((p) => ({
          value: p.id,
          label: S.presets[p.id].name,
          description: S.presets[p.id].desc,
        }))}
        value={base.kind === 'preset' ? base.id : ''}
        onValueChange={applyPreset}
        draw={draw}
        thumbWidth={THUMB_W}
        thumbHeight={THUMB_H}
        minItemWidth={120}
        renderMeta={(o) => <span className="text-xs text-muted">{o.description}</span>}
      />
      <BaseStatus />
    </Section>
  );
}

function exportPresets(items: readonly MyPreset[]): void {
  if (!items.length) return;
  downloadText(
    presetsFileText(items),
    fileNameWithExt(presetsFileBase(items), 'json', { fallback: 'ui-frame-presets' }),
    'application/json;charset=utf-8',
  );
}

function MineSection() {
  const toast = useToast();
  const items = useMine((s) => s.data.items);
  const base = useDoc((s) => s.data.base);
  const unchanged = useDoc((s) => sameDesign(s.data.design, s.data.base.design));
  const activeId = base.kind === 'mine' && unchanged ? base.id : null;

  const onFiles = async (files: File[]) => {
    if (!files.length) return;
    const r = await readPresetFiles(files);
    const { added, dropped } = importMine(r.parsed);
    const lines: string[] = [];
    if (r.skipped) lines.push(S.mine.skipped(r.skipped));
    if (dropped) lines.push(S.mine.dropped(dropped));
    for (const f of r.failures) lines.push(`${f.name}：${f.message}`);
    const bad = r.failures.length;
    toast({
      title: !bad
        ? S.mine.imported(added)
        : added
          ? S.mine.importedPart(added, bad)
          : S.mine.importFailed(bad),
      description: lines.length
        ? lines.map((l) => (
            <span key={l} className="block">
              {l}
            </span>
          ))
        : undefined,
      tone: !bad && !dropped ? 'success' : added ? 'warning' : 'danger',
    });
  };

  return (
    <Section title={S.mine.title} description={S.mine.note} persistKey="ui-frame:mine">
      <ItemListEditor<MyPreset>
        aria-label={S.mine.listLabel}
        items={items}
        getId={(t) => t.id}
        getName={(t) => t.name}
        placeholder={S.mine.unnamed}
        renameLabel={S.mine.rename}
        selectedId={activeId}
        onAdd={() => {
          const s = docNow();
          const name = saveMine(s.base.name);
          if (name) toast({ title: S.mine.saved(name), tone: 'success' });
          else toast({ title: S.mine.full(MINE_MAX), tone: 'warning' });
        }}
        addLabel={S.mine.add}
        onRename={renameMine}
        onRemove={removeMine}
        confirmRemove={(t) => ({
          title: S.mine.removeTitle(t.name.trim() || S.mine.unnamed),
          description: S.mine.removeDesc,
        })}
        renderLeading={(t) => (
          <span
            aria-hidden
            className="size-6 shrink-0 rounded-sm border border-border"
            style={{ background: t.design.keyColor }}
          />
        )}
        renderMeta={(t) => (
          <span className="block truncate">
            {S.mine.meta(S.polarities[t.design.polarity], t.design.keyColor)}
          </span>
        )}
        renderActions={(t) => (
          <>
            <Button
              size="sm"
              variant={t.id === activeId ? 'primary' : 'secondary'}
              aria-pressed={t.id === activeId}
              aria-label={S.mine.applyLabel(t.name.trim() || S.mine.unnamed)}
              onClick={() => applyMine(t.id)}
            >
              {t.id === activeId ? S.mine.applied : S.mine.apply}
            </Button>
            <IconButton
              size="sm"
              icon={<Download />}
              label={S.mine.exportOne(t.name.trim() || S.mine.unnamed)}
              onClick={() => exportPresets([t])}
            />
          </>
        )}
        emptyText={S.mine.empty}
      />
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          icon={<Download />}
          disabled={!items.length}
          onClick={() => exportPresets(items)}
        >
          {S.mine.exportAll(items.length)}
        </Button>
      </div>
      <FileDrop
        compact
        multiple
        accept=".json,application/json"
        paste="off"
        icon={<FileJson />}
        label={S.mine.dropLabel}
        buttonLabel={S.mine.dropButton}
        aria-label={S.mine.dropLabel}
        onFiles={(files) => void onFiles(files)}
      />
    </Section>
  );
}

export function StylePanel() {
  return (
    <div className="flex flex-col gap-3">
      <PresetSection />
      <MineSection />
    </div>
  );
}

/* ---------- 外觀 ---------- */

function useThumb<V extends string>(
  fn: (ctx: CanvasRenderingContext2D, d: Design, v: V) => void,
): (ctx: CanvasRenderingContext2D, v: V) => void {
  const design = useDoc((s) => s.data.design);
  const tick = useSession((s) => s.tick);
  // biome-ignore lint/correctness/useExhaustiveDependencies: 設定或字型（tick）改變時重畫縮圖
  return useCallback((ctx, v) => fn(ctx, design, v), [design, tick, fn]);
}

function ColorSection() {
  const keyColor = useDoc((s) => s.data.design.keyColor);
  const polarity = useDoc((s) => s.data.design.polarity);
  return (
    <Section title={S.colorSection} persistKey="ui-frame:color">
      <Field
        label={S.keyColor}
        hint={S.keyColorHint}
        labelSuffix={<ResetButton k="keyColor" label={S.keyColor} />}
      >
        <GestureScope gesture={gesture}>
          <ColorField
            value={keyColor}
            onChange={(v) => setDesign('keyColor', v.slice(0, 7).toLowerCase())}
            swatches={QUICK_COLORS}
          />
        </GestureScope>
      </Field>
      {/* biome-ignore lint/a11y/useSemanticElements: 一組按鈕（不是表單欄位） */}
      <div role="group" aria-label={S.quickColors} className="flex flex-wrap gap-1.5">
        {QUICK_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={S.quickColor(c)}
            aria-pressed={keyColor === c}
            title={c}
            className="size-7 rounded-sm border border-border-strong focus-visible:focus-ring aria-pressed:outline-2 aria-pressed:outline-offset-2 aria-pressed:outline-accent"
            style={{ background: c }}
            onClick={() => setDesign('keyColor', c)}
          />
        ))}
      </div>
      <Field label={S.polarity} labelSuffix={<ResetButton k="polarity" label={S.polarity} />}>
        <Segmented<Polarity>
          value={polarity}
          onValueChange={(v) => setDesign('polarity', v)}
          options={POLARITIES.map((p) => ({ value: p, label: S.polarities[p] }))}
          fullWidth
        />
      </Field>
      <RangeField k="bgOpacity" label={S.bgOpacity} />
    </Section>
  );
}

function FrameSection() {
  const corner = useDoc((s) => s.data.design.corner);
  const ornament = useDoc((s) => s.data.design.ornament);
  const drawCorner = useThumb<CornerStyle>(drawCornerThumb);
  const drawOrnament = useThumb<Ornament>(drawOrnamentThumb);
  return (
    <Section title={S.frameSection} persistKey="ui-frame:frame">
      <Field label={S.corner} labelSuffix={<ResetButton k="corner" label={S.corner} />}>
        <ThumbChoice<CornerStyle>
          options={CORNER_STYLES.map((c) => ({ value: c, label: S.corners[c] }))}
          value={corner}
          onValueChange={(v) => setDesign('corner', v)}
          draw={drawCorner}
          thumbWidth={THUMB_W}
          thumbHeight={THUMB_H}
          minItemWidth={84}
        />
      </Field>
      <Field label={S.ornament} labelSuffix={<ResetButton k="ornament" label={S.ornament} />}>
        <ThumbChoice<Ornament>
          options={ORNAMENTS.map((o) => ({ value: o, label: S.ornaments[o] }))}
          value={ornament}
          onValueChange={(v) => setDesign('ornament', v)}
          draw={drawOrnament}
          thumbWidth={THUMB_W}
          thumbHeight={THUMB_H}
          minItemWidth={84}
        />
      </Field>
      <RangeField k="cornerSize" label={S.cornerSize} />
      <RangeField k="borderWidth" label={S.borderWidth} />
      <RangeField k="innerOffset" label={S.innerOffset} hint={S.innerOffsetHint} />
      <RangeField k="ornamentScale" label={S.ornamentScale} />
      <p className="m-0 text-xs text-muted">{S.resetValueHint}</p>
    </Section>
  );
}

function TextureSection() {
  const texture = useDoc((s) => s.data.design.texture);
  const font = useDoc((s) => s.data.design.font);
  const fontState = useSession((s) => s.font);
  const drawTexture = useThumb<Texture>(drawTextureThumb);
  return (
    <Section title={S.textureSection} persistKey="ui-frame:texture">
      <Field label={S.texture} labelSuffix={<ResetButton k="texture" label={S.texture} />}>
        <ThumbChoice<Texture>
          options={TEXTURES.map((t) => ({ value: t, label: S.textures[t] }))}
          value={texture}
          onValueChange={(v) => setDesign('texture', v)}
          draw={drawTexture}
          thumbWidth={THUMB_W}
          thumbHeight={THUMB_H}
          minItemWidth={84}
        />
      </Field>
      <RangeField k="textureAlpha" label={S.textureAlpha} />
      <Field
        label={S.font}
        hint={
          <>
            {S.fontHint}
            {fontState !== 'ready' ? (
              <span className="mt-1 block" data-testid="font-state" data-state={fontState}>
                {fontState === 'loading' ? S.fontLoading : S.fontFallback}
              </span>
            ) : null}
          </>
        }
        labelSuffix={<ResetButton k="font" label={S.font} />}
      >
        <Select<FontId>
          value={font}
          onValueChange={(v) => setDesign('font', v)}
          options={FONT_IDS.map((f) => ({ value: f, label: S.fonts[f] }))}
        />
      </Field>
    </Section>
  );
}

function SizeSection() {
  return (
    <Section
      title={S.sizeSection}
      description={S.sizeNote}
      persistKey="ui-frame:size"
      defaultOpen={false}
    >
      <RangeField k="msgW" label={S.msgW} />
      <RangeField k="msgH" label={S.msgH} />
      <RangeField k="choiceW" label={S.choiceW} />
      <RangeField k="hoverGlow" label={S.hoverGlow} />
      <RangeField k="activeShift" label={S.activeShift} />
    </Section>
  );
}

function NovelSection() {
  const cursor = useDoc((s) => s.data.design.cursor);
  const lang = useDoc((s) => s.data.design.buttonLang);
  const drawCursor = useThumb<CursorShape>(drawCursorThumb);
  return (
    <Section title={S.novelSection} persistKey="ui-frame:novel">
      <Field
        label={S.cursor}
        hint={S.cursorHint}
        labelSuffix={<ResetButton k="cursor" label={S.cursor} />}
      >
        <ThumbChoice<CursorShape>
          options={CURSOR_SHAPES.map((c) => ({ value: c, label: S.cursors[c] }))}
          value={cursor}
          onValueChange={(v) => setDesign('cursor', v)}
          draw={drawCursor}
          thumbWidth={THUMB_W}
          thumbHeight={THUMB_H}
          minItemWidth={84}
        />
      </Field>
      <Field label={S.buttonLang} labelSuffix={<ResetButton k="buttonLang" label={S.buttonLang} />}>
        <Segmented<ButtonLang>
          value={lang}
          onValueChange={(v) => setDesign('buttonLang', v)}
          options={BUTTON_LANGS.map((l) => ({ value: l, label: S.buttonLangs[l] }))}
          fullWidth
        />
      </Field>
    </Section>
  );
}

export function DesignPanel() {
  const mode = useDoc((s) => s.data.mode);
  return (
    <div className="flex flex-col gap-3">
      <ColorSection />
      <FrameSection />
      <TextureSection />
      {mode === 'novel' ? <NovelSection /> : null}
      <SizeSection />
    </div>
  );
}

/* ---------- 測試文字 ---------- */

function TextField({ k }: { k: TextKey }) {
  const value = useDoc((s) => s.data.texts[k]);
  const multi = MULTILINE_TEXTS.includes(k);
  const props = {
    value,
    onFocus: gesture.begin,
    onBlur: gesture.commit,
    onChange: (e: { target: { value: string } }) => {
      const v = tidyText(k, e.target.value);
      edit((d) => {
        d.texts[k] = v;
      });
    },
    'data-text': k,
  };
  return (
    <Field
      label={S.textLabels[k]}
      labelSuffix={
        <span className="text-xs text-muted tabular-nums">
          {S.count(Array.from(value).length, TEXT_MAX[k])}
        </span>
      }
    >
      {multi ? <TextArea rows={3} {...props} /> : <TextInput autoComplete="off" {...props} />}
    </Field>
  );
}

export function TextPanel() {
  const mode = useDoc((s) => s.data.mode);
  const bake = useDoc((s) => s.data.texts.bake);
  return (
    <div className="flex flex-col gap-3">
      <p className="m-0 text-sm text-muted">{S.textNote}</p>
      {mode === 'novel' ? (
        <Section title={S.novelTextSection} description={S.novelTextHint}>
          {(['charName', 'line', 'choice1', 'choice2', 'choice3'] as const).map((k) => (
            <TextField key={k} k={k} />
          ))}
        </Section>
      ) : (
        <Section title={S.trpgTextSection}>
          {(['portraitName', 'status1', 'status2', 'status3', 'dice', 'board'] as const).map(
            (k) => (
              <TextField key={k} k={k} />
            ),
          )}
          <Field label={S.bake} hint={S.bakeHint} layout="inline">
            <Toggle
              checked={bake}
              onCheckedChange={(v) =>
                edit((d) => {
                  d.texts.bake = v;
                })
              }
            />
          </Field>
        </Section>
      )}
    </div>
  );
}
