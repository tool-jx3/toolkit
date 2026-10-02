/**
 * 「文字演出」分頁（G1 共用層）：影格表（打字）、文字加工與循環特效、用途檢查與進階開關、卡拉 OK、
 * 軌跡（PathPad＋core/path）、音效（core/audio）、配色對與字型池清單、分享連結（core/share）、HTML 跳脫、JPG 匯出。
 * 右邊的預覽欄換成 G1Preview（三種示範動畫＋匯出）。
 */
import { Link2, Music, Shuffle, Trash2, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { checkTarget, DISCORD_DARK_BG, EXPORT_TARGETS, TARGET_IDS, type TargetId } from '@/ccfolia';
import {
  createSilence,
  decodeAudio,
  mixAtTimes,
  type PcmAudio,
  pcmDuration,
  skipOverlapping,
  wavBlob,
} from '@/core/audio';
import { downloadBlob, downloadSequentially } from '@/core/files';
import { LOOP_FX_KINDS, LOOP_FX_LABELS, type LoopFxKind } from '@/core/fxlayers';
import { escapeHtml } from '@/core/html';
import { canvasToJpeg } from '@/core/image';
import {
  type Point,
  pathBounds,
  pathLength,
  presetPath,
  reversePath,
  sampleEvenly,
  scalePath,
} from '@/core/path';
import { decodeShareHash, encodeShareHash, sh } from '@/core/share';
import { countGraphemes, splitGraphemes, typingSteps } from '@/core/typeset';
import {
  AdvancedToggle,
  AudioDrop,
  AudioPlayer,
  Button,
  ColorField,
  ColorPairList,
  Field,
  FontPoolList,
  IssueList,
  NumberInput,
  PathPad,
  Section,
  Segmented,
  Show,
  Slider,
  TextArea,
  TextOutputPanel,
  ThumbChoice,
  Toggle,
  useAdvancedMode,
  useToast,
} from '@/ui';
import { buildLoopScene, STYLE_LABELS } from '../g1/scenes';
import { type G1DemoState, type StyleId, useG1 } from '../g1/store';

const PAD_W = 634;
const PAD_H = 300;

const STYLE_IDS = Object.keys(STYLE_LABELS) as StyleId[];

/** 分享連結的結構（示範：範圍夾值、未知的選項換成預設） */
const SHARE_SCHEMA = sh.object({
  loopText: sh.string({ default: '大成功', maxLength: 100, maxLines: 8 }),
  style: sh.oneOf(STYLE_IDS),
  fx: sh.oneOf(['none', ...LOOP_FX_KINDS] as const),
  target: sh.oneOf(TARGET_IDS),
  size: sh.number({ min: 64, max: 1600, int: true, default: 480 }),
  frames: sh.number({ min: 2, max: 60, int: true, default: 15 }),
  fps: sh.number({ min: 5, max: 30, int: true, default: 20 }),
  colors: sh.number({ min: 0, max: 256, int: true, default: 256 }),
});
const SHARE = { version: 1 };

export function G1Demo() {
  const s = useG1((st) => st.data);
  const patch = useG1((st) => st.patch);
  return (
    <div className="flex flex-col gap-3">
      <TypingSection s={s} patch={patch} />
      <LoopSection s={s} patch={patch} />
      <KaraokeSection s={s} patch={patch} />
      <PathSection s={s} patch={patch} />
      <AudioSection s={s} />
      <ListsSection s={s} patch={patch} />
      <ShareSection s={s} patch={patch} />
    </div>
  );
}

type SectionArgs = { s: G1DemoState; patch: (p: Partial<G1DemoState>) => void };

function TypingSection({ s, patch }: SectionArgs) {
  const steps = useMemo(() => typingSteps(Array.from(s.typingText)).length, [s.typingText]);
  return (
    <Section
      title="打字（影格表）"
      persistKey="_gallery:g1-typing"
      description="core/typeset 的韓文拆字與逐字步驟＋core/timeline 的影格表（每格 1／FPS 秒，最後一格停留任意毫秒）。"
    >
      <Field
        label="文字"
        hint={`共 ${steps} 步（換行、空白各算一步；韓文音節 2～3 步）＝${steps} 格。`}
      >
        <TextArea
          value={s.typingText}
          onChange={(e) => patch({ typingText: e.target.value, mode: 'typing' })}
          rows={3}
        />
      </Field>
      <Field label="FPS（打字速度）">
        <Slider
          value={s.typingFps}
          onChange={(typingFps) => patch({ typingFps })}
          min={1}
          max={60}
        />
      </Field>
      <Field label="最後停留">
        <Slider
          value={s.holdMs}
          onChange={(holdMs) => patch({ holdMs })}
          min={0}
          max={5000}
          step={10}
          unit="ms"
        />
      </Field>
      <Field label="水平縮放">
        <Slider
          value={s.scaleX}
          onChange={(scaleX) => patch({ scaleX })}
          min={0.5}
          max={2}
          step={0.05}
          precision={2}
          unit="×"
        />
      </Field>
      <Field label="底線" layout="inline">
        <Toggle checked={s.underline} onCheckedChange={(underline) => patch({ underline })} />
      </Field>
      <Field label="刪除線" layout="inline">
        <Toggle checked={s.strike} onCheckedChange={(strike) => patch({ strike })} />
      </Field>
      <Field
        label="分段匯出（多檔）"
        layout="inline"
        hint="以第一個換行切成兩段，一次匯出兩個檔案（結果卡可以全部下載或打包成 ZIP）。"
      >
        <Toggle checked={s.split} onCheckedChange={(split) => patch({ split })} />
      </Field>
    </Section>
  );
}

function LoopSection({ s, patch }: SectionArgs) {
  const [advanced] = useAdvancedMode('_gallery');
  const target = EXPORT_TARGETS[s.target];
  /* 字型載入後縮圖要重畫 */
  const [fontTick, setFontTick] = useState(0);
  useEffect(() => {
    const bump = () => setFontTick((n) => n + 1);
    document.fonts?.addEventListener?.('loadingdone', bump);
    return () => document.fonts?.removeEventListener?.('loadingdone', bump);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: fontTick 只用來在字型載入後重畫縮圖
  const drawStyle = useCallback(
    (ctx: CanvasRenderingContext2D, style: StyleId, t: number) => {
      buildLoopScene({ ...s, style, fx: 'none' }, 192).draw(ctx, t);
    },
    [s.loopText, s.pulse, fontTick],
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: fontTick 只用來在字型載入後重畫縮圖
  const drawFx = useCallback(
    (ctx: CanvasRenderingContext2D, fx: 'none' | LoopFxKind, t: number) => {
      buildLoopScene({ ...s, fx }, 192).draw(ctx, t);
    },
    [s.loopText, s.style, s.pulse, s.lines, fontTick],
  );
  const issues = checkTarget(target, {
    format: 'apng',
    width: s.size,
    height: s.size,
    frames: s.frames,
    charCount: countGraphemes(s.loopText.replace(/\n/g, '')),
    fontSuggestedChars: 16,
    lastBytes: s.lastBytes,
  });
  return (
    <Section
      title="循環加工"
      persistKey="_gallery:g1-loop"
      description="core/typeset 的放大填滿＋core/textfx 的裝飾層＋core/fxlayers 的循環特效；ThumbChoice 縮圖停留或聚焦時播放。"
    >
      <Field label="文字">
        <TextArea
          value={s.loopText}
          onChange={(e) => patch({ loopText: e.target.value, mode: 'loop' })}
          rows={2}
        />
      </Field>
      <Field label="文字樣式">
        <ThumbChoice
          value={s.style}
          onValueChange={(style) => patch({ style, mode: 'loop' })}
          options={STYLE_IDS.map((id) => ({ value: id, label: STYLE_LABELS[id] }))}
          draw={drawStyle}
          frames={15}
          fps={20}
          minItemWidth={84}
        />
      </Field>
      <Field label="特效">
        <ThumbChoice
          value={s.fx}
          onValueChange={(fx) => patch({ fx, mode: 'loop' })}
          options={[
            { value: 'none' as const, label: '無' },
            ...LOOP_FX_KINDS.map((k) => ({ value: k, label: LOOP_FX_LABELS[k] })),
          ]}
          draw={drawFx}
          frames={15}
          fps={20}
          minItemWidth={84}
        />
      </Field>
      <Field
        label="脈動與抖動"
        layout="inline"
        hint="以畫布中心縮放＋週期平滑雜訊的抖動（無縫循環）。"
      >
        <Toggle checked={s.pulse} onCheckedChange={(pulse) => patch({ pulse })} />
      </Field>
      <Field label="用途">
        <Segmented
          value={s.target}
          onValueChange={(t: TargetId) =>
            patch({
              target: t,
              size: EXPORT_TARGETS[t].fixedSize?.width ?? EXPORT_TARGETS[t].defaultSize.width,
              frames: EXPORT_TARGETS[t].defaultFrames,
              fps: EXPORT_TARGETS[t].defaultFps,
              gifMatte: EXPORT_TARGETS[t].gifMatte,
              lastBytes: null,
              mode: 'loop',
            })
          }
          options={TARGET_IDS.map((id) => ({ value: id, label: EXPORT_TARGETS[id].label }))}
          size="sm"
          className="flex-wrap"
        />
      </Field>
      <IssueList
        aria-label="用途檢查"
        items={issues.map((i) => ({ level: i.level, message: i.message, id: i.code }))}
        empty="沒有問題。"
      />
      <AdvancedToggle toolId="_gallery" label="顯示進階設定（記在瀏覽器）" />
      <Show when={advanced}>
        <Field label="尺寸（正方形）">
          <NumberInput
            value={s.size}
            onChange={(size) => patch({ size })}
            min={64}
            max={1600}
            step={8}
            unit="px"
          />
        </Field>
        <Field label="影格數">
          <Slider value={s.frames} onChange={(frames) => patch({ frames })} min={2} max={60} />
        </Field>
        <Field label="FPS">
          <Slider value={s.fps} onChange={(fps) => patch({ fps })} min={5} max={30} unit="fps" />
        </Field>
        <Field label="放射速度線條數">
          <Slider value={s.lines} onChange={(lines) => patch({ lines })} min={4} max={96} />
        </Field>
        <Field label="GIF 底色" hint={s.gifMatte ? `合成到 ${s.gifMatte}` : '不合成（一階透明）'}>
          <div className="flex flex-wrap items-center gap-2">
            <ColorField
              value={s.gifMatte ?? '#000000'}
              onChange={(c) => patch({ gifMatte: c })}
              aria-label="GIF 底色"
            />
            <Button size="sm" onClick={() => patch({ gifMatte: null })}>
              不合成
            </Button>
            <Button size="sm" onClick={() => patch({ gifMatte: DISCORD_DARK_BG })}>
              Discord 暗色
            </Button>
          </div>
        </Field>
      </Show>
    </Section>
  );
}

function KaraokeSection({ s, patch }: SectionArgs) {
  return (
    <Section
      title="卡拉 OK 合成"
      persistKey="_gallery:g1-karaoke"
      description="唱前文字＋遮罩後的唱後文字（交界柔化）＋加亮的掃描發光帶（core/textfx 的圖層工具）。"
    >
      <Field label="歌詞（一行一句）">
        <TextArea
          value={s.lyrics}
          onChange={(e) => patch({ lyrics: e.target.value, mode: 'karaoke' })}
          rows={3}
        />
      </Field>
      <Field label="交界柔化">
        <Slider
          value={s.softness}
          onChange={(softness) => patch({ softness, mode: 'karaoke' })}
          min={0}
          max={60}
          unit="px"
        />
      </Field>
      <Field label="掃描發光" layout="inline">
        <Toggle checked={s.glow} onCheckedChange={(glow) => patch({ glow, mode: 'karaoke' })} />
      </Field>
    </Section>
  );
}

function PathSection({ s, patch }: SectionArgs) {
  const toast = useToast();
  /* 預設形狀依繪製區的邏輯尺寸產生（634 × 300，與文字軌跡的附件相同） */
  const path: Point[] = s.shape === 'free' ? s.path : presetPath(s.shape, PAD_W, PAD_H);
  const chars = splitGraphemes(s.pathText.replace(/\s/g, ''));
  const samples = path.length > 1 ? sampleEvenly(path, chars.length) : [];
  const labels = s.overlay ? samples.map((p, i) => ({ x: p.x, y: p.y, text: chars[i] })) : [];
  const out = samples
    .map((p, i) => `${chars[i]}\t${p.x.toFixed(1).padStart(6)}\t${p.y.toFixed(1).padStart(6)}`)
    .join('\n');
  const b = pathBounds(path);
  return (
    <Section
      title="軌跡（PathPad＋core/path）"
      persistKey="_gallery:g1-path"
      description="預設形狀（與文字軌跡附件逐點相符）、自由繪製（滑鼠、觸控、筆）、依長度等距取樣、起訖對調、縮放。"
    >
      <Field label="文字">
        <TextArea
          value={s.pathText}
          onChange={(e) => patch({ pathText: e.target.value })}
          rows={2}
        />
      </Field>
      <Field label="形狀">
        <Segmented
          value={s.shape}
          onValueChange={(shape) => patch({ shape })}
          options={[
            { value: 'circle', label: '圓' },
            { value: 'spiral', label: '螺旋' },
            { value: 'heart', label: '愛心' },
            { value: 'free', label: '自由繪製' },
          ]}
          size="sm"
        />
      </Field>
      <PathPad
        aria-label="軌跡繪製區"
        width={PAD_W}
        height={PAD_H}
        points={path}
        onDrawStart={() => patch({ shape: 'free', overlay: false })}
        onChange={(pts) => patch({ path: pts, shape: 'free' })}
        hint="請在這裡畫線"
        labels={labels}
        labelSize={16}
      />
      <p className="m-0 text-xs text-muted" data-testid="path-info">
        {path.length} 點・總長 {pathLength(path).toFixed(1)} px・外接框 {b.w.toFixed(1)} ×{' '}
        {b.h.toFixed(1)}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          icon={<Shuffle />}
          onClick={() => {
            if (path.length < 2) return toast({ title: '還沒有軌跡', tone: 'warning' });
            patch({ path: reversePath(path), shape: 'free' });
          }}
        >
          起訖對調
        </Button>
        <Button
          size="sm"
          onClick={() => {
            if (path.length < 2) return toast({ title: '還沒有軌跡', tone: 'warning' });
            patch({ path: scalePath(path, 0.8), shape: 'free' });
          }}
        >
          縮小 80%
        </Button>
        <Button size="sm" icon={<Trash2 />} onClick={() => patch({ path: [], shape: 'free' })}>
          清除
        </Button>
        <Toggle
          label="疊字"
          checked={s.overlay}
          onCheckedChange={(overlay) => patch({ overlay })}
        />
      </div>
      <TextOutputPanel
        title="取樣點"
        text={out}
        font="mono"
        wrap="off"
        count={(t) => `${Array.from(t).length} 字`}
        hint="等寬、不折行（文字圖案這類靠對齊的輸出用）。"
      />
    </Section>
  );
}

function AudioSection({ s }: { s: G1DemoState }) {
  const toast = useToast();
  const [clip, setClip] = useState<{ name: string; pcm: PcmAudio } | null>(null);
  const [status, setStatus] = useState<{
    tone: 'progress' | 'success' | 'danger';
    message: string;
  } | null>(null);
  const [mode, setMode] = useState<'each' | 'skip'>('each');
  const [mixed, setMixed] = useState<Blob | null>(null);
  return (
    <Section
      title="音效（core/audio）"
      persistKey="_gallery:g1-audio"
      description="解碼上傳的音效 → 依打字的時間點離線混音（可疊加或不疊音、淡出）→ PCM 16-bit WAV。"
    >
      <AudioDrop
        status={status}
        onFile={async (file) => {
          setStatus({ tone: 'progress', message: `解碼中：${file.name}` });
          try {
            const pcm = await decodeAudio(file);
            setClip({ name: file.name, pcm });
            setStatus({
              tone: 'success',
              message: `已載入：${file.name}（${pcmDuration(pcm).toFixed(2)} 秒、${pcm.channels.length} 聲道、${pcm.sampleRate} Hz）`,
            });
          } catch (e) {
            setClip(null);
            setStatus({ tone: 'danger', message: e instanceof Error ? e.message : String(e) });
          }
        }}
      />
      <Field label="音效的放法">
        <Segmented
          value={mode}
          onValueChange={setMode}
          options={[
            { value: 'each', label: '每格都播' },
            { value: 'skip', label: '不疊音' },
          ]}
          size="sm"
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button
          icon={<Music />}
          disabled={!clip}
          onClick={() => {
            if (!clip) return;
            const steps = typingSteps(Array.from(s.typingText)).length;
            const typing = steps / s.typingFps;
            const times = Array.from({ length: steps }, (_, k) => k / s.typingFps);
            const len = pcmDuration(clip.pcm);
            const pcm =
              mode === 'each'
                ? mixAtTimes(clip.pcm, times, {
                    duration: Math.max(typing + s.holdMs / 1000, typing + len),
                  })
                : mixAtTimes(clip.pcm, skipOverlapping(times, len), {
                    duration: typing + Math.max(s.holdMs / 1000, 0.2),
                    fade: { start: typing, end: typing + 0.2 },
                  });
            setMixed(wavBlob(pcm));
          }}
        >
          合成打字音效
        </Button>
        <Button
          icon={<Volume2 />}
          onClick={async () => {
            await downloadSequentially(
              [1, 2].map((n) => ({
                name: `靜音_${n}.wav`,
                blob: wavBlob(createSilence(n)),
              })),
              { intervalMs: 500 },
            );
            toast({ title: '已下載兩個靜音 WAV（1 秒、2 秒）', tone: 'success' });
          }}
        >
          產生靜音 WAV（兩個）
        </Button>
      </div>
      <AudioPlayer blob={mixed} fileName="打字音效.wav" />
    </Section>
  );
}

function ListsSection({ s, patch }: SectionArgs) {
  const toast = useToast();
  return (
    <Section title="配色對與字型池" persistKey="_gallery:g1-lists">
      <Field label="配色（紙片底色＋字色）">
        <ColorPairList
          aria-label="配色"
          items={s.pairs}
          onChange={(pairs) => patch({ pairs })}
          labels={{ a: '紙片底色', b: '字色' }}
          onAdded={() => toast({ title: '已新增配色', tone: 'success' })}
        />
      </Field>
      <Field label="字型池">
        <FontPoolList
          aria-label="字型池"
          items={s.fonts}
          onChange={(fonts) => patch({ fonts })}
          previewText="匿名信"
          onDuplicate={() => toast({ title: '這套字型已經在清單裡', tone: 'info' })}
        />
      </Field>
    </Section>
  );
}

function ShareSection({ s, patch }: SectionArgs) {
  const toast = useToast();
  const [url, setUrl] = useState('');
  const sample = '<b>大成功</b> & "骰子"';
  return (
    <Section title="分享連結與小工具" persistKey="_gallery:g1-share">
      <p className="m-0 text-xs text-muted">
        core/share：把「循環加工」的設定放進網址 # 後面（base64url），讀回時做範圍檢查。
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          icon={<Link2 />}
          onClick={() => {
            const hash = encodeShareHash(SHARE_SCHEMA.parse(s), SHARE);
            const u = new URL(location.href);
            u.hash = hash.slice(1);
            setUrl(u.toString());
          }}
        >
          產生分享連結
        </Button>
        <Button
          onClick={() => {
            const h = url ? new URL(url).hash : location.hash;
            const back = decodeShareHash(h, SHARE_SCHEMA, SHARE);
            if (!back) return toast({ title: '沒有可用的分享設定', tone: 'warning' });
            patch({ ...back, mode: 'loop' });
            toast({ title: '已從分享連結還原', tone: 'success' });
          }}
        >
          從連結還原
        </Button>
        <Button
          onClick={async () => {
            const c = document.createElement('canvas');
            c.width = 320;
            c.height = 320;
            const ctx = c.getContext('2d');
            if (!ctx) return;
            ctx.fillStyle = '#f4ebd8';
            ctx.fillRect(0, 0, 320, 320);
            buildLoopScene(s, 320).draw(ctx, 0);
            downloadBlob(await canvasToJpeg(c, { background: null }), '循環加工.jpg');
          }}
        >
          下載 JPG（紙張底）
        </Button>
      </div>
      {url ? (
        <TextOutputPanel title="分享連結" text={url} count={null} copyLabel="複製連結" />
      ) : null}
      <TextOutputPanel
        title="HTML 跳脫（core/html）"
        text={`${sample}\n→ ${escapeHtml(sample)}`}
        count={null}
      />
    </Section>
  );
}
