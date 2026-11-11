/**
 * 「匯出」分頁（規格 1.8）：圖片（PNG、SVG；範圍、對象、寬度、標題列、圖例、配色）、年表文字（純文字／Markdown）、CSV。
 */
import { ClipboardPaste, Download, FileDown, FileUp, Shuffle } from 'lucide-react';
import { useMemo } from 'react';
import { downloadText } from '@/core/files';
import {
  Button,
  type ExportFormatOption,
  type ExportOutput,
  ExportPanel,
  Field,
  NumberInput,
  Section,
  Segmented,
  Select,
  Slider,
  TextOutputPanel,
  Toggle,
} from '@/ui';
import {
  PAPER_STYLES,
  type PanelKind,
  type PaperStyle,
  TITLE_FONTS,
  type TitleFont,
} from '../export/paper';
import type { Picture } from '../export/picture';
import {
  DEFAULT_AGE,
  exportDoc,
  type FocusContext,
  fileBase,
  imageFileName,
  POV_ALL,
  planPicture,
  planPicturePages,
  renderPng,
  renderSvg,
  textFileName,
} from '../export/render';
import { gapsSupported } from '../model/alibi';
import {
  chronicle,
  chronicleMarkdown,
  chronicleText,
  laneReport,
  laneReportMarkdown,
  laneReportText,
} from '../model/chronicle';
import { eventsToCsv } from '../model/csv';
import { effectiveFilter, type FilterState, isFiltering, matchingIds } from '../model/filter';
import { PAGE_SIZES, pageScale } from '../model/paging';
import type { TimelineDoc } from '../model/types';
import { type Audience, hasSecrets, povLanes, visibleDoc } from '../model/visible';
import type { Win } from '../model/window';
import { notify } from '../notify';
import {
  analysisOf,
  docNow,
  type ExportPrefs,
  filterOf,
  type Prefs,
  prefsNow,
  type RangeKind,
  setExportPrefs,
  setPrefs,
  spotOf,
  useDoc,
  usePrefs,
  useUi,
} from '../store';
import { S } from '../strings';
import { currentWin } from '../view/shared';
import { pickCsv } from './importer';
import { TimeField } from './TimeField';
import { pickVis } from './visImport';

const FORMATS: ExportFormatOption[] = [
  { id: 'png', label: S.pngLabel, description: S.pngDesc },
  { id: 'svg', label: S.svgLabel, description: S.svgDesc },
];
const SCALES = [1, 2] as const;

/** 匯出的對象（F63、F118）：GM 用、PL 用（pov 空字串＝全體公開；泳道 id＝人物別；「*」＝人物別全部各一張） */
export interface Viewer {
  audience: Audience;
  pov: string;
}

/**
 * 實際的對象：PL 檢視時固定是目前的 PL 檢視（全體公開或那個人物；畫面上不出現 GM 用的內容）；
 * 人物別指到 PL 看不到、已經刪掉的泳道時＝全體公開；allowAll：可以「全部各一張」（圖片）。
 */
export function viewerOf(
  doc: TimelineDoc,
  p: Pick<Prefs, 'viewMode' | 'pov'>,
  chosen: { audience: Audience; pov?: string },
  allowAll: boolean,
): Viewer {
  if (p.viewMode === 'pl') {
    const cur = p.pov ?? '';
    return { audience: 'pl', pov: povLanes(doc).some((l) => l.id === cur) ? cur : '' };
  }
  if (chosen.audience === 'gm') return { audience: 'gm', pov: '' };
  const want = chosen.pov ?? '';
  if (want === POV_ALL) return { audience: 'pl', pov: allowAll ? POV_ALL : '' };
  return { audience: 'pl', pov: povLanes(doc).some((l) => l.id === want) ? want : '' };
}

