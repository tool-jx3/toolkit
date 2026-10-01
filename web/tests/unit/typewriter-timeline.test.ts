/**
 * 打字機動畫產生器：規格附件 docs/refactor/specs/typewriter.examples.json 的逐項比對（時間軸與可見度）。
 * - 打字 13 組：格數、每格看得到的字、每字透明度（±0.001）、整體透明度、旋轉角度、延遲（±0.5 ms）。
 * - 故障 5 組：哪一格哪個位置是亂碼。
 * - 卡拉 OK 5 組：每行顯示文字、會不會唱、開始時間與長度（±0.001 秒）、結束時間、總格數。
 * - 卡拉 OK 五種顯示方式（7 組）在 18 個時間點的每行可見度（±0.01）、所在行、字身框上緣、實際淡化秒數。
 * - 片尾名單 2 組：逐格位置、分段的格數；檔名依主控裁定改用共用的檔名清理（保留中文）。
 */
import { describe, expect, it } from 'vitest';
import { segmentBaseName } from '@/tools/typewriter/filename';
import { karaokeRowTop } from '@/tools/typewriter/layout';
import type { FadeKind, ShapeKind } from '@/tools/typewriter/settings';
import {
  creditSegments,
  creditsFrameCount,
  creditsTop,
  glitchChar,
  glitchPattern,
  glitchSegments,
  glitchTimeline,
  karaokeFrames,
  karaokeShowPlan,
  parseLyrics,
  scheduleLyrics,
  typingScreenAlphas,
  typingScreenText,
  typingTimeline,
} from '@/tools/typewriter/timeline';
import examples from '../../../docs/refactor/specs/typewriter.examples.json';

interface TypingExample {
  編號: string;
  說明: string;
  設定: {
    文字: string;
    出現方向: '正向' | '反向';
    淡出: '不淡出' | '整體淡出' | '一字接一字淡出';
    淡出毫秒: number;
    FPS: number;
    停留毫秒: number;
    圖形: '不使用' | '圓' | '方' | '三角';
    每格旋轉度: number;
  };
  格數: number;
  總毫秒: number;
  逐格: {
    畫面文字: string;
    延遲毫秒: number;
    各字透明度?: number[];
    整體透明度?: number;
    旋轉度?: number;
  }[];
}

interface GlitchExample {
  編號: string;
  設定: { 文字: string; 亂碼格數: number; 同時亂碼: boolean; FPS: number; 停留毫秒: number };
  格數: number;
  逐格: { 畫面文字: string; 延遲毫秒: number }[];
}

interface KaraokeExample {
  編號: string;
  設定: { 歌詞: string; 總秒數: number; 前奏秒數: number; 分配: '按字數' | '等長'; FPS: number };
  結束秒數: number;
  '格數（含最後停留格）': number;
  各行: { 顯示文字: string; 會唱: boolean; 開始秒數: number; 長度秒數: number }[];
}

interface VisibilityExample {
  方式: string;
  n: number;
  實際淡化秒數: number;
  各句所在行: number[];
  各句字身框上緣y: number[];
  取樣: { 秒: number; 各句可見度: number[] }[];
}

interface CreditsExample {
  編號: string;
  設定: {
    文字: string;
    畫布?: [number, number];
    字級?: number;
    行距倍數?: number;
    FPS: number;
    總秒數: number;
    分段?: boolean;
  };
  格數?: number;
  第一行上緣y?: number[];
  輸出?: { 檔名: string; 格數: number }[];
}

const doc = examples as unknown as {
  打字: TypingExample[];
  故障: GlitchExample[];
  卡拉OK: KaraokeExample[];
  卡拉OK可見度: VisibilityExample[];
  片尾名單: CreditsExample[];
};

