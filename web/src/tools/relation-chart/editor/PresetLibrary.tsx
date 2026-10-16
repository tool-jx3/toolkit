/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 設定集（F174；原作的整體設定庫：renderGsetLibList、renderLibSide 的 gsets 分支、gsetViewHtml）：
 * 左欄＝名稱欄（只有「修改名稱」模式能打字）、說明、動作（套用、覆寫、存成新的一筆、恢復出廠預設）、內容檢視卡；
 * 右欄＝清單（★ 名稱，最愛排最前面）。點一列＝選取＋在左欄看內容（不套用）。模式：修改名稱、最愛、刪除（最愛的不能刪）。
 */
import { Pencil, Star, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, TextInput, useToast } from '@/ui';
import { sortedPresets } from '../model/presets';
import type { SettingsPreset, SheetSettings } from '../model/types';
import {
  applyPreset,
  deletePreset,
  factoryReset,
  overwritePreset,
  renamePreset,
  reorderPresets,
  savePreset,
  toggleFavPreset,
} from '../state/presetActions';
import { projectNow, setUi, useProject, useUi } from '../state/store';
import { S } from '../strings';
import type { LibAction } from './LabelLibrary';
import { EntryList, type EntryRow, useThumbSize } from './LibEntries';

const T = S.gsets;

export const GSET_ACTIONS: readonly LibAction[] = [
  { key: 'rename', icon: <Pencil />, tip: T.act.rename },
  { key: 'fav', icon: <Star />, tip: T.act.fav },
  { key: 'del', icon: <Trash2 />, tip: T.act.del, tone: 'danger' },
];

const presetName = (g: Pick<SettingsPreset, 'name'>) => g.name || T.unnamed;

