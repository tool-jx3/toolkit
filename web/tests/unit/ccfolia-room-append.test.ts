/**
 * @/ccfolia：只追加的房間資料（createAppendRoomData、buildRoomZip 收 room 是 {} 的資料）與訊息框的尺寸（scenario-text 加的）。
 */
import { describe, expect, it } from 'vitest';
import {
  buildRoomZip,
  checkRoomZip,
  createAppendRoomData,
  createNote,
  MESSAGE_BOX_LAYOUT,
  messageBoxSize,
  packRoomImage,
  ROOM_ENTITY_KINDS,
  readRoomZip,
} from '@/ccfolia';

const b64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const PNG = b64(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
);

describe('只追加的房間資料', () => {
  it('room 是 {}，其他類別依共用層的順序、沒給的是空物件', () => {
    const d = createAppendRoomData({
      notes: { n1: createNote({ name: 'a', text: 'b', iconUrl: '' }) },
    });
    expect(Object.keys(d.entities)).toEqual([...ROOM_ENTITY_KINDS]);
    expect(d.entities.room).toEqual({});
    expect(d.entities.notes.n1).toEqual({ name: 'a', text: 'b', order: 1, iconUrl: '' });
    expect(d).toMatchObject({ meta: { version: '1.1.0' }, resources: {} });
  });

  it('buildRoomZip 收只追加的資料：resources 依引用重建、自我檢查通過', async () => {
    const img = await packRoomImage(PNG, 'image/png');
    const data = createAppendRoomData({
      notes: {
        n1: createNote({ name: '甲', text: '一', iconUrl: img.name }),
        n2: createNote({ name: '乙', text: '二', iconUrl: 'https://example.com/x.png' }),
      },
    });
    const built = buildRoomZip(data, [img]);
    expect(built.data.entities.room).toEqual({});
    expect(built.data.resources).toEqual({ [img.name]: { type: 'image/png' } });
    expect(built.missing).toEqual([]);
    expect((await checkRoomZip(built.bytes)).ok).toBe(true);
    const read = readRoomZip(built.bytes);
    expect((read.json as typeof data).entities.notes.n2.iconUrl).toBe('https://example.com/x.png');
  });
});

describe('訊息框的尺寸（MESSAGE_BOX_LAYOUT）', () => {
  it('視窗寬 → 方框寬（最大 720、視窗寬 − 104）與立繪寬（240／180／120）', () => {
    expect(messageBoxSize(1280)).toEqual({ box: 720, portrait: 240 });
    expect(messageBoxSize(900)).toEqual({ box: 720, portrait: 240 });
    expect(messageBoxSize(899)).toEqual({ box: 720, portrait: 180 });
    expect(messageBoxSize(800)).toEqual({ box: 696, portrait: 180 });
    expect(messageBoxSize(599)).toEqual({ box: 495, portrait: 120 });
    expect(messageBoxSize(375)).toEqual({ box: 271, portrait: 120 });
    expect(MESSAGE_BOX_LAYOUT.logIconSize).toBe(40);
  });
});
