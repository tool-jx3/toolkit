/**
 * 形狀分頁（規格 1.7）：名稱、對稱、顯示、鎖定；路徑的閉合、平滑化／轉角化、反轉；圓的數值；
 * 文字的內容、盧恩字盤與拉丁轉換、大小、字型、對齊；微調位移。
 */
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, LocateFixed } from 'lucide-react';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import {
  Button,
  Field,
  FieldRow,
  IconButton,
  NumberInput,
  Section,
  Segmented,
  Select,
  TextArea,
  TextInput,
  Toggle,
} from '@/ui';
import {
  applyRuneText,
  cornerSelectedNode,
  editPrimary,
  insertRuneText,
  notify,
  nudge,
  reverseSelectedPath,
  smoothSelectedNode,
  step,
} from './actions';
import { BufferedText, gesture, Placeholder, usePrimary } from './controls';
import { clamp } from './geometry';
import { type McElement, RANGE, TEXT_ALIGNS, type TextAlign, type TextElement } from './model';
import { convertLatinToRunes, filterRunes, RUNE_SET_IDS, type RuneSetId } from './runes';
import { useUi } from './store';
import { S } from './strings';

function RunePalette({ el }: { el: TextElement }) {
  const setId = useUi((s) => s.runeSet);
  const [query, setQuery] = useState('');
  const [latin, setLatin] = useState('');
  const [focusIndex, setFocusIndex] = useState(0);
  const grid = useRef<HTMLDivElement>(null);
  const runes = filterRunes(setId, query);
  const converted = convertLatinToRunes(latin, setId);
  const tabIndex = Math.min(focusIndex, Math.max(0, runes.length - 1));

  const onKey = (i: number, e: KeyboardEvent<HTMLButtonElement>) => {
    const buttons = [
      ...(grid.current?.querySelectorAll<HTMLButtonElement>('button[data-rune]') ?? []),
    ];
    let target: HTMLButtonElement | undefined;
    if (e.key === 'Home') target = buttons[0];
    else if (e.key === 'End') target = buttons[buttons.length - 1];
    else if (e.key === 'ArrowLeft') target = buttons[Math.max(0, i - 1)];
    else if (e.key === 'ArrowRight') target = buttons[Math.min(buttons.length - 1, i + 1)];
    else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      const cur = e.currentTarget.getBoundingClientRect();
      const dir = e.key === 'ArrowUp' ? -1 : 1;
      target = buttons
        .filter((b) => {
          const r = b.getBoundingClientRect();
          return dir < 0 ? r.bottom <= cur.top + 1 : r.top >= cur.bottom - 1;
        })
        .sort((a, b) => {
          const ra = a.getBoundingClientRect();
          const rb = b.getBoundingClientRect();
          return (
            Math.abs(ra.top - cur.top) * 10 +
            Math.abs(ra.left - cur.left) -
            (Math.abs(rb.top - cur.top) * 10 + Math.abs(rb.left - cur.left))
          );
        })[0];
    } else return;
    if (target) {
      e.preventDefault();
      target.focus();
    }
  };

  return (
    <Section title={S.rune.title} persistKey="magic-circle:runes">
      <Field label={S.rune.system}>
        <Select<RuneSetId>
          value={setId}
          onValueChange={(v) => useUi.setState({ runeSet: v })}
          options={RUNE_SET_IDS.map((id) => ({ value: id, label: S.rune.sets[id].option }))}
        />
      </Field>
      <Field label={S.rune.search}>
        <TextInput
          type="search"
          value={query}
          placeholder={S.rune.searchPlaceholder}
          autoComplete="off"
          onChange={(e) => {
            setQuery(e.target.value);
            setFocusIndex(0);
          }}
        />
      </Field>
      {/* biome-ignore lint/a11y/useSemanticElements: 盧恩字母按鈕格，不是表單分組 */}
      <div
        ref={grid}
        role="group"
        aria-label={S.rune.paletteLabel}
        className="grid max-h-44 grid-cols-[repeat(auto-fill,minmax(2.6rem,1fr))] gap-1 overflow-y-auto p-px"
      >
        {runes.length ? (
          runes.map((r, i) => (
            <button
              key={`${r.glyph}-${r.name}`}
              type="button"
              data-rune={r.glyph}
              tabIndex={i === tabIndex ? 0 : -1}
              title={S.rune.runeTitle(r.name, r.reading, r.sound)}
              aria-label={S.rune.runeAria(r.name, r.reading, r.sound, r.glyph)}
              onFocus={() => setFocusIndex(i)}
              onKeyDown={(e) => onKey(i, e)}
              onClick={() => insertRuneText(r.glyph)}
              className="flex flex-col items-center rounded-md border border-border bg-surface-2 px-1 py-1 leading-none hover:border-accent hover:bg-accent-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <span className="font-serif text-lg">{r.glyph}</span>
              <small className="mt-0.5 text-[10px] text-muted">{r.sound}</small>
            </button>
          ))
        ) : (
          <p className="col-span-full m-0 text-xs text-muted">{S.rune.empty}</p>
        )}
      </div>
      <p className="m-0 text-xs text-muted" aria-live="polite" data-testid="rune-status">
        {S.rune.paletteStatus(S.rune.sets[setId].label, runes.length)}
      </p>
      <Field label={S.rune.converter} hint={S.rune.converterHint}>
        <TextArea
          rows={2}
          value={latin}
          placeholder={S.rune.converterPlaceholder}
          onChange={(e) => setLatin(e.target.value)}
        />
      </Field>
      <div className="flex items-baseline gap-2 text-sm">
        <span className="shrink-0 text-xs text-muted">{S.rune.result}</span>
        <output className="min-w-0 break-all font-serif text-base" data-testid="rune-result">
          {converted || '—'}
        </output>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          size="sm"
          onClick={() => {
            if (!converted) return notify(S.msg.enterLatin);
            applyRuneText(converted, converted.length, S.msg.runeReplaced);
          }}
        >
          {S.rune.replace}
        </Button>
        <Button
          size="sm"
          onClick={() => {
            if (!converted) return notify(S.msg.enterLatin);
            insertRuneText(converted);
          }}
        >
          {S.rune.insert}
        </Button>
      </div>
      <span className="sr-only">{el.name}</span>
    </Section>
  );
}

