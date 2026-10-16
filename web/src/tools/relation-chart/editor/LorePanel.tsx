/*
 * 改編自 Relationship Chart Maker（© PaiTei4234，CC BY-NC-SA 4.0），見工具目錄 relation-chart/ 的 UPSTREAM_LICENSE。
 *
 * 世界觀與備忘錄（F191；原作的 buildLoreContent、buildRichEditor、備忘錄面板）：右側的編輯面板（原作是浮動面板，D2）。
 * 世界觀：「內容來源」（本分頁＋有自己的內容、自己沒在沿用的其他分頁）；沿用中＝唯讀顯示來源的內容；來源分頁被刪＝說明並顯示自己的；
 * 編輯器＝第三批做好的富文本編輯器（一段編輯一步復原）。
 * 備忘錄：純文字（最多 2 萬字），打字即寫入、停手 0.6 秒或離開才記一步；不進任何匯出。
 */
import { useEffect, useRef, useState } from 'react';
import { Field, Notice, Select, TextArea } from '@/ui';
import { sheetName } from '../engine/geom';
import { MEMO_MAX } from '../model/notes';
import { loreOf, loreSources, setLore, setLoreFrom, setMemo } from '../state/loreActions';
import { holdHistory, releaseHistory, useProject } from '../state/store';
import { S } from '../strings';
import { useSheet } from './hooks';
import { RichDocStyle, RichEditor, RichView } from './RichEditor';

export function LorePanel() {
  const sheet = useSheet();
  const sheets = useProject((s) => s.data.sheets);
  const L = loreOf(sheets, sheet);
  const sources = loreSources(sheets, sheet);
  /* 目前沿用的來源不在候選裡（例如它的內容清空了）也要列得出來 */
  if (L.from && !sources.some((s) => s.id === L.from?.id)) sources.unshift(L.from);
  return (
    <div className="flex flex-col gap-2" data-testid="lore-panel">
      <RichDocStyle />
      <Field label={S.lore.src}>
        <Select
          size="sm"
          value={L.from ? String(L.from.id) : 'self'}
          onValueChange={(v) => setLoreFrom(v === 'self' ? null : Number(v))}
          options={[
            { value: 'self', label: S.lore.self },
            ...sources.map((s) => ({ value: String(s.id), label: sheetName(s) })),
          ]}
          data-testid="lore-src"
        />
      </Field>
      {L.gone ? <Notice tone="warning">{S.lore.gone}</Notice> : null}
      {L.from ? (
        <>
          <p className="text-xs text-muted">{S.lore.reuseNote}</p>
          <RichView html={L.html} data-testid="lore-view" />
        </>
      ) : (
        <RichEditor
          key={sheet.id}
          value={sheet.lore}
          onChange={setLore}
          placeholder={S.lore.placeholder}
          aria-label={S.lore.title}
          data-testid="lore-editor"
        />
      )}
    </div>
  );
}

const MEMO_IDLE_MS = 600;

export function MemoPanel() {
  const sheet = useSheet();
  const [draft, setDraft] = useState(sheet.memo);
  const editing = useRef(false);
  const holding = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!editing.current) setDraft(sheet.memo);
  }, [sheet.memo]);
  const release = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (holding.current) {
      holding.current = false;
      releaseHistory('memo');
    }
  };
  /* 換分頁、關掉面板：這一段先記下來 */
  // biome-ignore lint/correctness/useExhaustiveDependencies: 換分頁時收尾
  useEffect(() => release, [sheet.id]);
  return (
    <div className="flex flex-col gap-2" data-testid="memo-panel">
      <p className="text-xs text-muted">{S.memo.note}</p>
      <TextArea
        value={draft}
        rows={12}
        spellCheck={false}
        placeholder={S.memo.placeholder}
        aria-label={S.memo.title}
        maxLength={MEMO_MAX}
        onFocus={() => {
          editing.current = true;
        }}
        onBlur={() => {
          editing.current = false;
          release();
        }}
        onChange={(e) => {
          const v = e.target.value.slice(0, MEMO_MAX);
          setDraft(v);
          if (!holding.current) {
            holding.current = true;
            holdHistory('memo');
          }
          setMemo(v);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(release, MEMO_IDLE_MS);
        }}
        data-testid="memo-text"
      />
      <p className="self-end text-xs tabular-nums text-muted">
        {S.memo.count(draft.length, MEMO_MAX)}
      </p>
    </div>
  );
}
