/**
 * 示範封面（規格 5. D3）：本站自己畫的「星空下的二十面骰」，會隨循環的相位動（星星閃爍、骰子漂浮、
 * 流星、地圖上的虛線路徑）。沒有放封面時使用；整張由程式畫，不含任何外部素材。
 * 相位 ph 從 0 到 2π 正好一輪，首尾銜接。
 */
import type { PaletteColor } from './theme';

export const DEMO_SIZE = 1200;
const TAU = Math.PI * 2;

/** 示範封面固定的鮮豔色（重點色從這裡算）：金色 */
export const DEMO_VIBRANT: PaletteColor = { h: 40 / 360, s: 0.78, l: 0.6, n: 0.2 };

interface Star {
  x: number;
  y: number;
  r: number;
  k: number;
  p: number;
}

/** 決定性亂數（同樣的種子永遠同樣的星空） */
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

const STARS: Star[] = (() => {
  const rnd = seeded(20261006);
  return Array.from({ length: 90 }, () => ({
    x: rnd() * DEMO_SIZE,
    y: rnd() * DEMO_SIZE * 0.72,
    r: 1.2 + rnd() * 3.2,
    k: 1 + Math.floor(rnd() * 3),
    p: rnd() * TAU,
  }));
})();

/** 折線（第一點 moveTo、其餘 lineTo） */
function polyline(g: CanvasRenderingContext2D, pts: readonly (readonly [number, number])[]) {
  pts.forEach(([x, y], i) => {
    if (i) g.lineTo(x, y);
    else g.moveTo(x, y);
  });
}

