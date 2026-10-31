/**
 * 證件範本（一）：員工證、高中學生證、大學學生證、記者證（都是直式 297 × 473 設計單位）。
 * 版面、配色、文案都是本站自己做的。
 */
import { alpha, mix, shade, tint } from '../colors';
import {
  circle,
  field,
  fillRRect,
  firstChar,
  fontString,
  line,
  measure,
  monogram,
  paragraph,
  photo,
  region,
  stamp,
  strokeRRect,
  text,
} from '../kit';
import {
  band,
  cap,
  cardBarcode,
  cardQr,
  fillBleed,
  type IdEnv,
  type IdFaces,
  labeled,
  rows,
  tones,
} from './common';

/* ======================================================================
 * 員工證
 * ==================================================================== */

export const employee: IdFaces = {
  front(e) {
    const { ctx, W, H, S, c, dk } = e;
    const t = tones(e);
    fillBleed(e, t.bg);
    /* 上方色帶＋斜的反光 */
    band(e, 0, 118, dk ? shade(c, 0.25) : c);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(-e.B, -e.B);
    ctx.lineTo(W * 0.66, -e.B);
    ctx.lineTo(W * 0.34, 118);
    ctx.lineTo(-e.B, 118);
    ctx.closePath();
    ctx.fillStyle = alpha('#ffffff', 0.08);
    ctx.fill();
    ctx.restore();
    /* 打了掛繩孔時上方的一列往下 14（公司名稱避開孔，規格 D32） */
    const hy = e.slot ? 14 : 0;
    monogram(
      e,
      S + 14,
      37 + hy,
      14,
      alpha('#ffffff', 0.95),
      dk ? shade(c, 0.25) : c,
      firstChar(e.value('emp_org')),
      {
        square: true,
      },
    );
    const tx = S + 36;
    field(e, 'emp_org', tx, 36 + hy, {
      size: 12,
      weight: 700,
      color: t.oc,
      maxWidth: W - S - tx - 54,
      shrink: 0.75,
    });
    field(e, 'emp_orgEn', tx, 49 + hy, {
      size: 6,
      weight: 600,
      color: alpha(t.oc, 0.75),
      spacing: 1,
      upper: true,
      maxWidth: W - S - tx - 54,
    });
    text(e, '員工證', W - S, 34 + hy, {
      size: 10,
      weight: 900,
      color: t.oc,
      align: 'right',
      spacing: 1.5,
    });
    text(e, 'EMPLOYEE ID', W - S, 46 + hy, {
      size: 5.5,
      weight: 700,
      color: alpha(t.oc, 0.72),
      align: 'right',
      spacing: 0.9,
    });
    /* 照片（白框） */
    const pw = 116;
    const ph = 150;
    const px = (W - pw) / 2;
    const py = 72;
    fillRRect(ctx, px - 5, py - 5, pw + 10, ph + 10, 13, t.bg);
    photo(e, px, py, pw, ph, {
      radius: 9,
      bg: dk ? '#262a32' : '#eef1f5',
      silhouette: dk ? '#3a404b' : '#d5dbe3',
    });
    /* 姓名 */
    field(e, 'name', W / 2, 258, {
      size: 25,
      weight: 900,
      color: t.fg,
      align: 'center',
      maxWidth: W - S * 2,
      shrink: 0.62,
    });
    field(e, 'nameEn', W / 2, 274, {
      size: 7.5,
      weight: 600,
      color: t.mu,
      align: 'center',
      spacing: 2,
      upper: true,
      maxWidth: W - S * 2,
    });
    /* 部門・職稱 */
    const mid = W / 2;
    field(e, 'emp_dept', mid - 9, 298, {
      size: 10.5,
      weight: 700,
      color: t.hc,
      align: 'right',
      maxWidth: mid - 9 - S,
    });
    circle(ctx, mid, 294.5, 2.2);
    ctx.fillStyle = c;
    ctx.fill();
    field(e, 'emp_title', mid + 9, 298, {
      size: 10.5,
      weight: 700,
      color: t.hc,
      maxWidth: W - S - mid - 9,
    });
    /* 編號、有效期限 */
    line(ctx, S, 316, W - S, 316, t.ln);
    labeled(e, '員工編號 NO.', 'emp_no', S, 332, {
      width: W / 2 - S - 6,
      capColor: t.mu,
      color: t.fg,
      size: 10,
      mono: true,
    });
    labeled(e, '有效期限 VALID THRU', 'emp_expires', W / 2 + 6, 332, {
      width: W / 2 - S - 6,
      capColor: t.mu,
      color: t.fg,
      size: 10,
    });
    cardBarcode(e, S - 6, 362, W - S * 2 + 12, 34, t.fg);
    /* 下方色帶：門禁權限 */
    band(e, 414, H, dk ? shade(c, 0.6) : shade(c, 0.62));
    band(e, 414, 417, c);
    cap(e, '門禁權限 ACCESS', S, 436, alpha('#ffffff', 0.6));
    field(e, 'emp_access', S, 452, { size: 11.5, weight: 700, color: '#ffffff', maxWidth: 170 });
    text(e, 'AUTHORIZED', W - S, 440, {
      size: 5.5,
      weight: 700,
      color: alpha('#ffffff', 0.6),
      align: 'right',
      spacing: 1.4,
    });
    text(e, 'PERSONNEL', W - S, 450, {
      size: 5.5,
      weight: 700,
      color: alpha('#ffffff', 0.6),
      align: 'right',
      spacing: 1.4,
    });
  },
  back(e) {
    const { ctx, W, H, S, c, dk } = e;
    const t = tones(e);
    fillBleed(e, t.bg);
    band(e, 0, 8, c);
    text(e, '使用須知', S, 44, { size: 14, weight: 900, color: t.fg, spacing: 1 });
    cap(e, 'TERMS OF USE', S, 58, t.mu);
    paragraph(
      e,
      '本證為本公司員工身分及門禁識別之用，限本人使用，不得轉借、變造或複製。進出管制區域時請配戴於明顯處；離職時應繳回人事單位，遺失時請立即通報。',
      S,
      82,
      { size: 8.5, color: t.mu, width: W - S * 2, lineHeight: 14.5, maxLines: 5 },
    );
    rows(
      e,
      [
        ['姓名', 'name'],
        ['部門', 'emp_dept'],
        ['員工編號', 'emp_no'],
        ['門禁權限', 'emp_access'],
        ['有效期限', 'emp_expires'],
      ],
      S,
      160,
      W - S * 2,
      { mu: t.mu, fg: t.fg, ln: t.ln },
    );
    strokeRRect(ctx, S - 0.5, 299.5, 69, 69, 7, t.ln, 1);
    cardQr(e, S, 300, 6);
    const rx = S + 82;
    cap(e, '拾獲請送交', rx, 318, t.mu);
    field(e, 'emp_org', rx, 334, {
      size: 10.5,
      weight: 700,
      color: t.fg,
      maxWidth: W - S - rx,
      shrink: 0.75,
    });
    cardBarcode(e, rx - 4, 346, W - S - rx + 4, 20, t.fg);
    band(e, 414, H, dk ? shade(c, 0.6) : shade(c, 0.62));
    band(e, 414, 417, c);
    field(e, 'emp_orgEn', S, 448, {
      size: 7,
      weight: 700,
      color: alpha('#ffffff', 0.85),
      spacing: 2,
      upper: true,
      maxWidth: W - S * 2 - 90,
    });
    text(e, 'NON-TRANSFERABLE', W - S, 448, {
      size: 5.5,
      weight: 700,
      color: alpha('#ffffff', 0.55),
      align: 'right',
      spacing: 1.2,
    });
  },
};

