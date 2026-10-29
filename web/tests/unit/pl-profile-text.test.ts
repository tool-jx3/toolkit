/**
 * 純文字輸出（text.ts）：一般與 Discord 的寫法、自介的欄位（關掉眼睛、沒有內容的不列）、地雷表依程度／依分類、
 * 只列「地雷」與「先問我」、包含補充的開關。逐字比對。
 */
import { describe, expect, it } from 'vitest';
import { normalizeData, type ProfileData } from '@/tools/pl-profile/model';
import { experienceText, systemText, type TextOptions, toText } from '@/tools/pl-profile/text';

const ALL: TextOptions = { style: 'plain', profile: true, jirai: true, issuesOnly: false };

function sample(edit?: (d: ProfileData) => void): ProfileData {
  const d = normalizeData({
    profile: {
      nickname: '阿明',
      handle: '@aming',
      tagline: '請多指教',
      avatarCredit: '小青',
      plExp: 'veteran',
      kpExp: 'new',
      expNote: '跑了三年',
      systems: [
        { name: 'CoC 7 版', level: 'main', kp: true, note: '有規則書' },
        { name: '忍神', level: 'want' },
      ],
      styles: { picked: ['story', 'rp'], extra: ['慢熱'] },
      schedule: { picked: ['wdnight'] },
      scheduleNote: '11 點前',
      contacts: [
        { kind: 'Discord', value: 'aming' },
        { kind: 'X', value: '@aming' },
      ],
      memo: '第一次語音團。\n請多包涵！',
    },
    jirai: {
      levels: {
        'swarming-bugs': 'ng',
        'pc-death': 'ask',
        combat: 'love',
        'blood-wounds': 'like',
        'late-night': 'ok',
      },
      notes: { 'pc-death': '事前說一聲' },
      memo: '不確定的歡迎私訊',
    },
  });
  edit?.(d);
  return d;
}

describe('toText', () => {
  it('一般：自介＋地雷表（依程度）', () => {
    expect(toText(sample(), ALL)).toBe(
      [
        '【PL 自介】',
        '阿明（@aming）',
        '「請多指教」',
        '・跑團經驗：PL 熟手／KP 新手（跑了三年）',
        '・玩過的系統：CoC 7 版（本命・可以 KP・有規則書）、忍神（想跑跑看）',
        '・喜歡的風格：劇情、角色扮演、慢熱',
        '・可以的時段：平日晚上（11 點前）',
        '・聯絡方式：Discord aming／X @aming',
        '・頭像：小青',
        '・想說的話：',
        '第一次語音團。',
        '請多包涵！',
        '',
        '【阿明的地雷表】',
        '✕ 地雷：成群的蟲',
        '？ 先問我：PC 死亡（事前說一聲）',
        '★ 盡量來：戰鬥',
        '✓ 有就開心：血與傷口的描寫',
        '～ 沒差：跑到深夜',
        '補充：',
        '不確定的歡迎私訊',
      ].join('\n'),
    );
  });

  it('Discord：標題與欄位名稱加粗', () => {
    const t = toText(sample(), { ...ALL, style: 'discord', issuesOnly: true });
    expect(t).toContain('**PL 自介**\n阿明（@aming）');
    expect(t).toContain('・**跑團經驗**：PL 熟手／KP 新手（跑了三年）');
    expect(t).toContain(
      '**阿明的地雷表**\n**✕ 地雷**：成群的蟲\n**？ 先問我**：PC 死亡（事前說一聲）\n**補充**：',
    );
    expect(t).not.toContain('盡量來：');
  });

  it('依分類：圖例＋每個分類一段；不包含補充時拿掉主題的補充', () => {
    const d = sample((x) => {
      x.look.group = 'category';
      x.look.notes = false;
    });
    expect(toText(d, { ...ALL, profile: false })).toBe(
      [
        '【阿明的地雷表】',
        '★ 盡量來　✓ 有就開心　～ 沒差　？ 先問我　✕ 地雷',
        '▼ 恐怖元素',
        '✕ 成群的蟲',
        '▼ 身體與血肉',
        '✓ 血與傷口的描寫',
        '▼ 死亡與失去',
        '？ PC 死亡',
        '▼ 跑團方式',
        '★ 戰鬥',
        '～ 跑到深夜',
        '補充：',
        '不確定的歡迎私訊',
      ].join('\n'),
    );
  });

  it('關掉眼睛的欄位不列；沒有任何內容時是空字串', () => {
    const d = sample((x) => {
      x.show.handle = false;
      x.show.systems = false;
      x.show.memo = false;
      x.show.avatar = false;
    });
    const t = toText(d, { ...ALL, jirai: false });
    expect(t).toContain('阿明\n「請多指教」');
    expect(t).not.toContain('玩過的系統');
    expect(t).not.toContain('想說的話');
    expect(t).not.toContain('頭像');
    expect(toText(normalizeData({}), ALL)).toBe('');
  });

  it('Discord：使用者文字裡的 markdown 字元與行首的 # > - 數字. 跳脫；一般寫法原樣', () => {
    const d = normalizeData({
      profile: {
        nickname: '# *Kuro*_x',
        handle: '@a_b_c_',
        tagline: '||劇透||~~刪~~`碼`',
        avatarCredit: '*繪師*',
        styles: { extra: ['a|b'] },
        memo: '# 大標\n> 引用\n- 清單\n1. 第一\n  2. 縮排\n普通\\字',
      },
      jirai: {
        levels: { 'swarming-bugs': 'ng' },
        notes: { 'swarming-bugs': '||不要|| *很*' },
        cats: [{ id: 'k1', name: '分*類_名~' }],
        custom: [{ id: 't1', cat: 'k1', label: '*_~|`', level: 'ng' }],
        memo: '# 標題\n- x',
      },
      look: { group: 'category' },
    });
    const t = toText(d, { ...ALL, style: 'discord' });
    expect(t).toContain('\\# \\*Kuro\\*\\_x（@a\\_b\\_c\\_）');
    expect(t).toContain('「\\|\\|劇透\\|\\|\\~\\~刪\\~\\~\\`碼\\`」');
    expect(t).toContain('・**頭像**：\\*繪師\\*');
    expect(t).toContain('・**喜歡的風格**：a\\|b');
    expect(t).toContain('\\# 大標\n\\> 引用\n\\- 清單\n1\\. 第一\n  2\\. 縮排\n普通\\\\字');
    /* 標題的開頭是 ** ，# 不在行首、不必跳脫 */
    expect(t).toContain('**# \\*Kuro\\*\\_x的地雷表**');
    expect(t).toContain('✕ 成群的蟲（\\|\\|不要\\|\\| \\*很\\*）');
    expect(t).toContain('**▼ 分\\*類\\_名\\~**\n✕ \\*\\_\\~\\|\\`');
    expect(t).toContain('**補充**：\n\\# 標題\n\\- x');
    /* 一般寫法原樣 */
    const plain = toText(d, ALL);
    expect(plain).toContain('# *Kuro*_x（@a_b_c_）');
    expect(plain).toContain('# 大標\n> 引用\n- 清單\n1. 第一');
  });

  it('小工具：系統與經驗的寫法', () => {
    expect(systemText({ name: 'DX3', level: '玩過', kp: false, note: '' })).toBe('DX3（玩過）');
    expect(experienceText({ pl: '', kp: '', note: '只跑過一次' })).toBe('只跑過一次');
    expect(experienceText({ pl: '新手', kp: '', note: '' })).toBe('PL 新手');
  });
});
