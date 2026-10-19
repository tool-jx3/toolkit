/**
 * 證件範本（二）：刑警證（橫式）、會員卡（橫式、漸層底）、偵探執照（1920 年代，直式）。
 * 警徽、標誌都是本站畫的通用圖形（星形、盾形），不用真實機關的徽章。
 */
import { alpha, mix, onColor, seededRandom, shade, tint } from '../colors';
import {
  barcode,
  circle,
  field,
  fillRRect,
  line,
  paragraph,
  photo,
  qr,
  stamp,
  starPath,
  strokeRRect,
  text,
} from '../kit';
import {
  band,
  cap,
  cardBarcode,
  fillBleed,
  guilloche,
  type IdEnv,
  type IdFaces,
  labeled,
  rows,
} from './common';

/* ======================================================================
 * 刑警證（橫式 473 × 297）
 * ==================================================================== */

/** 通用的星形徽章（圓＋五角星） */
function badge(e: IdEnv, cx: number, cy: number, r: number, color: string, fill?: string) {
  const { ctx } = e;
  ctx.save();
  circle(ctx, cx, cy, r);
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.09;
  ctx.stroke();
  circle(ctx, cx, cy, r * 0.8);
  ctx.lineWidth = r * 0.04;
  ctx.stroke();
  starPath(ctx, cx, cy + r * 0.03, r * 0.58, r * 0.24, 5);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
}

function policeTones(e: IdEnv) {
  const { c, dk } = e;
  return {
    bg: dk ? '#0c1428' : '#f4f6fb',
    fg: dk ? '#eef1f8' : '#141a2b',
    mu: dk ? 'rgba(238,241,248,0.55)' : '#6b7286',
    ln: dk ? 'rgba(255,255,255,0.14)' : 'rgba(20,26,43,0.12)',
    head: dk ? mix(c, '#000000', 0.25) : c,
    gold: '#d4a83c',
  };
}