/* ======================================================================
 * 高中學生證
 * ==================================================================== */

const SEMESTERS = ['一上', '一下', '二上', '二下', '三上', '三下'] as const;

export const highschool: IdFaces = {
  front(e) {
    const { ctx, W, H, S, c, dk } = e;
    const t = tones(e);
    fillBleed(e, dk ? '#101817' : '#fbfdfc');
    band(e, 0, 90, dk ? shade(c, 0.3) : c);
    /* 色帶下緣的細線 */
    band(e, 90, 93, alpha(c, 0.35));
    /* 打了掛繩孔時校名往下 10、英文校名往下 9（避開孔，規格 D32） */
    const sy = e.slot ? 10 : 0;
    const ey = e.slot ? 9 : 0;
    field(e, 'hi_school', W / 2, 42 + sy, {
      size: 14.5,
      weight: 700,
      color: t.oc,
      align: 'center',
      maxWidth: W - S * 2,
      shrink: 0.7,
      spacing: 1,
    });
    field(e, 'hi_schoolEn', W / 2, 58 + ey, {
      size: 6,
      weight: 600,
      color: alpha(t.oc, 0.78),
      align: 'center',
      spacing: 1.2,
      upper: true,
      maxWidth: W - S * 2,
    });
    text(e, '學 生 證', W / 2, 126, {
      font: 'serif',
      size: 22,
      weight: 900,
      color: dk ? tint(c, 0.4) : shade(c, 0.1),
      align: 'center',
      spacing: 4,
    });
    cap(e, 'STUDENT IDENTIFICATION CARD', W / 2, 141, t.mu, { size: 5.5, align: 'center' });
    /* 照片（細框） */
    const px = S + 2;
    const py = 160;
    strokeRRect(ctx, px - 3, py - 3, 110, 142, 5, alpha(c, 0.5), 1);
    photo(e, px, py, 104, 136, {
      radius: 3,
      bg: dk ? '#1d2826' : '#e9f1ef',
      silhouette: dk ? '#33413e' : '#c9d9d5',
    });
    const rx = px + 122;
    const rw = W - S - rx;
    const kl = (label: string, y: number) =>
      text(e, label, rx, y, { size: 7.5, weight: 700, color: dk ? tint(c, 0.45) : c });
    kl('姓名', 170);
    field(e, 'name', rx, 194, { size: 19, weight: 900, color: t.fg, maxWidth: rw, shrink: 0.62 });
    kl('班級座號', 216);
    field(e, 'hi_class', rx, 232, { size: 11, weight: 600, color: t.fg, maxWidth: rw });
    kl('學號', 254);
    field(e, 'hi_no', rx, 270, { font: 'mono', size: 11, weight: 500, color: t.fg, maxWidth: rw });
    kl('出生日期', 292);
    field(e, 'hi_birth', rx, 306, { size: 10, weight: 500, color: t.fg, maxWidth: rw });
    /* 證明文字＋校印 */
    line(ctx, S, 322, W - S, 322, alpha(c, 0.35), 1.2);
    text(e, '茲證明本證持有人為本校在學學生。', S, 344, { font: 'serif', size: 9.5, color: t.fg });
    cap(e, '發證日期', S, 366, t.mu);
    field(e, 'hi_issued', S + 46, 366.5, { size: 9.5, weight: 600, color: t.fg, maxWidth: 110 });
    stamp(e, W - S - 30, 360, 25, '#c8372d', '教務處', { rotate: -12, small: '驗印' });
    /* 條碼 */
    cardBarcode(e, S - 6, 392, 172, 26, t.fg);
    field(e, 'hi_no', S, 430, { font: 'mono', size: 7, color: t.mu, spacing: 1.2, maxWidth: 160 });
    band(e, H - 10, H, c);
  },
  back(e) {
    const { ctx, W, H, S, c, dk } = e;
    const t = tones(e);
    fillBleed(e, dk ? '#101817' : '#fbfdfc');
    band(e, 0, 8, c);
    text(e, '註冊章', S, 44, {
      font: 'serif',
      size: 15,
      weight: 900,
      color: dk ? tint(c, 0.4) : shade(c, 0.1),
    });
    cap(e, 'REGISTRATION', S + 54, 43, t.mu);
    /* 註冊章欄：3 × 2 格 */
    const reg = SEMESTERS.indexOf(e.value('hi_reg') as (typeof SEMESTERS)[number]);
    const gx = S;
    const gy = 56;
    const cw = (W - S * 2) / 3;
    const ch = 58;
    for (let i = 0; i < 6; i++) {
      const x = gx + (i % 3) * cw;
      const y = gy + Math.floor(i / 3) * ch;
      ctx.strokeStyle = alpha(c, 0.45);
      ctx.lineWidth = 0.9;
      ctx.strokeRect(x, y, cw, ch);
      text(e, SEMESTERS[i], x + 5, y + 11, { size: 7, weight: 700, color: t.mu });
      if (i <= reg) {
        ctx.save();
        ctx.translate(x + cw / 2, y + ch / 2 + 4);
        ctx.rotate(((i % 2 ? 8 : -9) * Math.PI) / 180);
        strokeRRect(ctx, -26, -11, 52, 22, 2, alpha('#c8372d', 0.85), 1.4);
        strokeRRect(ctx, -23, -8, 46, 16, 1, alpha('#c8372d', 0.6), 0.6);
        text(e, '已註冊', 0, 0.5, {
          font: 'serif',
          size: 10,
          weight: 900,
          color: alpha('#c8372d', 0.88),
          align: 'center',
          baseline: 'middle',
          spacing: 1.5,
        });
        ctx.restore();
      }
    }
    region(e, { kind: 'field', key: 'hi_reg', x: gx, y: gy, w: W - S * 2, h: ch * 2 });
    /* 注意事項 */
    text(e, '注意事項', S, 210, { font: 'serif', size: 12, weight: 900, color: t.fg });
    const notes = [
      '本證限本人使用，不得轉借或塗改。',
      '每學期蓋妥註冊章始生效。',
      '遺失時請向教務處申請補發。',
      '畢業、轉學或休學時應繳回本證。',
    ];
    notes.forEach((n, i) => {
      const y = 232 + i * 19;
      circle(ctx, S + 6, y - 3, 6);
      ctx.fillStyle = c;
      ctx.fill();
      text(e, String(i + 1), S + 6, y - 2.6, {
        size: 7,
        weight: 700,
        color: t.oc,
        align: 'center',
        baseline: 'middle',
      });
      text(e, n, S + 18, y, { size: 8.5, color: t.mu, maxWidth: W - S * 2 - 18 });
    });
    rows(
      e,
      [
        ['姓名', 'name'],
        ['學號', 'hi_no'],
        ['學校', 'hi_school'],
      ],
      S,
      318,
      W - S * 2,
      { mu: t.mu, fg: t.fg, ln: t.ln, rowH: 20 },
    );
    cardBarcode(e, S - 6, 400, 178, 30, t.fg);
    strokeRRect(ctx, W - S - 64.5, 381.5, 65, 65, 6, t.ln, 1);
    cardQr(e, W - S - 64, 382, 6);
    band(e, H - 10, H, c);
  },
};

