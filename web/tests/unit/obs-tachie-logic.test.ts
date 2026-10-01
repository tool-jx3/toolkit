/**
 * Discord 通話立繪產生器的資料與規則（規格 F03～F11、F27、F44、F52～F54、F58、F76、3.3、3.5）：
 * Discord ID、使用者與預設集的增刪、組合、存檔的修正、說話效果的邊距、繪製尺寸、下載檔名、圖片網址的處理方式。
 */
import { describe, expect, it } from 'vitest';
import { classifyImageUrl, parseDiscordUserId } from '@/ccfolia';
import {
  alignLost,
  cssFileName,
  cssFileStem,
  effectMargins,
  geometry,
  labelNeedsBase,
  marginHint,
  nameText,
  previewStatus,
  urlOutcome,
  urlPlan,
} from '@/tools/obs-tachie/logic';
import {
  addUser,
  createPreset,
  DEFAULT_DATA,
  DEFAULT_LABEL,
  DEFAULT_OPTIONS,
  effectiveCombo,
  normalizeData,
  type Preset,
  removePreset,
  removeUser,
  resetPresetOptions,
  saveCombo,
  type TachieData,
  userLabel,
} from '@/tools/obs-tachie/model';

const A = '111111111111111111';
const B = '222222222222222222';

function sample(): TachieData {
  const p1 = createPreset('p1');
  p1.name = '平常';
  const p2 = createPreset('p2');
  return {
    users: [
      { id: A, memo: '阿明', name: '艾琳' },
      { id: B, memo: '', name: '' },
    ],
    presets: [p1, p2],
    saved: [
      { userId: A, presetId: 'p1' },
      { userId: B, presetId: 'p1' },
      { userId: A, presetId: 'p2' },
    ],
    current: { userId: A, presetId: 'p2' },
  };
}

describe('Discord 使用者 ID 與新增使用者（F03、F04）', () => {
  it('去掉所有非數字字元；去完是空的就是錯誤', () => {
    expect(parseDiscordUserId(' 1234-5678abc9012345678 ')).toBe('123456789012345678');
    const r = addUser(DEFAULT_DATA, { id: 'abc', memo: 'x', name: '' });
    expect(r.error).toBe(true);
    expect(r.data).toBe(DEFAULT_DATA);
  });

  it('名稱去掉前後空白；加在最後', () => {
    const r = addUser(sample(), { id: ' 33-3 ', memo: '  小華 ', name: ' 角色 ' });
    expect(r.error).toBe(false);
    expect(r.data.users.at(-1)).toEqual({ id: '333', memo: '小華', name: '角色' });
  });

  it('同一個 ID 再新增：取代並移到最後，已儲存的組合保留', () => {
    const r = addUser(sample(), { id: A, memo: '新名字', name: '' });
    expect(r.replaced).toBe(true);
    expect(r.data.users.map((u) => u.id)).toEqual([B, A]);
    expect(r.data.users[1]).toEqual({ id: A, memo: '新名字', name: '' });
    expect(r.data.saved).toHaveLength(3);
  });

  it('「備忘名稱（ID）」，沒有名稱時只有 ID', () => {
    expect(userLabel({ id: A, memo: '阿明', name: '' })).toBe(`阿明（${A}）`);
    expect(userLabel({ id: B, memo: ' ', name: '' })).toBe(B);
  });
});

