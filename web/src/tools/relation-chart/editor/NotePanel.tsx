/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 便利貼設定（原作的 openNotePanel）與圖表節點設定（openChartPanel）：右側的編輯面板。
 * 便利貼：釘選、刪除（＝關閉，進便利貼庫）、隱藏紙面、字級（留空＝跟隨分頁預設字級→自動）、本分頁預設字級、目前實際字級。
 * 圖表節點：釘選、刪除、標題、範本、角色 A／B 與各自顯示的狀態、顯示圖例、隱藏卡面。
 * 每個改動一步復原；文字欄與數字欄離開才記一步。
 */
import { Pin, PinOff, Trash2 } from 'lucide-react';
import { Button, Checkbox, Field, OptionalNumberInput, Select } from '@/ui';
import { displayName, sheetCtx } from '../engine/geom';
import { noteFontSize } from '../engine/notes';
import { radarStateName, radarTplName } from '../logic/card';
import { variantOf } from '../model/library';
import type { Note } from '../model/types';
import { updateSettings } from '../state/actions';
import { closeNote, updateNote } from '../state/noteActions';
import { gesture, setUi, useProject } from '../state/store';
import { S } from '../strings';
import { useSheet } from './hooks';
import { LiveText } from './widgets';

const T = S.note;

function Bar({ n }: { n: Note }) {
  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant={n.locked ? 'primary' : 'secondary'}
        aria-pressed={n.locked}
        icon={n.locked ? <PinOff /> : <Pin />}
        title={T.pinTip}
        onClick={() =>
          updateNote(n.id, (d) => {
            d.locked = !d.locked;
          })
        }
        data-testid="note-pin"
      >
        {n.locked ? T.unpin : T.pin}
      </Button>
      <Button
        size="sm"
        variant="danger"
        className="ml-auto"
        icon={<Trash2 />}
        title={T.closeTip}
        onClick={() => {
          closeNote(n.id);
          setUi({ panel: null });
        }}
        data-testid="note-del"
      >
        {T.del}
      </Button>
    </div>
  );
}

/**
 * 數字欄：離開欄位或 Enter 才寫入，一次記一步。
 * 填 0（或小於 1）＝留空（跟隨／自動），不夾成 1 px（原作 openNotePanel 的 `v >= 1 ? v : undefined`；7.10）。
 */
function LiveNumber({
  value,
  onChange,
  label,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  label: string;
}) {
  return (
    <OptionalNumberInput
      size="sm"
      value={value && value >= 1 ? value : null}
      min={0}
      max={200}
      fallback={1}
      placeholder={T.fsAuto}
      aria-label={label}
      onFocus={() => gesture.begin()}
      onBlur={() => gesture.commit()}
      onChange={onChange}
      className="w-28"
    />
  );
}

function TextNotePanel({ n }: { n: Note }) {
  const sheet = useSheet();
  const now = Math.round(noteFontSize(sheetCtx(sheet), n) * 10) / 10;
  return (
    <>
      <Checkbox
        checked={n.bare}
        onCheckedChange={(v) =>
          updateNote(n.id, (d) => {
            d.bare = v;
          })
        }
        label={T.bare}
      />
      <p className="text-xs text-muted">{T.bareHint}</p>
      <Field label={T.fsLabel} hint={T.fsHint}>
        <LiveNumber
          value={n.size}
          label={T.fsLabel}
          onChange={(v) =>
            updateNote(n.id, (d) => {
              d.size = v && v >= 1 ? v : null;
            })
          }
        />
      </Field>
      <Field label={T.fsSheet}>
        <LiveNumber
          value={sheet.settings.defStickySize}
          label={T.fsSheet}
          onChange={(v) =>
            updateSettings((s) => {
              s.defStickySize = v && v >= 1 ? Math.min(200, v) : 0;
            })
          }
        />
      </Field>
      <p className="text-xs text-muted" data-testid="note-fs-now">
        {T.fsNow(now)}
      </p>
    </>
  );
}

