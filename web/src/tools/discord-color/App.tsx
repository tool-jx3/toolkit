/**
 * Discord 彩色文字產生器：在編輯區選取文字套用樣式、經典色、自訂色、效果，預覽 Discord 四種主題，
 * 複製成 Discord 的 ```ansi 程式碼區塊。
 * 規格：docs/refactor/specs/discord-color.md。
 */
import { Redo2, RotateCcw, Undo2 } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { resetToolStore, useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  Button,
  ColorField,
  Field,
  FieldRow,
  IconButton,
  ProjectMenu,
  Section,
  Segmented,
  type Shortcut,
  TextOutputPanel,
  ToolShell,
  UsageSection,
  useToast,
  withShortcut,
} from '@/ui';
import { ansiMessage, lengthLevel } from './ansi';
import { Editor, type EditorHandle } from './Editor';
import { PROJECT_VERSION, type Settings, sanitizeSettings, TOOL_ID } from './model';
import {
  DEFAULT_CUSTOM,
  DEFAULT_GRADIENT,
  DEFAULT_ZEBRA,
  type EffectId,
  normalizeHex,
  THEME_IDS,
  type ThemeId,
} from './palette';
import { commitFormat, useSettings, useView } from './store';
import { S } from './strings';
import { Toolbar } from './Toolbar';

/* 開發模式的測試入口：`__discordColor.getState().data.doc`。建置產物裡沒有這段。 */
if (import.meta.env.DEV && typeof window !== 'undefined') {
  (window as unknown as { __discordColor?: typeof useSettings }).__discordColor = useSettings;
}

/** 連續複製 11 次之後的提示：16 個隨機的漢字（原作是隨機字元） */
const gibberish = () =>
  Array.from({ length: 16 }, () =>
    String.fromCharCode(0x4e00 + Math.floor(Math.random() * (0x9fff - 0x4e00))),
  ).join('');

/** 連續複製的間隔超過 2 秒就從「已複製！」重新算起 */
const COPY_STREAK_MS = 2000;

function Usage() {
  return (
    <>
      <p>{S.usageIntro}</p>
      <ol className="mt-2">
        {S.usageSteps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <p className="mt-2 font-semibold">{S.usageNotesTitle}</p>
      <ul>
        {S.usageNotes.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </>
  );
}

const LEVEL_CLASS = { ok: 'text-muted', nitro: 'text-warning', over: 'text-danger' } as const;
/** 編輯區角落的字數（Discord 預覽裡的顏色，照原作：一般淡色、Nitro 橘色、超過紅色） */
const COUNTER_STYLE = {
  ok: { opacity: 0.4 },
  nitro: { color: 'orange' },
  over: { color: 'red', opacity: 0.8 },
} as const;

function SettingsPanel() {
  const theme = useView((s) => s.data.theme);
  const custom = useSettings((s) => s.data.custom);
  const gradient = useSettings((s) => s.data.gradient);
  const zebra = useSettings((s) => s.data.zebra);
  const update = useSettings((s) => s.update);
  const setColor = (fn: (d: Settings, hex: string) => void) => (value: string) => {
    const hex = normalizeHex(value);
    if (hex) update((d) => fn(d as Settings, hex));
  };
  return (
    <>
      <Section title={S.sectionTheme} fixed>
        <Field label={S.theme} hint={S.themeHint}>
          <Segmented<ThemeId>
            value={theme}
            onValueChange={(v) => useView.getState().patch({ theme: v })}
            fullWidth
            options={THEME_IDS.map((id) => ({
              value: id,
              label: S.themes[id],
              ariaLabel: S.themeAria[id],
            }))}
          />
        </Field>
      </Section>
      <Section
        title={S.sectionCustom}
        description={S.customHint}
        persistKey={`${TOOL_ID}:custom`}
        actions={
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw />}
            onClick={() =>
              update((d) => {
                d.custom = [...DEFAULT_CUSTOM];
              })
            }
          >
            {S.customReset}
          </Button>
        }
      >
        <FieldRow columns={2}>
          {custom.map((hex, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: 固定 8 格
            <Field key={i} label={S.customField(i)}>
              <ColorField
                value={hex.toLowerCase()}
                onChange={setColor((d, v) => {
                  d.custom[i] = v;
                })}
              />
            </Field>
          ))}
        </FieldRow>
      </Section>
      <Section
        title={S.sectionEffect}
        persistKey={`${TOOL_ID}:effect`}
        actions={
          <Button
            size="sm"
            variant="ghost"
            icon={<RotateCcw />}
            onClick={() =>
              update((d) => {
                d.gradient = [DEFAULT_GRADIENT[0], DEFAULT_GRADIENT[1]];
                d.zebra = [DEFAULT_ZEBRA[0], DEFAULT_ZEBRA[1]];
              })
            }
          >
            {S.effectReset}
          </Button>
        }
      >
        <FieldRow columns={2}>
          <Field label={S.gradientFrom}>
            <ColorField
              value={gradient[0].toLowerCase()}
              onChange={setColor((d, v) => {
                d.gradient[0] = v;
              })}
            />
          </Field>
          <Field label={S.gradientTo}>
            <ColorField
              value={gradient[1].toLowerCase()}
              onChange={setColor((d, v) => {
                d.gradient[1] = v;
              })}
            />
          </Field>
          <Field label={S.zebraA}>
            <ColorField
              value={zebra[0].toLowerCase()}
              onChange={setColor((d, v) => {
                d.zebra[0] = v;
              })}
            />
          </Field>
          <Field label={S.zebraB}>
            <ColorField
              value={zebra[1].toLowerCase()}
              onChange={setColor((d, v) => {
                d.zebra[1] = v;
              })}
            />
          </Field>
        </FieldRow>
      </Section>
    </>
  );
}

function Workspace({ undo, redo }: { undo: () => void; redo: () => void }) {
  const toast = useToast();
  const hintId = useId();
  const editor = useRef<EditorHandle>(null);
  const doc = useSettings((s) => s.data.doc);
  const custom = useSettings((s) => s.data.custom);
  const gradient = useSettings((s) => s.data.gradient);
  const zebra = useSettings((s) => s.data.zebra);
  const theme = useView((s) => s.data.theme);
  const target = useView((s) => s.data.target);
  const colors = useMemo(() => ({ gradient, zebra }), [gradient, zebra]);

  const message = useMemo(() => ansiMessage(doc), [doc]);
  const length = message.length;
  const level = lengthLevel(length);

  /* 連續複製的次數（提示文字一次比一次誇張；照原作） */
  const [streak, setStreak] = useState(0);
  const streakTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (streakTimer.current) clearTimeout(streakTimer.current);
    },
    [],
  );
  const copiedMessage = S.copied[streak] ?? gibberish();

  const warnNoSelection = () =>
    toast({ title: S.noSelection, tone: 'warning', duration: 3000, replace: true });
  const fg = target === 'fg';

  return (
    <>
      <Toolbar
        target={target}
        onTarget={(t) => useView.getState().patch({ target: t })}
        theme={theme}
        custom={custom}
        colors={colors}
        onCode={(c) => {
          if (!editor.current?.format({ type: 'code', code: c })) warnNoSelection();
        }}
        onCustom={(hex) => {
          if (!editor.current?.format({ type: 'rgb', hex, fg })) warnNoSelection();
        }}
        onEffect={(id: EffectId) => {
          if (!editor.current?.effect(id, colors, fg)) warnNoSelection();
        }}
      />
      <div className="flex flex-col gap-1.5">
        <Editor
          ref={editor}
          doc={doc}
          theme={theme}
          aria-label={S.editor}
          aria-describedby={hintId}
          onType={(next) => useSettings.getState().patch({ doc: next })}
          onFormat={commitFormat}
          onUndo={undo}
          onRedo={redo}
          counter={
            <span
              className="self-end text-xs tabular-nums"
              style={COUNTER_STYLE[level]}
              data-testid="dc-counter"
              data-level={level}
            >
              {S.counter(length, level)}
            </span>
          }
        />
        <p id={hintId} className="m-0 text-xs text-muted">
          {S.editorHint}
        </p>
      </div>
      <TextOutputPanel
        text={message}
        title={S.output}
        count={
          <span className={LEVEL_CLASS[level]} data-level={level}>
            {S.outputCount(length, level)}
          </span>
        }
        hint={S.outputHint}
        copyLabel={S.copy}
        font="mono"
        wrap="off"
        messages={{
          copied: copiedMessage,
          failed: S.copyFailed,
          failedHint: S.copyFailedHint,
        }}
        onCopied={(ok) => {
          if (!ok) return;
          /* 不設上限：每次都重繪，11 次之後的隨機漢字每次重新產生（F28，同原作） */
          setStreak((n) => n + 1);
          if (streakTimer.current) clearTimeout(streakTimer.current);
          streakTimer.current = setTimeout(() => setStreak(0), COPY_STREAK_MS);
        }}
      />
    </>
  );
}

