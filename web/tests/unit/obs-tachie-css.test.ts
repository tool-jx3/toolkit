/**
 * Discord 通話立繪產生器的輸出 CSS（規格 docs/refactor/specs/obs-tachie.md 3.4、F61～F75）：
 * 每個選項對輸出的影響、錨點位置、說話效果、變暗與隱藏、名字標籤、跳脫。
 * 套用後的實際效果（位置、動畫時間點）在 e2e 的模擬 DOM 上量。
 */
import { describe, expect, it } from 'vitest';
import { STREAMKIT, streamkitUserAvatar, streamkitUserSpeaking } from '@/ccfolia';
import { barBackground, buildTachieCss, glowFilter, labelFontFamily } from '@/tools/obs-tachie/css';
import { createPreset, type Preset, type TachieUser } from '@/tools/obs-tachie/model';

const ID = '123456789012345678';
const USER: TachieUser = { id: ID, memo: '阿明', name: '艾琳' };
const IMG = 'data:image/png;base64,iVBORw0KGgo=';
const NATURAL = { width: 300, height: 600 };

function preset(patch: (p: Preset) => void = () => {}): Preset {
  const p = createPreset('p1');
  p.name = '平常';
  patch(p);
  return p;
}

function css(
  patch: (p: Preset) => void = () => {},
  o: { user?: TachieUser | null; image?: string | null; natural?: typeof NATURAL | null } = {},
) {
  return buildTachieCss({
    user: o.user === undefined ? USER : o.user,
    preset: preset(patch),
    image: o.image === undefined ? IMG : o.image,
    natural: o.natural === undefined ? NATURAL : o.natural,
  });
}