/** 二十面骰正面看到的輪廓（六角形）與面（中央三角形＋周圍的三角形） */
function d20(g: CanvasRenderingContext2D, R: number) {
  const hex = Array.from({ length: 6 }, (_, i) => {
    const a = -Math.PI / 2 + (i * TAU) / 6;
    return [Math.cos(a) * R, Math.sin(a) * R] as const;
  });
  const tri = Array.from({ length: 3 }, (_, i) => {
    const a = Math.PI / 2 + (i * TAU) / 3;
    return [Math.cos(a) * R * 0.56, Math.sin(a) * R * 0.56] as const;
  });
  const body = g.createLinearGradient(-R, -R, R, R);
  body.addColorStop(0, '#ffe6a6');
  body.addColorStop(0.5, '#e0a83f');
  body.addColorStop(1, '#9a5b1f');
  g.beginPath();
  polyline(g, hex);
  g.closePath();
  g.fillStyle = body;
  g.fill();
  /* 周圍的面：深淺交錯 */
  const faces: [number, number, number][] = [
    [0, 1, -1],
    [1, 2, 0],
    [2, 3, -1],
    [3, 4, 1],
    [4, 5, -1],
    [5, 0, 2],
  ];
  faces.forEach(([a, b, t], i) => {
    g.beginPath();
    g.moveTo(hex[a][0], hex[a][1]);
    g.lineTo(hex[b][0], hex[b][1]);
    const p = t >= 0 ? tri[t] : tri[(Math.floor(i / 2) + 2) % 3];
    g.lineTo(p[0], p[1]);
    g.closePath();
    g.fillStyle = i % 2 ? 'rgba(255,255,255,0.16)' : 'rgba(80,30,0,0.18)';
    g.fill();
  });
  g.beginPath();
  polyline(g, tri);
  g.closePath();
  g.fillStyle = 'rgba(255,248,225,0.55)';
  g.fill();
  g.lineJoin = 'round';
  g.lineWidth = R * 0.025;
  g.strokeStyle = 'rgba(70,32,6,0.85)';
  g.beginPath();
  polyline(g, hex);
  g.closePath();
  for (const [x, y] of hex) {
    let best = tri[0];
    let bd = Number.POSITIVE_INFINITY;
    for (const t of tri) {
      const d = Math.hypot(t[0] - x, t[1] - y);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    g.moveTo(x, y);
    g.lineTo(best[0], best[1]);
  }
  polyline(g, tri);
  g.closePath();
  g.stroke();
  g.fillStyle = '#4a2106';
  g.font = `800 ${Math.round(R * 0.42)}px "Noto Sans TC", "Microsoft JhengHei", "PingFang TC", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('20', 0, R * 0.04);
}

/** 畫一格示範封面（ph＝0～2π） */
export function drawDemoCover(g: CanvasRenderingContext2D, ph: number): void {
  const S = DEMO_SIZE;
  const u = (((ph / TAU) % 1) + 1) % 1;
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';

  /* 夜空 */
  const sky = g.createLinearGradient(0, 0, 0, S);
  sky.addColorStop(0, '#0d1433');
  sky.addColorStop(0.55, '#2b2364');
  sky.addColorStop(1, '#6b2f57');
  g.fillStyle = sky;
  g.fillRect(0, 0, S, S);

  /* 月亮與光暈 */
  const halo = g.createRadialGradient(860, 300, 60, 860, 300, 420);
  halo.addColorStop(0, 'rgba(255,226,170,0.55)');
  halo.addColorStop(1, 'rgba(255,226,170,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, S, S);
  g.fillStyle = '#f6e3b4';
  g.beginPath();
  g.arc(860, 300, 150, 0, TAU);
  g.fill();
  g.fillStyle = 'rgba(214,180,120,0.45)';
  for (const [x, y, r] of [
    [810, 260, 30],
    [905, 350, 22],
    [880, 240, 14],
  ] as const) {
    g.beginPath();
    g.arc(x, y, r, 0, TAU);
    g.fill();
  }

  /* 星星（每顆以整數倍的速度閃，循環銜接） */
  for (const s of STARS) {
    const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(ph * s.k + s.p));
    g.fillStyle = `rgba(255,248,230,${a.toFixed(3)})`;
    g.beginPath();
    g.arc(s.x, s.y, s.r, 0, TAU);
    g.fill();
  }

  /* 流星：每輪的 10%～40% 劃過 */
  if (u > 0.1 && u < 0.4) {
    const f = (u - 0.1) / 0.3;
    const x = 140 + f * 560;
    const y = 120 + f * 240;
    const tail = g.createLinearGradient(x - 220, y - 94, x, y);
    tail.addColorStop(0, 'rgba(255,255,255,0)');
    tail.addColorStop(1, `rgba(255,255,255,${(Math.sin(f * Math.PI) * 0.9).toFixed(3)})`);
    g.strokeStyle = tail;
    g.lineWidth = 5;
    g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x - 220, y - 94);
    g.lineTo(x, y);
    g.stroke();
  }

  /* 遠山與城堡的剪影 */
  g.fillStyle = '#1d1640';
  g.beginPath();
  g.moveTo(0, 900);
  g.lineTo(180, 780);
  g.lineTo(330, 860);
  g.lineTo(520, 740);
  g.lineTo(720, 850);
  g.lineTo(900, 760);
  g.lineTo(1200, 880);
  g.lineTo(1200, 1200);
  g.lineTo(0, 1200);
  g.closePath();
  g.fill();
  g.fillStyle = '#120d2b';
  g.fillRect(140, 760, 70, 200);
  g.fillRect(250, 800, 120, 160);
  g.beginPath();
  g.moveTo(130, 760);
  g.lineTo(175, 690);
  g.lineTo(220, 760);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,205,120,0.85)';
  g.fillRect(166, 800, 16, 26);
  g.fillRect(300, 840, 18, 24);
  g.fillStyle = '#120d2b';
  g.beginPath();
  g.moveTo(0, 1000);
  g.quadraticCurveTo(400, 900, 760, 990);
  g.quadraticCurveTo(1000, 1050, 1200, 960);
  g.lineTo(1200, 1200);
  g.lineTo(0, 1200);
  g.closePath();
  g.fill();

  /* 地圖上的路徑（虛線往前流動） */
  g.save();
  g.setLineDash([26, 22]);
  g.lineDashOffset = -u * 48 * 4;
  g.strokeStyle = 'rgba(255,214,140,0.8)';
  g.lineWidth = 7;
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(90, 1150);
  g.bezierCurveTo(330, 1030, 520, 1140, 700, 1060);
  g.bezierCurveTo(860, 990, 980, 1100, 1120, 1020);
  g.stroke();
  g.restore();
  g.fillStyle = '#ffd68c';
  g.beginPath();
  const mx = 1120;
  const my = 1020;
  g.moveTo(mx, my - 34);
  g.lineTo(mx + 14, my - 4);
  g.lineTo(mx, my + 6);
  g.lineTo(mx - 14, my - 4);
  g.closePath();
  g.fill();

  /* 二十面骰：漂浮、微微轉動、底下的影子 */
  const bob = Math.sin(ph) * 22;
  const cx = 470;
  const cy = 560 + bob;
  const shadow = g.createRadialGradient(470, 930, 10, 470, 930, 230);
  shadow.addColorStop(0, `rgba(0,0,0,${(0.42 - bob / 200).toFixed(3)})`);
  shadow.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = shadow;
  g.beginPath();
  g.ellipse(470, 930, 240, 60, 0, 0, TAU);
  g.fill();
  const glow = g.createRadialGradient(cx, cy, 80, cx, cy, 380);
  glow.addColorStop(0, 'rgba(255,200,110,0.35)');
  glow.addColorStop(1, 'rgba(255,200,110,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, S, S);
  g.translate(cx, cy);
  g.rotate(Math.sin(ph) * 0.08 + 0.12);
  d20(g, 260);
  g.restore();
}
