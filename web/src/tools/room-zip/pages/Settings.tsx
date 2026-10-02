/**
 * 儲存與說明頁（F257、F258）與工具設定（F259～F272）。
 */
import {
  ArrowDown,
  ArrowUp,
  Download,
  FilePlus2,
  FolderOpen,
  GripVertical,
  Save,
  Trash2,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { pickFiles, readAsText } from '@/core/files';
import {
  Button,
  Checkbox,
  cn,
  comboText,
  IconButton,
  NumberInput,
  Segmented,
  Select,
  TextInput,
  Toggle,
  useConfirm,
} from '@/ui';
import { sceneFromTemplate } from '../actions';
import { Card, Hint, ImageField, Labeled, NumCell, Row, Thumb, useNotify } from '../common';
import { ACTIONS, type ActionGroup, comboFromEvent, keyOf, sameCombo } from '../keys';
import {
  addPartFromTemplate,
  addPieceFromTemplate,
  ensureMaterial,
  entryId,
  exportTemplates,
  importTemplates,
  moveEntry,
  presetItems,
  saveEffectPreset,
  setEffectPresetImage,
  updateCutinTemplate,
  updateEffectPreset,
} from '../library';
import {
  createToolSettings,
  DEFAULT_SITES,
  type FullFit,
  newLocalId,
  type ToolDefaults,
} from '../model';
import {
  canWriteFiles,
  exportRoom,
  newRoom,
  normalizeProject,
  pickAndOpen,
  saveProject,
  saveTarget,
} from '../ops';
import {
  autoSaves,
  commit,
  commitLibrary,
  goPage,
  type Session,
  setSession,
  useLibrary,
  useProject,
  useSession,
  useSettings,
} from '../store';
import { S } from '../strings';
import { useEntryDrag } from './Others';

/* =================== 儲存與說明 =================== */

export function SavePage() {
  const n = useNotify();
  const confirm = useConfirm();
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="save-page">
      <Card title={S.saveTitle}>
        <Row>
          <Button variant="primary" icon={<Download />} onClick={() => void exportRoom(n)}>
            {S.exportZip}
          </Button>
          <Button icon={<Save />} onClick={() => void saveProject('download', n)}>
            {S.saveDownload}
          </Button>
          <Button icon={<FolderOpen />} onClick={() => void pickAndOpen(n)}>
            {S.open}
          </Button>
          <Button
            icon={<FilePlus2 />}
            onClick={async () => {
              if (await confirm({ title: S.newRoom, description: S.newRoomConfirm, danger: true }))
                newRoom(n);
            }}
          >
            {S.newRoom}
          </Button>
        </Row>
      </Card>
      <Card title={S.helpTitle}>
        <div className="text-sm leading-relaxed [&_li]:my-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5">
          <p className="m-0">{S.usageIntro}</p>
          <ol>
            {S.usageSteps.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ol>
          <ul>
            {S.usageNotes.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <ShortcutSummary />
        </div>
      </Card>
    </div>
  );
}

function ShortcutSummary() {
  const keys = useSettings((s) => s.data.keys);
  return (
    <dl className="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
      {ACTIONS.filter((a) => keyOf(a.id, keys)).map((a) => (
        <div key={a.id} className="contents">
          <dt className="font-mono text-muted">{comboText(keyOf(a.id, keys))}</dt>
          <dd className="m-0">{S.actions[a.id]}</dd>
        </div>
      ))}
    </dl>
  );
}

/* =================== 工具設定 =================== */

export function SettingsPage() {
  const cat = useSession((s) => s.settingsCat);
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="settings-page">
      <Card title={S.settingsTitle} sub={S.settingsLead}>
        <Segmented
          size="sm"
          value={cat}
          onValueChange={(v) => setSession({ settingsCat: v as Session['settingsCat'] })}
          options={(['display', 'create', 'templates', 'save'] as const).map((v) => ({
            value: v,
            label: S.settingsCats[v],
          }))}
        />
      </Card>
      {cat === 'display' ? (
        <>
          <Card>
            <Hint>{S.themeNote}</Hint>
            <GuideSettings />
          </Card>
          <ShortcutSettings />
        </>
      ) : null}
      {cat === 'create' ? (
        <>
          <DefaultsSettings />
          <SymbolSettings />
          <SiteSettings />
        </>
      ) : null}
      {cat === 'templates' ? (
        <>
          <PresetSettings />
          <TemplateManager />
        </>
      ) : null}
      {cat === 'save' ? (
        <>
          <RoomOutput />
          <NoimageSettings />
          <AutoSaves />
          <SaveTarget />
        </>
      ) : null}
    </div>
  );
}

function GuideSettings() {
  const st = useSettings((s) => s.data);
  return (
    <Row>
      <span className="text-sm font-semibold">{S.guideSettings}</span>
      <Toggle
        checked={st.guides}
        onCheckedChange={(v) => useSettings.getState().patch({ guides: v })}
        aria-label={S.guides}
      />
      <input
        type="color"
        aria-label={S.guideColor}
        value={st.guideColor}
        onChange={(e) => useSettings.getState().patch({ guideColor: e.target.value })}
        className="h-7 w-8 rounded-sm border border-border bg-transparent"
      />
    </Row>
  );
}

/* ---------- 快捷鍵（F261） ---------- */

function ShortcutSettings() {
  const n = useNotify();
  const keys = useSettings((s) => s.data.keys);
  const [rec, setRec] = useState<string | null>(null);
  useEffect(() => {
    if (!rec) return;
    const down = (e: KeyboardEvent) => {
      const combo = comboFromEvent(e);
      if (!combo) return;
      e.preventDefault();
      e.stopPropagation();
      if (combo === 'escape') {
        setRec(null);
        return;
      }
      const other = ACTIONS.find((a) => a.id !== rec && sameCombo(keyOf(a.id, keys), combo));
      if (other) n(S.shortcutDup(S.actions[other.id]), 'warning');
      else {
        useSettings.getState().patch({ keys: { ...keys, [rec]: combo } });
        n(S.shortcutSet(comboText(combo)), 'success');
      }
      setRec(null);
    };
    window.addEventListener('keydown', down, true);
    return () => window.removeEventListener('keydown', down, true);
  }, [rec, keys, n]);
  const groups: ActionGroup[] = ['basic', 'view', 'pages', 'parts'];
  return (
    <Card title={S.shortcutsTitle} sub={S.shortcutsLead} data-testid="shortcut-settings">
      {groups.map((g) => (
        <div key={g} className="flex flex-col gap-1">
          <b className="text-xs">{S.shortcutGroups[g]}</b>
          {ACTIONS.filter((a) => a.group === g).map((a) => {
            const k = keyOf(a.id, keys);
            return (
              <Row key={a.id}>
                <span className="w-44 text-sm">{S.actions[a.id]}</span>
                <span className="w-28 font-mono text-xs" data-shortcut={a.id}>
                  {rec === a.id ? S.shortcutRecording : k ? comboText(k) : S.shortcutNone}
                </span>
                <Button
                  size="sm"
                  variant={rec === a.id ? 'primary' : 'secondary'}
                  onClick={() => setRec(rec === a.id ? null : a.id)}
                >
                  {S.shortcutRecord}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => useSettings.getState().patch({ keys: { ...keys, [a.id]: '' } })}
                >
                  {S.shortcutClear}
                </Button>
              </Row>
            );
          })}
        </div>
      ))}
      <div>
        <Button size="sm" onClick={() => useSettings.getState().patch({ keys: {} })}>
          {S.shortcutReset}
        </Button>
      </div>
    </Card>
  );
}

