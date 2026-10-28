/**
 * 範例角色（本站自己做的：虛構的跑團角色名字、程式畫的簡單半身像）。按「載入範例」時才畫、存進圖片庫。
 */
import { canvasToBlob, makeCanvas } from '@/core/image';
import { type Bar, barOf, newId, type PartRole, segmentOf } from './logic';
import type { Ctx2D } from './paint';

export interface SampleSpec {
  name: string;
  height: number;
  hair: string[];
  /** 空陣列＝「無」（眼睛被瀏海遮住） */
  eye: string[];
  skin: string;
  outfit: string;
  accent?: string;
  back: string;
  theme: string;
}

export const SAMPLES: readonly SampleSpec[] = [
  {
    name: '林予安',
    height: 168,
    hair: ['#2a2a32'],
    eye: ['#8a5a3c'],
    skin: '#f2d3bd',
    outfit: '#3f4a5c',
    back: '#dfe6ee',
    theme: '#3f6fb0',
  },
  {
    name: '白澄',
    height: 172,
    hair: ['#ecebe6'],
    eye: ['#c43a3a'],
    skin: '#f5dccb',
    outfit: '#2b2b30',
    back: '#f1e3e3',
    theme: '#c43a3a',
  },
  {
    name: '夏千晴',
    height: 158,
    hair: ['#e9c04a'],
    eye: ['#3aa38a'],
    skin: '#f6d8c0',
    outfit: '#f0e6d2',
    accent: '#e8608f',
    back: '#eef2df',
    theme: '#e9c04a',
  },
  {
    name: '葉棠',
    height: 165,
    hair: ['#6a4231'],
    eye: ['#2e4a90', '#d9952e'],
    skin: '#e8bf9e',
    outfit: '#5f6e3d',
    back: '#e9e4d8',
    theme: '#2e4a90',
  },
  {
    name: '沈墨',
    height: 180,
    hair: ['#1d1e22', '#b8303f'],
    eye: ['#8f7fc0'],
    skin: '#efd2bf',
    outfit: '#1f2430',
    back: '#e4e1ea',
    theme: '#b8303f',
  },
  {
    name: '柯雨',
    height: 150,
    hair: ['#8a4fc4'],
    eye: [],
    skin: '#f3d9c8',
    outfit: '#c3b4e3',
    back: '#ece6f3',
    theme: '#8a4fc4',
  },
];

export const SAMPLE_SIZE = { width: 600, height: 800 } as const;

/** 臉的位置（範例圖上；頭像範圍取這一塊） */
const FACE = { cx: 300, cy: 300, size: 340 } as const;

/** 範例的頭像範圍：以臉為中心的正方形（ImageFrameDialog 的位置：蓋滿為 1、位移以框為 1） */
export function sampleAvatar() {
  const base = Math.min(SAMPLE_SIZE.width, SAMPLE_SIZE.height);
  const zoom = base / FACE.size;
  return {
    zoom,
    x: (SAMPLE_SIZE.width / 2 - FACE.cx) / FACE.size,
    y: (SAMPLE_SIZE.height / 2 - FACE.cy) / FACE.size,
    turns: 0,
  };
}

