/**
 * 環境音混音器（ambience-mixer）的資料：存檔與網址讀回來的整理、預設組合、隨機組合、分享連結、檔名、匯出的大小。
 */
import { describe, expect, it } from 'vitest';
import { CCFOLIA_AUDIO_MAX_BYTES } from '@/ccfolia';
import { ambienceSound, sanitizeParams, wavBytes } from '@/core/audio/ambience';
import { encodeShareHash } from '@/core/share';
import { createRandom } from '@/core/timeline';
import {
  DEFAULT_EXPORT,
  EXPORT_LENGTHS,
  exportFileName,
  initialState,
  lengthLabel,
  MAX_FILE_TRACKS,
  MAX_TRACKS,
  type MixState,
  masterGain,
  newFileTrack,
  newSynthTrack,
  nextFileKey,
  PRESETS,
  PREVIEW_RATE,
  PREVIEW_SECONDS,
  presetTracks,
  randomMix,
  readShare,
  replaceSynth,
  SHARE_VERSION,
  type SynthTrack,
  sanitizeState,
  shareData,
} from '@/tools/ambience-mixer/model';

const synth = (sound: string, o = {}) => {
  const t = newSynthTrack(sound, o);
  if (!t) throw new Error(sound);
  return t;
};

describe('整理（存檔、網址）', () => {
  it('壞掉的輸入回到預設', () => {
    expect(sanitizeState(null)).toEqual(initialState);
    expect(
      sanitizeState({
        tracks: 'x',
        master: 'loud',
        export: { seconds: 7, sampleRate: 1, channels: 5 },
      }),
    ).toEqual(initialState);
  });

  it('不認識的聲音、重複的聲音丟掉；數值夾在範圍；參數照聲音整理', () => {
    const s = sanitizeState({
      master: 140,
      tracks: [
        {
          kind: 'synth',
          sound: 'rain-light',
          volume: 120,
          params: { intensity: 999, foo: 1 },
          swell: 'yes',
          seed: -5,
        },
        { kind: 'synth', sound: 'rain-light', volume: 10 },
        { kind: 'synth', sound: 'laser-gun', volume: 50 },
        {
          kind: 'file',
          key: 'f1',
          asset: 'abc',
          name: 'x.mp3',
          duration: 12.3456,
          volume: 50,
          loop: false,
          seam: 9,
          fadeIn: -1,
          fadeOut: 3,
        },
        { kind: 'file', key: 'bad', asset: 'abc' },
      ],
      mixName: 'a'.repeat(80),
    });
    expect(s.master).toBe(100);
    expect(s.mixName).toHaveLength(40);
    expect(s.tracks).toHaveLength(2);
    expect(s.tracks[0]).toEqual({
      kind: 'synth',
      key: 's:rain-light',
      sound: 'rain-light',
      volume: 100,
      params: { intensity: 100, distance: 30 },
      swell: false,
      seed: 0,
    });
    expect(s.tracks[1]).toMatchObject({
      kind: 'file',
      key: 'f1',
      loop: false,
      seam: 5,
      fadeIn: 0,
      fadeOut: 3,
      duration: 12.346,
    });
  });

  it(`最多 ${MAX_TRACKS} 軌、音檔最多 ${MAX_FILE_TRACKS} 個`, () => {
    const files = Array.from({ length: 9 }, (_, i) => ({
      kind: 'file',
      key: `f${i + 1}`,
      asset: `a${i}`,
    }));
    const s = sanitizeState({ tracks: files });
    expect(s.tracks).toHaveLength(MAX_FILE_TRACKS);
    const many = sanitizeState({
      tracks: [
        'rain-light',
        'rain-heavy',
        'wind',
        'waves',
        'stream',
        'campfire',
        'clock',
        'owl',
        'bell',
        'drone',
        'vinyl',
        'creak',
        'crowd',
        'thunder',
      ].map((sound) => ({ kind: 'synth', sound })),
    });
    expect(many.tracks).toHaveLength(MAX_TRACKS);
  });

  it('匯出設定只收清單上的值；預設＝預覽（60 秒、32 kHz、立體聲）', () => {
    expect(DEFAULT_EXPORT).toEqual({
      seconds: PREVIEW_SECONDS,
      sampleRate: PREVIEW_RATE,
      channels: 2,
    });
    expect(
      sanitizeState({ export: { seconds: 90, sampleRate: 22050, channels: 1 } }).export,
    ).toEqual({
      seconds: 90,
      sampleRate: 22050,
      channels: 1,
    });
    /* 起伏的週期 10 秒：匯出的長度都是 10 的倍數 */
    for (const s of EXPORT_LENGTHS) expect(s % 10).toBe(0);
  });

  it('音檔軌的 id 不重複', () => {
    const t1 = newFileTrack([], { asset: 'a', name: 'a.wav', duration: 3 });
    expect(t1.key).toBe('f1');
    expect(nextFileKey([t1, synth('wind')])).toBe('f2');
    expect(t1).toMatchObject({ loop: true, seam: 1, volume: 70 });
  });
});