function useViewer(chosen: { audience: Audience; pov?: string }, allowAll: boolean): Viewer {
  const doc = useDoc((s) => s.data);
  const viewMode = usePrefs((s) => s.data.viewMode);
  const pov = usePrefs((s) => s.data.pov);
  return useMemo(
    () => viewerOf(doc, { viewMode, pov }, chosen, allowAll),
    [doc, viewMode, pov, chosen, allowAll],
  );
}

/** 「只匯出篩選的結果」要用的篩選：開著而且目前的檢視有篩選時（沒有時 null＝全部） */
function exportFilter(p: Prefs, on: boolean | undefined): FilterState | null {
  if (!on) return null;
  const f = filterOf(p);
  const cur = visibleDoc(docNow(), p.viewMode, p.viewMode === 'pl' ? (p.pov ?? '') : '');
  return isFiltering(effectiveFilter(cur, f)) ? f : null;
}

/** 目前的檢視有沒有篩選、符合幾個（匯出的說明用） */
function useFilterInfo(): { active: boolean; count: number } {
  const doc = useDoc((s) => s.data);
  const viewMode = usePrefs((s) => s.data.viewMode);
  const pov = usePrefs((s) => s.data.pov ?? '');
  const filter = usePrefs((s) => s.data.filter);
  return useMemo(() => {
    const vdoc = visibleDoc(doc, viewMode, viewMode === 'pl' ? pov : '');
    const ids = matchingIds(vdoc, filterOf({ filter } as Prefs, viewMode));
    return { active: !!ids, count: ids?.size ?? vdoc.events.length };
  }, [doc, viewMode, pov, filter]);
}

function FilteredField({
  value,
  onChange,
}: {
  value: boolean | undefined;
  onChange: (v: boolean) => void;
}) {
  const info = useFilterInfo();
  return (
    <Field
      label={S.exFiltered}
      layout="inline"
      hint={info.active ? S.exFilteredHint(info.count) : S.exFilteredNone}
    >
      <Toggle checked={!!value && info.active} disabled={!info.active} onCheckedChange={onChange} />
    </Field>
  );
}

type AudienceChoice = 'pl' | 'pov' | 'gm';

/**
 * 對象（F63、F118）：PL 用（全體公開）／人物別（選一個人物；圖片可以選「全部各一張」）／GM 用。
 * 專案裡沒有可以選的人物時只有 PL 用、GM 用（和以前相同）。PL 檢視時固定是目前的 PL 檢視。
 */
function AudienceField({
  viewer,
  onChange,
  secrets,
  allowAll,
  testId,
}: {
  viewer: Viewer;
  onChange: (v: { audience: Audience; pov?: string }) => void;
  secrets: boolean;
  allowAll: boolean;
  testId: string;
}) {
  const pl = usePrefs((s) => s.data.viewMode) === 'pl';
  const doc = useDoc((s) => s.data);
  const people = useMemo(() => povLanes(doc), [doc]);
  const choice: AudienceChoice = viewer.audience === 'gm' ? 'gm' : viewer.pov ? 'pov' : 'pl';
  const options: { value: AudienceChoice; label: string }[] = [
    { value: 'pl', label: S.audiencePl },
    ...(people.length || choice === 'pov' ? [{ value: 'pov' as const, label: S.audiencePov }] : []),
    { value: 'gm', label: S.audienceGm },
  ];
  const hint = pl
    ? S.audiencePlView
    : choice === 'pov'
      ? viewer.pov === POV_ALL
        ? S.audiencePovAllHint(people.length)
        : S.audiencePovHint
      : secrets
        ? S.audienceHint
        : S.audienceSame;
  return (
    <>
      <Field label={S.audience} hint={hint}>
        <div data-testid={testId}>
          <Segmented<AudienceChoice>
            value={choice}
            fullWidth
            disabled={pl}
            onValueChange={(v) => {
              if (v === 'gm') onChange({ audience: 'gm' });
              else if (v === 'pl') onChange({ audience: 'pl', pov: '' });
              else onChange({ audience: 'pl', pov: people[0]?.id ?? '' });
            }}
            options={options}
          />
        </div>
      </Field>
      {choice === 'pov' ? (
        <Field label={S.audiencePerson}>
          <Select
            value={viewer.pov}
            disabled={pl}
            data-field={`${testId}-person`}
            onValueChange={(v) => onChange({ audience: 'pl', pov: v })}
            options={[
              ...people.map((l) => ({ value: l.id, label: l.name.trim() || S.untitled })),
              ...(allowAll && people.length > 1
                ? [{ value: POV_ALL, label: S.audiencePovAll }]
                : []),
            ]}
          />
        </Field>
      ) : null}
    </>
  );
}