/** 取出某個選擇器（完全相同）的宣告區塊 */
function block(text: string, selector: string): string {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|\\n)${esc} \\{\\n([\\s\\S]*?)\\n\\}`).exec(text);
  if (!m) throw new Error(`找不到 ${selector}\n${text}`);
  return m[1];
}

/** 區塊裡某個屬性的值（不含 !important） */
function decl(blockText: string, prop: string): string | undefined {
  for (const line of blockText.split('\n')) {
    const m = /^\s*([\w-]+): (.*?)( !important)?;$/.exec(line);
    if (m && m[1] === prop) return m[2];
  }
  return undefined;
}

const isImportant = (blockText: string, prop: string) =>
  new RegExp(`(?:^|\\n)\\s*${prop}: .* !important;`).test(blockText);

describe('整體（F61、F62、F73）', () => {
  it('沒有使用者時只輸出一行提示註解', () => {
    const t = css(undefined, { user: null });
    expect(t.trim().split('\n')).toHaveLength(1);
    expect(t).toMatch(/^\/\* .+ \*\/\n$/);
  });

  it('開頭說明：備忘名稱（ID）、預設集名稱、Streamkit 網址範例、來源大小', () => {
    const t = css();
    expect(t).toContain(`阿明（${ID}） × 平常`);
    expect(t).toContain('https://streamkit.discord.com/overlay/voice/');
    expect(t).toContain('寬 1920 × 高 1080');
    /* 沒有備忘名稱時只寫 ID */
    expect(css(undefined, { user: { id: ID, memo: '', name: '' } })).toContain(`立繪：${ID}。`);
  });

  it('Streamkit 的元素只用 class 前綴選取，全部隱藏；頁面不出現捲軸', () => {
    const t = css();
    expect(block(t, STREAMKIT.container)).toContain('display: none !important');
    expect(t).not.toMatch(/Voice_\w+__[A-Za-z0-9]/);
    const page = block(t, 'html,\nbody');
    expect(decl(page, 'overflow')).toBe('hidden');
    expect(decl(page, 'background')).toBe('transparent');
  });

  it('立繪畫在 #root（整個換成圖片），固定位置，與 Streamkit 的人數無關', () => {
    const root = block(css(), '#root');
    expect(decl(root, 'content')).toBe(`url("${IMG}")`);
    expect(decl(root, 'position')).toBe('fixed');
    expect(decl(root, 'display')).toBe('block');
  });

  it('沒有圖片時 #root 不顯示，註解說明', () => {
    const t = css(undefined, { image: null });
    expect(decl(block(t, '#root'), 'display')).toBe('none');
    expect(t).not.toContain('@keyframes');
  });
});

describe('尺寸（F64、F74、3.4.3）', () => {
  it('量得到實際尺寸：寬高寫死，註解附數字', () => {
    const t = css();
    const root = block(t, '#root');
    expect(decl(root, 'width')).toBe('300px');
    expect(decl(root, 'height')).toBe('600px');
    expect(t).toContain('繪製尺寸 300 × 600px');
  });

  it('指定寬度 150 → 150 × 300（高度四捨五入，至少 1px）', () => {
    let root = block(
      css((p) => (p.width = 150)),
      '#root',
    );
    expect(decl(root, 'width')).toBe('150px');
    expect(decl(root, 'height')).toBe('300px');
    root = block(
      css((p) => (p.width = 101), { natural: { width: 300, height: 1 } }),
      '#root',
    );
    expect(decl(root, 'height')).toBe('1px');
    root = block(
      css((p) => (p.width = 100), { natural: { width: 300, height: 601 } }),
      '#root',
    );
    expect(decl(root, 'height')).toBe('200px');
  });

  it('量不到時退回圖片本身的大小（有指定寬度時用那個寬度）', () => {
    let t = css(undefined, { natural: null });
    let root = block(t, '#root');
    expect(decl(root, 'width')).toBe('auto');
    expect(decl(root, 'height')).toBe('auto');
    expect(t).toContain('量不到圖片的實際尺寸');
    t = css((p) => (p.width = 200), { natural: null });
    root = block(t, '#root');
    expect(decl(root, 'width')).toBe('200px');
    expect(decl(root, 'height')).toBe('auto');
  });
});

describe('位置（F63、3.4.2）', () => {
  const pos = (anchor: Preset['anchor'], x = 0, y = 0) =>
    block(
      css((p) => {
        p.anchor = anchor;
        p.offsetX = x;
        p.offsetY = y;
      }),
      '#root',
    );

  it('左下：左緣與下緣的距離', () => {
    const r = pos('bottom-left', 100, 50);
    expect([decl(r, 'left'), decl(r, 'right'), decl(r, 'top'), decl(r, 'bottom')]).toEqual([
      '100px',
      'auto',
      'auto',
      '50px',
    ]);
  });

  it('右上：右緣與上緣的距離（改來源大小也維持）', () => {
    const r = pos('top-right', 40, 30);
    expect([decl(r, 'left'), decl(r, 'right'), decl(r, 'top'), decl(r, 'bottom')]).toEqual([
      'auto',
      '40px',
      '30px',
      'auto',
    ]);
  });

  it('正中央：兩邊距離＋自動外距置中（不用位移，彈跳不會蓋掉置中）；正值往右、往上', () => {
    const r = pos('center', 100, 50);
    expect(decl(r, 'left')).toBe('100px');
    expect(decl(r, 'right')).toBe('-100px');
    expect(decl(r, 'top')).toBe('-50px');
    expect(decl(r, 'bottom')).toBe('50px');
    expect(decl(r, 'margin-left')).toBe('auto');
    expect(decl(r, 'margin-top')).toBe('auto');
    expect(r).not.toContain('transform');
  });

  it('其他錨點的組合', () => {
    expect(decl(pos('top'), 'margin-left')).toBe('auto');
    expect(decl(pos('top'), 'top')).toBe('0px');
    expect(decl(pos('left', 5, 7), 'left')).toBe('5px');
    expect(decl(pos('left', 5, 7), 'top')).toBe('-7px');
    expect(decl(pos('right', 5), 'right')).toBe('5px');
    expect(decl(pos('bottom-right', 5, 6), 'bottom')).toBe('6px');
    expect(decl(pos('bottom', -20, 0), 'left')).toBe('-20px');
    expect(decl(pos('bottom', -20, 0), 'right')).toBe('20px');
  });
});

describe('說話效果（F65～F69、3.4.4）', () => {
  const speaking = streamkitUserSpeaking(ID);

  it('預設：彈跳 10px＋外框光暈 2px，週期 750ms、先慢後快再慢、無限循環', () => {
    const t = css();
    const rule = block(t, `#root:has(${speaking})`);
    expect(decl(rule, 'animation')).toBe('tk-tachie-talk 750ms ease-in-out infinite');
    expect(t).toContain('transform: translateY(0);');
    expect(t).toContain('transform: translateY(-10px);');
    expect(t).toContain(`filter: ${glowFilter('#ffffff', 2, 2)};`);
    expect(t).toContain(`filter: ${glowFilter('#ffffff', 2, 8)};`);
    expect(t).not.toContain('opacity: 0.35');
  });

  it('外框光暈：柔和光暈（模糊半徑 w → 4w）＋往右下、左上、左下、右上錯開 w 的實心外框', () => {
    expect(glowFilter('#ff0000', 3, 12)).toBe(
      'drop-shadow(0 0 12px #ff0000) drop-shadow(3px 3px 0 #ff0000) drop-shadow(-3px -3px 0 #ff0000) drop-shadow(-3px 3px 0 #ff0000) drop-shadow(3px -3px 0 #ff0000)',
    );
    /* 顏色不合法時改白色 */
    expect(glowFilter('red;}', 1, 1)).toContain('#ffffff');
    const t = css((p) => {
      p.glowColor = '#00ff00';
      p.glowWidth = 6;
    });
    expect(t).toContain('drop-shadow(0 0 24px #00ff00)');
  });

  it('閃爍：不透明度 1 → 0.35 → 1', () => {
    const t = css((p) => {
      p.bounce = false;
      p.glow = false;
      p.blink = true;
    });
    expect(t).toContain('opacity: 1;');
    expect(t).toContain('opacity: 0.35;');
    expect(t).not.toContain('transform: translateY');
    expect(t).not.toContain('drop-shadow');
  });

  it('全部關閉（或彈跳 0 且其他關閉）時說話不動', () => {
    for (const patch of [
      (p: Preset) => {
        p.bounce = false;
        p.glow = false;
        p.blink = false;
      },
      (p: Preset) => {
        p.bounceHeight = 0;
        p.glow = false;
      },
    ]) {
      const t = css(patch);
      expect(t).not.toContain('@keyframes');
      expect(t).not.toContain(speaking);
    }
  });

  it('週期與彈跳高度', () => {
    const t = css((p) => {
      p.period = 1200;
      p.bounceHeight = 40;
    });
    expect(t).toContain('tk-tachie-talk 1200ms ease-in-out infinite');
    expect(t).toContain('translateY(-40px)');
  });

  it('動畫改到的屬性不加 !important（否則動畫失效）；animation 本身加', () => {
    const t = css((p) => (p.blink = true));
    const kf = /@keyframes tk-tachie-talk \{[\s\S]*?\n\}/.exec(t)?.[0] ?? '';
    expect(kf).not.toContain('!important');
    expect(isImportant(block(t, `#root:has(${speaking})`), 'animation')).toBe(true);
    expect(block(t, '#root')).not.toMatch(/\n\s*(transform|filter|opacity):/);
  });

  it('只認這個人的頭像（以頭像網址裡的 ID）', () => {
    const t = css(undefined, { user: { id: '42', memo: '', name: '' } });
    expect(t).toContain('[src*="/avatars/42/"]');
    expect(t).not.toContain(ID);
  });
});