describe('預設組合', () => {
  it('10 個場景：名稱不重複，聲音都存在，參數都在範圍內', () => {
    expect(PRESETS).toHaveLength(10);
    expect(new Set(PRESETS.map((p) => p.name)).size).toBe(10);
    for (const p of PRESETS) {
      expect(p.tracks.length).toBeGreaterThan(1);
      expect(p.tracks.length).toBeLessThanOrEqual(MAX_TRACKS);
      for (const t of p.tracks) {
        const def = ambienceSound(t.sound);
        expect(def, `${p.name}：${t.sound}`).toBeTruthy();
        if (!def) continue;
        expect(t.volume).toBeGreaterThan(0);
        expect(t.volume).toBeLessThanOrEqual(100);
        /* 寫的參數整理後不變（沒有打錯的名稱或超出範圍） */
        const merged = sanitizeParams(def, t.params ?? {});
        for (const [k, v] of Object.entries(t.params ?? {}))
          expect(merged[k], `${p.name}：${t.sound}.${k}`).toBe(v);
      }
      expect(presetTracks(p)).toHaveLength(p.tracks.length);
    }
  });

  it('套用組合：換掉合成的聲音，自己的音檔留著（排在後面）', () => {
    const file = newFileTrack([], { asset: 'a', name: 'a.wav', duration: 3 });
    const next = replaceSynth([synth('wind'), file, synth('owl')], presetTracks(PRESETS[0]));
    expect(next.map((t) => t.key)).toEqual([
      's:rain-window',
      's:thunder',
      's:clock',
      's:fireplace',
      'f1',
    ]);
  });
});

describe('隨機組合', () => {
  it('一個背景聲＋一兩個點綴、不重複、不會出現不合理的組合', () => {
    const rng = createRandom(42);
    for (let k = 0; k < 300; k++) {
      const mix = randomMix(() => rng.next());
      expect(mix.length).toBeGreaterThanOrEqual(2);
      expect(mix.length).toBeLessThanOrEqual(3);
      const ids = mix.map((t) => t.sound);
      expect(new Set(ids).size).toBe(ids.length);
      if (ids[0] === 'underwater') {
        for (const a of ids.slice(1)) expect(['heartbeat', 'bell', 'drone']).toContain(a);
      }
      if (ids[0] === 'rain-light' || ids[0] === 'rain-heavy')
        expect(ids).not.toContain('rain-window');
      for (const t of mix) {
        expect(t.volume).toBeGreaterThanOrEqual(35);
        expect(t.volume).toBeLessThanOrEqual(75);
      }
    }
  });

  it('同樣的亂數同樣的結果', () => {
    const a = createRandom(1);
    const b = createRandom(1);
    expect(randomMix(() => a.next())).toEqual(randomMix(() => b.next()));
  });
});