/** 時間軸那邊的聚光與時間切片（F134）：匯出的「照時間軸的聚光與時間切片」與時間切片的調書用 */
export function focusContext(p: Prefs): FocusContext {
  const a = analysisOf(p);
  return { spot: spotOf(p), sliceTime: a.slice?.on ? a.slice.time || null : null };
}

/** A4 自動分頁（F141）：PNG、選了 A4 自動分頁時 */
const paging = (ex: ExportPrefs, format: string) => format === 'png' && ex.paging === 'a4';

/** 匯出一張圖（PNG、SVG）；page：分頁的第幾頁（PNG 的長邊照每頁的長邊） */
async function renderOne(
  d: TimelineDoc,
  r: { pic: Picture },
  format: string,
  scale: number,
  viewer: Viewer,
  page = 0,
  pageSize = 0,
): Promise<ExportOutput> {
  if (format === 'svg') {
    const out = await renderSvg(r.pic);
    return {
      blob: out.blob,
      fileName: imageFileName(d, viewer.audience, 'svg', viewer.pov),
      width: r.pic.width,
      height: r.pic.height,
      details: [
        {
          label: S.svgFont,
          value: out.fontEmbedded ? S.svgFontEmbedded : S.svgFontMissing,
        },
      ],
    };
  }
  const s = pageSize ? pageScale(r.pic.width, r.pic.height, pageSize) : scale;
  const out = await renderPng(r.pic, s);
  return {
    blob: out.blob,
    fileName: imageFileName(d, viewer.audience, 'png', viewer.pov, page),
    width: out.width,
    height: out.height,
    details:
      out.scale < s - 1e-9 ? [{ label: '倍率', value: S.scaleCapped(out.scale) }] : undefined,
  };
}

/** 一個對象的圖：分頁時每頁一個檔案 */
async function renderViewer(
  d: TimelineDoc,
  ex: ExportPrefs,
  view: Win | null,
  p: Prefs,
  format: string,
  viewer: Viewer,
  filter: FilterState | null,
): Promise<ExportOutput[] | string> {
  const ctx = focusContext(p);
  if (paging(ex, format)) {
    const r = planPicturePages(d, ex, view, p.collapsed, undefined, filter, viewer.pov, ctx);
    if (!r.ok) return r.error;
    const many = r.pages.length > 1;
    const out: ExportOutput[] = [];
    for (const [i, pg] of r.pages.entries())
      out.push(
        await renderOne(
          d,
          pg,
          format,
          1,
          viewer,
          many ? i + 1 : 0,
          ex.pageSize ?? PAGE_SIZE_DEFAULT,
        ),
      );
    return out;
  }
  const r = planPicture(d, ex, view, p.collapsed, undefined, filter, viewer.pov, ctx);
  if (!r.ok) return r.error;
  return [await renderOne(d, r, format, p.export.scale, viewer)];
}

const PAGE_SIZE_DEFAULT = 2400;

