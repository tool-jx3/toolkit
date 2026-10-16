/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 再次匯出（F147；原作的 syncExportAgain、exportAgain）：有記憶時才出現，字＝格式的短名＋「・」＋範圍；
 * 點了不開對話框，用上次的格式、範圍、勾選直接匯出，檔名每次重算。部分分頁記著分頁 id：那些分頁都不在了＝打開對話框重選。
 * 第五批的 GIF／影片也記（7.4 第 8 項）：目前分頁是 2 格以上的時間軸分頁＝直接匯出；不是＝打開對話框。
 */
import { Zap } from 'lucide-react';
import { useState } from 'react';
import { Button, useToast } from '@/ui';
import { sheetName } from '../engine/geom';
import { activeSheet, projectNow, setPrefs, setUi, usePrefs } from '../state/store';
import { S } from '../strings';
import { pickIndexes, runAnimExport, runExport } from './exportRun';

const E = S.exportDlg;

export function ExportAgain() {
  const last = usePrefs((p) => p.data.lastExport);
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  if (!last) return null;
  const label = E.again(`${E.short[last.fmt]}・${E.scopeShort[last.scope]}`);
  const run = async () => {
    const fmt = last.fmt;
    if (fmt === 'gif' || fmt === 'video') {
      const s = activeSheet();
      if (!s.tl || s.tl.frames.length < 2) {
        toast({ title: `${E.short[fmt]}：${S.anim.needTl}`, tone: 'warning' });
        setUi({ dialog: 'export' });
        return;
      }
      setBusy(true);
      try {
        const r = await runAnimExport(fmt, sheetName(s));
        toast({ title: E.done(r.fileName), tone: 'success' });
      } catch (e) {
        toast({
          title: E.failed,
          description: e instanceof Error ? e.message : undefined,
          tone: 'danger',
        });
      } finally {
        setBusy(false);
      }
      return;
    }
    const p = projectNow();
    let picked = new Set<number>();
    if (last.scope === 'some') {
      const ids = new Set(last.sheetIds ?? []);
      picked = new Set(p.sheets.map((s, i) => (ids.has(s.id) ? i : -1)).filter((i) => i >= 0));
      if (!picked.size) {
        toast({ title: E.againGone, tone: 'warning' });
        setPrefs({ exportFormat: fmt, exportScope: 'some' });
        setUi({ dialog: 'export' });
        return;
      }
    }
    const idx = pickIndexes(last.scope, picked);
    if (!idx.length) {
      setPrefs({ exportFormat: fmt, exportScope: last.scope });
      setUi({ dialog: 'export' });
      return;
    }
    setBusy(true);
    try {
      const name = await runExport(fmt, last.scope, idx, last.checks);
      toast({ title: E.done(name), tone: 'success' });
    } catch (e) {
      toast({
        title: E.failed,
        description: e instanceof Error ? e.message : undefined,
        tone: 'danger',
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button
      size="sm"
      variant="ghost"
      icon={<Zap />}
      title={`${label}\n${E.againTip}`}
      aria-label={label}
      loading={busy}
      onClick={() => void run()}
      data-testid="export-again"
    >
      <span className="hidden xl:inline">{label}</span>
      <span className="xl:hidden">{E.againMenu}</span>
    </Button>
  );
}