/* ---------- 新物件的預設值（F262、F263）、名稱符號（F264）、找圖網站（F265） ---------- */

function DefaultsSettings() {
  const d = useSettings((s) => s.data.defaults);
  const set = (k: keyof ToolDefaults, v: number | null) =>
    useSettings
      .getState()
      .patch({ defaults: { ...d, [k]: v ?? createToolSettings().defaults[k] } });
  return (
    <Card data-testid="defaults-settings">
      <b className="text-sm">{S.defaultsZTitle}</b>
      <Row>
        {(['zPart', 'zPanel', 'zTachie', 'zEffect'] as const).map((k) => (
          <Labeled key={k} label={S.defaultsFields[k]}>
            <NumCell
              aria-label={`${S.defaultsZTitle}：${S.defaultsFields[k]}`}
              value={d[k]}
              onCommit={(v) => set(k, v)}
            />
          </Labeled>
        ))}
      </Row>
      <b className="text-sm">{S.defaultsSizeTitle}</b>
      <Row>
        {(['part', 'panelW', 'tachieH'] as const).map((k) => (
          <Labeled key={k} label={S.defaultsFields[k]}>
            <NumCell
              aria-label={`${S.defaultsSizeTitle}：${S.defaultsFields[k]}`}
              value={d[k]}
              min={0}
              onCommit={(v) => set(k, v)}
            />
          </Labeled>
        ))}
      </Row>
      <Hint>
        {S.panelAuto}　{S.defaultsNote}
      </Hint>
    </Card>
  );
}