export function ExportTab() {
  const doc = useDoc((s) => s.data);
  const exPrefs = usePrefs((s) => s.data.export);
  const viewer = useViewer(exPrefs, true);
  const ex = useMemo(
    () => ({ ...exPrefs, audience: viewer.audience, pov: viewer.pov }),
    [exPrefs, viewer],
  );
  /* 人物別「全部各一張」：預覽的尺寸用第一個人物的 */
  const previewPov = useMemo(
    () => (viewer.pov === POV_ALL ? (povLanes(doc)[0]?.id ?? '') : viewer.pov),
    [viewer.pov, doc],
  );
  const collapsed = usePrefs((s) => s.data.collapsed);
  const win = useUi((s) => s.win);
  const winMode = useUi((s) => s.winMode);
  /* 目前畫面：時間軸的畫面範圍（還沒打開過時間軸時用全覽） */
  const view = useMemo(
    () => (win && winMode === doc.mode ? win : currentWin()),
    /* 資料換了才重算全覽 */
    [win, winMode, doc],
  );
  const secrets = useMemo(() => hasSecrets(doc), [doc]);
  const filterPrefs = usePrefs((s) => s.data.filter);
  const analysis = usePrefs((s) => s.data.analysis);
  const viewMode = usePrefs((s) => s.data.viewMode);
  const ctx = useMemo(
    () => focusContext({ ...prefsNow(), analysis, viewMode }),
    [analysis, viewMode],
  );
  const plan = useMemo(
    () =>
      planPicture(
        doc,
        ex,
        view,
        collapsed,
        null,
        exportFilter({ ...prefsNow(), filter: filterPrefs }, ex.filtered),
        ex.audience === 'pl' ? previewPov : '',
        ctx,
      ),
    [doc, ex, view, collapsed, filterPrefs, previewPov, ctx],
  );
  /* A4 自動分頁（F141）：幾頁（說明用；PNG 才分頁） */
  const pageCount = useMemo(() => {
    if (ex.paging !== 'a4' || !plan.ok) return 0;
    const r = planPicturePages(
      doc,
      ex,
      view,
      collapsed,
      null,
      exportFilter({ ...prefsNow(), filter: filterPrefs }, ex.filtered),
      ex.audience === 'pl' ? previewPov : '',
      ctx,
    );
    return r.ok ? r.pages.length : 0;
  }, [doc, ex, view, collapsed, filterPrefs, previewPov, ctx, plan.ok]);
  const resetKey = useMemo(
    () => ({ doc, ex, view, collapsed, filterPrefs, ctx }),
    [doc, ex, view, collapsed, filterPrefs, ctx],
  );
  const formats = FORMATS.map((f) => ({
    ...f,
    disabled: !plan.ok,
    disabledReason: plan.ok ? undefined : plan.error,
  }));

  return (
    <div className="flex flex-col gap-3" data-testid="export-tab">
      <Section title={S.imageTitle} persistKey="scenario-timeline:export-image">
        <Field label={S.exRange} error={plan.ok ? undefined : plan.error}>
          <Segmented<RangeKind>
            value={ex.range}
            fullWidth
            onValueChange={(v) => setExportPrefs({ range: v })}
            options={[
              { value: 'all', label: S.exRangeAll },
              { value: 'view', label: S.exRangeView },
              { value: 'custom', label: S.exRangeCustom },
            ]}
          />
        </Field>
        {ex.range === 'custom' ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <TimeField
              label={S.exFrom}
              value={ex.from}
              mode={doc.mode}
              era={doc}
              allowEmpty
              data-field="export-from"
              onCommit={(t) => setExportPrefs({ from: t })}
            />
            <TimeField
              label={S.exTo}
              value={ex.to}
              mode={doc.mode}
              era={doc}
              allowEmpty
              data-field="export-to"
              onCommit={(t) => setExportPrefs({ to: t })}
            />
          </div>
        ) : null}
        <AudienceField
          viewer={viewer}
          secrets={secrets}
          allowAll
          testId="export-audience"
          onChange={(v) => setExportPrefs({ audience: v.audience, pov: v.pov ?? '' })}
        />
        <FilteredField value={ex.filtered} onChange={(v) => setExportPrefs({ filtered: v })} />
        <Field label={S.exWidth} hint={S.exWidthHint}>
          <NumberInput
            value={ex.width}
            min={600}
            max={8000}
            step={100}
            unit="px"
            onChange={(v) => setExportPrefs({ width: v })}
          />
        </Field>
        <Field label={S.exTitle} layout="inline">
          <Toggle checked={ex.title} onCheckedChange={(v) => setExportPrefs({ title: v })} />
        </Field>
        <Field label={S.exLegend} layout="inline">
          <Toggle checked={ex.legend} onCheckedChange={(v) => setExportPrefs({ legend: v })} />
        </Field>
        <Field label={S.exTheme} hint={ex.paper && ex.paper !== 'none' ? S.exPaperHint : undefined}>
          <Segmented<ExportPrefs['theme']>
            value={ex.theme}
            fullWidth
            disabled={!!ex.paper && ex.paper !== 'none'}
            onValueChange={(v) => setExportPrefs({ theme: v })}
            options={[
              { value: 'light', label: S.themeLight },
              { value: 'dark', label: S.themeDark },
            ]}
          />
        </Field>
      </Section>
      <StyleSection ex={ex} sliceOn={!!analysis?.slice?.on} mode={doc.mode} />
      <PagingSection ex={ex} pages={pageCount} />
      <ExportPanel
        title={S.exportPanelTitle}
        formats={formats}
        baseSize={
          plan.ok && !paging(ex, ex.format)
            ? { width: plan.pic.width, height: plan.pic.height }
            : undefined
        }
        scaleOptions={SCALES}
        settings={{ format: ex.format, fps: 30, plays: 0, scale: ex.scale, quantize: false }}
        onSettingsChange={(s) => {
          const now = prefsNow().export;
          const patch: Partial<ExportPrefs> = {};
          if (s.scale !== now.scale) patch.scale = s.scale;
          if (s.format !== now.format && (s.format === 'png' || s.format === 'svg'))
            patch.format = s.format;
          if (Object.keys(patch).length) setExportPrefs(patch);
        }}
        resetKey={resetKey}
        onExport={async (settings) => {
          const d = docNow();
          const p = prefsNow();
          const v = viewerOf(d, p, p.export, true);
          const exNow: ExportPrefs = { ...p.export, audience: v.audience, pov: v.pov };
          const ui = useUi.getState();
          const view = ui.win && ui.winMode === d.mode ? ui.win : currentWin();
          const filter = exportFilter(p, p.export.filtered);
          if (v.pov === POV_ALL) {
            /* 人物別全部各一張（F118）：每個人物一個檔案（結果卡可以打包成 ZIP；分頁時每個人物每頁一個） */
            const files: ExportOutput[] = [];
            for (const lane of povLanes(d)) {
              const out = await renderViewer(
                d,
                exNow,
                view,
                p,
                settings.format,
                { audience: 'pl', pov: lane.id },
                filter,
              );
              if (typeof out !== 'string') files.push(...out);
            }
            if (!files.length) throw new Error(S.exEmpty);
            return {
              files,
              zipName: `${fileBase(d)}_${S.fileName.image}_${S.fileName.povAll}`,
            };
          }
          const out = await renderViewer(d, exNow, view, p, settings.format, v, filter);
          if (typeof out === 'string') throw new Error(out);
          if (out.length === 1) return out[0];
          return {
            files: out,
            zipName: `${fileBase(d)}_${S.fileName.image}_${S.exPagesZip}`,
          };
        }}
      />
      <TextSection />
      <CsvSection />
      <VisSection />
    </div>
  );
}

