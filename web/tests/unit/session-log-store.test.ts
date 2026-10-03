/**
 * 跑團紀錄簿：詳細・感想側欄的編輯草稿（F69、主控 7.1）。
 * 打字先放在草稿、停頓 DETAIL_COMMIT_MS 才寫回；一次寫回算一步復原；其他操作前先寫回。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionRow } from '@/core/sessions';
import { initialLogData, newSessionRow } from '../../src/tools/session-log/logic';
import {
  closeDetail,
  DETAIL_COMMIT_MS,
  editRow,
  flushRowDraft,
  redoLog,
  setRowField,
  undoLog,
  useLog,
  useRowDraft,
} from '../../src/tools/session-log/store';

const row = (id: string, over: Partial<SessionRow> = {}): SessionRow => ({
  ...newSessionRow('2026-01-01'),
  id,
  ...over,
});
const saved = (id: string) => useLog.getState().data.rows.find((r) => r.id === id);

/** 一個字一個字打（每鍵間隔 gap 毫秒），回傳打到的文字 */
function type(id: string, key: string, start: string, text: string, gap = 120): string {
  let value = start;
  for (const ch of text) {
    value += ch;
    editRow(id, { [key]: value });
    vi.advanceTimersByTime(gap);
  }
  return value;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-02T00:00:00Z'));
  useLog.getState().replace({
    ...initialLogData(),
    rows: [
      row('a', { scenario: '雨夜', longNote: '', sample: true }),
      row('b', { scenario: '霧港' }),
    ],
  });
  vi.advanceTimersByTime(1000);
  useLog.temporal.getState().clear();
});

afterEach(() => {
  flushRowDraft();
  vi.useRealTimers();
});

describe('側欄的編輯草稿（F69、主控 7.1）', () => {
  it('打字時先放在草稿，停頓後才寫回存檔', () => {
    const before = useLog.getState().data;
    editRow('a', { longNote: '很' });
    editRow('a', { longNote: '很好' });
    expect(useLog.getState().data).toBe(before);
    expect(useRowDraft.getState()).toEqual({ id: 'a', patch: { longNote: '很好' } });
    vi.advanceTimersByTime(DETAIL_COMMIT_MS - 1);
    expect(saved('a')?.longNote).toBe('');
    vi.advanceTimersByTime(1);
    expect(saved('a')?.longNote).toBe('很好');
    expect(useRowDraft.getState().id).toBeNull();
    /* 寫回不取消範例標記、不動其他列 */
    expect(saved('a')?.sample).toBe(true);
    expect(saved('b')?.scenario).toBe('霧港');
  });

  it('停頓約 300 ms 就反映', () => {
    expect(DETAIL_COMMIT_MS).toBeLessThanOrEqual(300);
  });

  it('一段連續打字算一步復原；停頓後再打是新的一步', () => {
    const first = type('a', 'longNote', '', 'abcdefghij');
    vi.advanceTimersByTime(DETAIL_COMMIT_MS);
    expect(saved('a')?.longNote).toBe('abcdefghij');
    expect(useLog.temporal.getState().pastStates).toHaveLength(1);
    type('a', 'longNote', first, 'XYZ');
    vi.advanceTimersByTime(DETAIL_COMMIT_MS);
    expect(saved('a')?.longNote).toBe('abcdefghijXYZ');
    expect(useLog.temporal.getState().pastStates).toHaveLength(2);
    undoLog();
    expect(saved('a')?.longNote).toBe('abcdefghij');
    undoLog();
    expect(saved('a')?.longNote).toBe('');
    redoLog();
    redoLog();
    expect(saved('a')?.longNote).toBe('abcdefghijXYZ');
  });

  it('同一次寫回裡的多個欄位算一步', () => {
    editRow('a', { scenario: '雨夜（改）' });
    editRow('a', { dates: ['2026-02-01'], date: '2026-02-01' });
    vi.advanceTimersByTime(DETAIL_COMMIT_MS);
    expect(saved('a')).toMatchObject({ scenario: '雨夜（改）', dates: ['2026-02-01'] });
    undoLog();
    expect(saved('a')).toMatchObject({ scenario: '雨夜', dates: ['2026-01-01'] });
  });

  it('還沒寫回時按復原：先寫回、再復原這段打字', () => {
    type('a', 'longNote', '', 'abc');
    expect(saved('a')?.longNote).toBe('');
    undoLog();
    expect(saved('a')?.longNote).toBe('');
    expect(useRowDraft.getState().id).toBeNull();
    redoLog();
    expect(saved('a')?.longNote).toBe('abc');
  });

  it('選單、新增或刪除貼文與連結馬上寫回', () => {
    editRow('a', { role: 'KP' }, { immediate: true });
    expect(saved('a')?.role).toBe('KP');
    expect(useRowDraft.getState().id).toBeNull();
  });

  it('換一團、其他操作、關閉側欄前先寫回', () => {
    editRow('a', { note: '甲' });
    editRow('b', { note: '乙' });
    expect(saved('a')?.note).toBe('甲');
    expect(saved('b')?.note).toBe('');
    setRowField('a', 'reported', true);
    expect(saved('b')?.note).toBe('乙');
    editRow('a', { gm: '小林' });
    closeDetail();
    expect(saved('a')?.gm).toBe('小林');
    expect(useRowDraft.getState().id).toBeNull();
  });

  it('草稿和存檔一樣時不記步驟', () => {
    editRow('a', { scenario: '雨夜' });
    vi.advanceTimersByTime(DETAIL_COMMIT_MS);
    expect(useLog.temporal.getState().pastStates).toHaveLength(0);
  });
});
