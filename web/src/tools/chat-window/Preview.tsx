/**
 * 預覽欄：狀態列、預覽分頁、模擬的 CCFOLIA 聊天頁（CssPreviewFrame）、測試訊息、輸出（網址提示、複製／儲存 CSS）。
 */
import { RotateCcw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { chatUrlFrom } from '@/ccfolia';
import { createChatScene } from '@/ccfolia/mock/chat';
import {
  Button,
  CssExportPanel,
  CssPreviewFrame,
  Field,
  MessageComposer,
  Notice,
  Section,
  Segmented,
  SourceUrlField,
} from '@/ui';
import { TextRow, useSettings } from './controls';
import { buildChatCss } from './css';
import {
  customMessage,
  isDiceKind,
  nextTime,
  type PreviewTab,
  SPEAKER_IDS,
  SPEAKERS,
  type SpeakerId,
  sampleMessages,
  sampleTabs,
  TEST_KINDS,
  type TestKind,
  tabIndex,
  testMessage,
} from './samples';
import { fileStem, scrollActive } from './settings';
import { setStatus, usePreview, useStatus } from './store';
import { S } from './strings';
import { getTemplate } from './templates';

/** 預覽的模擬頁（主分頁＋有參加者的秘匿分頁） */
export const scene = createChatScene({
  tabs: sampleTabs(),
  selected: tabIndex(usePreview.getState().data.tab),
});

/** 測試訊息各種類已送出的次數（輪流使用範例） */
const sent: Record<TestKind, number> = {
  chat: 0,
  success: 0,
  failure: 0,
  other: 0,
  secret: 0,
  long: 0,
  system: 0,
};

/** 兩個分頁的訊息都回到初始的範例（全部重來時） */
export function resetPreviewMessages(): void {
  for (const k of TEST_KINDS) sent[k] = 0;
  scene.update({ tabs: sampleTabs(), selected: tabIndex(usePreview.getState().data.tab) });
}

/** 測試用：網址加 ?pause=毫秒 時，預覽裡的動畫停在那個時間點 */
const PAUSE_AT = (() => {
  const v = new URLSearchParams(window.location.search).get('pause');
  return v === null ? null : Number(v);
})();

/** 目前的 CSS（設定改變時重算） */
export function useCss(): string {
  const s = useSettings();
  return useMemo(
    () => buildChatCss(s, { templateName: getTemplate(s.templateId)?.name ?? null }),
    [s],
  );
}

function StatusLine() {
  const st = useStatus();
  if (!st.text) return null;
  return (
    <Notice key={st.seq} tone={st.tone} className="text-xs">
      <span data-testid="status">{st.text}</span>
    </Notice>
  );
}

function TestMessages() {
  const tab = usePreview((st) => st.data.tab);
  const s = useSettings();
  const [speaker, setSpeaker] = useState<SpeakerId>('qing');
  const [kind, setKind] = useState<'chat' | 'success' | 'failure' | 'other'>('chat');
  const tabName = S.preview.tabs[tab];
  const idx = tabIndex(tab);
  const messages = () => scene.state.tabs[idx]?.messages ?? [];

  const send = (k: TestKind) => {
    const n = sent[k]++;
    scene.addMessage(testMessage(k, n, nextTime(messages())), idx);
    const parts = [S.test.sent(tabName, S.test.kinds[k])];
    let tone: 'success' | 'warning' | 'info' = 'success';
    if (s.diceOnly && !isDiceKind(k)) {
      parts.push(S.test.hiddenDiceOnly);
      tone = 'warning';
    } else if (!s.diceOnly && s.hideSystem && k === 'system') {
      parts.push(S.test.hiddenSystem);
      tone = 'warning';
    } else if (k === 'long' && !scrollActive(s)) {
      parts.push(S.test.longHint);
      tone = 'info';
    }
    setStatus(parts.join(''), tone);
  };

  return (
    <Section title={S.test.section} description={S.test.description} persistKey="chat-window:test">
      <fieldset className="m-0 flex min-w-0 flex-wrap gap-1.5 border-0 p-0">
        <legend className="sr-only">{S.test.section}</legend>
        {TEST_KINDS.map((k) => (
          <Button key={k} size="sm" onClick={() => send(k)}>
            {S.test.kinds[k]}
          </Button>
        ))}
      </fieldset>
      <Field label={S.test.custom}>
        <MessageComposer
          speakers={SPEAKER_IDS.map((id) => ({ value: id, label: SPEAKERS[id].name }))}
          speaker={speaker}
          onSpeakerChange={(v) => setSpeaker(v as SpeakerId)}
          kinds={[
            { value: 'chat', label: S.test.composerKinds.chat },
            { value: 'success', label: S.test.composerKinds.success, needsResult: true },
            { value: 'failure', label: S.test.composerKinds.failure, needsResult: true },
            { value: 'other', label: S.test.composerKinds.other, needsResult: true },
          ]}
          kind={kind}
          onKindChange={(v) => setKind(v as typeof kind)}
          placeholder={S.test.placeholder}
          resultExample={S.test.resultExample}
          onSend={(m) => {
            const k = m.kind as typeof kind;
            scene.addMessage(
              customMessage(m.speaker as SpeakerId, k, m.command, m.result, nextTime(messages())),
              idx,
            );
            const parts = [S.test.sent(tabName, S.test.composerKinds[k])];
            const hidden = s.diceOnly && k === 'chat';
            if (hidden) parts.push(S.test.hiddenDiceOnly);
            setStatus(parts.join(''), hidden ? 'warning' : 'success');
          }}
        />
      </Field>
      <div>
        <Button
          size="sm"
          variant="ghost"
          icon={<RotateCcw />}
          onClick={() => {
            scene.setMessages(sampleMessages(tab), idx);
            setStatus(S.test.resetDone(tabName), 'info');
          }}
        >
          {S.test.reset}
        </Button>
      </div>
    </Section>
  );
}

function Output({ css, onGotoRoom }: { css: string; onGotoRoom: () => void }) {
  const s = useSettings();
  const url = chatUrlFrom(s.room);
  return (
    <Section title={S.output.section} fixed>
      <TextRow k="fileName" label={S.output.fileName} hint={S.output.fileNameHint} />
      <Field label={S.output.urlLabel}>
        <SourceUrlField
          url={url}
          placeholder={S.obs.urlPlaceholder}
          missingWarning={S.output.missingUrl}
          missingAction={
            <Button size="sm" onClick={onGotoRoom}>
              {S.output.gotoRoom}
            </Button>
          }
          copiedMessage={S.output.urlCopied}
          onCopy={(ok) =>
            setStatus(ok ? S.output.urlCopied : S.output.urlCopyFailed, ok ? 'success' : 'danger')
          }
        />
      </Field>
      <CssExportPanel
        css={css}
        fileName={fileStem(s.fileName)}
        fallbackFileName="chatwindow"
        status={null}
        onCopy={(ok) =>
          setStatus(
            ok ? S.output.copied(s.width, s.height, !!url) : S.output.copyFailed,
            ok ? 'success' : 'danger',
          )
        }
        onSave={(name) => setStatus(S.output.saved(name), 'success')}
      />
    </Section>
  );
}

export function Preview({ onGotoRoom }: { onGotoRoom: () => void }) {
  const s = useSettings();
  const css = useCss();
  const tab = usePreview((st) => st.data.tab);
  const background = usePreview((st) => st.data.background);
  const patch = usePreview((st) => st.patch);
  const [hover, setHover] = useState(false);

  useEffect(() => {
    if (scene.state.selected !== tabIndex(tab)) scene.selectTab(tabIndex(tab));
  }, [tab]);

  return (
    <>
      <StatusLine />
      <Field label={S.preview.tab} layout="inline">
        <Segmented<PreviewTab>
          value={tab}
          onValueChange={(t) => patch({ tab: t })}
          options={[
            { value: 'main', label: S.preview.tabs.main },
            { value: 'secret', label: S.preview.tabs.secret },
          ]}
          size="sm"
        />
      </Field>
      <CssPreviewFrame
        width={s.width}
        height={s.height}
        css={css}
        scene={scene}
        maxHeight={620}
        pointer="hover"
        background={background}
        onBackgroundChange={(bg) => patch({ background: bg })}
        backgrounds={['scene', 'checker', 'dark', 'light']}
        hover={hover}
        onHoverChange={setHover}
        label={S.preview.label}
        className="shrink-0"
        pauseAt={PAUSE_AT}
        sizeNote={`${S.preview.sizeNote}${s.hoverTabs ? S.preview.hoverNote : ''}`}
      />
      <TestMessages />
      <Output css={css} onGotoRoom={onGotoRoom} />
    </>
  );
}