/** 年表文字（時間順）或進行表（人物・地點別，F122）的內容 */
export function exportText(
  doc: TimelineDoc,
  viewer: Viewer,
  opts: { format: 'text' | 'md'; byLane?: boolean; links: boolean; filter: FilterState | null },
): string {
  const vdoc = exportDoc(doc, viewer.audience, opts.filter, viewer.pov);
  const ch = chronicle(vdoc, S.untitled, S.toolName, { links: opts.links });
  if (opts.byLane) {
    const rep = laneReport(ch, vdoc, S.main, S.untitled);
    return opts.format === 'md'
      ? laneReportMarkdown(rep, viewer.audience)
      : laneReportText(rep, viewer.audience);
  }
  return opts.format === 'md'
    ? chronicleMarkdown(ch, viewer.audience)
    : chronicleText(ch, viewer.audience);
}

function TextSection() {
  const doc = useDoc((s) => s.data);
  const tPrefs = usePrefs((s) => s.data.text);
  const viewMode = usePrefs((s) => s.data.viewMode);
  const curPov = usePrefs((s) => s.data.pov ?? '');
  const viewer = useViewer(tPrefs, false);
  const t = useMemo(() => ({ ...tPrefs, audience: viewer.audience }), [tPrefs, viewer]);
  const secrets = useMemo(() => hasSecrets(doc), [doc]);
  /* 目前的檢視看得到關聯線時才有「列出關聯線」（PL 檢視只算 PL 看得到的線） */
  const hasLinks = useMemo(
    () => visibleDoc(doc, viewMode, viewMode === 'pl' ? curPov : '').links.length > 0,
    [doc, viewMode, curPov],
  );
  const linksOn = t.links !== false;
  const filterPrefs = usePrefs((s) => s.data.filter);
  const text = useMemo(
    () =>
      exportText(doc, viewer, {
        format: t.format,
        byLane: t.byLane,
        links: linksOn,
        filter: exportFilter({ ...prefsNow(), filter: filterPrefs }, t.filtered),
      }),
    [doc, t, viewer, filterPrefs, linksOn],
  );
  const setText = (patch: Partial<typeof t>) =>
    setPrefs({ text: { ...prefsNow().text, ...patch } });
  return (
    <Section title={S.textTitle} persistKey="scenario-timeline:export-text">
      <Field label={S.textArrange} hint={t.byLane ? S.textByLaneHint : S.textByTimeHint}>
        <div data-testid="text-arrange">
          <Segmented<'time' | 'lane'>
            value={t.byLane ? 'lane' : 'time'}
            fullWidth
            onValueChange={(v) => setText({ byLane: v === 'lane' })}
            options={[
              { value: 'time', label: S.textByTime },
              { value: 'lane', label: S.textByLane },
            ]}
          />
        </div>
      </Field>
      <Field label={S.textFormat}>
        <Segmented<'text' | 'md'>
          value={t.format}
          fullWidth
          onValueChange={(v) => setText({ format: v })}
          options={[
            { value: 'text', label: S.textPlain },
            { value: 'md', label: S.textMd },
          ]}
        />
      </Field>
      <AudienceField
        viewer={viewer}
        secrets={secrets}
        allowAll={false}
        testId="text-audience"
        onChange={(v) => setText({ audience: v.audience, pov: v.pov ?? '' })}
      />
      <FilteredField value={t.filtered} onChange={(v) => setText({ filtered: v })} />
      {hasLinks ? (
        <Field label={S.chronLinks} layout="inline" hint={S.chronLinksHint}>
          <Toggle checked={linksOn} onCheckedChange={(v) => setText({ links: v })} />
        </Field>
      ) : null}
      <TextOutputPanel
        title={S.textOutput}
        text={text}
        actions={
          <Button
            size="sm"
            variant="secondary"
            icon={<Download />}
            data-testid="text-download"
            onClick={() => {
              const name = textFileName(
                docNow(),
                viewer.audience,
                t.format === 'md' ? 'md' : 'txt',
                viewer.pov,
                !!t.byLane,
              );
              downloadText(
                text,
                name,
                t.format === 'md' ? 'text/markdown;charset=utf-8' : undefined,
              );
              notify({ title: S.textDownloaded(name), tone: 'success' });
            }}
          >
            {S.textDownload}
          </Button>
        }
      />
    </Section>
  );
}

