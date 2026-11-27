/**
 * 斷面圖產生器：出現的時機（事件前／事件後）、GM 用／PL 用／公開差分用的偽裝規則，
 * 以及畫圖的結果（記錄畫布的指令雜湊）：PL 用的圖不受 GM 專用的東西與祕密區域的內容影響。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { drawScene, placeFixture } from '@/tools/cross-section/draw/render';
import { wrapText } from '@/tools/cross-section/draw/text';
import { blankDoc } from '@/tools/cross-section/model/factory';
import { layoutOf } from '@/tools/cross-section/model/layout';
import { addShaft, makeFixture, makeNote, placeNote } from '@/tools/cross-section/model/ops';
import { sampleDoc } from '@/tools/cross-section/model/samples';
import type { Audience, EnvId, SectionDoc } from '@/tools/cross-section/model/types';
import {
  fixtureShown,
  nameShown,
  noteShown,
  roomLook,
  shaftShown,
  shownAt,
} from '@/tools/cross-section/model/visibility';
import {
  installRecordingDocument,
  recordingCanvas,
  resetRecordingIds,
} from '../helpers/recordingCanvas';

let restore: (() => void) | null = null;
afterEach(() => {
  restore?.();
  restore = null;
});

function hash(doc: SectionDoc, audience: Audience, env: EnvId = 'day'): string {
  restore ??= installRecordingDocument();
  resetRecordingIds();
  const c = recordingCanvas(800, 600);
  const ctx = c.getContext('2d');
  ctx.setTransform(10, 0, 0, 10, 60, 60);
  drawScene(ctx, doc, layoutOf(doc), { audience, env, flood: 0, crop: 'sheet' });
  return c.hash;
}

/** B1F 右邊的區域設成祕密區域 */
function withSecret(): SectionDoc {
  const d = blankDoc();
  const r = d.building.floors.find((f) => f.level === -1)?.rooms[1];
  if (!r) throw new Error('room');
  r.secret = true;
  r.hideName = true;
  return d;
}

describe('出現的時機', () => {
  it('都有／只在事件前／只在事件後', () => {
    expect(shownAt({}, 'before')).toBe(true);
    expect(shownAt({}, 'after')).toBe(true);
    expect(shownAt({ only: 'before' }, 'after')).toBe(false);
    expect(shownAt({ only: 'after' }, 'before')).toBe(false);
    expect(shownAt({ only: 'after' }, 'after')).toBe(true);
  });

  it('事件・異變的設備預設只在事件後；放置時可以改', () => {
    expect(makeFixture('r', 'bloodwall').only).toBe('after');
    expect(makeFixture('r', 'bloodwall', { only: 'any' }).only).toBeUndefined();
    expect(makeFixture('r', 'tank').only).toBeUndefined();
    expect(makeFixture('r', 'tank', { only: 'before' }).only).toBe('before');
  });

  it('GM 專用的設備只在 GM 用出現', () => {
    const it = { ...makeFixture('r', 'tank'), secret: true };
    expect(fixtureShown(it, 'gm', 'before')).toBe(true);
    expect(fixtureShown(it, 'player', 'before')).toBe(false);
    expect(fixtureShown(it, 'reveal', 'before')).toBe(false);
  });
});

describe('偽裝', () => {
  it('PL 用：地下的祕密區域不畫、地上的偽裝成牆；公開差分用照常畫', () => {
    const d = withSecret();
    const up = d.building.floors.find((f) => f.level === 1)?.rooms[0];
    if (up) up.secret = true;
    const L = layoutOf(d);
    const under = L.rooms.find((r) => r.under && r.room.secret);
    const above = L.rooms.find((r) => !r.under && r.room.secret);
    if (!under || !above) throw new Error('rooms');
    expect(roomLook(under, 'player')).toBe('hidden');
    expect(roomLook(above, 'player')).toBe('camo');
    expect(roomLook(under, 'reveal')).toBe('normal');
    expect(roomLook(under, 'gm')).toBe('normal');
  });

  it('名字：PL 用不寫名字的區域與祕密區域不寫；公開差分用也不寫「PL 用不寫名字」的', () => {
    const room = { ...blankDoc().building.floors[0].rooms[0], hideName: true };
    expect(nameShown(room, 'gm')).toBe(true);
    expect(nameShown(room, 'player')).toBe(false);
    expect(nameShown(room, 'reveal')).toBe(false);
    expect(nameShown({ ...room, hideName: false, secret: true }, 'player')).toBe(false);
    expect(nameShown({ ...room, hideName: false, secret: true }, 'reveal')).toBe(true);
  });

  it('通道：GM 專用與祕密通風管只在 GM 用', () => {
    const d = blankDoc();
    const duct = addShaft(d, 'duct');
    if (!duct) throw new Error('duct');
    expect(shaftShown(duct, 'gm')).toBe(true);
    expect(shaftShown(duct, 'player')).toBe(false);
    expect(shaftShown(duct, 'reveal')).toBe(false);
    expect(shaftShown(d.building.shafts[0], 'player')).toBe(true);
  });

  it('備註：GM 專用、祕密區域裡、蓋在祕密區域上的區域外備註，PL 用都不畫', () => {
    const d = withSecret();
    const L = layoutOf(d);
    const sec = L.rooms.find((r) => r.room.secret);
    if (!sec) throw new Error('secret');
    const inside = makeNote('裡面');
    placeNote(d, inside, sec.x + 2, sec.y + 2);
    const gmNote = { ...makeNote('GM'), secret: true };
    placeNote(d, gmNote, 2, 2);
    const plain = makeNote('一般');
    placeNote(d, plain, 2, 2);
    const orphan = { ...makeNote('沒有區域'), room: 'gone' };
    const L2 = layoutOf(d);
    expect(noteShown(L2, inside, 'player', 'before')).toBe(false);
    expect(noteShown(L2, inside, 'reveal', 'before')).toBe(true);
    expect(noteShown(L2, gmNote, 'reveal', 'before')).toBe(false);
    expect(noteShown(L2, plain, 'player', 'before')).toBe(true);
    expect(noteShown(L2, orphan, 'player', 'before')).toBe(false);
    expect(noteShown(L2, orphan, 'gm', 'before')).toBe(true);
    expect(noteShown(L2, { ...plain, only: 'after' }, 'player', 'before')).toBe(false);
  });
});

