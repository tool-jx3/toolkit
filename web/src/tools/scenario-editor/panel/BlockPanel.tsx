/**
 * 設定欄的「段落」分頁：選取資訊（F081）、各書式的設定（1.6）、共通設定（1.5）、所在儲存格（F080）。
 */
import { Eye } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Button,
  Checkbox,
  Chips,
  ColorField,
  Field,
  FieldRow,
  NativeNumberInput,
  Section,
  Segmented,
  Select,
  TextArea,
  TextInput,
  Toggle,
} from '@/ui';
import { bridge } from '../bridge';
import { cellOwnerOf, findBlock, typeName } from '../model/blocks';
import { popupLabel } from '../model/doc';
import { FLOW_MAX_H, FLOW_MAX_W } from '../model/flow';
import {
  applyBxTpl,
  BOX_COLORS,
  BX_TPL,
  blockLabel,
  bxTplClean,
  ensureProc,
  LABEL_PICKS,
  procStyleOf,
  sameStyle,
} from '../model/proc';
import { slashCommandsFor } from '../model/rich';
import { tblCols, tblDelCol, tblDelRow, tblRows } from '../model/table';
import { setBlockText } from '../model/text';
import { ensureToc, TOC_PICKS, tocOf } from '../model/toc';
import type { Block, BoxStyle, BoxTemplate } from '../model/types';
import { deleteComments, indentSel, renamePopup, setGap, setSpan, toggleClear } from '../ops';
import { rememberTemplates } from '../session';
import { edit, editBlock, say, setUi, useDoc, useUi } from '../store';
import { S } from '../strings';
import {
  addCommentToSelection,
  addRuby,
  applyColor,
  applyRichMark,
  RICH_BUTTONS,
} from '../textOps';
import { ImageProps } from './ImageProps';
import { NpcProps } from './NpcProps';
import { TableProps } from './TableProps';

/** 文字顏色的色票（F074） */
export const TEXT_SWATCHES: readonly { name: string; c: string }[] = [
  { name: '朱', c: '#a8331f' },
  { name: '藍', c: '#1c3f6e' },
  { name: '深綠', c: '#2f5d40' },
  { name: '紫', c: '#5b3a7e' },
  { name: '金褐', c: '#8a6a1f' },
  { name: '灰', c: '#6d6353' },
];

export function PreviewButton({ id }: { id: string }) {
  return (
    <Button size="sm" variant="secondary" icon={<Eye />} onClick={() => setUi({ preview: id })}>
      查看成品
    </Button>
  );
}

export function BlockPanel() {
  const sel = useUi((s) => s.sel);
  const d = useDoc((s) => s.data);
  const found = sel.map((id) => findBlock(d, id)).filter((f) => !!f);
  if (!found.length) return <p className="m-0 p-2 text-sm text-muted">{S.hints.noSelection}</p>;
  const b = found[0].b;
  const single = found.length === 1;
  const owner = single ? cellOwnerOf(d, found[0].list) : null;
  return (
    <div className="flex flex-col gap-2" data-testid="se-block-panel">
      <p className="m-0 text-sm text-muted" aria-live="polite">
        {single
          ? `目前：${typeName(b.type)}／${b.cols === 1 ? '全寬' : '欄內'}`
          : `已選取 ${found.length} 段`}
      </p>
      {single ? <TypeProps b={b} /> : null}
      <CommonProps blocks={found.map((f) => f.b)} />
      {owner ? <CellSection tbl={owner.b} r={owner.r} c={owner.c} /> : null}
    </div>
  );
}

function TypeProps({ b }: { b: Block }) {
  switch (b.type) {
    case 'dialog':
      return <DialogProps b={b} />;
    case 'proc':
      return <ProcProps b={b} />;
    case 'popup':
      return <PopupProps b={b} />;
    case 'flow':
      return <FlowProps b={b} />;
    case 'toc':
      return <TocProps b={b} />;
    case 'image':
      return <ImageProps b={b} />;
    case 'table':
      return <TableProps b={b} />;
    case 'npc':
      return <NpcProps b={b} />;
    case 'title':
    case 'h1':
    case 'h2':
    case 'h3':
    case 'scene':
    case 'subtitle':
      return <HeadingTocProps b={b} />;
    default:
      return (
        <div>
          <PreviewButton id={b.id} />
        </div>
      );
  }
}

