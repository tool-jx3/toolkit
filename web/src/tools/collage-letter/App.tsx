import { ClipboardCopy, Code2, Download, FileImage, Shuffle, Type } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef } from 'react';
import { create } from 'zustand';
import { copyImage, copyText, downloadBlob } from '@/core/files';
import { createToolStore } from '@/core/storage';
import { createRandom } from '@/core/timeline';
import {
  Button,
  Checkbox,
  type ColorPairItem,
  ColorPairList,
  Field,
  FieldRow,
  type FontPoolItem,
  FontPoolList,
  NativeNumberInput,
  Notice,
  Section,
  Segmented,
  Stage,
  type StageBackgroundKind,
  TextArea,
  ToolShell,
  Tooltip,
  UsageSection,
  useToast,
} from '@/ui';
import {
  type Align,
  activeFonts,
  activePalettes,
  type CollageLayout,
  exportFileName,
  layoutCollage,
  layoutText,
  MARGIN,
  MAX_SEED,
  type MeasureFn,
  parseSeedParam,
  ROLL20_DEFAULT,
  ROLL20_SPIN,
  randomSeed,
  resolveRoll20Range,
  resolveSizeRange,
  resolveWidth,
  SIZE_DEFAULT,
  SIZE_LIMIT,
  toHtml,
  toRoll20,
  WIDTH_DEFAULT,
  WIDTH_LIMIT,
} from './collage';
import { DEFAULT_FONTS, DEFAULT_PALETTES } from './presets';
import { createMeasure, drawCollage, jpgBlob, pngBlob, prepareFonts } from './render';
import { S } from './strings';

/** 提示訊息約 3 秒（F39；每一則各自計時，不會被前一則提早收掉） */
const TOAST_MS = 3000;
/** 等頁面宣告的網頁字型最多幾毫秒（逾時就先用替代字型） */
const PAGE_FONTS_TIMEOUT = 8000;

interface Settings {
  text: string;
  sizeMin: string;
  sizeMax: string;
  width: string;
  autoWidth: boolean;
  align: Align;
  palettes: ColorPairItem[];
  fonts: FontPoolItem[];
  roll20Basic: boolean;
  roll20Min: string;
  roll20Max: string;
}

const INITIAL: Settings = {
  /* 開頁自動填入範例信（F01） */
  text: S.sampleLetter,
  sizeMin: String(SIZE_DEFAULT.min),
  sizeMax: String(SIZE_DEFAULT.max),
  width: String(WIDTH_DEFAULT),
  autoWidth: false,
  align: 'center',
  palettes: [...DEFAULT_PALETTES],
  fonts: [...DEFAULT_FONTS],
  roll20Basic: true,
  roll20Min: String(ROLL20_DEFAULT.min),
  roll20Max: String(ROLL20_DEFAULT.max),
};

/** 規格 F44：不保留任何設定，重新整理後回到預設 */
const useSettings = createToolStore<Settings>('collage-letter', INITIAL, { persist: false });

type Phase = 'loading' | 'busy' | 'idle';

/** 執行狀態：最後一次產生的排版（預覽、下載、複製都用這一份） */
const useRun = create<{ layout: CollageLayout | null; phase: Phase; count: number }>(() => ({
  layout: null,
  phase: 'loading',
  /** 已產生幾次（畫布的 data-generation，給測試等待用） */
  count: 0,
}));

/** ?seed=<整數>：第 k 次產生用 seed＋k（只供測試，介面上沒有入口）；平常每次產生都換新的種子 */
const fixedSeed = typeof location !== 'undefined' ? parseSeedParam(location.search) : null;
let generation = 0;
function nextSeed(): number {
  if (fixedSeed === null) return randomSeed();
  return (fixedSeed + generation++) % (MAX_SEED + 1);
}

let measureFn: MeasureFn | null = null;
const measure: MeasureFn = (ch, font, size) => {
  measureFn ??= createMeasure();
  return measureFn(ch, font, size);
};

type ToastFn = ReturnType<typeof useToast>;