describe('安靜時變暗、不在頻道時隱藏（F42、F43、F70、F71、3.4.5）', () => {
  const speaking = streamkitUserSpeaking(ID);
  const avatar = streamkitUserAvatar(ID);

  it('變暗：沒在說話時亮度 50%（說話時規則不符合，自然恢復）', () => {
    const t = css((p) => (p.dim = true));
    expect(decl(block(t, `#root:not(:has(${speaking})):not(#tk-x)`), 'filter')).toBe(
      'brightness(0.5)',
    );
    expect(css()).not.toContain('brightness');
  });

  it('不在頻道時隱藏：立繪與名字一起隱藏', () => {
    const t = css((p) => {
      p.hideAway = true;
      p.label.show = true;
    });
    const rule = block(t, `#root:not(:has(${avatar})),\nbody:not(:has(${avatar}))::after`);
    expect(decl(rule, 'display')).toBe('none');
    expect(isImportant(rule, 'display')).toBe(true);
    expect(t).toContain('隱藏立繪與名字');
  });

  it('不顯示名字時只隱藏立繪；關閉時沒有隱藏規則', () => {
    const t = css((p) => (p.hideAway = true));
    expect(decl(block(t, `#root:not(:has(${avatar}))`), 'display')).toBe('none');
    expect(css()).not.toContain(':not(:has(');
  });

  it('名字規則不提高權重，隱藏規則蓋得過', () => {
    const t = css((p) => {
      p.hideAway = true;
      p.label.show = true;
    });
    expect(t).toContain('\nbody::after {');
    expect(t).not.toContain('body:not(#tk-x)::after');
  });
});

