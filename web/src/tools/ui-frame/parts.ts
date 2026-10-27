/**
 * 匯出的素材（規格 3.8 的檔名清單）：每一張 PNG 的檔名、大小（1920 基準與輸出 px）與畫法。
 *
 * - 文字冒險：訊息框、名字框、翻頁游標＋選項按鈕 4 種狀態＋系統按鈕 8 種 × 4 種狀態＝39 張，
 *   照 TyranoScript 的資料夾放在 `data/image/uiframe/`（選項與系統按鈕各有子資料夾）。
 *   名字框、選項的 PNG 不含文字（遊戲裡顯示）；系統按鈕的文字畫在 PNG 裡。
 * - TRPG・直播：畫面外框、留言板、角色框、狀態徽章、骰子面板＝5 張；「文字畫進 PNG」時狀態徽章三個各一張＝7 張。
 */
import {
  CHOICE_PAD,
  CURSOR_SIZE,
  FRAME_PAD,
  MSG_TEXT,
  messageLines,
  novelLayout,
  px,
  type Rect,
  SCREEN_FRAME,
  SYS_PAD,
  trpgLayout,
} from './layout';
import {
  BUTTON_STATES,
  type ButtonState,
  type DocState,
  type Mode,
  type Resolution,
  SYSTEM_BUTTONS,
  SYSTEM_LABELS,
  type SystemButton,
} from './model';
import {
  type Ctx,
  drawCenteredText,
  drawCursor,
  drawFrame,
  drawParagraph,
  type RenderEnv,
} from './render';
import { S } from './strings';

/** TyranoScript 的圖片資料夾（data/image/ 底下） */
export const IMAGE_DIR = 'uiframe';
export const NOVEL_IMAGE_ROOT = `data/image/${IMAGE_DIR}`;

export type PartGroup = 'frames' | 'choice' | 'system';

export interface PartDef {
  /** 識別（預覽的四種狀態、測試用） */
  id: string;
  /** ZIP 裡的路徑 */
  file: string;
  /** 清單上的名稱 */
  name: string;
  group: PartGroup;
  /** PNG 的大小（1920 基準，含透明邊） */
  baseW: number;
  baseH: number;
  /** 輸出的大小（px） */
  width: number;
  height: number;
  /** 畫在 PNG 的座標裡（原點＝PNG 左上角，1920 基準） */
  draw: (ctx: Ctx, env: RenderEnv) => void;
}

export const fileBaseName = (file: string): string => file.split('/').pop() ?? file;

export const choiceFile = (state: ButtonState) =>
  `${NOVEL_IMAGE_ROOT}/choice_buttons/choice_btn_${state}.png`;
export const systemFile = (b: SystemButton, state: ButtonState) =>
  `${NOVEL_IMAGE_ROOT}/system_buttons/btn_${b}_${state}.png`;

export const SYSTEM_FONT_SIZE = { en: 16, zh: 18 } as const;
export const CHOICE_FONT_SIZE = 24;
export const NAME_FONT_SIZE = 26;

/** 一個框（含透明邊）的畫法：框畫在 (pad, pad) */
function framePart(
  doc: DocState,
  id: string,
  file: string,
  name: string,
  group: PartGroup,
  r: Rect,
  pad: number,
  extra: Partial<Parameters<typeof drawFrame>[1]> = {},
  after?: (ctx: Ctx, env: RenderEnv) => void,
): PartDef {
  const res = doc.resolution;
  const baseW = r.w + pad * 2;
  const baseH = r.h + pad * 2;
  return {
    id,
    file,
    name,
    group,
    baseW,
    baseH,
    width: px(baseW, res),
    height: px(baseH, res),
    draw: (ctx, env) => {
      drawFrame(
        ctx,
        {
          x: pad,
          y: pad,
          w: r.w,
          h: r.h,
          design: doc.design,
          room: pad,
          clip: { x: 0, y: 0, w: baseW, h: baseH },
          ...extra,
        },
        env,
      );
      after?.(ctx, env);
    },
  };
}

export function novelParts(doc: DocState): PartDef[] {
  const d = doc.design;
  const L = novelLayout(d);
  const res = doc.resolution;
  const out: PartDef[] = [
    framePart(
      doc,
      'message',
      `${NOVEL_IMAGE_ROOT}/message_window.png`,
      S.parts.message,
      'frames',
      { ...L.msg, x: 0, y: 0 },
      FRAME_PAD,
      { crest: true },
    ),
    framePart(
      doc,
      'name',
      `${NOVEL_IMAGE_ROOT}/name_plate.png`,
      S.parts.name,
      'frames',
      { ...L.name, x: 0, y: 0 },
      FRAME_PAD,
    ),
    {
      id: 'cursor',
      file: `${NOVEL_IMAGE_ROOT}/cursor_next.png`,
      name: S.parts.cursor,
      group: 'frames',
      baseW: CURSOR_SIZE,
      baseH: CURSOR_SIZE,
      width: px(CURSOR_SIZE, res),
      height: px(CURSOR_SIZE, res),
      draw: (ctx) => drawCursor(ctx, d, CURSOR_SIZE / 2, CURSOR_SIZE / 2),
    },
  ];
  const c = L.choices[0];
  for (const st of BUTTON_STATES)
    out.push(
      framePart(
        doc,
        `choice:${st}`,
        choiceFile(st),
        S.parts.choice(S.states[st]),
        'choice',
        { x: 0, y: 0, w: c.w, h: c.h },
        CHOICE_PAD,
        { state: st },
      ),
    );
  const sb = L.sys[0];
  for (const b of SYSTEM_BUTTONS)
    for (const st of BUTTON_STATES)
      out.push(
        framePart(
          doc,
          `sys:${b}:${st}`,
          systemFile(b, st),
          S.parts.system(SYSTEM_LABELS[d.buttonLang][b], S.states[st]),
          'system',
          { x: 0, y: 0, w: sb.w, h: sb.h },
          SYS_PAD,
          {
            state: st,
            label: SYSTEM_LABELS[d.buttonLang][b],
            fontSize: SYSTEM_FONT_SIZE[d.buttonLang],
          },
        ),
      );
  return out;
}

