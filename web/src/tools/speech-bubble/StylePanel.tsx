/**
 * 「樣式」分頁（規格 F57、F58、F66）：樣式預設檔（內建、自己存的；套用、存、匯出、匯入、刪除）、
 * 三側（靠左、置中、靠右）各自的預設樣式。
 */
import { Copy, Download, FileUp, Paintbrush, Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { addImageFile } from '@/core/assets';
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
import { FrameFields, MetaFields, PaletteFields, TextFields } from './LookFields';
import { ALIGNS, type Align, ICON_IDS, type SbData } from './model';
import { StyleChoice } from './StyleChoice';
import {
  assets,
  copySide,
  edit,
  type LookPatch,
  savedStyles,
  setSideLook,
  stylePatch,
  usePrefs,
  useSb,
  useUi,
} from './store';
import { ICON_NAMES, S, SIDE_NAMES } from './strings';
import {
  applyStyleSet,
  BUILTIN_STYLES,
  captureStyle,
  cleanStyleName,
  MAX_SAVED_STYLES,
  newStyleId,
  parseStyleFile,
  type SavedStyle,
  StyleFileError,
  styleFileJson,
  styleFileName,
} from './stylePresets';
import { styleFields } from './styles';

/* ---------- 樣式預設檔 ---------- */

/** 樣式的小色票：靠左、靠右的底色＋卡片底 */
function Swatch({ s }: { s: SavedStyle }) {
  return (
    <span
      aria-hidden
      className="flex h-7 w-12 shrink-0 items-center justify-center gap-0.5 rounded-sm border border-border-strong"
      style={{ background: s.card.bg ? s.card.color : 'transparent' }}
    >
      <span className="size-3 rounded-full" style={{ background: s.sides.left.colors.fill }} />
      <span className="size-3 rounded-full" style={{ background: s.sides.right.colors.fill }} />
    </span>
  );
}

async function imageDataUrl(id: string | null): Promise<string | null> {
  if (!id) return null;
  const blob = await assets.get(id).catch(() => undefined);
  return blob ? readAsDataUrl(blob) : null;
}

function StylePresets() {
  const confirm = useConfirm();
  const toast = useToast();
  const stored = usePrefs((p) => p.data.styles);
  const list = [...BUILTIN_STYLES, ...savedStyles()];
  void stored;
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState('');

  const apply = async (s: SavedStyle) => {
    const ok = await confirm({
      title: S.applyStyleTitle(s.name),
      description: S.applyStyleDescription,
      confirmLabel: S.applyStyle,
    });
    if (!ok) return;
    edit((d) => applyStyleSet(d as SbData, s));
    toast({ title: S.appliedStyle(s.name), tone: 'success' });
  };

  const save = () => {
    const cur = savedStyles();
    if (cur.length >= MAX_SAVED_STYLES) {
      toast({ title: S.styleLimit(MAX_SAVED_STYLES), tone: 'warning' });
      return;
    }
    const n = cleanStyleName(name) || S.styleNameDefault;
    const style: SavedStyle = { ...captureStyle(useSb.getState().data), id: newStyleId(), name: n };
    usePrefs.getState().patch({ styles: [...cur, style] });
    setSaving(false);
    toast({ title: S.savedStyle(n), tone: 'success' });
  };

  const exportOne = async (s: SavedStyle) => {
    const image = await imageDataUrl(s.card.image);
    downloadText(styleFileJson(s, image), styleFileName(s.name), 'application/json;charset=utf-8');
  };

  const importFile = async () => {
    const [file] = await pickFiles({ accept: '.json,application/json' });
    if (!file) return;
    try {
      const { style, image } = parseStyleFile(await file.text());
      if (image) {
        const blob = await (await fetch(image)).blob();
        const added = await addImageFile(assets, blob, { maxSide: 2048 });
        style.card.image = added.ref.id;
      }
      const cur = savedStyles();
      if (cur.length >= MAX_SAVED_STYLES) {
        toast({ title: S.styleLimit(MAX_SAVED_STYLES), tone: 'warning' });
        return;
      }
      usePrefs.getState().patch({ styles: [...cur, style] });
      toast({ title: S.importedStyle(style.name), tone: 'success' });
    } catch (e) {
      toast({
        title: S.importStyleFailed,
        description: e instanceof StyleFileError ? e.message : S.importReadFailed,
        tone: 'danger',
      });
    }
  };

  const remove = async (s: SavedStyle) => {
    const ok = await confirm({
      title: S.deleteStyleTitle(s.name),
      description: S.deleteStyleDescription,
      confirmLabel: S.deleteStyle,
      danger: true,
    });
    if (!ok) return;
    usePrefs.getState().patch({ styles: savedStyles().filter((x) => x.id !== s.id) });
  };

  return (
    <Section
      title={S.stylePresetsSection}
      description={S.stylePresetsHint}
      persistKey="speech-bubble:style-presets"
    >
      <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={S.stylesLabel}>
        {list.map((s) => (
          <li
            key={s.id}
            className="flex min-h-11 items-center gap-2 rounded-md border border-border px-2 py-1"
            data-style-preset={s.id}
          >
            <Swatch s={s} />
            <span className="min-w-0 flex-1 truncate text-sm text-fg" title={s.name}>
              {s.name}
              {s.builtin ? (
                <span className="ml-1.5 rounded-sm bg-surface-3 px-1.5 py-0.5 text-xs text-muted">
                  {S.builtinTag}
                </span>
              ) : null}
            </span>
            <Button
              size="sm"
              icon={<Paintbrush />}
              aria-label={S.applyStyleLabel(s.name)}
              onClick={() => void apply(s)}
            >
              {S.applyStyle}
            </Button>
            <IconButton
              size="sm"
              label={S.exportStyleLabel(s.name)}
              icon={<Download />}
              onClick={() => void exportOne(s)}
            />
            {s.builtin ? null : (
              <IconButton
                size="sm"
                label={S.deleteStyleLabel(s.name)}
                icon={<Trash2 />}
                onClick={() => void remove(s)}
              />
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          icon={<Save />}
          onClick={() => {
            setName(S.styleNameDefault);
            setSaving(true);
          }}
        >
          {S.saveStyle}
        </Button>
        <Button size="sm" icon={<FileUp />} onClick={() => void importFile()}>
          {S.importStyle}
        </Button>
      </div>
      <Dialog
        open={saving}
        onOpenChange={setSaving}
        title={S.saveStyleTitle}
        description={S.saveStyleDescription}
        size="sm"
        footer={
          <>
            <DialogClose variant="ghost">{S.cancel}</DialogClose>
            <Button variant="primary" onClick={save}>
              {S.saveStyle.replace('…', '')}
            </Button>
          </>
        }
      >
        <Field label={S.styleName}>
          <TextInput
            value={name}
            maxLength={60}
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

/* ---------- 兩側的預設 ---------- */

function SideEditor() {
  const side = useUi((u) => u.side);
  const look = useSb((s) => s.data.sides[side]);
  const bubbles = useSb((s) => s.data.bubbles);
  const toast = useToast();
  const count = (a: Align) => bubbles.filter((b) => b.align === a).length;
  const change = (patch: LookPatch) => setSideLook(side, patch);
  const f = styleFields(look.style);
  return (
    <Section title={S.sidesSection} description={S.sidesHint} persistKey="speech-bubble:sides">
      <Field label={S.sidePick}>
        <Segmented<Align>
          value={side}
          onValueChange={(v) => useUi.setState({ side: v })}
          options={ALIGNS.map((a) => ({ value: a, label: S.sideOption(SIDE_NAMES[a], count(a)) }))}
          fullWidth
        />
      </Field>
      <div className="flex flex-wrap items-center gap-2" data-testid="side-copy">
        <span className="text-xs text-muted">{S.copySideTo}</span>
        {ALIGNS.filter((a) => a !== side).map((a) => (
          <Button
            key={a}
            size="sm"
            icon={<Copy />}
            aria-label={S.copySideLabel(SIDE_NAMES[a])}
            onClick={() => {
              copySide(side, a);
              toast({ title: S.copiedSide(SIDE_NAMES[side], SIDE_NAMES[a]), tone: 'success' });
            }}
          >
            {SIDE_NAMES[a]}
          </Button>
        ))}
      </div>
      <div className="flex flex-col gap-3" data-testid="side-editor" data-side={side}>
        <h4 className="m-0 text-sm font-semibold">{S.sideStyle}</h4>
        <StyleChoice
          label={`${S.sideStyle}（${SIDE_NAMES[side]}）`}
          value={look.style}
          onChange={(v) => change(stylePatch(v))}
        />
        <h4 className="m-0 text-sm font-semibold">{S.sideColors}</h4>
        <PaletteFields look={look} onChange={change} />
        <Field label={S.sideIcon} hidden={!f.icon}>
          <Select
            value={look.icon}
            onValueChange={(v) => change({ icon: v })}
            options={ICON_IDS.map((i) => ({ value: i, label: ICON_NAMES[i] }))}
          />
        </Field>
        <h4 className="m-0 border-t border-border pt-3 text-sm font-semibold">{S.textGroup}</h4>
        <TextFields look={look} onChange={change} />
        <h4 className="m-0 border-t border-border pt-3 text-sm font-semibold">{S.frameGroup}</h4>
        <FrameFields look={look} onChange={change} />
        <h4 className="m-0 border-t border-border pt-3 text-sm font-semibold">{S.metaGroup}</h4>
        <MetaFields look={look} onChange={change} />
      </div>
    </Section>
  );
}

export function StylePanel() {
  return (
    <div className="flex flex-col gap-3">
      <StylePresets />
      <SideEditor />
    </div>
  );
}
