/**
 * 側欄的區塊：加入參戰者、傷害與治療、選項、匯入與匯出（含「關於規則內容」）。
 */
import { Download, FileJson, Info, Plus, X } from 'lucide-react';
import { type KeyboardEvent, useRef, useState } from 'react';
import { downloadText, pickFiles, readAsText } from '@/core/files';
import { SRD_SOURCES, SRD_TRANSLATION_NOTE } from '@/core/srd5/sources';
import { COMBAT_RULES } from '@/core/srd5/srd52/combat';
import {
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  Field,
  FieldRow,
  NumberInput,
  Section,
  Segmented,
  Select,
  TextInput,
  Toggle,
  useToast,
} from '@/ui';
import { OptionalNumberInput } from '@/ui/OptionalNumberInput';
import { damage, giveTemp, heal } from './actions';
import {
  addCombatants,
  appendCombatants,
  currentId,
  HP_SHOWS,
  INIT_DICE,
  type InitDie,
  LIMITS,
  OriginalJsonError,
  originalJson,
  originalJsonName,
  parseOriginalJson,
  type Settings,
  SIDES,
  type Side,
} from './model';
import { data, edit, step, useCombat, useUi } from './store';
import { S } from './strings';

/* ---------- 加入參戰者 ---------- */

interface AddForm {
  name: string;
  side: Side;
  init: number | null;
  initMod: number | null;
  maxHp: number | null;
  ac: number | null;
  qty: number;
}

const EMPTY: AddForm = {
  name: '',
  side: 'enemy',
  init: null,
  initMod: null,
  maxHp: null,
  ac: null,
  qty: 1,
};

export function AddPanel() {
  const toast = useToast();
  const die = useCombat((s) => s.data.settings.initDie);
  const full = useCombat((s) => s.data.list.length >= LIMITS.list);
  const [form, setForm] = useState<AddForm>(EMPTY);
  /* Enter 時讀最新的值（數字欄在同一個按鍵事件裡才寫回） */
  const ref = useRef<AddForm>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const set = <K extends keyof AddForm>(k: K, v: AddForm[K]) => {
    ref.current = { ...ref.current, [k]: v };
    setForm(ref.current);
    if (k === 'name') setError(null);
  };

  const submit = () => {
    const f = ref.current;
    if (!f.name.trim()) {
      setError(S.add.needName);
      box.current?.querySelector<HTMLInputElement>('[data-add="name"]')?.focus();
      return;
    }
    let n = 0;
    step((d) => {
      n = addCombatants(d, { ...f }).length;
    });
    if (!n) {
      toast({ title: S.add.full, tone: 'warning' });
      return;
    }
    toast({ title: S.add.added(n), tone: 'success', replace: true });
    ref.current = { ...EMPTY, side: f.side };
    setForm(ref.current);
    setNonce((x) => x + 1);
    requestAnimationFrame(() =>
      box.current?.querySelector<HTMLInputElement>('[data-add="name"]')?.focus(),
    );
  };

  /* Enter：移到下一欄；在最後一欄（數量）加入（原作的操作） */
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Enter' || e.nativeEvent.isComposing) return;
    const t = e.target as HTMLElement;
    if (t.tagName !== 'INPUT') return;
    const inputs = Array.from(
      box.current?.querySelectorAll<HTMLInputElement>('input[data-add], [data-add] input') ?? [],
    );
    const i = inputs.indexOf(t as HTMLInputElement);
    if (i < 0) return;
    e.preventDefault();
    if (i === inputs.length - 1) submit();
    else inputs[i + 1].focus();
  };

  return (
    <Section title={S.add.title} persistKey="combat-tracker:add" fixed>
      {/* biome-ignore lint/a11y/noStaticElementInteractions: 只是接住欄位裡的 Enter */}
      <div ref={box} className="flex flex-col gap-3" onKeyDown={onKey} key={nonce}>
        <Field label={S.add.name} error={error}>
          <TextInput
            data-add="name"
            value={form.name}
            maxLength={LIMITS.name}
            placeholder={S.add.namePlaceholder}
            onChange={(e) => set('name', e.target.value)}
          />
        </Field>
        <Field label={S.add.side}>
          <Segmented
            value={form.side}
            onValueChange={(v) => set('side', v)}
            options={SIDES.map((s) => ({ value: s, label: S.side[s] }))}
            fullWidth
          />
        </Field>
        <FieldRow columns={2}>
          <Field label={S.add.init}>
            <div data-add="init">
              <OptionalNumberInput
                value={form.init}
                onChange={(v) => set('init', v)}
                min={LIMITS.init[0]}
                max={LIMITS.init[1]}
                placeholder={die === 'none' ? S.add.initPlaceholderNone : S.add.initPlaceholder}
              />
            </div>
          </Field>
          <Field label={S.add.initMod}>
            <div data-add="initMod">
              <OptionalNumberInput
                value={form.initMod}
                onChange={(v) => set('initMod', v)}
                min={LIMITS.initMod[0]}
                max={LIMITS.initMod[1]}
                placeholder="+0"
              />
            </div>
          </Field>
          <Field label={S.add.maxHp}>
            <div data-add="maxHp">
              <OptionalNumberInput
                value={form.maxHp}
                onChange={(v) => set('maxHp', v)}
                min={LIMITS.hp[0]}
                max={LIMITS.hp[1]}
                placeholder={S.add.maxHpPlaceholder}
              />
            </div>
          </Field>
          <Field label={S.add.ac}>
            <div data-add="ac">
              <OptionalNumberInput
                value={form.ac}
                onChange={(v) => set('ac', v)}
                min={LIMITS.ac[0]}
                max={LIMITS.ac[1]}
                placeholder="—"
              />
            </div>
          </Field>
        </FieldRow>
        <div className="flex items-end gap-2">
          <Field label={S.add.qty} className="w-28">
            <div data-add="qty">
              <NumberInput
                value={form.qty}
                onChange={(v) => set('qty', v)}
                min={1}
                max={LIMITS.qty}
              />
            </div>
          </Field>
          <Button
            variant="primary"
            icon={<Plus />}
            onClick={submit}
            disabled={full}
            className="flex-1"
          >
            {S.add.submit}
          </Button>
        </div>
        {die !== 'none' ? <p className="m-0 text-xs text-muted">{S.add.initHint}</p> : null}
      </div>
    </Section>
  );
}