/** 內容檢視卡（唯讀的「項目：值」；沒選＝全部 N/A） */
function ViewCard({ g }: { g: SettingsPreset | undefined }) {
  const frames = useProject((s) => s.data.frames);
  const v = g?.values as Partial<SheetSettings> | undefined;
  const NA = T.na;
  const has = (k: keyof SheetSettings) => v !== undefined && v[k] !== undefined;
  const onoff = (k: keyof SheetSettings, invert = false) =>
    has(k) ? ((invert ? !v?.[k] : !!v?.[k]) ? T.on : T.off) : NA;
  const shhide = (k: keyof SheetSettings) => (has(k) ? (v?.[k] ? T.show : T.hide) : NA);
  const px = (k: keyof SheetSettings) => {
    if (!has(k)) return NA;
    const n = Number(v?.[k]);
    return n > 0 ? `${n}px` : T.auto;
  };
  const sw = (k: keyof SheetSettings) => {
    const c = v?.[k];
    return (
      <span
        key={k}
        title={typeof c === 'string' && c !== 'auto' ? c : T.auto}
        className="inline-block size-3.5 rounded-sm border border-border-strong"
        style={{
          background:
            typeof c === 'string' && c !== 'auto'
              ? c
              : 'repeating-linear-gradient(45deg,transparent 0 3px,var(--color-border-strong,#888) 3px 4px)',
        }}
      />
    );
  };
  const rows: [string, React.ReactNode][] = g
    ? [
        [T.rows.legend, shhide('showLegend')],
        [T.rows.names, shhide('showNames')],
        [T.rows.relName, shhide('showRelName')],
        [T.rows.relNote, shhide('showRelNote')],
        [T.rows.labels, shhide('showLabelNodes')],
        [T.rows.guide, has('bgMode') ? T.guide[v?.bgMode ?? 'none'] : NA],
        [T.rows.shape, has('shapeSquare') ? T.shape[v?.shapeSquare ? 'square' : 'circle'] : NA],
        [
          T.rows.defFrame,
          has('defFrame')
            ? (frames.find((f) => f.id === v?.defFrame)?.name ?? T.frameNone) || T.frameNone
            : NA,
        ],
        [T.rows.collision, onoff('noCollision', true)],
        [T.rows.gridSnap, onoff('gridSnap')],
        [T.rows.avatarSize, px('defCharSize')],
        [T.rows.borderW, px('defBorderW')],
        [
          T.rows.textSizes,
          `${px('defNameSize')} / ${px('defRelNameSize')} / ${px('defNoteSize')} / ${px('defStickySize')}`,
        ],
        [T.rows.straight, onoff('edgeStraight')],
        [T.rows.bridge, onoff('bridgeMode')],
        [T.rows.lineW, px('defLineW')],
        [T.rows.spacing, has('spacingPct') ? `${v?.spacingPct}% · ${v?.edgeGapPx ?? 18}px` : NA],
        [
          T.rows.color,
          has('colAvatarBg') ? (
            <span key="sw" className="inline-flex gap-1">
              {sw('colAvatarBg')}
              {sw('colAvatarRing')}
              {sw('colRelLine')}
              {sw('colRelOutline')}
            </span>
          ) : (
            NA
          ),
        ],
        [T.rows.palette, has('palette') ? T.palette[v?.palette ?? 'dark'] : NA],
      ]
    : Object.values(T.rows).map((k) => [k, NA] as [string, React.ReactNode]);
  return (
    <div
      className="flex flex-col gap-1 rounded-md border border-border p-2"
      data-testid="gset-view"
    >
      <div className="text-sm font-semibold" data-testid="gset-view-title">
        {g ? (
          <>
            {g.fav ? <Star className="mr-1 inline size-3.5 fill-current text-warning" /> : null}
            {presetName(g)}
          </>
        ) : (
          NA
        )}
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-xs">
        {rows.map(([k, val]) => (
          <div key={k} className="contents" data-testid="gset-row">
            <dt className="text-muted">{k}</dt>
            <dd className="m-0 min-w-0 truncate">{val}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function GsetSide() {
  const mode = useUi((u) => u.libMode);
  const pick = useUi((u) => u.libPreset);
  const lib = useProject((s) => s.data.settingsLib);
  const sel = pick === null ? undefined : lib.find((g) => g.id === pick);
  const [name, setName] = useState('');
  const toast = useToast();
  /* 存、覆寫、套用、恢復出廠預設：通知（F174b） */
  const done = (title: string) => toast({ title, tone: 'success' });
  /* 修改名稱模式：選到的那一筆的名稱載入輸入框 */
  useEffect(() => {
    setName(mode === 'rename' && sel ? sel.name : '');
  }, [mode, sel]);
  const hint =
    mode === 'rename'
      ? T.renameHint
      : mode === 'fav'
        ? T.favHint
        : mode === 'del'
          ? T.delHint
          : T.viewHint;
  return (
    <div className="flex flex-col gap-2" data-testid="gset-side">
      <TextInput
        value={name}
        disabled={mode !== 'rename' || !sel}
        placeholder={mode === 'rename' ? T.renamePh : T.idlePh}
        aria-label={T.nameLabel}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && sel) {
            e.preventDefault();
            renamePreset(sel.id, name);
          }
        }}
        data-testid="gset-name"
      />
      <p className="text-xs text-muted">{hint}</p>
      <div className="flex flex-col gap-1">
        {sel ? (
          <>
            <Button
              size="sm"
              variant="primary"
              onClick={() => {
                applyPreset(sel.id);
                done(T.applied(presetName(sel)));
              }}
              data-testid="gset-apply"
            >
              {T.apply}
            </Button>
            <Button
              size="sm"
              onClick={() => {
                overwritePreset(sel.id);
                done(T.overwritten(presetName(sel)));
              }}
              data-testid="gset-overwrite"
            >
              {T.overwrite}
            </Button>
          </>
        ) : null}
        <Button
          size="sm"
          onClick={() => {
            const id = savePreset();
            const g = projectNow().settingsLib.find((x) => x.id === id);
            if (g) done(T.saved(presetName(g)));
          }}
          data-testid="gset-add"
        >
          {T.addCur}
        </Button>
        <Button
          size="sm"
          title={T.factoryTip}
          onClick={() => {
            factoryReset();
            done(T.factoryDone);
          }}
          data-testid="gset-factory"
        >
          {T.factory}
        </Button>
      </div>
      <ViewCard g={sel} />
    </div>
  );
}

export function GsetList({ query }: { query: string }) {
  const lib = useProject((s) => s.data.settingsLib);
  const mode = useUi((u) => u.libMode);
  const pick = useUi((u) => u.libPreset);
  const thumb = useThumbSize();
  const toast = useToast();
  const q = query.trim().toLowerCase();
  const rows: EntryRow[] = sortedPresets(lib)
    .filter((g) => !q || presetName(g).toLowerCase().includes(q))
    .map((g) => ({
      id: g.id,
      name: presetName(g),
      thumb: (
        <Star
          aria-hidden
          className={`shrink-0 ${g.fav ? 'fill-current text-warning' : 'text-muted opacity-40'}`}
          style={{ width: Math.round(thumb * 0.7), height: Math.round(thumb * 0.7) }}
        />
      ),
      meta: g.fav ? T.fav : '',
      onSheet: false,
      sheets: [],
    }));
  return (
    <EntryList
      rows={rows}
      sheets={[]}
      grouped={false}
      sig={`gsets|${q}`}
      empty={lib.length ? T.noMatch : T.empty}
      label={T.list}
      picked={mode === null || mode === 'rename' ? pick : null}
      onClick={(id) => {
        if (mode === 'del') {
          if (!deletePreset(id)) toast({ title: T.favProtected, tone: 'warning' });
          else if (pick === id) setUi({ libPreset: null });
          return;
        }
        if (mode === 'fav') {
          toggleFavPreset(id);
          return;
        }
        setUi({ libPreset: id });
      }}
      onReorder={reorderPresets}
      onDeleteMany={(ids) => {
        for (const id of ids) deletePreset(id);
      }}
      groupDelText={() => ''}
    />
  );
}