export const police: IdFaces = {
  front(e) {
    const { ctx, W, H, S, c, dk } = e;
    const t = policeTones(e);
    fillBleed(e, t.bg);
    guilloche(e, -e.B, 70, W + e.B * 2, H - 70, alpha(c, dk ? 0.2 : 0.12), 9);
    /* 淡淡的大徽章 */
    ctx.save();
    ctx.globalAlpha = dk ? 0.08 : 0.06;
    badge(e, W - 70, 186, 92, dk ? '#ffffff' : c);
    ctx.restore();
    band(e, 0, 62, t.head);
    band(e, 62, 64.5, t.gold);
    const oc = onColor(t.head);
    badge(e, S + 15, 31, 15, t.gold);
    const tx = S + 38;
    field(e, 'pol_unit', tx, 29, { size: 13, weight: 900, color: oc, maxWidth: 230, shrink: 0.7 });
    field(e, 'pol_division', tx, 45, {
      size: 8.5,
      weight: 500,
      color: alpha(oc, 0.85),
      maxWidth: 240,
    });
    text(e, '刑警證', W - S, 40, {
      font: 'serif',
      size: 19,
      weight: 900,
      color: oc,
      align: 'right',
      spacing: 3,
    });
    /* 照片 */
    const px = S;
    const py = 80;
    strokeRRect(ctx, px - 3, py - 3, 108, 140, 3, alpha(t.gold, 0.8), 1.2);
    photo(e, px, py, 102, 134, {
      radius: 2,
      bg: dk ? '#1a2440' : '#e4e8f1',
      silhouette: dk ? '#2b3756' : '#c7cfdf',
    });
    /* 右邊的資料 */
    const rx = px + 122;
    const rw = W - S - rx;
    cap(e, '姓名 NAME', rx, 92, t.mu);
    field(e, 'name', rx, 120, {
      size: 24,
      weight: 900,
      color: t.fg,
      maxWidth: rw * 0.62,
      shrink: 0.62,
    });
    const role = e.value('pol_rank');
    if (role || e.preview) {
      fillRRect(ctx, rx + rw * 0.66, 102, rw * 0.34, 20, 3, alpha(c, dk ? 0.45 : 0.14));
      field(e, 'pol_rank', rx + rw * 0.83, 116, {
        size: 9.5,
        weight: 700,
        color: dk ? '#ffffff' : c,
        align: 'center',
        maxWidth: rw * 0.32,
      });
    }
    line(ctx, rx, 134, W - S, 134, t.ln);
    labeled(e, '證號 ID NO.', 'pol_no', rx, 152, {
      width: rw * 0.55,
      capColor: t.mu,
      color: t.fg,
      size: 11.5,
      mono: true,
    });
    labeled(e, '血型', 'pol_blood', rx + rw * 0.6, 152, {
      width: rw * 0.4,
      capColor: t.mu,
      color: t.fg,
      size: 11.5,
    });
    labeled(e, '發證日期 ISSUED', 'pol_issued', rx, 190, {
      width: rw,
      capColor: t.mu,
      color: t.fg,
      size: 10.5,
    });
    cardBarcode(e, rx - 6, 224, rw + 6, 24, t.fg);
    band(e, H - 26, H, t.head);
    band(e, H - 28.5, H - 26, t.gold);
    text(e, '本證為執行職務之識別，請勿轉借', W / 2, H - 9, {
      size: 7.5,
      weight: 700,
      color: alpha(oc, 0.85),
      align: 'center',
      spacing: 2,
    });
  },
  back(e) {
    const { ctx, W, H, S, c, dk } = e;
    const t = policeTones(e);
    fillBleed(e, t.bg);
    guilloche(e, -e.B, -e.B, W + e.B * 2, H + e.B * 2, alpha(c, dk ? 0.16 : 0.09), 11);
    ctx.save();
    ctx.globalAlpha = dk ? 0.07 : 0.05;
    badge(e, W / 2, H / 2, 110, dk ? '#ffffff' : c);
    ctx.restore();
    band(e, 0, 8, t.head);
    text(e, '持證須知', S, 40, { size: 13, weight: 900, color: t.fg, spacing: 1 });
    paragraph(
      e,
      '持證人為本局刑事警察，執行職務時得出示本證以資識別。本證不得轉借、塗改或作職務以外之使用；遺失時應立即報告所屬單位。',
      S,
      60,
      { size: 8, color: t.mu, width: 236, lineHeight: 13.5, maxLines: 6 },
    );
    rows(
      e,
      [
        ['姓名', 'name'],
        ['單位', 'pol_unit'],
        ['職稱', 'pol_rank'],
        ['證號', 'pol_no'],
      ],
      S,
      150,
      236,
      { mu: t.mu, fg: t.fg, ln: t.ln, rowH: 21 },
    );
    const qx = W - S - 92;
    strokeRRect(ctx, qx - 0.5, 27.5, 93, 93, 6, t.ln, 1);
    qr(e, e.qrContent, qx, 28, 92, { radius: 6, pad: 6 });
    cap(e, '持證人簽名 SIGNATURE', qx - 100, 150, t.mu);
    line(ctx, qx - 100, 182, W - S, 182, alpha(t.fg, 0.5), 0.8);
    cardBarcode(e, qx - 106, 196, W - S - qx + 106, 26, t.fg);
    stamp(e, W - S - 30, 248, 22, alpha('#c8372d', 0.95), '核發', { rotate: -10 });
    band(e, H - 10, H, t.head);
  },
};

/* ======================================================================
 * 會員卡（橫式、漸層底）
 * ==================================================================== */

function memberBg(e: IdEnv) {
  const { ctx, W, H, dk } = e;
  const g = ctx.createLinearGradient(0, -e.B, 0, H + e.B);
  g.addColorStop(0, dk ? shade(e.g1, 0.72) : e.g1);
  g.addColorStop(1, dk ? shade(e.g2, 0.8) : e.g2);
  fillBleed(e, g);
  /* 圓點紋＋兩個大圓 */
  ctx.save();
  ctx.fillStyle = alpha('#ffffff', dk ? 0.05 : 0.4);
  for (let y = -e.B + 6; y < H + e.B; y += 14)
    for (let x = -e.B + 6 + ((y / 14) % 2) * 7; x < W + e.B; x += 14) {
      circle(ctx, x, y, 0.9);
      ctx.fill();
    }
  circle(ctx, W - 60, 30, 120);
  ctx.fillStyle = alpha('#ffffff', dk ? 0.05 : 0.28);
  ctx.fill();
  circle(ctx, W + 10, 150, 90);
  ctx.fillStyle = alpha('#ffffff', dk ? 0.04 : 0.22);
  ctx.fill();
  ctx.restore();
}