/* ---------- 對話文（F090） ---------- */

function DialogProps({ b }: { b: Block }) {
  return (
    <Section title="對話文" fixed>
      <Field label="說話者" hint="有填時紙面在對話上方以小字顯示。">
        <TextInput
          value={String(b.sp ?? '')}
          onChange={(e) => editBlock(b.id, (x) => (x.sp = e.target.value))}
        />
      </Field>
      <PreviewButton id={b.id} />
    </Section>
  );
}

/* ---------- 規則框（F091～F095） ---------- */

function ProcProps({ b }: { b: Block }) {
  const tpls = useDoc((s) => s.data.bxTpl);
  const st = procStyleOf(b);
  const setStyle = (p: Partial<BoxStyle>) =>
    editBlock(b.id, (x) => Object.assign(ensureProc(x), p));
  const heads = String(b.text ?? '')
    .split('\n')
    .filter((l) => /^\s*[■◆]/.test(l)).length;
  const apply = (key: string) => {
    edit((d) => {
      const x = findBlock(d, b.id)?.b;
      if (x) applyBxTpl(x, key, d.bxTpl);
    });
  };
  const saveTpl = async () => {
    const r = await bridge.prompt({
      title: '把目前的外觀存成樣板',
      label: '樣板的名稱（最多 24 字）',
      maxLength: 24,
      confirmLabel: '存成樣板',
    });
    const n = r?.value.trim().slice(0, 24);
    if (!n) return;
    const exist = tpls.find((t) => t.n === n);
    if (
      exist &&
      !(await bridge.confirm({ title: S.confirm.overwriteTpl(n), confirmLabel: '覆寫' }))
    )
      return;
    const t = bxTplClean({ ...st, id: exist?.id, n, lb: blockLabel(b) }) as BoxTemplate;
    let list: BoxTemplate[] = [];
    edit((d) => {
      const i = d.bxTpl.findIndex((x) => x.n === n);
      if (i >= 0) d.bxTpl[i] = t;
      else d.bxTpl.push(t);
      list = JSON.parse(JSON.stringify(d.bxTpl)) as BoxTemplate[];
    });
    rememberTemplates(list);
    say(S.status.tplSaved(n));
  };
  const overwrite = (t: BoxTemplate) => {
    let list: BoxTemplate[] = [];
    edit((d) => {
      const x = d.bxTpl.find((y) => y.id === t.id);
      if (x) Object.assign(x, st, { lb: blockLabel(b) });
      list = JSON.parse(JSON.stringify(d.bxTpl)) as BoxTemplate[];
    });
    rememberTemplates(list);
    say(S.status.tplSaved(t.n));
  };
  const rename = async (t: BoxTemplate) => {
    const r = await bridge.prompt({
      title: '樣板的名稱與標題語',
      label: '名稱（最多 24 字）',
      value: t.n,
      maxLength: 24,
      second: { label: '標題語', value: t.lb, maxLength: 24 },
      confirmLabel: '改名',
    });
    const n = r?.value.trim().slice(0, 24);
    if (!r || !n) return;
    let list: BoxTemplate[] = [];
    edit((d) => {
      const x = d.bxTpl.find((y) => y.id === t.id);
      if (x) {
        x.n = n;
        x.lb = r.second.slice(0, 24);
      }
      list = JSON.parse(JSON.stringify(d.bxTpl)) as BoxTemplate[];
    });
    rememberTemplates(list);
  };
  const remove = async (t: BoxTemplate) => {
    if (
      !(await bridge.confirm({
        title: S.confirm.deleteTpl(t.n),
        danger: true,
        confirmLabel: S.confirm.del,
      }))
    )
      return;
    let list: BoxTemplate[] = [];
    edit((d) => {
      d.bxTpl = d.bxTpl.filter((x) => x.id !== t.id);
      list = JSON.parse(JSON.stringify(d.bxTpl)) as BoxTemplate[];
    });
    rememberTemplates(list);
    say(S.status.tplRemoved(t.n));
  };
  const builtin: [string, string, BoxStyle][] = [
    ['skill', '技能檢定', BX_TPL.skill],
    ['rule', '特殊規則', BX_TPL.rule],
  ];
  return (
    <Section title="規則框" fixed>
      <Field label="樣板">
        <div className="flex flex-wrap gap-1">
          {builtin.map(([k, name, s]) => (
            <Button
              key={k}
              size="sm"
              variant={sameStyle(st, s) ? 'primary' : 'secondary'}
              aria-pressed={sameStyle(st, s)}
              onClick={() => apply(k)}
            >
              {name}
            </Button>
          ))}
        </div>
      </Field>
      {tpls.length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="自己的樣板">
          {tpls.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-1">
              <Button
                size="sm"
                variant={sameStyle(st, t) ? 'primary' : 'secondary'}
                aria-pressed={sameStyle(st, t)}
                onClick={() => apply(t.id)}
              >
                {t.n}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => overwrite(t)}>
                用目前的外觀覆寫
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void rename(t)}>
                改名
              </Button>
              <Button size="sm" variant="ghost" onClick={() => void remove(t)}>
                刪除
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button size="sm" variant="secondary" onClick={() => void saveTpl()}>
        把目前的外觀存成樣板
      </Button>
      <Field label="標題語" hint="框左上的小標；空白時不顯示。">
        <TextInput
          value={b.lb == null ? '技能檢定' : String(b.lb)}
          list="se-lb-picks"
          onChange={(e) => editBlock(b.id, (x) => (x.lb = e.target.value))}
        />
      </Field>
      <datalist id="se-lb-picks">
        {LABEL_PICKS.map((l) => (
          <option key={l} value={l} />
        ))}
      </datalist>
      <Chips
        size="sm"
        aria-label="標題語的候選"
        items={LABEL_PICKS}
        value={blockLabel(b)}
        onPick={(v) => editBlock(b.id, (x) => (x.lb = v))}
      />
      <Field label="框線">
        <Segmented
          size="sm"
          value={st.ln}
          onValueChange={(v) => setStyle({ ln: v })}
          options={[
            { value: 'solid', label: '實線' },
            { value: 'dash', label: '虛線' },
            { value: 'none', label: '無' },
          ]}
        />
      </Field>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Checkbox
          checked={st.bar}
          onCheckedChange={(v) => setStyle({ bar: !!v })}
          label="左側粗線"
        />
        <Checkbox checked={st.fill} onCheckedChange={(v) => setStyle({ fill: !!v })} label="底色" />
        <Checkbox checked={st.sm} onCheckedChange={(v) => setStyle({ sm: !!v })} label="字級稍小" />
      </div>
      <Field label="顏色">
        <div className="flex flex-wrap gap-1">
          {BOX_COLORS.map((c) => (
            <button
              key={c.k}
              type="button"
              aria-pressed={st.col === c.k}
              aria-label={`框的顏色：${c.name}`}
              title={c.name}
              onClick={() => setStyle({ col: c.k })}
              className="flex h-7 items-center gap-1 rounded-sm border border-border px-1.5 text-xs aria-pressed:border-accent aria-pressed:ring-2 aria-pressed:ring-accent"
            >
              <span className="inline-block size-3.5 rounded-full" style={{ background: c.c }} />
              {c.name}
            </button>
          ))}
        </div>
      </Field>
      <Field
        label="內容"
        hint={`行首「■」是小標、「>」是檢定框（第一行冒號前是框的小標）。目前小標 ${heads} 個。`}
      >
        <TextArea
          rows={5}
          value={String(b.text ?? '')}
          data-bid={b.id}
          onChange={(e) => editBlock(b.id, (x) => setTextKeep(x, e.target.value))}
        />
      </Field>
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="secondary"
          onClick={() => editBlock(b.id, (x) => setTextKeep(x, appendLine(x.text, '■小標')))}
        >
          ＋小標
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => editBlock(b.id, (x) => setTextKeep(x, appendLine(x.text, '> 技能檢定：')))}
        >
          ＋檢定框
        </Button>
        <PreviewButton id={b.id} />
      </div>
    </Section>
  );
}

