/**
 * 範例圖（本站自己畫的假截圖：調查紀錄的視窗，文字是自己寫的虛構內容）與「示範演出」的框。
 * 示範的框依畫出來的字的位置（measureText）決定，換了字型也對得上。
 */
import { ensureFont } from '@/core/fonts';
import { makeCanvas, roundRectPath } from '@/core/image';
import { type Frame, initialDefaults, newFrameId, type Rect } from './model';
import { UI_FONT_STACK } from './render';

export const SAMPLE_SIZE = { width: 1280, height: 820 } as const;

const BODY = [
  '晚上九點十五分，我們從後門進入廢棄的舊診所。',
  '候診室積滿灰塵，掛號櫃檯上的登記簿卻是新的。',
  '最後一筆寫著「沈曉雯」，日期正是她失蹤的那一天。',
  '二樓走廊盡頭的病房門上，有三道很深的抓痕。',
  '門縫裡傳出微弱的鐘聲，像是有人在數著什麼。',
  '我們在病床底下找到一張紙條：「不要相信穿白衣的人」。',
];

export interface SampleAnchors {
  /** 登記簿那兩行（放大框） */
  register: Rect;
  /** 「沈曉雯」 */
  name: Rect;
  /** 「日期正是她失蹤的那一天」 */
  date: Rect;
  /** 「不要相信穿白衣的人」 */
  note: Rect;
  /** 記錄者的名字 */
  author: Rect;
}

export interface SampleImage {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  anchors: SampleAnchors;
}

const font = (weight: number, px: number) => `${weight} ${px}px ${UI_FONT_STACK}`;

