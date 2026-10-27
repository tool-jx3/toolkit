/**
 * UI 框素材產生器：TyranoScript 的配置程式碼（規格 3.9）——標籤與參數、座標與大小和 PNG 對得上、
 * 用到的圖片都在 ZIP 的檔名清單裡、文字的跳脫、補充樣式。
 */
import { describe, expect, it } from 'vitest';
import { CHOICE_PAD, FRAME_PAD, novelLayout, SYS_PAD } from '../../src/tools/ui-frame/layout';
import {
  type DocState,
  initialState,
  PRESETS,
  SYSTEM_BUTTONS,
} from '../../src/tools/ui-frame/model';
import { paletteRgba, tyranoColor } from '../../src/tools/ui-frame/palette';
import { novelParts } from '../../src/tools/ui-frame/parts';
import { labelInset } from '../../src/tools/ui-frame/render';
import {
  choiceSidePadding,
  referencedImages,
  SYSTEM_ROLES,
  TYRANO_INNER_OFFSET,
  tagText,
  tyranoCode,
} from '../../src/tools/ui-frame/tyrano';

const doc = (patch: Partial<DocState> = {}): DocState => ({ ...initialState(), ...patch });

/** 從程式碼裡找出某個標籤（第 n 個）的屬性 */
function tagAttrs(code: string, name: string, n = 0): Record<string, string> {
  const re = new RegExp(`^\\[${name} ([^\\n]*)\\]$`, 'gm');
  const m = [...code.matchAll(re)][n];
  if (!m) throw new Error(`沒有第 ${n + 1} 個 [${name}]`);
  return Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map((x) => [x[1], x[2]]));
}