function setTextKeep(b: Block, t: string): void {
  setBlockText(b, t);
}

function appendLine(text: unknown, line: string): string {
  const t = String(text ?? '').replace(/\n*$/, '');
  return t ? `${t}\n${line}` : line;
}

/* ---------- 彈出視窗（F110～F112、F120） ---------- */

function PopupProps({ b }: { b: Block }) {
  return (
    <Section title="彈出視窗" fixed>
      <Field label="名稱" hint="紙面按鈕上的字。改名時，指向舊名稱的「＠名稱」一起改。">
        <TextInput
          value={String(b.pop?.label ?? '')}
          onChange={(e) => renamePopup(b.id, e.target.value)}
        />
      </Field>
      <Field
        label="不放在紙面"
        layout="inline"
        hint="只從「＠名稱」指向；內容仍會放進附錄與匯出檔。"
      >
        <Toggle
          checked={!!b.pop?.only}
          onCheckedChange={(v) =>
            editBlock(b.id, (x) => {
              if (x.pop) x.pop.only = v;
            })
          }
        />
      </Field>
      <p className="m-0 text-xs text-muted">
        在描述文、注釋、規則框的行首寫「＠{popupLabel(b)}」就是開啟它的按鈕。
      </p>
      <div className="flex flex-wrap gap-1">
        <Button size="sm" onClick={() => setUi({ popEdit: b.id })}>
          開啟編輯
        </Button>
        <PreviewButton id={b.id} />
      </div>
    </Section>
  );
}

