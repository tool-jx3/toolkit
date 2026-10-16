/**
 * 右側：編輯面板（角色／關係線／關係類型／群體關係／聚合線／角色資訊）、選取 2 位以上時的批次編輯，都沒有時是分頁設定。
 */
import { X } from 'lucide-react';
import { IconButton } from '@/ui';
import { setUi, useUi } from '../state/store';
import { S } from '../strings';
import { BatchPanel } from './BatchPanel';
import { CharPanel } from './CharPanel';
import { ColEdgePanel, GrelPanel } from './GrelPanels';
import { InfoPanel } from './InfoPanel';
import { RelPanel } from './RelPanel';
import { SettingsPanel } from './SettingsPanel';
import { TypePanel } from './TypePanel';

export function Inspector() {
  const panel = useUi((u) => u.panel);
  const sel = useUi((u) => u.sel);
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
        ) : sel.length >= 2 ? (
          <BatchPanel ids={sel} />
        ) : (
          <SettingsPanel />
        )}
      </div>
    </div>
  );
}