describe('Tyrano_QuickPaste.ks', () => {
  it('開頭讀補充樣式；訊息框、名字框、游標、系統按鈕的標籤都在', () => {
    const { quickPaste } = tyranoCode(doc(), '案件卷宗');
    expect(quickPaste).toMatch(/^;=+$/m);
    expect(tagAttrs(quickPaste, 'loadcss')).toEqual({ file: './data/others/uiframe/uiframe.css' });
    expect(quickPaste).toContain('[layopt layer="message0" visible="true"]');
    expect(quickPaste).toContain('[resetfont]');
    expect(tagAttrs(quickPaste, 'chara_config')).toEqual({ ptext: 'chara_name_area' });
    expect([...quickPaste.matchAll(/^\[button /gm)]).toHaveLength(8);
    /* 註解以外的每一行都是一個標籤 */
    for (const line of quickPaste.split('\n'))
      if (line && !line.startsWith(';')) expect(line).toMatch(/^\[[a-z_]+( [^\n]*)?\]$/);
  });

  for (const res of [1920, 1280] as const)
    it(`${res}：訊息框的位置與大小＝PNG（含透明邊），文字的邊距、字的顏色`, () => {
      const s = doc({ resolution: res });
      const { quickPaste } = tyranoCode(s, '案件卷宗');
      const msgPart = novelParts(s)[0];
      const L = novelLayout(s.design);
      const k = res / 1920;
      const p = tagAttrs(quickPaste, 'position');
      expect(p).toMatchObject({
        layer: 'message0',
        page: 'fore',
        frame: 'uiframe/message_window.png',
        opacity: '255',
      });
      expect(Number(p.width)).toBe(msgPart.width);
      expect(Number(p.height)).toBe(msgPart.height);
      expect(Number(p.left)).toBe(Math.round((L.msg.x - FRAME_PAD) * k));
      expect(Number(p.top)).toBe(Math.round((L.msg.y - FRAME_PAD) * k));
      expect(Number(p.top) + Number(p.height)).toBeLessThanOrEqual(Math.round(1080 * k) + 1);
      /* 文字的範圍本來就比框往右、往下多 10 px（kag.layer.js 的 refMessageLayer），左、上的邊距扣掉 10 */
      expect(TYRANO_INNER_OFFSET).toBe(10);
      expect(Number(p.marginl)).toBe(Math.round((FRAME_PAD + 64) * k) - 10);
      expect(Number(p.margint)).toBe(Math.round((FRAME_PAD + 56) * k) - 10);
      expect(Number(p.marginr)).toBe(Math.round((FRAME_PAD + 64) * k));
      expect(Number(p.marginb)).toBe(Math.round((FRAME_PAD + 40) * k));
      const f = tagAttrs(quickPaste, 'deffont');
      expect(f.color).toBe(tyranoColor(paletteRgba(s.design).text));
      expect(Number(f.size)).toBe(Math.round(28 * k));
    });

  it('名字框：圖片在 message0、名字的範圍置中；游標在訊息框右下', () => {
    const s = doc({ resolution: 1280 });
    const { quickPaste } = tyranoCode(s, 'x');
    const L = novelLayout(s.design);
    const k = 2 / 3;
    const img = tagAttrs(quickPaste, 'image');
    expect(img).toMatchObject({
      layer: 'message0',
      folder: 'image',
      storage: 'uiframe/name_plate.png',
      left: String(Math.round((L.name.x - FRAME_PAD) * k)),
      top: String(Math.round((L.name.y - FRAME_PAD) * k)),
    });
    const pt = tagAttrs(quickPaste, 'ptext');
    expect(pt).toMatchObject({
      layer: 'message0',
      name: 'chara_name_area',
      align: 'center',
      x: String(Math.round(L.name.x * k)),
      width: String(Math.round(L.name.w * k)),
    });
    const g = tagAttrs(quickPaste, 'glyph');
    /* fix＝true 時 left／top 是畫面座標；marginl 歸零（預設的 3 px 會讓游標往右偏） */
    expect(g).toMatchObject({
      line: 'uiframe/cursor_next.png',
      folder: 'image',
      fix: 'true',
      marginl: '0',
    });
    expect(Number(g.left)).toBe(Math.round((L.cursor.cx - 20) * k));
    expect(Number(g.top)).toBe(Math.round((L.cursor.cy - 20) * k));
  });

  it('系統按鈕：role、一般／滑過／按下三張圖、自動與快進的進行中圖、座標＝PNG 的左上角', () => {
    const s = doc({ resolution: 1920 });
    const { quickPaste } = tyranoCode(s, 'x');
    const L = novelLayout(s.design);
    SYSTEM_BUTTONS.forEach((b, i) => {
      const a = tagAttrs(quickPaste, 'button', i);
      expect(a.role).toBe(SYSTEM_ROLES[b]);
      expect(a.graphic).toBe(`uiframe/system_buttons/btn_${b}_normal.png`);
      expect(a.enterimg).toBe(`uiframe/system_buttons/btn_${b}_hover.png`);
      expect(a.activeimg).toBe(`uiframe/system_buttons/btn_${b}_active.png`);
      expect(Number(a.x)).toBe(L.sys[i].x - SYS_PAD);
      expect(Number(a.y)).toBe(L.sys[i].y - SYS_PAD);
      expect(a.name).toBe('uiframe_sys');
      expect(a.hint).toBeTruthy();
    });
    expect(tagAttrs(quickPaste, 'button', 2).autoimg).toBe(
      'uiframe/system_buttons/btn_auto_active.png',
    );
    expect(tagAttrs(quickPaste, 'button', 3).skipimg).toBe(
      'uiframe/system_buttons/btn_skip_active.png',
    );
    expect(Object.values(SYSTEM_ROLES)).toEqual([
      'save',
      'load',
      'auto',
      'skip',
      'backlog',
      'menu',
      'title',
      'window',
    ]);
  });
});

describe('Choice_Example.ks', () => {
  it('三個 [glink]：graphic／enterimg、大小＝選項 PNG、測試文字、跳到各自的標籤', () => {
    for (const res of [1920, 1280] as const) {
      const s = doc({ resolution: res });
      const { choiceExample } = tyranoCode(s, 'x');
      const choice = novelParts(s).find((p) => p.id === 'choice:normal')!;
      const L = novelLayout(s.design);
      const texts = [s.texts.choice1, s.texts.choice2, s.texts.choice3];
      for (let i = 0; i < 3; i++) {
        const a = tagAttrs(choiceExample, 'glink', i);
        expect(a.graphic).toBe('uiframe/choice_buttons/choice_btn_normal.png');
        expect(a.enterimg).toBe('uiframe/choice_buttons/choice_btn_hover.png');
        expect(a.name).toBe('uiframe_choice');
        expect(a.text).toBe(texts[i]);
        expect(Number(a.width)).toBe(choice.width);
        expect(Number(a.height)).toBe(choice.height);
        expect(Number(a.x)).toBe(Math.round(((L.choices[i].x - CHOICE_PAD) * res) / 1920));
        expect(Number(a.y)).toBe(Math.round(((L.choices[i].y - CHOICE_PAD) * res) / 1920));
        expect(a.target).toBe(`*uiframe_choice_${i + 1}`);
        expect(choiceExample).toContain(`\n*uiframe_choice_${i + 1}\n`);
      }
      expect(choiceExample).toContain('\n[s]\n');
      expect(choiceExample).toContain('\n*uiframe_choice_end\n');
    }
  });

  it('文字裡的雙引號與方括號換成全形；空白的選項用「選項 n」', () => {
    expect(tagText('他說"走"[r]\n好')).toBe('他說＂走＂［r］ 好');
    const s = doc();
    const { choiceExample } = tyranoCode(
      { ...s, texts: { ...s.texts, choice1: '"[x]"', choice2: '' } },
      'x',
    );
    expect(tagAttrs(choiceExample, 'glink', 0).text).toBe('＂［x］＂');
    expect(tagAttrs(choiceExample, 'glink', 1).text).toBe('選項 2');
  });

  it('開頭是「&」「%」的文字不會被當成 JavaScript 或巨集參數；前後空白與「undefined」', () => {
    /* kag.tag.js 的 convertEntity 只看值的第一個字 */
    expect(tagText('&f.money')).toBe('＆f.money');
    expect(tagText('  &alert(1)')).toBe('＆alert(1)');
    expect(tagText('%storage')).toBe('％storage');
    expect(tagText('50%&up')).toBe('50%&up');
    expect(tagText(' 走吧 ')).toBe('走吧');
    expect(tagText('undefined')).toBe('ｕｎｄｅｆｉｎｅｄ');
    const s = doc();
    const { choiceExample } = tyranoCode(
      { ...s, texts: { ...s.texts, choice1: '&tf.x', choice2: '%a', choice3: '100%' } },
      'x',
    );
    expect(tagAttrs(choiceExample, 'glink', 0).text).toBe('＆tf.x');
    expect(tagAttrs(choiceExample, 'glink', 1).text).toBe('％a');
    expect(tagAttrs(choiceExample, 'glink', 2).text).toBe('100%');
    for (const line of choiceExample.split('\n'))
      if (line.startsWith('[glink')) expect(line).not.toMatch(/="[&%]/);
  });
});

describe('檔名對得上 ZIP', () => {
  it('程式碼用到的圖片都在 PNG 清單裡（每個預設、兩種解析度）', () => {
    for (const p of PRESETS)
      for (const res of [1920, 1280] as const) {
        const s = { ...doc({ resolution: res }), design: p.design };
        const files = new Set(novelParts(s).map((x) => x.file));
        const used = referencedImages(tyranoCode(s, 'x'));
        /* 訊息框、名字框、游標＋系統按鈕 8 × 3＋選項 2（自動、快進的進行中圖＝按下的圖） */
        expect(used.length).toBe(3 + 8 * 3 + 2);
        for (const f of used) expect(files.has(f), f).toBe(true);
      }
  });

  it('補充樣式：選項的文字一行、垂直置中，左右讓出透明邊與裝飾；不用 clip-path', () => {
    for (const p of PRESETS)
      for (const res of [1920, 1280] as const) {
        const s = { ...doc({ resolution: res }), design: p.design };
        const { css } = tyranoCode(s, 'x');
        const ch = novelParts(s).find((x) => x.id === 'choice:normal')!;
        const side = Math.round(
          ((CHOICE_PAD + labelInset(p.design, p.design.choiceW, 68)) * res) / 1920,
        );
        expect(choiceSidePadding(s)).toBe(side);
        expect(css).toContain('.uiframe_choice.button_graphic {');
        expect(css).toContain('box-sizing: border-box;');
        expect(css).toContain(`padding: 0 ${side}px;`);
        expect(css).toContain(`line-height: ${ch.height}px;`);
        expect(css).toContain('white-space: nowrap;');
        expect(css).toContain('text-overflow: ellipsis;');
        expect(css).not.toContain('clip-path');
        /* 左右的內距至少是透明邊＋16 */
        expect(side).toBeGreaterThanOrEqual(Math.round(((CHOICE_PAD + 16) * res) / 1920));
      }
  });
});
