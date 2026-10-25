/**
 * 設定欄的「段落」分頁：選取資訊（F081）、各書式的設定（1.6）、共通設定（1.5）、所在儲存格（F080）。
 */
import { Eye } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
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
  TextInput,
  Toggle,
} from '@/ui';
import { bridge } from '../bridge';
import {
  allBlocks,
  cellOwnerOf,
  findBlock,
  kidsOwnerOf,
  space,
  spKey,
  typeName,
} from '../model/blocks';
import { popupLabel } from '../model/doc';
import { FLOW_MAX_H, FLOW_MAX_W } from '../model/flow';
import { PT_BUTTONS, PT_MAX, PT_MIN, ptRound } from '../model/fontSize';
import {
  applyBxTpl,
  BOX_COLORS,
  BX_TPL,
  BX_TPL_BUTTONS,
  blockLabel,
  bxTplClean,
  ensureProc,
  LABEL_INFO,
  LABEL_PICKS,
  procName,
  procStyleOf,
  sameStyle,
} from '../model/proc';
import { slashCommandsFor } from '../model/rich';
import { headingChoices, headNames, sceneTargetOf, sceneWanted } from '../model/scene';
import { tblCols, tblDelCol, tblDelRow, tblRows } from '../model/table';
import { rubyPlain } from '../model/text';
import { ensureToc, TOC_PICKS, tocEntriesFor, tocOf } from '../model/toc';
import type { Block, BoxStyle, BoxTemplate } from '../model/types';
import { ensureHo, hoNote, hoOf, isVarName } from '../model/vars';
import { deleteComments, indentSel, renamePopup, setGap, setSpan, toggleClear } from '../ops';
import { rememberTemplates } from '../session';
import {
  doc,
  edit,
  editBlock,
  holdStatus,
  releaseStatus,
  say,
  setUi,
  useDoc,
  useUi,
} from '../store';
import { S } from '../strings';
import {
  addCommentToSelection,
  addRuby,
  applyColor,
  applyPt,
  applyRichMark,
  currentPt,
  RICH_BUTTONS,
} from '../textOps';
import { ImageProps } from './ImageProps';
import { NpcProps } from './NpcProps';
import { PageImgPanel } from './PageImgProps';
import { PanelHead } from './PanelHead';
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
  const pimgSel = useUi((s) => s.pimgSel);
  const d = useDoc((s) => s.data);
  const found = sel.map((id) => findBlock(d, id)).filter((f) => !!f);
  /* 頁面圖片（2026-10）：選取時設定欄顯示它的設定 */
  if (!found.length && pimgSel && (d.pageImgs ?? []).some((x) => x.id === pimgSel))
    return <PageImgPanel />;
  if (!found.length) return <p className="m-0 p-2 text-sm text-muted">{S.hints.noSelection}</p>;
  const b = found[0].b;
  const single = found.length === 1;
  const owner = single ? cellOwnerOf(d, found[0].list) : null;
  return (
    <div className="flex flex-col gap-2" data-testid="se-block-panel">
      <PanelHead>
        {single
          ? `目前：${b.type === 'proc' ? procName(b) : typeName(b.type)}／${b.cols === 1 ? '全寬' : '欄內'}${kidsOwnerOf(d, found[0].list) ? '（段落裡）' : ''}`
          : `已選取 ${found.length} 段`}
      </PanelHead>
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
    case 'info':
      return <InfoProps b={b} />;
    case 'note':
      return <NoteProps b={b} />;
    case 'handout':
      return <HandoutProps key={b.id} b={b} />;
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
    case 'scene':
      return (
        <>
          <SceneProps b={b} />
          <HeadingTocProps b={b} />
        </>
      );
    case 'title':
    case 'h1':
    case 'h2':
    case 'h3':
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

/* ---------- 特殊區塊（F091～F095、F303～F306） ---------- */

type BarKind = 'none' | 'thin' | 'mid' | 'thick';
const barOf = (x: Required<BoxStyle>): BarKind =>
  x.bar ? (x.thin ? 'thin' : x.mid ? 'mid' : 'thick') : 'none';
const BAR_STYLE: Record<BarKind, Pick<BoxStyle, 'bar' | 'thin' | 'mid'>> = {
  none: { bar: false, thin: false, mid: false },
  thin: { bar: true, thin: true, mid: false },
  mid: { bar: true, thin: false, mid: true },
  thick: { bar: true, thin: false, mid: false },
};

function ProcProps({ b }: { b: Block }) {
  const tpls = useDoc((s) => s.data.bxTpl);
  const st = procStyleOf(b);
  const setStyle = (p: Partial<BoxStyle>) =>
    editBlock(b.id, (x) => Object.assign(ensureProc(x), p));
  const kids = b.kids?.length ?? 0;
  const apply = (key: string) => {
    edit((d) => {
      const x = findBlock(d, b.id)?.b;
      if (x) applyBxTpl(x, key, d.bxTpl);
    });
  };
  const saveTpl = async () => {
    const r = await bridge.prompt({
      title: '把目前的外觀存成範本',
      label: '範本的名稱（最多 24 字）',
      maxLength: 24,
      confirmLabel: '存成範本',
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
      title: '範本的名稱與標題語',
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
  return (
    <Section title="特殊區塊" fixed>
      <Field label="範本" hint="按下就換成那個外觀與標題語；下面可以再細調。">
        <div className="flex flex-wrap gap-1">
          {BX_TPL_BUTTONS.map(({ k, name }) => (
            <Button
              key={k}
              size="sm"
              variant={sameStyle(st, BX_TPL[k]) ? 'primary' : 'secondary'}
              aria-pressed={sameStyle(st, BX_TPL[k])}
              onClick={() => apply(k)}
            >
              {name}
            </Button>
          ))}
        </div>
      </Field>
      {tpls.length ? (
        <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label="自己的範本">
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
        把目前的外觀存成範本
      </Button>
      <Field
        label="標題語"
        hint="框左上的小標；空白時不顯示。對話的樣子時是說話者。左邊文字欄的文字上方也可以改。"
      >
        <TextInput
          value={blockLabel(b)}
          list="se-lb-picks"
          placeholder="標題語（對話的樣子時是說話者）"
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
      <Field label="左側的線">
        <Segmented
          size="sm"
          value={barOf(st)}
          onValueChange={(v) => setStyle(BAR_STYLE[v])}
          options={[
            { value: 'none', label: '無' },
            { value: 'thin', label: '細' },
            { value: 'mid', label: '中' },
            { value: 'thick', label: '粗' },
          ]}
        />
      </Field>
      <Field label="字的大小">
        <Segmented
          size="sm"
          value={st.xs ? 'xs' : st.sm ? 'sm' : 'n'}
          onValueChange={(v) => setStyle({ sm: v === 'sm', xs: v === 'xs' })}
          options={[
            { value: 'n', label: '一般' },
            { value: 'sm', label: '小一點' },
            { value: 'xs', label: '更小' },
          ]}
        />
      </Field>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        <Checkbox checked={st.fill} onCheckedChange={(v) => setStyle({ fill: !!v })} label="底色" />
        <Checkbox
          checked={st.ink}
          onCheckedChange={(v) => setStyle({ ink: !!v })}
          label="文字也用框的顏色"
        />
      </div>
      <Field
        label="按一下複製"
        layout="inline"
        hint="匯出的 HTML 裡按這個框，複製內文（含裡面的段落）。跑團時貼到聊天室用。"
      >
        <Toggle checked={st.copy} onCheckedChange={(v) => setStyle({ copy: !!v })} />
      </Field>
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
      <PanelNote>
        {`裡面的段落：在左邊文字欄這個特殊區塊的文字最後按 Enter（或在下一段按 Tab）。「■成功」開頭的是左邊有線的一塊；在裡面選「特殊區塊」是巢狀的檢定。${kids ? `目前裡面有 ${kids} 個段落。` : ''}`}
      </PanelNote>
      <div>
        <PreviewButton id={b.id} />
      </div>
    </Section>
  );
}

/* ---------- 注釋的標題語（第三批驗證後 U7；同原作的注釋範本） ---------- */

function NoteProps({ b }: { b: Block }) {
  return (
    <Section title={S.note.title} fixed>
      <Field label={S.note.label} hint={S.note.labelHint}>
        <TextInput
          value={blockLabel(b)}
          placeholder="（沒有標題語）"
          onChange={(e) => editBlock(b.id, (x) => (x.lb = e.target.value))}
        />
      </Field>
    </Section>
  );
}

/* ---------- 情報區塊（F251） ---------- */

function InfoProps({ b }: { b: Block }) {
  return (
    <Section title={S.info.title} fixed>
      <Field label={S.info.label} hint={S.info.labelHint}>
        <TextInput
          value={b.lb == null ? LABEL_INFO : String(b.lb)}
          onChange={(e) => editBlock(b.id, (x) => (x.lb = e.target.value))}
        />
      </Field>
      <PanelNote>{S.info.copyHint}</PanelNote>
      <div>
        <PreviewButton id={b.id} />
      </div>
    </Section>
  );
}

/* ---------- 手冊（F253） ---------- */

function HandoutProps({ b }: { b: Block }) {
  const h = hoOf(b);
  /* 打字中的編號（不符合規則、重複時不寫進原稿；離開欄位時回到原稿的編號） */
  const [draft, setDraft] = useState<string | null>(null);
  const [err, setErr] = useState('');
  /* 欄位還錯著時，錯誤訊息不被自動儲存的訊息蓋掉（7.3） */
  const holdKey = `ho-no:${b.id}`;
  useEffect(() => () => releaseStatus(holdKey), [holdKey]);
  const onNo = (v: string) => {
    setDraft(v);
    const nv = v.trim();
    let why = '';
    if (!isVarName(nv)) why = S.vars.badName;
    else if (
      allBlocks(doc()).some((x) => x.id !== b.id && x.type === 'handout' && hoOf(x).no === nv)
    )
      why = S.handout.noDup;
    setErr(why);
    if (why) {
      holdStatus(holdKey, why);
      return;
    }
    releaseStatus(holdKey);
    if (nv !== h.no)
      editBlock(b.id, (x) => {
        ensureHo(x).no = nv;
      });
  };
  return (
    <Section title={S.handout.title} fixed>
      <Field label={S.handout.no} hint={S.handout.noHint(h.no)} error={err || undefined}>
        <TextInput
          value={draft ?? h.no}
          invalid={!!err}
          data-testid="se-ho-no"
          onChange={(e) => onNo(e.target.value)}
          onBlur={() => {
            setDraft(null);
            setErr('');
            releaseStatus(holdKey);
          }}
        />
      </Field>
      <Field label={S.handout.ttl}>
        <TextInput
          value={h.ttl}
          placeholder={S.handout.ttlPlaceholder}
          onChange={(e) =>
            editBlock(b.id, (x) => {
              ensureHo(x).ttl = e.target.value;
            })
          }
        />
      </Field>
      <FieldRow columns={2}>
        <Field label={`${S.handout.varLabel(h.no)}　${S.vars.def}`}>
          <TextInput
            value={String(h.def ?? '')}
            placeholder={h.no}
            data-testid="se-ho-def"
            onChange={(e) =>
              editBlock(b.id, (x) => {
                ensureHo(x).def = e.target.value;
              })
            }
          />
        </Field>
        <Field label={S.vars.note}>
          <TextInput
            value={String(h.note ?? '')}
            placeholder={hoNote(h.ttl)}
            data-testid="se-ho-note"
            onChange={(e) =>
              editBlock(b.id, (x) => {
                ensureHo(x).note = e.target.value;
              })
            }
          />
        </Field>
      </FieldRow>
      <PanelNote>{S.handout.varHint(h.no)}</PanelNote>
      <PanelNote>{S.handout.copyHint}</PanelNote>
      <div>
        <PreviewButton id={b.id} />
      </div>
    </Section>
  );
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
        在描述文、對話文、注釋、特殊區塊、情報區塊、手冊的行首寫「＠{popupLabel(b)}
        」就是開啟它的按鈕。
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
  const top = d.blocks.some((x) => x.id === b.id);
  const n = tocEntriesFor(b, d.blocks, (id) =>
    layout.pageOf[id] != null ? layout.pageOf[id] + 1 : null,
  ).length;
  return (
    <Section title="目錄" fixed>
      {top ? (
        <Field
          label="收錄的範圍"
          hint={
            t.scope === 'chapter'
              ? '收錄上一個標題 1 到下一個標題 1 之前的標題（每一章自己的目錄）。'
              : '收錄整份劇本的標題。'
          }
        >
          <Segmented
            size="sm"
            aria-label="收錄的範圍"
            value={t.scope === 'chapter' ? 'chapter' : 'all'}
            onValueChange={(v) =>
              set((x) => {
                if (v === 'chapter') x.scope = 'chapter';
                else delete x.scope;
              })
            }
            options={[
              { value: 'all', label: '整份' },
              { value: 'chapter', label: '這一章' },
            ]}
          />
        </Field>
      ) : null}
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

/* ---------- 場景轉換連到的標題（F270、F271；2026-10，上游 v3.15.0、v3.24.0） ---------- */

function SceneProps({ b }: { b: Block }) {
  const d = useDoc((s) => s.data);
  const pageOf = useUi((s) => s.layout.pageOf);
  const h = sceneTargetOf(d, b);
  const want = sceneWanted(b);
  /* 已經有這個名稱的段落（例如彈出視窗裡的標題、主標題）時不叫人「建立」（7.5 的 S1） */
  const named =
    !h &&
    allBlocks(d).some((x) => x.type !== 'scene' && headNames(x.text).some((n) => want.includes(n)));
  const pg = h && pageOf[h.id] != null ? pageOf[h.id] + 1 : null;
  const listId = `se-jump-${b.id}`;
  return (
    <Section title="場景轉換" fixed>
      <Field
        label="跳到的標題"
        hint="寫標題 1～3 的名稱，匯出的 HTML、列印與 PDF 裡就會連到那個標題（可以從候選選）。空白時，本文的目的地名稱（「前往書房」「→ 移動到書房」「場景 3『書房』」等）和標題完全相同才連過去。"
      >
        <TextInput
          value={String(b.jump ?? '')}
          list={listId}
          placeholder="空白＝依本文的目的地名稱找"
          onChange={(e) => editBlock(b.id, (x) => (x.jump = e.target.value))}
        />
      </Field>
      <datalist id={listId}>
        {headingChoices(d).map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>
      <p className="m-0 text-xs" data-testid="se-scene-target">
        {h ? (
          <span className="text-fg">
            →「{rubyPlain(String(h.text ?? '')).trim()}」{pg ? `（P.${pg}）` : ''}
          </span>
        ) : (
          <span className="text-muted">
            {named
              ? '找不到要連的標題（只連到本文的標題 1～3）。'
              : `找不到要連的標題${want.length ? `（建立名為「${want[0]}」的標題 1～3 就能連過去）` : ''}。`}
          </span>
        )}
      </p>
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
  const rich =
    single && ['desc', 'dialog', 'note', 'proc', 'info', 'handout', 'table'].includes(b.type);
  const gapVal = (k: 'mt' | 'mb') => {
    const vals = new Set(blocks.map((x) => (x[k] == null ? '' : String(x[k]))));
    return vals.size === 1 ? [...vals][0] : '';
  };
  /* 沒有指定時淡淡顯示書式的預設（第一個段落的；上游 v3.24.0） */
  const sp0 = space(spKey(b) ?? b.type);
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
      <TextSize />
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
            placeholder={`預設 ${sp0.t}`}
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
            placeholder={`預設 ${sp0.b}`}
            onChange={(v) => setGap('mb', v === '' ? null : Math.max(0, +v))}
          />
        </Field>
      </FieldRow>
      <p className="m-0 text-xs text-muted">
        只套用在這個段落的間距；留空＝依書式的預設（淡淡顯示的值）。和前後的段落之間是較大的那個。
      </p>
    </Section>
  );
}

/** 文字欄裡的選取範圍變了就重畫（文字大小的「目前大小」跟著選取的文字） */
function useSelectionTick(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let raf = 0;
    const on = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        setN((x) => x + 1);
      });
    };
    document.addEventListener('selectionchange', on);
    return () => {
      document.removeEventListener('selectionchange', on);
      cancelAnimationFrame(raf);
    };
  }, []);
  return n;
}

/** 文字大小（F273～F275；2026-10，上游 v3.21.0、v3.24.0） */
function TextSize() {
  useSelectionTick();
  useDoc((s) => s.data);
  useUi((s) => s.sel);
  const { value, mixed } = currentPt();
  return (
    <Field
      label="文字大小"
      hint="文字欄裡有選取文字時只改那一段，沒有時改選取的段落（5～72 pt）。大小直接記 pt，改內文字級時不會跟著變。"
    >
      <div className="flex flex-col gap-1.5">
        {/* biome-ignore lint/a11y/useSemanticElements: 一組切換按鈕 */}
        <div role="group" aria-label="文字大小" className="grid grid-cols-7 gap-1">
          {PT_BUTTONS.map((v) => {
            const on = value != null && Math.abs(value - v) < 0.01;
            return (
              <button
                key={v}
                type="button"
                aria-pressed={on}
                aria-label={`${v} pt`}
                title={`改成 ${v} pt`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => applyPt(v)}
                className={`flex min-h-9 flex-col items-center justify-end rounded-sm border px-0 pt-0.5 leading-none ${
                  on
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-border bg-surface-2 text-fg hover:border-accent'
                }`}
              >
                <b aria-hidden style={{ fontSize: `${Math.min(19, 7 + v * 0.38).toFixed(1)}px` }}>
                  A
                </b>
                <small aria-hidden className="text-[10px] text-muted">
                  {v}
                </small>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-1">
          <PtInput value={value} mixed={mixed} />
          <span className="text-xs text-muted">pt</span>
          <Button
            size="sm"
            variant="ghost"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => applyPt(null)}
            title="選取段落時，段落裡文字另外設的大小也一起恢復"
          >
            恢復預設
          </Button>
        </div>
      </div>
    </Field>
  );
}

/** 文字大小的數字欄：Enter、離開欄位、微調鈕時套用（打字中不套用） */
function PtInput({ value, mixed }: { value: number | null; mixed: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const commit = (raw: string) => {
    setDraft(null);
    const v = Number.parseFloat(raw.normalize('NFKC'));
    if (Number.isFinite(v) && v > 0) applyPt(ptRound(v));
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    /* 原生的 change：微調鈕、離開欄位（打字中不觸發） */
    const on = () => commitRef.current(el.value);
    el.addEventListener('change', on);
    return () => el.removeEventListener('change', on);
  }, []);
  return (
    <TextInput
      ref={ref}
      type="number"
      min={PT_MIN}
      max={PT_MAX}
      step={0.5}
      aria-label="文字大小（pt）"
      className="w-20"
      placeholder={mixed ? '—' : ''}
      title={
        mixed ? '選取的範圍裡大小不只一種：按按鈕或輸入大小就會統一' : `${PT_MIN}～${PT_MAX} pt`
      }
      value={draft ?? (value == null ? '' : String(value))}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
          e.preventDefault();
          commit(e.currentTarget.value);
        } else if (e.key === 'Escape') {
          setDraft(null);
        }
      }}
    />
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
