/**
 * 右側：編輯面板（角色／關係線／關係類型／群體關係／聚合線／角色資訊；第四批：便利貼、圖表節點、世界觀、備忘錄、
 * 統計與尋路）、選取 2 位以上時的批次編輯，都沒有時是分頁設定。
 */
import { X } from 'lucide-react';
import { IconButton } from '@/ui';
import { setUi, useProject, useUi } from '../state/store';
import { S } from '../strings';
import { BatchPanel } from './BatchPanel';
import { CharPanel } from './CharPanel';
import { ColEdgePanel, GrelPanel } from './GrelPanels';
import { InfoPanel } from './InfoPanel';
import { LorePanel, MemoPanel } from './LorePanel';
import { NotePanel } from './NotePanel';
import { RelPanel } from './RelPanel';
import { SettingsPanel } from './SettingsPanel';
import { StatsPanel } from './StatsPanel';
import { TypePanel } from './TypePanel';

export function Inspector() {
  const panel = useUi((u) => u.panel);
  const sel = useUi((u) => u.sel);
  const isChart = useProject((s) =>
    panel?.kind === 'note'
      ? !!s.data.sheets[s.data.active]?.notes.find((n) => n.id === panel.id)?.chart
      : false,
  );
  /* 世界觀、備忘錄、統計切分頁時留著（7.10）：換一張分頁＝重新掛上（輸入中的一段先記下、統計的選擇與鎖定聚焦清掉） */
  const sheetId = useProject((s) => s.data.sheets[s.data.active]?.id ?? 0);
  const noteTitle = isChart ? S.note.chartPanelTitle : S.note.panelTitle;
  const title = panel
    ? panel.kind === 'char'
      ? S.char.title
      : panel.kind === 'rel'
        ? S.rel.title
        : panel.kind === 'grel'
          ? S.grel.title
          : panel.kind === 'coledge'
            ? S.colEdge.panelTitle
            : panel.kind === 'info'
              ? S.info.title
              : panel.kind === 'note'
                ? noteTitle
                : panel.kind === 'lore'
                  ? S.lore.title
                  : panel.kind === 'memo'
                    ? S.memo.title
                    : panel.kind === 'stats'
                      ? S.stats.title
                      : S.type.title
    : sel.length >= 2
      ? S.batch.title(sel.length)
      : S.settings.title;
  return (
    <div
      className="flex min-h-0 flex-col rounded-lg border border-border bg-surface"
      data-testid="inspector"
    >
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <h2 className="text-sm font-semibold" data-testid="inspector-title">
          {title}
        </h2>
        {panel ? (
          <IconButton
            size="sm"
            className="ml-auto"
            icon={<X />}
            label={S.panel.close}
            onClick={() => setUi({ panel: null })}
            data-testid="panel-close"
          />
        ) : null}
      </div>
      <div className="min-h-0 overflow-auto p-3 lg:flex-1">
        {panel?.kind === 'char' ? (
          <CharPanel key={panel.id} id={panel.id} />
        ) : panel?.kind === 'rel' ? (
          <RelPanel key={panel.id} id={panel.id} />
        ) : panel?.kind === 'type' ? (
          <TypePanel key={panel.id} id={panel.id} />
        ) : panel?.kind === 'grel' ? (
          <GrelPanel key={panel.id} id={panel.id} />
        ) : panel?.kind === 'coledge' ? (
          <ColEdgePanel key={panel.key} colKey={panel.key} />
        ) : panel?.kind === 'info' ? (
          <InfoPanel key={panel.id} id={panel.id} />
        ) : panel?.kind === 'note' ? (
          <NotePanel key={panel.id} id={panel.id} />
        ) : panel?.kind === 'lore' ? (
          <LorePanel key={sheetId} />
        ) : panel?.kind === 'memo' ? (
          <MemoPanel key={sheetId} />
        ) : panel?.kind === 'stats' ? (
          <StatsPanel key={sheetId} />
        ) : sel.length >= 2 ? (
          <BatchPanel ids={sel} />
        ) : (
          <SettingsPanel />
        )}
      </div>
    </div>
  );
}