function TextContent({ el }: { el: TextElement }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const textSel = useUi((s) => s.textSel);
  const remember = () => {
    const t = ref.current;
    if (!t) return;
    useUi.setState({ textSel: { id: el.id, start: t.selectionStart, end: t.selectionEnd } });
  };
  /* 插入盧恩後把游標放到插入的字後面 */
  useEffect(() => {
    const t = ref.current;
    if (!t || !textSel || textSel.id !== el.id) return;
    if (t.selectionStart !== textSel.start || t.selectionEnd !== textSel.end)
      t.setSelectionRange(textSel.start, textSel.end);
  }, [textSel, el.id]);
  return (
    <Field label={S.geo.content}>
      <TextArea
        ref={ref}
        id="mc-text-content"
        rows={3}
        value={el.text}
        onFocus={gesture.begin}
        onBlur={gesture.commit}
        onChange={(e) => {
          const v = e.target.value;
          editPrimary((d) => {
            if (d.type === 'text') d.text = v;
          });
          remember();
        }}
        onSelect={remember}
        onKeyUp={remember}
        onPointerUp={remember}
      />
    </Field>
  );
}

function Nudge() {
  const btn = (label: string, icon: React.ReactNode, dx: number, dy: number) => (
    <IconButton
      size="sm"
      label={label}
      icon={icon}
      onClick={(e) => nudge(dx, dy, e.shiftKey ? 10 : 1)}
      data-nudge={`${dx},${dy}`}
    />
  );
  return (
    <Section title={S.geo.nudge} description={S.geo.nudgeHint} fixed>
      <div className="grid w-max grid-cols-3 gap-1">
        <span />
        {btn(S.geo.nudgeUp, <ArrowUp />, 0, -1)}
        <span />
        {btn(S.geo.nudgeLeft, <ArrowLeft />, -1, 0)}
        {btn(S.geo.nudgeCenter, <LocateFixed />, 0, 0)}
        {btn(S.geo.nudgeRight, <ArrowRight />, 1, 0)}
        <span />
        {btn(S.geo.nudgeDown, <ArrowDown />, 0, 1)}
        <span />
      </div>
    </Section>
  );
}

const toggleField = (key: 'symmetry' | 'visible' | 'locked') => (v: boolean) =>
  step(() =>
    editPrimary((d) => {
      d[key] = v;
    }),
  );

