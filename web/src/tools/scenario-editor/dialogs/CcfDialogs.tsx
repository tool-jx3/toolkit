/**
 * CCFOLIA 棋子的複製（F167，無法寫進剪貼簿時的手動複製視窗）、讀入（F168）、Yutosheet 的表格讀入（F169）。
 */
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { copyText } from '@/core/files';
import { Button, Dialog, DialogClose, Field, Notice, Segmented, TextArea } from '@/ui';
import { findBlock } from '../model/blocks';
import {
  type CcfReport,
  ccfApply,
  ccfoliaText,
  ccfParse,
  SYS_SHORT,
  ytApply,
  ytGuess,
  ytParse,
} from '../model/npc/ccfolia';
import { ensureNpc } from '../model/npc/model';
import { doc, editBlock, say } from '../store';
import { S } from '../strings';

interface CcfUi {
  manual: string | null;
  importId: string | null;
  ytId: string | null;
}

export const useCcfUi = create<CcfUi>(() => ({ manual: null, importId: null, ytId: null }));

/** 複製 CCFOLIA 棋子（F167） */
export async function copyCcfolia(id: string): Promise<void> {
  const b = findBlock(doc(), id)?.b;
  if (!b?.npc) return;
  const text = ccfoliaText(b.npc);
  const ok = await copyText(text);
  if (ok) say(S.status.ccfCopied);
  else {
    useCcfUi.setState({ manual: text });
    say('無法自動複製，請手動複製。', 'warn');
  }
}

/** 讀入的報告（F168） */
export function ccfReportText(r: CcfReport): string {
  const parts = [`已作為 ${r.sys ? SYS_SHORT[r.sys] : ''} 讀入`];
  if (r.skills) parts.push(`技能 ${r.skills} 筆`);
  if (r.effects) parts.push(`效果 ${r.effects} 筆`);
  if (r.combos) parts.push(`組合技 ${r.combos} 筆`);
  if (r.over) parts.push(`超出 12 列而放不下的技能 ${r.over} 筆`);
  if (r.unread) parts.push(`無法讀取的行 ${r.unread} 筆`);
  return parts.join('／');
}

export function CcfDialogs() {
  return (
    <>
      <ManualCopy />
      <CcfImport />
      <YutoImport />
    </>
  );
}

function ManualCopy() {
  const text = useCcfUi((s) => s.manual);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (text != null) requestAnimationFrame(() => ref.current?.select());
  }, [text]);
  return (
    <Dialog
      open={text != null}
      onOpenChange={(o) => !o && useCcfUi.setState({ manual: null })}
      title="CCFOLIA 棋子"
      description="無法自動複製。請全選下面的內容複製，再到 CCFOLIA 的房間裡貼上。"
      footer={<DialogClose />}
      initialFocus={ref}
    >
      <TextArea
        ref={ref}
        readOnly
        rows={12}
        value={text ?? ''}
        aria-label="棋子的 JSON"
        className="font-mono text-xs"
      />
    </Dialog>
  );
}

function CcfImport() {
  const id = useCcfUi((s) => s.importId);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (id) {
      setText('');
      setNote('');
    }
  }, [id]);
  const close = () => useCcfUi.setState({ importId: null });
  const go = () => {
    if (!id) return;
    const d = ccfParse(text);
    if (!d) {
      setNote('無法當成 CCFOLIA 棋子讀取。請把含有 { } 的文字全部貼上。');
      return;
    }
    let rep: CcfReport | null = null;
    editBlock(id, (b) => {
      const np = ensureNpc(b.npc);
      b.npc = np;
      rep = ccfApply(np, d);
    });
    const r = rep as CcfReport | null;
    if (!r?.sys) {
      setNote('無法判斷是哪個系統的棋子。請確認裡面是否有能力值的參數。');
      return;
    }
    close();
    say(ccfReportText(r), r.unread || r.over ? 'warn' : 'ok');
  };
  return (
    <Dialog
      open={!!id}
      onOpenChange={(o) => !o && close()}
      title="讀入 CCFOLIA 的棋子"
      description="把在 CCFOLIA 對棋子按右鍵→複製得到的文字（或角色卡工具輸出的文字）直接貼上。"
      footer={
        <>
          <DialogClose>取消</DialogClose>
          <Button onClick={go}>讀入</Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <TextArea
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="棋子的 JSON"
          className="font-mono text-xs"
        />
        {note ? <Notice tone="danger">{note}</Notice> : null}
      </div>
    </Dialog>
  );
}

function YutoImport() {
  const id = useCcfUi((s) => s.ytId);
  const [text, setText] = useState('');
  const [mode, setMode] = useState<'auto' | 'effect' | 'combo'>('auto');
  const [note, setNote] = useState('');
  useEffect(() => {
    if (id) {
      setText('');
      setNote('');
      setMode('auto');
    }
  }, [id]);
  const close = () => useCcfUi.setState({ ytId: null });
  const go = () => {
    if (!id) return;
    const rows = ytParse(text);
    if (!rows.length) {
      setNote('找不到表格的列。請貼上項目以「 / 」分隔的列。');
      return;
    }
    const m = mode === 'auto' ? (ytGuess(rows) ?? 'effect') : mode;
    let n = 0;
    editBlock(id, (b) => {
      const np = ensureNpc(b.npc);
      b.npc = np;
      n = ytApply(np, rows, m);
    });
    if (!n) {
      setNote('沒有可以讀取的列。');
      return;
    }
    close();
    say(m === 'combo' ? `已讀入 ${n} 筆組合技表` : `已讀入 ${n} 筆效果表`);
  };
  return (
    <Dialog
      open={!!id}
      onOpenChange={(o) => !o && close()}
      title="讀入 Yutosheet 的表格"
      description="在 Yutosheet 選取效果表或組合技表並複製，直接貼上（標題列要不要一起貼都可以）。讀入的表會取代目前的表。"
      footer={
        <>
          <DialogClose>取消</DialogClose>
          <Button onClick={go}>讀入</Button>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        <Field label="表格的種類">
          <Segmented
            size="sm"
            value={mode}
            onValueChange={setMode}
            options={[
              { value: 'auto', label: '自動判斷' },
              { value: 'effect', label: '效果表' },
              { value: 'combo', label: '組合技表' },
            ]}
          />
        </Field>
        <TextArea
          rows={10}
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="貼上的表格"
          placeholder="|集中 / … / 白兵 / (5+3)dx+(5-2)@8 / 22 / 單體 / 10m / 8 / 未滿 100% / "
          className="font-mono text-xs"
        />
        {note ? <Notice tone="danger">{note}</Notice> : null}
      </div>
    </Dialog>
  );
}