function ChartNotePanel({ n }: { n: Note }) {
  const sheet = useSheet();
  const library = useProject((s) => s.data.library);
  const radarTpls = useProject((s) => s.data.radarTpls);
  const ch = n.chart;
  if (!ch) return null;
  const tpl = radarTpls.find((t) => t.id === ch.tpl);
  const chars = sheet.chars.map((c) => ({ value: String(c.id), label: displayName(c) }));
  const set = (recipe: (c: NonNullable<Note['chart']>) => void) =>
    updateNote(n.id, (d) => {
      if (d.chart) recipe(d.chart);
    });
  const stateRow = (key: 'a' | 'b', charId: number, idx: number) => {
    const c = sheet.chars.find((x) => x.id === charId);
    if (!c) return null;
    const v = variantOf({ library }, c).variant;
    const list = tpl && v ? v.radars.filter((s) => s.tpl === tpl.id) : [];
    if (!list.length)
      return <p className="text-xs text-muted">{T.chartNoStates(displayName(c))}</p>;
    const cur = Math.min(idx, list.length - 1);
    return (
      <Field label={key === 'a' ? T.chartStateA : T.chartStateB}>
        <Select
          size="sm"
          value={String(cur)}
          onValueChange={(val) =>
            set((x) => {
              if (key === 'a') x.stA = Number(val);
              else x.stB = Number(val);
            })
          }
          options={list.map((s, i) => ({
            value: String(i),
            label: radarStateName(s, i, list.length) || S.radar.stateN(i + 1),
          }))}
          data-testid={`note-chart-st${key}`}
        />
      </Field>
    );
  };
  return (
    <>
      <Field label={T.chartTitle}>
        <LiveText
          value={n.text}
          placeholder={T.chartTitlePh}
          onChange={(t) =>
            updateNote(n.id, (d) => {
              d.text = t;
            })
          }
          data-testid="note-chart-title"
        />
      </Field>
      {radarTpls.length ? (
        <Field label={S.radar.tpl}>
          <Select
            size="sm"
            value={tpl ? String(tpl.id) : ''}
            placeholder={T.chartNoTpl}
            onValueChange={(val) =>
              set((x) => {
                x.tpl = Number(val);
                x.stA = 0;
                x.stB = 0;
              })
            }
            options={radarTpls.map((t) => ({ value: String(t.id), label: radarTplName(t) }))}
            data-testid="note-chart-tpl"
          />
        </Field>
      ) : (
        <p className="text-xs text-muted">{S.radar.noTpl}</p>
      )}
      <Field label={S.radar.charA}>
        <Select
          size="sm"
          value={sheet.chars.some((c) => c.id === ch.a) ? String(ch.a) : ''}
          placeholder={S.radar.pickChar}
          onValueChange={(val) =>
            set((x) => {
              x.a = Number(val);
              if (x.b === x.a) x.b = 0;
              x.stA = 0;
              x.stB = 0;
            })
          }
          options={chars}
          data-testid="note-chart-a"
        />
      </Field>
      {stateRow('a', ch.a, ch.stA)}
      <Field label={S.radar.charB}>
        <Select
          size="sm"
          value={ch.b && sheet.chars.some((c) => c.id === ch.b) ? String(ch.b) : '0'}
          onValueChange={(val) =>
            set((x) => {
              const b = Number(val);
              x.b = b && b !== x.a ? b : 0;
              x.stA = 0;
              x.stB = 0;
            })
          }
          options={[{ value: '0', label: S.radar.noCompare }, ...chars]}
          data-testid="note-chart-b"
        />
      </Field>
      {ch.b ? stateRow('b', ch.b, ch.stB) : null}
      <Checkbox
        checked={ch.legend}
        onCheckedChange={(v) =>
          set((x) => {
            x.legend = v;
          })
        }
        label={T.chartLegend}
      />
      <Checkbox
        checked={n.bare}
        onCheckedChange={(v) =>
          updateNote(n.id, (d) => {
            d.bare = v;
          })
        }
        label={T.chartBare}
      />
      <p className="text-xs text-muted">{T.chartBareHint}</p>
    </>
  );
}

export function NotePanel({ id }: { id: number }) {
  const sheet = useSheet();
  const n = sheet.notes.find((x) => x.id === id);
  if (!n) return null;
  return (
    <div className="flex flex-col gap-3" data-testid="note-panel">
      <Bar n={n} />
      {n.chart ? <ChartNotePanel n={n} /> : <TextNotePanel n={n} />}
    </div>
  );
}