const FADE: Record<TypingExample['設定']['淡出'], FadeKind> = {
  不淡出: 'none',
  整體淡出: 'whole',
  一字接一字淡出: 'each',
};
const SHAPE: Record<TypingExample['設定']['圖形'], ShapeKind> = {
  不使用: 'none',
  圓: 'circle',
  方: 'square',
  三角: 'triangle',
};

describe('打字模式的時間軸（附件「打字」13 組）', () => {
  it('附件有 13 組', () => expect(doc.打字).toHaveLength(13));
  for (const ex of doc.打字) {
    it(`${ex.編號} ${ex.說明}`, () => {
      const s = ex.設定;
      const tl = typingTimeline({
        text: s.文字,
        reverse: s.出現方向 === '反向',
        fade: FADE[s.淡出],
        fadeMs: s.淡出毫秒,
        fps: s.FPS,
        holdMs: s.停留毫秒,
        shape: SHAPE[s.圖形] !== 'none',
        rotate: s.每格旋轉度,
      });
      expect(tl.frames).toHaveLength(ex.格數);
      const total = tl.frames.reduce((a, f) => a + f.ms, 0);
      expect(Math.abs(total - ex.總毫秒)).toBeLessThan(0.5);
      ex.逐格.forEach((want, i) => {
        const f = tl.frames[i];
        expect(typingScreenText(tl, i), `第 ${i + 1} 格的文字`).toBe(want.畫面文字);
        expect(Math.abs(f.ms - want.延遲毫秒), `第 ${i + 1} 格的延遲`).toBeLessThanOrEqual(0.5);
        const alphas = typingScreenAlphas(tl, i);
        const wantAlphas = want.各字透明度 ?? alphas.map(() => 1);
        expect(alphas).toHaveLength(wantAlphas.length);
        alphas.forEach((a, k) => {
          expect(Math.abs(a - wantAlphas[k]), `第 ${i + 1} 格第 ${k + 1} 字`).toBeLessThan(0.001);
        });
        expect(Math.abs(f.alpha - (want.整體透明度 ?? 1))).toBeLessThan(0.001);
        if (want.旋轉度 !== undefined) expect(f.rotation).toBeCloseTo(want.旋轉度, 6);
        else expect(f.rotation).toBe(0);
      });
    });
  }

  it('停留格的位置：不淡出／整體淡出＝打完那格；逐字淡出＝最後一格', () => {
    const base = {
      text: 'ABCD',
      reverse: false,
      fadeMs: 300,
      fps: 10,
      holdMs: 2000,
      shape: false,
      rotate: 0,
    };
    const whole = typingTimeline({ ...base, fade: 'whole' });
    expect(whole.frames.findIndex((f) => f.hold)).toBe(3);
    const each = typingTimeline({ ...base, fade: 'each' });
    expect(each.frames.findIndex((f) => f.hold)).toBe(each.frames.length - 1);
  });

  it('擴充平面的字以碼位為單位（不拆成兩半）', () => {
    const tl = typingTimeline({
      text: '𪜶😀',
      reverse: false,
      fade: 'none',
      fadeMs: 0,
      fps: 10,
      holdMs: 500,
      shape: false,
      rotate: 0,
    });
    expect(tl.frames).toHaveLength(2);
    expect(typingScreenText(tl, 0)).toBe('𪜶');
  });

  it('沒有文字時沒有影格', () => {
    const tl = typingTimeline({
      text: '',
      reverse: false,
      fade: 'whole',
      fadeMs: 1000,
      fps: 12,
      holdMs: 2000,
      shape: false,
      rotate: 0,
    });
    expect(tl.frames).toEqual([]);
  });
});