export function App() {
  const savedAt = useSaveStatus(TOOL_ID);
  const { undo, redo, canUndo, canRedo, clear } = useUndoRedo(useSettings);
  const usage = <Usage />;

  const shortcuts = useMemo<Shortcut[]>(
    () => [
      { keys: 'mod+z', label: S.undo, group: S.keysGeneral, handler: undo },
      { keys: ['shift+mod+z', 'mod+y'], label: S.redo, group: S.keysGeneral, handler: redo },
      { keys: 'enter', label: S.keyEnter, group: S.keysEdit },
      { keys: 'mod+b', label: S.styles[1], group: S.keysEdit },
      { keys: 'mod+i', label: S.styles[3], group: S.keysEdit },
      { keys: 'mod+u', label: S.styles[4], group: S.keysEdit },
    ],
    [undo, redo],
  );

  const headerActions = (
    <>
      <IconButton
        label={withShortcut(S.undo, 'mod+z')}
        icon={<Undo2 />}
        onClick={undo}
        disabled={!canUndo}
      />
      <IconButton
        label={withShortcut(S.redo, 'shift+mod+z')}
        icon={<Redo2 />}
        onClick={redo}
        disabled={!canRedo}
      />
      <ProjectMenu<Settings>
        toolId={TOOL_ID}
        version={PROJECT_VERSION}
        getData={() => useSettings.getState().data}
        onLoad={(raw) => {
          const data = sanitizeSettings(raw);
          if (!data) return false;
          useSettings.getState().replace(data);
          clear();
          return true;
        }}
        onReset={() => resetToolStore(useSettings, { clearHistory: false })}
        savedAt={savedAt}
        fileName={S.project.fileName}
        resetText={{
          label: S.project.resetLabel,
          title: S.project.resetTitle,
          description: S.project.resetDescription,
        }}
      />
    </>
  );

  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={usage}
      shortcuts={shortcuts}
      headerActions={headerActions}
      settings={
        <>
          <SettingsPanel />
          <UsageSection persistKey={`${TOOL_ID}:usage`}>{usage}</UsageSection>
        </>
      }
      preview={<Workspace undo={undo} redo={redo} />}
    />
  );
}