export function GeometryPanel() {
  const el: McElement | null = usePrimary();
  if (!el) return <Placeholder>{S.geo.placeholder}</Placeholder>;
  const num = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);
  return (
    <>
      <Section title={S.geo.info} fixed>
        <Field label={S.geo.name}>
          <BufferedText
            key={el.id}
            value={el.name}
            onText={(t) =>
              editPrimary((d) => {
                d.name = t || S.names.unnamed;
              })
            }
          />
        </Field>
        <Field label={S.geo.symmetry} layout="inline">
          <Toggle checked={el.symmetry} onCheckedChange={toggleField('symmetry')} />
        </Field>
        <Field label={S.geo.visible} layout="inline">
          <Toggle checked={el.visible} onCheckedChange={toggleField('visible')} />
        </Field>
        <Field label={S.geo.locked} layout="inline">
          <Toggle checked={el.locked} onCheckedChange={toggleField('locked')} />
        </Field>
      </Section>

      {el.type === 'path' ? (
        <Section title={S.geo.path} description={S.geo.pathHint} fixed>
          <Field label={S.geo.closed} layout="inline">
            <Toggle
              checked={el.closed}
              onCheckedChange={(v) =>
                step(() =>
                  editPrimary((d) => {
                    if (d.type === 'path') d.closed = v;
                  }),
                )
              }
            />
          </Field>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" onClick={smoothSelectedNode}>
              {S.geo.smooth}
            </Button>
            <Button size="sm" onClick={cornerSelectedNode}>
              {S.geo.corner}
            </Button>
          </div>
          <Button size="sm" onClick={reverseSelectedPath}>
            {S.geo.reverse}
          </Button>
        </Section>
      ) : null}

      {el.type === 'circle' ? (
        <Section title={S.geo.circle} fixed>
          <FieldRow columns={2}>
            {(['x', 'y', 'rx', 'ry'] as const).map((k) => (
              <Field
                key={k}
                label={
                  k === 'x' ? S.geo.cx : k === 'y' ? S.geo.cy : k === 'rx' ? S.geo.rx : S.geo.ry
                }
              >
                <NumberInput
                  value={num(el[k])}
                  onChange={gesture.live((v) =>
                    editPrimary((d) => {
                      if (d.type === 'circle') d[k] = k === 'rx' || k === 'ry' ? Math.max(1, v) : v;
                    }),
                  )}
                  onCommit={gesture.commit}
                  min={k === 'rx' || k === 'ry' ? 1 : -100000}
                  max={100000}
                  step={1}
                  precision={2}
                />
              </Field>
            ))}
          </FieldRow>
        </Section>
      ) : null}

      {el.type === 'text' ? (
        <>
          <Section title={S.geo.text} fixed>
            <TextContent el={el} />
            <FieldRow columns={2}>
              <Field label={S.geo.fontSize}>
                <NumberInput
                  value={el.fontSize}
                  onChange={gesture.live((v) =>
                    editPrimary((d) => {
                      if (d.type === 'text') d.fontSize = clamp(v, ...RANGE.fontSize);
                    }),
                  )}
                  onCommit={gesture.commit}
                  min={RANGE.fontSize[0]}
                  max={RANGE.fontSize[1]}
                  step={1}
                  unit="px"
                />
              </Field>
              <Field label={S.geo.textAlign}>
                <Segmented<TextAlign>
                  value={el.textAlign}
                  onValueChange={(v) =>
                    step(() =>
                      editPrimary((d) => {
                        if (d.type === 'text') d.textAlign = v;
                      }),
                    )
                  }
                  options={TEXT_ALIGNS.map((v) => ({ value: v, label: S.geo.aligns[v] }))}
                  fullWidth
                />
              </Field>
            </FieldRow>
            <Field label={S.geo.fontFamily} hint={S.geo.fontHint}>
              <BufferedText
                key={el.id}
                value={el.fontFamily}
                placeholder="serif"
                onText={(t) =>
                  editPrimary((d) => {
                    if (d.type === 'text') d.fontFamily = t || 'serif';
                  })
                }
              />
            </Field>
          </Section>
          <RunePalette el={el} />
        </>
      ) : null}

      <Nudge />
    </>
  );
}
