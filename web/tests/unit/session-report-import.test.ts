/**
 * 團報產生器：跑團紀錄簿交接資料的讀入（規格 3.10）、存檔的整理。
 */
import { describe, expect, it } from 'vitest';
import { createReportImportItem, SESSION_SYSTEMS } from '@/core/sessions';
import {
  applyImportItem,
  formatHashtags,
  inferGmRole,
  matchSystem,
} from '@/tools/session-report/importLog';
import { defaultSettings, restoreSettings, SYSTEMS } from '@/tools/session-report/model';

describe('系統的對應', () => {
  it('跑團紀錄簿的正規值都對得上', () => {
    const want: Record<string, string> = {
      'CoC 7版': 'coc7',
      'CoC 6版': 'coc6',
      エモクロア: 'emoklore_ja',
      マダミス: 'madamisu',
      シノビガミ: 'shinobigami',
      インセイン: 'insane',
      'ダブルクロス The 3rd Edition': 'double_cross',
      'ソード・ワールド2.5': 'sword_world_25',
      フタリソウサ: 'futari_sousa',
    };
    for (const s of SESSION_SYSTEMS) expect(matchSystem(s.value), s.value).toBe(want[s.value]);
  });

  it('別名完全相同才算；系統名稱不分大小寫；對不上時 null', () => {
    expect(matchSystem('CoC6')).toBe('coc6');
    expect(matchSystem('新クトゥルフ神話TRPG')).toBe('new_coc');
    expect(matchSystem('エモクロアTRPG')).toBe('emoklore_ja');
    expect(matchSystem('Emoklore')).toBe('emoklore_ja');
    expect(matchSystem('マーダーミステリー')).toBe('madamisu');
    expect(matchSystem(' coc7 ')).toBe('coc7');
    expect(matchSystem('call of cthulhu')).toBe('call_of_cthulhu');
    expect(matchSystem('EMOKLORE-TRPG')).toBe('emoklore_en');
    expect(matchSystem('劍世界2.5')).toBe('sword_world_25');
    expect(matchSystem('忍神')).toBe('shinobigami');
    expect(matchSystem('ゴーストハント')).toBeNull();
    expect(matchSystem('')).toBeNull();
    for (const s of SYSTEMS) expect(matchSystem(s.name)).toBe(s.key);
  });

  it('依系統原文推測主持人的身分', () => {
    expect(inferGmRole('エモクロア')).toBe('DL');
    expect(inferGmRole('emoklore-trpg')).toBe('DL');
    expect(inferGmRole('CoC 6版')).toBe('KP');
    expect(inferGmRole('新クトゥルフ神話TRPG')).toBe('KP');
    expect(inferGmRole('克蘇魯神話')).toBe('KP');
    expect(inferGmRole('マダミス')).toBe('GM');
    expect(inferGmRole('')).toBe('GM');
  });
});

describe('主題標籤', () => {
  it('陣列：補 #、丟掉空的、以空白連接；文字：去頭尾空白', () => {
    expect(formatHashtags(['團報', ' #CoC ', '', null])).toBe('#團報 #CoC');
    expect(formatHashtags('  #a #b ')).toBe('#a #b');
    expect(formatHashtags(undefined)).toBe('');
  });
});

describe('applyImportItem', () => {
  const base = () => ({
    ...defaultSettings(),
    template: 'roster' as const,
    fontStyle: 'serifBold' as const,
    honorific: 'sama' as const,
    nameOrder: 'plpc' as const,
    slot: 'PC1' as const,
    author: '舊作者',
    result: '舊結果',
  });

  it('跑團紀錄簿產生的交接資料：填入表單，範本、樣式、敬稱、順序、標記不變；作者與結果清空', () => {
    const item = createReportImportItem({
      id: 'r1',
      date: '2026-05-02',
      dates: ['2026-05-02', '2026-05-09'],
      scenario: '雨夜的郵差',
      system: 'CoC 7版',
      gm: '小林',
      players: '阿德、米可',
      pc: '溫書亭',
      note: '備註',
      hashtag: '團報 CoC',
    });
    const s = applyImportItem(base(), item);
    expect(s).toMatchObject({
      template: 'roster',
      fontStyle: 'serifBold',
      honorific: 'sama',
      nameOrder: 'plpc',
      slot: 'PC1',
      system: 'coc7',
      customSystem: '',
      scenario: '雨夜的郵差',
      author: '',
      result: '',
      date: '2026-05-09',
      hashtags: '#團報 #CoC',
      memo: '備註',
    });
    expect(s.gms.map((g) => [g.role, g.name])).toEqual([['KP', '小林']]);
    expect(s.players.map((p) => [p.ho, p.pc, p.pl])).toEqual([
      ['', '溫書亭', '阿德'],
      ['', '', '米可'],
    ]);
  });

  it('對不上的系統：自行輸入；Emoklore：主持人改成 DL；沒有參加者時一列空白；日期用清單連接', () => {
    const custom = applyImportItem(base(), { system: ' ゴーストハント ', gm: 'A、B' });
    expect(custom.system).toBe('custom');
    expect(custom.customSystem).toBe('ゴーストハント');
    expect(custom.gms.map((g) => [g.role, g.name])).toEqual([['GM', 'A、B']]);
    expect(custom.players).toHaveLength(1);
    expect(custom.players[0]).toMatchObject({ ho: '', pc: '', pl: '' });
    const emo = applyImportItem(base(), {
      system: 'Emoklore',
      dates: ['2026-01-01', '2026-01-08'],
    });
    expect(emo.system).toBe('emoklore_ja');
    expect(emo.gms[0].role).toBe('DL');
    expect(emo.date).toBe('2026-01-01 / 2026-01-08');
  });
});

describe('restoreSettings（存檔的整理）', () => {
  it('不是物件時 null；認不得的選項回到預設；欄位補成字串；列的識別碼重複時重新編號', () => {
    expect(restoreSettings(null)).toBeNull();
    expect(restoreSettings([])).toBeNull();
    const s = restoreSettings({
      template: 'nope',
      fontStyle: 'toString',
      system: 'x',
      honorific: 'kun',
      nameOrder: 'plpc',
      slot: 'HO9',
      scenario: 3,
      gms: [{ id: 'a', role: 'boss', name: '甲' }, null, { id: 'a', role: 'DL' }],
      players: 'oops',
    });
    expect(s).toMatchObject({
      template: 'standard',
      fontStyle: 'sansBoldItalic',
      system: 'call_of_cthulhu',
      honorific: 'none',
      nameOrder: 'plpc',
      slot: 'HO1',
      scenario: '',
    });
    expect(s?.gms.map((g) => [g.role, g.name])).toEqual([
      ['KP', '甲'],
      ['DL', ''],
    ]);
    expect(new Set(s?.gms.map((g) => g.id)).size).toBe(2);
    expect(s?.players).toHaveLength(1);
  });
});
