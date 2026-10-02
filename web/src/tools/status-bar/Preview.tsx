/**
 * 預覽欄：預覽對象選單（F92）、模擬 CCFOLIA 角色狀態頁的即時預覽（F93～F96）、測試數值（F97～F100）、
 * 匯出（F101～F104）與狀態列（F110）。
 */
import { ImagePlus, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createCharacterScene } from '@/ccfolia/mock';
import { pickFiles } from '@/core/files';
import {
  applyTestShortcut,
  Button,
  CssExportPanel,
  CssPreviewFrame,
  type CssPreviewFrameHandle,
  Field,
  NativeNumberInput,
  Notice,
  type PreviewBackground,
  Section,
  Select,
  SourceUrlField,
  TestValueRow,
  TestValueShortcuts,
  TextInput,
  Toggle,
} from '@/ui';
import { exportCss, measureTarget, previewCss, registerFrame } from './actions';
import { type Box, estimateSourceSize } from './geometry';
import { cssFileBase, cssTargetFor, previewCharacter, previewStatuses } from './logic';
import { type PreviewBgKind, parseInitiative } from './settings';
import {
  setPreviewAvatar,
  setSetting,
  setStatus,
  usePreview,
  useSession,
  useSettings,
} from './store';
import { S } from './strings';

/** 測試用：網址加 ?pause=毫秒 時，預覽裡的動畫停在那個時間點 */
const PAUSE_AT = (() => {
  const v = new URLSearchParams(window.location.search).get('pause');
  return v === null ? null : Number(v);
})();

const MEASURE_VIEWPORT = { width: 3200, height: 2400 };