/** 四角星的閃光 */
function sparkle(e: IdEnv, cx: number, cy: number, r: number, color: string) {
  const { ctx } = e;
  ctx.beginPath();
  ctx.moveTo(cx, cy - r);
  ctx.quadraticCurveTo(cx + r * 0.12, cy - r * 0.12, cx + r, cy);
  ctx.quadraticCurveTo(cx + r * 0.12, cy + r * 0.12, cx, cy + r);
  ctx.quadraticCurveTo(cx - r * 0.12, cy + r * 0.12, cx - r, cy);
  ctx.quadraticCurveTo(cx - r * 0.12, cy - r * 0.12, cx, cy - r);
  ctx.fillStyle = color;
  ctx.fill();
}

function memberTones(e: IdEnv) {
  const { c, dk } = e;
  return {
    ink: dk ? '#ffffff' : mix(shade(c, 0.55), '#3b1d2a', 0.3),
    mu: dk ? tint(c, 0.45) : shade(c, 0.2),
    deep: dk ? tint(c, 0.55) : shade(c, 0.15),
  };
}

export const member: IdFaces = {
  front(e) {
    const { ctx, W, S, c, dk } = e;
    const m = memberTones(e);
    memberBg(e);
    sparkle(e, W - 150, 34, 9, alpha('#ffffff', 0.9));
    sparkle(e, W - 128, 52, 5, alpha(c, 0.6));
    sparkle(e, W * 0.52, 100, 6, alpha('#ffffff', 0.8));
    field(e, 'mem_store', S, 52, {
      font: 'serif',
      size: 27,
      weight: 900,
      color: m.deep,
      maxWidth: 260,
      shrink: 0.62,
    });
    field(e, 'mem_storeEn', S + 1, 68, {
      size: 7,
      weight: 700,
      color: m.mu,
      spacing: 2.4,
      upper: true,
      maxWidth: 260,
    });
    /* 等級 */
    const tierW = 92;
    fillRRect(ctx, W - S - tierW, 26, tierW, 24, 12, c);
    field(e, 'mem_tier', W - S - tierW / 2, 42, {
      size: 10,
      weight: 900,
      color: onColor(c),
      align: 'center',
      maxWidth: tierW - 14,
      spacing: 1,
    });
    /* 圓形照片 */
    const r = 38;
    const cx = W - S - r - 6;
    const cy = 136;
    circle(ctx, cx, cy, r + 4);
    ctx.fillStyle = dk ? alpha('#ffffff', 0.15) : '#ffffff';
    ctx.fill();
    photo(e, cx - r, cy - r, r * 2, r * 2, {
      radius: r,
      bg: dk ? shade(c, 0.6) : tint(c, 0.82),
      silhouette: dk ? shade(c, 0.35) : tint(c, 0.55),
    });
    cap(e, '會員姓名 MEMBER', S, 112, m.mu);
    field(e, 'name', S, 136, {
      size: 19,
      weight: 900,
      color: m.ink,
      maxWidth: cx - r - S - 20,
      shrink: 0.62,
    });
    field(e, 'mem_no', S, 204, {
      font: 'mono',
      size: 18,
      weight: 500,
      color: m.ink,
      spacing: 1.6,
      maxWidth: W - S * 2,
      shrink: 0.7,
    });
    const cols: [string, string][] = [
      ['入會日期 SINCE', 'mem_since'],
      ['有效期限 VALID', 'mem_expires'],
      ['點數 POINTS', 'mem_points'],
    ];
    const cw = (W - S * 2) / 3;
    cols.forEach(([label, key], i) => {
      labeled(e, label, key, S + i * cw, 236, {
        width: cw - 10,
        capColor: m.mu,
        color: m.ink,
        size: 10.5,
      });
    });
  },
  back(e) {
    const { ctx, W, S, c, dk } = e;
    const m = memberTones(e);
    memberBg(e);
    /* 磁條 */
    band(e, 22, 62, dk ? '#0b0b0d' : '#1f1d22');
    /* 簽名條 */
    cap(e, '持卡人簽名 SIGNATURE', S, 82, m.mu);
    ctx.save();
    ctx.beginPath();
    ctx.rect(S, 88, 250, 28);
    ctx.clip();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(S, 88, 250, 28);
    ctx.strokeStyle = alpha(c, 0.25);
    ctx.lineWidth = 3;
    for (let k = -40; k < 260; k += 9) {
      ctx.beginPath();
      ctx.moveTo(S + k, 118);
      ctx.lineTo(S + k + 30, 86);
      ctx.stroke();
    }
    ctx.restore();
    field(e, 'mem_no', S + 260, 106, {
      font: 'mono',
      size: 8.5,
      color: m.ink,
      maxWidth: W - S * 2 - 260,
    });
    text(e, '會員權益', S, 146, { size: 11, weight: 900, color: m.deep, spacing: 1 });
    const notes = [
      '消費滿額累積點數，點數可折抵消費。',
      '生日當月享飲品招待一杯。',
      '本卡限本人使用，請妥善保管。',
    ];
    notes.forEach((n, i) => {
      sparkle(e, S + 4, 162 + i * 17 - 3.5, 3.5, c);
      text(e, n, S + 13, 162 + i * 17, { size: 8.5, color: m.ink, maxWidth: 270 });
    });
    fillRRect(ctx, S, 222, 270, 50, 8, '#ffffff');
    barcode(e, e.code, S + 4, 228, 262, 30, '#1f1d22', { key: e.tpl.codeKey });
    field(e, 'mem_no', S + 135, 268, {
      font: 'mono',
      size: 6.5,
      color: '#55505a',
      align: 'center',
      spacing: 1.2,
      maxWidth: 250,
    });
    qr(e, e.qrContent, W - S - 96, 152, 96, { radius: 8, pad: 7 });
    field(e, 'mem_store', W - S - 48, 268, {
      font: 'serif',
      size: 9,
      weight: 700,
      color: m.deep,
      align: 'center',
      maxWidth: 110,
    });
  },
};