/** 畫一張範例的半身像（600 × 800） */
export function paintSample(ctx: Ctx2D, s: SampleSpec) {
  const { width: W, height: H } = SAMPLE_SIZE;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, s.back);
  g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const cx = FACE.cx;
  const cy = FACE.cy;
  const r = 120;
  const [hairA, hairB] = [s.hair[0], s.hair[1] ?? s.hair[0]];
  /* 身體 */
  ctx.fillStyle = s.outfit;
  ctx.beginPath();
  ctx.moveTo(cx - 230, H);
  ctx.quadraticCurveTo(cx - 220, cy + 210, cx - 70, cy + 175);
  ctx.lineTo(cx + 70, cy + 175);
  ctx.quadraticCurveTo(cx + 220, cy + 210, cx + 230, H);
  ctx.closePath();
  ctx.fill();
  /* 脖子 */
  ctx.fillStyle = s.skin;
  ctx.fillRect(cx - 34, cy + 90, 68, 100);
  /* 後面的頭髮（雙色：左右兩半） */
  const back = (color: string, from: number, to: number) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(from, 0, to - from, H);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy + 30, r * 1.25, r * 1.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };
  back(hairA, 0, cx);
  back(hairB, cx, W);
  /* 臉 */
  ctx.fillStyle = s.skin;
  ctx.beginPath();
  ctx.ellipse(cx, cy + 14, r * 0.88, r * 1.02, 0, 0, Math.PI * 2);
  ctx.fill();
  /* 眼睛（「無」的時候被瀏海遮住） */
  const bangsLow = s.eye.length === 0;
  s.eye.slice(0, 2).forEach((_, i) => {
    const color = s.eye[i] ?? s.eye[0];
    const ex = cx + (i === 0 ? -42 : 42);
    const ey = cy + 30;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(ex, ey, 22, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(ex, ey + 1, 13, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex + 4, ey - 5, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });
  if (s.eye.length === 1) {
    /* 只有一個瞳色：右眼同色 */
    const ex = cx + 42;
    const ey = cy + 30;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(ex, ey, 22, 16, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = s.eye[0];
    ctx.beginPath();
    ctx.ellipse(ex, ey + 1, 13, 15, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex + 4, ey - 5, 3.5, 0, Math.PI * 2);
    ctx.fill();
  }
  /* 嘴 */
  ctx.strokeStyle = '#b06b5e';
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy + 74, 14, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();
  /* 瀏海 */
  const bangs = (color: string, from: number, to: number) => {
    ctx.save();
    ctx.beginPath();
    ctx.rect(from, 0, to - from, H);
    ctx.clip();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(cx, cy - 50, r * 1.05, r * 0.72, 0, Math.PI, 0);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(cx - r * 1.05, cy - 50);
    ctx.quadraticCurveTo(cx - 40, cy + (bangsLow ? 60 : 10), cx + 30, cy - 30);
    ctx.quadraticCurveTo(cx + 70, cy + (bangsLow ? 60 : 0), cx + r * 1.05, cy - 50);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };
  bangs(hairA, 0, cx);
  bangs(hairB, cx, W);
  /* 飾品 */
  if (s.accent) {
    ctx.fillStyle = s.accent;
    ctx.beginPath();
    ctx.ellipse(cx + 95, cy - 95, 34, 20, -0.5, 0, Math.PI * 2);
    ctx.ellipse(cx + 135, cy - 70, 30, 18, 0.6, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** 範例角色的部位（配色條：髮色、瞳色、膚色、服裝） */
export function sampleBar(s: SampleSpec, image: Bar['image']): Bar {
  const parts: { role: PartRole; color: string; ratio: number; none?: boolean; memo?: string }[] = [
    ...s.hair.map((color) => ({ role: 'hair' as const, color, ratio: 1.2 / s.hair.length })),
    ...(s.eye.length
      ? s.eye.map((color) => ({ role: 'eye' as const, color, ratio: 0.4 / s.eye.length }))
      : [{ role: 'eye' as const, color: '#000000', ratio: 0.4, none: true }]),
    { role: 'skin', color: s.skin, ratio: 0.8 },
    { role: 'outfit', color: s.outfit, ratio: 2 },
    ...(s.accent ? [{ role: 'other' as const, color: s.accent, ratio: 0.3, memo: '緞帶' }] : []),
  ];
  return barOf(
    newId('bar'),
    s.height,
    parts.map((p) =>
      segmentOf(newId('seg'), p.color, Math.round(p.ratio * 1000) / 1000, {
        role: p.role,
        none: !!p.none,
        memo: p.memo ?? '',
      }),
    ),
    { name: s.name, image, avatar: image ? sampleAvatar() : null, theme: s.theme },
  );
}

/** 畫好一張範例圖（PNG） */
export async function sampleImage(s: SampleSpec): Promise<Blob> {
  const c = makeCanvas(SAMPLE_SIZE.width, SAMPLE_SIZE.height);
  paintSample(c.getContext('2d') as Ctx2D, s);
  return canvasToBlob(c);
}