describe('刪除與組合（F06、F09、F52～F54）', () => {
  it('刪除使用者：連帶刪掉用到他的已儲存組合，目前選他時改回預設（第一個）', () => {
    const d = removeUser(sample(), A);
    expect(d.users.map((u) => u.id)).toEqual([B]);
    expect(d.saved).toEqual([{ userId: B, presetId: 'p1' }]);
    expect(d.current.userId).toBeNull();
    expect(effectiveCombo(d).user?.id).toBe(B);
  });

  it('刪除預設集：連帶刪掉用到它的已儲存組合', () => {
    const d = removePreset(sample(), 'p1');
    expect(d.presets.map((p) => p.id)).toEqual(['p2']);
    expect(d.saved).toEqual([{ userId: A, presetId: 'p2' }]);
    expect(d.current.presetId).toBe('p2');
  });

  it('目前的組合：沒有選或選的已被刪掉時用清單的第一個；沒有人或預設集時是 null', () => {
    const d = { ...sample(), current: { userId: 'gone', presetId: null } };
    const c = effectiveCombo(d);
    expect([c.user?.id, c.preset?.id]).toEqual([A, 'p1']);
    expect(effectiveCombo(DEFAULT_DATA)).toEqual({ user: null, preset: null });
  });

  it('儲存組合：已經存過時不變', () => {
    const d = sample();
    expect(saveCombo(d)).toBe(d);
    const d2 = { ...d, current: { userId: B, presetId: 'p2' } };
    expect(saveCombo(d2).saved.at(-1)).toEqual({ userId: B, presetId: 'p2' });
  });
});

describe('預設集（F08、F44、4.）', () => {
  it('新預設集：全部預設值、沒有圖片', () => {
    const p = createPreset();
    expect(p.image).toBeNull();
    expect(p.name).toBe('');
    expect(p).toMatchObject({
      anchor: 'bottom-left',
      offsetX: 0,
      offsetY: 0,
      width: null,
      bounce: true,
      bounceHeight: 10,
      glow: true,
      glowColor: '#ffffff',
      glowWidth: 2,
      blink: false,
      period: 750,
      dim: false,
      hideAway: false,
    });
    expect(p.label).toMatchObject({
      show: false,
      x: 0,
      size: 32,
      color: '#ffffff',
      bold: true,
      align: 'center',
      stroke: true,
      strokeWidth: 3,
      strokeColor: '#000000',
      bar: false,
      barWidth: 'fit',
      barColor: '#000000',
      barOpacity: 60,
      barRadius: 6,
      barPadX: 12,
      barPadY: 6,
    });
    /* 裁定：預設垂直位置改成立繪貼底時名字不會被切掉（正值＝往上） */
    expect(p.label.y).toBeGreaterThanOrEqual(0);
    /* 裁定：預設字型是繁中字型 */
    expect(p.label.font.family).toBe('Noto Sans TC');
  });

  it('選項恢復預設：保留 id、名稱與圖片', () => {
    const p = createPreset('x');
    p.name = '戰鬥';
    p.image = 'img1';
    p.anchor = 'top';
    p.label.show = true;
    p.dim = true;
    const r = resetPresetOptions(p);
    expect(r).toEqual({ id: 'x', name: '戰鬥', image: 'img1', ...DEFAULT_OPTIONS });
    expect(r.label).not.toBe(DEFAULT_LABEL);
  });
});

describe('存檔的修正（F76、5.）', () => {
  it('壞掉的資料修成可以用的樣子', () => {
    const d = normalizeData({
      users: [
        { id: '12-34', memo: ' 甲 ', name: 5 },
        { id: 'abc' },
        null,
        { id: 1234, memo: '乙' },
      ],
      presets: [
        {
          id: 'p',
          anchor: 'nowhere',
          offsetX: 'x',
          width: -5,
          period: 10,
          glowWidth: 0,
          bounceHeight: -1,
          glowColor: 'red; }',
          label: {
            color: 'javascript:',
            barOpacity: 500,
            align: 'middle',
            font: { source: 'upload', family: 'X' },
          },
        },
        { id: 'p' },
        'junk',
      ],
      saved: [
        { userId: '1234', presetId: 'p' },
        { userId: '1234', presetId: 'p' },
        { userId: '9', presetId: 'p' },
      ],
      current: { userId: '9', presetId: 'p' },
    });
    expect(d.users).toEqual([{ id: '1234', memo: '乙', name: '' }]);
    expect(d.presets).toHaveLength(2);
    const p = d.presets[0] as Preset;
    expect(p.anchor).toBe('bottom-left');
    expect(p.offsetX).toBe(0);
    expect(p.width).toBeNull();
    expect(p.period).toBe(50);
    expect(p.glowWidth).toBe(1);
    expect(p.bounceHeight).toBe(0);
    expect(p.glowColor).toBe('#ffffff');
    expect(p.label.color).toBe('#ffffff');
    expect(p.label.barOpacity).toBe(100);
    expect(p.label.align).toBe('center');
    expect(p.label.font.source).toBe('local');
    expect(d.presets[1]?.id).not.toBe('p');
    expect(d.saved).toEqual([{ userId: '1234', presetId: 'p' }]);
    expect(d.current).toEqual({ userId: null, presetId: 'p' });
    expect(normalizeData(null)).toEqual(DEFAULT_DATA);
  });
});

