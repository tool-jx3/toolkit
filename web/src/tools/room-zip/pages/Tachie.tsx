/**
 * 立繪庫（F225～F233）：加入（新增、從素材挑選、拖放建立）、批次設定、角色篩選、立繪卡片（圖、角色名稱、表情名稱、複製、
 * 做表情差分、刪除）、差分卡片（單獨設定）、大小與抬升、大小讀數。立繪頁的試排在右側面板的「預覽」。
 */
import { Copy, Smile, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, Checkbox, cn, IconButton, Slider, TextInput } from '@/ui';
import {
  addTachie,
  applyTachieBulk,
  createTachieFace,
  defaultsOf,
  deleteTachie,
  duplicateTachie,
  setTachieSolo,
  type TachieBulkKey,
} from '../actions';
import { Card, DropCreate, Hint, ImageField, Labeled, NumCell, Row, useNotify } from '../common';
import { materialLookup, tachieBase, tachieSize, tachieSource, tachieY } from '../geometry';
import { importFiles } from '../importer';
import { gridPos, gridSize, type TachieEntry, toNumber } from '../model';
import { openMultiPick } from '../ops';
import { commit, ctx, setSession, useProject, useSession } from '../store';
import { S } from '../strings';

export function TachiePage() {
  const n = useNotify();
  const tachie = useProject((s) => s.data.tachie);
  const group = useSession((s) => s.tachieGroup);
  const groups = [...new Set(tachie.map((t) => t.character).filter(Boolean))];
  const list = tachie.filter((t) => !group || t.character === group);
  const fromNames = (names: string[]) =>
    commit((d, c) => {
      for (const name of [...names].reverse()) {
        const m = d.materials.find((x) => x.name === name);
        if (m) addTachie(d, { character: m.label, expression: m.label, imageUrl: m.name }, c);
      }
    });
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid="tachie-page">
      <Card title={S.tachieTitle} sub={S.tachieLead}>
        <Row>
          <Button
            variant="primary"
            size="sm"
            onClick={() => commit((d, c) => void addTachie(d, {}, c))}
          >
            {S.tachieAdd}
          </Button>
          <Button size="sm" onClick={() => openMultiPick('tachie', n)}>
            {S.tachieFromMaterials}
          </Button>
        </Row>
        <DropCreate
          testId="drop-tachie"
          onMaterials={(names) => {
            fromNames(names);
            n(S.created(names.length), 'success');
          }}
          onFiles={async (files) => {
            const r = await importFiles(files);
            if (r.names.length) fromNames(r.names);
          }}
        />
      </Card>
      {tachie.length ? <BulkCard /> : null}
      {groups.length ? (
        <Row>
          <Button
            size="sm"
            variant={group ? 'ghost' : 'primary'}
            onClick={() => setSession({ tachieGroup: '' })}
          >
            {S.tachieAll}
          </Button>
          {groups.map((g) => (
            <Button
              key={g}
              size="sm"
              variant={group === g ? 'primary' : 'ghost'}
              onClick={() => setSession({ tachieGroup: g })}
            >
              {g}
            </Button>
          ))}
        </Row>
      ) : null}
      {!tachie.length ? <Hint>{S.tachieNone}</Hint> : null}
      <div className="grid min-w-0 grid-cols-1 gap-2 md:grid-cols-2 2xl:grid-cols-3">
        {list.map((t) => (
          <TachieCard key={t.id} tc={t} />
        ))}
      </div>
    </div>
  );
}

function BulkCard() {
  const n = useNotify();
  const [vals, setVals] = useState<Record<TachieBulkKey, string>>({ height: '', dy: '', z: '' });
  const apply = (k: TachieBulkKey) => {
    const raw = vals[k].trim();
    if (!raw) return n(S.tachieBulkEmpty, 'warning');
    const v = Number(raw);
    if (!Number.isFinite(v)) return n(S.tachieBulkNaN, 'warning');
    let count = 0;
    commit((d) => {
      count = applyTachieBulk(d, k, v);
    });
    n(S.tachieBulkDone(count), 'success');
  };
  return (
    <Card title={S.tachieBulk} sub={S.tachieBulkLead}>
      <Row>
        {(['height', 'dy', 'z'] as const).map((k) => (
          <div key={k} className="flex items-end gap-1">
            <Labeled label={S.tachieBulkFields[k]}>
              <TextInput
                type="number"
                aria-label={`${S.tachieBulk}：${S.tachieBulkFields[k]}`}
                value={vals[k]}
                onChange={(e) => setVals({ ...vals, [k]: e.target.value })}
                className="w-20"
              />
            </Labeled>
            <Button size="sm" onClick={() => apply(k)}>
              {S.tachieBulkApply}
            </Button>
          </div>
        ))}
      </Row>
    </Card>
  );
}