describe('故障模式的時間軸（附件「故障」5 組）', () => {
  for (const ex of doc.故障) {
    it(ex.編號, () => {
      const s = ex.設定;
      const tl = glitchTimeline({
        text: s.文字,
        intensity: s.亂碼格數,
        together: s.同時亂碼,
        fps: s.FPS,
        holdMs: s.停留毫秒,
      });
      expect(tl.frames).toHaveLength(ex.格數);
      ex.逐格.forEach((want, i) => {
        expect(glitchPattern(tl, i), `第 ${i + 1} 格`).toBe(want.畫面文字);
        expect(Math.abs(tl.frames[i].ms - want.延遲毫秒)).toBeLessThanOrEqual(0.5);
      });
    });
  }

  it('亂碼是決定性的：同樣的種子得到同樣的字', () => {
    const segs = glitchSegments({ latin: true, kana: true, hangul: true, shapes: true });
    expect(glitchChar(42, 3, 7, segs)).toBe(glitchChar(42, 3, 7, segs));
  });

  it('全部勾選時 7 段約等機率：拉丁約 1/7、假名／韓文／圖形各約 2/7', () => {
    const segs = glitchSegments({ latin: true, kana: true, hangul: true, shapes: true });
    expect(segs).toHaveLength(7);
    const n = 14000;
    const count = { latin: 0, kana: 0, hangul: 0, shapes: 0 };
    for (let i = 0; i < n; i++) {
      const c = glitchChar(12345, i, i % 13, segs).codePointAt(0)!;
      if (c <= 0x7e) count.latin++;
      else if (c >= 0x3041 && c <= 0x30fa) count.kana++;
      else if ((c >= 0x3131 && c <= 0x318e) || (c >= 0xac00 && c <= 0xd7a3)) count.hangul++;
      else if (c >= 0x2500 && c <= 0x25ff) count.shapes++;
    }
    expect(count.latin / n).toBeCloseTo(1 / 7, 1);
    expect(count.kana / n).toBeCloseTo(2 / 7, 1);
    expect(count.hangul / n).toBeCloseTo(2 / 7, 1);
    expect(count.shapes / n).toBeCloseTo(2 / 7, 1);
  });

  it('全部不勾時當成只勾拉丁（U+0021～U+007E）', () => {
    const segs = glitchSegments({ latin: false, kana: false, hangul: false, shapes: false });
    for (let i = 0; i < 500; i++) {
      const c = glitchChar(7, i, 0, segs).codePointAt(0)!;
      expect(c).toBeGreaterThanOrEqual(0x21);
      expect(c).toBeLessThanOrEqual(0x7e);
    }
  });
});

describe('卡拉 OK 的時間（附件「卡拉OK」5 組）', () => {
  for (const ex of doc.卡拉OK) {
    it(ex.編號, () => {
      const s = ex.設定;
      const sched = scheduleLyrics(parseLyrics(s.歌詞), {
        duration: s.總秒數,
        intro: s.前奏秒數,
        alloc: s.分配 === '按字數' ? 'chars' : 'equal',
      });
      expect(sched.lines).toHaveLength(ex.各行.length);
      ex.各行.forEach((want, i) => {
        const l = sched.lines[i];
        expect(l.text, `第 ${i + 1} 行的顯示文字`).toBe(want.顯示文字);
        expect(l.sung).toBe(want.會唱);
        expect(Math.abs(l.start - want.開始秒數)).toBeLessThan(0.001);
        expect(Math.abs(l.length - want.長度秒數)).toBeLessThan(0.001);
      });
      expect(sched.end).toBeCloseTo(ex.結束秒數, 6);
      const frames = karaokeFrames(sched, s.FPS, 1500);
      expect(frames).toHaveLength(ex['格數（含最後停留格）']);
      expect(frames.at(-1)).toMatchObject({ hold: true, ms: 1500 });
      expect(frames.at(-1)!.t).toBeCloseTo(ex.結束秒數, 9);
    });
  }

  it('只有空白的歌詞沒有影格', () => {
    const sched = scheduleLyrics(parseLyrics('  \n\t'), {
      duration: 8,
      intro: 0.5,
      alloc: 'chars',
    });
    expect(karaokeFrames(sched, 20, 1500)).toEqual([]);
  });
});