describe('畫出來的圖', () => {
  it('PL 用的圖：加 GM 專用的設備、備註、通風管，或改祕密區域裡的東西，指令完全相同', () => {
    const d = withSecret();
    const base = hash(d, 'player');
    const sec = d.building.floors.find((f) => f.level === -1)?.rooms[1];
    const pub = d.building.floors.find((f) => f.level === 1)?.rooms[0];
    if (!sec || !pub) throw new Error('rooms');
    d.items.push(makeFixture(sec.id, 'altar'), { ...makeFixture(pub.id, 'tank'), secret: true });
    const n = { ...makeNote('GM 的筆記'), secret: true };
    placeNote(d, n, 3, 3);
    d.notes.push(n);
    addShaft(d, 'duct');
    sec.name = '別的名字';
    sec.wall = 'stone';
    expect(hash(d, 'player')).toBe(base);
    expect(hash(d, 'gm')).not.toBe(base);
  });

  it('祕密區域：PL 用和 GM 用不同；公開差分用畫出區域但不畫 GM 的框', () => {
    const d = withSecret();
    expect(hash(d, 'player')).not.toBe(hash(d, 'gm'));
    expect(hash(d, 'reveal')).not.toBe(hash(d, 'player'));
  });

  it('範例在四種環境都畫得出來', () => {
    const d = sampleDoc('station');
    for (const env of ['day', 'night', 'blackout', 'after'] as const)
      expect(() => hash(d, 'gm', env)).not.toThrow();
  });

  it('設備的位置：太寬時自動縮小、夾在區域裡；牆上的照高度；事件後倒下時傾斜', () => {
    const r = { x: 10, y: 0, w: 4, h: 6 };
    const wide = placeFixture(r, makeFixture('a', 'pipes', { rx: 0.95 }), false);
    expect(wide?.scale).toBeLessThan(1);
    expect((wide?.x ?? 0) + (wide?.w ?? 0) / 2).toBeLessThanOrEqual(14 - 0.32 + 1e-9);
    const win = placeFixture(
      { x: 0, y: 0, w: 12, h: 6 },
      makeFixture('a', 'window', { ry: 0.5 }),
      false,
    );
    expect(win?.y).toBeCloseTo(0.52 + 0.5 * (6 - 0.52 - 0.34) + 1, 5);
    const fallen = placeFixture(
      { x: 0, y: 0, w: 12, h: 6 },
      { ...makeFixture('a', 'shelf'), upset: true },
      true,
    );
    expect(fallen?.tilt).not.toBe(0);
    expect(
      placeFixture(
        { x: 0, y: 0, w: 12, h: 6 },
        { ...makeFixture('a', 'shelf'), upset: true },
        false,
      )?.tilt,
    ).toBe(0);
  });
});

describe('備註的換行（F50）', () => {
  /* 記錄畫布量字：中文一個字 1 個字級寬、英數 0.6 個字級 */
  const ctx = () => recordingCanvas().getContext('2d');
  const s = { size: 1 };

  it('中文一個字一個字排；英數連在一起的不切開，在空白處換行', () => {
    expect(wrapText(ctx(), '一二三四五六七', 3, s, 8)).toEqual(['一二三', '四五六', '七']);
    expect(wrapText(ctx(), 'key room B1F', 4, s, 8)).toEqual(['key', 'room', 'B1F']);
    expect(wrapText(ctx(), '地下 B1F 倉庫', 4, s, 8)).toEqual(['地下', 'B1F 倉', '庫']);
  });

  it('一個字本身就太長時才切開；空白與空字串', () => {
    expect(wrapText(ctx(), 'abcdefghij', 3, s, 8)).toEqual(['abcde', 'fghij']);
    expect(wrapText(ctx(), '   ', 3, s, 8)).toEqual(['']);
  });

  it('超過最多行數時，最後一行接上剩下的字並加「…」', () => {
    const lines = wrapText(ctx(), '一二三四五六七八九', 3, s, 2);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe('一二三');
    expect(lines[1].endsWith('…')).toBe(true);
    const words = wrapText(ctx(), 'aa bb cc dd ee ff', 3.1, s, 2);
    expect(words[0]).toBe('aa bb');
    expect(words[1]).toMatch(/^cc d.*…$/);
  });
});
