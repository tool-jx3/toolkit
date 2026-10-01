import { Redo2, Undo2 } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useSaveStatus, useUndoRedo } from '@/core/storage';
import {
  IconButton,
  ProjectMenu,
  type ProjectNotice,
  type Shortcut,
  Tabs,
  ToolShell,
  UsageSection,
} from '@/ui';
import { buildChatCss } from './css';
import { Preview, resetPreviewMessages, scene } from './Preview';
import { BasicPanel, MessagePanel, MotionPanel, ObsPanel, TextPanel, WindowPanel } from './panels';
import { type ChatSettings, projectFileName } from './settings';
import {
  PROJECT_VERSION,
  replaceAll,
  resetAll,
  type SettingsTab,
  setStatus,
  TOOL_ID,
  useChat,
  usePreview,
} from './store';
import { S } from './strings';
import { applyChatTemplate, getTemplate, normalizeChatSettings, TEMPLATES } from './templates';

const USAGE = (
  <>
    <p>{S.intro}</p>
    <ol>
      {S.usage.steps.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ol>
    <ul>
      {S.usage.notes.map((t) => (
        <li key={t}>{t}</li>
      ))}
    </ul>
    <p className="text-xs text-muted">{S.usage.disclaimer}</p>
  </>
);

declare global {
  interface Window {
    __chatWindow?: unknown;
  }
}

export function App() {
  const { undo, redo, canUndo, canRedo } = useUndoRedo(useChat);
  const savedAt = useSaveStatus(TOOL_ID);
  const settingsTab = usePreview((st) => st.data.settingsTab);
  const roomRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setStatus(S.ready, 'info');
    /* 測試與對等驗證用 */
    window.__chatWindow = {
      settings: () => useChat.getState().data,
      set: (patch: Partial<ChatSettings>) => useChat.getState().patch(patch),
      replace: (d: unknown) => replaceAll(normalizeChatSettings(d)),
      history: () => ({
        past: useChat.temporal.getState().pastStates.length,
        future: useChat.temporal.getState().futureStates.length,
      }),
      preview: () => usePreview.getState().data,
      scene,
      buildCss: (d: unknown) => buildChatCss(normalizeChatSettings(d)),
      templates: TEMPLATES.map((t) => t.id),
      applyTemplate: (id: string) => {
        const t = getTemplate(id);
        if (t) useChat.getState().replace(applyChatTemplate(useChat.getState().data, t));
        return !!t;
      },
      previewTab: (tab: 'main' | 'secret') => usePreview.getState().patch({ tab }),
    };
  }, []);

  const gotoRoom = () => {
    usePreview.getState().patch({ settingsTab: 'obs' });
    /* 等分頁內容出現後再捲動與聚焦 */
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const el = roomRef.current;
        if (!el) return;
        el.scrollIntoView({ block: 'center' });
        el.focus();
      }),
    );
  };

  const notify = (n: ProjectNotice) => {
    if (n.kind === 'saved') setStatus(S.project.saved(n.fileName ?? ''), 'success');
    else if (n.kind === 'opened') setStatus(S.project.opened(n.fileName ?? ''), 'success');
    else if (n.kind === 'open-failed') setStatus(S.project.openFailed(n.message ?? ''), 'danger');
    else setStatus(S.project.resetDone, 'info');
  };

  const shortcuts: Shortcut[] = [
    { keys: 'mod+z', label: '復原', group: S.shortcutsGroup, handler: undo },
    { keys: ['mod+y', 'shift+mod+z'], label: '重做', group: S.shortcutsGroup, handler: redo },
  ];

  return (
    <ToolShell
      toolId={TOOL_ID}
      shortcuts={shortcuts}
      usage={USAGE}
      headerActions={
        <>
          <IconButton label={S.undo} icon={<Undo2 />} onClick={undo} disabled={!canUndo} />
          <IconButton label={S.redo} icon={<Redo2 />} onClick={redo} disabled={!canRedo} />
          <ProjectMenu<ChatSettings>
            toolId={TOOL_ID}
            version={PROJECT_VERSION}
            getData={() => useChat.getState().data}
            onLoad={(d) => replaceAll(normalizeChatSettings(d))}
            onReset={() => {
              resetAll();
              resetPreviewMessages();
            }}
            savedAt={savedAt}
            saveFileName={() => projectFileName(useChat.getState().data.fileName)}
            confirmOpen={false}
            onNotify={notify}
            resetText={{
              label: S.project.resetLabel,
              title: S.project.resetTitle,
              description: S.project.resetDescription,
              confirmLabel: '全部重來',
            }}
          />
        </>
      }
      settings={
        <>
          <p className="m-0 text-sm text-muted">{S.intro}</p>
          <UsageSection persistKey={TOOL_ID}>{USAGE}</UsageSection>
          <Tabs<SettingsTab>
            aria-label={S.tabsLabel}
            value={settingsTab}
            onValueChange={(v) => usePreview.getState().patch({ settingsTab: v })}
            items={[
              { value: 'basic', label: S.tabs.basic, content: <BasicPanel /> },
              { value: 'window', label: S.tabs.window, content: <WindowPanel /> },
              { value: 'message', label: S.tabs.message, content: <MessagePanel /> },
              { value: 'text', label: S.tabs.text, content: <TextPanel /> },
              { value: 'motion', label: S.tabs.motion, content: <MotionPanel /> },
              { value: 'obs', label: S.tabs.obs, content: <ObsPanel roomRef={roomRef} /> },
            ]}
          />
        </>
      }
      preview={<Preview onGotoRoom={gotoRoom} />}
    />
  );
}