describe('分享連結', () => {
  const state: MixState = {
    ...initialState,
    master: 66,
    mixName: '雨夜洋館',
    tracks: [
      synth('rain-window', {
        volume: 65,
        params: { taps: 45, outside: 60 },
        swell: true,
        seed: 12,
      }),
      newFileTrack([], { asset: 'a', name: 'mine.mp3', duration: 3 }),
      synth('clock', { volume: 50, params: { type: 1, room: 45 } }),
    ],
  };

  it('只放合成的聲音；讀回來一模一樣（音量、參數、起伏、種子、總音量、名稱）', () => {
    const data = shareData(state);
    expect(data.t).toHaveLength(2);
    const r = readShare(encodeShareHash(data, { version: SHARE_VERSION }));
    expect(r.kind).toBe('ok');
    if (r.kind !== 'ok') return;
    expect(r.mix.master).toBe(66);
    expect(r.mix.mixName).toBe('雨夜洋館');
    expect(r.mix.tracks).toEqual(state.tracks.filter((t): t is SynthTrack => t.kind === 'synth'));
  });

  it('網址是不可信的輸入：不認識的聲音丟掉、數值夾住；一個都認不得、壞掉、版本不符時是 broken；沒有 # 時 none', () => {
    const tampered = encodeShareHash(
      {
        m: 999,
        n: 7,
        t: [['laser', 50, {}, 0, 1], ['wind', 500, { intensity: -9 }, 1, 'x'], 'junk'],
      },
      { version: SHARE_VERSION },
    );
    const r = readShare(tampered);
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') {
      expect(r.mix.master).toBe(100);
      expect(r.mix.mixName).toBe('');
      expect(r.mix.tracks).toEqual([
        {
          kind: 'synth',
          key: 's:wind',
          sound: 'wind',
          volume: 100,
          params: { intensity: 0, howl: 25 },
          swell: true,
          seed: 1,
        },
      ]);
    }
    expect(
      readShare(encodeShareHash({ m: 50, t: [['laser', 50]] }, { version: SHARE_VERSION })).kind,
    ).toBe('broken');
    expect(readShare('#s=@@@').kind).toBe('broken');
    expect(readShare(encodeShareHash(shareData(state), { version: 99 })).kind).toBe('broken');
    expect(readShare('').kind).toBe('none');
    expect(readShare('#other=1').kind).toBe('none');
  });
});

describe('檔名、長度、大小', () => {
  it('檔名：組合名或前三個聲音、秒數', () => {
    expect(exportFileName({ ...initialState, mixName: '雨夜洋館', tracks: [synth('wind')] })).toBe(
      '環境音-雨夜洋館-60秒.wav',
    );
    const s: MixState = {
      ...initialState,
      tracks: [synth('wind'), synth('owl'), synth('clock'), synth('bell')],
      export: { ...initialState.export, seconds: 30 },
    };
    expect(exportFileName(s)).toBe('環境音-風・貓頭鷹・時鐘-30秒.wav');
    const f = newFileTrack([], { asset: 'a', name: 'my/bgm?.mp3', duration: 3 });
    expect(exportFileName({ ...initialState, tracks: [f] })).toBe('環境音-my_bgm_-60秒.wav');
    expect(exportFileName(initialState)).toBe('環境音-混音-60秒.wav');
  });

  it('長度的文字', () => {
    expect(lengthLabel(30)).toBe('30 秒');
    expect(lengthLabel(60)).toBe('1 分');
    expect(lengthLabel(90)).toBe('1 分 30 秒');
  });

  it('預設的匯出（60 秒、32 kHz、立體聲）放得進 CCFOLIA 的 10 MB；44.1 kHz 立體聲 1 分就超過', () => {
    expect(wavBytes(60, 32000, 2)).toBeLessThan(CCFOLIA_AUDIO_MAX_BYTES);
    expect(wavBytes(60, 44100, 2)).toBeGreaterThan(CCFOLIA_AUDIO_MAX_BYTES);
    expect(wavBytes(180, 22050, 1)).toBeLessThan(CCFOLIA_AUDIO_MAX_BYTES);
  });

  it('總音量：平方再乘 2', () => {
    expect(masterGain(100)).toBe(2);
    expect(masterGain(50)).toBe(0.5);
    expect(masterGain(0)).toBe(0);
  });
});