/** 按「產生」：讀取目前所有設定，先載入字型，再重新隨機排版（F02） */
async function generate(toast: ToastFn): Promise<void> {
  const { phase } = useRun.getState();
  if (phase === 'busy') return;
  if (phase === 'idle') useRun.setState({ phase: 'busy' });
  try {
    const s = useSettings.getState().data;
    const { a, b } = resolveSizeRange(s.sizeMin, s.sizeMax);
    const fonts = activeFonts(s.fonts);
    await prepareFonts(fonts, layoutText(s.text, S.emptyText));
    const layout = layoutCollage(
      {
        text: s.text,
        emptyText: S.emptyText,
        a,
        b,
        width: resolveWidth(s.width),
        autoWidth: s.autoWidth,
        align: s.align,
        fonts,
        palettes: activePalettes(s.palettes),
      },
      createRandom(nextSeed()),
      measure,
    );
    useRun.setState((st) => ({ layout, phase: 'idle', count: st.count + 1 }));
    toast({ title: S.generated, tone: 'success', duration: TOAST_MS });
  } catch (e) {
    useRun.setState({ phase: 'idle' });
    toast({ title: S.generateFailed, description: String(e), tone: 'danger' });
  }
}

/** 開頁：等頁面宣告的網頁字型載入完成（或失敗、逾時） */
async function waitForPageFonts(): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return;
  await Promise.race([
    document.fonts.ready.catch(() => undefined),
    new Promise((r) => setTimeout(r, PAGE_FONTS_TIMEOUT)),
  ]);
}

const ALIGN_OPTIONS = [
  { value: 'left', label: S.alignLeft },
  { value: 'center', label: S.alignCenter },
  { value: 'right', label: S.alignRight },
] as const;

const STAGE_BACKGROUNDS: readonly StageBackgroundKind[] = ['checker', 'dark', 'light', 'color'];

/** 配色樣張：兩個小色塊（紙片底色、字色） */
function PaletteSwatch({ a, b }: { a: string; b: string }) {
  return (
    <span aria-hidden className="inline-flex shrink-0 gap-0.5">
      <span className="size-4 rounded-sm border border-border" style={{ background: a }} />
      <span className="size-4 rounded-sm border border-border" style={{ background: b }} />
    </span>
  );
}