describe('名字標籤（F33～F40、F72、3.4.6）', () => {
  const label = (patch: (p: Preset) => void = () => {}, o: Parameters<typeof css>[1] = {}) =>
    block(
      css((p) => {
        p.label.show = true;
        patch(p);
      }, o),
      'body::after',
    );

  it('沒開「顯示名字」或名字是空的時不畫', () => {
    expect(css()).not.toContain('::after {');
    expect(
      css((p) => (p.label.show = true), { user: { id: ID, memo: ' ', name: '  ' } }),
    ).not.toContain('body::after {');
  });

  it('內容：畫面上的名字，空白時用備忘名稱；引號、反斜線跳脫，換行與控制字元換成空白', () => {
    expect(decl(label(), 'content')).toBe('"艾琳"');
    expect(decl(label(undefined, { user: { id: ID, memo: '阿明', name: '' } }), 'content')).toBe(
      '"阿明"',
    );
    expect(
      decl(
        label(undefined, { user: { id: ID, memo: '', name: ' 他說"嗨"\\\n再見\t ' } }),
        'content',
      ),
    ).toBe('"他說\\"嗨\\"\\\\ 再見"');
  });

  it('備忘名稱寫進註解時不會提早結束註解', () => {
    const t = css(undefined, { user: { id: ID, memo: '壞*/名字', name: '' } });
    expect(t).toContain('壞* /名字');
    expect(t.match(/\*\//g)?.length).toBe(t.match(/\/\*/g)?.length);
  });

  it('文字大小（至少 1px）、顏色（不合法改白）、粗體 700／400、行高 1.2', () => {
    let b = label((p) => {
      p.label.size = 0;
      p.label.color = 'url(x)';
      p.label.bold = false;
    });
    expect(decl(b, 'font-size')).toBe('1px');
    expect(decl(b, 'color')).toBe('#ffffff');
    expect(decl(b, 'font-weight')).toBe('400');
    expect(decl(b, 'line-height')).toBe('1.2');
    b = label((p) => (p.label.color = '#ff8800'));
    expect(decl(b, 'color')).toBe('#ff8800');
    expect(decl(b, 'font-weight')).toBe('700');
  });

  it('描邊：8 個方向各位移描邊寬度；寬度 0 或關閉時不畫', () => {
    expect(decl(label(), 'text-shadow')).toBe(
      '0 -3px 0 #000000, 3px -3px 0 #000000, 3px 0 0 #000000, 3px 3px 0 #000000, 0 3px 0 #000000, -3px 3px 0 #000000, -3px 0 0 #000000, -3px -3px 0 #000000',
    );
    expect(
      decl(
        label((p) => (p.label.strokeWidth = 0)),
        'text-shadow',
      ),
    ).toBe('none');
    expect(
      decl(
        label((p) => (p.label.stroke = false)),
        'text-shadow',
      ),
    ).toBe('none');
  });

  it('字幕條：底色＝顏色＋不透明度（3 或 6 位色碼才套）、留白、圓角', () => {
    const b = label((p) => (p.label.bar = true));
    expect(decl(b, 'background-color')).toBe('rgba(0, 0, 0, 0.6)');
    expect(decl(b, 'padding')).toBe('6px 12px');
    expect(decl(b, 'border-radius')).toBe('6px');
    expect(barBackground({ barColor: '#fff', barOpacity: 50 })).toBe('rgba(255, 255, 255, 0.5)');
    expect(barBackground({ barColor: '#11223380', barOpacity: 50 })).toBe('#11223380');
    const z = label((p) => {
      p.label.bar = true;
      p.label.barPadX = 0;
      p.label.barPadY = 0;
      p.label.barRadius = 0;
    });
    expect(decl(z, 'padding')).toBe('0');
    expect(decl(z, 'border-radius')).toBe('0');
    expect(decl(label(), 'background-color')).toBe('transparent');
  });

  it('字型：Google 字型加 @import 與後備字型；電腦字型可以逗號列多個、去掉危險字元、通用字族不加引號；空白＝沿用頁面字型', () => {
    const t = css((p) => (p.label.show = true));
    expect(t).toContain('@import url("https://fonts.googleapis.com/css2?family=Noto+Sans+TC');
    expect(
      labelFontFamily({ source: 'local', family: '123 Font, 微軟正黑體;}, serif', weight: 400 }),
    ).toMatch(/^"123 Font", "微軟正黑體", serif, /);
    expect(labelFontFamily({ source: 'local', family: '  ', weight: 400 })).toBeNull();
    const b = label((p) => (p.label.font = { source: 'local', family: '', weight: 400 }));
    expect(decl(b, 'font-family')).toBeUndefined();
    /* 不顯示名字時不載入字型 */
    expect(css()).not.toContain('@import');
  });

  describe('水平位置與寬度', () => {
    it('知道寬度、沒有字幕條：名字框寬＝W，位置與立繪相同再加水平偏移，文字在框內對齊', () => {
      const b = label((p) => {
        p.offsetX = 100;
        p.label.x = 10;
        p.label.align = 'right';
      });
      expect(decl(b, 'width')).toBe('300px');
      expect(decl(b, 'left')).toBe('110px');
      expect(decl(b, 'text-align')).toBe('right');
      expect(decl(b, 'transform')).toBe('none');
    });

    it('右錨點＋鋪滿：右緣對齊立繪右緣（距右緣）', () => {
      const b = label((p) => {
        p.anchor = 'top-right';
        p.offsetX = 40;
        p.label.x = 10;
        p.label.bar = true;
        p.label.barWidth = 'fill';
      });
      expect(decl(b, 'right')).toBe('30px');
      expect(decl(b, 'left')).toBe('auto');
      expect(decl(b, 'width')).toBe('300px');
    });

    it('中央錨點＋知道寬度：框的左緣＝畫面中央＋偏移−W/2', () => {
      const b = label((p) => (p.anchor = 'bottom'));
      expect(decl(b, 'left')).toBe('calc(50% - 150px)');
    });

    it('字幕條配合文字：依對齊把字幕條的左緣／中心／右緣對齊立繪框', () => {
      const fitBar = (
        align: 'left' | 'center' | 'right',
        anchor: Preset['anchor'] = 'bottom-left',
      ) =>
        label((p) => {
          p.anchor = anchor;
          p.label.bar = true;
          p.label.align = align;
        });
      expect([decl(fitBar('left'), 'left'), decl(fitBar('left'), 'transform')]).toEqual([
        '0px',
        'none',
      ]);
      expect([decl(fitBar('center'), 'left'), decl(fitBar('center'), 'transform')]).toEqual([
        '150px',
        'translate(-50%, 0)',
      ]);
      expect([decl(fitBar('right'), 'right'), decl(fitBar('right'), 'width')]).toEqual([
        'calc(100% - 300px)',
        'max-content',
      ]);
      expect(decl(fitBar('left', 'top-right'), 'left')).toBe('calc(100% - 300px)');
      expect(decl(fitBar('right', 'top-right'), 'right')).toBe('0px');
    });

    it('不知道寬度：縮成文字寬，對齊錨點那一側', () => {
      const unknown = (anchor: Preset['anchor']) =>
        label(
          (p) => {
            p.anchor = anchor;
            p.offsetX = 20;
            p.label.align = 'right';
          },
          { natural: null },
        );
      expect([decl(unknown('bottom-left'), 'left'), decl(unknown('bottom-left'), 'width')]).toEqual(
        ['20px', 'max-content'],
      );
      expect(decl(unknown('bottom-right'), 'right')).toBe('20px');
      expect(decl(unknown('bottom'), 'left')).toBe('calc(50% + 20px)');
      expect(decl(unknown('bottom'), 'transform')).toBe('translate(-50%, 0)');
      expect(decl(unknown('bottom-left'), 'text-align')).toBe('left');
    });
  });

  it('垂直位置：下＝距下緣＋偏移；上＝距上緣−偏移；中央＝中心往上', () => {
    const v = (anchor: Preset['anchor'], y: number, ly: number) =>
      label((p) => {
        p.anchor = anchor;
        p.offsetY = y;
        p.label.y = ly;
      });
    expect(decl(v('bottom-left', 0, -8), 'bottom')).toBe('-8px');
    expect(decl(v('bottom-left', 20, 8), 'bottom')).toBe('28px');
    expect(decl(v('top-right', 30, 10), 'top')).toBe('20px');
    const c = v('center', 50, 10);
    expect(decl(c, 'top')).toBe('calc(50% - 60px)');
    expect(decl(c, 'transform')).toBe('translate(0, -50%)');
  });

  it('名字的基準寬度寫進註解（用實際寬度時提醒換圖要重新輸出）', () => {
    expect(css((p) => (p.label.show = true))).toContain('名字的基準寬度 300px（圖片的實際寬度');
    expect(
      css((p) => {
        p.label.show = true;
        p.width = 200;
      }),
    ).toContain('名字的基準寬度 200px。');
  });
});
