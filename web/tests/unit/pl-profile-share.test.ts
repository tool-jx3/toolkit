/**
 * 分享連結（share.ts）：往返、頭像與關掉眼睛的欄位不放進連結、看不到的成人向主題拿掉、空白省略、
 * 被改過的內容照樣整理、壞掉的連結、一段文字裡的好幾個連結。
 */
import { describe, expect, it } from 'vitest';
import { encodeShareHash } from '@/core/share';
import { normalizeData, type ProfileData } from '@/tools/pl-profile/model';
import {
  encodeShare,
  prune,
  readShare,
  SHARE_KEY,
  SHARE_MAX_LENGTH,
  SHARE_VERSION,
  sharedData,
  sharesInText,
  shareUrlFor,
  toSharePayload,
} from '@/tools/pl-profile/share';

function sample(): ProfileData {
  return normalizeData({
    profile: {
      nickname: '阿明',
      handle: '@aming',
      tagline: '請多指教',
      avatar: { id: 'abcd1234', name: 'a.png', width: 100, height: 100 },
      avatarPlacement: { zoom: 2, x: 0, y: 0, turns: 0 },
      avatarCredit: '小青',
      age: 'adult',
      plExp: 'veteran',
      kpExp: 'new',
      systems: [
        { id: 's1', name: 'CoC 7 版', level: 'main', kp: true, note: '' },
        { id: 's2', name: '  ', level: 'played' },
      ],
      styles: { picked: ['story'], extra: ['慢熱'] },
      contacts: [{ id: 'c1', kind: 'Discord', value: 'aming' }],
      memo: '你好',
    },
    show: { age: true, contact: false },
    jirai: {
      levels: { 'swarming-bugs': 'ng', 'pc-death': 'ask', 'flirting-innuendo': 'ng' },
      notes: { 'swarming-bugs': '圖也不行', 'flirting-innuendo': 'x' },
      cats: [{ id: 'k1', name: '其他' }],
      custom: [
        { id: 't1', cat: 'k1', label: '時事', level: 'like', note: '' },
        { id: 't2', cat: 'adult', label: '成人自訂', level: 'ng', note: '' },
        { id: 't3', cat: 'body', label: '', level: 'ng', note: '' },
      ],
      adult: false,
      memo: '不確定的歡迎私訊',
    },
    look: { theme: 'night', accent: '#d0505a', images: 'split', group: 'category' },
  });
}

describe('sharedData', () => {
  it('頭像拿掉；關掉眼睛的欄位清空；名稱空白的系統、自訂主題拿掉；看不到的成人向主題拿掉', () => {
    const s = sharedData(sample());
    expect(s.profile.avatar).toBe(null);
    expect(s.profile.avatarPlacement).toBe(null);
    expect(s.profile.avatarCredit).toBe('小青');
    expect(s.profile.age).toBe('adult');
    expect(s.profile.contacts).toEqual([]);
    expect(s.profile.systems.map((x) => x.name)).toEqual(['CoC 7 版']);
    expect(s.jirai.levels).toEqual({ 'swarming-bugs': 'ng', 'pc-death': 'ask' });
    expect(s.jirai.notes).toEqual({ 'swarming-bugs': '圖也不行' });
    expect(s.jirai.custom.map((t) => t.id)).toEqual(['t1']);
    expect(s.show.contact).toBe(false);
  });

  it('關掉頭像的眼睛時出處也不放；成人向打開時成人向主題留著', () => {
    const d = sample();
    d.show.avatar = false;
    d.jirai.adult = true;
    const s = sharedData(d);
    expect(s.profile.avatarCredit).toBe('');
    expect(s.jirai.levels['flirting-innuendo']).toBe('ng');
    expect(s.jirai.custom.map((t) => t.id)).toEqual(['t1', 't2']);
  });
});

describe('分享連結的往返', () => {
  it('encode → readShare：內容與 sharedData 相同（清單的 id 重新編）', () => {
    const d = sample();
    const back = readShare(encodeShare(d));
    expect(typeof back).toBe('object');
    if (typeof back !== 'object') return;
    const want = sharedData(d);
    const strip = (x: ProfileData) => ({
      ...x,
      profile: {
        ...x.profile,
        systems: x.profile.systems.map(({ id: _i, ...r }) => r),
        contacts: x.profile.contacts.map(({ id: _i, ...r }) => r),
      },
    });
    expect(strip(back)).toEqual(strip(want));
    expect(back.look).toEqual(d.look);
  });

  it('省略空白與預設：payload 沒有空字串、空陣列', () => {
    const json = JSON.stringify(toSharePayload(normalizeData({ profile: { nickname: 'A' } })));
    expect(json).not.toMatch(/""|\[\]|\{\}/);
    expect(prune({ a: '', b: [], c: {}, d: false, e: 0, f: { g: '' } })).toEqual({
      d: false,
      e: 0,
    });
  });

  it('shareUrlFor：換掉目前網址的 #；連結長度遠低於上限', () => {
    const url = shareUrlFor(sample(), 'https://example.com/next/pl-profile/?x=1#old');
    const u = new URL(url);
    expect(u.pathname).toBe('/next/pl-profile/');
    expect(u.search).toBe('?x=1');
    expect(u.hash.startsWith(`#${SHARE_KEY}=`)).toBe(true);
    expect(u.hash.length).toBeLessThan(2000);
  });

  it('沒有分享：none；壞掉、版本不符：broken', () => {
    expect(readShare('')).toBe('none');
    expect(readShare('#other=1')).toBe('none');
    expect(readShare('#p=@@@')).toBe('broken');
    expect(readShare(encodeShareHash({ profile: {} }, { version: 99, key: SHARE_KEY }))).toBe(
      'broken',
    );
  });

  it('被改過的內容照樣整理（網址是任何人都能編的輸入）', () => {
    const hash = encodeShareHash(
      {
        profile: { nickname: 'x'.repeat(100), avatar: { id: 'abcd1234', width: 5, height: 5 } },
        jirai: { levels: { 'swarming-bugs': 'nope', 'pc-death': 'ng' } },
        look: { theme: '<script>' },
      },
      { version: SHARE_VERSION, key: SHARE_KEY },
    );
    const back = readShare(hash);
    if (typeof back !== 'object') throw new Error('應該讀得出來');
    expect(back.profile.nickname).toHaveLength(24);
    expect(back.jirai.levels).toEqual({ 'pc-death': 'ng' });
    expect(back.look.theme).toBe('paper');
  });

  it('解開後超過 256 KB 的連結當成讀不出來（很短的連結解出很大的資料）', () => {
    const bomb = encodeShareHash(
      { profile: { nickname: '阿明', memo: ' '.repeat(600_000) } },
      { version: SHARE_VERSION, key: SHARE_KEY },
    );
    expect(bomb.length).toBeLessThan(SHARE_MAX_LENGTH);
    expect(readShare(bomb)).toBe('broken');
  });

  it('sharesInText：一段文字裡的好幾個連結（壞掉的另外算）', () => {
    const a = shareUrlFor(sample(), 'https://example.com/p/');
    const b = shareUrlFor(
      normalizeData({ profile: { nickname: '小華' } }),
      'https://example.com/p/',
    );
    const r = sharesInText(`第一個 ${a}\n第二個：${b}\n壞的 https://example.com/p/#p=xyz`);
    expect(r.found).toBe(3);
    expect(r.broken).toBe(1);
    expect(r.data.map((d) => d.profile.nickname)).toEqual(['阿明', '小華']);
    expect(sharesInText('沒有連結').found).toBe(0);
  });
});