function SymbolSettings() {
  const symbols = useSettings((s) => s.data.symbols);
  return (
    <Card title={S.symbolsTitle} sub={S.symbolsHint}>
      <TextInput
        aria-label={S.symbolsTitle}
        value={symbols}
        onChange={(e) => useSettings.getState().patch({ symbols: e.target.value })}
      />
    </Card>
  );
}

function SiteSettings() {
  const sites = useSettings((s) => s.data.sites);
  const confirm = useConfirm();
  const set = (next: typeof sites) => useSettings.getState().patch({ sites: next });
  return (
    <Card title={S.sitesTitle} sub={S.sitesHint} data-testid="site-settings">
      {sites.map((s, i) => (
        <Row key={s.id}>
          <TextInput
            aria-label={`${S.siteName} ${i + 1}`}
            value={s.name}
            onChange={(e) =>
              set(sites.map((x) => (x.id === s.id ? { ...x, name: e.target.value } : x)))
            }
            className="w-36"
          />
          <TextInput
            aria-label={`${S.siteUrl} ${i + 1}`}
            value={s.url}
            onChange={(e) =>
              set(sites.map((x) => (x.id === s.id ? { ...x, url: e.target.value } : x)))
            }
            className="min-w-0 flex-1"
          />
          <IconButton
            size="sm"
            variant="ghost"
            label={S.moveUp}
            icon={<ArrowUp />}
            disabled={!i}
            onClick={() => set(swap(sites, i, i - 1))}
          />
          <IconButton
            size="sm"
            variant="ghost"
            label={S.moveDown}
            icon={<ArrowDown />}
            disabled={i === sites.length - 1}
            onClick={() => set(swap(sites, i, i + 1))}
          />
          <IconButton
            size="sm"
            variant="ghost"
            label={S.todoDelete}
            icon={<Trash2 />}
            onClick={() => set(sites.filter((x) => x.id !== s.id))}
          />
        </Row>
      ))}
      <Row>
        <Button
          size="sm"
          onClick={() => set([...sites, { id: newLocalId('site'), name: '', url: 'https://' }])}
        >
          {S.siteAdd}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={async () => {
            if (await confirm({ title: S.siteReset, description: S.siteResetConfirm }))
              set(DEFAULT_SITES.map((x, i) => ({ id: `site${i + 1}`, ...x })));
          }}
        >
          {S.siteReset}
        </Button>
      </Row>
    </Card>
  );
}

const swap = <T,>(list: T[], a: number, b: number): T[] => {
  const out = [...list];
  [out[a], out[b]] = [out[b], out[a]];
  return out;
};

/* ---------- 演出預設（F266） ---------- */