/* ======================================================================
 * 偵探執照（1920 年代，直式）
 * ==================================================================== */

function paper(e: IdEnv) {
  const { ctx, W, H, dk, c } = e;
  const base = dk ? mix(shade(c, 0.75), '#1d1712', 0.5) : mix('#efe3c8', tint(c, 0.85), 0.25);
  fillBleed(e, base);
  /* 斑點 */
  const rnd = seededRandom('paper-speckles');
  ctx.save();
  for (let i = 0; i < 420; i++) {
    const x = -e.B + rnd() * (W + e.B * 2);
    const y = -e.B + rnd() * (H + e.B * 2);
    const r = 0.3 + rnd() * 1.1;
    ctx.fillStyle = alpha(dk ? '#000000' : '#6b4a26', 0.05 + rnd() * 0.12);
    circle(ctx, x, y, r);
    ctx.fill();
  }
  /* 四周變暗 */
  const g = ctx.createRadialGradient(
    W / 2,
    H / 2,
    Math.min(W, H) * 0.35,
    W / 2,
    H / 2,
    Math.max(W, H) * 0.75,
  );
  g.addColorStop(0, alpha('#000000', 0));
  g.addColorStop(1, alpha(dk ? '#000000' : '#5a3a17', dk ? 0.45 : 0.28));
  ctx.fillStyle = g;
  ctx.fillRect(-e.B, -e.B, W + e.B * 2, H + e.B * 2);
  ctx.restore();
  return {
    base,
    ink: dk ? '#efe2c4' : '#2e2216',
    mu: dk ? 'rgba(239,226,196,0.62)' : 'rgba(46,34,22,0.62)',
    rule: dk ? alpha('#efe2c4', 0.5) : alpha(shade(c, 0.2), 0.75),
    red: dk ? '#e0614f' : '#b3261e',
  };
}