/* ---------- 流程圖（F130、F137） ---------- */

function FlowProps({ b }: { b: Block }) {
  const f = b.flow;
  const num = (v: string, min: number, max: number, fb: number) =>
    Math.max(min, Math.min(max, Math.round(+v || fb)));
  return (
    <Section title="流程圖" fixed>
      <Button size="sm" onClick={() => setUi({ flowEdit: b.id })}>
        開啟圖來繪製
      </Button>
      <FieldRow columns={2}>
        <Field label="寬">
          <NativeNumberInput
            value={String(f?.w ?? 105)}
            min={30}
            max={FLOW_MAX_W}
            unit="mm"
            onChange={(v) =>
              editBlock(b.id, (x) => {
                if (x.flow && v !== '') x.flow.w = num(v, 30, FLOW_MAX_W, 105);
              })
            }
          />
        </Field>
        <Field label="高">
          <NativeNumberInput
            value={String(f?.h ?? 170)}
            min={20}
            max={FLOW_MAX_H}
            unit="mm"
            onChange={(v) =>
              editBlock(b.id, (x) => {
                if (x.flow && v !== '') x.flow.h = num(v, 20, FLOW_MAX_H, 170);
              })
            }
          />
        </Field>
      </FieldRow>
      <p className="m-0 text-xs text-muted">
        方框 {f?.nodes.length ?? 0} 個、線 {f?.edges.length ?? 0} 條。
      </p>
      <PreviewButton id={b.id} />
    </Section>
  );
}

/* ---------- 目錄（F170） ---------- */

function TocProps({ b }: { b: Block }) {
  const d = useDoc((s) => s.data);
  const layout = useUi((s) => s.layout);
  const t = tocOf(b);
  const set = (fn: (x: ReturnType<typeof ensureToc>) => void) =>
    editBlock(b.id, (x) => fn(ensureToc(x)));
  const n = d.blocks.filter((x) => {
    const m = x.tocMode;
    if (m === 'off' || x.tocOff) return false;
    return (m === 'on' || t.pick.includes(x.type)) && String(x.tl || x.text || '').trim() !== '';
  }).length;
  void layout;
  return (
    <Section title="目錄" fixed>
      <Field label="標題語" hint="空白時不顯示。">
        <TextInput value={t.lb} onChange={(e) => set((x) => (x.lb = e.target.value))} />
      </Field>
      <Field label="收錄的書式" hint="至少留一個。">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {TOC_PICKS.map(([k]) => (
            <Checkbox
              key={k}
              label={typeName(k)}
              checked={t.pick.includes(k)}
              onCheckedChange={(v) =>
                set((x) => {
                  const on = new Set(x.pick);
                  if (v) on.add(k);
                  else if (on.size > 1) on.delete(k);
                  x.pick = TOC_PICKS.map((p) => p[0]).filter((p) => on.has(p));
                })
              }
            />
          ))}
        </div>
      </Field>
      <div className="flex flex-wrap gap-x-4">
        <Checkbox label="頁碼" checked={t.pn} onCheckedChange={(v) => set((x) => (x.pn = !!v))} />
        <Checkbox
          label="點線"
          checked={t.dots}
          onCheckedChange={(v) => set((x) => (x.dots = !!v))}
        />
      </div>
      <p className="m-0 text-xs text-muted">目前收錄 {n} 項。</p>
      <PreviewButton id={b.id} />
    </Section>
  );
}

