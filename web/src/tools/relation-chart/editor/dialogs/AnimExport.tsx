/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 匯出對話框的「GIF／影片」（F148；原作「檔案 › 輸出」的 GIF 動畫、影片）：只有目前分頁是 2 格以上的時間軸分頁才出現。
 * 用共用的匯出區（ExportPanel：格式、進度、取消、結果卡；7.4 第 5 項）；每秒 20 格固定、範圍固定目前分頁、檔名可改。
 * 匯出後記住格式（再次匯出包含 GIF、影片，7.4 第 8 項）。
 */
import { useEffect, useMemo, useState } from 'react';
import { ExportPanel, Field, TextInput } from '@/ui';
import { sheetName } from '../../engine/geom';
import { ANIM_FPS, animPlanFor, planSeconds, videoMethod } from '../../export/anim';
import { activeSheet, usePrefs } from '../../state/store';
import { S } from '../../strings';
import { runAnimExport } from '../exportRun';

const A = S.anim;

export function AnimExport() {
  const sheet = activeSheet();
  const pref = usePrefs((p) => p.data.exportFormat);
  const [kind, setKind] = useState<'gif' | 'video'>(pref === 'video' ? 'video' : 'gif');
  const [name, setName] = useState<string | null>(null);
  const [method, setMethod] = useState<'mp4' | 'record' | null | undefined>(undefined);
  useEffect(() => {
    let alive = true;
    void videoMethod().then((m) => {
      if (alive) setMethod(m);
    });
    return () => {
      alive = false;
    };
  }, []);
  const plan = useMemo(() => animPlanFor(sheet, kind, kind === 'video'), [sheet, kind]);
  const base = sheetName(sheet);
  const sec = planSeconds(plan).toFixed(2);
  const hint =
    kind === 'gif'
      ? A.gifHint(plan.ps.length, plan.w, plan.h, sec)
      : A.videoHint(plan.ps.length, plan.w, plan.h, sec);
  return (
    <ExportPanel
      title={`${A.gif}／${A.video}`}
      formats={[
        { id: 'gif', label: A.gif, animated: true, description: hint },
        {
          id: 'video',
          label: A.video,
          animated: true,
          description: `${hint}${method === 'mp4' ? A.mp4 : method === 'record' ? A.webm : ''}`,
          disabled: method === null,
          disabledReason: method === null ? A.noVideo : undefined,
        },
      ]}
      defaultSettings={{ format: kind }}
      onSettingsChange={(s) => setKind(s.format === 'video' ? 'video' : 'gif')}
      fixedFps={ANIM_FPS}
      fixedFpsHint={A.fpsHint}
      estimate={{
        width: plan.w,
        height: plan.h,
        frames: plan.ps.length,
        duration: planSeconds(plan),
      }}
      extra={
        <Field label={S.exportDlg.fileName} hint={S.exportDlg.fileNameHint}>
          <TextInput
            value={name ?? base}
            onChange={(e) => setName(e.target.value)}
            aria-label={S.exportDlg.fileName}
            data-testid="anim-name"
          />
        </Field>
      }
      onExport={async (s, ctx) => {
        const k = s.format === 'video' ? 'video' : 'gif';
        const r = await runAnimExport(k, name?.trim() || base, ctx, false);
        return {
          blob: r.blob,
          fileName: r.fileName,
          width: r.width,
          height: r.height,
          frames: r.frames,
          duration: r.seconds,
        };
      }}
    />
  );
}