function CsvSection() {
  const pl = usePrefs((s) => s.data.viewMode) === 'pl';
  return (
    <Section title={S.csvTitle} persistKey="scenario-timeline:export-csv" description={S.csvHint}>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          icon={<FileDown />}
          data-testid="csv-export"
          onClick={() => {
            const d = docNow();
            const name = `${fileBase(d)}_${S.fileName.csv}.csv`;
            downloadText(eventsToCsv(d), name, 'text/csv;charset=utf-8');
            /* PL 檢視時也是完整的資料（F64）：提醒一句 */
            notify(
              prefsNow().viewMode === 'pl'
                ? { title: S.csvExported(name), description: S.plFullData, tone: 'warning' }
                : { title: S.csvExported(name), tone: 'success' },
            );
          }}
        >
          {S.csvExport}
        </Button>
        <Button
          size="sm"
          icon={<FileUp />}
          disabled={pl}
          data-testid="csv-import"
          onClick={() => void pickCsv()}
        >
          {S.csvImport}
        </Button>
        <Button
          size="sm"
          icon={<ClipboardPaste />}
          disabled={pl}
          data-testid="csv-paste"
          onClick={() => useUi.setState({ pasteOpen: true })}
        >
          {S.csvPaste}
        </Button>
      </div>
      {pl ? (
        <p className="m-0 text-xs text-warning" data-testid="csv-pl-note">
          {S.plFullData}
        </p>
      ) : null}
    </Section>
  );
}