function TachieCard({ tc }: { tc: TachieEntry }) {
  const n = useNotify();
  const p = useProject((s) => s.data);
  const base = tachieBase(p, tc);
  const src = tachieSource(p, tc);
  const find = materialLookup(p.materials);
  const mat = find(tc.imageUrl);
  const { width, height } = tachieSize(p, tc, find);
  const z = src.z ?? defaultsOf(p, ctx(p)).z.tachie;
  const y = tachieY(p.room, height, Number(src.dy) || 0);
  const upd = (patch: Partial<TachieEntry>) =>
    commit((d) => {
      const t = d.tachie.find((x) => x.id === tc.id);
      if (t) Object.assign(t, patch);
    });
  const editable = !base || tc.solo;
  return (
    <article
      className={cn(
        'flex min-w-0 flex-col gap-2 rounded-md border border-border bg-surface p-2',
        base && 'border-dashed',
      )}
      data-tachie={tc.id}
      aria-label={tc.expression || tc.character}
    >
      {base ? (
        <span className="text-xs text-accent">
          {S.tachieFaceOf(base.expression || base.character)}
        </span>
      ) : null}
      <Row>
        <div className="flex min-w-0 flex-col gap-1">
          <ImageField
            aria-label={`${S.tachieImage}：${tc.expression}`}
            value={tc.imageUrl}
            onChange={(v) => upd({ imageUrl: v })}
            useFor="tachie"
          />
          {mat ? (
            <span className="truncate text-[11px] text-muted">
              {S.tachieOriginal(mat.originalName)}
            </span>
          ) : null}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <Labeled label={S.tachieCharacter}>
            <TextInput
              aria-label={S.tachieCharacter}
              value={tc.character}
              onChange={(e) => upd({ character: e.target.value })}
            />
          </Labeled>
          <Labeled label={S.tachieExpression}>
            <TextInput
              aria-label={S.tachieExpression}
              value={tc.expression}
              onChange={(e) => upd({ expression: e.target.value })}
            />
          </Labeled>
        </div>
      </Row>
      <Row>
        <IconButton
          size="sm"
          variant="ghost"
          label={S.tachieCopy}
          icon={<Copy />}
          onClick={() => commit((d, c) => void duplicateTachie(d, tc.id, c))}
        />
        <Button
          size="sm"
          variant="ghost"
          icon={<Smile />}
          onClick={() => {
            commit((d) => void createTachieFace(d, tc.id));
            n(S.tachieFaceMade, 'success');
          }}
        >
          {S.tachieMakeFace}
        </Button>
        <IconButton
          size="sm"
          variant="ghost"
          label={S.tachieDelete}
          icon={<Trash2 />}
          onClick={() => commit((d) => deleteTachie(d, tc.id))}
        />
      </Row>
      {base ? (
        <Checkbox
          checked={tc.solo}
          onCheckedChange={(v) => commit((d) => setTachieSolo(d, tc.id, !!v))}
          aria-label={S.tachieSolo}
          label={S.tachieSolo}
        />
      ) : null}
      {editable ? (
        <>
          <Labeled label={S.tachieHeight}>
            <Slider
              value={gridSize(tc.height, 18)}
              min={2}
              max={30}
              inputMax={999}
              onChange={(v) => upd({ height: gridSize(v, 18) })}
              aria-label={`${S.tachieHeight}：${tc.expression}`}
            />
          </Labeled>
          <Row>
            <Labeled label={S.tachieDy}>
              <NumCell
                aria-label={`${S.tachieDy}：${tc.expression}`}
                value={tc.dy}
                onCommit={(v) => upd({ dy: gridPos(v ?? 0) })}
              />
            </Labeled>
            <Labeled label={S.tachieZ}>
              <NumCell
                aria-label={`${S.tachieZ}：${tc.expression}`}
                value={tc.z}
                placeholder={String(z)}
                onCommit={(v) => upd({ z: v == null ? null : toNumber(v, 0) })}
              />
            </Labeled>
          </Row>
        </>
      ) : (
        <Hint>{S.tachieSoloOff(src.height, src.dy, z)}</Hint>
      )}
      <Hint className="tabular-nums" data-testid="tachie-readout">
        {S.tachieReadout(width, height, mat?.width ?? 0, mat?.height ?? 0, y)}
      </Hint>
    </article>
  );
}
