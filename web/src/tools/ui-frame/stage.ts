/**
 * 預覽的整個畫面（規格 F26～F31）：背景（範例背景或自己的圖）、立繪（範例或自己的圖）、再疊上這個用途的所有框，
 * 文字冒險另有滑過與按下的互動（回傳可以點的範圍）。座標以 1920 × 1080 為準。
 */
import { MSG_TEXT, messageLines, novelLayout, trpgLayout } from './layout';
import { type DocState, type Scene, SYSTEM_BUTTONS, SYSTEM_LABELS } from './model';
import {
  CHOICE_FONT_SIZE,
  DICE_FONT_SIZE,
  NAME_FONT_SIZE,
  PORTRAIT_FONT_SIZE,
  STATUS_FONT_SIZE,
  SYSTEM_FONT_SIZE,
} from './parts';
import { type Ctx, drawCenteredText, drawCursor, drawFrame, drawParagraph } from './render';
import { drawSamplePortrait, drawScene } from './scenes';

export interface PreviewImage {
  width: number;
  height: number;
  source: CanvasImageSource;
}

export interface StageEnv {
  scene: Scene;
  bgImage: PreviewImage | null;
  charImage: PreviewImage | null;
  samplePortrait: boolean;
  /** 滑過、按下中的按鈕（hit id） */
  hover: string | null;
  pressed: string | null;
  /** 輸出 px ÷ 1920 */
  scale: number;
  /** 先畫好的背景＋立繪（拖曳滑桿時不必每次重畫背景）；不給時現畫 */
  backdrop?: CanvasImageSource | null;
}

export interface HitRegion {
  /** 'choice:0'～'choice:2'、'sys:save' 等 */
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const W = 1920;
const H = 1080;

/** 背景圖蓋滿畫面、置中 */
function drawCover(ctx: Ctx, img: PreviewImage) {
  const s = Math.max(W / img.width, H / img.height);
  const w = img.width * s;
  const h = img.height * s;
  ctx.drawImage(img.source, (W - w) / 2, (H - h) / 2, w, h);
}

/** 立繪：畫面下方中央，高 92% */
function drawCharacter(ctx: Ctx, img: PreviewImage) {
  const h = H * 0.92;
  const w = (img.width / img.height) * h;
  ctx.drawImage(img.source, (W - w) / 2, H - h, w, h);
}

export function drawBackdrop(
  ctx: Ctx,
  env: Pick<StageEnv, 'scene' | 'bgImage' | 'charImage' | 'samplePortrait'>,
) {
  if (env.bgImage) drawCover(ctx, env.bgImage);
  else drawScene(ctx, env.scene);
  if (env.charImage) drawCharacter(ctx, env.charImage);
  else if (env.samplePortrait) drawSamplePortrait(ctx);
}

const stateOf = (id: string, env: Pick<StageEnv, 'hover' | 'pressed'>) =>
  env.pressed === id ? 'active' : env.hover === id ? 'hover' : 'normal';

/** 畫整個預覽畫面；回傳可以滑過、按下的範圍（文字冒險的選項與系統按鈕） */
export function drawStage(ctx: Ctx, doc: DocState, env: StageEnv): HitRegion[] {
  const d = doc.design;
  const t = doc.texts;
  const renv = { scale: env.scale };
  const hits: HitRegion[] = [];
  if (env.backdrop) ctx.drawImage(env.backdrop, 0, 0, W, H);
  else drawBackdrop(ctx, env);
  if (doc.mode === 'novel') {
    const L = novelLayout(d);
    L.choices.forEach((r, i) => {
      const id = `choice:${i}`;
      const label = [t.choice1, t.choice2, t.choice3][i];
      drawFrame(
        ctx,
        { ...r, design: d, state: stateOf(id, env), label, fontSize: CHOICE_FONT_SIZE },
        renv,
      );
      hits.push({ id, ...r });
    });
    drawFrame(ctx, { ...L.msg, design: d, crest: true }, renv);
    drawParagraph(
      ctx,
      d,
      t.line,
      L.msg.x + MSG_TEXT.left,
      L.msg.y + MSG_TEXT.top,
      L.msg.w - MSG_TEXT.left - MSG_TEXT.right,
      messageLines(L.msg.h),
      MSG_TEXT.size,
      MSG_TEXT.lineHeight,
    );
    drawFrame(ctx, { ...L.name, design: d, label: t.charName, fontSize: NAME_FONT_SIZE }, renv);
    drawCursor(ctx, d, L.cursor.cx, L.cursor.cy);
    SYSTEM_BUTTONS.forEach((b, i) => {
      const r = L.sys[i];
      const id = `sys:${b}`;
      drawFrame(
        ctx,
        {
          x: r.x,
          y: r.y,
          w: r.w,
          h: r.h,
          design: d,
          state: stateOf(id, env),
          label: SYSTEM_LABELS[d.buttonLang][b],
          fontSize: SYSTEM_FONT_SIZE[d.buttonLang],
        },
        renv,
      );
      hits.push({ id, x: r.x, y: r.y, w: r.w, h: r.h });
    });
    return hits;
  }
  const L = trpgLayout(d);
  drawFrame(ctx, { ...L.screen, design: d, hole: L.screenHole }, renv);
  drawFrame(ctx, { ...L.portrait, design: d, hole: L.portraitHole }, renv);
  drawCenteredText(
    ctx,
    d,
    t.portraitName,
    L.portraitName.x + L.portraitName.w / 2,
    L.portraitName.y + L.portraitName.h / 2,
    L.portraitName.w - 24,
    PORTRAIT_FONT_SIZE,
  );
  [t.status1, t.status2, t.status3].forEach((label, i) => {
    drawFrame(ctx, { ...L.status[i], design: d, label, fontSize: STATUS_FONT_SIZE }, renv);
  });
  drawFrame(ctx, { ...L.dice, design: d, label: t.dice, fontSize: DICE_FONT_SIZE }, renv);
  drawFrame(ctx, { ...L.board, design: d, crest: true }, renv);
  drawParagraph(
    ctx,
    d,
    t.board,
    L.board.x + MSG_TEXT.left,
    L.board.y + MSG_TEXT.top,
    L.board.w - MSG_TEXT.left - MSG_TEXT.right,
    messageLines(L.board.h),
    MSG_TEXT.size,
    MSG_TEXT.lineHeight,
  );
  return hits;
}

/** 點（1920 座標）落在哪個按鈕上 */
export function hitAt(hits: readonly HitRegion[], x: number, y: number): string | null {
  for (let i = hits.length - 1; i >= 0; i--) {
    const h = hits[i];
    if (x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h) return h.id;
  }
  return null;
}

/** 預覽畫面上所有會畫到的字（載入字型用） */
export function stageText(doc: DocState): string {
  const t = doc.texts;
  const labels = Object.values(SYSTEM_LABELS[doc.design.buttonLang]).join('');
  return doc.mode === 'novel'
    ? [t.charName, t.line, t.choice1, t.choice2, t.choice3, labels].join('')
    : [t.portraitName, t.status1, t.status2, t.status3, t.dice, t.board].join('');
}