function PresetSettings() {
  const n = useNotify();
  const confirm = useConfirm();
  const entries = useLibrary((s) => s.data.effectPresets);
  const zEffect = useSettings((s) => s.data.defaults.zEffect);
  const [form, setForm] = useState({
    name: '',
    imageUrl: null as string | null,
    z: zEffect,
    kind: 'full' as 'full' | 'free',
    fullFit: 'cover' as FullFit,
    text: '',
  });
  const [opts, setOpts] = useState(false);
  const [sep, setSep] = useState('');
  const { rowProps, handleProps } = useEntryDrag(entries, (from, to, after) =>
    commitLibrary((lib) => ({
      ...lib,
      effectPresets: moveEntry(lib.effectPresets, from, to, after),
    })),
  );
  const register = async () => {
    const name = form.name.trim() || S.presetDefaultName;
    const dup = presetItems().find((x) => x.name === name);
    if (dup && !(await confirm({ title: S.presetRegister, description: S.presetDup(name) })))
      return;
    await saveEffectPreset({ ...form, name, width: 6, height: 6 }, dup?.id);
    setForm({ ...form, name: '', text: '' });
    n(S.presetSaved, 'success');
  };
  return (
    <Card title={S.presetsTitle} sub={S.presetsLead} data-testid="preset-settings">
      <Row>
        <Labeled label={S.presetName}>
          <TextInput
            aria-label={S.presetName}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="w-36"
          />
        </Labeled>
        <Labeled label={S.presetImage}>
          <ImageField
            aria-label={S.presetImage}
            value={form.imageUrl}
            onChange={(v) => setForm({ ...form, imageUrl: v })}
            useFor="effect"
          />
        </Labeled>
        <Labeled label={S.zOrder}>
          <NumCell
            aria-label={`${S.presetsTitle}：${S.zOrder}`}
            value={form.z}
            onCommit={(v) => setForm({ ...form, z: v ?? zEffect })}
          />
        </Labeled>
        <Button size="sm" variant="ghost" aria-expanded={opts} onClick={() => setOpts(!opts)}>
          {opts ? '▾' : '▸'} {S.effectOptions}
        </Button>
        <Button size="sm" variant="primary" onClick={() => void register()}>
          {S.presetRegister}
        </Button>
      </Row>
      {opts ? (
        <Row>
          <PresetOptions value={form} onChange={(p) => setForm({ ...form, ...p })} />
        </Row>
      ) : null}
      <Row>
        <TextInput
          aria-label={S.presetSeparator}
          placeholder={S.presetSeparator}
          value={sep}
          onChange={(e) => setSep(e.target.value)}
          className="w-40"
        />
        <Button
          size="sm"
          onClick={() => {
            if (!sep.trim()) return n(S.cutinSeparatorEmpty, 'warning');
            commitLibrary((lib) => ({
              ...lib,
              effectPresets: [
                ...lib.effectPresets,
                { type: 'separator', id: newLocalId('sep'), label: sep.trim() },
              ],
            }));
            setSep('');
          }}
        >
          {S.presetSeparatorAdd}
        </Button>
      </Row>
      {!entries.length ? <Hint>{S.presetsEmpty}</Hint> : null}
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {entries.map((e, i) => (
          <li
            key={entryId(e)}
            {...rowProps(i)}
            className={cn(
              'flex min-w-0 flex-wrap items-center gap-2 rounded-sm bg-surface-2 p-1',
              rowProps(i).className,
            )}
          >
            <span
              {...handleProps(i)}
              title={S.dragHandle}
              aria-hidden
              className="cursor-grab text-muted [&_svg]:size-4"
            >
              <GripVertical />
            </span>
            {e.type === 'separator' ? (
              <>
                <TextInput
                  aria-label={S.presetSeparator}
                  value={e.label}
                  onChange={(ev) =>
                    commitLibrary((lib) => ({
                      ...lib,
                      effectPresets: lib.effectPresets.map((x) =>
                        x.type === 'separator' && x.id === e.id
                          ? { ...x, label: ev.target.value }
                          : x,
                      ),
                    }))
                  }
                  className="min-w-0 flex-1 font-semibold"
                />
                <IconButton
                  size="sm"
                  variant="ghost"
                  label={S.todoDelete}
                  icon={<Trash2 />}
                  onClick={() =>
                    commitLibrary((lib) => ({
                      ...lib,
                      effectPresets: lib.effectPresets.filter((x) => entryId(x) !== e.id),
                    }))
                  }
                />
              </>
            ) : (
              <PresetRow item={e.item} />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PresetOptions({
  value,
  onChange,
}: {
  value: { kind: 'full' | 'free'; fullFit: FullFit; text: string };
  onChange: (p: Partial<{ kind: 'full' | 'free'; fullFit: FullFit; text: string }>) => void;
}) {
  return (
    <>
      <Labeled label={S.presetKind}>
        <Select
          aria-label={S.presetKind}
          value={value.kind}
          onValueChange={(v) => onChange({ kind: v as 'full' | 'free' })}
          options={[
            { value: 'full', label: S.effectModes.full },
            { value: 'free', label: S.effectModes.free },
          ]}
        />
      </Labeled>
      <Labeled label={S.presetFit}>
        <Select
          aria-label={S.presetFit}
          value={value.fullFit}
          onValueChange={(v) => onChange({ fullFit: v as FullFit })}
          options={(['stretch', 'cover', 'contain'] as const).map((v) => ({
            value: v,
            label: S.presetFits[v],
          }))}
        />
      </Labeled>
      <Labeled label={S.effectText}>
        <TextInput
          aria-label={S.effectText}
          value={value.text}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      </Labeled>
    </>
  );
}

function PresetRow({ item }: { item: ReturnType<typeof presetItems>[number] }) {
  const confirm = useConfirm();
  const [opts, setOpts] = useState(false);
  const mat = useProject((s) => s.data.materials.find((m) => m.name === item.imageUrl));
  return (
    <>
      <button
        type="button"
        aria-label={`${S.presetImage}：${item.name}`}
        onClick={() =>
          setSession({
            picker: {
              current: item.imageUrl,
              empty: S.imgEmpty,
              role: 'effect',
              apply: (v) => void setEffectPresetImage(item.id, v),
            },
          })
        }
      >
        <Thumb name={item.imageUrl} className="size-9" />
      </button>
      <span className="hidden w-20 truncate text-[11px] text-muted sm:inline">
        {item.imageLabel}
      </span>
      <TextInput
        aria-label={`${S.presetName}：${item.name}`}
        defaultValue={item.name}
        onBlur={(e) => updateEffectPreset(item.id, { name: e.target.value.trim() || item.name })}
        className="w-32"
      />
      {(['z', 'width', 'height'] as const).map((k) => (
        <NumCell
          key={k}
          aria-label={`${k === 'z' ? S.zOrder : k === 'width' ? S.width : S.height}：${item.name}`}
          value={item[k]}
          className="w-14"
          onCommit={(v) => v != null && updateEffectPreset(item.id, { [k]: v })}
        />
      ))}
      {mat?.animated ? <span className="text-[11px] text-accent">{S.animated}</span> : null}
      <Button size="sm" variant="ghost" aria-expanded={opts} onClick={() => setOpts(!opts)}>
        {opts ? '▾' : '▸'} {S.effectOptions}
      </Button>
      <IconButton
        size="sm"
        variant="ghost"
        label={S.todoDelete}
        icon={<Trash2 />}
        onClick={async () => {
          if (
            !(await confirm({
              title: S.todoDelete,
              description: S.presetDeleteConfirm(item.name),
              danger: true,
            }))
          )
            return;
          commitLibrary((lib) => ({
            ...lib,
            effectPresets: lib.effectPresets.filter((x) => entryId(x) !== item.id),
          }));
        }}
      />
      {opts ? (
        <div className="flex w-full flex-wrap gap-2 pl-6">
          <PresetOptions value={item} onChange={(p) => updateEffectPreset(item.id, p)} />
        </div>
      ) : null}
    </>
  );
}

/* ---------- 共用範本管理（F267、F268） ---------- */

function TemplateManager() {
  const n = useNotify();
  const lib = useLibrary((s) => s.data);
  const sceneTemplates = useProject((s) => s.data.sceneTemplates);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const isOpen = (k: string, has: boolean) => open[k] ?? has;
  const section = (k: keyof typeof S.manageKinds, count: number, body: React.ReactNode) => (
    <div className="flex flex-col gap-1" key={k}>
      <button
        type="button"
        aria-expanded={isOpen(k, count > 0)}
        onClick={() => setOpen({ ...open, [k]: !isOpen(k, count > 0) })}
        className="self-start text-sm font-semibold"
      >
        {isOpen(k, count > 0) ? '▾' : '▸'} {S.manageKinds[k]}（{count}）
      </button>
      {isOpen(k, count > 0) ? body : null}
    </div>
  );
  const cutins = lib.cutinTemplates.flatMap((e) => (e.type === 'item' ? [e.item] : []));
  const markers = lib.partTemplates.filter((t) => t.kind === 'marker');
  const panels = lib.partTemplates.filter((t) => t.kind === 'panel');
  const rename = (kind: 'part' | 'piece', id: string, name: string) =>
    commitLibrary((l) =>
      kind === 'part'
        ? { ...l, partTemplates: l.partTemplates.map((t) => (t.id === id ? { ...t, name } : t)) }
        : { ...l, pieceTemplates: l.pieceTemplates.map((t) => (t.id === id ? { ...t, name } : t)) },
    );
  const partRows = (list: typeof markers) =>
    list.map((t) => (
      <Row key={t.id}>
        <Thumb name={t.imageUrl} className="size-9" />
        <TextInput
          aria-label={`${S.manageKinds.marker}：${t.name}`}
          defaultValue={t.name}
          onBlur={(e) => rename('part', t.id, e.target.value.trim() || t.name)}
          className="w-36"
        />
        <span className="text-xs text-muted">
          {t.width}×{t.height}
        </span>
        <Button
          size="sm"
          onClick={async () => {
            await addPartFromTemplate(t.id);
            n(S.templateAdded, 'success');
          }}
        >
          {S.manageUse}
        </Button>
        <IconButton
          size="sm"
          variant="ghost"
          label={S.manageDelete}
          icon={<Trash2 />}
          onClick={() =>
            commitLibrary((l) => ({
              ...l,
              partTemplates: l.partTemplates.filter((x) => x.id !== t.id),
            }))
          }
        />
      </Row>
    ));
  return (
    <Card title={S.manageTitle} data-testid="template-manager">
      <Row>
        <Button size="sm" icon={<Download />} onClick={exportTemplates}>
          {S.manageExport}
        </Button>
        <Button
          size="sm"
          icon={<FolderOpen />}
          onClick={async () => {
            const [f] = await pickFiles({ accept: '.json,application/json' });
            if (!f) return;
            try {
              n(S.manageImported(importTemplates(await readAsText(f))), 'success');
            } catch {
              n(S.manageImportFailed, 'danger');
            }
          }}
        >
          {S.manageImport}
        </Button>
      </Row>
      <Hint>{S.manageNote}</Hint>
      {section(
        'scene',
        sceneTemplates.length,
        sceneTemplates.map((t) => (
          <Row key={t.id}>
            <Thumb name={t.foregroundUrl} className="h-9 w-14" fit="cover" />
            <TextInput
              aria-label={`${S.manageKinds.scene}：${t.name}`}
              defaultValue={t.name}
              onBlur={(e) =>
                commit((d) => {
                  const x = d.sceneTemplates.find((y) => y.id === t.id);
                  if (x) x.name = e.target.value.trim() || t.name;
                })
              }
              className="w-36"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setSession({ modal: { kind: 'templateDetail', ref: { kind: 'scene', id: t.id } } })
              }
            >
              {S.manageEdit}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                let id: string | null = null;
                commit((d, c) => {
                  id = sceneFromTemplate(d, t.id, c)?.id ?? null;
                });
                if (id) {
                  setSession({ sceneId: id, sceneSel: [] });
                  goPage('scenes');
                }
              }}
            >
              {S.manageUse}
            </Button>
            <IconButton
              size="sm"
              variant="ghost"
              label={S.manageDelete}
              icon={<Trash2 />}
              onClick={() =>
                commit((d) => {
                  d.sceneTemplates = d.sceneTemplates.filter((x) => x.id !== t.id);
                })
              }
            />
          </Row>
        )),
      )}
      {section('marker', markers.length, partRows(markers))}
      {section('panel', panels.length, partRows(panels))}
      {section(
        'piece',
        lib.pieceTemplates.length,
        lib.pieceTemplates.map((t) => (
          <Row key={t.id}>
            <Thumb name={t.iconUrl} className="size-9" />
            <TextInput
              aria-label={`${S.manageKinds.piece}：${t.name}`}
              defaultValue={t.name}
              onBlur={(e) => rename('piece', t.id, e.target.value.trim() || t.name)}
              className="w-36"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSession({ modal: { kind: 'pieceTemplate', id: t.id } })}
            >
              {S.manageEdit}
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                await addPieceFromTemplate(t.id);
                n(S.pieceTemplateUsed, 'success');
              }}
            >
              {S.manageUse}
            </Button>
            <IconButton
              size="sm"
              variant="ghost"
              label={S.manageDelete}
              icon={<Trash2 />}
              onClick={() =>
                commitLibrary((l) => ({
                  ...l,
                  pieceTemplates: l.pieceTemplates.filter((x) => x.id !== t.id),
                }))
              }
            />
          </Row>
        )),
      )}
      {section(
        'cutin',
        cutins.length,
        cutins.map((t) => (
          <Row key={t.id}>
            <Thumb name={t.imageUrl} className="size-9" />
            <TextInput
              aria-label={`${S.manageKinds.cutin}：${t.name}`}
              defaultValue={t.name}
              onBlur={(e) => updateCutinTemplate(t.id, { name: e.target.value.trim() || t.name })}
              className="w-36"
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() =>
                setSession({ modal: { kind: 'templateDetail', ref: { kind: 'cutin', id: t.id } } })
              }
            >
              {S.manageEdit}
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                if (t.imageUrl)
                  await ensureMaterial(t.imageUrl, {
                    label: t.imageLabel || t.name,
                    tags: ['effect'],
                  });
                commit(
                  (d) =>
                    void d.cutins.unshift({
                      id: `${Date.now().toString(36)}c`,
                      name: t.name,
                      imageUrl: t.imageUrl,
                    }),
                );
                goPage('cutins');
              }}
            >
              {S.manageUse}
            </Button>
            <IconButton
              size="sm"
              variant="ghost"
              label={S.manageDelete}
              icon={<Trash2 />}
              onClick={() =>
                commitLibrary((l) => ({
                  ...l,
                  cutinTemplates: l.cutinTemplates.filter((x) => entryId(x) !== t.id),
                }))
              }
            />
          </Row>
        )),
      )}
    </Card>
  );
}

