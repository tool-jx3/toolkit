/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 角色資訊（F060；原作的 buildInfoContent）：同一個人（條目）在所有分頁、所有變體共用一份富文本。
 */
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/ui';
import { displayName } from '../engine/geom';
import { setCharInfo } from '../state/libActions';
import { setUi, useProject } from '../state/store';
import { S } from '../strings';
import { useSheet } from './hooks';
import { RichEditor } from './RichEditor';

export function InfoPanel({ id }: { id: number }) {
  const sheet = useSheet();
  const c = sheet.chars.find((x) => x.id === id);
  const entry = useProject((s) => (c ? s.data.library.find((e) => e.id === c.lib) : undefined));
  if (!c || !entry) return <p className="text-sm text-muted">{S.info.pickHint}</p>;
  return (
    <div className="flex flex-col gap-2" data-testid="info-panel">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="ghost"
          icon={<ArrowLeft />}
          onClick={() => setUi({ panel: { kind: 'char', id } })}
          data-testid="info-back"
        >
          {S.info.back}
        </Button>
      </div>
      <p className="text-sm">
        <span className="font-semibold">{displayName(c)}</span>
        <span className="text-muted"> — {S.info.shared}</span>
      </p>
      <RichEditor
        key={entry.id}
        value={entry.info}
        onChange={(html) => setCharInfo(entry.id, html)}
        placeholder={S.info.empty}
        aria-label={S.info.title}
        data-testid="info-editor"
      />
    </div>
  );
}
