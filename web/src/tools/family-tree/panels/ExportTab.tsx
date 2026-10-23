/**
 * 「匯出」分頁（規格 1.10；第二批 F83、F86、F88）：共用匯出區（PNG／SVG、倍率）＋檔名、範圍（全部／選取的人以下／
 * 框選範圍）、對象（PL 用／GM 用）、方向、卡片內容、要畫的項目。
 */
import { Crop } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import { loadAssetBitmaps } from '@/core/assets';
import { safeFileName } from '@/core/files';
import {
  Button,
  type ExportFormatOption,
  ExportPanel,
  type ExportPanelHandle,
  Field,
  Section,
  Segmented,
  TextInput,
  Toggle,
} from '@/ui';
import { exportApi } from '../actions';
import {
  type ExportAudience,
  type ExportCard,
  type ExportFormat,
  type ExportOptions,
  type ExportOrient,
  type ExportRange,
  planExport,
  renderExportPng,
  renderExportSvg,
  type ViewSettings,
} from '../export/render';
import { hasSecrets } from '../model/gm';
import { hostOf } from '../model/tree';
import {
  assets,
  boardNow,
  collapsedOf,
  type Prefs,
  prefsNow,
  setPrefs,
  useBoard,
  usePrefs,
  useUi,
} from '../store';
import { S } from '../strings';

const FORMATS: ExportFormatOption[] = [
  { id: 'png', label: S.pngLabel, description: S.pngDesc },
  { id: 'svg', label: S.svgLabel, description: S.svgDesc },
];
const SCALES = [1, 2] as const;

function optionsOf(p: Prefs): ExportOptions {
  return {
    range: p.exportRange,
    orient: p.exportOrient,
    card: p.exportCard,
    title: p.exportTitle,
    gens: p.exportGens,
    spouses: p.exportSpouses,
    audience: p.exportAudience,
  };
}

export function viewOf(p: Prefs, boardId: string): ViewSettings {
  return {
    cardMode: p.cardMode,
    memo: p.memo,
    colors: p.colors,
    collapsed: collapsedOf(p, boardId),
    maternal: p.maternal,
    stubs: p.stubs,
    links: p.links,
    daughterName: p.daughterName,
    avatars: p.avatars,
  };
}

export const exportOptionsNow = () => optionsOf(prefsNow());

/** 檔名（F60）：檔名欄空白時用圖板名稱，再空白時「家系圖」；結尾的 .png（.svg）不重複 */
export function pngFileName(
  input: string | null,
  title: string,
  ext: ExportFormat = 'png',
): string {
  const base = (input ?? '').trim() || title.trim() || S.untitledBoard;
  const clean = safeFileName(base.replace(/\.(png|svg)$/i, ''), { fallback: S.untitledBoard });
  return `${clean}.${ext}`;
}

