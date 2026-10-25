/**
 * 設定欄的「頁面」分頁（F210～F213、F054、F055）：對象頁面、刪除頁面、封面頁、版權頁、背景
 * （2026-10：9 種花紋與每頁的紙色，F264～F266）。
 */
import { useEffect, useState } from 'react';
import { formatDataSize, readAsDataUrl } from '@/core/files';
import {
  Button,
  Checkbox,
  Chips,
  ColorField,
  Field,
  Section,
  Segmented,
  Select,
  Slider,
} from '@/ui';
import { bridge } from '../bridge';
import { BG_WARN_BYTES, pickRawImage } from '../images';
import {
  contrastGrade,
  inkContrast,
  PAPER_MOODS,
  PAPERS,
  PATTERNS,
  type PaperMood,
  pageColor,
  pagePaper,
  paperFromMood,
  paperName,
  patternName,
  readablePaper,
} from '../model/paper';
import type { PageBg } from '../model/types';
import { blocksOnPages, deletePages, makeColophon, makeCover, pageAt } from '../ops';
import { pageSettingAt } from '../render/html';
import { edit, say, setUi, useDoc, useUi } from '../store';
import { S } from '../strings';

/** 面板上正在選的背景（img：null＝套用時保留頁面原本的圖片；color：空字串＝預設的紙色） */
type BgPick = Omit<PageBg, 'color'> & { color: string };