/* ======================================================================
 * 大學學生證
 * ==================================================================== */

/** 校徽：雙圈＋打開的書 */
function crest(e: IdEnv, cx: number, cy: number, r: number, color: string) {
  const { ctx } = e;
  ctx.save();
  circle(ctx, cx, cy, r);
  ctx.strokeStyle = color;
  ctx.lineWidth = r * 0.07;
  ctx.stroke();
  circle(ctx, cx, cy, r * 0.78);
  ctx.lineWidth = r * 0.035;
  ctx.setLineDash([r * 0.05, r * 0.07]);
  ctx.stroke();
  ctx.setLineDash([]);
  /* 書 */
  ctx.beginPath();
  ctx.moveTo(cx, cy + r * 0.32);
  ctx.quadraticCurveTo(cx - r * 0.28, cy + r * 0.12, cx - r * 0.5, cy + r * 0.22);
  ctx.lineTo(cx - r * 0.5, cy - r * 0.3);
  ctx.quadraticCurveTo(cx - r * 0.28, cy - r * 0.42, cx, cy - r * 0.2);
  ctx.quadraticCurveTo(cx + r * 0.28, cy - r * 0.42, cx + r * 0.5, cy - r * 0.3);
  ctx.lineTo(cx + r * 0.5, cy + r * 0.22);
  ctx.quadraticCurveTo(cx + r * 0.28, cy + r * 0.12, cx, cy + r * 0.32);
  ctx.closePath();
  ctx.fillStyle = alpha(color, 0.22);
  ctx.fill();
  ctx.lineWidth = r * 0.05;
  ctx.stroke();
  line(ctx, cx, cy - r * 0.2, cx, cy + r * 0.32, color, r * 0.05);
  ctx.restore();
}