/** 雙線外框＋四角的菱形 */
function frame(e: IdEnv, color: string) {
  const { ctx, W, H } = e;
  strokeRRect(ctx, 9, 9, W - 18, H - 18, 2, color, 1.6);
  strokeRRect(ctx, 13.5, 13.5, W - 27, H - 27, 1, color, 0.6);
  for (const [x, y] of [
    [13.5, 13.5],
    [W - 13.5, 13.5],
    [13.5, H - 13.5],
    [W - 13.5, H - 13.5],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x, y - 5);
    ctx.lineTo(x + 5, y);
    ctx.lineTo(x, y + 5);
    ctx.lineTo(x - 5, y);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
  }
}

/** 照片的相角（舊相簿的三角形） */
function photoCorners(e: IdEnv, x: number, y: number, w: number, h: number, color: string) {
  const { ctx } = e;
  const s = 13;
  ctx.fillStyle = color;
  for (const [cx, cy, dx, dy] of [
    [x, y, 1, 1],
    [x + w, y, -1, 1],
    [x, y + h, 1, -1],
    [x + w, y + h, -1, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(cx - dx * 3, cy - dy * 3);
    ctx.lineTo(cx + dx * s, cy - dy * 3);
    ctx.lineTo(cx - dx * 3, cy + dy * s);
    ctx.closePath();
    ctx.fill();
  }
}

/** 打字機的一列：名稱＋底線上的值 */
function typedLine(e: IdEnv, label: string, key: string, y: number, color: string, rule: string) {
  const { W, S } = e;
  const lw = text(e, label, S + 6, y, { font: 'serif', size: 8.5, weight: 700, color }).width;
  const x0 = S + 6 + lw + 8;
  line(e.ctx, x0, y + 3, W - S - 6, y + 3, rule, 0.7);
  field(e, key, x0 + 4, y, { font: 'type', size: 10, color, maxWidth: W - S - 10 - x0 });
}

/** 簽名的草寫線 */
function scribble(e: IdEnv, x: number, y: number, w: number, color: string, seed: string) {
  const { ctx } = e;
  const rnd = seededRandom(seed);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.1;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  let px = x;
  while (px < x + w) {
    const nx = px + 8 + rnd() * 10;
    ctx.bezierCurveTo(px + 3, y - 10 - rnd() * 6, nx - 3, y + 6 + rnd() * 4, nx, y - rnd() * 3);
    px = nx;
  }
  ctx.stroke();
  ctx.restore();
}

export const detective: IdFaces = {
  front(e) {
    const { ctx, W, S } = e;
    const p = paper(e);
    frame(e, p.rule);
    field(e, 'det_agency', W / 2, 40, {
      font: 'serif',
      size: 9.5,
      weight: 700,
      color: p.mu,
      align: 'center',
      spacing: 2,
      maxWidth: W - S * 2 - 20,
    });
    field(e, 'det_title', W / 2, 70, {
      font: 'serif',
      size: 21,
      weight: 900,
      color: p.ink,
      align: 'center',
      spacing: 4,
      maxWidth: W - S * 2 - 10,
      shrink: 0.62,
    });
    line(ctx, W / 2 - 70, 80, W / 2 + 70, 80, p.rule, 0.8);
    text(e, '— LICENSE · CERTIFICATE —', W / 2, 92, {
      font: 'type',
      size: 6.5,
      color: p.mu,
      align: 'center',
      spacing: 1.2,
    });
    field(e, 'det_no', W / 2, 110, {
      font: 'type',
      size: 10,
      color: p.red,
      align: 'center',
      maxWidth: 200,
    });
    /* 照片 */
    const pw = 100;
    const ph = 128;
    const px = (W - pw) / 2;
    const py = 124;
    photo(e, px, py, pw, ph, {
      bg: alpha('#6b4a26', 0.12),
      silhouette: alpha('#6b4a26', 0.28),
      tone: 'sepia',
    });
    photoCorners(e, px, py, pw, ph, alpha('#2e2216', 0.75));
    field(e, 'name', W / 2, 286, {
      font: 'serif',
      size: 20,
      weight: 900,
      color: p.ink,
      align: 'center',
      spacing: 3,
      maxWidth: W - S * 2,
      shrink: 0.62,
    });
    field(e, 'nameEn', W / 2, 302, {
      font: 'type',
      size: 9,
      color: p.mu,
      align: 'center',
      maxWidth: W - S * 2,
    });
    typedLine(e, '事務所', 'det_address', 330, p.ink, p.rule);
    typedLine(e, '發照日期', 'det_issued', 354, p.ink, p.rule);
    typedLine(e, '有效期限', 'det_expires', 378, p.ink, p.rule);
    text(e, '發照官', S + 6, 432, { font: 'serif', size: 8, weight: 700, color: p.mu });
    scribble(e, S + 42, 426, 92, alpha(p.ink, 0.8), 'officer');
    line(ctx, S + 40, 436, S + 150, 436, p.rule, 0.6);
    stamp(e, W - S - 40, 418, 30, alpha(p.red, 0.85), '核准', { rotate: -14, small: 'APPROVED' });
  },
  back(e) {
    const { ctx, W, S } = e;
    const p = paper(e);
    frame(e, p.rule);
    text(e, '注 意 事 項', W / 2, 46, {
      font: 'serif',
      size: 15,
      weight: 900,
      color: p.ink,
      align: 'center',
      spacing: 2,
    });
    const notes = [
      '一、本執照須隨身攜帶，經查驗時應即出示。',
      '二、持照人不得冒用公務員之名義從事調查。',
      '三、本執照不得轉讓、出借或塗改。',
      '四、事務所遷移時應於十日內申報。',
    ];
    let y = 74;
    for (const n of notes) {
      y =
        paragraph(e, n, S + 6, y, {
          font: 'type',
          size: 8.5,
          color: p.ink,
          width: W - S * 2 - 12,
          lineHeight: 14,
        }) + 22;
    }
    /* 指紋欄 */
    const fx = S + 6;
    const fy = 232;
    strokeRRect(ctx, fx, fy, 96, 116, 2, p.rule, 1);
    text(e, '右手拇指指紋', fx + 48, fy + 14, {
      font: 'serif',
      size: 7,
      weight: 700,
      color: p.mu,
      align: 'center',
    });
    ctx.save();
    ctx.strokeStyle = alpha(p.ink, 0.28);
    ctx.lineWidth = 1.1;
    for (let k = 1; k <= 8; k++) {
      ctx.beginPath();
      ctx.ellipse(
        fx + 48,
        fy + 68,
        k * 3.6,
        k * 4.6,
        0.12,
        Math.PI * 0.08,
        Math.PI * (k % 2 ? 1.85 : 1.95),
      );
      ctx.stroke();
    }
    ctx.restore();
    /* 印花（齒孔邊） */
    const sx = W - S - 92;
    const sy = 236;
    ctx.save();
    ctx.fillStyle = alpha(p.red, 0.12);
    ctx.fillRect(sx, sy, 86, 104);
    ctx.fillStyle = p.base;
    for (let k = 0; k <= 8; k++) {
      circle(ctx, sx + k * 10.75, sy, 2.4);
      ctx.fill();
      circle(ctx, sx + k * 10.75, sy + 104, 2.4);
      ctx.fill();
    }
    for (let k = 0; k <= 9; k++) {
      circle(ctx, sx, sy + k * 11.55, 2.4);
      ctx.fill();
      circle(ctx, sx + 86, sy + k * 11.55, 2.4);
      ctx.fill();
    }
    ctx.restore();
    strokeRRect(ctx, sx + 7, sy + 7, 72, 90, 1, alpha(p.red, 0.7), 0.8);
    text(e, '印花稅票', sx + 43, sy + 30, {
      font: 'serif',
      size: 9,
      weight: 900,
      color: p.red,
      align: 'center',
      spacing: 1,
    });
    text(e, '貳圓', sx + 43, sy + 62, {
      font: 'serif',
      size: 20,
      weight: 900,
      color: p.red,
      align: 'center',
    });
    text(e, 'REVENUE', sx + 43, sy + 82, {
      font: 'type',
      size: 6.5,
      color: p.red,
      align: 'center',
      spacing: 1,
    });
    /* 持照人簽名 */
    text(e, '持照人簽名', S + 6, 392, { font: 'serif', size: 8, weight: 700, color: p.mu });
    line(ctx, S + 60, 396, W - S - 6, 396, p.rule, 0.7);
    field(e, 'det_no', W / 2, 434, {
      font: 'type',
      size: 9,
      color: p.mu,
      align: 'center',
      maxWidth: 200,
    });
  },
};