describe('名字（3.4.6、F50）', () => {
  it('畫面上的名字，空白時用備忘名稱；換行與控制字元換成空白、去掉前後空白', () => {
    expect(nameText({ memo: '阿明', name: '艾琳' })).toBe('艾琳');
    expect(nameText({ memo: ' 阿明 ', name: '  ' })).toBe('阿明');
    expect(nameText({ memo: '', name: ' 第一行\n第二行\t\u0007 ' })).toBe('第一行 第二行');
    expect(nameText(null)).toBe('');
  });

  it('需要基準寬度：對齊不是靠左，或字幕條鋪滿（F59）', () => {
    const l = { ...DEFAULT_LABEL };
    expect(labelNeedsBase(l)).toBe(true);
    expect(labelNeedsBase({ ...l, align: 'left' })).toBe(false);
    expect(labelNeedsBase({ ...l, align: 'left', bar: true, barWidth: 'fill' })).toBe(true);
    const p = createPreset();
    p.label.show = true;
    expect(alignLost(p, { baseW: null })).toBe(true);
    expect(alignLost(p, { baseW: 300 })).toBe(false);
    p.label.show = false;
    expect(alignLost(p, { baseW: null })).toBe(false);
  });
});

describe('繪製尺寸（3.4.3）', () => {
  it('量得到時寫死；量不到時只知道指定寬度', () => {
    expect(geometry({ width: null }, { width: 300, height: 600 })).toEqual({
      drawW: 300,
      drawH: 600,
      baseW: 300,
      baseFromActual: true,
      sized: true,
    });
    expect(geometry({ width: 150 }, { width: 300, height: 600 })).toMatchObject({
      drawW: 150,
      drawH: 300,
      baseFromActual: false,
    });
    expect(geometry({ width: null }, null)).toMatchObject({ drawW: null, baseW: null });
    expect(geometry({ width: 200 }, null)).toMatchObject({ drawW: 200, drawH: null, baseW: 200 });
  });
});

describe('說話效果的邊距提示（F27）', () => {
  const base = createPreset();
  it('預設（外框寬 2）→ 水平、垂直都是 14', () => {
    expect(effectMargins(base)).toEqual({ x: 14, y: 14 });
  });
  it('錨點左上、彈跳 10 → 垂直 24；中央的軸不提示', () => {
    expect(effectMargins({ ...base, anchor: 'top-left' })).toEqual({ x: 14, y: 24 });
    expect(effectMargins({ ...base, anchor: 'center' })).toEqual({ x: null, y: null });
    expect(effectMargins({ ...base, anchor: 'top' })).toEqual({ x: null, y: 24 });
  });
  it('外框光暈關閉時只算彈跳；寬度 0 以下當 1；小數無條件進位', () => {
    expect(effectMargins({ ...base, glow: false })).toEqual({ x: 0, y: 0 });
    expect(effectMargins({ ...base, glow: false, anchor: 'top-right' })).toEqual({ x: 0, y: 10 });
    expect(effectMargins({ ...base, glowWidth: 0 })).toEqual({ x: 7, y: 7 });
    expect(effectMargins({ ...base, glowWidth: 1.5 })).toEqual({ x: 11, y: 11 });
  });
  it('距離小於所需時警告，否則顯示所需；所需為 0 時不顯示', () => {
    expect(marginHint(14, 0)).toEqual({ kind: 'warn', value: 14 });
    expect(marginHint(14, 14)).toEqual({ kind: 'need', value: 14 });
    expect(marginHint(0, 0)).toBeNull();
    expect(marginHint(null, 0)).toBeNull();
  });
});