export const TRPG_FILES = {
  screen: '01_screen_frame.png',
  board: '02_message_board.png',
  portrait: '03_character_frame.png',
  status: '04_status_badge.png',
  statusN: (i: number) => `04_status_badge_${i}.png`,
  dice: '05_dice_panel.png',
} as const;

export const STATUS_FONT_SIZE = 24;
export const DICE_FONT_SIZE = 30;
export const PORTRAIT_FONT_SIZE = 24;

export function trpgParts(doc: DocState): PartDef[] {
  const d = doc.design;
  const t = doc.texts;
  const L = trpgLayout(d);
  const res = doc.resolution;
  const bake = t.bake;
  const shift = (r: Rect, base: Rect, pad: number): Rect => ({
    x: r.x - base.x + pad,
    y: r.y - base.y + pad,
    w: r.w,
    h: r.h,
  });
  const out: PartDef[] = [
    {
      id: 'trpg:screen',
      file: TRPG_FILES.screen,
      name: S.parts.screen,
      group: 'frames',
      baseW: 1920,
      baseH: 1080,
      width: px(1920, res),
      height: px(1080, res),
      draw: (ctx, env) =>
        drawFrame(
          ctx,
          { ...L.screen, design: d, hole: L.screenHole, room: SCREEN_FRAME.inset },
          env,
        ),
    },
    framePart(
      doc,
      'trpg:board',
      TRPG_FILES.board,
      S.parts.board,
      'frames',
      { ...L.board, x: 0, y: 0 },
      FRAME_PAD,
      { crest: true },
      bake
        ? (ctx) =>
            drawParagraph(
              ctx,
              d,
              t.board,
              FRAME_PAD + MSG_TEXT.left,
              FRAME_PAD + MSG_TEXT.top,
              L.board.w - MSG_TEXT.left - MSG_TEXT.right,
              messageLines(L.board.h),
              MSG_TEXT.size,
              MSG_TEXT.lineHeight,
            )
        : undefined,
    ),
    framePart(
      doc,
      'trpg:portrait',
      TRPG_FILES.portrait,
      S.parts.portrait,
      'frames',
      { ...L.portrait, x: 0, y: 0 },
      FRAME_PAD,
      { hole: shift(L.portraitHole, L.portrait, FRAME_PAD) },
      bake && t.portraitName.trim()
        ? (ctx) => {
            const nr = shift(L.portraitName, L.portrait, FRAME_PAD);
            drawCenteredText(
              ctx,
              d,
              t.portraitName,
              nr.x + nr.w / 2,
              nr.y + nr.h / 2,
              nr.w - 24,
              PORTRAIT_FONT_SIZE,
            );
          }
        : undefined,
    ),
  ];
  const s0 = L.status[0];
  if (bake)
    [t.status1, t.status2, t.status3].forEach((label, i) => {
      out.push(
        framePart(
          doc,
          `trpg:status:${i + 1}`,
          TRPG_FILES.statusN(i + 1),
          S.parts.statusN(i + 1),
          'frames',
          { x: 0, y: 0, w: s0.w, h: s0.h },
          FRAME_PAD,
          { label, fontSize: STATUS_FONT_SIZE },
        ),
      );
    });
  else
    out.push(
      framePart(
        doc,
        'trpg:status',
        TRPG_FILES.status,
        S.parts.status,
        'frames',
        { x: 0, y: 0, w: s0.w, h: s0.h },
        FRAME_PAD,
      ),
    );
  out.push(
    framePart(
      doc,
      'trpg:dice',
      TRPG_FILES.dice,
      S.parts.dice,
      'frames',
      { x: 0, y: 0, w: L.dice.w, h: L.dice.h },
      FRAME_PAD,
      bake ? { label: t.dice, fontSize: DICE_FONT_SIZE } : {},
    ),
  );
  return out;
}

export function partsOf(doc: DocState, mode: Mode = doc.mode): PartDef[] {
  return mode === 'novel' ? novelParts(doc) : trpgParts(doc);
}

/** 用目前的設定畫一張 PNG（回傳畫布；呼叫端轉成 PNG） */
export function renderPart(
  part: PartDef,
  res: Resolution,
  make: (w: number, h: number) => HTMLCanvasElement | OffscreenCanvas,
): HTMLCanvasElement | OffscreenCanvas {
  const c = make(part.width, part.height);
  const ctx = c.getContext('2d') as Ctx | null;
  if (!ctx) return c;
  const scale = res / 1920;
  ctx.save();
  ctx.scale(scale, scale);
  part.draw(ctx, { scale });
  ctx.restore();
  return c;
}