/* ---------- 標題的目錄設定（F171） ---------- */

function HeadingTocProps({ b }: { b: Block }) {
  const mode = b.tocMode === 'on' || b.tocMode === 'off' ? b.tocMode : b.tocOff ? 'off' : 'auto';
  return (
    <Section title="目錄" fixed>
      <Field label="目錄中的寫法" hint="空白＝標題的第一行（去掉注音）。">
        <TextInput
          value={String(b.tl ?? '')}
          onChange={(e) => editBlock(b.id, (x) => (x.tl = e.target.value))}
        />
      </Field>
      <Field label="收錄方式">
        <Segmented
          size="sm"
          value={mode}
          onValueChange={(v) =>
            editBlock(b.id, (x) => {
              x.tocMode = v === 'auto' ? '' : v;
              delete x.tocOff;
            })
          }
          options={[
            { value: 'auto', label: '依目錄的設定' },
            { value: 'on', label: '一定收錄' },
            { value: 'off', label: '不收錄' },
          ]}
        />
      </Field>
      <Field label="目錄中的層級">
        <Select
          size="sm"
          value={String(b.tocLv || 0)}
          onValueChange={(v) => editBlock(b.id, (x) => (x.tocLv = Number(v)))}
          options={[
            { value: '0', label: '自動（依書式）' },
            { value: '1', label: '1' },
            { value: '2', label: '2' },
            { value: '3', label: '3' },
          ]}
        />
      </Field>
      <PreviewButton id={b.id} />
    </Section>
  );
}

/* ---------- 共通設定（F070～F078） ---------- */