describe('下載檔名（3.5、F58）', () => {
  it('規格的例子', () => {
    expect(cssFileName({ id: A, memo: 'B' }, '')).toBe('streamkit-B-preset.css');
    expect(cssFileName({ id: A, memo: '阿明' }, '平常 v2')).toBe('streamkit-阿明-平常_v2.css');
  });
  it('備忘名稱空白時用 ID；連續的不允許字元換成一個「_」；去掉頭尾的「_」', () => {
    expect(cssFileName({ id: A, memo: '  ' }, ' 戰鬥 ')).toBe(`streamkit-${A}-戰鬥.css`);
    expect(cssFileStem({ id: A, memo: '/a**b/' }, '!!x.y_z-1??')).toBe('a_b_-_x.y_z-1');
    expect(cssFileStem({ id: A, memo: 'ㄅ😀ㄆ' }, 'Ünïcode')).toBe('ㄅ_ㄆ-Ünïcode');
  });
});

describe('圖片網址的處理方式（3.3、F16、F17）', () => {
  const kind = (u: string) => classifyImageUrl(u).kind;
  const imgur = 'https://i.imgur.com/abc.png';
  const att = 'https://cdn.discordapp.com/attachments/1/2/a.png?ex=1&is=2&hm=3';
  const other = 'https://example.com/a.png';

  it('網址的種類', () => {
    expect(kind('data:image/png;base64,AAAA')).toBe('data');
    expect(kind(imgur)).toBe('direct');
    expect(kind(att)).toBe('expiring');
    expect(kind('https://media.discordapp.net/x.png')).toBe('expiring');
    expect(kind(other)).toBe('other');
    expect(classifyImageUrl('not a url').valid).toBe(false);
  });

  it('三種處理方式的表', () => {
    expect(['auto', 'direct', 'embed'].map((m) => urlPlan('data', m as 'auto'))).toEqual([
      'data',
      'data',
      'data',
    ]);
    expect(urlPlan('direct', 'auto')).toBe('keep');
    expect(urlPlan('direct', 'direct')).toBe('keep');
    expect(urlPlan('direct', 'embed')).toBe('fetch');
    expect(urlPlan('expiring', 'auto')).toBe('fetch');
    expect(urlPlan('expiring', 'direct')).toBe('keep');
    expect(urlPlan('other', 'auto')).toBe('fetch');
    expect(urlPlan('other', 'direct')).toBe('keep');
    expect(urlPlan('other', 'embed')).toBe('fetch');
  });

  it('結果與警告', () => {
    expect(urlOutcome('direct', 'auto', null)).toEqual({ how: 'direct', warn: null });
    expect(urlOutcome('expiring', 'direct', null)).toEqual({ how: 'direct', warn: 'expiring' });
    expect(urlOutcome('other', 'direct', null)).toEqual({ how: 'direct', warn: 'other' });
    expect(urlOutcome('expiring', 'auto', { ok: true })).toEqual({
      how: 'expiringEmbedded',
      warn: null,
    });
    expect(urlOutcome('other', 'auto', { ok: true })).toEqual({ how: 'otherEmbedded', warn: null });
    expect(urlOutcome('direct', 'embed', { ok: true })).toEqual({ how: 'embedded', warn: null });
    expect(urlOutcome('expiring', 'auto', { ok: false, reason: 'r' })).toEqual({
      how: 'direct',
      warn: 'expiringFailed',
      reason: 'r',
    });
    expect(urlOutcome('other', 'auto', { ok: false, reason: 'r' })).toMatchObject({
      warn: 'otherFailed',
    });
    expect(urlOutcome('other', 'embed', { ok: false, reason: 'r' })).toMatchObject({
      warn: 'embedFailed',
    });
  });
});

describe('預覽的狀態標籤（F46、F47）', () => {
  it('通話中・安靜／說話中／不在頻道（常駐或不顯示）', () => {
    expect(previewStatus(true, false, false)).toBe('quiet');
    expect(previewStatus(true, true, true)).toBe('speaking');
    expect(previewStatus(false, true, false)).toBe('awayShown');
    expect(previewStatus(false, false, true)).toBe('awayHidden');
  });
});
