/**
 * 「匯出」分頁（規格 1.8）：圖片（PNG、SVG；範圍、對象、寬度、標題列、圖例、配色）、年表文字（純文字／Markdown）、CSV。
 */
import { ClipboardPaste, Download, FileDown, FileUp } from 'lucide-react';
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
  TextOutputPanel,
  Toggle,
} from '@/ui';
import {
  exportDoc,
  fileBase,
  imageFileName,
  type PlanResult,
  POV_ALL,
  planPicture,
  renderPng,
  renderSvg,
  textFileName,
} from '../export/render';
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
import type { TimelineDoc } from '../model/types';
import { type Audience, hasSecrets, povLanes, visibleDoc } from '../model/visible';
import { notify } from '../notify';
import {
  docNow,
  type ExportPrefs,
  filterOf,
  type Prefs,
  prefsNow,
  type RangeKind,
  setExportPrefs,
  setPrefs,
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

/** 匯出一張圖（PNG、SVG） */
async function renderOne(
  d: TimelineDoc,
  r: Extract<PlanResult, { ok: true }>,
  format: string,
  scale: number,
  viewer: Viewer,
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
  const out = await renderPng(r.pic, scale);
  return {
    blob: out.blob,
    fileName: imageFileName(d, viewer.audience, 'png', viewer.pov),
    width: out.width,
    height: out.height,
    details:
      out.scale < scale - 1e-9 ? [{ label: '倍率', value: S.scaleCapped(out.scale) }] : undefined,
  };
}

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
      ),
    [doc, ex, view, collapsed, filterPrefs, previewPov],
  );
  const resetKey = useMemo(
    () => ({ doc, ex, view, collapsed, filterPrefs }),
    [doc, ex, view, collapsed, filterPrefs],
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
        <Field label={S.exTheme}>
          <Segmented<ExportPrefs['theme']>
            value={ex.theme}
            fullWidth
            onValueChange={(v) => setExportPrefs({ theme: v })}
            options={[
              { value: 'light', label: S.themeLight },
              { value: 'dark', label: S.themeDark },
            ]}
          />
        </Field>
      </Section>
      <ExportPanel
        title={S.exportPanelTitle}
        formats={formats}
        baseSize={plan.ok ? { width: plan.pic.width, height: plan.pic.height } : undefined}
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
            /* 人物別全部各一張（F118）：每個人物一個檔案（結果卡可以打包成 ZIP） */
            const files: ExportOutput[] = [];
            for (const lane of povLanes(d)) {
              const r = planPicture(d, exNow, view, p.collapsed, undefined, filter, lane.id);
              if (!r.ok) continue;
              files.push(
                await renderOne(d, r, settings.format, p.export.scale, {
                  audience: 'pl',
                  pov: lane.id,
                }),
              );
            }
            if (!files.length) throw new Error(S.exEmpty);
            return {
              files,
              zipName: `${fileBase(d)}_${S.fileName.image}_${S.fileName.povAll}`,
            };
          }
          const r = planPicture(d, exNow, view, p.collapsed, undefined, filter, v.pov);
          if (!r.ok) throw new Error(r.error);
          return renderOne(d, r, settings.format, p.export.scale, v);
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
            notify({ title: S.csvExported(name), tone: 'success' });
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