export function PagesTab() {
  const d = useDoc((s) => s.data);
  const total = useUi((s) => s.total);
  const pageSel = useUi((s) => s.pageSel);
  const [bg, setBg] = useState<BgPick>({
    preset: 'none',
    img: null,
    fit: 'cover',
    opa: 35,
    color: '',
  });
  const [mood, setMood] = useState<PaperMood>('dreamy');
  /** 自訂顏色欄的值（調亮之前的顏色） */
  const [custom, setCustom] = useState<string | null>(null);
  /* 勾選的頁面變了：花紋、紙色、大小、濃度換成第一個勾選的頁面目前的設定（只改紙色時花紋不會跟著變；F266） */
  const first = pageSel[0];
  const firstBg = first == null ? null : pageSettingAt(d, first).bg;
  const firstKey = firstBg
    ? `${first}|${firstBg.preset}|${pageColor(firstBg)}|${firstBg.fit}|${firstBg.opa}`
    : '';
  // biome-ignore lint/correctness/useExhaustiveDependencies: 只在勾選的頁面（或它的背景）變了時同步
  useEffect(() => {
    if (!firstBg) return;
    setBg((b) => ({
      ...b,
      preset: firstBg.preset || 'none',
      color: pageColor(firstBg),
      fit: firstBg.fit,
      opa: +firstBg.opa || 35,
    }));
    setCustom(null);
  }, [firstKey]);
  const n = pageSel.length ? blocksOnPages(pageSel).length : 0;
  const toggle = (i: number, on: boolean) => {
    const cur = new Set(pageSel);
    if (on) cur.add(i);
    else cur.delete(i);
    setUi({ pageSel: [...cur].sort((a, b) => a - b) });
  };
  const pickBg = async () => {
    const f = await pickRawImage();
    if (!f) return;
    if (
      f.size > BG_WARN_BYTES &&
      !(await bridge.confirm({ title: S.confirm.bigBg, confirmLabel: '使用' }))
    )
      return;
    const url = await readAsDataUrl(f);
    setBg((b) => ({ ...b, img: url }));
  };
  const apply = () => {
    if (!pageSel.length) {
      say(S.status.pickPage, 'warn');
      return;
    }
    edit((x) => {
      /* 還沒有自己的設定的頁（沿用最後一頁的設定）先各自記下目前的樣子，只改勾選的頁（原作在分頁時就逐頁建立設定） */
      pageAt(x, total - 1);
      for (const i of pageSel) {
        const p = pageAt(x, i);
        p.bg = {
          preset: bg.preset,
          img: bg.img ?? p.bg.img,
          fit: bg.fit,
          opa: bg.opa,
          color: bg.color,
        };
      }
    });
    say(S.status.bgApplied(pageSel.length));
  };
  const remove = () => {
    if (!pageSel.length) {
      say(S.status.pickPage, 'warn');
      return;
    }
    edit((x) => {
      pageAt(x, total - 1);
      for (const i of pageSel)
        pageAt(x, i).bg = { preset: 'none', img: null, fit: 'cover', opa: 35, color: '' };
    });
    say(S.status.bgRemoved(pageSel.length));
  };
  return (
    <div className="flex flex-col gap-2">
      <Section
        title="對象頁面"
        fixed
        description="勾選的頁面是刪除頁面、背景、單欄／雙欄的對象（與紙面頁首的勾選同步）。"
      >
        <ul
          className="m-0 flex max-h-60 list-none flex-col gap-0.5 overflow-auto p-0"
          aria-label="頁面"
        >
          {Array.from({ length: total }, (_, i) => {
            const st = pageSettingAt(d, i);
            return (
              // biome-ignore lint/suspicious/noArrayIndexKey: 頁面以頁碼為身分
              <li key={i}>
                <span className="flex items-center gap-1.5">
                  <Checkbox
                    checked={pageSel.includes(i)}
                    onCheckedChange={(v) => toggle(i, !!v)}
                    label={`P.${i + 1}　${st.cols === 2 ? '雙欄' : '單欄'}／${patternName(st.bg.preset)}${st.bg.img ? '＋圖片' : ''}${pageColor(st.bg) ? `／${paperName(pageColor(st.bg))}` : ''}`}
                  />
                  {pageColor(st.bg) ? (
                    <i
                      aria-hidden
                      title={`${paperName(pageColor(st.bg))}（${pageColor(st.bg)}）`}
                      className="inline-block size-2.5 shrink-0 rounded-[2px] border border-border-strong"
                      style={{ background: pageColor(st.bg) }}
                    />
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
        <div className="flex flex-wrap gap-1">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setUi({ pageSel: Array.from({ length: total }, (_, i) => i) })}
          >
            選取全部頁面
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setUi({ pageSel: [] })}>
            取消選取
          </Button>
        </div>
        <Field
          label="刪除頁面"
          hint={
            pageSel.length
              ? `會刪除勾選頁面上的 ${n} 個段落（連同結束那一頁的換頁）。`
              : '先勾選要刪除的頁面。'
          }
        >
          <Button size="sm" variant="danger" onClick={() => void deletePages()}>
            刪除勾選的頁面
          </Button>
        </Field>
      </Section>
      <Section title="封面與版權頁" fixed>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" variant="secondary" onClick={makeCover}>
            建立封面頁
          </Button>
          <Button size="sm" variant="secondary" onClick={makeColophon}>
            建立版權頁
          </Button>
        </div>
      </Section>
      <Section title="背景" fixed>
        <Field
          label="花紋"
          hint="本文底下的花紋都很淡；裝飾框、四角花飾、上下色帶只放在紙面間距裡（間距小時跟著變小）。"
        >
          <Chips
            aria-label="花紋"
            value={bg.preset}
            items={PATTERNS.map((p) => ({ value: p.k, label: p.name }))}
            onPick={(v) => setBg((b) => ({ ...b, preset: v }))}
          />
        </Field>
        <PaperColor
          color={bg.color}
          preset={bg.preset}
          custom={custom}
          mood={mood}
          onMood={setMood}
          onPick={(c, raw) => {
            /* 和這個花紋的預設紙色相同時不記（上下色帶的預設是淡灰，選米白要記下來） */
            setBg((b) => ({ ...b, color: c === pagePaper({ preset: b.preset }) ? '' : c }));
            setCustom(raw);
          }}
        />
        <Field
          label="背景圖"
          hint={
            bg.img
              ? `已選擇（${formatDataSize(Math.round((bg.img.length * 3) / 4))}）`
              : '超過 2.5 MB 時會先確認。'
          }
        >
          <div className="flex flex-wrap gap-1">
            <Button size="sm" variant="secondary" onClick={() => void pickBg()}>
              選擇圖片
            </Button>
            {bg.img ? (
              <Button size="sm" variant="ghost" onClick={() => setBg((b) => ({ ...b, img: null }))}>
                不使用圖片
              </Button>
            ) : null}
          </div>
        </Field>
        <Field label="大小">
          <Segmented
            size="sm"
            value={bg.fit}
            onValueChange={(v) => setBg((b) => ({ ...b, fit: v }))}
            options={[
              { value: 'cover', label: '覆蓋整面' },
              { value: 'contain', label: '完整放入' },
              { value: 'repeat', label: '平鋪' },
            ]}
          />
        </Field>
        <Field label="濃度">
          <Slider
            value={bg.opa}
            min={5}
            max={100}
            unit="%"
            onChange={(v) => setBg((b) => ({ ...b, opa: Math.round(v) }))}
          />
        </Field>
        <div className="flex flex-wrap gap-1">
          <Button size="sm" onClick={apply}>
            套用到選取的頁面
          </Button>
          <Button size="sm" variant="secondary" onClick={remove}>
            移除背景
          </Button>
        </div>
      </Section>
    </div>
  );
}

/** 紙的顏色（F265）：10 色的按鈕、隨機配色、自訂顏色；和文字的對比不到 7:1 的顏色調亮 */
function PaperColor({
  color,
  preset,
  custom,
  mood,
  onMood,
  onPick,
}: {
  color: string;
  preset: string;
  custom: string | null;
  mood: PaperMood;
  onMood: (m: PaperMood) => void;
  /** c：調亮之後的顏色；raw：自訂顏色欄的值（按鈕、隨機配色時 null） */
  onPick: (c: string, raw: string | null) => void;
}) {
  const cur = pagePaper({ color, preset });
  const r = inkContrast(cur);
  const brightened = custom != null && custom.toLowerCase() !== cur;
  return (
    <Field
      label="紙的顏色"
      hint={`${paperName(cur)}（${cur}）　和文字的對比 ${r.toFixed(1)}:1（${contrastGrade(r)}）${brightened ? `。${S.status.paperBrightened}` : ''}`}
    >
      <div className="flex flex-col gap-1.5">
        {/* biome-ignore lint/a11y/useSemanticElements: 一組切換按鈕 */}
        <div role="group" aria-label="紙的顏色" className="grid grid-cols-2 gap-1">
          {PAPERS.map((p) => {
            const on = cur === p.c;
            return (
              <button
                key={p.c}
                type="button"
                aria-pressed={on}
                title={`${p.name}（${p.c}）`}
                onClick={() => onPick(p.c, null)}
                className={`flex items-center gap-2 rounded-md border px-2 py-1 text-left text-xs ${
                  on
                    ? 'border-accent bg-accent-soft font-semibold text-accent'
                    : 'border-border bg-surface-2 text-fg hover:border-border-strong'
                }`}
              >
                <i
                  aria-hidden
                  className="h-4 w-5 shrink-0 rounded-[3px] border border-border-strong"
                  style={{ background: p.c }}
                />
                {p.name}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <Select
            size="sm"
            className="w-24"
            aria-label="隨機配色的氣氛"
            value={mood}
            onValueChange={(v) => onMood(v as PaperMood)}
            options={(Object.keys(PAPER_MOODS) as PaperMood[]).map((k) => ({
              value: k,
              label: PAPER_MOODS[k].name,
            }))}
          />
          <Button
            size="sm"
            variant="secondary"
            title="依選的氣氛隨機做一個淡的紙色"
            onClick={() => onPick(paperFromMood(mood), null)}
          >
            隨機配色
          </Button>
          <ColorField
            aria-label="自訂紙的顏色"
            value={custom ?? cur}
            showInput={false}
            onChange={(hex) => onPick(readablePaper(hex), hex.toLowerCase())}
          />
        </div>
      </div>
    </Field>
  );
}