export function ExportTab() {
  const exportRef = useRef<ExportPanelHandle>(null);
  const board = useBoard();
  const prefs = usePrefs((s) => s.data);
  const selectedId = useUi((s) => s.selectedId);
  const exportName = useUi((s) => s.exportName);
  const area = useUi((s) => s.area);
  const host = selectedId ? hostOf(board.people, board.people[selectedId]) : null;
  const options = optionsOf(prefs);
  const view = viewOf(prefs, board.id);
  const secrets = hasSecrets(board.people);
  /* 只看會影響輸出的設定（換分頁等不會清掉結果卡） */
  const key = JSON.stringify([
    options,
    view,
    options.range === 'sub' ? selectedId : null,
    options.range === 'area' ? area.keys : null,
  ]);
  const plan = useMemo(() => {
    const [o, v, sel, keys] = JSON.parse(key) as [
      ExportOptions,
      ViewSettings,
      string | null,
      string[] | null,
    ];
    return planExport({ board, view: v, options: o, selectedId: sel, areaKeys: keys, scale: 1 });
  }, [board, key]);
  const subDisabled = options.range === 'sub' && !host;
  const areaDisabled = options.range === 'area' && !area.keys?.length;
  const resetKey = useMemo(() => ({ board, key }), [board, key]);

  /* 框選之後直接匯出（目前選的格式） */
  useEffect(() => {
    const fn = () => exportRef.current?.exportNow(prefsNow().exportFormat);
    exportApi.current = fn;
    return () => {
      if (exportApi.current === fn) exportApi.current = null;
    };
  }, []);

  const reason = !plan
    ? subDisabled
      ? S.rangeSubNone
      : areaDisabled
        ? S.areaNone
        : S.exportEmpty
    : undefined;
  const formats = FORMATS.map((f) => ({ ...f, disabled: !plan, disabledReason: reason }));
  const startArea = () => {
    useUi.setState({ area: { picking: true, keys: useUi.getState().area.keys } });
    /* 手機的版面畫布在上面：捲到看得到畫布 */
    document
      .querySelector('[data-testid="tree-canvas"]')
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  };

  return (
    <div className="flex flex-col gap-3" data-testid="export-tab">
      <Section title={S.exportOptionsTitle} persistKey="family-tree:export-options">
        <Field label={S.exportName}>
          <TextInput
            value={exportName ?? board.title}
            data-field="export-name"
            onKeyDown={(e) => {
              /* Enter 直接匯出（F60） */
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                exportRef.current?.exportNow(prefsNow().exportFormat);
              }
            }}
            onChange={(e) => useUi.setState({ exportName: e.target.value })}
          />
        </Field>
        <Field
          label={S.exportRange}
          hint={
            options.range === 'all'
              ? S.rangeAllHint
              : options.range === 'area'
                ? area.keys?.length
                  ? S.rangeAreaPicked(area.keys.length)
                  : S.rangeAreaHint
                : host
                  ? S.rangeSubHint(host.name || S.unnamed)
                  : S.rangeSubNone
          }
        >
          <Segmented<ExportRange>
            value={options.range}
            onValueChange={(v) => setPrefs({ exportRange: v })}
            options={[
              { value: 'all', label: S.rangeAll },
              { value: 'sub', label: S.rangeSub },
              { value: 'area', label: S.rangeArea },
            ]}
            fullWidth
          />
        </Field>
        {options.range === 'area' ? (
          <div>
            <Button size="sm" icon={<Crop />} onClick={startArea} data-testid="area-start">
              {area.keys?.length ? S.areaRedo : S.areaStart}
            </Button>
          </div>
        ) : null}
        <Field label={S.exportAudience} hint={secrets ? S.audienceHint : S.audienceSame}>
          <Segmented<ExportAudience>
            value={options.audience ?? 'pl'}
            onValueChange={(v) => setPrefs({ exportAudience: v })}
            options={[
              { value: 'pl', label: S.audiencePl },
              { value: 'gm', label: S.audienceGm },
            ]}
            fullWidth
          />
        </Field>
        <Field label={S.exportOrient} hint={S.orientHint}>
          <Segmented<ExportOrient>
            value={options.orient}
            onValueChange={(v) => setPrefs({ exportOrient: v })}
            options={[
              { value: 'v', label: S.orientV },
              { value: 'h', label: S.orientH },
            ]}
            fullWidth
          />
        </Field>
        <Field label={S.exportCard}>
          <Segmented<ExportCard>
            value={options.card}
            onValueChange={(v) => setPrefs({ exportCard: v })}
            options={[
              { value: 'view', label: S.cardView },
              { value: 'name', label: S.cardName },
              { value: 'reading', label: S.cardReading },
            ]}
            fullWidth
          />
        </Field>
        <Field label={S.exTitle} layout="inline">
          <Toggle checked={options.title} onCheckedChange={(v) => setPrefs({ exportTitle: v })} />
        </Field>
        <Field label={S.exGens} layout="inline">
          <Toggle checked={options.gens} onCheckedChange={(v) => setPrefs({ exportGens: v })} />
        </Field>
        <Field label={S.exSpouses} layout="inline">
          <Toggle
            checked={options.spouses}
            onCheckedChange={(v) => setPrefs({ exportSpouses: v })}
          />
        </Field>
        <p className="m-0 text-xs text-muted">{S.exportNote}</p>
      </Section>
      <ExportPanel
        ref={exportRef}
        title={S.exportTitle}
        formats={formats}
        baseSize={
          plan ? { width: Math.ceil(plan.width), height: Math.ceil(plan.height) } : undefined
        }
        scaleOptions={SCALES}
        settings={{
          format: prefs.exportFormat,
          fps: 30,
          plays: 0,
          scale: prefs.exportScale,
          quantize: false,
        }}
        onSettingsChange={(s) => {
          const now = prefsNow();
          if (s.scale !== now.exportScale) setPrefs({ exportScale: s.scale });
          if (s.format !== now.exportFormat && (s.format === 'png' || s.format === 'svg'))
            setPrefs({ exportFormat: s.format });
        }}
        resetKey={resetKey}
        onExport={async (settings) => {
          const b = boardNow();
          const p = prefsNow();
          const svg = settings.format === 'svg';
          const pl = planExport({
            board: b,
            view: viewOf(p, b.id),
            options: exportOptionsNow(),
            selectedId: useUi.getState().selectedId,
            areaKeys: useUi.getState().area.keys,
            scale: svg ? 1 : p.exportScale,
          });
          if (!pl) throw new Error(S.exportEmpty);
          const bitmaps = await loadAssetBitmaps(assets, pl.avatars);
          if (svg) {
            const r = await renderExportSvg(pl, b, bitmaps);
            return {
              blob: r.blob,
              fileName: pngFileName(useUi.getState().exportName, b.title, 'svg'),
              width: Math.ceil(pl.width),
              height: Math.ceil(pl.height),
              details: [
                { label: S.svgFont, value: r.fontEmbedded ? S.svgFontEmbedded : S.svgFontMissing },
              ],
            };
          }
          const blob = await renderExportPng(pl, b, bitmaps);
          const details =
            pl.scale < p.exportScale - 1e-9
              ? [{ label: '倍率', value: S.exportScaleCapped(pl.scale) }]
              : undefined;
          return {
            blob,
            fileName: pngFileName(useUi.getState().exportName, b.title),
            width: pl.canvasWidth,
            height: pl.canvasHeight,
            details,
          };
        }}
      />
    </div>
  );
}
