/**
 * 「匯出」分頁（規格 1.10）：共用匯出區（PNG、倍率）＋檔名、範圍、方向、卡片內容、要畫的項目。
 */
import { useMemo } from 'react';
import { safeFileName } from '@/core/files';
import {
  type ExportFormatOption,
  ExportPanel,
  Field,
  Section,
  Segmented,
  TextInput,
  Toggle,
} from '@/ui';
import {
  type ExportCard,
  type ExportOptions,
  type ExportOrient,
  type ExportRange,
  planExport,
  renderExportPng,
  type ViewSettings,
} from '../export/render';
import { hostOf } from '../model/tree';
import {
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

const FORMATS: ExportFormatOption[] = [{ id: 'png', label: S.pngLabel, description: S.pngDesc }];
const SCALES = [1, 2] as const;

function optionsOf(p: Prefs): ExportOptions {
  return {
    range: p.exportRange,
    orient: p.exportOrient,
    card: p.exportCard,
    title: p.exportTitle,
    gens: p.exportGens,
    spouses: p.exportSpouses,
  };
}

function viewOf(p: Prefs, boardId: string): ViewSettings {
  return {
    cardMode: p.cardMode,
    memo: p.memo,
    colors: p.colors,
    collapsed: collapsedOf(p, boardId),
  };
}

export const exportOptionsNow = () => optionsOf(prefsNow());

/** 檔名（F60）：檔名欄空白時用圖板名稱，再空白時「家系圖」；結尾的 .png 不重複 */
export function pngFileName(input: string | null, title: string): string {
  const base = (input ?? '').trim() || title.trim() || S.untitledBoard;
  const clean = safeFileName(base.replace(/\.png$/i, ''), { fallback: S.untitledBoard });
  return `${clean}.png`;
}

export function ExportTab() {
  const board = useBoard();
  const prefs = usePrefs((s) => s.data);
  const selectedId = useUi((s) => s.selectedId);
  const exportName = useUi((s) => s.exportName);
  const host = selectedId ? hostOf(board.people, board.people[selectedId]) : null;
  const options = optionsOf(prefs);
  const view = viewOf(prefs, board.id);
  /* 只看會影響輸出的設定（換分頁等不會清掉結果卡） */
  const key = JSON.stringify([options, view, options.range === 'sub' ? selectedId : null]);
  const plan = useMemo(() => {
    const [o, v, sel] = JSON.parse(key) as [ExportOptions, ViewSettings, string | null];
    return planExport({ board, view: v, options: o, selectedId: sel, scale: 1 });
  }, [board, key]);
  const subDisabled = options.range === 'sub' && !host;
  const resetKey = useMemo(() => ({ board, key }), [board, key]);

  const formats = FORMATS.map((f) => ({
    ...f,
    disabled: !plan,
    disabledReason: !plan ? (subDisabled ? S.rangeSubNone : S.exportEmpty) : undefined,
  }));

  return (
    <div className="flex flex-col gap-3" data-testid="export-tab">
      <Section title={S.exportTitle} persistKey="family-tree:export-options">
        <Field label={S.exportName}>
          <TextInput
            value={exportName ?? board.title}
            data-field="export-name"
            onChange={(e) => useUi.setState({ exportName: e.target.value })}
          />
        </Field>
        <Field
          label={S.exportRange}
          hint={
            options.range === 'all'
              ? S.rangeAllHint
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
        title={S.exportTitle}
        formats={formats}
        baseSize={
          plan ? { width: Math.ceil(plan.width), height: Math.ceil(plan.height) } : undefined
        }
        scaleOptions={SCALES}
        settings={{ format: 'png', fps: 30, plays: 0, scale: prefs.exportScale, quantize: false }}
        onSettingsChange={(s) => {
          if (s.scale !== prefsNow().exportScale) setPrefs({ exportScale: s.scale });
        }}
        resetKey={resetKey}
        onExport={async () => {
          const b = boardNow();
          const p = prefsNow();
          const pl = planExport({
            board: b,
            view: viewOf(p, b.id),
            options: exportOptionsNow(),
            selectedId: useUi.getState().selectedId,
            scale: p.exportScale,
          });
          if (!pl) throw new Error(S.exportEmpty);
          const blob = await renderExportPng(pl, b);
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
