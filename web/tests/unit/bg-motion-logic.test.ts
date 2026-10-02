/**
 * 動態背景產生器（bg-motion）的數值規則：秒數（F74）、輸出尺寸（規格 3.2 全部組合）、自動畫質與尺寸（F06）、
 * 影格時間軸（3.3，含主控裁定的無縫取樣）、檔名（3.9）、大小與 KB 的顯示（F05、F83）、濾鏡卡片的分組（F38）、
 * 預覽的濾鏡縮放。
 */
import { describe, expect, it } from 'vitest';
import { ASPECT_IDS, FILTER_PRESET_IDS, FILTER_PRESETS, QUALITY_WEBP } from '@/core/image';
import { EFFECT_IDS, EFFECTS } from '@/tools/bg-motion/effects';
import {
  approxKb,
  autoFileBase,
  autoOutput,
  cleanName,
  DEFAULT_BASE_NAME,
  effectiveFileBase,
  exportFrames,
  formatMb,
  MIB,
  outputSize,
  parseSeconds,
  recommendedAspect,
  SIZE_LIMIT_BYTES,
  sourceBaseName,
  stripExtension,
} from '@/tools/bg-motion/logic';
import { scaleFilterOps } from '@/tools/bg-motion/render';
import { EFFECT_TEXT, FILTER_TEXT } from '@/tools/bg-motion/strings';

describe('秒數（F74）', () => {
  it('夾在 0.5～12；空白或不是數字當成 3；不是 0.5 倍數照用', () => {
    expect(parseSeconds('')).toBe(3);
    expect(parseSeconds('abc')).toBe(3);
    expect(parseSeconds('0.2')).toBe(0.5);
    expect(parseSeconds('0')).toBe(0.5);
    expect(parseSeconds('-4')).toBe(0.5);
    expect(parseSeconds('20')).toBe(12);
    expect(parseSeconds('1.3')).toBe(1.3);
    expect(parseSeconds('2.5')).toBe(2.5);
  });
});

describe('輸出尺寸（規格 3.2）', () => {
  const TABLE = {
    '16:9': ['768x432', '960x540', '1280x720', '1920x1080'],
    '8:5': ['768x480', '960x600', '1280x800', '1920x1200'],
    '4:3': ['640x480', '800x600', '1024x768', '1600x1200'],
    '3:2': ['720x480', '900x600', '1200x800', '1800x1200'],
    '1:1': ['640x640', '800x800', '1024x1024', '1600x1600'],
  } as const;
  const QS = ['minimum', 'light', 'standard', 'high'] as const;
  it('選比例：表中那格（與圖片無關）', () => {
    for (const a of ASPECT_IDS)
      QS.forEach((q, i) => {
        const o = outputSize(q, a, { width: 333, height: 777 });
        expect(`${o.width}x${o.height}`, `${a} ${q}`).toBe(TABLE[a][i]);
      });
  });
  it('原始尺寸：最接近的比例當外框、等比縮小不放大；高畫質不設上限', () => {
    const rows: [number, number, string[]][] = [
      [1280, 720, ['768x432', '960x540', '1280x720', '1280x720']],
      [640, 360, ['640x360', '640x360', '640x360', '640x360']],
      [1600, 1200, ['640x480', '800x600', '1024x768', '1600x1200']],
      [720, 1280, ['360x640', '450x800', '576x1024', '720x1280']],
      [2560, 1440, ['768x432', '960x540', '1280x720', '2560x1440']],
    ];
    for (const [w, h, want] of rows)
      QS.forEach((q, i) => {
        const o = outputSize(q, 'original', { width: w, height: h });
        expect(`${o.width}x${o.height}`, `${w}x${h} ${q}`).toBe(want[i]);
      });
  });
  it('WebP 的品質依畫質', () => {
    expect(QUALITY_WEBP).toEqual({ minimum: 0.62, light: 0.72, standard: 0.82, high: 0.92 });
  });
});

