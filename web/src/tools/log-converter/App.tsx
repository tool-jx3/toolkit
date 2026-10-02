/**
 * CCFOLIA 日誌轉換器：把 CCFOLIA 匯出的聊天日誌（HTML）轉成小說、時間軸或 CCFOLIA 風格的網頁。
 * 左欄（窄螢幕在下方）：使用說明、選檔與輸出樣式、四個設定分頁；右欄：開始轉換、預覽、下載。
 * 全部在瀏覽器裡處理，不上傳。
 */
import { BookText, Image, Palette, SlidersHorizontal } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { useSaveStatus } from '@/core/storage';
import { ProjectMenu, Tabs, ToolShell, UsageSection } from '@/ui';
import { LoadSection } from './LoadSection';
import { AdvancedPanel, AppearancePanel, BasicPanel, IllustrationPanel } from './panels';
import { ResultPanel } from './Result';
import { type LcSettings, normalizeSettings, TOOL_ID } from './settings';
import { useSession, useSettings } from './store';
import { S, USAGE } from './strings';
import { installTestHook } from './testHook';

function Usage() {
  return (
    <>
      <p>{USAGE.intro}</p>
      <h3 className="mt-3 mb-1 text-sm font-semibold">基本流程</h3>
      <ol>
        {USAGE.steps.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ol>
      <h3 className="mt-3 mb-1 text-sm font-semibold">三種樣式</h3>
      <ul>
        {USAGE.styles.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <h3 className="mt-3 mb-1 text-sm font-semibold">設定分頁</h3>
      <ul>
        {USAGE.tabs.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
      <h3 className="mt-3 mb-1 text-sm font-semibold">小提醒</h3>
      <ul>
        {USAGE.tips.map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </>
  );
}

function SettingsColumn({ usage }: { usage: ReactNode }) {
  const loaded = useSession((s) => s.phase === 'loaded' && !!s.source);
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <UsageSection persistKey={TOOL_ID}>{usage}</UsageSection>
      <LoadSection />
      {loaded ? (
        <Tabs
          aria-label={S.tabs.label}
          defaultValue="basic"
          items={[
            { value: 'basic', label: S.tabs.basic, icon: <BookText />, content: <BasicPanel /> },
            {
              value: 'appearance',
              label: S.tabs.appearance,
              icon: <Palette />,
              content: <AppearancePanel />,
            },
            {
              value: 'illustration',
              label: S.tabs.illustration,
              icon: <Image />,
              content: <IllustrationPanel />,
            },
            {
              value: 'advanced',
              label: S.tabs.advanced,
              icon: <SlidersHorizontal />,
              content: <AdvancedPanel />,
            },
          ]}
        />
      ) : (
        <p className="m-0 rounded-md bg-surface-2 p-3 text-sm text-muted" data-testid="no-log">
          {S.load.noLog}
        </p>
      )}
    </div>
  );
}

export function App() {
  const savedAt = useSaveStatus(TOOL_ID);
  useEffect(() => installTestHook(), []);
  const usage = <Usage />;
  return (
    <ToolShell
      toolId={TOOL_ID}
      usage={usage}
      headerActions={
        <ProjectMenu<LcSettings>
          toolId={TOOL_ID}
          getData={() => useSettings.getState().data}
          onLoad={(data) => {
            if (!data || typeof data !== 'object') return false;
            useSettings.getState().replace(normalizeSettings(data));
            return true;
          }}
          onReset={() => {
            try {
              localStorage.removeItem(useSettings.storageKey);
            } catch {
              /* 瀏覽器不讓存取時照樣重新載入 */
            }
            window.location.reload();
          }}
          resetConfirm={{
            title: S.project.resetTitle,
            description: S.project.resetDescription,
            confirmLabel: S.project.resetConfirm,
            danger: true,
          }}
          resetLabel={S.project.resetMenu}
          confirmOpen={false}
          savedAt={savedAt}
          fileName="ccfolia-log-converter"
        />
      }
      settings={<SettingsColumn usage={usage} />}
      preview={<ResultPanel />}
    />
  );
}