function uniBase(e: IdEnv) {
  const { ctx, W, H, c, dk } = e;
  if (dk) {
    const g = ctx.createLinearGradient(0, -e.B, W * 0.4, H + e.B);
    g.addColorStop(0, '#172036');
    g.addColorStop(1, '#0a0e18');
    fillBleed(e, g);
  } else fillBleed(e, '#faf7f0');
  return {
    fg: dk ? '#f1eee6' : '#1d1b17',
    mu: dk ? 'rgba(241,238,230,0.55)' : 'rgba(29,27,23,0.55)',
    hc: dk ? tint(c, 0.2) : shade(c, 0.22),
    ln: alpha(c, dk ? 0.32 : 0.38),
  };
}

export const university: IdFaces = {
  front(e) {
    const { ctx, W, H, S, c, dk } = e;
    const u = uniBase(e);
    /* 大大的淡校徽 */
    ctx.save();
    ctx.globalAlpha = dk ? 0.07 : 0.08;
    crest(e, W - 40, H - 120, 120, c);
    ctx.restore();
    crest(e, S + 16, 38, 16, u.hc);
    const tx = S + 40;
    /* 打了掛繩孔時校名往下 14、英文校名往下 10（避開孔，規格 D32） */
    const ny = e.slot ? 14 : 0;
    const ey = e.slot ? 10 : 0;
    field(e, 'uni_name', tx, 37 + ny, {
      font: 'serif',
      size: 15,
      weight: 900,
      color: u.fg,
      maxWidth: W - S - tx,
      shrink: 0.7,
    });
    field(e, 'uni_nameEn', tx, 50 + ey, {
      size: 5.8,
      weight: 600,
      color: u.mu,
      spacing: 1.2,
      upper: true,
      maxWidth: W - S - tx,
    });
    /* 金色的細線 */
    const g = ctx.createLinearGradient(S, 0, W - S, 0);
    g.addColorStop(0, alpha(c, 0.9));
    g.addColorStop(1, alpha(c, 0));
    ctx.fillStyle = g;
    ctx.fillRect(S, 64, W - S * 2, 1.2);
    /* 照片（右） */
    const pw = 96;
    const ph = 126;
    const px = W - S - pw;
    const py = 82;
    strokeRRect(ctx, px - 4, py - 4, pw + 8, ph + 8, 2, u.ln, 1);
    photo(e, px, py, pw, ph, {
      bg: dk ? '#1c2436' : '#eee8db',
      silhouette: dk ? '#2c3650' : '#d8cfbd',
    });
    /* 左欄：學生、系所、身分 */
    const lw = px - S - 16;
    strokeRRect(ctx, S, 82, 54, 15, 1, u.ln, 1);
    text(e, 'STUDENT', S + 27, 92.6, {
      size: 6,
      weight: 700,
      color: u.hc,
      align: 'center',
      spacing: 1.4,
    });
    cap(e, '系所', S, 120, u.mu);
    field(e, 'uni_dept', S, 136, { size: 11, weight: 700, color: u.hc, maxWidth: lw, shrink: 0.7 });
    cap(e, '身分', S, 158, u.mu);
    field(e, 'uni_degree', S, 173, { size: 10.5, weight: 600, color: u.fg, maxWidth: lw });
    cap(e, '入學年度', S, 195, u.mu);
    field(e, 'uni_year', S, 210, { size: 10.5, weight: 600, color: u.fg, maxWidth: lw });
    /* 姓名 */
    field(e, 'name', S, 254, {
      font: 'serif',
      size: 24,
      weight: 900,
      color: u.fg,
      maxWidth: W - S * 2,
      shrink: 0.62,
    });
    field(e, 'nameEn', S, 270, {
      size: 7.5,
      weight: 600,
      color: u.mu,
      spacing: 2,
      upper: true,
      maxWidth: W - S * 2,
    });
    /* 四格 */
    const cells: [string, string, boolean][] = [
      ['學號 STUDENT NO.', 'uni_no', true],
      ['圖書館 LIBRARY', 'uni_lib', false],
      ['宿舍 HOUSING', 'uni_dorm', false],
    ];
    const cw = (W - S * 2 - 8) / 2;
    cells.forEach(([label, key, mono], i) => {
      const x = i === 0 ? S : S + (i - 1) * (cw + 8);
      const y = i === 0 ? 286 : 330;
      const w = i === 0 ? W - S * 2 : cw;
      strokeRRect(ctx, x, y, w, 36, 1, u.ln, 0.9);
      cap(e, label, x + 8, y + 13, u.mu, { size: 5.8 });
      field(e, key, x + 8, y + 28, {
        font: mono ? 'mono' : 'sans',
        size: 10,
        weight: 600,
        color: u.fg,
        maxWidth: w - 16,
      });
    });
    cap(e, '在學期間有效 VALID WITH ENROLLMENT', S, 392, u.mu, { size: 5.8 });
    cardBarcode(e, S - 6, 400, W - S * 2 + 12, 30, u.fg);
    band(e, H - 9, H, c);
  },
  back(e) {
    const { ctx, W, H, S, c, dk } = e;
    const u = uniBase(e);
    /* 打了掛繩孔時校徽、校名、小標往下（12、14、12；避開孔，規格 D32） */
    const hy = e.slot ? 12 : 0;
    crest(e, S + 13, 36 + hy, 13, u.hc);
    field(e, 'uni_name', S + 34, 34 + (e.slot ? 14 : 0), {
      font: 'serif',
      size: 13,
      weight: 900,
      color: u.fg,
      maxWidth: W - S * 2 - 34,
    });
    cap(e, '校園服務 CAMPUS SERVICES', S + 34, 47 + hy, u.hc, { size: 5.8 });
    rows(
      e,
      [
        ['姓名', 'name'],
        ['系所', 'uni_dept'],
        ['身分', 'uni_degree'],
        ['圖書館', 'uni_lib'],
        ['宿舍', 'uni_dorm'],
      ],
      S,
      66,
      W - S * 2,
      { mu: u.mu, fg: u.fg, ln: u.ln },
    );
    text(e, '注意事項', S, 196, { font: 'serif', size: 11, weight: 900, color: u.fg });
    paragraph(
      e,
      '本證限本人使用，進出圖書館、宿舍及校園管制區域時須出示。不得轉借或塗改；遺失時請向學務處申請補發，畢業或離校時應繳回。',
      S,
      214,
      { size: 8, color: u.mu, width: W - S * 2, lineHeight: 13.5, maxLines: 5 },
    );
    /* 簽名欄 */
    cap(e, '持證人簽名 SIGNATURE', S, 300, u.mu, { size: 5.8 });
    fillRRect(ctx, S, 306, W - S * 2, 26, 2, dk ? alpha('#ffffff', 0.06) : alpha(c, 0.1));
    cardQr(e, S, 352);
    const rx = S + 76;
    cardBarcode(e, rx - 4, 372, W - S - rx + 4, 26, u.fg);
    field(e, 'uni_no', rx, 410, {
      font: 'mono',
      size: 7.5,
      color: u.mu,
      spacing: 1,
      maxWidth: W - S - rx,
    });
    band(e, H - 9, H, c);
  },
};