describe('載入時自動選畫質與尺寸（F06）', () => {
  it('依最大的檔案：< 1 MB 標準、≥ 1 MB 輕量、≥ 3 MB 輕量＋比例、≥ 6 MB 最小＋比例', () => {
    const img = { width: 1240, height: 900 };
    expect(autoOutput(MIB - 1, img)).toEqual({
      tier: 'standard',
      quality: 'standard',
      size: 'original',
    });
    expect(autoOutput(MIB, img)).toEqual({ tier: 'light', quality: 'light', size: 'original' });
    expect(autoOutput(3 * MIB - 1, img).tier).toBe('light');
    expect(autoOutput(3 * MIB, img)).toEqual({
      tier: 'lightPreset',
      quality: 'light',
      size: '4:3',
    });
    expect(autoOutput(6 * MIB - 1, img).tier).toBe('lightPreset');
    expect(autoOutput(6 * MIB, img)).toEqual({ tier: 'minimum', quality: 'minimum', size: '4:3' });
    expect(autoOutput(6 * MIB, { width: 1280, height: 720 }).size).toBe('16:9');
  });
  it('自動比例：長寬比最接近、面積接近、不放大', () => {
    expect(recommendedAspect('light', 1240, 900)).toBe('4:3');
    expect(recommendedAspect('minimum', 1280, 720)).toBe('16:9');
    expect(recommendedAspect('light', 1500, 1000)).toBe('3:2');
    expect(recommendedAspect('light', 1000, 1000)).toBe('1:1');
    expect(recommendedAspect('minimum', 1920, 1200)).toBe('8:5');
  });
});

describe('影格時間軸（規格 3.3）', () => {
  it('影格數＝秒數 × FPS 四捨五入、至少 2；延遲是整數毫秒、餘數給前面的格', () => {
    const f = exportFrames(2.5, 24, 'pushIn', false);
    expect(f).toHaveLength(60);
    expect(f.slice(0, 40).every((x) => x.ms === 42)).toBe(true);
    expect(f.slice(40).every((x) => x.ms === 41)).toBe(true);
    expect(f.reduce((a, x) => a + x.ms, 0)).toBe(2500);
    const g = exportFrames(2, 60, 'fadeBlack', false);
    expect(g).toHaveLength(120);
    expect(g.filter((x) => x.ms === 17)).toHaveLength(80);
    expect(g.filter((x) => x.ms === 16)).toHaveLength(40);
    expect(exportFrames(1.3, 24, 'pushIn', false)).toHaveLength(31);
    expect(exportFrames(0.5, 2, 'pushIn', false)).toHaveLength(2);
    /* 每格至少 10 ms */
    expect(exportFrames(0.5, 60, 'pushIn', false).every((x) => x.ms >= 10)).toBe(true);
    /* 60 FPS 的格數：附件 */
    expect(exportFrames(2.5, 60, 'shakeY', true)).toHaveLength(150);
    expect(exportFrames(3, 60, 'wave', true)).toHaveLength(180);
  });
  it('進度型含頭尾：第一格 0、最後一格 1（不循環、E10 水波、轉場）', () => {
    for (const [e, loop] of [
      ['pushIn', false],
      ['wave', true],
      ['crossfade', true],
      ['shakeY', false],
      [null, true],
    ] as const) {
      const f = exportFrames(3, 24, e, loop);
      expect(f[0].progress).toBe(0);
      expect(f.at(-1)?.progress).toBe(1);
      expect(f[1].progress).toBeCloseTo(1 / 71, 9);
    }
  });
  it('循環的週期性效果（E01～E06）改成無縫取樣：第 k 格＝k ÷ n，最後一格不重複第一格（主控裁定）', () => {
    for (const id of EFFECT_IDS.filter((x) => EFFECTS[x].periodic)) {
      const f = exportFrames(2.5, 24, id, true);
      expect(f).toHaveLength(60);
      expect(f[0].progress).toBe(0);
      expect(f.at(-1)?.progress).toBeCloseTo(59 / 60, 9);
      expect(f.reduce((a, x) => a + x.ms, 0)).toBe(2500);
    }
    expect(EFFECT_IDS.filter((x) => EFFECTS[x].periodic).map((x) => EFFECTS[x].code)).toEqual([
      'E01',
      'E02',
      'E03',
      'E04',
      'E05',
      'E06',
    ]);
  });
});