export function Preview() {
  const s = useSettings((st) => st.data);
  const p = usePreview((st) => st.data);
  const avatarUrl = useSession((st) => st.avatarUrl);
  const status = useSession((st) => st.status);
  const character = previewCharacter(s, p.target);
  const target = useMemo(() => cssTargetFor(s, character), [s, character]);
  const css = useMemo(() => previewCss(s, target), [s, target]);
  const [size, setSize] = useState<Box>(() => estimateSourceSize(s, { name: target.name }));

  /* 模擬頁 */
  const scene = useMemo(() => createCharacterScene(), []);
  const statuses = useMemo(() => previewStatuses(s, p), [s, p]);
  useEffect(() => {
    scene.update({ statuses, initiative: p.initiative, avatarUrl });
  }, [scene, statuses, p.initiative, avatarUrl]);

  /* 量測：套用 CSS 後（子元件的 layout effect 先跑）、模擬頁變動、字型載入後 */
  const frame = useRef<CssPreviewFrameHandle | null>(null);
  const setFrame = useCallback((h: CssPreviewFrameHandle | null) => {
    frame.current = h;
    registerFrame(h);
  }, []);
  const remeasure = useCallback(() => {
    const st = useSettings.getState().data;
    const pv = usePreview.getState().data;
    const t = cssTargetFor(st, previewCharacter(st, pv.target));
    const next = measureTarget(st, t);
    setSize((prev) => (prev.width === next.width && prev.height === next.height ? prev : next));
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: CSS 或狀態列改變後重新量測
  useEffect(() => {
    remeasure();
  }, [css, statuses, remeasure]);

  useEffect(() => {
    useSession.setState({ size });
  }, [size]);

  const fullCss = useMemo(() => exportCss(s, target, size), [s, target, size]);
  const fileBase = cssFileBase(s.fileName, character);
  const who = character ? S.export.charWho(character.name) : S.export.exampleWho;

  /* 預覽對象（F92） */
  const targetOptions = [
    { value: 'example', label: S.preview.example },
    ...s.characters.map((c) => ({ value: c.id, label: c.name.trim() || S.chars.unnamed })),
  ];

  /* 換預覽頭像（F100） */
  const pickAvatar = async () => {
    const [file] = await pickFiles({ accept: 'image/*' });
    if (!file) return;
    setPreviewAvatar(URL.createObjectURL(file));
    setStatus(S.preview.avatarLoaded(file.name), 'info');
  };

  const statusText = status.text || S.status.ready;
  const tests = p.tests;
  const shownCount = statuses.length;

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex min-w-0 flex-wrap items-end gap-2">
        <Field label={S.preview.target} className="min-w-40 flex-1">
          <Select
            value={character ? character.id : 'example'}
            onValueChange={(v) => usePreview.getState().patch({ target: v })}
            options={targetOptions}
          />
        </Field>
      </div>
      <CssPreviewFrame
        ref={setFrame}
        width={size.width}
        height={size.height}
        css={css}
        scene={scene}
        maxScale={2}
        maxHeight={560}
        gutter={32}
        background={{ kind: p.background }}
        onBackgroundChange={(bg: PreviewBackground) =>
          usePreview.getState().patch({ background: bg.kind as PreviewBgKind })
        }
        backgrounds={['checker', 'dark', 'light', 'scene']}
        showBefore={p.showBefore}
        onShowBeforeChange={(v) => usePreview.getState().patch({ showBefore: v })}
        onMeasure={remeasure}
        measureViewport={MEASURE_VIEWPORT}
        sizeNote={target.example ? S.preview.exampleNote : undefined}
        label={S.preview.frameLabel}
        pauseAt={PAUSE_AT}
      />
      <Notice tone={status.tone} className="text-xs">
        <span data-testid="status-text">{statusText}</span>
      </Notice>

      <Section title={S.export.section} persistKey="status-bar:export" fixed>
        <Field label={S.export.fileName} hint={S.export.fileNameHint}>
          <TextInput
            value={s.fileName}
            spellCheck={false}
            onChange={(e) => setSetting('fileName', e.target.value)}
          />
        </Field>
        <Field label={S.export.url}>
          <SourceUrlField
            url={target.url}
            placeholder={target.example ? '（範例）' : undefined}
            missingWarning={target.example ? S.export.urlMissingExample : S.export.urlMissing}
          />
        </Field>
        <CssExportPanel
          css={fullCss}
          fileName={fileBase}
          fallbackFileName="statusbar"
          status={null}
          onCopy={(ok) =>
            ok
              ? setStatus(S.export.copied(who, size.width, size.height), 'success')
              : setStatus(S.chars.copyFailed, 'danger')
          }
          onSave={(name) => setStatus(S.export.saved(name), 'success')}
        />
      </Section>

      <Section
        title={S.preview.testsSection}
        description={S.preview.testsHint}
        persistKey="status-bar:tests"
      >
        <div className="flex flex-col gap-2" data-testid="test-rows">
          {tests.slice(0, shownCount).map((t, i) => (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: 第 n 列固定對應第 n 條
              key={i}
              className="flex min-w-0 flex-col gap-0.5"
            >
              {i >= s.barCount ? (
                <span className="text-xs text-muted">{S.preview.extraTag}</span>
              ) : null}
              <TestValueRow
                label={t.label}
                onLabelChange={(label) =>
                  usePreview.getState().update((d) => {
                    d.tests[i].label = label;
                  })
                }
                value={t.value}
                max={t.max}
                onValueChange={(value) =>
                  usePreview.getState().update((d) => {
                    d.tests[i].value = value;
                  })
                }
                onMaxChange={(max) =>
                  usePreview.getState().update((d) => {
                    d.tests[i].max = max;
                    d.tests[i].value = Math.min(d.tests[i].value, max);
                  })
                }
              />
            </div>
          ))}
        </div>
        <TestValueShortcuts
          onApply={(kind) =>
            usePreview.getState().update((d) => {
              for (let i = 0; i < s.barCount; i++) {
                const t = d.tests[i];
                t.value = applyTestShortcut(kind, t.value, t.max, {
                  threshold: s.critical.threshold,
                });
              }
            })
          }
        />
        <div className="flex flex-wrap items-end gap-3">
          <Field label={S.preview.initiative} className="w-28">
            <NativeNumberInput
              value={String(p.initiative)}
              min={0}
              max={99}
              onChange={(v) => usePreview.getState().patch({ initiative: parseInitiative(v) })}
            />
          </Field>
          <div className="flex flex-wrap gap-1.5 pb-0.5">
            <Button size="sm" icon={<ImagePlus />} onClick={pickAvatar}>
              {S.preview.avatar}
            </Button>
            {avatarUrl ? (
              <Button size="sm" icon={<RotateCcw />} onClick={() => setPreviewAvatar(null)}>
                {S.preview.avatarReset}
              </Button>
            ) : null}
          </div>
        </div>
        <p className="m-0 text-xs text-muted">{S.preview.avatarNote}</p>
        <Toggle
          label={S.preview.showExtras}
          checked={p.showExtras}
          onCheckedChange={(v) => usePreview.getState().patch({ showExtras: v })}
        />
        <p className="m-0 -mt-2 text-xs text-muted">{S.preview.showExtrasHint}</p>
      </Section>
    </div>
  );
}