/** 讀入 vis-timeline 的資料（F94） */
function VisSection() {
  const pl = usePrefs((s) => s.data.viewMode) === 'pl';
  return (
    <Section title={S.visTitle} persistKey="scenario-timeline:export-vis" description={S.visHint}>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          icon={<FileUp />}
          disabled={pl}
          data-testid="vis-import"
          onClick={() => void pickVis()}
        >
          {S.visPick}
        </Button>
        <Button
          size="sm"
          icon={<ClipboardPaste />}
          disabled={pl}
          data-testid="vis-paste"
          onClick={() => useUi.setState({ visOpen: true })}
        >
          {S.visPaste}
        </Button>
      </div>
    </Section>
  );
}

/** 圖面的樣式（第五批，F136～F140）：紙、老舊、翻角、字體、圖框、格線、記號、空白、調書、聚光 */
function StyleSection({
  ex,
  sliceOn,
  mode,
}: {
  ex: ExportPrefs;
  sliceOn: boolean;
  mode: TimelineDoc['mode'];
}) {
  const paper: PaperStyle = ex.paper ?? 'none';
  const hasPaper = paper !== 'none';
  const panel: PanelKind = ex.panel ?? 'none';
  return (
    <Section title={S.exStyleTitle} persistKey="scenario-timeline:export-style" defaultOpen={false}>
      <div className="flex flex-col gap-3" data-testid="export-style">
        <Field label={S.exPaper}>
          <Select<PaperStyle>
            value={paper}
            data-field="export-paper"
            onValueChange={(v) => setExportPrefs({ paper: v })}
            options={PAPER_STYLES.map((p) => ({ value: p, label: S.papers[p] }))}
          />
        </Field>
        {hasPaper ? (
          <>
            <Field label={S.exAge} hint={S.exAgeHint}>
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Slider
                  value={ex.age ?? DEFAULT_AGE}
                  min={0}
                  max={100}
                  step={5}
                  unit="%"
                  className="min-w-0 flex-1"
                  onChange={(v) => setExportPrefs({ age: v })}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Shuffle />}
                  data-testid="export-reseed"
                  onClick={() => setExportPrefs({ seed: 1 + Math.floor(Math.random() * 999999) })}
                >
                  {S.exReseed}
                </Button>
              </div>
            </Field>
            <Field label={S.exCurl} layout="inline">
              <Toggle
                checked={ex.curl !== false}
                onCheckedChange={(v) => setExportPrefs({ curl: v })}
              />
            </Field>
            {ex.curl !== false ? (
              <Field label={S.exTransparent} layout="inline" hint={S.exTransparentHint}>
                <Toggle
                  checked={ex.transparent !== false}
                  onCheckedChange={(v) => setExportPrefs({ transparent: v })}
                />
              </Field>
            ) : null}
          </>
        ) : null}
        <Field label={S.exTitleFont}>
          <Select<TitleFont>
            value={ex.titleFont ?? 'sans'}
            disabled={!ex.title}
            data-field="export-title-font"
            onValueChange={(v) => setExportPrefs({ titleFont: v })}
            options={TITLE_FONTS.map((f) => ({ value: f, label: S.titleFonts[f] }))}
          />
        </Field>
        <Field label={S.exFrame} layout="inline">
          <Toggle checked={!!ex.frame} onCheckedChange={(v) => setExportPrefs({ frame: v })} />
        </Field>
        <Field label={S.exGrid} layout="inline">
          <Toggle
            checked={ex.grid !== false}
            onCheckedChange={(v) => setExportPrefs({ grid: v })}
          />
        </Field>
        <Field label={S.exMarks} layout="inline" hint={S.exMarksHint}>
          <Toggle checked={!!ex.marks} onCheckedChange={(v) => setExportPrefs({ marks: v })} />
        </Field>
        <Field
          label={S.exGapsShow}
          layout="inline"
          hint={gapsSupported(mode) ? undefined : S.anGapsYear}
        >
          <Toggle
            checked={!!ex.gaps && gapsSupported(mode)}
            disabled={!gapsSupported(mode)}
            onCheckedChange={(v) => setExportPrefs({ gaps: v })}
          />
        </Field>
        <Field
          label={S.exPanel}
          hint={panel === 'slice' && !sliceOn ? S.exPanelSliceOff : undefined}
        >
          <Select<PanelKind>
            value={panel}
            data-field="export-panel"
            onValueChange={(v) => setExportPrefs({ panel: v })}
            options={(['none', 'report', 'slice'] as const).map((k) => ({
              value: k,
              label: S.panels[k],
            }))}
          />
        </Field>
        <Field label={S.exFocus} layout="inline" hint={S.exFocusHint}>
          <Toggle checked={!!ex.focus} onCheckedChange={(v) => setExportPrefs({ focus: v })} />
        </Field>
      </div>
    </Section>
  );
}

