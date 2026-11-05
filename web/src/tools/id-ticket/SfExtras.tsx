/**
 * SF 證件的名字產生器與預設集（規格 F92、F94；2026-11-05）：
 * - 名字產生器：地區、性別（預覽設定，不列入復原）＋「產生名字」（離線的姓名語料，按下時才載入）；
 * - 預設集：存在這台裝置的 SF 證件（含用到的圖）＋5 個內建的範例；套用前先問（可以復原）、存、蓋過、刪除、
 *   匯出全部（JSON，圖片內嵌）、匯入。
 */
import { Download, FileUp, Paintbrush, Save, Shuffle, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { downloadText, pickFiles, readAsDataUrl } from '@/core/files';
import {
  Button,
  Dialog,
  DialogClose,
  Field,
  IconButton,
  Section,
  Segmented,
  Select,
  TextInput,
  useConfirm,
  useToast,
} from '@/ui';
import { SF_NAME_REGIONS, type SfNameGender, type SfNameRegion } from './sf/names';
import {
  applyExample,
  cleanPresetName,
  newPresetId,
  PresetFileError,
  parsePresetFile,
  presetAssetIds,
  presetFileJson,
  SF_EXAMPLES,
  SF_PRESET_MAX,
  type SfPreset,
  samePreset,
} from './sf/presets';
import {
  applySfName,
  assets,
  docNow,
  replaceSf,
  savedPresets,
  setPrefs,
  sfHasNames,
  useDoc,
  usePrefs,
} from './store';
import { S } from './strings';

/* ======================================================================
 * 名字產生器
 * ==================================================================== */

export function SfNamesSection() {
  const has = useDoc((s) => s.data.kind === 'sf' && sfHasNames(s.data));
  const cfg = usePrefs((p) => p.data.sfNames);
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (!has) return null;
  const generate = async () => {
    setBusy(true);
    try {
      const { generateSfName } = await import('./sf/namegen');
      const n = await generateSfName(cfg.region, cfg.gender);
      applySfName(n);
      toast({ title: S.nameGenerated(`${n.given} ${n.surname}`.trim()), replace: true });
    } catch {
      toast({ title: S.nameFailed, description: S.nameFailedHint, tone: 'danger' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section title={S.nameGen} persistKey="id-ticket:sf-names" description={S.nameGenHint}>
      <div className="grid min-w-0 grid-cols-2 gap-2">
        <Field label={S.nameRegion} hint={S.nameRegionHint}>
          <Select<SfNameRegion>
            value={cfg.region}
            onValueChange={(v) => setPrefs({ sfNames: { ...cfg, region: v } })}
            options={SF_NAME_REGIONS.map((r) => ({ value: r, label: S.nameRegions[r] }))}
            aria-label={S.nameRegion}
            data-testid="sf-name-region"
          />
        </Field>
        <Field label={S.nameGender}>
          <Segmented<SfNameGender>
            value={cfg.gender}
            onValueChange={(v) => setPrefs({ sfNames: { ...cfg, gender: v } })}
            options={(['any', 'm', 'f'] as const).map((g) => ({
              value: g,
              label: S.nameGenders[g],
            }))}
            fullWidth
          />
        </Field>
      </div>
      <Button
        size="sm"
        icon={<Shuffle />}
        loading={busy}
        disabled={busy}
        onClick={() => void generate()}
        data-testid="sf-name-gen"
      >
        {S.nameGen}
      </Button>
    </Section>
  );
}

/* ======================================================================
 * 預設集
 * ==================================================================== */

const savedAtText = (ms: number) => {
  if (!ms) return '';
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/** 預設用到的圖 → data URL（匯出用；讀不到的略過） */
async function presetImages(list: readonly SfPreset[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const id of new Set(presetAssetIds(list))) {
    const blob = await assets.get(id).catch(() => undefined);
    if (blob) out[id] = await readAsDataUrl(blob);
  }
  return out;
}

export function SfPresetsSection() {
  const kind = useDoc((s) => s.data.kind);
  const sf = useDoc((s) => s.data.sf);
  const presets = usePrefs((p) => p.data.sfPresets);
  const confirm = useConfirm();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');
  if (kind !== 'sf') return null;
  const matches = (p: { sf: typeof sf }) => samePreset(p.sf, sf);
  const anyMatch = presets.some(matches) || SF_EXAMPLES.some(matches);

  const full = (): boolean => {
    if (savedPresets().length < SF_PRESET_MAX) return false;
    toast({ title: S.presetLimit(SF_PRESET_MAX), tone: 'warning' });
    setSaving(false);
    return true;
  };

  const apply = async (p: { name: string; sf: typeof sf }, example: boolean) => {
    if (!anyMatch) {
      const ok = await confirm({
        title: S.presetApplyTitle(p.name),
        description: example ? S.presetApplyExampleDesc : S.presetApplyDesc,
        confirmLabel: S.presetApply,
      });
      if (!ok) return;
    }
    replaceSf(example ? applyExample(docNow().sf, p.sf) : p.sf);
    toast({ title: S.presetApplied(p.name), tone: 'success', replace: true });
  };

  const save = () => {
    if (full()) return;
    const n = cleanPresetName(name) || S.presetNameDefault;
    const p: SfPreset = {
      id: newPresetId(),
      name: n,
      savedAt: Date.now(),
      sf: structuredClone(docNow().sf),
    };
    setPrefs({ sfPresets: [...savedPresets(), p] });
    setSaving(false);
    toast({ title: S.presetSaved(n), tone: 'success', replace: true });
  };

  const overwrite = async (p: SfPreset) => {
    const ok = await confirm({
      title: S.presetOverwriteTitle(p.name),
      confirmLabel: S.presetOverwrite,
    });
    if (!ok) return;
    setPrefs({
      sfPresets: savedPresets().map((x) =>
        x.id === p.id ? { ...x, savedAt: Date.now(), sf: structuredClone(docNow().sf) } : x,
      ),
    });
    toast({ title: S.presetOverwritten(p.name), tone: 'success', replace: true });
  };

  const remove = async (p: SfPreset) => {
    const ok = await confirm({
      title: S.presetDeleteTitle(p.name),
      description: S.presetDeleteDesc,
      confirmLabel: S.presetDelete,
      danger: true,
    });
    if (!ok) return;
    setPrefs({ sfPresets: savedPresets().filter((x) => x.id !== p.id) });
  };

  const exportAll = async () => {
    const list = savedPresets();
    downloadText(
      presetFileJson(list, await presetImages(list)),
      `${S.presetExportName}.json`,
      'application/json;charset=utf-8',
    );
  };

  const importFile = async () => {
    if (full()) return;
    const [file] = await pickFiles({ accept: '.json,application/json' });
    if (!file) return;
    try {
      const { presets: got, images } = parsePresetFile(await file.text(), {
        notJson: S.presetFileNotJson,
        wrong: S.presetFileWrong,
        empty: S.presetFileEmpty,
      });
      const room = SF_PRESET_MAX - savedPresets().length;
      const take = got.slice(0, room);
      /* 圖放回資產庫（資產 id 由內容決定，放回同一個 id） */
      for (const id of new Set(presetAssetIds(take))) {
        const url = images[id];
        if (!url || assets.has(id)) continue;
        const blob = await (await fetch(url)).blob();
        await assets.put(id, blob);
      }
      setPrefs({ sfPresets: [...savedPresets(), ...take] });
      toast({
        title: S.presetImported(take.length),
        description: take.length < got.length ? S.presetImportPartial(take.length) : undefined,
        tone: take.length < got.length ? 'warning' : 'success',
      });
    } catch (e) {
      toast({
        title: S.presetImportFailed,
        description: e instanceof PresetFileError ? e.message : S.presetFileNotJson,
        tone: 'danger',
      });
    }
  };

  /** saved＝存著的預設（null＝內建的範例） */
  const row = (
    p: { id: string; name: string; sf: typeof sf },
    saved: SfPreset | null,
    tag?: string,
  ) => {
    const current = matches(p);
    return (
      <li
        key={p.id}
        className="flex min-h-11 min-w-0 items-center gap-2 rounded-md border border-border px-2 py-1"
        data-sf-preset={p.id}
        aria-current={current ? 'true' : undefined}
      >
        <span className="min-w-0 flex-1 truncate text-sm text-fg" title={p.name}>
          {p.name}
          {tag ? (
            <span className="ml-1.5 rounded-sm bg-surface-3 px-1.5 py-0.5 text-xs text-muted">
              {tag}
            </span>
          ) : null}
          {current ? (
            <span className="ml-1.5 rounded-sm bg-accent/15 px-1.5 py-0.5 text-xs text-accent">
              {S.presetCurrent}
            </span>
          ) : null}
          {saved?.savedAt ? (
            <span className="block truncate text-xs text-muted">
              {S.presetSavedAt(savedAtText(saved.savedAt))}
            </span>
          ) : null}
        </span>
        <Button
          size="sm"
          icon={<Paintbrush />}
          aria-label={S.presetApplyLabel(p.name)}
          onClick={() => void apply(p, !saved)}
        >
          {S.presetApply}
        </Button>
        {saved ? (
          <>
            <IconButton
              size="sm"
              label={S.presetOverwriteLabel(p.name)}
              icon={<Upload />}
              onClick={() => void overwrite(saved)}
            />
            <IconButton
              size="sm"
              label={S.presetDeleteLabel(p.name)}
              icon={<Trash2 />}
              onClick={() => void remove(saved)}
            />
          </>
        ) : null}
      </li>
    );
  };

  return (
    <Section title={S.sectionPresets} persistKey="id-ticket:sf-presets" description={S.presetsHint}>
      <ul
        className="m-0 flex min-w-0 list-none flex-col gap-1 p-0"
        aria-label={S.presetsLabel}
        data-testid="sf-presets"
      >
        {presets.map((p) => row(p, p))}
        {SF_EXAMPLES.map((p) => row(p, null, S.presetExample))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          icon={<Save />}
          onClick={() => {
            if (full()) return;
            setName(S.presetNameDefault);
            setSaving(true);
          }}
        >
          {S.presetSave}
        </Button>
        <Button
          size="sm"
          icon={<Download />}
          disabled={!presets.length}
          onClick={() => void exportAll()}
        >
          {S.presetExport}
        </Button>
        <Button size="sm" icon={<FileUp />} onClick={() => void importFile()}>
          {S.presetImport}
        </Button>
      </div>
      <Dialog
        open={saving}
        onOpenChange={setSaving}
        title={S.presetSaveTitle}
        description={S.presetSaveDesc}
        size="sm"
        footer={
          <>
            <DialogClose variant="ghost">{S.cancel}</DialogClose>
            <Button variant="primary" onClick={save} data-testid="sf-preset-save">
              {S.presetSave.replace('…', '')}
            </Button>
          </>
        }
      >
        <Field label={S.presetName}>
          <TextInput
            value={name}
            maxLength={60}
            data-testid="sf-preset-name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                e.preventDefault();
                save();
              }
            }}
          />
        </Field>
      </Dialog>
    </Section>
  );
}
