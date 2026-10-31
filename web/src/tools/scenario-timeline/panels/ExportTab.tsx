/**
 * 「匯出」分頁（規格 1.8）：圖片（PNG、SVG；範圍、對象、寬度、標題列、圖例、配色）、年表文字（純文字／Markdown）、CSV。
 */
import { ClipboardPaste, Download, FileDown, FileUp } from 'lucide-react';
import { useMemo } from 'react';
import { downloadText } from '@/core/files';
import {
  Button,
  type ExportFormatOption,
  ExportPanel,
  Field,
  NumberInput,
  Section,
  Segmented,
  TextOutputPanel,
  Toggle,
} from '@/ui';
import {
  exportDoc,
  fileBase,
  imageFileName,
  planPicture,
  renderPng,
  renderSvg,
  textFileName,
} from '../export/render';
import { chronicle, chronicleMarkdown, chronicleText } from '../model/chronicle';
import { eventsToCsv } from '../model/csv';
import { effectiveFilter, type FilterState, isFiltering, matchingIds } from '../model/filter';
import { type Audience, hasSecrets, visibleDoc } from '../model/visible';
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

/** 匯出的對象：PL 檢視時固定 PL 用（畫面上不出現 GM 用的內容） */
function useAudience(chosen: Audience): Audience {
  const pl = usePrefs((s) => s.data.viewMode) === 'pl';
  return pl ? 'pl' : chosen;
}

/** 「只匯出篩選的結果」要用的篩選：開著而且目前的檢視有篩選時（沒有時 null＝全部） */
function exportFilter(p: Prefs, on: boolean | undefined): FilterState | null {
  if (!on) return null;
  const f = filterOf(p);
  return isFiltering(effectiveFilter(visibleDoc(docNow(), p.viewMode), f)) ? f : null;
}

/** 目前的檢視有沒有篩選、符合幾個（匯出的說明用） */
function useFilterInfo(): { active: boolean; count: number } {
  const doc = useDoc((s) => s.data);
  const viewMode = usePrefs((s) => s.data.viewMode);
  const filter = usePrefs((s) => s.data.filter);
  return useMemo(() => {
    const vdoc = visibleDoc(doc, viewMode);
    const ids = matchingIds(vdoc, filterOf({ filter } as Prefs, viewMode));
    return { active: !!ids, count: ids?.size ?? vdoc.events.length };
  }, [doc, viewMode, filter]);
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

function AudienceField({
  value,
  onChange,
  secrets,
}: {
  value: Audience;
  onChange: (v: Audience) => void;
  secrets: boolean;
}) {
  const pl = usePrefs((s) => s.data.viewMode) === 'pl';
  return (
    <Field
      label={S.audience}
      hint={pl ? S.audiencePlView : secrets ? S.audienceHint : S.audienceSame}
    >
      <Segmented<Audience>
        value={pl ? 'pl' : value}
        fullWidth
        disabled={pl}
        onValueChange={onChange}
        options={[
          { value: 'pl', label: S.audiencePl },
          { value: 'gm', label: S.audienceGm },
        ]}
      />
    </Field>
  );
}

export function ExportTab() {
  const doc = useDoc((s) => s.data);
  const exPrefs = usePrefs((s) => s.data.export);
  const audience = useAudience(exPrefs.audience);
  const ex = useMemo(() => ({ ...exPrefs, audience }), [exPrefs, audience]);
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
      ),
    [doc, ex, view, collapsed, filterPrefs],
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
          value={ex.audience}
          secrets={secrets}
          onChange={(v) => setExportPrefs({ audience: v })}
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
          const exNow: ExportPrefs = {
            ...p.export,
            audience: p.viewMode === 'pl' ? 'pl' : p.export.audience,
          };
          const ui = useUi.getState();
          const r = planPicture(
            d,
            exNow,
            ui.win && ui.winMode === d.mode ? ui.win : currentWin(),
            p.collapsed,
            undefined,
            exportFilter(p, p.export.filtered),
          );
          if (!r.ok) throw new Error(r.error);
          if (settings.format === 'svg') {
            const out = await renderSvg(r.pic);
            return {
              blob: out.blob,
              fileName: imageFileName(d, exNow.audience, 'svg'),
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
          const out = await renderPng(r.pic, p.export.scale);
          return {
            blob: out.blob,
            fileName: imageFileName(d, exNow.audience, 'png'),
            width: out.width,
            height: out.height,
            details:
              out.scale < p.export.scale - 1e-9
                ? [{ label: '倍率', value: S.scaleCapped(out.scale) }]
                : undefined,
          };
        }}
      />
      <TextSection />
      <CsvSection />
      <VisSection />
    </div>
  );
}

function TextSection() {
  const doc = useDoc((s) => s.data);
  const tPrefs = usePrefs((s) => s.data.text);
  const viewMode = usePrefs((s) => s.data.viewMode);
  const audience = useAudience(tPrefs.audience);
  const t = useMemo(() => ({ ...tPrefs, audience }), [tPrefs, audience]);
  const secrets = useMemo(() => hasSecrets(doc), [doc]);
  /* 目前的檢視看得到關聯線時才有「列出關聯線」（PL 檢視只算 PL 看得到的線） */
  const hasLinks = useMemo(() => visibleDoc(doc, viewMode).links.length > 0, [doc, viewMode]);
  const linksOn = t.links !== false;
  const filterPrefs = usePrefs((s) => s.data.filter);
  const text = useMemo(() => {
    const ch = chronicle(
      exportDoc(doc, t.audience, exportFilter({ ...prefsNow(), filter: filterPrefs }, t.filtered)),
      S.untitled,
      S.toolName,
      { links: linksOn },
    );
    return t.format === 'md' ? chronicleMarkdown(ch, t.audience) : chronicleText(ch, t.audience);
  }, [doc, t, filterPrefs, linksOn]);
  const setText = (patch: Partial<typeof t>) =>
    setPrefs({ text: { ...prefsNow().text, ...patch } });
  return (
    <Section title={S.textTitle} persistKey="scenario-timeline:export-text">
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
        value={t.audience}
        secrets={secrets}
        onChange={(v) => setText({ audience: v })}
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
              const name = textFileName(docNow(), t.audience, t.format === 'md' ? 'md' : 'txt');
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