describe('檔名（規格 3.9）', () => {
  it('清理：\\ / : * ? " < > | 換成 _、空白換成 _、連續的 _ 合併', () => {
    expect(cleanName('a/b:c*d?e"f<g>h|i\\j')).toBe('a_b_c_d_e_f_g_h_i_j');
    expect(cleanName('  my   map  ')).toBe('my_map');
    expect(cleanName('a__b___c')).toBe('a_b_c');
    expect(cleanName('')).toBe(DEFAULT_BASE_NAME);
  });
  it('原檔名段：一張去掉最後一個副檔名；多張為 <第一張>_and_<其餘張數>_more', () => {
    expect(stripExtension('m1280.final.png')).toBe('m1280.final');
    expect(sourceBaseName(['m1280.png'])).toBe('m1280');
    expect(sourceBaseName(['sa.png', 'b.jpg', 'c.webp'])).toBe('sa_and_2_more');
    expect(sourceBaseName([])).toBeNull();
  });
  it('主體：<原檔名>_<效果名>_<濾鏡名>_<循環與否>；沒有圖片時用預設名', () => {
    expect(autoFileBase({ source: 'm1280', effect: '上下震盪', filter: '無', loop: '循環' })).toBe(
      'm1280_上下震盪_無_循環',
    );
    expect(autoFileBase({ source: null, effect: '無動態', filter: '黑白', loop: '單次' })).toBe(
      'bg_motion_無動態_黑白_單次',
    );
    expect(autoFileBase({ source: 'my file', effect: 'a', filter: 'b', loop: 'c' })).toBe(
      'my_file_a_b_c',
    );
  });
  it('檔名欄有輸入就用它（清理後），空白時用自動名稱（刻意改善）', () => {
    expect(effectiveFileBase('', 'auto_name')).toBe('auto_name');
    expect(effectiveFileBase('   ', 'auto_name')).toBe('auto_name');
    expect(effectiveFileBase('雨夜 背景', 'auto_name')).toBe('雨夜_背景');
  });
  it('效果名稱是短名稱（沒有標點），24 種都不同', () => {
    const labels = EFFECT_IDS.map((id) => EFFECT_TEXT[id].label);
    expect(new Set(labels).size).toBe(24);
    for (const l of labels) expect(cleanName(l)).toBe(l);
  });
});

describe('顯示', () => {
  it('大小：MB 兩位小數，10 MB 以上一位', () => {
    expect(formatMb(1.29 * MIB)).toBe('1.29 MB');
    expect(formatMb(5 * MIB)).toBe('5.00 MB');
    expect(formatMb(9.96 * MIB)).toBe('10.0 MB');
    expect(formatMb(12.34 * MIB)).toBe('12.3 MB');
    expect(SIZE_LIMIT_BYTES).toBe(5_242_880);
  });
  it('約幾 KB：四捨五入、千分位、至少 1', () => {
    expect(approxKb(1_234_567)).toBe('1,206');
    expect(approxKb(100)).toBe('1');
    expect(approxKb(2_560)).toBe('3');
  });
});

describe('濾鏡卡片（F38）', () => {
  it('「無」＋26 種：基本處理 15、時段 6、氛圍 6，依規格順序', () => {
    const ids = ['none', ...FILTER_PRESET_IDS] as const;
    expect(Object.keys(FILTER_TEXT)).toEqual([...ids]);
    const groups = new Map<string, number>();
    for (const id of ids)
      groups.set(FILTER_TEXT[id].group, (groups.get(FILTER_TEXT[id].group) ?? 0) + 1);
    expect([...groups.values()]).toEqual([15, 6, 6]);
    expect(new Set(ids.map((id) => FILTER_TEXT[id].label)).size).toBe(27);
  });
  it('預覽縮小時，濾鏡的 px 參數一起縮小（比例類不變）', () => {
    const crt = scaleFilterOps(FILTER_PRESETS.crt, 0.5);
    expect(crt.find((o) => o.op === 'scanlines')).toMatchObject({ period: 1.5, offset: 0.5 });
    expect(crt.find((o) => o.op === 'shift')).toMatchObject({ r: [1.5, 0], b: [-1.5, 0] });
    expect(scaleFilterOps(FILTER_PRESETS.mosaic, 0.5)[0]).toMatchObject({ size: 5 });
    expect(scaleFilterOps(FILTER_PRESETS.soft, 0.5).find((o) => o.op === 'blur')).toMatchObject({
      radius: 2.22,
    });
    expect(scaleFilterOps(FILTER_PRESETS.night, 0.5)).toEqual(FILTER_PRESETS.night);
    expect(scaleFilterOps(FILTER_PRESETS.crt, 1)).toEqual(FILTER_PRESETS.crt);
  });
});