/* ======================================================================
 * 記者證
 * ==================================================================== */

export const press: IdFaces = {
  front(e) {
    const { ctx, W, H, S, c, dk } = e;
    const t = tones(e);
    fillBleed(e, t.bg);
    band(e, 0, 150, dk ? shade(c, 0.2) : c);
    /* 斜紋 */
    ctx.save();
    ctx.beginPath();
    ctx.rect(-e.B, -e.B, W + e.B * 2, 150 + e.B);
    ctx.clip();
    ctx.strokeStyle = alpha('#ffffff', 0.07);
    ctx.lineWidth = 9;
    for (let k = -200; k < W + 200; k += 26) {
      ctx.beginPath();
      ctx.moveTo(k, 160);
      ctx.lineTo(k + 170, -20);
      ctx.stroke();
    }
    ctx.restore();
    /* 打了掛繩孔時媒體名稱只用到孔的左邊（長的名字縮小或「…」，規格 D32） */
    field(e, 'press_org', S, 36, {
      size: 13,
      weight: 900,
      color: t.oc,
      maxWidth: e.slot ? Math.min(W - S * 2 - 70, e.slot.x - 6 - S) : W - S * 2 - 70,
      shrink: 0.7,
    });
    field(e, 'press_orgEn', S, 49, {
      size: 6,
      weight: 600,
      color: alpha(t.oc, 0.78),
      spacing: 1.2,
      upper: true,
      maxWidth: W - S * 2 - 70,
    });
    strokeRRect(ctx, W - S - 58, 24, 58, 18, 3, alpha(t.oc, 0.85), 1.1);
    text(e, '採訪證', W - S - 29, 33.4, {
      size: 9,
      weight: 900,
      color: t.oc,
      align: 'center',
      baseline: 'middle',
      spacing: 2,
    });
    text(e, 'PRESS', S - 3, 128, { font: 'cond', size: 74, weight: 700, color: t.oc, spacing: 4 });
    /* 照片 */
    const px = S;
    const py = 166;
    photo(e, px, py, 110, 142, {
      radius: 6,
      bg: dk ? '#262a32' : '#f1efee',
      silhouette: dk ? '#3a404b' : '#d9d4d2',
    });
    const rx = px + 126;
    const rw = W - S - rx;
    field(e, 'name', rx, 190, { size: 21, weight: 900, color: t.fg, maxWidth: rw, shrink: 0.62 });
    field(e, 'nameEn', rx, 205, {
      size: 6.5,
      weight: 600,
      color: t.mu,
      spacing: 1.4,
      upper: true,
      maxWidth: rw,
    });
    /* 職稱（實心標籤） */
    const role = e.value('press_role');
    ctx.font = fontString('sans', 9.5, 700);
    const roleW = Math.min(rw, Math.max(40, measure(ctx, role || '職稱') + 20));
    fillRRect(ctx, rx, 216, roleW, 19, 9.5, c);
    field(e, 'press_role', rx + roleW / 2, 229, {
      size: 9.5,
      weight: 700,
      color: t.oc,
      align: 'center',
      maxWidth: roleW - 10,
    });
    labeled(e, '採訪路線 BEAT', 'press_beat', rx, 256, {
      width: rw,
      capColor: t.mu,
      color: t.fg,
      size: 10,
    });
    labeled(e, '有效期限 EXPIRES', 'press_expires', rx, 292, {
      width: rw,
      capColor: t.mu,
      color: t.fg,
      size: 10,
    });
    line(ctx, S, 324, W - S, 324, t.ln);
    labeled(e, '證號 PRESS NO.', 'press_no', S, 342, {
      width: W - S * 2,
      capColor: t.mu,
      color: t.fg,
      size: 12,
      mono: true,
    });
    cardBarcode(e, S - 6, 376, W - S * 2 + 12, 34, t.fg);
    band(e, 430, H, dk ? shade(c, 0.45) : shade(c, 0.35));
    text(e, '請配合現場人員查驗', W / 2, 452, {
      size: 8.5,
      weight: 700,
      color: alpha('#ffffff', 0.9),
      align: 'center',
      spacing: 3,
    });
  },
  back(e) {
    const { ctx, W, H, S, c } = e;
    const t = tones(e);
    fillBleed(e, t.bg);
    band(e, 0, 10, c);
    text(e, '採訪須知', S, 46, { size: 14, weight: 900, color: t.fg, spacing: 1 });
    cap(e, 'PRESS GUIDELINES', S, 60, t.mu);
    const notes = [
      '本證僅供採訪識別，限本人使用。',
      '採訪時請主動出示並遵守現場管制。',
      '不得用於採訪以外的用途。',
      '證件遺失請立即通知發證單位。',
    ];
    notes.forEach((n, i) => {
      const y = 86 + i * 20;
      fillRRect(ctx, S, y - 9, 3, 12, 1.5, c);
      text(e, n, S + 10, y, { size: 8.5, color: t.mu, maxWidth: W - S * 2 - 10 });
    });
    rows(
      e,
      [
        ['姓名', 'name'],
        ['媒體', 'press_org'],
        ['職稱', 'press_role'],
        ['證號', 'press_no'],
        ['有效期限', 'press_expires'],
      ],
      S,
      178,
      W - S * 2,
      { mu: t.mu, fg: t.fg, ln: t.ln },
    );
    strokeRRect(ctx, S - 0.5, 315.5, 73, 73, 7, t.ln, 1);
    cardQr(e, S, 316, 6);
    const rx = S + 86;
    cap(e, '如拾獲請寄回', rx, 334, t.mu);
    field(e, 'press_org', rx, 350, { size: 11, weight: 900, color: t.fg, maxWidth: W - S - rx });
    cardBarcode(e, rx - 4, 360, W - S - rx + 4, 24, t.fg);
    band(e, 430, H, mix(c, '#000000', 0.35));
    field(e, 'press_orgEn', W / 2, 452, {
      size: 7,
      weight: 700,
      color: alpha('#ffffff', 0.85),
      align: 'center',
      spacing: 2.4,
      upper: true,
      maxWidth: W - S * 2,
    });
  },
};
