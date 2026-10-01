/**
 * ③ 組合與輸出（規格 F52～F60）：
 * - 設定欄：目前的組合（使用者、預設集）、儲存組合、已儲存的組合、說明、OBS 貼上步驟。
 * - 預覽欄（OutputPanel）：預覽、輸出 CSS（複製、下載）、警告。
 */
import { BookmarkCheck, BookmarkPlus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { STREAMKIT_OVERLAY_URL } from '@/ccfolia';
import {
  Button,
  CssExportPanel,
  type CssExportStatus,
  Field,
  ItemListEditor,
  Notice,
  ObsGuide,
  Section,
  Select,
} from '@/ui';
import { removeCombo, saveCombo, setCurrent } from './actions';
import { type Combo, comboKey, effectiveCombo, memoOf, sameCombo, userLabel } from './model';
import { PreviewNotes, TachiePreview } from './Preview';
import { useTachie } from './store';
import { S } from './strings';
import { useComboOutput } from './useCss';

export function StepOutput() {
  const data = useTachie((s) => s.data);
  const { user, preset } = effectiveCombo(data);
  const current = user && preset ? { userId: user.id, presetId: preset.id } : null;
  const isSaved = !!current && data.saved.some((s) => sameCombo(s, current));
  const comboLabel = (c: Combo) => {
    const u = data.users.find((x) => x.id === c.userId);
    const p = data.presets.find((x) => x.id === c.presetId);
    return S.output.comboName(
      u ? (memoOf(u) ?? u.id) : c.userId,
      p?.name.trim() || S.presets.unnamed,
    );
  };
  const label = preset?.label;
  const fonts =
    label?.show && label.font.source !== 'google' && label.font.family.trim()
      ? [label.font.family.trim()]
      : [];

  return (
    <>
      <Section title={S.output.comboTitle} fixed>
        {user && preset ? (
          <>
            <Field label={S.output.user}>
              <Select
                value={user.id}
                onValueChange={(userId) => setCurrent({ userId })}
                options={data.users.map((u) => ({ value: u.id, label: userLabel(u) }))}
              />
            </Field>
            <Field label={S.output.preset}>
              <Select
                value={preset.id}
                onValueChange={(presetId) => setCurrent({ presetId })}
                options={data.presets.map((p) => ({
                  value: p.id,
                  label: p.name.trim() || S.presets.unnamed,
                }))}
              />
            </Field>
            <div>
              <Button
                icon={isSaved ? <BookmarkCheck /> : <BookmarkPlus />}
                onClick={saveCombo}
                disabled={isSaved}
              >
                {isSaved ? S.output.saved : S.output.save}
              </Button>
            </div>
          </>
        ) : (
          <Notice tone="info" className="text-sm">
            {S.output.needBoth}
          </Notice>
        )}
      </Section>
      <Section title={S.listTitle(S.output.savedTitle, data.saved.length)} fixed>
        <ItemListEditor<Combo>
          aria-label={S.output.savedLabel}
          items={data.saved}
          getId={comboKey}
          getName={comboLabel}
          selectedId={current ? comboKey(current) : null}
          onSelect={(key) => {
            const c = data.saved.find((s) => comboKey(s) === key);
            if (c) setCurrent({ userId: c.userId, presetId: c.presetId });
          }}
          onRemove={(key) => {
            const c = data.saved.find((s) => comboKey(s) === key);
            if (c) removeCombo(c.userId, c.presetId);
          }}
          emptyText={S.output.savedEmpty}
        />
        <ul className="m-0 flex list-disc flex-col gap-1 pl-5 text-xs text-muted">
          {S.output.guide.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </Section>
      <Section title={S.output.streamkitTitle} persistKey="obs-tachie:obs-guide">
        <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-sm text-fg">
          <li>
            {S.output.streamkitSteps[0]}
            <br />
            <a
              href={STREAMKIT_OVERLAY_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="font-mono text-xs break-all text-accent underline"
            >
              {STREAMKIT_OVERLAY_URL}
            </a>
          </li>
          <li>{S.output.streamkitSteps[1]}</li>
          <li>{S.output.streamkitSteps[2]}</li>
        </ol>
        <ObsGuide
          urlLabel={S.output.obsUrlLabel}
          size={S.output.obsSize}
          login="none"
          obs={{ version: 31, features: S.output.obsFeatures }}
          multipleSources
          localFonts={fonts.length ? fonts : true}
          disclaimer={S.output.disclaimer}
        />
      </Section>
    </>
  );
}

/** 第 3 步的預覽欄：預覽＋輸出 CSS */
export function OutputPanel() {
  const out = useComboOutput();
  const [status, setStatus] = useState<CssExportStatus | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  if (!out)
    return (
      <p
        className="m-0 rounded-lg border border-dashed border-border bg-surface px-4 py-10 text-center text-sm text-muted"
        data-testid="output-empty"
      >
        {S.preview.noCombo}
      </p>
    );
  const title = S.output.comboName(
    memoOf(out.user) ?? out.user.id,
    out.preset.name.trim() || S.presets.unnamed,
  );
  return (
    <>
      <TachiePreview
        css={out.previewCss}
        userId={out.user.id}
        userName={out.userName || out.user.id}
        hideAway={out.preset.hideAway}
        testId="combo-preview"
      />
      {out.emptyName ? (
        <Notice tone="warning" className="text-xs">
          {S.preview.emptyNameWarn}
        </Notice>
      ) : null}
      <PreviewNotes />
      <section
        aria-label={S.output.cssTitle}
        className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3"
      >
        <h2 className="m-0 text-base font-semibold text-fg" data-testid="output-title">
          {title}
        </h2>
        <p className="m-0 text-xs text-muted">{S.output.cssNote}</p>
        {out.alignLost ? (
          <Notice tone="warning" className="text-xs">
            {S.output.alignWarn}
          </Notice>
        ) : null}
        {out.noImage ? (
          <Notice tone="warning" className="text-xs">
            {S.output.noImageWarn}
          </Notice>
        ) : null}
        <CssExportPanel
          css={out.css}
          fileName={out.fileName.replace(/\.css$/, '')}
          fallbackFileName="streamkit"
          disabledReason={out.loading ? S.output.imagesLoading : undefined}
          defaultViewerOpen
          status={status}
          onCopy={(ok) => {
            if (timer.current) clearTimeout(timer.current);
            if (ok) {
              setStatus({ tone: 'success', text: S.output.copied });
              timer.current = setTimeout(() => setStatus(null), 1500);
            } else setStatus({ tone: 'danger', text: S.output.copyFailed });
          }}
          onSave={(name) => {
            if (timer.current) clearTimeout(timer.current);
            setStatus({ tone: 'success', text: S.output.savedFile(name) });
          }}
        />
      </section>
    </>
  );
}
