/**
 * 預覽欄：模擬房間畫面（CssPreviewFrame）、狀態列、預覽訊息（範例、自訂、關閉、重新開始、範例立繪）、
 * 瀏覽器來源網址、匯出（檔名、複製／儲存／查看 CSS）。
 */
import { Eraser, RotateCcw, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { roomUrlFrom } from '@/ccfolia';
import { readAsDataUrl } from '@/core/files';
import { loadImage } from '@/core/image';
import {
  Button,
  CssExportPanel,
  CssPreviewFrame,
  Field,
  FileDrop,
  MessageComposer,
  Notice,
  Section,
  Segmented,
  SourceUrlField,
  TextInput,
} from '@/ui';
import { buildMessageBoxCss } from './css';
import { LocalFontWarning } from './panels';
import {
  clearCustomPortrait,
  isBusy,
  restartPreview,
  roomScene,
  sendNextSample,
  sendSample,
  setCustomPortrait,
  usePortrait,
} from './preview';
import { customSample, SAMPLE_KINDS, SPEAKERS } from './samples';
import { DEFAULT_FILE_NAME, fileBase } from './settings';
import {
  gesture,
  type PortraitShape,
  setStatus,
  usePreview,
  useSettings,
  useStatus,
} from './store';
import { S } from './strings';

/** 測試用：網址加 ?pause=毫秒 時，預覽裡的 CSS 動畫停在那個時間點 */
const PAUSE_AT = (() => {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('pause');
  return v === null || !Number.isFinite(Number(v)) ? null : Number(v);
})();

export function StatusLine() {
  const st = useStatus();
  return (
    <div data-testid="mb-status">
      <Notice tone={st.tone} className="text-xs">
        {st.text || S.ready}
      </Notice>
    </div>
  );
}

function SampleControls() {
  const [speaker, setSpeaker] = useState(SPEAKERS[0].id);
  const [kind, setKind] = useState('chat');
  const shape = usePreview((st) => st.data.shape);
  const custom = usePortrait((st) => st.custom);

  const after = (queued: boolean, extra: string[] = []) =>
    [queued ? S.queued : '', ...extra].join('');

  return (
    <Section title={S.testSection} persistKey="message-box:test">
      <fieldset className="m-0 flex flex-wrap gap-1.5 border-0 p-0">
        <legend className="mb-1.5 text-sm font-medium">{S.sampleButtonsLabel}</legend>
        {SAMPLE_KINDS.map((k) => (
          <Button
            key={k}
            size="sm"
            onClick={() => {
              const { queued } = sendNextSample(k);
              const extra =
                k === 'secret'
                  ? [S.secretNote]
                  : k === 'success' || k === 'failure' || k === 'other'
                    ? [S.diceNote]
                    : [];
              setStatus(`${S.sent(S.sampleButtons[k])}${after(queued, extra)}`);
            }}
          >
            {S.sampleButtons[k]}
          </Button>
        ))}
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          icon={<X />}
          onClick={() => {
            roomScene.close();
            setStatus(S.closed);
          }}
        >
          {S.close}
        </Button>
        <Button
          size="sm"
          icon={<RotateCcw />}
          onClick={() => {
            restartPreview();
            setStatus(S.restarted);
          }}
        >
          {S.restart}
        </Button>
      </div>
      <MessageComposer
        speakers={SPEAKERS.map((sp) => ({
          value: sp.id,
          label: sp.name,
          description: sp.seed === null ? S.composerNoPortrait : undefined,
        }))}
        speaker={speaker}
        onSpeakerChange={setSpeaker}
        kinds={[
          { value: 'chat', label: S.composerKinds.chat },
          { value: 'dice', label: S.composerKinds.dice, needsResult: true },
        ]}
        kind={kind}
        onKindChange={setKind}
        placeholder={S.composerPlaceholder}
        resultExample={S.composerExample}
        requireCommand
        onSend={(m) => {
          const k = m.kind === 'dice' ? 'dice' : 'chat';
          const queued = isBusy();
          sendSample(customSample(m.speaker, k, m.command, m.result));
          setStatus(`${S.sentCustom}${after(queued, k === 'dice' ? [S.diceNote] : [])}`);
        }}
      />
      <Field label={S.shape}>
        <Segmented<PortraitShape | ''>
          value={custom ? '' : shape}
          onValueChange={(v) => {
            if (!v) return;
            usePreview.getState().patch({ shape: v });
            if (custom) {
              void clearCustomPortrait();
              setStatus(S.portraitCleared);
            }
          }}
          onReselect={(v) => {
            if (v) usePreview.getState().patch({ shape: v });
          }}
          options={[
            { value: 'full', label: S.shapeOptions.full },
            { value: 'half', label: S.shapeOptions.half },
          ]}
          fullWidth
        />
      </Field>
      <Field label={S.customPortrait} hint={S.customPortraitHint}>
        <div className="flex min-w-0 flex-col gap-2">
          <FileDrop
            compact
            accept="image/*"
            paste="off"
            label={S.customPortraitDrop}
            buttonLabel={S.customPortraitButton}
            onReject={(files) => setStatus(S.portraitError(files[0]?.name ?? ''), 'danger')}
            onFiles={async ([file]) => {
              if (!file) return;
              try {
                const bmp = await loadImage(file);
                bmp.close?.();
                const uri = await readAsDataUrl(file);
                const ok = await setCustomPortrait(uri);
                setStatus(ok ? S.portraitSet : S.portraitNotSaved, ok ? 'success' : 'warning');
              } catch {
                setStatus(S.portraitError(file.name), 'danger');
              }
            }}
          />
          {custom ? (
            <Button
              size="sm"
              icon={<Eraser />}
              className="self-start"
              onClick={() => {
                void clearCustomPortrait();
                setStatus(S.portraitCleared);
              }}
            >
              {S.clearPortrait}
            </Button>
          ) : null}
        </div>
      </Field>
    </Section>
  );
}

export function Preview({ onGoToRoom }: { onGoToRoom: () => void }) {
  const s = useSettings((st) => st.data);
  const p = usePreview((st) => st.data);
  const setPreview = usePreview((st) => st.patch);
  const css = useMemo(() => buildMessageBoxCss(s), [s]);
  const url = roomUrlFrom(s.room);
  const base = fileBase(s.fileName);

  /* 包一層：預覽欄是可捲動的 flex 欄，直接放的話預覽框會被壓扁 */
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <CssPreviewFrame
        width={s.width}
        height={s.height}
        css={css}
        scene={roomScene}
        maxScale={1}
        maxHeight={560}
        background={p.background}
        onBackgroundChange={(background) => setPreview({ background })}
        backgrounds={['scene', 'checker', 'dark', 'light']}
        showBefore={p.before}
        onShowBeforeChange={(before) => setPreview({ before })}
        hover={p.hover}
        onHoverChange={(hover) => setPreview({ hover })}
        pointer="none"
        label={S.previewLabel}
        pauseAt={PAUSE_AT}
      />
      <p className="m-0 text-xs text-muted">{S.previewNote}</p>
      <StatusLine />
      <SampleControls />
      <Section title={S.sourceUrl} persistKey="message-box:source-url" fixed>
        <SourceUrlField
          aria-label={S.sourceUrl}
          url={url}
          placeholder={S.sourceUrlPlaceholder}
          copiedMessage={S.urlCopied}
          onCopy={(ok) => {
            if (ok) setStatus(S.urlCopied, 'success');
          }}
          missingWarning={S.urlMissing}
          missingAction={
            <Button size="sm" onClick={onGoToRoom}>
              {S.goToRoom}
            </Button>
          }
        />
      </Section>
      <Section title={S.exportSection} persistKey="message-box:export" fixed>
        <Field label={S.fileName} hint={S.fileNameHint}>
          <TextInput
            value={s.fileName}
            placeholder={DEFAULT_FILE_NAME}
            spellCheck={false}
            autoComplete="off"
            onFocus={gesture.begin}
            onBlur={gesture.commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) gesture.commit();
            }}
            onChange={(e) => {
              gesture.begin();
              useSettings.getState().update((d) => {
                d.fileName = e.target.value;
              });
            }}
          />
        </Field>
        <LocalFontWarning />
        <CssExportPanel
          css={css}
          fileName={base}
          fallbackFileName={DEFAULT_FILE_NAME}
          status={null}
          onCopy={(ok) =>
            ok
              ? setStatus(S.copied(s.width, s.height, !!url), 'success')
              : setStatus(S.copyFailed, 'danger')
          }
          onSave={(name) => setStatus(S.saved(name), 'success')}
        />
      </Section>
    </div>
  );
}