function Usage() {
  return (
    <>
      <ol>
        {S.usageSteps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <ul className="mt-2">
        {S.usageNotes.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </>
  );
}

function SettingsPanel() {
  const d = useSettings((s) => s.data);
  const patch = useSettings((s) => s.patch);
  const toast = useToast();
  const set =
    <K extends keyof Settings>(key: K) =>
    (value: Settings[K]) =>
      patch({ [key]: value } as Partial<Settings>);

  return (
    <>
      <Section title={S.sectionContent} fixed>
        <Field label={S.content} hint={S.contentHint}>
          <TextArea
            value={d.text}
            rows={7}
            placeholder={S.contentPlaceholder}
            onChange={(e) => set('text')(e.target.value)}
          />
        </Field>
      </Section>

      <Section title={S.sectionLayout}>
        <FieldRow columns={2}>
          <Field label={S.sizeMin}>
            <NativeNumberInput
              value={d.sizeMin}
              onChange={set('sizeMin')}
              min={SIZE_LIMIT.min}
              max={SIZE_LIMIT.max}
              unit={S.unitPx}
              stepLabels={{ up: S.stepUp(S.sizeMin), down: S.stepDown(S.sizeMin) }}
            />
          </Field>
          <Field label={S.sizeMax}>
            <NativeNumberInput
              value={d.sizeMax}
              onChange={set('sizeMax')}
              min={SIZE_LIMIT.min}
              max={SIZE_LIMIT.max}
              unit={S.unitPx}
              stepLabels={{ up: S.stepUp(S.sizeMax), down: S.stepDown(S.sizeMax) }}
            />
          </Field>
        </FieldRow>
        <p className="m-0 text-xs text-muted">{S.sizeHint}</p>
        <Field label={S.width} hint={S.widthHint}>
          <NativeNumberInput
            value={d.width}
            onChange={set('width')}
            min={WIDTH_LIMIT.min}
            max={WIDTH_LIMIT.max}
            step={10}
            unit={S.unitPx}
            disabled={d.autoWidth}
            stepLabels={{ up: S.stepUp(S.width), down: S.stepDown(S.width) }}
          />
        </Field>
        <div className="flex flex-col gap-1">
          <Checkbox checked={d.autoWidth} onCheckedChange={set('autoWidth')} label={S.autoWidth} />
          <p className="m-0 pl-6.5 text-xs text-muted">{S.autoWidthHint}</p>
        </div>
        <Field label={S.align}>
          <Segmented<Align>
            value={d.align}
            onValueChange={set('align')}
            fullWidth
            options={ALIGN_OPTIONS}
          />
        </Field>
      </Section>

      <Section title={S.sectionPalettes} description={S.palettesHint}>
        <ColorPairList
          aria-label={S.palettesLabel}
          items={d.palettes}
          onChange={set('palettes')}
          labels={{ a: S.paletteBg, b: S.paletteFg }}
          addDefaults={{ a: '#ffffff', b: '#000000' }}
          customName={S.customPalette}
          addLabel={S.addPalette}
          renderSwatch={(it) => <PaletteSwatch a={it.a} b={it.b} />}
          onAdded={() => toast({ title: S.paletteAdded, tone: 'success', duration: TOAST_MS })}
        />
      </Section>

      <Section title={S.sectionFonts} description={S.fontsHint}>
        <FontPoolList
          aria-label={S.fontsLabel}
          items={d.fonts}
          onChange={set('fonts')}
          previewText={S.fontPreview}
          addLabel={S.addFont}
          onAdded={() =>
            toast({
              title: S.fontAdded,
              description: S.fontAddedHint,
              tone: 'success',
              duration: TOAST_MS,
            })
          }
          onDuplicate={() => toast({ title: S.fontDuplicate, tone: 'info', duration: TOAST_MS })}
        />
      </Section>

      <Section title={S.sectionRoll20}>
        <div className="flex flex-col gap-1">
          <Checkbox
            checked={d.roll20Basic}
            onCheckedChange={set('roll20Basic')}
            label={S.roll20Basic}
          />
          <p className="m-0 pl-6.5 text-xs text-muted">{S.roll20BasicHint}</p>
        </div>
        <FieldRow columns={2}>
          <Field label={S.roll20Min}>
            <NativeNumberInput
              value={d.roll20Min}
              onChange={set('roll20Min')}
              min={ROLL20_SPIN.min.min}
              max={ROLL20_SPIN.min.max}
              unit={S.unitPx}
              stepLabels={{ up: S.stepUp(S.roll20Min), down: S.stepDown(S.roll20Min) }}
            />
          </Field>
          <Field label={S.roll20Max}>
            <NativeNumberInput
              value={d.roll20Max}
              onChange={set('roll20Max')}
              min={ROLL20_SPIN.max.min}
              max={ROLL20_SPIN.max.max}
              unit={S.unitPx}
              stepLabels={{ up: S.stepUp(S.roll20Max), down: S.stepDown(S.roll20Max) }}
            />
          </Field>
        </FieldRow>
        <p className="m-0 text-xs text-muted">{S.roll20SizeHint}</p>
      </Section>

      <UsageSection>
        <Usage />
      </UsageSection>
    </>
  );
}

/** 開頁前的預覽大小（一行、預設字級） */
const PLACEHOLDER_SIZE = { width: WIDTH_DEFAULT, height: MARGIN + 35 + 91 };

function PreviewPanel() {
  const toast = useToast();
  const layout = useRun((s) => s.layout);
  const phase = useRun((s) => s.phase);
  const count = useRun((s) => s.count);
  const canvas = useRef<HTMLCanvasElement>(null);

  /* 開頁：等字型 → 自動產生一次（F03） */
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      await waitForPageFonts();
      await generate(toast);
    })();
  }, [toast]);

  useLayoutEffect(() => {
    const c = canvas.current;
    if (!c || !layout) return;
    const ctx = c.getContext('2d');
    if (ctx) drawCollage(ctx, layout);
  }, [layout]);

  const w = layout?.canvasWidth ?? PLACEHOLDER_SIZE.width;
  const h = layout?.canvasHeight ?? PLACEHOLDER_SIZE.height;

  const withLayout = (fn: (l: CollageLayout, c: HTMLCanvasElement) => void | Promise<void>) => {
    const l = useRun.getState().layout;
    const c = canvas.current;
    if (!l || !c) {
      toast({ title: S.needGenerate, tone: 'info', duration: TOAST_MS });
      return;
    }
    Promise.resolve(fn(l, c)).catch((e) =>
      toast({ title: S.exportFailed, description: String(e), tone: 'danger' }),
    );
  };

  const copied = (ok: boolean, title: string) =>
    ok
      ? toast({ title, tone: 'success', duration: TOAST_MS })
      : toast({ title: S.copyFailed, description: S.copyFailedHint, tone: 'danger' });

  const actions = [
    {
      label: S.downloadPng,
      tip: S.downloadPngTip,
      icon: <Download />,
      run: () => withLayout(async (_l, c) => downloadBlob(await pngBlob(c), exportFileName('png'))),
    },
    {
      label: S.downloadJpg,
      tip: S.downloadJpgTip,
      icon: <FileImage />,
      run: () => withLayout(async (_l, c) => downloadBlob(await jpgBlob(c), exportFileName('jpg'))),
    },
    {
      label: S.copyImage,
      tip: S.copyImageTip,
      icon: <ClipboardCopy />,
      run: () =>
        withLayout(async (_l, c) => {
          /* Safari 要在點擊當下呼叫剪貼簿：傳 Promise */
          const r = await copyImage(pngBlob(c));
          if (r.ok) toast({ title: S.imageCopied, tone: 'success', duration: TOAST_MS });
          else
            toast({ title: S.imageCopyFailed, description: S.imageCopyFailedHint, tone: 'danger' });
        }),
    },
    {
      label: S.copyHtml,
      tip: S.copyHtmlTip,
      icon: <Code2 />,
      run: () =>
        withLayout(async (l) => {
          /* 對齊方式取複製當下的值（F34） */
          const html = toHtml(l, useSettings.getState().data.align);
          copied(await copyText(html), S.htmlCopied);
        }),
    },
    {
      label: S.copyRoll20,
      tip: S.copyRoll20Tip,
      icon: <Type />,
      run: () =>
        withLayout(async (l) => {
          const s = useSettings.getState().data;
          const text = toRoll20(
            l,
            { basic: s.roll20Basic, ...resolveRoll20Range(s.roll20Min, s.roll20Max) },
            /* 基本字型每次複製都重新隨機 */
            createRandom(randomSeed()),
          );
          copied(await copyText(text), S.roll20Copied);
        }),
    },
  ];

  return (
    <>
      <Stage width={w} height={h} aria-label={S.previewLabel} backgrounds={STAGE_BACKGROUNDS}>
        <canvas
          ref={canvas}
          width={w}
          height={h}
          className="block size-full"
          data-testid="collage-canvas"
          data-generation={count}
        />
      </Stage>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-border bg-surface px-3 py-2">
        <Button
          variant="primary"
          size="lg"
          icon={<Shuffle />}
          loading={phase !== 'idle'}
          onClick={() => void generate(toast)}
        >
          {phase === 'loading' ? S.loadingFonts : S.generate}
        </Button>
        <dl className="m-0 flex min-w-0 flex-1 flex-wrap gap-x-4 gap-y-1 text-sm">
          <div className="flex gap-1.5">
            <dt className="text-muted">{S.infoSize}</dt>
            <dd className="m-0 tabular-nums" data-testid="collage-size">
              {layout ? S.sizeValue(layout.width, Math.floor(layout.height)) : '—'}
            </dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-muted">{S.infoPieces}</dt>
            <dd className="m-0 tabular-nums" data-testid="collage-pieces">
              {layout ? S.piecesValue(layout.pieceCount) : '—'}
            </dd>
          </div>
        </dl>
      </div>
      <p className="m-0 text-xs text-muted">
        {layout?.autoWidth ? S.autoWidthNote : S.wrapHint}
        {S.generateHint}
      </p>
      {layout?.clipped ? <Notice tone="warning">{S.clipped}</Notice> : null}
      <fieldset className="m-0 flex min-w-0 flex-wrap gap-2 rounded-lg border border-border bg-surface px-3 py-2">
        <legend className="sr-only">{S.exportLabel}</legend>
        {actions.map((a) => (
          <Tooltip key={a.label} content={a.tip}>
            <Button icon={a.icon} onClick={a.run}>
              {a.label}
            </Button>
          </Tooltip>
        ))}
      </fieldset>
    </>
  );
}

export function App() {
  return (
    <ToolShell
      toolId="collage-letter"
      usage={<Usage />}
      settings={<SettingsPanel />}
      preview={<PreviewPanel />}
    />
  );
}