/* ---------- 儲存與匯出（F269～F272） ---------- */

function RoomOutput() {
  const room = useProject((s) => s.data.room);
  return (
    <Card title={S.roomOutTitle} sub={S.roomOutNote} data-testid="room-output">
      <Checkbox
        checked={room.bgmCrossfade}
        onCheckedChange={(v) =>
          commit((d) => {
            d.room.bgmCrossfade = !!v;
          })
        }
        aria-label={S.bgmCrossfade}
        label={S.bgmCrossfade}
      />
      <Checkbox
        checked={room.legacyDice}
        onCheckedChange={(v) =>
          commit((d) => {
            d.room.legacyDice = !!v;
          })
        }
        aria-label={S.legacyDice}
        label={S.legacyDice}
      />
    </Card>
  );
}

function NoimageSettings() {
  const st = useSettings((s) => s.data);
  return (
    <Card title={S.noimageTitle} sub={S.noimageNote} data-testid="noimage-settings">
      <Checkbox
        checked={st.noimage}
        onCheckedChange={(v) => useSettings.getState().patch({ noimage: !!v })}
        aria-label={S.noimageOn}
        label={S.noimageOn}
      />
      <Row>
        <Labeled label={S.noimageCount}>
          <NumberInput
            aria-label={S.noimageCount}
            value={st.noimageCount}
            min={1}
            max={3}
            onChange={(v) => useSettings.getState().patch({ noimageCount: v })}
          />
        </Labeled>
        <Labeled label={S.noimageZ}>
          <NumCell
            aria-label={S.noimageZ}
            value={st.noimageZ}
            onCommit={(v) => useSettings.getState().patch({ noimageZ: v ?? 45 })}
          />
        </Labeled>
      </Row>
    </Card>
  );
}