/* ---------- 傷害與治療 ---------- */

export function HpPanel() {
  const toast = useToast();
  const selected = useUi((s) => s.selected);
  const list = useCombat((s) => s.data.list);
  const deathSaves = useCombat((s) => s.data.settings.deathSaves);
  const turn = useCombat((s) => currentId(s.data));
  const [amount, setAmount] = useState(5);
  const [crit, setCrit] = useState(false);
  const ids = selected.length ? selected : turn ? [turn] : [];
  const currentName = list.find((c) => c.id === turn)?.name ?? null;
  return (
    <Section title={S.hp.title} persistKey="combat-tracker:hp" fixed>
      <div className="flex flex-col gap-3" data-testid="hp-panel">
        <p className="m-0 text-xs text-muted" aria-live="polite">
          {S.hp.target(selected.length, currentName)}
        </p>
        <Field label={S.hp.amount}>
          <NumberInput value={amount} onChange={setAmount} min={1} max={9999} />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <Button
            variant="danger"
            disabled={!ids.length}
            onClick={() => damage(ids, amount, toast, crit)}
          >
            {S.hp.damage}
          </Button>
          <Button
            variant="secondary"
            disabled={!ids.length}
            onClick={() => heal(ids, amount, toast)}
          >
            {S.hp.heal}
          </Button>
          <Button variant="secondary" disabled={!ids.length} onClick={() => giveTemp(ids, amount)}>
            {S.hp.temp}
          </Button>
        </div>
        <p className="m-0 text-xs text-muted">{S.hp.tempHint}</p>
        {deathSaves ? (
          <Checkbox checked={crit} onCheckedChange={setCrit} label={S.hp.crit} />
        ) : null}
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={!list.length}
            onClick={() => useUi.setState({ selected: data().list.map((c) => c.id) })}
          >
            {S.hp.selectAll}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!selected.length}
            onClick={() => useUi.setState({ selected: [] })}
          >
            {S.hp.clearSel}
          </Button>
        </div>
      </div>
    </Section>
  );
}

/* ---------- 選項 ---------- */

function setSetting<K extends keyof Settings>(k: K, v: Settings[K]) {
  step((d) => {
    d.settings[k] = v;
  });
}