/** 分頁（第五批，F141）：一張／A4 自動分頁、頁碼、每頁的長邊（PNG） */
function PagingSection({ ex, pages }: { ex: ExportPrefs; pages: number }) {
  const a4 = ex.paging === 'a4';
  return (
    <Section
      title={S.exPagingTitle}
      persistKey="scenario-timeline:export-paging"
      defaultOpen={false}
    >
      <div className="flex flex-col gap-3" data-testid="export-paging">
        <Field
          label={S.exPaging}
          hint={
            a4 ? `${S.exPagingHint(pages)}${ex.format === 'svg' ? S.exPagingSvg : ''}` : undefined
          }
        >
          <Segmented<'single' | 'a4'>
            value={a4 ? 'a4' : 'single'}
            fullWidth
            onValueChange={(v) => setExportPrefs({ paging: v })}
            options={[
              { value: 'single', label: S.pagings.single },
              { value: 'a4', label: S.pagings.a4 },
            ]}
          />
        </Field>
        {a4 ? (
          <>
            <Field label={S.exPageNum} layout="inline">
              <Toggle
                checked={ex.pageNum !== false}
                onCheckedChange={(v) => setExportPrefs({ pageNum: v })}
              />
            </Field>
            <Field label={S.exPageSize}>
              <Segmented<string>
                value={String(ex.pageSize ?? PAGE_SIZE_DEFAULT)}
                fullWidth
                onValueChange={(v) => setExportPrefs({ pageSize: Number(v) })}
                options={PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} px` }))}
              />
            </Field>
          </>
        ) : null}
      </div>
    </Section>
  );
}