/** 畫範例圖（先等介面字型，等不到就用系統字型） */
export async function drawSample(): Promise<SampleImage> {
  await Promise.all([
    ensureFont('Noto Sans TC', 400, BODY.join('')),
    ensureFont('Noto Sans TC', 700, '調查紀錄霧澤町失蹤案檔案機密'),
  ]).catch(() => undefined);
  const { width: W, height: H } = SAMPLE_SIZE;
  const c = makeCanvas(W, H);
  const g = c.getContext('2d') as CanvasRenderingContext2D | null;
  if (!g) throw new Error('canvas');

  /* 桌面與視窗 */
  g.fillStyle = '#d9d4c8';
  g.fillRect(0, 0, W, H);
  const win = { x: 40, y: 30, w: 1200, h: 760 };
  g.save();
  g.shadowColor = 'rgba(0,0,0,0.25)';
  g.shadowBlur = 24;
  g.shadowOffsetY = 8;
  g.fillStyle = '#fbf9f3';
  g.beginPath();
  roundRectPath(g, win.x, win.y, win.w, win.h, 14);
  g.fill();
  g.restore();
  g.save();
  g.beginPath();
  roundRectPath(g, win.x, win.y, win.w, win.h, 14);
  g.clip();
  /* 標題列 */
  g.fillStyle = '#2c313a';
  g.fillRect(win.x, win.y, win.w, 48);
  ['#ef6b5f', '#f2be4f', '#5fc365'].forEach((col, i) => {
    g.fillStyle = col;
    g.beginPath();
    g.arc(win.x + 26 + i * 22, win.y + 24, 7, 0, Math.PI * 2);
    g.fill();
  });
  g.fillStyle = '#e9edf3';
  g.font = font(500, 18);
  g.textBaseline = 'middle';
  g.fillText('調查紀錄｜霧澤町失蹤案（檔案 07）', win.x + 104, win.y + 25);
  /* 側欄 */
  const side = { x: win.x, y: win.y + 48, w: 240, h: win.h - 48 };
  g.fillStyle = '#efe9dd';
  g.fillRect(side.x, side.y, side.w, side.h);
  g.fillStyle = '#8a8172';
  g.font = font(700, 15);
  g.fillText('檔案', side.x + 24, side.y + 34);
  const items = ['01 委託內容', '02 關係人', '03 現場照片', '07 調查紀錄', '08 證物清單'];
  items.forEach((t, i) => {
    const y = side.y + 72 + i * 46;
    if (i === 3) {
      g.fillStyle = '#d8cdb6';
      g.beginPath();
      roundRectPath(g, side.x + 12, y - 18, side.w - 24, 36, 8);
      g.fill();
    }
    g.fillStyle = i === 3 ? '#2a2620' : '#5d5547';
    g.font = font(i === 3 ? 700 : 400, 17);
    g.fillText(t, side.x + 28, y);
  });
  g.restore();

  /* 本文 */
  const left = 300;
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#1d2230';
  g.font = font(700, 34);
  g.fillText('調查紀錄 No.07', left, 132);
  g.font = font(400, 17);
  g.fillStyle = '#5b5f68';
  g.fillText('日期：2026 年 10 月 19 日（週一）　天氣：霧', left, 174);
  g.fillText('地點：霧澤町　舊診所二樓', left, 202);
  const authorLabel = '記錄：調查員　';
  const authorName = '林澄';
  g.fillText(authorLabel + authorName, left, 230);
  const author: Rect = {
    x: left + g.measureText(authorLabel).width - 4,
    y: 230 - 17,
    w: g.measureText(authorName).width + 8,
    h: 23,
  };
  g.strokeStyle = '#d6d0c2';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(left, 254);
  g.lineTo(win.x + win.w - 50, 254);
  g.stroke();

  const px = 23;
  const lead = 44;
  const top = 300;
  g.font = font(400, px);
  g.fillStyle = '#25272d';
  BODY.forEach((t, i) => {
    g.fillText(t, left, top + i * lead);
  });
  const lineBox = (i: number) => ({ y: top + i * lead - px * 0.92, h: px * 1.22 });
  const span = (i: number, before: string, part: string, padX = 3): Rect => {
    const x = left + g.measureText(before).width;
    const lb = lineBox(i);
    return { x: x - padX, y: lb.y - 2, w: g.measureText(part).width + padX * 2, h: lb.h + 4 };
  };
  const l1 = lineBox(1);
  const l2 = lineBox(2);
  const regW = Math.max(g.measureText(BODY[1]).width, g.measureText(BODY[2]).width);
  const register: Rect = { x: left - 16, y: l1.y - 12, w: regW + 32, h: l2.y + l2.h - l1.y + 24 };
  const name = span(2, '最後一筆寫著「', '沈曉雯');
  const date = span(2, '最後一筆寫著「沈曉雯」，', '日期正是她失蹤的那一天');
  const note = span(5, '我們在病床底下找到一張紙條：「', '不要相信穿白衣的人', 1);

  /* 印章 */
  g.save();
  g.translate(1110, 150);
  g.rotate((-12 * Math.PI) / 180);
  g.strokeStyle = 'rgba(196, 40, 40, 0.85)';
  g.lineWidth = 4;
  g.strokeRect(-62, -30, 124, 60);
  g.fillStyle = 'rgba(196, 40, 40, 0.85)';
  g.font = font(700, 34);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('機密', 0, 2);
  g.restore();

  g.font = font(400, 15);
  g.fillStyle = '#9a9488';
  g.fillText('※ 本紀錄為虛構內容，供演出示範使用。', left, win.y + win.h - 34);

  const round = (r: Rect): Rect => ({
    x: Math.round(r.x),
    y: Math.round(r.y),
    w: Math.round(r.w),
    h: Math.round(r.h),
  });
  return {
    canvas: c,
    anchors: {
      register: round(register),
      name: round(name),
      date: round(date),
      note: round(note),
      author: round(author),
    },
  };
}

/** 示範演出：放大登記簿那兩行 → 依序剝開名字、畫螢光筆、在紙條下畫紅線；記錄者的名字一直打馬賽克 */
export function demoFrames(a: SampleAnchors): Frame[] {
  const d = initialDefaults();
  const ids: string[] = [];
  const id = () => {
    const v = newFrameId(ids);
    ids.push(v);
    return v;
  };
  return [
    { id: id(), kind: 'zoom', ...a.register, ...d.zoom, scale: 1.3 },
    { id: id(), kind: 'redact', ...a.name, ...d.redact, mode: 'reveal' },
    { id: id(), kind: 'marker', ...a.date, style: 'yellow', dir: 'h' },
    { id: id(), kind: 'marker', ...a.note, style: 'redLine', dir: 'h' },
    {
      id: id(),
      kind: 'redact',
      ...a.author,
      ...d.redact,
      style: 'mosaic',
      mode: 'static',
      grain: 8,
    },
  ];
}