export function OptionsPanel() {
  const s = useCombat((st) => st.data.settings);
  const custom = useCombat((st) => st.data.customConds);
  const [name, setName] = useState('');
  const addCustom = () => {
    const v = Array.from(name.trim()).slice(0, LIMITS.customName).join('');
    if (!v) return;
    edit((d) => {
      if (!d.customConds.includes(v) && d.customConds.length < LIMITS.customConds)
        d.customConds.push(v);
    });
    setName('');
  };
  return (
    <Section title={S.options.title} persistKey="combat-tracker:options">
      <div className="flex flex-col gap-3">
        <h3 className="m-0 text-sm font-semibold">{S.options.rules5e}</h3>
        <Field label={S.options.deathSaves} layout="inline" hint={S.options.deathSavesHint}>
          <Toggle checked={s.deathSaves} onCheckedChange={(v) => setSetting('deathSaves', v)} />
        </Field>
        <Field label={S.options.srdConds} layout="inline" hint={S.options.srdCondsHint}>
          <Toggle checked={s.srdConds} onCheckedChange={(v) => setSetting('srdConds', v)} />
        </Field>
        <Field label={S.options.initDie}>
          <Select<InitDie>
            value={s.initDie}
            onValueChange={(v) => setSetting('initDie', v)}
            options={INIT_DICE.map((v) => ({ value: v, label: S.options.dice[v] }))}
          />
        </Field>
        <Field label={S.options.groupRoll} layout="inline" hint={S.options.groupRollHint}>
          <Toggle checked={s.groupRoll} onCheckedChange={(v) => setSetting('groupRoll', v)} />
        </Field>
        <Field label={S.options.skipDown} layout="inline" hint={S.options.skipDownHint}>
          <Toggle checked={s.skipDown} onCheckedChange={(v) => setSetting('skipDown', v)} />
        </Field>
        <h3 className="m-0 text-sm font-semibold">{S.options.player}</h3>
        <Field label={S.options.hpEnemy} hint={S.options.hpShowHint}>
          <Segmented
            value={s.playerHpEnemy}
            onValueChange={(v) => setSetting('playerHpEnemy', v)}
            options={HP_SHOWS.map((v) => ({ value: v, label: S.options.hpShow[v] }))}
            fullWidth
          />
        </Field>
        <Field label={S.options.hpParty}>
          <Segmented
            value={s.playerHpParty}
            onValueChange={(v) => setSetting('playerHpParty', v)}
            options={HP_SHOWS.map((v) => ({ value: v, label: S.options.hpShow[v] }))}
            fullWidth
          />
        </Field>
        <Field label={S.options.playerConds} layout="inline">
          <Toggle checked={s.playerConds} onCheckedChange={(v) => setSetting('playerConds', v)} />
        </Field>
        <h3 className="m-0 text-sm font-semibold">{S.options.custom}</h3>
        <p className="m-0 text-xs text-muted">{S.options.customHint}</p>
        <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label={S.options.custom}>
          {custom.map((n) => (
            <li
              key={n}
              className="inline-flex items-center gap-0.5 rounded-full border border-border bg-surface-2 py-0.5 pr-1 pl-2.5 text-xs"
            >
              {n}
              <button
                type="button"
                aria-label={S.options.customRemove(n)}
                className="focus-visible:focus-ring rounded-full p-0.5 text-muted hover:text-danger"
                onClick={() =>
                  edit((d) => {
                    d.customConds = d.customConds.filter((x) => x !== n);
                  })
                }
              >
                <X aria-hidden className="size-3" />
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <TextInput
            aria-label={S.options.custom}
            value={name}
            maxLength={LIMITS.customName}
            placeholder={S.options.customPlaceholder}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) addCustom();
            }}
          />
          <Button
            size="md"
            onClick={addCustom}
            disabled={!name.trim() || custom.length >= LIMITS.customConds}
          >
            {S.options.customAdd}
          </Button>
        </div>
      </div>
    </Section>
  );
}

/* ---------- 匯入與匯出、關於規則內容 ---------- */

export function DataPanel() {
  const toast = useToast();
  const [about, setAbout] = useState(false);
  const importOriginal = async () => {
    const [file] = await pickFiles({ accept: '.json,application/json' });
    if (!file) return;
    try {
      const list = parseOriginalJson(await readAsText(file));
      let n = 0;
      step((d) => {
        n = appendCombatants(d, list);
      });
      toast({ title: S.data.imported(n), description: file.name, tone: 'success' });
    } catch (e) {
      toast({
        title: S.data.importFailed(file.name),
        description: e instanceof OriginalJsonError ? e.message : String(e),
        tone: 'danger',
      });
    }
  };
  const exportOriginal = () => {
    const now = new Date();
    downloadText(originalJson(data(), now), originalJsonName(now), 'application/json');
  };
  return (
    <Section title={S.data.title} persistKey="combat-tracker:data">
      <div className="flex flex-col gap-2">
        <p className="m-0 text-xs text-muted">{S.data.importHint}</p>
        <Button icon={<FileJson />} onClick={() => void importOriginal()}>
          {S.data.importOriginal}
        </Button>
        <Button icon={<Download />} onClick={exportOriginal}>
          {S.data.exportOriginal}
        </Button>
        <Button icon={<Info />} variant="ghost" onClick={() => setAbout(true)}>
          {S.about.button}
        </Button>
        <AboutDialog open={about} onOpenChange={setAbout} />
      </div>
    </Section>
  );
}

export function AboutDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const src = SRD_SOURCES.srd52;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={S.about.title}
      size="lg"
      footer={<DialogClose />}
    >
      <div className="flex flex-col gap-3 text-sm" data-testid="about-rules">
        <p className="m-0">{S.about.lead}</p>
        <section className="rounded-md border border-border bg-surface-2 p-3">
          <p className="m-0 font-semibold">
            <a href={src.url} target="_blank" rel="noreferrer" className="text-accent underline">
              {src.name}
            </a>
            （
            <a
              href={src.licenseUrl}
              target="_blank"
              rel="noreferrer"
              className="text-accent underline"
            >
              {src.license}
            </a>
            ）
          </p>
          <p className="m-0 mt-1 font-mono text-xs leading-relaxed" lang="en">
            {src.attribution}
          </p>
        </section>
        <p className="m-0 text-xs text-muted">{SRD_TRANSLATION_NOTE}</p>
        <h3 className="m-0 text-sm font-semibold">{S.about.rules}</h3>
        <ul className="m-0 flex flex-col gap-1 pl-5 text-xs">
          {Object.values(COMBAT_RULES).map((t) => (
            <li key={t}>{t}</li>
          ))}
        </ul>
        <p className="m-0 text-xs text-muted">{S.about.tool}</p>
      </div>
    </Dialog>
  );
}
