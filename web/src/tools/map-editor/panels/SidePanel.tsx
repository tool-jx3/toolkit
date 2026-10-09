/**
 * 屬性面板（F022、F025）：分頁「屬性／圖層／地圖設定」；≥ 1280 px 時圖層面板固定在右邊，這裡不顯示「圖層」分頁。
 */
import { useSyncExternalStore } from 'react';
import { cn, Tabs } from '@/ui';
import { subtoolOf, useEditor, useMapPrefs, usePrefs } from '../stores';
import { S } from '../strings';
import { DecorPanel } from './DecorPanel';
import { LayersPanel } from './LayersPanel';
import { SelectPanel } from './SelectPanel';
import { SettingsPanel } from './SettingsPanel';
import {
  CellPanel,
  DrawPanel,
  FreehandPanel,
  GroundPanel,
  RoomPanel,
  TextPanel,
  WallPanel,
} from './ToolPanels';

const WIDE = '(min-width: 1280px)';

function useWide(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(WIDE);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    () => window.matchMedia(WIDE).matches,
    () => false,
  );
}

function PropsContent() {
  const tool = useEditor((s) => s.tool);
  const mp = useMapPrefs();
  const sub = subtoolOf(tool, mp);
  switch (tool) {
    case 'select':
      return <SelectPanel />;
    case 'cell':
      return <CellPanel />;
    case 'ground':
      return <GroundPanel />;
    case 'wall':
      return <WallPanel />;
    case 'room':
      return <RoomPanel />;
    case 'decor':
      return <DecorPanel />;
    case 'freehand':
      return <FreehandPanel />;
    case 'text':
      return <TextPanel />;
    default:
      return <DrawPanel sub={sub} />;
  }
}

export function SidePanel({ className }: { className?: string }) {
  const tab = usePrefs((s) => s.data.panelTab);
  const wide = useWide();
  const current = wide && tab === 'layers' ? 'props' : tab;
  const items = [
    {
      value: 'props' as const,
      label: S.panel.tabs.props,
      content: (
        <div className="pt-3">
          <PropsContent />
        </div>
      ),
    },
    ...(wide
      ? []
      : [
          {
            value: 'layers' as const,
            label: S.panel.tabs.layers,
            content: (
              <div className="pt-3">
                <LayersPanel className="max-h-[32rem] border-0 p-0" />
              </div>
            ),
          },
        ]),
    {
      value: 'settings' as const,
      label: S.panel.tabs.settings,
      content: (
        <div className="pt-3">
          <SettingsPanel />
        </div>
      ),
    },
  ];
  return (
    <div
      className={cn(
        'min-w-0 rounded-md border border-border bg-surface p-2 lg:overflow-y-auto',
        className,
      )}
      data-testid="side-panel"
    >
      <Tabs
        items={items}
        value={current}
        onValueChange={(v) => usePrefs.getState().patch({ panelTab: v })}
        aria-label={S.panel.label}
      />
    </div>
  );
}