function CommonProps({ blocks }: { blocks: Block[] }) {
  const b = blocks[0];
  const single = blocks.length === 1;
  const spanFixed = blocks.every((x) => x.type === 'npc' || x.type === 'flow');
  const allSpan = blocks.every((x) => x.cols === 1);
  const allFlow = blocks.every((x) => x.cols === 2);
  const rich = single && ['desc', 'note', 'proc', 'table'].includes(b.type);
  const gapVal = (k: 'mt' | 'mb') => {
    const vals = new Set(blocks.map((x) => (x[k] == null ? '' : String(x[k]))));
    return vals.size === 1 ? [...vals][0] : '';
  };
  return (
    <Section title="段落的設定" fixed>
      {rich ? (
        <Field label="巢狀書式" hint="文字欄有游標時套用在那裡，沒有時在最後加一行。">
          <div className="flex flex-wrap gap-1">
            {RICH_BUTTONS.map((r) => (
              <button
                key={r.label}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyRichMark(r.mark, r.label)}
                className="flex flex-col items-center rounded-sm border border-border bg-surface-2 px-1.5 py-0.5 text-xs hover:border-accent"
                title={`${r.label}（/${slashCommandsFor(r.mark).join('、/')}）`}
              >
                <span>{r.label}</span>
                <span className="text-[10px] text-muted">/{slashCommandsFor(r.mark)[0]}</span>
              </button>
            ))}
          </div>
        </Field>
      ) : null}
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="secondary"
          onMouseDown={(e) => e.preventDefault()}
          onClick={addRuby}
        >
          加注音
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => void addCommentToSelection()}
        >
          加上註解
        </Button>
        <Button size="sm" variant="secondary" onClick={deleteComments}>
          刪除註解
        </Button>
      </div>
      <p className="m-0 text-xs text-muted">注音的寫法：｜本文字《注音》。</p>
      <Field
        label="雙欄時的配置"
        hint={spanFixed ? 'NPC 卡與流程圖只能全寬。' : '單欄的頁上兩者外觀相同。'}
      >
        <Segmented
          size="sm"
          value={allSpan ? 'span' : allFlow ? 'flow' : ''}
          onValueChange={(v) => setSpan(v === 'span')}
          onReselect={(v) => setSpan(v === 'span')}
          options={[
            { value: 'span', label: '全寬' },
            { value: 'flow', label: '欄內' },
          ]}
        />
      </Field>
      <Field label="文字顏色" hint="文字欄裡有選取文字時只改那一段。">
        <div className="flex flex-wrap items-center gap-1">
          {TEXT_SWATCHES.map((c) => (
            <button
              key={c.c}
              type="button"
              aria-label={c.name}
              title={c.name}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applyColor(c.c)}
              className="size-7 rounded-full border border-border"
              style={{ background: c.c }}
            />
          ))}
          <CustomColor value={single ? String(b.col || '#23201c') : '#23201c'} />
          <Button
            size="sm"
            variant="ghost"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyColor('')}
          >
            恢復預設
          </Button>
        </div>
      </Field>
      <Field label="縮排" hint={`目前第 ${b.ind ?? 0} 層（每層 4 mm，最多 4 層）。`}>
        <div className="flex gap-1">
          <Button size="sm" variant="secondary" onClick={() => indentSel(-1)}>
            ← 退回
          </Button>
          <Button size="sm" variant="secondary" onClick={() => indentSel(1)}>
            → 縮排
          </Button>
        </div>
      </Field>
      <Field label="解除文繞圖" layout="inline" hint="從圖片下方開始。">
        <Toggle
          checked={blocks.some((x) => x.type !== 'image' && x.clr)}
          onCheckedChange={() => toggleClear()}
        />
      </Field>
      <FieldRow columns={2}>
        <Field label="上方間距">
          <NativeNumberInput
            value={gapVal('mt')}
            min={0}
            max={100}
            step={0.5}
            unit="mm"
            placeholder="預設"
            onChange={(v) => setGap('mt', v === '' ? null : Math.max(0, +v))}
          />
        </Field>
        <Field label="下方間距">
          <NativeNumberInput
            value={gapVal('mb')}
            min={0}
            max={100}
            step={0.5}
            unit="mm"
            placeholder="預設"
            onChange={(v) => setGap('mb', v === '' ? null : Math.max(0, +v))}
          />
        </Field>
      </FieldRow>
      <p className="m-0 text-xs text-muted">只套用在這個段落的間距；留空＝依書式的預設。</p>
    </Section>
  );
}

function CustomColor({ value }: { value: string }) {
  return (
    <ColorField
      value={/^#[0-9a-f]{6}$/i.test(value) ? value : '#23201c'}
      onChange={(hex) => applyColor(hex)}
      showInput={false}
      aria-label="自訂顏色"
    />
  );
}

/* ---------- 所在儲存格（F080） ---------- */

function CellSection({ tbl, r, c }: { tbl: Block; r: number; c: number }) {
  const t = tbl.tbl;
  if (!t) return null;
  const delRow = () => {
    if (tblRows(t) <= 1) {
      say('只剩一列，不能再刪。', 'warn');
      return;
    }
    editBlock(tbl.id, (x) => {
      if (x.tbl) tblDelRow(x.tbl, r);
    });
  };
  const delCol = () => {
    if (tblCols(t) <= 1) {
      say('只剩一欄，不能再刪。', 'warn');
      return;
    }
    editBlock(tbl.id, (x) => {
      if (x.tbl) tblDelCol(x.tbl, c);
    });
  };
  return (
    <Section title="所在的儲存格" fixed>
      <p className="m-0 text-sm">
        表格「{String(t.name ?? '').trim() || '（沒有名稱）'}」第 {r + 1} 列第 {c + 1} 欄
      </p>
      <div className="flex gap-1">
        <Button size="sm" variant="secondary" onClick={delRow}>
          刪除這一列
        </Button>
        <Button size="sm" variant="secondary" onClick={delCol}>
          刪除這一欄
        </Button>
      </div>
    </Section>
  );
}

export function PanelNote({ children }: { children: ReactNode }) {
  return <p className="m-0 text-xs text-muted">{children}</p>;
}