function AutoSaves() {
  const n = useNotify();
  const confirm = useConfirm();
  const [list, setList] = useState(autoSaves());
  useEffect(() => setList(autoSaves()), []);
  const label = (ms: number) => {
    const d = new Date(ms);
    const p = (x: number) => String(x).padStart(2, '0');
    return `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
  };
  return (
    <Card title={S.autosavesTitle} sub={S.autosavesLead} data-testid="autosaves">
      {!list.length ? <Hint>{S.autosavesNone}</Hint> : null}
      <Row>
        {list.map((a) => (
          <Button
            key={a.at}
            size="sm"
            title={a.title}
            onClick={async () => {
              if (
                !(await confirm({
                  title: S.autosaveRestore(label(a.at)),
                  description: S.autosaveConfirm,
                }))
              )
                return;
              useProject.getState().replace(normalizeProject(JSON.parse(a.data)));
              n(S.autosaveRestored, 'success');
            }}
          >
            {S.autosaveRestore(label(a.at))}
          </Button>
        ))}
      </Row>
    </Card>
  );
}

function SaveTarget() {
  const n = useNotify();
  const ok = canWriteFiles();
  return (
    <Card title={S.saveTargetTitle}>
      {ok ? (
        <>
          <Hint>{S.saveTargetSupported}</Hint>
          <div>
            <Button
              size="sm"
              onClick={() => {
                saveTarget.handle = null;
                void saveProject('saveAs', n);
              }}
            >
              {S.saveTargetChoose}
            </Button>
          </div>
        </>
      ) : (
        <Hint>{S.saveTargetUnsupported}</Hint>
      )}
    </Card>
  );
}