describe('卡拉 OK 五種顯示方式的可見度（附件「卡拉OK可見度」）', () => {
  /* 五句各 1 秒、前奏等待 0.5 秒；畫布 720×300、字級 48、行距 1.5、垂直置中 */
  const sched = scheduleLyrics(parseLyrics('一 | 1\n二 | 1\n三 | 1\n四 | 1\n五 | 1'), {
    duration: 5,
    intro: 0.5,
    alloc: 'chars',
  });
  const MODE: Record<string, 'all' | 'reveal' | 'current' | 'rotate' | 'page'> = {
    全部一直顯示: 'all',
    唱到才出現: 'reveal',
    只顯示正在唱的: 'current',
    固定n行逐句輪替: 'rotate',
    固定n行整頁更換: 'page',
  };
  for (const ex of doc.卡拉OK可見度) {
    it(`${ex.方式}（n＝${ex.n}）`, () => {
      const mode = MODE[ex.方式.replace(/\s/g, '')];
      expect(mode).toBeTruthy();
      const plan = karaokeShowPlan(sched, mode, ex.n, 0.25);
      expect(plan.fade).toBeCloseTo(ex.實際淡化秒數, 9);
      expect(plan.rowOf).toEqual(ex.各句所在行);
      ex.各句所在行.forEach((row, k) => {
        expect(karaokeRowTop(row, plan.rows, 'middle', 300, 48, 1.5)).toBeCloseTo(
          ex.各句字身框上緣y[k],
          6,
        );
      });
      for (const sample of ex.取樣) {
        const got = plan.alphaAt(sample.秒);
        sample.各句可見度.forEach((v, k) => {
          expect(Math.abs(got[k] - v), `${sample.秒} 秒第 ${k + 1} 句`).toBeLessThanOrEqual(0.01);
        });
      }
    });
  }
});

describe('片尾名單（附件「片尾名單」）', () => {
  it('C01 逐格位置：第一行字身框上緣從畫布高等速移到 −整段高', () => {
    const ex = doc.片尾名單.find((e) => e.編號 === 'C01')!;
    const s = ex.設定;
    const n = creditsFrameCount(s.總秒數, s.FPS);
    expect(n).toBe(ex.格數);
    const lines = s.文字.split('\n').length;
    const blockH = lines * s.字級! * s.行距倍數!;
    const [, H] = s.畫布!;
    ex.第一行上緣y!.forEach((y, i) => {
      expect(creditsTop(i, n, H, blockH)).toBeCloseTo(y, 6);
    });
  });

  it('C02 分段的格數；檔名改用共用的檔名清理（保留中文，主控裁定）', () => {
    const ex = doc.片尾名單.find((e) => e.編號 === 'C02')!;
    const segs = creditSegments(ex.設定.文字, ex.設定.總秒數, ex.設定.FPS);
    expect(segs.map((g) => g.frames)).toEqual(ex.輸出!.map((o) => o.格數));
    /* 段號照舊（從 1 起算） */
    expect(segs.map((g) => g.number)).toEqual(ex.輸出!.map((o) => Number(o.檔名.split('_')[0])));
    expect(segs.map((g) => segmentBaseName(g.number, g.text, 1790872570703))).toEqual([
      '1_Hello_Worl_1790872570703',
      '2_中文段落_1790872570703',
      '3_한글abc_1790872570703',
      '4_前後空白_1790872570703',
    ]);
  });

  it('格數至少 2、無條件捨去', () => {
    expect(creditsFrameCount(0.1, 10)).toBe(2);
    expect(creditsFrameCount(2.3, 10)).toBe(23);
    expect(creditsFrameCount(20, 12)).toBe(240);
  });

  it('去掉頭尾空白後是空的段跳過，但編號照算', () => {
    const segs = creditSegments('  \n\nA\n\n \n\nB', 10, 10);
    expect(segs.map((g) => [g.number, g.text])).toEqual([
      [2, 'A'],
      [3, 'B'],
    ]);
  });
});
