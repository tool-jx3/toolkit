/**
 * 環境音混音器（ambience-mixer）的資料：存檔與網址讀回來的整理、預設組合、隨機組合、分享連結、檔名、匯出的大小。
 */
import { describe, expect, it } from 'vitest';
import { CCFOLIA_AUDIO_MAX_BYTES } from '@/ccfolia';
import { encodeWav } from '@/core/audio';
import { ambienceSound, sanitizeParams, wavBytes } from '@/core/audio/ambience';
import { encodeShareHash } from '@/core/share';
import { createRandom } from '@/core/timeline';
import {
  bytesReader,
  DEFAULT_EXPORT,
  EXPORT_LENGTHS,
  EXPORT_RATES,
  exportBytes,
  exportFileName,
  FILE_MAX_SECONDS,
  FILES_TOTAL_SECONDS,
  filesInUse,
  filesTotalTooLong,
  fileTooLong,
  formatMb,
  id3Size,
  initialState,
  lengthLabel,
  lengthText,
  MAX_FILE_TRACKS,
  MAX_TRACKS,
  type MixState,
  MP3_KBPS,
  masterGain,
  mp3Kbps,
  newFileTrack,
  newSynthTrack,
  nextFileKey,
  overTotalKeys,
  PRESETS,
  PREVIEW_RATE,
  PREVIEW_SECONDS,
  presetTracks,
  randomMix,
  readShare,
  readWavDuration,
  replaceSynth,
  SHARE_VERSION,
  type SynthTrack,
  sanitizeState,
  shareData,
  type Track,
  unknownLength,
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

  it('匯出設定只收清單上的值；預設＝預覽（60 秒、32 kHz、立體聲）、MP3 128 kbps', () => {
    expect(DEFAULT_EXPORT).toEqual({
      seconds: PREVIEW_SECONDS,
      sampleRate: PREVIEW_RATE,
      channels: 2,
      format: 'mp3',
      kbps: 128,
    });
    expect(
      sanitizeState({
        export: { seconds: 90, sampleRate: 22050, channels: 1, format: 'wav', kbps: 192 },
      }).export,
    ).toEqual({
      seconds: 90,
      sampleRate: 22050,
      channels: 1,
      format: 'wav',
      kbps: 192,
    });
    /* 第 1 版的存檔（沒有格式與位元率）照讀：補上預設 */
    expect(
      sanitizeState({ export: { seconds: 30, sampleRate: 44100, channels: 2 } }).export,
    ).toEqual({ seconds: 30, sampleRate: 44100, channels: 2, format: 'mp3', kbps: 128 });
    expect(sanitizeState({ export: { format: 'ogg', kbps: 96 } }).export).toEqual(DEFAULT_EXPORT);
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
  it('12 個場景：名稱不重複，聲音都存在，參數都在範圍內', () => {
    expect(PRESETS).toHaveLength(12);
    expect(new Set(PRESETS.map((p) => p.name)).size).toBe(12);
    /* 2026-10-29 加的兩個用到新的聲音 */
    expect(PRESETS.find((p) => p.id === 'rainy-camp')?.tracks[0].sound).toBe('rain-tent');
    expect(PRESETS.find((p) => p.id === 'night-library')?.tracks[0].sound).toBe('room-tone');
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
    /* 暴風雨的船上五軌都很大聲：音量比其他組合低（驗證後的裁定） */
    const storm = PRESETS.find((p) => p.id === 'storm-ship');
    expect(storm?.tracks.map((t) => t.volume)).toEqual([55, 50, 50, 46, 46]);
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
      if (ids[0] === 'rain-tent')
        for (const a of ['rain-window', 'clock', 'vinyl', 'creak', 'crickets', 'owl'])
          expect(ids).not.toContain(a);
      if (ids[0] === 'room-tone') expect(ids).not.toContain('owl');
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
    /* 空的 #s=：壞掉的連結（清掉並通知） */
    expect(readShare('#s=').kind).toBe('broken');
    expect(readShare('#other=1').kind).toBe('none');
  });
});

describe('檔名、長度、大小', () => {
  it('檔名：組合名或前三個聲音、秒數、副檔名照格式（預設 .mp3）', () => {
    expect(exportFileName({ ...initialState, mixName: '雨夜洋館', tracks: [synth('wind')] })).toBe(
      '環境音-雨夜洋館-60秒.mp3',
    );
    const wav = { ...initialState.export, format: 'wav' as const };
    const s: MixState = {
      ...initialState,
      tracks: [synth('wind'), synth('owl'), synth('clock'), synth('bell')],
      export: { ...wav, seconds: 30 },
    };
    expect(exportFileName(s)).toBe('環境音-風・貓頭鷹・時鐘-30秒.wav');
    const f = newFileTrack([], { asset: 'a', name: 'my/bgm?.mp3', duration: 3 });
    expect(exportFileName({ ...initialState, export: wav, tracks: [f] })).toBe(
      '環境音-my_bgm_-60秒.wav',
    );
    expect(exportFileName(initialState)).toBe('環境音-混音-60秒.mp3');
    /* 沒有混進去的音檔不列 */
    const g = { ...newFileTrack([f], { asset: 'b', name: 'gone.wav', duration: 3 }) };
    expect(exportFileName({ ...initialState, tracks: [g, synth('wind')] }, new Set([g.key]))).toBe(
      '環境音-風-60秒.mp3',
    );
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

  it('MP3：位元率 128／192（22.05 kHz 最高 160）；大小約「秒數 × 位元率 ÷ 8」，最長、最高音質也放得進 10 MB', () => {
    expect(MP3_KBPS).toEqual([128, 192]);
    expect(mp3Kbps(192, 44100)).toBe(192);
    expect(mp3Kbps(192, 32000)).toBe(192);
    expect(mp3Kbps(192, 22050)).toBe(160);
    expect(mp3Kbps(128, 22050)).toBe(128);
    const mp3 = { ...DEFAULT_EXPORT };
    /* 1 分鐘 128 kbps：約 0.96 MB（＋Info 標頭與前後多編的一點點） */
    expect(exportBytes(mp3)).toBeGreaterThan(960_000);
    expect(exportBytes(mp3)).toBeLessThan(975_000);
    expect(formatMb(exportBytes(mp3))).toMatch(/^96\d KB$/);
    expect(exportBytes({ ...mp3, channels: 1 })).toBe(exportBytes(mp3));
    for (const rate of EXPORT_RATES) {
      const big = exportBytes({ ...mp3, seconds: 180, sampleRate: rate, kbps: 192 });
      expect(big).toBeLessThan(CCFOLIA_AUDIO_MAX_BYTES / 2);
    }
    /* WAV 照舊 */
    expect(exportBytes({ ...mp3, format: 'wav' })).toBe(wavBytes(60, 32000, 2));
  });

  it('大小以 1000 進位顯示（和 CCFOLIA 的「10 MB」一致）', () => {
    expect(formatMb(CCFOLIA_AUDIO_MAX_BYTES)).toBe('10 MB');
    expect(formatMb(wavBytes(60, 32000, 2))).toBe('7.7 MB');
    expect(formatMb(wavBytes(180, 44100, 2))).toBe('31.8 MB');
    expect(formatMb(850_000)).toBe('850 KB');
  });

  it('音檔的長度：WAV 一個區塊一個區塊讀（data 在大的 LIST 之後也讀得到）、15 分鐘上限（多 1 秒寬容）、長度的文字', async () => {
    const wav = encodeWav({
      sampleRate: 8000,
      channels: [new Float32Array(8000 * 3), new Float32Array(8000 * 3)],
    });
    expect(await readWavDuration(bytesReader(wav), wav.length)).toBeCloseTo(3, 6);
    /* data 的大小寫錯（0）時用檔案大小 */
    const broken = Uint8Array.from(wav);
    new DataView(broken.buffer).setUint32(40, 0, true);
    expect(await readWavDuration(bytesReader(broken), broken.length)).toBeCloseTo(3, 6);
    /* fmt 之後先放 6000 位元組的 LIST，data 在 4 KB 之後 */
    const pad = 6000;
    const late = new Uint8Array(wav.length + 8 + pad);
    late.set(wav.subarray(0, 36), 0);
    late.set(new TextEncoder().encode('LIST'), 36);
    new DataView(late.buffer).setUint32(40, pad, true);
    late.set(wav.subarray(36), 44 + pad);
    expect(await readWavDuration(bytesReader(late), late.length)).toBeCloseTo(3, 6);
    expect(await readWavDuration(bytesReader(new Uint8Array([1, 2, 3])), 3)).toBeNull();
    const id3 = new TextEncoder().encode('ID3 not a wav file....');
    expect(await readWavDuration(bytesReader(id3), id3.length)).toBeNull();
    expect(FILE_MAX_SECONDS).toBe(900);
    expect(fileTooLong(900)).toBe(false);
    expect(fileTooLong(900.9)).toBe(false);
    expect(fileTooLong(64 * 60)).toBe(true);
    /* 長度的文字無條件進位到整秒：上限邊界的 902 秒不會寫成「15 分鐘」 */
    expect(lengthText(64 * 60)).toBe('64 分鐘');
    expect(lengthText(902)).toBe('15 分 2 秒');
    expect(lengthText(901.2)).toBe('15 分 2 秒');
    expect(lengthText(930)).toBe('15 分 30 秒');
    expect(lengthText(40)).toBe('40 秒');
  });

  it('自己的音檔加起來最多 30 分鐘：依順序累計，超過的不載入（太長、找不到的不算）', () => {
    expect(FILES_TOTAL_SECONDS).toBe(1800);
    expect(filesTotalTooLong(1801)).toBe(false);
    expect(filesTotalTooLong(1803)).toBe(true);
    const tracks: Track[] = [];
    for (const [i, d] of [890, 890, 890, 10, 3600].entries())
      tracks.push(newFileTrack(tracks, { asset: `a${i}`, name: `${i}.wav`, duration: d }));
    tracks.splice(1, 0, synth('wind'));
    /* 890＋890＝1780；第三個 890 超過；10 還放得下；3600 是太長（另外算） */
    expect([...overTotalKeys(tracks)]).toEqual(['f3']);
    expect(filesInUse(tracks)).toBe(1790);
    expect(filesInUse(tracks, (t) => t.key === 'f1')).toBe(1790);
    expect(filesInUse(tracks, (t) => t.key === 'f2')).toBe(1790);
    /* 第一個找不到（不佔記憶體）：第三個放得下 */
    expect([...overTotalKeys(tracks, { skip: (t) => t.key === 'f1' })]).toEqual([]);
    /* 實際解碼出來比存檔長：照實際的算 */
    expect([
      ...overTotalKeys(tracks, { length: (t) => (t.key === 'f4' ? 100 : t.duration) }),
    ]).toEqual(['f3', 'f4']);
  });

  it('讀不到長度時用檔案大小估：一定太長的擋、不可能太長的直接解碼、其餘先問', () => {
    const none = new Uint8Array(16);
    /* MP3 最高 320 kbps：40 MB 至少 16 分 40 秒 → 擋 */
    expect(unknownLength(40e6, none, 'mp3')).toEqual({ kind: 'block', atLeast: 1000 });
    /* 不到 675 KB：用 6 kbps 算也不到 15 分鐘 → 直接解碼 */
    expect(unknownLength(600_000, none, 'mp3').kind).toBe('decode');
    expect(unknownLength(600_000, none, null).kind).toBe('decode');
    /* 中間：先問 */
    expect(unknownLength(10e6, none, 'mp3').kind).toBe('ask');
    expect(unknownLength(59e6, none, 'flac').kind).toBe('ask');
    expect(unknownLength(59e6, none, null).kind).toBe('ask');
    /* ID3 標籤（封面圖）不算：40 MB 裡 10 MB 是標籤 → 至少 12.5 分鐘，不擋 */
    const tag = new Uint8Array(16);
    tag.set([0x49, 0x44, 0x33, 4, 0]);
    const n = 10e6 - 10;
    tag.set([(n >> 21) & 0x7f, (n >> 14) & 0x7f, (n >> 7) & 0x7f, n & 0x7f], 6);
    expect(id3Size(tag)).toBe(10e6);
    expect(unknownLength(40e6, tag, 'mp3').kind).toBe('ask');
  });

  it('總音量：平方再乘 2', () => {
    expect(masterGain(100)).toBe(2);
    expect(masterGain(50)).toBe(0.5);
    expect(masterGain(0)).toBe(0);
  });
});
